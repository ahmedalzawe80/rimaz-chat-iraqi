# Rimaz — final continuation checkpoint (2026-11-24)

## Current repository state

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- PR #3: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/pull/3
- PR #3 remains open, draft, unmerged, and targets `safety/validate-and-backup-before-sync`.
- All 11 changed paths in PR #2 are included in PR #3; PR #2 has no unique paths and must not be merged separately.
- Repository default branch is `main`. No merge, main update, Deplexo deployment/restart, ZIP sync, or live data modification has been performed.

## Deterministic dependency installation

- Added a genuine npm lockfile v3 generated on Node.js 24: `package-lock.json`.
- Lockfile root identity and dependency declarations match `package.json`; the lock contains 96 package entries.
- Lockfile commit: [`ed4ef756a96351f6f368dba7295420cc0f6ebbd1`](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/ed4ef756a96351f6f368dba7295420cc0f6ebbd1).
- Dockerfile uses `npm ci --omit=dev`.
- Permanent CI requires `npm ci`, `npm ls --depth=0`, syntax checks, `npm test`, and a Docker build.
- Regression tests assert the lockfile matches package identity/dependencies, Docker uses the lockfile, and CI enforces the deterministic install.
- README, CONTRIBUTING, CHANGELOG, deployment notes, and repository structure docs describe the locked install.

## Audited source archive and guarded synchronization

- The old ZIP was found to contain a different `package.json` from the reviewed candidate. The audit failed closed; no source sync was run.
- Rebuilt `rimaz-final-deep-audit-46.93.72.zip` deterministically from the candidate's tracked files.
- The archive contains 394 tracked files and is 16,336,813 bytes. It includes the current package manifest, lockfile, Dockerfile, application files, docs, workflows, and public assets; the archive itself and one-time builder workflow are excluded.
- Archive rebuild run [45409544443](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45409544443) passed candidate and extracted-archive validation, each with 567 pass markers and zero failures; both Docker builds succeeded.
- Both Docker builds installed 95 locked production packages and reported zero vulnerabilities in npm audit output.
- Archive audit checks safe paths, symlinks, duplicate files, entry/size/compression limits, and exact parity for package manifest, lockfile, Dockerfile, server, index, verify.js, and all public assets.
- Manual ZIP sync refuses stale archives, requires explicit confirmation on main, and runs clean locked installs, regression tests, and Docker builds before and after sync. It is not a Deplexo deployment command.
- The one-time archive builder workflow was removed after the ZIP was rebuilt and validated.

## Exact final-head CI evidence

Final post-cleanup candidate commit `5ec794813d0a0fc1b8eb2376182e1749ec933fa2` passed both workflows:
- [Validation run 45409969779](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45409969779): npm ci, npm ls, syntax checks, 567 regression pass markers, zero failures, and production Docker build.
- [Archive audit run 45409969751](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45409969751): safe extraction, exact source/lockfile/Dockerfile/public parity, 567 regression pass markers, zero failures, and Docker build.
- Validation Docker build installed 95 locked production packages and reported zero vulnerabilities.
- Earlier run `45379916442` on SHA `c30b7b92093dbbf4162cb6f30573355ad20b0f1f` reported 556 pass markers and zero failures; that result belongs only to that earlier SHA.

The final release-gate/checkpoint documentation is refreshed after that validated code head; always verify the newest head's own CI before merge.

## Outstanding production release gates

1. Independent backup of the live Deplexo persistent volume, including database, uploads, and private media.
2. Restore that backup into isolated staging and verify integrity.
3. End-to-end smoke tests: login, reconnect grace, public/private chat, room lifecycle, voice/video, moderation/member-card actions, uploads, backup/restore, and multi-device sessions.
4. Runtime evidence for exit codes, restarts, OOM, heap/RSS, and representative load.
5. Fresh green CI on the final exact PR head and final review.
6. Confirm persistent-volume mount and production environment settings before promotion.

## Safety boundary

The owner has requested publication after completion, but production promotion must wait for the release gates above. Do not merge PR #3, change `main`, run ZIP synchronization, deploy/restart Deplexo, or modify live database/uploads/private media/persistent volume before backup, staging, and approval gates are satisfied.

## Resume instructions

Always inspect the current PR head and exact-head CI first. Keep work on `fix/bound-private-media-ticket-cache`. Do not claim production readiness from CI alone. Continue with backup/staging coordination; publish only after the release gates are actually complete.


## Follow-up archive-audit hardening — 2026-11-24

