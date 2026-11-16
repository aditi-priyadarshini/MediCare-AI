# AI assistant configuration

This repository currently supports **Anthropic only** as an external LLM provider. The provider is optional: the application works without an API key in **evidence-only mode**.

## Where to put the API key

### Docker Compose (recommended)

Put the variables in the **repository-root `.env` file**, beside `docker-compose.yml`.

```bash
cp .env.example .env
```

Edit the root `.env`:

```dotenv
# AI assistant
LLM_PROVIDER=anthropic
LLM_API_KEY=your_anthropic_api_key
LLM_MODEL=claude-sonnet-5-5
```

Keep the key on the backend/server side. **Never put `LLM_API_KEY` in `frontend/.env`, a `NEXT_PUBLIC_*` variable, browser code, source control, screenshots, or client-side configuration.** Do not commit `.env`.

Compose reads these root variables and passes them to the `migrate`, `backend`, and `worker` services. The backend uses the key when drafting an answer; the worker receives the same application environment but does not need to call the model for its reminder tasks.

Restart/rebuild the stack after changing environment values:

```bash
docker compose up -d --build
```

You do not normally need `docker compose down`; Compose will recreate services whose configuration changed.

### Running the backend without Docker

The backend loads `.env` from its current working directory. Create `backend/.env` from the backend template:

```bash
cp backend/.env.example backend/.env
```

Then set:

```dotenv
LLM_PROVIDER=anthropic
LLM_API_KEY=your_anthropic_api_key
LLM_MODEL=claude-sonnet-5-5
```

Do not commit this file. Restart the backend process after editing it.

## Available settings

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `none` | `none` disables model drafting; `anthropic` enables the Anthropic adapter |
| `LLM_API_KEY` | empty | Secret API key for the selected provider |
| `LLM_MODEL` | `claude-sonnet-5-5` | Model identifier sent to Anthropic |
| `LLM_TIMEOUT_SECONDS` | `30` | Request timeout in seconds |
| `LLM_MAX_OUTPUT_TOKENS` | `700` | Maximum generated output tokens |
| `ASSISTANT_REQUESTS_PER_MINUTE` | `20` | Per-user assistant request limit |

The supported provider values are defined by `backend/app/core/config.py` as `none` and `anthropic`. `openrouter` is **not currently supported** by this repository. Setting `LLM_PROVIDER=openrouter` will fail settings validation; adding OpenRouter requires a provider adapter and configuration changes, not just an environment variable.

## Evidence-only mode

The default configuration is:

```dotenv
LLM_PROVIDER=none
LLM_API_KEY=
```

In this mode the assistant can still retrieve and list matching patient records, but it does not use an external language model to draft an answer.

## Privacy and safety notes

- The assistant requires the patient's `ai_context` consent before retrieving patient context. Context switches are off by default, and revoking consent stops retrieval.
- The model receives only the structured, de-identified evidence assembled for the current request. It does not receive database credentials, SQL access, tools, or conversation memory.
- The model output is treated as an untrusted draft and validated against the evidence and safety rules before it is returned.
- Requests for diagnosis or to start, stop, or change medication are handled by fixed safety responses rather than sent to the model.
- Review Anthropic's current retention, privacy, and training terms before using real patient data. Do not use real patient information in development or testing unless the deployment and legal/privacy requirements have been reviewed.
- Keep API keys in server-side secret storage in production. Rotate a key immediately if it is exposed.

## Troubleshooting

**The backend refuses to start with `LLM_API_KEY is required`:** set a non-empty `LLM_API_KEY` when `LLM_PROVIDER=anthropic`, or switch back to `LLM_PROVIDER=none`.

**The assistant says no model is configured:** confirm the environment variables are in the root `.env` for Docker Compose (not `frontend/.env`), then recreate the backend service:

```bash
docker compose up -d --force-recreate backend
```

**Changes do not take effect:** check the effective container environment without printing the secret:

```bash
docker compose exec backend sh -lc 'printf "LLM_PROVIDER=%s\nLLM_MODEL=%s\n" "$LLM_PROVIDER" "$LLM_MODEL"; test -n "$LLM_API_KEY" && echo "LLM_API_KEY=set" || echo "LLM_API_KEY=missing"'
```

Never run commands that print the actual API key into shared logs or screenshots.
