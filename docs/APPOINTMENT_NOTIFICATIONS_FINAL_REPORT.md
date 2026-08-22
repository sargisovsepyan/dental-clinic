# Appointment Notifications Final Report

## Scope and repository state

- Starting commit: `9318b9215318664668398466cc4bcf6372c42a67` (`docs: finalize backend hardening report`)
- Dedicated branch: `codex/appointment-notifications`
- Backend root: `backend/`
- Feature scope: durable appointment email notifications, clinic new-booking mail, and 24-hour reminders; no patient accounts, medical records, payments, or live SMS provider were added.
- Push/merge status: nothing was pushed or merged.
- Commit status at report creation: the implementation is verified but uncommitted. The sandbox denied `.git/index` writes and the required approval escalation was unavailable because the app approval/usage quota was exhausted. HEAD therefore remains the starting commit and the worktree intentionally preserves all completed changes.

## Architecture implemented

Appointment mutations and notification scheduling use one MongoDB transaction. Booking never waits for SMTP:

1. The appointment, lock/quota/idempotency effects, and deduplicated notification jobs commit together.
2. The HTTP operation returns from the authoritative database result.
3. A separate `npm run worker:notifications` process atomically claims due or abandoned jobs.
4. The worker reloads authoritative appointment state, renders a minimal message, performs a final fresh lease/state/time fence, calls the injected channel adapter, and records the outcome.

The notification domain supports `email` and `sms` channels, but only email jobs are scheduled in this release. SMS remains an explicit unsupported adapter and active SMS jobs block production preflight, so adding an SMS provider later does not require appointment-service redesign.

### Modules added

- `backend/src/modules/notifications/notification.constants.js`
- `backend/src/modules/notifications/notificationJob.model.js`
- `backend/src/modules/notifications/notificationIntegrity.js`
- `backend/src/modules/notifications/notificationOutbox.service.js`
- `backend/src/modules/notifications/notificationWorker.service.js`
- `backend/src/modules/notifications/channels/channelRegistry.js`
- `backend/src/modules/notifications/templates/appointmentEmail.templates.js`
- `backend/src/mail/mail.validation.js`
- `backend/src/scripts/notificationWorker.js`
- `backend/src/migrations/20260822_011_appointment_notifications.js`

The appointment model now carries `scheduleRevision` and nullable `notificationLocale`. The booking-idempotency record carries a hash-version marker so active locale-free `v1` fingerprints replay safely across the locale-aware `v2` cutover.

## Appointment behavior

- Pending public booking: schedules `appointment_received`, clinic reception mail, and an eligible reminder.
- Auto-confirmed public booking: schedules `appointment_confirmed`, not a confusing received-plus-confirmed pair.
- Later `pending -> confirmed`: transactionally supersedes stale received/reschedule mail and schedules confirmation once.
- Material reschedule: allowed only for `pending` or `confirmed`; increments `scheduleRevision`, cancels the old reminder/lifecycle jobs, stores minimal immutable before/after occurrence snapshots, and schedules one reschedule message plus a replacement reminder when eligible.
- Exact-current occurrence reschedule: concurrency-fenced `200` no-op with no revision, history, lock, quota, or notification churn.
- Cancellation: atomically releases locks/quota, supersedes actionable patient jobs, and schedules cancellation once. A stale/CAS-losing cancellation has no outbox effect.
- Non-active status transitions: checked-in, in-progress, completed, no-show, and cancelled occurrences cannot receive reminders. Rescheduling is rejected once care has begun.
- Staff-created booking: no reception or creation-lifecycle mail; an eligible patient reminder and later lifecycle mail remain supported when an email and valid consent exist.

## Reminder semantics

Reminder due time is exactly `appointment.startAt - 24 elapsed hours`; host timezone is irrelevant. Clinic timezone is used only for presentation. A create/reschedule strictly inside the 24-hour window receives no late “24-hour” reminder; the exact boundary is eligible.

Immediately before SMTP, the worker requires the appointment to be confirmed, future, and still bound to the job's exact `scheduleRevision` and `startAt`. Cancellation or reschedule transactionally fences even a currently claimed reminder. Abandoned final-attempt leases become observable terminal failures rather than stuck work.

## Delivery, lease, and retry guarantees

- Unique `dedupeKey` provides exactly-once logical database scheduling.
- Claim uses one atomic `findOneAndUpdate`, fresh owner/token, attempts increment, and an expiring lease.
- Expired claims are prioritized ahead of new due backlog and can be reclaimed horizontally.
- Heartbeats and result writes are fenced by job ID, processing state, owner, token, and an unexpired lease.
- Rendering is followed by another heartbeat, fresh clock, job reload, appointment reload, eligibility check, and delivery-start CAS.
- Transient errors use durable bounded exponential backoff with deterministic jitter.
- SMTP 4xx envelope failures remain retryable; permanent 5xx rejection, authentication, invalid-message, and unsupported-channel failures terminate according to policy.
- Arbitrary provider error codes/responses are never persisted or logged; only fixed allowlisted codes, bounded categories, and a numeric SMTP response code are retained.
- Terminal jobs receive `purgeAt`; a TTL index removes them after the configured retention period.
- Idle polling removes abort listeners, does not busy-loop, and performs the expired-final-attempt sweep once per worker batch.
- SIGTERM/SIGINT stops new claims, lets current delivery settle, and enforces `GRACEFUL_SHUTDOWN_TIMEOUT_MS` as a tested hard deadline.

