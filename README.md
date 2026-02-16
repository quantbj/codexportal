# Sales Portal for Direct Marketing Contracts

This repository contains a production-oriented starter for a sales portal that supports:
- photovoltaic pricing simulation
- quote intake
- contract closing workflow preparation
- self-service customer signup
- superuser user management (create, remove, password reset)

## Repository Structure

- `apps/backend`: domain-driven HTTP API (pricing + quote flow)
- `apps/frontend`: portal UI shell aligned with the marketing-to-contract funnel
- `docs/architecture`: architecture decisions and implementation plan
- `docs/security`: security controls and package policy
- `docs/api`: API contract
- `docs/runbooks`: operational runbook

## Quick Start

```bash
npm run start:pricing-service
npm run start:contracts-service
npm run start:backend
npm run start:frontend
```

Frontend runs on `http://localhost:3000`, backend on `http://localhost:3001`,
pricing-service on `http://localhost:3010`, and contracts-service on `http://localhost:3020`.

## Schema Split

- `contract-pricing.json`: pricing-relevant contract parameters (page 1)
- `contract-offer.json`: non-pricing contract parameters (page 2)

## Quality Gates

```bash
npm run lint
npm run test:coverage
```

Coverage target is at least 90% for lines and branches.

## Engineering Principles

- test-first domain implementation
- explicit module boundaries
- minimal dependency footprint to reduce supply-chain risk
- documentation-first architecture decisions (ADRs)

## Contracts Persistence

`contracts-service` supports two persistence modes:

- MongoDB (recommended for production): set `MONGODB_URI`
- File fallback (local/dev): `apps/contracts-service/data/*.json`

Optional MongoDB env vars:

- `MONGODB_DB_NAME` (default `sales_portal`)
- `MONGODB_USERS_COLLECTION` (default `users`)
- `MONGODB_DRAFTS_COLLECTION` (default `drafts`)
- `SEED_DEMO_USERS` (`true` by default; set `false` to disable)
- `SESSION_TTL_MS` (default `28800000`, eight hours)
- `AUTH_RATE_LIMIT_WINDOW_MS` (default `300000`, five minutes)
- `AUTH_RATE_LIMIT_MAX_ATTEMPTS` (default `10`)

Draft records persisted by `contracts-service` now include a `status`:
- `draft`: saved via `Entwurf speichern`
- `booked`: saved via `Vertrag buchen`

The frontend page `my-requests.html` is presented as `Gebuchte Verträge` and splits entries into separate `Draft` and `Booked` tables.
Rows on `Gebuchte Verträge` are clickable and open a contract preview modal with the saved contract payload.

## Demo Users (contracts-service)

- `customer1` / `customer1` -> role `customer`
- `customer2` / `customer2` -> role `customer`
- `admin` / `admin` -> role `superuser`

## Security Notes

- Passwords are stored as salted `scrypt` hashes (not plain text).
- Login and protected API routes use bearer tokens with server-side session expiry.
- Logout invalidates the current bearer token on the server (`POST /auth/logout`).
- Admin endpoints are protected by `superuser` role checks.
- Admin navigation is shown only for authenticated `superuser` users.
- Login/signup endpoints are rate-limited to reduce brute-force attempts.
