"""Add http_port and control_mode to access_control_devices.

Revision ID: 0007_acs_http_port
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_acs_http_port"
down_revision = "0006_access_control_devices"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("access_control_devices",
                  sa.Column("http_port", sa.Integer, nullable=True, server_default="80"))
    op.add_column("access_control_devices",
                  sa.Column("control_mode", sa.String, nullable=True, server_default="isapi"))


def downgrade():
    op.drop_column("access_control_devices", "control_mode")
    op.drop_column("access_control_devices", "http_port")
