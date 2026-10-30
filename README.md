# Rimaz Chat – Smiley Shortcut Fix (v36)

This seven-file package contains the targeted smiley fixes:
- Saved smiley shortcuts (for example `ض١`) are expanded to the selected inline smiley image before sending, rather than leaving the internal smiley token visible in the composer.
- The smiley tiles in the admin settings grid are smaller and more compact so more items fit vertically. This styling is scoped only to the admin settings grid; the chat smiley picker and mobile emoji grid are unchanged.

Deployment notes:
- Keep the live `data.json` on the server; do not replace it with the starter file in this package.
- Keep the existing `uploads` directory and its contents.
