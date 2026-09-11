# syntax=docker/dockerfile:1

# ---- Build llama.cpp from source (no prebuilt binaries) ----
FROM python:3.12-slim-bookworm

# Toolchain: C++ compiler, cmake, git. libcurl for llama-server's optional
# model-from-URL feature; harmless to include.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake git ca-certificates libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

# Clone and compile llama.cpp
RUN git clone --depth 1 https://github.com/ggml-org/llama.cpp \
    && cmake -S llama.cpp -B llama.cpp/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build llama.cpp/build -j 2 --config Release \
    && cp llama.cpp/build/bin/llama-cli \
          llama.cpp/build/bin/llama-server \
          llama.cpp/build/bin/llama-quantize /usr/local/bin/

# Install dependencies
RUN pip install --no-cache-dir \
        -r llama.cpp/requirements/requirements-convert_hf_to_gguf.txt

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
# Strip any CRLF (the file is authored on Windows) before making it executable,
# otherwise the container fails with `bad interpreter: /usr/bin/env bash^M`.
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
