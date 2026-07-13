# CashFlow

CashFlow helps a group finish the awkward part of shared expenses: deciding who should pay whom after the trip, household bill, or event is over.

[Open the app](https://cashflow-phi-amber.vercel.app/) · [Try the private demo](https://cashflow-phi-amber.vercel.app/demo) · [Read the security model](SECURITY.md) · [Read the privacy notice](PRIVACY.md)

The demo needs no account. It uses fictional people, keeps all changes in that browser tab, and sends no demo expenses to the API.

## What it does

- Records expenses, payers, and per-person shares inside a group.
- Builds a settlement plan that tells each person exactly whom to pay.
- Keeps payment confirmations separate from expenses: the sender marks a payment as sent and the recipient confirms or rejects it.
- Gives each user an actionable dashboard for payments to send and payments to confirm.
- Supports admin, member, and read-only auditor roles.
- Provides group activity history, CSV/PDF exports, optional receipt OCR, and live group updates.
- Keeps each group in one base currency while preserving conversion details for expenses entered in another supported currency.

CashFlow records what happened; it does not connect to a bank, hold funds, or transfer money.

## How settlement calculation is described

The solver works with integer cents and reports the strategy it used.

- With at most 12 people who have a non-zero balance, it searches for a plan with the minimum number of payments for that balance state.
- Above that limit, it uses a deterministic greedy fallback. The result still settles every balance, but it is not claimed to be globally minimal.

The normal Node/Render build runs the tested TypeScript solver. The repository also contains a matching C++ implementation that the Docker image can compile to WebAssembly. WASM is an optional runtime engine, not a requirement and not a claim about the current hosted deployment.

## Current status

This is a public beta. Authentication, group authorization, settlement confirmation, fixed-point money storage, upload validation, and private session handling are implemented and tested. The remaining limitations are listed openly in [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md).

Do not enter data you would be uncomfortable storing in a hosted PostgreSQL database. In particular, receipt OCR can send an image to OCR.space after explicit consent.

## Run it locally

Requirements: Node.js 20 or newer, PostgreSQL, and Redis.

```bash
npm install
cp .env.example apps/server/.env
npm run db:migrate:deploy
npm run db:seed
```

Fill in `DATABASE_URL`, `REDIS_URL`, and a random `JWT_SECRET` of at least 32 characters before starting the server. `OCR_SPACE_API_KEY` is optional.

Run the two applications in separate terminals:

```bash
npm run dev:server
npm run dev:web
```

The frontend is at `http://localhost:5173`; the API is at `http://localhost:4000`. If port 4000 is already in use, stop the existing Node process or set a different `PORT` in `apps/server/.env`.

## Verify a change

```bash
npm test --workspace=apps/server
npm test --workspace=apps/web
npm run build:server
npm run build:web
```

The server tests may need `npx vitest run --configLoader runner` on Windows environments where Vitest's default config loader cannot start a child process.

## Deploy

The hosted setup uses Vercel for the frontend and Render for the API. The production API is reverse-proxied through `/api` on Vercel so the refresh cookie remains first-party; Socket.io still connects directly to Render with a short-lived access token.

Read [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before deploying. Database migrations are required for the fixed-point money columns and settlement-payment workflow.

## Repository layout

```text
apps/web/                  React and Vite frontend
apps/server/               Express API, Prisma schema, and tests
apps/server/prisma/        Versioned PostgreSQL migrations
packages/solver/           Optional C++/WebAssembly solver
docs/                      Deployment notes and screenshots
```

## Contributing

A useful issue includes the route or screen, what you expected, what happened, and a small reproduction. For security reports, do not open a public issue; follow [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
