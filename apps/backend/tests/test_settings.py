from __future__ import annotations

from app.core.settings import Settings


def test_allowed_origins_accepts_csv_input() -> None:
    settings = Settings(allowed_origins="https://staging.example.com,https://www.example.com")
    assert settings.allowed_origins == ["https://staging.example.com", "https://www.example.com"]


def test_allowed_origins_accepts_json_array_input() -> None:
    settings = Settings(allowed_origins='["https://staging.example.com","https://app.example.com"]')
    assert settings.allowed_origins == ["https://staging.example.com", "https://app.example.com"]
