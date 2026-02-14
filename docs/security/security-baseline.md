# Security Baseline

## Application Controls

- input validation for every external payload
- defensive response headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cache-Control`)
- request size guardrails (1MB cap)
- explicit 4xx behavior for invalid input and unknown resources
- auth endpoint throttling for brute-force resistance
- server-side token invalidation (`POST /auth/logout`)
- session expiration enforced on every authenticated request

## Identity and Access

- OIDC integration for workforce and customer login
- role-based authorization on contract/admin endpoints (`customer`, `superuser`)
- MFA for internal users

## Data Protection

- minimize PII collection to required sales fields
- encrypt data at rest and in transit in production deployment
- define retention and deletion policy for quote and contract records

## Audit and Compliance

- immutable event log for pricing and contract decisions
- capture model version and input snapshot for each offer
- periodic access review and least-privilege checks

## Dependency and Supply Chain Policy

- prefer standard-library-first implementations for critical paths
- allow external packages only if:
  - actively maintained
  - no known critical CVEs
  - permissive license
  - clear update strategy
- enforce lockfile integrity and SCA scanning in CI
- current gap: repository has no lockfile yet; add one before production releases
