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

const defaults = () => ({
  users: {}, guests: {}, sessions: {}, messages: [], privateMessages: [], wall: [], notifications: {},
  profiles: {}, lastLike: {}, permissionOverrides: {},
  rooms: [
    { id:'public', name:'الغرفة العامة', desc:'غرفة عامة ..', kind:'public', capacity:200, mics:0, owner:'admin' },
    { id:'friends', name:'غرفة الأصدقاء', desc:'غرفة خاصة ..', kind:'private', capacity:100, mics:0, owner:'admin' },
    { id:'love', name:'غرفة الحب', desc:'غرفة خاصة ..', kind:'private', capacity:100, mics:0, owner:'admin' },
    { id:'voice', name:'غرفة الصوت', desc:'مايك ..', kind:'voice', capacity:50, mics:8, owner:'admin' }
  ],
  roomBans:{}, roomMutes:{}, roomKicks:{},
  wallLikes:{}, wallComments:{}
});

let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = defaults(); }
for (const [k,v] of Object.entries(defaults())) if (db[k] === undefined) db[k] = v;
function save(){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

const sessions = new Map(); // sid -> {name,type,created}
for (const [sid,s] of Object.entries(db.sessions||{})) sessions.set(sid,s);
const roomSockets = new Map();
const socketUsers = new Map();

function cleanName(v){ return String(v||'').trim().replace(/\s+/g,' ').slice(0,32); }
function keyName(n){ return cleanName(n).toLowerCase(); }
function isAdmin(u){
  if (!u || u.type !== 'member') return false;
  const n = keyName(u.name);
  const owner = keyName(process.env.ADMIN_NAME || 'admin');
  return n === 'admin' || n === owner;
}
function getUser(name){ return db.users[cleanName(name)] || null; }
function userLikes(u){ if (!u) return 0; if (isAdmin(u)) return 999999; return Number(getUser(u.name)?.likes ?? db.guests[u.name]?.likes ?? u.likes ?? 0); }
function level(l){ l=Number(l)||0; return l>=500?3:l>=400?2:1; }
function canNotice(u){ return isAdmin(u) || userLikes(u)>=400; }
function canMedia(u){ return isAdmin(u) || userLikes(u)>=500; }
function profile(name){
  if (!db.profiles[name]) db.profiles[name]={displayName:cleanName(name),avatar:'',status:'متصل الآن',bio:'عضو في دردشة ريماز عراقية',nameColor:'#222222',fontColor:'#222222',bgColor:'#ffffff',privateOpen:true,notificationsOpen:true};
  const p=db.profiles[name];
  if(!p.displayName) p.displayName=cleanName(name);
  if(!p.status) p.status='متصل الآن';
  if(!p.fontColor) p.fontColor=p.nameColor||'#222222';
  return p;
}
function displayName(name){ return profile(name).displayName || cleanName(name); }
function sessionUser(sid){ const s=sessions.get(sid); if(!s)return null; return {...s, likes:isAdmin(s)?999999:userLikes(s)}; }
function makeSession(name,type){
  const sid=crypto.randomBytes(24).toString('hex');
  const s={name,type,created:Date.now()}; sessions.set(sid,s); db.sessions[sid]=s; save(); return sid;
}
function requireAuth(req,res,next){
  const u=sessionUser(req.get('x-session')); if(!u)return res.status(401).json({error:'يجب تسجيل الدخول'}); req.user=u; next();
}
function requireAdmin(req,res,next){ requireAuth(req,res,()=>isAdmin(req.user)?next():res.status(403).json({error:'صلاحية الادمن فقط'})); }
function emitState(){ io.emit('live-state', {online:getOnlineUsers(), rooms:db.rooms}); }
function getOnlineUsers(){
  const arr=[]; for(const u of socketUsers.values()) arr.push({...u,displayName:displayName(u.name),likes:userLikes(u),level:level(userLikes(u)),profile:profile(u.name)});
  const seen=new Set(); return arr.filter(x=>{const k=keyName(x.name); if(seen.has(k))return false; seen.add(k); return true;});
}
function onlineInRoom(room){
  const set=roomSockets.get(room); if(!set)return 0; return [...set].filter(sid=>socketUsers.has(sid)).length;
}
function roomBanned(name,room){ return Array.isArray(db.roomBans[room]) && db.roomBans[room].includes(keyName(name)); }
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
app.post('/api/logout',requireAuth,(req,res)=>{ const sid=req.get('x-session'); sessions.delete(sid); delete db.sessions[sid]; save(); res.json({ok:true}); });

app.get('/api/state',requireAuth,(req,res)=>{
  const u=req.user; const likes=userLikes(u); const rooms=db.rooms.map(r=>({...r,online:onlineInRoom(r.id)}));
  res.json({user:{...u,likes,level:level(likes),admin:isAdmin(u),profile:profile(u.name),notice:canNotice(u),media:canMedia(u)}, rooms, online:getOnlineUsers().map(x=>({name:x.name,type:x.type,likes:x.likes,level:x.level,profile:x.profile}))});
});
app.get('/api/history',requireAuth,(req,res)=>{ const room=String(req.query.room||'public'); res.json(db.messages.filter(x=>x.room===room).slice(-200)); });
app.get('/api/wall',requireAuth,(req,res)=>res.json(db.wall.slice(-100).reverse()));
app.post('/api/wall',requireAuth,(req,res)=>{const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'اكتب منشورك'});const p={id:crypto.randomUUID(),from:req.user.name,text:text.slice(0,2000),media:null,at:Date.now(),likes:0};db.wall.push(p);db.wall=db.wall.slice(-300);save();io.emit('wall-new',p);res.json(p);});
app.post('/api/wall/like',requireAuth,(req,res)=>{const p=db.wall.find(x=>x.id===req.body.id);if(!p)return res.status(404).json({error:'المنشور غير موجود'});p.likes=Number(p.likes||0)+1;save();io.emit('wall-like',{id:p.id,likes:p.likes});res.json({ok:true,likes:p.likes});});
app.post('/api/notify',requireAuth,(req,res)=>{if(!canNotice(req.user))return res.status(403).json({error:'التنبيهات تفتح عند 400 إعجاب'});const to=cleanName(req.body.to),p=profile(to);if(!getUser(to)&&!db.guests[to]&&!Object.keys(db.guests).some(x=>keyName(x)===keyName(to)))return res.status(404).json({error:'العضو غير موجود'});if(p.notificationsOpen===false)return res.status(403).json({error:'لقد أغلق التنبيه'});notify(to,{type:'notice',from:req.user.name,text:String(req.body.text||'تنبيه من عضو').slice(0,500)});for(const [socketId,u] of socketUsers){if(keyName(u.name)===keyName(to))io.sockets.sockets.get(socketId)?.emit('notification',{from:req.user.name,text:String(req.body.text||'تنبيه من عضو').slice(0,500)});}res.json({ok:true});});
app.get('/api/notifications',requireAuth,(req,res)=>res.json((db.notifications[req.user.name]||[]).slice(0,50)));
app.post('/api/notifications/read',requireAuth,(req,res)=>{db.notifications[req.user.name]=[];save();res.json({ok:true});});

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
  const target=getUser(to); const guestTarget=db.guests[to]; if(!target&&!guestTarget)return res.status(404).json({error:'العضو غير موجود'});
  const k=from.name+'::'+to, now=Date.now(); if(now-(db.lastLike[k]||0)<10000)return res.status(429).json({error:'انتظر 10 ثواني بين الإعجابات'}); db.lastLike[k]=now;
  if(target) target.likes=Number(target.likes||0)+1; else guestTarget.likes=Number(guestTarget.likes||0)+1; save(); const l=target?target.likes:guestTarget.likes;
  if(l===400)notify(to,{type:'unlock',text:'مبروك، تم فتح التنبيهات عند 400 إعجاب'});
  if(l===500)notify(to,{type:'unlock',text:'مبروك، تم فتح الصور والفيديو والصوت والاتصال عند 500 إعجاب'});
  io.emit('likes-changed',{name:to,likes:l,level:level(l)}); res.json({ok:true,likes:l,level:level(l)});
});
app.post('/api/admin/grant-like',requireAdmin,(req,res)=>{const n=cleanName(req.body.name), amount=Math.max(1,Math.min(100000,Number(req.body.amount)||1));const memberKey=Object.keys(db.users).find(x=>keyName(x)===keyName(n));const guestKey=Object.keys(db.guests).find(x=>keyName(x)===keyName(n));let likes;if(memberKey){db.users[memberKey].likes=Number(db.users[memberKey].likes||0)+amount;likes=db.users[memberKey].likes;}else if(guestKey){db.guests[guestKey].likes=Number(db.guests[guestKey].likes||0)+amount;likes=db.guests[guestKey].likes;}else return res.status(404).json({error:'العضو غير موجود'});save();io.emit('likes-changed',{name:memberKey||guestKey,likes,level:level(likes)});res.json({ok:true,likes});});
app.post('/api/admin/reset-likes',requireAdmin,(req,res)=>{const n=cleanName(req.body.name);const memberKey=Object.keys(db.users).find(x=>keyName(x)===keyName(n));const guestKey=Object.keys(db.guests).find(x=>keyName(x)===keyName(n));if(memberKey)db.users[memberKey].likes=0;else if(guestKey)db.guests[guestKey].likes=0;else return res.status(404).json({error:'العضو غير موجود'});save();io.emit('likes-changed',{name:memberKey||guestKey,likes:0,level:1});res.json({ok:true});});
app.post('/api/admin/broadcast',requireAdmin,(req,res)=>{const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'النص فارغ'});const m={id:crypto.randomUUID(),room:'public',from:req.user.name,displayName:displayName(req.user.name),type:'admin-notice',text:'📢 '+text,at:Date.now(),likes:userLikes(req.user),profile:profile(req.user.name)};addMessage(m);io.to('public').emit('message',m);io.emit('admin-notice',{text,from:req.user.name});res.json({ok:true,message:m});});
app.delete('/api/admin/message/:id',requireAdmin,(req,res)=>{const id=req.params.id;db.messages=db.messages.filter(x=>x.id!==id);save();io.emit('message-deleted',{id});res.json({ok:true});});
app.get('/api/admin/data',requireAdmin,(req,res)=>res.json({users:Object.entries(db.users).map(([name,u])=>({name,type:'member',likes:u.likes||0,level:level(u.likes||0),profile:profile(name)})),guests:Object.entries(db.guests).map(([name,u])=>({name,type:'guest',likes:u.likes||0,level:level(u.likes||0),profile:profile(name)})),rooms:db.rooms,messages:db.messages.slice(-100).reverse()}));
app.post('/api/admin/room',requireAdmin,(req,res)=>{const name=cleanName(req.body.name),kind=req.body.kind==='voice'?'voice':req.body.kind==='private'?'private':'public';if(!name)return res.status(400).json({error:'اسم الغرفة مطلوب'});const id='r_'+crypto.randomBytes(5).toString('hex');db.rooms.push({id,name,desc:String(req.body.desc||'غرفة جديدة'),kind,capacity:Math.max(2,Number(req.body.capacity)||50),mics:kind==='voice'?Math.max(1,Number(req.body.mics)||8):0,owner:req.user.name});save();emitState();res.json({ok:true});});
app.delete('/api/admin/room/:id',requireAdmin,(req,res)=>{if(['public','voice'].includes(req.params.id))return res.status(400).json({error:'الغرفة الأساسية لا تحذف'});db.rooms=db.rooms.filter(r=>r.id!==req.params.id);save();emitState();res.json({ok:true});});
function roomAction(type,req,res){const room=String(req.body.room||'public'),name=keyName(req.body.name);if(!name)return res.status(400).json({error:'الاسم مطلوب'});db[type][room]=db[type][room]||[];if(type==='roomMutes'||type==='roomBans'){if(!db[type][room].includes(name))db[type][room].push(name);}else db[type][room]=db[type][room].filter(x=>x!==name);save();for(const [sid,u] of socketUsers){if(keyName(u.name)===name&&u.room===room&&type==='roomKicks'){const s=io.sockets.sockets.get(sid);s?.leave(room);roomSockets.get(room)?.delete(sid);s?.emit('kicked',{room});}}emitState();res.json({ok:true});}
app.post('/api/admin/kick',(req,res)=>{requireAdmin(req,res,()=>{const room=String(req.body.room||'public'),name=keyName(req.body.name);for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===name&&u2.room===room){const so=io.sockets.sockets.get(sid2);so?.leave(room);roomSockets.get(room)?.delete(sid2);so?.emit('kicked',{room});}}emitState();res.json({ok:true});});});
app.post('/api/admin/mute',(req,res)=>{requireAdmin(req,res,()=>roomAction('roomMutes',req,res));});
app.post('/api/admin/ban',(req,res)=>{requireAdmin(req,res,()=>roomAction('roomBans',req,res));});
app.post('/api/admin/unban',(req,res)=>{requireAdmin(req,res,()=>{const room=String(req.body.room||'public'),name=keyName(req.body.name);db.roomBans[room]=(db.roomBans[room]||[]).filter(x=>x!==name);save();res.json({ok:true});});});

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

