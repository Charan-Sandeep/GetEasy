import threading

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

# The project uses Psycopg 3. Accept the familiar `postgresql://` local URL
# from older .env files and select the installed driver explicitly.
database_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
engine = create_engine(database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
_database_initialized = False
_database_init_lock = threading.Lock()


def initialize_database() -> None:
    """Create tables once, on the first database-backed request.

    Keeping this out of app import means the lightweight health endpoint can
    respond even if PostgreSQL is temporarily unavailable during deployment.
    """
    global _database_initialized
    if _database_initialized:
        return
    with _database_init_lock:
        if not _database_initialized:
            Base.metadata.create_all(bind=engine)
            _database_initialized = True


def get_db():
    initialize_database()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
