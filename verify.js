'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const failures = [];
const pass = (label) => console.log(`✓ ${label}`);
const fail = (label, detail) => { failures.push(label); console.error(`✗ ${label}${detail ? `: ${detail}` : ''}`); };

const server = path.join(root, 'server.js');
const serverCheck = spawnSync(process.execPath, ['--check', server], { encoding: 'utf8' });
if (serverCheck.status === 0) pass('server.js syntax');
else fail('server.js syntax', serverCheck.stderr || serverCheck.stdout);

const mainPath = path.join(root, 'index.html');
const publicPath = path.join(root, 'public', 'index.html');
let html = '';
try {
  html = fs.readFileSync(mainPath, 'utf8');
  const publicHtml = fs.readFileSync(publicPath, 'utf8');
  if (html === publicHtml) pass('index.html and public/index.html are identical');
  else fail('index.html and public/index.html differ');
} catch (error) { fail('HTML files readable', error.message); }

// Ensure every supported text-send transport applies the server-side chat filter.
try {
  const source = fs.readFileSync(server, 'utf8');
  const httpRoute = source.match(/app\.post\('\/api\/message',[\s\S]*?\n\}\);/);
  const socketRoute = source.match(/socket\.on\('send-message',[\s\S]*?\n/);
  const privateRoute = source.match(/socket\.on\('private-message',[\s\S]*?\n/);
  if (httpRoute && httpRoute[0].includes('blockedChatTerm(text)') && httpRoute[0].includes('.slice(0,2000)')) pass('HTTP room messages enforce chat filter and 2000-character limit');
  else fail('HTTP room messages enforce chat filter');
  if (socketRoute && socketRoute[0].includes('blockedChatTerm(text)')) pass('Socket room messages enforce chat filter');
  else fail('Socket room messages enforce chat filter');
  if (privateRoute && privateRoute[0].includes('blockedChatTerm(text)')) pass('private messages enforce chat filter');
  else fail('private messages enforce chat filter');
} catch (error) { fail('chat filter route checks', error.message); }

// Upload hardening: whitelist client MIME values, derive safe stored extensions,
// apply smaller image limits, and clean files rejected by post-upload policy checks.
try {
  const source = fs.readFileSync(server, 'utf8');
  const checks = [
    ['upload extension is derived from safe MIME allow-list', source.includes('SAFE_UPLOAD_TYPES[file.mimetype]') && !source.includes("path.extname(file.originalname||'')")],
    ['general upload size is capped at 50 MB', source.includes('fileSize:50*1024*1024')],
    ['image upload size is capped at 8 MB', source.includes('fileSize:8*1024*1024')],
    ['image endpoints use image-only upload middleware', (source.match(/uploadImage\.single\('file'\)/g)||[]).length >= 3],
    ['rejected uploads are removed from disk', source.includes('function removeUploadedFile(file)') && source.includes('removeUploadedFile(req.file)')],
    ['upload errors return controlled JSON responses', source.includes('err instanceof multer.MulterError') && source.includes('status(415)')]
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
} catch (error) { fail('upload security checks', error.message); }

try {
  const source = fs.readFileSync(server, 'utf8');
  const wallLike = source.match(/app\.post\('\/api\/wall\/like',[\s\S]*?\n\}\);/);
  if (wallLike && wallLike[0].includes('p.likedBy.some') && wallLike[0].includes('p.likedBy.push') && wallLike[0].includes('liked:false')) pass('wall likes are unique per account and repeat requests are idempotent');
  else fail('wall likes are unique per account');
} catch (error) { fail('wall-like protection checks', error.message); }

if (html) {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map(match => match[1]).filter(source => source.trim());
  if (!scripts.length) fail('inline browser scripts found');
  else {
    let valid = true;
    scripts.forEach((source, index) => {
      try { new vm.Script(source, { filename: `index.html:inline-script-${index + 1}` }); }
      catch (error) { valid = false; fail(`inline browser script ${index + 1} syntax`, error.message); }
    });
    if (valid) pass(`${scripts.length} inline browser script(s) compile`);
  }
}

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.main === 'server.js' && pkg.scripts?.start === 'node server.js') pass('package entrypoint and start command');
  else fail('package entrypoint/start command');
  JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
  pass('data.json is valid JSON');
} catch (error) { fail('package/data JSON validation', error.message); }


