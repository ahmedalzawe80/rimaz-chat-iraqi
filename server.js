const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 12 * 1024 * 1024 });

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const INDEX_CANDIDATES = [path.join(ROOT, 'index.html'), path.join(ROOT, 'public', 'index.html')];
const INDEX_FILE = INDEX_CANDIDATES.find(file => fs.existsSync(file));
if (!INDEX_FILE) console.error('FATAL: index.html is missing. Expected /app/index.html or /app/public/index.html');
// Prefer persistent hosting storage. Never silently fall back to /tmp: that can
// make existing accounts appear to disappear after a restart/redeploy.
let DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data/rimaz' : path.join(ROOT, 'data'));
// A legacy deployment may still have DATA_DIR=/app/data, which is not the
// persistent mount on Deplexo. If the mount exists and the configured path
// cannot be created, use the persistent mount rather than ephemeral storage.
let UP_DIR = path.join(DATA_DIR, 'uploads');
let DB_FILE = path.join(DATA_DIR, 'data.json');
try { fs.mkdirSync(UP_DIR, { recursive: true }); }
catch (err) {
  if (fs.existsSync('/data')) {
    const persistentDir = '/data/rimaz';
    try {
      fs.mkdirSync(path.join(persistentDir, 'uploads'), { recursive: true });
      console.error(`Cannot create configured data directory ${DATA_DIR}: ${err.message}. Using persistent mount ${persistentDir}.`);
      DATA_DIR = persistentDir;
      UP_DIR = path.join(DATA_DIR, 'uploads');
      DB_FILE = path.join(DATA_DIR, 'data.json');
    } catch (persistentErr) {
      console.error(`Cannot initialize persistent data directory ${persistentDir}: ${persistentErr.message}`);
      throw persistentErr;
    }
  } else {
    console.error(`Cannot initialize data directory ${DATA_DIR}: ${err.message}`);
    throw err;
  }
}

app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(self), microphone=(self), geolocation=()');if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');next();});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UP_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(ROOT, 'public')));
// Serve the approved single-file UI at the site root without changing its design.
app.get('/', (req, res) => { if (!INDEX_FILE) return res.status(500).send('Rimaz setup error: index.html is missing from the deployment package.'); res.sendFile(INDEX_FILE); });

const defaults = () => ({
  users: {}, guests: {}, sessions: {}, messages: [], wall: [], notifications: {}, announcements: [], welcomeMessages: [
    {id:'welcome-visitors',title:'دردشة ريماز عراقية',text:'إعزإئنا زوإر (دردشة ريماز عراقية)\nحياَكم الله منـورين الشاَت . الاعضاء الجدد نتمنيُ لكم اوقاَت سعيده',enabled:true},
    {id:'welcome-search',title:'الترحيب',text:'عزيزي الزائر للرجوع الينا اكتب في محرك البحث ( دردشة ريماز عراقية )\nنتمنا لكم وقت ممتعا',enabled:true}
  ],
  profiles: {}, lastLike: {}, permissionOverrides: {}, rolePermissions: {}, rankAudit: [],
  rooms: [
    { id:'public', name:'الغرفة العامة', desc:'غرفة عامة ..', kind:'public', capacity:200, mics:0, owner:'admin' },
    { id:'friends', name:'غرفة الأصدقاء', desc:'غرفة خاصة ..', kind:'private', capacity:100, mics:0, owner:'admin' },
    { id:'love', name:'غرفة الحب', desc:'غرفة خاصة ..', kind:'private', capacity:100, mics:0, owner:'admin' },
    { id:'voice', name:'غرفة الصوت', desc:'مايك ..', kind:'voice', capacity:50, mics:8, owner:'admin' },
    { id:'admin-room', name:'غرفة الإدارة', desc:'غرفة الإدارة ..', kind:'private', capacity:100, mics:0, owner:'admin', theme:'black' }
  ],
  roomBans:{}, roomMutes:{}, roomKicks:{}, globalBans:{}, globalIpBans:{},
  wallLikes:{}, wallComments:{}, privateMessages:[], privateHidden:{}, privateRead:{}, ignored:{}
});

