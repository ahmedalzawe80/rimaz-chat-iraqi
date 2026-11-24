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
