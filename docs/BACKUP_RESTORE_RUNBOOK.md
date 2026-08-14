# MongoDB backup and restore runbook

This repository provides procedure, not an enabled backup. Production is not approved until a real provider backup exists and a restore has been demonstrated.

## Backup policy decisions

Clinic/legal/operations must approve recovery point objective, recovery time objective, retention duration, geographic/storage constraints, encryption ownership, and who can restore. Backup credentials must be separate, least-privilege where the provider permits, injected securely, and never printed or committed.

Prefer managed MongoDB continuous backup/snapshots. For self-hosted MongoDB, use the official version-compatible `mongodump`/`mongorestore` tools and MongoDB's documented replica-set-consistent procedure. A home-grown JSON export is not a production backup.

## Backup checklist

- Confirm the target cluster/database and timestamp without displaying the credentialed URI.
- Confirm encryption in transit and at rest.
- Capture application commit, migration versions, MongoDB/tool version, and index catalog metadata.
- Store the artifact in access-controlled, immutable/versioned storage.
- Verify provider/job success and artifact integrity; alerts must reach an accountable operator.
- Never place a dump under the repository or deployment image.

## Restore drill

1. Provision an isolated, non-production MongoDB target of a compatible version.
2. Block all application access to the target except the drill operator.
3. Restore the selected snapshot/dump with official tooling.
4. Point a separately configured API/preflight process at the restored target; never reuse production Redis/SMTP/Cloudinary/monitoring credentials.
5. Run migration status and `npm run production:preflight` using safe isolated integrations or perform the equivalent DB-only checks.
6. Verify critical index key/unique/TTL options, migration versions, active admin count, clinic singleton, representative catalog counts, appointment lock/quota consistency, consent/publication consistency, and audit/media cleanup collections.
7. Record elapsed restore time, backup timestamp, achieved data age, failures, approvals, and evidence location.
8. Destroy or sanitize the drill environment according to the approved data policy.

## Incident restore

Stop/admit no writes, preserve the damaged source for investigation, and select a restore point with the incident owner. Restore into a new target first. Validate there, document expected lost writes since the recovery point, obtain business approval, rotate credentials if compromise is possible, then cut over. Do not overwrite the only copy of the damaged database.

Production gate evidence: provider backup enabled, latest success time, alert owner, retention approval, restore drill date/result, measured RPO/RTO, and next scheduled drill.
