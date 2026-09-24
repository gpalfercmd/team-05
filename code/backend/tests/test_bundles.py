# =============================================================================
# Proof of Aid — Team 05 — Evidence bundle and manifest tests
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Bundles mirror `evidenceRoots(claimId)` onchain (spec F3/F4): one Merkle
root per `root_index`, no gaps, earlier bundles sealed once a later one
exists. The per-bundle manifest matches `code/shared/manifest.schema.json`
and its fingerprints rebuild exactly that bundle's root."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from eth_account import Account
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from pydantic import ValidationError
from sqlalchemy import Engine

from app.schemas import EvidenceManifest
from app.services.bundles import check_bundle_target
from app.services.claims import build_evidence_root
from poa_shared.result import Err, Ok
from tests.conftest import addresses_of, create_claim, login, seed_standard_roles, upload_file

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "shared" / "manifest.schema.json"
UNKNOWN_CLAIM = "0x" + "00" * 32


def _org_claim(client: TestClient, engine: Engine, wallets: dict[str, Account]) -> str:
    """Log in as the org and return a fresh claim's hex id."""
    seed_standard_roles(engine, addresses_of(wallets))
    login(client, wallets["org"])
    claim_id_hex: str = create_claim(client)["claim_id_hex"]
    return claim_id_hex


def _recipe_root(sha_hexes: list[str]) -> str:
    """Apply the shared P1.3 recipe to `0x` fingerprints."""
    root = build_evidence_root([bytes.fromhex(item.removeprefix("0x")) for item in sha_hexes])
    assert isinstance(root, Ok)
    hexed = f"0x{root.value.hex()}"
    return hexed


def _post(client: TestClient, claim_id_hex: str, files: list[tuple[str, bytes]], root_index: int):
    """Upload raw (name, bytes) pairs to a bundle without asserting success."""
    response = client.post(
        f"/claims/{claim_id_hex}/evidence",
        files=[("files", (name, content, "application/octet-stream")) for name, content in files],
        data={"root_index": str(root_index)},
    )
    return response


