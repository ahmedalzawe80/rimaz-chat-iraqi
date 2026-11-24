# Rimaz — saved continuation checkpoint (2026-11-24)

> **Current repository status (2026-11-24):** latest reviewed branch head before this checkpoint refresh is `f9c3872594fa7ff86208c4bc0c93c3a2e6e379d7`. PR #3 pull-request run `45354451886` completed successfully on that exact SHA: Node.js 24 selected from `.nvmrc`, JavaScript syntax checks passed, all 518 regression checks passed with 0 failures, and the production Docker build succeeded. The push-triggered run for the same SHA was still pending when checked. PR #3 remains open/draft against `safety/validate-and-backup-before-sync`. PR #2 remains open/draft at `61fa6489f75f9446313e7cf124bc486640a8e1b9`; all 11 of its changed paths also appear in PR #3, so it is redundant and must not be merged separately. `main` remains at `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`; the safety base remains at `08807d8be8393a7cf29309c670d7acfd59c5f78c`. No Deplexo deployment, ZIP synchronization, or live persistent-volume changes were performed.
>
> **Repository structure status:** 392 tracked files, with only three top-level directories (`.github/`, `docs/`, and `public/`). The root contains only three Markdown guides (`README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`); project, audit, and operations documentation is categorized under `docs/`. `.nvmrc` is the shared Node.js major-version source for local development, the main validation workflow, and archive validation. Five identical-content file pairs were reviewed: two synchronized root/public HTML and verification copies, plus three media filename pairs retained because asset filenames can affect generated IDs.
>
> **Outstanding:** no committed `package-lock.json`; dependency installation is therefore not fully reproducible. Staging smoke tests, independent backup/restore verification, and live Deplexo resource measurements remain unperformed. CI success is not proof of live production health.


User priority: make repository structure and maintenance professional first; then continue root-cause application fixes with regression tests. Never claim perfection based on CI alone.

## Safety
Do NOT merge PRs, change main, deploy/restart Deplexo, run ZIP sync, or touch production database/uploads/private media without explicit approval. Before deployment require independent backup, verified restore, staging smoke tests, and user approval.

## Repository state
Repository: ahmedalzawe80/rimaz-chat-iraqi
Application branch: fix/bound-private-media-ticket-cache
Latest fully pull-request-validated code head at checkpoint baseline: f9c3872594fa7ff86208c4bc0c93c3a2e6e379d7
PR #3: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/pull/3 (open, draft, not merged)
PR #2: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/pull/2 (open, draft, not merged; head 61fa6489f75f9446313e7cf124bc486640a8e1b9; all 11 changed paths overlap PR #3)
Working base: safety/validate-and-backup-before-sync
Last recorded production/base commit: 08807d8be8393a7cf29309c670d7acfd59c5f78c
Deplexo service noble-horizon-5826: https://noble-horizon-5826.de.deplexo.com/
No production deployment or persistent-volume access was performed.

## Latest CI — current checkpoint baseline

- Latest reviewed code SHA: `f9c3872594fa7ff86208c4bc0c93c3a2e6e379d7`.
- Pull-request run `45354451886` completed successfully on that exact SHA.
- Job `validate` succeeded: Node.js was selected from `.nvmrc`; JavaScript syntax checks passed; `npm test` completed with 518 pass markers and 0 failure markers; production Docker build passed.
- Push run `45354446635` for the same SHA was pending at the time of this checkpoint. Do not treat a pending run as complete.
- Both validation workflows now use immutable action commit pins and read the shared `.nvmrc` version. Main validation also cancels superseded runs.
- This is CI/container evidence only, not staging or live-production verification.

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
Handoff: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/blob/fix/bound-private-media-ticket-cache/docs/project/HANDOFF-2026-11-24.md
Runtime resource audit: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/blob/fix/bound-private-media-ticket-cache/docs/audits/RUNTIME-RESOURCE-AUDIT-2026-11-24.md
Transaction audit (verify file exists on branch): https://github.com/ahmedalzawe80/rimaz-chat-iraqi/blob/fix/bound-private-media-ticket-cache/docs/audits/TRANSACTION-SAFETY-AUDIT-2026-11-24.md

