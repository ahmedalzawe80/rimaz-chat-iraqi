# Final release gate — Rimaz

**Review date:** 2026-11-24  
**Release candidate:** `fix/bound-private-media-ticket-cache`  
**Production branch:** `main`

This record separates verified source/archive work from hosting operations that require staging access and explicit owner approval.

## Consolidated repository decision

- PR #3 is the sole integrated review candidate.
- All 11 changed paths in PR #2 are represented in PR #3; PR #2 has no unique paths and must not be merged separately.
- The candidate keeps runtime assets and workflow-referenced files in their required locations. Do not delete or rename media files merely because their bytes appear duplicated; generated IDs and stored references may depend on filenames.
- The incomplete nested project copy was removed after verifying it contained only a placeholder data file and duplicate Google verification file.
- PR #3 remains open, draft, unmerged, and targets `safety/validate-and-backup-before-sync`. It is not yet a production release.

## Dependency reproducibility

- `package.json` requires Node.js `>=24 <25`; `.nvmrc` pins major version 24.
- A genuine npm lockfile v3 was generated on Node.js 24 and committed in [`ed4ef756`](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/ed4ef756a96351f6f368dba7295420cc0f6ebbd1).
- The lockfile root package identity and dependency declarations match `package.json`; it records 96 package entries.
- The production Dockerfile uses `npm ci --omit=dev`.
- The permanent validation workflow requires `npm ci`, `npm ls --depth=0`, JavaScript syntax checks, `npm test`, and the production Docker build. It has no fallback to floating `npm install`.
- Regression checks assert lockfile identity/dependency consistency, Docker's locked production install, and the permanent CI install contract.

## Audited source archive and synchronization safety

- The old ZIP was found to contain a `package.json` different from the reviewed candidate. The audit failed closed; no ZIP synchronization or production operation was run.
- Rebuilt `rimaz-final-deep-audit-46.93.72.zip` deterministically from the reviewed tracked candidate. It contains 394 tracked files and is 16,336,813 bytes.
- The archive rebuild job tested both the candidate and extracted archive as standalone projects. Each completed `npm ci`, `npm ls --depth=0`, syntax checks, and `npm test` with 567 pass markers and zero failures, followed by a successful Docker build.
- Both Docker builds installed the locked production dependency tree (95 packages); npm audit output reported zero vulnerabilities.
- The archive audit rejects unsafe paths, symlinks, duplicate file paths, excessive archive size/entries, and suspicious compression ratios. It requires exact parity for package manifest, lockfile, Dockerfile, server, browser entry, regression file, and the complete `public/` tree.
- The manual source-sync workflow refuses an archive that differs from current `main`; it validates locked install, dependency tree, regression suite, and Docker build before and after sync. It remains manual-only, requires explicit confirmation on `main`, and is not a Deplexo deployment command.
- The one-time archive builder workflow was removed after the ZIP was regenerated and tested.

## Exact-head CI evidence

Final post-cleanup candidate commit `5ec794813d0a0fc1b8eb2376182e1749ec933fa2` passed both workflows:
- [Validation run 45409969779](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45409969779): `npm ci`, `npm ls --depth=0`, syntax checks, 567 regression pass markers, zero failures, and production Docker build.
- [Archive audit run 45409969751](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45409969751): safe extraction, exact source/lockfile/Dockerfile/public parity, 567 regression pass markers, zero failures, and Docker build.
- The validation Docker build installed 95 locked production packages and reported zero vulnerabilities.
- Earlier validation on `c30b7b92093dbbf4162cb6f30573355ad20b0f1f`, run `45379916442`, reported 556 pass markers and zero failures. That count belongs only to that SHA.

CI and container builds do not prove live Deplexo runtime health, load behavior, or backup restorability. Any subsequent source or workflow change requires a fresh check on its exact head.

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

Repository organization, deterministic dependency installation, archive parity, and source/build validation are implemented in the candidate. Production publication remains blocked until independent backup/restore, staging smoke tests, runtime evidence, final-head CI, and promotion checks are complete.
