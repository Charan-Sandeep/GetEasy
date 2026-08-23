from fastapi import APIRouter
from pydantic import BaseModel

from app.services import vector_store, llm_service

router = APIRouter(prefix="/query", tags=["query"])


class QueryRequest(BaseModel):
    subject_id: str
    question: str
    content_type: str | None = None  # optional filter: notes/textbook/questions/labs
    top_k: int = 5


@router.post("")
def ask(req: QueryRequest):
    results = vector_store.query(
        question=req.question,
        subject_id=req.subject_id,
        top_k=req.top_k,
        content_type=req.content_type,
    )

    retrieved_chunks = results["documents"][0] if results["documents"] else []
    retrieved_metadatas = results["metadatas"][0] if results["metadatas"] else []

    answer = llm_service.generate_answer(
        question=req.question,
        retrieved_chunks=retrieved_chunks,
        retrieved_metadatas=retrieved_metadatas,
    )

    sources = list({m.get("filename") for m in retrieved_metadatas})

    return {
        "answer": answer,
        "sources": sources,
        "chunks_used": len(retrieved_chunks),
    }
