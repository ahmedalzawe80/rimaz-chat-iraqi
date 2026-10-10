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
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data/rimaz' : path.join('/tmp', 'rimaz-data'));
const UP_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'data.json');
fs.mkdirSync(UP_DIR, { recursive: true });

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UP_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(ROOT, 'public')));
// Serve the approved single-file UI at the site root without changing its design.
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});
const defaults = () => ({
  users: {}, guests: {}, sessions: {}, messages: [], wall: [], notifications: {}, announcements: [],
  profiles: {}, lastLike: {}, permissionOverrides: {},
  rooms: [
    { id:'public', name:'الغرفة العامة', desc:'غرفة عامة ..', kind:'public', capacity:200, mics:0, owner:'admin' },
    { id:'friends', name:'غرفة الأصدقاء', desc:'غرفة خاصة ..', kind:'private', capacity:100, mics:0, owner:'admin' },
    { id:'love', name:'غرفة الحب', desc:'غرفة خاصة ..', kind:'private', capacity:100, mics:0, owner:'admin' },
    { id:'voice', name:'غرفة الصوت', desc:'مايك ..', kind:'voice', capacity:50, mics:8, owner:'admin' }
  ],
  roomBans:{}, roomMutes:{}, roomKicks:{},
  wallLikes:{}, wallComments:{}, privateMessages:[], ignored:{}
});

