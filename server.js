'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');
const ROOMS = ['الغرفة العامة', 'غرفة المايك'];
const online = new Map(); // socket id -> online session
const accounts = new Map();
fs.mkdirSync(DATA_DIR, { recursive: true });
try { for (const u of JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))) accounts.set(u.nameKey, u); } catch {}
function saveAccounts(){ const tmp=DB_FILE+'.tmp'; fs.writeFileSync(tmp, JSON.stringify([...accounts.values()], null, 2)); fs.renameSync(tmp, DB_FILE); }
function clean(v,n=80){ return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,n); }
function safeUser(u){ return {id:u.id,name:u.name,likes:u.likes||0,avatar:u.avatar||'',role:u.role||'user',status:u.status||'متصل',room:u.room||ROOMS[0],privateOpen:u.privateOpen!==false,noticesOpen:u.noticesOpen!==false,authenticated:!!u.authenticated}; }
function broadcastMembers(){ const list=[...online.values()].map(safeUser); io.emit('members',list); }
function emitError(s,text){s.emit('app:error',text)}
function requireUser(s){if(!s.data.user){emitError(s,'سجّل الدخول أولاً حتى تستخدم هذه الميزة.');return null;}return s.data.user;}
app.use(express.static(path.join(__dirname,'public')));
app.get('/health',(req,res)=>res.json({ok:true,online:online.size,rooms:ROOMS}));
io.on('connection', socket=>{
  // Everyone can browse the online list before login; this does not create a user or allow actions.
  socket.emit('members',[...online.values()].map(safeUser));
  socket.on('browse:members',()=>socket.emit('members',[...online.values()].map(safeUser)));
  socket.on('auth:join', payload=>{
    if(socket.data.user) return emitError(socket,'أنت داخل الدردشة بالفعل.');
    const name=clean(payload?.name,32); if(name.length<2) return emitError(socket,'الاسم يجب أن يحتوي حرفين على الأقل.');
    const nameKey=name.toLocaleLowerCase('ar');
    if([...online.values()].some(u=>u.nameKey===nameKey)) return emitError(socket,'هذا الاسم موجود داخل الدردشة حالياً.');
    const account=accounts.get(nameKey);
    if(payload?.register){
      const password=String(payload.password||''); if(password.length<6) return emitError(socket,'كلمة المرور للتسجيل يجب أن تكون 6 أحرف على الأقل.');
      if(account) return emitError(socket,'هذا الاسم مسجل مسبقاً.');
      // Store password hashes only.
      const crypto=require('crypto'); const salt=crypto.randomBytes(16).toString('hex');
      const hash=crypto.scryptSync(password,salt,64).toString('hex');
      accounts.set(nameKey,{nameKey,name,salt,hash,likes:0,role:'user',avatar:'',privateOpen:true,noticesOpen:true}); saveAccounts();
    } else if(account){
      const crypto=require('crypto'); const password=String(payload.password||'');
      if(!password || crypto.scryptSync(password,account.salt,64).toString('hex')!==account.hash) return emitError(socket,'الاسم مسجل؛ أدخل كلمة المرور الصحيحة.');
    }
    const stored=accounts.get(nameKey);
    const u={id:socket.id,name,nameKey,likes:stored?.likes||0,role:stored?.role||'user',avatar:stored?.avatar||'',privateOpen:stored?.privateOpen!==false,noticesOpen:stored?.noticesOpen!==false,room:ROOMS[0],status:'متصل',authenticated:true,registered:!!stored,lastLike:0};
    socket.data.user=u; socket.data.room=ROOMS[0]; online.set(socket.id,u); socket.join(ROOMS[0]); broadcastMembers(); socket.to(ROOMS[0]).emit('system','هذا المستخدم قد دخل الغرفة'); socket.emit('auth:ok',safeUser(u));
  });
  socket.on('chat:message',payload=>{const u=requireUser(socket);if(!u)return;const text=clean(payload?.text,2000);if(!text)return;const room=u.room;if(!ROOMS.includes(room)||room==='غرفة المايك')return emitError(socket,'الغرفة العامة مخصصة للكتابة، وغرفة المايك للصوت.');io.to(room).emit('chat:message',{id:socket.id,name:u.name,avatar:u.avatar,text,room,at:Date.now()});});
  socket.on('room:join',name=>{const u=requireUser(socket);if(!u)return;const room=clean(name,40);if(!ROOMS.includes(room))return emitError(socket,'هذه الغرفة غير متاحة.');if(u.room===room)return;socket.to(u.room).emit('system','(هذا المستخدم قد غادر الغرفة)');socket.leave(u.room);u.room=room;socket.data.room=room;socket.join(room);socket.emit('system','هذا المستخدم قد دخل الغرفة');broadcastMembers();});
  socket.on('user:like',targetId=>{const u=requireUser(socket);if(!u)return;if(Date.now()-u.lastLike<10000)return emitError(socket,'انتظر 10 ثوانٍ قبل إرسال إعجاب آخر.');const target=online.get(String(targetId));if(!target)return emitError(socket,'المستخدم غير موجود حالياً.');if(target.id===u.id)return emitError(socket,'ما تكدر ترسل إعجاب لنفسك.');u.lastLike=Date.now();target.likes=(target.likes||0)+1;const a=accounts.get(target.nameKey);if(a){a.likes=target.likes;saveAccounts();}io.to(target.id).emit('user:liked',{from:u.name,likes:target.likes});socket.emit('user:like:ok',{targetId:target.id,likes:target.likes});broadcastMembers();});
  socket.on('settings:toggle',data=>{const u=requireUser(socket);if(!u)return;if(typeof data?.privateOpen==='boolean')u.privateOpen=data.privateOpen;if(typeof data?.noticesOpen==='boolean')u.noticesOpen=data.noticesOpen;const a=accounts.get(u.nameKey);if(a){a.privateOpen=u.privateOpen;a.noticesOpen=u.noticesOpen;saveAccounts();}broadcastMembers();});
  socket.on('private:message',payload=>{const u=requireUser(socket);if(!u)return;const target=online.get(clean(payload?.targetId,100));const text=clean(payload?.text,2000);if(!target||!text)return emitError(socket,'المستخدم غير متاح.');if(!u.privateOpen)return emitError(socket,'أنت مغلق الخاص من الإعدادات.');if(!target.privateOpen)return emitError(socket,'هذا المستخدم أغلق المحادثات الخاصة.');io.to(target.id).emit('private:message',{fromId:u.id,from:u.name,text,at:Date.now()});socket.emit('private:message:sent',{toId:target.id,to:target.name,text,at:Date.now()});});
  socket.on('wall:post',payload=>{const u=requireUser(socket);if(!u)return;const text=clean(payload?.text,1000);if(text)io.emit('wall:post',{name:u.name,avatar:u.avatar,text,at:Date.now()});});
  socket.on('disconnect',()=>{const u=online.get(socket.id);if(!u)return;online.delete(socket.id);socket.to(u.room).emit('system','(هذا المستخدم قد غادر الدردشة)');broadcastMembers();});
});
const port=Number(process.env.PORT)||3000;server.listen(port,'0.0.0.0',()=>console.log(`Rimaz listening on ${port}`));
