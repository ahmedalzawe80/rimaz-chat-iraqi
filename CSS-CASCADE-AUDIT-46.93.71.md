# Rimaz CSS cascade audit — 46.93.71

## Scope and method
A lightweight source scan of inline `<style id=...>` blocks with names containing profile/member/identity. It compares repeated selector/property declarations across those blocks. It is a triage scan, not a full CSS parser; nested media rules and selector lists need browser-level validation before any consolidation.

## Confirmed overlapping declarations
- `#layer .profileOverlay` has repeated width, right-offset, and max-width declarations across `rimaz-profile-admin-reference-precision-v7`, `rimaz-member-layout-single-source-v46937`, and `rimaz-profile-size-and-gift-fix`. Values differ (`84%` vs `84vw`, `8%` vs `8vw`, and `360px` vs `600px`), so final behavior depends on cascade order/specificity and media context.
- `.member` layout is declared in `rimaz-all-members-unified-request`, `rimaz-unified-member-layout-v1`, and `rimaz-member-avatar-rank-name-spacing-final-v1`; grid columns and gaps differ. The unified layout block also contains mobile media overrides.
- `.member > img` dimensions are set both directly to `54px` and through a CSS variable; align-self differs (`center` vs `start`).
- `.member .memberBadge` has competing size and grid-column declarations, and `.member .memberMain` placement differs between older and unified blocks.

## Important caution
These overlaps are evidence of cascade complexity, not proof that each declaration is wrong. Some rules are deliberate responsive/context overrides. A root cleanup must map each selector to its active DOM contexts (online-member rows, private contacts, profile, public messages, wall, room presence), preserve responsive behavior, and compare computed styles at desktop and mobile widths before removing or merging declarations.

## Next safe review steps
1. Map `.member` DOM variants and contexts in the rendering functions.
2. Build a minimal browser fixture from the real markup and current stylesheet, not a hand-authored approximation.
3. Record computed styles at representative widths and roles.
4. Consolidate the member-row rules into a canonical base plus explicit context/responsive modifiers, only after visual parity is established.
5. Apply the same dependency mapping to the profile overlay and its room badge/admin-action grid.

No CSS was deleted or rewritten as part of this audit because browser-level parity has not yet been established.
