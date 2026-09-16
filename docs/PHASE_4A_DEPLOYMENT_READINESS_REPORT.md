# Phase 4A — Production Deployment Readiness & Architecture

Review date: 2026-09-17 (Asia/Yerevan). Local verification runtime: Node v24.14.1, npm 11.11.0, Windows. Supported deployment runtimes: patched Node 22 >=22.12 or Node 24; CI uses Node 22.

Status: Phase 4A code/configuration readiness COMPLETE. All required local verification gates passed. Product code is frozen and both implementation units are committed. Infrastructure provisioning, actual deployment, protected real-provider/gateway smoke and production certification remain later gates.

## Scope and baseline

Before changes, `main`, `origin/main` and HEAD were exactly `31263d48d88712cfb9150bb6b53ebec6461c2420`, with a clean worktree. Phase 3C2 was treated as complete, not restarted. Work remains on `feature/production-deployment-readiness`. Existing correct auth, RBAC, lock/quota/CAS, media/consent, notification and locale behavior was preserved; no patient accounts, medical records, billing or new product features were added.

This phase establishes code/configuration/read-only tooling and operational procedures. It provisions no infrastructure, deploys nothing, uses no real production credentials, and admits no production traffic. Local isolated smoke is not real-provider smoke, an actual TLS gateway test, a backup certification or a live-production claim.

## Audit and genuine corrective findings

The initial audit covered root Git/CI/lockfiles/examples/runbooks; backend server/app/config/middleware/auth/sessions/appointments/media/audit/notifications/utilities/scripts/tests; frontend configuration/transports/localization/routes/tests; and API/OpenAPI/security/architecture documentation. Existing critical index manifest, migration leases/checksums, durable outbox/reminder scheduling, media cleanup fencing and test provider guards were reused rather than duplicated.

| Finding | Correction and regression evidence |
| --- | --- |
| Arbitrary browser API origins could depend on third-party refresh cookies | Production frontend requires exact same-origin non-local HTTPS API/site; Strict cookies are not weakened. Environment tests and actual built-web secure cookie/session smoke. |
| Redis limiter initialization occurred on app import before Redis connection, retaining failed script promises | Lazy single-flight initialization, failed-initialization retry, original namespaces/protocol preserved. Fake script-load failure/recovery test and network-forbidden production app import. |
| API/worker could start without critical transactional/catalog/ledger prerequisites | Bounded read-only DB identity/topology/index/migration gate before listen/claim; production autoCreate and autoIndex both false. Good/bad identity, topology, missing index/ledger and stalled gate tests. |
| Worker cleared its forced-exit deadline before connection/report cleanup | Deadline covers complete cleanup; early signal/fatal handlers, listener removal and nonzero failure. Stalled cleanup, startup failure and hard deadline tests. |
| Signal during asynchronous worker sweep could allow another claim batch | Abort is checked again after sweep; regression proves no batch starts. Existing lease/heartbeat/fencing tests remain. |
| API cleanup/fatal handling and dependency probes could exceed intended wall bounds | Single-flight drain, fatal escalation, referenced overall shutdown deadline; bounded Mongo/Redis readiness and Redis command/quit, forced client destruction on failed quit. Focused hang/late-success/recovery/failure tests. |
| Mongo URL validation mishandled standard multi-host URIs and unsafe SRV TLS options | Installed driver's connection-free parser; verified TLS and explicit non-test/non-local DB; TLS bypass regressions and supported multi-host fixture. |
| Unsafe proxy/configuration/provider values and verbose debug output remained possible | Reject /0 proxy trust, local targets, unsafe cookies, insecure/credential-bearing integration URLs, common placeholder credentials and sensitive debug/inspector settings. Typed field-label-only errors. |
| Reserved fixture endpoints might be mistaken for a usable release | Full preflight/API/worker reject reserved example/test/invalid endpoints before service connection; config-only/build fixtures remain explicitly non-release. |
| Public/booking transport deadline ended at response headers | Deadline now includes stalled JSON bodies; cancellation listeners cleaned and no automatic mutation replay. 8s/12s stalled-body and cancellation regressions. |
| Raw request paths and malformed historical migration version/state values could enter logs/reports | Fixed process roles, route templates or `/unmatched`, redacted ledger labels and safe preflight failure stages. Actual production HTTP/log and historical-ledger privacy tests. |
| Frontend had no complete ordinary PR CI gate/Dependabot coverage | Added provider-free frontend drift/types/lint/coverage/build/E2E/audits and weekly frontend dependency updates; retained existing pinned backend/CodeQL gates. |

