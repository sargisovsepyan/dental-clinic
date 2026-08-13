# Backend API contract

This document describes the routes currently implemented in code. The base URL is `/api/v1`.

## Conventions

- JSON success responses use `{ "success": true, "data": ... }` and may include `message`.
- Errors use `{ "success": false, "message": string }`. Non-production responses may also contain `stack`; production responses never expose a stack, and unexpected 5xx messages are replaced with `Internal server error`.
- Staff endpoints require `Authorization: Bearer <access-token>`. Roles are `admin`, `receptionist`, and `dentist`; each table states the roles actually authorized.
- Login and refresh set an HttpOnly `refresh_token` cookie scoped to `/api/v1/auth`. It is `Secure` in production and always `SameSite=Strict`.
- Dates are `YYYY-MM-DD` in the clinic timezone. Clock times are `HH:mm`. Stored/returned absolute timestamps are ISO UTC dates.
- Object IDs are 24-character hexadecimal MongoDB IDs. Invalid validated IDs return `400`.
- Joi validation strips unknown body, query, and parameter fields. It does not reject them.
- All `/api/*` traffic is globally rate limited. Login, refresh, public booking, and media upload routes have additional limits.
- Typical errors are `400` validation, `401` unauthenticated/invalid session, `403` wrong role, `404` missing resource, `409` state/uniqueness/booking conflict, and `429` rate limit. Media routes can also return `413`, `415`, or `503`.

## Shared input shapes

`shift` is `{ start: "HH:mm", end: "HH:mm" }`. A clinic weekly day is `{ dayOfWeek: 1..7, isOpen: boolean, shifts: shift[] }`; a dentist weekly day uses `isWorking` instead. Duplicate weekdays, invalid ordering, and overlapping shifts are rejected.

`categoryCreate`:

```json
{ "name": "string, required", "slug": "optional", "description": "", "imageUrl": "", "sortOrder": 0 }
```

`serviceCreate` fields are `name` and `category` (required), plus `slug`, `shortDescription`, `description`, `priceType` (`fixed|from|range|on_request`), `priceFrom`, `priceTo`, `currency` (`AMD`), `durationMinutes` (15-480), `imageUrl`, `isFeatured`, `bookingEnabled`, `isActive`, and `sortOrder`. Price combinations are validated against `priceType`.

`dentistCreate` requires `firstName` and `lastName`; optional fields are `slug`, `title`, `specializations[]`, `bio`, `experienceYears`, `photoUrl`, `languages[]`, `services[]`, `weeklySchedule[]`, `isFeatured`, `bookingEnabled`, and `sortOrder`.

`patientBooking`:

```json
{
  "patientName": "required",
  "patientPhone": "required",
  "patientEmail": "optional unless clinic setting requireEmail=true",
  "dentistId": "required ObjectId",
  "serviceId": "required ObjectId",
  "date": "YYYY-MM-DD",
  "startTime": "HH:mm",
  "patientComment": "optional, max 1000",
  "privacyAccepted": true
}
```

## System and authentication

| Method and path | Authentication / roles | Body, query, or params | Success result | Important statuses |
|---|---|---|---|---|
| `GET /health` | Public | None | `200`; top-level `message`, `environment`, `timestamp`. This is liveness, not Mongo readiness. | `200` |
| `POST /auth/login` | Public; login limiter | Body `{ email, password }` (password accepted at 6-128 for compatibility with existing accounts) | `200`; `{ data: { accessToken, user: { id, name, email, role } } }`; rotates/sets refresh cookie. | `200`, `400`, `401`, `429` |
| `POST /auth/refresh` | Refresh cookie; refresh limiter | No body; current `refresh_token` cookie required | `200`; new `{ accessToken, user }` and atomically rotated refresh cookie. | `200`, `401`, `429` |
| `POST /auth/logout` | Refresh cookie optional | No body | `200`; current session is revoked when present and cookie is cleared. | `200` |
| `GET /auth/me` | Bearer; any active staff role | None | `200`; `{ data: { user: { id, name, email, role } } }` | `200`, `401` |

There are no staff creation, password-change, password-reset, session-listing, or logout-all endpoints.

## Service categories

| Method and path | Authentication / roles | Body, query, or params | Success result | Important statuses |
|---|---|---|---|---|
| `GET /service-categories` | Public | None | `200`; `{ data: { categories } }`, active only | `200` |
| `GET /service-categories/admin/all` | Bearer; admin | None | `200`; `{ data: { categories } }`, including inactive | `200`, `401`, `403` |
| `POST /service-categories` | Bearer; admin | Body `categoryCreate` | `201`; `{ data: { category } }` | `201`, `400`, `401`, `403`, `409` |
| `PATCH /service-categories/:id/restore` | Bearer; admin | Param `id` | `200`; `{ data: { category } }` | `200`, `400`, `401`, `403`, `404` |
| `PATCH /service-categories/:id` | Bearer; admin | Param `id`; non-empty partial `categoryCreate`, plus `isActive` | `200`; `{ data: { category } }` | `200`, `400`, `401`, `403`, `404`, `409` |
| `DELETE /service-categories/:id` | Bearer; admin | Param `id` | `200`; soft-disables category | `200`, `400`, `401`, `403`, `404`, `409` when active services still reference it |
| `GET /service-categories/:slug` | Public | Param `slug` | `200`; `{ data: { category } }`, active only | `200`, `404` |

