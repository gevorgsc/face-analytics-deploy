"""Add multiple card numbers to persons.

Revision ID: 0014_person_card_numbers
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_person_card_numbers"
down_revision = "0013_person_source"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("persons", sa.Column("card_numbers", sa.Text(), nullable=True))
    op.execute(
        """
        UPDATE persons
        SET card_numbers = CASE
            WHEN card_number IS NULL OR card_number = '' THEN '[]'
            ELSE '["' || replace(card_number, '"', '\\"') || '"]'
        END
        """
    )


def downgrade():
    op.drop_column("persons", "card_numbers")
