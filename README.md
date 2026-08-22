# Dental clinic backend

Production-oriented Node.js backend for a dental clinic’s public catalog, staff administration, availability, appointment booking, and governed media. It is deliberately not a medical-record system: diagnoses, treatment notes, billing, and clinical records are outside its boundary.

## Repository map

- `backend/` — Express 5 API, MongoDB models/migrations, durable notification worker/reconciliation, and tests
- `docs/openapi.yaml` — machine-readable API contract
- `docs/API_CONTRACT.md` — frontend-facing behavior and invariants
- `docs/PRODUCTION_RUNBOOK.md` — deployment and operations sequence
- `docs/FINAL_BACKEND_HARDENING_REPORT.md` — authoritative final hardening evidence, verdicts, and residual responsibilities
- `docs/APPOINTMENT_NOTIFICATIONS_FINAL_REPORT.md` — notification architecture, verification evidence, and delivery limitations

## Local development

Use Node.js 22. Copy `backend/.env.example` to an untracked `backend/.env`, replace the development values, and never commit that file.

```text
cd backend
npm ci
npm run dev
```

Appointment delivery runs as a separate process and never inside the API import/startup path:

```text
cd backend
npm run worker:notifications
```

Development notifications default to disabled. Enabling them outside tests requires complete SMTP configuration and the separate operational `CLINIC_NOTIFICATION_EMAIL`; production requires explicit `NOTIFICATIONS_ENABLED=true`. API and worker processes share MongoDB but may scale independently.

The new-password minimum is exactly six characters; passwords exceeding bcrypt’s 72-byte input boundary are rejected when created. Armenian (`hy`) is the primary publication locale, with explicit Russian (`ru`) and English (`en`) translations.

## Verification

From `backend/`:

```text
npm run verify
npm run audit:runtime
npm run audit:full
```

`verify` checks syntax, tracked-secret safety, OpenAPI linting, the full isolated test suite, and coverage thresholds. Tests use disposable local in-memory MongoDB instances or replica sets and are designed to fail before contacting real Cloudinary, SMTP, Redis, monitoring, or bot-challenge services.

## Production boundary

Production requires an HTTPS edge with explicit trusted proxy CIDRs, a TLS/authenticated transaction-capable MongoDB deployment, TLS/authenticated Redis, SMTP with a verified sender and operational reception mailbox, Cloudinary, monitoring, independent application secrets, a server-versioned consent policy, and a configured public-booking challenge provider. Run at least one notification worker alongside the API. Production maintenance commands require the acknowledgement and stopped-write migration window documented in the runbook and remain explicit—migrations and index changes never run automatically at application startup.

Follow the deployment sequence and backup/restore drill in `docs/PRODUCTION_RUNBOOK.md`; do not treat a successful local test run as infrastructure approval.
