# Rimaz — saved continuation checkpoint (2026-11-24)

> **Historical details below:** this checkpoint contains earlier branch SHAs and test status. Current verified repository state: PR #3 branch `fix/bound-private-media-ticket-cache`, head `975a0cdc7c2b0cba104fa1053cb0f4363a08b585`; latest push validation run `45346184696` completed successfully. PR #3 and PR #2 remain open drafts; neither is merged. No production deployment or persistent-volume changes were performed. Use this current status before relying on any older progress notes below.


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


## Startup announcement cleanup persistence fix (2026-11-24)
- Found a startup-only persistence bypass: after removing expired timed announcements, startup wrote the entire in-memory database with direct `fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))` instead of the canonical `save()` routine.
- This bypassed the atomic temp-file/rename contract and could persist `privateMessages` to disk, contrary to the memory-only private-message policy enforced by `save()`.
- Replaced that direct write with `save()`, retaining the existing cleanup and error handling behavior while restoring atomic persistence and the private-message exclusion.
- Added a regression check in `verify.js` that verifies the startup cleanup uses `save()`, does not write DB_FILE directly, and that the canonical save path excludes private messages and uses atomic rename.
- Commits: `6849ebbb6a20b2f9eb116e08925302a05ceec9fe` (server), `8832cd3b6d9ce0509bf56c69d41dbe8debe535ca` (verify).
- Branch-only change; test execution/CI not yet confirmed. No merge, deployment, sync, or production database access.


## Backup privacy boundary fix (2026-11-24)
- Found both database-only and full-backup exports copied the live in-memory `privateMessages` array into downloadable backup payloads, even though private conversations are intentionally transient, excluded from canonical disk persistence, and explicitly not restored.
- Both backup snapshot constructors now set `privateMessages: []` alongside `sessions: {}`. The full backup still includes the existing media archives; no media behavior or chat behavior changed.
- Added regression assertions verifying both backup formats sanitize private messages.
- Commits: `93d52a774f486c55a24f195fdf77759dec0c2a45` (server), `dbab93a848f06037078e6e8dae05ade0c66df7e6` (verify).
- Branch-only. GitHub currently returns no status checks or PR workflow runs for the latest head; execution remains unverified. No merge, deployment, production data access, or behavior changes.


## Admin upload authorization ordering fix (2026-11-24)
- Found two authenticated-but-unauthorized upload routes that parsed and wrote multipart files to temporary upload storage before checking the caller's permission: gift catalog GIF upload and ad campaign image upload.
- Moved authentication and the relevant module/permission checks ahead of their Multer upload middleware. Authorized upload validation, file formats, storage paths, and successful behavior remain unchanged; unauthorized requests are rejected before multipart parsing.
- Added regression checks in `verify.js` asserting the authentication and permission gates occur before the upload middleware for both routes.
- Commits: `ddf33923379497f152bf5573c4b7bc2fcabc0e20` (server), `d623da1535a58e901786b07dfd110497c8ac326b` (verify).
- Branch-only; no runtime test execution or CI success is claimed. No merge, deployment, or production access.


## Additional upload gate coverage (2026-11-24)
- Extended the same pre-upload authorization rule to public room-image changes and personal avatar uploads: room existence plus room-owner/site-owner/room-image permission are checked before Multer; avatar likes eligibility is checked before Multer.
- Existing in-handler checks remain as defense in depth, preserving the original response behavior if state changes while a file is being processed.
- Added regression assertions for both routes. Other upload routes were reviewed: rank artwork, chat banners, smileys, admin room images, restore preview, and personal banners already gate before their upload middleware; general chat media remains intentionally available to authenticated users.
- Commits: `dd115f0b99d67247f4ad21c97ea0c05848204dfd` (server), `7dad203d2160577570622dcf269735efcdb38344` (verify).
- Branch-only; no runtime test execution or CI success is claimed. No merge, deployment, or production access.


