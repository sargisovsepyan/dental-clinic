# Frontend booking final report

Date: 2026-09-03

Branch: `codex/frontend-booking`

Baseline: `41b892e docs: record frontend architecture and readiness`

## Outcome

Frontend Phase 2 now provides a complete no-account booking journey on the existing Armenian, Russian, and English public site. Patients can enter from the primary navigation or a preselected service/dentist call to action, choose only a currently eligible service/dentist combination, request live availability, submit the documented public appointment contract, and receive the backend's actual `pending` or `confirmed` outcome.

The implementation preserves the backend as the authority for availability, appointment locking, state, price, quotas, validation, challenge verification, and idempotency. It adds no patient account, medical record, staff/admin function, invented clinic policy, analytics, or unapproved third-party content.

## Delivered booking experience

- explicit `/{locale}/book` routes for `hy`, `ru`, and `en`, with Armenian as the publication fallback and correct document language markers;
- header, mobile navigation, home, service, and dentist entry points, including canonical slug-only preselection;
- fresh booking eligibility/settings and browser-side `no-store` availability reads with credentials omitted;
- compatible service/dentist filtering, native date input, explicit time-slot selection, patient fields, optional comment, unchecked consent, challenge integration, progress state, and accessible result/recovery states;
- distinct empty, validation, stale selection, conflict, rate-limit, service-unavailable, timeout/network-uncertainty, and generic failure handling;
- preservation of patient-entered fields after recoverable scheduling failures, while stale scheduling state is selectively cleared;
- exact rendering of backend `pending` versus `confirmed` state without optimistic promotion;
- responsive layouts without horizontal overflow at 375, 430, 768, 1024, and 1440 pixels;
- optional WebMCP progressive enhancement that can stage only canonical service/dentist/date choices in the visible form and can never receive patient data, provide consent, solve a challenge, or submit a booking.

## State, race, and idempotency design

The browser retains booking data only in component memory. Patient name, phone, email, and comment are never placed in a URL, browser storage, log, server-rendered state, or WebMCP argument. Locale navigation preserves safe editorial query state but deliberately discards patient-like query parameters.

Changing service invalidates incompatible dentist/date/slot state; changing dentist invalidates date/slot state; changing date invalidates the selected slot. Every availability-affecting change aborts the active request and advances a generation counter, including changes that clear selection without starting a replacement request. Therefore, even a response that ignores abort cannot overwrite newer or cleared state. Existing slots are removed while refresh or conflict recovery is pending.

One lowercase UUIDv4 idempotency key belongs to one canonical logical payload. Canonical identity includes normalized scheduling/patient fields, locale, and consent, but excludes the replaceable challenge token. An uncertain network or timeout retry of the unchanged payload reuses the same key. Any material payload change receives a new key. In-memory submission guards and disabled progress controls prevent accidental double clicks; the database-backed backend mechanism remains authoritative for concurrent or repeated requests.

A `409` removes only the stale slot, refreshes availability, moves focus to time selection, and preserves patient fields. A stale `404` clears invalid service/dentist/date/slot choices while preserving patient fields. `429` is not automatically retried and shows a valid exposed `Retry-After` value when available.

## Runtime contract and privacy boundary

The booking client sends exactly the documented public request, performs bounded requests, rejects malformed response envelopes, normalizes errors without exposing backend messages, and retains safe request identifiers only for support correlation. Returned appointment identifiers are discarded. The result view receives only confirmation code, status, schedule, localized service/dentist summaries, duration, and price. A returned summary whose identifiers do not match the submitted choice is rejected rather than rendered.

Cloudflare Turnstile is the production challenge adapter because it matches the backend provider contract. Only the public site key is exposed to the browser; the secret remains backend-only. Production configuration fails early when Turnstile or its site key is missing. Local preview and automated tests explicitly use the disabled adapter and block non-local browser requests.

Consent is explicit and initially unchecked. The UI states the booking-related processing purpose but does not invent legal terms, a policy version, or evidence. Approved clinic privacy-policy content and a public policy URL were not supplied and remain an external release-content requirement.

## Phase 1 re-review and corrections

The inherited frontend foundation was re-inspected before booking work continued. The following issues were corrected with focused regression coverage where applicable:

1. Remote media that passed URL validation but failed during loading now becomes the existing accessible placeholder.
2. Locale switching now preserves safe query parameters while dropping patient-like query data, and fallback document language remains explicit.
3. The mobile sheet close control meets the 44-pixel target size.
4. Site/footer navigation and booking calls to action consistently reach localized booking routes.
5. The existing social image dimensions were retained because they are valid; no unnecessary asset rewrite was made.

No unresolved critical or high-severity Phase 1 regression was found after these corrections.

## Backend change made during the booking phase

Browser clients could receive rate-limit and correlation response headers from the backend but CORS did not expose them, and the OpenAPI availability operation omitted its possible global-limit `429`. Commit `f9ee4b9` makes the compatible contract correction:

- CORS exposes only `Retry-After`, `RateLimit`, and `X-Request-Id`;
- the human API contract documents global `429` behavior and prohibits automatic browser retry;
- OpenAPI documents availability `429`, and the generated frontend type is refreshed;
- regression tests verify the exposure and contract;
- the idempotency retention text was corrected to the implemented 1–168 hour range with a 24-hour default.

The correction changes no appointment state, lock, quota, authentication, authorization, Cloudinary, notification, or persistence behavior.

## Adversarial review findings closed

