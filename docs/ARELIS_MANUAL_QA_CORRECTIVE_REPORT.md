# Arelis manual-QA corrective pass

## Scope and baseline

This pass implements the owner-provided 53-item manual-QA specification on
`feature/arelis-content-staff-ux`. Work began from clean `2eec7b9`; `main` and
`origin/main` remained `6133d6b8de68643dc6164954eb70cf7379e73830`. Existing
history was preserved. Nothing was merged or pushed. This is product and local
preview evidence, not production-infrastructure certification.

## Manual findings and resolutions

| Item | Resolution |
| ---: | --- |
| 1 | Authored the approved HY/RU/EN “made clear” hero headlines without adding unsupported claims. |
| 2 | Replaced “featured” with natural HY/RU/EN “key services” copy. |
| 3 | Preserved the approved three-step visit presentation. |
| 4 | Dentist cards now NFKC-normalize and locale-fold title/specialization text, removing title duplicates and duplicate specializations while retaining distinct details. |
| 5 | Preserved the approved About Arelis layout and grounded copy. |
| 6 | Preserved the four local room illustrations and captions; no photography was generated or downloaded. |
| 7 | Removed visible illustration disclaimer overlays and replaced generic before/after disclaimers with authored, non-promissory procedure descriptions in HY/RU/EN. |
| 8 | Consecutive identical schedules are grouped, the lunch break remains explicit, closed days remain explicit, differing days fall back to separate groups, and adjacent shifts do not invent a zero-length break. Backend shifts remain authoritative. |
| 9 | The public gallery keeps its responsive content without the visible illustration overlay. |
| 10 | Removed the public consent-operations subtitle while retaining all consent governance. |
| 11 | Deliberate service, dentist and slot choices focus and scroll the newly opened section once; initial/preselected rendering does not. Reduced motion, keyboard focus and incompatible-state clearing are retained. |
| 12 | A shared strict Gregorian/range policy blocks impossible, past and beyond-horizon dates before availability or submission. Native attributes remain hints; the real API remains authoritative. The clean preview applies the same window checks. |
| 13 | Low-year and impossible dates no longer pass through `Date.UTC` normalization; formatting and calendar arithmetic reject invalid input. |
| 14 | Browser and API share a Unicode human-name rule: two letters minimum, combining marks and internal spaces/hyphens/apostrophes allowed, control/format characters and garbage rejected. It also governs staff invitations. |
| 15 | Phone input accepts only practical telephone characters, then uses the existing Armenian/canonical normalization and 8–15 digit boundary. Letters and misleading punctuation are rejected before quota identity is computed. |
| 16 | Optional/required email behavior follows clinic settings; supplied malformed email is rejected with localized field feedback and by the API. |
| 17 | Comments retain ordinary punctuation, text-only rendering and the 1000-character bound; no upload or HTML path was added. |
| 18 | Clean public preview bookings are `pending`; authenticated staff-created bookings are `confirmed`. Production `autoConfirmAppointments` remains configurable. |
| 19 | Public dentist reads are uncached for immediate lifecycle visibility. Real and preview availability/submission re-check active, bookable dentist/service/category relationships, so stale IDs fail. Restore intentionally leaves booking disabled until an admin explicitly re-enables it. Historical appointments remain. |
| 20 | Dentist administration now shows explicit localized available/unavailable text, never a negation symbol. |
| 21 | Schedule revision was removed from the ordinary card but remains in parsers, state, CAS requests, API and concurrency tests. |
| 22 | The clean clinic record now satisfies the strict schedule-management parser and the page loads normally. |
| 23 | The same production-shaped clinic record fixes the clinic-settings page without loosening its parser. |
| 24 | Clean gallery records use the real `clinic_gallery` type; an invalid legacy preview-only type is still rejected. |
| 25 | Removing the shared overlay eliminates HY illustration leakage from RU/EN public and staff media surfaces; locale-specific descriptions remain authored. |
| 26 | Invitation copy now explains email delivery, employee-selected passwords and sign-in. Pending status is “Awaiting account setup”; uncertain writes are not replayed. |
| 27 | Added admin-only `POST /staff/{id}/resend-invitation`. It freezes identity/role, atomically supersedes outstanding invite tokens, sends one new link, emits a safe audit action and returns no token. Setup/cancellation races serialize on the user record. |
| 28 | Preview models the resend outcome but exposes no raw setup token or production shortcut. Seeded preview credentials remain test-only. |
| 29 | Added validated, pagination-correct lifecycle filters. The UI defaults to `current`; deliberate active, pending, deactivated and all views remain available. No hard-delete endpoint exists. |
| 30 | Setup-incomplete accounts use “Cancel invitation”; deactivation consumes outstanding one-time tokens and preserves history. |
| 31 | Preview-created and mutated appointments, staff, audit entries, schedules and media use one injectable mutation clock rather than the seed timestamp. |
| 32 | Ordinary staff timestamps are localized in the configured clinic timezone; exact audit instants remain authoritative. |
| 33 | The real full ObjectId remains available under an advanced Staff ID detail. |
| 34 | Added accessible HY/RU/EN switching on login, authenticated desktop and mobile shells. Only the locale path changes; query/fragment data is not forwarded, and setup/reset token pages do not show the switcher. |
| 35 | Receptionist navigation, RBAC and simple dashboard remain unchanged. |
| 36 | Newly created appointments display their mutation-time `createdAt`, not the January seed instant. |
| 37 | Replaced large sequential status buttons with a compact legitimate-next-status selector and apply action. Safe forward shortcuts are supported server-side; backwards/terminal moves fail, CAS is required, and cancellation remains dedicated. |
| 38 | Dentist requests are generation-correlated in addition to aborting. Repeated active-period clicks are no-ops; rapid period, refresh and page races cannot let stale results overwrite current state. |
| 39 | Dentist navigation contains My appointments and Account only; login/brand/dashboard redirect to the scoped appointment route without duplicate reads. |
| 40 | Assigned-dentist ownership/version fences and the minimal patient projection are unchanged; forbidden management reads do not mount. |
| 41 | Password change is unchanged: exactly six Unicode characters minimum, bcrypt 72-byte protection, current-password verification and session revocation. |
| 42 | Clean clinic, gallery, dentist/service/category and staff fixture records now pass the existing strict positive parsers. |
| 43 | One injectable preview clock drives date windows, seeded future appointments and mutation timestamps. Tests freeze it deterministically. |
| 44 | Approved public/staff layouts, visual system, services administration, receptionist dashboard and before/after grid were preserved. |
| 45 | New controls retain labels, focus, screen-reader errors, reduced motion and responsive operation at the required widths. Axe and overflow checks remain enforced. |
| 46 | No patient accounts, raw tokens, hard deletes, dentist scope expansion, PII logging or automatic uncertain-mutation retries were added. Locks, quota, idempotency, CAS, refresh rotation, last-admin, consent/media rollback and provider boundaries remain intact. |
| 47 | Added/extended focused unit, API, component, mock-contract, concurrency and browser regressions for the requested areas. |
| 48 | Added the focused RU owner journey against `dev:preview`, covering copy, progressive booking/validation, pending status, management pages, timestamps, locale switching, dentist hide/restore and rapid clicks. |
| 49 | Ran the final local matrix without real external providers; results are below. |
| 50 | The final attacker/operator review found no remaining P1/P2 defect. It corrected contract wording for inactive pending invites and a zero-length-break presentation edge case, with regression coverage. |
| 51 | Updated the prior phase report and created this corrective evidence report. |
| 52 | Changes are committed only as new logical commits; no amend, squash or history rewrite is used. |
| 53 | Final acceptance leaves the required branch clean with both main refs unchanged; nothing is merged or pushed. |

