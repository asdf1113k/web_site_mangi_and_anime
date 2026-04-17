// Steam Points Shop scraper
// Usage: node tools/steam-scraper.js
// Dumps all community items (frames, backgrounds, animated avatars, stickers, etc.)
// into public/data/steam-items.json

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'public', 'data', 'steam-items.json');
const CDN = 'https://shared.akamai.steamstatic.com/community_assets/';

// community_item_class → our shop slot
// 3  = profile background (static)
// 8  = animated avatar
// 9  = avatar frame
// 10 = mini profile background
// 11 = animated profile background
// 12 = animated avatar frame
// 13 = keyboard skin
// 14 = start menu animation
// 15 = steam deck keyboard
// 16 = steam deck startup movie
const CLASS_MAP = {
  3:  { slot: 'background', label: 'Фон' },
  8:  { slot: 'avatar',     label: 'Аватар (анимированный)' },
  9:  { slot: 'frame',      label: 'Рамка' },
  11: { slot: 'background', label: 'Анимированный фон' },
  // 12 = chat particle effects (not avatar frames) — excluded
};

// Fetch with retry
function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 anixard-pc scraper' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode + ' on ' + url));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
}

async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const body = await get(url);
      return JSON.parse(body);
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

function buildUrl(p, appid) {
  if (!p) return null;
  if (/^https?:/.test(p)) return p;
  const clean = p.replace(/^\/+/, '');
  if (clean.startsWith('images/') || !appid) return CDN + clean;
  return CDN + 'images/items/' + appid + '/' + clean;
}

function pickMedia(def) {
  const d = def.community_item_data || {};
  const large = d.item_image_large || d.item_image_composed || d.item_image_composed_foil;
  const small = d.item_image_small;
  return {
    media: buildUrl(large || small, def.appid),
    preview: buildUrl(small || large, def.appid),
    animated: d.animated === true,
  };
}

async function fetchPage(cursor) {
  const input = {
    time_available: 0,
    community_item_classes: [3, 8, 9, 11],
    language: 'russian',
    count: 1000,
    cursor: cursor || undefined,
    sort: 3,
    sort_descending: true,
    reward_type_filter: 0,
    excluded_content_descriptors: [],
    excluded_community_item_classes: [],
    definitionIds: [],
    filters: [],
    filter_match_all_category_tags: [],
    filter_match_any_category_tags: [],
    contains_workshop_accepted_games_only: false,
    include_direct_purchase_items: true,
    excluded_appids: [],
    search_text: '',
    exclude_reward_purchases_since_days: 0,
    include_reward_purchases_since_days: 0,
  };
  const url = 'https://api.steampowered.com/ILoyaltyRewardsService/QueryRewardItems/v1/?input_json=' +
    encodeURIComponent(JSON.stringify(input));
  const res = await getJson(url);
  return res.response || {};
}

(async () => {
  const items = [];
  const seen = new Set();
  let cursor = null;
  let page = 0;
  let total = 0;

  while (true) {
    page++;
    process.stdout.write(`[page ${page}] fetching... `);
    const resp = await fetchPage(cursor);
    const defs = resp.definitions || [];
    total = resp.total_count || total;
    process.stdout.write(`got ${defs.length} (running total ${items.length}/${total})\n`);

    if (!defs.length) break;

    for (const def of defs) {
      const klass = def.community_item_class;
      const map = CLASS_MAP[klass];
      if (!map) continue;

      const id = 'steam_' + (def.defid || def.appid + '_' + klass + '_' + items.length);
      if (seen.has(id)) continue;
      seen.add(id);

      const d = def.community_item_data || {};
      const { media, preview, animated } = pickMedia(def);
      if (!media) continue;

      items.push({
        id,
        name: d.item_title || d.item_name || ('Steam ' + map.label),
        type: map.slot,
        price: Number(def.point_cost) || 0,
        css: media,
        preview: preview || media,
        appid: def.appid,
        klass,
        animated,
        description: d.item_description || '',
        steam: true,
      });
    }

    cursor = resp.next_cursor;
    if (!cursor) break;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(items, null, 2));
  console.log(`\n✓ Saved ${items.length} items → ${OUT}`);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