## Services

| Method and path | Authentication / roles | Body, query, or params | Success result | Important statuses |
|---|---|---|---|---|
| `GET /services` | Public | Query `category` (category slug), `featured`, `bookingEnabled` | `200`; `{ data: { services } }`, active services in active categories | `200`, `400` |
| `GET /services/admin/all` | Bearer; admin | None | `200`; `{ data: { services } }`, including inactive | `200`, `401`, `403` |
| `POST /services` | Bearer; admin | Body `serviceCreate` | `201`; `{ data: { service } }` | `201`, `400`, `401`, `403`, `404` category, `409` slug |
| `PATCH /services/:id/restore` | Bearer; admin | Param `id` | `200`; `{ data: { service } }`; category must be active | `200`, `400`, `401`, `403`, `404`, `409` |
| `PATCH /services/:id` | Bearer; admin | Param `id`; non-empty partial `serviceCreate` | `200`; `{ data: { service } }` | `200`, `400`, `401`, `403`, `404`, `409` |
| `DELETE /services/:id` | Bearer; admin | Param `id` | `200`; soft-disables service | `200`, `400`, `401`, `403`, `404` |
| `GET /services/:slug` | Public | Param `slug` | `200`; `{ data: { service } }`, active service in active category | `200`, `404` |

## Dentists and dentist exceptions

| Method and path | Authentication / roles | Body, query, or params | Success result | Important statuses |
|---|---|---|---|---|
| `GET /dentists` | Public | Query `service` (ObjectId), `featured`, `bookingEnabled` | `200`; `{ data: { dentists } }`, active only; populated services are active only | `200`, `400` |
| `GET /dentists/admin/all` | Bearer; admin | None | `200`; `{ data: { dentists } }`, including inactive | `200`, `401`, `403` |
| `POST /dentists` | Bearer; admin | Body `dentistCreate` | `201`; `{ data: { dentist } }` | `201`, `400`, `401`, `403`, `404` service, `409` slug |
| `PATCH /dentists/:id/restore` | Bearer; admin | Param `id` | `200`; `{ data: { dentist } }` | `200`, `400`, `401`, `403`, `404` |
| `PATCH /dentists/:id` | Bearer; admin | Param `id`; non-empty partial `dentistCreate`, plus `isActive` | `200`; `{ data: { dentist } }` | `200`, `400`, `401`, `403`, `404`, `409` |
| `DELETE /dentists/:id` | Bearer; admin | Param `id` | `200`; sets `isActive=false` and `bookingEnabled=false` | `200`, `400`, `401`, `403`, `404` |
| `GET /dentists/:slug` | Public | Param `slug` | `200`; `{ data: { dentist } }`, active only and with active populated services only | `200`, `404` |
| `GET /dentists/:id/schedule-exceptions` | Bearer; admin | Param `id`; optional query `from`, `to` dates | `200`; `{ data: { exceptions } }` | `200`, `400`, `401`, `403`, `404` |
| `PUT /dentists/:id/schedule-exceptions/:date` | Bearer; admin | Params `id`, `date`; body `{ isWorking, shifts?: shift[], note?: string }` | `200`; `{ data: { exception } }`, upserted | `200`, `400`, `401`, `403`, `404` |
| `DELETE /dentists/:id/schedule-exceptions/:date` | Bearer; admin | Params `id`, `date` | `200`; removes exception | `200`, `400`, `401`, `403`, `404` |

## Clinic and clinic exceptions

`PATCH /clinic` accepts a non-empty subset of `clinicName`, `tagline`, `description`, `phone`, `secondaryPhone`, `email`, `address`, `mapUrl`, `latitude`, `longitude`, `socialLinks`, `weeklySchedule`, and `bookingSettings`. Booking settings include `isBookingEnabled`, `slotIntervalMinutes`, `minBookingNoticeMinutes`, `maxBookingDaysAhead`, `bufferMinutes`, `allowSameDayBooking`, `requireEmail`, `autoConfirmAppointments`, `cancellationNoticeHours`, and `maxAppointmentsPerPhonePerDay`. The timezone is configured by environment and is not mutable through the API.

