# Rimaz — saved continuation checkpoint (2026-11-24)

User priority: make the repository exceptionally clean and fix chat behavior/permissions at the root, with durable solutions and regression tests. Never claim perfection based on CI alone.

## Safety
Do NOT merge PRs, change main, deploy/restart Deplexo, run ZIP sync, or touch production database/uploads/private media without explicit approval. Before deployment require independent backup, verified restore, staging smoke tests, and user approval.

## Repository state
Repository: ahmedalzawe80/rimaz-chat-iraqi
Application branch: fix/bound-private-media-ticket-cache
Current PR #3 head: 22546fac8d8eee45c4046f3963c9bc60c2378ab0
PR #3: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/pull/3 (open, draft, not merged)
PR #2: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/pull/2 (open, draft, not merged; head 86137b5de057d72e838dcf10241f6bb5a3d6178e)
Working base: safety/validate-and-backup-before-sync
Last recorded production/base commit: 08807d8be8393a7cf29309c670d7acfd59c5f78c
Deplexo service noble-horizon-5826: https://noble-horizon-5826.de.deplexo.com/
No production deployment or persistent-volume access was performed.

## Latest CI — verification not yet reported for latest commit
Latest diagnosis: the private-chat assertion was overly exact about listener text; corrected to reflect actual socket data declaration without removing enforcement checks. The transient cleanup fixture had a genuine test harness omission: it declared `privateMessageWindows` but failed to pass it into the VM context executing `clearSessionTransientState`, causing a runtime ReferenceError. Commit `84ce94e3ad51550dc70913bc4b3f482a542328d8` fixed assertion text and fixture map declaration; commit `22546fac8d8eee45c4046f3963c9bc60c2378ab0` subsequently added the missing VM-context binding. CI status and workflow-run retrieval for this latest SHA returned no records; success is not confirmed. Earlier green run 45286406940 predates these changes and is not proof current head passes.

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


## Continuation progress (2026-11-24)
- Latest repair commit: `22546fac8d8eee45c4046f3963c9bc60c2378ab0` (test fixture VM binding).
- Latest CI lookup for this commit: no status records and no PR workflow runs returned by connector; CI remains unverified.
- No merge, deployment, sync, or production data access occurred.


## Further audit — 2026-11-24
- Subscription audit found unbounded per-subscription `history` arrays on grant/renew and cancel. Both paths now truncate history to the latest 100 entries after prepending each event.
- Added a regression assertion in `verify.js` to check both assign and cancel paths cap history at 100 entries.
- This is a bounded-memory/data-growth improvement, not a live test result. CI availability still unresolved.
- Commits: `92ef66daeb4b50ee9dde11fb363348d71767b302` (server) and `5b2b1a20b9c7d54e37f9544dd84fa7150aa8f144` (test).


## Socket leave-room authorization review (2026-11-24)
- Found that `leave-room` accepted a caller-supplied room without requiring it to match the socket's authenticated current room or its Socket.IO room membership. The handler then cleared the user's active room state, creating an inconsistent runtime state.
- Added guard requiring `room===u.room` and `socket.rooms.has(room)` before mutation, and a regression check in verify.js.
- Changes are branch-only; no runtime execution/CI proof, merge, deployment, or production access.


## Room voice negotiation lifecycle hardening (2026-11-24)
- Found that authorized room voice negotiation pairs had no independent expiry or global capacity bound; abandoned negotiations could remain in memory until a peer left/disconnected.
- Added a 120-second TTL, periodic stale-pair pruning, an 8,192-pair process cap, and expiry/participant checks before answer and ICE relay.
- Added regression coverage for expiry, capacity, pruning, and ICE participant authorization.
- Branch-only changes; no CI/runtime test success asserted, no merge, deployment, or production data changes.


## Private call answer expiry enforcement (2026-11-24)
- Found that the answer handler trusted a pending pair without independently checking its 120-second offer age or confirming the caller socket still existed. The scheduled timeout is not a substitute for validating state at the authorization boundary.
- Added answer-time expiry rejection and removal, timeout notifications, and orphaned-caller cleanup before accepting an answer.
- Added regression coverage. Branch-only; CI/runtime execution not confirmed; no merge/deploy/production data changes.
