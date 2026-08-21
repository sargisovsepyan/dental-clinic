# Backend architecture

## Runtime shape

```text
Browser/admin client
        |
HTTPS edge / one explicitly trusted proxy hop
        |
Express API (Node 22+)
   |        |          |
MongoDB   Redis     external adapters
replica   limiter   SMTP / Cloudinary / monitoring
set
```

Express routes declare authentication, role, validation, throttling, upload, and audit middleware. Controllers translate HTTP inputs/outputs. Services own business workflows. Mongoose schemas, unique indexes, conditional updates, and transactions own durable invariants. External mail, media, Redis, logging, and monitoring are behind small adapters.

## Important data invariants

- Appointment overlap: one document stores every occupied local minute in `lockKeys`; MongoDB uniquely indexes `{ dentist, lockKeys }`.
- Appointment mutation: status, cancellation, and reschedule match a monotonic `mutationVersion`; stale writers receive `409`. Reschedule history is bounded to 100 non-patient-data entries.
- Phone quota: one unique `{ phoneKey, date }` document atomically appends unique reservation IDs only while array size is below the limit.
- Public booking idempotency: a hashed UUIDv4 key maps to one immutable successful response snapshot in a separate TTL collection; mismatched reuse receives `409` and failures are not cached.
- Schedule/catalog booking serialization: category `serviceMutationVersion` and service, clinic, and dentist `bookingGuardVersion` values are conditionally advanced inside appointment transactions. Catalog disable/reassignment and schedule mutations therefore serialize with booking/reschedule admission. Schedule changes require the observed `scheduleRevision`, recompute affected appointments, and require an exact bounded conflict acknowledgement without exposing contact data.
- Staff safety: all admin-removal transactions write one invariant document before counting active administrators, serializing otherwise disjoint user updates.
- Sessions: the current refresh hash is unique and has idle plus absolute expiry. Rotation conditionally replaces it and writes the consumed hash to a separate TTL replay-history collection capped by the family absolute expiry. Reuse triggers transactional revocation and `authVersion` change; no per-session replay array grows indefinitely.
- One-time credentials: only token hashes are stored; expiry has TTL; consumption and password/security-state update occur in one transaction.
- Public content: active/public records require Armenian primary fields; supported translation keys are centrally restricted.
- Consent: public queries require published + active + unpurged consent. Withdrawal and restore use mutually exclusive conditional writes; purge is compare-and-set.
- Media: replacement/removal matches the expected current public ID. Cleanup jobs are unique by public ID and delete only after a cross-collection reference check.

## Failure model

Availability and prechecks improve errors but do not establish correctness. Unique indexes and conditional writes decide concurrent winners. Booking/quota and media workflows intentionally prefer temporary under-availability or visible cleanup debt over overbooking or deleting referenced media. Reconciliation commands repair safe residual debt.

Server startup validates environment before connections. Production does not build indexes or run migrations automatically. Explicit apply bootstraps and verifies only the unique indexes required for safe migration claims/upserts plus the replay-snapshot TTL required before migration 008 copies bounded patient-facing results. Migration 002 rejects ambiguous phone/day ownership and binds the configured quota-key identity before hashing. Migration records carry source checksums, release-artifact evidence, and an expiring owner lease so concurrent operators cannot apply the same step; dry-run remains read-only. Failed work is explicit and retryable. Historical checksum-less rows and unowned quota keys require recorded human attestation. Operators stop application writers, run backup, migration dry-run/apply, controlled non-dropping index creation, and the read-only preflight before traffic. Readiness checks Mongo and the configured shared limiter; liveness only proves the process can answer.

## Data scope

This is a clinic website, booking, catalog, and staff-administration backend—not a medical-record system. It stores minimum appointment contact/consent data and publication governance. It does not add diagnoses, medical histories, X-rays, prescriptions, treatment files, or arbitrary patient documents.
