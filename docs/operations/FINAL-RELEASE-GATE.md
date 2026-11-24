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


## Latest archive audit follow-up — 2026-11-24

- Latest verified candidate commit: [70884a8b0a800f686e94e7137b03d9eee09fee11](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/commit/70884a8b0a800f686e94e7137b03d9eee09fee11).
- Archive validation now checks ZIP member CRC/integrity before extraction. Extracted archive validation also checks `npm ls --depth=0`, JavaScript syntax, root/public HTML parity, regression tests, and Docker build.
- [Validation run 45412772398](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45412772398) and [archive audit run 45412772526](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45412772526) both passed on this exact commit; each test run reported 567 pass markers and zero failures, and both Docker builds succeeded. Validation/audit logs reported zero npm vulnerabilities.
- This strengthens repository verification only; backup/restore, isolated staging, runtime/load checks, and promotion approval remain outstanding.


## Private-message limiter and current archive verification — 2026-11-24

- Private-message rate-limit accounting now occurs only after content and recipient eligibility checks and after any required conversation-state save succeeds. This prevents rejected or offline-recipient attempts from consuming the delivery quota.
- Regression coverage exercises repeated-message and rolling-window limits, reset behavior, empty content, and route ordering.
- The ZIP was rebuilt from current tracked application/docs files; the temporary builder workflow was removed. The current archive passed exact application/public parity and CRC validation.
- Latest candidate head: `7d3a76fb6452c2cdddecf90f3d62e6d1a52e2dba`.
- [Validation run 45413521661](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45413521661) and [archive audit run 45413521644](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45413521644) both passed on this exact head, including regression tests and Docker build.
- Production promotion remains blocked on independent backup/restore, staging smoke tests, runtime/load evidence, and final approval.


## Final continuation state — 2026-11-24

- Verified branch tip before this documentation refresh: `b3a44f5e29df7b9c8c63e717afcc275becdf997c`.
- [Validation run 45413964291](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45413964291) and [archive audit run 45413964564](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45413964564) passed on that exact tip. The validation included locked dependency installation, dependency-tree verification, syntax, regression suite, and Docker build. The archive audit included CRC, safe extraction, exact application/build/public parity, dependency tree, tests, and Docker build.
- Historical handoff documents are labeled as historical; current continuation belongs in the final checkpoint and this release gate.
- Archive rebuilt after the documentation corrections; temporary builder workflow removed after completion.
- Independent live-volume backup/restore and staging are still unavailable. Production promotion remains blocked; no merge, main update, ZIP sync, deploy, or restart has occurred.


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


## Backup/restore format and consistency details — 2026-11-24

- `GET /api/admin/backup/full` streams a gzip-compressed USTAR archive containing `database/rimaz-database.json`, `uploads/`, and `private-media/`. Its database snapshot deliberately empties active `sessions` and transient `privateMessages`; it is not a byte-for-byte copy of the live database file.
- `GET /api/admin/backup/database` exports the sanitized database JSON only. The database restore preview/confirm routes accept that JSON format; they do not unpack the full `.tar.gz` or restore uploads/private-media. A full staging restore must therefore restore the database and media trees separately, preserving paths and filesystem ownership under `DATA_DIR=/data/rimaz`.
- The current full-backup generator snapshots the in-memory database, then walks and streams media files. It does not establish one atomic lock across database changes and concurrent upload/delete operations. For a consistency-sensitive backup, use a quiet/maintenance window that prevents uploads and media deletion while exporting, or obtain an offline consistent volume snapshot through the hosting provider. Do not describe a downloaded archive alone as a verified backup.
- Before staging restore, calculate and store an external SHA-256 for the downloaded archive. After extraction, verify the database format/owner record, file counts and hashes for uploads/private-media, then run application smoke tests against the isolated copy. Keep the original production volume untouched.

## Current verified candidate — 2026-11-24 19:40 UTC

