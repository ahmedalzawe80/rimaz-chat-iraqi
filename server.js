const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1024 * 1024 * 200 });
const PORT = Number(process.env.PORT) || 3000;

const DATA_DIR = process.env.DATA_DIR || (fs.existsSync("/data") ? "/data" : path.join(__dirname, "data"));
const DATA = path.join(DATA_DIR, "data.json");
const UP = path.join(DATA_DIR, "uploads");
const MAX_FILE_SIZE = 100 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UP, { recursive: true });

function newDb() {
  return {
    users: {},
    guests: [],
    messages: [],
    privateMessages: [],
    wall: [],
    likes: {},
    lastLike: {},
    sessions: {},
    notifications: {},
    profiles: {},
    settings: {},
    permissionOverrides: {},
    rooms: {},
    roomBans: {},
    roomMutes: {},
    roomKicks: {}
  };
}

function loadDb() {
  if (!fs.existsSync(DATA)) return newDb();
  try {
    return JSON.parse(fs.readFileSync(DATA, "utf8"));
  } catch (e) {
    console.error("خطأ بقراءة data.json:", e.message);
    return newDb();
  }
}

const db = loadDb();
const arrayKeys = ["guests", "messages", "privateMessages", "wall"];
const objectKeys = [
  "users", "likes", "lastLike", "sessions", "notifications", "profiles",
  "settings", "permissionOverrides", "rooms", "roomBans", "roomMutes", "roomKicks"
];
for (const k of arrayKeys) if (!Array.isArray(db[k])) db[k] = [];
for (const k of objectKeys) if (!db[k] || typeof db[k] !== "object" || Array.isArray(db[k])) db[k] = {};

const defaultRooms = [
  { name: "الغرفة العامة", count: 0, desc: "نص فقط", kind: "public", capacity: 200, mics: 0, owner: "admin" },
  { name: "غرفة عامة + مايك", count: 0, desc: "نص + مايك", kind: "public_voice", capacity: 200, mics: 8, owner: "admin" },
  { name: "غرفة المايك", count: 0, desc: "مايك فقط", kind: "voice", capacity: 50, mics: 8, owner: "admin" },
  { name: "غرفة شخصين", count: 0, desc: "شخصان فقط", kind: "private2", capacity: 2, mics: 0, owner: "admin" },
  { name: "غرفة المسابقات", count: 0, desc: "مسابقات ودردشة", kind: "public", capacity: 200, mics: 0, owner: "admin" },
  { name: "غرفة ريماز", count: 0, desc: "دردشة ريماز", kind: "public", capacity: 200, mics: 0, owner: "admin" },
  { name: "غرفة الإدارة", count: 0, desc: "للإدارة والمشرفين", kind: "admin", capacity: 50, mics: 0, owner: "admin" }
];
for (const r of defaultRooms) if (!db.rooms[r.name]) db.rooms[r.name] = r;

function save() {
  const tmp = DATA + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DATA);
}

function clean(value, max = 40) {
  return String(value ?? "").trim().slice(0, max);
}
function now() { return Date.now(); }
function sidOf(req) { return req.headers["x-session"]; }
function userFrom(req) {
  const sid = sidOf(req);
  return sid && db.sessions[sid] ? db.sessions[sid] : null;
}
function likesOf(name) { return Number(db.users[name]?.likes || 0); }
function userLikes(u) { return u?.type === "member" ? likesOf(u.name) : Number(u?.likes || 0); }
function level(likes) { return likes >= 500 ? 3 : likes >= 400 ? 2 : 1; }
function canNotice(u) { return isAdmin(u) || userLikes(u) >= 400 || !!db.permissionOverrides[u?.name]?.notice; }
function canMedia(u) { return isAdmin(u) || userLikes(u) >= 500 || !!db.permissionOverrides[u?.name]?.media; }
function canAvatar(u) { return isAdmin(u) || userLikes(u) >= 10 || !!db.permissionOverrides[u?.name]?.avatar; }
function profileOf(name) {
  return db.profiles[name] || {
    avatar: "👤",
    status: "متصل الآن",
    bio: "عضو في دردشة ريماز عراقية",
    nameColor: "#222222",
    bgColor: "#ffffff"
  };
}
function settingsOf(name) {
  return db.settings[name] || { privateEnabled: true, notificationsEnabled: true, ignored: [] };
}
function roomOf(name) { return db.rooms[name] || null; }
function roomList() { return Object.values(db.rooms); }
function activeSessions(name, type) {
  return Object.values(db.sessions).filter(s => s.name === name && (!type || s.type === type));
}
function guestIsActive(name) { return activeSessions(name, "guest").length > 0; }
function sessionTarget(name) { return Object.values(db.sessions).find(s => s.name === name) || null; }
function roomPeople(room) { return Object.values(db.sessions).filter(s => s.room === room); }
function roomIsPrivate(room) { return !!room && ["private", "private2"].includes(room.kind); }
function roomIsVoice(room) { return !!room && ["voice", "public_voice"].includes(room.kind); }
function roomAllowsText(room) { return !!room && room.kind !== "voice"; }
function isIgnored(byName, targetName) { return settingsOf(byName).ignored.includes(targetName); }
function isIgnoringEither(a, b) { return isIgnored(a, b) || isIgnored(b, a); }

