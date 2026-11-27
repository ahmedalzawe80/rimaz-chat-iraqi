# Rimaz Chat — transaction safety and persistence audit

> **Dated source audit (2026-11-24).** This is a source-review snapshot, not a current production or live-data verification. Consult the [2026-11-27 checkpoint](../project/CHECKPOINT-2026-11-27.md) for the latest branch state and release blockers.

**Last reviewed:** 2026-11-24  
**Reviewed branch:** `fix/bound-private-media-ticket-cache`  
**Scope:** source-level review of persistence, rollback behavior, startup migrations, and the current automated validation state.

## Scope and limits

This report describes the reviewed Git candidate only. It does not claim that the live Deplexo container, production database, persistent volume, or real multi-device sessions were inspected. Regression checks and Docker builds are not substitutes for an isolated staging restore and runtime smoke tests.

## Confirmed protections in the reviewed source

### Durable database writes

- `save()` serializes a snapshot that excludes transient private messages, writes a unique temporary file with restrictive permissions, flushes it, and atomically renames it over the database file.
- A failed write removes its temporary file and propagates the error to the caller.
- Startup refuses to continue when the existing database is malformed or unreadable; it preserves a recovery copy when possible rather than silently replacing the database with defaults.
- Queued public chat-message writes are batched. Failed batches restore the previous in-memory message collection and retry; after the configured retry limit, pending send promises are rejected rather than acknowledged as saved.
- Shutdown attempts to flush queued messages and persist final state, and exits nonzero if the final save fails.

### Rollback-safe mutations and event ordering

The reviewed source and regression suite cover rollback or fail-closed handling for the audited mutation families, including:

- Registration, guest creation, session creation, and logout cleanup.
- Member profile, likes, points, rank assignment, rank artwork, VIP, gifts, and notification state.
- Room/global moderation, ignore lists, wall controls, announcement publication/deletion, and admin message deletion.
- Upload cleanup that checks database references before removing a public media file.
- Restore confirmation that records a recovery copy and invalidates old in-memory sessions after a successful database replacement.

For durable actions, the relevant code restores prior state on save failure and delays corresponding broadcasts/disconnects until after persistence succeeds. Startup migrations for the smiley gallery, welcome-message defaults, expired announcements, and gift catalogue now fail closed: a failed migration save stops startup instead of serving an uncommitted in-memory state.

### Authorization and message consistency

- The admin data endpoint is mapped to the granular permission set; its handler filters returned data according to the caller's permissions.
- The generic higher-rank guard no longer grants a blanket bypass to delegated permission managers.
- Regression checks cover HTTP and Socket.IO message filtering, message-length limits, anti-spam behavior, and relevant permission boundaries.
- The audit found and fixed a shadowed `/api/admin/data` permission mapping that previously returned only `panel_access`.

## Repository and build validation

- Node.js 24 is pinned through `.nvmrc` and constrained in `package.json`.
- `package-lock.json` is committed. CI and Docker use `npm ci` / `npm ci --omit=dev`, rather than an unlocked production install.
- Docker uses `node:24-bookworm-slim`; `.dockerignore` excludes runtime data, uploaded/private media, local dependencies, secrets, and backup material.
- The root `index.html` and `public/index.html` are intentional synchronized copies. The Google verification file is also intentionally present at both locations. Regression checks verify HTML parity; these copies must not be removed as apparent duplicates.
- The tracked root `data.json` is an initial warning placeholder, not the live database. Production data belongs in the persistent `DATA_DIR` volume.

### Latest validation evidence

- Source candidate: `1b08bb7f77feeb6687acc6faf82ca7fc0d6cae11`.
- GitHub Actions run [#706](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45470072510) completed successfully: **603 regression checks, zero failures**, dependency-tree verification, JavaScript syntax checks, and production Docker build.
- The same run rebuilt and validated the extracted release archive: **394 files**, CRC/path/parity checks, **603 regression checks with zero failures**, extracted-archive Docker build, and npm audit reporting **0 vulnerabilities**.
- The branch head was subsequently advanced by archive-only commit `796ce057d1dac768c16152dcefaf27e908b004c8`. That commit changes only `rimaz-final-deep-audit-46.93.72.zip`; the validated source SHA above remains the source candidate tested by run #706.

## Remaining release blockers

These are operational checks, not claims of confirmed source defects:

1. Obtain an independent, consistent backup of the live `/data/rimaz` volume to storage outside the application and volume.
2. Restore that copy into an isolated staging app/volume. Restore the database JSON and the `uploads/` and `private-media/` trees separately, preserving paths and ownership; the database restore endpoint does not unpack the full media archive.
3. Verify the restored database, owner/account record, media file counts and hashes, and filesystem permissions.
4. Run staging smoke tests for sign-in, reconnect, public/private chat, room join/move/leave, voice/video, moderation/member-card actions, uploads/private media, backup/restore, and multiple devices.
5. Observe real runtime memory/RSS, restarts, OOM/exit reasons, and load behavior on the target hosting environment.
6. Confirm that Deplexo's edge overwrites or sanitizes `cf-connecting-ip` and `x-real-ip` before those headers are trusted for IP-based bans. This remains provider-specific and unconfirmed, not a demonstrated exploit.
7. Re-fetch the exact release candidate and require green checks on its exact source/archive state, then obtain explicit approval before promotion.

The full backup generator does not lock the database and media tree as one atomic snapshot while uploads/deletes may occur. Use a maintenance window that prevents media mutation during export, or an offline consistent volume snapshot. A downloaded archive alone is not a verified restore.

## Release boundary

PR #3 remains open, draft, and unmerged. `main` and production have not been changed by this work. Do not merge, run the guarded ZIP synchronization workflow, deploy, or restart Deplexo until the independent backup, isolated restore, staging tests, runtime evidence, and explicit promotion approval are complete.
