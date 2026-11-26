# Repository structure and file ownership

This guide explains why each top-level area exists and which files must remain in place. The goal is a small, predictable repository root without breaking runtime paths or deployment automation.

## Directory map

```text
.
├── .github/
│   ├── dependabot.yml
│   ├── pull_request_template.md
│   └── workflows/
├── docs/
│   ├── audits/
│   ├── operations/
│   └── project/
├── lib/
│   ├── backup-media-snapshot.js
│   ├── backup-temp-cleanup.js
│   ├── cgroup-metrics.js
│   ├── client-ip.js
│   ├── json-reader.js
│   ├── json-writer.js
│   └── restore-inspector.js
├── public/
│   ├── gifts/
│   ├── smileys/
│   └── vip-gifts/
├── scripts/
│   └── chat-integration-smoke.js
├── .dockerignore
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .nvmrc
├── CHANGELOG.md
├── CONTRIBUTING.md
├── Dockerfile
├── README.md
├── data.json                 # tracked warning placeholder
├── google1a84d9d1dec7b85d.html
├── index.html
├── package-lock.json         # exact npm dependency graph
├── package.json
├── rimaz-final-deep-audit-46.93.72.zip
├── server.js
└── verify.js
```

The root also contains a small tracked data placeholder, the domain-verification file, Docker/Git configuration, a Node.js version pin, the npm lockfile, and the single audited ZIP required by the current workflows.

## Root files that must not be moved casually

| File | Why it stays at the root |
|---|---|
| `server.js` | Application start command and Docker image expect this path |
| `package.json` | npm and Docker build resolve dependencies from the project root |
| `package-lock.json` | `npm ci` and the production Docker build use this exact dependency graph |
| `index.html` | Main browser entry file and server SEO integration |
| `Dockerfile` | Hosting and CI build from the repository root |
| `verify.js` | Current npm test script runs this file |
| `.nvmrc` | Canonical Node.js major version used by local nvm setup and CI |
| `data.json` | Tracked warning placeholder retained for repository/workflow compatibility; it is not production data |
| `google1a84d9d1dec7b85d.html` | Domain verification endpoint; keep it byte-identical to the copy under `public/` |
| `rimaz-final-deep-audit-46.93.72.zip` | Exact input path for archive audit and guarded manual synchronization workflows |

`public/index.html` is a synchronized fallback copy of the root `index.html`. The regression suite checks that the two copies remain byte-identical.

## Tooling consistency

`.nvmrc` is the single Node.js major-version source for local development and GitHub Actions. `package.json` constrains supported runtime versions, while the Dockerfile uses the matching Node 24 base image. `package-lock.json` records the resolved dependency tree; local development, CI, and Docker use `npm ci` to install it without re-resolving version ranges.

## Persistence and JSON helpers

- `lib/json-reader.js` incrementally parses the live database and restore-confirmation file in bounded chunks, with a nesting limit and without allocating a full source-text string.
- `lib/json-writer.js` serializes database snapshots in bounded chunks for durable atomic writes and backup staging.
- `lib/restore-inspector.js` validates staged restore previews from JSON tokens without retaining the full replacement database graph.
- `lib/backup-media-snapshot.js` snapshots only structured references to public uploads using hard links, and fails closed if a referenced file is missing or unsafe.
- `lib/backup-temp-cleanup.js` removes only recognized backup temp artifacts older than seven days after an interrupted export; fresh and unrelated files are preserved.
- `lib/client-ip.js` accepts forwarding headers only when the immediate peer matches explicitly configured trusted proxy CIDRs.
- `lib/cgroup-metrics.js` reads optional cgroup v2 memory/OOM/CPU counters for the owner health panel.
- `scripts/chat-integration-smoke.js` runs authenticated server-side integration checks from CI against the constrained production container.
- Keep persistence helpers separate from `server.js` so file-format and failure behavior can be regression-tested independently.

## Runtime assets

Built-in gifts, smileys, and VIP gifts are served from `public/gifts/`, `public/smileys/`, and `public/vip-gifts/`. The server discovers these files dynamically. Built-in gift IDs are derived from the sorted asset list, so deleting or renaming an apparently duplicate image can shift generated IDs and affect existing catalog references. Do not deduplicate or rename media until the catalog migration and stored references have been verified.

Some files have identical contents but distinct names. Two duplicate pairs are intentional synchronized copies (root/public HTML and Google verification); other identical media files are retained because their filenames participate in dynamic asset discovery.

## Documentation ownership

- `docs/project/`: dated continuation checkpoints; `CHECKPOINT-2026-11-26.md` is the latest recorded reference, while earlier checkpoints are retained as history. Update the documentation index when a newer checkpoint is added.
- `docs/audits/`: security, runtime-resource, and transaction-safety findings.
- `docs/operations/`: release gate and deployment procedures.
- `docs/README.md`: navigation index for maintained documentation.

Keep implementation entry points in the root, application media in `public/`, and non-runtime reports in the appropriate `docs/` category.

## Data and release safety

The full application export contains the database and structured references to public uploads. Transient private messages and their private-media files are intentionally excluded because private conversations are not persisted. An independent persistent-volume backup must be planned separately.

Git history and rollback branches cover tracked repository files only. They do not back up the live Deplexo persistent volume, database, uploads, or private media. Never replace live data with the tracked placeholder or a source archive. Production promotion requires a separately verified volume backup, a restore test, staging smoke tests, and explicit approval.
