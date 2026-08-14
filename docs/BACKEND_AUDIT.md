# Backend production-readiness audit

Audit branch: `codex/production-readiness-hardening`

## Verdict

The application code is suitable for a controlled production deployment after the provider-side checklist in `PRODUCTION_RUNBOOK.md` is completed. It is also ready for frontend development against the frozen contract. This is not a claim that external infrastructure is already provisioned or that the system has no possible vulnerabilities.

No known unresolved critical or high code vulnerability remains after the final high-effort review. Production traffic is still blocked until real TLS/DNS, MongoDB replica-set/managed service, Redis TLS, SMTP, Cloudinary, monitoring, secret injection, backups, and a restore drill are configured and the production preflight passes.

## Architecture and guarantees reviewed

- Express 5/Mongoose 9 ESM modules with routes, validation, controllers, services, and database models separated.
- Typed startup configuration fails closed for unsafe production transport, cookies, origins, proxy hops, secrets, Mongo TLS, Redis TLS/shared limiting, SMTP, Cloudinary, monitoring, and consent policy.
- Database-enforced appointment overlap ownership and atomic HMAC phone/date quota reservations.
- Timezone-aware availability with clinic/dentist schedules, exceptions, notice, horizon, duration, interval, and buffers.
- HS256 access tokens, database-reloaded RBAC/auth version, rotating hashed refresh sessions, replay-family response, session revocation, one-time setup/reset tokens, and exact six-character minimum passwords.
- Admin-only staff lifecycle with transactionally serialized last-admin protection.
- Explicit HY/RU/EN translations and versioned, dry-run-capable migrations.
- Magic-byte media validation, test-only adapter injection, compare-and-set replacement/removal, durable cleanup jobs, consent withdrawal, and governed purge.
- Redacted structured logging, pseudonymized audit transport metadata, safe error-monitor payloads, liveness/readiness separation, and bounded shutdown.
- Production index catalog verification, duplicate-data checks before controlled index creation, migration manifest verification, preflight, OpenAPI linting, CI, and operational runbooks.

## Findings fixed during this production phase

1. Single-language public content was a frontend contract blocker. Added explicit supported locales, publication validation, and a non-inventing legacy migration.
2. Phone/day quota used a count-before-insert pattern. Replaced it with atomic database reservations and reconciliation.
3. Staff credential/offboarding and password recovery were absent. Added invitation, password change/reset, activation, role, session revocation, and last-admin safety.
4. Refresh replay could leave a winning thief authenticated. Reuse now revokes all user sessions and advances authorization state.
5. Production proxy, HTTPS, exact-origin, cookies, shared rate limiting, config validation, logs, monitoring, readiness, and shutdown were incomplete. Added fail-closed infrastructure.
6. Media cleanup failures could create silent orphans. Added durable reference-checked cleanup and reconciliation.
7. Before/after consent lacked version, withdrawal, restore restrictions, and purge governance. Added all four with audit coverage.
8. Actual production indexes and migrations were not verified. Added read-only preflight and controlled, non-dropping index creation.
9. Concurrent media replacements used stale document saves. Added expected-image compare-and-set writes so one operation wins, losers clean their upload, deletion wins against stale replacement, and consent purge cannot be undone by an in-flight upload.
10. Account limiter keys did not trim before hashing, allowing whitespace bucket variants. Normalization now matches validated login/recovery identity.
11. Audit sanitization did not generically exclude compound email/phone/patient keys, and an audit-write failure logged a raw error message string. Both paths now use broader minimization and production-safe error handling.

## Rechecked high-risk outcomes

- Authentication/refresh: single-use atomic rotation, consumed-token lookup, user-wide revocation/auth-version increment, hashed tokens, and concurrent HTTP coverage.
- RBAC/IDOR: all staff, audit, cleanup, catalog/media/consent mutations are admin-only; appointments are admin/receptionist only; dentist role has no patient access; public case reads enforce published active consent.
- Booking: exact overlap, partial overlap, booking/reschedule, failed reschedule, cancellation, competing reschedules, state transitions, and phone quota races are database-arbitrated and regression-tested.
- Indexes: exact key order, uniqueness, required names, and TTL options are checked against the live catalog; duplicate unique data is checked before creation.
- Time: date validation and slot conversion use clinic-local IANA timezone; exact schedule/buffer/notice boundaries are covered.
- Media: tests fail closed without a fake Cloudinary adapter; two-upload rollback, DB-failure rollback, replacement/removal ordering, crash-recoverable holds, retries, reference guards, and consent races are covered.
- Privacy/logging: request bodies/queries are not logged; patient/contact/credential keys are redacted; monitoring receives only safe request correlation; production 5xx responses are generic.
- Test isolation/secrets: test Mongo URIs must be localhost and include `test`; Redis, SMTP, monitoring, and Cloudinary are mocked/disabled; `.env` is ignored and untracked; tracked secret scanning is part of CI.

## Remaining limitations and operator responsibilities

- External provider setup and restore proof cannot be completed in source control; see the runbooks.
- Refresh-session consumed-hash history grows with rotations until the rolling session expires. Rate limits bound abuse, but an absolute session lifetime/device-session UI would be a future defense-in-depth enhancement, not a current authorization bypass.
- Schedule changes do not yet preview already-booked appointments that would fall outside new hours. Existing appointments remain intact; operators must review affected bookings when changing schedules.
- Legal retention durations are intentionally unset until clinic/legal policy approves them.
- Docker/Kubernetes were not added because no target hosting platform is selected; the runtime contract is Node 22+ with provider-managed secrets and signals.

Exact final tests, stress repetitions, audit result, files, migrations, and commits are recorded in `CODEX_PRODUCTION_READINESS_REPORT.md`.
