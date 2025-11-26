"""change item serial_number to list

Revision ID: 4e59c2165a1f
Revises: 
Create Date: 2025-11-26 14:34:37.061642

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4e59c2165a1f'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # колонки уже есть; приводим их к тексту, т.к. хранение списков идёт через строку "SN1, SN2"
    # если тип уже TEXT/STRING — сработает быстро
    op.alter_column("items", "serial_number",
                    existing_type=sa.String(),
                    type_=sa.Text(),
                    existing_nullable=True)

def downgrade():
    # откат к предыдущему типу
    op.alter_column("items", "serial_number",
                    existing_type=sa.Text(),
                    type_=sa.String(),
                    existing_nullable=True)