- Latest workflow hardening commit: [70884a8](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/70884a8b0a800f686e94e7137b03d9eee09fee11).
- Archive audit now runs ZIP CRC/integrity validation before extraction, then verifies the extracted project's locked dependency tree with `npm ls --depth=0`, repeats JavaScript syntax checks, and verifies root/public HTML parity before Docker build.
- Exact-head validation run [45412772398](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45412772398) passed on this commit: 567 pass markers, zero failures, production Docker build successful, and npm audit output reported zero vulnerabilities.
- Exact-head archive audit run [45412772526](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45412772526) passed on this commit: archive integrity/parity, 567 pass markers, zero failures, dependency-tree verification, and Docker build.
- These are repository/CI checks only. They do not establish live Deplexo health or replace independent backup and staging restore tests.


## Private-message rate-limit correction and refreshed archive — 2026-11-24

- Moved private-message rate-limit accounting after content, recipient, privacy, ignore, and online-availability checks, and after any required private-hidden-state save succeeds. Invalid or unavailable-recipient attempts no longer consume the sender's delivery quota.
- Added runtime regression coverage for the three-identical-message limit, seven-message/five-second window, reset behavior, empty input, and limiter placement before accepted-message delivery.
- Rebuilt `rimaz-final-deep-audit-46.93.72.zip` from current tracked files after the server/test changes. The one-time builder workflow was removed after the archive commit; no temporary builder remains in the repository.
- Latest candidate head: `7d3a76fb6452c2cdddecf90f3d62e6d1a52e2dba`.
- [Validation run 45413521661](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45413521661) passed on the exact head: locked install, dependency tree, syntax, regression suite, and production Docker build.
- [Archive audit run 45413521644](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45413521644) passed on the exact head: safe extraction, archive/source parity, CRC integrity, locked dependency tree, syntax, regression suite, and Docker build.
- These checks validate the repository candidate only; independent live-volume backup/restore and isolated staging remain outstanding.


## Final continuation state — 2026-11-24

- Verified branch tip before this documentation refresh: `b3a44f5e29df7b9c8c63e717afcc275becdf997c`.
- [Validation run 45413964291](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45413964291) and [archive audit run 45413964564](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45413964564) both completed successfully on that exact tip. Validation covered locked install, dependency tree, syntax, regression suite, and Docker build. Archive audit covered CRC integrity, safe extraction, exact app/build/public parity, locked install, regression suite, and Docker build.
- The historical handoff and earlier checkpoint documents are now explicitly marked as historical and point to this final checkpoint and the release gate.
- The archive was regenerated after those documentation corrections; its app/build/public parity is enforced by the archive audit. The one-time builder workflow was removed again after generation.
- Production gates remain open: no independent hosting-volume backup/restore or isolated staging is available, so no merge, main update, ZIP sync to main, deployment, or restart is authorized/performed.


## Public chat anti-spam ordering correction — 2026-11-24

- Reordered public-message validation in both HTTP and Socket.IO: blocked-term rejection now occurs before anti-spam quota accounting. A rejected message can no longer consume the sender's public-chat message allowance.
- The anti-spam check remains before built-in bot-command processing, so bot commands retain the existing flood protection.
- Added regression assertions for both transport paths and for preserving bot-command rate protection.
- Server commit: [aa5de8c](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/aa5de8c9591ee9a077ba795f4fb197a51faf2e97); test commit: [fc50eb8](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/fc50eb8493424c5bc0763d4fbdf897e9f722f524).
- This change is source-reviewed through the repository contents, but no exact-head Actions run has been returned yet. Do not claim test-suite or Docker success for this head until CI confirms it.
- The committed ZIP predates these latest server/test edits and is therefore stale. Do not use or synchronize it. It must be rebuilt from the exact candidate and pass archive parity/CRC checks before any release use.
- PR #3 remains open, draft, and unmerged. No main-branch update, deployment, restart, or live-data modification has occurred.


## Superseding archive rebuild result — 2026-11-24 15:02 UTC

