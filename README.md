# Rimaz v46 — manual member permission additions

Based on v45. Preserves the send-time shortcut and smiley expansion behavior.

## Changes in v46
- Adds owner-controlled, per-member manual permission additions, independent of the member's assigned rank.
- Selecting a member in **صلاحيات الرتب** opens that member's extra-permission list; save applies only to that member.
- Removing manual selections returns the member to the permissions supplied by their rank.
- Manual additions cannot grant rank assignment, rank-permission management, or likes reset.
- Rank permission profile editing is restricted to the site owner. The working admin account does not receive those owner-only controls.
- Existing `permissionOverrides` storage is used; no member data or uploads are included in this source package.

## Deployment
Replace `server.js`, `index.html`, and `public/index.html` with the packaged files, then restart the application. Do not replace the live `data.json` and do not delete or overwrite the existing `uploads/` directory.

## Checks
`node --check server.js` and inline JavaScript syntax checks pass. ZIP integrity is checked. This package has not been live-tested on Deplexo.

## v46.1 — تصحيح صلاحيات حساب الإداري
- حساب الإداري يملك صلاحيات إدارة الدردشة كاملة، بما فيها تعيين الرتب وإدارة صلاحيات الرتب وتصفير اللايكات.
- يمكن للإداري إدارة الإضافات اليدوية لصلاحيات كل عضو بشكل مستقل عن رتبته.
- حماية حساب صاحب الموقع تبقى على مستوى الخادم عند استهدافه بإجراءات الإدارة؛ لا يستطيع الإداري تنفيذ إجراءات عليه.
- لا يتطلب هذا التحديث استبدال `data.json` أو مجلد `uploads`.

## v46.3 — dynamic rank management
- Adds a persistent rank-definition catalogue while retaining the seven existing rank IDs and their current member assignments.
- Adds owner-only create/edit/delete controls for custom rank definitions: stable ID, display name, numeric level/order, icon, optional GIF/PNG/JPG/WEBP image, base staff class, and individual permissions.
- Adds a unified rank-assignment selector using the saved definitions. `durationDays: 0` remains permanent; positive whole-day values expire automatically.
- Uses the saved rank definition as the permission source for members assigned that rank. The legacy rank-permission editor now reads and writes the same definition, preventing two permission lists from drifting apart.
- Keeps the rank system isolated from chat button layout and chat/member color styling. Rank icon/image is stored for administration and does not alter chat colors or button rendering.
- Protects owner identity, prevents custom ranks from acquiring the admin base role or rank/permission-management capabilities, prevents deleting a rank while it is actively assigned, and blocks rank grants containing permissions the granting actor does not possess.
- Adds upload validation for rank artwork (GIF/PNG/JPG/WEBP, max 1 MiB) and cleans up replaced image files.

### Rank workflow
1. Open **لوحة الإدارة → الرتب** as the site owner.
2. Create a rank with a unique English ID, Arabic name, level, icon/image, base class, and permissions.
3. Save it; the rank becomes available in the member assignment selector and member-management rank list.
4. Select a member and rank. Enter `0` for permanent, or a positive number of days for automatic expiry.
5. Review **سجل منح الرتب** to see who granted the rank, when, and whether it is permanent or expired.

### Verification
- `node --check server.js` passes.
- Inline browser JavaScript syntax check passes.
- ZIP integrity check passes after packaging.
- Full HTTP/live deployment testing was not possible in this environment because the runtime dependencies are not installed and package installation timed out. Test on a staging deployment before replacing production files.

### Deployment
Replace `server.js`, `index.html`, and `public/index.html` with the packaged versions, then restart the application. Keep the existing `data.json` and `uploads/` directory. The startup migration adds the legacy rank definitions to the existing database without replacing accounts, messages, profiles, or uploads.
