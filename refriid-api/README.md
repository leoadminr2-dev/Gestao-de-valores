# RefriID API — staging, billing disabled

Dedicated backend for Wix site `20eb7440-0899-4a5c-a8db-c1d850817b79` and Mercado Pago subscription application `3973755243076236`.

Run `npm ci && npm test`, then `npm start` with `DATABASE_URL`, `CREDENTIALS_ENCRYPTION_KEY` (32-byte hex), `SETUP_TOKEN` (random 256-bit secret), `SETUP_EXPIRES_AT` (milliseconds), `WEBHOOK_TOKEN` (random 256-bit secret), `PUBLIC_URL`, and `BILLING_ENABLED=false`.

The schema is additive, local to the dedicated RefriID database, initialized on startup. No other project/database is read or changed. Secrets are encrypted with AES-256-GCM; the key remains in Render environment variables. No secrets or HTTP bodies are logged. The protected setup link uses a URL fragment, removed immediately before the token is transmitted in an Authorization header. It expires and cannot overwrite an already configured credential.

`/health` exposes booleans only. `/setup#<setup-token>` is exclusively for the owner. POST `/admin/config` verifies the expected seller account through Mercado Pago `/users/me`, encrypts the credential, and does not enable billing. Seller validation does not by itself prove the application: each subscription/payment must additionally match the exact application ID before it can affect entitlement.

Billing endpoints verify Wix token introspection (active MEMBER, site and OAuth app, expiration). Prices, recurrence, trial dates, and payment ownership are server controlled. Webhook payloads are untrusted hints; resource data is re-fetched from Mercado Pago and matched to existing local subscriptions, seller, application, member, amount, currency, and live mode. A private webhook route avoids relying on an unsigned request. Payment IDs are unique; duplicates cannot extend access. Refund/chargeback statuses revoke that payment's entitlement. Cancelled subscriptions preserve only the remaining trial/paid period, never an indefinite authorization.

## Release remains blocked

- Register production credential via protected setup.
- Confirm pending subscription checkout, notification URL acceptance, invoice search pagination and payment field shapes against the actual API; tests currently use isolated simulations.
- Test full sandbox payment, renewal, refund, cancellation, webhook retries, provider outages, and concurrent subscribe requests.
- Replace Wix's direct data access with server-authorized business operations (and prevent bypass through Wix collection permissions). The existing pilot frontend has NOT been switched. `/api/entitlement` alone is not a data access gate.
- Reconcile subscriptions at a durable schedule and handle ambiguous provider-create timeouts before enabling live billing.
- Confirm owner authentication/login and cross-account isolation through the actual UI.

`BILLING_ENABLED` must stay `false` until those checks pass. This deployment prepares the server and secure credential entry; it is not a commercial launch.

Official references used: Mercado Pago subscriptions create-preapproval, pending-payments, authorized-payment-search and notifications; Wix OAuth token-info and Get My Member; Render configure-environment-variables, deploys, health-checks and compute-plans.
