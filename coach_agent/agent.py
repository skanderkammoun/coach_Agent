"""Core Coach Agent that wraps the Azure OpenAI chat endpoint."""

from __future__ import annotations

from typing import Iterator

from openai import AzureOpenAI

from .config import CoachConfig
from .prompts import SYSTEM_PROMPT


class CoachAgent:
    """Stateful coaching assistant backed by Azure OpenAI.

    Each instance maintains its own conversation history so that the agent
    can refer back to earlier messages and give contextual guidance.

    Example::

        config = CoachConfig(api_key="...", endpoint="https://...")
        agent = CoachAgent(config)
        reply = agent.chat("How do I create a resource group?")
        print(reply)
    """

    def __init__(self, config: CoachConfig | None = None) -> None:
        self._config = config or CoachConfig()
        self._history: list[dict[str, str]] = []
        self._client: AzureOpenAI | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def chat(self, user_message: str) -> str:
        """Send *user_message* and return the assistant's reply as a string."""
        self._history.append({"role": "user", "content": user_message})
        reply = self._complete()
        self._history.append({"role": "assistant", "content": reply})
        self._trim_history()
        return reply

    def stream(self, user_message: str) -> Iterator[str]:
        """Send *user_message* and yield reply tokens as they arrive.

        The full reply is appended to the conversation history only after
        the stream is exhausted.
        """
        self._history.append({"role": "user", "content": user_message})
        full_reply = ""
        for chunk in self._stream_complete():
            full_reply += chunk
            yield chunk
        self._history.append({"role": "assistant", "content": full_reply})
        self._trim_history()

    def reset(self) -> None:
        """Clear conversation history, starting a fresh session."""
        self._history.clear()

    @property
    def history(self) -> list[dict[str, str]]:
        """Read-only view of the current conversation history."""
        return list(self._history)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_client(self) -> AzureOpenAI:
        if self._client is None:
            self._client = AzureOpenAI(
                api_key=self._config.api_key,
                azure_endpoint=self._config.endpoint,
                api_version=self._config.api_version,
            )
        return self._client

    def _messages(self) -> list[dict[str, str]]:
        """Build the full message list including the system prompt."""
        return [{"role": "system", "content": SYSTEM_PROMPT}] + self._history

    def _complete(self) -> str:
        client = self._get_client()
        response = client.chat.completions.create(
            model=self._config.deployment,
            messages=self._messages(),  # type: ignore[arg-type]
        )
        return response.choices[0].message.content or ""

    def _stream_complete(self) -> Iterator[str]:
        client = self._get_client()
        stream = client.chat.completions.create(
            model=self._config.deployment,
            messages=self._messages(),  # type: ignore[arg-type]
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content

    def _trim_history(self) -> None:
        """Keep history within the configured limit (pairs of messages)."""
        max_messages = self._config.max_history
        if len(self._history) > max_messages:
            self._history = self._history[-max_messages:]
