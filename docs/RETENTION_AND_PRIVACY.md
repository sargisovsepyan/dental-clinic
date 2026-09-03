# Data retention and privacy decisions

No legal retention duration is hard-coded by this project. Clinic/legal must approve the values before real patient traffic. The system minimizes data but retention and deletion still require accountable policy.

| Data | Current technical behavior | Policy required |
|---|---|---|
| Appointments/contact/consent | Retained as business history; cancellation does not delete | retention, access, correction/export/deletion handling |
| Audit logs | Retained; admin-only; sensitive metadata minimized | retention and tamper/access review |
| Refresh sessions/replay history | Idle expiry is capped by absolute family expiry; consumed hashes live in a separate TTL collection no longer than that boundary | approved maximum session policy |
| Invite/reset tokens | Hashed, consumed atomically, TTL at expiry | operational incident review window if any |
| Phone quota reservations | HMAC phone key; reconciled against appointments | cleanup schedule and HMAC-secret rotation plan |
| Booking idempotency | Hashed key and immutable public success snapshot; TTL is configurable from 1–168 hours (24 hours by default) | retry window support policy |
| Notification outbox | Minimal event/revision/occurrence metadata; no recipient copy, rendered body, comments, notes, reasons, consent evidence, or raw provider response. Pending reminders survive until due; sent/failed/cancelled jobs receive configurable TTL (`NOTIFICATION_RETENTION_DAYS`, default 30) | approve operational retention and incident-hold procedure |
| Delivered email | SMTP provider and recipient mailboxes retain the delivered patient/clinic message outside this database | provider agreement, mailbox access/retention/deletion policy |
| Before/after consent | Minimal evidence/history retained; withdrawal hides; purge tombstones | policy version approval, evidence retention, withdrawal SLA |
| Cloudinary assets | Referenced assets retained; unreferenced assets deleted by durable jobs | provider retention/backups and purge verification |
| Cleanup jobs | Completed/failed records currently retained | operational retention duration |
| Application logs | Content-minimized; sink controls external | sink retention, access, region, incident hold |
| Backups | External; not enabled by source | retention, encryption, deletion propagation, restore access |

Do not add diagnoses, histories, X-rays, prescriptions, clinical documents, or arbitrary patient files to this system. Any future expansion into medical records requires a separate privacy/security/legal architecture review.

Appointment email is operational booking fulfillment, not marketing. `privacyAccepted` records the booking privacy policy; it is never reinterpreted as marketing consent. The operational reception mailbox is deployment configuration and is deliberately separate from mutable public `Clinic.email`. Patient email/phone are resolved only at send time and are never included in notification logs, message subjects, dedupe keys, or stored delivery errors.

Changing retention must not add TTL indexes to appointments, audit, consent history, or tombstones without explicit approval and restore/audit impact analysis. TTL is appropriate only for ephemeral security records and terminal notification jobs already modeled as such; it must never delete a pending/retry/processing reminder.
