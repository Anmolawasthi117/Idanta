from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Idanta API"
    API_V1_STR: str = "/api/v1"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
