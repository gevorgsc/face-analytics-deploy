"""Add hierarchical departments and ACS person metadata.

Revision ID: 0011_person_management
Revises: 0010_access_levels
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_person_management"
down_revision = "0010_access_levels"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("departments.id", ondelete="CASCADE"), nullable=True),
        sa.Column("code", sa.String, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=True, server_default="0"),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
    )
    op.create_index("ix_departments_parent_id", "departments", ["parent_id"])
    op.create_index("ix_departments_code", "departments", ["code"], unique=True)

    columns = [
        sa.Column("employee_no", sa.String, nullable=True),
        sa.Column("first_name", sa.String, nullable=True),
        sa.Column("last_name", sa.String, nullable=True),
        sa.Column("department_id", sa.Integer, sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("gender", sa.String, nullable=True),
        sa.Column("position", sa.String, nullable=True),
        sa.Column("email", sa.String, nullable=True),
        sa.Column("valid_from", sa.DateTime, nullable=True),
        sa.Column("valid_to", sa.DateTime, nullable=True),
        sa.Column("employment_date", sa.DateTime, nullable=True),
        sa.Column("pin_code", sa.String, nullable=True),
        sa.Column("max_access_times", sa.Integer, nullable=True),
        sa.Column("super_access", sa.Integer, nullable=True, server_default="0"),
        sa.Column("extended_access", sa.Integer, nullable=True, server_default="0"),
        sa.Column("device_administrator", sa.Integer, nullable=True, server_default="0"),
        sa.Column("acs_sync_status", sa.String, nullable=True, server_default="local"),
        sa.Column("acs_sync_error", sa.Text, nullable=True),
    ]
    for column in columns:
        op.add_column("persons", column)

    op.create_index("ix_persons_employee_no", "persons", ["employee_no"], unique=True)
    op.create_index("ix_persons_department_id", "persons", ["department_id"])


def downgrade():
    op.drop_index("ix_persons_department_id", table_name="persons")
    op.drop_index("ix_persons_employee_no", table_name="persons")
    for name in [
        "acs_sync_error", "acs_sync_status", "device_administrator", "extended_access",
        "super_access", "max_access_times", "pin_code", "employment_date", "valid_to",
        "valid_from", "email", "position", "gender", "department_id", "last_name",
        "first_name", "employee_no",
    ]:
        op.drop_column("persons", name)
    op.drop_table("departments")
