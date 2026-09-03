# Frontend architecture

## Purpose and scope

The `frontend/` application is the public presentation and no-account booking layer for the dental clinic. It publishes clinic information, services, dentists, gallery media, and already-approved before/after cases, and it creates public appointment requests through the authoritative backend. It does not provide patient accounts, authenticate staff, administer content, or store clinical records. Staff administration belongs to Phase 3.

The frontend consumes only `/api/v1` public endpoints described by `openapi.yaml`. It does not connect directly to MongoDB or any provider SDK.

## Stack

- Next.js 16.3.4 App Router and React 19.2.8
- TypeScript in strict mode
- Tailwind CSS 4 with a small set of shadcn/Base UI primitives
- self-hosted Noto Sans Armenian and Noto Serif Armenian font packages
- `openapi-typescript` generated transport types
- Vitest, Testing Library, axe-core, and Playwright

No analytics, third-party fonts, client data cache, global state store, calendar package, or form library is included.

## Route and component structure

Every public content route is nested under `[locale]` and accepts only `hy`, `ru`, or `en`. The root route redirects to `/hy`. Unsupported locales and missing canonical records use the not-found boundary.

The locale layout owns the shared header, footer, skip link, and clinic identity/contact data. Page modules own data acquisition and metadata. Reusable display components receive already-minimized view models rather than raw API records. `/{locale}/book` server-fetches fresh booking eligibility/settings, then hands a minimized configuration to one focused Client Component for availability and submission state.

The root layout reads the locale set by `proxy.ts` so the server emits the correct `<html lang>` value. This makes the route shell request-time rendered. Ordinary editorial API GETs remain explicitly revalidated for five minutes; governed before/after reads and booking eligibility/settings are `no-store`.

## Data flow and contract boundary

```text
OpenAPI contract
  -> generated TypeScript transport types
  -> one server-side public GET client
  -> explicit safe display view models
  -> server-rendered route components
```

`src/api/public-client.ts` is the only public API transport boundary. It permits only fixed relative paths, constructs query parameters through `URL`, sends no browser credentials, enforces an eight-second timeout, and normalizes network, timeout, HTTP, protocol, and configuration failures into `PublicApiError`. Raw backend error messages never reach the rendered UI. Safe request IDs may be shown for support correlation.

Generated types prevent accidental contract drift but are not treated as a privacy boundary. `src/api/public-view-models.ts` separately copies only fields needed by each page. This is especially important for before/after content: consent evidence, policy versions, publication workflow, withdrawal state, cleanup state, and other governance metadata are neither represented nor rendered. The booking client likewise validates runtime appointment summaries and copies only confirmation code, status, date/time, names, duration, and price; all returned ObjectIds are discarded before result rendering.

## Booking state and concurrency

The booking flow keeps service, dentist, date, slot, patient fields, consent, challenge token, and the last logical-attempt key in component memory only. Patient name, phone, email, and comment never enter URLs, `localStorage`, `sessionStorage`, logs, WebMCP arguments, or server-rendered page state. Changing service invalidates any incompatible dentist plus date/slot; changing dentist invalidates date/slot; changing date invalidates the slot.

When the host supports WebMCP, one progressive-enhancement tool may stage a current compatible service/dentist and optional date in the visible form. It accepts canonical slugs only, contains no PII fields, never accepts consent or challenge data, and cannot submit or create an appointment. Ordinary browsers are unaffected.

Availability comes only from `GET /availability` through a `cache: "no-store"`, credential-omitting browser request. Selection changes abort the active request and advance a generation counter, so a response that ignores cancellation cannot overwrite newer or cleared state. Refresh and conflict recovery remove old slots while the fresh request is pending. `400/404`, `429`, `503`, timeout/network, empty, and documented availability reasons have separate user-facing paths and are never automatically retried.

Submission uses the exact public contract. One lowercase UUIDv4 key is generated for one canonical payload. The canonical identity trims patient text, lowercases email, includes locale/consent and all scheduling fields, and excludes the replaceable challenge token. A double submit is guarded in memory and by the disabled progress control, while backend idempotency remains authoritative. A network or timeout uncertainty preserves the same key for an unchanged retry; any changed canonical payload receives another key. A `409` clears only the stale slot, refreshes availability, focuses the time section, and preserves patient fields. A `404` clears stale service/dentist/date/slot state while retaining patient fields for a new valid selection. Pending and confirmed results use the backend status and returned schedule summaries; the frontend never upgrades pending to confirmed.

Production uses an isolated explicit-render Cloudflare Turnstile adapter because that matches the backend provider contract. The public site key is browser configuration; the secret remains backend-only. Production configuration fails before startup/build if Turnstile or its site key is absent. Development preview and all automated tests explicitly select the disabled adapter and block non-local browser traffic.

## Localization

UI copy is authored explicitly for Armenian, Russian, and English. Public content is selected field-by-field from backend translations. A missing requested field may fall back to the authored Armenian field; deliberately authored empty strings remain empty and do not trigger fallback. The resulting element receives `lang="hy"` when Armenian fallback is displayed inside another locale.

Dentist names are language-neutral contract fields. Names containing Armenian script receive an explicit Armenian language marker without inventing a translation. Locale switching preserves the logical detail route.

## Media and URL safety

The browser never uses raw legacy image URL fields. Managed image objects are accepted only when all of the following hold:

