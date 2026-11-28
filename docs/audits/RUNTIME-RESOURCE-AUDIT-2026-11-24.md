# Runtime resource audit — 2026-11-24

> **Dated source audit (2026-11-24).** Findings below are tied to the reviewed snapshot and do not represent a fresh production measurement. Consult the [2026-11-27 checkpoint](../project/CHECKPOINT-2026-11-27.md) for the latest candidate and remaining production evidence gaps.

## Scope and limits

This review inspected the checked-in server.js and its resource lifecycles. It did not inspect the live Deplexo container filesystem or measure production memory. The findings below identify concrete code paths; they do not establish the cause of the previously observed container restarts or prove an out-of-memory event.

## Confirmed resource-lifecycle gaps addressed in this branch

### 1. Private media playback-ticket cache had no hard capacity

The authenticated media-ticket route created a new random 15-minute ticket for every valid request. Expired entries were swept every five minutes and during requests, but there was no global or per-account maximum. Repeated requests could therefore grow the in-memory Map for the ticket lifetime.

The change:
- Reuses an unexpired ticket for the same account and exact filename, refreshing its 15-minute idle expiry.
- Limits each account to 32 active tickets.
- Limits the process-wide cache to 4,096 active tickets.
- Returns HTTP 429 for the per-account limit and HTTP 503 for global capacity.
- Retains the existing 15-minute expiry, account binding, filename checks, participant authorization, and private stream route.

### 2. Persisted sessions from a prior process were not scheduled for disconnect cleanup on startup

The server loaded db.sessions into the in-memory sessions Map at startup. The 60-second disconnect cleanup was scheduled only from a live Socket.IO disconnect event. If a process exited abruptly, no disconnect event could run; those persisted session entries could remain valid and accumulate across restarts.

The change:
- Captures the sessions loaded at startup.
- Gives them the existing 60-second reconnect grace.
- Preserves a session if its socket reconnects during the grace period or if its own disconnect-cleanup timer is already active.
- Removes remaining orphaned sessions in one batch and performs one durable save rather than one save per session.
- Removes guest/profile/read-cursor state only for orphaned guest sessions.
- Restores the prior in-memory state and retries after 30 seconds if the durable save fails.

## Regression coverage

The branch adds dynamic tests for ticket reuse, expiry, per-account and global caps, startup session reconnect preservation, batch cleanup, rollback/retry on save failure, transactional 24-hour retention rollback, room-state release, peer notifications, empty-map removal, and room deletion ordering. The latest CI run passed 460 checks with zero failures.

### 3. Room-scoped voice state was not consistently released on every removal path

The in-memory room membership and voice maps were cleaned in the normal leave/disconnect paths, but several administrative removal paths and room deletion did not share the same cleanup logic. This could leave stale room membership, speaker entries, and authorized voice-negotiation pairs after a user was kicked/banned or a room was deleted.

The change:
- Introduces one room-runtime cleanup routine used by room moves, explicit leave, disconnect, global kick/ban, member-card kick/ban, room ban, and admin kick.
- Removes the session from room membership and speaker maps, clears its active voice-negotiation pairs, notifies remaining peers, and deletes empty room buckets.
- On room deletion, evicts connected members and clears all room-scoped maps only after the database save succeeds.
- Synchronizes the active room value on both socket and session records for room-ban/admin-kick paths.

### 4. Public 24-hour retention cleanup was not transactional

The retention routine removed expired messages and wall posts from memory, emitted deletion events, and unlinked media files before attempting the database save. If the save failed, the durable database could still reference media files that had already been deleted, while the in-memory database had already discarded the content.

The change:
- Snapshots the affected message, wall, likes, and comments collections.
- Attempts the durable save before broadcasting deletion events or unlinking expired media.
- On save failure, restores the prior collections and keeps the media files and client-visible state intact.
- Only after a successful save does it emit deletion events and remove media that is no longer referenced.

## Not established