// Persistence safety: atomic replacement and fail-closed handling of damaged JSON.
try {
  const source = fs.readFileSync(server, 'utf8');
  const saveFn = source.match(/function save\(\)\s*\{[\s\S]*?\n\}/);
  const loadBlock = source.match(/let db;[\s\S]*?\nfor \(const \[k,v\] of Object\.entries\(defaults\(\)\)/);
  if (saveFn && ['.tmp', "fs.openSync(tempFile, 'wx'", 'fs.fsyncSync(fd)', 'fs.renameSync(tempFile, DB_FILE)'].every(x => saveFn[0].includes(x))) pass('database writes use fsynced atomic replacement');
  else fail('database writes use fsynced atomic replacement');
  if (loadBlock && loadBlock[0].includes("error.code === 'ENOENT'") && loadBlock[0].includes('fs.copyFileSync(DB_FILE, recoveryCopy') && loadBlock[0].includes('Refusing to start with an invalid database')) pass('corrupt database is preserved and startup fails closed');
  else fail('corrupt database is preserved and startup fails closed');
} catch (error) { fail('persistence safety checks', error.message); }


// Execute the production save() implementation in an isolated temporary directory.
try {
  const source = fs.readFileSync(server, 'utf8');
  const saveFn = source.match(/function save\(\)\s*\{[\s\S]*?\n\}/);
  if (!saveFn) throw new Error('save() implementation not found');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rimaz-atomic-save-'));
  try {
    const context = { fs, crypto, DATA_DIR: tempDir, DB_FILE: path.join(tempDir, 'data.json'), db: { users: { test: { likes: 7 } }, messages: [] }, process: { pid: process.pid } };
    vm.createContext(context);
    vm.runInContext(`${saveFn[0]}\nglobalThis.performSave = save;`, context);
    context.performSave();
    const saved = JSON.parse(fs.readFileSync(context.DB_FILE, 'utf8'));
    const remaining = fs.readdirSync(tempDir);
    if (saved.users.test.likes === 7 && remaining.length === 1 && remaining[0] === 'data.json') pass('atomic save writes valid JSON and leaves no temporary files');
    else fail('atomic save writes valid JSON and leaves no temporary files');
  } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
} catch (error) { fail('atomic save runtime fixture', error.message); }

// Exercise the real uploaded-signature function against small byte fixtures.
try {
  const source = fs.readFileSync(server, 'utf8');
  const fn = source.match(/function uploadedSignatureMatches\(file, category='any'\)\s*\{[\s\S]*?\n\}/);
  if (!fn) throw new Error('signature function not found');
  const vmContext = { Buffer, fs: {
    openSync: () => 7,
    readSync: (_fd, target, offset, length) => { const count = Math.min(length, fixture.length); fixture.copy(target, offset, 0, count); return count; },
    closeSync: () => {}
  }};
  let fixture = Buffer.alloc(0);
  vm.createContext(vmContext);
  vm.runInContext(`${fn[0]}\nglobalThis.checkSignature = uploadedSignatureMatches;`, vmContext);
  const run = (bytes, mime, category='media') => { fixture = Buffer.from(bytes); return vmContext.checkSignature({path:'/virtual/upload',mimetype:mime},category); };
  const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const html = Buffer.from('<!doctype html><html>');
  const mp4 = Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]);
  const webm = Buffer.from([0x1a,0x45,0xdf,0xa3,0x93,0x42,0x86,0x81]);
  const ok = run(png,'image/png','image') && !run(html,'image/png','image') && run(mp4,'video/mp4') && run(webm,'video/webm') && !run(html,'video/mp4');
  if (ok) pass('upload signature validator accepts valid containers and rejects MIME spoofing');
  else fail('upload signature validator accepts valid containers and rejects MIME spoofing');
} catch (error) { fail('upload signature fixture tests', error.message); }

