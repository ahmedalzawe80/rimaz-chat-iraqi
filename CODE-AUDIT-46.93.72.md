# Rimaz v46.93.72 — HTML/CSS boundary integrity

## Root issue found
Two inline style blocks were unintentionally nested because their preceding style elements lacked closing tags. The browser therefore treated the following `<style id=...>` start tags as text inside the prior CSS raw-text elements, and the named blocks were not independently represented in the DOM.

## Root correction
- Added the missing style boundaries before `rimaz-latest-fixes` and `rimaz-exact-two-layout-fixes`.
- Preserved CSS declaration text and source order; the change repairs block parsing rather than adding overrides.
- Synced root and public HTML entry files.

## Verification
- Source `<style>` openings and closings: 82 / 82.
- Parsed style elements: 82; all source style IDs recognized.
- CSS parsed with tinycss2: 1,297 rules, 0 parse errors.
- `npm test`: all local static and archive checks passed.
- Browser live rendering could not be run in this environment; deployment and mobile visual parity still require post-deploy validation.

## Release metadata consistency
- Package version is 46.93.72.
- Verification assertions were updated to require 46.93.72.
- Root and public entry files are byte-identical.
