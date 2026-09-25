# =============================================================================
# Proof of Aid — Team 05 — PDF metadata stripping tests (P10.1)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""PDF uploads lose their document information dictionary and XMP metadata
before they are hashed and encrypted; PDFs that cannot be cleaned (encrypted
or unparseable) are rejected with 422 and nothing is stored."""

from __future__ import annotations

import hashlib
import os
from io import BytesIO
from pathlib import Path

from eth_account import Account
from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject
from sqlalchemy import Engine

from app.services.evidence import PDF_REJECTED, is_pdf, process_upload, sanitize_upload
from app.settings import Settings
from poa_shared.result import Err, Ok
from tests.conftest import addresses_of, create_claim, login, seed_standard_roles

AUTHOR = "Jane Beneficiary"
CREATOR = "SecretScanTool 9"
XMP_PERSON = "XmpPersonName"
XMP_PACKET = (
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF '
    'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">'
    f"<dc:creator>{XMP_PERSON}</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>"
    '<?xpacket end="w"?>'
).encode()
LEAKS: tuple[bytes, ...] = (AUTHOR.encode(), CREATOR.encode(), XMP_PERSON.encode(), b"20260101090000Z")


def _serialize(writer: PdfWriter) -> bytes:
    buffer = BytesIO()
    writer.write(buffer)
    serialized: bytes = buffer.getvalue()
    return serialized


def pdf_with_metadata(pages: int = 2) -> bytes:
    """A small PDF carrying /Info (author, creator, dates) and XMP on the catalog and a page."""
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    writer.add_metadata(
        {
            "/Author": AUTHOR,
            "/Creator": CREATOR,
            "/Producer": CREATOR,
            "/CreationDate": "D:20260101090000Z",
            "/ModDate": "D:20260101100000Z",
        }
    )
    writer.xmp_metadata = XMP_PACKET
    writer.pages[0][NameObject("/Metadata")] = writer.root_object["/Metadata"]
    built = _serialize(writer)
    return built


def test_fixture_really_carries_the_metadata() -> None:
    raw = pdf_with_metadata()
    reader = PdfReader(BytesIO(raw))
    assert reader.metadata is not None and reader.metadata.author == AUTHOR
    assert reader.xmp_metadata is not None
    assert all(leak in raw for leak in LEAKS)


def test_pdf_metadata_is_removed_and_the_pdf_still_parses() -> None:
    raw = pdf_with_metadata(pages=3)
    sanitized = sanitize_upload(raw)
    assert isinstance(sanitized, Ok)
    cleaned = sanitized.value
    reader = PdfReader(BytesIO(cleaned))
    assert len(reader.pages) == 3
    assert reader.metadata is None
    assert reader.xmp_metadata is None
    assert "/Metadata" not in reader.pages[0]
    assert not any(leak in cleaned for leak in LEAKS)
    assert is_pdf(cleaned)


def test_metadata_from_an_earlier_incremental_revision_is_not_kept() -> None:
    """An appended update that blanks /Info still carries the old dictionary in the file."""
    original = pdf_with_metadata(pages=1)
    updater = PdfWriter(BytesIO(original), incremental=True)
    updater.add_metadata({"/Author": "Someone Else"})
    updated = _serialize(updater)
    assert AUTHOR.encode() in updated
    sanitized = sanitize_upload(updated)
    assert isinstance(sanitized, Ok)
    assert AUTHOR.encode() not in sanitized.value
    assert b"Someone Else" not in sanitized.value


def test_pdf_header_is_detected_by_magic_bytes_not_name() -> None:
    raw = pdf_with_metadata(pages=1)
    assert is_pdf(raw)
    assert is_pdf(b"junk before the header\n" + raw)
    assert not is_pdf(b"report.pdf is only a name, not a header")
    prefixed = sanitize_upload(b"junk before the header\n" + raw)
    assert isinstance(prefixed, Ok)
    assert not any(leak in prefixed.value for leak in LEAKS)


def test_non_pdf_bytes_are_untouched() -> None:
    blob = b"a spreadsheet export, not a PDF: name,qty\nkits,500\n"
    assert sanitize_upload(blob) == Ok(blob)


def test_malformed_pdf_is_rejected() -> None:
    for broken in (b"%PDF-1.4 truncated", b"%PDF-1.7\n" + os.urandom(256)):
        rejected = sanitize_upload(broken)
        assert isinstance(rejected, Err)
        assert rejected.message == PDF_REJECTED


def test_encrypted_pdf_is_rejected() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.add_metadata({"/Author": AUTHOR})
    writer.encrypt(user_password="secret", algorithm="AES-128")
    rejected = sanitize_upload(_serialize(writer))
    assert isinstance(rejected, Err)
    assert rejected.message == PDF_REJECTED


def test_commitment_is_computed_on_the_cleaned_pdf() -> None:
    raw = pdf_with_metadata()
    processed = process_upload(raw, master_key=os.urandom(32), claim_id=os.urandom(32))
    assert isinstance(processed, Ok)
    cleaned = sanitize_upload(raw)
    assert isinstance(cleaned, Ok)
    # The rewrite is deterministic for the same input, so the cleaned bytes are comparable.
    assert processed.value.file_hash == hashlib.sha256(processed.value.salt + cleaned.value).digest()
    assert processed.value.size_bytes == len(cleaned.value)
    assert processed.value.file_hash != hashlib.sha256(processed.value.salt + raw).digest()


def test_api_stores_the_cleaned_pdf_and_rejects_a_broken_one(
    client: TestClient, engine: Engine, wallets: dict[str, Account], settings: Settings
) -> None:
    seed_standard_roles(engine, addresses_of(wallets))
    login(client, wallets["org"])
    claim = create_claim(client)
    uploaded = client.post(
        f"/claims/{claim['claim_id_hex']}/evidence",
        files={"files": ("report.pdf", pdf_with_metadata(), "application/pdf")},
    )
    assert uploaded.status_code == 201, uploaded.text
    entry = uploaded.json()["files"][0]
    downloaded = client.get(f"/files/{entry['id']}")
    assert downloaded.status_code == 200
    assert not any(leak in downloaded.content for leak in LEAKS)
    assert PdfReader(BytesIO(downloaded.content)).metadata is None
    salt = bytes.fromhex(entry["salt"].removeprefix("0x"))
    assert entry["sha256_hex"] == "0x" + hashlib.sha256(salt + downloaded.content).hexdigest()

    storage = Path(settings.storage_dir)
    stored_before = sorted(storage.iterdir())
    broken = client.post(
        f"/claims/{claim['claim_id_hex']}/evidence",
        files={"files": ("broken.pdf", b"%PDF-1.4 truncated", "application/pdf")},
    )
    assert broken.status_code == 422
    assert "cannot be cleaned" in broken.json()["detail"]
    assert sorted(storage.iterdir()) == stored_before
