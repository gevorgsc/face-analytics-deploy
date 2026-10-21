"""Add full attendance groups, shifts, schedules, and requests.

Revision ID: 0017_full_attendance
"""

from alembic import op
import sqlalchemy as sa


revision = "0017_full_attendance"
down_revision = "0016_access_limit_state"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "attendance_shifts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("work_start", sa.String(), server_default="09:00"),
        sa.Column("work_end", sa.String(), server_default="18:00"),
        sa.Column("break_minutes", sa.Integer(), server_default="60"),
        sa.Column("grace_minutes", sa.Integer(), server_default="15"),
        sa.Column("early_minutes", sa.Integer(), server_default="0"),
        sa.Column("minimum_minutes", sa.Integer(), server_default="240"),
        sa.Column("work_days", sa.String(), server_default="1,2,3,4,5"),
        sa.Column("is_overnight", sa.Integer(), server_default="0"),
        sa.Column("is_active", sa.Integer(), server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "attendance_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(), server_default="#3B82F6"),
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("attendance_shifts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Integer(), server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "attendance_schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("person_id", sa.Integer(), sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("attendance_groups.id", ondelete="SET NULL"), nullable=True),
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("attendance_shifts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("valid_from", sa.String(), nullable=False),
        sa.Column("valid_to", sa.String(), nullable=True),
        sa.Column("is_active", sa.Integer(), server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_attendance_schedules_person_id", "attendance_schedules", ["person_id"])
    op.create_index("ix_attendance_schedules_group_id", "attendance_schedules", ["group_id"])
    op.create_index("ix_attendance_schedules_shift_id", "attendance_schedules", ["shift_id"])
    op.create_table(
        "attendance_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("person_id", sa.Integer(), sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_type", sa.String(), nullable=False),
        sa.Column("date_from", sa.String(), nullable=False),
        sa.Column("date_to", sa.String(), nullable=False),
        sa.Column("start_time", sa.String(), nullable=True),
        sa.Column("end_time", sa.String(), nullable=True),
        sa.Column("correction_in", sa.String(), nullable=True),
        sa.Column("correction_out", sa.String(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), server_default="pending"),
        sa.Column("reviewer_note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_attendance_requests_person_id", "attendance_requests", ["person_id"])
    op.create_index("ix_attendance_requests_request_type", "attendance_requests", ["request_type"])
    op.create_index("ix_attendance_requests_date_from", "attendance_requests", ["date_from"])
    op.create_index("ix_attendance_requests_status", "attendance_requests", ["status"])
    op.execute(
        """
        INSERT INTO attendance_shifts
            (name, work_start, work_end, break_minutes, grace_minutes,
             early_minutes, minimum_minutes, work_days, is_overnight, is_active)
        VALUES
            ('Office Shift', '09:00', '18:00', 60, 15, 0, 240, '1,2,3,4,5', 0, 1)
        """
    )
    op.execute(
        """
        INSERT INTO attendance_groups (name, description, color, shift_id, is_active)
        SELECT 'All Employees', 'Default attendance group', '#3B82F6', id, 1
        FROM attendance_shifts
        WHERE name = 'Office Shift'
        """
    )


def downgrade():
    op.drop_table("attendance_requests")
    op.drop_table("attendance_schedules")
    op.drop_table("attendance_groups")
    op.drop_table("attendance_shifts")
