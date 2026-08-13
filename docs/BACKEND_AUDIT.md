# Backend production-readiness audit

Audit branch: `codex/backend-audit-hardening`

## 1. Executive summary

The backend has a coherent Express 5 / Mongoose 9 ESM architecture and strong core scheduling primitives. The most important invariant—one dentist cannot own overlapping appointment minutes—is enforced by a MongoDB unique multikey index rather than by an application-only availability check. High-risk behavior was exercised through HTTP against a disposable real MongoDB process, including exact-slot booking, overlapping starts, booking versus reschedule, failed reschedule, cancellation, different dentists, concurrent status transitions, concurrent reschedules, and refresh-token replay.

The audit found and fixed atomic refresh rotation, stale appointment mutations, ignored reschedule exclusion, ignored email policy, partial admin-booking metadata persistence, production error disclosure, incomplete sensitive-key sanitization, incomplete upload type validation, and several robustness defects. Seventy-one automated tests now pass against isolated databases; all Cloudinary calls in automated tests are stubbed.

There are no known unresolved CRITICAL or HIGH code vulnerabilities. The backend must not yet be called production-ready: staff credential lifecycle, deployment/proxy decisions, production index verification, backups, CI, monitoring, before/after consent governance, and a multilingual public-content contract remain. It is also not fully ready for final multilingual frontend integration until that content contract is chosen.

## 2. Architecture overview

- Runtime: Node.js ESM, Express 5, Mongoose 9, MongoDB, Joi, JWT, bcrypt, Luxon, Multer, `file-type`, and Cloudinary.
- Startup: `src/server.js` validates environment through `src/config/env.js`, connects MongoDB, starts HTTP, and closes HTTP/Mongo on SIGINT/SIGTERM.
- HTTP pipeline: request ID, Helmet, allowlisted credentialed CORS, cookie parser, 100 KiB JSON/urlencoded limits, nested NoSQL operator-key rejection, development-only request logging, global rate limiter, versioned routes, 404, centralized errors.
- Modules: authentication/users/sessions; service categories/services; dentists and exceptions; clinic and exceptions; availability; appointments; audit; media/gallery; before/after.
- Boundaries: routes declare middleware and roles, controllers shape HTTP responses, services contain business rules, and Mongoose models enforce persistence constraints.
- Authentication: short-lived HS256 bearer JWT plus random refresh token in an HttpOnly cookie. Only the SHA-256 refresh-token hash is stored.
- Scheduling: clinic and dentist weekly shifts plus date exceptions are intersected in the configured IANA timezone. Availability applies duration, interval, notice, horizon, same-day policy, buffers, active-resource rules, and appointment locks.
- Booking atomicity: every occupied local minute is stored in `lockKeys`; the unique compound multikey index `{ dentist: 1, lockKeys: 1 }` makes overlap ownership a database invariant.
- Media: admin-only multipart upload, 5 MiB per image, magic-byte/MIME/extension validation, Cloudinary persistence, rollback on DB failure, and soft-delete for gallery/case records.
- Privacy: the system stores booking/contact and consent data but no diagnoses, records, X-rays, prescriptions, or arbitrary patient files.

## 3. Strong parts of the current implementation

- The overlap guarantee is database-enforced and includes trailing buffers.
- Cancelled appointments release locks with a record-specific sentinel; same clock time remains independent across dentists.
- Historical appointment snapshots protect dentist/service/price display from later catalog edits.
- Availability is timezone-aware and does not construct naive UTC values from local clinic times.
- Public appointment creation returns a deliberately minimized response, and no public route lists patient appointments.
- Password hashes are excluded by default; refresh tokens are random and hashed at rest; sessions have a TTL index.
- RBAC is explicit at every protected route. Receptionists receive appointment operations only; dentist-role users do not receive administrative catalog or patient access.
- Joi validation, body limits, Helmet, CORS, rate limits, ObjectId validation, and nested operator rejection provide useful layered controls.
- Media write routes are admin-only and use rollback-safe ordering.
- Audit metadata is bounded and recursively sanitized.
- No medical-record scope was added during the audit.

