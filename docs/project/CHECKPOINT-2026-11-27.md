# Rimaz checkpoint — 2026-11-27

## Current working state

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- Current source candidate: `d83422e5f58f59f0e089649f4908f97a81876469`
- PR #3 remains open/draft/unmerged. Do not merge or deploy from this checkpoint.
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