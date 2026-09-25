# =============================================================================
# Proof of Aid — Team 05 — Tests for the salted note fingerprint recipe and its vectors
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""The note recipe must match the committed vectors and reject malformed input."""

from __future__ import annotations

import json
from typing import Any

import pytest

from poa_shared.gen_note_vectors import VECTORS_PATH, render_vectors
from poa_shared.merkle import keccak256
from poa_shared.notes import legacy_note_hash, note_hash, note_preimage
from poa_shared.result import Err, Ok


def from_hex(value: str) -> bytes:
    """Decode a 0x-prefixed hex string."""
    decoded = bytes.fromhex(value.removeprefix("0x"))
    return decoded


@pytest.fixture(scope="module")
def vectors() -> dict[str, Any]:
    """Load the committed vectors file."""
    loaded: dict[str, Any] = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    return loaded


def test_regenerated_vectors_match_committed_file() -> None:
    assert render_vectors() == VECTORS_PATH.read_text(encoding="utf-8")


def test_every_case_reproduces_its_preimage_and_hashes(vectors: dict[str, Any]) -> None:
    assert len(vectors["cases"]) >= 4
    for case in vectors["cases"]:
        salt = from_hex(case["salt"])
        preimage = from_hex(case["preimage_hex"])
        assert note_preimage(salt, case["text"]) == Ok(preimage)
        assert note_hash(salt, case["text"]) == Ok(from_hex(case["note_hash"]))
        assert keccak256(preimage) == from_hex(case["note_hash"])
        assert legacy_note_hash(case["text"]) == from_hex(case["legacy_hash"])
        assert case["note_hash"] != case["legacy_hash"]


def test_the_same_text_gets_unrelated_hashes_under_different_salts(vectors: dict[str, Any]) -> None:
    by_name = {case["name"]: case for case in vectors["cases"]}
    first, second = by_name["short_note"], by_name["same_text_other_salt"]
    assert first["text"] == second["text"]
    assert first["note_hash"] != second["note_hash"]
    assert first["legacy_hash"] == second["legacy_hash"]


def test_every_invalid_case_is_rejected(vectors: dict[str, Any]) -> None:
    for case in vectors["invalid"]:
        assert isinstance(note_hash(from_hex(case["salt"]), case["text"]), Err), case["name"]