let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = defaults(); }
for (const [k,v] of Object.entries(defaults())) if (db[k] === undefined) db[k] = v;
function save(){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

const sessions = new Map(); // sid -> {name,type,created}
for (const [sid,s] of Object.entries(db.sessions||{})) sessions.set(sid,s);
const roomSockets = new Map();
const socketUsers = new Map();
const guestDisconnectTimers = new Map();

function cleanName(v){ return String(v||'').trim().replace(/\s+/g,' ').slice(0,32); }
function keyName(n){ return cleanName(n).toLowerCase(); }
function roleOf(u){ if(!u||u.type!=='member') return 'member'; const n=keyName(u.name); const owner=keyName(process.env.ADMIN_NAME||'admin'); if(n==='admin'||n===owner)return 'owner'; return db.users[u.name]?.role||'member'; }
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
function profile(name){
  if (!db.profiles[name]) db.profiles[name]={displayName:cleanName(name),avatar:'',status:'متصل الآن',bio:'عضو في دردشة ريماز عراقية',nameColor:'#222222',fontColor:'#222222',bgColor:'#ffffff',privateOpen:true,notificationsOpen:true};
  const p=db.profiles[name];
  if(!p.displayName) p.displayName=cleanName(name);
  if(!p.status) p.status='متصل الآن';
  if(!p.fontColor) p.fontColor=p.nameColor||'#222222';
  return p;
}
function displayName(name){ return profile(name).displayName || cleanName(name); }
function sessionUser(sid){ const s=sessions.get(sid); if(!s)return null; const role=roleOf(s); return {...s, role, owner:isOwner(s), admin:isAdmin(s), staff:isStaff(s), vip:vipActive(s.name), likes:isAdmin(s)?999999:userLikes(s)}; }
function makeSession(name,type){
  const sid=crypto.randomBytes(24).toString('hex');
  const s={name,type,created:Date.now()}; sessions.set(sid,s); db.sessions[sid]=s; save(); return sid;
}
function requireAuth(req,res,next){
  const u=sessionUser(req.get('x-session')); if(!u)return res.status(401).json({error:'يجب تسجيل الدخول'}); req.user=u; next();
}
function requireAdmin(req,res,next){ requireAuth(req,res,()=>isOwner(req.user)?next():res.status(403).json({error:'لوحة التحكم الكاملة لصاحب الموقع فقط'})); }
function emitState(){ io.emit('live-state', {online:getOnlineUsers(), rooms:db.rooms}); }
function emitToUser(name,event,payload){
  const target=keyName(name);
  for(const [sid,u] of socketUsers){
    if(keyName(u.name)===target){
      io.sockets.sockets.get(sid)?.emit(event,payload);
    }
  }
}

function getOnlineUsers(){
  const arr=[]; for(const [sid,u] of sessions){ if(socketUsers.has(sid)) arr.push({...u,displayName:displayName(u.name),likes:userLikes(u),level:level(userLikes(u)),profile:profile(u.name)}); }
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
function safeMessage(m){ return {...m, text:String(m.text||'').slice(0,2000)}; }
function addMessage(m){ db.messages.push(m); if(db.messages.length>1000)db.messages.splice(0,db.messages.length-1000); save(); }
function notify(name,item){
  if(!db.notifications[name])db.notifications[name]=[];
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
  if(!n||!p)return res.status(400).json({error:'الاسم والباسورد مطلوبان'});
  if(p.length<3)return res.status(400).json({error:'الباسورد 3 أحرف على الأقل'});
  if(db.users[n]||Object.keys(db.users).some(x=>keyName(x)===keyName(n)))return res.status(409).json({error:'الاسم مستخدم مسبقاً'});
  db.users[n]={hash:bcrypt.hashSync(p,10),likes:keyName(n)==='admin'?999999:0,created:Date.now()}; profile(n); const sid=makeSession(n,'member'); save(); res.json({sid,user:sessionUser(sid)});
});
app.post('/api/login',(req,res)=>{
  const n=cleanName(req.body.name), p=String(req.body.password||''); const u=db.users[n] || Object.entries(db.users).find(([k])=>keyName(k)===keyName(n))?.[1];
  if(!u || !bcrypt.compareSync(p,u.hash))return res.status(401).json({error:'الاسم أو الباسورد غير صحيح'});
  const real=Object.keys(db.users).find(k=>keyName(k)===keyName(n))||n; const sid=makeSession(real,'member'); res.json({sid,user:sessionUser(sid)});
});
app.post('/api/guest',(req,res)=>{
  const n=cleanName(req.body.name); if(!n)return res.status(400).json({error:'اكتب اسم الزائر'});
  const taken=Object.keys(db.users).some(x=>keyName(x)===keyName(n)) || Object.keys(db.guests).some(x=>keyName(x)===keyName(n));
  if(taken)return res.status(409).json({error:'الاسم مستخدم، اختر اسماً آخر'});
  db.guests[n]={likes:0,created:Date.now()}; const sid=makeSession(n,'guest'); save(); res.json({sid,user:sessionUser(sid)});
});
app.post('/api/logout',requireAuth,(req,res)=>{ const sid=req.get('x-session'); const u=sessions.get(sid); if(u?.type==='guest'){delete db.guests[u.name];delete db.profiles[u.name];} sessions.delete(sid); delete db.sessions[sid]; save(); res.json({ok:true}); });

app.get('/api/public-online',(req,res)=>{ const users=getOnlineUsers().map(u=>({name:u.name,displayName:u.displayName,avatar:u.profile?.avatar||'',status:u.profile?.status||'متصل الآن'})); res.set('Cache-Control','no-store'); res.json({users}); });
app.get('/api/state',requireAuth,(req,res)=>{
  const u=req.user; const likes=userLikes(u); const rooms=db.rooms.map(r=>({...r,online:onlineInRoom(r.id)}));
  res.json({user:{...u,likes,level:level(likes),admin:isAdmin(u),owner:isOwner(u),staff:isStaff(u),role:roleOf(u),vip:vipActive(u.name),profile:profile(u.name),notice:canNotice(u),media:canMedia(u)}, rooms, online:getOnlineUsers().map(x=>({name:x.name,type:x.type,likes:x.likes,level:x.level,profile:x.profile,online:true,role:x.role||roleOf(x),admin:isAdmin(x),vip:vipActive(x.name)}))});
});
app.get('/api/history',requireAuth,(req,res)=>{ const room=String(req.query.room||'public'); res.json(db.messages.filter(x=>x.room===room).slice(-200)); });
app.get('/api/members',requireAuth,(req,res)=>{const online=new Map(getOnlineUsers().map(x=>[keyName(x.name),x]));const rows=[];for(const [name,u] of Object.entries(db.users)){const x=online.get(keyName(name));rows.push({name,type:'member',likes:Number(u.likes)||0,level:level(Number(u.likes)||0),profile:profile(name),online:!!x,role:u.role||(keyName(name)==='admin'?'owner':'member'),vip:vipActive(name)});}for(const [name,g] of Object.entries(db.guests)){const x=online.get(keyName(name));if(x)rows.push({name,type:'guest',likes:Number(g.likes)||0,level:level(Number(g.likes)||0),profile:profile(name),online:true,role:'guest',vip:false});}const rank=x=>x.role==='owner'?0:x.role==='admin'?1:x.role==='super'?2:x.role==='banner'?3:x.vip?4:x.type==='guest'?6:5;rows.sort((a,b)=>rank(a)-rank(b)||b.likes-a.likes||a.name.localeCompare(b.name,'ar'));res.json(rows);});
app.get('/api/wall',requireAuth,(req,res)=>res.json(db.wall.slice(-100).reverse()));
app.post('/api/wall',requireAuth,(req,res)=>{const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'اكتب منشورك'});const p={id:crypto.randomUUID(),from:req.user.name,text:text.slice(0,2000),media:null,at:Date.now(),likes:0};db.wall.push(p);db.wall=db.wall.slice(-300);save();io.emit('wall-new',p);res.json(p);});
app.post('/api/wall/like',requireAuth,(req,res)=>{const p=db.wall.find(x=>x.id===req.body.id);if(!p)return res.status(404).json({error:'المنشور غير موجود'});p.likes=Number(p.likes||0)+1;save();io.emit('wall-like',{id:p.id,likes:p.likes});res.json({ok:true,likes:p.likes});});
app.post('/api/notify',requireAuth,(req,res)=>{if(!canNotice(req.user))return res.status(403).json({error:'التنبيهات تفتح عند 400 إعجاب'});const requested=cleanName(req.body.to),to=accountKey(requested);if(!getUser(to)&&!getGuest(to))return res.status(404).json({error:'العضو غير موجود'});const p=profile(to);if(p.notificationsOpen===false)return res.status(403).json({error:'هذا الشخص أغلق التنبيه'});const text=String(req.body.text||'').trim().slice(0,500);if(!text)return res.status(400).json({error:'اكتب التنبيه'});notify(to,{type:'notice',from:req.user.name,text});emitToUser(to,'notification',{from:req.user.name,text});res.json({ok:true});});
app.get('/api/private/history',requireAuth,(req,res)=>{const to=cleanName(req.query.to||'');if(!to)return res.status(400).json({error:'اختر عضوًا'});res.json(db.privateMessages.filter(m=>(keyName(m.from)===keyName(req.user.name)&&keyName(m.to)===keyName(to))||(keyName(m.from)===keyName(to)&&keyName(m.to)===keyName(req.user.name))).slice(-200));});
app.get('/api/private/contacts',requireAuth,(req,res)=>{const meName=req.user.name;const map=new Map();for(const m of (db.privateMessages||[])){const other=keyName(m.from)===keyName(meName)?m.to:keyName(m.to)===keyName(meName)?m.from:null;if(!other)continue;map.set(keyName(other),{name:other,last:m.text||'',at:m.at});}const rows=[...map.values()].sort((a,b)=>b.at-a.at).map(x=>({name:x.name,profile:profile(x.name),online:[...socketUsers.values()].some(u=>keyName(u.name)===keyName(x.name)),last:x.last,at:x.at}));res.json(rows);});
app.get('/api/notifications',requireAuth,(req,res)=>res.json((db.notifications[accountKey(req.user.name)]||[]).slice(0,50)));
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
  const from=req.user,to=cleanName(req.body.to); if(!to)return res.status(400).json({error:'العضو غير موجود'}); if(keyName(from.name)===keyName(to))return res.status(400).json({error:'لا يمكنك الإعجاب لنفسك'});
  const canonical=accountKey(to); const target=getUser(canonical); const guestTarget=getGuest(canonical); if(!target&&!guestTarget)return res.status(404).json({error:'العضو غير موجود'});
  const k=keyName(from.name)+'::'+keyName(canonical), now=Date.now(), last=Number(db.lastLike[k]||0), remain=Math.max(0,10000-(now-last));
  if(remain>0){const sec=Math.max(1,Math.ceil(remain/1000));return res.status(429).json({error:`يسمح لك بعد ${sec} ثانية لإرسال اللايك`,remaining:sec});}
  db.lastLike[k]=now;
  if(target) target.likes=Number(target.likes||0)+1; else guestTarget.likes=Number(guestTarget.likes||0)+1; save(); const l=target?target.likes:guestTarget.likes;
  const likeText=`لقد استلمت إعجاب من ${displayName(from.name)}`;
  notify(canonical,{type:'like-received',from:from.name,text:likeText,likes:l});
  if(l===400)notify(canonical,{type:'unlock',text:'مبروك، تم فتح التنبيهات عند 400 إعجاب'});
  if(l===500)notify(canonical,{type:'unlock',text:'مبروك، تم فتح الصور والفيديو والصوت والاتصال عند 500 إعجاب'});
  emitToUser(canonical,'like-received',{from:from.name,text:likeText,likes:l});
  io.emit('likes-changed',{name:canonical,likes:l,level:level(l)}); res.json({ok:true,likes:l,level:level(l)});
});
app.post('/api/admin/grant-like',requireAdmin,(req,res)=>{const n=accountKey(req.body.name),amount=Math.max(1,Math.min(100000,Number(req.body.amount)||1)),u=getUser(n),g=getGuest(n);if(!u&&!g)return res.status(404).json({error:'المستخدم غير موجود'});if(u)u.likes=Number(u.likes||0)+amount;else g.likes=Number(g.likes||0)+amount;const likes=Number((u||g).likes||0);save();io.emit('likes-changed',{name:n,likes,level:level(likes)});res.json({ok:true,likes});});
app.post('/api/admin/reset-likes',(req,res,next)=>{requireAuth(req,res,()=>{if(!isOwner(req.user))return res.status(403).json({error:'تصفير اللايكات للمالك فقط'});const n=accountKey(req.body.name),u=getUser(n),g=getGuest(n);if(!u&&!g)return res.status(404).json({error:'المستخدم غير موجود'});if(u)u.likes=0;else g.likes=0;save();io.emit('likes-changed',{name:n,likes:0,level:1});res.json({ok:true});});});
app.post('/api/admin/role',(req,res)=>{requireAuth(req,res,()=>{const actor=req.user,n=accountKey(req.body.name),role=String(req.body.role||'member');if(!isOwner(actor))return res.status(403).json({error:'تغيير الرتب لصاحب الموقع فقط'});if(!db.users[n]||keyName(n)==='admin')return res.status(400).json({error:'العضو غير صحيح'});if(role==='admin'&&!isOwner(actor))return res.status(403).json({error:'إعطاء الإداري محصور بالمالك'});if(role==='super'&&!isOwner(actor))return res.status(403).json({error:'إعطاء السوبر لصاحب الموقع فقط'});if(role==='banner'&&!isOwner(actor))return res.status(403).json({error:'إعطاء البنر لصاحب الموقع فقط'});if(!['member','super','admin','banner'].includes(role))return res.status(400).json({error:'الدور غير صحيح'});db.users[n].role=role;save();for(const [sid2,x] of sessions){if(keyName(x.name)===keyName(n)){x.role=role;db.sessions[sid2]=x;}}save();res.json({ok:true,role});});});
app.post('/api/admin/gift',(req,res)=>{requireAuth(req,res,()=>{if(!isStaff(req.user))return res.status(403).json({error:'الإدارة والسوبر فقط'});const n=accountKey(req.body.name),gift=cleanName(req.body.gift||'هدية');if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'المستخدم غير موجود'});const p=profile(n);p.gifts=p.gifts||[];p.gifts.unshift({gift,from:req.user.name,at:Date.now()});p.gifts=p.gifts.slice(0,30);save();io.emit('gift',{name:n,gift,from:req.user.name});res.json({ok:true});});});
app.post('/api/admin/gift-vip',(req,res)=>{requireAuth(req,res,()=>{if(!isAdmin(req.user))return res.status(403).json({error:'VIP للمالك والإداري فقط'});const n=accountKey(req.body.name);if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'المستخدم غير موجود'});const p=profile(n);p.vipUntil=Date.now()+24*60*60*1000;save();io.emit('vip-changed',{name:n,vipUntil:p.vipUntil});res.json({ok:true,vipUntil:p.vipUntil});});});
app.post('/api/admin/member-action',(req,res)=>{requireAuth(req,res,()=>{
  const actor=req.user,n=accountKey(req.body.name),action=String(req.body.action||''),room=String(req.body.room||'public');
  if(!n)return res.status(400).json({error:'الاسم مطلوب'});
  if(!isStaff(actor))return res.status(403).json({error:'صلاحية الإدارة والسوبر فقط'});
  const target=getUser(n)||getGuest(n);
  if(!target && !['kick','ban','mute'].includes(action))return res.status(404).json({error:'المستخدم غير موجود'});
  if(action==='grant-like'&&!isAdmin(actor))return res.status(403).json({error:'زيادة اللايكات للمالك والإداري فقط'});
  if(action==='reset-likes'&&!isOwner(actor))return res.status(403).json({error:'تصفير اللايكات للمالك فقط'});
  if(action==='grant-admin'&&!isOwner(actor))return res.status(403).json({error:'إعطاء الإداري للمالك فقط'});
  if((action==='grant-vip'||action==='grant-banner')&&!isAdmin(actor))return res.status(403).json({error:'هذه الصلاحية للمالك والإداري فقط'});
  if(action==='grant-super'&&!isAdmin(actor))return res.status(403).json({error:'إعطاء السوبر للمالك والإداري فقط'});
  if(action==='grant-like'){target.likes=Number(target.likes||0)+Math.max(1,Math.min(10000,Number(req.body.amount)||1));save();io.emit('likes-changed',{name:n,likes:target.likes,level:level(target.likes)});return res.json({ok:true,likes:target.likes});}
  if(action==='reset-likes'){target.likes=0;save();io.emit('likes-changed',{name:n,likes:0,level:1});return res.json({ok:true});}
  if(action==='grant-admin'||action==='grant-super'||action==='grant-banner'){
    const role=action==='grant-admin'?'admin':action==='grant-banner'?'banner':'super';
    if(!db.users[n])return res.status(404).json({error:'العضو غير صحيح'});
    db.users[n].role=role;save();emitToUser(n,'role-changed',{role});emitState();return res.json({ok:true,role});
  }
  if(action==='grant-vip'){const until=Date.now()+24*60*60*1000;const p=profile(n);p.vipUntil=until;save();emitToUser(n,'vip-changed',{name:n,vipUntil:until});emitState();return res.json({ok:true,vipUntil:until});}
  if(action==='gift'){const gift=cleanName(req.body.gift||'هدية');const p=profile(n);p.gifts=p.gifts||[];p.gifts.unshift({gift,from:actor.name,at:Date.now()});p.gifts=p.gifts.slice(0,30);save();emitToUser(n,'gift',{name:n,gift,from:actor.name});emitState();return res.json({ok:true,gift});}
  if(action==='kick'){for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===keyName(n)&&u2.room===room){const so=io.sockets.sockets.get(sid2);so?.leave(room);roomSockets.get(room)?.delete(sid2);if(so?.data?.user)so.data.user.room='';if(socketUsers.get(sid2))socketUsers.get(sid2).room='';so?.emit('kicked',{room,banned:false});}}emitState();return res.json({ok:true});}
  if(action==='ban'){const until=Date.now()+15*60*1000;db.roomBans[room]=Array.isArray(db.roomBans[room])?db.roomBans[room]:[];db.roomBans[room]=db.roomBans[room].filter(x=>typeof x==='string'?keyName(x)!==keyName(n):keyName(x?.name)!==keyName(n));db.roomBans[room].push({name:keyName(n),until});save();for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===keyName(n)&&u2.room===room){const so=io.sockets.sockets.get(sid2);so?.leave(room);roomSockets.get(room)?.delete(sid2);if(so?.data?.user)so.data.user.room='';if(socketUsers.get(sid2))socketUsers.get(sid2).room='';so?.emit('kicked',{room,banned:true,until});}}emitState();return res.json({ok:true,until});}
  if(action==='mute'){db.roomMutes[room]=Array.isArray(db.roomMutes[room])?db.roomMutes[room]:[];const kn=keyName(n);if(!db.roomMutes[room].includes(kn))db.roomMutes[room].push(kn);save();emitToUser(n,'error-msg',{error:'تم كتمك في هذه الغرفة'});emitState();return res.json({ok:true});}
  return res.status(400).json({error:'إجراء غير معروف'});
});});
app.post('/api/admin/broadcast',requireAdmin,(req,res)=>{const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'نص الإعلان فارغ'});const item={id:crypto.randomUUID(),text:text.slice(0,2000),from:req.user.name,at:Date.now()};db.announcements=Array.isArray(db.announcements)?db.announcements:[];db.announcements.unshift(item);db.announcements=db.announcements.slice(0,100);for(const room of db.rooms){const message={id:item.id+'-'+room.id,room:room.id,from:'إدارة ريماز',type:'announcement',text:item.text,at:item.at,profile:{nameColor:'#b83255',bgColor:'#fff7fa'}};addMessage(message);io.to(room.id).emit('message',message);}save();res.json({ok:true,announcement:item});});
app.delete('/api/admin/announcement/:id',requireAdmin,(req,res)=>{db.announcements=(db.announcements||[]).filter(x=>x.id!==req.params.id);save();res.json({ok:true});});
app.delete('/api/admin/message/:id',requireAdmin,(req,res)=>{const id=req.params.id;db.messages=db.messages.filter(x=>x.id!==id);save();io.emit('message-deleted',{id});res.json({ok:true});});
app.get('/api/admin/data',requireAdmin,(req,res)=>res.json({users:Object.entries(db.users).map(([name,u])=>({name,type:'member',likes:Number(u.likes)||0,level:level(Number(u.likes)||0),role:u.role||(keyName(name)==='admin'?'owner':'member'),vip:vipActive(name),online:[...socketUsers.values()].some(x=>keyName(x.name)===keyName(name)),profile:profile(name)})),guests:Object.entries(db.guests).map(([name,g])=>({name,type:'guest',likes:Number(g.likes)||0,level:level(Number(g.likes)||0),role:'guest',online:[...socketUsers.values()].some(x=>keyName(x.name)===keyName(name)),profile:profile(name)})).filter(x=>x.online),rooms:db.rooms.map(r=>({...r,online:onlineInRoom(r.id)})),announcements:(db.announcements||[]).slice(0,100),messages:db.messages.slice(-100).reverse(),bans:Object.entries(db.roomBans||{}).flatMap(([room,items])=>(items||[]).map(x=>({room,name:typeof x==='string'?x:x.name,until:typeof x==='string'?null:x.until}))),mutes:Object.entries(db.roomMutes||{}).flatMap(([room,items])=>(items||[]).map(name=>({room,name})))}));
app.post('/api/admin/room',requireAdmin,(req,res)=>{const name=cleanName(req.body.name),kind=req.body.kind==='voice'?'voice':req.body.kind==='private'?'private':'public';if(!name)return res.status(400).json({error:'اسم الغرفة مطلوب'});const id='r_'+crypto.randomBytes(5).toString('hex');db.rooms.push({id,name,desc:String(req.body.desc||'غرفة جديدة'),kind,capacity:Math.max(2,Number(req.body.capacity)||50),mics:kind==='voice'?Math.max(1,Number(req.body.mics)||8):0,owner:req.user.name});save();emitState();res.json({ok:true});});
app.patch('/api/admin/room/:id',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});if(req.body.name!==undefined)r.name=cleanName(req.body.name)||r.name;if(req.body.desc!==undefined)r.desc=String(req.body.desc).slice(0,200);if(req.body.capacity!==undefined)r.capacity=Math.max(2,Math.min(1000,Number(req.body.capacity)||r.capacity));if(req.body.mics!==undefined&&r.kind==='voice')r.mics=Math.max(1,Math.min(50,Number(req.body.mics)||r.mics));save();emitState();res.json({ok:true,room:r});});
app.delete('/api/admin/room/:id',requireAdmin,(req,res)=>{if(['public','voice'].includes(req.params.id))return res.status(400).json({error:'الغرفة الأساسية محمية ولا تحذف'});db.rooms=db.rooms.filter(r=>r.id!==req.params.id);delete db.roomBans[req.params.id];delete db.roomMutes[req.params.id];save();emitState();res.json({ok:true});});
app.post('/api/admin/unmute',requireAdmin,(req,res)=>{const room=String(req.body.room||'public'),name=keyName(req.body.name);if(!name)return res.status(400).json({error:'الاسم مطلوب'});db.roomMutes[room]=(db.roomMutes[room]||[]).filter(x=>keyName(x)!==name);save();res.json({ok:true});});
function roomAction(type,req,res){
  const room=String(req.body.room||'public'),name=keyName(req.body.name);
  if(!name)return res.status(400).json({error:'الاسم مطلوب'});
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

app.post('/api/admin/kick',(req,res)=>{requireAuth(req,res,()=>{if(!isStaff(req.user))return res.status(403).json({error:'الإدارة والسوبر فقط'});const room=String(req.body.room||'public'),name=keyName(req.body.name);for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===name&&u2.room===room){const so=io.sockets.sockets.get(sid2);so?.leave(room);roomSockets.get(room)?.delete(sid2);so?.emit('kicked',{room});}}emitState();res.json({ok:true});});});
app.post('/api/admin/mute',(req,res)=>{requireAuth(req,res,()=>{if(!isStaff(req.user))return res.status(403).json({error:'الإدارة والسوبر فقط'});roomAction('roomMutes',req,res);});});
app.post('/api/admin/ban',(req,res)=>{requireAuth(req,res,()=>{if(!isStaff(req.user))return res.status(403).json({error:'الإدارة والسوبر فقط'});roomAction('roomBans',req,res);});});
app.post('/api/admin/unban',(req,res)=>{requireAuth(req,res,()=>{if(!isStaff(req.user))return res.status(403).json({error:'الإدارة والسوبر فقط'});const room=String(req.body.room||'public'),name=keyName(req.body.name);db.roomBans[room]=(db.roomBans[room]||[]).filter(x=>typeof x==='string'?x!==name:keyName(x?.name)!==name);save();res.json({ok:true});});});

