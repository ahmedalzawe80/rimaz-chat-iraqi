const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 120 * 1024 * 1024
});

app.use(express.json({ limit: "120mb" }));
app.use(express.urlencoded({ extended: true, limit: "120mb" }));

const PUBLIC = path.join(__dirname, "public");

const DATA_DIR =
  process.env.DATA_DIR ||
  (fs.existsSync("/data") ? "/data" : path.join(__dirname, "data"));

const DATA_FILE = path.join(DATA_DIR, "data.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC));

/* =========================================================
   أدوات عامة
========================================================= */

function uid(prefix = "") {
  return prefix + crypto.randomBytes(12).toString("hex");
}

function now() {
  return Date.now();
}

function cleanName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

function cleanText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function isValidName(name) {
  return !!name && name.length >= 2 && name.length <= 40;
}

function isAdmin(user) {
  return !!user &&
    user.type === "member" &&
    user.name === "admin";
}

function level(likes) {
  likes = Number(likes || 0);

  if (likes >= 500) return 3;
  if (likes >= 400) return 2;
  return 1;
}

function canNotice(user) {
  return isAdmin(user) || Number(user.likes || 0) >= 400;
}

function canMedia(user) {
  return isAdmin(user) || Number(user.likes || 0) >= 500;
}

function safeUser(user) {
  if (!user) return null;

  return {
    sid: user.sid,
    name: user.name,
    type: user.type,
    likes: Number(user.likes || 0),
    level: level(user.likes),
    room: user.room || null,
    mic: !!user.mic,
    online: true
  };
}

/* =========================================================
   قاعدة البيانات
========================================================= */

const defaultRooms = [
  {
    id: "general",
    name: "الغرفة العامة",
    kind: "public",
    capacity: 200,
    mics: 0,
    description: "كتابة فقط",
    owner: "admin",
    locked: false
  },
  {
    id: "public_voice",
    name: "غرفة عامة + مايك",
    kind: "public_voice",
    capacity: 200,
    mics: 8,
    description: "كتابة + مايك",
    owner: "admin",
    locked: false
  },
  {
    id: "voice",
    name: "غرفة المايك",
    kind: "voice",
    capacity: 50,
    mics: 8,
    description: "مايك فقط",
    owner: "admin",
    locked: false
  },
  {
    id: "two",
    name: "غرفة شخصين",
    kind: "private2",
    capacity: 2,
    mics: 0,
    description: "شخصان فقط",
    owner: "admin",
    locked: false
  },
  {
    id: "games",
    name: "غرفة المسابقات",
    kind: "public",
    capacity: 200,
    mics: 0,
    description: "مسابقات ودردشة",
    owner: "admin",
    locked: false
  },
  {
    id: "rimaz",
    name: "غرفة ريماز",
    kind: "public",
    capacity: 200,
    mics: 0,
    description: "غرفة ريماز",
    owner: "admin",
    locked: false
  },
  {
    id: "admin",
    name: "غرفة الإدارة",
    kind: "admin",
    capacity: 50,
    mics: 0,
    description: "للإدارة والمشرفين",
    owner: "admin",
    locked: true
  }
];

const defaultDB = {
  users: [],
  guests: [],
  messages: [],
  wall: [],
  likes: {},
  lastLike: {},
  notifications: [],
  profiles: {},
  sessions: {},
  rooms: defaultRooms,
  roomBans: {},
  roomMutes: {},
  roomKicks: {},
  permissionOverrides: {},
  privateMessages: [],
  settings: {
    siteName: "دردشة ريماز عراقية"
  }
};

let db = defaultDB;

function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw);

      db = {
        ...defaultDB,
        ...parsed
      };

      if (!Array.isArray(db.users)) db.users = [];
      if (!Array.isArray(db.guests)) db.guests = [];
      if (!Array.isArray(db.messages)) db.messages = [];
      if (!Array.isArray(db.wall)) db.wall = [];
      if (!Array.isArray(db.notifications)) db.notifications = [];
      if (!Array.isArray(db.profiles)) db.profiles = {};
      if (!db.sessions || typeof db.sessions !== "object") db.sessions = {};
      if (!db.likes || typeof db.likes !== "object") db.likes = {};
      if (!db.lastLike || typeof db.lastLike !== "object") db.lastLike = {};
      if (!db.rooms || !Array.isArray(db.rooms)) db.rooms = defaultRooms;
      if (!db.roomBans) db.roomBans = {};
      if (!db.roomMutes) db.roomMutes = {};
      if (!db.roomKicks) db.roomKicks = {};
      if (!db.permissionOverrides) db.permissionOverrides = {};
      if (!Array.isArray(db.privateMessages)) db.privateMessages = [];

      /*
       * نضمن وجود الغرف الأساسية.
       * لا نحذف الغرف التي أضافها الأدمن.
       */
      for (const room of defaultRooms) {
        if (!db.rooms.some(r => r.id === room.id)) {
          db.rooms.push({ ...room });
        }
      }
    }
  } catch (err) {
    console.error("خطأ بقراءة قاعدة البيانات:", err);
    db = JSON.parse(JSON.stringify(defaultDB));
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (err) {
    console.error("خطأ بحفظ قاعدة البيانات:", err);
  }
}

loadDB();

/* =========================================================
   المستخدمون والجلسات
========================================================= */

function findMember(name) {
  return db.users.find(
    u => String(u.name).toLowerCase() === String(name).toLowerCase()
  );
}

function getMemberLikes(name) {
  const u = findMember(name);
  return u ? Number(u.likes || 0) : 0;
}

function getUserLikes(session) {
  if (!session) return 0;

  if (session.type === "member") {
    return getMemberLikes(session.name);
  }

  return Number(session.likes || 0);
}

function applyLikesToSession(session) {
  if (!session) return;

  if (session.type === "member") {
    session.likes = getMemberLikes(session.name);
  }
}

function getActiveSessions() {
  return Object.values(db.sessions).filter(
    s => s && s.active !== false
  );
}

function getActiveByName(name) {
  return getActiveSessions().filter(
    s => String(s.name).toLowerCase() === String(name).toLowerCase()
  );
}