app.get('/api/private/history',requireAuth,(req,res)=>{const meName=keyName(req.user.name),to=keyName(req.query.to||'');if(!to)return res.json([]);const rows=db.privateMessages.filter(m=>(keyName(m.from)===meName&&keyName(m.to)===to)||(keyName(m.from)===to&&keyName(m.to)===meName)).slice(-300);res.json(rows);});
app.get('/api/private/threads',requireAuth,(req,res)=>{const meName=keyName(req.user.name),seen=new Map();for(const m of (db.privateMessages||[])){let other=null;if(keyName(m.from)===meName)other=m.to;else if(keyName(m.to)===meName)other=m.from;if(other)seen.set(keyName(other),other);}const unread=(db.notifications[req.user.name]||[]).filter(n=>n.type==='private'&&!n.read);const rows=[...seen.entries()].map(([k,name])=>({name,unread:unread.filter(n=>keyName(n.from)===k).length}));res.json(rows);});
app.post('/api/private/read',requireAuth,(req,res)=>{const from=keyName(req.body.from||'');db.notifications[req.user.name]=(db.notifications[req.user.name]||[]).filter(n=>!(n.type==='private'&&(!from||keyName(n.from)===from)));save();res.json({ok:true});});

app.post('/api/media',requireAuth,upload.single('file'),(req,res)=>{
  const u=req.user, to=cleanName(req.body.to||''), scope=String(req.body.scope||'private');
  if(!req.file)return res.status(400).json({error:'لم يتم اختيار ملف'});
  if(scope==='private'&&!canMedia(u))return res.status(403).json({error:'الصور والفيديو والصوت والاتصال تفتح عند 500 إعجاب'});
  if(scope==='wall'&&!/^image\//.test(req.file.mimetype)&&!/^video\//.test(req.file.mimetype))return res.status(400).json({error:'الحائط يسمح بصورة أو فيديو فقط'});
  const media={url:'/uploads/'+req.file.filename,mime:req.file.mimetype,name:req.file.originalname};
  if(scope==='private'){
    const target=getUser(to)||db.guests[to]||null; if(!target)return res.status(404).json({error:'العضو غير موجود'});
    const tp=profile(to); if(tp.privateOpen===false)return res.status(403).json({error:`لقد أغلق ${displayName(to)} المحادثة الخاصة`});
    const m={id:crypto.randomUUID(),room:'__private__',from:u.name,to,type:'media',media,at:Date.now()}; notify(to,{type:'private-media',from:u.name,text:'أرسلك وسائط خاصة'}); for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===keyName(to))io.sockets.sockets.get(sid2)?.emit('private-media',m);} return res.json(m);
  }
  const post={id:crypto.randomUUID(),from:u.name,text:'',media,at:Date.now(),likes:0}; db.wall.push(post); save(); io.emit('wall-new',post); res.json(post);
});

