# Frontend staff/admin foundation final report

Date: 2026-09-09

Branch: `feature/staff-admin-foundation`

Baseline: `4819fe8 fix: update qs dependency security`

## Outcome

Frontend Phase 3A now provides a localized, authenticated staff foundation and an operational appointment workspace on top of the completed public site and booking flow. Administrators and receptionists can sign in, restore and end sessions, review appointment lists/details, create appointments, perform permitted status transitions, reschedule, and cancel. Dentist accounts receive the authenticated shell and account security surface but cannot access patient appointment administration.

The backend remains authoritative for identity, role, refresh-token rotation, state transitions, appointment locks, phone quotas, availability, and compare-and-set mutations. Phase 3A does not add patient accounts, clinical records, content management, schedule management, or staff administration.

## Authentication and session architecture

- The access token is held only in a private field on the in-memory staff API client. It is never written to browser storage, cookies, URLs, React Server Component props, or logs.
- The rotating refresh token is owned by the backend in a path-scoped, `Secure`, `HttpOnly`, `SameSite=Strict` cookie. Browser credentials are included only on authentication endpoints; protected bearer requests omit cookies.
- Initial restoration performs one refresh followed by `/auth/me` identity confirmation. A protected `401` receives at most one refresh and one request retry. A `403` preserves the authenticated session and renders an authorization boundary.
- Concurrent same-tab refresh demand shares one promise. Refresh, login, and logout are serialized locally; supporting browsers also use Web Locks for the cross-tab refresh-cookie critical section.
- A session epoch prevents a late refresh or protected response from restoring state after logout. Logout clears and broadcasts local state before awaiting backend revocation, while still serializing revocation behind any in-flight refresh. A new login cannot race behind a late logout that would revoke it.
- Uncertain refresh requests are never retried automatically.

Password setup and reset tokens are accepted only from URL fragments, captured into an ephemeral ref, and immediately scrubbed with `history.replaceState`, including same-path hash navigation and React development double effects. Tokens are sent only in POST bodies and cleared after use. Login, setup, reset, and change-password forms enforce the backend's exact minimum of six Unicode characters and maximum of 72 UTF-8 bytes. Successful password change/reset relies on backend session invalidation and returns the UI to sign-in.

## RBAC and staff shell

The localized `/{locale}/staff` surface has a dedicated client authentication boundary separate from public Server Components. The shell provides role identity, desktop navigation, a keyboard-safe mobile sheet, loading/session-unavailable states, and account access in HY/RU/EN.

Appointment navigation is available only to administrators and receptionists. Dentist direct navigation renders an access-denied state and does not expose appointment controls. This client behavior is defense in depth only: backend authorization independently derives the current role from the database and denies dentist access. Staff routes are omitted from the sitemap, disallowed by robots, marked `noindex`, and served under private/no-store response headers.

## Appointment workspace and concurrency behavior

The appointment workspace includes:

- date/status/dentist/service filters, bounded pagination, desktop tables, and mobile cards;
- patient contact information only inside authenticated list/detail views, never in filter URLs;
- a staff-create dialog with fresh eligible catalog data, correlated live availability, explicit phone/in-person consent method, and no invented consent evidence;
- detail views with clinic-timezone labels, permitted status actions, cancellation, and rescheduling;
- accessible alerts, disabled/progress states, labeled controls, keyboard-safe dialogs, and authoritative result rendering.

Every status, reschedule, and cancellation mutation sends the exact `mutationVersion` the operator reviewed. There is no optimistic appointment state and no automatic retry of stale writes. Success and `409 APPOINTMENT_VERSION_CONFLICT` both lead to an authoritative detail refetch; the conflict state tells the operator to review the current record before another action.

Protected reschedule availability carries the reviewed mutation version and excludes only the current appointment. Results are correlated to version, service, dentist, and clinic-local date. Selection changes abort active requests and advance a generation counter, preventing late or abort-ignoring responses from replacing newer state. The database lock and transaction logic remain authoritative for exact-slot overlap, competing bookings/reschedules, failed-reschedule rollback, cancellation release, and quota ownership.

## Backend changes during Phase 3A

Commit `5641550` aligned the public contract and backend concurrency boundary required by the workspace:

- status, reschedule, and cancellation now require `expectedMutationVersion`;
- stale writes return stable `409 APPOINTMENT_VERSION_CONFLICT` metadata with the current version;
- administrators/receptionists receive protected, version-bound `GET /appointments/{id}/availability` that excludes only the reviewed appointment;
- authentication, staff, appointment, and availability responses use no-store middleware;
- the human API contract, OpenAPI, generated frontend types, and concurrency regressions were updated together.