function nameInUse(name) {
  return !!findMember(name) || getActiveByName(name).length > 0;
}

function getSession(sid) {
  const s = db.sessions[sid];

  if (!s || s.active === false) return null;

  applyLikesToSession(s);
  return s;
}

function createSession(type, name, likes = 0) {
  const sid = uid("s_");

  const session = {
    sid,
    type,
    name,
    likes: Number(likes || 0),
    room: "general",
    privateWith: null,
    mic: false,
    active: true,

    /*
     * حل مشكلة خروج مستخدم بسبب اتصال آخر:
     * كل جلسة تحتوي sockets مستقلة.
     */
    sockets: {},

    createdAt: now(),
    lastSeen: now()
  };

  db.sessions[sid] = session;
  return session;
}

function destroySession(sid, reason = "leave") {
  const s = db.sessions[sid];
  if (!s) return;

  const room = s.room;

  s.active = false;

  if (s.type === "guest") {
    /*
     * اسم الضيف لا يبقى محجوزاً بعد الخروج.
     */
    db.guests = db.guests.filter(
      g => String(g).toLowerCase() !== String(s.name).toLowerCase()
    );
  }

  if (room) {
    io.to("room:" + room).emit("system", {
      type: "leave",
      name: s.name,
      reason
    });
  }

  delete db.sessions[sid];
  saveDB();
}

function attachSocket(socket, sid) {
  const s = getSession(sid);
  if (!s) return null;

  /*
   * إذا دخل نفس الحساب من متصفح آخر،
   * لا نحذف الجلسة الأولى.
   */
  s.sockets[socket.id] = {
    connectedAt: now()
  };

  socket.data.sid = sid;
  socket.data.sessionSid = sid;

  s.lastSeen = now();

  return s;
}

function detachSocket(socket) {
  const sid = socket.data.sid;
  if (!sid) return;

  const s = db.sessions[sid];
  if (!s) return;

  delete s.sockets[socket.id];

  /*
   * إذا بقي اتصال آخر لنفس الجلسة:
   * لا نخرج المستخدم من الموقع.
   */
  const remaining = Object.keys(s.sockets).length;

  if (remaining > 0) {
    s.lastSeen = now();
    saveDB();
    return;
  }

  destroySession(sid, "disconnect");
}

/* =========================================================
   الملف الشخصي
========================================================= */

function getProfile(name) {
  if (!db.profiles[name]) {
    db.profiles[name] = {
      name,
      avatar: "👤",
      status: "متصل الآن",
      bio: "عضو في دردشة ريماز عراقية",
      nameColor: "#222222",
      bgColor: "#ffffff"
    };
  }

  return db.profiles[name];
}

function publicProfile(name) {
  const active = getActiveByName(name)[0];
  const member = findMember(name);

  const likes = active
    ? getUserLikes(active)
    : member
      ? Number(member.likes || 0)
      : Number(db.likes[name] || 0);

  return {
    ...getProfile(name),
    name,
    likes,
    level: level(likes),
    online: !!active,
    room: active ? active.room : null,
    type: active ? active.type : member ? "member" : "unknown"
  };
}

/* =========================================================
   الصلاحيات
========================================================= */

function overrideFor(name, permission) {
  return !!(
    db.permissionOverrides &&
    db.permissionOverrides[name] &&
    db.permissionOverrides[name][permission]
  );
}

function hasPermission(user, permission) {
  if (!user) return false;

  if (isAdmin(user)) return true;

  if (overrideFor(user.name, permission)) return true;

  switch (permission) {
    case "notice":
      return canNotice(user);

    case "media":
      return canMedia(user);

    case "call":
      return canMedia(user);

    case "camera":
      return canMedia(user);

    default:
      return false;
  }
}

/* =========================================================
   الغرف
========================================================= */

function getRoom(roomId) {
  return db.rooms.find(r => r.id === roomId);
}

function roomUsers(roomId) {
  return getActiveSessions()
    .filter(s => s.room === roomId)
    .map(safeUser);
}

function allOnlineUsers() {
  return getActiveSessions()
    .map(safeUser)
    .sort((a, b) => {
      if (b.likes !== a.likes) return b.likes - a.likes;
      return a.name.localeCompare(b.name, "ar");
    });
}

function isRoomBanned(roomId, name) {
  return Array.isArray(db.roomBans[roomId]) &&
    db.roomBans[roomId].some(
      n => String(n).toLowerCase() === String(name).toLowerCase()
    );
}

function isRoomMuted(roomId, name) {
  return Array.isArray(db.roomMutes[roomId]) &&
    db.roomMutes[roomId].some(
      n => String(n).toLowerCase() === String(name).toLowerCase()
    );
}

function isRoomKicked(roomId, name) {
  return Array.isArray(db.roomKicks[roomId]) &&
    db.roomKicks[roomId].some(
      n => String(n).toLowerCase() === String(name).toLowerCase()
    );
}

function canEnterRoom(user, room) {
  if (!user || !room) {
    return {
      ok: false,
      message: "الغرفة غير موجودة"
    };
  }

  if (room.kind === "admin" && !isAdmin(user)) {
    return {
      ok: false,
      message: "غرفة الإدارة للأدمن فقط"
    };
  }

  if (room.locked && !isAdmin(user)) {
    return {
      ok: false,
      message: "هذه الغرفة مقفلة"
    };
  }

  if (isRoomBanned(room.id, user.name)) {
    return {
      ok: false,
      message: "أنت محظور من هذه الغرفة"
    };
  }

  if (isRoomKicked(room.id, user.name) && !isAdmin(user)) {
    return {
      ok: false,
      message: "تم طردك من هذه الغرفة"
    };
  }

  const count = roomUsers(room.id).length;

  if (
    room.capacity &&
    count >= room.capacity &&
    !roomUsers(room.id).some(x => x.sid === user.sid)
  ) {
    return {
      ok: false,
      message: "الغرفة ممتلئة"
    };
  }

  return { ok: true };
}

function canWriteInRoom(room) {
  if (!room) return false;

  return room.kind !== "voice";
}

