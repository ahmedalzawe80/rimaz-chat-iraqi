# Rimaz — continuation checkpoint (2026-11-26)

## Latest verified repository state

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`.
- Working branch: `fix/bound-private-media-ticket-cache`.
- PR #3: open, draft, unmerged; base `safety/validate-and-backup-before-sync`.
- Current working-branch head: `ebf7f58e60fee80f8808f4faaa3862a3fecb7357`. It includes the durable chat-write queue and shutdown changes recorded below.
- The exact-head Actions status for this new push has not been confirmed. The connected status/run lookup currently returns no status records for this push; do not describe the new head as CI-passed.
- The release ZIP has not yet been refreshed for these new source/test changes; require a successful validation and archive-refresh run before treating the ZIP as current.
- The preceding source/test candidate `7cbd6eec9938a223bcf82dc7fa1a33d3d020aa15` passed run [#45886403562](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45886403562) with 641 checks and zero failures. The archive-only head from that run was `1039375815d36c6caaaa234dbad5bed034362df0`. This does not validate the newer queue commits.
- Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`; PR #3 remains open/draft/unmerged. No merge, deployment, restart, production archive sync, or live-volume mutation occurred.

## Repository inventory and cleanup decision

- Latest recursive tracked-tree inspection: 403 files total; 17 root-level files; 360 files under `public/`; 12 documentation files; 8 `lib/` modules; one smoke-test script.
- Top-level directories are `.github/`, `docs/`, `lib/`, `public/`, and `scripts/`. The obsolete nested `rimaz-chat-iraqi-main/` directory is absent.
- The root contains required runtime/build/configuration files and the deterministic release archive. Do not move root entry points merely to make the root look smaller: npm, Docker, hosting, domain verification, and workflows consume these paths.
- `.gitignore` excludes runtime data, uploads, private media, local secrets, credentials, backups, and generated artifacts. `.dockerignore` excludes `data.json`, runtime data/media, credentials, local dependencies, archives, and repository-only files from Docker context.
- The cleanup inventory is documented in [REPOSITORY-CLEANUP-INVENTORY-2026-11-26.md](../audits/REPOSITORY-CLEANUP-INVENTORY-2026-11-26.md).
- Exact duplicate asset filenames are not considered safe deletion candidates: the server dynamically discovers gift/smiley assets and derives IDs from sorted filenames; persisted catalogue and profile/history references may depend on names and ordering. No media files have been deleted or renamed.
- Root/public `index.html` and domain-verification copies are intentional served-path parity pairs and must remain synchronized.
- A documentation-only cleanup has not yet proved any application asset safe to remove. Further cleanup must be reference-driven and validated, not cosmetic.

## Remaining review and release blockers

1. Reconcile and review the exact current PR diff and complete exact-head CI, including archive refresh.
2. Continue source/reference audit for genuinely unused files without changing chat behavior or persistent IDs.
3. Run a real staging test for browser/device chat, uploads, voice/video/WebRTC and TURN relay.
4. Obtain independent consistent backup of the live Deplexo persistent volume and verify restore/rollback on an isolated clone.
5. Collect Deplexo runtime memory, restart, exit, and OOM evidence under representative load; isolated CI resource tests do not prove the historical production 128 MB issue is resolved.
6. Confirm Deplexo's actual trusted proxy CIDRs and sanitized client-IP headers; do not guess ranges.

Keep PR #3 unmerged, `main` untouched, and production undeployed until the blockers above are evidenced and explicit release approval is given.

## Historical checkpoint record

The sections below preserve earlier checkpoint snapshots and their exact evidence. Their branch heads and run references are historical; use the latest follow-up above and subsequent dated follow-ups for current state.

