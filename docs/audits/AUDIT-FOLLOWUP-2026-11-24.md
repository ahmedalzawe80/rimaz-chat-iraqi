# Rimaz runtime follow-up audit — 2026-11-24

> **Historical snapshot (2026-11-24).** This audit describes the source and deployment evidence available on its review date. It is not the current branch or production status. For the latest repository state, see the [2026-11-27 checkpoint](../project/CHECKPOINT-2026-11-27.md) and [repository cleanup inventory](REPOSITORY-CLEANUP-INVENTORY-2026-11-26.md).

## Scope
Read-only review of the working branch `safety/validate-and-backup-before-sync` after the Deplexo deployment/log review. No runtime source changes, no deployment, no restart, no production data access, and no destructive workflow execution were performed.

## Verified source snapshot
- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Reviewed deployment-related commit: `90950c3f7dce5e0d03c98806523f387cac85d78c`
- Reviewed `server.js` blob SHA on the working branch: `7e704c04b90be09510e8a5b3a2743ac30c3a6c63`
- `server.js` contains 2,021 lines in this snapshot.
- `package.json` version is `46.93.72`.

## Private-media ticket finding
- `POST /api/private/media-ticket` creates a random 32-byte token and stores its filename, account binding, and 15-minute expiry.
- `GET /api/private/media-stream/:filename` declares `const ticket = privateMediaPlaybackTickets.get(token)` before reading its properties.
- The stream route validates expiry, exact filename, account participation in the message, and file path before sending the file.
- The in-memory ticket map has a 5-minute expiry sweep; the timer is unref'd.
- Regression checks explicitly cover token randomness/expiry/account+filename binding, authorization recheck, and the historical undefined-ticket pattern.
- Therefore the historical Deplexo `ReferenceError: ticket is not defined` is not reproduced in this source snapshot. The log's old line/stack mapping still needs to be matched to the exact deployed source/image. Do not patch this route based only on the old stack trace.

## CI evidence
- GitHub Actions validation job `138031219551`: completed successfully.
- Archive audit job `138031176775`: completed successfully.
- The validation log contains 448 successful checkmarks and ends with: `All local static and archive checks passed. Live-server testing is still required.`
- The suite includes a regression check: `private ticket route no longer references an undefined ticket before creation`.
- These are static/local regression checks; they do not prove the deployed container is healthy or reproduce live network/runtime behavior.

## Memory and I/O observations — hypotheses, not confirmed causes
1. `save()` creates a shallow snapshot, then calls `JSON.stringify(snapshot)` on the entire database and performs synchronous temporary-file write + rename. Peak memory and event-loop blocking can therefore grow with the serialized database size. This is a plausible load/latency risk, not proof of a leak or OOM.
2. Chat message persistence is coalesced by a 350 ms timer; public chat messages are capped at 1,000 entries. This reduces writes during message bursts but does not bound every other database collection.
3. The authenticated `GET /api/admin/health` endpoint reports app version, Node version, uptime, DB file size, upload file count/bytes, heapUsed, heapTotal, external, arrayBuffers, RSS, online users, rooms, and enabled modules. It also recursively scans the upload directory synchronously on each request. Avoid polling it rapidly; take occasional snapshots.
4. Public-content cleanup runs at startup and every five minutes. Its log messages alone do not establish a restart or memory leak.
5. No production heap/RSS trend, OOM event, exit code, or health-check termination reason was available in this audit.

## Next evidence required from Deplexo
- Latest deployment's exact source commit and image digest, plus deployment timestamp.
- Instance/container event details around each restart: exit code, OOM indicator, health-check failure, termination reason, and instance count.
- Fresh logs after the deployment at commit `90950c3f7dce5e0d03c98806523f387cac85d78c`, especially whether `ticket is not defined` appears again.
- If the owner can access `/api/admin/health`, capture occasional measurements at a few-minute interval under normal load: `uptimeSeconds`, `dbBytes`, `uploads.bytes`, `heapUsed`, `heapTotal`, `external`, `arrayBuffers`, and `rss`. Redact member names and private content.

## Safety status
- No application runtime code was changed.
- No merge to `main`, production restart, deployment, or ZIP sync was performed.
- The manual ZIP workflow still contains `rsync -a --delete`; do not run it without reviewing the exact archive, runtime-data exclusions, and a verified restore procedure, followed by explicit user approval.


## Subsequent follow-up — admin-data permission routing (2026-11-24)

A later review of the current working branch found a shadowed permission rule in `permissionForAdminPath`: an early `/api/admin/data` condition always returned `panel_access`, making the later `ALL_PERMISSION_KEYS` rule unreachable. This contradicted the route's own permission-filtered payload and the existing regression-test intent.

- Corrected the route mapping to return `ALL_PERMISSION_KEYS` directly before the other route mappings. The handler still filters every data group according to the caller's actual permissions; this does not grant additional capabilities to the caller.
- Added a regression assertion that verifies the all-permissions mapping is reachable before the remaining route rules and that the shadowing conditional does not return.
- Source fix commit: `9ec6ebbf71a2467aee67115a37e33cc9950c93df`.
- Regression-test commit: `a7bfce38ebdbebf10495c1a063d89a0fbf15b578`.
- Exact-source validation run [#704](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45469789989) succeeded: 603 checks, zero failures, locked dependency verification, JavaScript syntax, and production Docker build.
- The post-validation archive job also succeeded: 394 files, 16,357,277 bytes, extracted-archive validation with 603 checks and zero failures, Docker build, and npm audit with 0 vulnerabilities.
- Archive-only head after CI: `a49f10afcda33eac55ea974c60ee57e866f4e28c`.

This follow-up changes the historical "read-only/no runtime changes" statement above only for the later commits listed here. It does not represent live-server or production verification. `main` remains unchanged, PR #3 remains draft/open/unmerged, and no Deplexo deployment, restart, ZIP sync, or live-data modification was performed.

## Superseding repository and archive check — 2026-11-24 19:42 UTC

The opening sections above preserve the original read-only runtime audit and its historical branch snapshot. The current source candidate and release boundary are:

- Source/documentation candidate `7b47b00f662867b89e17ef1597337eb697166eba` passed [Actions run #708](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45472720285), including 603 regression checks with zero failures and a successful production Docker build.
- The extracted archive passed its own 603 regression checks, HTML parity, Docker build, and production dependency installation with zero reported vulnerabilities.
- Latest archive-only commit: `50c61f0d55513e3840ea71fdff14e609042fa2ed`, changing only the ZIP (16,359,829 bytes).
- The current tree contains no nested duplicate project directory and only one release ZIP. The removed nested `data.json` and Google verification file were compared against retained copies and were byte-identical; the root placeholder and root/public verification files remain.
- PR #3 remains draft/open/unmerged on `safety/validate-and-backup-before-sync`; production `main` remains unchanged at `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`.
- The source and archive are CI-validated only. No Deplexo deployment, live-volume backup, restore, or staging runtime test has been performed. Those remain mandatory before promotion.
