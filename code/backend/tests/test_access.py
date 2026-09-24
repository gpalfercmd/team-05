# =============================================================================
# Proof of Aid — Team 05 — Access matrix tests: who may decrypt what
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Evidence confidentiality (spec F3, P3.4): private files decrypt only for
the owning org, its verifiers and the assigned auditor; everyone else —
including other accredited auditors — sees 404, and public files need no
login at all."""

from __future__ import annotations

import uuid

from eth_account import Account
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.models import Claim
from app.services.evidence import sanitize_upload
from tests.conftest import (
    addresses_of,
    create_claim,
    login,
    seed_standard_roles,
    upload_file,
)

FILE_A = b"delivery photo A bytes"
FILE_B = b"invoice B bytes"


def _scenario(client: TestClient, engine: Engine, wallets: dict[str, Account]) -> dict:
    """Org claim with one private and one public file; returns ids + bytes."""
    seed_standard_roles(engine, addresses_of(wallets))
    login(client, wallets["org"])
    claim = create_claim(client)
    private = upload_file(client, claim["claim_id_hex"], FILE_A, "a.jpg", "image/jpeg")
    public = upload_file(
        client, claim["claim_id_hex"], FILE_B, "b.pdf", "application/pdf", public=True
    )
    scenario = {
        "claim": claim,
        "private_id": private["files"][0]["id"],
        "public_id": public["files"][0]["id"],
        "sanitized_a": sanitize_upload(FILE_A),
    }
    return scenario


def _assign_auditor(engine: Engine, claim_uuid: str, auditor_address: str) -> None:
    """Record the Authority's auditor assignment (P6 seed does this live)."""
    with Session(engine) as db:
        db.get(Claim, uuid.UUID(claim_uuid)).auditor_address = auditor_address
        db.commit()


def test_private_file_hidden_from_anonymous_strangers_and_unassigned_auditor(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    scenario = _scenario(client, engine, wallets)
    anonymous = TestClient(client.app)
    outsider = TestClient(client.app)
    login(outsider, wallets["outsider"])
    auditor = TestClient(client.app)
    login(auditor, wallets["auditor"])
    assert anonymous.get(f"/files/{scenario['private_id']}").status_code == 404
    assert outsider.get(f"/files/{scenario['private_id']}").status_code == 404
    assert auditor.get(f"/files/{scenario['private_id']}").status_code == 404


def test_private_file_readable_by_org_verifier_and_assigned_auditor(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    scenario = _scenario(client, engine, wallets)
    addrs = addresses_of(wallets)
    _assign_auditor(engine, scenario["claim"]["id"], addrs["auditor"])
    verifier = TestClient(client.app)
    login(verifier, wallets["verifier"])
    auditor = TestClient(client.app)
    login(auditor, wallets["auditor"])
    assert client.get(f"/files/{scenario['private_id']}").content == scenario["sanitized_a"]
    assert verifier.get(f"/files/{scenario['private_id']}").content == scenario["sanitized_a"]
    assert auditor.get(f"/files/{scenario['private_id']}").content == scenario["sanitized_a"]


def test_public_file_readable_without_login(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    scenario = _scenario(client, engine, wallets)
    anonymous = TestClient(client.app)
    response = anonymous.get(f"/files/{scenario['public_id']}")
    assert response.status_code == 200


def test_visibility_change_requires_owning_org(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    scenario = _scenario(client, engine, wallets)
    outsider = TestClient(client.app)
    login(outsider, wallets["outsider"])
    anonymous = TestClient(client.app)
    payload = {"is_public": True}
    assert anonymous.patch(f"/files/{scenario['private_id']}", json=payload).status_code == 401
    assert outsider.patch(f"/files/{scenario['private_id']}", json=payload).status_code == 403
    flipped = client.patch(f"/files/{scenario['private_id']}", json=payload).json()
    assert flipped["is_public"] is True
    assert anonymous.get(f"/files/{scenario['private_id']}").status_code == 200
