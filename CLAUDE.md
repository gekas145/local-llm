# Project

This project is about hosting a large language model locally on machine with constrained resources. All compute is run on CPU, around 5 GB of RAM are available. Model is hosted locally on llama.cpp server.

# Contents

This section describes purposes of different scripts and directories from this project.

* `docker-compose.yml` - composes all services: `llm` (the llama.cpp LLM server) and `backend` (Python API). Services reach each other by service name on the compose network (backend calls the LLM at `http://llm:8080`). All service config (model_name, quantize, quant_type) is defined inline in the `environment:` sections; host ports are overridable via `llm_port`/`backend_port` env vars. Run everything with `docker compose up --build` from the repo root; see README.md for more command variants.
* `llm_service/` - directory holding everything connected to hosting the LLM.
  * `llm_service/models/` - this directory holds parameters of all models. They are normally in safetensors(directory with multiple files) or gguf(directory with single .gguf file). Since this directory is ignored by git, you are not supposed to read from it directly, just know it is here.
  * `llm_service/Dockerfile`, `llm_service/entrypoint.sh` - files defining docker image and its parts. The image loads all necessary libraries, builds llama.cpp project from source, quantizes model(if requested) and starts llama.cpp server on 8080 port by default. `Dockerfile` has to be edited carefully, always consult changes with the user and let them know if the changes are gonna require costly rebuild of the image.
* `backend/` - Python backend service (FastAPI + stdlib sqlite3), own `Dockerfile`. SQLite DB lives on the named docker volume `dbdata` (mounted at `/data`), path set via `DB_PATH` env var; it deliberately is NOT a bind mount because SQLite locking is unreliable on Windows bind mounts. Routes are split into routers under `backend/app/routers/` (`chats.py` holds read-only `/chats` endpoints, `completions.py` holds `POST /completions` which stores the user message, calls the LLM, and stores its reply); `main.py` just wires them into the `FastAPI` app. `backend/app/llm_client.py` talks to the llama.cpp server's OpenAI-compatible `/v1/chat/completions` endpoint and translates the db's `model` role to the API's `assistant` role. Backend deps (fastapi, uvicorn, requests) are only installed inside the Docker image, not the local `.venv` used for `llm_service`/`python_scripts` — Pylance "Import could not be resolved" warnings under `backend/` are expected and can be ignored.
* `python_scripts/` - Python scripts holding some MWE of small apps like LangGraph flows.

If you change locations of any files, or add new files or folders, which may be of importance for the project - edit this file, to know of those changes in future. Only add info about significant contents changes here, rest can be put into notes. Always ask the user before making any changes to this file