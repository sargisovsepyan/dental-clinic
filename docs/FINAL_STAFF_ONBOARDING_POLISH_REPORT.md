# Final staff onboarding polish report

## Scope and baseline

This pass completes the staff and dentist onboarding lifecycle on
`feature/final-staff-onboarding-polish`. It began from
`f22c706b4bf52f6a1b9110251085df0d0b41a512`; `main` and `origin/main` remained
at that commit. Existing history was preserved. Nothing was merged or pushed.

The work deliberately remains a staff-access system rather than a patient or
medical-record system. Public booking, appointment locks, phone quota,
idempotency, appointment CAS, media/consent behavior, refresh rotation, the
six-Unicode-character password minimum, and the bcrypt 72-byte guard were not
weakened.

## Implemented lifecycle

### Dentist profile and employee account

- A dentist profile remains the public/operational clinic identity. Staff
  access is a separate employee account that an administrator explicitly links
  to that profile.
- Dentist invitations require an existing dentist profile. Non-dentist roles
  cannot carry a dentist-profile link.
- Current dentist access is one-to-one. A named partial unique MongoDB index on
  `users.dentistProfile`, scoped to ObjectId values whose `deactivatedAt` is
  `null`, is the final database authority. Service prechecks improve feedback;
  duplicate-key races are still translated to safe HTTP 409 conflicts.
- Dentist creation now returns authoritative server state and presents a clear
  next choice: finish, or invite that dentist to the staff workspace. Dentist
  cards show whether access is unconfigured, awaiting setup, active, or
  disabled, and link to the applicable employee workflow.
- Moving an employee to the dentist role requires an eligible profile. Moving
  away from the dentist role clears the link and revokes existing sessions.
  Linking/relinking likewise revokes sessions.

### Invitation, resend, cancellation, and setup

- Invitation input freezes the employee email, role, and dentist-profile
  identity. Repeated or concurrent attempts cannot claim a profile already used
  by another current account.
- Resend is an explicit identity-bound action. It atomically supersedes prior
  invite tokens, does not change employee identity/role/profile, is never
  replayed after an uncertain mail result, and never returns a raw token.
- Cancellation is distinct from employee deactivation. It consumes outstanding
  one-time tokens, revokes sessions, increments the authorization version, and
  archives the incomplete account while retaining governance history.
- Setup accepts only an unconsumed, unexpired invitation for the same incomplete
  current account. Resend-versus-setup, cancel-versus-setup, and concurrent
  resend behavior have focused regression coverage.
- The public invitation-context endpoint is rate-limited and returns only the
  employee name/localizations, email, role, and safe linked dentist identity.
  It returns the same generic invalid/expired response when the invitation or
  account cannot be used.
- The setup credential is captured from the URL fragment and immediately
  removed from browser-visible history. It is held in memory only and is not
  written to storage, logs, normal staff UI, or API responses.

### Archive and restore

- Established employees use deactivate/restore semantics; pending invitations
  must use the explicit cancellation path.
- Deactivation revokes sessions and tokens, keeps historical records, and does
  not change a dentist profile's public visibility.
- Archive releases the current dentist-link uniqueness scope. Restore reclaims
  it only if no other current employee now owns the profile; both the service
  precheck and unique index reject races with HTTP 409.
- Last-active-administrator and self-deactivation protections remain intact.

## Preview-only invitation inbox

The supervised local preview has an administrator-only invitation inbox that
uses opaque preview UUIDs, never displays a raw setup token, and contacts no
SMTP provider. The preview handle is removed from the visible URL as soon as it
is captured by setup.

Production isolation is fail-closed at multiple boundaries:

- `NEXT_PUBLIC_ARELIS_PREVIEW_MODE` accepts only an empty value or `supervised`.
- Next configuration and runtime environment parsing both reject any preview
  mode in production.
- The preview page calls `notFound()` when the build is production or the
  explicit supervised flag is absent.
- Navigation is emitted only when validated preview mode is active.
- Preview endpoints exist only in the deterministic local test/preview server;
  no production backend preview route or provider shortcut was added.
- The successful production build omitted the preview flag, and token-sink
  review found no logging or browser-storage path for setup credentials.

## Migration and index operations

