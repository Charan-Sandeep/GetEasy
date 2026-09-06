from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    chroma_persist_dir: str = "./chroma_data"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-20b"
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    frontend_origin: str = "http://localhost:3000"

settings = Settings()
