# CashFlow

[![CI](https://github.com/SanishKumar/Cashflow/actions/workflows/ci.yml/badge.svg)](https://github.com/SanishKumar/Cashflow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-6d4aff.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](package.json)

CashFlow is a full-stack shared-expense app built around one simple idea: marking a payment as sent is not the same as the other person receiving it.

Along with splitting expenses and calculating a compact settlement plan, CashFlow gives payments a small workflow of their own. A sender records the payment, the recipient confirms or rejects it, and the group keeps a useful history of what happened.

[Try the live demo](https://cashflow-phi-amber.vercel.app/demo) · [Open the app](https://cashflow-phi-amber.vercel.app/) · [Security](SECURITY.md) · [Privacy](PRIVACY.md)

The demo is the quickest way in. It uses fictional trip data, needs no account, and resets when the tab is refreshed.

## A look at the app

### The settlement desk

The dashboard brings together payments to send, payments waiting for confirmation, group balances, and recent activity.

![CashFlow dashboard showing settlement actions and active groups](docs/screenshots/dashboard_new.png)

### Group ledger

The ledger keeps expenses and settlement history readable without losing who initiated each entry.

![CashFlow group ledger in dark mode](docs/screenshots/image.png)

## What makes it interesting

- **Recipient-confirmed settlements.** A payment affects balances only after the named recipient confirms it. Senders can cancel pending claims; recipients can reject incorrect ones.
- **A solver with an explicit contract.** Money is converted to integer cents. Typical groups with up to 12 non-zero balances use an exact minimum-transaction search; larger groups use a deterministic greedy fallback.
- **Server-enforced roles.** Admins manage a group, members add expenses and settle balances, and auditors get read-only access.
- **An authorization-scoped audit trail.** Group, expense, role, and settlement events are recorded without exposing activity across groups.
- **Fixed-point financial data.** PostgreSQL decimal columns and cent-based calculations avoid floating-point drift in stored balances.
- **Short-lived browser sessions.** Access tokens live in memory, refresh tokens are hashed, rotated, and delivered through secure HTTP-only cookies.
- **Realtime group updates.** Socket.io rooms are authenticated and membership-checked before clients can subscribe.
- **Receipt-assisted entry.** Uploaded images are validated, processed in memory, and sent to the external OCR provider only after explicit consent.
- **Practical exports.** CSV ledgers preserve base-currency and original-currency values separately; settlement plans can be exported as PDF.

CashFlow records shared expenses and payment confirmations. It does not connect to bank accounts or move money.

## Settlement lifecycle

```text
Expense added
      ↓
Balances recalculated
      ↓
Settlement plan generated
      ↓
Sender marks payment as sent
      ↓
Recipient confirms ─── or ─── rejects
      ↓
Confirmed payment updates the ledger
```

Settlement decisions use optimistic concurrency on the server, so two confirmation requests cannot complete the same pending payment twice.

## Tech stack

| Layer | Technology |
| --- | --- |
| Web | React 19, TypeScript, Vite, Tailwind CSS |
| API | Express 5, TypeScript, Zod |
| Data | PostgreSQL, Prisma |
| Realtime | Socket.io, Redis pub/sub |
| Auth | Rotating refresh sessions, bcrypt, JWT |
| Solver | TypeScript with an optional C++/WebAssembly implementation |
| Testing | Vitest, Testing Library, Supertest |
| Hosting | Vercel frontend, Render API |

## Run locally

You will need Node.js 20+, PostgreSQL, and Redis.

```bash
git clone https://github.com/SanishKumar/Cashflow.git
cd Cashflow
npm install
cp .env.example apps/server/.env
```

Set `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and `CORS_ORIGIN` in `apps/server/.env`, then prepare the database:

```bash
npm run db:migrate:deploy
npm run db:seed
```

Start the API and web app in separate terminals:

```bash
npm run dev:server
npm run dev:web
```

The frontend runs on `http://localhost:5173`; the API runs on `http://localhost:4000`.

## Verify the repository

The same command runs locally and in GitHub Actions:

```bash
npm run verify
```

It runs ESLint, both test suites, the server TypeScript build, and the production Vite build. Production dependencies are also audited in CI.

## Repository map

```text
apps/web/              React application and component tests
apps/server/           Express API, services, socket server, and API tests
apps/server/prisma/    Prisma schema and versioned PostgreSQL migrations
packages/solver/       Optional C++/WebAssembly settlement solver
docs/                  Deployment notes and product screenshots
```

If you are reviewing the project, good starting points are the [settlement-payment service](apps/server/src/services/settlementPaymentService.ts), [solver](apps/server/src/services/solver.ts), [Socket.io authorization](apps/server/src/socket/socketServer.ts), and [security model](SECURITY.md).

## Deployment

The hosted version uses Vercel for the frontend and Render for the API. HTTP API traffic is reverse-proxied through the Vercel origin so the refresh cookie remains first-party, while Socket.io connects directly with a short-lived access token.

The complete release checklist is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## License

Released under the [MIT License](LICENSE).
