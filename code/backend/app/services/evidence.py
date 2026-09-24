# =============================================================================
# Proof of Aid — Team 05 — Evidence upload pipeline: sanitize, hash, encrypt
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Upload pipeline (spec F3, P3.2): EXIF/GPS strip → salted commitment of the
*sanitized* bytes → AES-GCM to the local volume.

Salted commitments (P8.2): every new file gets 32 random salt bytes and is
committed as SHA-256(salt ‖ sanitized bytes), so nobody can confirm a guessed
file from its public fingerprint. The commitment is the Merkle leaf input
(stored in `sha256_hex`); the salt is sealed with the claim key. Every file
is salted, public or private, because a file can be made public after it was
anchored. Rows from before P8.2 have no salt and keep their plain SHA-256.

Privacy rules enforced here: the stored hash is always computed on the
sanitized bytes (never on the raw upload), the original filename never leaves
the database row, and this module logs nothing at all.
"""

from __future__ import annotations

import re
import secrets
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Final

from PIL import Image, UnidentifiedImageError

from poa_shared.merkle import HASH_LENGTH, file_hash, salted_file_hash
from poa_shared.result import Err, Ok, Result

from app.models import EvidenceFile
from app.services.crypto import decrypt_bytes, dedup_tag, derive_claim_key, encrypt_bytes

STORAGE_SUFFIX: Final = ".enc"
FILENAME_UNSAFE_PATTERN: Final[re.Pattern[str]] = re.compile(r"[^A-Za-z0-9._-]+")
FILENAME_FALLBACK: Final[str] = "upload.bin"
FILENAME_MAX_LENGTH: Final[int] = 100


@dataclass(frozen=True, slots=True)
class ProcessedFile:
    """An upload ready for storage: salted commitment, sealed salt, dedup tag, encrypted blob.

    `file_hash` is the commitment SHA-256(salt ‖ sanitized bytes), the Merkle
    leaf input. `plain_hash` is SHA-256(sanitized bytes), used only to catch
    duplicates of unsalted rows from before P8.2 and never stored.
    """

    file_hash: bytes
    salt: bytes
    sealed_salt: bytes
    dedup_tag: bytes
    plain_hash: bytes
    packed: bytes
    size_bytes: int


def sanitize_upload(data: bytes) -> bytes:
    """Return image bytes re-encoded without metadata; non-images pass through.

    Re-encoding (not tag editing) is what removes EXIF/GPS segments: a JPEG is
    saved with an empty EXIF block, PNG/WebP without ancillary chunks, and ICC
    profiles are dropped by never passing them to the encoder.
    """
    image = _try_open_image(data)
    if image is None:
        passthrough: bytes = data
        return passthrough
    sanitized: bytes = _reencode_without_metadata(image)
    return sanitized


def safe_filename(name: str | None) -> str:
    """Return a plain base name: no folders, only `[A-Za-z0-9._-]`, ≤100 chars.

    Applied on upload and again before a name is published (manifest), so a
    name can never smuggle a path separator or an empty value to a client.
    """
    if not name:
        return FILENAME_FALLBACK
    base = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    cleaned = FILENAME_UNSAFE_PATTERN.sub("_", base).strip("._") or FILENAME_FALLBACK
    trimmed: str = cleaned[:FILENAME_MAX_LENGTH]
    return trimmed


def process_upload(data: bytes, *, master_key: bytes, claim_id: bytes) -> Result[ProcessedFile]:
    """Run the full pipeline; `Err` on empty input, bad key or unwritable output."""
    if not data:
        return Err("empty upload")
    key = derive_claim_key(master_key, claim_id)
    if isinstance(key, Err):
        return key
    sanitized = sanitize_upload(data)
    salt = secrets.token_bytes(HASH_LENGTH)
    commitment = salted_file_hash(salt, sanitized)
    if isinstance(commitment, Err):
        return commitment
    sealed_salt = encrypt_bytes(salt, key.value)
    if isinstance(sealed_salt, Err):
        return sealed_salt
    tag = dedup_tag(sanitized, key.value)
    if isinstance(tag, Err):
        return tag
    packed = encrypt_bytes(sanitized, key.value)
    if isinstance(packed, Err):
        return packed
    processed: Result[ProcessedFile] = Ok(
        ProcessedFile(
            file_hash=commitment.value,
            salt=salt,
            sealed_salt=sealed_salt.value,
            dedup_tag=tag.value,
            plain_hash=file_hash(sanitized),
            packed=packed.value,
            size_bytes=len(sanitized),
        )
    )
    return processed


def reveal_salt(sealed_salt: bytes | None, claim_key: bytes) -> Result[str | None]:
    """Return a stored salt as 0x-hex, `None` for an unsalted pre-P8.2 row, or Err."""
    if sealed_salt is None:
        return Ok(None)
    salt = decrypt_bytes(sealed_salt, claim_key)
    if isinstance(salt, Err):
        return salt
    if len(salt.value) != HASH_LENGTH:
        return Err(f"stored salt is not {HASH_LENGTH} bytes")
    revealed: Result[str | None] = Ok(f"0x{salt.value.hex()}")
    return revealed


def unseal_salts(
    files: Sequence[EvidenceFile], *, master_key: bytes, claim_id: bytes
) -> Result[dict[uuid.UUID, str]]:
    """Return the salt of every salted file of one claim, by file id (legacy rows omitted)."""
    key = derive_claim_key(master_key, claim_id)
    if isinstance(key, Err):
        return key
    salts: dict[uuid.UUID, str] = {}
    for item in files:
        salt = reveal_salt(item.salt_sealed, key.value)
        if isinstance(salt, Err):
            return salt
        if salt.value is not None:
            salts[item.id] = salt.value
    unsealed: Result[dict[uuid.UUID, str]] = Ok(salts)
    return unsealed


def store_packed(storage_dir: Path, packed: bytes) -> Result[str]:
    """Write the encrypted blob under a random name; return the storage name."""
    if not packed:
        return Err("nothing to store")
    storage_name = f"{uuid.uuid4().hex}{STORAGE_SUFFIX}"
    try:
        storage_dir.mkdir(parents=True, exist_ok=True)
        (storage_dir / storage_name).write_bytes(packed)
    except OSError as cause:
        return Err(f"cannot write to storage directory {storage_dir}", cause)
    stored: Result[str] = Ok(storage_name)
    return stored


def load_packed(storage_dir: Path, storage_name: str) -> Result[bytes]:
    """Read a stored blob; rejects anything that is not a plain file name."""
    if "/" in storage_name or "\\" in storage_name or ".." in storage_name:
        return Err("invalid storage name")
    try:
        content = (storage_dir / storage_name).read_bytes()
    except OSError as cause:
        return Err("stored file is missing or unreadable", cause)
    loaded: Result[bytes] = Ok(content)
    return loaded


def _try_open_image(data: bytes) -> Image.Image | None:
    """Return the decoded image, or None when the bytes are not an image."""
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError):
        return None
    opened: Image.Image | None = image
    return opened


def _reencode_without_metadata(image: Image.Image) -> bytes:
    """Re-encode in the original container (JPEG/PNG/WebP) dropping all metadata."""
    target_format = image.format if image.format in {"JPEG", "PNG", "WEBP"} else "PNG"
    canvas = image
    if target_format == "JPEG" and canvas.mode in {"RGBA", "LA", "PA"}:
        canvas = canvas.convert("RGB")
    buffer = BytesIO()
    if target_format == "JPEG":
        canvas.save(buffer, format=target_format, exif=b"")
    else:
        canvas.save(buffer, format=target_format)
    encoded: bytes = buffer.getvalue()
    return encoded
