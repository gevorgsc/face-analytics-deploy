"""Add access_levels and access_level_members tables.

Revision ID: 0010_access_levels
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_access_levels"
down_revision = "0009_card_visitor"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "access_levels",
        sa.Column("id",          sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name",        sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("color",       sa.String, nullable=True, server_default="#3B82F6"),
        sa.Column("door_rules",  sa.Text, nullable=True, server_default="[]"),
        sa.Column("is_active",   sa.Integer, nullable=True, server_default="1"),
        sa.Column("created_at",  sa.DateTime),
        sa.Column("updated_at",  sa.DateTime),
    )

    op.create_table(
        "access_level_members",
        sa.Column("id",              sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("access_level_id", sa.Integer,
                  sa.ForeignKey("access_levels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id",       sa.Integer,
                  sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("valid_from",      sa.DateTime, nullable=True),
        sa.Column("valid_to",        sa.DateTime, nullable=True),
        sa.Column("created_at",      sa.DateTime),
    )
    op.create_index("ix_alm_level_id",  "access_level_members", ["access_level_id"])
    op.create_index("ix_alm_person_id", "access_level_members", ["person_id"])
    op.create_index("ix_alm_unique",    "access_level_members",
                    ["access_level_id", "person_id"], unique=True)


def downgrade():
    op.drop_table("access_level_members")
    op.drop_table("access_levels")
