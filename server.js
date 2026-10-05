const express=require("express");
const http=require("http");
const path=require("path");
const fs=require("fs");
const bcrypt=require("bcryptjs");
const multer=require("multer");
const {Server}=require("socket.io");

const app=express(), server=http.createServer(app), io=new Server(server);
const PORT=process.env.PORT||3000;
const DATA=path.join("//data","data.json");
const UP=path.join("//data","uploads");

if(!fs.existsSync(UP))fs.mkdirSync(UP);

const db=fs.existsSync(DATA)
  ?JSON.parse(fs.readFileSync(DATA,"utf8"))
  :{users:{},guests:[],messages:[],wall:[],likes:{},lastLike:{},sessions:{}};

const save=()=>fs.writeFileSync(DATA,JSON.stringify(db,null,2));

db.notifications=db.notifications||{};
db.profiles=db.profiles||{};
db.permissionOverrides=db.permissionOverrides||{};
db.likes=db.likes||{};
db.rooms=db.rooms||{};
db.roomBans=db.roomBans||{};
db.roomMutes=db.roomMutes||{};
db.roomKicks=db.roomKicks||{};

const defaultRooms=[
  {name:"الغرفة العامة",count:120,desc:"نص فقط",kind:"public",capacity:200,mics:0,owner:"admin"},
  {name:"غرفة الأصدقاء",count:48,desc:"خاص",kind:"private",capacity:100,mics:0,owner:"admin"},
  {name:"غرفة الحب",count:35,desc:"خاص",kind:"private",capacity:100,mics:0,owner:"admin"},
  {name:"غرفة الصوت",count:22,desc:"مايك",kind:"voice",capacity:50,mics:8,owner:"admin"}
];

for(const r of defaultRooms)
  if(!db.rooms[r.name])db.rooms[r.name]=r;

function profileOf(name){
  return db.profiles[name]||{
    avatar:"👤",
    status:"متصل الآن",
    bio:"عضو في دردشة ريماز عراقية",
    nameColor:"#222222",
    bgColor:"#ffffff"
  }
}

function isAdmin(u){
  return !!u && u.type==="member" && u.name==="admin"
}

function likesOfAny(n){
  if(db.users[n])return db.users[n].likes||0;
  const sess=Object.values(db.sessions).find(
    x=>x.type==="guest"&&x.name===n
  );
  return sess?.likes||0
}

function levelAny(n){
  return level(likesOfAny(n))
}

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));

const upload=multer({
  dest:UP,
  limits:{fileSize:100*1024*1024}
});

function clean(s){
  return String(s||"").trim().slice(0,40)
}

function userFrom(req){
  const sid=req.headers["x-session"];
  return sid&&db.sessions[sid]?db.sessions[sid]:null
}

function level(l){
  return l>=500?3:l>=400?2:1
}

function likesOf(n){
  return db.users[n]?.likes||0
}

function userLikes(u){
  return u?.type==="member"?likesOf(u.name):(u?.likes||0)
}

function canMedia(u){
  return userLikes(u)>=500
}

function canNotice(u){
  return userLikes(u)>=400
}

function roomOf(name){
  return db.rooms[name]||null
}

function roomDenied(u,room){
  const key=room+"::"+u.name, now=Date.now();

  const ban=db.roomBans[key];
  if(ban && (!ban.until || ban.until>now))
    return "أنت محظور من هذه الغرفة";

  const kick=db.roomKicks[key];
  if(kick && kick>now)
    return "تم طردك مؤقتًا من هذه الغرفة";

  return null;
}

function roomMuted(u,room){
  const until=db.roomMutes[room+"::"+u.name]||0;
  return until>Date.now()
}

function roomList(){
  return Object.values(db.rooms)
}

app.get("/api/state",(req,res)=>{
  const u=userFrom(req);
  const ul=u?userLikes(u):0;

  res.json({
    user:u?{
      name:u.name,
      type:u.type,
      likes:ul,
      level:level(ul),
      admin:isAdmin(u),
      profile:profileOf(u.name)
    }:null,

    rooms:roomList().map(r=>({
      ...r,
      online:Object.values(db.sessions)
        .filter(x=>x.room===r.name).length
    }))
  });
});