## 4. Critical findings

No CRITICAL finding was identified or remains open.

## 5. High findings

### HIGH-01 — refresh-token rotation accepted a concurrent replay

- Severity: HIGH
- Affected files: `backend/src/modules/auth/auth.service.js`, `backend/test/auth.test.js`
- Problem: rotation used a read followed by a document save. Two requests could both read the current token hash before either persisted its replacement.
- Realistic failure/security scenario: a stolen refresh cookie races the legitimate browser; both requests obtain valid bearer tokens and both initially appear authenticated.
- Fix: consume and replace the current hash with one conditional `findOneAndUpdate` matching hash, non-revoked state, and future expiry.
- Whether fixed: Yes.
- Regression test name: `concurrent HTTP refresh replay permits exactly one rotation`.

### HIGH-02 — unexpected production errors exposed internal messages

- Severity: HIGH
- Affected files: `backend/src/middlewares/errorHandler.js`, `backend/test/security.test.js`
- Problem: stack traces were hidden, but the raw `err.message` was still returned for unexpected 5xx failures.
- Realistic failure/security scenario: MongoDB, filesystem, adapter, or implementation details reveal internal paths, hosts, or query behavior to an unauthenticated caller.
- Fix: production 5xx responses return `Internal server error`; internal details remain server-side with request ID context.
- Whether fixed: Yes.
- Regression test name: `production error responses suppress stacks and unexpected internal messages`.

No unresolved HIGH finding remains.

## 6. Medium findings

### MEDIUM-01 — stale appointment mutations could silently overwrite each other

- Severity: MEDIUM
- Affected files: `backend/src/modules/appointments/appointment.service.js`, `backend/test/appointment-concurrency.test.js`, `backend/test/appointments.test.js`
- Problem: status-only compare-and-swap was insufficient for two reschedules because rescheduling does not change status; document save paths also allowed stale administrative intent.
- Realistic failure/security scenario: two receptionists reschedule the same appointment to different times. Both see success, but the later write silently wins and the first receptionist communicates an incorrect time to the patient.
- Fix: status update, cancellation, and reschedule now match both observed status and `updatedAt`; stale operations return `409`.
- Whether fixed: Yes, in a follow-up commit without rewriting the earlier scheduling commit.
- Regression test name: `concurrent reschedules reject one stale write instead of silently losing an update` and `concurrent transitions from one state have exactly one winner`.

### MEDIUM-02 — reschedule availability did not exclude the appointment being moved

- Severity: MEDIUM
- Affected files: `backend/src/modules/availability/availability.service.js`, `backend/test/appointment-concurrency.test.js`
- Problem: `excludeAppointmentId` was accepted but ignored when occupied locks were loaded.
- Realistic failure/security scenario: saving an appointment at its current time, or changing only its service/dentist while retaining a valid slot, incorrectly reports its own slot as occupied.
- Fix: add `_id: { $ne: excludeAppointmentId }` to the occupied appointment query.
- Whether fixed: Yes.
- Regression test name: `rescheduling to the current slot succeeds because availability excludes that appointment`.

### MEDIUM-03 — clinic `requireEmail` policy was ignored during booking

- Severity: MEDIUM
- Affected files: `backend/src/modules/appointments/appointment.service.js`, `backend/test/appointments.test.js`
- Problem: the setting existed and was returned publicly but did not affect appointment creation.
- Realistic failure/security scenario: the frontend trusts the setting and the clinic expects email contact, while a direct API client creates records without email.
- Fix: appointment creation rejects a missing email when the setting is enabled.
- Whether fixed: Yes.
- Regression test name: `privacy consent, valid relations, and configured email requirement are enforced`.

### MEDIUM-04 — admin booking metadata was persisted in a second write

