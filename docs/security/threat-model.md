# Threat Model (Initial)

## Key Assets

- pricing model configuration
- quote/customer data
- contract artifacts and signatures

## Main Threats

- spoofed quote submissions
- parameter tampering in pricing requests
- PII leakage through logs or error payloads
- unauthorized access to quote/contract records

## Mitigations

- server-side validation and deterministic pricing logic
- no trust in client-calculated values
- structured error handling without stack trace exposure
- role-based authn/authz with server-side session checks
- account password hashing (`scrypt`) and legacy-password migration
- auth endpoint rate limiting and explicit logout

## Residual Risks in Current Baseline

- no CAPTCHA/challenge at signup, only API-side throttling
- no centralized distributed rate limiting (single-instance in-memory limiter)
- lockfile + automated dependency scanning still missing from CI execution
