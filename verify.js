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

// Privileged login and role-aware presence visibility are enforced server-side.
try {
  const source = fs.readFileSync(server, 'utf8');
  const privileged = source.match(/app\.post\('\/api\/login-privileged',[\s\S]*?\n\}\);/);
  const html = fs.readFileSync(mainPath, 'utf8');
  const checks = [
    ['ghost login is restricted to owner or explicitly authorized admin', privileged && privileged[0].includes("mode==='ghost'&&!isOwner(account)&&!(isAdmin(account)&&hasPermission(account,'panel_access'))")],
    ['hidden login remains restricted to staff or panel-authorized rank', privileged && privileged[0].includes("mode==='hidden'&&!isStaff(account)&&!hasPermission(account,'panel_access')")],
    ['presence visibility is viewer-aware and ghost is invisible to others', source.includes('function canSeePresence(viewer,target)') && source.includes('if(target.ghost)return false')],
    ['hidden presence is visible only to staff and self', source.includes("if(target.hidden)return !!viewer&&isStaff(viewer)")],
    ['live presence state is emitted individually per viewer', source.includes("so.emit('live-state',{online:getOnlineUsers(viewer),rooms:visibleRooms(viewer)})")],
    ['member directory omits accounts hidden from the current viewer', source.includes('if(hasInvisibleActiveSession(name,req.user))continue')],
    ['hidden join/leave notices are staff-only and ghost emits no presence notices', source.includes("presenceVisibility:u.hidden?'staff':'public'") && source.includes('function emitPresenceToRoom(room,notice)')],
    ['private conversation history is memory-only and cleared after full disconnect', source.includes('privateMessages: []') && source.includes('function clearPrivateConversationForUser(name)') && source.includes('schedulePrivateConversationCleanup(u.name)')],
    ['existing private conversations can be reopened even when the peer is not publicly online', html.includes("const existing=contacts.find(x=>key(x.name)===key(name))")]
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
  if (html.includes("api('/api/login-privileged'") && html.includes('rlLogoTaps.length>=5') && !html.includes('<div class="rlSpecial">')) pass('privileged login entry gesture remains intact');
  else fail('privileged login entry gesture remains intact');
} catch (error) { fail('hidden/ghost login checks', error.message); }

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
  if (saveFn && ['.tmp', "fs.openSync(tempFile, 'wx'", 'JSON.stringify(snapshot)', 'privateMessages: []', 'fs.renameSync(tempFile, DB_FILE)'].every(x => saveFn[0].includes(x)) && !saveFn[0].includes('fs.fsyncSync')) pass('database writes use compact atomic replacement and never persist private messages');
  else fail('database writes use compact atomic replacement and never persist private messages');
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
    const context = { fs, crypto, DATA_DIR: tempDir, DB_FILE: path.join(tempDir, 'data.json'), db: { users: { test: { likes: 7 } }, messages: [], privateMessages: [{text:'secret'}] }, process: { pid: process.pid } };
    vm.createContext(context);
    vm.runInContext(`${saveFn[0]}\nglobalThis.performSave = save;`, context);
    context.performSave();
    const saved = JSON.parse(fs.readFileSync(context.DB_FILE, 'utf8'));
    const remaining = fs.readdirSync(tempDir);
    if (saved.users.test.likes === 7 && Array.isArray(saved.privateMessages) && saved.privateMessages.length === 0 && remaining.length === 1 && remaining[0] === 'data.json') pass('atomic save writes compact valid JSON, excludes private history, and leaves no temporary files');
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
  if (source.includes('db.privateMessages=[...(db.privateMessages||[]),m].slice(-5000)') && source.includes('privateMessages: []') && source.includes('db.wall=previousWall')) pass('private media stays in memory while wall posts retain rollback protection');
  else fail('private media stays in memory while wall posts retain rollback protection');
} catch (error) { fail('upload/message authorization checks', error.message); }



