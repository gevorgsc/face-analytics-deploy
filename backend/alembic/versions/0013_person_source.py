"""Add source column to persons to separate ACS and Face Analytics records.

Revision ID: 0013_person_source
Revises: 0012_acs_event_details
"""

from alembic import op
import sqlalchemy as sa


revision = "0013_person_source"
down_revision = "0012_acs_event_details"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("persons")}

    if "source" not in columns:
        op.add_column("persons", sa.Column("source", sa.String(), nullable=True))
        # Backfill: persons with employee_no set were registered via ACS
        bind.execute(sa.text(
            "UPDATE persons SET source = 'acs' "
            "WHERE employee_no IS NOT NULL AND employee_no != ''"
        ))
        # Everything else is a Face Analytics record
        bind.execute(sa.text(
            "UPDATE persons SET source = 'fa' "
            "WHERE source IS NULL"
        ))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("persons")}

    if "source" in columns:
        op.drop_column("persons", "source")
