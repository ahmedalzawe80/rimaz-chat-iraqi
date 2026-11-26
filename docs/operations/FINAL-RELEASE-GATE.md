# Rimaz — final release gate

> **Historical snapshot:** This document contains release evidence recorded on 2026-11-25 and earlier. For the latest branch/PR head and follow-up activity, consult [the 2026-11-26 continuation checkpoint](../project/CHECKPOINT-2026-11-26.md). Do not use the historical SHAs below as the current candidate without re-fetching the PR and exact-head checks.

**Review date:** 2026-11-25  
**Status:** Source candidate and isolated container smoke validated; **not cleared for production**.

## Exact candidate and CI evidence

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Branch: `fix/bound-private-media-ticket-cache`
- PR #3: open, draft, unmerged; base `safety/validate-and-backup-before-sync`.
- Exact source/test/workflow candidate: `2651907f91b4af3add3d88a8b4a83e2ec61f3ee7`.
- Archive-only refresh commit: `084a96bcd27a28169f251ff9047d9c2fc7efc5a9`; it changes only `rimaz-final-deep-audit-46.93.72.zip`.
- [GitHub Actions run #45631604365 (run #801)](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45631604365) completed successfully on both `validate` and `refresh-release-archive`. The source job passed locked installation/tree verification, syntax, regression tests, production Docker build, and an isolated production-container homepage + Socket.IO polling smoke test. Docker dependency audit reported **0 vulnerabilities**.
- The archive job rebuilt the ZIP from tracked files, checked CRC/safe paths/exact tracked-file parity, extracted it, and passed locked install, dependency-tree verification, syntax, regression tests, root/public HTML parity, and Docker build. Run #801 validated source SHA `2651907...`; its archive job then created archive-only commit `084a96b...`.
- Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No deployment, restart, production sync, or live-data modification occurred.

## Resource and restore work included

- Startup and restore confirmation use a bounded-chunk JSON reader; database writes and backup staging use a bounded-chunk JSON writer.
- Restore preview uses a token-level streaming inspector with no retained replacement database object graph. It preserves supported format/version/schema checks, owner validation, unique account counts, and array counts.
- Restore confirmation makes and syncs a restrictive disk recovery copy, releases the old in-memory database before parsing the replacement, and restores the previous database file if the operation fails.
- Restore upload concurrency is limited to one; queue capacity is checked before Multer writes the uploaded file. Restore uploads remain capped at 20 MiB.
- Full-backup stream teardown is coordinated so temporary snapshot files are cleaned on cancellation and failure.
- CI now launches the built production container and verifies the homepage and Socket.IO handshake. This is an isolated startup check, not a substitute for staging.

## Non-negotiable production blockers

1. **Independent live-volume backup:** create a consistent backup of `/data/rimaz` outside the app/container/volume. The current full-backup generator does not lock the database and media tree into one atomic snapshot while uploads/deletes may continue. Use an offline consistent volume snapshot or a controlled maintenance window that prevents media mutations for the entire export; then verify the copy by restoring it in isolation.
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



## Repository promotion order and latest CI — 2026-11-25

- PR #1 is the safety-workflow prerequisite from `safety/validate-and-backup-before-sync` to `main`.
- PR #3 is the consolidated application and repository candidate, based on the safety branch. It must be reviewed against that base and promoted only after the prerequisite branch is handled; do not merge it directly to `main` while its base remains the safety branch.
- PR #2 is a separate open draft cleanup branch that overlaps the cleanup now represented in PR #3. It is not a second promotion step. Do not merge it independently; reconcile it as superseded after final diff review.
- Actions run [#803](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45632558265) passed both jobs. Source SHA `7e98b6d...` and the rebuilt/extracted archive each passed **627 regression checks with zero failures**; both production Docker builds and the isolated HTTP homepage + Socket.IO handshake passed; npm audit reported **0 vulnerabilities**. Archive-only commit `56f706c...` contains only the ZIP (394 files, 16,342,196 bytes).
- The manual sync workflow's `rsync --delete` is confined to `public/` and `lib/`, not the repository root; the domain-verification HTML in `public/` is explicitly excluded. This workflow updates tracked GitHub application source only and is not a persistent-volume backup or Deplexo deployment.
- The previous full-string backup allocation findings are superseded by the current disk-backed streaming backup and bounded-chunk reader/restore implementation. Remaining restore-graph, largest-token, disk-capacity, and live-media consistency limits still require staging evidence. The 128 MB incident remains unproven resolved.


## Latest exact-head verification — 2026-11-25 17:31 UTC

- Safety prerequisite PR #1 now has a real push-triggered validation run on its current head `67d162b9b84e1e8fd38a83659eadfd6b18fac451`. Actions run [#45664990087](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45664990087) passed 448 checks, Docker build, homepage HTTP, and Socket.IO polling. The workflow uses Node 20 for the current safety-branch baseline; the initial missing-`.nvmrc` failure was corrected in the workflow, not hidden.
- PR #3 was synchronized with the latest safety-branch history by merge commit `4a9db93980ced8faceb05050225f0e807b8aa59b` (first parent: prior PR #3 head; second parent: safety head). Its validated source tree was preserved. GitHub now reports PR #3 mergeable and clean against safety head `67d162b9...`.
- Exact-head Actions run [#45665303147](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45665303147) completed successfully on `4a9db93980ced8faceb05050225f0e807b8aa59b`. Both `validate` and `refresh-release-archive` passed; source and extracted archive each passed **627 regression checks with zero failures**, locked dependency installation, dependency-tree verification, syntax checks, Docker builds, homepage HTTP, and Socket.IO polling handshake. Docker npm audit reported **0 vulnerabilities**.
- The rebuilt release ZIP was verified as **394 files / 16,344,754 bytes** and already matched the validated source, so no archive-only commit was needed.
- PR #1 and PR #3 remain open/draft/unmerged. PR #2 remains a separate overlapping draft and must not be merged as a parallel cleanup path. Production `main` is still `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.
- These results validate source, archive, and isolated container startup only. They do **not** clear the independent Deplexo backup, isolated restore, full staging chat/media/voice, representative-load memory/provider telemetry, or proxy IP-header trust blockers. Do not merge to production or deploy until those are evidenced.


## Final-stage status — 2026-11-27

The latest continuation checkpoint is [CHECKPOINT-2026-11-27.md](../project/CHECKPOINT-2026-11-27.md). The final source fix `9806c753cae67fd108830d30a3a94a7265156036` was followed by GitHub Actions bot archive commit `2fcb9e8553f58db625b78666174f5c75f1a9bfd0`, which changes only the audited ZIP. The archive refresh job depends on successful `validate`; this is workflow evidence that source validation and archive refresh completed, although the available connector did not expose the run ID/logs.

Current PR chain review: PR #1 is the safety prerequisite; PR #3 is the consolidated app candidate and is currently reported mergeable; PR #7 is diverged/not mergeable; PR #8 is three commits atop PR #7 but targets `main` with a 697-commit / 44-file comparison, so it must not be merged as a standalone patch. PR #2 overlaps PR #3. See the checkpoint for exact refs and do-not-merge guidance.

**Production remains blocked:** independent live-volume backup and isolated restore, investigation of the missing referenced JPG, staging verification, Deplexo OOM/restart evidence, and provider proxy-header confirmation are still outstanding. No merge, deployment, restart, ZIP sync, or live-data mutation occurred.

## Latest root-fix evidence — 2026-11-25 19:50 UTC

- Source candidate `44db9cf9fb1d244d5e91e7073b5b2b86c2976d5b` passed Actions run [#45688954104](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45688954104): 636 regression checks, zero failures, production Docker build, and 0 npm audit vulnerabilities. The archive job independently rebuilt, extracted, and validated the release ZIP; archive-only commit `9d1395e3fdfb125a499bcb99c0a7c60306f33070` then updated the PR head.
- The constrained production-container smoke test ran with 128 MiB RAM and 0.25 CPU. It verified authenticated public/private chat, private-media authorization and ticket playback, voice-room offer/answer signaling, video-call offer/answer signaling, concurrent media downloads, and homepage/Socket.IO polling. Docker inspection confirmed the container remained running and was not OOM-killed.
- The full-backup extraction drill verified the archive's database envelope and referenced public upload content. It is not a live-volume restore or an application rollback drill.
- Backup snapshots now fail closed on missing/symlinked/changing referenced uploads; startup removes only recognized backup temp artifacts older than seven days.
- Admin health now reports cgroup v2 memory/peak/limit/OOM/CPU-throttling metrics when available, and indicates whether trusted proxy ranges are configured.

### Still blocking production promotion

1. Independent backup of the live Deplexo persistent volume and a real restore/rollback drill on a cloned volume.
2. Read-only Deplexo usage, alerts, runtime logs, restart history, and OOM evidence; the CI container test is not proof that historical production OOM is resolved.
3. Exact Deplexo proxy source CIDRs and confirmation of sanitized client-IP headers. Do not guess or use all-public ranges.
4. Browser/device WebRTC microphone/camera and TURN relay tests. CI validates server signaling only.
5. Final exact-diff and PR-chain review before promotion.

PR #3 remains open/draft against the safety branch; PR #1 remains the safety prerequisite; PR #2 is an overlapping draft and is not to be merged separately. Main is unchanged. No Deplexo deploy/restart, production ZIP sync, or live-volume mutation has occurred.


## Latest exact candidate verification — 2026-11-25 20:09 UTC

- Source/test/workflow candidate: `87fea24082765a08721238c8dd025c36c93ad922`.
- Exact-head Actions run [#45692013572](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45692013572) completed successfully on both `validate` and `refresh-release-archive`.
- The source validation passed 636 regression checks, locked dependency installation, dependency-tree verification, JavaScript syntax, production Docker build, and the production-container smoke test. npm audit reported 0 vulnerabilities.
- The rebuilt archive was independently extracted and tested; it contains 399 files (16,362,356 bytes), and the archive job passed its regression checks and Docker build. Archive-only commit: `246d3c4ccadb7aadc81ec68d8a7d1d5ad13aeb55`.
- The smoke test exercised authenticated public/private chat, private-media authorization and playback, voice-room negotiation, video-call signaling, homepage HTTP, Socket.IO polling, and 24 concurrent homepage/Socket.IO requests. Under the 128 MiB / 0.25 CPU container limits, cgroup v2 reported 74,211,328 bytes current and 78,151,680 bytes peak after the workload; Docker confirmed the container remained running and was not OOM-killed. This is an isolated CI workload, not representative Deplexo telemetry.
- Backup media discovery was extended to include uploaded rank artwork stored in `rankDefinitions[].artUrl`; a regression fixture verifies that referenced artwork is included alongside profile, gift, and chat media. Unreferenced uploads and private-media files remain excluded by design.
- The repository tree contains no nested `rimaz-chat-iraqi-main/` project copy. Root/public `index.html` and the Google verification file are byte-identical; `data.json` is only the 138-byte warning placeholder, not production data. The audited ZIP remains at root because both guarded archive workflows require that exact path.
- PR #3 remains open/draft/unmerged, based on `safety/validate-and-backup-before-sync`. Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`; no production sync, deployment, restart, or live-volume change occurred.
- The operational blockers above remain in force: independently backed-up Deplexo volume, isolated full-volume restore drill, representative staging tests, production memory/OOM telemetry, and provider-confirmed proxy-header trust. CI success does not waive them.


## Latest verified source candidate and documentation follow-up — 2026-11-25

- Latest validated source/test/workflow candidate: `87fea24082765a08721238c8dd025c36c93ad922`.
- Exact Actions run [#45692013572](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45692013572) completed successfully: both `validate` and `refresh-release-archive` jobs succeeded. Source validation recorded 636 regression checks with zero failures, locked dependency installation/tree verification, syntax checks, production Docker build, isolated HTTP/Socket.IO startup, and npm audit with 0 vulnerabilities.
- The constrained CI container ran at 128 MiB RAM / 0.25 CPU. After the recorded HTTP/Socket.IO workload, cgroup-v2 reported 74,211,328 bytes current and 78,151,680 bytes peak against 134,217,728 bytes; the container remained running and Docker reported `OOMKilled=false`. This is isolated CI evidence, not Deplexo production telemetry.
- The archive job rebuilt and extracted the tracked-file ZIP, validated 399 files / 16,362,356 bytes, and passed its own checks and Docker build. Archive-only refresh commit: `246d3c4ccadb7aadc81ec68d8a7d1d5ad13aeb55`.
- The latest source candidate includes the backup-media reference correction for `rankDefinitions[].artUrl`, plus the already documented backup snapshot/cleanup, cgroup metrics, trusted-proxy IP resolution, and authenticated chat/media/voice/call integration smoke coverage.
- Documentation-only follow-ups were then committed as `cc7c6ae460069df2eedd3fe12fc5d318ba1c616a` and `643a7867ea19f75814d91b8d5ffab863334ecce5` to reconcile stale candidate/CI notes. They do not alter application runtime code. The connected status endpoint returned no status contexts for the documentation head, and the workflow-run lookup only returns PR-triggered runs; therefore no exact-head check result for the documentation-only head is claimed here.
- PR #3 remains open/draft/unmerged and targets `safety/validate-and-backup-before-sync`. Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No production merge, deployment, restart, ZIP sync, or live-volume operation has occurred.
- The external release blockers remain: independent consistent Deplexo volume backup, isolated full restore/rollback against a clone, provider restart/OOM telemetry, exact provider proxy CIDRs and header-sanitization confirmation, and real browser/device WebRTC/TURN testing. CI success does not waive these gates.
