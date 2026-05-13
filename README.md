# CashFlow Management v2.0

> Enterprise-grade debt minimization platform powered by an Optimized Directed Graph Minimization Engine. Minimize complex debt networks among groups in real-time.

## Key Features

- **Real-Time Debt Minimization**: Automatically calculates the most efficient settlement paths using a C++ WASM solver.
- **Glassmorphic UI**: Premium, modern interface built with Tailwind CSS v4, featuring micro-animations and responsive layouts.
- **Interactive Graphs**: Visualizes the flow of debts using React Flow with real-time WebSockets synchronization.
- **WASM OCR Receipt Scanning**: Drag-and-drop receipt scanning powered by client-side Tesseract.js.
- **Multi-Currency Support**: Real-time dynamic exchange rate conversion via Frankfurter API.
- **Global Identity Context**: Seamlessly switch "Viewing As" identity across the entire application with global state management.
- **Global Ledger**: Aggregates all transactions across all groups in a unified, sortable view.
- **Seamless Settlements**: "Settle Up" modal lets users resolve optimized debts with a single click, instantly updating all balances.

## Screenshots
| | |
|:---:|:---:|
| <img src="docs/screenshots/dashboard.png" alt="Dashboard View" /> <br/> **Dashboard View** | <img src="docs/screenshots/graph.png" alt="Interactive Debt Graph" /> <br/> **Interactive Debt Graph** |
| <img src="docs/screenshots/ocr-modal.png" alt="WASM OCR Receipt Scanning" /> <br/> **WASM OCR Receipt Scanning** | <img src="docs/screenshots/ledger.png" alt="Global Ledger" /> <br/> **Global Ledger** |

## Architecture

```mermaid
graph TD
    subgraph Client["Client Tier (React + Vite)"]
        UI["Tailwind CSS v4\nGlassmorphic UI"]
        OCR["Tesseract.js\nWASM OCR"]
        WS_C["Socket.io Client"]
        Graph["React Flow\nInteractive Network"]
    end

    subgraph Server["API Tier (Express + Node.js)"]
        API["REST API\nExpress Router"]
        WS_S["Socket.io Server"]
        Solver["C++ WASM\nGraph Flow Solver"]
        Cur["Frankfurter API\nCurrency Converter"]
    end

    subgraph Data["Data Tier"]
        DB[(Neon PostgreSQL\nServerless DB)]
        ORM["Prisma ORM"]
        Redis[("Upstash Redis\nPub/Sub")]
    end

    %% Connections
    UI <--> |REST/JSON| API
    OCR -.-> |Extracts| UI
    Graph <--> |Live Sync| WS_C
    WS_C <--> |WebSockets| WS_S
    
    API <--> |Queries| ORM
    WS_S <--> |Broadcasts| Redis
    
    API --> |Currency Swap| Cur
    API <--> |Data Prep| Solver
    
    ORM <--> |Connection Pool| DB
    
    classDef default fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4;
    classDef database fill:#181825,stroke:#f38ba8,stroke-width:2px,color:#cdd6f4;
    classDef algorithm fill:#313244,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4;
    
    class DB,Redis database;
    class Solver,OCR algorithm;
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS v4, React Flow |
| Backend | Node.js, Express 5, TypeScript, Socket.io |
| Algorithm | C++ (Graph Optimizer) → WebAssembly via Emscripten |
| Database | Neon (Serverless PostgreSQL) + Prisma ORM |
| Real-Time | Socket.io + Redis Pub/Sub (Upstash) |
| DevOps | Docker, Docker Compose |

## Quick Start

### Prerequisites
- Node.js ≥ 20
- [Neon](https://neon.tech) account (free — serverless PostgreSQL)
- [Upstash](https://upstash.com) account (free — serverless Redis)

### Infrastructure Setup

1. **Neon PostgreSQL**: Create a project → copy the connection string. Add `&connect_timeout=30&pool_timeout=30` to prevent serverless cold-start errors.
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

### Production Deployment Notes
If deploying to free-tier services like Render and Neon, we recommend setting up an external cron-job via `cron-job.org` to ping `/api/groups` every 14 minutes. This prevents the server and database from spinning down during periods of inactivity, preventing high-latency cold starts.

## Core Algorithm

The debt minimization utilizes an **Optimized Directed Graph Minimization Engine** to dynamically compute the most efficient settlement paths in real-time.

1. Compute net balance per entity across the financial network.
2. Construct dynamic flow graphs for positive (credit) and negative (debt) edges.
3. Greedily resolve multi-layered debt networks using advanced Disjoint Set Union (DSU) heuristics.
4. Settle optimized paths and dynamically re-evaluate the graph for non-linear cycles.
5. Produces optimal **O(N-1)** minimum-edge settlement paths.

Performance: Highly optimized for large-scale enterprise data — handles 10,000+ entities in <1ms.

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