## Verification evidence

The Turbopack production build initially rejected the repository-level shared
validation module because Next inferred `frontend/` as its root. The supported
configuration now sets the Turbopack root to the repository and enables the
existing external-directory behavior. The production build then compiled,
type-checked, generated every route and exited successfully.

| Gate | Result |
| --- | --- |
| Backend `npm run verify` | PASS: syntax 185 files, tracked-secret scan 419 files, valid OpenAPI, 335/335 tests; coverage 93.41% lines / 83.88% branches / 91.04% functions. |
| Separate backend `npm test` | PASS: 335/335 from the frozen backend source; only contract/report wording changed afterward. |
| Frontend API types | PASS: regenerated from the final OpenAPI document. |
| Frontend typecheck / lint | PASS; lint emitted zero warnings. |
| Frontend `npm run test:coverage` | PASS: 32/32 files, 227/227 tests; 81.17% statements / 80.82% branches / 88.46% functions / 85.92% lines. |
| Frontend production build | PASS with public non-secret production configuration under Next.js 16.3.4/Turbopack. |
| Browser E2E | PASS by bounded aggregate evidence: the complete 51-test invocation passed 49 unaffected scenarios; its two exact-label selector timeouts were corrected without weakening behavior, and both corrected scenarios passed together (2/2). The later clinic-hours edge correction does not affect those scenarios and passed focused component coverage. |
| Supervised Arelis preview | PASS by bounded aggregate evidence: five unaffected journeys passed in the complete invocation; the corrected RU owner journey then passed (1/1). Preview was stopped with Ctrl+C, `.next-preview` was absent, and ports 3000/5000 were free. |
| Dependency audits | PASS: backend and frontend runtime-only and full audits each reported zero vulnerabilities. |
| Diff/secrets | PASS: final diff check and tracked-secret gate are clean; no environment file, token, credential, upload, log, trace or coverage output is committed. |

