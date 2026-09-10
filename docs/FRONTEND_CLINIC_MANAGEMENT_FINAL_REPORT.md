# Frontend clinic management final report

## Baseline, branch, and scope

Baseline: `6d0038954e3d1e18ba9d72cda3dc1b03d6aeeaa4` (`docs: record final Phase 3A corrective evidence`)

Branch: `feature/staff-admin-clinic-management`

Phase 3B adds operational administration for service categories, services, public dentist profiles, weekly clinic/dentist schedules, dentist date exceptions, clinic date overrides, and the safe editable subset of clinic configuration. It extends the established Phase 3A staff session and shell architecture; it does not add a second auth client, persist tokens, turn public pages into a client SPA, or create medical-record functionality.

Phase 3C remains responsible for generalized media/gallery management, before/after administration and consent governance UI, staff invitation/role/lifecycle/session-revocation UI, and audit-log UI.

## Commits

- `f56a023 feat: add guarded clinic management workspace`
- `a9693b3 test: harden clinic management workflows`
- `02932aa test: enforce clinic management coverage gate`
- `7896311 test: stabilize instrumented booking verification`
- `docs: finalize clinic management readiness` (the documentation commit containing this report)

No existing commit was rewritten. Nothing was pushed or merged.

## Frontend implementation

The implementation adds:

- `src/api/staff-management.ts`, with strict runtime parsers and allowlisted response types for categories, services, dentists, clinic settings, schedule exceptions, clinic closures, and bounded appointment-impact metadata;
- authenticated management methods on the existing `StaffApiClient`, including `PUT` and `DELETE`, explicit request timeouts, no-store requests, ObjectId/local-date checks, and safe schedule-conflict metadata;
- admin-only routes at `/{locale}/staff/services`, `/dentists`, `/schedules`, and `/clinic`;
- shared localized management fields, feedback, confirmation, and lifecycle controls;
- category/service, dentist, clinic, and guarded schedule-management workspaces;
- explicit HY/RU/EN management copy; and
- stateful Phase 3B mock API behavior and six Phase 3B Chromium scenarios.

The final corrective review also changed the destructive button variant to a solid, text-independent high-contrast treatment after axe identified the previous pale variant at 4.44:1. It preserved focus-ring behavior and did not make destructive meaning color-only.

## Backend and API-contract changes

Backend changes were intentionally small and integration-driven:

- authenticated category, service, dentist, exception, closure, and clinic-update routes now apply `Cache-Control: no-store` before authentication/authorization;
- category and service restore paths refetch the public-safe administrative projection instead of returning documents that can retain hidden internal guard fields; and
- focused backend tests cover those cache and projection guarantees.

`docs/API_CONTRACT.md` and `docs/SECURITY.md` now explicitly include authenticated catalog/scheduling management in the no-store boundary. The existing OpenAPI operations and schemas already matched the required implementation, so `docs/openapi.yaml` did not require a behavior change. `npm run api:types` passed and regeneration produced no content diff.

## RBAC matrix

| Surface | Public | Admin | Receptionist | Dentist |
| --- | --- | --- | --- | --- |
| Public catalog, dentists, clinic, booking | Yes | Yes | Yes | Yes |
| Staff account surface | No | Yes | Yes | Yes |
| Appointment workspace | No | Yes | Yes | No |
| Services/categories management | No | Yes | No | No |
| Dentist-profile management | No | Yes | No | No |
| Schedules, exceptions, and closures | No | Yes | No | No |
| Clinic-settings management | No | Yes | No | No |

Non-admin management navigation is absent. Direct receptionist/dentist navigation renders a signed-in access-denied boundary without starting management reads. This is only a UI guard: the backend independently returns `403` for every protected management operation. A `403` does not clear the valid frontend session.

## Service categories and services

Category and service screens support the backend's actual list, create, edit, archive, and restore contracts. Armenian required fields are explicit; Russian and English are independent optional authoring surfaces and are never synthesized. Slugs are backend-generated and are neither editable nor submitted. Server-owned media fields and hidden booking guards are excluded from requests.

Services expose the documented category relation, localized name/descriptions, duration, price mode/range, currency, ordering, featured, booking-enabled, and active state. Category archival does not cascade: an active-service reference remains a backend-authoritative conflict and the UI tells the operator to resolve active services first. Mutations are pending-guarded, never optimistically declared successful, and end in an authoritative refetch. The deterministic preview confirms that managed public records flow back into the public services page without private fields.

## Dentist administration

