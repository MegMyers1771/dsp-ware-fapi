from datetime import datetime, UTC
import uuid
from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    DateTime,
    Boolean,
    JSON,
    Index,
    Text,
)
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


def utcnow() -> datetime:
    return datetime.now(UTC)


def generate_stable_key() -> str:
    return uuid.uuid4().hex


# --- Tags ---
class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    color = Column(String, default="#cccccc")
    tab_id = Column(Integer, ForeignKey("tabs.id", ondelete="SET NULL"), nullable=True)
    box_id = Column(Integer, ForeignKey("boxes.id", ondelete="SET NULL"), nullable=True)
    item_id = Column(Integer, ForeignKey("items.id", ondelete="SET NULL"), nullable=True)

    tab = relationship("Tab", foreign_keys=[tab_id])
    box = relationship("Box", foreign_keys=[box_id])
    item = relationship("Item", foreign_keys=[item_id])


# --- Statuses ---
class Status(Base):
    __tablename__ = "statuses"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    color = Column(String, default="#0d6efd")


# --- Tabs ---
class Tab(Base):
    __tablename__ = "tabs"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    enable_pos = Column(Boolean, nullable=False, default=True)
    tag_ids = Column(JSON, nullable=False, default=list)
    boxes = relationship("Box", back_populates="tab", cascade="all, delete")
    fields = relationship("TabField", back_populates="tab", cascade="all, delete")


# --- Tab fields (динамические параметры для айтемов этой вкладки) ---
class TabField(Base):
    __tablename__ = "tab_fields"

    id = Column(Integer, primary_key=True)
    tab_id = Column(Integer, ForeignKey("tabs.id"), nullable=False)
    name = Column(String, nullable=False)
    stable_key = Column(String, nullable=False, unique=True, default=generate_stable_key)
    
    allowed_values = Column(JSON, nullable=True)
    strong = Column(Boolean, default=False)  # если true, то значение должно быть из allowed_values

    tab = relationship("Tab", back_populates="fields")


# --- Boxes ---
class Box(Base):
    __tablename__ = "boxes"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    color = Column(String, nullable=True)
    description = Column(String, nullable=True)
    tab_id = Column(Integer, ForeignKey("tabs.id"), nullable=False)
    tag_ids = Column(JSON, nullable=False, default=list)


    tab = relationship("Tab", back_populates="boxes")
    items = relationship("Item", back_populates="box", cascade="all, delete")
    
    # индекс на вкладку
    __table_args__ = (
        Index("idx_box_tab_name", "tab_id", "name"),
    )


# --- Items ---
class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    qty = Column(Integer, nullable=False, default=1)
    box_position = Column(Integer, nullable=False, default=1)
    metadata_json = Column(JSON, default={})
    tab_id = Column(Integer, ForeignKey("tabs.id"), nullable=False)
    box_id = Column(Integer, ForeignKey("boxes.id"), nullable=False)
    tag_ids = Column(JSON, nullable=False, default=list)

    tab = relationship("Tab")
    box = relationship("Box", back_populates="items")
    
    # индекс на вкладку
    __table_args__ = (
        Index("idx_item_tab_name", "tab_id", "name"),
    )


# --- Issues ---
class Issue(Base):
    __tablename__ = "issues"

    id = Column(Integer, primary_key=True)
    status_id = Column(Integer, ForeignKey("statuses.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    status = relationship("Status")
    item_utilized = relationship("ItemUtilized", back_populates="issue", uselist=False)


# --- Item utilization history ---
class ItemUtilized(Base):
    __tablename__ = "item_utilized"

    id = Column(Integer, primary_key=True)
    issue_id = Column(Integer, ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, unique=True)
    item_snapshot = Column(Text, nullable=False)
    serial_number = Column(String, nullable=True)
    invoice_number = Column(String, nullable=True)
    responsible_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    issue = relationship("Issue", back_populates="item_utilized")
    responsible_user = relationship("User")

    @property
    def responsible_user_name(self) -> str | None:
        return getattr(self.responsible_user, "user_name", None)


# --- Users ---
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    user_name = Column(String, nullable=False, unique=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="viewer")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
