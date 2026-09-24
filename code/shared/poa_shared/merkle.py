# =============================================================================
# Proof of Aid — Team 05 — Merkle root, proof and verification for evidence files
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Normative Merkle recipe shared by Solidity, Python and TypeScript.

1. file_hash = SHA-256(file bytes).
2. leaf = keccak256(file_hash) over the 32 raw bytes (Ethereum keccak, not NIST SHA3).
3. Empty input and duplicate files are rejected.
4. Leaves are sorted ascending as raw bytes.
5. Pairs (0,1), (2,3), ... hash to keccak256(min(a, b) || max(a, b)); an odd last
   node is promoted unchanged to the next level.
6. The root of a single leaf is that leaf.
7. A proof lists sibling hashes bottom-up and skips promoted levels, so it
   verifies with OpenZeppelin `MerkleProof.verify(proof, root, leaf)`.
"""

from __future__ import annotations

import hashlib
from functools import reduce
from typing import Final

from Crypto.Hash import keccak

from poa_shared.result import Err, Ok, Result

HASH_LENGTH: Final[int] = 32


def keccak256(data: bytes) -> bytes:
    """Return the Ethereum keccak256 digest of `data`."""
    hasher = keccak.new(digest_bits=256)
    hasher.update(data)
    digest = hasher.digest()
    return digest


def file_hash(content: bytes) -> bytes:
    """Return the SHA-256 digest of a file's bytes."""
    digest = hashlib.sha256(content).digest()
    return digest


def leaf_from_file_hash(file_hash: bytes) -> bytes:
    """Return the Merkle leaf for a 32-byte file hash: keccak256(file_hash)."""
    leaf = keccak256(file_hash)
    return leaf


def build_root(file_hashes: list[bytes]) -> Result[bytes]:
    """Return the Merkle root of a set of file hashes, or Err on invalid input."""
    leaves = _sorted_leaves(file_hashes)
    if isinstance(leaves, Err):
        return leaves
    levels = _build_levels(leaves.value)
    root: Result[bytes] = Ok(levels[-1][0])
    return root


def build_proof(file_hashes: list[bytes], target_file_hash: bytes) -> Result[list[bytes]]:
    """Return the bottom-up sibling proof for `target_file_hash`, or Err on invalid input."""
    leaves = _sorted_leaves(file_hashes)
    if isinstance(leaves, Err):
        return leaves
    if target_file_hash not in file_hashes:
        return Err("target file hash is not part of the file set")
    levels = _build_levels(leaves.value)
    leaf_index = levels[0].index(leaf_from_file_hash(target_file_hash))
    proof: Result[list[bytes]] = Ok(_collect_siblings(levels, leaf_index))
    return proof


def verify_proof(proof: list[bytes], root: bytes, leaf: bytes) -> bool:
    """Return True when folding `proof` onto `leaf` with sorted-pair hashing yields `root`."""
    if not all(_is_hash(node) for node in [*proof, root, leaf]):
        return False
    computed_root = reduce(_node_hash, proof, leaf)
    is_valid = computed_root == root
    return is_valid


def _is_hash(value: object) -> bool:
    """Return True when `value` is exactly 32 raw bytes."""
    is_hash = isinstance(value, bytes) and len(value) == HASH_LENGTH
    return is_hash


def _node_hash(left: bytes, right: bytes) -> bytes:
    """Return keccak256(min(left, right) || max(left, right))."""
    low, high = sorted((left, right))
    node = keccak256(low + high)
    return node


def _sorted_leaves(file_hashes: list[bytes]) -> Result[list[bytes]]:
    """Validate the file hashes and return their leaves sorted ascending."""
    if not isinstance(file_hashes, list) or not file_hashes:
        return Err("at least one file hash is required")
    if not all(_is_hash(item) for item in file_hashes):
        return Err(f"every file hash must be exactly {HASH_LENGTH} bytes")
    if len(set(file_hashes)) != len(file_hashes):
        return Err("duplicate file hashes are not allowed")
    leaves: Result[list[bytes]] = Ok(sorted(leaf_from_file_hash(item) for item in file_hashes))
    return leaves


def _next_level(level: list[bytes]) -> list[bytes]:
    """Hash adjacent pairs; an odd last node is promoted unchanged."""
    parents = [_node_hash(level[i], level[i + 1]) for i in range(0, len(level) - 1, 2)]
    promoted = [level[-1]] if len(level) % 2 == 1 else []
    next_level = parents + promoted
    return next_level


def _build_levels(leaves: list[bytes]) -> list[list[bytes]]:
    """Return every tree level, from the sorted leaves up to the single root."""
    levels = [leaves]
    while len(levels[-1]) > 1:
        levels.append(_next_level(levels[-1]))
    return levels


def _collect_siblings(levels: list[list[bytes]], leaf_index: int) -> list[bytes]:
    """Walk up from `leaf_index`, appending each existing sibling (none when promoted)."""
    siblings: list[bytes] = []
    index = leaf_index
    for level in levels[:-1]:
        sibling_index = index ^ 1
        if sibling_index < len(level):
            siblings.append(level[sibling_index])
        index //= 2
    return siblings
