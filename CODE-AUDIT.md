# v46.93.14 — Targeted layout audit

## Private conversations list
- Actual row markup contains four visual columns: status marker, avatar, `.memberMain` identity/message, and delete button.
- Legacy CSS allocated a phantom rank/badge column despite no direct rank column in the private-contact row markup. This reduced available identity width and shifted the banner.
- Removed all old `.privateListOverlay` row/contact selectors from prior style blocks and replaced them with one canonical rule group using `5px 54px minmax(0,1fr) 58px` (mobile: `4px 48px minmax(0,1fr) 48px`).

## Member card top strip
- Replaced previous profile identity-specific sizing rules with one canonical compact header rule.
- Banner height: 22px (previously 26px). Black strip: 26px total height, zero padding; bottom border retained within border-box sizing.
- Mini-avatar, rank artwork, and close control are constrained to the compact header height.

## Scope
- General chat and wall styles were not changed.
- Shared banner height outside the member card remains 14px.
- `index.html` and `public/index.html` are identical.


## v46.93.20 — Composer alignment and initial likes gate
- The three active editable composer nodes are `#msgInput`, `#privateText`, and `#wallText`. Their shared `.composerRichInput` rule was changed in place from right/RTL to left/LTR; other inputs were not changed.
- The initial release corrected notice and private-media upload checks but did not yet unify voice-room mic and private-call signaling. Those remaining paths were identified and corrected in v46.93.21 below.

## v46.93.21 — Unified likes authorization audit

### Canonical thresholds
- `NOTICE_LIKES_REQUIRED = 400`: checked against the authenticated sender for notices.
- `ROOM_MIC_LIKES_REQUIRED = 400`: checked against the authenticated speaker before a room mic is raised. The browser checks before requesting microphone access, and the server independently enforces the same rule. The former per-room `micLikesRequired` setting (default 30) was removed from room creation, room updates, and persisted room records.
- `PRIVATE_MEDIA_LIKES_REQUIRED = 500`: checked against the authenticated sender for private image/video/audio uploads and when initiating private voice/video calls.

### Sender and recipient separation
- Private media upload authorization checks only the sender. The recipient's likes are not read.
- `call-offer` authorizes only the caller; it does not inspect the recipient's likes. `call-answer` permits a zero-like recipient to answer and revalidates the original caller's eligibility.
- Ordinary public and private text messages remain independent of likes.

### Exemptions and obsolete bypass removal
- The site owner and accounts with the complete `admin-full` permission set (all current permission keys except the separately optional `health_view`) bypass the likes thresholds.
- Partial moderators are not exempt. Removed the legacy `staff_notice`, `staff_media`, and `voice_mic_override` capabilities that previously bypassed these gates. Old saved references to those keys are filtered from account permission sets on startup.
- The browser uses the explicit `fullAdmin` session flag for private media and call initiation; generic panel access is not treated as full-admin status.

### Verification scope
- Added regression checks for the 0/400/500 likes matrix, owner/full-admin exemptions, partial moderator restrictions, fixed voice-room mic threshold, sender-only media/call authorization, and retired permission keys.
- `index.html` and `public/index.html` must remain byte-identical.
- Automated checks do not replace a live two-account browser test on the deployed host.