function isAdmin(u) {
  if (!u || u.type !== "member") return false;
  const adminName = clean(process.env.ADMIN_NAME || "admin");
  if (u.name !== adminName) return false;
  const configured = String(process.env.ADMIN_PASSWORD || "");
  return !!u.adminVerified && (!!configured || u.name === "admin");
}

function makeSession(name, type, likes = 0, adminVerified = false) {
  const sid = crypto.randomUUID();
  db.sessions[sid] = {
    name,
    type,
    likes,
    lastLike: 0,
    room: "",
    privateWith: "",
    mic: false,
    created: now(),
    adminVerified: !!adminVerified
  };
  if (type === "guest" && !db.guests.includes(name)) db.guests.push(name);
  save();
  return sid;
}

function destroySession(sid, announce = true) {
  const u = db.sessions[sid];
  if (!u) return;
  const oldRoom = u.room;
  const name = u.name;
  delete db.sessions[sid];
  if (oldRoom && announce) emitSystem(oldRoom, `🔴 لقد غادر ${name} الغرفة`);
  if (u.type === "guest" && !guestIsActive(name)) db.guests = db.guests.filter(x => x !== name);
  save();
}

function emitSystem(room, text) {
  if (!room) return;
  const message = { room, name: "النظام", text, system: true, time: now() };
  db.messages.push(message);
  db.messages = db.messages.slice(-5000);
  io.to(room).emit("message", message);
  save();
}

function roomDenied(u, room) {
  const key = room + "::" + u.name;
  const t = now();
  const ban = db.roomBans[key];
  const kick = db.roomKicks[key];
  if (ban && (!ban.until || ban.until > t)) return "أنت محظور من هذه الغرفة";
  if (kick && kick > t) return "تم طردك مؤقتًا من هذه الغرفة";
  return null;
}
function roomMuted(u, room) { return Number(db.roomMutes[room + "::" + u.name] || 0) > now(); }
function canEnterRoom(u, room) {
  if (!u || !room) return "بيانات الدخول غير صحيحة";
  if (room.kind === "admin" && !isAdmin(u)) return "هذه الغرفة للإدارة فقط";
  return null;
}

function findSocketByName(name) {
  return [...io.sockets.sockets.values()].filter(s => s.data.user?.name === name);
}
function isActivePrivatePair(a, b) {
  if (!a || !b || a.name === b.name) return false;
  if (a.privateWith === b.name || b.privateWith === a.name) return true;
  return false;
}
function requirePrivateOpen(sender, target) {
  if (!target) return "العضو غير متصل";
  if (!settingsOf(target.name).privateEnabled) return "هذا المستخدم لقد اغلق الخاص";
  if (isIgnoringEither(sender.name, target.name)) return "لا يمكن مراسلة هذا المستخدم";
  if (!isActivePrivatePair(sender, target)) return "افتح المحادثة الخاصة أولًا";
  return null;
}

function notifyUser(targetName, notification) {
  if (!settingsOf(targetName).notificationsEnabled) return false;
  db.notifications[targetName] = db.notifications[targetName] || [];
  db.notifications[targetName].unshift(notification);
  db.notifications[targetName] = db.notifications[targetName].slice(0, 100);
  for (const s of findSocketByName(targetName)) s.emit("notification", notification);
  return true;
}

function removeUploadedFile(file) {
  if (!file?.path) return;
  try { fs.unlinkSync(file.path); } catch (_) {}
}

function cleanExpiredModeration() {
  const t = now();
  for (const store of [db.roomBans, db.roomMutes, db.roomKicks]) {
    for (const [key, value] of Object.entries(store)) {
      const until = typeof value === "object" ? value.until : value;
      if (until && until <= t) delete store[key];
    }
  }
}
cleanExpiredModeration();
save();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").slice(0, 12);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