// All upload routes must validate actual file bytes, and room-message HTTP fallback
// must prove that the same session joined the requested Socket.IO room.
try {
  const source = fs.readFileSync(server, 'utf8');
  const uploadRoutes = source.split('\n').filter(line => line.includes("app.post('") && line.includes(".single('file')"));
  if (uploadRoutes.length >= 6 && uploadRoutes.every(x => x.includes('validateUploadedContent('))) pass(`all ${uploadRoutes.length} upload routes validate file content`);
  else fail('all upload routes validate file content', `validated ${uploadRoutes.filter(x=>x.includes('validateUploadedContent(')).length}/${uploadRoutes.length}`);
  const messageRoute = source.match(/app\.post\('\/api\/message',[\s\S]*?\n\}\);/);
  if (messageRoute && messageRoute[0].includes('so.data?.sid===sessionId') && messageRoute[0].includes('so.rooms.has(room)')) pass('HTTP messages require active membership in the requested room');
  else fail('HTTP messages require active membership in the requested room');
  if (source.includes('db.privateMessages=[...(db.privateMessages||[]),m].slice(-5000)') && source.includes('Private media save failed:') && source.includes('db.wall=previousWall')) pass('private media and wall posts roll back on persistence failure');
  else fail('private media and wall posts roll back on persistence failure');
} catch (error) { fail('upload/message authorization checks', error.message); }



// Announcement fan-out is one transaction: do not leave a partial broadcast
// across rooms if the database write fails.
try {
  const source = fs.readFileSync(server, 'utf8');
  const route = source.match(/app\.post\('\/api\/admin\/broadcast',[\s\S]*?\n\}\);/);
  if (route && route[0].includes('previousAnnouncements') && route[0].includes('previousMessages') && route[0].includes("try{save()}catch(e)") && route[0].includes('for(const message of messages)')) pass('announcement delivery is persisted atomically before broadcast');
  else fail('announcement delivery is persisted atomically before broadcast');
} catch (error) { fail('announcement transaction checks', error.message); }

// Session revocation: logout disconnects every socket using that session, and a
// global ban terminates the live transport so it cannot keep private messaging.
try {
  const source = fs.readFileSync(server, 'utf8');
  const logoutRoute = source.match(/app\.post\('\/api\/logout',[\s\S]*?\n\}\);/);
  const removeFn = source.match(/function removeFromChat\([\s\S]*?\n/);
  const privateSocket = source.match(/socket\.on\('private-message',[\s\S]*?\n/);
  if (logoutRoute && logoutRoute[0].includes('so.data?.sid===sid') && logoutRoute[0].includes('so.disconnect(true)')) pass('logout revokes all sockets for the logged-out session');
  else fail('logout revokes all sockets for the logged-out session');
  if (removeFn && removeFn[0].includes('if(banned)so.disconnect(true)')) pass('global bans disconnect live sockets');
  else fail('global bans disconnect live sockets');
  if (privateSocket && privateSocket[0].includes('globalBanned(u.name,socketClientIp(socket))')) pass('globally banned users cannot send private messages over existing sockets');
  else fail('globally banned users cannot send private messages over existing sockets');
} catch (error) { fail('session revocation checks', error.message); }


// Private media must be stored outside the public /uploads mount and served only
// through an authenticated sender/recipient-checked endpoint.
try {
  const source = fs.readFileSync(server, 'utf8');
  const mediaRoute = source.match(/app\.get\('\/api\/private\/media\/:filename',[\s\S]*?\n\}\);/);
  const mediaUpload = source.match(/app\.post\('\/api\/media',[\s\S]*?\n\}\);/);
  const hideRoute = source.match(/app\.post\('\/api\/private\/hide',[\s\S]*?\n\}\);/);
  const html = fs.readFileSync(mainPath, 'utf8');
  if (source.includes("let PRIVATE_MEDIA_DIR = path.join(DATA_DIR, 'private-media')") && source.includes('migratePrivateMediaToProtectedStorage()') && mediaRoute && mediaRoute[0].includes('requireAuth') && mediaRoute[0].includes('keyName(message.from)') && mediaRoute[0].includes('keyName(message.to)')) pass('private media is isolated and restricted to conversation participants');
  else fail('private media is isolated and restricted to conversation participants');
  if (mediaUpload && mediaUpload[0].includes('media.url=\'/api/private/media/\'') && mediaUpload[0].includes('fs.renameSync(req.file.path,privatePath)')) pass('new private uploads are moved out of public uploads storage');
  else fail('new private uploads are moved out of public uploads storage');
  if (html.includes("fetch(url,{headers:{'x-session':sid},cache:'no-store'})") && html.includes('URL.createObjectURL(await response.blob())')) pass('private media UI fetches with session auth and renders protected blobs');
  else fail('private media UI fetches with session auth and renders protected blobs');
  if (hideRoute && hideRoute[0].includes('Private conversation hide failed:') && hideRoute[0].includes('Private media cleanup failed:')) pass('ending a private conversation rolls back on failure and removes orphaned attachments');
  else fail('ending a private conversation rolls back on failure and removes orphaned attachments');
} catch (error) { fail('private media privacy checks', error.message); }