No unresolved application P1/P2 was identified by the completed code/configuration review. Later real-environment approval gates are listed below and are not silently waived.

## Deployment topology and actual process roles

One public HTTPS origin, with a fixed infrastructure edge routing `/api/v1/*` to private Express replicas and other paths to independently deployed Next.js replicas. No application reverse-proxy framework, open proxy, vendor deployment SDK or provider-specific hosting dependency was added. Frontend SSR public GETs use the same explicit public API URL and need outbound reachability to the edge.

- Frontend: immutable `npm ci` / `npm run build` artifact, then `npm start -- --hostname 0.0.0.0 --port <PORT>` from `frontend`.
- API: `node src/server.js` / `npm start` from `backend`, dynamic PORT, shared MongoDB and Redis. Horizontally scalable, with no embedded notification worker.
- Notifications: explicit `node src/scripts/notificationWorker.js` / `npm run worker:notifications`; MongoDB plus SMTP. Multiple workers use existing atomic leases, owner-token fencing and heartbeat; delivery remains at-least-once, not exactly-once.
- Cleanup: bounded explicit/scheduled `npm run reconcile:media -- --limit=50`, using existing durable reference/CAS cleanup locks. Operator supervision and alerts are required.
- Maintenance: explicit dry-run/apply/index/quota/preflight operator jobs. No invented reminder-enqueue daemon: due reminders are persisted transactionally and consumed after restart by the outbox worker.

Startup order is dependencies/configuration, approved backup/migration/index/preflight, API, worker, frontend, protected smoke, then traffic. Native standard Node roles were selected; Docker was evaluated but not added because an additional unverified packaging surface adds no current portability guarantee. A later container can package these same commands without rewriting business logic.

See [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) for role scaling, fixed-edge illustrative nginx contract, build/cache behavior and private hop requirements.

## Environment, browser auth and proxy boundary

[PRODUCTION_ENVIRONMENT.md](PRODUCTION_ENVIRONMENT.md) inventories backend schema inputs, maintenance/bootstrap inputs and exactly five application public frontend variables, with bounds/defaults/production requirements. Examples remain obvious development placeholders, never deployable secrets. Lockfiles changed only engine metadata; dependency versions were not changed. Password minimum remains EXACTLY 6 Unicode characters with the bcrypt 72-byte cap and no trimming.

Access token remains memory-only. Refresh cookie remains Secure, HttpOnly, Strict, host-only, path `/api/v1/auth`; login/refresh/logout enforce the original exact trusted Origin. Production browser API uses the site's exact HTTPS origin. Independent private infrastructure addresses never become browser API bases. Separate unrelated hosting origins are not accommodated by SameSite=None or weakened Origin checks.

The reviewed edge contract has fixed upstreams, preserves URI/status/multiple Set-Cookie/request IDs/credential semantics, strips attacker-supplied forwarding headers, enforces bounded body/inactivity limits, propagates aborts, avoids sensitive API caching and disables automatic upstream mutation replay. Only actual narrow trusted edge CIDRs are allowed; CORS is not a firewall. Direct API networking must be restricted. The illustrative config is not an installed TLS gateway and requires real-chain smoke after provisioning.

## Process lifecycle and health

API SIGTERM/SIGINT mark draining before cleanup, stop HTTP admission, reject new application work with standard-envelope503, wait for admitted requests within one configured deadline, disconnect Mongo/Redis and flush bounded error reports. Fatal startup/unhandled failure and failed/forced cleanup exit nonzero; a fatal event escalates an already-started clean drain. Worker stops new claims, permits current delivery to settle within the same complete-cleanup deadline, and leaves abandoned jobs recoverable by durable lease expiry. Platform kill grace must exceed the configured deadline. Native Next start requires platform drain/signal forwarding and bounded termination.

`/api/v1/health/live` and legacy `/health` are cheap dependency-free minimal liveness. `/api/v1/health/ready` is minimal200/503, with cached single-flight wall-bounded Mongo/Redis probes and immediate drain failure. No health call sends SMTP, Cloudinary, challenge or monitoring smoke requests. HTTPS/trusted proxy assumptions and readiness probe abuse limit remain enforced.

Technical logs use fixed role/event/request ID and safe route templates, never arbitrary URL/query/body/header data. Existing recursive redaction and generic production errors remain; business audit sensitive-data projection is unchanged. Infrastructure/web access logs need separately configured privacy discipline and retention.

