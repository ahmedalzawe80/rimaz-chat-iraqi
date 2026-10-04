const express=require("express");
const http=require("http");
const path=require("path");
const fs=require("fs");
const crypto=require("crypto");
const bcrypt=require("bcryptjs");
const multer=require("multer");
const {Server}=require("socket.io");

const app=express();
const server=http.createServer(app);
const io=new Server(server,{maxHttpBufferSize:20*1024*1024});
const PORT=process.env.PORT||3000;

const DATA_DIR=process.env.DATA_DIR||(fs.existsSync("/data")?"/data":path.join(__dirname,"data"));
const DATA=path.join(DATA_DIR,"data.json");
const UP=path.join(DATA_DIR,"uploads");

fs.mkdirSync(DATA_DIR,{recursive:true});
fs.mkdirSync(UP,{recursive:true});

function newDb(){
  return {
    users:{},guests:[],messages:[],wall:[],likes:{},lastLike:{},sessions:{},
    notifications:{},profiles:{},permissionOverrides:{},rooms:{},
    roomBans:{},roomMutes:{},roomKicks:{}
  };
}

function loadDb(){
  if(!fs.existsSync(DATA))return newDb();
  try{return JSON.parse(fs.readFileSync(DATA,"utf8"))}
  catch(e){console.error("خطأ بقراءة data.json:",e.message);return newDb()}
}

const db=loadDb();

for(const k of [
  "users","guests","messages","wall","likes","lastLike","sessions",
  "notifications","profiles","permissionOverrides","rooms",
  "roomBans","roomMutes","roomKicks"
]){
  if(db[k]==null)db[k]=Array.isArray(db[k])?[]:{};
}

function save(){
  fs.writeFileSync(DATA,JSON.stringify(db,null,2));
}

const defaultRooms=[
  {name:"الغرفة العامة",count:0,desc:"نص فقط",kind:"public",capacity:200,mics:0,owner:"admin"},
  {name:"غرفة عامة + مايك",count:0,desc:"نص + مايك",kind:"public_voice",capacity:200,mics:8,owner:"admin"},
  {name:"غرفة المايك",count:0,desc:"مايك فقط",kind:"voice",capacity:50,mics:8,owner:"admin"},
  {name:"غرفة شخصين",count:0,desc:"شخصان فقط",kind:"private2",capacity:2,mics:0,owner:"admin"},
  {name:"غرفة المسابقات",count:0,desc:"مسابقات ودردشة",kind:"public",capacity:200,mics:0,owner:"admin"},
  {name:"غرفة ريماز",count:0,desc:"دردشة ريماز",kind:"public",capacity:200,mics:0,owner:"admin"},
  {name:"غرفة الإدارة",count:0,desc:"للإدارة والمشرفين",kind:"admin",capacity:50,mics:0,owner:"admin"}
];

for(const r of defaultRooms){
  if(!db.rooms[r.name])db.rooms[r.name]=r;
}

save();

function clean(s){
  return String(s??"").trim().slice(0,40);
}

function now(){
  return Date.now();
}

function sidOf(req){
  return req.headers["x-session"];
}

function userFrom(req){
  const sid=sidOf(req);
  return sid&&db.sessions[sid]?db.sessions[sid]:null;
}

function isAdmin(u){
  return !!u&&u.type==="member"&&u.name==="admin";
}

function likesOf(name){
  return db.users[name]?.likes||0;
}

function userLikes(u){
  return u?.type==="member"?likesOf(u.name):(u?.likes||0);
}

function level(l){
  return l>=500?3:l>=400?2:1;
}

function canNotice(u){
  return isAdmin(u)||userLikes(u)>=400;
}

function canMedia(u){
  return isAdmin(u)||userLikes(u)>=500;
}

function profileOf(name){
  return db.profiles[name]||{
    avatar:"👤",
    status:"متصل الآن",
    bio:"عضو في دردشة ريماز عراقية",
    nameColor:"#222222",
    bgColor:"#ffffff"
  };
}

function roomOf(name){
  return db.rooms[name]||null;
}

function roomList(){
  return Object.values(db.rooms);
}

function activeSessions(name,type){
  return Object.values(db.sessions).filter(s=>s.name===name&&(!type||s.type===type));
}

function guestIsActive(name){
  return activeSessions(name,"guest").length>0;
}

function sessionTarget(name){
  return Object.values(db.sessions).find(s=>s.name===name)||null;
}

