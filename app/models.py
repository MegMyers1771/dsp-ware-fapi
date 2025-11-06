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
    
    # Связи
    tabs = relationship("Tab", back_populates="tag")
    boxes = relationship("Box", back_populates="tag")
    slots = relationship("Slot", back_populates="tag")
    items = relationship("Item", back_populates="tag")


# --- Tabs ---
class Tab(Base):
    __tablename__ = "tabs"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=True)
    description = Column(String, nullable=True)
    # Связи
    tag = relationship("Tag", back_populates="tabs")
    boxes = relationship("Box", back_populates="tab", cascade="all, delete")
    fields = relationship("TabField", back_populates="tab", cascade="all, delete")


# --- Tab fields (динамические параметры для айтемов этой вкладки) ---
class TabField(Base):
    __tablename__ = "tab_fields"

    id = Column(Integer, primary_key=True)
    tab_id = Column(Integer, ForeignKey("tabs.id"), nullable=False)
    name = Column(String, nullable=False)
    # field_type = Column(String, default="string")  # string, int, float, bool, date
    # required = Column(Boolean, default=False)
    # default_value = Column(String, nullable=True)
    
    allowed_values = Column(JSON, nullable=True)
    strong = Column(Boolean, default=False)  # если true, то значение должно быть из allowed_values

    tab = relationship("Tab", back_populates="fields")


# --- Boxes ---
class Box(Base):
    __tablename__ = "boxes"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    capacity = Column(Integer, default=10)
    slot_count = Column(Integer, default=0)
    color = Column(String, nullable=True)
    # zone = Column(String, nullable=True)
    description = Column(String, nullable=True)
    tab_id = Column(Integer, ForeignKey("tabs.id"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=True)

    # created_at = Column(DateTime, default=datetime.utcnow)

    # Связи
    tab = relationship("Tab", back_populates="boxes")
    slots = relationship("Slot", back_populates="box", cascade="all, delete")
    items = relationship("Item", back_populates="box", cascade="all, delete")
    tag = relationship("Tag", back_populates="boxes")
    
    # индекс на вкладку
    __table_args__ = (
        Index("idx_box_tab_name", "tab_id", "name"),
    )


# --- Slots ---
class Slot(Base):
    __tablename__ = "slots"

    id = Column(Integer, primary_key=True)
    box_id = Column(Integer, ForeignKey("boxes.id"), nullable=False)
    position = Column(Integer, nullable=False)
    max_qty = Column(Integer, default=10)
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=True)

    box = relationship("Box", back_populates="slots")
    items = relationship("Item", back_populates="slot", cascade="all, delete")
    tag = relationship("Tag", back_populates="slots")


# --- Items ---
class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    qty = Column(Integer, default=1)
    position = Column(Integer, nullable=True)
    metadata_json = Column(JSON, default={})
    tab_id = Column(Integer, ForeignKey("tabs.id"), nullable=False)
    box_id = Column(Integer, ForeignKey("boxes.id"), nullable=False)
    slot_id = Column(Integer, ForeignKey("slots.id"), nullable=True)
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=True)

    # created_at = Column(DateTime, default=datetime.utcnow)

    tab = relationship("Tab")
    box = relationship("Box", back_populates="items")
    slot = relationship("Slot", back_populates="items")
    tag = relationship("Tag", back_populates="items")
    
    # индекс на вкладку
    __table_args__ = (
        Index("idx_item_tab_name", "tab_id", "name"),
    )
