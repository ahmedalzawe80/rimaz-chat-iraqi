# Rimaz checkpoint — 2026-11-28

## Current verified status — supersedes older snapshots below

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`.
- Working branch: `review/rimaz-clean-integration-2026-11-27`.
- Latest reviewed application/runtime candidate: `da444af14525fdf6c94f22a2e05a8833728b2149`. The subsequent checkpoint and documentation-index commits (`e94420d799d1e2ab0511d82b3ccc9ecd7af5cb24` and `6bf91ed10524c277d87da28c166f436e989dc2c4`) are documentation-only and do not change application behavior.
- Exact-head CI also passed on the documentation-index head `6bf91ed10524c277d87da28c166f436e989dc2c4`: push run [#46121898038](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/46121898038) and pull-request run [#46121903091](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/46121903091).
- PR #9 remains **open, draft, and unmerged**. Its head is the review branch and its base is `safety/validate-and-backup-before-sync`, not production `main`. Do not merge, change its base, synchronize/rewrite it, or deploy without the user's explicit approval. The previous 2026-11-27 checkpoint recorded a mergeability conflict after the safety base advanced; obtain a fresh comparison before any integration decision.
- Exact-head GitHub Actions validation succeeded on commit `da444af14525fdf6c94f22a2e05a8833728b2149`:
  - Push run [#46121771554](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/46121771554) — success.
  - Pull-request run [#46121775519](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/46121775519) — success.
  - Locked dependency installation/tree verification, JavaScript syntax, project regression tests, production Docker build, and constrained HTTP/Socket.IO integration smoke all passed.
  - cgroup-v2 memory on the push run: current `61,165,568` bytes, peak `72,863,744` bytes, limit `134,217,728` bytes.
  - cgroup-v2 memory on the pull-request run: current `67,432,448` bytes, peak `71,397,376` bytes, limit `134,217,728` bytes.
  - These are isolated CI container readings under the configured 128 MiB / 0.25 vCPU limits. They are not measurements from the live Deplexo service and do not prove production OOM resolution.
- The subscription lifecycle growth issue was fixed without deleting historical data:
  - Grant/renew now reuses the active unexpired subscription record, or the latest prior record for that account when the previous term expired or was cancelled.
  - It creates a new record only when the account has no prior subscription record.
  - Existing per-record event history remains capped at 100; prior duplicate historical records are left untouched.
  - Grant and cancellation clone only the target record's history rather than cloning every account history.
  - Runtime regression fixtures cover active renewal, reactivation from expired/cancelled history, new-account creation, and isolation of unrelated records.
- Campaign audit outcome:
  - Campaigns are created, edited, and deleted only through permission-gated admin routes; deletion removes an image only after the database save and only when the upload is no longer referenced.
  - No automatic impression/click write path or per-visitor campaign accumulation was found.
  - Campaign records and their images remain until an administrator explicitly deletes them. No arbitrary campaign retention cap or automatic deletion was introduced.
- Repository structure was rechecked from the exact branch tree: standard project files remain at the root; documentation is grouped under `docs/`, runtime helpers under `lib/`, smoke scripts under `scripts/`, and browser assets under `public/`. No nested `rimaz-chat-iraqi-main/`, tracked generated release ZIP, `node_modules/`, or `coverage/` tree was found. The tracked `data.json` placeholder and Google verification file were not modified.
- Removed one duplicated identical repository-automation entry from `CHANGELOG.md`; the current changelog records the subscription lifecycle fix and CI evidence.
- No merge, production deployment, Deplexo restart, live-volume access, or mutation of `/data/rimaz`, database contents, uploads, private media, or backups occurred during this stage. The last deployment commit reported in the prior checkpoint was `6d931239167f5cd811da4df75ef0ededcfec802c`; this stage did not verify a newer live deployment.

## Remaining release and production gates

1. Obtain a provider-confirmed independent full-volume backup/export of the Deplexo persistent volume.
2. Perform an isolated restore test covering database and media, including the required recovery generations and missing historical media investigation.
3. Complete browser/device staging checks, including WebRTC/TURN behavior.
4. Obtain representative Deplexo restart/OOM and memory evidence under realistic load.
5. Confirm trusted-proxy configuration with the hosting provider.
6. Resolve PR #9's base/mergeability deliberately; it currently targets the safety branch, not `main`.

## Standing safety rules

- Root-cause fixes only; preserve existing behavior and member data.
- Do not delete old subscription records, campaigns, uploads, or historical files as a speculative cleanup.
- Do not modify the live database, uploads, private media, or backups.
- CI measurements are not live hosting measurements.
- No merge to production, main update, deploy, rebuild, restart, or live-volume mutation until release gates are satisfied and the user explicitly approves the release step.

