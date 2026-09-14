from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

# The project uses Psycopg 3. Accept the familiar `postgresql://` local URL
# from older .env files and select the installed driver explicitly.
database_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
engine = create_engine(database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
