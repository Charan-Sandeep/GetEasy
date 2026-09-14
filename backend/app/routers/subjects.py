from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.models import Subject, User, Topic, TopicRelationship, QuestionTopicMapping, Document
from app.services.auth_service import get_current_user, require_subject_owner
from app.services import vector_store, topic_service

router = APIRouter(prefix="/subjects", tags=["subjects"])


class SubjectCreate(BaseModel):
    name: str


@router.post("")
def create_subject(payload: SubjectCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    subject = Subject(name=payload.name.strip(), owner_id=user.id)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return {"id": subject.id, "name": subject.name}


@router.get("")
def list_subjects(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    subjects = db.query(Subject).filter(Subject.owner_id == user.id).order_by(Subject.created_at.desc()).all()
    return [{"id": s.id, "name": s.name} for s in subjects]


@router.get("/{subject_id}/knowledge-graph")
def knowledge_graph(subject_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_subject_owner(subject_id, user, db)
    topics = db.query(Topic).filter(Topic.subject_id == subject_id).order_by(Topic.frequency.desc()).all()
    edges = db.query(TopicRelationship).filter(TopicRelationship.subject_id == subject_id).all()
    names = {str(topic.id): topic.name for topic in topics}
    return {
        "nodes": [{"id": str(topic.id), "name": topic.name, "frequency": topic.frequency} for topic in topics],
        "edges": [{"source": str(edge.source_topic_id), "target": str(edge.target_topic_id), "type": edge.relationship_type,
                   "weight": edge.weight, "evidence": edge.evidence} for edge in edges],
        "labels": names,
    }


@router.post("/{subject_id}/knowledge-graph/rebuild")
def rebuild_graph(subject_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_subject_owner(subject_id, user, db)
    result = vector_store.get_subject_chunks(subject_id)
    return topic_service.rebuild_subject_graph(db, subject_id, result.get("documents") or [])


@router.get("/{subject_id}/topics/{topic_id}/prerequisites")
def prerequisites(subject_id: str, topic_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_subject_owner(subject_id, user, db)
    topic = db.query(Topic).filter(Topic.id == topic_id, Topic.subject_id == subject_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found.")
    required = topic_service.prerequisite_topics(db, subject_id, topic_id)
    return {"topic": topic.name, "prerequisites": [{"id": str(item.id), "name": item.name} for item in required]}


@router.get("/{subject_id}/question-mappings")
def question_mappings(subject_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_subject_owner(subject_id, user, db)
    rows = db.query(QuestionTopicMapping, Topic).join(Topic, QuestionTopicMapping.topic_id == Topic.id).filter(
        QuestionTopicMapping.subject_id == subject_id).all()
    return [{"question": mapping.question_preview, "topic": topic.name, "confidence": mapping.confidence,
             "document_id": str(mapping.document_id)} for mapping, topic in rows]


@router.get("/{subject_id}/analytics")
def analytics(subject_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_subject_owner(subject_id, user, db)
    documents = db.query(Document).filter(Document.subject_id == subject_id).all()
    counts = {}
    for document in documents:
        key = document.content_type.value if hasattr(document.content_type, "value") else str(document.content_type)
        counts[key] = counts.get(key, 0) + 1
    return {"documents": len(documents), "chunks": sum(int(document.chunk_count or 0) for document in documents),
            "by_content_type": counts, "topics": db.query(Topic).filter(Topic.subject_id == subject_id).count(),
            "question_mappings": db.query(QuestionTopicMapping).filter(QuestionTopicMapping.subject_id == subject_id).count()}
