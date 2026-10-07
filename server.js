const express=require("express");
const http=require("http");
const path=require("path");
const fs=require("fs");
const bcrypt=require("bcryptjs");
const multer=require("multer");
const {Server}=require("socket.io");

const app=express(),server=http.createServer(app),io=new Server(server);
const PORT=process.env.PORT||3000;
const DATA=path.join("/data","data.json");
const UP=path.join("/data","uploads");
if(!fs.existsSync("/data"))fs.mkdirSync("/data",{recursive:true});
if(!fs.existsSync(UP))fs.mkdirSync(UP,{recursive:true});

const db=fs.existsSync(DATA)?JSON.parse(fs.readFileSync(DATA,"utf8")):{
 users:{},guests:[],messages:[],wall:[],likes:{},lastLike:{},sessions:{},
 notifications:{},profiles:{},permissionOverrides:{},settings:{},rooms:{},roomBans:{},roomMutes:{},roomKicks:{}
};
const save=()=>fs.writeFileSync(DATA,JSON.stringify(db,null,2));

// تتبع الاتصالات حتى لا يؤدي انقطاع Socket مؤقت إلى طرد المستخدم
// أو إظهاره كأنه خرج بينما يعيد الاتصال.
const connectedSockets=new Map();
const disconnectTimers=new Map();
for(const k of ["notifications","profiles","permissionOverrides","settings","likes","rooms","roomBans","roomMutes","roomKicks"])db[k]=db[k]||{};
db.users=db.users||{};db.guests=db.guests||[];db.messages=db.messages||[];db.wall=db.wall||[];db.sessions=db.sessions||{};db.lastLike=db.lastLike||{};

const defaultRooms=[
 {name:"الغرفة العامة",count:0,desc:"نص فقط",kind:"public",capacity:200,mics:0,owner:"admin",media:false},
 {name:"غرفة المايك",count:0,desc:"مايك فقط",kind:"voice",capacity:50,mics:8,owner:"admin",media:false}
];
// إزالة الغرف التجريبية/الزائدة من النسخ القديمة؛ الغرف الجديدة ينشئها المالك من لوحة الإدارة.
for(const name of ["الغرفة العامة","غرفة المايك"]) if(!db.rooms[name]) db.rooms[name]=defaultRooms.find(r=>r.name===name);
for(const name of Object.keys(db.rooms)){ if(["غرفة عامة + مايك","غرفة شخصين","غرفة المسابقات","غرفة ريماز","غرفة الإدارة"].includes(name)) delete db.rooms[name]; }