Dentist management covers language-neutral names, localized professional title/biography/specializations, experience, languages, stable service-ID assignments, ordering, featured state, booking-enabled state, and soft archive/restore. It deliberately keeps public dentist profiles separate from staff accounts.

New dentist profiles submit an empty weekly schedule and booking disabled. Profile updates never submit `weeklySchedule`, `expectedScheduleRevision`, `photo`, or `photoUrl`. Existing media is preserved; replacement belongs to the Phase 3C governed-media work.

## Weekly schedules and concurrency

Clinic and dentist weekly editors always show all seven days and support closed days plus up to six shifts. Client validation rejects incomplete, inverted, duplicate, and overlapping intervals before a request; the backend remains authoritative. Weekly clock strings are clinic-local values and are not converted through the browser timezone.

Every guarded write uses the current backend `scheduleRevision`. When the backend reports affected appointments, the client accepts only a bounded allowlist: appointment ID, dentist ID, clinic-local date/start/end, status, count/truncation state, current revision, and a 64-hex-character acknowledgement token. Patient names, phones, emails, comments, and arbitrary backend fields cannot enter the dialog or normalized error.

The impact dialog freezes a deep copy of the exact proposal, reviewed revision, and token. Confirmation replays only that frozen proposal with that token. It does not mutate, move, or cancel existing appointments. A stale revision is never upgraded and resent automatically; the client refetches the authoritative schedule and requires a new review.

The final adversarial pass found and fixed one additional edge: an exception/closure acknowledgement replay that received a stale revision or an indeterminate network/timeout error could leave its old impact dialog mounted. The client already did not auto-retry, but an operator could click the stale acknowledgement again. It now discards the old token, refetches authority, preserves the editable proposal, and requires a new unacknowledged guarded submission at the refreshed revision. A focused regression proves the third request uses revision `1` without the old token.

## Dentist exceptions and clinic closures

Dentist exceptions and clinic date overrides use the backend's exact `YYYY-MM-DD` clinic-local date contract. They support a day off/closed day or explicit custom shifts and a bounded operational note. Create, edit, and delete operations carry the parent schedule revision and share the same impact acknowledgement and stale-write behavior as weekly hours. Successful operations refetch both the item range and parent revision.

Clinic closures never imply cancellation or rescheduling. Impact content states that existing appointments remain booked and will not be moved or cancelled.

## Clinic settings and timezone authority

The clinic form exposes only known public-safe fields: localized clinic name/tagline/description/address, phones, email, credential-free approved map/social URLs, coordinates, and bounded booking-policy values. It does not expose secrets, provider credentials, arbitrary keys, weekly schedule, or revision fields.

The backend-provided timezone is displayed wherever dates/hours are managed. It remains read-only because the current backend does not provide a safe live timezone migration contract for existing appointments, schedules, availability, and reminders. The frontend does not pretend that a plain settings patch can perform that migration.

## Localization, accessibility, and responsive behavior

Management UI copy is explicitly authored for Armenian, Russian, and English. Armenian remains the primary publication locale. No translation or consent evidence is invented.

Forms use visible labels and required-state copy, native input semantics, inline summaries, pending/disabled submit controls, textual lifecycle badges, and accessible confirmation/impact dialogs. Conflict states are not color-only. The Phase 3B axe scenario passed with zero violations after the destructive-button contrast fix.

Automated browser coverage retained the full 375/430/768/1024/1440 responsive matrix. Final real-browser inspection calibrated the in-app browser's 1.4 Windows display scale and directly checked the Russian dentist-management screen at exact CSS widths 375, 430, 768, 1024, and 1440 with no document-level horizontal overflow. Mobile inspection also confirmed the four schedule tabs, timezone badge, save action, and weekly editor remain usable at 375 CSS pixels.

## Deterministic preview and real-browser QA

`npm run dev:preview` continues to own localhost ports 3000/5000. The test-tree mock now maintains categories, services, dentists, clinic settings, weekly schedules, exceptions, and closures; reflects active managed content through public endpoints; enforces admin auth; and supplies validation, catalog-error, exact acknowledgement, and stale-revision scenarios. It never imports production credentials or contacts Cloudinary, SMTP, Redis, monitoring, challenge, or other external providers.

The final real-browser pass inspected:

- Armenian admin navigation and service/category cards plus the localized HY/RU/EN editor presentation;
- English schedule editing, clinic timezone, bounded no-PII impact presentation, return-without-mutation behavior, responsive navigation, and safe clinic settings;
- receptionist navigation and direct management denial;
- dentist navigation, direct schedule denial, and preservation of the signed-in session after denial;
- Russian dentist management and mobile weekly schedule presentation;
- public Russian service reflection with no schedule-revision/private-field leakage; and
- browser warning/error logs, which were empty.

