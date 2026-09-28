# Phase 3C2 — Staff governance, session revocation and audit administration

## Baseline and scope

Baseline: `main = origin/main = b5a668e17e126c97b2c0ccc7db190af890014b66` (`docs: record final media corrective evidence`). Work remained on `feature/staff-admin-governance-audit`. The interrupted backend unit and existing worktree were inspected before continuation; no reset, restore, clean, history rewrite, branch switch, push, or merge was performed.

This phase adds admin-only `/[locale]/staff/team` and `/[locale]/staff/audit` to the existing staff shell. It does not add patient accounts, medical records, HR/payroll, custom permissions, global partial-page search, device/session tracking, production deployment, or Phase 4 infrastructure.

## Staff lifecycle and session safety

- Team list, role/active/setup filters, pagination, and selected detail use the existing server endpoints. Staff objects are positively projected; tokens, password/security state, invitation actors, and unknown fields are not retained.
- Invitations send exactly `name`, `email`, `role`. Success remains pending setup. Setup links belong to the backend email flow and are never displayed, stored, logged, or printed by the administration preview. Re-inviting a setup-incomplete email does not change its existing name/role; this is explained in the form.
- Pending invitations, established deactivated accounts, and canceled setup-incomplete accounts are distinct. Pending accounts can be deactivated to consume outstanding one-time tokens. Setup-incomplete accounts never show reactivation controls.
- Role, deactivate, reactivate, and revoke-all dialogs freeze reviewed ID/name/email. There is no optimistic success or automatic mutation retry after uncertainty. Conflicts and uncertain outcomes trigger authoritative refetch and localized actionable feedback; 403 preserves a valid signed-in session.
- Self role/deactivation are disabled and explained. The backend alone enforces the last-active-admin invariant using its transaction/invariant guard. UI counts are not used as authority.
- Successful self revoke-all immediately clears the in-memory access token/principal, broadcasts session clearing, and redirects to localized login. It performs no protected refetch or redundant logout using invalidated credentials. Other affected accounts must authenticate again.
- Only a parsed HTTP 401 from the authentication boundary can trigger the established single refresh/replay. Network, cancellation, stalled response-body delivery, malformed protocol responses, 403, and 409 cannot replay a mutation.

## Audit privacy, cache policy, and query semantics

The audit API explicitly returns only event/request identifiers, safe actor identity or `null`, action/entity references, HTTP method/path, bounded re-sanitized metadata, and creation time. IP/user-agent hashes remain stored server-side and are omitted from responses. Historic metadata is sanitized again on read; sensitive patient/auth/internal-note/provider-secret keys and suspicious object shapes are removed. Query/fragment text is stripped from safe audit paths.

`no-store` runs before audit authentication/authorization/validation. Regressions cover 200/400/401/403 and unexpected database 500 responses. Frontend protected requests also use `cache: no-store`; staff document routes retain private/no-store production headers and noindex behavior.

Audit filters are server-side: action, entity type/id, actor ID, inclusive from/to instants, page, and limit. The UI explicitly labels UTC and converts its inputs to canonical ISO UTC instants, independent of browser timezone. Backend date-only, timezone-less, and reversed ranges fail before database access; explicit numeric offsets are accepted. Equal timestamps sort by `createdAt DESC, _id DESC`. Offset pagination is deterministic for a fixed result set, not a snapshot guarantee during concurrent insertion.

Positive frontend parsers validate IDs, roles, canonical response dates, safe integers, correlated page/limit, unique rows, methods, paths, and known shapes. Metadata is bounded to depth 4, arrays 20, object entries 50, strings 500, and 1,000 total nodes. It renders as controlled text/key/value content, never HTML. Null actors and unknown future action/entity codes are safe; malformed responses show normalized errors rather than raw backend data.

## Async identity, RBAC, localization, and accessibility

Applied filter/page/reload keys, AbortController cleanup, and post-response abort checks prevent older staff/audit results from becoming actionable, including adapters that ignore cancellation. Staff detail is correlated to the selected ID; frozen mutation identity does not change after background refresh. Audit details are read-only snapshots of safe projected rows.

