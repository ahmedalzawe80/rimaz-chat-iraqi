# Final release gate — Rimaz

**Review date:** 2026-11-24  
**Release candidate:** `fix/bound-private-media-ticket-cache`  
**Production branch:** `main`

This record separates source-level and CI evidence from hosting operations that require staging access and explicit owner approval.

## Consolidated repository decision

- PR #3 is the sole integrated review candidate.
- PR #3 contains 35 changed paths. All 11 paths in PR #2 are represented in PR #3; PR #2 has no unique paths and must not be merged separately.
- The candidate retains runtime assets and workflow-referenced files in their required locations. Do not delete or rename media files merely because their bytes appear duplicated; generated IDs and stored references may depend on filenames.
- The nested incomplete project copy was removed from the candidate after verifying it contained only a placeholder data file and duplicate Google verification file.
- PR #3 remains open, draft, unmerged, and targets `safety/validate-and-backup-before-sync`. It is not yet a production release.

## Dependency reproducibility — completed in candidate

- `package.json` requires Node.js `>=24 <25`; `.nvmrc` pins major version 24.
- A genuine npm lockfile v3 was generated on Node.js 24 and committed in [`ed4ef756`](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/ed4ef756a96351f6f368dba7295420cc0f6ebbd1).
- The lockfile root package identity and dependency declarations match `package.json`; it records 96 package entries.
- The production Dockerfile uses `npm ci --omit=dev`.
- The one-time bootstrap workflow performed a clean `npm ci`, the regression suite, and a Docker build using the lockfile before committing the lockfile and Dockerfile change. That temporary workflow was then removed.
- The permanent validation workflow requires `npm ci`, `npm ls --depth=0`, JavaScript syntax checks, `npm test`, and the production Docker build. It has no fallback to floating `npm install`.
- README, contributor guidance, changelog, and repository structure documentation describe the deterministic install workflow.

## Exact-head CI evidence

- Commit `086bbb09717a6d2c92009f4301528cf3f317f7b6` passed GitHub Actions run [45408438472](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45408438472).
- Every step completed successfully: Node.js 24 setup, `npm ci`, `npm ls --depth=0`, JavaScript syntax checks, `npm test`, and production Docker image build.
- Regression output contained 562 pass markers and zero failure markers.
- The Docker build used `npm ci --omit=dev`, installed 95 production packages, and reported zero vulnerabilities in that build's npm audit output.
- The latest full code run before this exact-head run, `45407944962`, also passed; its 562 pass markers belong to its own SHA only.
- Earlier validation on `c30b7b92093dbbf4162cb6f30573355ad20b0f1f`, run `45379916442`, reported 556 pass markers and zero failures. That count belongs only to that SHA.

CI and container builds do not prove live Deplexo runtime health, load behavior, or backup restorability. Any later source or workflow change requires a fresh check on its exact head.

## Required staging and hosting checks

1. Create an independent backup of the live Deplexo persistent volume, including database, uploads, and private media.
2. Restore that backup into an isolated staging environment and verify integrity.
3. Run smoke tests for login, reconnect grace, public/private chat, room join/move/leave, voice/video lifecycle, moderation and member-card actions, uploads, backup/restore, and multi-device sessions.
4. Observe process exit codes, restart events, OOM events, heap/RSS, and resource behavior under representative use.
5. Review the complete final PR diff and require fresh green checks on the exact final head.
6. Confirm the deployment's persistent-volume mount and environment settings before any restart or promotion.

These checks cannot be marked complete by GitHub CI alone.

## Promotion boundary

The owner has requested publication after the work is complete. That request does not remove the data-safety gates: do not merge PR #3, change `main`, run ZIP synchronization, deploy, or restart Deplexo until the backup is independently verified, staging checks pass, and the release is approved for promotion.

Do not modify the live database, uploads, private media, or persistent volume during repository cleanup. A Git rollback branch protects tracked source history only; it is not a backup of hosting data.

## Completion definition

Repository organization and deterministic dependency installation are implemented in the candidate. Production publication remains blocked until independent backup/restore, staging smoke tests, runtime evidence, final-head CI, and promotion checks are complete.
