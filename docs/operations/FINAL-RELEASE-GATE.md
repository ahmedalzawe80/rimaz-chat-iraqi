# Final release gate — Rimaz

**Review date:** 2026-11-24  
**Release candidate:** `fix/bound-private-media-ticket-cache`  
**Production branch:** `main`

This record distinguishes verified source/CI work from hosting operations that still require staging access and explicit owner approval.

## Consolidated repository decision

- PR #3 is the sole integrated review candidate.
- PR #3 currently contains 33 changed paths. The 11 paths in PR #2 are all represented in PR #3; PR #2 has no unique files and must not be merged separately.
- The candidate retains runtime assets and workflow-referenced files in their required locations. Do not delete or rename media files merely because their bytes appear duplicated; generated IDs and stored references may depend on filenames.
- PR #3 remains open, draft, unmerged, and targets `safety/validate-and-backup-before-sync`. It is not yet a production release.

## Latest exact-head CI evidence

- PR #3 head: `7abc591fa7b370ea5a77088fe42e9239e0976474`.
- GitHub Actions run: [45406653849](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45406653849).
- Result: success on the exact head SHA.
- The `validate` job completed successfully, including Node.js setup from `.nvmrc`, JavaScript syntax checks, project regression tests (`npm test`), and production Docker image build.
- The connector exposes successful step conclusions for this run but not the test runner's pass-marker count. Do not copy a test count from an earlier commit and attribute it to this run.
- Earlier exact-code validation on `c30b7b92093dbbf4162cb6f30573355ad20b0f1f`, run `45379916442`, reported 556 pass markers and zero failures. That count belongs to that earlier SHA only.

CI proves the tested source and container build passed. It does not prove Deplexo runtime health, load behavior, or backup restorability.

## Dependency reproducibility — release blocker

- `package.json` requires Node.js `>=24 <25`; `.nvmrc` pins major version 24.
- `package-lock.json` is absent.
- The Dockerfile currently runs `npm install --omit=dev`, not `npm ci`.
- Do not invent a lockfile or integrity hashes. Generate a real lockfile using Node.js 24 and the trusted npm registry, review the resolved dependency tree, then validate clean install, tests, and image build before adopting `npm ci`.
- Until that work is completed, dependency resolution is not fully reproducible.

## Required staging and hosting checks

1. Generate and review a genuine dependency lockfile; validate clean install and production image build using it.
2. Create an independent backup of the live Deplexo persistent volume, including database, uploads, and private media.
3. Restore that backup into an isolated staging environment and verify integrity.
4. Run smoke tests for login, reconnect grace, public/private chat, room join/move/leave, voice/video lifecycle, moderation/member-card actions, uploads, backup/restore, and multi-device sessions.
5. Observe process exit codes, restart events, OOM events, heap/RSS, and resource behavior under representative use.
6. Review the complete PR diff and require fresh green checks on the exact final head.

These checks cannot be marked complete by GitHub CI alone.

## Promotion boundary

Until all required checks are complete and the owner explicitly approves:

- Do not merge PR #3 or change `main`.
- Do not close or merge redundant PR #2 automatically.
- Do not run ZIP synchronization, deploy, or restart Deplexo.
- Do not modify the live database, uploads, private media, or persistent volume.

A Git rollback branch protects tracked source history only; it is not a backup of hosting data.

## Completion definition

Repository consolidation and source-level CI validation are recorded on the current candidate. The overall production release is **not complete** until dependency reproducibility, verified backup/restore, staging smoke tests, runtime evidence, final review, and explicit promotion approval are recorded.
