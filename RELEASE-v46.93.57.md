# Rimaz Chat v46.93.57

## Included changes

1. Online member identity cell: the country marker/square is placed on the left and the member number on the right. Desktop and mobile widths are defined in the existing member-directory layout rules.
2. Online-member search: the search control now uses a dedicated left-anchored row. Its height and search/filter behavior are unchanged.
3. Private-chat typing indicator: a right-aligned three-dot animation appears for the other participant while typing. The browser emits typing state transitions; the server validates the recipient, automatically expires stale typing state, and clears it on disconnect. The indicator is cleared on blur, send, and conversation close. Text and media messages remain before the indicator in the conversation flow.

## Verification

- `node --check server.js` — passed.
- `node --check verify.js` — passed.
- `node verify.js` — all local static and archive checks passed.
- Root and `public/index.html` are byte-identical.

## Not verified

No live deployment or real two-device session was available. Test the typing indicator with two signed-in accounts after deployment, including pause, send, blur, close, and disconnect cases.