SMTP remains honestly at-least-once. A crash after provider acceptance and before recording `sent` may redeliver. The deterministic opaque `Message-ID` reduces duplicate risk but cannot make the external boundary exactly once. A narrow final database-CAS-to-provider-call race is unavoidable and documented.

## Email and localization

Centralized patient templates cover received, confirmed, rescheduled, cancelled, and reminder events in explicit `hy`, `ru`, and `en` copy. Armenian is the fallback only when a legacy row has no recorded locale; migration does not fabricate historical preference.

Subjects are fixed and PII-free. Dynamic fields are single-line normalized and HTML escaped. Messages contain no internal notes, comments, mutation reasons, consent evidence, arbitrary links, trackers, internal database IDs, or raw provider data. Clinic mail uses only the deployment recipient `CLINIC_NOTIFICATION_EMAIL`, never mutable public clinic content, and includes only the operationally necessary confirmation code, patient name/canonical phone, occurrence, service, and dentist.

The SMTP boundary rejects header injection and multiple-recipient strings. DNS, connection, greeting, and socket waits are explicitly bounded; production lease validation includes all of those phases plus safety margin. Automated tests fail closed without an explicit fake mail adapter.

## Privacy and security controls

- Jobs store no recipient address/phone, rendered text/HTML, comments, notes, consent evidence, secrets, tokens, or provider responses.
- Patient contact data is resolved only at send time.
- Logs contain notification/appointment identifiers and fixed operational categories, never patient email/phone/name.
- Provider error messages and arbitrary codes cannot enter the job record or structured logs.
- Templates escape untrusted values and use no untrusted URLs.
- No send/job administration endpoint, patient enumeration endpoint, or generic mail relay was added.
- Existing authentication, refresh replay defense, RBAC, production error redaction, six-character password minimum, and bcrypt 72-byte protection remain unchanged and green.
- Tests use disposable localhost databases and explicit fake adapters; no real SMTP, SMS, Cloudinary, Redis, Turnstile, monitoring, or production service was contacted.

## Migration, indexes, and preflight

Migration `20260822_011_appointment_notifications` is explicit, checksum-bound, lease-fenced, dry-run safe, idempotent, and never runs at startup. It:

- initializes only missing appointment `scheduleRevision` values to zero;
- records missing notification locale as `null` without overwriting a supported explicit locale;
- labels missing legacy booking fingerprint versions as `v1`;
- seeds only future reminders at least 24 hours away with a strict single-mailbox email, verified existing privacy evidence, valid occurrence snapshots, exact scalar revisions, and supported/null locale;
- rejects malformed/array-shaped candidates and hash versions before writes;
- never creates retrospective booking, status, reschedule, cancellation, or clinic mail and never invents consent.

Production index management now declares, duplicate-scans, creates non-droppingly, and verifies:

- `unique_notification_logical_event` — unique `dedupeKey`;
- `notification_due_claim` — actionable due/retry claims;
- `notification_expired_lease` — abandoned processing claims;
- `notification_appointment_reconciliation` — transactional appointment supersession;
- `notification_terminal_retention` — TTL on `purgeAt`.

Production preflight remains read-only. It validates exact scalar/static job identity, event/recipient combinations, revisions, attempts, snapshots, lease/state/retention metadata, strict actionable patient mailboxes, orphans, unsupported active SMS, exhausted jobs, and active leases. Expired well-formed leases are reported as recoverable metrics rather than creating a deployment deadlock. Raw arrays cannot exploit MongoDB multikey matching in the new notification or booking-fingerprint checks.

## Configuration and operations

Added configuration:

- `NOTIFICATIONS_ENABLED`
- `CLINIC_NOTIFICATION_EMAIL`
- `NOTIFICATION_WORKER_POLL_INTERVAL_MS`
- `NOTIFICATION_WORKER_LEASE_MS`
- `NOTIFICATION_WORKER_CONCURRENCY`
- `NOTIFICATION_MAX_ATTEMPTS`
- `NOTIFICATION_RETRY_BASE_SECONDS`
- `NOTIFICATION_RETRY_MAX_SECONDS`
- `NOTIFICATION_RETENTION_DAYS`

Production requires explicit notification enablement, complete TLS-safe SMTP settings, and the operational clinic recipient. Development defaults disabled. Relevant commands:

