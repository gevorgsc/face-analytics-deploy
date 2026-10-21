"""Add access-limit state and device event serial numbers.

Revision ID: 0016_access_limit_state
"""

from alembic import op
import sqlalchemy as sa


revision = "0016_access_limit_state"
down_revision = "0015_person_fingerprints"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "persons",
        sa.Column("access_times_used", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "persons",
        sa.Column("acs_active", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("persons", sa.Column("acs_deactivated_at", sa.DateTime(), nullable=True))
    op.create_index("ix_persons_acs_active", "persons", ["acs_active"])
    op.add_column(
        "acs_access_events",
        sa.Column("source_serial_no", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_acs_access_events_source_serial_no",
        "acs_access_events",
        ["source_serial_no"],
    )


def downgrade():
    op.drop_index("ix_acs_access_events_source_serial_no", table_name="acs_access_events")
    op.drop_column("acs_access_events", "source_serial_no")
    op.drop_index("ix_persons_acs_active", table_name="persons")
    op.drop_column("persons", "acs_deactivated_at")
    op.drop_column("persons", "acs_active")
    op.drop_column("persons", "access_times_used")
