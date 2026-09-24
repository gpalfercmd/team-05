# =============================================================================
# Proof of Aid — Team 05 — JSON-RPC reads for the indexer (web3.py)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""The four chain reads the indexer needs, behind a small protocol (P4.1).

`ChainReader` is what `sync` depends on, so unit tests plug in a fake chain
made of synthetic logs; `Web3ChainReader` is the real one over HTTP. Every
call returns a `Result`: network failures and RPC refusals are expected on a
public testnet and must not crash the loop.

`is_range_error` recognizes a provider refusing an `eth_getLogs` range (too
many blocks or results). Providers word this differently, so it matches known
fragments; `sync` then halves the chunk instead of failing.
"""

from __future__ import annotations

from typing import Final, Protocol

from requests.exceptions import RequestException
from web3 import HTTPProvider, Web3
from web3.exceptions import Web3Exception
from web3.types import FilterParams

from poa_shared.result import Err, Ok, Result

from app.indexer.abi import RawLog

RPC_TIMEOUT_SECONDS: Final[int] = 30
RANGE_ERROR_MARKERS: Final[tuple[str, ...]] = (
    "range",
    "limit",
    "too many",
    "too large",
    "exceed",
    "more than",
    "timed out",
    "timeout",
)
# Read errors that are expected over a network: provider/RPC errors, transport
# errors (requests' exceptions are OSErrors) and malformed responses.
RPC_ERRORS: Final = (Web3Exception, RequestException, OSError, ValueError)
# Plus the shapes a malformed block/log response can raise while converting it.
RESPONSE_ERRORS: Final = (Web3Exception, RequestException, OSError, ValueError, KeyError, TypeError)


class ChainReader(Protocol):
    """The chain reads the indexer performs."""

    def chain_id(self) -> Result[int]:
        """Return the connected chain's id."""
        ...

    def head(self) -> Result[int]:
        """Return the latest block number."""
        ...

    def block_timestamp(self, block_number: int) -> Result[int]:
        """Return a block's Unix timestamp in seconds."""
        ...

    def logs(
        self, addresses: list[str], topics: list[bytes], from_block: int, to_block: int
    ) -> Result[list[RawLog]]:
        """Return logs of `addresses` whose topic 0 is in `topics`, inclusive range."""
        ...


def is_range_error(error: Err) -> bool:
    """True when the provider refused the block range, so a smaller one may work."""
    text = f"{error.message} {error.cause or ''}".lower()
    refused = any(marker in text for marker in RANGE_ERROR_MARKERS)
    return refused


def _hex(value: object) -> str:
    """Lowercase `0x` hex of a HexBytes/bytes/str value from web3."""
    text = "0x" + value.hex().removeprefix("0x") if isinstance(value, bytes) else str(value)
    lowered = text.lower()
    return lowered


def _raw_log(entry: object) -> RawLog:
    """Convert one web3 `LogReceipt` into the indexer's `RawLog`."""
    log = dict(entry)  # type: ignore[call-overload]  # AttributeDict → plain mapping
    raw = RawLog(
        address=str(log["address"]).lower(),
        topics=tuple(bytes(topic) for topic in log["topics"]),
        data=bytes(log["data"]),
        block_number=int(log["blockNumber"]),
        tx_hash=_hex(log["transactionHash"]),
        log_index=int(log["logIndex"]),
    )
    return raw


class Web3ChainReader:
    """`ChainReader` over an HTTP JSON-RPC endpoint."""

    def __init__(self, rpc_url: str) -> None:
        self._w3 = Web3(HTTPProvider(rpc_url, request_kwargs={"timeout": RPC_TIMEOUT_SECONDS}))

    def chain_id(self) -> Result[int]:
        """Return `eth_chainId`."""
        try:
            value = int(self._w3.eth.chain_id)
        except RPC_ERRORS as cause:
            return Err("eth_chainId failed", cause)
        result: Result[int] = Ok(value)
        return result

    def head(self) -> Result[int]:
        """Return `eth_blockNumber`."""
        try:
            value = int(self._w3.eth.block_number)
        except RPC_ERRORS as cause:
            return Err("eth_blockNumber failed", cause)
        result: Result[int] = Ok(value)
        return result

    def block_timestamp(self, block_number: int) -> Result[int]:
        """Return the `timestamp` of `eth_getBlockByNumber`."""
        try:
            value = int(self._w3.eth.get_block(block_number)["timestamp"])
        except RESPONSE_ERRORS as cause:
            return Err(f"eth_getBlockByNumber({block_number}) failed", cause)
        result: Result[int] = Ok(value)
        return result

    def logs(
        self, addresses: list[str], topics: list[bytes], from_block: int, to_block: int
    ) -> Result[list[RawLog]]:
        """Return `eth_getLogs` for both registries, skipping reorged (`removed`) entries."""
        params: FilterParams = {
            "address": [Web3.to_checksum_address(address) for address in addresses],
            "fromBlock": from_block,
            "toBlock": to_block,
            "topics": [["0x" + topic.hex() for topic in topics]],
        }
        try:
            entries = self._w3.eth.get_logs(params)
            converted = [_raw_log(entry) for entry in entries if not entry.get("removed", False)]
        except RESPONSE_ERRORS as cause:
            return Err(f"eth_getLogs({from_block}-{to_block}) failed", cause)
        result: Result[list[RawLog]] = Ok(converted)
        return result
