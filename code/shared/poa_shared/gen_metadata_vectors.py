# =============================================================================
# Proof of Aid — Team 05 — Deterministic generator for metadata-vectors.json
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Write the shared metadata vectors: `python -m poa_shared.gen_metadata_vectors`.

The backend (which anchors `metadataHash`) and the public page (which recomputes
it from the API's title and description) must agree on every case. The texts
are made up and contain no personal data.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Final

from poa_shared.gen_vectors import to_hex, unwrap
from poa_shared.merkle import keccak256
from poa_shared.metadata import canonical_metadata, metadata_hash
from poa_shared.result import Err

VECTORS_PATH: Final[Path] = Path(__file__).resolve().parent.parent / "metadata-vectors.json"


def claim_id(uuid_text: str) -> bytes:
    """The onchain claim id: keccak256 of the backend's UUID string."""
    hashed = keccak256(uuid_text.encode("utf-8"))
    return hashed


CLAIM_1: Final[bytes] = claim_id("00000000-0000-4000-8000-000000000001")
CLAIM_2: Final[bytes] = claim_id("00000000-0000-4000-8000-000000000002")

FOOD_KITS: Final[dict[str, str]] = {
    "title": "500 food kits delivered",
    "description": "Food kits for 500 households, distributed at the district X warehouse.",
    "location_region": "District X",
    "claim_date": "2026-09-14",
}

# (name, fields, claim id). The last case reuses the first case's text for another claim.
CASES: Final[list[tuple[str, dict[str, str], bytes]]] = [
    ("ascii", FOOD_KITS, CLAIM_1),
    (
        "multiline_description",
        {
            "title": "Water tanks installed",
            "description": "40 water tanks installed in camp B.\n\nChecked by the site lead:\n- 38 working\n- 2 leaking",
            "location_region": "Camp B",
            "claim_date": "2026-02-28",
        },
        CLAIM_1,
    ),
    (
        "unicode",
        {
            "title": "Kits de higiene — Región Norte",
            "description": "Entrega de 350 kits (jabón, toallas) · 中文说明 · agua potable 🚰",
            "location_region": "Región Norte",
            "claim_date": "2026-01-05",
        },
        CLAIM_1,
    ),
    ("same_text_other_claim", FOOD_KITS, CLAIM_2),
]

# (name, fields, claim id, why the recipe rejects it).
INVALID: Final[list[tuple[str, dict[str, str], bytes, str]]] = [
    ("title_with_line_feed", {**FOOD_KITS, "title": "500 food kits\ndelivered"}, CLAIM_1, "title must be a single line"),
    (
        "region_with_line_feed",
        {**FOOD_KITS, "location_region": "District\nX"},
        CLAIM_1,
        "location_region must be a single line",
    ),
    ("empty_title", {**FOOD_KITS, "title": ""}, CLAIM_1, "empty field"),
    ("not_a_date", {**FOOD_KITS, "claim_date": "2026-02-30"}, CLAIM_1, "claim_date is not a real date"),
    ("short_claim_id", FOOD_KITS, CLAIM_1[:31], "claim id is not 32 bytes"),
]

SPEC: Final[dict[str, str]] = {
    "hash": "metadataHash = keccak256(preimage) (Ethereum keccak256, not NIST SHA3-256), anchored by anchorClaim.",
    "preimage": (
        'UTF-8 of title + "\\n" + description + "\\n" + location_region + "\\n" + claim_date + "\\n" + '
        "claim_id_hex, with no Unicode normalization."
    ),
    "fields": (
        "The strings exactly as the API serves them (the backend trims surrounding whitespace once, before storing "
        "and hashing). claim_date is YYYY-MM-DD; claim_id_hex is the 32-byte claim id as 64 lowercase hex "
        "characters without 0x (the claim the page is showing, read from the chain, never from the server)."
    ),
    "single_line": (
        "title and location_region must not contain a line feed; only description may span lines, so the "
        "preimage splits back into exactly one set of fields."
    ),
    "invalid": "Every invalid case must be rejected: no hash is computed for it.",
    "encoding": "Byte values are lowercase 0x-prefixed hex strings.",
}


def build_case(name: str, fields: dict[str, str], claim: bytes) -> dict[str, Any]:
    """Return one valid case with its preimage and hash."""
    case = {
        "name": name,
        **fields,
        "claim_id": to_hex(claim),
        "preimage_hex": to_hex(unwrap(canonical_metadata(**fields, claim_id=claim))),
        "metadata_hash": to_hex(unwrap(metadata_hash(**fields, claim_id=claim))),
    }
    return case


def build_invalid(name: str, fields: dict[str, str], claim: bytes, reason: str) -> dict[str, Any]:
    """Return one invalid case; generation fails if the recipe would accept it."""
    if not isinstance(canonical_metadata(**fields, claim_id=claim), Err):
        raise ValueError(f"invalid vector {name} was accepted")
    case = {"name": name, **fields, "claim_id": to_hex(claim), "reason": reason}
    return case


def build_vectors() -> dict[str, Any]:
    """Return the full vectors document."""
    vectors = {
        "spec": SPEC,
        "cases": [build_case(name, fields, claim) for name, fields, claim in CASES],
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
