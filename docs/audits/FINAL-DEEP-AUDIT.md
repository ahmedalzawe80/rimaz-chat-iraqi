# Rimaz Chat — Deep Audit and Repair Candidate (46.93.72)

> **Historical source-package audit.** Its 448-check Node.js 22 result and 46.93.72 baseline findings are retained for history only; they do not describe the current branch head. See the [current transaction-safety audit](TRANSACTION-SAFETY-AUDIT-2026-11-24.md), [runtime resource audit](RUNTIME-RESOURCE-AUDIT-2026-11-24.md), and [final release gate](../operations/FINAL-RELEASE-GATE.md) for current evidence and blockers.

## Scope and method
- Reviewed the uploaded project archive and the uploaded 46.93.71 source archive, then prepared 46.93.72 repair candidate.
- Ran Node syntax checks for `server.js` and `verify.js`.
- Ran the project's `node verify.js` suite: all regression checks passed before repair; the expanded 46.93.72 suite passed 448 checks for this candidate.
- Used TypeScript's JavaScript parser with `noUnusedLocals` and `noUnusedParameters` diagnostics on `server.js`, `verify.js`, the main inline browser script, and the banner script: no diagnostics were reported.
- Confirmed `index.html` and `public/index.html` are byte-identical.
- Checked SHA-256 duplicates in the asset set. Three duplicate image pairs exist, but they have different logical filenames/IDs and are not safe to remove without reviewing how the catalogue maps them.

## Safe cleanup already included
- The unused `saveNewShortcut()` forwarding wrapper was removed from both synchronized browser HTML files in the uploaded baseline; `saveShortcut()` is the direct implementation.
- `.dockerignore` excludes repository metadata, dependency folders, archives/logs, and the nested duplicate source folder from Docker build context.
- Archive layout is flat at the project root; no nested copy of the project is included.

## Items intentionally retained
- `public/index.html`: server uses it as a fallback if root `index.html` is unavailable, and it is also checked for synchronization.
- Duplicate image files: filenames may be referenced by gift/smiley catalogues; deleting a duplicate byte sequence can break a distinct catalogue entry.
- `data.json`: placeholder warning file. Do not overwrite the live persistent database with this placeholder; preserve the server's existing persistent data.
- All public gift/smiley/VIP assets and feature code.

## Runtime caution
- Static and project checks pass, but this is not a live production test. The deployment environment and persistent data were not accessed or changed.
- Prior Deplexo logs showed `ticket is not defined`; this source package's private-media ticket route has a `ticket` declaration, so the earlier log may be from another deployed revision/path. Verify live deployment before concluding the runtime issue is permanently resolved.
- Frequent server-start log messages still require live platform investigation; static checks cannot establish their cause.

## Result
No additional code or asset deletions were made because static analysis did not establish any further safe removals. This package is a conservative cleanup build, not a claim that every dynamically referenced item has been proven unused.

## Confirmed source-level findings and repairs in 46.93.72
- `botMessageWindows` was keyed by session ID and was not removed when a disconnected session completed its 60-second reconnect grace period. The repair removes this state only after the durable session cleanup succeeds, preserving anti-spam continuity during reconnect grace; a periodic orphan sweep provides a second cleanup path. Logout and successful restore also clear transient state.
- Database restore previously used `multer.memoryStorage()` and retained the fully parsed replacement database object in `pendingDatabaseRestores` for up to five minutes. The repair stages the upload in a private `DATA_DIR/.restore-tmp` directory (directory mode 0700, file mode 0600), keeps only a file path and summary in memory, caps pending previews at two, revalidates the file on confirmation, and periodically deletes expired staged files. Staged files from a prior process are removed at startup because preview tokens are process-local.
- Presence snapshots now build `activeByRoom`; room online counts iterate only the sessions in the target room. Viewer-specific visibility rules remain applied for each viewer. This reduces repeated scans across unrelated rooms without weakening hidden/ghost privacy.
- Restore confirmation now adds its audit entry and persists the replacement before deleting the staged preview or disconnecting sockets. Rollback retains the previous in-memory database if persistence fails.

## Validation and limitations
- All JavaScript files pass `node --check`; the expanded project regression suite passed 448 checks on the available local Node.js v22.16.0 runtime. The deployment reports Node.js v20.20.2, which was not available in this local environment for an exact-version run.
- These are source-level and local regression results. No live Deplexo process, production database, or production upload directory was accessed or modified.
- The four user-supplied health snapshots (one online user) showed RSS 74.38, 75.97, 73.50, and 72.14 MB, with no monotonic increase in that low-load interval. They do not prove absence of a leak under concurrent load.
- The earlier `ticket is not defined` log remains uncorrelated to the uploaded source path; the current archive's private-media ticket route declares the ticket. It must be matched against a contemporaneous deployed log before claiming resolution.
- The observed 128 MB hosting limit leaves limited headroom for large JSON restores. Disk staging removes the persistent in-memory upload buffer and long-lived parsed preview; JSON parsing itself still requires a transient string and object graph. This is a mitigation of peak/retained memory, not a streaming JSON parser.
- The repair candidate is not deployed. Preserve the existing persistent `data.json` and uploads when deploying; never replace them with the ZIP's placeholder `data.json`.
