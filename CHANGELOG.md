## v46.93.61 — conservative responsive CSS audit

- Removed one empty mobile media-query block with no effect on rendering.
- Rechecked stylesheet parse validity, repeated declarations, and adjacent media-query merge safety.
- Retained differing selector overrides and responsive rules pending browser visual regression; no uncertain CSS was deleted.

## v46.93.60 — safe exact-duplicate CSS cleanup
- Removed only top-level CSS rules whose selector and complete ordered declaration list were identical to an earlier rule; retained the first occurrence and original cascade order.
- Did not remove rules with differing values, media-query rules, responsive overrides, or any unrelated `!important` declaration.
- Kept the member list/search/typing-indicator implementation unchanged and synchronized both browser entry files.
- Static parser, syntax, regression, and archive-integrity checks are required before release; real-browser visual verification remains outstanding.

## v46.93.55 — أرقام هوية ثابتة للأعضاء والزوار والبحث بالرقم
- إضافة سجل أرقام هوية دائم مستقل عن وجود الزائر حالياً؛ رقم الزائر يبقى محفوظاً حتى بعد حذف سجل دخوله المؤقت.
- ترحيل حسابات الأعضاء والزوار الموجودين إلى أرقام فريدة، وتخصيص رقم جديد عند إنشاء هوية جديدة، مع فصل هوية العضو المسجل عن هوية الزائر الذي يحمل الاسم نفسه.
- إظهار رقم الهوية أسفل العلم في قائمة المتواجدين بمحاذاة اليمين، مع رفع العلم قليلاً ضمن عمود صغير دون تغيير صورة العضو أو الاسم أو بقية المعلومات.
- البحث بقائمة المتواجدين بالاسم أو رقم الهوية، مع تطبيع الأرقام العربية والفارسية والإنكليزية؛ الرقم المطابق تماماً يسبق نتائج بادئة الرقم.
- إضافة فحوصات رجعية لسجل الهوية، مسارات API، موضع الرقم، وتطابق ملفات الصفحة.

## v46.93.52 — تسريع تشغيل فيديو الخاص وضبط المسافة والحجم
- أزلت سبب التأخير الأساسي في فيديو الخاص: لم يعد المتصفح ينتظر تنزيل الفيديو كاملاً وتحويله إلى Blob قبل إظهاره. أصبح تشغيله يستخدم رابط بث مؤقتاً ومصرحاً به من الخادم، مع دعم طلبات Range حتى يبدأ تحميل البيانات المطلوبة للتشغيل مباشرة.
- أضيفت تذاكر تشغيل قصيرة العمر ومقيدة بحساب المستلم/المرسل، مع إعادة التحقق من صلاحية الوصول إلى رسالة الوسائط قبل إرسال الملف. لم يُفتح مسار عام للوسائط الخاصة.
- خُفّض الفراغ بين رأس الرسالة والوسائط إلى الحد الأدنى، وأزيل الهامش العمودي الزائد عن بطاقات الوسائط.
- وُحّد عرض الوسائط في الخاص والحائط عند 300px كحد أقصى، مع ارتفاع أقصى 220px؛ زاد العرض قليلاً وانخفض الارتفاع لتقليل الامتداد العمودي.
- أبقيت صور الخاص على مسار الجلب الموثق، وأبقيت الكشف والمعاينة بملء الشاشة دون تغيير.
- تزامن `index.html` و`public/index.html`، وأضيفت اختبارات تحقق لمسار بث الفيديو المؤقت.

## v46.93.51 — ضبط حجم الوسائط وتشغيل فيديو الخاص
- توحيد عرض الصور والفيديو في الخاص والحائط ضمن عرض أقصى 280px وارتفاع أقصى 240px.
- تقليل الفراغ العمودي قبل الوسائط وبعدها مع إبقاء محاذاة أزرار الكشف.
- إصلاح حدث النقر على فيديو الخاص: لم يعد `preventDefault()` يلغي تشغيل عناصر التحكم الأصلية؛ النقر على مساحة الصورة يفتح المعاينة، والنقر ضمن شريط التحكم السفلي يترك التشغيل للمتصفح.
- إزالة كتلة CSS المكررة الخاصة ببطاقات الوسائط والإبقاء على قواعد العرض الموحدة.