Receptionist/dentist direct visits mount only the existing signed-in access-denied boundary, with zero protected team/audit reads and continued access to authorized account/workspace routes. Backend RBAC remains authoritative.

HY/RU/EN operational copy and known action labels are explicitly authored. Unknown action/entity codes remain plain-text fallbacks. Team cards work at all widths; audit tables become cards below desktop widths. Forms have labels, textual lifecycle meanings, live status/error feedback, and focus-managed keyboard dialogs. Expanded localized navigation scrolls independently so sign-out remains reachable on short desktop screens and mobile sheets.

## Deterministic preview

`npm run dev:preview` runs only a supervised localhost Next server and in-memory mock API. Fixtures include current/second admins, receptionist, dentist, an established deactivated account, a pending account, and 36 audit rows with pagination, timestamp ties, null actors, nested safe metadata, and future codes. Scenario controls cover uncertainty, last-admin conflict, and forbidden outcomes alongside normal role/lifecycle/invitation/revocation flows.

No MongoDB, SMTP, Cloudinary, Redis, Turnstile, monitoring, or other provider is used by preview/E2E. Browser tests block non-local requests; launchers explicitly disable Next telemetry. The simulator does not substitute for real backend MongoDB/token/concurrency regressions. Windows preview/E2E use documented Webpack development mode to avoid the observed Turbopack restore panic; production build remains on default Turbopack.

## Adversarial findings and corrections

1. Existing staff listing passed raw Express query values rather than validated defaults/booleans. Fixed with listing/default/filter/pagination regressions.
2. Audit protection/projection/range validation/tie ordering needed hardening. Added early no-store, positive safe projection, historical sanitization, null-actor handling, reversed-range rejection, and deterministic ordering with affected HTTP/privacy regressions. Invitation audit entity IDs now recognize the safe staff response.
3. Joi ISO dates accepted date-only/timezone-less input. Fixed in a new logical corrective commit, not by rewriting the earlier audit commit; regressions prove rejection before DB access and equal inclusive offset boundaries.
4. The frontend timeout ended after headers, leaving response-body delivery unbounded. Kept the timeout through JSON delivery and tested a committed-looking stalled 201 body with no replay. Malformed 401 bodies also cannot trigger refresh/replay.
5. Canceled pending accounts could be mislabeled as outstanding invitations; lifecycle rendering now respects `deactivatedAt`, with a no-reactivation regression. Detail rendering also guards null selections explicitly.
6. Expanded Armenian desktop navigation pushed sign-out outside the viewport. Navigation now scrolls independently, with a short-screen desktop/mobile regression in all three locales.
7. Broad E2E encountered cold route-navigation timing and a Windows Turbopack cache-restore panic. The runner uses the documented Windows Webpack option, and booking-entry assertions allow cold compilation without changing behavior assertions. The interrupted run is not treated as a successful gate.

A transient internal Next router-initialization diagnostic appeared in an existing booking case during the broad development-server run. It did not reproduce in the final fresh preview or focused frozen-launcher rerun. The booking case now explicitly asserts an empty uncaught-page-error list; the focused diagnostic passed. No reproducible application defect remained, and no production/router policy was weakened.

Race/uncertainty tests cover frozen staff IDs, rapid staff/audit filters, overlapping detail loads, exact invitation bodies, uncertain invitation recovery, duplicate invitations, pending lifecycle, actionable 409/403, self revocation across tabs, and concurrent last-admin removal. Metadata tests cover suspicious nested keys, malformed actors/pagination/targets, depth/array/node limits, null actors, and literal HTML-like text.

## Original Phase 3C2 verification evidence (before the corrective pass)

Backend (working directory `backend/`):

