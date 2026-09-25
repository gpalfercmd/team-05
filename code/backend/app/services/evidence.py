# =============================================================================
# Proof of Aid — Team 05 — Evidence upload pipeline: sanitize, hash, encrypt
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Upload pipeline (spec F3, P3.2): metadata strip → salted commitment of the
*sanitized* bytes → AES-GCM to the local volume.

Sanitizing (P10.1): images (JPEG/PNG/WebP) are re-encoded without EXIF/GPS;
PDFs, recognized by their `%PDF-` magic bytes (never by file name), are
rewritten without the document information dictionary (`/Info`: author,
creator tool, dates), the XMP `/Metadata` streams of the catalog and pages,
page `/PieceInfo`, and every object nothing references any more (earlier
incremental revisions included). A PDF that cannot be parsed or is encrypted
cannot be cleaned, so the upload is rejected (`Err` → HTTP 422) rather than
stored with its metadata. Every other type passes through unchanged.

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
from pypdf import PdfReader, PdfWriter

from poa_shared.merkle import HASH_LENGTH, file_hash, salted_file_hash
from poa_shared.result import Err, Ok, Result

from app.models import EvidenceFile
from app.services.crypto import decrypt_bytes, dedup_tag, derive_claim_key, encrypt_bytes

STORAGE_SUFFIX: Final = ".enc"
FILENAME_UNSAFE_PATTERN: Final[re.Pattern[str]] = re.compile(r"[^A-Za-z0-9._-]+")
FILENAME_FALLBACK: Final[str] = "upload.bin"
FILENAME_MAX_LENGTH: Final[int] = 100
PDF_MAGIC: Final[bytes] = b"%PDF-"
# Readers accept the header anywhere in the first KiB, so a prefixed PDF must not slip past.
PDF_HEADER_WINDOW: Final[int] = 1024
PDF_METADATA_KEYS: Final[tuple[str, ...]] = ("/Metadata", "/PieceInfo")
PDF_REJECTED: Final[str] = (
    "this PDF cannot be cleaned of its metadata (it is encrypted or unreadable); "
    "remove its password or re-export it, then upload it again"
)


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


def is_pdf(data: bytes) -> bool:
    """True when the bytes carry the PDF header (`%PDF-`) where readers look for it."""
    found = PDF_MAGIC in data[:PDF_HEADER_WINDOW]
    return found


def sanitize_upload(data: bytes) -> Result[bytes]:
    """Return the bytes without metadata: images re-encoded, PDFs rewritten, rest untouched.

    Re-encoding (not tag editing) is what removes EXIF/GPS segments: a JPEG is
    saved with an empty EXIF block, PNG/WebP without ancillary chunks, and ICC
    profiles are dropped by never passing them to the encoder. `Err` only for a
    PDF that cannot be cleaned (encrypted or unparseable).
    """
    if is_pdf(data):
        return _rewrite_pdf_without_metadata(data)
    image = _try_open_image(data)
    sanitized: Result[bytes] = Ok(data if image is None else _reencode_without_metadata(image))
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
    cleaned = sanitize_upload(data)
    if isinstance(cleaned, Err):
        return cleaned
    sanitized = cleaned.value
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


def _rewrite_pdf_without_metadata(data: bytes) -> Result[bytes]:
    """Rewrite a PDF without its metadata; `Err` if it is encrypted or cannot be parsed.

    pypdf raises many exception types on hostile input, hence the broad catch:
    any failure means "cannot clean", never a server error.
    """
    cleaned: Result[bytes]
    try:
        reader = PdfReader(BytesIO(data), strict=False)
        cleaned = Err(PDF_REJECTED) if reader.is_encrypted else _clean_pdf(reader)
    except Exception as cause:  # noqa: BLE001 - untrusted parser, see docstring
        cleaned = Err(PDF_REJECTED, cause)
    return cleaned


def _clean_pdf(reader: PdfReader) -> Result[bytes]:
    """Copy the document without `/Info`, XMP and page metadata; the copy must keep every page.

    The copy is rebuilt from the catalog and unreferenced objects are dropped,
    so earlier incremental revisions (where an old `/Info` or XMP stream could
    survive) are not written. May raise on malformed input (caught by the caller).
    """
    page_count = len(reader.pages)
    writer = PdfWriter(clone_from=reader)
    writer.metadata = None
    writer.xmp_metadata = None
    for page in writer.pages:
        for key in PDF_METADATA_KEYS:
            if key in page:
                del page[key]
    writer.compress_identical_objects(remove_duplicates=False, remove_unreferenced=True)
    buffer = BytesIO()
    writer.write(buffer)
    rewritten = buffer.getvalue()
    reparsed = PdfReader(BytesIO(rewritten), strict=False)
    cleaned: Result[bytes] = (
        Ok(rewritten) if len(reparsed.pages) == page_count else Err(PDF_REJECTED)
    )
    return cleaned
