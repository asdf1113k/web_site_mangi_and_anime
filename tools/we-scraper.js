// Wallpaper Engine anime+video scraper
// Scrapes animated anime wallpapers from Steam Workshop (app 431960)
// Output merged into public/data/steam-items.json

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'public', 'data', 'steam-items.json');
const APPID = 431960;
const MAX_ITEMS = 1200;

function get(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location, opts).then(resolve, reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function postForm(url, form) {
  return new Promise((resolve, reject) => {
    const body = Object.entries(form).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

async function fetchBrowsePage(page) {
  const url = `https://steamcommunity.com/workshop/browse/?appid=${APPID}&browsesort=trend&section=readytouseitems&requiredtags%5B%5D=Anime&requiredtags%5B%5D=Video&actualsort=trend&p=${page}`;
  const res = await get(url);
  if (res.status !== 200) throw new Error('browse HTTP ' + res.status);
  const ids = [...new Set([...res.body.matchAll(/sharedfiles\/filedetails\/\?id=(\d+)/g)].map(m => m[1]))];
  return ids;
}

async function fetchDetails(ids) {
  // Steam GetPublishedFileDetails max ~50 per call
  const CHUNK = 50;
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const form = { itemcount: String(chunk.length) };
    chunk.forEach((id, idx) => { form[`publishedfileids[${idx}]`] = id; });
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await postForm('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', form);
        if (res.status === 200) break;
      } catch (e) { /* retry */ }
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
    const j = JSON.parse(res.body);
    const details = j.response?.publishedfiledetails || [];
    out.push(...details);
  }
  return out;
}

(async () => {
  const collected = new Map();
  let page = 1;
  while (collected.size < MAX_ITEMS) {
    process.stdout.write(`[browse p${page}] ...`);
    let ids;
    try { ids = await fetchBrowsePage(page); }
    catch (e) { console.log(' ERR', e.message); break; }
    process.stdout.write(` ${ids.length} ids\n`);
    if (!ids.length) break;
    const fresh = ids.filter(id => !collected.has(id));
    if (!fresh.length) { page++; continue; }
    const details = await fetchDetails(fresh);
    for (const d of details) {
      if (!d || d.result !== 1) continue;
      if (d.banned) continue;
      const tags = (d.tags || []).map(t => t.tag);
      if (!tags.includes('Anime')) continue;
      if (!tags.includes('Video')) continue;
      if (!d.preview_url) continue;
      collected.set(d.publishedfileid, {
        id: 'we_' + d.publishedfileid,
        name: (d.title || 'Anime Wallpaper').slice(0, 80),
        type: 'background',
        price: 2000,
        css: d.preview_url,
        preview: d.preview_url,
        animated: true,
        source: 'wallpaper_engine',
        tags,
        subscriptions: Number(d.lifetime_subscriptions || d.subscriptions || 0),
        steam: true,
      });
      if (collected.size >= MAX_ITEMS) break;
    }
    console.log(`  collected: ${collected.size}`);
    page++;
    if (page > 80) break;
  }

  // Merge into existing file
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
  const existingIds = new Set(existing.map(i => i.id));
  const newOnes = [...collected.values()].filter(it => !existingIds.has(it.id));
  const merged = existing.concat(newOnes);
  fs.writeFileSync(OUT, JSON.stringify(merged, null, 2));
  console.log(`\n✓ Added ${newOnes.length} Wallpaper Engine items. Total: ${merged.length}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
