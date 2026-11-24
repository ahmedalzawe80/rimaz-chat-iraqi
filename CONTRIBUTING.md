# Contributing to Rimaz Chat

This guide keeps repository changes reviewable and protects live user data.

## Runtime and dependencies

- Use Node.js 24 LTS and npm, matching `package.json`, `.nvmrc`, and the production Docker image. Run `nvm use` from the repository root when using nvm.
- The repository currently has no committed `package-lock.json`. Until a reviewed lockfile is added, use `npm install`; do not switch CI or deployment to `npm ci`.
- Do not commit `node_modules/`, local environment files, credentials, database snapshots, uploads, private media, or hosting backups.

## Branch and review process

1. Start from the designated integration branch and create a focused feature or maintenance branch.
2. Keep each change scoped and explain its purpose in the commit or pull request.
3. Open a pull request to the currently designated integration branch. The active maintenance work targets `safety/validate-and-backup-before-sync`; `main` is the production branch.
4. Do not bypass review or promote to `main` until checks pass, staging validation is complete, and the release has explicit approval.

## Required local checks

Run from the repository root:

```sh
node --check server.js
node --check verify.js
npm test
docker build -t rimaz-chat-iraqi:local .
```

For changes to browser assets, verify that `index.html` and `public/index.html` remain synchronized where the change requires it. For documentation changes, keep the links in `docs/README.md` valid.

## Runtime data and deployment safety

- The tracked root `data.json` is a warning placeholder, not production data.
- The live database, uploads, and private media belong to the persistent `DATA_DIR` volume.
- Never replace, delete, or reset production data as part of repository cleanup.
- Git rollback branches do not back up the Deplexo persistent volume.
- Changes affecting persistence, uploads, sessions, or deployment require staging smoke tests and an independently backed-up, restore-verified data volume before production promotion.

## Pull request expectations

- Describe behavior changes and any compatibility or migration impact.
- Include regression tests for bug fixes and security-sensitive behavior.
- Update `CHANGELOG.md` for user-visible or operationally significant changes.
- Update the relevant document under `docs/` when procedures or audit findings change.
- State clearly which checks were run and which live/staging checks remain outstanding.
