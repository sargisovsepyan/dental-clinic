# Production environment contract

Authority: `backend/src/config/env.js`, password policy module, frontend `next.config.ts` / `src/lib/env.ts`, and explicit maintenance guards. `.env.example` is a DEVELOPMENT template, never a deployable release configuration. Inject real values through a secret manager, not committed files, shell history, images or `NEXT_PUBLIC_*`. Unknown backend variables are not exposed in the typed runtime projection. Never dump an environment to logs.

Use current patched Node 22 (>=22.12) or 24 and its supported npm; lockfile v3 + `npm ci`. Keep build/runtime Node major and public frontend values identical. Backend API/worker use `NODE_ENV=production`; development/test modes are not release substitutes. Test hooks refuse provider injection outside test mode and refuse real provider clients in tests. Password minimum remains EXACTLY 6 Unicode characters with the existing bcrypt 72-byte cap; no deployment setting changes that policy.

## Backend: all schema inputs

Defaults below are convenience values, not operator approval of legal/retention/security policy. Production-required means validation rejects missing/unsafe configuration. Shared validation applies to API, worker and maintenance roles, even where a role never actively connects to a configured provider.

| Variables | Contract / production requirement |
| --- | --- |
| `NODE_ENV`, `PORT` | production; port integer 1..65535, default5000 (platform-injected dynamic port accepted) |
| `MONGO_URI` | Required explicit non-test database, non-loopback hosts, verified TLS; standard SRV or multi-host URI. No TLS bypass options or placeholder credentials. Authentication/network least privilege configured by operator; special auth mechanisms remain portable. Never print URI |
| `JWT_SECRET`, `APPOINTMENT_QUOTA_SECRET`, `RATE_LIMIT_KEY_SECRET`, `AUDIT_PSEUDONYM_SECRET` | Required four independent, non-placeholder, high-entropy secrets >=48 characters and >=8 distinct characters. Generate cryptographically; character validation is not an entropy certificate |
| `JWT_EXPIRES_IN` | default15m, positive integer s/m/h, production <=1h |
| `REFRESH_TOKEN_TTL_DAYS`, `SESSION_ABSOLUTE_TTL_DAYS` | default7/30, ranges1..30/1..90; absolute >=idle |
| `APPOINTMENT_QUOTA_KEY_VERSION` | Explicit approved `vN` required; changing HMAC/version requires controlled ownership/migration procedure, NOT arbitrary rotation |
| `APPOINTMENT_PRIVACY_POLICY_VERSION`, `BEFORE_AFTER_CONSENT_VERSION` | Explicit approved YYYY-MM[.N] values required; default2026-01 does not create consent evidence |
| `BOOKING_IDEMPOTENCY_TTL_HOURS` | default24,1..168; approve patient-name replay retention |
| `CLIENT_URL`, `FRONTEND_URL`, `CORS_ORIGINS` | Exact non-local HTTPS origins, no paths/credentials/wildcards; both URL origins listed in allowlist. Recommended all equal the single public origin. Extra origins require reviewed first-party browser semantics; do not authorize unrelated hosting origins |
| `REQUIRE_HTTPS`, `TRUST_PROXY_CIDRS`, `TRUST_PROXY_HOPS` | Production HTTPS=true and explicit narrow actual proxy CIDRs; reject `/0`; aliases/IP/subnets syntactically supported but operator must match real chain. Hop fallback default1 (0..10) is NOT used when CIDRs present |
| `REFRESH_COOKIE_SECURE`, `REFRESH_COOKIE_SAME_SITE`, `REFRESH_COOKIE_DOMAIN` | true, strict, empty/host-only in production. Path is code-fixed `/api/v1/auth`, HttpOnly always |
| `API_REPLICA_COUNT`, `RATE_LIMIT_STORE` | default1,1..1000; production redis only, never per-replica memory fallback |
| `REDIS_URL` | Required authenticated rediss URL; non-loopback, numeric logical DB path, no query/fragment or placeholder password. Dedicated environment database/endpoint; Redis Cluster needs dedicated endpoint + DB0 |
| `REDIS_CONNECT_TIMEOUT_MS`, `REDIS_COMMAND_TIMEOUT_MS` | default5000/2000;100..30000/100..10000. Offline queue disabled; reconnect bounded backoff100..3000ms; commands fail closed on outage/stall |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Required complete configuration, non-local host (not URL), no placeholder credentials, single valid sender mailbox. Defaultport587,1..65535; verified sender/domain configured externally |
| `SMTP_SECURE`, `SMTP_REQUIRE_TLS` | defaultfalse/true; require implicit TLS (usually465) OR mandatory STARTTLS (usually587), never opportunistic insecure SMTP |
| `SMTP_CONNECTION_TIMEOUT_MS`, `SMTP_SOCKET_TIMEOUT_MS` | default5000/15000;100..30000/1000..120000; connection window also bounds DNS/greeting |
| `NOTIFICATIONS_ENABLED`, `CLINIC_NOTIFICATION_EMAIL` | Explicit true + safe single reception mailbox required. Operational routing is NOT public editable clinic contact content |
| `NOTIFICATION_WORKER_POLL_INTERVAL_MS`, `NOTIFICATION_WORKER_LEASE_MS`, `NOTIFICATION_WORKER_CONCURRENCY` | default2000/120000/4;100..60000/10000..600000/1..20; lease >3*SMTPconnection+SMTPsocket+5000 |
| `NOTIFICATION_MAX_ATTEMPTS`, `NOTIFICATION_RETRY_BASE_SECONDS`, `NOTIFICATION_RETRY_MAX_SECONDS`, `NOTIFICATION_RETENTION_DAYS` | default8/60/21600/30;1..50/1..86400/60..604800/1..365; base<=max; terminal retention approved |
| `CLINIC_TIMEZONE` | defaultAsia/Yerevan; valid IANA zone, must match persisted clinic singleton/occurrences. Do not change timezone casually at deployment |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Required complete non-placeholder credentials; cloud name letters/digits/_/-. Same public cloud name in frontend if managed images enabled; key/secret backend-only |
| `MEDIA_CLEANUP_MAX_ATTEMPTS`, `MEDIA_CLEANUP_BACKOFF_BASE_SECONDS`, `MEDIA_CLEANUP_BACKOFF_MAX_SECONDS` | default8/60/86400;1..50/1..86400/60..604800; base<=max |
| `MEDIA_CLEANUP_REFERENCE_RETRY_SECONDS`, `MEDIA_CLEANUP_STALE_LOCK_SECONDS` | default3600/900;60..604800/60..86400; durable reference guards/lease debt remain authoritative |
| `INVITE_TOKEN_TTL_MINUTES`, `RESET_TOKEN_TTL_MINUTES` | default1440/30;5..10080/5..1440; staff credential flows use SMTP, not appointment outbox |
| `PUBLIC_BOOKING_CHALLENGE_PROVIDER`, `PUBLIC_BOOKING_CHALLENGE_SECRET`, `PUBLIC_BOOKING_CHALLENGE_TIMEOUT_MS` | Production turnstile + non-placeholder secret>=20; defaulttimeout2000,100..10000; frontend public key paired with secret and hostname allowlist |
| `LOG_LEVEL`, `ERROR_MONITOR_WEBHOOK_URL` | defaultinfo (debug/info/warn/error); production requires credential-free HTTPS webhook, no query/fragment or loopback. Minimal safe payload,3s delivery deadline, bounded100 pending reports; no new vendor |
| `HEALTH_CHECK_TIMEOUT_MS`, `READINESS_CACHE_MS`, `READINESS_FAILURE_CACHE_MS` | default1500/3000/1000;100..10000/100..30000/100..10000; health deadline covers complete dependency probes |
| `GRACEFUL_SHUTDOWN_TIMEOUT_MS` | default15000,1000..120000; platform grace MUST exceed it; configure above safe in-flight SMTP window when appropriate |