Focused verification also covered the shared booking validator, Arelis mock API,
content/components, booking flow/date, staff governance/status and dentist race
workspaces. The final adjacent-shift regression passed in a 15-test component
file. Automated browser routing blocked non-loopback requests; MongoDB tests used
the guarded disposable local test database; fake adapters prevented real SMTP,
Cloudinary, Redis, Turnstile, monitoring or other provider contact.

## Adversarial/security conclusion

Bypassing native date bounds cannot submit; invalid names and alphabetic phones
fail at the API; clean preview cannot promote a public request; a hidden dentist
cannot be read, offered, checked or booked through stale IDs; strict preview
parsers accept the corrected records; RU/EN do not receive the removed HY media
overlay; dentist responses are correlated; resends preserve one account and never
return tokens; cancelled invitations cannot complete setup; last-admin and self
protections remain; status shortcuts retain CAS and never move backwards; lunch
breaks continue blocking slots; and staff locale switching carries neither query
parameters nor fragments. No new PII logging was introduced.

## Intentional owner-facing decisions

- Restoring a hidden dentist republishes the profile but does not silently reopen
  booking. An admin must explicitly enable booking, preserving the existing safe
  lifecycle contract.
- Illustration disclaimers are removed from visible UI as requested, while the
  local assets remain clearly scoped as preview illustrations internally.
- Real clinic identities, claims, prices, photographs and consent evidence remain
  owner-supplied release inputs. Real provider/infrastructure smoke, rollout and
  backup/restore certification remain outside this pass.

## Final Definition of Done

