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
