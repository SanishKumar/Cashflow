# ──────────────────────────────────────────────
# Backend Dockerfile — Multi-stage Build
# Stage 1: Install deps + compile TypeScript
# Stage 2: Production runtime
# ──────────────────────────────────────────────

# Compile the C++ settlement solver to a Node-compatible WebAssembly module.
# Pinning the toolchain keeps the generated module reproducible across deploys.
FROM emscripten/emsdk:3.1.74 AS wasm-builder

WORKDIR /solver

COPY packages/solver/src/ ./src/

RUN mkdir -p dist && \
    emcc src/solver.cpp \
      -o dist/solver.js \
      -s EXPORTED_FUNCTIONS="['_solve','_free_result','_get_version']" \
      -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','UTF8ToString']" \
      -s MODULARIZE=1 \
      -s EXPORT_NAME="SolverModule" \
      -s ALLOW_MEMORY_GROWTH=1 \
      -s ENVIRONMENT="node" \
      -s NO_EXIT_RUNTIME=1 \
      -O2 \
      --no-entry

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root + server package files
COPY package.json ./
COPY apps/server/package.json apps/server/
COPY apps/server/tsconfig.json apps/server/

# Install dependencies
RUN npm install --workspace=apps/server

# Copy Prisma schema and generate client
COPY apps/server/prisma/ apps/server/prisma/
RUN npx prisma generate --schema=apps/server/prisma/schema.prisma

# Copy source code
COPY apps/server/src/ apps/server/src/

# Bring in the solver built from the committed C++ source.
COPY --from=wasm-builder /solver/dist/ packages/solver/dist/

# Build TypeScript
RUN npm run build --workspace=apps/server

# ──────────────────────────────────────────────
# Production stage
# ──────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./
COPY apps/server/package.json apps/server/

# Install production dependencies only
RUN npm install --workspace=apps/server --omit=dev

# Copy Prisma schema + generated client
COPY --from=builder /app/apps/server/prisma apps/server/prisma
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma node_modules/@prisma

# Copy compiled JS
COPY --from=builder /app/apps/server/dist apps/server/dist

# Copy the generated WASM module used by the server at runtime.
COPY --from=builder /app/packages/solver/dist/ packages/solver/dist/

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "apps/server/dist/server.js"]
