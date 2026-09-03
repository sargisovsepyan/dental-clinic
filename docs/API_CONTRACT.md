# Backend API contract

This is the human-readable frontend contract for the implemented API. The validated, schema-level source of truth is [openapi.yaml](./openapi.yaml). Both describe `/api/v1`; an incompatible public change requires an explicit versioning decision rather than an undocumented edit.

## Common conventions

- Success responses use `{ "success": true, "data": ... }` and may include `message`.
- Errors use `{ "success": false, "message": string }` and may include a stable `code` and bounded `details` for an actionable 4xx conflict. Production never returns a stack or an unexpected internal 5xx message.
- Dates are `YYYY-MM-DD` in the configured clinic IANA timezone; local clock values are `HH:mm`; absolute timestamps are ISO UTC.
- Invalid input is `400`, missing/invalid authentication `401`, insufficient role `403`, missing resource `404`, state/uniqueness conflict `409`, oversized body `413`, unsupported media `415`, limit exhaustion `429`, and unavailable required service `503`.
- Body/query/parameter validation strips unknown properties. Object IDs are 24 hexadecimal characters.
- Public collection responses never expose appointment contact data, internal notes, staff security state, consent evidence, or cleanup internals.

## Localized public content

Editorial entities return an explicit `translations` object whose only permitted locale keys are `hy`, `ru`, and `en`:

```json
{
  "translations": {
    "hy": { "name": "...", "description": "..." },
    "ru": { "name": "...", "description": "..." },
    "en": { "name": "...", "description": "..." }
  }
}
```

Armenian is the required primary locale for active/public content. Russian and English are optional. The API does not silently substitute values: the frontend selects the requested locale and may explicitly fall back to `hy`. Partial locale updates merge into the existing object and do not remove other locales. Slugs, IDs, prices, currency, duration, booking state, dates, schedules, patient data, and consent state remain language-neutral.

Appointment notification language is an explicit, separate contract. Public and administrative booking accept optional `locale: hy | ru | en` (default `hy`) and persist it for later reminders. Legacy appointments with no recorded notification locale remain `null`; notification delivery uses a documented Armenian fallback for those rows only and does not claim that Armenian was the patient's historical preference.

Localized fields are:

- service category: `name`, `description`
- service: `name`, `shortDescription`, `description`
- dentist: `title`, `bio`, `specializations`
- clinic: `clinicName`, `tagline`, `description`, `address`
- gallery: `altText`, `caption`
- before/after: `title`, `description`

Legacy single-language fields remain during the explicit migration/deprecation window. They are not an implicit fallback contract.

Public detail routes interpret the final category, service, or dentist path segment as a canonical lowercase slug matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Administrative PATCH and DELETE operations at the same URL shape interpret that segment as a 24-hex MongoDB ObjectId. The OpenAPI operations use distinct parameter schemas even though the URI templates are identical.

## Authentication and staff lifecycle

- `POST /auth/login` returns an HS256 bearer access token and sets the random refresh token in an HttpOnly cookie scoped to `/api/v1/auth`.
- `POST /auth/refresh` atomically consumes the current refresh token, rotates it once, and returns a new access token. Replay of a consumed token revokes all user sessions and increments `authVersion`, invalidating bearer tokens.
- `POST /auth/logout` revokes the presented refresh session and clears the cookie.
- `GET /auth/me` validates the JWT and reloads current user role, activation, setup state, and `authVersion` from MongoDB.
- `POST /auth/change-password` verifies the current password, changes it, revokes all sessions, increments `authVersion`, and requires a new login.
- `POST /auth/forgot-password` always returns the same public response for known and unknown email addresses.
- `POST /auth/reset-password` and `POST /auth/setup-password` atomically consume a hashed, expiring, single-use token.
- Authentication, staff-administration, appointment, and availability responses send `Cache-Control: no-store`; authenticated browser clients must also avoid shared framework caches.
- The minimum new password length is exactly 6 Unicode characters. Five is rejected. New passwords over 72 UTF-8 bytes are rejected to avoid bcrypt truncation; login remains compatible with existing longer hashes. Passwords are never trimmed.
- Production login/refresh/recovery/setup endpoints use shared Redis-backed limits. Cookie-authenticated login, refresh, and logout require an exact trusted `Origin` in production.

Staff roles are `admin`, `receptionist`, and `dentist`. `/staff`, catalog mutations, media mutations, consent governance, audit logs, and cleanup operations are admin-only. Appointments are accessible to administrators and receptionists. Dentist-role users have no patient appointment or administrative access. Staff are invited, deactivated/reactivated, role-managed, or session-revoked; they are not hard-deleted. The last-active-admin rule is transactionally serialized.

