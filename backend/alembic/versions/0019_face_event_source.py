"""Separate Face Analytics events from access-controller snapshots.

Revision ID: 0019_face_event_source
Revises: 0018_hikcentral_workflows
"""

from alembic import op
import sqlalchemy as sa


revision = "0019_face_event_source"
down_revision = "0018_hikcentral_workflows"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "face_events",
        sa.Column(
            "source",
            sa.String(),
            server_default="face_analytics",
            nullable=False,
        ),
    )
    op.execute(
        """
        UPDATE face_events
        SET source = 'access_controller'
        WHERE raw_payload LIKE 'ACS serial=%'
        """
    )
    op.create_index("ix_face_events_source", "face_events", ["source"])


def downgrade():
    op.drop_index("ix_face_events_source", table_name="face_events")
    op.drop_column("face_events", "source")