let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = defaults(); }
for (const [k,v] of Object.entries(defaults())) if (db[k] === undefined) db[k] = v;
// Ensure the agreed administration room exists on older saved databases.
if(!Array.isArray(db.rooms)) db.rooms=[];
if(!db.rooms.some(r=>r.id==='admin-room')) db.rooms.push({id:'admin-room',name:'غرفة الإدارة',desc:'غرفة الإدارة ..',kind:'private',capacity:100,mics:0,owner:'admin',theme:'black'});
for(const r of db.rooms){if(r.id==='public')r.theme='black';else if(r.id!=='admin-room')r.theme='red';}
if(!Array.isArray(db.welcomeMessages) || db.welcomeMessages.length===0) db.welcomeMessages=defaults().welcomeMessages;
// Migrate the earlier placeholder/default greeting set to the agreed editable pair,
// while preserving any genuinely customized messages.
const agreedWelcomeDefaults=defaults().welcomeMessages;
const legacyWelcomeTexts=new Set(['إدارة ريماز ترحب بالأعضاء الداخلين','أهلاً وسهلاً بكم في دردشة ريماز عراقية']);
if(Array.isArray(db.welcomeMessages) && db.welcomeMessages.length && db.welcomeMessages.every(m=>legacyWelcomeTexts.has(String(m.text||'').trim()))) db.welcomeMessages=agreedWelcomeDefaults;
// If the saved set is the old default pair, replace it with the approved default text.
if(Array.isArray(db.welcomeMessages) && db.welcomeMessages.length===2 && db.welcomeMessages.some(m=>String(m.text||'').includes('إدارة ريماز ترحب'))) db.welcomeMessages=agreedWelcomeDefaults;
try { save(); } catch(e) { console.error('Could not persist welcome-message defaults/migration:',e.message); }
// Remove expired timed announcements after restarts; expiry is stored with the announcement.
const expiredAnnouncementIds=new Set((db.announcements||[]).filter(a=>a&&a.duration==='5m'&&Number(a.at)+300000<=Date.now()).map(a=>String(a.id)));
if(expiredAnnouncementIds.size){db.announcements=(db.announcements||[]).filter(a=>!expiredAnnouncementIds.has(String(a.id)));db.messages=(db.messages||[]).filter(m=>![...expiredAnnouncementIds].some(id=>String(m.id||'').startsWith(id+'-')));try{fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2))}catch(e){console.error('Could not clean expired announcements:',e.message)}}
// Normalize legacy saved role permissions at startup so old arrays cannot invert rank hierarchy.
const ROLE_PERMISSION_CEILINGS={super:['panel_access','users_view'],banner:['panel_access','users_view','moderation','messages_delete','gifts','announcements'],admin:['panel_access','users_view','moderation','messages_delete','gifts','announcements','rooms_manage','vip','profile_edit','avatar_delete','grant_likes','role_assign','rank_assign','permission_manage','member_ip','reset_likes']};
const RANK_PERMISSION_PROFILES=['admin-full','super-red','super-white','super-black','crown-silver','crown-gold','admin-shield'];
const RANK_BASE_ROLE={'admin-full':'admin','super-red':'super','super-white':'super','super-black':'super','crown-silver':'banner','crown-gold':'banner','admin-shield':'admin'};
const PROTECTED_ROLE_PERMISSIONS=['permission_manage','member_ip']; // Owner-only capabilities; ADMIN-full may view IP and manage permissions when explicitly enabled.
db.rolePermissions=db.rolePermissions||{};
db.rolePermissionMeta=db.rolePermissionMeta||{customized:{}};
db.rolePermissionMeta.customized=db.rolePermissionMeta.customized||{};
for(const role of Object.keys(ROLE_PERMISSION_CEILINGS)) if(Array.isArray(db.rolePermissions[role])) db.rolePermissions[role]=[...new Set(['panel_access',...db.rolePermissions[role].filter(p=>Object.hasOwn({panel_access:1,users_view:1,moderation:1,messages_delete:1,gifts:1,announcements:1,rooms_manage:1,vip:1,profile_edit:1,avatar_delete:1,grant_likes:1,role_assign:1,rank_assign:1,permission_manage:1,member_ip:1,reset_likes:1},p))])];
function save(){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function scheduleAnnouncementExpiry(item){if(!item||item.duration!=='5m'||!item.id)return;const delay=Math.max(0,Number(item.at||Date.now())+300000-Date.now());setTimeout(()=>{const id=String(item.id);db.announcements=(db.announcements||[]).filter(a=>String(a.id)!==id);const removed=(db.messages||[]).filter(m=>String(m.id||'').startsWith(id+'-'));db.messages=(db.messages||[]).filter(m=>!String(m.id||'').startsWith(id+'-'));for(const m of removed)io.emit('message-deleted',{id:m.id});try{save()}catch(e){console.error('Announcement expiry save failed:',e.message)}},delay).unref?.();}
for(const item of (db.announcements||[])) scheduleAnnouncementExpiry(item);

const sessions = new Map(); // sid -> {name,type,created}
for (const [sid,s] of Object.entries(db.sessions||{})) sessions.set(sid,s);
const roomSockets = new Map();
const socketUsers = new Map();
// Send configured welcome cards only once per authenticated session, not on every room change.
const welcomeSentSessions = new Set();
// Per-room raised-mic state (not shared across rooms).
const voiceSpeakers = new Map();
function emitVoiceState(room){ const r=db.rooms.find(x=>x.id===room); if(!r||r.kind!=='voice')return; const speakers=[...(voiceSpeakers.get(room)||new Map()).values()]; io.to(room).emit('voice-state',{room,speakers,count:speakers.length,limit:Number(r.mics)||8}); }
const guestDisconnectTimers = new Map();

function cleanName(v){ return String(v||'').trim().replace(/\s+/g,' ').slice(0,32); }
function keyName(n){ return cleanName(n).toLowerCase(); }
function isOwnerName(name){ const n=keyName(name); return n==='owner' || (!!process.env.OWNER_NAME && n===keyName(process.env.OWNER_NAME)); }
function roleOf(u){ if(!u)return 'member'; const n=keyName(u.name); if(isOwnerName(n))return 'owner'; if(n==='admin' || n===keyName(process.env.ADMIN_NAME||'admin'))return 'admin'; const valid=['member','super','banner','admin']; const member=getUser(u.name); if(member){const r=String(member.role||u.role||'member');return valid.includes(r)?r:'member';} const guest=getGuest(u.name); if(guest){const r=String(guest.role||u.role||'member');return valid.includes(r)?r:'member';} const r=String(u.role||'member'); return valid.includes(r)?r:'member'; }
function canMessageClosedPrivate(u){if(!u)return false;if(isOwner(u))return true;const role=roleOf(u);if(role==='admin')return true;const p=profile(u.name);return p?.rank==='admin-shield'&&(!p.rankUntil||Number(p.rankUntil)>Date.now());}
function isOwner(u){return roleOf(u)==='owner'}
function isAdmin(u){return ['owner','admin'].includes(roleOf(u))}
function isStaff(u){return ['owner','admin','super','banner'].includes(roleOf(u))}
function findKey(obj,name){ const wanted=keyName(name); return Object.keys(obj||{}).find(k=>keyName(k)===wanted); }
function getUser(name){ const k=findKey(db.users,name); return k ? db.users[k] : null; }
function getGuest(name){ const k=findKey(db.guests,name); return k ? db.guests[k] : null; }
function accountKey(name){ return findKey(db.users,name) || findKey(db.guests,name) || cleanName(name); }
function userLikes(u){ if (!u) return 0; if (isAdmin(u)) return 999999; return Number(getUser(u.name)?.likes ?? getGuest(u.name)?.likes ?? u.likes ?? 0); }
function level(l){ l=Number(l)||0; return l>=500?3:l>=400?2:1; }
function canNotice(u){ return isStaff(u) || userLikes(u)>=400; }
function canMedia(u){ return isStaff(u) || userLikes(u)>=500; }
function vipActive(name){ const p=profile(name); if(p.vipUntil&&p.vipUntil>Date.now()) return true; if(p.vipUntil){delete p.vipUntil; save();} return false; }
function defaultStatus(name){ return getGuest(name) ? '(غير مسجل)' : '(عضو جديد)'; }
function profile(name){
  if (!db.profiles[name]) db.profiles[name]={displayName:cleanName(name),avatar:'',status:defaultStatus(name),bio:'عضو في دردشة ريماز عراقية',nameColor:'#222222',fontColor:'#222222',bgColor:'#ffffff',privateOpen:true,notificationsOpen:true};
  const p=db.profiles[name];
  if(!p.displayName) p.displayName=cleanName(name);
  // Expire temporary visual ranks without changing the existing badge artwork or staff role.
  if(p.rankUntil && Number(p.rankUntil)<=Date.now()) { const expiredRank=p.rank; const account=getUser(name)||getGuest(name); if(account&&RANK_BASE_ROLE[expiredRank]&&String(account.role||'member')===RANK_BASE_ROLE[expiredRank]) account.role='member'; p.rank='none'; delete p.rankUntil; save(); }
  // Never let the old automatic status survive as a default. Custom statuses remain untouched.
  if(!p.status || p.status==='متصل الآن' || p.status==='زائر جديد' || p.status==='غير مسجل' || p.status==='عضو جديد') p.status=defaultStatus(name);
  if(!p.fontColor) p.fontColor=p.nameColor||'#222222';
  return p;
}
// Migrate the old automatic status to the new type-specific default, while keeping custom statuses.
let statusMigrated=false;
for (const name of Object.keys(db.profiles||{})) {
  const p=db.profiles[name];
  if(p && (!p.status || p.status==='متصل الآن' || p.status==='زائر جديد' || p.status==='غير مسجل' || p.status==='عضو جديد')) { const next=defaultStatus(name); if(p.status!==next){p.status=next; statusMigrated=true;} }
}
if(statusMigrated) save();
function displayName(name){ return profile(name).displayName || cleanName(name); }
function sessionUser(sid){ const s=sessions.get(sid); if(!s)return null; const role=roleOf(s); return {...s, role, owner:isOwner(s), admin:isAdmin(s), staff:isStaff(s), panelAccess:isOwner(s)||hasPermission(s,'panel_access'), vip:vipActive(s.name), likes:isAdmin(s)?999999:userLikes(s)}; }
function makeSession(name,type){
  const sid=crypto.randomBytes(24).toString('hex');
  const s={name,type,created:Date.now()}; sessions.set(sid,s); db.sessions[sid]=s; save(); return sid;
}
function requireAuth(req,res,next){
  const u=sessionUser(req.get('x-session')); if(!u)return res.status(401).json({error:'يجب تسجيل الدخول'}); req.user=u; next();
}
const PERMISSION_CATALOG = {
  panel_access:'فتح لوحة التحكم', users_view:'عرض الأعضاء', moderation:'الطرد والحظر والكتم',
  messages_delete:'حذف الرسائل', rooms_manage:'إدارة الغرف', announcements:'نشر وحذف الإعلانات',
  gifts:'إرسال الهدايا', vip:'منح VIP', profile_edit:'تعديل ألوان الملف الشخصي',
  avatar_delete:'حذف الصور', grant_likes:'منح اللايكات', role_assign:'تغيير المناصب الإدارية',
  rank_assign:'منح الشارات ومدتها', permission_manage:'تعديل صلاحيات الرتب', member_ip:'عرض IP',
  reset_likes:'تصفير اللايكات'
};
// Permissions are tiered: super < banner < admin. Existing saved custom arrays
// are intersected with each role's ceiling so old settings cannot invert hierarchy.
const DEFAULT_ROLE_PERMISSIONS = {
  // Legacy roles remain for compatibility; visual ranks each have independent defaults below.
  super:['panel_access','users_view'],
  banner:['panel_access','users_view','moderation','messages_delete','gifts','announcements'],
  admin:['panel_access','users_view','moderation','messages_delete','gifts','announcements','rooms_manage','vip','profile_edit','avatar_delete','grant_likes','role_assign','rank_assign','permission_manage','member_ip','reset_likes'],
  'super-red':['panel_access','users_view'],
  'super-white':['panel_access','users_view','moderation'],
  'super-black':['panel_access','users_view','moderation','messages_delete'],
  'crown-silver':['panel_access','users_view','moderation','messages_delete','gifts'],
  'crown-gold':['panel_access','users_view','moderation','messages_delete','gifts','announcements'],
  'admin-shield':['panel_access','users_view','moderation','messages_delete','gifts','announcements','rooms_manage','vip','profile_edit','avatar_delete','grant_likes','reset_likes'],
  'admin-full':['panel_access','users_view','moderation','messages_delete','gifts','announcements','rooms_manage','vip','profile_edit','avatar_delete','grant_likes','role_assign','rank_assign','permission_manage','member_ip','reset_likes'],
  member:[]
};
// Migrate legacy rank profiles that were saved with only the first two basic permissions.
// Preserve any profile that already contains a richer custom selection.
let rankPermissionMigrationChanged=false;
for(const rank of RANK_PERMISSION_PROFILES){
  const defaults=DEFAULT_ROLE_PERMISSIONS[rank]||[];
  const saved=db.rolePermissions[rank];
  // Apply new default profiles once unless the owner explicitly customized this rank.
  if(!db.rolePermissionMeta.customized[rank] && (!Array.isArray(saved) || JSON.stringify([...new Set(saved)].sort())!==JSON.stringify([...new Set(defaults)].sort()))){
    db.rolePermissions[rank]=[...defaults];
    rankPermissionMigrationChanged=true;
  } else if(!Array.isArray(saved)) {
    db.rolePermissions[rank]=[...defaults];
    rankPermissionMigrationChanged=true;
  }
}
if(rankPermissionMigrationChanged) save();
function hasPermission(user, permission){
  if(isOwner(user)) return true;
  const role=roleOf(user);
  const p=user?.name?profile(user.name):null;
  const rank=p&&p.rank&&(!p.rankUntil||Number(p.rankUntil)>Date.now())?p.rank:null;
  const rankRole=rank&&RANK_BASE_ROLE[rank]?rank:null;
  // The named admin account keeps its admin baseline even if it wears a visual rank.
  // A custom rank may add permissions; it must not silently remove the admin panel tabs.
  if(role==='admin'){
    const adminCustom=Array.isArray(db.rolePermissions?.admin)?db.rolePermissions.admin:null;
    const adminDefaults=DEFAULT_ROLE_PERMISSIONS.admin||[];
    const rankCustom=rankRole&&Array.isArray(db.rolePermissions?.[rankRole])?db.rolePermissions[rankRole]:null;
    const rankDefaults=rankRole?(DEFAULT_ROLE_PERMISSIONS[rankRole]||[]):[];
    const adminAllowed=adminCustom===null?adminDefaults:adminCustom;
    const rankAllowed=rankRole?(rankCustom===null?rankDefaults:rankCustom):[];
    // A named admin must always be able to open the panel and view members;
    // legacy/custom permission arrays must not lock the administrator out.
    if(permission==='panel_access'||permission==='users_view') return true;
    return adminAllowed.includes(permission)||rankAllowed.includes(permission);
  }
  if(PROTECTED_ROLE_PERMISSIONS.includes(permission)) return false;
  if(!rankRole&&!['super','banner'].includes(role)) return false;
  if(permission==='panel_access') return true;
  const profileKey=rankRole||role;
  const custom=db.rolePermissions&&Array.isArray(db.rolePermissions[profileKey])?db.rolePermissions[profileKey]:null;
  const allowed=rankRole?(DEFAULT_ROLE_PERMISSIONS[rankRole]||[]):(DEFAULT_ROLE_PERMISSIONS[role]||[]);
  return (custom===null ? allowed.includes(permission) : custom.includes(permission));
}
function requirePermission(permission){return (req,res,next)=>requireAuth(req,res,()=>hasPermission(req.user,permission)?next():res.status(403).json({error:'ما عندك صلاحية لهذا الإجراء'}));}
function permissionForAdminPath(req){
 const p=req.path;
 if(p==='/api/admin/data')return 'panel_access';
 if(p==='/api/admin/role')return 'role_assign';
 if(p==='/api/admin/rank')return 'rank_assign';
 if(p==='/api/admin/permissions')return 'permission_manage';
 if(p.startsWith('/api/admin/member-ip/'))return 'member_ip';
 if(p==='/api/admin/reset-likes')return 'reset_likes';
 if(p==='/api/admin/grant-like')return 'grant_likes';
 if(p==='/api/admin/broadcast'||p.startsWith('/api/admin/announcement/'))return 'announcements';
 if(p.startsWith('/api/admin/message/'))return 'messages_delete';
 if(p.startsWith('/api/admin/room'))return 'rooms_manage';
 if(p.startsWith('/api/admin/profile/'))return 'profile_edit';
 if(p.startsWith('/api/admin/avatar/'))return 'avatar_delete';
 if(p==='/api/admin/gift-vip')return 'vip';
 if(p==='/api/admin/gift')return 'gifts';
 if(p==='/api/admin/grant-like')return 'grant_likes';
 return 'panel_access';
}
function requireAdmin(req,res,next){ requireAuth(req,res,()=>{const permission=permissionForAdminPath(req);if(hasPermission(req.user,permission))return next();return res.status(403).json({error:'ما عندك صلاحية لهذا القسم أو الإجراء'});}); }
function emitState(){ io.emit('live-state', {online:getOnlineUsers(), rooms:db.rooms}); }
// socketUsers is keyed by the login session id, not Socket.IO's socket.id.
function socketBySession(sid){ for(const s of io.sockets.sockets.values()){ if(s.data?.sid===sid) return s; } return null; }
function emitToUser(name,event,payload){
  const target=keyName(name);
  for(const [sid,u] of socketUsers){
    if(keyName(u.name)===target) socketBySession(sid)?.emit(event,payload);
  }
}

function getOnlineUsers(){
  const arr=[]; for(const [sid,u] of sessions){ if(socketUsers.has(sid)){ const role=roleOf(u); arr.push({...u,role,owner:role==='owner',admin:['owner','admin'].includes(role),staff:['owner','admin','banner','super'].includes(role),panelAccess:role==='owner'||hasPermission(u,'panel_access'),room:socketUsers.get(sid)?.room||u.room||'',countryCode:(socketBySession(sid)?.handshake?.headers?.['cf-ipcountry']||socketBySession(sid)?.handshake?.headers?.['x-country-code']||'').toUpperCase(),displayName:displayName(u.name),likes:userLikes(u),level:level(userLikes(u)),profile:profile(u.name)}); } }
  const seen=new Set(); return arr.filter(x=>{const k=keyName(x.name); if(seen.has(k))return false; seen.add(k); return true;});
}
function onlineInRoom(room){
  const set=roomSockets.get(room); if(!set)return 0; return [...set].filter(sid=>socketUsers.has(sid)).length;
}
function roomBanned(name,room){
  const list=Array.isArray(db.roomBans[room])?db.roomBans[room]:[];
  const n=keyName(name), now=Date.now(); let changed=false;
  const active=list.filter(item=>{
    if(typeof item==='string') return keyName(item)===n;
    if(item&&item.name){ if(item.until && Number(item.until)<=now){changed=true;return false;} return keyName(item.name)===n; }
    return false;
  });
  if(changed){db.roomBans[room]=list.filter(item=>!(item&&item.until&&Number(item.until)<=now));save();}
  return active.some(item=>typeof item==='string'?keyName(item)===n:(item&&keyName(item.name)===n));
}
function roomMuted(name,room){ return Array.isArray(db.roomMutes[room]) && db.roomMutes[room].includes(keyName(name)); }
function normalizeIp(value){ let ip=String(value||'').trim(); if(ip.includes(','))ip=ip.split(',')[0].trim(); if(ip.startsWith('::ffff:'))ip=ip.slice(7); if(ip.startsWith('[')&&ip.includes(']'))ip=ip.slice(1,ip.indexOf(']')); if(/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip))ip=ip.replace(/:\d+$/,''); return ip.toLowerCase(); }
function requestClientIp(req){ return normalizeIp(req.get('cf-connecting-ip')||req.get('x-real-ip')||req.ip||req.socket?.remoteAddress||''); }
function socketClientIp(socket){ const h=socket.handshake?.headers||{}; return normalizeIp(h['cf-connecting-ip']||h['x-real-ip']||socket.handshake?.address||''); }
function globalIpBanned(ip){ const k=normalizeIp(ip); if(!k)return false; const item=(db.globalIpBans||{})[k]; if(!item)return false; if(Number(item.until||0)<=Date.now()){delete db.globalIpBans[k];save();return false;} return true; }
function globalBanned(name,ip){ const n=keyName(name), item=(db.globalBans||{})[n]; if(item){ if(Number(item.until||0)<=Date.now()){delete db.globalBans[n];save();} else return true; } return globalIpBanned(ip); }
function removeFromChat(name, banned){ const n=keyName(name); for(const so of io.sockets.sockets.values()){ const sid2=so.data?.sid, u2=so.data?.user||socketUsers.get(sid2); if(!u2||keyName(u2.name)!==n)continue; const oldRoom=u2.room||''; if(oldRoom){so.leave(oldRoom);roomSockets.get(oldRoom)?.delete(sid2);} if(so.data?.user)so.data.user.room=''; if(socketUsers.get(sid2))socketUsers.get(sid2).room=''; so.emit('kicked',{global:true,banned:!!banned,room:oldRoom}); } emitState(); }
function safeMessage(m){ return {...m, text:String(m.text||'').slice(0,2000)}; }
function addMessage(m){ db.messages.push(m); if(db.messages.length>1000)db.messages.splice(0,db.messages.length-1000); save(); }
function notify(name,item){
  name=accountKey(name); if(!db.notifications[name])db.notifications[name]=[];
  db.notifications[name].unshift({...item,id:crypto.randomUUID(),at:Date.now()});
  db.notifications[name]=db.notifications[name].slice(0,100); save();
}