## MongoDB, Redis and read-only preflight

MongoDB requires verified TLS, explicit approved database identity, transaction-capable topology, full critical unique/TTL/partial-index catalog and applied checksummed migration ledger. This includes appointment lock, atomic phone quota, replay/session/idempotency and outbox authority. Startup checks are read-only, wall-bounded15s, and fail before HTTP traffic or worker claims. Ordinary production startup creates neither collections nor indexes and runs no migration/repair.

Existing `npm run production:preflight` naming is retained. `--config-only` validates production mode, supported runtime and schema without network contact. Full mode explicitly rejects reserved fixture endpoints, then checks DB connectivity/identity/topology/catalog/ledger/business/outbox invariants and Redis connectivity, read-only with a90s deadline including cleanup. Full business preflight runs during the documented drained-write window; ordinary runtime startup uses only cheaper prerequisites. Output contains safe categories/booleans/counts, not credentials/URIs/stacks/raw malformed migration values. Critical failure exits nonzero.

CHECK and APPLY remain separate. Migrations default dry-run and require explicit approved drained-window evidence for apply. Existing explicit index command is non-dropping, with duplicate pre-scan; no syncIndexes or automatic conflict deletion. Redis is authenticated TLS, dedicated per-environment database/endpoint, required for shared production rate limits, not appointment lock authority. Namespaces/HMAC keys are unchanged. Connect/reconnect/command/health/quit behavior is bounded/fail-closed, without offline queue or memory fallback; operator smoke must verify scripting ACL/protocol support, not merely PING.

## Notification, SMTP, Cloudinary and Turnstile readiness

The durable outbox still commits with appointment mutations without synchronous SMTP dependence, schedules reminders transactionally, bounds retry/backoff/retention, fences stale claims and represents terminal failure safely. Staff setup/reset email is separate. Duplicate worker/crash/lease-expiry/abort tests remain; restart does not lose due work. No exactly-once email guarantee is claimed.

SMTP remains provider-portable with mandatory verified TLS and bounded transport/worker windows. Cloudinary remains the intentional existing media adapter: magic-byte/type/size checks, WebP normalization, public-ID/URL integrity, replacement CAS/reference ordering, durable rollback debt, before/after two-upload rollback, consent withdrawal and purge remain protected. Turnstile keeps existing server-side abstraction, required private production secret and public paired key, bounded fail-closed verification and hostname requirements.

[OPERATIONS.md](OPERATIONS.md) provides separately explicit synthetic Mongo/Redis, SMTP receipt, Cloudinary upload→authoritative verify→exact-asset deletion/finally cleanup and manual real-domain Turnstile procedures, with safe timeboxes, categorical evidence and failure/cleanup-debt gates. They were NOT executed against real services. Tests/ordinary CI/preview/health do not contact real Cloudinary, SMTP, Redis, monitoring or challenge providers.

## Statelessness, backups, releases and rollback

Runtime filesystem audit found bounded in-memory uploads, immutable migration checksum reads and reconstructible Next build/image/ISR caches, not local durable business state. Business authority remains MongoDB/Redis/Cloudinary. Test Mongo directories and test Next dist directories are disposable. No dumps, runtime uploads, logs, credentials, coverage or browser traces are staged. Backup/private-key ignore patterns were strengthened.

[BACKUP_RESTORE_RUNBOOK.md](BACKUP_RESTORE_RUNBOOK.md) defines named ownership/approval, encrypted protected off-service retention, recommended RPO<=15min/RTO<=4h (targets, NOT achieved guarantees), measured isolated restore drills, full replica-set compatible oplog tooling constraints and separate Cloudinary/withdrawal recovery authority. No backup/restore command was executed. No --drop or automatic restore is added.

[PRODUCTION_RUNBOOK.md](PRODUCTION_RUNBOOK.md) defines reproducible install/build, CI, secret/config provisioning, backup, read-only checks, explicit migration/index apply, role rollout, health, protected operator/browser/provider/booking/media/log checks and monitoring. Database compatibility is checked before application rollback; forward-only refresh/idempotency boundaries require compatible roll-forward or approved isolated restore/cutover, not imaginary DB reversal from old code.

## Adversarial review evidence

Missing/weak/shared secrets, malformed/credential-bearing origins, wildcard CORS, local/test DB targets, unsafe TLS, /0 proxy trust, spoofed forwarded HTTPS, unsafe cookies, unrelated browser API, reserved fixtures, debug/inspector output and preflight test mode are rejected by focused configuration/actual transport tests. Actual production-mode HTTP tests verify426 for plain/untrusted forwarding, allowed live200, minimal dependency-failed ready503, denied Origin403, generic internal500 and private path/secret suppression.

