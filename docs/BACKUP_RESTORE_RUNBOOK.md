# MongoDB backup and restore runbook

This repository provides procedure, not an enabled backup. Production is not approved until a real provider backup exists and a restore has been demonstrated.

## Backup policy decisions

Clinic/legal/operations must approve recovery point objective, recovery time objective, retention duration, geographic/storage constraints, encryption ownership, and who can restore. Backup credentials must be separate, least-privilege where the provider permits, injected securely, and never printed or committed.

Prefer managed MongoDB continuous backup/snapshots. For self-hosted MongoDB, use the official version-compatible `mongodump`/`mongorestore` tools and MongoDB's documented replica-set-consistent procedure. A home-grown JSON export is not a production backup.

## Backup checklist

Recommended initial real-production policy, subject to clinic approval: named backup owner and second restore approver; continuous/PITR recovery aiming for RPO<=15minutes and RTO<=4hours; daily encrypted restore points30days, weekly points12weeks, quarterly restore drills plus one before first traffic. These are targets, NOT achieved guarantees or legal retention decisions. A daily-only demonstration may lose24h of writes; functional deployment never certifies a15minute RPO. Use independently controlled encryption keys, least-privilege roles, protected off-service copies and immutable/versioned retention; test key recovery. Cloudinary asset retention and surviving consent/withdrawal authority must be reviewed separately: a MongoDB restore does not restore assets or permit resurrecting withdrawn patient images.

Official version-compatible full replica-set tooling can be appropriate for a dedicated replica set. Use operator-only injected credential YAML outside Git, not a command-line URI/password:

```text
mongodump --config /secure/backup.yml --archive=/protected/clinic-restore-point.archive --gzip --oplog
mongorestore --config /secure/ISOLATED-restore.yml --archive=/protected/clinic-restore-point.archive --gzip --oplogReplay
```

Review source/target identities, privileges and consistency before execution. Full oplog workflow requires a cluster-level URI without a selected database; do not filter/rename namespaces or assume a partial dump supports oplogReplay. Restore into a fresh isolated target, never add `--drop` against an existing target or run restore in CI/startup. Avoid DDL/index changes during dump. Sharded clusters need a coordinated approved backup/snapshot procedure, not a generic single-node oplog recipe. Pausing application writers alone does not freeze TTL/system writes or certify a plain partial live export atomic. Prefer provider-consistent snapshots/PITR. See official [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/) and [mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/) constraints.

Initial operator job budget60minutes (revise from measured size), with alerts before expiry; interrupted artifacts are never recovery evidence until validated. Store encrypted artifacts outside repository/images, verify integrity, preserve damaged source, and record safe commit/migration/index metadata. Drill networks/providers must stay isolated: use DB-only equivalent preflight checks rather than injecting live providers simply to satisfy production schema. Destroy/sanitize the approved drill after evidence review, not during an automatic deployment.

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
