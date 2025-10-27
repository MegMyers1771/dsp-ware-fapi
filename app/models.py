from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Float
from sqlalchemy.orm import relationship
from app.db import Base

class Tab(Base):
    __tablename__ = "tabs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    items = relationship("Item", back_populates="tab")


class Box(Base):
    __tablename__ = "boxes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    color = Column(String)
    zone = Column(String)
    description = Column(String)

    items = relationship("Item", back_populates="box")


class Marker(Base):
    __tablename__ = "markers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    color = Column(String)
    description = Column(String)


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    qty = Column(Integer, default=0)
    attributes = Column(JSON)
    tab_id = Column(Integer, ForeignKey("tabs.id"))
    box_id = Column(Integer, ForeignKey("boxes.id"))
    marker_id = Column(Integer, ForeignKey("markers.id"), nullable=True)

    tab = relationship("Tab", back_populates="items")
    box = relationship("Box", back_populates="items")
    marker = relationship("Marker")


class AnalogGroup(Base):
    __tablename__ = "analog_groups"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String)
    description = Column(String)

    meta_entries = relationship("Metadata", back_populates="group")



class Metadata(Base):
    __tablename__ = "metadata"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("items.id"))
    group_id = Column(Integer, ForeignKey("analog_groups.id"))
    hash = Column(String, unique=True)
    params = Column(JSON)
    similarity = Column(Float, default=1.0)

    group = relationship("AnalogGroup", back_populates="meta_entries")