## v46.93.44 — Left-aligned composer entry fields
- Corrected the single canonical `.composerRichInput` rule so the public, private, and wall input fields begin from the left edge.
- Preserved `direction: rtl` for Arabic text shaping and did not alter the rendering/alignment of already-sent private or wall messages.
- Kept the public sent-message alignment correction from v46.93.43.
- Added a regression assertion and synchronized both HTML entry points.

## v46.93.43 — Public chat left-start alignment
- Corrected the public message composer so the caret, typed text, and placeholder start from the left edge while Arabic glyph shaping remains handled by the browser bidirectional algorithm.
- Corrected public-room message text alignment to start at the left edge after sending.
- Kept private-chat and wall composer alignment rules unchanged; removed the conflicting public-message RTL/right-alignment declarations at their existing source rules rather than layering a broad override.
- Added regression checks and kept `index.html` and `public/index.html` identical.

## v46.93.40
- Fixed the shortcut editor textarea sizing: restored a comfortable 220px starting height and bounded auto-growth while typing, with internal scrolling only after the viewport-safe limit.
- Consolidated duplicate shortcut textarea CSS rules so a later 125px override cannot collapse the editor.
- Normalize hard line breaks in saved shortcut messages to spaces, keeping a shortcut as one logical message line. Visual wrapping on narrow screens remains natural and does not insert a newline.

## v46.93.39 — Complete shortcut editing workflow and mobile editor layout

- Reworked shortcut management as a complete create/edit/delete workflow. Each saved shortcut now has adjacent Edit and Delete actions; editing loads the existing title and message, preserves its stable ID, and saves in place without creating a duplicate.
- Added explicit cancel-edit behavior and validation for missing records and duplicate shortcut names. The existing server-side chat-tools save endpoint remains the single persistence path for both create and update operations.
- Rebuilt the shortcut editor layout as a single-column mobile-first form. The message field has a stable multiline editing area, readable wrapping for Arabic text, and clear side-by-side form actions. Saved shortcut text wraps within its own row without pushing the action buttons off-screen.
- Kept `index.html` and `public/index.html` byte-identical and added regression checks for edit, cancel, ID preservation, and the paired edit/delete controls.

## v46.93.38 — Private media delivery across sessions and iPhone video MIME support
- Fixed private image/video/audio delivery to use the same account-wide Socket.IO fan-out as private text messages. The previous implementation selected only the first active session for the recipient, so a different active tab/device could miss the media event.
- Replaced the single-session lookup with an authoritative connected-account check before accepting a private-media upload; delivery now targets every currently owned socket for the recipient.
- Added the `video/quicktime` upload MIME mapping and MOV extension for iPhone-originated QuickTime videos. Signature validation still requires an ISO-BMFF `ftyp` container before accepting the file.
- Kept private conversations and their media transient in memory/by session lifecycle, consistent with the existing privacy model; this release does not silently change private-message retention or persist private conversations to the database.
- Synchronized `index.html` and `public/index.html`; added regression checks for account-wide media delivery and QuickTime media validation.

## v46.93.37 — Presence/session ownership and unread-counter integrity

- Presence is now projected only from the currently connected Socket.IO connection that owns each authenticated session. A late disconnect from an older/replaced socket cannot remove the newer connection.
- Online and per-room counts are calculated from active session ownership and deduplicated by account, so multiple tabs do not inflate counts. Room capacity is also enforced on the server using distinct accounts.
- Reconnects and transient private conversations receive a bounded 60-second server-side grace period; abandoned session records are cleaned up, and guest records are removed only when no active session remains.
- Room join, explicit leave, move, and disconnect presence notices are deduplicated when the same account has another active tab in that room. Overlapping wall/private-list requests use request generations so older responses cannot overwrite newer unread state.
- Private unread counts are preserved when opening the contacts list; per-conversation unread counts are displayed and refresh while the list is open.
- Wall unread counts now use a persisted per-account read cursor, survive page reloads, and count posts from other members only. Opening the wall marks only the loaded snapshot as read.
- Member flags no longer assume every registered member is in Iraq; they use country metadata supplied by the hosting proxy and show an unknown flag when no reliable country code is available.
- Added regression coverage for stale sockets, duplicate sessions, per-room counts, private unread behavior, wall read cursors, and country flag sources.

