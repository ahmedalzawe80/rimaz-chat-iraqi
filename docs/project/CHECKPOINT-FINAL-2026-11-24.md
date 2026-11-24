# Rimaz — final continuation checkpoint (2026-11-24)

## Current repository state

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Working branch: `fix/bound-private-media-ticket-cache`
- PR #3 head immediately before this checkpoint refresh: `aeb656918c04a7019c624cfe242fcc8161d06b5b`
- PR #3: https://github.com/ahmedalzawe80/rimaz-chat-iraqi/pull/3
- PR #3 is open, draft, unmerged, and targets `safety/validate-and-backup-before-sync`.
- PR #3 currently contains 34 changed paths.
- All 11 changed paths in PR #2 are included in PR #3; PR #2 has no unique paths and must not be merged separately.
- Repository default branch is `main`. No merge, main update, Deplexo deployment/restart, ZIP sync, or live data modification was performed.

## Latest verified CI

The latest fully verified PR head is `7abc591fa7b370ea5a77088fe42e9239e0976474`, which passed GitHub Actions run [45406653849](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45406653849).

The `validate` job and all listed steps completed successfully:
- Node.js setup from `.nvmrc`
- JavaScript syntax checks
- Project regression tests via `npm test`
- Production Docker image build

The workflow connector did not expose the numeric test pass count for this run. The earlier 556 pass / 0 failure result belongs only to SHA `c30b7b92093dbbf4162cb6f30573355ad20b0f1f`, run `45379916442`; do not attribute it to later commits.

The subsequent commits `1cf3dadeddf0feb06e46ca318f9c97843ac2b203`, `481193ad8217aa9549b3528774bbd1bf8d2cd2a8`, `536c1f82ddd46d695e97b2d82c34954a21cc8554`, and `aeb656918c04a7019c624cfe242fcc8161d06b5b` update release/checkpoint documentation. A PR workflow run was not returned for the latest documentation head when checked. Do not claim these documentation commits have passed CI until a run is confirmed.

## Outstanding release blockers

1. No `package-lock.json` exists. Docker currently uses `npm install --omit=dev`. Generate and review a genuine lockfile on Node.js 24, then validate clean install, tests, and image build before moving to `npm ci`. Never fabricate integrity hashes.
2. No independent backup of the live Deplexo persistent volume has been verified.
3. No isolated staging restore or end-to-end smoke test has been evidenced.
4. No live Deplexo restart/OOM/exit-code/heap/RSS evidence has been collected.
5. No final production approval has been given.

## Safety boundary

Do not merge PR #3, change `main`, close or merge PR #2, deploy/restart Deplexo, run ZIP sync, or touch live database/uploads/private media/persistent volume without explicit approval and the verified backup + staging gates.

## Resume instructions

Continue from this checkpoint and inspect the latest branch head and CI first. Keep changes on `fix/bound-private-media-ticket-cache`. Prioritize a genuine lockfile and deterministic dependency install only when a trusted Node.js 24 environment and npm registry are available. Do not claim staging or production validation without actual access and evidence.
