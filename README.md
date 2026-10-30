Rimaz Chat v26 — Smileys Gallery

- Adds a preloaded grid of 300 classic-style smiley image tiles based on the reference screenshot supplied in the conversation.
- Each tile has its own shortcut field (for example ض1) and a save button.
- The same bundled smileys are loaded into the chat smiley picker.
- When a saved shortcut is sent, the message displays the selected smiley image.
- Supports additional uploaded GIF, PNG, JPG and WEBP smileys.
- Existing chat shortcuts, likes, gifts, rooms, users and other features are retained.

Deployment: preserve the existing persistent data.json and uploads directory. The classic smiley images are bundled under public/classic-smileys. The server seeds them into an empty smiley list once; it records a seed flag so intentionally deleted items do not reappear on restart.
