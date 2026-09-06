from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.models import Subject

router = APIRouter(prefix="/subjects", tags=["subjects"])


class SubjectCreate(BaseModel):
    name: str
    owner_id: str


@router.post("")
def create_subject(payload: SubjectCreate, db: Session = Depends(get_db)):
    subject = Subject(name=payload.name, owner_id=payload.owner_id)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return {"id": subject.id, "name": subject.name}


@router.get("/user/{owner_id}")
def list_subjects(owner_id: str, db: Session = Depends(get_db)):
    subjects = db.query(Subject).filter(Subject.owner_id == owner_id).all()
    return [{"id": s.id, "name": s.name} for s in subjects]