| Required verdict | YES/NO |
| --- | --- |
| MANUAL QA FINDINGS ADDRESSED | YES |
| PUBLIC ARELIS COPY POLISHED | YES |
| DENTIST CARD DUPLICATION REMOVED | YES |
| PUBLIC ILLUSTRATION LABELS REMOVED | YES |
| PUBLIC HOURS PRESENTATION SIMPLIFIED | YES |
| PROGRESSIVE BOOKING NAVIGATION COMPLETE | YES |
| PAST / INVALID BOOKING DATES BLOCKED | YES |
| PATIENT NAME VALIDATION HARDENED | YES |
| PHONE VALIDATION HARDENED | YES |
| EMAIL VALIDATION VERIFIED | YES |
| PUBLIC BOOKINGS DEFAULT PENDING IN ARELIS PREVIEW | YES |
| STAFF-CREATED BOOKINGS DEFAULT CONFIRMED | YES |
| DENTIST HIDE IMMEDIATELY REMOVES BOOKABILITY | YES |
| DENTIST ADMIN TERMINOLOGY CLEAN | YES |
| SCHEDULE MANAGEMENT PREVIEW LOADS | YES |
| CLINIC SETTINGS PREVIEW LOADS | YES |
| GALLERY ADMIN PREVIEW LOADS | YES |
| CROSS-LOCALE MEDIA LEAKAGE REMOVED | YES |
| STAFF INVITATION FLOW CLEAR | YES |
| STAFF SETUP PASSWORD FLOW SAFE | YES |
| DEACTIVATED STAFF HIDDEN FROM DEFAULT WORKFLOW | YES |
| NO STAFF AUDIT HISTORY HARD-DELETED | YES |
| STAFF / APPOINTMENT TIMESTAMPS ACCURATE | YES |
| STAFF LANGUAGE SWITCHER COMPLETE | YES |
| APPOINTMENT STATUS WORKFLOW SIMPLIFIED | YES |
| DENTIST RAPID-CLICK RACE FIXED | YES |
| DENTIST NAVIGATION DUPLICATION REMOVED | YES |
| DENTIST PRIVACY BOUNDARY PRESERVED | YES |
| PASSWORD POLICY REMAINS EXACTLY 6 UNICODE CHARACTERS MINIMUM | YES |
| NO PATIENT ACCOUNTS ADDED | YES |
| NO SECURITY GUARANTEES WEAKENED | YES |
| BACKEND VERIFICATION PASSED | YES |
| FRONTEND VERIFICATION PASSED | YES |
| E2E VERIFICATION PASSED | YES |
| LIVE DEPENDENCY AUDITS CLEAN | YES |
| NO REAL SECRETS COMMITTED | YES |
| WORKTREE CLEAN | YES |
| SAFE FOR INDEPENDENT REVIEW | YES |

## Narrow public-copy and contact-validation corrective pass (2026-09-21)

### Findings and root causes

1. The clean preview clinic fixture still supplied the Russian tagline
   `Стоматология в центре Еревана`, and the public clinic page rendered that
   localized fixture value. The HY/RU/EN fixture values now use restrained,
   locale-specific Arelis Dental family-clinic copy. Unit and browser regressions
   assert the exact localized taglines and that the retired Russian phrase is not
   rendered.
2. `canonicalPhone` previously allowed a broad punctuation set, stripped every
   non-digit character, and only then applied number constraints. Consequently,
   malformed punctuation such as `+374((((99----000001` could be legitimized by
   normalization. The shared policy now validates the submitted structure first
   and canonicalizes only a structurally valid value.
3. The shared browser email helper checked only a broad shape, while backend Joi
   `.email()` rejected malformed domain labels. The shared helper is now a
   conservative pragmatic subset of Joi, and relevant backend schemas retain Joi
   as an independent defense before applying that shared policy.

### Contact contract and affected entry points

- Phone input permits an optional leading plus, ASCII digits, bounded human
  separators, and at most one balanced digit-only parenthesized group. Separators
  must occur in meaningful positions; controls, Unicode lookalikes, letters,
  HTML-like characters, emoji, misplaced/multiple plus signs, nested/unbalanced
  parentheses, and abusive/repeated punctuation fail before normalization.
- Accepted examples include `+37499000001`, `+374 99 000 001`,
  `+374 (99) 000-001`, `+1 (212) 555-0123`, and `+44 20 7946 0958`.
  Rejected examples include `+374((((99----000001`, `++++37499000001`,
  `+374(99))000001`, `+374((99)000001`, alphabetic/control/HTML-like input,
  punctuation-only values, and repeated nonsensical separators.
- Email input permits ordinary ASCII addresses, subdomains, and plus-addressing;
  local parts are bounded and segmented, domains contain valid nonempty labels,
  and the alphabetic final label is bounded. Multiple `@` characters, empty
  pieces, malformed/repeated separators, leading/trailing domain hyphens,
  whitespace, control/format characters, and malformed domains fail consistently.
- The policy is shared by public and staff-created appointments, authentication
  and recovery forms, staff invitations, clinic settings, admin bootstrap input,
  and the deterministic preview/mock API. Backend appointment/auth/staff/clinic
  schemas retain their existing Joi validation and apply the shared contract.
- Public booking remains pending, staff-created booking remains confirmed, and no
  booking date, idempotency, RBAC, session, invitation, archive/audit, dentist
  privacy, appointment-locking, CAS, or media behavior changed.