function clean(s){return String(s??"").trim().slice(0,40)}
function profileOf(name){return db.profiles[name]||{avatar:"👤",status:"متصل الآن",bio:"عضو في دردشة ريماز عراقية",nameColor:"#222222",bgColor:"#ffffff"}}
function roleOf(u){ if(!u||u.type!=="member") return "guest"; const rec=db.users[u.name]||{}; return rec.role || (String(u.name).toLowerCase()==="admin" ? "owner" : "member"); }
function isOwner(u){return roleOf(u)==="owner"}
function isAdmin(u){const r=roleOf(u);return r==="owner"||r==="superadmin"||r==="admin"}
function normalizeOwner(u){if(isOwner(u)&&db.users[u.name]){db.users[u.name].likes=Math.max(Number(db.users[u.name].likes)||0,9999)}return u}
function likesOf(n){return db.users[n]?.likes||0}
function userLikes(u){return u?.type==="member"?likesOf(u.name):(u?.likes||0)}
function level(l){return l>=500?3:l>=400?2:1}
function canMedia(u){return isAdmin(u)||userLikes(u)>=500}
function canNotice(u){return isAdmin(u)||userLikes(u)>=400}
function userFrom(req){const sid=req.headers["x-session"];return sid&&db.sessions[sid]?db.sessions[sid]:null}
function roomOf(n){return db.rooms[n]||null}
function roomList(){return Object.values(db.rooms)}
function roomDenied(u,room){
 const r=roomOf(room);if(!r)return"الغرفة غير موجودة";
 const key=room+"::"+u.name,now=Date.now();
 const ban=db.roomBans[key];if(ban&&(!ban.until||ban.until>now))return"أنت محظور من هذه الغرفة";
 const kick=db.roomKicks[key];if(kick&&kick>now)return"تم طردك مؤقتًا من هذه الغرفة";
 if(r.kind==="admin"&&!isAdmin(u))return"غرفة الإدارة للمشرف والإدارة فقط";
 return null;
}
function roomMuted(u,room){return (db.roomMutes[room+"::"+u.name]||0)>Date.now()}
function roomAllowsText(room){const r=roomOf(room);return !!r && r.kind!=="voice"}
function roomAllowsMic(room){const r=roomOf(room);return !!r && (r.kind==="voice"||r.kind==="public_voice")}
function destroySession(sid,announce=true){
 const u=db.sessions[sid];
 if(!u)return;
 const room=u.room;
 delete db.sessions[sid];
 if(u.type==="guest"){
  const still=Object.values(db.sessions).some(x=>x.type==="guest"&&x.name===u.name);
  if(!still)db.guests=db.guests.filter(x=>x!==u.name);
 }
 if(announce&&room)io.to(room).emit("room-presence",{name:u.name,action:"leave"});
 save();
}
function bindSocket(sid,socket){
 if(disconnectTimers.has(sid)){clearTimeout(disconnectTimers.get(sid));disconnectTimers.delete(sid)}
 if(!connectedSockets.has(sid))connectedSockets.set(sid,new Set());
 connectedSockets.get(sid).add(socket.id);
 socket.data.sid=sid;
}
function unbindSocket(socket){
 const sid=socket.data.sid;
 if(!sid)return;
 const set=connectedSockets.get(sid);
 if(set){
  set.delete(socket.id);
  if(set.size===0){
   connectedSockets.delete(sid);
   const timer=setTimeout(()=>{
    disconnectTimers.delete(sid);
    if(db.sessions[sid])destroySession(sid,true);
   },8000);
   disconnectTimers.set(sid,timer);
  }
 }
}
function makeSession(name,type,likes=0){
 const sid=require("crypto").randomUUID();
 db.sessions[sid]={name,type,likes,lastLike:0,room:"",privateWith:"",mic:false,created:Date.now()};
 save();
 return sid;
}

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));
const upload=multer({dest:UP,limits:{fileSize:100*1024*1024}});

app.get("/api/state",(req,res)=>{
 const u=userFrom(req),ul=u?(isAdmin(u)?9999:userLikes(u)):0;
 res.json({user:u?{name:u.name,type:u.type,likes:ul,level:level(ul),admin:isAdmin(u),profile:profileOf(u.name),role:roleOf(u)}:null,
 rooms:roomList().map(r=>({...r,online:Object.values(db.sessions).filter(x=>x.room===r.name).length}))});
});

app.post("/api/register",(req,res)=>{
 const n=clean(req.body.name),p=String(req.body.password||"");
 if(!n||!p)return res.status(400).json({error:"اكتب الاسم والباسورد"});
 if(db.users[n])return res.status(409).json({error:"الاسم مستخدم"});
 db.users[n]={hash:bcrypt.hashSync(p,10),likes:String(n).toLowerCase()==="admin"?9999:0,role:String(n).toLowerCase()==="admin"?"owner":"member",settings:{privateOpen:true,notificationsOpen:true}};save();res.json({sid:makeSession(n,"member",String(n).toLowerCase()==="admin"?9999:0)});
});
app.post("/api/login",(req,res)=>{
 const n=clean(req.body.name),p=String(req.body.password||"");
 if(!db.users[n]||!bcrypt.compareSync(p,db.users[n].hash))return res.status(401).json({error:"الاسم أو الباسورد غير صحيح"});
 res.json({sid:makeSession(n,"member",String(n).toLowerCase()==="admin"?9999:0)});
});
app.post("/api/guest",(req,res)=>{
 const n=clean(req.body.name);
 // تنظيف أسماء الضيوف القديمة التي لم تعد لها جلسة فعلية
 db.guests=db.guests.filter(g=>Object.values(db.sessions).some(x=>x.type==="guest"&&x.name===g));
 if(!n||db.users[n]||Object.values(db.sessions).some(x=>x.name===n))return res.status(409).json({error:"الاسم مستخدم، اختر اسمًا آخر"});
 db.guests.push(n);
 res.json({sid:makeSession(n,"guest",0)});
});
app.post("/api/logout",(req,res)=>{
 const sid=req.headers["x-session"];
 if(!sid||!db.sessions[sid])return res.json({ok:true});
 destroySession(sid,true);
 const set=connectedSockets.get(sid);
 if(set)for(const id of set){const s=io.sockets.sockets.get(id);if(s){s.data.sid="";s.data.user=null;s.data.room="";}}
 connectedSockets.delete(sid);
 if(disconnectTimers.has(sid)){clearTimeout(disconnectTimers.get(sid));disconnectTimers.delete(sid)}
 res.json({ok:true});
});

