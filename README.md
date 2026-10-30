# Rimaz Chat — Gift System v21

Based on the supplied Rimaz v20 archive. Existing v20 gift, member, room, wall, private-message, rank, and room-transition behavior is retained.

## v21 additions
- Added an administration section for message shortcuts. Admins can add and delete named shortcuts; users can insert their saved message text into public chat, private messages, and the wall composer.
- Added an administration section for custom smileys. Admins can add and delete emoji glyphs with optional labels; custom smileys appear in the existing emoji picker for authenticated users.
- Added a dedicated likes-management section with member balances, search, preset grant amounts, custom grant amounts, and reset. It uses the existing protected server-side like-grant/reset logic and updates member balances through the existing live event.
- Shortcut and smiley settings are persisted in the existing `data.json` store and initialized safely for existing installations.

## Deployment
Upload the project files as usual. Keep the live persistent `data.json` and its user data unchanged when replacing application files. Existing installations automatically initialize the new `chatShortcuts` and `customSmileys` arrays if absent.

## Validation
- `node --check server.js` passed.
- Inline JavaScript syntax check passed for `index.html`.
- `public/index.html` is an exact copy of root `index.html`.
- ZIP integrity check passed.
