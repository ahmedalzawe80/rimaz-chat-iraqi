# Rimaz — final continuation checkpoint (2026-11-24)

## Current repository state

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- PR #3: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/pull/3
- PR #3 remains open, draft, unmerged, and targets `safety/validate-and-backup-before-sync`.
- PR #3 contains 35 changed paths. All 11 changed paths in PR #2 are included in PR #3; PR #2 has no unique paths and must not be merged separately.
- Repository default branch is `main`. No merge, main update, Deplexo deployment/restart, ZIP sync, or live data modification has been performed.

## Deterministic dependency installation

- Added a genuine npm lockfile v3 generated on Node.js 24: `package-lock.json`.
- Lockfile root identity and dependency declarations match `package.json`; the lock contains 96 package entries.
- Lockfile commit: [`ed4ef756a96351f6f368dba7295420cc0f6ebbd1`](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/ed4ef756a96351f6f368dba7295420cc0f6ebbd1).
- Dockerfile now uses `npm ci --omit=dev`.
- The bootstrap job ran clean `npm ci`, regression tests, and a locked Docker build before committing the lockfile and Dockerfile change. The one-time bootstrap workflow was removed afterwards.
- The permanent validation workflow requires `npm ci`, `npm ls --depth=0`, syntax checks, `npm test`, and a Docker build. It has no fallback to `npm install`.
- README, CONTRIBUTING, CHANGELOG, and repository structure documentation now describe the locked install process.

## Exact-head CI evidence

Commit `086bbb09717a6d2c92009f4301528cf3f317f7b6` passed GitHub Actions run [45408438472](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45408438472).

All steps succeeded:
- Node.js 24 setup
- `npm ci`
- `npm ls --depth=0`
- JavaScript syntax checks
- `npm test`
- Production Docker image build using `npm ci --omit=dev`

The regression log contained 562 pass markers and zero failure markers. The production Docker dependency install added 95 packages and its npm audit output reported zero vulnerabilities.

Earlier full validation on SHA `c30b7b92093dbbf4162cb6f30573355ad20b0f1f`, run `45379916442`, reported 556 pass markers and zero failures; that result belongs only to that earlier SHA.

This exact-head evidence predates the current release-gate/checkpoint documentation refresh. Always check the latest branch head and its own workflow run before merge.

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

Always inspect the current PR head and exact-head CI first. Keep work on `fix/bound-private-media-ticket-cache`. Do not claim production readiness from CI alone. Continue with final PR validation and staging/backup coordination; publish only after the release gates are actually complete.
