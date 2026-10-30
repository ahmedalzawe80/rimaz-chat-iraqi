# Rimaz Chat – v29 smiley gallery rebuild

## What changed
- Replaced the previous cropped sprite fragments with 72 individually drawn, complete SVG smiley illustrations in `public/classic-smileys-v3/`.
- Added a one-time startup migration (`smileysSeedVersion: 3`) that replaces the old smiley records only. Existing chat text shortcuts and all other `data.json` content are preserved.
- Admin > السميلات shows one grid. Each tile has its own shortcut field and save button; clear the field and save to remove a shortcut.
- The chat smiley picker uses the same database list for public chat, private messages, and wall posts.
- Smiley shortcut tokens render as their corresponding image in public, private, and wall messages.

## Deployment
Replace application files with this package. Keep your live `data.json` and `uploads/` directory. On first startup after deployment, the server migrates only `customSmileys` to the 72 new gallery entries and saves `smileysSeedVersion: 3`; all other database fields are retained.

## Validation
`node --check server.js` and the inline browser JavaScript syntax check pass. SVG gallery contains 72 independent files. Runtime integration should be verified on the target server after deployment.


## الإصدار 32: معرض مضمّن
تم تضمين 72 صورة SVG داخل server.js كبيانات مضمّنة؛ لا يلزم رفع مجلد صور منفصل. عند بدء التشغيل تُزرع القائمة في قاعدة البيانات عند الحاجة. احتفظ بقاعدة بيانات الاستضافة الحالية ومجلد uploads ولا تستبدلهما بملفات تجريبية.


## Smiley gallery reliability fix (v32.1)
The admin data endpoint and chat-tools endpoint now both call `ensureSmileysGallery()`. If the saved gallery is empty, the server rebuilds the 72 embedded SVG data-URI entries and attempts to persist them. Existing non-empty custom smiley galleries and their shortcuts are preserved. The images are embedded in `server.js`; no separate image folder is required.