## Next actions

1. Confirm CI for the checkpoint-update commit and verify both push and pull-request runs on the latest SHA.
2. Finish repository integration review. PR #2 has no unique changed paths compared with PR #3; keep it open as a draft until the user explicitly approves closing it.
3. Generate a genuine `package-lock.json` using the trusted npm registry, review the resolved dependency tree, validate on Node 24, then move Docker/CI to deterministic `npm ci`. Do not fabricate lockfile integrity values.
4. Continue audit of persistent mutation paths, Socket.IO/HTTP authorization parity, timers, rate limits, and bounded Maps/Sets.
5. Complete staging smoke tests: login/reconnect, public/private chat, rooms, voice/video, uploads, backup/restore, and multi-device behavior.
6. Obtain Deplexo deployment SHA/image digest, instance count, exit status, OOM evidence, and heap/RSS measurements.
7. Before any production promotion: independently back up the persistent volume, verify restore, complete staging tests, and obtain explicit approval.

Resume phrase: "نكمل مشروع ريماز من CHECKPOINT-2026-11-24.md؛ ابدأ من آخر SHA ونتائج CI المسجلة، وواصل ترتيب المستودع وتدقيق الحفظ والصلاحيات والاعتمادات، بدون دمج أو نشر."


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


## Continued audit checkpoint — 2026-11-24 (latest verified branch state)
- PR #3 remains open/draft and targets `safety/validate-and-backup-before-sync`. Current head: `65c258692c8768b0d5ced74507e06cd6ee495ce5`; current base: `08807d8be8393a7cf29309c670d7acfd59c5f78c`.
- Pull-request workflow run `45354617318` completed successfully on that exact head SHA. This is the latest confirmed CI result; do not infer anything about unobserved push-triggered runs.
- Rechecked the application route inventory: 74 `/api/admin` route declarations were found. The inventory shows authentication/permission middleware or explicit authorization checks on the routes inspected, including the member-action dispatcher and the specialized smiley-upload permission middleware. This is an inventory pass, not a completed proof of authorization parity.
- Rechecked the five-minute global-ban flow: the ban is saved before side effects, matching sockets are removed/disconnected, and room join checks the active global ban. Public `send-message` also checks current socket/session and room mute/ban state; a direct per-message global-ban check is a possible defense-in-depth improvement, but no bypass was reproduced, so no speculative code change was made.
- Reviewed the atomic save implementation and selected moderation/member routes: writes use temp-file creation with exclusive mode, close, then rename; the sampled routes restore in-memory state when save fails and emit side effects only after successful persistence. This does not yet constitute a full audit of every mutation route.
- Dependency lockfile remains absent. No lockfile was fabricated, no dependency versions were pinned by guesswork, and no install workflow was changed.
- No source-code change was made in this audit pass because no new reproducible defect was established. Continue with exhaustive Socket.IO/HTTP authorization equivalence and persistent mutation failure-path review, adding regression tests for any confirmed issue.
- No merge, PR closure, production deployment, restart, ZIP sync, or live persistent-volume modification was performed.


## Public chat global-ban defense-in-depth fix — 2026-11-24
- Confirmed a defense-in-depth gap in Socket.IO `send-message`: room join checked global name/IP bans and the ban action disconnects matching sockets, but the message handler itself did not recheck the current global-ban state.
- Added `globalBanned(u.name,socketClientIp(socket))` to the public room message handler before room mute/ban checks and before message persistence/broadcast. A currently banned identity/IP is now rejected at send time even if a stale/racing socket reaches the handler.
- Added a regression assertion in `verify.js` requiring this send-time global-ban check and its error path.
- Code/test commit head: `a0c7543875bf8077de68d7af6dcd0bd5fa5ed526`.
- Workflow run `45362431893` completed successfully on that exact SHA: JavaScript syntax, project regression tests, and production Docker build all succeeded.
- The next commit only updates checkpoint/handoff documentation; CI for that documentation-only SHA must be checked separately.
- No live deployment, merge, restart, or production data modification.


