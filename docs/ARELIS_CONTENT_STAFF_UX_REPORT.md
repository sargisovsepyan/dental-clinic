# Arelis Dental content, localization and staff UX

## Scope and Git baseline

Repository: `D:\projects\dental-clinic`. Working branch: `feature/arelis-content-staff-ux`.
The phase began from a clean `main`, with `HEAD = main = origin/main = 6133d6b`.
The resume preserved all existing work and `bfd5d86`; no reset, restore, clean,
stash, history rewrite, push or merge was performed.

Commit ledger:

- `bfd5d86 feat: add privacy-scoped dentist appointment reads` — backend models,
  projections, explicit admin assignment, confirmed staff bookings, localized
  immutable snapshots, OpenAPI/API contract and generated frontend types.
- `799c368 fix: pin dentist reads to the authenticated session version` —
  request-private authorization stamp, initial/post-fetch version checks,
  immutable snapshot and two HTTP race regressions; 330 backend tests passed.
- `03cb7be feat: polish localized Arelis content and staff workflows` —
  verified public content, staff workspaces, explicit localized names, safe clean
  preview fixtures/assets, responsive fixes and strengthened regression coverage.
- `docs: finalize Arelis product polish evidence` — this report's documentation
  commit. Its object hash is supplied in the final handoff, not self-embedded.

Infrastructure provisioning, real provider credentials and real provider smoke
remain outside this phase. This report is not a deployment certification.

## Final frozen verification matrix — 2026-09-18

Product source was frozen after the two responsive presentation fixes. The only
subsequent test changes were bounded budgets for the expanded locale crawls and
stronger, unfiltered console/page-error assertions. No application source changed
during or after these final invocations. Heavy jobs ran serially.

| Gate | Final observed result |
| --- | --- |
| Backend `npm run verify` | PASS: 330/330 tests; zero failed, skipped or cancelled; 225.49 seconds |
| Backend syntax / secrets / OpenAPI | PASS: 184 syntax-checked files, 418 tracked-secret-scanned files, valid OpenAPI |
| Backend coverage | PASS: 93.33% lines / 83.82% branches / 90.93% functions; unchanged 85/75/75 thresholds |
| Separate backend `npm test` | PASS: 330/330; production backend source unchanged since that invocation; expanded fixture-only regression also passes the final verify above |
| Frontend `npm run api:types` | PASS: regenerated without schema drift |
| Frontend typecheck / lint | PASS: latest invocation after the final harness correction; zero lint warnings |
| Frontend `npm run test:coverage` | PASS: 31/31 files, 208/208 tests, no skips; 69.22 seconds |
| Frontend coverage | PASS: 81.11% statements / 79.82% branches / 88.42% functions / 85.70% lines; unchanged 80/70/80/80 thresholds |
| Frontend production build | PASS: compilation, TypeScript, generation and route output, including My appointments |
| Full frontend `npm run test:e2e` | PASS: 51/51, 13.7 minutes, one Chromium worker, no retries or skips, exit 0 |
| Live backend runtime / full dependency audits | PASS: both zero vulnerabilities |
| Live frontend runtime / full dependency audits | PASS: both zero vulnerabilities |
| Final supervised public preview | PASS: 3/3 public locale crawls, 5.3 minutes; all 19 service details, responsive geometry, loaded illustrations, map safety and empty console/page-error assertions |
| Preserved supervised booking / staff acceptance | PASS: both previously completed flows; no later business/workspace source change invalidates their evidence |
| Preview shutdown / owned caches / ports | PASS: Ctrl+C completed; `.next-preview` and `.next-e2e` absent; loopback ports 3000/5000/3100/5100 all free |

The initial sandboxed audit request could not reach the npm advisory endpoint.
The permitted read-only registry retry and all four fresh audits then exited 0.
No dependency or lockfile changed. No real clinic provider was contacted.

## Major changed modules

