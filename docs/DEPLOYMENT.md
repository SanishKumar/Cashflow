# Deployment checklist

This repository currently targets a Vercel frontend and a Render Node web service.

## 1. Render API

Use the repository root as the service root.

Required environment variables:

```text
NODE_ENV=production
DATABASE_URL=postgresql://...?...sslmode=require
REDIS_URL=rediss://...
JWT_SECRET=<unique random value of at least 32 characters>
CORS_ORIGIN=https://cashflow-phi-amber.vercel.app
```

Optional variables:

```text
OCR_SPACE_API_KEY=
PREMIUM_RECEIPT_USER_IDS=
SOLVER_DEBUG=false
```

Recommended commands for the current free Render service:

```text
Build: npm install --include=dev && npm run build:render
Start: npm run start --workspace=apps/server
Health check: /api/health
```

`build:render` generates Prisma Client, applies committed production migrations, and compiles the server. Render's separate pre-deploy command is preferable on a paid service: move `npm run db:migrate:deploy` there and use `npm run db:generate --workspace=apps/server && npm run build:server` as the build command.

Never use `prisma migrate dev` or `prisma db push` against production. The release includes migrations that convert money columns to fixed-point decimals, preserve old settlement-shaped transactions as payment history, and introduce recipient-confirmed settlement payments.

The root route is a lightweight liveness response. `/api/health` checks PostgreSQL and returns 503 when the app is not ready.

## 2. Vercel frontend

Set the Vercel project root directory to `apps/web`, build command to `npm run build`, and output directory to `dist`.

Set this production variable:

```text
VITE_API_URL=https://cashflow-api-ku49.onrender.com
```

The variable is used for the direct authenticated Socket.io connection. Normal HTTP requests use same-origin `/api` URLs and the first rewrite in `apps/web/vercel.json` proxies them to Render. Keep that API rewrite before the SPA fallback. This lets the `HttpOnly` refresh cookie belong to the Vercel site instead of becoming a third-party cookie.

If the Render service URL changes, update both `apps/web/vercel.json` and `VITE_API_URL`. A separate `VITE_SOCKET_URL` can override only the realtime endpoint.

## 3. Release order

1. Back up the production database and confirm the restore procedure.
2. Run the full tests and builds locally.
3. Deploy the Render service and watch the migration/build logs.
4. Confirm `/` returns 200 and `/api/health` reports `database: connected`.
5. Deploy Vercel.
6. In a private browser window, register, reload the page, create a group, add an expense, and log out.
7. With two test accounts, mark a suggested payment sent and confirm it from the recipient account.
8. Check desktop and mobile layouts, `/demo`, ledger pagination, CSV/PDF export, and the browser console.

## 4. Performance expectations

The dashboard now uses one consolidated API response and the ledger uses a paginated feed rather than loading every group separately. Inactive ledger tabs do not fetch in the background.

Render's free web service can spin down after idle time, so its first request can still take roughly a minute. That delay cannot be removed by frontend code; use an always-on paid instance for a product reliability target.

## 5. Rollback

Render keeps the previous application deploy, but database migrations are not automatically rolled back. The added schema is backward-compatible with the immediately preceding beta code, so roll the application back first and restore the database only if investigation shows that is necessary. Never improvise a destructive down migration against the only production copy.