const upload = multer({
  storage: multer.diskStorage({ destination:UP_DIR, filename:(req,file,cb)=>cb(null,Date.now()+'-'+crypto.randomBytes(5).toString('hex')+path.extname(file.originalname||'')) }),
  limits:{fileSize:100*1024*1024},
  fileFilter:(req,file,cb)=>{
    const ok=/^(image|video|audio)\//i.test(file.mimetype); cb(ok?null:new Error('نوع الملف غير مسموح'),ok);
  }
});

app.post('/api/register',(req,res)=>{
  const n=cleanName(req.body.name), p=String(req.body.password||'');
  if(n && globalBanned(n,requestClientIp(req)))return res.status(403).json({error:'عنوان الإنترنت محظور من الدردشة، حاول بعد انتهاء 5 دقائق'});
  if(!n||!p)return res.status(400).json({error:'الاسم وكلمة المرور مطلوبان'});
  const ownerRequested = keyName(n)==='owner' || (!!process.env.OWNER_NAME && keyName(n)===keyName(process.env.OWNER_NAME));
  if(ownerRequested){
    const token=String(req.body.bootstrapToken||'');
    const ownerExists=Object.keys(db.users).some(x=>keyName(x)==='owner' || (!!process.env.OWNER_NAME && keyName(x)===keyName(process.env.OWNER_NAME)));
    if(ownerExists || db.ownerSetupCompleted)return res.status(409).json({error:'حساب المالك موجود مسبقاً'});
    if(!process.env.OWNER_BOOTSTRAP_PASSWORD || token.length<24 || token!==process.env.OWNER_BOOTSTRAP_PASSWORD)return res.status(403).json({error:'رمز تهيئة المالك غير صحيح'});
    if(p.length<12)return res.status(400).json({error:'كلمة مرور المالك يجب أن تكون 12 حرفاً على الأقل'});
  } else if(p.length<3) return res.status(400).json({error:'كلمة المرور 3 أحرف على الأقل'});
  if(db.users[n]||Object.keys(db.users).some(x=>keyName(x)===keyName(n)))return res.status(409).json({error:'الاسم مستخدم مسبقاً'});
  db.users[n]={hash:bcrypt.hashSync(p,12),likes:keyName(n)==='admin'?999999:0,created:Date.now()};
  if(ownerRequested){ db.ownerSetupCompleted=true; }
  profile(n); const sid=makeSession(n,'member'); save(); res.json({sid,user:sessionUser(sid)});
});
app.post('/api/login',(req,res)=>{
  const n=cleanName(req.body.name), p=String(req.body.password||'');
  if(n && globalBanned(n,requestClientIp(req)))return res.status(403).json({error:'عنوان الإنترنت محظور من الدردشة، حاول بعد انتهاء 5 دقائق'});
  const u=db.users[n] || Object.entries(db.users).find(([k])=>keyName(k)===keyName(n))?.[1];
  if(!u || !bcrypt.compareSync(p,u.hash))return res.status(401).json({error:'الاسم أو الباسورد غير صحيح'});
  const real=Object.keys(db.users).find(k=>keyName(k)===keyName(n))||n; const sid=makeSession(real,'member'); res.json({sid,user:sessionUser(sid)});
});
app.post('/api/guest',(req,res)=>{
  const n=cleanName(req.body.name); if(!n)return res.status(400).json({error:'اكتب اسم الزائر'});
  if(globalBanned(n,requestClientIp(req)))return res.status(403).json({error:'عنوان الإنترنت محظور من الدردشة، حاول بعد انتهاء 5 دقائق'});
  const taken=keyName(n)==='owner' || (!!process.env.OWNER_NAME && keyName(n)===keyName(process.env.OWNER_NAME)) || Object.keys(db.users).some(x=>keyName(x)===keyName(n)) || Object.keys(db.guests).some(x=>keyName(x)===keyName(n));
  if(taken)return res.status(409).json({error:'الاسم مستخدم، اختر اسماً آخر'});
  db.guests[n]={likes:0,created:Date.now()}; const gp=profile(n); gp.status='(غير مسجل)'; const sid=makeSession(n,'guest'); save(); res.json({sid,user:sessionUser(sid)});
});
app.post('/api/logout',requireAuth,(req,res)=>{ const sid=req.get('x-session'); const u=sessions.get(sid); const name=u?.name||req.user?.name; if(name){ /* Clear this user's persisted room navigation notices so they do not reappear in a later session; preserve chat text and shared announcements. */ db.messages=(db.messages||[]).filter(m=>!(m?.type==='presence'&&keyName(m.from)===keyName(name))); } if(u?.type==='guest'){delete db.guests[u.name];delete db.profiles[u.name];} sessions.delete(sid); welcomeSentSessions.delete(sid); delete db.sessions[sid]; save(); res.json({ok:true}); });

