# Rimaz v46.4 — Rank Manager Access & Isolation Fix

Based on the supplied Rimaz v46.2 source and the prior v46.3 working package.

## What changed in v46.4
- The **إدارة الرتب** tab now exposes the rank-definition manager to both the site owner and the admin account.
- Admins can create, edit, upload rank images for, and delete **custom ranks only**. Built-in legacy ranks remain protected from admin edits/deletion; the owner retains control of built-in ranks.
- Custom ranks are strictly independent from chat presentation and legacy chat positions: their base role must be `member`. They do not change chat colors, button layout, member appearance, or `member/super/banner/admin` position.
- Custom-rank permissions are applied through the existing server-side permission resolver. Privileged rank-management permissions (`permission_manage`, `rank_assign`, `role_assign`) cannot be placed inside a custom rank.
- Existing permanent/temporary assignment behavior is preserved: `durationDays: 0` means permanent; a positive whole number expires automatically after that many days.
- The root and fallback `public/index.html` are synchronized so the same rank-manager UI is served regardless of the hosting entry path.

## Deployment
1. Back up the current application files and persistent data directory.
2. Replace the packaged `server.js`, `index.html`, and `public/index.html` with these versions.
3. Keep the live `data.json` and `uploads/` directory. Do not replace them with files from this source package.
4. Restart the Node application and sign in again, then open **لوحة الإدارة → الرتب**.

## Access rules
- Owner: can manage built-in and custom rank definitions.
- Admin: can manage custom rank definitions only; built-in ranks are read-only.
- Non-admin rank assignees: may only assign ranks allowed by their effective permission set. The server rejects any custom rank containing permissions the issuer does not have.
- Custom ranks never change chat role styling/position. They only contribute their explicitly selected administrative permissions.

## Validation performed
- `node --check server.js` passed.
- Inline JavaScript syntax checks for `index.html` passed.
- Root and fallback UI files are byte-identical.
- ZIP integrity test passed.
- Static assertions confirmed the admin/owner access gates, custom-rank-only restrictions for admins, immutable built-in rank handling, and `0 = permanent` duration handling.

No live Deplexo deployment or production database was available in this environment, so production behavior must still be verified on the hosted site after backup and deployment.