| Area | Files/modules |
| --- | --- |
| Backend authorization/data | Auth middleware; User/Dentist translations and assignment; appointment model/service/controller/routes/validation and assigned read service; admin staff assignment service/controller/routes/validation |
| Contracts | `docs/API_CONTRACT.md`, `docs/openapi.yaml`, generated `frontend/src/api/generated/schema.d.ts` |
| Public frontend | Locale page routes, home/clinic/service/doctor views, header/footer, clinic space, media cards, metadata and strict published-localization helpers |
| Staff frontend | Protected staff client/parsers, My appointments route/workspace, shell/dashboard, explicit team linking, services/sections, doctor/schedule/clinic/media/before-after editors and localized messages |
| Clean local preview | `test/preview/arelis-{catalog,team,content}.mjs`, explicit mock API profile, supervised launcher/indicator config, ten illustration SVGs and branded social SVG |
| Verification | Backend dentist/privacy/catalog regressions; frontend content/assigned-client/workspace/editor regressions; existing security E2E expectations, five Arelis E2E scenarios and five supervised preview-smoke scenarios |

## Sources and localization strategy

Application copy is authored in `frontend/src/i18n/`: public messages, product
messages, booking messages and staff/management/media/governance messages.
Manual-preview data is built only in `frontend/test/preview/arelis-*.mjs`.
`dev:preview` explicitly selects the `arelis` mock profile. The default E2E
profile retains malicious HTML, test identities and adversarial scenarios;
none of those display values enter the clean manual-preview profile.

HY remains the backend canonical/publication and migration authority. Doctor
translations additionally support first/last names, and staff identities can
carry explicitly authored display names. Public view models select only the
requested locale: RU/EN never silently substitute HY. Missing translated
public names are omitted or produce a locale-specific not-found page;
historical staff appointment names use a translated unavailable marker rather
than invented translations. Current preview records are complete in all three
locales. Active-content editors warn about incomplete translations across
services, sections, doctor profiles, clinic, gallery and before/after editors;
inactive drafts remain supported. This is an advisory completeness warning,
not an incompatible replacement of HY-based backend publication validation.

Appointment confirmations and staff appointment views use stored localized
snapshots, not newly edited catalog names. HY/RU/EN doctor transliterations are
intentional. The untranslated brand is exactly **Arelis Dental** everywhere.

## Exact preview catalog

All sections and services are active. All services have independently authored
HY/RU/EN names, short descriptions and unique descriptions, structured AMD
prices, one approximate appointment duration and valid bookable-doctor links.
Consultation is a fixed zero price; other prices are structured starting prices
with no invented price range. Braces per-jaw and aligner course scope is prose,
not a schema change. Multi-visit care is not represented as a treatment guarantee.

| Section | HY | RU | EN |
| --- | --- | --- | --- |
| hygiene-prevention | Հիգիենա և կանխարգելում | Гигиена и профилактика | Hygiene and prevention |
| tooth-restoration | Ատամների բուժում և վերականգնում | Лечение и реставрация зубов | Tooth treatment and restoration |
| root-canals | Արմատախողովակների բուժում | Лечение корневых каналов | Root canal treatment |
| surgery-implants | Վիրաբուժություն և իմպլանտացիա | Хирургия и имплантация | Surgery and implants |
| prosthetics | Պրոթեզավորում | Протезирование | Prosthetic dentistry |
| aesthetic-dentistry | Էսթետիկ ստոմատոլոգիա | Эстетическая стоматология | Aesthetic dentistry |
| orthodontics | Օրթոդոնտիա | Ортодонтия | Orthodontics |
| gum-care | Լնդերի բուժում | Лечение дёсен | Gum care |
| pediatric-dentistry | Մանկական ստոմատոլոգիա | Детская стоматология | Pediatric dentistry |

