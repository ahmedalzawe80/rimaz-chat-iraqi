# Rimaz Chat v46.24 — WebRTC Signaling Hardening

## v46.24 changes
- WebRTC signaling now validates SDP offer/answer structure and caps SDP payloads at 100 KB; ICE candidates are shape-checked and capped at 4 KB.
- Signaling is relayed only between two currently connected peers after the server has authorized an offer; answers must come from the intended callee, and ICE relay requires the same active peer pair.
- Per-socket signaling events are rate-limited, stale call pairs expire, and pair/rate state is cleared on disconnect.
- Existing calling UI, 500-like eligibility, and call flow are preserved.
- Validation: `npm test` includes signaling authorization/payload regression checks. Real browser-to-browser WebRTC calls still require staging verification.

## v46.23 changes
- Role changes are now persisted before any socket/session notifications are emitted. If the database write fails, the member role and persisted session-role snapshots are restored and the request returns a controlled error.
- Role-permission edits now restore the previous role permission array, customization marker, and rank-definition metadata if persistence fails.
- Existing owner-target protection, role hierarchy, admin permissions, chat UI, and stored user data formats are unchanged.
- `npm test` includes regression checks for these rollback guarantees.

## Validation
- `node --check server.js`
- `node --check scripts/verify.js`
- `npm test`
- `index.html` and `public/index.html` byte-identical
- These are local checks; a hosted-server / production-database integration test is still required.

---

# Previous development notes (v46.22 and earlier)

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


## v46.10 — Member/guest profile card size only (2026-10-31)
- On mobile, increased the profile photo/card content height from 165px to 200px to match the supplied reference proportions.
- Kept the existing profile width, position, buttons, labels, colors, ordering, permissions, and all behavior unchanged.
- No server, database, rank, smiley, or chat behavior changes in this build.


## v46.11 combined profile-size and smiley fix
- Keeps the final mobile profile-photo height at 200px.
- Normal smiley picker is available to all visitors and members in public chat, private chat, and wall.
- `smileys_manage` remains required for admin management/upload only, not for using smileys.
- No button labels, ordering, colors, or unrelated features intentionally changed.

## v46.13 — Chat filter completion (2026-10-31)
- Added an administration panel for a configurable blocked-word / phrase filter, matching the filter-management section shown in the reference video.
- The filter can be enabled or disabled, stores up to 200 entries (60 characters each), removes duplicate entries, and persists in the existing JSON database.
- Enforces the filter on the server for both public room messages and private messages; it is not a client-only visual check.
- Existing installations migrate automatically with the filter disabled and an empty list. No existing user, room, message, rank, or upload data is reset.
- `index.html` and `public/index.html` are kept identical.
- Validation: `node --check server.js`, inline browser JavaScript compilation, and HTML-copy comparison passed. Live deployment/database integration has not been tested in this environment.


## v46.14 — Filter normalization + accurate live counters (2026-10-31)
- Improved server-side blocked-word matching to normalize Unicode compatibility forms, Arabic diacritics, tatweel, zero-width formatting characters, Alef variants, and Alef Maqsura before comparison. This reduces common visual/Unicode bypasses while retaining phrase matching.
- Kept enforcement on both public-room and private messages. Filter remains disabled by default unless enabled by an administrator.
- Added accurate stored-data counters to the admin data response: registered accounts, known guests, online users, stored public/private messages, wall posts, recorded admin operations, and rank changes.
- Updated the statistics panel to distinguish stored public and private message totals instead of presenting the last 100-message preview as a total.
- Synchronized `index.html` and `public/index.html`. No changes were made to owner/Admin protection rules, existing account data, subscriptions, or paid-rank behavior.
- Validation: `node --check server.js` and both inline scripts in `index.html` pass. This package has not been live-tested against the hosted server/database.


## v46.15 additions
- Added an admin member-status editor. Administrators with `profile_edit` permission can update a member status (up to 100 characters); changes persist and broadcast through `profile-changed`. The owner account remains protected.
- The status management endpoint is audited by the existing admin audit middleware.


## v46.16 — Audit log export and refresh
- Added a protected read-only endpoint to retrieve the latest 500 administrative audit entries without relying on the 200-entry preview embedded in the general admin payload.
- Added a refresh action to the audit panel so administrators can load the latest log entries on demand.
- Added CSV export (UTF-8 with BOM for Arabic spreadsheet compatibility), respecting the active search filter.
- No changes to rank, owner/Admin protection, subscriptions, payments, existing chat behavior, or stored user data.
- Validation: `node --check server.js`, inline browser script compilation, and equality check for `index.html` / `public/index.html` passed. Hosted-server and production-database tests have not been run.

## v46.18 — Repeatable local verification
- Added a dependency-free `npm test` verification script using Node's built-in modules.
- The script checks server syntax, compiles inline browser scripts, verifies the deployed HTML copies are identical, and validates package/data JSON.
- This is a development/quality improvement only: no chat behavior, permissions, ranks, owner protection, subscriptions, or stored data format was changed.
- Run `npm test` before deployment. Passing static checks does not replace a live server/database test.


