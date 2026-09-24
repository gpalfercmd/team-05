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
"""

from __future__ import annotations

import base64
import binascii
from pathlib import Path
from typing import Final

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ENCRYPTION_KEY_LENGTH: Final[int] = 32


class Settings(BaseSettings):
    """Typed backend configuration; unknown env vars are ignored (P4 adds its own)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(min_length=1)
    evidence_encryption_key: str = Field(min_length=1)
    storage_dir: str = Field(min_length=1)
    session_secret: str = Field(min_length=16)

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


def load_settings(env_file: str | None = None) -> Settings:
    """Build settings, optionally from an explicit env file (tests use this)."""
    settings = Settings(_env_file=env_file) if env_file is not None else Settings()
    return settings