app.get("/api/messages",(req,res)=>{const room=clean(req.query.room)||"الغرفة العامة";res.json(db.messages.filter(m=>m.room===room).slice(-100))});

app.post("/api/like",(req,res)=>{
 const u=userFrom(req),to=clean(req.body.to);if(!u)return res.status(401).json({error:"سجل الدخول"});
 if(!to||to===u.name)return res.status(400).json({error:"لا يمكنك إعطاء إعجاب لنفسك"});
 const now=Date.now(),last=u.type==="member"?(db.lastLike[u.name]||0):(u.lastLike||0);
 if(now-last<10000)return res.status(429).json({error:`انتظر ${Math.ceil((10000-(now-last))/1000)} ثوانٍ`});
 if(u.type==="member")db.lastLike[u.name]=now;else u.lastLike=now;
 if(db.users[to])db.users[to].likes=(db.users[to].likes||0)+1;
 else{const target=Object.values(db.sessions).find(s=>s.type==="guest"&&s.name===to);if(!target)return res.status(404).json({error:"العضو غير متصل"});target.likes=(target.likes||0)+1}
 db.notifications[to]=db.notifications[to]||[];
 db.notifications[to].unshift({id:require("crypto").randomUUID(),type:"like",from:u.name,text:`لقد وصلك لايك من ${u.name} ❤️`,time:now,read:false});
 db.notifications[to]=db.notifications[to].slice(0,100);save();
 res.json({ok:true,targetLikes:db.users[to]?likesOf(to):(Object.values(db.sessions).find(s=>s.name===to)?.likes||0),cooldown:10});
});

app.get("/api/members",(req,res)=>{
 const u=userFrom(req);if(!u)return res.status(401).json({error:"سجل الدخول"});
 const members=[...new Set(Object.keys(db.users).filter(Boolean))].map(name=>({name,likes:likesOf(name),level:level(likesOf(name)),profile:profileOf(name),online:Object.values(db.sessions).some(x=>x.name===name)}));
 const guests=Object.values(db.sessions).filter(x=>x.type==="guest").map(x=>({name:x.name,likes:x.likes||0,level:level(x.likes||0),profile:profileOf(x.name),online:true,type:"guest"}));
 res.json([...members,...guests].sort((a,b)=>b.likes-a.likes));
});
app.get("/api/online",(req,res)=>{
 const u=userFrom(req);if(!u)return res.status(401).json({error:"سجل الدخول"});
 res.json(Object.values(db.sessions).map(x=>({name:x.name,type:x.type,likes:userLikes(x),level:level(userLikes(x)),room:x.room,profile:profileOf(x.name),admin:isAdmin(x)})));
});
app.get("/api/profile",(req,res)=>{const u=userFrom(req);if(!u)return res.status(401).json({error:"سجل الدخول"});res.json({name:u.name,type:u.type,likes:userLikes(u),level:level(userLikes(u)),profile:profileOf(u.name),admin:isAdmin(u)})});
app.post("/api/profile",(req,res)=>{
 const u=userFrom(req);if(!u)return res.status(401).json({error:"سجل الدخول"});
 const old=profileOf(u.name),p={...old,avatar:String(req.body.avatar||old.avatar).slice(0,4),status:String(req.body.status||old.status).slice(0,80),bio:String(req.body.bio||old.bio).slice(0,300),nameColor:String(req.body.nameColor||old.nameColor).slice(0,20),bgColor:String(req.body.bgColor||old.bgColor).slice(0,20)};
 db.profiles[u.name]=p;save();res.json({ok:true,profile:p});
});
app.get("/api/notifications",(req,res)=>{const u=userFrom(req);if(!u)return res.status(401).json({error:"سجل الدخول"});res.json((db.notifications[u.name]||[]).slice(0,50))});
app.post("/api/notifications/read",(req,res)=>{const u=userFrom(req);if(!u)return res.status(401).json({error:"سجل الدخول"});(db.notifications[u.name]||[]).forEach(n=>n.read=true);save();res.json({ok:true})});
app.post("/api/notify",(req,res)=>{
 const u=userFrom(req),to=clean(req.body.to),text=String(req.body.text||"").trim().slice(0,240);
 if(!u)return res.status(401).json({error:"سجل الدخول"});
 if(!canNotice(u))return res.status(403).json({error:"إرسال التنبيهات يفتح عند 400 إعجاب"});
 if(!to||!text)return res.status(400).json({error:"اختر عضوًا واكتب التنبيه"});
 const targetSettings=db.settings[to]||{privateOpen:true,notificationsOpen:true}; if(!targetSettings.notificationsOpen&&!isAdmin(u))return res.status(403).json({error:"هذا الشخص لقد اغلق التنبيه"});
 db.notifications[to]=db.notifications[to]||[];db.notifications[to].unshift({id:require("crypto").randomUUID(),type:"notice",from:u.name,text,time:Date.now(),read:false});db.notifications[to]=db.notifications[to].slice(0,100);save();res.json({ok:true});
});