| Service slug | English display name | Section | AMD | Minutes |
| --- | --- | --- | ---: | ---: |
| consultation | Consultation and treatment plan | hygiene-prevention | 0 | 30 |
| tooth-xray | Targeted tooth X-ray | hygiene-prevention | 3,000 | 15 |
| professional-hygiene | Professional oral hygiene | hygiene-prevention | 20,000 | 60 |
| fluoride-care | Fluoride and sensitivity care | hygiene-prevention | 10,000 | 30 |
| caries-filling | Caries treatment and filling | tooth-restoration | 20,000 | 60 |
| aesthetic-restoration | Aesthetic tooth restoration | tooth-restoration | 35,000 | 90 |
| root-canal-treatment | Root canal treatment | root-canals | 30,000 | 90 |
| gum-treatment | Gum treatment | gum-care | 25,000 | 60 |
| simple-extraction | Simple tooth extraction | surgery-implants | 15,000 | 45 |
| wisdom-extraction | Wisdom tooth extraction | surgery-implants | 40,000 | 60 |
| dental-implant | Dental implant placement | surgery-implants | 180,000 | 60 |
| metal-ceramic-crown | Metal-ceramic crown | prosthetics | 50,000 | 60 |
| zirconia-crown | Zirconia crown | prosthetics | 85,000 | 90 |
| ceramic-veneer | Ceramic veneer | aesthetic-dentistry | 110,000 | 90 |
| professional-whitening | Professional whitening | aesthetic-dentistry | 90,000 | 90 |
| metal-braces | Metal braces | orthodontics | 220,000 | 60 |
| aligners | Aligners | orthodontics | 900,000 | 60 |
| child-caries | Caries treatment for children | pediatric-dentistry | 15,000 | 45 |
| fissure-sealing | Fissure sealing | pediatric-dentistry | 10,000 | 30 |

Professional hygiene is under **Hygiene and prevention**, not therapeutic
dentistry. Service detail pages show section, description, price, duration,
booking action, authored “About / What to expect” content, visit process,
approximate timing and when to arrange a consultation. No blank “Learn more”
panel or executable fixture HTML remains in manual preview.

## Fictional team and schedules

| HY | RU | EN | Focus |
| --- | --- | --- | --- |
| Մարիամ Հակոբյան | Мариам Акопян | Mariam Hakobyan | Restorative/aesthetic dentistry |
| Արամ Սարգսյան | Арам Саргсян | Aram Sargsyan | Surgery/implant planning |
| Լիլիթ Գրիգորյան | Лилит Григорян | Lilit Grigoryan | Orthodontics |
| Դավիթ Պետրոսյան | Давид Петросян | Davit Petrosyan | Endodontics/restorative dentistry |
| Նարե Մկրտչյան | Наре Мкртчян | Nare Mkrtchyan | Pediatric dentistry |

All five have complete localized specialties/bios, valid assigned services and
active/bookable flags. Mon–Sat: 09:00–13:00 and 14:00–18:00; Sunday closed.
Seeded appointments avoid Sunday. No degrees, awards, experience claims or
patient statistics were invented. Initials replace absent doctor photographs.
`dentist@preview.local` is explicitly linked to Davit Petrosyan in the clean
fixture. Admin is Anna Martirosyan, receptionist is Lusine Grigoryan, and the
second admin is Sona Avetisyan (Սոնա Ավետիսյան / Сона Аветисян), as recorded in
the authored fixture.

## Public presentation and media

Home: hero → featured services → visit steps → five doctors → about → four
clinic spaces → three before/after cases → contacts → booking call to action.
“About the clinic” contains clinic information, rooms and directions.

Waiting, treatment, diagnostic and consultation rooms use four distinct
project-local vector illustrations. Hygiene, front-tooth restoration and
whitening each have a distinct before/after schematic pair. Every schematic
is explicitly labeled as an illustration, not a patient photograph or actual
treatment outcome. There are no downloaded photographs, real patients or
invented consent evidence for real people. Synthetic mock governance records
do not constitute real consent. Existing production Cloudinary and consent
administration remains the path for replacing these assets with governed media.

Only ten exact local illustration names/paths, dimensions, format and fixture
public IDs are accepted by the non-production `preview-local` image exception.
They are rejected as managed media in production; the Cloudinary guard was not
relaxed. A separate local Arelis social SVG replaces generic default branding.

Location text describes fictional Kentron/Yerevan near Republic Square.
The safe credential-free map action is
`https://www.google.com/maps/search/?api=1&query=Republic+Square%2C+Yerevan`.
QA validates HTTPS URL shape and `noopener noreferrer` without contacting Maps.

The supported Next `devIndicators: false` option applies only when both
`NODE_ENV=development` and server-only `ARELIS_SUPERVISED_PREVIEW=1` are set by
the supervised launcher. Normal development and production keep their defaults.

## Dentist privacy and appointment workflow

Dentists have a read-only **My appointments** dashboard and navigation item,
upcoming/today views, clinic-local date/time, localized immutable service name,
status, sensible empty states and a view action for contact details. Today comes
from the server, not the browser clock. Pagination and refresh clear previous
patient data; abort guards and the existing principal-epoch transport fence
stale responses and cross-session transitions. No management catalog or forbidden
patient/staff/audit background fetch mounts for this role.

