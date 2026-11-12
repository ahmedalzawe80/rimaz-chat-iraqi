## v46.93.2
- Added an independent `banner_upload` rank permission for members to upload, replace, and delete their own personal banner.
- Personal banners are stored separately from rank artwork and member decorations, and appear in the member information panel.
- Added browser-side image downscaling/WebP compression for oversized banner images, with server-side permission enforcement and the existing image signature validation.

## v46.92.0
- Decode bundled smiley and gift image payloads once into Buffers at startup, releasing the larger Base64 strings from the V8 heap and avoiding per-request Buffer allocations.
- Reworked live presence broadcasts to build short-lived indexed session/socket lookups once per broadcast, eliminating repeated nested full scans while preserving per-viewer ghost/hidden visibility.
- Added regression checks for packed-asset reuse and indexed presence broadcasting; no chat features or user data formats were removed.

## v46.91.0
- Removed all older competing profile-photo sizing rules from both mirrored HTML entry points.
- Applied one canonical rule to the default Rimaz avatar in profile cards: 250px display height, contain fit, centered, white background and slight inset padding. User-uploaded photos are unchanged.
- Kept the online-members gift badge sizing from v46.90.0 unchanged.

## v46.90.0
- Replaced the default avatar with the approved square logo reading “ريماز عراقية”; retained contain-fit so the full image is visible without cropping.
- Replaced the previous 18px gift-badge rule with one shared 20px rule for online members, private contacts, message headers, presence, and wall posts.
- Sized the online-members gift slot to 24px so the 20px artwork is not squeezed by the badge column.

## v46.89.0
- Unified last-gift badge wrapper, image, and emoji sizing to 18px across online members, private contacts, general chat, and wall.
- Removed stale 20px/21px online-only and 22px member-specific gift badge overrides.
- Replaced the default avatar with the new “دردشة ريماز” logo on a square canvas with no crop; custom member avatars remain unchanged.

## v46.88.0
- Replaced the deployed default avatar asset with the new open-heart Arabic Rimaz logo.
- Added cache-busting to the default avatar URL and ensured that only the default logo uses contain-fit (custom member photos unchanged).
- Normalized online-members last-gift badge wrapper and artwork to exactly 18px.

## v46.87.0
- Replaced the old text/SVG default-avatar fallback with one shared branded image asset.
- Removed obsolete text-avatar markup and its CSS selectors; custom member avatars remain unchanged.
- Standardized gift badge artwork to 18px and removed the previous 17px override.

## v46.87.0
- Reduced last-gift artwork on member cards to 20px badge / 17px image across member lists.
- Kept the online-list VIP sizing behavior and other gift catalog behavior unchanged.

## v46.87.0
- Reduced only the VIP animated badge size in the online-members panel to 19×19 px.
- Reduced only the latest-gift artwork in the online-members panel to 18×18 px (emoji fallback 16 px).
- Kept private contacts, wall posts, messages, profile badges, and gift-picker artwork unchanged.
- Kept root and public browser entry files byte-identical.

## 46.83.0

- Fixed the member-card gift picker at its source: it now loads catalogues from the authenticated `/api/chat-tools` endpoint instead of the admin-only data endpoint, so members with gift permission can open it without admin access.
- Preserved the gift category on every member-card and admin send path; VIP gifts are validated and stored against the VIP catalogue rather than being misrouted to the standard catalogue.
- Replaced the VIP catalogue through a new one-time V6 migration with the exact latest `vip.zip` asset; the previous VIP catalogue entries are removed from the live catalogue and obsolete VIP gift records are cleared from member profiles while standard gifts remain intact.
- Added regression checks for the member-card loading route, category propagation, VIP migration, and exact packed VIP asset.

## 46.82.0

- Removed visible sequential numbering from the bundled standard gift labels while preserving stable internal asset identifiers.
- Removed tile frames/backgrounds around gift artwork in the admin and send-gift pickers; selection remains visible with a simple outline.
- Removed square backgrounds/borders from rank and owner artwork badges without changing the rank artwork itself.
- Added a one-time migration that replaces legacy VIP gift catalog entries with the currently supplied VIP gift only.
- Connected VIP gift catalog entries to the actual recipient gift picker and server-side send validation; the server now resolves gift IDs against the selected category, not the standard catalogue only.
- Kept standard and VIP catalog management separate, including manual upload and deletion.
- Added regression checks for catalog migration, category-aware VIP sending, unnumbered labels, and frameless artwork.

