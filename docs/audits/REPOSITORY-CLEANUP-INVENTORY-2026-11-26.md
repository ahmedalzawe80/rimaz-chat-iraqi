# Rimaz repository cleanup inventory — 2026-11-26

## Scope and method

Read-only inventory of the tracked Git tree on PR #3's working branch. The review classified repository paths, compared Git blob identities for exact duplicates, inspected root/build configuration and documentation navigation, and checked how the browser entry references public media paths.

- Repository: `ahmedalzawe80/rimaz-chat-iraqi`
- Branch: `fix/bound-private-media-ticket-cache`
- Reviewed tree before this report: `f70a3bb4dea3d89f001caa94e7e5a07269401196`
- Tracked files: 403
- Public assets/files: 360
- Documentation files: 12
- Server library modules: 8
- Smoke-test scripts: 1

This was a Git-tree and source-reference review. It did not inspect or modify the live Deplexo volume, production uploads, or user database. Binary image content was not decoded or visually reviewed in this inventory.

## Findings

### 1. Root-level files

The root is not an unstructured dump. Its files have identifiable build/runtime, verification, repository-policy, or historical roles:

- `server.js`, `index.html`, `package.json`, `package-lock.json`, `Dockerfile`, `.nvmrc`, and `verify.js` are active application/build/test entry points.
- `CHANGELOG.md` is a long historical change record, not a second application copy.
- `data.json` is a 138-byte tracked warning placeholder. It is not the live database and must never replace persistent production data.
- **Historical at the 2026-11-26 inventory point:** `rimaz-final-deep-audit-46.93.72.zip` was a 16 MB tracked workflow input/output. This finding was superseded on 2026-11-27: the ZIP was removed from the candidate tree and is now generated in runner temporary storage as a 30-day GitHub Actions artifact only on explicit dispatch. It is not a tracked repository file.
- `google1a84d9d1dec7b85d.html` is the root domain-verification endpoint and has a matching public copy.
- Root `index.html` has an exact matching `public/index.html` fallback copy, and the regression suite checks their parity.

No root file was proven safe to delete or relocate in the original 2026-11-26 snapshot. The later 2026-11-27 release-artifact migration removed only the generated root ZIP after replacing its workflow consumers; see the current-tree refresh below.

### 2. Exact duplicate blobs

Five exact-content duplicate groups were found:

| Paths | Classification | Decision |
|---|---|---|
| `index.html` and `public/index.html` | Root entry and public fallback; parity is tested | Keep both |
| `google1a84d9d1dec7b85d.html` and `public/google1a84d9d1dec7b85d.html` | Domain verification at two served paths | Keep both |
| `public/gifts/hadia-080.png` and `public/gifts/hadia-100.png` | Two catalog filenames with identical bytes | Keep both pending persistent-reference/catalogue audit |
| `public/smileys/smiley-018.gif` and `public/smileys/smiley-019.gif` | Two catalog filenames with identical bytes | Keep both pending persistent-reference/catalogue audit |
| `public/smileys/smiley-027.gif` and `public/smileys/smiley-151.gif` | Two catalog filenames with identical bytes | Keep both pending persistent-reference/catalogue audit |

Byte equality does not prove semantic interchangeability. Gift and smiley filenames can be referenced by browser catalogues, user profiles, saved messages, or persistent data. Removing one filename could break an existing reference even if another file has identical bytes.

### 3. Public asset inventory

The public tree contains 360 files, including 115 gift assets, 238 smileys, one VIP badge asset, and other site assets such as the avatar, hero image, robots file, sitemap, and verification page.

The browser source references the `/smileys/` and `/vip-gifts/vip-special.gif` paths and renders image paths carried by profile/chat data. The public assets are not disposable build output. No media file is approved for deletion by this review.

### 4. Historical documentation

The dated audit and checkpoint files are records of earlier reviews, not competing runtime copies:

- `docs/audits/CODE-AUDIT.md` identifies its older v46.93.37 scope.
- `docs/audits/FINAL-DEEP-AUDIT.md` identifies its v46.93.72 source-package scope.
- The 2026-11-24 follow-up, runtime-resource, and transaction-safety audits retain dated evidence and limits.
- `docs/project/CHECKPOINT-2026-11-25.md` is a prior checkpoint; the 2026-11-26 checkpoint is the newer continuity record.
- `docs/operations/DEPLOYMENT-46.93.72.md` is a package-specific historical deployment reference, not production authorization.
- `docs/operations/FINAL-RELEASE-GATE.md` is explicitly labelled as a historical snapshot and points to the current checkpoint.

Retain these records. Their navigation and historical status should be made explicit rather than deleting audit evidence.

### 5. Previously reported nested duplicate

The old nested `rimaz-chat-iraqi-main/` directory is absent from the reviewed tree. No second nested application root was found among the 403 tracked files.

## Cleanup decision

**No deletion or relocation is approved from this inventory.** The exact duplicates are either intentional synchronized copies or distinct public filenames whose references have not been proven obsolete. At the original inventory date the root ZIP was workflow-critical. That conclusion was superseded by the 2026-11-27 artifact-only workflow migration. The remaining old reports are historical evidence.

