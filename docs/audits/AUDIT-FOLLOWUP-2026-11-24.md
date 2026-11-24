# Rimaz runtime follow-up audit — 2026-11-24

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
