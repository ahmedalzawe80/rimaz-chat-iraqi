# Rimaz v46.8 — Unified Rank Selector + Daily ADMIN Authority Hotfix

## What changed
- The daily `ADMIN` account can grant the legacy `الإداري` / full administrator rank. The former owner-only rejection for administrator-rank grants has been removed. The account that owns the site remains protected as a target.
- The daily ADMIN retains the full operational permission set already provided by the server's `isAdmin` / `hasPermission` model. This update aligns rank granting with that model instead of adding a second owner-only rule.
- Both member-profile administration renderers now use the same server-synchronized rank definitions and the same select-list workflow. Custom ranks created in **لوحة الإدارة → الرتب** appear in both places.
- The member-card rank selector has a single select + duration + save control, matching the reference member-management flow. `0` remains permanent; positive integers remain days.
- Temporary staff-rank grants now remember and restore the account's previous base role on expiry or when replaced/cleared, instead of always demoting the member to `member`.
- The daily ADMIN can edit built-in rank definitions and their icons. Built-in rank IDs/base roles remain fixed and built-in ranks remain undeletable; the owner account remains protected from admin actions.

## Scope protection
No chat colors, message rendering, member button layout, gifts, likes, or other unrelated chat UI behavior was intentionally changed. The only UI edits are the rank selector and the rank-management wording/actions.

## Deployment
1. Back up the live app and persistent data.
2. Replace `server.js`, `index.html`, and `public/index.html` from this package.
3. Keep the existing persistent data file and `uploads/` folder.
4. Restart the Node application, then hard-refresh the browser.
5. Sign in with the daily `ADMIN` account, open **إدارة الرتب**, then open a member card. Confirm that the rank dropdown is the same list and test granting **الإداري** with duration `0`.

## Validation performed
- `node --check server.js` passed.
- Both inline JavaScript blocks in `index.html` passed `node --check`.
- `index.html` and `public/index.html` are byte-identical.
- Static checks confirm the explicit owner-only rejection for granting `baseRole: admin` is gone, owner-target protection remains, and both member-card renderers use `rankChoices()`.
- This package has not been live-tested against the hosted Deplexo instance or its production database.


## v46.8 hotfix
- Explicitly treats both the site owner and authenticated ADMIN role as authorized to grant elevated administrator rank definitions.
- The previous owner-only error branch is absent from this server build.
- Deploy `server.js` from this package and restart the Node process; replacing browser HTML alone cannot remove a server-side authorization response.


## v46.9 — Member card cleanup
- Renamed the room/group filter placeholder from the incorrect `البحث في الصلاحيات` to `البحث عن غرفة أو مجموعة` in both member-card renderers. Search behavior remains the same: it filters the room list.
- Fixed the older/reference member-management card: Likes and Points are editable numeric fields and both Save buttons now call the existing `/api/admin/member-stats/:name` endpoint. The previous Points button only displayed a warning toast and did not save; the previous Likes button added a fixed 10 instead of saving the number shown.
- Removed a duplicate room-transfer action from the older card; the room selector + password + Transfer form remains the single transfer workflow.
- Kept `index.html` and `public/index.html` identical.
- Validation: server and both inline browser scripts pass Node syntax checks; stale incorrect placeholder and no-op stat-save handlers are absent. Not live-tested on the hosted instance.
