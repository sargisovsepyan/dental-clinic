# Frontend architecture

## Purpose and scope

The `frontend/` application contains two deliberately separated surfaces: the public presentation/no-account booking site and the authenticated staff workspace. The public side publishes clinic information, services, dentists, gallery media, and already-approved before/after cases. The staff side provides authentication/account security, admin/receptionist appointment operations, and Phase 3B admin-only catalog, dentist, schedule/override, closure, and safe clinic-settings management. It does not provide patient accounts, clinical records, generalized media/consent administration, or staff lifecycle management UI.

The frontend consumes only documented `/api/v1` endpoints described by `openapi.yaml`. It does not connect directly to MongoDB or any backend provider SDK.

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

Staff routes use a separate `(staff)` route group under `/{locale}/staff`. This keeps the interactive client authentication boundary out of the public marketing layout while preserving explicit HY/RU/EN routes. The staff auth provider and workspace shell own session state, identity, role-aware navigation, responsive navigation, and logged-out/unavailable boundaries. The staff document routes are `noindex`, excluded from the sitemap, and covered by private/no-store production response headers.

## Data flow and contract boundary

```text
OpenAPI contract
  -> generated TypeScript transport types
  -> one server-side public GET client
  -> explicit safe display view models
  -> server-rendered route components
```

`src/api/public-client.ts` is the only public API transport boundary. It permits only fixed relative paths, constructs query parameters through `URL`, sends no browser credentials, enforces an eight-second timeout, and normalizes network, timeout, HTTP, protocol, and configuration failures into `PublicApiError`. Raw backend error messages never reach the rendered UI. Safe request IDs may be shown for support correlation.

`src/api/staff-client.ts` is the authenticated transport boundary. It runtime-validates staff users, appointments, management projections, schedule revisions, bounded conflict metadata, pagination, and availability correlation; sends bearer credentials only to the configured API origin; uses the refresh cookie only on auth endpoints with `credentials: include`; marks protected reads and mutations `no-store`; bounds requests; and surfaces only allowlisted error metadata. Patient fields, hidden backend guard fields, and backend error text are not copied into error objects or logs.

Generated types prevent accidental contract drift but are not treated as a privacy boundary. `src/api/public-view-models.ts` separately copies only fields needed by each page. This is especially important for before/after content: consent evidence, policy versions, publication workflow, withdrawal state, cleanup state, and other governance metadata are neither represented nor rendered. The booking client likewise validates runtime appointment summaries and copies only confirmation code, status, date/time, names, duration, and price; all returned ObjectIds are discarded before result rendering.

## Booking state and concurrency

The booking flow keeps service, dentist, date, slot, patient fields, consent, challenge token, and the last logical-attempt key in component memory only. Patient name, phone, email, and comment never enter URLs, `localStorage`, `sessionStorage`, logs, WebMCP arguments, or server-rendered page state. Changing service invalidates any incompatible dentist plus date/slot; changing dentist invalidates date/slot; changing date invalidates the slot.

When the host supports WebMCP, one progressive-enhancement tool may stage a current compatible service/dentist and optional date in the visible form. It accepts canonical slugs only, contains no PII fields, never accepts consent or challenge data, and cannot submit or create an appointment. Ordinary browsers are unaffected.

Availability comes only from `GET /availability` through a `cache: "no-store"`, credential-omitting browser request. Selection changes abort the active request and advance a generation counter, so a response that ignores cancellation cannot overwrite newer or cleared state. Refresh and conflict recovery remove old slots while the fresh request is pending. `400/404`, `429`, `503`, timeout/network, empty, and documented availability reasons have separate user-facing paths and are never automatically retried.

Submission uses the exact public contract. One lowercase UUIDv4 key is generated for one canonical payload. The canonical identity trims patient text, lowercases email, includes locale/consent and all scheduling fields, and excludes the replaceable challenge token. A double submit is guarded in memory and by the disabled progress control, while backend idempotency remains authoritative. A network or timeout uncertainty preserves the same key for an unchanged retry; any changed canonical payload receives another key. A `409` clears only the stale slot, refreshes availability, focuses the time section, and preserves patient fields. A `404` clears stale service/dentist/date/slot state while retaining patient fields for a new valid selection. Pending and confirmed results use the backend status and returned schedule summaries; the frontend never upgrades pending to confirmed.