`GET /appointments/mine` and `/appointments/mine/details/:id` resolve the current
database assignment. Ownership is part of both row/count/detail predicates;
arbitrary dentist, phone or other scope keys are rejected on the list. A non-owned
detail ID returns 404. Only ID, patient name/phone, date/start/end, status and
service snapshot name/duration/translations are returned. No email, comments,
admin notes, consent, confirmation code, price, history, audit/staff metadata,
locks, quotas, idempotency internals or medical records are exposed. Protected
outcomes are no-store. Admin/receptionist management access remains unchanged.

Admin-only explicit staff-to-doctor GET/PUT supports an active doctor ID or null,
validates the employee role, transactionally revokes sessions/auth versions and
records only safe audit metadata. No email/name guessing or production auto-link
exists. Multiple employee accounts may intentionally share a profile; no new
unique index or migration was needed.

Adversarial review caught a race between authentication and the first profile
lookup. The new correction pins both initial and post-fetch checks to the
authorization version validated by authentication. The stamp remains private
to the request, not the user DTO. Tests simulate revocation in both intervals.

Staff-created bookings default to confirmed inside the existing transaction.
Public booking still obeys configurable `autoConfirmAppointments` (production
default false). The clean preview explicitly sets it true. No reservation locks,
atomic phone quotas, refresh rotation, origin/cookie policy, CAS, idempotency,
outbox, consent, media rollback, startup/index or shutdown guarantees were removed.
The password minimum remains exactly six characters with bcrypt byte protection.
No patient accounts or medical-record system were added.

## Administration and browser corrections

Services is the default primary tab; Service sections is secondary, with a short
grouping explanation, meaningful names/status/counts and a context-specific add
action. Slugs are under More details. Hide confirmations retain existing data and
appointments; server referential guards still prevent hiding active parents.
Staff login and common appointment/profile/gallery/staff/account screens use
task-oriented copy. Schedule-version numbers are expandable details; raw audit
codes, UTC filters and cleanup tools remain available for advanced operations.

Two real contrast failures were corrected: translucent visit-step numbers and
destructive alert descriptions. Axe assertions stayed intact. Stale E2E labels,
old HY fallback expectations, gallery archive labels and hidden locale fields
were updated with precise accessible scopes. Appointments matches exactly and
does not accidentally match My appointments. Image checks accommodate Next's
normalized URLs and verify loaded image dimensions. Consent, partial-upload,
rollback, session, XSS, privacy and uncertain-retry assertions remain enforced.

Visual review also found a real HY hero clipping defect that a scrollbar-only
check missed: on a 375px viewport, the actual loaded-font text reached x=500px
inside the hero's overflow-hidden section. The grid child now permits shrinking;
HY uses a readable locale-aware fluid type scale, with safe word wrapping.
Shared browser regressions inspect every actual hero text rectangle (including
body/action labels) at 320/375/768/1440px after fonts are ready. The original
scrollbar assertions remain, and no sleep, global timeout or error filter was
added. The same stronger check exposed long HY/RU service-detail titles beyond
the 375px viewport (HY consultation reached x=470px; RU hygiene reached x=508px).
The service-title grid now shrinks, mobile typography is readable and long words
wrap safely, while larger screens retain display typography. Public browser
regressions inspect headings on all ten public routes and all nineteen service
details in each locale at 375px. These presentation-only corrections were
followed by fresh final frontend verification; booking business logic is unchanged.

Preview-only rescheduling now uses the selected service duration and snapshots.
Regression coverage checks the 19 services, valid doctor relationships and hours,
90-minute booking/reschedule, idempotent replay, failed-move preservation and
cancellation release. A final preview-only state check additionally corrected
the mock occupancy predicate from pending/confirmed to every non-cancelled
status, matching the real backend. Regression assertions prove checked-in,
in-progress, completed and no-show records retain exact and overlapping locks.
This in-memory mock is not a replacement for backend
database-enforced concurrency, quota or date-override verification.

## Verification history and diagnostic classification

Development evidence is not substituted for the final frozen matrix:

