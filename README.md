# Rimaz Chat — v12 Gift UI and animation update

Based on v11. Adds a client-side animated gift celebration when a gift is received over the existing Socket.IO `gift` event, and shows the same celebration locally after the sender's gift API request succeeds. Gift picker selection and server-side gift persistence remain on the existing `/api/admin/gift` route.

Files: `index.html`, `public/index.html`, `server.js`, `package.json`, `Dockerfile`, `data.json`.

Deployment: replace `index.html`, `public/index.html`, and `server.js` as appropriate for your deployment; preserve the existing live `data.json` to keep user data. This build uses the existing emoji gift catalog; original custom gift artwork/animation assets were not embedded in the supplied project or demonstrably available from the video, so the celebration animation is a new approximation rather than a pixel-identical copy of the source site's gift animation.
