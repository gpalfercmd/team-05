# =============================================================================
# Proof of Aid — Team 05 — Synthetic chain for indexer tests (no network)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""A fake `ChainReader` whose logs are ABI-encoded from the frozen ABIs.

`FakeChain.tx(...)` mines one block holding one transaction with the given
events, encoded exactly as the EVM would (indexed params in topics, the rest
ABI-encoded in `data`), so the real decoder, projections and sync loop run
unchanged. `max_range` makes `eth_getLogs` refuse wide ranges like a public
RPC; `fail_logs` makes it fail outright.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from eth_abi import encode as abi_encode
from eth_utils import keccak

from poa_shared.result import Err, Ok, Result

from app.indexer.abi import EventCatalog, EventSpec, RawLog, load_catalog
from app.indexer.deployment import Deployment

CHAIN_ID: Final[int] = 31337
PARTICIPANT_REGISTRY: Final[str] = "0x" + "11" * 20
CLAIM_REGISTRY: Final[str] = "0x" + "22" * 20
DEPLOY_BLOCK: Final[int] = 10
GENESIS_TIME: Final[int] = 1_790_000_000
BLOCK_SECONDS: Final[int] = 12

STATUS: Final[dict[str, int]] = {
    "None": 0,
    "Anchored": 1,
    "InternallyVerified": 2,
    "ProofRequested": 3,
    "ProofSubmitted": 4,
    "Verified": 5,
    "Rejected": 6,
    "Disputed": 7,
}


def catalog() -> EventCatalog:
    """The real catalog from `code/shared/abi/` (fails the test if unreadable)."""
    loaded = load_catalog()
    assert not isinstance(loaded, Err), loaded
    return loaded.value


def deployment(chain_id: int = CHAIN_ID) -> Deployment:
    """A fake deployment with fixed registry addresses."""
    return Deployment(
        chain_id=chain_id,
        participant_registry=PARTICIPANT_REGISTRY,
        claim_registry=CLAIM_REGISTRY,
        deploy_block=DEPLOY_BLOCK,
    )


def write_deployment(directory: Path) -> Path:
    """Deployment file for the fake chain (same shape the Foundry scripts write)."""
    path = directory / "deployment.json"
    path.write_text(
        json.dumps(
            {
                "chainId": CHAIN_ID,
                "participantRegistry": PARTICIPANT_REGISTRY,
                "claimRegistry": CLAIM_REGISTRY,
                "deployBlock": DEPLOY_BLOCK,
            }
        )
    )
    return path


def hash32(label: str) -> str:
    """Deterministic bytes32 hex for test hashes and claim ids."""
    return "0x" + keccak(text=label).hex()


def _spec(events: dict[bytes, EventSpec], name: str) -> EventSpec:
    """Find an event spec by name."""
    return next(spec for spec in events.values() if spec.name == name)


def _abi_value(kind: str, value: object) -> object:
    """Hex strings for bytes32 become bytes; everything else is encoded as given."""
    if kind == "bytes32" and isinstance(value, str):
        return bytes.fromhex(value.removeprefix("0x"))
    return value


def encode_log(
    events: dict[bytes, EventSpec],
    address: str,
    name: str,
    args: dict[str, object],
    *,
    block: int,
    tx_hash: str,
    log_index: int,
) -> RawLog:
    """ABI-encode one event log from the frozen ABI."""
    spec = _spec(events, name)
    topics = [spec.topic0]
    data_types: list[str] = []
    data_values: list[object] = []
    for arg_name, kind, indexed in spec.inputs:
        value = _abi_value(kind, args[arg_name])
        if indexed:
            topics.append(abi_encode([kind], [value]))
        else:
            data_types.append(kind)
            data_values.append(value)
    return RawLog(
        address=address,
        topics=tuple(topics),
        data=abi_encode(data_types, data_values),
        block_number=block,
        tx_hash=tx_hash,
        log_index=log_index,
    )


