const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Server } = require('socket.io');

// Initialize the Express application and its HTTP/Socket.IO servers before
// registering middleware, routes, or socket handlers below.
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// All supplied smiley images are bundled into one JSON asset file.
// The browser still uses normal /smileys/<file> URLs, served from this packed asset.
const SMILEY_PACK_FILE = path.join(__dirname, 'public', 'smileys-pack.json');
let SMILEY_PACK = {};
try { SMILEY_PACK = JSON.parse(fs.readFileSync(SMILEY_PACK_FILE, 'utf8')); }
catch (error) { console.error('Could not load bundled smiley pack:', error.message); }
// All built-in animated gifts are bundled in one JSON asset, like the smiley pack.
const GIFT_PACK_FILE = path.join(__dirname, 'public', 'gifts-pack.json');
let GIFT_PACK = {};
try { GIFT_PACK = JSON.parse(fs.readFileSync(GIFT_PACK_FILE, 'utf8')); }
catch (error) { console.error('Could not load bundled gift pack:', error.message); }
const BUILTIN_SMILEYS = Object.fromEntries(
  Object.keys(SMILEY_PACK).filter(file => /^smiley-\d+\.(?:gif|png|jpe?g|webp)$/i.test(file)).sort()
    .map(file => [file, '/smileys/' + file])
);
// The exact mobile emoji set requested for the refreshed gallery.
const ALL_MOBILE_EMOJIS = [
  "😂","🫦","👄","🖕","🤝","👌","🫵","🤌","😠","😡","☹️","😓","😲","😮","😳","🥺","🥹","😢","🫣","🥶","🥰","🤧","🤮","😮‍💨","☺️","😁","😭","😆","🤐","🙄","🤤","🙊","🙉","🙈"
];

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
let PRIVATE_MEDIA_DIR = path.join(DATA_DIR, 'private-media');
try { fs.mkdirSync(PRIVATE_MEDIA_DIR, { recursive: true }); }
catch (error) { console.error(`Cannot initialize private media directory ${PRIVATE_MEDIA_DIR}: ${error.message}`); throw error; }

app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(self), microphone=(self), geolocation=()');if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');next();});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UP_DIR, { maxAge: '7d' }));
// Serve individual smiley URLs from the single bundled JSON file (no loose image files).
app.get('/smileys/:file', (req,res)=>{
  const item=SMILEY_PACK[String(req.params.file||'')];
  if(!item || !/^smiley-\d+\.(?:gif|png|jpe?g|webp)$/i.test(String(req.params.file||''))) return res.sendStatus(404);
  res.setHeader('Content-Type', item.type || 'application/octet-stream');
  res.setHeader('Cache-Control','public, max-age=31536000, immutable');
  res.send(Buffer.from(item.data,'base64'));
});
// Serve each built-in gift from the single gifts-pack.json file; no gifts folder upload is needed.
app.get('/gifts/:file', (req,res)=>{
  const file=String(req.params.file||'');
  const item=GIFT_PACK[file];
  if(!item || !/^[a-z0-9_-]+\.gif$/i.test(file)) return res.sendStatus(404);
  res.setHeader('Content-Type', item.type || 'image/gif');
  res.setHeader('Cache-Control','public, max-age=31536000, immutable');
  res.send(Buffer.from(item.data,'base64'));
});
app.use(express.static(path.join(ROOT, 'public')));
// Serve the approved single-file UI at the site root without changing its design.
app.get('/', (req, res) => { if (!INDEX_FILE) return res.status(500).send('Rimaz setup error: index.html is missing from the deployment package.'); res.sendFile(INDEX_FILE); });

const defaults = () => ({
  users: {}, guests: {}, sessions: {}, messages: [], wall: [], notifications: {}, announcements: [], adminAuditLogs: [], chatFilter: {enabled:false, words:[]}, welcomeMessages: [
    {id:'welcome-visitors',title:'دردشة ريماز عراقية',text:'إعزإئنا زوإر (دردشة ريماز عراقية)\nحياَكم الله منـورين الشاَت . الاعضاء الجدد نتمنيُ لكم اوقاَت سعيده',enabled:true},
    {id:'welcome-search',title:'الترحيب',text:'عزيزي الزائر للرجوع الينا اكتب في محرك البحث ( دردشة ريماز عراقية )\nنتمنا لكم وقت ممتعا',enabled:true}
  ],
  profiles: {}, lastLike: {}, permissionOverrides: {}, rolePermissions: {}, rankAudit: [], giftCatalog: [],
  chatShortcuts: [], customSmileys: [],
  rooms: [
    { id:'public', name:'الغرفة العامة', desc:'غرفة عامة ..', kind:'public', capacity:200, mics:0, owner:'admin' },
    { id:'friends', name:'غرفة الأصدقاء', desc:'غرفة خاصة ..', kind:'private', capacity:100, mics:0, owner:'admin' },
    { id:'love', name:'غرفة الحب', desc:'غرفة خاصة ..', kind:'private', capacity:100, mics:0, owner:'admin' },
    { id:'voice', name:'غرفة الصوت', desc:'مايك ..', kind:'voice', capacity:50, mics:5, owner:'admin' },
    { id:'admin-room', name:'غرفة الإدارة', desc:'غرفة الإدارة ..', kind:'private', capacity:100, mics:0, owner:'admin', theme:'black' }
  ],
  roomBans:{}, roomMutes:{}, roomKicks:{}, globalBans:{}, globalIpBans:{},
  wallLikes:{}, wallComments:{}, privateMessages:[], privateHidden:{}, privateRead:{}, ignored:{}
});

let db;
try {
  const rawDatabase = fs.readFileSync(DB_FILE, 'utf8');
  db = JSON.parse(rawDatabase);
  if (!db || typeof db !== 'object' || Array.isArray(db)) throw new Error('Database root must be a JSON object');
} catch (error) {
  if (error.code === 'ENOENT') {
    db = defaults();
  } else if (error instanceof SyntaxError || /Database root must be/.test(error.message || '')) {
    // Never replace a damaged database with empty defaults: preserve the original
    // bytes for recovery and stop startup before any migration can overwrite it.
    const recoveryCopy = `${DB_FILE}.corrupt-${Date.now()}`;
    try { fs.copyFileSync(DB_FILE, recoveryCopy, fs.constants.COPYFILE_EXCL); }
    catch (copyError) { console.error(`Could not create database recovery copy: ${copyError.message}`); }
    console.error(`FATAL: database JSON is invalid. Original file was preserved${fs.existsSync(recoveryCopy) ? ` at ${recoveryCopy}` : ''}. Repair or restore it before restarting.`);
    throw new Error('Refusing to start with an invalid database to prevent data loss.');
  } else {
    console.error(`FATAL: cannot read database ${DB_FILE}: ${error.message}`);
    throw error;
  }
}
for (const [k,v] of Object.entries(defaults())) if (db[k] === undefined) db[k] = v;
if(!Array.isArray(db.adminAuditLogs)) db.adminAuditLogs=[];
if(!db.chatFilter || typeof db.chatFilter!=='object') db.chatFilter={enabled:false,words:[]};
if(!Array.isArray(db.chatFilter.words)) db.chatFilter.words=[];
if(!Array.isArray(db.chatShortcuts)) db.chatShortcuts=[]; if(!Array.isArray(db.customSmileys)) db.customSmileys=[];
// Gallery migration v9: replace all legacy smileys with the supplied artwork pack and requested mobile emojis.
// This only resets the smiley catalogue; accounts, messages, uploads and chat shortcuts remain untouched.
{
  const classicFiles=Object.keys(BUILTIN_SMILEYS).sort();
  const desiredCount=classicFiles.length+ALL_MOBILE_EMOJIS.length;
  if(Number(db.smileysSeedVersion||0)<9 || !Array.isArray(db.customSmileys) || db.customSmileys.length!==desiredCount){
    const artwork=classicFiles.map((file,i)=>({id:'rimaz-art-'+String(i+1).padStart(3,'0'),icon:BUILTIN_SMILEYS[file],name:'سميل '+String(i+1),shortcut:''}));
    const mobile=ALL_MOBILE_EMOJIS.map((icon,i)=>({id:'rimaz-mobile-'+String(i+1).padStart(3,'0'),icon,name:'إيموجي موبايل '+String(i+1),shortcut:''}));
    db.customSmileys=[...artwork,...mobile];
    db.smileysSeedVersion=9;
    db.smileysSeeded=true;
    try { save(); console.log(`Installed ${artwork.length} supplied smileys + ${mobile.length} mobile emojis (migration v9).`); }
    catch(e) { console.error('Could not persist smiley gallery migration:',e.message); }
  }
}


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
const expiredAnnouncementIds=new Set((db.announcements||[]).filter(a=>a&&['5m','15m'].includes(a.duration)&&Number(a.at)+900000<=Date.now()).map(a=>String(a.id)));
if(expiredAnnouncementIds.size){db.announcements=(db.announcements||[]).filter(a=>!expiredAnnouncementIds.has(String(a.id)));db.messages=(db.messages||[]).filter(m=>![...expiredAnnouncementIds].some(id=>String(m.id||'').startsWith(id+'-')));try{fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2))}catch(e){console.error('Could not clean expired announcements:',e.message)}}
// Direct private conversations and the wall are separate from db.rooms.
// Keep room announcements available in every configured room, including rooms
// whose access kind is private; only one-to-one DMs and the wall are excluded.
// Normalize legacy saved role permissions at startup so old arrays cannot invert rank hierarchy.
const ROLE_PERMISSION_CEILINGS={super:['panel_access','users_view','shortcuts_manage','smileys_manage'],banner:['panel_access','users_view','moderation','messages_delete','gifts','announcements','shortcuts_manage','smileys_manage'],admin:Object.keys({panel_access:1,users_view:1,moderation:1,kick_room:1,ban_room:1,mute_room:1,global_kick:1,global_ban:1,messages_delete:1,gifts:1,announcements:1,announcement_post:1,announcement_delete:1,rooms_manage:1,vip:1,profile_edit:1,avatar_delete:1,grant_likes:1,role_assign:1,rank_assign:1,permission_manage:1,member_ip:1,reset_likes:1,chat_tools_manage:1,shortcuts_manage:1,smileys_manage:1,room_move:1,wall_stop:1,wall_restart:1,wall_clear:1,wall_delete_user:1,welcome_manage:1,audit_view:1,stats_view:1,chat_filter_manage:1,member_status_manage:1})};
const RANK_PERMISSION_PROFILES=['admin-full','super-red','super-white','super-black','crown-silver','crown-gold','admin-shield'];
const RANK_BASE_ROLE={'admin-full':'admin','super-red':'super','super-white':'super','super-black':'super','crown-silver':'banner','crown-gold':'banner','admin-shield':'admin'};