app.get("/api/state", (req, res) => {
  const u = userFrom(req);
  const likes = u ? userLikes(u) : 0;
  res.json({
    user: u ? {
      name: u.name,
      type: u.type,
      likes,
      level: level(likes),
      admin: isAdmin(u),
      profile: profileOf(u.name),
      settings: settingsOf(u.name),
      room: u.room || ""
    } : null,
    rooms: roomList().map(r => ({ ...r, online: roomPeople(r.name).length }))
  });
});

app.post("/api/register", (req, res) => {
  const name = clean(req.body.name);
  const password = String(req.body.password || "");
  if (!name || !password) return res.status(400).json({ error: "اكتب الاسم والباسورد" });
  if (name.length < 2) return res.status(400).json({ error: "الاسم قصير جدًا" });
  if (password.length < 4) return res.status(400).json({ error: "الباسورد يجب أن يكون 4 أحرف على الأقل" });
  if (db.users[name] || guestIsActive(name)) return res.status(409).json({ error: "الاسم مستخدم" });
  db.users[name] = { hash: bcrypt.hashSync(password, 10), likes: 0 };
  db.profiles[name] = profileOf(name);
  db.settings[name] = settingsOf(name);
  const adminName = clean(process.env.ADMIN_NAME || "admin");
  const configuredAdmin = String(process.env.ADMIN_PASSWORD || "");
  const adminVerified = name === adminName && !!configuredAdmin && password === configuredAdmin;
  const sid = makeSession(name, "member", 0, adminVerified);
  res.json({ sid });
});

app.post("/api/login", (req, res) => {
  const name = clean(req.body.name);
  const password = String(req.body.password || "");
  if (!db.users[name] || !bcrypt.compareSync(password, db.users[name].hash)) {
    return res.status(401).json({ error: "الاسم أو الباسورد غير صحيح" });
  }
  const adminName = clean(process.env.ADMIN_NAME || "admin");
  const configuredAdmin = String(process.env.ADMIN_PASSWORD || "");
  const adminVerified = name === adminName && !!configuredAdmin && password === configuredAdmin;
  res.json({ sid: makeSession(name, "member", 0, adminVerified) });
});

app.post("/api/guest", (req, res) => {
  const name = clean(req.body.name);
  if (!name) return res.status(400).json({ error: "اكتب اسم الزائر" });
  if (db.users[name] || guestIsActive(name)) return res.status(409).json({ error: "الاسم مستخدم حاليًا، اختر اسمًا آخر" });
  res.json({ sid: makeSession(name, "guest", 0) });
});

app.post("/api/logout", (req, res) => {
  const sid = sidOf(req);
  if (sid) destroySession(sid, true);
  res.json({ ok: true });
});

app.get("/api/messages", (req, res) => {
  const room = clean(req.query.room) || "الغرفة العامة";
  res.json(db.messages.filter(m => m.room === room).slice(-100));
});

app.post("/api/like", (req, res) => {
  const u = userFrom(req);
  const to = clean(req.body.to);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  if (!to || to === u.name) return res.status(400).json({ error: "لا يمكنك إعطاء إعجاب لنفسك" });
  const last = u.type === "member" ? Number(db.lastLike[u.name] || 0) : Number(u.lastLike || 0);
  const diff = now() - last;
  if (diff < 10000) return res.status(429).json({ error: `انتظر ${Math.ceil((10000 - diff) / 1000)} ثوانٍ` });
  let target;
  if (db.users[to]) {
    db.users[to].likes = Number(db.users[to].likes || 0) + 1;
    target = db.users[to];
  } else {
    target = sessionTarget(to);
    if (!target || target.type !== "guest") return res.status(404).json({ error: "العضو غير متصل" });
    target.likes = Number(target.likes || 0) + 1;
  }
  if (u.type === "member") db.lastLike[u.name] = now(); else u.lastLike = now();
  const n = { id: crypto.randomUUID(), type: "like", from: u.name, text: `لقد وصلك لايك من ${u.name} ❤️`, time: now(), read: false };
  notifyUser(to, n);
  save();
  res.json({ ok: true, targetLikes: userLikes(target), cooldown: 10 });
});

app.get("/api/members", (req, res) => {
  const u = userFrom(req);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  const names = new Set(Object.keys(db.users));
  Object.values(db.sessions).forEach(s => names.add(s.name));
  const members = [...names].filter(Boolean).map(name => {
    const s = sessionTarget(name);
    const likes = likesOf(name) || Number(s?.likes || 0);
    return {
      name,
      type: db.users[name] ? "member" : "guest",
      likes,
      level: level(likes),
      profile: profileOf(name),
      online: activeSessions(name).length > 0,
      room: s?.room || ""
    };
  });
  res.json(members.sort((a, b) => b.likes - a.likes));
});

