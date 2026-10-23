# دردشة ريماز عراقية — Version 24

Built from `RIMAZ_CHAT_V23_ROOM_LOCK_COLORS.zip`. This patch preserves the V23 room-lock UI/server verification and the agreed room themes, while correcting the storage-directory fallback so the server does not silently switch to ephemeral `/tmp` storage.

## Important for Deplexo
- Ensure persistent storage is mounted at `/data`.
- Do not delete the existing persistent data volume.
- Do not overwrite the live `data.json` with the small default `data.json` included in this source archive.
- This package passed Node syntax checks; it has **not** been integration-tested against the live Deplexo deployment.

## Run locally
`npm install` then `npm start`.