## Route groups

The full request/response/status definitions are in OpenAPI. Implemented route groups are:

| Area | Public routes | Protected routes |
|---|---|---|
| System | `/health`, `/health/live`, `/health/ready` | none |
| Auth | login, refresh, logout, forgot/reset/setup password | me, change password |
| Staff | none | list/detail, invite, role, deactivate/reactivate, revoke sessions (admin) |
| Categories | active list and slug detail | create/update/disable/restore/all (admin) |
| Services | active list and slug detail | create/update/disable/restore/all (admin) |
| Dentists | active list and slug detail | create/update/disable/restore/all and schedule exceptions (admin) |
| Clinic | public settings | settings and closures (admin) |
| Availability | query by dentist, service, and date | none |
| Appointments | create booking | create/list/detail/reschedule/status/cancel (admin or receptionist) |
| Gallery/media | active gallery | uploads, replacements/removal, gallery administration, cleanup jobs (admin) |
| Before/after | published list/detail | create/update/images/disable/restore/withdraw/purge/all (admin) |
| Audit | none | filtered paginated audit logs (admin) |

## Booking guarantees

Availability is advisory; MongoDB is authoritative. Each appointment owns every local minute from start through treatment duration and trailing buffer in `lockKeys`. The unique multikey index `{ dentist: 1, lockKeys: 1 }` prevents exact and partial overlap across processes. Reschedule changes locks with compare-and-set behavior; a failed reschedule retains the original lock. Cancellation atomically replaces booking locks with a record-specific released sentinel.

The normalized-phone/local-date quota is a separate atomic reservation document keyed by an HMAC of the phone number and date. Concurrent bookings cannot exceed the configured limit. Cancellation releases quota. Cross-date reschedule reserves the target quota before the appointment compare-and-set and releases the source only after success. Failure can temporarily under-allow if cleanup fails, never over-allow; `npm run reconcile:appointment-quota` repairs stale/missing reservations.

Appointment states are `pending`, `confirmed`, `checked_in`, `in_progress`, `completed`, `cancelled`, and `no_show`. The normal path is `pending -> confirmed -> checked_in -> in_progress -> completed`; `pending` or `confirmed` may become `no_show`; cancellation uses its dedicated route. Reschedule is intentionally limited to `pending` or `confirmed`; once care has begun (`checked_in` or `in_progress`) the occurrence cannot be rewritten.

`GET /appointments` is restricted to administrators and receptionists. It supports `date`, `from`, `to`, `dentistId`, `serviceId`, `status`, normalized `phone`, `page` (default 1), and `limit` (default 25, maximum 100). If `from` or `to` is supplied, that range takes precedence over `date`.

Staff status changes, reschedules, and cancellations require `expectedMutationVersion`, copied from the appointment the operator actually reviewed. The server compares it before the workflow and again in the database mutation. A stale value returns `409` with code `APPOINTMENT_VERSION_CONFLICT` and `details.currentMutationVersion`; the write is never retried automatically. Clients must refetch the authoritative appointment and ask the operator to review it again.

`GET /appointments/{id}/availability` is the authenticated admin/receptionist reschedule-availability route. It requires `expectedMutationVersion`, `dentistId`, `serviceId`, and `date`. It excludes only that appointment's current locks, so its result matches reschedule admission without exposing a public arbitrary lock-exclusion parameter. A stale appointment version fails with the same `409` contract.

### Public booking admission and idempotency

`POST /appointments` requires a fresh UUIDv4 `Idempotency-Key` header. Production also requires a `challengeToken`; non-production may omit it only when challenge verification is explicitly disabled. Provider/network failure is `503`, while a rejected or missing required challenge is `400`. Challenge verification happens before idempotent lookup, so replay does not bypass bot defense.

Only a successful booking creates a database-backed idempotency record. Concurrent requests with the same key and semantic body produce one appointment and the same immutable public result. A successful replay still returns `201`; it is audited as `appointment.booking.replay`, not as another creation. The same key with a different body returns `409`, and replay consumes no additional phone quota. Records expire after `BOOKING_IDEMPOTENCY_TTL_HOURS` (1-168 hours, default 24). After expiry, reusing the key may create a new appointment even though the old appointment remains, so clients must use one fresh UUID per intended booking and retain it only for retries of that booking.