## Admin upload audit-trail consistency fix — 2026-11-24
- A focused inventory of all 74 /api/admin route declarations found one route using the dedicated requirePermission('smileys_manage') guard instead of the central requireAdmin guard: POST /api/admin/chat-tools/smiley-upload.
- Authentication and the smileys_manage permission were already enforced before multipart parsing; this was not an unauthenticated route. The inconsistency meant successful smiley uploads bypassed the central admin audit-log hook.
- Added an explicit permissionForAdminPath mapping for this endpoint and routed it through requireAdmin, preserving the same permission and authorization-before-upload ordering while restoring central audit logging.
- Added a regression assertion for the exact route, permission mapping, and central guard. Code/test tip: 15072ddf331f2a76ce4215cd50b8f8819d0aa45d.
- Pull-request workflow run 45373425456 completed successfully on that exact SHA: syntax checks, npm test, and Docker build passed; 520 pass markers and 0 failure markers.
- The remaining custom admin routes were inventoried and each includes authentication plus explicit permission/role checks; a full action-by-action parity proof remains ongoing.
- No merge, PR closure, production deployment, restart, ZIP sync, or live data/volume modification was performed.


## Graceful-shutdown persistence failure reporting — 2026-11-24
- Confirmed that gracefulShutdown logged a failed final atomic database save but still called process.exit(0), falsely reporting a clean shutdown when the final write failed.
- Changed shutdown to exit 0 only after a successful final save; a failed final save now closes Socket.IO and exits with status 1 so the supervisor/host can detect an unsuccessful shutdown.
- Added a regression fixture covering both successful and failed final-save exit statuses.
- Latest code/test SHA: e501cc27925274e22cbaf6d2c9505d3b1e1a5c72. CI run/status was not yet visible when this checkpoint was written; do not claim this change is validated until a workflow completes successfully on this exact SHA.
- Prior verified code/test SHA 15072ddf331f2a76ce4215cd50b8f8819d0aa45d passed run 45373425456 with 520 pass markers and 0 failures.
- No merge, deployment, restart, ZIP sync, or live persistent-volume/data modification.

- Validation update: workflow run 45373709187 completed successfully on exact code/test SHA e501cc27925274e22cbaf6d2c9505d3b1e1a5c72; 521 pass markers, 0 failure markers, syntax/regression checks and production Docker build succeeded. The log explicitly says live-server testing is still required.

## Public chat durable-acknowledgement repair — 2026-11-24
- Confirmed a real persistence-semantics defect in public room chat: addMessage appended to in-memory history, scheduled a delayed write, and callers broadcast/returned success before the database write completed. A later disk failure could therefore leave users seeing a message that was not durably stored.
- Replaced fire-and-forget message writes with a bounded batch commit queue. Pending messages remain outside db.messages/room history until the atomic database save succeeds. The queue batches concurrent messages, commits the candidate history, then resolves callers; on failure it restores the previous committed message array and retries up to three attempts. After the final failure, all pending callers are rejected and the uncommitted messages are discarded from memory.
- Updated HTTP /api/message and Socket.IO send-message to await the commit before broadcasting or returning success. Bot messages, welcome messages, and room join/move/leave/disconnect presence events also await the same commit before broadcasting.
- Graceful shutdown now attempts to flush queued messages and exits nonzero if pending writes remain uncommitted. The database save path now fsyncs the temporary file before atomic rename and best-effort fsyncs the data directory after rename.
- Added runtime regression fixtures for pending-message invisibility, commit-before-resolution, retry after a simulated disk failure, and transport broadcast ordering. Existing shutdown and batching fixtures were updated for the new queue contract.
- Latest code/test head: 65f3be74386dd59b68a0bec09883d3da41ec7b19.
- PR #3 run 45376045363 and push run 45376034493 both completed successfully on that exact SHA. The PR validation job passed JavaScript syntax, the regression suite (526 pass markers, 0 failure markers), and production Docker build.
- CI output explicitly states live-server testing is still required. This change has not been tested against the Deplexo production process or persistent volume.
- PR #3 remains open and draft, currently mergeable, and unmerged. PR #2 remains open/draft and overlaps the cleanup changes; do not merge or close either without explicit direction.
- package-lock.json is still absent; dependency resolution is not yet reproducible. Do not switch to npm ci until a real registry-generated lockfile is reviewed and validated on Node 24.
- No merge, production deployment/restart, ZIP sync, or live persistent-volume/database/uploads/private-media modification was performed.

