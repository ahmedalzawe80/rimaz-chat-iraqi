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