- Focused affected audit/staff/security suites passed before broad verification.
- Final `node --test --test-concurrency=1 test/audit-admin.test.js`: 5 passed, 0 failed.
- `npm run verify`: passed syntax, tracked secrets, OpenAPI lint, and coverage gate; final aggregate 93.01% lines, 83.60% branches, 90.24% functions.
- Final `npm test`: 299 passed, 0 failed, canceled, or skipped.
- `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilities.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- OpenAPI lint and tracked-secret checks were repeated around the corrective commit and passed.

Frontend (working directory `frontend/`):

- `npm run api:types`: passed; generated schema aligned with OpenAPI.
- `npm run typecheck`: passed on the final code.
- `npm run lint`: passed with zero warnings, including final launcher changes.
- `npm run test:coverage`: 27 files / 179 tests passed; 82.00% statements, 81.83% branches, 88.56% functions, 85.96% lines. A contention-related 5-second booking unit timeout in a repeat run was resolved by the clean serial coverage run, without changing product code or that unit's assertions.
- `npm run build`: passed after the final navigation correction with the public placeholder configuration below; team/audit routes were present. No production configuration guard was weakened.
- Final full `npm run test:e2e`: 46 passed, 0 failed (11.4 minutes), including eight governance/audit cases and the existing public/booking/appointment/clinic/media suites. Governance coverage checks both routes in all three locales at 375/430/768/1024/1440px (30 combinations), heading/page overflow, serious/critical Axe violations, console health, and zero external browser requests.
- `npm run test:e2e -- --grep 'a 409 clears|expanded localized navigation'`: 2 passed (40.3 seconds) on the final telemetry-disabled launcher, including the explicit no-uncaught-router-error assertion and short-screen navigation in all locales.
- `npm run test -- test/staff-governance-client.test.ts`: 8 passed after adding the explicit total-node metadata budget assertion. Only regression assertions/launcher telemetry isolation changed after the full matrix; final lint/typecheck were repeated and passed. Product code remained frozen.
- Both `npm audit --omit=dev --audit-level=moderate` and `npm audit --audit-level=moderate`: 0 vulnerabilities.

Fresh real-browser smoke used the frozen final supervised preview, separate from Playwright's E2E server: admin team/invitation success, role/lifecycle controls, self session revocation/localized login, Russian audit filters/pagination, Armenian team, measured 375px mobile and 1440x600 short desktop, receptionist/dentist direct team/audit denial, and retained authorized account access. Earlier completed role/reactivation/revoke-other mutation smoke was preserved; final E2E independently repeats those controls. Final preview browser error/warning log was empty. Measured 375px page width was 364px including the viewport's scrollbar allowance; Armenian heading did not clip. Short-desktop sign-out bottom was 584px within the 600px viewport. Browser viewport override was reset afterward.

Final Ctrl+C shutdown removed `.next-preview` and released ports 3000/5000. E2E completion removed `.next-e2e` and released ports 3100/5100. A read-only final process inventory found no matching test/preview/Next/Vitest/verification workers. No generated cache, coverage, trace, log, upload, dump, `.env`, or credentials were staged; tracked secrets check passed for the staged implementation.

The initial build without required environment configuration failed closed, as designed. Production build verification uses only public placeholder values: `NEXT_PUBLIC_API_URL=https://api.example.invalid/api/v1`, `NEXT_PUBLIC_SITE_URL=https://clinic.example.invalid`, `NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER=turnstile`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`, and an empty public Cloudinary cloud name. No real provider is contacted or secret supplied.

## Limitations and Phase 4 boundary

Invitation email delivery is simulated locally; production SMTP delivery is not certified here. Audit history is read-only offset pagination, not cursor/snapshot pagination or immutable actor-profile history. Current actor name/email/role may reflect profile changes; deleted actors are null. No unsupported global search or per-device session UI is invented. Auth/session/token and last-admin invariants are enforced by the existing backend and tested using disposable local MongoDB only. Automated tests fail closed against real providers/test-DB misuse.

Phase 4 must supply deployment configuration, approved privacy-policy/content requirements, production provider credentials, release/preflight/index/migration evidence, and operational monitoring/backup/deployment checks. This report is application-phase readiness, not certification of a live production deployment.

