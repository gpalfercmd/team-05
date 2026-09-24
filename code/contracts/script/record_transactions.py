#!/usr/bin/env python3
# =============================================================================
# Proof of Aid — Team 05 — Records broadcast transaction hashes in the deployment file
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Merge a forge broadcast's transaction hashes into `code/shared/deployments/<network>.json`.

A Solidity script cannot know the hashes of the transactions it broadcasts, so this helper
runs after `forge script ... --broadcast`. It reads
`broadcast/<Script>.s.sol/<chainId>/run-latest.json` and adds:

- `deploymentTransactions`: one entry per contract creation (contract, address, txHash, blockNumber);
- `lifecycleTransactions`: one entry per registry call, labelled with the called function
  (`step`), plus `claimId` for ClaimRegistry calls.

Entries already present (same txHash) are kept once, so re-running is harmless and replays of
the demo accumulate. ETH top-ups of the demo wallets are not lifecycle steps and are skipped.
Standard library only; failures are returned as `Err` and reported with exit code 1.

Usage: python3 script/record_transactions.py Deploy.s.sol --chain-id 31337
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final, Generic, TypeAlias, TypeVar

T = TypeVar("T")

CONTRACTS_ROOT: Final[Path] = Path(__file__).resolve().parent.parent
DEPLOYMENTS_DIR: Final[Path] = CONTRACTS_ROOT.parent / "shared" / "deployments"
NETWORK_NAMES: Final[dict[int, str]] = {31337: "anvil", 421614: "arbitrum-sepolia"}
SUCCESS_STATUS: Final[str] = "0x1"
TRANSACTION_LISTS: Final[tuple[str, str]] = ("deploymentTransactions", "lifecycleTransactions")

JsonObject: TypeAlias = dict[str, Any]


@dataclass(frozen=True, slots=True)
class Ok(Generic[T]):
    """Successful outcome carrying its value."""

    value: T


@dataclass(frozen=True, slots=True)
class Err:
    """Failed outcome with a human-readable reason and an optional cause."""

    message: str
    cause: Exception | None = None


Result: TypeAlias = Ok[T] | Err


@dataclass(frozen=True, slots=True)
class Recorded:
    """Transactions extracted from one broadcast."""

    deployments: list[JsonObject]
    lifecycle: list[JsonObject]
    skipped_transfers: int


def network_name(chain_id: int) -> str:
    """Return the deployment file stem for `chain_id` (`anvil`, `arbitrum-sepolia`, or the id)."""
    name = NETWORK_NAMES.get(chain_id, str(chain_id))
    return name


def load_json(path: Path) -> Result[JsonObject]:
    """Read a JSON object from `path`."""
    if not path.is_file():
        return Err(f"file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        return Err(f"cannot read JSON from {path}", error)
    if not isinstance(data, dict):
        return Err(f"expected a JSON object in {path}")
    loaded: Result[JsonObject] = Ok(data)
    return loaded


def write_json(path: Path, data: JsonObject) -> Result[Path]:
    """Write `data` to `path` atomically (temporary file in the same folder, then rename)."""
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False
        ) as handle:
            handle.write(json.dumps(data, indent=2) + "\n")
            temporary = Path(handle.name)
        os.replace(temporary, path)
    except OSError as error:
        return Err(f"cannot write {path}", error)
    written: Result[Path] = Ok(path)
    return written


def extract_transactions(broadcast: JsonObject, deployment: JsonObject) -> Result[Recorded]:
    """Classify the broadcast's transactions against the deployment's two registries."""
    transactions = broadcast.get("transactions")
    receipts = broadcast.get("receipts")
    if not isinstance(transactions, list) or not isinstance(receipts, list):
        return Err("broadcast has no transactions/receipts lists (was it run with --broadcast?)")
    blocks = _successful_blocks(receipts)
    if isinstance(blocks, Err):
        return blocks
    registries = _registry_addresses(deployment)
    if isinstance(registries, Err):
        return registries
    missing = [tx.get("hash") for tx in transactions if tx.get("hash") not in blocks.value]
    if missing:
        return Err(f"transactions without a successful receipt: {missing}")
    classified = [_classify(tx, blocks.value[tx["hash"]], registries.value) for tx in transactions]
    errors = [outcome for outcome in classified if isinstance(outcome, Err)]
    if errors:
        return errors[0]
    entries = [outcome.value for outcome in classified if isinstance(outcome, Ok)]
    recorded: Result[Recorded] = Ok(
        Recorded(
            deployments=[entry for kind, entry in entries if kind == "deployment"],
            lifecycle=[entry for kind, entry in entries if kind == "lifecycle"],
            skipped_transfers=sum(1 for kind, _ in entries if kind == "transfer"),
        )
    )
    return recorded


def merge(deployment: JsonObject, recorded: Recorded) -> JsonObject:
    """Return `deployment` with the new entries appended to its two lists (deduplicated by txHash)."""
    merged = dict(deployment)
    merged["deploymentTransactions"] = _append_new(
        deployment.get("deploymentTransactions"), recorded.deployments
    )
    merged["lifecycleTransactions"] = _append_new(deployment.get("lifecycleTransactions"), recorded.lifecycle)
    return merged


