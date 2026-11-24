# Final release gate — Rimaz

**Review date:** 2026-11-24  
**Release candidate:** `fix/bound-private-media-ticket-cache`  
**Production branch:** `main`

This document closes the repository-consolidation and source-level repair phase as a single release candidate. It deliberately distinguishes verified GitHub CI from work that requires a staging or hosting environment.

## Consolidated repository decision

- PR #3 is the single review candidate.
- PR #2 has no unique changed paths: all 11 paths in PR #2 are also present in PR #3. Do not merge PR #2 separately; doing so would duplicate overlapping changes.
- The PR #3 change set contains 32 paths. Review and validate it as one integrated change set, not as a sequence of independent partial releases.
- The nested incomplete project copy is removed from the candidate. Runtime assets and files referenced by deployment workflows remain in their documented locations.
- Do not delete or rename apparently duplicate media assets without verifying generated IDs and stored references.

## Source-level validation evidence

The latest recorded full validation for the reviewed code/test commit is:

- Commit: `c30b7b92093dbbf4162cb6f30573355ad20b0f1f`
- GitHub Actions run: [45379916442](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45379916442)
- Result: success
- Steps: Node.js selected from `.nvmrc`, JavaScript syntax checks, `npm test`, and production Docker image build.
- Regression suite: 556 pass markers and zero failure markers.

This is source-level and container-build evidence only. It is not a live Deplexo health check, a load test, or proof that the live persistent volume can be restored.

## Dependency reproducibility — still open

- `package.json` supports Node.js `>=24 <25`; `.nvmrc` pins major version 24.
- `package-lock.json` is absent from the reviewed branch.
- Do not fabricate a lockfile or switch to `npm ci` until a real lockfile has been generated from the declared dependencies, reviewed, and validated on Node.js 24.
- Until then, dependency resolution is not fully reproducible. Treat this as a release blocker for a production-grade reproducible build.

## Required staging and hosting checks

These checks cannot be truthfully marked complete by GitHub CI alone:

1. Generate and review a genuine dependency lockfile; verify clean install and production image build using the lockfile.
2. Back up the live Deplexo persistent volume independently of Git. Include the database, uploads, and private media.
3. Restore that backup into an isolated staging environment and verify integrity before considering promotion.
4. Run smoke tests for login, reconnect grace, public chat, private messages, room join/move/leave, voice/video lifecycle, moderation and member-card actions, uploads, backup/restore, and multi-device sessions.
5. Observe process exit codes, restart events, OOM events, heap/RSS, and resource behavior under representative use.
6. Review the final combined PR diff and require fresh green checks on the exact final head.

## Promotion boundary

Until every required check above is complete and the owner explicitly approves:

- Do not merge PR #3 or change `main`.
- Do not close or merge the redundant PR #2 automatically.
- Do not run ZIP synchronization, deploy, or restart Deplexo.
- Do not modify the live database, uploads, private media, or persistent volume.

A Git rollback branch protects tracked source history only; it is not a backup of hosting data.

## Completion definition

The source-level repair and repository-consolidation work is ready for a final staging/release gate review. The overall production release is **not complete** until dependency reproducibility, verified backup/restore, staging smoke tests, runtime evidence, and explicit promotion approval are all recorded.
