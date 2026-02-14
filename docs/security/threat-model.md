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
- planned authn/authz and audit logging

## Residual Risks in Current Baseline

- no persistence encryption because storage is in-memory only
- auth is not yet integrated
- no anti-automation controls yet (CAPTCHA/rate limits)
