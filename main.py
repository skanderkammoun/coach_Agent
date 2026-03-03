#!/usr/bin/env python3
"""Entry point for the Azure Lab Coach Agent CLI.

Run:
    python main.py

The agent reads AZURE_OPENAI_* environment variables (or a .env file) and
starts an interactive coaching session in the terminal.
"""

from __future__ import annotations

import sys

from coach_agent import CoachAgent, CoachConfig


def main() -> None:
    config = CoachConfig()

    if not config.is_configured():
        print(
            "Error: Azure OpenAI credentials are not configured.\n"
            "Copy .env.example to .env and fill in your credentials.",
            file=sys.stderr,
        )
        sys.exit(1)

    agent = CoachAgent(config)

    print("Azure Lab Coach Agent 🤖")
    print("Type your question or 'exit' / 'quit' to leave.\n")

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not user_input:
            continue

        if user_input.lower() in {"exit", "quit"}:
            print("Goodbye!")
            break

        if user_input.lower() == "reset":
            agent.reset()
            print("Session reset. Starting fresh!\n")
            continue

        print("Coach: ", end="", flush=True)
        for token in agent.stream(user_input):
            print(token, end="", flush=True)
        print("\n")


if __name__ == "__main__":
    main()