function canUseMicInRoom(room) {
  if (!room) return false;

  return room.kind === "voice" ||
    room.kind === "public_voice";
}

/* =========================================================
   رسائل الغرف
========================================================= */

function roomMessage(roomId, user, text, extra = {}) {
  const message = {
    id: uid("m_"),
    room: roomId,
    name: user.name,
    type: user.type,
    text,
    likes: getUserLikes(user),
    level: level(getUserLikes(user)),
    createdAt: now(),
    ...extra
  };

  db.messages.push(message);

  if (db.messages.length > 5000) {
    db.messages.splice(0, db.messages.length - 5000);
  }

  saveDB();

  io.to("room:" + roomId).emit("message", message);

  return message;
}

/* =========================================================
   التنبيهات
========================================================= */

function addNotification(toName, fromName, text) {
  const item = {
    id: uid("n_"),
    to: toName,
    from: fromName,
    text,
    read: false,
    createdAt: now()
  };

  db.notifications.push(item);

  if (db.notifications.length > 10000) {
    db.notifications.splice(0, db.notifications.length - 10000);
  }

  saveDB();

  for (const s of getActiveSessions()) {
    if (s.name === toName) {
      io.to("session:" + s.sid).emit("notification", item);
    }
  }

  return item;
}

/* =========================================================
   رفع الملفات
========================================================= */

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },

  filename: function(req, file, cb) {
    const ext = path.extname(file.originalname || "");
    cb(null, uid("file_") + ext);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

/* =========================================================
   API أساسي
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    site: "دردشة ريماز عراقية",
    time: now()
  });
});

app.get("/api/rooms", (req, res) => {
  res.json(
    db.rooms.map(room => ({
      ...room,
      online: roomUsers(room.id).length
    }))
  );
});

app.get("/api/members", (req, res) => {
  res.json(allOnlineUsers());
});

app.get("/api/online", (req, res) => {
  res.json(allOnlineUsers());
});

app.get("/api/profile/:name", (req, res) => {
  res.json(publicProfile(cleanName(req.params.name)));
});

app.get("/api/notifications/:name", (req, res) => {
  const name = cleanName(req.params.name);

  const items = db.notifications
    .filter(n => n.to === name)
    .slice(-100);

  res.json(items);
});

/* =========================================================
   تسجيل حساب جديد
========================================================= */

app.post("/api/register", async (req, res) => {
  try {
    const name = cleanName(req.body.name);
    const password = String(req.body.password || "");

    if (!isValidName(name)) {
      return res.status(400).json({
        ok: false,
        message: "الاسم يجب أن يكون بين حرفين و40 حرفاً"
      });
    }

    if (password.length < 4) {
      return res.status(400).json({
        ok: false,
        message: "كلمة المرور يجب أن تكون 4 أحرف أو أكثر"
      });
    }

    if (findMember(name)) {
      return res.status(400).json({
        ok: false,
        message: "هذا الاسم مسجل مسبقاً"
      });
    }

    if (getActiveByName(name).length) {
      return res.status(400).json({
        ok: false,
        message: "هذا الاسم مستخدم حالياً"
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = {
      id: uid("u_"),
      name,
      password: hash,
      likes: 0,
      createdAt: now()
    };

    db.users.push(user);
    getProfile(name);
    saveDB();

    res.json({
      ok: true,
      message: "تم إنشاء الحساب"
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      ok: false,
      message: "حدث خطأ أثناء إنشاء الحساب"
    });
  }
});

/* =========================================================
   دخول عضو
========================================================= */

app.post("/api/login", async (req, res) => {
  try {
    const name = cleanName(req.body.name);
    const password = String(req.body.password || "");

    const user = findMember(name);

    if (!user) {
      return res.status(401).json({
        ok: false,
        message: "اسم المستخدم أو كلمة المرور غير صحيحة"
      });
    }

    const correct = await bcrypt.compare(password, user.password);

    if (!correct) {
      return res.status(401).json({
        ok: false,
        message: "اسم المستخدم أو كلمة المرور غير صحيحة"
      });
    }

    /*
     * مهم:
     * لا نطرد جلسة أخرى لنفس الحساب.
     * يسمح للحساب بالعمل في أكثر من متصفح.
     */
    const session = createSession(
      "member",
      user.name,
      Number(user.likes || 0)
    );

    res.json({
      ok: true,
      sid: session.sid,
      user: safeUser(session)
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      ok: false,
      message: "حدث خطأ أثناء الدخول"
    });
  }
});

/* =========================================================
   دخول زائر
========================================================= */

app.post("/api/guest", (req, res) => {
  const name = cleanName(req.body.name);

  if (!isValidName(name)) {
    return res.status(400).json({
      ok: false,
      message: "اكتب اسم الزائر"
    });
  }

  /*
   * الزائر لا يستطيع استعمال اسم عضو.
   */
  if (findMember(name)) {
    return res.status(400).json({
      ok: false,
      message: "هذا الاسم تابع لعضو مسجل"
    });
  }

  /*
   * الزائر يجب أن يكون فريداً بين الجلسات الفعلية.
   */
  if (getActiveByName(name).length) {
    return res.status(400).json({
      ok: false,
      message: "اسم الزائر مستخدم حالياً"
    });
  }

  const session = createSession("guest", name, 0);

  if (!db.guests.includes(name)) {
    db.guests.push(name);
  }

  saveDB();

  res.json({
    ok: true,
    sid: session.sid,
    user: safeUser(session)
  });
});

/* =========================================================
   جلسة
========================================================= */

app.get("/api/session/:sid", (req, res) => {
  const user = getSession(req.params.sid);

  if (!user) {
    return res.status(401).json({
      ok: false,
      message: "الجلسة غير موجودة"
    });
  }

  res.json({
    ok: true,
    user: safeUser(user)
  });
});

/* =========================================================
   خروج كامل
========================================================= */

app.post("/api/logout", (req, res) => {
  const sid = req.body.sid;
  const user = getSession(sid);

  if (!user) {
    return res.json({ ok: true });
  }

  for (const socketId of Object.keys(user.sockets || {})) {
    const socket = io.sockets.sockets.get(socketId);

    if (socket) {
      socket.disconnect(true);
    }
  }

  destroySession(sid, "logout");

  res.json({
    ok: true
  });
});

/* =========================================================
   دخول غرفة
========================================================= */

app.post("/api/join-room", (req, res) => {
  const sid = String(req.body.sid || "");
  const roomId = String(req.body.roomId || "");

  const user = getSession(sid);
  const room = getRoom(roomId);

  if (!user) {
    return res.status(401).json({
      ok: false,
      message: "الجلسة غير موجودة"
    });
  }

  const check = canEnterRoom(user, room);

  if (!check.ok) {
    return res.status(403).json(check);
  }

  user.room = roomId;
  user.lastSeen = now();

  saveDB();

  res.json({
    ok: true,
    room,
    user: safeUser(user)
  });
});

/* =========================================================
   الخروج من الغرفة فقط
========================================================= */

app.post("/api/leave-room", (req, res) => {
  const sid = String(req.body.sid || "");
  const user = getSession(sid);

  if (!user) {
    return res.status(401).json({
      ok: false,
      message: "الجلسة غير موجودة"
    });
  }

  const oldRoom = user.room;

  user.room = null;
  user.mic = false;

  saveDB();

  io.to("room:" + oldRoom).emit("system", {
    type: "leave-room",
    name: user.name
  });

  res.json({
    ok: true,
    message: "خرجت من الغرفة فقط"
  });
});

/* =========================================================
   رسائل
========================================================= */

app.post("/api/message", (req, res) => {
  const sid = String(req.body.sid || "");
  const text = cleanText(req.body.text);

  const user = getSession(sid);

  if (!user) {
    return res.status(401).json({
      ok: false,
      message: "الجلسة غير موجودة"
    });
  }

  if (!text) {
    return res.status(400).json({
      ok: false,
      message: "اكتب رسالة"
    });
  }

  const room = getRoom(user.room);

  if (!room) {
    return res.status(400).json({
      ok: false,
      message: "أنت غير موجود في غرفة"
    });
  }

  if (!canWriteInRoom(room)) {
    return res.status(403).json({
      ok: false,
      message: "هذه الغرفة للمايك فقط"
    });
  }

  if (isRoomMuted(room.id, user.name) && !isAdmin(user)) {
    return res.status(403).json({
      ok: false,
      message: "أنت مكتوم في هذه الغرفة"
    });
  }

  const message = roomMessage(room.id, user, text);

  res.json({
    ok: true,
    message
  });
});

/* =========================================================
   تاريخ رسائل الغرفة
========================================================= */

app.get("/api/messages/:room", (req, res) => {
  const room = req.params.room;

  res.json(
    db.messages
      .filter(m => m.room === room)
      .slice(-100)
  );
});

/* =========================================================
   اللايك
========================================================= */

app.post("/api/like", (req, res) => {
  const sid = String(req.body.sid || "");
  const targetName = cleanName(req.body.target);

  const sender = getSession(sid);

  if (!sender) {
    return res.status(401).json({
      ok: false,
      message: "الجلسة غير موجودة"
    });
  }

  if (!targetName) {
    return res.status(400).json({
      ok: false,
      message: "المستلم غير موجود"
    });
  }

  if (sender.name === targetName) {
    return res.status(400).json({
      ok: false,
      message: "لا يمكنك إرسال لايك لنفسك"
    });
  }

  const target = getActiveByName(targetName)[0];

  if (!target) {
    return res.status(404).json({
      ok: false,
      message: "المستخدم غير موجود حالياً"
    });
  }

  const last = Number(db.lastLike[sender.sid] || 0);

  if (!isAdmin(sender) && now() - last < 10000) {
    const remaining = Math.ceil(
      (10000 - (now() - last)) / 1000
    );

    return res.status(429).json({
      ok: false,
      message: `انتظر ${remaining} ثواني قبل اللايك التالي`,
      remaining
    });
  }

  db.lastLike[sender.sid] = now();

  if (target.type === "member") {
    const member = findMember(target.name);

    if (member) {
      member.likes = Number(member.likes || 0) + 1;
      target.likes = member.likes;
    }
  } else {
    target.likes = Number(target.likes || 0) + 1;
  }

  db.likes[target.name] = target.likes;

  const recipientLevel = level(target.likes);

  addNotification(
    target.name,
    sender.name,
    `لقد وصلك لايك من ${sender.name}`
  );

  saveDB();

  io.emit("likeUpdate", {
    name: target.name,
    likes: target.likes,
    level: recipientLevel,
    canNotice: target.likes >= 400 || isAdmin(target),
    canMedia: target.likes >= 500 || isAdmin(target)
  });

  res.json({
    ok: true,
    name: target.name,
    likes: target.likes,
    level: recipientLevel,
    canNotice: target.likes >= 400 || isAdmin(target),
    canMedia: target.likes >= 500 || isAdmin(target)
  });
});

/* =========================================================
   معلومات الصلاحيات
========================================================= */

app.get("/api/permissions/:sid", (req, res) => {
  const user = getSession(req.params.sid);

  if (!user) {
    return res.status(401).json({
      ok: false
    });
  }

  const likes = getUserLikes(user);

  res.json({
    ok: true,
    likes,
    level: level(likes),
    to400: Math.max(0, 400 - likes),
    to500: Math.max(0, 500 - likes),
    notifications: hasPermission(user, "notice"),
    media: hasPermission(user, "media"),
    calls: hasPermission(user, "call"),
    camera: hasPermission(user, "camera")
  });
});

/* =========================================================
   الحائط
========================================================= */

app.get("/api/wall", (req, res) => {
  res.json(db.wall.slice(-200));
});

app.post("/api/wall", (req, res) => {
  const sid = String(req.body.sid || "");
  const text = cleanText(req.body.text);

  const user = getSession(sid);

  if (!user) {
    return res.status(401).json({
      ok: false,
      message: "الجلسة غير موجودة"
    });
  }

  if (!text && !req.body.mediaUrl) {
    return res.status(400).json({
      ok: false,
      message: "اكتب شيئاً أو أرسل وسائط"
    });
  }

  const post = {
    id: uid("w_"),
    name: user.name,
    type: user.type,
    text,
    mediaUrl: req.body.mediaUrl || null,
    mediaType: req.body.mediaType || null,
    likes: getUserLikes(user),
    level: level(getUserLikes(user)),
    createdAt: now()
  };

  db.wall.push(post);

  if (db.wall.length > 2000) {
    db.wall.splice(0, db.wall.length - 2000);
  }

  saveDB();

  io.emit("wallPost", post);

  res.json({
    ok: true,
    post
  });
});

/* =========================================================
   رفع صورة / فيديو للحائط
========================================================= */

app.post("/api/wall/upload", upload.single("file"), (req, res) => {
  const sid = String(req.body.sid || "");
  const user = getSession(sid);

  if (!user) {
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }

    return res.status(401).json({
      ok: false,
      message: "الجلسة غير موجودة"
    });
  }

  if (!req.file) {
    return res.status(400).json({
      ok: false,
      message: "لم يتم اختيار ملف"
    });
  }

  const mime = req.file.mimetype || "";

  if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}

    return res.status(400).json({
      ok: false,
      message: "الحائط يسمح بالصور والفيديو فقط"
    });
  }

  const mediaType = mime.startsWith("image/")
    ? "image"
    : "video";

  res.json({
    ok: true,
    url: "/uploads/" + path.basename(req.file.path),
    mediaType
  });
});

/* =========================================================
   الخاص
========================================================= */

app.get("/api/private/:sid/:name", (req, res) => {
  const user = getSession(req.params.sid);

  if (!user) {
    return res.status(401).json({
      ok: false
    });
  }

  const targetName = cleanName(req.params.name);

  const messages = db.privateMessages
    .filter(m =>
      (m.from === user.name && m.to === targetName) ||
      (m.from === targetName && m.to === user.name)
    )
    .slice(-200);

  res.json({
    ok: true,
    target: publicProfile(targetName),
    messages
  });
});

app.post("/api/private/message", (req, res) => {
  const sid = String(req.body.sid || "");
  const to = cleanName(req.body.to);
  const text = cleanText(req.body.text);

  const user = getSession(sid);

  if (!user) {
    return res.status(401).json({
      ok: false,
      message: "الجلسة غير موجودة"
    });
  }

  if (!to || !text) {
    return res.status(400).json({
      ok: false,
      message: "الرسالة غير مكتملة"
    });
  }

  const target = getActiveByName(to)[0];

  if (!target) {
    return res.status(404).json({
      ok: false,
      message: "الشخص غير متواجد حالياً"
    });
  }

  const message = {
    id: uid("pm_"),
    from: user.name,
    to,
    text,
    createdAt: now()
  };

  db.privateMessages.push(message);

  if (db.privateMessages.length > 10000) {
    db.privateMessages.splice(
      0,
      db.privateMessages.length - 10000
    );
  }

  saveDB();

  for (const s of getActiveSessions()) {
    if (s.name === user.name || s.name === to) {
      io.to("session:" + s.sid).emit(
        "privateMessage",
        message
      );
    }
  }

  res.json({
    ok: true,
    message
  });
});

/* =========================================================
   رفع وسائط الخاص
========================================================= */

app.post("/api/private/upload", upload.single("file"), (req, res) => {
  const sid = String(req.body.sid || "");
  const to = cleanName(req.body.to);

  const user = getSession(sid);

  if (!user) {
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }

    return res.status(401).json({
      ok: false,
      message: "الجلسة غير موجودة"
    });
  }

  if (!hasPermission(user, "media")) {
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }

    return res.status(403).json({
      ok: false,
      message: "الصور والفيديو يفتحان عند 500 إعجاب"
    });
  }

  if (!to) {
    return res.status(400).json({
      ok: false,
      message: "حدد الشخص أولاً"
    });
  }

  if (!req.file) {
    return res.status(400).json({
      ok: false,
      message: "لم يتم اختيار ملف"
    });
  }

  const mime = req.file.mimetype || "";

  if (
    !mime.startsWith("image/") &&
    !mime.startsWith("video/")
  ) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}

    return res.status(400).json({
      ok: false,
      message: "المسموح صورة أو فيديو"
    });
  }

  res.json({
    ok: true,
    url: "/uploads/" + path.basename(req.file.path),
    mediaType: mime.startsWith("image/")
      ? "image"
      : "video"
  });
});

