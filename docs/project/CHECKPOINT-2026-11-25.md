# Rimaz — current continuation checkpoint (2026-11-25)

## Repository and candidate state

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- PR #3: open, draft, unmerged; base: `safety/validate-and-backup-before-sync`.
- Validated source/test commit: `cbf0f15119ff0be6eee6bd8fa7fc76c019c82841`.
- Archive-only commit: `f4d8e56517021f943c6b2ac32d705acd172d5693`; it changes only `rimaz-final-deep-audit-46.93.72.zip`.
- Latest completed workflow: [Actions run #45602868789](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45602868789). Both jobs passed. Source validation included locked install, dependency-tree verification, syntax, **626 regression checks with zero failures**, and production Docker build. The archive job rebuilt and checked the ZIP, extracted it, then passed locked install, dependency-tree verification, syntax, tests, HTML parity, and Docker build.
- Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No production merge, Deplexo deployment/restart, ZIP sync, or live-volume/data operation occurred.

## Implemented in this candidate

- Added a bounded-chunk JSON reader for startup and restore confirmation, and a bounded-chunk JSON writer for durable database snapshots and backup staging.
- Added `lib/restore-inspector.js`: restore preview now token-scans the staged JSON with `keepStack:false`, validates format/version/schema, counts unique account keys and array entries, and checks the owner record without retaining the replacement database object graph.
- Kept confirmation as the authoritative full schema validation. It first saves the current database and makes a restrictive, synced disk recovery copy, then releases the old database object before parsing the replacement. Failed confirmation reloads the recovery snapshot; if the new database was already persisted, the old file is atomically reinstated.
- Restore uploads are disk-backed, capped at 20 MiB, serialized to one in-flight upload, and checked against pending-preview capacity before Multer receives the body. Preview tokens remain short-lived and bound to the requesting administrator.
- Full-backup stream cancellation now propagates through `pipeline`, so temporary snapshot files are cleaned up on cancellation, normal completion, and media-enumeration failure.
- The duplicate nested `rimaz-chat-iraqi-main/` project directory and superseded checkpoint/handoff copies have been removed from the candidate tree. Required root placeholders, verification files, runtime assets, and the release ZIP remain.

## Remaining memory and runtime limitations

- The historical 128 MB Deplexo memory-limit issue is **not declared fixed**. No representative-load RSS/heap/external/arrayBuffers measurements or provider restart/OOM evidence has been collected.
- Preview no longer retains a complete parsed replacement graph, but the parser may still hold the current token/string while reading (bounded by the 20 MiB file limit). Confirmation must ultimately materialize the replacement database object graph after releasing the previous graph.
- No isolated staging restore/round-trip or full application smoke test has been performed. CI and Docker builds do not prove live runtime health.

## Mandatory work before promotion

1. Obtain an independent, consistent backup of live `/data/rimaz` outside the application volume.
2. Restore that backup in isolation, including database JSON, `uploads/`, and `private-media/`; verify owner access, counts, hashes, paths, and permissions.
3. Run staging smoke tests for login/reconnect, public/private chat, rooms, voice/video, moderation/member-card actions, uploads, backup/restore, and multiple devices.
4. Collect representative-load memory and provider exit/restart/OOM evidence; confirm behavior within the 128 MB memory and 0.25 vCPU limits.
5. Obtain provider confirmation that `cf-connecting-ip` and `x-real-ip` are sanitized before IP-based trust.
6. Re-audit the exact final PR diff and CI candidate before promotion.

## Unresolved points/deduction question

The reviewed source shows `points` as an administrator-editable member statistic; no points debit, wallet, or balance transaction path was found. Do not invent a deduction fix. Identify the exact affected feature/route before changing behavior.

**Do not merge PR #3, change `main`, deploy/restart Deplexo, run production ZIP sync, or modify live data until every release blocker is verified.** The user has authorized publication once the work is genuinely ready; that authorization does not waive the safety gates above.
