"""Add floor_maps table and camera map position fields.

Revision ID: 0004_floor_maps
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_floor_maps"
down_revision = "0003_composite_indexes"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "floor_maps",
        sa.Column("id",         sa.Integer,  primary_key=True),
        sa.Column("name",       sa.String,   nullable=False),
        sa.Column("image_path", sa.String,   nullable=False),
        sa.Column("width",      sa.Integer,  nullable=True),
        sa.Column("height",     sa.Integer,  nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
    )

    op.add_column("camera_devices", sa.Column("map_id", sa.Integer, sa.ForeignKey("floor_maps.id", ondelete="SET NULL"), nullable=True))
    op.add_column("camera_devices", sa.Column("map_x",  sa.Float,   nullable=True))
    op.add_column("camera_devices", sa.Column("map_y",  sa.Float,   nullable=True))


def downgrade():
    op.drop_column("camera_devices", "map_y")
    op.drop_column("camera_devices", "map_x")
    op.drop_column("camera_devices", "map_id")
    op.drop_table("floor_maps")