- No evidence yet ties either gap to the historical ticket is not defined stack trace.
- No evidence yet proves the historical container restarts were caused by OOM.
- The current production database size, heap usage, container exit code, and restart reason remain unmeasured.
- The changes have not been deployed to Deplexo and have not been exercised against the live persistent volume.

## Next production evidence required

Before deployment, inspect the hosting container events and resource graphs, capture the live database file size and Node heap/RSS under normal traffic, and verify the restart reason and running commit. Preserve the live data volume and use a staging deployment for smoke and restore tests.

## Historical Deplexo log correlation — 2026-11-24

### Repeated port-3000 startup messages

The historical log line `Rimaz server listening on 3000` reports the HTTP server's listening port. In the current source, `PORT` is configured from `process.env.PORT || 3000`, and the Dockerfile exposes port 3000. The repeated line proves that the process entered its listen callback multiple times; it does **not** identify a 300 MB limit, connection limit, timeout, or restart cause. Correlate each start timestamp with the provider's container lifecycle events and exit status.

### Historical `ticket is not defined` exception

The earlier Deplexo log reported `ReferenceError: ticket is not defined` four times at the then-deployed `/app/server.js:657`, reached through `requireAuth` at line 646. The current candidate's private-media stream route explicitly declares `const ticket=privateMediaPlaybackTickets.get(token)` before reading `ticket.expiresAt`, `ticket.filename`, or `ticket.account`. This source-level comparison suggests the old deployed artifact/path differed from the current candidate; it does not prove which revision was live when the error occurred.

Five isolated regression checks were added for the current ticket implementation: same-account/file ticket reuse and expiry refresh, the 32-ticket per-account cap, the 4,096-ticket process-wide cap, expiry pruning, and declaration/authorization ordering in the stream route. Candidate push run [45479669853](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45479669853) passed source and extracted-archive validation with **608 checks and zero failures** in each, and both Docker builds succeeded. This validates the candidate only; confirm the deployed commit and inspect contemporaneous logs after a staged deployment before declaring the historical production exception resolved.

### 128 MB hosting memory violation

The user-provided Deplexo panel showed 37.4 MB used out of 128 MB at the time it was viewed, while the provider also recorded a prior memory-limit violation. Four low-load health snapshots (one online user) showed RSS between 72.14 and 75.97 MB without a monotonic rise. Those snapshots do not establish peak usage or rule out a leak under concurrent traffic.

The current server health endpoint reports RSS, heap used/total, external memory, array buffers, database bytes, upload file count/bytes, uptime, online users, and room count. Restore uploads are staged to disk rather than Multer memory storage; pending previews retain a path and summary, are capped at two, and expire after five minutes. The restore file limit is 20 MB. Confirmation still reads the JSON text and parses the replacement object, so a large restore can temporarily require substantial additional memory.

**Status:** the historical 128 MB violation is not proven fixed. No production OOM event, exit code, current database size, or representative concurrent-load measurement is available. Do not lower Node's heap limit or claim memory safety based only on the low-load snapshots. Required evidence is a staged run under representative load with repeated RSS/heap/external/arrayBuffers samples, database size, upload activity, process exit/restart events, and provider OOM status.


## Root-cause persistence memory correction — 2026-11-24 20:35 UTC

### Confirmed code-level allocation in the normal database save path

The previous save() implementation made a shallow database snapshot and then called JSON.stringify(snapshot). That materialized a second, complete UTF-16 JSON string proportional to the entire persisted database before writing the temporary file. The original in-memory database remained resident at the same time. This is a deterministic source-level allocation on every durable save; it is not, by itself, proof that this allocation caused the provider's historical 128 MB violation.

The candidate now uses lib/json-writer.js:

- Walks the JSON-compatible database value synchronously, preserving the existing single-process snapshot semantics (no asynchronous interleaving with live mutations).
- Escapes strings in 4 KiB segments and writes through a bounded 64 KiB output buffer rather than allocating a second full-database JSON string.
- Keeps the existing unique .tmp file, exclusive creation, restrictive file mode, file fsync, atomic rename, best-effort directory fsync, cleanup on failure, and private-message exclusion.
- Keeps the persisted compact JSON representation and the synchronous save() contract used by existing routes.