app.get("/api/profile", (req, res) => {
  const u = userFrom(req);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  const likes = userLikes(u);
  res.json({ name: u.name, type: u.type, likes, level: level(likes), profile: profileOf(u.name), settings: settingsOf(u.name), admin: isAdmin(u) });
});

app.get("/api/profile/:name", (req, res) => {
  const u = userFrom(req);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  const name = clean(req.params.name);
  const s = sessionTarget(name);
  const likes = likesOf(name) || Number(s?.likes || 0);
  res.json({ name, type: db.users[name] ? "member" : s ? "guest" : "unknown", likes, level: level(likes), profile: profileOf(name), online: activeSessions(name).length > 0, room: s?.room || "", privateEnabled: settingsOf(name).privateEnabled, notificationsEnabled: settingsOf(name).notificationsEnabled, ignoredByMe: isIgnored(u.name, name) });
});

app.post("/api/profile", (req, res) => {
  const u = userFrom(req);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  const old = profileOf(u.name);
  const incomingAvatar = String(req.body.avatar ?? old.avatar);
  if (incomingAvatar !== old.avatar && !canAvatar(u)) return res.status(403).json({ error: "تغيير الصورة يفتح عند 10 إعجابات" });
  db.profiles[u.name] = {
    ...old,
    avatar: incomingAvatar.slice(0, 500),
    status: String(req.body.status ?? old.status).slice(0, 80),
    bio: String(req.body.bio ?? old.bio).slice(0, 300),
    nameColor: String(req.body.nameColor ?? old.nameColor).slice(0, 20),
    bgColor: String(req.body.bgColor ?? old.bgColor).slice(0, 20)
  };
  save();
  res.json({ ok: true, profile: db.profiles[u.name] });
});

app.post("/api/profile/avatar", upload.single("file"), (req, res) => {
  const u = userFrom(req);
  if (!u) { removeUploadedFile(req.file); return res.status(401).json({ error: "سجل الدخول" }); }
  if (!canAvatar(u)) { removeUploadedFile(req.file); return res.status(403).json({ error: "تغيير الصورة يفتح عند 10 إعجابات" }); }
  if (!req.file) return res.status(400).json({ error: "لم يتم اختيار صورة" });
  if (!/^image\/(jpeg|png|gif|webp)$/.test(req.file.mimetype)) { removeUploadedFile(req.file); return res.status(415).json({ error: "اختر صورة JPG أو PNG أو GIF أو WEBP" }); }
  const old = profileOf(u.name);
  db.profiles[u.name] = { ...old, avatar: `/uploads/${req.file.filename}` };
  save();
  res.json({ ok: true, profile: db.profiles[u.name] });
});

app.post("/api/settings", (req, res) => {
  const u = userFrom(req);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  const old = settingsOf(u.name);
  const next = {
    privateEnabled: req.body.privateEnabled === undefined ? old.privateEnabled : !!req.body.privateEnabled,
    notificationsEnabled: req.body.notificationsEnabled === undefined ? old.notificationsEnabled : !!req.body.notificationsEnabled,
    ignored: Array.isArray(old.ignored) ? old.ignored : []
  };
  db.settings[u.name] = next;
  save();
  res.json({ ok: true, settings: next });
});

app.post("/api/private/ignore", (req, res) => {
  const u = userFrom(req);
  const targetName = clean(req.body.to);
  const enabled = req.body.enabled !== false;
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  if (!targetName || targetName === u.name) return res.status(400).json({ error: "الشخص غير صحيح" });
  const settings = settingsOf(u.name);
  const ignored = new Set(settings.ignored || []);
  if (enabled) ignored.add(targetName); else ignored.delete(targetName);
  db.settings[u.name] = { ...settings, ignored: [...ignored].slice(0, 500) };
  for (const s of findSocketByName(u.name)) {
    s.emit("ignore-state", { to: targetName, enabled });
  }
  save();
  res.json({ ok: true, enabled, settings: db.settings[u.name] });
});

app.get("/api/notifications", (req, res) => {
  const u = userFrom(req);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  res.json({ enabled: settingsOf(u.name).notificationsEnabled, items: (db.notifications[u.name] || []).slice(0, 50) });
});

app.post("/api/notifications/read", (req, res) => {
  const u = userFrom(req);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  (db.notifications[u.name] || []).forEach(n => { n.read = true; });
  save();
  res.json({ ok: true });
});