function roomPeople(room){
  return Object.values(db.sessions).filter(s=>s.room===room);
}

function roomIsPrivate(room){
  return !!room&&["private","private2"].includes(room.kind);
}

function roomIsVoice(room){
  return !!room&&["voice","public_voice"].includes(room.kind);
}

function roomAllowsText(room){
  return !!room&&room.kind!=="voice";
}

function canEnterRoom(u,room){
  if(!u||!room)return"بيانات الدخول غير صحيحة";
  if(room.kind==="admin"&&!isAdmin(u))return"هذه الغرفة للإدارة فقط";
  return null;
}

function roomDenied(u,room){
  const key=room+"::"+u.name;
  const t=now();
  const ban=db.roomBans[key];
  if(ban&&(!ban.until||ban.until>t))return"أنت محظور من هذه الغرفة";
  const kick=db.roomKicks[key];
  if(kick&&kick>t)return"تم طردك مؤقتًا من هذه الغرفة";
  return null;
}

function roomMuted(u,room){
  return (db.roomMutes[room+"::"+u.name]||0)>now();
}

function isActivePrivatePair(a,b){
  if(!a||!b||a.name===b.name)return false;
  if(a.privateWith===b.name||b.privateWith===a.name)return true;
  const ar=roomOf(a.room);
  const br=roomOf(b.room);
  return !!ar&&ar===br&&roomIsPrivate(ar);
}

function emitSystem(room,text){
  if(!room)return;
  const m={
    room,
    name:"النظام",
    text,
    system:true,
    time:now()
  };
  db.messages.push(m);
  db.messages=db.messages.slice(-5000);
  io.to(room).emit("message",m);
  save();
}

function removeGuestNameIfNoSessions(name){
  if(!guestIsActive(name)){
    db.guests=db.guests.filter(x=>x!==name);
  }
}

function makeSession(name,type,likes=0){
  const sid=crypto.randomUUID();

  db.sessions[sid]={
    name,
    type,
    likes,
    lastLike:0,
    room:"",
    privateWith:"",
    mic:false,
    created:now()
  };

  if(type==="guest"&&!db.guests.includes(name)){
    db.guests.push(name);
  }

  save();
  return sid;
}

function destroySession(sid,announce=true){
  const u=db.sessions[sid];
  if(!u)return;

  const oldRoom=u.room;
  const name=u.name;

  delete db.sessions[sid];

  if(oldRoom&&announce){
    emitSystem(oldRoom,`🔴 لقد غادر ${name} الغرفة`);
  }

  if(u.type==="guest"){
    removeGuestNameIfNoSessions(name);
  }

  save();
}

function cleanExpiredModeration(){
  const t=now();

  for(const store of [db.roomBans,db.roomMutes,db.roomKicks]){
    for(const [k,v] of Object.entries(store)){
      const until=typeof v==="object"?v.until:v;
      if(until&&until<=t)delete store[k];
    }
  }
}

cleanExpiredModeration();
save();

app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true,limit:"2mb"}));
app.use(express.static(path.join(__dirname,"public")));

const upload=multer({
  dest:UP,
  limits:{fileSize:100*1024*1024}
});

app.get("/api/state",(req,res)=>{
  const u=userFrom(req);
  const likes=u?userLikes(u):0;

  res.json({
    user:u?{
      name:u.name,
      type:u.type,
      likes,
      level:level(likes),
      admin:isAdmin(u),
      profile:profileOf(u.name),
      room:u.room||""
    }:null,
    rooms:roomList().map(r=>({
      ...r,
      online:roomPeople(r.name).length
    }))
  });
});

app.post("/api/register",(req,res)=>{
  const n=clean(req.body.name);
  const p=String(req.body.password||"");

  if(!n||!p){
    return res.status(400).json({error:"اكتب الاسم والباسورد"});
  }

  if(db.users[n]||guestIsActive(n)){
    return res.status(409).json({error:"الاسم مستخدم"});
  }

  db.users[n]={
    hash:bcrypt.hashSync(p,10),
    likes:0
  };

  const sid=makeSession(n,"member");
  res.json({sid});
});

app.post("/api/login",(req,res)=>{
  const n=clean(req.body.name);
  const p=String(req.body.password||"");

  if(!db.users[n]||!bcrypt.compareSync(p,db.users[n].hash)){
    return res.status(401).json({error:"الاسم أو الباسورد غير صحيح"});
  }

  res.json({
    sid:makeSession(n,"member")
  });
});

