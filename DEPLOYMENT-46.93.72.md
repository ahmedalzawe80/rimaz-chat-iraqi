# Rimaz Chat 46.93.72 — Deployment notes

## Application package

The audited source archive is `rimaz-final-deep-audit-46.93.72.zip`. Its project root is flat and contains `package.json`, `server.js`, `index.html`, `public/`, and `verify.js`. Extract the archive contents directly into the application root; do not add an extra wrapper directory.

The Git repository's incomplete `rimaz-chat-iraqi-main/` duplicate is not part of the application and is removed by the repository-maintenance change.

## GitHub source synchronization

The manual workflow `.github/workflows/unzip-upload.yml` expects the exact archive filename above. It runs only when dispatched from `main` and now requires the `confirm_main_replacement` input to be explicitly checked.

The workflow validates ZIP paths and symlinks, checks the archive package version against its filename, and creates a rollback branch before changing files. It synchronizes only the application-managed root files (`server.js`, `index.html`, `package.json`, `verify.js`) and the contents of `public/`. It does not mirror the entire repository root, so README, audit reports, GitHub workflows, Docker configuration, and other repository-maintenance files are retained.

The rollback branch is a snapshot of Git-tracked repository state. It is **not** a backup of the live Deplexo persistent volume or its database/uploads. Back up and verify the hosting volume separately before any production operation.

## Hosting and persistent storage

- Use Node.js 20 or later.
- Start with `npm start` (or `node server.js`); the default port is `3000`.
- Mount the persistent hosting volume at `/data`.
- Set `DATA_DIR=/data/rimaz` so the database, uploads, and private media survive container replacement.
- Keep `PUBLIC_SITE_URL` set to the verified public origin if the domain changes.

The application stores `data.json`, `uploads/`, and `private-media/` under `DATA_DIR`. Do not replace the live database with the root-level Git placeholder `data.json`; it explicitly warns that it is not production data.

The Docker build excludes runtime directories and the root placeholder through `.dockerignore`. A new image must not be treated as a data backup.

## Dependency reproducibility note

The repository currently has no committed `package-lock.json`. `package.json` uses semver ranges, so `npm install` may resolve newer compatible dependency versions on a later build. Add and validate a lockfile in a separate controlled change before relying on fully reproducible dependency installs.

## Validation boundary

Run `node --check server.js`, `node --check verify.js`, and `npm test` before merging. Passing repository checks does not prove live hosting health. Deploy to staging first and smoke-test login/reconnect, public/private chat, rooms, voice/video, uploads, and backup/restore behavior. Confirm memory and uptime measurements under a controlled workload before promoting to production.