The final review specifically rechecked stale availability races, conflict recovery, uncertain submission, duplicate submission, malformed success payloads, identifier leakage, runtime locale summaries, 404 recovery, rate-limit metadata, production CSP/challenge configuration, test network isolation, preview cleanup, and inherited localization/media accessibility.

Issues found and fixed before this report included:

- a cleared selection could previously leave an old request generation current;
- old slot controls could remain visible during refresh and conflict recovery;
- availability failures needed distinct validation/not-found, rate-limit, unavailable, and network paths;
- a booking `404` needed to clear stale scheduling choices without erasing patient input;
- nested success fields and submitted/returned record identity needed runtime verification;
- E2E data incorrectly expected unauthored English mock content instead of the authoritative Armenian fallback;
- date fixtures were made relative to the current date instead of becoming stale;
- mobile Armenian and keyboard-driven Russian submission required direct browser coverage;
- Turnstile origins were missing from the conditional production CSP;
- controlled preview shutdown needed connection closure, child-process ownership, bounded termination, and validated cache cleanup.

No known unresolved critical or high-severity booking code issue remains.

## Verification evidence

Frontend gates:

- `npm run api:types` — passed against the validated repository OpenAPI document;
- `npm run typecheck` — passed;
- `npm run lint` — passed with zero warnings;
- `npm run test:coverage` — 11 files and 69 tests passed;
- frontend coverage — 82.52% statements, 81.20% branches, 88.38% functions, and 86.53% lines;
- final focused inherited-component regression — 8/8 tests passed after the locale-query assertion was finalized;
- production `npm run build` — passed with HTTPS example origins and the Turnstile test public key;
- `npm run test:e2e` — 16/16 Chromium tests passed (8 booking and 8 public-site tests);
- booking browser coverage — HY/RU/EN, service/dentist preselection, pending/confirmed results, uncertain retry key reuse, conflict recovery, validation/rate-limit/service failures, responsive matrix, keyboard use, and representative axe scans;
- `npm audit --omit=dev --audit-level=moderate` — 0 vulnerabilities;
- `npm audit --audit-level=moderate` — 0 vulnerabilities.

Backend and contract gates:

- focused booking response/CORS/OpenAPI regressions — 15/15 tests passed;
- `npm run verify` — syntax check 170 files, tracked-secret scan 272 files, OpenAPI lint passed, and 286/286 tests passed;
- backend coverage — 92.51% lines, 83.27% branches, and 89.34% functions;
- standalone `npm test` — 286/286 tests passed;
- subsequent staged-file secret checks passed through 285 tracked files.

The backend suite evidence includes authentication and refresh-token rotation, RBAC/IDOR controls, database-enforced appointment lock keys and unique indexes, exact-slot and overlapping-slot races, booking-versus-reschedule races, failed-reschedule lock preservation, cancellation lock release, timezone boundaries, state transitions, audit-log sanitization, Cloudinary replacement/deletion and rollback ordering, both before/after two-upload rollback paths, isolated disposable database guards, fake-provider enforcement, and production error minimization.

## Frozen local preview review

The final deterministic preview was completed before documentation finalization and was not needlessly rerun. It verified:

- HY booking at 375 pixels and wide booking at 1440 pixels with the correct language, one `h1`, and no horizontal overflow;
- a full pending booking at 430 pixels;
- successful localized home, services, service detail, dentists, dentist detail, gallery, before/after, and booking routes;
- WebMCP staging with valid canonical inputs and rejection of invalid inputs, without PII or submission authority;
- Ctrl+C/ETX controlled shutdown with exit code 130;
- closure of the owned mock and Next.js connections;
- release of ports 3000, 5000, 3100, and 5100;
- removal of only the validated `.next-preview` and `.next-e2e` generated caches.

## Logical commits

- `f9ee4b9 fix: expose booking response metadata`
- `0c75e63 fix: polish frontend resilience and navigation`
- `291d54f feat: add production booking experience`
- `b6810ab test: verify booking safety and local preview`
- `docs: finalize frontend booking readiness` (the documentation commit containing this report)

History was not rewritten, reset, squashed, pushed, or merged.

## Known external limitations and release responsibilities

- Approved privacy-policy content, its public URL, and legal review must be supplied before production publication.
- Production DNS/TLS, CDN/cache behavior, monitoring, provider accounts, Turnstile credentials, backend secrets, and real clinic/brand assets are external deployment work.
- Automated tests intentionally never contact real Cloudinary, Turnstile, SMTP, Redis, monitoring, or a real backend/database. The fully verified backend contract suite plus deterministic frontend E2E cover the integration boundary; a deployment smoke test must validate the actual configured services.
- The current Next.js/Tailwind CSP still requires `unsafe-inline`; replacing it needs a separately tested nonce/hash strategy.
- Real-device and assistive-technology deployment smoke testing remains advisable in addition to the automated responsive and axe coverage.
- Patient accounts and staff/admin workflows remain outside Phase 2 and belong to the next phase.

These are explicit deployment/content responsibilities, not hidden code defects or claims that external infrastructure has already been provisioned.

## Definition of Done

SAFE TO MERGE FRONTEND BOOKING INTO MAIN: YES

FRONTEND BOOKING PRODUCTION-QUALITY: YES — for the reviewed code and documented contract, subject to the external deployment/content responsibilities above.

ONLINE BOOKING UX COMPLETE: YES

LOCAL PREVIEW READY FOR MANUAL REVIEW: YES

READY TO START STAFF/ADMIN PHASE: YES

BACKEND CHANGED DURING BOOKING PHASE: YES — browser-safe response metadata and availability rate-limit behavior were aligned across CORS, tests, the human contract, OpenAPI, and generated frontend types.