## v46.93.36 — Cross-browser private-call reliability

- Reworked front/rear camera switching to detach the active video sender and release the current camera track before requesting the opposite lens; failed switches attempt to restore the original camera.
- Added call-duration timing that begins only when the peer connection reaches `connected`, and resets cleanly when the call ends.
- Added a browser-capability-aware speaker output control and requests the `play-and-record` audio session mode where supported; unsupported browsers report the limitation rather than pretending to switch outputs.
- Added clearer connection states and synchronized both browser entry files. Physical-device testing is still required, especially for mobile audio routing and camera HAL behavior.

## v46.93.35 — Transactional Android camera switching audit

- Restricted release-and-retry to camera-busy errors (`NotReadableError`, `TrackStartError`, `AbortError`); missing-camera, unsupported-constraint, and permission errors no longer stop the working camera.
- Increased the post-release settle interval and retained direction/device validation for the requested camera.
- Added call/session identity checks around asynchronous camera acquisition and track replacement so a late result cannot attach to an ended or replaced call.
- Added restoration validation for the previous camera direction and kept the existing RTCPeerConnection sender instead of renegotiating the call.
- Synchronized both browser entry files and expanded regression checks. Hardware testing on physical Android devices is still required.

## v46.93.34 — Android front/rear camera switch retry fix

- Improved private video-call camera switching when Android devices keep the previous camera capture locked or report camera-busy failures under different error names.
- Permission-denied errors now stop the retry path immediately; other camera acquisition failures release the old video track, wait briefly, and retry the requested direction.
- Preserved the existing sender replacement flow and restoration of the previous camera if the requested camera still cannot be opened.
- Kept both browser entry files synchronized and added regression checks for the broader retry behavior.

## v46.93.33 — Separate personal-banner permission section

- Moved `personal_banner` out of the general profile permissions group into its own clearly labeled **البنر الشخصي** group, alongside the separate **بنرات الدردشة** group.
- Renamed the permission label to **إدارة البنر الشخصي — رفع وحذف بنر الحساب نفسه** so its effect is explicit in the permission editor.
- Kept the existing per-account personal-banner restriction and server-side authorization unchanged; disabling the permission hides the personal upload/delete controls and rejects direct upload/delete requests.

## v46.93.32 — Split banner permissions and rank banner manager

- Split banner permissions into `personal_banner` and `chat_banners_manage`; legacy `banner_upload` values migrate to personal banner only.
- Added a separate manager for the seven chat-rank banners with upload/replace/delete operations protected by server-side permission checks.
- Rank banners display for members of the assigned rank unless the member has their own personal banner.
- Login form ignores automatic credential-manager submissions; login requires an explicit submit from the Login button.
- Kept personal banner editing limited to the signed-in account.

## v46.93.31 — Blank-page hotfix

- Removed incomplete `async` fragments left behind by the previous unused-function cleanup; these caused a JavaScript syntax error that stopped the entire page script from running.
- Synchronized `index.html` and `public/index.html` and restored the root hero image asset for archive completeness.
- Re-ran inline JavaScript syntax checks and the complete local verification suite.

## v46.93.30 — Credential safety and dead-code cleanup
- Removed plaintext password reads/writes from `localStorage`; the legacy `rimaz_saved_password` value is cleared on page load and after a successful sign-in.
- Kept remembering the member username. Password autofill and optional saving are delegated to the browser password manager using the standard `username` and `current-password` autocomplete fields.
- Preserved the existing password-length policy and did not migrate, reset, or disable existing accounts.
- Removed 14 browser functions and two server helpers that had no call sites or references in the shipped source.
- Added `.gitignore` and `.dockerignore` rules for local runtime data, private uploads, credentials, development-only files, and exported archives. The tracked `data.json` remains only a placeholder and is excluded from Docker build context.
- Added regression checks for secure remembered-login behavior. The local suite passes 360 checks; live-host and browser password-manager behavior still require deployment testing.
- No user database, uploaded media, room settings, permission catalogues, or account records were changed.

