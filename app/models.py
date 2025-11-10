from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, ForeignKey, DateTime, Boolean, JSON, Index
)
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


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

    # created_at = Column(DateTime, default=datetime.utcnow)

    # Связи
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
    qty = Column(Integer, default=1)
    box_position = Column(Integer, nullable=False, default=1)
    metadata_json = Column(JSON, default={})
    tab_id = Column(Integer, ForeignKey("tabs.id"), nullable=False)
    box_id = Column(Integer, ForeignKey("boxes.id"), nullable=False)
    tag_ids = Column(JSON, nullable=False, default=list)

    # created_at = Column(DateTime, default=datetime.utcnow)

    tab = relationship("Tab")
    box = relationship("Box", back_populates="items")
    
    # индекс на вкладку
    __table_args__ = (
        Index("idx_item_tab_name", "tab_id", "name"),
    )
