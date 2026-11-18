# Final audit — v46.93.49

## Changes
- Shared protected media fetch routine for private chat and wall.
- Session header included for both scopes; preview media is rendered from Blob URLs.
- Original explicit image/video view buttons retained; modal is opened only by button actions.
- No autoplay attribute on inline video preview; preview is muted with metadata preload only.
- Loading text removed; compact spinner and concise error state retained.
- Larger responsive preview sizes.
- Object URLs are revoked when leaving the relevant overlay.
- No public media sending path added.

## Checks
- `npm test`: passed all local checks.
- Inline JavaScript: `node --check` passed.
- Root/public `index.html`: identical.
- ZIP: integrity test passed.

## Not verified
- Actual browser behavior on the deployed Deplexo service and target Android device. This requires deployment and live testing.