- Severity: MEDIUM
- Affected files: `backend/src/modules/appointments/appointment.service.js`, `backend/test/appointments.test.js`
- Problem: source, creator, internal note, and consent method were updated after the appointment insert.
- Realistic failure/security scenario: a process interruption or second-write failure leaves a valid phone booking mislabelled as a website booking without correct consent provenance.
- Fix: pass staff context into creation and include all metadata in the atomic insert.
- Whether fixed: Yes.
- Regression test name: `admin phone booking stores source, creator, consent method, and internal note atomically`.

### MEDIUM-05 — audit sanitization missed common derived credential keys

- Severity: MEDIUM
- Affected files: `backend/src/modules/audit/audit.service.js`, `backend/test/security.test.js`
- Problem: sanitization covered a fixed set but could retain names such as `newPassword`, `apiSecret`, or derived token/cookie/authorization spellings.
- Realistic failure/security scenario: future audit metadata includes a credential under a slightly different casing or compound name and persists it in an admin-readable log.
- Fix: normalize names and reject password/secret/authorization/cookie substrings, token suffixes, and known exact sensitive and patient keys recursively.
- Whether fixed: Yes.
- Regression test name: `audit sanitizer removes sensitive keys case-insensitively and recursively` and `stored audit metadata never contains sensitive values`.

### MEDIUM-06 — upload validation did not compare extension/MIME with magic bytes

- Severity: MEDIUM
- Affected files: `backend/src/middlewares/uploadImage.js`, `backend/test/media-before-after.test.js`
- Problem: size and detected content were validated, but the client-declared MIME and filename extension were not required to match detected content.
- Realistic failure/security scenario: mismatched assets bypass downstream assumptions made by scanners, CDNs, or frontend rendering logic.
- Fix: require an allowed magic-byte type and matching submitted MIME and extension.
- Whether fixed: Yes.
- Regression test name: `media upload rejects MIME and extension values that disagree with magic bytes`.

### MEDIUM-07 — media removal could report failure after the DB change committed

- Severity: MEDIUM
- Affected files: `backend/src/modules/media/media.service.js`, `backend/test/media-before-after.test.js`
- Problem: dentist/service image removal cleared the DB reference, then propagated a Cloudinary deletion failure as an HTTP failure.
- Realistic failure/security scenario: an administrator retries a reported failed removal even though the application already removed it; the old asset becomes cleanup debt and state is confusing.
- Fix: the DB remains authoritative; storage deletion failure is logged and does not reverse or misreport the committed removal.
- Whether fixed: Yes. A durable retry queue remains a SHOULD item.
- Regression test name: `image removal commits database state and treats storage deletion failure as observable cleanup debt`.

### MEDIUM-08 — singleton clinic creation was check-then-create

- Severity: MEDIUM
- Affected files: `backend/src/modules/clinic/clinic.service.js`, `backend/test/availability.test.js`
- Problem: concurrent first requests could both observe no clinic and race a unique insert.
- Realistic failure/security scenario: a fresh deployment intermittently returns a duplicate-key failure during simultaneous health/frontend initialization traffic.
- Fix: use atomic upsert with `$setOnInsert` and the configured timezone.
- Whether fixed: Yes.
- Regression test name: `clinic singleton initialization is atomic and honors the configured timezone`.

### MEDIUM-09 — public dentist responses could populate inactive services

- Severity: MEDIUM
- Affected files: `backend/src/modules/dentists/dentist.service.js`, `backend/test/catalog-scheduling.test.js`
- Problem: dentist population selected referenced services without an active filter.
- Realistic failure/security scenario: a disabled treatment remains visible through a dentist profile and is offered by the frontend.
- Fix: populated public services now match `isActive: true`.
- Whether fixed: Yes.
- Regression test name: covered by catalog public-visibility assertions in `catalog-scheduling.test.js`.

### MEDIUM-10 — API robustness mappings and CORS methods were incomplete

