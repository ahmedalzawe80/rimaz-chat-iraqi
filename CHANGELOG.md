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