- The earlier note that the ZIP was stale is superseded: the release archive has now been regenerated from the exact tracked candidate after the public-chat anti-spam and message-type fixes.
- Archive: 394 tracked files, 16,341,846 bytes. The rebuild validated CRC, safe paths, no duplicate paths or symlinks, and exact parity against all 394 tracked candidate files (excluding the archive itself and the temporary builder workflow).
- Rebuild/verification run [45420675947](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45420675947) completed successfully. Inside the extracted archive, `npm ci`, `npm ls --depth=0`, JavaScript syntax checks, `npm test`, HTML parity, and production Docker build all passed; Docker installed 95 production packages and npm audit reported zero vulnerabilities.
- The temporary one-time builder workflow was removed after it committed the ZIP. Its path is not part of the final candidate or archive.
- Candidate code validation run [45420675671](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45420675671) passed on the same source candidate before the archive commit. The later PR archive-audit run had started before the ZIP replacement and therefore does not validate the refreshed ZIP; the successful builder run above is the evidence for the refreshed archive.
- Final cleanup commit: `c68ff6fb361228d82f208cc6dd824fbfead194ec`. PR-triggered checks for the cleanup commit require GitHub Actions approval and are not represented as green here.
- This is repository/archive validation only. It does not replace live Deplexo backup/restore, isolated staging, runtime/load checks, or production approval. No merge, deployment, restart, or live-data change occurred.

## Private/wall media module enforcement — 2026-11-24

- Root-cause finding: the shared `POST /api/media` upload route checked the private-media sender threshold and wall's temporary stop flag, but did not enforce the independent `privateChat` and `wall` module switches. This allowed the media-upload transport to bypass the module shutdown enforced by the text/history routes.
- Fixed both branches server-side. When a module is disabled, the already-uploaded temporary file is removed before returning HTTP 403; accepted uploads retain the existing authorization and storage flow.
- Added regression assertions requiring both module checks to exist in the media route, clean up rejected files, and run before private-message/wall-post mutation.
- Server fix: [a297c05](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/a297c0526f7ab5a41b0e7f3e217ac8ec11a01e64).
- Regression tests: [d29626a](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/d29626aee164956001f54ca6aa86d6c33f6da437).
- Current branch head at checkpoint: `d29626aee164956001f54ca6aa86d6c33f6da437`. Exact-head GitHub Actions results were not yet available when this note was written; do not claim the new tests or Docker build have passed until the runs report success.
- The ZIP archive predates these source/test changes and must be rebuilt and pass CRC, safe-path, tracked-file parity, extracted `npm ci`, `npm test`, and Docker checks before anyone uses it. Do not upload or synchronize the old ZIP.
- PR #3 remains open, draft, and unmerged. No main update, deployment, restart, or live-data modification has occurred.

## Superseding verified continuation state — 2026-11-24

- This section supersedes the earlier note above that the media-module fix had not yet passed CI and that the archive was still stale.
- The private/wall media-upload module checks are committed in server commit [a297c05](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/a297c0526f7ab5a41b0e7f3e217ac8ec11a01e64), with regression assertions in [d29626a](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/d29626aee164956001f54ca6aa86d6c33f6da437).
- Exact candidate cleanup head `d135c04dfaa50957e004ff7366af78826a9cc264` passed [validation run 45423336513](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45423336513): locked dependency install, dependency-tree check, JavaScript syntax, full regression suite, and production Docker build.
- The same exact head passed [archive audit run 45423336536](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45423336536): safe extraction, CRC/layout checks, exact candidate/archive parity, HTML/JavaScript checks, locked install, regression suite, and Docker build.
- The one-time archive builder successfully generated a 394-file archive of 16,343,579 bytes in [run 45423165350](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45423165350). Its temporary workflow was then removed in cleanup commit `d135c04`; the archive intentionally excludes that temporary workflow.
- This checkpoint refresh is itself part of the release documentation; rebuild the ZIP once more after this note is committed, then require a fresh exact-head archive audit before treating the ZIP as current.
- PR #3 remains open, draft, and unmerged. No main update, Deplexo deployment/restart, ZIP sync to the live site, or live-data modification has occurred.
- Production remains blocked on an independent backup of the Deplexo persistent volume, successful restore to isolated staging, end-to-end smoke tests, and runtime/load evidence.

## Admin-route audit and refreshed release archive — 2026-11-24 (supersedes prior status)