- Severity: MEDIUM
- Affected files: `backend/src/app.js`, `backend/src/middlewares/errorHandler.js`, `backend/src/middlewares/notFound.js`, `backend/test/security.test.js`
- Problem: unknown routes became 500 responses, malformed/oversized parser errors were not intentionally mapped, and CORS omitted `PUT` despite implemented PUT routes.
- Realistic failure/security scenario: browser media/schedule updates fail preflight; malformed input is misclassified; monitoring records client errors as server outages.
- Fix: explicit 404 error, parser `400`/`413` mappings, and `PUT`/`OPTIONS` CORS methods.
- Whether fixed: Yes.
- Regression test name: `unknown routes return 404 rather than leaking through as 500`, `malformed and oversized JSON bodies map to 400 and 413`, and `CORS allows browser PUT preflight for declared APIs and rejects unknown origins`.

### MEDIUM-11 — phone-per-day quota is check-then-insert

- Severity: MEDIUM
- Affected files: `backend/src/modules/appointments/appointment.service.js`
- Problem: distinct-slot requests can all pass `countDocuments` before any insert. The overlap index does not serialize a quota across different minutes.
- Realistic failure/security scenario: a scripted client concurrently books many non-overlapping times with one phone despite a configured limit.
- Fix: not changed; use a transactional quota/counter or a separate unique reservation-key design if this control must be a hard invariant. Current IP rate limiting only reduces exposure.
- Whether fixed: No; explicitly accepted as an abuse-control gap, not a double-booking gap.
- Regression test name: `maximum bookings per phone per local date is enforced and cancelled bookings do not count` covers sequential semantics; no test claims atomic quota enforcement.

### MEDIUM-12 — no staff credential lifecycle APIs

- Severity: MEDIUM
- Affected files: `backend/src/modules/auth`, `backend/src/modules/users`, `backend/src/modules/sessions`
- Problem: there is only an environment-driven admin seed plus login/refresh/logout; no staff create/deactivate workflow, password change/reset, session list, or logout-all.
- Realistic failure/security scenario: a departed employee cannot be cleanly offboarded through a supported workflow, and a compromised credential cannot have all sessions revoked promptly.
- Fix: not implemented because authorization policy and recovery channel are product/operations decisions. Implement before production with admin-only lifecycle, current-password confirmation for change, recovery procedure, and user-wide session revocation.
- Whether fixed: No; production blocker.
- Regression test name: None until the feature contract exists.

### MEDIUM-13 — deployment topology affects cookie CSRF and client IP controls

- Severity: MEDIUM
- Affected files: `backend/src/modules/auth/auth.controller.js`, `backend/src/app.js`, deployment configuration
- Problem: `SameSite=Strict` is strong for same-site deployment but incompatible with a truly cross-site SPA. Trusted proxy count is not explicitly deployment-configured, affecting secure cookies and IP-based rate limits behind proxies.
- Realistic failure/security scenario: cross-site refresh silently fails, or an incorrect proxy setting makes all clients share one limiter identity / permits spoofed client IPs.
- Fix: not changed without a deployment topology. Prefer same-site HTTPS. If cross-site is required, use `SameSite=None; Secure` plus explicit Origin/CSRF protection. Set exact proxy hops at deployment.
- Whether fixed: No; deployment blocker.
- Regression test name: `production refresh cookie is Secure, HttpOnly, Strict, and path-scoped` verifies the current same-site contract.

### MEDIUM-14 — rate limits are process-local

- Severity: MEDIUM
- Affected files: `backend/src/middlewares/rateLimiter.js`
- Problem: the default in-memory store is not shared across replicas and resets on restart.
- Realistic failure/security scenario: an attacker distributes requests across instances and multiplies login or booking limits.
- Fix: use a shared store or edge gateway when deploying more than one API process.
- Whether fixed: No; safe only under the documented single-instance assumption.
- Regression test name: None; requires deployment/integration infrastructure.

### MEDIUM-15 — schedule changes do not warn about affected appointments

- Severity: MEDIUM
- Affected files: `backend/src/modules/clinic/clinic.service.js`, `backend/src/modules/dentists/dentist.service.js`
- Problem: shortening hours or adding a day off correctly does not delete existing appointments, but the API does not report which future bookings now fall outside the schedule.
- Realistic failure/security scenario: an administrator changes hours and assumes the calendar is consistent, leaving patients scheduled while the dentist is unavailable.
- Fix: add a preview/affected-appointment warning contract before schedule-management UI is finalized; never auto-cancel silently.
- Whether fixed: No.
- Regression test name: Existing scheduling tests verify exception behavior for new availability, not warnings for existing bookings.