io.on('connection',socket=>{
  socket.on('join',({sid,room='public'}={})=>{
    const u=sessionUser(sid); if(!u)return;
    socket.data.sid=sid; socket.data.user=u; socketUsers.set(socket.id,{...u,sid,room});
    if(roomBanned(u.name,room)){socket.emit('join-error',{error:'أنت محظور من هذه الغرفة'});return;}
    socket.join(room); if(!roomSockets.has(room))roomSockets.set(room,new Set());roomSockets.get(room).add(socket.id);
    socket.emit('history',db.messages.filter(x=>x.room===room).slice(-200)); io.emit('presence',{name:u.name,displayName:displayName(u.name),status:profile(u.name).status,profile:profile(u.name),action:'join',room}); emitState();
  });
  socket.on('leave-room',({room}={})=>{const u=socket.data.user,sid=socket.data.sid;if(!u)return;socket.leave(room);roomSockets.get(room)?.delete(socket.id);if(socketUsers.has(socket.id))socketUsers.get(socket.id).room='';io.emit('presence',{name:u.name,displayName:displayName(u.name),status:profile(u.name).status,profile:profile(u.name),action:'leave',room});emitState();});
  socket.on('send-message',d=>{const u=socket.data.user;if(!u)return;const room=String(d?.room||'public');if(roomMuted(u.name,room)||roomBanned(u.name,room))return socket.emit('error-msg',{error:'لا يمكنك الكتابة هنا'});const text=String(d?.text||'').trim();if(!text)return;const m={id:crypto.randomUUID(),room,from:u.name,type:'text',text:text.slice(0,2000),at:Date.now(),likes:userLikes(u),profile:profile(u.name)};addMessage(m);io.to(room).emit('message',m);});
  socket.on('private-message',d=>{const u=socket.data.user;if(!u||!d?.to)return;const to=cleanName(d.to),tp=profile(to);if(tp.privateOpen===false)return socket.emit('error-msg',{error:`لقد أغلق ${displayName(to)} المحادثة الخاصة`});const target=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(to));if(!target)return socket.emit('error-msg',{error:'المستخدم غير متصل'});const m={id:crypto.randomUUID(),from:u.name,fromDisplayName:displayName(u.name),to,toDisplayName:displayName(to),type:'text',text:String(d.text||'').slice(0,2000),at:Date.now()};db.privateMessages=db.privateMessages||[];db.privateMessages.push(m);if(db.privateMessages.length>5000)db.privateMessages.splice(0,db.privateMessages.length-5000);save();notify(to,{type:'private',from:u.name,text:'رسالة خاصة جديدة'});io.sockets.sockets.get(target[0])?.emit('private-message',m);socket.emit('private-message',m);});
  socket.on('call-offer',d=>{const u=socket.data.user;if(!u||!canMedia(u)||!d?.to)return;const target=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(d.to));if(!target)return socket.emit('error-msg',{error:'المستخدم غير متصل'});if(!canMedia(target[1]))return socket.emit('error-msg',{error:'الاتصال يحتاج 500 إعجاب للطرفين'});io.sockets.sockets.get(target[0])?.emit('call-offer',{from:u.name,offer:d.offer,video:!!d.video});});
  socket.on('call-answer',d=>{const u=socket.data.user;if(!u||!canMedia(u)||!d?.to)return;const target=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(d.to));if(target)io.sockets.sockets.get(target[0])?.emit('call-answer',{from:u.name,answer:d.answer,video:!!d.video});});
  socket.on('ice',d=>{const u=socket.data.user;if(!u||!d?.to)return;const target=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(d.to));if(target)io.sockets.sockets.get(target[0])?.emit('ice',{from:u.name,candidate:d.candidate});});
  socket.on('disconnect',()=>{const sid=socket.data.sid,u=socket.data.user,room=socket.data.user&&socket.data.user.room;if(socket.id)socketUsers.delete(socket.id);if(room)roomSockets.get(room)?.delete(socket.id);if(u)io.emit('presence',{name:u.name,displayName:displayName(u.name),status:profile(u.name).status,profile:profile(u.name),action:'leave',room:room||''});emitState();});
});

app.use((req,res)=>res.sendFile(path.join(ROOT,'index.html')));
server.listen(PORT,()=>console.log(`Rimaz server listening on ${PORT}`));
