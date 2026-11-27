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
│   ├── data-directory.js
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
├── server.js
└── verify.js
```

The repository root currently has 16 tracked files. Each has an identified runtime, dependency, editor/Git, documentation, domain-verification, build, test, or audited-release role; the root is intentionally not a dumping ground. Keep these entry points at the root rather than moving them merely to reduce the visible file count. The two HTML entry copies and two domain-verification copies have separate serving/verification roles and must remain synchronized.

## Root files that must not be moved casually

| File | Why it stays at the root |
|---|---|
| `.dockerignore` | Defines the build-context boundary; keeps runtime data, local dependencies, archives, and repository-only files out of Docker builds |
| `.editorconfig` | Shared editor formatting defaults for contributors and tooling |
| `.gitattributes` | Git text/binary and line-ending normalization rules |
| `.gitignore` | Excludes local dependencies, runtime data, secrets, backups, and generated artifacts from Git |
| `.nvmrc` | Canonical Node.js major-version pin consumed by local nvm and CI |
| `CHANGELOG.md` | Chronological record of application and repository changes |
| `CONTRIBUTING.md` | Required branch, validation, review, and data-safety process |
| `README.md` | Project entry point: setup, runtime configuration, layout, and safe workflow |
| `server.js` | Application start command and Docker image expect this path |
| `package.json` | npm and Docker build resolve dependencies from the project root |
| `package-lock.json` | `npm ci` and the production Docker build use this exact dependency graph |
| `index.html` | Main browser entry file and server SEO integration |
| `Dockerfile` | Hosting and CI build from the repository root |
| `verify.js` | Current npm test script runs this file |
| `data.json` | Tracked warning placeholder retained for repository/workflow compatibility; it is not production data |
| `google1a84d9d1dec7b85d.html` | Domain verification endpoint; keep it byte-identical to the copy under `public/` |


`public/index.html` is a synchronized fallback copy of the root `index.html`. The regression suite checks that the two copies remain byte-identical.

## Tooling consistency

`.nvmrc` is the single Node.js major-version source for local development and GitHub Actions. `package.json` constrains supported runtime versions, while the Dockerfile uses the matching Node 24 base image. `package-lock.json` records the resolved dependency tree; local development, CI, and Docker use `npm ci` to install it without re-resolving version ranges.

## Persistence and JSON helpers

- `lib/data-directory.js` resolves the persistent database directory and prevents accidental initialization or redirection of an existing hosted member database.
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

- `docs/project/`: dated continuation checkpoints; `CHECKPOINT-2026-11-27.md` is the latest recorded reference, while earlier checkpoints are retained as history. `docs/README.md` links the latest checkpoint first.
- `docs/audits/`: security, runtime-resource, and transaction-safety findings.
- `docs/operations/`: release gate and deployment procedures.
- `docs/README.md`: navigation index for maintained documentation.

Keep implementation entry points in the root, application media in `public/`, and non-runtime reports in the appropriate `docs/` category.

## Data and release safety

The full application export contains the database and structured references to public uploads. Transient private messages and their private-media files are intentionally excluded because private conversations are not persisted. An independent persistent-volume backup must be planned separately.

Git history and rollback branches cover tracked repository files only. They do not back up the live Deplexo persistent volume, database, uploads, or private media. Never replace live data with the tracked placeholder or a source archive. Production promotion requires a separately verified volume backup, a restore test, staging smoke tests, and explicit approval.


## Verified tree snapshot — 2026-11-27

A fresh recursive Git tree inspection of the current PR #3 branch (`fix/bound-private-media-ticket-cache`) returned 416 entries without truncation: 404 tracked file blobs and 12 directory entries. The root contains 17 files and five directories. The 16 root files are intentional application, build, dependency, verification, documentation, or release entry points; the root is not a loose collection of old project copies.

The current tree has 17 Markdown documentation files, organized by audit, operations, and project continuity. Public assets remain in the three catalog directories and other required `public/` paths; the current public asset/file count is 360. No nested second application directory, extra root ZIP, or backup/temp dump was found.

The latest source/test commit `f60b85fe6f84fd997a500546880c10949a170d46` passed both jobs in Actions run [#45943098064](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45943098064). The branch tip `4c8309f86c589b4afac04253efb6cb1fc2126971` is the subsequent archive-only commit. See the repository cleanup inventory for the detailed file and duplicate-media classifications.

These counts are a dated snapshot and should be refreshed after structural changes. They do not imply that production data, the Deplexo volume, or live media were inspected.


## Release archive lifecycle — 2026-11-27

The release ZIP is no longer tracked in the repository. It is generated in GitHub Actions runner temporary storage only after explicit dispatch and successful source validation, then uploaded as a downloadable workflow artifact. This keeps the 16-file repository root free of generated binary archives and avoids archive-only Git commits.

The `build-release-archive` job runs only after an explicit `workflow_dispatch` on `main` or an approved maintenance branch, and only after the source-validation job succeeds. It builds the archive outside the repository, checks safe paths and exact tracked-file parity, tests the extracted project, builds the Docker image, and uploads a 30-day Actions artifact. Ordinary pushes do not create ZIP files or binary commits. This process does not promote code to `main` or deploy; integrate application changes through the reviewed pull-request process.