app.get("/api/settings",(req,res)=>{const u=userFrom(req);if(!u)return res.status(401).json({error:"سجل الدخول"});const st=db.settings[u.name]||{privateOpen:true,notificationsOpen:true};res.json(st)});
app.post("/api/settings",(req,res)=>{const u=userFrom(req);if(!u)return res.status(401).json({error:"سجل الدخول"});const old=db.settings[u.name]||{privateOpen:true,notificationsOpen:true};db.settings[u.name]={privateOpen:req.body.privateOpen!==undefined?!!req.body.privateOpen:old.privateOpen,notificationsOpen:req.body.notificationsOpen!==undefined?!!req.body.notificationsOpen:old.notificationsOpen};save();res.json({ok:true,settings:db.settings[u.name]})});

app.post("/api/admin/grant-like",(req,res)=>{const u=userFrom(req),to=clean(req.body.to),amount=Math.max(1,Math.min(100000,Number(req.body.amount)||1));if(!isAdmin(u))return res.status(403).json({error:"الإدارة فقط"});if(isOwner(u)===false && to && db.users[to] && roleOf({type:"member",name:to})==="owner")return res.status(403).json({error:"لا يمكن تعديل المالك"});if(db.users[to]){db.users[to].likes=(db.users[to].likes||0)+amount;save();return res.json({ok:true,likes:db.users[to].likes})}const guest=Object.values(db.sessions).find(x=>x.type==="guest"&&x.name===to);if(guest){guest.likes=(guest.likes||0)+amount;save();return res.json({ok:true,likes:guest.likes,temporary:true})}return res.status(404).json({error:"العضو غير موجود"})});
app.post("/api/admin/set-like",(req,res)=>{const u=userFrom(req),to=clean(req.body.to),likes=Math.max(0,Math.min(1000000,Number(req.body.likes)||0));if(!isAdmin(u))return res.status(403).json({error:"الإدارة فقط"});if(db.users[to]){if(roleOf({type:"member",name:to})==="owner"&&!isOwner(u))return res.status(403).json({error:"لا يمكن تعديل المالك"});db.users[to].likes=likes;save();return res.json({ok:true,likes})}const g=Object.values(db.sessions).find(x=>x.type==="guest"&&x.name===to);if(g){g.likes=likes;save();return res.json({ok:true,likes,temporary:true})}return res.status(404).json({error:"العضو غير موجود"})});
app.post("/api/admin/reset-like",(req,res)=>{const u=userFrom(req),to=clean(req.body.to);if(!isAdmin(u))return res.status(403).json({error:"الإدارة فقط"});if(!db.users[to])return res.status(404).json({error:"العضو غير موجود"});if(roleOf({type:"member",name:to})==="owner"&&!isOwner(u))return res.status(403).json({error:"لا يمكن تصفير المالك"});db.users[to].likes=0;save();res.json({ok:true,likes:0})});
app.post("/api/admin/role",(req,res)=>{const u=userFrom(req),to=clean(req.body.to),role=String(req.body.role||"member");if(!isOwner(u))return res.status(403).json({error:"المالك فقط"});if(!["member","admin","superadmin","owner"].includes(role)||!db.users[to])return res.status(400).json({error:"العضو أو الصلاحية غير صحيحة"});if(to===u.name&&role!=="owner")return res.status(400).json({error:"لا يمكن إزالة صلاحية المالك"});db.users[to].role=role;if(role!=="owner")db.users[to].likes=Math.min(Number(db.users[to].likes)||0,1000000);save();res.json({ok:true,name:to,role})});
app.get("/api/admin/users",(req,res)=>{const u=userFrom(req);if(!isAdmin(u))return res.status(403).json({error:"الإدارة فقط"});res.json(Object.entries(db.users).map(([name,v])=>({name,likes:v.likes||0,role:v.role||"member",online:Object.values(db.sessions).some(s=>s.type==="member"&&s.name===name)})))});
app.post("/api/admin/banner",(req,res)=>{const u=userFrom(req);if(!isAdmin(u))return res.status(403).json({error:"الإدارة فقط"});const text=String(req.body.text||"").trim().slice(0,300);db.banner=text;save();io.emit("banner",{text});res.json({ok:true,text})});
app.post("/api/admin/remove-user",(req,res)=>{const u=userFrom(req),to=clean(req.body.to);if(!isAdmin(u))return res.status(403).json({error:"الإدارة فقط"});if(!db.users[to])return res.status(404).json({error:"العضو غير موجود"});if(to===u.name||roleOf({type:"member",name:to})==="owner"&&!isOwner(u))return res.status(403).json({error:"لا يمكن حذف هذا الحساب"});delete db.users[to];delete db.profiles[to];delete db.notifications[to];for(const sid of Object.keys(db.sessions)){if(db.sessions[sid].name===to)destroySession(sid,true)}save();res.json({ok:true})});

