# Rimaz Chat 46.93.72 — Repair candidate notes

This is a conservative repair candidate based on source archive commit `368c563d63ccf669f5f273aabe290fe39a7fa2d7` (baseline package `46.93.71`). It does not modify the production deployment or production data.

## Repairs

1. Session anti-spam windows are removed after the reconnect grace period only once session deletion is saved. A periodic orphan sweep removes entries that no longer have a live socket or a pending reconnect timer. Logout and successful restore clear transient session maps.
2. Database restore upload no longer uses Multer memory storage. It stages the file in `DATA_DIR/.restore-tmp` with restrictive permissions, retains only a path and summary in the preview map, limits pending previews to two, revalidates at confirmation, and removes staged files after confirmation or expiry. Stale staged files are removed on startup because preview tokens are process-local.
3. Restore confirmation now prepares the audit entry and writes the replacement before deleting the staged preview or disconnecting live sockets.
4. Presence snapshots index sessions by room, so each room count scans only that room's active sessions. Hidden/ghost visibility checks remain viewer-specific.

## Validation

- `node --check` passed for all JavaScript files.
- `npm test` passed 448 regression checks on local Node.js v22.16.0. The production runtime reports v20.20.2; that exact runtime was not available for a local repeat.
- No HTML, media asset, feature, or persistent data schema was removed.
- No live Deplexo test has been performed. Production behavior under concurrency and a real restore still require staging verification.

## Deployment precautions

- Keep a fresh backup of the live persistent database and uploads before deployment.
- Do not replace the live persistent `DATA_DIR` database with the ZIP's `data.json`; the archive's `data.json` is a placeholder.
- Deploy this candidate to a staging instance first. Verify login/reconnect, public/private chat, rooms, voice/video calls, uploads, backup preview/confirm, and memory readings before promoting it.
- This ZIP is a source candidate only; it has not been pushed to GitHub or published on Deplexo.