## v46.93.29 — Final source and package hygiene audit
- Removed the unused root-level duplicate of `rimaz-hero.jpg`; the public static asset remains unchanged.
- Removed a broken image fallback URL that incorrectly included the filesystem directory `/public` in the browser path.
- Kept the two identical HTML entry files because the server explicitly uses the root entry first and the public entry as a fallback.
- Corrected current audit documentation: room microphone access uses 30 likes; notices use 400; private media and calls use 500.
- Updated package version and regression checks. No chat feature or authorization behavior was changed.

## v46.93.28 — ربط الوصف المحفوظ بمرجع فهرسة موحّد
- جعل عنوان الموقع العام مصدراً موحداً لرابط canonical وOpen Graph URL وبيانات Schema وrobots.txt وsitemap.xml، مع إمكانية ضبطه من متغير البيئة PUBLIC_SITE_URL عند اعتماد نطاق مخصص.
- تقديم robots.txt وsitemap.xml ديناميكياً قبل الملفات الثابتة حتى لا تختلف تعليمات الزحف أو خريطة الموقع عن النطاق الأساسي.
- الإبقاء على حظر واجهات API وSocket.IO والوسائط الخاصة فقط، مع السماح بزحف الصفحة العامة والملفات العامة.
- إبقاء الوصف المحفوظ من إعدادات الموقع هو الوصف الذي يُحقن في HTML المرسل من الخادم داخل meta description وOpen Graph وTwitter وSchema.
- إضافة اختبارات انحدار للرابط الأساسي وتطابق مصادر الفهرسة؛ لا يتضمن التغيير ضماناً لعرض Google الوصف حرفياً، إذ يختار Google المقتطف النهائي.

## v46.93.27 — Settings alignment, quiet success feedback, and owner protection alerts
- Centered only the text inside the existing dark profile-setting labels (decoration, status, name color, font color, and background color); the dark label blocks and field layout remain unchanged.
- Restored the profile settings save button to the existing green theme without changing its save handler.
- Kept the shared toast component and all underlying save/publish/close actions, but suppressed routine success confirmations so the black top strip no longer appears for successful actions. Error and actionable messages remain visible.
- Removed the duplicate top-strip message from real-time administrative action notices; the actual incoming notice remains.
- Added server-side, persistent and real-time owner alerts when an authorized administrator attempts a protected action against the site owner, including avatar deletion, room kick/ban/mute, profile status, name decoration, profile colors, member decoration, and room transfer. The alert identifies the authenticated administrator and accurately states that the action was blocked; it appears live when the owner is online and is surfaced once after the owner next logs in if offline.
- Owner protections and permission checks remain enforced on the server; no protected action is executed by these attempts.
- Synchronized `index.html` and `public/index.html`; added regression checks for the changes.

# v46.93.26 — إصلاح عميق لقائمة الألوان ومحاذاة حقول الملف الشخصي

- إزالة تنفيذ قائمة الألوان السابق الذي كان يربط قائمة HTML مباشرة بحقل `input[type=color]`؛ هذا كان يسمح بظهور نافذة النظام بالتزامن، كما أن القائمة كانت داخل عنصر Flex لا يطبق عليه `grid-column`، وهو سبب الخطوط/التخطيط المشوّه.
- نقل لوحة الألوان لتكون عنصراً مباشراً داخل صف اللون، واستبدال مدخل اللون المرئي بزرّ عينة لون داخلي مع الاحتفاظ بحقل مخفي بالقيمة نفسها حتى تبقى عملية الحفظ وواجهة API كما هي.
- النقر على مربع اللون يفتح لوحة داخل الصفحة تضم 105 ألوان، واختيار اللون يحدث العينة والقيمة المحفوظة ثم يغلق اللوحة.
- إزالة طبقة CSS السابقة المتعارضة بدلاً من إضافة ترقيع جديد، وتوحيد قواعد حقول الزخرفة والحالة بمحاذاة يسارية صريحة للنص والحقول.
- عدم تغيير أسماء الأزرار أو نصوصها أو إعدادات الصوت أو الصورة أو بقية واجهة الإعدادات.
- مزامنة `index.html` و`public/index.html` وإضافة اختبارات انحدار خاصة بمصدر القائمة وبنيتها ومحاذاة الحقول.

