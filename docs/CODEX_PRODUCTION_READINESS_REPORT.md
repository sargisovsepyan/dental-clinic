# Backend production-readiness report

Evidence date: 2026-08-14

Reviewed baseline: `140f9f7` (`codex/backend-audit-hardening`)

Review branch: `codex/production-readiness-hardening`

## 1. Overall production-readiness verdict

The backend codebase is ready for frontend integration and for a controlled production deployment after the external provisioning and release gates in sections 37 and 41 are completed. The source tree is not, by itself, evidence that production DNS/TLS, MongoDB, Redis, SMTP, Cloudinary, monitoring, backups, or secret injection have been provisioned. No known unresolved critical or high code vulnerability remains after the final high-effort review. This is a bounded engineering verdict, not a claim that vulnerabilities are impossible.

## 2. Branch name

All work remains on `codex/production-readiness-hardening`. It has not been merged and was not pushed.

## 3. Architecture after this phase

The application remains a single Express 5/Mongoose 9 backend, organized into route, validation, controller, service, model, infrastructure, observability, migration, production-check, and script layers. Correctness-sensitive operations use MongoDB unique indexes, conditional writes, and replica-set transactions. Redis is used only where shared process state has operational value: distributed rate limiting. SMTP, Cloudinary, and monitoring are adapters behind validated configuration. Startup configuration, liveness/readiness, bounded graceful shutdown, controlled migrations/index creation, and read-only production preflight are explicit.

## 4. Multilingual architecture

Category, service, dentist, clinic, gallery, before/after, and appointment snapshot content support explicit `hy`, `ru`, and `en` translation objects. Armenian is the required primary locale for active/public records; Russian and English remain optional and are never synthesized. Supported locale keys and primary-content rules are centralized. Language-neutral identifiers, relations, prices, durations, schedules, and media metadata remain outside translations. Legacy response fields are retained for compatibility while clients move to the explicit translation contract.

## 5. Migration behavior

The migration runner is ordered, version-recorded, idempotent, and dry-run-first. The content migration requires the operator to declare `LEGACY_CONTENT_LOCALE`; it copies existing text only into that declared locale and never invents translations. Phone-quota migration derives HMAC/date reservations from qualifying appointments and supports reconciliation. Auth migration initializes security lifecycle fields. Before/after consent migration requires real legacy actor/timestamp evidence, scans all candidate rows before writes, and refuses unverifiable or partial mutation. Applied versions are recorded only after successful non-dry execution.

## 6. Staff-management implementation

Admin-only endpoints now list and inspect staff, invite users, change roles, deactivate/reactivate accounts, and revoke sessions. Responses minimize credential/security fields. Every privileged mutation is authorized and audited. Deactivation, role changes, password changes, and explicit revocation advance `authVersion` and revoke sessions. A transactionally updated singleton invariant serializes competing admin-removal operations so the final active administrator cannot be removed, including under concurrency.

## 7. Password change/reset implementation

Authenticated password change requires the current password. Invitation/setup and forgot/reset use cryptographically random, purpose-scoped, single-use tokens stored only as SHA-256 hashes with expiry/TTL. Recovery is enumeration-safe, delivery uses the configured trusted frontend URL and mail adapter, and consumption plus credential/security-state updates is transactional. Successful setup/reset/change revokes existing refresh sessions and invalidates issued bearer tokens through `authVersion`.

## 8. Confirmation that minimum password is exactly 6

The minimum for new passwords is exactly six Unicode characters: six is accepted and five is rejected. Password input is not trimmed. New passwords over bcrypt's 72 UTF-8-byte boundary are rejected to prevent silent truncation, while login remains compatible with legacy hashes created from longer inputs. Bcrypt cost is 12.

## 9. Session/replay protection

Access tokens are HS256-pinned, short-lived, and checked against the current database user, active state, role, setup state, and `authVersion`. Refresh tokens are random, hashed at rest, and atomically single-use. Rotation records consumed hashes. Reuse/replay triggers transactional user-wide refresh revocation plus `authVersion` advancement, invalidating both refresh families and existing bearer tokens. Concurrent refresh testing proves only one rotation succeeds. Logout revokes the presented session and clears the path-scoped cookie.

