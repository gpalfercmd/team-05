# =============================================================================
# Proof of Aid — Team 05 — Evidence service tests: sanitize, hash, encrypt
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Upload pipeline at the service level (spec F3, P3.2): the hash is always
computed on the sanitized bytes, ciphertext is useless without the key, and
tampering is detected — all as `Result`, never exceptions."""

from __future__ import annotations

import hashlib
import os
from io import BytesIO
from pathlib import Path

from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from app.services.crypto import decrypt_bytes, derive_claim_key, encrypt_bytes
from app.services.evidence import load_packed, process_upload, sanitize_upload, store_packed
from poa_shared.result import Err, Ok


def demo_jpeg_with_fake_exif_gps() -> bytes:
    """Red JPEG carrying a Make tag plus fake GPS coordinates (no real data)."""
    image = Image.new("RGB", (64, 48), color="red")
    exif = Image.Exif()
    exif[0x010F] = "FakeCamera"
    gps = exif.get_ifd(0x8825)
    gps[0] = b"\x02\x03\x00\x00"
    gps[1] = "N"
    gps[2] = (IFDRational(40, 1), IFDRational(25, 1), IFDRational(0, 1))
    buffer = BytesIO()
    image.save(buffer, format="JPEG", exif=exif)
    demo: bytes = buffer.getvalue()
    return demo


def test_sanitize_strips_exif_and_gps() -> None:
    raw = demo_jpeg_with_fake_exif_gps()
    assert 0x8825 in Image.open(BytesIO(raw)).getexif()
    sanitized = sanitize_upload(raw)
    assert sanitized != raw
    assert not Image.open(BytesIO(sanitized)).getexif()


def test_sanitize_leaves_non_images_untouched() -> None:
    blob = b"%PDF-1.4 fake non-image bytes"
    assert sanitize_upload(blob) == blob


def test_process_upload_hashes_sanitized_bytes() -> None:
    raw = demo_jpeg_with_fake_exif_gps()
    result = process_upload(raw, master_key=os.urandom(32), claim_id=os.urandom(32))
    assert isinstance(result, Ok)
    assert result.value.file_hash == hashlib.sha256(sanitize_upload(raw)).digest()
    assert result.value.file_hash != hashlib.sha256(raw).digest()
    assert result.value.size_bytes == len(sanitize_upload(raw))


def test_encrypt_roundtrip_and_tamper_detection() -> None:
    key = os.urandom(32)
    packed = encrypt_bytes(b"secret evidence", key)
    assert isinstance(packed, Ok)
    assert decrypt_bytes(packed.value, key) == Ok(b"secret evidence")
    tampered = bytearray(packed.value)
    tampered[20] ^= 1
    assert isinstance(decrypt_bytes(bytes(tampered), key), Err)
    assert isinstance(decrypt_bytes(packed.value, os.urandom(32)), Err)


def test_derive_claim_key_isolates_claims() -> None:
    master = os.urandom(32)
    first = derive_claim_key(master, os.urandom(32))
    second = derive_claim_key(master, os.urandom(32))
    assert isinstance(first, Ok) and isinstance(second, Ok)
    assert first.value != second.value
    assert isinstance(derive_claim_key(b"short", os.urandom(32)), Err)


def test_store_load_and_traversal_guard(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    stored = store_packed(storage, b"packed-bytes")
    assert isinstance(stored, Ok)
    assert load_packed(storage, stored.value) == Ok(b"packed-bytes")
    assert isinstance(load_packed(storage, "../evil.enc"), Err)
    assert isinstance(load_packed(storage, "missing.enc"), Err)
    assert isinstance(store_packed(storage, b""), Err)


def test_process_upload_rejects_empty_and_bad_key() -> None:
    assert isinstance(process_upload(b"", master_key=os.urandom(32), claim_id=os.urandom(32)), Err)
    assert isinstance(
        process_upload(b"data", master_key=b"short", claim_id=os.urandom(32)), Err
    )
