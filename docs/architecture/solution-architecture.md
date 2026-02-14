# Solution Architecture

## Business Flow

1. Landing and value proposition
2. Yield and pricing calculation
3. Quote request intake
4. Offer generation and review
5. Contract signature
6. Onboarding and portal activation
7. Monthly revenue and contract status

## System Boundaries

- **Frontend Portal**: calculator, quote request, contract process transparency
- **Sales API**: quote lifecycle, validation, security headers, orchestration
- **External Pricing Service**: dedicated pricing component called via REST
- **Contracts Service**: draft persistence + role-based access (`customer`, `superuser`)
- **Future Integrations**: CRM, e-sign provider, settlement data source, identity provider

## Current Implementation Style

- Modular monolith with domain boundaries:
  - `domain/pricing`
  - `domain/quotes`
  - `http`
- In-memory quote persistence adapter for early delivery, replaceable with Postgres adapter
- Pricing delegated to external `pricing-service` over REST
- Strictly deterministic pricing calculation in the external component for auditability
- Contract parameters split into:
  - `contract-pricing.json` (pricing page)
  - `contract-offer.json` (offer page)

## Target Evolution

- Add persistent repositories (PostgreSQL)
- Add event outbox for async integration
- Add identity and RBAC middleware
- Add contract generation + signature integration

## C4 Summary

- **System Context**: Sales users and customers interact with portal/API; API integrates external e-sign and CRM.
- **Container**: Browser app, Backend API, Postgres, message broker, object store.
- **Component (Backend)**: pricing engine, quote service, repository adapters, HTTP router.