### MEDIUM-16 — before/after consent evidence and retention policy are underspecified

- Severity: MEDIUM
- Affected files: `backend/src/modules/beforeAfter`, clinic operational policy
- Problem: the record stores confirmation time but not consent source/version, withdrawal handling, retention, or publication expiration.
- Realistic failure/security scenario: the clinic cannot demonstrate which publication terms were accepted or reliably withdraw/purge a patient's images.
- Fix: define legal/operational policy, then add only the minimum evidence fields and a withdrawal/purge workflow it requires.
- Whether fixed: No; production blocker for public before/after use.
- Regression test name: `before/after HTTP creation requires both files and explicit consent` covers the current technical gate only.

### MEDIUM-17 — public multilingual content shape is not defined

- Severity: MEDIUM
- Affected files: category, service, dentist, clinic, and before/after models/validators/API contract
- Problem: public names, descriptions, bios, titles, and clinic copy are single strings while the product exposes language concepts.
- Realistic failure/security scenario: frontend and real content are built against single strings, then require a breaking data/API migration for Armenian, Russian, and English.
- Fix: freeze the localized-content model before final public frontend/content work. The recommendation is in section 20.
- Whether fixed: No; frontend contract blocker.
- Regression test name: None until the schema decision is made.

## 7. Low findings and technical debt

### LOW-01 — liveness is not readiness

- Severity: LOW
- Affected files: `backend/src/app.js`
- Problem: `/health` reports process liveness without checking MongoDB readiness.
- Realistic failure/security scenario: an orchestrator routes traffic to a process whose database is unavailable.
- Fix: add a separate readiness endpoint/check at deployment time; do not make liveness depend on external services.
- Whether fixed: No.
- Regression test name: `server.js starts against isolated MongoDB and serves health` verifies only current liveness/startup.

### LOW-02 — graceful shutdown lacks a forced timeout and explicit fatal-process policy

- Severity: LOW
- Affected files: `backend/src/server.js`
- Problem: shutdown waits indefinitely for open connections and there is no explicit unhandled-rejection/uncaught-exception policy.
- Realistic failure/security scenario: a deployment remains stuck during termination or exits inconsistently after a fatal error.
- Fix: add a bounded drain timeout and deployment-aware fatal error handling after observability is configured.
- Whether fixed: No.
- Regression test name: None.

### LOW-03 — cleanup failures have logs but no durable retry

- Severity: LOW
- Affected files: `backend/src/modules/media/media.service.js`, `backend/src/modules/beforeAfter/beforeAfter.service.js`
- Problem: old-asset cleanup failure is observable but can leave storage orphans indefinitely.
- Realistic failure/security scenario: a Cloudinary outage during replacement accumulates billable unused assets.
- Fix: add a durable cleanup job/outbox or an operational reconciliation script.
- Whether fixed: Partially; incorrect HTTP failure semantics are fixed, durable retry is not.
- Regression test name: `image removal commits database state and treats storage deletion failure as observable cleanup debt`.

### LOW-04 — no OpenAPI artifact

- Severity: LOW
- Affected files: `docs/API_CONTRACT.md`
- Problem: the practical contract is manually maintained and cannot generate clients or validate drift.
- Realistic failure/security scenario: frontend and backend diverge as endpoints evolve.
- Fix: add OpenAPI when generated clients or external consumers justify it.
- Whether fixed: Manual API documentation is complete; OpenAPI is not.
- Regression test name: None.

## 8. Authentication and security assessment

JWT issuance and verification are pinned to HS256. The auth middleware rejects malformed subjects before a Mongo query, loads the current active user, and never trusts a stale role embedded in the token. Access tokens default to 15 minutes in the example configuration. Refresh cookies are HttpOnly, Strict, path-scoped, and Secure in production. Refresh tokens are random, hashed, TTL-limited, and atomically single-use.

