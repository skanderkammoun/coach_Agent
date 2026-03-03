"""Unit tests for the Coach Agent package.

These tests use unittest.mock to avoid making real Azure OpenAI calls,
so they run without any credentials configured.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from coach_agent import CoachAgent, CoachConfig
from coach_agent.prompts import SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# CoachConfig tests
# ---------------------------------------------------------------------------


class TestCoachConfig:
    def test_defaults_from_env(self, monkeypatch):
        monkeypatch.setenv("AZURE_OPENAI_API_KEY", "test-key")
        monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test.openai.azure.com/")
        monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-test")
        monkeypatch.setenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
        monkeypatch.setenv("COACH_MAX_HISTORY", "10")

        config = CoachConfig()
        assert config.api_key == "test-key"
        assert config.endpoint == "https://test.openai.azure.com/"
        assert config.deployment == "gpt-4o-test"
        assert config.api_version == "2024-12-01-preview"
        assert config.max_history == 10

    def test_is_configured_true(self):
        config = CoachConfig(
            api_key="key", endpoint="https://example.openai.azure.com/"
        )
        assert config.is_configured() is True

    def test_is_configured_false_missing_key(self):
        config = CoachConfig(api_key="", endpoint="https://example.openai.azure.com/")
        assert config.is_configured() is False

    def test_is_configured_false_missing_endpoint(self):
        config = CoachConfig(api_key="key", endpoint="")
        assert config.is_configured() is False

    def test_explicit_values_override_env(self, monkeypatch):
        monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT", "env-deployment")
        config = CoachConfig(deployment="explicit-deployment")
        assert config.deployment == "explicit-deployment"


# ---------------------------------------------------------------------------
# CoachAgent tests
# ---------------------------------------------------------------------------


def _make_agent() -> CoachAgent:
    """Return a CoachAgent with dummy credentials (no real API calls)."""
    config = CoachConfig(
        api_key="dummy",
        endpoint="https://dummy.openai.azure.com/",
        deployment="gpt-4o",
        api_version="2024-12-01-preview",
    )
    return CoachAgent(config)


class TestCoachAgentHistory:
    def test_history_starts_empty(self):
        agent = _make_agent()
        assert agent.history == []

    def test_reset_clears_history(self):
        agent = _make_agent()
        agent._history = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi!"},
        ]
        agent.reset()
        assert agent.history == []

    def test_history_is_a_copy(self):
        agent = _make_agent()
        h = agent.history
        h.append({"role": "user", "content": "should not mutate"})
        assert agent.history == []

    def test_trim_history_respects_max(self):
        config = CoachConfig(
            api_key="k", endpoint="https://e.openai.azure.com/", max_history=4
        )
        agent = CoachAgent(config)
        # Fill with 6 messages (3 rounds)
        for i in range(6):
            agent._history.append(
                {"role": "user" if i % 2 == 0 else "assistant", "content": str(i)}
            )
        agent._trim_history()
        assert len(agent.history) == 4

    def test_messages_includes_system_prompt(self):
        agent = _make_agent()
        agent._history = [{"role": "user", "content": "question"}]
        messages = agent._messages()
        assert messages[0] == {"role": "system", "content": SYSTEM_PROMPT}
        assert messages[1] == {"role": "user", "content": "question"}


class TestCoachAgentChat:
    @patch("coach_agent.agent.AzureOpenAI")
    def test_chat_returns_assistant_reply(self, mock_azure_class):
        mock_client = MagicMock()
        mock_azure_class.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Here is a hint."))]
        )

        agent = _make_agent()
        reply = agent.chat("How do I create a resource group?")

        assert reply == "Here is a hint."
        assert agent.history[-2]["role"] == "user"
        assert agent.history[-1] == {"role": "assistant", "content": "Here is a hint."}

    @patch("coach_agent.agent.AzureOpenAI")
    def test_chat_accumulates_history(self, mock_azure_class):
        mock_client = MagicMock()
        mock_azure_class.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Reply"))]
        )

        agent = _make_agent()
        agent.chat("First question")
        agent.chat("Second question")

        assert len(agent.history) == 4  # 2 user + 2 assistant

    @patch("coach_agent.agent.AzureOpenAI")
    def test_stream_yields_tokens_and_updates_history(self, mock_azure_class):
        mock_client = MagicMock()
        mock_azure_class.return_value = mock_client

        chunks = [
            MagicMock(choices=[MagicMock(delta=MagicMock(content="Hello "))]),
            MagicMock(choices=[MagicMock(delta=MagicMock(content="world"))]),
        ]
        mock_client.chat.completions.create.return_value = iter(chunks)

        agent = _make_agent()
        tokens = list(agent.stream("Tell me something"))

        assert tokens == ["Hello ", "world"]
        assert agent.history[-1] == {
            "role": "assistant",
            "content": "Hello world",
        }


# ---------------------------------------------------------------------------
# SYSTEM_PROMPT sanity check
# ---------------------------------------------------------------------------


class TestSystemPrompt:
    def test_prompt_mentions_azure(self):
        assert "Azure" in SYSTEM_PROMPT

    def test_prompt_mentions_lab(self):
        assert "lab" in SYSTEM_PROMPT.lower()

    def test_prompt_is_nonempty(self):
        assert len(SYSTEM_PROMPT.strip()) > 100
