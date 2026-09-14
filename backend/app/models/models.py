import uuid
import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Enum, Integer, Float, UniqueConstraint
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
    documents = relationship("Document", back_populates="subject", cascade="all, delete-orphan")
    topics = relationship("Topic", back_populates="subject", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    subject_id = Column(UUID(as_uuid=False), ForeignKey("subjects.id"))
    filename = Column(String, nullable=False)
    content_type = Column(Enum(ContentType), default=ContentType.other)
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow)
    chunk_count = Column(Integer, default=0)

    subject = relationship("Subject", back_populates="documents")
    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    """
    Metadata record for a chunk of text that also lives in ChromaDB.
    We keep a lightweight Postgres row for querying/joins, while the
    actual embedding + text lives in the vector store.
    """
    __tablename__ = "chunks"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    document_id = Column(UUID(as_uuid=False), ForeignKey("documents.id", ondelete="CASCADE"))
    chroma_id = Column(String, nullable=False)  # id used in the Chroma collection
    text_preview = Column(Text)  # first ~200 chars, for quick display
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    document = relationship("Document", back_populates="chunks")


class Topic(Base):
    __tablename__ = "topics"
    __table_args__ = (UniqueConstraint("subject_id", "normalized_name", name="uq_topic_subject_name"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    subject_id = Column(UUID(as_uuid=False), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    normalized_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    frequency = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    subject = relationship("Subject", back_populates="topics")


class TopicRelationship(Base):
    __tablename__ = "topic_relationships"
    __table_args__ = (UniqueConstraint("subject_id", "source_topic_id", "target_topic_id", "relationship_type", name="uq_topic_relationship"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    subject_id = Column(UUID(as_uuid=False), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    source_topic_id = Column(UUID(as_uuid=False), ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    target_topic_id = Column(UUID(as_uuid=False), ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    relationship_type = Column(String, nullable=False, default="related")
    weight = Column(Float, default=0.5)
    evidence = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class QuestionTopicMapping(Base):
    __tablename__ = "question_topic_mappings"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    subject_id = Column(UUID(as_uuid=False), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(UUID(as_uuid=False), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    question_chroma_id = Column(String, nullable=False, index=True)
    question_preview = Column(String, nullable=False)
    topic_id = Column(UUID(as_uuid=False), ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    confidence = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