/* =========================================================
   إرسال وسائط الخاص
========================================================= */

app.post("/api/private/media-message", (req, res) => {
  const sid = String(req.body.sid || "");
  const to = cleanName(req.body.to);

  const user = getSession(sid);

  if (!user) {
    return res.status(401).json({
      ok: false
    });
  }

  if (!hasPermission(user, "media")) {
    return res.status(403).json({
      ok: false,
      message: "هذه الخاصية تفتح عند 500 إعجاب"
    });
  }

  const message = {
    id: uid("pm_"),
    from: user.name,
    to,
    text: "",
    mediaUrl: req.body.mediaUrl,
    mediaType: req.body.mediaType,
    createdAt: now()
  };

  db.privateMessages.push(message);
  saveDB();

  for (const s of getActiveSessions()) {
    if (s.name === user.name || s.name === to) {
      io.to("session:" + s.sid).emit(
        "privateMessage",
        message
      );
    }
  }

  res.json({
    ok: true,
    message
  });
});

/* =========================================================
   الإدارة
========================================================= */

function requireAdmin(req, res) {
  const sid = String(
    req.body.sid ||
    req.query.sid ||
    req.headers["x-session"] ||
    ""
  );

  const user = getSession(sid);

  if (!isAdmin(user)) {
    res.status(403).json({
      ok: false,
      message: "صلاحية الأدمن مطلوبة"
    });

    return null;
  }

  return user;
}

