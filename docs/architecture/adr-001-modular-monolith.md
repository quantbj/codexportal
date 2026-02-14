# ADR-001: Start with a Modular Monolith

## Status
Accepted

## Context
The portal requires rapid delivery of pricing and quote workflows with high testability and clear boundaries.

## Decision
Adopt a modular monolith where business domains are isolated in explicit modules and exposed via a thin HTTP layer.

## Consequences

- Pros:
  - faster implementation and simpler operations initially
  - easy to enforce test coverage and consistency
  - supports incremental extraction into services later
- Cons:
  - requires strict discipline to avoid cross-module coupling
  - scaling by domain requires future refactoring

## Migration Path
When integration load grows, extract pricing or contracting as independent services behind API/event contracts.
