require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const play = require('play-dl');
const bcrypt = require('bcryptjs');
const multer = require('multer');

// Avatar upload config — only png/jpg
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/img/avatars')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.session.userId}_${Date.now()}${ext}`);
  }
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) && /^image\/(png|jpeg)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Только PNG и JPG файлы'));
    }
  }
});

const app = express();
const PORT = process.env.PORT || 3000;

// API endpoints (AniX-style with proper sign)
const ANIX_API = 'https://api-s.anixsekai.com';
const ANIX_SIGN = '9aa5c7af74e8cd70c86f7f9587bde23d';
const ANIX_UA = 'AnixartApp/9.0 BETA 5-25062213 (Android 9; SDK 28; arm64-v8a; samsung SM-G975N; ru)';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); next(); });
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));

// Serve local Wallpaper Engine workshop files
try {
  const weMapPath = path.join(__dirname, 'public', 'data', 'we-local-map.json');
  const weMap = JSON.parse(fs.readFileSync(weMapPath, 'utf8'));
  app.get('/we-local/:id/:file', (req, res) => {
    const dir = weMap[req.params.id];
    if (!dir) return res.status(404).end();
    const safe = path.basename(req.params.file);
    const full = path.join(dir, safe);
    if (!full.startsWith(dir)) return res.status(403).end();
    res.sendFile(full);
  });
  console.log(`  WE local: ${Object.keys(weMap).length} folders mapped`);
} catch (e) { /* no local WE */ }