Production uses an isolated explicit-render Cloudflare Turnstile adapter because that matches the backend provider contract. The public site key is browser configuration; the secret remains backend-only. Production configuration fails before startup/build if Turnstile or its site key is absent. Development preview and all automated tests explicitly select the disabled adapter and block non-local browser traffic.

## Staff authentication and session lifecycle

The access token exists only in a private field on the in-memory staff API client. It is never written to `localStorage`, `sessionStorage`, IndexedDB, cookies, URLs, React Server Component props, or logs. The backend owns the rotating refresh token in an HttpOnly cookie; JavaScript can request refresh or logout but cannot read the token.

Initial staff bootstrap performs one refresh and confirms the returned identity with `/auth/me`. Concurrent same-tab refresh demand shares one promise. Refresh, login, and logout are serialized locally, and Web Locks provide the same critical section across supporting tabs so refresh-cookie rotation is not raced. A session epoch prevents a late refresh or protected response from restoring/rendering state after logout. Logout clears the local UI and broadcasts session removal before the network revocation completes; the backend logout is still attempted after any in-flight refresh finishes. An uncertain refresh is never automatically retried. A protected request receives at most one refresh and one retry after a definitive `401`; `403` preserves the authenticated session and renders an authorization failure.

Password setup and reset tokens arrive only in URL fragments, are captured into an ephemeral ref, and are removed immediately with `history.replaceState`. Hash changes on an already-mounted form are handled without retaining the new fragment. Tokens are sent only in POST bodies and cleared after use. Login, forgot/reset/setup, and change-password forms use the backend's exact minimum of six Unicode characters; new passwords are also limited to 72 UTF-8 bytes to prevent bcrypt truncation. Changing a password revokes sessions server-side and clears the local session.

## Staff RBAC and appointment operations

The shell removes appointment navigation for dentists and renders an access-denied boundary on direct dentist navigation, but this is only UX. The backend remains authoritative: every staff request carries the memory token, and appointment endpoints independently require administrator or receptionist roles. No staff role or permission is inferred from a route parameter.

Appointment list filters are limited to documented date, status, dentist, service, page, and bounded limit fields. Patient names, phone numbers, email addresses, comments, and notes never enter URLs. Authorized list/detail views may display the minimum operational contact fields returned by the protected API. Creation records an explicit phone or in-person privacy-consent method and never invents consent evidence.

Status actions expose only the backend transition graph. Cancellation and rescheduling are available only in documented states. Every mutation sends the exact `mutationVersion` currently under review; the UI never auto-retries a `409`, never applies optimistic appointment state, and always replaces the view through a fresh authoritative read after success or conflict. Protected reschedule availability includes the reviewed mutation version and is correlated to the chosen service, dentist, and clinic-local date. Selection changes abort requests and advance a generation counter so stale availability cannot replace newer state. The backend database lock, quota, cancellation release, and reschedule rollback remain the concurrency authorities.

## Clinic management and schedule concurrency

Only administrators receive navigation or data loading for service/category, dentist, schedule, and clinic-management routes. A direct receptionist or dentist visit renders the signed-in access-denied boundary without issuing protected management reads. This zero-fetch guard is defense in depth: the API still applies admin authorization to every management list and mutation, and a backend `403` does not clear a valid frontend session.

Catalog forms submit only documented fields. Armenian publication content remains required where the backend requires it; Russian and English are independently authored and never synthesized. Slugs, managed media, hidden booking guards, and audit data remain server-owned. Category removal surfaces referential conflicts without cascading service changes. Service and dentist archive/restore operations follow the backend's soft-lifecycle semantics, and successful mutations are followed by authoritative reads. Dentist profile writes exclude weekly schedules, schedule revisions, and media replacement; new dentist profiles start with closed booking hours until an administrator deliberately configures a schedule.

Clinic and dentist weekly schedules are edited as seven clinic-local clock-time records with at most six validated, sorted, non-overlapping shifts per day. The UI displays the backend-provided clinic timezone and never converts these wall-clock fields through the browser timezone. The timezone itself is deployment-owned/read-only because the backend does not expose a safe live migration workflow. Dentist exceptions and clinic date overrides use validated `YYYY-MM-DD` clinic-local dates and the same shift rules.

Every schedule or override write carries the reviewed `scheduleRevision`. A conflict-preview response is parsed through an allowlist that accepts at most 25 appointment summaries and a 64-hex-character acknowledgement token while dropping patient-shaped extras. The UI freezes a deep-copied proposal, revision, token, and permitted conflict set. Explicit confirmation replays only that exact proposal once; existing appointments are never moved or cancelled. A revision conflict or indeterminate network/timeout outcome refetches authority and discards the old acknowledgement token. It never silently upgrades the revision or auto-retries an unsafe write.

