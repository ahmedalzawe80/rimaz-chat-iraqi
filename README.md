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
