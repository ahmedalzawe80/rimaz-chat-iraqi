# Rimaz Chat v46.93.60 — conservative CSS deduplication

## Changes
- Removed exact duplicate top-level CSS rules only; no declaration values or responsive/media-query rules were changed.
- Kept the first occurrence of each exact rule to preserve the cascade.
- Preserved the three requested UI behaviors: flag left of member number, search anchored left, typing dots aligned right.
- Synchronized `index.html` and `public/index.html`.

## Safety boundary
This is a conservative second cleanup phase, not a full rewrite of every historical CSS selector. Rules with different declarations or responsive scopes were deliberately retained rather than risk visual regressions.

## Verification
Run `node --check server.js`, `node --check verify.js`, `node verify.js`, CSS parsing, HTML entry-point equality, and ZIP integrity. Real browser testing on desktop/mobile and two accounts remains required before production deployment.
