const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const { Readable, pipeline } = require('stream');
const { writeJsonSync } = require('./lib/json-writer');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Server } = require('socket.io');

// Initialize the Express application and its HTTP/Socket.IO servers before
// registering middleware, routes, or socket handlers below.
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Built-in media assets are individual files, not Base64 JSON packs.
// This keeps startup from parsing/duplicating ~20 MB of image payloads in RAM.
const BUILTIN_ASSET_DIRS = {
  smileys: path.join(__dirname, 'public', 'smileys'),
  gifts: path.join(__dirname, 'public', 'gifts'),
  vipGifts: path.join(__dirname, 'public', 'vip-gifts')
};
function listBuiltinAssets(directory, pattern) {
  try { return fs.readdirSync(directory).filter(file => pattern.test(file)).sort(); }
  catch (error) { console.error(`Could not list built-in assets in ${directory}:`, error.message); return []; }
}
const BUILTIN_SMILEY_FILES = listBuiltinAssets(BUILTIN_ASSET_DIRS.smileys, /^smiley-\d+\.(?:gif|png|jpe?g|webp)$/i);
const BUILTIN_GIFT_FILES = listBuiltinAssets(BUILTIN_ASSET_DIRS.gifts, /^[a-z0-9_-]+\.(?:gif|png|jpe?g|webp)$/i);
const BUILTIN_VIP_GIFT_FILES = listBuiltinAssets(BUILTIN_ASSET_DIRS.vipGifts, /^vip-[a-z0-9_-]+\.gif$/i);
const BUILTIN_SMILEYS = Object.fromEntries(BUILTIN_SMILEY_FILES.map(file => [file, '/smileys/' + file]));
// Redirect historical filenames whose extension did not match the actual image signature.
const SMILEY_FILE_ALIASES = Object.freeze({'smiley-125.png':'smiley-125.gif','smiley-190.jpeg':'smiley-190.jpg','smiley-230.jpeg':'smiley-230.jpg','smiley-218.jpeg':'smiley-218.jpg','smiley-236.jpeg':'smiley-236.jpg'});
// The exact mobile emoji set requested for the refreshed gallery.
const ALL_MOBILE_EMOJIS = [
  "😂","🫦","👄","🖕","🤝","👌","🫵","🤌","😠","😡","☹️","😓","😲","😮","😳","🥺","🥹","😢","🫣","🥶","🥰","🤧","🤮","😮‍💨","☺️","😁","😭","😆","🤐","🙄","🤤","🙊","🙉","🙈"
];

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const INDEX_CANDIDATES = [path.join(ROOT, 'index.html'), path.join(ROOT, 'public', 'index.html')];
const INDEX_FILE = INDEX_CANDIDATES.find(file => fs.existsSync(file));
if (!INDEX_FILE) console.error('FATAL: index.html is missing. Expected /app/index.html or /app/public/index.html');
// One authoritative public origin is shared by canonical URLs, social metadata,
// structured data, robots.txt and sitemap.xml. Set PUBLIC_SITE_URL if the site
// is moved to a verified custom domain; never derive canonical URLs from Host.
const PUBLIC_SITE_URL = (() => {
  const configured = String(process.env.PUBLIC_SITE_URL || 'https://noble-horizon-5826.de.deplexo.com').trim();
  try {
    const parsed = new URL(configured);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');
    return parsed.origin;
  } catch (error) {
    console.error('Invalid PUBLIC_SITE_URL; using the deployment default:', error.message);
    return 'https://noble-horizon-5826.de.deplexo.com';
  }
})();
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
app.get('/smileys/:file', (req,res)=>{const target=SMILEY_FILE_ALIASES[String(req.params.file||'')];if(target)return res.redirect(301,'/smileys/'+target);return res.sendStatus(404);});
// Serve bundled image directories directly from disk; Express streams the files
// without keeping all gift/smiley bytes resident in the Node process heap.
for (const [url, directory] of Object.entries(BUILTIN_ASSET_DIRS)) {
  const mount = url === 'vipGifts' ? '/vip-gifts' : '/' + url;
  app.use(mount, express.static(directory, { maxAge: '1y', immutable: true, fallthrough: true }));
}
// Keep crawler directives and the sitemap on the same authoritative origin as
// the canonical URL. API, socket transport and private media are intentionally
// excluded; the public homepage and public uploads remain crawlable.
app.get('/robots.txt', (req,res)=>{
  res.type('text/plain; charset=utf-8').set('Cache-Control','public, max-age=3600');
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /socket.io/\nDisallow: /private-media/\n\nSitemap: ${PUBLIC_SITE_URL}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req,res)=>{
  res.type('application/xml; charset=utf-8').set('Cache-Control','public, max-age=3600');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${PUBLIC_SITE_URL}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>`);
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
  setMeta('og:url', PUBLIC_SITE_URL + '/', 'property');
  setMeta('og:image', PUBLIC_SITE_URL + '/rimaz-hero.jpg', 'property');
  setMeta('twitter:image', PUBLIC_SITE_URL + '/rimaz-hero.jpg', 'name');
  html = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${escapeHtmlAttribute(PUBLIC_SITE_URL + '/')}" />`);
  html = html.replace(/(<script\s+type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/i, (whole, open, body, close) => {
    try { const schema = JSON.parse(body); schema.name = siteName; schema.description = description; schema.url = PUBLIC_SITE_URL + '/'; return open + JSON.stringify(schema).replace(/</g,'\\u003c') + close; }
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
  users: {}, guests: {}, sessions: {}, memberNumbers: {}, nextMemberNumber: 1, messages: [], wall: [], wallEnabled:true, notifications: {}, announcements: [], adminAuditLogs: [], loginHistory: [], adCampaigns: [], subscriptionPlans: [], subscriptions: [], ownerSetupCompleted:false, giftCatalogV3Initialized:false, smileysSeedVersion:0, smileysSeeded:false, rankDefinitions:[], rankArtCatalog:[], siteSettings: {siteName:'دردشة ريماز عراقية',tagline:'دردشة ريماز العراقية - دردشة عراقية للتواصل والتعارف والغرف والمحادثات العامة والخاصة.',notice:'',allowRegistration:true,allowGuests:true,modules:{wall:true,privateChat:true,voiceRooms:true,videoCalls:true,gifts:true}}, chatFilter: {enabled:false, words:[]}, welcomeMessages: [
    {id:'welcome-visitors',title:'دردشة ريماز عراقية',text:'إعزإئنا زوإر (دردشة ريماز عراقية)\nحياَكم الله منـورين الشاَت . الاعضاء الجدد نتمنيُ لكم اوقاَت سعيده',enabled:true},
    {id:'welcome-search',title:'الترحيب',text:'عزيزي الزائر للرجوع الينا اكتب في محرك البحث ( دردشة ريماز عراقية )\nنتمنا لكم وقت ممتعا',enabled:true}
  ],
  profiles: {}, lastLike: {}, accountPermissions: {}, permissionModelVersion:0, rankAudit: [], giftCatalog: [], vipGiftCatalog: [],
  chatShortcuts: [], customSmileys: [],
  rooms: [
    { id:'public', name:'الغرفة العامة', desc:'غرفة عامة ..', kind:'public', capacity:200, mics:0, owner:'admin' },
    { id:'friends', name:'غرفة الأصدقاء', desc:'غرفة خاصة ..', kind:'private', capacity:100, mics:0, owner:'admin' },
    { id:'love', name:'غرفة الحب', desc:'غرفة خاصة ..', kind:'private', capacity:100, mics:0, owner:'admin' },
    { id:'voice', name:'غرفة الصوت', desc:'مايك ..', kind:'voice', capacity:50, mics:5, owner:'admin' },
    { id:'admin-room', name:'غرفة الإدارة', desc:'غرفة الإدارة ..', kind:'private', capacity:100, mics:0, owner:'admin', theme:'black' }
  ],
  roomBans:{}, roomMutes:{}, roomKicks:{}, globalBans:{}, globalIpBans:{},
  wallLikes:{}, wallComments:{}, wallReadAt:{}, privateMessages:[], privateHidden:{}, privateRead:{}, ignored:{}
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
if(!db.wallReadAt||typeof db.wallReadAt!=='object'||Array.isArray(db.wallReadAt))db.wallReadAt={};
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
    catch(e) { console.error('FATAL: could not persist smiley gallery migration; startup stopped:',e.message); throw new Error('Smiley gallery migration could not be persisted; refusing to start with uncommitted startup state.'); }
  }
}


// Ensure the agreed administration room exists on older saved databases.
if(!Array.isArray(db.rooms)) db.rooms=[];
if(!db.rooms.some(r=>r.id==='admin-room')) db.rooms.push({id:'admin-room',name:'غرفة الإدارة',desc:'غرفة الإدارة ..',kind:'private',capacity:100,mics:0,owner:'admin',theme:'black'});
for(const r of db.rooms){delete r.micLikesRequired;if(r.id==='public')r.theme='black';else if(r.id!=='admin-room')r.theme='red';}
if(!Array.isArray(db.welcomeMessages) || db.welcomeMessages.length===0) db.welcomeMessages=defaults().welcomeMessages;
// Migrate the earlier placeholder/default greeting set to the agreed editable pair,
// while preserving any genuinely customized messages.
const agreedWelcomeDefaults=defaults().welcomeMessages;
const legacyWelcomeTexts=new Set(['إدارة ريماز ترحب بالأعضاء الداخلين','أهلاً وسهلاً بكم في دردشة ريماز عراقية']);
if(Array.isArray(db.welcomeMessages) && db.welcomeMessages.length && db.welcomeMessages.every(m=>legacyWelcomeTexts.has(String(m.text||'').trim()))) db.welcomeMessages=agreedWelcomeDefaults;
// If the saved set is the old default pair, replace it with the approved default text.
if(Array.isArray(db.welcomeMessages) && db.welcomeMessages.length===2 && db.welcomeMessages.some(m=>String(m.text||'').includes('إدارة ريماز ترحب'))) db.welcomeMessages=agreedWelcomeDefaults;
try { save(); } catch(e) { console.error('FATAL: could not persist welcome-message defaults/migration; startup stopped:',e.message); throw new Error('Welcome-message migration could not be persisted; refusing to start with uncommitted startup state.'); }
// Remove expired timed announcements after restarts; expiry is stored with the announcement.
const expiredAnnouncementIds=new Set((db.announcements||[]).filter(a=>a&&['5m','15m'].includes(a.duration)&&Number(a.at)+900000<=Date.now()).map(a=>String(a.id)));
if(expiredAnnouncementIds.size){db.announcements=(db.announcements||[]).filter(a=>!expiredAnnouncementIds.has(String(a.id)));db.messages=(db.messages||[]).filter(m=>![...expiredAnnouncementIds].some(id=>String(m.id||'').startsWith(id+'-')));try{save()}catch(e){console.error('FATAL: could not persist expired-announcement cleanup; startup stopped:',e.message);throw new Error('Expired-announcement cleanup could not be persisted; refusing to start with uncommitted startup state.')}}
// Direct private conversations and the wall are separate from db.rooms.
// Keep room announcements available in every configured room, including rooms
// whose access kind is private; only one-to-one DMs and the wall are excluded.
// One permission model: the seven visible ranks. Legacy generic roles are migrated once below.
const RANK_PERMISSION_PROFILES=['admin-full','admin-shield','crown-gold','crown-silver','super-black','super-white','super-red'];
const CORE_RANK_LEVELS=Object.freeze({'admin-full':1000,'admin-shield':900,'crown-gold':800,'crown-silver':700,'super-black':600,'super-white':500,'super-red':400});
db.accountPermissions=db.accountPermissions&&typeof db.accountPermissions==='object'?db.accountPermissions:{};
function save(){
  // Keep the existing synchronous/atomic contract for every route while writing
  // JSON in bounded chunks instead of allocating a second full-database string.
  // Private messages are deliberately memory-only and are never written to disk.
  const snapshot = { ...db, privateMessages: [] };
  const tempFile = `${DB_FILE}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  let fd = null;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fd = fs.openSync(tempFile, 'wx', 0o600);
    writeJsonSync(fd, snapshot);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    fs.renameSync(tempFile, DB_FILE);
    // Best-effort directory sync makes the atomic rename survive sudden power loss on supported filesystems.
    try { const dirFd=fs.openSync(DATA_DIR,'r'); try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); } }
    catch (syncError) { console.error('Database directory sync unavailable after atomic replacement:',syncError.message); }
  } catch (error) {
    if (fd !== null) { try { fs.closeSync(fd); } catch (_) {} }
    try { fs.unlinkSync(tempFile); } catch (_) {}
    throw error;
  }
}
// v46.82.0: seed the current standard catalogue once and forcibly replace legacy VIP entries once.
let giftCatalogMigrationChanged=false;
if(db.giftCatalogV4Initialized!==true){
  giftCatalogMigrationChanged=true;
  db.giftCatalog=BUILTIN_GIFT_FILES.map((file,i)=>({id:'gift-pack-'+String(i+1).padStart(3,'0'),name:'هدية',icon:'🎁',image:'/gifts/'+file,price:0,builtin:true,packVersion:5}));
  db.giftCatalogV4Initialized=true;
  db.giftCatalogV5Initialized=true;
}
if(db.giftCatalogV5Initialized!==true){
  giftCatalogMigrationChanged=true;
  db.giftCatalog=BUILTIN_GIFT_FILES.map((file,i)=>({id:'gift-pack-'+String(i+1).padStart(3,'0'),name:'هدية',icon:'🎁',image:'/gifts/'+file,price:0,builtin:true,packVersion:5}));
  db.giftCatalogV5Initialized=true;
}
// v46.83.0: replace the legacy VIP gift catalogue with the exact latest user-supplied asset.
// This is a one-time data migration, not a display filter: old VIP catalogue entries are discarded.
// v46.84.0: canonical VIP catalogue reset. Remove every legacy VIP catalogue item
// and obsolete VIP gift assignment from profiles; retain VIP membership itself and ordinary gifts.
if(db.vipGiftCatalogV7Initialized!==true){
  giftCatalogMigrationChanged=true;
  db.vipGiftCatalog=[{id:'vip-gift-pack-001',name:'هدية VIP',icon:'👑',image:'/vip-gifts/vip-special.gif',builtin:true,packVersion:4,category:'vip'}];
  db.vipGiftCatalogV7Initialized=true;
  for(const profileData of Object.values(db.profiles||{})){
    if(!profileData||!Array.isArray(profileData.gifts))continue;
    const before=profileData.gifts.length;
    profileData.gifts=profileData.gifts.filter(g=>String(g?.category||'')!=='vip' && !String(g?.giftId||'').toLowerCase().includes('vip') && !String(g?.giftImage||'').startsWith('/vip-gifts/'));
    if(profileData.gifts.length!==before)giftCatalogMigrationChanged=true;
  }
}
if(!Array.isArray(db.vipGiftCatalog))db.vipGiftCatalog=[];
try{if(giftCatalogMigrationChanged)save();}catch(error){console.error('FATAL: could not persist gift catalogue migration; startup stopped:',error.message);throw new Error('Gift catalogue migration could not be persisted; refusing to start with uncommitted startup state.')}

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
  let notificationsChanged=false;
  for(const [name,items] of Object.entries(db.notifications||{})){
    if(!Array.isArray(items))continue;
    const retained=items.filter(item=>!String(item?.type||'').startsWith('private'));
    if(retained.length!==items.length){db.notifications[name]=retained;notificationsChanged=true;}
  }
  let removedFiles=0;
  for(const entry of fs.readdirSync(PRIVATE_MEDIA_DIR,{withFileTypes:true})){
    if(!entry.isFile())continue;
    try{fs.unlinkSync(path.join(PRIVATE_MEDIA_DIR,entry.name));removedFiles++;}
    catch(error){if(error.code!=='ENOENT')console.warn('Startup private media purge failed:',error.message);}
  }
  if(hadHistory||removedFiles)console.log(`Purged transient private history and ${removedFiles} private media file(s).`);
  // Persist notification-only cleanup too; otherwise stale private notices remain on disk
  // and are needlessly reprocessed after every restart.
  if(hadHistory||removedFiles||notificationsChanged)save();
}
purgePrivateHistoryAtStartup();

const ANNOUNCEMENT_INTERVAL_MS=15*60*1000;
function announcementMessage(item,at=Date.now(),idSuffix=String(at)){
  if(item.duration==='15m')return {id:String(item.id)+'-'+idSuffix,announcementId:String(item.id),room:'__broadcast__',from:item.from,displayName:item.displayName||displayName(item.from),role:item.role||roleOf({name:item.from}),type:'announcement',text:item.text,at,duration:item.duration,profile:item.profile||profile(item.from)};
  return {id:String(item.id)+'-'+idSuffix,announcementId:String(item.id),room:'__broadcast__',from:'الإدارة',displayName:'الإدارة',title:item.title||'إعلان إداري',role:'member',type:'announcement',text:item.text,at,duration:item.duration,profile:{}};
}
// Room history on entry contains presence notices only. Announcements are
// live scheduled broadcasts; replaying them here made every room entry look like
// a fresh ad delivery and caused multiple permanent ads to stack with greetings.
function roomHistoryWithAnnouncements(roomId,viewer,createdAt=0){
  const items=(db.messages||[]).filter(m=>m.room===roomId&&Number(m.at||0)>=createdAt&&m.type==='presence'&&canSeePresenceNotice(viewer,m));
  // Message identity is account-backed, not a stale snapshot captured when the
  // message was sent. Resolve the current display name and profile on every history
  // delivery so rank/name changes are consistent across browsers and old messages.
  const currentItems=items.map(item=>{
    if(!item?.from || ['announcement','welcome'].includes(item.type))return item;
    const currentProfile=profile(item.from);
    const account=getUser(item.from)||getGuest(item.from);
    return {...item,displayName:displayName(item.from),profile:currentProfile,role:roleOf({name:item.from,role:account?.role})};
  });
  return currentItems.sort((a,b)=>Number(a.at||0)-Number(b.at||0)).slice(-200);
}
function publishAnnouncement(item){
  if(!item||!item.id)return [];
  const at=Date.now();
  const previousMessages=db.messages;
  const previousLastPublishedAt=item.lastPublishedAt;
  const hadLastPublishedAt=Object.prototype.hasOwnProperty.call(item,'lastPublishedAt');
  const previousNextScheduledAt=item.nextScheduledAt;
  const hadNextScheduledAt=Object.prototype.hasOwnProperty.call(item,'nextScheduledAt');
  if(item.duration==='permanent'){item.lastPublishedAt=at;delete item.nextScheduledAt;}
  const message=announcementMessage(item,at,String(at));
  db.messages=[...(db.messages||[]),message].slice(-1000);
  try{save();}catch(error){
    if(previousMessages===undefined)delete db.messages;else db.messages=previousMessages;
    if(hadLastPublishedAt)item.lastPublishedAt=previousLastPublishedAt;else delete item.lastPublishedAt;
    if(hadNextScheduledAt)item.nextScheduledAt=previousNextScheduledAt;else delete item.nextScheduledAt;
    throw error;
  }
  // Announcements are site-wide; broadcast only after durable commit.
  io.emit('message',message);
  return [message];
}
const permanentAnnouncementTimers=new Map();
const announcementExpiryTimers=new Map();
function removeAnnouncement(itemId){
  const id=String(itemId);
  const previousAnnouncements=db.announcements;
  const previousMessages=db.messages;
  const removed=(db.messages||[]).filter(m=>String(m.announcementId||'')===id||String(m.id||'').startsWith(id+'-'));
  db.announcements=(db.announcements||[]).filter(a=>String(a.id)!==id);
  db.messages=(db.messages||[]).filter(m=>String(m.announcementId||'')!==id&&!String(m.id||'').startsWith(id+'-'));
  try{save();}catch(error){
    if(previousAnnouncements===undefined)delete db.announcements;else db.announcements=previousAnnouncements;
    if(previousMessages===undefined)delete db.messages;else db.messages=previousMessages;
    throw error;
  }
  const expiryTimer=announcementExpiryTimers.get(id);if(expiryTimer)clearTimeout(expiryTimer);announcementExpiryTimers.delete(id);
  const permanentTimer=permanentAnnouncementTimers.get(id);if(permanentTimer)clearTimeout(permanentTimer);permanentAnnouncementTimers.delete(id);
  for(const message of removed)io.emit('message-deleted',{id:message.id});
  scheduleAllPermanentAnnouncements();
  return removed;
}
function scheduleAnnouncementExpiry(item,retryDelay=null){
  if(!item||!['5m','15m'].includes(item.duration)||!item.id)return;
  const id=String(item.id),oldTimer=announcementExpiryTimers.get(id);if(oldTimer)clearTimeout(oldTimer);
  const due=retryDelay===null?Number(item.at||Date.now())+ANNOUNCEMENT_INTERVAL_MS:Date.now()+Math.max(1000,Number(retryDelay)||60000);
  const timer=setTimeout(()=>{
    announcementExpiryTimers.delete(id);
    try{removeAnnouncement(id);}catch(error){
      console.error('Timed announcement expiry save failed; retrying:',error.message);
      const current=(db.announcements||[]).find(a=>String(a.id)===id);
      if(current)scheduleAnnouncementExpiry(current,60000);
    }
  },Math.max(0,due-Date.now()));
  timer.unref?.();announcementExpiryTimers.set(id,timer);
}
function schedulePermanentAnnouncement(item,retryDelay=null){
  if(!item||item.duration!=='permanent'||!item.id)return;
  const id=String(item.id),oldTimer=permanentAnnouncementTimers.get(id);if(oldTimer)clearTimeout(oldTimer);
  const now=Date.now();
  const due=retryDelay!==null?now+Math.max(1000,Number(retryDelay)||60000):(Number(item.lastPublishedAt||0)>0?Number(item.lastPublishedAt)+ANNOUNCEMENT_INTERVAL_MS:Math.max(now,Number(item.nextScheduledAt||now)));
  const timer=setTimeout(()=>{
    permanentAnnouncementTimers.delete(id);
    const current=(db.announcements||[]).find(a=>String(a.id)===id&&a.duration==='permanent');
    if(!current)return;
    try{publishAnnouncement(current);schedulePermanentAnnouncement(current);}
    catch(error){console.error('Permanent announcement publish failed; retrying:',error.message);schedulePermanentAnnouncement(current,60000);}
  },Math.max(0,due-now));
  timer.unref?.();permanentAnnouncementTimers.set(id,timer);
}
function scheduleAllPermanentAnnouncements(){
  for(const timer of permanentAnnouncementTimers.values())clearTimeout(timer);
  permanentAnnouncementTimers.clear();
  const now=Date.now();
  const items=(db.announcements||[]).filter(a=>a&&a.duration==='permanent'&&a.id).slice().sort((a,b)=>Number(a.at||0)-Number(b.at||0));
  const pending=items.filter(a=>!(Number(a.lastPublishedAt)>0));
  const slot=ANNOUNCEMENT_INTERVAL_MS/Math.max(1,items.length);
  const firstOffset=items.some(a=>Number(a.lastPublishedAt)>0)?1:0;
  pending.forEach((item,index)=>{item.nextScheduledAt=now+Math.round((index+firstOffset)*slot);schedulePermanentAnnouncement(item);});
  items.filter(a=>Number(a.lastPublishedAt)>0).forEach(schedulePermanentAnnouncement);
}

for(const item of (db.announcements||[]))if(['5m','15m'].includes(item.duration))scheduleAnnouncementExpiry(item);
scheduleAllPermanentAnnouncements();

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
  const previousMessagesValue=db.messages;
  const previousWallValue=db.wall;
  const previousWallLikesValue=db.wallLikes;
  const previousWallCommentsValue=db.wallComments;
  const previousWallLikesSnapshot=previousWallLikesValue&&typeof previousWallLikesValue==='object'&&!Array.isArray(previousWallLikesValue)?{...previousWallLikesValue}:previousWallLikesValue;
  const previousWallCommentsSnapshot=previousWallCommentsValue&&typeof previousWallCommentsValue==='object'&&!Array.isArray(previousWallCommentsValue)?{...previousWallCommentsValue}:previousWallCommentsValue;
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
    try{save();}catch(error){
      if(previousMessagesValue===undefined)delete db.messages;else db.messages=previousMessagesValue;
      if(previousWallValue===undefined)delete db.wall;else db.wall=previousWallValue;
      if(previousWallLikesValue===undefined)delete db.wallLikes;else db.wallLikes=previousWallLikesSnapshot;
      if(previousWallCommentsValue===undefined)delete db.wallComments;else db.wallComments=previousWallCommentsSnapshot;
      console.error('24-hour public retention save failed:',error.message);
      return;
    }
    for(const id of expiredMessageIds)io.emit('message-deleted',{id});
    io.emit('wall-retention-cleaned',{ids:[...expiredWallIds]});
    for(const url of new Set(expiredMedia))removePublicUploadIfUnreferenced(url);
    console.log(`24-hour cleanup removed ${expiredMessageIds.length} public message(s), ${expiredWallIds.size} wall post(s).`);
  }
}
cleanupExpiredPublicContent();
const publicRetentionTimer=setInterval(()=>cleanupExpiredPublicContent(),5*60*1000);
publicRetentionTimer.unref?.();

const sessions = new Map(); // sid -> {name,type,created}
const privateMediaPlaybackTickets = new Map(); // bounded, short-lived, account-bound stream tickets
const MAX_PRIVATE_MEDIA_TICKETS=4096;
const MAX_PRIVATE_MEDIA_TICKETS_PER_ACCOUNT=32;
function createPrivateMediaPlaybackTicket(filename,account,now=Date.now()){
  let accountTicketCount=0;
  for(const [token,ticket] of privateMediaPlaybackTickets){
    if(ticket.expiresAt<=now){privateMediaPlaybackTickets.delete(token);continue;}
    if(ticket.account===account){
      accountTicketCount++;
      if(ticket.filename===filename){ticket.expiresAt=now+15*60*1000;return {token,ticket,reused:true};}
    }
  }
  if(accountTicketCount>=MAX_PRIVATE_MEDIA_TICKETS_PER_ACCOUNT)return {error:'account-limit'};
  if(privateMediaPlaybackTickets.size>=MAX_PRIVATE_MEDIA_TICKETS)return {error:'global-limit'};
  const token=crypto.randomBytes(32).toString('hex');
  const ticket={filename,account,expiresAt:now+15*60*1000};
  privateMediaPlaybackTickets.set(token,ticket);
  return {token,ticket,reused:false};
}
const privateMediaPlaybackTicketCleanup=setInterval(()=>{const now=Date.now();for(const [token,ticket] of privateMediaPlaybackTickets){if(ticket.expiresAt<=now)privateMediaPlaybackTickets.delete(token);}},5*60*1000);
privateMediaPlaybackTicketCleanup.unref?.();
for (const [sid,s] of Object.entries(db.sessions||{})) sessions.set(sid,s);
const roomSockets = new Map();
const socketUsers = new Map();
// WebRTC signaling is relayed only between peers with a recent, server-authorized offer.
const activeCallPairs = new Map();
const activeVoicePairs = new Map(); // Authorized room-scoped speaker/listener negotiations.
const MAX_ACTIVE_VOICE_PAIRS=8192;
const VOICE_PAIR_TTL_MS=120000;
function pruneActiveVoicePairs(now=Date.now()){for(const [key,state] of activeVoicePairs){if(!state||!Number.isFinite(state.created)||now-state.created>VOICE_PAIR_TTL_MS)activeVoicePairs.delete(key);}}
const activeVoicePairCleanup=setInterval(()=>pruneActiveVoicePairs(),30000);
activeVoicePairCleanup.unref?.();
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
function removeSessionFromRoomRuntime(sid,room){
  if(!sid||!room)return;
  const members=roomSockets.get(room);
  if(members){
    members.delete(sid);
    for(const peerSid of members)if(peerSid!==sid)socketBySession(peerSid)?.emit('voice-peer-left',{room,sid});
    if(members.size===0)roomSockets.delete(room);
  }
  const speakers=voiceSpeakers.get(room);
  if(speakers){
    speakers.delete(sid);
    if(speakers.size===0)voiceSpeakers.delete(room);
  }
  clearVoicePairsForSession(room,sid);
  emitVoiceState(room);
}
function clearDeletedRoomRuntime(room){
  const members=[...(roomSockets.get(room)||[])];
  for(const sid of members){
    const socket=socketBySession(sid);
    socket?.leave(room);
    if(socket?.data?.user)socket.data.user.room='';
    const active=socketUsers.get(sid);
    if(active)active.room='';
    removeSessionFromRoomRuntime(sid,room);
    socket?.emit('kicked',{room,deleted:true});
  }
  roomSockets.delete(room);
  voiceSpeakers.delete(room);
  for(const [key,state] of activeVoicePairs)if(state.room===room)activeVoicePairs.delete(key);
}
const sessionDisconnectTimers = new Map();
const privateDisconnectTimers = new Map();
const SESSION_DISCONNECT_GRACE_MS=60000;
const PRIVATE_DISCONNECT_GRACE_MS=60000;
function hasConnectedSessionForUser(name){return [...socketUsers.values()].some(active=>keyName(active?.name)===keyName(name));}
function cancelSessionDisconnectCleanup(sid){const timer=sessionDisconnectTimers.get(sid);if(timer){clearTimeout(timer);sessionDisconnectTimers.delete(sid);}}
function scheduleSessionDisconnectCleanup(sid,user){
  if(!sid||!user?.name||!sessions.has(sid))return;
  cancelSessionDisconnectCleanup(sid);
  const timer=setTimeout(()=>{
    sessionDisconnectTimers.delete(sid);
    if(socketUsers.has(sid))return;
    const current=sessions.get(sid);if(!current)return;
    const hadWelcome=welcomeSentSessions.has(sid),previousGuest=current.type==='guest'?db.guests[current.name]:undefined,previousProfile=current.type==='guest'?db.profiles[current.name]:undefined,guestKey=keyName(current.name),previousWallReadAt=db.wallReadAt?.[guestKey];
    sessions.delete(sid);welcomeSentSessions.delete(sid);delete db.sessions[sid];
    if(current.type==='guest'&&!hasConnectedSessionForUser(current.name)){delete db.guests[current.name];delete db.profiles[current.name];delete db.wallReadAt[guestKey];}
    try{save();}catch(error){
      console.error('Disconnected session cleanup failed:',error.message);sessions.set(sid,current);db.sessions[sid]=current;
      if(current.type==='guest'){if(previousGuest!==undefined)db.guests[current.name]=previousGuest;if(previousProfile!==undefined)db.profiles[current.name]=previousProfile;if(previousWallReadAt!==undefined)db.wallReadAt[guestKey]=previousWallReadAt;}
      if(hadWelcome)welcomeSentSessions.add(sid);
      // The grace timer already fired; retry cleanup after a transient persistence failure.
      scheduleSessionDisconnectCleanup(sid,current);
      return;
    }
    clearSessionTransientState(sid);
    emitState();
  },SESSION_DISCONNECT_GRACE_MS);
  timer.unref?.();sessionDisconnectTimers.set(sid,timer);
}
const startupSessionDatabase=db;
const startupSessionEntries=[...sessions.entries()];
function cleanupOrphanedStartupSessions(){
  if(db!==startupSessionDatabase)return;
  const candidates=startupSessionEntries.filter(([sid,user])=>sessions.get(sid)===user&&!socketUsers.has(sid)&&!sessionDisconnectTimers.has(sid));
  if(!candidates.length)return;
  const removedSessions=[];
  const guestSnapshots=new Map();
  for(const [sid,user] of candidates){
    const hadDbSession=Object.prototype.hasOwnProperty.call(db.sessions||{},sid);
    const dbSession=db.sessions?.[sid];
    sessions.delete(sid);
    if(db.sessions)delete db.sessions[sid];
    removedSessions.push({sid,user,hadDbSession,dbSession});
    if(user.type==='guest'&&!hasConnectedSessionForUser(user.name)&&!guestSnapshots.has(user.name)){
      const name=user.name,guestKey=keyName(name);
      guestSnapshots.set(name,{
        guestHad:Object.prototype.hasOwnProperty.call(db.guests||{},name),
        guest:db.guests?.[name],
        profileHad:Object.prototype.hasOwnProperty.call(db.profiles||{},name),
        profile:db.profiles?.[name],
        wallReadHad:Object.prototype.hasOwnProperty.call(db.wallReadAt||{},guestKey),
        wallRead:db.wallReadAt?.[guestKey]
      });
      if(db.guests)delete db.guests[name];
      if(db.profiles)delete db.profiles[name];
      if(db.wallReadAt)delete db.wallReadAt[guestKey];
    }
  }
  try{save();}catch(error){
    for(const item of removedSessions){
      sessions.set(item.sid,item.user);
      if(item.hadDbSession){db.sessions=db.sessions||{};db.sessions[item.sid]=item.dbSession;}
    }
    for(const [name,snapshot] of guestSnapshots){
      if(snapshot.guestHad){db.guests=db.guests||{};db.guests[name]=snapshot.guest;}
      if(snapshot.profileHad){db.profiles=db.profiles||{};db.profiles[name]=snapshot.profile;}
      const guestKey=keyName(name);
      if(snapshot.wallReadHad){db.wallReadAt=db.wallReadAt||{};db.wallReadAt[guestKey]=snapshot.wallRead;}
    }
    console.error('Startup disconnected-session cleanup failed:',error.message);
    const retry=setTimeout(cleanupOrphanedStartupSessions,30000);
    retry.unref?.();
    return;
  }
  for(const {sid} of removedSessions)clearSessionTransientState(sid);
  console.log('Startup cleanup removed '+removedSessions.length+' orphaned session(s) after reconnect grace.');
  emitState();
}
const startupSessionCleanupTimer=setTimeout(cleanupOrphanedStartupSessions,SESSION_DISCONNECT_GRACE_MS);
startupSessionCleanupTimer.unref?.();

function clearPrivateConversationForUser(name){
  const userKey=keyName(name);if(!userKey||hasConnectedSessionForUser(name))return true;
  const removed=(db.privateMessages||[]).filter(message=>keyName(message.from)===userKey||keyName(message.to)===userKey);
  if(!removed.length)return true;
  const previousMessages=db.privateMessages,previousRead=db.privateRead,previousHidden=db.privateHidden,previousNotifications=db.notifications;
  const peers=new Set();
  for(const message of removed){const peer=keyName(message.from)===userKey?keyName(message.to):keyName(message.from);if(peer)peers.add(peer);}
  const nextMessages=(db.privateMessages||[]).filter(message=>keyName(message.from)!==userKey&&keyName(message.to)!==userKey);
  const readRoot={...(db.privateRead||{})},hiddenRoot={...(db.privateHidden||{})},notificationRoot={...(db.notifications||{})};
  for(const peer of peers){
    if(readRoot[userKey]){readRoot[userKey]={...readRoot[userKey]};delete readRoot[userKey][peer];}
    if(readRoot[peer]){readRoot[peer]={...readRoot[peer]};delete readRoot[peer][userKey];}
    if(hiddenRoot[userKey])hiddenRoot[userKey]=hiddenRoot[userKey].filter(item=>keyName(item)!==peer);
    if(hiddenRoot[peer])hiddenRoot[peer]=hiddenRoot[peer].filter(item=>keyName(item)!==userKey);
  }
  for(const [owner,items] of Object.entries(notificationRoot))if(Array.isArray(items))notificationRoot[owner]=items.filter(item=>!(String(item?.type||'').startsWith('private')&&(keyName(item.from)===userKey||peers.has(keyName(item.from)))));
  db.privateMessages=nextMessages;db.privateRead=readRoot;db.privateHidden=hiddenRoot;db.notifications=notificationRoot;
  try{save();}catch(error){
    if(previousMessages===undefined)delete db.privateMessages;else db.privateMessages=previousMessages;
    if(previousRead===undefined)delete db.privateRead;else db.privateRead=previousRead;
    if(previousHidden===undefined)delete db.privateHidden;else db.privateHidden=previousHidden;
    if(previousNotifications===undefined)delete db.notifications;else db.notifications=previousNotifications;
    console.error('Transient private conversation cleanup save failed; retrying:',error.message);
    return false;
  }
  for(const message of removed){
    const url=String(message?.media?.url||''),prefix='/api/private/media/';
    if(!url.startsWith(prefix))continue;
    const filename=url.slice(prefix.length);
    if(!/^[a-zA-Z0-9._-]{1,180}$/.test(filename))continue;
    if(!nextMessages.some(item=>item?.media?.url===url)){try{fs.unlinkSync(path.join(PRIVATE_MEDIA_DIR,filename));}catch(error){if(error.code!=='ENOENT')console.warn('Private media cleanup failed:',error.message);}}
  }
  for(const peer of peers)emitToUser(peer,'private-conversation-ended',{with:name});
  return true;
}
function schedulePrivateConversationCleanup(name,delay=PRIVATE_DISCONNECT_GRACE_MS){
  const key=keyName(name);if(!key||hasConnectedSessionForUser(name))return;
  const old=privateDisconnectTimers.get(key);if(old)clearTimeout(old);
  const timer=setTimeout(()=>{privateDisconnectTimers.delete(key);if(!clearPrivateConversationForUser(name)&&!hasConnectedSessionForUser(name))schedulePrivateConversationCleanup(name,60000);},delay);
  timer.unref?.();privateDisconnectTimers.set(key,timer);
}
function cancelPrivateConversationCleanup(name){const key=keyName(name),timer=privateDisconnectTimers.get(key);if(timer){clearTimeout(timer);privateDisconnectTimers.delete(key);}}

function cleanName(v){ return String(v||'').trim().replace(/\s+/g,' ').slice(0,32); }
function keyName(n){ return cleanName(n).toLowerCase(); }
function memberNumberIdentity(name,type){return `${type==='guest'?'guest':'member'}:${keyName(name)}`;}
function allocateMemberNumber(name,type,account){if(!db.memberNumbers||typeof db.memberNumbers!=='object'||Array.isArray(db.memberNumbers))db.memberNumbers={};const identity=memberNumberIdentity(name,type);let value=Number(db.memberNumbers[identity]||account?.memberNumber||0);const used=new Set(Object.entries(db.memberNumbers).filter(([k])=>k!==identity).map(([,v])=>Number(v)).filter(v=>Number.isSafeInteger(v)&&v>0));if(!Number.isSafeInteger(value)||value<1||used.has(value)){value=Math.max(1,Number(db.nextMemberNumber)||1);while(used.has(value))value++;}db.memberNumbers[identity]=value;db.nextMemberNumber=Math.max(Number(db.nextMemberNumber)||1,value+1);if(account)account.memberNumber=value;return value;}
function getMemberNumber(name,type){const account=type==='guest'?getGuest(name):getUser(name);return allocateMemberNumber(name,type,account);}
let memberNumbersMigrated=false;for(const [name,account] of Object.entries(db.users||{})){const identity=memberNumberIdentity(name,'member');if(!Number.isSafeInteger(Number(db.memberNumbers?.[identity]))||Number(db.memberNumbers?.[identity])<1||Number(account?.memberNumber)!==Number(db.memberNumbers?.[identity])){allocateMemberNumber(name,'member',account);memberNumbersMigrated=true;}}for(const [name,account] of Object.entries(db.guests||{})){const identity=memberNumberIdentity(name,'guest');if(!Number.isSafeInteger(Number(db.memberNumbers?.[identity]))||Number(db.memberNumbers?.[identity])<1||Number(account?.memberNumber)!==Number(db.memberNumbers?.[identity])){allocateMemberNumber(name,'guest',account);memberNumbersMigrated=true;}}if(memberNumbersMigrated){try{save();}catch(error){console.error('Could not persist member-number migration:',error.message);}}
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
const NOTICE_LIKES_REQUIRED=400;
const ROOM_MIC_LIKES_REQUIRED=30;
const PRIVATE_MEDIA_LIKES_REQUIRED=500;
function level(l){ l=Number(l)||0; return l>=500?3:l>=400?2:1; }
function canNotice(u){ return !!u&&(isFullPermissionAdmin(u)||userLikes(u)>=NOTICE_LIKES_REQUIRED); }
function canMedia(u){ return !!u&&(isFullPermissionAdmin(u)||userLikes(u)>=PRIVATE_MEDIA_LIKES_REQUIRED); }
function canRaiseRoomMic(u){ return !!u&&(isFullPermissionAdmin(u)||userLikes(u)>=ROOM_MIC_LIKES_REQUIRED); }
function vipActive(name){const p=profile(name);if(p.vipUntil&&Number(p.vipUntil)>Date.now())return true;if(p.vipUntil){const previous=p.vipUntil;delete p.vipUntil;try{save();}catch(error){p.vipUntil=previous;console.error('Expired VIP cleanup save failed:',error.message);}}return false;}
function defaultStatus(name){ return getGuest(name) ? '(غير مسجل)' : '(عضو جديد)'; }
function profile(name){
  if (!db.profiles[name]) db.profiles[name]={displayName:cleanName(name),avatar:'',status:defaultStatus(name),bio:'عضو في دردشة ريماز عراقية',nameColor:'#222222',fontColor:'#222222',bgColor:'#ffffff',privateOpen:true,notificationsOpen:true};
  const p=db.profiles[name];
  if(!p.displayName) p.displayName=cleanName(name);
  // Expire temporary visual ranks before projecting their assigned rank artwork/banner.
  if(p.rankUntil && Number(p.rankUntil)<=Date.now()) {
    const previous={rank:p.rank,rankUntil:p.rankUntil,rankPreviousRole:p.rankPreviousRole,rankDurationDays:p.rankDurationDays};
    p.rank='none';delete p.rankUntil;delete p.rankPreviousRole;delete p.rankDurationDays;
    try{save();}catch(error){for(const key of ['rank','rankUntil','rankPreviousRole','rankDurationDays'])if(previous[key]!==undefined)p[key]=previous[key];else delete p[key];console.error('Expired rank cleanup save failed:',error.message);}
  }
  const visualRank=rankDefinition(p.rank);
  p.rankArt=visualRank?.artUrl||'';
  p.rankBanner=visualRank?.bannerUrl||'';
  p.rankBannerName=visualRank?.bannerName||'';
  p.customDecorationImage=String(p.customDecorationImage||'');
  // Never let the old automatic status survive as a default. Custom statuses remain untouched.
  if(!p.status || p.status==='متصل الآن' || p.status==='زائر جديد' || p.status==='غير مسجل' || p.status==='عضو جديد') p.status=defaultStatus(name);
  if(!p.fontColor) p.fontColor=p.nameColor||'#222222';
  return p;
}
// Migrate the old automatic status to the new type-specific default, while keeping custom statuses.
let statusMigrated=false;const migratedProfileStatuses=[];
for (const name of Object.keys(db.profiles||{})) {
  const p=db.profiles[name];
  if(p && (!p.status || p.status==='متصل الآن' || p.status==='زائر جديد' || p.status==='غير مسجل' || p.status==='عضو جديد')) { const next=defaultStatus(name); if(p.status!==next){migratedProfileStatuses.push([p,p.status]);p.status=next;statusMigrated=true;} }
}
if(statusMigrated){try{save();}catch(error){for(const [p,previous] of migratedProfileStatuses){if(previous===undefined)delete p.status;else p.status=previous;}console.error('Profile status migration save failed:',error.message);}}
function displayName(name){ return profile(name).displayName || cleanName(name); }
function sessionUser(sid){ const s=sessions.get(sid); if(!s)return null; const role=roleOf(s); return {...s, memberNumber:getMemberNumber(s.name,s.type), role, owner:isOwner(s), admin:isAdmin(s), fullAdmin:isFullPermissionAdmin(s), staff:isStaff(s), myPermissions:Object.keys(PERMISSION_CATALOG).filter(permission=>hasPermission(s,permission)), panelAccess:isOwner(s)||hasPermission(s,'panel_access')||hasPermission(s,'health_view'), vip:vipActive(s.name), likes:isOwner(s)?999999:userLikes(s)}; }
function makeSession(name,type,visibility={}){
  cancelPrivateConversationCleanup(name);
  const sid=crypto.randomBytes(24).toString('hex');
  const s={name,type,memberNumber:getMemberNumber(name,type),created:Date.now(),hidden:!!visibility.hidden,ghost:!!visibility.ghost};
  sessions.set(sid,s);db.sessions[sid]=s;
  try{save();}catch(error){sessions.delete(sid);delete db.sessions[sid];schedulePrivateConversationCleanup(name);console.error('Session creation save failed:',error.message);throw error;}
  return sid;
}
function requireAuth(req,res,next){
  const u=sessionUser(req.get('x-session')); if(!u)return res.status(401).json({error:'يجب تسجيل الدخول'}); req.user=u; next();
}
app.post('/api/private/media-ticket',requireAuth,(req,res)=>{
  if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});
  const mediaUrl=String(req.body?.url||'');
  const prefix='/api/private/media/';
  if(!mediaUrl.startsWith(prefix))return res.status(400).json({error:'رابط الوسائط غير صالح'});
  const filename=mediaUrl.slice(prefix.length);
  if(!/^[a-zA-Z0-9._-]{1,180}$/.test(filename)||path.basename(filename)!==filename)return res.status(404).json({error:'الوسائط غير موجودة'});
  const allowed=(db.privateMessages||[]).some(message=>message?.media?.url===mediaUrl&&(keyName(message.from)===keyName(req.user.name)||keyName(message.to)===keyName(req.user.name)));
  if(!allowed)return res.status(404).json({error:'الوسائط غير موجودة أو لا تملك صلاحية عرضها'});
  const file=path.resolve(PRIVATE_MEDIA_DIR,filename);
  if(!file.startsWith(path.resolve(PRIVATE_MEDIA_DIR)+path.sep)||!fs.existsSync(file))return res.status(404).json({error:'الوسائط غير موجودة'});
  const now=Date.now();
  const issued=createPrivateMediaPlaybackTicket(filename,keyName(req.user.name),now);
  if(issued.error==='account-limit')return res.status(429).json({error:'وصلت إلى الحد المؤقت لروابط تشغيل الوسائط؛ أغلق فيديو قديماً أو انتظر انتهاء صلاحيته'});
  if(issued.error==='global-limit')return res.status(503).json({error:'خدمة تشغيل الوسائط مشغولة حالياً؛ حاول بعد قليل'});
  res.set('Cache-Control','no-store');
  res.json({url:'/api/private/media-stream/'+encodeURIComponent(filename)+'?ticket='+issued.token});
});
app.get('/api/private/media-stream/:filename',(req,res)=>{
  if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});
  const filename=String(req.params.filename||''),token=String(req.query.ticket||'');
  const ticket=privateMediaPlaybackTickets.get(token);
  if(!ticket||ticket.expiresAt<=Date.now()||ticket.filename!==filename){if(ticket)privateMediaPlaybackTickets.delete(token);return res.status(401).json({error:'انتهت صلاحية رابط تشغيل الفيديو'});}
  if(!/^[a-zA-Z0-9._-]{1,180}$/.test(filename)||path.basename(filename)!==filename)return res.status(404).json({error:'الوسائط غير موجودة'});
  const mediaUrl='/api/private/media/'+filename;
  const allowed=(db.privateMessages||[]).some(message=>message?.media?.url===mediaUrl&&(keyName(message.from)===ticket.account||keyName(message.to)===ticket.account));
  if(!allowed)return res.status(404).json({error:'الوسائط غير موجودة أو لا تملك صلاحية عرضها'});
  const file=path.resolve(PRIVATE_MEDIA_DIR,filename);
  if(!file.startsWith(path.resolve(PRIVATE_MEDIA_DIR)+path.sep)||!fs.existsSync(file))return res.status(404).json({error:'الوسائط غير موجودة'});
  res.set({'Cache-Control':'private, no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'});
  res.sendFile(file,{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}},error=>{if(error&&!res.headersSent)res.status(error.statusCode||404).json({error:'تعذر فتح الوسائط'});});
});
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
  rank_assign:'منح الشارات ومدتها', personal_banner:'إدارة البنر الشخصي — رفع وحذف بنر الحساب نفسه', chat_banners_manage:'إدارة بنرات الدردشة للرتب السبع', rank_art_manage:'إدارة مكتبة أشكال الرتب وربطها بالرتب', member_decoration_manage:'تخصيص وإزالة زخرفة عضو محدد', permission_manage:'تعديل صلاحيات الرتب', member_ip:'عرض IP',
  reset_likes:'تصفير اللايكات', shortcuts_manage:'إدارة الاختصارات', smileys_manage:'إدارة السميلات', room_move:'نقل عضو بين الغرف', room_create:'إنشاء غرفة', room_edit:'تعديل بيانات الغرفة', room_delete:'حذف غرفة', room_lock:'تعيين أو إزالة كلمة مرور الغرفة', room_image_manage:'إدارة صور الغرف', gift_catalog_manage:'إضافة وحذف هدايا الكتالوج', wall_stop:'إيقاف الحائط', wall_restart:'تشغيل الحائط', wall_clear:'حذف جميع منشورات الحائط', wall_delete_user:'حذف منشورات عضو محدد من الحائط', welcome_manage:'إدارة رسائل الترحيب',
  audit_view:'عرض سجل العمليات وتصديره', stats_view:'عرض إحصائيات الموقع', chat_filter_manage:'إدارة فلتر الكلمات', member_status_manage:'إدارة حالات الأعضاء', private_chat_override:'تجاوز إغلاق المحادثات الخاصة', presence_hidden_view:'مشاهدة الأعضاء المخفيين', hidden_login:'الدخول المخفي', ghost_login:'دخول الشبح', bots_manage:'إدارة وتشغيل بوتات الدردشة', site_admin:'إدارة الموقع الكاملة (الإعدادات والسجلات والنسخ والاستعادة)', subscriptions_manage:'إدارة خطط واشتراكات الأعضاء وتجديدها وإلغاؤها', ads_manage:'إدارة الحملات الإعلانية والصور والروابط والمدد', control_center_manage:'التحكم بتشغيل وإيقاف وحدات الدردشة', audit_details_view:'عرض تفاصيل الأهداف والإجراءات في سجل العمليات', health_view:'مراقبة صحة الخادم واستهلاك الذاكرة'
};
// Every permission is an independent capability; no rank name grants implicit access.
const ALL_PERMISSION_KEYS=Object.keys(PERMISSION_CATALOG);
// Convert old bundled permissions into the granular capabilities used by the current UI.
function normalizePermissionList(list){
 const set=new Set(Array.isArray(list)?list:[]);
 if(set.has('banner_upload')){set.add('personal_banner');set.delete('banner_upload');}
 if(set.has('rooms_manage')){for(const key of ['room_create','room_edit','room_delete','room_lock','room_image_manage'])set.add(key);set.delete('rooms_manage');}
 if(set.has('chat_tools_manage')){set.add('shortcuts_manage');set.add('smileys_manage');set.delete('chat_tools_manage');}
 if(set.has('gifts'))set.add('gift_catalog_manage');
 return [...set].filter(key=>Object.hasOwn(PERMISSION_CATALOG,key));
}
const DEFAULT_RANK_PERMISSIONS = {
  'admin-full':ALL_PERMISSION_KEYS.filter(permission=>permission!=='health_view'),
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
function higherRankTargetError(actor,targetName){if(!actor||isOwner(actor)||!targetName||isOwnerName(targetName))return false;const actorLevel=coreRankLevelForName(actor.name),targetLevel=coreRankLevelForName(targetName);return actorLevel!==null&&targetLevel!==null&&targetLevel>actorLevel;}
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
function isFullPermissionAdmin(user){if(!user)return false;if(isOwner(user))return true;const permissions=effectivePermissionsForUser(user);return ALL_PERMISSION_KEYS.filter(permission=>permission!=='health_view').every(permission=>permissions.has(permission));}
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
for(const [name,permissions] of Object.entries(db.accountPermissions||{}))if(Array.isArray(permissions))db.accountPermissions[name]=normalizePermissionList(permissions);
// Split the former banner permission into personal banners and rank/chat banners.
// Legacy banner_upload maps only to personal_banner; full-access admins also receive chat_banners_manage.
if(Number(db.bannerPermissionsSplitMigrationVersion||0)<1){
 const introduced=['personal_banner','chat_banners_manage'];
 const previous=ALL_PERMISSION_KEYS.filter(key=>!introduced.includes(key));
 const adminFull=rankDefinition('admin-full');
 if(adminFull&&previous.every(key=>(adminFull.permissions||[]).includes(key)))adminFull.permissions=[...new Set([...(adminFull.permissions||[]),'personal_banner','chat_banners_manage'])];
 for(const permissions of Object.values(db.accountPermissions||{}))if(Array.isArray(permissions)&&previous.every(key=>permissions.includes(key)))for(const key of introduced)if(!permissions.includes(key))permissions.push(key);
 db.bannerPermissionsSplitMigrationVersion=1;
 try{save()}catch(error){console.error('Could not persist split banner permission migration:',error.message);}
}
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
// Health monitoring is an explicit opt-in capability, even for full-admin ranks.
// Remove the automatic grant made by the first health permission migration.
if(Number(db.healthViewPermissionMigrationVersion||0)<2){
 const previous=ALL_PERMISSION_KEYS.filter(key=>key!=='health_view');
 const adminFull=rankDefinition('admin-full');
 if(adminFull&&previous.every(key=>(adminFull.permissions||[]).includes(key)))adminFull.permissions=(adminFull.permissions||[]).filter(key=>key!=='health_view');
 for(const permissions of Object.values(db.accountPermissions||{}))if(Array.isArray(permissions)&&previous.every(key=>permissions.includes(key))){const index=permissions.indexOf('health_view');if(index!==-1)permissions.splice(index,1);}
 db.healthViewPermissionMigrationVersion=2;
 try{save();}catch(error){console.error('Could not persist explicit health-view permission migration:',error.message);}
}

function requirePermission(permission){return (req,res,next)=>requireAuth(req,res,()=>hasPermission(req.user,permission)?next():res.status(403).json({error:'ما عندك صلاحية لهذا الإجراء'}));}
function permissionForAdminPath(req){
 const p=req.path;
 if(p==='/api/admin/data')return ALL_PERMISSION_KEYS;
 if(p==='/api/admin/audit-logs')return 'audit_view';
 if(p.startsWith('/api/admin/subscriptions'))return 'subscriptions_manage';
 if(p.startsWith('/api/admin/ads'))return 'ads_manage';
 if(p.startsWith('/api/admin/control-center'))return 'control_center_manage';
 if(p==='/api/admin/chat-filter')return 'chat_filter_manage';
 if(p==='/api/admin/profile/status')return 'member_status_manage';
 if(p==='/api/admin/chat-tools/smiley-upload')return 'smileys_manage';
 if(p==='/api/admin/chat-tools')return req.method==='GET'?'shortcuts_manage':['shortcuts_manage','smileys_manage'];
 if(p==='/api/admin/data')return ALL_PERMISSION_KEYS;
 if(p==='/api/admin/rank')return 'rank_assign';
 if(p==='/api/admin/permissions')return 'permission_manage';
 if(p.startsWith('/api/admin/member-ip/'))return 'member_ip';
 if(p==='/api/admin/reset-likes')return 'reset_likes'; if(p==='/api/admin/unban')return 'ban_room'; if(p==='/api/admin/unmute')return 'mute_room';
 if(p==='/api/admin/kick')return 'kick_room'; if(p==='/api/admin/mute')return 'mute_room'; if(p==='/api/admin/ban')return 'ban_room';
 if(p==='/api/admin/member-action')return ({'global-kick':'global_kick','global-ban':'global_ban',kick:'kick_room',ban:'ban_room',mute:'mute_room','grant-like':'grant_likes','reset-likes':'reset_likes','grant-vip':'vip',gift:'gifts'})[String(req.body?.action||'')]||'panel_access';
 if(p.startsWith('/api/admin/member-stats/'))return req.body?.field==='likes'?'grant_likes':(req.body?.field==='points'?'panel_access':'panel_access');
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
 if(p==='/api/admin/gift/delete')return 'gifts';
 if(p.startsWith('/api/admin/gifts/catalog/'))return 'gift_catalog_manage';
 if(p==='/api/admin/rank-art')return ['rank_art_manage','member_decoration_manage'];
 if(p.startsWith('/api/admin/rank-art/'))return 'rank_art_manage';
 if(p==='/api/admin/ranks')return ['rank_assign','rank_art_manage','member_decoration_manage'];
 if(p.startsWith('/api/admin/chat-banners'))return 'chat_banners_manage';
 if(p==='/api/admin/member-decoration')return 'member_decoration_manage';
 if(p.startsWith('/api/admin/bots'))return 'bots_manage';
 if(p.startsWith('/api/admin/account-permissions/'))return 'permission_manage';
 if(p==='/api/admin/site-settings'||p==='/api/admin/login-history')return 'site_admin';
 if(p==='/api/admin/health')return ['health_view','site_admin'];
 if(p.startsWith('/api/admin/backup/'))return 'site_admin';
 if(p.startsWith('/api/admin/restore/database/'))return 'site_admin';
 if(p==='/api/admin/grant-like')return 'grant_likes';
 return 'panel_access';
}
function requireAdmin(req,res,next){
  requireAuth(req,res,()=>{
    const permission=permissionForAdminPath(req);
    const acceptedPermissions=Array.isArray(permission)?permission:[permission];
    if(!acceptedPermissions.some(key=>hasPermission(req.user,key)))return res.status(403).json({error:'ما عندك صلاحية لهذا القسم أو الإجراء'});
    const write=['POST','PUT','PATCH','DELETE'].includes(req.method);
    const auditBefore=db.adminAuditLogs;
    const auditBeforeLength=Array.isArray(auditBefore)?auditBefore.length:-1;
    const auditBeforeFirst=Array.isArray(auditBefore)?auditBefore[0]?.id:undefined;
    if(write)res.on('finish',()=>{
      if(res.statusCode<200||res.statusCode>=300)return;
      if(db.adminAuditLogs!==auditBefore||(Array.isArray(db.adminAuditLogs)&&(db.adminAuditLogs.length!==auditBeforeLength||db.adminAuditLogs[0]?.id!==auditBeforeFirst)))return;
      const previous=db.adminAuditLogs;
      const body=req.body&&typeof req.body==='object'?req.body:{};
      const target=String(body.name||body.target||body.member||'').slice(0,40);
      const action=String(body.action||body.operation||body.rank||body.planId||body.title||'').slice(0,80);
      db.adminAuditLogs=[{id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),at:Date.now(),actor:String(req.user?.name||'إدارة').slice(0,32),method:req.method,path:String(req.path||'').slice(0,120),status:res.statusCode,target,action,details:[target&&('العضو: '+target),action&&('التفصيل: '+action)].filter(Boolean).join(' · ')},...(Array.isArray(previous)?previous:[])].slice(0,500);
      try{save();}catch(error){if(previous===undefined)delete db.adminAuditLogs;else db.adminAuditLogs=previous;console.error('Admin audit log save failed:',error.message);}
    });
    return next();
  });
}
// Presence visibility is enforced per viewer on the server. A ghost is visible only
// to its own session; hidden accounts are visible to staff ranks and their own session.
// A short-lived context avoids repeatedly scanning all sessions and sockets while
// broadcasting one live-state update. It is rebuilt per broadcast so it cannot go stale.
function buildPresenceContext(){
  const socketsBySid = new Map();
  const activeEntries = [];
  const sessionsBySid = new Map();
  const sessionsByAccount = new Map();
  const activeByRoom = new Map();
  for (const [sid,active] of socketUsers) {
    const so = active?.socketId ? io.sockets.sockets.get(active.socketId) : null;
    const user = sessions.get(sid);
    if (!so?.connected || so.data?.sid !== sid || !user || so.id !== active.socketId) continue;
    socketsBySid.set(sid,so);
    activeEntries.push([sid,user]);
    sessionsBySid.set(sid,user);
    const roomKey=String(active.room||user.room||'');
    if(roomKey){let roomEntries=activeByRoom.get(roomKey);if(!roomEntries)activeByRoom.set(roomKey,roomEntries=[]);roomEntries.push([sid,user]);}
    const accountKey = keyName(user.name);
    let group = sessionsByAccount.get(accountKey);
    if (!group) sessionsByAccount.set(accountKey, group = []);
    group.push(user);
  }
  activeEntries.sort((a,b)=>Number(socketUsers.get(b[0])?.joinedAt||0)-Number(socketUsers.get(a[0])?.joinedAt||0));
  return { socketsBySid, activeEntries, sessionsBySid, sessionsByAccount, activeByRoom };
}
function canSeePresence(viewer,target,context=null){
  if(!target)return false;
  if(viewer&&keyName(viewer.name)===keyName(target.name))return true;
  const sameAccountSessions = context
    ? (context.sessionsByAccount.get(keyName(target.name)) || [])
    : [...buildPresenceContext().sessionsBySid.values()].filter(u=>keyName(u.name)===keyName(target.name));
  if(sameAccountSessions.some(u=>u.ghost))return false;
  if(target.ghost)return false;
  if(target.hidden)return !!viewer&&(isOwner(viewer)||hasPermission(viewer,'presence_hidden_view'));
  return true;
}
function canSeePresenceNotice(viewer,notice){
  if(!notice||notice.presenceVisibility!=='staff')return true;
  return !!viewer&&(keyName(viewer.name)===keyName(notice.from)||isOwner(viewer)||hasPermission(viewer,'presence_hidden_view'));
}
function visibleRooms(viewer,context=null){context=context||buildPresenceContext();return db.rooms.map(r=>{const {passwordHash,...safe}=r;return {...safe,locked:!!passwordHash,online:onlineInRoom(r.id,viewer,context)};});}
function hasInvisibleActiveSession(name,viewer,context=null){
  context=context||buildPresenceContext();
  const active=[...context.sessionsBySid.entries()].filter(([sid,u])=>keyName(u.name)===keyName(name));
  return active.length>0&&!active.some(([,u])=>canSeePresence(viewer,u,context));
}
function emitState(){
  const context=buildPresenceContext();
  for(const so of context.socketsBySid.values()){
    const viewer=sessionUser(so.data?.sid);
    if(!viewer)continue;
    so.emit('live-state',{online:getOnlineUsers(viewer,context),rooms:visibleRooms(viewer,context)});
  }
}
// Each authenticated tab/session owns exactly one live Socket.IO connection.
function socketBySession(sid){
  const active=socketUsers.get(sid);
  if(!active?.socketId)return null;
  const socket=io.sockets.sockets.get(active.socketId);
  return socket?.connected&&socket.data?.sid===sid?socket:null;
}
function isCurrentSessionSocket(socket){
  const sid=socket?.data?.sid,active=sid&&socketUsers.get(sid);
  return !!(sid&&socket?.connected&&active?.socketId===socket.id&&socket.data?.sid===sid);
}
function emitToUser(name,event,payload){
  const target=keyName(name);
  for(const [sid,u] of socketUsers){
    if(keyName(u.name)===target)socketBySession(sid)?.emit(event,payload);
  }
}
function countryCodeFromSocket(so){
  const headers=so?.handshake?.headers||{};
  const candidates=[headers['cf-ipcountry'],headers['x-country-code'],headers['x-vercel-ip-country'],headers['fly-client-country'],headers['cloudfront-viewer-country']];
  for(const candidate of candidates){const code=String(candidate||'').trim().toUpperCase();if(/^[A-Z]{2}$/.test(code)&&code!=='XX'&&code!=='T1')return code;}
  return '';
}
function getOnlineUsers(viewer=null,context=null){
  context=context||buildPresenceContext();
  const arr=[];
  for(const [sid,u] of context.activeEntries){
    if(!canSeePresence(viewer,u,context))continue;
    const role=roleOf(u),so=context.socketsBySid.get(sid),active=socketUsers.get(sid);
    arr.push({...u,memberNumber:Number(u.memberNumber||db.memberNumbers?.[memberNumberIdentity(u.name,u.type)]||0),role,owner:role==='owner',admin:['owner','admin'].includes(role),staff:['owner','admin','banner','super'].includes(role),panelAccess:role==='owner'||hasPermission(u,'panel_access'),room:active?.room||u.room||'',countryCode:countryCodeFromSocket(so),displayName:displayName(u.name),likes:userLikes(u),level:level(userLikes(u)),profile:profile(u.name)});
  }
  const seen=new Set();return arr.filter(x=>{const k=keyName(x.name);if(seen.has(k))return false;seen.add(k);return true;});
}
function onlineInRoom(room,viewer=null,context=null){
  context=context||buildPresenceContext();
  const seen=new Set();
  for(const [,user] of (context.activeByRoom?.get(String(room))||[])){
    if(!canSeePresence(viewer,user,context))continue;
    const account=keyName(user.name);if(account)seen.add(account);
  }
  return seen.size;
}
function emitPresenceToRoom(room,notice){
  for(const sid of (roomSockets.get(room)||[])){
    const viewer=sessionUser(sid);
    if(canSeePresenceNotice(viewer,notice))socketBySession(sid)?.emit('message',notice);
  }
}
function roomBanned(name,room){
  const list=Array.isArray(db.roomBans[room])?db.roomBans[room]:[];
  const n=keyName(name),now=Date.now();let changed=false;
  const active=list.filter(item=>{if(typeof item==='string')return keyName(item)===n;if(item&&item.name){if(item.until&&Number(item.until)<=now){changed=true;return false;}return keyName(item.name)===n;}return false;});
  if(changed){const previous=db.roomBans[room];db.roomBans[room]=list.filter(item=>!(item&&item.until&&Number(item.until)<=now));try{save();}catch(error){db.roomBans[room]=previous;console.error('Expired room-ban cleanup save failed:',error.message);}}
  return active.some(item=>typeof item==='string'?keyName(item)===n:(item&&keyName(item.name)===n));
}
function roomMuted(name,room){ return Array.isArray(db.roomMutes[room]) && db.roomMutes[room].includes(keyName(name)); }
function normalizeIp(value){ let ip=String(value||'').trim(); if(ip.includes(','))ip=ip.split(',')[0].trim(); if(ip.startsWith('::ffff:'))ip=ip.slice(7); if(ip.startsWith('[')&&ip.includes(']'))ip=ip.slice(1,ip.indexOf(']')); if(/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip))ip=ip.replace(/:\d+$/,''); return ip.toLowerCase(); }
function requestClientIp(req){ return normalizeIp(req.get('cf-connecting-ip')||req.get('x-real-ip')||req.ip||req.socket?.remoteAddress||''); }
function recordLoginEvent(req,name,type,mode='normal'){
  const previous=db.loginHistory;
  try{const rawIp=requestClientIp(req);let ip=rawIp;if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(rawIp))ip=rawIp.split('.').slice(0,3).join('.')+'.0';else if(rawIp.includes(':'))ip=rawIp.split(':').slice(0,4).join(':')+'::';
    db.loginHistory=[{id:crypto.randomUUID(),at:Date.now(),name:String(name||'').slice(0,32),type:String(type||'member'),mode:String(mode||'normal'),ip,agent:String(req.get('user-agent')||'').slice(0,180)},...(Array.isArray(previous)?previous:[])].slice(0,1000);save();
  }catch(error){if(previous===undefined)delete db.loginHistory;else db.loginHistory=previous;console.error('Login history save failed:',error.message);}
}
function socketClientIp(socket){ const h=socket.handshake?.headers||{}; return normalizeIp(h['cf-connecting-ip']||h['x-real-ip']||socket.handshake?.address||''); }
function globalBanStatus(name,ip,now=Date.now()){
  const n=keyName(name);let until=0,changed=false;
  const expiredNames=[],expiredIps=[];
  const nameBan=(db.globalBans||{})[n];
  if(nameBan){const expiry=Number(nameBan.until)||0;if(expiry>now)until=Math.max(until,expiry);else{expiredNames.push([n,nameBan]);delete db.globalBans[n];changed=true;}}
  const ipKey=normalizeIp(ip),ipBan=ipKey?(db.globalIpBans||{})[ipKey]:null;
  if(ipBan){const expiry=Number(ipBan.until)||0;if(expiry>now)until=Math.max(until,expiry);else{expiredIps.push([ipKey,ipBan]);delete db.globalIpBans[ipKey];changed=true;}}
  if(changed){try{save();}catch(error){for(const [key,value] of expiredNames)db.globalBans[key]=value;for(const [key,value] of expiredIps)db.globalIpBans[key]=value;console.error('Expired global-ban cleanup save failed:',error.message);}}
  if(!until)return null;
  const remainingMs=Math.max(0,until-now),totalSeconds=Math.ceil(remainingMs/1000),minutes=Math.floor(totalSeconds/60),seconds=totalSeconds%60;
  const remainingText=minutes?`${minutes} دقيقة و${seconds} ثانية`:`${seconds} ثانية`;
  return {until,remainingMs,remainingSeconds:totalSeconds,remainingText};
}
function globalBanResponse(res,name,ip){const ban=globalBanStatus(name,ip);if(!ban)return false;return res.status(403).json({error:`أنت محظور من الدردشة. الوقت المتبقي: ${ban.remainingText}. حاول الدخول بعد انتهاء الحظر.`,code:'GLOBAL_BAN_ACTIVE',...ban});}
function globalBanned(name,ip){return !!globalBanStatus(name,ip);}
function nameTaken(name){const n=keyName(name);if(!n)return false;return n==='owner'||(!!process.env.OWNER_NAME&&n===keyName(process.env.OWNER_NAME))||Object.keys(db.users||{}).some(x=>keyName(x)===n)||Object.keys(db.guests||{}).some(x=>keyName(x)===n);} 
function removeFromChat(name, banned){ const n=keyName(name); for(const so of io.sockets.sockets.values()){ const sid2=so.data?.sid, u2=so.data?.user||socketUsers.get(sid2); if(!u2||keyName(u2.name)!==n)continue; const oldRoom=u2.room||''; if(oldRoom){so.leave(oldRoom);removeSessionFromRoomRuntime(sid2,oldRoom);} if(so.data?.user)so.data.user.room=''; if(socketUsers.get(sid2))socketUsers.get(sid2).room=''; so.emit('kicked',{global:true,banned:!!banned,room:oldRoom,...(banned?(globalBanStatus(n,'')||{}):{})}); if(banned)so.disconnect(true); } emitState(); }
let messageSaveTimer=null;
let pendingMessageWrites=[];
let messageSaveAttempts=0;
function scheduleMessageSave(delay=100){
  if(messageSaveTimer)return;
  messageSaveTimer=setTimeout(()=>{messageSaveTimer=null;flushMessageWrites();},delay);
  messageSaveTimer.unref?.();
}
function flushMessageWrites(){
  if(messageSaveTimer){clearTimeout(messageSaveTimer);messageSaveTimer=null;}
  if(!pendingMessageWrites.length)return true;
  const batch=pendingMessageWrites.slice();
  const previousMessages=db.messages;
  db.messages=[...previousMessages,...batch.map(entry=>entry.message)].slice(-1000);
  try{
    save();
    pendingMessageWrites.splice(0,batch.length);
    messageSaveAttempts=0;
    for(const entry of batch)entry.resolve();
    if(pendingMessageWrites.length)scheduleMessageSave();
    return true;
  }catch(error){
    db.messages=previousMessages;
    messageSaveAttempts++;
    console.error(`Batched chat-message save failed (attempt ${messageSaveAttempts}/3):`,error.message);
    if(messageSaveAttempts<3){scheduleMessageSave(1000*messageSaveAttempts);return false;}
    const failed=pendingMessageWrites.splice(0);
    messageSaveAttempts=0;
    for(const entry of failed)entry.reject(error);
    return false;
  }
}
function addMessage(m){
  return new Promise((resolve,reject)=>{
    pendingMessageWrites.push({message:m,resolve,reject});
    scheduleMessageSave();
  });
}
function notify(name,item){
  name=accountKey(name);
  const previous=db.notifications[name],had=Object.prototype.hasOwnProperty.call(db.notifications,name);
  db.notifications[name]=[{...item,id:crypto.randomUUID(),at:Date.now()},...(Array.isArray(previous)?previous:[])].slice(0,100);
  try{save();return true;}catch(error){if(had)db.notifications[name]=previous;else delete db.notifications[name];console.error('Notification save failed:',error.message);return false;}
}
function protectedOwnerAccountName(){
  const member=Object.entries(db.users||{}).find(([,u])=>String(u?.role||'')==='owner');
  if(member)return member[0];
  const guest=Object.entries(db.guests||{}).find(([,u])=>String(u?.role||'')==='owner');
  if(guest)return guest[0];
  return String(process.env.OWNER_NAME||'owner');
}
function notifyOwnerProtectedAttempt(actor,action){
  const ownerName=protectedOwnerAccountName(),actorName=String(actor?.name||'إداري').slice(0,32);
  const title='🛡️ محاولة إجراء على حساب صاحب الموقع';
  const text=`حاول ${actorName} تنفيذ إجراء «${String(action||'إداري').slice(0,100)}» على حسابك، لكن تم منع الإجراء بواسطة حماية صاحب الموقع.`;
  try{notify(ownerName,{type:'admin-protected-attempt',title,from:actorName,text});}catch(error){console.error('Owner protection notification save failed:',error.message);}
  emitToUser(ownerName,'admin-action-notice',{title,text});
}

// Never trust the client-supplied filename/extension: files are served from /uploads.
// Derive the stored extension from a strict MIME allow-list so an uploaded file
// cannot be saved as .html/.svg merely by choosing a dangerous original name.
const SAFE_UPLOAD_TYPES = Object.freeze({
  'image/jpeg':'.jpg', 'image/png':'.png', 'image/gif':'.gif', 'image/webp':'.webp',
  'image/avif':'.avif', 'image/bmp':'.bmp',
  'video/mp4':'.mp4', 'video/webm':'.webm', 'video/ogg':'.ogv', 'video/quicktime':'.mov',
  'audio/mpeg':'.mp3', 'audio/mp3':'.mp3', 'audio/ogg':'.ogg',
  'audio/wav':'.wav', 'audio/x-wav':'.wav', 'audio/mp4':'.m4a',
  'audio/aac':'.aac', 'audio/webm':'.weba'
});
const uploadStorage = multer.diskStorage({
  destination:UP_DIR,
  filename:(req,file,cb)=>cb(null,Date.now()+'-'+crypto.randomBytes(8).toString('hex')+(SAFE_UPLOAD_TYPES[String(file.mimetype||'').toLowerCase()]||'.bin'))
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
// Restore files are staged on the private persistent volume, never in public uploads
// and never in Multer memory storage. Pending previews retain only a path and metadata.
const RESTORE_TMP_DIR=path.join(DATA_DIR,'.restore-tmp');
try{
  fs.mkdirSync(RESTORE_TMP_DIR,{recursive:true,mode:0o700});
  try{fs.chmodSync(RESTORE_TMP_DIR,0o700);}catch(_){}
  // Preview tokens are process-local. Any staged file left by a prior crashed process
  // is therefore orphaned and safe to remove at startup.
  for(const name of fs.readdirSync(RESTORE_TMP_DIR)){
    const orphan=path.join(RESTORE_TMP_DIR,name);
    try{if(fs.statSync(orphan).isFile())fs.unlinkSync(orphan);}catch(_){}
  }
}catch(error){console.error('Could not initialize private restore staging directory:',error.message);throw error;}
const restoreUpload=multer({storage:multer.diskStorage({destination:RESTORE_TMP_DIR,filename:(req,file,cb)=>cb(null,`restore-${process.pid}-${crypto.randomBytes(16).toString('hex')}.json`)}),limits:{fileSize:20*1024*1024,files:1,fields:0}});
const pendingDatabaseRestores=new Map();
const MAX_PENDING_DATABASE_RESTORES=2;
function validateDatabaseRestoreFile(source){
  const raw=Buffer.isBuffer(source)?source.toString('utf8'):typeof source==='string'?source:'';
  if(!raw||Buffer.byteLength(raw,'utf8')>20*1024*1024)throw new Error('حجم ملف النسخة غير صالح');
  let parsed;try{parsed=JSON.parse(raw);}catch(_){throw new Error('ملف النسخة ليس JSON صالحاً');}
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
  return {clean,summary:{members:Object.keys(clean.users).length,guests:Object.keys(clean.guests).length,rooms:clean.rooms.length,messages:clean.messages.length,wall:Array.isArray(clean.wall)?clean.wall.length:0,createdAt:parsed.createdAt||null,appVersion:parsed.appVersion||'غير معروف'}};
}
function restoreContainsOwner(candidate,ownerName){
 const users=candidate.users||{},guests=candidate.guests||{};
 const configured=String(process.env.OWNER_NAME||'').trim();
 if(configured){const wanted=keyName(configured);return Object.keys(users).some(name=>keyName(name)===wanted)||Object.keys(guests).some(name=>keyName(name)===wanted);}
 const wanted=keyName(ownerName);
 if(wanted&&wanted!=='owner'){
  for(const [name,account] of Object.entries(users))if(keyName(name)===wanted&&String(account?.role||'')==='owner')return true;
  for(const [name,account] of Object.entries(guests))if(keyName(name)===wanted&&String(account?.role||'')==='owner')return true;
 }
 for(const [name,account] of Object.entries(users))if(keyName(name)==='owner'||String(account?.role||'')==='owner')return true;
 for(const [name,account] of Object.entries(guests))if(keyName(name)==='owner'||String(account?.role||'')==='owner')return true;
 return false;
}
function discardDatabaseRestorePreview(token,item=pendingDatabaseRestores.get(token)){
 pendingDatabaseRestores.delete(token);
 if(item?.filePath){try{fs.unlinkSync(item.filePath);}catch(error){if(error.code!=='ENOENT')console.warn('Restore preview file cleanup failed:',error.message);}}
}
function purgeExpiredDatabaseRestores(){const now=Date.now();for(const [token,item] of pendingDatabaseRestores)if(item.expiresAt<=now)discardDatabaseRestorePreview(token,item);}
const databaseRestoreCleanupTimer=setInterval(purgeExpiredDatabaseRestores,30*1000);
databaseRestoreCleanupTimer.unref?.();

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
      if (mime.startsWith('video/')) return (['video/mp4','video/quicktime'].includes(mime) && actual==='mp4') || (mime==='video/webm' && actual==='webm') || (mime==='video/ogg' && actual==='ogg');
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
  const hadUser=Object.prototype.hasOwnProperty.call(db.users,n),previousUser=db.users[n],hadProfile=Object.prototype.hasOwnProperty.call(db.profiles||{},n),previousProfile=db.profiles?.[n],previousMemberNumbers=db.memberNumbers?{...db.memberNumbers}:undefined,previousNextMemberNumber=db.nextMemberNumber,hadOwnerSetup=Object.prototype.hasOwnProperty.call(db,'ownerSetupCompleted'),previousOwnerSetup=db.ownerSetupCompleted;
  db.users[n]={hash:bcrypt.hashSync(p,12),likes:keyName(n)==='admin'?999999:0,created:Date.now()};allocateMemberNumber(n,'member',db.users[n]);
  if(ownerRequested)db.ownerSetupCompleted=true;
  try{profile(n);const sid=makeSession(n,'member');recordLoginEvent(req,n,'member','register');return res.json({sid,user:sessionUser(sid)});}
  catch(error){
    if(hadUser)db.users[n]=previousUser;else delete db.users[n];
    if(hadProfile)db.profiles[n]=previousProfile;else if(db.profiles)delete db.profiles[n];
    if(previousMemberNumbers===undefined)delete db.memberNumbers;else db.memberNumbers=previousMemberNumbers;
    if(previousNextMemberNumber===undefined)delete db.nextMemberNumber;else db.nextMemberNumber=previousNextMemberNumber;
    if(hadOwnerSetup)db.ownerSetupCompleted=previousOwnerSetup;else delete db.ownerSetupCompleted;
    console.error('Registration transaction failed:',error.message);
    return res.status(500).json({error:'تعذر إنشاء الحساب وحفظه'});
  }
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
  const hadGuest=Object.prototype.hasOwnProperty.call(db.guests,n),previousGuest=db.guests[n],hadProfile=Object.prototype.hasOwnProperty.call(db.profiles||{},n),previousProfile=db.profiles?.[n],previousMemberNumbers=db.memberNumbers?{...db.memberNumbers}:undefined,previousNextMemberNumber=db.nextMemberNumber;
  db.guests[n]={likes:0,created:Date.now()};allocateMemberNumber(n,'guest',db.guests[n]);
  try{const gp=profile(n);gp.status='(غير مسجل)';const sid=makeSession(n,'guest');recordLoginEvent(req,n,'guest','guest');return res.json({sid,user:sessionUser(sid)});}
  catch(error){
    if(hadGuest)db.guests[n]=previousGuest;else delete db.guests[n];
    if(hadProfile)db.profiles[n]=previousProfile;else if(db.profiles)delete db.profiles[n];
    if(previousMemberNumbers===undefined)delete db.memberNumbers;else db.memberNumbers=previousMemberNumbers;
    if(previousNextMemberNumber===undefined)delete db.nextMemberNumber;else db.nextMemberNumber=previousNextMemberNumber;
    console.error('Guest creation transaction failed:',error.message);
    return res.status(500).json({error:'تعذر إنشاء دخول الزائر وحفظه'});
  }
});
app.post('/api/logout',requireAuth,(req,res)=>{
  const sid=req.get('x-session'),u=sessions.get(sid),name=u?.name||req.user?.name;
  const previousMessages=db.messages;
  const previousGuest=u?.type==='guest'?db.guests[u.name]:undefined;
  const previousProfile=u?.type==='guest'?db.profiles[u.name]:undefined;
  const guestWallReadKey=u?.type==='guest'?keyName(u.name):'';
  const previousGuestWallReadAt=guestWallReadKey?db.wallReadAt?.[guestWallReadKey]:undefined;
  const hadWelcome=welcomeSentSessions.has(sid);
  if(name)db.messages=(db.messages||[]).filter(m=>!(m?.type==='presence'&&keyName(m.from)===keyName(name)));
  if(u?.type==='guest'){delete db.guests[u.name];delete db.profiles[u.name];delete db.wallReadAt[guestWallReadKey];}
  sessions.delete(sid);welcomeSentSessions.delete(sid);delete db.sessions[sid];
  try{save()}catch(e){if(previousMessages!==undefined)db.messages=previousMessages;if(u){sessions.set(sid,u);db.sessions[sid]=u;if(u.type==='guest'){if(previousGuest!==undefined)db.guests[u.name]=previousGuest;if(previousProfile!==undefined)db.profiles[u.name]=previousProfile;if(previousGuestWallReadAt!==undefined)db.wallReadAt[guestWallReadKey]=previousGuestWallReadAt;}if(hadWelcome)welcomeSentSessions.add(sid);}console.error('Logout persistence failed:',e.message);return res.status(500).json({error:'تعذر حفظ تسجيل الخروج، حاول مرة أخرى'});}
  cancelSessionDisconnectCleanup(sid);
  clearSessionTransientState(sid);
  for(const so of [...io.sockets.sockets.values()])if(so.data?.sid===sid)so.disconnect(true);
  if(name)schedulePrivateConversationCleanup(name);
  res.json({ok:true});
});

app.get('/api/rtc-config',requireAuth,(req,res)=>{const iceServers=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}];const turnUrls=String(process.env.TURN_URLS||process.env.TURN_URL||'').split(',').map(x=>x.trim()).filter(Boolean);const turnUsername=String(process.env.TURN_USERNAME||'').trim(),turnCredential=String(process.env.TURN_CREDENTIAL||'');if(turnUrls.length&&turnUsername&&turnCredential)iceServers.push({urls:turnUrls,username:turnUsername,credential:turnCredential});res.set('Cache-Control','no-store');res.json({iceServers,turnConfigured:turnUrls.length>0&&!!turnUsername&&!!turnCredential});});
app.get('/api/public-online',(req,res)=>{ const users=getOnlineUsers().map(u=>({name:u.name,type:u.type,memberNumber:u.memberNumber,displayName:u.displayName,avatar:u.profile?.avatar||'',status:u.profile?.status||defaultStatus(u.name),rank:u.profile?.rank||'',role:u.role||'',vip:!!u.vip})); res.set('Cache-Control','no-store'); res.json({users}); });
app.get('/api/state',requireAuth,(req,res)=>{
  const u=req.user;
  // A guest starts each fresh app entry with the default status; registered members keep their saved status.
  if(u.type==='guest' && req.query.entry==='1'){const p=profile(u.name),previous=p.status;p.status='(غير مسجل)';try{save();}catch(error){p.status=previous;console.error('Guest entry status save failed:',error.message);}}
  const likes=userLikes(u); const rooms=visibleRooms(u);
  res.json({user:{...u,likes,level:level(likes),admin:isAdmin(u),owner:isOwner(u),staff:isStaff(u),role:roleOf(u),vip:vipActive(u.name),profile:profile(u.name),notice:canNotice(u),media:canMedia(u)}, rooms, online:getOnlineUsers(u).map(x=>({name:x.name,type:x.type,likes:x.likes,level:x.level,profile:x.profile,online:true,role:x.role||roleOf(x),admin:isAdmin(x),vip:vipActive(x.name)}))});
});
app.get('/api/history',requireAuth,(req,res)=>{ const room=String(req.query.room||'public'),started=Number(req.user.created)||0;res.set('Cache-Control','no-store');res.json(roomHistoryWithAnnouncements(room,req.user,started)); });
app.get('/api/rooms',requireAuth,(req,res)=>{res.set('Cache-Control','no-store');res.json(visibleRooms(req.user));});
app.get('/api/members',requireAuth,(req,res)=>{const presence=buildPresenceContext();const online=new Map(getOnlineUsers(req.user,presence).map(x=>[keyName(x.name),x]));const rows=[];const registeredKeys=new Set(Object.keys(db.users).map(keyName));const seenMemberKeys=new Set();for(const [name,u] of Object.entries(db.users)){const normalized=keyName(name);if(hasInvisibleActiveSession(name,req.user,presence))continue;if(seenMemberKeys.has(normalized))continue;seenMemberKeys.add(normalized);const x=online.get(keyName(name));rows.push({name,type:'member',memberNumber:getMemberNumber(name,'member'),likes:Number(u.likes)||0,points:Number(u.points)||0,level:level(Number(u.likes)||0),profile:profile(name),online:!!x,room:x?.room||'',countryCode:x?.countryCode||'',role:isOwnerName(name)?'owner':'member',vip:vipActive(name)});}for(const [name,g] of Object.entries(db.guests)){const normalized=keyName(name);if(registeredKeys.has(normalized)||seenMemberKeys.has(normalized)||hasInvisibleActiveSession(name,req.user,presence))continue;const x=online.get(normalized);if(x){seenMemberKeys.add(normalized);rows.push({name,type:'guest',memberNumber:getMemberNumber(name,'guest'),likes:Number(g.likes)||0,points:Number(g.points)||0,level:level(Number(g.likes)||0),profile:profile(name),online:true,room:x?.room||'',countryCode:x?.countryCode||'',ignoredByMe:(db.ignored?.[keyName(req.user.name)]||[]).some(x=>keyName(x)===normalized),role:isOwnerName(name)?'owner':'member',vip:false});}}const rank=x=>{if(x.role==='owner')return 0;const r=x.profile?.rank||'';const rankOrder={'admin-full':1,'admin-shield':2,'crown-gold':3,'crown-silver':4,'super-black':5,'super-white':6,'super-red':7};if(rankOrder[r]!==undefined)return rankOrder[r];if(x.vip)return 8;if((x.profile?.gifts||[]).length)return 9;if(x.type==='guest')return 11;return 10;};rows.sort((a,b)=>rank(a)-rank(b)||b.likes-a.likes||a.name.localeCompare(b.name,'ar'));res.json(rows);});
app.get('/api/wall/status',requireAuth,(req,res)=>{res.set('Cache-Control','no-store');res.json({enabled:db.wallEnabled!==false&&siteModuleEnabled('wall')});});
app.get('/api/wall/unread',requireAuth,(req,res)=>{const me=keyName(req.user.name),started=Number(req.user.created)||0,readAt=Number(db.wallReadAt?.[me]||0);const count=siteModuleEnabled('wall')?db.wall.filter(p=>Number(p.at||0)>=started&&Number(p.at||0)>readAt&&keyName(p.from)!==me).length:0;res.set('Cache-Control','no-store');res.json({count});});
app.post('/api/wall/read',requireAuth,(req,res)=>{const me=keyName(req.user.name),requested=Number(req.body?.throughAt),throughAt=Number.isFinite(requested)?Math.min(Date.now(),Math.max(0,requested)):0;db.wallReadAt=db.wallReadAt||{};const previous=Number(db.wallReadAt[me]||0);if(throughAt>previous){db.wallReadAt[me]=throughAt;try{save();}catch(error){db.wallReadAt[me]=previous;return res.status(500).json({error:'تعذر تحديث قراءة الحائط'});}}const started=Number(req.user.created)||0,readAt=Number(db.wallReadAt[me]||0),count=siteModuleEnabled('wall')?db.wall.filter(p=>Number(p.at||0)>=started&&Number(p.at||0)>readAt&&keyName(p.from)!==me).length:0;res.json({ok:true,count,readAt});});
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
app.post('/api/admin/wall/control',requireAdmin,(req,res)=>{const action=String(req.body.action||'');if(action==='stop'||action==='restart'){const previous=db.wallEnabled;db.wallEnabled=action==='restart';try{save();}catch(error){db.wallEnabled=previous;return res.status(500).json({error:'تعذر حفظ حالة الحائط'});}io.emit('wall-state',{enabled:db.wallEnabled});return res.json({ok:true,enabled:db.wallEnabled});}if(action==='clear'){const previous=db.wall;const before=previous.length;if(!isOwner(req.user)){db.wall=previous.filter(p=>isOwnerName(p.from)||(isOwner({name:p.from,role:(getUser(p.from)||getGuest(p.from)||{}).role})));}else db.wall=[];const removed=before-db.wall.length;try{save();}catch(error){db.wall=previous;return res.status(500).json({error:'تعذر حفظ تنظيف الحائط'});}io.emit('wall-cleared',{removed});return res.json({ok:true,removed});}if(action==='delete-user'){const name=cleanName(req.body.name||'');if(!name)return res.status(400).json({error:'حدد اسم العضو'});if(denyHigherRankTarget(req.user,name,res))return;if((isOwnerName(name)||isOwner({name,role:(getUser(name)||getGuest(name)||{}).role}))&&!isOwner(req.user))return res.status(403).json({error:'منشورات صاحب الموقع محمية'});const previous=db.wall,before=previous.length;db.wall=previous.filter(p=>keyName(p.from)!==keyName(name));const removed=before-db.wall.length;try{save();}catch(error){db.wall=previous;return res.status(500).json({error:'تعذر حفظ حذف منشورات العضو'});}io.emit('wall-user-deleted',{name,removed});return res.json({ok:true,removed,name});}return res.status(400).json({error:'إجراء الجدار غير معروف'});});
app.post('/api/notify',requireAuth,(req,res)=>{if(!canNotice(req.user))return res.status(403).json({error:`التنبيهات تفتح عند ${NOTICE_LIKES_REQUIRED} إعجاب`});const requested=cleanName(req.body.to),to=accountKey(requested);if(!getUser(to)&&!getGuest(to))return res.status(404).json({error:'العضو غير موجود'});const p=profile(to);if(p.notificationsOpen===false&&!isOwner(req.user))return res.status(403).json({error:'هذا الشخص أغلق التنبيه'});const text=String(req.body.text||'').trim().slice(0,500);if(!text)return res.status(400).json({error:'اكتب التنبيه'});notify(to,{type:'notice',from:req.user.name,text});emitToUser(to,'notification',{from:req.user.name,text});res.json({ok:true});});
app.get('/api/private/history',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});const to=cleanName(req.query.to||'');if(!to)return res.status(400).json({error:'اختر عضوًا'});const meKey=keyName(req.user.name),toKey=keyName(to);const items=(db.privateMessages||[]).filter(m=>((keyName(m.from)===meKey&&keyName(m.to)===toKey)||(keyName(m.from)===toKey&&keyName(m.to)===meKey))).slice(-200).map(m=>{const acct=getUser(m.from)||getGuest(m.from);const sender={name:m.from,type:getUser(m.from)?'member':'guest'};return {...m,fromDisplayName:m.fromDisplayName||displayName(m.from),profile:profile(m.from),role:acct?roleOf(sender):'member',vip:vipActive(m.from),likes:userLikes(sender)};});res.set('Cache-Control','no-store');res.json(items);});
app.post('/api/private/read',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});const from=keyName(req.body.from||''),me=keyName(req.user.name);if(!from)return res.status(400).json({error:'المحادثة غير محددة'});if(!getUser(from)&&!getGuest(from))return res.status(404).json({error:'العضو غير موجود'});const previous=db.privateRead,next={...(db.privateRead||{})},mine={...(next[me]||{})};mine[from]=Date.now();next[me]=Object.fromEntries(Object.entries(mine).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,500));db.privateRead=next;try{save();}catch(error){if(previous===undefined)delete db.privateRead;else db.privateRead=previous;return res.status(500).json({error:'تعذر حفظ حالة قراءة المحادثة'});}res.json({ok:true});});
app.post('/api/private/read-all',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});const me=keyName(req.user.name),previous=db.privateRead,next={...(db.privateRead||{})},mine={...(next[me]||{})};for(const m of (db.privateMessages||[])){if(keyName(m.to)!==me)continue;const from=keyName(m.from),at=Number(m.at)||0;if(at>Number(mine[from]||0))mine[from]=at;}next[me]=Object.fromEntries(Object.entries(mine).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,500));db.privateRead=next;try{save();}catch(error){if(previous===undefined)delete db.privateRead;else db.privateRead=previous;return res.status(500).json({error:'تعذر حفظ قراءة جميع المحادثات'});}res.json({ok:true});});
app.post('/api/private/hide',requireAuth,(req,res)=>{if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});
  const other=keyName(req.body.name||''),me=keyName(req.user.name);
  if(!other||other===me)return res.status(400).json({error:'اسم غير صحيح'});
  if(!getUser(other)&&!getGuest(other))return res.status(404).json({error:'العضو غير موجود'});
  const previousMessages=db.privateMessages,previousHidden=db.privateHidden,previousRead=db.privateRead;
  const hiddenRoot={...(db.privateHidden||{})},hiddenList=Array.isArray(hiddenRoot[me])?hiddenRoot[me].slice():[];
  if(!hiddenList.includes(other)&&hiddenList.length>=500)return res.status(400).json({error:'وصلت إلى الحد الأعلى للمحادثات المخفية'});
  if(!hiddenList.includes(other))hiddenList.push(other);
  hiddenRoot[me]=hiddenList;
  const readRoot={...(db.privateRead||{})};
  if(readRoot[me]){readRoot[me]={...readRoot[me]};delete readRoot[me][other];}
  if(readRoot[other]){readRoot[other]={...readRoot[other]};delete readRoot[other][me];}
  const removed=(db.privateMessages||[]).filter(m=>(keyName(m.from)===me&&keyName(m.to)===other)||(keyName(m.from)===other&&keyName(m.to)===me));
  db.privateHidden=hiddenRoot;db.privateRead=readRoot;
  db.privateMessages=(db.privateMessages||[]).filter(m=>!((keyName(m.from)===me&&keyName(m.to)===other)||(keyName(m.from)===other&&keyName(m.to)===me)));
  try{save();}catch(error){
    if(previousMessages===undefined)delete db.privateMessages;else db.privateMessages=previousMessages;
    if(previousHidden===undefined)delete db.privateHidden;else db.privateHidden=previousHidden;
    if(previousRead===undefined)delete db.privateRead;else db.privateRead=previousRead;
    console.error('Private conversation hide failed:',error.message);
    return res.status(500).json({error:'تعذر حفظ إنهاء المحادثة'});
  }
  for(const message of removed){const url=String(message?.media?.url||''),prefix='/api/private/media/';if(!url.startsWith(prefix))continue;const filename=url.slice(prefix.length);if(!/^[a-zA-Z0-9._-]{1,180}$/.test(filename))continue;const stillUsed=(db.privateMessages||[]).some(m=>m?.media?.url===url);if(!stillUsed){try{fs.unlinkSync(path.join(PRIVATE_MEDIA_DIR,filename))}catch(error){if(error.code!=='ENOENT')console.warn('Private media cleanup failed:',error.message);}}}
  res.json({ok:true});
});
app.get('/api/private/contacts',requireAuth,(req,res)=>{
  if(!siteModuleEnabled('privateChat'))return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});
  const meKey=keyName(req.user.name),hidden=new Set((db.privateHidden?.[meKey]||[]).map(keyName)),read=db.privateRead?.[meKey]||{},map=new Map();
  for(const message of (db.privateMessages||[])){
    const from=keyName(message.from),to=keyName(message.to),other=from===meKey?message.to:to===meKey?message.from:null;
    if(!other||hidden.has(keyName(other)))continue;
    const key=keyName(other),row=map.get(key)||{name:other,last:'',at:0,unread:0};
    if(Number(message.at)>=row.at){row.name=other;row.last=message.text||'';row.at=Number(message.at)||0;}
    if(to===meKey&&Number(message.at)>Number(read[key]||0))row.unread++;
    map.set(key,row);
  }
  const online=new Map(getOnlineUsers(req.user).map(user=>[keyName(user.name),user]));
  const rows=[...map.values()].sort((a,b)=>b.at-a.at).map(row=>({name:row.name,profile:profile(row.name),online:online.has(keyName(row.name)),last:row.last,at:row.at,unread:row.unread}));
  res.set('Cache-Control','no-store');res.json(rows);
});
app.get('/api/notifications',requireAuth,(req,res)=>{const started=Number(req.user.created)||0;res.set('Cache-Control','no-store');res.json((db.notifications[accountKey(req.user.name)]||db.notifications[req.user.name]||[]).filter(x=>Number(x.at||0)>=started).slice(0,50));});
app.post('/api/notifications/read',requireAuth,(req,res)=>{const key=accountKey(req.user.name),had=Object.prototype.hasOwnProperty.call(db.notifications,key),previous=db.notifications[key];db.notifications[key]=[];try{save();}catch(error){if(had)db.notifications[key]=previous;else delete db.notifications[key];return res.status(500).json({error:'تعذر حفظ حالة الإشعارات'});}res.json({ok:true});});

app.post('/api/message',requireAuth,async(req,res)=>{
  const u=req.user;
  if(globalBanResponse(res,u.name,requestClientIp(req)))return;
  const room=String(req.body.room||'public'), text=String(req.body.text||'').trim().slice(0,2000);
  if(!text)return res.status(400).json({error:'الرسالة فارغة'});
  const sessionId=String(req.get('x-session')||'');
  const joinedSocket=[...io.sockets.sockets.values()].find(so=>so.data?.sid===sessionId&&isCurrentSessionSocket(so)&&keyName(so.data?.user?.name||'')===keyName(u.name)&&so.data?.user?.room===room&&so.rooms.has(room));
  if(!joinedSocket)return res.status(403).json({error:'يجب دخول الغرفة أولاً قبل إرسال الرسائل'});
  if(roomBanned(u.name,room))return res.status(403).json({error:'أنت محظور من هذه الغرفة'});
  if(roomMuted(u.name,room))return res.status(403).json({error:'أنت مكتوم في هذه الغرفة'});
  if(blockedChatTerm(text))return res.status(403).json({error:'رسالتك تحتوي على كلمة غير مسموح بها'});
  const rateError=roomMessageRateLimitError(sessionId,text);if(rateError)return res.status(429).json({error:rateError});
  let botCommandError=null;
  if(await processBuiltInBotCommand(joinedSocket,u,room,text,(message,status=403)=>{botCommandError={message,status};})){
    if(botCommandError)return res.status(botCommandError.status).json({error:botCommandError.message});
    return res.json({ok:true,command:true});
  }
  const r=db.rooms.find(x=>x.id===room); if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});
  const m={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'text',text,at:Date.now(),likes:userLikes(u),role:roleOf(u),vip:vipActive(u.name),profile:profile(u.name)};try{await addMessage(m)}catch(e){console.error('HTTP room message save failed:',e.message);return res.status(500).json({error:'تعذر حفظ الرسالة'});}io.to(room).emit('message',m);res.json({ok:true,message:m});
});

app.post('/api/like',requireAuth,(req,res)=>{
  const from=req.user,to=cleanName(req.body.to); if(!to)return res.status(400).json({error:'العضو غير موجود'}); // يسمح بالإعجاب للنفس، مع بقاء مهلة الإعجاب للحسابات العادية.
  const canonical=accountKey(to); const target=getUser(canonical); const guestTarget=getGuest(canonical); if(!target&&!guestTarget)return res.status(404).json({error:'العضو غير موجود'});
  const k=keyName(from.name)+'::'+keyName(canonical), now=Date.now(), last=Number(db.lastLike[k]||0), remain=Math.max(0,10000-(now-last));
  if(!isOwner(from)&&remain>0){const sec=Math.max(1,Math.ceil(remain/1000));return res.status(429).json({error:`يسمح لك بعد ${sec} ثانية لإرسال اللايك`,remaining:sec});}
  const previousLastLike=last,previousLikes=Number((target||guestTarget).likes||0);
  db.lastLike[k]=now;
  if(target)target.likes=previousLikes+1;else guestTarget.likes=previousLikes+1;
  try{save();}catch(error){if(target)target.likes=previousLikes;else guestTarget.likes=previousLikes;if(previousLastLike)db.lastLike[k]=previousLastLike;else delete db.lastLike[k];console.error('Like save failed:',error.message);return res.status(500).json({error:'تعذر حفظ الإعجاب'});}
  const l=target?target.likes:guestTarget.likes;
  const likeText=`لقد استلمت إعجاب من ${displayName(from.name)}`;
  // الإعجاب يُحفظ دائمًا، لكن إشعار المستلم يحترم إعداد إغلاق التنبيهات.
  if(profile(canonical).notificationsOpen!==false){
    notify(canonical,{type:'like-received',from:from.name,text:likeText,likes:l});
    if(l===400)notify(canonical,{type:'unlock',text:'مبروك، تم فتح التنبيهات عند 400 إعجاب'});
    if(l===500)notify(canonical,{type:'unlock',text:'مبروك، تم فتح الصور والفيديو والصوت والاتصال عند 500 إعجاب'});
    emitToUser(canonical,'like-received',{from:from.name,text:likeText,amount:1,likes:l});
  }
  io.emit('likes-changed',{name:canonical,likes:l,level:level(l)}); res.json({ok:true,likes:l,level:level(l)});
});
app.post('/api/admin/grant-like',requireAdmin,(req,res)=>{const n=accountKey(req.body.name),amount=Math.max(1,Math.min(100000,Number(req.body.amount)||1)),u=getUser(n),g=getGuest(n);if(denyHigherRankTarget(req.user,n,res))return;if(!u&&!g)return res.status(404).json({error:'المستخدم غير موجود'});if((isOwnerName(n)||isOwner({name:n,role:(u||g).role}))&&!(isOwner(req.user)&&keyName(req.user.name)===keyName(n)))return res.status(403).json({error:'صاحب الموقع محمي من تعديل اللايكات'});const target=u||g,previous=Number(target.likes||0);target.likes=previous+amount;const likes=Number(target.likes||0);try{save();}catch(error){target.likes=previous;console.error('Admin like grant save failed:',error.message);return res.status(500).json({error:'تعذر حفظ اللايكات'});}io.emit('likes-changed',{name:n,likes,level:level(likes)});const likeText='لقد استلمت '+amount+' إعجاب من '+displayName(req.user.name);if(profile(n).notificationsOpen!==false){notify(n,{type:'like-received',from:req.user.name,text:likeText,amount,likes});emitToUser(n,'like-received',{from:req.user.name,text:likeText,amount,likes});}res.json({ok:true,likes,amount});});
app.post('/api/admin/reset-likes',requireAdmin,(req,res,next)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'reset_likes'))return res.status(403).json({error:'ما عندك صلاحية تصفير اللايكات'});const n=accountKey(req.body.name),u=getUser(n),g=getGuest(n);if(denyHigherRankTarget(req.user,n,res))return;if(!u&&!g)return res.status(404).json({error:'المستخدم غير موجود'});if(isOwner({name:n,role:(u||g).role})&&!(isOwner(req.user)&&keyName(req.user.name)===keyName(n)))return res.status(403).json({error:'لا يمكن تعديل لايكات صاحب الموقع'});const target=u||g,previous=Number(target.likes||0);target.likes=0;try{save();}catch(error){target.likes=previous;return res.status(500).json({error:'تعذر حفظ تصفير اللايكات'});}io.emit('likes-changed',{name:n,likes:0,level:1});res.json({ok:true});});});
app.post('/api/admin/gift',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!siteModuleEnabled('gifts'))return res.status(403).json({error:'الهدايا متوقفة من إدارة الموقع'});if(!hasPermission(req.user,'gifts'))return res.status(403).json({error:'ما عندك صلاحية إرسال الهدايا'});const n=accountKey(req.body.name);if(denyHigherRankTarget(req.user,n,res))return;const gift=cleanName(req.body.gift||'هدية');if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'المستخدم غير موجود'});if(isOwnerName(n))return res.status(403).json({error:'حساب صاحب الموقع محمي من الهدايا الإدارية'});const giftId=String(req.body.giftId||'').trim().slice(0,120);const category=String(req.body.category||'gift')==='vip'?'vip':'gift';const sourceCatalog=category==='vip'?(db.vipGiftCatalog||[]):(db.giftCatalog||[]);const catalogItem=sourceCatalog.find(x=>String(x.id||'')===giftId);if(!catalogItem)return res.status(400).json({error:'الهدية غير موجودة في كتالوج '+(category==='vip'?'VIP':'الهدايا')+' الحالي'});const giftIcon=String(catalogItem.icon||'🎁').trim().slice(0,24)||'🎁';const giftImage=String(catalogItem.image||'').startsWith('/')?String(catalogItem.image):'';const record={id:crypto.randomBytes(8).toString('hex'),gift,giftIcon,giftId,giftImage,category,from:req.user.name,at:Date.now()};const hadProfile=Object.prototype.hasOwnProperty.call(db.profiles,n),p=profile(n);if(denyBadgeForRank(n,p,res))return;const previousGifts=p.gifts,previousVipUntil=p.vipUntil,hadVipUntil=Object.prototype.hasOwnProperty.call(p,'vipUntil');delete p.vipUntil;p.gifts=[record];try{save();}catch(error){p.gifts=previousGifts;if(hadVipUntil)p.vipUntil=previousVipUntil;else delete p.vipUntil;if(!hadProfile)delete db.profiles[n];console.error('Admin gift send save failed:',error.message);return res.status(500).json({error:'تعذر حفظ الهدية'});}emitToUser(n,'gift',{name:n,gift,giftIcon,giftId,giftImage,from:req.user.name,fromDisplayName:displayName(req.user.name),fromProfile:profile(req.user.name),fromRole:roleOf(req.user)});io.emit('profile-changed',{name:n,profile:p});emitState();res.json({ok:true,gift,giftIcon,giftId,giftImage});});});
app.post('/api/admin/gift/delete',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{try{if(!hasPermission(req.user,'gifts'))return res.status(403).json({error:'ما عندك صلاحية حذف الهدايا'});const n=accountKey(req.body.name),target=getUser(n)||getGuest(n);if(denyHigherRankTarget(req.user,n,res))return;if(!target)return res.status(404).json({error:'المستخدم غير موجود'});if((isOwnerName(n)||isOwner({name:n,role:target.role}))&&!(isOwner(req.user)&&keyName(req.user.name)===keyName(n)))return res.status(403).json({error:'حساب صاحب الموقع محمي من حذف الهدايا بواسطة الآخرين'});const p=db.profiles[n];if(!p||!Array.isArray(p.gifts)||!p.gifts.length)return res.status(404).json({error:'لا توجد هدايا لهذا العضو'});let index=-1;const requestedId=String(req.body.giftId||'');if(requestedId)index=p.gifts.findIndex(g=>String(g.id||'')===requestedId);if(index<0&&req.body.gift&&req.body.from!==undefined){const gift=String(req.body.gift),from=String(req.body.from||''),at=Number(req.body.at)||0;index=p.gifts.findIndex(g=>String(g.gift||'')===gift&&String(g.from||'')===from&&Number(g.at||0)===at);}if(index<0&&!requestedId&&req.body.gift===undefined&&Number.isInteger(Number(req.body.index)))index=Number(req.body.index);if(!Number.isInteger(index)||index<0||index>=p.gifts.length)return res.status(404).json({error:'الهدية المحددة غير موجودة. حدّث النافذة وافتحها من جديد.'});const previousGifts=p.gifts.slice(),removed=p.gifts.splice(index,1)[0];try{save();}catch(saveError){p.gifts=previousGifts;console.error('Gift deletion save failed:',saveError.message);return res.status(500).json({error:'تعذر حفظ حذف الهدية'});}io.emit('profile-changed',{name:n,profile:p});emitState();return res.json({ok:true,removed,profile:p});}catch(err){console.error('gift-delete failed:',err);return res.status(500).json({error:'تعذر حذف الهدية من الخادم. راجع سجل الخادم.'});}});});
function countGifImageFrames(buffer){try{if(!Buffer.isBuffer(buffer)||buffer.length<14||!/^GIF8[79]a$/.test(buffer.subarray(0,6).toString('ascii')))return 0;let offset=13;const packed=buffer[10];if(packed&0x80)offset+=3*(1<<((packed&7)+1));let frames=0,guard=0;while(offset<buffer.length&&guard++<10000){const marker=buffer[offset++];if(marker===0x3B)break;if(marker===0x21){if(offset>=buffer.length)return 0;const label=buffer[offset++];if(label===0xF9){if(offset>=buffer.length)return 0;const size=buffer[offset++];offset+=size;if(buffer[offset]===0)offset++;}else{while(offset<buffer.length){const size=buffer[offset++];if(size===0)break;offset+=size;}}continue;}if(marker===0x2C){if(offset+9>buffer.length)return 0;const imagePacked=buffer[offset+8];offset+=9;if(imagePacked&0x80)offset+=3*(1<<((imagePacked&7)+1));if(offset>=buffer.length)return 0;offset++;while(offset<buffer.length){const size=buffer[offset++];if(size===0)break;offset+=size;}frames++;continue;}return 0;}return frames;}catch{return 0;}}
app.post('/api/admin/gifts/catalog/upload',requireAdmin,(req,res,next)=>requireAuth(req,res,()=>{if(!siteModuleEnabled('gifts'))return res.status(403).json({error:'الهدايا متوقفة من إدارة الموقع'});if(!hasPermission(req.user,'gift_catalog_manage'))return res.status(403).json({error:'ما عندك صلاحية تعديل كتالوج الهدايا'});return next();}),uploadSmallImage.single('file'),validateUploadedContent('image'),(req,res)=>{try{if(!req.file||req.file.mimetype!=='image/gif'){removeUploadedFile(req.file);return res.status(400).json({error:'ارفع ملف GIF متحرك فقط'});}const gifBytes=fs.readFileSync(path.join(UP_DIR,req.file.filename));const gifFrames=countGifImageFrames(gifBytes);if(gifFrames<2){removeUploadedFile(req.file);return res.status(400).json({error:'ملف GIF لازم يحتوي على إطارين أو أكثر حتى يكون متحركاً'});}const name=cleanName(req.body.name||'').slice(0,40);if(!name){removeUploadedFile(req.file);return res.status(400).json({error:'اكتب اسم الهدية'});}const category=String(req.body.category||'gift')==='vip'?'vip':'gift';const catalogKey=category==='vip'?'vipGiftCatalog':'giftCatalog',hadCatalog=Object.prototype.hasOwnProperty.call(db,catalogKey),previousCatalog=db[catalogKey];const targetCatalog=Array.isArray(previousCatalog)?previousCatalog:[];if(targetCatalog.length>=200){removeUploadedFile(req.file);return res.status(400).json({error:'وصلت للحد الأعلى وهو 200 هدية'});}const item={id:crypto.randomUUID(),name,icon:String(req.body.icon||(category==='vip'?'👑':'🎁')).slice(0,24),image:'/uploads/'+req.file.filename,price:0,builtin:false,category,createdAt:Date.now()};if(!Array.isArray(previousCatalog))db[catalogKey]=targetCatalog;targetCatalog.push(item);try{save()}catch(error){targetCatalog.pop();if(!Array.isArray(previousCatalog)){if(hadCatalog)db[catalogKey]=previousCatalog;else delete db[catalogKey];}removeUploadedFile(req.file);throw error;}return res.json({ok:true,gift:item,count:targetCatalog.length,category});}catch(error){console.error('Gift GIF upload failed:',error);removeUploadedFile(req.file);return res.status(500).json({error:'تعذر حفظ الهدية المتحركة'});}});
app.post('/api/admin/gifts/catalog/delete',requireAdmin,(req,res)=>{if(!siteModuleEnabled('gifts'))return res.status(403).json({error:'الهدايا متوقفة من إدارة الموقع'});if(!hasPermission(req.user,'gift_catalog_manage'))return res.status(403).json({error:'ما عندك صلاحية تعديل كتالوج الهدايا'});const category=String(req.body.category||'gift')==='vip'?'vip':'gift';const catalog=category==='vip'?db.vipGiftCatalog:db.giftCatalog;if(!Array.isArray(catalog))return res.status(404).json({error:'كتالوج الهدايا غير موجود'});const id=String(req.body.id||'');const index=id?catalog.findIndex(g=>String(g.id)===id):Number(req.body.index);if(!Number.isInteger(index)||index<0||index>=catalog.length)return res.status(404).json({error:'الهدية المحددة غير موجودة'});const removed=catalog.splice(index,1)[0];try{save()}catch(error){catalog.splice(index,0,removed);return res.status(500).json({error:'تعذر حفظ حذف الهدية'});}if(removed?.image?.startsWith('/uploads/'))removePublicUploadIfUnreferenced(removed.image);return res.json({ok:true,removed,count:catalog.length,category});});
app.post('/api/admin/gift-vip',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!hasPermission(req.user,'vip'))return res.status(403).json({error:'ما عندك صلاحية منح VIP'});const n=accountKey(req.body.name);if(denyHigherRankTarget(req.user,n,res))return;if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'المستخدم غير موجود'});if(isOwnerName(n)||isOwner({name:n,role:(getUser(n)||getGuest(n)).role}))return res.status(403).json({error:'حساب صاحب الموقع محمي'});const days=Number(req.body.durationDays??1);if(!Number.isInteger(days)||days<1||days>365)return res.status(400).json({error:'مدة VIP يجب أن تكون من يوم إلى 365 يوم'});const hadProfile=Object.prototype.hasOwnProperty.call(db.profiles,n),p=profile(n),previous={...p};if(denyBadgeForRank(n,p,res))return;p.vipGrantedAt=Date.now();p.vipGrantedBy=req.user.name;p.vipUntil=Date.now()+days*24*60*60*1000;p.gifts=[];try{save();}catch(error){if(hadProfile){for(const key of Object.keys(p))delete p[key];Object.assign(p,previous);}else delete db.profiles[n];return res.status(500).json({error:'تعذر حفظ عضوية VIP'});}emitToUser(n,'vip-changed',{name:n,vipUntil:p.vipUntil,from:req.user.name});emitToUser(n,'admin-action-notice',{title:'👑 عضوية VIP',text:'منحك '+req.user.name+' عضوية VIP لمدة '+days+' يوم'});io.emit('profile-changed',{name:n,profile:p});emitState();res.json({ok:true,vipUntil:p.vipUntil,durationDays:days});});});
app.post('/api/admin/vip/:name/revoke',requireAdmin,(req,res)=>{if(!hasPermission(req.user,'vip'))return res.status(403).json({error:'ما عندك صلاحية إدارة VIP'});const n=accountKey(req.params.name);if(denyHigherRankTarget(req.user,n,res))return;if(isOwnerName(n))return res.status(403).json({error:'حساب صاحب الموقع محمي'});const target=getUser(n)||getGuest(n);if(!target)return res.status(404).json({error:'العضو غير موجود'});const hadProfile=Object.prototype.hasOwnProperty.call(db.profiles,n),p=profile(n),previous={...p};delete p.vipUntil;delete p.vipGrantedAt;delete p.vipGrantedBy;try{save();}catch(error){if(hadProfile){for(const key of Object.keys(p))delete p[key];Object.assign(p,previous);}else delete db.profiles[n];return res.status(500).json({error:'تعذر حفظ إزالة VIP'});}emitToUser(n,'vip-changed',{name:n,vipUntil:0,from:req.user.name});io.emit('profile-changed',{name:n,profile:p});emitState();res.json({ok:true});});
app.post('/api/admin/move-member',requireAdmin,(req,res)=>{if(!hasPermission(req.user,'room_move'))return res.status(403).json({error:'ما عندك صلاحية نقل الأعضاء بين الغرف'});const n=accountKey(req.body.name),to=String(req.body.to||'');const target=getUser(n)||getGuest(n);if(!target)return res.status(404).json({error:'العضو غير موجود'});if(isOwnerName(n)||isOwner({name:n,role:target.role})){if(!isOwner(req.user))notifyOwnerProtectedAttempt(req.user,'نقل حسابك إلى غرفة أخرى');return res.status(403).json({error:'صاحب الموقع محمي من النقل الإداري'});}if(denyHigherRankTarget(req.user,n,res))return;const room=db.rooms.find(r=>r.id===to);if(!room)return res.status(404).json({error:'الغرفة الجديدة غير موجودة'});if(req.body.enforceRoomPassword===true&&room.passwordHash&&!bcrypt.compareSync(String(req.body.password||''),room.passwordHash))return res.status(403).json({error:'كلمة مرور الغرفة غير صحيحة'});const active=[...socketUsers.entries()].filter(([,u])=>keyName(u.name)===keyName(n));if(!active.length)return res.status(409).json({error:'العضو غير متصل حالياً؛ حدّث القائمة وجرب مرة ثانية'});const movable=active.filter(([,u])=>(u.room||'public')!==to);if(!movable.length)return res.status(400).json({error:'العضو موجود بالفعل في الغرفة المحددة'});let moved=0;for(const [sid2,u2] of movable){const so=socketBySession(sid2);if(!so)continue;so.emit('admin-moved-room',{room:to,roomName:room.name,from:u2.room||'public'});so.emit('admin-action-notice',{title:'🔀 نقل بين الغرف',text:'تم نقلك إلى '+room.name});moved++;}if(!moved)return res.status(409).json({error:'تعذر نقل العضو؛ حدّث القائمة وجرب مرة ثانية'});emitState();return res.json({ok:true,name:n,to,room:room.name,moved});});
app.post('/api/admin/member-action',requireAdmin,(req,res)=>{
  const actor=req.user,n=accountKey(req.body.name),action=String(req.body.action||''),room=String(req.body.room||'public');
  if(!n)return res.status(400).json({error:'الاسم مطلوب'});
  const actionPermission=({'global-kick':'global_kick','global-ban':'global_ban','kick':'kick_room','ban':'ban_room','mute':'mute_room','grant-like':'grant_likes','reset-likes':'reset_likes','grant-vip':'vip','gift':'gifts'})[action];if(!actionPermission)return res.status(400).json({error:'الإجراء غير معروف'});if(!hasPermission(actor,actionPermission))return res.status(403).json({error:'ما عندك صلاحية لهذا الإجراء'});
  const protectedTarget=getUser(n)||getGuest(n);
  if((isOwnerName(n)||isOwner({name:n,role:protectedTarget?.role}))&&!isOwner(actor)){notifyOwnerProtectedAttempt(actor,({ 'global-kick':'الطرد من الدردشة','global-ban':'الحظر من الدردشة',kick:'الطرد من الغرفة',ban:'الحظر من الغرفة',mute:'الكتم في الغرفة','grant-like':'تعديل اللايكات','reset-likes':'تصفير اللايكات','grant-vip':'تغيير عضوية VIP',gift:'إرسال هدية'}[action]||action));return res.status(403).json({error:'حساب صاحب الموقع محمي ولا يمكن للإداري تنفيذ هذا الإجراء'});}
  if(denyHigherRankTarget(actor,n,res))return;
  if(action==='global-kick'){ emitToUser(n,'admin-action-notice',{title:'🚪 طرد من الدردشة',text:'قام '+actor.name+' (admin) بطردك من الدردشة'}); removeFromChat(n,false); return res.json({ok:true}); }
  if(action==='global-ban'){const previousGlobalBans=db.globalBans,previousGlobalIpBans=db.globalIpBans;db.globalBans={...(db.globalBans||{})};db.globalIpBans={...(db.globalIpBans||{})};const until=Date.now()+5*60*1000,targetIps=new Set();for(const so of io.sockets.sockets.values()){const sid2=so.data?.sid,u2=so.data?.user||socketUsers.get(sid2);if(u2&&keyName(u2.name)===keyName(n)){const ip=socketClientIp(so);if(ip)targetIps.add(ip);}}db.globalBans[keyName(n)]={name:keyName(n),until};for(const ip of targetIps)db.globalIpBans[ip]={ip,name:keyName(n),until};try{save();}catch(error){if(previousGlobalBans===undefined)delete db.globalBans;else db.globalBans=previousGlobalBans;if(previousGlobalIpBans===undefined)delete db.globalIpBans;else db.globalIpBans=previousGlobalIpBans;console.error('Global ban save failed:',error.message);return res.status(500).json({error:'تعذر حفظ الحظر العام'});}emitToUser(n,'admin-action-notice',{title:'⛔ حظر من الدردشة',text:'قام '+actor.name+' (admin) بحظرك من الدردشة لمدة 5 دقائق'});removeFromChat(n,true);return res.json({ok:true,until,ipCount:targetIps.size});}
  const target=getUser(n)||getGuest(n);
  if(!target && !['kick','ban','mute'].includes(action))return res.status(404).json({error:'المستخدم غير موجود'});
  if(action==='grant-like'&&!hasPermission(actor,'grant_likes'))return res.status(403).json({error:'ما عندك صلاحية منح اللايكات'});
  if(action==='reset-likes'&&!hasPermission(actor,'reset_likes'))return res.status(403).json({error:'ما عندك صلاحية تصفير اللايكات'});
  if(action==='grant-vip'&&!hasPermission(actor,'vip'))return res.status(403).json({error:'ما عندك صلاحية منح VIP'});
  if(action==='grant-like'){const amount=Math.max(1,Math.min(10000,Number(req.body.amount)||1)),previous=Number(target.likes||0);target.likes=previous+amount;try{save();}catch(error){target.likes=previous;return res.status(500).json({error:'تعذر حفظ اللايكات'});}io.emit('likes-changed',{name:n,likes:target.likes,level:level(target.likes)});const likeText='لقد استلمت '+amount+' إعجاب من '+displayName(actor.name);if(profile(n).notificationsOpen!==false){notify(n,{type:'like-received',from:actor.name,text:likeText,amount,likes:target.likes});emitToUser(n,'like-received',{from:actor.name,text:likeText,amount,likes:target.likes});}return res.json({ok:true,likes:target.likes,amount});}
  if(action==='reset-likes'){if(isOwner({name:n,role:target.role})&&!(isOwner(actor)&&keyName(actor.name)===keyName(n)))return res.status(403).json({error:'لا يمكن تعديل لايكات صاحب الموقع'});const previous=Number(target.likes||0);target.likes=0;try{save();}catch(error){target.likes=previous;return res.status(500).json({error:'تعذر حفظ تصفير اللايكات'});}io.emit('likes-changed',{name:n,likes:0,level:1});return res.json({ok:true});}
  if(action==='grant-vip'){const until=Date.now()+24*60*60*1000;const p=profile(n),previousVipUntil=p.vipUntil,hadVipUntil=Object.prototype.hasOwnProperty.call(p,'vipUntil'),previousGifts=p.gifts,hadGifts=Object.prototype.hasOwnProperty.call(p,'gifts');if(denyBadgeForRank(n,p,res))return;p.vipUntil=until;p.gifts=[];try{save();}catch(error){if(hadVipUntil)p.vipUntil=previousVipUntil;else delete p.vipUntil;if(hadGifts)p.gifts=previousGifts;else delete p.gifts;return res.status(500).json({error:'تعذر حفظ عضوية VIP'});}io.emit('profile-changed',{name:n,profile:p});emitToUser(n,'vip-changed',{name:n,vipUntil:until,from:actor.name});emitToUser(n,'admin-action-notice',{title:'👑 عضوية VIP',text:'منحك '+actor.name+' (admin) عضوية VIP لمدة 24 ساعة'});emitState();return res.json({ok:true,vipUntil:until});}
  if(action==='gift'){const gift=cleanName(req.body.gift||'هدية');const giftId=String(req.body.giftId||'').trim().slice(0,120);const category=String(req.body.category||'gift')==='vip'?'vip':'gift';const catalog=category==='vip'?(db.vipGiftCatalog||[]):(db.giftCatalog||[]);const item=catalog.find(x=>String(x.id||'')===giftId);if(!item)return res.status(400).json({error:'الهدية غير موجودة في الكتالوج الحالي'});const giftIcon=String(item.icon||'🎁').slice(0,24),giftImage=String(item.image||'').startsWith('/')?item.image:'';const record={id:crypto.randomBytes(8).toString('hex'),gift,giftIcon,giftId,giftImage,category,from:actor.name,at:Date.now()};const p=profile(n),previousVipUntil=p.vipUntil,hadVipUntil=Object.prototype.hasOwnProperty.call(p,'vipUntil'),previousGifts=p.gifts,hadGifts=Object.prototype.hasOwnProperty.call(p,'gifts');if(denyBadgeForRank(n,p,res))return;delete p.vipUntil;p.gifts=[record];try{save();}catch(error){if(hadVipUntil)p.vipUntil=previousVipUntil;else delete p.vipUntil;if(hadGifts)p.gifts=previousGifts;else delete p.gifts;return res.status(500).json({error:'تعذر حفظ الهدية'});}io.emit('profile-changed',{name:n,profile:p});emitToUser(n,'gift',{name:n,gift,giftIcon,giftId,giftImage,from:actor.name,fromDisplayName:displayName(actor.name),fromProfile:profile(actor.name),fromRole:roleOf(actor)});emitState();return res.json({ok:true,gift,giftIcon,giftId,giftImage});}
  if(action==='kick'){emitToUser(n,'admin-action-notice',{title:'🚪 طرد من الغرفة',text:'قام '+actor.name+' (admin) بطردك من الغرفة'});for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===keyName(n)&&u2.room===room){const so=socketBySession(sid2);so?.leave(room);removeSessionFromRoomRuntime(sid2,room);if(so?.data?.user)so.data.user.room='';if(socketUsers.get(sid2))socketUsers.get(sid2).room='';so?.emit('kicked',{room,banned:false});}}emitState();return res.json({ok:true});}
  if(action==='ban'){const hadRoom=Object.prototype.hasOwnProperty.call(db.roomBans,room),previousRoom=Array.isArray(db.roomBans[room])?db.roomBans[room].slice():db.roomBans[room],until=Date.now()+15*60*1000;db.roomBans[room]=Array.isArray(db.roomBans[room])?db.roomBans[room]:[];db.roomBans[room]=db.roomBans[room].filter(x=>typeof x==='string'?keyName(x)!==keyName(n):keyName(x?.name)!==keyName(n));db.roomBans[room].push({name:keyName(n),until});try{save();}catch(error){if(hadRoom)db.roomBans[room]=previousRoom;else delete db.roomBans[room];return res.status(500).json({error:'تعذر حفظ حظر الغرفة'});}emitToUser(n,'admin-action-notice',{title:'⛔ حظر من الغرفة',text:'قام '+actor.name+' (admin) بحظرك من الغرفة لمدة 15 دقيقة'});for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===keyName(n)&&u2.room===room){const so=socketBySession(sid2);so?.leave(room);removeSessionFromRoomRuntime(sid2,room);if(so?.data?.user)so.data.user.room='';if(socketUsers.get(sid2))socketUsers.get(sid2).room='';so?.emit('kicked',{room,banned:true,until});}}emitState();return res.json({ok:true,until});}
  if(action==='mute'){const hadRoom=Object.prototype.hasOwnProperty.call(db.roomMutes,room),previousRoom=Array.isArray(db.roomMutes[room])?db.roomMutes[room].slice():db.roomMutes[room];db.roomMutes[room]=Array.isArray(db.roomMutes[room])?db.roomMutes[room]:[];const kn=keyName(n);if(!db.roomMutes[room].includes(kn))db.roomMutes[room].push(kn);try{save();}catch(error){if(hadRoom)db.roomMutes[room]=previousRoom;else delete db.roomMutes[room];return res.status(500).json({error:'تعذر حفظ كتم الغرفة'});}emitToUser(n,'error-msg',{error:'تم كتمك في هذه الغرفة'});emitState();return res.json({ok:true});}
  return res.status(400).json({error:'إجراء غير معروف'});
});
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
  // Commit the announcement record, publication message, and repeat timestamp together.
  try{const published=publishAnnouncement(item);if(!published.length)throw new Error('Announcement was not published');}
  catch(error){
    if(previousAnnouncements===undefined)delete db.announcements;else db.announcements=previousAnnouncements;
    if(previousMessages===undefined)delete db.messages;else db.messages=previousMessages;
    console.error('Announcement publication transaction failed:',error.message);
    return res.status(500).json({error:'تعذر حفظ الإعلان ونشره'});
  }
  if(temporary)scheduleAnnouncementExpiry(item);else schedulePermanentAnnouncement(item);
  res.json({ok:true,announcement:item});
});
app.delete('/api/admin/announcement/:id',requireAdmin,(req,res)=>{const id=String(req.params.id);const existed=(db.announcements||[]).some(x=>String(x.id)===id);let removed;try{removed=removeAnnouncement(id);}catch(error){console.error('Announcement deletion transaction failed:',error.message);return res.status(500).json({error:'تعذر حفظ حذف الإعلان'});}res.json({ok:true,removedMessages:removed.length,existed});});
app.delete('/api/admin/message/:id',requireAdmin,(req,res)=>{
  const id=req.params.id,previousMessages=db.messages;
  db.messages=(db.messages||[]).filter(x=>x.id!==id);
  try{save();}catch(error){db.messages=previousMessages;console.error('Admin message deletion save failed:',error.message);return res.status(500).json({error:'تعذر حفظ حذف الرسالة'});}
  io.emit('message-deleted',{id});res.json({ok:true});
});
app.patch('/api/admin/profile/:name',requireAdmin,(req,res)=>{
  const n=accountKey(req.params.name),protectedTarget=getUser(n)||getGuest(n);
  if((isOwnerName(n)||isOwner({name:n,role:protectedTarget?.role}))&&!isOwner(req.user)){
    const action=req.body?.displayName!==undefined?'تغيير زخرفة اسمك':(req.body?.nameColor!==undefined||req.body?.fontColor!==undefined||req.body?.bgColor!==undefined?'تغيير ألوان ملفك':'تعديل ملفك');
    notifyOwnerProtectedAttempt(req.user,action);return res.status(403).json({error:'ملف صاحب الموقع محمي من الإداريين'});
  }
  if(denyHigherRankTarget(req.user,n,res))return;
  if(!getUser(n)&&!getGuest(n))return res.status(404).json({error:'العضو غير موجود'});
  const updates={};
  if(req.body.displayName!==undefined){const dn=cleanName(req.body.displayName);if(!dn)return res.status(400).json({error:'الزخرفة لا يمكن أن تكون فارغة'});updates.displayName=dn;}
  for(const [field,label] of [['nameColor','لون الاسم'],['fontColor','لون الخط'],['bgColor','لون الخلفية']]){
    if(req.body[field]===undefined)continue;
    const color=String(req.body[field]||'');
    if(!/^#[0-9a-fA-F]{6}$/.test(color))return res.status(400).json({error:label+' غير صحيح'});
    updates[field]=color;
  }
  const p=profile(n),previous={...p};
  Object.assign(p,updates);
  try{save();}catch(error){
    for(const key of Object.keys(p))delete p[key];Object.assign(p,previous);
    console.error('Admin profile update save failed:',error.message);
    return res.status(500).json({error:'تعذر حفظ تعديلات الملف الشخصي'});
  }
  io.emit('profile-changed',{name:n,profile:p,displayName:p.displayName||cleanName(n)});
  res.json({ok:true,profile:p,displayName:p.displayName||cleanName(n)});
});
app.patch('/api/admin/member-stats/:name',requireAdmin,(req,res)=>{
  const n=accountKey(req.params.name);
  if(denyHigherRankTarget(req.user,n,res))return;
  const field=String(req.body.field||''),value=Number(req.body.value),user=getUser(n),guest=getGuest(n),target=user||guest;
  if(!target)return res.status(404).json({error:'العضو غير موجود'});
  if(isOwner({name:n,role:target.role})&&!(isOwner(req.user)&&keyName(req.user.name)===keyName(n)))return res.status(403).json({error:'حساب صاحب الموقع محمي من تعديل البيانات'});
  if(!Number.isInteger(value)||value<0||value>1000000)return res.status(400).json({error:'القيمة يجب أن تكون عدداً صحيحاً بين 0 و1000000'});
  if(field!=='likes'&&field!=='points')return res.status(400).json({error:'نوع القيمة غير معروف'});
  if(field==='likes'&&!hasPermission(req.user,'grant_likes'))return res.status(403).json({error:'ما عندك صلاحية تعديل اللايكات'});
  if(field==='points'&&!hasPermission(req.user,'panel_access'))return res.status(403).json({error:'ما عندك صلاحية تعديل النقاط'});
  const previous=target[field];target[field]=value;
  try{save();}catch(error){target[field]=previous;console.error('Member stats save failed:',error.message);return res.status(500).json({error:'تعذر حفظ بيانات العضو'});}
  if(field==='likes')io.emit('likes-changed',{name:n,likes:value,level:level(value)});
  else io.emit('member-stats-changed',{name:n,points:value});
  emitState();return res.json({ok:true,field,[field]:value});
});
app.delete('/api/admin/avatar/:name',requireAdmin,(req,res)=>{
  const n=accountKey(req.params.name),target=getUser(n)||getGuest(n),ownerNames=new Set(['owner',keyName(process.env.OWNER_NAME||'owner')]);
  if((ownerNames.has(keyName(n))||isOwnerName(n)||isOwner({name:n,role:target?.role}))&&!isOwner(req.user)){notifyOwnerProtectedAttempt(req.user,'حذف صورتك الشخصية');return res.status(403).json({error:'صورة صاحب الموقع محمية من الإداريين'});}
  if(denyHigherRankTarget(req.user,n,res))return;
  if(!target)return res.status(404).json({error:'العضو غير موجود'});
  const p=profile(n),previous=p.avatar||'';p.avatar='';
  try{save();}catch(error){p.avatar=previous;console.error('Admin avatar deletion save failed:',error.message);return res.status(500).json({error:'تعذر حفظ حذف الصورة'});}
  if(previous.startsWith('/uploads/'))removePublicUploadIfUnreferenced(previous);
  io.emit('profile-changed',{name:n,profile:p});res.json({ok:true});
});
app.post('/api/admin/rank',requireAdmin,(req,res)=>{
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
  const hadProfile=Object.prototype.hasOwnProperty.call(db.profiles||{},n),p=profile(n),previousProfile=JSON.parse(JSON.stringify(p));
  const hadRankAudit=Object.prototype.hasOwnProperty.call(db,'rankAudit'),previousRankAudit=db.rankAudit;
  const hadNotificationsRoot=Object.prototype.hasOwnProperty.call(db,'notifications'),hadMemberNotifications=Object.prototype.hasOwnProperty.call(db.notifications||{},n),previousNotifications=hadMemberNotifications?JSON.parse(JSON.stringify(db.notifications[n])):undefined;
  db.rankAudit=Array.isArray(db.rankAudit)?db.rankAudit.slice():[];
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
    if(hadProfile)db.profiles[n]=previousProfile;else delete db.profiles[n];
    if(hadRankAudit)db.rankAudit=previousRankAudit;else delete db.rankAudit;
    if(hadNotificationsRoot){if(hadMemberNotifications)db.notifications[n]=previousNotifications;else delete db.notifications[n];}else delete db.notifications;
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
});
app.get('/api/admin/member-ip/:name' ,requireAdmin,(req,res)=>{const n=keyName(req.params.name);if(isOwnerName(n))return res.status(403).json({error:'معلومات اتصال صاحب الموقع محمية'});if(denyHigherRankTarget(req.user,n,res))return;const matches=[];for(const so of io.sockets.sockets.values()){const sid2=so.data?.sid,u2=so.data?.user||socketUsers.get(sid2);if(u2&&keyName(u2.name)===n){matches.push({ip:socketClientIp(so),room:u2.room||'',connected:true});}}res.json({name:req.params.name,connections:matches});});
// Rank artwork and per-member decoration are separate from rank permissions and rank assignment.
function rankArtItem(id){return (db.rankArtCatalog||[]).find(x=>String(x.id)===String(id))||null;}
function canManageRankArt(user){return isOwner(user)||hasPermission(user,'rank_art_manage')||hasPermission(user,'member_decoration_manage');}
app.get('/api/admin/rank-art',requireAdmin,(req,res)=>{
 if(!canManageRankArt(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة زخارف الرتب'});
 res.set('Cache-Control','no-store');
 res.json({items:(db.rankArtCatalog||[]).map(x=>({id:x.id,name:x.name,image:x.image,mime:x.mime})),ranks:(db.rankDefinitions||[]).filter(r=>RANK_PERMISSION_PROFILES.includes(r.id)).map(r=>({id:r.id,name:r.name,artId:r.artId||'',artUrl:r.artUrl||''}))});
});
app.post('/api/admin/rank-art/upload',requireAdmin,(req,res,next)=>{if(!hasPermission(req.user,'rank_art_manage'))return res.status(403).json({error:'ما عندك صلاحية إضافة أشكال للرتب'});next();},uploadSmallImage.single('file'),validateUploadedContent('image'),(req,res)=>{
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
app.put('/api/admin/rank-art/assign',requireAdmin,(req,res)=>{
 if(!hasPermission(req.user,'rank_art_manage'))return res.status(403).json({error:'ما عندك صلاحية ربط أشكال الرتب'});
 const rank=String(req.body?.rank||''),artId=String(req.body?.artId||'');if(!RANK_PERMISSION_PROFILES.includes(rank))return res.status(400).json({error:'اختر رتبة من الرتب السبع'});
 const definition=rankDefinition(rank);if(!definition)return res.status(404).json({error:'الرتبة غير موجودة'});
 const item=artId?rankArtItem(artId):null;if(artId&&!item)return res.status(404).json({error:'الشكل المحدد غير موجود'});
 const old={artId:definition.artId,artUrl:definition.artUrl};if(item){definition.artId=item.id;definition.artUrl=item.image;}else{delete definition.artId;delete definition.artUrl;}
 try{save()}catch(error){if(old.artId!==undefined)definition.artId=old.artId;else delete definition.artId;if(old.artUrl!==undefined)definition.artUrl=old.artUrl;else delete definition.artUrl;return res.status(500).json({error:'تعذر حفظ شكل الرتبة'});}
 io.emit('rank-art-updated',{rank,artUrl:item?.image||''});res.json({ok:true,rank,artId:item?.id||'',artUrl:item?.image||''});
});
app.delete('/api/admin/rank-art/:id',requireAdmin,(req,res)=>{
 if(!hasPermission(req.user,'rank_art_manage'))return res.status(403).json({error:'ما عندك صلاحية حذف أشكال الرتب'});
 const id=String(req.params.id||''),index=(db.rankArtCatalog||[]).findIndex(x=>String(x.id)===id);if(index<0)return res.status(404).json({error:'الشكل غير موجود'});
 const item=db.rankArtCatalog[index];const previous=db.rankArtCatalog.slice();const oldRanks=(db.rankDefinitions||[]).map(r=>({r,artId:r.artId,artUrl:r.artUrl}));const oldProfiles=Object.entries(db.profiles||{}).map(([name,p])=>({name,customDecorationId:p.customDecorationId,customDecorationImage:p.customDecorationImage,customDecorationName:p.customDecorationName}));db.rankArtCatalog.splice(index,1);
 for(const rank of db.rankDefinitions||[])if(String(rank.artId||'')===id){delete rank.artId;delete rank.artUrl;}
 for(const profileData of Object.values(db.profiles||{}))if(String(profileData.customDecorationId||'')===id){delete profileData.customDecorationId;delete profileData.customDecorationImage;delete profileData.customDecorationName;}
 try{save()}catch(error){db.rankArtCatalog=previous;for(const x of oldRanks){if(x.artId!==undefined)x.r.artId=x.artId;else delete x.r.artId;if(x.artUrl!==undefined)x.r.artUrl=x.artUrl;else delete x.r.artUrl;}for(const x of oldProfiles){const p=db.profiles[x.name];if(!p)continue;for(const k of ['customDecorationId','customDecorationImage','customDecorationName'])if(x[k]!==undefined)p[k]=x[k];else delete p[k];}return res.status(500).json({error:'تعذر حفظ حذف الشكل'});}
 if(item.image?.startsWith('/uploads/'))removePublicUploadIfUnreferenced(item.image);
 io.emit('rank-art-updated',{deleted:id,ranks:(db.rankDefinitions||[]).filter(r=>RANK_PERMISSION_PROFILES.includes(r.id)).map(r=>({id:r.id,artUrl:r.artUrl||''}))});res.json({ok:true,deleted:id});
});
// Chat/rank banners are independent from the small rank artwork library and personal profile banners.
function canManageChatBanners(user){return isOwner(user)||hasPermission(user,'chat_banners_manage');}
app.get('/api/admin/chat-banners',requireAdmin,(req,res)=>{
 if(!canManageChatBanners(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة بنرات الدردشة'});
 res.set('Cache-Control','no-store');
 res.json({ranks:(db.rankDefinitions||[]).filter(r=>RANK_PERMISSION_PROFILES.includes(r.id)).slice().sort((a,b)=>Number(b.level)-Number(a.level)).map(r=>({id:r.id,name:r.name,bannerUrl:r.bannerUrl||'',bannerName:r.bannerName||''}))});
});
app.post('/api/admin/chat-banners/:rank',requireAdmin,(req,res,next)=>{if(!canManageChatBanners(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة بنرات الدردشة'});next();},uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{
 const rank=String(req.params.rank||''),definition=rankDefinition(rank);
 if(!definition){removeUploadedFile(req.file);return res.status(400).json({error:'اختر رتبة صحيحة من الرتب السبع'});}
 if(!req.file||!['image/gif','image/png','image/jpeg','image/webp'].includes(String(req.file.mimetype||''))){removeUploadedFile(req.file);return res.status(400).json({error:'ارفع صورة GIF أو PNG أو JPG أو WEBP'});}
 const previous={url:definition.bannerUrl,name:definition.bannerName};
 definition.bannerUrl='/uploads/'+req.file.filename;
 definition.bannerName=String(req.body?.name||'').trim().slice(0,50)||definition.name;
 try{save()}catch(error){if(previous.url!==undefined)definition.bannerUrl=previous.url;else delete definition.bannerUrl;if(previous.name!==undefined)definition.bannerName=previous.name;else delete definition.bannerName;removeUploadedFile(req.file);console.error('Chat rank banner save failed:',error.message);return res.status(500).json({error:'تعذر حفظ بنر الرتبة'});}
 if(previous.url&&previous.url.startsWith('/uploads/'))removePublicUploadIfUnreferenced(previous.url);
 const ranks=(db.rankDefinitions||[]).filter(r=>RANK_PERMISSION_PROFILES.includes(r.id)).map(r=>({id:r.id,bannerUrl:r.bannerUrl||'',bannerName:r.bannerName||''}));
 io.emit('rank-banners-updated',{rank,bannerUrl:definition.bannerUrl,bannerName:definition.bannerName,ranks});
 emitState();res.json({ok:true,rank,bannerUrl:definition.bannerUrl,bannerName:definition.bannerName});
});
app.delete('/api/admin/chat-banners/:rank',requireAdmin,(req,res)=>{
 if(!canManageChatBanners(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة بنرات الدردشة'});
 const rank=String(req.params.rank||''),definition=rankDefinition(rank);if(!definition)return res.status(400).json({error:'اختر رتبة صحيحة من الرتب السبع'});
 const previous={url:definition.bannerUrl,name:definition.bannerName};delete definition.bannerUrl;delete definition.bannerName;
 try{save()}catch(error){if(previous.url!==undefined)definition.bannerUrl=previous.url;if(previous.name!==undefined)definition.bannerName=previous.name;return res.status(500).json({error:'تعذر حذف بنر الرتبة'});}
 if(previous.url&&previous.url.startsWith('/uploads/'))removePublicUploadIfUnreferenced(previous.url);
 const ranks=(db.rankDefinitions||[]).filter(r=>RANK_PERMISSION_PROFILES.includes(r.id)).map(r=>({id:r.id,bannerUrl:r.bannerUrl||'',bannerName:r.bannerName||''}));
 io.emit('rank-banners-updated',{rank,bannerUrl:'',bannerName:'',ranks});emitState();res.json({ok:true,rank});
});

app.put('/api/admin/member-decoration',requireAdmin,(req,res)=>{
 if(!hasPermission(req.user,'member_decoration_manage'))return res.status(403).json({error:'ما عندك صلاحية تخصيص زخرفة الأعضاء'});
 const n=accountKey(cleanName(req.body?.name||''));if(!n)return res.status(400).json({error:'اختر عضواً صالحاً'});if(isOwnerName(n)||isOwner({name:n,role:(getUser(n)||getGuest(n)||{}).role})){if(!isOwner(req.user))notifyOwnerProtectedAttempt(req.user,'تغيير زخرفة/شعار حسابك');return res.status(400).json({error:'حساب صاحب الموقع محمي'});}
 const target=getUser(n)||getGuest(n);if(!target)return res.status(404).json({error:'العضو غير موجود'});if(denyHigherRankTarget(req.user,n,res))return;
 const p=profile(n),old={customDecorationId:p.customDecorationId,customDecorationImage:p.customDecorationImage,customDecorationName:p.customDecorationName},artId=String(req.body?.artId||'');if(!artId){delete p.customDecorationId;delete p.customDecorationImage;delete p.customDecorationName;}
 else{const item=rankArtItem(artId);if(!item)return res.status(404).json({error:'الزخرفة المحددة غير موجودة'});p.customDecorationId=item.id;p.customDecorationImage=item.image;p.customDecorationName=item.name;}
 try{save()}catch(error){for(const k of Object.keys(old))if(old[k]!==undefined)p[k]=old[k];else delete p[k];return res.status(500).json({error:'تعذر حفظ زخرفة العضو'});}
 io.emit('profile-changed',{name:n,profile:p});res.json({ok:true,name:n,decoration:p.customDecorationImage||'',decorationName:p.customDecorationName||''});
});

// Built-in chat bots: durable settings, normalized defaults and permission-checked writes.
const BOT_DEFAULTS=Object.freeze({welcome:{enabled:false,text:'أهلاً وسهلاً بك في دردشة رماز ❤️'},antiSpam:{enabled:true},games:{enabled:false},stats:{enabled:false},adminCommands:{enabled:false}});
function normalizedBotSettings(value={}){const b=value&&typeof value==='object'?value:{};return {welcome:{enabled:b.welcome?.enabled===true,text:String(b.welcome?.text||BOT_DEFAULTS.welcome.text).trim().slice(0,240)||BOT_DEFAULTS.welcome.text},antiSpam:{enabled:b.antiSpam?.enabled!==false},games:{enabled:b.games?.enabled===true},stats:{enabled:b.stats?.enabled===true},adminCommands:{enabled:b.adminCommands?.enabled===true}};}
app.get('/api/admin/bots',requireAdmin,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'bots_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة البوتات'});
 res.set('Cache-Control','no-store');res.json({ok:true,bots:normalizedBotSettings(db.botSettings)});
});
app.put('/api/admin/bots',requireAdmin,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'bots_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة البوتات'});
 const b=req.body?.bots;if(!b||typeof b!=='object'||Array.isArray(b))return res.status(400).json({error:'إعدادات البوتات غير صالحة'});
 const previous=db.botSettings;db.botSettings=normalizedBotSettings(b);
 try{save()}catch(error){db.botSettings=previous;return res.status(500).json({error:'تعذر حفظ إعدادات البوتات'});}
 io.emit('bots-settings-updated',{at:Date.now()});res.json({ok:true,bots:db.botSettings});
});

// Rank definitions are editable independently from chat UI, buttons and colors.
app.get('/api/admin/ranks' ,requireAdmin,(req,res)=>{const canAssign=isOwner(req.user)||hasPermission(req.user,'rank_assign');const canArt=canManageRankArt(req.user);if(!canAssign&&!canArt)return res.status(403).json({error:'ما عندك صلاحية عرض الرتب أو أشكالها'});const ranks=(db.rankDefinitions||[]).filter(r=>RANK_PERMISSION_PROFILES.includes(r.id)).slice().sort((a,b)=>Number(b.level)-Number(a.level)).map(r=>{const item={...r};if(!canAssign)delete item.permissions;return item;});res.json({appVersion:require('./package.json').version||'unknown',permissionSchemaVersion:10,permissionKeys:canAssign?ALL_PERMISSION_KEYS:[],ranks,catalog:canAssign?PERMISSION_CATALOG:{}});});
// Rank definitions are fixed: only the seven built-in ranks can be assigned or permission-edited.
app.get('/api/admin/permissions',requireAdmin,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'permission_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة صلاحيات الرتب'});
 const ranks=Object.fromEntries(RANK_PERMISSION_PROFILES.map(id=>[id,[...(rankDefinition(id)?.permissions||[])].filter(p=>Object.hasOwn(PERMISSION_CATALOG,p))]));
 res.json({appVersion:require('./package.json').version||'unknown',permissionSchemaVersion:10,permissionKeys:ALL_PERMISSION_KEYS,catalog:PERMISSION_CATALOG,defaults:DEFAULT_RANK_PERMISSIONS,ranks,rankIds:RANK_PERMISSION_PROFILES});
});
app.put('/api/admin/permissions',requireAdmin,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'permission_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة صلاحيات الرتب'});
 const rank=String(req.body.rank||'');if(!RANK_PERMISSION_PROFILES.includes(rank))return res.status(400).json({error:'اختر واحدة من الرتب السبع فقط'});
 const definition=rankDefinition(rank);if(!definition)return res.status(404).json({error:'تعريف الرتبة غير موجود'});
 const requested=Array.isArray(req.body.permissions)?req.body.permissions:[];if(requested.some(p=>!Object.hasOwn(PERMISSION_CATALOG,p)))return res.status(400).json({error:'توجد صلاحية غير معروفة'});
 if(!isOwner(req.user)){const own=effectivePermissionsForUser(req.user);if(requested.some(p=>!own.has(p)))return res.status(403).json({error:'لا يمكنك منح صلاحيات أعلى من صلاحياتك الحالية'});}
 const previous=[...(definition.permissions||[])],previousUpdatedAt=definition.updatedAt,hadUpdatedAt=Object.prototype.hasOwnProperty.call(definition,'updatedAt');definition.permissions=[...new Set(requested)];definition.updatedAt=Date.now();
 try{save()}catch(error){definition.permissions=previous;if(hadUpdatedAt)definition.updatedAt=previousUpdatedAt;else delete definition.updatedAt;console.error('Rank permission save failed:',error.message);return res.status(500).json({error:'تعذر حفظ صلاحيات الرتبة؛ لم يتم تطبيق التغيير'});}
 io.emit('permissions-updated',{rank});res.json({ok:true,rank,permissions:definition.permissions});
});
app.get('/api/admin/account-permissions/:name',requireAdmin,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'permission_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة صلاحيات الأعضاء'});
 const n=accountKey(req.params.name),target=getUser(n);if(!target)return res.status(404).json({error:'الحساب المسجل غير موجود'});if(isOwnerName(n))return res.status(403).json({error:'حساب صاحب الموقع محمي'});
 const key=keyName(n),stored=db.accountPermissions?.[key],custom=Array.isArray(stored);
 const inheritedRank=profile(n).rank,definition=rankDefinition(inheritedRank),inherited=[...(definition?.permissions||[])];
 const permissions=custom?[...stored]:inherited;
 res.json({name:n,rank:inheritedRank||'none',customized:custom,permissions,inheritedPermissions:inherited,catalog:PERMISSION_CATALOG});
});
app.put('/api/admin/account-permissions/:name',requireAdmin,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'permission_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة صلاحيات الأعضاء'});
 const n=accountKey(req.params.name);/* permission_manage is an explicit delegated exception here; requested grants are still capped to the actor's own permissions. */const target=getUser(n);if(!target)return res.status(404).json({error:'الحساب المسجل غير موجود'});if(isOwnerName(n))return res.status(403).json({error:'حساب صاحب الموقع محمي'});
 const previousMap=db.accountPermissions,key=keyName(n),nextMap={...(db.accountPermissions||{})};
 if(req.body?.inherit===true){delete nextMap[key];db.accountPermissions=nextMap;try{save();}catch(error){if(previousMap===undefined)delete db.accountPermissions;else db.accountPermissions=previousMap;return res.status(500).json({error:'تعذر إرجاع صلاحيات الرتبة'});}io.emit('permissions-updated',{name:n});return res.json({ok:true,name:n,customized:false,permissions:[...(rankDefinition(profile(n).rank)?.permissions||[])]});}
 const requested=Array.isArray(req.body?.permissions)?req.body.permissions:[];if(requested.some(p=>!Object.hasOwn(PERMISSION_CATALOG,p)))return res.status(400).json({error:'توجد صلاحية غير معروفة'});
 if(!isOwner(req.user)){const own=effectivePermissionsForUser(req.user);if(requested.some(p=>!own.has(p)))return res.status(403).json({error:'لا يمكنك منح صلاحيات أعلى من صلاحياتك الحالية'});}
 nextMap[key]=[...new Set(requested)];db.accountPermissions=nextMap;
 try{save();}catch(error){if(previousMap===undefined)delete db.accountPermissions;else db.accountPermissions=previousMap;return res.status(500).json({error:'تعذر حفظ صلاحيات العضو'});}
 io.emit('permissions-updated',{name:n});res.json({ok:true,name:n,customized:true,permissions:db.accountPermissions[key]});
});
app.get('/api/admin/welcome-messages',requireAdmin,(req,res)=>{if(!hasPermission(req.user,'welcome_manage'))return res.status(403).json({error:'ما عندك صلاحية عرض أو تعديل رسائل الترحيب'});res.json({messages:db.welcomeMessages||[]});});
app.put('/api/admin/welcome-messages',requireAdmin,(req,res)=>{if(!hasPermission(req.user,'welcome_manage'))return res.status(403).json({error:'ما عندك صلاحية تعديل رسائل الترحيب'});try{const raw=Array.isArray(req.body?.messages)?req.body.messages:[];if(raw.length>12)return res.status(400).json({error:'الحد الأعلى 12 رسالة ترحيب'});const messages=[];for(const item of raw){const title=String(item?.title||'').trim().slice(0,80),text=String(item?.text||'').trim().slice(0,1200);if(!title&&!text)continue;if(!text)return res.status(400).json({error:'اكتب نص كل رسالة قبل الحفظ'});messages.push({id:String(item?.id||crypto.randomUUID()).slice(0,80),title:title||'الترحيب',text,enabled:item?.enabled!==false});}const previous=db.welcomeMessages;db.welcomeMessages=messages;try{save()}catch(saveError){db.welcomeMessages=previous;console.error('Welcome messages save failed:',saveError);return res.status(500).json({error:'تعذر حفظ الرسائل على التخزين. تحقق من صلاحية ومسار /data ثم أعد المحاولة.'});}return res.json({ok:true,messages});}catch(error){console.error('Welcome messages update failed:',error);return res.status(500).json({error:'حدث خطأ أثناء معالجة رسائل الترحيب'});}});
app.get('/api/chat-tools',requireAuth,(req,res)=>res.json({shortcuts:(db.chatShortcuts||[]).map(x=>({id:x.id,title:x.title,text:x.text})),smileys:(db.customSmileys||[]).map(x=>({id:x.id,icon:x.icon,name:x.name,shortcut:x.shortcut||''})),gifts:hasPermission(req.user,'gifts')?(db.giftCatalog||[]):[],vipGifts:hasPermission(req.user,'gifts')?(db.vipGiftCatalog||[]):[]}));
app.post('/api/admin/chat-tools/smiley-upload',requireAdmin,uploadSmallImage.single('file'),validateUploadedContent('image'),(req,res)=>{
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
app.put('/api/admin/chat-tools',requireAdmin,(req,res)=>{try{const shortcuts=Array.isArray(req.body?.shortcuts)?req.body.shortcuts:[],smileys=Array.isArray(req.body?.smileys)?req.body.smileys:[];const same=(a,b)=>JSON.stringify(a||[])===JSON.stringify(b||[]);if(!same(shortcuts,db.chatShortcuts||[])&&!hasPermission(req.user,'shortcuts_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة الاختصارات'});if(!same(smileys,db.customSmileys||[])&&!hasPermission(req.user,'smileys_manage'))return res.status(403).json({error:'ما عندك صلاحية إدارة السميلات'});if(shortcuts.length>100)return res.status(400).json({error:'الحد الأعلى 100 اختصار'});if(smileys.length>450)return res.status(400).json({error:'الحد الأعلى 450 سميل'});const cleanShortcuts=[];for(const x of shortcuts){const title=String(x?.title||'').trim().slice(0,50),text=String(x?.text||'').trim().slice(0,500);if(!title&&!text)continue;if(!title||!text)return res.status(400).json({error:'كل اختصار يحتاج اسماً ونصاً'});cleanShortcuts.push({id:String(x.id||crypto.randomUUID()).slice(0,80),title,text});}const cleanSmileys=[];for(const x of smileys){const icon=String(x?.icon||'').trim().slice(0,12000),name=String(x?.name||'').trim().slice(0,40),shortcut=String(x?.shortcut||'').trim().slice(0,24);if(!icon&&!name)continue;if(!icon)return res.status(400).json({error:'رمز السميل مطلوب'});cleanSmileys.push({id:String(x.id||crypto.randomUUID()).slice(0,80),icon,name:name||'سميل',shortcut});}const oldS=db.chatShortcuts,oldM=db.customSmileys;db.chatShortcuts=cleanShortcuts;db.customSmileys=cleanSmileys;try{save()}catch(e){db.chatShortcuts=oldS;db.customSmileys=oldM;throw e;}return res.json({ok:true,shortcuts:cleanShortcuts,smileys:cleanSmileys});}catch(e){console.error('chat-tools save failed:',e);return res.status(500).json({error:'تعذر حفظ الاختصارات والسميلات'});}});
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
function createDatabaseBackupTempFile(snapshot,purpose){
 const tempFile=DB_FILE+'.'+process.pid+'.'+String(purpose||'backup')+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 let fd=null;
 try{
  fd=fs.openSync(tempFile,'wx',0o600);
  writeJsonSync(fd,snapshot,{space:2});
  fs.fsyncSync(fd);
  fs.closeSync(fd);fd=null;
  return tempFile;
 }catch(error){
  if(fd!==null){try{fs.closeSync(fd);}catch(_){}}
  try{fs.unlinkSync(tempFile);}catch(_){}
  throw error;
 }
}
async function* fullBackupTarEntries(){
 let databaseBackupFile='';
 try{
  const snapshot={format:'rimaz-full-backup',version:1,createdAt:new Date().toISOString(),appVersion:require('./package.json').version||'unknown',database:{...db,sessions:{},privateMessages:[]}};
  databaseBackupFile=createDatabaseBackupTempFile(snapshot,'full-backup');
  const databaseStat=fs.statSync(databaseBackupFile);
  yield {name:'database/rimaz-database.json',disk:databaseBackupFile,size:databaseStat.size,mtime:databaseStat.mtimeMs};
  const roots=[['uploads',UP_DIR],['private-media',PRIVATE_MEDIA_DIR]];
  for(const [archiveRoot,diskRoot] of roots){
   const pending=[{disk:diskRoot,archive:archiveRoot}];
   while(pending.length){const current=pending.pop();let items=[];try{items=fs.readdirSync(current.disk,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;continue;}
    for(const item of items){const disk=path.join(current.disk,item.name),archive=current.archive+'/'+item.name;if(item.isSymbolicLink())continue;if(item.isDirectory()){pending.push({disk,archive});continue;}if(!item.isFile())continue;const stat=fs.statSync(disk);yield {name:archive,disk,size:stat.size,mtime:stat.mtimeMs};}
   }
  }
 }finally{
  if(databaseBackupFile){try{fs.unlinkSync(databaseBackupFile);}catch(error){if(error.code!=='ENOENT')console.error('Full backup temporary database cleanup failed:',error.message);}}
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
function subscriptionAudit(actor,action,target,details='',route='/api/admin/subscriptions'){const previous=db.adminAuditLogs;db.adminAuditLogs=[{id:crypto.randomUUID(),at:Date.now(),actor:String(actor?.name||'إدارة').slice(0,32),method:'ADMIN',path:route,status:200,target:String(target||'').slice(0,40),action:String(action||'').slice(0,80),details:String(details||'').slice(0,180)},...(Array.isArray(previous)?previous:[])].slice(0,500);}
app.get('/api/admin/subscriptions',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!canManageSubscriptions(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة الاشتراكات'});res.set('Cache-Control','no-store');res.json({plans:db.subscriptionPlans||[],subscriptions:(db.subscriptions||[]).slice().sort((a,b)=>Number(b.updatedAt||b.createdAt)-Number(a.updatedAt||a.createdAt)),users:Object.keys(db.users||{}).map(name=>({name,subscription:(db.subscriptions||[]).find(x=>keyName(x.name)===keyName(name)&&x.status==='active'&&Number(x.expiresAt)>Date.now())||null}))});});});
app.post('/api/admin/subscriptions/plans',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!canManageSubscriptions(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة الخطط'});const b=req.body||{},name=String(b.name||'').trim().slice(0,50),days=Math.max(1,Math.min(3650,Math.floor(Number(b.days)||0)));if(name.length<2||!days)return res.status(400).json({error:'اسم الخطة والمدة بالأيام مطلوبان'});const id=String(b.id||'').trim()||('plan_'+crypto.randomBytes(6).toString('hex')),previousPlans=db.subscriptionPlans,previousAudit=db.adminAuditLogs;db.subscriptionPlans=(db.subscriptionPlans||[]).map(x=>({...x}));let plan=db.subscriptionPlans.find(x=>x.id===id);if(!plan){plan={id,createdAt:Date.now()};db.subscriptionPlans.push(plan);}Object.assign(plan,{name,days,description:String(b.description||'').trim().slice(0,180),priceLabel:String(b.priceLabel||'').trim().slice(0,40),enabled:b.enabled!==false,grantsVip:b.grantsVip!==false,updatedAt:Date.now()});subscriptionAudit(req.user,'حفظ خطة اشتراك',id,name+' · '+days+' يوم');try{save();}catch(error){if(previousPlans===undefined)delete db.subscriptionPlans;else db.subscriptionPlans=previousPlans;if(previousAudit===undefined)delete db.adminAuditLogs;else db.adminAuditLogs=previousAudit;return res.status(500).json({error:'تعذر حفظ الخطة'});}res.json({ok:true,plan});});});
app.delete('/api/admin/subscriptions/plans/:id',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!canManageSubscriptions(req.user))return res.status(403).json({error:'ما عندك صلاحية حذف الخطط'});const previousPlans=db.subscriptionPlans,previousAudit=db.adminAuditLogs,plan=(db.subscriptionPlans||[]).find(x=>x.id===req.params.id);if(!plan)return res.status(404).json({error:'الخطة غير موجودة'});db.subscriptionPlans=(db.subscriptionPlans||[]).filter(x=>x.id!==req.params.id);subscriptionAudit(req.user,'حذف خطة اشتراك',plan.id,plan.name);try{save();}catch(error){if(previousPlans===undefined)delete db.subscriptionPlans;else db.subscriptionPlans=previousPlans;if(previousAudit===undefined)delete db.adminAuditLogs;else db.adminAuditLogs=previousAudit;return res.status(500).json({error:'تعذر حذف الخطة'});}res.json({ok:true});});});
app.post('/api/admin/subscriptions/assign',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!canManageSubscriptions(req.user))return res.status(403).json({error:'ما عندك صلاحية منح الاشتراكات'});const name=cleanName(req.body?.name||''),user=getUser(name),plan=(db.subscriptionPlans||[]).find(x=>x.id===String(req.body?.planId||'')&&x.enabled!==false);if(!user)return res.status(404).json({error:'الحساب المسجل غير موجود'});if(isOwnerName(name))return res.status(403).json({error:'حساب صاحب الموقع محمي'});if(!plan)return res.status(404).json({error:'خطة الاشتراك غير موجودة أو متوقفة'});const days=Math.max(1,Math.min(3650,Math.floor(Number(req.body?.days)||Number(plan.days)||0)));if(!days)return res.status(400).json({error:'مدة الاشتراك غير صحيحة'});const previousSubscriptions=db.subscriptions,previousAudit=db.adminAuditLogs,hadProfile=Object.prototype.hasOwnProperty.call(db.profiles,name),originalProfile=db.profiles[name],profileSnapshot=originalProfile?{...originalProfile}:null;db.subscriptions=(db.subscriptions||[]).map(x=>({...x,history:Array.isArray(x.history)?x.history.slice():[]}));const key=keyName(name),now=Date.now();let sub=db.subscriptions.find(x=>keyName(x.name)===key&&x.status==='active'&&Number(x.expiresAt)>now);if(!sub){sub={id:crypto.randomUUID(),name,createdAt:now,history:[]};db.subscriptions.push(sub);}const start=Math.max(now,Number(sub.expiresAt)||now);sub.planId=plan.id;sub.planName=plan.name;sub.startsAt=sub.startsAt||now;sub.expiresAt=start+days*86400000;sub.status='active';sub.updatedAt=now;sub.updatedBy=req.user.name;sub.history=Array.isArray(sub.history)?sub.history:[];sub.history.unshift({at:now,action:'grant-or-renew',days,plan:plan.name,by:req.user.name});sub.history=sub.history.slice(0,100);const memberProfile=profile(name);if(plan.grantsVip!==false){memberProfile.vipUntil=sub.expiresAt;memberProfile.vipSubscriptionId=sub.id;memberProfile.vipGrantedAt=now;memberProfile.vipGrantedBy=req.user.name;}else if(memberProfile.vipSubscriptionId===sub.id){delete memberProfile.vipSubscriptionId;delete memberProfile.vipUntil;delete memberProfile.vipGrantedAt;delete memberProfile.vipGrantedBy;}subscriptionAudit(req.user,'منح أو تجديد اشتراك',name,plan.name+' · '+days+' يوم');try{save();}catch(error){if(previousSubscriptions===undefined)delete db.subscriptions;else db.subscriptions=previousSubscriptions;if(hadProfile)db.profiles[name]=originalProfile;else delete db.profiles[name];if(originalProfile&&profileSnapshot){for(const key of Object.keys(originalProfile))delete originalProfile[key];Object.assign(originalProfile,profileSnapshot);}if(previousAudit===undefined)delete db.adminAuditLogs;else db.adminAuditLogs=previousAudit;return res.status(500).json({error:'تعذر حفظ الاشتراك'});}res.json({ok:true,subscription:sub});});});
app.post('/api/admin/subscriptions/cancel',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!canManageSubscriptions(req.user))return res.status(403).json({error:'ما عندك صلاحية إلغاء الاشتراكات'});const name=cleanName(req.body?.name||''),subExists=(db.subscriptions||[]).find(x=>keyName(x.name)===keyName(name)&&x.status==='active');if(!subExists)return res.status(404).json({error:'لا يوجد اشتراك فعال لهذا الحساب'});if(isOwnerName(name))return res.status(403).json({error:'حساب صاحب الموقع محمي'});const previousSubscriptions=db.subscriptions,previousAudit=db.adminAuditLogs,hadProfile=Object.prototype.hasOwnProperty.call(db.profiles,name),originalProfile=db.profiles[name],profileSnapshot=originalProfile?{...originalProfile}:null;db.subscriptions=(db.subscriptions||[]).map(x=>({...x,history:Array.isArray(x.history)?x.history.slice():[]}));const sub=db.subscriptions.find(x=>x.id===subExists.id);sub.status='cancelled';sub.expiresAt=Date.now();sub.updatedAt=Date.now();sub.updatedBy=req.user.name;sub.history=Array.isArray(sub.history)?sub.history:[];sub.history.unshift({at:Date.now(),action:'cancel',by:req.user.name});sub.history=sub.history.slice(0,100);const memberProfile=profile(name);if(memberProfile.vipSubscriptionId===sub.id){delete memberProfile.vipSubscriptionId;delete memberProfile.vipUntil;delete memberProfile.vipGrantedAt;delete memberProfile.vipGrantedBy;}subscriptionAudit(req.user,'إلغاء اشتراك',name,sub.planName||'');try{save();}catch(error){if(previousSubscriptions===undefined)delete db.subscriptions;else db.subscriptions=previousSubscriptions;if(hadProfile)db.profiles[name]=originalProfile;else delete db.profiles[name];if(originalProfile&&profileSnapshot){for(const key of Object.keys(originalProfile))delete originalProfile[key];Object.assign(originalProfile,profileSnapshot);}if(previousAudit===undefined)delete db.adminAuditLogs;else db.adminAuditLogs=previousAudit;return res.status(500).json({error:'تعذر إلغاء الاشتراك'});}res.json({ok:true});});});

// Campaign ads: image uploads are stored in uploads; campaign scheduling is enforced by the public feed.
function canManageAds(user){return !!(user&&(isOwner(user)||hasPermission(user,'ads_manage')));}
app.get('/api/admin/ads',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!canManageAds(req.user))return res.status(403).json({error:'ما عندك صلاحية إدارة الحملات الإعلانية'});res.set('Cache-Control','no-store');res.json({items:db.adCampaigns||[]});});});
app.post('/api/admin/ads',requireAdmin,(req,res,next)=>requireAuth(req,res,()=>canManageAds(req.user)?next():res.status(403).json({error:'ما عندك صلاحية إدارة الإعلانات'})),uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{const b=req.body||{},title=String(b.title||'').trim().slice(0,60),url=String(b.url||'').trim().slice(0,500),startsAt=b.startsAt?Date.parse(b.startsAt):Date.now(),endsAt=b.endsAt?Date.parse(b.endsAt):0;if(title.length<2){removeUploadedFile(req.file);return res.status(400).json({error:'عنوان الإعلان مطلوب'});}if(url&&!/^https?:\/\//i.test(url)){removeUploadedFile(req.file);return res.status(400).json({error:'رابط الإعلان يجب أن يبدأ بـ https:// أو http://'});}if(!Number.isFinite(startsAt)|| (endsAt&&(!Number.isFinite(endsAt)||endsAt<=startsAt))){removeUploadedFile(req.file);return res.status(400).json({error:'مدة الحملة غير صحيحة'});}const image=req.file?'/uploads/'+req.file.filename:String(b.image||'');if(!image){removeUploadedFile(req.file);return res.status(400).json({error:'ارفع صورة الإعلان أولاً'});}const item={id:crypto.randomUUID(),title,url,image,startsAt,endsAt,enabled:b.enabled!=='false',createdAt:Date.now(),createdBy:req.user.name,impressions:0,clicks:0},previousCampaigns=db.adCampaigns,previousAudit=db.adminAuditLogs;db.adCampaigns=[item,...(Array.isArray(previousCampaigns)?previousCampaigns:[])];subscriptionAudit(req.user,'إنشاء حملة إعلانية',item.id,title,'/api/admin/ads');try{save();}catch(error){if(previousCampaigns===undefined)delete db.adCampaigns;else db.adCampaigns=previousCampaigns;if(previousAudit===undefined)delete db.adminAuditLogs;else db.adminAuditLogs=previousAudit;removeUploadedFile(req.file);return res.status(500).json({error:'تعذر حفظ الحملة'});}res.json({ok:true,item});});
app.patch('/api/admin/ads/:id',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!canManageAds(req.user))return res.status(403).json({error:'ما عندك صلاحية تعديل الإعلانات'});const previousCampaigns=db.adCampaigns,previousAudit=db.adminAuditLogs;db.adCampaigns=(db.adCampaigns||[]).map(x=>x.id===req.params.id?{...x}:x);const item=db.adCampaigns.find(x=>x.id===req.params.id);if(!item){if(previousCampaigns===undefined)delete db.adCampaigns;else db.adCampaigns=previousCampaigns;return res.status(404).json({error:'الحملة غير موجودة'});}if(req.body?.enabled!==undefined)item.enabled=req.body.enabled===true;if(req.body?.title!==undefined)item.title=String(req.body.title).trim().slice(0,60);item.updatedAt=Date.now();subscriptionAudit(req.user,'تعديل حملة إعلانية',item.id,item.title,'/api/admin/ads');try{save();}catch(error){if(previousCampaigns===undefined)delete db.adCampaigns;else db.adCampaigns=previousCampaigns;if(previousAudit===undefined)delete db.adminAuditLogs;else db.adminAuditLogs=previousAudit;return res.status(500).json({error:'تعذر حفظ الحملة'});}res.json({ok:true,item});});});
app.delete('/api/admin/ads/:id',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!canManageAds(req.user))return res.status(403).json({error:'ما عندك صلاحية حذف الإعلانات'});const previousCampaigns=db.adCampaigns,previousAudit=db.adminAuditLogs,item=(db.adCampaigns||[]).find(x=>x.id===req.params.id);if(!item)return res.status(404).json({error:'الحملة غير موجودة'});db.adCampaigns=(db.adCampaigns||[]).filter(x=>x.id!==req.params.id);subscriptionAudit(req.user,'حذف حملة إعلانية',item.id,item.title,'/api/admin/ads');try{save();}catch(error){if(previousCampaigns===undefined)delete db.adCampaigns;else db.adCampaigns=previousCampaigns;if(previousAudit===undefined)delete db.adminAuditLogs;else db.adminAuditLogs=previousAudit;return res.status(500).json({error:'تعذر حذف الحملة'});}if(item.image?.startsWith('/uploads/'))removePublicUploadIfUnreferenced(item.image);res.json({ok:true});});});
app.get('/api/public/ads',(req,res)=>{const now=Date.now(),items=(db.adCampaigns||[]).filter(x=>x.enabled!==false&&Number(x.startsAt||0)<=now&&(!Number(x.endsAt)||Number(x.endsAt)>now)).slice(0,5).map(({id,title,url,image})=>({id,title,url,image}));res.set('Cache-Control','public, max-age=30');res.json({items});});

// Granular control center is separate from site identity/security and is permission-gated.
app.get('/api/admin/control-center',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!isOwner(req.user)&&!hasPermission(req.user,'control_center_manage'))return res.status(403).json({error:'ما عندك صلاحية مركز التحكم'});res.set('Cache-Control','no-store');res.json({settings:db.siteSettings||{},modules:{...DEFAULT_SITE_MODULES,...(db.siteSettings?.modules||{})}});});});
app.put('/api/admin/control-center',requireAdmin,(req,res)=>{requireAuth(req,res,()=>{if(!isOwner(req.user)&&!hasPermission(req.user,'control_center_manage'))return res.status(403).json({error:'ما عندك صلاحية مركز التحكم'});const allowed=Object.keys(DEFAULT_SITE_MODULES),next={...(db.siteSettings?.modules||DEFAULT_SITE_MODULES)},previousSettings=db.siteSettings,previousAudit=db.adminAuditLogs;for(const key of allowed)if(Object.prototype.hasOwnProperty.call(req.body?.modules||{},key))next[key]=req.body.modules[key]===true;db.siteSettings={...(db.siteSettings||{}),modules:next};subscriptionAudit(req.user,'تغيير وحدات مركز التحكم','',Object.entries(next).map(([k,v])=>k+':'+(v?'on':'off')).join(', '),'/api/admin/control-center');try{save();}catch(error){if(previousSettings===undefined)delete db.siteSettings;else db.siteSettings=previousSettings;if(previousAudit===undefined)delete db.adminAuditLogs;else db.adminAuditLogs=previousAudit;return res.status(500).json({error:'تعذر حفظ مركز التحكم'});}io.emit('site-settings-changed',{modules:next});res.json({ok:true,modules:next});});});

// Existing site settings, login history and backup endpoints.
app.get('/api/public/settings',(req,res)=>{const s=db.siteSettings||{};res.set('Cache-Control','no-store');res.json({siteName:s.siteName||'دردشة ريماز عراقية',tagline:s.tagline||'',notice:s.notice||'',allowRegistration:s.allowRegistration!==false,allowGuests:s.allowGuests!==false,modules:{...(s.modules||{})}});});
app.get('/api/admin/site-settings',requireAdmin,(req,res)=>{if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية إدارة الموقع'});res.set('Cache-Control','no-store');res.json({settings:db.siteSettings||{}});});
app.put('/api/admin/site-settings',requireAdmin,(req,res)=>{if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية إدارة الموقع'});const b=req.body||{};const modules={...(db.siteSettings?.modules||DEFAULT_SITE_MODULES)};for(const key of Object.keys(DEFAULT_SITE_MODULES))if(Object.prototype.hasOwnProperty.call(b.modules||{},key))modules[key]=b.modules[key]===true;const next={siteName:String(b.siteName||'').trim().slice(0,60),tagline:String(b.tagline||'').trim().slice(0,300),notice:String(b.notice||'').trim().slice(0,300),allowRegistration:b.allowRegistration!==false,allowGuests:b.allowGuests!==false,modules};if(!next.siteName)return res.status(400).json({error:'اسم الموقع مطلوب'});const old=db.siteSettings,oldAudit=Array.isArray(db.adminAuditLogs)?db.adminAuditLogs.slice():db.adminAuditLogs;db.siteSettings=next;db.adminAuditLogs=db.adminAuditLogs||[];db.adminAuditLogs.unshift({id:crypto.randomUUID(),at:Date.now(),actor:String(req.user.name||'المالك').slice(0,32),method:'PUT',path:'/api/admin/site-settings',status:200});db.adminAuditLogs=db.adminAuditLogs.slice(0,500);try{save()}catch(e){if(old===undefined)delete db.siteSettings;else db.siteSettings=old;if(oldAudit===undefined)delete db.adminAuditLogs;else db.adminAuditLogs=oldAudit;return res.status(500).json({error:'تعذر حفظ إعدادات الموقع'});}io.emit('site-settings-changed',{siteName:next.siteName,tagline:next.tagline,notice:next.notice,modules:next.modules});res.json({ok:true,settings:next});});
app.get('/api/admin/login-history',requireAdmin,(req,res)=>{if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية عرض سجل الدخول'});res.set('Cache-Control','no-store');res.json({items:(db.loginHistory||[]).slice(0,500),total:(db.loginHistory||[]).length});});
app.get('/api/admin/health',requireAdmin,(req,res)=>{if(!isOwner(req.user)&&!hasPermission(req.user,'health_view')&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية فحص النظام'});const walk=(dir)=>{let files=0,bytes=0;try{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory()){const child=walk(full);files+=child.files;bytes+=child.bytes;}else if(entry.isFile()){const st=fs.statSync(full);files++;bytes+=st.size;}}}catch{}return {files,bytes};};let dbBytes=0;try{dbBytes=fs.statSync(DB_FILE).size}catch{}const uploads=walk(UP_DIR),memory=process.memoryUsage();res.set('Cache-Control','no-store');res.json({appVersion:require('./package.json').version||'unknown',node:process.version,uptimeSeconds:Math.floor(process.uptime()),dbBytes,uploads,heapUsed:memory.heapUsed,heapTotal:memory.heapTotal,external:memory.external,arrayBuffers:memory.arrayBuffers||0,rss:memory.rss,online:getOnlineUsers(req.user).length,rooms:(db.rooms||[]).length,modules:{...DEFAULT_SITE_MODULES,...(db.siteSettings?.modules||{})}});});
app.get('/api/admin/backup/database',requireAdmin,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية النسخ الاحتياطي'});
 let backupFile='';
 try{
  const snapshot={format:'rimaz-database-backup',version:1,createdAt:new Date().toISOString(),appVersion:require('./package.json').version||'unknown',database:{...db,sessions:{},privateMessages:[]}};
  backupFile=createDatabaseBackupTempFile(snapshot,'database-backup');
  const stream=fs.createReadStream(backupFile);
  const cleanup=()=>{if(!backupFile)return;const file=backupFile;backupFile='';try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')console.error('Database backup temporary file cleanup failed:',error.message);}};
  stream.once('close',cleanup);
  stream.once('error',error=>{cleanup();console.error('Database backup stream failed:',error);if(!res.headersSent)res.status(500).json({error:'تعذر إنشاء النسخة الاحتياطية'});else res.destroy(error);});
  res.once('close',()=>{if(!stream.destroyed)stream.destroy();});
  res.set('Cache-Control','no-store, no-cache, must-revalidate');
  res.set('Content-Type','application/json; charset=utf-8');
  res.set('Content-Disposition','attachment; filename="rimaz-database-backup-'+new Date().toISOString().slice(0,10)+'.json"');
  stream.pipe(res);
 }catch(e){
  if(backupFile){try{fs.unlinkSync(backupFile);}catch(_){}}
  console.error('Database backup failed:',e);
  if(!res.headersSent)res.status(500).json({error:'تعذر إنشاء النسخة الاحتياطية'});
  else res.destroy(e);
 }
});
app.get('/api/admin/backup/full',requireAdmin,(req,res)=>{if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية النسخة الاحتياطية الكاملة'});res.set('Cache-Control','no-store, no-cache, must-revalidate');res.set('Content-Type','application/gzip');res.set('Content-Disposition',`attachment; filename=\"rimaz-full-backup-${new Date().toISOString().slice(0,10)}.tar.gz\"`);const source=Readable.from(fullBackupTar()),archive=zlib.createGzip({level:6});pipeline(source,archive,res,error=>{if(error&&error.code!=='ERR_STREAM_PREMATURE_CLOSE')console.error('Full backup pipeline failed:',error);});});
app.post('/api/admin/restore/database/preview',requireAdmin,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية استعادة النسخة'});
 restoreUpload.single('backup')(req,res,error=>{
  if(error)return res.status(400).json({error:error.code==='LIMIT_FILE_SIZE'?'حجم ملف النسخة أكبر من 20MB':(error.message||'تعذر قراءة ملف النسخة')});
  if(!req.file)return res.status(400).json({error:'اختر ملف نسخة JSON أولاً'});
  const uploadedFile=req.file;
  try{
   try{fs.chmodSync(uploadedFile.path,0o600);}catch(_){}
   purgeExpiredDatabaseRestores();
   const checked=validateDatabaseRestoreFile(fs.readFileSync(uploadedFile.path,'utf8'));
   const protectedOwnerName=process.env.OWNER_NAME||'owner';if(!restoreContainsOwner(checked.clean,protectedOwnerName))throw new Error('النسخة لا تحتوي حساب صاحب الموقع؛ رُفضت لحماية إمكانية الدخول للإدارة');
   for(const [oldToken,oldPreview] of pendingDatabaseRestores)if(oldPreview.owner===keyName(req.user.name))discardDatabaseRestorePreview(oldToken,oldPreview);
   if(pendingDatabaseRestores.size>=MAX_PENDING_DATABASE_RESTORES)throw new Error('توجد معاينات استعادة أخرى قيد الانتظار؛ أكمل إحداها أو انتظر انتهاء صلاحيتها');
   const token=crypto.randomBytes(32).toString('hex');
   pendingDatabaseRestores.set(token,{filePath:uploadedFile.path,summary:checked.summary,owner:keyName(req.user.name),expiresAt:Date.now()+5*60*1000});
   uploadedFile.path='';
   res.set('Cache-Control','no-store');
   res.json({ok:true,token,expiresInSeconds:300,summary:checked.summary,warning:'سيتم استبدال بيانات قاعدة البيانات الحالية. الجلسات النشطة والرسائل الخاصة المؤقتة لن تُستعاد.'});
  }catch(e){removeUploadedFile(uploadedFile);res.status(400).json({error:e.message||'ملف النسخة غير صالح'});}
 });
});
app.post('/api/admin/restore/database/confirm',requireAdmin,(req,res)=>{
 if(!isOwner(req.user)&&!hasPermission(req.user,'site_admin'))return res.status(403).json({error:'ما عندك صلاحية استعادة النسخة'});
 purgeExpiredDatabaseRestores();
 const token=String(req.body?.token||''),confirmation=String(req.body?.confirmation||'');
 const pending=pendingDatabaseRestores.get(token);
 if(!pending||pending.owner!==keyName(req.user.name))return res.status(400).json({error:'انتهت صلاحية المعاينة؛ ارفع الملف مرة ثانية'});
 if(confirmation!=='استعادة ريماز')return res.status(400).json({error:'اكتب عبارة استعادة ريماز للتأكيد'});
 const previous=db;
 let recoveryFile='';
 let recoveryReady=false;
 try{
  const checked=validateDatabaseRestoreFile(fs.readFileSync(pending.filePath,'utf8'));
  const protectedOwnerName=process.env.OWNER_NAME||'owner';if(!restoreContainsOwner(checked.clean,protectedOwnerName))throw new Error('النسخة لا تحتوي حساب صاحب الموقع؛ رُفضت لحماية إمكانية الدخول للإدارة');
  if(fs.existsSync(DB_FILE)){
   recoveryFile=DB_FILE+'.pre-restore-'+Date.now()+'.json';
   // Copy disk-to-disk so the live database is never duplicated into a full RAM Buffer.
   try{
    fs.copyFileSync(DB_FILE,recoveryFile,fs.constants.COPYFILE_EXCL);
    fs.chmodSync(recoveryFile,0o600);
    const recoveryFd=fs.openSync(recoveryFile,'r+');
    try{fs.fsyncSync(recoveryFd);}finally{fs.closeSync(recoveryFd);}
   }catch(recoveryError){try{fs.unlinkSync(recoveryFile);}catch(_){}throw recoveryError;}
   try{const recoveryDirFd=fs.openSync(DATA_DIR,'r');try{fs.fsyncSync(recoveryDirFd);}finally{fs.closeSync(recoveryDirFd);}}catch(syncError){console.error('Recovery database directory sync unavailable:',syncError.message);}
   recoveryReady=true;
  }
  db=checked.clean;
  db.sessions={};db.privateMessages=[];
  db.adminAuditLogs=Array.isArray(db.adminAuditLogs)?db.adminAuditLogs:[];
  db.adminAuditLogs.unshift({id:crypto.randomUUID(),at:Date.now(),actor:String(req.user.name||'المالك').slice(0,32),method:'POST',path:'/api/admin/restore/database/confirm',status:200});
  db.adminAuditLogs=db.adminAuditLogs.slice(0,500);
  save();
  discardDatabaseRestorePreview(token,pending);
  // Invalidate every pre-restore in-memory identity before disconnect callbacks run.
  // Otherwise the old sessions Map can continue authenticating stale session IDs during
  // the normal disconnect grace period, even though the restored database has no sessions.
  for(const timer of sessionDisconnectTimers.values())clearTimeout(timer);
  sessionDisconnectTimers.clear();
  for(const timer of privateDisconnectTimers.values())clearTimeout(timer);
  privateDisconnectTimers.clear();
  sessions.clear();
  socketUsers.clear();
  roomSockets.clear();
  activeCallPairs.clear();
  activeVoicePairs.clear();
  botMessageWindows.clear();privateMessageWindows.clear();callSignalWindows.clear();voiceSignalWindows.clear();welcomeSentSessions.clear();
  voiceSpeakers.clear();
  privateMediaPlaybackTickets.clear();
  try{io.disconnectSockets(true);}catch(e){console.warn('Could not disconnect restored sessions:',e.message);}
  res.json({ok:true,message:'تمت استعادة قاعدة البيانات. تم إنهاء الجلسات النشطة.',recoveryFile:path.basename(recoveryFile||DB_FILE)});
 }catch(e){
  if(recoveryFile&&!recoveryReady){try{fs.unlinkSync(recoveryFile);}catch(_){}}
  db=previous;
  try{save();}catch(rollbackError){console.error('Database restore rollback failed:',rollbackError);}
  res.status(500).json({error:'فشلت الاستعادة وتمت محاولة الرجوع للبيانات السابقة. احتفظ بنسخة الاسترداد قبل أي محاولة أخرى.'});
 }
});
app.get('/api/admin/data',requireAdmin,(req,res)=>{
 const allowed=Object.keys(PERMISSION_CATALOG).some(p=>hasPermission(req.user,p));
 if(!allowed)return res.status(403).json({error:'ما عندك صلاحية لهذا القسم'});
 const presence=buildPresenceContext();
 const visibleOnline=new Map(getOnlineUsers(req.user,presence).map(x=>[keyName(x.name),x]));
 const registeredAccountKeys=new Set(Object.keys(db.users||{}).map(keyName));
 const seenAdminAccountKeys=new Set();
 const payload={users:Object.entries(db.users).filter(([name])=>{const k=keyName(name);if(seenAdminAccountKeys.has(k))return false;seenAdminAccountKeys.add(k);return true;}).filter(([name])=>!hasInvisibleActiveSession(name,req.user,presence)).sort(([a],[b])=>Number(isOwnerName(b))-Number(isOwnerName(a))).map(([name,u])=>({name,type:'member',likes:Number(u.likes)||0,points:Number(u.points)||0,level:level(Number(u.likes)||0),role:isOwnerName(name)?'owner':'member',vip:vipActive(name),online:visibleOnline.has(keyName(name)),room:visibleOnline.get(keyName(name))?.room||'',profile:profile(name)})),guests:Object.entries(db.guests).filter(([name])=>{const k=keyName(name);if(registeredAccountKeys.has(k)||seenAdminAccountKeys.has(k))return false;seenAdminAccountKeys.add(k);return true;}).sort(([a],[b])=>Number(isOwnerName(b))-Number(isOwnerName(a))).map(([name,g])=>({name,type:'guest',likes:Number(g.likes)||0,points:Number(g.points)||0,level:level(Number(g.likes)||0),role:isOwnerName(name)?'owner':'member',online:visibleOnline.has(keyName(name)),room:visibleOnline.get(keyName(name))?.room||'',profile:profile(name)})).filter(x=>x.online),rooms:db.rooms.map(r=>{const {passwordHash,...safe}=r;return {...safe,locked:!!passwordHash,online:onlineInRoom(r.id,req.user,presence)};}),announcements:(db.announcements||[]).slice(0,100),messages:db.messages.slice(-100).reverse(),bans:Object.entries(db.roomBans||{}).flatMap(([room,items])=>(items||[]).map(x=>({room,name:typeof x==='string'?x:x.name,until:typeof x==='string'?null:x.until}))),mutes:Object.entries(db.roomMutes||{}).flatMap(([room,items])=>(items||[]).map(name=>({room,name}))),globalBans:Object.values(db.globalBans||{}).filter(x=>Number(x.until)>Date.now()),globalIpBans:Object.values(db.globalIpBans||{}).filter(x=>Number(x.until)>Date.now()),rankAudit:(db.rankAudit||[]).slice(0,200),adminAuditLogs:(db.adminAuditLogs||[]).slice(0,200),chatFilter:db.chatFilter||{enabled:false,words:[]},stats:{registeredUsers:Object.keys(db.users||{}).length,knownGuests:Object.keys(db.guests||{}).length,onlineUsers:getOnlineUsers(req.user,presence).length,rooms:(db.rooms||[]).length,publicMessages:(db.messages||[]).length,privateMessages:(db.privateMessages||[]).length,wallPosts:(db.wall||[]).length,adminOperations:(db.adminAuditLogs||[]).length,rankChanges:(db.rankAudit||[]).length},rankDefinitions:(db.rankDefinitions||[]).filter(r=>RANK_PERMISSION_PROFILES.includes(r.id)).slice().sort((a,b)=>Number(b.level)-Number(a.level)),myPermissions:Object.keys(PERMISSION_CATALOG).filter(permission=>hasPermission(req.user,permission)),wallEnabled:db.wallEnabled!==false,wallCount:(db.wall||[]).length,giftCatalog:Array.isArray(db.giftCatalog)?db.giftCatalog:[],vipGiftCatalog:Array.isArray(db.vipGiftCatalog)?db.vipGiftCatalog:[],chatShortcuts:db.chatShortcuts||[],customSmileys:db.customSmileys||[] };
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
app.post('/api/rooms',requireAuth,(req,res)=>{const name=cleanName(req.body.name).slice(0,40),desc=String(req.body.desc||'غرفة جديدة').trim().slice(0,160),kind=req.body.kind==='voice'?'voice':'public';if(name.length<2)return res.status(400).json({error:'اسم الغرفة لازم يكون حرفين على الأقل'});if(db.rooms.some(r=>keyName(r.name)===keyName(name)))return res.status(409).json({error:'اسم الغرفة مستخدم بالفعل'});if(db.rooms.length>=250)return res.status(400).json({error:'وصل الموقع إلى الحد الأعلى للغرف حالياً'});const id='r_'+crypto.randomBytes(5).toString('hex');const room={id,name,desc:desc||'غرفة جديدة',kind,capacity:Math.max(2,Math.min(200,Number(req.body.capacity)||50)),mics:kind==='voice'?Math.max(1,Math.min(20,Number(req.body.mics)||5)):0,owner:req.user.name,created:Date.now()};db.rooms.push(room);try{save()}catch(err){db.rooms=db.rooms.filter(x=>x.id!==id);console.error('Public room creation save failed:',err);return res.status(500).json({error:'تعذر حفظ الغرفة على السيرفر. تحقق من صلاحية مجلد البيانات ثم أعد المحاولة.'})}emitState();return res.json({ok:true,id,room});});
app.post('/api/admin/room',requireAdmin,(req,res)=>{const name=cleanName(req.body.name).slice(0,40),kind=req.body.kind==='voice'?'voice':req.body.kind==='private'?'private':'public';if(name.length<2)return res.status(400).json({error:'اسم الغرفة لازم يكون حرفين على الأقل'});if(db.rooms.length>=250)return res.status(400).json({error:'وصل الموقع إلى الحد الأعلى للغرف حالياً'});if(db.rooms.some(r=>keyName(r.name)===keyName(name)))return res.status(409).json({error:'اسم الغرفة مستخدم بالفعل'});const id='r_'+crypto.randomBytes(5).toString('hex');const room={id,name,desc:String(req.body.desc||'غرفة جديدة').trim().slice(0,160),kind,capacity:Math.max(2,Math.min(200,Number(req.body.capacity)||50)),mics:kind==='voice'?Math.max(1,Math.min(20,Number(req.body.mics)||5)):0,owner:req.user.name,created:Date.now()};db.rooms.push(room);try{save()}catch(error){db.rooms=db.rooms.filter(item=>item.id!==id);console.error('Admin room creation save failed:',error);return res.status(500).json({error:'تعذر حفظ الغرفة على السيرفر'})}emitState();return res.json({ok:true,id,room});});
app.post('/api/admin/room/:id/lock',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const password=String(req.body.password||'');if(password.length<1)return res.status(400).json({error:'اكتب باسورد الغرفة أولاً'});if(password.length>128)return res.status(400).json({error:'الباسورد طويل جداً'});const previous=r.passwordHash;r.passwordHash=bcrypt.hashSync(password,12);try{save()}catch(error){if(previous===undefined)delete r.passwordHash;else r.passwordHash=previous;console.error('Room lock save failed:',error);return res.status(500).json({error:'تعذر حفظ قفل الغرفة'})}emitState();return res.json({ok:true,locked:true});});
app.delete('/api/admin/room/:id/lock',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const previous=r.passwordHash;delete r.passwordHash;try{save()}catch(error){if(previous!==undefined)r.passwordHash=previous;console.error('Room unlock save failed:',error);return res.status(500).json({error:'تعذر حفظ إزالة قفل الغرفة'})}emitState();return res.json({ok:true,locked:false});});
app.post('/api/admin/room/:id/image',requireAdmin,uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r){removeUploadedFile(req.file);return res.status(404).json({error:'الغرفة غير موجودة'});}if(!req.file||!req.file.mimetype.startsWith('image/')){removeUploadedFile(req.file);return res.status(400).json({error:'اختر صورة للغرفة'});}const previous=r.image;r.image='/uploads/'+req.file.filename;try{save()}catch(e){r.image=previous;removeUploadedFile(req.file);console.error('Admin room image save failed:',e.message);return res.status(500).json({error:'تعذر حفظ صورة الغرفة'});}if(previous&&previous.startsWith('/uploads/'))removePublicUploadIfUnreferenced(previous);emitState();res.json({ok:true,image:r.image,room:r});});
app.post('/api/rooms/:id/image',(req,res,next)=>requireAuth(req,res,()=>{const room=db.rooms.find(x=>x.id===req.params.id);if(!room)return res.status(404).json({error:'الغرفة غير موجودة'});const owner=keyName(room.owner||'')===keyName(req.user.name||'');if(!owner&&!isOwner(req.user)&&!hasPermission(req.user,'room_image_manage'))return res.status(403).json({error:'صورة الغرفة يگدر يغيرها منشئ الغرفة أو من يملك صلاحية إدارة صور الغرف'});return next();}),uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r){removeUploadedFile(req.file);return res.status(404).json({error:'الغرفة غير موجودة'});}const owner=keyName(r.owner||'')===keyName(req.user.name||'');if(!owner&&!isOwner(req.user)&&!hasPermission(req.user,'room_image_manage')){removeUploadedFile(req.file);return res.status(403).json({error:'صورة الغرفة يگدر يغيرها منشئ الغرفة أو من يملك صلاحية إدارة صور الغرف'});}if(!req.file||!req.file.mimetype.startsWith('image/'))return res.status(400).json({error:'اختار ملف صورة صالح للغرفة'});const previous=r.image; r.image='/uploads/'+req.file.filename;try{save()}catch(err){r.image=previous;try{fs.unlinkSync(path.join(UP_DIR,req.file.filename))}catch{}console.error('Public room image save failed:',err);return res.status(500).json({error:'تعذر حفظ صورة الغرفة على السيرفر'})}if(previous&&previous.startsWith('/uploads/'))removePublicUploadIfUnreferenced(previous);emitState();return res.json({ok:true,image:r.image,room:r});});
function clearRoomImage(req,res){const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const oldImage=String(r.image||'');delete r.image;try{save()}catch(e){r.image=oldImage;console.error('Room image reset save failed:',e);return res.status(500).json({error:'تعذر حفظ حذف الصورة؛ تحقق من صلاحية التخزين'})}if(oldImage.startsWith('/uploads/'))removePublicUploadIfUnreferenced(oldImage);emitState();return res.json({ok:true,image:null,room:r});}
app.delete('/api/admin/room/:id/image',requireAdmin,clearRoomImage);
// POST fallback for hosting/proxies that block DELETE requests.
app.post('/api/admin/room/:id/image/delete',requireAdmin,clearRoomImage);
app.patch('/api/admin/room/:id',requireAdmin,(req,res)=>{const r=db.rooms.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'الغرفة غير موجودة'});const previous={...r};if(req.body.name!==undefined){const name=cleanName(req.body.name).slice(0,40);if(name.length<2)return res.status(400).json({error:'اسم الغرفة لازم يكون حرفين على الأقل'});if(db.rooms.some(item=>item.id!==r.id&&keyName(item.name)===keyName(name)))return res.status(409).json({error:'اسم الغرفة مستخدم بالفعل'});r.name=name;}if(req.body.desc!==undefined)r.desc=String(req.body.desc).trim().slice(0,160);if(req.body.capacity!==undefined)r.capacity=Math.max(2,Math.min(200,Number(req.body.capacity)||r.capacity));if(req.body.mics!==undefined&&r.kind==='voice')r.mics=Math.max(1,Math.min(20,Number(req.body.mics)||r.mics));try{save()}catch(error){Object.keys(r).forEach(key=>delete r[key]);Object.assign(r,previous);console.error('Room update save failed:',error);return res.status(500).json({error:'تعذر حفظ تعديلات الغرفة'})}emitState();return res.json({ok:true,room:r});});
app.delete('/api/admin/room/:id',requireAdmin,(req,res)=>{if(['public','voice'].includes(req.params.id))return res.status(400).json({error:'الغرفة الأساسية محمية ولا تحذف'});const index=db.rooms.findIndex(r=>r.id===req.params.id);if(index<0)return res.status(404).json({error:'الغرفة غير موجودة'});const [removed]=db.rooms.splice(index,1),oldBans=db.roomBans[req.params.id],oldMutes=db.roomMutes[req.params.id];delete db.roomBans[req.params.id];delete db.roomMutes[req.params.id];try{save()}catch(error){db.rooms.splice(index,0,removed);if(oldBans!==undefined)db.roomBans[req.params.id]=oldBans;if(oldMutes!==undefined)db.roomMutes[req.params.id]=oldMutes;console.error('Room deletion save failed:',error);return res.status(500).json({error:'تعذر حفظ حذف الغرفة'})}clearDeletedRoomRuntime(req.params.id);emitState();return res.json({ok:true});});
app.post('/api/admin/unmute',requireAdmin,(req,res)=>{const room=String(req.body.room||'public'),name=keyName(req.body.name);if(!name)return res.status(400).json({error:'الاسم مطلوب'});if(denyHigherRankTarget(req.user,name,res))return;const had=Object.prototype.hasOwnProperty.call(db.roomMutes,room),previous=db.roomMutes[room];db.roomMutes[room]=(previous||[]).filter(x=>keyName(x)!==name);try{save();}catch(error){if(had)db.roomMutes[room]=previous;else delete db.roomMutes[room];return res.status(500).json({error:'تعذر حفظ رفع الكتم'});}res.json({ok:true});});
function roomAction(type,req,res){
  const room=String(req.body.room||'public'),name=keyName(req.body.name);
  if(!name)return res.status(400).json({error:'الاسم مطلوب'});
  if((isOwnerName(name)||isOwner({name,role:(getUser(name)||getGuest(name)||{}).role}))&&!isOwner(req.user)){notifyOwnerProtectedAttempt(req.user,type==='roomBans'?'حظرك في الغرفة':'كتمك في الغرفة');return res.status(403).json({error:'حساب صاحب الموقع محمي ولا يحق للإداري اتخاذ إجراء عليه'});}
  if(denyHigherRankTarget(req.user,name,res))return;
  const hadRoom=Object.prototype.hasOwnProperty.call(db[type],room);
  const previousRoom=Array.isArray(db[type][room])?db[type][room].slice():db[type][room];
  db[type][room]=db[type][room]||[];
  if(type==='roomMutes'){
    if(!db[type][room].includes(name))db[type][room].push(name);
  }else if(type==='roomBans'){
    db[type][room]=db[type][room].filter(x=>typeof x==='string'?x!==name:keyName(x?.name)!==name);
    db[type][room].push({name,until:Date.now()+15*60*1000});
  }else db[type][room]=db[type][room].filter(x=>x!==name);
  try{save();}catch(error){if(hadRoom)db[type][room]=previousRoom;else delete db[type][room];console.error('Room moderation save failed:',error.message);return res.status(500).json({error:'تعذر حفظ إجراء الغرفة'});}
  for(const [sid,u] of socketUsers){
    if(keyName(u.name)!==name||u.room!==room)continue;
    const s=io.sockets.sockets.get(sid);
    if(type==='roomBans'){
      s?.leave(room); removeSessionFromRoomRuntime(sid,room);if(s?.data?.user)s.data.user.room='';if(socketUsers.get(sid))socketUsers.get(sid).room='';
      s?.emit('kicked',{room,banned:true});
    }else if(type==='roomMutes'){
      s?.emit('error-msg',{error:'تم كتمك في هذه الغرفة'});
    }
  }
  emitState();res.json({ok:true});
}