Standalone Mongo, missing/stale critical indexes, wrong DB identity and incomplete/malformed migration ledger fail read-only prerequisite/preflight tests. Redis offline/stall/recovery/script-load failures use fake clients only. Duplicate worker, killed/crashed claim owner, lease takeover, fatal startup, SIGTERM during sweep/delivery and hung cleanup use disposable DBs or injected dependencies. Body hangs/cancellation fail within deadlines without replay. Existing no-store/RBAC/refresh replay/CAS/lock/quota/timezone/media/audit tests remain in the final matrices. Bundle scan found no private environment-variable names or known fixture-secret/password strings in `.next/static`.

## Exact verification evidence

| Gate | Result |
| --- | --- |
| Backend `npm run verify` | PASS: syntax181 files, tracked-secret scan389 files, valid OpenAPI,320/320 tests;0 failed/cancelled/skipped. Coverage lines93.23%, branches83.97%, functions90.90%; required85/75/75. |
| Backend standalone `npm test` | PASS fresh post-browser-cleanup run320/320;0 failed/cancelled/skipped,160072.9207ms. |
| Backend config-only fixture CLI | PASS exit0: production_preflight_config_completed,ok=true,runtime/production_environment checks,providerContact=false. Good/missing-secret/test-mode regressions also passed. |
| Backend new deployment tests |17/17 included in final verify; supported URI, safe config/output, real transport, prerequisites, drain/deadlines, worker and lazy Redis. |
| Frontend `npm run api:types` | PASS; generated contract unchanged, drift check passes. Rerun after description-only OpenAPI correction also unchanged. |
| Frontend `npm run typecheck` / `npm run lint` | PASS / PASS (zero lint warnings). |
| Frontend `npm run test:coverage` | PASS191/191 in28 files;0 failed. Statements82.21% (1045/1271), branches81.97% (996/1215), functions88.36% (243/275), lines86.24% (903/1047); new body reader included. |
| Frontend new deployment tests |11/11 included: same-origin/public projection, seven local-target variants, body deadlines and cancellation. |
| Frontend `npm run build` | PASS actual optimized Next16.3.4 production build, supported public-only same-origin fixtures; no private provider credentials. |
| Frontend `npm run test:e2e` | PASS46/46 Chromium tests,11.9min,0 failed; HY/RU/EN, booking/auth/RBAC/CAS/governance/media/privacy/responsive/keyboard/axe checks. This suite uses Next dev fixtures, NOT production-build certification. |
| Actual production-build smoke | PASS compiled Next start + real isolated test-mode API/disposable Mongo replica set: health, SSR/API, production headers, secure Strict HttpOnly path-scoped login/refresh/logout, admin and booking. No real providers; actual API signal-handler cleanup exited0; owned ports released. |
| Four live dependency audits | Backend/frontend `npm audit --omit=dev --audit-level=moderate` and `npm audit --audit-level=moderate`: all exit0, each0 vulnerabilities. No dependency version changes. |
| Documentation/configuration checks | Valid backend/frontend workflow and Dependabot YAML,20 local documentation links including this report, exactly25 final verdicts, description-only OpenAPI lint/type drift, staged/unstaged whitespace checks; final tracked-secret scan390 files; no unexpected generated contract or private client-bundle findings. |

Verification history is not hidden: the first final backend verify found one obsolete assertion expecting an unknown migration version verbatim; the intentional safe-output label was asserted instead, its focused test passed1/1, and the necessary full verify rerun passed320/320. The first standalone run, concurrent with browser QA, returned307/309 with two failures (an auth test-file process failure and a5s maintenance child timeout). Available memory was about0.7GiB; cause of the test-file process failure was not proven. Focused auth rerun passed12/12. Browser cleanup restored >3GiB; the necessary full standalone rerun passed320/320 in160072.9207ms, including both formerly failing areas. No product code or dependency change was made to hide those failures.

