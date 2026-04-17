// Scan random Steam profiles → collect movie_webm/mp4 URLs for animated items.
// Patches public/data/steam-items.json in place AND adds new items found via profiles.
//
// Usage: node tools/steam-anim-scraper.js [maxProfiles=50000]

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'public', 'data', 'steam-items.json');
const CACHE = path.join(__dirname, '..', 'public', 'data', 'anim-map.json');
const CDN = 'https://shared.akamai.steamstatic.com/community_assets/';
const MAX = parseInt(process.argv[2]) || 50000;
const CONCURRENCY = 25;

// slot → our shop type + price
const SLOT_MAP = {
  profile_background:      { type: 'background', price: 3000 },
  mini_profile_background: { type: 'background', price: 2000, mini: true },
  avatar_frame:            { type: 'frame',      price: 2000 },
  animated_avatar:         { type: 'avatar',     price: 5000 },
};

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve(d));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

let animMap = {};
try { animMap = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}

function keyFor(appid, imgLarge) {
  if (!imgLarge) return null;
  const m = String(imgLarge).match(/([0-9a-f]{20,})(?:\.[a-z]+)?$/);
  return m ? `${appid}|${m[1]}` : null;
}

async function checkProfile(sid) {
  const body = await get('https://api.steampowered.com/IPlayerService/GetProfileItemsEquipped/v1/?steamid=' + sid);
  if (!body) return 0;
  let j;
  try { j = JSON.parse(body); } catch { return 0; }
  const r = j.response || {};
  let added = 0;
  for (const slot of Object.keys(SLOT_MAP)) {
    const it = r[slot];
    if (!it || !it.movie_webm) continue;
    const k = keyFor(it.appid, it.image_large);
    if (!k || animMap[k]) continue;
    animMap[k] = {
      slot,
      appid: it.appid,
      name: it.item_title || it.name || 'Animated',
      description: it.item_description || '',
      image_large: it.image_large,
      image_small: it.image_small,
      webm: it.movie_webm,
      mp4: it.movie_mp4,
      webm_small: it.movie_webm_small,
      mp4_small: it.movie_mp4_small,
      item_class: it.item_class,
    };
    added++;
  }
  return added;
}

(async () => {
  const base = 76561198000000000n;
  let scanned = 0, newly = 0;
  const startMap = Object.keys(animMap).length;
  console.log(`starting with ${startMap} cached animated items, scanning up to ${MAX} profiles, concurrency ${CONCURRENCY}`);

  async function worker(offset, step) {
    for (let i = offset; i < MAX; i += step) {
      const sid = (base + BigInt(i) * 131n + 1000n).toString();
      const got = await checkProfile(sid);
      scanned++;
      newly += got;
      if (scanned % 1000 === 0) {
        process.stdout.write(`  scanned ${scanned}/${MAX}  new animations: ${newly}  total: ${Object.keys(animMap).length}\n`);
        fs.writeFileSync(CACHE, JSON.stringify(animMap, null, 2));
      }
    }
  }
  await Promise.all(Array.from({length: CONCURRENCY}, (_, i) => worker(i, CONCURRENCY)));
  fs.writeFileSync(CACHE, JSON.stringify(animMap, null, 2));
  console.log(`✓ scanned ${scanned} profiles, total animated in cache: ${Object.keys(animMap).length}`);

  // Patch + add
  const items = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const byKey = new Map();
  for (const it of items) {
    if (!it.appid || it.source === 'wallpaper_engine_local') continue;
    const src = it.css || it.preview || '';
    const m = src.match(/([0-9a-f]{20,})\./);
    if (m) byKey.set(`${it.appid}|${m[1]}`, it);
  }
  let patched = 0, addedNew = 0;
  for (const [k, rec] of Object.entries(animMap)) {
    const existing = byKey.get(k);
    const webmUrl = CDN + rec.webm;
    const webmSmall = CDN + (rec.webm_small || rec.webm);
    if (existing) {
      existing.css = webmUrl;
      existing.preview_video = webmSmall;
      existing.animated = true;
      patched++;
    } else {
      const cfg = SLOT_MAP[rec.slot] || { type: 'background', price: 3000 };
      items.push({
        id: 'steam_anim_' + k.replace('|','_'),
        name: (rec.name || 'Animated').slice(0, 80),
        type: cfg.type,
        price: cfg.price,
        css: webmUrl,
        preview: CDN + (rec.image_large || rec.image_small || ''),
        preview_video: webmSmall,
        appid: rec.appid,
        klass: rec.item_class,
        animated: true,
        description: rec.description || '',
        steam: true,
        source: 'steam_profile_scan',
      });
      addedNew++;
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(items, null, 2));
  console.log(`✓ patched ${patched} existing items; added ${addedNew} new animated items. total items: ${items.length}`);
})();