app.post("/api/guest",(req,res)=>{
  const n=clean(req.body.name);

  if(!n){
    return res.status(400).json({error:"اكتب اسم الزائر"});
  }

  if(db.users[n]||guestIsActive(n)){
    return res.status(409).json({
      error:"الاسم مستخدم حاليًا، اختر اسمًا آخر"
    });
  }

  res.json({
    sid:makeSession(n,"guest",0)
  });
});

app.post("/api/logout",(req,res)=>{
  const sid=sidOf(req);
  const u=userFrom(req);

  if(!u)return res.json({ok:true});

  destroySession(sid,true);

  res.json({ok:true});
});

app.get("/api/messages",(req,res)=>{
  const room=clean(req.query.room)||"الغرفة العامة";

  res.json(
    db.messages
      .filter(m=>m.room===room)
      .slice(-100)
  );
});

app.post("/api/like",(req,res)=>{
  const u=userFrom(req);
  const to=clean(req.body.to);

  if(!u)return res.status(401).json({error:"سجل الدخول"});

  if(!to||to===u.name){
    return res.status(400).json({
      error:"لا يمكنك إعطاء إعجاب لنفسك"
    });
  }

  const last=u.type==="member"
    ?(db.lastLike[u.name]||0)
    :(u.lastLike||0);

  const diff=now()-last;

  if(diff<10000){
    return res.status(429).json({
      error:`انتظر ${Math.ceil((10000-diff)/1000)} ثوانٍ`
    });
  }

  if(u.type==="member"){
    db.lastLike[u.name]=now();
  }else{
    u.lastLike=now();
  }

  let target;

  if(db.users[to]){
    db.users[to].likes=(db.users[to].likes||0)+1;
    target=db.users[to];
  }else{
    target=sessionTarget(to);

    if(!target||target.type!=="guest"){
      return res.status(404).json({
        error:"العضو غير متصل"
      });
    }

    target.likes=(target.likes||0)+1;
  }

  db.notifications[to]=db.notifications[to]||[];

  db.notifications[to].unshift({
    id:crypto.randomUUID(),
    type:"like",
    from:u.name,
    text:`لقد وصلك لايك من ${u.name} ❤️`,
    time:now(),
    read:false
  });

  db.notifications[to]=db.notifications[to].slice(0,100);

  save();

  res.json({
    ok:true,
    targetLikes:userLikes(target),
    cooldown:10
  });
});

app.get("/api/members",(req,res)=>{
  const u=userFrom(req);

  if(!u)return res.status(401).json({error:"سجل الدخول"});

  const names=new Set(Object.keys(db.users));

  Object.values(db.sessions).forEach(s=>{
    names.add(s.name);
  });

  const members=[...names]
    .filter(Boolean)
    .map(name=>{
      const s=sessionTarget(name);
      const likes=likesOf(name)||(s?.likes||0);

      return {
        name,
        type:db.users[name]?"member":"guest",
        likes,
        level:level(likes),
        profile:profileOf(name),
        online:activeSessions(name).length>0,
        room:s?.room||""
      };
    });

  res.json(
    members.sort((a,b)=>b.likes-a.likes)
  );
});

app.get("/api/profile",(req,res)=>{
  const u=userFrom(req);

  if(!u)return res.status(401).json({error:"سجل الدخول"});

  const likes=userLikes(u);

  res.json({
    name:u.name,
    type:u.type,
    likes,
    level:level(likes),
    profile:profileOf(u.name),
    admin:isAdmin(u)
  });
});

app.get("/api/profile/:name",(req,res)=>{
  const u=userFrom(req);

  if(!u)return res.status(401).json({error:"سجل الدخول"});

  const name=clean(req.params.name);
  const s=sessionTarget(name);
  const likes=likesOf(name)||(s?.likes||0);

  res.json({
    name,
    type:db.users[name]?"member":(s?"guest":"unknown"),
    likes,
    level:level(likes),
    profile:profileOf(name),
    online:activeSessions(name).length>0,
    room:s?.room||"",
    admin:name==="admin"
  });
});

