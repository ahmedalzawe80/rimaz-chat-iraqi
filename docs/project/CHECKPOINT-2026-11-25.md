# Rimaz continuation checkpoint — 2026-11-25

## Candidate state
- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- Integrated review: PR #3, still open/draft/unmerged.
- Production `main`: `a2c74fded15ea5cfde38d310a84c3c8edfe994b3`; no production merge, Deplexo deployment/restart, ZIP sync, or live-volume/data operation was performed.
- Latest source/test commit in this continuation: `4fbe46348d5e3afbaff2efbfad46a0de105eb10d` (verify assertion); preceding server change: `98faac0a91c4820d7f18103710a505d07d3242ae`.

## New backup lifecycle work
- Added dynamic isolated regression coverage in `verify.js` for `fullBackupTarEntries()`: explicit iterator cancellation, normal exhaustion, and media enumeration failure must all remove the temporary database snapshot file.
- Corrected the normal-exhaustion assertion before finalizing the test.
- Source review found that the full-backup route used chained `.pipe()` calls without a coordinated cancellation lifecycle. If the client disconnected, the source/gzip chain did not explicitly guarantee teardown of the async generator.
- Changed the route to Node's `stream.pipeline(source, archive, res, callback)` and imported `pipeline`. Pipeline teardown propagates premature response closure to the source stream, allowing the async generator's `finally` cleanup to run.
- Updated the route regression assertion to require the cancellable pipeline.
- The database-only backup route already streams a restrictive temporary file and cleans it on stream close/error/response close.
- **Validation status:** latest GitHub commit status query returned no status entries, and the connected workflow-run lookup only exposes PR-triggered runs (none returned for this push commit). Therefore the new tests, syntax check, Docker build, and archive refresh are **pending/unconfirmed**, not green. Recheck GitHub Actions for the exact latest branch head before relying on this change.
- The tracked release ZIP still has blob SHA `96867de7440dd0ca946615975f382980a8a67724`, unchanged from the pre-follow-up candidate. Treat it as **stale** until the push workflow rebuilds it from the validated exact head and the extracted archive independently passes `npm test` and Docker validation.

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