app.post('/api/admin/kick',requireAdmin,(req,res)=>{const room=String(req.body.room||'public'),name=keyName(req.body.name);if(!name)return res.status(400).json({error:'الاسم مطلوب'});if((isOwnerName(name)||isOwner({name,role:(getUser(name)||getGuest(name)||{}).role}))&&!isOwner(req.user)){notifyOwnerProtectedAttempt(req.user,'طردك من الغرفة');return res.status(403).json({error:'حساب صاحب الموقع محمي ولا يحق للإداري اتخاذ إجراء عليه'});}if(denyHigherRankTarget(req.user,name,res))return;for(const [sid2,u2] of socketUsers){if(keyName(u2.name)===name&&u2.room===room){const so=socketBySession(sid2);so?.leave(room);removeSessionFromRoomRuntime(sid2,room);if(so?.data?.user)so.data.user.room='';if(socketUsers.get(sid2))socketUsers.get(sid2).room='';so?.emit('kicked',{room});}}emitState();res.json({ok:true});});
app.post('/api/admin/profile/status',requireAdmin,(req,res)=>{const name=accountKey(cleanName(req.body?.name)),target=getUser(name)||getGuest(name);if(!name||!target)return res.status(404).json({error:'العضو غير موجود'});if(isOwnerName(name)||roleOf({name,role:target.role})==='owner'){if(!isOwner(req.user))notifyOwnerProtectedAttempt(req.user,'تغيير حالتك الشخصية');return res.status(403).json({error:'حالة صاحب الموقع محمية'});}if(denyHigherRankTarget(req.user,name,res))return;const hadProfile=Object.prototype.hasOwnProperty.call(db.profiles,name),p=profile(name),previous={...p},status=String(req.body?.status||'').trim().slice(0,100);p.status=status||defaultStatus(name);p.statusUpdatedAt=Date.now();p.statusUpdatedBy=String(req.user?.name||'').slice(0,32);try{save();}catch(error){if(hadProfile){for(const key of Object.keys(p))delete p[key];Object.assign(p,previous);}else delete db.profiles[name];return res.status(500).json({error:'تعذر حفظ الحالة'});}io.emit('profile-changed',{name,profile:p,displayName:p.displayName||cleanName(name)});res.json({ok:true,name,status:p.status});});

