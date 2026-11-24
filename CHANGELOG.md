## Repository maintenance — 2026-11-24 (no application version change)

- Organized project continuity notes, engineering audits, and operations records under `docs/project/`, `docs/audits/`, and `docs/operations/`; the root now keeps only the standard README, CHANGELOG, and CONTRIBUTING guides among Markdown files.
- Added a repository structure guide that records root-file ownership, runtime asset discovery, and why apparently duplicate media must not be deleted without a migration review.
- Added a categorized documentation index and regression checks for missing documents, broken index links, and reports scattered in the repository root.
- Removed the incomplete nested `rimaz-chat-iraqi-main/` duplicate after confirming it contained only a placeholder data file and a duplicate Google verification file.
- Added a genuine npm v3 lockfile generated on Node.js 24, verified a clean `npm ci` install, and changed the production Docker build to `npm ci --omit=dev` for deterministic dependency resolution.
- Updated contributor and local-run instructions to use `npm ci`; CI now requires the committed lockfile and verifies the installed dependency tree.
- Added `.editorconfig`, `.gitattributes`, `.nvmrc`, `CONTRIBUTING.md`, a pull-request template, Dependabot schedules, and immutable SHA pins for GitHub Actions; CI watches documentation and repository-configuration changes, uses the shared Node version pin, and cancels superseded runs.
- Added repository hygiene rules and documentation for persistent runtime data, Docker exclusions, and guarded source synchronization.
- Kept the audited source ZIP at the repository root because the current archive-audit and manual-sync workflows depend on that exact path.
- Kept application entry points and `public/` in their runtime-required locations; no production data or hosting volume was changed.

## v46.93.72 (2026-11-22)

- Fixed transient anti-spam state lifecycle: per-session message windows are removed only after the reconnect grace period ends and the session removal is durably saved; orphaned transient entries are also swept periodically.
- Reworked database restore staging from Multer memory storage to a private, permission-restricted disk staging directory. Pending previews retain only a path and metadata, are capped at two, are revalidated at confirmation, and are deleted on confirmation or periodic expiry. Orphaned staging files are removed on process startup because preview tokens are process-local.
- Made database restore commit transactional at the application level: audit metadata is included in the replacement snapshot and persisted before pending files are removed or active sockets are disconnected.
- Added a per-room active-session index to each presence snapshot, avoiding a full active-session scan for every room count while preserving viewer-specific visibility.
