# Local Development Runbook

## Prerequisites

- Node.js 20+
- npm 10+

## Start Services

```bash
npm run start:pricing-service
npm run start:contracts-service
npm run start:backend
npm run start:frontend
```

## Validate Quality Gates

```bash
npm run lint
npm run test:coverage
```

## Manual Smoke Test

1. Open `http://localhost:3000`.
2. Use calculator section to compute annual net revenue.
3. Submit quote request and verify quote id is returned.
4. Query quote details with backend endpoint `/api/quotes/{id}`.

## Pricing Service Integration

- The backend delegates pricing to the external pricing component by default.
- Default pricing-service URL: `http://localhost:3010`
- Override with `PRICING_SERVICE_BASE_URL` when needed.
- CORS frontend origin override: `FRONTEND_ORIGIN` (backend + contracts-service)

## Contracts Service Integration

- Contract drafts are persisted in `apps/contracts-service/data/drafts.json`.
- Service URL: `http://localhost:3020`
- Auth model: bearer token from `/auth/login`.
- Role model:
  - `customer`: own drafts only
  - `superuser`: all drafts

## Troubleshooting

- If port `3000` or `3001` is in use, set `PORT` env var before running each app.
- If tests fail after model changes, update deterministic expected values in unit tests.
