"""Add ACS event denial reason and direction.

Revision ID: 0012_acs_event_details
Revises: 0011_person_management
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_acs_event_details"
down_revision = "0011_person_management"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("acs_access_events")}

    if "denial_reason" not in columns:
        op.add_column("acs_access_events", sa.Column("denial_reason", sa.String(), nullable=True))
    if "direction" not in columns:
        op.add_column("acs_access_events", sa.Column("direction", sa.String(), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("acs_access_events")}

    if "direction" in columns:
        op.drop_column("acs_access_events", "direction")
    if "denial_reason" in columns:
        op.drop_column("acs_access_events", "denial_reason")
