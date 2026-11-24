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
├── public/
│   ├── gifts/
│   ├── smileys/
│   └── vip-gifts/
├── server.js
├── index.html
├── package.json
├── Dockerfile
├── verify.js
├── README.md
├── CONTRIBUTING.md
├── CHANGELOG.md
└── repository/hosting integration files
```

The last line is a category description, not a literal directory. The root also contains a small tracked data placeholder, the domain-verification file, Docker/Git configuration, and the audited ZIP required by the current workflows.

## Root files that must not be moved casually

| File | Why it stays at the root |
|---|---|
| `server.js` | Application start command and Docker image expect this path |
| `package.json` | npm and Docker build resolve dependencies from the project root |
| `index.html` | Main browser entry file and server SEO integration |
| `Dockerfile` | Hosting and CI build from the repository root |
| `verify.js` | Current npm test script runs this file |
| `data.json` | Tracked warning placeholder retained for repository/workflow compatibility; it is not production data |
| `google1a84d9d1dec7b85d.html` | Domain verification endpoint; keep it byte-identical to the copy under `public/` |
| `rimaz-final-deep-audit-46.93.72.zip` | Exact input path for the archive audit and guarded manual synchronization workflows |

`public/index.html` is a synchronized fallback copy of the root `index.html`. The regression suite checks that the two copies remain byte-identical.

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
