# Rimaz continuation checkpoint — 2026-11-25

## Candidate state
- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- Integrated review: PR #3, still open/draft/unmerged.
- Production `main`: `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`; no production merge, Deplexo deployment/restart, ZIP sync, or live-volume/data operation was performed.
- Latest validation-fix commit verified in this continuation: `44659fc2ec779b3d6eeb6e9158f2b690f0686624` (isolated USTAR test fixture supplies `crypto`). Earlier backup-stream source change: `98faac0a91c4820d7f18103710a505d07d3242ae`.

## New backup lifecycle work
- Added dynamic isolated regression coverage in `verify.js` for `fullBackupTarEntries()`: explicit iterator cancellation, normal exhaustion, and media enumeration failure must all remove the temporary database snapshot file.
- Corrected the normal-exhaustion assertion before finalizing the test.
- Source review found that the full-backup route used chained `.pipe()` calls without a coordinated cancellation lifecycle. If the client disconnected, the source/gzip chain did not explicitly guarantee teardown of the async generator.
- Changed the route to Node's `stream.pipeline(source, archive, res, callback)` and imported `pipeline`. Pipeline teardown propagates premature response closure to the source stream, allowing the async generator's `finally` cleanup to run.
- Updated the route regression assertion to require the cancellable pipeline.
- The database-only backup route already streams a restrictive temporary file and cleans it on stream close/error/response close.
- **Validation status update (2026-11-25 continuation):** GitHub Actions run `45489183705` on commit `44659fc2ec779b3d6eeb6e9158f2b690f0686624` completed successfully. Regression tests, syntax check, production Docker build, dependency audit (0 vulnerabilities reported), and `refresh-release-archive` all completed successfully. This validates the static/archive workflow, not live restore, staging, or 128 MB runtime behavior.
- The release archive refresh workflow completed successfully on the validated candidate; verify archive commit/blob linkage and its exact extracted content before promotion.

## Remaining memory risks
- Routine database save uses the bounded-memory `lib/json-writer.js`.
- Restore recovery copy is disk-to-disk with exclusive creation, mode 0600 and fsync.
- Full/database-only backup serialize snapshots to temporary disk files; full backup now has coordinated stream cancellation.
- Restore preview and confirmation still read the full uploaded JSON as a string and parse a replacement object graph. This remains a material peak-memory risk under a 128 MB container limit. Do not claim the historical 128 MB violation is fixed.
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