@dataclass
class FakeChain:
    """In-memory chain implementing `ChainReader`."""

    events: EventCatalog
    target: Deployment
    head_block: int = DEPLOY_BLOCK
    chain: int = CHAIN_ID
    max_range: int | None = None
    fail_logs: bool = False
    stored: list[RawLog] = field(default_factory=list)
    log_calls: list[tuple[int, int]] = field(default_factory=list)
    timestamp_calls: int = 0

    def tx(self, *items: tuple[str, str, dict[str, object]]) -> str:
        """Mine a block with one transaction emitting `items` (contract kind, name, args)."""
        self.head_block += 1
        tx_hash = hash32(f"tx-{self.head_block}")
        for index, (kind, name, args) in enumerate(items):
            specs = self.events.participant_events if kind == "participant" else self.events.claim_events
            address = self.target.participant_registry if kind == "participant" else self.target.claim_registry
            self.stored.append(
                encode_log(specs, address, name, args, block=self.head_block, tx_hash=tx_hash, log_index=index)
            )
        return tx_hash

    def mine_empty(self, count: int = 1) -> None:
        """Advance the head without events."""
        self.head_block += count

    # --- ChainReader ---

    def chain_id(self) -> Result[int]:
        return Ok(self.chain)

    def head(self) -> Result[int]:
        return Ok(self.head_block)

    def block_timestamp(self, block_number: int) -> Result[int]:
        self.timestamp_calls += 1
        return Ok(GENESIS_TIME + block_number * BLOCK_SECONDS)

    def logs(
        self, addresses: list[str], topics: list[bytes], from_block: int, to_block: int
    ) -> Result[list[RawLog]]:
        self.log_calls.append((from_block, to_block))
        if self.fail_logs:
            return Err("eth_getLogs failed", ConnectionError("connection refused"))
        if self.max_range is not None and to_block - from_block + 1 > self.max_range:
            return Err("eth_getLogs failed", ValueError("query exceeds max block range"))
        wanted = set(topics)
        return Ok(
            [
                log
                for log in self.stored
                if log.address in addresses
                and from_block <= log.block_number <= to_block
                and log.topics[0] in wanted
            ]
        )


def participant(name: str, **args: object) -> tuple[str, str, dict[str, object]]:
    """A ParticipantRegistry event item for `FakeChain.tx`."""
    return ("participant", name, dict(args))


def claim_event(name: str, **args: object) -> tuple[str, str, dict[str, object]]:
    """A ClaimRegistry event item for `FakeChain.tx`."""
    return ("claim", name, dict(args))


def status(claim_id: str, before: str, after: str) -> tuple[str, str, dict[str, object]]:
    """A `StatusChanged` item (emitted after the action-specific event)."""
    return claim_event("StatusChanged", claimId=claim_id, **{"from": STATUS[before], "to": STATUS[after]})


def accredit_cast(chain: FakeChain, admin: str, authority: str, cast: dict[str, str]) -> None:
    """Register `org` with verifiers `verifier`/`verifier2` and auditors `auditor`/`outsider`."""
    chain.tx(participant("OrganizationRegistered", organization=cast["org"], registryAdmin=admin))
    for name in ("verifier", "verifier2"):
        chain.tx(
            participant(
                "InternalVerifierRegistered",
                verifier=cast[name],
                organization=cast["org"],
                registryAdmin=admin,
            )
        )
    for name in ("auditor", "outsider"):
        if name in cast:
            chain.tx(participant("AuditorAccredited", auditor=cast[name], authority=authority))


def full_story(chain: FakeChain, claim_id: str, cast: dict[str, str], authority: str) -> None:
    """The DemoLifecycle story: anchor → … → dispute dismissed; ends Verified with 2 roots."""
    org, auditor = cast["org"], cast["auditor"]
    chain.tx(
        claim_event(
            "ClaimAnchored",
            claimId=claim_id,
            organization=org,
            evidenceRoot=hash32("root-0"),
            metadataHash=hash32("metadata"),
        ),
        status(claim_id, "None", "Anchored"),
    )
    chain.tx(
        claim_event(
            "InternalAttestation",
            claimId=claim_id,
            verifier=cast["verifier"],
            approved=True,
            justificationHash=hash32("j1"),
        ),
        status(claim_id, "Anchored", "InternallyVerified"),
    )
    chain.tx(
        claim_event(
            "AuditorAssigned", claimId=claim_id, auditor=auditor, previousAuditor="0x" + "00" * 20
        )
    )
    chain.tx(
        claim_event("ProofRequested", claimId=claim_id, auditor=auditor, requestHash=hash32("req")),
        status(claim_id, "InternallyVerified", "ProofRequested"),
    )
    chain.tx(
        claim_event(
            "ProofSubmitted",
            claimId=claim_id,
            organization=org,
            supplementaryRoot=hash32("root-1"),
            rootIndex=1,
        ),
        status(claim_id, "ProofRequested", "ProofSubmitted"),
    )
    chain.tx(
        claim_event(
            "ProofReviewed",
            claimId=claim_id,
            verifier=cast["verifier2"],
            accepted=True,
            justificationHash=hash32("j2"),
        ),
        status(claim_id, "ProofSubmitted", "InternallyVerified"),
    )
    chain.tx(
        claim_event(
            "FinalAttestation",
            claimId=claim_id,
            auditor=auditor,
            approved=True,
            justificationHash=hash32("j3"),
        ),
        status(claim_id, "InternallyVerified", "Verified"),
    )
    chain.tx(
        claim_event(
            "DisputeOpened",
            claimId=claim_id,
            disputant=cast["outsider"],
            counterEvidenceHash=hash32("counter"),
        ),
        status(claim_id, "Verified", "Disputed"),
    )
    chain.tx(
        claim_event(
            "DisputeResolved",
            claimId=claim_id,
            authority=authority,
            upheld=False,
            justificationHash=hash32("j4"),
        ),
        status(claim_id, "Disputed", "Verified"),
    )
