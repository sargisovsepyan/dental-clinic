# Data retention and privacy decisions

No legal retention duration is hard-coded by this project. Clinic/legal must approve the values before real patient traffic. The system minimizes data but retention and deletion still require accountable policy.

| Data | Current technical behavior | Policy required |
|---|---|---|
| Appointments/contact/consent | Retained as business history; cancellation does not delete | retention, access, correction/export/deletion handling |
| Audit logs | Retained; admin-only; sensitive metadata minimized | retention and tamper/access review |
| Refresh sessions | TTL at expiry; revocation retained until TTL | maximum/absolute session policy |
| Invite/reset tokens | Hashed, consumed atomically, TTL at expiry | operational incident review window if any |
| Phone quota reservations | HMAC phone key; reconciled against appointments | cleanup schedule and HMAC-secret rotation plan |
| Before/after consent | Minimal evidence/history retained; withdrawal hides; purge tombstones | policy version approval, evidence retention, withdrawal SLA |
| Cloudinary assets | Referenced assets retained; unreferenced assets deleted by durable jobs | provider retention/backups and purge verification |
| Cleanup jobs | Completed/failed records currently retained | operational retention duration |
| Application logs | Content-minimized; sink controls external | sink retention, access, region, incident hold |
| Backups | External; not enabled by source | retention, encryption, deletion propagation, restore access |

Do not add diagnoses, histories, X-rays, prescriptions, clinical documents, or arbitrary patient files to this system. Any future expansion into medical records requires a separate privacy/security/legal architecture review.

Changing retention must not add TTL indexes to appointments, audit, consent history, or tombstones without explicit approval and restore/audit impact analysis. TTL is appropriate only for ephemeral security records already modeled as such.