// Gift, VIP, and visual rank are mutually exclusive member distinctions.
try {
  const source = fs.readFileSync(server, 'utf8');
  const gift = source.match(/app\.post\('\/api\/admin\/gift',[\s\S]*?\n\}\);/);
  const vip = source.match(/app\.post\('\/api\/admin\/gift-vip',[\s\S]*?\n\}\);/);
  const rank = source.match(/app\.post\('\/api\/admin\/rank',[\s\S]*?\n\}\);/);
  const css = fs.readFileSync(mainPath, 'utf8');
  if (gift && gift[0].includes('denyBadgeForRank(n,p,res)') && gift[0].includes('delete p.vipUntil') && gift[0].includes('p.gifts=[record]')) pass('new gift replaces the previous gift/VIP but never replaces an active rank');
  else fail('new gift replaces the previous gift/VIP but never replaces an active rank');
  if (vip && vip[0].includes('denyBadgeForRank(n,p,res)') && vip[0].includes('p.gifts=[]') && vip[0].includes('p.vipUntil=')) pass('VIP replaces a previous gift but never replaces an active rank');
  else fail('VIP replaces a previous gift but never replaces an active rank');
  if (rank && rank[0].includes('p.gifts=[]') && rank[0].includes('delete p.vipUntil')) pass('new visual rank replaces previous gift and VIP');
  else fail('new visual rank replaces previous gift and VIP');
  if (css.includes('rimaz-members-overlay-unified-layout-v1') && css.includes('grid-template-columns:4px 48px auto minmax(0,1fr) 34px 25px!important') && css.includes('direction:ltr!important;text-align:left!important') && css.includes('direction:rtl!important;text-align:left!important') && css.includes('.member .memberSub')) pass('online-members panel uses one layout with name and status beside rank');
  else fail('online-members status/name/rank unified layout');
} catch (error) { fail('badge exclusivity and online layout checks', error.message); }