app.post('/api/admin/mute',requireAdmin,(req,res)=>roomAction('roomMutes',req,res));
app.post('/api/admin/ban',requireAdmin,(req,res)=>roomAction('roomBans',req,res));
app.post('/api/admin/unban',requireAdmin,(req,res)=>{const room=String(req.body.room||'public'),name=keyName(req.body.name);if(!name)return res.status(400).json({error:'الاسم مطلوب'});if(denyHigherRankTarget(req.user,name,res))return;const had=Object.prototype.hasOwnProperty.call(db.roomBans,room),previous=db.roomBans[room];db.roomBans[room]=(previous||[]).filter(x=>typeof x==='string'?x!==name:keyName(x?.name)!==name);try{save();}catch(error){if(had)db.roomBans[room]=previous;else delete db.roomBans[room];return res.status(500).json({error:'تعذر حفظ رفع الحظر'});}res.json({ok:true});});

app.post('/api/ignore',requireAuth,(req,res)=>{const n=cleanName(req.body.name);if(!n||keyName(n)===keyName(req.user.name))return res.status(400).json({error:'اسم غير صحيح'});const me=keyName(req.user.name),other=keyName(n),previous=db.ignored,next={...(db.ignored||{})},list=Array.isArray(next[me])?next[me].slice():[],i=list.findIndex(x=>keyName(x)===other);if(i>=0)list.splice(i,1);else list.push(other);next[me]=list;db.ignored=next;try{save();}catch(error){if(previous===undefined)delete db.ignored;else db.ignored=previous;return res.status(500).json({error:'تعذر حفظ قائمة التجاهل'});}res.json({ok:true,ignored:i<0});});
app.post('/api/profile',requireAuth,(req,res)=>{
  const u=req.user,p=profile(u.name),updates={};
  if(req.body.displayName!==undefined){const dn=cleanName(req.body.displayName);if(!dn)return res.status(400).json({error:'الاسم المزخرف لا يمكن أن يكون فارغاً'});updates.displayName=dn;}
  if(req.body.status!==undefined)updates.status=String(req.body.status).slice(0,100)||defaultStatus(u.name);
  if(req.body.bio!==undefined)updates.bio=String(req.body.bio).slice(0,300);
  for(const field of ['nameColor','fontColor','bgColor'])if(req.body[field]!==undefined)updates[field]=String(req.body[field]).slice(0,20);
  if(req.body.privateOpen!==undefined)updates.privateOpen=!!req.body.privateOpen;
  if(req.body.notificationsOpen!==undefined)updates.notificationsOpen=!!req.body.notificationsOpen;
  const previous={...p};Object.assign(p,updates);
  try{save();}catch(error){for(const key of Object.keys(p))delete p[key];Object.assign(p,previous);console.error('Profile update save failed:',error.message);return res.status(500).json({error:'تعذر حفظ الملف الشخصي'});}
  io.emit('profile-changed',{name:u.name,profile:p,displayName:p.displayName||cleanName(u.name)});emitState();res.json({ok:true,profile:p,displayName:p.displayName||cleanName(u.name)});
});
app.post('/api/profile/avatar',(req,res,next)=>requireAuth(req,res,()=>{if(!isOwner(req.user)&&Number(getUser(req.user.name)?.likes??getGuest(req.user.name)?.likes??0)<10)return res.status(403).json({error:'تغيير الصورة يفتح عند 10 إعجابات'});return next();}),uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{if(!isOwner(req.user)&&Number(getUser(req.user.name)?.likes??getGuest(req.user.name)?.likes??0)<10){removeUploadedFile(req.file);return res.status(403).json({error:'تغيير الصورة يفتح عند 10 إعجابات'});}if(!req.file||!req.file.mimetype.startsWith('image/')){removeUploadedFile(req.file);return res.status(400).json({error:'اختر صورة'});}const p=profile(req.user.name),previous=p.avatar;p.avatar='/uploads/'+req.file.filename;try{save()}catch(e){p.avatar=previous;removeUploadedFile(req.file);console.error('Avatar save failed:',e.message);return res.status(500).json({error:'تعذر حفظ الصورة'});}if(previous&&previous.startsWith('/uploads/'))removePublicUploadIfUnreferenced(previous);res.json({ok:true,avatar:p.avatar});});
app.delete('/api/profile/avatar',requireAuth,(req,res)=>{if(isOwner(req.user))return res.status(403).json({error:'حذف صورة صاحب الموقع محمي'});const p=profile(req.user.name),previous=p.avatar;p.avatar='';try{save()}catch(e){p.avatar=previous;return res.status(500).json({error:'تعذر حفظ حذف الصورة'});}if(previous&&previous.startsWith('/uploads/'))removePublicUploadIfUnreferenced(previous);res.json({ok:true,avatar:''});});
// Personal banners are intentionally separate from rank artwork and member decorations.
app.post('/api/profile/banner',requireAuth,(req,res,next)=>{if(!hasPermission(req.user,'personal_banner'))return res.status(403).json({error:'ما عندك صلاحية رفع البنر'});next();},uploadImage.single('file'),validateUploadedContent('image'),(req,res)=>{if(!req.file){return res.status(400).json({error:'اختر صورة للبنر'});}const p=profile(req.user.name),previous=p.banner;p.banner='/uploads/'+req.file.filename;try{save()}catch(e){p.banner=previous;removeUploadedFile(req.file);return res.status(500).json({error:'تعذر حفظ البنر'});}if(previous&&previous.startsWith('/uploads/'))removePublicUploadIfUnreferenced(previous);io.emit('profile-changed',{name:req.user.name,profile:p,displayName:p.displayName||cleanName(req.user.name)});emitState();res.json({ok:true,banner:p.banner});});
app.delete('/api/profile/banner',requireAuth,(req,res)=>{if(!hasPermission(req.user,'personal_banner'))return res.status(403).json({error:'ما عندك صلاحية حذف البنر'});const p=profile(req.user.name),previous=p.banner;p.banner='';try{save()}catch(e){p.banner=previous;return res.status(500).json({error:'تعذر حذف البنر'});}if(previous&&previous.startsWith('/uploads/'))removePublicUploadIfUnreferenced(previous);io.emit('profile-changed',{name:req.user.name,profile:p,displayName:p.displayName||cleanName(req.user.name)});emitState();res.json({ok:true,banner:''});});

