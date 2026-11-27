# Rimaz checkpoint — 2026-11-27

## Current verified status — supersedes older snapshots below

- Production deployment reported by Deplexo on 2026-11-27: commit `6d931239167f5cd811da4df75ef0ededcfec802c` on branch `review/rimaz-clean-integration-2026-11-27`.
- The review branch `review/rimaz-clean-integration-2026-11-27` and open draft PR #9 now point to documentation-only head `61e8b589da3805b17081dc7181c42d58a1ac1f4e`; the deployed application source remains `6d931239167f5cd811da4df75ef0ededcfec802c`. PR #9 targets `safety/validate-and-backup-before-sync`; it is **open, draft, and unmerged**. PR #3 is closed as superseded. Do not merge, deploy, restart, or modify live data without a separate explicit release decision.
- Production/default branch `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.
- Source commit `6d93123` passed exact-source Actions run #46022343659. The later documentation-only head `61e8b589da3805b17081dc7181c42d58a1ac1f4e` passed Actions run #46025628040 (run #1057): locked dependency installation/tree check, JavaScript syntax, the full regression suite, production Docker build, and constrained HTTP/Socket.IO/chat/media/voice integration smoke all passed. The smoke container ran at 128 MiB and 0.25 vCPU; cgroup memory current was 80,228,352 bytes and peak was 107,425,792 bytes, with the container running and not OOM-killed. The manual release-archive job was skipped because this was a push run, not an approved `workflow_dispatch`. These are isolated CI results, not proof that Deplexo's historical OOM is resolved.
- The Deplexo log findings map to current source safeguards: `lastKnownGoodDatabaseBackupAt` is declared before startup migrations call `save()`; generated restore staging names are matched by the corrected anchored expression; current ticket use is declared in its route; the exact deployed head passed syntax checks. Historical log lines alone do not prove these errors still occur on the current deployment.
- The corrupt database recovery copy and missing historical JPG remain production-data questions. No access to or modification of `/data/rimaz` occurred. Do not overwrite `data.json`, auto-restore `.previous`, delete references, or recreate a placeholder image. A missing physical upload requires recovery from a verified independent copy.
- Private conversations are intentionally memory-only in the current source: they are not written to `data.json`, and the transient private history/media is cleared after full disconnect/restart. Regression tests explicitly enforce this existing behavior. No change was made; do not silently convert it to persistent history or treat it as a new regression without a separate product decision.
- The repository root has been rechecked: the nested `rimaz-chat-iraqi-main/` copy and tracked release ZIP are absent; `data.json` is only the warning placeholder; runtime state, uploads, private media, and backups are excluded from the Docker build. Required runtime entry points and public assets remain in place.
- Remaining production blockers: independent consistent backup of the live persistent volume, isolated full restore of database plus uploads/private media, browser/device staging checks including WebRTC/TURN, Deplexo restart/OOM evidence under representative load, and provider-confirmed trusted proxy configuration.
- User's standing constraints: root-cause fixes only; preserve existing behavior and features; protect all member data and media; no merge, main update, deploy, rebuild, restart, or live-volume mutation until the required evidence and explicit release approval.

The sections below are retained as historical audit notes. Their earlier PR numbers, branch heads, and CI states are not the current status unless explicitly restated in this superseding section.

## Current working state

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- Current application-source candidate: `9806c753cae67fd108830d30a3a94a7265156036`.
- PR #3 remains open/draft/unmerged. Its latest GitHub mergeability field has fluctuated between true and false during refreshes; do not merge or deploy until a fresh exact-head review confirms it.
- Production `main` and Deplexo persistent data have not been modified by this work.

## Backup-media integrity work completed on the branch

1. `lib/backup-media-snapshot.js`
   - Preflights all recognized persisted public-media references before building a full backup.
   - Reports all missing/unreadable referenced upload names in one error.
   - Preserves the underlying filesystem error as `cause` (for example, `ENOTDIR`) rather than losing diagnostic detail.
   - Detects a referenced file disappearing between preflight and hard-link snapshot creation.
   - Rejects non-regular files/symlinks and cleans temporary snapshot directories on failure.
   - Recognizes `customDecorationImage` as a persisted media-reference field in addition to URL, image, avatar, banner, bannerUrl, icon, cover, background, giftImage, and artUrl.

2. `server.js`
   - `removeUploadedFile` now checks whether a public upload under `UP_DIR` is still referenced anywhere in the in-memory database before unlinking it.
   - If a reference remains, cleanup skips deletion and logs a warning. Orphaned uploads and non-public temporary files can still be removed.
   - Public room-image rollback now uses this guarded cleanup helper instead of directly unlinking the upload.

3. `verify.js`
   - Added regression coverage for preserving referenced uploads while still cleaning orphan/temporary files.
   - Expanded backup reference-field coverage, including custom member-decoration images.
   - Existing backup tests cover multiple missing files, symlinks, cleanup after failure, and preserving the underlying `ENOTDIR` cause in the full-backup generator.

## Findings and limits

- The missing production file reported in Deplexo logs remains:
  `/data/rimaz/uploads/1794900547703-e6ba8a72bd45f3ba.jpg`
- No production database or upload directory was accessed. The record that references this filename has not been identified, so the historical cause of its absence is still unproven.
- Source review confirms the 24-hour public-content retention process first persists the removal of expired public messages/wall posts, then removes media only if no database reference remains. This is intended retention behavior, not evidence of random deletion.
- The current upload-cleanup guard closes an additional failure path where a later exception could otherwise cause cleanup to unlink an upload after it had become referenced.
- The full-backup snapshot and live database/media tree are not a single atomic volume snapshot while writes are active. A verified external backup and isolated restore remain mandatory before any release.
- GitHub connector status lookup returned no classic commit statuses and its commit-workflow endpoint only exposes PR-triggered runs; therefore CI success for this exact head is **not confirmed here**. Do not describe the candidate as CI-green until the push-triggered workflow result for this exact SHA is verified.

## Next steps

1. Verify GitHub Actions for exact SHA `d83422e5f58f59f0e089649f4908f97a81876469` (validation workflow, regression suite, Docker build, constrained container smoke test, and release archive refresh).
2. Review any failures and fix them at source; do not skip or weaken tests.
3. Obtain an independent backup of the live `/data/rimaz` volume to storage outside the app/volume, without restarting or changing Deplexo.
4. Restore that copy in an isolated staging volume and compare database integrity, upload file counts/hashes, and owner/admin account presence.
5. Identify which database record references the missing JPG using a protected offline copy only. Do not delete the record, recreate a placeholder image, or edit production data to make backup pass.
6. Run staging chat/media/voice/moderation/backup/restore smoke tests before requesting release approval.

## Safety boundary

No Deplexo restart, rebuild, redeploy, ZIP sync, live-data mutation, merge, or production file deletion is authorized by this checkpoint. Preserve the existing owner/admin accounts and all uploaded media.

## Final-stage verification — 2026-11-27

### Latest source and CI/archive evidence

- Latest application-source fix: `9806c753cae67fd108830d30a3a94a7265156036`.
- The final source review caught a missing statement separator in the public room-image upload rollback path introduced during the guarded-cleanup refactor. It was corrected before release validation. The invalid-image branch now also routes uploaded-file cleanup through the guarded helper.
- GitHub Actions then created archive-only commit `2fcb9e8553f58db625b78666174f5c75f1a9bfd0`, authored by `github-actions[bot]`, with message `build: refresh audited archive after validated changes`.
- Comparing `9806c753...` to `2fcb9e855...` shows exactly one changed file: `rimaz-final-deep-audit-46.93.72.zip`. The archive refresh job in `.github/workflows/validate-project.yml` has `needs: validate`, and commits only after rebuilding and validating the tracked-file archive. This is strong workflow evidence that the source validation job and archive refresh completed after the syntax correction. The available GitHub connector did not expose the run ID or job logs, so no run number or individual test count is claimed.
- The configured `validate` job includes locked dependency installation, `npm ls`, JavaScript syntax checks, `npm test`, production Docker build, and HTTP/Socket.IO/chat integration smoke tests under 128 MiB / 0.25 CPU limits.
- Current branch tip is `2fcb9e8553f58db625b78666174f5c75f1a9bfd0`; production `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.