All `/api` routes, including public catalog and availability reads, are subject to the global API limiter and may return `429`. Booking submission additionally has its narrower booking-attempt limiter and the atomic phone/date quota. Browser clients must not auto-retry `429`; they may use a valid `Retry-After` value when one is present. CORS exposes only the response metadata needed by browser clients: `Retry-After`, `RateLimit`, and `X-Request-Id`.

New idempotency fingerprints are version `v2` and include the notification locale. Migration 011 marks still-active pre-deployment fingerprints as `v1`; those records continue comparing the historical locale-free body so a retry across deployment does not become a false `409`. Such a replay always returns the original committed result and cannot change its notification locale.

The public result contains only `id`, `confirmationCode`, `patientName`, date/times/status, dentist/service summaries, and the price snapshot. It never returns phone, email, comments, internal notes, privacy evidence, reschedule history, lock keys, quota identifiers, or idempotency hashes.

### Appointment privacy boundary

Public booking submits only `privacyAccepted: true`; the server records `privacyConsentAt`, method `website`, and the configured `APPOINTMENT_PRIVACY_POLICY_VERSION`. Administrative creation also requires `privacyAccepted: true` plus `consentMethod` of `phone` or `in_person`. Clients cannot choose the evidence timestamp or policy version. Explicitly migrated legacy rows use `legacy-unverified`, never the current version.

Appointment list/detail/mutation responses are available only to administrators and receptionists and may include patient contact data, comments, internal notes, reschedule history, cancellation fields, and the server-recorded privacy evidence. These fields are excluded from every public collection and from the public booking result.

### Booking-setting semantics

Every active `bookingSettings` field has the following current meaning:

- `isBookingEnabled`: when false, public availability and appointment admission fail with `503`.
- `slotIntervalMinutes`: aligns candidate start times to a 10/15/20/30/60-minute grid.
- `minBookingNoticeMinutes`: removes starts earlier than the configured interval from the current instant in the clinic timezone.
- `maxBookingDaysAhead`: rejects dates beyond the configured future-day boundary.
- `bufferMinutes`: extends both schedule fitting and the database-enforced minute locks after treatment time.
- `allowSameDayBooking`: when false, same-day availability is empty.
- `requireEmail`: appointment admission rejects an absent/empty email.
- `autoConfirmAppointments`: creates accepted appointments as `confirmed`; otherwise they start `pending`.
- `maxAppointmentsPerPhonePerDay`: is the atomic normalized-phone/local-date quota.

Booking-setting updates are serialized with booking/reschedule admission through database booking guards, so a request cannot commit using a mixture of old and new settings.

The legacy `cancellationNoticeHours` setting has been removed from the active model and request schema and is explicitly unset by migration. There is no public patient self-cancellation endpoint. Authorized staff cancellation is governed by role and appointment state, not by an implied patient notice window.

## Appointment notifications

Appointment mutation transactions write notification jobs to a MongoDB outbox; they never call SMTP. A booking/status/reschedule/cancellation response therefore reflects only the authoritative appointment commit. SMTP unavailability cannot reject or roll back a valid booking. No public or administrative arbitrary-send/job endpoint exists.

Deterministic behavior is:

- A pending online booking with an email schedules `appointment_received`, using request-received wording that does not claim confirmation.
- An auto-confirmed online booking schedules only `appointment_confirmed`, not both received and confirmed.
- A successful later `pending -> confirmed` transition supersedes any unsent received/reschedule lifecycle mail and schedules one confirmation.
- A successful material reschedule increments appointment `scheduleRevision`, supersedes older unsent patient lifecycle/reminder jobs, stores minimal immutable before/after occurrence snapshots, and schedules one reschedule message plus the new reminder when eligible. Rescheduling to the exact current occurrence is a `200` no-op with no revision/history/job churn.
- A successful cancellation supersedes actionable patient lifecycle/reminder jobs and schedules one cancellation. CAS losers and rolled-back mutations create no notification effect.
- Checked-in, in-progress, completed, and no-show transitions invalidate actionable reminder/lifecycle jobs.
- A clinic/reception job is created only for a committed `source=website` booking. Its recipient is the deployment-only `CLINIC_NOTIFICATION_EMAIL`, never mutable public `Clinic.email`. The fixed subject contains no patient data; the body contains only the confirmation code, name/phone needed for reception follow-up, occurrence, service, and dentist. Staff-created phone/admin bookings do not notify reception or send a creation lifecycle email.
- Patient jobs are scheduled only when the appointment has a valid email. Email remains optional unless `requireEmail=true`. Staff-created appointments with an email may receive a reminder and later confirmed/rescheduled/cancelled lifecycle mail.

