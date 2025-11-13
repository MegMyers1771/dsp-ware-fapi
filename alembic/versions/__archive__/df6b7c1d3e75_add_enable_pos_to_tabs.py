"""add enable_pos flag to tabs

Revision ID: df6b7c1d3e75
Revises: c5ab93dbbc31
Create Date: 2025-11-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'df6b7c1d3e75'
down_revision: Union[str, Sequence[str], None] = 'c5ab93dbbc31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'tabs',
        sa.Column('enable_pos', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.execute("UPDATE tabs SET enable_pos = TRUE")
    op.alter_column('tabs', 'enable_pos', server_default=None)


def downgrade() -> None:
    op.drop_column('tabs', 'enable_pos')
