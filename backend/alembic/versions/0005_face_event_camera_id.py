"""Add nullable camera_id to face_events.

Revision ID: 0005_face_event_camera_id
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_face_event_camera_id"
down_revision = "0004_floor_maps"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "face_events",
        sa.Column("camera_id", sa.Integer, sa.ForeignKey("camera_devices.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_face_events_camera_id", "face_events", ["camera_id"])


def downgrade():
    op.drop_index("ix_face_events_camera_id", table_name="face_events")
    op.drop_column("face_events", "camera_id")