The reminder due instant is the authoritative `startAt` minus exactly 24 elapsed hours. Clinic timezone is used only to format the message. A create/reschedule strictly inside that window schedules no late “24-hour” reminder; an exact boundary is eligible. At send time the worker requires a confirmed, future appointment with the exact bound `scheduleRevision` and `startAt`. Pending, cancelled, checked-in, in-progress, completed, no-show, missing, or superseded occurrences are terminally skipped.

MongoDB uniqueness provides exactly-once logical scheduling. Workers use atomic token-fenced leases, bounded retries, expired-lease reclamation, and terminal retention. SMTP delivery is at-least-once: a process can fail after the provider accepts a message but before MongoDB records `sent`. A deterministic opaque `Message-ID` reduces duplicate risk but cannot make the external boundary mathematically exactly once. Cancellation/reschedule fence processing jobs and the worker rechecks immediately before delivery, but a narrow final-check-to-provider race remains.

HY/RU/EN templates are centralized and authored explicitly. Subjects are fixed and PII-free; dynamic values are single-line normalized and HTML-escaped. Messages contain no patient/staff comments, internal notes, mutation reasons, consent evidence, arbitrary URLs, remote trackers, or provider secrets. The channel domain already admits `email` and `sms`; no SMS provider/configuration/jobs exist in this release.

### Schedule revision and conflict acknowledgement

Clinic and dentist documents expose a non-negative `scheduleRevision`. Availability responses that evaluate effective working hours include `schedule.clinicRevision` and `schedule.dentistRevision`; clients should refresh availability after either revision changes.

Changing clinic or dentist weekly hours requires `expectedScheduleRevision` in the PATCH body. Setting a clinic closure/altered day or dentist exception requires it in the PUT body. Deleting either exception requires it as a query parameter. If the revision is stale, the API returns `409` with code `SCHEDULE_REVISION_CONFLICT` and, when available, `details.currentScheduleRevision`.

Before applying a proposed schedule, the server recomputes affected future non-cancelled appointments inside the mutation transaction. It never silently cancels them. If conflicts exist, the first attempt returns `409` with code `SCHEDULE_CONFLICT_ACKNOWLEDGEMENT_REQUIRED` and bounded details: `currentScheduleRevision`, total `conflictCount`, at most 25 privacy-minimized conflicts (`appointmentId`, date/times, `dentistId`, status), `conflictsTruncated`, and an exact `acknowledgementToken`. The administrator may repeat the identical proposal at the same expected revision with that token in `scheduleConflictAcknowledgement`. The token is bound to the scope, revision, proposal, and affected appointment IDs; any change requires a new review. More than 10,000 appointments to inspect fails conservatively with `SCHEDULE_CONFLICT_SCAN_LIMIT`.

Booking and reschedule transactions conditionally write category, service, clinic, and dentist booking guards. A race with catalog disable/reassignment or a schedule mutation therefore retries against current availability or returns a conflict; it cannot commit against booking inputs that changed unnoticed.

## Media and consent

Uploads are admin-only, memory-buffered, limited to 5 MiB per image, and require the submitted MIME and filename extension to match detected JPEG/PNG/WebP/HEIC/HEIF magic bytes. Tests cannot use the live Cloudinary adapter.

Replacement/removal uses an expected-current-image compare-and-set. The losing side of a race receives `409`; its upload is durable cleanup debt and is processed only when unreferenced. Old-image deletion starts only after the DB reference changes. Cleanup jobs are bounded, retryable, single-claim, reference-checked, and operator-visible.

Public before/after content requires active, server-versioned consent and published state. Withdrawal hides it immediately and blocks ordinary restore. Permanent purge is admin-only, requires exact confirmation and prior withdrawal, tombstones the record, clears the opaque external consent reference, and queues both assets for durable deletion.

Public before/after list and detail responses expose the published case content and public relations only. They omit consent status, policy version, confirmation time and method, consent history/reference, publication workflow state, withdrawal metadata, purge metadata, staff actors, and cleanup internals.

## Frontend freeze

The public schema, locale policy, authentication/cookie behavior, booking inputs, availability slots, appointment statuses, and media/consent flows are frozen sufficiently for frontend implementation. New optional fields or endpoints may be added compatibly. No known breaking public schema decision is deferred. Deployment origins/cookie domain are environment choices, not API-shape changes.
