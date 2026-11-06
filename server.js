const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const { Readable } = require('stream');
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
// Static assets must not serve index.html before the dynamic SEO-aware page handler.
app.get('/index.html', (req,res)=>res.redirect(301,'/'));
app.use(express.static(path.join(ROOT, 'public'), { index: false }));

function escapeHtmlAttribute(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function renderSeoIndex() {
  if (!INDEX_FILE) return null;
  let html = fs.readFileSync(INDEX_FILE, 'utf8');
  const settings = db?.siteSettings || {};
  const siteName = String(settings.siteName || 'دردشة ريماز العراقية').trim().slice(0,60);
  const description = String(settings.tagline || 'دردشة ريماز العراقية - دردشة عراقية للتواصل والتعارف والغرف والمحادثات العامة والخاصة.').trim().slice(0,300);
  const title = `${siteName} | دردشة عراقية وتعارف`;
  const setMeta = (key, value, attr='name') => {
    const escaped = escapeHtmlAttribute(value);
    html = html.replace(/<meta\b[^>]*>/gi, tag => {
      const match = tag.match(attr === 'property' ? /\bproperty=["']([^"']+)["']/i : /\bname=["']([^"']+)["']/i);
      if (!match || match[1].toLowerCase() !== key.toLowerCase()) return tag;
      if (/\bcontent=["'][^"']*["']/i.test(tag)) return tag.replace(/(\bcontent=["'])[^"']*(["'])/i, `$1${escaped}$2`);
      return tag.replace(/\s*\/?>$/, ` content="${escaped}">`);
    });
  };
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlAttribute(title)}</title>`);
  setMeta('description', description, 'name');
  setMeta('og:site_name', siteName, 'property');
  setMeta('og:title', siteName, 'property');
  setMeta('og:description', description, 'property');
  setMeta('twitter:title', siteName, 'name');
  setMeta('twitter:description', description, 'name');
  html = html.replace(/(<script\s+type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/i, (whole, open, body, close) => {
    try { const schema = JSON.parse(body); schema.name = siteName; schema.description = description; return open + JSON.stringify(schema).replace(/</g,'\\u003c') + close; }
    catch { return whole; }
  });
  return html;
}
function sendSeoIndex(req,res) {
  if (!INDEX_FILE) return res.status(500).send('Rimaz setup error: index.html is missing from the deployment package.');
  try {
    const html = renderSeoIndex();
    res.set({ 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store, no-cache, must-revalidate', 'X-Robots-Tag':'index, follow' });
    return res.status(200).send(html);
  } catch (error) {
    console.error('SEO page rendering failed:', error);
    return res.sendFile(INDEX_FILE);
  }
}
// Render SEO metadata on the server so search engines receive the saved description in raw HTML.
app.get('/', sendSeoIndex);

const defaults = () => ({
  users: {}, guests: {}, sessions: {}, messages: [], wall: [], wallEnabled:true, notifications: {}, announcements: [], adminAuditLogs: [], loginHistory: [], adCampaigns: [], subscriptionPlans: [], subscriptions: [], ownerSetupCompleted:false, giftCatalogV3Initialized:false, smileysSeedVersion:0, smileysSeeded:false, rankDefinitions:[], rankArtCatalog:[], siteSettings: {siteName:'دردشة ريماز عراقية',tagline:'دردشة ريماز العراقية - دردشة عراقية للتواصل والتعارف والغرف والمحادثات العامة والخاصة.',notice:'',allowRegistration:true,allowGuests:true,modules:{wall:true,privateChat:true,voiceRooms:true,videoCalls:true,gifts:true}}, chatFilter: {enabled:false, words:[]}, welcomeMessages: [
    {id:'welcome-visitors',title:'دردشة ريماز عراقية',text:'إعزإئنا زوإر (دردشة ريماز عراقية)\nحياَكم الله منـورين الشاَت . الاعضاء الجدد نتمنيُ لكم اوقاَت سعيده',enabled:true},
    {id:'welcome-search',title:'الترحيب',text:'عزيزي الزائر للرجوع الينا اكتب في محرك البحث ( دردشة ريماز عراقية )\nنتمنا لكم وقت ممتعا',enabled:true}
  ],
  profiles: {}, lastLike: {}, accountPermissions: {}, permissionModelVersion:0, rankAudit: [], giftCatalog: [],
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
if(!Array.isArray(db.loginHistory)) db.loginHistory=[];
if(!Array.isArray(db.adCampaigns)) db.adCampaigns=[];
if(!Array.isArray(db.subscriptionPlans)) db.subscriptionPlans=[];
if(!Array.isArray(db.subscriptions)) db.subscriptions=[];
if(!db.siteSettings||typeof db.siteSettings!=='object') db.siteSettings={siteName:'دردشة ريماز عراقية',tagline:'دردشة ريماز العراقية - دردشة عراقية للتواصل والتعارف والغرف والمحادثات العامة والخاصة.',notice:'',allowRegistration:true,allowGuests:true,modules:{}};
const DEFAULT_SITE_MODULES={wall:true,privateChat:true,voiceRooms:true,videoCalls:true,gifts:true};
if(!db.siteSettings.modules||typeof db.siteSettings.modules!=='object')db.siteSettings.modules={};
for(const [key,value] of Object.entries(DEFAULT_SITE_MODULES))db.siteSettings.modules[key]=db.siteSettings.modules[key]!==false;
Object.assign(db.siteSettings,{siteName:String(db.siteSettings.siteName||'دردشة ريماز عراقية').slice(0,60),tagline:String(db.siteSettings.tagline||'دردشة ريماز العراقية - دردشة عراقية للتواصل والتعارف والغرف والمحادثات العامة والخاصة.').slice(0,300),notice:String(db.siteSettings.notice||'').slice(0,300),allowRegistration:db.siteSettings.allowRegistration!==false,allowGuests:db.siteSettings.allowGuests!==false});
function siteModuleEnabled(name){return db.siteSettings?.modules?.[name]!==false;}
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
// One permission model: the seven visible ranks. Legacy generic roles are migrated once below.
const RANK_PERMISSION_PROFILES=['admin-full','admin-shield','crown-gold','crown-silver','super-black','super-white','super-red'];
const CORE_RANK_LEVELS=Object.freeze({'admin-full':1000,'admin-shield':900,'crown-gold':800,'crown-silver':700,'super-black':600,'super-white':500,'super-red':400});
db.accountPermissions=db.accountPermissions&&typeof db.accountPermissions==='object'?db.accountPermissions:{};
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
  return {id:String(item.id)+'-'+roomId+'-'+idSuffix,announcementId:String(item.id),room:String(roomId),from:'الإدارة',displayName:'الإدارة',title:item.title||'إعلان إداري',role:'member',type:'announcement',text:item.text,at,duration:item.duration,profile:{}};
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
function roleOf(u){if(!u)return 'member';return isOwnerName(u.name)?'owner':'member';}
function canMessageClosedPrivate(u){return !!(u&&(isOwner(u)||hasPermission(u,'private_chat_override')));}
function isOwner(u){return !!u&&isOwnerName(u.name);}
function isAdmin(u){return !!u&&(isOwner(u)||hasPermission(u,'panel_access'));}
function isStaff(u){return !!u&&(isOwner(u)||['panel_access','presence_hidden_view','kick_room','ban_room','mute_room','global_kick','global_ban','rank_art_manage','member_decoration_manage'].some(p=>hasPermission(u,p)));}
function findKey(obj,name){ const wanted=keyName(name); return Object.keys(obj||{}).find(k=>keyName(k)===wanted); }
function getUser(name){ const k=findKey(db.users,name); return k ? db.users[k] : null; }
function getGuest(name){ const k=findKey(db.guests,name); return k ? db.guests[k] : null; }
function accountKey(name){ return findKey(db.users,name) || findKey(db.guests,name) || cleanName(name); }
function userLikes(u){ if(!u)return 0;if(isOwner(u))return 999999;return Number(getUser(u.name)?.likes??getGuest(u.name)?.likes??u.likes??0); }
function level(l){ l=Number(l)||0; return l>=500?3:l>=400?2:1; }
function canNotice(u){ return !!u&&(isOwner(u)||hasPermission(u,'staff_notice')||Number(getUser(u.name)?.likes??getGuest(u.name)?.likes??u.likes??0)>=400); }
function canMedia(u){ return !!u&&(isOwner(u)||hasPermission(u,'staff_media')||Number(getUser(u.name)?.likes??getGuest(u.name)?.likes??u.likes??0)>=500); }
function vipActive(name){ const p=profile(name); if(p.vipUntil&&p.vipUntil>Date.now()) return true; if(p.vipUntil){delete p.vipUntil; save();} return false; }
function defaultStatus(name){ return getGuest(name) ? '(غير مسجل)' : '(عضو جديد)'; }
function profile(name){
  if (!db.profiles[name]) db.profiles[name]={displayName:cleanName(name),avatar:'',status:defaultStatus(name),bio:'عضو في دردشة ريماز عراقية',nameColor:'#222222',fontColor:'#222222',bgColor:'#ffffff',privateOpen:true,notificationsOpen:true};
  const p=db.profiles[name];
  if(!p.displayName) p.displayName=cleanName(name);
  const visualRank=rankDefinition(p.rank);
  p.rankArt=visualRank?.artUrl||'';
  p.customDecorationImage=String(p.customDecorationImage||'');
  // Expire temporary visual ranks without changing the existing badge artwork or staff role.
  if(p.rankUntil && Number(p.rankUntil)<=Date.now()) { p.rank='none'; delete p.rankUntil; delete p.rankPreviousRole; delete p.rankDurationDays; save(); }
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
function sessionUser(sid){ const s=sessions.get(sid); if(!s)return null; const role=roleOf(s); return {...s, role, owner:isOwner(s), admin:isAdmin(s), staff:isStaff(s), myPermissions:Object.keys(PERMISSION_CATALOG).filter(permission=>hasPermission(s,permission)), panelAccess:isOwner(s)||hasPermission(s,'panel_access'), vip:vipActive(s.name), likes:isOwner(s)?999999:userLikes(s)}; }
function makeSession(name,type,visibility={}){
  const sid=crypto.randomBytes(24).toString('hex');
  const s={name,type,created:Date.now(),hidden:!!visibility.hidden,ghost:!!visibility.ghost}; sessions.set(sid,s); db.sessions[sid]=s; save(); return sid;
}
function requireAuth(req,res,next){
  const u=sessionUser(req.get('x-session')); if(!u)return res.status(401).json({error:'يجب تسجيل الدخول'}); req.user=u; next();
}
app.get('/api/private/media/:filename',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});
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
  messages_delete:'حذف الرسائل', announcement_post:'نشر الإعلانات', announcement_delete:'حذف الإعلانات',
  gifts:'إرسال الهدايا', vip:'منح VIP', profile_edit:'تعديل ألوان الملف الشخصي',
  avatar_delete:'حذف الصور', grant_likes:'منح اللايكات',
  rank_assign:'منح الشارات ومدتها', rank_art_manage:'إدارة مكتبة أشكال الرتب وربطها بالرتب', member_decoration_manage:'تخصيص وإزالة زخرفة عضو محدد', permission_manage:'تعديل صلاحيات الرتب', member_ip:'عرض IP',
  reset_likes:'تصفير اللايكات', shortcuts_manage:'إدارة الاختصارات', smileys_manage:'إدارة السميلات', room_move:'نقل عضو بين الغرف', room_create:'إنشاء غرفة', room_edit:'تعديل بيانات الغرفة', room_delete:'حذف غرفة', room_lock:'تعيين أو إزالة كلمة مرور الغرفة', room_image_manage:'إدارة صور الغرف', gift_catalog_manage:'إضافة وحذف هدايا الكتالوج', wall_stop:'إيقاف الحائط', wall_restart:'تشغيل الحائط', wall_clear:'حذف جميع منشورات الحائط', wall_delete_user:'حذف منشورات عضو محدد من الحائط', welcome_manage:'إدارة رسائل الترحيب',
  audit_view:'عرض سجل العمليات وتصديره', stats_view:'عرض إحصائيات الموقع', chat_filter_manage:'إدارة فلتر الكلمات', member_status_manage:'إدارة حالات الأعضاء', private_chat_override:'تجاوز إغلاق المحادثات الخاصة', presence_hidden_view:'مشاهدة الأعضاء المخفيين', hidden_login:'الدخول المخفي', ghost_login:'دخول الشبح', staff_notice:'إرسال تنبيهات إدارية', staff_media:'إرسال وسائط إدارية', voice_mic_override:'تجاوز شرط اللايكات للمايكات', site_admin:'إدارة الموقع الكاملة (الإعدادات والسجلات وصحة الخادم والنسخ والاستعادة)', subscriptions_manage:'إدارة خطط واشتراكات الأعضاء وتجديدها وإلغاؤها', ads_manage:'إدارة الحملات الإعلانية والصور والروابط والمدد', control_center_manage:'التحكم بتشغيل وإيقاف وحدات الدردشة', audit_details_view:'عرض تفاصيل الأهداف والإجراءات في سجل العمليات'
};
// Every permission is an independent capability; no rank name grants implicit access.
const ALL_PERMISSION_KEYS=Object.keys(PERMISSION_CATALOG);
// Convert old bundled permissions into the granular capabilities used by the current UI.
function normalizePermissionList(list){
 const set=new Set(Array.isArray(list)?list:[]);
 if(set.has('rooms_manage')){for(const key of ['room_create','room_edit','room_delete','room_lock','room_image_manage'])set.add(key);set.delete('rooms_manage');}
 if(set.has('chat_tools_manage')){set.add('shortcuts_manage');set.add('smileys_manage');set.delete('chat_tools_manage');}
 if(set.has('gifts'))set.add('gift_catalog_manage');
 return [...set].filter(key=>Object.hasOwn(PERMISSION_CATALOG,key));
}
const DEFAULT_RANK_PERMISSIONS = {
  'admin-full':[...ALL_PERMISSION_KEYS],
  'admin-shield':['panel_access','users_view','kick_room','mute_room','messages_delete'],
  'crown-gold':['panel_access','users_view','kick_room','mute_room','announcement_post'],
  'crown-silver':['panel_access','users_view','kick_room'],
  'super-black':['panel_access','users_view','mute_room'],
  'super-white':['panel_access','users_view'],
  'super-red':['panel_access'],
};
const LEGACY_RANK_DEFINITIONS=[
 {id:'admin-full',name:'ADMIN كامل الصلاحيات',level:1000,icon:'👑',permissions:[...DEFAULT_RANK_PERMISSIONS['admin-full']]},
 {id:'admin-shield',name:'الإداري',level:900,icon:'⬟',permissions:[...DEFAULT_RANK_PERMISSIONS['admin-shield']]},
 {id:'crown-gold',name:'البنر الذهبي',level:800,icon:'♛',permissions:[...DEFAULT_RANK_PERMISSIONS['crown-gold']]},
 {id:'crown-silver',name:'البنر الفضي',level:700,icon:'♛',permissions:[...DEFAULT_RANK_PERMISSIONS['crown-silver']]},
 {id:'super-black',name:'السوبر الأسود',level:600,icon:'★',permissions:[...DEFAULT_RANK_PERMISSIONS['super-black']]},
 {id:'super-white',name:'السوبر الأبيض',level:500,icon:'★',permissions:[...DEFAULT_RANK_PERMISSIONS['super-white']]},
 {id:'super-red',name:'السوبر الأحمر',level:400,icon:'★',permissions:[...DEFAULT_RANK_PERMISSIONS['super-red']]}
];
if(!Array.isArray(db.rankDefinitions))db.rankDefinitions=[];
for(const legacy of LEGACY_RANK_DEFINITIONS){
 const existing=db.rankDefinitions.find(r=>String(r.id)===legacy.id);
 if(!existing){const saved=Array.isArray(db.rolePermissions?.[legacy.id])?db.rolePermissions[legacy.id]:null;db.rankDefinitions.push({...legacy,permissions:saved?normalizePermissionList(saved):[...legacy.permissions]});}
 else {if(!Array.isArray(existing.permissions)){existing.permissions=[...legacy.permissions];}if(existing.baseRole!==undefined){delete existing.baseRole;}}
}
for(const r of db.rankDefinitions){r.permissions=normalizePermissionList(r.permissions);if(!Number.isFinite(Number(r.level)))r.level=0;delete r.baseRole;}
const validBuiltInRanks=new Set(RANK_PERMISSION_PROFILES);const rankCountBeforePrune=db.rankDefinitions.length;db.rankDefinitions=db.rankDefinitions.filter(r=>validBuiltInRanks.has(r.id));if(db.rankDefinitions.length!==rankCountBeforePrune)for(const p of Object.values(db.profiles||{})){if(p?.rank&&p.rank!=='none'&&!validBuiltInRanks.has(p.rank)){p.rank='none';delete p.rankUntil;delete p.rankPreviousRole;delete p.rankDurationDays;}}
function rankDefinition(id){const rank=String(id||'');if(!RANK_PERMISSION_PROFILES.includes(rank))return null;return (db.rankDefinitions||[]).find(r=>String(r.id)===rank)||null;}
function coreRankLevelForName(name){const canonical=accountKey(name)||cleanName(name);if(!canonical||isOwnerName(canonical))return null;const p=profile(canonical),rank=String(p?.rank||'');return Object.hasOwn(CORE_RANK_LEVELS,rank)&&(!p.rankUntil||Number(p.rankUntil)>Date.now())?CORE_RANK_LEVELS[rank]:null;}
function higherRankTargetError(actor,targetName){if(!actor||isOwner(actor)||!targetName||isOwnerName(targetName))return false;if(hasPermission(actor,'permission_manage'))return false;const actorLevel=coreRankLevelForName(actor.name),targetLevel=coreRankLevelForName(targetName);return actorLevel!==null&&targetLevel!==null&&targetLevel>actorLevel;}
function denyHigherRankTarget(actor,targetName,res){if(!higherRankTargetError(actor,targetName))return false;res.status(403).json({error:'صلاحية هذه الرتبة أعلى منك',code:'HIGHER_RANK_PROTECTED'});return true;}
function effectivePermissionsForUser(user){
 if(!user)return new Set();
 if(isOwner(user))return new Set(ALL_PERMISSION_KEYS);
 const name=keyName(user.name||''),accountSet=db.accountPermissions?.[name];
 if(Array.isArray(accountSet))return new Set(accountSet.filter(p=>Object.hasOwn(PERMISSION_CATALOG,p)));
 const p=user.name?profile(user.name):null;
 const rank=p&&p.rank&&p.rank!=='none'&&(!p.rankUntil||Number(p.rankUntil)>Date.now())?rankDefinition(p.rank):null;
 const inherited=Array.isArray(rank?.permissions)?rank.permissions:[];
 return new Set(inherited.filter(p=>Object.hasOwn(PERMISSION_CATALOG,p)));
}
function hasPermission(user,permission){if(!user||!permission||!Object.hasOwn(PERMISSION_CATALOG,permission))return false;if(isOwner(user))return true;return effectivePermissionsForUser(user).has(permission);}
function hasActiveVisualRank(p){return !!(p&&p.rank&&p.rank!=='none'&&(!p.rankUntil||Number(p.rankUntil)>Date.now())&&!!rankDefinition(p.rank));}
function denyBadgeForRank(name,p,res){if(!hasActiveVisualRank(p))return false;res.status(409).json({error:'لا يمكن استبدالها بهدية أو VIP؛ أزل الرتبة أولاً'});return true;}

// One-time migration only: convert the former generic role/override stores into the single seven-rank model.
function migrateLegacyPermissionModel(){
 if(Number(db.permissionModelVersion)>=3)return;
const legacyRankMap={admin:'admin-full',super:'super-red',banner:'crown-silver'};
const oldGenericProfiles={admin:[...ALL_PERMISSION_KEYS],super:['panel_access','users_view','shortcuts_manage','smileys_manage'],banner:['panel_access','users_view','kick_room','ban_room','mute_room','messages_delete','gifts','announcement_post','announcement_delete','shortcuts_manage','smileys_manage']};
const legacyMeta=db.rolePermissionMeta||{};
for(const [name,account] of [...Object.entries(db.users||{}),...Object.entries(db.guests||{})]){
 const oldRole=String(account?.role||'member');if(!Object.hasOwn(legacyRankMap,oldRole))continue;
 const p=profile(name),mapped=legacyRankMap[oldRole],active=!!p.rank&&p.rank!=='none'&&(!p.rankUntil||Number(p.rankUntil)>Date.now());
 if(!active){p.rank=mapped;delete p.rankUntil;p.rankGrantedName=rankDefinition(mapped)?.name||mapped;}
 const assignedRank=active?p.rank:mapped,rankDef=rankDefinition(assignedRank);
 const oldRolePermissions=normalizePermissionList(Array.isArray(db.rolePermissions?.[oldRole])?db.rolePermissions[oldRole]:oldGenericProfiles[oldRole]);
 const rankPermissions=normalizePermissionList(rankDef?.permissions);
 const baseWasCustomized=legacyMeta.customized?.[oldRole]===true,rankWasCustomized=!!(rankDef&&legacyMeta.customized?.[assignedRank]===true);
 const baseUpdated=Number(legacyMeta.updatedAt?.[oldRole]||0),rankUpdated=Number(rankDef?.updatedAt||legacyMeta.updatedAt?.[assignedRank]||0);
 const baseWins=baseWasCustomized?(!rankWasCustomized||baseUpdated>rankUpdated):!rankWasCustomized;
 const selected=baseWins?oldRolePermissions:rankPermissions;
 const key=keyName(name),oldManual=Array.isArray(db.permissionOverrides?.[key])?db.permissionOverrides[key]:[];
 if(rankDef&&assignedRank===mapped&&baseWins){rankDef.permissions=normalizePermissionList(selected);if(baseUpdated)rankDef.updatedAt=baseUpdated;}
 else if(assignedRank!==mapped&&baseWins){db.accountPermissions[key]=normalizePermissionList([...selected,...oldManual]);}
 account.role='member';
}
// Convert old additive per-member arrays to an exact permission set without reducing current access.
for(const [name,legacy] of Object.entries(db.permissionOverrides||{})){
 const key=keyName(name);
 if(Array.isArray(legacy)){
  const p=profile(name),rank=p.rank&&(!p.rankUntil||Number(p.rankUntil)>Date.now())?rankDefinition(p.rank):null;
  const inherited=Array.isArray(rank?.permissions)?rank.permissions:[];
  if(!Array.isArray(db.accountPermissions[key]))db.accountPermissions[key]=normalizePermissionList([...inherited,...legacy]);
 }else if(legacy&&typeof legacy==='object'&&legacy.mode==='replace'&&Array.isArray(legacy.permissions)&&!Array.isArray(db.accountPermissions[key])){
  db.accountPermissions[key]=normalizePermissionList(legacy.permissions);
 }
 if(name!==key)delete db.permissionOverrides[name];
}
// Normalize exact per-account sets, then retire all duplicate legacy stores.
for(const [name,permissions] of Object.entries(db.accountPermissions||{}))if(Array.isArray(permissions))db.accountPermissions[name]=normalizePermissionList(permissions);
delete db.rolePermissions;delete db.rolePermissionMeta;delete db.permissionOverrides;
db.permissionModelVersion=3;
 try{save()}catch(error){console.error('Rank permission model migration could not be saved:',error.message)}
}
migrateLegacyPermissionModel();
// One-time permission-schema migration: preserve full-admin intent when new admin capabilities are introduced.
// Only accounts/ranks that already held every prior capability receive the new ones; limited custom overrides stay limited.
if(Number(db.adminFeaturePermissionMigrationVersion||0)<1){
 const introduced=['subscriptions_manage','ads_manage','control_center_manage'];
 const previous=ALL_PERMISSION_KEYS.filter(key=>!introduced.includes(key));
 const adminFull=rankDefinition('admin-full');
 if(adminFull&&previous.every(key=>(adminFull.permissions||[]).includes(key)))adminFull.permissions=[...new Set([...(adminFull.permissions||[]),...introduced])];
 for(const permissions of Object.values(db.accountPermissions||{}))if(Array.isArray(permissions)&&previous.every(key=>permissions.includes(key)))for(const key of introduced)if(!permissions.includes(key))permissions.push(key);
 db.adminFeaturePermissionMigrationVersion=1;
 try{save();}catch(error){console.error('Could not persist v46.76 permission migration:',error.message);}
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
 if(p.startsWith('/api/admin/subscriptions'))return 'subscriptions_manage';
 if(p.startsWith('/api/admin/ads'))return 'ads_manage';
 if(p.startsWith('/api/admin/control-center'))return 'control_center_manage';
 if(p==='/api/admin/chat-filter')return 'chat_filter_manage';
 if(p==='/api/admin/profile/status')return 'member_status_manage';
 if(p==='/api/admin/chat-tools')return req.method==='GET'?'shortcuts_manage':(req.body&&Array.isArray(req.body.smileys)&&req.body.smileys.length?'smileys_manage':'shortcuts_manage');
 if(p==='/api/admin/rank')return 'rank_assign';
 if(p==='/api/admin/permissions')return 'permission_manage';
 if(p.startsWith('/api/admin/member-ip/'))return 'member_ip';
 if(p==='/api/admin/reset-likes')return 'reset_likes'; if(p==='/api/admin/unban')return 'ban_room'; if(p==='/api/admin/unmute')return 'mute_room';
 if(p==='/api/admin/grant-like')return 'grant_likes';
 if(p==='/api/admin/broadcast')return 'announcement_post'; if(p.startsWith('/api/admin/announcement/'))return 'announcement_delete';
 if(p.startsWith('/api/admin/message/'))return 'messages_delete';
 if(p==='/api/admin/move-member')return 'room_move';
 if(p.startsWith('/api/admin/wall/control')){const a=String(req.body?.action||'');return a==='stop'?'wall_stop':a==='restart'?'wall_restart':a==='clear'?'wall_clear':a==='delete-user'?'wall_delete_user':'wall_stop';}
 if(p.startsWith('/api/admin/room')){if(p==='/api/admin/room'&&req.method==='POST')return 'room_create';if(/\/lock$/.test(p))return 'room_lock';if(/\/image(?:\/delete)?$/.test(p))return 'room_image_manage';if(req.method==='DELETE'&&/^\/api\/admin\/room\/[^/]+$/.test(p))return 'room_delete';if(req.method==='PATCH')return 'room_edit';return 'room_edit';}
 if(p.startsWith('/api/admin/profile/'))return 'profile_edit';
 if(p.startsWith('/api/admin/avatar/'))return 'avatar_delete';
 if(p==='/api/admin/welcome-messages')return 'welcome_manage';
 if(p==='/api/admin/gift-vip'||p.startsWith('/api/admin/vip/'))return 'vip';
 if(p==='/api/admin/gift')return 'gifts';
 if(p==='/api/admin/gifts/catalog')return 'gift_catalog_manage';
 if(p==='/api/admin/grant-like')return 'grant_likes';
 return 'panel_access';
}
function requireAdmin(req,res,next){ requireAuth(req,res,()=>{const permission=permissionForAdminPath(req);if(!hasPermission(req.user,permission))return res.status(403).json({error:'ما عندك صلاحية لهذا القسم أو الإجراء'});const write=['POST','PUT','PATCH','DELETE'].includes(req.method);if(write){res.on('finish',()=>{if(res.statusCode<200||res.statusCode>=300)return;try{db.adminAuditLogs=db.adminAuditLogs||[];const body=req.body&&typeof req.body==='object'?req.body:{};const target=String(body.name||body.target||body.member||'').slice(0,40);const action=String(body.action||body.operation||body.rank||body.planId||body.title||'').slice(0,80);db.adminAuditLogs.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),at:Date.now(),actor:String(req.user?.name||'إدارة').slice(0,32),method:req.method,path:String(req.path||'').slice(0,120),status:res.statusCode,target,action,details:[target&&('العضو: '+target),action&&('التفصيل: '+action)].filter(Boolean).join(' · ')});db.adminAuditLogs=db.adminAuditLogs.slice(0,500);save();}catch(e){console.error('Admin audit log save failed:',e.message)}});}return next();}); }
// Presence visibility is enforced per viewer on the server. A ghost is visible only
// to its own session; hidden accounts are visible to staff ranks and their own session.
function canSeePresence(viewer,target){
  if(!target)return false;
  if(viewer&&keyName(viewer.name)===keyName(target.name))return true;
  const sameAccountSessions=[...sessions.entries()].filter(([sid,u])=>socketUsers.has(sid)&&keyName(u.name)===keyName(target.name));
  if(sameAccountSessions.some(([,u])=>u.ghost))return false;
  if(target.ghost)return false;
  if(target.hidden)return !!viewer&&(isOwner(viewer)||hasPermission(viewer,'presence_hidden_view')); 
  return true;
}
function canSeePresenceNotice(viewer,notice){
  if(!notice||notice.presenceVisibility!=='staff')return true;
  return !!viewer&&(keyName(viewer.name)===keyName(notice.from)||isOwner(viewer)||hasPermission(viewer,'presence_hidden_view'));
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
function recordLoginEvent(req,name,type,mode='normal'){
  try{const rawIp=requestClientIp(req);let ip=rawIp;if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(rawIp))ip=rawIp.split('.').slice(0,3).join('.')+'.0';else if(rawIp.includes(':'))ip=rawIp.split(':').slice(0,4).join(':')+'::';
    db.loginHistory=Array.isArray(db.loginHistory)?db.loginHistory:[];db.loginHistory.unshift({id:crypto.randomUUID(),at:Date.now(),name:String(name||'').slice(0,32),type:String(type||'member'),mode:String(mode||'normal'),ip,agent:String(req.get('user-agent')||'').slice(0,180)});db.loginHistory=db.loginHistory.slice(0,1000);save();
  }catch(error){console.error('Login history save failed:',error.message)}
}
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
// Database restore uploads are kept in memory only, capped tightly, and never
// written into the public uploads directory.
const restoreUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1,fields:0}});
const pendingDatabaseRestores = new Map();
function validateDatabaseRestoreFile(buffer){
  if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>20*1024*1024)throw new Error('حجم ملف النسخة غير صالح');
  let parsed;try{parsed=JSON.parse(buffer.toString('utf8'));}catch(_){throw new Error('ملف النسخة ليس JSON صالحاً');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!['rimaz-database-backup','rimaz-full-backup'].includes(parsed.format)||parsed.version!==1||!parsed.database||typeof parsed.database!=='object'||Array.isArray(parsed.database))throw new Error('صيغة النسخة غير مدعومة أو تالفة');
  const template=defaults(),incoming=parsed.database,clean={};
  for(const [key,defaultValue] of Object.entries(template)){
    if(key==='sessions'||key==='privateMessages'){clean[key]=key==='sessions'?{}:[];continue;}
    const value=incoming[key];
    if(value===undefined){clean[key]=defaultValue;continue;}
    const valid=Array.isArray(defaultValue)?Array.isArray(value):defaultValue&&typeof defaultValue==='object'?value&&typeof value==='object'&&!Array.isArray(value):typeof value===typeof defaultValue;
    if(!valid)throw new Error('نوع بيانات غير صالح داخل النسخة: '+key);
    clean[key]=value;
  }
  if(!clean.users||!clean.guests||!Array.isArray(clean.rooms)||!Array.isArray(clean.messages))throw new Error('النسخة لا تحتوي البنية الأساسية لقاعدة بيانات ريماز');
  if(Object.keys(clean.users).length>100000||Object.keys(clean.guests).length>100000||clean.rooms.length>10000||clean.messages.length>2000000)throw new Error('حجم البيانات داخل النسخة يتجاوز الحدود الآمنة');
  return {parsed,clean,summary:{members:Object.keys(clean.users).length,guests:Object.keys(clean.guests).length,rooms:clean.rooms.length,messages:clean.messages.length,wall:Array.isArray(clean.wall)?clean.wall.length:0,createdAt:parsed.createdAt||null,appVersion:parsed.appVersion||'غير معروف'}};
}
function restoreContainsOwner(candidate,ownerName){
 const entries=[...Object.entries(candidate.users||{}),...Object.entries(candidate.guests||{})];
 const configured=String(process.env.OWNER_NAME||'').trim();
 if(configured)return entries.some(([name])=>keyName(name)===keyName(configured));
 const wanted=keyName(ownerName);
 if(wanted&&wanted!=='owner'&&entries.some(([name])=>keyName(name)===wanted&&String((candidate.users||{})[name]?.role||(candidate.guests||{})[name]?.role||'')==='owner'))return true;
 return entries.some(([name,account])=>keyName(name)==='owner'||String(account?.role||'')==='owner');
}
function purgeExpiredDatabaseRestores(){const now=Date.now();for(const [token,item] of pendingDatabaseRestores)if(item.expiresAt<=now)pendingDatabaseRestores.delete(token);}

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
  if(db.siteSettings?.allowRegistration===false)return res.status(403).json({error:'تسجيل العضويات متوقف مؤقتاً من إدارة الموقع'});
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
  profile(n); const sid=makeSession(n,'member'); save(); recordLoginEvent(req,n,'member','register'); res.json({sid,user:sessionUser(sid)});
});
app.post('/api/login',(req,res)=>{
  const n=cleanName(req.body.name), p=String(req.body.password||'');
  if(n && globalBanResponse(res,n,requestClientIp(req)))return;
  const u=db.users[n] || Object.entries(db.users).find(([k])=>keyName(k)===keyName(n))?.[1];
  if(!u || !bcrypt.compareSync(p,u.hash))return res.status(401).json({error:'الاسم أو الباسورد غير صحيح'});
  const real=Object.keys(db.users).find(k=>keyName(k)===keyName(n))||n; const sid=makeSession(real,'member'); recordLoginEvent(req,real,'member','normal'); res.json({sid,user:sessionUser(sid)});
});
app.post('/api/login-privileged',(req,res)=>{
  const n=cleanName(req.body.name),p=String(req.body.password||''),mode=String(req.body.mode||'');
  if(!['hidden','ghost'].includes(mode))return res.status(400).json({error:'نوع الدخول غير صحيح'});
  if(n&&globalBanResponse(res,n,requestClientIp(req)))return;
  const u=db.users[n]||Object.entries(db.users).find(([k])=>keyName(k)===keyName(n))?.[1];
  if(!u||!bcrypt.compareSync(p,u.hash))return res.status(401).json({error:'الاسم أو الباسورد غير صحيح'});
  const real=Object.keys(db.users).find(k=>keyName(k)===keyName(n))||n;
  const account={...u,name:real};
  if(mode==='ghost'&&!isOwner(account)&&!hasPermission(account,'ghost_login'))return res.status(403).json({error:'هذا الحساب لا يملك صلاحية دخول الشبح'});
  if(mode==='hidden'&&!isOwner(account)&&!hasPermission(account,'hidden_login'))return res.status(403).json({error:'هذا الحساب لا يملك صلاحية الدخول المخفي'});
  const sid=makeSession(real,'member',{hidden:true,ghost:mode==='ghost'});
  recordLoginEvent(req,real,'member',mode);
  return res.json({sid,user:sessionUser(sid)});
});
app.post('/api/guest',(req,res)=>{
  if(db.siteSettings?.allowGuests===false)return res.status(403).json({error:'دخول الزوار متوقف مؤقتاً من إدارة الموقع'});
  const n=cleanName(req.body.name); if(!n)return res.status(400).json({error:'اكتب اسم الزائر'});
  if(globalBanResponse(res,n,requestClientIp(req)))return;
  if(nameTaken(n))return res.status(409).json({error:'هذا الاسم موجود'});
  db.guests[n]={likes:0,created:Date.now()}; const gp=profile(n); gp.status='(غير مسجل)'; const sid=makeSession(n,'guest'); save(); recordLoginEvent(req,n,'guest','guest'); res.json({sid,user:sessionUser(sid)});
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
app.get('/api/members',requireAuth,(req,res)=>{const online=new Map(getOnlineUsers(req.user).map(x=>[keyName(x.name),x]));const rows=[];const registeredKeys=new Set(Object.keys(db.users).map(keyName));const seenMemberKeys=new Set();for(const [name,u] of Object.entries(db.users)){const normalized=keyName(name);if(hasInvisibleActiveSession(name,req.user))continue;if(seenMemberKeys.has(normalized))continue;seenMemberKeys.add(normalized);const x=online.get(keyName(name));rows.push({name,type:'member',likes:Number(u.likes)||0,points:Number(u.points)||0,level:level(Number(u.likes)||0),profile:profile(name),online:!!x,room:x?.room||'',countryCode:x?.countryCode||'',role:isOwnerName(name)?'owner':'member',vip:vipActive(name)});}for(const [name,g] of Object.entries(db.guests)){const normalized=keyName(name);if(registeredKeys.has(normalized)||seenMemberKeys.has(normalized)||hasInvisibleActiveSession(name,req.user))continue;const x=online.get(normalized);if(x){seenMemberKeys.add(normalized);rows.push({name,type:'guest',likes:Number(g.likes)||0,points:Number(g.points)||0,level:level(Number(g.likes)||0),profile:profile(name),online:true,room:x?.room||'',countryCode:x?.countryCode||'',ignoredByMe:(db.ignored?.[keyName(req.user.name)]||[]).some(x=>keyName(x)===normalized),role:isOwnerName(name)?'owner':'member',vip:false});}}const rank=x=>{if(x.role==='owner')return 0;const r=x.profile?.rank||'';const rankOrder={'admin-full':1,'admin-shield':2,'crown-gold':3,'crown-silver':4,'super-black':5,'super-white':6,'super-red':7};if(rankOrder[r]!==undefined)return rankOrder[r];if(x.vip)return 8;if((x.profile?.gifts||[]).length)return 9;if(x.type==='guest')return 11;return 10;};rows.sort((a,b)=>rank(a)-rank(b)||b.likes-a.likes||a.name.localeCompare(b.name,'ar'));res.json(rows);});
app.get('/api/wall/status',requireAuth,(req,res)=>{res.set('Cache-Control','no-store');res.json({enabled:db.wallEnabled!==false&&siteModuleEnabled('wall')});});
app.get('/api/wall',requireAuth,(req,res)=>{if(!siteModuleEnabled('wall'))return res.status(403).json({error:'ميزة الحائط متوقفة من إدارة الموقع'});const started=Number(req.user.created)||0;res.set('Cache-Control','no-store');res.json(db.wall.filter(x=>Number(x.at||0)>=started).slice(-100).reverse());});
app.post('/api/wall',requireAuth,(req,res)=>{if(!siteModuleEnabled('wall'))return res.status(403).json({error:'ميزة الحائط متوقفة من إدارة الموقع'});if(db.wallEnabled===false)return res.status(403).json({error:'الجدار متوقف مؤقتاً من الإدارة'});const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'اكتب منشورك'});const previous=db.wall.slice();const p={id:crypto.randomUUID(),from:req.user.name,text:text.slice(0,2000),media:null,at:Date.now(),likes:0};db.wall.push(p);db.wall=db.wall.slice(-300);try{save()}catch(e){db.wall=previous;console.error('Wall post save failed:',e.message);return res.status(500).json({error:'تعذر حفظ المنشور'});}io.emit('wall-new',p);res.json(p);});
app.post('/api/wall/like',requireAuth,(req,res)=>{
  if(!siteModuleEnabled('wall'))return res.status(403).json({error:'ميزة الحائط متوقفة من إدارة الموقع'});
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
app.get('/api/private/history',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});const to=cleanName(req.query.to||'');if(!to)return res.status(400).json({error:'اختر عضوًا'});const meKey=keyName(req.user.name),toKey=keyName(to);const items=(db.privateMessages||[]).filter(m=>((keyName(m.from)===meKey&&keyName(m.to)===toKey)||(keyName(m.from)===toKey&&keyName(m.to)===meKey))).slice(-200).map(m=>{const acct=getUser(m.from)||getGuest(m.from);const sender={name:m.from,type:getUser(m.from)?'member':'guest'};return {...m,fromDisplayName:m.fromDisplayName||displayName(m.from),profile:profile(m.from),role:acct?roleOf(sender):'member',vip:vipActive(m.from),likes:userLikes(sender)};});res.set('Cache-Control','no-store');res.json(items);});
app.post('/api/private/read',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});const from=keyName(req.body.from||'');if(!from)return res.status(400).json({error:'المحادثة غير محددة'});db.privateRead=db.privateRead||{};db.privateRead[keyName(req.user.name)]=db.privateRead[keyName(req.user.name)]||{};db.privateRead[keyName(req.user.name)][from]=Date.now();res.json({ok:true});});
app.post('/api/private/read-all',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});const me=keyName(req.user.name);db.privateRead=db.privateRead||{};db.privateRead[me]=db.privateRead[me]||{};for(const m of (db.privateMessages||[])){if(keyName(m.to)!==me)continue;const from=keyName(m.from);const at=Number(m.at)||0;if(at>Number(db.privateRead[me][from]||0))db.privateRead[me][from]=at;}res.json({ok:true});});
app.post('/api/private/hide',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});
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
app.get('/api/private/contacts',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});const meName=req.user.name,meKey=keyName(meName),hidden=new Set((db.privateHidden?.[meKey]||[]).map(keyName)),read=db.privateRead?.[meKey]||{},map=new Map();for(const m of (db.privateMessages||[])){const from=keyName(m.from),to=keyName(m.to),other=from===meKey?m.to:to===meKey?m.from:null;if(!other||hidden.has(keyName(other)))continue;const k=keyName(other),old=map.get(k)||{name:other,last:'',at:0,unread:0};if(Number(m.at)>=old.at){old.name=other;old.last=m.text||'';old.at=Number(m.at)||0;}if(to===meKey&&Number(m.at)>Number(read[k]||0))old.unread++;map.set(k,old);}const rows=[...map.values()].sort((a,b)=>b.at-a.at).map(x=>({name:x.name,profile:profile(x.name),online:[...socketUsers.entries()].some(([sid,u])=>keyName(u.name)===keyName(x.name)&&canSeePresence(req.user,sessions.get(sid))),last:x.last,at:x.at,unread:x.unread}));res.json(rows);});
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
app.post('/api/admin/gift',(req,res)=>{requireAuth(req,res,()=>{if(!siteModuleEnabled('gifts'))return res.status(403).json({error:'الهدايا متوقفة من إدارة الموقع'});if(!hasPermission(req.user,'gifts'))return res.status(403).json({error:'ما عندك صلاحية إرسال الهدايا'});const n=accountKey(req.body.name);if(denyHigherRankTarget(req.user,n,res))return;const gift=cleanName(req.body.gift||'هدية');if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'المستخدم غير موجود'});if(isOwnerName(n))return res.status(403).json({error:'حساب صاحب الموقع محمي من الهدايا الإدارية'});const giftId=String(req.body.giftId||'').trim().slice(0,120);const catalogItem=(db.giftCatalog||[]).find(x=>String(x.id||'')===giftId);if(!catalogItem)return res.status(400).json({error:'الهدية غير موجودة في الكتالوج الحالي؛ حدّث قائمة الهدايا'});const giftIcon=String(catalogItem.icon||'🎁').trim().slice(0,24)||'🎁';const giftImage=String(catalogItem.image||'').startsWith('/')?String(catalogItem.image):'';const record={id:crypto.randomBytes(8).toString('hex'),gift,giftIcon,giftId,giftImage,from:req.user.name,at:Date.now()};const p=profile(n);if(denyBadgeForRank(n,p,res))return;delete p.vipUntil;p.gifts=[record];save();emitToUser(n,'gift',{name:n,gift,giftIcon,giftId,giftImage,from:req.user.name,fromDisplayName:displayName(req.user.name),fromProfile:profile(req.user.name),fromRole:roleOf(req.user)});io.emit('profile-changed',{name:n,profile:p});emitState();res.json({ok:true,gift,giftIcon,giftId,giftImage});});});
app.post('/api/admin/gift/delete',(req,res)=>{requireAuth(req,res,()=>{try{if(!hasPermission(req.user,'gifts'))return res.status(403).json({error:'ما عندك صلاحية حذف الهدايا'});const n=accountKey(req.body.name),target=getUser(n)||getGuest(n);if(denyHigherRankTarget(req.user,n,res))return;if(!target)return res.status(404).json({error:'المستخدم غير موجود'});if((isOwnerName(n)||isOwner({name:n,role:target.role}))&&!(isOwner(req.user)&&keyName(req.user.name)===keyName(n)))return res.status(403).json({error:'حساب صاحب الموقع محمي من حذف الهدايا بواسطة الآخرين'});const p=profile(n);p.gifts=Array.isArray(p.gifts)?p.gifts:[];let index=-1;const requestedId=String(req.body.giftId||'');if(requestedId)index=p.gifts.findIndex(g=>String(g.id||'')===requestedId);if(index<0&&req.body.gift&&req.body.from!==undefined){const gift=String(req.body.gift),from=String(req.body.from||''),at=Number(req.body.at)||0;index=p.gifts.findIndex(g=>String(g.gift||'')===gift&&String(g.from||'')===from&&Number(g.at||0)===at);}if(index<0&&!requestedId&&req.body.gift===undefined&&Number.isInteger(Number(req.body.index)))index=Number(req.body.index);if(!Number.isInteger(index)||index<0||index>=p.gifts.length)return res.status(404).json({error:'الهدية المحددة غير موجودة. حدّث النافذة وافتحها من جديد.'});const removed=p.gifts.splice(index,1)[0];save();io.emit('profile-changed',{name:n,profile:p});emitState();return res.json({ok:true,removed,profile:p});}catch(err){console.error('gift-delete failed:',err);return res.status(500).json({error:'تعذر حذف الهدية من الخادم. راجع سجل الخادم.'});}});});
function countGifImageFrames(buffer){try{if(!Buffer.isBuffer(buffer)||buffer.length<14||!/^GIF8[79]a$/.test(buffer.subarray(0,6).toString('ascii')))return 0;let offset=13;const packed=buffer[10];if(packed&0x80)offset+=3*(1<<((packed&7)+1));let frames=0,guard=0;while(offset<buffer.length&&guard++<10000){const marker=buffer[offset++];if(marker===0x3B)break;if(marker===0x21){if(offset>=buffer.length)return 0;const label=buffer[offset++];if(label===0xF9){if(offset>=buffer.length)return 0;const size=buffer[offset++];offset+=size;if(buffer[offset]===0)offset++;}else{while(offset<buffer.length){const size=buffer[offset++];if(size===0)break;offset+=size;}}continue;}if(marker===0x2C){if(offset+9>buffer.length)return 0;const imagePacked=buffer[offset+8];offset+=9;if(imagePacked&0x80)offset+=3*(1<<((imagePacked&7)+1));if(offset>=buffer.length)return 0;offset++;while(offset<buffer.length){const size=buffer[offset++];if(size===0)break;offset+=size;}frames++;continue;}return 0;}return frames;}catch{return 0;}}
app.post('/api/admin/gifts/catalog/upload',requireAuth,uploadSmallImage.single('file'),validateUploadedContent('image'),(req,res)=>{if(!siteModuleEnabled('gifts')){removeUploadedFile(req.file);return res.status(403).json({error:'الهدايا متوقفة من إدارة الموقع'});}if(!hasPermission(req.user,'gift_catalog_manage')){removeUploadedFile(req.file);return res.status(403).json({error:'ما عندك صلاحية تعديل كتالوج الهدايا'});}try{if(!req.file||req.file.mimetype!=='image/gif'){removeUploadedFile(req.file);return res.status(400).json({error:'ارفع ملف GIF متحرك فقط'});}const gifBytes=fs.readFileSync(path.join(UP_DIR,req.file.filename));const gifFrames=countGifImageFrames(gifBytes);if(gifFrames<2){removeUploadedFile(req.file);return res.status(400).json({error:'ملف GIF لازم يحتوي على إطارين أو أكثر حتى يكون متحركاً'});}const name=cleanName(req.body.name||'').slice(0,40);if(!name){removeUploadedFile(req.file);return res.status(400).json({error:'اكتب اسم الهدية'});}db.giftCatalog=Array.isArray(db.giftCatalog)?db.giftCatalog:[];if(db.giftCatalog.length>=200){removeUploadedFile(req.file);return res.status(400).json({error:'وصلت للحد الأعلى وهو 200 هدية'});}const item={id:crypto.randomUUID(),name,icon:String(req.body.icon||'🎁').slice(0,24),image:'/uploads/'+req.file.filename,price:Math.max(0,Math.min(1000000,Number(req.body.price)||0)),builtin:false,createdAt:Date.now()};db.giftCatalog.push(item);try{save()}catch(error){db.giftCatalog.pop();removeUploadedFile(req.file);throw error;}return res.json({ok:true,gift:item,count:db.giftCatalog.length});}catch(error){console.error('Gift GIF upload failed:',error);removeUploadedFile(req.file);return res.status(500).json({error:'تعذر حفظ الهدية المتحركة'});}});
app.post('/api/admin/gifts/catalog/delete',requireAuth,(req,res)=>{if(!siteModuleEnabled('gifts'))return res.status(403).json({error:'الهدايا متوقفة من إدارة الموقع'});if(!hasPermission(req.user,'gift_catalog_manage'))return res.status(403).json({error:'ما عندك صلاحية تعديل كتالوج الهدايا'});db.giftCatalog=Array.isArray(db.giftCatalog)?db.giftCatalog:[];const id=String(req.body.id||'');let index=id?db.giftCatalog.findIndex(g=>String(g.id)===id):Number(req.body.index);if(!Number.isInteger(index)||index<0||index>=db.giftCatalog.length)return res.status(404).json({error:'الهدية المحددة غير موجودة'});const removed=db.giftCatalog.splice(index,1)[0];try{save()}catch(error){db.giftCatalog.splice(index,0,removed);return res.status(500).json({error:'تعذر حفظ حذف الهدية'});}if(removed?.image?.startsWith('/uploads/')){const file=path.resolve(UP_DIR,path.basename(removed.image));if(file.startsWith(path.resolve(UP_DIR)+path.sep)){try{fs.unlinkSync(file)}catch{}}}else if(removed?.image?.startsWith('/gifts/')){const file=path.resolve(ROOT,'public',removed.image.slice(1));if(file.startsWith(path.resolve(ROOT,'public','gifts')+path.sep)){try{fs.unlinkSync(file)}catch{}}}return res.json({ok:true,removed,count:db.giftCatalog.length});});
app.post('/api/admin/gift-vip',(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'vip'))return res.status(403).json({error:'ما عندك صلاحية منح VIP'});const n=accountKey(req.body.name);if(denyHigherRankTarget(req.user,n,res))return;if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'المستخدم غير موجود'});if(isOwnerName(n)||isOwner({name:n,role:(getUser(n)||getGuest(n)).role}))return res.status(403).json({error:'حساب صاحب الموقع محمي'});const days=Number(req.body.durationDays??1);if(!Number.isInteger(days)||days<1||days>365)return res.status(400).json({error:'مدة VIP يجب أن تكون من يوم إلى 365 يوم'});const p=profile(n);if(denyBadgeForRank(n,p,res))return;p.vipGrantedAt=Date.now();p.vipGrantedBy=req.user.name;p.vipUntil=Date.now()+days*24*60*60*1000;p.gifts=[];try{save()}catch(e){return res.status(500).json({error:'تعذر حفظ عضوية VIP'});}emitToUser(n,'vip-changed',{name:n,vipUntil:p.vipUntil,from:req.user.name});emitToUser(n,'admin-action-notice',{title:'👑 عضوية VIP',text:'منحك '+req.user.name+' عضوية VIP لمدة '+days+' يوم'});io.emit('profile-changed',{name:n,profile:p});emitState();res.json({ok:true,vipUntil:p.vipUntil,durationDays:days});});});
app.post('/api/admin/vip/:name/revoke',requireAuth,(req,res)=>{if(!hasPermission(req.user,'vip'))return res.status(403).json({error:'ما عندك صلاحية إدارة VIP'});const n=accountKey(req.params.name);if(denyHigherRankTarget(req.user,n,res))return;if(isOwnerName(n))return res.status(403).json({error:'حساب صاحب الموقع محمي'});const target=getUser(n)||getGuest(n);if(!target)return res.status(404).json({error:'العضو غير موجود'});const p=profile(n);delete p.vipUntil;delete p.vipGrantedAt;delete p.vipGrantedBy;try{save()}catch(e){return res.status(500).json({error:'تعذر حفظ إزالة VIP'});}emitToUser(n,'vip-changed',{name:n,vipUntil:0,from:req.user.name});io.emit('profile-changed',{name:n,profile:p});emitState();res.json({ok:true});});
app.post('/api/admin/move-member',requireAuth,(req,res)=>{if(!hasPermission(req.user,'room_move'))return res.status(403).json({error:'ما عندك صلاحية نقل الأعضاء بين الغرف'});const n=accountKey(req.body.name),to=String(req.body.to||'');const target=getUser(n)||getGuest(n);if(denyHigherRankTarget(req.user,n,res))return;if(!target)return res.status(404).json({error:'العضو غير موجود'});if(isOwnerName(n)||isOwner({name:n,role:target.role}))return res.status(403).json({error:'صاحب الموقع محمي من النقل الإداري'});const room=db.rooms.find(r=>r.id===to);if(!room)return res.status(404).json({error:'الغرفة الجديدة غير موجودة'});if(req.body.enforceRoomPassword===true&&room.passwordHash&&!bcrypt.compareSync(String(req.body.password||''),room.passwordHash))return res.status(403).json({error:'كلمة مرور الغرفة غير صحيحة'});const active=[...socketUsers.entries()].filter(([,u])=>keyName(u.name)===keyName(n));if(!active.length)return res.status(409).json({error:'العضو غير متصل حالياً؛ حدّث القائمة وجرب مرة ثانية'});const movable=active.filter(([,u])=>(u.room||'public')!==to);if(!movable.length)return res.status(400).json({error:'العضو موجود بالفعل في الغرفة المحددة'});let moved=0;for(const [sid2,u2] of movable){const so=socketBySession(sid2);if(!so)continue;so.emit('admin-moved-room',{room:to,roomName:room.name,from:u2.room||'public'});so.emit('admin-action-notice',{title:'🔀 نقل بين الغرف',text:'تم نقلك إلى '+room.name});moved++;}if(!moved)return res.status(409).json({error:'تعذر نقل العضو؛ حدّث القائمة وجرب مرة ثانية'});emitState();return res.json({ok:true,name:n,to,room:room.name,moved});});
app.post('/api/admin/member-action',(req,res)=>{requireAuth(req,res,()=>{
  const actor=req.user,n=accountKey(req.body.name),action=String(req.body.action||''),room=String(req.body.room||'public');
  if(!n)return res.status(400).json({error:'الاسم مطلوب'});
  if(denyHigherRankTarget(actor,n,res))return;
  if((isOwnerName(n)||isOwner({name:n,role:(getUser(n)||getGuest(n)||{}).role})) && !isOwner(actor)) return res.status(403).json({error:'حساب صاحب الموقع محمي ولا يمكن للإداري طرده أو حظره أو تعديل لايكاته'});
  const actionPermission=({'global-kick':'global_kick','global-ban':'global_ban','kick':'kick_room','ban':'ban_room','mute':'mute_room','grant-like':'grant_likes','reset-likes':'reset_likes','grant-vip':'vip','gift':'gifts'})[action];if(!actionPermission)return res.status(400).json({error:'الإجراء غير معروف'});if(!hasPermission(actor,actionPermission))return res.status(403).json({error:'ما عندك صلاحية لهذا الإجراء'});
  if(action==='global-kick'){ emitToUser(n,'admin-action-notice',{title:'🚪 طرد من الدردشة',text:'قام '+actor.name+' (admin) بطردك من الدردشة'}); removeFromChat(n,false); return res.json({ok:true}); }
  if(action==='global-ban'){ emitToUser(n,'admin-action-notice',{title:'⛔ حظر من الدردشة',text:'قام '+actor.name+' (admin) بحظرك من الدردشة لمدة 5 دقائق'}); db.globalBans=db.globalBans||{}; db.globalIpBans=db.globalIpBans||{}; const until=Date.now()+5*60*1000; const targetIps=new Set(); for(const so of io.sockets.sockets.values()){const sid2=so.data?.sid,u2=so.data?.user||socketUsers.get(sid2);if(u2&&keyName(u2.name)===keyName(n)){const ip=socketClientIp(so);if(ip)targetIps.add(ip);}} db.globalBans[keyName(n)]={name:keyName(n),until}; for(const ip of targetIps)db.globalIpBans[ip]={ip,name:keyName(n),until}; save(); removeFromChat(n,true); return res.json({ok:true,until,ipCount:targetIps.size}); }
  const target=getUser(n)||getGuest(n);
  if(!target && !['kick','ban','mute'].includes(action))return res.status(404).json({error:'المستخدم غير موجود'});
  if(action==='grant-like'&&!hasPermission(actor,'grant_likes'))return res.status(403).json({error:'ما عندك صلاحية منح اللايكات'});
  if(action==='reset-likes'&&!hasPermission(actor,'reset_likes'))return res.status(403).json({error:'ما عندك صلاحية تصفير اللايكات'});
  if(action==='grant-vip'&&!hasPermission(actor,'vip'))return res.status(403).json({error:'ما عندك صلاحية منح VIP'});
  if(action==='grant-like'){const amount=Math.max(1,Math.min(10000,Number(req.body.amount)||1));target.likes=Number(target.likes||0)+amount;save();io.emit('likes-changed',{name:n,likes:target.likes,level:level(target.likes)});emitToUser(n,'admin-action-notice',{title:'❤️ لايكات جديدة',text:'حصلت على '+amount+' لايك من '+actor.name+' (admin)'});return res.json({ok:true,likes:target.likes});}
  if(action==='reset-likes'){if(isOwner({name:n,role:target.role})&&!(isOwner(actor)&&keyName(actor.name)===keyName(n)))return res.status(403).json({error:'لا يمكن تعديل لايكات صاحب الموقع'});target.likes=0;save();io.emit('likes-changed',{name:n,likes:0,level:1});return res.json({ok:true});}
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
    :{id:crypto.randomUUID(),title,text:text.slice(0,2000),from:'الإدارة',displayName:'الإدارة',role:'member',at:Date.now(),duration,profile:{}};
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
  const definition=rank==='none'?null:(RANK_PERMISSION_PROFILES.includes(rank)?rankDefinition(rank):null);
  if(rank!=='none'&&!definition)return res.status(400).json({error:'الرتبة غير موجودة'});
  const rawDays=req.body.durationDays,days=rawDays===undefined||rawDays===null||rawDays===''?0:Number(rawDays);
  if(!Number.isInteger(days)||days<0||days>36500)return res.status(400).json({error:'المدة يجب أن تكون 0 أو عدد أيام صحيح بين 1 و36500'});
  if(definition){
    const actorCanGrantElevatedRank=isOwner(actor);
    const actorPermissions=ALL_PERMISSION_KEYS.filter(k=>hasPermission(actor,k));
    if(!actorCanGrantElevatedRank&&definition.permissions.some(k=>!actorPermissions.includes(k)))return res.status(403).json({error:'لا يمكنك منح رتبة تحتوي صلاحيات أعلى من صلاحياتك'});
  }
  const p=profile(n),previousProfile=JSON.parse(JSON.stringify(p));
  const previousRankAudit=db.rankAudit,previousNotifications=db.notifications?.[n]?JSON.parse(JSON.stringify(db.notifications[n])):undefined;
  const grantedAt=Date.now();
  delete p.rankPreviousRole;
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
    db.profiles[n]=previousProfile;db.rankAudit=previousRankAudit;
    if(previousNotifications===undefined)delete db.notifications[n];else db.notifications[n]=previousNotifications;
    console.error('Rank assignment persistence failed:',error.message);
    return res.status(500).json({error:'تعذر حفظ منح الرتبة وإشعارها؛ لم يتم تطبيق التغيير'});
  }

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
// Rank artwork and per-member decoration are separate from rank permissions and rank assignment.
function rankArtItem(id){return (db.rankArtCatalog||[]).find(x=>String(x.id)===String(id))||null;}
function canManageRankArt(user){return isOwner(user)||hasPermission(user,'rank_art_manage')||hasPermission(user,'member_decoration_manage');}
app.get('/api/admin/rank-art',requireAuth,(req,res)=>{
 if(!canManageRankArt(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة زخارف الرتب'});
 res.set('Cache-Control','no-store');
 res.json({items:(db.rankArtCatalog||[]).map(x=>({id:x.id,name:x.name,image:x.image,mime:x.mime})),ranks:(db.rankDefinitions||[]).filter(r=>RANK_PERMISSION_PROFILES.includes(r.id)).map(r=>({id:r.id,name:r.name,artId:r.artId||'',artUrl:r.artUrl||''}))});
});
app.post('/api/admin/rank-art/upload',requireAuth,(req,res,next)=>{if(!hasPermission(req.user,'rank_art_manage'))return res.status(403).json({error:'ما عندك صلاحية إضافة أشكال للرتب'});next();},uploadSmallImage.single('file'),validateUploadedContent('image'),(req,res)=>{
 try{
  if(!req.file||!['image/gif','image/png','image/jpeg','image/webp'].includes(String(req.file.mimetype||''))){removeUploadedFile(req.file);return res.status(400).json({error:'ارفع GIF أو PNG أو JPG أو WEBP'});}
  if((db.rankArtCatalog||[]).length>=300){removeUploadedFile(req.file);return res.status(400).json({error:'وصلت مكتبة الأشكال إلى 300 ملف'});}
  const name=String(req.body?.name||'').trim().slice(0,50)||'شكل رتبة جديد';
  const item={id:crypto.randomUUID(),name,image:'/uploads/'+req.file.filename,mime:req.file.mimetype,createdAt:Date.now(),by:cleanName(req.user.name)};
  db.rankArtCatalog=db.rankArtCatalog||[];db.rankArtCatalog.push(item);
  try{save()}catch(error){db.rankArtCatalog.pop();removeUploadedFile(req.file);throw error;}
  res.json({ok:true,item:{id:item.id,name:item.name,image:item.image,mime:item.mime}});
 }catch(error){console.error('Rank artwork upload failed:',error);removeUploadedFile(req.file);res.status(500).json({error:'تعذر حفظ شكل الرتبة'});}
});
app.put('/api/admin/rank-art/assign',requireAuth,(req,res)=>{
 if(!hasPermission(req.user,'rank_art_manage'))return res.status(403).json({error:'ما عندك صلاحية ربط أشكال الرتب'});
 const rank=String(req.body?.rank||''),artId=String(req.body?.artId||'');if(!RANK_PERMISSION_PROFILES.includes(rank))return res.status(400).json({error:'اختر رتبة من الرتب السبع'});
 const definition=rankDefinition(rank);if(!definition)return res.status(404).json({error:'الرتبة غير موجودة'});
 const item=artId?rankArtItem(artId):null;if(artId&&!item)return res.status(404).json({error:'الشكل المحدد غير موجود'});
 const old={artId:definition.artId,artUrl:definition.artUrl};if(item){definition.artId=item.id;definition.artUrl=item.image;}else{delete definition.artId;delete definition.artUrl;}
 try{save()}catch(error){if(old.artId!==undefined)definition.artId=old.artId;else delete definition.artId;if(old.artUrl!==undefined)definition.artUrl=old.artUrl;else delete definition.artUrl;return res.status(500).json({error:'تعذر حفظ شكل الرتبة'});}
 io.emit('rank-art-updated',{rank,artUrl:item?.image||''});res.json({ok:true,rank,artId:item?.id||'',artUrl:item?.image||''});
});
app.delete('/api/admin/rank-art/:id',requireAuth,(req,res)=>{
 if(!hasPermission(req.user,'rank_art_manage'))return res.status(403).json({error:'ما عندك صلاحية حذف أشكال الرتب'});
 const id=String(req.params.id||''),index=(db.rankArtCatalog||[]).findIndex(x=>String(x.id)===id);if(index<0)return res.status(404).json({error:'الشكل غير موجود'});
 const item=db.rankArtCatalog[index];const previous=db.rankArtCatalog.slice();const oldRanks=(db.rankDefinitions||[]).map(r=>({r,artId:r.artId,artUrl:r.artUrl}));const oldProfiles=Object.entries(db.profiles||{}).map(([name,p])=>({name,customDecorationId:p.customDecorationId,customDecorationImage:p.customDecorationImage,customDecorationName:p.customDecorationName}));db.rankArtCatalog.splice(index,1);
 for(const rank of db.rankDefinitions||[])if(String(rank.artId||'')===id){delete rank.artId;delete rank.artUrl;}
 for(const profileData of Object.values(db.profiles||{}))if(String(profileData.customDecorationId||'')===id){delete profileData.customDecorationId;delete profileData.customDecorationImage;delete profileData.customDecorationName;}
 try{save()}catch(error){db.rankArtCatalog=previous;for(const x of oldRanks){if(x.artId!==undefined)x.r.artId=x.artId;else delete x.r.artId;if(x.artUrl!==undefined)x.r.artUrl=x.artUrl;else delete x.r.artUrl;}for(const x of oldProfiles){const p=db.profiles[x.name];if(!p)continue;for(const k of ['customDecorationId','customDecorationImage','customDecorationName'])if(x[k]!==undefined)p[k]=x[k];else delete p[k];}return res.status(500).json({error:'تعذر حفظ حذف الشكل'});}
 if(item.image?.startsWith('/uploads/')){const file=path.resolve(UP_DIR,path.basename(item.image));if(file.startsWith(path.resolve(UP_DIR)+path.sep)){try{fs.unlinkSync(file)}catch{}}}
 io.emit('rank-art-updated',{deleted:id,ranks:(db.rankDefinitions||[]).filter(r=>RANK_PERMISSION_PROFILES.includes(r.id)).map(r=>({id:r.id,artUrl:r.artUrl||''}))});res.json({ok:true,deleted:id});
});
app.put('/api/admin/member-decoration',requireAuth,(req,res)=>{
 if(!hasPermission(req.user,'member_decoration_manage'))return res.status(403).json({error:'ما عندك صلاحية تخصيص زخرفة الأعضاء'});
 const n=accountKey(cleanName(req.body?.name||''));if(!n||isOwnerName(n))return res.status(400).json({error:'اختر عضواً صالحاً؛ حساب صاحب الموقع محمي'});
 const target=getUser(n)||getGuest(n);if(!target)return res.status(404).json({error:'العضو غير موجود'});
 const p=profile(n),old={customDecorationId:p.customDecorationId,customDecorationImage:p.customDecorationImage,customDecorationName:p.customDecorationName},artId=String(req.body?.artId||'');if(!artId){delete p.customDecorationId;delete p.customDecorationImage;delete p.customDecorationName;}
 else{const item=rankArtItem(artId);if(!item)return res.status(404).json({error:'الزخرفة المحددة غير موجودة'});p.customDecorationId=item.id;p.customDecorationImage=item.image;p.customDecorationName=item.name;}
 try{save()}catch(error){for(const k of Object.keys(old))if(old[k]!==undefined)p[k]=old[k];else delete p[k];return res.status(500).json({error:'تعذر حفظ زخرفة العضو'});}
 io.emit('profile-changed',{name:n,profile:p});res.json({ok:true,name:n,decoration:p.customDecorationImage||'',decorationName:p.customDecorationName||''});
});

// Rank definitions are editable independently from chat UI, buttons and colors.
app.get('/api/admin/ranks' ,requireAuth,(req,res)=>{const canAssign=isOwner(req.user)||hasPermission(req.user,'rank_assign');const canArt=canManageRankArt(req.user);if(!canAssign&&!canArt)return res.status(403).json({error:'ما عندك صلاحية عرض الرتب أو أشكالها'});const ranks=(db.rankDefinitions||[]).filter(r=>RANK_PERMISSION_PROFILES.includes(r.id)).slice().sort((a,b)=>Number(b.level)-Number(a.level)).map(r=>{const item={...r};if(!canAssign)delete item.permissions;return item;});res.json({appVersion:require('./package.json').version||'unknown',permissionSchemaVersion:7,permissionKeys:canAssign?ALL_PERMISSION_KEYS:[],ranks,catalog:canAssign?PERMISSION_CATALOG:{}});});
// Rank definitions are fixed: only the seven built-in ranks can be assigned or permission-edited.
app.get('/api/admin/permissions',requireAuth,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'permission_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة صلاحيات الرتب'});
 const ranks=Object.fromEntries(RANK_PERMISSION_PROFILES.map(id=>[id,[...(rankDefinition(id)?.permissions||[])].filter(p=>Object.hasOwn(PERMISSION_CATALOG,p))]));
 res.json({appVersion:require('./package.json').version||'unknown',permissionSchemaVersion:7,permissionKeys:ALL_PERMISSION_KEYS,catalog:PERMISSION_CATALOG,defaults:DEFAULT_RANK_PERMISSIONS,ranks,rankIds:RANK_PERMISSION_PROFILES});
});
app.put('/api/admin/permissions',requireAuth,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'permission_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة صلاحيات الرتب'});
 const rank=String(req.body.rank||'');if(!RANK_PERMISSION_PROFILES.includes(rank))return res.status(400).json({error:'اختر واحدة من الرتب السبع فقط'});
 const definition=rankDefinition(rank);if(!definition)return res.status(404).json({error:'تعريف الرتبة غير موجود'});
 const requested=Array.isArray(req.body.permissions)?req.body.permissions:[];if(requested.some(p=>!Object.hasOwn(PERMISSION_CATALOG,p)))return res.status(400).json({error:'توجد صلاحية غير معروفة'});
 if(!isOwner(req.user)){const own=effectivePermissionsForUser(req.user);if(requested.some(p=>!own.has(p)))return res.status(403).json({error:'لا يمكنك منح صلاحيات أعلى من صلاحياتك الحالية'});}
 const previous=[...(definition.permissions||[])];definition.permissions=[...new Set(requested)];definition.updatedAt=Date.now();
 try{save()}catch(error){definition.permissions=previous;console.error('Rank permission save failed:',error.message);return res.status(500).json({error:'تعذر حفظ صلاحيات الرتبة؛ لم يتم تطبيق التغيير'});}
 io.emit('permissions-updated',{rank});res.json({ok:true,rank,permissions:definition.permissions});
});
app.get('/api/admin/account-permissions/:name',requireAuth,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'permission_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة صلاحيات الأعضاء'});
 const n=accountKey(req.params.name),target=getUser(n);if(!target)return res.status(404).json({error:'الحساب المسجل غير موجود'});if(isOwnerName(n))return res.status(403).json({error:'حساب صاحب الموقع محمي'});
 const key=keyName(n),stored=db.accountPermissions?.[key],custom=Array.isArray(stored);
 const inheritedRank=profile(n).rank,definition=rankDefinition(inheritedRank),inherited=[...(definition?.permissions||[])];
 const permissions=custom?[...stored]:inherited;
 res.json({name:n,rank:inheritedRank||'none',customized:custom,permissions,inheritedPermissions:inherited,catalog:PERMISSION_CATALOG});
});
app.put('/api/admin/account-permissions/:name',requireAuth,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'permission_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة صلاحيات الأعضاء'});
 const n=accountKey(req.params.name);if(denyHigherRankTarget(req.user,n,res))return;const target=getUser(n);if(!target)return res.status(404).json({error:'الحساب المسجل غير موجود'});if(isOwnerName(n))return res.status(403).json({error:'حساب صاحب الموقع محمي'});
 db.accountPermissions=db.accountPermissions||{};const key=keyName(n);
 if(req.body?.inherit===true){const previous=db.accountPermissions[key];delete db.accountPermissions[key];try{save()}catch(error){if(previous!==undefined)db.accountPermissions[key]=previous;return res.status(500).json({error:'تعذر إرجاع صلاحيات الرتبة'});}io.emit('permissions-updated',{name:n});return res.json({ok:true,name:n,customized:false,permissions:[...(rankDefinition(profile(n).rank)?.permissions||[])]});}
 const requested=Array.isArray(req.body?.permissions)?req.body.permissions:[];if(requested.some(p=>!Object.hasOwn(PERMISSION_CATALOG,p)))return res.status(400).json({error:'توجد صلاحية غير معروفة'});
 if(!isOwner(req.user)){const own=effectivePermissionsForUser(req.user);if(requested.some(p=>!own.has(p)))return res.status(403).json({error:'لا يمكنك منح صلاحيات أعلى من صلاحياتك الحالية'});}
 const previous=db.accountPermissions[key];db.accountPermissions[key]=[...new Set(requested)];
 try{save()}catch(error){if(previous===undefined)delete db.accountPermissions[key];else db.accountPermissions[key]=previous;return res.status(500).json({error:'تعذر حفظ صلاحيات العضو'});}
 io.emit('permissions-updated',{name:n});res.json({ok:true,name:n,customized:true,permissions:db.accountPermissions[key]});
});
app.get('/api/admin/welcome-messages',requireAuth,(req,res)=>{if(!hasPermission(req.user,'welcome_manage'))return res.status(403).json({error:'ما عندك صلاحية عرض أو تعديل رسائل الترحيب'});res.json({messages:db.welcomeMessages||[]});});
app.put('/api/admin/welcome-messages',requireAuth,(req,res)=>{if(!hasPermission(req.user,'welcome_manage'))return res.status(403).json({error:'ما عندك صلاحية تعديل رسائل الترحيب'});try{const raw=Array.isArray(req.body?.messages)?req.body.messages:[];if(raw.length>12)return res.status(400).json({error:'الحد الأعلى 12 رسالة ترحيب'});const messages=[];for(const item of raw){const title=String(item?.title||'').trim().slice(0,80),text=String(item?.text||'').trim().slice(0,1200);if(!title&&!text)continue;if(!text)return res.status(400).json({error:'اكتب نص كل رسالة قبل الحفظ'});messages.push({id:String(item?.id||crypto.randomUUID()).slice(0,80),title:title||'الترحيب',text,enabled:item?.enabled!==false});}const previous=db.welcomeMessages;db.welcomeMessages=messages;try{save()}catch(saveError){db.welcomeMessages=previous;console.error('Welcome messages save failed:',saveError);return res.status(500).json({error:'تعذر حفظ الرسائل على التخزين. تحقق من صلاحية ومسار /data ثم أعد المحاولة.'});}return res.json({ok:true,messages});}catch(error){console.error('Welcome messages update failed:',error);return res.status(500).json({error:'حدث خطأ أثناء معالجة رسائل الترحيب'});}});
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
// Stream a standards-compliant USTAR archive without loading uploads into RAM.
function tarOctal(value,length){return Buffer.from(Math.max(0,Number(value)||0).toString(8).padStart(length-1,'0')+'\0','ascii');}
function tarHeader(name,size,mtime){
 const header=Buffer.alloc(512);let fileName=String(name||'').replace(/^\/+/, '');let prefix='';
 if(Buffer.byteLength(fileName)>100){const split=fileName.lastIndexOf('/');if(split>0&&Buffer.byteLength(fileName.slice(split+1))<=100&&Buffer.byteLength(fileName.slice(0,split))<=155){prefix=fileName.slice(0,split);fileName=fileName.slice(split+1);}}
 if(Buffer.byteLength(fileName)>100||Buffer.byteLength(prefix)>155)throw new Error('Backup path is too long');
 header.write(fileName,0,100,'utf8');tarOctal(0o600,8).copy(header,100);tarOctal(0,8).copy(header,108);tarOctal(0,8).copy(header,116);tarOctal(size,12).copy(header,124);tarOctal(mtime,12).copy(header,136);header.fill(32,148,156);header[156]=48;header.write('ustar\0',257,6,'ascii');header.write('00',263,2,'ascii');header.write('rimaz',265,32,'ascii');header.write('rimaz',297,32,'ascii');if(prefix)header.write(prefix,345,155,'utf8');let sum=0;for(const byte of header)sum+=byte;header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');return header;
}
async function* fullBackupTarEntries(){
 const snapshot={format:'rimaz-full-backup',version:1,createdAt:new Date().toISOString(),appVersion:require('./package.json').version||'unknown',database:{...db,sessions:{}}};
 const dbBytes=Buffer.from(JSON.stringify(snapshot,null,2));yield {name:'database/rimaz-database.json',buffer:dbBytes,size:dbBytes.length,mtime:Date.now()};
 const roots=[['uploads',UP_DIR],['private-media',PRIVATE_MEDIA_DIR]];
 for(const [archiveRoot,diskRoot] of roots){
  const pending=[{disk:diskRoot,archive:archiveRoot}];
  while(pending.length){const current=pending.pop();let items=[];try{items=fs.readdirSync(current.disk,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;continue;}
   for(const item of items){const disk=path.join(current.disk,item.name),archive=current.archive+'/'+item.name;if(item.isSymbolicLink())continue;if(item.isDirectory()){pending.push({disk,archive});continue;}if(!item.isFile())continue;const stat=fs.statSync(disk);yield {name:archive,disk,size:stat.size,mtime:stat.mtimeMs};}
  }
 }
}
async function* fullBackupTar(){
 for await(const entry of fullBackupTarEntries()){
  yield tarHeader(entry.name,entry.size,Math.floor((entry.mtime||Date.now())/1000));
  if(entry.buffer)yield entry.buffer;else for await(const chunk of fs.createReadStream(entry.disk))yield chunk;
  const padding=(512-(entry.size%512))%512;if(padding)yield Buffer.alloc(padding);
 }
 yield Buffer.alloc(1024);
}

// Owner-only site controls, login history and database backup. These endpoints
// intentionally do not expose password hashes or active session tokens to staff.
// Subscription plans and member subscriptions. This is manual administration; no payment gateway is implied.
function canManageSubscriptions(user){return !!(user&&(isOwner(user)||hasPermission(user,'subscriptions_manage')));}
function subscriptionAudit(actor,action,target,details='',route='/api/admin/subscriptions'){db.adminAuditLogs=db.adminAuditLogs||[];db.adminAuditLogs.unshift({id:crypto.randomUUID(),at:Date.now(),actor:String(actor?.name||'إدارة').slice(0,32),method:'ADMIN',path:route,status:200,target:String(target||'').slice(0,40),action:String(action||'').slice(0,80),details:String(details||'').slice(0,180)});db.adminAuditLogs=db.adminAuditLogs.slice(0,500);}
app.get('/api/admin/subscriptions',(req,res)=>{requireAuth(req,res,()=>{if(!canManageSubscriptions(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة الاشتراكات'});res.set('Cache-Control','no-store');res.json({plans:db.subscriptionPlans||[],subscriptions:(db.subscriptions||[]).slice().sort((a,b)=>Number(b.updatedAt||b.createdAt)-Number(a.updatedAt||a.createdAt)),users:Object.keys(db.users||{}).map(name=>({name,subscription:(db.subscriptions||[]).find(x=>keyName(x.name)===keyName(name)&&x.status==='active'&&Number(x.expiresAt)>Date.now())||null}))});});});
app.post('/api/admin/subscriptions/plans',(req,res)=>{requireAuth(req,res,()=>{if(!canManageSubscriptions(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة الخطط'});const b=req.body||{},name=String(b.name||'').trim().slice(0,50),days=Math.max(1,Math.min(3650,Math.floor(Number(b.days)||0)));if(name.length<2||!days)return res.status(400).json({error:'اسم الخطة والمدة بالأيام مطلوبان'});const id=String(b.id||'').trim()||('plan_'+crypto.randomBytes(6).toString('hex'));let plan=(db.subscriptionPlans||[]).find(x=>x.id===id);if(!plan){plan={id,createdAt:Date.now()};db.subscriptionPlans.push(plan);}Object.assign(plan,{name,days,description:String(b.description||'').trim().slice(0,180),priceLabel:String(b.priceLabel||'').trim().slice(0,40),enabled:b.enabled!==false,grantsVip:b.grantsVip!==false,updatedAt:Date.now()});subscriptionAudit(req.user,'حفظ خطة اشتراك',id,name+' · '+days+' يوم');try{save()}catch(e){return res.status(500).json({error:'تعذر حفظ الخطة'});}res.json({ok:true,plan});});});
app.delete('/api/admin/subscriptions/plans/:id',(req,res)=>{requireAuth(req,res,()=>{if(!canManageSubscriptions(req.user))return res.status(403).json({error:'ما عندك صلاحية حذف الخطط'});const i=(db.subscriptionPlans||[]).findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'الخطة غير موجودة'});const [plan]=db.subscriptionPlans.splice(i,1);subscriptionAudit(req.user,'حذف خطة اشتراك',plan.id,plan.name);try{save()}catch(e){db.subscriptionPlans.splice(i,0,plan);return res.status(500).json({error:'تعذر حذف الخطة'});}res.json({ok:true});});});
app.post('/api/admin/subscriptions/assign',(req,res)=>{requireAuth(req,res,()=>{if(!canManageSubscriptions(req.user))return res.status(403).json({error:'ما عندك صلاحية منح الاشتراكات'});const name=cleanName(req.body?.name||''),user=getUser(name),plan=(db.subscriptionPlans||[]).find(x=>x.id===String(req.body?.planId||'')&&x.enabled!==false);if(!user)return res.status(404).json({error:'الحساب المسجل غير موجود'});if(isOwnerName(name))return res.status(403).json({error:'حساب صاحب الموقع محمي'});if(!plan)return res.status(404).json({error:'خطة الاشتراك غير موجودة أو متوقفة'});const days=Math.max(1,Math.min(3650,Math.floor(Number(req.body?.days)||Number(plan.days)||0)));if(!days)return res.status(400).json({error:'مدة الاشتراك غير صحيحة'});const key=keyName(name),now=Date.now();let sub=(db.subscriptions||[]).find(x=>keyName(x.name)===key&&x.status==='active'&&Number(x.expiresAt)>now);if(!sub){sub={id:crypto.randomUUID(),name,createdAt:now,history:[]};db.subscriptions.push(sub);}const start=Math.max(now,Number(sub.expiresAt)||now);sub.planId=plan.id;sub.planName=plan.name;sub.startsAt=sub.startsAt||now;sub.expiresAt=start+days*86400000;sub.status='active';sub.updatedAt=now;sub.updatedBy=req.user.name;sub.history=Array.isArray(sub.history)?sub.history:[];sub.history.unshift({at:now,action:'grant-or-renew',days,plan:plan.name,by:req.user.name});if(plan.grantsVip!==false){const memberProfile=profile(name);memberProfile.vipUntil=sub.expiresAt;memberProfile.vipSubscriptionId=sub.id;memberProfile.vipGrantedAt=now;memberProfile.vipGrantedBy=req.user.name;}else{const memberProfile=profile(name);if(memberProfile.vipSubscriptionId===sub.id){delete memberProfile.vipSubscriptionId;delete memberProfile.vipUntil;delete memberProfile.vipGrantedAt;delete memberProfile.vipGrantedBy;}}subscriptionAudit(req.user,'منح أو تجديد اشتراك',name,plan.name+' · '+days+' يوم');try{save()}catch(e){return res.status(500).json({error:'تعذر حفظ الاشتراك'});}res.json({ok:true,subscription:sub});});});
app.post('/api/admin/subscriptions/cancel',(req,res)=>{requireAuth(req,res,()=>{if(!canManageSubscriptions(req.user))return res.status(403).json({error:'ما عندك صلاحية إلغاء الاشتراكات'});const name=cleanName(req.body?.name||''),sub=(db.subscriptions||[]).find(x=>keyName(x.name)===keyName(name)&&x.status==='active');if(!sub)return res.status(404).json({error:'لا يوجد اشتراك فعال لهذا الحساب'});if(isOwnerName(name))return res.status(403).json({error:'حساب صاحب الموقع محمي'});sub.status='cancelled';sub.expiresAt=Date.now();sub.updatedAt=Date.now();sub.updatedBy=req.user.name;sub.history=Array.isArray(sub.history)?sub.history:[];sub.history.unshift({at:Date.now(),action:'cancel',by:req.user.name});const memberProfile=profile(name);if(memberProfile.vipSubscriptionId===sub.id){delete memberProfile.vipSubscriptionId;delete memberProfile.vipUntil;delete memberProfile.vipGrantedAt;delete memberProfile.vipGrantedBy;}subscriptionAudit(req.user,'إلغاء اشتراك',name,sub.planName||'');try{save()}catch(e){return res.status(500).json({error:'تعذر إلغاء الاشتراك'});}res.json({ok:true});});});

// Campaign ads: image uploads are stored in uploads; campaign scheduling is enforced by the public feed.
function canManageAds(user){return !!(user&&(isOwner(user)||hasPermission(user,'ads_manage')));}
app.get('/api/admin/ads',(req,res)=>{requireAuth(req,res,()=>{if(!canManageAds(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة الحملات الإعلانية'});res.set('Cache-Control','no-store');res.json({items:db.adCampaigns||[]});});});
app.post('/api/admin/ads',(req,res,next)=>requireAuth(req,res,next),uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{if(!canManageAds(req.user)){removeUploadedFile(req.file);return res.status(403).json({error:'ما عندك صلاحية إدارة الإعلانات'});}const b=req.body||{},title=String(b.title||'').trim().slice(0,60),url=String(b.url||'').trim().slice(0,500),startsAt=b.startsAt?Date.parse(b.startsAt):Date.now(),endsAt=b.endsAt?Date.parse(b.endsAt):0;if(title.length<2){removeUploadedFile(req.file);return res.status(400).json({error:'عنوان الإعلان مطلوب'});}if(url&&!/^https?:\/\//i.test(url)){removeUploadedFile(req.file);return res.status(400).json({error:'رابط الإعلان يجب أن يبدأ بـ https:// أو http://'});}if(!Number.isFinite(startsAt)|| (endsAt&&(!Number.isFinite(endsAt)||endsAt<=startsAt))){removeUploadedFile(req.file);return res.status(400).json({error:'مدة الحملة غير صحيحة'});}const image=req.file?'/uploads/'+req.file.filename:String(b.image||'');if(!image){removeUploadedFile(req.file);return res.status(400).json({error:'ارفع صورة الإعلان أولاً'});}const item={id:crypto.randomUUID(),title,url,image,startsAt,endsAt,enabled:b.enabled!=='false',createdAt:Date.now(),createdBy:req.user.name,impressions:0,clicks:0};db.adCampaigns=db.adCampaigns||[];db.adCampaigns.unshift(item);subscriptionAudit(req.user,'إنشاء حملة إعلانية',item.id,title,'/api/admin/ads');try{save()}catch(e){db.adCampaigns=db.adCampaigns.filter(x=>x.id!==item.id);removeUploadedFile(req.file);return res.status(500).json({error:'تعذر حفظ الحملة'});}res.json({ok:true,item});});
app.patch('/api/admin/ads/:id',(req,res)=>{requireAuth(req,res,()=>{if(!canManageAds(req.user))return res.status(403).json({error:'ما عندك صلاحية تعديل الإعلانات'});const item=(db.adCampaigns||[]).find(x=>x.id===req.params.id);if(!item)return res.status(404).json({error:'الحملة غير موجودة'});if(req.body?.enabled!==undefined)item.enabled=req.body.enabled===true;if(req.body?.title!==undefined)item.title=String(req.body.title).trim().slice(0,60);item.updatedAt=Date.now();subscriptionAudit(req.user,'تعديل حملة إعلانية',item.id,item.title,'/api/admin/ads');try{save()}catch(e){return res.status(500).json({error:'تعذر حفظ الحملة'});}res.json({ok:true,item});});});
app.delete('/api/admin/ads/:id',(req,res)=>{requireAuth(req,res,()=>{if(!canManageAds(req.user))return res.status(403).json({error:'ما عندك صلاحية حذف الإعلانات'});const i=(db.adCampaigns||[]).findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'الحملة غير موجودة'});const [item]=db.adCampaigns.splice(i,1);subscriptionAudit(req.user,'حذف حملة إعلانية',item.id,item.title,'/api/admin/ads');try{save()}catch(e){db.adCampaigns.splice(i,0,item);return res.status(500).json({error:'تعذر حذف الحملة'});}if(item.image?.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(item.image)))}catch{}}res.json({ok:true});});});
app.get('/api/public/ads',(req,res)=>{const now=Date.now(),items=(db.adCampaigns||[]).filter(x=>x.enabled!==false&&Number(x.startsAt||0)<=now&&(!Number(x.endsAt)||Number(x.endsAt)>now)).slice(0,5).map(({id,title,url,image})=>({id,title,url,image}));res.set('Cache-Control','public, max-age=30');res.json({items});});

// Granular control center is separate from site identity/security and is permission-gated.
app.get('/api/admin/control-center',(req,res)=>{requireAuth(req,res,()=>{if(!isOwner(req.user)&&!hasPermission(req.user,'control_center_manage'))return res.status(403).json({error:'ما عندك صلاحية مركز التحكم'});res.set('Cache-Control','no-store');res.json({settings:db.siteSettings||{},modules:{...DEFAULT_SITE_MODULES,...(db.siteSettings?.modules||{})}});});});
app.put('/api/admin/control-center',(req,res)=>{requireAuth(req,res,()=>{if(!isOwner(req.user)&&!hasPermission(req.user,'control_center_manage'))return res.status(403).json({error:'ما عندك صلاحية مركز التحكم'});const allowed=Object.keys(DEFAULT_SITE_MODULES),next={...(db.siteSettings?.modules||DEFAULT_SITE_MODULES)};for(const key of allowed)if(Object.prototype.hasOwnProperty.call(req.body?.modules||{},key))next[key]=req.body.modules[key]===true;const old=db.siteSettings.modules;db.siteSettings.modules=next;subscriptionAudit(req.user,'تغيير وحدات مركز التحكم','',Object.entries(next).map(([k,v])=>k+':'+(v?'on':'off')).join(', '),'/api/admin/control-center');try{save()}catch(e){db.siteSettings.modules=old;return res.status(500).json({error:'تعذر حفظ مركز التحكم'});}io.emit('site-settings-changed',{modules:next});res.json({ok:true,modules:next});});});

// Existing site settings, login history and backup endpoints.
app.get('/api/public/settings',(req,res)=>{const s=db.siteSettings||{};res.set('Cache-Control','no-store');res.json({siteName:s.siteName||'دردشة ريماز عراقية',tagline:s.tagline||'',notice:s.notice||'',allowRegistration:s.allowRegistration!==false,allowGuests:s.allowGuests!==false,modules:{...(s.modules||{})}});});
app.get('/api/admin/site-settings',requireAuth,(req,res)=>{if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية إدارة الموقع'});res.set('Cache-Control','no-store');res.json({settings:db.siteSettings||{}});});
app.put('/api/admin/site-settings',requireAuth,(req,res)=>{if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية إدارة الموقع'});const b=req.body||{};const modules={...(db.siteSettings?.modules||DEFAULT_SITE_MODULES)};for(const key of Object.keys(DEFAULT_SITE_MODULES))if(Object.prototype.hasOwnProperty.call(b.modules||{},key))modules[key]=b.modules[key]===true;const next={siteName:String(b.siteName||'').trim().slice(0,60),tagline:String(b.tagline||'').trim().slice(0,300),notice:String(b.notice||'').trim().slice(0,300),allowRegistration:b.allowRegistration!==false,allowGuests:b.allowGuests!==false,modules};if(!next.siteName)return res.status(400).json({error:'اسم الموقع مطلوب'});const old=db.siteSettings;db.siteSettings=next;db.adminAuditLogs=db.adminAuditLogs||[];db.adminAuditLogs.unshift({id:crypto.randomUUID(),at:Date.now(),actor:String(req.user.name||'المالك').slice(0,32),method:'PUT',path:'/api/admin/site-settings',status:200});db.adminAuditLogs=db.adminAuditLogs.slice(0,500);try{save()}catch(e){db.siteSettings=old;return res.status(500).json({error:'تعذر حفظ إعدادات الموقع'});}io.emit('site-settings-changed',{siteName:next.siteName,tagline:next.tagline,notice:next.notice,modules:next.modules});res.json({ok:true,settings:next});});
app.get('/api/admin/login-history',requireAuth,(req,res)=>{if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية عرض سجل الدخول'});res.set('Cache-Control','no-store');res.json({items:(db.loginHistory||[]).slice(0,500),total:(db.loginHistory||[]).length});});
app.get('/api/admin/health',requireAuth,(req,res)=>{if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية فحص النظام'});const walk=(dir)=>{let files=0,bytes=0;try{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory()){const child=walk(full);files+=child.files;bytes+=child.bytes;}else if(entry.isFile()){const st=fs.statSync(full);files++;bytes+=st.size;}}}catch{}return {files,bytes};};let dbBytes=0;try{dbBytes=fs.statSync(DB_FILE).size}catch{}const uploads=walk(UP_DIR),memory=process.memoryUsage();res.set('Cache-Control','no-store');res.json({appVersion:require('./package.json').version||'unknown',node:process.version,uptimeSeconds:Math.floor(process.uptime()),dbBytes,uploads,heapUsed:memory.heapUsed,rss:memory.rss,online:getOnlineUsers(req.user).length,rooms:(db.rooms||[]).length,modules:{...DEFAULT_SITE_MODULES,...(db.siteSettings?.modules||{})}});});
app.get('/api/admin/backup/database',requireAuth,(req,res)=>{if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية النسخ الاحتياطي'});try{const snapshot={format:'rimaz-database-backup',version:1,createdAt:new Date().toISOString(),appVersion:require('./package.json').version||'unknown',database:{...db,sessions:{}}};const body=JSON.stringify(snapshot,null,2);res.set('Cache-Control','no-store, no-cache, must-revalidate');res.set('Content-Type','application/json; charset=utf-8');res.set('Content-Disposition',`attachment; filename="rimaz-database-backup-${new Date().toISOString().slice(0,10)}.json"`);res.send(body);}catch(e){console.error('Database backup failed:',e);res.status(500).json({error:'تعذر إنشاء النسخة الاحتياطية'});}});
app.get('/api/admin/backup/full',requireAuth,(req,res)=>{if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية النسخة الاحتياطية الكاملة'});res.set('Cache-Control','no-store, no-cache, must-revalidate');res.set('Content-Type','application/gzip');res.set('Content-Disposition',`attachment; filename=\"rimaz-full-backup-${new Date().toISOString().slice(0,10)}.tar.gz\"`);const source=Readable.from(fullBackupTar()),archive=zlib.createGzip({level:6});source.on('error',error=>archive.destroy(error));archive.on('error',error=>{console.error('Full backup stream failed:',error);if(!res.headersSent)res.status(500).json({error:'تعذر إنشاء النسخة الاحتياطية الكاملة'});else res.destroy(error);});source.pipe(archive).pipe(res);});
app.post('/api/admin/restore/database/preview',requireAuth,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية استعادة النسخة'});
 restoreUpload.single('backup')(req,res,error=>{
  if(error)return res.status(400).json({error:error.code==='LIMIT_FILE_SIZE'?'حجم ملف النسخة أكبر من 20MB':(error.message||'تعذر قراءة ملف النسخة')});
  if(!req.file)return res.status(400).json({error:'اختر ملف نسخة JSON أولاً'});
  try{
   purgeExpiredDatabaseRestores();
   const checked=validateDatabaseRestoreFile(req.file.buffer);
   const protectedOwnerName=process.env.OWNER_NAME||'owner';if(!restoreContainsOwner(checked.clean,protectedOwnerName))throw new Error('النسخة لا تحتوي حساب صاحب الموقع؛ رُفضت لحماية إمكانية الدخول للإدارة');
   for(const [oldToken,oldPreview] of pendingDatabaseRestores)if(oldPreview.owner===keyName(req.user.name))pendingDatabaseRestores.delete(oldToken);
   const token=crypto.randomBytes(32).toString('hex');
   pendingDatabaseRestores.set(token,{database:checked.clean,summary:checked.summary,owner:keyName(req.user.name),expiresAt:Date.now()+5*60*1000});
   res.set('Cache-Control','no-store');
   res.json({ok:true,token,expiresInSeconds:300,summary:checked.summary,warning:'سيتم استبدال بيانات قاعدة البيانات الحالية. الجلسات النشطة والرسائل الخاصة المؤقتة لن تُستعاد.'});
  }catch(e){res.status(400).json({error:e.message||'ملف النسخة غير صالح'});}
 });
});
app.post('/api/admin/restore/database/confirm',requireAuth,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية استعادة النسخة'});
 purgeExpiredDatabaseRestores();
 const token=String(req.body?.token||''),confirmation=String(req.body?.confirmation||'');
 const pending=pendingDatabaseRestores.get(token);
 if(!pending||pending.owner!==keyName(req.user.name))return res.status(400).json({error:'انتهت صلاحية المعاينة؛ ارفع الملف مرة ثانية'});
 if(confirmation!=='استعادة ريماز')return res.status(400).json({error:'اكتب عبارة استعادة ريماز للتأكيد'});
 const previous=db;
 let recoveryFile='';
 try{
  if(fs.existsSync(DB_FILE)){recoveryFile=DB_FILE+'.pre-restore-'+Date.now()+'.json';fs.copyFileSync(DB_FILE,recoveryFile,fs.constants.COPYFILE_EXCL);}
  db=pending.database;
  db.sessions={};db.privateMessages=[];
  save();
  pendingDatabaseRestores.delete(token);
  try{io.disconnectSockets(true);}catch(e){console.warn('Could not disconnect restored sessions:',e.message);}
  db.adminAuditLogs=Array.isArray(db.adminAuditLogs)?db.adminAuditLogs:[];
  db.adminAuditLogs.unshift({id:crypto.randomUUID(),at:Date.now(),actor:String(req.user.name||'المالك').slice(0,32),method:'POST',path:'/api/admin/restore/database/confirm',status:200});
  db.adminAuditLogs=db.adminAuditLogs.slice(0,500);
  save();
  res.json({ok:true,message:'تمت استعادة قاعدة البيانات. تم إنهاء الجلسات النشطة.',recoveryFile:path.basename(recoveryFile||DB_FILE)});
 }catch(e){
  db=previous;
  try{save();}catch(rollbackError){console.error('Database restore rollback failed:',rollbackError);}
  res.status(500).json({error:'فشلت الاستعادة وتمت محاولة الرجوع للبيانات السابقة. احتفظ بنسخة الاسترداد قبل أي محاولة أخرى.'});
 }
});
app.get('/api/admin/data',requireAuth,(req,res)=>{
 const allowed=Object.keys(PERMISSION_CATALOG).some(p=>hasPermission(req.user,p));
 if(!allowed)return res.status(403).json({error:'ما عندك صلاحية لهذا القسم'});
 const visibleOnline=new Map(getOnlineUsers(req.user).map(x=>[keyName(x.name),x]));
 const registeredAccountKeys=new Set(Object.keys(db.users||{}).map(keyName));
 const seenAdminAccountKeys=new Set();
 const payload={users:Object.entries(db.users).filter(([name])=>{const k=keyName(name);if(seenAdminAccountKeys.has(k))return false;seenAdminAccountKeys.add(k);return true;}).filter(([name])=>!hasInvisibleActiveSession(name,req.user)).sort(([a],[b])=>Number(isOwnerName(b))-Number(isOwnerName(a))).map(([name,u])=>({name,type:'member',likes:Number(u.likes)||0,points:Number(u.points)||0,level:level(Number(u.likes)||0),role:isOwnerName(name)?'owner':'member',vip:vipActive(name),online:visibleOnline.has(keyName(name)),room:visibleOnline.get(keyName(name))?.room||'',profile:profile(name)})),guests:Object.entries(db.guests).filter(([name])=>{const k=keyName(name);if(registeredAccountKeys.has(k)||seenAdminAccountKeys.has(k))return false;seenAdminAccountKeys.add(k);return true;}).sort(([a],[b])=>Number(isOwnerName(b))-Number(isOwnerName(a))).map(([name,g])=>({name,type:'guest',likes:Number(g.likes)||0,points:Number(g.points)||0,level:level(Number(g.likes)||0),role:isOwnerName(name)?'owner':'member',online:visibleOnline.has(keyName(name)),room:visibleOnline.get(keyName(name))?.room||'',profile:profile(name)})).filter(x=>x.online),rooms:db.rooms.map(r=>{const {passwordHash,...safe}=r;return {...safe,locked:!!passwordHash,online:onlineInRoom(r.id,req.user)};}),announcements:(db.announcements||[]).slice(0,100),messages:db.messages.slice(-100).reverse(),bans:Object.entries(db.roomBans||{}).flatMap(([room,items])=>(items||[]).map(x=>({room,name:typeof x==='string'?x:x.name,until:typeof x==='string'?null:x.until}))),mutes:Object.entries(db.roomMutes||{}).flatMap(([room,items])=>(items||[]).map(name=>({room,name}))),globalBans:Object.values(db.globalBans||{}).filter(x=>Number(x.until)>Date.now()),globalIpBans:Object.values(db.globalIpBans||{}).filter(x=>Number(x.until)>Date.now()),rankAudit:(db.rankAudit||[]).slice(0,200),adminAuditLogs:(db.adminAuditLogs||[]).slice(0,200),chatFilter:db.chatFilter||{enabled:false,words:[]},stats:{registeredUsers:Object.keys(db.users||{}).length,knownGuests:Object.keys(db.guests||{}).length,onlineUsers:getOnlineUsers(req.user).length,rooms:(db.rooms||[]).length,publicMessages:(db.messages||[]).length,privateMessages:(db.privateMessages||[]).length,wallPosts:(db.wall||[]).length,adminOperations:(db.adminAuditLogs||[]).length,rankChanges:(db.rankAudit||[]).length},rankDefinitions:(db.rankDefinitions||[]).filter(r=>RANK_PERMISSION_PROFILES.includes(r.id)).slice().sort((a,b)=>Number(b.level)-Number(a.level)),myPermissions:Object.keys(PERMISSION_CATALOG).filter(permission=>hasPermission(req.user,permission)),wallEnabled:db.wallEnabled!==false,wallCount:(db.wall||[]).length,giftCatalog:Array.isArray(db.giftCatalog)?db.giftCatalog:[],chatShortcuts:db.chatShortcuts||[],customSmileys:db.customSmileys||[] };
 payload.subscriptionPlans=(isOwner(req.user)||hasPermission(req.user,'subscriptions_manage'))?(db.subscriptionPlans||[]):[];payload.subscriptions=(isOwner(req.user)||hasPermission(req.user,'subscriptions_manage'))?(db.subscriptions||[]):[];payload.adCampaigns=(isOwner(req.user)||hasPermission(req.user,'ads_manage'))?(db.adCampaigns||[]):[];
 // Always shape the response by the caller's exact permissions. panel_access
 // opens the panel only; it never grants access to every dataset or button.
 const can=p=>hasPermission(req.user,p);
 const needsTargets=['kick_room','ban_room','mute_room','global_kick','global_ban','grant_likes','reset_likes','vip','gifts','rank_assign','permission_manage','profile_edit','avatar_delete','member_ip','member_status_manage','room_move','wall_delete_user'].some(can);
 if(!can('users_view')){
   if(!needsTargets){payload.users=[];payload.guests=[];}
   else {const safe=u=>({name:u.name,type:u.type,role:u.role,online:u.online,room:u.room,profile:{status:u.profile?.status,displayName:u.profile?.displayName,rank:u.profile?.rank}});payload.users=payload.users.map(safe);payload.guests=payload.guests.map(safe);}
 }
 if(!['room_create','room_edit','room_delete','room_lock','room_image_manage','kick_room','ban_room','mute_room','global_kick','global_ban','room_move'].some(can))payload.rooms=[];
 if(!can('announcement_post')&&!can('announcement_delete'))payload.announcements=[];
 if(!can('messages_delete'))payload.messages=[];
 if(!can('ban_room')&&!can('kick_room'))payload.bans=[];
 if(!can('mute_room'))payload.mutes=[];
 if(!can('global_ban')&&!can('global_kick')){payload.globalBans=[];payload.globalIpBans=[];}
 if(!can('rank_assign'))payload.rankAudit=[];
 if(!can('audit_view'))payload.adminAuditLogs=[];
 if(!can('chat_filter_manage'))payload.chatFilter={enabled:false,words:[]};
 if(!can('stats_view'))payload.stats={};
 if(!can('rank_assign'))payload.rankDefinitions=[];
 if(!can('gifts')&&!can('gift_catalog_manage'))payload.giftCatalog=[];
 if(!can('shortcuts_manage'))payload.chatShortcuts=[];
 if(!can('smileys_manage'))payload.customSmileys=[];
 if(!['wall_stop','wall_restart','wall_clear','wall_delete_user'].some(can)){payload.wallEnabled=null;payload.wallCount=0;}
 res.json(payload);
});
app.post('/api/rooms',requireAuth,(req,res)=>{const name=cleanName(req.body.name).slice(0,40),desc=String(req.body.desc||'غرفة جديدة').trim().slice(0,160),kind=req.body.kind==='voice'?'voice':'public';if(name.length<2)return res.status(400).json({error:'اسم الغرفة لازم يكون حرفين على الأقل'});if(db.rooms.some(r=>keyName(r.name)===keyName(name)))return res.status(409).json({error:'اسم الغرفة مستخدم بالفعل'});if(db.rooms.length>=250)return res.status(400).json({error:'وصل الموقع إلى الحد الأعلى للغرف حالياً'});const id='r_'+crypto.randomBytes(5).toString('hex');const room={id,name,desc:desc||'غرفة جديدة',kind,capacity:Math.max(2,Math.min(200,Number(req.body.capacity)||50)),mics:kind==='voice'?Math.max(1,Math.min(20,Number(req.body.mics)||5)):0,micLikesRequired:kind==='voice'?Math.max(0,Math.min(1000000,Number(req.body.micLikesRequired??30)||0)):0,owner:req.user.name,created:Date.now()};db.rooms.push(room);try{save()}catch(err){db.rooms=db.rooms.filter(x=>x.id!==id);console.error('Public room creation save failed:',err);return res.status(500).json({error:'تعذر حفظ الغرفة على السيرفر. تحقق من صلاحية مجلد البيانات ثم أعد المحاولة.'})}emitState();return res.json({ok:true,id,room});});
app.post('/api/admin/room',requireAdmin,(req,res)=>{const name=cleanName(req.body.name).slice(0,40),kind=req.body.kind==='voice'?'voice':req.body.kind==='private'?'private':'public';if(name.length<2)return res.status(400).json({error:'اسم الغرفة لازم يكون حرفين على الأقل'});if(db.rooms.length>=250)return res.status(400).json({error:'وصل الموقع إلى الحد الأعلى للغرف حالياً'});if(db.rooms.some(r=>keyName(r.name)===keyName(name)))return res.status(409).json({error:'اسم الغرفة مستخدم بالفعل'});const id='r_'+crypto.randomBytes(5).toString('hex');const room={id,name,desc:String(req.body.desc||'غرفة جديدة').trim().slice(0,160),kind,capacity:Math.max(2,Math.min(200,Number(req.body.capacity)||50)),mics:kind==='voice'?Math.max(1,Math.min(20,Number(req.body.mics)||5)):0,micLikesRequired:kind==='voice'?Math.max(0,Math.min(1000000,Number(req.body.micLikesRequired ?? 30)||0)):0,owner:req.user.name,created:Date.now()};db.rooms.push(room);try{save()}catch(error){db.rooms=db.rooms.filter(item=>item.id!==id);console.error('Admin room creation save failed:',error);return res.status(500).json({error:'تعذر حفظ الغرفة على السيرفر'})}emitState();return res.json({ok:true,id,room});});
app.post('/api/admin/room/:id/lock',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const password=String(req.body.password||'');if(password.length<1)return res.status(400).json({error:'اكتب باسورد الغرفة أولاً'});if(password.length>128)return res.status(400).json({error:'الباسورد طويل جداً'});const previous=r.passwordHash;r.passwordHash=bcrypt.hashSync(password,12);try{save()}catch(error){if(previous===undefined)delete r.passwordHash;else r.passwordHash=previous;console.error('Room lock save failed:',error);return res.status(500).json({error:'تعذر حفظ قفل الغرفة'})}emitState();return res.json({ok:true,locked:true});});
app.delete('/api/admin/room/:id/lock',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const previous=r.passwordHash;delete r.passwordHash;try{save()}catch(error){if(previous!==undefined)r.passwordHash=previous;console.error('Room unlock save failed:',error);return res.status(500).json({error:'تعذر حفظ إزالة قفل الغرفة'})}emitState();return res.json({ok:true,locked:false});});
app.post('/api/admin/room/:id/image',requireAdmin,uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r){removeUploadedFile(req.file);return res.status(404).json({error:'الغرفة غير موجودة'});}if(!req.file||!req.file.mimetype.startsWith('image/')){removeUploadedFile(req.file);return res.status(400).json({error:'اختر صورة للغرفة'});}const previous=r.image;r.image='/uploads/'+req.file.filename;try{save()}catch(e){r.image=previous;removeUploadedFile(req.file);console.error('Admin room image save failed:',e.message);return res.status(500).json({error:'تعذر حفظ صورة الغرفة'});}if(previous&&previous.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(previous)))}catch{}}emitState();res.json({ok:true,image:r.image,room:r});});
app.post('/api/rooms/:id/image',requireAuth,uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r){removeUploadedFile(req.file);return res.status(404).json({error:'الغرفة غير موجودة'});}const owner=keyName(r.owner||'')===keyName(req.user.name||'');if(!owner&&!isOwner(req.user)&&!hasPermission(req.user,'room_image_manage')){removeUploadedFile(req.file);return res.status(403).json({error:'صورة الغرفة يگدر يغيرها منشئ الغرفة أو من يملك صلاحية إدارة صور الغرف'});}if(!req.file||!req.file.mimetype.startsWith('image/'))return res.status(400).json({error:'اختار ملف صورة صالح للغرفة'});const previous=r.image; r.image='/uploads/'+req.file.filename;try{save()}catch(err){r.image=previous;try{fs.unlinkSync(path.join(UP_DIR,req.file.filename))}catch{}console.error('Public room image save failed:',err);return res.status(500).json({error:'تعذر حفظ صورة الغرفة على السيرفر'})}if(previous&&previous.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(previous)))}catch{}}emitState();return res.json({ok:true,image:r.image,room:r});});
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
app.post('/api/profile/avatar',requireAuth,uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{if(!isOwner(req.user)&&Number(getUser(req.user.name)?.likes??getGuest(req.user.name)?.likes??0)<10){removeUploadedFile(req.file);return res.status(403).json({error:'تغيير الصورة يفتح عند 10 إعجابات'});}if(!req.file||!req.file.mimetype.startsWith('image/')){removeUploadedFile(req.file);return res.status(400).json({error:'اختر صورة'});}const p=profile(req.user.name),previous=p.avatar;p.avatar='/uploads/'+req.file.filename;try{save()}catch(e){p.avatar=previous;removeUploadedFile(req.file);console.error('Avatar save failed:',e.message);return res.status(500).json({error:'تعذر حفظ الصورة'});}if(previous&&previous.startsWith('/uploads/')){try{fs.unlinkSync(path.join(UP_DIR,path.basename(previous)))}catch{}}res.json({ok:true,avatar:p.avatar});});
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
    const targetRoom=db.rooms.find(r=>r.id===room); if(!targetRoom){socket.emit('join-error',{error:'الغرفة غير موجودة'});return;}if(targetRoom.kind==='voice'&&!siteModuleEnabled('voiceRooms')){socket.emit('join-error',{error:'الغرف الصوتية متوقفة من إدارة الموقع'});return;}
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
    if(!siteModuleEnabled('voiceRooms'))return socket.emit('error-msg',{error:'الغرف الصوتية متوقفة من إدارة الموقع'});
    const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||!room||u.room!==room||!socket.rooms.has(room))return;
    const r=db.rooms.find(x=>x.id===room);if(!r||r.kind!=='voice')return socket.emit('error-msg',{error:'هذا الخيار متاح بالغرف الصوتية فقط'});
    const speakers=voiceSpeakers.get(room)||new Map();
    if(raised){
      const likesRequired=Math.max(0,Number(r.micLikesRequired??30));
      if(Number(getUser(u.name)?.likes??getGuest(u.name)?.likes??0)<likesRequired&&!isOwner(u)&&!hasPermission(u,'voice_mic_override')){const error=`تحتاج إلى ${likesRequired} إعجاباً على الأقل لرفع المايك في هذه الغرفة`;socket.emit('voice-mic-denied',{error});return socket.emit('error-msg',{error});}
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
  socket.on('voice-peer-offer',d=>{if(!siteModuleEnabled('voiceRooms'))return;const u=socket.data.user,sid=socket.data.sid,room=u?.room;if(!u||!sid||!d||d.room!==room||!socket.rooms.has(room)||!allowVoiceSignal(sid)||!validSessionDescription(d.offer,'offer'))return;const speakers=voiceSpeakers.get(room),members=roomSockets.get(room);if(!speakers?.has(sid)||!members?.has(d.to)||d.to===sid)return;const target=socketUsers.get(d.to);if(!target||target.room!==room)return;activeVoicePairs.set(voiceRoomPairKey(room,sid,d.to),{room,a:sid,b:d.to,offerer:sid,created:Date.now()});socketBySession(d.to)?.emit('voice-peer-offer',{room,from:sid,fromName:u.name,offer:d.offer});});
  socket.on('voice-peer-answer',d=>{if(!siteModuleEnabled('voiceRooms'))return;const u=socket.data.user,sid=socket.data.sid,room=u?.room;if(!u||!sid||!d||d.room!==room||!socket.rooms.has(room)||!allowVoiceSignal(sid)||!validSessionDescription(d.answer,'answer'))return;const speakers=voiceSpeakers.get(room),members=roomSockets.get(room),state=activeVoicePairs.get(voiceRoomPairKey(room,d.to,sid));if(!members?.has(sid)||!speakers?.has(d.to)||!state||state.offerer!==d.to||state.b!==sid)return;socketBySession(d.to)?.emit('voice-peer-answer',{room,from:sid,answer:d.answer});});
  socket.on('voice-peer-ice',d=>{if(!siteModuleEnabled('voiceRooms'))return;const u=socket.data.user,sid=socket.data.sid,room=u?.room;if(!u||!sid||!d||d.room!==room||!socket.rooms.has(room)||!allowVoiceSignal(sid)||!validIceCandidate(d.candidate))return;const members=roomSockets.get(room),state=activeVoicePairs.get(voiceRoomPairKey(room,sid,d.to));if(!members?.has(sid)||!members?.has(d.to)||!state)return;socketBySession(d.to)?.emit('voice-peer-ice',{room,from:sid,candidate:d.candidate});});
  socket.on('leave-room',({room}={})=>{const u=socket.data.user,sid=socket.data.sid;if(!u||!room)return;socket.leave(room);roomSockets.get(room)?.delete(sid);voiceSpeakers.get(room)?.delete(sid);clearVoicePairsForSession(room,sid);for(const peerSid of (roomSockets.get(room)||new Set()))socketBySession(peerSid)?.emit('voice-peer-left',{room,sid});emitVoiceState(room);if(socketUsers.get(sid))socketUsers.get(sid).room='';if(socket.data.user)socket.data.user.room='';if(!u.ghost){const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'leave',exitKind:'room',text:'',at:Date.now(),profile:profile(u.name),role:u.role,presenceVisibility:u.hidden?'staff':'public'};try{addMessage(pm)}catch(e){console.warn('Leave presence could not be saved:',e.message)}emitPresenceToRoom(room,pm);}{const members=roomSockets.get(room)||new Set();for(const memberSid of [...members]){const active=socketUsers.get(memberSid);if(!active||active.room!==room)members.delete(memberSid);}if(members.size===0){roomSockets.delete(room);try{save()}catch(e){console.error('Room state save failed:',e.message)}}}emitState();});
  socket.on('send-message',d=>{const u=socket.data.user;if(!u)return;const room=String(d?.room||'');if(!room||u.room!==room||!socket.rooms.has(room))return socket.emit('error-msg',{error:'أنت خارج الغرفة'});const targetRoom=db.rooms.find(r=>r.id===room);if(!targetRoom)return socket.emit('error-msg',{error:'الغرفة غير موجودة'});if(roomMuted(u.name,room)||roomBanned(u.name,room))return socket.emit('error-msg',{error:'لا يمكنك الكتابة هنا'});const text=String(d?.text||'').trim();if(!text)return;if(blockedChatTerm(text))return socket.emit('error-msg',{error:'رسالتك تحتوي على كلمة غير مسموح بها'});const m={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'text',text:text.slice(0,2000),at:Date.now(),likes:userLikes(u),role:roleOf(u),vip:vipActive(u.name),profile:profile(u.name)};try{addMessage(m)}catch(e){console.error('Socket room message save failed:',e.message);return socket.emit('error-msg',{error:'تعذر حفظ الرسالة، حاول مرة أخرى'});}io.to(room).emit('message',m);});
  socket.on('private-message',d=>{const u=socket.data.user;if(!u||!d?.to)return;if(!siteModuleEnabled('privateChat'))return socket.emit('error-msg',{error:'المحادثات الخاصة متوقفة من إدارة الموقع'});if(globalBanned(u.name,socketClientIp(socket)))return socket.emit('error-msg',{error:'لا يمكنك المراسلة أثناء الحظر العام'});const toKey=keyName(d.to),to=accountKey(d.to),text=String(d.text||'').trim().slice(0,2000);if(!text)return;if(blockedChatTerm(text))return socket.emit('error-msg',{error:'رسالتك تحتوي على كلمة غير مسموح بها'});const tp=profile(to);if(tp.privateOpen===false&&!canMessageClosedPrivate(u))return socket.emit('error-msg',{error:`لقد أغلق ${displayName(to)} المحادثة الخاصة`});const ignored=(db.ignored?.[keyName(to)]||[]).some(x=>keyName(x)===keyName(u.name));if(ignored)return socket.emit('error-msg',{error:`لقد قام ${displayName(to)} بتجاهلك`});if(!getUser(to)&&!getGuest(to))return socket.emit('error-msg',{error:'هذا المستخدم غير موجود'});if(!hasConnectedSessionForUser(to))return socket.emit('error-msg',{error:'العضو غير متصل؛ المحادثات الخاصة مؤقتة بين المتصلين فقط'});const m={id:crypto.randomUUID(),from:u.name,fromDisplayName:displayName(u.name),to,toDisplayName:displayName(to),type:'text',text,at:Date.now(),profile:profile(u.name),role:roleOf(u),vip:vipActive(u.name),likes:userLikes(u)};const previousPrivateMessages=db.privateMessages;const fromKey=keyName(u.name);const previousHiddenTo=db.privateHidden?.[toKey];const previousHiddenFrom=db.privateHidden?.[fromKey];db.privateMessages=[...(db.privateMessages||[]),m].slice(-5000);if(db.privateHidden?.[toKey])db.privateHidden[toKey]=db.privateHidden[toKey].filter(x=>keyName(x)!==fromKey);if(db.privateHidden?.[fromKey])db.privateHidden[fromKey]=db.privateHidden[fromKey].filter(x=>keyName(x)!==toKey);emitToUser(to,'private-message',m);socket.emit('private-message',m);});
  socket.on('call-offer',d=>{if(!siteModuleEnabled('videoCalls'))return socket.emit('call-failed',{error:'المكالمات متوقفة من إدارة الموقع'});const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||(!isOwner(u)&&!canMedia(u))||!d?.to)return;if(!allowCallSignal(sid))return socket.emit('call-failed',{error:'طلبات الاتصال كثيرة جداً، حاول بعد قليل'});if(!validSessionDescription(d.offer,'offer'))return socket.emit('call-failed',{error:'بيانات الاتصال غير صالحة'});const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return socket.emit('call-failed',{error:'المستخدم غير متصل'});if(!canMedia(target[1]))return socket.emit('call-failed',{error:'الاتصال يحتاج 500 إعجاب للطرفين'});for(const [oldPair,oldState] of activeCallPairs){if(!oldState.answered&&Date.now()-oldState.created>120000)activeCallPairs.delete(oldPair);else if(oldState.caller===sid||oldState.callee===sid||oldState.caller===target[0]||oldState.callee===target[0])return socket.emit('call-failed',{error:'أحد الطرفين مشغول باتصال آخر'});}const pair=callPairKey(sid,target[0]),state={caller:sid,callee:target[0],created:Date.now(),video:!!d.video,answered:false};activeCallPairs.set(pair,state);const timeout=setTimeout(()=>{if(activeCallPairs.get(pair)!==state||state.answered)return;activeCallPairs.delete(pair);socket.emit('call-timeout',{from:target[1].name});socketBySession(target[0])?.emit('call-timeout',{from:u.name})},60000);timeout.unref?.();socketBySession(target[0])?.emit('call-offer',{from:u.name,fromDisplayName:displayName(u.name),fromProfile:(()=>{const p=profile(u.name);return {avatar:p.avatar||'',displayName:p.displayName||'',rank:p.rank||'',rankUntil:p.rankUntil||0,gifts:(p.gifts||[]).slice(0,1),vipUntil:p.vipUntil||0}})(),fromRole:roleOf(u),fromVip:vipActive(u.name),fromLikes:userLikes(u),offer:d.offer,video:!!d.video});});
  socket.on('call-answer',d=>{if(!siteModuleEnabled('videoCalls'))return;const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||(!isOwner(u)&&!canMedia(u))||!d?.to)return;if(!allowCallSignal(sid))return socket.emit('error-msg',{error:'طلبات الاتصال كثيرة جداً، حاول بعد قليل'});if(!validSessionDescription(d.answer,'answer'))return socket.emit('error-msg',{error:'بيانات الرد غير صالحة'});const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return;const pair=callPairKey(sid,target[0]),state=activeCallPairs.get(pair);if(!state||state.callee!==sid||state.caller!==target[0]||Date.now()-state.created>120000)return;state.answered=true;socketBySession(target[0])?.emit('call-answer',{from:u.name,answer:d.answer,video:state.video});});
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
app.get(/.*/,(req,res)=>sendSeoIndex(req,res));
server.listen(PORT,()=>console.log(`Rimaz server listening on ${PORT}`));
function gracefulShutdown(signal){
  if(messageSaveTimer){clearTimeout(messageSaveTimer);messageSaveTimer=null;}
  try{save();}catch(error){console.error(`Final database save failed during ${signal}:`,error.message);}
  io.close(()=>process.exit(0));
  const forceExit=setTimeout(()=>process.exit(1),10000);forceExit.unref?.();
}
process.once('SIGTERM',()=>gracefulShutdown('SIGTERM'));
process.once('SIGINT',()=>gracefulShutdown('SIGINT'));