```text
cd backend
npm run worker:notifications
npm run migrate
npm run migrate -- --apply --release-artifact=<commit-or-image-digest> --operator-id=<operator-id>
npm run production:indexes
npm run production:preflight
```

Deploy the API and at least one independently supervised notification worker from the same immutable artifact/configuration. Follow the stopped-writer migration/index/preflight sequence in `docs/PRODUCTION_RUNBOOK.md`.

## Tests and verification

Final feature and regression suites include booking semantics, logical deduplication, v1/v2 replay, transactional rollback, exact/overlapping slot arbitration, reschedule/cancel/status races, old-lock/reminder preservation, reminder boundary/timezone behavior, claim contention, active/expired leases, backlog fairness, heartbeat loss, stale-time send fencing, provider crash windows, retries/exhaustion, graceful/forced shutdown, localization/escaping, fake-provider isolation, raw-shape migration/preflight failures, strict mailbox/consent checks, exact index options, and production configuration.

Fresh final evidence:

- `git diff --check`: passed (only existing line-ending conversion warnings).
- Syntax check: passed, 170 source files checked.
- Tracked-secret scan: passed, 180 tracked files checked; the complete modified/untracked change set was also scanned with the same credential/private-key patterns and had no findings.
- OpenAPI lint and contract drift: passed.
- Targeted pre-existing high-risk sweep: 196/196 passed (auth/refresh, RBAC, appointment locks/races/quota/timezone, media/Cloudinary rollback, preflight, production errors, database safety).
- Fresh-process stress: 5 iterations × 8 targeted race tests = 40/40 passed.
- `npm run verify`: passed, 286/286.
- Independent `npm test`: passed, 286/286.
- Independent `npm run test:coverage`: passed, 286/286.
- Final coverage: 92.41% lines, 83.27% branches, 89.22% functions.
- Failures: 0.

Live npm registry audits could not complete because the sandbox blocked the registry endpoint, and the required network escalation was unavailable after the app approval/usage quota was exhausted. No live-audit success is claimed. Offline cached evidence completed for both scopes:

- `npm audit --omit=dev --audit-level=moderate --offline`: 0 known vulnerabilities.
- `npm audit --audit-level=moderate --offline`: 0 known vulnerabilities.

A live runtime and full audit must be rerun in CI or an approved network environment before merge.

## Adversarial review conclusions

Three independent read-only reviewers and the primary review found no P1. Every reproduced P2 was fixed and regression-tested, including:

- exact-slot no-op/cancellation concurrency fencing;
- reschedule-state versus send-eligibility mismatch;
- array/multikey hash-version, migration, job-shape, and lease-shape bypasses;
- unsafe nonempty legacy/actionable mailboxes;
- arbitrary provider-code persistence/logging;
- expired-lease starvation;
- stale final fence and missing post-render heartbeat;
- idle abort-listener growth;
- repeated final-attempt sweeps;
- missing lost-heartbeat/fairness/shutdown regressions.

No unresolved P1/P2 notification defect was found after the fixes and final regression runs.

## Known limitations and external steps

- SMTP delivery is at-least-once across the provider/DB crash window.
- No live SMS provider is configured; SMS jobs remain disabled.
- Production must provision and verify SMTP credentials/sender DNS, MongoDB/Redis, hosting/TLS, backups/restores, monitoring/alerts, and secret-manager values.
- Clinic/product owners should review final HY/RU/EN operational copy before deployment.
- Live npm audits remain required because this environment supplied only offline advisory evidence.
- The completed work still needs logical Git commits once `.git/index` write approval is available; no history rewrite is needed.

## Commits and final status

No commit could be created in this run because `.git/index` is outside the writable sandbox and approval escalation was unavailable. This is an environment-control blocker, not an implementation/test failure. The verified worktree is intentionally preserved on `codex/appointment-notifications`; do not reset or discard it. Once approval is available, create logical code/tests and documentation commits, rerun the final staged-secret/status checks, and do not push.

At report creation:

- HEAD: `9318b9215318664668398466cc4bcf6372c42a67`
- Branch: `codex/appointment-notifications`
- Git status: intentionally dirty with the complete verified implementation and report
- Push/merge: not performed

## Verdicts

- **SAFE TO MERGE INTO MAIN: NO** — exact blocker: verified changes are not yet committed and live dependency audits were unavailable.
- **NOTIFICATION SUBSYSTEM PRODUCTION-READY: YES (code/architecture)** — deployment still requires the listed external infrastructure and a live audit.
- **BACKEND FUNCTIONALLY COMPLETE FOR CURRENT DENTAL-CLINIC SCOPE: YES**.
- **READY TO START FRONTEND AGAINST THIS API: YES** — use the documented additive `locale` booking field and current OpenAPI contract.

Nothing else in backend feature scope blocks frontend work. Before merging/deploying, commit the preserved work, run live audits/CI, and complete the external production setup.
