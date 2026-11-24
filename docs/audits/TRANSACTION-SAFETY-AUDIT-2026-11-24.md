# Rimaz Chat — transactional persistence and permission audit (2026-11-24)

## Scope and limits
This report records concrete server-side changes on `fix/bound-private-media-ticket-cache`. It does not inspect the live Deplexo container, production database, or persistent volume. CI fixtures do not replace staging/live smoke tests.

## Confirmed failure patterns addressed

### Announcement state
- Publication now saves the announcement message and permanent-repeat timestamp before broadcasting.
- Save failure restores messages and scheduling fields.
- Deletion now saves before emitting deletion events and restores announcement/message collections on failure.
- Temporary expiry and permanent repeat timers retry after transient save failure.

### Member and moderation writes
Rollback-safe persistence was added to admin message deletion, profile edits, likes/points, avatar deletion, room ban/mute and unmute/unban, ignore-list toggles, notification read-all, wall controls, member-card global ban/room ban/mute, likes, VIP and gifts.
- Failed saves restore previous state.
- Socket events and disconnects occur after successful save when they represent the durable action.
- Registration, guest creation and session creation restore account/profile/session/member-number/bootstrap state on failure.
- Notification and login-history helpers, expired room/global ban cleanup, expired VIP/rank cleanup, guest-entry status, profile-status migration and admin audit logging restore prior state on failure.

### Upload ownership
- Public upload cleanup uses `removePublicUploadIfUnreferenced`.
- The helper validates the URL prefix and basename, checks remaining database references, and only then unlinks the file.
- Applied to profile/avatar/banner, room images, rank artwork/banners, ads and gift catalog media.
- Failed uploads remove only the newly uploaded file.

### Rank hierarchy and delegated permissions
- Removed the blanket `permission_manage` bypass from the generic higher-rank guard.
- The account-permission editor retains its explicit exception, while preventing a delegated manager from granting permissions they do not already hold.
- Regression fixtures verify a lower-ranked delegated permission manager cannot bypass higher-rank protection for moderation.

## Runtime/container
- Docker uses `node:24-bookworm-slim`; CI runs on Node 24 and builds the production image.
- `.dockerignore` excludes secrets, certificates, backups, database files, runtime data, uploads and private media.
- Node 20 is EOL; Node 24 is an LTS line. See the official Node.js release schedule.
- Open dependency gap: no `package-lock.json` or shrinkwrap is present. Docker still uses `npm install --omit=dev`; reproducible dependency resolution is not yet established. Generate a genuine lockfile from the trusted npm registry, then move to `npm ci`.

## CI evidence
- Latest completed green run before the final workflow-label-only commit: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45285551824
- Commit: `4b887d809092927be228bd125df815d262403dde`
- 477 successful checks; zero failures.
- Syntax checks, project regression suite and Docker build passed.
- CI output explicitly states that live-server testing remains required.
- Verify the latest CI run for `3118a282...` before treating it as the newest green commit.

## Remaining risks
- Subscription, ads, rank-definition, restore and all remaining persistent mutation paths need a systematic transaction audit.
- All Socket.IO and HTTP moderation paths need a complete permission-equivalence review.
- No production restart cause, OOM event, exit code or health-check termination reason has been established.
- No staging restore, live media playback, or multi-device chat/voice smoke test has been performed.
- Do not merge, deploy, restart, or run destructive ZIP sync without explicit user approval and an independently verified backup/restore.


## Startup migration fail-closed repair — 2026-11-24
- Confirmed startup migration paths previously caught save failures and continued: smiley gallery migration, welcome-message defaults, expired-announcement cleanup, and gift catalogue migration.
- This could leave memory ahead of disk and allow an unrelated later write to persist a migration whose own commit had failed.
- All four paths now log a fatal startup error and throw when persistence fails. Startup stops rather than serving a mixed committed/uncommitted state.
- Added four regression assertions. Exact PR head `de1225f8d9b0ecfa25c8666a3c641aa87ba19714`, run `45379172304`: 552 pass markers, zero failures; syntax, regression, and Docker build succeeded.