app.get('/api/public-online',(req,res)=>{ const users=getOnlineUsers().map(u=>({name:u.name,type:u.type,displayName:u.displayName,avatar:u.profile?.avatar||'',status:u.profile?.status||defaultStatus(u.name)})); res.set('Cache-Control','no-store'); res.json({users}); });
app.get('/api/state',requireAuth,(req,res)=>{
  const u=req.user;
  // A guest starts each fresh app entry with the default status; registered members keep their saved status.
  if(u.type==='guest' && req.query.entry==='1'){ const p=profile(u.name); p.status='(غير مسجل)'; save(); }
  const likes=userLikes(u); const rooms=db.rooms.map(r=>{const {passwordHash,...safe}=r;return {...safe,locked:!!passwordHash,online:onlineInRoom(r.id)};});
  res.json({user:{...u,likes,level:level(likes),admin:isAdmin(u),owner:isOwner(u),staff:isStaff(u),role:roleOf(u),vip:vipActive(u.name),profile:profile(u.name),notice:canNotice(u),media:canMedia(u)}, rooms, online:getOnlineUsers().map(x=>({name:x.name,type:x.type,likes:x.likes,level:x.level,profile:x.profile,online:true,role:x.role||roleOf(x),admin:isAdmin(x),vip:vipActive(x.name)}))});
});
app.get('/api/history',requireAuth,(req,res)=>{ const room=String(req.query.room||'public'), started=Number(req.user.created)||0; res.set('Cache-Control','no-store'); res.json(db.messages.filter(x=>x.room===room&&Number(x.at||0)>=started).slice(-200)); });
app.get('/api/members',requireAuth,(req,res)=>{const online=new Map(getOnlineUsers().map(x=>[keyName(x.name),x]));const rows=[];for(const [name,u] of Object.entries(db.users)){const x=online.get(keyName(name));rows.push({name,type:'member',likes:Number(u.likes)||0,level:level(Number(u.likes)||0),profile:profile(name),online:!!x,room:x?.room||'',countryCode:x?.countryCode||'',role:u.role||(keyName(name)==='owner' || (!!process.env.OWNER_NAME && keyName(name)===keyName(process.env.OWNER_NAME))?'owner':(keyName(name)==='admin'?'admin':'member')),vip:vipActive(name)});}for(const [name,g] of Object.entries(db.guests)){const x=online.get(keyName(name));if(x)rows.push({name,type:'guest',likes:Number(g.likes)||0,level:level(Number(g.likes)||0),profile:profile(name),online:true,room:x?.room||'',countryCode:x?.countryCode||'',ignoredByMe:(db.ignored?.[keyName(req.user.name)]||[]).some(x=>keyName(x)===keyName(name)),role:g.role||'member',vip:false});}const rank=x=>x.role==='owner'?0:x.role==='admin'?1:x.role==='banner'?2:x.role==='super'?3:x.vip?4:x.type==='guest'?6:5;rows.sort((a,b)=>rank(a)-rank(b)||b.likes-a.likes||a.name.localeCompare(b.name,'ar'));res.json(rows);});
app.get('/api/wall/status',requireAuth,(req,res)=>{res.set('Cache-Control','no-store');res.json({enabled:db.wallEnabled!==false});});
app.get('/api/wall',requireAuth,(req,res)=>{const started=Number(req.user.created)||0;res.set('Cache-Control','no-store');res.json(db.wall.filter(x=>Number(x.at||0)>=started).slice(-100).reverse());});
app.post('/api/wall',requireAuth,(req,res)=>{if(db.wallEnabled===false)return res.status(403).json({error:'الجدار متوقف مؤقتاً من الإدارة'});const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'اكتب منشورك'});const p={id:crypto.randomUUID(),from:req.user.name,text:text.slice(0,2000),media:null,at:Date.now(),likes:0};db.wall.push(p);db.wall=db.wall.slice(-300);save();io.emit('wall-new',p);res.json(p);});
app.post('/api/wall/like',requireAuth,(req,res)=>{const p=db.wall.find(x=>x.id===req.body.id);if(!p)return res.status(404).json({error:'المنشور غير موجود'});p.likes=Number(p.likes||0)+1;save();io.emit('wall-like',{id:p.id,likes:p.likes});res.json({ok:true,likes:p.likes});});
app.post('/api/admin/wall/control',requireAdmin,(req,res)=>{const action=String(req.body.action||'');if(action==='stop'||action==='restart'){db.wallEnabled=action==='restart';save();io.emit('wall-state',{enabled:db.wallEnabled});return res.json({ok:true,enabled:db.wallEnabled});}if(action==='clear'){const removed=db.wall.length;db.wall=[];save();io.emit('wall-cleared',{removed});return res.json({ok:true,removed});}if(action==='delete-user'){const name=cleanName(req.body.name||'');if(!name)return res.status(400).json({error:'حدد اسم العضو'});const before=db.wall.length;db.wall=db.wall.filter(p=>keyName(p.from)!==keyName(name));const removed=before-db.wall.length;save();io.emit('wall-user-deleted',{name,removed});return res.json({ok:true,removed,name});}return res.status(400).json({error:'إجراء الجدار غير معروف'});});
app.post('/api/notify',requireAuth,(req,res)=>{if(!isOwner(req.user)&&!canNotice(req.user))return res.status(403).json({error:'التنبيهات تفتح عند 400 إعجاب'});const requested=cleanName(req.body.to),to=accountKey(requested);if(!getUser(to)&&!getGuest(to))return res.status(404).json({error:'العضو غير موجود'});const p=profile(to);if(p.notificationsOpen===false&&!isOwner(req.user))return res.status(403).json({error:'هذا الشخص أغلق التنبيه'});const text=String(req.body.text||'').trim().slice(0,500);if(!text)return res.status(400).json({error:'اكتب التنبيه'});notify(to,{type:'notice',from:req.user.name,text});emitToUser(to,'notification',{from:req.user.name,text});res.json({ok:true});});
app.get('/api/private/history',requireAuth,(req,res)=>{const to=cleanName(req.query.to||'');if(!to)return res.status(400).json({error:'اختر عضوًا'});const meKey=keyName(req.user.name),toKey=keyName(to);const items=(db.privateMessages||[]).filter(m=>Number(m.at||0)>=(Number(req.user.created)||0)&&((keyName(m.from)===meKey&&keyName(m.to)===toKey)||(keyName(m.from)===toKey&&keyName(m.to)===meKey))).slice(-200).map(m=>{const acct=getUser(m.from)||getGuest(m.from);const sender={name:m.from,type:getUser(m.from)?'member':'guest'};return {...m,fromDisplayName:m.fromDisplayName||displayName(m.from),profile:profile(m.from),role:acct?roleOf(sender):'member',vip:vipActive(m.from),likes:userLikes(sender)};});res.set('Cache-Control','no-store');res.json(items);});
app.post('/api/private/read',requireAuth,(req,res)=>{const from=keyName(req.body.from||'');if(!from)return res.status(400).json({error:'المحادثة غير محددة'});db.privateRead=db.privateRead||{};db.privateRead[keyName(req.user.name)]=db.privateRead[keyName(req.user.name)]||{};db.privateRead[keyName(req.user.name)][from]=Date.now();save();res.json({ok:true});});
app.post('/api/private/read-all',requireAuth,(req,res)=>{const me=keyName(req.user.name);db.privateRead=db.privateRead||{};db.privateRead[me]=db.privateRead[me]||{};for(const m of (db.privateMessages||[])){if(keyName(m.to)!==me)continue;const from=keyName(m.from);const at=Number(m.at)||0;if(at>Number(db.privateRead[me][from]||0))db.privateRead[me][from]=at;}save();res.json({ok:true});});
app.post('/api/private/hide',requireAuth,(req,res)=>{const other=keyName(req.body.name||'');const me=keyName(req.user.name);if(!other||other===me)return res.status(400).json({error:'اسم غير صحيح'});db.privateHidden=db.privateHidden||{};db.privateHidden[me]=Array.isArray(db.privateHidden[me])?db.privateHidden[me]:[];if(!db.privateHidden[me].includes(other))db.privateHidden[me].push(other);/* Start a fresh conversation for this account: remove this pair's stored history. */db.privateMessages=(db.privateMessages||[]).filter(m=>!((keyName(m.from)===me&&keyName(m.to)===other)||(keyName(m.from)===other&&keyName(m.to)===me)));if(db.privateRead?.[me])delete db.privateRead[me][other];if(db.privateRead?.[other])delete db.privateRead[other][me];save();res.json({ok:true});});
app.get('/api/private/contacts',requireAuth,(req,res)=>{const meName=req.user.name,meKey=keyName(meName),hidden=new Set((db.privateHidden?.[meKey]||[]).map(keyName)),read=db.privateRead?.[meKey]||{},map=new Map();for(const m of (db.privateMessages||[])){const from=keyName(m.from),to=keyName(m.to),other=from===meKey?m.to:to===meKey?m.from:null;if(!other||hidden.has(keyName(other)))continue;const k=keyName(other),old=map.get(k)||{name:other,last:'',at:0,unread:0};if(Number(m.at)>=old.at){old.name=other;old.last=m.text||'';old.at=Number(m.at)||0;}if(to===meKey&&Number(m.at)>Number(read[k]||0))old.unread++;map.set(k,old);}const rows=[...map.values()].sort((a,b)=>b.at-a.at).map(x=>({name:x.name,profile:profile(x.name),online:[...socketUsers.values()].some(u=>keyName(u.name)===keyName(x.name)),last:x.last,at:x.at,unread:x.unread}));res.json(rows);});
app.get('/api/notifications',requireAuth,(req,res)=>{const started=Number(req.user.created)||0;res.set('Cache-Control','no-store');res.json((db.notifications[accountKey(req.user.name)]||db.notifications[req.user.name]||[]).filter(x=>Number(x.at||0)>=started).slice(0,50));});
app.post('/api/notifications/read',requireAuth,(req,res)=>{db.notifications[accountKey(req.user.name)]=[];save();res.json({ok:true});});

app.post('/api/message',requireAuth,(req,res)=>{
  const u=req.user, room=String(req.body.room||'public'), text=String(req.body.text||'').trim();
  if(!text)return res.status(400).json({error:'الرسالة فارغة'});
  if(roomBanned(u.name,room))return res.status(403).json({error:'أنت محظور من هذه الغرفة'});
  if(roomMuted(u.name,room))return res.status(403).json({error:'أنت مكتوم في هذه الغرفة'});
  const r=db.rooms.find(x=>x.id===room); if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});
  const m={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:u.type,text,at:Date.now(),likes:userLikes(u),profile:profile(u.name)}; addMessage(m); io.to(room).emit('message',m); res.json({ok:true,message:m});
});

