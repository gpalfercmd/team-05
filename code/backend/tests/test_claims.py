# =============================================================================
# Proof of Aid — Team 05 — Claim endpoint tests: create, read, upload
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Claims over HTTP (spec F2/F3, P3.4): only accredited orgs create, only the
owning org uploads, duplicates conflict, oversize is rejected, and the public
read exposes hashes plus the root — never bytes."""

from __future__ import annotations

from datetime import date

from eth_account import Account
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from app.services.claims import build_evidence_root, metadata_digest
from poa_shared.result import Ok
from tests.conftest import addresses_of, create_claim, login, seed_standard_roles, upload_file

UNKNOWN_CLAIM = "0x" + "00" * 32


def _org_client(client: TestClient, engine: Engine, wallets: dict[str, Account]) -> TestClient:
    """Fresh logged-in org client with standard roles seeded."""
    seed_standard_roles(engine, addresses_of(wallets))
    login(client, wallets["org"])
    return client


def test_health_ok(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_create_claim_requires_login(client: TestClient) -> None:
    body = {
        "title": "t",
        "description": "d",
        "location_region": "r",
        "claim_date": "2026-09-24",
    }
    assert client.post("/claims", json=body).status_code == 401


def test_create_claim_requires_organization(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    seed_standard_roles(engine, addresses_of(wallets))
    login(client, wallets["auditor"])
    body = {
        "title": "t",
        "description": "d",
        "location_region": "r",
        "claim_date": "2026-09-24",
    }
    assert client.post("/claims", json=body).status_code == 403


def test_create_claim_rejects_invalid_body(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    authed = _org_client(client, engine, wallets)
    assert authed.post("/claims", json={"title": ""}).status_code == 422


def test_create_claim_returns_anchor_ids(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    authed = _org_client(client, engine, wallets)
    claim = create_claim(authed)
    assert claim["created_by"] == wallets["org"].address.lower()
    assert claim["evidence"] == [] and claim["evidence_root"] is None
    expected = metadata_digest(
        title="500 food kits",
        description="Delivered in district X",
        location_region="North District",
        claim_date=date(2026, 9, 24),
        claim_id=bytes.fromhex(claim["claim_id_hex"].removeprefix("0x")),
    )
    assert isinstance(expected, Ok)
    assert claim["metadata_hash_hex"] == f"0x{expected.value.hex()}"


def test_read_claim_is_public_with_hashes_and_root(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    authed = _org_client(client, engine, wallets)
    claim = create_claim(authed)
    first = upload_file(authed, claim["claim_id_hex"], b"photo bytes", "a.jpg", "image/jpeg")
    second = upload_file(authed, claim["claim_id_hex"], b"pdf bytes", "b.pdf",
                         "application/pdf", public=True)
    public = client.get(f"/claims/{claim['claim_id_hex']}").json()
    assert len(public["evidence"]) == 2
    assert public["evidence_root"] == second["evidence_root"]
    expected = build_evidence_root(
        [bytes.fromhex(item["sha256_hex"].removeprefix("0x")) for item in first["files"] + second["files"]]
    )
    assert isinstance(expected, Ok)
    assert second["evidence_root"] == f"0x{expected.value.hex()}"
    assert first["files"][0]["is_public"] is False
    assert second["files"][0]["is_public"] is True


def test_read_claim_unknown_or_malformed_is_404(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    _org_client(client, engine, wallets)
    assert client.get(f"/claims/{UNKNOWN_CLAIM}").status_code == 404
    assert client.get("/claims/not-a-claim").status_code == 404


def test_upload_requires_owning_org(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    authed = _org_client(client, engine, wallets)
    claim = create_claim(authed)
    login(client, wallets["verifier"])
    response = client.post(
        f"/claims/{claim['claim_id_hex']}/evidence",
        files={"files": ("a.jpg", b"data", "image/jpeg")},
    )
    assert response.status_code == 403


def test_upload_duplicate_conflicts(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    authed = _org_client(client, engine, wallets)
    claim = create_claim(authed)
    upload_file(authed, claim["claim_id_hex"], b"same bytes", "a.jpg", "image/jpeg")
    response = authed.post(
        f"/claims/{claim['claim_id_hex']}/evidence",
        files={"files": ("a2.jpg", b"same bytes", "image/jpeg")},
    )
    assert response.status_code == 409


def test_upload_rejects_empty_file(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    authed = _org_client(client, engine, wallets)
    claim = create_claim(authed)
    response = authed.post(
        f"/claims/{claim['claim_id_hex']}/evidence",
        files={"files": ("empty.bin", b"", "application/octet-stream")},
    )
    assert response.status_code == 422


def test_upload_rejects_oversize_file(
    client: TestClient, engine: Engine, wallets: dict[str, Account], monkeypatch
) -> None:
    authed = _org_client(client, engine, wallets)
    claim = create_claim(authed)
    monkeypatch.setattr("app.api.claims.MAX_UPLOAD_BYTES", 10)
    response = authed.post(
        f"/claims/{claim['claim_id_hex']}/evidence",
        files={"files": ("big.bin", b"0123456789A", "application/octet-stream")},
    )
    assert response.status_code == 413
