# Rimaz — current continuation checkpoint (2026-11-25)

## Repository and validated candidate

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- PR #3: open, draft, unmerged; base: `safety/validate-and-backup-before-sync`.
- Exact source/test/workflow candidate: `e943ee295afb94ff581daafb4a415a53c5984948`.
- Archive-only refresh commit: `54f042a2f6589ee0ee8022e21001767e5a5e15ba`; it changes only `rimaz-final-deep-audit-46.93.72.zip`.
- [GitHub Actions run #45603823711](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45603823711) completed successfully. Source validation passed locked install, dependency-tree verification, syntax, **627 regression checks with zero failures**, Docker build, and a real container smoke test: the app started on port 3000, returned the HTML homepage, and completed a Socket.IO polling handshake.
- The archive job rebuilt and checked the ZIP, extracted it, then passed locked install, dependency-tree verification, syntax, tests, root/public HTML parity, and Docker build.
- Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No production merge, Deplexo deployment/restart, ZIP sync, or live-volume/data operation occurred.

## Implemented in this candidate

- Added a bounded-chunk JSON reader for startup and restore confirmation, and a bounded-chunk JSON writer for durable database snapshots and backup staging.
- Added `lib/restore-inspector.js`: restore preview token-scans staged JSON with `keepStack:false`, validates format/version/schema, counts unique account keys and array entries, and checks the owner record without retaining the replacement database object graph.
- Kept full schema validation at confirmation. Confirmation saves the current database and makes a restrictive, synced disk recovery copy, then releases the old database object before parsing the replacement. Failed confirmation reloads the recovery snapshot; if the new database was already persisted, the old file is atomically reinstated.
- Restore uploads are disk-backed, capped at 20 MiB, serialized to one in-flight upload, and checked against pending-preview capacity before Multer receives the body. Preview tokens remain short-lived and bound to the requesting administrator.
- Full-backup stream cancellation propagates through `pipeline`, ensuring temporary snapshot files are cleaned up on cancellation, normal completion, and media-enumeration failure.
- The duplicate nested `rimaz-chat-iraqi-main/` project directory and superseded checkpoint/handoff copies were removed. Required root placeholders, verification files, runtime assets, and the release ZIP remain.
- The repository root now contains only the application/build/configuration files and the three standard Markdown guides. The project documentation area retains one current checkpoint rather than several overlapping historical handoffs.

## Remaining memory and runtime limitations

- The historical 128 MB Deplexo memory-limit issue is **not declared fixed**. No representative-load RSS/heap/external/arrayBuffers measurements or provider restart/OOM evidence has been collected.
- Preview no longer retains a complete parsed replacement graph, but a single large JSON token/string can still be buffered up to the 20 MiB upload limit. Confirmation must ultimately materialize the replacement database object graph after releasing the previous graph.
- The CI container smoke test proves startup, homepage HTTP, and Socket.IO handshake only. It is not a staging restore/round-trip or a full application smoke test.

## Mandatory work before promotion

1. Obtain an independent, consistent backup of live `/data/rimaz` outside the application volume.
2. Restore that backup in isolation, including database JSON, `uploads/`, and `private-media/`; verify owner access, counts, hashes, paths, and permissions.
3. Run staging smoke tests for login/reconnect, public/private chat, rooms, voice/video, moderation/member-card actions, uploads, backup/restore, and multiple devices.
4. Collect representative-load memory and provider exit/restart/OOM evidence; confirm behavior within the 128 MB memory and 0.25 vCPU limits.
5. Obtain provider confirmation that `cf-connecting-ip` and `x-real-ip` are sanitized before IP-based trust.
6. Re-audit the exact final PR diff and exact-head CI before promotion.

## Unresolved points/deduction question

The reviewed source shows `points` as an administrator-editable member statistic; no points debit, wallet, or balance transaction path was found. Do not invent a deduction fix. Identify the exact affected feature/route before changing behavior.

**Do not merge PR #3, change `main`, deploy/restart Deplexo, run production ZIP sync, or modify live data until every release blocker is verified.** The user has authorized publication once the work is genuinely ready; that authorization does not waive the safety gates above.

## Continuation update — 2026-11-25 (latest observed repository state)

- Latest source/test/workflow commit before this checkpoint refresh: `543d011fe785cd9118bc8fad6525ca28b1ff5a04`.
- The archive automation then created `0d0bcf354b973600b13ece298fd5ee51b8d36275`; GitHub confirms this commit changes only `rimaz-final-deep-audit-46.93.72.zip`.
- Actions run [#800](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45629027188) completed successfully: both `validate` and `refresh-release-archive` jobs passed. The job records show they executed against source SHA `543d011fe785cd9118bc8fad6525ca28b1ff5a04`; the archive job then committed `0d0bcf3`.
- Therefore, do not describe run #800 as a fresh independent workflow run on archive-only SHA `0d0bcf3`. The archive job did validate the rebuilt ZIP contents itself (locked install, dependency tree, syntax, regression suite, HTML parity, and Docker build).
- Current branch tree contains 406 entries. The tracked archive is the sole ZIP at repository root; no nested duplicate project directory was found.
- PR #3 remains open and draft, targeting `safety/validate-and-backup-before-sync`. Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.
- Production promotion remains blocked by the independent live-volume backup, isolated restore drill, full staging chat/media/voice test, representative-load memory and provider restart/OOM evidence, and provider IP-header sanitization confirmation. These are not GitHub CI checks and cannot be truthfully marked complete from repository access alone.


## Exact-head continuation update — 2026-11-25 14:13 UTC

- The source/test/workflow candidate validated by Actions run [#801](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45631604365) is `2651907f91b4af3add3d88a8b4a83e2ec61f3ee7`.
- Run #801 completed successfully on both jobs: `validate` and `refresh-release-archive`. The validation job passed locked dependency installation/tree verification, JavaScript syntax, project regression tests, the production Docker build, and an isolated production-container smoke test for the homepage and Socket.IO polling handshake. The Docker build reported zero npm audit vulnerabilities.
- The archive job rebuilt the ZIP from tracked files, checked CRC/safe paths/exact tracked-file parity, extracted it, then passed locked installation, dependency-tree verification, syntax, regression tests, HTML parity, and the extracted-archive Docker build.
- The archive automation created commit `084a96bcd27a28169f251ff9047d9c2fc7efc5a9`; its only changed file is `rimaz-final-deep-audit-46.93.72.zip`. Thus #801 validated source SHA `2651907...` and independently validated the rebuilt archive contents; do not describe it as a separate push-triggered run on archive-only SHA `084a96b...`.
- Current PR #3 metadata still reports open/draft/unmerged, base `safety/validate-and-backup-before-sync`. Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.
- Exact current source inspection reconfirmed that restore preview is token-streamed and restore confirmation releases the prior database graph before parsing the replacement. It also reconfirmed that the full backup generator walks live media while the service may still mutate it; a full backup is not an atomic point-in-time snapshot. Use an offline consistent volume snapshot or a controlled maintenance window that prevents media changes during export, then verify by isolated restore.
- No independent Deplexo volume backup, isolated restore, live provider telemetry, representative-load memory test, full staging chat/media/voice test, or proxy-header sanitization evidence is available. These remain hard promotion blockers. No merge, deployment, restart, production sync, or live-data operation was performed.
