const n=clean(req.body.name),p=String(req.body.password||"");
 if(!db.users[n]||!bcrypt.compareSync(p,db.users[n].hash))return res.status(401).json({error:"الاسم أو الباسورد غير صحيح"});
 res.json({sid:makeSession(n,"member")});
});
app.post("/api/guest",(req,res)=>{
 db.guests=db.guests.filter(g=>Object.values(db.sessions||{}).some(s=>s.type==="guest"&&s.name===g));
 const n=clean(req.body.name);
 if(!n||db.users[n]||db.guests.includes(n))return res.status(409).json({error:"الاسم مستخدم، اختر اسمًا آخر"});
 db.guests.push(n);const sid=makeSession(n,"guest",0);save();res.json({sid});
});
app.post("/api/logout",(req,res)=>{
 const u=userFrom(req); if(u?.type==="guest")db.guests=db.guests.filter(x=>x!==u.name);
 delete db.sessions[req.headers["x-session"]];save();res.json({ok:true});
});
