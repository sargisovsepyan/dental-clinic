# Frontend foundation final report

Date: 2026-09-03
Branch: `codex/frontend-foundation`
Baseline: `4ccab37 feat: add production appointment notifications`

## Outcome

Phase 1 now provides a production-oriented public Next.js website for Armenian, Russian, and English. It covers the landing page, services, dentists, clinic/contact information, gallery, and governed before/after publications, with responsive layouts, localized SEO, safe media handling, deterministic failure states, and an OpenAPI-derived typed API boundary.

No booking form, staff authentication, admin UI, medical-record feature, unapproved provider integration, or invented clinic/consent content was added.

## Delivered foundation

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, self-hosted Armenian-capable fonts
- explicit `/hy`, `/ru`, and `/en` routes with Armenian primary fallback and language annotations
- public collection and detail routes for all Phase 1 content
- generated OpenAPI transport types plus separately allowlisted display models
- bounded public API fetch client with normalized non-sensitive errors
- safe Cloudinary, social, map, telephone, and email URL handling
- accessible missing-image placeholders and no raw HTML interpretation
- responsive header/footer, keyboard mobile navigation, loading, empty, error, 404, and fallback states
- canonical URLs, three locale alternates, sitemap, robots, generated icon, and local social preview asset
- production response headers and startup-time environment validation
- deterministic unit, coverage, accessibility, and browser tests

## Backend change made during the frontend phase

The public before/after list and detail projection previously returned internal consent and publication-governance fields even though `API_CONTRACT.md` stated that public clients receive no consent evidence. The frontend phase therefore made one justified backend correction:

- public projections now positively allowlist only the documented public case fields, excluding consent status/method/reference, policy version, confirmation timestamp, publication status, withdrawal/purge timestamps, private audit fields, and future internal fields by default;
- admin/storage behavior and consent enforcement remain unchanged;
- OpenAPI now describes the precise minimized public list/detail schemas;
- the human contract names the omitted governance fields;
- a regression test checks both list and detail responses and proves the fields are absent.

This is a privacy-minimizing compatible response change. It does not weaken the stored consent model or publication checks.

## Verification evidence

Frontend:

- `npm run api:types` — passed; generated from the validated repository OpenAPI document
- `npm run typecheck` — passed
- `npm run lint` — passed with zero warnings
- `npm run test:coverage` — 8 files, 44 tests passed
- explicit unit-boundary coverage — 92.30% statements, 86.69% branches, 96.77% functions, 93.82% lines
- `npm run build` with HTTPS production origins — passed
- `npm run test:e2e` — 8 Chromium tests passed
- E2E responsive matrix — 375, 430, 768, 1024, and 1440 px across HY/RU/EN, with no horizontal overflow or console faults
- representative axe scan — no serious or critical violations
- `npm audit --omit=dev --audit-level=moderate` — 0 vulnerabilities
- `npm audit --audit-level=moderate` — 0 vulnerabilities

Vitest coverage gates the explicitly testable API, localization, environment, URL-safety, and reusable state/media component boundary. App Router page composition and metadata are verified through E2E/build tests and are not represented in the unit-coverage percentages.

Backend and contract:

- focused media/before-after regression — 33/33 tests passed
- `npm run verify` — syntax 170 files, tracked-secret check 194 files, OpenAPI lint passed, 286/286 tests passed
- backend coverage — 92.47% lines, 83.21% branches, 89.34% functions
- the full suite includes exact-slot and overlapping-slot races, booking/reschedule/cancellation races, lock preservation/release, unique indexes, timezone boundaries, state transitions, auth/refresh rotation, RBAC, audit sanitization, production errors, isolated database guards, fake Cloudinary enforcement, replacement/deletion ordering, and both before/after upload rollback paths

## Manual browser review

The rendered application was inspected in the local in-app browser against the deterministic mock API at all required breakpoints. The review confirmed the HY mobile landing page, settled keyboard mobile sheet, RU tablet services page, EN dentist detail, and HY wide before/after detail. It verified language markers, one `h1`, desktop navigation activation, accessible missing-image presentation, focus styling, and no horizontal overflow.

The review also found and corrected these issues before this report:

1. invalid 27-character mock IDs had allowed a detail-route test to pass on a 404 page;
2. the reusable before/after card hard-coded `h3`, leaving its detail page without an `h1`;
3. a shared development cache made stateful E2E scenarios order-dependent, so the runner now uses a fresh isolated cache per run.
4. the frontend’s five-minute cache could retain a withdrawn before/after publication, so all governed case reads are now `no-store`.
5. collection pagination and sitemap generation exposed only the first result page; navigation and complete page traversal are now implemented.
6. fallback-language markers, dentist heading levels, and missing-media aspect ratios were incomplete in several reusable surfaces.
7. managed Cloudinary URLs required stronger port/query/fragment, format, and public-ID matching checks.

## Security and privacy assessment

No known unresolved critical or high frontend code issue remains. A read-only QA review identified the consent-withdrawal cache as high severity; the final code closes it with `no-store` reads and regression coverage. Browser-visible configuration contains no credentials. Raw backend messages and arbitrary URLs are not rendered. Public before/after governance data is minimized at both API and view-model boundaries. Automated browser tests cannot reach real external providers.

This code verdict is not evidence that production DNS/TLS, provider accounts, secrets injection, backups, monitoring, or approved clinic content/assets have been provisioned.

## Known limitations and next phase

- Booking UX, live availability, idempotent submission, privacy consent capture, and confirmation states remain Phase 2.
- Staff authentication and content administration remain Phase 3.
- Deployment must provide the real HTTPS origins and approved Cloudinary cloud name; absent media intentionally remains a placeholder.
- The included social preview and icon are generic clinic assets because no authoritative brand package was supplied.
- CSP uses `unsafe-inline` for current Next.js/Tailwind compatibility; a nonce/hash design is a future hardening option.
- Production-only HSTS/CSP branches are exercised through the exact pure builder consumed by `next.config.ts`; Playwright intentionally runs the isolated development server rather than claiming a deployed-edge HTTP smoke test.
- Request-time locale detection emits the correct document language. Ordinary editorial fetches are revalidated for five minutes, while consent-governed before/after reads are `no-store`. Live/authenticated data must likewise use purpose-built no-store boundaries.
- Real approved-account Cloudinary delivery remains a deployment smoke test; automated tests deliberately use blank Cloudinary configuration and blocked external requests.
- Final deployment should add real-device and assistive-technology smoke tests plus infrastructure-level performance monitoring.

## Definition of Done

SAFE TO MERGE FRONTEND FOUNDATION INTO MAIN: YES

FRONTEND FOUNDATION PRODUCTION-QUALITY: YES

PUBLIC WEBSITE PHASE 1 COMPLETE: YES

READY TO IMPLEMENT BOOKING UX: YES

BACKEND CHANGED DURING FRONTEND PHASE: YES — public before/after responses were minimized to remove consent/governance metadata, with list/detail regression coverage and a fully passing backend verification suite.
