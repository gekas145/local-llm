#!/usr/bin/env bash
set -euo pipefail

# All paths live under the mounted /models volume so outputs persist on the host.
# model_name picks which subfolder of /models to serve, so one image can run
# different models (one at a time). It's required — there is no default.
model_name="${model_name:?model_name is required: the name of the checkpoint subfolder under /models}"
work_dir="${work_dir:-/models}"
src_dir="${work_dir}/${model_name}"                # unquantized HF checkpoint (mounted)
quant_type="${quant_type:-Q4_0}"
quant_dir="${src_dir}/quantized_${quant_type}"     # each quant type gets its own subdir
quantize="${quantize:-true}"
ctx_size="${ctx_size:-2048}"
port="8080"
gguf_created=false

if [ ! -d "${src_dir}" ]; then
    echo "ERROR: ${src_dir} not found. Mount the unquantized checkpoint there." >&2
    exit 1
fi

# Returns the single gguf found in a dir, empty string if none, errors if multiple.
find_single_gguf() {
    local dir="$1"
    local -a files
    mapfile -t files < <(find "${dir}" -maxdepth 1 -name "*.gguf" 2>/dev/null)
    if [ "${#files[@]}" -gt 1 ]; then
        echo "ERROR: expected a single gguf in ${dir}, found ${#files[@]}." >&2
        exit 1
    fi
    echo "${files[0]:-}"
}

# Ensures a bf16 gguf exists in src_dir, converting from HF checkpoint if needed.
# Sets src_gguf (path) and gguf_created (true if this run produced it).
ensure_gguf() {
    src_gguf=$(find_single_gguf "${src_dir}")
    if [ -z "${src_gguf}" ]; then
        src_gguf="${src_dir}/${model_name}.gguf"
        echo ">> Converting ${src_dir} -> ${src_gguf} (bf16)"
        python /opt/llama.cpp/convert_hf_to_gguf.py "${src_dir}" \
            --outfile "${src_gguf}" --outtype bf16
        gguf_created=true
    else
        echo ">> Found ${src_gguf}, skipping conversion."
        gguf_created=false
    fi
}

if [ "${quantize}" = "true" ]; then
    out_gguf=$(find_single_gguf "${quant_dir}")
    if [ -z "${out_gguf}" ]; then
        ensure_gguf
        mkdir -p "${quant_dir}"
        out_gguf="${quant_dir}/${model_name}.gguf"
        # No --imatrix: the QAT weights were already pushed onto the plain Q4_0 grid,
        # so the bare quantize is the intended pairing.
        echo ">> Quantizing -> ${out_gguf} (${quant_type})"
        llama-quantize "${src_gguf}" "${out_gguf}" "${quant_type}"
        [ "${gguf_created}" = "true" ] && rm -f "${src_gguf}"
    else
        echo ">> Found ${out_gguf}, skipping conversion and quantization."
    fi
else
    ensure_gguf
    out_gguf="${src_gguf}"
fi

echo ">> Serving on 0.0.0.0:${port}  (OpenAI-compatible: POST /v1/chat/completions)"
exec llama-server -m "${out_gguf}" --host 0.0.0.0 --port "${port}" --ctx-size "${ctx_size}" --jinja --verbose
