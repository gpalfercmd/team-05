# =============================================================================
# Proof of Aid — Team 05 — 0005: sealed reviewer notes behind salted fingerprints (P10.3)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""0005 claim notes

Adds `claim_notes`: one row per note whose salted fingerprint
`keccak256(salt ‖ utf8(text))` is (or is about to be) anchored for a claim as a
justification, proof request, counter-evidence or dispute resolution. Text and
salt are stored encrypted with the claim key; the fingerprint is unique per
claim. Notes anchored before this revision were never stored and stay unsalted.

Revision ID: e6f3a4b5c605
Revises: d5e2f3a4b504
Create Date: 2026-09-25 10:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e6f3a4b5c605"
down_revision: str | Sequence[str] | None = "d5e2f3a4b504"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the sealed notes table."""
    op.create_table(
        "claim_notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("claim_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("author", sa.String(length=42), nullable=False),
        sa.Column("note_hash_hex", sa.String(length=66), nullable=False),
        sa.Column("text_sealed", sa.LargeBinary(), nullable=False),
        sa.Column("salt_sealed", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('justification', 'proof_request', 'counter_evidence', 'resolution')",
            name="ck_claim_note_kind",
        ),
        sa.ForeignKeyConstraint(["claim_id"], ["claims.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("claim_id", "note_hash_hex", name="uq_note_per_claim"),
    )
    op.create_index(op.f("ix_claim_notes_claim_id"), "claim_notes", ["claim_id"], unique=False)


def downgrade() -> None:
    """Drop the notes table; the anchored fingerprints stay onchain without their text."""
    op.drop_index(op.f("ix_claim_notes_claim_id"), table_name="claim_notes")
    op.drop_table("claim_notes")
