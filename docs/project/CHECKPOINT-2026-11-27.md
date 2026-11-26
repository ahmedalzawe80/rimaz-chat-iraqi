# Rimaz checkpoint — 2026-11-27

## Current working state

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- Current application-source candidate: `9806c753cae67fd108830d30a3a94a7265156036`.
- Current documentation branch tip: `179ea98fa30f653d0cab52341601b787b942ac14` (documentation-only commits after the validated source/archive candidate).
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

- After the source-validation/archive commit `2fcb9e8553f58db625b78666174f5c75f1a9bfd0`, two documentation commits updated this checkpoint and the release gate. At the latest check, branch tip was `2665b39be163b0ee53e34091c8116a7dd35e23cd`, and the only changes since the archive commit were those two Markdown files.
- The archive refresh bot commit for these later documentation-only changes had not appeared at the latest check. Do not claim the ZIP is byte-for-byte current with the documentation tip until a new archive-only bot commit appears. The application source candidate itself remains the validated `9806c753...`.
