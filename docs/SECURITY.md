# Security model and operations

## Trust boundaries

- The internet-facing proxy terminates TLS and is the only trusted forwarded-header hop unless `TRUST_PROXY_HOPS` explicitly says otherwise.
- MongoDB, Redis, SMTP, Cloudinary, and monitoring credentials are injected by the deployment secret manager; none belong in Git or an image.
- Browser credential origins are an exact HTTPS allowlist. Production cookie-authenticated login/refresh/logout rejects missing or untrusted `Origin`.
- Administrative authorization is decided from the current MongoDB user, not a stale JWT role claim.

## Attacker-oriented controls

- Unauthenticated attacker: validation, request limits, nested Mongo-operator rejection, generic production errors, enumeration-safe recovery, and public data minimization.
- Booking bot: global/IP and HMAC-phone limits, server-side challenge verification, database-hard phone/date quota, and required database-backed idempotency; slot and overlap uniqueness remains authoritative.
- Stolen refresh cookie: single-use rotation, separate TTL consumed-token detection bounded by the family absolute lifetime, user-wide refresh revocation, and immediate bearer invalidation.
- Compromised receptionist: appointment operations only; no staff, catalog, audit, cleanup, or consent-governance access.
- Compromised dentist account: authenticated profile only; no patient appointment or administrative access.
- Malicious/accidental admin: explicit validation and audit, last-admin protection, soft lifecycle, consent confirmation phrase, reference-guarded cleanup, and non-destructive index tooling.
- Upload attacker: small in-memory limits, allowed magic bytes, MIME/extension agreement, Cloudinary image-only mode, admin authorization, and upload throttling.
- Concurrency attacker: unique indexes, monotonic category/service/clinic/dentist admission guards, compare-and-set writes, serialized last-admin transactions, and repeatable parallel tests.
- Notification abuse/race attacker: no arbitrary-send endpoint; database-unique logical events; token-fenced worker leases; send-time appointment revision/status checks; bounded polling, concurrency, attempts, backoff, and retention; unsupported SMS fails closed.

## Credential rules

New passwords accept 6 characters and reject 5. They must fit within bcrypt's 72 UTF-8-byte boundary and are not trimmed. Existing hashes remain login-compatible. Bcrypt cost is 12. JWT validation is pinned to HS256. Access tokens are short lived and include `authVersion`; refresh and one-time tokens are random and hashed at rest.

## Logging and audit

Production logs are JSON with timestamp, level, request ID, method, path, status, and duration. They omit query strings and bodies. Credential, cookie, email, phone, patient, and secret-shaped metadata keys are redacted recursively. Error monitoring receives only a generic error identity and safe correlation fields.

Notification logs contain only job/appointment identifiers, fixed event/channel enums, attempt/state, and sanitized error category/code. They never contain recipient addresses, phone numbers, names, subjects/bodies, raw Nodemailer errors, SMTP dialogue, credentials, or provider responses. Email subjects are fixed and PII-free. The SMTP boundary permits one validated mailbox, rejects control characters/multiple recipients, disables file/URL access, and uses bounded TLS timeouts. HTML templates escape every dynamic value and contain no remote assets or trackers. Tests fail closed without an explicit fake adapter.

Reschedule/cancellation transactions cancel even processing stale jobs and clear their lease token; workers recheck authoritative state before calling SMTP. This prevents intentional stale delivery while acknowledging the irreducible narrow race after the final database check. A provider may accept a deterministic-Message-ID email before a worker crash prevents `sent` persistence, so retry can duplicate delivery; this is not described as exactly once.

Business audit records are admin-readable and store action, actor, entity reference, request correlation, and pseudonymized IP/user agent. Passwords, tokens, cookies, authorization, patient/contact fields, and internal notes are removed. Audit-write failure never fails the completed business action, but emits a safe technical error.

## Reporting a vulnerability

Do not put secrets, patient data, exploit tokens, or production URLs in a public issue. Privately provide the affected route/version, minimal reproduction, impact, and request ID. Rotate any exposed credential immediately and review audit/security logs. Preserve evidence according to clinic policy.
