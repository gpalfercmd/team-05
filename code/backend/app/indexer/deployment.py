# =============================================================================
# Proof of Aid — Team 05 — Deployment file reader (addresses + deploy block)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Which contracts to index (memory.md: "Deployment files").

The Foundry scripts write `code/shared/deployments/<network>.json` and
`record_transactions.py` fixes `deployBlock` to the first deployment receipt's
L2 block. The backend reads only `chainId`, `participantRegistry`,
`claimRegistry` and `deployBlock`; the transaction lists are ignored.
Addresses are lowercased because every address the backend stores or compares
is lowercase (`services.auth.normalize_address`).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from poa_shared.result import Err, Ok, Result

ADDRESS_PATTERN: Final[re.Pattern[str]] = re.compile(r"^0x[0-9a-fA-F]{40}$")


class DeploymentConfigError(RuntimeError):
    """Startup failure: `DEPLOYMENT_FILE` is configured but unusable."""


@dataclass(frozen=True, slots=True)
class Deployment:
    """One deployment of both registries on one chain."""

    chain_id: int
    participant_registry: str
    claim_registry: str
    deploy_block: int

    @property
    def contracts_key(self) -> str:
        """Identify the contract pair in `sync_state` (`participant,claim`)."""
        key = f"{self.participant_registry},{self.claim_registry}"
        return key


def load_deployment(path: str | Path) -> Result[Deployment]:
    """Read and validate a deployment file; `Err` names the first problem."""
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except OSError as cause:
        return Err(f"cannot read deployment file {path}", cause)
    except json.JSONDecodeError as cause:
        return Err(f"deployment file {path} is not valid JSON", cause)
    parsed = parse_deployment(raw)
    return parsed


def parse_deployment(raw: object) -> Result[Deployment]:
    """Validate the fields the backend needs from an already-parsed document."""
    if not isinstance(raw, dict):
        return Err("deployment file must be a JSON object")
    chain_id = raw.get("chainId")
    deploy_block = raw.get("deployBlock")
    participant = raw.get("participantRegistry")
    claim = raw.get("claimRegistry")
    # bool is an int subclass in Python; `true` must not pass as chain id 1.
    if not isinstance(chain_id, int) or isinstance(chain_id, bool) or chain_id <= 0:
        return Err("deployment chainId must be a positive integer")
    if not isinstance(deploy_block, int) or isinstance(deploy_block, bool) or deploy_block < 0:
        return Err("deployment deployBlock must be a non-negative integer")
    if not isinstance(participant, str) or not ADDRESS_PATTERN.fullmatch(participant):
        return Err("deployment participantRegistry must be a 0x address")
    if not isinstance(claim, str) or not ADDRESS_PATTERN.fullmatch(claim):
        return Err("deployment claimRegistry must be a 0x address")
    deployment: Result[Deployment] = Ok(
        Deployment(
            chain_id=chain_id,
            participant_registry=participant.lower(),
            claim_registry=claim.lower(),
            deploy_block=deploy_block,
        )
    )
    return deployment