def record(script: str, chain_id: int) -> Result[str]:
    """Merge `broadcast/<script>/<chain_id>/run-latest.json` into the network's deployment file."""
    script_name = Path(script).name
    broadcast_path = CONTRACTS_ROOT / "broadcast" / script_name / str(chain_id) / "run-latest.json"
    deployment_path = DEPLOYMENTS_DIR / f"{network_name(chain_id)}.json"
    broadcast = load_json(broadcast_path)
    if isinstance(broadcast, Err):
        return broadcast
    deployment = load_json(deployment_path)
    if isinstance(deployment, Err):
        return deployment
    if broadcast.value.get("chain") != chain_id or deployment.value.get("chainId") != chain_id:
        return Err(f"chain id mismatch: expected {chain_id} in {broadcast_path} and {deployment_path}")
    recorded = extract_transactions(broadcast.value, deployment.value)
    if isinstance(recorded, Err):
        return recorded
    merged = merge(deployment.value, recorded.value)
    written = write_json(deployment_path, merged)
    if isinstance(written, Err):
        return written
    added = {key: _count(merged[key]) - _count(deployment.value.get(key)) for key in TRANSACTION_LISTS}
    summary: Result[str] = Ok(
        f"{deployment_path.name}: +{added['deploymentTransactions']} deployment, "
        f"+{added['lifecycleTransactions']} lifecycle transactions from {script_name} "
        f"({recorded.value.skipped_transfers} wallet top-ups skipped, already recorded ones kept once)"
    )
    return summary


def main(argv: list[str] | None = None) -> int:
    """CLI entry point: exit code 0 on success, 1 on any recorded error."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("script", help="forge script file, e.g. Deploy.s.sol or DemoLifecycle.s.sol")
    parser.add_argument("--chain-id", type=int, required=True, help="31337 anvil, 421614 Arbitrum Sepolia")
    arguments = parser.parse_args(argv)
    outcome = record(arguments.script, arguments.chain_id)
    if isinstance(outcome, Err):
        cause = f" ({outcome.cause})" if outcome.cause else ""
        print(f"error: {outcome.message}{cause}", file=sys.stderr)
    else:
        print(outcome.value)
    exit_code = 1 if isinstance(outcome, Err) else 0
    return exit_code


# ----------------------------------------------------------------------------- internals


def _successful_blocks(receipts: list[Any]) -> Result[dict[str, int]]:
    """Map each transaction hash to its block number; any failed receipt is an error."""
    failed = [r.get("transactionHash") for r in receipts if r.get("status") != SUCCESS_STATUS]
    if failed:
        return Err(f"broadcast contains failed transactions: {failed}")
    try:
        blocks = {r["transactionHash"]: int(r["blockNumber"], 16) for r in receipts}
    except (KeyError, TypeError, ValueError) as error:
        return Err("malformed receipt in broadcast", error)
    mapped: Result[dict[str, int]] = Ok(blocks)
    return mapped


def _registry_addresses(deployment: JsonObject) -> Result[dict[str, tuple[str, str]]]:
    """Return {lowercase address: (contract name, checksummed address)} for the two registries."""
    participant = deployment.get("participantRegistry")
    claim = deployment.get("claimRegistry")
    if not isinstance(participant, str) or not isinstance(claim, str):
        return Err("deployment file lacks participantRegistry/claimRegistry addresses")
    registries: Result[dict[str, tuple[str, str]]] = Ok(
        {participant.lower(): ("ParticipantRegistry", participant), claim.lower(): ("ClaimRegistry", claim)}
    )
    return registries


def _classify(
    tx: JsonObject, block: int, registries: dict[str, tuple[str, str]]
) -> Result[tuple[str, JsonObject]]:
    """Turn one broadcast transaction into ("deployment" | "lifecycle" | "transfer", entry).

    Contract addresses reuse the deployment file's checksummed spelling; `from` stays lowercase as
    Foundry writes it (checksumming needs keccak, which the standard library lacks).
    """
    address = str(tx.get("contractAddress") or "").lower()
    function = tx.get("function")
    tx_type = tx.get("transactionType")
    if tx_type == "CREATE" and address not in registries:
        return Err(f"{tx.get('hash')} creates {address}, not in the deployment file (stale broadcast?)")
    if tx_type == "CALL" and function and address not in registries:
        return Err(f"{tx.get('hash')} calls {address}, not in the deployment file (stale broadcast?)")
    if tx_type not in ("CREATE", "CALL"):
        return Err(f"{tx.get('hash')} has unsupported transaction type {tx_type}")
    if tx_type == "CREATE":
        name, checksummed = registries[address]
        created: JsonObject = {"contract": name, "address": checksummed}
        created.update({"txHash": tx["hash"], "blockNumber": block})
        entry: tuple[str, JsonObject] = ("deployment", created)
    elif function:
        step: JsonObject = {"step": str(function).split("(")[0], "txHash": tx["hash"], "blockNumber": block}
        step["from"] = tx.get("transaction", {}).get("from")
        if registries[address][0] == "ClaimRegistry":
            step["claimId"] = (tx.get("arguments") or [None])[0]
        entry = ("lifecycle", step)
    else:
        entry = ("transfer", {"txHash": tx["hash"]})
    classified: Result[tuple[str, JsonObject]] = Ok(entry)
    return classified


def _count(entries: Any) -> int:
    """Return the length of a transaction list, 0 when it is missing."""
    count = len(entries) if isinstance(entries, list) else 0
    return count


def _append_new(existing: Any, new_entries: list[JsonObject]) -> list[JsonObject]:
    """Keep `existing` entries and append the new ones whose txHash is not there yet."""
    kept = list(existing) if isinstance(existing, list) else []
    seen = {entry.get("txHash") for entry in kept if isinstance(entry, dict)}
    appended = kept + [entry for entry in new_entries if entry["txHash"] not in seen]
    return appended


if __name__ == "__main__":
    sys.exit(main())