app.get("/api/admin/users", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const users = db.users.map(u => {
    const active = getActiveByName(u.name)[0];

    return {
      id: u.id,
      name: u.name,
      likes: Number(u.likes || 0),
      level: level(u.likes),
      online: !!active,
      room: active ? active.room : null,
      createdAt: u.createdAt
    };
  });

  const guests = getActiveSessions()
    .filter(s => s.type === "guest")
    .map(safeUser);

  res.json({
    ok: true,
    users,
    guests
  });
});

/* =========================================================
   منح لايك من الأدمن
========================================================= */

app.post("/api/admin/grant-like", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const targetName = cleanName(req.body.target);
  let amount = Number(req.body.amount || 1);

  amount = Math.max(1, Math.min(10000, Math.floor(amount)));

  const member = findMember(targetName);
  const active = getActiveByName(targetName)[0];

  if (!member && !active) {
    return res.status(404).json({
      ok: false,
      message: "المستخدم غير موجود"
    });
  }

  if (member) {
    member.likes = Number(member.likes || 0) + amount;
  }

  if (active && active.type === "guest") {
    active.likes = Number(active.likes || 0) + amount;
  }

  const likes = member
    ? Number(member.likes || 0)
    : Number(active.likes || 0);

  db.likes[targetName] = likes;

  saveDB();

  io.emit("likeUpdate", {
    name: targetName,
    likes,
    level: level(likes),
    canNotice: true,
    canMedia: true
  });

  res.json({
    ok: true,
    name: targetName,
    likes,
    level: level(likes)
  });
});

