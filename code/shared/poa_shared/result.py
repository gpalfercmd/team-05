# =============================================================================
# Proof of Aid — Team 05 — Result type for expected, non-exceptional failures
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Result pattern: functions return `Ok(value)` or `Err(message)` instead of raising."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, TypeAlias, TypeVar

T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class Ok(Generic[T]):
    """Successful outcome carrying its value."""

    value: T


@dataclass(frozen=True, slots=True)
class Err:
    """Failed outcome with a human-readable reason and an optional cause."""

    message: str
    cause: Exception | None = None


Result: TypeAlias = Ok[T] | Err
