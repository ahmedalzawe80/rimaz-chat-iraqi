# Rimaz — saved continuation checkpoint (2026-11-24)

User priority: make the repository exceptionally clean and fix chat behavior/permissions at the root, with durable solutions and regression tests. Never claim perfection based on CI alone.

## Safety
Do NOT merge PRs, change main, deploy/restart Deplexo, run ZIP sync, or touch production database/uploads/private media without explicit approval. Before deployment require independent backup, verified restore, staging smoke tests, and user approval.

## Repository state
Repository: ahmedalzawe80/rimaz-chat-iraqi
Application branch: fix/bound-private-media-ticket-cache
Current PR #3 head: 0fb68b43b0872cb8b7646b9c3c5b18bd63283a72
PR #3: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/pull/3 (open, draft, not merged)
PR #2: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/pull/2 (open, draft, not merged; head 86137b5de057d72e838dcf10241f6bb5a3d6178e)
Working base: safety/validate-and-backup-before-sync
Last recorded production/base commit: 08807d8be8393a7cf29309c670d7acfd59c5f78c
Deplexo service noble-horizon-5826: https://noble-horizon-5826.de.deplexo.com/
No production deployment or persistent-volume access was performed.

## Latest CI — currently RED, do not overlook
Run: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45286548489
Head: 0fb68b43b0872cb8b7646b9c3c5b18bd63283a72
Syntax checks passed. Regression suite failed exactly these checks:
1. private chat module is enforced on history, contacts, media, and Socket.IO send
2. session transient cleanup runtime fixture
Docker build skipped because tests failed. Diagnose the actual implementation/test mismatch; do not weaken assertions merely to get green. Earlier green run 45286406940 at 477e839e predates latest changes and is not proof current head passes.

## Work already in PR #2
- Removed incomplete nested rimaz-chat-iraqi-main folder after verifying it was not canonical source.
- Preserved root data.json placeholder and Google verification files at root/public; tests check equality.
- Added README, gitignore, documentation, guarded ZIP validation/sync.
- ZIP checks cover unsafe paths, symlinks, duplicates, archive root/source checks.
- Public sync excludes /google1a84d9d1dec7b85d.html from deletion.
- No production ZIP sync performed.

## Work already in PR #3

### Resource lifecycle
- Private media tickets reused for same account/file; idle expiry refresh; cap 32/account and 4096/process; authorization retained.
- Startup orphan sessions get 60-second reconnect grace, then batch cleanup with one save, rollback and retry.
- Unified room/voice state cleanup across leave, move, disconnect, global kick/ban, member-card kick/ban, room ban; remove empty maps and notify peers.
- Room deletion only evicts users/clears voice state after durable save.
- Public 24-hour retention saves before events/unlink; failure restores collections and preserves files/events.
- Private read cursors/hide state persist with rollback; read-all cursor map bounded to 500 contacts.
- Private anti-spam state bounded and retained only through reconnect grace.

### Transactional persistence and permission fixes
- Announcement publish/delete save before socket events; rollback on failure; timed expiry/repeat retries.
- Rollback-safe admin message deletion, profile edits, likes/points, avatar deletion, room ban/mute, unmute/unban, ignore toggles, notification read-all, wall controls.
- Member-card global ban, room ban/mute, likes, VIP, gifts save before events/disconnects and roll back on failure.
- Public upload cleanup checks remaining references before unlinking; shared media is preserved.
- Session creation, registration, guest creation restore related state if save fails.
- Notification/login-history writes, expired bans, VIP/rank expiry, guest entry status, profile-status migration, admin audit writes restore previous state on failure.
- Subscription plan create/delete, assign/renew and cancel now snapshot/restore subscriptions, member profile and audit log on failed save.
- Ad campaign create/update/delete and control-center module changes restore previous state and audit log on failed save.
- Subscription audit entries append immutably to support rollback.
- Generic rank hierarchy no longer treats permission_manage as a blanket bypass. Explicit permission editor exception cannot grant permissions the acting manager does not possess.

### Container
- Docker uses node:24-bookworm-slim and NODE_ENV=production.
- CI uses Node 24 and builds production Docker image after tests.
- .dockerignore excludes secrets, certificates, backups, database, runtime data, uploads and private media.
- Remaining reproducibility gap: no package-lock.json/npm shrinkwrap yet; Docker still uses npm install --omit=dev, not npm ci. Generate a real lockfile from trusted registry; never fabricate integrity hashes.

## Saved reports
Handoff: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/blob/fix/bound-private-media-ticket-cache/HANDOFF-2026-11-24.md
Runtime resource audit: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/blob/fix/bound-private-media-ticket-cache/RUNTIME-RESOURCE-AUDIT-2026-11-24.md
Transaction audit (verify file exists on branch): https://github.com/ahmedalzawe80/rimaz-chat-iraqi/blob/fix/bound-private-media-ticket-cache/TRANSACTION-SAFETY-AUDIT-2026-11-24.md

## Next actions
1. Diagnose/fix the two current red checks, rerun CI, verify Docker build.
2. Continue audit of all persistent mutation paths, especially subscriptions, ads, rank definitions, restore, private cursors.
3. Compare all Socket.IO authorization with HTTP equivalents; test stale sockets/direct HTTP/alternate routes.
4. Audit rate limits, timers, Maps/Sets, collection bounds and cleanup.
5. Keep root index.html/public/index.html identical where required.
6. Generate genuine npm lockfile and switch to npm ci.
7. Inspect Deplexo exact deployed commit/image digest, instance count, exit code, OOM and health-check reason. Historical startup messages and ReferenceError ticket is not defined do not prove cause.
8. Never merge/deploy without independent backup+restore, staging smoke tests, and explicit approval.

Resume phrase: "نكمل مشروع ريماز من CHECKPOINT-2026-11-24.md؛ عالج فشل CI الحالي (فحص private chat module وفحص session transient cleanup)، ثم واصل تدقيق الصلاحيات والحفظ والاعتمادات، بدون دمج أو نشر."