- Original backend unit: 325 tests passed before `bfd5d86`.
- Original frontend coverage: 31 files / 205 tests passed.
- Resume focused backend: 10/10 tests passed, including both newly found race
  intervals, immutable translations, minimal projections and clean catalog flow.
- Focused browser corrections: 11/13 passed, then the two remaining targeted
  scenarios passed 2/2 from a fresh isolated invocation. The earlier HY cold-start
  404 did not reproduce serially. A mutable development run's Next router error
  did not reproduce in the focused responsive/governance run. Neither diagnostic
  is hidden by console filters; the final frozen matrix above supersedes these
  development diagnostics.
- One overlapping Vitest invocation failed worker startup before executing tests;
  final heavy jobs are run serially, with no global timeout change or weakened test.

Earlier frozen backend `npm run verify`: **passed**, 330/330 tests, no skips or
cancellations. Syntax checked 184 files; tracked-secret scan checked 392 files;
OpenAPI lint was valid with no warnings. Coverage: 93.32% lines, 83.81% branches,
90.93% functions, above unchanged 85/75/75 thresholds. An earlier invocation
reported an existing auth-session file-level failure without a useful diagnostic;
a fresh isolated coverage run passed all 12 tests and the fresh complete verify
then passed all 330. No assertion or timeout was weakened to obtain that result.

First frozen frontend generated types: regenerated without schema drift. Typecheck and
lint passed (zero warnings). Full Vitest coverage passed **31/31 files,
208/208 tests**, with no skips: 81.11% statements, 79.82% branches, 88.42%
functions and 85.70% lines, above unchanged 80/70/80/80 thresholds.

All four live registry audits passed with **zero vulnerabilities**:
backend/frontend, each with `--omit=dev --audit-level=moderate` and with
`--audit-level=moderate`. No dependency or lockfile change was required.

First production `npm run build` passed (Next 16.3.4/Turbopack, compilation, TypeScript,
page generation and route output including My appointments). HTTPS `.test`
site/API URLs and a public config-only Turnstile key satisfied build validation;
no real challenge or booking provider was exercised.

First complete `npm run test:e2e`: **51/51 passed** in 10.8 minutes, one Chromium
worker, no retries or skips. This includes three public locales, loaded local
images, mobile/tablet/desktop, axe/keyboard checks, escaped malicious fixtures,
booking uncertain-key/double-submit/conflict behavior, session/tab fencing,
appointment CAS, cross-role zero-fetch boundaries, schedules, staff/audit privacy
and media consent/rollback. The earlier router diagnostic did not reproduce in
this frozen serial matrix. The E2E launcher exited successfully and cleaned its
owned cache/processes.

Separate backend `npm test`: **330/330 passed**, no skips/cancellations. The
preview-only state guard was identified after that invocation had executed its
catalog test. Its expanded focused regression passed **2/2** after correction;
the final pre-commit backend verify includes these stronger fixture assertions.
Production source and the default adversarial E2E profile were unchanged by
this final fixture-only correction; it is not an application booking change.

The HY layout defect was subsequently caught in supervised visual QA; fresh
frontend checks/full E2E below supersede that initial browser result.

Supervised `npm run dev:preview` used its clean Arelis profile on 3000/5000.
All five smoke scenarios passed across focused invocations: public HY/RU/EN,
90-minute confirmed booking without patient contact exposure, and staff/admin
creation/linking/dentist scope. After the HY correction, the final public run
passed **3/3** in 1.7 minutes with actual text geometry at 320/375/768/1440px.
Staff smoke proved services as the primary flow, sections help/add action,
confirmed staff creation, explicit doctor assignment save/restore, Davit's
identity, zero forbidden dentist fetches and responsive/axe-clean cards.

The new smoke harness's heading/mobile-text/native-select selector mismatches
were corrected using exact heading levels, the visible table and accessible
combobox roles. An aborted cold HY gallery navigation was reported, not hidden;
fresh targeted HY and subsequent three-locale geometry runs passed without
retries or sleeps. QA used the repository's Playwright browser harness against
the explicitly running supervised preview,
plus visual inspection of generated HY/RU/EN, clinic, admin, dentist and booking
screenshots. Screenshots/traces are local ignored QA artifacts, not Git content.