Rendered management pages contained no unexpected external document URLs. The automated Phase 3B route guard aborts every non-local browser request, and the full deterministic suite passed under that restriction.

The previous preview process did not survive the usage-limit handoff, so the exact deterministic command was restarted only to finish the interrupted browser inspection. One Ctrl+C ended the owned terminal session; ports 3000 and 5000 had no listeners afterward, `.next-preview` and `.next-e2e` were absent, and no unrelated Node process was terminated.

## Verification evidence

Implementation was frozen before the broad final matrix. The preserved successful results were not repeated unless a later correction invalidated them.

- generated API types: passed; no generated content diff;
- TypeScript: passed after the final source/test corrections;
- ESLint: passed, including the final changed files;
- frontend unit/coverage gate: exact `npm run test:coverage` passed, 21 files and 126/126 tests;
- coverage: statements 80.26% (797/993), branches 79.46% (770/969), functions 85.84% (194/226), lines 84.98% (719/846); all configured thresholds passed;
- focused schedule-management regression after the stale-token correction: 7/7;
- focused staff-management client tests: 4/4;
- focused Phase 3B Chromium scenarios: 6/6;
- complete inherited plus Phase 3B Chromium suite: 32/32;
- production build: passed with safe example HTTPS origins, Turnstile test site key, and isolated `.next-phase3b-final`; the validated cache and temporary generated config changes were removed;
- backend catalog/scheduling suite: 16/16;
- backend `npm run verify`: 289/289, including syntax, tracked-secret scan, OpenAPI lint, tests, and coverage;
- standalone backend `npm test`: 289/289; and
- final staged secret scans: no matches.

During the post-correction coverage refresh, the inherited end-to-end booking component/axe unit test twice exceeded Vitest's five-second default by 57–137 ms under V8 coverage on the slow Windows filesystem. Assertions did not fail. A test-only 15-second timeout was scoped to that single integration-style test; the exact repository command then passed 126/126 with thresholds. No production timeout or behavior changed.

## Dependency audit status

Safe lockfile-only offline audits completed with zero reported vulnerabilities for:

- frontend runtime dependencies;
- frontend full dependencies;
- backend runtime dependencies; and
- backend full dependencies.

A live registry audit did not run. The environment rejected the registry request because it would export the dependency inventory outside the workspace and no explicit authorization was available. That policy was not bypassed or weakened. Therefore the accurate live-audit status is `POLICY-BLOCKED`, not passed. Deployment/release operators must run the four documented live audit commands in an approved network environment.

## Final security and adversarial review

The final targeted review rechecked RBAC/IDOR, direct-route zero-fetch guards, cross-account refresh identity matching, private/no-store routing, response allowlists, hidden guard projections, unsafe URL handling, duplicate mutation prevention, exact acknowledgement replay, stale revisions, indeterminate writes, clinic-local dates, timezone authority, destructive confirmations, public-site reflection, and preview ownership/cleanup.

No unresolved critical or high-severity Phase 3B application defect is known. The review fixed the stale override-token edge, the destructive-control contrast defect, missing client lifecycle coverage, and the inherited instrumented-test timeout without rewriting prior commits.

## Known limitations and Phase 3C boundary

- General media upload/replacement/deletion, gallery administration, and dentist/service image replacement are not present. Existing entity media is preserved.
- Before/after administration and consent withdrawal/purge UI are not present; the backend remains authoritative and public pages continue to expose only approved publications.
- Staff invitation, role changes, deactivate/reactivate, session revocation, and audit-log UI remain Phase 3C.
- The clinic timezone is deployment-owned/read-only until a dedicated migration contract can safely reconcile schedules, appointments, availability, and reminders.
- Public editorial reads retain the documented five-minute production revalidation policy; the localhost development preview reflects stateful mock updates for deterministic QA.
- The live registry vulnerability audit remains an approved-environment release step because this environment policy-blocked it.

## Final Git state

Final branch: `feature/staff-admin-clinic-management`.

After the documentation commit, the working tree is clean. `main` and `origin/main` remain at the Phase 3A baseline. Nothing was pushed or merged.

## Conclusion

Phase 3B is complete and safe to merge from the application-code, test, browser-QA, concurrency, RBAC, privacy, and local-preview perspectives. The policy-blocked live registry audit is explicitly carried as an external release check; it is not represented as passed and does not indicate an application-code vulnerability by itself.
