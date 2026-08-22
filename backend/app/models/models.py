import uuid
import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class ContentType(str, enum.Enum):
    notes = "notes"
    textbook = "textbook"
    questions = "questions"
    labs = "labs"
    other = "other"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subjects = relationship("Subject", back_populates="owner")


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)  # e.g. "DBMS", "Operating Systems"
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("User", back_populates="subjects")
    documents = relationship("Document", back_populates="subject")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    subject_id = Column(UUID(as_uuid=False), ForeignKey("subjects.id"))
    filename = Column(String, nullable=False)
    content_type = Column(Enum(ContentType), default=ContentType.other)
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow)
    chunk_count = Column(String, default="0")

    subject = relationship("Subject", back_populates="documents")


class Chunk(Base):
    """
    Metadata record for a chunk of text that also lives in ChromaDB.
    We keep a lightweight Postgres row for querying/joins, while the
    actual embedding + text lives in the vector store.
    """
    __tablename__ = "chunks"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    document_id = Column(UUID(as_uuid=False), ForeignKey("documents.id"))
    chroma_id = Column(String, nullable=False)  # id used in the Chroma collection
    text_preview = Column(Text)  # first ~200 chars, for quick display
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
