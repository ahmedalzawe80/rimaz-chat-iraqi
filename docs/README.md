# Repository documentation

This directory contains maintained project records, engineering audits, and operational notes. Application entry points and runtime assets remain in their required locations.

## Project continuity
- [Current checkpoint](project/CHECKPOINT-2026-11-24.md) — repository state, verified checks, safety boundaries, and next steps.
- [Engineering handoff](project/HANDOFF-2026-11-24.md) — implementation context and ongoing repair work.

## Engineering audits
- [Code audit](audits/CODE-AUDIT.md) — application security and implementation review.
- [Final deep audit](audits/FINAL-DEEP-AUDIT.md) — comprehensive historical audit.
- [Audit follow-up](audits/AUDIT-FOLLOWUP-2026-11-24.md) — follow-up findings and remediation notes.
- [Runtime resource audit](audits/RUNTIME-RESOURCE-AUDIT-2026-11-24.md) — resource lifecycle and memory review.
- [Transaction safety audit](audits/TRANSACTION-SAFETY-AUDIT-2026-11-24.md) — persistence, rollback, and failure handling.

## Operations
- [Deployment notes](operations/DEPLOYMENT-46.93.72.md) — historical deployment package and operational guidance.
- [Repair notes](operations/REPAIR-NOTES-46.93.72.md) — recorded repair history and context.

## Contributor guidance
- [Contribution guide](../CONTRIBUTING.md) — branch policy, local checks, and data-safety requirements.

## Change history
- [Changelog](../CHANGELOG.md) — chronological application and repository changes.

## Runtime-data boundary
Git-tracked files and rollback branches do not back up the live Deplexo persistent volume. Before production replacement, create and verify an independent backup of live data and uploads, then complete staging smoke tests.