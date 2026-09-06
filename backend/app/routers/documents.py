import os
import tempfile

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Document, ContentType, Subject
from app.services.subject_detector import detect_subject
from app.services import document_processor, vector_store

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # --------------------------------------------------
    # 1. SAVE UPLOADED FILE TEMPORARILY
    # --------------------------------------------------

    suffix = "." + file.filename.split(".")[-1]

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    # --------------------------------------------------
    # 2. EXTRACT TEXT
    # --------------------------------------------------

    try:
        text = document_processor.extract_text(
            tmp_path,
            file.filename
        )

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        os.unlink(tmp_path)

    # --------------------------------------------------
    # 3. CHECK THAT TEXT WAS EXTRACTED
    # --------------------------------------------------

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No extractable text found in file."
        )

    # --------------------------------------------------
    # 4. DETECT SUBJECT FROM DOCUMENT CONTENT
    # --------------------------------------------------

    subject_name = detect_subject(text)

    if not subject_name:
        raise HTTPException(
            status_code=400,
            detail="Could not determine subject from document."
        )

    # --------------------------------------------------
    # 5. FIND EXISTING SUBJECT
    # --------------------------------------------------

    subject = (
        db.query(Subject)
        .filter(Subject.name.ilike(subject_name))
        .first()
    )

    # --------------------------------------------------
    # 6. CREATE SUBJECT IF IT DOESN'T EXIST
    # --------------------------------------------------

    if not subject:
        subject = Subject(
            name=subject_name
        )

        db.add(subject)

        # Generate the UUID
        db.flush()

    # --------------------------------------------------
    # 7. DETERMINE DOCUMENT TYPE
    # --------------------------------------------------

    content_type = document_processor.guess_content_type(
        file.filename,
        text
    )

    # --------------------------------------------------
    # 8. SPLIT DOCUMENT INTO CHUNKS
    # --------------------------------------------------

    chunks = document_processor.chunk_text(text)

    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="Could not create chunks from document."
        )

    # --------------------------------------------------
    # 9. CREATE DOCUMENT
    # --------------------------------------------------

    doc = Document(
        subject_id=subject.id,
        filename=file.filename,
        content_type=ContentType(content_type),
        chunk_count=str(len(chunks)),
    )

    db.add(doc)

    # Generate document UUID
    db.flush()

    # --------------------------------------------------
    # 10. SAVE DATABASE CHANGES
    # --------------------------------------------------

    db.commit()

    db.refresh(subject)
    db.refresh(doc)

    # --------------------------------------------------
    # 11. ADD CHUNKS TO VECTOR STORE
    # --------------------------------------------------

    vector_store.add_chunks(
        chunks=chunks,
        subject_id=subject.id,
        document_id=doc.id,
        filename=file.filename,
        content_type=content_type,
    )

    # --------------------------------------------------
    # 12. RETURN RESULT
    # --------------------------------------------------

    return {
        "subject_id": subject.id,
        "subject_name": subject.name,
        "document_id": doc.id,
        "filename": doc.filename,
        "content_type": content_type,
        "chunks_created": len(chunks),
    }


@router.get("/subject/{subject_id}")
def list_documents(
    subject_id: str,
    db: Session = Depends(get_db)
):
    docs = (
        db.query(Document)
        .filter(Document.subject_id == subject_id)
        .all()
    )

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