Smoke boundaries: the web process is actual production build/start, but the real API deliberately uses guarded disposable test mode/memory limiter/disabled provider integrations. Separate production-mode config/HTTP/prerequisite failure regressions do not require services. Reserved-origin browser/preload routing blocks external requests; this is not real DNS/TLS/Redis/SMTP/Cloudinary/Turnstile smoke. On Windows IPC invokes the actual API SIGTERM handler; owned Next termination is bounded but does not certify POSIX/platform web drain. `.next` is retained as the ordinary reconstructible production build artifact. E2E ports3100/5100 were independently rebound successfully after exit; `.next-e2e` and `.next-preview` are absent. Final read-only ownership inventory found no isolated test web/API/Mongo/helper processes; the existing unrelated Windows MongoDB service (PID5704) was left untouched.

## CI and Git evidence

Existing pinned backend CI/CodeQL/security behavior retained; backend adds provider-free config-only fixture CLI. New pinned frontend CI gates npm ci, generated contract drift, types, lint, coverage, public fixture build, Chromium E2E and both audits. Frontend Dependabot added. No deployment automation or real provider secrets required. Local equivalent gates/YAML parsing were verified; this unpushed branch has NOT been run by remote Actions and does not inherit a false green claim from baseline main.

Implementation commits:

- `944f530` — `fix: harden production startup and dependency lifecycle`
- `820d4b2` — `fix: enforce first-party deployment and bounded browser requests`

Closing Git acceptance (checked after the final documentation/report commit): `feature/production-deployment-readiness`, clean worktree; `main = origin/main = 31263d48d88712cfb9150bb6b53ebec6461c2420`; no reset/restore/clean/rebase/amend/squash/history rewrite/push/merge. Third logical commit: `docs: define portable deployment architecture and release gates`. This report belongs to that final HEAD commit; its self-referential hash is intentionally not embedded here and is available in `git log` and the final handoff. Staged changes/secret/artifact/whitespace review precedes commit, and actual branch/ref/worktree checks follow it.

## Next phase: unresolved provisioning and real-environment gates

Choose providers/tiers independently of application architecture. Provision approved domains/TLS/fixed edge/private networks and actual narrow CIDRs; transaction-capable MongoDB with reviewed index/migration initialization; authenticated TLS Redis with limiter script support; supervised web/API/workers and cleanup scheduling; SMTP sender/reception routing and DNS reputation; Cloudinary account/retention; paired hostname-bound Turnstile keys; secret manager/rotation; monitoring/alerts/privacy/retention; encrypted backups and measured isolated restore drills. Obtain clinic/privacy/consent/policy approvals and real content/assets. Use actual public build values and inspect bundles.

Then run protected real preflight, gateway forwarding/cookie/status/body/no-replay checks, operator provider smoke with synthetic cleanup, real-domain browser auth/booking/admin/media/notification smoke and deployment shutdown/load/restart checks. Do not admit traffic until those gates pass. Phase 4A prepares that work; it does not claim it has already happened.

## Final verdicts

YES means the Phase 4A code/configuration/procedure requirement is complete, not that an unprovisioned provider or live system is certified. Merge safety is a verdict only: no merge or push was performed.

```text
DEPLOYMENT TOPOLOGY DEFINED: YES
PROVIDER-PORTABLE ARCHITECTURE PRESERVED: YES
PRODUCTION ENVIRONMENT CONTRACT COMPLETE: YES
BROWSER / API AUTH TOPOLOGY SAFE: YES
CORS / ORIGIN / COOKIE CONFIGURATION SAFE: YES
PRODUCTION PROCESS LIFECYCLE SAFE: YES
LIVENESS / READINESS COMPLETE: YES
MONGODB TRANSACTION / INDEX PREFLIGHT READY: YES
REDIS DEPLOYMENT CONTRACT READY: YES
NOTIFICATION WORKER DEPLOYMENT MODEL READY: YES
SMTP DEPLOYMENT CONTRACT READY: YES
CLOUDINARY DEPLOYMENT CONTRACT READY: YES
TURNSTILE DEPLOYMENT CONTRACT READY: YES
STATELESS FILESYSTEM REQUIREMENT SATISFIED: YES
PRODUCTION PREFLIGHT READY: YES
BACKUP / RESTORE RUNBOOK READY: YES
DEPLOYMENT / ROLLBACK RUNBOOK READY: YES
CI DEPLOYMENT-READINESS GATES COMPLETE: YES
NO REAL SECRETS COMMITTED: YES
FULL BACKEND VERIFICATION PASSED: YES
FULL FRONTEND VERIFICATION PASSED: YES
LIVE DEPENDENCY AUDITS CLEAN: YES
PHASE 4A COMPLETE: YES
SAFE TO MERGE PHASE 4A INTO MAIN: YES
READY FOR INFRASTRUCTURE PROVISIONING: YES
```
