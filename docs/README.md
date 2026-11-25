# Repository documentation

This directory contains maintained project records, engineering audits, and operational notes. Application entry points and runtime assets remain in their required locations.

## Repository map
- [Repository structure](REPOSITORY-STRUCTURE.md) — root-file ownership, runtime asset layout, and safe cleanup rules.

## Project continuity
- [Current continuation checkpoint](project/CHECKPOINT-2026-11-25.md) — latest branch head, verified CI, ongoing resource work, and release blockers.
- [Previous final checkpoint](project/CHECKPOINT-FINAL-2026-11-24.md) — historical 2026-11-24 release baseline; superseded by the current checkpoint.
- [Detailed engineering checkpoint](project/CHECKPOINT-2026-11-24.md) — historical implementation and audit record.
- [Engineering handoff](project/HANDOFF-2026-11-24.md) — historical implementation context; use the current checkpoint for live status.

## Engineering audits
- [Code audit](audits/CODE-AUDIT.md) — historical v46.93.37 audit; use the current transaction/runtime audits for the latest source state.
- [Final deep audit](audits/FINAL-DEEP-AUDIT.md) — historical v46.93.72 source snapshot; superseded by the current audits and release gate.
- [Audit follow-up](audits/AUDIT-FOLLOWUP-2026-11-24.md) — follow-up findings and remediation notes.
- [Runtime resource audit](audits/RUNTIME-RESOURCE-AUDIT-2026-11-24.md) — resource lifecycle and memory review.
- [Transaction safety audit](audits/TRANSACTION-SAFETY-AUDIT-2026-11-24.md) — persistence, rollback, and failure handling.

## Operations
- [Final release gate](operations/FINAL-RELEASE-GATE.md) — exact-head CI evidence, remaining staging requirements, and production promotion boundary.
- [Deployment notes](operations/DEPLOYMENT-46.93.72.md) — historical package reference; not production authorization.
- [Repair notes](operations/REPAIR-NOTES-46.93.72.md) — historical baseline repairs; current verification is in the current checkpoint and release gate.

## Contributor guidance
- [Contribution guide](../CONTRIBUTING.md) — branch policy, local checks, and data-safety requirements.

## Change history
- [Changelog](../CHANGELOG.md) — chronological application and repository changes.

## Runtime-data boundary
Git-tracked files and rollback branches do not back up the live Deplexo persistent volume. Before production replacement, create and verify an independent backup of live data and uploads, then complete staging smoke tests.
