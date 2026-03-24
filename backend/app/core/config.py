import sys
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Firebase Admin SDK — provide either the full JSON key or individual fields
    FIREBASE_SERVICE_ACCOUNT_KEY: str = ""
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_PRIVATE_KEY: str = ""
    FIREBASE_CLIENT_EMAIL: str = ""

    # Authentica OTP service
    AUTHINTICA_API_KEY: str = ""
    AUTHINTICA_API_URL: str = "https://api.authentica.sa/v1/"

    # CORS — stored as a plain string, split at startup
    CORS_ORIGINS_STR: str = "http://localhost:3000"

    # Email (Gmail SMTP)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = ""

    # Public app URL — used in email links
    APP_URL: str = "http://localhost:3000"

    @property
    def CORS_ORIGINS(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS_STR.split(",") if o.strip()]


settings = Settings()

# Startup diagnostics — visible in the uvicorn terminal
print(f"[Config] Firebase project : {settings.FIREBASE_PROJECT_ID or '(not set)'}", file=sys.stderr)
print(f"[Config] CORS origins      : {settings.CORS_ORIGINS}", file=sys.stderr)
print(f"[Config] Authentica key    : {'(set) first 6 chars: ' + settings.AUTHINTICA_API_KEY[:6] if settings.AUTHINTICA_API_KEY else '(not set)'}", file=sys.stderr)
