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

- The old ZIP was found to contain a different `package.json` from the reviewed candidate. The new audit failed closed; no source sync was run.
- Rebuilt `rimaz-final-deep-audit-46.93.72.zip` deterministically from the candidate's tracked files.
- Archive includes 394 tracked files and is 16,336,813 bytes. It contains the current package manifest, lockfile, Dockerfile, application files, docs, workflows, and public assets; the archive itself and the one-time builder workflow are excluded.
- The archive rebuild run [45409544443](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45409544443) passed both candidate and extracted-archive validation: each produced 567 pass markers and zero failures; both Docker builds succeeded.
- Both Docker builds installed 95 locked production packages and reported zero vulnerabilities in npm audit output.
- Archive audit checks safe paths, symlinks, duplicate files, entry/size/compression limits, and exact parity for package manifest, lockfile, Dockerfile, server, index, verify.js, and all public assets.
- Manual ZIP sync refuses stale archives, requires explicit confirmation on main, and runs clean locked installs, regression tests, and Docker builds before and after sync. It is not a Deplexo deployment command.

## CI evidence

- Exact-head run [45408438472](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45408438472) on SHA `086bbb09717a6d2c92009f4301528cf3f317f7b6` passed npm ci, npm ls, syntax checks, 562 regression pass markers, and production Docker build.
- Archive rebuild run [45409544443](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45409544443) passed candidate and archive tests, each with 567 pass markers and zero failures.
- Earlier run `45379916442` on SHA `c30b7b92093dbbf4162cb6f30573355ad20b0f1f` reported 556 pass markers and zero failures; that result belongs only to that earlier SHA.
- Fresh permanent CI and archive-audit checks on the final post-cleanup head are still required before merge.

## Outstanding production release gates

1. Independent backup of the live Deplexo persistent volume, including database, uploads, and private media.
2. Restore that backup into isolated staging and verify integrity.
3. End-to-end smoke tests: login, reconnect grace, public/private chat, room lifecycle, voice/video, moderation/member-card actions, uploads, backup/restore, and multi-device sessions.
4. Runtime evidence for exit codes, restarts, OOM, heap/RSS, and representative load.
5. Fresh green CI on the final exact PR head and final review.
6. Confirm persistent-volume mount and production environment settings before promotion.

## Safety boundary

The owner has requested publication after the work is complete, but production promotion must wait for the release gates above. Do not merge PR #3, change `main`, run ZIP synchronization, deploy/restart Deplexo, or modify live database/uploads/private media/persistent volume before backup, staging, and approval gates are satisfied.

## Resume instructions

Always inspect the current PR head and exact-head CI first. Keep work on `fix/bound-private-media-ticket-cache`. Do not claim production readiness from CI alone. Continue with final PR validation and staging/backup coordination; publish only after the release gates are actually complete.
