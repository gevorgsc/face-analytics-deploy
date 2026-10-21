"""Add access_control_devices and acs_access_events tables.

Revision ID: 0006_access_control_devices
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_access_control_devices"
down_revision = "0005_face_event_camera_id"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "access_control_devices",
        sa.Column("id",         sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name",       sa.String,  nullable=False),
        sa.Column("ip_address", sa.String,  nullable=False),
        sa.Column("sdk_port",   sa.Integer, default=8000),
        sa.Column("username",   sa.String,  default="admin"),
        sa.Column("password",   sa.String,  nullable=True),
        sa.Column("door_count", sa.Integer, default=1),
        sa.Column("location",   sa.String,  nullable=True),
        sa.Column("notes",      sa.Text,    nullable=True),
        sa.Column("is_active",  sa.Integer, default=1),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
    )
    op.create_index("ix_access_control_devices_ip", "access_control_devices", ["ip_address"])
    op.create_index("ix_access_control_devices_active", "access_control_devices", ["is_active"])

    op.create_table(
        "acs_access_events",
        sa.Column("id",          sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("device_id",   sa.Integer, sa.ForeignKey("access_control_devices.id",
                                                            ondelete="CASCADE"), nullable=False),
        sa.Column("door_no",     sa.Integer, nullable=True),
        sa.Column("card_number", sa.String,  nullable=True),
        sa.Column("person_id",   sa.Integer, sa.ForeignKey("persons.id",
                                                            ondelete="SET NULL"), nullable=True),
        sa.Column("event_type",  sa.String,  nullable=False),
        sa.Column("verify_mode", sa.String,  nullable=True),
        sa.Column("error_code",  sa.Integer, nullable=True),
        sa.Column("created_at",  sa.DateTime),
    )
    op.create_index("ix_acs_events_device_id",   "acs_access_events", ["device_id"])
    op.create_index("ix_acs_events_door_no",     "acs_access_events", ["door_no"])
    op.create_index("ix_acs_events_card_number", "acs_access_events", ["card_number"])
    op.create_index("ix_acs_events_person_id",   "acs_access_events", ["person_id"])
    op.create_index("ix_acs_events_event_type",  "acs_access_events", ["event_type"])
    op.create_index("ix_acs_events_created_at",  "acs_access_events", ["created_at"])


def downgrade():
    op.drop_table("acs_access_events")
    op.drop_table("access_control_devices")
