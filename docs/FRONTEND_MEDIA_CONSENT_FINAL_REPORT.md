# Frontend Phase 3C1 — governed media and consent final report

## Scope and baseline

Phase 3C1 began from clean `main` at `9248c94` and is implemented on `feature/staff-admin-media-consent`. It adds the administrator interfaces for governed gallery media, dentist/service images, durable cleanup debt, and before/after consent governance while preserving the public/staff separation established in Phases 1–3B. Patient accounts, medical records, generalized file management, staff lifecycle, and audit-log UI remain out of scope.

The phase commits are:

- `7fcf35b` — `fix: prevent governed media caching`
- `6a6b404` — `feat: add governed media and consent administration`
- `0c5ed89` — `test: verify governed media and consent workflows`
- `2422adc` — `test: harden governed media verification`
- `87d312e` — `fix: serve local preview media directly`
- `84e4eff` — `fix: eager-load leading governed media`
- `ee11954` — `docs: finalize media consent readiness`
- `624af09` — `fix: prioritize available staff media`
- `a901b9d` — `docs: record final media edge-case review`
- `e704535` — `fix: close final media administration integration gaps`
- the final documentation commit containing this independent corrective-pass evidence

No dependency was added or upgraded during Phase 3C1.

## Backend cache correction

Contract review found one backend integration defect: authenticated media and before/after responses did not consistently use the existing private `no-store` middleware. The correction applies `Cache-Control: no-store` before authentication on protected media routes, so success, denial, and error responses cannot be stored. All governed public before/after list/detail responses are also no-store so withdrawal is visible on the next request. Public gallery behavior remains its existing public editorial policy and was not changed.

The backend regression checks public before/after responses and both denied and authorized protected responses. API/security documentation and OpenAPI response headers were aligned. The frontend generated API types include that contract.

## RBAC and transport boundary

Media, cleanup, and before/after management are admin-only in navigation and components. A direct receptionist or dentist route visit renders the signed-in access-denied boundary before any protected module read. This is defense in depth; backend authorization remains authoritative. A backend `403` is an authorization result and does not clear a valid session.

The existing `StaffApiClient` remains the only authenticated transport. Bearer access tokens remain memory-only, refresh cookies remain backend-owned HttpOnly credentials used only on auth routes, and the existing single-flight/identity-checked refresh lifecycle is unchanged.

Media uploads use `FormData`; the browser owns the multipart boundary and code never sets a multipart `Content-Type` manually. Single-image operations are bounded at 45 seconds and two-image creation at 60 seconds. Authentication and authorization precede multipart parsing on the backend, so a definitive `401` may use the established refresh flow and replay once. A timeout, cancellation, or network loss is indeterminate and is never automatically retried. The UI refetches authoritative state after success, conflict, failure, or uncertainty and never presents optimistic replacement/removal.

## File envelope and upload UX

The native file input remains available. Browser validation mirrors the backend's maximum 5 MiB and exact JPEG, PNG, WebP, HEIC, and HEIF MIME/extension combinations for early feedback only. Backend magic-byte detection and MIME/extension agreement remain the security authority. Every accepted input is now uploaded with mandatory WebP conversion. Before persistence, the backend verifies the returned public ID, exact HTTPS Cloudinary account/path, WebP suffix/format, positive bounded dimensions, and byte count. A provider mismatch activates the pre-existing durable rollback cleanup and fails the request; it cannot become a successful but unrenderable asset.

Selected files show their filename and a local preview where the browser can decode them. Preview data is never persisted or converted to stored base64. Every `URL.createObjectURL` is paired with `URL.revokeObjectURL` when the file changes or the component unmounts; a focused regression covers both paths. CSP permits `blob:` only in `img-src` for this local preview.

## Gallery, entity media, and cleanup

Gallery administration lists the actual non-paginated admin contract, uploads localized HY/RU/EN metadata, edits metadata/order, archives, and restores. Archive is explicitly described as public hiding without provider deletion; no unsupported hard-delete behavior is invented.

Dentist photos and service images use dedicated replace/remove endpoints. Entity business/profile fields are never resubmitted as part of a media mutation, so an image failure cannot overwrite unrelated data. Failed and concurrent replacements retain the old visible image until an authoritative response/refetch says otherwise. Conflict responses are not automatically resent.

Cleanup debt uses the backend's bounded 50-item pages and optional status filter. Pagination, localized status/reason/source labels, and explicit retry for retryable states are present. Client models omit provider public IDs, source IDs, worker lock identities, and raw provider detail; an unknown source renders no raw value.

## Before/after pair and consent governance

Before/after is a dedicated workspace, not a gallery album. Creation keeps two native inputs explicitly labeled Before and After and submits both through the atomic backend pair route. A partial backend upload/rollback cannot appear as a successful case. Armenian publication title remains required; Russian and English are independently authored and never synthesized.

