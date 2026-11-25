# Rimaz continuation checkpoint — 2026-11-25

## Candidate state
- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- Integrated review: PR #3, still open/draft/unmerged.
- Production `main`: `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`; no production merge, Deplexo deployment/restart, ZIP sync, or live-volume/data operation was performed.
- Latest validated source/test candidate: `c0df4b36762adf52eef03eb50e4d26d0c6344944`; archive-only refresh commit: `8ba0a1573922065cd206c576c795988a9eb9fc6a`. Earlier backup-stream source change: `98faac0a91c4820d7f18103710a505d07d3242ae`.

## New backup lifecycle work
- Added dynamic isolated regression coverage in `verify.js` for `fullBackupTarEntries()`: explicit iterator cancellation, normal exhaustion, and media enumeration failure must all remove the temporary database snapshot file.
- Corrected the normal-exhaustion assertion before finalizing the test.
- Source review found that the full-backup route used chained `.pipe()` calls without a coordinated cancellation lifecycle. If the client disconnected, the source/gzip chain did not explicitly guarantee teardown of the async generator.
- Changed the route to Node's `stream.pipeline(source, archive, res, callback)` and imported `pipeline`. Pipeline teardown propagates premature response closure to the source stream, allowing the async generator's `finally` cleanup to run.
- Updated the route regression assertion to require the cancellable pipeline.
- The database-only backup route already streams a restrictive temporary file and cleans it on stream close/error/response close.
- **Validation status update (2026-11-25 continuation):** GitHub Actions run `45489183705` on commit `44659fc2ec779b3d6eeb6e9158f2b690f0686624` completed successfully. Regression tests, syntax check, production Docker build, dependency audit (0 vulnerabilities reported), and `refresh-release-archive` all completed successfully. This validates the static/archive workflow, not live restore, staging, or 128 MB runtime behavior.
- The release archive refresh workflow completed successfully on the validated candidate; verify archive commit/blob linkage and its exact extracted content before promotion.


## Restore preview admission control — 2026-11-25
- Added a preflight check after admin authorization and before Multer receives the file. Expired previews are purged first; if both pending-preview slots are occupied by other admins, the request is rejected before disk upload and JSON parsing.
- The same admin can still replace their own preview, preserving the previous replacement behavior. The existing post-validation capacity check remains as a final invariant.
- Added runtime regression coverage for same-owner replacement, full-queue rejection, and middleware ordering before Multer.
- Source/test candidate cade62bb05edc7cfece5f879151ef65b300d548c passed GitHub Actions run [45598139159](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45598139159): source validation and production Docker build passed; the archive job rebuilt the tracked-file ZIP, checked integrity/path/parity, extracted it, then passed locked install, dependency-tree check, syntax, tests, HTML parity, and Docker build.
- Archive-only commit f7d1f0d7d877851d58a227554543ef96cc1bbab5 changes only rimaz-final-deep-audit-46.93.72.zip.
- Current branch head is f7d1f0d7d877851d58a227554543ef96cc1bbab5; PR #3 remains open/draft/unmerged. Production main remains a2c74fded15ea5cfde38d310a84c3c8edfe994b3.


## Streaming JSON and disk-backed restore rollback — 2026-11-25
- Added exact-pinned `@streamparser/json` 0.0.26 and `lib/json-reader.js`. It reads files in 64 KiB chunks, enforces a 512-level nesting ceiling, rejects a UTF-8 BOM to preserve `JSON.parse` behavior, and avoids materializing the entire source JSON string.
- Replaced startup database loading and restore preview/confirmation parsing with the streaming reader. Restore files remain capped at 20 MiB; schema, format, owner-account, and data-count validation remain in place.
- Confirmation now durably saves the current database before making the disk-to-disk recovery copy. Once the copy is synced, the old database object is released before the replacement is parsed; only transient in-memory private messages are retained for rollback.
- If confirmation fails before the replacement is saved, the old database is reloaded from the recovery copy. If the replacement was already saved, the recovery copy is atomically restored to the live database path first. Failure to reload the preserved snapshot fails closed by terminating the process rather than serving with an invalid in-memory database.
- Regression tests cover Unicode split across chunks, duplicate keys, prototype-safe `__proto__`, invalid JSON, BOM, nesting/size limits, multi-megabyte input, and atomic disk rollback.
- GitHub Actions run [45599503224](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45599503224) passed both jobs on source/test candidate `c0df4b36762adf52eef03eb50e4d26d0c6344944`: locked install, dependency tree, syntax, tests, Docker build, archive parity/integrity/path checks, extracted-archive install/tests/HTML parity/Docker build. Archive-only commit `8ba0a1573922065cd206c576c795988a9eb9fc6a` changes only the ZIP.
- The PR remains open/draft/unmerged; `main` remains `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`. No staging or production data operation occurred.

## Remaining memory risks
- Routine database save uses the bounded-memory `lib/json-writer.js`.
- Restore recovery copy is disk-to-disk with exclusive creation, mode 0600 and fsync.
- Full/database-only backup serialize snapshots to temporary disk files; full backup now has coordinated stream cancellation.
- Startup and restore paths no longer materialize a full UTF-16 source string. Confirmation also releases the previous database object after a durable disk recovery copy, so it does not retain both complete database graphs during replacement parsing. Preview still holds the live database and the parsed restore graph together; the final replacement object graph must still reside in memory. No representative-load RSS/heap/external/arrayBuffers or Deplexo OOM/exit evidence has been collected, so the historical 128 MB violation is not yet proven fixed.
- Staging must cover cancellation, concurrent backups, disk-full/permission errors, TAR/GZIP integrity, backup/restore round-trip, and representative-load RSS/heap/external/arrayBuffers plus provider exit/OOM evidence.

## Points / deduction investigation
- In the current `server.js` and `index.html`, `points` appears as an admin-editable member statistic persisted by `PATCH /api/admin/member-stats/:name`; the current source search did not find a points debit/deduction, wallet, or balance transaction path.
- Do not invent a deduction fix. If the previously mentioned “خصم” refers to another feature, identify the exact feature/route before changing behavior.

## Release blockers
1. Independent consistent backup of live `/data/rimaz` outside the app/volume.
2. Isolated restore of database plus `uploads/` and `private-media/`, with hashes, counts, paths, permissions and owner account verified.
3. Staging smoke tests for login/reconnect, public/private chat, rooms, voice/video, moderation/member-card actions, uploads, backup/restore and multiple devices.
4. Runtime restart/exit/OOM and representative-load memory evidence.
5. Provider confirmation that `cf-connecting-ip` and `x-real-ip` are sanitized before IP-based trust.
6. Fresh exact-head CI and explicit approval before promotion.

Do not merge PR #3, change `main`, deploy/restart Deplexo, run production ZIP sync, or modify live data until the release blockers pass and the owner explicitly approves.

## Test review correction — 2026-11-25
- During source-level review, the normal-exhaustion cleanup test was corrected to consume every yielded TAR entry before asserting generator completion; the generator also enumerates uploads and private media after the database entry.
- Commit: `8d9cc997e1f321e0ee68223b8d41681978af97d0`.
- Still pending: execute `npm test`, syntax checks and container/archive workflow on the exact branch head; no confirmed CI results are available.
