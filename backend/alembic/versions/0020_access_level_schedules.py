"""Add weekly schedules to access levels.

Revision ID: 0020_access_level_schedules
Revises: 0019_face_event_source
"""

from alembic import op
import sqlalchemy as sa


revision = "0020_access_level_schedules"
down_revision = "0019_face_event_source"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "access_levels",
        sa.Column("schedule_config", sa.Text(), server_default="{}", nullable=True),
    )


def downgrade():
    op.drop_column("access_levels", "schedule_config")