app.post('/api/like',requireAuth,(req,res)=>{
  const from=req.user,to=cleanName(req.body.to); if(!to)return res.status(400).json({error:'العضو غير موجود'}); // يسمح بالإعجاب للنفس، مع بقاء مهلة الإعجاب للحسابات العادية.
  const canonical=accountKey(to); const target=getUser(canonical); const guestTarget=getGuest(canonical); if(!target&&!guestTarget)return res.status(404).json({error:'العضو غير موجود'});
  const k=keyName(from.name)+'::'+keyName(canonical), now=Date.now(), last=Number(db.lastLike[k]||0), remain=Math.max(0,10000-(now-last));
  if(!isOwner(from)&&remain>0){const sec=Math.max(1,Math.ceil(remain/1000));return res.status(429).json({error:`يسمح لك بعد ${sec} ثانية لإرسال اللايك`,remaining:sec});}
  db.lastLike[k]=now;
  if(target) target.likes=Number(target.likes||0)+1; else guestTarget.likes=Number(guestTarget.likes||0)+1; save(); const l=target?target.likes:guestTarget.likes;
  const likeText=`لقد استلمت إعجاب من ${displayName(from.name)}`;
  // الإعجاب يُحفظ دائمًا، لكن إشعار المستلم يحترم إعداد إغلاق التنبيهات.
  if(profile(canonical).notificationsOpen!==false){
    notify(canonical,{type:'like-received',from:from.name,text:likeText,likes:l});
    if(l===400)notify(canonical,{type:'unlock',text:'مبروك، تم فتح التنبيهات عند 400 إعجاب'});
    if(l===500)notify(canonical,{type:'unlock',text:'مبروك، تم فتح الصور والفيديو والصوت والاتصال عند 500 إعجاب'});
    emitToUser(canonical,'like-received',{from:from.name,text:likeText,likes:l});
  }
  io.emit('likes-changed',{name:canonical,likes:l,level:level(l)}); res.json({ok:true,likes:l,level:level(l)});
});
app.post('/api/admin/grant-like',requireAdmin,(req,res)=>{const n=accountKey(req.body.name),amount=Math.max(1,Math.min(100000,Number(req.body.amount)||1)),u=getUser(n),g=getGuest(n);if(!u&&!g)return res.status(404).json({error:'المستخدم غير موجود'});if(u)u.likes=Number(u.likes||0)+amount;else g.likes=Number(g.likes||0)+amount;const likes=Number((u||g).likes||0);save();io.emit('likes-changed',{name:n,likes,level:level(likes)});emitToUser(n,'admin-action-notice',{title:'❤️ لايكات جديدة',text:'حصلت على '+amount+' لايك من '+req.user.name+' (admin)'});res.json({ok:true,likes});});
app.post('/api/admin/reset-likes',(req,res,next)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'reset_likes'))return res.status(403).json({error:'ما عندك صلاحية تصفير اللايكات'});const n=accountKey(req.body.name),u=getUser(n),g=getGuest(n);if(!u&&!g)return res.status(404).json({error:'المستخدم غير موجود'});if(isOwner({name:n,role:(u||g).role}))return res.status(403).json({error:'لا يمكن تعديل لايكات صاحب الموقع'});if(u)u.likes=0;else g.likes=0;save();io.emit('likes-changed',{name:n,likes:0,level:1});res.json({ok:true});});});
app.post('/api/admin/role',(req,res)=>{requireAuth(req,res,()=>{const actor=req.user,n=accountKey(req.body.name),role=String(req.body.role||'member');if(!hasPermission(actor,'role_assign'))return res.status(403).json({error:'ما عندك صلاحية تغيير الرتب'});const target=getUser(n)||getGuest(n);if(!target||isOwnerName(n)||roleOf({name:n,role:target.role})==='owner')return res.status(400).json({error:'العضو غير صحيح أو أن حساب المالك محمي'});if(!['member','super','admin','banner'].includes(role))return res.status(400).json({error:'الدور غير صحيح'});target.role=role;for(const [sid2,x] of sessions){if(keyName(x.name)===keyName(n)){x.role=role;db.sessions[sid2]=x;socketBySession(sid2)?.emit('role-changed',{name:n,role,from:actor.name});socketBySession(sid2)?.emit('admin-action-notice',{title:'🏅 تغيير المنصب',text:'قام '+actor.name+' بتغيير منصبك إلى '+({'member':'عضو','super':'سوبر','banner':'بنر','admin':'إداري'}[role])});}}for(const [sid2,x] of socketUsers){if(keyName(x.name)===keyName(n)){x.role=role;const so=socketBySession(sid2);if(so?.data?.user)so.data.user.role=role;so?.emit('role-changed',{name:n,role,from:actor.name});}}save();emitState();res.json({ok:true,role,type:getUser(n)?'member':'guest',panelAccess:['admin','super','banner'].includes(role)});});});
app.post('/api/admin/gift',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'gifts'))return res.status(403).json({error:'ما عندك صلاحية إرسال الهدايا'});const n=accountKey(req.body.name),gift=cleanName(req.body.gift||'هدية');if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'المستخدم غير موجود'});if(isOwnerName(n))return res.status(403).json({error:'حساب صاحب الموقع محمي من الهدايا الإدارية'});const p=profile(n);p.gifts=p.gifts||[];p.gifts.unshift({gift,from:req.user.name,at:Date.now()});p.gifts=p.gifts.slice(0,30);save();emitToUser(n,'gift',{name:n,gift,from:req.user.name});emitToUser(n,'admin-action-notice',{title:'🎁 هدية جديدة',text:'أرسل لك '+req.user.name+' (admin) هدية: '+gift});io.emit('profile-changed',{name:n,profile:p});emitState();res.json({ok:true});});});
app.post('/api/admin/gift-vip',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'vip'))return res.status(403).json({error:'ما عندك صلاحية منح VIP'});const n=accountKey(req.body.name);if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'المستخدم غير موجود'});const p=profile(n);p.vipUntil=Date.now()+24*60*60*1000;save();emitToUser(n,'vip-changed',{name:n,vipUntil:p.vipUntil,from:req.user.name});emitToUser(n,'admin-action-notice',{title:'👑 عضوية VIP',text:'منحك '+req.user.name+' (admin) عضوية VIP لمدة 24 ساعة'});io.emit('profile-changed',{name:n,profile:p});emitState();res.json({ok:true,vipUntil:p.vipUntil});});});
app.post('/api/admin/member-action',(req,res)=>{requireAuth(req,res,()=>{
  const actor=req.user,n=accountKey(req.body.name),action=String(req.body.action||''),room=String(req.body.room||'public');
  if(!n)return res.status(400).json({error:'الاسم مطلوب'});
  if(isOwner({name:n,role:(getUser(n)||getGuest(n)||{}).role}) && !isOwner(actor)) return res.status(403).json({error:'حساب صاحب الموقع محمي ولا يمكن للإداري طرده أو حظره أو تعديل لايكاته'});
  const actionPermission=({'global-kick':'moderation','global-ban':'moderation','kick':'moderation','ban':'moderation','mute':'moderation','grant-like':'grant_likes','reset-likes':'reset_likes','grant-admin':'role_assign','grant-super':'role_assign','grant-banner':'role_assign','grant-vip':'vip','gift':'gifts'})[action]||'moderation';if(!hasPermission(actor,actionPermission))return res.status(403).json({error:'ما عندك صلاحية لهذا الإجراء'});
  if(action==='global-kick'){ emitToUser(n,'admin-action-notice',{title:'🚪 طرد من الدردشة',text:'قام '+actor.name+' (admin) بطردك من الدردشة'}); removeFromChat(n,false); return res.json({ok:true}); }
  if(action==='global-ban'){ emitToUser(n,'admin-action-notice',{title:'⛔ حظر من الدردشة',text:'قام '+actor.name+' (admin) بحظرك من الدردشة لمدة 5 دقائق'}); db.globalBans=db.globalBans||{}; db.globalIpBans=db.globalIpBans||{}; const until=Date.now()+5*60*1000; const targetIps=new Set(); for(const so of io.sockets.sockets.values()){const sid2=so.data?.sid,u2=so.data?.user||socketUsers.get(sid2);if(u2&&keyName(u2.name)===keyName(n)){const ip=socketClientIp(so);if(ip)targetIps.add(ip);}} db.globalBans[keyName(n)]={name:keyName(n),until}; for(const ip of targetIps)db.globalIpBans[ip]={ip,name:keyName(n),until}; save(); removeFromChat(n,true); return res.json({ok:true,until,ipCount:targetIps.size}); }
  const target=getUser(n)||getGuest(n);
  if(!target && !['kick','ban','mute'].includes(action))return res.status(404).json({error:'المستخدم غير موجود'});
  if(action==='grant-like'&&!isAdmin(actor))return res.status(403).json({error:'زيادة اللايكات للمالك والإداري فقط'});
  if(action==='reset-likes'&&!hasPermission(actor,'reset_likes'))return res.status(403).json({error:'ما عندك صلاحية تصفير اللايكات'});
  if(action==='grant-admin'&&!isOwner(actor))return res.status(403).json({error:'إعطاء الإداري للمالك فقط'});
  if((action==='grant-vip'||action==='grant-banner')&&!isAdmin(actor))return res.status(403).json({error:'هذه الصلاحية للمالك والإداري فقط'});
  if(action==='grant-super'&&!isAdmin(actor))return res.status(403).json({error:'إعطاء السوبر للمالك والإداري فقط'});
  if(action==='grant-like'){const amount=Math.max(1,Math.min(10000,Number(req.body.amount)||1));target.likes=Number(target.likes||0)+amount;save();io.emit('likes-changed',{name:n,likes:target.likes,level:level(target.likes)});emitToUser(n,'admin-action-notice',{title:'❤️ لايكات جديدة',text:'حصلت على '+amount+' لايك من '+actor.name+' (admin)'});return res.json({ok:true,likes:target.likes});}
  if(action==='reset-likes'){if(isOwner({name:n,role:target.role}))return res.status(403).json({error:'لا يمكن تعديل لايكات صاحب الموقع'});target.likes=0;save();io.emit('likes-changed',{name:n,likes:0,level:1});return res.json({ok:true});}
  if(action==='grant-admin'||action==='grant-super'||action==='grant-banner'){
    const role=action==='grant-admin'?'admin':action==='grant-banner'?'banner':'super';
    const roleTarget=getUser(n)||getGuest(n);if(!roleTarget)return res.status(404).json({error:'العضو غير صحيح'});
    roleTarget.role=role;save();for(const [sid2,x] of sessions){if(keyName(x.name)===keyName(n)){x.role=role;db.sessions[sid2]=x;}}for(const [sid2,x] of socketUsers){if(keyName(x.name)===keyName(n)){x.role=role;const so=socketBySession(sid2);if(so?.data?.user)so.data.user.role=role;}}emitToUser(n,'role-changed',{name:n,role,from:actor.name});emitToUser(n,'admin-action-notice',{title:'🏅 تغيير الرتبة',text:'قام '+actor.name+' (admin) بترقية رتبتك إلى '+role});emitState();return res.json({ok:true,role});
  }
  if(action==='grant-vip'){const until=Date.now()+24*60*60*1000;const p=profile(n);p.vipUntil=until;save();emitToUser(n,'vip-changed',{name:n,vipUntil:until,from:actor.name});emitToUser(n,'admin-action-notice',{title:'👑 عضوية VIP',text:'منحك '+actor.name+' (admin) عضوية VIP لمدة 24 ساعة'});emitState();return res.json({ok:true,vipUntil:until});}
  if(action==='gift'){const gift=cleanName(req.body.gift||'هدية');const p=profile(n);p.gifts=p.gifts||[];p.gifts.unshift({gift,from:actor.name,at:Date.now()});p.gifts=p.gifts.slice(0,30);save();emitToUser(n,'gift',{name:n,gift,from:actor.name});emitToUser(n,'admin-action-notice',{title:'🎁 هدية جديدة',text:'أرسل لك '+actor.name+' (admin) هدية: '+gift});emitState();return res.json({ok:true,gift});}
  if(action==='kick'){emitToUser(n,'admin-action-notice',{title:'🚪 طرد من الغرفة',text:'قام '+actor.name+' (admin) بطردك من الغرفة'});for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===keyName(n)&&u2.room===room){const so=socketBySession(sid2);so?.leave(room);roomSockets.get(room)?.delete(sid2);if(so?.data?.user)so.data.user.room='';if(socketUsers.get(sid2))socketUsers.get(sid2).room='';so?.emit('kicked',{room,banned:false});}}emitState();return res.json({ok:true});}
  if(action==='ban'){emitToUser(n,'admin-action-notice',{title:'⛔ حظر من الغرفة',text:'قام '+actor.name+' (admin) بحظرك من الغرفة لمدة 15 دقيقة'});const until=Date.now()+15*60*1000;db.roomBans[room]=Array.isArray(db.roomBans[room])?db.roomBans[room]:[];db.roomBans[room]=db.roomBans[room].filter(x=>typeof x==='string'?keyName(x)!==keyName(n):keyName(x?.name)!==keyName(n));db.roomBans[room].push({name:keyName(n),until});save();for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===keyName(n)&&u2.room===room){const so=socketBySession(sid2);so?.leave(room);roomSockets.get(room)?.delete(sid2);if(so?.data?.user)so.data.user.room='';if(socketUsers.get(sid2))socketUsers.get(sid2).room='';so?.emit('kicked',{room,banned:true,until});}}emitState();return res.json({ok:true,until});}
  if(action==='mute'){db.roomMutes[room]=Array.isArray(db.roomMutes[room])?db.roomMutes[room]:[];const kn=keyName(n);if(!db.roomMutes[room].includes(kn))db.roomMutes[room].push(kn);save();emitToUser(n,'error-msg',{error:'تم كتمك في هذه الغرفة'});emitState();return res.json({ok:true});}
  return res.status(400).json({error:'إجراء غير معروف'});
});});
app.post('/api/admin/broadcast',requireAdmin,(req,res)=>{const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'نص الإعلان فارغ'});const duration=req.body.duration==='5m'?'5m':'permanent';const item={id:crypto.randomUUID(),text:text.slice(0,2000),from:req.user.name,role:roleOf(req.user),at:Date.now(),duration};db.announcements=Array.isArray(db.announcements)?db.announcements:[];db.announcements.unshift(item);db.announcements=db.announcements.slice(0,100);for(const room of db.rooms){const message={id:item.id+'-' + room.id,announcementId:item.id,room:room.id,from:item.from,displayName:displayName(item.from),role:item.role,type:'announcement',text:item.text,at:item.at,duration:item.duration,profile:profile(item.from)};addMessage(message);io.to(room.id).emit('message',message);}save();if(duration==='5m')scheduleAnnouncementExpiry(item);res.json({ok:true,announcement:item});});
app.delete('/api/admin/announcement/:id',requireAdmin,(req,res)=>{const id=String(req.params.id);const existed=(db.announcements||[]).some(x=>x.id===id);db.announcements=(db.announcements||[]).filter(x=>x.id!==id);const removed=db.messages.filter(m=>String(m.id||'').startsWith(id+'-'));db.messages=db.messages.filter(m=>!String(m.id||'').startsWith(id+'-'));for(const m of removed)io.emit('message-deleted',{id:m.id});save();res.json({ok:true,removedMessages:removed.length,existed});});
app.delete('/api/admin/message/:id',requireAdmin,(req,res)=>{const id=req.params.id;db.messages=db.messages.filter(x=>x.id!==id);save();io.emit('message-deleted',{id});res.json({ok:true});});
app.patch('/api/admin/profile/:name',requireAdmin,(req,res)=>{const n=accountKey(req.params.name);if(isOwner({name:n,role:(getUser(n)||getGuest(n)||{}).role})&&!isOwner(req.user))return res.status(403).json({error:'ملف صاحب الموقع محمي من الإداريين'});if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'العضو غير موجود'});const p=profile(n);if(req.body.displayName!==undefined){const dn=cleanName(req.body.displayName);if(!dn)return res.status(400).json({error:'الزخرفة لا يمكن أن تكون فارغة'});p.displayName=dn;}if(req.body.nameColor!==undefined){const c=String(req.body.nameColor||'');if(!/^#[0-9a-fA-F]{6}$/.test(c))return res.status(400).json({error:'لون الاسم غير صحيح'});p.nameColor=c;}if(req.body.fontColor!==undefined){const c=String(req.body.fontColor||'');if(!/^#[0-9a-fA-F]{6}$/.test(c))return res.status(400).json({error:'لون الخط غير صحيح'});p.fontColor=c;}if(req.body.bgColor!==undefined){const c=String(req.body.bgColor||'');if(!/^#[0-9a-fA-F]{6}$/.test(c))return res.status(400).json({error:'لون الخلفية غير صحيح'});p.bgColor=c;}save();io.emit('profile-changed',{name:n,profile:p,displayName:p.displayName||cleanName(n)});res.json({ok:true,profile:p,displayName:p.displayName||cleanName(n)});});
app.delete('/api/admin/avatar/:name',requireAdmin,(req,res)=>{const n=accountKey(req.params.name);const ownerNames=new Set(['owner',keyName(process.env.OWNER_NAME||'owner')]);if((ownerNames.has(keyName(n))||isOwner({name:n,role:(getUser(n)||getGuest(n)||{}).role}))&&!isOwner(req.user))return res.status(403).json({error:'صورة صاحب الموقع محمية من الإداريين'});if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'العضو غير موجود'});const p=profile(n);if(p.avatar&&p.avatar.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(p.avatar)))}catch{}}p.avatar='';save();io.emit('profile-changed',{name:n,profile:p});res.json({ok:true});});
app.post('/api/admin/rank',requireAdmin,(req,res)=>{const requested=cleanName(req.body.name),n=accountKey(requested),rank=String(req.body.rank||'');const user=getUser(n),guest=getGuest(n);if(!n||(!user&&!guest))return res.status(404).json({error:'العضو غير موجود أو انتهت جلسة الزائر؛ حدّث قائمة الأعضاء وجرب مرة ثانية'});if(isOwnerName(n)||roleOf({name:n,role:user?.role})==='owner')return res.status(403).json({error:'رتبة صاحب الموقع محمية'});const allowed=['none','admin-full','super-red','super-white','super-black','admin-shield','crown-gold','crown-silver'];if(!allowed.includes(rank))return res.status(400).json({error:'الرتبة غير صحيحة'});const rawDays=req.body.durationDays;const days=rawDays===undefined||rawDays===null||rawDays===''?0:Number(rawDays);if(!Number.isFinite(days)||days<0||days>36500)return res.status(400).json({error:'المدة يجب أن تكون 0 أو عدد أيام بين 1 و36500'});const p=profile(n);const grantedAt=Date.now();const account=user||guest;const oldRole=String(account.role||'member');if(rank==='none'){if(['super','banner','admin'].includes(oldRole)&&RANK_BASE_ROLE[p.rank]===oldRole)account.role='member';}else{account.role=RANK_BASE_ROLE[rank];}p.rank=rank;p.rankGrantedBy=cleanName(req.user.name);p.rankGrantedAt=grantedAt;p.rankGrantedName=rank;db.rankAudit=Array.isArray(db.rankAudit)?db.rankAudit:[];db.rankAudit.unshift({id:crypto.randomUUID(),member:n,rank,by:cleanName(req.user.name),at:grantedAt,durationDays:Math.floor(days),until:(rank!=='none'&&days>0)?grantedAt+Math.floor(days)*24*60*60*1000:null});db.rankAudit=db.rankAudit.slice(0,1000);p.rankDurationDays=rank==='none'?0:Math.floor(days);if(rank==='none'||days===0){delete p.rankUntil;}else{p.rankUntil=grantedAt+Math.floor(days)*24*60*60*1000;}save();io.emit('profile-changed',{name:n,profile:p});const durationText=rank==='none'?'':days===0?' (دائمة)':' لمدة '+Math.floor(days)+' يوم';const rankNames={'none':'بدون رتبة إضافية','admin-full':'ADMIN كامل الصلاحيات','super-red':'السوبر الأحمر','super-white':'السوبر الأبيض','super-black':'السوبر الأسود','admin-shield':'الإداري','crown-gold':'البنر الذهبي','crown-silver':'البنر الفضي'};const noticeText='لقد منحك '+req.user.name+' رتبة '+(rankNames[rank]||rank)+durationText;notify(n,{type:'rank-granted',title:'🏅 تم منحك رتبة',from:req.user.name,text:noticeText,rank,rankUntil:p.rankUntil||null});emitToUser(n,'admin-action-notice',{title:'🏅 تم منحك رتبة',text:noticeText,from:req.user.name,rank,rankUntil:p.rankUntil||null});res.json({ok:true,rank,rankUntil:p.rankUntil||null,name:n,type:guest?'guest':'member'});});
app.get('/api/admin/member-ip/:name',requireAuth,(req,res)=>{if(!hasPermission(req.user,'member_ip'))return res.status(403).json({error:'ما عندك صلاحية عرض IP'});const n=keyName(req.params.name);if(isOwnerName(n))return res.status(403).json({error:'معلومات اتصال صاحب الموقع محمية'});const matches=[];for(const so of io.sockets.sockets.values()){const sid2=so.data?.sid,u2=so.data?.user||socketUsers.get(sid2);if(u2&&keyName(u2.name)===n){matches.push({ip:socketClientIp(so),room:u2.room||'',connected:true});}}res.json({name:req.params.name,connections:matches});});
app.get('/api/admin/permissions',requireAuth,(req,res)=>{if(!hasPermission(req.user,'permission_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة الصلاحيات'});res.json({catalog:PERMISSION_CATALOG,defaults:DEFAULT_ROLE_PERMISSIONS,roles:Object.fromEntries(['admin','banner','super',...RANK_PERMISSION_PROFILES].map(r=>{const base=RANK_BASE_ROLE[r]?r:r;return [r,[...new Set(['panel_access',...(Array.isArray(db.rolePermissions[r])?db.rolePermissions[r]:(DEFAULT_ROLE_PERMISSIONS[base]||[])).filter(p=>Object.hasOwn(PERMISSION_CATALOG,p)&&(!PROTECTED_ROLE_PERMISSIONS.includes(p)||['admin','admin-full','admin-shield'].includes(r)))])]]}))});});
app.put('/api/admin/permissions',requireAuth,(req,res)=>{if(!hasPermission(req.user,'permission_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة الصلاحيات'});const role=String(req.body.role||'');if(!['admin','super','banner',...RANK_PERMISSION_PROFILES].includes(role))return res.status(400).json({error:'الرتبة أو المنصب غير صحيح'});const allowed=Object.keys(PERMISSION_CATALOG);const requested=Array.isArray(req.body.permissions)?req.body.permissions:[];if(requested.some(x=>!allowed.includes(x)))return res.status(400).json({error:'توجد صلاحية غير معروفة'});const protectedPerms=PROTECTED_ROLE_PERMISSIONS;if(requested.includes('permission_manage')&&!['admin-full','admin'].includes(role))return res.status(400).json({error:'إدارة الصلاحيات مخصصة لرتبة ADMIN الكاملة'});db.rolePermissions=db.rolePermissions||{};db.rolePermissionMeta=db.rolePermissionMeta||{customized:{}};db.rolePermissionMeta.customized=db.rolePermissionMeta.customized||{};db.rolePermissions[role]=[...new Set(['panel_access',...requested.filter(x=>allowed.includes(x))])];db.rolePermissionMeta.customized[role]=true;save();res.json({ok:true,role,permissions:db.rolePermissions[role]});});
app.get('/api/admin/welcome-messages',requireAuth,(req,res)=>{if(!isAdmin(req.user))return res.status(403).json({error:'تعديل رسائل الترحيب متاح للمالك والإداري فقط'});res.json({messages:db.welcomeMessages||[]});});
app.put('/api/admin/welcome-messages',requireAuth,(req,res)=>{if(!isAdmin(req.user))return res.status(403).json({error:'تعديل رسائل الترحيب متاح للمالك والإداري فقط'});try{const raw=Array.isArray(req.body?.messages)?req.body.messages:[];if(raw.length>12)return res.status(400).json({error:'الحد الأعلى 12 رسالة ترحيب'});const messages=[];for(const item of raw){const title=String(item?.title||'').trim().slice(0,80),text=String(item?.text||'').trim().slice(0,1200);if(!title&&!text)continue;if(!text)return res.status(400).json({error:'اكتب نص كل رسالة قبل الحفظ'});messages.push({id:String(item?.id||crypto.randomUUID()).slice(0,80),title:title||'الترحيب',text,enabled:item?.enabled!==false});}const previous=db.welcomeMessages;db.welcomeMessages=messages;try{save()}catch(saveError){db.welcomeMessages=previous;console.error('Welcome messages save failed:',saveError);return res.status(500).json({error:'تعذر حفظ الرسائل على التخزين. تحقق من صلاحية ومسار /data ثم أعد المحاولة.'});}return res.json({ok:true,messages});}catch(error){console.error('Welcome messages update failed:',error);return res.status(500).json({error:'حدث خطأ أثناء معالجة رسائل الترحيب'});}});
app.get('/api/admin/data',requireAdmin,(req,res)=>res.json({users:Object.entries(db.users).sort(([a],[b])=>Number(isOwnerName(b))-Number(isOwnerName(a))).map(([name,u])=>({name,type:'member',likes:Number(u.likes)||0,level:level(Number(u.likes)||0),role:u.role||(keyName(name)==='owner' || (!!process.env.OWNER_NAME && keyName(name)===keyName(process.env.OWNER_NAME))?'owner':(keyName(name)==='admin'?'admin':'member')),vip:vipActive(name),online:[...socketUsers.values()].some(x=>keyName(x.name)===keyName(name)),profile:profile(name)})),guests:Object.entries(db.guests).sort(([a],[b])=>Number(isOwnerName(b))-Number(isOwnerName(a))).map(([name,g])=>({name,type:'guest',likes:Number(g.likes)||0,level:level(Number(g.likes)||0),role:g.role||'member',online:[...socketUsers.values()].some(x=>keyName(x.name)===keyName(name)),profile:profile(name)})).filter(x=>x.online),rooms:db.rooms.map(r=>{const {passwordHash,...safe}=r;return {...safe,locked:!!passwordHash,online:onlineInRoom(r.id)};}),announcements:(db.announcements||[]).slice(0,100),messages:db.messages.slice(-100).reverse(),bans:Object.entries(db.roomBans||{}).flatMap(([room,items])=>(items||[]).map(x=>({room,name:typeof x==='string'?x:x.name,until:typeof x==='string'?null:x.until}))),mutes:Object.entries(db.roomMutes||{}).flatMap(([room,items])=>(items||[]).map(name=>({room,name}))),globalBans:Object.values(db.globalBans||{}).filter(x=>Number(x.until)>Date.now()),globalIpBans:Object.values(db.globalIpBans||{}).filter(x=>Number(x.until)>Date.now()),rankAudit:(db.rankAudit||[]).slice(0,200),rolePermissions:db.rolePermissions||{},myPermissions:Object.keys(PERMISSION_CATALOG).filter(permission=>hasPermission(req.user,permission)),wallEnabled:db.wallEnabled!==false,wallCount:(db.wall||[]).length }));
app.post('/api/admin/room',requireAdmin,(req,res)=>{const name=cleanName(req.body.name),kind=req.body.kind==='voice'?'voice':req.body.kind==='private'?'private':'public';if(!name)return res.status(400).json({error:'اسم الغرفة مطلوب'});const id='r_'+crypto.randomBytes(5).toString('hex');db.rooms.push({id,name,desc:String(req.body.desc||'غرفة جديدة'),kind,capacity:Math.max(2,Number(req.body.capacity)||50),mics:kind==='voice'?Math.max(1,Number(req.body.mics)||8):0,owner:req.user.name});save();emitState();res.json({ok:true,id});});
app.post('/api/admin/room/:id/lock',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const password=String(req.body.password||'');if(password.length<1)return res.status(400).json({error:'اكتب باسورد الغرفة أولاً'});if(password.length>128)return res.status(400).json({error:'الباسورد طويل جداً'});r.passwordHash=bcrypt.hashSync(password,12);save();emitState();res.json({ok:true,locked:true});});
app.delete('/api/admin/room/:id/lock',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});delete r.passwordHash;save();emitState();res.json({ok:true,locked:false});});
app.post('/api/admin/room/:id/image',requireAdmin,upload.single('file'),(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});if(!req.file||!req.file.mimetype.startsWith('image/'))return res.status(400).json({error:'اختر صورة للغرفة'});if(r.image&&r.image.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(r.image)))}catch{}}r.image='/uploads/'+req.file.filename;save();emitState();res.json({ok:true,image:r.image,room:r});});
function clearRoomImage(req,res){const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const oldImage=String(r.image||'');if(oldImage.startsWith('/uploads/')){const file=path.resolve(UP_DIR,path.basename(oldImage));try{if(file.startsWith(path.resolve(UP_DIR)+path.sep)&&fs.existsSync(file))fs.unlinkSync(file)}catch(e){console.warn('Room image file cleanup failed:',e.message)}}delete r.image;try{save()}catch(e){console.error('Room image reset save failed:',e);return res.status(500).json({error:'تعذر حفظ حذف الصورة؛ تحقق من صلاحية التخزين'})}emitState();return res.json({ok:true,image:null,room:r});}
app.delete('/api/admin/room/:id/image',requireAdmin,clearRoomImage);
// POST fallback for hosting/proxies that block DELETE requests.
app.post('/api/admin/room/:id/image/delete',requireAdmin,clearRoomImage);
app.patch('/api/admin/room/:id',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});if(req.body.name!==undefined)r.name=cleanName(req.body.name)||r.name;if(req.body.desc!==undefined)r.desc=String(req.body.desc).slice(0,200);if(req.body.capacity!==undefined)r.capacity=Math.max(2,Math.min(1000,Number(req.body.capacity)||r.capacity));if(req.body.mics!==undefined&&r.kind==='voice')r.mics=Math.max(1,Math.min(50,Number(req.body.mics)||r.mics));save();emitState();res.json({ok:true,room:r});});
app.delete('/api/admin/room/:id',requireAdmin,(req,res)=>{if(['public','voice'].includes(req.params.id))return res.status(400).json({error:'الغرفة الأساسية محمية ولا تحذف'});db.rooms=db.rooms.filter(r=>r.id!==req.params.id);delete db.roomBans[req.params.id];delete db.roomMutes[req.params.id];save();emitState();res.json({ok:true});});
app.post('/api/admin/unmute',requireAdmin,(req,res)=>{const room=String(req.body.room||'public'),name=keyName(req.body.name);if(!name)return res.status(400).json({error:'الاسم مطلوب'});db.roomMutes[room]=(db.roomMutes[room]||[]).filter(x=>keyName(x)!==name);save();res.json({ok:true});});
function roomAction(type,req,res){
  const room=String(req.body.room||'public'),name=keyName(req.body.name);
  if(!name)return res.status(400).json({error:'الاسم مطلوب'});
  if((isOwner({name,role:(getUser(name)||getGuest(name)||{}).role})||name===keyName(process.env.OWNER_NAME||'owner'))&&!isOwner(req.user))return res.status(403).json({error:'حساب صاحب الموقع محمي ولا يحق للإداري اتخاذ إجراء عليه'});
  db[type][room]=db[type][room]||[];
  if(type==='roomMutes'){
    if(!db[type][room].includes(name))db[type][room].push(name);
  }else if(type==='roomBans'){
    db[type][room]=db[type][room].filter(x=>typeof x==='string'?x!==name:keyName(x?.name)!==name);
    db[type][room].push({name,until:Date.now()+15*60*1000});
  }else db[type][room]=db[type][room].filter(x=>x!==name);
  save();
  for(const [sid,u] of socketUsers){
    if(keyName(u.name)!==name||u.room!==room)continue;
    const s=io.sockets.sockets.get(sid);
    if(type==='roomBans'){
      s?.leave(room); roomSockets.get(room)?.delete(sid);
      s?.emit('kicked',{room,banned:true});
    }else if(type==='roomMutes'){
      s?.emit('error-msg',{error:'تم كتمك في هذه الغرفة'});
    }
  }
  emitState();res.json({ok:true});
}

