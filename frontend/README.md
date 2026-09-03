# Dental clinic public frontend

Next.js 16 App Router frontend for the clinic’s Phase 1 public website. Armenian (`hy`) is the primary publication locale; Russian (`ru`) and English (`en`) are explicit routes with field-level Armenian fallback when an authored translation is absent.

## Scope

Implemented public routes:

- `/{locale}` — public landing page
- `/{locale}/services` and `/services/{slug}`
- `/{locale}/dentists` and `/dentists/{slug}`
- `/{locale}/clinic`
- `/{locale}/gallery`
- `/{locale}/before-after` and `/before-after/{id}`
- `/robots.txt`, `/sitemap.xml`, generated app icon, canonical links, and locale alternates

Booking UX, staff authentication, and administration are intentionally outside Phase 1.

## Requirements and setup

- Node.js 22+
- the backend contract at `../docs/openapi.yaml`
- a local backend or the deterministic mock API used by E2E tests

```text
npm ci
copy .env.example .env.local
npm run api:types
npm run dev
```

Environment variables:

- `NEXT_PUBLIC_API_URL` — credential-free absolute URL ending in `/api/v1`
- `NEXT_PUBLIC_SITE_URL` — credential-free public origin with no path
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` — optional public cloud name used to allow only that account’s managed image paths

Local development may use HTTP only on `localhost` or `127.0.0.1`. Production configuration must use HTTPS. Never put API credentials or Cloudinary API secrets in `NEXT_PUBLIC_*` variables.

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
- Ordinary editorial catalog fetches use a five-minute revalidation policy. Governed before/after list and detail reads are `no-store`, so consent withdrawal is not delayed by the frontend cache. Future authenticated, booking, and live-availability reads require separate no-store/client boundaries.
- The frontend never handles consent evidence or other governance metadata for before/after publications.

See `../docs/FRONTEND_ARCHITECTURE.md` and `../docs/FRONTEND_FOUNDATION_FINAL_REPORT.md` for the complete design and verification record.
