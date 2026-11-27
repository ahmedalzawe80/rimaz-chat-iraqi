# Rimaz Chat

Rimaz is a Node.js chat application using Express and Socket.IO. The repository contains the server, synchronized browser entry files, public media assets, and regression checks.

## Requirements

- Node.js 24 LTS (the repository pins the major version in .nvmrc)
- npm

## Run locally

```sh
npm ci
npm start
```

Use `npm ci` for a clean, repeatable install from the committed `package-lock.json`. When intentionally changing dependencies, update `package.json` and `package-lock.json` together with `npm install`, review the diff, and validate with `npm ci`.

The server listens on port `3000` by default. Set `PORT` to override it.

## Validate changes

```sh
npm ci
node --check server.js
node --check verify.js
npm test
docker build -t rimaz-chat-iraqi:local .
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
- `PUBLIC_SITE_URL`: canonical public origin used for SEO metadata, robots.txt, and sitemap.xml.
- `TRUSTED_PROXY_CIDRS`: optional comma-separated IP/CIDR ranges for the hosting reverse proxies only.
- `TRUSTED_PROXY_HEADER`: exactly one provider-sanitized header: `cf-connecting-ip`, `x-real-ip`, or `x-forwarded-for`. Forwarded client-IP values are ignored unless both this header and the immediate proxy's documented CIDR range are configured. The default is to trust no forwarding header. Configure both values only from the hosting provider's documentation; never trust all public IPs or guess a range. The admin health endpoint reports whether both trust-boundary settings are active.

The admin health panel reports process RSS/heap plus cgroup memory current/peak/limit, OOM counters, and CPU throttling when the host exposes cgroup v2 metrics. These live counters do not replace provider restart history.

## Repository layout

- `server.js`: Express, Socket.IO, API routes, persistence, and runtime cleanup.
- `index.html`: primary browser entry file used for server-rendered SEO metadata.
- `public/index.html`: synchronized fallback copy; keep it byte-identical to the root entry file.
- `public/gifts/`, `public/smileys/`, `public/vip-gifts/`: built-in media served from disk.
- `verify.js`: regression checks.
- `lib/`: isolated persistent-data path enforcement, streaming JSON read/write and restore inspection, backup snapshot/cleanup, trusted client-IP, and cgroup health helpers.
- `scripts/chat-integration-smoke.js`: CI-only authenticated integration checks against the running container (public/private chat, private-media authorization/playback, voice and call signaling).
- `.github/workflows/`: pull-request validation, controlled release-archive refresh, and read-only archive audit.
- `.github/dependabot.yml`: scheduled dependency update proposals for GitHub Actions and npm.
- `package-lock.json`: exact npm dependency tree used by local, CI, and Docker clean installs.
- `rimaz-final-deep-audit-46.93.72.zip`: reviewed source archive retained for the guarded main-branch packaging/sync procedure. It is regenerated only by an explicit `workflow_dispatch` after validation, not on every push, to avoid repeated binary commits.

## Docker

The Dockerfile installs production dependencies with `npm ci --omit=dev` from the committed lockfile and copies the application. `.dockerignore` excludes runtime data, local dependencies, archives, and repository-only workflow files from the image build context. The persistent data volume must be mounted separately; it is not part of the image.

## Safe repository workflow

Work on a feature or maintenance branch and open a pull request to the repository's designated integration branch. The current maintenance PRs target `safety/validate-and-backup-before-sync`; `main` is the production branch and remains unchanged during this review. Promote to `main` only through a separate reviewed change after CI, staging smoke tests, a verified persistent-volume backup, and explicit approval.

The old write-enabled ZIP self-sync workflow has been removed: it required the archive to match `main` exactly before copying the same files back, so it could not promote a feature-branch candidate and carried unnecessary `rsync --delete` / Git-push permissions. Application changes are integrated through reviewed pull requests. The `Validate Rimaz Project` workflow refreshes the tracked ZIP only after an explicit dispatch and successful source validation; `Audit Rootfix Archive` checks its safe paths and exact source parity without changing repository files. Neither workflow deploys to Deplexo or changes live data. You do not need to edit or upload the ZIP manually.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the required branch, validation, and review process.

## Documentation index

See [docs/README.md](docs/README.md) for the categorized index of project records, audits, and operations notes. The root [CHANGELOG.md](CHANGELOG.md) records application and repository changes.