The next safe cleanup step is a reference-aware media/catalogue audit against the application’s gift/smiley catalogue logic and a separately obtained, protected copy of persistent data. That check must not modify the live volume. Only after all persisted references and runtime paths are accounted for can a media duplicate be considered removable.

## Validation boundary

The successful CI run on `f70a3bb4dea3d89f001caa94e7e5a07269401196` completed both the application validation job and the release-archive refresh job. This validates the isolated candidate and generated archive only. It does not prove Deplexo production memory behavior, live data integrity, or staging restore correctness.


## Follow-up: catalogue and persisted-reference safety

A source-level follow-up checked the exact catalogue construction and migration logic in `server.js`:

- Built-in smiley entries are generated from every matching filename in `public/smileys/`, sorted by filename, then assigned sequential persistent IDs `rimaz-art-001...`. The startup migration rebuilds `db.customSmileys` when the seed version is older than 9 **or when the current catalogue length differs from the expected built-in-plus-mobile count**. Removing even one apparently duplicate smiley changes that expected count and can cause startup to replace the saved custom smiley catalogue. This is a concrete reason not to remove any smiley asset based on byte equality.
- Built-in gifts are generated from the sorted filenames in `public/gifts/` and assigned sequential IDs `gift-pack-001...`. Deleting a file changes the generated sequence on a fresh/legacy catalogue seed. On an already-seeded persistent database, the stored catalogue may still point at the removed filename. Either outcome can break gift selection/history or existing profile references.
- The standard gift seed is persisted in `db.giftCatalog`; VIP gifts are separately seeded to `/vip-gifts/vip-special.gif`. Profile gift records retain gift metadata, and the browser renders saved `giftImage` paths. Thus matching bytes under two names are not proof that either name is redundant.
- Built-in smiley paths are stored in `db.customSmileys`, and chat messages render saved smiley IDs/tokens from that catalogue. The filenames are therefore part of the data compatibility surface, not just static files.

**Result:** the five duplicate blob groups remain intentionally untouched. Any future deduplication requires a designed, versioned migration that preserves catalogue IDs and rewrites/retains all stored references, plus a verified copy of persistent data and restore test. A plain file deletion or rename is not safe.



## Follow-up: uploaded smiley backup coverage — 2026-11-26

The reference-aware backup review confirmed that uploaded custom smiley artwork is persisted in `db.customSmileys[].icon` as `/uploads/...`. The backup media collector intentionally treats `icon` as a structured media-reference field, so these files must be included just like profile avatars, gift images, and rank artwork. The regression fixture now creates an uploaded-smiley file and asserts that the backup snapshot includes it, while continuing to exclude unreferenced uploads and ordinary chat text. This is a test-coverage improvement only; it does not alter catalogue IDs, saved member data, runtime UI, or media files.


## Follow-up: voice-room request idempotency — 2026-11-27

The server-side voice-room microphone request handler and integration smoke test were reviewed together. Repeated requests to raise an already-raised microphone on the same seat now return the current grant without rewriting speaker state or rebroadcasting the room state. Repeated lower requests from a non-speaker return the acknowledgement without an unnecessary room-wide state broadcast; an actual lower request still releases the seat and broadcasts the updated state. Existing membership, permission, seat-range, occupied-seat, and speaker-limit checks remain active. The integration smoke test covers duplicate raise/lower behavior and synchronizes its listeners before the expected events to avoid test-order races. Final CI run [#45899789210](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45899789210) passed both validation and exact release-archive refresh jobs. This is a source/CI result only; no live production session or Deplexo volume was modified.


## Current-tree refresh — 2026-11-27 (latest verified state)

The original counts above describe the 2026-11-26 tree only. The latest verified PR #3 candidate tree is:

- Exact source head before this documentation refresh: `accd5e8d67b89ba0e5dfcd282f90ec70c951c411`.
- Recursive tree: **413 total entries = 401 tracked file blobs + 12 directory entries**, not truncated.
- Root: **16 tracked files** and five directories; documentation: **17 Markdown files**; public assets: **360 files**.
- Exactly one workflow remains under `.github/workflows/`: `validate-project.yml`. No root ZIP, nested `rimaz-chat-iraqi-main/` copy, symlink, or database dump is tracked.
- All 17 Markdown files were rechecked for relative local links: **zero broken links**. The repository tree diagram's escaped newline was corrected.
- [GitHub Actions run #45949927455](https://github.com/ahmedalzawe80/rimaz-chat-iraqi/actions/runs/45949927455) passed dependency installation/tree verification, JavaScript syntax, the full regression suite, production Docker build, and constrained HTTP/Socket.IO smoke. The artifact job was skipped as expected on an ordinary push.
- The release ZIP is now generated in temporary runner storage and uploaded as a 30-day artifact only on explicit `workflow_dispatch`. Its first real upload remains pending until the updated workflow is present on the default branch; the embedded archive scripts have only been syntax-checked and fixture-tested so far.

This refresh does not change the media cleanup decision: no gift, smiley, VIP, or other public media file is approved for deletion based on byte equality alone. Production data and the Deplexo volume were not accessed.