## 10. Atomic phone-limit design

Each normalized phone number is pseudonymized with a dedicated HMAC secret and paired with the clinic-local appointment date in one `PhoneDailyQuota` document. A unique `{ phoneKey, date }` index provides one quota authority. Reservation IDs are appended atomically only when absent and when an `$expr` array-size predicate remains below the configured limit. Appointment creation/rescheduling stores the reservation ID; failed slot acquisition releases its reservation, cancellation releases it, and reconciliation repairs safe residual drift.

## 11. Exact concurrency guarantees

- Exact and partially overlapping active appointments for one dentist contend on database-enforced `lockKeys`; exactly one writer can own any covered time quantum.
- The same clock time remains independently bookable for different dentists.
- Booking versus reschedule and competing reschedules use unique indexes plus compare-and-set appointment writes; a stale loser returns conflict without taking the target slot.
- A failed reschedule preserves the original appointment lock and original phone/day quota. Cross-day reschedule reserves the target quota before the appointment CAS and releases the old quota only after success.
- Cancellation releases both appointment and quota ownership; cancellation races may conservatively under-allow temporarily but cannot overbook or exceed quota.
- Status changes are conditional on the observed state; terminal `cancelled`, `completed`, and `no_show` transitions/reschedules are constrained by the state machine.
- Media replacement/removal matches the expected current public ID. One concurrent replacement wins; losers clean their uploads. Removal, consent withdrawal, or purge cannot be undone by stale in-flight replacement.
- Last-admin changes, refresh rotation/replay response, one-time-token consumption, and permanent consent purge are transactionally or conditionally single-winner.

## 12. Proxy/HTTPS/CORS/cookie design

Production requires an exact positive trusted-proxy hop count and rejects insecure forwarded transport. Credentialed browser origins are an exact HTTPS allowlist; wildcard, path-bearing, malformed, or unsafe production origins fail configuration. Cookie-authenticated login/refresh/logout require a trusted `Origin`. The refresh cookie is `Secure`, `HttpOnly`, `SameSite=Strict`, and scoped to the auth refresh path; its domain is explicit when configured. CORS methods include the documented write operations, and unknown origins fail closed.

## 13. Shared/distributed rate-limit design

Production requires a TLS/authenticated Redis URL and rejects in-memory limiting for multi-instance operation. The Redis adapter uses namespaced atomic increment/expiry behavior supported by `rate-limit-redis`. Separate controls cover global/IP traffic, normalized-account authentication attempts, refresh, recovery/setup, media upload, and booking phone identity. Account and phone keys are HMAC-pseudonymized with dedicated secrets. Tests force the isolated in-memory store and exercise the Redis command shape without a real server.

## 14. Logging architecture

Production logging is newline JSON with timestamp, level, request ID, method, path without query string, status, and duration. Bodies and raw query values are not logged. Recursive redaction covers authorization/cookies, secrets/tokens/passwords, email/phone/contact/patient-shaped keys, and internal notes. Audit transport fields store only pseudonymized IP/user-agent values. Audit-write failure does not roll back a successful business mutation and is itself logged through the safe error path.

## 15. Error-monitoring architecture

Production requires an HTTPS monitoring webhook. Reports contain a generic error identity plus safe correlation fields, never request bodies, raw credentials, patient contact values, or unfiltered exceptions. Monitoring failure is bounded and cannot replace the original HTTP outcome. Tests do not configure or contact a real monitoring service.

## 16. Before/After consent governance

Publication now requires active consent, active record state, both images, Armenian primary content, a server-controlled consent-policy version, method, actor, and real timestamp. The optional external reference is opaque, length-bounded, and excluded from normal selection. Withdrawal immediately makes the case non-public and records actor/time/reason/history. Restore is rejected and audited while consent is withdrawn. Permanent purge is admin-only, requires prior withdrawal and an exact confirmation phrase, uses compare-and-set tombstoning, clears both image references, and delegates deletion to durable cleanup jobs. Failed deletion cannot republish the case.

