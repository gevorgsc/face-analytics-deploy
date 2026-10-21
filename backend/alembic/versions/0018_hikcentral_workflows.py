"""Add HikCentral-inspired visitor and attendance workflows.

Revision ID: 0018_hikcentral_workflows
Revises: aa6aae30ba93
"""

from alembic import op
import sqlalchemy as sa


revision = "0018_hikcentral_workflows"
down_revision = "aa6aae30ba93"
branch_labels = None
depends_on = None


def upgrade():
    for name, column in [
        ("host_person_id", sa.Column("host_person_id", sa.Integer(), sa.ForeignKey("persons.id", ondelete="SET NULL"), nullable=True)),
        ("id_type", sa.Column("id_type", sa.String(), nullable=True)),
        ("id_number", sa.Column("id_number", sa.String(), nullable=True)),
        ("photo_path", sa.Column("photo_path", sa.String(), nullable=True)),
        ("visitor_group", sa.Column("visitor_group", sa.String(), nullable=True)),
        ("access_level_id", sa.Column("access_level_id", sa.Integer(), sa.ForeignKey("access_levels.id", ondelete="SET NULL"), nullable=True)),
        ("approval_status", sa.Column("approval_status", sa.String(), server_default="pending", nullable=True)),
        ("reservation_code", sa.Column("reservation_code", sa.String(), nullable=True)),
        ("self_service_token", sa.Column("self_service_token", sa.String(), nullable=True)),
        ("consent_accepted", sa.Column("consent_accepted", sa.Integer(), server_default="0", nullable=True)),
        ("source", sa.Column("source", sa.String(), server_default="operator", nullable=True)),
        ("approved_by", sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)),
        ("approved_at", sa.Column("approved_at", sa.DateTime(), nullable=True)),
    ]:
        op.add_column("visitors", column)
    op.create_index("ix_visitors_host_person_id", "visitors", ["host_person_id"])
    op.create_index("ix_visitors_id_number", "visitors", ["id_number"])
    op.create_index("ix_visitors_approval_status", "visitors", ["approval_status"])
    op.create_index("ix_visitors_reservation_code", "visitors", ["reservation_code"], unique=True)
    op.create_index("ix_visitors_self_service_token", "visitors", ["self_service_token"], unique=True)

    op.create_table(
        "visitor_watch_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(), nullable=True),
        sa.Column("organization", sa.String(), nullable=True),
        sa.Column("id_type", sa.String(), nullable=True),
        sa.Column("id_number", sa.String(), nullable=True),
        sa.Column("match_method", sa.String(), server_default="any"),
        sa.Column("watch_type", sa.String(), server_default="important"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Integer(), server_default="1"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_visitor_watch_entries_full_name", "visitor_watch_entries", ["full_name"])
    op.create_index("ix_visitor_watch_entries_organization", "visitor_watch_entries", ["organization"])
    op.create_index("ix_visitor_watch_entries_id_number", "visitor_watch_entries", ["id_number"])

    op.create_table(
        "visitor_access_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("visitor_id", sa.Integer(), sa.ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("access_control_devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=True),
        sa.Column("operator_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_visitor_access_records_visitor_id", "visitor_access_records", ["visitor_id"])
    op.create_index("ix_visitor_access_records_action", "visitor_access_records", ["action"])
    op.create_index("ix_visitor_access_records_occurred_at", "visitor_access_records", ["occurred_at"])

    op.add_column("attendance_records", sa.Column("break_minutes", sa.Integer(), server_default="0"))
    op.add_column("attendance_records", sa.Column("overtime_minutes", sa.Integer(), server_default="0"))
    op.add_column("attendance_records", sa.Column("calculation_version", sa.Integer(), server_default="1"))
    op.add_column("attendance_shifts", sa.Column("calculation_mode", sa.String(), server_default="first_last"))
    op.add_column("attendance_shifts", sa.Column("overtime_enabled", sa.Integer(), server_default="0"))
    op.add_column("attendance_shifts", sa.Column("overtime_after_minutes", sa.Integer(), server_default="0"))
    op.add_column("attendance_shifts", sa.Column("min_punch_interval", sa.Integer(), server_default="2"))
    op.create_table(
        "attendance_breaks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("attendance_shifts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("start_time", sa.String(), nullable=False),
        sa.Column("end_time", sa.String(), nullable=False),
        sa.Column("paid", sa.Integer(), server_default="0"),
        sa.Column("is_active", sa.Integer(), server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_attendance_breaks_shift_id", "attendance_breaks", ["shift_id"])


def downgrade():
    op.drop_table("attendance_breaks")
    for name in ("min_punch_interval", "overtime_after_minutes", "overtime_enabled", "calculation_mode"):
        op.drop_column("attendance_shifts", name)
    for name in ("calculation_version", "overtime_minutes", "break_minutes"):
        op.drop_column("attendance_records", name)
    op.drop_table("visitor_access_records")
    op.drop_table("visitor_watch_entries")
    for name in (
        "approved_at", "approved_by", "source", "consent_accepted", "self_service_token",
        "reservation_code", "approval_status", "access_level_id", "visitor_group",
        "photo_path", "id_number", "id_type", "host_person_id",
    ):
        op.drop_column("visitors", name)