app.get("/api/rooms",(req,res)=>{
 const u=userFrom(req);if(!u)return res.status(401).json({error:"سجل الدخول"});
 res.json(roomList().map(r=>({...r,online:Object.values(db.sessions).filter(x=>x.room===r.name).length})));
});
app.post("/api/rooms/create",(req,res)=>{
 const u=userFrom(req);if(!isAdmin(u))return res.status(403).json({error:"الإدارة فقط"});
 const name=clean(req.body.name),desc=String(req.body.desc||"نص فقط").slice(0,80),kind=["public","public_voice","private","private2","voice","admin"].includes(req.body.kind)?req.body.kind:"public";
 const capacity=Math.max(2,Math.min(200,Number(req.body.capacity)||50)),mics=["voice","public_voice"].includes(kind)?Math.max(1,Math.min(20,Number(req.body.mics)||4)):0;
 if(!name)return res.status(400).json({error:"اسم الغرفة مطلوب"});if(db.rooms[name])return res.status(409).json({error:"الغرفة موجودة"});
 db.rooms[name]={name,desc,kind,capacity,mics,count:0,owner:u.name,media:!!req.body.media};save();res.json(db.rooms[name]);
});
app.post("/api/rooms/update",(req,res)=>{
 const u=userFrom(req),name=clean(req.body.name);if(!isAdmin(u))return res.status(403).json({error:"الإدارة فقط"});
 const r=db.rooms[name];if(!r)return res.status(404).json({error:"الغرفة غير موجودة"});
 r.desc=String(req.body.desc??r.desc).slice(0,80);r.capacity=Math.max(2,Math.min(200,Number(req.body.capacity)||r.capacity));
 if(r.kind==="voice"||r.kind==="public_voice")r.mics=Math.max(1,Math.min(20,Number(req.body.mics)||r.mics));save();res.json(r);
});
app.post("/api/rooms/delete",(req,res)=>{
 const u=userFrom(req),name=clean(req.body.name);if(!isAdmin(u))return res.status(403).json({error:"الإدارة فقط"});
 if(["الغرفة العامة","غرفة عامة + مايك","غرفة المايك","غرفة شخصين","غرفة المسابقات","غرفة ريماز","غرفة الإدارة"].includes(name))return res.status(400).json({error:"لا يمكن حذف الغرف الأساسية"});
 if(!db.rooms[name])return res.status(404).json({error:"الغرفة غير موجودة"});delete db.rooms[name];save();res.json({ok:true});
});