app.post("/api/notify", (req, res) => {
  const u = userFrom(req);
  const to = clean(req.body.to);
  const text = String(req.body.text || "").trim().slice(0, 240);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  if (!canNotice(u)) return res.status(403).json({ error: "إرسال التنبيهات يفتح عند 400 إعجاب" });
  if (!to || !text) return res.status(400).json({ error: "اختر عضوًا واكتب التنبيه" });
  if (to === u.name) return res.status(400).json({ error: "لا ترسل تنبيهًا لنفسك" });
  if (!sessionTarget(to) && !db.users[to]) return res.status(404).json({ error: "العضو غير موجود" });
  if (!settingsOf(to).notificationsEnabled) return res.status(403).json({ error: "هذا الشخص لقد اغلق التنبيه" });
  const notification = { id: crypto.randomUUID(), type: "notice", from: u.name, text, time: now(), read: false };
  notifyUser(to, notification);
  save();
  res.json({ ok: true });
});

app.post("/api/admin/grant-like", (req, res) => {
  const u = userFrom(req);
  if (!isAdmin(u)) return res.status(403).json({ error: "هذا الإجراء للإدارة فقط" });
  const to = clean(req.body.to);
  const amount = Math.max(1, Math.min(10000, Number(req.body.amount) || 1));
  if (!to) return res.status(400).json({ error: "اسم العضو مطلوب" });
  if (db.users[to]) { db.users[to].likes = Number(db.users[to].likes || 0) + amount; save(); return res.json({ ok: true, likes: db.users[to].likes }); }
  const guest = sessionTarget(to);
  if (guest?.type === "guest") { guest.likes = Number(guest.likes || 0) + amount; save(); return res.json({ ok: true, likes: guest.likes, temporary: true }); }
  return res.status(404).json({ error: "العضو غير موجود أو غير متصل" });
});

app.get("/api/admin/users", (req, res) => {
  const u = userFrom(req);
  if (!isAdmin(u)) return res.status(403).json({ error: "الإدارة فقط" });
  const members = Object.keys(db.users).map(name => ({ name, type: "member", likes: likesOf(name), online: activeSessions(name).length > 0, room: sessionTarget(name)?.room || "" }));
  const guests = Object.values(db.sessions).filter(s => s.type === "guest").map(s => ({ name: s.name, type: "guest", likes: s.likes || 0, online: true, room: s.room || "" }));
  res.json({ members, guests });
});

app.post("/api/admin/permission", (req, res) => {
  const u = userFrom(req);
  if (!isAdmin(u)) return res.status(403).json({ error: "الإدارة فقط" });
  const name = clean(req.body.name);
  const key = String(req.body.permission || "").trim();
  if (!name || !["notice", "media", "avatar"].includes(key)) return res.status(400).json({ error: "الاسم والصلاحية غير صحيحين" });
  db.permissionOverrides[name] = db.permissionOverrides[name] || {};
  db.permissionOverrides[name][key] = !!req.body.enabled;
  save();
  res.json({ ok: true, permissions: db.permissionOverrides[name] });
});

app.get("/api/rooms", (req, res) => {
  const u = userFrom(req);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  res.json(roomList().map(r => ({ ...r, online: roomPeople(r.name).length })));
});

app.post("/api/rooms/create", (req, res) => {
  const u = userFrom(req);
  if (!isAdmin(u)) return res.status(403).json({ error: "الإدارة فقط" });
  const name = clean(req.body.name);
  const desc = String(req.body.desc || "نص فقط").slice(0, 80);
  const kinds = ["public", "public_voice", "voice", "private", "private2", "admin"];
  const kind = kinds.includes(req.body.kind) ? req.body.kind : "public";
  let capacity = Math.max(2, Math.min(200, Number(req.body.capacity) || 50));
  if (kind === "private2") capacity = 2;
  const mics = roomIsVoice({ kind }) ? Math.max(1, Math.min(20, Number(req.body.mics) || 4)) : 0;
  if (!name) return res.status(400).json({ error: "اسم الغرفة مطلوب" });
  if (db.rooms[name]) return res.status(409).json({ error: "الغرفة موجودة" });
  db.rooms[name] = { name, desc, kind, capacity, mics, count: 0, owner: u.name };
  save();
  res.json(db.rooms[name]);
});

app.post("/api/rooms/update", (req, res) => {
  const u = userFrom(req);
  const name = clean(req.body.name);
  if (!isAdmin(u)) return res.status(403).json({ error: "الإدارة فقط" });
  const r = db.rooms[name];
  if (!r) return res.status(404).json({ error: "الغرفة غير موجودة" });
  r.desc = String(req.body.desc ?? r.desc).slice(0, 80);
  r.capacity = r.kind === "private2" ? 2 : Math.max(2, Math.min(200, Number(req.body.capacity) || r.capacity));
  if (roomIsVoice(r)) r.mics = Math.max(1, Math.min(20, Number(req.body.mics) || r.mics));
  save();
  res.json(r);
});