New user records require a 12-character password; login still accepts six characters so legacy accounts are not accidentally locked out. The seed enforces 12. Missing capabilities are password change/reset and supported staff/session administration. Rotation does not implement token-family reuse detection: if an attacker wins the first replay, the legitimate token is rejected but the attacker retains the rotated session. User-wide revocation should accompany staff lifecycle work.

RBAC and IDOR review found no public patient-record lookup and no unguarded administrative ID route. Admin-only catalog, scheduling, media, before/after, and audit routes are explicit. Appointment administration is limited to admin/receptionist. The dentist role has no appointment read route, which is least privilege but may need a future product-specific scoped endpoint rather than broad access.

## 9. Database and index assessment

Important declared indexes include:

- unique user email;
- unique session token hash and TTL on `expiresAt`;
- unique category/service/dentist slugs;
- unique clinic singleton key;
- unique dentist/date schedule exceptions and clinic/date exceptions;
- unique appointment confirmation code;
- unique appointment `{ dentist, lockKeys }` plus date/dentist/status/phone query indexes;
- audit action/entity/actor/date indexes and media listing indexes.

The test suite inspects the actual Mongo index and confirms `unique_dentist_booking_lock` is unique. `Appointment.init()` ensures the booking index before an insert in this application process. Production must still create and verify indexes during deployment. An existing dirty collection can make unique-index creation fail; deployment should detect duplicates/orphaned lock data before enabling traffic. No data migration was introduced by the fixes, but adding the index to an existing environment must be treated as a release step, not assumed from schema declarations.

## 10. Scheduling and availability assessment

Availability correctly intersects clinic and dentist windows and applies full-day/altered-hour exceptions. Tests cover lunch gaps, exact closing boundaries, differing slot interval and duration, trailing buffer fit, closures, dentist days off, horizon, past dates, same-day setting, notice, disabled resources, relationship validation, occupied/cancelled slots, local-to-UTC conversion, and singleton timezone.

The timezone is validated as an IANA zone at startup. `date` and `HH:mm` remain clinic-local; `startAt`/`endAt` are UTC instants. Armenia currently has stable UTC+4, but retaining Luxon/IANA logic avoids hardcoding that assumption. Schedule edits affect future availability only; the open warning issue is documented as MEDIUM-15.

## 11. Concurrency assessment

The unique minute-lock index, not the preliminary availability query, is the final authority. The following were exercised with concurrent HTTP requests:

- exact same slot: one `201`, one `409`, one appointment;
- different overlapping starts: one winner;
- booking versus reschedule to one target: exactly one owner;
- failed reschedule: original time and lock remain stored and reject a new booking;
- cancellation: lock becomes reusable;
- different dentists: both can own the same clock time;
- concurrent status transitions: one update succeeds, one stale update conflicts;
- concurrent reschedules to different targets: one update succeeds, one stale update conflicts.

These tests were also run repeatedly to look for flakiness. The remaining phone quota race is separate from overlap correctness.

## 12. Appointment state-machine assessment

Allowed flow is `pending -> confirmed -> checked_in -> in_progress -> completed`, with `pending|confirmed -> no_show`. Cancellation uses a dedicated path. `completed`, `cancelled`, and `no_show` are terminal. Invalid transitions return `409`. Status mutation, cancellation, and reschedule use compare-and-swap against observed state/version time. Cancellation changes status, cancellation metadata, and lock release together. Rescheduling writes the target snapshots/times/locks together; duplicate-key failure does not erase the original persisted lock.

## 13. Privacy assessment

The data model is appropriately limited to contact, booking, consent, administrative notes, and published before/after media. No clinical record expansion was made. Public booking response omits phone, email, comments, internal notes, creator, and cancellation data. Public routes do not list or retrieve appointment records. Admin appointment endpoints necessarily expose contact information to admin/receptionist roles.

