## v46.93.30 — Credential safety and dead-code cleanup

- Removed plaintext password persistence in browser `localStorage`. The legacy `rimaz_saved_password` key is cleared on page load and after successful login.
- Kept username remembering and delegated password autofill/save prompts to the browser password manager with standard autocomplete semantics.
- Preserved the existing password policy and all current account records.
- Removed 14 client functions and two server helpers with no call sites or source references.
- Added `.gitignore` and `.dockerignore` rules to reduce accidental inclusion of credentials, runtime data, private uploads, local tooling, and archives.
- Kept both HTML entry files because the server uses the public copy as a fallback; retained all referenced image/catalogue and verification assets.
- `node --check server.js`, `node --check verify.js`, and `node verify.js` pass (360 checks). Live browser/hosting verification remains required.
- No user database, account, upload, room, or permission data was modified.

## v46.93.29 — Final source and package hygiene audit

- Confirmed `index.html` and `public/index.html` remain byte-identical; both are retained because the server uses the root file first and the public copy as a deployment fallback.
- Removed the unused root-level `rimaz-hero.jpg` duplicate. The served image remains `public/rimaz-hero.jpg`, exposed at `/rimaz-hero.jpg` by the public static middleware.
- Removed the invalid `/public/rimaz-hero.jpg` browser fallback; `/public` is the filesystem directory, not part of the public URL namespace.
- Retained packed smiley/gift catalogues, Google verification file, default avatar, crawler files, and regression suite because the active server, client, or deployment fallback references them.
- Corrected the current room-microphone threshold documentation to 30 likes. Notices remain 400; private media and call initiation remain 500.
- Updated package version and regression assertions. No authorization, persistence, chat, room, call, or UI feature logic was intentionally changed.
- `npm test` and JavaScript syntax checks must pass after this audit. Live deployment and two-account/browser verification remain outside the local archive test scope.

## v46.93.26 — Profile color picker and alignment root-cause audit

- The previous palette was nested inside `.svalue`, which is a block/flex child rather than the `.colorField` grid. Its `grid-column:1/-1` therefore had no effect, and the click handler was attached to a native `input[type=color]`, allowing the browser picker to appear too.
- The profile settings now retain the saved color inputs as hidden values and use a visible button swatch as the sole trigger. The palette is a direct grid child of the color row, with 105 selectable colors.
- The selection handler updates the hidden input and visible swatch, dispatches the existing input/change events, and keeps the existing `saveSettings()` payload/API unchanged.
- Removed the previous appended compact-profile CSS override block. One canonical profile-settings rule set now defines left-aligned decoration/status labels and inputs, and the palette grid structure.
- Admin color controls and unrelated buttons/settings remain unchanged.
- `index.html` and `public/index.html` are synchronized.

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
- `ROOM_MIC_LIKES_REQUIRED = 30`: checked against the authenticated speaker before a room mic is raised. The browser checks before requesting microphone access, and the server independently enforces the same 30-like rule. The former per-room `micLikesRequired` setting (default 30) was removed from room creation, room updates, and persisted room records.
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


## v46.93.27 focused audit
- Profile-setting label text alignment is changed at the canonical label rules only; dark backgrounds and layout geometry are preserved.
- The settings save button uses the established `--green` theme value (`#58bf61`) and retains its original save action.
- Success-toast suppression is presentation-only: the shared toast node and error/actionable toast path remain; server/API operations are unchanged.
- Protected-owner attempt alerts are generated server-side from `req.user`, persisted through the existing notifications store, emitted to the resolved owner account in real time, and surfaced once after a later login if the owner was offline. The blocked request still returns 403 and does not mutate the owner's profile or moderation state.
- Owner protection checks run before the general higher-rank rejection on covered routes so a valid authorized attempt is recorded rather than silently rejected by the hierarchy guard.
- Automated regression checks cover the new paths. Live two-account verification is still required to validate delivery on the deployed host.


## v46.93.28 — SEO output and crawler endpoints
- The saved `siteSettings.tagline` is rendered into the raw homepage HTML on every request: description, Open Graph, Twitter and WebSite JSON-LD.
- `PUBLIC_SITE_URL` is the single canonical origin for canonical, Open Graph URL/images, JSON-LD URL, robots sitemap declaration and sitemap location. It defaults to the current Deplexo deployment hostname; custom domains must be explicitly configured with this environment variable.
- `/robots.txt` and `/sitemap.xml` are generated by the server before static middleware, preventing stale static copies from diverging. Only API, Socket.IO and private-media paths are disallowed; the public homepage and `/uploads/` remain crawlable.
- Google independently selects search snippets and indexing timing; metadata correctness does not guarantee that Google displays the exact description text.
