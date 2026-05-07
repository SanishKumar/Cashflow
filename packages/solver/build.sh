#!/bin/bash
# ──────────────────────────────────────────────
# Build script for C++ → WebAssembly solver
# Requires: Emscripten SDK (emsdk)
# ──────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${SCRIPT_DIR}/src"
OUT_DIR="${SCRIPT_DIR}/dist"

echo "[BUILD] Compiling CashFlow solver to WebAssembly..."

mkdir -p "${OUT_DIR}"

emcc "${SRC_DIR}/solver.cpp" \
    -o "${OUT_DIR}/solver.js" \
    -s EXPORTED_FUNCTIONS="['_solve','_free_result','_get_version']" \
    -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','UTF8ToString']" \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="SolverModule" \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s ENVIRONMENT="node" \
    -s NO_EXIT_RUNTIME=1 \
    -O2 \
    --no-entry

echo "[BUILD] ✓ Output: ${OUT_DIR}/solver.js + ${OUT_DIR}/solver.wasm"
echo "[BUILD] ✓ WASM solver build complete!"
