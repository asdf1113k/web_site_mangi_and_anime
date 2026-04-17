// Scan local Wallpaper Engine workshop folder and inject full-quality
// video wallpapers into public/data/steam-items.json
//
// Usage: node tools/we-local.js

const fs = require('fs');
const path = require('path');

const WE_DIRS = [
  'C:/Program Files (x86)/Steam/steamapps/workshop/content/431960',
  'D:/SteamLibrary/steamapps/workshop/content/431960',
  'E:/SteamLibrary/steamapps/workshop/content/431960',
];
const OUT = path.join(__dirname, '..', 'public', 'data', 'steam-items.json');

function readProject(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, 'project.json'), 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

const items = [];
const locations = [];

for (const base of WE_DIRS) {
  if (!fs.existsSync(base)) continue;
  for (const id of fs.readdirSync(base)) {
    const dir = path.join(base, id);
    if (!fs.statSync(dir).isDirectory()) continue;
    const proj = readProject(dir);
    if (!proj) continue;
    if (proj.type !== 'video') continue;
    if (!proj.file) continue;
    const filePath = path.join(dir, proj.file);
    if (!fs.existsSync(filePath)) continue;
    const preview = ['preview.gif','preview.jpg','preview.png']
      .map(p => path.join(dir, p)).find(fs.existsSync);

    locations.push({ id, dir });
    items.push({
      id: 'we_' + id,
      name: (proj.title || 'Wallpaper').slice(0, 80),
      type: 'background',
      price: 3000,
      css: `/we-local/${id}/${encodeURIComponent(proj.file)}`,
      preview: preview ? `/we-local/${id}/${path.basename(preview)}` : `/we-local/${id}/${encodeURIComponent(proj.file)}`,
      animated: true,
      source: 'wallpaper_engine_local',
      local: true,
      steam: true,
    });
  }
}

// write index for server.js to know which ids → which absolute folder
const mapPath = path.join(__dirname, '..', 'public', 'data', 'we-local-map.json');
fs.writeFileSync(mapPath, JSON.stringify(Object.fromEntries(locations.map(l => [l.id, l.dir])), null, 2));

let existing = [];
try { existing = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
// remove old local entries
existing = existing.filter(i => i.source !== 'wallpaper_engine_local');
const merged = existing.concat(items);
fs.writeFileSync(OUT, JSON.stringify(merged, null, 2));
console.log(`✓ added ${items.length} local WE video wallpapers. total items: ${merged.length}`);