## 17. Media cleanup/reconciliation

Uploads validate magic bytes, declared MIME, filename extension, type, and size before Cloudinary. The application allocates the exact Cloudinary public ID and persists a unique `held` rollback job before upload starts, closing the upload-before-intent crash window. Database failure, second-upload failure, replacement loss, removal, and consent purge all transition durable cleanup intent. Workers use bounded retries/backoff, stale-lock recovery, one-job claiming, and cross-collection reference checks before deletion. Admin list/retry endpoints and a reconciliation command expose cleanup debt. Automated tests fail closed unless an explicit fake Cloudinary adapter is installed.

## 18. Mongo index verification

Production sets Mongoose `autoIndex: false`. A canonical critical-index manifest verifies actual collection catalogs for exact key order, uniqueness, required names, and TTL values. It covers user/session/token uniqueness and TTL, slugs, clinic singleton/date exceptions, appointment confirmation/lock/query indexes, phone quota, audit, media cleanup, and before/after publication. Controlled index creation checks duplicate dirty data and duplicate appointment lock elements before calling non-dropping `createIndexes`; it does not use destructive `syncIndexes`.

## 19. Mongo migration system

`npm run migrate` executes the four ordered migrations through a version ledger. Dry run is the default safety posture, applied versions are immutable/unique, and production preflight compares the ledger with the code manifest. Migration code is rerunnable and preserves legacy fields. Production startup does not silently migrate or build indexes.

## 20. Backup/restore support

`docs/BACKUP_RESTORE_RUNBOOK.md` defines backup prerequisites, encrypted/provider-managed backup expectations, restore into an isolated target, application/preflight validation, recovery-point/recovery-time recording, and evidence retention. Source control cannot enable provider snapshots or prove a restore; a real restore drill remains a deployment gate.

## 21. Production preflight

The read-only preflight validates configuration, Mongo TLS/transaction-capable topology, migration completeness, exact indexes, exactly one clinic singleton, at least one active setup-complete admin, required Armenian publication content, appointment lock shape/presence/duplicates, phone-quota over-limit/duplicate/missing/orphan state, media-cleanup drift, and configured integration readiness. Unverifiable legacy state fails rather than being silently accepted. The preflight performs no schema repair.

## 22. CI

GitHub Actions now installs with `npm ci`, fetches full history for a meaningful base-to-HEAD whitespace check, runs syntax and tracked-secret checks, lints OpenAPI, runs the full isolated test suite with coverage, and audits production dependencies. A separate CodeQL workflow analyzes JavaScript. CI uses no production credentials and no real external service adapters.

## 23. OpenAPI/API contract status

`docs/openapi.yaml` is the OpenAPI 3.1 source of truth for all 59 documented paths, authentication, request/response bodies, errors, localization, staff lifecycle, cleanup operations, and consent governance. Redocly CLI 2.46.1 validates it with zero errors or warnings under the checked-in configuration. `docs/API_CONTRACT.md` describes compatibility and points clients to the validated schema.

## 24. Security findings discovered in this phase

The review found and addressed: non-atomic count-based phone quotas; incomplete refresh-replay response; missing staff offboarding/recovery; unsafe/incomplete production proxy, origin, shared-limit, logging, monitoring, and readiness assumptions; non-durable Cloudinary cleanup; incomplete publication consent governance; absent production index/migration verification; stale-document media replacement races; whitespace variants in normalized account limit keys; incomplete compound-key audit sanitization; raw audit-failure messages; an upload-before-cleanup-intent crash window; quota/index/clinic/lock states that preflight could not fully disprove; and a consent migration that could otherwise invent or partially apply legacy evidence.

## 25. Bugs reproduced