app.use(session({
  store: new FileStore({ path: path.join(__dirname, 'sessions'), ttl: 30 * 24 * 3600, retries: 0, logFn: () => {} }),
  secret: process.env.SESSION_SECRET || 'anixard-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

// === Touch last_seen on every request ===
let _lastTouch = {};
app.use((req, res, next) => {
  const raw = req.session?.localUserId || req.session?.userId || null;
  if (raw) {
    const uid = parseInt(raw);
    if (!isNaN(uid)) {
      const now = Date.now();
      if (!_lastTouch[uid] || now - _lastTouch[uid] > 15000) {
        _lastTouch[uid] = now;
        db.touchUser(uid);
        console.log('[Touch]', uid, 'path:', req.path);
      }
    }
  }
  next();
});

// Debug: check session + touch status
app.get('/api/debug-session', (req, res) => {
  const uid = req.session?.localUserId || req.session?.userId || null;
  const u = uid ? db.findUserById(parseInt(uid)) : null;
  res.json({ sessionUserId: uid, dbLastSeen: u?.last_seen || null, now: new Date().toISOString(), lastTouch: _lastTouch[parseInt(uid)] || null });
});

// === Unified Anixart API proxy ===
async function anix(endpoint, { method = 'GET', body, token, contentType, apiV2 = false } = {}) {
  try {
    const sep = endpoint.includes('?') ? '&' : '?';
    const url = token ? `${ANIX_API}${endpoint}${sep}token=${token}` : `${ANIX_API}${endpoint}`;
    const headers = {
      'User-Agent': ANIX_UA,
      'sign': ANIX_SIGN,
      'Accept': 'application/json'
    };
    if (apiV2) headers['API-Version'] = 'v2';
    if (method !== 'GET') {
      headers['Content-Type'] = contentType || 'application/json';
    }

    const opts = { method, headers, timeout: 15000 };
    if (method !== 'GET' && body !== undefined) {
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await fetch(url, opts);
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    console.error(`API error [${method} ${endpoint}]:`, err.message);
    return null;
  }
}

function getToken(req) { return req.session?.anixToken || null; }
function getUserId(req) { return req.session?.anixUserId || null; }

// === Auth ===

// VK OAuth -> Anixart
app.post('/auth/anixart/vk', async (req, res) => {
  const { vkToken } = req.body;
  if (!vkToken) return res.json({ code: -1, error: 'Нет VK токена' });

  console.log(`[VK Auth] token: ${vkToken.substring(0, 20)}...`);

  // Try sending VK token to Anixart /auth/vk
  // Try multiple formats - we don't know exactly what Anixart expects
  const attempts = [
    { endpoint: '/auth/vk', body: `token=${encodeURIComponent(vkToken)}`, ct: 'application/x-www-form-urlencoded' },
    { endpoint: '/auth/vk', body: JSON.stringify({ token: vkToken }), ct: 'application/json' },
    { endpoint: '/auth/vk', body: `access_token=${encodeURIComponent(vkToken)}`, ct: 'application/x-www-form-urlencoded' },
    { endpoint: `/auth/vk?token=${encodeURIComponent(vkToken)}`, body: '', ct: 'application/x-www-form-urlencoded' },
  ];

  let data = null;
  for (const a of attempts) {
    console.log(`[VK] Trying ${a.endpoint} (${a.ct})`);
    data = await anix(a.endpoint, { method: 'POST', body: a.body, contentType: a.ct });
    console.log(`[VK] Result:`, data ? JSON.stringify(data).substring(0, 200) : '(empty)');
    if (data?.code === 0) break;
    if (data && data.code !== undefined) break; // Got a real response
  }

  if (!data) return res.json({ code: -1, error: 'Anixart не ответил. Возможно VK аккаунт не привязан к Anixart.' });

  if (data.code === 0 && data.profileToken) {
    req.session.anixToken = data.profileToken.token;
    req.session.anixUserId = data.profile.id;
    req.session.anixProfile = {
      id: data.profile.id,
      login: data.profile.login,
      avatar: data.profile.avatar,
      status: data.profile.status
    };

    let localUser = db.findUserByGoogleId(`anix_${data.profile.id}`);
    if (!localUser) {
      localUser = db.createUser({
        google_id: `anix_${data.profile.id}`,
        email: `${data.profile.login}@anixart.tv`,
        name: data.profile.login,
        avatar: data.profile.avatar || ''
      });
    } else {
      db.updateUserLogin(`anix_${data.profile.id}`, data.profile.login, data.profile.avatar || '');
      localUser = db.findUserByGoogleId(`anix_${data.profile.id}`);
    }
    req.session.localUserId = localUser.id;

    console.log(`[VK] Success! User: ${data.profile.login}`);
    res.json({ code: 0, profile: req.session.anixProfile });
  } else {
    res.json({ code: data.code || -1, error: data.error || 'VK аккаунт не привязан к Anixart или ошибка авторизации' });
  }
});

// Token auth (paste token directly)
app.post('/auth/anixart/token', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.json({ code: -1, error: 'Нет токена' });

  // Verify token by fetching profile
  const data = await anix(`/profile/preference/all`, { token });
  // Also try to get user profile
  const meData = await anix(`/auth/check?token=${encodeURIComponent(token)}`, { method: 'POST', contentType: 'application/x-www-form-urlencoded', body: '' });

  // Try getting profile with the token
  let profile = null;
  if (meData?.profile) {
    profile = meData.profile;
  } else {
    // Try to find profile by checking if token works on any endpoint
    const testData = await anix('/favorite/all/0', { token });
    if (testData?.code === 0 || testData?.content) {
      // Token works! Try to get profile info
      // We need the user ID - try notification endpoint
      const notif = await anix('/notification/count', { token });
      if (notif?.code === 0) {
        // Token is valid, but we need profile. Try profile/preference
        const pref = await anix('/profile/preference/all', { token });
        if (pref?.profile) {
          profile = pref.profile;
        }
      }
    }
  }

  if (!profile) {
    // Last resort: try the direct profile endpoint with a self-referencing trick
    const signInCheck = await anix('/auth/signIn/check', { method: 'POST', token, body: '', contentType: 'application/x-www-form-urlencoded' });
    if (signInCheck?.profile) {
      profile = signInCheck.profile;
    }
  }

  if (profile) {
    req.session.anixToken = token;
    req.session.anixUserId = profile.id;
    req.session.anixProfile = {
      id: profile.id,
      login: profile.login,
      avatar: profile.avatar,
      status: profile.status
    };

    let localUser = db.findUserByGoogleId(`anix_${profile.id}`);
    if (!localUser) {
      localUser = db.createUser({
        google_id: `anix_${profile.id}`,
        email: `${profile.login}@anixart.tv`,
        name: profile.login,
        avatar: profile.avatar || ''
      });
    } else {
      db.updateUserLogin(`anix_${profile.id}`, profile.login, profile.avatar || '');
      localUser = db.findUserByGoogleId(`anix_${profile.id}`);
    }
    req.session.localUserId = localUser.id;

    console.log(`[Token Auth] Success! User: ${profile.login}`);
    res.json({ code: 0, profile: req.session.anixProfile });
  } else {
    // Token might still be valid but we can't get profile
    // Save it anyway and let user check
    req.session.anixToken = token;
    console.log('[Token Auth] Token saved but could not fetch profile');
    res.json({ code: -1, error: 'Не удалось проверить токен. Убедитесь что токен действителен.' });
  }
});

app.post('/auth/anixart/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.json({ code: -1, error: 'Введите логин и пароль' });

  const data = await anix('/auth/signIn', {
    method: 'POST',
    body: `login=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}`,
    contentType: 'application/x-www-form-urlencoded'
  });
  if (!data) return res.json({ code: -1, error: 'Ошибка подключения к Anixart' });

  if (data.code === 0 && data.profileToken) {
    req.session.anixToken = data.profileToken.token;
    req.session.anixUserId = data.profile.id;
    req.session.anixProfile = {
      id: data.profile.id,
      login: data.profile.login,
      avatar: data.profile.avatar,
      status: data.profile.status
    };

    let localUser = db.findUserByGoogleId(`anix_${data.profile.id}`);
    if (!localUser) {
      localUser = db.createUser({
        google_id: `anix_${data.profile.id}`,
        email: `${data.profile.login}@anixart.tv`,
        name: data.profile.login,
        avatar: data.profile.avatar || ''
      });
    } else {
      db.updateUserLogin(`anix_${data.profile.id}`, data.profile.login, data.profile.avatar || '');
      localUser = db.findUserByGoogleId(`anix_${data.profile.id}`);
    }
    req.session.localUserId = localUser.id;
    res.json({ code: 0, profile: req.session.anixProfile });
  } else {
    const messages = { 2: 'Пользователь не найден', 3: 'Неверный логин или пароль', 5: 'Аккаунт заблокирован' };
    res.json({ code: data.code, error: messages[data.code] || `Ошибка авторизации (код ${data.code})` });
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/api/me', (req, res) => {
  if (!req.session?.anixProfile) return res.json({ user: null });
  res.json({
    user: {
      id: getLocalUserId(req),
      anixId: req.session.anixUserId,
      name: req.session.anixProfile.login,
      avatar: req.session.anixProfile.avatar,
      status: req.session.anixProfile.status,
      isAnixart: true
    }
  });
});

function requireAuth(req, res, next) {
  if (!req.session?.anixToken) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// === Profile ===
app.get('/api/anixart/profile', requireAuth, async (req, res) => {
  const data = await anix(`/profile/${getUserId(req)}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

app.get('/api/anixart/profile/:id', async (req, res) => {
  const data = await anix(`/profile/${req.params.id}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === Watch Lists ===
app.get('/api/anixart/list/:status/:page', requireAuth, async (req, res) => {
  const { status, page } = req.params;
  const sort = req.query.sort || 0;
  const data = await anix(`/profile/list/all/${getUserId(req)}/${page}/${status}?sort=${sort}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

app.post('/api/anixart/list/add/:status/:releaseId', requireAuth, async (req, res) => {
  const data = await anix(`/profile/list/add/${req.params.status}/${req.params.releaseId}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

app.post('/api/anixart/list/delete/:status/:releaseId', requireAuth, async (req, res) => {
  const data = await anix(`/profile/list/delete/${req.params.status}/${req.params.releaseId}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === Favorites ===
app.get('/api/anixart/favorites/:page', requireAuth, async (req, res) => {
  const sort = req.query.sort || 0;
  const data = await anix(`/favorite/all/${req.params.page}?sort=${sort}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

app.post('/api/anixart/favorite/add/:releaseId', requireAuth, async (req, res) => {
  const data = await anix(`/favorite/add/${req.params.releaseId}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

app.post('/api/anixart/favorite/delete/:releaseId', requireAuth, async (req, res) => {
  const data = await anix(`/favorite/delete/${req.params.releaseId}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === Vote ===
app.post('/api/anixart/vote/:releaseId/:score', requireAuth, async (req, res) => {
  const data = await anix(`/release/vote/add/${req.params.releaseId}/${req.params.score}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === Notifications ===
app.get('/api/anixart/notifications/count', requireAuth, async (req, res) => {
  const data = await anix('/notification/count', { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === History (synced from Anixart) ===
app.get('/api/anixart/history/:page', requireAuth, async (req, res) => {
  const data = await anix(`/history/${req.params.page}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === Friends ===
app.get('/api/anixart/friends/:userId/:page', async (req, res) => {
  const data = await anix(`/profile/friend/all/${req.params.userId}/${req.params.page}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

app.post('/api/anixart/friend/add/:userId', requireAuth, async (req, res) => {
  const data = await anix(`/profile/friend/request/send/${req.params.userId}`, { method: 'POST', token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === Discover ===
app.get('/api/anixart/discover/interesting', async (req, res) => {
  const data = await anix('/discover/interesting', { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

app.get('/api/anixart/discover/discussing', async (req, res) => {
  const data = await anix('/discover/discussing', { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

app.get('/api/anixart/discover/watching', async (req, res) => {
  const data = await anix('/discover/watching', { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

app.get('/api/anixart/discover/recommendations', requireAuth, async (req, res) => {
  const data = await anix('/discover/recommendations', { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === Home page data ===
app.get('/api/home', async (req, res) => {
  const token = getToken(req);
  const uid = getLocalUserId(req);

  // Fetch multiple sections in parallel
  const [popular, interesting, discussing, ongoingsP1, ongoingsP2] = await Promise.all([
    anix('/filter/0', { token, method: 'POST', body: { sort: 3 } }),
    anix('/discover/interesting', { token }),
    anix('/discover/discussing', { token }),
    anix('/filter/0', { token, method: 'POST', body: { status_id: 2, sort: 3 } }),
    anix('/filter/1', { token, method: 'POST', body: { status_id: 2, sort: 3 } })
  ]);
  const ongoingsRaw = { content: [...(ongoingsP1?.content || []), ...(ongoingsP2?.content || [])] };

  // Get user's completed/dropped/on-hold anime IDs to exclude
  const hideIds = new Set();
  if (uid) {
    const progress = db.getProgress(uid);
    progress.forEach(p => {
      if (['completed', 'dropped', 'on_hold'].includes(p.status)) {
        hideIds.add(String(p.anime_id));
      }
    });
  }
  const notSeen = r => !hideIds.has(String(r.id || r.releaseId));

  // Featured = deduplicated from interesting + popular, sorted by grade
  let featuredPool = (interesting?.content || []).concat(popular?.content || []);
  const seenIds = new Set();
  featuredPool = featuredPool.filter(r => {
    const id = r.id || r.releaseId;
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  }).filter(notSeen);
  // Sort: rated first, then by grade desc
  featuredPool.sort((a, b) => {
    const aScore = (a.grade || 0) * Math.max(a.vote_count || 0, 1);
    const bScore = (b.grade || 0) * Math.max(b.vote_count || 0, 1);
    return bScore - aScore;
  });
  // Enrich candidates with screenshots from Anixart + Shikimori in parallel
  // Take more candidates than needed so we can filter out those without screenshots
  let candidates = featuredPool.slice(0, 30);
  const enriched = await Promise.all(candidates.map(async r => {
    const id = r.id || r.releaseId;
    if (!id) return r;
    const title = r.title_original || r.title_or || '';

    // Fetch from Anixart and Shikimori in parallel
    const [detail, shikiData] = await Promise.all([
      anix(`/release/${id}`, { token }),
      title ? shikiScreenshots(title) : Promise.resolve([])
    ]);

    const rel = detail?.release;
    if (rel) {
      if (rel.screenshot_images?.length) r.screenshot_images = rel.screenshot_images.slice(0, 4);
      if (rel.description) r.description = rel.description;
      if (rel.genres?.length) r.genres = rel.genres;
      if (rel.category) r.category = rel.category;
      if (rel.status) r.status = rel.status;
      if (rel.episodes_total) r.episodes_total = rel.episodes_total;
    }

    // If Anixart has no screenshots, use Shikimori
    if (!r.screenshot_images?.length && shikiData.length) {
      r.screenshot_images = shikiData;
    }
    return r;
  }));

  // Only those with screenshots go to featured, up to 10
  const withScreens = enriched.filter(r => r.screenshot_images?.length);
  const withoutScreens = enriched.filter(r => !r.screenshot_images?.length);
  let featured = withScreens.length >= 10 ? withScreens.slice(0, 10) : [...withScreens, ...withoutScreens].slice(0, 10);

  // Popular grid (for carousel rows)
  const popularItems = (popular?.content || []).filter(notSeen).slice(0, 24);

  // Discussing
  const discussingItems = (discussing?.content || []).slice(0, 12);

  // Ongoings (4 pages × 4 = 16), filter out long-running series (>24 episodes)
  const ongoings = (ongoingsRaw?.content || []).filter(notSeen)
    .filter(r => {
      const total = r.episodes_total || 0;
      const released = r.episodes_released || 0;
      if (total > 24) return false;
      if (!total && released > 24) return false;
      return true;
    })
    .slice(0, 16);

  // Recommendations based on watch history
  let recommended = [];
  let recommendedBasis = '';
  if (uid) {
    const progress = db.getProgress(uid);
    const completed = progress.filter(p => p.status === 'completed' || p.current_episode > 0);
    if (completed.length > 0) {
      const random = completed[Math.floor(Math.random() * completed.length)];
      recommendedBasis = random.title || '';
      // Use genre-based filtering from anixart
      const recs = await anix('/discover/recommendations', { token });
      recommended = (recs?.content || []).filter(notSeen).slice(0, 8);
    }
  }

  // Popular with friends
  let friendsPopular = [];
  let hasFriends = false;
  if (uid) {
    const friends = db.getFriends(uid);
    hasFriends = friends.length > 0;
    const friendProgress = {};
    friends.slice(0, 20).forEach(f => {
      const fProg = db.getProgress(f.id);
      fProg.forEach(p => {
        if (!friendProgress[p.anime_id]) {
          friendProgress[p.anime_id] = { ...p, watchers: [] };
        }
        const u = db.findUserById(f.id);
        friendProgress[p.anime_id].watchers.push({
          id: f.id,
          username: u?.username || f.username || 'User',
          avatar: u?.avatar || ''
        });
      });
    });
    friendsPopular = Object.values(friendProgress)
      .filter(fp => !hideIds.has(String(fp.anime_id)))
      .sort((a, b) => b.watchers.length - a.watchers.length)
      .slice(0, 16);
    // Enrich with full release data
    friendsPopular = await Promise.all(friendsPopular.map(async fp => {
      const id = fp.anime_id;
      if (!id) return fp;
      try {
        const detail = await anix(`/release/${id}`, { token });
        const rel = detail?.release;
        if (!rel) return fp;
        return { ...rel, id: id, watchers: fp.watchers };
      } catch(e) { return fp; }
    }));
  }

  // Continue watching — shows anime with status "watching", enriched with full data
  let continueWatching = [];
  if (uid) {
    const progress = db.getProgress(uid);
    const watching = progress.filter(p => p.status === 'watching').slice(0, 8);
    continueWatching = await Promise.all(watching.map(async p => {
      const id = p.anime_id;
      if (!id) return { anime_id: id, title: p.title, image: p.image };
      try {
        const detail = await anix(`/release/${id}`, { token });
        const rel = detail?.release;
        if (!rel) return { anime_id: id, title: p.title, image: p.image };
        return { ...rel, id: id };
      } catch(e) { return { anime_id: id, title: p.title, image: p.image }; }
    }));
  }

  // Compute user's top genres from watch history
  let userTopGenres = [];
  if (uid) {
    const allProgress = db.getProgress(uid);
    const genreCount = {};
    allProgress.forEach(p => {
      if (p.genres) {
        const gs = typeof p.genres === 'string' ? p.genres.split(',') : (Array.isArray(p.genres) ? p.genres : []);
        gs.forEach(g => {
          const name = (typeof g === 'string' ? g.trim() : (g.name || '')).toLowerCase();
          if (name) genreCount[name] = (genreCount[name] || 0) + 1;
        });
      }
    });
    userTopGenres = Object.entries(genreCount).sort((a,b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  }

  res.json({
    featured,
    popular: popularItems,
    discussing: discussingItems,
    recommended,
    recommendedBasis,
    friendsPopular,
    hasFriends,
    userTopGenres,
    continueWatching,
    ongoings
  });
});

// === Infinite recommendations ===
app.get('/api/infinite-recs', async (req, res) => {
  const token = getToken(req);
  const uid = getLocalUserId(req);
  const page = parseInt(req.query.page) || 0;
  const genre = req.query.genre || '';
  const basisId = req.query.basis || '';

  // Build hideIds
  const hideIds = new Set();
  if (uid) {
    const progress = db.getProgress(uid);
    progress.forEach(p => {
      if (['completed', 'dropped', 'on_hold'].includes(p.status))
        hideIds.add(String(p.anime_id));
    });
  }
  const notSeen = r => !hideIds.has(String(r.id || r.releaseId));

  let items = [];
  let title = '';

  if (basisId) {
    // "Because you watched X" — get similar/related
    const detail = await anix(`/release/${basisId}`, { token });
    const rel = detail?.release;
    if (rel) {
      title = 'Так как вы смотрели «' + (rel.title_ru || rel.title || '') + '»';
      const related = rel.recommended_releases || rel.related_releases || [];
      items = related.filter(notSeen).slice(0, 12);
      // If not enough, search by same genres
      if (items.length < 8 && rel.genres) {
        const genreNames = typeof rel.genres === 'string'
          ? rel.genres.split(',').map(g => g.trim()).filter(Boolean)
          : (Array.isArray(rel.genres) ? rel.genres.map(g => g.name || g) : []);
        if (genreNames.length) {
          const more = await anix('\\filter\\0', { token, method: 'POST', body: { genres: genreNames.slice(0, 2), sort: 3 } });
          const moreItems = (more?.content || []).filter(notSeen).filter(r => String(r.id || r.releaseId) !== String(basisId));
          const existIds = new Set(items.map(r => String(r.id || r.releaseId)));
          moreItems.forEach(r => {
            if (items.length < 12 && !existIds.has(String(r.id || r.releaseId))) items.push(r);
          });
        }
      }
    }
  } else if (genre) {
    // "Popular in genre X"
    title = 'Популярное из «' + genre.charAt(0).toUpperCase() + genre.slice(1) + '»';
    const data = await anix('\\filter\\' + page, { token, method: 'POST', body: { genres: [genre], sort: 3 } });
    items = (data?.content || []).filter(notSeen).slice(0, 12);
  }

  res.json({ title, items });
});

// === Release ===
app.get('/api/release/:id', async (req, res) => {
  const data = await anix(`/release/${req.params.id}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === Screenshots proxy — only real screenshots from Shikimori ===
const _screenCache = {};

function stripSeason(title) {
  return title
    .replace(/\s*\d+(st|nd|rd|th)\s*Season/i, '')
    .replace(/\s*(Season|Part|Cour)\s*\d+/i, '')
    .replace(/\s+\d+$/, '')
    .replace(/\s*(OVA|ONA|Movie|Specials?|Recap).*$/i, '')
    .trim();
}

async function shikiScreenshots(query) {
  try {
    const r = await fetch('https://shikimori.one/api/animes?search=' + encodeURIComponent(query) + '&limit=5', {
      headers: { 'User-Agent': 'AnixardPC/1.0' }
    });
    const results = await r.json();
    for (const anime of (results || []).slice(0, 5)) {
      const sr = await fetch('https://shikimori.one/api/animes/' + anime.id + '/screenshots', {
        headers: { 'User-Agent': 'AnixardPC/1.0' }
      });
      const screens = await sr.json();
      if (screens?.length >= 2) {
        return screens.slice(0, 4).map(s => 'https://shikimori.one' + (s.original || s.preview));
      }
    }
  } catch(e) {}
  return [];
}

app.get('/api/screenshots', async (req, res) => {
  const title = (req.query.title || '').trim();
  if (!title) return res.json({ screenshots: [] });
  if (_screenCache[title]) return res.json({ screenshots: _screenCache[title] });

  try {
    // 1. Try exact title
    let urls = await shikiScreenshots(title);

    // 2. Try stripped (no season/part numbers)
    if (!urls.length) {
      const base = stripSeason(title);
      if (base && base !== title) urls = await shikiScreenshots(base);
    }

    // 3. Try first 2-3 words only
    if (!urls.length) {
      const words = title.split(/\s+/).slice(0, 3).join(' ');
      if (words && words !== title) urls = await shikiScreenshots(words);
    }

    _screenCache[title] = urls;
    res.json({ screenshots: urls });
  } catch (e) {
    res.json({ screenshots: [] });
  }
});

// === Comments ===
// === Reviews (Steam-style) ===
app.get('/api/release/:id/reviews', (req, res) => {
  const releaseId = parseInt(req.params.id);
  const page = parseInt(req.query.page) || 1;
  const uid = getLocalUserId(req);
  const friendIds = uid ? db.getFriends(uid).map(f => f.id) : [];

  const data = db.getReviews(releaseId, page, 100);
  const enriched = data.reviews.map(r => {
    const u = db.findUserById(r.user_id);
    return { ...r, login: u?.name || u?.username || '?', avatar: u?.avatar || null, is_friend: friendIds.includes(r.user_id) };
  });
  // Friends first, then by date
  enriched.sort((a, b) => {
    if (a.is_friend && !b.is_friend) return -1;
    if (!a.is_friend && b.is_friend) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  const perPage = 10;
  const start = (page - 1) * perPage;
  const paged = enriched.slice(start, start + perPage);
  const stats = db.getReviewStats(releaseId);
  res.json({ reviews: paged, stats, total: data.total, page, pages: Math.ceil(data.total / perPage) });
});

app.get('/api/release/:id/my-review', (req, res) => {
  const uid = getLocalUserId(req);
  if (!uid) return res.json({ review: null });
  const review = db.getUserReview(uid, parseInt(req.params.id));
  res.json({ review });
});

app.post('/api/release/:id/review', (req, res) => {
  const uid = getLocalUserId(req);
  if (!uid) return res.status(401).json({ error: 'Не авторизован' });
  const { text, recommend, spoiler, title, episode } = req.body;
  if (!text?.trim() || text.length > 5000) return res.json({ error: 'Текст обзора пуст или слишком длинный' });
  const review = db.addReview(uid, parseInt(req.params.id), text.trim(), !!recommend, !!spoiler, title || '', episode);
  res.json({ ok: true, review });
});

app.delete('/api/review/:id', (req, res) => {
  const uid = getLocalUserId(req);
  if (!uid) return res.status(401).json({ error: 'Не авторизован' });
  res.json({ ok: db.deleteReview(parseInt(req.params.id), uid) });
});

app.post('/api/review/:id/react', (req, res) => {
  const uid = getLocalUserId(req);
  if (!uid) return res.status(401).json({ error: 'Не авторизован' });
  const { type } = req.body;
  if (!['yes','no','funny'].includes(type)) return res.json({ error: 'Invalid type' });
  const r = db.reactReview(parseInt(req.params.id), uid, type);
  res.json({ ok: !!r, reactions: r?.reactions });
});

// === Episodes ===
app.get('/api/episode/:releaseId', async (req, res) => {
  const data = await anix(`/episode/${req.params.releaseId}`);
  res.json(data || { error: 'Failed' });
});

app.get('/api/episode/:releaseId/:typeId', async (req, res) => {
  const data = await anix(`/episode/${req.params.releaseId}/${req.params.typeId}`);
  res.json(data || { error: 'Failed' });
});

app.get('/api/episode/:releaseId/:typeId/:sourceId', async (req, res) => {
  const data = await anix(`/episode/${req.params.releaseId}/${req.params.typeId}/${req.params.sourceId}`);
  res.json(data || { error: 'Failed' });
});

// === Search (multi-target) ===
// Keyboard layout translit: EN→RU
const enToRu = {'q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з','[':'х',']':'ъ',
  'a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д',';':'ж',"'":'э',
  'z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь',',':'б','.':'ю'};
const ruToEn = Object.fromEntries(Object.entries(enToRu).map(([k,v])=>[v,k]));

function fixLayout(s) {
  // If string looks like wrong keyboard layout, convert
  const hasEn = /[a-zA-Z]/.test(s);
  const hasRu = /[а-яА-ЯёЁ]/.test(s);
  if (hasEn && !hasRu) {
    return s.split('').map(c => enToRu[c.toLowerCase()] || c).join('');
  }
  return s;
}

app.post('/api/search/:where/:searchBy/:page', async (req, res) => {
  const { where, page } = req.params;
  const query = req.body?.query || '';

  // Try original query first
  let data = await anix(`/search/${where}/${page}`, {
    method: 'POST', body: req.body, token: getToken(req), apiV2: true
  });
  if (data?.releases) data.content = data.releases;

  // If no results, try layout-fixed query
  if ((!data?.content || data.content.length === 0) && query) {
    const fixed = fixLayout(query);
    if (fixed !== query) {
      const data2 = await anix(`/search/${where}/${page}`, {
        method: 'POST', body: { ...req.body, query: fixed }, token: getToken(req), apiV2: true
      });
      if (data2?.releases) data2.content = data2.releases;
      if (data2?.content?.length) data = data2;
    }
  }

  // Sort results: season 1 first, then by season number
  if (data?.content?.length) {
    data.content.sort((a, b) => {
      const aTitle = a.title_ru || a.title || '';
      const bTitle = b.title_ru || b.title || '';
      const aSeason = _extractSeason(aTitle);
      const bSeason = _extractSeason(bTitle);
      return aSeason - bSeason;
    });

    // Enrich with category from /release/{id} (search API doesn't return it)
    await Promise.all(data.content.map(async (r) => {
      if (!r.category) {
        try {
          const detail = await anix('/release/' + (r.id || r.releaseId), { token: getToken(req) });
          if (detail?.release?.category) r.category = detail.release.category;
        } catch(e) {}
      }
    }));
  }

  res.json(data || { error: 'Failed' });
});

function _extractSeason(title) {
  // Match "2", "3", etc at end, or "Season 2", "Сезон 2", "часть 2", "2nd season"
  const m = title.match(/\b(\d+)(?:\s*(?:сезон|season|часть|part))?\s*$/i) ||
            title.match(/(?:сезон|season|часть|part)\s*(\d+)/i) ||
            title.match(/\s(\d+)\s*$/);
  if (m) return parseInt(m[1]);
  // No number = season 1
  return 1;
}

// Legacy search endpoint
app.post('/api/search/releases/:page', async (req, res) => {
  const data = await anix(`/search/releases/${req.params.page}`, {
    method: 'POST', body: req.body, token: getToken(req), apiV2: true
  });
  if (data?.releases) data.content = data.releases;
  res.json(data || { error: 'Failed' });
});

// === Filter ===
app.post('/api/filter/releases/:page', async (req, res) => {
  const data = await anix(`/filter/${req.params.page}`, {
    method: 'POST', body: req.body, token: getToken(req)
  });
  res.json(data || { error: 'Failed' });
});

// === Schedule ===
app.get('/api/schedule', async (req, res) => {
  const data = await anix('/schedule', { token: getToken(req) });
  if (data) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const content = days.map(d => data[d] || []);
    res.json({ code: data.code, content });
  } else {
    res.json({ error: 'Failed' });
  }
});

// === Top ===
app.post('/api/top/releases/:page', async (req, res) => {
  const data = await anix(`/top/release/${req.params.page}`, {
    method: 'POST', body: req.body || {}, token: getToken(req)
  });
  res.json(data || { error: 'Failed' });
});

app.get('/api/top/releases/:page', async (req, res) => {
  const data = await anix(`/top/release/${req.params.page}`, {
    method: 'POST', body: {}, token: getToken(req)
  });
  res.json(data || { error: 'Failed' });
});

// === Collections ===
app.get('/api/collection/all/:page', async (req, res) => {
  const data = await anix(`/collection/all/${req.params.page}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

app.get('/api/collection/:id', async (req, res) => {
  const data = await anix(`/collection/${req.params.id}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

app.get('/api/collection/favorites/:page', requireAuth, async (req, res) => {
  const data = await anix(`/collectionMy/favorites/${req.params.page}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === Related / Franchise ===
app.get('/api/release/related/:id', async (req, res) => {
  const data = await anix(`/release/related/${req.params.id}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === Streaming platforms ===
app.get('/api/release/streaming/:id', async (req, res) => {
  const data = await anix(`/release/streaming/platform/${req.params.id}`, { token: getToken(req) });
  res.json(data || { error: 'Failed' });
});

// === Local user data (offline features) ===
function getLocalUserId(req) {
  return req.session?.localUserId || req.session?.userId || null;
}
function requireLocalAuth(req, res, next) {
  if (!getLocalUserId(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/api/favorites', requireLocalAuth, (req, res) => {
  res.json({ data: db.getFavorites(getLocalUserId(req)) });
});

app.post('/api/favorites', requireLocalAuth, (req, res) => {
  const { anime_id, title, image } = req.body;
  db.addFavorite(getLocalUserId(req), anime_id, title, image);
  res.json({ success: true });
});

app.delete('/api/favorites/:animeId', requireLocalAuth, (req, res) => {
  db.removeFavorite(getLocalUserId(req), parseInt(req.params.animeId));
  res.json({ success: true });
});

app.get('/api/favorites/check/:animeId', requireLocalAuth, (req, res) => {
  res.json({ isFavorite: db.isFavorite(getLocalUserId(req), parseInt(req.params.animeId)) });
});

app.get('/api/history', requireLocalAuth, (req, res) => {
  res.json({ data: db.getHistory(getLocalUserId(req)) });
});

app.post('/api/history', requireLocalAuth, (req, res) => {
  const { anime_id, episode, title, image } = req.body;
  db.addHistory(getLocalUserId(req), anime_id, episode, title, image);
  res.json({ success: true });
});

app.get('/api/progress', requireLocalAuth, (req, res) => {
  res.json({ data: db.getProgress(getLocalUserId(req)) });
});

app.get('/api/progress/:animeId', requireLocalAuth, (req, res) => {
  res.json({ data: db.getProgressForAnime(getLocalUserId(req), parseInt(req.params.animeId)) });
});

app.post('/api/progress', requireLocalAuth, (req, res) => {
  db.upsertProgress(getLocalUserId(req), req.body);
  res.json({ success: true });
});

app.post('/api/watchtime', requireLocalAuth, (req, res) => {
  const { anime_id, seconds } = req.body;
  db.addWatchTime(getLocalUserId(req), anime_id, seconds);
  res.json({ success: true });
});

app.post('/api/watching', requireLocalAuth, (req, res) => {
  db.setWatching(getLocalUserId(req), req.body.title || null);
  res.json({ success: true });
});

// Friends who watched/are watching this anime
app.get('/api/release/:id/friends', requireLocalAuth, (req, res) => {
  const uid = getLocalUserId(req);
  const animeId = parseInt(req.params.id);
  const friends = db.getFriends(uid);
  const watching = [];
  const watched = [];
  const planned = [];
  friends.forEach(f => {
    const prog = db.getProgressForAnime(f.id, animeId);
    if (prog) {
      const info = { id: f.id, name: f.name, username: f.username, avatar: f.avatar, status: prog.status, episode: prog.current_episode, score: prog.score, updated_at: prog.updated_at };
      if (prog.status === 'watching') watching.push(info);
      else if (prog.status === 'planned') planned.push(info);
      else if (prog.status === 'completed' || prog.status === 'dropped' || prog.status === 'on_hold') watched.push(info);
    }
  });
  res.json({ watching, watched, planned });
});

app.get('/api/stats', requireLocalAuth, (req, res) => {
  res.json(db.getStats(getLocalUserId(req)));
});

// === Manga Section: Remanga API + Voiceover Search ===

const REMANGA_API = 'https://api.remanga.org/api';
const INVIDIOUS_INSTANCES = [
  'https://vid.puffyan.us',
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks'
];

async function remanga(endpoint, params = {}) {
  try {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `${REMANGA_API}${endpoint}?${qs}` : `${REMANGA_API}${endpoint}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    console.error(`Remanga error [${endpoint}]:`, err.message);
    return null;
  }
}

// Parse YouTube search/channel page for videos
function parseYouTubeVideos(html) {
  const match = html.match(/var ytInitialData = ({.+?});<\/script>/s);
  if (!match) return [];
  try {
    const data = JSON.parse(match[1]);
    // Works for both search results and channel search
    let contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    // Channel tab contents
    if (!contents.length) {
      const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
      for (const tab of tabs) {
        const items = tab?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
        if (items.length) { contents = items; break; }
      }
    }
    return contents
      .filter(c => c.videoRenderer)
      .map(c => {
        const v = c.videoRenderer;
        const videoId = v.videoId;
        const title = v.title?.runs?.[0]?.text || '';
        const channel = v.ownerText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || '';
        const channelUrl = v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl
          || v.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || '';
        const durText = v.lengthText?.simpleText || '0:00';
        const durParts = durText.split(':').map(Number);
        const duration = durParts.length === 3 ? durParts[0]*3600 + durParts[1]*60 + durParts[2] : durParts[0]*60 + (durParts[1]||0);
        return {
          source: 'youtube', video_id: videoId, title, channel, channelHandle: channelUrl,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration, url: `https://youtube.com/watch?v=${videoId}`
        };
      });
  } catch (e) { return []; }
}

const YT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9'
};

// Search YouTube channel for manga title
async function searchYouTubeChannel(handle, mangaTitle) {
  try {
    const url = `https://www.youtube.com/${handle}/search?query=${encodeURIComponent(mangaTitle)}`;
    const res = await fetch(url, { headers: YT_HEADERS, signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    return parseYouTubeVideos(html).slice(0, 10);
  } catch (e) {
    console.error(`YT channel search error [${handle}]:`, e.message);
    return [];
  }
}

// General YouTube search (fallback)
async function searchYouTube(query) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    const res = await fetch(url, { headers: YT_HEADERS, signal: AbortSignal.timeout(15000) });
    return parseYouTubeVideos(await res.text()).slice(0, 15);
  } catch (e) {
    console.error('YouTube search error:', e.message);
    return [];
  }
}

async function searchVkVideos(query) {
  const token = process.env.VK_SERVICE_TOKEN;
  if (!token) return [];
  try {
    const url = `https://api.vk.com/method/video.search?q=${encodeURIComponent(query)}&count=15&sort=2&v=5.131&access_token=${token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (!data?.response?.items) return [];
    return data.response.items.map(v => ({
      source: 'vk',
      video_id: `${v.owner_id}_${v.id}`,
      title: v.title,
      channel: v.owner_id > 0 ? `user${v.owner_id}` : `club${Math.abs(v.owner_id)}`,
      thumbnail: v.image?.[v.image.length - 1]?.url || '',
      duration: v.duration || 0,
      url: `https://vk.com/video${v.owner_id}_${v.id}`,
      player: v.player
    }));
  } catch (e) {
    console.error('VK search error:', e.message);
    return [];
  }
}

// Rutube search (free API, no keys needed)
async function searchRutube(query) {
  try {
    const url = `https://rutube.ru/api/search/video/?query=${encodeURIComponent(query)}&page=1&perPage=15`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    if (!data?.results) return [];
    return data.results.map(v => ({
      source: 'rutube',
      video_id: v.id || v.video_id,
      title: v.title || '',
      channel: v.author?.name || '',
      thumbnail: v.thumbnail_url || '',
      duration: v.duration || 0,
      url: v.video_url || `https://rutube.ru/video/${v.id}/`
    }));
  } catch (e) {
    console.error('Rutube search error:', e.message);
    return [];
  }
}

// Telegram channel search — scrapes public t.me/s/ pages
let TG_VOICEOVER_CHANNELS = [
  'mehanika_tm', 'lightfoxmanga', 'n2a_ozvuchka', 'ozvuchka_mangi',
  'manhwa_voice', 'voiceoverAV', 'voice_manhwa'
];

async function searchTelegram(query) {
  const results = [];
  const queryLower = query.toLowerCase();

  for (const ch of TG_VOICEOVER_CHANNELS) {
    try {
      const url = `https://t.me/s/${ch}?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000)
      });
      const html = await res.text();
      const channelTitle = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || ch;

      // Split into message blocks
      const blocks = html.split('tgme_widget_message_wrap').slice(1);
      for (const block of blocks) {
        const postLink = (block.match(/data-post="([^"]+)"/) || [])[1];
        if (!postLink) continue;
        const text = (block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
        const cleanText = text.replace(/<[^>]+>/g, '').trim();
        if (!cleanText) continue;

        // Check if post mentions our query
        if (!cleanText.toLowerCase().includes(queryLower.substring(0, Math.min(queryLower.length, 10)))) continue;

        const postUrl = `https://t.me/${postLink}`;
        const hasDirectVideo = block.includes('tgme_widget_message_video_player');

        // 1) Direct video in Telegram post
        if (hasDirectVideo) {
          const thumb = (block.match(/background-image:url\('([^']+)'\)/) || [])[1] || '';
          results.push({
            source: 'telegram',
            video_id: postLink.replace('/', '_'),
            title: cleanText.substring(0, 200),
            channel: channelTitle,
            thumbnail: thumb.startsWith('//') ? 'https:' + thumb : thumb,
            duration: 0,
            url: postUrl
          });
        }

        // 2) YouTube links in post text
        const ytLinks = [...text.matchAll(/href="(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})[^"]*)"/g)];
        for (const [, fullUrl, videoId] of ytLinks) {
          results.push({
            source: 'youtube',
            video_id: videoId,
            title: cleanText.substring(0, 200),
            channel: channelTitle + ' (TG)',
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: 0,
            url: `https://youtube.com/watch?v=${videoId}`
          });
        }

        // 3) Rutube links in post text
        const rtLinks = [...text.matchAll(/href="(https?:\/\/rutube\.ru\/video\/([a-f0-9-]+)\/?[^"]*)"/g)];
        for (const [, fullUrl, videoId] of rtLinks) {
          results.push({
            source: 'rutube',
            video_id: videoId,
            title: cleanText.substring(0, 200),
            channel: channelTitle + ' (TG)',
            thumbnail: '',
            duration: 0,
            url: fullUrl
          });
        }
      }
    } catch (e) {
      // Skip channel on error
    }
  }
  console.log(`[Telegram] Searched ${TG_VOICEOVER_CHANNELS.length} channels for "${query}": ${results.length} results`);
  return results;
}

// VK Video search via HTML scraping (no token needed)
async function searchVkVideoNoToken(query) {
  try {
    const url = `https://vk.com/search?c%5Bper_page%5D=15&c%5Bq%5D=${encodeURIComponent(query)}&c%5Bsection%5D=auto&c%5Bsort%5D=2&z=video`;
    const res = await fetch(`https://vk.com/video?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'ru-RU,ru;q=0.9' },
      signal: AbortSignal.timeout(10000)
    });
    const html = await res.text();
    const videos = [];
    // Parse video items from VK HTML
    const regex = /data-id="(-?\d+_\d+)"[^>]*>[\s\S]*?class="VideoCard__title"[^>]*>([^<]+)/g;
    let m;
    while ((m = regex.exec(html)) !== null && videos.length < 15) {
      videos.push({
        source: 'vk',
        video_id: m[1],
        title: m[2].trim(),
        channel: '',
        thumbnail: '',
        duration: 0,
        url: `https://vk.com/video${m[1]}`
      });
    }
    return videos;
  } catch (e) {
    return [];
  }
}

// Manga catalog
app.get('/api/manga/catalog/:page', async (req, res) => {
  const page = parseInt(req.params.page) || 1;
  const ordering = req.query.ordering || '-rating';
  const genres = req.query.genres || '';
  const params = { ordering, page, count: 30 };
  if (genres) params.genres = genres;
  if (req.query.types) params.types = req.query.types;
  if (req.query.status) params.status = req.query.status;
  const data = await remanga('/titles/', params);
  res.json(data || { content: [] });
});

// Manga search
app.get('/api/manga/search', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json({ content: [] });
  const data = await remanga('/search/', { query: q, count: 30 });
  res.json(data || { content: [] });
});

// Discover — search manga by name, cache it, auto-search voiceovers on YouTube
app.post('/api/manga/discover', async (req, res) => {
  const q = (req.body.query || '').trim();
  if (!q || q.length < 2) return res.json({ results: [], error: 'Слишком короткий запрос' });

  // 1) Search Remanga
  console.log(`[Discover] Searching Remanga for: "${q}"`);
  const data = await remanga('/search/', { query: q, count: 15 });
  console.log(`[Discover] Remanga returned ${data?.content?.length || 0} results`);
  const titles = data?.content || [];
  if (!titles.length) return res.json({ results: [], message: 'На Remanga ничего не найдено' });

  const results = [];

  for (let i = 0; i < titles.length; i++) {
    const c = titles[i];
    // Cache manga in our DB
    const cached = db.cacheManga({
      slug: c.dir || c.slug,
      remanga_id: c.id,
      title_ru: c.rus_name || c.name,
      title_en: c.en_name || c.name,
      cover: c.img?.high || c.img?.mid || '',
      genres: (c.genres || []).map(g => g.name),
      rating: c.avg_rating || 0,
      chapters_count: c.count_chapters || 0,
      status: c.status?.name || '',
      description: c.description || ''
    });

    // Check existing voiceovers
    const existing = db.getVoiceovers(cached.id);
    if (existing.length > 0) {
      results.push({ ...cached, voiceover_count: existing.length });
      continue;
    }

    // Only deep-search first 5 titles to keep response fast
    if (i >= 5) continue;

    // Search all platforms for voiceovers
    const titleRu = cached.title_ru || '';
    const titleEn = cached.title_en || '';
    const title = titleRu || titleEn;
    let allVideos = [];

    // YouTube — RU and EN names
    const ytQueries = [];
    if (titleRu) ytQueries.push(`${titleRu} озвучка`, `${titleRu} озвучка манги`);
    if (titleEn) ytQueries.push(`${titleEn} озвучка`, `${titleEn} озвучка манги`);
    for (const sq of ytQueries) {
      try { allVideos.push(...await searchYouTube(sq)); } catch (e) {}
      await new Promise(r => setTimeout(r, 500));
    }

    // VK Video
    try {
      const vkQ = `${title} озвучка манги`;
      const vkResults = await searchVkVideos(vkQ);
      if (vkResults.length) allVideos.push(...vkResults);
      else allVideos.push(...await searchVkVideoNoToken(vkQ));
    } catch (e) {}

    // Rutube
    try {
      allVideos.push(...await searchRutube(`${title} озвучка манги`));
    } catch (e) {}

    // Telegram channels
    try {
      allVideos.push(...await searchTelegram(title));
    } catch (e) {}

    // YouTube channels
    const channels = db.getChannels().filter(ch => ch.platform === 'youtube');
    for (const ch of channels) {
      try { allVideos.push(...await searchYouTubeChannel(ch.handle, title)); } catch (e) {}
    }

    // Filter — must be a voiceover AND match this manga
    let added = 0;
    const candidates = [];
    // Build match criteria from both RU and EN names
    const ruLower = titleRu.toLowerCase();
    const enLower = titleEn.toLowerCase();
    const ruStopWords = ['озвучка','манги','манхвы','главы','глава','стал','стала','стало','был','была','было','получил','попал','мире','после','перед','через','всех','этот','свой','один','мной','тебя','него','себя','очень','другой','новый','самый','более','менее','когда','тоже','даже','если'];
    const enStopWords = ['the','and','after','from','with','that','this','was','has','had','have','been','into','became','world','where','who','how','what','when','then','than','they','their','there','being','about','would','could','should','just','like','over','only','also','some','many','most','very','more','other'];
    const ruWords = ruLower.split(/\s+/).filter(w => w.length >= 3 && !ruStopWords.includes(w));
    const enWords = enLower.split(/\s+/).filter(w => w.length >= 3 && !enStopWords.includes(w));
    const seen = new Set();

    for (const v of allVideos) {
      if (seen.has(v.video_id)) continue;
      seen.add(v.video_id);
      // Must be at least 10 min
      if (v.duration > 0 && v.duration < 600) continue;

      const vt = (v.title || '').toLowerCase();

      // Reject obvious non-voiceover junk
      const reject = /реакция|reaction|обзор|review|трейлер|trailer|amv|mmv|edit|мем|meme|прикол|tiktok|shorts|opening|опенинг|ending|ost|клип|топ\s*\d|теори[яи]|разбор\s|стрим|stream|live|дорам[аы]|drama|фильм|movie|марафон|resumen|за\s*\d+\s*мин|gacha|гача|сериал[аыов]?\b|\d+\s*сери[яи]|аниме.?сериал|аниме.?онлайн|roblox|роблокс|minecraft|майнкрафт|fortnite/i;
      if (reject.test(v.title)) continue;

      // Must have some voice/chapter context
      const hasVoice = /озвучк|озвучи[лт]|озвучен|дубляж/i.test(v.title);
      const hasChapters = /\d+\s*[-–]\s*\d+/.test(v.title);
      if (!hasVoice && !hasChapters) continue;

      // Match checks: video must relate to THIS manga
      const ruWC = ruLower.split(/\s+/).length;
      const enWC = enLower.split(/\s+/).length;
      const segments = v.title.split(/[|•·—–/\\]/).map(s => s.toLowerCase().trim());

      // 1) Full RU or EN name in video title
      let ruFull = ruLower.length >= 5 && vt.includes(ruLower);
      let enFull = enLower.length >= 5 && vt.includes(enLower);

      // For 1-word names: require context (not just the word appearing somewhere)
      if (ruFull && ruWC === 1 && ruLower.length < 15) {
        const inCtx = segments.some(seg => seg.includes(ruLower) && seg.split(/\s+/).length <= 8 && /озвучк|манг|манхв|глав|\d+\s*[-–]\s*\d+/i.test(seg));
        const quoted = new RegExp(`["«"']\\s*${ruLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*["»"']`, 'i').test(vt);
        if (!inCtx && !quoted) ruFull = false;
      }
      // For 2-word names: require context
      if (ruFull && ruWC === 2 && ruLower.length < 20) {
        const inCtx = segments.some(seg => seg.includes(ruLower) && /озвучк|манг|манхв|глав|\d+\s*[-–]\s*\d+/i.test(seg));
        const quoted = new RegExp(`["«"'].*${ruLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*["»"']`, 'i').test(vt);
        const afterOz = new RegExp(`озвучк[аи]?\\s+(манг[аиы]?\\s+)?${ruLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(vt);
        if (!inCtx && !quoted && !afterOz) ruFull = false;
      }

      // 2) Word matching — threshold depends on name length
      const ruMatched = ruWords.length >= 2 ? ruWords.filter(w => vt.includes(w)).length : 0;
      const enMatched = enWords.length >= 2 ? enWords.filter(w => vt.includes(w)).length : 0;
      // Short names: ALL words. Long names: 60%
      const ruThreshold = ruWords.length <= 3 ? ruWords.length : Math.ceil(ruWords.length * 0.6);
      const enThreshold = enWords.length <= 3 ? enWords.length : Math.ceil(enWords.length * 0.6);
      const ruWordOk = ruWords.length >= 2 && ruMatched >= ruThreshold;
      const enWordOk = enWords.length >= 2 && enMatched >= enThreshold;

      if (!ruFull && !enFull && !ruWordOk && !enWordOk) continue;

      candidates.push(v);
    }

    // AI verification via Grok — batch check candidates
    if (candidates.length > 0 && _grokKeys.length > 0) {
      const verified = await grokBatchVerify(titleRu, titleEn, candidates);
      for (let ci = 0; ci < candidates.length; ci++) {
        if (verified[ci]) {
          const vo = db.addVoiceover({ manga_id: cached.id, ...candidates[ci], is_auto: true });
          if (vo) added++;
        }
      }
      // If there are more than 10 candidates, verify the rest
      if (candidates.length > 10) {
        const rest = candidates.slice(10);
        const verified2 = await grokBatchVerify(titleRu, titleEn, rest);
        for (let ci = 0; ci < rest.length; ci++) {
          if (verified2[ci]) {
            const vo = db.addVoiceover({ manga_id: cached.id, ...rest[ci], is_auto: true });
            if (vo) added++;
          }
        }
      }
    } else {
      // No Grok keys — save all candidates
      for (const v of candidates) {
        const vo = db.addVoiceover({ manga_id: cached.id, ...v, is_auto: true });
        if (vo) added++;
      }
    }

    db.logSearch(cached.id, 'youtube', title, allVideos.length);

    const voiceovers = db.getVoiceovers(cached.id);
    if (voiceovers.length > 0 || added > 0) {
      results.push({ ...cached, voiceover_count: voiceovers.length });
    }
  }

  res.json({ results, total_searched: titles.length });
});

// Manga detail
app.get('/api/manga/detail/:slug', async (req, res) => {
  const data = await remanga(`/titles/${req.params.slug}/`);
  if (data?.content) {
    const c = data.content;
    const cached = db.cacheManga({
      slug: c.dir || req.params.slug,
      remanga_id: c.id,
      title_ru: c.rus_name || c.name,
      title_en: c.en_name || c.name,
      cover: c.img?.high || c.img?.mid || '',
      genres: (c.genres || []).map(g => g.name),
      rating: c.avg_rating || 0,
      chapters_count: c.count_chapters || 0,
      status: c.status?.name || '',
      description: c.description || ''
    });
    data._cacheId = cached.id;
    return res.json(data);
  }
  // Fallback: try local cache if Remanga API didn't find it
  let cached = db.getMangaBySlug(req.params.slug);
  // Also try partial slug match (e.g. "the-best-sword" matches "the-best-swordsman_")
  if (!cached) {
    const all = db.getAllMangaCache ? db.getAllMangaCache() : [];
    cached = all.find(m => m.slug && (m.slug.startsWith(req.params.slug) || req.params.slug.startsWith(m.slug)));
  }
  if (cached) {
    return res.json({
      content: {
        id: cached.remanga_id || cached.id,
        dir: cached.slug,
        rus_name: cached.title_ru,
        en_name: cached.title_en,
        name: cached.title_en || cached.title_ru,
        img: { high: cached.cover, mid: cached.cover },
        genres: (cached.genres || []).map(g => ({ name: g })),
        avg_rating: cached.rating,
        count_chapters: cached.chapters_count,
        status: cached.status ? { name: cached.status } : null,
        description: cached.description || '',
        type: null
      },
      _cacheId: cached.id
    });
  }
  res.json({ content: null });
});

// Voiceovers for manga
app.get('/api/manga/:id/voiceovers', (req, res) => {
  const mangaId = parseInt(req.params.id);
  res.json({ voiceovers: db.getVoiceovers(mangaId) });
});

// Auto-search voiceovers (searches saved channels first, then fallback to general)
app.post('/api/manga/:id/voiceovers/search', async (req, res) => {
  const mangaId = parseInt(req.params.id);
  const manga = db.getMangaById(mangaId);
  if (!manga) return res.json({ error: 'Manga not found' });

  // Check if recently searched
  const ytLog = db.getSearchLog(mangaId, 'youtube');
  const recentEnough = ytLog && (Date.now() - new Date(ytLog.searched_at).getTime() < 24 * 3600 * 1000);
  if (recentEnough) {
    return res.json({ voiceovers: db.getVoiceovers(mangaId), cached: true });
  }

  const title = manga.title_ru || manga.title_en;
  const channels = db.getChannels();
  const ytChannels = channels.filter(c => c.platform === 'youtube');

  let allResults = [];

  // 1) Search within each saved YouTube channel
  if (ytChannels.length > 0) {
    const channelSearches = ytChannels.map(c => searchYouTubeChannel(c.handle, title));
    const channelResults = await Promise.all(channelSearches);
    for (const results of channelResults) {
      allResults.push(...results);
    }
  }

  // 2) Fallback: general YouTube search if no channels or few results
  if (allResults.length < 3) {
    const general = await searchYouTube(`${title} озвучка манги`);
    allResults.push(...general);
  }

  // 3) VK search
  const vkResults = await searchVkVideos(`${title} озвучка манги`);
  if (vkResults.length) allResults.push(...vkResults);
  else allResults.push(...await searchVkVideoNoToken(`${title} озвучка манги`));

  // 4) Rutube search
  const rutubeResults = await searchRutube(`${title} озвучка манги`);
  allResults.push(...rutubeResults);

  // 5) Telegram channels
  const tgResults = await searchTelegram(title);
  allResults.push(...tgResults);

  // Save results
  let added = 0;
  for (const v of allResults) {
    const vo = db.addVoiceover({ manga_id: mangaId, ...v, is_auto: true });
    if (vo) added++;
  }

  db.logSearch(mangaId, 'youtube', title, allResults.length - vkResults.length);
  db.logSearch(mangaId, 'vk', title, vkResults.length);

  res.json({ voiceovers: db.getVoiceovers(mangaId), added, cached: false });
});

// === Channel management ===
app.get('/api/manga/channels', (req, res) => {
  res.json({ channels: db.getChannels() });
});

app.post('/api/manga/channels/add', (req, res) => {
  let { url, name } = req.body;
  if (!url) return res.json({ error: 'URL required' });

  let platform = 'other';
  let handle = '';

  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    platform = 'youtube';
    // Extract handle: @name or /c/name or /channel/id
    const m = url.match(/@([\w.-]+)/) || url.match(/\/c\/([\w.-]+)/) || url.match(/\/channel\/([\w.-]+)/);
    handle = m ? (m[0].startsWith('@') ? m[0] : `@${m[1]}`) : url;
    if (!name) name = handle;
  } else if (url.includes('vk.com')) {
    platform = 'vk';
    const m = url.match(/vk\.com\/([\w.-]+)/);
    handle = m ? m[1] : url;
    if (!name) name = handle;
  } else if (url.includes('t.me')) {
    platform = 'telegram';
    const m = url.match(/t\.me\/([\w.-]+)/);
    handle = m ? m[1] : url;
    if (!name) name = handle;
  }

  const channel = db.addChannel({ platform, name: name || handle, url, handle });
  res.json({ ok: true, channel });
});

app.delete('/api/manga/channels/:id', (req, res) => {
  db.removeChannel(parseInt(req.params.id));
  res.json({ ok: true });
});

// Submit voiceover
app.post('/api/manga/:id/voiceovers/submit', (req, res) => {
  const mangaId = parseInt(req.params.id);
  const { url, author_name } = req.body;
  if (!url) return res.json({ error: 'URL required' });

  let source = 'other';
  let video_id = url;
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    source = 'youtube';
    const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    video_id = m ? m[1] : url;
  } else if (url.includes('vk.com/video')) {
    source = 'vk';
    const m = url.match(/video(-?\d+_\d+)/);
    video_id = m ? m[1] : url;
  } else if (url.includes('t.me') || url.includes('telegram')) {
    source = 'telegram';
  }

  const vo = db.addVoiceover({
    manga_id: mangaId, source, video_id,
    title: req.body.title || `${author_name || 'Озвучка'} — ${source}`,
    channel: author_name || 'User', thumbnail: '', duration: 0, url,
    is_auto: false, author_name
  });

  db.addSubmission({ manga_id: mangaId, url, author_name, user_id: req.session?.localUserId });

  res.json({ ok: true, voiceover: vo });
});

// All manga with voiceovers + filter metadata
app.get('/api/manga/popular', (req, res) => {
  const limit = parseInt(req.query.limit) || 500;
  const allManga = db.getPopularMangaWithVoiceovers(limit);

  // Collect unique genres and channels for filters
  const genreSet = new Set();
  allManga.forEach(m => (m.genres || []).forEach(g => genreSet.add(g)));

  const channelMap = {};
  const allVo = db.getAllVoiceovers();
  allVo.forEach(v => {
    const ch = v.channel || v.author_name || '';
    if (ch) channelMap[ch] = (channelMap[ch] || 0) + 1;
  });
  const channels = Object.entries(channelMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([name, count]) => ({ name, count }));

  const sourceMap = {};
  allVo.forEach(v => { sourceMap[v.source] = (sourceMap[v.source] || 0) + 1; });

  res.json({
    content: allManga,
    filters: {
      genres: [...genreSet].sort(),
      channels,
      sources: Object.entries(sourceMap).map(([name, count]) => ({ name, count }))
    }
  });
});

// All voiceovers (for client-side filtering)
app.get('/api/manga/voiceovers/all', (req, res) => {
  const voiceovers = db.getAllVoiceovers().map(v => ({
    id: v.id, manga_id: v.manga_id, source: v.source, channel: v.channel || v.author_name || '', title: v.title
  }));
  res.json({ voiceovers });
});

// Video URL extraction for custom player
app.get('/api/video/extract', async (req, res) => {
  const { id: voiceoverId } = req.query;
  if (!voiceoverId) return res.json({ error: 'id required' });

  const vo = db.getVoiceoverById(parseInt(voiceoverId));
  if (!vo) return res.json({ error: 'not found' });

  // Increment views
  db.incrementVoiceoverViews(vo.id);
  if (req.session.userId) db.triggerAction(req.session.userId, 'view_voiceover');

  // YouTube: get direct URL via yt-dlp --get-url, cache for 4 hours
  if (vo.source === 'youtube') {
    // Use cached URL if fresh (must be yt-dlp URL, not old play-dl)
    if (vo.direct_url && vo.direct_url_expires && Date.now() < new Date(vo.direct_url_expires).getTime() && vo.direct_url.includes('googlevideo.com')) {
      return res.json({ direct_url: vo.direct_url, source: vo.source, title: vo.title });
    }
    try {
      const { execSync } = require('child_process');
      const directUrl = execSync(
        `yt-dlp -f "best[ext=mp4][height<=720]/best[ext=mp4]/best" --get-url --no-playlist "${vo.url}"`,
        { timeout: 15000, encoding: 'utf8' }
      ).trim().split('\n').pop(); // last line is the URL
      if (directUrl && directUrl.startsWith('http')) {
        const expires = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
        db.updateVoiceoverDirectUrl(vo.id, directUrl, expires);
        return res.json({ direct_url: directUrl, source: 'youtube', title: vo.title });
      }
    } catch (e) {
      console.error('yt-dlp --get-url error:', e.message?.substring(0, 200));
    }
    // Fallback: embed
    return res.json({ embed_url: `https://www.youtube-nocookie.com/embed/${vo.video_id}`, source: 'youtube', title: vo.title });
  }

  if (vo.source === 'vk') {
    // VK: return player URL as embed
    return res.json({ embed_url: vo.player || `https://vk.com/video_ext.php?oid=${vo.video_id.split('_')[0]}&id=${vo.video_id.split('_')[1]}`, source: 'vk', title: vo.title });
  }

  if (vo.source === 'rutube') {
    return res.json({ embed_url: `https://rutube.ru/play/embed/${vo.video_id}`, source: 'rutube', title: vo.title });
  }

  if (vo.source === 'telegram') {
    // Telegram posts can be embedded via t.me embed
    const postId = vo.video_id.replace('_', '/');
    return res.json({ embed_url: `https://t.me/${postId}?embed=1&mode=tme`, source: 'telegram', title: vo.title });
  }

  // Telegram / other: just return the URL
  res.json({ url: vo.url, source: vo.source, title: vo.title });
});

// Video proxy — proxies googlevideo.com URL with full Range support
app.get('/api/video/proxy', async (req, res) => {
  const voiceoverId = parseInt(req.query.id);
  if (!voiceoverId) return res.status(400).end();

  const vo = db.getVoiceoverById(voiceoverId);
  if (!vo || !vo.direct_url) return res.status(404).send('No direct URL cached');

  try {
    // Forward Range header to Google's server
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (req.headers.range) headers['Range'] = req.headers.range;

    let upstream = await globalThis.fetch(vo.direct_url, { headers });

    // If 403 — URL expired, try to refresh via yt-dlp
    if (upstream.status === 403) {
      console.log(`Video proxy: 403 for vo ${voiceoverId}, refreshing URL...`);
      try {
        const { execSync } = require('child_process');
        const newUrl = execSync(
          `yt-dlp -f "best[ext=mp4][height<=720]/best[ext=mp4]/best" --get-url --no-playlist "${vo.url}"`,
          { timeout: 15000, encoding: 'utf8' }
        ).trim().split('\n').pop();
        if (newUrl && newUrl.startsWith('http')) {
          db.updateVoiceoverDirectUrl(vo.id, newUrl, new Date(Date.now() + 4 * 3600 * 1000).toISOString());
          upstream = await globalThis.fetch(newUrl, { headers });
        }
      } catch (e) {
        console.error('yt-dlp refresh error:', e.message?.substring(0, 200));
      }
    }

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).end();
    }

    // Forward status and key headers
    const fwdHeaders = {
      'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
      'Accept-Ranges': 'bytes'
    };
    if (upstream.headers.get('content-length')) fwdHeaders['Content-Length'] = upstream.headers.get('content-length');
    if (upstream.headers.get('content-range')) fwdHeaders['Content-Range'] = upstream.headers.get('content-range');

    res.writeHead(upstream.status, fwdHeaders);

    // Pipe the response body
    const { Readable } = require('stream');
    const readable = Readable.fromWeb(upstream.body);
    readable.pipe(res);

    req.on('close', () => { readable.destroy(); });
  } catch (e) {
    console.error('Video proxy error:', e.message);
    if (!res.headersSent) res.status(502).end();
  }
});

// SPA fallback
// PAC file for proxy auto-configuration
app.get('/proxy.pac', (req, res) => {
  res.type('application/x-ns-proxy-autoconfig');
  res.send(`function FindProxyForURL(url, host) {
  if (shExpMatch(host, "*anixart*") || shExpMatch(host, "*anixsekai*") || shExpMatch(host, "*anixmirai*")) {
    return "PROXY ${req.hostname}:8888";
  }
  return "DIRECT";
}`);
});

// Download token grabber APK
app.get('/download/grabber.apk', (req, res) => {
  const apkPath = path.join(__dirname, 'tools', 'AnixartTokenGrabber.apk');
  res.download(apkPath, 'AnixartTokenGrabber.apk');
});

// ==========================================
// Background Voiceover Crawler
// ==========================================

// Check if video title looks like a real manga/manhwa voiceover
function isLikelyVoiceover(title, duration) {
  const t = (title || '').toLowerCase();
  // Must be at least 10 min — real voiceovers are long
  if (duration > 0 && duration < 600) return false;
  // Must contain manga/manhwa voiceover keywords
  const mustHave = /озвучк[аи]?\s*(манг|манхв|маньхуа)|манг[аиы]\s*озвучк|(манг|манхв|маньхуа|manhwa|manga).*глав[аыи]?\s*\d|\d+\s*[-–]\s*\d+\s*глав[аыи]?.*озвучк|озвучка.*\d+\s*[-–]\s*\d+\s*глав/i;
  // Broader match: chapter ranges + manga context
  const chapterRange = /\d+\s*[-–]\s*\d+\s*(глав|chapter|ch\.)/i;
  const mangaContext = /манг[аиы]|манхв[аыи]|маньхуа|manhwa|manga|manhua|вебтун|webtoon/i;
  const voiceContext = /озвучк|озвучи[лт]|озвучен|дубляж/i;

  const hasMustHave = mustHave.test(title);
  const hasChaptersAndManga = chapterRange.test(title) && mangaContext.test(title);
  const hasChaptersAndVoice = chapterRange.test(title) && voiceContext.test(title);
  const hasMangaAndVoice = mangaContext.test(title) && voiceContext.test(title);

  if (!hasMustHave && !hasChaptersAndManga && !hasChaptersAndVoice && !hasMangaAndVoice) return false;

  // Reject non-voiceover content
  const rejectKeywords = /реакция|reaction|обзор|review|трейлер|trailer|amv|mmv|edit|мем|meme|прикол|tiktok|тикток|shorts|short|opening|эндинг|опенинг|ending|ost|саундтрек|клип|топ\s*\d|top\s*\d|сравнение|versus|vs\s|теори[яи]|theory|разбор\s|новости|стрим|stream|live|дорам[аы]|dorama|drama|фильм|movie|сериал[аыов]?\b|\d+\s*сери[яи]|series|k-?drama|c-?drama|аниме.?сериал|аниме.?онлайн|аниме\s*за\s*\d+\s*мин|\bмарафон\b|resumen|за\s*\d+\s*мин|gacha|гача|roblox|роблокс|minecraft|майнкрафт|fortnite/i;
  if (rejectKeywords.test(title)) return false;
  return true;
}

// === Grok AI verification ===
const _grokKeys = (process.env.GROK_API_KEYS || '').split(',').filter(Boolean);
let _grokKeyIndex = 0;
const _grokErrors = new Map(); // key -> error count

function getGrokKey() {
  if (!_grokKeys.length) return null;
  // Find a key that hasn't hit too many errors recently
  for (let i = 0; i < _grokKeys.length; i++) {
    const idx = (_grokKeyIndex + i) % _grokKeys.length;
    const errors = _grokErrors.get(idx) || 0;
    if (errors < 3) {
      _grokKeyIndex = (idx + 1) % _grokKeys.length;
      return { key: _grokKeys[idx], index: idx };
    }
  }
  // All keys exhausted — reset errors and try first
  _grokErrors.clear();
  _grokKeyIndex = 0;
  return { key: _grokKeys[0], index: 0 };
}

// Reset error counts every 10 minutes
setInterval(() => _grokErrors.clear(), 10 * 60 * 1000);

async function grokVerifyMatch(mangaTitleRu, mangaTitleEn, videoTitle) {
  const kd = getGrokKey();
  if (!kd) return true; // No keys — skip verification, allow through
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${kd.key}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 20,
        temperature: 0,
        messages: [
          { role: 'system', content: 'Ты проверяешь соответствие видео и манги. Отвечай ТОЛЬКО "да" или "нет".' },
          { role: 'user', content: `Манга: "${mangaTitleRu}"${mangaTitleEn ? ` / "${mangaTitleEn}"` : ''}\nВидео: "${videoTitle}"\n\nЭто видео — озвучка именно этой манги (не другой похожей)?` }
        ]
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (res.status === 429 || res.status === 403) {
      _grokErrors.set(kd.index, (_grokErrors.get(kd.index) || 0) + 1);
      console.log(`[Grok] Key ${kd.index} rate limited (${res.status}), switching...`);
      return true; // On rate limit, allow through (don't block)
    }
    if (!res.ok) return true;
    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || '').toLowerCase().trim();
    const isMatch = answer.startsWith('да');
    if (!isMatch) console.log(`[Grok] REJECTED: "${videoTitle}" ≠ "${mangaTitleRu}"`);
    return isMatch;
  } catch (e) {
    console.error('[Grok] Error:', e.message);
    return true; // On error, allow through
  }
}

// Batch verify — checks multiple videos at once to save API calls
async function grokBatchVerify(mangaTitleRu, mangaTitleEn, videos) {
  const kd = getGrokKey();
  if (!kd || !videos.length) return videos.map(() => true);

  // Batch up to 10 videos in one call
  const batch = videos.slice(0, 10);
  const list = batch.map((v, i) => `${i + 1}. ${v.title}`).join('\n');

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${kd.key}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 100,
        temperature: 0,
        messages: [
          { role: 'system', content: 'Ты проверяешь, какие видео являются озвучкой конкретной манги. Для каждого номера ответь "да" или "нет" в формате: 1:да 2:нет 3:да — без пробелов вокруг двоеточия. Только номера и ответы, ничего больше.' },
          { role: 'user', content: `Манга: "${mangaTitleRu}"${mangaTitleEn ? ` / "${mangaTitleEn}"` : ''}\n\nВидео:\n${list}\n\nКакие из них — озвучка именно этой манги?` }
        ]
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (res.status === 429 || res.status === 403) {
      _grokErrors.set(kd.index, (_grokErrors.get(kd.index) || 0) + 1);
      console.log(`[Grok] Key ${kd.index} rate limited (${res.status}), switching...`);
      return videos.map(() => true);
    }
    if (!res.ok) return videos.map(() => true);

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || '').toLowerCase();

    // Parse "1:да 2:нет 3:да" format
    const results = videos.map(() => true); // default allow
    for (let i = 0; i < batch.length; i++) {
      const pattern = new RegExp(`${i + 1}\\s*:\\s*(да|нет)`, 'i');
      const match = answer.match(pattern);
      if (match) {
        results[i] = match[1] === 'да';
        if (!results[i]) console.log(`[Grok] REJECTED: "${batch[i].title}" ≠ "${mangaTitleRu}"`);
      }
    }
    return results;
  } catch (e) {
    console.error('[Grok] Batch error:', e.message);
    return videos.map(() => true);
  }
}

// Extract search queries from video title — multiple attempts
function extractSearchQueries(videoTitle) {
  let t = videoTitle;
  const queries = [];

  // 1) Try to find text before "озвучка" or "глав" — that's usually the title
  const beforeOzvuchka = t.match(/^(.+?)(?:\s*[|/\\•·—–\-]\s*|\s+)(?:озвучк|дубляж)/i);
  if (beforeOzvuchka && beforeOzvuchka[1].length >= 4) {
    let q = beforeOzvuchka[1].replace(/[|•·—–\[\](){}«»""!?#@]/g, ' ').replace(/\s+/g, ' ').trim();
    if (q.length >= 4) queries.push(q);
  }

  // 2) Try text before chapter range
  const beforeChapters = t.match(/^(.+?)\s*\d+\s*[-–]\s*\d+\s*(глав|chapter)/i);
  if (beforeChapters && beforeChapters[1].length >= 4) {
    let q = beforeChapters[1].replace(/[|•·—–\[\](){}«»""!?#@\d]/g, ' ')
      .replace(/\b(озвучк[аи]?|манг[аиы]|манхв[аыи]|маньхуа|manhwa|manga)\b/gi, '')
      .replace(/\s+/g, ' ').trim();
    if (q.length >= 4) queries.push(q);
  }

  // 3) Clean full title
  let cleaned = t;
  cleaned = cleaned.replace(/\b(озвучка|озвучк[аи]|озвучен[а-я]*|манг[аиы]|манхв[аыи]|маньхуа|manhwa|manga|manhua|дубляж|аудио|на русском|все главы|полностью|конец|от начала|до конца|весь|целиком|ещё не конец|сезон)\b/gi, '');
  cleaned = cleaned.replace(/\d+\s*[-–]\s*\d+\s*(глав[аыи]?|chapter[s]?|ch\.?|часть|part|серия|том)/gi, '');
  cleaned = cleaned.replace(/(глав[аыи]?|chapter[s]?|ch\.?|часть|part|серия|том)\s*\d+\s*[-–]?\s*\d*/gi, '');
  cleaned = cleaned.replace(/\b\d{1,4}\b/g, '');
  cleaned = cleaned.replace(/[|•·—–\-\[\](){}«»"":!?.,\/\\#@&+_~`'🔥😍💔😭😈🐰❤️]/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length >= 4) queries.push(cleaned);

  return [...new Set(queries)].filter(q => q.length >= 4 && q.length <= 100);
}

// Match video to manga: search Remanga, check that manga name is CLEARLY in the video title
async function matchMangaFromTitle(videoTitle) {
  const queries = extractSearchQueries(videoTitle);
  if (!queries.length) return null;
  const titleLower = videoTitle.toLowerCase();

  for (const query of queries) {
    const data = await remanga('/search/', { query, count: 5 });
    if (!data?.content?.length) continue;

    for (const m of data.content) {
      const names = [m.main_name, m.rus_name, m.en_name, m.secondary_name]
        .filter(Boolean).filter(n => n.length >= 3);

      for (const name of names) {
        const nameLower = name.toLowerCase().trim();
        if (nameLower.length < 3) continue;
        const nameWordCount = nameLower.split(/\s+/).length;

        // STRICT CHECK: the manga name from Remanga must appear in the original video title
        if (titleLower.includes(nameLower) && nameLower.length >= 5) {
          // Single-word names (e.g. "Некромант", "Синева", "Мстители") — very strict
          if (nameWordCount === 1 && nameLower.length < 15) {
            const segments = videoTitle.split(/[|•·—–/\\]/).map(s => s.trim());
            const nameRe = new RegExp('(^|\\s)' + nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'i');
            const inShortSegment = segments.some(seg => {
              const sl = seg.toLowerCase().trim();
              if (!nameRe.test(sl)) return false;
              if (sl.split(/\s+/).length > 8) return false; // name buried in long sentence
              return /озвучк|манг|манхв|глав|\d+\s*[-–]\s*\d+/i.test(seg);
            });
            const nameQuoted = new RegExp(`["«"']\\s*${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*["»"']`, 'i').test(titleLower);
            const nameAfterOz = new RegExp(`озвучк[аи]?\\s+(манг[аиы]?\\s+)?["«]?${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(titleLower);
            if (inShortSegment || nameQuoted || nameAfterOz) return m;
            continue;
          }
          // Two-word names (e.g. "Сильнейший мечник") — strict context check
          if (nameWordCount === 2 && nameLower.length < 20) {
            const segments = videoTitle.split(/[|•·—–/\\]/).map(s => s.toLowerCase().trim());
            const inContext = segments.some(seg => seg.includes(nameLower) && /озвучк|манг|манхв|глав|\d+\s*[-–]\s*\d+/i.test(seg));
            const nameQuoted = new RegExp(`["«"'].*${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*["»"']`, 'i').test(titleLower);
            const nameAfterOz = new RegExp(`озвучк[аи]?\\s+(манг[аиы]?\\s+)?${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(titleLower);
            if (inContext || nameQuoted || nameAfterOz) return m;
            continue;
          }
          return m;
        }
        // For shorter names (3-4 chars): require word boundaries + context
        if (nameLower.length >= 3 && nameLower.length < 5) {
          const re = new RegExp('\\b' + nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
          if (re.test(videoTitle) && /озвучк|манг|манхв|глав/i.test(videoTitle)) return m;
        }
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

// Simple string similarity (Dice coefficient)
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = s => { const r = []; for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2)); return r; };
  const aBi = bigrams(a), bBi = bigrams(b);
  const bSet = new Set(bBi);
  const matches = aBi.filter(bi => bSet.has(bi)).length;
  return (2 * matches) / (aBi.length + bBi.length);
}

// Cache manga from Remanga result and return cache ID
function cacheMangaFromResult(m) {
  return db.cacheManga({
    slug: m.dir,
    remanga_id: m.id,
    title_ru: m.rus_name || m.main_name || m.name,
    title_en: m.en_name || m.name,
    cover: m.img?.high || m.img?.mid || '',
    genres: (m.genres || []).map(g => g.name),
    rating: m.avg_rating || 0,
    chapters_count: m.count_chapters || 0,
    status: m.status?.name || '',
    description: m.description || ''
  });
}

// Discovered channels during this crawl session (avoid re-scanning)
const _discoveredYtChannels = new Set();
const _discoveredTgChannels = new Set();

// Extract Telegram channel links from HTML text
function extractTelegramLinks(text) {
  const links = [];
  // t.me/channelname or telegram.me/channelname
  const matches = [...(text || '').matchAll(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z][a-zA-Z0-9_]{3,})/gi)];
  for (const m of matches) {
    const handle = m[1].toLowerCase();
    // Skip common non-channel paths
    if (['joinchat', 'addstickers', 'share', 'proxy', 'socks', 'iv', 'login', 'setlanguage', 'addtheme'].includes(handle)) continue;
    if (handle.startsWith('+')) continue;
    links.push(handle);
  }
  return [...new Set(links)];
}

// Fetch YouTube channel/video page and extract TG links from description
async function discoverTgFromYouTube(channelHandle, videoId) {
  const tgChannels = [];
  try {
    // Check channel "About" page for TG links
    if (channelHandle && !_discoveredYtChannels.has(channelHandle)) {
      _discoveredYtChannels.add(channelHandle);
      const aboutUrl = `https://www.youtube.com/${channelHandle}/about`;
      const res = await fetch(aboutUrl, { headers: YT_HEADERS, signal: AbortSignal.timeout(10000) });
      const html = await res.text();
      tgChannels.push(...extractTelegramLinks(html));
    }
  } catch (e) {}
  try {
    // Check video description for TG links
    if (videoId) {
      const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: YT_HEADERS, signal: AbortSignal.timeout(10000) });
      const html = await res.text();
      tgChannels.push(...extractTelegramLinks(html));
    }
  } catch (e) {}
  return [...new Set(tgChannels)];
}

// Scan a single TG channel and process found videos
async function scanTelegramChannel(channelHandle) {
  if (_discoveredTgChannels.has(channelHandle)) return 0;
  _discoveredTgChannels.add(channelHandle);
  try {
    const res = await fetch(`https://t.me/s/${channelHandle}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000)
    });
    const html = await res.text();
    const blocks = html.split('tgme_widget_message_wrap').slice(1);
    const channelTitle = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || channelHandle;
    const tgVideos = [];

    for (const block of blocks) {
      const postLink = (block.match(/data-post="([^"]+)"/) || [])[1];
      if (!postLink) continue;
      const text = (block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      if (!cleanText) continue;

      // YouTube links
      const ytLinks = [...text.matchAll(/href="(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})[^"]*)"/g)];
      for (const [, , videoId] of ytLinks) {
        tgVideos.push({
          source: 'youtube', video_id: videoId,
          title: cleanText.substring(0, 200), channel: channelTitle + ' (TG)',
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: 0, url: `https://youtube.com/watch?v=${videoId}`
        });
      }
      // Direct TG video
      if (block.includes('tgme_widget_message_video_player')) {
        const thumb = (block.match(/background-image:url\('([^']+)'\)/) || [])[1] || '';
        tgVideos.push({
          source: 'telegram', video_id: postLink.replace('/', '_'),
          title: cleanText.substring(0, 200), channel: channelTitle,
          thumbnail: thumb.startsWith('//') ? 'https:' + thumb : thumb,
          duration: 0, url: `https://t.me/${postLink}`
        });
      }
    }

    if (tgVideos.length) {
      const matched = await processVideoBatch(tgVideos, false); // false = don't recurse
      if (matched > 0) console.log(`[Crawler] Discovered TG @${channelHandle}: ${tgVideos.length} posts, ${matched} new`);
      return matched;
    }
  } catch (e) {}
  return 0;
}

// Process a batch of YouTube videos — match each to a manga and save
// deepScan: when true, auto-discovers author channels + TG links
async function processVideoBatch(videos, deepScan = true) {
  let matched = 0;
  for (const v of videos) {
    // Filter: must look like a real voiceover
    if (!isLikelyVoiceover(v.title, v.duration)) continue;
    try {
      const manga = await matchMangaFromTitle(v.title);
      if (!manga) continue;

      // AI verification — ask Grok if this video really matches this manga
      const mangaRu = manga.rus_name || manga.main_name || manga.name || '';
      const mangaEn = manga.en_name || '';
      if (_grokKeys.length > 0) {
        const ok = await grokVerifyMatch(mangaRu, mangaEn, v.title);
        if (!ok) continue;
      }

      const cached = cacheMangaFromResult(manga);
      const vo = db.addVoiceover({
        manga_id: cached.id,
        source: v.source,
        video_id: v.video_id,
        title: v.title,
        channel: v.channel,
        thumbnail: v.thumbnail,
        duration: v.duration,
        url: v.url,
        is_auto: true,
        author_name: v.channel
      });
      if (vo && !vo.id) continue; // already existed
      matched++;

      // === Deep scan: found a voiceover → scan the author's channel + find TG ===
      if (deepScan && v.source === 'youtube' && v.channelHandle && !_discoveredYtChannels.has(v.channelHandle)) {
        _discoveredYtChannels.add(v.channelHandle);
        console.log(`[Crawler] Scanning channel ${v.channelHandle} (found voiceover: "${v.title.substring(0, 50)}...")`);

        // 1) Crawl entire channel for more voiceovers
        try {
          const chVideos = await crawlYouTubeChannel(v.channelHandle);
          if (chVideos.length) {
            const chMatched = await processVideoBatch(chVideos, false); // false = no recursive deep scan
            matched += chMatched;
            if (chMatched > 0) console.log(`[Crawler] Channel ${v.channelHandle}: ${chVideos.length} videos, ${chMatched} new voiceovers`);
          }
        } catch (e) {}

        // 2) Check channel about page + video description for TG links
        try {
          const tgLinks = await discoverTgFromYouTube(v.channelHandle, v.video_id);
          for (const tgHandle of tgLinks) {
            const tgMatched = await scanTelegramChannel(tgHandle);
            matched += tgMatched;
          }
        } catch (e) {}

        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      // Skip individual errors
    }
    // Small delay to not hammer Remanga
    await new Promise(r => setTimeout(r, 500));
  }
  return matched;
}

// Crawl YouTube channel videos page
async function crawlYouTubeChannel(handle) {
  try {
    const url = `https://www.youtube.com/${handle}/videos`;
    const res = await fetch(url, { headers: YT_HEADERS, signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    return parseYouTubeVideos(html);
  } catch (e) {
    console.error(`Crawl channel ${handle} error:`, e.message);
    return [];
  }
}

// YouTube search with scroll token for more results
async function searchYouTubePage(query, pageToken) {
  try {
    let url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    if (pageToken) url += `&continuation=${pageToken}`;
    const res = await fetch(url, { headers: YT_HEADERS, signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    const videos = parseYouTubeVideos(html);
    // Try to get continuation token for next page
    const contMatch = html.match(/"continuationCommand":\{"token":"([^"]+)"/);
    return { videos, nextToken: contMatch ? contMatch[1] : null };
  } catch (e) {
    return { videos: [], nextToken: null };
  }
}

// Main crawler function — aggressive mode
async function crawlVoiceovers() {
  console.log('[Crawler] Starting voiceover crawl...');
  _discoveredYtChannels.clear();
  _discoveredTgChannels.clear();
  // Pre-fill with known TG channels so they're not re-scanned in deep scan
  TG_VOICEOVER_CHANNELS.forEach(ch => _discoveredTgChannels.add(ch));
  let totalFound = 0;

  // 1) Massive query list — general + specific popular titles
  const queries = [
    // General queries
    'озвучка манги', 'озвучка манхвы', 'манга озвучка', 'манхва озвучка',
    'озвучка маньхуа', 'новая озвучка манги', 'озвучка манги 2026',
    'озвучка манги 2025', 'манга на русском озвучка', 'озвучка манхвы полностью',
    'озвучка манги все главы', 'полная озвучка манги', 'манга озвучка все главы',
    'озвучка комикса', 'озвучка вебтуна', 'webtoon озвучка',
    'манхва на русском озвучка', 'аудио манга', 'манга аудиокнига',
    'озвучка ранобэ', 'ранобе озвучка',
    // Long-form queries
    'озвучка манги от начала до конца', 'манга озвучка 1 глава',
    'озвучка популярной манги', 'лучшие озвучки манги',
    'озвучка манги с 1 главы', 'манга озвучка новинки',
    // Popular titles — direct search
    'solo leveling озвучка', 'поднятие уровня в одиночку озвучка',
    'магическая битва озвучка манги', 'jujutsu kaisen манга озвучка',
    'ванпанчмен озвучка манги', 'one punch man манга озвучка',
    'наруто манга озвучка', 'naruto манга озвучка',
    'блич манга озвучка', 'bleach манга озвучка',
    'ван пис озвучка манги', 'one piece манга озвучка',
    'атака титанов озвучка манги', 'attack on titan манга озвучка',
    'истребитель демонов озвучка манги', 'demon slayer манга озвучка',
    'моя геройская академия озвучка манги', 'boku no hero озвучка',
    'цепной человек озвучка манги', 'chainsaw man манга озвучка',
    'токийские мстители озвучка манги', 'tokyo revengers манга',
    'ванпис манга озвучка полностью', 'наруто манга озвучка все главы',
    'hunter x hunter манга озвучка', 'хантер манга озвучка',
    'берсерк озвучка манги', 'berserk манга озвучка',
    'черный клевер озвучка манги', 'black clover манга',
    'fairy tail манга озвучка', 'хвост феи манга озвучка',
    'dragon ball манга озвучка', 'драгон болл манга',
    'death note манга озвучка', 'тетрадь смерти манга',
    'стальной алхимик озвучка манги', 'fullmetal alchemist манга',
    'клинок рассекающий демонов озвучка манги',
    'боруто манга озвучка', 'boruto manga озвучка',
    'невероятные приключения джоджо озвучка манги', 'jojo manga озвучка',
    'класс элиты озвучка ранобе', 'classroom of the elite озвучка',
    'sword art online озвучка ранобе', 'сао озвучка',
    'ре зеро озвучка', 're:zero озвучка ранобе',
    'начало после конца озвучка', 'beginning after the end озвучка',
    'второй приход обжорства озвучка', 'return of the mount hua sect озвучка',
    'возвращение великого мечника озвучка', 'возвращение безумного демона озвучка',
    'всевидящий читер озвучка', 'я единственный некромант озвучка',
    'обожествлённый озвучка', 'omniscient reader озвучка',
    'всеведущий читатель озвучка манхвы', 'tower of god озвучка',
    'башня бога озвучка', 'noblesse озвучка манхвы',
    'ноблесс озвучка', 'the god of high school озвучка',
    'бог старшей школы озвучка', 'unordinary озвучка',
    'маг-целитель озвучка', 'overgeared озвучка',
    'я один поднимаю уровень озвучка', 'переродился слизнем озвучка',
    'в другом мире с уровнями озвучка', 'реинкарнация безработного озвучка',
    'mushoku tensei озвучка', 'перерождение безработного озвучка',
    'нанмачин озвучка', 'nano machine озвучка манхвы',
    'lookism озвучка', 'лукизм озвучка манхвы',
    'wind breaker озвучка', 'viral hit озвучка',
    'weak hero озвучка', 'слабый герой озвучка',
    'северный клинок озвучка', 'northern blade озвучка',
    'legend of the northern blade озвучка',
    'записки аптекарши озвучка манги', 'kusuriya no hitorigoto озвучка',
    'синяя тюрьма озвучка манги', 'blue lock манга',
    'одинокое восхождение озвучка', 'возвышение в одиночку озвучка',
    'реинкарнация сильнейшего мечника озвучка',
    'великий маг возвращается спустя 4000 лет озвучка',
    'академия демонического короля озвучка',
    'бессмертный великий господин озвучка',
    'мой уровень 999 озвучка', 'уровень 999 озвучка манхвы',
    'прочти это озвучка', 'эта способность слишком сильна озвучка',
    'муримовский логин озвучка', 'murim login озвучка',
  ];

  for (const q of queries) {
    try {
      const videos = await searchYouTube(q);
      if (videos.length) {
        const matched = await processVideoBatch(videos);
        totalFound += matched;
        if (matched > 0) console.log(`[Crawler] "${q}": ${videos.length} videos, ${matched} new`);
      }
    } catch (e) {
      console.error(`[Crawler] Search error "${q}":`, e.message);
    }
    // 1.5s delay between requests
    await new Promise(r => setTimeout(r, 1500));
  }

  // 1b) Rutube — key queries
  const rutubeQueries = ['озвучка манги', 'озвучка манхвы', 'манга озвучка', 'озвучка манги все главы', 'озвучка манги 2025', 'озвучка манги 2026'];
  for (const q of rutubeQueries) {
    try {
      const videos = await searchRutube(q);
      if (videos.length) {
        const matched = await processVideoBatch(videos);
        totalFound += matched;
        if (matched > 0) console.log(`[Crawler] Rutube "${q}": ${videos.length} videos, ${matched} new`);
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 1000));
  }

  // 1c) Telegram channels — scan latest posts
  for (const ch of TG_VOICEOVER_CHANNELS) {
    try {
      const res = await fetch(`https://t.me/s/${ch}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000)
      });
      const html = await res.text();
      const blocks = html.split('tgme_widget_message_wrap').slice(1);
      const tgVideos = [];
      for (const block of blocks) {
        const postLink = (block.match(/data-post="([^"]+)"/) || [])[1];
        if (!postLink) continue;
        const text = (block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
        const cleanText = text.replace(/<[^>]+>/g, '').trim();
        if (!cleanText) continue;
        const channelTitle = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || ch;

        // Extract YouTube links from post
        const ytLinks = [...text.matchAll(/href="(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})[^"]*)"/g)];
        for (const [, , videoId] of ytLinks) {
          tgVideos.push({
            source: 'youtube', video_id: videoId,
            title: cleanText.substring(0, 200), channel: channelTitle + ' (TG)',
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: 0, url: `https://youtube.com/watch?v=${videoId}`
          });
        }
        // Direct TG video
        if (block.includes('tgme_widget_message_video_player')) {
          const thumb = (block.match(/background-image:url\('([^']+)'\)/) || [])[1] || '';
          tgVideos.push({
            source: 'telegram', video_id: postLink.replace('/', '_'),
            title: cleanText.substring(0, 200), channel: channelTitle,
            thumbnail: thumb.startsWith('//') ? 'https:' + thumb : thumb,
            duration: 0, url: `https://t.me/${postLink}`
          });
        }
      }
      if (tgVideos.length) {
        const matched = await processVideoBatch(tgVideos);
        totalFound += matched;
        if (matched > 0) console.log(`[Crawler] TG @${ch}: ${tgVideos.length} posts, ${matched} new`);
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 1000));
  }

  // 2) Crawl saved channels — get all their videos
  const channels = db.getChannels();
  const ytChannels = channels.filter(c => c.platform === 'youtube');
  for (const ch of ytChannels) {
    try {
      // Get channel videos page
      const videos = await crawlYouTubeChannel(ch.handle);
      if (videos.length) {
        const matched = await processVideoBatch(videos);
        totalFound += matched;
        console.log(`[Crawler] Channel ${ch.handle}: ${videos.length} videos, ${matched} new`);
      }
      // Also search channel for common terms
      for (const term of ['озвучка', 'манга', 'манхва', 'глава']) {
        const chVideos = await searchYouTubeChannel(ch.handle, term);
        if (chVideos.length) {
          const m = await processVideoBatch(chVideos);
          totalFound += m;
          if (m > 0) console.log(`[Crawler] ${ch.handle} "${term}": ${chVideos.length} videos, ${m} new`);
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (e) {
      console.error(`[Crawler] Channel ${ch.handle} error:`, e.message);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  // 3) Auto-discover channels from found voiceovers
  const allVoiceovers = db.getAllVoiceovers();
  const knownChannels = new Set(db.getChannels().map(c => c.handle));
  const channelCounts = {};
  allVoiceovers.forEach(v => {
    if (v.source === 'youtube' && v.channel) {
      channelCounts[v.channel] = (channelCounts[v.channel] || 0) + 1;
    }
  });
  // Find channels with 3+ voiceovers that we haven't saved yet
  const hotChannels = Object.entries(channelCounts)
    .filter(([name, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  for (const [channelName] of hotChannels) {
    // Try to find and crawl this channel
    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(channelName + ' озвучка манги')}&sp=EgIQAg%253D%253D`; // channels filter
      const res = await fetch(searchUrl, { headers: YT_HEADERS, signal: AbortSignal.timeout(10000) });
      const html = await res.text();
      const handleMatch = html.match(/"canonicalBaseUrl":"(\/@[^"]+)"/);
      if (handleMatch) {
        const handle = handleMatch[1];
        if (!knownChannels.has(handle)) {
          const chVideos = await crawlYouTubeChannel(handle);
          if (chVideos.length) {
            const m = await processVideoBatch(chVideos);
            totalFound += m;
            if (m > 0) console.log(`[Crawler] Auto-channel ${handle}: ${chVideos.length} videos, ${m} new`);
          }
        }
      }
    } catch (e) {
      console.error(`[Crawler] Auto-discover "${channelName}" error:`, e?.message || e);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`[Crawler] Done. Total new voiceovers matched: ${totalFound}`);
  return totalFound;
}

// Crawl API
let _crawlRunning = false;
let _crawlStats = { lastRun: null, lastFound: 0, totalRuns: 0 };

app.post('/api/manga/crawl', async (req, res) => {
  if (_crawlRunning) return res.json({ status: 'already_running' });
  _crawlRunning = true;
  res.json({ status: 'started' });
  try {
    const found = await crawlVoiceovers();
    _crawlStats = { lastRun: new Date().toISOString(), lastFound: found, totalRuns: _crawlStats.totalRuns + 1 };
  } catch (e) {
    console.error('[Crawler] Fatal:', e.message);
  }
  _crawlRunning = false;
});

app.get('/api/manga/crawl/status', (req, res) => {
  res.json({ running: _crawlRunning, ..._crawlStats });
});

// === Auth ===
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.json({ error: 'Все поля обязательны' });
  if (username.length < 3 || username.length > 20) return res.json({ error: 'Логин от 3 до 20 символов' });
  if (password.length < 6) return res.json({ error: 'Пароль минимум 6 символов' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.json({ error: 'Логин: только буквы, цифры и _' });

  if (db.findUserByUsername(username)) return res.json({ error: 'Логин уже занят' });
  if (db.findUserByEmail(email)) return res.json({ error: 'Email уже зарегистрирован' });

  const password_hash = await bcrypt.hash(password, 10);
  const user = db.createUser({ username, email, name: username, password_hash });
  req.session.userId = user.id;
  db.triggerAction(user.id, 'register');
  db.grantAchievement(user.id, 'first_login');
  res.json({ user: { id: user.id, username: user.username, name: user.name, email: user.email, avatar: user.avatar, role: user.role, roles: user.roles || [user.role] } });
});

app.post('/api/auth/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.json({ error: 'Введите логин и пароль' });

  const user = db.findUserByUsername(login) || db.findUserByEmail(login);
  if (!user || !user.password_hash) return res.json({ error: 'Неверный логин или пароль' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.json({ error: 'Неверный логин или пароль' });

  if (user.google_id) {
    db.updateUserLogin(user.google_id, user.name, user.avatar);
  }
  req.session.userId = user.id;
  res.json({ user: { id: user.id, username: user.username, name: user.name, email: user.email, avatar: user.avatar, role: user.role, roles: user.roles || [user.role] } });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.findUserById(req.session.userId);
  if (!user) return res.json({ user: null });
  const profile = db.getProfile(user.id);
  res.json({ user: { id: user.id, username: user.username, name: user.name, email: user.email, avatar: user.avatar, role: user.role, profile } });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// === Profile ===
app.get('/api/profile/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const u = db.findUserById(userId);
  if (!u) return res.json({ error: 'Пользователь не найден' });
  const profile = db.getProfile(userId);
  const stats = {
    wishes: db.getUserWishlist(userId).length,
    saves: db.getSaved(userId).length,
    comments: db.getUserCommentCount ? db.getUserCommentCount(userId) : 0
  };
  // Recent saved voiceovers (for activity showcase)
  const recentSaves = db.getSaved(userId).slice(0, 5).map(s => {
    const vo = db.getVoiceoverById(s.voiceover_id);
    if (!vo) return null;
    const manga = db.getMangaById(vo.manga_id);
    return { id: vo.id, title: vo.title, thumbnail: vo.thumbnail, manga_title: manga?.title_ru || '', manga_slug: manga?.slug || '', saved_at: s.created_at };
  }).filter(Boolean);
  // Watch time stats
  const fullStats = db.getStats(userId);
  const watchStats = {
    totalSeconds: fullStats.totalWatchTimeSeconds || 0,
    totalEpisodes: fullStats.totalEpisodes || 0,
    dailyTime: fullStats.dailyTime || [],
    totalAnime: fullStats.totalAnime || 0,
    completed: fullStats.completed || 0,
    watching: fullStats.watching || 0,
    planned: fullStats.planned || 0,
    dropped: fullStats.dropped || 0,
    onHold: fullStats.onHold || 0,
    avgScore: fullStats.avgScore || 0,
    statusDistribution: fullStats.statusDistribution || []
  };
  // Rated releases & user reviews for profile tabs
  const ratedReleases = db.getProgress(userId).filter(p => p.score > 0).sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 20).map(p => ({ anime_id: p.anime_id, title: p.title, image: p.image, score: p.score, updated_at: p.updated_at }));
  const userReviews = db.getUserReviews ? db.getUserReviews(userId).map(rv => {
    if (!rv.release_title) {
      const prog = db.getProgress(userId).find(p => String(p.anime_id) === String(rv.release_id));
      rv.release_title = prog?.title || '';
    }
    return rv;
  }) : [];
  // Creator info
  const creatorStats = (u.role === 'creator' && db.getCreatorStats) ? db.getCreatorStats(userId) : null;
  res.json({
    user: { id: u.id, username: u.username, name: u.name, avatar: u.avatar, role: u.role, roles: u.roles || [u.role], created_at: u.created_at, last_seen: u.last_seen || u.last_login || u.created_at, watching_now: u.watching_now || null },
    profile, stats, recentSaves, watchStats, ratedReleases, userReviews,
    creatorStats: creatorStats ? { total_voiceovers: creatorStats.total_voiceovers, total_views: creatorStats.total_views, level: creatorStats.level } : null
  });
});

// === Profile Comments ===
// === Anime List by status ===
app.get('/api/user/:id/animelist', (req, res) => {
  const userId = parseInt(req.params.id);
  const status = req.query.status;
  const progress = db.getProgress(userId);
  const items = status ? progress.filter(p => p.status === status) : progress;
  res.json({ items });
});

app.get('/api/profile/:id/comments', (req, res) => {
  const profileId = parseInt(req.params.id);
  const page = parseInt(req.query.page) || 1;
  const data = db.getProfileComments(profileId, page);
  const comments = data.comments.map(c => {
    const author = db.findUserById(c.author_id);
    return { id: c.id, author_id: c.author_id, login: author?.name || author?.username || '?', avatar: author?.avatar || null, text: c.text, created_at: c.created_at };
  });
  res.json({ comments, total: data.total, page: data.page });
});

app.post('/api/profile/:id/comments', (req, res) => {
  const uid = getLocalUserId(req);
  if (!uid) return res.status(401).json({ error: 'Не авторизован' });
  const text = (req.body.text || '').trim();
  if (!text || text.length > 1000) return res.json({ error: 'Комментарий пуст или слишком длинный' });
  const comment = db.addProfileComment(uid, parseInt(req.params.id), text);
  const u = db.findUserById(uid);
  res.json({ ok: true, comment: { id: comment.id, author_id: uid, login: u?.name || '?', avatar: u?.avatar, text: comment.text, created_at: comment.created_at } });
});

app.delete('/api/profile/comment/:id', (req, res) => {
  const uid = getLocalUserId(req);
  if (!uid) return res.status(401).json({ error: 'Не авторизован' });
  const ok = db.deleteProfileComment(parseInt(req.params.id), uid);
  res.json({ ok });
});

app.post('/api/profile/update', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const { name, avatar, bio, banner_color, social_links } = req.body;
  if (name) db.updateUser(req.session.userId, { name });
  if (avatar !== undefined) db.updateUser(req.session.userId, { avatar });
  db.upsertProfile(req.session.userId, { bio, banner_color, social_links });
  res.json({ ok: true });
});

// Upload avatar (png/jpg only, max 5MB)
app.post('/api/profile/avatar', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.json({ error: err.message || 'Ошибка загрузки' });
    if (!req.file) return res.json({ error: 'Файл не выбран' });
    const avatarUrl = `/img/avatars/${req.file.filename}`;
    db.updateUser(req.session.userId, { avatar: avatarUrl });
    res.json({ ok: true, avatar: avatarUrl });
  });
});

// === Friends ===
app.get('/api/friends/search', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const q = req.query.q || '';
  res.json({ users: db.searchUsers(q, req.session.userId) });
});

app.get('/api/friends/mycode', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const u = db.findUserById(req.session.userId);
  if (!u) return res.json({ error: 'Не найден' });
  res.json({ code: u.friend_code || 'N/A', url: `${req.protocol}://${req.get('host')}/#profile/${u.id}` });
});

app.get('/api/friends/requests/incoming', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  res.json({ requests: db.getFriendRequests(req.session.userId, 'incoming') });
});

app.get('/api/friends/requests/outgoing', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  res.json({ requests: db.getFriendRequests(req.session.userId, 'outgoing') });
});

app.get('/api/friends/status/:userId', (req, res) => {
  if (!req.session.userId) return res.json({ status: 'none' });
  res.json({ status: db.getFriendshipStatus(req.session.userId, parseInt(req.params.userId)) });
});

app.get('/api/friends/:userId', (req, res) => {
  res.json({ friends: db.getFriends(parseInt(req.params.userId)) });
});

app.post('/api/friends/request/:userId', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const targetId = parseInt(req.params.userId);
  if (!db.findUserById(targetId)) return res.json({ error: 'Пользователь не найден' });
  const result = db.sendFriendRequest(req.session.userId, targetId);
  if (result.error) return res.json({ error: result.error });
  res.json({ ok: true });
});

app.post('/api/friends/accept/:requestId', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const result = db.acceptFriendRequest(parseInt(req.params.requestId), req.session.userId);
  if (!result) return res.json({ error: 'Запрос не найден' });
  res.json({ ok: true });
});

app.post('/api/friends/reject/:requestId', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const result = db.rejectFriendRequest(parseInt(req.params.requestId), req.session.userId);
  if (!result) return res.json({ error: 'Запрос не найден' });
  res.json({ ok: true });
});

app.delete('/api/friends/:userId', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  db.removeFriend(req.session.userId, parseInt(req.params.userId));
  res.json({ ok: true });
});

// === Profile Shop ===
const SHOP_ITEMS = [
  // Frames
  { id: 'frame_gold', name: 'Золотая рамка', type: 'frame', price: 200, css: 'linear-gradient(135deg, #ffd700, #ffaa00, #ffd700)', preview: '#ffd700' },
  { id: 'frame_fire', name: 'Огненная рамка', type: 'frame', price: 300, css: 'linear-gradient(135deg, #ff4500, #ff8c00, #ff4500)', preview: '#ff4500' },
  { id: 'frame_ice', name: 'Ледяная рамка', type: 'frame', price: 300, css: 'linear-gradient(135deg, #00bfff, #87ceeb, #00bfff)', preview: '#00bfff' },
  { id: 'frame_toxic', name: 'Токсичная рамка', type: 'frame', price: 400, css: 'linear-gradient(135deg, #76b900, #39ff14, #76b900)', preview: '#76b900' },
  { id: 'frame_purple', name: 'Аметистовая рамка', type: 'frame', price: 400, css: 'linear-gradient(135deg, #9b30ff, #bf5fff, #9b30ff)', preview: '#9b30ff' },
  { id: 'frame_rainbow', name: 'Радужная рамка', type: 'frame', price: 800, css: 'linear-gradient(135deg, #ff0000, #ff8800, #ffff00, #00ff00, #0088ff, #8800ff, #ff0000)', preview: '#ff0000' },
  { id: 'frame_shadow', name: 'Тёмная рамка', type: 'frame', price: 250, css: 'linear-gradient(135deg, #333, #555, #333)', preview: '#444' },
  // Backgrounds
  { id: 'bg_sunset', name: 'Закат', type: 'background', price: 300, css: 'linear-gradient(135deg, #ff512f, #f09819)', preview: '#ff512f' },
  { id: 'bg_ocean', name: 'Океан', type: 'background', price: 300, css: 'linear-gradient(135deg, #1a2980, #26d0ce)', preview: '#1a2980' },
  { id: 'bg_forest', name: 'Лес', type: 'background', price: 300, css: 'linear-gradient(135deg, #0f3443, #34e89e)', preview: '#0f3443' },
  { id: 'bg_neon', name: 'Неон', type: 'background', price: 500, css: 'linear-gradient(135deg, #fc00ff, #00dbde)', preview: '#fc00ff' },
  { id: 'bg_blood', name: 'Кровь', type: 'background', price: 400, css: 'linear-gradient(135deg, #200122, #6f0000)', preview: '#6f0000' },
  { id: 'bg_space', name: 'Космос', type: 'background', price: 500, css: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)', preview: '#302b63' },
  { id: 'bg_gold', name: 'Золото', type: 'background', price: 600, css: 'linear-gradient(135deg, #f7971e, #ffd200)', preview: '#ffd200' },
  { id: 'bg_anime', name: 'Аниме Вайб', type: 'background', price: 700, css: 'linear-gradient(135deg, #ff6a88, #ff99ac, #fcb69f)', preview: '#ff6a88' },
  // Steam-imported items
  { id: 'steam_frame_1', name: 'Steam Рамка', type: 'frame', price: 0, css: 'https://shared.akamai.steamstatic.com/community_assets/images/items/3331000/18f353248dc2082b49410b7f170d2612ed5017cf.png', preview: '#66c0f4', steam: true },
  { id: 'steam_bg_1', name: 'Steam Фон', type: 'background', price: 0, css: 'https://shared.akamai.steamstatic.com/community_assets/images/items/1037910/98d17f72999a328664c713320082ac1bdf6eafb1.webm', preview: '#171a21', steam: true },
];

// Load bulk-scraped Steam items if present
try {
  const steamItemsPath = path.join(__dirname, 'public', 'data', 'steam-items.json');
  if (fs.existsSync(steamItemsPath)) {
    const steamItems = JSON.parse(fs.readFileSync(steamItemsPath, 'utf8'));
    const existing = new Set(SHOP_ITEMS.map(i => i.id));
    let added = 0;
    for (const it of steamItems) {
      if (existing.has(it.id)) continue;
      SHOP_ITEMS.push(it);
      added++;
    }
    console.log(`  Loaded ${added} Steam items from steam-items.json`);
  }
} catch (e) {
  console.error('Failed to load steam-items.json:', e.message);
}

app.get('/api/shop/items', (req, res) => {
  const userId = req.session.userId;
  const inventory = userId ? db.getInventory(userId) : [];
  const points = userId ? db.getPoints(userId) : 0;
  const items = SHOP_ITEMS.map(item => ({
    ...item,
    owned: inventory.some(i => i.item_id === item.id)
  }));
  res.json({ items, points });
});

app.post('/api/shop/buy', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const { itemId } = req.body;
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return res.json({ error: 'Предмет не найден' });
  const inv = db.getInventory(req.session.userId);
  if (inv.some(i => i.item_id === itemId)) return res.json({ error: 'Уже куплено' });
  if (!db.spendPoints(req.session.userId, item.price)) return res.json({ error: 'Недостаточно очков' });
  db.addToInventory(req.session.userId, itemId);
  res.json({ ok: true, points: db.getPoints(req.session.userId) });
});

app.get('/api/shop/equipped/:userId', (req, res) => {
  const eq = db.getEquipped(parseInt(req.params.userId));
  const equipped = {};
  if (eq.frame) { const item = SHOP_ITEMS.find(i => i.id === eq.frame); if (item) equipped.frame = item; }
  if (eq.background) { const item = SHOP_ITEMS.find(i => i.id === eq.background); if (item) equipped.background = item; }
  if (eq.avatar) { const item = SHOP_ITEMS.find(i => i.id === eq.avatar); if (item) equipped.avatar = item; }
  res.json(equipped);
});

app.post('/api/shop/equip', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const { slot, itemId } = req.body;
  if (!['frame', 'background', 'avatar'].includes(slot)) return res.json({ error: 'Неверный слот' });
  if (itemId) {
    const inv = db.getInventory(req.session.userId);
    if (!inv.some(i => i.item_id === itemId)) return res.json({ error: 'Нет в инвентаре' });
  }
  db.equipItem(req.session.userId, slot, itemId || null);
  res.json({ ok: true });
});

// === Marketplace ===
app.get('/api/market/listings', (req, res) => {
  const listings = db.getListings();
  const result = listings.map(l => {
    const item = SHOP_ITEMS.find(i => i.id === l.item_id);
    const seller = db.findUserById(l.seller_id);
    return { ...l, item, seller_name: seller?.name || seller?.username || 'Аноним', seller_avatar: seller?.avatar || null };
  }).filter(l => l.item);
  res.json({ listings: result });
});

app.post('/api/market/list', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const { itemId, price } = req.body;
  if (!itemId || !price || price < 1) return res.json({ error: 'Неверные данные' });
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return res.json({ error: 'Предмет не найден' });
  const inv = db.getInventory(req.session.userId);
  if (!inv.some(i => i.item_id === itemId)) return res.json({ error: 'Нет в инвентаре' });
  // Unequip if equipped
  const eq = db.getEquipped(req.session.userId);
  if (eq.frame === itemId) db.equipItem(req.session.userId, 'frame', null);
  if (eq.background === itemId) db.equipItem(req.session.userId, 'background', null);
  // Remove from inventory and list
  db.removeFromInventory(req.session.userId, itemId);
  const listing = db.listItem(req.session.userId, itemId, parseInt(price));
  res.json({ ok: true, listing });
});

app.post('/api/market/buy/:id', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const listing = db.getListing(parseInt(req.params.id));
  if (!listing || listing.status !== 'active') return res.json({ error: 'Лот не найден' });
  if (listing.seller_id === req.session.userId) return res.json({ error: 'Нельзя купить свой лот' });
  if (!db.spendPoints(req.session.userId, listing.price)) return res.json({ error: 'Недостаточно очков' });
  // Transfer points to seller
  db.addPoints(listing.seller_id, listing.price);
  // Add item to buyer
  db.addToInventory(req.session.userId, listing.item_id);
  db.completeListing(listing.id);
  res.json({ ok: true, points: db.getPoints(req.session.userId) });
});

app.post('/api/market/cancel/:id', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const listing = db.getListing(parseInt(req.params.id));
  if (!listing || listing.seller_id !== req.session.userId) return res.json({ error: 'Нет доступа' });
  db.cancelListing(listing.id);
  db.addToInventory(req.session.userId, listing.item_id);
  res.json({ ok: true });
});

// === Wishlist ===
app.post('/api/manga/:id/wish', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const mangaId = parseInt(req.params.id);
  db.addWish(req.session.userId, mangaId);
  db.triggerAction(req.session.userId, 'wish');
  res.json({ wished: true, count: db.getWishlist(mangaId).length });
});

app.delete('/api/manga/:id/wish', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const mangaId = parseInt(req.params.id);
  db.removeWish(req.session.userId, mangaId);
  res.json({ wished: false, count: db.getWishlist(mangaId).length });
});

app.get('/api/manga/:id/wish', (req, res) => {
  const mangaId = parseInt(req.params.id);
  const count = db.getWishlist(mangaId).length;
  const wished = req.session.userId ? db.isWished(req.session.userId, mangaId) : false;
  res.json({ wished, count });
});

app.get('/api/manga/wishlist/top', (req, res) => {
  const counts = db.getWishCounts();
  const top = Object.entries(counts).slice(0, 50).map(([mangaId, count]) => {
    const manga = db.getMangaById(parseInt(mangaId));
    return manga ? { ...manga, wish_count: count } : null;
  }).filter(Boolean);
  res.json({ content: top });
});

// === Saved ===
app.post('/api/voiceover/:id/save', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  db.addSave(req.session.userId, parseInt(req.params.id));
  db.triggerAction(req.session.userId, 'save');
  res.json({ saved: true });
});

app.delete('/api/voiceover/:id/save', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  db.removeSave(req.session.userId, parseInt(req.params.id));
  res.json({ saved: false });
});

app.get('/api/saved', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const saved = db.getSaved(req.session.userId);
  const voiceovers = saved.map(s => {
    const vo = db.getVoiceoverById(s.voiceover_id);
    if (!vo) return null;
    const manga = db.getMangaById(vo.manga_id);
    return { ...vo, manga_title: manga?.title_ru || '', manga_slug: manga?.slug || '' };
  }).filter(Boolean);
  res.json({ voiceovers });
});

// === Comments ===
app.get('/api/voiceover/:id/comments', (req, res) => {
  const comments = db.getComments(parseInt(req.params.id));
  const enriched = comments.map(c => {
    const user = db.findUserById(c.user_id);
    return { ...c, user_name: user?.name || 'Аноним', user_avatar: user?.avatar || null, user_role: user?.role || 'user' };
  });
  res.json({ comments: enriched });
});

app.post('/api/voiceover/:id/comments', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const text = (req.body.text || '').trim();
  if (!text || text.length > 1000) return res.json({ error: 'Комментарий от 1 до 1000 символов' });
  const comment = db.addComment(req.session.userId, parseInt(req.params.id), text);
  db.triggerAction(req.session.userId, 'comment');
  const user = db.findUserById(req.session.userId);
  res.json({ comment: { ...comment, user_name: user?.name, user_avatar: user?.avatar, user_role: user?.role } });
});

app.delete('/api/comment/:id', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const user = db.findUserById(req.session.userId);
  const ok = db.deleteComment(parseInt(req.params.id), req.session.userId);
  res.json({ ok });
});

// === Creator System ===

// Request creator verification
app.post('/api/creator/request', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const { channel_urls, description } = req.body;
  if (!channel_urls || !channel_urls.length) return res.json({ error: 'Укажите хотя бы один канал' });
  const request = db.createCreatorRequest(req.session.userId, { channel_urls, description });
  res.json({ request });
});

// Get my creator requests
app.get('/api/creator/my-requests', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const requests = db.getCreatorRequestByUser(req.session.userId);
  res.json({ requests });
});

// Admin: list all creator requests
app.get('/api/creator/requests', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const user = db.findUserById(req.session.userId);
  if (!user || !(user.role === 'admin' || user.role === 'owner' || (user.roles && (user.roles.includes('admin') || user.roles.includes('owner'))))) return res.json({ error: 'Нет доступа' });
  const status = req.query.status || null;
  const requests = db.getCreatorRequests(status);
  // Enrich with user info
  const enriched = requests.map(r => {
    const u = db.findUserById(r.user_id);
    return { ...r, user_name: u?.name || 'Unknown', user_username: u?.username || '' };
  });
  res.json({ requests: enriched });
});

// Admin: review creator request
app.post('/api/creator/requests/:id/review', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const user = db.findUserById(req.session.userId);
  if (!user || !(user.role === 'admin' || user.role === 'owner' || (user.roles && (user.roles.includes('admin') || user.roles.includes('owner'))))) return res.json({ error: 'Нет доступа' });
  const { status, note } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.json({ error: 'Неверный статус' });
  const result = db.reviewCreatorRequest(parseInt(req.params.id), req.session.userId, { status, note });
  if (!result) return res.json({ error: 'Заявка не найдена' });
  res.json({ request: result });
});

// Creator dashboard (own stats)
app.get('/api/creator/dashboard', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const user = db.findUserById(req.session.userId);
  const profile = db.getProfile(req.session.userId);
  if (!profile || !profile.is_creator) return res.json({ error: 'Вы не являетесь создателем контента' });
  const stats = db.getCreatorStats(req.session.userId);
  // Enrich voiceovers with manga info
  const voiceovers = stats.voiceovers.map(v => {
    const manga = db.getMangaById(v.manga_id);
    return { ...v, manga_title: manga?.title_ru || '', manga_slug: manga?.slug || '' };
  });
  res.json({ stats: { ...stats, voiceovers }, user: { id: user.id, name: user.name, username: user.username, avatar: user.avatar, role: user.role, roles: user.roles || [user.role] }, profile });
});

// Public creator page
app.get('/api/creator/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const user = db.findUserById(userId);
  if (!user) return res.json({ error: 'Пользователь не найден' });
  const profile = db.getProfile(userId);
  if (!profile || !profile.is_creator) return res.json({ error: 'Не является создателем контента' });
  const stats = db.getCreatorStats(userId);
  const voiceovers = stats.voiceovers.map(v => {
    const manga = db.getMangaById(v.manga_id);
    return { ...v, manga_title: manga?.title_ru || '', manga_slug: manga?.slug || '' };
  });
  res.json({
    creator: { id: user.id, name: user.name, username: user.username, avatar: user.avatar, role: user.role, created_at: user.created_at },
    profile,
    stats: { total_voiceovers: stats.total_voiceovers, total_views: stats.total_views, total_saves: stats.total_saves, total_comments: stats.total_comments, manga_count: stats.manga_count, level: stats.level },
    voiceovers
  });
});

// List verified creators
app.get('/api/creators', (req, res) => {
  const creators = db.getVerifiedCreators();
  res.json({ creators });
});

// Update social links (for creators)
app.post('/api/creator/social-links', (req, res) => {
  if (!req.session.userId) return res.json({ error: 'Не авторизован' });
  const { youtube, telegram, vk, boosty } = req.body;
  db.upsertProfile(req.session.userId, { social_links: { youtube, telegram, vk, boosty } });
  res.json({ ok: true });
});

// === Gamification ===

// Get my XP and level
app.get('/api/me/xp', (req, res) => {
  if (!req.session.userId) return res.json({ xp: 0, level: 1 });
  const xpData = db.getXP(req.session.userId);
  const nextLevelXP = Math.pow(xpData.level, 2) * 100;
  const currentLevelXP = Math.pow(xpData.level - 1, 2) * 100;
  const progress = xpData.xp >= nextLevelXP ? 100 : Math.round(((xpData.xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100);
  res.json({ ...xpData, next_level_xp: nextLevelXP, progress });
});

// Get my achievements
app.get('/api/me/achievements', (req, res) => {
  if (!req.session.userId) return res.json({ achievements: [], all: db.ACHIEVEMENTS });
  const earned = db.getUserAchievements(req.session.userId);
  const all = db.ACHIEVEMENTS.map(a => {
    const e = earned.find(ea => ea.achievement_id === a.id);
    return { ...a, earned: !!e, earned_at: e?.earned_at || null };
  });
  res.json({ achievements: all, earned_count: earned.length, total_count: db.ACHIEVEMENTS.length });
});

// Get user achievements (public)
app.get('/api/user/:id/achievements', (req, res) => {
  const userId = parseInt(req.params.id);
  const earned = db.getUserAchievements(userId);
  const all = db.ACHIEVEMENTS.map(a => {
    const e = earned.find(ea => ea.achievement_id === a.id);
    return { ...a, earned: !!e, earned_at: e?.earned_at || null };
  });
  res.json({ achievements: all, earned_count: earned.length, total_count: db.ACHIEVEMENTS.length });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const board = db.getLeaderboard(50);
  res.json({ leaderboard: board });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Prevent crashes from unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('[Unhandled]', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[Uncaught]', err?.message || err);
});

app.listen(PORT, () => {
  console.log(`\n  Anixart PC v4.0`);
  console.log(`  http://localhost:${PORT}\n`);

  // Start first crawl after 5 seconds, then every 2 hours
  setTimeout(() => {
    if (!_crawlRunning) {
      _crawlRunning = true;
      crawlVoiceovers().then(found => {
        _crawlStats = { lastRun: new Date().toISOString(), lastFound: found, totalRuns: 1 };
        _crawlRunning = false;
      }).catch(err => { console.error('[Crawler] Fatal:', err?.message || err); _crawlRunning = false; });
    }
  }, 5000);

  setInterval(() => {
    if (!_crawlRunning) {
      _crawlRunning = true;
      crawlVoiceovers().then(found => {
        _crawlStats = { lastRun: new Date().toISOString(), lastFound: found, totalRuns: _crawlStats.totalRuns + 1 };
        _crawlRunning = false;
      }).catch(err => { console.error('[Crawler] Fatal:', err?.message || err); _crawlRunning = false; });
    }
  }, 2 * 60 * 60 * 1000); // every 2 hours
});
