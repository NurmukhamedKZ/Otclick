from functools import cached_property

from cryptography.fernet import Fernet
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    FERNET_KEY: str
    CORS_ORIGINS: str = "http://localhost:3000"
    DEBUG_ENDPOINTS: bool = False
    LOG_LEVEL: str = "INFO"

    # hh refresh-token cron: shared secret for /internal/cron/* + near-expiry window.
    # hh refresh token is single-use and only usable once the access token expired,
    # so the cron only refreshes creds expiring within this window (not all daily).
    INTERNAL_CRON_TOKEN: str = ""
    REFRESH_THRESHOLD_DAYS: int = 2

    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1/chat/completions"
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_RATE_LIMIT: int = 60
    COVER_LETTER_SYSTEM_PROMPT: str = (
        "Ты — кандидат на вакансию. Напиши сопроводительное письмо на русском, "
        "3-5 предложений, без воды, без приветствия 'Уважаемые господа', "
        "без эмодзи. Свяжи опыт из резюме с требованиями вакансии. "
        "Заверши готовностью обсудить детали. Не выдумывай факты."
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @cached_property
    def fernet(self) -> Fernet:
        return Fernet(self.FERNET_KEY.encode())


settings = Settings()