## v46.19 — Consistent HTTP message moderation
- Closed a moderation gap in the authenticated HTTP room-message endpoint: it now applies the same server-side blocked-word/phrase filter as Socket.IO public and private message transports.
- Added a server-side 2,000-character limit to the HTTP message path so clients cannot bypass the normal message-size limit by calling the endpoint directly.
- Extended `npm test` to verify that HTTP, Socket.IO public, and private message paths all enforce the filter, and that the HTTP path applies the length limit.
- No owner/Admin protection, role, subscription, or existing data behavior was changed.
- Validation: `node --check server.js`, `node --check scripts/verify.js`, and `npm test` passed. Live hosted-server testing remains outstanding.


## v46.20 — Upload hardening
- Replaced client-controlled upload filename extensions with server-generated extensions derived from a strict image/video/audio MIME allow-list. This prevents an uploaded file from being stored under an executable extension such as `.html` just because the client supplied that filename.
- Added an 8 MB limit for profile/room images and a 50 MB limit for general media uploads; limited each request to one file and bounded multipart fields.
- Rejected uploads now receive controlled JSON errors, including an explicit 413 response for oversized files.
- Temporary files are removed when media is rejected by policy checks (for example, private-media eligibility, wall settings, unavailable recipients, or unsupported scope), avoiding orphaned disk usage.
- No chat layout, rank, role, account, owner-protection, or subscription behavior was changed.
- Validation: server syntax, browser inline scripts, HTML-copy equality, data/package JSON, and upload-hardening static checks are covered by `npm test`. A live hosted-server test and actual image/video/audio playback test remain required before deployment.


## v46.21 — Wall reaction integrity
- Prevented repeated likes from the same account on the same wall post. The endpoint is idempotent: repeat requests return the existing count without increasing it again.
- Existing post counts are preserved; the first like after this update is recorded in a per-post `likedBy` list.
- Save failures roll back the in-memory liker/count update and return a controlled error.
- Validation: `npm test` includes a static check for the unique-like guard. Live multi-account behavior still needs staging verification.


## v46.22 — Persistence, upload integrity and room-send authorization
- Database writes now use a unique temporary file, `fsync`, and atomic rename so an interrupted write cannot truncate the last good database file.
- Startup no longer silently replaces malformed database JSON with empty defaults. It preserves a recovery copy and stops instead of risking silent account/message loss; a missing database still initializes normally.
- Private attachments are moved into a separate non-public storage directory; a session-authenticated endpoint checks that the requester is the sender or recipient. Legacy private attachments are migrated automatically, and the private-chat UI fetches them with the session header.
- Uploaded image/media files are checked against their actual file signatures (PNG/JPEG/GIF/WebP/BMP/AVIF, MP4/WebM/Ogg, MP3/AAC/WAV) after upload, rather than trusting only the client-provided MIME header. Rejected files are removed.
- Private conversation cleanup now rolls back safely on database errors and removes private attachment files only after the history deletion is committed.
- Announcement fan-out now commits the announcement and all room copies in one database write before broadcasting, avoiding partial multi-room delivery.
- Logout revokes every live socket attached to the logged-out session; global bans disconnect active sockets and block private-message/media sends.
- The HTTP room-message fallback now requires the same authenticated session to have an active Socket.IO membership in the requested room, closing a path that could bypass locked-room entry.
- Fixed upload cleanup and rollback around smiley uploads, room image replacement/reset, and profile avatar changes so failed saves do not orphan new files or delete the last working image prematurely.
- Added rollback on persistence failure for in-memory public/private message and wall-post mutations.
- No changes were made to the owner/Admin protection model, rank permissions, subscription behavior, or chat UI.
- Validation: static checks and focused signature/atomic-write tests are included in `npm test`; live deployment and browser media playback still require staging verification.

## v46.25.0 — Room administration integrity

- Admin room creation now validates names and capacity limits and rolls back the in-memory room if persistence fails.
- Lock/unlock operations restore the previous password-hash state when persistence fails.
- Room edits reject duplicate names and restore the full previous room record on save failure.
- Room deletion restores the room and its moderation metadata if persistence fails.
- Added regression checks for all five room-administration failure paths.

Run `npm test` before deployment. These local checks do not replace staging tests against the target Node.js version, persistent volume, and real database data. Back up `/data` before upgrading.


## v46.26 — granular permissions for added admin tools

- Added independent rank permissions for audit log viewing/export, site statistics, chat word-filter management, and member-status management.
- These permissions are editable by the owner/admin for every built-in rank, including Super Red; rank color/level no longer blocks assigning these capabilities.
- The admin data endpoint returns a reduced payload for staff who only have one of these section permissions.
- The owner/admin remain the only accounts allowed to edit rank permission sets; protected owner-account actions remain protected.


## v46.27.0 — Permission editor compatibility
- Added Arabic labels for audit log, site statistics, chat word filter, and member status permissions in both rank editors.
- Added permission schema/version metadata to permission and rank catalogs.
- Added client preflight checks before saving permissions or custom rank definitions, with clear Arabic compatibility errors.
- Preserved the existing persistent `data.json`; do not replace live site data with the ZIP placeholder.