app.post('/api/media',requireAuth,upload.single('file'),validateUploadedContent('media'),(req,res)=>{
  const u=req.user, to=cleanName(req.body.to||''), scope=String(req.body.scope||'private');
  if(!req.file)return res.status(400).json({error:'لم يتم اختيار ملف'});
  if(scope==='private'&&!siteModuleEnabled('privateChat')){removeUploadedFile(req.file);return res.status(403).json({error:'المحادثات الخاصة متوقفة من إدارة الموقع'});}
  if(scope==='wall'&&!siteModuleEnabled('wall')){removeUploadedFile(req.file);return res.status(403).json({error:'ميزة الحائط متوقفة من إدارة الموقع'});}
  if(globalBanned(u.name,requestClientIp(req))){removeUploadedFile(req.file);return res.status(403).json({error:'لا يمكنك إرسال الوسائط أثناء الحظر العام'});}
  if(scope==='private'&&!canMedia(u)){removeUploadedFile(req.file);return res.status(403).json({error:`الصور والفيديو والصوت والاتصال تفتح عند ${PRIVATE_MEDIA_LIKES_REQUIRED} إعجاب من المرسل`});}
  if(scope==='wall'&&db.wallEnabled===false){removeUploadedFile(req.file);return res.status(403).json({error:'الجدار متوقف مؤقتاً من الإدارة'});}
  if(scope==='wall'&&!/^image\//.test(req.file.mimetype)&&!/^video\//.test(req.file.mimetype)){removeUploadedFile(req.file);return res.status(400).json({error:'الحائط يسمح بصورة أو فيديو فقط'});}
  const media={url:'/uploads/'+req.file.filename,mime:req.file.mimetype,name:req.file.originalname};
  if(scope==='private'){
    const target=getUser(to)||getGuest(to)||null; if(!target){removeUploadedFile(req.file);return res.status(404).json({error:'العضو غير موجود'});}
    const tp=profile(to); if(tp.privateOpen===false&&!canMessageClosedPrivate(u)){removeUploadedFile(req.file);return res.status(403).json({error:`لقد أغلق ${displayName(to)} المحادثة الخاصة`});}
    const ignored=(db.ignored?.[keyName(to)]||[]).some(x=>keyName(x)===keyName(u.name)); if(ignored){removeUploadedFile(req.file);return res.status(403).json({error:`لقد قام ${displayName(to)} بتجاهلك`});}
    if(!hasConnectedSessionForUser(to)){removeUploadedFile(req.file);return res.status(403).json({error:'هذا المستخدم غير متصل'});}
    const privateFilename=path.basename(req.file.filename),privatePath=path.join(PRIVATE_MEDIA_DIR,privateFilename);
    try{fs.renameSync(req.file.path,privatePath);req.file.path=privatePath;media.url='/api/private/media/'+privateFilename;}
    catch(error){removeUploadedFile(req.file);console.error('Private media move failed:',error.message);return res.status(500).json({error:'تعذر تأمين تخزين الوسائط الخاصة'});}
    const m={id:crypto.randomUUID(),room:'__private__',from:u.name,fromDisplayName:displayName(u.name),to,type:'media',media,at:Date.now(),profile:profile(u.name),role:roleOf(u),vip:vipActive(u.name),likes:userLikes(u)};
    const toKey=keyName(to),fromKey=keyName(u.name);
    db.privateMessages=[...(db.privateMessages||[]),m].slice(-5000);
    if(db.privateHidden?.[toKey])db.privateHidden[toKey]=db.privateHidden[toKey].filter(x=>keyName(x)!==fromKey);
    if(db.privateHidden?.[fromKey])db.privateHidden[fromKey]=db.privateHidden[fromKey].filter(x=>keyName(x)!==toKey);
    // Match text-DM delivery: fan out to every currently owned socket for this account.
    // Selecting only the first session can miss the recipient's active private-chat tab.
    emitToUser(to,'private-media',m); return res.json(m);
  }
  if(scope!=='wall'){removeUploadedFile(req.file);return res.status(400).json({error:'نوع إرسال الوسائط غير صحيح'});}
  const previousWall=db.wall.slice();const post={id:crypto.randomUUID(),from:u.name,text:'',media,at:Date.now(),likes:0}; db.wall.push(post);try{save()}catch(e){db.wall=previousWall;removeUploadedFile(req.file);console.error('Wall media save failed:',e.message);return res.status(500).json({error:'تعذر حفظ الوسائط على الحائط'});} io.emit('wall-new',post); res.json(post);
});

function normalizeChatFilterText(value){return String(value||'').normalize('NFKC').toLocaleLowerCase('ar').replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\uFEFF]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[\s\u00A0]+/g,' ').trim();}
function blockedChatTerm(text){const f=db.chatFilter||{};if(f.enabled!==true)return '';const normalized=normalizeChatFilterText(text);return (Array.isArray(f.words)?f.words:[]).find(w=>{const term=normalizeChatFilterText(w);return term&&normalized.includes(term)})||'';}
const botMessageWindows=new Map();
function roomMessageRateLimitError(sid,text,now=Date.now()){
  const config=normalizedBotSettings(db.botSettings).antiSpam;
  if(!config.enabled)return '';
  if(!sid)return 'تعذر التحقق من جلسة الدردشة';
  const message=String(text||'').trim();
  if(!message)return '';
  const state=botMessageWindows.get(sid)||{start:now,count:0,lastText:'',repeat:0};
  if(now-state.start>5000){state.start=now;state.count=0;state.lastText='';state.repeat=0;}
  state.count++;
  state.repeat=state.lastText===message?state.repeat+1:1;
  state.lastText=message;
  botMessageWindows.set(sid,state);
  return state.count>7||state.repeat>3?'🤖 بوت الحماية: تم إيقاف الرسائل المتكررة أو السريعة، انتظر قليلاً':'';
}
const privateMessageWindows=new Map();
const PRIVATE_MESSAGE_WINDOW_MS=5000,PRIVATE_MESSAGE_WINDOW_LIMIT=7,PRIVATE_MESSAGE_REPEAT_LIMIT=3;
function allowPrivateMessage(sid,text,now=Date.now()){
  if(!sid)return false;
  const key=String(sid),message=String(text||'').trim();
  if(!message)return false;
  const state=privateMessageWindows.get(key)||{start:now,count:0,lastText:'',repeat:0};
  if(now-state.start>PRIVATE_MESSAGE_WINDOW_MS){state.start=now;state.count=0;state.lastText='';state.repeat=0;}
  state.count++;
  state.repeat=state.lastText===message?state.repeat+1:1;
  state.lastText=message;
  privateMessageWindows.set(key,state);
  return state.count<=PRIVATE_MESSAGE_WINDOW_LIMIT&&state.repeat<=PRIVATE_MESSAGE_REPEAT_LIMIT;
}
function clearSessionTransientState(sid){
  if(!sid)return;
  botMessageWindows.delete(sid);
  privateMessageWindows.delete(sid);
  callSignalWindows.delete(sid);
  voiceSignalWindows.delete(sid);
  welcomeSentSessions.delete(sid);
}
function pruneOrphanedSessionState(){
  for(const sid of botMessageWindows.keys())if(!sessions.has(sid)||(!socketUsers.has(sid)&&!sessionDisconnectTimers.has(sid)))botMessageWindows.delete(sid);
  for(const sid of privateMessageWindows.keys())if(!sessions.has(sid)||(!socketUsers.has(sid)&&!sessionDisconnectTimers.has(sid)))privateMessageWindows.delete(sid);
  for(const sid of callSignalWindows.keys())if(!socketUsers.has(sid))callSignalWindows.delete(sid);
  for(const sid of voiceSignalWindows.keys())if(!socketUsers.has(sid))voiceSignalWindows.delete(sid);
  for(const sid of welcomeSentSessions)if(!sessions.has(sid))welcomeSentSessions.delete(sid);
}
const sessionTransientCleanupTimer=setInterval(pruneOrphanedSessionState,5*60*1000);
sessionTransientCleanupTimer.unref?.();
async function emitRoomBotMessage(room,text){const message={id:crypto.randomUUID(),room,from:'رماز بوت',displayName:'🤖 رماز بوت',type:'text',text:String(text||'').slice(0,1000),at:Date.now(),role:'bot',bot:true};try{await addMessage(message);io.to(room).emit('message',message);}catch(error){console.warn('Chat bot response failed:',error.message);}}
async function processBuiltInBotCommand(socket,user,room,text,onError=null){
 const settings=normalizedBotSettings(db.botSettings),raw=String(text||'').trim();if(!/^[!/]/.test(raw))return false;
 const [head,...tail]=raw.slice(1).trim().split(/\s+/),cmd=String(head||'').toLowerCase(),arg=tail.join(' ').trim();if(!cmd)return false;
 if(['مساعدة','help','بوتات'].includes(cmd)){const lines=['🤖 أوامر بوت رماز:'];if(settings.games.enabled)lines.push('/نرد — رمية نرد','/عملة — رمي العملة','/رقم — رقم عشوائي');if(settings.stats.enabled)lines.push('/احصائياتي — معلومات حسابك','/المتواجدين — عدد المتصلين','/احصائيات — إحصائيات الدردشة');if(settings.adminCommands.enabled&&canNotice(user))lines.push('/تنبيه نص الرسالة — إعلان إداري للغرفة');if(lines.length===1)lines.push('لا توجد بوتات تفاعلية مفعّلة حالياً.');await emitRoomBotMessage(room,lines.join('\n'));return true;}
 if(settings.games.enabled&&['نرد','dice','عملة','coin','رقم','random'].includes(cmd)){
  if(['نرد','dice'].includes(cmd))await emitRoomBotMessage(room,`🎲 ${displayName(user.name)} رمى النرد والنتيجة: ${1+Math.floor(Math.random()*6)}`);
  else if(['عملة','coin'].includes(cmd))await emitRoomBotMessage(room,`🪙 ${displayName(user.name)}: ${Math.random()<.5?'وجه':'كتابة'}`);
  else await emitRoomBotMessage(room,`🎯 ${displayName(user.name)} حصل على الرقم: ${1+Math.floor(Math.random()*100)}`);
  return true;
 }
 if(settings.stats.enabled&&['احصائياتي','me','المتواجدين','online','احصائيات','stats'].includes(cmd)){
  if(['احصائياتي','me'].includes(cmd)){const likes=userLikes(user);await emitRoomBotMessage(room,`📊 ${displayName(user.name)}\nالرتبة: ${rankDefinition(profile(user.name).rank)?.name||'عضو'}\nالإعجابات: ${likes}\nالمستوى: ${level(likes)}\nالغرفة: ${db.rooms.find(r=>r.id===room)?.name||'الدردشة'}`);}
  else if(['المتواجدين','online'].includes(cmd))await emitRoomBotMessage(room,`👥 عدد المتواجدين حالياً: ${getOnlineUsers().length}`);
  else await emitRoomBotMessage(room,`📊 إحصائيات رماز: ${Object.keys(db.users||{}).length} عضو مسجل، ${Object.keys(db.guests||{}).length} زائر، ${getOnlineUsers().length} متصل حالياً.`);
  return true;
 }
 if(settings.adminCommands.enabled&&['تنبيه','announce'].includes(cmd)){
  if(!canNotice(user)){const message='هذا الأمر يحتاج صلاحية إرسال التنبيهات الإدارية';if(onError)onError(message,403);else socket.emit('error-msg',{error:message});return true;}
  if(!arg){const message='اكتب نص التنبيه بعد الأمر /تنبيه';if(onError)onError(message,400);else socket.emit('error-msg',{error:message});return true;}
  io.to(room).emit('admin-notice',{from:user.name,text:arg.slice(0,500)});await emitRoomBotMessage(room,`📢 تم إرسال التنبيه بواسطة ${displayName(user.name)}.`);return true;
 }
 return false;
}

