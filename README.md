# Rimaz Chat — Gift deletion fix

This package updates the gift picker so the member-management “إرسال هدية” button opens the gift grid and, in the same panel, lists that member’s granted gifts with a delete button. Gift deletion sends a stable gift identifier/signature to the server, verifies permission and target account, saves the change, then refreshes the panel. The old “رمز الهدية / اسم داخلي / إضافة” controls are not shown in the gift picker.

## Deploy carefully
- Install dependencies with `npm install`, then run `npm start`.
- Preserve your existing persistent data directory and `data.json`; do not replace live user data with a default file.
- The archive intentionally omits `data.json` so it cannot overwrite your live database.

## Verification
- `server.js` passed `node --check`.
- Inline JavaScript from both copies of `index.html` passed `node --check`.
- ZIP integrity was checked.
- Live integration testing was not possible in this environment because project dependencies and the live server are unavailable.
