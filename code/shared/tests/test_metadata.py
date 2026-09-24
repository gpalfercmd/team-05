# =============================================================================
# Proof of Aid — Team 05 — Tests for the canonical claim metadata recipe and its vectors
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""The metadata recipe must match the committed vectors and reject ambiguous input."""

from __future__ import annotations

import json
from typing import Any

import pytest

from poa_shared.gen_metadata_vectors import VECTORS_PATH, render_vectors
from poa_shared.merkle import keccak256
from poa_shared.metadata import canonical_metadata, metadata_hash
from poa_shared.result import Err, Ok

FIELDS = ("title", "description", "location_region", "claim_date")


def from_hex(value: str) -> bytes:
    """Decode a 0x-prefixed hex string."""
    decoded = bytes.fromhex(value.removeprefix("0x"))
    return decoded


def fields_of(case: dict[str, Any]) -> dict[str, Any]:
    """The recipe's keyword arguments for one vector case."""
    kwargs: dict[str, Any] = {name: case[name] for name in FIELDS}
    kwargs["claim_id"] = from_hex(case["claim_id"])
    return kwargs


@pytest.fixture(scope="module")
def vectors() -> dict[str, Any]:
    """Load the committed vectors file."""
    loaded: dict[str, Any] = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    return loaded


def test_regenerated_vectors_match_committed_file() -> None:
    assert render_vectors() == VECTORS_PATH.read_text(encoding="utf-8")


def test_every_case_reproduces_its_preimage_and_hash(vectors: dict[str, Any]) -> None:
    assert len(vectors["cases"]) >= 4
    for case in vectors["cases"]:
        preimage = from_hex(case["preimage_hex"])
        assert canonical_metadata(**fields_of(case)) == Ok(preimage)
        assert metadata_hash(**fields_of(case)) == Ok(from_hex(case["metadata_hash"]))
        assert keccak256(preimage) == from_hex(case["metadata_hash"])


def test_every_invalid_case_is_rejected(vectors: dict[str, Any]) -> None:
    for case in vectors["invalid"]:
        assert isinstance(metadata_hash(**fields_of(case)), Err), case["name"]


def test_the_hash_binds_the_claim(vectors: dict[str, Any]) -> None:
    by_name = {case["name"]: case for case in vectors["cases"]}
    same_text = by_name["same_text_other_claim"]
    assert fields_of(same_text) | {"claim_id": b""} == fields_of(by_name["ascii"]) | {"claim_id": b""}
    assert same_text["metadata_hash"] != by_name["ascii"]["metadata_hash"]


def test_any_changed_character_changes_the_hash(vectors: dict[str, Any]) -> None:
    case = vectors["cases"][0]
    original = metadata_hash(**fields_of(case))
    for name in ("title", "description", "location_region"):
        edited = fields_of(case) | {name: case[name] + "."}
        assert metadata_hash(**edited) != original


def test_text_cannot_move_between_title_and_description() -> None:
    claim = keccak256(b"claim")
    moved = metadata_hash(title="A\nB", description="C", location_region="R", claim_date="2026-01-01", claim_id=claim)
    assert moved == Err("title must be a single line")
    assert isinstance(
        metadata_hash(title="A", description="B\nC", location_region="R", claim_date="2026-01-01", claim_id=claim), Ok
    )


@pytest.mark.parametrize("claim_date", ["2026-1-01", "20260101", "2026-13-01", "2026-01-01T00:00", ""])
def test_only_calendar_dates_in_iso_form(claim_date: str) -> None:
    result = canonical_metadata(
        title="T", description="D", location_region="R", claim_date=claim_date, claim_id=keccak256(b"claim")
    )
    assert result == Err("claim_date must be a YYYY-MM-DD date")
