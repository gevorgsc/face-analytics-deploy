"""Make anti-passback rules paired-door and stateful.

Revision ID: 0021_antipassback_pairs
Revises: 0020_access_level_schedules
"""

from alembic import op
import sqlalchemy as sa


revision = "0021_antipassback_pairs"
down_revision = "0020_access_level_schedules"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("acs_antipassback_rules", sa.Column("door_no_in", sa.Integer(), nullable=True))
    op.add_column("acs_antipassback_rules", sa.Column("door_no_out", sa.Integer(), nullable=True))
    op.add_column(
        "acs_antipassback_rules",
        sa.Column("reset_hours", sa.Integer(), server_default="12", nullable=True),
    )
    op.execute(
        """
        UPDATE acs_antipassback_rules
        SET door_no_in = door_no, door_no_out = door_no
        WHERE door_no_in IS NULL OR door_no_out IS NULL
        """
    )
    op.add_column(
        "acs_antipassback_states",
        sa.Column(
            "rule_id",
            sa.Integer(),
            sa.ForeignKey("acs_antipassback_rules.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_acs_antipassback_states_rule_id",
        "acs_antipassback_states",
        ["rule_id"],
    )
    op.add_column(
        "acs_antipassback_violations",
        sa.Column(
            "rule_id",
            sa.Integer(),
            sa.ForeignKey("acs_antipassback_rules.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "acs_antipassback_violations",
        sa.Column("card_number", sa.String(), nullable=True),
    )


def downgrade():
    op.drop_column("acs_antipassback_violations", "card_number")
    op.drop_column("acs_antipassback_violations", "rule_id")
    op.drop_index(
        "ix_acs_antipassback_states_rule_id",
        table_name="acs_antipassback_states",
    )
    op.drop_column("acs_antipassback_states", "rule_id")
    op.drop_column("acs_antipassback_rules", "reset_hours")
    op.drop_column("acs_antipassback_rules", "door_no_out")
    op.drop_column("acs_antipassback_rules", "door_no_in")