app.post("/api/room/moderate",(req,res)=>{
 const u=userFrom(req),room=clean(req.body.room),to=clean(req.body.to),action=String(req.body.action||"");if(!isAdmin(u))return res.status(403).json({error:"الإدارة فقط"});
 if(!room||!to||!roomOf(room))return res.status(400).json({error:"الغرفة أو العضو غير صحيح"});
 const key=room+"::"+to,mins=Math.max(1,Math.min(10080,Number(req.body.minutes)||10));
 if(action==="mute")db.roomMutes[key]=Date.now()+mins*60000;else if(action==="kick")db.roomKicks[key]=Date.now()+mins*60000;else if(action==="ban")db.roomBans[key]={until:Date.now()+mins*60000};else if(action==="unban")delete db.roomBans[key];else if(action==="unmute")delete db.roomMutes[key];else return res.status(400).json({error:"إجراء غير معروف"});
 save();io.sockets.sockets.forEach(s=>{if(s.data.user?.name===to&&s.data.room===room){if(action==="kick"||action==="ban"){s.leave(room);s.data.room="";s.emit("room-kicked",{room,action})}else s.emit("room-moderation",{room,action,minutes})}});
 res.json({ok:true});
});

app.get("/api/room/status",(req,res)=>{
 const u=userFrom(req),room=clean(req.query.room);if(!u)return res.status(401).json({error:"سجل الدخول"});
 const r=roomOf(room);if(!r)return res.status(404).json({error:"الغرفة غير موجودة"});
 const people=Object.values(db.sessions).filter(x=>x.room===room).map(x=>({name:x.name,type:x.type,likes:userLikes(x),muted:roomMuted(x,room)}));
 const banned=Object.keys(db.roomBans).filter(k=>k.startsWith(room+"::")).map(k=>k.split("::")[1]);
 const mics=Object.values(db.sessions).filter(x=>x.room===room&&x.mic).map(x=>x.name);
 res.json({room:r,people,banned,mics,canManage:isAdmin(u),muted:roomMuted(u,room)});
});
app.post("/api/room/mic-request",(req,res)=>{
 const u=userFrom(req),room=clean(req.body.room);if(!u)return res.status(401).json({error:"سجل الدخول"});
 const r=roomOf(room);if(!r||!roomAllowsMic(room))return res.status(400).json({error:"هذه ليست غرفة مايك"});
 const now=Date.now();Object.values(db.sessions).filter(s=>isAdmin(s)).forEach(s=>{db.notifications[s.name]=db.notifications[s.name]||[];db.notifications[s.name].unshift({id:require("crypto").randomUUID(),type:"notice",from:u.name,text:`طلب ${u.name} تشغيل المايك في ${room}`,time:now,read:false})});
 save();io.to(room).emit("mic-request",{name:u.name,room});res.json({ok:true});
});
app.post("/api/room/mic",(req,res)=>{
 const u=userFrom(req),room=clean(req.body.room),on=!!req.body.on;if(!u)return res.status(401).json({error:"سجل الدخول"});
 const r=roomOf(room);if(!r||!roomAllowsMic(room))return res.status(400).json({error:"هذه ليست غرفة مايك"});
 const denied=roomDenied(u,room);if(denied)return res.status(403).json({error:denied});
 if(on&&roomMuted(u,room))return res.status(403).json({error:"أنت مكتوم في هذه الغرفة"});
 if(on){const count=Object.values(db.sessions).filter(x=>x.room===room&&x.mic).length;if(count>=r.mics&&!isAdmin(u))return res.status(409).json({error:"كل المايكات ممتلئة"})}
 u.mic=on;save();io.to(room).emit("mic-state",{name:u.name,on});res.json({ok:true,on});
});

app.post("/api/wall",(req,res)=>{
 const u=userFrom(req);if(!u)return res.status(401).json({error:"سجل الدخول"});
 const text=String(req.body.text||"").trim().slice(0,1000);if(!text)return res.status(400).json({error:"اكتب المنشور"});
 db.wall.push({name:u.name,text,time:Date.now(),likes:0});db.wall=db.wall.slice(-500);save();res.json({ok:true});
});
app.get("/api/wall",(req,res)=>res.json(db.wall.slice(-100).reverse()));

