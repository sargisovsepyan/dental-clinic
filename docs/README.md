# Arelis Dental documentation

This index separates the current product and operations reference from historical implementation evidence. Start with the root [project overview](../README.md) for the portfolio-level introduction.

## Current reference

| Document | Purpose |
| --- | --- |
| [API contract](API_CONTRACT.md) | Human-readable endpoint behavior, roles, privacy projections, and concurrency rules |
| [OpenAPI](openapi.yaml) | Validated machine-readable `/api/v1` contract |
| [Backend architecture](ARCHITECTURE.md) | Service boundaries, data model, booking authority, and infrastructure adapters |
| [Frontend architecture](FRONTEND_ARCHITECTURE.md) | Rendering, localization, authentication, RBAC, booking, and administration boundaries |
| [Engineering overview](ENGINEERING_OVERVIEW.md) | Concise inventory of the implemented engineering controls |
| [Security](SECURITY.md) | Threat model, controls, operational requirements, and residual risks |
| [Retention and privacy](RETENTION_AND_PRIVACY.md) | Data minimization, retention, consent, and cleanup decisions |
| [Deployment architecture](DEPLOYMENT_ARCHITECTURE.md) | Provider-portable topology and process contracts |
| [Production environment](PRODUCTION_ENVIRONMENT.md) | Complete production configuration contract |
| [Production runbook](PRODUCTION_RUNBOOK.md) | Controlled release, migration, index, preflight, rollout, and rollback sequence |
| [Operations](OPERATIONS.md) | Health, observability, maintenance, and protected provider-smoke procedures |
| [Backup and restore](BACKUP_RESTORE_RUNBOOK.md) | MongoDB backup, restoration, and recovery validation |

## Historical engineering reports

Implementation-phase audits, verification records, and handoff reports are retained under [`archive/`](archive/README.md). They are useful evidence of the project's development and review history, but may describe older branches, capabilities, or deployment status. Current behavior is defined by the source, OpenAPI contract, and current reference documents above.
