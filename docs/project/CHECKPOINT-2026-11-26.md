# Rimaz — continuation checkpoint (2026-11-26)

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