Clinic settings expose only documented public content/contact, credential-free approved URLs, coordinates, and bounded booking-policy fields. The form cannot submit timezone, weekly schedule, revision, provider credentials, or arbitrary configuration keys. Returned clinic state is parsed and rendered only after server confirmation.

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

Booking catalog eligibility and clinic settings are fetched fresh rather than inheriting editorial revalidation. Live availability and mutations use the dedicated booking client with no-store, omitted browser credentials, bounded timeouts, runtime response checks, normalized non-sensitive errors, and `Retry-After` parsing. Staff catalog labels are built server-side from the same fresh public-safe catalog view models; all patient and mutation state is loaded only through the authenticated client boundary.

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

Automated axe checks cover representative public pages, a staff appointment detail view, and Phase 3B management. Staff forms use native labels, deliberate status/alert regions, keyboard-safe Base UI dialogs/sheets with focus management, and mobile cards instead of forcing desktop tables into narrow viewports. Conflict and lifecycle state is expressed in text as well as color. Automated results complement rather than replace deployment-time assistive-technology testing.

## SEO

Each page produces a canonical URL and HY/RU/EN alternates. Paginated before/after collections receive page-specific canonical and alternate URLs. Detail pages use localized public content and only trusted record media; when record media is unavailable they do not advertise an unsafe image. General pages use the local `public/og.png` fallback. `robots.txt` and `sitemap.xml` use the configured site origin and include localized booking plus static and currently published detail URLs when the API is available. Safe service/dentist booking preselection may use canonical slugs; patient data is never query state.

## Testing and isolation

Unit tests cover environment parsing, localization/fallback, URL safety, public transport behavior, response allowlisting, literal text rendering, loading/error/empty components, production/development security-header branches, booking dates, stale-response races, idempotency lifecycle, failure recovery, challenge isolation, privacy, management runtime parsing, admin mutation contracts, form validation, RBAC zero-fetch behavior, schedule serialization, frozen acknowledgement replay, stale-token disposal, and basic accessibility. The intended unit boundary is explicit in the coverage configuration, and thresholds are enforced against that complete boundary.

Playwright uses a localhost-only deterministic mock API. Browser requests to non-local hosts are aborted, the challenge provider is explicitly disabled, and the Cloudinary cloud name is deliberately empty, so no automated test can contact Cloudflare, real Cloudinary, or another external provider. Public/booking coverage remains intact. Staff E2E covers all three roles, HY/RU/EN shells, login/refresh restoration/logout, noindex/storage/cookie checks, appointment operations and conflicts, session expiry, password setup/reset, management lifecycle/reflection, schedule acknowledgement and stale refusal, exceptions/closures, safe clinic settings, responsive navigation, and axe. The runner uses a fresh `.next-e2e` directory for every run to prevent revalidation-cache pollution between scenarios, then removes only that validated generated directory. It owns and terminates only the Next.js and Playwright process trees it starts, including on interrupt and termination signals.

`npm run dev:preview` reuses the same fixtures in a separate localhost-only launcher on ports 3000/5000. It imports mock data only from the test tree and prints public/booking/staff URLs, local-only admin/receptionist/dentist accounts, reset/setup links, and scenario controls. The stateful mock implements credentialed localhost CORS, an HttpOnly rotating cookie, bearer authorization, realistic role denial, appointment and management lifecycle data, public catalog reflection, schedule-impact acknowledgement, stale revisions, validation failures, and expiry without contacting external services. On Ctrl+C the launcher closes mock connections, terminates only its Next child tree, releases ports 3000/5000, and removes only the validated `.next-preview` directory. Production code never imports the preview server, identities, credentials, tokens, or fixtures.

The backend regression suite remains responsible for disposable MongoDB safety and fake Cloudinary enforcement. Frontend E2E does not start or mutate a real backend database.

## Deployment contract

Before deployment, operators must provide exact HTTPS API and site origins, the intended Cloudinary account, a Turnstile public site key paired with the backend secret/provider, install dependencies with the lockfile, generate/check API types, build in production mode, and run the documented frontend and backend gates. DNS, TLS, CDN/cache policy, monitoring, provider credentials, approved privacy-policy content/URL, legal review, and real clinic/brand assets are external release responsibilities.
