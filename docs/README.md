# Repository documentation index

This index groups the existing root-level documents without moving them. Their current paths are intentionally preserved because pull requests, audit notes, and handoff records already link to them.

## Current work and handoff

- [Checkpoint](../CHECKPOINT-2026-11-24.md) — latest verified state, outstanding work, and safe continuation point.
- [Handoff](../HANDOFF-2026-11-24.md) — project context and next engineering steps.

## Security and reliability audits

- [Code audit](../CODE-AUDIT.md) — application security and implementation review.
- [Final deep audit](../FINAL-DEEP-AUDIT.md) — earlier comprehensive audit.
- [Audit follow-up](../AUDIT-FOLLOWUP-2026-11-24.md) — follow-up findings and remediation notes.
- [Runtime resource audit](../RUNTIME-RESOURCE-AUDIT-2026-11-24.md) — resource lifecycle and memory-related review.
- [Transaction safety audit](../TRANSACTION-SAFETY-AUDIT-2026-11-24.md) — persistence, rollback, and failure handling.

## Deployment and repair

- [Deployment notes](../DEPLOYMENT-46.93.72.md) — deployment environment and operating notes.
- [Repair notes](../REPAIR-NOTES-46.93.72.md) — recorded repair history and operational context.

## Change history

- [Changelog](../CHANGELOG.md) — chronological project changes.

## Important operational boundary

Git-tracked files and rollback branches do not back up the live Deplexo persistent volume. Before production replacement, create and verify an independent backup of the live data and uploads, then complete staging smoke tests.