IP address and user agent in audit logs are personal/operational data and require retention/access policy. Before/after images can be sensitive even though this is not a medical-record system; section MEDIUM-16 is a production blocker for their public use.

## 14. Audit-log assessment

Successful audited mutations record actor (where available), action, entity, request ID, method, path, IP, user agent, and bounded metadata. Credential and patient-sensitive metadata keys are recursively removed. Audit reads are admin-only and paginated.

Audit writes are intentionally best effort so a logging outage does not block clinic work. They occur after the response body is produced; a process crash can lose an event. Failures are logged with action/request ID but there is no durable outbox. For higher assurance, add a transactional/outbox design and retention controls after operational requirements are known.

## 15. Media and Cloudinary assessment

Uploads are admin-only, additionally rate limited, capped at 5 MiB per file, capped by part/file counts, and validated by detected signature plus matching MIME and extension. The application uses generated Cloudinary IDs and fixed folders/tags. Public results expose only persisted secure URLs and metadata.

Rollback tests cover gallery DB failure, dentist/service replacement, removal, before/after second-upload failure, two-upload DB failure, replacement DB failure, and soft-delete/restore. Newly uploaded assets are removed if DB persistence fails. Old assets are removed only after successful replacement. All automated Cloudinary methods are stubbed at the SDK uploader boundary; an unexpected upload fails the test, so tests cannot reach the real service.

Permanent purge and durable cleanup retry remain operational work. Memory buffering is bounded but production should also apply reverse-proxy body limits and resource monitoring.

## 16. Before/after assessment

Both images and `consentConfirmed=true` are required. Related service/dentist IDs are validated before upload. If upload two fails, upload one is deleted; if the DB insert fails, both are deleted. Image replacement preserves the old reference on failure and deletes the old asset after success. Public lists omit creator data and only include active cases. Soft deletion intentionally retains assets for restore.

Technical behavior is sound. Legal/operational consent evidence, withdrawal, retention, and permanent purge are unresolved as MEDIUM-16.

## 17. Performance assessment

- Catalog and availability queries use targeted indexes and lean reads where appropriate.
- Staff appointment, audit, and before/after lists are paginated with limits capped at 100.
- Availability lock reads are dentist/date scoped.
- Minute-level lock arrays can contain up to appointment duration plus buffer (validated maximum 480 + 120 = 600 values), which is acceptable at current scale but should be load-tested at expected booking volume.
- `Appointment.init()` in the request path can add latency to the first booking; deployment-time index creation should make it a no-op.
- In-memory uploads can hold two 5 MiB files plus overhead per before/after request. Proxy limits and concurrency monitoring are appropriate.
- Rate limiting and application state are process-local; horizontally scaled operation needs shared/edge controls.

No synthetic load test was added because no production volume/latency target or deployment topology was provided.

## 18. Production and deployment risks

Before traffic, provision HTTPS, secrets outside Git, exact CORS origin, same-site frontend/API topology, exact trusted-proxy hops, Mongo authentication/network rules, backups and restore exercises, index verification, centralized logs, error monitoring, and CI. Define supported Node/Mongo versions; `package.json` now requires Node 22 or newer because current dependencies require modern Node.

The committed `.env.example` contains placeholders only. `backend/.env` remains ignored and untracked. Production Cloudinary credentials must be injected by the platform. The current health route is liveness only. Graceful shutdown needs a bounded fallback for production orchestration.

## 19. Test coverage

Framework: Node's built-in `node:test` runner for ESM-native execution, Supertest for HTTP behavior, and `mongodb-memory-server` for disposable real Mongo semantics. Tests run serially across files to avoid shared process/environment interference.

Isolation controls:

- the helper refuses to start unless `NODE_ENV=test`;
- the generated URI must have the exact `/dental_clinic_test` database path;
- the connected Mongoose database name is rechecked before tests proceed;
- the production-cookie test owns a separate disposable server because its environment is intentionally `production`;
- media tests replace `cloudinary.uploader.upload_stream` and `destroy`; unexpected upload calls fail;
- the startup smoke test launches real `server.js` against a disposable Mongo process and blank Cloudinary settings.