- Central audited authorization now covers direct rank assignment, member likes/points edits, member-IP inspection, room moderation, member-card actions, reset-likes, gift send/delete/catalogue upload/delete, VIP grant/revoke, member transfers, rank-permission editing, rank-art management, chat banners, member decoration, bot settings, account-permission overrides, site settings, login history, health diagnostics, database/full backup, restore preview/confirm, subscriptions, ads, control-center, chat-filter, chat-tools, and admin data reads.
- `permissionForAdminPath` supports alternative permission sets for routes that intentionally allow more than one capability. Chat-tools retains per-section permission checks, so a caller cannot edit shortcuts merely by holding smiley permission or vice versa.
- `requireAdmin` now detects when a route already wrote its own audit entry and avoids adding a duplicate generic record. This preserves route-specific audit trails for subscriptions, ads, control-center, site settings, and restore confirmation.
- Regression checks were updated for the audited route guards and permission unions. Source candidate `08a84fd6dcbafd3a669c3c68effaba7db83b2c5a` passed [Validate Rimaz Project run 45428564301](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45428564301): `npm ci`, `npm ls --depth=0`, JavaScript syntax checks, full `npm test`, and production Docker build.
- In the same successful run, `refresh-release-archive` rebuilt the ZIP from **394 tracked files** (16,348,302 bytes), checked CRC/path safety/full tracked-file parity, extracted it, then ran locked install, dependency-tree check, JS syntax checks, the full regression suite, root/public HTML parity, and a Docker build against the extracted archive. Every step passed.
- The refreshed archive was committed as `2fdf9e5e16479988be7a232ebc0b8628f9c1f867` (`build: refresh audited archive after validated changes`). The archive is no longer stale relative to the source candidate used by that run.
- The refresh job is restricted to successful pushes or PR #3 from `fix/bound-private-media-ticket-cache`; it has job-scoped `contents: write`, deterministic ZIP creation, CRC/path/parity checks, full extracted-archive validation, and a no-change guard to prevent bot-commit loops. The separate `Audit Rootfix Archive` workflow no longer runs prematurely on PR source changes; it remains available for manual/ZIP-only auditing.
- PR #3 remains open/draft/unmerged. `main` is unchanged. No production deployment, Deplexo restart, ZIP sync to the live site, or live-data modification occurred.
- Production remains blocked on an independent backup of the Deplexo persistent volume, a verified restore to isolated staging, end-to-end smoke tests, and runtime/load evidence. Member-card color-picker and gift-grid frontend work remain separate and are not completed by these backend changes.
- This checkpoint edit is tracked project documentation; the post-validation refresh job will include it in the next ZIP and re-run the extracted-archive checks.


## Latest verified continuation — 2026-11-24 18:20 UTC

- Current branch head: `c1a9ec12c0c042b36a918daa762ebe0078306856`. The latest commit is the automated archive-only refresh; it changes only `rimaz-final-deep-audit-46.93.72.zip`.
- Source, workflow, regression-test, and documentation changes immediately before the archive refresh are at `7d42fc653421d8f82a4412fec5998aa6fad12e7c` and its ancestors:
  - `server.js`: startup cleanup now durably saves stale private-notification removal even when no transient private-message history or media files remain.
  - `verify.js`: isolated runtime regression test proves notification-only cleanup is persisted.
  - `.github/workflows/validate-project.yml`: candidate PR path filter excludes the generated ZIP; the push workflow still rebuilds and tests the archive after source validation.
  - `verify.js`: protects that workflow configuration with a regression assertion.
  - Both this checkpoint and the final release-gate document now record the exact validation evidence and outstanding production gates.
