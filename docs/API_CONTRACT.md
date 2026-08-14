# Backend API contract

This is the human-readable frontend contract for the implemented API. The validated, schema-level source of truth is [openapi.yaml](./openapi.yaml). Both describe `/api/v1`; an incompatible public change requires an explicit versioning decision rather than an undocumented edit.

## Common conventions

- Success responses use `{ "success": true, "data": ... }` and may include `message`.
- Errors use `{ "success": false, "message": string }`. Production never returns a stack or an unexpected internal 5xx message.
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

Localized fields are:

- service category: `name`, `description`
- service: `name`, `shortDescription`, `description`
- dentist: `title`, `bio`, `specializations`
- clinic: `clinicName`, `tagline`, `description`, `address`
- gallery: `altText`, `caption`
- before/after: `title`, `description`

Legacy single-language fields remain during the explicit migration/deprecation window. They are not an implicit fallback contract.

## Authentication and staff lifecycle

- `POST /auth/login` returns an HS256 bearer access token and sets the random refresh token in an HttpOnly cookie scoped to `/api/v1/auth`.
- `POST /auth/refresh` atomically consumes the current refresh token, rotates it once, and returns a new access token. Replay of a consumed token revokes all user sessions and increments `authVersion`, invalidating bearer tokens.
- `POST /auth/logout` revokes the presented refresh session and clears the cookie.
- `GET /auth/me` validates the JWT and reloads current user role, activation, setup state, and `authVersion` from MongoDB.
- `POST /auth/change-password` verifies the current password, changes it, revokes all sessions, increments `authVersion`, and requires a new login.
- `POST /auth/forgot-password` always returns the same public response for known and unknown email addresses.
- `POST /auth/reset-password` and `POST /auth/setup-password` atomically consume a hashed, expiring, single-use token.
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

Appointment states are `pending`, `confirmed`, `checked_in`, `in_progress`, `completed`, `cancelled`, and `no_show`. The normal path is `pending -> confirmed -> checked_in -> in_progress -> completed`; `pending` or `confirmed` may become `no_show`; cancellation uses its dedicated route; terminal states reject further transition/reschedule.

## Media and consent

Uploads are admin-only, memory-buffered, limited to 5 MiB per image, and require the submitted MIME and filename extension to match detected JPEG/PNG/WebP/HEIC/HEIF magic bytes. Tests cannot use the live Cloudinary adapter.

Replacement/removal uses an expected-current-image compare-and-set. The losing side of a race receives `409`; its upload is durable cleanup debt and is processed only when unreferenced. Old-image deletion starts only after the DB reference changes. Cleanup jobs are bounded, retryable, single-claim, reference-checked, and operator-visible.

Public before/after content requires active, server-versioned consent and published state. Withdrawal hides it immediately and blocks ordinary restore. Permanent purge is admin-only, requires exact confirmation and prior withdrawal, tombstones the record, clears the opaque external consent reference, and queues both assets for durable deletion.

## Frontend freeze

The public schema, locale policy, authentication/cookie behavior, booking inputs, availability slots, appointment statuses, and media/consent flows are frozen sufficiently for frontend implementation. New optional fields or endpoints may be added compatibly. No known breaking public schema decision is deferred. Deployment origins/cookie domain are environment choices, not API-shape changes.
