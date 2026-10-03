import os
import tempfile

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Document, Chunk, ContentType, User, Subject
from app.services import document_processor, vector_store, topic_service, subject_detector
from app.services.auth_service import get_current_user, require_subject_owner

router = APIRouter(prefix="/documents", tags=["documents"])
SUPPORTED_EXTENSIONS = {"pdf", "docx", "pptx", "txt"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def serialize_document(document: Document) -> dict:
    content_type = document.content_type.value if hasattr(document.content_type, "value") else str(document.content_type)
    return {"id": str(document.id), "filename": document.filename, "content_type": content_type,
            "uploaded_at": document.uploaded_at, "chunk_count": document.chunk_count}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    subject_id: str | None = Form(None), auto_detect: bool = Form(False), file: UploadFile = File(...), db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    filename = file.filename or "uploaded-file"
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload PDF, DOCX, PPTX, or TXT.")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than the 25 MB upload limit.")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{extension}") as tmp:
            tmp.write(raw)
            tmp_path = tmp.name
        text = document_processor.extract_text(tmp_path, filename)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to read this file: {exc}") from exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    if not text.strip():
        raise HTTPException(status_code=400, detail="No extractable text found. The document may be scanned or image-only.")
    if auto_detect or not subject_id:
        try:
            subject_name = subject_detector.detect_subject(text)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        subject = db.query(Subject).filter(Subject.owner_id == user.id, func.lower(Subject.name) == subject_name.lower()).first()
        if not subject:
            subject = Subject(name=subject_name, owner_id=user.id)
            db.add(subject)
            db.flush()
        subject_id = str(subject.id)
    else:
        subject = require_subject_owner(subject_id, user, db)
    chunks = document_processor.chunk_text(text)
    if not chunks:
        raise HTTPException(status_code=400, detail="No usable text chunks could be created.")

    content_type = document_processor.guess_content_type(filename, text)
    doc = Document(subject_id=subject_id, filename=filename, content_type=ContentType(content_type), chunk_count=len(chunks))
    try:
        db.add(doc)
        db.flush()
        chroma_ids = vector_store.add_chunks(chunks, subject_id, str(doc.id), filename, content_type)
        db.add_all([Chunk(document_id=doc.id, chroma_id=chroma_id, text_preview=chunk[:240])
                    for chroma_id, chunk in zip(chroma_ids, chunks)])
        subject_index = vector_store.get_subject_chunks(subject_id)
        graph_info = topic_service.rebuild_subject_graph(db, subject_id, subject_index.get("documents") or [])
        mappings = 0
        if content_type == "questions":
            mappings = topic_service.refresh_question_mappings(db, subject_id, str(doc.id), list(zip(chroma_ids, chunks)))
        else:
            # Re-map existing question-bank chunks after new learning material
            # adds or changes the subject's discovered topics.
            question_rows: dict[str, list[tuple[str, str]]] = {}
            for chroma_id, chunk, metadata in zip(
                subject_index.get("ids") or [], subject_index.get("documents") or [], subject_index.get("metadatas") or []
            ):
                if metadata.get("content_type") == "questions":
                    question_rows.setdefault(metadata["document_id"], []).append((chroma_id, chunk))
            for question_document_id, rows in question_rows.items():
                mappings += topic_service.refresh_question_mappings(db, subject_id, question_document_id, rows)
        db.refresh(doc)
    except Exception as exc:
        db.rollback()
        if doc.id:
            vector_store.delete_document(str(doc.id))
        raise HTTPException(status_code=500, detail=f"Could not index the document: {exc}") from exc

    return {**serialize_document(doc), "subject_id": subject_id, "subject_name": subject.name,
            "chunks_created": len(chunks), "graph": graph_info, "question_mappings_created": mappings}


@router.get("/subject/{subject_id}")
def list_documents(subject_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_subject_owner(subject_id, user, db)
    docs = db.query(Document).filter(Document.subject_id == subject_id).order_by(Document.uploaded_at.desc()).all()
    return [serialize_document(document) for document in docs]


@router.get("/{document_id}/chunks")
def list_chunks(document_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")
    require_subject_owner(str(document.subject_id), user, db)
    chunks = db.query(Chunk).filter(Chunk.document_id == document_id).all()
    return [{"id": str(chunk.id), "preview": chunk.text_preview} for chunk in chunks]


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")
    subject_id = str(document.subject_id)
    require_subject_owner(subject_id, user, db)
    vector_store.delete_document(str(document.id))
    db.delete(document)
    db.commit()
    remaining = vector_store.get_subject_chunks(subject_id).get("documents") or []
    topic_service.rebuild_subject_graph(db, subject_id, remaining)