The implementation touches the shared validator; narrowly related backend
validation/bootstrap files; affected frontend forms and localized messages; the
preview fixture/mock; generated OpenAPI types; API/OpenAPI documentation; and
focused backend, component, mock-contract, localization, and browser tests. No
environment, credential, upload, log, trace, coverage, or provider artifact is
part of the change.

### Regression and verification evidence

- Focused backend shared-policy coverage passed 4/4 tests. Focused frontend
  booking, authentication, invitation, appointment, clinic, mock-contract, and
  localization coverage passed 60/60 tests across seven files. The regressions
  preserve Armenian/Cyrillic names, combining marks, apostrophes, and hyphens.
- Backend `npm run verify` passed syntax checks for 185 files, the tracked-secret
  scan for 426 files, OpenAPI validation, and 336/336 tests (93.38% lines, 84.18%
  branches, 90.91% functions). A separate `npm test` passed 336/336.
- Frontend API type generation, typecheck, lint, and production build passed.
  `npm run test:coverage` passed 33/33 files and 232/232 tests (81.17% statements,
  80.82% branches, 88.46% functions, 85.92% lines).
- The first complete browser run passed 50 scenarios; one scenario did not execute
  because its `beforeEach` scenario-reset request received a one-connection
  `ECONNRESET`. The same endpoint immediately served the following scenario. The
  exact untouched status/reschedule/cancellation scenario then passed 1/1, and a
  fresh complete invocation passed 51/51 in 13.9 minutes. No timeout, retry,
  assertion, harness, or product-code accommodation was added.
- Backend and frontend runtime-only and full live npm audits each reported zero
  vulnerabilities. The E2E launcher stopped normally, ports 3100/5100 were free,
  `.next-e2e` was absent, and the ignored Playwright result marker was removed.

This pass is carried by one new focused commit on
`feature/arelis-content-staff-ux`; `main` and `origin/main` remain at `6133d6b`.
Nothing is merged or pushed. Remaining owner work is unchanged: real clinic
claims/media/consent and provider/infrastructure release checks require owner or
deployment-environment evidence.

### Independent-review contact-boundary correction (2026-09-21)

The follow-up review found two narrow semantic gaps. First, phone digits were
subjected to Armenian local convenience normalization without retaining whether
the structurally valid raw value had an explicit leading plus. Explicit-plus
values are now preserved as international identities, must not begin with zero,
and remain subject to the 8-15 digit boundary. Only no-plus eight-digit or
leading-zero nine-digit Armenian forms receive `+374` normalization. The shared
helper continues to drive booking, staff, filtering, quota/rate-limit, clinic,
and preview/mock boundaries.

Second, shared `isEmail()` accepted the intended application syntax for reserved
alphabetic suffixes such as `.local` and `.invalid`, while default Joi 18 email
validation additionally consulted its IANA TLD registry. Relevant backend schemas
now retain Joi's independent email syntax/type defense with that registry check
disabled, matching the shared frontend/bootstrap/preview policy. Neither layer
performs DNS, SMTP, mailbox, ownership, or deliverability verification.

The focused implementation changed `shared/booking-input.mjs`; the appointment,
auth, staff and clinic backend validation modules; the shared-policy and
rate-limiter backend tests; the deterministic Arelis mock contract test;
`docs/API_CONTRACT.md`; `docs/openapi.yaml`; and the regenerated frontend OpenAPI
types. No application form required modification because public booking, staff
appointment creation, login, recovery, invitation and clinic settings already use
the shared helpers.

Focused verification passed 4/4 shared/schema tests, 1/1 rate-limit identity test,
and 53/53 frontend contact-form/mock tests across six files. Final backend
verification passed syntax checks for 185 files, the tracked-secret scan for 427
files, OpenAPI lint, and 336/336 tests (93.42% lines, 84.23% branches, 90.91%
functions); the separate backend run also passed 336/336. Frontend API generation,
typecheck, zero-warning lint and production build passed; coverage passed 33/33
files and 232/232 tests (81.17% statements, 80.82% branches, 88.46% functions,
85.92% lines), and browser E2E passed 51/51 in 13.3 minutes. Backend and frontend
runtime-only and full live audits each reported zero vulnerabilities.