Migration `20260921_012_dentist_staff_links` is explicit, additive, non-dropping,
and registered in the existing migration runner. Dry-run reports:

- duplicate current accounts linked to the same dentist profile;
- current dentist accounts without a profile; and
- current non-dentist accounts that incorrectly carry a profile.

Apply refuses to create the index until all three preconditions are clean,
asserts the migration lease around the write, and uses the same named index
definition as the model and critical-index verifier. It never runs as an
application-startup side effect.

## Concurrency, authorization, and privacy review

The final adversarial review found no remaining P1/P2 product, race, security,
or privacy defect. Specifically:

- Profile uniqueness is database-enforced and all relevant invite, role-change,
  link, and restore duplicate-key races fail closed.
- Invitation issue/rotation/consumption retains the existing atomic token and
  user fences. Cancellation and setup cannot both establish access.
- Admin-only staff routes retain authentication, RBAC, validation, rate limits
  where applicable, safe audit events, and sanitized responses.
- Non-admin direct-route tests prove that protected team/audit reads are never
  mounted. Two-tab tests preserve session revocation and last-admin invariants.
- No patient account, patient-record capability, PII logging, raw-token listing,
  hard-delete path, uncertain-write retry, external-provider call, or access
  scope expansion was introduced.
- A source scan found no token logging or local/session-storage credential sink.
  The tracked-secret scanner covered 433 files.

The first full browser run exposed only stale test assumptions caused by the
intentional UI and lifecycle changes. They were classified and corrected
narrowly: an ambiguous `View` selector became exact; current/pending/archive
fixtures and filters were made explicit; restore uses the new accessible label;
and dentist creation now acknowledges the new success dialog. No assertion was
removed, no arbitrary sleep was added, and no global timeout was increased.
The only bounded timeout adjustment is a 15-second per-test limit on one
interaction-heavy appointment test whose isolated behavior was already green.

## Verification evidence

| Gate | Final result |
| --- | --- |
| Backend `npm run verify` | PASS after corrective pass: 348/348 tests; 93.33% lines, 84.09% branches, 91.00% functions; OpenAPI lint and tracked-secret checks included. |
| Separate backend `npm test` | Prior completed pass: 346/346 tests; not repeated because the corrective `npm run verify` ran the complete current 348-test suite. |
| Backend `npm audit --omit=dev` | PASS: 0 vulnerabilities. |
| Backend `npm audit` | PASS: 0 vulnerabilities. |
| Frontend `npm run api:types` | PASS against the final OpenAPI contract. |
| Frontend `npm run typecheck` | PASS after the final browser corrections. |
| Frontend `npm run lint` | PASS with zero warnings after the final browser corrections. |
| Frontend `npm run test:coverage` | PASS: 34/34 files, 245/245 tests; 81.05% statements, 80.77% branches, 88.69% functions, 85.76% lines. |
| Frontend production build | PASS with non-secret local production variables and no preview-mode variable. |
| Focused supervised onboarding browser flow | PASS, including invitation preview, setup credential scrubbing, activation, and login. |
| Corrected E2E specs | PASS: all previously failing staff-admin, dentist lifecycle, and governance scenarios passed in focused reruns. |
| Final frontend `npm run test:e2e` | PASS: 52/52 scenarios in one fresh serial invocation (14.1 minutes). |
| Frontend `npm audit --omit=dev --audit-level=moderate` | PASS: 0 vulnerabilities. |
| Frontend `npm audit --audit-level=moderate` | PASS: 0 vulnerabilities. |
| Repository checks | PASS: `git diff --check`; tracked-secret scan of 433 files; no staged or tracked environment, credential, log, upload, browser, or coverage artifact. |
| Process cleanup | PASS: the E2E runner stopped its owned processes; ports 3100 and 5100 were not listening. |

The production build used only these documented non-secret values:

```text
NEXT_PUBLIC_API_URL=https://clinic.example.test/api/v1
NEXT_PUBLIC_SITE_URL=https://clinic.example.test
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=preview-local
NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER=turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=test-public-site-key
```

`NEXT_PUBLIC_ARELIS_PREVIEW_MODE` was intentionally absent. Automated tests used
the guarded disposable local database and fake/local adapters; they did not
contact Cloudinary, SMTP, Redis, Turnstile, monitoring, or other providers.