app.post("/api/rooms/delete", (req, res) => {
  const u = userFrom(req);
  const name = clean(req.body.name);
  if (!isAdmin(u)) return res.status(403).json({ error: "الإدارة فقط" });
  if (defaultRooms.some(r => r.name === name)) return res.status(400).json({ error: "لا يمكن حذف الغرف الأساسية" });
  if (!db.rooms[name]) return res.status(404).json({ error: "الغرفة غير موجودة" });
  delete db.rooms[name];
  save();
  res.json({ ok: true });
});

app.post("/api/room/moderate", (req, res) => {
  const u = userFrom(req);
  const room = clean(req.body.room);
  const to = clean(req.body.to);
  const action = String(req.body.action || "");
  if (!isAdmin(u)) return res.status(403).json({ error: "الإدارة فقط" });
  if (!room || !to || !roomOf(room)) return res.status(400).json({ error: "الغرفة أو العضو غير صحيح" });
  const key = room + "::" + to;
  const mins = Math.max(1, Math.min(10080, Number(req.body.minutes) || 10));
  if (action === "mute") db.roomMutes[key] = now() + mins * 60000;
  else if (action === "kick") db.roomKicks[key] = now() + mins * 60000;
  else if (action === "ban") db.roomBans[key] = { until: now() + mins * 60000 };
  else if (action === "unban") delete db.roomBans[key];
  else if (action === "unmute") delete db.roomMutes[key];
  else return res.status(400).json({ error: "إجراء غير معروف" });
  save();
  for (const s of io.sockets.sockets.values()) {
    if (s.data.user?.name === to && s.data.room === room) {
      if (action === "kick" || action === "ban") {
        s.leave(room); s.data.room = ""; s.data.user.room = ""; s.data.user.mic = false;
        s.emit("room-kicked", { room, action });
      } else s.emit("room-moderation", { room, action, minutes });
    }
  }
  res.json({ ok: true });
});

app.get("/api/room/status", (req, res) => {
  const u = userFrom(req);
  const room = clean(req.query.room);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  const r = roomOf(room);
  if (!r) return res.status(404).json({ error: "الغرفة غير موجودة" });
  const people = roomPeople(room).map(x => ({ name: x.name, type: x.type, likes: userLikes(x), level: level(userLikes(x)), muted: roomMuted(x, room), mic: !!x.mic, profile: profileOf(x.name) }));
  const banned = Object.keys(db.roomBans).filter(k => k.startsWith(room + "::")).map(k => k.slice((room + "::").length));
  const mics = roomIsVoice(r) ? people.filter(x => x.mic).map(x => x.name) : [];
  res.json({ room: r, people, banned, mics, canManage: isAdmin(u), muted: roomMuted(u, room) });
});

app.post("/api/room/mic-request", (req, res) => {
  const u = userFrom(req);
  const room = clean(req.body.room);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  const r = roomOf(room);
  if (!r || !roomIsVoice(r)) return res.status(400).json({ error: "هذه ليست غرفة مايك" });
  if (u.room !== room) return res.status(403).json({ error: "ادخل غرفة المايك أولًا" });
  const n = { id: crypto.randomUUID(), type: "mic-request", from: u.name, text: `طلب ${u.name} تشغيل المايك في ${room}`, time: now(), read: false };
  for (const s of Object.values(db.sessions)) if (isAdmin(s)) notifyUser(s.name, n);
  save();
  io.to(room).emit("mic-request", { name: u.name, room });
  res.json({ ok: true });
});

app.post("/api/room/mic", (req, res) => {
  const u = userFrom(req);
  const room = clean(req.body.room);
  const on = !!req.body.on;
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  const r = roomOf(room);
  if (!r || !roomIsVoice(r)) return res.status(400).json({ error: "هذه ليست غرفة مايك" });
  if (u.room !== room) return res.status(403).json({ error: "ادخل غرفة المايك أولًا" });
  const denied = roomDenied(u, room);
  if (denied) return res.status(403).json({ error: denied });
  if (on && roomMuted(u, room)) return res.status(403).json({ error: "أنت مكتوم في هذه الغرفة" });
  if (on && roomPeople(room).filter(x => x.mic).length >= r.mics && !u.mic) return res.status(409).json({ error: "كل المايكات ممتلئة" });
  u.mic = on;
  save();
  io.to(room).emit("mic-state", { name: u.name, on });
  res.json({ ok: true, on });
});

