# =============================================================================
# Proof of Aid — Team 05 — Backend configuration loaded from the environment
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Application settings (spec P3.1). Values come from `code/backend/.env`.

Secrets are validated at startup — fail fast instead of running half-configured:
- `EVIDENCE_ENCRYPTION_KEY` must decode from base64 to exactly 32 bytes (AES-256).
- `SESSION_SECRET` must be non-empty (it signs the wallet-login session cookies).
- `STORAGE_DIR` is created on first use, never at import time.
- `CORS_ORIGINS` lists explicit browser origins (comma-separated). A wildcard
  is refused because the session cookie travels with credentialed requests,
  and `*` plus credentials would let any site act as the logged-in wallet.
"""

from __future__ import annotations

import base64
import binascii
from pathlib import Path
from typing import Final

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ENCRYPTION_KEY_LENGTH: Final[int] = 32
DEFAULT_CORS_ORIGINS: Final[str] = "http://localhost:5173"  # Vite dev server


class Settings(BaseSettings):
    """Typed backend configuration; unknown env vars are ignored (P4 adds its own)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(min_length=1)
    evidence_encryption_key: str = Field(min_length=1)
    storage_dir: str = Field(min_length=1)
    session_secret: str = Field(min_length=16)
    cors_origins: str = Field(default=DEFAULT_CORS_ORIGINS, min_length=1)

    @field_validator("evidence_encryption_key")
    @classmethod
    def _key_must_be_32_bytes_base64(cls, value: str) -> str:
        """Reject anything that is not a base64-encoded 256-bit key."""
        try:
            decoded = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as cause:
            raise ValueError("EVIDENCE_ENCRYPTION_KEY must be base64") from cause
        if len(decoded) != ENCRYPTION_KEY_LENGTH:
            raise ValueError(
                f"EVIDENCE_ENCRYPTION_KEY must decode to {ENCRYPTION_KEY_LENGTH} bytes, "
                f"got {len(decoded)}"
            )
        validated: str = value
        return validated

    @field_validator("cors_origins")
    @classmethod
    def _origins_must_be_explicit(cls, value: str) -> str:
        """Accept only `scheme://host[:port]` entries; never `*` (credentials are on)."""
        origins = _split_origins(value)
        if not origins:
            raise ValueError("CORS_ORIGINS must name at least one origin")
        if "*" in origins:
            raise ValueError("CORS_ORIGINS must list explicit origins, '*' is not allowed")
        malformed = [
            origin
            for origin in origins
            if not origin.startswith(("http://", "https://")) or origin.endswith("/")
        ]
        if malformed:
            raise ValueError("CORS_ORIGINS entries must look like http(s)://host[:port]")
        validated: str = value
        return validated

    @property
    def cors_origin_list(self) -> list[str]:
        """Return the allowed browser origins as a list for `CORSMiddleware`."""
        origins = _split_origins(self.cors_origins)
        return origins

    @property
    def encryption_key_bytes(self) -> bytes:
        """Return the raw 32-byte AES key."""
        raw = base64.b64decode(self.evidence_encryption_key, validate=True)
        return raw

    @property
    def storage_path(self) -> Path:
        """Return the evidence storage directory as a path."""
        path = Path(self.storage_dir)
        return path


def _split_origins(value: str) -> list[str]:
    """Split a comma-separated origin list, dropping blanks from stray commas."""
    origins = [origin.strip() for origin in value.split(",") if origin.strip()]
    return origins


def load_settings(env_file: str | None = None) -> Settings:
    """Build settings, optionally from an explicit env file (tests use this)."""
    settings = Settings(_env_file=env_file) if env_file is not None else Settings()
    return settings
