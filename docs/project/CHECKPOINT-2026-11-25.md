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



## Repository topology and latest validation — 2026-11-25 20:20 local

- Current PR chain: PR #1 (`safety/validate-and-backup-before-sync` → `main`) is the safety-workflow prerequisite; PR #3 (`fix/bound-private-media-ticket-cache` → `safety/validate-and-backup-before-sync`) contains the consolidated application, repository cleanup, runtime, and documentation candidate. PR #3 must not be merged directly to `main` while its base is still the safety branch.
- PR #2 (`maintenance/repository-cleanup-2026-11-24`) is a separate open draft against the same safety branch and overlaps the cleanup represented in PR #3. Treat PR #2 as superseded for promotion planning; do not merge it separately or create a competing deployment path. Reconcile/close it only after exact diff review and when promotion is authorized.
- The main branch remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No PR has been merged and no production operation has occurred.
- Actions run [#803](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45632558265) completed successfully for source SHA `7e98b6d1c4d3decffcebfe4713866cf6024d8c41`: both `validate` and `refresh-release-archive` passed. Each source/archive regression run reported **627 checks, zero failures**; both Docker builds succeeded; the isolated container homepage and Socket.IO polling handshake passed; Docker npm audit reported **0 vulnerabilities**.
- The archive job rebuilt an exact tracked-file ZIP of **394 files / 16,342,196 bytes**, verified CRC, safe paths, and tracked-file parity, then tested the extracted archive. It created archive-only commit `56f706c6f83891172b692e2045df98e607d98d9f`, modifying only `rimaz-final-deep-audit-46.93.72.zip`.
- The guarded manual sync workflow's `rsync --delete` commands are scoped only to the archive-managed `public/` and `lib/` directories; the domain verification file is explicitly excluded from public deletion. They do not rsync-delete unrelated repository-root files. The workflow still requires dispatch from `main` plus the explicit confirmation input, and it is a GitHub source sync—not a Deplexo volume backup or deployment.
- Runtime audit follow-up: the earlier full-string backup allocation findings are superseded by the bounded disk-backed backup writer, streamed database-only backup, token-scanned preview, and bounded-chunk restore reader. Remaining memory risks and the non-atomic live-media snapshot limitation are documented in the runtime audit and final release gate.
- Production blockers remain: independent consistent Deplexo volume backup, isolated restore proof, full staging chat/media/voice test, representative-load memory/provider telemetry under 128 MB and 0.25 vCPU, and proxy IP-header sanitization confirmation. No merge, deploy, restart, source sync, or live-data modification was performed.


## Exact branch synchronization and CI repair — 2026-11-25 17:31 UTC

- PR #1 safety branch head: `67d162b9b84e1e8fd38a83659eadfd6b18fac451`. Its validation workflow now runs on pushes to the safety branch and matches that branch's actual Node 20/no-lockfile baseline. The first attempt (#45664864955) correctly exposed a missing `.nvmrc`; the workflow was corrected rather than adding an unrelated runtime file to the safety branch.
- Actions run [#45664990087](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45664990087) passed on the safety branch: **448 regression checks, zero failures**, Docker build, homepage HTTP smoke test, and Socket.IO polling handshake.
- PR #3 had become two commits behind the updated safety branch and GitHub marked it conflicted. A two-parent synchronization commit `4a9db93980ced8faceb05050225f0e807b8aa59b` was added to the PR #3 branch with the validated candidate tree preserved and the current safety head recorded as its second parent. This was a feature-branch-only history synchronization; it did not touch `main`.
- Actions run [#45665303147](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45665303147) passed on exact PR #3 head `4a9db93980ced8faceb05050225f0e807b8aa59b`: both `validate` and `refresh-release-archive` succeeded. Source and extracted archive each passed **627 regression checks with zero failures**, locked dependency installation, dependency-tree verification, JavaScript syntax, Docker build, homepage HTTP, and Socket.IO polling handshake. Docker npm audit reported **0 vulnerabilities**.
- The rebuilt archive was verified as **394 files / 16,344,754 bytes**; the archive job confirmed it already matched the validated source and made no archive-only commit.
- GitHub now reports PR #3 as mergeable/clean against the current safety head `67d162b9...`. PR #3 remains draft/open/unmerged; PR #1 remains draft/open/unmerged; PR #2 remains a separate overlapping draft and is not a promotion step.
- Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No merge, Deplexo deployment/restart, ZIP sync, or live-data operation occurred.
- The release blockers in this checkpoint remain unchanged: independent consistent live-volume backup, isolated restore drill, full staging chat/media/voice test, representative-load memory/provider telemetry under 128 MB and 0.25 vCPU, and provider IP-header sanitization evidence.


## Root-fix continuation — 2026-11-25 19:45 UTC

### Latest validated source and archive

- PR #3 candidate source/test/workflow commit: `a2c2bacfc248258343aadb2d68ebc5da5c245b51`.
- Exact source validation run [#45688138101](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45688138101) completed successfully on both jobs: `validate` and `refresh-release-archive`.
- The validation job passed **635 checks with zero failures**, production Docker build, and `npm audit` reporting **0 vulnerabilities**.
- The archive job rebuilt and verified the ZIP from the validated tracked-file tree, extracted it, reinstalled from the lockfile, and passed its independent checks and Docker build. The automation then created archive-only commit `63209beb99dab8a150b3b29d9196a3da9983a8ec`; PR #3 now points to that archive-only commit. Do not describe #45688138101 as a push-triggered run on the archive-only SHA.
- PR #3 remains open/draft/unmerged with base `safety/validate-and-backup-before-sync`. PR #1 remains open/draft/unmerged. PR #2 remains a separate overlapping draft and is not a promotion path. Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.

### New root fixes and evidence

- Added `lib/client-ip.js`: IP headers are ignored unless the direct socket peer matches an explicitly configured `TRUSTED_PROXY_CIDRS` CIDR. Trusted client-IP headers are syntax-validated. The existing global-IP-ban normalization path is preserved. No provider range is guessed.
- Added a health-panel indicator for trusted-proxy readiness without exposing the configured ranges. If the setting is absent, the panel warns that the observed address may be the proxy itself.
- Added `lib/cgroup-metrics.js` and extended the admin health API/UI to report cgroup memory current/peak/limit, OOM counters, and CPU throttling when cgroup v2 metrics are exposed. These live counters do not replace provider restart history.
- Full-backup upload collection now only follows recognized media-reference fields, ignores arbitrary chat text, and fails closed on missing, unreadable, symlinked, or changing referenced files. The backup captures referenced public uploads as hard links before streaming, and cleanup is tested on success, failure, and cancellation. Transient private messages and their private media remain excluded from the full export by design.
- Added an isolated TAR.GZ extraction drill: the test extracts the full archive and verifies the database envelope, cleared transient sessions/private messages, and byte-for-byte referenced public upload content.
- The production-container smoke test now runs with **128 MiB memory and 0.25 CPU** limits, performs eight concurrent 12 MiB public-media downloads plus 24 homepage/Socket.IO polling pairs, and asserts the container remains running and not OOM-killed.
- Added `scripts/chat-integration-smoke.js`, executed against the constrained production container. It registers two test accounts and verifies authenticated public chat, private text, private-media upload/delivery, unauthorized private-media denial, recipient playback-ticket streaming, voice-room offer/answer signaling, and video-call offer/answer signaling. This verifies server-side signaling and authorization, not actual browser microphone/camera capture, TURN connectivity, or a multi-device real-world session.
- The current root listing has one release ZIP, no nested duplicate project directory, and the application source is grouped under `lib/`, `scripts/`, `docs/`, and `public/`.

### Remaining hard blockers — not to be marked complete

1. **Live Deplexo storage:** no independent backup of the actual persistent volume `/data/rimaz` has been made or verified. The repository ZIP is not a volume backup. The full application export contains the database and referenced public uploads; it intentionally omits transient private messages and their private-media files.
2. **Actual restore/rollback:** the CI drill proves archive extraction and content parity in isolation, but it does not yet prove a restore against a cloned Deplexo volume, including permissions, owner login, existing uploads, and rollback after an induced restore failure.
3. **Provider telemetry:** CI proves one controlled workload survives the configured 128 MiB / 0.25 CPU container limits. It does not prove historical Deplexo OOM/restart behavior is fixed under representative production concurrency. Provider usage, alerts, restart history, and runtime logs still need authorized read-only inspection.
4. **Trusted proxy configuration:** the code now fails closed against spoofed headers, but `TRUSTED_PROXY_CIDRS` must be populated with Deplexo's documented direct proxy source ranges and the provider's client-IP header sanitization must be confirmed. Do not guess CIDRs or use `0.0.0.0/0` / `::/0`.
5. **Real browser/device media:** the CI integration covers signaling and authorization, not actual browser WebRTC audio/video streams, camera/microphone permissions, TURN relay behavior, or multi-device network conditions. A controlled staging session remains required.

**Promotion remains blocked. Do not merge PR #1/#3, close/rebase PR #2 as a promotion action, sync the ZIP to production, deploy/restart Deplexo, or modify the live volume until these external evidence gates are satisfied.**


## Exact latest validation and backup-temp hardening — 2026-11-25 19:50 UTC

- Source/test/workflow commit: `44db9cf9fb1d244d5e91e7073b5b2b86c2976d5b`.
- Actions run [#45688954104](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45688954104) completed successfully on both `validate` and `refresh-release-archive`. The source validation passed **636 checks with zero failures**, Docker build, and npm audit with **0 vulnerabilities**.
- The constrained production-container smoke passed at 128 MiB RAM / 0.25 CPU, including authenticated public/private chat, private-media authorization and playback, voice negotiation, video-call signaling, 8 concurrent 12 MiB media downloads, and 24 homepage/Socket.IO polling pairs. The container remained running and `OOMKilled=false`.
- The full-backup extraction drill passed; cgroup metric parsing and trusted-proxy readiness checks passed.
- Added `lib/backup-temp-cleanup.js`: after startup, only recognized backup temporary files and hard-link snapshot directories older than seven days are removed. Fresh backup files, unrelated files, and symlinks are preserved. The cleanup regression test passed.
- The archive job rebuilt and tested the exact tracked-file archive, then created archive-only commit `9d1395e3fdfb125a499bcb99c0a7c60306f33070`; PR #3 now points to that archive-only SHA. Run #45688954104 validated source SHA `44db9cf...`, not the later archive-only SHA.
- Updated the repository map and README to list the helper modules and CI integration script.

No production state changed. PR #1 and #3 remain open/draft/unmerged; PR #2 remains a separate overlapping draft. PR #3 still targets the safety branch, and production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.

The external release blockers are unchanged: independent live-volume backup, actual isolated restore/rollback against a cloned volume, provider OOM/restart telemetry, exact trusted proxy CIDRs and header-sanitization confirmation, and browser/device WebRTC/TURN testing. The CI integration validates server-side chat and signaling only; it does not prove real microphone/camera streams or production behavior.


## Continuation update — 2026-11-25 20:10 UTC

### Exact candidate and CI

- Current PR #3 head before this checkpoint-only update: `67aa09ac74cb972028ac17f7725c5e20052c90c8`.
- Runtime source/test/workflow candidate: `87fea24082765a08721238c8dd025c36c93ad922`.
- Archive-only refresh commit: `246d3c4ccadb7aadc81ec68d8a7d1d5ad13aeb55`.
- Exact-head Actions run [#45692013572](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45692013572) passed both `validate` and `refresh-release-archive`. Source job: 636 checks, locked dependency install/tree, syntax, Docker build, production-container smoke; npm audit 0 vulnerabilities. Archive job rebuilt and extracted 399 files / 16,362,356 bytes, then passed its own checks and Docker build.
- CI cgroup-v2 after the constrained 24-request HTTP/Socket.IO workload: current 74,211,328 bytes; peak 78,151,680 bytes; limit 134,217,728 bytes. Container remained running and Docker reported OOMKilled=false. This is isolated CI evidence, not Deplexo telemetry.
- Backup media reference discovery now includes `rankDefinitions[].artUrl`; the test fixture verifies the referenced uploaded rank-art file is included. Other supported reference keys include `url`, `image`, `avatar`, `banner`, `bannerUrl`, `icon`, `cover`, `background`, and `giftImage`. Missing or symlinked referenced public uploads fail backup creation instead of silently producing an incomplete archive.
- Root layout rechecked: no nested `rimaz-chat-iraqi-main/`; only intentional root entry points/config/docs/assets and the workflow-required audited ZIP remain. Root/public HTML and Google verification copies are byte-identical. Root `data.json` is a 138-byte warning placeholder only.

### Current promotion state

- PR #3 remains open/draft/unmerged; base is `safety/validate-and-backup-before-sync`.
- Production main remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.
- No merge, production source sync, Deplexo deployment/restart, or live-volume mutation occurred.
- Release blockers are unchanged: independent persistent-volume backup, isolated full-volume restore drill (database plus uploads and private-media), full staging chat/media/voice tests, representative production memory/OOM telemetry, and provider-confirmed trusted proxy header behavior.
- Do not treat the CI memory smoke as proof the historical Deplexo OOM incident is resolved. Do not merge or deploy until the operational release gate is evidenced.
