# =============================================================================
# Proof of Aid — Team 05 — Evidence upload pipeline: sanitize, hash, encrypt
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Upload pipeline (spec F3, P3.2): EXIF/GPS strip → SHA-256 of the *sanitized*
bytes → AES-GCM to the local volume.

Privacy rules enforced here: the stored hash is always computed on the
sanitized bytes (never on the raw upload), the original filename never leaves
the database row, and this module logs nothing at all.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Final

from PIL import Image, UnidentifiedImageError

from poa_shared.merkle import file_hash
from poa_shared.result import Err, Ok, Result

from app.services.crypto import derive_claim_key, encrypt_bytes

STORAGE_SUFFIX: Final = ".enc"
FILENAME_UNSAFE_PATTERN: Final[re.Pattern[str]] = re.compile(r"[^A-Za-z0-9._-]+")
FILENAME_FALLBACK: Final[str] = "upload.bin"
FILENAME_MAX_LENGTH: Final[int] = 100


@dataclass(frozen=True, slots=True)
class ProcessedFile:
    """An upload ready for storage: hash of sanitized bytes + encrypted blob."""

    file_hash: bytes
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
    packed = encrypt_bytes(sanitized, key.value)
    if isinstance(packed, Err):
        return packed
    processed: Result[ProcessedFile] = Ok(
        ProcessedFile(file_hash=file_hash(sanitized), packed=packed.value, size_bytes=len(sanitized))
    )
    return processed


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