| Method and path | Authentication / roles | Body, query, or params | Success result | Important statuses |
|---|---|---|---|---|
| `GET /clinic` | Public | None | `200`; `{ data: { clinic } }`; atomically creates singleton if absent | `200` |
| `PATCH /clinic` | Bearer; admin | Non-empty partial clinic body described above | `200`; `{ data: { clinic } }` | `200`, `400`, `401`, `403` |
| `GET /clinic/closures` | Bearer; admin | Optional query `from`, `to` dates | `200`; `{ data: { closures } }` | `200`, `400`, `401`, `403` |
| `PUT /clinic/closures/:date` | Bearer; admin | Param `date`; body `{ isOpen, shifts?: shift[], note?: string }` | `200`; `{ data: { closure } }`, upserted | `200`, `400`, `401`, `403` |
| `DELETE /clinic/closures/:date` | Bearer; admin | Param `date` | `200`; removes exception | `200`, `400`, `401`, `403`, `404` |

## Availability

| Method and path | Authentication / roles | Body, query, or params | Success result | Important statuses |
|---|---|---|---|---|
| `GET /availability` | Public | Required query `dentistId`, `serviceId`, `date` | `200`; `{ data: { availability: { date, timezone, dentist, service, rules, schedule, slots[] } } }`; slot items contain local start/end and UTC `startAt`/`endAt` | `200`, `400`, `404`, `409` for inactive/unbookable/mismatched resources or disabled booking |

Availability intersects clinic and dentist weekly shifts, clinic/dentist date exceptions, service duration, slot interval, notice, horizon, same-day policy, existing locks, and buffer. A slot is returned only when its appointment duration and trailing buffer both fit.

## Appointments

| Method and path | Authentication / roles | Body, query, or params | Success result | Important statuses |
|---|---|---|---|---|
| `POST /appointments` | Public; booking limiter | Body `patientBooking` | `201`; minimized `{ data: { appointment: { id, confirmationCode, patientName, date, startTime, endTime, status, dentist, service, price } } }` | `201`, `400`, `404`, `409` unavailable/race, `429` |
| `POST /appointments/admin` | Bearer; admin or receptionist | `patientBooking` plus required `consentMethod` (`phone|in_person`), optional `source` (`phone|admin`) and `internalNote` | `201`; `{ data: { appointment } }` with full staff projection | `201`, `400`, `401`, `403`, `404`, `409` |
| `GET /appointments` | Bearer; admin or receptionist | Query `date`, `from`, `to`, `dentistId`, `serviceId`, `status`, `phone`, `page` (default 1), `limit` (1-100, default 25) | `200`; `{ data: { appointments, pagination: { page, limit, total, pages } } }` | `200`, `400`, `401`, `403` |
| `GET /appointments/:id` | Bearer; admin or receptionist | Param `id` | `200`; `{ data: { appointment } }` | `200`, `400`, `401`, `403`, `404` |
| `PATCH /appointments/:id/reschedule` | Bearer; admin or receptionist | Param `id`; body `{ date, startTime, dentistId?, serviceId?, reason? }` | `200`; `{ data: { appointment } }`; stale or occupied target returns conflict without losing old lock | `200`, `400`, `401`, `403`, `404`, `409` |
| `PATCH /appointments/:id/status` | Bearer; admin or receptionist | Param `id`; body `{ status, internalNote? }`; status is `confirmed|checked_in|in_progress|completed|no_show` | `200`; `{ data: { appointment } }` | `200`, `400`, `401`, `403`, `404`, `409` invalid/stale transition |
| `POST /appointments/:id/cancel` | Bearer; admin or receptionist | Param `id`; body `{ reason }` (2-500 characters) | `200`; `{ data: { appointment } }`; status and lock release are atomic | `200`, `400`, `401`, `403`, `404`, `409` |

Normal status flow is `pending -> confirmed -> checked_in -> in_progress -> completed`. `pending` or `confirmed` can become `no_show`. Cancellation uses the dedicated cancel route. `completed`, `cancelled`, and `no_show` are terminal. Appointment snapshots retain historical dentist, service, duration, and price information even if catalog records later change.

## Media

All media mutations are admin-only. Uploads are multipart, memory-buffered, limited to 5 MiB per image, and accept JPEG (`.jpg`/`.jpeg`), PNG (`.png`), WebP (`.webp`), HEIC (`.heic`), and HEIF (`.heif`). Submitted MIME and extension must match detected magic bytes. Cloudinary must be configured or uploads return `503`.

