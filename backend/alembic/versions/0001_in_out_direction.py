"""Add IN/OUT direction columns and indexes.

Revision ID: 0001_in_out_direction
Revises: None
Create Date: 2026-06-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_in_out_direction"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("ALTER TABLE camera_devices ADD COLUMN IF NOT EXISTS direction VARCHAR DEFAULT 'both'")
        op.execute("ALTER TABLE face_events ADD COLUMN IF NOT EXISTS direction VARCHAR")
    elif dialect == "sqlite":
        camera_cols = {row[1] for row in bind.exec_driver_sql("PRAGMA table_info(camera_devices)").fetchall()}
        event_cols = {row[1] for row in bind.exec_driver_sql("PRAGMA table_info(face_events)").fetchall()}
        if "direction" not in camera_cols:
            op.execute("ALTER TABLE camera_devices ADD COLUMN direction VARCHAR DEFAULT 'both'")
        if "direction" not in event_cols:
            op.execute("ALTER TABLE face_events ADD COLUMN direction VARCHAR")
    else:
        op.add_column("camera_devices", sa.Column("direction", sa.String(), server_default="both"))
        op.add_column("face_events", sa.Column("direction", sa.String()))

    op.execute("CREATE INDEX IF NOT EXISTS idx_face_events_direction ON face_events (direction)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_face_events_person_created ON face_events (person_id, created_at)")


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("DROP INDEX IF EXISTS idx_face_events_person_created")
        op.execute("DROP INDEX IF EXISTS idx_face_events_direction")
    elif dialect == "sqlite":
        op.execute("DROP INDEX IF EXISTS idx_face_events_person_created")
        op.execute("DROP INDEX IF EXISTS idx_face_events_direction")
    else:
        op.drop_index("idx_face_events_person_created", table_name="face_events")
        op.drop_index("idx_face_events_direction", table_name="face_events")
