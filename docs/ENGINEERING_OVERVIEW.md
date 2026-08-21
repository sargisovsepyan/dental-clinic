# Engineering overview

This backend is professionally engineered through concrete, testable controls rather than claims of perfect security.

- Modular Express/Mongoose architecture with centralized configuration and infrastructure adapters.
- MongoDB-enforced per-dentist minute ownership prevents exact and overlapping double-booking across processes.
- Atomic HMAC phone/date quota reservations withstand parallel distinct-slot booking attempts.
- Timezone-aware availability intersects clinic/dentist schedules, exceptions, notice, duration, interval, horizon, and buffers.
- Monotonic appointment revisions protect status, cancellation, and reschedule changes; failed reschedules preserve the original lock/quota and bounded history records successful moves without patient data.
- Database-backed booking idempotency replays one immutable success snapshot without duplicating quota, booking, or creation-audit side effects.
- Category/service/clinic/dentist admission guards serialize catalog lifecycle and acknowledged schedule changes against bookings; schedule revisions expose bounded privacy-safe conflicts.
- HS256 bearer authentication is backed by current database role, activation, setup state, and authorization version.
- Random hashed refresh tokens rotate once within idle and absolute session limits; a separate bounded TTL replay ledger detects consumed-token reuse, revokes sessions, and invalidates bearer authorization.
- Staff invitation, password recovery/change, deactivation/reactivation, role changes, session revocation, and concurrency-safe last-admin protection are implemented.
- Public editorial content has a frozen explicit HY/RU/EN model and safe versioned migrations.
- Uploads use binary signature/MIME/extension validation and a fail-closed fake adapter in tests.
- Media replacement/removal and before/after purge use compare-and-set writes, durable rollback holds, reference guards, retry/backoff, reconciliation, and operator-visible debt.
- Consent is server-versioned; withdrawal immediately hides publication; restore cannot bypass it; purge leaves a minimal tombstone.
- Business audit logs are distinct from structured technical logs and both minimize credentials/patient data.
- Production configuration, proxy/HTTPS/CORS/cookies, shared Redis limiting, logging, monitoring, readiness, and graceful shutdown fail safely.
- Checksummed, release-attributed, leased, retryable migrations and actual Mongo index key/unique/TTL options are verified by production tooling; apply requires a declared stopped-write window, quota-key ownership and legacy ledger provenance fail closed or require explicit attestation, replay TTL exists before patient snapshots are copied, and non-dropping index creation remains explicit.
- CI runs lockfile installation, syntax/secret/OpenAPI checks, isolated integration/concurrency tests, runtime/all dependency audits, whitespace checks, and CodeQL.
- Backup/restore, deployment, retention/privacy, security, architecture, and production-preflight responsibilities are documented without pretending external services are provisioned.
