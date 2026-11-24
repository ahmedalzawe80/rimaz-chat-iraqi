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

## Dependency reproducibility

- `package.json` requires Node.js `>=24 <25`; `.nvmrc` pins major version 24.
- A genuine npm lockfile v3 was generated on Node.js 24 and committed in [`ed4ef756`](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/ed4ef756a96351f6f368dba7295420cc0f6ebbd1).
- The lockfile root package identity and dependency declarations match `package.json`; it records 96 package entries.
- The production Dockerfile now uses `npm ci --omit=dev`.
- The bootstrap workflow performed a clean `npm ci`, the regression suite, and a Docker build using the lockfile before committing the lockfile and Dockerfile change. The temporary bootstrap workflow was then removed.
- The permanent validation workflow now requires `npm ci`, runs `npm ls --depth=0`, JavaScript syntax checks, `npm test`, and the production Docker build. It no longer has a fallback to floating `npm install`.
- README, contributor guidance, changelog, and repository structure documentation now describe the lockfile-based workflow.

## CI evidence and current validation boundary

- GitHub Actions run [45407944962](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45407944962) completed successfully on the earlier candidate checkpoint `23568ae45ff37a2e349939f1374a6eac885c2e79`.
- Its regression output contained 562 pass markers and zero failure markers; dependency installation and the production Docker build completed.
- The lockfile/Dockerfile commit `ed4ef756a96351f6f368dba7295420cc0f6ebbd1` was created by the bootstrap workflow only after its `npm ci`, regression, and locked Docker build steps succeeded.
- The permanent validation workflow has since been tightened to require `npm ci` and `npm ls`. A fresh completed PR check on the final documentation-updated head is still required before merge.
- Earlier validation on `c30b7b92093dbbf4162cb6f30573355ad20b0f1f`, run `45379916442`, reported 556 pass markers and zero failures. That count belongs only to that SHA.

CI and container builds do not prove live Deplexo runtime health, load behavior, or backup restorability.

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

Repository organization and deterministic dependency installation are now implemented in the candidate. Production publication remains blocked until fresh final-head CI, independent backup/restore, staging smoke tests, runtime evidence, and the required promotion checks are complete.