app.post("/api/profile",(req,res)=>{
  const u=userFrom(req);

  if(!u)return res.status(401).json({error:"سجل الدخول"});

  const old=profileOf(u.name);

  db.profiles[u.name]={
    ...old,
    avatar:String(req.body.avatar??old.avatar).slice(0,8),
    status:String(req.body.status??old.status).slice(0,80),
    bio:String(req.body.bio??old.bio).slice(0,300),
    nameColor:String(req.body.nameColor??old.nameColor).slice(0,20),
    bgColor:String(req.body.bgColor??old.bgColor).slice(0,20)
  };

  save();

  res.json({
    ok:true,
    profile:db.profiles[u.name]
  });
});

app.get("/api/notifications",(req,res)=>{
  const u=userFrom(req);

  if(!u)return res.status(401).json({error:"سجل الدخول"});

  res.json(
    (db.notifications[u.name]||[]).slice(0,50)
  );
});

app.post("/api/notifications/read",(req,res)=>{
  const u=userFrom(req);

  if(!u)return res.status(401).json({error:"سجل الدخول"});

  (db.notifications[u.name]||[]).forEach(n=>{
    n.read=true;
  });

  save();

  res.json({ok:true});
});

app.post("/api/notify",(req,res)=>{
  const u=userFrom(req);
  const to=clean(req.body.to);
  const text=String(req.body.text||"").trim().slice(0,240);

  if(!u)return res.status(401).json({error:"سجل الدخول"});

  if(!canNotice(u)){
    return res.status(403).json({
      error:"إرسال التنبيهات يفتح عند 400 إعجاب"
    });
  }

  if(!to||!text){
    return res.status(400).json({
      error:"اختر عضوًا واكتب التنبيه"
    });
  }

  db.notifications[to]=db.notifications[to]||[];

  db.notifications[to].unshift({
    id:crypto.randomUUID(),
    type:"notice",
    from:u.name,
    text,
    time:now(),
    read:false
  });

  db.notifications[to]=db.notifications[to].slice(0,100);

  save();

  res.json({ok:true});
});

app.post("/api/admin/grant-like",(req,res)=>{
  const u=userFrom(req);
  const to=clean(req.body.to);
  const amount=Math.max(
    1,
    Math.min(10000,Number(req.body.amount)||1)
  );

  if(!isAdmin(u)){
    return res.status(403).json({
      error:"هذا الإجراء للإدارة فقط"
    });
  }

  if(!to){
    return res.status(400).json({
      error:"اسم العضو مطلوب"
    });
  }

  if(db.users[to]){
    db.users[to].likes=
      (db.users[to].likes||0)+amount;

    save();

    return res.json({
      ok:true,
      likes:db.users[to].likes
    });
  }

  const guest=sessionTarget(to);

  if(guest?.type==="guest"){
    guest.likes=(guest.likes||0)+amount;

    save();

    return res.json({
      ok:true,
      likes:guest.likes,
      temporary:true
    });
  }

  res.status(404).json({
    error:"العضو غير موجود أو غير متصل"
  });
});

app.get("/api/admin/users",(req,res)=>{
  const u=userFrom(req);

  if(!isAdmin(u)){
    return res.status(403).json({
      error:"الإدارة فقط"
    });
  }

  const members=Object.keys(db.users).map(name=>({
    name,
    type:"member",
    likes:likesOf(name),
    online:activeSessions(name).length>0,
    room:sessionTarget(name)?.room||""
  }));

  const guests=Object.values(db.sessions)
    .filter(s=>s.type==="guest")
    .map(s=>({
      name:s.name,
      type:"guest",
      likes:s.likes||0,
      online:true,
      room:s.room||""
    }));

  res.json({members,guests});
});

app.post("/api/admin/permission",(req,res)=>{
  const u=userFrom(req);

  if(!isAdmin(u)){
    return res.status(403).json({
      error:"الإدارة فقط"
    });
  }

  const name=clean(req.body.name);
  const key=String(req.body.permission||"").trim();

  if(!name||!key){
    return res.status(400).json({
      error:"الاسم والصلاحية مطلوبان"
    });
  }

  db.permissionOverrides[name]=
    db.permissionOverrides[name]||{};

  db.permissionOverrides[name][key]=
    !!req.body.enabled;

  save();

  res.json({
    ok:true,
    permissions:db.permissionOverrides[name]
  });
});

app.get("/api/rooms",(req,res)=>{
  const u=userFrom(req);

  if(!u)return res.status(401).json({error:"سجل الدخول"});

  res.json(
    roomList().map(r=>({
      ...r,
      online:roomPeople(r.name).length
    }))
  );
});

