# Final Audit Report — Rimaz Chat v46.93.37

## Release result

<badge>LOCAL CHECKS PASSED</badge>

The release corrects the presence/session ownership defect and aligns the global online count, room counts, private unread count, and wall unread count around consistent server-side state.

## Changes delivered

1. Socket ownership is explicit. A late disconnect from an older socket cannot delete a newer live session.
2. Stale sockets cannot send room messages, private messages, room-mic signals, or private-call signaling.
3. Online counts and room counts deduplicate by account. The room capacity is enforced on the server.
4. Multiple tabs for the same account no longer produce duplicate room join/leave notices, including explicit room exits.
5. Disconnected sessions and transient private conversations have a 60-second reconnect grace period. Expired session records are cleaned up safely.
6. Opening the private contacts list no longer marks every conversation read. Per-contact and total unread counts are loaded from the server and shown.
7. Wall unread counts persist across page reloads and use a per-account read cursor. Overlapping feed/list fetches cannot apply stale responses over newer state.
8. Country flags use available proxy country metadata. If no code is supplied, the country is shown as unknown rather than assumed to be Iraq.

## Checks

- Server and verification-script syntax checks: passed.
- Full local `verify.js` suite: passed.
- Presence runtime fixture: passed.
- Main/public HTML equality: passed.
- The local suite reports that live-server testing is still required.

## Deployment precautions

1. Back up the live database and the `uploads` and `private-media` directories before deployment.
2. Do not overwrite Deplexo's persistent data volume with the archive's placeholder `data.json`.
3. After deployment, test two or more accounts simultaneously on separate devices. Check the global count, each room count, private unread badges, wall unread badges after a page reload, disconnect/reconnect, and room movement.

## Limits

The local tests are not a substitute for testing against Deplexo's actual proxy and multiple real devices. In particular, country flags depend on the country headers supplied by the hosting layer; when absent, the correct behavior is an unknown flag.


## v46.93.38 — Media delivery audit

- Confirmed private media was delivered to only the first matching active recipient session, unlike private text messages which fan out through `emitToUser`.
- Corrected private media to fan out to all current sockets for the target account after validating that the account has a connected session.
- Added QuickTime MOV MIME/extension support while retaining binary signature validation.
- Preserved the documented transient private-chat retention policy.
- Static regression coverage added; no live Deplexo, multi-device browser, or physical iPhone/Android upload test was possible in this local audit.