- Source/documentation update: `ce7802f4d07d863c0b264c74d97af29b206081eb` refreshed the transaction-safety audit so it no longer repeats superseded lockfile and dependency-install findings.
- [GitHub Actions run #707](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45472361362) completed successfully on that source/documentation candidate. Both `validate` and `refresh-release-archive` jobs succeeded.
- The source job passed locked dependency installation, dependency-tree verification, JavaScript syntax checks, **603 regression checks with zero failures**, and the production Docker build.
- The archive job rebuilt the tracked source archive, validated CRC/path/symlink/duplicate safety and tracked-file parity, extracted it into a clean directory, then passed locked installation, dependency-tree verification, syntax, **603 regression checks with zero failures**, HTML parity, Docker build, and npm audit (**0 vulnerabilities**).
- Archive-only commit: `81d99d39b78044eed4ea8557240b51acc53173e6`. It changes only `rimaz-final-deep-audit-46.93.72.zip`; archive size is **16,359,464 bytes**.
- Current PR #3 head is `81d99d39b78044eed4ea8557240b51acc53173e6`, still **Draft / Open / Unmerged**. `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.
- No deployment, restart, ZIP synchronization to production, or live-volume/data change has occurred. The operational release blockers below remain mandatory.
 
## Final candidate re-audit — 2026-11-24 19:42 UTC

- Exact source/documentation candidate `7b47b00f662867b89e17ef1597337eb697166eba` passed [Actions run #708](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45472720285). Both source validation and post-validation archive refresh/extraction jobs succeeded.
- Source: locked npm install, dependency-tree verification, JavaScript syntax, **603 regression checks / 0 failures**, production Docker build.
- Extracted archive: safe archive and tracked-file parity checks, locked install, dependency-tree verification, syntax, **603 regression checks / 0 failures**, synchronized HTML, production Docker build, and **0 vulnerabilities** in the production dependency install.
- Archive-only head: `50c61f0d55513e3840ea71fdff14e609042fa2ed`; only the ZIP changed. Size: **16,359,829 bytes**.
- The current tree has one release ZIP and no nested duplicate project directory. Before the nested directory was removed, its database placeholder and Google verification file were verified byte-identical to the retained root/public copies. Root `data.json`, root Google verification, and `public/google1a84d9d1dec7b85d.html` remain preserved.
- No browser entry file is part of the PR diff; current visual UI markup was not changed in this repair candidate.
- Manual sync workflow review: dispatch-only, must run from `main`, requires explicit boolean confirmation, checks archive safety/version/exact source parity, validates dependencies/tests/Docker before and after sync, and creates a repository rollback branch. The only `rsync --delete` is restricted to `public/` after exact archive-to-main parity; it explicitly excludes the Google verification file. Root placeholder data and the external Deplexo persistent volume are not synchronized by this workflow.
- Current PR #3 head: `50c61f0d55513e3840ea71fdff14e609042fa2ed`; open/draft/unmerged; base `safety/validate-and-backup-before-sync`. The safety base is 12 commits ahead of production `main`. `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.

### Non-negotiable production blockers

1. Independent consistent backup of live `/data/rimaz` to storage outside the app/volume.
2. Isolated restore of database JSON plus `uploads/` and `private-media/`, with database validity, owner record, file counts, hashes, paths and permissions verified.
3. Staging smoke tests for login/reconnect, public/private chat, rooms, voice/video, moderation/member-card actions, uploads, backup/restore, and multiple devices.
4. Runtime evidence for restart reasons, exit/OOM status, memory/RSS and controlled-load behavior.
5. Provider-side confirmation that `cf-connecting-ip` and `x-real-ip` are sanitized by Deplexo before IP-based trust.
6. Fresh exact-candidate validation and explicit user approval before any promotion.

The available GitHub connection cannot access Deplexo's live dashboard or persistent volume. Do not mark this gate complete, merge to production, run the main-only sync workflow, or deploy/restart based on CI success alone.