app.post("/api/rooms/create",(req,res)=>{
  const u=userFrom(req);

  if(!isAdmin(u)){
    return res.status(403).json({
      error:"الإدارة فقط"
    });
  }

  const name=clean(req.body.name);
  const desc=String(req.body.desc||"نص فقط").slice(0,80);

  const kinds=[
    "public",
    "public_voice",
    "voice",
    "private",
    "private2",
    "admin"
  ];

  const kind=kinds.includes(req.body.kind)
    ?req.body.kind
    :"public";

  let capacity=Math.max(
    2,
    Math.min(200,Number(req.body.capacity)||50)
  );

  if(kind==="private2")capacity=2;

  const mics=roomIsVoice({kind})
    ?Math.max(1,Math.min(20,Number(req.body.mics)||4))
    :0;

  if(!name){
    return res.status(400).json({
      error:"اسم الغرفة مطلوب"
    });
  }

  if(db.rooms[name]){
    return res.status(409).json({
      error:"الغرفة موجودة"
    });
  }

  db.rooms[name]={
    name,
    desc,
    kind,
    capacity,
    mics,
    count:0,
    owner:u.name
  };

  save();

  res.json(db.rooms[name]);
});

app.post("/api/rooms/update",(req,res)=>{
  const u=userFrom(req);
  const name=clean(req.body.name);

  if(!isAdmin(u)){
    return res.status(403).json({
      error:"الإدارة فقط"
    });
  }

  const r=db.rooms[name];

  if(!r){
    return res.status(404).json({
      error:"الغرفة غير موجودة"
    });
  }

  r.desc=String(
    req.body.desc??r.desc
  ).slice(0,80);

  r.capacity=r.kind==="private2"
    ?2
    :Math.max(
      2,
      Math.min(
        200,
        Number(req.body.capacity)||r.capacity
      )
    );

  if(roomIsVoice(r)){
    r.mics=Math.max(
      1,
      Math.min(
        20,
        Number(req.body.mics)||r.mics
      )
    );
  }

  save();

  res.json(r);
});

app.post("/api/rooms/delete",(req,res)=>{
  const u=userFrom(req);
  const name=clean(req.body.name);

  if(!isAdmin(u)){
    return res.status(403).json({
      error:"الإدارة فقط"
    });
  }

  if(defaultRooms.some(r=>r.name===name)){
    return res.status(400).json({
      error:"لا يمكن حذف الغرف الأساسية"
    });
  }

  if(!db.rooms[name]){
    return res.status(404).json({
      error:"الغرفة غير موجودة"
    });
  }

  delete db.rooms[name];

  save();

  res.json({ok:true});
});

app.post("/api/room/moderate",(req,res)=>{
  const u=userFrom(req);
  const room=clean(req.body.room);
  const to=clean(req.body.to);
  const action=String(req.body.action||"");

  if(!isAdmin(u)){
    return res.status(403).json({
      error:"الإدارة فقط"
    });
  }

  if(!room||!to||!roomOf(room)){
    return res.status(400).json({
      error:"الغرفة أو العضو غير صحيح"
    });
  }

  const key=room+"::"+to;
  const mins=Math.max(
    1,
    Math.min(10080,Number(req.body.minutes)||10)
  );

  if(action==="mute"){
    db.roomMutes[key]=now()+mins*60000;
  }else if(action==="kick"){
    db.roomKicks[key]=now()+mins*60000;
  }else if(action==="ban"){
    db.roomBans[key]={
      until:now()+mins*60000
    };
  }else if(action==="unban"){
    delete db.roomBans[key];
  }else if(action==="unmute"){
    delete db.roomMutes[key];
  }else{
    return res.status(400).json({
      error:"إجراء غير معروف"
    });
  }

  save();

  io.sockets.sockets.forEach(s=>{
    if(
      s.data.user?.name===to&&
      s.data.room===room
    ){
      if(action==="kick"||action==="ban"){
        s.leave(room);
        s.data.room="";
        s.data.user.room="";
        s.emit("room-kicked",{
          room,
          action
        });
      }else{
        s.emit("room-moderation",{
          room,
          action,
          minutes
        });
      }
    }
  });

  res.json({ok:true});
});