// Exercise startup migration with a legacy public-path private attachment.
try {
  const source = fs.readFileSync(server, 'utf8');
  const migration = source.match(/function migratePrivateMediaToProtectedStorage\(\)\s*\{[\s\S]*?\n\}/);
  if (!migration) throw new Error('private media migration function not found');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rimaz-private-media-'));
  try {
    const publicDir = path.join(tempDir, 'uploads'), privateDir = path.join(tempDir, 'private-media');
    fs.mkdirSync(publicDir); fs.mkdirSync(privateDir);
    const filename = '1720000000000-abcd1234.png';
    fs.writeFileSync(path.join(publicDir, filename), Buffer.from([137,80,78,71,13,10,26,10]));
    const context = { fs, path, UP_DIR: publicDir, PRIVATE_MEDIA_DIR: privateDir, db: { privateMessages: [{ media: { url: `/uploads/${filename}` } }] }, save: () => { context.saved = true; }, console: { log: () => {}, error: () => {} } };
    vm.createContext(context);
    vm.runInContext(`${migration[0]}\nglobalThis.migrate = migratePrivateMediaToProtectedStorage;`, context);
    context.migrate();
    const migrated = context.db.privateMessages[0].media.url === `/api/private/media/${filename}` && fs.existsSync(path.join(privateDir, filename)) && !fs.existsSync(path.join(publicDir, filename)) && context.saved;
    if (migrated) pass('legacy private uploads migrate from public storage without losing file bytes');
    else fail('legacy private uploads migrate from public storage without losing file bytes');
  } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
} catch (error) { fail('private media migration fixture', error.message); }

// Administrative role/permission edits must be persisted before notifications and
// must restore in-memory state if durable storage fails.
try {
  const source = fs.readFileSync(server, 'utf8');
  const roleRoute = source.match(/app\.post\('\/api\/admin\/role',[\s\S]*?\n\}\);\}\);/);
  const permissionRoute = source.split('\n').find(line => line.includes("app.put('/api/admin/permissions'"));
  const rankRoute = source.split('\n').find(line => line.includes("app.post('/api/admin/rank'"));
  if (rankRoute && rankRoute.includes('previousProfile=JSON.parse(JSON.stringify(p))') && rankRoute.includes('Rank assignment persistence failed:') && rankRoute.includes('db.rankAudit=previousRankAudit')) pass('rank grants restore member profile, base role, and audit history if persistence fails');
  else fail('rank grants restore member profile, base role, and audit history if persistence fails');
  if (roleRoute && roleRoute[0].includes('previousRole=target.role') && roleRoute[0].includes('Role update persistence failed:') && roleRoute[0].indexOf('try{save();}') < roleRoute[0].indexOf("emit('role-changed'")) pass('role changes roll back on persistence failure and notify only after durable save');
  else fail('role changes roll back on persistence failure and notify only after durable save');
  if (permissionRoute && permissionRoute.includes('previousPermissions=db.rolePermissions[role]') && permissionRoute.includes('Role permissions persistence failed:') && permissionRoute.includes('previousRankPermissions')) pass('rank permission edits restore role and rank metadata when save fails');
  else fail('rank permission edits restore role and rank metadata when save fails');
} catch (error) { fail('administration persistence checks', error.message); }