app.post('/api/admin/kick',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'moderation'))return res.status(403).json({error:'ما عندك صلاحية الإشراف'});const room=String(req.body.room||'public'),name=keyName(req.body.name);if(!name)return res.status(400).json({error:'الاسم مطلوب'});if((isOwner({name,role:(getUser(name)||getGuest(name)||{}).role})||name===keyName(process.env.OWNER_NAME||'owner'))&&!isOwner(req.user))return res.status(403).json({error:'حساب صاحب الموقع محمي ولا يحق للإداري اتخاذ إجراء عليه'});for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===name&&u2.room===room){const so=socketBySession(sid2);so?.leave(room);roomSockets.get(room)?.delete(sid2);so?.emit('kicked',{room});}}emitState();res.json({ok:true});});});
app.post('/api/admin/mute',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'moderation'))return res.status(403).json({error:'ما عندك صلاحية الإشراف'});roomAction('roomMutes',req,res);});});
app.post('/api/admin/ban',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'moderation'))return res.status(403).json({error:'ما عندك صلاحية الإشراف'});roomAction('roomBans',req,res);});});
app.post('/api/admin/unban',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'moderation'))return res.status(403).json({error:'ما عندك صلاحية الإشراف'});const room=String(req.body.room||'public'),name=keyName(req.body.name);db.roomBans[room]=(db.roomBans[room]||[]).filter(x=>typeof x==='string'?x!==name:keyName(x?.name)!==name);save();res.json({ok:true});});});

