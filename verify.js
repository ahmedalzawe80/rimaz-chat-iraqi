'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const failures = [];
const pass = (label) => console.log(`✓ ${label}`);
const fail = (label, detail) => { failures.push(label); console.error(`✗ ${label}${detail ? `: ${detail}` : ''}`); };

const server = path.join(root, 'server.js');
const serverCheck = spawnSync(process.execPath, ['--check', server], { encoding: 'utf8' });
if (serverCheck.status === 0) pass('server.js syntax');
else fail('server.js syntax', serverCheck.stderr || serverCheck.stdout);

// Regression checks for the production startup bootstrap and packed smiley assets.
try {
  const source = fs.readFileSync(server, 'utf8');
  const appInit = source.indexOf('const app = express();');
  const serverInit = source.indexOf('const server = http.createServer(app);');
  const ioInit = source.indexOf('const io = new Server(server);');
  const firstUse = source.indexOf("app.disable('x-powered-by');");
  if (appInit >= 0 && serverInit > appInit && ioInit > serverInit && firstUse > ioInit) pass('Express, HTTP, and Socket.IO are initialized before first use');
  else fail('server bootstrap initialization order');
  const packPath = path.join(root, 'public', 'smileys-pack.json');
  const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  const names = Object.keys(pack).filter(name => /^smiley-\d+\.(?:gif|png|jpe?g|webp)$/i.test(name));
  const valid = names.length === 238 && names.every(name => {
    const item = pack[name];
    let bytes;
    try { bytes = Buffer.from(item.data, 'base64'); } catch { return false; }
    if (!bytes.length || !item.type) return false;
    if (bytes.subarray(0, 6).toString() === 'GIF87a' || bytes.subarray(0, 6).toString() === 'GIF89a') return item.type === 'image/gif';
    if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return item.type === 'image/png';
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return item.type === 'image/jpeg';
    if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return item.type === 'image/webp';
    return false;
  });
  if (valid) pass('all 238 packed smileys have valid base64 and matching MIME signatures');
  else fail('packed smiley asset integrity or MIME signature');
} catch (error) { fail('startup and smiley-pack regression checks', error.message); }

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

    ['ghost login is restricted to owner or explicitly authorized admin', privileged && privileged[0].includes("mode==='ghost'&&!isOwner(account)&&!hasPermission(account,'ghost_login')")],
    ['hidden login remains restricted to staff or panel-authorized rank', privileged && privileged[0].includes("mode==='hidden'&&!isOwner(account)&&!hasPermission(account,'hidden_login')")],
    ['presence visibility is viewer-aware and ghost is invisible to others', source.includes('function canSeePresence(viewer,target,context=null)') && source.includes('if(target.ghost)return false')],
    ['hidden presence is visible only to staff and self', source.includes("if(target.hidden)return !!viewer&&(isOwner(viewer)||hasPermission(viewer,'presence_hidden_view'))")],
    ['live presence state is emitted individually per viewer', source.includes("const context=buildPresenceContext()") && source.includes("so.emit('live-state',{online:getOnlineUsers(viewer,context),rooms:visibleRooms(viewer,context)})")],
    ['packed image assets are decoded once and reused as Buffers', source.includes('function decodePackedAssets(pack)') && source.includes('decodePackedAssets(SMILEY_PACK)') && source.includes('res.send(item.data);') && !source.includes("res.send(Buffer.from(item.data,'base64'))")],
    ['presence broadcasts reuse indexed session and socket lookups', source.includes('function buildPresenceContext()') && source.includes('sessionsBySid') && source.includes('sessionsByAccount') && source.includes('socketsBySid')],
    ['member directory omits accounts hidden from the current viewer', source.includes('if(hasInvisibleActiveSession(name,req.user))continue')],
    ['hidden join/leave notices are staff-only and ghost emits no presence notices', source.includes("presenceVisibility:u.hidden?'staff':'public'") && source.includes('function emitPresenceToRoom(room,notice)')],
    ['private conversation history is memory-only and cleared after full disconnect', source.includes('privateMessages: []') && source.includes('function clearPrivateConversationForUser(name)') && source.includes('schedulePrivateConversationCleanup(u.name)')],
    ['existing private conversations can be reopened even when the peer is not publicly online', html.includes("const existing=contacts.find(x=>key(x.name)===key(name))")]
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
  if (html.includes("api('/api/login-privileged'") && html.includes('rlLogoTaps.length>=5') && !html.includes('<div class="rlSpecial">')) pass('privileged login entry gesture remains intact');
  else fail('privileged login entry gesture remains intact');
} catch (error) { fail('hidden/ghost login checks', error.message); }