app.get("/api/room/status",(req,res)=>{
  const u=userFrom(req);
  const room=clean(req.query.room);

  if(!u)return res.status(401).json({
    error:"سجل الدخول"
  });

  const r=roomOf(room);

  if(!r)return res.status(404).json({
    error:"الغرفة غير موجودة"
  });

  const people=roomPeople(room).map(x=>({
    name:x.name,
    type:x.type,
    likes:userLikes(x),
    level:level(userLikes(x)),
    muted:roomMuted(x,room),
    mic:!!x.mic
  }));

  const banned=Object.keys(db.roomBans)
    .filter(k=>k.startsWith(room+"::"))
    .map(k=>k.split("::")[1]);

  const mics=roomIsVoice(r)
    ?people.filter(x=>x.mic).map(x=>x.name)
    :[];

  res.json({
    room:r,
    people,
    banned,
    mics,
    canManage:isAdmin(u),
    muted:roomMuted(u,room)
  });
});

app.post("/api/room/mic-request",(req,res)=>{
  const u=userFrom(req);
  const room=clean(req.body.room);

  if(!u)return res.status(401).json({
    error:"سجل الدخول"
  });

  const r=roomOf(room);

  if(!r||!roomIsVoice(r)){
    return res.status(400).json({
      error:"هذه ليست غرفة مايك"
    });
  }

  const t=now();

  Object.values(db.sessions).forEach(sess=>{
    if(isAdmin(sess)){
      db.notifications[sess.name]=
        db.notifications[sess.name]||[];

      db.notifications[sess.name].unshift({
        id:crypto.randomUUID(),
        type:"mic-request",
        from:u.name,
        text:`طلب ${u.name} تشغيل المايك في ${room}`,
        time:t,
        read:false
      });
    }
  });

  save();

  io.to(room).emit("mic-request",{
    name:u.name,
    room
  });

  res.json({ok:true});
});

app.post("/api/room/mic",(req,res)=>{
  const u=userFrom(req);
  const room=clean(req.body.room);
  const on=!!req.body.on;

  if(!u)return res.status(401).json({
    error:"سجل الدخول"
  });

  const r=roomOf(room);

  if(!r||!roomIsVoice(r)){
    return res.status(400).json({
      error:"هذه ليست غرفة مايك"
    });
  }

  if(u.room!==room){
    return res.status(403).json({
      error:"ادخل غرفة المايك أولًا"
    });
  }

  const denied=roomDenied(u,room);

  if(denied){
    return res.status(403).json({
      error:denied
    });
  }

  if(on&&roomMuted(u,room)){
    return res.status(403).json({
      error:"أنت مكتوم في هذه الغرفة"
    });
  }

  if(on){
    const count=roomPeople(room)
      .filter(x=>x.mic).length;

    if(count>=r.mics&&!u.mic){
      return res.status(409).json({
        error:"كل المايكات ممتلئة"
      });
    }
  }

  u.mic=on;

  save();

  io.to(room).emit("mic-state",{
    name:u.name,
    on
  });

  res.json({
    ok:true,
    on
  });
});

app.post("/api/wall",(req,res)=>{
  const u=userFrom(req);

  if(!u)return res.status(401).json({
    error:"سجل الدخول"
  });

  const text=String(
    req.body.text||""
  ).trim().slice(0,1000);

  if(!text){
    return res.status(400).json({
      error:"اكتب المنشور"
    });
  }

  const post={
    id:crypto.randomUUID(),
    name:u.name,
    text,
    time:now(),
    likes:0,
    profile:profileOf(u.name)
  };

  db.wall.push(post);
  db.wall=db.wall.slice(-300);

  save();

  res.json({
    ok:true,
    post
  });
});

app.get("/api/wall",(req,res)=>{
  res.json(
    db.wall.slice(-100).reverse()
  );
});

app.post("/api/wall/media",upload.single("file"),(req,res)=>{
  const u=userFrom(req);

  if(!u)return res.status(401).json({
    error:"سجل الدخول"
  });

  if(!canMedia(u)){
    if(req.file){
      try{fs.unlinkSync(req.file.path)}catch{}
    }

    return res.status(403).json({
      error:"إرسال الصور والفيديو يفتح عند 500 إعجاب"
    });
  }

  if(!req.file){
    return res.status(400).json({
      error:"لم يتم اختيار ملف"
    });
  }

  if(!/^(image|video)\//.test(req.file.mimetype)){
    try{fs.unlinkSync(req.file.path)}catch{}

    return res.status(415).json({
      error:"الحائط يسمح بالصور والفيديو فقط"
    });
  }

  const post={
    id:crypto.randomUUID(),
    name:u.name,
    text:String(req.body.text||"")
      .trim()
      .slice(0,1000),
    time:now(),
    likes:0,
    profile:profileOf(u.name),
    media:{
      url:"/uploads/"+req.file.filename,
      name:req.file.originalname,
      mime:req.file.mimetype
    }
  };

  db.wall.push(post);
  db.wall=db.wall.slice(-300);

  save();

  res.json({
    ok:true,
    post
  });
});