/* =========================================================
   إدارة الغرف
========================================================= */

app.post("/api/admin/rooms/create", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const name = cleanName(req.body.name);

  if (!name) {
    return res.status(400).json({
      ok: false,
      message: "اسم الغرفة مطلوب"
    });
  }

  if (db.rooms.some(r => r.name === name)) {
    return res.status(400).json({
      ok: false,
      message: "الغرفة موجودة مسبقاً"
    });
  }

  const room = {
    id: uid("room_"),
    name,
    kind: req.body.kind || "public",
    capacity: Number(req.body.capacity || 100),
    mics: Number(req.body.mics || 0),
    description: cleanText(req.body.description, 300),
    owner: "admin",
    locked: false
  };

  db.rooms.push(room);
  saveDB();

  io.emit("roomsUpdate", db.rooms);

  res.json({
    ok: true,
    room
  });
});

app.post("/api/admin/rooms/update", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const room = getRoom(String(req.body.roomId || ""));

  if (!room) {
    return res.status(404).json({
      ok: false,
      message: "الغرفة غير موجودة"
    });
  }

  if (req.body.name !== undefined) {
    room.name = cleanName(req.body.name);
  }

  if (req.body.capacity !== undefined) {
    room.capacity = Math.max(
      1,
      Number(req.body.capacity)
    );
  }

  if (req.body.mics !== undefined) {
    room.mics = Math.max(
      0,
      Number(req.body.mics)
    );
  }

  if (req.body.description !== undefined) {
    room.description = cleanText(
      req.body.description,
      300
    );
  }

  if (req.body.locked !== undefined) {
    room.locked = !!req.body.locked;
  }

  if (req.body.kind !== undefined) {
    room.kind = String(req.body.kind);
  }

  saveDB();
  io.emit("roomsUpdate", db.rooms);

  res.json({
    ok: true,
    room
  });
});

app.post("/api/admin/rooms/delete", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const roomId = String(req.body.roomId || "");

  if (
    [
      "general",
      "public_voice",
      "voice",
      "two",
      "games",
      "rimaz",
      "admin"
    ].includes(roomId)
  ) {
    return res.status(400).json({
      ok: false,
      message: "لا يمكن حذف الغرف الأساسية"
    });
  }

  const index = db.rooms.findIndex(
    r => r.id === roomId
  );

  if (index < 0) {
    return res.status(404).json({
      ok: false,
      message: "الغرفة غير موجودة"
    });
  }

  db.rooms.splice(index, 1);
  saveDB();

  io.emit("roomsUpdate", db.rooms);

  res.json({
    ok: true
  });
});

/* =========================================================
   طرد / كتم / حظر
========================================================= */

function ensureRoomList(store, roomId) {
  if (!Array.isArray(store[roomId])) {
    store[roomId] = [];
  }

  return store[roomId];
}

app.post("/api/admin/room/kick", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const roomId = String(req.body.roomId || "");
  const name = cleanName(req.body.name);

  const room = getRoom(roomId);

  if (!room) {
    return res.status(404).json({
      ok: false,
      message: "الغرفة غير موجودة"
    });
  }

  const list = ensureRoomList(
    db.roomKicks,
    roomId
  );

  if (!list.includes(name)) {
    list.push(name);
  }

  for (const s of getActiveSessions()) {
    if (
      s.name === name &&
      s.room === roomId &&
      !isAdmin(s)
    ) {
      s.room = null;
      s.mic = false;
    }
  }

  saveDB();

  io.to("room:" + roomId).emit("roomControl", {
    type: "kick",
    name
  });

  res.json({
    ok: true
  });
});

app.post("/api/admin/room/mute", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const roomId = String(req.body.roomId || "");
  const name = cleanName(req.body.name);

  const list = ensureRoomList(
    db.roomMutes,
    roomId
  );

  if (!list.includes(name)) {
    list.push(name);
  }

  saveDB();

  io.to("room:" + roomId).emit("roomControl", {
    type: "mute",
    name
  });

  res.json({
    ok: true
  });
});

app.post("/api/admin/room/unmute", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const roomId = String(req.body.roomId || "");
  const name = cleanName(req.body.name);

  const list = ensureRoomList(
    db.roomMutes,
    roomId
  );

  db.roomMutes[roomId] =
    list.filter(n => n !== name);

  saveDB();

  res.json({
    ok: true
  });
});

app.post("/api/admin/room/ban", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const roomId = String(req.body.roomId || "");
  const name = cleanName(req.body.name);

  const list = ensureRoomList(
    db.roomBans,
    roomId
  );

  if (!list.includes(name)) {
    list.push(name);
  }

  for (const s of getActiveSessions()) {
    if (
      s.name === name &&
      s.room === roomId &&
      !isAdmin(s)
    ) {
      s.room = null;
      s.mic = false;
    }
  }

  saveDB();

  io.to("room:" + roomId).emit("roomControl", {
    type: "ban",
    name
  });

  res.json({
    ok: true
  });
});