- the deployment configured a syntactically valid Cloudinary cloud name;
- the URL is HTTPS with no username, password, query, or fragment;
- the hostname is exactly `res.cloudinary.com`;
- the path is under `/{cloudName}/image/upload/` and matches the expected public ID;
- dimensions are finite positive values.

Otherwise the UI renders a deliberate accessible placeholder. Contact and social URLs use scheme and hostname allowlists; telephone and mail links are conservatively constructed.

## Rendering, caching, and failure behavior

Ordinary public catalog reads use `next.revalidate: 300`. Before/after list and detail reads deliberately use `cache: "no-store"`; the same wrappers serve collection pages, detail pages, home previews, and sitemap generation, so withdrawn consent is reflected on the next request rather than after a cache interval. Route loading UI is deliberate and nonblank. Collection pages distinguish empty content from upstream failure. Expected not-found records become the localized 404 page; unexpected failures enter the localized error boundary. Error rendering does not expose backend messages, stacks, secrets, or patient data.

Booking catalog eligibility and clinic settings are fetched fresh rather than inheriting editorial revalidation. Live availability and mutations use the dedicated booking client with no-store, omitted browser credentials, bounded timeouts, runtime response checks, normalized non-sensitive errors, and `Retry-After` parsing. Authenticated future staff state must use a separate boundary.

## Browser and response security

`next.config.ts` rejects unsafe environment origins before startup and configures a narrow Cloudinary image pattern. Response headers include CSP, frame denial, MIME sniffing protection, strict referrer policy, cross-origin opener isolation, and a restrictive permissions policy. HSTS and insecure-request upgrading are production-only. The development CSP adds `unsafe-eval` only for the framework toolchain.

The production CSP still needs `unsafe-inline` for framework scripts/styles. Removing it would require a tested nonce/hash strategy and is recorded as a hardening opportunity, not silently claimed as complete.

The public frontend has no secrets. `.env*` files are ignored except the safe `.env.example`; `NEXT_PUBLIC_*` values are intentionally browser-visible configuration. Turnstile is allowed in CSP only when configured, using the exact challenge origin for scripts, frames, and connections.

## Accessibility and responsive design

- one page-level `h1`, ordered section/card headings, landmarks, skip link, and visible focus styles
- semantic links for navigation and contact actions
- keyboard-operable mobile sheet with Escape close and focus restoration
- authored or fallback language markers
- meaningful image alternatives retained when media is unavailable; decorative placeholders are hidden
- reduced-motion handling, 44px-or-larger interactive targets, and no horizontal overflow at 375, 430, 768, 1024, or 1440 px
- semantic pressed-state service/dentist/slot controls, native mobile date input, explicit progress summary, live loading/results, focus movement after stale-slot and invalid-selection failures, and connected form labels/hints

Automated axe checks cover representative landing, collection, dentist detail, and before/after detail pages. Automated results complement rather than replace deployment-time assistive-technology testing.

## SEO

Each page produces a canonical URL and HY/RU/EN alternates. Paginated before/after collections receive page-specific canonical and alternate URLs. Detail pages use localized public content and only trusted record media; when record media is unavailable they do not advertise an unsafe image. General pages use the local `public/og.png` fallback. `robots.txt` and `sitemap.xml` use the configured site origin and include localized booking plus static and currently published detail URLs when the API is available. Safe service/dentist booking preselection may use canonical slugs; patient data is never query state.

## Testing and isolation

Unit tests cover environment parsing, localization/fallback, URL safety, public transport behavior, response allowlisting, literal text rendering, loading/error/empty components, production/development security-header branches, booking dates, stale-response races, idempotency lifecycle, failure recovery, challenge isolation, privacy, and basic accessibility. The intended unit boundary is explicit in the coverage configuration, and thresholds are enforced against that complete boundary.

Playwright uses a localhost-only deterministic mock API. Browser requests to non-local hosts are aborted, the challenge provider is explicitly disabled, and the Cloudinary cloud name is deliberately empty, so no automated test can contact Cloudflare, real Cloudinary, or another external provider. Booking E2E covers entry-point preselection, all locales, pending/confirmed results, uncertain retry key reuse, conflict recovery, error scenarios, accessibility, and the required viewport matrix. The runner uses a fresh `.next-e2e` directory for every run to prevent revalidation-cache pollution between scenarios, then removes only that validated generated directory. It owns and terminates only the Next.js and Playwright process trees it starts, including on interrupt and termination signals.

`npm run dev:preview` reuses the same fixtures in a separate localhost-only launcher on ports 3000/5000. It imports mock data only from the test tree, prints homepage/booking/scenario URLs, and on Ctrl+C closes mock connections, terminates only its Next child tree, and removes only the validated `.next-preview` directory. Production code never imports the preview server or fixtures.

The backend regression suite remains responsible for disposable MongoDB safety and fake Cloudinary enforcement. Frontend E2E does not start or mutate a real backend database.

## Deployment contract

Before deployment, operators must provide exact HTTPS API and site origins, the intended Cloudinary account, a Turnstile public site key paired with the backend secret/provider, install dependencies with the lockfile, generate/check API types, build in production mode, and run the documented frontend and backend gates. DNS, TLS, CDN/cache policy, monitoring, provider credentials, approved privacy-policy content/URL, legal review, and real clinic/brand assets are external release responsibilities.
