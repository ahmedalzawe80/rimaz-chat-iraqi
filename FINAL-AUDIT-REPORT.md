# Rimaz Chat — Final archive audit (v46.93.32)

## v46.93.32 — Banner permissions and login confirmation

- Split the former personal-banner capability into `personal_banner` and `chat_banners_manage`. Existing `banner_upload` permission values migrate to `personal_banner`; only previously full-access administrators receive both new capabilities through the bounded one-time migration.
- Personal banner endpoints remain self-only: a member can upload or delete only their own profile banner.
- Added a separate seven-rank chat-banner manager with per-rank preview, upload/replacement, optional label, and deletion. All routes validate the selected built-in rank and enforce `chat_banners_manage` on the server.
- Rank banners appear for members carrying that rank unless their own personal banner takes precedence. Updates are broadcast live to connected clients.
- Login uses browser-managed username/password autofill but the login action is now a dedicated button click, not a form auto-submit.
- Local regression suite: 365 checks passed. JavaScript syntax and both entry-page equality checks passed. Live hosting/browser behavior still requires deployment testing.

## Scope and method

This audit examined the supplied ZIP archive, Node.js server, browser entry pages, packed image catalogues, deployment files, project documentation, and regression suite. It included JavaScript syntax checks, static reference scans, duplicate-entry comparison, asset/catalogue validation, and a full run of `node verify.js`.

## Changes in v46.93.30

1. Removed plaintext password persistence. The browser page no longer reads or writes `rimaz_saved_password`; it clears that legacy key on startup and after successful sign-in.
2. Preserved remembered usernames. The password field is no longer populated from site storage and retains `autocomplete="current-password"`, allowing supported browser password managers to offer secure autofill and save prompts.
3. Preserved the existing password-length policy. No existing account, password hash, or login credential on the server was modified.
4. Removed 14 browser functions and two server helpers that had no call sites or references in the shipped source. The regression suite and syntax checks pass after removal.
5. Added `.gitignore` and `.dockerignore` rules for local runtime data, private uploads, credentials, developer files, and archives. The repository's `data.json` remains a placeholder and is excluded from Docker build context.
6. Kept `index.html` and `public/index.html`: they are byte-identical and the server explicitly chooses the root file first and the public copy as a fallback.
7. Kept packed smiley/gift catalogues, default avatar, Google verification file, and public crawler assets because the application or deployment compatibility path references them.

## Confirmed authorization thresholds

- Notices: 400 likes.
- Voice-room microphone: 30 likes.
- Private media and initiating private calls: 500 likes.
- Owner and full-permission administrator exemptions are enforced by current server logic.

## Dead-code removal details and conservative retention

The 14 removed browser declarations were `adminShowGiftRemoval`, `grantLikeFromProfile`, `chooseRank`, `giftEntryFromText`, `deleteGrantedGiftFromPicker`, `addGiftFromPicker`, `renderGiftCatalogRemovalList`, `openShortcuts`, `applyClassicRank`, `chooseRankFromProfile`, `openProfile`, `refreshRankPermissionEditor`, `addGiftToCatalog`, and `notifyCount`. The two removed server helpers were `safeMessage` and `globalIpBanned`. Static reference scans found no call sites or other source references for these declarations.

Repeated CSS selectors and visually similar template fragments were not bulk-deleted. In this project, many repeated rules are deliberate responsive or targeted overrides; removing them without screenshot-based browser regression tests could change the layout. Likewise, both entry HTML files remain because the server uses one as a fallback for the other.

## Verification results

- `node --check server.js`: passed.
- `node --check verify.js`: passed.
- `node verify.js`: passed, 360 checks, zero failures.
- Inline browser JavaScript blocks: syntax checks passed.
- Browser entry files: byte-identical.
- Packed image catalogues and JSON assets: validated by the included regression suite.
- Static function-reference scan: no remaining named function declarations with only a declaration reference in `server.js` or the browser page.

## Files and data safety

The archive's `data.json` contains only an initial placeholder notice. The live persistent database is not part of this archive and must never be replaced with this placeholder. `.dockerignore` excludes the placeholder from the image build context; the server continues to use its persistent data mount when configured.

## Explicit limitations

The archive does not include installed `node_modules`. The execution environment has no package-registry access, so a `package-lock.json` could not be generated or dependency installation performed. The server was syntax-checked and the project's static/archive regression suite passed, but the HTTP/Socket.IO server was not booted with its production dependencies. Browser password-manager prompts, authenticated multi-account flows, and live WebRTC/media behavior require testing in a real browser and on the target host.

The previous v46.93.29 audit details remain in `CHANGELOG.md`. This cleanup did not alter account records, password hashes, database files, user uploads, private media, room data, or authorization policy.