## Original Phase 3C2 Git state and verdicts

Logical implementation commits:

- `5e89552 fix: harden audit administration contract`
- `f296453 fix: require zoned audit filter instants`
- `8915e28 feat: add governed staff and audit administration`

This report is finalized in the separate logical documentation commit. Final state: branch `feature/staff-admin-governance-audit`, clean working tree, `git diff --check` clean; main and origin/main remain `b5a668e`. Nothing pushed or merged. No history rewritten. Required final Git status/log/ref checks are performed after the documentation commit; the final handoff reports their actual outcome.

```text
STAFF MANAGEMENT COMPLETE: YES
INVITATION LIFECYCLE SAFE: YES
ROLE / LAST-ADMIN GOVERNANCE SAFE: YES
ACTIVATION / DEACTIVATION SAFE: YES
SESSION REVOCATION SAFE: YES
SELF-SESSION-REVOCATION HANDLED: YES
AUDIT API PRIVACY BOUNDARY SAFE: YES
AUDIT CACHE POLICY SAFE: YES
AUDIT FILTERING / PAGINATION SAFE: YES
ADMIN-ONLY ZERO-FETCH RBAC SAFE: YES
HY / RU / EN COMPLETE: YES
LOCAL PHASE 3C2 PREVIEW READY: YES
FULL FRONTEND VERIFICATION PASSED: YES
BACKEND CHANGED DURING PHASE 3C2: YES
BACKEND VERIFICATION PASSED IF REQUIRED: YES
LIVE AUDITS CLEAN: YES
PHASE 3C2 COMPLETE: YES
SAFE TO MERGE INTO MAIN: YES
READY FOR PHASE 4 PRODUCTION / DEPLOYMENT HARDENING: YES
```

These are application-phase verdicts with the deployment boundary above; safe to merge is a review/readiness conclusion, not authorization or evidence of a merge. Live audits means the four npm dependency audits actually run in this phase, not a deployed-system security audit.

## Independent-review corrective pass — 2026-09-16

Starting state was verified against the actual repository: clean `feature/staff-admin-governance-audit` at `7cea5effabe4497b9c642901e505b4bb05dfac9b`; main/origin/main both remained `b5a668e17e126c97b2c0ccc7db190af890014b66`. The audit model/service, HTTP regressions, frontend positive parser/workspace/tests, OpenAPI, and this report were inspected together before editing. Existing Phase 3C2 commits and completed work were preserved.

The independent-review mismatch was reproduced read-only using the actual backend projection and actual frontend parser (transpiled locally without application startup or provider contact). Before correction, control-character keys, a 1282-node individually bounded metadata tree, and a malformed populated actor email survived the server projection but were rejected by the client. An embedded dollar sign in a metadata key reproduced an additional instance of the same key-predicate mismatch. Normal actor/metadata passed unchanged.

Corrective commit: `83308fb fix: align audit projection safety boundaries`.

- The authoritative shared backend read/write sanitizer now discards keys containing `U+0000–U+001F`, `U+007F`, or any dollar sign/dot. Sensitive-key filtering and exact prototype-name protections remain intact.
- A fresh shared budget per metadata tree retains at most 1000 nodes, counting containers and null as nodes. Unsupported/undefined values and unsafe-key branches are not retained. Depth-first input order deterministically drops excess branches without throwing or failing historical audit pages. Existing depth 4, array 20, object 50, key 80, and string 500 limits are preserved.
- A non-null actor must have the same bounded, control-free email shape accepted by the frontend positive parser. Overlength source emails are rejected rather than truncated into plausible identities. Malformed historical/populated actors become `null`; the only non-null actor fields remain `_id`, `name`, `email`, and `role`.
- Normal populated actor identity and safe metadata are explicitly asserted unchanged. No frontend parser rule was loosened. Staff lifecycle, invitations, last-admin/self protections, session revocation, RBAC, cache ordering, audit filters/dates/ties, locales, and preview behavior were not changed.
- API/security/OpenAPI descriptions now document the actual projection envelope. Frontend product/runtime code changed: **NO**. The regenerated schema differs only in documentation comments; TypeScript shapes are unchanged. The only frontend test change strengthens unsafe-key/email rejection and exact-budget acceptance coverage.