No MongoDB index was dropped or automatically migrated. Existing database-enforced appointment lock and phone-quota invariants were preserved.

A live final audit later surfaced newly published advisories in direct backend dependencies. Commit `022e482` updated compatible versions to `joi 18.2.8`, `multer 2.3.0`, and `nodemailer 9.1.1`. The affected security/media/mail suite, full verification, standalone tests, and both live audits passed after the update.

## Security and privacy review

The high-effort review rechecked authentication/refresh rotation, session races, RBAC/IDOR, appointment CAS and state transitions, exact/overlap locks, booking/reschedule/cancel races, failed-reschedule lock preservation, cancellation release, unique indexes, timezone boundaries, audit sanitization, media rollback/replacement/deletion, two-upload rollback, isolated test databases, fake provider enforcement, production error minimization, and environment-file safety.

Frontend error objects and rendered failures retain only safe error codes, request IDs, retry metadata, and current mutation version. Raw backend messages, stack traces, tokens, patient fields, and provider errors are not logged or rendered. Patient data is not placed in URLs or browser storage. Automated browser traffic is restricted to localhost; Cloudinary configuration is empty and the challenge adapter is disabled. Backend tests fail closed without explicit fake Cloudinary/mail adapters and require the exact disposable local test database.

Issues found and closed during adversarial review included:

- cancellation and password lifecycle buttons needed explicit native submit behavior;
- logout could race a late refresh/protected response and a subsequent login;
- same-path one-time-token hash navigation could be mishandled under React development effects;
- staff mutation and availability paths needed exact version correlation and authoritative refetch behavior;
- slow development compilation needed a result-based E2E wait rather than a five-second assumption;
- frontend `js-yaml` and backend `joi`/`multer`/`nodemailer` advisories required compatible dependency remediation;
- the Windows preview launcher could release ports yet leave its resumed stdin/process wrapper alive after Ctrl+C.

The final preview shutdown implementation uses raw ETX handling plus normal signal handling, bounded owned-tree termination, a child-exit fence, drained shutdown output, mock connection closure, and validated cache deletion. Commit `ea199b6` adds focused lifecycle regression coverage. No unresolved critical or high-severity code defect is known.

## Deterministic local preview

`npm run dev:preview` owns localhost ports 3000 and 5000, uses only test-tree fixtures, and prints public/staff URLs, fake accounts, password setup/reset links, and scenario controls. The local accounts are:

- `admin@preview.local` / `Preview123!`
- `reception@preview.local` / `Preview123!`
- `dentist@preview.local` / `Preview123!`

Representative pending, confirmed, and cancelled appointments are available. `staff-conflict`, `staff-stale-availability`, and `staff-expired` exercise CAS, availability-version, and session-expiry behavior. The mock implements exact credentialed localhost CORS, rotating session cookies, bearer tokens, and realistic role denial without contacting a real database or external provider.

Ctrl+C now follows one bounded cleanup path: stop only the owned Next.js tree, close mock connections, restore/release stdin, release ports 3000/5000, and remove only the validated `.next-preview` cache. The final live shutdown also confirmed ports 3100/5100 and `.next-e2e` were already free/absent.

## Browser and accessibility QA

The complete deterministic Chromium suite passed 25/25, including nine staff-focused scenarios. It exercises all three roles, login/restoration/logout, list/filter/create/detail, status/reschedule/cancel mutations, double-submit protection, stale CAS refusal, stale availability refusal, expiry, setup/reset, locales, the responsive matrix, noindex/storage/cookie assertions, external-network blocking, and axe checks.

The final manual real-browser pass additionally inspected:

- HY admin dashboard, appointment list/detail, permitted actions, cancellation dialog, reschedule availability, stale-availability conflict, and authoritative refetch message;
- RU and EN appointment detail/navigation/account language;
- EN receptionist appointment access and restoration after reload;
- dentist role-aware navigation and direct-URL access denial;
- session logout and deterministic expiry returning to login;
- setup/reset fragment capture, form labels, password guidance, and scrubbed token URLs;
- create/cancel dialog initial focus, Escape dismissal, and focus return;
- exact content widths 375, 430, 768, 1024, and 1440 with no horizontal overflow, mobile cards/navigation, and desktop shell/table behavior;
- an empty browser warning/error log after representative flows.

The manual pass did not submit another destructive mock mutation. The frozen Chromium suite performed the actual create/status/reschedule/cancel submissions and verified success, stale conflict, and no misleading optimistic state. No hydration warning, React warning, unexpected external request, token URL leak, or incorrect RBAC rendering was observed.

