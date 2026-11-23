# Runtime resource audit — 2026-11-24

## Scope and limits

This review inspected the checked-in server.js and its resource lifecycles. It did not inspect the live Deplexo container filesystem or measure production memory. The findings below identify concrete code paths; they do not establish the cause of the previously observed container restarts or prove an out-of-memory event.

## Confirmed resource-lifecycle gaps addressed in this branch

### 1. Private media playback-ticket cache had no hard capacity

The authenticated media-ticket route created a new random 15-minute ticket for every valid request. Expired entries were swept every five minutes and during requests, but there was no global or per-account maximum. Repeated requests could therefore grow the in-memory Map for the ticket lifetime.

The change:
- Reuses an unexpired ticket for the same account and exact filename.
- Limits each account to 32 active tickets.
- Limits the process-wide cache to 4,096 active tickets.
- Returns HTTP 429 for the per-account limit and HTTP 503 for global capacity.
- Retains the existing 15-minute expiry, account binding, filename checks, participant authorization, and private stream route.

### 2. Persisted sessions from a prior process were not scheduled for disconnect cleanup on startup

The server loaded db.sessions into the in-memory sessions Map at startup. The 60-second disconnect cleanup was scheduled only from a live Socket.IO disconnect event. If a process exited abruptly, no disconnect event could run; those persisted session entries could remain valid and accumulate across restarts.

The change:
- Captures the sessions loaded at startup.
- Gives them the existing 60-second reconnect grace.
- Preserves a session if its socket reconnects during the grace period or if its own disconnect-cleanup timer is already active.
- Removes remaining orphaned sessions in one batch and performs one durable save rather than one save per session.
- Removes guest/profile/read-cursor state only for orphaned guest sessions.
- Restores the prior in-memory state and retries after 30 seconds if the durable save fails.

## Regression coverage

The branch adds dynamic tests for ticket reuse, expiry, per-account and global caps, startup session reconnect preservation, batch cleanup, and rollback/retry on save failure.

## Not established

- No evidence yet ties either gap to the historical ticket is not defined stack trace.
- No evidence yet proves the historical container restarts were caused by OOM.
- The current production database size, heap usage, container exit code, and restart reason remain unmeasured.
- The changes have not been deployed to Deplexo and have not been exercised against the live persistent volume.

## Next production evidence required

Before deployment, inspect the hosting container events and resource graphs, capture the live database file size and Node heap/RSS under normal traffic, and verify the restart reason and running commit. Preserve the live data volume and use a staging deployment for smoke and restore tests.
