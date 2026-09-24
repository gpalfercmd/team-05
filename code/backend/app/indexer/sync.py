# =============================================================================
# Proof of Aid — Team 05 — Indexer catch-up: chunked, idempotent, crash-safe
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Bring the database up to `head - confirmations` (P4.1).

- Range: from `max(cursor + 1, deployBlock)` to `head - confirmations`, in
  chunks of `block_chunk` blocks. A provider refusing the range halves the
  chunk down to `min_block_chunk`, then the run fails with `Err`.
- One transaction per chunk holds the new `chain_events` rows, the projection
  updates and the cursor, so a crash can never leave them out of step; the
  next run simply resumes after the last committed chunk.
- Idempotent: an event already stored (same chain, tx hash, log index) is
  skipped and not folded again, so re-reading a range changes nothing.
- Confirmations keep blocks that a reorg could still remove out of the index.
- Block timestamps are fetched once per distinct block and cached per run.

Logs contain block numbers and counts only (never addresses).
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Final

from sqlalchemy import select, tuple_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from poa_shared.result import Err, Ok, Result

from app.indexer.abi import DecodedEvent, EventCatalog, RawLog
from app.indexer.deployment import Deployment
from app.indexer.projection import apply_event
from app.indexer.rpc import ChainReader, is_range_error
from app.models import ChainEvent, SyncState

logger = logging.getLogger("app.indexer")

MIN_BLOCK_CHUNK: Final[int] = 1


@dataclass(frozen=True, slots=True)
class SyncOptions:
    """How far behind the head to stay and how many blocks per `eth_getLogs`."""

    confirmations: int
    block_chunk: int
    min_block_chunk: int = MIN_BLOCK_CHUNK


@dataclass(slots=True)
class SyncReport:
    """What one `sync_once` run did."""

    head: int
    target: int
    cursor: int | None
    stored: int = 0
    duplicates: int = 0
    projection_warnings: list[str] = field(default_factory=list)


def _utc(timestamp: int) -> datetime:
    """Block timestamps are Unix seconds; store them as aware UTC datetimes."""
    moment = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    return moment


