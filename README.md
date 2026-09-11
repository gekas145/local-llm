# local-llm

Run a local LLM via llama.cpp on CPU in Docker with an OpenAI-compatible API, plus a Python backend for chat UI with a persistent SQLite database. Everything is orchestrated by the `docker-compose.yml` in the repo root.

## Services

| Service | Image source | Host port (default) | Purpose |
|---|---|---|---|
| `llm` | `llm_service/` | `8080` | llama.cpp server; converts/quantizes the model on first run |
| `backend` | `backend/` | `8000` | FastAPI chat app; owns the SQLite DB, talks to the LLM at `http://llm:8080` |

All service configuration (model name, quantization, ports inside the containers) lives in `docker-compose.yml` under each service's `environment:` section. Host ports can be overridden without editing the file via the `llm_port` and `backend_port` env vars.

## Running

All commands run from the repo root. Use `--build` whenever a Dockerfile or the code baked into an image has changed, so that costly llama.cpp rebuild does not happen every time.

Everything:
```powershell
docker compose up --build
```

Chosen services — for example only LLM:
```powershell
docker compose up --build llm
```

Note: listing a service also starts its `depends_on` dependencies — `docker compose up backend` alone would pull `llm` up too; add `--no-deps` to prevent that.

Other useful forms:
```powershell
docker compose up -d                  # detached; then:
docker compose logs -f llm          # follow one service's logs
docker compose down                   # stop and remove containers (volumes survive)
$env:llm_port = "9000"; docker compose up   # override a host port for this run
```

### First startup

On the first run `llm` converts and quantizes the model before serving, which takes a while on CPU; the backend comes up immediately and doesn't need the LLM until a request actually uses it. Subsequent starts reuse the quantized GGUF and skip straight to serving.

## Calling the LLM API

LLM (OpenAI-compatible):
```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Storage

### Model folder layout

Models are served from subfolders under `llm_service/models` (bind-mounted into the container at `/models`). Each model folder starts as an unquantized HuggingFace checkpoint; after a run it looks like this:

```
llm_service/models/
└── gemma-3-1b-it-qat-q4_0-unquantized/   # HF checkpoint (mounted from host)
    ├── config.json
    ├── *.safetensors
    └── quantized_Q4_0/
        └── gemma-3-1b-it-qat-q4_0-unquantized.gguf
```

The quantized GGUF persists on the host across container restarts — conversion and quantization only run once per model/quant-type combination. Which model is served is set by `model_name` in `docker-compose.yml`.

## Chat app

Repo also contains very light chat app powered by the locally hosted LLM. One can use the app by building its backend(see below) and opening `chat_app/frontend/index.html`. The app uses FastAPI for its backend and SQLite database for chats persistence.

```powershell
docker compose up --build backend
```