### Current pull-request chain — do not merge independently

- PR #1: open draft, base `main`, head `safety/validate-and-backup-before-sync`, currently reported mergeable. It remains the safety-workflow prerequisite.
- PR #3: open draft, base `safety/validate-and-backup-before-sync`, head `fix/bound-private-media-ticket-cache`, currently reported mergeable. This is the consolidated application/repository candidate.
- PR #7: open draft, based on the application branch but its head `fix/shutdown-flush-and-db-recovery-guard` is diverged from the current application branch and GitHub reports it not mergeable. Its intended shutdown-flush and last-known-good JSON protections are already present in the current PR #3 source, with corresponding tests.
- PR #8: open draft, base `main`, head `fix/retry-pending-chat-writes`. Its branch is three commits ahead of PR #7's head, but its comparison against `main` contains 697 commits / 44 changed files, so it is not a clean standalone patch. Its bounded pending-message queue and retry logic are also already present in PR #3 source, with regression coverage. Do not merge PR #7 or #8 independently; they are stale/overlapping branches, not missing features in the current source candidate. Leave them open until the user approves cleanup of the PR list.
- PR #2: open draft and overlaps the cleanup already represented in PR #3; do not merge separately.
- No PR was retargeted, closed, marked ready, or merged during this review.

### Remaining production blockers

- No independent verified copy of the live Deplexo `/data/rimaz` volume has been obtained; no isolated restore has been performed.
- The production missing-upload reference `/data/rimaz/uploads/1794900547703-e6ba8a72bd45f3ba.jpg` remains unexplained. Do not delete the database reference, fabricate a replacement, or change live data.
- No staging run has verified the real owner/admin accounts, full upload inventory/hashes, or all chat/voice/video/moderation flows against a clone.
- The historical Deplexo OOM/restart incident and trusted-proxy header boundary remain unproven resolved.
- No Deplexo restart, rebuild, redeploy, live-volume mutation, merge, or production sync was performed.

## Repository navigation update

