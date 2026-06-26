from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Backblaze B2
    b2_key_id: str = ""
    b2_app_key: str = ""
    b2_bucket_name: str = "cinematic-ai-assets"

    # AI providers
    gmi_api_key: str = ""
    replicate_api_token: str = ""
    elevenlabs_api_key: str = ""

    # Database
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/cinematic_ai"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # Security
    secret_key: str = "change_me"

    # App
    app_env: str = "development"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
