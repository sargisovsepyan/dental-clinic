# Deployment architecture (Phase 4A)

This is a provider-portable deployment contract, not a provisioned or certified production installation. Infrastructure, domains, certificates, credentials, provider smoke and backup certification are later gates.

## One browser origin, independently deployable processes

```text
Browser -> https://clinic.<approved-domain>
                |
          fixed HTTPS edge
            /api/v1/* -> private Express API replicas
            everything else -> Next.js web replicas

API -> MongoDB replica set / transaction-capable cluster
    -> authenticated TLS Redis (shared rate limits)
    -> HTTPS Cloudinary / Turnstile / monitoring; SMTP for staff credentials
Notification workers -> same MongoDB + SMTP + monitoring
Explicit scheduled cleanup command -> MongoDB + Cloudinary
```

Production frontend configuration requires the site and browser API to share an exact non-local HTTPS origin. On Vercel, `next.config.ts` installs one external rewrite from `/api/v1/:path*` to the server-only, build-time `API_UPSTREAM_ORIGIN`; no other namespace is proxied. `src/proxy.ts` remains localization middleware, NOT an API gateway. There is no application open proxy or user-selected upstream. The API upstream is explicit fixed deployment configuration, never a `NEXT_PUBLIC_*` credential or browser-controlled URL. Server-rendered public GETs use the same public API URL and traverse that fixed edge route; reserve capacity for the extra hop. Do not route `/api/v1/*` into a Next.js page or route handler.

