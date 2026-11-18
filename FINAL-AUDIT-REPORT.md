# Rimaz Chat — Final archive audit (v46.93.29)

## Scope and method

This audit examined the supplied ZIP archive, the Node.js server, the browser entry page, the packed image catalogues, deployment files, project documentation, and the included regression suite. It included JavaScript syntax checks, JSON parsing/asset validation through the project tests, duplicate/reference checks, and a full run of `npm test`.

## Changes made

1. Removed the root-level `rimaz-hero.jpg` duplicate. The actual static asset is `public/rimaz-hero.jpg`, which Express serves at `/rimaz-hero.jpg`.
2. Removed the invalid browser fallback URL `/public/rimaz-hero.jpg`. `/public` is the server's filesystem directory, not part of the public URL path.
3. Kept `index.html` and `public/index.html`: they are byte-identical and the server explicitly chooses the root file first and the public copy as a fallback. The regression suite also checks this invariant.
4. Kept the packed smiley, standard-gift, and VIP-gift catalogues: the server loads and serves these assets. Their large sizes are image payloads, not unused code.
5. Kept `public/google1a84d9d1dec7b85d.html`, `public/robots.txt`, and `public/sitemap.xml` as deployment/verification compatibility files. The server currently generates robots and sitemap responses dynamically before static middleware.
6. Kept `verify.js`; it is the project's automated regression suite, not runtime application code.
7. Updated the package version to `46.93.29`, synchronized the README/audit notes, and corrected the current room-microphone threshold documentation.

## Confirmed current authorization thresholds

- Notices: 400 likes.
- Voice-room microphone: 30 likes.
- Private media and initiating private calls: 500 likes.
- Owner and full-permission administrator exemptions are enforced by the current server logic.

The older v46.93.21 historical changelog describes the 400-like microphone rule that was present at that point in history. The current server, client, and regression tests agree on 30 likes; the current audit documentation now states 30.

## Findings retained rather than destructively removed

- The HTML source contains many repeated CSS selectors across multiple style blocks. These are cascading overrides accumulated through responsive and targeted UI fixes. A selector appearing more than once does not prove it is dead or conflicting; removing those layers without browser visual regression tests risks changing mobile layouts and profile/chat surfaces.
- A text-level scan finds repeated IDs inside client-side template strings and alternate UI fragments. This does not prove that duplicate IDs coexist in the live DOM. They were not renamed without tracing every template and event binding.
- The source-level declaration scan found no repeated named function declarations in `server.js` or the browser page. Two arrow-function declarations named `tick` occur in separate scopes; they are not evidence of a global collision.
- No TODO/FIXME/XXX markers, debugger statements, or server-side `eval`/`new Function` execution were found. The test harness itself uses `new Function` for isolated test fixtures; that is test-only code.
- `public/robots.txt` and `public/sitemap.xml` are shadowed by dynamic server routes in the current Express ordering, but retained as compatibility/deployment artifacts rather than assuming every hosting path uses the Node server.

## Verification results

- `node --check server.js`: passed.
- `node --check verify.js`: passed.
- `npm test`: passed, 359 successful checks, zero reported failures.
- Browser entry files: byte-identical.
- Packed smiley/gift catalogues: validated by the included regression suite.
- JSON catalogues: parse successfully.

## Explicit limitations

The archive does not include installed `node_modules`, and the local environment has no installed Express, Socket.IO, bcryptjs, or Multer packages. Therefore this audit did not boot the actual HTTP/Socket.IO server, execute authenticated browser sessions, or perform a live two-account WebRTC/media test. It also did not connect to the deployed Deplexo instance. Those checks require installing the declared dependencies and testing on the target host with test accounts.

This is a conservative cleanup: only the clearly unused duplicate hero file and its invalid fallback were removed. No database, user uploads, private media, permissions, chat features, or account data were altered.
