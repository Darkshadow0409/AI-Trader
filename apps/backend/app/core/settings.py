from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AI_TRADER_", extra="ignore")

    env: str = "development"
    host: str = "127.0.0.1"
    port: int = 8000
    frontend_port: int = 5173
    use_sample_only: bool = True
    sqlite_path: str = "data/sqlite/ai_trader.db"
    duckdb_path: str = "data/sqlite/ai_trader.duckdb"
    parquet_dir: str = "data/parquet"
    diagnostics_dir: str = "data/diagnostics"
    default_timeframe: str = "1d"
    api_refresh_seconds: int = 900
    pipeline_refresh_minutes: int = 15
    enable_scheduler: bool = True
    fixture_now_iso: str = "2026-03-15T11:30:00+00:00"
    paper_account_size: float = 10000.0
    broker_market_data_enabled: bool = False
    symbol_mapping_json: str = ""
    polymarket_enabled: bool = True
    polymarket_base_url: str = "https://gamma-api.polymarket.com"
    polymarket_timeout_seconds: int = 8
    polymarket_cache_seconds: int = 120
    fred_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_default_model: str = "gpt-5.4"
    openai_available_models: str = "gpt-5.4,gpt-5,gpt-5-mini"
    openai_oauth_client_id: str = ""
    openai_oauth_client_secret: str = ""
    openai_oauth_authorize_url: str = "https://auth.openai.com/authorize"
    openai_oauth_token_url: str = "https://auth0.openai.com/oauth/token"
    openai_oauth_userinfo_url: str = "https://auth0.openai.com/userinfo"
    openai_oauth_revoke_url: str = "https://auth0.openai.com/oauth/revoke"
    openai_oauth_audience: str = "https://api.openai.com/v1"
    openai_oauth_scopes: str = "openid profile email offline_access"
    ollama_url: str = "http://127.0.0.1:11434"
    alert_enable_in_app: bool = True
    alert_enable_telegram: bool = False
    alert_enable_discord: bool = False
    alert_in_app_min_severity: str = "info"
    alert_telegram_min_severity: str = "warning"
    alert_discord_min_severity: str = "info"
    alert_dedupe_window_minutes: int = 240
    alert_cooldown_minutes: int = 60
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    discord_webhook_url: str = ""
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173"])

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return []
            if normalized.startswith("["):
                try:
                    parsed = json.loads(normalized)
                except json.JSONDecodeError:
                    parsed = []
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in normalized.split(",") if item.strip()]
        return value

    @property
    def repo_root(self) -> Path:
        return Path(__file__).resolve().parents[4]

    @property
    def sqlite_full_path(self) -> Path:
        return self.repo_root / self.sqlite_path

    @property
    def duckdb_full_path(self) -> Path:
        return self.repo_root / self.duckdb_path

    @property
    def parquet_full_path(self) -> Path:
        return self.repo_root / self.parquet_dir

    @property
    def diagnostics_full_path(self) -> Path:
        return self.repo_root / self.diagnostics_dir

    @property
    def fixtures_path(self) -> Path:
        return self.repo_root / "apps" / "backend" / "fixtures"

    @property
    def parquet_path(self) -> Path:
        return self.parquet_full_path

    @property
    def duckdb_file(self) -> Path:
        return self.duckdb_full_path

    @property
    def frontend_origin(self) -> str:
        return self.allowed_origins[0]

    @property
    def openai_available_models_list(self) -> list[str]:
        configured = [item.strip() for item in self.openai_available_models.split(",") if item.strip()]
        return configured or [self.openai_default_model]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
