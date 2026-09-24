# =============================================================================
# Proof of Aid — Team 05 — Claim digest and Merkle tests: vectors plus pipeline
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Claim identity and roots (spec F4, P3.3): the backend must agree with the
shared P1.3 vectors — otherwise the public page and the contract disagree on
the evidence root and verification falsely mismatches."""

from __future__ import annotations

import json
import os
import uuid
from datetime import date
from pathlib import Path

from app.services.claims import (
    build_evidence_root,
    claim_id_from_uuid,
    claim_id_hex,
    metadata_digest,
)
from app.services.evidence import process_upload
from poa_shared.merkle import build_proof, leaf_from_file_hash, verify_proof
from poa_shared.result import Err, Ok

VECTORS_PATH = Path(__file__).parents[2] / "shared" / "merkle-vectors.json"


def _hex(value: str) -> bytes:
    return bytes.fromhex(value.removeprefix("0x"))


def test_shared_vectors_pass() -> None:
    vectors = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    assert len(vectors["cases"]) == 6
    for case in vectors["cases"]:
        hashes = [_hex(entry["sha256"]) for entry in case["files"]]
        assert build_evidence_root(hashes) == Ok(_hex(case["root"])), case["name"]


def test_claim_id_is_deterministic_unique_and_sized() -> None:
    first, second = uuid.uuid4(), uuid.uuid4()
    assert len(claim_id_from_uuid(first)) == 32
    assert claim_id_from_uuid(first) == claim_id_from_uuid(first)
    assert claim_id_from_uuid(first) != claim_id_from_uuid(second)
    assert claim_id_hex(first) == f"0x{claim_id_from_uuid(first).hex()}"
    assert len(claim_id_hex(first)) == 66


def test_metadata_digest_is_sensitive_to_every_field() -> None:
    claim_id = claim_id_from_uuid(uuid.uuid4())
    base = {
        "title": "500 food kits",
        "description": "Delivered in district X",
        "location_region": "North District",
        "claim_date": date(2026, 9, 24),
        "claim_id": claim_id,
    }
    original = metadata_digest(**base)
    assert isinstance(original, Ok) and len(original.value) == 32
    assert metadata_digest(**base) == original
    alternatives = {
        "title": "501 food kits",
        "description": "Other",
        "location_region": "South",
        "claim_date": date(2026, 9, 25),
        "claim_id": claim_id_from_uuid(uuid.uuid4()),
    }
    for field, alt in alternatives.items():
        changed = metadata_digest(**{**base, field: alt})
        assert isinstance(changed, Ok) and changed != original, field


def test_metadata_digest_rejects_bad_input() -> None:
    claim_id = claim_id_from_uuid(uuid.uuid4())
    base = {
        "title": "t",
        "description": "d",
        "location_region": "r",
        "claim_date": date(2026, 9, 24),
        "claim_id": claim_id,
    }
    assert isinstance(metadata_digest(**{**base, "title": "  "}), Err)
    assert isinstance(metadata_digest(**{**base, "claim_id": b"short"}), Err)
    assert isinstance(build_evidence_root([]), Err)


def test_pipeline_hashes_build_a_verifiable_root() -> None:
    master = os.urandom(32)
    claim_id = claim_id_from_uuid(uuid.uuid4())
    processed = [
        process_upload(f"evidence file {index}".encode(), master_key=master, claim_id=claim_id)
        for index in range(3)
    ]
    assert all(isinstance(item, Ok) for item in processed)
    hashes = [item.value.file_hash for item in processed]
    root = build_evidence_root(hashes)
    assert isinstance(root, Ok)
    proof = build_proof(hashes, hashes[1])
    assert isinstance(proof, Ok)
    assert verify_proof(proof.value, root.value, leaf_from_file_hash(hashes[1]))
