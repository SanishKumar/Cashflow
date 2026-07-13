# Privacy notice

Last updated: July 13, 2026

CashFlow is an open-source public beta for shared-expense records. This notice describes the behavior of the hosted application at `cashflow-phi-amber.vercel.app`; a self-hosted operator controls their own deployment and data practices.

## Data the hosted app stores

- Account name, email address, password hash, and optional avatar URL.
- Group names, membership, roles, expenses, shares, currency/conversion details, and settlement-payment confirmations.
- Audit entries describing account, group, expense, export, and settlement actions.
- Session records containing a hashed refresh token, expiry, IP address, and browser user-agent string.

The app does not ask for or store bank credentials, card numbers, or payment-account access because it does not move money.

## Demo data

The `/demo` experience is separate from user accounts. Its fictional group and any changes you make are held only in the current browser tab and are not sent to the CashFlow API.

## Receipt OCR

Receipt scanning is optional and requires an explicit confirmation before upload. The server accepts one supported image of at most 5 MB into memory; it does not save the uploaded image to application storage.

When `OCR_SPACE_API_KEY` is configured, the image is first sent to OCR.space for text extraction. If that fails or the image exceeds that provider's free-plan limit, the server attempts local Tesseract OCR. The raw provider response and raw OCR text are not returned to the browser or stored in the CashFlow database. OCR.space can process the image under its own terms and retention practices, so do not scan confidential receipts.

## Other service providers

- Vercel hosts the frontend and provides Analytics and Speed Insights in production.
- Render hosts the API.
- The configured PostgreSQL provider stores application data.
- Upstash Redis is used for rate limits and realtime message distribution.
- Frankfurter receives source currency, destination currency, and amount when conversion is requested; it is not sent CashFlow user identities.
- Google Fonts serves the Material Symbols icon font and can receive normal web-request metadata such as IP address and user-agent.

Each provider operates under its own privacy terms.

## Retention and deletion

Account and group records are currently retained until they are removed through an available product action or an operator request. Session records expire after seven days, although expired database rows may remain until routine session cleanup runs. Audit entries do not yet have an automatic retention limit.

Self-service account deletion and a complete personal-data export are not implemented. To request access or deletion for the hosted beta, email `18sanishkumar@gmail.com` from the address associated with the account. Do not put personal or financial details in a public GitHub issue. Identity must be verified before a request can be completed, and some records may need to be retained temporarily for security or integrity reasons.

## Security

The implemented controls and known gaps are listed in [SECURITY.md](SECURITY.md). No internet service can promise absolute security. Use fictional or low-sensitivity data while evaluating the beta.

## Changes

Material changes to this notice will be committed to the repository with an updated date.
