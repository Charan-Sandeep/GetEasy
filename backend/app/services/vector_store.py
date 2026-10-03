"""
Wraps ChromaDB for persistent, metadata-filtered storage of academic content.
Uses sentence-transformers locally for embeddings (free, no API cost) —
swap for another embedding provider later if you want higher quality.
"""
import threading
import uuid
import chromadb
from chromadb.utils import embedding_functions

from app.config import settings

# Chroma creates its on-disk database and SentenceTransformer may download/load
# a model.  Doing either at module import prevents the web server from binding
# its port until that expensive work has finished.  Keep them lazy instead.
_client = None
_embedding_fn = None
_collection = None
_vector_lock = threading.RLock()


def _get_collection():
    """Return the shared collection, initializing it once on first use."""
    global _client, _embedding_fn, _collection
    if _collection is not None:
        return _collection

    # The second check makes concurrent first requests safe without holding a
    # lock during ordinary reads after initialization.
    with _vector_lock:
        if _collection is None:
            client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
            embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name="all-MiniLM-L6-v2"
            )
            collection = client.get_or_create_collection(
                name="academic_content",
                embedding_function=embedding_fn,
            )
            _client = client
            _embedding_fn = embedding_fn
            _collection = collection
    return _collection


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
            "chunk_index": index,
        }
        for index, _ in enumerate(chunks)
    ]
    _get_collection().add(documents=chunks, metadatas=metadatas, ids=ids)
    return ids


def delete_document(document_id: str) -> None:
    """Remove a document's vectors when the matching relational record is deleted."""
    _get_collection().delete(where={"document_id": document_id})


def get_subject_chunks(subject_id: str, content_type: str | None = None) -> dict:
    """Fetch indexed material for graph building and transparent analytics."""
    where = {"subject_id": subject_id}
    if content_type:
        where = {"$and": [{"subject_id": subject_id}, {"content_type": content_type}]}
    return _get_collection().get(where=where, include=["documents", "metadatas"])


def get_document_chunks(document_id: str) -> dict:
    """Return every chunk belonging to one uploaded document in index order."""
    result = _get_collection().get(where={"document_id": document_id}, include=["documents", "metadatas"])
    rows = sorted(zip(result.get("ids") or [], result.get("documents") or [], result.get("metadatas") or []),
                  key=lambda row: row[2].get("chunk_index", 0))
    return {"ids": [row[0] for row in rows], "documents": [row[1] for row in rows], "metadatas": [row[2] for row in rows]}


def query(question: str, subject_id: str, top_k: int = 5,
          content_type: str | None = None, exclude_content_type: str | None = None) -> dict:
    """Retrieves the most relevant chunks for a question, scoped to a subject."""
    where = {"subject_id": subject_id}
    if content_type:
        where = {"$and": [{"subject_id": subject_id}, {"content_type": content_type}]}
    elif exclude_content_type:
        where = {"$and": [{"subject_id": subject_id}, {"content_type": {"$ne": exclude_content_type}}]}

    collection = _get_collection()
    count = collection.count()
    if count == 0:
        return {"documents": [[]], "metadatas": [[]], "ids": [[]]}
    results = collection.query(
        query_texts=[question],
        n_results=min(top_k, count),
        where=where,
    )
    return results