app.post('/api/ignore',requireAuth,(req,res)=>{const n=cleanName(req.body.name);if(!n||keyName(n)===keyName(req.user.name))return res.status(400).json({error:'اسم غير صحيح'});db.ignored=db.ignored||{};db.ignored[n]=db.ignored[n]||[];const k=keyName(req.user.name);const i=db.ignored[n].indexOf(k);if(i>=0)db.ignored[n].splice(i,1);else db.ignored[n].push(k);save();res.json({ok:true,ignored:i<0});});
app.post('/api/profile',requireAuth,(req,res)=>{
  const u=req.user,p=profile(u.name);
  if(req.body.displayName!==undefined){
    const dn=cleanName(req.body.displayName);
    if(!dn)return res.status(400).json({error:'الاسم المزخرف لا يمكن أن يكون فارغاً'});
    p.displayName=dn;
  }
  if(req.body.status!==undefined)p.status=String(req.body.status).slice(0,100)||'متصل الآن';
  if(req.body.bio!==undefined)p.bio=String(req.body.bio).slice(0,300);
  if(req.body.nameColor!==undefined)p.nameColor=String(req.body.nameColor).slice(0,20);
  if(req.body.fontColor!==undefined)p.fontColor=String(req.body.fontColor).slice(0,20);
  if(req.body.bgColor!==undefined)p.bgColor=String(req.body.bgColor).slice(0,20);
  if(req.body.privateOpen!==undefined)p.privateOpen=!!req.body.privateOpen;
  if(req.body.notificationsOpen!==undefined)p.notificationsOpen=!!req.body.notificationsOpen;
  save();emitState();res.json({ok:true,profile:p});
});
app.post('/api/profile/avatar',requireAuth,upload.single('file'),(req,res)=>{if(!isAdmin(req.user)&&userLikes(req.user)<10)return res.status(403).json({error:'تغيير الصورة يفتح عند 10 إعجابات'});if(!req.file||!req.file.mimetype.startsWith('image/'))return res.status(400).json({error:'اختر صورة'});const p=profile(req.user.name);p.avatar='/uploads/'+req.file.filename;save();res.json({ok:true,avatar:p.avatar});});
app.delete('/api/profile/avatar',requireAuth,(req,res)=>{const p=profile(req.user.name);if(p.avatar&&p.avatar.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(p.avatar)))}catch{}}p.avatar='';save();res.json({ok:true,avatar:''});});