app.post("/api/wall", (req, res) => {
  const u = userFrom(req);
  if (!u) return res.status(401).json({ error: "سجل الدخول" });
  const text = String(req.body.text || "").trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: "اكتب المنشور" });
  const post = { id: crypto.randomUUID(), name: u.name, text, time: now(), likes: 0, profile: profileOf(u.name) };
  db.wall.push(post); db.wall = db.wall.slice(-300); save();
  res.json({ ok: true, post });
});

app.get("/api/wall", (_req, res) => res.json(db.wall.slice(-100).reverse()));

app.post("/api/wall/media", upload.single("file"), (req, res) => {
  const u = userFrom(req);
  if (!u) { removeUploadedFile(req.file); return res.status(401).json({ error: "سجل الدخول" }); }
  if (!canMedia(u)) { removeUploadedFile(req.file); return res.status(403).json({ error: "إرسال الصور والفيديو في الجدار يفتح عند 500 إعجاب" }); }
  if (!req.file) return res.status(400).json({ error: "لم يتم اختيار ملف" });
  if (!/^(image|video)\//.test(req.file.mimetype)) { removeUploadedFile(req.file); return res.status(415).json({ error: "الجدار يسمح بالصور والفيديو فقط" }); }
  const post = {
    id: crypto.randomUUID(), name: u.name, text: String(req.body.text || "").trim().slice(0, 1000),
    time: now(), likes: 0, profile: profileOf(u.name),
    media: { url: `/uploads/${req.file.filename}`, name: req.file.originalname, mime: req.file.mimetype }
  };
  db.wall.push(post); db.wall = db.wall.slice(-300); save(); res.json({ ok: true, post });
});

app.post("/api/media", upload.single("file"), (req, res) => {
  const u = userFrom(req);
  const to = clean(req.body.to);
  if (!u) { removeUploadedFile(req.file); return res.status(401).json({ error: "سجل الدخول" }); }
  if (!canMedia(u)) { removeUploadedFile(req.file); return res.status(403).json({ error: "إرسال الوسائط والاتصال يفتح عند 500 إعجاب" }); }
  if (!to || to === u.name) { removeUploadedFile(req.file); return res.status(400).json({ error: "اختر عضوًا للمحادثة الخاصة" }); }
  const target = sessionTarget(to);
  const pairError = requirePrivateOpen(u, target);
  if (pairError) { removeUploadedFile(req.file); return res.status(403).json({ error: pairError }); }
  if (!req.file) return res.status(400).json({ error: "لم يتم اختيار ملف" });
  if (!/^(image|video|audio)\//.test(req.file.mimetype)) { removeUploadedFile(req.file); return res.status(415).json({ error: "المسموح صور أو فيديو أو صوت فقط" }); }
  const message = { id: crypto.randomUUID(), from: u.name, to, url: `/uploads/${req.file.filename}`, name: req.file.originalname, mime: req.file.mimetype, time: now(), kind: "media" };
  db.privateMessages.push(message);
  db.privateMessages = db.privateMessages.slice(-5000);
  save();
  for (const s of findSocketByName(to)) s.emit("private", message);
  res.json({ ok: true, ...message });
});

app.use("/uploads", express.static(UP));

io.on("connection", socket => {
  socket.on("join", ({ sid, room }) => {
    const u = db.sessions[sid];
    if (!u) return socket.emit("room-denied", { message: "انتهت الجلسة، سجل الدخول من جديد" });
    const target = clean(room) || "الغرفة العامة";
    const rr = roomOf(target);
    if (!rr) return socket.emit("room-denied", { message: "الغرفة غير موجودة" });
    const access = canEnterRoom(u, rr);
    if (access) return socket.emit("room-denied", { message: access });
    const denied = roomDenied(u, target);
    if (denied) return socket.emit("room-denied", { message: denied });
    const occupied = roomPeople(target).filter(x => x !== u).length;
    if (occupied >= rr.capacity && u.room !== target) return socket.emit("room-denied", { message: "الغرفة ممتلئة" });
    const oldRoom = u.room;
    if (oldRoom && oldRoom !== target) {
      socket.leave(oldRoom); u.mic = false; socket.data.room = "";
      emitSystem(oldRoom, `🔵 لقد غادر ${u.name} الغرفة ${oldRoom} وذهب إلى ${target}`);
    }
    u.room = target; socket.data.user = u; socket.data.room = target; socket.join(target); save();
    socket.emit("history", db.messages.filter(m => m.room === target).slice(-100));
    emitSystem(target, `🟢 لقد دخل ${u.name} إلى ${target}`);
    socket.to(target).emit("room-presence", { name: u.name, action: "join" });
  });

  socket.on("leave-room", () => {
    const u = socket.data.user;
    if (!u || !u.room) return;
    const old = u.room; socket.leave(old); u.room = ""; u.mic = false; socket.data.room = "";
    emitSystem(old, `🔵 لقد غادر ${u.name} الغرفة ${old}`); save();
  });

  socket.on("private-open", ({ to }) => {
    const u = socket.data.user;
    const targetName = clean(to);
    if (!u || !targetName || targetName === u.name) return;
    const target = sessionTarget(targetName);
    if (!target) return socket.emit("private-error", { message: "العضو غير متصل" });
    if (!settingsOf(targetName).privateEnabled) return socket.emit("private-error", { message: "هذا المستخدم لقد اغلق الخاص" });
    if (isIgnoringEither(u.name, targetName)) return socket.emit("private-error", { message: "لا يمكن فتح الخاص بسبب التجاهل" });
    u.privateWith = targetName; socket.data.privateWith = targetName;
    const items = db.privateMessages.filter(m => (m.from === u.name && m.to === targetName) || (m.from === targetName && m.to === u.name)).slice(-100);
    socket.emit("private-opened", { to: targetName, messages: items });
  });

  socket.on("private-close", ({ to }) => {
    const u = socket.data.user;
    if (!u) return;
    if (!to || u.privateWith === to) u.privateWith = "";
    socket.data.privateWith = "";
  });

  socket.on("message", ({ text }) => {
    const u = socket.data.user;
    const room = socket.data.room;
    const rr = roomOf(room);
    if (!u || !room || !rr || !text) return;
    if (!roomAllowsText(rr)) return socket.emit("room-error", { message: "هذه الغرفة للمايك فقط" });
    if (roomMuted(u, room)) return socket.emit("room-error", { message: "أنت مكتوم في هذه الغرفة" });
    const message = { room, name: u.name, text: String(text).slice(0, 1000), time: now() };
    db.messages.push(message); db.messages = db.messages.slice(-5000); save(); io.to(room).emit("message", message);
  });

  socket.on("private", ({ to, text }) => {
    const u = socket.data.user;
    const targetName = clean(to);
    if (!u || !targetName || !text) return;
    const target = sessionTarget(targetName);
    const error = requirePrivateOpen(u, target);
    if (error) return socket.emit("private-error", { message: error });
    const message = { id: crypto.randomUUID(), from: u.name, to: targetName, text: String(text).slice(0, 1000), time: now(), kind: "text" };
    u.privateWith = targetName; socket.data.privateWith = targetName;
    db.privateMessages.push(message); db.privateMessages = db.privateMessages.slice(-5000); save();
    for (const s of findSocketByName(targetName)) s.emit("private", message);
    socket.emit("private", message);
  });

  function callAllowed(targetName) {
    const u = socket.data.user;
    const target = sessionTarget(targetName);
    if (!u || !target) return { ok: false, error: "العضو غير متصل" };
    if (!canMedia(u) || !canMedia(target)) return { ok: false, error: "الاتصال يفتح عند 500 إعجاب للطرفين" };
    const error = requirePrivateOpen(u, target);
    if (error) return { ok: false, error };
    return { ok: true, target };
  }

  socket.on("call-offer", d => {
    const to = clean(d?.to); const check = callAllowed(to);
    if (!check.ok) return socket.emit("call-error", { message: check.error });
    for (const s of findSocketByName(to)) s.emit("call-offer", { from: socket.data.user.name, offer: d.offer, video: !!d.video });
  });
  socket.on("call-answer", d => {
    const to = clean(d?.to); const check = callAllowed(to);
    if (!check.ok) return socket.emit("call-error", { message: check.error });
    for (const s of findSocketByName(to)) s.emit("call-answer", { from: socket.data.user.name, answer: d.answer });
  });
  socket.on("ice", d => {
    const to = clean(d?.to); const check = callAllowed(to);
    if (!check.ok) return socket.emit("call-error", { message: check.error });
    for (const s of findSocketByName(to)) s.emit("ice", { from: socket.data.user.name, candidate: d.candidate });
  });

  socket.on("disconnect", () => {
    const u = socket.data.user;
    if (!u) return;
    const sid = Object.keys(db.sessions).find(id => db.sessions[id] === u);
    if (sid) destroySession(sid, true);
  });
});

app.get("/{*splat}", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

server.listen(PORT, () => console.log(`دردشة ريماز عراقية تعمل على http://localhost:${PORT}`));
