# Rimaz Chat — v16 gift image fix

This build fixes broken gift images by embedding the 53 reference gift PNGs directly as data URLs in both `index.html` and `public/index.html`, so the gift picker does not depend on the `/gifts/` static path or on uploading the image folder separately. An `onerror` fallback shows the gift emoji if an image cannot render.

Deploy the full project as usual. Keep the existing production `data.json` when updating so member and room data are preserved. Do not replace the production data file with the bundled starter file.

Validation performed locally: `node --check server.js`; JavaScript script syntax checked in both HTML entry points. Live deployment and server-side gift deletion have not been tested against the production website.
