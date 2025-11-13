"""add stable keys to tab fields and metadata

Revision ID: b1b45e2adf30
Revises: df6b7c1d3e75
Create Date: 2025-11-20 00:00:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1b45e2adf30"
down_revision: Union[str, Sequence[str], None] = "df6b7c1d3e75"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tab_fields",
        sa.Column("stable_key", sa.String(length=64), nullable=True),
    )

    bind = op.get_bind()
    metadata = sa.MetaData()
    tab_fields = sa.Table("tab_fields", metadata, autoload_with=bind)
    items = sa.Table("items", metadata, autoload_with=bind)

    key_map = {}

    tab_field_rows = bind.execute(
        sa.select(tab_fields.c.id, tab_fields.c.tab_id, tab_fields.c.name)
    ).fetchall()

    for row in tab_field_rows:
        stable_key = uuid.uuid4().hex
        key_map[(row.tab_id, row.name)] = stable_key
        bind.execute(
            tab_fields.update()
            .where(tab_fields.c.id == row.id)
            .values(stable_key=stable_key)
        )

    item_rows = bind.execute(
        sa.select(items.c.id, items.c.tab_id, items.c.metadata_json)
    ).fetchall()

    for row in item_rows:
        metadata_json = row.metadata_json or {}
        if not isinstance(metadata_json, dict) or not metadata_json:
            continue

        updated = {}
        changed = False

        for key, value in metadata_json.items():
            mapped_key = key_map.get((row.tab_id, key))
            if mapped_key:
                updated[mapped_key] = value
                changed = True
            else:
                updated[key] = value

        if changed:
            bind.execute(
                items.update()
                .where(items.c.id == row.id)
                .values(metadata_json=updated)
            )

    op.alter_column("tab_fields", "stable_key", nullable=False)
    op.create_unique_constraint(
        "uq_tab_fields_stable_key", "tab_fields", ["stable_key"]
    )


def downgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    tab_fields = sa.Table("tab_fields", metadata, autoload_with=bind)
    items = sa.Table("items", metadata, autoload_with=bind)

    key_to_name = {}
    tab_field_rows = bind.execute(
        sa.select(tab_fields.c.tab_id, tab_fields.c.name, tab_fields.c.stable_key)
    ).fetchall()

    for row in tab_field_rows:
        key_to_name[row.stable_key] = (row.tab_id, row.name)

    item_rows = bind.execute(
        sa.select(items.c.id, items.c.tab_id, items.c.metadata_json)
    ).fetchall()

    for row in item_rows:
        metadata_json = row.metadata_json or {}
        if not isinstance(metadata_json, dict) or not metadata_json:
            continue

        updated = {}
        changed = False

        for key, value in metadata_json.items():
            target = key_to_name.get(key)
            if target and target[0] == row.tab_id:
                updated[target[1]] = value
                changed = True
            else:
                updated[key] = value

        if changed:
            bind.execute(
                items.update()
                .where(items.c.id == row.id)
                .values(metadata_json=updated)
            )

    op.drop_constraint("uq_tab_fields_stable_key", "tab_fields", type_="unique")
    op.drop_column("tab_fields", "stable_key")