// WebRTC signaling must be tied to a server-authorized offer, validate payloads,
// and rate-limit relay events to prevent arbitrary signaling abuse.
try {
  const source = fs.readFileSync(server, 'utf8');
  const offer = source.match(/socket\.on\('call-offer',[\s\S]*?\n/);
  const answer = source.match(/socket\.on\('call-answer',[\s\S]*?\n/);
  const ice = source.match(/socket\.on\('ice',[\s\S]*?\n/);
  const disconnect = source.includes("socket.on('disconnect'") && source.includes('activeCallPairs.delete(pair)');
  const ok = source.includes('const activeCallPairs = new Map()') && source.includes('function allowCallSignal(') && source.includes('function validSessionDescription(') && source.includes('function validIceCandidate(')
    && offer && offer[0].includes("validSessionDescription(d.offer,'offer')") && offer[0].includes('allowCallSignal(sid)')
    && answer && answer[0].includes("validSessionDescription(d.answer,'answer')") && answer[0].includes('state.callee!==sid')
    && ice && ice[0].includes('validIceCandidate(d.candidate)') && ice[0].includes('activeCallPairs.get(')
    && disconnect;
  if (ok) pass('WebRTC signaling validates offers/answers/candidates, requires an active peer pair, rate-limits, and cleans up on disconnect');
  else fail('WebRTC signaling authorization and validation');
} catch (error) { fail('WebRTC signaling checks', error.message); }

// Room administration must roll back every in-memory mutation when persistence fails.
try {
  const source = fs.readFileSync(server, 'utf8');
  const create = source.match(/app\.post\('\/api\/admin\/room',[\s\S]*?\n\}\);/);
  const lock = source.match(/app\.post\('\/api\/admin\/room\/:id\/lock',[\s\S]*?\n\}\);/);
  const unlock = source.match(/app\.delete\('\/api\/admin\/room\/:id\/lock',[\s\S]*?\n\}\);/);
  const update = source.match(/app\.patch\('\/api\/admin\/room\/:id',[\s\S]*?\n\}\);/);
  const remove = source.match(/app\.delete\('\/api\/admin\/room\/:id',[\s\S]*?\n\}\);/);
  if (create && create[0].includes('Admin room creation save failed:') && create[0].includes("db.rooms=db.rooms.filter(item=>item.id!==id)")) pass('admin room creation rolls back if durable save fails');
  else fail('admin room creation rollback on persistence failure');
  if (lock && lock[0].includes('Room lock save failed:') && lock[0].includes('r.passwordHash=previous')) pass('room password changes roll back if persistence fails');
  else fail('room lock rollback on persistence failure');
  if (unlock && unlock[0].includes('Room unlock save failed:') && unlock[0].includes('r.passwordHash=previous')) pass('room unlock rolls back if persistence fails');
  else fail('room unlock rollback on persistence failure');
  if (update && update[0].includes('Room update save failed:') && update[0].includes('Object.assign(r,previous)') && update[0].includes('item.id!==r.id')) pass('room edits validate unique names and restore previous settings on save failure');
  else fail('room update validation and rollback');
  if (remove && remove[0].includes('Room deletion save failed:') && remove[0].includes('db.rooms.splice(index,0,removed)') && remove[0].includes('oldBans') && remove[0].includes('oldMutes')) pass('room deletion restores room and moderation metadata if persistence fails');
  else fail('room deletion rollback on persistence failure');
} catch (error) { fail('room administration integrity checks', error.message); }


// v46.26 granular rank-permission regression checks
try {
  const permissionServer = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const permissionHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const key of ['audit_view','stats_view','chat_filter_manage','member_status_manage']) {
    if (!permissionServer.includes(key) || !permissionHtml.includes(key)) throw new Error(`missing ${key}`);
  }
  if (!permissionServer.includes("if(p==='/api/admin/audit-logs')return 'audit_view'")) throw new Error('audit endpoint is not permission-gated');
  if (!permissionServer.includes("if(p==='/api/admin/chat-filter')return 'chat_filter_manage'")) throw new Error('filter endpoint is not permission-gated');
  if (!permissionServer.includes("if(p==='/api/admin/profile/status')return 'member_status_manage'")) throw new Error('status endpoint is not permission-gated');
  if (permissionServer.includes('إدارة الصلاحيات مخصصة لرتبة ADMIN الكاملة')) throw new Error('rank permission assignment remains locked');
  pass('v46.26 granular permissions are present in rank editor and server routes');
} catch (error) { fail('v46.26 granular permission checks', error.message); }

if (failures.length) {
  console.error(`\n${failures.length} verification check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll local static verification checks passed. This does not replace live-server/database testing.');
}


