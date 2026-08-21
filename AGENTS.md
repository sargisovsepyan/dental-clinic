# Repository guidance

- Backend root: `backend/`; use Node.js 22+ and ESM.
- Preserve route/controller/service/model boundaries and existing public contracts unless correctness or security requires a documented change.
- The password minimum is exactly 6 characters. Keep the bcrypt 72-byte protection.
- Tests may use only disposable local test databases and must never contact real Cloudinary, SMTP, Redis, monitoring, or bot-challenge providers.
- Preserve the database-enforced appointment lock, atomic phone quota, and safe reschedule/cancellation behavior.
- Keep HY/RU/EN explicit; Armenian is the primary publication locale. Never invent translations or consent evidence.
- Do not expand this marketing/booking backend into a medical-record system.
- Never commit `.env`, credentials, tokens, dumps, uploads, logs, or coverage output.
- Migrations are explicit, dry-run first, and never run automatically at startup. Production index changes are explicit and non-dropping.
- Update `docs/API_CONTRACT.md` and `docs/openapi.yaml` when public behavior changes.
- Run `npm run verify` from `backend/` before commits. Inspect staged files and secrets.
- Do not push unless the user explicitly requests it.