Coverage: 71 tests in 9 files, covering auth/cookies/RBAC, HTTP security/errors/audit, catalog and scheduling CRUD, availability/timezones, appointment behavior/state, Mongo concurrency/indexes, media/before-after rollback, and real startup. This is strong backend integration coverage, though not formal 100% line/branch coverage and not a substitute for deployment smoke/load testing.

## 20. Multilingual readiness

Recommendation: use a consistent per-entity `translations` object for public editorial fields, with fixed supported locales and validated subdocuments, for example:

```json
{
  "slug": "professional-cleaning",
  "translations": {
    "hy": { "name": "...", "shortDescription": "...", "description": "..." },
    "ru": { "name": "...", "shortDescription": "...", "description": "..." },
    "en": { "name": "...", "shortDescription": "...", "description": "..." }
  }
}
```

Use the same shape for category copy, service copy, dentist title/bio/specializations, clinic marketing copy/address display, and before/after title/description. Require Armenian for published content; allow Russian/English to fall back to Armenian according to a documented frontend rule. Keep canonical slugs, IDs, price, duration, phone, schedules, statuses, patient data, and internal notes language-neutral. Return all translations from public APIs and let the client select locale; avoid duplicating whole documents per language.

This is a deliberate future schema/API change and should be designed and migrated before real multilingual content or final public frontend contracts are created.

## 21. Recommended next steps and readiness matrix

### MUST BEFORE PRODUCTION

- Staff user lifecycle: admin-only create/deactivate/reactivate, least-privilege role changes, and supported offboarding.
- Password change and password reset/recovery, with all-session revocation after compromise/reset.
- Deployment configuration: HTTPS, same-site/cross-site cookie decision, exact CORS origin, exact trusted-proxy hops, secure secret injection, and smoke checks.
- MongoDB backups with a demonstrated restore and production verification of every unique/TTL/query index; preflight dirty data before unique-index creation.
- CI on the supported Node/Mongo versions running tests, syntax/static checks, dependency audit, and `.env`/secret safety checks.
- Central production logging and error monitoring with request IDs and redaction.
- Define before/after consent evidence, retention, withdrawal, and purge policy before publishing patient images.
- Freeze and migrate the multilingual content shape before production multilingual content; it is also the current frontend-contract blocker.

### SHOULD BEFORE PRODUCTION

- Email notification/confirmation workflow if online booking is customer-facing; clearly define whether `pending` or `confirmed` is communicated.
- SMS notifications only if the clinic promises them; otherwise omit from initial release.
- Appointment confirmation workflow documentation and staff UI behavior around the existing state machine.
- Schedule-change preview listing future appointments affected by new hours/exceptions.
- Durable media cleanup retry/reconciliation and an authorized permanent-purge runbook.
- Distributed rate limiting when more than one API instance is deployed; edge/shared limits are unnecessary for a documented single instance.
- Separate readiness from liveness, add a shutdown timeout, and verify termination behavior in the target platform.
- Add refresh reuse detection/user-wide revocation as part of session management.
- Resolve the atomic phone-per-day quota if it is intended as a hard policy rather than soft abuse control.
- Reverse-proxy request-size limits and media concurrency/resource monitoring.

### CAN WAIT

- Appointment reminders and more advanced email/SMS automation.
- OpenAPI/client generation while this maintained API contract is sufficient for one first-party frontend.
- Permanent media purge UI if a safe audited operational runbook exists.
- Rich audit export/analytics and broader business reporting.
- Redis/shared limiting while the deployment remains one API process.

### Frontend readiness decision

**NO, because one specific API/data contract blocker remains:** the multilingual public-content model must be chosen before final catalog, dentist, clinic, and before/after frontend integration and real content entry. Authentication, booking, scheduling, appointment administration, and media integration are stable enough for frontend prototyping in parallel. The exact next step is a short schema/API decision for `translations.hy|ru|en`, followed by a focused migration and contract-test commit; then frontend implementation can proceed against a stable public-content shape.