Separate infrastructure domains can be cross-site and make refresh depend on third-party cookies. HTTPS sibling subdomains can be same-site but are still different origins; this design deliberately does not depend on that distinction. `credentials: include` cannot override browser cookie policy. Do not switch to `SameSite=None` to accommodate hosting domains. See [MDN third-party cookie guidance](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies) and [site definition](https://developer.mozilla.org/en-US/docs/Glossary/Site).

Refresh is host-only, Secure, HttpOnly, `SameSite=Strict`, `Path=/api/v1/auth`. Bearer access tokens remain memory-only. Login/refresh/logout require the original trusted browser Origin. The edge must not replace Origin with the internal upstream origin or log cookies/tokens. Direct API network access is restricted to trusted edges and operators; CORS is not a firewall. Missing Origin is rejected on credentialed auth in production. Bearer endpoints still enforce current DB authorization and RBAC.

## Process contracts

| Role | Command (working directory) | Required active services | Scaling / supervision |
| --- | --- | --- | --- |
| Frontend | `npm start -- --hostname 0.0.0.0 --port <PORT>` (`frontend`) after `npm ci` + `npm run build` | Fixed public HTTPS API; approved media/challenge hosts in browser | Stateless replicas of the SAME immutable build; supervise, bounded platform drain |
| API | `npm start` (`backend`); `node src/server.js` for direct signal propagation | MongoDB + Redis; provider adapters used only by requested features | Multiple replicas share DB locks, quotas and Redis limits; no embedded worker |
| Notifications | `npm run worker:notifications` (`backend`); direct `node src/scripts/notificationWorker.js` | MongoDB + SMTP | One or more workers; atomic leases, token fencing, heartbeat; not singleton |
| Media cleanup | Explicit bounded `npm run reconcile:media -- --limit=50` (`backend`) | MongoDB + Cloudinary | External operator scheduler; existing durable CAS cleanup locks prevent unsafe overlap |
| Maintenance | Explicit migration/index/preflight/quota commands | Their documented dependencies | Controlled operator job; migrations require stopped writers and leased ledger |

All backend roles validate the common production configuration; worker does not establish a Redis connection even though shared configuration requires a Redis URL. No hidden reminder-enqueue daemon exists: appointment transactions persist reminder due times and migration 011 explicitly handles eligible legacy reminders. The continuously supervised outbox worker polls those durable jobs after restart. No new queue, scheduler, or vendor SDK is needed.

Startup: infrastructure/config -> explicit backup/migrations/indexes/preflight -> API -> notification workers -> frontend -> checks/smoke -> traffic. API and notification worker run bounded, read-only topology/catalog/migration/DB-identity checks before listening or claiming; startup never applies migrations or creates production collections/indexes. Full preflight checks business invariants separately during a drained-write window. API also connects Redis before listening. Fatal startup exits non-zero. SIGTERM/SIGINT stop HTTP admission/job batches and retain one deadline through DB/Redis/report cleanup; expired abandoned notification leases are recoverable, not lost. SMTP delivery is at-least-once, NOT exactly-once.

## Fixed edge contract

Use any standards-compatible gateway. The following nginx excerpt illustrates a direct public TLS edge, not a deployable certificate/config bundle. Replace the fixed upstream endpoints and approved server name ONLY in reviewed infrastructure configuration. A preceding load balancer requires a separately reviewed real-IP/trust chain; never trust arbitrary internet forwarded headers.

```nginx
upstream clinic_api { server api.internal:5000; }
upstream clinic_web { server web.internal:3000; }
server {
  listen 443 ssl;
  server_name clinic.example.test; # illustrative, never a release hostname
  # Install approved certificate/key OUTSIDE the repository.
  client_max_body_size 11m; # 2 x 5 MiB images plus bounded multipart overhead
  client_body_timeout 15s;
  location ^~ /api/v1/ {
    proxy_pass http://clinic_api; # fixed target; preserve URI
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host "";
    proxy_set_header Forwarded "";
    proxy_set_header X-Request-ID ""; # API generates authoritative request IDs
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
    proxy_next_upstream off; # NEVER replay mutations
    proxy_intercept_errors off;
    proxy_redirect off;
    proxy_buffering off;
    proxy_cache off;
    proxy_ignore_client_abort off;
  }
  location / {
    proxy_pass http://clinic_web;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 5s;
    proxy_read_timeout 30s;
    proxy_next_upstream off;
    proxy_buffering off;
    proxy_cache off;
    proxy_ignore_client_abort off;
  }
}
```

Do not hide/rewrite `Set-Cookie`, status, `X-Request-Id`, `Retry-After`, or rate-limit headers. Keep individual Set-Cookie fields, not comma-joined strings. Never cache auth, booking, staff, consent-sensitive media or API errors. Keep API's 100 KiB JSON limit and upload's 5 MiB/file, 2-file/25-part bounds; a larger edge limit does not relax application limits. Edge timeouts bound inactivity; client whole-request/body deadlines are independently 8 s public GET, 10 s availability, 12 s booking and the staff transport's existing bounds. An aborted request may already have committed: refetch/reuse the reviewed idempotency/CAS protocol, never auto-replay a mutation at the edge. Actual gateway configuration/TLS/header preservation must be smoke-tested after provisioning. See [nginx proxy semantics](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

Trust only the actual edge IP/CIDRs (`TRUST_PROXY_CIDRS`); `/0` is rejected. Private API HTTP upstream is acceptable only on an access-restricted private hop; use verified TLS if crossing networks. Strip inbound forwarding headers at the first trusted edge, preserve original client IP and HTTPS, and test spoofed forwarded headers through the complete real chain. An Internet-accessible API plus overly broad private-range trust is not approved. Do not use `trust proxy=true` or rely only on hop counts.

## Native runtime and statelessness

Native standard Node processes are selected: existing lockfiles and direct Node entrypoints already provide portability and correct signal ownership. A Dockerfile would add an unverified packaging surface without changing these guarantees; none is added. A later container can package the identical role commands without changing business logic. Use current patched Node 22 (minimum 22.12) or Node 24, npm lockfile v3, `npm ci`, separate immutable web builds, production mode, dynamic PORT and process supervision. CI uses current Node 22.

API business state is exclusively MongoDB/Redis/Cloudinary. Multer holds bounded uploads in memory; there are no runtime business-data filesystem writes. Migration code reads immutable source files for checksums. Next.js `.next`, image/ISR/in-memory caches are reconstructible build/cache state, never patient or auth authority. Public editorial reads may remain stale for five minutes across replicas; sensitive/booking/staff reads are no-store. Preserve the same build/assets during rolling releases and purge/drain old frontend artifacts safely. There are currently no Server Actions requiring a shared encryption key. Test Mongo data directories and `.next-e2e`/`.next-preview` are disposable test-only state, with owned cleanup. No durable uploads, dumps, log files or secrets belong on app disk or in Git. Cold starts and delayed workers do not weaken transactional admission or durable due jobs.