function makeSession(name,type,likes=0){
  const sid=require("crypto").randomUUID();

  db.sessions[sid]={
    name,
    type,
    likes,
    lastLike:0,
    room:""
  };

  save();
  return sid
}

app.post("/api/register",(req,res)=>{
  const n=clean(req.body.name),
        p=String(req.body.password||"");

  if(!n||p.length<1)
    return res.status(400).json({error:"اكتب الاسم والباسورد"});

  if(db.users[n]||db.guests.includes(n))
    return res.status(409).json({error:"الاسم مستخدم"});

  db.users[n]={
    hash:bcrypt.hashSync(p,10),
    likes:0
  };

  const sid=makeSession(n,"member");
  res.json({sid});
});

app.post("/api/login",(req,res)=>{
  const n=clean(req.body.name),
        p=String(req.body.password||"");

  if(!db.users[n]||!bcrypt.compareSync(p,db.users[n].hash))
    return res.status(401).json({
      error:"الاسم أو الباسورد غير صحيح"
    });

  res.json({
    sid:makeSession(n,"member")
  });
});

app.post("/api/guest",(req,res)=>{
  const n=clean(req.body.name);

  if(!n||db.users[n]||db.guests.includes(n))
    return res.status(409).json({
      error:"الاسم مستخدم، اختر اسمًا آخر"
    });

  db.guests.push(n);

  const sid=makeSession(n,"guest",0);

  save();

  res.json({sid});
});

app.post("/api/logout",(req,res)=>{
  const u=userFrom(req);

  if(u?.type==="guest")
    db.guests=db.guests.filter(x=>x!==u.name);

  delete db.sessions[req.headers["x-session"]];

  save();

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
  const u=userFrom(req),
        to=clean(req.body.to);

  if(!u)
    return res.status(401).json({error:"سجل الدخول"});

  if(!to||to===u.name)
    return res.status(400).json({
      error:"لا يمكنك إعطاء إعجاب لنفسك"
    });

  const now=Date.now();

  const last=u.type==="member"
    ?(db.lastLike[u.name]||0)
    :(u.lastLike||0);

  if(now-last<10000)
    return res.status(429).json({
      error:`انتظر ${Math.ceil((10000-(now-last))/1000)} ثوانٍ`
    });

  if(u.type==="member")
    db.lastLike[u.name]=now;
  else
    u.lastLike=now;

  if(db.users[to]){
    db.users[to].likes=(db.users[to].likes||0)+1;
  }else{
    const target=Object.values(db.sessions).find(
      sess=>sess.type==="guest"&&sess.name===to
    );

    if(!target)
      return res.status(404).json({
        error:"العضو غير متصل"
      });

    target.likes=(target.likes||0)+1;
  }

  db.notifications[to]=db.notifications[to]||[];

  db.notifications[to].unshift({
    id:require("crypto").randomUUID(),
    type:"like",
    from:u.name,
    text:`أعطاك ${u.name} إعجابًا ❤️`,
    time:now,
    read:false
  });

  db.notifications[to]=db.notifications[to].slice(0,100);

  save();

  res.json({
    ok:true,
    targetLikes:likesOfAny(to),
    cooldown:10
  });
});

app.get("/api/members",(req,res)=>{
  const u=userFrom(req);

  if(!u)
    return res.status(401).json({
      error:"سجل الدخول"
    });

  const names=new Set(Object.keys(db.users));

  Object.keys(db.likes).forEach(n=>names.add(n));

  names.add("ريماز");
  names.add("Queen");
  names.add("علي العراقي");
  names.add("نور");
  names.add("كرار");
  names.add("ملاذ");

  const members=[...names]
    .filter(Boolean)
    .map(name=>{
      const p=profileOf(name);

      return {
        name,
        likes:likesOfAny(name),
        level:levelAny(name),
        profile:p,
        online:db.sessions&&
          Object.values(db.sessions)
          .some(x=>x.name===name)
      }
    });

  res.json(
    members.sort((a,b)=>b.likes-a.likes)
  );
});

app.get("/api/profile",(req,res)=>{
  const u=userFrom(req);

  if(!u)
    return res.status(401).json({
      error:"سجل الدخول"
    });

  res.json({
    name:u.name,
    likes:u.type==="member"
      ?likesOf(u.name)
      :(u.likes||0),
    level:levelAny(u.name),
    profile:profileOf(u.name),
    admin:isAdmin(u)
  });
});