# 46.93.24 — إعادة بناء تخطيط حقول الإعدادات حسب الصورة المرجعية

- إزالة قواعد المحاذاة القديمة المتعارضة التي كانت تضع عناوين الزخرفة والحالة على اليمين.
- إعادة ترتيب صفوف الزخرفة والحالة: العنوان على اليسار، وحقل الإدخال الكامل تحته بعرض اللوحة.
- إعادة بناء صفوف الألوان الثلاثة: التسمية على اليسار ومربع اللون الصغير بجانبها إلى اليمين، بمقاسات ثابتة مطابقة للنسب الظاهرة في الصورة المرجعية.
- ضبط ارتفاعات الحقول والعناوين وزر الحفظ لتقارب أبعاد الصورة الأصلية على الهاتف.
- مزامنة `index.html` و`public/index.html` وإضافة اختبارات تحقق خاصة بتخطيط الإعدادات.
- لم تتغير وظائف الحفظ أو قيم الألوان أو حدود الإعجابات.


- نقل تطبيق لون الخلفية من حاوية عنوان الرسالة كاملة إلى عنصر نص الاسم نفسه.
- أصبح التظليل الأصفر/الملون يتوقف عند نهاية الاسم ولا يمتد بعرض الشاشة.
- بقي لون الاسم ولون نص الرسالة مستقلين عن لون الخلفية.

## v46.93.21 — Unified sender-only likes policy for rooms, media and calls
- Centralized the authorization thresholds: 400 likes for notices and raising a voice-room mic; 500 likes for private image/video/audio uploads and initiating private voice/video calls.
- The threshold is evaluated only for the initiating sender. A recipient with zero likes can receive private media and can accept a call initiated by an eligible sender. Call acceptance revalidates the original caller, never the recipient.
- The site owner and a full-permission `ADMIN كامل الصلاحيات` account are exempt from all three likes gates. Partial moderators and individual legacy bypass permissions are not exempt.
- Replaced the old configurable per-room mic threshold (default 30) with one fixed 400-like rule, removed its room-creation controls and API payload fields, and migrated existing saved rooms by deleting the obsolete `micLikesRequired` field.
- The room-mic client now checks the 400-like rule before requesting microphone access; the server independently enforces the same rule.
- Removed the obsolete `staff_notice`, `staff_media`, and `voice_mic_override` permission toggles and bumped the permission schema to 9.
- Kept ordinary public/private text messages outside the likes checks. The previous composer left-alignment change is retained unchanged.
- Added runtime regression coverage for owner/full-admin, partial moderator, 0/400/500 likes, room mic, private media, and sender/recipient call authorization.
- No gift, member-card, profile, banner, avatar, or unrelated chat behavior was changed.

## v46.93.20 — Canonical composer alignment and sender-only likes permissions
- Replaced the existing shared `.composerRichInput` RTL/right-alignment declaration in place with LTR/left alignment. The rule applies only to the three current composer fields: public chat, private chat, and wall; no appended override block was added.
- Unified notification authorization at the server boundary: 400 likes are checked on the sender; only the site owner or an account with the complete `ADMIN كامل الصلاحيات` permission set is exempt. Partial `staff_notice` permissions no longer bypass the threshold.
- Unified private-media authorization at the server boundary: 500 likes are checked on the sender; only the site owner or a complete-permission admin is exempt. Partial `staff_media` permissions no longer bypass the image/media threshold.
- Exposed a distinct `fullAdmin` session flag and aligned the private-media UI gate with the server. Generic admin-panel access is not treated as full-admin exemption.
- Ordinary public/private text messages remain outside the likes checks. Recipient likes are not consulted by notification or private-media authorization.
- Added regression checks for the composer rule and a runtime permission matrix covering owner/admin exemption, partial moderators, and 400/500 sender thresholds.
- No unrelated UI, gift, profile, avatar, room, or member-card behavior was changed.