app.post('/api/ignore',requireAuth,(req,res)=>{const n=cleanName(req.body.name);if(!n||keyName(n)===keyName(req.user.name))return res.status(400).json({error:'اسم غير صحيح'});db.ignored=db.ignored||{};const me=keyName(req.user.name),other=keyName(n);db.ignored[me]=Array.isArray(db.ignored[me])?db.ignored[me]:[];const i=db.ignored[me].findIndex(x=>keyName(x)===other);if(i>=0)db.ignored[me].splice(i,1);else db.ignored[me].push(other);save();res.json({ok:true,ignored:i<0});});
app.post('/api/profile',requireAuth,(req,res)=>{
  const u=req.user,p=profile(u.name);
  if(req.body.displayName!==undefined){
    const dn=cleanName(req.body.displayName);
    if(!dn)return res.status(400).json({error:'الاسم المزخرف لا يمكن أن يكون فارغاً'});
    p.displayName=dn;
  }
  if(req.body.status!==undefined)p.status=String(req.body.status).slice(0,100)||defaultStatus(u.name);
  if(req.body.bio!==undefined)p.bio=String(req.body.bio).slice(0,300);
  if(req.body.nameColor!==undefined)p.nameColor=String(req.body.nameColor).slice(0,20);
  if(req.body.fontColor!==undefined)p.fontColor=String(req.body.fontColor).slice(0,20);
  if(req.body.bgColor!==undefined)p.bgColor=String(req.body.bgColor).slice(0,20);
  if(req.body.privateOpen!==undefined)p.privateOpen=!!req.body.privateOpen;
  if(req.body.notificationsOpen!==undefined)p.notificationsOpen=!!req.body.notificationsOpen;
  save();io.emit('profile-changed',{name:u.name,profile:p,displayName:p.displayName||cleanName(u.name)});emitState();res.json({ok:true,profile:p,displayName:p.displayName||cleanName(u.name)});
});
app.post('/api/profile/avatar',requireAuth,upload.single('file'),(req,res)=>{if(!isAdmin(req.user)&&userLikes(req.user)<10)return res.status(403).json({error:'تغيير الصورة يفتح عند 10 إعجابات'});if(!req.file||!req.file.mimetype.startsWith('image/'))return res.status(400).json({error:'اختر صورة'});const p=profile(req.user.name);p.avatar='/uploads/'+req.file.filename;save();res.json({ok:true,avatar:p.avatar});});
app.delete('/api/profile/avatar',requireAuth,(req,res)=>{if(isOwner(req.user))return res.status(403).json({error:'حذف صورة صاحب الموقع محمي'});const p=profile(req.user.name);if(p.avatar&&p.avatar.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(p.avatar)))}catch{}}p.avatar='';save();res.json({ok:true,avatar:''});});

app.post('/api/media',requireAuth,upload.single('file'),(req,res)=>{
  const u=req.user, to=cleanName(req.body.to||''), scope=String(req.body.scope||'private');
  if(!req.file)return res.status(400).json({error:'لم يتم اختيار ملف'});
  if(scope==='private'&&!isOwner(u)&&!canMedia(u))return res.status(403).json({error:'الصور والفيديو والصوت والاتصال تفتح عند 500 إعجاب'});
  if(scope==='wall'&&db.wallEnabled===false)return res.status(403).json({error:'الجدار متوقف مؤقتاً من الإدارة'});
  if(scope==='wall'&&!/^image\//.test(req.file.mimetype)&&!/^video\//.test(req.file.mimetype))return res.status(400).json({error:'الحائط يسمح بصورة أو فيديو فقط'});
  const media={url:'/uploads/'+req.file.filename,mime:req.file.mimetype,name:req.file.originalname};
  if(scope==='private'){
    const target=getUser(to)||db.guests[to]||null; if(!target)return res.status(404).json({error:'العضو غير موجود'});
    const tp=profile(to); if(tp.privateOpen===false&&!canMessageClosedPrivate(u))return res.status(403).json({error:`لقد أغلق ${displayName(to)} المحادثة الخاصة`});
    const ignored=(db.ignored?.[keyName(to)]||[]).some(x=>keyName(x)===keyName(u.name)); if(ignored)return res.status(403).json({error:`لقد قام ${displayName(to)} بتجاهلك`});
    const targetSocket=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(to)); if(!targetSocket)return res.status(403).json({error:'هذا المستخدم غير متصل'});
    const m={id:crypto.randomUUID(),room:'__private__',from:u.name,fromDisplayName:displayName(u.name),to,type:'media',media,at:Date.now(),profile:profile(u.name),role:roleOf(u),vip:vipActive(u.name),likes:userLikes(u)};
    db.privateMessages=db.privateMessages||[]; db.privateMessages.push(m); db.privateMessages=db.privateMessages.slice(-5000);
    const toKey=keyName(to),fromKey=keyName(u.name);
    if(db.privateHidden?.[toKey])db.privateHidden[toKey]=db.privateHidden[toKey].filter(x=>keyName(x)!==fromKey);
    if(db.privateHidden?.[fromKey])db.privateHidden[fromKey]=db.privateHidden[fromKey].filter(x=>keyName(x)!==toKey);
    save(); notify(to,{type:'private-media',from:u.name,text:'أرسلك وسائط خاصة'}); socketBySession(targetSocket[0])?.emit('private-media',m); return res.json(m);
  }
  const post={id:crypto.randomUUID(),from:u.name,text:'',media,at:Date.now(),likes:0}; db.wall.push(post); save(); io.emit('wall-new',post); res.json(post);
});

