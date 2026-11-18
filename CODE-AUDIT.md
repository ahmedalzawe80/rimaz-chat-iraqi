# Rimaz Chat — v46.93.37 Code Audit

## Scope

Audited the v46.93.36 project source and made a focused corrective release for the live-presence model, room membership counts, private-chat unread state, wall unread state, country flags, and disconnect/reconnect lifecycle. The audit covered `server.js`, both browser entry files, database defaults, relevant HTTP endpoints, Socket.IO handlers, and the regression suite.

## Confirmed defects and corrections

### 1. Socket ownership and disappearing members

**Defect:** `socketUsers` is keyed by the authenticated session token, but the disconnect handler previously deleted that key without checking whether the disconnecting Socket.IO connection still owned it. If an older/replaced socket disconnected late, it could remove the newer socket's active session entry. This could make the member disappear and make the online counter jump incorrectly.

**Correction:** Each active entry now records the owning `socket.id`. Presence projections accept only a connected socket whose ID matches the active session owner. `socketBySession()` resolves only that socket. Disconnect cleanup returns immediately when the disconnecting socket is no longer the owner. Stateful Socket.IO actions reject stale sockets.

### 2. Inconsistent online and room counts

**Defect:** The global online list deduplicated accounts, but room counts counted active session IDs. A person with multiple tabs/sessions could therefore be counted differently in the global list and room list.

**Correction:** Global online and per-room counts now use the same active-session projection and deduplicate by normalized account name. The latest active session supplies the displayed room and country metadata. Room capacity is enforced on the server using distinct account names, not a client-side display limit.

### 3. Duplicate room presence notices

**Defect:** Separate active sessions for the same account could emit duplicate join/leave notices when one tab moved or disconnected while another tab remained in the same room.

**Correction:** Join, explicit leave, move, and disconnect notices are emitted only when the account actually enters or leaves that room, not when one of its other active sessions changes.

### 4. Session cleanup and reconnect grace

**Defect:** Registered-member session records could remain in the persistent session store after their socket disconnected. Guest cleanup used a separate short timer, and the old cleanup path was not tied to a verified active socket owner.

**Correction:** All disconnected sessions receive a bounded 60-second reconnect grace period. Rejoining cancels cleanup. Expired disconnected sessions are removed, and guest account/profile data is removed only when no active session for that guest remains. Transient private conversations use the same 60-second reconnect grace. Cleanup restores guest/session state if durable save fails.

### 5. Private unread counter

**Defect:** Opening the private contacts list called `/api/private/read-all`, marking every conversation as read even if the member had not opened those conversations. The client also cleared its unread map while opening the list.

**Correction:** Opening the list no longer marks messages read. It loads each contact's unread count from `/api/private/contacts`, displays a per-contact badge, and updates the total badge. Incoming private text/media refreshes the list when it is open. Only opening an individual conversation marks that conversation read.

### 6. Wall unread counter

**Defect:** Wall unread count existed only in browser memory and increased only for live events. It was lost on reload and could count the member's own posts.

**Correction:** Added `wallReadAt` per-account read cursors and authenticated `/api/wall/unread` and `/api/wall/read` endpoints. The count survives reloads and excludes the current member's own posts. Opening the wall marks the latest loaded snapshot as read; posts arriving after that snapshot remain unread. Request generations prevent a slower, older wall/private-list response from overwriting newer UI state.

### 7. Country flags

**Defect:** The member list hard-coded the Iraqi flag for registered members and used a person icon for guests. This was not a country lookup and produced inconsistent flags.

**Correction:** Country display now uses valid two-letter country metadata from supported hosting-proxy headers. If the hosting layer does not provide a country code, the UI displays an unknown flag rather than inventing Iraq. No IP-geolocation provider was added.

## Database compatibility

- Added the `wallReadAt` object to database defaults and normalizes it for existing databases.
- Existing accounts, public messages, wall posts, uploads, and private-media files are not reset by this change.
- Guest wall-read cursors are removed when a guest account is deleted/logged out.
- The existing placeholder `data.json` is not a live database. Keep the persistent Deplexo data volume and never replace it with the archive placeholder.

## Verification

- `node --check server.js`: passed.
- `node --check verify.js`: passed.
- `node verify.js`: all local static and runtime-fixture checks passed.
- Runtime fixture verifies stale socket exclusion, exact socket ownership, duplicate-account deduplication, per-room unique counts, and latest-session metadata selection.
- Browser entry files `index.html` and `public/index.html` are byte-identical.
- JavaScript inline-script compilation and existing project regression checks passed.

## Not verified in this environment

No live Deplexo server, real multi-device network session, or physical Android/iPhone browser session was available to this audit. Therefore this report does not claim real-world load testing or a guarantee that every hosting proxy supplies country headers. Final validation still requires simultaneous sessions on multiple devices and a deploy smoke test.


## v46.93.38 media delivery follow-up

### Confirmed defect
The private-media HTTP upload route located only the first `socketUsers` entry matching the recipient and emitted `private-media` to that one session. The private text-message path already uses `emitToUser`, which fans out to every active socket owned by the account. If the recipient had multiple tabs/devices and the first matching session was not the tab showing the conversation, the visible client could miss the media event.

### Correction
Private-media delivery now checks `hasConnectedSessionForUser(to)` and calls `emitToUser(to, 'private-media', message)`, matching private text delivery. This preserves session ownership validation in the shared helper and covers all active sessions for the recipient.

### Format compatibility
Added `video/quicktime` as a supported upload MIME type with `.mov` storage extension. The existing signature validator must still recognize an ISO-BMFF `ftyp` header, so the MIME label alone cannot make arbitrary content pass. This covers common iPhone MOV uploads. HEIC/HEIF is not added: current browser rendering does not reliably decode it cross-platform, so accepting it without a conversion pipeline would risk delivering a file the recipient cannot view.

### Retention model
Private conversations/media remain intentionally transient. `save()` explicitly excludes `privateMessages`, startup purges private-media storage, and disconnect cleanup removes the transient conversation after the reconnect grace. This release preserves that policy; it does not claim private messages survive a server restart.