Regression tests reproduced the count-before-insert quota overflow, refresh-token double use, concurrent exact/overlap/booking-reschedule conflicts, failed-reschedule lock loss risk, concurrent quota/cancellation/reschedule interactions, stale media replacement overwrites, service deletion versus replacement, consent/purge versus replacement, two-upload and database-failure rollback, cleanup single-claim/reference protection, last-admin concurrency, five-versus-six password boundary, bcrypt byte truncation risk, unsafe production configurations, remote/non-test database selection, production error leakage, audit sensitive-key gaps, malformed critical indexes, quota drift, missing singleton/lock state, and unverifiable legacy consent migration.

## 26. Bugs fixed

All findings in sections 24 and 25 that were in scope were fixed in new logical commits with regression coverage. Earlier commits were not rewritten. The final two corrective passes specifically added expected-image compare-and-set media writes, broader audit/account-key normalization, quota invariant checks, pre-upload rollback intent, meaningful CI diff checks, complete preflight lock/legacy-state checks, and all-or-nothing non-inventing consent migration behavior.

## 27. Tests added

New suites cover multilingual behavior/migration, atomic phone quotas, staff/auth lifecycle, production configuration and isolation, production index/preflight behavior, and replica-set transactions. Existing appointment, auth, availability, catalog/scheduling, media/before-after, security, cookie, and startup suites were expanded for exact-slot and overlapping races, booking/reschedule/cancellation, quota reconciliation, state transitions, timezone boundaries, refresh replay, RBAC, password boundaries, invite/reset, audit sanitization, production errors, Cloudinary rollback/reconciliation, media replacement races, consent withdrawal/purge, migration refusal, and no-external-service guarantees.

## 28. Total test count

The final suite contains 123 passing Node tests across the tracked backend test files.

## 29. Exact final test results

- Final verification pass 1: `npm run verify` — syntax checked 133 JavaScript files; secret scan checked 149 tracked files; OpenAPI valid; tests 123, pass 123, fail 0, skipped 0, duration 70,981.8103 ms.
- Final full-suite pass 2: `npm test` — tests 123, pass 123, fail 0, skipped 0, duration 68,630.3812 ms.
- Final-code coverage pass: `npm run test:coverage` — exit 0 with 123 tests; all-files coverage 89.55% lines, 78.87% branches, and 80.67% functions; command wall time 89.3 seconds.

## 30. Concurrency stress results

- Appointment/auth/staff critical set: 38 tests per fresh process, repeated 5 times; 190/190 passed. Test-run durations were 28,135.3652, 28,464.7346, 29,835.3222, 29,129.5403, and 29,327.3545 ms.
- Media/consent critical set: 29 tests per fresh process, repeated 3 times; 87/87 passed. Test-run durations were 11,605.9659, 11,609.6143, and 11,548.2704 ms.
- Combined targeted stress evidence: 277/277 tests passed over eight fresh-process runs, in addition to the two complete-suite passes and final coverage pass.

## 31. npm audit result

On 2026-08-14, `npm audit --omit=dev --audit-level=moderate` reported `found 0 vulnerabilities`, and `npm audit --audit-level=moderate` also reported `found 0 vulnerabilities`.

## 32. Files created

Including this report, 56 files were added relative to `140f9f7`:

