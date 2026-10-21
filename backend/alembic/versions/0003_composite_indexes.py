"""Add composite indexes for performance.

Most frequent queries:
  - Events list:     (created_at DESC, person_id)
  - Attendance:      (person_id, created_at DESC)
  - Camera stats:    (camera_name, created_at)
  - Person events:   (person_id, is_low_quality, created_at)
  - Audit logs:      (user_id, created_at DESC)
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_composite_indexes"
down_revision = "0002_enterprise_schema"
branch_labels = None
depends_on = None


def upgrade():
    # face_events — most queried table
    op.create_index("ix_fe_created_desc",     "face_events", ["created_at"],              postgresql_ops={"created_at": "DESC"})
    op.create_index("ix_fe_person_created",   "face_events", ["person_id", "created_at"])
    op.create_index("ix_fe_camera_created",   "face_events", ["camera_name", "created_at"])
    op.create_index("ix_fe_quality_created",  "face_events", ["is_low_quality", "created_at"])
    op.create_index("ix_fe_direction",        "face_events", ["direction"])

    # persons — filter by type is common
    op.create_index("ix_persons_type_seen",   "persons", ["person_type", "last_seen"])

    # audit_logs
    op.create_index("ix_audit_user_created",  "audit_logs", ["user_id", "created_at"])


def downgrade():
    op.drop_index("ix_fe_created_desc",    "face_events")
    op.drop_index("ix_fe_person_created",  "face_events")
    op.drop_index("ix_fe_camera_created",  "face_events")
    op.drop_index("ix_fe_quality_created", "face_events")
    op.drop_index("ix_fe_direction",       "face_events")
    op.drop_index("ix_persons_type_seen",  "persons")
    op.drop_index("ix_audit_user_created", "audit_logs")
