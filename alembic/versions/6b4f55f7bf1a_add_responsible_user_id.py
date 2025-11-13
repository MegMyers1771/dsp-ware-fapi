"""link item utilized to users

Revision ID: 6b4f55f7bf1a
Revises: d0c4e1cf9a3b
Create Date: 2025-12-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6b4f55f7bf1a"
down_revision: Union[str, Sequence[str], None] = "d0c4e1cf9a3b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("item_utilized", sa.Column("responsible_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_item_utilized_responsible_user",
        "item_utilized",
        "users",
        ["responsible_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_column("item_utilized", "responsible")


def downgrade() -> None:
    op.add_column("item_utilized", sa.Column("responsible", sa.String(), nullable=False, server_default=""))
    op.execute("UPDATE item_utilized SET responsible = ''")
    op.alter_column("item_utilized", "responsible", server_default=None)
    op.drop_constraint("fk_item_utilized_responsible_user", "item_utilized", type_="foreignkey")
    op.drop_column("item_utilized", "responsible_user_id")