## HTTP / Socket.IO public-chat parity continuation — 2026-11-24
- The public HTTP fallback now checks that the socket belongs to the current authenticated session and matching account, and that it is joined to the requested room.
- HTTP and Socket.IO now call the same room anti-spam limiter (burst/repeat policy); Socket.IO normalizes the text to the same 2000-character limit before policy checks.
- HTTP fallback preserves built-in bot commands by invoking the same server command handler before treating the text as a normal room message.
- Added regression assertions for transport policy parity and a runtime fixture for burst/repeat rate limiting.
- Latest branch head: 727d3f8401ef69d62eeaa2ec162f4580f9f3352b. Latest exact-SHA CI run 45376496516 completed successfully: 530 pass markers, 0 failure markers, production Docker build passed.
- CI still explicitly requires live-server testing. This is not a production deployment or a validation of the Deplexo live volume.
- PR #3 remains open/draft and targets the safety branch (base SHA 08807d8be8393a7cf29309c670d7acfd59c5f78c), not main. Main remains at a2c74fded15ea5cfde38d310a84c3c8edfe994b3. The cleanup and chat fixes are therefore not yet in main or the live site.
- Current branch tree root is reduced to application/config essentials; documentation is grouped under docs/, and the obsolete nested project directory is absent. The root data.json is a documented placeholder, and the audit ZIP remains because workflows refer to it.
- Next: stop making isolated micro-commits; reconcile overlapping PR #2/#3, review final diff as one release candidate, then obtain/verify backup + staging before any main merge or production promotion.


## HTTP bot-command response parity — 2026-11-24
- Follow-up review found a concrete transport mismatch: the shared bot command handler emitted a Socket.IO error for an unauthorized or incomplete `/تنبيه` command, but the HTTP fallback still returned `{ok:true,command:true}`, falsely acknowledging the command.
- The shared handler now accepts an optional error callback. The HTTP route maps missing admin permission to HTTP 403 and missing notice text to HTTP 400; the Socket.IO path retains its existing `error-msg` behavior. Authorization remains enforced by `canNotice(user)`.
- Added regression checks proving both transports call the shared handler, HTTP does not return false success, and the permission/argument failures retain their expected status and socket error behavior.
- One intermediate test commit had a JavaScript syntax error in the newly added test block (run 45377300512); the test was corrected before proceeding. The corrected exact code/test SHA `af883dd9e02588e3938b64d00bd2f26859b3d4a9` passed run `45377349922`: 535 pass markers, 0 failure markers, syntax checks passed, regression suite passed, and production Docker build passed.
- CI still explicitly states live-server testing is required. This validates source/static fixtures and container build only, not Deplexo runtime behavior or persistent-volume safety.
- PR #3 remains open/draft and unmerged. No merge, PR closure, production deployment/restart, ZIP sync, or live data/volume modification.


## Logout reconnect-grace rollback repair — 2026-11-24
- A focused persistent-session audit found a lifecycle ordering defect in `POST /api/logout`: it cancelled the disconnected-session reconnect-grace timer before attempting the durable session deletion. If the database save failed, the route restored the session in memory/database and returned HTTP 500, but the cleanup timer remained cancelled. A disconnected session could then become orphaned beyond its intended grace period.
- Moved `cancelSessionDisconnectCleanup(sid)` to after the successful save. On persistence failure, the existing rollback restores the session and the original reconnect timer remains active; on success, the timer is cancelled before transient state is cleared and sockets are disconnected.
- Added three regression assertions for save-before-cancel ordering, rollback behavior, and successful cleanup ordering.
- Exact code/test SHA `c6a9885aaed362433be28444ecedbd00f1aa0d5c` passed PR workflow run `45377998719`: 538 pass markers, 0 failure markers, JavaScript syntax checks passed, full regression checks passed, and production Docker build passed.
- CI is still not a substitute for staging/live-server testing. No merge, PR closure, production deployment/restart, ZIP sync, or live persistent-volume/database/uploads/private-media modification.