Ctrl+C completed owned-preview shutdown. The PowerShell/PTy host reported status
1 on interruption; no fatal shutdown diagnostic was observed. The decisive
cleanup checks passed: `.next-preview` absent, and explicit loopback binds
confirmed ports **3000/5000/3100/5100 all available**. No preview was left running.

After both presentation corrections, the 2026-09-18 frozen frontend invocation
regenerated types with no drift; typecheck/lint passed with zero warnings;
coverage passed **31/31 files, 208/208 tests** (69.22 seconds). Coverage
percentages and thresholds were unchanged from the first frozen result above.
The fresh production build passed: compilation 40 seconds, TypeScript 11.6
seconds, static generation and all route output including My appointments.
The staged-source secret scan passed across **418 files**, and both working and
staged `git diff --check` passed. The subsequent final full E2E and pre-commit
backend verify both passed, as recorded in the final matrix above.

The expanded crawl's first fresh full browser invocation hit its former
120-second HY test budget at the final axe analysis after all route/title bounds
had passed. Trace inspection found only the test deadline, not a clipping or axe
assertion failure; cold home/booking compilation alone took about 33 seconds.
Only the three nineteen-detail locale crawls now have an explicit bounded
180-second budget (and the equivalent supervised public crawls with screenshots).
The global E2E/preview timeout remains 90 seconds. Assertions, retries, skipped
tests, external-request blocking and application code are unchanged; no sleeps
were added. The complete browser matrix was then rerun from a fresh invocation.
That diagnostic invocation completed with **50/51 passed** in 13.8 minutes;
the sole failure was the HY deadline. Its EN dev-server hydration diagnostic
was not filtered. The new Arelis crawls now additionally assert that both console
errors and page errors remain empty, matching the existing console-fault gate;
supervised public smoke captures both as well. No product code changed after
the green coverage/build; only the bounded crawl budget and stronger runtime
error assertions changed.

After that narrowly scoped harness correction, fresh typecheck and lint again
passed with zero warnings. The complete frozen `npm run test:e2e` passed
**51/51 in 13.7 minutes**, one Chromium worker, no retries or skips, exit 0.
All three Arelis locale crawls passed the physical heading/hero checks, all
nineteen service detail titles, locale correctness, loaded images, axe threshold
and empty console/page-error assertions. No hydration/router diagnostic appeared
in this fresh invocation. The launcher removed its owned `.next-e2e` cache.
No product source was changed during or after this final matrix. The final
pre-commit backend gate also passed 330/330 with the stronger state-lock fixture
regression, 184 syntax checks and 418 secret-scanned files. Final coverage was
93.33% lines / 83.82% branches / 90.93% functions; thresholds were unchanged.

The last bounded supervised acceptance ran only the three public locale crawls
against a freshly owned `npm run dev:preview`: **3/3 passed in 5.3 minutes**,
one Chromium worker, no retries/skips. Each locale visited all ten public routes
and all nineteen service details at 375px, then checked actual hero text bounds
at 320/375/768/1440px. All titles fit/wrapped, illustrations loaded, public copy
was locale-correct without adversarial/developer fixture leakage, map URL/rel
was safe, and console/page errors were empty. The clinic axe gate found no
serious/critical violations. Supported preview dev-indicator absence passed.
Final HY/RU service-mobile and HY hero captures were visually inspected and
show readable, unclipped titles, body text and action labels. The previously
completed confirmed-booking and staff/linking/dentist flows were not needlessly
repeated: their code and business boundaries were unchanged by the title fix.

Ctrl+C stopped the final owned preview. Again, the PowerShell/PTy host returned
1 for interruption, not a fatal application diagnostic. Fresh filesystem checks
found both owned caches absent; explicit loopback binds confirmed all four ports
free. No preview or browser-test process was left running.

## Final adversarial review

The remaining staged code, preserved backend commits, contracts and regression
tests were reviewed rather than presumed correct. No unresolved genuine P1/P2
finding remains. The review covered requested-locale selection and missing
content; server-side dentist ownership, initial/post-fetch assignment/version
races and minimal patient projection; stale/unmounted frontend responses and
principal changes; unchanged admin/receptionist access; safe external map/media
URLs and escaped adversarial fixtures; non-production-only preview assets and
indicator behavior; service durations, failed-move preservation, cancellation
release and every non-cancelled mock state's occupancy; unchanged real backend
locks, phone quotas, CAS and idempotency; actual loaded-font mobile geometry;
accessible selectors, strengthened browser-error assertions and user-facing
copy. Full backend/browser regressions independently exercise these boundaries.