## 46.80.1

- Updated only the room-exit button SVG to match the supplied Bunouta reference: outlined door with a clear right-pointing exit arrow.
- Preserved the existing button color, dimensions, position, and `exitRoom()` action.

## 46.80.0

- Reworked announcement delivery as one site-wide broadcast so connected users receive notices even outside chat rooms.
- Publish both contest/advert notices and administrative notices immediately; temporary notices expire after 15 minutes and administrative notices repeat 15 minutes after each publication.
- Simplified announcement author presentation to rank artwork and display name, removing redundant role-label text.
- Consolidated the public chat composer and bottom navigation sizing into one authoritative compact style block while preserving the existing colors and exit icon treatment.
- Added regression checks for global announcement delivery, immediate publication, repeat timing, and concise author identity.

## 46.79.2
- Restored compact chat composer proportions to match the supplied Bunouta reference: exit, smiley, message input, and send button.
- Kept the exit-room action and send action unchanged; adjusted only their presentation and composer sizing.

# Rimaz v46.79.1 — Entry-screen, welcome, and room-exit corrections

- Show the login/entry screen on every fresh page load instead of silently restoring a previous session and opening the chat directly. The last username remains prefilled; passwords are not stored. The previous session is logged out in the background.
- Keep the configured welcome cards on the first room entry after the member signs in with the new session. This avoids a stale reused session suppressing the welcome cards.
- Restore the room-exit button to the left-side composer slot shown in the supplied reference, with a door-and-arrow icon; preserve its existing `exitRoom()` behavior.
- Keep the existing incoming-call card and both client/server room-mic acceptance guards. The server remains authoritative if the room-mic state changes during acceptance.

# Rimaz v46.79.0 — Scheduled ads, remembered sessions, room exit button, and call/mic guard

- Stop replaying permanent announcements in room-entry history; announcements now arrive only through their scheduled live broadcast, independently of welcome messages.
- Stagger first and recurring deliveries of multiple permanent announcements across separate slots within the 15-minute cycle, instead of sending a batch together.
- Prefill the last used username on the entry screen. Passwords are never stored in browser storage.
- Restyle the room-exit control only; its position and `exitRoom()` action remain unchanged.
- Keep incoming private-call cards visible while a member is speaking on a voice-room mic; accepting is blocked with the requested explanation until the room mic is lowered.
- Keep root and public browser entry files identical; do not replace persistent `data.json`, `uploads`, or `private-media`.

# Rimaz v46.78.0 — Private conversation controls and navigation flow

- Separate closing the private-chat window from deleting/hiding its conversation history; the X control now closes the window without destructive side effects.
- Make the minimize control preserve a restorable conversation entry, including conversations that have no messages yet.
- Keep explicit conversation deletion in the private contacts list.
- Load private contacts, member details, and read receipts concurrently.
- Add a small authenticated rooms endpoint and use it instead of the heavier full-state endpoint when opening the rooms list.
- Deliver welcome cards before room history so welcome and announcement order is predictable on room entry.
- Keep root and public browser entry files identical; no database schema migration or persistent-data replacement is required.

# Rimaz v46.77.0 — Final performance and memory cleanup

- Start the Socket.IO connection immediately after chat render; load optional shortcuts/smileys/gift catalogue asynchronously so the tools request no longer blocks joining the room.
- Fetch notifications and private contacts concurrently during boot, and stop the login-page online polling timer after authentication.
- Mark private conversations as read with one write request; remove the redundant contacts-list request on every incoming private message.
- Fetch private-list contacts and live members concurrently.
- Revoke protected private-media object URLs and close media viewers when leaving the private panel; cancel stale media fetch results if the conversation was closed or changed.
- Hide the voice-room speaker strip from the initial HTML state to prevent a brief black speaker bar flash before room initialization.
- Move the private-call media stylesheet into the document head; remove the obsolete, unreferenced inline.js duplicate.
- Preserve existing private-message disconnect cleanup and 24-hour public/wall retention behavior.
- Exclude the placeholder database file and duplicate root hero image from the update archive; persistent site data remains untouched.

