# =============================================================================
# Proof of Aid — Team 05 — Public chain-index endpoints (no login)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Fast public reads of the P4 chain index (spec F6, P4.2).

- `GET /public/claims?status=&limit=&offset=`: indexed claims, newest anchor first.
- `GET /public/claims/{claim_id}/timeline`: the claim's registry events in
  chain order, plus `indexedToBlock` so the client can judge freshness.
- `GET /public/indexer/status`: deployment, cursor, latest seen head, lag.

Everything served here is public chain data (addresses, hashes, booleans,
status names, block numbers); nothing is read from the evidence tables, so no
private file data can leak. The index is a speed-up, not a source of truth:
anything a user relies on — status, evidence roots — must still be checked
against the contract (`statusOf`, `evidenceRoots`), which the public page
does itself (memory.md: the integrity proof must not depend on the backend).
Endpoints answer 503 when no deployment is configured.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Final

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_session
from app.indexer.abi import EventCatalog
from app.indexer.deployment import Deployment
from app.models import ChainClaim, ChainEvent, SyncState
from app.schemas import (
    ClaimTimeline,
    IndexerStatus,
    PublicChainClaim,
    PublicChainClaimList,
    TimelineEvent,
)

router = APIRouter(prefix="/public", tags=["public"])

DEFAULT_PAGE_SIZE: Final[int] = 20
MAX_PAGE_SIZE: Final[int] = 100
CLAIM_ID_PATTERN: Final[re.Pattern[str]] = re.compile(r"^0x[0-9a-f]{64}$")
HEX_VALUE_PATTERN: Final[re.Pattern[str]] = re.compile(r"^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$")
STATUS_ARGS: Final[frozenset[str]] = frozenset({"from", "to"})
INTEGER_ARGS: Final[frozenset[str]] = frozenset({"rootIndex"})


def _chain(request: Request) -> tuple[Deployment, EventCatalog]:
    """Return the configured deployment and ABI catalog, or 503."""
    deployment: Deployment | None = request.app.state.deployment
    catalog: EventCatalog | None = request.app.state.event_catalog
    if deployment is None or catalog is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "chain index is not configured")
    configured: tuple[Deployment, EventCatalog] = (deployment, catalog)
    return configured


def _aware(moment: datetime) -> datetime:
    """SQLite hands back naive datetimes; every stored time is UTC."""
    aware = moment if moment.tzinfo is not None else moment.replace(tzinfo=timezone.utc)
    return aware


def _sync_state(db: Session, deployment: Deployment) -> SyncState | None:
    """This deployment's indexer cursor row (None before the first run)."""
    state = db.get(SyncState, (deployment.chain_id, deployment.contracts_key))
    return state


def _safe_args(
    event: ChainEvent, catalog: EventCatalog
) -> dict[str, str | bool | int]:
    """Keep only addresses, hashes, booleans, status names and `rootIndex`.

    Stored args already come from public events; this whitelist makes sure a
    future ABI field (free text, large numbers) is never published by accident.
    """
    safe: dict[str, str | bool | int] = {}
    is_status_change = event.event_name == "StatusChanged"
    for name, value in event.args.items():
        if isinstance(value, bool):
            safe[name] = value
        elif isinstance(value, int) and is_status_change and name in STATUS_ARGS:
            status_name = catalog.status_name(value)
            if status_name is not None:
                safe[name] = status_name
        elif isinstance(value, int) and name in INTEGER_ARGS:
            safe[name] = value
        elif isinstance(value, str) and HEX_VALUE_PATTERN.fullmatch(value):
            safe[name] = value
    return safe


def _claim_summary(row: ChainClaim) -> PublicChainClaim:
    """Serialize one projected claim."""
    summary = PublicChainClaim(
        claimId=row.claim_id_hex,
        organization=row.organization,
        status=row.status,
        anchoredBlock=row.anchored_block,
        anchoredAt=_aware(row.anchored_at),
        lastStatusBlock=row.last_status_block,
        lastStatusAt=_aware(row.last_status_at),
    )
    return summary


@router.get("/claims", response_model=PublicChainClaimList)
def list_claims(
    request: Request,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_session),
) -> PublicChainClaimList:
    """Indexed claims, newest anchor first, optionally filtered by status name."""
    deployment, catalog = _chain(request)
    if status_filter is not None and status_filter not in catalog.status_names[1:]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "unknown claim status")
    conditions = [ChainClaim.chain_id == deployment.chain_id]
    if status_filter is not None:
        conditions.append(ChainClaim.status == status_filter)
    total = db.scalar(select(func.count()).select_from(ChainClaim).where(*conditions)) or 0
    rows = db.scalars(
        select(ChainClaim)
        .where(*conditions)
        .order_by(ChainClaim.anchored_block.desc(), ChainClaim.claim_id_hex)
        .limit(limit)
        .offset(offset)
    ).all()
    state = _sync_state(db, deployment)
    page = PublicChainClaimList(
        items=[_claim_summary(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
        indexedToBlock=state.cursor_block if state is not None else None,
    )
    return page


@router.get("/claims/{claim_id_hex}/timeline", response_model=ClaimTimeline)
def claim_timeline(
    request: Request, claim_id_hex: str, db: Session = Depends(get_session)
) -> ClaimTimeline:
    """The claim's ClaimRegistry events in chain order (404 when never indexed)."""
    deployment, catalog = _chain(request)
    claim_id = claim_id_hex.lower()
    if not CLAIM_ID_PATTERN.fullmatch(claim_id):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "claim id must be 0x followed by 64 hex characters"
        )
    events = db.scalars(
        select(ChainEvent)
        .where(
            ChainEvent.chain_id == deployment.chain_id,
            ChainEvent.contract == deployment.claim_registry,
            ChainEvent.claim_id_hex == claim_id,
        )
        .order_by(ChainEvent.block_number, ChainEvent.log_index)
    ).all()
    projected = db.get(ChainClaim, (deployment.chain_id, claim_id))
    if not events and projected is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "claim not indexed")
    state = _sync_state(db, deployment)
    timeline = ClaimTimeline(
        claimId=claim_id,
        chainId=deployment.chain_id,
        claimRegistry=deployment.claim_registry,
        status=projected.status if projected is not None else None,
        evidenceRoots=list(projected.evidence_roots) if projected is not None else [],
        events=[
            TimelineEvent(
                blockNumber=event.block_number,
                txHash=event.tx_hash,
                logIndex=event.log_index,
                timestamp=_aware(event.block_time),
                event=event.event_name,
                args=_safe_args(event, catalog),
            )
            for event in events
        ],
        indexedToBlock=state.cursor_block if state is not None else None,
    )
    return timeline


@router.get("/indexer/status", response_model=IndexerStatus)
def indexer_status(request: Request, db: Session = Depends(get_session)) -> IndexerStatus:
    """Which deployment is indexed and how far behind the chain head it is."""
    deployment, _ = _chain(request)
    state = _sync_state(db, deployment)
    cursor = state.cursor_block if state is not None else None
    head = state.head_block if state is not None else None
    report = IndexerStatus(
        chainId=deployment.chain_id,
        participantRegistry=deployment.participant_registry,
        claimRegistry=deployment.claim_registry,
        deployBlock=deployment.deploy_block,
        indexedToBlock=cursor,
        headBlock=head,
        lag=head - cursor if head is not None and cursor is not None else None,
        updatedAt=_aware(state.updated_at) if state is not None else None,
    )
    return report