app.post("/api/media",upload.single("file"),(req,res)=>{const u=userFrom(req),to=clean(req.body.to);if(!u)return res.status(401).json({error:"سجل الدخول"});if(!canMedia(u))return res.status(403).json({error:"الصور والفيديو والصوت يفتح عند 500 إعجاب"});if(!to||to===u.name)return res.status(400).json({error:"اختر عضوًا للمحادثة الخاصة"});const target=Object.values(db.sessions).find(x=>x.name===to);if(!target)return res.status(404).json({error:"العضو غير متصل"});if(!req.file)return res.status(400).json({error:"لم يتم اختيار ملف"});if(!/^(image|video|audio)\//.test(req.file.mimetype)){fs.unlinkSync(req.file.path);return res.status(415).json({error:"المسموح صور أو فيديو أو صوت فقط"});}const msg={id:require("crypto").randomUUID(),type:"media",from:u.name,to,mime:req.file.mimetype,url:"/uploads/"+req.file.filename,name:req.file.originalname,time:Date.now()};db.messages.push({...msg,room:"__private__"});db.messages=db.messages.slice(-5000);save();io.sockets.sockets.forEach(s=>{if(s.data.user?.name===to||s.data.user?.name===u.name)s.emit("private-media",msg)});res.json({ok:true,...msg})});
app.use("/uploads",express.static(UP));

io.on("connection",socket=>{
 socket.on("join",({sid,room})=>{
  const u=db.sessions[sid];if(!u)return;
  bindSocket(sid,socket);
  const target=room||"الغرفة العامة",denied=roomDenied(u,target);if(denied){socket.emit("room-denied",{message:denied});return}
  const rr=roomOf(target);if(!rr){socket.emit("room-denied",{message:"الغرفة غير موجودة"});return}
  if(rr.kind==="private2"&&Object.values(db.sessions).some(x=>x.room===target&&x.name!==u.name)){socket.emit("room-denied",{message:"غرفة الشخصين ممتلئة"});return}
  const occupied=Object.values(db.sessions).filter(x=>x.room===target&&x!==u).length;if(occupied>=rr.capacity){socket.emit("room-denied",{message:"الغرفة ممتلئة"});return}
  u.room=target;socket.data.user=u;socket.data.room=target;socket.join(target);save();
  socket.emit("history",db.messages.filter(m=>m.room===target).slice(-100));socket.to(target).emit("room-presence",{name:u.name,action:"join",room:target});
 });
 socket.on("leave",()=>{
  const u=socket.data.user,r=socket.data.room;if(u&&r){u.room="";u.mic=false;socket.leave(r);socket.data.room="";save();socket.to(r).emit("room-presence",{name:u.name,action:"leave",room:r})}
 });
 socket.on("message",({text})=>{
  const u=socket.data.user,room=socket.data.room;if(!u||!text)return;
  const rr=roomOf(room);if(!rr)return;
  if(!roomAllowsText(room)){socket.emit("room-error",{message:"هذه الغرفة مخصصة للمايك فقط"});return}
  if(roomMuted(u,room)){socket.emit("room-error",{message:"أنت مكتوم في هذه الغرفة"});return}
  const m={room,name:u.name,text:String(text).slice(0,1000),time:Date.now()};db.messages.push(m);db.messages=db.messages.slice(-5000);save();io.to(room).emit("message",m);
 });
 socket.on("private",({to,text})=>{
  const u=socket.data.user;if(!u||!to||!text)return;
  const st=db.settings[to]||{privateOpen:true,notificationsOpen:true};
  if(!st.privateOpen&&!isAdmin(u)){socket.emit("private-error",{message:"هذا المستخدم لقد اغلق الخاص"});return;}
  u.privateWith=to;
  io.sockets.sockets.forEach(s=>{if(s.data.user?.name===to||s===socket)s.emit("private",{from:u.name,to,text:String(text).slice(0,1000),time:Date.now()})});
 });
 const forward=(event,payload,key)=>{
  const u=socket.data.user;if(!u||!canMedia(u)||!payload?.to||!payload[key])return;
  io.sockets.sockets.forEach(s=>{if(s.data.user?.name===payload.to&&canMedia(s.data.user))s.emit(event,{from:u.name,[key]:payload[key],video:!!payload.video})});
 };
 socket.on("call-offer",d=>forward("call-offer",d,"offer"));
 socket.on("call-answer",d=>forward("call-answer",d,"answer"));
 socket.on("ice",d=>forward("ice",d,"candidate"));
 socket.on("disconnect",()=>{
  unbindSocket(socket);
 });
});
app.get("/{*splat}",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
server.listen(PORT,()=>console.log("دردشة ريماز عراقية تعمل على http://localhost:"+PORT));
