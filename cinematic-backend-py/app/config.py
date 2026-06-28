from pydantic import field_validator
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
    openai_api_key: str = ""
    gemini_api_key: str = ""

    # Database
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/cinematic_ai"

    @field_validator("database_url", mode="after")
    @classmethod
    def fix_database_url(cls, v: str) -> str:
        v = v.strip().strip('"').strip("'")
        
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        
        # asyncpg requires ssl=require, not sslmode=require
        v = v.replace("sslmode=require", "ssl=require")
        return v

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    @field_validator("redis_url", mode="after")
    @classmethod
    def fix_redis_url(cls, v: str) -> str:
        v = v.strip().strip('"').strip("'")
        if "upstash.io" in v and "ssl_cert_reqs=" not in v:
            separator = "&" if "?" in v else "?"
            v = f"{v}{separator}ssl_cert_reqs=none"
        return v

    # Security
    secret_key: str = "change_me"

    # App
    app_env: str = "development"
    cors_origins: str = "http://localhost:5173,http://localhost:3000,https://cinematic-ai-delta.vercel.app"

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.cors_origins.split(",")]
        # Always allow the Vercel production frontend even if overriden in ENV
        vercel_url = "https://cinematic-ai-delta.vercel.app"
        if vercel_url not in origins:
            origins.append(vercel_url)
        # Also allow wildcard vercel subdomains if needed, but strict is safer
        return origins

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
