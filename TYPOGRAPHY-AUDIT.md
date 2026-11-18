# Typography refactor audit — v46.93.42

## Contract
- Member display names: **15px**.
- Chat, private-message, wall, presence, announcement and ad body text: **14px**.

## Scope
The refactor consolidates semantic display-name and chat-body typography across public messages, online-member rows, join/leave notices, private contacts, private conversation messages, the private conversation header, wall posts, welcome notices, temporary announcements, permanent administrative announcements, incoming notices/call identity, and public campaign-ad cards.

## Structural changes
- Removed the previous v1 typography override block.
- Parsed each embedded stylesheet and removed legacy font-size/font-weight/line-height declarations only from selectors whose rightmost target is a semantic chat name/body node.
- Preserved unrelated typography for buttons, controls, room titles, admin tools, emoji/gift artwork and profile metadata.
- Added semantic classes to dynamically generated wall text, notices, incoming-call identity/status and campaign-ad title/meta.
- Removed the inline presence-text font-weight override.
- Kept `index.html` and `public/index.html` byte-identical.

## Automated validation
- Audited 79 existing embedded stylesheets and 1,561 CSS rules before adding the canonical stylesheet.
- Removed 28 legacy font-size/font-weight/line-height declarations from 17 targeted selectors across 14 rules.
- Re-parsed the final 80 stylesheets: zero CSS parse errors.
- Re-ran the selector-aware audit after the refactor: **zero remaining legacy typography declarations** on the semantic chat-name/body targets outside the single canonical block.
The package test suite is run after this audit. Static checks confirm a single canonical token block and verify every listed surface. Live rendering against the deployed service is not part of local ZIP validation and must be checked after deployment.