// Rank hierarchy is enforced centrally for every member-targeted administrative action.
try {
  const source = fs.readFileSync(server, 'utf8');
  const expectedLevels = ["'super-red':400","'super-white':500","'super-black':600","'crown-silver':700","'crown-gold':800","'admin-shield':900","'admin-full':1000"];
  const checks = [
    ['all seven built-in ranks have a fixed ascending hierarchy', expectedLevels.every(x => source.includes(x))],
    ['only strictly higher ranked targets are protected', source.includes('targetLevel>actorLevel')],
    ['legacy member-action VIP and gift handlers reject badge replacement on ranked accounts', source.includes("if(action==='grant-vip')") && source.includes("if(action==='gift')") && (source.match(/denyBadgeForRank\(n,p,res\)/g)||[]).length >= 4],
    ['ordinary members/guests and the site owner are excluded from the new rank comparison', source.includes('if(!actor||isOwner(actor)||!targetName||isOwnerName(targetName))return false')],
    ['rank guard returns the requested Arabic permission message', source.includes('صلاحية هذه الرتبة أعلى منك') && source.includes('HIGHER_RANK_PROTECTED')],
    ['central member actions enforce hierarchy before moderation and global bans', source.includes("app.post('/api/admin/member-action'") && source.includes('denyHigherRankTarget(actor,n,res)')],
    ['room ban/mute helper enforces hierarchy server-side', source.includes('function roomAction(type,req,res)') && source.includes('denyHigherRankTarget(req.user,name,res)')],
    ['profile name/color edits and avatar deletion enforce hierarchy', source.includes("app.patch('/api/admin/profile/:name',requireAdmin,(req,res)=>{const n=accountKey(req.params.name);if(denyHigherRankTarget(req.user,n,res))return") && source.includes("app.delete('/api/admin/avatar/:name',requireAdmin,(req,res)=>{const n=accountKey(req.params.name);if(denyHigherRankTarget(req.user,n,res))return")],
    ['direct rank assignment and role changes enforce hierarchy', source.includes("app.post('/api/admin/rank'") && source.includes('if(denyHigherRankTarget(actor,n,res))return') && source.includes("app.post('/api/admin/role'")],
    ['additional member edits and removals enforce hierarchy', source.includes("app.patch('/api/admin/member-stats/:name',requireAuth,(req,res)=>{const n=accountKey(req.params.name);if(denyHigherRankTarget(req.user,n,res))return") && source.includes("app.put('/api/admin/member-permissions/:name'") && source.includes("if(action==='delete-user')") && source.includes("app.post('/api/admin/unban'") && source.includes('if(denyHigherRankTarget(req.user,name,res))return')],
    ['rank badge cannot be replaced by gift or VIP', source.includes('function denyBadgeForRank(name,p,res)') && source.includes('if(!hasActiveVisualRank(p))return false') && source.includes('لا يمكن استبدالها بهدية أو VIP')],
    ['member-action gifts replace rather than accumulate', source.includes("if(action==='gift')") && source.includes('p.gifts=[record]') && !source.includes('p.gifts.unshift(record)')]
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
  const levels = { 'super-red':400, 'super-white':500, 'super-black':600, 'crown-silver':700, 'crown-gold':800, 'admin-shield':900, 'admin-full':1000 };
  const simulate = new Function('levels', `const isOwner = user => !!user?.owner; const isOwnerName = name => name === 'site-owner'; const coreRankLevelForName = name => levels[name] ?? null; ${source.match(/function higherRankTargetError\(actor,targetName\)\{[\s\S]*?\n\}/)[0]}; return higherRankTargetError;`)(levels);
  const scenarios = [
    ['lower super cannot act on admin', simulate({name:'super-red'}, 'admin-shield') === true],
    ['admin can act on lower super', simulate({name:'admin-shield'}, 'super-red') === false],
    ['highest admin can act on lower admin tier', simulate({name:'admin-full'}, 'admin-shield') === false],
    ['equal ranks can act on each other', simulate({name:'super-white'}, 'super-white') === false],
    ['ordinary member target is not added to rank protection', simulate({name:'super-red'}, 'ordinary-member') === false],
    ['site owner remains outside the new rank guard', simulate({name:'super-red',owner:true}, 'admin-full') === false]
  ];
  for (const [label, ok] of scenarios) ok ? pass(label) : fail(label);
} catch (error) { fail('rank hierarchy regression checks', error.message); }

// Chat messages are persisted in a short batch rather than synchronously per message.
try {
  const source=fs.readFileSync(server,'utf8');
  const add=source.match(/function addMessage\(m\)\s*\{[\s\S]*?\n\}/);
  const batch=source.match(/function scheduleMessageSave\(delay=350\)\s*\{[\s\S]*?\n\}/);
  if(add&&batch&&!add[0].includes('save()')&&add[0].includes('scheduleMessageSave()')&&batch[0].includes('},delay)') && batch[0].includes('scheduleMessageSave(3000)')&&batch[0].includes('save()')&&source.includes('function gracefulShutdown(signal)')) pass('chat message writes are batched and flushed during graceful shutdown');
  else fail('chat message write batching and shutdown flush');
} catch(error){fail('chat write batching checks',error.message);}

// Public room and wall content have a 24-hour retention policy with media cleanup.
try {
  const source = fs.readFileSync(server, 'utf8');
  const ok = source.includes('const PUBLIC_RETENTION_MS=24*60*60*1000')
    && source.includes('function cleanupExpiredPublicContent(now=Date.now())')
    && source.includes("message?.room==='public'")
    && source.includes('const expiredWallIds=new Set()')
    && source.includes('removePublicUploadIfUnreferenced(url)')
    && source.includes('setInterval(()=>cleanupExpiredPublicContent(),5*60*1000)');
  if (ok) pass('public room messages and wall posts expire after 24 hours with orphan media cleanup');
  else fail('24-hour public and wall retention policy');
} catch (error) { fail('24-hour retention checks', error.message); }

// Exercise the actual retention functions with old/new public, wall, room, and avatar data.
try {
  const source = fs.readFileSync(server, 'utf8');
  const block = source.match(/const PUBLIC_RETENTION_MS=24\*60\*60\*1000;[\s\S]*?(?=\ncleanupExpiredPublicContent\(\);)/);
  if (!block) throw new Error('retention functions not found');
  const now = 2_000_000_000_000, removedFiles = [], events = [];
  const old = now - 24*60*60*1000 - 1000, fresh = now - 60_000;
  const oldMedia = '/uploads/old-wall.jpg';
  const context = {
    Date, Set, path,
    fs: { unlinkSync: file => removedFiles.push(file) },
    UP_DIR: '/data/uploads',
    db: {
      messages: [
        {id:'old-public',room:'public',at:old,text:'expired'},
        {id:'new-public',room:'public',at:fresh,text:'keep'},
        {id:'old-other-room',room:'friends',at:old,text:'keep'},
        {id:'old-announcement',room:'public',at:old,type:'announcement',text:'keep'}
      ],
      wall: [
        {id:'old-post',at:old,media:{url:oldMedia}},
        {id:'new-post',at:fresh,text:'keep'}
      ],
      wallLikes:{'old-post':['a'],'new-post':['b']},
      wallComments:{'old-post':['old'],'new-post':['new']},
      profiles:{a:{avatar:'/uploads/old-wall.jpg'}}, users:{a:{likes:10}}
    },
    io: { emit: (...args) => events.push(args) },
    save: () => { context.saved = true; },
    console: { log: () => {}, error: () => {}, warn: () => {} }
  };
  vm.createContext(context);
  vm.runInContext(`${block[0]}\nglobalThis.runRetention = cleanupExpiredPublicContent;`, context);
  context.runRetention(now);
  const msgIds=context.db.messages.map(x=>x.id).join(','),wallIds=context.db.wall.map(x=>x.id).join(',');
  const ok=msgIds==='new-public,old-other-room,old-announcement'&&wallIds==='new-post'
    &&!Object.hasOwn(context.db.wallLikes,'old-post')&&!Object.hasOwn(context.db.wallComments,'old-post')
    &&removedFiles.length===0&&context.db.users.a.likes===10&&context.saved===true;
  if(ok)pass('retention runtime fixture removes only expired public/wall content and preserves referenced avatar/account data');
  else fail('retention runtime fixture',JSON.stringify({msgIds,wallIds,removedFiles,saved:context.saved}));
} catch(error){fail('retention runtime fixture',error.message);}

// Announcement fan-out is one transaction: do not leave a partial broadcast
// across rooms if the database write fails.
try {
  const source = fs.readFileSync(server, 'utf8');
  const route = source.match(/app\.post\('\/api\/admin\/broadcast',[\s\S]*?\n\}\);/);
  if (route && route[0].includes('previousAnnouncements') && route[0].includes('previousMessages') && route[0].includes("try{save()}catch(e)") && route[0].includes('publishAnnouncement(item)') && source.includes("const ANNOUNCEMENT_INTERVAL_MS=15*60*1000") && source.includes('function isAnnouncementRoom(room)') && source.includes('function announcementRooms(){return (Array.isArray(db.rooms)?db.rooms:[]).filter(isAnnouncementRoom);}') && source.includes("!['wall','__wall__','__private__'].includes(id)") && source.includes('function roomHistoryWithAnnouncements(roomId,viewer,createdAt=0)') && source.includes('roomHistoryWithAnnouncements(room,u,Number(u.created)||0)') && source.includes("title:item.title||'إعلان إداري'")) pass('announcement delivery covers every configured room, excludes only wall/DM channels, and restores active notices after history eviction');
  else fail('announcement delivery is persisted atomically and reaches every configured room');
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
  const rankRoute = source.match(/app\.post\('\/api\/admin\/rank',[\s\S]*?app\.get\('\/api\/admin\/member-ip/);
  if (rankRoute && rankRoute[0].includes('previousProfile=JSON.parse(JSON.stringify(p))') && rankRoute[0].includes('Rank assignment persistence failed:') && rankRoute[0].includes('db.rankAudit=previousRankAudit') && rankRoute[0].includes('previousNotifications')) pass('rank grants restore member profile, base role, audit history, and inbox notifications if persistence fails');
  else fail('rank grants restore member profile, base role, audit history, and inbox notifications if persistence fails');
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


// v46.28 admin panel visibility and gift-notice regression checks
try {
  const permissionHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const permissionServer = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  if (!permissionHtml.includes("document.querySelectorAll('.overlay.admin .tabs button')")) throw new Error('admin tab filter does not target the actual tab container');
  if (permissionHtml.includes("document.querySelectorAll('.overlay.adminPanel .tabs button')")) throw new Error('stale incorrect admin tab selector remains');
  for (const key of ['users_view','grant_likes','reset_likes','rooms_manage','announcement_post','announcement_delete','member_status_manage','wall_delete_user']) {
    if (!permissionHtml.includes(key)) throw new Error(`missing client permission ${key}`);
  }
  if (!permissionHtml.includes("welcome:(me?.owner||me?.admin||hasClientPermission('welcome_manage'))")) throw new Error('welcome tab is not aligned with its permission');
  if (!permissionHtml.includes("can('profile_edit')") || !permissionHtml.includes("can('member_ip')")) throw new Error('member action buttons are not individually filtered');
  if (!permissionServer.includes('fromDisplayName:displayName(req.user.name)') || !permissionServer.includes('fromProfile:profile(req.user.name)')) throw new Error('gift sender identity is incomplete');
  if (permissionServer.includes("req.user.name+' (admin) هدية:")) throw new Error('gift sender name can still be duplicated');
  if (!permissionHtml.includes('rimaz-gift-alert-title') || !permissionHtml.includes('rimaz-gift-sender')) throw new Error('reference gift alert layout is missing');
  pass('v46.28 role-specific admin buttons and reference gift notice');
} catch (error) { fail('v46.28 admin visibility and gift notice checks', error.message); }

if (failures.length) {
  console.error(`\n${failures.length} verification check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll local static verification checks passed. This does not replace live-server/database testing.');
}



// v46.27 permission-editor localization and client/server compatibility checks
try {
  const permissionServer = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const permissionHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const key of ['audit_view','stats_view','chat_filter_manage','member_status_manage']) {
    if (!permissionServer.includes(key) || !permissionHtml.includes(key)) throw new Error(`missing ${key}`);
  }
  for (const label of ['عرض سجل العمليات وتصديره','عرض إحصائيات الموقع','إدارة فلتر الكلمات','إدارة حالات الأعضاء']) {
    if (!permissionHtml.includes(label)) throw new Error(`missing Arabic label ${label}`);
  }
  if (!permissionHtml.includes('عدم توافق نسخة الواجهة والسيرفر')) throw new Error('client compatibility preflight missing');
  if (!permissionServer.includes('permissionSchemaVersion:2') || !permissionServer.includes('permissionKeys:ALL_PERMISSION_KEYS')) throw new Error('server permission schema metadata missing');
  if (!permissionHtml.includes("['الأدوات والإضافات الجديدة',['audit_view','stats_view','chat_filter_manage','member_status_manage']]")) throw new Error('custom rank editor missing new permission group');
  pass('v46.27 Arabic permission labels and client/server schema compatibility');
} catch (error) { fail('v46.27 permission compatibility checks', error.message); }

// v46.29 regression checks: online row status placement, duplicate legacy identities,
// and rank-based welcome-message permissions must agree across client and server.
try {
  const repairServer = fs.readFileSync(server, 'utf8');
  const repairHtml = fs.readFileSync(mainPath, 'utf8');
  const membersRoute = repairServer.match(/app\.get\('\/api\/members',[\s\S]*?\n\}\);/);
  const adminDataRoute = repairServer.match(/app\.get\('\/api\/admin\/data',[\s\S]*?\n\}\);/);
  if (!repairHtml.includes('rimaz-members-overlay-unified-layout-v1') || repairHtml.includes('rimaz-final-online-presence-and-permission-repair-v46-29') || repairHtml.includes('rimaz-chat-members-rank-alignment-fix-v1') || repairHtml.includes('rimaz-online-members-status-final-v2')) throw new Error('legacy online layout rules remain or unified layout is missing');
  if (!membersRoute || !membersRoute[0].includes('registeredKeys.has(normalized)') || !membersRoute[0].includes('seenMemberKeys.has(normalized)')) throw new Error('member directory does not suppress legacy guest/registered duplicates');
  if (!repairServer.includes('const registeredAccountKeys=new Set(Object.keys(db.users||{}).map(keyName))') || !repairServer.includes('registeredAccountKeys.has(k)||seenAdminAccountKeys.has(k)')) throw new Error('admin data does not suppress duplicate account identities');
  if (!repairServer.includes("app.get('/api/admin/welcome-messages',requireAuth,(req,res)=>{if(!hasPermission(req.user,'welcome_manage'))")) throw new Error('welcome-message GET route still blocks rank permission');
  if (!repairHtml.includes("async function welcomeMessagesEditor(){if(!me?.owner&&!me?.admin&&!hasClientPermission('welcome_manage'))")) throw new Error('welcome editor still checks only owner/admin roles');
  pass('online-members CSS cleanup, legacy duplicate identity suppression, and rank-based welcome permissions');
} catch (error) { fail('v46.29 regression checks', error.message); }


// v46.35: rank grants persist their inbox item atomically and deliver the same live card as gifts.
try {
  const rankServer = fs.readFileSync(server, 'utf8');
  const rankHtml = fs.readFileSync(mainPath, 'utf8');
  const rankRoute = rankServer.match(/app\.post\('\/api\/admin\/rank',[\s\S]*?\n\}\);/);
  if (!rankRoute || !rankRoute[0].includes("emitToUser(n,'rank-granted'") || rankRoute[0].includes("emitToUser(n,'admin-action-notice',{title:'🏅 تم منحك رتبة'")) throw new Error('rank assignment still uses the generic duplicate notice path');
  if (!rankRoute[0].includes('fromProfile:{...profile(actor.name)}') || !rankRoute[0].includes('fromRole:roleOf(actor)') || !rankRoute[0].includes('rankName:definition.name')) throw new Error('rank event is missing sender identity or rank details');
  const saveAt=rankRoute[0].indexOf('try{save();}');
  const profileEmitAt=rankRoute[0].indexOf("io.emit('profile-changed'");
  const cardEmitAt=rankRoute[0].indexOf("emitToUser(n,'rank-granted'");
  if (!rankRoute[0].includes('db.notifications[n]=[inboxItem') || !(saveAt>0 && profileEmitAt>saveAt && cardEmitAt>profileEmitAt) || !rankRoute[0].includes('cardQueued:!!definition')) throw new Error('rank notification is not saved atomically before profile/card events');
  if (!rankHtml.includes('function showAwardNoticeCard(') || !rankHtml.includes('function showGiftAnimation(') || !rankHtml.includes('function showRankGrantCard(')) throw new Error('gift/rank cards do not share one renderer');
  if (!rankHtml.includes("socket.on('rank-granted'") || !rankHtml.includes('rimaz-rank-reference') || !rankHtml.includes('rimaz-rank-duration')) throw new Error('rank card listener or rank-specific content styles are missing');
  if (!rankHtml.includes("senderCaption:'أرسل لك هدية'") || !rankHtml.includes("senderCaption:'منحك رتبة جديدة'")) throw new Error('gift or rank sender caption is missing');
  const roleRoute=rankServer.match(/app\.post\('\/api\/admin\/role',[\s\S]*?\n\}\);\}\);/);
  const legacyAction=rankServer.match(/if\(action==='grant-admin'\|\|action==='grant-super'\|\|action==='grant-banner'\)\{[\s\S]*?return res\.json\(\{ok:true,role,cardQueued:true\}\);\}/);
  if(!roleRoute || !roleRoute[0].includes("emit('rank-granted'") || roleRoute[0].includes("emit('admin-action-notice',{title:'🏅 تغيير المنصب'")) throw new Error('direct role promotion does not use the shared award card');
  if(!rankServer.includes("emitToUser(n,'rank-granted',{id:crypto.randomUUID(),name:n,rank,rankName:")) throw new Error('legacy promotion action bypasses the shared award card');
  if(rankHtml.includes('.rimaz-rank-reference .rimaz-gift-alert-title{')) throw new Error('rank card overrides the agreed shared header sizing');
  if (rankHtml.includes('.rimaz-gift-ribbon') || rankHtml.includes('.rimaz-gift-burst') || rankHtml.includes('@keyframes rgGiftFloat') || rankHtml.includes('@keyframes rgRibbon')) throw new Error('unused legacy gift-animation rules remain');
  pass('v46.35 rank-grant notice is durably queued before the same gift-card renderer is triggered');
} catch (error) { fail('v46.34 rank-grant card checks', error.message); }
