# Sales Portal for Direct Marketing Contracts

This repository contains a production-oriented starter for a sales portal that supports:
- photovoltaic pricing simulation
- quote intake
- contract closing workflow preparation

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

## Demo Users (contracts-service)

- `customer1` / `customer1` -> role `customer`
- `customer2` / `customer2` -> role `customer`
- `admin` / `admin` -> role `superuser`
