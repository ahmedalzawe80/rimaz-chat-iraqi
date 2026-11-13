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
