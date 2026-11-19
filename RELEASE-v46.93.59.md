# Rimaz Chat v46.93.59 — stylesheet structure cleanup

## Changes
- Repaired three malformed nested `<style>` openings and one redundant closing tag in the source HTML.
- Consolidated all 83 valid stylesheet source blocks into one ordered stylesheet block (`rimaz-styles-v1`), retaining the original cascade order and declarations.
- Preserved source-block labels as comments for auditability.
- Preserved the scoped canonical layout for online members, the left-anchored member search, and the right-aligned private typing indicator.
- Kept the root and public browser entry files byte-identical.

## Scope and limitations
This removes the accumulation of separate style blocks and repairs malformed style markup. It does not claim every historical duplicate selector or `!important` declaration across unrelated app surfaces has been eliminated. Those declarations are retained where removing them without complete visual regression coverage could change existing screens. The three requested components have their earlier standalone definitions removed and are scoped to their relevant overlays.

## Verification
Server/client syntax and the full local regression suite pass. CSS parsing and ZIP integrity checks pass. Real two-account testing on deployed desktop and mobile browsers remains required.