## v46.93.16 — Unified chat typography
- Audited the full stylesheet and removed 136 legacy font-size, font-weight, line-height, and font shorthand declarations from 26 selectors controlling member names and the text beneath them.
- Added one canonical typography source using the approved welcome-card title and body metrics: desktop 16px/17px and mobile 15px/16px, with matching 900/700 weights and line heights.
- Applied the shared name scale to general chat, online members, private contacts, private conversation headers, and wall posts.
- Applied the shared body scale to chat messages, member status/subtitles, private-message bodies, and wall text.
- Added a semantic class to private-message body text so it participates in the same typography system.
- Preserved all layout, banner dimensions, avatar dimensions, and unrelated styles. Synchronized `index.html` and `public/index.html`.

## v46.93.15 — Presence and private-list lower alignment
- Adjusted the existing online-member content column to stretch to the avatar row height and distribute the status line to the bottom edge.
- Adjusted the existing private-conversation contact content column to stretch to the avatar row height and anchor the latest-message preview at the bottom.
- Set the private-list latest-message preview to left alignment beneath the banner, matching the requested avatar-bottom alignment.
- No banner dimensions, banner heights, member-card header sizing, general chat, or wall layout were changed.
- Edited the existing canonical selectors in place; no new CSS override block was appended.

## v46.93.14 — Private contacts and member-card header rebuild
- Removed legacy CSS selectors that specifically targeted private-contact member rows, including the obsolete extra rank column that did not exist in the row DOM.
- Rebuilt the private conversations list from its actual four-column DOM: status marker, avatar, flexible identity, and delete action. The identity now receives the full remaining width using the same `minmax(0,1fr)` content geometry proven on the wall.
- Removed the previous personal-banner system block and replaced it with one canonical identity layout definition.
- Rebuilt the member-card top strip: banner height reduced from 26px to 22px, black strip reduced to 26px with zero padding, and the avatar/rank/close control follow the same compact height.
- Preserved banner height on all other chat surfaces and did not change the general chat or wall layouts.
- Synchronized `index.html` and `public/index.html`.

## v46.93.13 — Private conversation identity cleanup
- Removed the three superseded private-message sender layout style layers that alternated between Flex and Grid and forced intrinsic max-content widths.
- Replaced them with one canonical sender layout: fixed avatar column plus a wall-style `minmax(0,1fr)` identity column.
- Applied the same flexible banner sizing rule to the private conversation title and sender rows; long banner artwork scales proportionally within the available width instead of being clipped or shifted.
- Preserved the existing 14px chat-banner height and all other chat surfaces.
- Synchronized `index.html` and `public/index.html`.

## v46.93.10 — Shared personal-banner identity layout
- Rebuilt the personal-banner identity component as a single intrinsic-size flex layout shared by public chat, room-entry notices, online members, private contacts, private messages, and the wall.
- Removed the previous per-surface width/position assumptions that caused private-message banners to collapse or drift and caused member names to clip at the start.
- Preserved the existing banner height (14px in chat surfaces; 26px in the member-card header) and kept the member-card order: banner, photo, rank, name.
- Kept avatar placement owned by each surface so the banner remains adjacent to the correct avatar without duplicating or hiding the image.
- Synchronized the browser entry files and added no changes to banner asset sizing.
- Validation: existing static/archive regression suite passes; live visual testing on the deployed server remains necessary.

## v46.93.9 — Identity ordering and clipping correction

