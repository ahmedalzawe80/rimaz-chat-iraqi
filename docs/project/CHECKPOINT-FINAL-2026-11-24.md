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

- Centralized audited authorization was extended to direct rank assignment, member likes/points edits (field-specific permissions), member-IP inspection, reset-likes, gift sending, VIP grants, member transfers, rank-permission editing, welcome-message management, subscriptions, ad campaigns, and control-center routes.
- Route changes: `7a7a8d9` (rank assignment), `bcb280f` (member stats/IP), `27758dd` (admin module route families). Regression coverage was added/updated in `81c97a7`, `18a122e`, `7bcff87`, and `41e33e3`.
- Some routes retain their existing local authorization checks behind the central guard as defense-in-depth; this work does not claim every remaining admin endpoint has been migrated. Rank-art, chat banners, member decoration, bots, account-permission overrides, backup/restore, and other mixed-permission routes still require separate review before conversion.
- Exact branch candidate `2e5f8e422ea2bb178ea1736a9f8cf467138088d5` passed [Validate Rimaz Project run 45426508784](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45426508784): locked install, dependency tree, JavaScript syntax, full regression suite, and production Docker build.
- The same candidate passed [Audit Rootfix Archive run 45426508772](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45426508772): CRC/layout/safe extraction, exact application-source parity, extracted syntax/HTML checks, locked install, full regression suite, and Docker build. The archive blob changed from the stale earlier archive and is now aligned with the audited candidate.
- The temporary one-time archive-builder workflow was removed after its rebuild completed. A replacement `refresh-release-archive` job is now part of `.github/workflows/validate-project.yml`: it is limited to successful pushes to this working branch, has job-scoped `contents: write`, rebuilds from all tracked files, verifies CRC/path safety/parity, and commits only the refreshed ZIP. The PR-triggered run correctly skipped this push-only job; its next push-triggered execution still needs observation.
- The checkpoint update itself changes tracked documentation; rebuild the archive after this note and require another exact-head archive audit before considering the archive fully current.
- PR #3 remains open/draft/unmerged. No main update, production deployment, Deplexo restart, ZIP sync to the live site, or live-data modification occurred.
- Production remains blocked on an independent backup of the Deplexo persistent volume, a verified restore to isolated staging, end-to-end smoke tests, and runtime/load evidence. Member-card color-picker and gift-grid frontend work remain separate and are not completed by these backend changes.
