# Rimaz Chat — Gift System v20

This build is based on the supplied `rimaz-chat-profile-inline-actions-v19.zip` project.

## Gift system changes
- Rebuilt the gift picker as one consistent responsive grid.
- Removed the old cropped PNG artwork and the old crop-based rendering logic; gifts now render as complete emoji glyphs.
- Added 15 additional gifts to the existing 53 gifts and 9 extra gifts (77 built-in choices total).
- Added a visible selected-gift label so the chosen item is clear before sending.
- Kept the send/cancel controls in a fixed footer at the bottom of the picker.
- Persisted the exact selected glyph and stable gift ID with each sent gift; the recipient animation and member badge use that same saved glyph.
- Kept backward compatibility for existing gift records that do not yet contain `giftIcon` or `giftId`.

## Deployment
Upload the project contents as usual. Keep the live `data.json` file and its user data unchanged when replacing the application files. No `public/gifts/` image folder is required in this build.

## Checks performed
- Node.js syntax check passed for `server.js`.
- Inline JavaScript syntax checks passed for both copies of `index.html`.
- The built-in gift catalog contains 77 entries with 77 distinct IDs.
- ZIP integrity check passed.