| Method and path | Authentication / roles | Body, query, or params | Success result | Important statuses |
|---|---|---|---|---|
| `GET /media/gallery` | Public | None | `200`; `{ data: { images } }`, active only and no `createdBy` | `200` |
| `GET /media/gallery/admin` | Bearer; admin | None | `200`; `{ data: { images } }`, including inactive and populated creator | `200`, `401`, `403` |
| `POST /media/gallery` | Bearer; admin; media limiter | Multipart `image`; fields `altText?`, `caption?`, `sortOrder?` | `201`; `{ data: { image } }` | `201`, `400`, `401`, `403`, `413`, `415`, `429`, `503` |
| `PATCH /media/gallery/:id/restore` | Bearer; admin | Param `id` | `200`; `{ data: { image } }` | `200`, `400`, `401`, `403`, `404` |
| `PATCH /media/gallery/:id` | Bearer; admin | Param `id`; non-empty body subset `altText`, `caption`, `sortOrder`, `isActive` | `200`; `{ data: { image } }` | `200`, `400`, `401`, `403`, `404` |
| `DELETE /media/gallery/:id` | Bearer; admin | Param `id` | `200`; soft-disables; does not purge Cloudinary | `200`, `400`, `401`, `403`, `404` |
| `PUT /media/dentists/:id/photo` | Bearer; admin; media limiter | Param dentist `id`; multipart `image` | `200`; `{ data: { dentist } }`; old asset deleted only after DB replacement | `200`, `400`, `401`, `403`, `404`, `413`, `415`, `429`, `503` |
| `DELETE /media/dentists/:id/photo` | Bearer; admin | Param dentist `id` | `200`; clears DB reference, then best-effort storage cleanup | `200`, `400`, `401`, `403`, `404` |
| `PUT /media/services/:id/image` | Bearer; admin; media limiter | Param service `id`; multipart `image` | `200`; `{ data: { service } }`; old asset deleted only after DB replacement | `200`, `400`, `401`, `403`, `404`, `413`, `415`, `429`, `503` |
| `DELETE /media/services/:id/image` | Bearer; admin | Param service `id` | `200`; clears DB reference, then best-effort storage cleanup | `200`, `400`, `401`, `403`, `404` |

## Before/after cases

| Method and path | Authentication / roles | Body, query, or params | Success result | Important statuses |
|---|---|---|---|---|
| `GET /before-after` | Public | Query `serviceId`, `dentistId`, `featured`, `page` (default 1), `limit` (1-100, default 24) | `200`; `{ data: { cases, pagination } }`, active only and no creator | `200`, `400` |
| `GET /before-after/admin/all` | Bearer; admin | Same query as public list | `200`; `{ data: { cases, pagination } }`, includes inactive and creator | `200`, `400`, `401`, `403` |
| `POST /before-after` | Bearer; admin; media limiter | Multipart `beforeImage` and `afterImage`; fields `title`, `description?`, `serviceId?`, `dentistId?`, `isFeatured?`, `sortOrder?`, and required `consentConfirmed=true` | `201`; `{ data: { case } }` | `201`, `400`, `401`, `403`, `404`, `409`, `413`, `415`, `429`, `503` |
| `PATCH /before-after/:id/restore` | Bearer; admin | Param `id` | `200`; `{ data: { case } }` | `200`, `400`, `401`, `403`, `404` |
| `PUT /before-after/:id/before-image` | Bearer; admin; media limiter | Param `id`; multipart `image` | `200`; `{ data: { case } }` | `200`, `400`, `401`, `403`, `404`, `413`, `415`, `429`, `503` |
| `PUT /before-after/:id/after-image` | Bearer; admin; media limiter | Param `id`; multipart `image` | `200`; `{ data: { case } }` | `200`, `400`, `401`, `403`, `404`, `413`, `415`, `429`, `503` |
| `PATCH /before-after/:id` | Bearer; admin | Param `id`; non-empty body subset `title`, `description`, `serviceId`, `dentistId`, `isFeatured`, `sortOrder` | `200`; `{ data: { case } }` | `200`, `400`, `401`, `403`, `404`, `409` inactive relation |
| `DELETE /before-after/:id` | Bearer; admin | Param `id` | `200`; soft-disables and retains both Cloudinary assets | `200`, `400`, `401`, `403`, `404` |
| `GET /before-after/:id` | Public | Param `id` | `200`; `{ data: { case } }`, active only and no creator | `200`, `400`, `404` |

Creation uploads the before image first and the after image second. A failed second upload removes the first asset; a failed DB insert removes both. Replacement preserves the old DB reference until the new upload and DB save succeed.

## Audit logs

| Method and path | Authentication / roles | Body, query, or params | Success result | Important statuses |
|---|---|---|---|---|
| `GET /audit-logs` | Bearer; admin | Query `action`, `entityType`, `entityId`, `actorId`, ISO `from`, ISO `to`, `page` (default 1), `limit` (1-100, default 50) | `200`; `{ data: { logs, pagination } }`; actor is populated with name/email/role | `200`, `400`, `401`, `403` |

Audit events contain request ID, actor, action, entity type/id, method, path, IP, user agent, bounded metadata, and timestamps. Sensitive metadata keys are recursively removed. Audit data is operational metadata and must still be access-controlled and retained according to clinic policy.
