from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import documents, query, subjects

# Creates tables if they don't exist. Fine for Week 1-2;
# switch to Alembic migrations once the schema stabilizes.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Subject Guide & Question Bank Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(subjects.router)
app.include_router(documents.router)
app.include_router(query.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
