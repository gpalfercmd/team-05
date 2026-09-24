# =============================================================================
# Proof of Aid — Team 05 — 0002: evidence_files.root_index (one root per bundle)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""0002 evidence bundles

Adds `evidence_files.root_index`: the file's position in the onchain
`evidenceRoots(claimId)` (0 = original evidence, n = supplementary proof n).
Existing rows become bundle 0 through the server default, which is what they
were anchored as. Batch mode keeps the CHECK constraint portable: PostgreSQL
alters in place, SQLite rebuilds the table.

Revision ID: bb34bf8da841
Revises: 199e2ea9e4ec
Create Date: 2026-09-24 18:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bb34bf8da841"
down_revision: str | Sequence[str] | None = "199e2ea9e4ec"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add `root_index` (default 0 for existing rows) and forbid negatives."""
    with op.batch_alter_table("evidence_files") as batch:
        batch.add_column(
            sa.Column("root_index", sa.Integer(), server_default="0", nullable=False)
        )
        batch.create_check_constraint(
            "ck_evidence_root_index_nonnegative", "root_index >= 0"
        )


def downgrade() -> None:
    """Drop the bundle index (all bundles collapse back into one file list)."""
    with op.batch_alter_table("evidence_files") as batch:
        batch.drop_constraint("ck_evidence_root_index_nonnegative", type_="check")
        batch.drop_column("root_index")
