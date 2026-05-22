from functools import cached_property

from cryptography.fernet import Fernet
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    FERNET_KEY: str

    @cached_property
    def fernet(self) -> Fernet:
        return Fernet(self.FERNET_KEY.encode())


settings = Settings()