- Exact source/PR validation: [run #686 / 45458293892](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45458293892) passed on `7d42fc6`: locked dependency install, dependency-tree verification, syntax checks, full regression suite (**602 pass markers, zero failures**), and production Docker build.
- Exact push/archive validation: [run #685 / 45458283035](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45458283035) passed on the same source commit. Source and extracted-archive suites each reported **602 pass markers, zero failures**; both production Docker builds succeeded. The archive job rebuilt and verified **394 tracked files**, **16,351,284 bytes**, CRC/path safety, and exact tracked-file parity before testing the extracted project.
- Refreshed archive commit: `c1a9ec12c0c042b36a918daa762ebe0078306856`; archive SHA-1: `91e054152c8dfb4e2b1e03496444033876f03114`.
- GitHub PR workflow status: [run #687 / 45458439519](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45458439519) for the bot-authored archive commit is `action_required` and returned **no jobs**. This is an approval gate, not a failed test. The candidate path-filter change does not suppress updates to this integrated PR because the PR's overall diff still contains source, workflow, and documentation paths. No approval action is available through the connected GitHub operations; do not claim this gate is cleared.
- PR #3 remains open, draft, and unmerged. `main` remains at `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No merge, production deployment/restart, ZIP sync to Deplexo, or live-data modification occurred.
- Production release gates remain open: independent live-volume backup, verified restore into isolated staging, end-to-end smoke tests, runtime/load evidence, and explicit promotion approval. CI success alone is not production approval.


## Superseding CI and Deplexo safety checkpoint — 2026-11-24 19:07 UTC

- Source/workflow/test head `c935b18715de9c756e73f02610554653dfe45f91` passed [push validation and archive refresh run #694](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45466637249).
- Source validation: locked `npm ci`, dependency-tree check, JS syntax, full regression suite (**602 pass markers, zero failures**), and production Docker build all succeeded.
- Archive validation: rebuilt and verified **394 tracked files**, **16,351,608 bytes**, CRC/path/symlink/duplicate checks and exact tracked-file parity; extracted archive completed locked install, dependency-tree check, syntax, **602 regression pass markers, zero failures**, HTML parity, and production Docker build. npm audit reported **0 vulnerabilities**.
- Archive-only refresh commit: `262876e141e6a4d34049951e10fee01a534b921f`; changed only `rimaz-final-deep-audit-46.93.72.zip`. Archive Git blob SHA: `80b5b299d9108f48ed2f10b366315f40360d6e70`.
- CI workflow now runs push validation on every candidate branch commit. PR validation is limited to `opened`, `reopened`, and `ready_for_review`; the push path performs the full checks on every source/documentation update. This prevents bot-authored ZIP-only commits from generating approval-gated PR `synchronize` runs. The old `action_required` run #691 belongs to a prior head; no new PR sync run was created after archive commit #262876.
- An intermediate run #693 failed only because the new regression assertion encoded newline escapes incorrectly. That assertion was corrected; run #694 passed on the corrected source/test/workflow head. Do not treat #693 as the current result.
- Latest branch head at this checkpoint: `262876e141e6a4d34049951e10fee01a534b921f`. PR #3 remains open/draft/unmerged, targeting `safety/validate-and-backup-before-sync`. `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No merge, Deplexo deployment/restart, ZIP sync to production, or live-data modification occurred.

### Deplexo storage and backup boundary (verified against current platform documentation)

- Deplexo's container image filesystem is read-only at runtime. `/tmp` is temporary (100 MB) and does not survive container replacement. The named persistent volume is mounted at `/data` by default and survives restarts/replacements on the same worker.
- The volume belongs to its worker and is not shared across independent apps/workers. Deleting an application removes its data volume. Backups must be stored outside the application/volume and restoration must be tested.
- The Rimaz server selects `DATA_DIR=/data/rimaz` when `/data` exists (unless explicitly overridden), with `data.json`, `uploads/`, and `private-media/` beneath it. Verify the actual production environment and mount in the dashboard before any operation.
- Server shutdown handles `SIGTERM` and `SIGINT`, flushes queued message writes, attempts a final database save, closes Socket.IO, and exits nonzero if the final save fails. This is source-level evidence, not a live shutdown test.
- A code rollback does not restore a database or recover deleted files. A Git rollback branch is not a volume backup.
- Required before promotion: obtain an independent consistent backup of the live `/data/rimaz` state to an external destination; restore a copy into an isolated staging app/volume; verify database integrity and file counts/hashes; run login, reconnect, public/private chat, rooms, voice/video, moderation/member-card, upload, backup/restore, and multi-device smoke tests; observe runtime restarts, OOM, memory, and resource behavior.
- The connected GitHub access does not provide Deplexo dashboard or live-volume access. No live backup or staging restore has been claimed or attempted. Keep production promotion blocked until those hosting-side checks and explicit approval are complete.

Platform references: [Deplexo storage and filesystem](https://docs.deplexo.com/operations/storage/), [deployment lifecycle and rollback limits](https://docs.deplexo.com/operations/deployments/), [Deplexo FAQ](https://docs.deplexo.com/getting-started/faq/).


## PR history and final integration strategy — 2026-11-24

- GitHub currently reports PR #3 as mergeable/clean, with **462 incremental commits** and **36 changed files** relative to `main`. The commits are the granular repair/test/checkpoint history accumulated during the audit; they are not 462 distinct files or 462 independent releases.
- The designated safety integration branch is itself 12 commits ahead of `main`. PR #3 targets that safety branch and is still draft/open/unmerged.
- To keep the production history professional and readable, do not merge these hundreds of incremental commits with a regular merge commit. After all live backup, isolated restore, staging, runtime, and approval gates pass, use a reviewed squash-based promotion plan so the final application state lands as one coherent release commit. Preserve the detailed commit/CI audit trail in GitHub and the release notes.
- Do not force-push or rewrite the active PR branch during this audit. Before any promotion, re-fetch `main`, the safety branch, and PR head; compare all changed paths and workflow files again, then require green validation on the exact release candidate.


## Superseding current-head checkpoint — 2026-11-24 19:11 UTC

- Validated source/documentation/workflow candidate: `bae93c93a9647674fef4e9d4b382040b02c5a937`.
- [GitHub Actions run #698](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45467287747) completed successfully. The source job passed locked install, dependency-tree verification, JavaScript syntax, **602 regression checks with zero failures**, and the production Docker build. The post-validation archive job passed CRC/safe-path/exact tracked-file parity, rebuilt **394 files (16,355,090 bytes)**, then passed locked install, dependency tree, syntax, **602 tests with zero failures**, HTML parity, and extracted-archive Docker build. npm audit reported **0 vulnerabilities**.
- The archive-only commit is `43166e593d7bca0c559fb128d7e5d243acbe3e68`; it changes only `rimaz-final-deep-audit-46.93.72.zip`. Archive blob SHA: `e9473d35ea1b5ab0a49fbfca7a820b8cc09811ae`.
- PR #3 is still open/draft/unmerged, targets `safety/validate-and-backup-before-sync`, and currently has **453 commits / 36 changed files** relative to that base. Its description was refreshed to remove obsolete historical test states and show the current validation evidence and release blockers. Final integration should use the documented squash-based plan after release gates pass; no branch history rewrite has been performed.
- `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No merge, production deployment/restart, ZIP sync, or live-data change occurred.
- Additional hosting-specific security check before release: the source currently prefers `cf-connecting-ip` and `x-real-ip` for IP-based bans/login history. Confirm that Deplexo's edge overwrites/sanitizes these headers before trusting them; if client-supplied values can pass through, an attacker may spoof the IP used by bans. No Deplexo header guarantee was found in the available platform docs, so this remains an explicit staging/provider verification item, not a confirmed exploit.
- Live Deplexo volume backup, restore to isolated staging, runtime/load measurements, and production approval remain outstanding. The connected GitHub access does not grant access to the Deplexo dashboard or persistent volume.


## Latest exact-head verification — 2026-11-24 19:12 UTC

- Source/workflow/documentation candidate `f2af4a5cef8e4522bd307fc70c6ae5e98d405347` passed [GitHub Actions run #700](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45467584156): locked install, dependency-tree verification, syntax checks, **602 regression passes / 0 failures**, and production Docker build.
- The same run's post-validation archive job rebuilt and verified **394 tracked files / 16,356,369 bytes**, CRC/path/parity checks, then tested the extracted archive with locked install, dependency tree, syntax, **602 regression passes / 0 failures**, HTML parity, and Docker. npm audit reported **0 vulnerabilities**.
- Archive-only commit: `d3cb13ebb7fb959a2b3a98b1d3d20338dd66e8eb`; it changes only `rimaz-final-deep-audit-46.93.72.zip`. Archive blob SHA: `5add1af9cf3453ed971ac701d10a0086fc8b41ea`.
- PR #3 now reports **456 commits / 36 changed files** relative to its safety base; it remains draft/open/unmerged. The PR description has been refreshed with run #700, the current archive, the squash-promotion plan, and the outstanding hosting checks.
- `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No merge, deployment/restart, ZIP sync to production, or live-data change occurred.
- IP-ban trust remains a provider-specific staging check: verify Deplexo overwrites/sanitizes `cf-connecting-ip` and `x-real-ip` before relying on those headers. This is not yet a confirmed vulnerability.
- Production still requires independent backup of `/data/rimaz`, tested restore into isolated staging, complete smoke tests, runtime/load evidence, and explicit promotion approval.


## Latest continuation update — 2026-11-24

- A targeted permissions audit found that an early `/api/admin/data` branch always returned `panel_access`, shadowing the intended `ALL_PERMISSION_KEYS` mapping below it.
- Fixed the mapping in `server.js` so the endpoint's central guard accepts the explicitly enumerated permission set. The endpoint's response remains filtered by each individual permission; this does not bypass or widen action permissions.
- Added a regression assertion in `verify.js` to catch the unreachable/shadowed mapping.
- Source fix: `9ec6ebbf71a2467aee67115a37e33cc9950c93df`.
- Regression test: `a7bfce38ebdbebf10495c1a063d89a0fbf15b578`.
- [GitHub Actions run #704](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45469789989) succeeded on exact source SHA `a7bfce38ebdbebf10495c1a063d89a0fbf15b578`: 603 regression checks, zero failures, dependency-tree verification, syntax checks, and production Docker build.
- The extracted release archive also passed 603 checks with zero failures; the rebuilt archive contains 394 files and is 16,357,277 bytes. Archive Docker build succeeded and npm audit reported 0 vulnerabilities.
- CI generated archive-only commit `a49f10afcda33eac55ea974c60ee57e866f4e28c`; it changes only the release ZIP.
- Current safety boundary remains unchanged: PR #3 is draft/open/unmerged; `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`; no production deploy/restart, ZIP sync, or live-data modification has occurred.

The external backup, isolated restore/staging smoke tests, Deplexo runtime evidence, and provider proxy-header trust confirmation remain mandatory before promotion.
 
## Final release-candidate verification — 2026-11-24 19:42 UTC

- Current PR #3 head after the validated archive refresh: `50c61f0d55513e3840ea71fdff14e609042fa2ed`.
- Source/documentation candidate validated by [GitHub Actions run #708](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45472720285): `7b47b00f662867b89e17ef1597337eb697166eba`.
- Both jobs in run #708 completed successfully. Source validation passed locked dependency installation, dependency-tree verification, JavaScript syntax, **603 regression checks with zero failures**, and production Docker build. The extracted archive independently passed the same 603 checks, HTML parity, Docker build, and reported **0 production dependency vulnerabilities**.
- The final archive-only commit is `50c61f0d55513e3840ea71fdff14e609042fa2ed`; it changes only `rimaz-final-deep-audit-46.93.72.zip`. The archive is **16,359,829 bytes** and contains 394 application/repository files, excluding the ZIP itself.
- Final tree audit: 405 tree entries / 395 blobs, one release ZIP, no nested `rimaz-chat-iraqi-main/` project directory, no extra ZIP or backup copies, and no obvious old/copy/temp artifacts at the root.
- Preservation verification before removing the nested directory: its `data.json` was byte-identical to the tracked root placeholder; its Google verification file was byte-identical to the root and `public/` copies. The root placeholder and both required verification copies remain present. `index.html` and `public/index.html` remain unchanged and synchronized.
- The PR diff does not modify either browser entry file. The reviewed source work is in server-side reliability, persistence/rollback, authorization, tests, build and repository operations; the current UI markup/design was preserved.
- PR #3 remains **open / draft / unmerged**, targeting `safety/validate-and-backup-before-sync`. That safety branch is 12 commits ahead of `main`; `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. PR #2 remains redundant and is not closed or merged without explicit approval.
- The guarded ZIP synchronization workflow was reviewed: it only runs manually from `main` with explicit confirmation, requires exact archive/source parity, validates paths and dependencies, creates a Git rollback branch, copies only application/build files and `public/`, and explicitly preserves the Google verification file. Its `rsync --delete` is confined to `public/` after exact parity validation; it does not copy the placeholder database or touch the external persistent volume.
- **Still blocking production handoff:** no independent backup of the live Deplexo volume, no isolated restore of database plus `uploads/` and `private-media/`, no staging smoke/load test, and no provider confirmation about trusted IP headers. GitHub access does not expose the Deplexo dashboard or live volume. No merge, production deployment/restart, ZIP sync, or live-data modification has occurred.

The repository candidate and archive are CI-validated. The project is **not yet production-deployed or operationally signed off**; keep the final promotion gate closed until the hosting-side evidence above exists and the user explicitly approves promotion.

## Continuation checkpoint — resource and ticket audit refresh (2026-11-24 20:22 UTC)

- Current source/documentation candidate before the archive-only commit: `1c513d9d32988d46a473ba42cd2ad1e4c7edb5ef`.
- Added five isolated regression checks in `verify.js` for private-media playback tickets: same account/file token reuse and 15-minute expiry refresh; 32-ticket per-account cap; 4,096-ticket process-wide cap; expiry pruning; and stream-route ticket declaration/filename/account authorization ordering.
- [Push validation and archive refresh run #720](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45479988425) passed on the source/documentation candidate. Source and extracted archive each completed **608 checks, zero failures**; both production Docker builds succeeded; npm audit reported **0 vulnerabilities**.
- Refreshed archive: **394 tracked files**, **16,365,235 bytes**; CRC/path/symlink/duplicate and exact tracked-file parity checks passed. Archive-only commit: `382617309f9bd45ccd6131f9597ed0553abf5805`. This commit changes only `rimaz-final-deep-audit-46.93.72.zip`.
- Historical Deplexo log clarification is recorded in `docs/audits/RUNTIME-RESOURCE-AUDIT-2026-11-24.md`: `Rimaz server listening on 3000` means the listening port, not a 300 MB or connection cap. Repeated lines indicate repeated process starts, but do not identify why the process restarted.
- Historical `ticket is not defined` errors occurred four times at the old deployed `/app/server.js:657` through `requireAuth` line 646. Current candidate declares the stream-route ticket before use and now has five regression checks. This does not prove the old deployed artifact was fixed; verify the exact running commit and contemporaneous logs after staging deployment.
- **128 MB memory violation remains unresolved at production level.** Historical Deplexo panel data showed 37.4/128 MB at one observation and a separate memory-limit violation. Four one-user RSS snapshots ranged 72.14–75.97 MB without monotonic growth, which is insufficient to rule out peak/load OOM. Current health endpoint exposes RSS, heap, external memory, array buffers, DB size, upload counts/bytes, uptime and online users. Restore staging reduces retained upload/preview memory but JSON parsing still creates a transient string/object graph. Do not claim the 128 MB issue fixed until staged representative-load samples, provider OOM/exit events and restart evidence are collected.
- Production gates remain unchanged: independent external backup of live `/data/rimaz`, isolated full restore, end-to-end staging tests, representative runtime/load and restart evidence, proxy-header trust verification, exact-head CI, and explicit approval. No merge, main update, Deplexo deploy/restart, ZIP sync to production, or live-data change has occurred.


## Latest root-cause persistence update — 2026-11-24 20:35 UTC

- Inspected the actual save() implementation and confirmed a deterministic full-database allocation on every durable write: a shallow snapshot followed by JSON.stringify(snapshot) created a second complete JSON string while the live database remained resident.
- Replaced that serialization step with lib/json-writer.js, a synchronous bounded-buffer JSON writer. It streams escaped string segments and JSON structure to the existing exclusive temporary file, preserving event-loop snapshot semantics, compact JSON, private-message exclusion, fsync, atomic rename, and failure cleanup.
- Added regression coverage comparing exact bytes with native JSON.stringify across Arabic/Unicode, escaped text, large chunk-boundary strings, sparse arrays, undefined/non-finite values, Date/Buffer toJSON, shared references, and circular input. The real save() function is also executed against an isolated temporary directory.
- Source/test candidate 96f8220df1ad5b1603bd36416fc75c84f3735507 passed [Actions run #45482153155](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45482153155): source and extracted archive each passed **610 checks, zero failures**; both production Docker builds passed; npm audit found **0 vulnerabilities**.
- Archive refresh verified **395 files / 16,368,568 bytes**, CRC and exact tracked-file parity. Archive-only commit: b14714bfd16d47a4a12f37a1599a8ea11c9fc565.
- This removes one known transient allocation from routine database saves; it does **not** prove the 128 MB provider issue fixed. Full backup still materializes a JSON string and Buffer; database-only backup still materializes a full response string; restore preview/confirm still hold file text plus parsed data and confirmation's recovery Buffer. These paths are explicitly recorded for the next root-cause phase.
- Production boundary is unchanged: PR #3 stays draft/open/unmerged; main and Deplexo remain untouched. Independent live-volume backup, isolated full restore, staging smoke/load testing, provider restart/OOM evidence, trusted proxy-header confirmation, and explicit promotion approval remain mandatory.


## Restore recovery peak-memory correction — 2026-11-24 20:42 UTC

- Restore confirmation previously read the complete live database into a Buffer and then wrote that Buffer into the recovery file. Replaced this with an exclusive disk-to-disk copy using copyFileSync, explicitly applied mode 0600, and fsynced the recovery file and directory before allowing restore to continue.
- The existing rollback/recoveryReady gate remains intact; a failed copy/permission/sync removes the incomplete recovery file and aborts the restore.
- Regression checks now require the exclusive disk copy, restrictive permissions, and fsync, and reject the old full-file recoveryData Buffer.
- Source/test candidate a2a3c11274770af65de0810414a9e6a233474221 passed [Actions run #45483322714](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45483322714): source and extracted archive each passed **610 checks / zero failures**, both production Docker builds passed, and npm audit reported **0 vulnerabilities**.
- Archive: **395 files / 16,370,888 bytes**, CRC and exact tracked-file parity passed. Archive-only commit: 9a27af2255adc56a61c580a5406ec49e4c18ae5f.
- This removes one database-sized transient Buffer from restore confirmation; it does not remove the retained old database object, the parsed replacement object, or restore JSON text. Full backup/database backup allocation paths remain open. The historical 128 MB issue is not declared fixed.
- PR #3 remains draft/open/unmerged; main and Deplexo remain untouched. All hosting-side release blockers remain in force.