app.post("/api/admin/room/unban", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const roomId = String(req.body.roomId || "");
  const name = cleanName(req.body.name);

  const list = ensureRoomList(
    db.roomBans,
    roomId
  );

  db.roomBans[roomId] =
    list.filter(n => n !== name);

  saveDB();

  res.json({
    ok: true
  });
});

/* =========================================================
   صلاحيات الأدمن
========================================================= */

app.post("/api/admin/permission", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const name = cleanName(req.body.name);
  const permission = String(req.body.permission || "");
  const enabled = !!req.body.enabled;

  const allowed = [
    "notice",
    "media",
    "call",
    "camera"
  ];

  if (!allowed.includes(permission)) {
    return res.status(400).json({
      ok: false,
      message: "صلاحية غير معروفة"
    });
  }

  if (!db.permissionOverrides[name]) {
    db.permissionOverrides[name] = {};
  }

  db.permissionOverrides[name][permission] =
    enabled;

  saveDB();

  res.json({
    ok: true,
    name,
    permission,
    enabled
  });
});

/* =========================================================
   تحكم الاتصال
========================================================= */

app.post("/api/private/call-check", (req, res) => {
  const sid = String(req.body.sid || "");
  const targetName = cleanName(req.body.target);
  const kind = String(req.body.kind || "voice");

  const user = getSession(sid);

  if (!user) {
    return res.status(401).json({
      ok: false,
      message: "الجلسة غير موجودة"
    });
  }

  /*
   * الاتصال لا يسمح إلا بالخاص.
   * نترك التحقق النهائي أيضاً للواجهة/socket.
   */
  if (!hasPermission(user, kind === "camera" ? "camera" : "call")) {
    return res.status(403).json({
      ok: false,
      message: "الاتصال يفتح عند 500 إعجاب"
    });
  }

  if (!targetName) {
    return res.status(400).json({
      ok: false,
      message: "حدد الشخص"
    });
  }

  const target = getActiveByName(targetName)[0];

  if (!target) {
    return res.status(404).json({
      ok: false,
      message: "الشخص غير متواجد"
    });
  }

  res.json({
    ok: true,
    allowed: true
  });
});

/* =========================================================
   Socket.IO
========================================================= */

