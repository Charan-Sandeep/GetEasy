from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.services import vector_store, llm_service
from app.database import get_db
from app.models.models import User, Topic, Document, ContentType
from app.services import document_processor
from app.services.auth_service import get_current_user, require_subject_owner
from app.services.topic_service import prerequisite_topics

router = APIRouter(prefix="/query", tags=["query"])


class QueryRequest(BaseModel):
    subject_id: str
    question: str
    content_type: str | None = None  # optional filter: notes/textbook/questions/labs
    top_k: int = Field(default=5, ge=1, le=10)
    mode: str = "explain"  # explain, solve_question, synthesize
    level: str = "intermediate"  # beginner, intermediate, advanced
    history: list[dict] = Field(default_factory=list, max_length=12)


class QuestionBankRequest(BaseModel):
    subject_id: str
    document_id: str
    level: str = "intermediate"


@router.post("")
def ask(req: QueryRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_subject_owner(req.subject_id, user, db)
    mode = req.mode if req.mode in {"explain", "solve_question", "synthesize"} else "explain"
    level = req.level if req.level in {"beginner", "intermediate", "advanced"} else "intermediate"
    results = vector_store.query(
        question=req.question,
        subject_id=req.subject_id,
        top_k=req.top_k,
        content_type=req.content_type,
    )

    retrieved_chunks = results["documents"][0] if results["documents"] else []
    retrieved_metadatas = results["metadatas"][0] if results["metadatas"] else []

    matching_topics = db.query(Topic).filter(Topic.subject_id == req.subject_id).all()
    question_lower = req.question.lower()
    selected_topic = next((topic for topic in matching_topics if topic.normalized_name in question_lower), None)
    prerequisites = [topic.name for topic in prerequisite_topics(db, req.subject_id, str(selected_topic.id))] if selected_topic else []
    answer = llm_service.generate_answer(
        question=req.question,
        retrieved_chunks=retrieved_chunks,
        retrieved_metadatas=retrieved_metadatas,
        mode=mode,
        level=level,
        prerequisites=prerequisites,
        history=req.history,
    )

    sources = list({m.get("filename") for m in retrieved_metadatas})

    return {
        "answer": answer,
        "sources": sources,
        "chunks_used": len(retrieved_chunks),
        "mode": mode,
        "level": level,
        "topic": selected_topic.name if selected_topic else None,
        "prerequisites": prerequisites,
    }


@router.post("/question-bank/solve")
def solve_question_bank(req: QuestionBankRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Solve every numbered question in one uploaded question-bank document."""
    require_subject_owner(req.subject_id, user, db)
    document = db.query(Document).filter(Document.id == req.document_id, Document.subject_id == req.subject_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Question-bank document not found in this subject.")
    if document.content_type != ContentType.questions:
        raise HTTPException(status_code=400, detail="Choose a document categorized as questions to use the question-bank solver.")
    paper = vector_store.get_document_chunks(str(document.id))
    questions = document_processor.extract_numbered_questions("\n".join(paper.get("documents") or []))
    if not questions:
        raise HTTPException(status_code=400, detail="No numbered questions were detected. Ask individual questions in chat instead.")
    level = req.level if req.level in {"beginner", "intermediate", "advanced"} else "intermediate"
    answers = []
    for question in questions:
        results = vector_store.query(question, req.subject_id, top_k=7, exclude_content_type="questions")
        chunks = results["documents"][0] if results.get("documents") else []
        metadatas = results["metadatas"][0] if results.get("metadatas") else []
        answer = llm_service.generate_answer(question, chunks, metadatas, mode="solve_question", level=level,
                                              allow_general_knowledge=not chunks)
        sources = list(dict.fromkeys(m.get("filename") for m in metadatas)) or [f"{document.filename} (question prompt)"]
        answers.append({"question": question, "answer": answer, "sources": sources,
                        "uses_general_knowledge": not chunks})
    return {"document": document.filename, "questions_detected": len(questions), "answers": answers}
