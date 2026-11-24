> **Release reference only:** these notes describe the audited 46.93.72 package and repository workflow. They are not authorization to replace production. Any production operation still requires an independent persistent-volume backup, a verified restore, staging smoke tests, and explicit approval.

# Rimaz Chat 46.93.72 — Release and deployment reference

## Application package

The audited source archive is `rimaz-final-deep-audit-46.93.72.zip`. Its project root is flat and contains `package.json`, `server.js`, `index.html`, `public/`, and `verify.js`. Extract the archive contents directly into the application root; do not add an extra wrapper directory.

The Git repository's incomplete `rimaz-chat-iraqi-main/` duplicate is not part of the application and has been removed by the repository-maintenance change.

## GitHub source synchronization

The manual workflow `.github/workflows/unzip-upload.yml` expects the exact archive filename above. It runs only when dispatched from `main` and requires the `confirm_main_replacement` input to be explicitly checked.

The workflow validates ZIP paths and symlinks, checks the archive package version against its filename, and creates a rollback branch before changing files. Before sync, it requires exact parity with current `main` for `package.json`, `package-lock.json`, `Dockerfile`, `server.js`, `index.html`, `verify.js`, and the complete `public/` tree; a stale archive is rejected. It runs `npm ci`, `npm ls`, regression tests, and a Docker build before and after synchronization. It copies only the application/build files and `public/`, not the whole repository root, so README, audit reports, GitHub workflows, and other repository-maintenance files remain in place.

This workflow is a GitHub source synchronization mechanism; it is not evidence of a Deplexo deployment or a live-server restart. The rollback branch is a snapshot of Git-tracked repository state. It is **not** a backup of the live Deplexo persistent volume or its database/uploads. Back up and verify the hosting volume separately before any production operation.

## Hosting and persistent storage

- Use Node.js 24 LTS, matching `package.json`, `.nvmrc`, and the production Docker image.
- Start with `npm start` (or `node server.js`); the default port is `3000`.
- Mount the persistent hosting volume at `/data`.
- Set `DATA_DIR=/data/rimaz` so the database, uploads, and private media survive container replacement.
- Keep `PUBLIC_SITE_URL` set to the verified public origin if the domain changes.

The application stores `data.json`, `uploads/`, and `private-media/` under `DATA_DIR`. Do not replace the live database with the root-level Git placeholder `data.json`; it explicitly warns that it is not production data.

The Docker build excludes runtime directories and the root placeholder through `.dockerignore`. A new image must not be treated as a data backup.

## Dependency reproducibility

The candidate now commits a genuine npm lockfile v3 generated on Node.js 24. The lockfile's root package identity and dependency declarations match `package.json`. Local development and CI use `npm ci`; the production Dockerfile uses `npm ci --omit=dev`. Do not remove the lockfile or use floating installs for release builds. When intentionally changing dependencies, update `package.json` and `package-lock.json` together and validate a clean `npm ci`.

## Validation boundary

The current CI validates the exact locked install, top-level dependency tree, JavaScript syntax, regression suite, and production Docker image. This is source/build evidence only; it does not prove live hosting health.

Before promotion, deploy to an isolated staging instance after restoring an independent copy of the live persistent volume. Smoke-test login/reconnect, public/private chat, rooms, voice/video, moderation/member-card actions, uploads, and backup/restore. Confirm memory, restarts, and uptime under a controlled workload before production promotion.
