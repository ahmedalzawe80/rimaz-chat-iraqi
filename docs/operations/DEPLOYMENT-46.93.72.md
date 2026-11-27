> **Release reference only:** these notes describe the audited 46.93.72 package and repository workflow. They are not authorization to replace production. Any production operation still requires an independent persistent-volume backup, a verified restore, staging smoke tests, and explicit approval.

# Rimaz Chat 46.93.72 — Release and deployment reference

## Application package

The release ZIP is generated on demand as a GitHub Actions artifact after source validation. Its project root is flat and contains `package.json`, `server.js`, `index.html`, `public/`, and `verify.js`. The ZIP is not tracked in Git; download the artifact from the successful workflow run if a package is needed.

The Git repository's incomplete `rimaz-chat-iraqi-main/` duplicate is not part of the application and has been removed by the repository-maintenance change.

## GitHub release-archive validation

The former `.github/workflows/unzip-upload.yml` workflow has been removed from the maintenance candidate. It required the ZIP to match the current `main` application files, `public/`, and `lib/` exactly before copying those same files back to `main`. That precondition made it incapable of promoting a feature-branch candidate; the later copy, `rsync --delete`, rollback-branch creation, and Git push were unnecessary write operations.

Use the reviewed pull-request process to integrate application changes. For an archive build, explicitly dispatch **Validate Rimaz Project** on the intended branch. Its source-validation job must pass before `build-release-archive` creates the ZIP in runner temporary storage, validates safe paths and exact tracked-file parity, tests the extracted project, builds the Docker image, and uploads the 30-day artifact. No archive file is committed to the repository. This workflow does not merge branches, update `main`, deploy to Deplexo, or modify live data. No manual ZIP file editing or upload is required.

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
