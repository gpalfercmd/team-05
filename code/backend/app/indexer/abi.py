# =============================================================================
# Proof of Aid — Team 05 — Event decoding with the frozen registry ABIs
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Turn raw logs into named events (P4.1).

The ABIs come from `code/shared/abi/` (the frozen P1 interface, the only
contract artifact other layers import). Only the interface events are
decoded: the implementations also emit OpenZeppelin `AccessControl` events
(`RoleAdminChanged`, `RoleGranted`, `RoleRevoked`), which are not part of the
interface and carry nothing the interface events do not, so the indexer never
even requests them (see `EventCatalog.topics`).

Decoding is done here with `eth-abi` rather than web3's contract objects so the
same code runs on synthetic logs in unit tests, and so every value is
normalized once into a JSON-safe form: addresses and bytes32 as lowercase
`0x` hex, booleans, and integers (enum values and `rootIndex`).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final, TypeAlias

from eth_abi.abi import decode as abi_decode
from eth_abi.exceptions import DecodingError
from eth_utils.crypto import keccak

from poa_shared.result import Err, Ok, Result

from app.indexer.deployment import Deployment

ABI_DIR: Final[Path] = Path(__file__).resolve().parents[3] / "shared" / "abi"
PARTICIPANT_ABI_FILE: Final[str] = "IParticipantRegistry.json"
CLAIM_ABI_FILE: Final[str] = "IClaimRegistry.json"
CLAIM_STATUS_FILE: Final[str] = "claim-status.json"

ArgValue: TypeAlias = str | int | bool


@dataclass(frozen=True, slots=True)
class RawLog:
    """One `eth_getLogs` entry, already normalized to lowercase hex strings."""

    address: str
    topics: tuple[bytes, ...]
    data: bytes
    block_number: int
    tx_hash: str
    log_index: int


@dataclass(frozen=True, slots=True)
class EventSpec:
    """ABI of one event: signature topic plus indexed and data parameters."""

    name: str
    topic0: bytes
    inputs: tuple[tuple[str, str, bool], ...]  # (name, type, indexed) in ABI order


@dataclass(frozen=True, slots=True)
class DecodedEvent:
    """A log with its event name and normalized arguments."""

    log: RawLog
    name: str
    args: dict[str, ArgValue]

    @property
    def claim_id_hex(self) -> str | None:
        """Every ClaimRegistry event carries `claimId`; participant events do not."""
        value = self.args.get("claimId")
        claim_id: str | None = value if isinstance(value, str) else None
        return claim_id


def _signature(entry: dict[str, object]) -> str:
    """Canonical `Name(type,...)` text whose keccak is the event topic."""
    inputs = entry.get("inputs", [])
    types = ",".join(str(item["type"]) for item in inputs) if isinstance(inputs, list) else ""
    signature = f"{entry['name']}({types})"
    return signature


def _event_specs(abi: list[dict[str, object]]) -> dict[bytes, EventSpec]:
    """Index an ABI's events by their signature topic."""
    specs: dict[bytes, EventSpec] = {}
    for entry in abi:
        if entry.get("type") != "event":
            continue
        raw_inputs = entry.get("inputs", [])
        inputs = tuple(
            (str(item["name"]), str(item["type"]), bool(item.get("indexed", False)))
            for item in (raw_inputs if isinstance(raw_inputs, list) else [])
        )
        topic0 = keccak(text=_signature(entry))
        specs[topic0] = EventSpec(name=str(entry["name"]), topic0=topic0, inputs=inputs)
    return specs


def _normalize(abi_type: str, value: object) -> ArgValue:
    """Map a decoded ABI value to its JSON-safe, lowercase form."""
    if isinstance(value, bytes):
        return "0x" + value.hex()
    if abi_type == "address" and isinstance(value, str):
        return value.lower()
    normalized: ArgValue = value if isinstance(value, (bool, int, str)) else str(value)
    return normalized


def _decode_with(spec: EventSpec, log: RawLog) -> Result[DecodedEvent]:
    """Decode indexed params from topics and the rest from `data`."""
    indexed = [(name, kind) for name, kind, is_indexed in spec.inputs if is_indexed]
    plain = [(name, kind) for name, kind, is_indexed in spec.inputs if not is_indexed]
    if len(log.topics) != len(indexed) + 1:
        return Err(f"{spec.name}: expected {len(indexed) + 1} topics, got {len(log.topics)}")
    values: dict[str, ArgValue] = {}
    try:
        for (name, kind), topic in zip(indexed, log.topics[1:], strict=True):
            values[name] = _normalize(kind, abi_decode([kind], topic)[0])
        decoded_data = abi_decode([kind for _, kind in plain], log.data)
    except (DecodingError, ValueError) as cause:
        return Err(f"{spec.name}: log does not match the ABI", cause)
    for (name, kind), value in zip(plain, decoded_data, strict=True):
        values[name] = _normalize(kind, value)
    decoded: Result[DecodedEvent] = Ok(DecodedEvent(log=log, name=spec.name, args=values))
    return decoded


@dataclass(frozen=True, slots=True)
class EventCatalog:
    """Interface events of both registries, and the status enum names."""

    participant_events: dict[bytes, EventSpec]
    claim_events: dict[bytes, EventSpec]
    status_names: tuple[str, ...]

    @property
    def topics(self) -> list[bytes]:
        """Every interface event topic, used as the `eth_getLogs` topic-0 filter."""
        known = list(self.participant_events) + list(self.claim_events)
        return known

    def decode(self, log: RawLog, deployment: Deployment) -> Result[DecodedEvent]:
        """Decode `log` with the ABI of the contract that emitted it."""
        if log.address == deployment.participant_registry:
            specs = self.participant_events
        elif log.address == deployment.claim_registry:
            specs = self.claim_events
        else:
            return Err(f"log from unexpected contract {log.address}")
        spec = specs.get(log.topics[0]) if log.topics else None
        if spec is None:
            return Err("log is not an interface event of its contract")
        decoded = _decode_with(spec, log)
        return decoded

    def status_name(self, value: ArgValue | None) -> str | None:
        """Map a `ClaimStatus` integer to its name (None when out of range)."""
        if isinstance(value, bool) or not isinstance(value, int):
            return None
        name = self.status_names[value] if 0 <= value < len(self.status_names) else None
        return name


def load_catalog(abi_dir: Path = ABI_DIR) -> Result[EventCatalog]:
    """Load both frozen ABIs and the status enum names from `code/shared/abi/`."""
    try:
        participant_abi = json.loads((abi_dir / PARTICIPANT_ABI_FILE).read_text(encoding="utf-8"))
        claim_abi = json.loads((abi_dir / CLAIM_ABI_FILE).read_text(encoding="utf-8"))
        statuses = json.loads((abi_dir / CLAIM_STATUS_FILE).read_text(encoding="utf-8"))
    except OSError as cause:
        return Err(f"cannot read the shared ABIs in {abi_dir}", cause)
    except json.JSONDecodeError as cause:
        return Err("a shared ABI file is not valid JSON", cause)
    names = statuses.get("values") if isinstance(statuses, dict) else None
    if not isinstance(participant_abi, list) or not isinstance(claim_abi, list):
        return Err("shared ABI files must be JSON arrays")
    if not isinstance(names, list) or not all(isinstance(item, str) for item in names):
        return Err("claim-status.json must list the enum names under 'values'")
    catalog: Result[EventCatalog] = Ok(
        EventCatalog(
            participant_events=_event_specs(participant_abi),
            claim_events=_event_specs(claim_abi),
            status_names=tuple(names),
        )
    )
    return catalog
