# =============================================================================
# Proof of Aid — Team 05 — Tests for the shared Merkle recipe and its vectors
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""The recipe must match the committed vectors and reject invalid input with Err."""

import json
from typing import Any

import pytest

from poa_shared.gen_vectors import VECTORS_PATH, render_vectors
from poa_shared.merkle import (
    build_proof,
    build_root,
    file_hash,
    keccak256,
    leaf_from_file_hash,
    verify_proof,
)
from poa_shared.result import Err, Ok

KECCAK_OF_EMPTY = bytes.fromhex("c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")


def from_hex(value: str) -> bytes:
    """Decode a 0x-prefixed hex string."""
    decoded = bytes.fromhex(value.removeprefix("0x"))
    return decoded


@pytest.fixture(scope="module")
def vectors() -> dict[str, Any]:
    """Load the committed vectors file."""
    loaded: dict[str, Any] = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    return loaded


def case_by_name(vectors: dict[str, Any], name: str) -> dict[str, Any]:
    """Return the vector case with the given name."""
    case: dict[str, Any] = next(item for item in vectors["cases"] if item["name"] == name)
    return case


def test_keccak_is_ethereum_keccak_not_nist_sha3() -> None:
    assert keccak256(b"") == KECCAK_OF_EMPTY


def test_regenerated_vectors_match_committed_file() -> None:
    assert render_vectors() == VECTORS_PATH.read_text(encoding="utf-8")


def test_helper_counts_match_arrays(vectors: dict[str, Any]) -> None:
    assert vectors["case_count"] == len(vectors["cases"])
    assert all(case["file_count"] == len(case["files"]) for case in vectors["cases"])


def test_every_file_hash_leaf_root_and_proof_matches(vectors: dict[str, Any]) -> None:
    for case in vectors["cases"]:
        hashes = [from_hex(entry["sha256"]) for entry in case["files"]]
        root = from_hex(case["root"])
        assert build_root(hashes) == Ok(root)
        for entry, content_hash in zip(case["files"], hashes, strict=True):
            leaf = from_hex(entry["leaf"])
            proof = [from_hex(node) for node in entry["proof"]]
            assert file_hash(from_hex(entry["content_hex"])) == content_hash
            assert leaf_from_file_hash(content_hash) == leaf
            assert build_proof(hashes, content_hash) == Ok(proof)
            assert verify_proof(proof, root, leaf)


def test_order_independence(vectors: dict[str, Any]) -> None:
    five = case_by_name(vectors, "five_files")
    shuffled = case_by_name(vectors, "order_independence")
    assert [entry["sha256"] for entry in five["files"]] != [entry["sha256"] for entry in shuffled["files"]]
    assert sorted(entry["sha256"] for entry in five["files"]) == sorted(entry["sha256"] for entry in shuffled["files"])
    assert five["root"] == shuffled["root"]


def test_odd_levels_promote_without_sibling(vectors: dict[str, Any]) -> None:
    three = case_by_name(vectors, "three_files")
    assert sorted(len(entry["proof"]) for entry in three["files"]) == [1, 2, 2]


def test_tampered_file_does_not_verify(vectors: dict[str, Any]) -> None:
    tamper = vectors["tamper"]
    source = case_by_name(vectors, tamper["case"])["files"][tamper["file_index"]]
    tampered_hash = file_hash(from_hex(tamper["tampered_content_hex"]))
    tampered_leaf = leaf_from_file_hash(tampered_hash)
    proof = [from_hex(node) for node in tamper["proof"]]
    assert tamper["tampered_content_hex"] != source["content_hex"]
    assert tampered_hash == from_hex(tamper["tampered_sha256"])
    assert tampered_leaf == from_hex(tamper["tampered_leaf"])
    assert tamper["must_verify"] is False
    assert verify_proof(proof, from_hex(tamper["root"]), tampered_leaf) is False
    assert verify_proof(proof, from_hex(tamper["root"]), from_hex(source["leaf"])) is True


def test_single_leaf_root_is_the_leaf() -> None:
    content_hash = file_hash(b"single evidence file")
    leaf = leaf_from_file_hash(content_hash)
    assert build_root([content_hash]) == Ok(leaf)
    assert build_proof([content_hash], content_hash) == Ok([])
    assert verify_proof([], leaf, leaf)


def test_empty_input_is_err() -> None:
    assert isinstance(build_root([]), Err)
    assert isinstance(build_proof([], file_hash(b"x")), Err)


def test_duplicate_files_are_err() -> None:
    content_hash = file_hash(b"same bytes twice")
    assert isinstance(build_root([content_hash, content_hash]), Err)
    assert isinstance(build_proof([content_hash, content_hash], content_hash), Err)


@pytest.mark.parametrize("bad_hash", [b"", b"\x01" * 31, b"\x01" * 33])
def test_wrong_length_hash_is_err(bad_hash: bytes) -> None:
    good_hash = file_hash(b"valid file")
    assert isinstance(build_root([good_hash, bad_hash]), Err)
    assert isinstance(build_proof([good_hash, bad_hash], good_hash), Err)
    assert verify_proof([], bad_hash, bad_hash) is False


def test_missing_target_is_err() -> None:
    hashes = [file_hash(b"first"), file_hash(b"second")]
    assert isinstance(build_proof(hashes, file_hash(b"not in the set")), Err)