Regression coverage compares the writer's exact output against native JSON.stringify for Arabic/Unicode and chunk-boundary strings, escaped text, sparse arrays, undefined/non-finite values, Date and Buffer toJSON, and repeated shared references. It also checks circular-value rejection and executes the real atomic save() implementation in an isolated temporary directory to confirm valid output, private-message exclusion, and no leftover temporary files.

### Exact candidate validation

- Source/documentation/test candidate: 96f8220df1ad5b1603bd36416fc75c84f3735507.
- [GitHub Actions run #45482153155](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45482153155) passed both validate and refresh-release-archive.
- Source and extracted archive each passed **610 checks, zero failures**; both production Docker builds succeeded; npm audit reported **0 vulnerabilities**.
- Archive refresh verified **395 files**, **16,368,568 bytes**, CRC integrity and exact tracked-file parity.
- Archive-only commit: b14714bfd16d47a4a12f37a1599a8ea11c9fc565; it changes only rimaz-final-deep-audit-46.93.72.zip.

### Remaining concrete memory-amplification paths

This correction reduces the transient allocation in routine save() calls. It does **not** establish that total RSS fits the 128 MB provider limit. The following paths still materialize large data in memory and require separate design and validation:

1. Full backup builds a complete pretty-printed JSON string and then copies it into a Buffer before adding it to the streamed tar/gzip output. Concurrent full-backup requests can multiply this peak.
2. Database-only backup materializes the complete pretty-printed JSON response string.
3. Restore preview and confirmation read the complete backup file as a string and parse a second object graph. Confirmation also reads the live database into a full recovery Buffer before serializing the replacement database.
4. The in-memory database itself remains resident by design; this writer only removes the additional full serialization string from routine saves.

These are verified source-level allocation paths, not proof of the historical OOM cause. Do not lower the Node heap limit, reduce product functionality, or declare the 128 MB issue solved. Next code work should address backup/restore peak allocation while preserving exact archive contents, recovery guarantees, and restore safety; then validate under representative staging load and correlate with Deplexo exit/OOM evidence.


## Restore recovery-buffer correction — 2026-11-24 20:42 UTC

The database-restore confirmation path previously called readFileSync(DB_FILE), then copied that complete Buffer into a new recovery file. For a large live database this temporarily allocated another database-sized RAM buffer immediately before the replacement database was parsed and saved.

The candidate now copies the live database directly from disk to the unique recovery path using copyFileSync with COPYFILE_EXCL. It explicitly restores restrictive 0600 permissions, opens the copied file read/write for fsync, and retains the existing directory fsync, recoveryReady gate, rollback behavior, and recovery-file retention after a successful restore. If any copy, permission, or sync step fails, the incomplete recovery file is removed and the restore is not allowed to proceed.

The restore regression assertion now requires the disk-to-disk copy, exclusive destination creation, restrictive permissions, and fsync, and rejects the former whole-file recoveryData Buffer path.

- Source/test candidate: a2a3c11274770af65de0810414a9e6a233474221.
- [GitHub Actions run #45483322714](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45483322714) passed source and extracted-archive validation: **610 checks, zero failures** in each, both production Docker builds succeeded, and npm audit reported **0 vulnerabilities**.
- Archive refresh verified **395 files**, **16,370,888 bytes**, CRC and exact tracked-file parity.
- Archive-only commit: 9a27af2255adc56a61c580a5406ec49e4c18ae5f.

This removes another full-database transient Buffer from restore confirmation. It does not remove the old database object retained for rollback, the new parsed restore object, the staged restore JSON text, or the remaining backup serialization allocations. The 128 MB provider issue therefore remains unproven at production level.


## Bounded-memory backup output correction — 2026-11-24

A further source review confirmed two remaining avoidable serialization peaks: the full TAR/GZIP backup built a complete pretty-printed JSON string and copied it into a Buffer, while the database-only endpoint built the complete JSON response string before sending it.

The candidate now:
- Uses the existing bounded-memory `writeJsonSync` serializer to write each database snapshot to a unique, exclusive, mode-0600 temporary file.
- Fsyncs the completed temporary snapshot before exposing it to a download stream.
- Adds the full-backup database file to TAR as a disk-backed entry; the TAR generator removes the temporary database file in a `finally` block after streaming or iterator cancellation.
- Streams the database-only backup with `fs.createReadStream`, and removes the temporary file on stream close, error, or client disconnect.
- Retains the existing backup JSON format, pretty-printing, excluded live sessions/private messages, TAR entry name, and archive file ordering.

New regression coverage dynamically exercises the temp-file serializer with Arabic and large Unicode content, compares its exact output with native `JSON.stringify(value, null, 2)`, verifies restrictive 0600 permissions, rejects circular values, and verifies cleanup after failure. Additional assertions ensure both backup routes stream disk files and do not call `JSON.stringify` or create a database-sized Buffer.

This removes the two confirmed full-output serialization allocations from the backup endpoints. It does **not** prove the 128 MB hosting issue is fixed: the live database remains resident, temporary disk capacity must be sufficient, concurrent backup requests can still consume disk and I/O, and restore preview/confirmation still parse a full JSON text/object graph. Staging tests must cover backup cancellation, concurrent downloads, disk-full/permission failures, archive integrity, restore round-trip, and representative-load RSS/heap/external measurements. No live Deplexo deployment or data-volume operation is implied by these source changes.



## Follow-up correction — current candidate as of 2026-11-25

Several memory-amplification paths listed above as remaining work have since been addressed in the current candidate. The historical findings above are retained as audit history, but they must not be read as a description of the current source:

- Routine database persistence now uses the bounded-chunk JSON writer rather than constructing a second complete JSON string.
- Full backup writes the database snapshot to a restrictive temporary file and adds it to the TAR stream as a disk-backed entry; the temporary file is removed on normal completion, iterator cancellation, or media-enumeration failure.
- Database-only backup streams the restrictive temporary file and removes it after completion, stream error, or client disconnect.
- Restore preview now scans JSON tokens with `keepStack:false`, validates the envelope/schema metadata and owner presence, and retains summary counters rather than a replacement database graph.
- Startup and restore confirmation parse through the bounded-chunk JSON reader. Restore confirmation creates a disk-to-disk restrictive recovery copy, releases the previous in-memory database graph before parsing the replacement, and retains rollback behavior if persistence fails.
- Restore upload is disk-backed and capped at 20 MiB; only one upload is processed at a time and pending preview capacity is checked before accepting the body.

### Remaining memory and consistency boundaries

- Restore confirmation must still materialize the replacement database object graph; the live database itself remains resident after a successful restore. The parser also needs to hold the largest individual JSON token/string, bounded by the restore file limit but not eliminated by chunked I/O.
- Temporary backup snapshots consume disk space and I/O. Concurrent backup requests and disk-full/permission failures still require controlled staging tests.
- A full backup's database snapshot and media-file enumeration are not one atomic point-in-time snapshot while uploads/deletes can continue. For a trustworthy full-volume backup, use an offline consistent filesystem/volume snapshot or a maintenance window that prevents writes for the entire export, then verify by isolated restore. A Git rollback branch or repository ZIP does not protect the live volume.
- The 128 MB / 0.25 vCPU production limit is still not proven safe. No current representative-load RSS/heap/external/arrayBuffers profile, Deplexo restart/OOM evidence, or isolated restore drill is available. Do not declare the historical incident resolved until those measurements exist.

### Latest exact CI evidence

Actions run [#803](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45632558265) passed both `validate` and `refresh-release-archive` on source SHA `7e98b6d1c4d3decffcebfe4713866cf6024d8c41`. Source and extracted archive each passed **627 regression checks with zero failures**; both Docker builds succeeded; the isolated container homepage and Socket.IO polling handshake passed; npm audit reported **0 vulnerabilities**. The archive job verified exact tracked-file parity for **394 files / 16,342,196 bytes** and created archive-only commit `56f706c6f83891172b692e2045df98e607d98d9f`.