const PROTECTED_ROLE_PERMISSIONS=[]; // Admin has full operational permissions; owner protection is enforced on protected targets server-side.
db.rolePermissions=db.rolePermissions||{};
db.rolePermissionMeta=db.rolePermissionMeta||{customized:{}};
db.rolePermissionMeta.customized=db.rolePermissionMeta.customized||{};
for(const role of Object.keys(ROLE_PERMISSION_CEILINGS)) if(Array.isArray(db.rolePermissions[role])) db.rolePermissions[role]=[...new Set(['panel_access',...db.rolePermissions[role].filter(p=>Object.hasOwn({panel_access:1,users_view:1,moderation:1,kick_room:1,ban_room:1,mute_room:1,global_kick:1,global_ban:1,messages_delete:1,gifts:1,announcements:1,announcement_post:1,announcement_delete:1,rooms_manage:1,vip:1,profile_edit:1,avatar_delete:1,grant_likes:1,role_assign:1,rank_assign:1,permission_manage:1,member_ip:1,reset_likes:1,chat_tools_manage:1,shortcuts_manage:1,smileys_manage:1,room_move:1,wall_stop:1,wall_restart:1,wall_clear:1,wall_delete_user:1,welcome_manage:1,audit_view:1,stats_view:1,chat_filter_manage:1,member_status_manage:1},p))])];
function save(){
  // Keep the existing synchronous/atomic contract for every route, but avoid
  // pretty-printing the entire database and forcing two disk flushes per event.
  // Private messages are deliberately memory-only and are never written to disk.
  const snapshot = { ...db, privateMessages: [] };
  const serialized = JSON.stringify(snapshot);
  const tempFile = `${DB_FILE}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  let fd = null;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fd = fs.openSync(tempFile, 'wx', 0o600);
    fs.writeFileSync(fd, serialized, 'utf8');
    fs.closeSync(fd); fd = null;
    fs.renameSync(tempFile, DB_FILE);
  } catch (error) {
    if (fd !== null) { try { fs.closeSync(fd); } catch (_) {} }
    try { fs.unlinkSync(tempFile); } catch (_) {}
    throw error;
  }
}
// One-time replacement of the old built-in gift catalogue with the new animated GIF collection.
if(db.giftCatalogV3Initialized!==true){
  const customGifts=(Array.isArray(db.giftCatalog)?db.giftCatalog:[]).filter(x=>x && x.builtin!==true);
  db.giftCatalog=[{"id":"gift-pink-heart","name":"قلب وردي فاخر","icon":"💗","image":"/gifts/pink-heart.gif","price":0,"builtin":true},{"id":"gift-heart-ribbon","name":"قلب مع شريطة","icon":"💝","image":"/gifts/heart-ribbon.gif","price":0,"builtin":true},{"id":"gift-love-letter","name":"رسالة حب","icon":"💌","image":"/gifts/love-letter.gif","price":0,"builtin":true},{"id":"gift-heart-sparkle","name":"قلب لامع","icon":"💖","image":"/gifts/heart-sparkle.gif","price":0,"builtin":true},{"id":"gift-tulip","name":"زهرة التوليب","icon":"🌷","image":"/gifts/tulip.gif","price":0,"builtin":true},{"id":"gift-hibiscus","name":"زهرة الكركديه","icon":"🌺","image":"/gifts/hibiscus.gif","price":0,"builtin":true},{"id":"gift-sunflower","name":"عباد الشمس","icon":"🌻","image":"/gifts/sunflower.gif","price":0,"builtin":true},{"id":"gift-cherry-blossom","name":"أزهار الكرز","icon":"🌸","image":"/gifts/cherry-blossom.gif","price":0,"builtin":true},{"id":"gift-lotus","name":"زهرة اللوتس","icon":"🪷","image":"/gifts/lotus.gif","price":0,"builtin":true},{"id":"gift-chocolate","name":"علبة شوكولاتة","icon":"🍫","image":"/gifts/chocolate.gif","price":0,"builtin":true},{"id":"gift-strawberry","name":"فراولة","icon":"🍓","image":"/gifts/strawberry.gif","price":0,"builtin":true},{"id":"gift-cherries","name":"كرز أحمر","icon":"🍒","image":"/gifts/cherries.gif","price":0,"builtin":true},{"id":"gift-grapes","name":"عنب فاخر","icon":"🍇","image":"/gifts/grapes.gif","price":0,"builtin":true},{"id":"gift-watermelon","name":"بطيخ","icon":"🍉","image":"/gifts/watermelon.gif","price":0,"builtin":true},{"id":"gift-peach","name":"خوخة","icon":"🍑","image":"/gifts/peach.gif","price":0,"builtin":true},{"id":"gift-gold-medal","name":"ميدالية ذهبية","icon":"🥇","image":"/gifts/gold-medal.gif","price":0,"builtin":true},{"id":"gift-medal","name":"وسام ملكي","icon":"🎖️","image":"/gifts/medal.gif","price":0,"builtin":true},{"id":"gift-gold-coin","name":"عملة ذهبية","icon":"🪙","image":"/gifts/gold-coin.gif","price":0,"builtin":true},{"id":"gift-money-bag","name":"كيس ذهب","icon":"💰","image":"/gifts/money-bag.gif","price":0,"builtin":true},{"id":"gift-cash-gift","name":"هدية نقدية","icon":"💵","image":"/gifts/cash-gift.gif","price":0,"builtin":true},{"id":"gift-sports-car","name":"سيارة فارهة","icon":"🚘","image":"/gifts/sports-car.gif","price":0,"builtin":true},{"id":"gift-motorcycle","name":"دراجة نارية","icon":"🏍️","image":"/gifts/motorcycle.gif","price":0,"builtin":true},{"id":"gift-private-jet","name":"طائرة خاصة","icon":"🛩️","image":"/gifts/private-jet.gif","price":0,"builtin":true},{"id":"gift-helicopter","name":"هليكوبتر","icon":"🚁","image":"/gifts/helicopter.gif","price":0,"builtin":true},{"id":"gift-rocket","name":"صاروخ فضائي","icon":"🚀","image":"/gifts/rocket.gif","price":0,"builtin":true},{"id":"gift-sailboat","name":"قارب شراعي","icon":"⛵","image":"/gifts/sailboat.gif","price":0,"builtin":true},{"id":"gift-island","name":"جزيرة استوائية","icon":"🏝️","image":"/gifts/island.gif","price":0,"builtin":true},{"id":"gift-villa","name":"فيلا فاخرة","icon":"🏡","image":"/gifts/villa.gif","price":0,"builtin":true},{"id":"gift-violin","name":"كمان موسيقي","icon":"🎻","image":"/gifts/violin.gif","price":0,"builtin":true},{"id":"gift-guitar","name":"غيتار","icon":"🎸","image":"/gifts/guitar.gif","price":0,"builtin":true},{"id":"gift-piano","name":"بيانو","icon":"🎹","image":"/gifts/piano.gif","price":0,"builtin":true},{"id":"gift-headphones","name":"سماعات فاخرة","icon":"🎧","image":"/gifts/headphones.gif","price":0,"builtin":true},{"id":"gift-smartphone","name":"هاتف ذكي","icon":"📱","image":"/gifts/smartphone.gif","price":0,"builtin":true},{"id":"gift-camera","name":"كاميرا احترافية","icon":"📸","image":"/gifts/camera.gif","price":0,"builtin":true},{"id":"gift-gamepad","name":"جهاز ألعاب","icon":"🎮","image":"/gifts/gamepad.gif","price":0,"builtin":true},{"id":"gift-football","name":"كرة قدم","icon":"⚽","image":"/gifts/football.gif","price":0,"builtin":true},{"id":"gift-basketball","name":"كرة سلة","icon":"🏀","image":"/gifts/basketball.gif","price":0,"builtin":true},{"id":"gift-chess","name":"قطعة شطرنج","icon":"♟️","image":"/gifts/chess.gif","price":0,"builtin":true},{"id":"gift-evil-eye","name":"عين زرقاء","icon":"🧿","image":"/gifts/evil-eye.gif","price":0,"builtin":true},{"id":"gift-hand-of-fatima","name":"خمسة وخميسة","icon":"🪬","image":"/gifts/hand-of-fatima.gif","price":0,"builtin":true},{"id":"gift-peacock","name":"طاووس ملكي","icon":"🦚","image":"/gifts/peacock.gif","price":0,"builtin":true},{"id":"gift-swan","name":"بجعة بيضاء","icon":"🦢","image":"/gifts/swan.gif","price":0,"builtin":true},{"id":"gift-dolphin","name":"دلفين","icon":"🐬","image":"/gifts/dolphin.gif","price":0,"builtin":true},{"id":"gift-unicorn","name":"حصان وحيد القرن","icon":"🦄","image":"/gifts/unicorn.gif","price":0,"builtin":true},{"id":"gift-panda","name":"باندا","icon":"🐼","image":"/gifts/panda.gif","price":0,"builtin":true},{"id":"gift-rabbit","name":"أرنب أبيض","icon":"🐰","image":"/gifts/rabbit.gif","price":0,"builtin":true},{"id":"gift-puppy","name":"جرو لطيف","icon":"🐶","image":"/gifts/puppy.gif","price":0,"builtin":true},{"id":"gift-tiger","name":"نمر","icon":"🐯","image":"/gifts/tiger.gif","price":0,"builtin":true},{"id":"gift-bear","name":"دب بني","icon":"🐻","image":"/gifts/bear.gif","price":0,"builtin":true},{"id":"gift-penguin","name":"بطريق","icon":"🐧","image":"/gifts/penguin.gif","price":0,"builtin":true},{"id":"gift-champagne-confetti","name":"احتفال وكونفيتي","icon":"🎊","image":"/gifts/champagne-confetti.gif","price":0,"builtin":true},{"id":"gift-party-popper","name":"مفرقعة احتفال","icon":"🎉","image":"/gifts/party-popper.gif","price":0,"builtin":true},{"id":"gift-sparkler","name":"شمعة شرارة","icon":"🎇","image":"/gifts/sparkler.gif","price":0,"builtin":true},{"id":"gift-music-notes","name":"أنغام موسيقية","icon":"🎶","image":"/gifts/music-notes.gif","price":0,"builtin":true},{"id":"gift-bouquet-tulips","name":"باقة توليب","icon":"💐","image":"/gifts/bouquet-tulips.gif","price":0,"builtin":true},{"id":"gift-red-ribbon","name":"شريطة حمراء","icon":"🎀","image":"/gifts/red-ribbon.gif","price":0,"builtin":true}].concat(customGifts);
  db.giftCatalogV3Initialized=true;
  try{save();console.log('Initialized the expanded premium animated gift catalogue:',db.giftCatalog.length)}catch(error){console.error('Could not persist expanded gift catalogue:',error.message)}
}
function migratePrivateMediaToProtectedStorage(){
  let changed=false;
  for(const message of (db.privateMessages||[])){
    const media=message?.media;
    const url=String(media?.url||'');
    if(!url.startsWith('/uploads/'))continue;
    const filename=path.basename(url.slice('/uploads/'.length));
    if(!filename||filename!==url.slice('/uploads/'.length)||! /^[a-zA-Z0-9._-]{1,180}$/.test(filename))continue;
    const publicPath=path.join(UP_DIR,filename),privatePath=path.join(PRIVATE_MEDIA_DIR,filename);
    try{
      if(fs.existsSync(privatePath)){
        if(fs.existsSync(publicPath))fs.unlinkSync(publicPath);
      }else if(fs.existsSync(publicPath)){
        fs.renameSync(publicPath,privatePath);
      }
      media.url='/api/private/media/'+filename;
      changed=true;
    }catch(error){
      console.error(`FATAL: could not secure legacy private media ${filename}: ${error.message}`);
      throw new Error('Private media migration failed; startup stopped to avoid exposing private uploads.');
    }
  }
  if(changed){
    try{save();console.log('Migrated legacy private media into protected storage.');}
    catch(error){console.error('FATAL: private media migration could not be saved:',error.message);throw new Error('Private media migration could not be persisted; startup stopped.');}
  }
}
migratePrivateMediaToProtectedStorage();

// Private conversations are transient by design: remove any history left by an
// older release and purge its protected media when this server starts.
function purgePrivateHistoryAtStartup(){
  const hadHistory=(db.privateMessages||[]).length>0;
  db.privateMessages=[];
  for(const [name,items] of Object.entries(db.notifications||{})){
    if(Array.isArray(items))db.notifications[name]=items.filter(item=>!String(item?.type||'').startsWith('private'));
  }
  let removedFiles=0;
  for(const entry of fs.readdirSync(PRIVATE_MEDIA_DIR,{withFileTypes:true})){
    if(!entry.isFile())continue;
    try{fs.unlinkSync(path.join(PRIVATE_MEDIA_DIR,entry.name));removedFiles++;}
    catch(error){if(error.code!=='ENOENT')console.warn('Startup private media purge failed:',error.message);}
  }
  if(hadHistory||removedFiles)console.log(`Purged transient private history and ${removedFiles} private media file(s).`);
  if(hadHistory||removedFiles)save();
}
purgePrivateHistoryAtStartup();

const ANNOUNCEMENT_INTERVAL_MS=15*60*1000;
// Room announcements belong to configured chat rooms only. One-to-one private
// conversations use the separate private-message channel and the wall uses db.wall;
// neither is a room. Do not exclude rooms merely because their access kind is
// 'private' (those are still ordinary multi-member chat rooms).
function isAnnouncementRoom(room){
  if(!room||room.id===undefined||room.id===null||!String(room.id).trim())return false;
  const id=String(room.id).trim().toLowerCase();
  return room.kind!=='wall'&&!['wall','__wall__','__private__'].includes(id);
}
function announcementRooms(){return (Array.isArray(db.rooms)?db.rooms:[]).filter(isAnnouncementRoom);}
function announcementMessageForRoom(item,roomId,at=Date.now(),idSuffix=String(at)){
  if(item.duration==='15m')return {id:String(item.id)+'-'+roomId+'-'+idSuffix,announcementId:String(item.id),room:String(roomId),from:item.from,displayName:item.displayName||displayName(item.from),role:item.role||roleOf({name:item.from}),type:'announcement',text:item.text,at,duration:item.duration,profile:item.profile||profile(item.from)};
  return {id:String(item.id)+'-'+roomId+'-'+idSuffix,announcementId:String(item.id),room:String(roomId),from:'الإدارة',displayName:'الإدارة',title:item.title||'إعلان إداري',role:'admin',type:'announcement',text:item.text,at,duration:item.duration,profile:{}};
}
// db.messages has a global size limit, so busy rooms can evict an announcement
// belonging to a quieter room. Rehydrate each still-active announcement into the
// room history when a member enters, without ever routing it to DMs or the wall.
function roomHistoryWithAnnouncements(roomId,viewer,createdAt=0){
  const now=Date.now();
  const items=(db.messages||[]).filter(m=>m.room===roomId&&Number(m.at||0)>=createdAt&&canSeePresenceNotice(viewer,m)&&(m.type==='presence'||(m.type==='announcement'&&(!m.announcementId||(db.announcements||[]).some(a=>String(a.id)===String(m.announcementId))))));
  for(const item of (db.announcements||[])){
    if(!item||!item.id)continue;
    const temporary=item.duration==='15m';
    if(temporary&&Number(item.at||0)+ANNOUNCEMENT_INTERVAL_MS<=now)continue;
    const hasRecentCopy=items.some(m=>m.type==='announcement'&&String(m.announcementId||'')===String(item.id)&&Number(m.at||0)>=now-ANNOUNCEMENT_INTERVAL_MS);
    if(!hasRecentCopy){
      const slot=Math.floor(now/ANNOUNCEMENT_INTERVAL_MS);
      items.push(announcementMessageForRoom(item,roomId,now,'active-'+slot));
    }
  }
  return items.sort((a,b)=>Number(a.at||0)-Number(b.at||0)).slice(-200);
}
function publishAnnouncement(item){
  if(!item||!item.id)return [];
  const at=Date.now();
  const messages=announcementRooms().map(room=>announcementMessageForRoom(item,room.id,at,String(at)));
  db.messages=[...(db.messages||[]),...messages].slice(-1000);
  for(const message of messages)io.to(String(message.room)).emit('message',message);
  try{save()}catch(error){console.error('Announcement publish save failed:',error.message);}
  return messages;
}
function removeAnnouncement(itemId){
  const id=String(itemId);
  db.announcements=(db.announcements||[]).filter(a=>String(a.id)!==id);
  const removed=(db.messages||[]).filter(m=>String(m.announcementId||'')===id||String(m.id||'').startsWith(id+'-'));
  db.messages=(db.messages||[]).filter(m=>String(m.announcementId||'')!==id&&!String(m.id||'').startsWith(id+'-'));
  for(const message of removed)io.emit('message-deleted',{id:message.id});
  try{save()}catch(error){console.error('Announcement cleanup save failed:',error.message);}
  return removed;
}
function scheduleAnnouncementExpiry(item){
  if(!item||!['5m','15m'].includes(item.duration)||!item.id)return;
  const delay=Math.max(0,Number(item.at||Date.now())+ANNOUNCEMENT_INTERVAL_MS-Date.now());
  setTimeout(()=>removeAnnouncement(item.id),delay).unref?.();
}
function schedulePermanentAnnouncement(item){
  if(!item||item.duration!=='permanent'||!item.id)return;
  const tick=()=>{
    if(!(db.announcements||[]).some(a=>String(a.id)===String(item.id)))return;
    publishAnnouncement(item);
    const timer=setTimeout(tick,ANNOUNCEMENT_INTERVAL_MS);timer.unref?.();
  };
  const firstDelay=Math.max(0,Number(item.at||Date.now())+ANNOUNCEMENT_INTERVAL_MS-Date.now());
  const timer=setTimeout(tick,firstDelay);timer.unref?.();
}
for(const item of (db.announcements||[])){
  if(['5m','15m'].includes(item.duration))scheduleAnnouncementExpiry(item);
  else schedulePermanentAnnouncement(item);
}

const PUBLIC_RETENTION_MS=24*60*60*1000;
function containsStoredUrl(value,url,seen=new Set()){
  if(value===url)return true;
  if(!value||typeof value!=='object'||seen.has(value))return false;
  seen.add(value);
  for(const child of Object.values(value))if(containsStoredUrl(child,url,seen))return true;
  return false;
}
function removePublicUploadIfUnreferenced(url){
  const value=String(url||'');
  if(!value.startsWith('/uploads/'))return;
  const filename=value.slice('/uploads/'.length);
  if(!filename||path.basename(filename)!==filename||!/^[a-zA-Z0-9._-]{1,180}$/.test(filename))return;
  if(containsStoredUrl(db,value))return;
  try{fs.unlinkSync(path.join(UP_DIR,filename));}
  catch(error){if(error.code!=='ENOENT')console.warn('Expired public media cleanup failed:',error.message);}
}
function cleanupExpiredPublicContent(now=Date.now()){
  const cutoff=now-PUBLIC_RETENTION_MS;
  const expiredMessageIds=[];
  const expiredMedia=[];
  const previousMessages=db.messages||[];
  db.messages=previousMessages.filter(message=>{
    const old=message?.room==='public'&&Number(message.at||0)>0&&Number(message.at)<cutoff&&message.type!=='announcement';
    if(old){expiredMessageIds.push(message.id);if(message.media?.url)expiredMedia.push(message.media.url);}
    return !old;
  });
  const expiredWallIds=new Set(),keptWall=[];
  for(const post of (db.wall||[])){
    if(Number(post?.at||0)>0&&Number(post.at)<cutoff){expiredWallIds.add(String(post.id));if(post.media?.url)expiredMedia.push(post.media.url);}
    else keptWall.push(post);
  }
  db.wall=keptWall;
  for(const field of ['wallLikes','wallComments']){
    const store=db[field];
    if(store&&typeof store==='object'&&!Array.isArray(store))for(const id of expiredWallIds)delete store[id];
  }
  if(expiredMessageIds.length||expiredWallIds.size){
    for(const id of expiredMessageIds)io.emit('message-deleted',{id});
    io.emit('wall-retention-cleaned',{ids:[...expiredWallIds]});
    for(const url of new Set(expiredMedia))removePublicUploadIfUnreferenced(url);
    try{save();}catch(error){console.error('24-hour public retention save failed:',error.message);}
    console.log(`24-hour cleanup removed ${expiredMessageIds.length} public message(s), ${expiredWallIds.size} wall post(s).`);
  }
}
cleanupExpiredPublicContent();
const publicRetentionTimer=setInterval(()=>cleanupExpiredPublicContent(),5*60*1000);
publicRetentionTimer.unref?.();

const sessions = new Map(); // sid -> {name,type,created}
for (const [sid,s] of Object.entries(db.sessions||{})) sessions.set(sid,s);
const roomSockets = new Map();
const socketUsers = new Map();
// WebRTC signaling is relayed only between peers with a recent, server-authorized offer.
const activeCallPairs = new Map();
const activeVoicePairs = new Map(); // Authorized room-scoped speaker/listener negotiations.
function voiceRoomPairKey(room,a,b){return String(room)+'::'+callPairKey(a,b);}
function clearVoicePairsForSession(room,sid){for(const [key,state] of activeVoicePairs){if(state.room===room&&(state.a===sid||state.b===sid))activeVoicePairs.delete(key);}}
const callSignalWindows = new Map();
const voiceSignalWindows = new Map(); // Separate signaling budget: room microphones never consume private-call quota.
function callPairKey(a,b){return [String(a||''),String(b||'')].sort().join('::');}
function allowCallSignal(sid){const now=Date.now(),entry=callSignalWindows.get(sid)||{start:now,count:0};if(now-entry.start>10000){entry.start=now;entry.count=0;}entry.count++;callSignalWindows.set(sid,entry);return entry.count<=35;}
function allowVoiceSignal(sid){const now=Date.now(),entry=voiceSignalWindows.get(sid)||{start:now,count:0};if(now-entry.start>10000){entry.start=now;entry.count=0;}entry.count++;voiceSignalWindows.set(sid,entry);return entry.count<=500;}
function validSessionDescription(value,type){return !!value&&typeof value==='object'&&value.type===type&&typeof value.sdp==='string'&&value.sdp.length>0&&value.sdp.length<=100000;}
function validIceCandidate(value){if(!value||typeof value!=='object')return false;const candidate=String(value.candidate||'');return candidate.length>0&&candidate.length<=4096&&(!value.sdpMid||String(value.sdpMid).length<=128)&&(!value.usernameFragment||String(value.usernameFragment).length<=256);}
// Send configured welcome cards only once per authenticated session, not on every room change.
const welcomeSentSessions = new Set();
// Per-room raised-mic state (not shared across rooms).
const voiceSpeakers = new Map();
function emitVoiceState(room){ const r=db.rooms.find(x=>x.id===room); if(!r||r.kind!=='voice')return; const speakers=[...(voiceSpeakers.get(room)||new Map()).values()].sort((a,b)=>Number(a.seatIndex)-Number(b.seatIndex)); io.to(room).emit('voice-state',{room,speakers,count:speakers.length,limit:Number(r.mics)||5}); }
const guestDisconnectTimers = new Map();
const privateDisconnectTimers = new Map();
const PRIVATE_DISCONNECT_GRACE_MS=25000;
function hasConnectedSessionForUser(name){return [...io.sockets.sockets.values()].some(so=>so.connected&&keyName(so.data?.user?.name)===keyName(name));}
function clearPrivateConversationForUser(name){
  const userKey=keyName(name);if(!userKey||hasConnectedSessionForUser(name))return;
  const removed=(db.privateMessages||[]).filter(message=>keyName(message.from)===userKey||keyName(message.to)===userKey);
  if(!removed.length)return;
  db.privateMessages=(db.privateMessages||[]).filter(message=>keyName(message.from)!==userKey&&keyName(message.to)!==userKey);
  const peers=new Set();
  for(const message of removed){
    const peer=keyName(message.from)===userKey?message.to:message.from;if(peer)peers.add(peer);
    const url=String(message?.media?.url||'');const prefix='/api/private/media/';
    if(url.startsWith(prefix)){const filename=url.slice(prefix.length);if(/^[a-zA-Z0-9._-]{1,180}$/.test(filename)){const stillUsed=db.privateMessages.some(item=>item?.media?.url===url);if(!stillUsed){try{fs.unlinkSync(path.join(PRIVATE_MEDIA_DIR,filename));}catch(error){if(error.code!=='ENOENT')console.warn('Private media cleanup failed:',error.message);}}}}
  }
  for(const peer of peers){
    if(db.privateRead?.[userKey])delete db.privateRead[userKey][keyName(peer)];
    if(db.privateRead?.[keyName(peer)])delete db.privateRead[keyName(peer)][userKey];
    if(db.privateHidden?.[userKey])db.privateHidden[userKey]=db.privateHidden[userKey].filter(item=>keyName(item)!==keyName(peer));
    if(db.privateHidden?.[keyName(peer)])db.privateHidden[keyName(peer)]=db.privateHidden[keyName(peer)].filter(item=>keyName(item)!==userKey);
    emitToUser(peer,'private-conversation-ended',{with:name});
  }
  for(const [owner,items] of Object.entries(db.notifications||{})){
    if(Array.isArray(items))db.notifications[owner]=items.filter(item=>!(String(item?.type||'').startsWith('private')&&(keyName(item.from)===userKey||peers.has(keyName(item.from)))));
  }
  try{save();}catch(error){console.error('Transient private conversation cleanup save failed:',error.message);}
}
function schedulePrivateConversationCleanup(name,delay=PRIVATE_DISCONNECT_GRACE_MS){
  const key=keyName(name);if(!key||hasConnectedSessionForUser(name))return;
  const old=privateDisconnectTimers.get(key);if(old)clearTimeout(old);
  const timer=setTimeout(()=>{privateDisconnectTimers.delete(key);clearPrivateConversationForUser(name);},delay);
  timer.unref?.();privateDisconnectTimers.set(key,timer);
}
function cancelPrivateConversationCleanup(name){const key=keyName(name),timer=privateDisconnectTimers.get(key);if(timer){clearTimeout(timer);privateDisconnectTimers.delete(key);}}

function cleanName(v){ return String(v||'').trim().replace(/\s+/g,' ').slice(0,32); }
function keyName(n){ return cleanName(n).toLowerCase(); }
function isOwnerName(name){ const n=keyName(name); if(n==='owner'||(!!process.env.OWNER_NAME&&n===keyName(process.env.OWNER_NAME)))return true; const userEntry=Object.entries(db.users||{}).find(([k])=>keyName(k)===n); if(userEntry&&String(userEntry[1]?.role||'')==='owner')return true; const guestEntry=Object.entries(db.guests||{}).find(([k])=>keyName(k)===n); return !!(guestEntry&&String(guestEntry[1]?.role||'')==='owner'); }
function roleOf(u){ if(!u)return 'member'; const n=keyName(u.name); if(isOwnerName(n))return 'owner'; if(n==='admin' || n===keyName(process.env.ADMIN_NAME||'admin'))return 'admin'; const valid=['member','super','banner','admin']; const member=getUser(u.name); const guest=getGuest(u.name); const account=member||guest; const stored=String(account?.role||u.role||'member'); const visualRank=profile(u.name)?.rank; const dynamicBase=visualRank&&(!profile(u.name).rankUntil||Number(profile(u.name).rankUntil)>Date.now())?rankBaseRole(visualRank):null; /* Legacy and custom rank base roles remain operational without changing chat presentation. */ if(stored==='admin'||dynamicBase==='admin'||visualRank==='admin-shield'||visualRank==='admin-full')return 'admin'; if(dynamicBase==='super'||dynamicBase==='banner')return dynamicBase; if(account)return valid.includes(stored)?stored:'member'; return valid.includes(stored)?stored:'member'; }
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
  if(p.rankUntil && Number(p.rankUntil)<=Date.now()) { const expiredRank=p.rank; const account=getUser(name)||getGuest(name); const base=rankBaseRole(expiredRank); if(account&&base&&String(account.role||'member')===base) account.role=String(p.rankPreviousRole||'member'); p.rank='none'; delete p.rankUntil; delete p.rankPreviousRole; delete p.rankDurationDays; save(); }
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
function sessionUser(sid){ const s=sessions.get(sid); if(!s)return null; const role=roleOf(s); return {...s, role, owner:isOwner(s), admin:isAdmin(s), staff:isStaff(s), myPermissions:Object.keys(PERMISSION_CATALOG).filter(permission=>hasPermission(s,permission)), panelAccess:isOwner(s)||hasPermission(s,'panel_access'), vip:vipActive(s.name), likes:isAdmin(s)?999999:userLikes(s.name)}; }
function makeSession(name,type,visibility={}){
  const sid=crypto.randomBytes(24).toString('hex');
  const s={name,type,created:Date.now(),hidden:!!visibility.hidden,ghost:!!visibility.ghost}; sessions.set(sid,s); db.sessions[sid]=s; save(); return sid;
}
function requireAuth(req,res,next){
  const u=sessionUser(req.get('x-session')); if(!u)return res.status(401).json({error:'يجب تسجيل الدخول'}); req.user=u; next();
}
app.get('/api/private/media/:filename',requireAuth,(req,res)=>{
  const filename=String(req.params.filename||'');
  if(!/^[a-zA-Z0-9._-]{1,180}$/.test(filename)||path.basename(filename)!==filename)return res.status(404).json({error:'الوسائط غير موجودة'});
  const url='/api/private/media/'+filename;
  const allowed=(db.privateMessages||[]).some(message=>message?.media?.url===url&&(keyName(message.from)===keyName(req.user.name)||keyName(message.to)===keyName(req.user.name)));
  if(!allowed)return res.status(404).json({error:'الوسائط غير موجودة أو لا تملك صلاحية عرضها'});
  const file=path.resolve(PRIVATE_MEDIA_DIR,filename);
  if(!file.startsWith(path.resolve(PRIVATE_MEDIA_DIR)+path.sep)||!fs.existsSync(file))return res.status(404).json({error:'الوسائط غير موجودة'});
  res.set('Cache-Control','private, no-store');
  res.sendFile(file,{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}},error=>{if(error&&!res.headersSent)res.status(error.statusCode||404).json({error:'تعذر فتح الوسائط'});});
});
const PERMISSION_CATALOG = {
  panel_access:'فتح لوحة التحكم', users_view:'عرض الأعضاء', kick_room:'طرد من الغرفة', ban_room:'حظر من الغرفة', mute_room:'كتم العضو', global_kick:'طرد خارج الدردشة', global_ban:'حظر خارج الدردشة',
  messages_delete:'حذف الرسائل', rooms_manage:'إدارة الغرف', announcement_post:'نشر الإعلانات', announcement_delete:'حذف الإعلانات',
  gifts:'إرسال الهدايا', vip:'منح VIP', profile_edit:'تعديل ألوان الملف الشخصي',
  avatar_delete:'حذف الصور', grant_likes:'منح اللايكات', role_assign:'تغيير المناصب الإدارية',
  rank_assign:'منح الشارات ومدتها', permission_manage:'تعديل صلاحيات الرتب', member_ip:'عرض IP',
  reset_likes:'تصفير اللايكات', chat_tools_manage:'إدارة الاختصارات والسميلات', shortcuts_manage:'إدارة الاختصارات', smileys_manage:'إدارة السميلات', room_move:'نقل عضو بين الغرف', wall_stop:'إيقاف الحائط', wall_restart:'تشغيل الحائط', wall_clear:'حذف جميع منشورات الحائط', wall_delete_user:'حذف منشورات عضو محدد من الحائط', welcome_manage:'إدارة رسائل الترحيب',
  audit_view:'عرض سجل العمليات وتصديره', stats_view:'عرض إحصائيات الموقع', chat_filter_manage:'إدارة فلتر الكلمات', member_status_manage:'إدارة حالات الأعضاء'
};
// Permissions are tiered: super < banner < admin. Existing saved custom arrays
// are intersected with each role's ceiling so old settings cannot invert hierarchy.
const ALL_PERMISSION_KEYS=Object.keys(PERMISSION_CATALOG);
// Migrate saved bundled permissions to independent controls without losing existing access.
let splitPermissionMigrationChanged=false;
for(const [role, saved] of Object.entries(db.rolePermissions||{})){
  if(!Array.isArray(saved)) continue;
  const next=new Set(saved);
  if(next.has('chat_tools_manage')) { next.add('shortcuts_manage'); next.add('smileys_manage'); }
  if(next.has('moderation')) { for(const k of ['kick_room','ban_room','mute_room','global_kick','global_ban']) next.add(k); next.delete('moderation'); }
  if(next.has('announcements')) { next.add('announcement_post'); next.add('announcement_delete'); next.delete('announcements'); }
  // The old wall toggle controlled both stopping and restarting.
  if(next.has('wall_stop')) next.add('wall_restart');
  const value=[...next];
  if(JSON.stringify(value.slice().sort())!==JSON.stringify(saved.slice().sort())) { db.rolePermissions[role]=value; splitPermissionMigrationChanged=true; }
}
if(splitPermissionMigrationChanged) save();
const without=(...blocked)=>ALL_PERMISSION_KEYS.filter(p=>!blocked.includes(p));
const DEFAULT_ROLE_PERMISSIONS = {
  super:['panel_access','users_view'], banner:['panel_access','users_view'],
  // Admin receives the full permission catalog; owner protection is enforced by target-level server checks.
  admin:[...ALL_PERMISSION_KEYS],
  'admin-full':[...ALL_PERMISSION_KEYS],
  'admin-shield':without('rank_assign','permission_manage','reset_likes'),
  'crown-gold':without('member_ip','rank_assign','permission_manage','reset_likes','grant_likes'),
  'crown-silver':without('member_ip','rank_assign','permission_manage','reset_likes','grant_likes','wall_stop','wall_restart','wall_clear','wall_delete_user'),
  'super-black':without('member_ip','rank_assign','permission_manage','reset_likes','grant_likes','wall_stop','wall_restart','wall_clear','wall_delete_user','room_move'),
  'super-white':without('member_ip','rank_assign','permission_manage','reset_likes','grant_likes','wall_stop','wall_restart','wall_clear','wall_delete_user','room_move','global_kick','mute_room'),
  'super-red':without('member_ip','rank_assign','permission_manage','reset_likes','grant_likes','wall_stop','wall_restart','wall_clear','wall_delete_user','room_move','global_kick','mute_room','avatar_delete'),
  member:[]
};
// Dynamic rank catalogue. Legacy IDs are retained so existing assignments keep working.
const LEGACY_RANK_DEFINITIONS=[
 {id:'admin-full',name:'ADMIN كامل الصلاحيات',level:1000,icon:'👑',baseRole:'admin',permissions:[...ALL_PERMISSION_KEYS]},
 {id:'admin-shield',name:'الإداري',level:900,icon:'⬟',baseRole:'admin',permissions:DEFAULT_ROLE_PERMISSIONS['admin-shield']||[]},
 {id:'crown-gold',name:'البنر الذهبي',level:800,icon:'♛',baseRole:'banner',permissions:DEFAULT_ROLE_PERMISSIONS['crown-gold']||[]},
 {id:'crown-silver',name:'البنر الفضي',level:700,icon:'♛',baseRole:'banner',permissions:DEFAULT_ROLE_PERMISSIONS['crown-silver']||[]},
 {id:'super-black',name:'السوبر الأسود',level:600,icon:'★',baseRole:'super',permissions:DEFAULT_ROLE_PERMISSIONS['super-black']||[]},
 {id:'super-white',name:'السوبر الأبيض',level:500,icon:'★',baseRole:'super',permissions:DEFAULT_ROLE_PERMISSIONS['super-white']||[]},
 {id:'super-red',name:'السوبر الأحمر',level:400,icon:'★',baseRole:'super',permissions:DEFAULT_ROLE_PERMISSIONS['super-red']||[]}
];
if(!Array.isArray(db.rankDefinitions))db.rankDefinitions=[];
let rankDefinitionsMigrated=false;
for(const legacy of LEGACY_RANK_DEFINITIONS){if(!db.rankDefinitions.some(r=>String(r.id)===legacy.id)){db.rankDefinitions.push({...legacy,permissions:[...legacy.permissions]});rankDefinitionsMigrated=true;}}
if(rankDefinitionsMigrated)save();
for(const r of db.rankDefinitions){if(!Array.isArray(r.permissions))r.permissions=[];if(!Number.isFinite(Number(r.level)))r.level=0;if(!r.baseRole)r.baseRole='member';}
function rankDefinition(id){return (db.rankDefinitions||[]).find(r=>String(r.id)===String(id))||null;}
function rankBaseRole(id){return RANK_BASE_ROLE[id]||rankDefinition(id)?.baseRole||null;}

// The seven built-in ranks have a strict server-side hierarchy. Ordinary members/guests
// are deliberately outside this comparison; owner protection remains on its existing path.
const CORE_RANK_LEVELS=Object.freeze({
  'super-red':400,
  'super-white':500,
  'super-black':600,
  'crown-silver':700,
  'crown-gold':800,
  'admin-shield':900,
  'admin-full':1000
});
function coreRankLevelForName(name){
  const canonical=accountKey(name)||cleanName(name);
  if(!canonical||isOwnerName(canonical))return null;
  const p=profile(canonical),rank=String(p?.rank||'');
  if(Object.hasOwn(CORE_RANK_LEVELS,rank)&&(!p.rankUntil||Number(p.rankUntil)>Date.now()))return CORE_RANK_LEVELS[rank];
  const account=getUser(canonical)||getGuest(canonical);
  const role=roleOf({name:canonical,role:account?.role||'member'});
  // Legacy staff accounts without an explicit badge still map to their nearest built-in tier.
  if(role==='admin')return CORE_RANK_LEVELS['admin-shield'];
  return null;
}
function higherRankTargetError(actor,targetName){
  if(!actor||isOwner(actor)||!targetName||isOwnerName(targetName))return false;
  const actorLevel=coreRankLevelForName(actor.name),targetLevel=coreRankLevelForName(targetName);
  return actorLevel!==null&&targetLevel!==null&&targetLevel>actorLevel;
}
function denyHigherRankTarget(actor,targetName,res){
  if(!higherRankTargetError(actor,targetName))return false;
  res.status(403).json({error:'صلاحية هذه الرتبة أعلى منك',code:'HIGHER_RANK_PROTECTED'});
  return true;
}

// One-time normalization for legacy profiles created before badge exclusivity was enforced.
// Active rank wins over VIP/gift; otherwise active VIP wins over an older gift.
let badgeExclusivityMigrationChanged=false;
for(const [name,stored] of Object.entries(db.profiles||{})){
  if(!stored||typeof stored!=='object')continue;
  const p=stored,rankActive=!!p.rank&&p.rank!=='none'&&(!p.rankUntil||Number(p.rankUntil)>Date.now());
  const vipActiveNow=Number(p.vipUntil)>Date.now();
  if(rankActive){if(Array.isArray(p.gifts)&&p.gifts.length){p.gifts=[];badgeExclusivityMigrationChanged=true;}if(p.vipUntil){delete p.vipUntil;badgeExclusivityMigrationChanged=true;}}
  else if(vipActiveNow&&Array.isArray(p.gifts)&&p.gifts.length){p.gifts=[];badgeExclusivityMigrationChanged=true;}
}
if(badgeExclusivityMigrationChanged)save();

// A member can have only one visible distinction at a time: gift, VIP, or rank.
// A real rank always wins; gifts/VIP may replace each other, never a rank.
function hasActiveVisualRank(p){return !!p?.rank&&p.rank!=='none'&&(!p.rankUntil||Number(p.rankUntil)>Date.now());}
function denyBadgeForRank(name,p,res){
  if(!hasActiveVisualRank(p))return false;
  let changed=false;
  if(Array.isArray(p.gifts)&&p.gifts.length){p.gifts=[];changed=true;}
  if(p.vipUntil){delete p.vipUntil;changed=true;}
  if(changed){save();io.emit('profile-changed',{name,profile:p});emitState();}
  res.status(409).json({error:'هذا العضو يحمل رتبة حالية؛ لا يمكن استبدالها بهدية أو VIP'});
  return true;
}
function syncActiveAccountRole(name,role,from='rank-assignment'){
  for(const [sid,u] of sessions){if(keyName(u.name)===keyName(name)){u.role=role;if(db.sessions?.[sid])db.sessions[sid].role=role;}}
  for(const [sid,u] of socketUsers){if(keyName(u.name)===keyName(name)){u.role=role;const so=socketBySession(sid);if(so?.data?.user)so.data.user.role=role;so?.emit('role-changed',{name,role,from});}}
  io.emit('member-role-updated',{name,role});
}

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
// Upgrade the legacy admin profile to the new operational default once; the owner still controls rank permissions.
if(!db.rolePermissionMeta.customized.admin && JSON.stringify([...(db.rolePermissions.admin||[])].sort())!==JSON.stringify([...DEFAULT_ROLE_PERMISSIONS.admin].sort())){db.rolePermissions.admin=[...DEFAULT_ROLE_PERMISSIONS.admin];rankPermissionMigrationChanged=true;}
if(rankPermissionMigrationChanged) save();
let legacyRankPermissionsMigrated=false;
for(const rank of RANK_PERMISSION_PROFILES){const def=rankDefinition(rank);if(def&&db.rolePermissionMeta?.customized?.[rank]&&Array.isArray(db.rolePermissions[rank])){const next=[...new Set(['panel_access',...db.rolePermissions[rank].filter(p=>Object.hasOwn(PERMISSION_CATALOG,p))])];if(JSON.stringify(next.slice().sort())!==JSON.stringify((def.permissions||[]).slice().sort())){def.permissions=next;legacyRankPermissionsMigrated=true;}}}
if(legacyRankPermissionsMigrated)save();
function hasPermission(user, permission){
  if(isOwner(user)) return true;
  const manual=db.permissionOverrides&&Array.isArray(db.permissionOverrides[keyName(user?.name||'')])?db.permissionOverrides[keyName(user.name)]:[];
  if(manual.includes(permission)) return true;
  const role=roleOf(user);
  const p=user?.name?profile(user.name):null;
  const rank=p&&p.rank&&(!p.rankUntil||Number(p.rankUntil)>Date.now())?p.rank:null;
  const rankRole=rank&&rankDefinition(rank)?rank:null;
  // The named admin account keeps its admin baseline even if it wears a visual rank.
  // A custom rank may add permissions; it must not silently remove the admin panel tabs.
  if(role==='admin'){
    // Every administrator has the full chat-management permission set. The owner account itself is protected at target level.
    return true;
  }
  if(PROTECTED_ROLE_PERMISSIONS.includes(permission)) return false;
  if(!rankRole&&!['super','banner'].includes(role)) return false;
  if(permission==='panel_access') return true;
  const profileKey=rankRole||role;
  const allowed=rankRole?((rankDefinition(rankRole)?.permissions)||[]):(Array.isArray(db.rolePermissions?.[profileKey])?db.rolePermissions[profileKey]:(DEFAULT_ROLE_PERMISSIONS[role]||[]));
  return allowed.includes(permission);
}
function requirePermission(permission){return (req,res,next)=>requireAuth(req,res,()=>hasPermission(req.user,permission)?next():res.status(403).json({error:'ما عندك صلاحية لهذا الإجراء'}));}
function permissionForAdminPath(req){
 const p=req.path;
 if(p==='/api/admin/data'){
  if(hasPermission(req.user,'panel_access'))return 'panel_access';
  if(['audit_view','stats_view','chat_filter_manage','member_status_manage','users_view'].some(k=>hasPermission(req.user,k)))return 'panel_access';
  return 'panel_access';
 }
 if(p==='/api/admin/audit-logs')return 'audit_view';
 if(p==='/api/admin/chat-filter')return 'chat_filter_manage';
 if(p==='/api/admin/profile/status')return 'member_status_manage';
 if(p==='/api/admin/chat-tools')return req.method==='GET'?'shortcuts_manage':(req.body&&Array.isArray(req.body.smileys)&&req.body.smileys.length?'smileys_manage':'shortcuts_manage');
 if(p==='/api/admin/role')return 'role_assign';
 if(p==='/api/admin/rank')return 'rank_assign';
 if(p==='/api/admin/permissions')return 'permission_manage';
 if(p.startsWith('/api/admin/member-ip/'))return 'member_ip';
 if(p==='/api/admin/reset-likes')return 'reset_likes'; if(p==='/api/admin/unban')return 'ban_room'; if(p==='/api/admin/unmute')return 'mute_room';
 if(p==='/api/admin/grant-like')return 'grant_likes';
 if(p==='/api/admin/broadcast')return 'announcement_post'; if(p.startsWith('/api/admin/announcement/'))return 'announcement_delete';
 if(p.startsWith('/api/admin/message/'))return 'messages_delete';
 if(p==='/api/admin/move-member')return 'room_move';
 if(p.startsWith('/api/admin/wall/control')){const a=String(req.body?.action||'');return a==='stop'?'wall_stop':a==='restart'?'wall_restart':a==='clear'?'wall_clear':a==='delete-user'?'wall_delete_user':'wall_stop';}
 if(p.startsWith('/api/admin/room'))return 'rooms_manage';
 if(p.startsWith('/api/admin/profile/'))return 'profile_edit';
 if(p.startsWith('/api/admin/avatar/'))return 'avatar_delete';
 if(p==='/api/admin/welcome-messages')return 'welcome_manage';
 if(p==='/api/admin/gift-vip')return 'vip';
 if(p==='/api/admin/gift')return 'gifts';
 if(p==='/api/admin/gifts/catalog')return 'gifts';
 if(p==='/api/admin/grant-like')return 'grant_likes';
 return 'panel_access';
}
function requireAdmin(req,res,next){ requireAuth(req,res,()=>{const permission=permissionForAdminPath(req);if(!hasPermission(req.user,permission))return res.status(403).json({error:'ما عندك صلاحية لهذا القسم أو الإجراء'});const write=['POST','PUT','PATCH','DELETE'].includes(req.method);if(write){res.on('finish',()=>{if(res.statusCode<200||res.statusCode>=300)return;try{db.adminAuditLogs=db.adminAuditLogs||[];db.adminAuditLogs.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),at:Date.now(),actor:String(req.user?.name||'إدارة').slice(0,32),method:req.method,path:String(req.path||'').slice(0,120),status:res.statusCode});db.adminAuditLogs=db.adminAuditLogs.slice(0,500);save();}catch(e){console.error('Admin audit log save failed:',e.message)}});}return next();}); }
// Presence visibility is enforced per viewer on the server. A ghost is visible only
// to its own session; hidden accounts are visible to staff ranks and their own session.
function canSeePresence(viewer,target){
  if(!target)return false;
  if(viewer&&keyName(viewer.name)===keyName(target.name))return true;
  const sameAccountSessions=[...sessions.entries()].filter(([sid,u])=>socketUsers.has(sid)&&keyName(u.name)===keyName(target.name));
  if(sameAccountSessions.some(([,u])=>u.ghost))return false;
  if(target.ghost)return false;
  if(target.hidden)return !!viewer&&isStaff(viewer);
  return true;
}
function canSeePresenceNotice(viewer,notice){
  if(!notice||notice.presenceVisibility!=='staff')return true;
  return !!viewer&&(keyName(viewer.name)===keyName(notice.from)||isStaff(viewer));
}
function visibleRooms(viewer){return db.rooms.map(r=>{const {passwordHash,...safe}=r;return {...safe,locked:!!passwordHash,online:onlineInRoom(r.id,viewer)};});}
function hasInvisibleActiveSession(name,viewer){
  const active=[...sessions.entries()].filter(([sid,u])=>socketUsers.has(sid)&&keyName(u.name)===keyName(name));
  return active.length>0&&!active.some(([,u])=>canSeePresence(viewer,u));
}
function emitState(){
  for(const so of io.sockets.sockets.values()){
    const viewer=sessionUser(so.data?.sid);
    if(!viewer)continue;
    so.emit('live-state',{online:getOnlineUsers(viewer),rooms:visibleRooms(viewer)});
  }
}
// socketUsers is keyed by the login session id, not Socket.IO's socket.id.
function socketBySession(sid){ for(const s of io.sockets.sockets.values()){ if(s.data?.sid===sid) return s; } return null; }
function emitToUser(name,event,payload){
  const target=keyName(name);
  for(const [sid,u] of socketUsers){
    if(keyName(u.name)===target) socketBySession(sid)?.emit(event,payload);
  }
}

function getOnlineUsers(viewer=null){
  const arr=[];
  for(const [sid,u] of sessions){
    if(!socketUsers.has(sid)||!canSeePresence(viewer,u))continue;
    const role=roleOf(u),so=socketBySession(sid);
    arr.push({...u,role,owner:role==='owner',admin:['owner','admin'].includes(role),staff:['owner','admin','banner','super'].includes(role),panelAccess:role==='owner'||hasPermission(u,'panel_access'),room:socketUsers.get(sid)?.room||u.room||'',countryCode:(so?.handshake?.headers?.['cf-ipcountry']||so?.handshake?.headers?.['x-country-code']||'').toUpperCase(),displayName:displayName(u.name),likes:userLikes(u),level:level(userLikes(u)),profile:profile(u.name)});
  }
  const seen=new Set(); return arr.filter(x=>{const k=keyName(x.name);if(seen.has(k))return false;seen.add(k);return true;});
}
function onlineInRoom(room,viewer=null){
  const set=roomSockets.get(room);if(!set)return 0;
  return [...set].filter(sid=>socketUsers.has(sid)&&canSeePresence(viewer,sessions.get(sid))).length;
}
function emitPresenceToRoom(room,notice){
  for(const sid of (roomSockets.get(room)||[])){
    const viewer=sessionUser(sid);
    if(canSeePresenceNotice(viewer,notice))socketBySession(sid)?.emit('message',notice);
  }
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
function globalBanStatus(name,ip,now=Date.now()){
  const n=keyName(name); let until=0,changed=false;
  const nameBan=(db.globalBans||{})[n];
  if(nameBan){const expiry=Number(nameBan.until)||0;if(expiry>now)until=Math.max(until,expiry);else{delete db.globalBans[n];changed=true;}}
  const ipKey=normalizeIp(ip),ipBan=ipKey?(db.globalIpBans||{})[ipKey]:null;
  if(ipBan){const expiry=Number(ipBan.until)||0;if(expiry>now)until=Math.max(until,expiry);else{delete db.globalIpBans[ipKey];changed=true;}}
  if(changed)save();
  if(!until)return null;
  const remainingMs=Math.max(0,until-now),totalSeconds=Math.ceil(remainingMs/1000),minutes=Math.floor(totalSeconds/60),seconds=totalSeconds%60;
  const remainingText=minutes?`${minutes} دقيقة و${seconds} ثانية`:`${seconds} ثانية`;
  return {until,remainingMs,remainingSeconds:totalSeconds,remainingText};
}
function globalBanResponse(res,name,ip){const ban=globalBanStatus(name,ip);if(!ban)return false;return res.status(403).json({error:`أنت محظور من الدردشة. الوقت المتبقي: ${ban.remainingText}. حاول الدخول بعد انتهاء الحظر.`,code:'GLOBAL_BAN_ACTIVE',...ban});}
function globalBanned(name,ip){return !!globalBanStatus(name,ip);}
function nameTaken(name){const n=keyName(name);if(!n)return false;return n==='owner'||(!!process.env.OWNER_NAME&&n===keyName(process.env.OWNER_NAME))||Object.keys(db.users||{}).some(x=>keyName(x)===n)||Object.keys(db.guests||{}).some(x=>keyName(x)===n);} 
function removeFromChat(name, banned){ const n=keyName(name); for(const so of io.sockets.sockets.values()){ const sid2=so.data?.sid, u2=so.data?.user||socketUsers.get(sid2); if(!u2||keyName(u2.name)!==n)continue; const oldRoom=u2.room||''; if(oldRoom){so.leave(oldRoom);roomSockets.get(oldRoom)?.delete(sid2);} if(so.data?.user)so.data.user.room=''; if(socketUsers.get(sid2))socketUsers.get(sid2).room=''; so.emit('kicked',{global:true,banned:!!banned,room:oldRoom,...(banned?(globalBanStatus(n,'')||{}):{})}); if(banned)so.disconnect(true); } emitState(); }
function safeMessage(m){ return {...m, text:String(m.text||'').slice(0,2000)}; }
let messageSaveTimer=null;
function scheduleMessageSave(delay=350){
  if(messageSaveTimer)return;
  // Batch bursts of chat traffic into one durable database write instead of
  // serializing and replacing the full JSON database for every single message.
  messageSaveTimer=setTimeout(()=>{
    messageSaveTimer=null;
    try{save();}catch(error){console.error('Batched chat-message save failed:',error.message);scheduleMessageSave(3000);}
  },delay);
  messageSaveTimer.unref?.();
}
function addMessage(m){
  db.messages.push(m);
  if(db.messages.length>1000)db.messages.splice(0,db.messages.length-1000);
  scheduleMessageSave();
}
function notify(name,item){
  name=accountKey(name); if(!db.notifications[name])db.notifications[name]=[];
  db.notifications[name].unshift({...item,id:crypto.randomUUID(),at:Date.now()});
  db.notifications[name]=db.notifications[name].slice(0,100); save();
}

// Never trust the client-supplied filename/extension: files are served from /uploads.
// Derive the stored extension from a strict MIME allow-list so an uploaded file
// cannot be saved as .html/.svg merely by choosing a dangerous original name.
const SAFE_UPLOAD_TYPES = Object.freeze({
  'image/jpeg':'.jpg', 'image/png':'.png', 'image/gif':'.gif', 'image/webp':'.webp',
  'image/avif':'.avif', 'image/bmp':'.bmp',
  'video/mp4':'.mp4', 'video/webm':'.webm', 'video/ogg':'.ogv',
  'audio/mpeg':'.mp3', 'audio/mp3':'.mp3', 'audio/ogg':'.ogg',
  'audio/wav':'.wav', 'audio/x-wav':'.wav', 'audio/mp4':'.m4a',
  'audio/aac':'.aac', 'audio/webm':'.weba'
});
const uploadStorage = multer.diskStorage({
  destination:UP_DIR,
  filename:(req,file,cb)=>cb(null,Date.now()+'-'+crypto.randomBytes(8).toString('hex')+(SAFE_UPLOAD_TYPES[file.mimetype]||'.bin'))
});
function uploadFilter(req,file,cb){
  const allowed=Object.hasOwn(SAFE_UPLOAD_TYPES,String(file.mimetype||'').toLowerCase());
  cb(allowed?null:new Error('نوع الملف غير مسموح'),allowed);
}
const upload = multer({storage:uploadStorage,limits:{fileSize:50*1024*1024,files:1,fields:12,fieldSize:64*1024},fileFilter:uploadFilter});
const uploadImage = multer({storage:uploadStorage,limits:{fileSize:8*1024*1024,files:1,fields:8,fieldSize:32*1024},fileFilter:(req,file,cb)=>{
  const allowed=String(file.mimetype||'').toLowerCase().startsWith('image/') && Object.hasOwn(SAFE_UPLOAD_TYPES,String(file.mimetype||'').toLowerCase());
  cb(allowed?null:new Error('اختر صورة بصيغة مدعومة'),allowed);
}});
const uploadSmallImage = multer({storage:uploadStorage,limits:{fileSize:1024*1024,files:1,fields:8,fieldSize:32*1024},fileFilter:(req,file,cb)=>{
  const allowed=['image/gif','image/png','image/jpeg','image/webp'].includes(String(file.mimetype||'').toLowerCase());
  cb(allowed?null:new Error('اختر صورة بصيغة مدعومة'),allowed);
}});
function removeUploadedFile(file){if(file?.path){try{fs.unlinkSync(file.path)}catch(e){if(e.code!=='ENOENT')console.warn('Upload cleanup failed:',e.message)}}}

// MIME headers are supplied by the client, so verify the file's actual container
// signature before the file can be referenced by a profile, room, wall or message.
function uploadedSignatureMatches(file, category='any') {
  if (!file?.path) return false;
  let fd;
  try {
    fd = fs.openSync(file.path, 'r');
    const head = Buffer.alloc(32);
    const bytes = fs.readSync(fd, head, 0, head.length, 0);
    const b = head.subarray(0, bytes);
    const mime = String(file.mimetype || '').toLowerCase();
    const ascii = (offset, value) => b.length >= offset + value.length && b.toString('ascii', offset, offset + value.length) === value;
    const isFtyp = () => ascii(4, 'ftyp') && b.length >= 12;
    let actual = '';
    if (b.length >= 3 && b[0]===0xff && b[1]===0xd8 && b[2]===0xff) actual='image';
    else if (b.length >= 8 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) actual='image';
    else if (ascii(0,'GIF87a') || ascii(0,'GIF89a') || ascii(0,'BM')) actual='image';
    else if (ascii(0,'RIFF') && ascii(8,'WEBP')) actual='image';
    else if (isFtyp() && /^(avif|avis)$/.test(b.toString('ascii',8,12))) actual='image';
    else if (isFtyp()) actual='mp4';
    else if (b.length >= 4 && b.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))) actual='webm';
    else if (ascii(0,'OggS')) actual='ogg';
    else if (ascii(0,'RIFF') && ascii(8,'WAVE')) actual='audio';
    else if (ascii(0,'ID3') || (b.length >= 2 && b[0]===0xff && (b[1]&0xe0)===0xe0)) actual='audio';
    else if (b.length >= 2 && b[0]===0xff && (b[1]&0xf6)===0xf0) actual='audio';
    if (category === 'image') return actual === 'image' && mime.startsWith('image/');
    if (category === 'media') {
      if (mime.startsWith('image/')) return actual === 'image';
      if (mime.startsWith('video/')) return (mime==='video/mp4' && actual==='mp4') || (mime==='video/webm' && actual==='webm') || (mime==='video/ogg' && actual==='ogg');
      if (mime.startsWith('audio/')) return (['audio/mpeg','audio/mp3','audio/aac'].includes(mime) && actual==='audio') || (['audio/ogg'].includes(mime) && actual==='ogg') || (['audio/wav','audio/x-wav'].includes(mime) && actual==='audio') || (mime==='audio/mp4' && actual==='mp4') || (mime==='audio/webm' && actual==='webm');
      return false;
    }
    return actual === 'image';
  } catch (error) {
    console.warn('Uploaded file signature check failed:', error.message);
    return false;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
  }
}
function validateUploadedContent(category='any') {
  return (req,res,next) => {
    if (!req.file) return next();
    if (!uploadedSignatureMatches(req.file, category)) {
      removeUploadedFile(req.file);
      return res.status(415).json({error:category==='media'?'محتوى الملف لا يطابق نوع الوسائط المعلن':'محتوى الملف ليس صورة صالحة'});
    }
    next();
  };
}

app.post('/api/register',(req,res)=>{
  const n=cleanName(req.body.name), p=String(req.body.password||'');
  if(n && globalBanResponse(res,n,requestClientIp(req)))return;
  if(!n||!p)return res.status(400).json({error:'الاسم وكلمة المرور مطلوبان'});
  const ownerRequested = keyName(n)==='owner' || (!!process.env.OWNER_NAME && keyName(n)===keyName(process.env.OWNER_NAME));
  if(ownerRequested){
    const token=String(req.body.bootstrapToken||'');
    const ownerExists=Object.keys(db.users).some(x=>keyName(x)==='owner' || (!!process.env.OWNER_NAME && keyName(x)===keyName(process.env.OWNER_NAME)));
    if(ownerExists || db.ownerSetupCompleted)return res.status(409).json({error:'حساب المالك موجود مسبقاً'});
    if(!process.env.OWNER_BOOTSTRAP_PASSWORD || token.length<24 || token!==process.env.OWNER_BOOTSTRAP_PASSWORD)return res.status(403).json({error:'رمز تهيئة المالك غير صحيح'});
    if(p.length<12)return res.status(400).json({error:'كلمة مرور المالك يجب أن تكون 12 حرفاً على الأقل'});
  } else if(p.length<3) return res.status(400).json({error:'كلمة المرور 3 أحرف على الأقل'});
  if(nameTaken(n)&&!ownerRequested)return res.status(409).json({error:'هذا الاسم موجود'});
  db.users[n]={hash:bcrypt.hashSync(p,12),likes:keyName(n)==='admin'?999999:0,created:Date.now()};
  if(ownerRequested){ db.ownerSetupCompleted=true; }
  profile(n); const sid=makeSession(n,'member'); save(); res.json({sid,user:sessionUser(sid)});
});
app.post('/api/login',(req,res)=>{
  const n=cleanName(req.body.name), p=String(req.body.password||'');
  if(n && globalBanResponse(res,n,requestClientIp(req)))return;
  const u=db.users[n] || Object.entries(db.users).find(([k])=>keyName(k)===keyName(n))?.[1];
  if(!u || !bcrypt.compareSync(p,u.hash))return res.status(401).json({error:'الاسم أو الباسورد غير صحيح'});
  const real=Object.keys(db.users).find(k=>keyName(k)===keyName(n))||n; const sid=makeSession(real,'member'); res.json({sid,user:sessionUser(sid)});
});
app.post('/api/login-privileged',(req,res)=>{
  const n=cleanName(req.body.name),p=String(req.body.password||''),mode=String(req.body.mode||'');
  if(!['hidden','ghost'].includes(mode))return res.status(400).json({error:'نوع الدخول غير صحيح'});
  if(n&&globalBanResponse(res,n,requestClientIp(req)))return;
  const u=db.users[n]||Object.entries(db.users).find(([k])=>keyName(k)===keyName(n))?.[1];
  if(!u||!bcrypt.compareSync(p,u.hash))return res.status(401).json({error:'الاسم أو الباسورد غير صحيح'});
  const real=Object.keys(db.users).find(k=>keyName(k)===keyName(n))||n;
  const account={...u,name:real};
  if(mode==='ghost'&&!isOwner(account)&&!(isAdmin(account)&&hasPermission(account,'panel_access')))return res.status(403).json({error:'دخول الشبح مخصص لصاحب الموقع أو إداري مصرّح له'});
  if(mode==='hidden'&&!isStaff(account)&&!hasPermission(account,'panel_access'))return res.status(403).json({error:'هذا الحساب لا يملك صلاحية الدخول المخفي'});
  const sid=makeSession(real,'member',{hidden:true,ghost:mode==='ghost'});
  return res.json({sid,user:sessionUser(sid)});
});
app.post('/api/guest',(req,res)=>{
  const n=cleanName(req.body.name); if(!n)return res.status(400).json({error:'اكتب اسم الزائر'});
  if(globalBanResponse(res,n,requestClientIp(req)))return;
  if(nameTaken(n))return res.status(409).json({error:'هذا الاسم موجود'});
  db.guests[n]={likes:0,created:Date.now()}; const gp=profile(n); gp.status='(غير مسجل)'; const sid=makeSession(n,'guest'); save(); res.json({sid,user:sessionUser(sid)});
});
app.post('/api/logout',requireAuth,(req,res)=>{
  const sid=req.get('x-session'),u=sessions.get(sid),name=u?.name||req.user?.name;
  const previousMessages=db.messages;
  const previousGuest=u?.type==='guest'?db.guests[u.name]:undefined;
  const previousProfile=u?.type==='guest'?db.profiles[u.name]:undefined;
  const hadWelcome=welcomeSentSessions.has(sid);
  if(name)db.messages=(db.messages||[]).filter(m=>!(m?.type==='presence'&&keyName(m.from)===keyName(name)));
  if(u?.type==='guest'){delete db.guests[u.name];delete db.profiles[u.name];}
  sessions.delete(sid);welcomeSentSessions.delete(sid);delete db.sessions[sid];
  try{save()}catch(e){if(previousMessages!==undefined)db.messages=previousMessages;if(u){sessions.set(sid,u);db.sessions[sid]=u;if(u.type==='guest'){if(previousGuest!==undefined)db.guests[u.name]=previousGuest;if(previousProfile!==undefined)db.profiles[u.name]=previousProfile;}if(hadWelcome)welcomeSentSessions.add(sid);}console.error('Logout persistence failed:',e.message);return res.status(500).json({error:'تعذر حفظ تسجيل الخروج، حاول مرة أخرى'});}
  for(const so of [...io.sockets.sockets.values()])if(so.data?.sid===sid)so.disconnect(true);
  if(name)schedulePrivateConversationCleanup(name);
  res.json({ok:true});
});

app.get('/api/rtc-config',requireAuth,(req,res)=>{const iceServers=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}];const turnUrls=String(process.env.TURN_URLS||process.env.TURN_URL||'').split(',').map(x=>x.trim()).filter(Boolean);const turnUsername=String(process.env.TURN_USERNAME||'').trim(),turnCredential=String(process.env.TURN_CREDENTIAL||'');if(turnUrls.length&&turnUsername&&turnCredential)iceServers.push({urls:turnUrls,username:turnUsername,credential:turnCredential});res.set('Cache-Control','no-store');res.json({iceServers,turnConfigured:turnUrls.length>0&&!!turnUsername&&!!turnCredential});});
app.get('/api/public-online',(req,res)=>{ const users=getOnlineUsers().map(u=>({name:u.name,type:u.type,displayName:u.displayName,avatar:u.profile?.avatar||'',status:u.profile?.status||defaultStatus(u.name),rank:u.profile?.rank||'',role:u.role||'',vip:!!u.vip})); res.set('Cache-Control','no-store'); res.json({users}); });
app.get('/api/state',requireAuth,(req,res)=>{
  const u=req.user;
  // A guest starts each fresh app entry with the default status; registered members keep their saved status.
  if(u.type==='guest' && req.query.entry==='1'){ const p=profile(u.name); p.status='(غير مسجل)'; save(); }
  const likes=userLikes(u); const rooms=visibleRooms(u);
  res.json({user:{...u,likes,level:level(likes),admin:isAdmin(u),owner:isOwner(u),staff:isStaff(u),role:roleOf(u),vip:vipActive(u.name),profile:profile(u.name),notice:canNotice(u),media:canMedia(u)}, rooms, online:getOnlineUsers(u).map(x=>({name:x.name,type:x.type,likes:x.likes,level:x.level,profile:x.profile,online:true,role:x.role||roleOf(x),admin:isAdmin(x),vip:vipActive(x.name)}))});
});
app.get('/api/history',requireAuth,(req,res)=>{ const room=String(req.query.room||'public'),started=Number(req.user.created)||0;res.set('Cache-Control','no-store');res.json(roomHistoryWithAnnouncements(room,req.user,started)); });
app.get('/api/members',requireAuth,(req,res)=>{const online=new Map(getOnlineUsers(req.user).map(x=>[keyName(x.name),x]));const rows=[];const registeredKeys=new Set(Object.keys(db.users).map(keyName));const seenMemberKeys=new Set();for(const [name,u] of Object.entries(db.users)){const normalized=keyName(name);if(hasInvisibleActiveSession(name,req.user))continue;if(seenMemberKeys.has(normalized))continue;seenMemberKeys.add(normalized);const x=online.get(keyName(name));rows.push({name,type:'member',likes:Number(u.likes)||0,points:Number(u.points)||0,level:level(Number(u.likes)||0),profile:profile(name),online:!!x,room:x?.room||'',countryCode:x?.countryCode||'',role:u.role||(keyName(name)==='owner' || (!!process.env.OWNER_NAME && keyName(name)===keyName(process.env.OWNER_NAME))?'owner':(keyName(name)==='admin'?'admin':'member')),vip:vipActive(name)});}for(const [name,g] of Object.entries(db.guests)){const normalized=keyName(name);if(registeredKeys.has(normalized)||seenMemberKeys.has(normalized)||hasInvisibleActiveSession(name,req.user))continue;const x=online.get(normalized);if(x){seenMemberKeys.add(normalized);rows.push({name,type:'guest',likes:Number(g.likes)||0,points:Number(g.points)||0,level:level(Number(g.likes)||0),profile:profile(name),online:true,room:x?.room||'',countryCode:x?.countryCode||'',ignoredByMe:(db.ignored?.[keyName(req.user.name)]||[]).some(x=>keyName(x)===normalized),role:g.role||'member',vip:false});}}const rank=x=>{if(x.role==='owner')return 0;if(x.role==='admin')return 1;const r=x.profile?.rank||'';const rankOrder={'crown-gold':2,'crown-silver':3,'super-black':4,'super-white':5,'super-red':6,'admin-shield':1};if(rankOrder[r]!==undefined)return rankOrder[r];if(x.role==='banner')return 2;if(x.role==='super')return 4;if(x.vip)return 7;if((x.profile?.gifts||[]).length)return 8;if(x.type==='guest')return 10;return 9;};rows.sort((a,b)=>rank(a)-rank(b)||b.likes-a.likes||a.name.localeCompare(b.name,'ar'));res.json(rows);});
app.get('/api/wall/status',requireAuth,(req,res)=>{res.set('Cache-Control','no-store');res.json({enabled:db.wallEnabled!==false});});
app.get('/api/wall',requireAuth,(req,res)=>{const started=Number(req.user.created)||0;res.set('Cache-Control','no-store');res.json(db.wall.filter(x=>Number(x.at||0)>=started).slice(-100).reverse());});
app.post('/api/wall',requireAuth,(req,res)=>{if(db.wallEnabled===false)return res.status(403).json({error:'الجدار متوقف مؤقتاً من الإدارة'});const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'اكتب منشورك'});const previous=db.wall.slice();const p={id:crypto.randomUUID(),from:req.user.name,text:text.slice(0,2000),media:null,at:Date.now(),likes:0};db.wall.push(p);db.wall=db.wall.slice(-300);try{save()}catch(e){db.wall=previous;console.error('Wall post save failed:',e.message);return res.status(500).json({error:'تعذر حفظ المنشور'});}io.emit('wall-new',p);res.json(p);});
app.post('/api/wall/like',requireAuth,(req,res)=>{
  const p=db.wall.find(x=>x.id===req.body.id);
  if(!p)return res.status(404).json({error:'المنشور غير موجود'});
  // A member may like a given wall post once; repeated requests are idempotent.
  const liker=keyName(req.user.name);
  p.likedBy=Array.isArray(p.likedBy)?p.likedBy:[];
  if(p.likedBy.some(name=>keyName(name)===liker))return res.json({ok:true,liked:false,likes:Number(p.likes)||0});
  p.likedBy.push(req.user.name);
  p.likes=Math.max(0,Number(p.likes)||0)+1;
  try{save()}catch(e){p.likedBy=p.likedBy.filter(name=>keyName(name)!==liker);p.likes=Math.max(0,(Number(p.likes)||1)-1);return res.status(500).json({error:'تعذر حفظ الإعجاب'});}
  io.emit('wall-like',{id:p.id,likes:p.likes});
  res.json({ok:true,liked:true,likes:p.likes});
});
app.post('/api/admin/wall/control',requireAdmin,(req,res)=>{const action=String(req.body.action||'');if(action==='stop'||action==='restart'){db.wallEnabled=action==='restart';save();io.emit('wall-state',{enabled:db.wallEnabled});return res.json({ok:true,enabled:db.wallEnabled});}if(action==='clear'){const before=db.wall.length;if(!isOwner(req.user)){db.wall=db.wall.filter(p=>isOwnerName(p.from)||(isOwner({name:p.from,role:(getUser(p.from)||getGuest(p.from)||{}).role})));}else db.wall=[];const removed=before-db.wall.length;save();io.emit('wall-cleared',{removed});return res.json({ok:true,removed});}if(action==='delete-user'){const name=cleanName(req.body.name||'');if(!name)return res.status(400).json({error:'حدد اسم العضو'});if(denyHigherRankTarget(req.user,name,res))return;if((isOwnerName(name)||isOwner({name,role:(getUser(name)||getGuest(name)||{}).role}))&&!isOwner(req.user))return res.status(403).json({error:'منشورات صاحب الموقع محمية'});const before=db.wall.length;db.wall=db.wall.filter(p=>keyName(p.from)!==keyName(name));const removed=before-db.wall.length;save();io.emit('wall-user-deleted',{name,removed});return res.json({ok:true,removed,name});}return res.status(400).json({error:'إجراء الجدار غير معروف'});});
app.post('/api/notify',requireAuth,(req,res)=>{if(!isOwner(req.user)&&!canNotice(req.user))return res.status(403).json({error:'التنبيهات تفتح عند 400 إعجاب'});const requested=cleanName(req.body.to),to=accountKey(requested);if(!getUser(to)&&!getGuest(to))return res.status(404).json({error:'العضو غير موجود'});const p=profile(to);if(p.notificationsOpen===false&&!isOwner(req.user))return res.status(403).json({error:'هذا الشخص أغلق التنبيه'});const text=String(req.body.text||'').trim().slice(0,500);if(!text)return res.status(400).json({error:'اكتب التنبيه'});notify(to,{type:'notice',from:req.user.name,text});emitToUser(to,'notification',{from:req.user.name,text});res.json({ok:true});});
app.get('/api/private/history',requireAuth,(req,res)=>{const to=cleanName(req.query.to||'');if(!to)return res.status(400).json({error:'اختر عضوًا'});const meKey=keyName(req.user.name),toKey=keyName(to);const items=(db.privateMessages||[]).filter(m=>((keyName(m.from)===meKey&&keyName(m.to)===toKey)||(keyName(m.from)===toKey&&keyName(m.to)===meKey))).slice(-200).map(m=>{const acct=getUser(m.from)||getGuest(m.from);const sender={name:m.from,type:getUser(m.from)?'member':'guest'};return {...m,fromDisplayName:m.fromDisplayName||displayName(m.from),profile:profile(m.from),role:acct?roleOf(sender):'member',vip:vipActive(m.from),likes:userLikes(sender)};});res.set('Cache-Control','no-store');res.json(items);});
app.post('/api/private/read',requireAuth,(req,res)=>{const from=keyName(req.body.from||'');if(!from)return res.status(400).json({error:'المحادثة غير محددة'});db.privateRead=db.privateRead||{};db.privateRead[keyName(req.user.name)]=db.privateRead[keyName(req.user.name)]||{};db.privateRead[keyName(req.user.name)][from]=Date.now();res.json({ok:true});});
app.post('/api/private/read-all',requireAuth,(req,res)=>{const me=keyName(req.user.name);db.privateRead=db.privateRead||{};db.privateRead[me]=db.privateRead[me]||{};for(const m of (db.privateMessages||[])){if(keyName(m.to)!==me)continue;const from=keyName(m.from);const at=Number(m.at)||0;if(at>Number(db.privateRead[me][from]||0))db.privateRead[me][from]=at;}res.json({ok:true});});
app.post('/api/private/hide',requireAuth,(req,res)=>{
  const other=keyName(req.body.name||''),me=keyName(req.user.name);
  if(!other||other===me)return res.status(400).json({error:'اسم غير صحيح'});
  const previousMessages=db.privateMessages,previousHidden=db.privateHidden?.[me],previousReadMe=db.privateRead?.[me]?.[other],previousReadOther=db.privateRead?.[other]?.[me];
  const removed=(db.privateMessages||[]).filter(m=>(keyName(m.from)===me&&keyName(m.to)===other)||(keyName(m.from)===other&&keyName(m.to)===me));
  db.privateHidden=db.privateHidden||{};db.privateHidden[me]=Array.isArray(db.privateHidden[me])?db.privateHidden[me]:[];
  if(!db.privateHidden[me].includes(other))db.privateHidden[me].push(other);
  db.privateMessages=(db.privateMessages||[]).filter(m=>!((keyName(m.from)===me&&keyName(m.to)===other)||(keyName(m.from)===other&&keyName(m.to)===me)));
  if(db.privateRead?.[me])delete db.privateRead[me][other];if(db.privateRead?.[other])delete db.privateRead[other][me];
  try{save()}catch(e){if(previousMessages===undefined)delete db.privateMessages;else db.privateMessages=previousMessages;if(previousHidden===undefined)delete db.privateHidden[me];else db.privateHidden[me]=previousHidden;if(db.privateRead?.[me]&&previousReadMe!==undefined)db.privateRead[me][other]=previousReadMe;if(db.privateRead?.[other]&&previousReadOther!==undefined)db.privateRead[other][me]=previousReadOther;console.error('Private conversation hide failed:',e.message);return res.status(500).json({error:'تعذر حفظ إنهاء المحادثة'});}
  for(const message of removed){const url=String(message?.media?.url||'');const prefix='/api/private/media/';if(!url.startsWith(prefix))continue;const filename=url.slice(prefix.length);if(!/^[a-zA-Z0-9._-]{1,180}$/.test(filename))continue;const stillUsed=(db.privateMessages||[]).some(m=>m?.media?.url===url);if(!stillUsed){try{fs.unlinkSync(path.join(PRIVATE_MEDIA_DIR,filename))}catch(e){if(e.code!=='ENOENT')console.warn('Private media cleanup failed:',e.message)}}}
  res.json({ok:true});
});
app.get('/api/private/contacts',requireAuth,(req,res)=>{const meName=req.user.name,meKey=keyName(meName),hidden=new Set((db.privateHidden?.[meKey]||[]).map(keyName)),read=db.privateRead?.[meKey]||{},map=new Map();for(const m of (db.privateMessages||[])){const from=keyName(m.from),to=keyName(m.to),other=from===meKey?m.to:to===meKey?m.from:null;if(!other||hidden.has(keyName(other)))continue;const k=keyName(other),old=map.get(k)||{name:other,last:'',at:0,unread:0};if(Number(m.at)>=old.at){old.name=other;old.last=m.text||'';old.at=Number(m.at)||0;}if(to===meKey&&Number(m.at)>Number(read[k]||0))old.unread++;map.set(k,old);}const rows=[...map.values()].sort((a,b)=>b.at-a.at).map(x=>({name:x.name,profile:profile(x.name),online:[...socketUsers.entries()].some(([sid,u])=>keyName(u.name)===keyName(x.name)&&canSeePresence(req.user,sessions.get(sid))),last:x.last,at:x.at,unread:x.unread}));res.json(rows);});
app.get('/api/notifications',requireAuth,(req,res)=>{const started=Number(req.user.created)||0;res.set('Cache-Control','no-store');res.json((db.notifications[accountKey(req.user.name)]||db.notifications[req.user.name]||[]).filter(x=>Number(x.at||0)>=started).slice(0,50));});
app.post('/api/notifications/read',requireAuth,(req,res)=>{db.notifications[accountKey(req.user.name)]=[];save();res.json({ok:true});});

app.post('/api/message',requireAuth,(req,res)=>{
  const u=req.user, room=String(req.body.room||'public'), text=String(req.body.text||'').trim().slice(0,2000);
  if(!text)return res.status(400).json({error:'الرسالة فارغة'});
  const sessionId=String(req.get('x-session')||'');
  const joinedSocket=[...io.sockets.sockets.values()].find(so=>so.data?.sid===sessionId&&so.data?.user?.room===room&&so.rooms.has(room));
  if(!joinedSocket)return res.status(403).json({error:'يجب دخول الغرفة أولاً قبل إرسال الرسائل'});
  if(blockedChatTerm(text))return res.status(403).json({error:'رسالتك تحتوي على كلمة غير مسموح بها'});
  if(roomBanned(u.name,room))return res.status(403).json({error:'أنت محظور من هذه الغرفة'});
  if(roomMuted(u.name,room))return res.status(403).json({error:'أنت مكتوم في هذه الغرفة'});
  const r=db.rooms.find(x=>x.id===room); if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});
  const m={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:u.type,text,at:Date.now(),likes:userLikes(u),profile:profile(u.name)};try{addMessage(m)}catch(e){console.error('HTTP room message save failed:',e.message);return res.status(500).json({error:'تعذر حفظ الرسالة'});}io.to(room).emit('message',m);res.json({ok:true,message:m});
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
app.post('/api/admin/grant-like',requireAdmin,(req,res)=>{const n=accountKey(req.body.name),amount=Math.max(1,Math.min(100000,Number(req.body.amount)||1)),u=getUser(n),g=getGuest(n);if(denyHigherRankTarget(req.user,n,res))return;if(!u&&!g)return res.status(404).json({error:'المستخدم غير موجود'});if((isOwnerName(n)||isOwner({name:n,role:(u||g).role}))&&!(isOwner(req.user)&&keyName(req.user.name)===keyName(n)))return res.status(403).json({error:'صاحب الموقع محمي من تعديل اللايكات'});if(u)u.likes=Number(u.likes||0)+amount;else g.likes=Number(g.likes||0)+amount;const likes=Number((u||g).likes||0);save();io.emit('likes-changed',{name:n,likes,level:level(likes)});emitToUser(n,'admin-action-notice',{title:'❤️ لايكات جديدة',text:'حصلت على '+amount+' لايك من '+req.user.name+' (admin)'});res.json({ok:true,likes});});
app.post('/api/admin/reset-likes',(req,res,next)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'reset_likes'))return res.status(403).json({error:'ما عندك صلاحية تصفير اللايكات'});const n=accountKey(req.body.name),u=getUser(n),g=getGuest(n);if(denyHigherRankTarget(req.user,n,res))return;if(!u&&!g)return res.status(404).json({error:'المستخدم غير موجود'});if(isOwner({name:n,role:(u||g).role})&&!(isOwner(req.user)&&keyName(req.user.name)===keyName(n)))return res.status(403).json({error:'لا يمكن تعديل لايكات صاحب الموقع'});if(u)u.likes=0;else g.likes=0;save();io.emit('likes-changed',{name:n,likes:0,level:1});res.json({ok:true});});});
app.post('/api/admin/role',(req,res)=>{requireAuth(req,res,()=>{const actor=req.user,n=accountKey(req.body.name),role=String(req.body.role||'member');if(!hasPermission(actor,'role_assign'))return res.status(403).json({error:'ما عندك صلاحية تغيير الرتب'});const target=getUser(n)||getGuest(n);if(denyHigherRankTarget(actor,n,res))return;if(!target||isOwnerName(n)||roleOf({name:n,role:target.role})==='owner')return res.status(400).json({error:'العضو غير صحيح أو أن حساب المالك محمي'});if(!['member','super','admin','banner'].includes(role))return res.status(400).json({error:'الدور غير صحيح'});const previousRole=target.role,sessionSnapshots=[];target.role=role;for(const [sid2,x] of sessions){if(keyName(x.name)===keyName(n)){sessionSnapshots.push([sid2,x.role,db.sessions[sid2]?.role]);x.role=role;db.sessions[sid2]=x;}}try{save();}catch(error){target.role=previousRole;for(const [sid2,oldRole,storedRole] of sessionSnapshots){const x=sessions.get(sid2);if(x)x.role=oldRole;if(db.sessions[sid2])db.sessions[sid2].role=storedRole??oldRole;}console.error('Role update persistence failed:',error.message);return res.status(500).json({error:'تعذر حفظ تغيير المنصب؛ لم يتم تطبيق التغيير'});}for(const [sid2,x] of sessions){if(keyName(x.name)===keyName(n)){socketBySession(sid2)?.emit('role-changed',{name:n,role,from:actor.name});if(['admin','super','banner'].includes(role))socketBySession(sid2)?.emit('rank-granted',{id:crypto.randomUUID(),name:n,rank:role,rankName:({'super':'السوبر','banner':'البنر','admin':'الإداري'}[role]),durationText:'دائمة',from:actor.name,fromDisplayName:displayName(actor.name),fromProfile:{...profile(actor.name)},fromRole:roleOf(actor)});else socketBySession(sid2)?.emit('admin-action-notice',{title:'تغيير المنصب',text:'قام '+actor.name+' بتغيير منصبك إلى عضو'});}}for(const [sid2,x] of socketUsers){if(keyName(x.name)===keyName(n)){x.role=role;const so=socketBySession(sid2);if(so?.data?.user)so.data.user.role=role;so?.emit('role-changed',{name:n,role,from:actor.name});}}emitState();res.json({ok:true,role,type:getUser(n)?'member':'guest',panelAccess:['admin','super','banner'].includes(role)});});});
app.post('/api/admin/gift',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'gifts'))return res.status(403).json({error:'ما عندك صلاحية إرسال الهدايا'});const n=accountKey(req.body.name);if(denyHigherRankTarget(req.user,n,res))return;const gift=cleanName(req.body.gift||'هدية');if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'المستخدم غير موجود'});if(isOwnerName(n))return res.status(403).json({error:'حساب صاحب الموقع محمي من الهدايا الإدارية'});const giftId=String(req.body.giftId||'').trim().slice(0,120);const catalogItem=(db.giftCatalog||[]).find(x=>String(x.id||'')===giftId);if(!catalogItem)return res.status(400).json({error:'الهدية غير موجودة في الكتالوج الحالي؛ حدّث قائمة الهدايا'});const giftIcon=String(catalogItem.icon||'🎁').trim().slice(0,24)||'🎁';const giftImage=String(catalogItem.image||'').startsWith('/')?String(catalogItem.image):'';const record={id:crypto.randomBytes(8).toString('hex'),gift,giftIcon,giftId,giftImage,from:req.user.name,at:Date.now()};const p=profile(n);if(denyBadgeForRank(n,p,res))return;delete p.vipUntil;p.gifts=[record];save();emitToUser(n,'gift',{name:n,gift,giftIcon,giftId,giftImage,from:req.user.name,fromDisplayName:displayName(req.user.name),fromProfile:profile(req.user.name),fromRole:roleOf(req.user)});io.emit('profile-changed',{name:n,profile:p});emitState();res.json({ok:true,gift,giftIcon,giftId,giftImage});});});
app.post('/api/admin/gift/delete',(req,res)=>{requireAuth(req,res,()=>{try{if(!hasPermission(req.user,'gifts'))return res.status(403).json({error:'ما عندك صلاحية حذف الهدايا'});const n=accountKey(req.body.name),target=getUser(n)||getGuest(n);if(denyHigherRankTarget(req.user,n,res))return;if(!target)return res.status(404).json({error:'المستخدم غير موجود'});if((isOwnerName(n)||isOwner({name:n,role:target.role}))&&!(isOwner(req.user)&&keyName(req.user.name)===keyName(n)))return res.status(403).json({error:'حساب صاحب الموقع محمي من حذف الهدايا بواسطة الآخرين'});const p=profile(n);p.gifts=Array.isArray(p.gifts)?p.gifts:[];let index=-1;const requestedId=String(req.body.giftId||'');if(requestedId)index=p.gifts.findIndex(g=>String(g.id||'')===requestedId);if(index<0&&req.body.gift&&req.body.from!==undefined){const gift=String(req.body.gift),from=String(req.body.from||''),at=Number(req.body.at)||0;index=p.gifts.findIndex(g=>String(g.gift||'')===gift&&String(g.from||'')===from&&Number(g.at||0)===at);}if(index<0&&!requestedId&&req.body.gift===undefined&&Number.isInteger(Number(req.body.index)))index=Number(req.body.index);if(!Number.isInteger(index)||index<0||index>=p.gifts.length)return res.status(404).json({error:'الهدية المحددة غير موجودة. حدّث النافذة وافتحها من جديد.'});const removed=p.gifts.splice(index,1)[0];save();io.emit('profile-changed',{name:n,profile:p});emitState();return res.json({ok:true,removed,profile:p});}catch(err){console.error('gift-delete failed:',err);return res.status(500).json({error:'تعذر حذف الهدية من الخادم. راجع سجل الخادم.'});}});});
function countGifImageFrames(buffer){try{if(!Buffer.isBuffer(buffer)||buffer.length<14||!/^GIF8[79]a$/.test(buffer.subarray(0,6).toString('ascii')))return 0;let offset=13;const packed=buffer[10];if(packed&0x80)offset+=3*(1<<((packed&7)+1));let frames=0,guard=0;while(offset<buffer.length&&guard++<10000){const marker=buffer[offset++];if(marker===0x3B)break;if(marker===0x21){if(offset>=buffer.length)return 0;const label=buffer[offset++];if(label===0xF9){if(offset>=buffer.length)return 0;const size=buffer[offset++];offset+=size;if(buffer[offset]===0)offset++;}else{while(offset<buffer.length){const size=buffer[offset++];if(size===0)break;offset+=size;}}continue;}if(marker===0x2C){if(offset+9>buffer.length)return 0;const imagePacked=buffer[offset+8];offset+=9;if(imagePacked&0x80)offset+=3*(1<<((imagePacked&7)+1));if(offset>=buffer.length)return 0;offset++;while(offset<buffer.length){const size=buffer[offset++];if(size===0)break;offset+=size;}frames++;continue;}return 0;}return frames;}catch{return 0;}}
app.post('/api/admin/gifts/catalog/upload',requireAuth,uploadSmallImage.single('file'),validateUploadedContent('image'),(req,res)=>{if(!hasPermission(req.user,'gifts')){removeUploadedFile(req.file);return res.status(403).json({error:'ما عندك صلاحية إدارة الهدايا'});}try{if(!req.file||req.file.mimetype!=='image/gif'){removeUploadedFile(req.file);return res.status(400).json({error:'ارفع ملف GIF متحرك فقط'});}const gifBytes=fs.readFileSync(path.join(UP_DIR,req.file.filename));const gifFrames=countGifImageFrames(gifBytes);if(gifFrames<2){removeUploadedFile(req.file);return res.status(400).json({error:'ملف GIF لازم يحتوي على إطارين أو أكثر حتى يكون متحركاً'});}const name=cleanName(req.body.name||'').slice(0,40);if(!name){removeUploadedFile(req.file);return res.status(400).json({error:'اكتب اسم الهدية'});}db.giftCatalog=Array.isArray(db.giftCatalog)?db.giftCatalog:[];if(db.giftCatalog.length>=200){removeUploadedFile(req.file);return res.status(400).json({error:'وصلت للحد الأعلى وهو 200 هدية'});}const item={id:crypto.randomUUID(),name,icon:String(req.body.icon||'🎁').slice(0,24),image:'/uploads/'+req.file.filename,price:Math.max(0,Math.min(1000000,Number(req.body.price)||0)),builtin:false,createdAt:Date.now()};db.giftCatalog.push(item);try{save()}catch(error){db.giftCatalog.pop();removeUploadedFile(req.file);throw error;}return res.json({ok:true,gift:item,count:db.giftCatalog.length});}catch(error){console.error('Gift GIF upload failed:',error);removeUploadedFile(req.file);return res.status(500).json({error:'تعذر حفظ الهدية المتحركة'});}});
app.post('/api/admin/gifts/catalog/delete',requireAuth,(req,res)=>{if(!hasPermission(req.user,'gifts'))return res.status(403).json({error:'ما عندك صلاحية إدارة الهدايا'});db.giftCatalog=Array.isArray(db.giftCatalog)?db.giftCatalog:[];const id=String(req.body.id||'');let index=id?db.giftCatalog.findIndex(g=>String(g.id)===id):Number(req.body.index);if(!Number.isInteger(index)||index<0||index>=db.giftCatalog.length)return res.status(404).json({error:'الهدية المحددة غير موجودة'});const removed=db.giftCatalog.splice(index,1)[0];try{save()}catch(error){db.giftCatalog.splice(index,0,removed);return res.status(500).json({error:'تعذر حفظ حذف الهدية'});}if(removed?.image?.startsWith('/uploads/')){const file=path.resolve(UP_DIR,path.basename(removed.image));if(file.startsWith(path.resolve(UP_DIR)+path.sep)){try{fs.unlinkSync(file)}catch{}}}else if(removed?.image?.startsWith('/gifts/')){const file=path.resolve(ROOT,'public',removed.image.slice(1));if(file.startsWith(path.resolve(ROOT,'public','gifts')+path.sep)){try{fs.unlinkSync(file)}catch{}}}return res.json({ok:true,removed,count:db.giftCatalog.length});});
app.post('/api/admin/gift-vip',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'vip'))return res.status(403).json({error:'ما عندك صلاحية منح VIP'});const n=accountKey(req.body.name);if(denyHigherRankTarget(req.user,n,res))return;if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'المستخدم غير موجود'});if(isOwnerName(n)||isOwner({name:n,role:(getUser(n)||getGuest(n)).role}))return res.status(403).json({error:'حساب صاحب الموقع محمي'});const p=profile(n);if(denyBadgeForRank(n,p,res))return;p.vipUntil=Date.now()+24*60*60*1000;p.gifts=[];save();emitToUser(n,'vip-changed',{name:n,vipUntil:p.vipUntil,from:req.user.name});emitToUser(n,'admin-action-notice',{title:'👑 عضوية VIP',text:'منحك '+req.user.name+' (admin) عضوية VIP لمدة 24 ساعة'});io.emit('profile-changed',{name:n,profile:p});emitState();res.json({ok:true,vipUntil:p.vipUntil});});});
app.post('/api/admin/move-member',requireAuth,(req,res)=>{if(!hasPermission(req.user,'room_move'))return res.status(403).json({error:'ما عندك صلاحية نقل الأعضاء بين الغرف'});const n=accountKey(req.body.name),to=String(req.body.to||'');const target=getUser(n)||getGuest(n);if(denyHigherRankTarget(req.user,n,res))return;if(!target)return res.status(404).json({error:'العضو غير موجود'});if(isOwnerName(n)||isOwner({name:n,role:target.role}))return res.status(403).json({error:'صاحب الموقع محمي من النقل الإداري'});const room=db.rooms.find(r=>r.id===to);if(!room)return res.status(404).json({error:'الغرفة الجديدة غير موجودة'});if(req.body.enforceRoomPassword===true&&room.passwordHash&&!bcrypt.compareSync(String(req.body.password||''),room.passwordHash))return res.status(403).json({error:'كلمة مرور الغرفة غير صحيحة'});const active=[...socketUsers.entries()].filter(([,u])=>keyName(u.name)===keyName(n));if(!active.length)return res.status(409).json({error:'العضو غير متصل حالياً؛ حدّث القائمة وجرب مرة ثانية'});const movable=active.filter(([,u])=>(u.room||'public')!==to);if(!movable.length)return res.status(400).json({error:'العضو موجود بالفعل في الغرفة المحددة'});let moved=0;for(const [sid2,u2] of movable){const so=socketBySession(sid2);if(!so)continue;so.emit('admin-moved-room',{room:to,roomName:room.name,from:u2.room||'public'});so.emit('admin-action-notice',{title:'🔀 نقل بين الغرف',text:'تم نقلك إلى '+room.name});moved++;}if(!moved)return res.status(409).json({error:'تعذر نقل العضو؛ حدّث القائمة وجرب مرة ثانية'});emitState();return res.json({ok:true,name:n,to,room:room.name,moved});});
app.post('/api/admin/member-action',(req,res)=>{requireAuth(req,res,()=>{
  const actor=req.user,n=accountKey(req.body.name),action=String(req.body.action||''),room=String(req.body.room||'public');
  if(!n)return res.status(400).json({error:'الاسم مطلوب'});
  if(denyHigherRankTarget(actor,n,res))return;
  if((isOwnerName(n)||isOwner({name:n,role:(getUser(n)||getGuest(n)||{}).role})) && !isOwner(actor)) return res.status(403).json({error:'حساب صاحب الموقع محمي ولا يمكن للإداري طرده أو حظره أو تعديل لايكاته'});
  const actionPermission=({'global-kick':'global_kick','global-ban':'global_ban','kick':'kick_room','ban':'ban_room','mute':'mute_room','grant-like':'grant_likes','reset-likes':'reset_likes','grant-admin':'role_assign','grant-super':'role_assign','grant-banner':'role_assign','grant-vip':'vip','gift':'gifts'})[action]||'moderation';if(!hasPermission(actor,actionPermission))return res.status(403).json({error:'ما عندك صلاحية لهذا الإجراء'});
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
  if(action==='reset-likes'){if(isOwner({name:n,role:target.role})&&!(isOwner(actor)&&keyName(actor.name)===keyName(n)))return res.status(403).json({error:'لا يمكن تعديل لايكات صاحب الموقع'});target.likes=0;save();io.emit('likes-changed',{name:n,likes:0,level:1});return res.json({ok:true});}
  if(action==='grant-admin'||action==='grant-super'||action==='grant-banner'){
    const role=action==='grant-admin'?'admin':action==='grant-banner'?'banner':'super';
    const roleTarget=getUser(n)||getGuest(n);if(!roleTarget)return res.status(404).json({error:'العضو غير صحيح'});
    roleTarget.role=role;save();for(const [sid2,x] of sessions){if(keyName(x.name)===keyName(n)){x.role=role;db.sessions[sid2]=x;}}for(const [sid2,x] of socketUsers){if(keyName(x.name)===keyName(n)){x.role=role;const so=socketBySession(sid2);if(so?.data?.user)so.data.user.role=role;}}emitToUser(n,'role-changed',{name:n,role,from:actor.name});emitToUser(n,'rank-granted',{id:crypto.randomUUID(),name:n,rank,rankName:({'admin':'الإداري','super':'السوبر','banner':'البنر'}[role]),durationText:'دائمة',from:actor.name,fromDisplayName:displayName(actor.name),fromProfile:{...profile(actor.name)},fromRole:roleOf(actor)});emitState();return res.json({ok:true,role,cardQueued:true});
  }
  if(action==='grant-vip'){const until=Date.now()+24*60*60*1000;const p=profile(n);if(denyBadgeForRank(n,p,res))return;p.vipUntil=until;p.gifts=[];save();io.emit('profile-changed',{name:n,profile:p});emitToUser(n,'vip-changed',{name:n,vipUntil:until,from:actor.name});emitToUser(n,'admin-action-notice',{title:'👑 عضوية VIP',text:'منحك '+actor.name+' (admin) عضوية VIP لمدة 24 ساعة'});emitState();return res.json({ok:true,vipUntil:until});}
  if(action==='gift'){const gift=cleanName(req.body.gift||'هدية');const giftId=String(req.body.giftId||'').trim().slice(0,120);const item=(db.giftCatalog||[]).find(x=>String(x.id||'')===giftId);if(!item)return res.status(400).json({error:'الهدية غير موجودة في الكتالوج الحالي'});const giftIcon=String(item.icon||'🎁').slice(0,24),giftImage=String(item.image||'').startsWith('/')?item.image:'';const record={id:crypto.randomBytes(8).toString('hex'),gift,giftIcon,giftId,giftImage,from:actor.name,at:Date.now()};const p=profile(n);if(denyBadgeForRank(n,p,res))return;delete p.vipUntil;p.gifts=[record];save();io.emit('profile-changed',{name:n,profile:p});emitToUser(n,'gift',{name:n,gift,giftIcon,giftId,giftImage,from:actor.name,fromDisplayName:displayName(actor.name),fromProfile:profile(actor.name),fromRole:roleOf(actor)});emitState();return res.json({ok:true,gift,giftIcon,giftId,giftImage});}
  if(action==='kick'){emitToUser(n,'admin-action-notice',{title:'🚪 طرد من الغرفة',text:'قام '+actor.name+' (admin) بطردك من الغرفة'});for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===keyName(n)&&u2.room===room){const so=socketBySession(sid2);so?.leave(room);roomSockets.get(room)?.delete(sid2);if(so?.data?.user)so.data.user.room='';if(socketUsers.get(sid2))socketUsers.get(sid2).room='';so?.emit('kicked',{room,banned:false});}}emitState();return res.json({ok:true});}
  if(action==='ban'){emitToUser(n,'admin-action-notice',{title:'⛔ حظر من الغرفة',text:'قام '+actor.name+' (admin) بحظرك من الغرفة لمدة 15 دقيقة'});const until=Date.now()+15*60*1000;db.roomBans[room]=Array.isArray(db.roomBans[room])?db.roomBans[room]:[];db.roomBans[room]=db.roomBans[room].filter(x=>typeof x==='string'?keyName(x)!==keyName(n):keyName(x?.name)!==keyName(n));db.roomBans[room].push({name:keyName(n),until});save();for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===keyName(n)&&u2.room===room){const so=socketBySession(sid2);so?.leave(room);roomSockets.get(room)?.delete(sid2);if(so?.data?.user)so.data.user.room='';if(socketUsers.get(sid2))socketUsers.get(sid2).room='';so?.emit('kicked',{room,banned:true,until});}}emitState();return res.json({ok:true,until});}
  if(action==='mute'){db.roomMutes[room]=Array.isArray(db.roomMutes[room])?db.roomMutes[room]:[];const kn=keyName(n);if(!db.roomMutes[room].includes(kn))db.roomMutes[room].push(kn);save();emitToUser(n,'error-msg',{error:'تم كتمك في هذه الغرفة'});emitState();return res.json({ok:true});}
  return res.status(400).json({error:'إجراء غير معروف'});
});});
app.post('/api/admin/broadcast',requireAdmin,(req,res)=>{
  const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'نص الإعلان فارغ'});
  const duration=['5m','15m'].includes(req.body.duration)?'15m':'permanent';
  const temporary=duration==='15m';
  const title=temporary?'':(String(req.body.title||'').trim().slice(0,60)||'إعلان إداري');
  const item=temporary
    ?{id:crypto.randomUUID(),text:text.slice(0,2000),from:req.user.name,displayName:displayName(req.user.name),role:roleOf(req.user),at:Date.now(),duration,profile:profile(req.user.name)}
    :{id:crypto.randomUUID(),title,text:text.slice(0,2000),from:'الإدارة',displayName:'الإدارة',role:'admin',at:Date.now(),duration,profile:{}};
  const previousAnnouncements=db.announcements,previousMessages=db.messages;
  db.announcements=[...(db.announcements||[]),item].slice(-100).reverse();
  try{save()}catch(e){if(previousAnnouncements===undefined)delete db.announcements;else db.announcements=previousAnnouncements;if(previousMessages===undefined)delete db.messages;else db.messages=previousMessages;console.error('Announcement save failed:',e.message);return res.status(500).json({error:'تعذر حفظ الإعلان'});}
  publishAnnouncement(item);
  if(duration==='15m')scheduleAnnouncementExpiry(item);else schedulePermanentAnnouncement(item);
  res.json({ok:true,announcement:item});
});
app.delete('/api/admin/announcement/:id',requireAdmin,(req,res)=>{const id=String(req.params.id);const existed=(db.announcements||[]).some(x=>String(x.id)===id);const removed=removeAnnouncement(id);res.json({ok:true,removedMessages:removed.length,existed});});
app.delete('/api/admin/message/:id',requireAdmin,(req,res)=>{const id=req.params.id;db.messages=db.messages.filter(x=>x.id!==id);save();io.emit('message-deleted',{id});res.json({ok:true});});
app.patch('/api/admin/profile/:name',requireAdmin,(req,res)=>{const n=accountKey(req.params.name);if(denyHigherRankTarget(req.user,n,res))return;if(isOwner({name:n,role:(getUser(n)||getGuest(n)||{}).role})&&!isOwner(req.user))return res.status(403).json({error:'ملف صاحب الموقع محمي من الإداريين'});if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'العضو غير موجود'});const p=profile(n);if(req.body.displayName!==undefined){const dn=cleanName(req.body.displayName);if(!dn)return res.status(400).json({error:'الزخرفة لا يمكن أن تكون فارغة'});p.displayName=dn;}if(req.body.nameColor!==undefined){const c=String(req.body.nameColor||'');if(!/^#[0-9a-fA-F]{6}$/.test(c))return res.status(400).json({error:'لون الاسم غير صحيح'});p.nameColor=c;}if(req.body.fontColor!==undefined){const c=String(req.body.fontColor||'');if(!/^#[0-9a-fA-F]{6}$/.test(c))return res.status(400).json({error:'لون الخط غير صحيح'});p.fontColor=c;}if(req.body.bgColor!==undefined){const c=String(req.body.bgColor||'');if(!/^#[0-9a-fA-F]{6}$/.test(c))return res.status(400).json({error:'لون الخلفية غير صحيح'});p.bgColor=c;}save();io.emit('profile-changed',{name:n,profile:p,displayName:p.displayName||cleanName(n)});res.json({ok:true,profile:p,displayName:p.displayName||cleanName(n)});});
app.patch('/api/admin/member-stats/:name',requireAuth,(req,res)=>{const n=accountKey(req.params.name);if(denyHigherRankTarget(req.user,n,res))return;const field=String(req.body.field||''),value=Number(req.body.value);const user=getUser(n),guest=getGuest(n),target=user||guest;if(!target)return res.status(404).json({error:'العضو غير موجود'});if(isOwner({name:n,role:target.role})&&!(isOwner(req.user)&&keyName(req.user.name)===keyName(n)))return res.status(403).json({error:'حساب صاحب الموقع محمي من تعديل البيانات'});if(!Number.isInteger(value)||value<0||value>1000000)return res.status(400).json({error:'القيمة يجب أن تكون عدداً صحيحاً بين 0 و1000000'});if(field==='likes'){if(!hasPermission(req.user,'grant_likes'))return res.status(403).json({error:'ما عندك صلاحية تعديل اللايكات'});target.likes=value;save();io.emit('likes-changed',{name:n,likes:value,level:level(value)});emitState();return res.json({ok:true,field,likes:value});}if(field==='points'){if(!hasPermission(req.user,'panel_access'))return res.status(403).json({error:'ما عندك صلاحية تعديل النقاط'});target.points=value;save();io.emit('member-stats-changed',{name:n,points:value});emitState();return res.json({ok:true,field,points:value});}return res.status(400).json({error:'نوع القيمة غير معروف'});});
app.delete('/api/admin/avatar/:name',requireAdmin,(req,res)=>{const n=accountKey(req.params.name);if(denyHigherRankTarget(req.user,n,res))return;const ownerNames=new Set(['owner',keyName(process.env.OWNER_NAME||'owner')]);if((ownerNames.has(keyName(n))||isOwner({name:n,role:(getUser(n)||getGuest(n)||{}).role}))&&!isOwner(req.user))return res.status(403).json({error:'صورة صاحب الموقع محمية من الإداريين'});if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'العضو غير موجود'});const p=profile(n);if(p.avatar&&p.avatar.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(p.avatar)))}catch{}}p.avatar='';save();io.emit('profile-changed',{name:n,profile:p});res.json({ok:true});});
app.post('/api/admin/rank',(req,res)=>{requireAuth(req,res,()=>{
  const actor=req.user,n=accountKey(cleanName(req.body.name)),rank=String(req.body.rank||'');
  if(!hasPermission(actor,'rank_assign'))return res.status(403).json({error:'ما عندك صلاحية منح الرتب'});
  const user=getUser(n),guest=getGuest(n),target=user||guest;
  if(!n||!target)return res.status(404).json({error:'العضو غير موجود'});
  if(denyHigherRankTarget(actor,n,res))return;
  if(isOwnerName(n)||roleOf({name:n,role:target.role})==='owner')return res.status(403).json({error:'رتبة صاحب الموقع محمية'});
  const definition=rank==='none'?null:rankDefinition(rank);
  if(rank!=='none'&&!definition)return res.status(400).json({error:'الرتبة غير موجودة'});
  const rawDays=req.body.durationDays,days=rawDays===undefined||rawDays===null||rawDays===''?0:Number(rawDays);
  if(!Number.isInteger(days)||days<0||days>36500)return res.status(400).json({error:'المدة يجب أن تكون 0 أو عدد أيام صحيح بين 1 و36500'});
  if(definition){
    const actorCanGrantElevatedRank=isOwner(actor)||isAdmin(actor);
    const actorPermissions=ALL_PERMISSION_KEYS.filter(k=>hasPermission(actor,k));
    if(!actorCanGrantElevatedRank&&definition.permissions.some(k=>!actorPermissions.includes(k)))return res.status(403).json({error:'لا يمكنك منح رتبة تحتوي صلاحيات أعلى من صلاحياتك'});
  }
  const p=profile(n),previousProfile=JSON.parse(JSON.stringify(p)),previousTargetRole=target.role;
  const previousRankAudit=db.rankAudit,previousNotifications=db.notifications?.[n]?JSON.parse(JSON.stringify(db.notifications[n])):undefined;
  const grantedAt=Date.now(),oldRank=p.rank,oldBase=rankBaseRole(oldRank);
  const oldRankStillActive=!!oldRank&&oldRank!=='none'&&(!p.rankUntil||Number(p.rankUntil)>grantedAt);
  let baselineRole=String(target.role||'member');
  if(oldRankStillActive&&oldBase&&baselineRole===oldBase)baselineRole=String(p.rankPreviousRole||'member');
  if(definition&&['admin','super','banner'].includes(definition.baseRole)){p.rankPreviousRole=baselineRole;target.role=definition.baseRole;}
  else{if(oldRankStillActive&&oldBase&&String(target.role||'member')===oldBase)target.role=baselineRole;delete p.rankPreviousRole;}
  if(definition){p.gifts=[];delete p.vipUntil;}
  p.rank=rank;p.rankGrantedBy=cleanName(actor.name);p.rankGrantedAt=grantedAt;p.rankGrantedName=definition?.name||'بدون رتبة إضافية';
  db.rankAudit=Array.isArray(db.rankAudit)?db.rankAudit:[];
  const until=(definition&&days>0)?grantedAt+days*86400000:null;
  db.rankAudit.unshift({id:crypto.randomUUID(),member:n,rank,rankName:definition?.name||'بدون رتبة إضافية',by:cleanName(actor.name),at:grantedAt,durationDays:days,until});
  db.rankAudit=db.rankAudit.slice(0,1000);p.rankDurationDays=definition?days:0;
  if(until)p.rankUntil=until;else delete p.rankUntil;

  // Persist the rank and its inbox notification in ONE transaction-like save.
  // Never broadcast the profile update before the durable write succeeds.
  const durationText=!definition?'':days===0?'دائمة':'لمدة '+days+' يوم';
  const noticeText='لقد منحك '+actor.name+' رتبة '+(definition?.name||'بدون رتبة إضافية')+(durationText?' · '+durationText:'');
  const inboxItem={id:crypto.randomUUID(),type:'rank-granted',title:'🏅 تم منحك رتبة',from:actor.name,text:noticeText,rank,rankUntil:p.rankUntil||null,at:grantedAt};
  db.notifications=db.notifications||{};
  db.notifications[n]=[inboxItem,...(Array.isArray(db.notifications[n])?db.notifications[n]:[])].slice(0,100);
  try{save();}
  catch(error){
    target.role=previousTargetRole;db.profiles[n]=previousProfile;db.rankAudit=previousRankAudit;
    if(previousNotifications===undefined)delete db.notifications[n];else db.notifications[n]=previousNotifications;
    console.error('Rank assignment persistence failed:',error.message);
    return res.status(500).json({error:'تعذر حفظ منح الرتبة وإشعارها؛ لم يتم تطبيق التغيير'});
  }

  if(String(previousTargetRole||'member')!==String(target.role||'member'))syncActiveAccountRole(n,target.role,actor.name);
  io.emit('profile-changed',{name:n,profile:p});
  // This is the same recipient-specific realtime path used by the working gift card.
  if(definition)emitToUser(n,'rank-granted',{
    id:inboxItem.id,name:n,rank,rankName:definition.name,durationText,
    from:actor.name,fromDisplayName:displayName(actor.name),
    fromProfile:{...profile(actor.name)},fromRole:roleOf(actor),
    awardedAt:grantedAt
  });
  res.json({ok:true,rank,rankName:definition?.name||'بدون رتبة إضافية',rankUntil:p.rankUntil||null,name:n,type:guest?'guest':'member',cardQueued:!!definition,notificationId:inboxItem.id});
});});
app.get('/api/admin/member-ip/:name' ,requireAuth,(req,res)=>{if(!hasPermission(req.user,'member_ip'))return res.status(403).json({error:'ما عندك صلاحية عرض IP'});const n=keyName(req.params.name);if(isOwnerName(n))return res.status(403).json({error:'معلومات اتصال صاحب الموقع محمية'});const matches=[];for(const so of io.sockets.sockets.values()){const sid2=so.data?.sid,u2=so.data?.user||socketUsers.get(sid2);if(u2&&keyName(u2.name)===n){matches.push({ip:socketClientIp(so),room:u2.room||'',connected:true});}}res.json({name:req.params.name,connections:matches});});
// Rank definitions are editable independently from chat UI, buttons and colors.
app.get('/api/admin/ranks',requireAuth,(req,res)=>{if(!isAdmin(req.user))return res.status(403).json({error:'إدارة تعريفات الرتب للمالك والإداري فقط'});res.json({appVersion:'46.40.0',permissionSchemaVersion:2,permissionKeys:ALL_PERMISSION_KEYS,ranks:(db.rankDefinitions||[]).slice().sort((a,b)=>Number(b.level)-Number(a.level)),catalog:PERMISSION_CATALOG});});
app.post('/api/admin/ranks',requireAuth,(req,res)=>{if(!isAdmin(req.user))return res.status(403).json({error:'إدارة تعريفات الرتب للمالك والإداري فقط'});const name=cleanName(req.body.name),id=String(req.body.id||'').trim().toLowerCase(),level=Number(req.body.level),icon=String(req.body.icon||'★').trim().slice(0,8),baseRole=String(req.body.baseRole||'member'),permissions=Array.isArray(req.body.permissions)?req.body.permissions:[];if(!name||name.length>48)return res.status(400).json({error:'اسم الرتبة مطلوب وبحد أقصى 48 حرفاً'});if(!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(id)||rankDefinition(id))return res.status(400).json({error:'معرّف الرتبة غير صالح أو مستخدم'});if(!Number.isInteger(level)||level<1||level>999)return res.status(400).json({error:'المستوى يجب أن يكون رقماً صحيحاً من 1 إلى 999'});if(baseRole!=='member')return res.status(400).json({error:'الرتب الجديدة مستقلة عن مناصب الدردشة ولا تغيّر نوع العضو'});if(Number(req.body.permissionSchemaVersion||1)>2)return res.status(409).json({error:'نسخة محرر الرتب أحدث من السيرفر. حدّث ملفات الموقع كاملة.'});if(permissions.some(k=>!Object.hasOwn(PERMISSION_CATALOG,k)))return res.status(400).json({error:'توجد صلاحية غير معروفة في نسخة السيرفر الحالية. حدّث ملفات الموقع كاملة.'});if(permissions.includes('permission_manage')||permissions.includes('rank_assign')||permissions.includes('role_assign'))return res.status(400).json({error:'لا يمكن تضمين صلاحيات إدارة الرتب والصلاحيات في رتبة مخصصة'});db.rankDefinitions.push({id,name,level,icon,baseRole,permissions:[...new Set(['panel_access',...permissions])],createdAt:Date.now(),updatedAt:Date.now()});save();res.json({ok:true,rank:rankDefinition(id)});});
app.put('/api/admin/ranks/:id',requireAuth,(req,res)=>{if(!isAdmin(req.user))return res.status(403).json({error:'تعديل تعريفات الرتب للمالك والإداري فقط'});const r=rankDefinition(req.params.id);if(!r){removeUploadedFile(req.file);return res.status(404).json({error:'الرتبة غير موجودة'});}const name=cleanName(req.body.name),level=Number(req.body.level),icon=String(req.body.icon||'★').trim().slice(0,8),baseRole=String(req.body.baseRole||'member'),permissions=Array.isArray(req.body.permissions)?req.body.permissions:[];if(!name||name.length>48||!Number.isInteger(level)||level<1||level>999)return res.status(400).json({error:'تحقق من اسم الرتبة ومستواها'});if(baseRole!=='member'&&baseRole!==RANK_BASE_ROLE[r.id])return res.status(400).json({error:'الرتب المخصصة لا تغيّر نوع العضو أو مظهره في الدردشة'});if(RANK_BASE_ROLE[r.id]&&baseRole!==RANK_BASE_ROLE[r.id])return res.status(400).json({error:'لا يمكن تغيير نوع الرتبة الأساسية القديمة'});if(Number(req.body.permissionSchemaVersion||1)>2)return res.status(409).json({error:'نسخة محرر الرتب أحدث من السيرفر. حدّث ملفات الموقع كاملة.'});if(permissions.some(k=>!Object.hasOwn(PERMISSION_CATALOG,k))||(r.id!=='admin-full'&&permissions.some(k=>['permission_manage','rank_assign','role_assign'].includes(k))))return res.status(400).json({error:'الصلاحيات المختارة غير مسموحة لهذه الرتبة'});Object.assign(r,{name,level,icon,baseRole,permissions:[...new Set(['panel_access',...permissions])],updatedAt:Date.now()});save();res.json({ok:true,rank:r});});
app.delete('/api/admin/ranks/:id',requireAuth,(req,res)=>{if(!isAdmin(req.user))return res.status(403).json({error:'حذف تعريفات الرتب للمالك والإداري فقط'});const id=String(req.params.id),r=rankDefinition(id);if(!r)return res.status(404).json({error:'الرتبة غير موجودة'});if(!isOwner(req.user)&&RANK_PERMISSION_PROFILES.includes(id))return res.status(403).json({error:'الإداري يستطيع حذف الرتب المخصصة فقط؛ الرتب الأساسية محمية'});if(RANK_PERMISSION_PROFILES.includes(id))return res.status(400).json({error:'لا يمكن حذف رتبة أساسية قديمة؛ يمكن تعديل اسمها وصلاحياتها'});const assigned=Object.values(db.profiles||{}).some(p=>p&&p.rank===id&&(!p.rankUntil||Number(p.rankUntil)>Date.now()));if(assigned)return res.status(409).json({error:'لا يمكن حذف رتبة ممنوحة لأعضاء. أزلها من الأعضاء أولاً'});db.rankDefinitions=db.rankDefinitions.filter(x=>x.id!==id);delete db.rolePermissions[id];save();res.json({ok:true,id});});
app.post('/api/admin/ranks/:id/icon',requireAuth,uploadSmallImage.single('file'),validateUploadedContent('image'),(req,res)=>{if(!isAdmin(req.user)){removeUploadedFile(req.file);return res.status(403).json({error:'تغيير صور الرتب للمالك والإداري فقط'});}const r=rankDefinition(req.params.id);if(!r){removeUploadedFile(req.file);return res.status(404).json({error:'الرتبة غير موجودة'});}if(!req.file||!/^image\/(gif|png|jpeg|webp)$/i.test(req.file.mimetype)){removeUploadedFile(req.file);return res.status(400).json({error:'اختر صورة GIF أو PNG أو JPG أو WEBP'});}if(req.file.size>1024*1024){try{fs.unlinkSync(path.join(UP_DIR,req.file.filename))}catch{}return res.status(413).json({error:'حجم صورة الرتبة يجب ألا يتجاوز 1 ميغابايت'});}const old=r.image;r.image='/uploads/'+req.file.filename;r.updatedAt=Date.now();try{save()}catch(e){r.image=old;try{fs.unlinkSync(path.join(UP_DIR,req.file.filename))}catch{}return res.status(500).json({error:'تعذر حفظ صورة الرتبة'});}if(old&&old.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(old)))}catch{}}res.json({ok:true,image:r.image});});
app.delete('/api/admin/ranks/:id/icon',requireAuth,(req,res)=>{if(!isAdmin(req.user))return res.status(403).json({error:'حذف صور الرتب للمالك والإداري فقط'});const r=rankDefinition(req.params.id);if(!r)return res.status(404).json({error:'الرتبة غير موجودة'});const old=r.image;delete r.image;r.updatedAt=Date.now();save();if(old&&old.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(old)))}catch{}}res.json({ok:true});});
app.get('/api/admin/permissions',requireAuth,(req,res)=>{
 if(!isAdmin(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة الصلاحيات'});
 const roles=Object.fromEntries(['admin','banner','super',...RANK_PERMISSION_PROFILES].map(r=>{
  const def=rankDefinition(r);
  const source=def?(def.permissions||[]):(Array.isArray(db.rolePermissions[r])?db.rolePermissions[r]:(DEFAULT_ROLE_PERMISSIONS[r]||[]));
  return [r,[...new Set(['panel_access',...source.filter(p=>Object.hasOwn(PERMISSION_CATALOG,p)&&!PROTECTED_ROLE_PERMISSIONS.includes(p))])]];
 }));
 res.json({appVersion:'46.40.0',permissionSchemaVersion:2,permissionKeys:ALL_PERMISSION_KEYS,catalog:PERMISSION_CATALOG,defaults:DEFAULT_ROLE_PERMISSIONS,roles});
});
app.put('/api/admin/permissions',requireAuth,(req,res)=>{if(!isAdmin(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة الصلاحيات'});const role=String(req.body.role||'');if(!['admin','super','banner',...RANK_PERMISSION_PROFILES].includes(role))return res.status(400).json({error:'الرتبة أو المنصب غير صحيح'});const allowed=ALL_PERMISSION_KEYS;const requested=Array.isArray(req.body.permissions)?req.body.permissions:[];if(Number(req.body.permissionSchemaVersion||1)>2)return res.status(409).json({error:'نسخة محرر الصلاحيات أحدث من السيرفر. حدّث ملفات الموقع كاملة.'});if(requested.some(x=>!allowed.includes(x)))return res.status(400).json({error:'توجد صلاحية غير معروفة في نسخة السيرفر الحالية. حدّث ملفات الموقع كاملة.'});const protectedPerms=PROTECTED_ROLE_PERMISSIONS;db.rolePermissions=db.rolePermissions||{};db.rolePermissionMeta=db.rolePermissionMeta||{customized:{}};db.rolePermissionMeta.customized=db.rolePermissionMeta.customized||{};const previousPermissions=db.rolePermissions[role],previousCustomized=db.rolePermissionMeta.customized[role],rankDef=rankDefinition(role),previousRankPermissions=rankDef?.permissions,previousRankUpdatedAt=rankDef?.updatedAt;db.rolePermissions[role]=[...new Set(['panel_access',...requested.filter(x=>allowed.includes(x))])];if(rankDef){rankDef.permissions=[...db.rolePermissions[role]];rankDef.updatedAt=Date.now();}db.rolePermissionMeta.customized[role]=true;try{save();}catch(error){if(previousPermissions===undefined)delete db.rolePermissions[role];else db.rolePermissions[role]=previousPermissions;if(previousCustomized===undefined)delete db.rolePermissionMeta.customized[role];else db.rolePermissionMeta.customized[role]=previousCustomized;if(rankDef){rankDef.permissions=previousRankPermissions;rankDef.updatedAt=previousRankUpdatedAt;}console.error('Role permissions persistence failed:',error.message);return res.status(500).json({error:'تعذر حفظ الصلاحيات؛ لم يتم تطبيق التغيير'});}res.json({ok:true,role,permissions:db.rolePermissions[role]});});
app.get('/api/admin/member-permissions/:name',requireAuth,(req,res)=>{if(!isAdmin(req.user))return res.status(403).json({error:'إضافة الصلاحيات اليدوية متاحة للإدارة فقط'});const n=accountKey(req.params.name),target=getUser(n)||getGuest(n);if(!target)return res.status(404).json({error:'العضو غير موجود'});if(isOwner({name:n,role:target.role}))return res.status(403).json({error:'حساب صاحب الموقع محمي'});const permissions=[...new Set((db.permissionOverrides?.[keyName(n)]||[]).filter(p=>Object.hasOwn(PERMISSION_CATALOG,p)))];res.json({name:n,permissions,catalog:PERMISSION_CATALOG});});
app.put('/api/admin/member-permissions/:name',requireAuth,(req,res)=>{if(!isAdmin(req.user))return res.status(403).json({error:'إضافة الصلاحيات اليدوية متاحة للإدارة فقط'});const n=accountKey(req.params.name);if(denyHigherRankTarget(req.user,n,res))return;const target=getUser(n)||getGuest(n);if(!target)return res.status(404).json({error:'العضو غير موجود'});if(isOwner({name:n,role:target.role}))return res.status(403).json({error:'حساب صاحب الموقع محمي'});const requested=Array.isArray(req.body?.permissions)?req.body.permissions:[];if(requested.some(p=>!Object.hasOwn(PERMISSION_CATALOG,p)))return res.status(400).json({error:'توجد صلاحية غير مسموح منحها يدوياً'});db.permissionOverrides=db.permissionOverrides||{};const key=keyName(n);db.permissionOverrides[key]=[...new Set(requested)];save();res.json({ok:true,name:n,permissions:db.permissionOverrides[key]});});
app.get('/api/admin/welcome-messages',requireAuth,(req,res)=>{if(!hasPermission(req.user,'welcome_manage'))return res.status(403).json({error:'ما عندك صلاحية عرض أو تعديل رسائل الترحيب'});res.json({messages:db.welcomeMessages||[]});});
app.put('/api/admin/welcome-messages',requireAuth,(req,res)=>{if(!hasPermission(req.user,'welcome_manage'))return res.status(403).json({error:'تعديل رسائل الترحيب متاح للمالك والإداري فقط'});try{const raw=Array.isArray(req.body?.messages)?req.body.messages:[];if(raw.length>12)return res.status(400).json({error:'الحد الأعلى 12 رسالة ترحيب'});const messages=[];for(const item of raw){const title=String(item?.title||'').trim().slice(0,80),text=String(item?.text||'').trim().slice(0,1200);if(!title&&!text)continue;if(!text)return res.status(400).json({error:'اكتب نص كل رسالة قبل الحفظ'});messages.push({id:String(item?.id||crypto.randomUUID()).slice(0,80),title:title||'الترحيب',text,enabled:item?.enabled!==false});}const previous=db.welcomeMessages;db.welcomeMessages=messages;try{save()}catch(saveError){db.welcomeMessages=previous;console.error('Welcome messages save failed:',saveError);return res.status(500).json({error:'تعذر حفظ الرسائل على التخزين. تحقق من صلاحية ومسار /data ثم أعد المحاولة.'});}return res.json({ok:true,messages});}catch(error){console.error('Welcome messages update failed:',error);return res.status(500).json({error:'حدث خطأ أثناء معالجة رسائل الترحيب'});}});
app.get('/api/chat-tools',requireAuth,(req,res)=>res.json({shortcuts:(db.chatShortcuts||[]).map(x=>({id:x.id,title:x.title,text:x.text})),smileys:(db.customSmileys||[]).map(x=>({id:x.id,icon:x.icon,name:x.name,shortcut:x.shortcut||''})),gifts:hasPermission(req.user,'gifts')?(db.giftCatalog||[]):[]}));
app.post('/api/admin/chat-tools/smiley-upload',requirePermission('smileys_manage'),uploadSmallImage.single('file'),validateUploadedContent('image'),(req,res)=>{
  try{
    if(!req.file||!/^image\/(gif|png|jpeg|webp)$/i.test(req.file.mimetype)){removeUploadedFile(req.file);return res.status(400).json({error:'ارفع صورة GIF أو PNG أو JPG أو WEBP'});}
    if((db.customSmileys||[]).length>=450){removeUploadedFile(req.file);return res.status(400).json({error:'وصلت إلى الحد الأعلى 450 سميل'});}
    const name=String(req.body.name||'').trim().slice(0,40)||'سميل جديد';
    const shortcut=String(req.body.shortcut||'').trim().slice(0,24);
    if(!shortcut){removeUploadedFile(req.file);return res.status(400).json({error:'اكتب اختصاراً لهذا السميل مثل ض1'});}
    if((db.customSmileys||[]).some(x=>String(x.shortcut||'').toLowerCase()===shortcut.toLowerCase())){removeUploadedFile(req.file);return res.status(409).json({error:'هذا الاختصار مستخدم لسميل آخر'});}
    const item={id:crypto.randomUUID(),icon:'/uploads/'+req.file.filename,name,shortcut};
    db.customSmileys.push(item);
    try{save()}catch(e){db.customSmileys.pop();removeUploadedFile(req.file);throw e;}
    res.json({ok:true,smiley:item});
  }catch(e){console.error('smiley upload failed:',e);res.status(500).json({error:'تعذر حفظ السميل المرفوع'});}
});
app.put('/api/admin/chat-tools',requireAuth,(req,res)=>{try{const shortcuts=Array.isArray(req.body?.shortcuts)?req.body.shortcuts:[],smileys=Array.isArray(req.body?.smileys)?req.body.smileys:[];const same=(a,b)=>JSON.stringify(a||[])===JSON.stringify(b||[]);if(!same(shortcuts,db.chatShortcuts||[])&&!hasPermission(req.user,'shortcuts_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة الاختصارات'});if(!same(smileys,db.customSmileys||[])&&!hasPermission(req.user,'smileys_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة السميلات'});if(shortcuts.length>100)return res.status(400).json({error:'الحد الأعلى 100 اختصار'});if(smileys.length>450)return res.status(400).json({error:'الحد الأعلى 450 سميل'});const cleanShortcuts=[];for(const x of shortcuts){const title=String(x?.title||'').trim().slice(0,50),text=String(x?.text||'').trim().slice(0,500);if(!title&&!text)continue;if(!title||!text)return res.status(400).json({error:'كل اختصار يحتاج اسماً ونصاً'});cleanShortcuts.push({id:String(x.id||crypto.randomUUID()).slice(0,80),title,text});}const cleanSmileys=[];for(const x of smileys){const icon=String(x?.icon||'').trim().slice(0,12000),name=String(x?.name||'').trim().slice(0,40),shortcut=String(x?.shortcut||'').trim().slice(0,24);if(!icon&&!name)continue;if(!icon)return res.status(400).json({error:'رمز السميل مطلوب'});cleanSmileys.push({id:String(x.id||crypto.randomUUID()).slice(0,80),icon,name:name||'سميل',shortcut});}const oldS=db.chatShortcuts,oldM=db.customSmileys;db.chatShortcuts=cleanShortcuts;db.customSmileys=cleanSmileys;try{save()}catch(e){db.chatShortcuts=oldS;db.customSmileys=oldM;throw e;}return res.json({ok:true,shortcuts:cleanShortcuts,smileys:cleanSmileys});}catch(e){console.error('chat-tools save failed:',e);return res.status(500).json({error:'تعذر حفظ الاختصارات والسميلات'});}});
app.put('/api/admin/chat-filter',requireAdmin,(req,res)=>{try{const enabled=req.body?.enabled===true;const raw=Array.isArray(req.body?.words)?req.body.words:[];if(raw.length>200)return res.status(400).json({error:'الحد الأعلى 200 كلمة'});const words=[...new Set(raw.map(x=>String(x||'').trim().replace(/\s+/g,' ').slice(0,60)).filter(Boolean))];const old=db.chatFilter;db.chatFilter={enabled,words};try{save()}catch(e){db.chatFilter=old;throw e;}res.json({ok:true,chatFilter:db.chatFilter});}catch(e){console.error('chat filter save failed:',e);res.status(500).json({error:'تعذر حفظ إعدادات الفلتر'});}});
app.get('/api/admin/audit-logs',requireAdmin,(req,res)=>{res.set('Cache-Control','no-store');res.json({items:(db.adminAuditLogs||[]).slice(0,500),total:(db.adminAuditLogs||[]).length});});
app.get('/api/admin/data',requireAuth,(req,res)=>{
 const allowed=['panel_access','users_view','audit_view','stats_view','chat_filter_manage','member_status_manage'].some(p=>hasPermission(req.user,p));
 if(!allowed)return res.status(403).json({error:'ما عندك صلاحية لهذا القسم'});
 const visibleOnline=new Map(getOnlineUsers(req.user).map(x=>[keyName(x.name),x]));
 const registeredAccountKeys=new Set(Object.keys(db.users||{}).map(keyName));
 const seenAdminAccountKeys=new Set();
 const payload={users:Object.entries(db.users).filter(([name])=>{const k=keyName(name);if(seenAdminAccountKeys.has(k))return false;seenAdminAccountKeys.add(k);return true;}).filter(([name])=>!hasInvisibleActiveSession(name,req.user)).sort(([a],[b])=>Number(isOwnerName(b))-Number(isOwnerName(a))).map(([name,u])=>({name,type:'member',likes:Number(u.likes)||0,points:Number(u.points)||0,level:level(Number(u.likes)||0),role:u.role||(keyName(name)==='owner' || (!!process.env.OWNER_NAME && keyName(name)===keyName(process.env.OWNER_NAME))?'owner':(keyName(name)==='admin'?'admin':'member')),vip:vipActive(name),online:visibleOnline.has(keyName(name)),room:visibleOnline.get(keyName(name))?.room||'',profile:profile(name)})),guests:Object.entries(db.guests).filter(([name])=>{const k=keyName(name);if(registeredAccountKeys.has(k)||seenAdminAccountKeys.has(k))return false;seenAdminAccountKeys.add(k);return true;}).sort(([a],[b])=>Number(isOwnerName(b))-Number(isOwnerName(a))).map(([name,g])=>({name,type:'guest',likes:Number(g.likes)||0,points:Number(g.points)||0,level:level(Number(g.likes)||0),role:g.role||'member',online:visibleOnline.has(keyName(name)),room:visibleOnline.get(keyName(name))?.room||'',profile:profile(name)})).filter(x=>x.online),rooms:db.rooms.map(r=>{const {passwordHash,...safe}=r;return {...safe,locked:!!passwordHash,online:onlineInRoom(r.id,req.user)};}),announcements:(db.announcements||[]).slice(0,100),messages:db.messages.slice(-100).reverse(),bans:Object.entries(db.roomBans||{}).flatMap(([room,items])=>(items||[]).map(x=>({room,name:typeof x==='string'?x:x.name,until:typeof x==='string'?null:x.until}))),mutes:Object.entries(db.roomMutes||{}).flatMap(([room,items])=>(items||[]).map(name=>({room,name}))),globalBans:Object.values(db.globalBans||{}).filter(x=>Number(x.until)>Date.now()),globalIpBans:Object.values(db.globalIpBans||{}).filter(x=>Number(x.until)>Date.now()),rankAudit:(db.rankAudit||[]).slice(0,200),adminAuditLogs:(db.adminAuditLogs||[]).slice(0,200),chatFilter:db.chatFilter||{enabled:false,words:[]},stats:{registeredUsers:Object.keys(db.users||{}).length,knownGuests:Object.keys(db.guests||{}).length,onlineUsers:getOnlineUsers(req.user).length,rooms:(db.rooms||[]).length,publicMessages:(db.messages||[]).length,privateMessages:(db.privateMessages||[]).length,wallPosts:(db.wall||[]).length,adminOperations:(db.adminAuditLogs||[]).length,rankChanges:(db.rankAudit||[]).length},rolePermissions:db.rolePermissions||{},rankDefinitions:(db.rankDefinitions||[]).slice().sort((a,b)=>Number(b.level)-Number(a.level)),myPermissions:Object.keys(PERMISSION_CATALOG).filter(permission=>hasPermission(req.user,permission)),wallEnabled:db.wallEnabled!==false,wallCount:(db.wall||[]).length,giftCatalog:Array.isArray(db.giftCatalog)?db.giftCatalog:[],chatShortcuts:db.chatShortcuts||[],customSmileys:db.customSmileys||[] };
 if(!hasPermission(req.user,'panel_access')){
   const fullUsers=hasPermission(req.user,'users_view');
   const statusOnly=hasPermission(req.user,'member_status_manage');
   if(!fullUsers&&!statusOnly){payload.users=[];payload.guests=[];}
   else {const safe=u=>({name:u.name,type:u.type,role:u.role,online:u.online,room:u.room,profile:{status:u.profile?.status,displayName:u.profile?.displayName,rank:u.profile?.rank}});payload.users=payload.users.map(safe);payload.guests=payload.guests.map(safe);}
   payload.rooms=[];payload.announcements=[];payload.messages=[];payload.bans=[];payload.mutes=[];payload.globalBans=[];payload.globalIpBans=[];payload.rankAudit=[];
   if(!hasPermission(req.user,'audit_view'))payload.adminAuditLogs=[];
   if(!hasPermission(req.user,'chat_filter_manage'))payload.chatFilter={enabled:false,words:[]};
   if(!hasPermission(req.user,'stats_view'))payload.stats={};
   if(!hasPermission(req.user,'permission_manage'))payload.rolePermissions={};
   payload.rankDefinitions=[];payload.giftCatalog=[];payload.chatShortcuts=[];payload.customSmileys=[];
 }
 res.json(payload);
});
app.post('/api/rooms',requireAuth,(req,res)=>{const name=cleanName(req.body.name).slice(0,40),desc=String(req.body.desc||'غرفة جديدة').trim().slice(0,160),kind=req.body.kind==='voice'?'voice':'public';if(name.length<2)return res.status(400).json({error:'اسم الغرفة لازم يكون حرفين على الأقل'});if(db.rooms.some(r=>keyName(r.name)===keyName(name)))return res.status(409).json({error:'اسم الغرفة مستخدم بالفعل'});if(db.rooms.length>=250)return res.status(400).json({error:'وصل الموقع إلى الحد الأعلى للغرف حالياً'});const id='r_'+crypto.randomBytes(5).toString('hex');const room={id,name,desc:desc||'غرفة جديدة',kind,capacity:Math.max(2,Math.min(200,Number(req.body.capacity)||50)),mics:kind==='voice'?Math.max(1,Math.min(20,Number(req.body.mics)||5)):0,micLikesRequired:kind==='voice'?Math.max(0,Math.min(1000000,Number(req.body.micLikesRequired??30)||0)):0,owner:req.user.name,created:Date.now()};db.rooms.push(room);try{save()}catch(err){db.rooms=db.rooms.filter(x=>x.id!==id);console.error('Public room creation save failed:',err);return res.status(500).json({error:'تعذر حفظ الغرفة على السيرفر. تحقق من صلاحية مجلد البيانات ثم أعد المحاولة.'})}emitState();return res.json({ok:true,id,room});});
app.post('/api/admin/room',requireAdmin,(req,res)=>{const name=cleanName(req.body.name).slice(0,40),kind=req.body.kind==='voice'?'voice':req.body.kind==='private'?'private':'public';if(name.length<2)return res.status(400).json({error:'اسم الغرفة لازم يكون حرفين على الأقل'});if(db.rooms.length>=250)return res.status(400).json({error:'وصل الموقع إلى الحد الأعلى للغرف حالياً'});if(db.rooms.some(r=>keyName(r.name)===keyName(name)))return res.status(409).json({error:'اسم الغرفة مستخدم بالفعل'});const id='r_'+crypto.randomBytes(5).toString('hex');const room={id,name,desc:String(req.body.desc||'غرفة جديدة').trim().slice(0,160),kind,capacity:Math.max(2,Math.min(200,Number(req.body.capacity)||50)),mics:kind==='voice'?Math.max(1,Math.min(20,Number(req.body.mics)||5)):0,micLikesRequired:kind==='voice'?Math.max(0,Math.min(1000000,Number(req.body.micLikesRequired ?? 30)||0)):0,owner:req.user.name,created:Date.now()};db.rooms.push(room);try{save()}catch(error){db.rooms=db.rooms.filter(item=>item.id!==id);console.error('Admin room creation save failed:',error);return res.status(500).json({error:'تعذر حفظ الغرفة على السيرفر'})}emitState();return res.json({ok:true,id,room});});
app.post('/api/admin/room/:id/lock',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const password=String(req.body.password||'');if(password.length<1)return res.status(400).json({error:'اكتب باسورد الغرفة أولاً'});if(password.length>128)return res.status(400).json({error:'الباسورد طويل جداً'});const previous=r.passwordHash;r.passwordHash=bcrypt.hashSync(password,12);try{save()}catch(error){if(previous===undefined)delete r.passwordHash;else r.passwordHash=previous;console.error('Room lock save failed:',error);return res.status(500).json({error:'تعذر حفظ قفل الغرفة'})}emitState();return res.json({ok:true,locked:true});});
app.delete('/api/admin/room/:id/lock',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const previous=r.passwordHash;delete r.passwordHash;try{save()}catch(error){if(previous!==undefined)r.passwordHash=previous;console.error('Room unlock save failed:',error);return res.status(500).json({error:'تعذر حفظ إزالة قفل الغرفة'})}emitState();return res.json({ok:true,locked:false});});
app.post('/api/admin/room/:id/image',requireAdmin,uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r){removeUploadedFile(req.file);return res.status(404).json({error:'الغرفة غير موجودة'});}if(!req.file||!req.file.mimetype.startsWith('image/')){removeUploadedFile(req.file);return res.status(400).json({error:'اختر صورة للغرفة'});}const previous=r.image;r.image='/uploads/'+req.file.filename;try{save()}catch(e){r.image=previous;removeUploadedFile(req.file);console.error('Admin room image save failed:',e.message);return res.status(500).json({error:'تعذر حفظ صورة الغرفة'});}if(previous&&previous.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(previous)))}catch{}}emitState();res.json({ok:true,image:r.image,room:r});});
app.post('/api/rooms/:id/image',requireAuth,uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r){removeUploadedFile(req.file);return res.status(404).json({error:'الغرفة غير موجودة'});}const owner=keyName(r.owner||'')===keyName(req.user.name||'');if(!owner&&!isAdmin(req.user)){removeUploadedFile(req.file);return res.status(403).json({error:'صورة الغرفة يگدر يغيرها منشئ الغرفة أو الإدارة فقط'});}if(!req.file||!req.file.mimetype.startsWith('image/'))return res.status(400).json({error:'اختار ملف صورة صالح للغرفة'});const previous=r.image; r.image='/uploads/'+req.file.filename;try{save()}catch(err){r.image=previous;try{fs.unlinkSync(path.join(UP_DIR,req.file.filename))}catch{}console.error('Public room image save failed:',err);return res.status(500).json({error:'تعذر حفظ صورة الغرفة على السيرفر'})}if(previous&&previous.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(previous)))}catch{}}emitState();return res.json({ok:true,image:r.image,room:r});});
function clearRoomImage(req,res){const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const oldImage=String(r.image||'');delete r.image;try{save()}catch(e){r.image=oldImage;console.error('Room image reset save failed:',e);return res.status(500).json({error:'تعذر حفظ حذف الصورة؛ تحقق من صلاحية التخزين'})}if(oldImage.startsWith('/uploads/')){const file=path.resolve(UP_DIR,path.basename(oldImage));try{if(file.startsWith(path.resolve(UP_DIR)+path.sep)&&fs.existsSync(file))fs.unlinkSync(file)}catch(e){console.warn('Room image file cleanup failed:',e.message)}}emitState();return res.json({ok:true,image:null,room:r});}
app.delete('/api/admin/room/:id/image',requireAdmin,clearRoomImage);
// POST fallback for hosting/proxies that block DELETE requests.
app.post('/api/admin/room/:id/image/delete',requireAdmin,clearRoomImage);
app.patch('/api/admin/room/:id',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const previous={...r};if(req.body.name!==undefined){const name=cleanName(req.body.name).slice(0,40);if(name.length<2)return res.status(400).json({error:'اسم الغرفة لازم يكون حرفين على الأقل'});if(db.rooms.some(item=>item.id!==r.id&&keyName(item.name)===keyName(name)))return res.status(409).json({error:'اسم الغرفة مستخدم بالفعل'});r.name=name;}if(req.body.desc!==undefined)r.desc=String(req.body.desc).trim().slice(0,160);if(req.body.capacity!==undefined)r.capacity=Math.max(2,Math.min(200,Number(req.body.capacity)||r.capacity));if(req.body.mics!==undefined&&r.kind==='voice')r.mics=Math.max(1,Math.min(20,Number(req.body.mics)||r.mics));if(req.body.micLikesRequired!==undefined&&r.kind==='voice')r.micLikesRequired=Math.max(0,Math.min(1000000,Number(req.body.micLikesRequired)||0));try{save()}catch(error){Object.keys(r).forEach(key=>delete r[key]);Object.assign(r,previous);console.error('Room update save failed:',error);return res.status(500).json({error:'تعذر حفظ تعديلات الغرفة'})}emitState();return res.json({ok:true,room:r});});
app.delete('/api/admin/room/:id',requireAdmin,(req,res)=>{if(['public','voice'].includes(req.params.id))return res.status(400).json({error:'الغرفة الأساسية محمية ولا تحذف'});const index=db.rooms.findIndex(r=>r.id===req.params.id);if(index<0)return res.status(404).json({error:'الغرفة غير موجودة'});const [removed]=db.rooms.splice(index,1),oldBans=db.roomBans[req.params.id],oldMutes=db.roomMutes[req.params.id];delete db.roomBans[req.params.id];delete db.roomMutes[req.params.id];try{save()}catch(error){db.rooms.splice(index,0,removed);if(oldBans!==undefined)db.roomBans[req.params.id]=oldBans;if(oldMutes!==undefined)db.roomMutes[req.params.id]=oldMutes;console.error('Room deletion save failed:',error);return res.status(500).json({error:'تعذر حفظ حذف الغرفة'})}emitState();return res.json({ok:true});});
app.post('/api/admin/unmute',(req,res,next)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'mute_room'))return res.status(403).json({error:'ما عندك صلاحية رفع الكتم'});const room=String(req.body.room||'public'),name=keyName(req.body.name);if(!name)return res.status(400).json({error:'الاسم مطلوب'});if(denyHigherRankTarget(req.user,name,res))return;db.roomMutes[room]=(db.roomMutes[room]||[]).filter(x=>keyName(x)!==name);save();res.json({ok:true});});});
function roomAction(type,req,res){
  const room=String(req.body.room||'public'),name=keyName(req.body.name);
  if(!name)return res.status(400).json({error:'الاسم مطلوب'});
  if(denyHigherRankTarget(req.user,name,res))return;
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

app.post('/api/admin/kick',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'kick_room'))return res.status(403).json({error:'ما عندك صلاحية الطرد'});const room=String(req.body.room||'public'),name=keyName(req.body.name);if(!name)return res.status(400).json({error:'الاسم مطلوب'});if(denyHigherRankTarget(req.user,name,res))return;if((isOwner({name,role:(getUser(name)||getGuest(name)||{}).role})||name===keyName(process.env.OWNER_NAME||'owner'))&&!isOwner(req.user))return res.status(403).json({error:'حساب صاحب الموقع محمي ولا يحق للإداري اتخاذ إجراء عليه'});for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===name&&u2.room===room){const so=socketBySession(sid2);so?.leave(room);roomSockets.get(room)?.delete(sid2);so?.emit('kicked',{room});}}emitState();res.json({ok:true});});});
app.post('/api/admin/profile/status',requireAdmin,(req,res)=>{const name=accountKey(cleanName(req.body?.name));if(denyHigherRankTarget(req.user,name,res))return;const target=getUser(name)||getGuest(name);if(!name||!target)return res.status(404).json({error:'العضو غير موجود'});if(isOwnerName(name)||roleOf({name,role:target.role})==='owner')return res.status(403).json({error:'حالة صاحب الموقع محمية'});const status=String(req.body?.status||'').trim().slice(0,100);const p=profile(name);p.status=status||defaultStatus(name);p.statusUpdatedAt=Date.now();p.statusUpdatedBy=String(req.user?.name||'').slice(0,32);try{save()}catch(e){return res.status(500).json({error:'تعذر حفظ الحالة'});}io.emit('profile-changed',{name,profile:p,displayName:p.displayName||cleanName(name)});res.json({ok:true,name,status:p.status});});

app.post('/api/admin/mute',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'mute_room'))return res.status(403).json({error:'ما عندك صلاحية الكتم'});roomAction('roomMutes',req,res);});});
app.post('/api/admin/ban',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'ban_room'))return res.status(403).json({error:'ما عندك صلاحية الحظر'});roomAction('roomBans',req,res);});});
app.post('/api/admin/unban',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'ban_room'))return res.status(403).json({error:'ما عندك صلاحية رفع الحظر'});const room=String(req.body.room||'public'),name=keyName(req.body.name);if(denyHigherRankTarget(req.user,name,res))return;db.roomBans[room]=(db.roomBans[room]||[]).filter(x=>typeof x==='string'?x!==name:keyName(x?.name)!==name);save();res.json({ok:true});});});

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
app.post('/api/profile/avatar',requireAuth,uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{if(!isAdmin(req.user)&&userLikes(req.user)<10){removeUploadedFile(req.file);return res.status(403).json({error:'تغيير الصورة يفتح عند 10 إعجابات'});}if(!req.file||!req.file.mimetype.startsWith('image/')){removeUploadedFile(req.file);return res.status(400).json({error:'اختر صورة'});}const p=profile(req.user.name),previous=p.avatar;p.avatar='/uploads/'+req.file.filename;try{save()}catch(e){p.avatar=previous;removeUploadedFile(req.file);console.error('Avatar save failed:',e.message);return res.status(500).json({error:'تعذر حفظ الصورة'});}if(previous&&previous.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(previous)))}catch{}}res.json({ok:true,avatar:p.avatar});});
app.delete('/api/profile/avatar',requireAuth,(req,res)=>{if(isOwner(req.user))return res.status(403).json({error:'حذف صورة صاحب الموقع محمي'});const p=profile(req.user.name),previous=p.avatar;p.avatar='';try{save()}catch(e){p.avatar=previous;return res.status(500).json({error:'تعذر حفظ حذف الصورة'});}if(previous&&previous.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(previous)))}catch{}}res.json({ok:true,avatar:''});});

app.post('/api/media',requireAuth,upload.single('file'),validateUploadedContent('media'),(req,res)=>{
  const u=req.user, to=cleanName(req.body.to||''), scope=String(req.body.scope||'private');
  if(!req.file)return res.status(400).json({error:'لم يتم اختيار ملف'});
  if(globalBanned(u.name,requestClientIp(req))){removeUploadedFile(req.file);return res.status(403).json({error:'لا يمكنك إرسال الوسائط أثناء الحظر العام'});}
  if(scope==='private'&&!isOwner(u)&&!canMedia(u)){removeUploadedFile(req.file);return res.status(403).json({error:'الصور والفيديو والصوت والاتصال تفتح عند 500 إعجاب'});}
  if(scope==='wall'&&db.wallEnabled===false){removeUploadedFile(req.file);return res.status(403).json({error:'الجدار متوقف مؤقتاً من الإدارة'});}
  if(scope==='wall'&&!/^image\//.test(req.file.mimetype)&&!/^video\//.test(req.file.mimetype)){removeUploadedFile(req.file);return res.status(400).json({error:'الحائط يسمح بصورة أو فيديو فقط'});}
  const media={url:'/uploads/'+req.file.filename,mime:req.file.mimetype,name:req.file.originalname};
  if(scope==='private'){
    const target=getUser(to)||getGuest(to)||null; if(!target){removeUploadedFile(req.file);return res.status(404).json({error:'العضو غير موجود'});}
    const tp=profile(to); if(tp.privateOpen===false&&!canMessageClosedPrivate(u)){removeUploadedFile(req.file);return res.status(403).json({error:`لقد أغلق ${displayName(to)} المحادثة الخاصة`});}
    const ignored=(db.ignored?.[keyName(to)]||[]).some(x=>keyName(x)===keyName(u.name)); if(ignored){removeUploadedFile(req.file);return res.status(403).json({error:`لقد قام ${displayName(to)} بتجاهلك`});}
    const targetSocket=[...socketUsers.entries()].find(([,x])=>keyName(x.name)===keyName(to)); if(!targetSocket){removeUploadedFile(req.file);return res.status(403).json({error:'هذا المستخدم غير متصل'});}
    const privateFilename=path.basename(req.file.filename),privatePath=path.join(PRIVATE_MEDIA_DIR,privateFilename);
    try{fs.renameSync(req.file.path,privatePath);req.file.path=privatePath;media.url='/api/private/media/'+privateFilename;}
    catch(error){removeUploadedFile(req.file);console.error('Private media move failed:',error.message);return res.status(500).json({error:'تعذر تأمين تخزين الوسائط الخاصة'});}
    const m={id:crypto.randomUUID(),room:'__private__',from:u.name,fromDisplayName:displayName(u.name),to,type:'media',media,at:Date.now(),profile:profile(u.name),role:roleOf(u),vip:vipActive(u.name),likes:userLikes(u)};
    const toKey=keyName(to),fromKey=keyName(u.name);
    db.privateMessages=[...(db.privateMessages||[]),m].slice(-5000);
    if(db.privateHidden?.[toKey])db.privateHidden[toKey]=db.privateHidden[toKey].filter(x=>keyName(x)!==fromKey);
    if(db.privateHidden?.[fromKey])db.privateHidden[fromKey]=db.privateHidden[fromKey].filter(x=>keyName(x)!==toKey);
    socketBySession(targetSocket[0])?.emit('private-media',m); return res.json(m);
  }
  if(scope!=='wall'){removeUploadedFile(req.file);return res.status(400).json({error:'نوع إرسال الوسائط غير صحيح'});}
  const previousWall=db.wall.slice();const post={id:crypto.randomUUID(),from:u.name,text:'',media,at:Date.now(),likes:0}; db.wall.push(post);try{save()}catch(e){db.wall=previousWall;removeUploadedFile(req.file);console.error('Wall media save failed:',e.message);return res.status(500).json({error:'تعذر حفظ الوسائط على الحائط'});} io.emit('wall-new',post); res.json(post);
});

function normalizeChatFilterText(value){return String(value||'').normalize('NFKC').toLocaleLowerCase('ar').replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\uFEFF]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[\s\u00A0]+/g,' ').trim();}
function blockedChatTerm(text){const f=db.chatFilter||{};if(f.enabled!==true)return '';const normalized=normalizeChatFilterText(text);return (Array.isArray(f.words)?f.words:[]).find(w=>{const term=normalizeChatFilterText(w);return term&&normalized.includes(term)})||'';}
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
      voiceSpeakers.get(previousRoom)?.delete(sid);clearVoicePairsForSession(previousRoom,sid);for(const peerSid of (roomSockets.get(previousRoom)||new Set()))if(peerSid!==sid)socketBySession(peerSid)?.emit('voice-peer-left',{room:previousRoom,sid});
      if(!u.ghost){const leaveNotice={id:crypto.randomUUID(),room:previousRoom,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'move',exitKind:'room',targetRoom:room,text:'',at:Date.now(),profile:profile(u.name),role:u.role,presenceVisibility:u.hidden?'staff':'public'};try{addMessage(leaveNotice)}catch(e){console.warn('Room-move presence could not be saved:',e.message)}emitPresenceToRoom(previousRoom,leaveNotice);}
      emitVoiceState(previousRoom);
      const oldMembers=roomSockets.get(previousRoom)||new Set();
      for(const memberSid of [...oldMembers]){const active=socketUsers.get(memberSid);if(!active||active.room!==previousRoom)oldMembers.delete(memberSid);}
      if(oldMembers.size===0)roomSockets.delete(previousRoom);
    }
    cancelPrivateConversationCleanup(u.name);socket.data.sid=sid; socket.data.user={...u,room}; socketUsers.set(sid,{...u,room});
    socket.join(room); if(!roomSockets.has(room))roomSockets.set(room,new Set());roomSockets.get(room).add(sid);
    socket.emit('room-joined',{room});
    socket.emit('history',{room,items:roomHistoryWithAnnouncements(room,u,Number(u.created)||0)}); if(!u.ghost){const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'join',text:'',at:Date.now(),profile:profile(u.name),role:u.role,presenceVisibility:u.hidden?'staff':'public'};try{addMessage(pm)}catch(e){console.warn('Join presence could not be saved:',e.message)}emitPresenceToRoom(room,pm);} if(!welcomeSentSessions.has(sid)){for(const item of (db.welcomeMessages||[]).filter(x=>x.enabled!==false&&String(x.text||'').trim())){const welcome={id:'welcome-'+crypto.randomUUID(),room,from:'شات ريماز',displayName:item.title||'الترحيب',type:'welcome',text:item.text,at:Date.now(),profile:{nameColor:'#2877b9',bgColor:'#eaf5ff'}};socket.emit('message',welcome);}welcomeSentSessions.add(sid);} emitState(); const joinedRoom=db.rooms.find(r=>r.id===room); if(joinedRoom?.kind==='voice'){for(const [speakerSid,speaker] of (voiceSpeakers.get(room)||new Map()))socketBySession(speakerSid)?.emit('voice-peer-joined',{room,sid,name:u.name});emitVoiceState(room);}
  });
  socket.on('request-mic',({room,raised,seatIndex}={})=>{
    const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||!room||u.room!==room||!socket.rooms.has(room))return;
    const r=db.rooms.find(x=>x.id===room);if(!r||r.kind!=='voice')return socket.emit('error-msg',{error:'هذا الخيار متاح بالغرف الصوتية فقط'});
    const speakers=voiceSpeakers.get(room)||new Map();
    if(raised){
      const likesRequired=Math.max(0,Number(r.micLikesRequired??30));
      if(userLikes(u)<likesRequired&&!isOwner(u)&&!isAdmin(u)){const error=`تحتاج إلى ${likesRequired} إعجاباً على الأقل لرفع المايك في هذه الغرفة`;socket.emit('voice-mic-denied',{error});return socket.emit('error-msg',{error});}
      const limit=Math.max(1,Math.min(20,Number(r.mics)||5));
      const requested=Number(seatIndex);
      if(!Number.isInteger(requested)||requested<0||requested>=limit){const error='رقم مقعد المايك غير صالح';socket.emit('voice-mic-denied',{error});return socket.emit('error-msg',{error});}
      const occupied=[...speakers.entries()].find(([peerSid,x])=>peerSid!==sid&&Number(x.seatIndex)===requested);
      if(occupied){const error='هذا المقعد مشغول، اختَر مقعداً فارغاً';socket.emit('voice-mic-denied',{error});return socket.emit('error-msg',{error});}
      if(speakers.size>=limit&&!speakers.has(sid)){const error='اكتمل عدد المايكات في هذه الغرفة';socket.emit('voice-mic-denied',{error});return socket.emit('error-msg',{error});}
      const previous=speakers.get(sid);if(previous&&Number(previous.seatIndex)!==requested){const error='أنت مرفوع على مقعد آخر؛ اخفض المايك أولاً';socket.emit('voice-mic-denied',{error});return socket.emit('error-msg',{error});}
      speakers.set(sid,{sid,name:u.name,displayName:displayName(u.name),avatar:profile(u.name).avatar||'',seatIndex:requested,at:Date.now()});voiceSpeakers.set(room,speakers);
      const peers=[...(roomSockets.get(room)||new Set())].filter(peerSid=>peerSid!==sid).map(peerSid=>({sid:peerSid,name:socketUsers.get(peerSid)?.name||''}));
      socket.emit('voice-mic-granted',{room,peers});
    }else{
      speakers.delete(sid);if(!speakers.size)voiceSpeakers.delete(room);
      socket.emit('voice-mic-lowered',{room});
    }
    emitVoiceState(room);
  });
  socket.on('voice-peer-offer',d=>{const u=socket.data.user,sid=socket.data.sid,room=u?.room;if(!u||!sid||!d||d.room!==room||!socket.rooms.has(room)||!allowVoiceSignal(sid)||!validSessionDescription(d.offer,'offer'))return;const speakers=voiceSpeakers.get(room),members=roomSockets.get(room);if(!speakers?.has(sid)||!members?.has(d.to)||d.to===sid)return;const target=socketUsers.get(d.to);if(!target||target.room!==room)return;activeVoicePairs.set(voiceRoomPairKey(room,sid,d.to),{room,a:sid,b:d.to,offerer:sid,created:Date.now()});socketBySession(d.to)?.emit('voice-peer-offer',{room,from:sid,fromName:u.name,offer:d.offer});});
  socket.on('voice-peer-answer',d=>{const u=socket.data.user,sid=socket.data.sid,room=u?.room;if(!u||!sid||!d||d.room!==room||!socket.rooms.has(room)||!allowVoiceSignal(sid)||!validSessionDescription(d.answer,'answer'))return;const speakers=voiceSpeakers.get(room),members=roomSockets.get(room),state=activeVoicePairs.get(voiceRoomPairKey(room,d.to,sid));if(!members?.has(sid)||!speakers?.has(d.to)||!state||state.offerer!==d.to||state.b!==sid)return;socketBySession(d.to)?.emit('voice-peer-answer',{room,from:sid,answer:d.answer});});
  socket.on('voice-peer-ice',d=>{const u=socket.data.user,sid=socket.data.sid,room=u?.room;if(!u||!sid||!d||d.room!==room||!socket.rooms.has(room)||!allowVoiceSignal(sid)||!validIceCandidate(d.candidate))return;const members=roomSockets.get(room),state=activeVoicePairs.get(voiceRoomPairKey(room,sid,d.to));if(!members?.has(sid)||!members?.has(d.to)||!state)return;socketBySession(d.to)?.emit('voice-peer-ice',{room,from:sid,candidate:d.candidate});});
  socket.on('leave-room',({room}={})=>{const u=socket.data.user,sid=socket.data.sid;if(!u||!room)return;socket.leave(room);roomSockets.get(room)?.delete(sid);voiceSpeakers.get(room)?.delete(sid);clearVoicePairsForSession(room,sid);for(const peerSid of (roomSockets.get(room)||new Set()))socketBySession(peerSid)?.emit('voice-peer-left',{room,sid});emitVoiceState(room);if(socketUsers.get(sid))socketUsers.get(sid).room='';if(socket.data.user)socket.data.user.room='';if(!u.ghost){const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'leave',exitKind:'room',text:'',at:Date.now(),profile:profile(u.name),role:u.role,presenceVisibility:u.hidden?'staff':'public'};try{addMessage(pm)}catch(e){console.warn('Leave presence could not be saved:',e.message)}emitPresenceToRoom(room,pm);}{const members=roomSockets.get(room)||new Set();for(const memberSid of [...members]){const active=socketUsers.get(memberSid);if(!active||active.room!==room)members.delete(memberSid);}if(members.size===0){roomSockets.delete(room);try{save()}catch(e){console.error('Room state save failed:',e.message)}}}emitState();});
  socket.on('send-message',d=>{const u=socket.data.user;if(!u)return;const room=String(d?.room||'');if(!room||u.room!==room||!socket.rooms.has(room))return socket.emit('error-msg',{error:'أنت خارج الغرفة'});const targetRoom=db.rooms.find(r=>r.id===room);if(!targetRoom)return socket.emit('error-msg',{error:'الغرفة غير موجودة'});if(roomMuted(u.name,room)||roomBanned(u.name,room))return socket.emit('error-msg',{error:'لا يمكنك الكتابة هنا'});const text=String(d?.text||'').trim();if(!text)return;if(blockedChatTerm(text))return socket.emit('error-msg',{error:'رسالتك تحتوي على كلمة غير مسموح بها'});const m={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'text',text:text.slice(0,2000),at:Date.now(),likes:userLikes(u),role:roleOf(u),vip:vipActive(u.name),profile:profile(u.name)};try{addMessage(m)}catch(e){console.error('Socket room message save failed:',e.message);return socket.emit('error-msg',{error:'تعذر حفظ الرسالة، حاول مرة أخرى'});}io.to(room).emit('message',m);});
  socket.on('private-message',d=>{const u=socket.data.user;if(!u||!d?.to)return;if(globalBanned(u.name,socketClientIp(socket)))return socket.emit('error-msg',{error:'لا يمكنك المراسلة أثناء الحظر العام'});const toKey=keyName(d.to),to=accountKey(d.to),text=String(d.text||'').trim().slice(0,2000);if(!text)return;if(blockedChatTerm(text))return socket.emit('error-msg',{error:'رسالتك تحتوي على كلمة غير مسموح بها'});const tp=profile(to);if(tp.privateOpen===false&&!canMessageClosedPrivate(u))return socket.emit('error-msg',{error:`لقد أغلق ${displayName(to)} المحادثة الخاصة`});const ignored=(db.ignored?.[keyName(to)]||[]).some(x=>keyName(x)===keyName(u.name));if(ignored)return socket.emit('error-msg',{error:`لقد قام ${displayName(to)} بتجاهلك`});if(!getUser(to)&&!getGuest(to))return socket.emit('error-msg',{error:'هذا المستخدم غير موجود'});if(!hasConnectedSessionForUser(to))return socket.emit('error-msg',{error:'العضو غير متصل؛ المحادثات الخاصة مؤقتة بين المتصلين فقط'});const m={id:crypto.randomUUID(),from:u.name,fromDisplayName:displayName(u.name),to,toDisplayName:displayName(to),type:'text',text,at:Date.now(),profile:profile(u.name),role:roleOf(u),vip:vipActive(u.name),likes:userLikes(u)};const previousPrivateMessages=db.privateMessages;const fromKey=keyName(u.name);const previousHiddenTo=db.privateHidden?.[toKey];const previousHiddenFrom=db.privateHidden?.[fromKey];db.privateMessages=[...(db.privateMessages||[]),m].slice(-5000);if(db.privateHidden?.[toKey])db.privateHidden[toKey]=db.privateHidden[toKey].filter(x=>keyName(x)!==fromKey);if(db.privateHidden?.[fromKey])db.privateHidden[fromKey]=db.privateHidden[fromKey].filter(x=>keyName(x)!==toKey);emitToUser(to,'private-message',m);socket.emit('private-message',m);});
  socket.on('call-offer',d=>{const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||(!isOwner(u)&&!canMedia(u))||!d?.to)return;if(!allowCallSignal(sid))return socket.emit('call-failed',{error:'طلبات الاتصال كثيرة جداً، حاول بعد قليل'});if(!validSessionDescription(d.offer,'offer'))return socket.emit('call-failed',{error:'بيانات الاتصال غير صالحة'});const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return socket.emit('call-failed',{error:'المستخدم غير متصل'});if(!canMedia(target[1]))return socket.emit('call-failed',{error:'الاتصال يحتاج 500 إعجاب للطرفين'});for(const [oldPair,oldState] of activeCallPairs){if(!oldState.answered&&Date.now()-oldState.created>120000)activeCallPairs.delete(oldPair);else if(oldState.caller===sid||oldState.callee===sid||oldState.caller===target[0]||oldState.callee===target[0])return socket.emit('call-failed',{error:'أحد الطرفين مشغول باتصال آخر'});}const pair=callPairKey(sid,target[0]),state={caller:sid,callee:target[0],created:Date.now(),video:!!d.video,answered:false};activeCallPairs.set(pair,state);const timeout=setTimeout(()=>{if(activeCallPairs.get(pair)!==state||state.answered)return;activeCallPairs.delete(pair);socket.emit('call-timeout',{from:target[1].name});socketBySession(target[0])?.emit('call-timeout',{from:u.name})},60000);timeout.unref?.();socketBySession(target[0])?.emit('call-offer',{from:u.name,fromDisplayName:displayName(u.name),fromProfile:(()=>{const p=profile(u.name);return {avatar:p.avatar||'',displayName:p.displayName||'',rank:p.rank||'',rankUntil:p.rankUntil||0,gifts:(p.gifts||[]).slice(0,1),vipUntil:p.vipUntil||0}})(),fromRole:roleOf(u),fromVip:vipActive(u.name),fromLikes:userLikes(u),offer:d.offer,video:!!d.video});});
  socket.on('call-answer',d=>{const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||(!isOwner(u)&&!canMedia(u))||!d?.to)return;if(!allowCallSignal(sid))return socket.emit('error-msg',{error:'طلبات الاتصال كثيرة جداً، حاول بعد قليل'});if(!validSessionDescription(d.answer,'answer'))return socket.emit('error-msg',{error:'بيانات الرد غير صالحة'});const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return;const pair=callPairKey(sid,target[0]),state=activeCallPairs.get(pair);if(!state||state.callee!==sid||state.caller!==target[0]||Date.now()-state.created>120000)return;state.answered=true;socketBySession(target[0])?.emit('call-answer',{from:u.name,answer:d.answer,video:state.video});});
  socket.on('call-reject',d=>{const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||!d?.to||!allowCallSignal(sid))return;const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return;const pair=callPairKey(sid,target[0]),state=activeCallPairs.get(pair);if(!state||state.callee!==sid||state.caller!==target[0])return;activeCallPairs.delete(pair);socketBySession(target[0])?.emit('call-rejected',{from:u.name,reason:String(d.reason||'declined').slice(0,32)});});
  socket.on('call-end',d=>{const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||!d?.to)return;const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return;const pair=callPairKey(sid,target[0]),state=activeCallPairs.get(pair);if(!state||(state.caller!==sid&&state.callee!==sid))return;activeCallPairs.delete(pair);socketBySession(target[0])?.emit('call-ended',{from:u.name});});
  socket.on('ice',d=>{const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||!d?.to)return;if(!allowCallSignal(sid))return;if(!validIceCandidate(d.candidate))return;const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return;const state=activeCallPairs.get(callPairKey(sid,target[0]));if(!state||(!state.answered&&Date.now()-state.created>120000))return;socketBySession(target[0])?.emit('ice',{from:u.name,candidate:d.candidate});});
  socket.on('disconnect',()=>{
    const sid=socket.data.sid,u=socket.data.user,room=socket.data.user&&socket.data.user.room;
    if(sid){socketUsers.delete(sid);for(const [pair,state] of activeCallPairs){if(state.caller===sid||state.callee===sid){const other=state.caller===sid?state.callee:state.caller;activeCallPairs.delete(pair);socketBySession(other)?.emit('call-ended',{from:u?.name||''});}}for(const [pair,state] of activeVoicePairs){if(state.a===sid||state.b===sid)activeVoicePairs.delete(pair);}callSignalWindows.delete(sid);voiceSignalWindows.delete(sid);}
    if(room){roomSockets.get(room)?.delete(sid);voiceSpeakers.get(room)?.delete(sid);clearVoicePairsForSession(room,sid);for(const peerSid of (roomSockets.get(room)||new Set()))socketBySession(peerSid)?.emit('voice-peer-left',{room,sid});emitVoiceState(room);}
    if(u&&room&&!u.ghost){const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'leave',exitKind:'chat',text:'',at:Date.now(),profile:profile(u.name),role:u.role,presenceVisibility:u.hidden?'staff':'public'};try{addMessage(pm)}catch(e){console.warn('Disconnect presence could not be saved:',e.message)}emitPresenceToRoom(room,pm);{const members=roomSockets.get(room)||new Set();for(const memberSid of [...members]){const active=socketUsers.get(memberSid);if(!active||active.room!==room)members.delete(memberSid);}if(members.size===0){roomSockets.delete(room);try{save()}catch(e){console.error('Room state save failed:',e.message)}}}}
    if(u?.name)schedulePrivateConversationCleanup(u.name);
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

app.use((err,req,res,next)=>{
  if(res.headersSent)return next(err);
  if(err instanceof multer.MulterError){
    const tooLarge=err.code==='LIMIT_FILE_SIZE';
    return res.status(tooLarge?413:400).json({error:tooLarge?'حجم الملف أكبر من الحد المسموح':'تعذر استقبال الملف؛ تحقق من الملف وحاول مجدداً'});
  }
  if(err && /نوع الملف غير مسموح|اختر صورة بصيغة مدعومة/.test(String(err.message||'')))return res.status(415).json({error:err.message});
  console.error('Unhandled request error:',err);
  return res.status(500).json({error:'حدث خطأ غير متوقع في الخادم'});
});
app.get(/.*/,(req,res)=>{ if (!INDEX_FILE) return res.status(500).send('Rimaz setup error: index.html is missing from the deployment package.'); res.sendFile(INDEX_FILE); });
server.listen(PORT,()=>console.log(`Rimaz server listening on ${PORT}`));
function gracefulShutdown(signal){
  if(messageSaveTimer){clearTimeout(messageSaveTimer);messageSaveTimer=null;}
  try{save();}catch(error){console.error(`Final database save failed during ${signal}:`,error.message);}
  io.close(()=>process.exit(0));
  const forceExit=setTimeout(()=>process.exit(1),10000);forceExit.unref?.();
}
process.once('SIGTERM',()=>gracefulShutdown('SIGTERM'));
process.once('SIGINT',()=>gracefulShutdown('SIGINT'));
