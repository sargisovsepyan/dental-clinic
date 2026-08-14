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
3. Set `LEGACY_CONTENT_LOCALE` explicitly to `hy`, `ru`, or `en`, then run the default dry-run: `npm run migrate`.
4. Review counts, then run `npm run migrate -- --apply` with the same environment. Do not invent or infer legacy language.
5. Run `npm run production:indexes`. It scans duplicate data, calls declared non-dropping index creation, and verifies the resulting catalog. It never calls `syncIndexes()`.
6. Run `npm run production:preflight`. This is read-only and must exit zero.
7. Deploy API instances with graceful SIGTERM and the configured timeout.
8. Verify `/api/v1/health/live` is `200`; admit traffic only when `/api/v1/health/ready` is `200`.
9. Smoke-test login/refresh/logout with the production Origin, one public availability query, and a non-sensitive synthetic booking if clinic operations approve.
10. Monitor 5xx, readiness, Redis/Mongo connectivity, SMTP failures, and cleanup debt.

Production scripts require `NODE_ENV=production` and validated environment variables. They print safe status only; never paste URIs or secrets into command lines retained by shell history if the platform can inject them as environment variables.

## Scheduled operations

- Run `npm run reconcile:media` on a bounded recurring schedule (for example every few minutes); alert on `failed` cleanup jobs and sustained pending growth.
- Run the default dry-run `npm run reconcile:appointment-quota` regularly and after abnormal shutdowns; review before repair mode (`npm run reconcile:appointment-quota -- --apply`).
- Review inactive staff and revoke sessions during offboarding.
- Review audit retention, operational logs, backups, dependency alerts, and CodeQL findings.
- Repeat restore drills and credential rotation on the clinic-approved schedule.

## Rollback

Application rollback means redeploying the previous immutable commit/artifact. Do not roll database migrations back by deleting fields or dropping indexes during an incident. The migrations preserve legacy content and are idempotent; old application compatibility must be assessed before rollback. If data restoration is required, stop writes, preserve the failed database, follow the restore runbook into a separate target first, verify, and then perform an approved cutover.

If Redis is unavailable, production rate limiting fails closed; restore Redis rather than switching to per-process memory. If SMTP is unavailable, invitation/reset delivery fails safely but must be retried operationally. If Cloudinary deletion is unavailable, DB mutations remain authoritative and cleanup debt is retried. If Mongo is unavailable, readiness is `503` and traffic must not be admitted.

## Preflight pass criteria

The report must show: transaction-capable Mongo topology, no critical index failures, all migrations applied, at least one active setup-complete admin, exactly one clinic singleton, no public Armenian-content failures, no appointment/quota/consent invariant failures, and configured Redis/SMTP/Cloudinary/monitoring/consent integrations.
