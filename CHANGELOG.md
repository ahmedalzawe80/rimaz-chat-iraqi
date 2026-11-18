# Changelog — v46.93.49

- Rebuilt wall and private media preview hydration around one authenticated fetch helper using the active `x-session` token.
- Wall previews no longer assign the raw media URL directly to image/video elements; previews are created from fetched Blob URLs.
- Preserved the original explicit “عرض الصورة” and “عرض الفيديو” buttons. The full-screen viewer is invoked only by those buttons.
- Video previews remain muted, metadata-only, and without autoplay or native controls; playback starts only in the explicit viewer after the user opens it.
- Removed verbose “جاري تحميل الوسائط” text; the UI uses a compact transient loading indicator and a concise failure state.
- Increased inline media preview dimensions for phone screens.
- Added Blob URL cleanup when leaving private or wall views.
- No public media upload/send capability was added. Existing public text composer behavior is unchanged.

Validation: `npm test` passed all local static/runtime-fixture checks; inline browser JavaScript syntax checked; public and root HTML files are byte-identical; ZIP integrity checked. Live Deplexo/mobile verification remains outstanding.
