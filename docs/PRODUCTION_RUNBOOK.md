# Production deployment runbook

## Required topology

Use an HTTPS edge/reverse proxy, one or more Node 22+ API instances, a transaction-capable MongoDB replica set or managed cluster with TLS, and a TLS Redis service for shared limits. SMTP and Cloudinary are required for the implemented staff/media features. An HTTPS monitoring webhook is required by production configuration.

The source tree deliberately does not contain provider credentials, certificates, DNS records, or backup activation. Store secrets in the hosting provider's encrypted secret manager and restrict access by least privilege.

## One-time provisioning gate

- Create DNS and TLS certificate; force HTTPS at the edge.
- Configure the exact proxy-hop count and preserve the original HTTPS scheme/client IP.
- Provision MongoDB with TLS, authentication, replica-set/managed transaction support, network restrictions, and provider monitoring.
- Provision Redis with TLS/authentication, persistence/availability appropriate to rate-limit state, and network restrictions.
- Create restricted SMTP credentials and verified sender/domain.
- Create restricted Cloudinary credentials and an account retention/backup policy.
- Create the monitoring endpoint with a reviewed data-processing/privacy agreement.
- Inject independent high-entropy JWT, phone-quota HMAC, and rate-limit HMAC secrets.
- Set exact HTTPS `CLIENT_URL`, `FRONTEND_URL`, and comma-separated `CORS_ORIGINS`; choose cookie domain/SameSite deliberately.
- Set and approve `BEFORE_AFTER_CONSENT_VERSION`.
- Enable real MongoDB backups and complete the restore drill in `BACKUP_RESTORE_RUNBOOK.md`.

## Deployment sequence

1. Confirm `npm ci`, `npm run verify`, both dependency audits, and CI pass on the release commit.
2. Take/verify a recoverable MongoDB backup or provider snapshot.
3. Set `LEGACY_CONTENT_LOCALE` explicitly to `hy`, `ru`, or `en`, then run the default dry-run: `npm run migrate`. Review all ten ordered migrations and any `ledger_attestation_required` result.
4. Before apply, remove all API instances from traffic, stop every API/background process that can write MongoDB, and verify zero application writers remain. Keep them stopped through migration, index verification, and preflight. Set `PRODUCTION_WRITES_DRAINED=true` only after that verification; the CLI declaration is not a substitute for draining infrastructure.
5. Review counts, then apply from the exact immutable release artifact with `npm run migrate -- --apply --release-artifact=<commit-or-image-digest> --operator-id=<operator-id>`. Apply first creates and verifies the three non-dropping unique indexes required for safe migration claims/replay upserts (ledger version, refresh replay token hash, and booking idempotency key) plus the booking-idempotency expiry TTL required before migration 008 can copy bounded replay snapshots; dry-run creates nothing. The runner then acquires an expiring per-version lease, heartbeats it, records the release artifact and failed attempts, verifies the normalized migration-source checksum, and makes stale source-document writes fail closed. A second operator must stop on an active lease; do not bypass or delete the ledger.
6. A checksum-less historical ledger row is never automatically trusted. Compare the database backup/deployment evidence with the exact release that originally applied it. Only after that manual verification, add `--attest-legacy-ledger-version=<version>` for each verified row; the ledger records who attested, when, and which release artifact was examined. Null/empty/corrupt states are blockers, not legacy rows.
7. If migration 002 or 006 reports unknown existing phone-quota key identity, stop and verify from retained deployment evidence that the configured secret originally produced those rows. Only then rerun apply with `--attest-phone-quota-key-version=vN`, using the configured version. Migration 002 rejects duplicate phone/day authorities before any write and establishes the identity without attestation only when no legacy quota rows exist. Never use attestation to make a new secret fit old rows.
8. Run `npm run production:indexes`. It scans duplicate data, calls declared non-dropping index creation, and verifies the resulting catalog. It never calls `syncIndexes()`.
9. Run `npm run production:preflight`. This is read-only and must exit zero.
10. Deploy API instances with graceful SIGTERM and the configured timeout.
11. Verify `/api/v1/health/live` is `200`; admit traffic only when `/api/v1/health/ready` is `200`.
12. Smoke-test login/refresh/logout with the production Origin, one public availability query, and a non-sensitive synthetic booking if clinic operations approve.
13. Monitor 5xx, readiness, Redis/Mongo connectivity, SMTP failures, and cleanup debt.

Production scripts require `NODE_ENV=production` and validated environment variables. They print safe status only; never paste URIs or secrets into command lines retained by shell history if the platform can inject them as environment variables.

## Scheduled operations

- Run `npm run reconcile:media` on a bounded recurring schedule (for example every few minutes); alert on `failed` cleanup jobs and sustained pending growth.
- Run the default dry-run `npm run reconcile:appointment-quota` regularly and after abnormal shutdowns; review before repair mode (`npm run reconcile:appointment-quota -- --apply`).
- Review inactive staff and revoke sessions during offboarding.
- Review audit retention, operational logs, backups, dependency alerts, and CodeQL findings.
- Repeat restore drills and credential rotation on the clinic-approved schedule.

## Rollback

Migrations 005 and 008 are forward-only compatibility boundaries: 005 moves consumed refresh-token replay authority out of the legacy session array, and 008 moves booking replay authority out of appointment fields. After either is applied, do not deploy an application artifact that predates the corresponding dual-read/new-collection implementation. Roll forward with the same or a newer compatible artifact. A rollback across that boundary requires the pre-migration snapshot/backup to be restored into a separate target, verified, and deliberately cut over; merely redeploying old code is unsafe. Do not reverse migrations by ad-hoc field/index edits during an incident.

For other application-only rollback, redeploying the previous immutable compatible artifact is acceptable after checking its schema contract. If data restoration is required, keep writes stopped, preserve the failed database, follow the restore runbook into a separate target first, verify, and then perform an approved cutover.

If Redis is unavailable, production rate limiting fails closed; restore Redis rather than switching to per-process memory. If SMTP is unavailable, invitation/reset delivery fails safely but must be retried operationally. If Cloudinary deletion is unavailable, DB mutations remain authoritative and cleanup debt is retried. If Mongo is unavailable, readiness is `503` and traffic must not be admitted.

## Migration inventory

The ordered manifest is: 001 localized content, 002 phone/day quota, 003 auth security fields, 004 before/after consent quarantine, 005 refresh-session lifecycle, 006 quota-key identity and appointment revisions, 007 corrective consent quarantine, 008 bounded booking-idempotency records, 009 clinic/dentist schedule revisions, and 010 removal of the unused legacy cancellation-notice setting. Migrations are explicit, dry-run capable, idempotent, and never invoked by application startup.

Migration 005 copies legacy replay hashes in bounded, ownership-verified chunks and conditionally updates only the unchanged source session. Migration 008 preserves the public booking replay shape while moving active legacy hashes into a separate TTL collection; missing/invalid `createdAt` is treated as expired rather than extending patient-name retention. Both are partial-failure rerunnable but remain forward-only application compatibility boundaries. Migration 009 initializes only missing revision fields and preserves existing nonzero revisions. Migration 010 removes a setting that never governed authorized staff cancellation; it does not add patient self-cancellation.

## Preflight pass criteria

The report must show: transaction-capable Mongo topology, no critical index failures, an applied/checksummed migration ledger with no unknown or failed versions, at least one active setup-complete admin with a usable bcrypt hash, exactly one clinic singleton in the configured timezone, valid schedule/booking revisions and appointment timestamps, no public Armenian-content failures, no appointment/quota/idempotency/consent invariant failures, and configured Redis/SMTP/Cloudinary/monitoring/consent integrations.