// Private chat window controls have distinct, non-destructive semantics.
try {
  const html = fs.readFileSync(mainPath, 'utf8');
  const checks = [
    ['private X closes only the window and preserves the conversation history', html.includes("function closePrivateConversation(){const other=String(privateTo||'').trim();if(!other){closeLayer();return;}privateOpen=false;privateTo='';privatePeerProfile={};privatePeerUser=null;clearPrivateMediaObjectUrls();closeLayer();toast('تم إغلاق نافذة المحادثة مع الاحتفاظ بسجل الرسائل');}")],
    ['private minimize preserves a restorable peer entry instead of discarding the conversation', html.includes('privateMinimizedPeer={name:other') && html.includes("a.unshift({name:privateMinimizedPeer.name") && html.includes('محادثة مصغّرة')],
    ['private contacts, members, and read receipts load concurrently', /Promise\.all\(\[api\('\/api\/private\/contacts'\),api\('\/api\/members'\),api\('\/api\/private\/read-all'/.test(html)],
    ['conversation deletion remains an explicit action in the private contacts list', html.includes('onclick="event.stopPropagation();hidePrivate(') && html.includes("api('/api/private/hide'")]
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
} catch (error) { fail('private conversation control regression checks', error.message); }

// Navigation uses a lightweight rooms payload and welcome cards precede room history.
try {
  const source = fs.readFileSync(server, 'utf8');
  const html = fs.readFileSync(mainPath, 'utf8');
  const joinStart = source.indexOf("socket.emit('room-joined',{room});", source.indexOf("socket.on('join'"));
  const welcomeAt = source.indexOf('if(!welcomeSentSessions.has(sid))', joinStart);
  const historyAt = source.indexOf("socket.emit('history',{room,items:roomHistoryWithAnnouncements", joinStart);
  const checks = [
    ['room navigation has a dedicated lightweight authenticated rooms endpoint', source.includes("app.get('/api/rooms',requireAuth,(req,res)=>{res.set('Cache-Control','no-store');res.json(visibleRooms(req.user));});") && html.includes("async function openRooms(){rooms=await api('/api/rooms');")],
    ['welcome messages are emitted before room history and only once per session', joinStart>=0 && welcomeAt>joinStart && historyAt>welcomeAt && source.includes('welcomeSentSessions.add(sid)')]
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
} catch (error) { fail('navigation and welcome-order regression checks', error.message); }

// Voice rooms use one room-scoped WebRTC mesh and a single active mic-seat flow.
try {
  const source = fs.readFileSync(server, 'utf8');
  const html = fs.readFileSync(mainPath, 'utf8');
  const checks = [
    ['voice room uses server-authorized mic seats and emits a peer roster', source.includes("socket.emit('voice-mic-granted'") && source.includes("socket.on('request-mic'") && source.includes('voice-peer-joined')],
    ['voice WebRTC offers are speaker-authorized while answers/ICE include room listeners', source.includes("socket.on('voice-peer-offer'") && source.includes("socket.on('voice-peer-answer'") && source.includes("socket.on('voice-peer-ice'") && source.includes('speakers?.has(sid)') && source.includes('members?.has(d.to)') && source.includes('activeVoicePairs')],
    ['room-mic signaling has a separate rate limit from private calls', source.includes('const voiceSignalWindows = new Map()') && source.includes('function allowVoiceSignal(sid)') && source.includes("socket.on('voice-peer-offer',d=>") && source.includes('allowVoiceSignal(sid)') && source.includes('voiceSignalWindows.delete(sid)')],
    ['voice peers are removed on room leave and disconnect', source.includes("socketBySession(peerSid)?.emit('voice-peer-left'") && source.includes("socket.on('disconnect'")],
    ['client captures microphone audio and creates room peer connections', html.includes('navigator.mediaDevices.getUserMedia({audio:') && html.includes('new RTCPeerConnection') && html.includes("'voice-peer-offer'" )],
    ['lowering a room mic removes only the outgoing audio track and preserves listening peer connections', html.includes('function stopRoomMicrophone()') && html.includes('sender.replaceTrack(null)') && html.includes('voiceRequestPending=true') && html.includes('voiceMicRequestId') && html.includes("socket.on('voice-mic-lowered',()=>stopRoomMicrophone())") && !html.includes("socket.on('voice-mic-lowered',()=>{micRaised=false;closeVoiceAudio()})")],
    ['voice room layout uses circular mic seats and five default seats', html.includes('border-radius:50%!important') && html.includes('id="publicRoomMics" type="number" min="1" max="20" value="5"') && html.includes('id="rmics" type="number" min="1" max="20" value="5"')],
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
} catch (error) { fail('voice-room regression checks', error.message); }

// Entry identity and five-minute global-ban feedback must be enforced consistently.
try {
  const source = fs.readFileSync(server, 'utf8');
  const html = fs.readFileSync(mainPath, 'utf8');
  const routes = ['/api/register','/api/login','/api/login-privileged','/api/guest'];
  const checks = [
    ['registration rejects names already held by registered members or guests', source.includes('function nameTaken(name)') && source.includes("Object.keys(db.users||{}).some(x=>keyName(x)===n)") && source.includes("Object.keys(db.guests||{}).some(x=>keyName(x)===n)") && source.includes('if(nameTaken(n)&&!ownerRequested)')],
    ['guest entry rejects names already held by members or guests', source.includes("app.post('/api/guest'") && source.includes('if(nameTaken(n))return res.status(409)')],
    ['all entry routes return remaining global-ban time', routes.every(route => { const m=source.match(new RegExp("app\\.post\\('"+route.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')+"',[\\s\\S]*?\\n\\}\\);")); return m && m[0].includes('globalBanResponse(res,n,requestClientIp(req))'); })],
    ['global-ban response calculates remaining minutes and seconds from stored expiry', source.includes('function globalBanStatus(name,ip,now=Date.now())') && source.includes('remainingSeconds:totalSeconds') && source.includes('remainingText') && source.includes('GLOBAL_BAN_ACTIVE')],
    ['login forms show actionable errors without leaving the entry screen', html.includes('async function doRegister()') && html.includes('async function doLogin()') && html.includes('async function doGuest()') && html.includes("document.getElementById('ln')?.focus()") && html.includes('الوقت المتبقي|دقيقة|ثانية|الاسم موجود')],
    ['duplicate-name response uses the requested exact Arabic message', source.includes("error:'هذا الاسم موجود'") && !source.includes('هذا الاسم موجود بالفعل، اختار اسماً آخر')],
    ['forced global-ban return displays the remaining time on the entry page', source.includes("...(banned?(globalBanStatus(n,'')||{}):{})") && html.includes("d?.remainingText?' · الوقت المتبقي: '+d.remainingText:''") && html.includes('if(message)showLoginFeedback(message)')]
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
  const banFn = source.match(/function globalBanStatus\(name,ip,now=Date\.now\(\)\)\{[\s\S]*?\n\}/);
  if (!banFn) throw new Error('globalBanStatus not found');
  const context = { db:{globalBans:{ali:{until:160000}},globalIpBans:{'1.2.3.4':{until:190000}}}, keyName:x=>String(x||'').toLowerCase(), normalizeIp:x=>String(x||'').toLowerCase(), save(){}, Date:{now:()=>100000} };
  vm.createContext(context); vm.runInContext(`${banFn[0]}\nglobalThis.checkBan=globalBanStatus;`,context);
  const named=context.checkBan('ali','',100000), ip=context.checkBan('other','1.2.3.4',100000);
  if(named?.remainingSeconds===60 && ip?.remainingSeconds===90) pass('remaining-ban timer runtime fixtures cover name and IP bans');
  else fail('remaining-ban timer runtime fixtures',JSON.stringify({named,ip}));
} catch(error) { fail('entry and ban regression checks',error.message); }

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

// Chat identity is independent from visual rank and browser translation; likes remain intact.
try {
  const client = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const history = fs.readFileSync(server, 'utf8').match(/function roomHistoryWithAnnouncements\([\s\S]*?\n}\nfunction publishAnnouncement/);
  if (client.includes('translate=\"no\"') && client.includes('class=\"notranslate\"') && client.includes('nameEl.setAttribute(\'translate\',\'no\')')) pass('chat display names are protected from browser translation');
  else fail('chat display names are protected from browser translation');
  if (!client.includes("m.likes>=500?'<span class=\"badge\">500+</span>'")) pass('500+ likes badge is removed from chat message headers');
  else fail('500+ likes badge is removed from chat message headers');
  if (history && history[0].includes('displayName:displayName(item.from)') && history[0].includes('profile:currentProfile')) pass('room history resolves current account name and rank profile for old messages');
  else fail('room history resolves current account name and rank profile for old messages');
} catch (error) { fail('chat identity regression checks', error.message); }


if (html) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(match => !/type=["']application\/ld\+json["']/i.test(match[1]))
    .map(match => match[2]).filter(source => source.trim());
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

// Server-rendered SEO metadata must use the saved admin description in the raw HTML.
try {
  const source = fs.readFileSync(server, 'utf8');
  const start = source.indexOf('function escapeHtmlAttribute(value) {');
  const end = source.indexOf('\nfunction sendSeoIndex(req,res) {', start);
  if (start < 0 || end < 0) throw new Error('SEO renderer not found');
  const context = { fs, INDEX_FILE: path.join(root, 'index.html'), db: { siteSettings: { siteName: 'ريماز اختبار', tagline: 'وصف اختبار مميز & آمن' } } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + ';globalThis.__seoHtml=renderSeoIndex();', context);
  const rendered = context.__seoHtml;
  const expected = [
    'name="description" content="وصف اختبار مميز &amp; آمن"',
    'property="og:description" content="وصف اختبار مميز &amp; آمن"',
    'name="twitter:description" content="وصف اختبار مميز &amp; آمن"',
    '"description":"وصف اختبار مميز & آمن"',
    '<title>ريماز اختبار | دردشة عراقية وتعارف</title>'
  ];
  if (!expected.every(value => rendered.includes(value))) throw new Error('One or more SEO tags did not receive the saved site settings');
  if (!source.includes("slice(0,300)") || !html.includes('id="siteTagline" maxlength=300')) throw new Error('SEO description limit is not consistently 300 characters');
  pass('admin SEO description is server-rendered into meta, Open Graph, Twitter and Schema tags');
} catch (error) { fail('server-rendered SEO description integration', error.message); }

// Scheduled announcements must not replay alongside welcome cards on room entry.
try {
  const source = fs.readFileSync(server, 'utf8');
  const historyFn = source.match(/function roomHistoryWithAnnouncements\([\s\S]*?\n}\nfunction publishAnnouncement/);
  const scheduler = source.match(/function schedulePermanentAnnouncement\([\s\S]*?\n}\nfunction scheduleAllPermanentAnnouncements\([\s\S]*?\n}/);
  if (historyFn && historyFn[0].includes("m.type==='presence'") && !historyFn[0].includes('db.announcements')) pass('room entry history excludes scheduled announcements and keeps presence notices');
  else fail('room entry does not replay announcements with welcome cards');
  if (scheduler && scheduler[0].includes('ANNOUNCEMENT_INTERVAL_MS') && scheduler[0].includes('lastPublishedAt') && scheduler[0].includes('publishAnnouncement(current)')) pass('permanent announcements repeat 15 minutes after their last publication');
  else fail('permanent announcement 15-minute repeat scheduler');
  const publish = source.match(/function publishAnnouncement\([\s\S]*?\n}/);
  if (publish && source.includes("room:'__broadcast__'") && publish[0].includes("io.emit('message',message)") && !publish[0].includes('io.to(')) pass('announcements are broadcast once to all connected users regardless of room');
  else fail('announcements reach users outside rooms without duplicate room fan-out');
  if (source.includes('publishAnnouncement(item);\n  if(temporary)scheduleAnnouncementExpiry(item);else schedulePermanentAnnouncement(item);')) pass('both temporary and administrative announcements publish immediately on save');
  else fail('both announcement types publish immediately on creation');
  if (html.includes("socket.on('message',m=>{if(m?.type==='announcement'||m.room===currentRoom)addMessage(m)})") && !html.includes("m.role==='owner'?'صاحب الموقع'")) pass('clients display global announcements and omit redundant owner/admin role text');
  else fail('client global announcement display and concise author identity');
} catch (error) { fail('announcement timing regression checks', error.message); }

// v46.80.8: return to the login form with locally remembered credentials; never auto-enter chat.
try {
  const html = fs.readFileSync(mainPath, 'utf8');
  if (html.includes("let sid='',me=null") && html.includes('// Always show the entry screen on a fresh page load.') && html.includes('login();') && !html.includes('if(sid)boot();')) pass('fresh page loads always show the login screen instead of auto-entering chat');
  else fail('fresh page loads must require an explicit login tap');
  if (html.includes("localStorage.setItem('rimaz_saved_username'") && html.includes("localStorage.setItem('rimaz_saved_password'") && html.includes('value="${esc(remembered.password)}"') && html.includes('rememberLoginCredentials(n,p)')) pass('successful member login remembers username and masked password field locally');
  else fail('saved username and password are prefilled on the login screen');
  if (!html.includes("localStorage.setItem('rimaz_sid',sid)") && html.includes("sessionStorage.setItem('rimaz_sid',sid)") && html.includes("localStorage.removeItem('rimaz_sid')")) pass('authenticated session is tab-scoped and legacy persistent session tokens are cleared');
  else fail('session token must not persistently bypass the login screen');
} catch (error) { fail('v46.80.8 remembered credentials regression checks', error.message); }

// A room-microphone user sees the incoming call but cannot accept until lowering it.
try {
  const html = fs.readFileSync(mainPath, 'utf8');
  const accept = html.match(/async function acceptIncomingCall\(\)\{[\s\S]*?\n?function rejectIncomingCall/);
  if (html.includes('function handleOffer(d)') && accept && accept[0].includes('if(micRaised||voiceRequestPending)') && accept[0].includes('لا تستطيع الرد على المكالمة لأنك تتحدث باستخدام مايك الغرفة') && accept[0].indexOf('if(micRaised||voiceRequestPending)') < accept[0].indexOf('pendingIncomingCall=null')) pass('incoming call stays pending and acceptance is blocked while room mic is raised');
  else fail('room microphone blocks private-call acceptance without hiding incoming call');
} catch (error) { fail('room mic/private call regression checks', error.message); }

// The server keeps an incoming call pending while its recipient is on a room mic and rejects premature answers.
try {
  const source = fs.readFileSync(server, 'utf8');
  const html = fs.readFileSync(mainPath, 'utf8');
  if (source.includes('const timeoutCall=()=>{if(activeCallPairs.get(pair)!==state||state.answered)return;const callee=socketUsers.get(target[0]);if(callee&&voiceSpeakers.get(callee.room)?.has(target[0]))') && source.includes('waitingOnRoomMic') && source.includes('if(!state||state.callee!==sid||state.caller!==target[0])return;state.answered=true;')) pass('incoming call timeout is extended while the callee is speaking on a room mic');
  else fail('incoming call remains pending during room-mic use');
  if (source.includes("if(voiceSpeakers.get(u.room)?.has(sid))return socket.emit('call-answer-denied',{reason:'room-mic'})") && html.includes("socket.on('call-answer-denied'") && html.includes('acceptedIncomingCallForRetry')) pass('server blocks call answers during room-mic use and restores the incoming card');
  else fail('server-side room-mic call-answer guard');
  if (html.includes("socket.on('voice-mic-granted',d=>{voiceRequestPending=false;micRaised=true;startVoiceMesh(d)})")) pass('client marks the room mic active immediately when the server grants it');
  else fail('room mic state is updated immediately on grant');
} catch (error) { fail('incoming call persistence checks', error.message); }

// Exit-room control matches the supplied door-arrow reference and keeps its action.
try {
  const html = fs.readFileSync(mainPath, 'utf8');
  if (html.includes('class="exitComposer" type="button" onclick="exitRoom()"') && html.includes('<svg viewBox="0 0 24 24"') && html.includes('M10.5 9.5H15V6.8L21 12l-6 5.2v-2.7h-4.5z') && html.includes('grid-template-columns:54px minmax(0,1fr) 48px 54px!important') && html.includes('linear-gradient(145deg,#183f5d,#0a2036)')) pass('exit-room button icon is updated while size, color and action remain unchanged');
  else fail('exit-room button reference redesign');
} catch (error) { fail('exit-room button regression checks', error.message); }

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.main === 'server.js' && pkg.scripts?.start === 'node server.js') pass('package entrypoint and start command');
  else fail('package entrypoint/start command');
  const dataPath=path.join(root,'data.json');
  if(fs.existsSync(dataPath)){JSON.parse(fs.readFileSync(dataPath,'utf8'));pass('data.json is valid JSON');}
  else pass('data.json intentionally omitted from update archive to preserve live site data; server creates defaults on a fresh install');
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
    ['direct rank assignment enforces hierarchy and generic role route is retired', source.includes("app.post('/api/admin/rank'") && source.includes('if(denyHigherRankTarget(actor,n,res))return') && !source.includes("app.post('/api/admin/role'") && !source.includes('role_assign')],
    ['additional member edits and removals enforce hierarchy', source.includes("app.patch('/api/admin/member-stats/:name',requireAuth,(req,res)=>{const n=accountKey(req.params.name);if(denyHigherRankTarget(req.user,n,res))return") && source.includes("app.put('/api/admin/account-permissions/:name'") && source.includes("if(action==='delete-user')") && source.includes("app.post('/api/admin/unban'") && source.includes('if(denyHigherRankTarget(req.user,name,res))return')],
    ['rank badge cannot be replaced by gift or VIP', source.includes('function denyBadgeForRank(name,p,res)') && source.includes('if(!hasActiveVisualRank(p))return false') && source.includes('لا يمكن استبدالها بهدية أو VIP')],
    ['member-action gifts replace rather than accumulate', source.includes("if(action==='gift')") && source.includes('p.gifts=[record]') && !source.includes('p.gifts.unshift(record)')]
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
  const levels = { 'super-red':400, 'super-white':500, 'super-black':600, 'crown-silver':700, 'crown-gold':800, 'admin-shield':900, 'admin-full':1000 };
  const simulate = new Function('levels', `const isOwner = user => !!user?.owner; const isOwnerName = name => name === 'site-owner'; const hasPermission = (user,p) => p==='permission_manage' && !!user?.fullAdmin; const coreRankLevelForName = name => levels[name] ?? null; ${source.match(/function higherRankTargetError\(actor,targetName\)\{[\s\S]*?\n\}/)[0]}; return higherRankTargetError;`)(levels);
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
  if (route && route[0].includes('previousAnnouncements') && route[0].includes('previousMessages') && route[0].includes("try{save()}catch(e)") && route[0].includes('publishAnnouncement(item)') && route[0].includes('scheduleAnnouncementExpiry(item)') && route[0].includes('schedulePermanentAnnouncement(item)') && source.includes("const ANNOUNCEMENT_INTERVAL_MS=15*60*1000") && source.includes("room:'__broadcast__'") && source.includes("io.emit('message',message)") && source.includes('function roomHistoryWithAnnouncements(roomId,viewer,createdAt=0)') && source.includes('roomHistoryWithAnnouncements(room,u,Number(u.created)||0)') && source.includes("title:item.title||'إعلان إداري'")) pass('site-wide announcement publication is atomic, live to all sessions, and timed from first publication');
  else fail('site-wide announcement delivery is persisted atomically and timed correctly');
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

// Unified rank/account permission edits are atomic; the duplicate generic role route is retired.
try {
 const source=fs.readFileSync(server,'utf8');
 const permissionRoute=source.slice(source.indexOf("app.put('/api/admin/permissions'"),source.indexOf("app.get('/api/admin/account-permissions'"));
 const accountRoute=source.slice(source.indexOf("app.put('/api/admin/account-permissions/:name'"),source.indexOf("app.get('/api/admin/welcome-messages'"));
 const rankRoute=source.match(/app\.post\('\/api\/admin\/rank',[\s\S]*?app\.get\('\/api\/admin\/member-ip/);
 if(source.includes("app.post('/api/admin/role'"))fail('obsolete generic role endpoint removed');else pass('obsolete generic role endpoint removed');
 if(permissionRoute.includes('const previous=[...(definition.permissions||[])]')&&permissionRoute.includes('definition.permissions=previous'))pass('rank permission edits roll back on persistence failure');else fail('rank permission edits roll back on persistence failure');
 if(accountRoute.includes('db.accountPermissions[key]=[...new Set(requested)]')&&accountRoute.includes('db.accountPermissions[key]=previous'))pass('per-account permission edits save exact replacement and roll back on failure');else fail('per-account permission edits save exact replacement and roll back on failure');
 if(rankRoute&&rankRoute[0].includes('previousProfile=JSON.parse(JSON.stringify(p))')&&rankRoute[0].includes('Rank assignment persistence failed:')&&rankRoute[0].includes('db.rankAudit=previousRankAudit')&&rankRoute[0].includes('previousNotifications'))pass('rank grants restore profile, audit history, and inbox notifications if persistence fails');else fail('rank grants restore profile, audit history, and inbox notifications if persistence fails');
} catch(error){fail('unified permission persistence checks',error.message)}

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
  for (const key of ['users_view','grant_likes','reset_likes','room_create','announcement_post','announcement_delete','member_status_manage','wall_delete_user']) {
    if (!permissionHtml.includes(key)) throw new Error(`missing client permission ${key}`);
  }
  if (!permissionHtml.includes("welcome:hasClientPermission('welcome_manage')")) throw new Error('welcome tab is not aligned with its permission');
  if (!permissionHtml.includes("can('profile_edit')") || !permissionHtml.includes("can('member_ip')")) throw new Error('member action buttons are not individually filtered');
  if (!permissionServer.includes('fromDisplayName:displayName(req.user.name)') || !permissionServer.includes('fromProfile:profile(req.user.name)')) throw new Error('gift sender identity is incomplete');
  if (permissionServer.includes("req.user.name+' (admin) هدية:")) throw new Error('gift sender name can still be duplicated');
  if (!permissionHtml.includes('rimaz-gift-alert-title') || !permissionHtml.includes('rimaz-gift-sender')) throw new Error('reference gift alert layout is missing');
  pass('v46.28 role-specific admin buttons and reference gift notice');
} catch (error) { fail('v46.28 admin visibility and gift notice checks', error.message); }


// v46.74: one seven-rank permission model + exact per-account overrides.
try {
 const src=fs.readFileSync(server,'utf8'),html=fs.readFileSync(mainPath,'utf8');
 const block=src.match(/function hasPermission\(user,permission\)\{[^}]*\}/)?.[0]||'';
 const api=src.slice(src.indexOf("app.get('/api/admin/permissions'"),src.indexOf("app.get('/api/admin/welcome-messages'"));
 const ui=html.slice(html.indexOf('async function adminRankPermissionEditor'),html.indexOf('function filterAdminTabs'));
 if(!src.includes("const RANK_PERMISSION_PROFILES=['admin-full','admin-shield','crown-gold','crown-silver','super-black','super-white','super-red'];"))throw new Error('the canonical seven ranks are not defined');
 if(ui.includes('المنصب الإداري العام (admin)')||ui.includes('منصب السوبر العام (super)')||ui.includes('منصب البنر العام (banner)'))throw new Error('obsolete generic role selectors remain');
 if(!api.includes("if(!RANK_PERMISSION_PROFILES.includes(rank))"))throw new Error('rank permissions API still accepts generic roles');
 if(!block.includes('effectivePermissionsForUser(user).has(permission)'))throw new Error('permission resolver is not using a single effective set');
 if(!src.includes('if(Array.isArray(accountSet))return new Set(accountSet.filter(p=>Object.hasOwn(PERMISSION_CATALOG,p)))'))throw new Error('per-account exact permission set missing');
 if(!ui.includes('هذا التخصيص يستبدل صلاحيات الرتبة لهذا الحساب وحده'))throw new Error('per-account exact override is not explained in the UI');
 if(!ui.includes('resetAccountPermissions'))throw new Error('reset-to-rank control missing');
 if(!src.includes("db.accountPermissions[key]=[...new Set(requested)]"))throw new Error('member permissions are not saved as an exact replacement');
 if(src.includes("if(p==='/api/admin/role')return 'role_assign'")||src.includes("role_assign:'تغيير المناصب الإدارية'"))throw new Error('obsolete generic role assignment still exists');
 pass('v46.74 seven-rank-only model and exact account-level permission overrides');
} catch(error) { fail('v46.74 permission architecture regression',error.message); }

// Runtime behavior: same rank inherits shared defaults; account override replaces them exactly.
try {
 const src=fs.readFileSync(server,'utf8');
 const fn=(src.match(/function effectivePermissionsForUser\(user\)\{[\s\S]*?\n\}/)?.[0]||'')+'\n'+(src.match(/function hasPermission\(user,permission\)\{[^}]*\}/)?.[0]||'');
 const db={accountPermissions:{second:['panel_access','kick_room']}};
 const profiles={first:{rank:'admin-full'},second:{rank:'admin-full'},limited:{rank:'super-red'},lowerFull:{rank:'super-red'}};
 const defs={'admin-full':{permissions:['panel_access','users_view','kick_room','permission_manage','site_admin']},'super-red':{permissions:['panel_access']}};
 const context={db,ALL_PERMISSION_KEYS:['panel_access','users_view','kick_room','permission_manage','site_admin'],PERMISSION_CATALOG:{panel_access:1,users_view:1,kick_room:1,permission_manage:1,site_admin:1},isOwner:u=>!!u.owner,profile:n=>profiles[n]||{},rankDefinition:id=>defs[id]||null,keyName:n=>String(n||'').toLowerCase(),Object};
 vm.runInNewContext(fn,context);const check=vm.runInNewContext('hasPermission',context);
 const first={name:'first'},second={name:'second'},limited={name:'limited'},owner={name:'owner',owner:true};
 if(!check(first,'site_admin')||!check(first,'permission_manage'))throw new Error('full rank does not inherit full permissions');
 if(check(second,'site_admin')||check(second,'permission_manage')||!check(second,'kick_room'))throw new Error('account override does not replace inherited permissions exactly');
 if(check(limited,'site_admin')||!check(limited,'panel_access'))throw new Error('lower rank baseline is incorrect');
 defs['super-red'].permissions=['panel_access','users_view','kick_room','permission_manage','site_admin'];const lowerFull={name:'lowerFull'};if(!check(lowerFull,'site_admin')||!check(lowerFull,'permission_manage'))throw new Error('a lower visual rank cannot receive the complete permission set');
 if(!check(owner,'site_admin'))throw new Error('owner unconditional permission boundary failed');
 pass('v46.74 runtime tests verify per-account restriction without affecting same-rank peers');
} catch(error) { fail('v46.74 runtime permission behavior',error.message); }

// Startup migration collapses generic roles into the seven-rank model and retires old stores.
try {
 const src=fs.readFileSync(server,'utf8');
 const start=src.indexOf('function migrateLegacyPermissionModel(){'),end=src.indexOf('migrateLegacyPermissionModel();',start)+'migrateLegacyPermissionModel();'.length;
 if(start<0||end<0)throw new Error('startup rank migration block not found');
 const normStart=src.indexOf('function normalizePermissionList('),normEnd=src.indexOf('const DEFAULT_RANK_PERMISSIONS',normStart);
 const migration=src.slice(normStart,normEnd)+'\n'+src.slice(start,end);
 const catalog={panel_access:1,users_view:1,site_admin:1,permission_manage:1,shortcuts_manage:1,smileys_manage:1,kick_room:1,room_create:1,room_edit:1,room_delete:1,room_lock:1,room_image_manage:1,gift_catalog_manage:1};
 const db={permissionModelVersion:0,users:{primary:{role:'admin'},second:{role:'admin'},oldSuper:{role:'super'},manual:{role:'member'}},guests:{},profiles:{primary:{rank:'admin-full'},second:{rank:'admin-full'},oldSuper:{rank:'none'},manual:{rank:'super-red'}},rankDefinitions:[{id:'admin-full',permissions:['panel_access'],updatedAt:1000},{id:'super-red',permissions:['panel_access'],updatedAt:1000}],rolePermissions:{admin:['panel_access','users_view','site_admin','permission_manage','rooms_manage','chat_tools_manage'],super:['panel_access','users_view','shortcuts_manage','smileys_manage']},rolePermissionMeta:{customized:{admin:true},updatedAt:{admin:2000}},permissionOverrides:{manual:['kick_room']},accountPermissions:{}};
 const profiles=db.profiles;const context={db,ALL_PERMISSION_KEYS:Object.keys(catalog),PERMISSION_CATALOG:catalog,RANK_PERMISSION_PROFILES:['admin-full','admin-shield','crown-gold','crown-silver','super-black','super-white','super-red'],profile:n=>profiles[n]||(profiles[n]={rank:'none'}),rankDefinition:id=>db.rankDefinitions.find(r=>r.id===id)||null,keyName:n=>String(n||'').toLowerCase(),save:()=>{context.saved=true},Date,Object,console};
 vm.runInNewContext(migration,context);
 if(db.users.primary.role!=='member'||db.users.second.role!=='member'||profiles.oldSuper.rank!=='super-red')throw new Error('legacy account roles were not folded into rank records');
 const migratedAdmin=db.rankDefinitions.find(r=>r.id==='admin-full').permissions;if(!migratedAdmin.includes('site_admin')||!migratedAdmin.includes('room_create')||!migratedAdmin.includes('shortcuts_manage')||!migratedAdmin.includes('smileys_manage'))throw new Error('generic role and umbrella permissions were not folded into rank 1');
 if(!Array.isArray(db.accountPermissions.manual)||!db.accountPermissions.manual.includes('kick_room'))throw new Error('legacy additive account permissions were not migrated to exact account permissions');
 if(db.rolePermissions!==undefined||db.rolePermissionMeta!==undefined||db.permissionOverrides!==undefined)throw new Error('legacy generic permission stores were not retired');
 pass('startup migration preserves existing access while retiring generic roles and permission stores');
} catch(error) { fail('startup seven-rank migration behavior',error.message); }

// v46.69 administration tools: persistent login history, owner-only settings and safe DB backup.
try {
  const src=fs.readFileSync(server,'utf8');
  const html=fs.readFileSync(mainPath,'utf8');
  const checks=[
    ['v46.69 stores bounded login history without raw full IP addresses',src.includes('loginHistory=db.loginHistory.slice(0,1000)')&&src.includes("split('.').slice(0,3).join('.')+'.0'")&&src.includes("recordLoginEvent(req,real,'member','normal')")],
    ['v46.69 site settings are owner/delegated-site-admin protected and registration/guest gates are server-enforced',src.includes("app.put('/api/admin/site-settings',requireAuth")&&src.includes("hasPermission(req.user,'site_admin')")&&src.includes('db.siteSettings?.allowRegistration===false')&&src.includes('db.siteSettings?.allowGuests===false')],
    ['v46.69 database backup is protected and excludes active sessions',src.includes("app.get('/api/admin/backup/database',requireAuth")&&src.includes('database:{...db,sessions:{}}')&&src.includes("app.get('/api/admin/login-history',requireAuth")],
    ['v46.69 delegated health diagnostics report database and uploads sizes without destructive actions',src.includes("app.get('/api/admin/health',requireAuth")&&src.includes('const uploads=walk(UP_DIR)')&&src.includes('heapUsed:memory.heapUsed')],
    ['v46.69 VIP grants support bounded durations and explicit revocation',src.includes('days<1||days>365')&&src.includes("app.post('/api/admin/vip/:name/revoke',requireAuth")&&src.includes('delete p.vipGrantedAt')],
    ['v46.69 owner admin UI includes settings, login history export and database backup',html.includes("adminTab('site')")&&html.includes('saveSiteSettings()')&&html.includes('exportLoginHistory()')&&html.includes('downloadDatabaseBackup()')&&html.includes('loadPublicSiteSettings()')],
  ];
  for(const [label,ok] of checks) ok?pass(label):fail(label);
  if(html===fs.readFileSync(publicPath,'utf8'))pass('v46.69 browser entry files remain identical');else fail('v46.69 browser entry files remain identical');
} catch(error){fail('v46.69 admin tools verification',error.message)}




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
  if (!permissionServer.includes('permissionSchemaVersion:8') || !permissionServer.includes('permissionKeys:ALL_PERMISSION_KEYS')) throw new Error('server permission schema metadata missing');
  if (!permissionHtml.includes("['الأدوات والإضافات الجديدة',['audit_view','stats_view','health_view','chat_filter_manage','member_status_manage','private_chat_override','presence_hidden_view','hidden_login','ghost_login','staff_notice','staff_media','voice_mic_override']]")) throw new Error('custom rank editor missing new permission group');
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
  if (!repairHtml.includes("welcome:hasClientPermission('welcome_manage')") || !repairHtml.includes("if(!allowedTabs[t])")) throw new Error('welcome editor is not gated by the exact welcome_manage permission');
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
  if(rankServer.includes("app.post('/api/admin/role'") || rankServer.includes("grant-admin") || rankServer.includes("grant-super") || rankServer.includes("grant-banner")) throw new Error('obsolete generic role promotion path remains');
  if(rankHtml.includes('.rimaz-rank-reference .rimaz-gift-alert-title{')) throw new Error('rank card overrides the agreed shared header sizing');
  if (rankHtml.includes('.rimaz-gift-ribbon') || rankHtml.includes('.rimaz-gift-burst') || rankHtml.includes('@keyframes rgGiftFloat') || rankHtml.includes('@keyframes rgRibbon')) throw new Error('unused legacy gift-animation rules remain');
  pass('v46.35 rank-grant notice is durably queued before the same gift-card renderer is triggered');
} catch (error) { fail('v46.34 rank-grant card checks', error.message); }

// v46.36: cancellable, real upload progress is scoped to private chat and wall only.
try {
  const mediaHtml = fs.readFileSync(mainPath, 'utf8');
  if (!mediaHtml.includes('xhr.upload.onprogress') || !mediaHtml.includes('function uploadMediaWithProgress(')) throw new Error('real upload progress handler is missing');
  if (!mediaHtml.includes('function cancelMediaUpload(') || !mediaHtml.includes('item.xhr?.abort()')) throw new Error('cancel button does not abort active upload');
  if (!mediaHtml.includes('function sharePrivate()') || !mediaHtml.includes('function wallMedia(kind)')) throw new Error('private or wall media upload entrypoint is missing');
  if (!mediaHtml.includes('onclick="openWallMediaFrom(this.parentElement)"') || !mediaHtml.includes('function openWallMediaFrom(')) throw new Error('wall media view button is missing');
  if (!mediaHtml.includes('عرض الصورة') || !mediaHtml.includes('عرض الفيديو') || !mediaHtml.includes('onclick="openPrivateMediaFrom(this.parentElement)"')) throw new Error('private image/video explicit view buttons are missing');
  const wallCardSource=(mediaHtml.match(/function wallCard\([\s\S]*?function postWall\(/)||[])[0]||'';
  const privateMediaSource=(mediaHtml.match(/async function addPrivateMedia\([\s\S]*?function openWallMediaFrom\(/)||[])[0]||'';
  if (/<(?:img|video)[^>]*class="(?:privateMediaPreview|wallMediaPreview)/i.test(wallCardSource+privateMediaSource)) throw new Error('private/wall renderer still embeds media previews that display immediately');
  if (!wallCardSource.includes('wallMediaView') || !privateMediaSource.includes('privateMediaView')) throw new Error('private/wall media explicit view controls are missing');
  if (!mediaHtml.includes('id="rimaz-wall-media-left-final"') || !mediaHtml.includes('margin:5px auto 5px 0!important')) throw new Error('wall media view button is not pinned to the left edge');
  const wallOpenSource=(mediaHtml.match(/async function openWall\([\s\S]*?function wallCard\(/)||[])[0]||'';
  if (!wallOpenSource.includes('class="overlay wallOverlay"')) throw new Error('wall overlay root is missing the wallOverlay class required by the left-alignment CSS');
  if (mediaHtml.includes('class="privateMediaPreview') || mediaHtml.includes('class="wallMediaPreview')) throw new Error('obsolete automatic private/wall media preview elements remain');
  if (mediaHtml.includes('class="privateMediaThumb') || mediaHtml.includes('class="wallMedia wallMediaOpen')) throw new Error('legacy click-anywhere media controls remain');
  if (!mediaHtml.includes('rimazUploadCancel') || !mediaHtml.includes('rimazUploadFill') || !mediaHtml.includes('wallMediaCard')) throw new Error('red progress strip or wall card is missing');
  pass('v46.38 private and wall media remain closed until explicit view button; no auto-preview elements');
} catch (error) { fail('v46.37 media view-card checks', error.message); }


// v46.44: a narrow blue marker follows each viewer's currently active room only.
try {
  const roomHtml = fs.readFileSync(mainPath, 'utf8');
  const roomRender = roomHtml.match(/async function openRooms\(\)[\s\S]*?function [A-Za-z_$][\w$]*\(/);
  if (!roomRender || !roomRender[0].includes("r.id===currentRoom?'room-current':''")) throw new Error('room list does not mark the viewer current room');
  if (!roomHtml.includes('id="rimaz-current-room-indicator-v1"') || !roomHtml.includes('.room.room-current::before')) throw new Error('slim current-room marker CSS is missing');
  if (!roomHtml.includes('left:0!important;top:0!important;bottom:0!important;width:4px!important')) throw new Error('current-room marker is not a slim full-height left-edge strip');
  if (!roomHtml.includes("aria-current=\"${r.id===currentRoom?'true':'false'}\"")) throw new Error('current-room state is not exposed accessibly');
  const deployedHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  if (roomHtml !== deployedHtml) throw new Error('public/index.html differs from index.html');
  pass('v46.44 current-room marker is per-viewer, slim, left-aligned, and layout-neutral');
} catch (error) { fail('v46.44 current-room marker checks', error.message); }

// v46.49: the member profile's room label is a single direct-navigation control.
try {
  const html = fs.readFileSync(mainPath, 'utf8');
  const checks = [
    ['member profile room control navigates using the member room ID', html.includes('onclick="openMemberRoom(${jsq(u.room)})"')],
    ['direct room navigation refreshes room data and resolves by exact room ID', html.includes("async function openMemberRoom(roomId)") && html.includes("api('/api/state')") && html.includes('String(r.id)===target') && html.includes('reenterRoom(room.id)')],
    ['member profile room badge is rebuilt as a black RTL strip with white room title and room image', html.includes('memberProfileRoomBadge') && html.includes('memberProfileRoomBadgeText') && html.includes('memberProfileRoomBadgeImage') && html.includes('background:#080808') && html.includes('color:#fff') && html.includes('profileRoom?.image')],
    ['users without an active room do not get a clickable room control', html.includes('memberProfileRoomUnavailable') && html.includes('غير موجود في غرفة') && html.includes('memberProfileRoomBadgeText')],
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
} catch (error) { fail('v46.49 member profile room navigation', error.message); }

// v46.58: incoming calls require explicit acceptance; room audio listeners remain receive-only until speaking;
// voice-room media remains on its own independent stream/peer graph.
try {
  const html = fs.readFileSync(mainPath, 'utf8');
  const callChecks = [
    ['private call remote stream is retained until audio/video element is ready', html.includes('let pc=null,localStream=null,callMode=\'voice\',callRemoteStream=null') && html.includes('function attachCallRemoteTrack(track)') && html.includes('if(callRemoteStream)attachCallRemote(callRemoteStream)')],
    ['private call ICE candidates are queued until remote description is installed', html.includes('const pendingCallIce=[]') && html.includes('async function flushCallIce()') && html.includes('if(!pc.remoteDescription){pendingCallIce.push(d.candidate);return}')],
    ['private calls separate remote audio from muted video to satisfy mobile autoplay', html.includes('id="remoteAudio"') && html.includes('video.muted=true') && html.includes('callRemoteVideoStream=new MediaStream()') && html.includes('callRemoteAudioStream=new MediaStream()') && html.includes('pc.ontrack=e=>')],
    ['incoming private calls show caller identity and explicit accept/reject before requesting device access', html.includes('function incomingCallCard(d)') && html.includes('function acceptIncomingCall()') && html.includes('function rejectIncomingCall()') && html.includes('fromProfile:d')===false && html.includes('pendingIncomingCall=d') && html.includes('await navigator.mediaDevices.getUserMedia') && html.includes('فتح الاتصال') && html.includes('إغلاق الاتصال')],
    ['private-call cleanup stops only private-call tracks and clears private-call ICE', html.includes('function endCall(showToast=true,notifyPeer=true)') && html.includes('pendingCallIce.length=0') && html.includes('pendingOutgoingCallIce.length=0')],
    ['voice room keeps independent local stream and peer map', html.includes('voiceLocalStream=null') && html.includes('const voicePeers=new Map()') && html.includes('function voicePeerConnection(peerSid)') && html.includes('async function receiveVoiceOffer(d){if(!d||d.room!==currentRoom)return;')],
    ['voice-room ICE candidates are buffered independently by peer and room', html.includes('const voicePeers=new Map(),pendingVoiceIce=new Map()') && html.includes('async function receiveVoiceIce(d)') && html.includes('pendingVoiceIce.set(peerSid,q)')],
    ['private call and room mic signaling do not share peer connections or local stream variables', html.includes('let pc=null,localStream=null') && html.includes('let micRaised=false,voiceMuted=false,voiceLocalStream=null') && html.includes('const voicePeers=new Map()')],
  ];
  for (const [label, ok] of callChecks) ok ? pass(label) : fail(label);
  const incomingHandler=html.match(/function handleOffer\(d\)\{[\s\S]*?\n/);
  const voiceOfferHandler=html.match(/async function receiveVoiceOffer\(d\)\{[\s\S]*?\n/);
  const serverVoiceOffer=fs.readFileSync(server,'utf8').match(/socket\.on\('voice-peer-offer',d=>[^\n]*/);
  const extraChecks=[
    ['incoming-call offer handler does not request microphone/camera before acceptance',!!incomingHandler&&!incomingHandler[0].includes('getUserMedia')&&incomingHandler[0].includes('pendingIncomingCall=d')],
    ['room listeners can negotiate receive-only WebRTC without opening their microphone',!!voiceOfferHandler&&!voiceOfferHandler[0].includes('!voiceLocalStream')&&voiceOfferHandler[0].includes('voiceOfferSent.add(d.from)')&&html.includes('audio.play().catch')],
    ['room voice signaling authorizes active speaker to send to any room member',!!serverVoiceOffer&&serverVoiceOffer[0].includes('speakers?.has(sid)')&&serverVoiceOffer[0].includes('members?.has(d.to)')],
    ['incoming call rejection and call termination are server-relayed',fs.readFileSync(server,'utf8').includes("socket.on('call-reject',d=>")&&fs.readFileSync(server,'utf8').includes("socket.on('call-end',d=>")],
    ['room audio output mute control is retained independently from microphone mute',html.includes('function toggleRoomSpeaker()')&&html.includes('function toggleVoiceMute()')&&html.includes('roomOutputMuted')],
    ['incoming call header places call type left and close control right',html.includes('direction:ltr;align-items:center;justify-content:space-between') && html.includes('.incomingCallTop{height:36px')],
    ['incoming call identity is avatar, rank, name, then caller status',html.includes('class=\"incomingCallTitleLine\"><span class=\"incomingCallRank\">${memberBadge(member)}</span><strong>') && html.includes('<small>يتصل بك الآن</small>')],
    ['incoming-call accept button is on the left and reject button is on the right',html.includes('.incomingCallActions{direction:ltr}')],
    ['private audio/video call panels are centered and medium-sized on mobile',html.includes('.call{inset:auto;left:50%;top:50%;transform:translate(-50%,-50%)') && html.includes('.call.cameraCall{width:min(390px,calc(100% - 36px));height:min(560px,calc(100% - 110px))}') && html.includes('.call.voiceCall{width:min(360px,calc(100% - 44px));height:min(340px,calc(100% - 140px))}')]
  ];
  for (const [label, ok] of extraChecks) ok ? pass(label) : fail(label);
  const deployedHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  if (html === deployedHtml) pass('v46.59 browser entry files remain identical');
  else fail('v46.59 browser entry files remain identical');
} catch (error) { fail('v46.58 private call and voice-room media isolation checks', error.message); }

// v46.61: private video calls have two-way media, local preview, camera switching and optional TURN.
try {
  const html = fs.readFileSync(mainPath, 'utf8');
  const serverText = fs.readFileSync(server, 'utf8');
  const videoChecks = [
    ['private video call renders live local and remote video elements', html.includes('id=\"remoteVideo\"') && html.includes('id=\"localVideo\"') && html.includes('function attachCallLocal(stream)')],
    ['private video call switches camera using verified opposite-facing device selection and sender replacement', html.includes('function switchCallCamera()') && html.includes('enumerateDevices()') && html.includes('deviceId:{exact:device.deviceId}') && html.includes('facingMode:{exact:direction}') && html.includes('facingMode:{ideal:direction}') && html.includes('validateCandidate(stream,avoidId,direction)') && html.includes('sender.replaceTrack(nextTrack)') && html.includes('switchCallCameraButton')],
    ['incoming video call installs remote offer before adding local tracks and creating answer', html.includes('await pc.setRemoteDescription(incoming.offer);await flushCallIce();addPrivateCallTracks(localStream);const answer=await pc.createAnswer()')],
    ['outgoing video call adds local tracks before creating offer', html.includes('addPrivateCallTracks(localStream);const offer=await pc.createOffer()')],
    ['private call obtains server ICE configuration and preserves STUN fallback', html.includes("api('/api/rtc-config')") && html.includes('function configureCallPeer(peerName,iceServers)')],
    ['server supports authenticated optional TURN configuration', serverText.includes("app.get('/api/rtc-config',requireAuth") && serverText.includes('process.env.TURN_URLS') && serverText.includes('process.env.TURN_USERNAME') && serverText.includes('process.env.TURN_CREDENTIAL')],
    ['camera-call dimensions remain at the previously approved medium size', html.includes('.call.cameraCall{width:min(390px,calc(100% - 36px));height:min(560px,calc(100% - 110px))}')],
    ['video call window remains absolutely positioned and centered', html.includes('.call.cameraCall{position:absolute;background:#080808}') && html.includes('.call{inset:auto;left:50%;top:50%;transform:translate(-50%,-50%)')],
    ['camera opens facing front and switch button initially targets rear camera', html.includes("callFacingMode='user'") && html.includes("video:{facingMode:{ideal:'user'}}") && html.includes('title="تبديل الكاميرا" aria-label="تبديل الكاميرا"') && html.includes('>⇄ الكاميرا الخلفية</button>')],
    ['camera switch button uses the arrow-swap glyph, not a circular glyph', html.includes("callFacingMode==='environment'?'⇄ الكاميرا الأمامية':'⇄ الكاميرا الخلفية'") && !html.includes('🔄 الكاميرا')],
  ];
  for (const [label, ok] of videoChecks) ok ? pass(label) : fail(label);
  const deployedHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  if (html === deployedHtml) pass('v46.61 browser entry files remain identical'); else fail('v46.61 browser entry files remain identical');
} catch (error) { fail('v46.61 private video-call repair checks', error.message); }


// v46.65: replace the unreliable camera-toggle selection path with verified direction-aware acquisition.
try {
  const html = fs.readFileSync(mainPath, 'utf8');
  const fn = (html.match(/async function switchCallCamera\(\)\{[\s\S]*?\n\}/)||[])[0]||'';
  const checks = [
    ['camera switch derives the target direction from the active camera settings', fn.includes("oldSettings.facingMode||callFacingMode||'user'") && fn.includes("oldFacing==='environment'?'user':'environment'")],
    ['camera switch prefers labelled opposite-facing devices without assuming device enumeration order', fn.includes('labelPattern.test(device.label||\'\')') && fn.includes('device.deviceId!==avoidId')],
    ['camera switch verifies the acquired track is not the currently active lens', fn.includes('validateCandidate(stream,avoidId,direction)') && fn.includes("settings.deviceId===avoidId") && fn.includes('settings.facingMode!==direction')],
    ['camera switch uses exact facing mode then a verified ideal fallback', fn.includes('facingMode:{exact:direction}') && fn.includes('facingMode:{ideal:direction}')],
    ['camera switch releases the old track only after an explicit hardware-busy error and retries', fn.includes("['NotReadableError','TrackStartError'].includes(firstError?.name)") && fn.includes('oldTrack.stop();oldTrackStopped=true') && fn.includes('await new Promise(resolve=>setTimeout(resolve,200))')],
    ['camera switch restores the original camera if the old capture had to be released', fn.includes('if(oldTrackStopped)') && fn.includes('Restore by previous camera ID failed') && fn.includes('await sender.replaceTrack(restoredTrack)')],
    ['camera switch keeps the existing video sender and changes only its camera track', fn.includes('await sender.replaceTrack(nextTrack)') && fn.includes('localStream.removeTrack(oldTrack)') && fn.includes('localStream.addTrack(nextTrack)')],
    ['camera toggle button text always reflects the next camera direction', fn.includes("callFacingMode==='environment'?'⇄ الكاميرا الأمامية':'⇄ الكاميرا الخلفية'")],
    ['private call and room-mic media variables remain isolated', html.includes('let pc=null,localStream=null') && html.includes('voiceLocalStream=null') && html.includes('const voicePeers=new Map()')],
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
  const deployedHtml = fs.readFileSync(publicPath, 'utf8');
  if (html === deployedHtml) pass('v46.65 browser entry files remain identical'); else fail('v46.65 browser entry files remain identical');
} catch (error) { fail('v46.65 camera switch regression checks', error.message); }

// v46.67: independently managed animated gift catalogue and GIF delivery pipeline.
try {
  const html = fs.readFileSync(mainPath, 'utf8');
  const serverText = fs.readFileSync(server, 'utf8');
  const giftPackPath = path.join(root, 'public', 'gifts-pack.json');
  const giftPack = JSON.parse(fs.readFileSync(giftPackPath, 'utf8'));
  const giftFiles = Object.keys(giftPack);
  const checks = [
    ['v46.81 ships all 115 supplied gift images in one packed catalogue', giftFiles.length === 115],
    ['v46.81 packed gift assets match their declared image MIME signatures', giftFiles.every(x => { const b=Buffer.from(giftPack[x].data,'base64'),t=giftPack[x].type; return t==='image/gif'?b.subarray(0,6).toString('ascii').startsWith('GIF8'):t==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):t==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:t==='image/webp'?b.subarray(0,4).toString('ascii')==='RIFF'&&b.subarray(8,12).toString('ascii')==='WEBP':false; })],
    ['v46.67 replaces old built-in gift arrays with server-managed catalogue', html.includes('const RIMAZ_GIFTS=[];const RIMAZ_EXTRA_GIFTS=[];const RIMAZ_NEW_GIFTS=[];') && html.includes('function giftCatalogAll(extra=[])')],
    ['v46.67 admin panel supports GIF upload and catalogue deletion', html.includes('uploadGiftToCatalog()') && html.includes('/api/admin/gifts/catalog/upload') && html.includes('deleteCatalogGift(${jsq(g.id)})')],
    ['v46.67 built-in gifts are served from a single packed JSON file', serverText.includes('GIFT_PACK_FILE') && serverText.includes("app.get('/gifts/:file'") && !fs.existsSync(path.join(root,'public','gifts'))],
    ['v46.67 server accepts only animated GIF gift uploads and validates frame count', serverText.includes("req.file.mimetype!=='image/gif'") && serverText.includes('gifFrames<2')],
    ['v46.67 sent gifts resolve image path from trusted server catalogue', serverText.includes("find(x=>String(x.id||'')===giftId)") && serverText.includes('giftImage')],
    ['v46.67 gift receipt animation renders the GIF image', html.includes('function showGiftAnimation(') && html.includes('giftArtLarge') && html.includes('d.giftImage||\'\'')],
    ['v46.81 manual gift uploads send the active session token', html.includes("fetch('/api/admin/gifts/catalog/upload',{method:'POST',headers:{'x-session':sid},body:form})")],
    ['v46.81 VIP gift pack is served independently and has an authenticated manual upload/delete UI', serverText.includes("app.get('/vip-gifts/:file'") && html.includes('uploadVipGiftToCatalog()') && html.includes('deleteVipCatalogGift(') && html.includes("category:'vip'")],
    ['v46.81 one-time migration replaces old catalogues with supplied standard and VIP packs', serverText.includes('db.giftCatalogV4Initialized!==true') && serverText.includes('db.giftCatalogV4Initialized=true') && serverText.includes('db.vipGiftCatalog=')],
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
  if (html === fs.readFileSync(publicPath, 'utf8')) pass('v46.67 browser entry files remain identical'); else fail('v46.67 browser entry files remain identical');
} catch (error) { fail('v46.67 animated gift catalogue checks', error.message); }



// v46.93: health diagnostics have a standalone granular rank permission.
try {
 const src=fs.readFileSync(server,'utf8'), html=fs.readFileSync(mainPath,'utf8');
 const checks=[
  ['health_view is a distinct permission in the server catalogue',src.includes("health_view:'مراقبة صحة الخادم واستهلاك الذاكرة'")],
  ['health API allows only owner, site_admin or health_view',src.includes("!hasPermission(req.user,'health_view')&&!hasPermission(req.user,'site_admin')")],
  ['health tab is shown only for owner or explicit health_view permission',html.includes("(me?.owner||hasClientPermission('health_view'))?`<button onclick=\"adminTab('health')\">🩺 صحة الخادم</button>`:''")&&html.includes("health:hasClientPermission('health_view')")&&html.includes("health:can('health_view')")],
  ['health monitor displays RSS, heap, external and Buffer metrics',html.includes('RAM الفعلية (RSS)')&&html.includes('Heap المستخدم')&&html.includes('ذاكرة خارج Heap')&&html.includes('Buffers')],
  ['health monitor permission is grouped in rank editor',html.includes("'stats_view','health_view','chat_filter_manage'")],
  ['health permission is removed from automatic full-admin grants and requires opt-in',src.includes('healthViewPermissionMigrationVersion||0)<2')&&src.includes("filter(permission=>permission!=='health_view')")&&src.includes("filter(key=>key!=='health_view')")&&src.includes('db.healthViewPermissionMigrationVersion=2')],
  ['health diagnostics expose V8 heap and external memory metrics',src.includes('heapTotal:memory.heapTotal,external:memory.external,arrayBuffers:memory.arrayBuffers||0')],
 ]; for(const [label,ok] of checks)ok?pass(label):fail(label);
} catch(error){fail('v46.93 health monitor permission checks',error.message)}

// v46.70: owner-managed built-in modules are persisted and enforced server-side.
try {
  const serverText = fs.readFileSync(server, 'utf8');
  const htmlText = fs.readFileSync(mainPath, 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const checks = [
    ['v46.93.4 package version is current', pkg.version === '46.93.4'],
    ['site module defaults preserve all existing features as enabled', serverText.includes("DEFAULT_SITE_MODULES={wall:true,privateChat:true,voiceRooms:true,videoCalls:true,gifts:true}") && serverText.includes('db.siteSettings.modules[key]=db.siteSettings.modules[key]!==false')],
    ['site settings API is owner/delegated-site-admin protected and persists only known module switches', serverText.includes("!isOwner(req.user)&&!hasPermission(req.user,'site_admin')") && serverText.includes('Object.keys(DEFAULT_SITE_MODULES)') && serverText.includes('modules[key]=b.modules[key]===true')],
    ['wall module is enforced on read, write, and like endpoints', serverText.includes("app.get('/api/wall',(req,res)=>")===false && serverText.includes("app.get('/api/wall',requireAuth,(req,res)=>{if(!siteModuleEnabled('wall'))") && serverText.includes("app.post('/api/wall',requireAuth,(req,res)=>{if(!siteModuleEnabled('wall'))") && serverText.includes("if(!siteModuleEnabled('wall'))return res.status(403)")],
    ['private chat module is enforced on history, contacts, media, and Socket.IO send', serverText.includes("app.get('/api/private/history',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))") && serverText.includes("app.get('/api/private/contacts',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))") && serverText.includes("socket.on('private-message',d=>{const u=socket.data.user;if(!u||!d?.to)return;if(!siteModuleEnabled('privateChat'))")],
    ['voice room module is enforced on join, mic requests, and peer signaling', serverText.includes("targetRoom.kind==='voice'&&!siteModuleEnabled('voiceRooms')") && serverText.includes("if(!siteModuleEnabled('voiceRooms'))return socket.emit('error-msg'") && serverText.includes("socket.on('voice-peer-offer',d=>{if(!siteModuleEnabled('voiceRooms'))return")],
    ['video-call module is enforced on call offer and answer', serverText.includes("socket.on('call-offer',d=>{if(!siteModuleEnabled('videoCalls'))") && serverText.includes("socket.on('call-answer',d=>{if(!siteModuleEnabled('videoCalls'))return")],
    ['gift module is enforced on send, upload, and catalogue deletion', serverText.includes("app.post('/api/admin/gift',(req,res)=>{requireAuth(req,res,()=>{if(!siteModuleEnabled('gifts'))") && serverText.includes("app.post('/api/admin/gifts/catalog/upload',requireAuth,uploadSmallImage.single('file'),validateUploadedContent('image'),(req,res)=>{if(!siteModuleEnabled('gifts'))") && serverText.includes("app.post('/api/admin/gifts/catalog/delete',requireAuth,(req,res)=>{if(!siteModuleEnabled('gifts'))")],
    ['admin UI exposes all five module switches and saves them', ['moduleWall','modulePrivateChat','moduleVoiceRooms','moduleVideoCalls','moduleGifts'].every(id=>htmlText.includes(id)) && htmlText.includes('saveSiteSettings()') && htmlText.includes('إدارة الإضافات والوحدات المدمجة')],
    ['mobile admin navigation has larger touch targets and bounded sticky scrolling', htmlText.includes('position:sticky;top:0;z-index:5;max-height:32vh;overflow-y:auto') && htmlText.includes('min-height:34px')],
    ['module flags are included in public settings and server health diagnostics', serverText.includes('modules:{...(s.modules||{})}') && serverText.includes('modules:{...DEFAULT_SITE_MODULES,...(db.siteSettings?.modules||{})}')],
    ['external executable plugin loading is intentionally not introduced', !serverText.includes('eval(') && !serverText.includes('new Function(')],
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
  if (htmlText === fs.readFileSync(publicPath, 'utf8')) pass('v46.70 browser entry files remain identical');
  else fail('v46.70 browser entry files remain identical');
} catch (error) { fail('v46.70 module administration checks', error.message); }


// v46.70.1: room operations and gift catalogue permissions are independently enforceable.
try {
  const serverText = fs.readFileSync(server, 'utf8');
  const htmlText = fs.readFileSync(mainPath, 'utf8');
  const checks = [
    ['room create, edit, delete, lock, and image permissions are separate catalog entries', ['room_create','room_edit','room_delete','room_lock','room_image_manage'].every(k=>serverText.includes(k+':'))],
    ['legacy room umbrella migrates to all individual room permissions', serverText.includes("if(set.has('rooms_manage')){for(const key of ['room_create','room_edit','room_delete','room_lock','room_image_manage'])set.add(key);set.delete('rooms_manage');}")],
    ['room route permission resolver distinguishes each operation', serverText.includes("if(p==='/api/admin/room'&&req.method==='POST')return 'room_create'") && serverText.includes("if(/\\/lock$/.test(p))return 'room_lock'") && serverText.includes("if(req.method==='PATCH')return 'room_edit'") && serverText.includes("return 'room_delete'")],
    ['gift catalogue upload and deletion require gift_catalog_manage separately from gift sending', serverText.includes("hasPermission(req.user,'gift_catalog_manage')") && serverText.includes("if(!hasPermission(req.user,'gifts'))return res.status(403)")],
    ['legacy gift permission migrates to preserve catalogue management access', serverText.includes("if(set.has('gifts'))set.add('gift_catalog_manage')")],
    ['room UI hides create/edit/delete/lock/image actions without their matching permissions', htmlText.includes("hasClientPermission('room_create')") && htmlText.includes("hasClientPermission('room_image_manage')") && htmlText.includes("hasClientPermission('room_lock')") && htmlText.includes("hasClientPermission('room_edit')") && htmlText.includes("hasClientPermission('room_delete')")],
    ['gift catalogue UI visibility uses its own permission', htmlText.includes("hasClientPermission('gift_catalog_manage')")],
    ['role permission editor exposes all room sub-permissions and separate gift catalogue control', ['room_create','room_edit','room_delete','room_lock','room_image_manage','gift_catalog_manage'].every(k=>htmlText.includes(k)) && htmlText.includes("['الغرف والرسائل والنقل',['room_create','room_edit','room_delete','room_lock','room_image_manage','messages_delete','room_move']]")],
    ['admin navigation filters the real tab buttons and recognizes granular room/gift access', htmlText.includes("document.querySelectorAll('.overlay.admin .tabs button')") && htmlText.includes("rooms:['room_create','room_edit','room_delete','room_lock','room_image_manage'].some(can)") && htmlText.includes("gifts:can('gifts')||can('gift_catalog_manage')||can('vip')")],
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
} catch (error) { fail('v46.70.1 granular permission checks', error.message); }



// v46.70.2: full owner-only backup streams database and private media in USTAR/GZIP.
// v46.71.0: database restore is owner-only, two-phase, bounded, and rollback-protected.
try {
  const serverText = fs.readFileSync(server, 'utf8');
  const htmlText = fs.readFileSync(mainPath, 'utf8');
  const checks = [
    ['restore preview and confirm routes support delegated site_admin while preserving owner in backup', serverText.includes("app.post('/api/admin/restore/database/preview',requireAuth") && serverText.includes("app.post('/api/admin/restore/database/confirm',requireAuth") && (serverText.match(/hasPermission\(req\.user,'site_admin'\)/g)||[]).length>=2 && serverText.includes("protectedOwnerName=process.env.OWNER_NAME||\'owner\'")],
    ['restore upload is memory-only and capped at 20MB', serverText.includes('multer.memoryStorage()') && serverText.includes('fileSize:20*1024*1024')],
    ['restore accepts only known versioned Rimaz JSON formats and validates schema', serverText.includes("['rimaz-database-backup','rimaz-full-backup']") && serverText.includes('function validateDatabaseRestoreFile') && serverText.includes('النسخة لا تحتوي البنية الأساسية لقاعدة بيانات ريماز') && serverText.includes('function restoreContainsOwner') && serverText.includes('النسخة لا تحتوي حساب صاحب الموقع')],
    ['restore preview uses a short-lived random token bound to the requesting admin', serverText.includes('crypto.randomBytes(32).toString(\'hex\')') && serverText.includes('expiresAt:Date.now()+5*60*1000') && serverText.includes('pending.owner!==keyName(req.user.name)')],
    ['restore confirmation requires exact Arabic phrase and creates recovery copy before atomic save', serverText.includes("confirmation!=='استعادة ريماز'") && serverText.includes(".pre-restore-") && serverText.includes('db=pending.database') && serverText.includes('db=previous')],
    ['restore clears sessions and disconnects active sockets', serverText.includes('db.sessions={};db.privateMessages=[];') && serverText.includes('io.disconnectSockets(true)')],
    ['admin UI previews counts and requires typed confirmation before restore', htmlText.includes('previewDatabaseRestore()') && htmlText.includes('confirmDatabaseRestore()') && htmlText.includes('استعادة ريماز') && htmlText.includes('accept=".json,application/json"')],
    ['browser entry files remain identical after restore UI update', fs.readFileSync(mainPath,'utf8')===fs.readFileSync(publicPath,'utf8')]
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
  const helperStart=serverText.indexOf('function validateDatabaseRestoreFile(buffer){');
  const helperEnd=serverText.indexOf('function purgeExpiredDatabaseRestores()',helperStart);
  let runtimeRestoreChecks=false;
  try{
    const helperSource=serverText.slice(helperStart,helperEnd);
    const defaultsFixture=()=>({users:{},guests:{},sessions:{old:'session'},messages:[],wall:[],wallEnabled:true,notifications:{},announcements:[],adminAuditLogs:[],loginHistory:[],ownerSetupCompleted:false,giftCatalogV3Initialized:false,smileysSeedVersion:0,smileysSeeded:false,rankDefinitions:[],siteSettings:{},chatFilter:{},welcomeMessages:[],profiles:{},lastLike:{},accountPermissions:{},rankAudit:[],giftCatalog:[],chatShortcuts:[],customSmileys:[],rooms:[],roomBans:{},roomMutes:{},roomKicks:{},globalBans:{},globalIpBans:{},wallLikes:{},wallComments:{},privateMessages:[{text:'ephemeral'}],privateHidden:{},privateRead:{},ignored:{}});
    const validate=vm.runInNewContext(helperSource+';validateDatabaseRestoreFile;',{Buffer,defaults:defaultsFixture});
    const database=defaultsFixture();database.users={Ali:{role:'owner'}};database.guests={Guest:{}};database.rooms=[{id:'public'}];database.messages=[{text:'hello'}];database.sessions={secret:'must-not-restore'};database.privateMessages=[{text:'not-persisted'}];
    const valid=validate(Buffer.from(JSON.stringify({format:'rimaz-database-backup',version:1,createdAt:'2026-01-01T00:00:00Z',appVersion:'test',database})));
    const badFormat=(()=>{try{validate(Buffer.from(JSON.stringify({format:'unknown',version:1,database})));return false;}catch(_){return true;}})();
    const badSchema=(()=>{try{validate(Buffer.from(JSON.stringify({format:'rimaz-database-backup',version:1,database:{users:[],guests:{},rooms:[],messages:[]}})));return false;}catch(_){return true;}})();
    runtimeRestoreChecks=valid.summary.members===1&&valid.summary.guests===1&&valid.summary.rooms===1&&valid.summary.messages===1&&Object.keys(valid.clean.sessions).length===0&&valid.clean.privateMessages.length===0&&badFormat&&badSchema;
  }catch(_){runtimeRestoreChecks=false;}
  runtimeRestoreChecks?pass('restore validator runtime fixtures accept valid backup, clear sessions, and reject bad format/schema'):fail('restore validator runtime fixtures');
} catch (error) { fail('v46.71.0 database restore checks', error.message); }


try {
  const serverText = fs.readFileSync(server, 'utf8');
  const htmlText = fs.readFileSync(mainPath, 'utf8');
  const checks = [
    ['full backup route supports delegated site_admin and streams gzip archive', serverText.includes("app.get('/api/admin/backup/full',requireAuth") && serverText.includes('source=Readable.from(fullBackupTar()),archive=zlib.createGzip') && serverText.includes('source.pipe(archive).pipe(res)')],
    ['full backup includes sanitized database snapshot, uploads, and private-media', serverText.includes("name:'database/rimaz-database.json'") && serverText.includes("['uploads',UP_DIR],['private-media',PRIVATE_MEDIA_DIR]") && serverText.includes('sessions:{}')],
    ['archive traversal skips symbolic links and streams file data instead of loading all media into RAM', serverText.includes('if(item.isSymbolicLink())continue') && serverText.includes('fs.createReadStream(entry.disk)')],
    ['admin page offers both database-only and full media backup downloads', htmlText.includes("downloadFullBackup()") && htmlText.includes("'/api/admin/backup/full'") && htmlText.includes('نسخة كاملة مع الصور والوسائط')],
  ];
  for (const [label, ok] of checks) ok ? pass(label) : fail(label);
  const start = serverText.indexOf('function tarOctal('), end = serverText.indexOf('// Owner-only site controls', start);
  if (start < 0 || end < 0) throw new Error('tar helper not found');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rimaz-backup-test-'));
  try {
    fs.mkdirSync(path.join(temp, 'uploads')); fs.mkdirSync(path.join(temp, 'private-media'));
    fs.writeFileSync(path.join(temp, 'uploads', 'sample.txt'), 'rimaz backup sample');
    const context = {Buffer,fs,path,Date,db:{users:{sample:{name:'sample'}},sessions:{secret:'must-not-export'}},UP_DIR:path.join(temp,'uploads'),PRIVATE_MEDIA_DIR:path.join(temp,'private-media'),require:(id)=>id==='./package.json'?{version:'test'}:require(id)};
    vm.runInNewContext(serverText.slice(start,end)+"\nthis.make=async()=>{const parts=[];for await(const part of fullBackupTar())parts.push(part);return Buffer.concat(parts)};",context);
    context.make().then(buf=>{
      const ok=buf.length%512===0&&buf.subarray(257,263).toString()==='ustar\0'&&buf.includes(Buffer.from('database/rimaz-database.json'))&&buf.includes(Buffer.from('uploads/sample.txt'))&&buf.includes(Buffer.from('rimaz backup sample'))&&!buf.includes(Buffer.from('must-not-export'));
      ok?pass('full backup USTAR stream includes media and excludes active session tokens'):fail('full backup USTAR stream content and alignment');
      fs.rmSync(temp,{recursive:true,force:true});
      if(failures.length){console.error(`\n${failures.length} verification check(s) failed.`);process.exitCode=1;}else console.log('\nAll local static and archive checks passed. Live-server testing is still required.');
    }).catch(error=>{fail('full backup USTAR stream test',error.message);fs.rmSync(temp,{recursive:true,force:true});process.exitCode=1;});
  } catch(error) { fs.rmSync(temp,{recursive:true,force:true}); throw error; }
} catch (error) { fail('v46.70.2 full backup checks', error.message); }


// v46.77.0: startup latency, private media memory, and voice-bar flash regressions.
try {
  const htmlText=fs.readFileSync(mainPath,'utf8');
  const checks=[
    ['v46.77.0 Socket.IO starts before optional chat-tools request',htmlText.includes("async function connect(){if(socket)socket.disconnect();socket=io();api('/api/chat-tools').then(")],
    ['v46.77.0 independent boot requests run concurrently and login polling stops after authentication',htmlText.includes("Promise.all([api('/api/notifications'),api('/api/private/contacts')])")&&htmlText.includes('clearInterval(window.rimazOnlineTimer)')],
    ['v46.77.0 private read receipt no longer refreshes the entire contacts list per message',htmlText.includes('async function markPrivateRead(name){')&&htmlText.slice(htmlText.indexOf('async function markPrivateRead(name){'),htmlText.indexOf('function countryName',htmlText.indexOf('async function markPrivateRead(name){'))).includes("api('/api/private/read'")&&!htmlText.slice(htmlText.indexOf('async function markPrivateRead(name){'),htmlText.indexOf('function countryName',htmlText.indexOf('async function markPrivateRead(name){'))).includes("api('/api/private/contacts'")],
    ['v46.77.0 private media object URLs are tracked and revoked on panel exit',htmlText.includes('const privateMediaObjectUrls=new Set()')&&htmlText.includes('URL.revokeObjectURL(url)')&&htmlText.includes("activeOverlay==='private'&&name!=='private'")&&htmlText.includes('privateMediaObjectUrls.add(objectUrl)')],
    ['v46.77.0 stale private media fetches are discarded after conversation changes',htmlText.includes('!document.contains(area)||!privateOpen||key(privateTo)!==conversationKey')&&htmlText.includes('URL.revokeObjectURL(objectUrl)')],
    ['v46.77.0 voice speaker strip starts hidden and cannot flash before room initialization',htmlText.includes('<div class="roombar" style="display:none" aria-hidden="true">')&&htmlText.includes('.chat .roombar[aria-hidden="true"]{display:none!important')],
    ['v46.77.0 trailing stylesheet is inside head and document has no content after html close',htmlText.indexOf('rimaz-private-video-call-media')<htmlText.indexOf('</head>')&&htmlText.slice(htmlText.indexOf('</html>')+7).trim()===''],
    ['v46.77.0 obsolete inline.js duplicate is removed and not referenced',!fs.existsSync(path.join(root,'inline.js'))&&!htmlText.includes('inline.js')],
    ['v46.77.0 browser entry files remain byte-identical',htmlText===fs.readFileSync(path.join(root,'public','index.html'),'utf8')]
  ];
  for(const [label,ok] of checks)ok?pass(label):fail(label);
}catch(error){fail('v46.77.0 performance and memory cleanup',error.message)}

// v46.73.1: explicitly delegated all-permissions ranks must expose all admin sections.
try {
  const src=fs.readFileSync(server,'utf8'); const html=fs.readFileSync(mainPath,'utf8');
  const checks=[
    ['permission_manage is grantable only through an explicit rank permission',!src.includes("if(permission==='permission_manage') return false;")&&src.includes("hasPermission(req.user,'permission_manage')")],
    ['legacy generic role profiles are migrated then removed',src.includes('const legacyRankMap={admin:\'admin-full\',super:\'super-red\',banner:\'crown-silver\'}')&&src.includes('delete db.rolePermissions;delete db.rolePermissionMeta;')],
    ['delegated permission editors cannot grant permissions they do not hold',src.includes('requested.some(p=>!own.has(p))')],
    ['site administration is a separate explicit permission',src.includes("site_admin:'إدارة الموقع الكاملة")&&html.includes("site:can('site_admin')")],
    ['site settings, login history, health, backups and restore honor site_admin', (src.match(/hasPermission\(req.user,'site_admin'\)/g)||[]).length>=6],
    ['permission editor exposes site_admin and permission_manage toggles',html.includes("['إدارة الموقع',['site_admin']]")&&html.includes("['الرتب والإدارة',['rank_assign','rank_art_manage','member_decoration_manage','permission_manage']]")],
    ['permission editor offers select-all and clear-all controls',html.includes('setAllRankPermissions(true)')&&html.includes('setAllRankPermissions(false)')],
    ['delegated permission editor is available to ranks explicitly granted permission_manage',html.includes("hasClientPermission('permission_manage')")&&html.includes("rankpermissions:can('permission_manage')")],
    ['site tab is shown to ranks explicitly granted site_admin',html.includes("hasClientPermission('site_admin')")],
    ['browser entry files remain identical',fs.readFileSync(mainPath,'utf8')===fs.readFileSync(path.join(root,'public','index.html'),'utf8')]
  ];
  for(const [label,ok] of checks) ok?pass(label):fail(label);
}catch(error){fail('v46.73.1 delegated permissions regression',error.message)}

// v46.75.0: rank art and member decoration are managed only through explicit permissions.
try {
  const src=fs.readFileSync(server,'utf8'),html=fs.readFileSync(mainPath,'utf8');
  const checks=[
    ['rank artwork manager can read rank labels without rank-assignment permission and does not receive permission arrays',src.includes('const canAssign=isOwner(req.user)||hasPermission(req.user,\'rank_assign\');const canArt=canManageRankArt(req.user);if(!canAssign&&!canArt)')&&src.includes('if(!canAssign)delete item.permissions;')],
    ['rank art and per-member decoration are independent permission keys',src.includes("rank_art_manage:'إدارة مكتبة أشكال الرتب وربطها بالرتب'")&&src.includes("member_decoration_manage:'تخصيص وإزالة زخرفة عضو محدد'")],
    ['rank art library upload validates supported image types and stores metadata',src.includes("/api/admin/rank-art/upload")&&src.includes("['image/gif','image/png','image/jpeg','image/webp']")&&src.includes('db.rankArtCatalog.push(item)')],
    ['rank artwork assignment is permission-gated and restricted to the seven ranks',src.includes("/api/admin/rank-art/assign")&&src.includes("hasPermission(req.user,'rank_art_manage')")&&src.includes('RANK_PERMISSION_PROFILES.includes(rank)')],
    ['rank art deletion clears references without deleting ranks or members',src.includes("app.delete('/api/admin/rank-art/:id'")&&src.includes('delete profileData.customDecorationImage')&&src.includes('delete rank.artUrl')],
    ['individual member decoration assignment is permission-gated and protects the owner',src.includes("/api/admin/member-decoration")&&src.includes("hasPermission(req.user,'member_decoration_manage')")&&src.includes('isOwnerName(n)')],
    ['rank and member artwork render beside names',html.includes('x.profile.rankArt')&&html.includes('x.profile.customDecorationImage')],
    ['rank artwork controls live in ranks tab while permission keys only gate access',html.includes('const artworkPanel=(canArt||canMemberDecor)?await adminRankArtManager():')&&html.includes("roles:can('rank_assign')||can('rank_art_manage')||can('member_decoration_manage')")&&html.includes("rankpermissions:can('permission_manage')")&&html.includes("roles:hasClientPermission('rank_assign')||hasClientPermission('rank_art_manage')||hasClientPermission('member_decoration_manage')")&&html.includes("rankpermissions:canManageRolePermissions()")&&!html.slice(html.indexOf('async function adminRankPermissionEditor'),html.indexOf('function setAllRankPermissions')).includes('adminRankArtManager()')],
    ['member profile exposes individual decoration picker only with its permission',html.includes("can('member_decoration_manage')")&&html.includes('openMemberDecorationPicker')],
    ['entry HTML files remain identical',fs.readFileSync(mainPath,'utf8')===fs.readFileSync(path.join(root,'public','index.html'),'utf8')]
  ];
  for(const [label,ok] of checks)ok?pass(label):fail(label);
}catch(error){fail('v46.75.0 rank artwork checks',error.message)}


// v46.76.0: subscription plans, ad campaigns, control center and granular permission wiring.
try {
 const src=fs.readFileSync(server,'utf8'), html=fs.readFileSync(mainPath,'utf8'), pkgNow=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const checks=[
  ['v46.76.0 one-time migration adds new permissions only to previously full-permission admin rank/accounts',src.includes('adminFeaturePermissionMigrationVersion')&&src.includes('previous.every(key=>(adminFull.permissions||[]).includes(key))')&&src.includes('previous.every(key=>permissions.includes(key))')],
  ['v46.76.0 subscription endpoints require subscriptions_manage',src.includes("subscriptions_manage:'إدارة خطط")&&src.includes("app.get('/api/admin/subscriptions'")&&src.includes("app.post('/api/admin/subscriptions/assign'")&&src.includes("app.post('/api/admin/subscriptions/cancel'")],
  ['subscription renewal extends from the later of now or current expiry',src.includes('const start=Math.max(now,Number(sub.expiresAt)||now)')],
  ['subscription plan VIP expiry is linked to the subscription and removed on cancellation',src.includes('memberProfile.vipSubscriptionId=sub.id')&&src.includes('memberProfile.vipSubscriptionId===sub.id')],
  ['ad campaign management validates image and URL and supports scheduling',src.includes("app.post('/api/admin/ads'")&&src.includes('endsAt<=startsAt')&&src.includes("/^https?:\\/\\//i.test(url)")&&src.includes("app.get('/api/public/ads'")],
  ['control center has independent permission-gated read/write routes',src.includes("app.get('/api/admin/control-center'")&&src.includes("app.put('/api/admin/control-center'")&&src.includes("hasPermission(req.user,'control_center_manage')")],
  ['new administration capabilities appear in rank permission editor',html.includes("'ads_manage'")&&html.includes("'subscriptions_manage'")&&html.includes("'control_center_manage'")],
  ['new admin tabs are visible only when their matching permissions are granted',html.includes("adminTab('ads')")&&html.includes("adminTab('subscriptions')")&&html.includes("adminTab('controlcenter')")&&html.includes("subscriptions:hasClientPermission('subscriptions_manage')")],
  ['both browser entry files are identical',fs.readFileSync(mainPath,'utf8')===fs.readFileSync(path.join(root,'index.html'),'utf8')],
  ['v46.76.1 Arabic welcome editor has add/delete/enable/save controls and uses existing permission-gated API',html.includes('async function welcomeMessagesEditor()')&&html.includes('function addWelcomeMessageRow()')&&html.includes('function removeWelcomeMessageRow(')&&html.includes('async function saveWelcomeMessages()')&&html.includes("else if(t==='welcome'){b.innerHTML=await welcomeMessagesEditor()}")&&src.includes("app.put('/api/admin/welcome-messages',requireAuth,(req,res)=>{if(!hasPermission(req.user,'welcome_manage'))")],
  ['both browser entry files are identical',fs.readFileSync(mainPath,'utf8')===fs.readFileSync(path.join(root,'public','index.html'),'utf8')],
  ['v46.87.0 package version',pkgNow.version==='46.93.4'],
  ['v46.82 standard gifts have unnumbered visible labels',Object.values(JSON.parse(fs.readFileSync(path.join(root,'public','gifts-pack.json'),'utf8'))).every(g=>g.name==='هدية')],
  ['v46.84 VIP catalogue is reset with a new migration version and the supplied asset',src.includes('vipGiftCatalogV7Initialized')&&src.includes("image:'/vip-gifts/vip-special.gif'")],
  ['v46.83 member-card gift picker loads both catalogues from the member-authorized endpoint',html.slice(html.indexOf('async function sendGift(n)'),html.indexOf('function renderGiftPicker()')).includes("d=await api('/api/chat-tools')")&&html.slice(html.indexOf('async function sendGift(n)'),html.indexOf('function renderGiftPicker()')).includes('d.vipGifts')&&!html.slice(html.indexOf('async function sendGift(n)'),html.indexOf('function renderGiftPicker()')).includes("/api/admin/data")&&src.includes("vipGifts:hasPermission(req.user,'gifts')?(db.vipGiftCatalog||[]):[]")],
  ['v46.83 member-card and admin gift send paths preserve gift category',html.includes("jsq(g.category||'gift')")&&html.includes("g.category||'gift')")&&html.includes("category:g.category||'gift'")],
  ['v46.84 obsolete VIP gift assignments are removed while VIP membership remains intact',src.includes('vipGiftCatalogV7Initialized')&&src.includes("String(g?.category||'')!=='vip'")&&src.includes("startsWith('/vip-gifts/')")&&!src.includes('delete profileData.vipUntil')],
  ['v46.87 default avatar uses the shared branded image and preserves custom avatars', html.includes("const DEFAULT_AVATAR_URL='/rimaz-default-avatar.png?v=46.91.0'") && html.includes('return custom||DEFAULT_AVATAR_URL') && !html.includes('data:image/svg+xml;charset=utf-8,' )],
  ['v46.87 obsolete text default-avatar markup and selectors are removed', !html.includes('defaultAvatar') && html.includes('function avatarLabel(profile)')],
  ['v46.90 one shared 20px gift badge size covers online, private, message, presence and wall surfaces', html.includes('rimaz-v46-90-unified-gift-badge-size') && html.includes('flex:0 0 20px!important;width:20px!important;height:20px!important') && html.includes('max-width:20px!important;max-height:20px!important') && html.includes('#layer .membersOverlay .member>.memberBadges .memberBadge.giftArtBadge{flex:0 0 20px!important;width:20px!important;height:20px!important;}')],
  ['v46.88 default avatar image is protected from cropping while custom avatar fallback remains intact', html.includes('img[src*="rimaz-default-avatar.png"]{object-fit:contain!important') && html.includes('return custom||DEFAULT_AVATAR_URL')],
  ['v46.84 VIP badge uses the supplied VIP artwork instead of the legacy crown-and-text badge',html.includes('class=\"vipRankArt\" src=\"/vip-gifts/vip-special.gif\"')&&!html.includes('class=\"vipCrown\" aria-hidden=\"true\">👑</span><b>VIP</b>')],
  ['v46.83 VIP packed asset matches its declared GIF signature',(()=>{const pack=JSON.parse(fs.readFileSync(path.join(root,'public/vip-gifts-pack.json'),'utf8'));const item=pack['vip-special.gif'];return !!item&&item.type==='image/gif'&&Buffer.from(item.data,'base64').subarray(0,6).toString('ascii').startsWith('GIF8')})()],
  ['v46.83 server validates gift IDs against the selected standard or VIP catalogue',src.includes("const sourceCatalog=category==='vip'?(db.vipGiftCatalog||[]):(db.giftCatalog||[])")],
  ['v46.84 member badge frames are removed across online, private, chat, wall and profile surfaces',html.includes('rimaz-v46-84-flat-badges-everywhere')&&html.includes('.privateListOverlay .member .memberBadge')&&html.includes('.wallPost .memberBadge')&&html.includes('border:0!important')],

  ['v46.80.6 member spacing has one final shared rule',html.includes('rimaz-member-avatar-rank-name-spacing-final-v1')],
  ['v46.80.6 obsolete private contact name override removed',!html.includes('rimaz-private-contact-name-next-to-badge')],
  ['v46.80.7 room creation button is compact and physically left aligned',html.includes('margin:4px auto 4px 4px;width:max-content')&&html.includes('font-size:15px')],
  ['v46.80.7 member avatar, badge and name use top alignment and a clear gap',html.includes('grid-template-columns:5px 54px 30px minmax(0,1fr) 58px!important')&&html.includes('column-gap:5px!important')&&html.includes('align-self:start!important;margin:0!important')],
  ['v46.80.8 login form is always shown on page load and no old session token auto-boots chat',html.includes('// Always show the entry screen on a fresh page load.')&&!html.includes('if(sid)boot();')&&html.includes("let sid='',me=null")],
  ['v46.80.8 successful login remembers username and password for prefilled fields',html.includes("localStorage.setItem('rimaz_saved_username'")&&html.includes("localStorage.setItem('rimaz_saved_password'")&&html.includes('value="${esc(remembered.password)}"')],
  ['v46.80.8 session token is tab-only and old persistent tokens are cleared',!html.includes("localStorage.setItem('rimaz_sid',sid)")&&html.includes("sessionStorage.setItem('rimaz_sid',sid)")&&html.includes("localStorage.removeItem('rimaz_sid')")],
  ['online-members rank and gift badge layout remains scoped and has room for the unified 20px gift',html.includes('rimaz-members-overlay-unified-layout-v1')&&html.includes('#layer .membersOverlay .member>.memberBadges{')&&html.includes('grid-template-columns:3px 44px auto minmax(0,1fr) 27px 22px!important')]
 ]; for(const [label,ok] of checks)ok?pass(label):fail(label);
} catch(error){fail('v46.76.0 feature checks',error.message)}


// v46.91: default profile artwork is fitted without crop and old profile-photo overrides are gone.
try {
  const htmlText = fs.readFileSync(mainPath, 'utf8');
  const profilePhotoRules = htmlText.match(/[^{}]*\.profilePhoto[^{}]*\{[^{}]*\}/gs) || [];
  const ok = profilePhotoRules.length === 1 &&
    htmlText.includes('rimaz-profile-default-avatar-fit-v4691') &&
    profilePhotoRules[0].includes('height:250px!important') &&
    profilePhotoRules[0].includes('object-fit:contain!important') &&
    profilePhotoRules[0].includes('[src*="rimaz-default-avatar.png"]');
  if (ok) pass('v46.91 default profile logo has one non-cropping 250px rule; legacy competing profilePhoto rules are removed');
  else fail('v46.91 default profile logo has one non-cropping 250px rule; legacy competing profilePhoto rules are removed');
} catch (error) { fail('v46.91 profile image fit checks', error.message); }


// v46.93.2: personal banners are independent and permission-gated.
try {
 const src=fs.readFileSync(server,'utf8'), html=fs.readFileSync(mainPath,'utf8');
 const checks=[
  ['v46.93.2 banner_upload is an independent permission in the server catalog',src.includes("banner_upload:'رفع وتغيير وحذف البنر الشخصي'")],
  ['v46.93.2 banner upload and deletion routes enforce banner_upload server-side',src.includes("app.post('/api/profile/banner',requireAuth,(req,res,next)=>{if(!hasPermission(req.user,'banner_upload'))")&&src.includes("app.delete('/api/profile/banner',requireAuth,(req,res)=>{if(!hasPermission(req.user,'banner_upload'))")],
  ['v46.93.2 banner images use validated image-only upload middleware',src.includes("'/api/profile/banner'")&&src.includes('uploadImage.single(\'file\'),validateUploadedContent(\'image\')')],
  ['v46.93.2 banners are separate from rank art and member decorations',src.includes('Personal banners are intentionally separate from rank artwork and member decorations')&&src.includes('p.banner=')],
  ['v46.93.2 rank permission editor exposes banner_upload',html.includes("['الملف الشخصي',['profile_edit','avatar_delete','banner_upload']]")],
  ['v46.93.2 authorized members can manage their personal banner and oversized images are compressed',html.includes('choosePersonalBanner')&&html.includes("canvas.toBlob(resolve,'image/webp',0.84)")&&html.includes('deletePersonalBanner')],
  ['v46.93.2 member information panel renders the personal banner',html.includes('memberPersonalBanner')&&html.includes('alt=\"بنر العضو\"')],
  ['v46.93.2 full-admin migration adds banner permission without broadening limited ranks',src.includes('bannerUploadPermissionMigrationVersion')&&src.includes("previous.every(key=>(adminFull.permissions||[]).includes(key))")],
  ['v46.93.2 browser entry files remain identical',fs.readFileSync(mainPath,'utf8')===fs.readFileSync(path.join(root,'public','index.html'),'utf8')]
 ]; for(const [label,ok] of checks)ok?pass(label):fail(label);
} catch(error){fail('v46.93.2 personal banner checks',error.message)}