io.on("connection", socket => {

  socket.on("auth", ({ sid }) => {
    try {
      const user = attachSocket(socket, sid);

      if (!user) {
        socket.emit("authError", {
          message: "الجلسة غير موجودة"
        });

        return;
      }

      /*
       * قناة خاصة بكل جلسة.
       * إذا كان نفس الحساب مفتوحاً بأكثر من متصفح
       * كل الاتصالات تستقبل إشعاراته بدون طرد بعضها.
       */
      socket.join("session:" + user.sid);

      socket.emit("authenticated", {
        user: safeUser(user),
        rooms: db.rooms,
        online: allOnlineUsers()
      });

    } catch (err) {
      console.error("socket auth:", err);
    }
  });

  /* -------------------------------------------------------
     دخول غرفة
  ------------------------------------------------------- */

  socket.on("join", ({ sid, roomId }) => {
    try {
      const user = getSession(sid);

      if (!user) {
        socket.emit("errorMessage", {
          message: "الجلسة غير موجودة"
        });

        return;
      }

      const room = getRoom(roomId);

      const check = canEnterRoom(user, room);

      if (!check.ok) {
        socket.emit("errorMessage", check);
        return;
      }

      const oldRoom = user.room;

      if (oldRoom && oldRoom !== roomId) {
        socket.leave("room:" + oldRoom);

        /*
         * فقط إذا كانت هذه الجلسة فعلاً هي التي تغيرت.
         */
        io.to("room:" + oldRoom).emit("system", {
          type: "leave",
          name: user.name
        });
      }

      user.room = roomId;
      user.mic = false;
      user.lastSeen = now();

      socket.join("room:" + roomId);

      saveDB();

      socket.emit("joined", {
        room,
        users: roomUsers(roomId)
      });

      io.to("room:" + roomId).emit("system", {
        type: "join",
        name: user.name
      });

      io.emit("onlineUpdate", allOnlineUsers());

    } catch (err) {
      console.error("join:", err);
    }
  });

  /* -------------------------------------------------------
     رسالة غرفة
  ------------------------------------------------------- */

  socket.on("message", data => {
    try {
      const user = getSession(data.sid);

      if (!user) return;

      const room = getRoom(user.room);

      if (!room) return;

      if (!canWriteInRoom(room)) {
        socket.emit("errorMessage", {
          message: "هذه الغرفة للمايك فقط"
        });

        return;
      }

      if (isRoomMuted(room.id, user.name) && !isAdmin(user)) {
        socket.emit("errorMessage", {
          message: "أنت مكتوم في هذه الغرفة"
        });

        return;
      }

      const text = cleanText(data.text);

      if (!text) return;

      roomMessage(room.id, user, text);

    } catch (err) {
      console.error("message:", err);
    }
  });

  /* -------------------------------------------------------
     خاص
  ------------------------------------------------------- */

  socket.on("openPrivate", ({ sid, target }) => {
    const user = getSession(sid);

    if (!user) return;

    const targetName = cleanName(target);

    if (!targetName) return;

    const active = getActiveByName(targetName)[0];

    if (!active) {
      socket.emit("errorMessage", {
        message: "الشخص غير متواجد حالياً"
      });

      return;
    }

    user.privateWith = targetName;

    socket.emit("privateOpened", {
      target: publicProfile(targetName)
    });
  });

  socket.on("closePrivate", ({ sid }) => {
    const user = getSession(sid);

    if (!user) return;

    user.privateWith = null;

    socket.emit("privateClosed");
  });

  socket.on("privateMessage", data => {
    try {
      const user = getSession(data.sid);

      if (!user) return;

      const to = cleanName(data.to);
      const text = cleanText(data.text);

      if (!to || !text) return;

      const target = getActiveByName(to)[0];

      if (!target) {
        socket.emit("errorMessage", {
          message: "الشخص غير متواجد حالياً"
        });

        return;
      }

      const message = {
        id: uid("pm_"),
        from: user.name,
        to,
        text,
        createdAt: now()
      };

      db.privateMessages.push(message);
      saveDB();

      for (const s of getActiveSessions()) {
        if (s.name === user.name || s.name === to) {
          io.to("session:" + s.sid).emit(
            "privateMessage",
            message
          );
        }
      }

    } catch (err) {
      console.error("private:", err);
    }
  });

  /* -------------------------------------------------------
     المايك
  ------------------------------------------------------- */

  socket.on("mic", ({ sid, enabled }) => {
    const user = getSession(sid);

    if (!user) return;

    const room = getRoom(user.room);

    if (!room) return;

    if (!canUseMicInRoom(room) && !isAdmin(user)) {
      socket.emit("errorMessage", {
        message: "المايك غير متاح في هذه الغرفة"
      });

      return;
    }

    if (isRoomMuted(room.id, user.name) && !isAdmin(user)) {
      socket.emit("errorMessage", {
        message: "أنت مكتوم"
      });

      return;
    }

    user.mic = !!enabled;

    io.to("room:" + room.id).emit("micUpdate", {
      name: user.name,
      enabled: user.mic
    });

    saveDB();
  });

  /* -------------------------------------------------------
     طلب اتصال
  ------------------------------------------------------- */

  socket.on("callRequest", ({ sid, target, kind }) => {
    const user = getSession(sid);

    if (!user) return;

    const targetName = cleanName(target);
    const targetUser = getActiveByName(targetName)[0];

    if (!targetUser) {
      socket.emit("errorMessage", {
        message: "الشخص غير متواجد"
      });

      return;
    }

    const permission =
      kind === "camera" ? "camera" : "call";

    if (!hasPermission(user, permission)) {
      socket.emit("errorMessage", {
        message: "الاتصال يفتح عند 500 إعجاب"
      });

      return;
    }

    /*
     * الاتصال خاص فقط.
     */
    socket.emit("callAllowed", {
      target: targetName,
      kind
    });

    io.to("session:" + targetUser.sid).emit(
      "incomingCall",
      {
        from: user.name,
        kind
      }
    );
  });

  /* -------------------------------------------------------
     إنهاء الاتصال
  ------------------------------------------------------- */

  socket.on("callEnd", ({ sid, target }) => {
    const user = getSession(sid);

    if (!user) return;

    const targetUser =
      getActiveByName(cleanName(target))[0];

    if (targetUser) {
      io.to("session:" + targetUser.sid).emit(
        "callEnded",
        {
          from: user.name
        }
      );
    }
  });

  /* -------------------------------------------------------
     تحديث الحائط
  ------------------------------------------------------- */

  socket.on("wallRefresh", () => {
    socket.emit("wallData", db.wall.slice(-200));
  });

  /* -------------------------------------------------------
     خروج من الغرفة فقط
  ------------------------------------------------------- */

  socket.on("leaveRoomOnly", ({ sid }) => {
    const user = getSession(sid);

    if (!user) return;

    const oldRoom = user.room;

    if (oldRoom) {
      socket.leave("room:" + oldRoom);

      io.to("room:" + oldRoom).emit("system", {
        type: "leave-room",
        name: user.name
      });
    }

    user.room = null;
    user.mic = false;

    saveDB();

    io.emit("onlineUpdate", allOnlineUsers());

    socket.emit("leftRoomOnly");
  });

  /* -------------------------------------------------------
     طلب الموجودين
  ------------------------------------------------------- */

  socket.on("getOnline", ({ sid }) => {
    const user = getSession(sid);

    if (!user) return;

    socket.emit("onlineData", {
      currentRoom: user.room,
      currentRoomUsers: user.room
        ? roomUsers(user.room)
        : [],
      allUsers: allOnlineUsers()
    });
  });

  /* -------------------------------------------------------
     طلب الملف الشخصي
  ------------------------------------------------------- */

  socket.on("getProfile", ({ sid, name }) => {
    const user = getSession(sid);

    if (!user) return;

    socket.emit(
      "profileData",
      publicProfile(cleanName(name))
    );
  });

  /* -------------------------------------------------------
     disconnect
  ------------------------------------------------------- */

  socket.on("disconnect", () => {
    /*
     * مهم جداً:
     * لا نحذف الحساب أو الجلسة مباشرة.
     * نفصل هذا الـsocket فقط.
     *
     * إذا كان نفس المستخدم فاتحاً من متصفح آخر،
     * تبقى الجلسة موجودة ولا يخرج المستخدم الآخر.
     */
    detachSocket(socket);

    io.emit("onlineUpdate", allOnlineUsers());
  });
});

/* =========================================================
   تنظيف الاتصالات القديمة
========================================================= */

setInterval(() => {
  const cutoff = now() - 1000 * 60 * 60 * 24;

  for (const [sid, session] of Object.entries(db.sessions)) {
    if (!session) {
      delete db.sessions[sid];
      continue;
    }

    /*
     * جلسة بدون أي socket لمدة 24 ساعة
     * تعتبر منتهية.
     */
    const sockets = session.sockets || {};
    const count = Object.keys(sockets).length;

    if (
      count === 0 &&
      Number(session.lastSeen || 0) < cutoff
    ) {
      destroySession(sid, "expired");
    }
  }
}, 60 * 60 * 1000);

/* =========================================================
   الصفحة الرئيسية
========================================================= */

app.get("*", (req, res) => {
  const index = path.join(PUBLIC, "index.html");

  if (fs.existsSync(index)) {
    return res.sendFile(index);
  }

  res.status(404).send("index.html غير موجود");
});

/* =========================================================
   تشغيل السيرفر
========================================================= */

const PORT = Number(process.env.PORT || 3000);

server.listen(PORT, "0.0.0.0", () => {
  console.log("====================================");
  console.log("دردشة ريماز عراقية");
  console.log("Server running on port:", PORT);
  console.log("Data directory:", DATA_DIR);
  console.log("Upload directory:", UPLOAD_DIR);
  console.log("====================================");
});
