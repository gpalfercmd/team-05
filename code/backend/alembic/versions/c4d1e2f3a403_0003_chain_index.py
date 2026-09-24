# =============================================================================
# Proof of Aid — Team 05 — 0003: chain index (events, cursor, projections)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""0003 chain index

P4 indexer tables: `chain_events` (one row per registry event, unique per
chain + tx hash + log index so re-indexing is a no-op), `sync_state` (cursor
per chain and contract pair) and the projections `chain_participants` and
`chain_claims`. New tables only, so the migration is portable as plain
`create_table` on PostgreSQL and SQLite; `JSON` renders as `json` on
PostgreSQL and as text on SQLite.

Revision ID: c4d1e2f3a403
Revises: bb34bf8da841
Create Date: 2026-09-24 21:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d1e2f3a403"
down_revision: str | Sequence[str] | None = "bb34bf8da841"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the chain index tables."""
    op.create_table(
        "chain_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("chain_id", sa.BigInteger(), nullable=False),
        sa.Column("block_number", sa.BigInteger(), nullable=False),
        sa.Column("tx_hash", sa.String(length=66), nullable=False),
        sa.Column("log_index", sa.Integer(), nullable=False),
        sa.Column("contract", sa.String(length=42), nullable=False),
        sa.Column("event_name", sa.String(length=40), nullable=False),
        sa.Column("claim_id_hex", sa.String(length=66), nullable=True),
        sa.Column("args", sa.JSON(), nullable=False),
        sa.Column("block_time", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chain_id", "tx_hash", "log_index", name="uq_chain_event_log"),
    )
    op.create_index(
        "ix_chain_events_claim",
        "chain_events",
        ["chain_id", "claim_id_hex", "block_number", "log_index"],
        unique=False,
    )
    op.create_table(
        "sync_state",
        sa.Column("chain_id", sa.BigInteger(), nullable=False),
        sa.Column("contracts", sa.String(length=85), nullable=False),
        sa.Column("deploy_block", sa.BigInteger(), nullable=False),
        sa.Column("cursor_block", sa.BigInteger(), nullable=True),
        sa.Column("head_block", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("chain_id", "contracts"),
    )
    op.create_table(
        "chain_participants",
        sa.Column("chain_id", sa.BigInteger(), nullable=False),
        sa.Column("address", sa.String(length=42), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("organization", sa.String(length=42), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("updated_block", sa.BigInteger(), nullable=False),
        sa.CheckConstraint(
            "role IN ('organization', 'internal_verifier', 'auditor')",
            name="ck_chain_participant_role",
        ),
        sa.PrimaryKeyConstraint("chain_id", "address"),
    )
    op.create_table(
        "chain_claims",
        sa.Column("chain_id", sa.BigInteger(), nullable=False),
        sa.Column("claim_id_hex", sa.String(length=66), nullable=False),
        sa.Column("organization", sa.String(length=42), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("internal_verifier", sa.String(length=42), nullable=True),
        sa.Column("auditor", sa.String(length=42), nullable=True),
        sa.Column("evidence_roots", sa.JSON(), nullable=False),
        sa.Column("metadata_hash", sa.String(length=66), nullable=False),
        sa.Column("anchored_block", sa.BigInteger(), nullable=False),
        sa.Column("anchored_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_status_block", sa.BigInteger(), nullable=False),
        sa.Column("last_status_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("chain_id", "claim_id_hex"),
    )
    op.create_index(
        "ix_chain_claims_anchored", "chain_claims", ["chain_id", "anchored_block"], unique=False
    )


def downgrade() -> None:
    """Drop the chain index; the indexer rebuilds it from the chain on the next run."""
    op.drop_index("ix_chain_claims_anchored", table_name="chain_claims")
    op.drop_table("chain_claims")
    op.drop_table("chain_participants")
    op.drop_table("sync_state")
    op.drop_index("ix_chain_events_claim", table_name="chain_events")
    op.drop_table("chain_events")
