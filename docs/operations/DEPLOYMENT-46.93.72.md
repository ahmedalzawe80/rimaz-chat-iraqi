> **Historical deployment record:** this document is retained for release history, not as the current deployment procedure. The repository's current archive is `rimaz-final-deep-audit-46.93.72.zip`; always inspect the current guarded workflow and project checkpoint before any synchronization. Never run a production replacement without an independent persistent-volume backup, staging verification, and explicit approval.

# Rimaz Chat 46.93.72 — Deployment notes

## Package layout

This archive is intentionally flat: `package.json`, `server.js`, `index.html`, and `public/` are at the archive root. Extract the archive contents directly into the application root; do not create an extra wrapper directory.

The redundant nested project directory and the old embedded 46.93.71 archive were excluded. All current application source files and public assets from the 46.93.72 candidate are retained.

## GitHub repository automation

The existing repository workflow `.github/workflows/unzip-upload.yml` looks for a ZIP named exactly `rimaz-final-deep-audit-46.93.71.zip` in the repository root. This delivery uses that exact filename for compatibility, but its project contents are version **46.93.72**.

Upload this ZIP to the repository root, then run **Actions → Clean Replace Project Upload → Run workflow**. The workflow intentionally preserves the repository's existing `.github` workflow, root `data.json`, and root Google verification file. Review the Actions log and resulting commit before proceeding.

## Hosting deployment

Extract the archive so `package.json`, `server.js`, `index.html`, and `public/` are directly in the application root. Install the dependencies with `npm install` and start with `npm start`, or use the hosting platform's equivalent build/start configuration.

Before deployment, take a backup of the live persistent database and uploads. Do not replace the live persistent database with the archive's placeholder `data.json`. Keep the hosting persistent data volume mounted and configured as before.

## Validation boundary

The local regression suite passed 448 checks on Node.js 22.16.0, and `server.js` and `verify.js` passed syntax checks. The production-reported Node.js 20.20.2 runtime was not available for an exact-version test. No live hosting, production database, real concurrent-load, or production restore test was performed. Deploy to staging and smoke-test login/reconnect, chat, rooms, voice/video, uploads, and backup restore before promoting to production.