app.post('/api/media',requireAuth,upload.single('file'),(req,res)=>{
  const u=req.user, to=cleanName(req.body.to||''), scope=String(req.body.scope||'private');
  if(!req.file)return res.status(400).json({error:'لم يتم اختيار ملف'});
  if(scope==='private'&&!canMedia(u))return res.status(403).json({error:'الصور والفيديو والصوت والاتصال تفتح عند 500 إعجاب'});
  if(scope==='wall'&&!/^image\//.test(req.file.mimetype)&&!/^video\//.test(req.file.mimetype))return res.status(400).json({error:'الحائط يسمح بصورة أو فيديو فقط'});
  const media={url:'/uploads/'+req.file.filename,mime:req.file.mimetype,name:req.file.originalname};
  if(scope==='private'){
    const target=getUser(to)||db.guests[to]||null; if(!target)return res.status(404).json({error:'العضو غير موجود'});
    const tp=profile(to); if(tp.privateOpen===false)return res.status(403).json({error:`لقد أغلق ${displayName(to)} المحادثة الخاصة`});
    const ignored=(db.ignored?.[to]||[]).includes(keyName(u.name)); if(ignored)return res.status(403).json({error:`لقد قام ${displayName(to)} بتجاهلك`});
    const targetSocket=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(to)); if(!targetSocket)return res.status(403).json({error:'هذا المستخدم غير متصل'});
    const m={id:crypto.randomUUID(),room:'__private__',from:u.name,to,type:'media',media,at:Date.now()}; notify(to,{type:'private-media',from:u.name,text:'أرسلك وسائط خاصة'}); io.sockets.sockets.get(targetSocket[0])?.emit('private-media',m); return res.json(m);
  }
  const post={id:crypto.randomUUID(),from:u.name,text:'',media,at:Date.now(),likes:0}; db.wall.push(post); save(); io.emit('wall-new',post); res.json(post);
});

