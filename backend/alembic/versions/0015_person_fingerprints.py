"""Add fingerprint templates to persons.

Revision ID: 0015_person_fingerprints
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_person_fingerprints"
down_revision = "0014_person_card_numbers"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("persons", sa.Column("fingerprints", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("persons", "fingerprints")