- Kept all personal-banner height and size values unchanged.
- Reordered the member-card identity to banner, avatar, rank, then member name.
- Corrected online-member RTL name alignment so leading characters are not clipped.
- Rebuilt private-message header flow so the avatar stays on the right and the personal banner sits directly to its left.
- Removed arbitrary 150px/42vw banner width caps; banner images now retain their intrinsic aspect ratio within the available identity width, preventing short custom banner text from being cut off.
- Synchronized `index.html` and `public/index.html` and added regression checks for the new identity structure.

## v46.93.8 — Unified personal-banner identity system

- Replaced the scattered personal-banner rendering paths with one shared identity renderer.
- Personal banners now render in room-entry presence notices, public chat messages, online members, private contacts, private conversations, and wall posts.
- In normal chat surfaces, the banner replaces the member name and rank; removing the banner restores the normal name/rank identity.
- Member cards keep the name and rank visible and place the member avatar immediately to the left of the personal banner.
- Reduced the member-card masthead and banner dimensions together; the masthead now closely matches the banner/avatar height.
- Removed obsolete personal-banner selectors and kept the two browser entry files identical.
- Updated live profile-change handling so banner add/remove and name changes refresh visible identity rows.

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


## v46.93.6 — Reference-aligned member layout foundation
- Rebuilt both member-profile render paths so the member's personal banner is a compact image inside the dark identity header, beside the display name, rather than a separate full-width strip above it.
- Reworked the profile portrait proportions and the online-member row geometry to follow the supplied reference screenshots more closely.
- Kept banner data, upload permissions, and GIF image URLs intact.
- Synchronized the public browser entry file with the main entry file.
- Visual parity still requires a live browser check against the reference on the hosted deployment.


## v46.93.7 — Canonical member components
- Removed the superseded profile-card and member-row layout layers that had conflicting widths, portrait heights, and header sizing.
- Consolidated the member profile card and online-member row into one authoritative layout definition based on the supplied Benota Qalbi reference: 84vw card width, a shallow identity bar, a bounded 5:3 portrait, and a compact personal banner beside the name.
- Kept profile actions, room badge, member ranks, personal banner storage, upload permissions, and animated GIF sources intact.
- Synchronized both browser entry files and updated structural verification for the canonical layout.
- Final visual parity remains subject to a live-host screenshot comparison at the same viewport as the reference.


## v46.93.12
- Fixed the private conversation top header to render the shared personal-banner identity instead of always showing rank and name.
- Stabilized private-message sender banner sizing so the banner keeps its intrinsic width and no longer shrinks into the center or crops its text.
- Kept the existing banner height and all other chat surfaces unchanged.


## 46.93.17 — Unified chat typography
- Set every chat member name to 17px / weight 900.
- Set supporting text, status, previews, and message bodies to 16px / weight 700 across desktop and mobile.
- Applied the shared values to public messages, entry notices, online members, private conversation list, private messages, and wall posts.
- Aligned entry and online-member rank badges to the top of the avatar/name row.

## v46.93.18 — Default profile avatar fit
- Adjusted only the default branded avatar inside the member profile photo area to show the full crown/logo.
- Uses `object-fit: contain` with a subtle 3px top inset and bottom alignment so the artwork is slightly smaller and sits a little lower.
- The black profile header, personal banner, custom user avatars, and all other avatar sizes/layouts remain unchanged.
- Updated the default-avatar cache key to v46.93.18.


## v46.93.19 — Full-width default profile avatar
- Removed the previous profile-only `contain` sizing and inset that made the default avatar appear small with white side gutters.
- Matched the default square artwork to the full profile-card width using its intrinsic 1:1 ratio, with no side padding or cropping.
- Kept the change scoped to the default avatar in the member profile card; custom member photos and the black header are unchanged.
- Updated the default-avatar cache key to v46.93.19.


## v46.93.25 — Compact profile settings dimensions
- Replaced the oversized profile-settings layout dimensions with compact measurements based on the original reference image.
- Reduced the decoration/status label height and text-field height, the three color swatches, and the save button to approximately half the previous rendered size.
- Kept decoration/status labels on the left with their full-width input fields directly below; kept color labels on the left and compact swatches on the right.
- Updated the base settings component rules and the single canonical reference layout together; removed the prior oversized dimensions rather than layering another override.
- No room-mic, messaging, account, or other feature behavior was changed.

