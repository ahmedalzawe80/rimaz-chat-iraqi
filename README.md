# Rimaz v45 — shortcut expansion timing

This package is based on v44. It preserves the v44 independent shortcut/smiley permission behavior and removes automatic shortcut expansion while typing.

## Change in v45
- Shortcut tokens (for example `س1`) remain visible in the composer while the user types.
- Smiley tokens (for example `ض1`) also remain visible as typed text in the composer.
- Tokens are expanded only when the user sends the message/post, so the saved shortcut text or smiley appears in the published chat content.
- The same send-time behavior applies to public chat, private messages, and wall posts.

## Deployment
Replace `index.html`, `public/index.html`, and `server.js` with the packaged files, then restart the application. Do not replace the live `data.json` and do not delete or overwrite the existing `uploads/` directory.

The JavaScript syntax and ZIP integrity are checked. This package has not been live-tested on Deplexo.
