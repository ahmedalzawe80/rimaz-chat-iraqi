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
│   ├── json-reader.js
│   └── json-writer.js
├── public/
│   ├── gifts/
│   ├── smileys/
│   └── vip-gifts/
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

The root also contains a small tracked data placeholder, the domain-verification file, Docker/Git configuration, a Node.js version pin, the npm lockfile, and the audited ZIP required by the current workflows.

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
| `rimaz-final-deep-audit-46.93.72.zip` | Exact input path for the archive audit and guarded manual synchronization workflows |

`public/index.html` is a synchronized fallback copy of the root `index.html`. The regression suite checks that the two copies remain byte-identical.

## Tooling consistency

`.nvmrc` is the single Node.js major-version source for local development and GitHub Actions. `package.json` constrains supported runtime versions, while the Dockerfile uses the matching Node 24 base image. `package-lock.json` records the resolved dependency tree; local development, CI, and Docker use `npm ci` to install it without re-resolving version ranges. The validation workflow reads `.nvmrc` instead of duplicating a version literal and cancels superseded runs for the same branch or pull request.

## Persistence and JSON helpers

- `lib/json-reader.js` incrementally parses the live database and staged restore files in bounded chunks; it applies a nesting limit and avoids a full source-text allocation.
- `lib/json-writer.js` serializes database snapshots in bounded chunks for durable atomic writes and backup staging.
- Keep these helpers separate from `server.js` so file-format and persistence behavior can be regression-tested independently.

## Runtime assets

Built-in gifts, smileys, and VIP gifts are served from `public/gifts/`, `public/smileys/`, and `public/vip-gifts/`. The server discovers these files dynamically. Built-in gift IDs are derived from the sorted asset list, so deleting or renaming an apparently duplicate image can shift generated IDs and affect existing catalog references. Do not deduplicate or rename media until the catalog migration and stored references have been verified.

Some files have identical contents but distinct names. Two duplicate pairs are intentional synchronized copies (root/public HTML and Google verification); other identical media files are retained because their filenames participate in dynamic asset discovery.

## Documentation ownership

- `docs/project/`: continuation checkpoints and handoff records.
- `docs/audits/`: security, runtime-resource, and transaction-safety findings.
- `docs/operations/`: release and operational procedures.
- `docs/README.md`: navigation index for all maintained documentation.

Keep implementation entry points in the root, application media in `public/`, and non-runtime reports in the appropriate `docs/` category.

## Data and release safety

Git history and rollback branches cover tracked repository files only. They do not back up the live Deplexo persistent volume, database, uploads, or private media. Never replace the live data with the tracked placeholder or with a source archive. Production promotion requires a separately verified volume backup, a restore test, staging smoke tests, and explicit approval.
