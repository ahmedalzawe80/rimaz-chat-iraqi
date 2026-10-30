# Rimaz Chat — clean classic + mobile smiley gallery

## Changes
- Rebuilt the smiley catalog from a clean slate using 50 original, individually drawn SVG classic-style smileys.
- Classic smileys appear first in the gallery.
- Added 400 distinct mobile emoji after the classic set.
- Removed the old smiley-catalog migration logic and replaced it with a single version-4 migration.
- The migration replaces only `customSmileys`; it preserves `chatShortcuts`, accounts, messages, rooms, profiles, uploads, and all other database fields.
- Existing smiley shortcut assignments are cleared with the old catalog; the shortcut feature itself remains available for assigning new shortcuts to the new items.
- The same gallery remains shared by public chat, private messages, wall posts, and admin.

## Deployment
Upload the changed application files and the `public/classic-smileys/` folder. **Do not overwrite the live `data.json` or the persistent `uploads/` directory.**
On first startup, the server replaces the old smiley catalog with 50 classic items followed by 400 mobile emoji. The migration does not delete any other user or chat data.

## Validation
- `node --check server.js` passed.
- 50 independent SVG assets are present.
- The mobile emoji list contains 400 unique entries.
- The migration preserves chat shortcuts and unrelated database fields by updating only `db.customSmileys` and its gallery version markers.
- Live Deplexo deployment has not yet been tested.