Fresh verification on the corrected code (not assumed from the earlier phase matrix):

- First focused backend `node --test --test-concurrency=1 test/audit-admin.test.js`: **9 passed**, 0 failed/canceled/skipped. Four added HTTP/write regressions cover historical control/operator/prototype keys, deterministic oversized-tree truncation to exactly 1000 nodes, matching stored-write/read output with fresh budgets, and seven malformed populated-email values projected as null. BSON forbids NUL keys, so that key boundary is additionally tested directly in the sanitizer. Existing patient/auth/token/cookie/secret, valid actor/projection, RBAC, no-store, filter/date, and deterministic pagination regressions remained green.
- Backend `npm run verify`: **303 passed**, 0 failed/canceled/skipped; syntax, tracked-secret and OpenAPI checks passed. Coverage: **93.09% lines, 83.71% branches, 90.49% functions**. The shared audit service reached 99.61% lines / 87.21% branches / 100% functions.
- Separate backend `npm test`: **303 passed**, 0 failed/canceled/skipped. Appointment lock/quota/CAS, refresh/auth/RBAC, media replacement/two-upload rollback, provider-isolation/test-database guards, and production-error regressions also passed in both complete runs.
- Live backend `npm audit --omit=dev --audit-level=moderate` and `npm audit --audit-level=moderate`: **0 vulnerabilities each**. No packages were changed. These are dependency advisory audits, not a live deployed-clinic security certification.
- Frontend `npm run api:types`, `npm run typecheck`, and `npm run lint`: passed; zero lint warnings.
- Frontend `npm run test -- test/staff-governance-client.test.ts test/staff-governance-workspaces.test.tsx`: **2 files / 23 passed** (9 client, 14 workspace), 0 failures. The exact server-compatible 1000-node shape is accepted with a null actor; a 1001st node, unsafe keys, and malformed actor emails are still rejected. Existing null-actor/plain-text rendering and zero-fetch RBAC tests passed.
- The post-fix read-only server/client compatibility check accepted all five original reproducer cases and **200/200 deterministic generated wire projections**, with every returned tree within the 1000-node limit. This is additional targeted evidence, not a substitute for the committed regressions or a broader frontend suite.

The earlier full frontend coverage (179 tests), production build, 46-case E2E, browser/responsive/preview shutdown checks, and frontend dependency audits above are preserved as their original completed evidence. They were **not rerun in this targeted pass**, because frontend product behavior, launchers, and dependencies did not change. No migration, production index/data operation, preview restart, or real Cloudinary/SMTP/Redis/monitoring/challenge-provider use was needed.

The correction and this report are separate logical commits; no existing history was amended or rewritten. Final branch/clean-tree/whitespace/log/ref checks are performed after the documentation commit and reported in the handoff. Main/origin/main remain `b5a668e`; nothing is pushed or merged. Phase 4 is not started.

```text
AUDIT METADATA KEY SAFETY ALIGNED: YES
AUDIT TOTAL NODE BUDGET ALIGNED: YES
MALFORMED HISTORICAL ACTOR FAILS SAFE: YES
AUDIT SERVER / CLIENT SAFE CONTRACT CONSISTENT: YES
BACKEND VERIFICATION PASSED: YES
LIVE BACKEND AUDITS CLEAN: YES
PHASE 3C2 COMPLETE AFTER INDEPENDENT REVIEW: YES
SAFE TO MERGE INTO MAIN: YES
READY FOR PHASE 4: YES
```

These final corrective-pass conclusions include the reproduced mismatch and fresh corrected-code evidence above. Merge/Phase 4 readiness retains the application-versus-production-deployment boundary already stated in this report; it is not authorization to merge, deploy, or contact production providers.
