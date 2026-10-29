# Rimaz Chat v15 — Gift catalog update

- The member gift picker now uses the custom gift icons cropped from the user's reference screenshot.
- Added 53 gift-art PNGs under `public/gifts/`.
- The picker uses an 8-column layout and places `إزالة الهدية` as the final grid tile, with Send and Cancel actions below.
- Gift sending continues to submit the selected gift's icon/name through the existing API.

Deployment:
1. Replace `index.html`, `public/index.html`, and `server.js` from this package as needed.
2. Upload the complete `public/gifts/` folder as well.
3. Keep the existing `data.json` on the live site to preserve user data.

Note: the custom icons are crops from the reference screenshot, not the original high-resolution animated source assets.