## Final integration readiness review (2026-11-24)
- Latest observed PR #3 head before this checkpoint update: `611506b63d6e311aa3234cd050a7de8b8731a026`; PR #2 head: `86137b5de057d72e838dcf10241f6bb5a3d6178e`.
- Both PRs remain open, draft, unmerged, and target `safety/validate-and-backup-before-sync`; GitHub reports both mergeable at this inspection.
- Combined commit statuses and workflow runs returned empty arrays for both latest heads. This is not a passing CI result.
- Integration mismatch found: PR #2's validation workflow targets pull requests to `main` only and runs Node 20; PR #3's workflow also targets `main` only but runs Node 24 and builds Docker. Both PRs currently target `safety/validate-and-backup-before-sync`, so their pull_request validation workflow is not configured for the actual target branch. PR #3 package.json requires Node 24, while PR #2 README/deployment notes still say Node 20 or later. Resolve this deliberately as part of integration; the two branches also modify the same workflow file, so review/resolve the merge sequence rather than assuming conflict-free combination.
- PR #2 improves repository hygiene and guarded ZIP sync: removes the incomplete nested duplicate directory, adds ignore rules and README, preserves Google verification asset, restricts ZIP sync to app-managed files, validates archive paths/version and requires explicit confirmation, and creates a Git rollback branch. Its Git rollback branch is not a backup of Deplexo persistent data.
- PR #3 adds resource bounds/cleanup, rollback-safe persistence for many mutations, room/voice lifecycle cleanup, private backup sanitization, pre-upload authorization gates, Node 24 Docker configuration, and audit/checkpoint documentation.
- Historical green CI references in audit docs belong to earlier commits (including `4b887d809092927be228bd125df815d262403dde`), not the latest PR heads. Do not present 460/477 historical checks as current-head validation.
- Outstanding before merge: resolve workflow target/runtime mismatch and shared-file integration; obtain fresh green checks on the final combined head; verify package install/build; inspect/add a genuine dependency lockfile and switch to `npm ci` only after validating it; perform staging smoke tests including login/reconnect, public/private chat, rooms, voice/video, uploads, backup/restore, and multi-device behavior; collect Deplexo restart/exit/OOM/heap/RSS evidence.
- Production boundaries unchanged: no merge, main update, ZIP sync, deployment/restart, or production volume/database/media access has been performed. Before production, independently back up and verify restore of the live persistent volume and obtain explicit final approval.


## CI alignment and regression assertion repair (2026-11-24)
- Aligned both PR validation workflows with Node.js 24 and added the actual safety PR base branch alongside main, so pull-request checks run for the branches these PRs target.
- Updated PR #2 README and deployment notes from Node 20 to Node 24 to match PR #3 package engine and Docker base.
- Latest PR #2 head `61fa6489f75f9446313e7cf124bc486640a8e1b9`: push and pull_request validation runs completed successfully on Node 24; regression suite passed.
- PR #3 first Node 24 run reached the regression suite and exposed exactly two stale source-text assertions, not syntax or runtime failures: the v46.69 backup assertion still expected the old sessions-only snapshot, and the gift-upload assertion expected Multer before the newly added authorization middleware.
- Updated those assertions in `verify.js` to require private-message sanitization and the gifts module/permission gates before Multer. Commit: `4400248f3715e7f54bbb57703e23dac89fa308db`.
- Await a fresh PR #3 CI run on this latest commit; do not treat the prior failing run as passed. No merge, deployment, main update, ZIP sync, or production data access.


## Final CI confirmation (2026-11-24)
- PR #3 latest observed head: `7d7ce901374f661255ea35d336cdc2a9f5e724d1`.
- Workflow run `45340898331` completed with conclusion `success` on that exact SHA.
- All job steps succeeded: checkout, Node.js 24 setup, JavaScript syntax checks, `npm test`, and production Docker image build.
- PR #2 and PR #3 were re-fetched after this run: both remain open, draft, unmerged, and GitHub reports `mergeable=true`; both target `safety/validate-and-backup-before-sync`.
- This confirms repository CI and container build only. It does not replace dependency-lockfile work, staging smoke tests, Deplexo runtime diagnosis, independent production-volume backup/restore verification, or explicit merge/deploy approval.
- No merge, deployment, main update, ZIP sync, or production database/uploads/private-media access was performed.
