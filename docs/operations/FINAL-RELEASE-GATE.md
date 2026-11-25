# Rimaz — final release gate

**Review date:** 2026-11-25  
**Status:** Source candidate and isolated container smoke validated; **not cleared for production**.

## Exact candidate and CI evidence

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Branch: `fix/bound-private-media-ticket-cache`
- PR #3: open, draft, unmerged; base `safety/validate-and-backup-before-sync`.
- Exact source/test/workflow candidate: `e943ee295afb94ff581daafb4a415a53c5984948`.
- Archive-only refresh commit: `54f042a2f6589ee0ee8022e21001767e5a5e15ba`; it changes only `rimaz-final-deep-audit-46.93.72.zip`.
- [GitHub Actions run #45603823711](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45603823711) completed successfully. Source validation passed locked installation, dependency-tree verification, JavaScript syntax, **627 regression checks / 0 failures**, and production Docker build. The production container was then started in isolation; HTTP homepage response and Socket.IO polling handshake both passed.
- Archive validation rebuilt the ZIP, checked integrity/path/tracked-file parity, extracted it, and passed locked installation, dependency-tree verification, syntax, regression tests, root/public HTML parity, and Docker build.
- Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No deployment, restart, production sync, or live-data modification occurred.

## Resource and restore work included

- Startup and restore confirmation use a bounded-chunk JSON reader; database writes and backup staging use a bounded-chunk JSON writer.
- Restore preview uses a token-level streaming inspector with no retained replacement database object graph. It preserves supported format/version/schema checks, owner validation, unique account counts, and array counts.
- Restore confirmation makes and syncs a restrictive disk recovery copy, releases the old in-memory database before parsing the replacement, and restores the previous database file if the operation fails.
- Restore upload concurrency is limited to one; queue capacity is checked before Multer writes the uploaded file. Restore uploads remain capped at 20 MiB.
- Full-backup stream teardown is coordinated so temporary snapshot files are cleaned on cancellation and failure.
- CI now launches the built production container and verifies the homepage and Socket.IO handshake. This is an isolated startup check, not a substitute for staging.

## Non-negotiable production blockers

1. **Independent live-volume backup:** create a consistent backup of `/data/rimaz` outside the app/container/volume.
2. **Isolated full restore:** restore database JSON, `uploads/`, and `private-media/`; verify the owner account, file counts, hashes, paths, and permissions.
3. **Staging smoke test:** login/reconnect, public/private chat, rooms, voice/video, moderation/member-card actions, uploads, backup/restore, and multiple devices.
4. **Runtime resource evidence:** measure RSS, heap, external memory, and array buffers under representative load; collect restart, exit, and OOM reasons against the 128 MB memory and 0.25 vCPU limits.
5. **Provider trust boundary:** confirm `cf-connecting-ip` and `x-real-ip` are sanitized by Deplexo before the application trusts them.
6. **Final promotion review:** audit the exact PR diff and exact-head CI, then promote only after the operational checks above pass.

## Important memory qualification

The historical 128 MB memory-limit incident is **not proven resolved**. Streaming preview removes the second full replacement object graph from the preview phase, and confirmation releases the previous database graph before parsing the replacement. However, confirmation still needs the replacement graph in memory, and no representative-load measurements or Deplexo OOM/restart evidence are available. Do not describe the memory issue as fixed until staging/runtime evidence supports that conclusion.

## Promotion boundary

Git history and the release ZIP do not back up Deplexo's persistent volume. Never replace live `/data/rimaz` with the repository's tracked `data.json` placeholder or with an archive copy. The GitHub connection used for this work cannot independently verify the live Deplexo volume or run staging restore tests.

The user has authorized publication after completion, but that authorization does not waive the blockers above. Until they pass, keep PR #3 unmerged, leave `main` untouched, and do not deploy/restart Deplexo or run the main-only synchronization workflow.
