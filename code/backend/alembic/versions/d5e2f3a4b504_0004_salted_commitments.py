# =============================================================================
# Proof of Aid — Team 05 — 0004: salted evidence commitments (P8.2)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""0004 salted commitments

Adds `evidence_files.salt_sealed` (the file's 32-byte commitment salt,
encrypted with the claim key) and `evidence_files.dedup_tag_hex` (per-claim
HMAC-SHA256 of the sanitized bytes, unique per claim). Both are nullable:
existing rows stay unsalted, and their `sha256_hex` is still the plain SHA-256
they were anchored with. NULLs never collide in a unique constraint, so old
rows do not block the new one. Batch mode keeps it portable to SQLite.

Revision ID: d5e2f3a4b504
Revises: c4d1e2f3a403
Create Date: 2026-09-24 23:30:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d5e2f3a4b504"
down_revision: str | Sequence[str] | None = "c4d1e2f3a403"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the sealed salt and the duplicate-detection tag (NULL on legacy rows)."""
    with op.batch_alter_table("evidence_files") as batch:
        batch.add_column(sa.Column("salt_sealed", sa.LargeBinary(), nullable=True))
        batch.add_column(sa.Column("dedup_tag_hex", sa.String(length=66), nullable=True))
        batch.create_unique_constraint("uq_file_dedup_per_claim", ["claim_id", "dedup_tag_hex"])


def downgrade() -> None:
    """Drop both columns; salted rows keep their commitment but lose the salt."""
    with op.batch_alter_table("evidence_files") as batch:
        batch.drop_constraint("uq_file_dedup_per_claim", type_="unique")
        batch.drop_column("dedup_tag_hex")
        batch.drop_column("salt_sealed")