# Rimaz v46.74.0

- توحيد نموذج الإدارة على الرتب السبع الثابتة فقط.
- إزالة المناصب العامة القديمة `admin` و`super` و`banner` من واجهة الصلاحيات ومسارات منح المناصب.
- حذف نظام الصلاحيات الإضافية المتراكمة واستبداله بمجموعة صلاحيات دقيقة مستقلة لكل حساب مسجل.
- حسابان على الرتبة نفسها يمكن أن تكون لهما صلاحيات مختلفة؛ تعديل حساب لا يغيّر صلاحيات الحساب الآخر.
- إضافة إرجاع الحساب إلى صلاحيات رتبته.
- حماية حساب المالك، وفحص الصلاحيات في الخادم لكل إجراء.
- ترحيل بيانات المناصب والمنح القديمة مرة واحدة ثم حذف مخازنها القديمة.
- تحويل صلاحيات الغرف وأدوات الدردشة الشاملة القديمة إلى مفاتيح منفصلة قابلة للتحكم.
- تغطية كل مفاتيح الصلاحيات النشطة في محرر الرتب.
\n\n## v46.80.5 — Root login layout correction and audit\n\n- Fixed the actual username selector: it now targets the input inside the dynamically generated credential form.\n- Username width and left alignment now match the password field's 55% grid track.\n- Kept mobile button sizing responsive in the final login layout rules.\n- Added `CODE-AUDIT.md` documenting CSS cascade findings and safe-cleanup boundaries.\n

## v46.80.6 — توحيد المسافة والمحاذاة بين الصورة والرتبة والاسم

- توحيد تخطيط صفوف الأعضاء في قائمة المتواجدين وقائمة المحادثات الخاصة.
- إضافة تباعد بسيط ومتساوٍ بين الصورة والرتبة والاسم.
- رفع محاذاة الرتبة والاسم لتبدأ قرب أعلى الصورة مع الحفاظ على أحجام العناصر.
- إزالة قاعدة CSS قديمة خاصة بقائمة الخاص واستبدالها بقاعدة نهائية مشتركة.
- مزامنة `index.html` و`public/index.html` وتشغيل اختبارات التحقق.

## v46.80.7 — Member layout, room action placement, and persistent sign-in

- Member rows now top-align the avatar, rank badge, and name; the rank/name columns have a deliberate small gap.
- The room creation action is compact and positioned at the physical left edge of the room list.
- Successful member, guest, and privileged sign-ins persist the opaque server session token in local storage; each tab prefers its own sessionStorage token first.
- Logout, forced return to entry, and invalid-session recovery clear both session stores.
- Passwords are never written to local storage. Returning users are restored through the server-issued session token; if the server invalidates/expires it, normal sign-in is required.
- `index.html` and `public/index.html` remain byte-identical.


## v46.80.8 — Explicit sign-in with remembered credentials

- Fresh page loads always show the login screen; a saved session token can no longer send the user directly into chat.
- Legacy persistent session tokens are removed from browser storage on page load.
- After a successful member login or registration, the username and password are remembered in this browser and prefilled in the login form; the password input remains masked and the user must press دخول.
- Authenticated session tokens are now kept only in the current tab's `sessionStorage`; logout does not erase the remembered login fields.
- The online-member and room UI changes from v46.80.7 are retained unchanged.
- `index.html` and `public/index.html` remain byte-identical.

**Security note:** the requested password prefill stores the password in this browser's local storage. Anyone with access to the same browser profile or device may be able to retrieve it; use this only on a trusted personal device.


## v46.80.9 — تصغير الرتبة في قائمة المتواجدين فقط

- ضبط عمود الرتبة بعرض ثابت صغير داخل نافذة المتواجدين لمنع دفع الاسم أو تداخله.
- تصغير شارة الرتبة وصورتها مع `object-fit: contain` حتى لا تتمدد خارج العمود.
- ترك مسافة واضحة بين الرتبة والاسم، مع تصغير بسيط لخط الاسم داخل قائمة المتواجدين فقط.
- عدم تغيير تنسيق الاسم والرتبة في المحادثات الخاصة أو الجدول أو الحائط أو الغرف.
- مزامنة ملفي الواجهة وتشغيل اختبارات التحقق.