An existing case may retain a service or dentist that was archived after publication. The editor shows that exact current relation as an archived retained option, but does not expose unrelated inactive entities. On update it compares the edited relation IDs with the authoritative case: unchanged IDs are omitted from PATCH, an intentional clear sends the empty value, and replacement sends only an active selected ID. Backend validation remains unchanged and still rejects new inactive assignments.

The frontend can submit only the consent fields the backend accepts: confirmation, one supported method, and an opaque external reference when that method requires it. It cannot choose the policy version, timestamp, actor, history, withdrawal, or purge state. Those values are server-owned. The client uses positive allowlists and discards consent history/actors and unrelated backend fields.

Publication badges and actions derive only from the authoritative publication/consent state. Verified active consent is required for restore and image replacement. Ordinary unpublish is clearly separate from consent withdrawal: it hides publication without changing consent or deleting media. Withdrawal requires a bounded reason plus explicit acknowledgement, immediately removes public eligibility, and is not presented as reversible.

Permanent purge is available only after withdrawal. It has a separate destructive dialog, bounded reason, exact backend confirmation phrase, no optimistic disappearance, and no automatic retry. The server clears both image references, clears the external reference, retains the governance tombstone, and schedules reference-checked cleanup.

## Public privacy boundary and URL safety

Public pages continue to use only unauthenticated positive projections. Publication workflow, consent state/method/version/time/reference/history, withdrawal/purge metadata, actors, cleanup data, and patient/appointment information do not enter public JSON or public UI. Withdrawn and purged cases fail closed as not found.

Authenticated management also uses explicit client projections. Managed URLs pass the existing exact Cloudinary cloud/path/public-ID policy before rendering. Arbitrary schemes, hosts, credentials, queries, fragments, data URLs, mismatched public IDs, and direct HEIC/HEIF assets render an accessible placeholder. Newly accepted HEIC/HEIF inputs remain usable because the backend returns only a validated WebP asset on success. Provider-free local testing has one development-only allowlist for `/og.png` with cloud `preview-local`, `tests/` public IDs, PNG format, and positive dimensions; arbitrary local paths remain rejected.

## Localization, accessibility, and responsive behavior

Operational copy is explicitly authored in Armenian, Russian, and English, including Before/After labels, lifecycle state, consent methods, cleanup state, validation, failure, withdrawal, and purge consequences. Content may use the established field-level Armenian fallback; translations and consent evidence are never invented.

Forms use native labels/file inputs, textual errors and lifecycle badges, pending/disabled actions, and Base UI focus-managed dialogs. Destructive meaning is conveyed in text rather than color alone. Automated Phase 3C1 checks cover Axe plus no horizontal overflow at 375, 430, 768, 1024, and 1440 CSS pixels.

## Deterministic provider-free preview

`npm run dev:preview` owns only localhost ports 3000/5000 and the validated `.next-preview` cache. The test-only mock supports gallery state, entity image replacement/removal, cleanup retry, pair creation/edit, unpublish/restore, withdrawal/purge, public reflection, admin denial, and deterministic conflict/replacement/pair/format/rate-limit failures. All fixture images are local `/og.png`; browser E2E aborts every non-local request. Production credentials and provider SDKs are not imported.

The launcher prints local URLs, local-only accounts, and scenarios. One Ctrl+C follows the existing supervised shutdown path, terminates only its owned child tree, closes mock connections, releases both ports, removes `.next-preview`, and restores terminal input.

## Focused verification and adversarial findings

Before the final matrix, the corrective frontend safety/client/editor regressions passed 31/31 and the focused backend governed-media suite passed 37/37. They prove all six accepted extension/MIME pairs request and receive validated WebP output, recognizable unsupported AVIF fails before provider upload, unsafe provider output rolls back without persistence, direct HEIC delivery remains outside the rendering allowlist, unchanged historical relation IDs are omitted, intentional clear/replacement is explicit, unrelated inactive relations are unavailable, and priority skips malformed or unsupported assets. The frozen full Playwright matrix continues to cover multipart behavior, gallery/entity lifecycle, pair atomicity, public projection, withdrawal/purge, zero-fetch RBAC, responsive layouts, and Axe.

The adversarial review found and corrected these defects in logical commits without rewriting history:

- authenticated/public governed response cache policy mismatch in the backend;
- cleanup UI initially ignored pages after the first 50 jobs;
- missing entity media was mislabeled as archived;
- cleanup enums and legacy consent methods were not localized;
- before/after edit used frontend `featured` instead of backend `isFeatured`; and
- upload-preview object URL lifecycle lacked a dedicated regression;
- deterministic local media was incorrectly routed through the Next.js optimizer, which could hang page-load completion in provider-free E2E;
- leading public and protected media was left lazy, producing an LCP warning in the final real-browser smoke;
- the first priority pass assumed the first staff row had media, which fails for legitimate tombstones or entities without an image;
- accepted HEIC/HEIF input could previously persist an authoritative HEIC/HEIF result that the production rendering boundary correctly refused;
- unrelated before/after edits resent historical inactive relations and could receive a backend `409`; and
- the leading-media helper selected the first non-null asset rather than the first asset accepted by the actual rendering safety boundary.