app.post("/api/profile",(req,res)=>{
  const u=userFrom(req);

  if(!u)
    return res.status(401).json({
      error:"سجل الدخول"
    });

  const old=profileOf(u.name);

  const p={
    ...old,
    avatar:String(
      req.body.avatar||old.avatar
    ).slice(0,4),

    status:String(
      req.body.status||old.status
    ).slice(0,80),

    bio:String(
      req.body.bio||old.bio
    ).slice(0,300),

    nameColor:String(
      req.body.nameColor||old.nameColor
    ).slice(0,20),

    bgColor:String(
      req.body.bgColor||old.bgColor
    ).slice(0,20)
  };

  db.profiles[u.name]=p;

  save();

  res.json({
    ok:true,
    profile:p
  });
});

app.get("/api/notifications",(req,res)=>{
  const u=userFrom(req);

  if(!u)
    return res.status(401).json({
      error:"سجل الدخول"
    });

  res.json(
    (db.notifications[u.name]||[])
      .slice(0,50)
  );
});

app.post("/api/notifications/read",(req,res)=>{
  const u=userFrom(req);

  if(!u)
    return res.status(401).json({
      error:"سجل الدخول"
    });

  (db.notifications[u.name]||[])
    .forEach(n=>n.read=true);

  save();

  res.json({ok:true});
});

app.post("/api/notify",(req,res)=>{
  const u=userFrom(req),
        to=clean(req.body.to),
        text=String(req.body.text||"")
          .trim()
          .slice(0,240);

  if(!u)
    return res.status(401).json({
      error:"سجل الدخول"
    });

  if(userLikes(u)<400)
    return res.status(403).json({
      error:"إرسال التنبيهات يفتح عند 400 إعجاب"
    });

  if(!to||!text)
    return res.status(400).json({
      error:"اختر عضوًا واكتب التنبيه"
    });

  db.notifications[to]=db.notifications[to]||[];

  db.notifications[to].unshift({
    id:require("crypto").randomUUID(),
    type:"notice",
    from:u.name,
    text,
    time:Date.now(),
    read:false
  });

  db.notifications[to]=
    db.notifications[to].slice(0,100);

  save();

  res.json({ok:true});
});

app.post("/api/admin/grant-like",(req,res)=>{
  const u=userFrom(req),
        to=clean(req.body.to),
        amount=Math.max(
          1,
          Math.min(
            10000,
            Number(req.body.amount)||1
          )
        );

  if(!isAdmin(u))
    return res.status(403).json({
      error:"هذا الإجراء للإدارة فقط"
    });

  if(!to)
    return res.status(400).json({
      error:"اسم العضو مطلوب"
    });

  if(db.users[to]){
    db.users[to].likes=
      (db.users[to].likes||0)+amount;

    save();

    return res.json({
      ok:true,
      likes:db.users[to].likes
    });
  }

  const guest=Object.values(db.sessions).find(
    x=>x.type==="guest"&&x.name===to
  );

  if(guest){
    guest.likes=
      (guest.likes||0)+amount;

    save();

    return res.json({
      ok:true,
      likes:guest.likes,
      temporary:true
    });
  }

  return res.status(404).json({
    error:"العضو غير موجود أو غير متصل"
  });
});

app.get("/api/rooms",(req,res)=>{
  const u=userFrom(req);

  if(!u)
    return res.status(401).json({
      error:"سجل الدخول"
    });

  const rooms=roomList().map(r=>({
    ...r,
    online:Object.values(db.sessions)
      .filter(x=>x.room===r.name).length
  }));

  res.json(rooms);
});

app.post("/api/rooms/create",(req,res)=>{
  const u=userFrom(req);

  if(!isAdmin(u))
    return res.status(403).json({
      error:"الإدارة فقط"
    });

  const name=clean(req.body.name),
        desc=String(req.body.desc||"نص فقط").slice(0,80),
        kind=["public","private","voice"]
          .includes(req.body.kind)
          ?req.body.kind
          :"public";

  const capacity=Math.max(
    2,
    Math.min(
      200,
      Number(req.body.capacity)||50
    )
  );

  const mics=kind==="voice"
    ?Math.max(
        1,
        Math.min(
          20,
          Number(req.body.mics)||4
        )
      )
    :0;

  if(!name)
    return res
