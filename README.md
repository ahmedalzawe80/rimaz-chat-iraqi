# Rimaz Chat — v46.34

This build is based on v46.33 and includes:
- Restore room-name/description placement beside the room image on the left, with the member count on the right.
- Make the members, rooms, wall, and private-conversations overlays render immediately, then load their data asynchronously.
- Ignore stale overlay responses after the user switches tabs or closes an overlay.
- Preserve the v46.32 online-members layout and all unrelated chat surfaces.

Run `npm test` for local static verification. Live-server testing is still required.
