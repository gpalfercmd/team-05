# =============================================================================
# Proof of Aid — Team 05 — Metadata hash tests: shared vectors and the public round trip (P8.4)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""The anchored `metadataHash` must be reproducible by the public page.

The backend hashes with the shared recipe (`code/shared/metadata-vectors.json`,
also checked by the frontend), and the public claim view serves exactly the
strings it hashed, so anyone can recompute the hash from the API answer.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from eth_account import Account
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from app.services.claims import metadata_digest
from poa_shared.metadata import metadata_hash
from poa_shared.result import Err, Ok
from tests.conftest import addresses_of, create_claim, login, seed_standard_roles

VECTORS_PATH = Path(__file__).parents[2] / "shared" / "metadata-vectors.json"


def _hex(value: str) -> bytes:
    decoded = bytes.fromhex(value.removeprefix("0x"))
    return decoded


def _vectors() -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    return loaded


def _served_hash(served: dict[str, Any]) -> bytes:
    """What the public page recomputes from a claim view."""
    recomputed = metadata_hash(
        title=served["title"],
        description=served["description"],
        location_region=served["location_region"],
        claim_date=served["claim_date"],
        claim_id=_hex(served["claim_id_hex"]),
    )
    assert isinstance(recomputed, Ok), recomputed
    return recomputed.value


def test_backend_digest_reproduces_every_shared_vector() -> None:
    for case in _vectors()["cases"]:
        digest = metadata_digest(
            title=case["title"],
            description=case["description"],
            location_region=case["location_region"],
            claim_date=date.fromisoformat(case["claim_date"]),
            claim_id=_hex(case["claim_id"]),
        )
        assert digest == Ok(_hex(case["metadata_hash"])), case["name"]


def test_backend_digest_rejects_the_invalid_vectors_it_can_receive() -> None:
    for case in _vectors()["invalid"]:
        if case["name"] == "not_a_date":
            continue  # the API parses claim_date into a `date` before hashing
        digest = metadata_digest(
            title=case["title"],
            description=case["description"],
            location_region=case["location_region"],
            claim_date=date.fromisoformat(case["claim_date"]),
            claim_id=_hex(case["claim_id"]),
        )
        assert isinstance(digest, Err), case["name"]


def _org_client(client: TestClient, engine: Engine, wallets: dict[str, Account]) -> TestClient:
    seed_standard_roles(engine, addresses_of(wallets))
    login(client, wallets["org"])
    return client


def test_public_view_serves_exactly_the_hashed_text(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    authed = _org_client(client, engine, wallets)
    created = create_claim(
        authed,
        {
            "title": "  Kits de higiene — Región Norte ",
            "description": "\n350 kits delivered.\n\nChecked on site 🚰\n",
            "location_region": " Región Norte",
        },
    )
    client.cookies.clear()
    served = client.get(f"/claims/{created['claim_id_hex']}").json()
    assert served["title"] == "Kits de higiene — Región Norte"
    assert served["description"] == "350 kits delivered.\n\nChecked on site 🚰"
    assert f"0x{_served_hash(served).hex()}" == served["metadata_hash_hex"] == created["metadata_hash_hex"]


@pytest.mark.parametrize(
    "field,value",
    [("title", "500 food kits\ndelivered"), ("title", "500 food kits\r"), ("location_region", "North\nDistrict")],
)
def test_create_claim_rejects_line_breaks_outside_the_description(
    client: TestClient, engine: Engine, wallets: dict[str, Account], field: str, value: str
) -> None:
    authed = _org_client(client, engine, wallets)
    body = {
        "title": "500 food kits",
        "description": "Delivered in district X",
        "location_region": "North District",
        "claim_date": "2026-09-24",
        field: value,
    }
    assert authed.post("/claims", json=body).status_code == 422