Mongo network selection/connect/socket timeouts are code-bounded at10s; startup prerequisite checks at15s. Full preflight has90s wall deadline including cleanup. No timeout is permission to bypass consistency or replay an uncertain mutation.

## Maintenance/bootstrap inputs (not web features)

`LEGACY_CONTENT_LOCALE` is explicit hy/ru/en only for migration attribution; never fabricate translations. `PRODUCTION_MAINTENANCE_ACK=confirmed-backup-and-write-window` acknowledges the reviewed target/backup. `PRODUCTION_WRITES_DRAINED=true` is required for migration apply only after all writers actually stop. `--release-artifact` and `--operator-id` provide apply evidence. Attestation arguments require independent retained provenance, never convenience. `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_BOOTSTRAP_ACKNOWLEDGED=true` are bootstrap-only; remove after controlled first admin creation. Never run bootstrap at startup or print passwords. See existing runbook for exact ledger/quota attestations.

## Frontend: exactly five application public inputs

| Variable | Contract |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Required approved exact non-local HTTPS site origin; canonical/sitemap/robots source |
| `NEXT_PUBLIC_API_URL` | Required credential-free absolute HTTPS URL `<same site origin>/api/v1`, no query/fragment; edge fixed upstream configured separately |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Optional public account name; managed images otherwise placeholders. No key/secret. Operator must match backend account |
| `NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER` | Production turnstile; disabled only isolated test/development |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Required public key when enabled, paired to backend secret; exact approved hostnames in provider dashboard |

These are inlined at BUILD time and public. Changing them requires rebuilding/releasing the web artifact, not merely restarting with different values. `PORT`/CLI port is a runtime listener setting; `NODE_ENV=production` is runtime/build mode; `NEXT_TELEMETRY_DISABLED=1` disables framework telemetry. `NEXT_DIST_DIR` selects a reviewed build directory (default.next); `.next-preview`/`.next-e2e` belong only to test launchers. No private application server variable or provider SDK is needed in frontend. Same-origin API upstream is in edge configuration, not `src/proxy.ts`.

CI uses reserved `https://clinic.example.test` site/API and `public-config-only-key` solely to verify build/config without providers. Those public values are intentionally permitted BUILD fixtures; they are NOT a release or provider-valid configuration. The protected release checklist must replace them, verify actual DNS/key pairing, and inspect client bundles for private secrets. `productionConfigCheck.js` synthesizes backend fixtures and invokes ONLY `--config-only`; never deploy its values or run full network preflight with them.

Full backend preflight and API/worker startup explicitly reject reserved example/test/invalid service endpoints before connection; config-only intentionally permits syntactic fixtures and is not a release endpoint certificate. Production rejects DEBUG/NODE_DEBUG and NODE_OPTIONS inspector flags to prevent library-level sensitive debug output. Standard Node private CA configuration, if required, must be operator-managed read-only trust material outside Git/images with reviewed ownership; it never becomes business state or a public frontend variable.
