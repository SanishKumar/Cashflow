# Security policy

CashFlow is a public beta, not a bank. It stores shared-expense records and settlement confirmations, but it does not connect to bank accounts, hold funds, or move money.

## Reporting a vulnerability

Do not open a public GitHub issue for a suspected vulnerability or include real user data in a report.

Use a [private GitHub security advisory](https://github.com/SanishKumar/Cashflow/security/advisories/new) or email `18sanishkumar@gmail.com` with the subject `CashFlow security report`. Include the affected route or feature, impact, reproduction steps, and any suggested mitigation. Please allow time to investigate before publishing details.

## Controls currently implemented

- Passwords are hashed with bcrypt at cost 12.
- Access tokens expire after 15 minutes and are kept in browser memory rather than local storage.
- Opaque refresh tokens expire after 7 days, are hashed in PostgreSQL, rotate after use, and are delivered in `HttpOnly`, `Secure` production cookies.
- Browser authentication mutations are restricted to the configured frontend origin.
- API identity comes only from a verified bearer token; client-supplied user IDs are not accepted as authentication.
- User endpoints are self-scoped. Group data, exports, audit history, payment actions, and Socket.io rooms all check group membership and role.
- Admin, member, and read-only auditor permissions are enforced on the server.
- Login/registration and receipt scanning use shared Redis-backed rate limits that fail closed when the store is unavailable. The general API limiter is availability-oriented and can fail open.
- Helmet security headers, exact-origin CORS, structured validation, parameterized Prisma queries, and non-cached API responses are enabled.
- Receipt uploads are memory-only, limited to one 5 MB image, and checked against both declared MIME type and file signature.
- Financial values are stored as fixed-point PostgreSQL decimals; settlement decisions are made in integer cents.
- Payment claims do not alter balances until the named recipient confirms them.
- Security-relevant group and settlement actions are written to an authorization-scoped audit log.
- Production Redis connections use TLS with certificate verification.

## Known gaps

These are not hidden behind a “production ready” claim:

- There has been no independent penetration test or formal security audit.
- Email verification, password reset, multi-factor authentication, recovery codes, and suspicious-login alerts are not implemented.
- There is no self-service account deletion or complete personal-data export yet.
- Exact-email lookup for invitations tells an authenticated user whether that address has a CashFlow account.
- The public deployment depends on Vercel, Render, the configured PostgreSQL provider, Upstash Redis, and optionally OCR.space. Their security and availability are outside this repository.
- Receipt OCR is not suitable for confidential receipts. With consent, the image is tried against OCR.space before a local OCR fallback.
- Dependency review, key rotation, backup testing, log-retention limits, incident response, and restore drills remain operational responsibilities.
- A free Render instance can sleep and is intended for evaluation, not production reliability.

## Deployment requirements

- Generate a unique `JWT_SECRET` with at least 32 characters; never commit it.
- Use `rediss://` for hosted Redis and a TLS-enabled PostgreSQL connection.
- Set `CORS_ORIGIN` to the exact production frontend origin.
- Keep the Vercel `/api` reverse proxy enabled so refresh cookies remain first-party while the frontend and API use different provider domains.
- Apply committed migrations with `prisma migrate deploy`; do not use `db push` against production.
- Set Render's health check to `/api/health` and monitor repeated authentication failures, 5xx responses, and database/Redis connection errors.
- Rotate database, Redis, OCR, and JWT credentials immediately if they may have been exposed.

## Supported versions

Only the current default branch and current hosted beta are supported with security fixes.
