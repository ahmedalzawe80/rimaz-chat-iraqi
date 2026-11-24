# Rimaz Chat

Rimaz is a Node.js chat application using Express and Socket.IO. The repository contains the server, synchronized browser entry files, public media assets, and regression checks.

## Requirements

- Node.js 24 LTS
- npm

## Run locally

```sh
npm install
npm start
```

The server listens on port `3000` by default. Set `PORT` to override it.

## Validate changes

```sh
node --check server.js
node --check verify.js
npm test
```

The regression suite is run by GitHub Actions for pull requests that change application code, assets, build configuration, or repository maintenance files. Passing local checks is not a substitute for a staging smoke test.

## Persistent runtime data

Set `DATA_DIR` to a persistent writable directory. The application stores its database, uploaded files, and private media under this directory:

- `data.json`
- `uploads/`
- `private-media/`

If `/data` exists and `DATA_DIR` is not explicitly set, the server defaults to `/data/rimaz`. Otherwise it defaults to the repository's `data/` directory. For hosted deployments, mount a persistent volume at `/data` and set `DATA_DIR=/data/rimaz`.

**Important:** the small root-level `data.json` tracked in Git is an initial placeholder with a warning, not the live database. Never copy it over the persistent database. Keep the hosting volume and its contents when rebuilding or deploying the application.

## Public configuration

- `PORT`: HTTP port; defaults to `3000`.
- `DATA_DIR`: persistent runtime data directory.
- `PUBLIC_SITE_URL`: canonical public origin used for SEO metadata, robots.txt, and sitemap.xml. The current deployment origin is used as the fallback.

## Repository layout

- `server.js`: Express, Socket.IO, API routes, persistence, and runtime cleanup.
- `index.html`: primary browser entry file used for server-rendered SEO metadata.
- `public/index.html`: synchronized fallback copy; keep it byte-identical to the root entry file.
- `public/gifts/`, `public/smileys/`, `public/vip-gifts/`: built-in media served from disk.
- `verify.js`: regression checks.
- `.github/workflows/`: pull-request validation, archive audit, and guarded manual source synchronization.
- `rimaz-final-deep-audit-46.93.72.zip`: audited source archive used by the archive validation workflow and manual source-sync process.

## Docker

The Dockerfile installs production dependencies and copies the application. `.dockerignore` excludes runtime data, local dependencies, archives, and repository-only workflow files from the image build context. The persistent data volume must be mounted separately; it is not part of the image.

## Safe repository workflow

Work on a feature or maintenance branch and open a pull request to the repository's designated integration branch. The current maintenance PRs target `safety/validate-and-backup-before-sync`; `main` is the production branch and remains unchanged during this review. Promote to `main` only through a separate reviewed change after CI, staging smoke tests, a verified persistent-volume backup, and explicit approval.

The manual ZIP synchronization workflow is restricted to a manual run from `main` and requires the `confirm_main_replacement` input. Its rollback branch backs up Git-tracked repository state only, not the live hosting volume.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the required branch, validation, and review process.

## Documentation index

See [docs/README.md](docs/README.md) for the categorized index of project records, audits, and operations notes. The root [CHANGELOG.md](CHANGELOG.md) records application and repository changes.