- CI/config: `.github/workflows/backend-ci.yml`, `.github/workflows/codeql.yml`, `redocly.yaml`.
- Infrastructure/observability/security: `backend/src/infrastructure/redis.js`, `backend/src/mail/mail.service.js`, `backend/src/mail/smtp.adapter.js`, `backend/src/middlewares/requestLogger.js`, `backend/src/middlewares/transportSecurity.js`, `backend/src/observability/errorMonitor.js`, `backend/src/observability/logger.js`, `backend/src/security/passwordPolicy.js`.
- Localization/migrations/production: `backend/src/i18n/localization.js`, `backend/src/migrations/20260814_001_localized_content.js`, `backend/src/migrations/20260814_002_phone_daily_quota.js`, `backend/src/migrations/20260814_003_auth_security_fields.js`, `backend/src/migrations/20260814_004_before_after_consent.js`, `backend/src/migrations/runner.js`, `backend/src/modules/migrations/migration.model.js`, `backend/src/production/criticalIndexes.js`, `backend/src/production/indexManagement.service.js`, `backend/src/production/models.js`, `backend/src/production/preflight.service.js`.
- Domain/auth/media: `backend/src/modules/appointments/phoneDailyQuota.model.js`, `backend/src/modules/appointments/phoneDailyQuota.service.js`, `backend/src/modules/auth/oneTimeToken.model.js`, `backend/src/modules/media/mediaCleanup.model.js`, `backend/src/modules/media/mediaCleanup.service.js`, `backend/src/modules/media/mediaUpload.service.js`, `backend/src/modules/staff/adminInvariant.model.js`, `backend/src/modules/staff/staff.controller.js`, `backend/src/modules/staff/staff.routes.js`, `backend/src/modules/staff/staff.service.js`, `backend/src/modules/staff/staff.validation.js`, `backend/src/utils/oneTimeToken.js`, `backend/src/utils/runTransaction.js`.
- Scripts/tests: `backend/src/scripts/checkSyntax.js`, `backend/src/scripts/checkTrackedSecrets.js`, `backend/src/scripts/ensureIndexes.js`, `backend/src/scripts/migrate.js`, `backend/src/scripts/productionPreflight.js`, `backend/src/scripts/reconcileAppointmentQuota.js`, `backend/src/scripts/reconcileMediaCleanup.js`, `backend/test-support/replDatabase.js`, `backend/test/appointment-quota.test.js`, `backend/test/multilingual.test.js`, `backend/test/preflight.test.js`, `backend/test/production-config.test.js`, `backend/test/staff-security.test.js`.
- Documentation: `docs/ARCHITECTURE.md`, `docs/BACKUP_RESTORE_RUNBOOK.md`, `docs/CODEX_PRODUCTION_READINESS_REPORT.md`, `docs/ENGINEERING_OVERVIEW.md`, `docs/PRODUCTION_RUNBOOK.md`, `docs/RETENTION_AND_PRIVACY.md`, `docs/SECURITY.md`, `docs/openapi.yaml`.

## 33. Files modified

Fifty-eight existing files were modified relative to `140f9f7`:

- Package/config/startup: `backend/.env.example`, `backend/package-lock.json`, `backend/package.json`, `backend/src/app.js`, `backend/src/config/db.js`, `backend/src/config/env.js`, `backend/src/server.js`.
- Middleware/routes/utilities: `backend/src/middlewares/auth.js`, `backend/src/middlewares/errorHandler.js`, `backend/src/middlewares/rateLimiter.js`, `backend/src/middlewares/validate.js`, `backend/src/routes/index.js`, `backend/src/seeds/createAdmin.js`, `backend/src/utils/cloudinaryImage.js`, `backend/src/utils/generateToken.js`.
- Appointment/audit/auth/availability: `backend/src/modules/appointments/appointment.model.js`, `backend/src/modules/appointments/appointment.service.js`, `backend/src/modules/audit/audit.middleware.js`, `backend/src/modules/audit/audit.service.js`, `backend/src/modules/auth/auth.controller.js`, `backend/src/modules/auth/auth.routes.js`, `backend/src/modules/auth/auth.service.js`, `backend/src/modules/auth/auth.validation.js`, `backend/src/modules/availability/availability.service.js`.
- Catalog/clinic/dentists: `backend/src/modules/clinic/clinic.model.js`, `backend/src/modules/clinic/clinic.service.js`, `backend/src/modules/clinic/clinic.validation.js`, `backend/src/modules/dentists/dentist.model.js`, `backend/src/modules/dentists/dentist.service.js`, `backend/src/modules/dentists/dentist.validation.js`, `backend/src/modules/serviceCategories/serviceCategory.model.js`, `backend/src/modules/serviceCategories/serviceCategory.service.js`, `backend/src/modules/serviceCategories/serviceCategory.validation.js`, `backend/src/modules/services/service.model.js`, `backend/src/modules/services/service.service.js`, `backend/src/modules/services/service.validation.js`.
- Media/consent/session/user: `backend/src/modules/beforeAfter/beforeAfter.controller.js`, `backend/src/modules/beforeAfter/beforeAfter.model.js`, `backend/src/modules/beforeAfter/beforeAfter.routes.js`, `backend/src/modules/beforeAfter/beforeAfter.service.js`, `backend/src/modules/beforeAfter/beforeAfter.validation.js`, `backend/src/modules/media/media.controller.js`, `backend/src/modules/media/media.model.js`, `backend/src/modules/media/media.routes.js`, `backend/src/modules/media/media.service.js`, `backend/src/modules/media/media.validation.js`, `backend/src/modules/sessions/session.model.js`, `backend/src/modules/users/user.model.js`.
- Test support/tests/docs: `backend/test-support/fixtures.js`, `backend/test/auth-production-cookie.test.js`, `backend/test/auth.test.js`, `backend/test/availability.test.js`, `backend/test/catalog-scheduling.test.js`, `backend/test/media-before-after.test.js`, `backend/test/security.test.js`, `backend/test/startup.test.js`, `docs/API_CONTRACT.md`, `docs/BACKEND_AUDIT.md`.

