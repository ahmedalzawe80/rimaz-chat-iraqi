# Rimaz Chat v28

- Replaced the legacy smiley records once on first startup with the bundled classic image gallery.
- Admin smiley tab displays a single image grid; every tile has its own shortcut field and Save button.
- Chat, private messages and wall use the same database-backed smiley list and the same image tokens.
- Legacy Unicode emoji picker catalogue removed; the picker now shows only the shared image gallery.
- Existing message shortcuts, user accounts, likes, gifts and other data are preserved.

Keep your production `data.json` and `uploads` folder when deploying. The one-time `smileysSeedVersion: 2` migration resets only `customSmileys` to the bundled gallery.