io.on('connection',socket=>{
  socket.on('join',({sid,room='public',password=''}={})=>{
    const pendingGuestCleanup=guestDisconnectTimers.get(sid); if(pendingGuestCleanup){clearTimeout(pendingGuestCleanup);guestDisconnectTimers.delete(sid);}
    const u=sessionUser(sid); if(!u)return;
    const targetRoom=db.rooms.find(r=>r.id===room); if(!targetRoom){socket.emit('join-error',{error:'الغرفة غير موجودة'});return;}
    if(targetRoom.passwordHash&&!bcrypt.compareSync(String(password||''),targetRoom.passwordHash)){socket.emit('join-error',{error:'الغرفة مقفلة؛ أدخل الباسورد الصحيح'});return;} 
    // Validate access before changing the active room, then move this socket atomically.
    if(globalBanned(u.name,socketClientIp(socket))){socket.emit('join-error',{error:'عنوان الإنترنت محظور من الدردشة، حاول بعد انتهاء 5 دقائق'});return;}
    if(roomBanned(u.name,room)){socket.emit('join-error',{error:'أنت محظور من هذه الغرفة'});return;}
    const previousRoom=socket.data.user?.room||socketUsers.get(sid)?.room||'';
    if(previousRoom && previousRoom!==room){
      socket.leave(previousRoom);
      roomSockets.get(previousRoom)?.delete(sid);
      voiceSpeakers.get(previousRoom)?.delete(sid);
      const leaveNotice={id:crypto.randomUUID(),room:previousRoom,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'move',exitKind:'room',targetRoom:room,text:'',at:Date.now(),profile:profile(u.name),role:u.role};
      addMessage(leaveNotice);
      io.to(previousRoom).emit('message',leaveNotice);
      emitVoiceState(previousRoom);
      const oldMembers=roomSockets.get(previousRoom)||new Set();
      for(const memberSid of [...oldMembers]){const active=socketUsers.get(memberSid);if(!active||active.room!==previousRoom)oldMembers.delete(memberSid);}
      if(oldMembers.size===0)roomSockets.delete(previousRoom);
    }
    socket.data.sid=sid; socket.data.user={...u,room}; socketUsers.set(sid,{...u,room});
    socket.join(room); if(!roomSockets.has(room))roomSockets.set(room,new Set());roomSockets.get(room).add(sid);
    socket.emit('room-joined',{room});
    socket.emit('history',{room,items:db.messages.filter(m=>m.room===room&&Number(m.at||0)>=(Number(u.created)||0)&&(m.type==='presence'||(m.type==='announcement'&&(!m.announcementId||(db.announcements||[]).some(a=>String(a.id)===String(m.announcementId)))))).slice(-200)}); const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'join',text:'',at:Date.now(),profile:profile(u.name),role:u.role}; addMessage(pm); io.to(room).emit('message',pm); if(!welcomeSentSessions.has(sid)){for(const item of (db.welcomeMessages||[]).filter(x=>x.enabled!==false&&String(x.text||'').trim())){const welcome={id:'welcome-'+crypto.randomUUID(),room,from:'شات ريماز',displayName:item.title||'الترحيب',type:'welcome',text:item.text,at:Date.now(),profile:{nameColor:'#2877b9',bgColor:'#eaf5ff'}};socket.emit('message',welcome);}welcomeSentSessions.add(sid);} emitState(); const joinedRoom=db.rooms.find(r=>r.id===room); if(joinedRoom?.kind==='voice')emitVoiceState(room);
  });
  socket.on('request-mic',({room,raised}={})=>{const u=socket.data.user;if(!u||!room||u.room!==room)return;const r=db.rooms.find(x=>x.id===room);if(!r||r.kind!=='voice')return socket.emit('error-msg',{error:'هذا الخيار متاح بالغرف الصوتية فقط'});if(raised){if(userLikes(u)<30&&!isOwner(u)&&!isAdmin(u))return socket.emit('error-msg',{error:'تحتاج إلى 30 إعجاباً على الأقل لرفع المايك'});const speakers=voiceSpeakers.get(room)||new Map();if(speakers.size>=Math.max(1,Number(r.mics)||8)&&!speakers.has(socket.data.sid))return socket.emit('error-msg',{error:'اكتمل عدد المايكات في هذه الغرفة'});speakers.set(socket.data.sid,{name:u.name,displayName:displayName(u.name),at:Date.now()});voiceSpeakers.set(room,speakers);}else{voiceSpeakers.get(room)?.delete(socket.data.sid);}emitVoiceState(room);});
  socket.on('leave-room',({room}={})=>{const u=socket.data.user,sid=socket.data.sid;if(!u||!room)return;socket.leave(room);roomSockets.get(room)?.delete(sid);voiceSpeakers.get(room)?.delete(sid);emitVoiceState(room);if(socketUsers.get(sid))socketUsers.get(sid).room='';if(socket.data.user)socket.data.user.room='';const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'leave',exitKind:'room',text:'',at:Date.now(),profile:profile(u.name),role:u.role};addMessage(pm);io.to(room).emit('message',pm);{const members=roomSockets.get(room)||new Set();for(const memberSid of [...members]){const active=socketUsers.get(memberSid);if(!active||active.room!==room)members.delete(memberSid);}if(members.size===0){roomSockets.delete(room);try{save()}catch(e){console.error('Room state save failed:',e.message)}}}emitState();});
  socket.on('send-message',d=>{const u=socket.data.user;if(!u)return;const room=String(d?.room||'');if(!room||u.room!==room||!socket.rooms.has(room))return socket.emit('error-msg',{error:'أنت خارج الغرفة'});const targetRoom=db.rooms.find(r=>r.id===room);if(!targetRoom)return socket.emit('error-msg',{error:'الغرفة غير موجودة'});if(roomMuted(u.name,room)||roomBanned(u.name,room))return socket.emit('error-msg',{error:'لا يمكنك الكتابة هنا'});const text=String(d?.text||'').trim();if(!text)return;const m={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'text',text:text.slice(0,2000),at:Date.now(),likes:userLikes(u),role:roleOf(u),vip:vipActive(u.name),profile:profile(u.name)};addMessage(m);io.to(room).emit('message',m);});
  socket.on('private-message',d=>{const u=socket.data.user;if(!u||!d?.to)return;const toKey=keyName(d.to),to=accountKey(d.to),text=String(d.text||'').trim().slice(0,2000);if(!text)return;const tp=profile(to);if(tp.privateOpen===false&&!canMessageClosedPrivate(u))return socket.emit('error-msg',{error:`لقد أغلق ${displayName(to)} المحادثة الخاصة`});const ignored=(db.ignored?.[keyName(to)]||[]).some(x=>keyName(x)===keyName(u.name));if(ignored)return socket.emit('error-msg',{error:`لقد قام ${displayName(to)} بتجاهلك`});if(!getUser(to)&&!getGuest(to))return socket.emit('error-msg',{error:'هذا المستخدم غير موجود'});const m={id:crypto.randomUUID(),from:u.name,fromDisplayName:displayName(u.name),to,toDisplayName:displayName(to),type:'text',text,at:Date.now(),profile:profile(u.name),role:roleOf(u),vip:vipActive(u.name),likes:userLikes(u)};db.privateMessages=db.privateMessages||[];db.privateMessages.push(m);db.privateMessages=db.privateMessages.slice(-5000);if(db.privateHidden?.[toKey])db.privateHidden[toKey]=db.privateHidden[toKey].filter(x=>keyName(x)!==keyName(u.name));if(db.privateHidden?.[keyName(u.name)])db.privateHidden[keyName(u.name)]=db.privateHidden[keyName(u.name)].filter(x=>keyName(x)!==toKey);save();emitToUser(to,'private-message',m);socket.emit('private-message',m);});
  socket.on('call-offer',d=>{const u=socket.data.user;if(!u||(!isOwner(u)&&!canMedia(u))||!d?.to)return;const target=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(d.to));if(!target)return socket.emit('error-msg',{error:'المستخدم غير متصل'});if(!canMedia(target[1]))return socket.emit('error-msg',{error:'الاتصال يحتاج 500 إعجاب للطرفين'});socketBySession(target[0])?.emit('call-offer',{from:u.name,offer:d.offer,video:!!d.video});});
  socket.on('call-answer',d=>{const u=socket.data.user;if(!u||(!isOwner(u)&&!canMedia(u))||!d?.to)return;const target=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(d.to));if(target)socketBySession(target[0])?.emit('call-answer',{from:u.name,answer:d.answer,video:!!d.video});});
  socket.on('ice',d=>{const u=socket.data.user;if(!u||!d?.to)return;const target=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(d.to));if(target)socketBySession(target[0])?.emit('ice',{from:u.name,candidate:d.candidate});});
  socket.on('disconnect',()=>{
    const sid=socket.data.sid,u=socket.data.user,room=socket.data.user&&socket.data.user.room;
    if(sid)socketUsers.delete(sid);
    if(room){roomSockets.get(room)?.delete(sid);voiceSpeakers.get(room)?.delete(sid);emitVoiceState(room);}
    if(u&&room){const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'leave',exitKind:'chat',text:'',at:Date.now(),profile:profile(u.name),role:u.role};addMessage(pm);io.to(room).emit('message',pm);{const members=roomSockets.get(room)||new Set();for(const memberSid of [...members]){const active=socketUsers.get(memberSid);if(!active||active.room!==room)members.delete(memberSid);}if(members.size===0){roomSockets.delete(room);try{save()}catch(e){console.error('Room state save failed:',e.message)}}}}
    if(sid&&u?.type==='guest'){
      const timer=setTimeout(()=>{
        guestDisconnectTimers.delete(sid);
        const stillOnline=[...socketUsers.values()].some(x=>keyName(x.name)===keyName(u.name));
        if(!stillOnline){delete db.guests[u.name];delete db.profiles[u.name];sessions.delete(sid);delete db.sessions[sid];save();}
        emitState();
      },25000);
      guestDisconnectTimers.set(sid,timer);
    }
    emitState();
  });
});

app.get(/.*/,(req,res)=>{ if (!INDEX_FILE) return res.status(500).send('Rimaz setup error: index.html is missing from the deployment package.'); res.sendFile(INDEX_FILE); });
server.listen(PORT,()=>console.log(`Rimaz server listening on ${PORT}`));
