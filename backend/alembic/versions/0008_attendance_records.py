"""Add attendance_records table and card_number to persons.

Revision ID: 0008_attendance_records
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_attendance_records"
down_revision = "0007_acs_http_port"
branch_labels = None
depends_on = None


def upgrade():
    # card_number on persons
    op.add_column("persons",
                  sa.Column("card_number", sa.String, nullable=True))
    op.create_index("ix_persons_card_number", "persons", ["card_number"])

    # attendance_records table
    op.create_table(
        "attendance_records",
        sa.Column("id",           sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("person_id",    sa.Integer,
                  sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("work_date",    sa.String(10), nullable=False),   # YYYY-MM-DD
        sa.Column("check_in_at",  sa.DateTime, nullable=True),
        sa.Column("check_out_at", sa.DateTime, nullable=True),
        sa.Column("work_minutes", sa.Integer,  nullable=True),
        sa.Column("status",       sa.String,   nullable=True, server_default="present"),
        sa.Column("is_manual",    sa.Integer,  nullable=True, server_default="0"),
        sa.Column("note",         sa.Text,     nullable=True),
        sa.Column("created_at",   sa.DateTime),
        sa.Column("updated_at",   sa.DateTime),
    )
    op.create_index("ix_attd_person_date",  "attendance_records", ["person_id", "work_date"],
                    unique=True)
    op.create_index("ix_attd_work_date",    "attendance_records", ["work_date"])
    op.create_index("ix_attd_status",       "attendance_records", ["status"])


def downgrade():
    op.drop_table("attendance_records")
    op.drop_index("ix_persons_card_number", table_name="persons")
    op.drop_column("persons", "card_number")
