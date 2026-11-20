# Rimaz v46.93.71 — Member-profile admin action audit

## Scope
Reviewed both member-admin interfaces: the inline actions attached to the chat member profile and the member-management panel opened from the admin users section.

## Root issues found
- Action definitions were duplicated between the two interfaces, allowing permission and label drift.
- Both interfaces rendered two identical mute controls.
- The inline profile's wall-post deletion button was gated by `panel_access` even though the dedicated permission is `wall_delete_user`; the admin panel used the dedicated permission.
- The inline profile displayed an IP action under a nickname-discovery label.
- The chat profile exposed room-unban but omitted the matching room-ban action.
- An alternate profile-admin implementation was unreachable from normal UI entry points and was retained only by a stale refresh branch.

## Implemented
- Added `memberAdminActionCatalog(name)` as the canonical source for moderation action permission, label, handler, and grouping.
- Both active profile-admin interfaces render from the catalog.
- Removed the duplicate mute action, corrected the IP label, paired room ban and room unban, and corrected the wall deletion permission gate.
- Removed the obsolete alternate profile-admin function and its stale refresh branch.
- Room-transfer controls in the admin member panel now render only for users with `room_move`.

## Preserved
- Existing server routes and server-side permission enforcement.
- Rank assignment, gifts, member stats, room transfer forms, ignore, notification, and private-message behavior.
- Existing profile layout and CSS in this scoped code change; a visual CSS consolidation is not included because the profile styles are mixed with online-member, wall, identity, and gift styles and require a separate dependency-aware review.

## Verification
- Added regression tests for shared action catalog use, duplicate mute removal, correct wall deletion permission, IP label, room-ban/unban, and removal of obsolete profile-admin code.
- Full project tests, browser JavaScript syntax, archive integrity, and root/public entry-file synchronization are checked before packaging.
- Live browser/mobile behavior and server permissions still require deployment testing.