def _state(db: Session, deployment: Deployment) -> SyncState:
    """Return this deployment's cursor row, creating it on the first run."""
    state = db.get(SyncState, (deployment.chain_id, deployment.contracts_key))
    if state is None:
        state = SyncState(
            chain_id=deployment.chain_id,
            contracts=deployment.contracts_key,
            deploy_block=deployment.deploy_block,
            cursor_block=None,
            head_block=None,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(state)
    found: SyncState = state
    return found


def _timestamps(
    reader: ChainReader, logs: list[RawLog], cache: dict[int, int]
) -> Result[dict[int, int]]:
    """Fetch each distinct block's timestamp once (cache shared across chunks)."""
    for block in sorted({log.block_number for log in logs} - cache.keys()):
        fetched = reader.block_timestamp(block)
        if isinstance(fetched, Err):
            return fetched
        cache[block] = fetched.value
    known: Result[dict[int, int]] = Ok(cache)
    return known


def _decode_all(
    catalog: EventCatalog, deployment: Deployment, logs: list[RawLog]
) -> Result[list[DecodedEvent]]:
    """Decode every log in chain order; any undecodable log fails the chunk.

    The RPC filter already restricts addresses and topics, so a log that does
    not decode means the ABI and the contract disagree — stop, do not skip.
    """
    ordered = sorted(logs, key=lambda log: (log.block_number, log.log_index))
    events: list[DecodedEvent] = []
    for log in ordered:
        decoded = catalog.decode(log, deployment)
        if isinstance(decoded, Err):
            return Err(f"block {log.block_number} log {log.log_index}: {decoded.message}")
        events.append(decoded.value)
    result: Result[list[DecodedEvent]] = Ok(events)
    return result


def _existing_keys(db: Session, chain_id: int, events: list[DecodedEvent]) -> set[tuple[str, int]]:
    """Return the (tx hash, log index) pairs of `events` that are already stored."""
    keys = [(event.log.tx_hash, event.log.log_index) for event in events]
    stored: set[tuple[str, int]] = set()
    if keys:
        rows = db.execute(
            select(ChainEvent.tx_hash, ChainEvent.log_index).where(
                ChainEvent.chain_id == chain_id,
                tuple_(ChainEvent.tx_hash, ChainEvent.log_index).in_(keys),
            )
        ).all()
        stored = {(row[0], row[1]) for row in rows}
    return stored


def store_chunk(
    db: Session,
    *,
    catalog: EventCatalog,
    deployment: Deployment,
    events: list[DecodedEvent],
    times: dict[int, int],
    cursor: int,
    report: SyncReport,
) -> None:
    """Insert new events, fold them into the projections and move the cursor.

    The caller owns the transaction: all of this commits together or not at all.
    """
    already = _existing_keys(db, deployment.chain_id, events)
    for event in events:
        key = (event.log.tx_hash, event.log.log_index)
        if key in already:
            report.duplicates += 1
            continue
        already.add(key)
        block_time = _utc(times[event.log.block_number])
        db.add(
            ChainEvent(
                chain_id=deployment.chain_id,
                block_number=event.log.block_number,
                tx_hash=event.log.tx_hash,
                log_index=event.log.log_index,
                contract=event.log.address,
                event_name=event.name,
                claim_id_hex=event.claim_id_hex,
                args=dict(event.args),
                block_time=block_time,
            )
        )
        applied = apply_event(db, deployment.chain_id, event, block_time, catalog)
        # A projection gap (e.g. an event for a claim anchored before deployBlock)
        # must not block the timeline: the event row is kept, the warning reported.
        if isinstance(applied, Err):
            report.projection_warnings.append(
                f"block {event.log.block_number} log {event.log.log_index}: {applied.message}"
            )
        report.stored += 1
    state = _state(db, deployment)
    state.cursor_block = cursor
    state.updated_at = datetime.now(timezone.utc)


def _record_head(factory: sessionmaker[Session], deployment: Deployment, head: int) -> Result[int | None]:
    """Save the latest head seen (freshness for `/public/indexer/status`); return the cursor."""
    try:
        with factory() as db, db.begin():
            state = _state(db, deployment)
            state.head_block = head
            state.updated_at = datetime.now(timezone.utc)
            cursor = state.cursor_block
    except SQLAlchemyError as cause:
        return Err("cannot read or update the indexer cursor", cause)
    recorded: Result[int | None] = Ok(cursor)
    return recorded


def _fetch_chunk(
    reader: ChainReader,
    catalog: EventCatalog,
    deployment: Deployment,
    span: tuple[int, int],
    cache: dict[int, int],
) -> Result[tuple[list[DecodedEvent], dict[int, int]]]:
    """Read, decode and timestamp one block range."""
    logs = reader.logs(
        [deployment.participant_registry, deployment.claim_registry], catalog.topics, *span
    )
    if isinstance(logs, Err):
        return logs
    events = _decode_all(catalog, deployment, logs.value)
    if isinstance(events, Err):
        return events
    times = _timestamps(reader, logs.value, cache)
    if isinstance(times, Err):
        return times
    fetched: Result[tuple[list[DecodedEvent], dict[int, int]]] = Ok((events.value, times.value))
    return fetched


def _commit_chunk(
    factory: sessionmaker[Session],
    catalog: EventCatalog,
    deployment: Deployment,
    fetched: tuple[list[DecodedEvent], dict[int, int]],
    cursor: int,
    report: SyncReport,
) -> Result[None]:
    """Store one chunk in its own transaction."""
    events, times = fetched
    try:
        with factory() as db, db.begin():
            store_chunk(
                db,
                catalog=catalog,
                deployment=deployment,
                events=events,
                times=times,
                cursor=cursor,
                report=report,
            )
    except SQLAlchemyError as cause:
        return Err(f"cannot store blocks up to {cursor}", cause)
    committed: Result[None] = Ok(None)
    return committed


def sync_once(
    factory: sessionmaker[Session],
    reader: ChainReader,
    catalog: EventCatalog,
    deployment: Deployment,
    options: SyncOptions,
) -> Result[SyncReport]:
    """Index every confirmed block not yet stored; `Err` stops at the failing chunk."""
    chain_id = reader.chain_id()
    if isinstance(chain_id, Err):
        return chain_id
    if chain_id.value != deployment.chain_id:
        return Err(f"RPC is chain {chain_id.value}, deployment file is chain {deployment.chain_id}")
    head = reader.head()
    if isinstance(head, Err):
        return head
    cursor = _record_head(factory, deployment, head.value)
    if isinstance(cursor, Err):
        return cursor
    target = head.value - options.confirmations
    report = SyncReport(head=head.value, target=target, cursor=cursor.value)
    start = deployment.deploy_block if cursor.value is None else max(cursor.value + 1, deployment.deploy_block)
    chunk = options.block_chunk
    cache: dict[int, int] = {}
    while start <= target:
        end = min(start + chunk - 1, target)
        fetched = _fetch_chunk(reader, catalog, deployment, (start, end), cache)
        if isinstance(fetched, Err) and is_range_error(fetched) and chunk > options.min_block_chunk:
            chunk = max(chunk // 2, options.min_block_chunk)
            logger.info("RPC refused %d blocks from %d; retrying with %d", end - start + 1, start, chunk)
            continue
        if isinstance(fetched, Err):
            return fetched
        committed = _commit_chunk(factory, catalog, deployment, fetched.value, end, report)
        if isinstance(committed, Err):
            return committed
        report.cursor = end
        start = end + 1
    for warning in report.projection_warnings:
        logger.warning("projection skipped: %s", warning)
    done: Result[SyncReport] = Ok(report)
    return done


def run_forever(
    sync: Callable[[], Result[SyncReport]],
    poll_seconds: float,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Call `sync` every `poll_seconds` until interrupted (Ctrl+C / SIGTERM)."""
    while True:
        try:
            outcome = sync()
            if isinstance(outcome, Err):
                logger.error("sync failed: %s (%s)", outcome.message, type(outcome.cause).__name__)
            else:
                report = outcome.value
                logger.info(
                    "indexed to block %s (head %d): %d new, %d already stored",
                    report.cursor, report.head, report.stored, report.duplicates,
                )
        # Top-level loop guard (the only broad catch in the indexer): one bad
        # poll — an unexpected provider response, a DB hiccup — must not kill a
        # long-running indexer; the next poll retries from the committed cursor.
        # The traceback only at DEBUG: exception texts can contain the RPC URL,
        # which for hosted providers embeds an API key.
        except Exception as cause:  # noqa: BLE001
            logger.error(
                "unexpected %s during sync; retrying next poll",
                type(cause).__name__,
                exc_info=logger.isEnabledFor(logging.DEBUG),
            )
        sleep(poll_seconds)
