# coach_Agent

An AI-powered **coach agent** that accompanies learners during hands-on Azure labs.  
The agent uses **Azure OpenAI** (GPT-4o) to provide hints, explain concepts, and guide
learners step-by-step without simply giving away the answers.

---

## Features

- 💬 **Interactive CLI** – start a coaching session in your terminal
- 🧠 **Context-aware** – remembers the conversation so follow-up questions work naturally
- 🔄 **Streaming replies** – tokens appear as they are generated for a smooth experience
- 🌍 **Bilingual** – responds in the learner's language (French or English)
- 🔒 **No hard-coded credentials** – all secrets are loaded from environment variables

---

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/skanderkammoun/coach_Agent.git
cd coach_Agent
pip install -r requirements.txt
```

### 2. Configure credentials

```bash
cp .env.example .env
# Edit .env and fill in your Azure OpenAI values:
#   AZURE_OPENAI_API_KEY
#   AZURE_OPENAI_ENDPOINT
#   AZURE_OPENAI_DEPLOYMENT   (default: gpt-4o)
#   AZURE_OPENAI_API_VERSION  (default: 2024-12-01-preview)
```

### 3. Run

```bash
python main.py
```

```
Azure Lab Coach Agent 🤖
Type your question or 'exit' / 'quit' to leave.

You: How do I create a resource group in Azure?
Coach: Great question! Let's work through it together...
```

Special commands during a session:

| Command | Effect |
|---------|--------|
| `reset` | Clear conversation history and start fresh |
| `exit` / `quit` | End the session |

---

## Project structure

```
coach_Agent/
├── coach_agent/        # Python package
│   ├── __init__.py
│   ├── agent.py        # CoachAgent class (Azure OpenAI wrapper)
│   ├── config.py       # CoachConfig (reads from env)
│   └── prompts.py      # System prompt for the coach persona
├── tests/
│   └── test_coach_agent.py
├── main.py             # CLI entry point
├── requirements.txt
└── .env.example
```

---

## Running tests

```bash
pip install pytest
python -m pytest tests/ -v
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AZURE_OPENAI_API_KEY` | ✅ | – | Your Azure OpenAI API key |
| `AZURE_OPENAI_ENDPOINT` | ✅ | – | Resource endpoint URL |
| `AZURE_OPENAI_DEPLOYMENT` | | `gpt-4o` | Model deployment name |
| `AZURE_OPENAI_API_VERSION` | | `2024-12-01-preview` | API version |
| `COACH_MAX_HISTORY` | | `20` | Max messages kept in context |