## Disconnected-session retry and HTTP chat metadata parity — 2026-11-24
- A second lifecycle defect was found in `scheduleSessionDisconnectCleanup`: after the 60-second grace timer fired, a failed database save restored the session but returned without scheduling another cleanup attempt. The session could remain orphaned indefinitely in the running process.
- The failure path now schedules a fresh 60-second cleanup attempt after restoring the session and guest/profile state. The timer remains bounded and unref'ed; transient state is still cleared only after a successful save.
- The HTTP `/api/message` fallback also now includes the same `role` and effective `vip` fields as Socket.IO `send-message`, keeping public-message payload metadata consistent across transports.
- Added regression checks for cleanup retry, rollback ordering, and HTTP/Socket.IO message metadata parity.
- Exact code/test SHA `41742dda0db75e22d9d8906de3261dfd88231d5c` passed PR workflow run `45378243267`: 544 pass markers, 0 failure markers, JavaScript syntax checks, regression suite, and production Docker build all succeeded.
- CI validates repository checks and image construction only; live-server/staging and persistent-volume backup/restore validation remain outstanding. No merge, PR closure, deployment/restart, ZIP sync, or live data/volume modification.


## Rank assignment exact rollback repair — 2026-11-24
- Transaction review found that a failed `POST /api/admin/rank` save restored a cloned target profile even when no profile existed before the operation. It also left newly created empty root objects (`rankAudit` / `notifications`) in memory rather than restoring their original existence state.
- The route now snapshots prior existence for the target profile, rank-audit root, notifications root, and target inbox. On save failure it restores the previous profile only if it existed, otherwise removes the newly created profile; it restores or deletes the rank-audit and notifications roots according to their prior existence and restores the target inbox exactly.
- Added regression assertions for each rollback boundary.
- Exact code/test SHA `8c6134e2d320618f171b4120a3de9bf1c0913942` passed PR workflow run `45378519916`: 548 pass markers, 0 failure markers, syntax checks, full regression suite, and production Docker build passed.
- No merge/deployment or production data/volume modification. Live/staging verification and backup/restore are still required before promotion.


## Fail-closed startup migration persistence — 2026-11-24
- A startup audit found four migration/cleanup paths that logged a failed save and continued booting with changed in-memory state: smiley gallery migration, welcome-message defaults, expired-announcement cleanup, and gift catalogue migration.
- These paths now fail startup explicitly when their durable save fails. This prevents a later unrelated write from silently persisting a migration that never committed at startup.
- Added four regression assertions covering each fail-closed path.
- Exact head SHA `de1225f8d9b0ecfa25c8666a3c641aa87ba19714` passed PR workflow run `45379172304`: 552 pass markers, zero failure markers, JavaScript syntax, regression suite, and production Docker build all succeeded.
- No merge, deployment/restart, ZIP sync, or live persistent-volume/data modification. Staging and verified backup/restore remain mandatory before promotion.


## Rank-art rollback regression fixture + startup migration audit — 2026-11-24
- Added checks for rank artwork assignment restoring prior art ID and URL on save failure, and for emitting updates only after save succeeds.
- Initial test fixture incorrectly escaped its route-boundary newline and failed all four checks; corrected the fixture (not production route) and reran.
- Exact SHA `c30b7b92093dbbf4162cb6f30573355ad20b0f1f`, PR workflow run `45379916442`: 556 pass markers, zero failures; syntax checks, full regression suite and Docker build passed.
- No production deployment, live data changes, merge, or destructive synchronization.
