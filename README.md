# دردشة ريماز عراقية — Version 24

Built from `RIMAZ_CHAT_V23_ROOM_LOCK_COLORS.zip`. This patch preserves the V23 room-lock UI/server verification and the agreed room themes, while correcting the storage-directory fallback so the server does not silently switch to ephemeral `/tmp` storage.

## Important for Deplexo
- Ensure persistent storage is mounted at `/data`.
- Do not delete the existing persistent data volume.
- Do not overwrite the live `data.json` with the small default `data.json` included in this source archive.
- This package passed Node syntax checks; it has **not** been integration-tested against the live Deplexo deployment.

## Run locally
`npm install` then `npm start`.

## Permission-system update (October 2026)
- Permission editor is grouped by operation; moderation actions, announcement publishing/deletion, wall stop/restart/clear/per-user deletion, and room transfer are separate permissions.
- Existing saved role permission arrays are migrated from bundled `moderation` and `announcements` keys to the individual permissions. The legacy combined wall toggle is migrated to allow both stop and restart.
- Default rank exceptions follow the requested matrix: admin-full has all permissions; الإداري excludes rank management and reset likes; gold banner excludes IP, rank management, reset likes, and giving likes; silver banner additionally excludes wall controls; black super additionally excludes room transfer; white super additionally excludes global kick and mute; red super additionally excludes avatar deletion.
- Owner-target protections are enforced server-side, including room transfer and member actions. Room transfer rejects invalid destinations, offline targets, and attempts to move a member to the same room.
- This is a source package, not a live deployment. Deploy the code while preserving the existing persistent `/data` volume and its live `data.json`.