## Verification evidence

Frontend gates:

- `npm run api:types` — passed against the validated repository OpenAPI document;
- `npm run typecheck` — passed after the final preview lifecycle fix;
- `npm run lint` — passed with zero warnings after the final preview lifecycle fix;
- `npm run test:coverage` — 15 files and 98 tests passed;
- coverage — 82.25% statements (714/868), 81.27% branches (725/892), 87.06% functions (175/201), and 86.07% lines (649/754);
- preview lifecycle regression — 4/4 focused tests passed;
- production `npm run build` — passed with HTTPS example origins, isolated `.next-phase3-final`, and every public/staff route; the validated build cache was removed;
- `npm run test:e2e` — 25/25 Chromium tests passed;
- `npm audit --omit=dev --audit-level=moderate` — 0 vulnerabilities;
- `npm audit --audit-level=moderate` — 0 vulnerabilities.

Backend gates:

- focused appointment/auth/contract suite — 73/73 passed;
- post-dependency security/media/mail suite — 85/85 passed;
- `npm run verify` after dependency remediation — syntax check 171 files, tracked-secret scan 323 files, OpenAPI lint passed, and 288/288 tests passed;
- backend coverage — 92.46% lines, 83.21% branches, and 89.41% functions;
- standalone `npm test` — 288/288 passed;
- final staged tracked-secret scan after this report — 326 files checked;
- `npm audit --omit=dev --audit-level=moderate` — 0 vulnerabilities;
- `npm audit --audit-level=moderate` — 0 vulnerabilities.

The focused and full backend evidence explicitly covers refresh rotation/replay, RBAC, unique appointment-lock indexes, exact and overlapping races, booking versus reschedule, stale mutation winners, failed-reschedule preservation, cancellation lock release, quotas, state transitions, timezone/DST boundaries, audit sanitization, production errors, media replacement/removal, Cloudinary rollback, both before/after upload rollback paths, fake provider enforcement, and destructive database guards.

## Logical commits

- `ef975b8 fix: harden booking response validation`
- `5641550 fix: enforce staff appointment concurrency contracts`
- `ca08e7d feat: add secure staff authentication foundation`
- `9166e79 feat: add staff appointment workspace`
- `0d5cda9 fix: close staff session lifecycle races`
- `dd07c03 test: add deterministic staff preview and browser QA`
- `5c924a3 fix: serialize staff session transitions`
- `d0836de chore: harden frontend verification toolchain`
- `022e482 fix: remediate backend dependency advisories`
- `ea199b6 fix: harden preview shutdown lifecycle`
- `docs: finalize staff admin foundation readiness` (the documentation commit containing this report)

History was not reset, restored, rebased, squashed, force-written, pushed, or merged.

## Known limitations and Phase 3B scope

- Production DNS/TLS, CDN/cache behavior, monitoring, provider accounts, secrets, real clinic data/assets, and deployment smoke testing remain operator responsibilities.
- The current Next.js/Tailwind CSP still requires `unsafe-inline`; a nonce/hash strategy is separate work.
- Web Locks provide cross-tab serialization where supported; the same-tab operation queue remains the fallback. Deployment browser support should be reviewed against the clinic's managed-device policy.
- Automated tests intentionally never contact real Cloudinary, SMTP, Redis, monitoring, bot-challenge services, or a production database. Real configured integrations require deployment smoke tests.
- Real-device and assistive-technology smoke testing remains advisable in addition to the verified viewport matrix, keyboard behavior, and axe scans.
- Phase 3B remains responsible for localized content administration, clinic/dentist schedule management, and staff invitation/role/lifecycle management. It must reuse the established auth/RBAC/CAS boundaries rather than expanding appointment data into medical records.

These are explicit deployment or next-phase responsibilities, not hidden Phase 3A code defects.

## Definition of Done

SAFE TO MERGE STAFF ADMIN FOUNDATION INTO MAIN: YES

STAFF AUTHENTICATION PRODUCTION-QUALITY: YES

STAFF APPOINTMENT WORKSPACE COMPLETE: YES

LOCAL ADMIN PREVIEW READY FOR MANUAL REVIEW: YES

PHASE 3A COMPLETE: YES

READY FOR PHASE 3B CONTENT / SCHEDULE / STAFF MANAGEMENT: YES

BACKEND CHANGED DURING PHASE 3A: YES

Final branch: `feature/staff-admin-foundation`. Final working tree: clean after the documentation commit. Nothing was pushed or merged.
