# Dental clinic frontend

Next.js 16 App Router frontend for the clinic’s public website, no-account booking flow, and authenticated Phase 3A staff appointment workspace. Armenian (`hy`) is the primary publication locale; Russian (`ru`) and English (`en`) are explicit routes with field-level Armenian fallback when authored public content is absent.

## Scope

Implemented public routes:

- `/{locale}` — public landing page
- `/{locale}/services` and `/services/{slug}`
- `/{locale}/dentists` and `/dentists/{slug}`
- `/{locale}/clinic`
- `/{locale}/gallery`
- `/{locale}/before-after` and `/before-after/{id}`
- `/{locale}/book` — fresh service/dentist eligibility, live availability, and idempotent public booking
- `/{locale}/staff/login`, `/forgot-password`, `/reset-password`, and `/setup-password`
- `/{locale}/staff` and `/account` — role-aware staff shell and password change
- `/{locale}/staff/appointments` and `/appointments/{id}` — admin/receptionist list, create, detail, status, reschedule, and cancellation
- `/robots.txt`, `/sitemap.xml`, generated app icon, canonical links, and locale alternates

Patient accounts, clinical records, and Phase 3B content/schedule/staff management remain intentionally out of scope. Public booking and staff operations never store patient details or bearer tokens in browser storage or URLs.

## LOCAL FRONTEND PREVIEW

The deterministic preview needs no MongoDB, backend process, Cloudinary, Redis, SMTP, Turnstile, or external network service:

```text
cd D:\projects\dental-clinic\frontend
npm run dev:preview
```

Open `http://127.0.0.1:3000/hy` for the public site or `http://127.0.0.1:3000/hy/staff/login` for staff. The launcher prints all local URLs, scenarios, and fake credentials. Press Ctrl+C to stop; it terminates only the child process it owns, closes its mock server connections, releases ports 3000/5000, and removes only its validated `.next-preview` cache.

Local-only staff accounts all use password `Preview123!`:

- `admin@preview.local`
- `reception@preview.local`
- `dentist@preview.local`

These accounts, their session tokens, and their patient fixtures exist only inside the deterministic mock module under `test/`; production code does not import them.

The default scenario returns available slots and a pending booking. Start another deterministic scenario, for example:

```text
npm run dev:preview -- --scenario=confirmed
npm run dev:preview -- --scenario=conflict
npm run dev:preview -- --scenario=empty-availability
npm run dev:preview -- --scenario=validation
npm run dev:preview -- --scenario=rate-limit
npm run dev:preview -- --scenario=error
```

While preview is running, the printed local scenario endpoint can switch between `success`, `pending`, `confirmed`, `conflict`, `empty-availability`, `validation`, `rate-limit`, `error`, `empty`, and `catalog-error` without source edits. All fixtures are development-only and are imported only by test/preview launchers.

Staff scenarios use the same local endpoint and add `staff-conflict`, `staff-stale-availability`, and `staff-expired`. The launcher also prints deterministic local-only setup/reset links.

## Requirements and setup

- Node.js 22+
- the backend contract at `../docs/openapi.yaml`
- a local backend, or use the one-command deterministic preview above

```text
npm ci
copy .env.example .env.local
npm run api:types
npm run dev
```

For real-backend mode, first configure and start `../backend` on port 5000 using its README and untracked `.env`, then create an untracked `.env.local` from `.env.example` and run the frontend commands above. Local frontend and backend challenge providers must agree; the example explicitly disables both for local development. This mode uses the real backend and therefore requires its configured local MongoDB. It must not be pointed at production or personal data for automated tests.

Environment variables:

- `NEXT_PUBLIC_API_URL` — credential-free absolute URL ending in `/api/v1`
- `NEXT_PUBLIC_SITE_URL` — credential-free public origin with no path
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` — optional public cloud name used to allow only that account’s managed image paths
- `NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER` — `disabled` for deliberate local/test use or `turnstile`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — public Turnstile site key, required when the provider is `turnstile`

Local development may use HTTP only on `localhost` or `127.0.0.1`. Production configuration must use HTTPS and Turnstile; startup/build fails when the production challenge provider or public site key is missing. Never put API credentials, the Turnstile secret, or Cloudinary API secrets in `NEXT_PUBLIC_*` variables.

## Quality gates

```text
npm run api:types
npm run typecheck
npm run lint
npm run test
npm run test:coverage
npm run build
npm run test:e2e
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=moderate
```

`test:e2e` starts a localhost-only Next.js server and mock API, uses a fresh `.next-e2e` cache for every run, blocks non-local browser requests, and removes its generated cache when complete. On Windows it terminates only the exact Next.js process tree it started.

## Important boundaries

- OpenAPI generates transport types; `src/api/public-view-models.ts` separately allowlists display data.
- Backend strings render as text, never as HTML.
- Unsafe, credentialed, non-HTTPS, or unapproved external URLs are rejected.
- Missing or unapproved Cloudinary images render accessible placeholders.
- Ordinary editorial catalog fetches use a five-minute revalidation policy. Governed before/after reads, booking eligibility/settings, and availability use dedicated `no-store` boundaries. Booking mutations use browser requests with omitted credentials and normalized errors.
- The frontend never handles consent evidence or other governance metadata for before/after publications.
- One UUIDv4 idempotency key belongs to one canonical booking attempt. Uncertain retries retain it; changed appointment data generates another key. The challenge token is deliberately excluded from request identity.
- The consent control is explicit and initially unchecked. Approved clinic privacy-policy text and a public policy URL have not been supplied and remain a deployment content requirement; the frontend does not invent either.
- Staff access tokens are memory-only. The refresh token remains in a backend-owned HttpOnly cookie; refresh/login/logout are single-flight/serialized around rotation, and `403` never masquerades as logout.
- Appointment mutations always send the reviewed `mutationVersion`, never auto-retry stale writes, and refetch authoritative state. Availability responses are bound to the selected version/service/dentist/date.
- Frontend role-aware navigation is convenience only. The backend remains authoritative for admin/receptionist appointment access and dentist denial.

See `../docs/FRONTEND_ARCHITECTURE.md`, `../docs/FRONTEND_FOUNDATION_FINAL_REPORT.md`, `../docs/FRONTEND_BOOKING_FINAL_REPORT.md`, and `../docs/FRONTEND_STAFF_ADMIN_FOUNDATION_FINAL_REPORT.md` for the complete design and verification record.
