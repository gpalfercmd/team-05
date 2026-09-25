# =============================================================================
# Proof of Aid — Team 05 — Deterministic generator for note-vectors.json
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Write the shared note vectors: `python -m poa_shared.gen_note_vectors`.

The role screens (which hash a note before the transaction) and the backend
(which checks the hash before storing the note) must agree on every case. The
salts are fixed here only so the file is reproducible; real salts are random.
The notes are made up and contain no personal data.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Final

from poa_shared.gen_vectors import to_hex, unwrap
from poa_shared.notes import legacy_note_hash, note_hash, note_preimage
from poa_shared.result import Err

VECTORS_PATH: Final[Path] = Path(__file__).resolve().parent.parent / "note-vectors.json"

SALT_1: Final[bytes] = bytes(range(32))
SALT_2: Final[bytes] = bytes([0xFF] * 32)

# (name, salt, text). The first two share a text: different salts give unrelated fingerprints.
CASES: Final[list[tuple[str, bytes, str]]] = [
    ("short_note", SALT_1, "approved"),
    ("same_text_other_salt", SALT_2, "approved"),
    ("proof_request", SALT_1, "missing receipt"),
    (
        "unicode_multiline",
        SALT_2,
        "Recibos revisados — 3 faltan.\nSegunda línea: 中文 · agua 🚰",
    ),
]

# (name, salt, text, why the recipe rejects it).
INVALID: Final[list[tuple[str, bytes, str, str]]] = [
    ("short_salt", SALT_1[:31], "approved", "salt is not 32 bytes"),
    ("long_salt", SALT_1 + b"\x00", "approved", "salt is not 32 bytes"),
    ("empty_text", SALT_1, "", "empty note"),
]

SPEC: Final[dict[str, str]] = {
    "hash": (
        "noteHash = keccak256(salt || utf8(text)) (Ethereum keccak256, not NIST SHA3-256): the bytes32 anchored "
        "as justificationHash, requestHash, counterEvidenceHash or the dispute resolution's justificationHash."
    ),
    "salt": "32 random bytes chosen by the author's browser for every note; never reused, never published.",
    "text": (
        "The note exactly as written (the app trims surrounding whitespace once, before hashing), UTF-8, no Unicode "
        "normalization. An empty text is rejected."
    ),
    "legacy": (
        "Notes anchored before P10.3 are unsalted: legacy_hash = keccak256(utf8(text)), which a guess can confirm. "
        "They stay as they are."
    ),
    "invalid": "Every invalid case must be rejected: no hash is computed for it.",
    "encoding": "Byte values are lowercase 0x-prefixed hex strings.",
}


def build_case(name: str, salt: bytes, text: str) -> dict[str, Any]:
    """Return one valid case with its preimage, salted hash and legacy hash."""
    case = {
        "name": name,
        "salt": to_hex(salt),
        "text": text,
        "preimage_hex": to_hex(unwrap(note_preimage(salt, text))),
        "note_hash": to_hex(unwrap(note_hash(salt, text))),
        "legacy_hash": to_hex(legacy_note_hash(text)),
    }
    return case


def build_invalid(name: str, salt: bytes, text: str, reason: str) -> dict[str, Any]:
    """Return one invalid case; generation fails if the recipe would accept it."""
    if not isinstance(note_hash(salt, text), Err):
        raise ValueError(f"invalid vector {name} was accepted")
    case = {"name": name, "salt": to_hex(salt), "text": text, "reason": reason}
    return case


def build_vectors() -> dict[str, Any]:
    """Return the full vectors document."""
    vectors = {
        "spec": SPEC,
        "cases": [build_case(*entry) for entry in CASES],
        "invalid": [build_invalid(*entry) for entry in INVALID],
    }
    return vectors


def render_vectors() -> str:
    """Return the vectors document as stable, pretty-printed JSON text (UTF-8, not escaped)."""
    text = json.dumps(build_vectors(), indent=2, ensure_ascii=False) + "\n"
    return text


def main() -> None:
    """Write the vectors file next to the package."""
    VECTORS_PATH.write_text(render_vectors(), encoding="utf-8")
    print(f"wrote {VECTORS_PATH}")


if __name__ == "__main__":
    main()
