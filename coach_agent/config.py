"""Configuration for the Coach Agent."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


@dataclass
class CoachConfig:
    """Settings loaded from environment variables.

    All Azure-related values can be overridden by passing them explicitly,
    which makes the class easy to use in tests without real credentials.
    """

    api_key: str = field(
        default_factory=lambda: os.environ.get("AZURE_OPENAI_API_KEY", "")
    )
    endpoint: str = field(
        default_factory=lambda: os.environ.get("AZURE_OPENAI_ENDPOINT", "")
    )
    deployment: str = field(
        default_factory=lambda: os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
    )
    api_version: str = field(
        default_factory=lambda: os.environ.get(
            "AZURE_OPENAI_API_VERSION", "2024-12-01-preview"
        )
    )
    max_history: int = field(
        default_factory=lambda: int(os.environ.get("COACH_MAX_HISTORY", "20"))
    )

    def is_configured(self) -> bool:
        """Return True when the minimum required credentials are present."""
        return bool(self.api_key and self.endpoint)
