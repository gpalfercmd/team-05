# =============================================================================
# Proof of Aid — Team 05 — Deterministic generator for merkle-vectors.json
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Write the shared Merkle test vectors: `python -m poa_shared.gen_vectors`.

Every layer (Solidity, Python, TypeScript) must reproduce these roots and proofs.
File contents are made up and contain no personal data.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Final, TypeVar

from poa_shared.merkle import build_proof, build_root, file_hash, leaf_from_file_hash
from poa_shared.result import Err, Result

T = TypeVar("T")

VECTORS_PATH: Final[Path] = Path(__file__).resolve().parent.parent / "merkle-vectors.json"

RECEIPT: Final[tuple[str, bytes]] = ("receipt-001.txt", b"receipt-001: 500 food kits, district X")
INVOICE: Final[tuple[str, bytes]] = ("invoice-7781.txt", b"invoice-7781: rice 2t")
PHOTO: Final[tuple[str, bytes]] = (
    "photo-warehouse.jpg",
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + bytes(range(16)) + b"\xff\xd9",
)
DELIVERY: Final[tuple[str, bytes]] = ("delivery-note-12.txt", b"delivery-note-12: 40 water tanks, camp B")
STOCK: Final[tuple[str, bytes]] = ("stock-report-q3.csv", b"item,qty\nblankets,1200\nhygiene kits,350\n")

CASES: Final[list[tuple[str, list[tuple[str, bytes]]]]] = [
    ("one_file", [RECEIPT]),
    ("two_files", [RECEIPT, INVOICE]),
    ("three_files", [RECEIPT, INVOICE, PHOTO]),
    ("four_files", [RECEIPT, INVOICE, PHOTO, DELIVERY]),
    ("five_files", [RECEIPT, INVOICE, PHOTO, DELIVERY, STOCK]),
    ("order_independence", [STOCK, PHOTO, RECEIPT, DELIVERY, INVOICE]),
]

TAMPER_CASE: Final[str] = "three_files"
TAMPER_FILE_INDEX: Final[int] = 0

SPEC: Final[dict[str, str]] = {
    "file_hash": "SHA-256 over the raw file bytes (32 bytes).",
    "leaf": "keccak256(file_hash) over the 32 raw bytes (Ethereum keccak256, not NIST SHA3-256).",
    "node": "keccak256(min(a, b) || max(a, b)): sorted-pair (commutative) hashing of a 64-byte input.",
    "ordering": "Leaves sorted ascending as raw bytes before building; input order never changes the root.",
    "odd": "An odd last node at any level is promoted unchanged; its proof gets no sibling at that level.",
    "single": "The root of a single leaf is that leaf and its proof is empty.",
    "invalid": "Empty input, duplicate files and hashes that are not 32 bytes are rejected.",
    "proof": "Sibling hashes bottom-up; verifies with OpenZeppelin MerkleProof.verify(proof, root, leaf).",
    "encoding": "Byte values are lowercase 0x-prefixed hex strings.",
    "shape": (
        "case_count and cases[i].file_count are helper counts for Foundry's JSON parser; "
        "cases[i].files keep the input order (unsorted); tamper reuses the proof and root of "
        "tamper.case for a file with one flipped byte and must not verify."
    ),
}


def to_hex(value: bytes) -> str:
    """Return `value` as a lowercase 0x-prefixed hex string."""
    encoded = "0x" + value.hex()
    return encoded


def unwrap(result: Result[T]) -> T:
    """Return the value of an Ok result; the generator's fixed inputs must never fail."""
    if isinstance(result, Err):
        raise ValueError(f"vector generation failed: {result.message}")
    value = result.value
    return value


def build_case(name: str, files: list[tuple[str, bytes]]) -> dict[str, Any]:
    """Return one vector case: its root plus every file's hashes and proof."""
    hashes = [file_hash(content) for _, content in files]
    entries = [
        {
            "name": file_name,
            "content_hex": to_hex(content),
            "sha256": to_hex(content_hash),
            "leaf": to_hex(leaf_from_file_hash(content_hash)),
            "proof": [to_hex(node) for node in unwrap(build_proof(hashes, content_hash))],
        }
        for (file_name, content), content_hash in zip(files, hashes, strict=True)
    ]
    case = {"name": name, "root": to_hex(unwrap(build_root(hashes))), "file_count": len(files), "files": entries}
    return case


def build_tamper(cases: list[dict[str, Any]]) -> dict[str, Any]:
    """Return the tamper section: one flipped byte in a file must break its proof."""
    source_case = next(case for case in cases if case["name"] == TAMPER_CASE)
    source_file = source_case["files"][TAMPER_FILE_INDEX]
    original = bytes.fromhex(source_file["content_hex"][2:])
    tampered = bytes([original[0] ^ 0x01]) + original[1:]
    tampered_hash = file_hash(tampered)
    tamper = {
        "case": TAMPER_CASE,
        "file_index": TAMPER_FILE_INDEX,
        "tampered_content_hex": to_hex(tampered),
        "tampered_sha256": to_hex(tampered_hash),
        "tampered_leaf": to_hex(leaf_from_file_hash(tampered_hash)),
        "proof": source_file["proof"],
        "root": source_case["root"],
        "must_verify": False,
    }
    return tamper


def build_vectors() -> dict[str, Any]:
    """Return the full vectors document."""
    cases = [build_case(name, files) for name, files in CASES]
    vectors = {"spec": SPEC, "case_count": len(cases), "cases": cases, "tamper": build_tamper(cases)}
    return vectors


def render_vectors() -> str:
    """Return the vectors document as stable, pretty-printed JSON text."""
    text = json.dumps(build_vectors(), indent=2) + "\n"
    return text


def main() -> None:
    """Write the vectors file next to the package."""
    VECTORS_PATH.write_text(render_vectors(), encoding="utf-8")
    print(f"wrote {VECTORS_PATH}")


if __name__ == "__main__":
    main()
