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

`REDIS_URL` is the one required variable the service can run without. Redis holds the rate-limit counters and carries realtime messages between instances; if it is missing or unreachable, both fall back to the instance's own memory and the API carries on. That is fine on a single instance and not something to leave in place on several.

The startup log says which it is. `[RATE LIMITER] Redis connected` means limits are shared. `[RATE LIMITER] Redis unavailable (...)` means they are not, and the text in brackets is the reason. `getaddrinfo ENOTFOUND` there means the hostname no longer exists: the database was deleted at the provider, which free hosted tiers can do after a period of inactivity. Create a new database, put its `rediss://` URL in `REDIS_URL`, and redeploy. The rate limiter keeps retrying on its own, so a database that was only briefly away needs nothing; realtime gives up after a few attempts and picks Redis up again at the next restart.

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
4. Confirm `/` returns 200, `/api/health` reports `database: connected`, and the startup log shows `[RATE LIMITER] Redis connected`.
5. Deploy Vercel.
6. In a private browser window, register, reload the page, create a group, add an expense, and log out.
7. With two test accounts, mark a suggested payment sent and confirm it from the recipient account.
8. Signed out, open the site and confirm both sample networks draw and every clearing mode switches without a network request.
9. Check desktop and mobile layouts in both themes, including folding the panels away and bringing them back, then ledger pagination, CSV/PDF export, and the browser console.

## 4. Performance expectations

The graph asks for the selected group's obligations in one request and warms the other groups only after that has landed. Clearing itself runs in the browser, so switching modes or samples never touches the API. The ledger uses a paginated feed rather than loading every group separately, and inactive ledger tabs do not fetch in the background.

Render's free web service can spin down after idle time, so its first request can still take roughly a minute. That delay cannot be removed by frontend code; use an always-on paid instance for a product reliability target.

## 5. Rollback

Render keeps the previous application deploy, but database migrations are not automatically rolled back. The added schema is backward-compatible with the immediately preceding beta code, so roll the application back first and restore the database only if investigation shows that is necessary. Never improvise a destructive down migration against the only production copy.
