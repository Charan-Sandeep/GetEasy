"""
Wraps ChromaDB for persistent, metadata-filtered storage of academic content.
Uses sentence-transformers locally for embeddings (free, no API cost) —
swap for another embedding provider later if you want higher quality.
"""
import uuid
import chromadb
from chromadb.utils import embedding_functions

from app.config import settings

_client = chromadb.PersistentClient(path=settings.chroma_persist_dir)

_embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

_collection = _client.get_or_create_collection(
    name="academic_content",
    embedding_function=_embedding_fn,
)


def add_chunks(chunks: list[str], subject_id: str, document_id: str,
               filename: str, content_type: str) -> list[str]:
    """Embeds and stores chunks with metadata. Returns the chroma ids used."""
    ids = [str(uuid.uuid4()) for _ in chunks]
    metadatas = [
        {
            "subject_id": subject_id,
            "document_id": document_id,
            "filename": filename,
            "content_type": content_type,
        }
        for _ in chunks
    ]
    _collection.add(documents=chunks, metadatas=metadatas, ids=ids)
    return ids


def query(question: str, subject_id: str, top_k: int = 5,
          content_type: str | None = None) -> dict:
    """Retrieves the most relevant chunks for a question, scoped to a subject."""
    where = {"subject_id": subject_id}
    if content_type:
        where = {"$and": [{"subject_id": subject_id}, {"content_type": content_type}]}

    results = _collection.query(
        query_texts=[question],
        n_results=top_k,
        where=where,
    )
    return results
