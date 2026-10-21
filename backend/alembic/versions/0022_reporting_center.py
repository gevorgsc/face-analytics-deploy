"""Add report settings and immutable report execution history.

Revision ID: 0022_reporting_center
Revises: 0021_antipassback_pairs
"""

from alembic import op
import sqlalchemy as sa


revision = "0022_reporting_center"
# The deployed database already continues from the guard-tour and dual-auth
# migrations; attaching here keeps a single Alembic head.
down_revision = "1d375cba7bc4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("scheduled_reports", sa.Column("settings", sa.Text(), server_default="{}", nullable=True))
    op.add_column("scheduled_reports", sa.Column("last_run_status", sa.String(), nullable=True))
    op.add_column("scheduled_reports", sa.Column("last_run_message", sa.Text(), nullable=True))
    op.create_table(
        "report_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scheduled_report_id", sa.Integer(), sa.ForeignKey("scheduled_reports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("report_name", sa.String(), nullable=False),
        sa.Column("report_type", sa.String(), nullable=False),
        sa.Column("format", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="generated"),
        sa.Column("delivery_status", sa.String(), nullable=True),
        sa.Column("parameters", sa.Text(), nullable=True, server_default="{}"),
        sa.Column("file_name", sa.String(), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("initiated_by", sa.String(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_report_runs_scheduled_report_id", "report_runs", ["scheduled_report_id"])
    op.create_index("ix_report_runs_report_type", "report_runs", ["report_type"])
    op.create_index("ix_report_runs_status", "report_runs", ["status"])
    op.create_index("ix_report_runs_started_at", "report_runs", ["started_at"])


def downgrade():
    op.drop_index("ix_report_runs_started_at", table_name="report_runs")
    op.drop_index("ix_report_runs_status", table_name="report_runs")
    op.drop_index("ix_report_runs_report_type", table_name="report_runs")
    op.drop_index("ix_report_runs_scheduled_report_id", table_name="report_runs")
    op.drop_table("report_runs")
    op.drop_column("scheduled_reports", "last_run_message")
    op.drop_column("scheduled_reports", "last_run_status")
    op.drop_column("scheduled_reports", "settings")
