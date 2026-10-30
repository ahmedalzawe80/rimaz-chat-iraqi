# Rimaz Chat – Independent Shortcuts & Smileys Permissions (v43)

This package keeps the smiley control visible according to its own permission and removes the ⚡ shortcut button from the chat composers. Shortcut management and its server-side permission checks remain available in the administration tools. It also retains independent authorization for both tool collections:
- `shortcuts_manage`: controls shortcut-management actions; the ⚡ composer button is intentionally hidden.
- `smileys_manage`: controls the 🙂 smiley button and smiley picker in public, private, and wall composers.

The active session now includes its effective permission list so the client can render the correct controls immediately after login. Server-side save/upload checks remain authoritative; a user with only one permission cannot modify the other tool collection.

## Deployment
1. Back up the existing app files.
2. Replace `index.html`, `public/index.html`, and `server.js` with the files in this package. Keep `package.json` and `Dockerfile` if unchanged.
3. **Do not replace the live `data.json` file.** This package intentionally omits it.
4. **Do not delete or replace the existing `uploads/` directory.**
5. Restart/redeploy the application, then sign in as the owner and assign the two permissions independently in rank permissions.

The root `index.html` is served first by the current server configuration; `public/index.html` is kept in sync as a fallback.
