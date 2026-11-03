# Rimaz Chat v46.42 — Wall Media Left Alignment Root-Cause Fix

## v46.42 changes
- Fixed the actual cause of the wall media button staying on the right: the wall overlay root was missing the `wallOverlay` class, so the existing left-alignment selectors never matched.
- Added the class to the wall overlay root and removed obsolete wall selectors from the earlier mixed private/wall CSS patch. Private-chat media styling remains unchanged.
- Extended regression verification to assert that the wall overlay root carries the class required by the left-alignment rules.
- No changes to login, duplicate-name handling, ban timers, uploads, stored data, or other wall behavior.

## Validation
- `node --check server.js`
- `node --check verify.js`
- `npm test`
- `index.html` and `public/index.html` remain byte-identical.

---

# Rimaz Chat v46.41 — Wall Media Alignment, Entry Feedback, and Ban Timer

## v46.41 changes
- Pinned the wall image/video "view" action to the left edge without changing private-media controls.
- Duplicate registration/guest names now return the exact message `هذا الاسم موجود`, displayed inline on the entry page.
- Global five-minute bans show the live remaining time (minutes and seconds) on the entry page whenever the member attempts to return before expiry. The forced return also carries the server-calculated remaining time.
- Audited the current source for dead/duplicate logic: removed the unused `server.js.orig` backup and a duplicated media-scope guard. Kept separate room-ban behavior unchanged.
- Repaired the verification command and verifier root path so `npm test` runs from the project root; mirrored `index.html` to `public/index.html`.

## Validation
- `node --check server.js`
- `node --check verify.js`
- `npm test` — all local static/regression checks passed.
- Live hosted-server testing with the production database and multiple accounts remains required.

---

# Rimaz Chat v46.34 — Reference Rank-Grant Card

## v46.34 changes
- Refactored gift and rank-award popups to use one shared card renderer, so the frame, colors, spacing, sender identity placement, and confirmation button remain identical.
- Rank grants now deliver a dedicated `rank-granted` event with the giver's avatar, display name, rank badge, role, awarded rank name, and duration. The recipient sees the reference-style centered card with the rank emblem and name instead of the old generic admin notice.
- The saved notification-center record remains available; the old generic popup for rank grants is no longer emitted, preventing duplicate notices. Other administrative notices continue using their existing flow.
- Existing gift-card behavior is preserved through the shared renderer. Removed unused legacy gift-animation styles; only the shared popup shell and reference-card layout remain.

## Validation
- `node --check server.js`
- `node --check verify.js`
- `npm test` — includes the v46.34 rank-card regression check.
- `index.html` and `public/index.html` remain byte-identical.
- Static tests do not replace live multi-account verification on the hosted server.

---

# Rimaz Chat v46.33 — Seven-Rank Protection and Exclusive Badges

## v46.33 changes
- Added one server-side hierarchy check for the seven built-in ranks, from Super Red through the two administrator tiers. A lower rank cannot act on a higher rank; a higher rank can act on a lower rank. Equal ranks are not blocked by this hierarchy rule.
- The new comparison applies only when both actor and target are within the built-in rank ladder. Ordinary members and guests are not added to the new protection system.
- The site-owner account remains outside the new comparison and the existing owner-protection logic was retained.
- Applied the hierarchy check to member-card actions, room/global moderation, profile-name and profile-color changes, avatar removal, rank/role assignment, gifts/VIP, likes, and room moves. Checks run on the server, not only in the browser.
- A rank now always takes precedence over gifts and VIP. A gift replaces an older gift or VIP; VIP replaces an older gift; neither can replace an active rank. The legacy member-action gift path now replaces the old gift instead of accumulating multiple gifts.
- Added regression checks for rank ordering, owner/member exclusions, moderation/profile routes, and exclusive gift/VIP/rank behavior.

## Validation
- `node --check server.js`
- `node --check verify.js`
- `npm test` — all local checks passed.
- `index.html` and `public/index.html` remain byte-identical.
- Static/regression checks do not replace live testing with the production database and two logged-in rank accounts. Test the Super Red → Admin block and Admin → Super Red allow behavior on staging before production rollout.

---

# Rimaz Chat v46.31 — Online Members CSS Cleanup and Unified Layout

## Current changes
- Reworked the entry page toward the supplied legacy Iraqi chat reference: compact black masthead with B mark and refresh control, burgundy banner, three RTL login tabs, compact login form, and long online-member rows.
- Removed the four legacy quick-link buttons from the entry screen as requested.
- Replaced the entry-banner portrait image URL with a different portrait.
- Removed visible hidden/ghost entry controls. Five taps on the B logo reveal a private modal with exactly two choices: hidden login and ghost login.
- Added `/api/login-privileged`: hidden access is checked on the server for staff or accounts with `panel_access`; ghost access is owner-only. These modes are not authorized by client-side flags.
- Hidden and ghost sessions are excluded from public online rosters, live online state, room online counts, and automatic join/leave presence notices while retaining normal chat transport.
- `index.html` and `public/index.html` are kept identical.

## Validation
- `node --check server.js` passed.
- `npm test` passed, including a new regression check for privileged login and hidden online visibility.
- ZIP integrity checked after packaging.
- This is local static verification only; production login, database, mobile rendering, and two-account visibility still require staging/live-server testing.

---

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
- `node --check verify.js`
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
- Validation: `node --check server.js`, `node --check verify.js`, and `npm test` passed. Live hosted-server testing remains outstanding.


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


## v46.28.0 — Role-specific admin visibility and gift notice
- Added Arabic labels for audit log, site statistics, chat word filter, and member status permissions in both rank editors.
- Added permission schema/version metadata to permission and rank catalogs.
- Added client preflight checks before saving permissions or custom rank definitions, with clear Arabic compatibility errors.
- Preserved the existing persistent `data.json`; do not replace live site data with the ZIP placeholder.


## v46.31.0 — Online members CSS cleanup and unified layout

- Removed six overlapping legacy online-members style blocks and the conflicting mobile/name-size overrides.
- Replaced them with one scoped stylesheet for the in-chat members panel.
- Standardized row order: status bar, avatar, rank badges, name with status underneath, likes, country flag.
- Anchored the name/status column immediately beside the rank badges; kept the private-contact list rules separate.
- Updated static verification to reject the removed legacy style blocks and check the unified layout.

## v46.30.0 — Online member status and exclusive member badges

- Force the online-members panel to render each member status directly below the member name; scope the final CSS override to that panel only.
- Make gift, VIP, and visual rank mutually exclusive: a newly granted distinction replaces the previous one.
- A new gift replaces the previous gift instead of accumulating multiple visible gifts.
- Restore a member's previous base role when a gift or VIP replaces a staff-like visual rank, and synchronize active sessions after durable save.
- Normalize legacy profiles at startup so existing active ranks suppress old gifts/VIP, and active VIP suppresses old gifts.
- Keep the general chat, private chat, wall, room rows, and other layouts unchanged.


## v46.44 — Current-room indicator
- Added a slim blue vertical marker at the far-left edge of the room row the current viewer is occupying.
- The marker follows the viewer's active room when they switch rooms and is absent when they are outside a room.
- The marker is rendered from each viewer's own active room state, so it applies to every member and guest without account-specific rules.
- No crown, extra icon, row-width, room-image-size, or room-order changes. The marker overlays the existing row and does not alter its layout dimensions.
- Validation: `npm test` and JavaScript syntax checks. Live multi-account/browser confirmation remains recommended.