## Repository state

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- PR #3: open, draft, unmerged; base `safety/validate-and-backup-before-sync`.
- PR #3 head at review: `23df50c5937657ec24dd2537593114160e21dc5d`.
- Its parent source/documentation candidate: `c2a80315d9a5781bc11de530102184e7dc26e929`.
- PR #1: open, draft, unmerged; safety branch head `67d162b9b84e1e8fd38a83659eadfd6b18fac451`.
- PR #2: stale overlapping cleanup draft; base is behind the current safety branch and GitHub reports it not mergeable. Do not merge it independently or close it without an explicit reconciliation decision.
- Production `main`: `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`; unchanged in this review.

## Exact validation evidence

- GitHub Actions run [#45694955150](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45694955150) completed successfully on source/documentation SHA `c2a80315d9a5781bc11de530102184e7dc26e929`.
- Both `validate` and `refresh-release-archive` succeeded.
- The source job passed locked dependency installation/tree verification, JavaScript syntax checks, regression tests, production Docker build, and isolated HTTP/Socket.IO integration smoke tests.
- The regression suite reported 636 checks with zero failures; npm audit reported zero vulnerabilities.
- Under the isolated CI container limits (128 MiB memory / 0.25 CPU), cgroup-v2 memory after workload was 51,105,792 bytes current and 69,644,288 bytes peak; the container remained running and was not OOM-killed.
- Archive refresh then created head commit `23df50c5937657ec24dd2537593114160e21dc5d`, which changes only `rimaz-final-deep-audit-46.93.72.zip`.
- These are CI/container results only. They are not Deplexo production measurements and do not prove the historical 128 MB incident is resolved.

## Backup and restore review

- Runtime data is stored beneath `DATA_DIR`; with the Deplexo `/data` mount and no explicit `DATA_DIR`, the checked-in startup logic defaults to `/data/rimaz`. The actual live process value has not been independently read. Do not change the setting or mount path during this review.
- The user reports that both the database JSON backup and full TAR.GZ backup were downloaded. Their contents and integrity have not been independently verified.
- Database restore is a two-phase owner/admin-authorized preview and confirmation flow. The upload is disk-backed in a private staging directory, limited to 20 MiB, serialized to one active upload, checked with a streaming JSON inspector, and bound to a short-lived token/requesting administrator.
- Confirmation makes a restrictive disk-to-disk recovery copy, revalidates the staged JSON, clears active sessions, and attempts rollback from the recovery copy if persistence fails.
- The full TAR.GZ backup contains a database snapshot and referenced public `uploads/` files. The snapshot helper recognizes URL-bearing fields including profile media, room images, smileys, gifts, rank artwork (`artUrl`), and rank banners (`bannerUrl`). Missing, symlinked, or changing referenced files cause the backup to fail closed.
- The admin restore UI accepts JSON, not TAR.GZ. The full archive therefore is not a one-click full-volume restore: its database JSON and public uploads require separate extraction/restoration steps in an isolated environment.
- Private conversation media and transient private messages are intentionally excluded from the full backup. Startup cleanup also purges transient private history/media according to the current application policy. Do not change this behavior without an explicit product decision.
- The database and upload tree are not captured as one atomic point-in-time snapshot while live writes/deletes continue. A reliable production backup requires an offline consistent volume snapshot or a maintenance window preventing mutations for the entire export, followed by an isolated restore and verification.
- The Git-tracked root `data.json` is only a warning placeholder; never copy it over the persistent live database.

## Deployment workflow review

- The manual ZIP synchronization workflow runs only from `main` after its explicit confirmation input is true.
- It validates ZIP paths, symlinks, version, and exact parity with current application source before modifying files.
- Its `rsync --delete` commands are scoped to `public/` and `lib/`; the Google verification file is explicitly excluded from deletion. It does not run a root-level `rsync --delete`.
- The workflow creates a Git-tracked rollback branch, but that is not a backup of the Deplexo volume.
- The user confirmed Deplexo auto-deploy on push was disabled. Do not re-enable it during review.
- No PR merge, main synchronization, Deplexo deployment, restart, or live-volume mutation occurred during this review.

## Repository organization

- The reviewed tree had 400 tracked blobs and 17 root files, with application modules/assets/docs in `.github/`, `docs/`, `lib/`, `public/`, and `scripts/`.
- The old nested `rimaz-chat-iraqi-main/` duplicate is absent from the candidate tree.
- The release ZIP remains at repository root because the guarded workflows require that exact filename/path.
- Root/public HTML and Google verification copies are intentional runtime/hosting compatibility files; do not delete them as apparent duplicates.
- The root `data.json` placeholder is intentionally retained but excluded from the Docker image.

## Remaining production blockers

1. Obtain a consistent backup of the live `/data/rimaz` volume outside the app/container/volume, without exposing credentials or user data in chat.
2. Restore a clone in isolation; verify the owner account, database schema, public upload file counts/hashes, paths, and permissions.
3. Run staging browser/device smoke tests for sign-in/reconnect, public/private chat, rooms, uploads, moderation, voice/video media devices and TURN relay, and backup/restore.
4. Collect Deplexo restart/exit/OOM history and representative runtime memory metrics under realistic traffic. The prior memory-limit violation remains unresolved as a production evidence question.
5. Confirm Deplexo's actual trusted proxy CIDRs and which client-IP header it sanitizes; do not guess ranges or trust arbitrary forwarded headers.
6. Re-fetch exact PR heads and checks before any promotion; reconcile the PR chain deliberately. PR #3 depends on PR #1's safety branch; PR #2 is overlapping/stale.

## Non-negotiable release boundary

Keep PR #1 and PR #3 unmerged, leave `main` untouched, and do not deploy/restart Deplexo or run the main-only ZIP synchronization workflow until the independent volume backup, isolated restore, staging tests, provider telemetry/trust-boundary checks, and final explicit promotion approval are complete.


## Follow-up verification — 2026-11-26 (latest review)

- The cgroup metrics correction and the health-panel null guard are now validated together. Source/test commit: `cef0952d327b22296f0d6cef088d62fb61ae4d22`.
- GitHub Actions run [#45707176482](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45707176482) completed successfully: both `validate` and `refresh-release-archive` succeeded. The validation job passed locked dependency installation/tree verification, JavaScript syntax, regression tests, production Docker build, and HTTP + Socket.IO smoke test.
- The immediately preceding CPU-only test run failed because its multiline fixture was escaped incorrectly; the fixture was corrected in `025b1c0e2689f90983f0f4e2fcd94d41f955f619`, and run [#45706685335](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45706685335) passed. The later health-panel commits `4c562aa...` and `659f52c...` were superseded/cancelled by the combined exact-source validation; the final combined run above is green.
- The successful archive job created archive-only head commit `89aa8a83894a53cf70160419570f30ccc2f160d3`, changing only `rimaz-final-deep-audit-46.93.72.zip`. There are no check runs attached to that ZIP-only commit; the source parent `cef0952...` is the exact commit tested by run #45707176482.
- PR #3 remains open/draft/unmerged, with head `89aa8a8...` and base safety head `67d162b...`. PR #1 remains open/draft/unmerged against `main`; PR #2 remains open/draft, stale and not mergeable. Do not merge PR #2 independently.
- Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. The PR #3 working tree has 413 tracked tree entries, 22 root entries, no nested duplicate project directory, and one required release ZIP.
- The source change prevents CPU-only cgroup data from being marked unavailable and prevents a missing cgroup memory counter from being rendered as a false `0.00 MB`. It does not establish that Deplexo's historical OOM issue is resolved.
- No merge, production sync, Deplexo restart/deploy, or live-volume modification occurred. Independent live-volume backup/isolated restore, provider telemetry and proxy trust confirmation, and real browser/device WebRTC/TURN tests remain mandatory promotion blockers.


## Restore-account integrity root fix — 2026-11-26

- A further source review found that restore preview could count an account-map key as the site owner even when its value was malformed (for example, `null`, an array, string, or number). That could allow a structurally invalid owner record to pass the name-presence check.
- Root fix: `lib/restore-inspector.js` now rejects non-object values for every `users` and `guests` account record during streaming preview. `server.js` repeats the same validation during confirmation and owner detection now requires a valid non-array object record. No chat UI or runtime chat feature was changed.
- Regression coverage exercises malformed values (`null`, array, string, number) in preview and directly against the confirmation validator.
- Final source/test commit: `ad0a9ace3974915d34693b660816bdad7965f029`. GitHub Actions run [#45708210437](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45708210437) completed successfully on both `validate` and `refresh-release-archive`; the validation job passed dependency install/tree verification, syntax, regression tests, Docker build, and HTTP + Socket.IO smoke tests. The archive job rebuilt, extracted, and validated the release ZIP.
- The archive-only commit created by that successful run is `a8a9485fc48a4a450539af316684c74ac9e5d1ce`; it changes only `rimaz-final-deep-audit-46.93.72.zip`.
- One earlier run on the first test-harness draft failed because the test could not locate the validator function; the harness locator was corrected, and the final exact-source run above passed. An intermediate validation run passed but its archive job was cancelled by the next push; the final run completed both jobs successfully.
- PR #3 remains open/draft/unmerged with archive-only head `a8a9485...`; PR #1 remains open/draft/unmerged; PR #2 remains stale and not mergeable. Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.
- This source-level fix improves restore-file validation only. It does not remove the production blockers: independent Deplexo volume backup and isolated full restore, provider restart/OOM telemetry, trusted proxy CIDR/header confirmation, and real browser/device WebRTC/TURN testing. No merge, deployment, restart, or live-volume mutation occurred.


## Follow-up verification — 2026-11-26 13:57 Iraq time

- Re-fetched PR #3 and the branch after the earlier checkpoint. PR #3 is still open, draft, and unmerged; its base remains `safety/validate-and-backup-before-sync`.
- Current branch head: `4c78ad76a001b937a55cb48bf4d53f535a0f9893`. Its parent source/test candidate is `2cbede01f932640acd1a8f39318bce7000a7f250`; the head commit changes only `rimaz-final-deep-audit-46.93.72.zip`.
- GitHub Actions run [#45804439188](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45804439188) completed successfully for the source parent: both `validate` and `refresh-release-archive` succeeded. The validation job passed locked dependency install/tree checks, syntax, regression suite, production Docker build, HTTP/Socket.IO smoke test, and authenticated public/private chat, private-media authorization/playback, voice-room negotiation, and video-call signaling.
- The regression log includes a specific queue test verifying uncommitted messages are not exposed, writes commit before promises resolve, and failed writes retry without leaking memory. The shutdown handler also explicitly flushes queued messages before its final database save. No additional queue patch was justified by this review.
- Under the isolated CI cgroup limit of 134,217,728 bytes (128 MiB), post-workload memory was 76,820,480 bytes current and 80,572,416 bytes peak. The container remained running and was not OOM-killed. This remains CI-only evidence, not Deplexo production telemetry.
- The source validation log reports zero dependency vulnerabilities. These results apply to parent source SHA `2cbede0...`; the archive-only head `4c78ad7...` has no separate source test run because it contains no source changes.
- Rechecked repository organization: the nested duplicate project directory is absent; the root contains only the expected project/configuration directories and the single required release ZIP. Keep the intentional root/public HTML and Google verification copies, and the root warning-only `data.json`.
- The current checkpoint's earlier PR-head references are historical snapshots; use the exact SHAs and run above as the newer state. Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.
- Remaining production blockers are unchanged: independent consistent Deplexo volume backup, isolated restore and file-integrity verification, staging browser/device and WebRTC/TURN tests, provider restart/OOM telemetry, and confirmation of trusted proxy CIDRs/header sanitization. No live Deplexo access, deployment, restart, merge, main update, or live-volume mutation occurred in this review.



## Follow-up verification — 2026-11-26 14:00 Iraq time

- Rechecked the exact PR #3 branch and the latest completed Actions run. PR #3 remains open/draft/unmerged; base remains `safety/validate-and-backup-before-sync`.
- Source/documentation commit `d0e77c7f5810d9e597394273dca00b533b6ea396` passed Actions run [#45806305779](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45806305779). Both `validate` and `refresh-release-archive` jobs completed successfully.
- The validation log contains **639 passing regression checks and zero failing checks**. Locked dependency installation/tree verification, JavaScript syntax, production Docker build, isolated HTTP/Socket.IO and authenticated chat/media/voice/call smoke tests passed; npm audit reported **0 vulnerabilities**.
- The constrained isolated container used 128 MiB RAM and 0.25 CPU. After the concurrent workload, cgroup-v2 reported **56,676,352 bytes current** and **76,804,096 bytes peak** against **134,217,728 bytes**. The container remained running and was not OOM-killed. This is CI evidence only, not Deplexo production telemetry.
- The successful archive job created current branch head `68e4bd198ad6e1d71a250e000dec5eb558051da3`; that commit changes only `rimaz-final-deep-audit-46.93.72.zip`. The source/test evidence applies to `d0e77c7...`; the ZIP-only commit has no source changes requiring a separate source test.
- Re-audited client-IP trust handling: untrusted peers cannot override their address with forwarding headers; only an explicitly configured proxy CIDR and one allowlisted header are accepted; ambiguous/malformed values fall back to the socket peer. Regression tests cover these cases and the X-Forwarded-For trust chain. The actual Deplexo proxy CIDRs/header sanitization still must be confirmed before configuring production.
- Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No merge, deployment, restart, production ZIP sync, or live-volume change occurred.
- Remaining production blockers are unchanged: consistent independent backup of live `/data/rimaz`, isolated full restore and file-integrity verification, staging browser/device WebRTC/TURN tests, Deplexo restart/OOM telemetry under representative load, and provider confirmation of trusted proxy CIDRs/header sanitization.

## Catalogue asset-reference follow-up — 2026-11-26

- Follow-up source review confirmed that built-in smileys are generated from sorted filenames and stored in `db.customSmileys` with sequential `rimaz-art-###` IDs. The startup seed condition also rebuilds the smiley catalogue if its expected count changes. Removing one duplicate-looking smiley can therefore reset the saved catalogue, including custom entries.
- Built-in gifts are generated from sorted filenames and assigned sequential `gift-pack-###` IDs. Removing an asset can shift IDs on a seed and leave already-persisted gift image paths referring to a missing file.
- The five exact duplicate groups remain untouched. Safe removal would require a versioned migration preserving IDs and all persisted references, plus independent persistent-data backup and restore validation.
- Detailed evidence is appended to `docs/audits/REPOSITORY-CLEANUP-INVENTORY-2026-11-26.md`.
- CI run [#45870516202](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45870516202) passed both the `validate` job and the `refresh-release-archive` job for the documentation candidate `69e06acc4c117c8fb7950621b254a7f2d6e5266e`. The archive-only follow-up commit was `cf525778e03868f2a643b46591063c3336518aa2`. The new catalogue-risk appendix is a later docs-only commit and requires its own CI run; do not mark that newest head validated until its run completes.
- PR #3 remains open/draft/unmerged. No changes to `main`, production deployment, restart, or live persistent data.

## Follow-up verification — 2026-11-26 evening

- Re-fetched PR #3 and its branch after the latest source review. PR #3 remains open, draft, and unmerged; its base is `safety/validate-and-backup-before-sync`. Current archive-only head: `ce3729d0b0bf8d361b4a1e53a99f67086f47a781`; its parent source/test commit is `7cbd6eec9938a223bcf82dc7fa1a33d3d020aa15`.
- Root fix: the legacy private-media startup migration now checks whether each old `/uploads/<file>` URL is referenced outside `db.privateMessages`. If shared public references exist, it copies the file into protected private storage and preserves the public original. It moves private-only files; if a protected copy already exists, it removes the public copy only when no other database record references it.
- New regression test covers three cases: shared public/private asset, private-only asset, and an existing protected copy alongside a still-referenced public asset. All pass. This prevents a private-message migration from breaking a member avatar, banner, or other public asset that shares the same stored file.
- The smiley seed migration now reseeds only when the explicit seed version is below 9; it no longer rebuilds the catalogue based on its item count. This preserves member-added smileys across restarts. A regression check protects that rule.
- A pre-existing global-ban route test used a newline-fragile dynamic regex. The test now extracts each route by its explicit start and closing boundary; no runtime route behavior was changed by this test-harness correction.
- GitHub Actions run [#45886403562](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45886403562) completed successfully on source/test commit `7cbd6ee...`. The validation log records **641 passing checks, zero failures**, and **0 npm audit vulnerabilities**. Locked dependency checks, JavaScript syntax, regression suite, production Docker build, HTTP + Socket.IO smoke test, and authenticated chat/private-media/voice/video integration passed. The release-archive refresh job also rebuilt the ZIP, extracted it, reinstalled locked dependencies, reran archive validation, and committed the archive-only head above.
- The current tracked tree remains 403 files: 17 at the root, 360 under `public/`, 12 under `docs/`, and 8 under `lib/`; the obsolete nested `rimaz-chat-iraqi-main/` directory is absent. Public assets remain organized into 115 gifts, 238 smileys, and one VIP gift, with six public-root files.
- Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`; PR #3 remains separate from production. No merge, deployment, restart, production ZIP sync, or live persistent-data mutation occurred.
- CI and isolated smoke tests do not replace the remaining production gates: independently back up the live Deplexo volume, perform an isolated full restore and media-integrity check, complete real browser/device WebRTC/TURN tests, collect Deplexo restart/OOM telemetry, and confirm the provider's trusted proxy CIDRs/header sanitization before any promotion.


## Durable chat-write queue root fix — 2026-11-26

- A fresh review found a real data-loss path in the current integrated candidate: after three consecutive database-save failures, `flushMessageWrites()` removed every pending chat message from memory and rejected the waiting callers. This could silently lose a message during a temporary storage failure.
- The integrated branch now keeps the complete pending batch until a successful atomic database save, retries with capped exponential backoff (1–30 seconds), and limits the in-memory pending queue to 1,000 messages. New messages are rejected before enqueue when the queue is full; the HTTP room-message route returns 503 and Socket.IO sends a clear Arabic temporary-overload notice.
- Shutdown now blocks new queue writes, closes Socket.IO/HTTP transports, retries the pending batch up to eight times, performs the final database save, and exits nonzero if any pending messages remain or the final save fails.
- Regression coverage now exercises repeated transient write failures, rollback of the in-memory message list, successful eventual commit, retry delays, queue saturation, rejection during shutdown, shutdown retry exhaustion, and final process exit status.
- Source commits: `51c26895dea379f717f51bc10bbca00e4d2eafed` (queue and shutdown implementation), `f1eb5397951345ff45e8bd91c46d36a7ea78b08a`, `8ca985934e41aea444cb92a9e5e515db05a68b60`, `4a64674a34ba6fe350df359d68c4792b76f04818` (regression coverage), `d444c6a6a49eb94c4106dbc9a124a7bba8de43d9` and `bab5fe811fda3f2a9114127dafff2ac614ce4b23` (explicit overload response and test).
- Current source branch head before this checkpoint update: `bab5fe811fda3f2a9114127dafff2ac614ce4b23`. The exact-head GitHub Actions result has not yet been independently confirmed; do not mark this candidate green until the workflow result for the latest source and archive is checked.
- This change touches only `server.js` and `verify.js`; neither browser entry file nor chat UI was modified. The queue fix is not a substitute for a production volume backup or Deplexo runtime telemetry.
- PR #3 remains open/draft/unmerged. Production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No merge, deployment, restart, production ZIP sync, or live persistent-data change occurred.