io.on('connection',socket=>{
  socket.on('join',async({sid,room='public',password=''}={})=>{
    // A socket may join initially or move rooms, but a superseded socket must never reclaim the same session.
    const requestedSid=String(sid||'');
    if(socket.data.sid&&(socket.data.sid!==requestedSid||!isCurrentSessionSocket(socket)))return;
    const u=sessionUser(requestedSid); if(!u)return;
    const targetRoom=db.rooms.find(r=>r.id===room); if(!targetRoom){socket.emit('join-error',{error:'الغرفة غير موجودة'});return;}if(targetRoom.kind==='voice'&&!siteModuleEnabled('voiceRooms')){socket.emit('join-error',{error:'الغرف الصوتية متوقفة من إدارة الموقع'});return;}
    if(targetRoom.passwordHash&&!bcrypt.compareSync(String(password||''),targetRoom.passwordHash)){socket.emit('join-error',{error:'الغرفة مقفلة؛ أدخل الباسورد الصحيح'});return;} 
    // Validate access before changing the active room, then move this socket atomically.
    if(globalBanned(u.name,socketClientIp(socket))){socket.emit('join-error',{error:'عنوان الإنترنت محظور من الدردشة، حاول بعد انتهاء 5 دقائق'});return;}
    if(roomBanned(u.name,room)){socket.emit('join-error',{error:'أنت محظور من هذه الغرفة'});return;}
    const capacity=Math.max(1,Number(targetRoom.capacity)||200);
    const roomAccounts=new Set([...socketUsers.entries()].filter(([activeSid,active])=>activeSid!==sid&&active.room===room).map(([,active])=>keyName(active.name)));
    if(!roomAccounts.has(keyName(u.name))&&roomAccounts.size>=capacity){socket.emit('join-error',{error:'الغرفة ممتلئة؛ اختر غرفة أخرى'});return;}
    const previousSocket=socketBySession(sid);
    const replacingSocket=!!previousSocket&&previousSocket.id!==socket.id;
    const previousRoom=socket.data.user?.room||socketUsers.get(sid)?.room||'';
    const alreadyInPreviousRoom=!!previousRoom&&[...socketUsers.entries()].some(([otherSid,active])=>otherSid!==sid&&active.room===previousRoom&&keyName(active.name)===keyName(u.name));
    const alreadyInTargetRoom=previousRoom===room||[...socketUsers.entries()].some(([otherSid,active])=>otherSid!==sid&&active.room===room&&keyName(active.name)===keyName(u.name));
    if(previousRoom && previousRoom!==room){
      if(replacingSocket)previousSocket.leave(previousRoom);else socket.leave(previousRoom);
      removeSessionFromRoomRuntime(sid,previousRoom);
      if(!u.ghost&&!alreadyInPreviousRoom){const leaveNotice={id:crypto.randomUUID(),room:previousRoom,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'move',exitKind:'room',targetRoom:room,text:'',at:Date.now(),profile:profile(u.name),role:u.role,presenceVisibility:u.hidden?'staff':'public'};try{await addMessage(leaveNotice);emitPresenceToRoom(previousRoom,leaveNotice)}catch(e){console.warn('Room-move presence could not be saved:',e.message)}}
      emitVoiceState(previousRoom);
      const oldMembers=roomSockets.get(previousRoom)||new Set();
      for(const memberSid of [...oldMembers]){const active=socketUsers.get(memberSid);if(!active||active.room!==previousRoom)oldMembers.delete(memberSid);}
      if(oldMembers.size===0)roomSockets.delete(previousRoom);
    }
    if(replacingSocket&&previousRoom===room){removeSessionFromRoomRuntime(sid,previousRoom);}
    cancelSessionDisconnectCleanup(sid);cancelPrivateConversationCleanup(u.name);socket.data.sid=sid;socket.data.user={...u,room};socketUsers.set(sid,{...u,room,socketId:socket.id,joinedAt:Date.now()});
    if(replacingSocket)previousSocket.disconnect(true);
    socket.join(room); if(!roomSockets.has(room))roomSockets.set(room,new Set());roomSockets.get(room).add(sid);
    socket.emit('room-joined',{room});
    // Deliver welcome cards before the room history so the entry sequence is stable and predictable.
    if(!welcomeSentSessions.has(sid)){for(const item of (db.welcomeMessages||[]).filter(x=>x.enabled!==false&&String(x.text||'').trim())){const welcome={id:'welcome-'+crypto.randomUUID(),room,from:'شات ريماز',displayName:item.title||'الترحيب',type:'welcome',text:item.text,at:Date.now(),profile:{nameColor:'#2877b9',bgColor:'#eaf5ff'}};socket.emit('message',welcome);}welcomeSentSessions.add(sid);}
    socket.emit('history',{room,items:roomHistoryWithAnnouncements(room,u,Number(u.created)||0)}); if(!u.ghost&&!alreadyInTargetRoom){const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'join',text:'',at:Date.now(),profile:profile(u.name),role:u.role,presenceVisibility:u.hidden?'staff':'public'};try{await addMessage(pm);emitPresenceToRoom(room,pm)}catch(e){console.warn('Join presence could not be saved:',e.message)}const bot=normalizedBotSettings(db.botSettings).welcome;if(bot.enabled===true&&room==='public'){const welcomeText=String(bot.text||'أهلاً وسهلاً بك في دردشة رماز ❤️').slice(0,240);const welcomeMessage={id:crypto.randomUUID(),room,from:'رماز بوت',displayName:'🤖 رماز بوت',type:'text',text:welcomeText.replace(/\{name\}/g,displayName(u.name)),at:Date.now(),role:'bot',bot:true};try{await addMessage(welcomeMessage);io.to(room).emit('message',welcomeMessage)}catch(error){console.warn('Welcome bot message failed:',error.message)}}} emitState(); const joinedRoom=db.rooms.find(r=>r.id===room); if(joinedRoom?.kind==='voice'){for(const [speakerSid,speaker] of (voiceSpeakers.get(room)||new Map()))socketBySession(speakerSid)?.emit('voice-peer-joined',{room,sid,name:u.name});emitVoiceState(room);}
  });
  socket.on('request-mic',({room,raised,seatIndex}={})=>{
    if(!isCurrentSessionSocket(socket))return;
    if(!siteModuleEnabled('voiceRooms'))return socket.emit('error-msg',{error:'الغرف الصوتية متوقفة من إدارة الموقع'});
    const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||!room||u.room!==room||!socket.rooms.has(room))return;
    const r=db.rooms.find(x=>x.id===room);if(!r||r.kind!=='voice')return socket.emit('error-msg',{error:'هذا الخيار متاح بالغرف الصوتية فقط'});
    const speakers=voiceSpeakers.get(room)||new Map();
    if(raised){
      if(!canRaiseRoomMic(u)){const error=`رفع المايك في الغرف الصوتية يفتح عند ${ROOM_MIC_LIKES_REQUIRED} إعجاب من صاحب الحساب`;socket.emit('voice-mic-denied',{error});return socket.emit('error-msg',{error});}
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
  socket.on('voice-peer-offer',d=>{if(!isCurrentSessionSocket(socket)||!siteModuleEnabled('voiceRooms'))return;const u=socket.data.user,sid=socket.data.sid,room=u?.room;if(!u||!sid||!d||d.room!==room||!socket.rooms.has(room)||!allowVoiceSignal(sid)||!validSessionDescription(d.offer,'offer'))return;const speakers=voiceSpeakers.get(room),members=roomSockets.get(room);if(!speakers?.has(sid)||!members?.has(d.to)||d.to===sid)return;const target=socketUsers.get(d.to);if(!target||target.room!==room)return;pruneActiveVoicePairs();const pairKey=voiceRoomPairKey(room,sid,d.to);if(!activeVoicePairs.has(pairKey)&&activeVoicePairs.size>=MAX_ACTIVE_VOICE_PAIRS)return;activeVoicePairs.set(pairKey,{room,a:sid,b:d.to,offerer:sid,created:Date.now()});socketBySession(d.to)?.emit('voice-peer-offer',{room,from:sid,fromName:u.name,offer:d.offer});});
  socket.on('voice-peer-answer',d=>{if(!isCurrentSessionSocket(socket)||!siteModuleEnabled('voiceRooms'))return;const u=socket.data.user,sid=socket.data.sid,room=u?.room;if(!u||!sid||!d||d.room!==room||!socket.rooms.has(room)||!allowVoiceSignal(sid)||!validSessionDescription(d.answer,'answer'))return;const speakers=voiceSpeakers.get(room),members=roomSockets.get(room),state=activeVoicePairs.get(voiceRoomPairKey(room,d.to,sid));if(!members?.has(sid)||!speakers?.has(d.to)||!state||Date.now()-state.created>VOICE_PAIR_TTL_MS||state.offerer!==d.to||state.b!==sid)return;socketBySession(d.to)?.emit('voice-peer-answer',{room,from:sid,answer:d.answer});});
  socket.on('voice-peer-ice',d=>{if(!isCurrentSessionSocket(socket)||!siteModuleEnabled('voiceRooms'))return;const u=socket.data.user,sid=socket.data.sid,room=u?.room;if(!u||!sid||!d||d.room!==room||!socket.rooms.has(room)||!allowVoiceSignal(sid)||!validIceCandidate(d.candidate))return;const members=roomSockets.get(room),state=activeVoicePairs.get(voiceRoomPairKey(room,sid,d.to));if(!members?.has(sid)||!members?.has(d.to)||!state||Date.now()-state.created>VOICE_PAIR_TTL_MS||(state.a!==sid&&state.b!==sid)||(state.a!==d.to&&state.b!==d.to))return;socketBySession(d.to)?.emit('voice-peer-ice',{room,from:sid,candidate:d.candidate});});
  socket.on('leave-room',async({room}={})=>{const u=socket.data.user,sid=socket.data.sid;if(!isCurrentSessionSocket(socket)||!u||!room||room!==u.room||!socket.rooms.has(room))return;const accountStillInRoom=[...socketUsers.entries()].some(([otherSid,active])=>otherSid!==sid&&active.room===room&&keyName(active.name)===keyName(u.name));socket.leave(room);removeSessionFromRoomRuntime(sid,room);if(socketUsers.get(sid))socketUsers.get(sid).room='';if(socket.data.user)socket.data.user.room='';if(!u.ghost&&!accountStillInRoom){const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'leave',exitKind:'room',text:'',at:Date.now(),profile:profile(u.name),role:u.role,presenceVisibility:u.hidden?'staff':'public'};try{await addMessage(pm);emitPresenceToRoom(room,pm)}catch(e){console.warn('Leave presence could not be saved:',e.message)}}{const members=roomSockets.get(room)||new Set();for(const memberSid of [...members]){const active=socketUsers.get(memberSid);if(!active||active.room!==room)members.delete(memberSid);}if(members.size===0){roomSockets.delete(room);try{save()}catch(e){console.error('Room state save failed:',e.message)}}}emitState();});
  socket.on('send-message',async d=>{const u=socket.data.user;if(!u||!isCurrentSessionSocket(socket))return;const room=String(d?.room||'');if(!room||u.room!==room||!socket.rooms.has(room))return socket.emit('error-msg',{error:'أنت خارج الغرفة'});const targetRoom=db.rooms.find(r=>r.id===room);if(!targetRoom)return socket.emit('error-msg',{error:'الغرفة غير موجودة'});if(globalBanned(u.name,socketClientIp(socket)))return socket.emit('error-msg',{error:'لا يمكنك الكتابة أثناء الحظر العام'});if(roomMuted(u.name,room)||roomBanned(u.name,room))return socket.emit('error-msg',{error:'لا يمكنك الكتابة هنا'});const text=String(d?.text||'').trim().slice(0,2000);if(!text)return;if(blockedChatTerm(text))return socket.emit('error-msg',{error:'رسالتك تحتوي على كلمة غير مسموح بها'});const rateError=roomMessageRateLimitError(socket.data.sid,text);if(rateError)return socket.emit('error-msg',{error:rateError});if(await processBuiltInBotCommand(socket,u,room,text))return;const m={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'text',text,at:Date.now(),likes:userLikes(u),role:roleOf(u),vip:vipActive(u.name),profile:profile(u.name)};try{await addMessage(m)}catch(e){console.error('Socket room message save failed:',e.message);return socket.emit('error-msg',{error:'تعذر حفظ الرسالة، حاول مرة أخرى'});}io.to(room).emit('message',m);});
  socket.on('private-typing',d=>{
    const user=socket.data.user,sid=socket.data.sid;
    if(!user||!sid||!isCurrentSessionSocket(socket)||!siteModuleEnabled('privateChat'))return;
    const previous=String(socket.data.privateTypingTo||'');
    const requested=String(d?.to||'').trim();
    const typing=d?.typing===true;
    if(!typing){
      if(socket.data.privateTypingTimer)clearTimeout(socket.data.privateTypingTimer);
      socket.data.privateTypingTimer=null;
      socket.data.privateTypingTo='';
      const recipient=previous||requested;
      if(recipient)emitToUser(recipient,'private-typing',{from:user.name,typing:false});
      return;
    }
    const recipient=accountKey(requested);
    if(!recipient||keyName(requested)!==keyName(recipient))return;
    if(globalBanned(user.name,socketClientIp(socket))||(!getUser(recipient)&&!getGuest(recipient))||!hasConnectedSessionForUser(recipient))return;
    if(profile(recipient).privateOpen===false&&!canMessageClosedPrivate(user))return;
    const ignored=(db.ignored?.[keyName(recipient)]||[]).some(name=>keyName(name)===keyName(user.name));
    if(ignored)return;
    if(previous&&keyName(previous)!==keyName(recipient))emitToUser(previous,'private-typing',{from:user.name,typing:false});
    if(socket.data.privateTypingTimer)clearTimeout(socket.data.privateTypingTimer);
    socket.data.privateTypingTo=recipient;
    socket.data.privateTypingTimer=setTimeout(()=>{
      if(keyName(socket.data.privateTypingTo||'')!==keyName(recipient))return;
      socket.data.privateTypingTimer=null;
      socket.data.privateTypingTo='';
      emitToUser(recipient,'private-typing',{from:user.name,typing:false});
    },3000);
    socket.data.privateTypingTimer.unref?.();
    emitToUser(recipient,'private-typing',{from:user.name,typing:true});
  });
  socket.on('private-message',d=>{const u=socket.data.user,sid=socket.data.sid;if(!u||!isCurrentSessionSocket(socket)||!d?.to)return;if(!siteModuleEnabled('privateChat'))return socket.emit('error-msg',{error:'المحادثات الخاصة متوقفة من إدارة الموقع'});if(globalBanned(u.name,socketClientIp(socket)))return socket.emit('error-msg',{error:'لا يمكنك المراسلة أثناء الحظر العام'});const toKey=keyName(d.to),to=accountKey(d.to),text=String(d.text||'').trim().slice(0,2000);if(!text)return;if(blockedChatTerm(text))return socket.emit('error-msg',{error:'رسالتك تحتوي على كلمة غير مسموح بها'});if(!getUser(to)&&!getGuest(to))return socket.emit('error-msg',{error:'هذا المستخدم غير موجود'});const tp=profile(to);if(tp.privateOpen===false&&!canMessageClosedPrivate(u))return socket.emit('error-msg',{error:`لقد أغلق ${displayName(to)} المحادثة الخاصة`});const ignored=(db.ignored?.[toKey]||[]).some(x=>keyName(x)===keyName(u.name));if(ignored)return socket.emit('error-msg',{error:`لقد قام ${displayName(to)} بتجاهلك`});if(!hasConnectedSessionForUser(to))return socket.emit('error-msg',{error:'العضو غير متصل؛ المحادثات الخاصة مؤقتة بين المتصلين فقط'});const fromKey=keyName(u.name),previousHidden=db.privateHidden,nextHidden={...(db.privateHidden||{})};let hiddenChanged=false;for(const [owner,other] of [[toKey,fromKey],[fromKey,toKey]]){if(Array.isArray(nextHidden[owner])){const filtered=nextHidden[owner].filter(x=>keyName(x)!==other);if(filtered.length!==nextHidden[owner].length){nextHidden[owner]=filtered;hiddenChanged=true;}}}if(hiddenChanged){db.privateHidden=nextHidden;try{save();}catch(error){if(previousHidden===undefined)delete db.privateHidden;else db.privateHidden=previousHidden;console.error('Private conversation unhide save failed:',error.message);return socket.emit('error-msg',{error:'تعذر حفظ فتح المحادثة الخاصة؛ أعد المحاولة'});}}if(!allowPrivateMessage(sid,text))return socket.emit('error-msg',{error:'الرسائل الخاصة سريعة أو متكررة جداً؛ انتظر قليلاً ثم حاول مجدداً'});if(socket.data.privateTypingTimer){clearTimeout(socket.data.privateTypingTimer);socket.data.privateTypingTimer=null;}if(socket.data.privateTypingTo){emitToUser(socket.data.privateTypingTo,'private-typing',{from:u.name,typing:false});socket.data.privateTypingTo='';}const m={id:crypto.randomUUID(),from:u.name,fromDisplayName:displayName(u.name),to,toDisplayName:displayName(to),type:'text',text,at:Date.now(),profile:profile(u.name),role:roleOf(u),vip:vipActive(u.name),likes:userLikes(u)};db.privateMessages=[...(db.privateMessages||[]),m].slice(-5000);emitToUser(to,'private-message',m);socket.emit('private-message',m);});
  socket.on('call-offer',d=>{if(!isCurrentSessionSocket(socket))return;if(!siteModuleEnabled('videoCalls'))return socket.emit('call-failed',{error:'المكالمات متوقفة من إدارة الموقع'});const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||!d?.to)return;if(!canMedia(u))return socket.emit('call-failed',{error:`الاتصال الصوتي والكاميرا يفتحان عند ${PRIVATE_MEDIA_LIKES_REQUIRED} إعجاب من المتصل`});if(!allowCallSignal(sid))return socket.emit('call-failed',{error:'طلبات الاتصال كثيرة جداً، حاول بعد قليل'});if(!validSessionDescription(d.offer,'offer'))return socket.emit('call-failed',{error:'بيانات الاتصال غير صالحة'});const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return socket.emit('call-failed',{error:'المستخدم غير متصل'});for(const [oldPair,oldState] of activeCallPairs){const pendingCallee=socketUsers.get(oldState.callee),waitingOnRoomMic=!!pendingCallee&&voiceSpeakers.get(pendingCallee.room)?.has(oldState.callee);if(!oldState.answered&&Date.now()-oldState.created>120000&&!waitingOnRoomMic)activeCallPairs.delete(oldPair);else if(oldState.caller===sid||oldState.callee===sid||oldState.caller===target[0]||oldState.callee===target[0])return socket.emit('call-failed',{error:'أحد الطرفين مشغول باتصال آخر'});}const pair=callPairKey(sid,target[0]),state={caller:sid,callee:target[0],created:Date.now(),video:!!d.video,answered:false};activeCallPairs.set(pair,state);const timeoutCall=()=>{if(activeCallPairs.get(pair)!==state||state.answered)return;const callee=socketUsers.get(target[0]);if(callee&&voiceSpeakers.get(callee.room)?.has(target[0])){const next=setTimeout(timeoutCall,60000);next.unref?.();return;}activeCallPairs.delete(pair);socket.emit('call-timeout',{from:target[1].name});socketBySession(target[0])?.emit('call-timeout',{from:u.name})};const timeout=setTimeout(timeoutCall,60000);timeout.unref?.();socketBySession(target[0])?.emit('call-offer',{from:u.name,fromDisplayName:displayName(u.name),fromProfile:(()=>{const p=profile(u.name);return {avatar:p.avatar||'',displayName:p.displayName||'',rank:p.rank||'',rankUntil:p.rankUntil||0,gifts:(p.gifts||[]).slice(0,1),vipUntil:p.vipUntil||0}})(),fromRole:roleOf(u),fromVip:vipActive(u.name),fromLikes:userLikes(u),offer:d.offer,video:!!d.video});});
  socket.on('call-answer',d=>{if(!isCurrentSessionSocket(socket))return;if(!siteModuleEnabled('videoCalls'))return;const u=socket.data.user,sid=socket.data.sid;if(!u||!sid||!d?.to)return;if(!allowCallSignal(sid))return socket.emit('error-msg',{error:'طلبات الاتصال كثيرة جداً، حاول بعد قليل'});if(!validSessionDescription(d.answer,'answer'))return socket.emit('error-msg',{error:'بيانات الرد غير صالحة'});if(voiceSpeakers.get(u.room)?.has(sid))return socket.emit('call-answer-denied',{reason:'room-mic'});const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return;const pair=callPairKey(sid,target[0]),state=activeCallPairs.get(pair);if(!state||state.callee!==sid||state.caller!==target[0])return;if(Date.now()-state.created>120000){activeCallPairs.delete(pair);socket.emit('call-timeout',{from:target[1].name});socketBySession(target[0])?.emit('call-timeout',{from:u.name});return;}if(!socketBySession(state.caller)){activeCallPairs.delete(pair);return;}if(!canMedia(target[1])){activeCallPairs.delete(pair);socket.emit('call-answer-denied',{reason:'sender-likes'});socketBySession(target[0])?.emit('call-failed',{error:`الاتصال يحتاج ${PRIVATE_MEDIA_LIKES_REQUIRED} إعجاب من المتصل`});return;}state.answered=true;socket.emit('call-answer-accepted');socketBySession(target[0])?.emit('call-answer',{from:u.name,answer:d.answer,video:state.video});});
  socket.on('call-reject',d=>{const u=socket.data.user,sid=socket.data.sid;if(!isCurrentSessionSocket(socket)||!u||!d?.to||!allowCallSignal(sid))return;const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return;const pair=callPairKey(sid,target[0]),state=activeCallPairs.get(pair);if(!state||state.callee!==sid||state.caller!==target[0])return;activeCallPairs.delete(pair);socketBySession(target[0])?.emit('call-rejected',{from:u.name,reason:String(d.reason||'declined').slice(0,32)});});
  socket.on('call-end',d=>{const u=socket.data.user,sid=socket.data.sid;if(!isCurrentSessionSocket(socket)||!u||!sid||!d?.to)return;const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return;const pair=callPairKey(sid,target[0]),state=activeCallPairs.get(pair);if(!state||(state.caller!==sid&&state.callee!==sid))return;activeCallPairs.delete(pair);socketBySession(target[0])?.emit('call-ended',{from:u.name});});
  socket.on('ice',d=>{const u=socket.data.user,sid=socket.data.sid;if(!isCurrentSessionSocket(socket)||!u||!sid||!d?.to)return;if(!allowCallSignal(sid))return;if(!validIceCandidate(d.candidate))return;const target=[...socketUsers.entries()].find(([targetSid,x])=>targetSid!==sid&&keyName(x.name)===keyName(d.to));if(!target)return;const state=activeCallPairs.get(callPairKey(sid,target[0]));if(!state||(!state.answered&&Date.now()-state.created>120000))return;socketBySession(target[0])?.emit('ice',{from:u.name,candidate:d.candidate});});
  socket.on('disconnect',async()=>{
    if(socket.data.privateTypingTimer){clearTimeout(socket.data.privateTypingTimer);socket.data.privateTypingTimer=null;}if(socket.data.privateTypingTo){emitToUser(socket.data.privateTypingTo,'private-typing',{from:socket.data.user?.name||'',typing:false});socket.data.privateTypingTo='';}
    const sid=socket.data.sid,u=socket.data.user,active=sid?socketUsers.get(sid):null;
    // A late disconnect from a superseded socket must never evict the new live session.
    if(!sid||!active||active.socketId!==socket.id)return;
    const room=active.room||u?.room||'';
    socketUsers.delete(sid);
    for(const [pair,state] of activeCallPairs){if(state.caller===sid||state.callee===sid){const other=state.caller===sid?state.callee:state.caller;activeCallPairs.delete(pair);socketBySession(other)?.emit('call-ended',{from:u?.name||''});}}
    for(const [pair,state] of activeVoicePairs){if(state.a===sid||state.b===sid)activeVoicePairs.delete(pair);}
    callSignalWindows.delete(sid);voiceSignalWindows.delete(sid);
    if(room){
      removeSessionFromRoomRuntime(sid,room);
    }
    const accountStillInRoom=!!room&&[...socketUsers.values()].some(other=>other.room===room&&keyName(other.name)===keyName(u?.name));
    if(u&&room&&!u.ghost&&!accountStillInRoom){
      const pm={id:crypto.randomUUID(),room,from:u.name,displayName:displayName(u.name),type:'presence',presenceAction:'leave',exitKind:'chat',text:'',at:Date.now(),profile:profile(u.name),role:u.role,presenceVisibility:u.hidden?'staff':'public'};
      try{await addMessage(pm);emitPresenceToRoom(room,pm)}catch(e){console.warn('Disconnect presence could not be saved:',e.message)}
    }
    if(room){
      const members=roomSockets.get(room)||new Set();
      for(const memberSid of [...members]){const current=socketUsers.get(memberSid);if(!current||current.room!==room)members.delete(memberSid);}
      if(members.size===0)roomSockets.delete(room);
    }
    if(u?.name){schedulePrivateConversationCleanup(u.name);scheduleSessionDisconnectCleanup(sid,u);}
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
  console.error(`Unhandled request error on ${req.method} ${req.path}:`, err && err.stack ? err.stack : err);
  return res.status(500).json({error:'حدث خطأ غير متوقع في الخادم'});
});
app.get(/.*/,(req,res)=>sendSeoIndex(req,res));
server.listen(PORT,()=>console.log(`Rimaz server listening on ${PORT}`));
function gracefulShutdown(signal){
  if(messageSaveTimer){clearTimeout(messageSaveTimer);messageSaveTimer=null;}
  let finalSaveSucceeded=true;
  if(pendingMessageWrites.length){flushMessageWrites();if(pendingMessageWrites.length)finalSaveSucceeded=false;}
  try{save();}catch(error){finalSaveSucceeded=false;console.error(`Final database save failed during ${signal}:`,error.message);}
  io.close(()=>process.exit(finalSaveSucceeded?0:1));
  const forceExit=setTimeout(()=>process.exit(1),10000);forceExit.unref?.();
}
process.once('SIGTERM',()=>gracefulShutdown('SIGTERM'));
process.once('SIGINT',()=>gracefulShutdown('SIGINT'));
