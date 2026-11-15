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


## v46.93.20 — Root-cause audit

### Composer alignment
- The three active editable composer nodes are `#msgInput`, `#privateText`, and `#wallText`.
- All three use the shared `.composerRichInput` class. Its original canonical declaration set `text-align:right` and `direction:rtl`, which controlled both typed text and the `:empty::before` placeholder.
- Replaced those declarations in the original rule with `text-align:left` and `direction:ltr`; did not add a later CSS override. Other inputs do not use this shared class and were not changed.

### Likes authorization
- `/api/notify` is the server authority for member-to-member notices. The 400-like check now evaluates only the authenticated sender. `staff_notice` alone no longer bypasses it.
- `/api/media` is the server authority for private attachments. The 500-like check now evaluates only the authenticated sender. `staff_media` alone no longer bypasses it.
- A dedicated full-admin predicate checks the complete current permission set (the same set granted to `admin-full`, excluding the separate `health_view` capability). Site owner is exempt. A partial role with `panel_access` is not automatically considered full-admin.
- The private-media client gate now consumes the explicit `fullAdmin` session flag instead of generic `admin`/panel access.
- Public and private text-message handlers were left outside the likes checks. Recipient likes are not part of notice or private-media authorization.

### Scope and verification
- Root `index.html` and `public/index.html` remain identical.
- Only the composer alignment rule, notification/private-media authorization, corresponding client gate/session metadata, version metadata, and regression documentation/tests were changed.
- Static and regression verification must be run with `npm test`; live deployment behavior still requires a real hosted-session test.