io.on('connection',socket=>{
  socket.on('join',({sid,room='public'}={})=>{
    const pendingGuestCleanup=guestDisconnectTimers.get(sid); if(pendingGuestCleanup){clearTimeout(pendingGuestCleanup);guestDisconnectTimers.delete(sid);}
    const u=sessionUser(sid); if(!u)return;
    socket.data.sid=sid; socket.data.user={...u,room}; socketUsers.set(sid,{...u,room});
    if(roomBanned(u.name,room)){socketUsers.delete(sid);socket.emit('join-error',{error:'أنت محظور من هذه الغرفة'});return;}
    socket.join(room); if(!roomSockets.has(room))roomSockets.set(room,new Set());roomSockets.get(room).add(sid);
    socket.emit('history',{room,items:db.messages.filter(x=>x.room===room).slice(-200)}); const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'join',text:'',at:Date.now(),profile:profile(u.name)}; addMessage(pm); io.to(room).emit('message',pm); emitState();
  });
  socket.on('leave-room',({room}={})=>{const u=socket.data.user,sid=socket.data.sid;if(!u||!room)return;socket.leave(room);roomSockets.get(room)?.delete(sid);if(socketUsers.get(sid))socketUsers.get(sid).room='';if(socket.data.user)socket.data.user.room='';const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'leave',text:'',at:Date.now(),profile:profile(u.name)};addMessage(pm);io.to(room).emit('message',pm);emitState();});
  socket.on('send-message',d=>{const u=socket.data.user;if(!u)return;const room=String(d?.room||'');if(!room)return socket.emit('error-msg',{error:'أنت خارج الغرفة'});if(roomMuted(u.name,room)||roomBanned(u.name,room))return socket.emit('error-msg',{error:'لا يمكنك الكتابة هنا'});const text=String(d?.text||'').trim();if(!text)return;const m={id:crypto.randomUUID(),room,from:u.name,type:'text',text:text.slice(0,2000),at:Date.now(),likes:userLikes(u),profile:profile(u.name)};addMessage(m);io.to(room).emit('message',m);});
  socket.on('private-message',d=>{const u=socket.data.user;if(!u||!d?.to)return;const to=cleanName(d.to),tp=profile(to);if(tp.privateOpen===false)return socket.emit('error-msg',{error:`لقد أغلق ${displayName(to)} المحادثة الخاصة`});const ignored=(db.ignored?.[to]||[]).includes(keyName(u.name));if(ignored)return socket.emit('error-msg',{error:`لقد قام ${displayName(to)} بتجاهلك`});const target=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(to));if(!target)return socket.emit('error-msg',{error:'هذا المستخدم غير متصل'});const m={id:crypto.randomUUID(),from:u.name,fromDisplayName:displayName(u.name),to,toDisplayName:displayName(to),type:'text',text:String(d.text||'').slice(0,2000),at:Date.now()};db.privateMessages=db.privateMessages||[];db.privateMessages.push(m);db.privateMessages=db.privateMessages.slice(-5000);save();io.sockets.sockets.get(target[0])?.emit('private-message',m);socket.emit('private-message',m);});
  socket.on('call-offer',d=>{const u=socket.data.user;if(!u||!canMedia(u)||!d?.to)return;const target=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(d.to));if(!target)return socket.emit('error-msg',{error:'المستخدم غير متصل'});if(!canMedia(target[1]))return socket.emit('error-msg',{error:'الاتصال يحتاج 500 إعجاب للطرفين'});io.sockets.sockets.get(target[0])?.emit('call-offer',{from:u.name,offer:d.offer,video:!!d.video});});
  socket.on('call-answer',d=>{const u=socket.data.user;if(!u||!canMedia(u)||!d?.to)return;const target=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(d.to));if(target)io.sockets.sockets.get(target[0])?.emit('call-answer',{from:u.name,answer:d.answer,video:!!d.video});});
  socket.on('ice',d=>{const u=socket.data.user;if(!u||!d?.to)return;const target=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(d.to));if(target)io.sockets.sockets.get(target[0])?.emit('ice',{from:u.name,candidate:d.candidate});});
  socket.on('disconnect',()=>{
    const sid=socket.data.sid,u=socket.data.user,room=socket.data.user&&socket.data.user.room;
    if(sid)socketUsers.delete(sid);
    if(room)roomSockets.get(room)?.delete(sid);
    if(u&&room){const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'leave',text:'',at:Date.now(),profile:profile(u.name)};addMessage(pm);io.to(room).emit('message',pm);}
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

app.get(/.*/,(req,res,next)=>{
  res.sendFile(path.join(ROOT,'public','index.html'), err => {
    if (err) next(err);
  });
});