## v46.81.0 — Gift catalogue rebuild and authenticated manual uploads

- Replaced the previous built-in gift set with all 115 supplied gift images in one packed JSON asset; image formats are identified by their actual file signatures, not their original filename extensions.
- Added a separate packed VIP gift asset and an independent VIP gift catalogue.
- Added VIP gift upload and deletion controls alongside the existing VIP grant/revoke controls.
- Fixed manual standard/VIP gift uploads by sending the active `x-session` token with multipart requests; this resolves the false "يجب تسجيل الدخول" response caused by bypassing the shared authenticated API helper.
- Kept catalogue changes behind the existing `gift_catalog_manage` permission and the gifts module switch; upload validation still requires a genuinely animated GIF.
- Added a one-time v4 catalogue migration that replaces old catalogue entries with the supplied packs. Existing account/profile gift receipts are not rewritten.
- Kept root and public browser entry files identical and added regression checks for pack signatures, session-authenticated uploads, and VIP catalogue controls.

## v46.84.0
- Replaced the legacy text/crown VIP badge with the supplied VIP animated artwork.
- Added a new one-time VIP catalogue migration that discards the previous VIP catalogue and removes legacy VIP gift assignments while preserving VIP membership and ordinary gifts.
- Removed square backgrounds, borders, and shadows from member/rank/gift badges across online members, private contacts, chat messages, wall posts, and profile surfaces.
- Kept the supplied VIP GIF as the canonical VIP asset.

## 46.93.0
- Added a separate `health_view` rank permission for the server health and memory monitor.
- Added a dedicated health tab with live RSS, V8 heap, external memory, Buffer, database and upload metrics.
- Kept health diagnostics read-only and enforced authorization on the server endpoint.
- Existing full-access admin ranks/accounts retain the new permission through a one-time migration; limited ranks are not broadened.


## 46.93.1
- Made `health_view` an explicit opt-in permission: full-admin rank defaults no longer include it automatically.
- Added a one-time migration to remove the previous automatic health grant from full-access rank/account permission sets, allowing the owner to enable it deliberately.
- The dedicated health tab is now shown and guarded only by owner status or `health_view`; `site_admin` no longer causes the dedicated button to appear. The existing site-admin overview keeps its embedded read-only health summary.
- Kept the health API protected for owner, `health_view`, or the existing broad `site_admin` access used by the site settings page.
- Updated archive regression checks for the explicit opt-in behavior.


## v46.93.3 — Built-in chat bot foundation
- Added a permission-gated Bot / Boot entry directly above the announcement button in Settings, matching the supplied reference placement.
- Added persisted bot controls for welcome, anti-spam, games, member statistics, and admin commands.
- Implemented the welcome bot in the public room and server-side rate/repetition protection for public chat messages.
- Added the independent `bots_manage` rank permission and authenticated server endpoints for bot settings.
- Games, statistics, and admin-command bots are exposed as staged controls and are not represented as active implementations yet.

## v46.93.4 — Banner rendering and functional bots
- Render each member's personal banner inline in the online-members list, above their display name; animated GIFs remain animated.
- Allow GIF personal-banner uploads without converting them to static images.
- Implement server-side chat commands for games, member statistics, help, and permission-checked administrative announcements.
- Normalize bot settings and enforce each bot's enabled state on the server.


## v46.93.5 — member banner and profile layout refactor
- Rebuilt online-member row structure so the avatar, personal banner/name lane, likes, and country flag have separate predictable grid columns.
- Moved rank artwork inline with the member name instead of reserving a separate column that squeezes the banner.
- Kept personal banners as shallow 13:1 strips in the online list and moved the profile banner to the top edge of the profile card, above its black title strip.
- Bounded profile portraits to a fixed content area so oversized source images cannot expand the member card.
- Kept banner data and upload routes unchanged; GIF image sources remain directly rendered.