## Shortcut editor and Arabic message rendering hotfix
- Corrected the shortcut editor grid so the textarea spans the full available admin-card width instead of inheriting the admin panel's three-column grid.
- Restored natural wrapping for public and private Arabic messages, with RTL text direction and preserved explicit line breaks.
- Set public, private, and wall composers to RTL Arabic text alignment while retaining the existing shortcut expansion and persistence flow.
- Updated regression checks to cover the final CSS overrides and prevent the legacy nowrap/LTR rules from reintroducing the reported issue.

## v46.93.42 — unified chat typography refactor

- Replaced the previous 17px/16px typography layer with one canonical 15px member-name and 14px chat-body token system.
- Removed legacy font-size, font-weight and line-height declarations from semantic chat identity, message, wall, presence, private-chat, announcement and campaign-ad selectors.
- Added semantic wall-body, announcement, incoming-call and campaign-ad hooks so dynamic markup uses the same typography contract.
- Kept unrelated UI typography (controls, buttons, room cards, profile metadata and emoji artwork) outside the chat typography contract.
- Added regression checks for the canonical tokens, all chat surfaces and temporary/permanent announcements.


## v46.93.50 — Clean two-stage media rebuild
- Rebuilt private-chat and wall image/video display from the v46.93.44 baseline, discarding the previous media-preview implementation.
- Incoming media remains hidden behind the original reveal button; no media content is rendered before the user chooses to reveal it.
- First action reveals the media inline in its original message/post. A separate tap on the revealed image/video opens a full-screen viewer.
- Private media is fetched only after the reveal action with the authenticated session header; object URLs are tracked and released when the private conversation closes or changes.
- Full-screen video uses native controls and does not autoplay.
- Removed the visible “جاري تحميل الوسائط” placeholder; the original reveal button is shown immediately.
- Public chat media sending was not added; public text messaging remains unchanged.


## v46.93.53 — Private media server and message alignment correction
- Fixed the private-media playback-ticket endpoint: removed an undefined ticket reference that caused HTTP 500 responses when preparing private video playback.
- Moved the private media area into the sender identity column so the reveal button and revealed media sit directly below the sender identity instead of after the full avatar row.
- Unified private-chat and wall media dimensions at a 320px maximum width and 210px maximum height, preserving aspect ratio and containment.
- Kept the two-stage reveal/full-screen preview behavior and protected private media access.


## v46.93.54 — Root cleanup for private text layout and wall shortcuts
- Moved private text messages into the sender identity column below the name, so the text no longer occupies or overlaps the avatar row.
- Removed the obsolete conflicting private-message flex layout override; the canonical grid now controls avatar and identity geometry.
- Replaced wall send-time DOM mutation with a payload-only shortcut resolver; the shortcut remains unchanged in the composer and expands only in the published post.
- Kept public/private shortcut behavior and existing media flows unchanged.

## v46.93.57 — member directory layout and private typing indicator

- Reversed the country-flag/member-number arrangement in the online-member identity cell: flag/square on the left, member number on the right, retaining the compact responsive dimensions.
- Moved the online-member search control into a dedicated left-anchored layout row without changing its height or search behavior.
- Added a private-chat typing state over Socket.IO, with validated recipient delivery, a short server-side expiry, and cleanup on blur, send, conversation close, and disconnect.
- Added a WhatsApp-style three-dot animated indicator aligned to the right side of the private conversation, matching the message text scale and respecting reduced-motion preferences.
- Kept root and public browser entry files identical.

## v46.93.58
- Consolidated the online-member list, search field, and private typing indicator into a single scoped component stylesheet; removed their earlier duplicate declarations.

## v46.93.59
- Repaired malformed nested style markup and consolidated all stylesheet source blocks into one ordered source while preserving the existing cascade.