## 34. API changes

New endpoints: `/health/live`, `/health/ready`; `/auth/change-password`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/setup-password`; admin-only `/staff`, `/staff/invite`, `/staff/{id}`, `/staff/{id}/role`, `/staff/{id}/deactivate`, `/staff/{id}/reactivate`, `/staff/{id}/revoke-sessions`; admin-only `/media/cleanup-jobs`, `/media/cleanup-jobs/{id}/retry`; and admin-only `/before-after/{id}/consent/withdraw`, `/before-after/{id}/purge`. Existing localized content endpoints now accept/return explicit translation objects, media and before/after inputs carry stronger validation/governance, and cookie-auth endpoints enforce trusted-origin semantics. Existing legacy neutral fields remain for compatibility. The complete request/response/error contract is in `docs/openapi.yaml`.

## 35. Model/schema changes

Translation subdocuments were added to categories, services, dentists, clinic, gallery media, before/after cases, and appointment snapshots. Appointments gained a hidden quota reservation reference. Users gained setup/auth-version/invitation/deactivation lifecycle fields and conditional credential requirements. Sessions gained immutable family identity and consumed refresh-hash history. Before/after cases gained publication/consent states, version, method, actor, withdrawal/purge evidence/history, hidden external reference, nullable purged images, and publication indexes. New collections model phone/day quota reservations, one-time credentials, durable media cleanup jobs, migration versions, and the serialized active-admin invariant. Critical indexes and production model registration are centralized.

## 36. Required data migrations

Run, in order: `20260814_001_localized_content`, `20260814_002_phone_daily_quota`, `20260814_003_auth_security_fields`, and `20260814_004_before_after_consent`. First perform a dry run and explicitly set `LEGACY_CONTENT_LOCALE`. Resolve any content without a truthful source locale and any before/after row without a real consent actor/timestamp; the migration intentionally refuses to fabricate them. Take a recoverable backup, apply migrations once, run controlled index creation, run quota/media reconciliation, then require production preflight success.

## 37. External infrastructure steps still requiring real production-provider configuration

Provision DNS and edge TLS; configure the exact trusted proxy topology; provision authenticated TLS MongoDB with replica-set/managed transaction support and network restrictions; provision authenticated TLS Redis; configure verified SMTP and sender/domain; configure restricted Cloudinary credentials and retention policy; configure the HTTPS monitoring endpoint and privacy agreement; inject independent high-entropy JWT, quota-HMAC, rate-limit-HMAC, database, Redis, SMTP, Cloudinary, and monitoring secrets; set exact frontend/CORS/cookie/consent variables; activate encrypted backups; and complete a restore drill.

## 38. Any remaining security limitation

- Consumed refresh-token hashes grow within a rolling session until session expiry. Rate limits bound abuse, but absolute session lifetime and a user-visible device/session manager would be useful defense in depth.
- Schedule changes do not preview existing appointments that would fall outside newly configured hours; operators must review affected bookings.
- Legal retention durations require clinic/legal approval and are intentionally not invented in code.
- Provider-side access control, credential rotation, alerting, backup integrity, and incident response cannot be verified from this repository.
- No finite review proves the absence of every future vulnerability; dependency and threat-model review must continue after deployment.

## 39. Whether backend is now ready for frontend development

Yes. The OpenAPI contract is validated, compatibility fields remain, localized payloads and auth/staff/media/consent workflows are documented, production-style errors are stable, and isolated integration tests cover the client-critical behavior.

## 40. Whether the CODEBASE itself is ready for production deployment

Yes, for a controlled deployment, provided the release uses Node 22+, all four migrations and controlled indexes are applied, the exact final commit passes CI and both audits, and `npm run production:preflight` succeeds against the real environment. This verdict applies to the codebase; it does not assert that an environment is already production-ready.

## 41. What still has to be provisioned externally before receiving real production traffic

All provider work in section 37, a real backup/restore proof, secret injection/rotation ownership, production observability/alerts, network allowlists, capacity and availability choices, legal retention decisions, and an operator-approved release checklist. Real traffic must remain blocked until migrations, controlled indexes, reconciliation, readiness, and the production preflight pass against that provisioned environment.

## 42. Git status

The final intended state is a clean working tree on `codex/production-readiness-hardening`, ahead of reviewed baseline `140f9f7`, with no merge and no push. This report is the only file added after the final code/test/audit passes; status and the last 30 commits are rechecked immediately after its commit.

## 43. Complete list of commits created in this task

1. `749218a feat: add multilingual content architecture`
2. `45e5390 feat: enforce atomic appointment phone quotas`
3. `0002dfd feat: secure staff authentication lifecycle`
4. `2bbeb16 feat: harden production infrastructure`
5. `7f4d887 feat: add durable media cleanup reconciliation`
6. `f889b0a feat: add before-after consent withdrawal and purge governance`
7. `7d1a629 feat: add production readiness and API verification`
8. `9470593 fix: make media replacement races cleanup-safe`
9. `3f28f01 fix: detect production quota invariant drift`
10. `eb54203 fix: persist media rollback intent before upload`
11. `a8351d8 ci: add production verification and operations runbooks`
12. `ad1d1bb fix: fail production gates on unverifiable legacy state`
13. `docs: finalize production readiness report` — the commit containing this report; its generated hash is reported in the final task handoff.

## Verified engineering capabilities

- Database-enforced non-overlapping dentist appointments and exact lock index verification.
- Atomic concurrent phone/day booking quota with migration and reconciliation.
- Timezone-aware availability and exact schedule/notice/buffer boundary handling.
- Compare-and-set appointment status/reschedule protection and safe cancellation release.
- HS256 JWT authorization, database-current RBAC, rotating single-use refresh sessions, replay detection, and immediate `authVersion` invalidation.
- Safe admin staff lifecycle, last-admin concurrency protection, secure invitation, password change, and enumeration-safe reset.
- Explicit HY/RU/EN content architecture with non-inventing versioned migration.
- Magic-byte media validation, MIME/extension agreement, pre-upload Cloudinary rollback intent, two-upload rollback, cleanup reconciliation, and reference-safe deletion.
- Before/after publication consent versioning, withdrawal, non-restorability, tombstone purge, and concurrency protection.
- Audit minimization/redaction, structured production logging, generic production errors, and safe monitoring payloads.
- Exact-origin/HTTPS/proxy/cookie validation, distributed Redis rate-limit support, liveness/readiness separation, and bounded graceful shutdown.
- Production Mongo index verification, non-dropping controlled creation, migration manifest/preflight tooling, backup/restore runbook, CI, and validated OpenAPI 3.1.
- Localhost/test-named Mongo isolation and automated-test fail-closed protection against real Cloudinary, Redis, SMTP, and monitoring contacts.
