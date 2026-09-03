# Backend architecture

## Runtime shape

```text
Browser/admin client
        |
HTTPS edge / one explicitly trusted proxy hop
        |
Express API (Node 22+)        notification worker (Node 22+)
   |        |          |                |             |
MongoDB   Redis     external adapters --+---------- SMTP
replica   limiter   Cloudinary / monitoring
set
```

Express routes declare authentication, role, validation, throttling, upload, and audit middleware. Controllers translate HTTP inputs/outputs. Services own business workflows. Mongoose schemas, unique indexes, conditional updates, and transactions own durable invariants. External mail, media, Redis, logging, and monitoring are behind small adapters.

## Important data invariants

- Appointment overlap: one document stores every occupied local minute in `lockKeys`; MongoDB uniquely indexes `{ dentist, lockKeys }`.
- Appointment mutation: status, cancellation, reschedule preview, and reschedule match the operator's required `expectedMutationVersion` against a monotonic `mutationVersion`; stale views and concurrent writers receive `409`. Reschedule history is bounded to 100 non-patient-data entries.
- Phone quota: one unique `{ phoneKey, date }` document atomically appends unique reservation IDs only while array size is below the limit.
- Public booking idempotency: a hashed UUIDv4 key maps to one immutable successful response snapshot in a separate TTL collection; mismatched reuse receives `409` and failures are not cached.
- Notification outbox: appointment transactions upsert a unique logical event alongside the appointment/locks/quota/idempotency change. Jobs contain no recipient copy or rendered body. Patient addresses are resolved from the appointment, and the operational clinic address comes only from validated deployment configuration.
- Notification occurrence identity: appointment `scheduleRevision` changes only on a material reschedule and binds lifecycle/reminder jobs independently from general `mutationVersion`. Job snapshots retain only notification-safe immutable occurrence facts.
- Notification delivery: standalone workers claim one due/retry or expired-lease job atomically with a fresh token. Heartbeats and every result write are fenced by job ID, owner, token, state, and unexpired lease. Retries are durable, exponential, jittered, and bounded; terminal jobs receive TTL retention.
- Schedule/catalog booking serialization: category `serviceMutationVersion` and service, clinic, and dentist `bookingGuardVersion` values are conditionally advanced inside appointment transactions. Catalog disable/reassignment and schedule mutations therefore serialize with booking/reschedule admission. Schedule changes require the observed `scheduleRevision`, recompute affected appointments, and require an exact bounded conflict acknowledgement without exposing contact data.
- Staff safety: all admin-removal transactions write one invariant document before counting active administrators, serializing otherwise disjoint user updates.
- Sessions: the current refresh hash is unique and has idle plus absolute expiry. Rotation conditionally replaces it and writes the consumed hash to a separate TTL replay-history collection capped by the family absolute expiry. Reuse triggers transactional revocation and `authVersion` change; no per-session replay array grows indefinitely.
- One-time credentials: only token hashes are stored; expiry has TTL; consumption and password/security-state update occur in one transaction.
- Public content: active/public records require Armenian primary fields; supported translation keys are centrally restricted.
- Consent: public queries require published + active + unpurged consent. Withdrawal and restore use mutually exclusive conditional writes; purge is compare-and-set.
- Media: replacement/removal matches the expected current public ID. Cleanup jobs are unique by public ID and delete only after a cross-collection reference check.

## Failure model

Availability and prechecks improve errors but do not establish correctness. Unique indexes and conditional writes decide concurrent winners. Booking/quota and media workflows intentionally prefer temporary under-availability or visible cleanup debt over overbooking or deleting referenced media. Reconciliation commands repair safe residual debt. Notification provider availability is outside appointment admission: the database commit schedules exactly one logical event, while SMTP delivery remains honestly at-least-once across the provider/DB crash window.

Server startup validates environment before connections. Importing the API or worker service starts no background network activity. The API and standalone `npm run worker:notifications` process connect explicitly and shut down independently. Production does not build indexes or run migrations automatically. Explicit apply bootstraps and verifies only the unique indexes required for safe migration claims/upserts plus the replay-snapshot TTL required before migration 008 copies bounded patient-facing results. Migration 011 additionally requires the notification logical-event uniqueness before idempotently seeding eligible legacy future reminders. Migration records carry source checksums, release-artifact evidence, and an expiring owner lease so concurrent operators cannot apply the same step; dry-run remains read-only. Failed work is explicit and retryable. Historical checksum-less rows and unowned quota keys require recorded human attestation. Operators stop API and worker writers, run backup, migration dry-run/apply, controlled non-dropping index creation, and the read-only preflight before traffic. Readiness checks Mongo and the configured shared limiter; liveness only proves the API process can answer. Worker health is observed through safe structured claim/sent/retry/failure events and queue preflight/monitoring.

## Data scope

This is a clinic website, booking, catalog, and staff-administration backend—not a medical-record system. It stores minimum appointment contact/consent data and publication governance. It does not add diagnoses, medical histories, X-rays, prescriptions, treatment files, or arbitrary patient documents.
