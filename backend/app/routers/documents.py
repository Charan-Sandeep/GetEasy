import os
import tempfile
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Document, ContentType
from app.services import document_processor, vector_store

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload")
async def upload_document(
    subject_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Save upload to a temp file so our extractors can read it
    suffix = "." + file.filename.split(".")[-1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        text = document_processor.extract_text(tmp_path, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        os.unlink(tmp_path)

    if not text.strip():
        raise HTTPException(status_code=400, detail="No extractable text found in file.")

    content_type = document_processor.guess_content_type(file.filename, text)
    chunks = document_processor.chunk_text(text)

    # Create the Document row first so we have an id for chunk metadata
    doc = Document(
        subject_id=subject_id,
        filename=file.filename,
        content_type=ContentType(content_type),
        chunk_count=str(len(chunks)),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    vector_store.add_chunks(
        chunks=chunks,
        subject_id=subject_id,
        document_id=doc.id,
        filename=file.filename,
        content_type=content_type,
    )

    return {
        "document_id": doc.id,
        "filename": doc.filename,
        "content_type": content_type,
        "chunks_created": len(chunks),
    }


@router.get("/subject/{subject_id}")
def list_documents(subject_id: str, db: Session = Depends(get_db)):
    docs = db.query(Document).filter(Document.subject_id == subject_id).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "content_type": d.content_type,
            "uploaded_at": d.uploaded_at,
            "chunk_count": d.chunk_count,
        }
        for d in docs
    ]
