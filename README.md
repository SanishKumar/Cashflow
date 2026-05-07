# CashFlow Management v2.0

> Enterprise-grade debt minimization platform powered by Max Heap algorithms. Minimize complex debt networks among groups in real-time.

## Key Features

- **Real-Time Debt Minimization**: Automatically calculates the most efficient settlement paths using a C++ WASM solver.
- **Glassmorphic UI**: Premium, modern interface built with Tailwind CSS v4, featuring micro-animations and responsive layouts.
- **Interactive Graphs**: Visualizes the flow of debts using React Flow with real-time WebSockets synchronization.
- **Global Ledger**: Aggregates all transactions across all groups in a unified, sortable view.
- **Seamless Settlements**: "Settle Up" modal lets users resolve optimized debts with a single click, instantly updating all balances.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   React +   │────▶│  Express +   │────▶│  PostgreSQL  │
│    Vite     │ WS  │   Socket.io  │     │  (Prisma)    │
│  (Tailwind) │◀────│  (TypeScript)│◀────│              │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────┴───────┐     ┌──────────────┐
                    │  C++ → WASM  │     │    Redis     │
                    │  Max Heap    │     │  (Pub/Sub)   │
                    │   Solver     │     └──────────────┘
                    └──────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS v4, React Flow |
| Backend | Node.js, Express 5, TypeScript, Socket.io |
| Algorithm | C++ (Max Heap) → WebAssembly via Emscripten |
| Database | Neon (Serverless PostgreSQL) + Prisma ORM |
| Real-Time | Socket.io + Redis Pub/Sub (Upstash) |
| DevOps | Docker, Docker Compose |

## Quick Start

### Prerequisites
- Node.js ≥ 20
- [Neon](https://neon.tech) account (free — serverless PostgreSQL)
- [Upstash](https://upstash.com) account (free — serverless Redis)

### Infrastructure Setup

1. **Neon PostgreSQL**: Create a project → copy the connection string
2. **Upstash Redis**: Create a database → copy the `rediss://` connection URL (TLS)
3. Copy `.env.example` → `apps/server/.env` and fill in your credentials

### Local Development

```bash
# 1. Clone and install
npm install

# 2. Set up environment (fill in Neon + Upstash credentials)
cp .env.example apps/server/.env

# 3. Push database schema to Neon
cd apps/server && npx prisma db push && cd ../..

# 4. Seed demo data
cd apps/server && npx tsx src/prisma/seed.ts && cd ../..

# 5. Start backend
npm run dev:server

# 6. Start frontend (new terminal)
npm run dev:web
```

### Docker Compose (Full Stack)

```bash
docker compose up --build
```

- Frontend: http://localhost:3000 (Docker) / http://localhost:5173 (dev)
- Backend: http://localhost:4000
- API Health: http://localhost:4000/api/health

## Core Algorithm

The debt minimization uses a **Max Heap greedy algorithm** (inspired by [Codeforces 1266D](https://codeforces.com/problemset/problem/1266/D)):

1. Compute net balance per person from all transactions
2. Split into creditor max-heap (positive) and debtor max-heap (negative)
3. Greedily match largest creditor with largest debtor
4. Settle `min(credit, debt)`, re-insert remainder
5. Produces optimal **O(N-1)** settlement graph

Time complexity: **O(N log N)** — handles 10,000+ users in <1ms.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |
| POST/GET | `/api/users` | User CRUD |
| POST/GET | `/api/groups` | Group CRUD |
| POST/DELETE | `/api/groups/:id/members` | Member management |
| POST/GET | `/api/groups/:id/transactions` | Transaction CRUD |
| GET | `/api/groups/:id/settlements` | Compute minimized debts |

## Project Structure

```
CashFlow-Management/
├── apps/
│   ├── web/                 # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/  # Sidebar, Layout, DebtGraph, ExpenseModal
│   │   │   ├── pages/       # GroupsPage, GroupDetailPage
│   │   │   ├── hooks/       # useApi, useSocket
│   │   │   ├── lib/         # API client, Socket client
│   │   │   └── types/       # TypeScript interfaces
│   │   └── Dockerfile
│   │
│   └── server/              # Express + TypeScript backend
│       ├── src/
│       │   ├── routes/      # users, groups, transactions
│       │   ├── services/    # Business logic + solver
│       │   ├── middleware/  # Validation, error handling
│       │   ├── socket/      # Socket.io server
│       │   ├── wasm/        # WASM loader bridge
│       │   └── prisma/      # Schema + seed
│       └── Dockerfile
│
├── packages/
│   └── solver/              # C++ → WebAssembly solver
│       ├── src/solver.cpp
│       ├── CMakeLists.txt
│       └── build.sh
│
├── docker-compose.yml
└── package.json
```

## License

MIT
