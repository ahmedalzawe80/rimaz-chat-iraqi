# Repository documentation

This directory contains the maintained project checkpoint, engineering audits, and operational procedures. Application entry points and runtime assets remain in their required locations.

## Repository map
- [Repository structure](REPOSITORY-STRUCTURE.md) — root-file ownership, runtime asset layout, and safe cleanup rules.

## Project continuity
- [Current continuation checkpoint](project/CHECKPOINT-2026-11-25.md) — current branch head, completed source work, exact CI evidence, and remaining release blockers.

## Engineering audits
- [Code audit](audits/CODE-AUDIT.md) — historical source review.
- [Final deep audit](audits/FINAL-DEEP-AUDIT.md) — original v46.93.72 source snapshot.
- [Audit follow-up](audits/AUDIT-FOLLOWUP-2026-11-24.md) — follow-up findings and remediation notes.
- [Runtime resource audit](audits/RUNTIME-RESOURCE-AUDIT-2026-11-24.md) — resource lifecycle and memory review.
- [Transaction safety audit](audits/TRANSACTION-SAFETY-AUDIT-2026-11-24.md) — persistence, rollback, and failure handling.

## Operations
- [Final release gate](operations/FINAL-RELEASE-GATE.md) — exact-head CI evidence, staging requirements, and production promotion boundary.
- [Deployment reference](operations/DEPLOYMENT-46.93.72.md) — guarded synchronization workflow and deployment precautions.

## Contributor guidance
- [Contribution guide](../CONTRIBUTING.md) — branch policy, local checks, and data-safety requirements.

## Change history
- [Changelog](../CHANGELOG.md) — chronological application and repository changes.

## Runtime-data boundary
Git-tracked files and rollback branches do not back up the live Deplexo persistent volume. Before production replacement, create and verify an independent backup of live data and uploads, then complete staging smoke tests.
