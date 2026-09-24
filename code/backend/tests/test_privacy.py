# =============================================================================
# Proof of Aid — Team 05 — Public claim view tests: no private metadata leaks
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Viewer-dependent claim reads (spec F3/F6): a private file's name, type,
size, id, uploader and upload time reach only the claim's authorized viewers
(owning org, its verifiers, the assigned auditor). Anonymous and unauthorized
wallets see private files as `sha256 + bundle` only — file names can carry
beneficiaries' personal data."""

from __future__ import annotations

import uuid

from eth_account import Account
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.models import Claim
from tests.conftest import addresses_of, create_claim, login, seed_standard_roles, upload_file

# Fictional name standing in for a file name that identifies a beneficiary.
PRIVATE_NAME = "beneficiary-jane-roe-id-card.jpg"
PUBLIC_NAME = "invoice-food-kits.pdf"
PRIVATE_KEYS = {"sha256_hex", "is_public", "root_index"}
PUBLIC_KEYS = {
    "id", "sha256_hex", "salt", "original_name", "mime_type", "size_bytes", "is_public", "root_index"
}


def _scenario(client: TestClient, engine: Engine, wallets: dict[str, Account]) -> dict:
    """Org claim with one private and one public file in bundle 0."""
    seed_standard_roles(engine, addresses_of(wallets))
    login(client, wallets["org"])
    claim = create_claim(client)
    private = upload_file(client, claim["claim_id_hex"], b"id card scan", PRIVATE_NAME, "image/jpeg")
    public = upload_file(
        client, claim["claim_id_hex"], b"invoice", PUBLIC_NAME, "application/pdf", public=True
    )
    scenario = {"claim": claim, "private": private["files"][0], "public": public["files"][0]}
    return scenario


def _assign_auditor(engine: Engine, claim_uuid: str, auditor_address: str) -> None:
    """Record the Authority's auditor assignment (DB seed until P4)."""
    with Session(engine) as db:
        db.get(Claim, uuid.UUID(claim_uuid)).auditor_address = auditor_address
        db.commit()


def _files_by_visibility(body: dict) -> tuple[dict, dict]:
    """Return (private entry, public entry) of the single bundle."""
    files = body["bundles"][0]["files"]
    private = next(item for item in files if item["is_public"] is False)
    public = next(item for item in files if item["is_public"] is True)
    pair = (private, public)
    return pair


def test_anonymous_sees_only_fingerprints_of_private_files(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    scenario = _scenario(client, engine, wallets)
    anonymous = TestClient(client.app)
    response = anonymous.get(f"/claims/{scenario['claim']['claim_id_hex']}")
    assert response.status_code == 200
    raw = response.text
    assert PRIVATE_NAME not in raw
    assert scenario["private"]["id"] not in raw
    assert "image/jpeg" not in raw
    assert "uploaded_by" not in raw and "uploaded_at" not in raw
    private, public = _files_by_visibility(response.json())
    assert set(private) == PRIVATE_KEYS
    assert private == {
        "sha256_hex": scenario["private"]["sha256_hex"],
        "is_public": False,
        "root_index": 0,
    }
    assert set(public) == PUBLIC_KEYS
    assert public["original_name"] == PUBLIC_NAME
    assert public["id"] == scenario["public"]["id"]
    # P8.2: a public file publishes its salt; a private file's salt never leaves the backend.
    assert public["salt"] == scenario["public"]["salt"]
    assert scenario["private"]["salt"] not in raw


def test_authorized_viewers_see_full_private_detail(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    scenario = _scenario(client, engine, wallets)
    _assign_auditor(engine, scenario["claim"]["id"], addresses_of(wallets)["auditor"])
    verifier = TestClient(client.app)
    login(verifier, wallets["verifier"])
    auditor = TestClient(client.app)
    login(auditor, wallets["auditor"])
    for viewer in (client, verifier, auditor):
        body = viewer.get(f"/claims/{scenario['claim']['claim_id_hex']}").json()
        private, _ = _files_by_visibility(body)
        assert private["original_name"] == PRIVATE_NAME
        assert private["mime_type"] == "image/jpeg"
        assert private["id"] == scenario["private"]["id"]
        assert private["uploaded_by"] == addresses_of(wallets)["org"]
        assert private["salt"] == scenario["private"]["salt"]


def test_unauthorized_wallets_are_treated_as_anonymous(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    scenario = _scenario(client, engine, wallets)
    url = f"/claims/{scenario['claim']['claim_id_hex']}"
    anonymous_body = TestClient(client.app).get(url).json()
    outsider = TestClient(client.app)
    login(outsider, wallets["outsider"])
    unassigned_auditor = TestClient(client.app)
    login(unassigned_auditor, wallets["auditor"])
    for viewer in (outsider, unassigned_auditor):
        response = viewer.get(url)
        assert PRIVATE_NAME not in response.text
        assert response.json() == anonymous_body


def test_public_manifest_never_names_private_files(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    scenario = _scenario(client, engine, wallets)
    response = TestClient(client.app).get(
        f"/claims/{scenario['claim']['claim_id_hex']}/bundles/0/manifest"
    )
    assert response.status_code == 200
    assert PRIVATE_NAME not in response.text
    private = next(item for item in response.json()["files"] if item["public"] is False)
    assert private == {"sha256": scenario["private"]["sha256_hex"], "public": False}
    assert scenario["private"]["salt"] not in response.text
    public = next(item for item in response.json()["files"] if item["public"] is True)
    assert public["salt"] == scenario["public"]["salt"]
    assert response.json()["version"] == 2