app.post("/api/media",upload.single("file"),(req,res)=>{
  const u=userFrom(req);
  const to=clean(req.body.to);
  const roomName=clean(req.body.room);

  if(!u)return res.status(401).json({
    error:"سجل الدخول"
  });

  if(!canMedia(u)){
    if(req.file){
      try{fs.unlinkSync(req.file.path)}catch{}
    }

    return res.status(403).json({
      error:"رفع الصور والفيديو والاتصال يفتح عند 500 إعجاب"
    });
  }

  if(!to||to===u.name){
    return res.status(400).json({
      error:"اختر عضوًا للمحادثة الخاصة"
    });
  }

  const target=sessionTarget(to);

  if(!target){
    return res.status(404).json({
      error:"العضو غير متصل"
    });
  }

  if(
    u.privateWith!==to&&
    !isActivePrivatePair(u,target)&&
    !roomIsPrivate(roomOf(roomName))
  ){
    if(req.file){
      try{fs.unlinkSync(req.file.path)}catch{}
    }

    return res.status(403).json({
      error:"الصور والفيديو متاحة داخل المحادثة الخاصة فقط"
    });
  }

  if(!req.file){
    return res.status(400).json({
      error:"لم يتم اختيار ملف"
    });
  }

  if(!/^(image|video|audio)\//.test(req.file.mimetype)){
    try{fs.unlinkSync(req.file.path)}catch{}

    return res.status(415).json({
      error:"المسموح صور أو فيديو أو صوت فقط"
    });
  }

  res.json({
    ok:true,
    to,
    url:"/uploads/"+req.file.filename,
    name:req.file.originalname,
    mime:req.file.mimetype
  });
});

app.use("/uploads",express.static(UP));

