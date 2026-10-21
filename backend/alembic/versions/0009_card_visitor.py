"""Add card_issues and visitors tables.

Revision ID: 0009_card_visitor
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_card_visitor"
down_revision = "0008_attendance_records"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "card_issues",
        sa.Column("id",          sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("person_id",   sa.Integer,
                  sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id",   sa.Integer,
                  sa.ForeignKey("access_control_devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("card_number", sa.String, nullable=False),
        sa.Column("card_type",   sa.String, nullable=True, server_default="normal"),
        sa.Column("valid_from",  sa.DateTime, nullable=True),
        sa.Column("valid_to",    sa.DateTime, nullable=True),
        sa.Column("status",      sa.String, nullable=True, server_default="active"),
        sa.Column("note",        sa.Text, nullable=True),
        sa.Column("created_at",  sa.DateTime),
        sa.Column("updated_at",  sa.DateTime),
    )
    op.create_index("ix_card_issues_person_id",   "card_issues", ["person_id"])
    op.create_index("ix_card_issues_device_id",   "card_issues", ["device_id"])
    op.create_index("ix_card_issues_card_number", "card_issues", ["card_number"])
    op.create_index("ix_card_issues_status",      "card_issues", ["status"])

    op.create_table(
        "visitors",
        sa.Column("id",             sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("full_name",      sa.String, nullable=False),
        sa.Column("phone",          sa.String, nullable=True),
        sa.Column("company",        sa.String, nullable=True),
        sa.Column("host_name",      sa.String, nullable=True),
        sa.Column("visit_reason",   sa.String, nullable=True),
        sa.Column("card_number",    sa.String, nullable=True),
        sa.Column("device_id",      sa.Integer,
                  sa.ForeignKey("access_control_devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("valid_from",     sa.DateTime, nullable=False),
        sa.Column("valid_to",       sa.DateTime, nullable=False),
        sa.Column("status",         sa.String, nullable=True, server_default="pending"),
        sa.Column("qr_token",       sa.String, nullable=True),
        sa.Column("note",           sa.Text, nullable=True),
        sa.Column("checked_in_at",  sa.DateTime, nullable=True),
        sa.Column("checked_out_at", sa.DateTime, nullable=True),
        sa.Column("created_by",     sa.Integer,
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at",     sa.DateTime),
        sa.Column("updated_at",     sa.DateTime),
    )
    op.create_index("ix_visitors_card_number", "visitors", ["card_number"])
    op.create_index("ix_visitors_status",      "visitors", ["status"])
    op.create_index("ix_visitors_qr_token",    "visitors", ["qr_token"], unique=True)


def downgrade():
    op.drop_table("visitors")
    op.drop_table("card_issues")