The deadline-only expanded-crawl failure is classified as test-runtime capacity,
not a product defect. Its correction is scoped to those three crawls, preserves
every visible/security assertion, adds no sleep/retry/skip, and leaves all global
timeouts unchanged. The fresh full browser matrix passed without the prior
unfiltered development hydration diagnostic.

## Non-blocking limitations and later work

The clinic/team/location/content are fictional preview data, not certified
business or clinical claims. A clinic owner/editor must approve real identities,
contact details, pricing and media before public release. Illustrations are not
real clinic photography or real patient outcomes. SVG social-image support varies
by crawler; an owner-approved raster social asset can be supplied later.
Historical translations are not fabricated, and advisory editor warnings do not
force a destructive or incompatible migration. Advanced audit/cleanup semantics
remain explicit rather than being hidden from operators.

Tests use disposable local databases, never production MongoDB. No real Redis,
SMTP, Cloudinary, Turnstile or monitoring provider was contacted. Real
infrastructure provisioning, provider smoke, backup/restore and
production rollout remain a later phase.

## Final Definition of Done

These verdicts apply to this code/product/local-preview phase, not real
infrastructure provisioning or production certification. Fictional fixtures and
illustrations require owner approval/replacement before public release.

| Required verdict | YES/NO |
| --- | --- |
| ARELIS BRANDING COMPLETE | YES |
| HY PUBLIC CONTENT CONSISTENT | YES |
| RU PUBLIC CONTENT CONSISTENT | YES |
| EN PUBLIC CONTENT CONSISTENT | YES |
| CROSS-LOCALE PREVIEW LEAKAGE REMOVED | YES |
| SERVICE CATALOG COMPLETE | YES |
| SERVICE DETAIL CONTENT COMPLETE | YES |
| FIVE DOCTORS SEEDED | YES |
| CLINIC SPACE CONTENT COMPLETE | YES |
| THREE BEFORE-AFTER CASES COMPLETE | YES |
| MAP PLACEHOLDER REMOVED | YES |
| PUBLIC SECURITY FIXTURE CONTENT REMOVED | YES |
| STAFF LOGIN COPY POLISHED | YES |
| PREVIEW DEV INDICATOR HANDLED | YES |
| DENTIST MY-APPOINTMENTS WORKSPACE COMPLETE | YES |
| DENTIST PRIVACY BOUNDARY SAFE | YES |
| STAFF-CREATED APPOINTMENTS DEFAULT CONFIRMED | YES |
| PUBLIC AUTO-CONFIRM REMAINS CONFIGURABLE | YES |
| ARELIS PREVIEW AUTO-CONFIRM ENABLED | YES |
| ADMIN SERVICES UX SIMPLIFIED | YES |
| ADMIN TERMINOLOGY HUMAN-READABLE | YES |
| NO PATIENT ACCOUNTS ADDED | YES |
| NO SECURITY GUARANTEES WEAKENED | YES |
| BACKEND VERIFICATION PASSED | YES |
| FRONTEND VERIFICATION PASSED | YES |
| E2E VERIFICATION PASSED | YES |
| LIVE DEPENDENCY AUDITS CLEAN | YES |
| NO REAL SECRETS COMMITTED | YES |
| WORKTREE CLEAN | YES |
| SAFE FOR INDEPENDENT REVIEW | YES |

Final Git acceptance state after this report's documentation commit:
`feature/arelis-content-staff-ux`, clean index/worktree, preserved `bfd5d86` and
`799c368`, new implementation `03cb7be`, and this separate documentation commit.
Both `main` and `origin/main` remain `6133d6b8de68643dc6164954eb70cf7379e73830`.
Nothing was pushed or merged, and no existing history was rewritten. Staged
files and secret/diff checks were inspected before committing; only intended
source/tests/illustrations/contracts/documentation are Git content, never
environment credentials, provider data, logs, traces or coverage output.
The documentation-only commit reuses the unchanged, green full backend verify;
fresh staged-file, secret and diff checks also cover the report itself.