io.on("connection",socket=>{

  socket.on("join",({sid,room})=>{
    const u=db.sessions[sid];

    if(!u){
      return socket.emit("room-denied",{
        message:"انتهت الجلسة، سجل الدخول من جديد"
      });
    }

    const target=room||"الغرفة العامة";
    const rr=roomOf(target);

    if(!rr){
      return socket.emit("room-denied",{
        message:"الغرفة غير موجودة"
      });
    }

    const access=canEnterRoom(u,rr);

    if(access){
      return socket.emit("room-denied",{
        message:access
      });
    }

    const denied=roomDenied(u,target);

    if(denied){
      return socket.emit("room-denied",{
        message:denied
      });
    }

    const occupied=roomPeople(target)
      .filter(x=>x!==u).length;

    if(
      occupied>=rr.capacity&&
      u.room!==target
    ){
      return socket.emit("room-denied",{
        message:"الغرفة ممتلئة"
      });
    }

    const oldRoom=u.room;

    if(oldRoom&&oldRoom!==target){
      socket.leave(oldRoom);
      u.mic=false;
      socket.data.room="";
      emitSystem(
        oldRoom,
        `🔵 لقد غادر ${u.name} الغرفة ${oldRoom} وذهب إلى ${target}`
      );
    }

    u.room=target;
    socket.data.user=u;
    socket.data.room=target;

    socket.join(target);

    save();

    socket.emit(
      "history",
      db.messages
        .filter(m=>m.room===target)
        .slice(-100)
    );

    emitSystem(
      target,
      `🟢 لقد دخل ${u.name} إلى ${target}`
    );

    socket.to(target).emit(
      "room-presence",
      {
        name:u.name,
        action:"join"
      }
    );
  });

  socket.on("leave-room",()=>{
    const u=socket.data.user;

    if(!u)return;

    const old=u.room;

    if(!old)return;

    socket.leave(old);

    u.room="";
    u.mic=false;

    socket.data.room="";

    emitSystem(
      old,
      `🔵 لقد غادر ${u.name} الغرفة ${old}`
    );

    save();
  });

  socket.on("private-open",({to})=>{
    const u=socket.data.user;
    const targetName=clean(to);

    if(!u||!targetName||targetName===u.name)return;

    const target=sessionTarget(targetName);

    if(!target){
      return socket.emit("private-error",{
        message:"العضو غير متصل"
      });
    }

    u.privateWith=targetName;
    socket.data.privateWith=targetName;

    socket.emit(
      "private-opened",
      {to:targetName}
    );
  });

  socket.on("private-close",({to})=>{
    const u=socket.data.user;

    if(!u)return;

    if(!to||u.privateWith===to){
      u.privateWith="";
    }

    socket.data.privateWith="";
  });

  socket.on("message",({text})=>{
    const u=socket.data.user;
    const room=socket.data.room;
    const rr=roomOf(room);

    if(!u||!room||!rr||!text)return;

    if(!roomAllowsText(rr)){
      return socket.emit(
        "room-error",
        {message:"هذه الغرفة للمايك فقط"}
      );
    }

    if(roomMuted(u,room)){
      return socket.emit(
        "room-error",
        {message:"أنت مكتوم في هذه الغرفة"}
      );
    }

    const m={
      room,
      name:u.name,
      text:String(text).slice(0,1000),
      time:now()
    };

    db.messages.push(m);
    db.messages=db.messages.slice(-5000);

    save();

    io.to(room).emit("message",m);
  });

  socket.on("private",({to,text})=>{
    const u=socket.data.user;
    const targetName=clean(to);

    if(!u||!targetName||!text)return;

    const target=sessionTarget(targetName);

    if(!target){
      return socket.emit(
        "private-error",
        {message:"العضو غير متصل"}
      );
    }

    u.privateWith=targetName;

    io.sockets.sockets.forEach(s=>{
      if(
        s.data.user?.name===targetName||
        s===socket
      ){
        s.emit("private",{
          from:u.name,
          to:targetName,
          text:String(text).slice(0,1000),
          time:now()
        });
      }
    });
  });

  function callAllowed(targetName){
    const u=socket.data.user;
    const target=sessionTarget(targetName);

    if(!u||!target){
      return {
        ok:false,
        error:"العضو غير متصل"
      };
    }

    if(!canMedia(u)||!canMedia(target)){
      return {
        ok:false,
        error:"الاتصال يفتح عند 500 إعجاب للطرفين"
      };
    }

    if(!isActivePrivatePair(u,target)){
      return {
        ok:false,
        error:"الاتصال متاح داخل المحادثة الخاصة فقط"
      };
    }

    return {
      ok:true,
      target
    };
  }

  socket.on("call-offer",d=>{
    const to=clean(d?.to);
    const check=callAllowed(to);

    if(!check.ok){
      return socket.emit(
        "call-error",
        {message:check.error}
      );
    }

    io.sockets.sockets.forEach(s=>{
      if(s.data.user?.name===to){
        s.emit("call-offer",{
          from:socket.data.user.name,
          offer:d.offer,
          video:!!d.video
        });
      }
    });
  });

  socket.on("call-answer",d=>{
    const to=clean(d?.to);
    const check=callAllowed(to);

    if(!check.ok){
      return socket.emit(
        "call-error",
        {message:check.error}
      );
    }

    io.sockets.sockets.forEach(s=>{
      if(s.data.user?.name===to){
        s.emit("call-answer",{
          from:socket.data.user.name,
          answer:d.answer
        });
      }
    });
  });

  socket.on("ice",d=>{
    const to=clean(d?.to);
    const check=callAllowed(to);

    if(!check.ok){
      return socket.emit(
        "call-error",
        {message:check.error}
      );
    }

    io.sockets.sockets.forEach(s=>{
      if(s.data.user?.name===to){
        s.emit("ice",{
          from:socket.data.user.name,
          candidate:d.candidate
        });
      }
    });
  });

  socket.on("disconnect",()=>{
    const u=socket.data.user;

    if(!u)return;

    const sid=Object.keys(db.sessions)
      .find(id=>db.sessions[id]===u);

    if(sid){
      destroySession(sid,true);
    }
  });
});

app.get("/{*splat}",(req,res)=>{
  res.sendFile(
    path.join(__dirname,"public","index.html")
  );
});

server.listen(
  PORT,
  ()=>console.log(
    "دردشة ريماز عراقية تعمل على http://localhost:"+PORT
  )
);
