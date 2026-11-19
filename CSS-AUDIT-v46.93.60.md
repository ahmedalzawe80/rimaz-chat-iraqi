# CSS audit — v46.93.60

## Phase 2 changes
- Removed **21** exact duplicate top-level CSS rule occurrences across **12** selector groups.
- A rule was considered safe to remove only when its selector and every declaration (name, value, order, and `!important` flag) exactly matched an earlier top-level rule.
- First occurrence and original cascade order were retained.
- No media-query rules, differing declarations, component-specific overrides, or unrelated `!important` declarations were removed.

## Remaining work (intentionally retained)
- Historical selectors with different declarations remain for a separate component-by-component audit.
- Responsive rules and overrides require viewport-specific visual regression before any removal.
- This phase is conservative deduplication, not a claim that all application CSS has been normalized.

## Verification boundary
- Top-level rule count before/after: 1220 → 1199.
- Stylesheet blocks: one consolidated source; root and public HTML files are byte-identical.
- Static checks do not prove visual correctness on every device. Desktop/mobile browser testing and a two-account typing test remain necessary.
