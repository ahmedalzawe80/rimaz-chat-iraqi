# Rimaz Chat v25 — Smileys & GIF support

Based on the supplied v24 package. Existing room, member, likes, gifts, shortcuts, and admin behavior is retained.

## Smiley administration
- Upload animated GIF or static PNG/JPG/WEBP smiley files from the admin Smileys section.
- Assign a unique shortcut such as `ض1` to each uploaded smiley.
- The uploaded smileys appear in the chat smiley picker.
- Selecting a smiley inserts its internal token; sending the message renders the exact uploaded image/GIF in public chat, private messages, and wall posts.
- Text emoji can also be assigned shortcuts.
- Smiley files are stored in the existing persistent uploads directory; metadata is stored in `data.json`.

## Important note about the reference image
The exact original image files used by the other chat are not exposed as downloadable assets in the supplied screenshot, and the reference site was not accessible for retrieving them. This version therefore adds the full GIF/image import workflow and visual gallery so the exact GIF/PNG files can be added from the owner-provided pack. It does not claim that the competitor's proprietary smiley files were copied.

## Deployment
Keep the live persistent `data.json` and `uploads` directory unchanged when replacing application files. The package includes no replacement user database.

## Validation
- `node --check server.js` passed.
- Inline JavaScript syntax check passed.
- Root `index.html` and `public/index.html` synchronized.
- ZIP integrity checked after packaging.
- Full browser/server integration test was not run because runtime dependencies are not installed in this build environment.
