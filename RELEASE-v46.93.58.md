# Rimaz Chat v46.93.58 — targeted CSS consolidation

## What changed
- Consolidated online-member row layout, member search placement, and private typing indicator styles into one final component stylesheet.
- Removed the earlier duplicate/one-off definitions for those three components from the base stylesheet and prior member-layout override.
- Scoped the rules to the relevant overlays so generic `.member` styles cannot accidentally define the online-member grid.
- Preserved the requested layout dimensions: 38px search field, desktop/mobile member row sizing, flag left of member number, and right-aligned three-dot private typing indicator.
- Preserved reduced-motion support for the typing animation.
- Kept `index.html` and `public/index.html` byte-identical.

## Scope and limits
This is a focused cleanup of the three requested UI components, not a claim that every legacy stylesheet across the entire application has been fully refactored. Other unrelated visual systems were left untouched to avoid regressions.

## Verification
Run `node --check server.js`, `node --check verify.js`, and `node verify.js`. Live two-account testing on desktop and mobile is still required after deployment.