The final corrected selection gives priority only to the first managed image that passes `safeManagedImage`. For a before/after card, either side can establish that the card is renderable, so a malformed legacy Before asset cannot hide a valid After asset from priority selection. The one allowlisted local preview image is also eager because many independent deterministic fixtures deliberately share that same source; production provider images retain normal lazy loading outside the leading card.

## Final verification evidence

The backend changed during this corrective pass, so both required backend matrices were rerun after the fix:

- focused governed-media regression: 37/37 tests passed;
- `npm run verify`: syntax check passed for 171 files, tracked-secret check passed, OpenAPI lint passed, and 293/293 coverage tests passed;
- the post-staging tracked-secret check passed for 359 files;
- backend coverage: 92.83% lines, 83.35% branches, and 90.17% functions;
- separate `npm test`: 293/293 tests passed; and
- both runtime and complete backend `npm audit --audit-level=moderate` checks reported zero vulnerabilities.

The fresh final frontend verification was:

- `npm run api:types` regenerated the client declarations from the changed OpenAPI contract;
- `npm run typecheck` and `npm run lint` passed with zero warnings;
- full Vitest coverage: 24 files and 156/156 tests passed;
- coverage: 80.50% statements (892/1108), 80.34% branches (842/1048), 87.44% functions (216/247), and 84.60% lines (786/929);
- a production build completed successfully with HTTPS API/site origins, Cloudinary cloud name, and the documented Turnstile test public key;
- the full frozen Playwright matrix passed 38/38 after the corrective implementation; and
- both runtime and complete frontend `npm audit --audit-level=moderate` checks reported zero vulnerabilities.

The final local browser smoke used the supervised provider-free preview. It confirmed the Armenian gallery/media workspace, English before/after governance, Russian public before/after projection, gallery/entity replacement controls, cleanup status/retry presentation, paired images, publication/consent states, and administrator-only actions. Public markup contained no consent method, policy version, withdrawal control, actor, cleanup, or patient data. A receptionist direct visit to media administration rendered access denied, issued no admin read, and preserved the valid session for the appointment workspace.

At a true 375 CSS-pixel phone width the representative staff and public routes had no horizontal overflow or broken images; the previously completed desktop/wider responsive matrix remained valid. Fresh post-fix public, gallery-admin, and before/after-admin tabs had no console warning/error, hydration failure, broken image, or non-local resource request. Ctrl+C used the supervised shutdown path; ports 3000 and 5000 were free afterward and both `.next-preview` and `.next-e2e` were absent.

## Security and privacy review

The final review covers no-store ordering, public gallery non-regression, withdrawal-safe public reads, multipart boundary ownership, upload-time WebP normalization, returned-asset validation, provider-result rollback, explicit-401 versus indeterminate retry policy, replacement rollback presentation, pair atomicity, historical inactive relation preservation without loosening backend assignment validation, server-owned consent evidence, publication fail-closed behavior, explicit purge, positive projections, URL allowlisting, renderable-media priority, absence of patient/consent/provider secrets in logs/storage/URLs, object URL revocation, bounded cleanup pagination, backend-authoritative RBAC, and `403` session preservation.

## Known limitations and Phase 3C2 boundary

- Production Cloudinary credentials, real clinic assets, consent policy/legal approval, CDN/edge validation, and deployment are operational responsibilities, not frontend fixtures.
- Gallery removal is reversible archive because that is the backend contract; it does not delete the provider object.
- Browser file validation is convenience only; backend signature validation remains mandatory.
- HEIC/HEIF is an accepted input contract, not a direct-delivery contract. Production success requires the provider to return the validated WebP representation.
- Media replacement exposes no client CAS version. The backend compare-and-set/reference guards are authoritative, and conflicts trigger refetch rather than automatic resend.
- Consent evidence remains governed outside this UI. The interface records only the backend-supported method/attestation and opaque reference; it is not a document repository.
- Cleanup execution belongs to the backend worker/process contract; this UI lists and schedules retryable debt.
- Phase 3C2 is limited to staff invitations, role/lifecycle controls, staff session revocation, and audit-log administration. It must not expand into patient accounts or medical records.

## Final Git state

The final state is branch `feature/staff-admin-media-consent` with every Phase 3C1 code, regression, and documentation unit committed. The final handoff verification confirms a clean working tree, no generated preview/E2E artifacts, `main` untouched at `9248c94`, and nothing pushed or merged.
