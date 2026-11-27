# Deplexo persistent-volume backup and recovery runbook

> Status: preparation only. This document does not authorize stopping, restarting, redeploying, changing, or deleting the production application or its persistent volume.

## Scope and verified platform boundary

Rimaz stores durable application data under its Deplexo data mount (`/data/rimaz`). Deplexo documents that the application image filesystem is read-only, `/tmp` is disposable, and the named data volume survives container restarts/replacements on the same worker. The volume is not shared with independent apps, and deleting the app removes the volume.

The published Deplexo User API/CLI documents app inventory/details, deployments, runtime/build logs, usage, alerts, domains, and environment configuration. They do not document a persistent-volume snapshot/export endpoint or a shell/exec operation for copying arbitrary files out of the running container. Do not infer that app-read/log access grants volume access.

References:
- https://docs.deplexo.com/operations/storage/
- https://docs.deplexo.com/reference/user-api/
- https://docs.deplexo.com/guides/cli/
- https://docs.deplexo.com/reference/cli/

## What Rimaz's application backup does—and does not do

The owner/site-admin full-backup endpoint is `GET /api/admin/backup/full` (the admin UI also obtains a short-lived download ticket). In the reviewed application source it streams a TAR/GZIP archive assembled from:
- a database snapshot with `sessions` and `privateMessages` deliberately emptied;
- public upload files referenced by that database snapshot.

This endpoint is useful as a supplementary application-level export. It is **not** a byte-for-byte export of `/data/rimaz`, does not preserve recovery artifacts such as corrupt/previous database generations, and does not include transient private-chat media. The source and regression tests explicitly exclude private-chat media from this full-backup format.

The database snapshot and media hard-link snapshot are prepared sequentially while the application may still accept writes. The endpoint fails closed for missing/unreadable referenced public uploads, but it is not a single atomic point-in-time snapshot of the entire live volume. Do not describe a successful download as a verified full-volume backup or use it alone to authorize a restore.

## Required recovery procedure

1. **Establish the provider-supported export method first.** In Deplexo's dashboard/support, ask for a provider-side consistent snapshot or export of the app's complete named data volume. Confirm the exact volume identity, mount path, snapshot consistency guarantees, export destination, and restore procedure. Do not assume the public API or CLI can read volume contents.
2. **Schedule an approved maintenance window.** If Deplexo cannot provide an atomic snapshot while the app is running, agree on a controlled write freeze/stop procedure with the owner before doing anything. A stop/restart is a production-impacting action and must not be initiated without explicit approval.
3. **Copy the complete volume to independent storage.** The destination must be outside the app/container and outside the source volume. Keep the original untouched. Encrypt the backup, restrict access, and record timestamp, deployment commit, volume identity, file inventory, sizes, and cryptographic hashes.
4. **Verify the copy before any recovery action.** Confirm that it contains the database, all recovery generations (including any `.corrupt-*` and `.previous` files), `uploads/`, and `private-media/` if present. Compare file counts, sizes, hashes, permissions, and the owner account on a protected offline copy. Never replace a missing media file with a fabricated placeholder.
5. **Restore only into an isolated clone.** Validate database JSON and application startup; verify every persisted public-media reference; verify all files and paths; exercise login, public chat, private chat according to its current transient semantics, rooms, voice/video, moderation, and backup/restore. Keep the original production volume unchanged.
6. **Record evidence and obtain a separate release decision.** Only after the clone restore and staging tests pass should a production release be considered. Backup success alone does not authorize deployment, restart, merge, or live-data changes.

## Rimaz-specific preservation rules

- Never overwrite the live `data.json` with the repository placeholder or an archive copy.
- Never auto-restore `.previous` over a corrupt database; preserve the original and all recovery copies for forensic comparison.
- Never delete a database reference to a missing upload merely to make backup validation pass.
- Current private conversations are memory-only and are cleared after a full disconnect/restart. The application backup intentionally excludes active sessions, private message history, and transient private-chat media. Changing that behavior requires a separate product decision.
- Do not upload production database or private user media into GitHub, issue comments, or this repository.

## Current gate

No provider-side volume snapshot/export has been obtained or verified. No live-volume access, production stop/restart, redeployment, merge, or data mutation has been performed. The gate remains blocked pending a provider-confirmed full-volume export path and an isolated restore drill.