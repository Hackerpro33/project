"""Initial schema for datasets and visualizations."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "202502051200"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "datasets",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("columns", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("file_url", sa.String(length=255), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=True),
        sa.Column("sample_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    op.create_table(
        "visualizations",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False, server_default=sa.text("'chart'")),
        sa.Column("dataset_id", sa.String(length=36), sa.ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("x_axis", sa.String(length=255), nullable=True),
        sa.Column("y_axis", sa.String(length=255), nullable=True),
        sa.Column("z_axis", sa.String(length=255), nullable=True),
        sa.Column("insights", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    op.create_index("ix_visualizations_dataset_id", "visualizations", ["dataset_id"])
    op.create_index("ix_visualizations_title", "visualizations", ["title"])


def downgrade() -> None:
    op.drop_index("ix_visualizations_title", table_name="visualizations")
    op.drop_index("ix_visualizations_dataset_id", table_name="visualizations")
    op.drop_table("visualizations")
    op.drop_table("datasets")