def test_two_bundles_have_two_recipe_roots(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id_hex = _org_claim(client, engine, wallets)
    a = upload_file(client, claim_id_hex, b"original A", "a.bin")
    b = upload_file(client, claim_id_hex, b"original B", "b.bin", public=True)
    root_before = client.get(f"/claims/{claim_id_hex}").json()["bundles"][0]["evidence_root"]
    proof = upload_file(client, claim_id_hex, b"supplementary proof", "p.bin", root_index=1)
    bundles = client.get(f"/claims/{claim_id_hex}").json()["bundles"]
    original = [a["files"][0]["sha256_hex"], b["files"][0]["sha256_hex"]]
    assert [item["root_index"] for item in bundles] == [0, 1]
    assert bundles[0]["evidence_root"] == _recipe_root(original) == root_before
    assert bundles[1]["evidence_root"] == _recipe_root([proof["files"][0]["sha256_hex"]])
    assert proof["root_index"] == 1 and proof["evidence_root"] == bundles[1]["evidence_root"]
    assert bundles[0]["evidence_root"] != bundles[1]["evidence_root"]


def test_bundle_gap_is_rejected(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id_hex = _org_claim(client, engine, wallets)
    assert _post(client, claim_id_hex, [("x.bin", b"x")], root_index=1).status_code == 409
    upload_file(client, claim_id_hex, b"original", "a.bin")
    assert _post(client, claim_id_hex, [("y.bin", b"y")], root_index=2).status_code == 409
    assert _post(client, claim_id_hex, [("y.bin", b"y")], root_index=-1).status_code == 422


def test_sealed_bundle_rejects_new_files(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id_hex = _org_claim(client, engine, wallets)
    upload_file(client, claim_id_hex, b"original", "a.bin")
    upload_file(client, claim_id_hex, b"proof one", "p1.bin", root_index=1)
    assert _post(client, claim_id_hex, [("late.bin", b"late")], root_index=0).status_code == 409
    upload_file(client, claim_id_hex, b"proof one bis", "p1b.bin", root_index=1)
    bundles = client.get(f"/claims/{claim_id_hex}").json()["bundles"]
    assert [len(item["files"]) for item in bundles] == [1, 2]


def test_duplicates_rejected_across_bundles_and_within_one_request(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id_hex = _org_claim(client, engine, wallets)
    upload_file(client, claim_id_hex, b"same", "a.bin")
    assert _post(client, claim_id_hex, [("b.bin", b"same")], root_index=1).status_code == 409
    twice = [("c.bin", b"twin"), ("d.bin", b"twin")]
    assert _post(client, claim_id_hex, twice, root_index=0).status_code == 409


def test_check_bundle_target_rules() -> None:
    assert check_bundle_target(None, 0) == Ok(0)
    assert isinstance(check_bundle_target(None, 1), Err)
    assert check_bundle_target(0, 0) == Ok(0)
    assert check_bundle_target(0, 1) == Ok(1)
    assert isinstance(check_bundle_target(0, 2), Err)
    assert isinstance(check_bundle_target(2, 1), Err)
    assert isinstance(check_bundle_target(2, -1), Err)


def test_manifest_matches_shared_schema_and_bundle_root(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id_hex = _org_claim(client, engine, wallets)
    upload_file(client, claim_id_hex, b"private original", "private.jpg")
    upload_file(client, claim_id_hex, b"public original", "folder/report.pdf", public=True)
    upload_file(client, claim_id_hex, b"proof", "proof.bin", root_index=1)
    validator = Draft202012Validator(json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))
    bundles = client.get(f"/claims/{claim_id_hex}").json()["bundles"]
    anonymous = TestClient(client.app)
    for bundle in bundles:
        response = anonymous.get(f"/claims/{claim_id_hex}/bundles/{bundle['root_index']}/manifest")
        assert response.status_code == 200
        manifest = response.json()
        assert list(validator.iter_errors(manifest)) == []
        assert manifest["claimId"] == claim_id_hex and manifest["rootIndex"] == bundle["root_index"]
        fingerprints = [item["sha256"] for item in manifest["files"]]
        assert len(set(fingerprints)) == len(fingerprints)
        assert all(item == item.lower() for item in fingerprints)
        assert _recipe_root(fingerprints) == bundle["evidence_root"]
    original = anonymous.get(f"/claims/{claim_id_hex}/bundles/0/manifest").json()["files"]
    named = [item for item in original if item["public"] is True]
    assert [item["name"] for item in named] == ["report.pdf"]
    assert all(set(item) == {"sha256", "public"} for item in original if item["public"] is False)


def test_manifest_unknown_claim_or_bundle_is_404(
    client: TestClient, engine: Engine, wallets: dict[str, Account]
) -> None:
    claim_id_hex = _org_claim(client, engine, wallets)
    assert client.get(f"/claims/{claim_id_hex}/bundles/0/manifest").status_code == 404
    upload_file(client, claim_id_hex, b"original", "a.bin")
    assert client.get(f"/claims/{claim_id_hex}/bundles/1/manifest").status_code == 404
    assert client.get(f"/claims/{UNKNOWN_CLAIM}/bundles/0/manifest").status_code == 404
    assert client.get("/claims/not-a-claim/bundles/0/manifest").status_code == 404


def test_manifest_model_rejects_duplicates_and_private_names() -> None:
    sha = "0x" + "ab" * 32
    with pytest.raises(ValidationError):
        EvidenceManifest(
            claimId="0x" + "01" * 32,
            rootIndex=0,
            files=[{"sha256": sha, "public": False}, {"sha256": sha, "public": False}],
        )
    with pytest.raises(ValidationError):
        EvidenceManifest(
            claimId="0x" + "01" * 32,
            rootIndex=0,
            files=[{"sha256": sha, "public": False, "name": "leak.jpg"}],
        )