## Commands represented by the final evidence

Backend, from `backend/`:

```text
npm run verify
npm test
npm audit --omit=dev
npm audit
npm run check:secrets
```

Frontend, from `frontend/`:

```text
npm run api:types
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm run test:e2e
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=moderate
```

Repository:

```text
git diff --check
git status --short
```

## Final Git state

- Branch: `feature/final-staff-onboarding-polish`
- Baseline, `main`, and `origin/main`:
  `f22c706b4bf52f6a1b9110251085df0d0b41a512`
- Changes are recorded as new logical local commits only. No existing commit was
  amended, rebased, squashed, reset, or rewritten.
- Standard Git status is clean at handoff. Ignored local environment and test
  outputs are not tracked or committed.
- Nothing was pushed. Nothing was merged.

## Final Definition of Done

| Required verdict | Result |
| --- | --- |
| STAFF INVITATION FLOW COMPLETE | YES |
| DENTIST PROFILE LINKING SAFE | YES |
| ONE CURRENT ACCOUNT PER DENTIST PROFILE ENFORCED | YES |
| DENTIST ACCOUNT CREATION UX CLEAR | YES |
| DENTIST LOGIN / SETUP FLOW CLEAR | YES |
| PENDING INVITATION CANCELLATION SAFE | YES |
| INVITATION RESEND SAFE | YES |
| SETUP TOKEN SECURITY PRESERVED | YES |
| PREVIEW INVITATION INBOX DEVELOPMENT-ONLY | YES |
| PRODUCTION PREVIEW-INBOX LEAKAGE ABSENT | YES |
| STAFF ONBOARDING UX COMPLETE | YES |
| DENTIST ONBOARDING UX COMPLETE | YES |
| ARCHIVE / RESTORE SEMANTICS PRESERVED | YES |
| RBAC / PRIVACY GUARANTEES PRESERVED | YES |
| BACKEND VERIFICATION PASSED | YES |
| FRONTEND VERIFICATION PASSED | YES |
| E2E VERIFICATION PASSED | YES |
| LIVE DEPENDENCY AUDITS CLEAN | YES |
| NO REAL SECRETS COMMITTED | YES |
| WORKTREE CLEAN | YES |
| SAFE FOR INDEPENDENT REVIEW | YES |

## Narrow dentist access/public-visibility correction

A final boundary review found that the authenticated dentist appointment scope
resolver required the linked dentist profile to be publicly active. That mixed
two separate concepts: an existing internal profile identity and public
patient-facing visibility. The resolver now continues to require an active,
setup-complete dentist employee, the authenticated authorization version, and
an existing linked dentist profile, but no longer requires that profile to be
publicly visible.

Public collection/detail, availability, and booking paths retain their existing
`isActive` and `bookingEnabled` predicates and booking-guard checks. Hiding a
profile therefore still blocks discovery, availability, stale/open booking, and
new booking while preserving the active employee's profile-scoped, minimal
`My appointments` view. Employee deactivation still revokes access and refresh
sessions without changing the public dentist profile.

Focused backend regressions prove both directions, including public rejection,
unchanged historical appointments, exact appointment ownership, employee-state
independence, stale access/refresh rejection, and unchanged public visibility
after employee deactivation. The deterministic preview API now matches the real
backend, and a focused browser regression proves that hiding the public profile
does not interrupt `My appointments`, while subsequent employee deactivation
redirects to sign-in without mounting a forbidden private appointment request.

Corrective verification completed with:

- `node --test --test-concurrency=1 test/dentist-appointments.test.js` —
  10/10 focused backend tests passed.
- `npm run verify` from `backend/` — 348/348 tests passed with all coverage
  thresholds, syntax, OpenAPI, and tracked-secret checks green.
- `npm run test:e2e -- test/e2e/arelis-product.spec.ts --grep "public dentist
  hiding preserves active employee appointments while employee deactivation
  revokes them"` — 1/1 focused Chromium scenario passed.
- `npm run typecheck` and `npm run lint` from `frontend/` — passed.

Frontend application/configuration code did not change, so the already-green
frontend coverage, production build, and 52/52 complete browser run were not
invalidated or repeated.
