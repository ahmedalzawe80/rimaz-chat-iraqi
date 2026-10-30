# Rimaz v46.5 — Rank Manager + Member Profile Integration

## Focus of this update
This release fixes the missing connection between **إدارة الرتب** and the single-member profile opened from the chat.

### Member profile changes
- The member profile now refreshes its rank list from the server's `rankDefinitions` before rendering the rank selector.
- Newly created custom ranks in **لوحة الإدارة → الرتب** are therefore available in **بطاقة العضو / إدارة عضو** as well as the admin rank manager.
- The member profile shows the currently assigned rank and preselects it in the selector.
- The existing duration input remains `0 = دائم`; positive whole numbers remain days.
- Saving a rank still uses the existing `/api/admin/rank` server endpoint, preserving server-side permission checks and audit behavior.

## Scope protection
No chat message rendering, chat colors, member button layout, gift behavior, likes behavior, or unrelated admin controls were intentionally changed. Only the rank data synchronization and display in the single-member profile were changed in the UI.

## Deployment
1. Back up the live application and persistent data.
2. Replace `server.js`, `index.html`, and `public/index.html` with the packaged versions. The server file is included unchanged from v46.4 because the correction is in the profile UI's rank-definition loading path.
3. Keep the existing live data file and `uploads/` directory. Do not overwrite persistent data.
4. Restart the Node app and sign in again.
5. Create a custom rank in **لوحة الإدارة → الرتب**, then open a specific member's profile from the chat. The new rank should appear in the rank selector there.

## Validation
- `node --check server.js` passed.
- All inline JavaScript blocks in `index.html` passed `node --check`.
- `public/index.html` is byte-identical to `index.html`.
- Static assertions confirmed that the single-member profile calls `syncRankDefinitions(d)` before building the rank selector and that the current rank is preselected/displayed.
- This package was not live-tested against the hosted Deplexo instance or its production database.