- `docs/README.md` now links this 2026-11-27 checkpoint first and labels the 2026-11-26 and 2026-11-25 checkpoints as history.
- `docs/REPOSITORY-STRUCTURE.md` now identifies the 2026-11-27 checkpoint as the current continuity record.
- The source candidate remains `d83422e5f58f59f0e089649f4908f97a81876469`; the subsequent commits through `2003b2c1a59b38cfac64f1d58e26458062e9c6ee` update documentation/navigation only.
- At the time of this initial checkpoint, push-triggered CI and release-archive refresh still required verification; see the final-stage section below for later evidence.

### Documentation-only tip and archive freshness

- After the source-validation/archive commit `2fcb9e8553f58db625b78666174f5c75f1a9bfd0`, subsequent documentation-only commits updated this checkpoint and the release gate. The only paths changed since that archive commit are these two Markdown files; the application source did not change.
- The archive refresh bot commit for these later documentation-only changes had not appeared at the latest check. Do not claim the ZIP is byte-for-byte current with the documentation tip until a new archive-only bot commit appears. The application source candidate itself remains the validated `9806c753...`.


## Repository phase-one continuation — 2026-11-27

### Exact current branch and validation

- Current PR #3 branch tip: `4c8309f86c589b4afac04253efb6cb1fc2126971`.
- Its parent application/test commit is `f60b85fe6f84fd997a500546880c10949a170d46`; the only change in the child commit is the refreshed release ZIP. GitHub compare confirms one changed path: `rimaz-final-deep-audit-46.93.72.zip`.
- Push workflow run [#45943098064](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45943098064) completed successfully on source/test commit `f60b85f...`. Both jobs succeeded: `validate` and `refresh-release-archive`.
- The validate job passed locked dependency installation/tree verification, JavaScript syntax, `npm test`, production Docker build, and the constrained 128 MiB / 0.25 CPU HTTP/Socket.IO integration smoke test.
- The archive job rebuilt the ZIP from tracked files, checked CRC/safe paths/symlinks/duplicates/compression ratio and exact tracked-file parity, then installed dependencies and ran tests and Docker build against the extracted archive.
- The current branch tip is therefore an archive-only child of the tested source commit. This is branch CI evidence, not production or staging sign-off.

### Fresh tracked-tree inventory

- Current tree SHA: `cb7e3917eee73b47244d3050e9ccbb889807221d`.
- Recursive tree: **416 entries**, comprising **404 tracked file blobs** and 12 directory entries; GitHub reports the tree is not truncated.
- Root: **17 files and 5 directories**. The 17 root files have documented runtime, build, dependency, verification, documentation, test, or release roles.
- Documentation: **17 Markdown files**, grouped under `docs/audits/`, `docs/operations/`, and `docs/project/`, plus the documentation index and root project guidance.
- Public media and site assets: **360 files**. No asset was deleted or renamed.
- No nested `rimaz-chat-iraqi-main/` application copy, extra root ZIP, or backup/temp dump is present in this tree.
- The prior 2026-11-26 inventory counts (403 files / 12 documentation files) are historical snapshot counts, not the current tree; the inventory has a dated follow-up documenting the refreshed counts.

### Phase-one repository decisions

- Keep the 17 root files in place; moving Node/Docker/SEO entry points solely to reduce the root count would break expected paths.
- Keep both HTML entry copies and both Google verification copies; they serve separate paths and parity is tested.
- Keep all five exact-content duplicate media pairs documented in the inventory. Filename-derived smiley/gift IDs and persisted references make file deletion unsafe without a versioned data migration.
- Keep the single reviewed release ZIP. It is a workflow-generated artifact with exact tracked-file parity checks, not a production data backup.
- Historical audits and dated checkpoints remain under categorized documentation folders; the latest checkpoint is linked first in `docs/README.md`.
- No production branch, Deplexo service, persistent data, or live uploads were changed.

### Remaining phase-one work

1. Continue a reference-aware audit of documentation links, workflow path assumptions, archive/source parity, and stale package-specific instructions.
2. Review the unusually long PR #3 commit history (820 commits reported by GitHub) before any integration; do not force-push or rewrite history as an unreviewed cleanup action.
3. Decide with explicit approval whether stale overlapping draft PRs should be closed after their changes are proven integrated; do not merge them independently.
4. Keep the repository phase separate from the later chat behavior phase.

**No merge, deployment, Deplexo restart, production ZIP sync, or live-data operation is authorized by this continuation.**


### Final documentation and archive verification — 2026-11-27

- The refreshed phase-one documentation commit `539c08c294da8bb598e2ff7655076759d7432d82` passed Actions run [#45943551181](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45943551181): both `validate` and `refresh-release-archive` completed successfully.
- Validation passed locked dependency installation/tree verification, syntax checks, `npm test`, production Docker build, and constrained HTTP/Socket.IO smoke tests.
- The archive job rebuilt and validated the release ZIP, tested the extracted archive, and committed only that ZIP. Current branch tip after the archive-only refresh: `fb19e4000e9b49bb30bdba0f9f93d22b375b7ba5`; comparing it with documentation commit `539c08c...` confirms the ZIP is the sole changed path.
- A separate read-only scan of all 17 Markdown files found **zero broken relative file links**. Git blob IDs reconfirmed both synchronized HTML/verification pairs and the three duplicate-media pairs; all remain retained.
- The PR currently reports 824 commits and 48 changed files. This unusually long history remains an integration-review item; do not rewrite or force-push it as an unreviewed cleanup step.
- This exact-tree CI and documentation review do not include Deplexo production data, and do not authorize merge or deployment.


### Documentation currency and PR-history review — 2026-11-27

- Added explicit historical/superseded banners to the 2026-11-24 follow-up, runtime-resource, and transaction-safety audits and to the 2026-11-25 and 2026-11-26 checkpoints. Each points readers to the current 2026-11-27 checkpoint. The documentation index already places the current checkpoint first.
- Rechecked the root Node version contract: `.nvmrc`, `package.json` engines, README, CONTRIBUTING, and Dockerfile all consistently require Node.js 24.
- Reviewed the archive workflows. The release ZIP is not an accidental leftover: current archive parity and guarded manual synchronization workflows explicitly depend on its root path. The sync workflow is manual-only, requires a boolean confirmation, runs from `main`, verifies exact source/public/lib parity, creates a Git rollback branch, and does not back up or touch the external Deplexo volume. Its `rsync --delete` operations are scoped to `public/` and `lib/`; the public Google verification file is explicitly excluded. Do not remove or relocate the ZIP without redesigning and validating these workflows together.
- PR #3 now reports **832 commits ahead across 48 changed files**. The GitHub PR commits endpoint returned 250 commit records across its first three pages; within those returned records, 68 were automated archive-refresh commits, 71 documentation commits, and 52 test commits. This is a genuine history-maintenance concern, not 832 files or 832 independent runtime changes. Do not force-push or rewrite history; review a controlled squash/integration plan separately.
- The current branch tip after the latest successful CI/archive refresh is `ce3dec65949fd54b387d6a5383494a0c1a57d18a`. The immediately preceding documentation commit `9b1a37d3b83b3de2e6edd4f1a158e8c8a016036a` passed Actions run [#45946239051](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45946239051); both `validate` and `refresh-release-archive` succeeded. The final branch tip is the archive-only child of that validated documentation commit.
- The PR description has been refreshed to remove stale inventory counts and reflect the current branch state. PR #3 remains open/draft/unmerged. Production `main` and Deplexo remain untouched.


### Controlled release-archive refresh policy — 2026-11-27

A history review found that the first 250 commit records returned by GitHub included 68 automated `build: refresh audited archive` commits. The tracked ZIP is required by the current archive audit and ZIP self-sync workflow (now removed), so it was not deleted or moved. Instead:

- Ordinary branch pushes continue to run source validation but no longer rebuild and commit the ZIP.
- The `refresh-release-archive` job now runs only after an explicit `workflow_dispatch` on `main` or the designated maintenance branches, and only after the source validation job succeeds.
- The archive audit now also watches `main` so a manually refreshed main release archive is checked.
- README and repository-structure documentation describe the new release lifecycle. The ZIP remains tracked for compatibility with the existing guarded sync path; do not remove it until those workflows are redesigned together.
- The first CI attempt after this policy change correctly exposed a stale regression assertion that still expected the old push-triggered behavior. The assertion was updated to verify the manual-dispatch condition and main-branch archive audit.
- Exact source/test commit `e534e07e01142d0df5cfb61a075c507dd6428a9c` passed Actions run [#45946608116](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45946608116): dependency installation/tree verification, JavaScript syntax, the full regression suite, production Docker build, and constrained HTTP/Socket.IO smoke all succeeded. The archive-refresh job was **skipped as intended** for an ordinary push.
- The current branch tree remains 416 entries / 404 tracked files. PR #3 remains open/draft/unmerged; production `main` and Deplexo remain untouched.
- The archive must be explicitly refreshed and audited on the intended release branch before any future use of the main-only sync workflow. A branch push passing source CI alone does not certify the tracked ZIP.


## Repository phase-one reconciliation — latest exact branch review (2026-11-27)

### Fresh tracked-tree and documentation audit

- Reviewed PR #3 against its base using GitHub's status-aware compare, not the changed-filename list alone.
- Current tree snapshot used for this audit: tree SHA `6567a03251ebe49eae42e412afa0aa2b7ac551a3`; recursive tree is not truncated.
- **416 tree entries = 404 tracked file blobs + 12 directory entries**.
- Root: **17 tracked files**; documentation: **17 Markdown files**; `public/`: **360 files**.
- No nested `rimaz-chat-iraqi-main/` directory remains; no extra root ZIP or tracked database dump exists. The only tracked database-named file is the 138-byte warning placeholder `data.json`, not production data.
- One root release ZIP remains because the archive refresh and audit workflows explicitly consume that exact path.
- A fresh link scan of all 17 Markdown files found **zero broken relative links**.
- The exact-blob scan found five duplicate groups: the synchronized root/public HTML pair, the synchronized Google verification pair, two same-content gift filenames, and two same-content smiley filename pairs. Keep all five groups: the first two serve separate URLs; the media filenames are part of catalog/persisted-reference compatibility and are not safe to delete based on byte equality.

### Reconciliation of paths shown in PR #3

The PR filename list includes changed paths whether added, modified, renamed, or removed. A status-aware comparison against its base confirms:

- `rimaz-chat-iraqi-main/data.json` and `rimaz-chat-iraqi-main/public/google1a84d9d1dec7b85d.html` have status **removed**. They are not present in the current branch tree; their appearance in the PR file list does not mean a nested app copy remains.
- The former root documents `DEPLOYMENT-46.93.72.md`, `HANDOFF-2026-11-24.md`, and `REPAIR-NOTES-46.93.72.md` have been removed from the root as part of documentation consolidation. The maintained package deployment reference now lives at `docs/operations/DEPLOYMENT-46.93.72.md`; audit/checkpoint records are categorized under `docs/audits/` and `docs/project/`.
- The existing audit documents moved into `docs/audits/` are represented as renames, not lost reports.
- The former deployment note contained outdated archive instructions and an old ZIP filename; the maintained operations reference describes the current tracked archive and manual workflow instead.

### Documentation corrections and exact CI result

- Corrected the docs index summary so it no longer describes the latest CI state as outstanding.
- Updated the historical release-gate banner to point to this 2026-11-27 checkpoint rather than the older 2026-11-26 checkpoint.
- Added this status-aware path reconciliation and fresh tree/link/duplicate inventory to the checkpoint.
- The three documentation commits in this review ended at `236abbc9ed1f7d15524c10b8e921852974adf07b`. Exact-head Actions run [#45947257239](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45947257239) completed successfully: locked dependency install/tree verification, JavaScript syntax, full regression suite, production Docker build, and constrained HTTP/Socket.IO smoke all passed.
- The `refresh-release-archive` job was **skipped intentionally** for this ordinary push. The tracked ZIP is not certified current with the documentation batch. Before any future use of the ZIP self-sync workflow (now removed), explicitly dispatch `Validate Rimaz Project` on the intended release branch, wait for source validation and archive refresh, then confirm the archive audit succeeds. The user does not need to edit or upload the ZIP manually.
- The latest checked PR state before this checkpoint correction was open/draft/unmerged, base `safety/validate-and-backup-before-sync`, with 48 changed paths and an unusually long commit history. Do not force-push or rewrite history as an unreviewed cleanup action.

### Current repository-phase boundary

- No files or assets were deleted during this review. The only edits were documentation corrections on the existing candidate branch.
- No merge, force-push, Deplexo operation, production sync, restart, or live-data change was performed.
- Continue phase one with reference-aware review of all 48 changed paths, workflow safety assumptions, and PR-history/integration strategy. Do not begin chat/runtime phase two until repository phase one is explicitly complete.


### ZIP workflow root-cause correction — 2026-11-27

- Reviewed `.github/workflows/unzip-upload.yml` end-to-end and found it was not a valid promotion mechanism: it required the archive to match current `main` exactly, then copied the same files back. A changed feature-branch archive was rejected before synchronization.
- The workflow also held `contents: write`, created a rollback branch, used `rsync --delete` on `public/` and `lib/`, and could push to `main`, despite having no useful source-update path under its exact-parity gate.
- Removed this obsolete write-enabled self-sync workflow from the candidate. At that intermediate point the archive refresh and standalone audit still existed; both were later consolidated into `validate-project.yml`'s artifact-only job, and the separate audit workflow was removed. Source integration must happen through reviewed pull requests.
- Updated `verify.js` to assert that the obsolete workflow is absent and that the remaining archive audit is read-only, manually runnable, and checks safe paths plus exact public/library parity.
- Updated README, repository structure, deployment reference, documentation index, and changelog so they no longer describe ZIP-to-main synchronization as a supported release path.
- Exact candidate commit `fb40e735625f2a78da282fc59bb8768a72ea7419` passed Actions run [#45947805826](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45947805826): dependency install/tree verification, JavaScript syntax, full regression tests (including the new read-only archive assertions), production Docker build, and constrained HTTP/Socket.IO smoke all succeeded. The archive-refresh job was skipped intentionally because this was an ordinary push.
- The first run on the preceding workflow-removal commit exposed two incorrect regression-test string expectations; those expectations were corrected in the next commit. The exact latest run above passed. This was a test assertion correction, not an application runtime failure.
- The tracked ZIP is not certified current with the post-removal candidate because automatic refresh is disabled on ordinary pushes. If a release package is needed, the GitHub archive-refresh workflow must be explicitly dispatched on the intended branch, then the archive audit must pass. No manual file editing or upload is required.
- This is a candidate-branch repository/workflow change only. It does not alter `main`, merge PRs, deploy to Deplexo, or touch persistent data.


### ZIP workflow root-cause correction — 2026-11-27

- Reviewed `.github/workflows/unzip-upload.yml` end-to-end and found it was not a valid promotion mechanism: it required the archive to match current `main` exactly, then copied the same files back. A changed feature-branch archive was rejected before synchronization.
- The workflow also held `contents: write`, created a rollback branch, used `rsync --delete` on `public/` and `lib/`, and could push to `main`, despite having no useful source-update path under its exact-parity gate.
- Removed this obsolete write-enabled self-sync workflow from the candidate. The existing `validate-project.yml` archive refresh and `audit-rootfix-archive.yml` read-only archive audit remain. Source integration must happen through reviewed pull requests.
- Updated `verify.js` to assert that the obsolete workflow is absent and that the remaining archive audit is read-only, manually runnable, and checks safe paths plus exact public/library parity.
- Updated README, repository structure, deployment reference, documentation index, and changelog so they no longer describe ZIP-to-main synchronization as a supported release path.
- This is a candidate-branch repository/workflow change only. It does not alter `main`, merge PRs, deploy to Deplexo, or touch persistent data. The next push-triggered CI run must pass on the exact new commit before this change is considered validated.


### Post-removal tree and exact-head validation — 2026-11-27

- After removing the obsolete ZIP self-sync workflow, the refreshed recursive tree is SHA `c6548cadf97bd8799d9a8d71d6d2c1c24455b686`: **415 entries = 403 tracked files + 12 directories**; response not truncated.
- Root remains 17 files; `public/` remains 360 files; documentation remains 17 Markdown files; at that intermediate point two GitHub workflow files remained; the later artifact migration removed the standalone audit workflow, leaving only `validate-project.yml`.
- Re-scanned all 17 Markdown files after the workflow/docs changes: **zero broken relative links**. The five exact duplicate groups remain intentionally preserved. No nested project directory, extra root ZIP, or tracked database dump exists.
- Exact candidate commit `ad4aed52394f5344c3697a1a767c49a616413453` passed Actions run [#45947902148](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45947902148), including the updated repository regression assertions, Docker build, and constrained HTTP/Socket.IO smoke. Archive refresh was skipped intentionally on this ordinary push.
- This checkpoint-only correction will itself trigger another source-validation run; the archive refresh remains intentionally manual and must not be described as current until explicitly rebuilt and audited.


### Release ZIP moved out of Git — 2026-11-27

- Removed the 16 MB `rimaz-final-deep-audit-46.93.72.zip` from the tracked tree. It is a generated binary release package, not application source or a production-data backup; keeping it in Git had caused repeated archive-only commits and unnecessary root clutter.
- Removed the separate `audit-rootfix-archive.yml` workflow and consolidated safe-path, symlink, duplicate, CRC, compression-ratio, expanded-size, and exact tracked-file parity checks into `validate-project.yml`'s `build-release-archive` job.
- The release ZIP is now built only on explicit `workflow_dispatch` after the source-validation job passes, stored in runner temporary storage, extracted and tested with locked dependencies, regression tests, and Docker build, then uploaded as a 30-day GitHub Actions artifact. It is not committed to Git.
- The artifact job has `contents: read` permission and no Git push, bot commit, main synchronization, deployment, or live-data operations. Ordinary source pushes still update the branch directly and run source CI; they do not require a manual ZIP edit/upload.
- Added `.gitignore` protection and updated regression tests, README, repository structure, deployment reference, changelog, and checkpoint to enforce and explain this lifecycle.
- This is a candidate-branch packaging/organization change only. `main` and Deplexo remain untouched. Exact new-tree counts and CI results must be refreshed after this commit.


### Current repository tree after moving release ZIP to CI artifact — 2026-11-27

- Removed the tracked root release ZIP and the separate archive-audit workflow. The ZIP is now built in runner temporary storage by `build-release-archive` and uploaded as a 30-day GitHub Actions artifact only after source validation, archive safety/parity checks, extracted-project tests, and Docker build all pass.
- The current expected tree is **413 entries = 401 tracked files + 12 directories**; root is **16 files**, documentation is **17 Markdown files**, and `public/` remains **360 files**. The only workflow under `.github/workflows/` is now `validate-project.yml`.
- `.gitignore` excludes the former root ZIP path so it cannot be accidentally reintroduced. No archive binary is committed on ordinary pushes or manual artifact generation.
- The artifact workflow has read-only repository permission and does not write to `main`, push bot commits, deploy, or touch Deplexo/live data. Source integration remains pull-request based.
- This tree snapshot is a candidate-branch estimate until the new exact-head CI and fresh tree/link audit complete.


### Latest exact-tree validation note — 2026-11-27

- The latest checked source head before this documentation refresh was `67f05c8b5cdef080272f1178b98a12b2e6205929`, and Actions run [#45948606723](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45948606723) passed. The archive artifact job was skipped by design on a normal push.
- The new archive build/extraction Python blocks were syntax-compiled and exercised with a synthetic tracked-file repository fixture. This checks path splitting, ZIP generation, CRC, and extraction logic; it does not replace the first real `workflow_dispatch` artifact run.
- The next commit updates only this checkpoint and repository structure documentation; its own push-triggered validation must be checked separately.


### GitHub workflow-dispatch availability gate — 2026-11-27

- Confirmed the default branch `main` remains at `a2c74fded15ea5cfde38d310a84c3c8edfe994b3` and currently contains only `.github/workflows/unzip-upload.yml`; it does not yet contain `validate-project.yml`.
- PR #1 is still open/draft/unmerged, targets `main`, and includes `validate-project.yml` as the safety-workflow prerequisite. GitHub requires a manually dispatched workflow to exist on the default branch, so the new `build-release-archive` artifact job cannot yet be dispatched end-to-end.
- The new artifact job's workflow syntax is parsed by push CI; its embedded Python steps compile and passed synthetic archive-build/extraction fixture checks. A real artifact upload remains pending until the prerequisite workflow is approved and present on `main`; then the updated maintenance branch can be selected.
- No merge, default-branch update, Deplexo deployment, or live-data operation was performed.


### Overlapping draft PR disposition and safe integration order — 2026-11-27

- PR #2 is a repository-cleanup draft whose 11 changed paths are all contained in PR #3's 48-path candidate. Its description now marks it as superseded; it remains open/draft and must not be merged separately.
- PR #7 is an older 8-commit follow-up touching `server.js`, `verify.js`, and `lib/json-reader.js`. The current PR #3 tree already contains the evolved JSON streaming validator, verified last-known-good rotation, shutdown message retry, and regression fixtures. PR #7 is marked superseded and must not be merged independently, because it would reintroduce older versions of shared files.
- PR #8 is an older 697-commit chat-write retry branch based on the PR #7 line. Its message-queue retry, bounded admission, and shutdown handling are already present in the current PR #3 tree with additional checks. It is marked superseded and must not be merged independently.
- PR #1 is the safety-branch prerequisite targeting `main`. Its current diff still contains the legacy `unzip-upload.yml` write-enabled workflow. **Do not merge PR #1 in its current form.** The safe order is to finish review of PR #3, integrate its final tree into the safety branch, verify that PR #1 then reflects the final workflow set (including removal of the legacy sync workflow), and only then consider promotion to `main` with explicit approval.
- PR #2, #7, and #8 remain open drafts for now; none was closed, merged, or force-pushed. PR #3 remains the single candidate for the unified review. No changes were made to `main`, Deplexo, or live data.


### CI coverage and latest candidate verification — 2026-11-27

- A review found that pull-request path filters did not include `scripts/**`, even though `scripts/chat-integration-smoke.js` is part of the validation process. Added the missing path and a regression assertion so changes to CI smoke scripts trigger PR validation.
- Latest exact source head before this checkpoint update: `accd5e8d67b89ba0e5dfcd282f90ec70c951c411`; [Actions run #45949927455](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45949927455) passed dependency installation/tree verification, JS syntax, full regression tests, production Docker build, and constrained HTTP/Socket.IO integration smoke. The archive artifact job was skipped as expected on a normal push.
- A fresh recursive tree inspection of that exact head returned **413 entries = 401 file blobs + 12 directories**, not truncated; 16 root files, one workflow file, no symlinks, no tracked file over 5 MiB, and 360 public assets (115 gifts, 238 smileys, 1 VIP gift plus six other public files). No ZIP, nested project duplicate, or database dump is tracked.
- The repository tree diagram's escaped newline was corrected. All 17 Markdown files were rechecked for local relative links in the previous tree review; a fresh final link scan will be repeated after this checkpoint update.
- No merge, force-push, deployment, Deplexo operation, or live-data change was performed.


### Final documentation refresh validation — 2026-11-27

- The latest documentation-only refresh updated historical release/archive evidence to clearly distinguish the old tracked-ZIP process from the current artifact-only design, and recorded the superseded PR #2/#7/#8 and safe PR #1 integration order.
- Exact head `e752b8755b2d3411d7b635ab2db6ede62ac7b243` passed [Actions run #45950194769](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45950194769). Dependency installation/tree verification, JavaScript syntax, regression suite, Docker build, and constrained HTTP/Socket.IO smoke all succeeded. The optional artifact job was skipped as expected on a normal push.
- A fresh link scan of all 17 Markdown files found zero broken relative links and no escaped newline artifacts. Tree remains 413 entries (401 tracked files + 12 directories), 16 root files, and 360 public assets.


### Final repository-stage audit — 2026-11-27 09:22 Asia/Baghdad

- Re-fetched PR #3 and confirmed its exact current head is `cfbf94b8124de7a9d4d0b2c33a8b798eae6c4cbe`, base `safety/validate-and-backup-before-sync` at `67d162b9b84e1e8fd38a83659eadfd6b18fac451`. PR #3 remains open, draft, unmerged, and mergeable; GitHub reports 48 changed files and 860 commits ahead. No review submissions or inline review threads were returned. The unusually long commit history remains an integration-review concern; do not rewrite or force-push it.
- Exact recursive Git tree for `cfbf94b...` returned 413 entries (401 file blobs + 12 directories), not truncated: 16 root files, 17 Markdown files, 360 public files, and exactly one workflow (`.github/workflows/validate-project.yml`). No symlinks and no tracked files over 5 MiB were found. The nested project copy, root ZIP, and database dumps are absent.
- Re-fetched all 17 Markdown files from this exact tree and rechecked relative Markdown links: zero missing local targets. Historical mentions of removed workflows and the former ZIP remain in audit/checkpoint documents as historical context, not as active workflow references.
- Rechecked runtime/build boundaries: `.nvmrc`, `package.json`, and `Dockerfile` consistently target Node 24; `npm ci` is used by CI and Docker; `.dockerignore` excludes runtime database/data, uploads, private media, credentials, backups, and generated archives. Root `data.json` is still only the 138-byte warning placeholder and must never replace live data.
- Exact-head Actions run [#45950297579](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45950297579) completed successfully on `cfbf94b...`. The `validate` job passed locked dependency installation/tree verification, JavaScript syntax, the regression suite, production Docker build, and constrained HTTP/Socket.IO integration smoke. `build-release-archive` was skipped as designed on a normal push; the first real artifact upload remains pending until the workflow exists on `main` and an explicit dispatch is approved.
- The comparison against PR #3's base still shows the intended 48-path candidate, including removal of both obsolete workflows and the tracked ZIP. No gift/smiley/VIP catalog media was deleted or renamed. PR #1 must not be merged as-is because its current diff still contains the old write-enabled `unzip-upload.yml`; PRs #2, #7, and #8 remain overlapping drafts and must not be merged separately.
- `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No merge, force-push, branch rewrite, deployment, Deplexo restart, live-volume backup/restore, or production-data mutation was performed.
- **Repository-stage result:** the candidate tree is organized and source/CI validated. Promotion is not authorized by this audit: resolve the PR-history/integration order, then complete independent live-volume backup, isolated restore, browser/device staging, provider OOM/restart telemetry, and trusted-proxy confirmation before any production release.
## Follow-up verification — 2026-11-27 (restore integrity)

- A focused review found that `lib/restore-inspector.js` checked the types of core collections only when their keys existed. Missing `users`, `guests`, `rooms`, or `messages` could therefore pass preview inspection; the later restore normalizer fills absent fields from defaults, which risks replacing existing rooms or chat history with empty/default collections.
- Fixed the preview inspector to require all four core collections and their correct object/array types before a restore preview can be accepted. This is a validation-only guard; it does not alter existing valid backup data or the live database.
- Added regression cases to `verify.js` for each missing core collection. The tests assert that every incomplete backup is rejected with the core-database-structure error before confirmation.
- The database-only backup uploaded for this audit parsed successfully. Its 11 distinct `/uploads/` paths were all covered by the current media-reference field allow-list; the derived `rankArt`/`rankBanner` references duplicated canonical `artUrl`/`bannerUrl` paths, so no media-field expansion or asset deletion was justified.
- Commits on `fix/bound-private-media-ticket-cache`: `0d5ce57c6ecbd72b68bd7c76ffd6b348e6f3417f` (inspector guard) and `66e8e257121dc5a207ebf52e8b8e943a56e6a821` (regression tests). The first push run was cancelled when the follow-up test commit arrived; exact-head run [#45953752418](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45953752418) then completed successfully. The regression suite, locked install, syntax checks, production Docker build, and constrained HTTP/Socket.IO smoke all passed.
- In the 128 MiB / 0.25 vCPU CI container, the concurrent HTTP, Socket.IO, and streamed-media workload recorded cgroup memory current `93,454,336` bytes and peak `108,322,816` bytes against a `134,217,728`-byte limit. This is controlled CI evidence only, not a measurement of Deplexo production memory.
- PR #3 remains open and Draft, based on `safety/validate-and-backup-before-sync`; no merge, deployment, restart, force-push, live-volume access, or production-data mutation was performed. Production media-file existence and Deplexo OOM/restart history remain unverified.


## Follow-up checkpoint — clean review candidate and backup preflight (2026-11-27)

- The original PR #3 was closed as superseded after its exact candidate tree was reproduced without rewriting its history. Its branch `fix/bound-private-media-ticket-cache` and all commits remain intact.
- Replacement PR #9 is open and draft: `review/rimaz-clean-integration-2026-11-27` → `safety/validate-and-backup-before-sync`. It contains the same exact application/repository tree as the prior candidate, verified by matching Git tree SHA before commit creation. It is 3 commits ahead of base (one clean tree snapshot plus two subsequent root-fix/test commits), rather than the prior branch's 867-commit history. The diff remains 48 files.
- Current exact code/test head: `569868497355df2e135f47ce9a1f31d195b86fc6`.
- Actions run [#45956295941](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45956295941) passed on that exact head: locked install, dependency tree, syntax, full regression suite, Docker build, and constrained HTTP/Socket.IO integration smoke.
- The constrained CI smoke reported cgroup memory current **67,649,536 bytes** and peak **82,264,064 bytes** under a **134,217,728-byte** limit (128 MiB), with the container still running and not OOM-killed. This is isolated CI evidence only, not Deplexo production telemetry.
- The upload cleanup regression now verifies that a referenced upload remains, an orphan inside `UP_DIR` is removed, and a path outside `UP_DIR` is preserved.
- Full-backup endpoints now preflight the database and referenced-media snapshot before sending archive headers. If a referenced public upload is missing/invalid, the endpoint returns HTTP 409 with a clear error before starting a partial gzip archive. The backup remains fail-closed; it does not silently remove database references or claim an incomplete archive is valid.
- The historical missing-media filename from the supplied Deplexo logs is not present in the user-provided 2026-11-27 database backup's current upload references. The uploaded JSON backup does not contain media bytes, so it cannot restore a missing physical file. If the same issue is confirmed against the current live volume, recovery requires the corresponding media file from an older verified full backup or a separately verified copy; do not delete its database reference or alter live storage speculatively.
- Production remains separate from this review branch. The Deplexo dashboard previously showed deployed commit `15559a9` on `fix/bound-private-media-ticket-cache`; no deployment, restart, merge, `main` update, or live-data operation was performed during this follow-up.
- Remaining release blockers are unchanged: independent backup of the persistent volume, isolated database+media restore drill, staging browser/device tests, Deplexo restart/OOM evidence under representative load, trusted-proxy verification, and explicit approval before promotion.
