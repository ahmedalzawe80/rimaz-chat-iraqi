> **Release reference only:** these notes describe the audited 46.93.72 package and repository workflow. They are not authorization to replace production. Any production operation still requires an independent persistent-volume backup, a verified restore, staging smoke tests, and explicit approval.

# Rimaz Chat 46.93.72 — Release and deployment reference

## Application package

The release ZIP is generated on demand as a GitHub Actions artifact after source validation. Its project root is flat and contains `package.json`, `server.js`, `index.html`, `public/`, and `verify.js`. The ZIP is not tracked in Git; download the artifact from the successful workflow run if a package is needed.

The Git repository's incomplete `rimaz-chat-iraqi-main/` duplicate is not part of the application and has been removed by the repository-maintenance change.

## GitHub release-archive validation

The former `.github/workflows/unzip-upload.yml` self-sync workflow and the separate `.github/workflows/audit-rootfix-archive.yml` workflow have both been removed from the maintenance candidate. The self-sync workflow required the ZIP to match `main` exactly before copying the same files back, so it could not promote a feature-branch candidate. The standalone archive audit is now part of the release-artifact job.

Use the reviewed pull-request process to integrate application changes. For an archive build, explicitly dispatch **Validate Rimaz Project** on the intended branch. Its source-validation job must pass before `build-release-archive` creates the ZIP in runner temporary storage, validates safe paths and exact tracked-file parity, tests the extracted project, builds the Docker image, and uploads the 30-day artifact. The archive is not stored or committed in the repository. This workflow does not merge branches, update `main`, deploy to Deplexo, or modify live data. No manual ZIP file editing or upload is required.

**Current availability gate:** GitHub requires a manually dispatched workflow to exist on the default branch. At this checkpoint, `main` contains only the legacy `unzip-upload.yml`; `validate-project.yml` is included in draft PR #1 and remains unmerged. Thus the artifact job cannot yet be dispatched. Once the prerequisite workflow is approved and reaches `main`, the updated maintenance branch can be selected for the artifact run. This project work does not merge PR #1 or alter `main`.

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
