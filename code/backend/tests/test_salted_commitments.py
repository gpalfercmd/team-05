# =============================================================================
# Proof of Aid — Team 05 — Salted evidence commitment tests (P8.2)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Salted commitments over HTTP (P8.2): every upload is fingerprinted as
SHA-256(salt ‖ bytes); a public file's salt lets anyone re-hash it, a private
salt stays with authorized viewers, duplicates are still refused, and
unsalted rows from before P8.2 keep working (manifest v1, plain SHA-256)."""

from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path

import pytest
from eth_account import Account
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from pydantic import ValidationError
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.models import EvidenceFile
from app.schemas import EvidenceManifest
from tests.conftest import addresses_of, create_claim, login, seed_standard_roles, upload_file

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "shared" / "manifest.schema.json"
SHA = "0x" + "ab" * 32
SALT = "0x" + "cd" * 32


def _org_claim(client: TestClient, engine: Engine, wallets: dict[str, Account]) -> dict:
    """A claim created by the logged-in, accredited organization."""
    seed_standard_roles(engine, addresses_of(wallets))
    login(client, wallets["org"])
    claim: dict = create_claim(client)
    return claim


def _salted(salt_hex: str, content: bytes) -> str:
    """Return 0x-hex SHA-256(salt ‖ content)."""
    commitment = "0x" + hashlib.sha256(bytes.fromhex(salt_hex[2:]) + content).hexdigest()
    return commitment


def _insert_legacy_file(engine: Engine, claim: dict, content: bytes, *, public: bool) -> str:
    """Store a pre-P8.2 row: plain SHA-256, no salt, no dedup tag. Returns its fingerprint."""
    fingerprint = "0x" + hashlib.sha256(content).hexdigest()
    with Session(engine) as db:
        db.add(
            EvidenceFile(
                claim_id=uuid.UUID(claim["id"]),
                sha256_hex=fingerprint,
                storage_name=f"{uuid.uuid4().hex}.enc",
                original_name="legacy.txt",
                mime_type="text/plain",
                size_bytes=len(content),
                is_public=public,
                root_index=0,
                uploaded_by=claim["created_by"],
            )
        )
        db.commit()
    return fingerprint


def test_public_file_can_be_rehashed_with_its_published_salt(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim = _org_claim(client, engine, wallets)
    uploaded = upload_file(client, claim["claim_id_hex"], b"public invoice", "invoice.txt", public=True)
    entry = uploaded["files"][0]
    anonymous = TestClient(client.app)
    downloaded = anonymous.get(f"/files/{entry['id']}").content
    public = anonymous.get(f"/claims/{claim['claim_id_hex']}").json()["bundles"][0]["files"][0]
    assert public["salt"] == entry["salt"]
    assert _salted(public["salt"], downloaded) == public["sha256_hex"]
    assert "0x" + hashlib.sha256(downloaded).hexdigest() != public["sha256_hex"]


def test_same_bytes_get_different_commitments_in_different_claims(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    first = _org_claim(client, engine, wallets)
    second = create_claim(client)
    one = upload_file(client, first["claim_id_hex"], b"standard form")["files"][0]
    two = upload_file(client, second["claim_id_hex"], b"standard form")["files"][0]
    assert one["sha256_hex"] != two["sha256_hex"]
    assert one["salt"] != two["salt"]


def test_same_bytes_twice_in_one_request_conflict(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim = _org_claim(client, engine, wallets)
    response = client.post(
        f"/claims/{claim['claim_id_hex']}/evidence",
        files=[("files", ("a.txt", b"twice", "text/plain")), ("files", ("b.txt", b"twice", "text/plain"))],
    )
    assert response.status_code == 409


def test_publishing_a_private_file_later_publishes_its_salt(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim = _org_claim(client, engine, wallets)
    entry = upload_file(client, claim["claim_id_hex"], b"flipped later")["files"][0]
    url = f"/claims/{claim['claim_id_hex']}"
    assert entry["salt"] not in TestClient(client.app).get(url).text
    patched = client.patch(f"/files/{entry['id']}", json={"is_public": True})
    assert patched.status_code == 200
    assert patched.json()["salt"] == entry["salt"]
    public = TestClient(client.app).get(url).json()["bundles"][0]["files"][0]
    assert public["salt"] == entry["salt"]


def test_legacy_unsalted_rows_keep_working(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim = _org_claim(client, engine, wallets)
    fingerprint = _insert_legacy_file(engine, claim, b"legacy receipt", public=True)
    anonymous = TestClient(client.app)
    public = anonymous.get(f"/claims/{claim['claim_id_hex']}").json()["bundles"][0]["files"][0]
    assert public["sha256_hex"] == fingerprint
    assert public["salt"] is None
    manifest = anonymous.get(f"/claims/{claim['claim_id_hex']}/bundles/0/manifest").json()
    validator = Draft202012Validator(json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))
    assert list(validator.iter_errors(manifest)) == []
    assert manifest["version"] == 1
    assert manifest["files"] == [{"sha256": fingerprint, "public": True, "name": "legacy.txt"}]
    authorized = client.get(f"/claims/{claim['claim_id_hex']}").json()["bundles"][0]["files"][0]
    assert authorized["salt"] is None


def test_upload_matching_a_legacy_row_conflicts(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim = _org_claim(client, engine, wallets)
    _insert_legacy_file(engine, claim, b"legacy receipt", public=False)
    response = client.post(
        f"/claims/{claim['claim_id_hex']}/evidence",
        files={"files": ("again.txt", b"legacy receipt", "text/plain")},
    )
    assert response.status_code == 409


def test_mixed_bundle_manifest_is_v2_and_valid(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim = _org_claim(client, engine, wallets)
    _insert_legacy_file(engine, claim, b"legacy receipt", public=True)
    upload_file(client, claim["claim_id_hex"], b"new invoice", "invoice.txt", public=True)
    manifest = TestClient(client.app).get(f"/claims/{claim['claim_id_hex']}/bundles/0/manifest").json()
    validator = Draft202012Validator(json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))
    assert list(validator.iter_errors(manifest)) == []
    assert manifest["version"] == 2
    assert sorted("salt" in item for item in manifest["files"]) == [False, True]


def test_stored_salt_is_encrypted_not_plain(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim = _org_claim(client, engine, wallets)
    entry = upload_file(client, claim["claim_id_hex"], b"sealed")["files"][0]
    with Session(engine) as db:
        row = db.get(EvidenceFile, uuid.UUID(entry["id"]))
        assert row is not None and row.salt_sealed is not None
        assert bytes.fromhex(entry["salt"][2:]) not in row.salt_sealed
        assert row.dedup_tag_hex is not None and row.dedup_tag_hex != row.sha256_hex


def test_manifest_model_keeps_salts_off_v1_and_private_entries() -> None:
    public_salted = {"sha256": SHA, "public": True, "name": "a.txt", "salt": SALT}
    with pytest.raises(ValidationError):
        EvidenceManifest(version=1, claimId=SHA, rootIndex=0, files=[public_salted])
    with pytest.raises(ValidationError):
        EvidenceManifest(
            version=2, claimId=SHA, rootIndex=0, files=[{"sha256": SHA, "public": False, "salt": SALT}]
        )
    assert EvidenceManifest(version=2, claimId=SHA, rootIndex=0, files=[public_salted]).version == 2


def test_schema_keeps_salts_off_private_entries() -> None:
    validator = Draft202012Validator(json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))
    base = {"claimId": SHA, "rootIndex": 0}
    public_salted = {"sha256": SHA, "public": True, "salt": SALT}
    private_salted = {"sha256": SHA, "public": False, "salt": SALT}
    assert not validator.is_valid({**base, "version": 2, "files": [private_salted]})
    assert validator.is_valid({**base, "version": 2, "files": [public_salted]})
    assert validator.is_valid({**base, "version": 1, "files": [{"sha256": SHA, "public": False}]})
    assert not validator.is_valid({**base, "version": 3, "files": [{"sha256": SHA, "public": False}]})
