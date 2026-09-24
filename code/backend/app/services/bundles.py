# =============================================================================
# Proof of Aid — Team 05 — Evidence bundles: one Merkle root per onchain index
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Evidence bundles (spec F3/F4, P3.3; memory.md "Evidence manifest (P5.4)").

Onchain, `evidenceRoots(claimId)` is a list: index 0 is the original evidence
anchored with the claim, and every `submitProof` appends one supplementary
root (`ProofSubmitted.rootIndex`). The backend therefore groups files by
`root_index` and computes one root per group with the shared P1.3 recipe —
never one root over all files, which would match nothing onchain.

Bundle rules for a new upload (`check_bundle_target`):
- no gaps: a file may target at most the current highest index + 1;
- sealed bundles: once a higher bundle exists, earlier bundles are already
  anchored, so adding to them would silently change a root the chain holds.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from poa_shared.result import Err, Ok, Result

from app.models import EvidenceFile
from app.services.claims import build_evidence_root


@dataclass(frozen=True, slots=True)
class EvidenceBundle:
    """The files of one onchain root, sorted by fingerprint, with that root."""

    root_index: int
    evidence_root: str
    files: tuple[EvidenceFile, ...]


def check_bundle_target(highest_index: int | None, requested_index: int) -> Result[int]:
    """Return `Ok(requested_index)` when an upload may go into that bundle.

    `highest_index` is the claim's current highest `root_index` (None when the
    claim holds no files yet, so only bundle 0 can be opened).
    """
    if requested_index < 0:
        return Err("root_index must be 0 or greater")
    next_free = 0 if highest_index is None else highest_index + 1
    if requested_index > next_free:
        return Err(f"root_index {requested_index} would leave a gap: the next bundle is {next_free}")
    if highest_index is not None and requested_index < highest_index:
        return Err(f"bundle {requested_index} is sealed: bundle {highest_index} already exists")
    accepted: Result[int] = Ok(requested_index)
    return accepted


def highest_root_index(files: Sequence[EvidenceFile]) -> int | None:
    """Return the highest bundle index among `files`, or None when empty."""
    highest = max((item.root_index for item in files), default=None)
    return highest


def bundle_root(files: Sequence[EvidenceFile]) -> Result[str]:
    """Return the `0x` Merkle root of one bundle's files (shared P1.3 recipe)."""
    hashes = [bytes.fromhex(item.sha256_hex.removeprefix("0x")) for item in files]
    root = build_evidence_root(hashes)
    if isinstance(root, Err):
        return root
    hexed: Result[str] = Ok(f"0x{root.value.hex()}")
    return hexed


def build_bundles(files: Sequence[EvidenceFile]) -> Result[list[EvidenceBundle]]:
    """Group a claim's files by `root_index`, ascending, each with its own root.

    Files inside a bundle are ordered by fingerprint: the Merkle recipe sorts
    leaves anyway, and upload order would only leak timing to the public.
    """
    grouped: dict[int, list[EvidenceFile]] = {}
    for item in files:
        grouped.setdefault(item.root_index, []).append(item)
    bundles: list[EvidenceBundle] = []
    for index in sorted(grouped):
        members = tuple(sorted(grouped[index], key=lambda item: item.sha256_hex))
        root = bundle_root(members)
        if isinstance(root, Err):
            return root
        bundles.append(EvidenceBundle(root_index=index, evidence_root=root.value, files=members))
    built: Result[list[EvidenceBundle]] = Ok(bundles)
    return built
