const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

// Default structure
const DEFAULT_DATA = {
  users: [],
  favorites: [],
  watch_history: [],
  watch_progress: [],
  watch_time: [],
  manga_cache: [],
  manga_voiceovers: [],
  voiceover_search_log: [],
  manga_submissions: [],
  voiceover_channels: [],
  manga_wishlist: [],
  saved_voiceovers: [],
  comments: [],
  user_profiles: [],
  creator_requests: [],
  user_xp: [],
  user_achievements: [],
  user_points: [],
  user_inventory: [],
  user_equipped: [],
  marketplace: [],
  friend_requests: []
};

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('DB load error:', e);
  }
  return { ...DEFAULT_DATA };
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

let _db = loadDB();

// Migrate: assign friend codes + last_seen to users without one
let _needsSave = false;
(_db.users || []).forEach(u => {
  if (!u.friend_code) {
    u.friend_code = (u.username || u.name || 'USER').toUpperCase().slice(0,4) + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
    _needsSave = true;
  }
  if (!u.last_seen) {
    u.last_seen = u.last_login || u.created_at || new Date().toISOString();
    _needsSave = true;
  }
});
// Deduplicate watch_progress (keep latest by updated_at)
if (_db.watch_progress) {
  const seen = new Map();
  _db.watch_progress.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  _db.watch_progress = _db.watch_progress.filter(p => {
    const key = p.user_id + ':' + String(p.anime_id);
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
  _needsSave = true;
}
if (_needsSave) saveDB(_db);

let _saveTimer = null;

// Debounced save
function save() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveDB(_db), 500);
}

function nextId(collection) {
  const max = collection.reduce((m, item) => Math.max(m, item.id || 0), 0);
  return max + 1;
}

const db = {
  // Users
  findUserByGoogleId(googleId) {
    return _db.users.find(u => u.google_id === googleId) || null;
  },

  findUserById(id) {
    return _db.users.find(u => u.id === id) || null;
  },

  findUserByUsername(username) {
    return _db.users.find(u => u.username === username) || null;
  },

  findUserByEmail(email) {
    return _db.users.find(u => u.email === email) || null;
  },

  searchUsers(query, excludeId) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return _db.users.filter(u => u.id !== excludeId &&
      ((u.name && u.name.toLowerCase().includes(q)) ||
       (u.username && u.username.toLowerCase().includes(q)) ||
       (u.friend_code && u.friend_code.toLowerCase() === q))
    ).slice(0, 20).map(u => ({ id: u.id, name: u.name, username: u.username, avatar: u.avatar, friend_code: u.friend_code }));
  },

  findUserByFriendCode(code) {
    return _db.users.find(u => u.friend_code && u.friend_code.toLowerCase() === code.toLowerCase()) || null;
  },

  createUser({ google_id, email, name, avatar, username, password_hash }) {
    const fc = (username || name || 'user').toUpperCase().slice(0,4) + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
    const user = {
      id: nextId(_db.users),
      google_id: google_id || null,
      email,
      name,
      avatar: avatar || null,
      username: username || null,
      password_hash: password_hash || null,
      friend_code: fc,
      role: 'user',
      roles: ['user'],
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      watching_now: null
    };
    _db.users.push(user);
    save();
    return user;
  },

  touchUser(userId) {
    const uid = parseInt(userId);
    const user = _db.users.find(u => u.id === uid);
    if (user) { user.last_seen = new Date().toISOString(); save(); }
  },
  setWatching(userId, title) {
    const uid = parseInt(userId);
    const user = _db.users.find(u => u.id === uid);
    if (user) { user.watching_now = title || null; user.last_seen = new Date().toISOString(); save(); }
  },
  updateUserLogin(googleId, name, avatar) {
    const user = _db.users.find(u => u.google_id === googleId);
    if (user) { user.last_login = new Date().toISOString(); user.name = name; user.avatar = avatar; save(); }
    return user;
  },

  // Favorites
  getFavorites(userId) {
    return _db.favorites.filter(f => f.user_id === userId).sort((a, b) => new Date(b.added_at) - new Date(a.added_at));
  },

  addFavorite(userId, animeId, title, image) {
    const exists = _db.favorites.find(f => f.user_id === userId && f.anime_id === animeId);
    if (exists) return;
    _db.favorites.push({ id: nextId(_db.favorites), user_id: userId, anime_id: animeId, title, image, added_at: new Date().toISOString() });
    save();
  },

  removeFavorite(userId, animeId) {
    _db.favorites = _db.favorites.filter(f => !(f.user_id === userId && f.anime_id === animeId));
    save();
  },

  isFavorite(userId, animeId) {
    return !!_db.favorites.find(f => f.user_id === userId && f.anime_id === animeId);
  },

  // Watch history
  getHistory(userId) {
    const history = _db.watch_history.filter(h => h.user_id === userId);
    // Group by anime_id, get latest
    const grouped = {};
    history.forEach(h => {
      if (!grouped[h.anime_id] || new Date(h.watched_at) > new Date(grouped[h.anime_id].watched_at)) {
        grouped[h.anime_id] = h;
      }
    });
    return Object.values(grouped).sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at)).slice(0, 50);
  },

  addHistory(userId, animeId, episode, title, image) {
    _db.watch_history.push({ id: nextId(_db.watch_history), user_id: userId, anime_id: animeId, episode: episode || 1, title, image, watched_at: new Date().toISOString() });
    save();
  },

  // Watch progress
  getProgress(userId) {
    return _db.watch_progress.filter(p => p.user_id === userId).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  },

  getProgressForAnime(userId, animeId) {
    return _db.watch_progress.find(p => p.user_id === userId && String(p.anime_id) === String(animeId)) || null;
  },

  upsertProgress(userId, { anime_id, current_episode, total_episodes, status, score, title, image, watched_eps, last_type_id, last_source_id, ep_times }) {
    const existing = _db.watch_progress.find(p => p.user_id === userId && String(p.anime_id) === String(anime_id));
    if (existing) {
      if (current_episode !== undefined) existing.current_episode = current_episode;
      if (total_episodes !== undefined) existing.total_episodes = total_episodes;
      if (status) existing.status = status;
      if (score !== undefined) existing.score = score;
      if (title) existing.title = title;
      if (image) existing.image = image;
      if (watched_eps !== undefined) existing.watched_eps = watched_eps;
      if (last_type_id !== undefined) existing.last_type_id = last_type_id;
      if (last_source_id !== undefined) existing.last_source_id = last_source_id;
      if (ep_times !== undefined) {
        if (!existing.ep_times) existing.ep_times = {};
        Object.assign(existing.ep_times, ep_times);
      }
      existing.updated_at = new Date().toISOString();
    } else {
      _db.watch_progress.push({
        id: nextId(_db.watch_progress), user_id: userId, anime_id,
        current_episode: current_episode || 1, total_episodes: total_episodes || 0,
        status: status || '', score: score || 0,
        title, image, watched_eps: watched_eps || [],
        last_type_id: last_type_id || null, last_source_id: last_source_id || null,
        ep_times: ep_times || {},
        updated_at: new Date().toISOString()
      });
    }
    save();
  },

  // Watch time
  addWatchTime(userId, animeId, seconds) {
    const today = new Date().toISOString().split('T')[0];
    const existing = _db.watch_time.find(w => w.user_id === userId && w.anime_id === animeId && w.date === today);
    if (existing) {
      existing.seconds += seconds;
    } else {
      _db.watch_time.push({ id: nextId(_db.watch_time), user_id: userId, anime_id: animeId, seconds, date: today });
    }
    save();
  },

  // === Manga ===

  // Manga cache
  getMangaBySlug(slug) {
    return _db.manga_cache.find(m => m.slug === slug) || null;
  },

  getMangaById(id) {
    return _db.manga_cache.find(m => m.id === id) || null;
  },

  getAllMangaCache() {
    if (!_db.manga_cache) _db.manga_cache = [];
    return _db.manga_cache;
  },

  cacheManga({ slug, remanga_id, title_ru, title_en, cover, genres, rating, chapters_count, status, description }) {
    if (!_db.manga_cache) _db.manga_cache = [];
    const existing = _db.manga_cache.find(m => m.slug === slug);
    if (existing) {
      Object.assign(existing, { remanga_id, title_ru, title_en, cover, genres, rating, chapters_count, status, description, cached_at: new Date().toISOString() });
      save();
      return existing;
    }
    const m = { id: nextId(_db.manga_cache), slug, remanga_id, title_ru, title_en, cover, genres, rating, chapters_count, status, description, cached_at: new Date().toISOString() };
    _db.manga_cache.push(m);
    save();
    return m;
  },

  // Voiceovers
  getAllVoiceovers() {
    if (!_db.manga_voiceovers) _db.manga_voiceovers = [];
    return _db.manga_voiceovers;
  },

  getVoiceovers(mangaId) {
    if (!_db.manga_voiceovers) _db.manga_voiceovers = [];
    return _db.manga_voiceovers.filter(v => v.manga_id === mangaId).sort((a, b) => b.view_count - a.view_count);
  },

  getVoiceoverById(id) {
    if (!_db.manga_voiceovers) _db.manga_voiceovers = [];
    return _db.manga_voiceovers.find(v => v.id === id) || null;
  },

  addVoiceover({ manga_id, source, video_id, title, channel, thumbnail, duration, url, is_auto, author_name }) {
    if (!_db.manga_voiceovers) _db.manga_voiceovers = [];
    const exists = _db.manga_voiceovers.find(v => v.manga_id === manga_id && v.source === source && v.video_id === video_id);
    if (exists) return exists;
    const v = { id: nextId(_db.manga_voiceovers), manga_id, source, video_id, title, channel, thumbnail, duration, url, direct_url: null, direct_url_expires: null, is_auto: !!is_auto, author_name: author_name || null, view_count: 0, added_at: new Date().toISOString() };
    _db.manga_voiceovers.push(v);
    save();
    return v;
  },

  updateVoiceoverDirectUrl(id, directUrl, expiresAt) {
    const v = _db.manga_voiceovers.find(v => v.id === id);
    if (v) { v.direct_url = directUrl; v.direct_url_expires = expiresAt; save(); }
  },

  incrementVoiceoverViews(id) {
    const v = _db.manga_voiceovers.find(v => v.id === id);
    if (v) { v.view_count = (v.view_count || 0) + 1; save(); }
  },

  // Search log
  getSearchLog(mangaId, source) {
    if (!_db.voiceover_search_log) _db.voiceover_search_log = [];
    return _db.voiceover_search_log.find(l => l.manga_id === mangaId && l.source === source) || null;
  },

  logSearch(mangaId, source, query, resultsCount) {
    if (!_db.voiceover_search_log) _db.voiceover_search_log = [];
    const existing = _db.voiceover_search_log.find(l => l.manga_id === mangaId && l.source === source);
    if (existing) {
      existing.query = query; existing.results_count = resultsCount; existing.searched_at = new Date().toISOString();
      save();
      return;
    }
    _db.voiceover_search_log.push({ id: nextId(_db.voiceover_search_log), manga_id: mangaId, source, query, results_count: resultsCount, searched_at: new Date().toISOString() });
    save();
  },

  // Submissions
  addSubmission({ manga_id, url, author_name, user_id }) {
    if (!_db.manga_submissions) _db.manga_submissions = [];
    const s = { id: nextId(_db.manga_submissions), manga_id, url, author_name, submitted_by: user_id, status: 'approved', submitted_at: new Date().toISOString() };
    _db.manga_submissions.push(s);
    save();
    return s;
  },

  // Voiceover channels
  getChannels() {
    if (!_db.voiceover_channels) _db.voiceover_channels = [];
    return _db.voiceover_channels;
  },

  addChannel({ platform, name, url, handle }) {
    if (!_db.voiceover_channels) _db.voiceover_channels = [];
    const exists = _db.voiceover_channels.find(c => c.url === url || c.handle === handle);
    if (exists) return exists;
    const c = { id: nextId(_db.voiceover_channels), platform, name, url, handle, added_at: new Date().toISOString() };
    _db.voiceover_channels.push(c);
    save();
    return c;
  },

  removeChannel(id) {
    if (!_db.voiceover_channels) return;
    _db.voiceover_channels = _db.voiceover_channels.filter(c => c.id !== id);
    save();
  },

  // Popular manga with voiceovers
  getPopularMangaWithVoiceovers(limit = 20) {
    if (!_db.manga_voiceovers) _db.manga_voiceovers = [];
    if (!_db.manga_cache) _db.manga_cache = [];
    const mangaViews = {};
    _db.manga_voiceovers.forEach(v => {
      mangaViews[v.manga_id] = (mangaViews[v.manga_id] || 0) + v.view_count + 1;
    });
    return Object.entries(mangaViews)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([mangaId]) => {
        const manga = _db.manga_cache.find(m => m.id === parseInt(mangaId));
        if (!manga) return null;
        return { ...manga, voiceover_count: _db.manga_voiceovers.filter(v => v.manga_id === parseInt(mangaId)).length };
      })
      .filter(Boolean);
  },

  // === Wishlist ===

  getWishlist(mangaId) {
    if (!_db.manga_wishlist) _db.manga_wishlist = [];
    return _db.manga_wishlist.filter(w => w.manga_id === mangaId);
  },

  getUserWishlist(userId) {
    if (!_db.manga_wishlist) _db.manga_wishlist = [];
    return _db.manga_wishlist.filter(w => w.user_id === userId);
  },

  addWish(userId, mangaId) {
    if (!_db.manga_wishlist) _db.manga_wishlist = [];
    const exists = _db.manga_wishlist.find(w => w.user_id === userId && w.manga_id === mangaId);
    if (exists) return exists;
    const wish = { id: nextId(_db.manga_wishlist), user_id: userId, manga_id: mangaId, created_at: new Date().toISOString() };
    _db.manga_wishlist.push(wish);
    save();
    return wish;
  },

  removeWish(userId, mangaId) {
    if (!_db.manga_wishlist) _db.manga_wishlist = [];
    _db.manga_wishlist = _db.manga_wishlist.filter(w => !(w.user_id === userId && w.manga_id === mangaId));
    save();
  },

  isWished(userId, mangaId) {
    if (!_db.manga_wishlist) _db.manga_wishlist = [];
    return !!_db.manga_wishlist.find(w => w.user_id === userId && w.manga_id === mangaId);
  },

  getWishCounts() {
    if (!_db.manga_wishlist) _db.manga_wishlist = [];
    const counts = {};
    _db.manga_wishlist.forEach(w => {
      counts[w.manga_id] = (counts[w.manga_id] || 0) + 1;
    });
    const sorted = {};
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => { sorted[k] = v; });
    return sorted;
  },

  // === Saved Voiceovers ===

  getSaved(userId) {
    if (!_db.saved_voiceovers) _db.saved_voiceovers = [];
    return _db.saved_voiceovers.filter(s => s.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  addSave(userId, voiceoverId) {
    if (!_db.saved_voiceovers) _db.saved_voiceovers = [];
    const exists = _db.saved_voiceovers.find(s => s.user_id === userId && s.voiceover_id === voiceoverId);
    if (exists) return exists;
    const entry = { id: nextId(_db.saved_voiceovers), user_id: userId, voiceover_id: voiceoverId, created_at: new Date().toISOString() };
    _db.saved_voiceovers.push(entry);
    save();
    return entry;
  },

  removeSave(userId, voiceoverId) {
    if (!_db.saved_voiceovers) _db.saved_voiceovers = [];
    _db.saved_voiceovers = _db.saved_voiceovers.filter(s => !(s.user_id === userId && s.voiceover_id === voiceoverId));
    save();
  },

  isSaved(userId, voiceoverId) {
    if (!_db.saved_voiceovers) _db.saved_voiceovers = [];
    return !!_db.saved_voiceovers.find(s => s.user_id === userId && s.voiceover_id === voiceoverId);
  },

  // === Comments ===

  getUserCommentCount(userId) {
    if (!_db.comments) _db.comments = [];
    return _db.comments.filter(c => c.user_id === userId).length;
  },

  getComments(voiceoverId) {
    if (!_db.comments) _db.comments = [];
    return _db.comments.filter(c => c.voiceover_id === voiceoverId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  },

  addComment(userId, voiceoverId, text) {
    if (!_db.comments) _db.comments = [];
    const comment = {
      id: nextId(_db.comments),
      user_id: userId,
      voiceover_id: voiceoverId,
      text,
      created_at: new Date().toISOString(),
      edited_at: null
    };
    _db.comments.push(comment);
    save();
    return comment;
  },

  editComment(commentId, userId, text) {
    if (!_db.comments) _db.comments = [];
    const comment = _db.comments.find(c => c.id === commentId);
    if (!comment || comment.user_id !== userId) return null;
    comment.text = text;
    comment.edited_at = new Date().toISOString();
    save();
    return comment;
  },

  deleteComment(commentId, userId) {
    if (!_db.comments) _db.comments = [];
    const comment = _db.comments.find(c => c.id === commentId);
    if (!comment) return false;
    const user = _db.users.find(u => u.id === userId);
    if (comment.user_id !== userId && (!user || !(user.role === 'admin' || user.role === 'owner' || (user.roles && (user.roles.includes('admin') || user.roles.includes('owner')))))) return false;
    _db.comments = _db.comments.filter(c => c.id !== commentId);
    save();
    return true;
  },

  // === Reviews (Steam-style) ===

  getReviews(releaseId, page = 1, perPage = 10) {
    if (!_db.reviews) _db.reviews = [];
    const all = _db.reviews
      .filter(r => r.release_id === releaseId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const start = (page - 1) * perPage;
    return { reviews: all.slice(start, start + perPage), total: all.length, page, pages: Math.ceil(all.length / perPage) };
  },

  getUserReview(userId, releaseId) {
    if (!_db.reviews) _db.reviews = [];
    return _db.reviews.find(r => r.user_id === userId && r.release_id === releaseId) || null;
  },

  addReview(userId, releaseId, text, recommend, spoiler, title, episode) {
    if (!_db.reviews) _db.reviews = [];
    const existing = _db.reviews.find(r => r.user_id === userId && r.release_id === releaseId);
    if (existing) {
      existing.text = text;
      existing.recommend = recommend;
      existing.spoiler = !!spoiler;
      if (title) existing.release_title = title;
      if (episode !== undefined && episode !== null) existing.episode_at_review = episode;
      existing.updated_at = new Date().toISOString();
      save();
      return existing;
    }
    const review = {
      id: nextId(_db.reviews),
      user_id: userId,
      release_id: releaseId,
      release_title: title || '',
      text,
      recommend,
      spoiler: !!spoiler,
      episode_at_review: episode || 0,
      reactions: { yes: 0, no: 0, funny: 0 },
      reacted_by: [],
      created_at: new Date().toISOString(),
      updated_at: null
    };
    _db.reviews.push(review);
    save();
    return review;
  },

  deleteReview(reviewId, userId) {
    if (!_db.reviews) _db.reviews = [];
    const r = _db.reviews.find(r => r.id === reviewId);
    if (!r) return false;
    const u = _db.users.find(u => u.id === userId);
    if (r.user_id !== userId && (!u || !(u.role === 'admin' || u.role === 'owner' || (u.roles && (u.roles.includes('admin') || u.roles.includes('owner')))))) return false;
    _db.reviews = _db.reviews.filter(r => r.id !== reviewId);
    save();
    return true;
  },

  reactReview(reviewId, userId, type) {
    if (!_db.reviews) _db.reviews = [];
    const r = _db.reviews.find(r => r.id === reviewId);
    if (!r) return null;
    if (!r.reacted_by) r.reacted_by = [];
    const prev = r.reacted_by.find(rb => rb.user_id === userId);
    if (prev) {
      if (prev.type === type) return r; // already reacted same
      r.reactions[prev.type] = Math.max(0, (r.reactions[prev.type] || 0) - 1);
      prev.type = type;
    } else {
      r.reacted_by.push({ user_id: userId, type });
    }
    r.reactions[type] = (r.reactions[type] || 0) + 1;
    save();
    return r;
  },

  getUserReviews(userId, limit = 20) {
    if (!_db.reviews) _db.reviews = [];
    return _db.reviews.filter(r => r.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
  },

  getReviewStats(releaseId) {
    if (!_db.reviews) _db.reviews = [];
    const all = _db.reviews.filter(r => r.release_id === releaseId);
    const pos = all.filter(r => r.recommend).length;
    return { total: all.length, positive: pos, negative: all.length - pos };
  },

  // === Profile Comments ===

  getProfileComments(profileUserId, page = 1, perPage = 20) {
    if (!_db.profile_comments) _db.profile_comments = [];
    const all = _db.profile_comments
      .filter(c => c.profile_user_id === profileUserId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const start = (page - 1) * perPage;
    return { comments: all.slice(start, start + perPage), total: all.length, page };
  },

  addProfileComment(authorId, profileUserId, text) {
    if (!_db.profile_comments) _db.profile_comments = [];
    const comment = {
      id: nextId(_db.profile_comments),
      author_id: authorId,
      profile_user_id: profileUserId,
      text,
      created_at: new Date().toISOString()
    };
    _db.profile_comments.push(comment);
    save();
    return comment;
  },

  deleteProfileComment(commentId, userId) {
    if (!_db.profile_comments) _db.profile_comments = [];
    const c = _db.profile_comments.find(c => c.id === commentId);
    if (!c) return false;
    const u = _db.users.find(u => u.id === userId);
    // Author, profile owner, or admin can delete
    if (c.author_id !== userId && c.profile_user_id !== userId && (!u || !(u.role === 'admin' || u.role === 'owner' || (u.roles && (u.roles.includes('admin') || u.roles.includes('owner')))))) return false;
    _db.profile_comments = _db.profile_comments.filter(c => c.id !== commentId);
    save();
    return true;
  },

  // === User Profiles ===

  getProfile(userId) {
    if (!_db.user_profiles) _db.user_profiles = [];
    return _db.user_profiles.find(p => p.user_id === userId) || null;
  },

  upsertProfile(userId, data) {
    if (!_db.user_profiles) _db.user_profiles = [];
    const existing = _db.user_profiles.find(p => p.user_id === userId);
    if (existing) {
      if (data.bio !== undefined) existing.bio = data.bio;
      if (data.banner_color !== undefined) existing.banner_color = data.banner_color;
      if (data.badge !== undefined) existing.badge = data.badge;
      if (data.social_links !== undefined) existing.social_links = data.social_links;
      if (data.is_creator !== undefined) existing.is_creator = data.is_creator;
      if (data.creator_verified !== undefined) existing.creator_verified = data.creator_verified;
      save();
      return existing;
    }
    const profile = {
      id: nextId(_db.user_profiles),
      user_id: userId,
      bio: data.bio || null,
      banner_color: data.banner_color || null,
      badge: data.badge || null,
      is_creator: data.is_creator || false,
      creator_verified: data.creator_verified || false,
      social_links: data.social_links || null
    };
    _db.user_profiles.push(profile);
    save();
    return profile;
  },

  setCreator(userId, verified) {
    return this.upsertProfile(userId, { is_creator: true, creator_verified: !!verified });
  },

  updateUser(userId, fields) {
    const user = _db.users.find(u => u.id === userId);
    if (!user) return null;
    Object.assign(user, fields);
    save();
    return user;
  },

  // === Creator System ===

  createCreatorRequest(userId, { channel_urls, description }) {
    if (!_db.creator_requests) _db.creator_requests = [];
    // Don't allow duplicate pending requests
    const pending = _db.creator_requests.find(r => r.user_id === userId && r.status === 'pending');
    if (pending) return pending;
    const req = {
      id: nextId(_db.creator_requests),
      user_id: userId,
      channel_urls: channel_urls || [],
      description: description || '',
      status: 'pending', // pending, approved, rejected
      requested_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      review_note: null
    };
    _db.creator_requests.push(req);
    save();
    return req;
  },

  getCreatorRequests(status) {
    if (!_db.creator_requests) _db.creator_requests = [];
    if (status) return _db.creator_requests.filter(r => r.status === status);
    return _db.creator_requests;
  },

  getCreatorRequestByUser(userId) {
    if (!_db.creator_requests) _db.creator_requests = [];
    return _db.creator_requests.filter(r => r.user_id === userId).sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
  },

  reviewCreatorRequest(requestId, adminId, { status, note }) {
    if (!_db.creator_requests) _db.creator_requests = [];
    const req = _db.creator_requests.find(r => r.id === requestId);
    if (!req) return null;
    req.status = status; // 'approved' or 'rejected'
    req.reviewed_at = new Date().toISOString();
    req.reviewed_by = adminId;
    req.review_note = note || null;
    if (status === 'approved') {
      // Auto-set creator status on profile
      this.upsertProfile(req.user_id, { is_creator: true, creator_verified: true });
      // Update user role
      this.updateUser(req.user_id, { role: 'creator' });
    }
    save();
    return req;
  },

  getCreatorChannelHandles(userId) {
    // Get channel handles linked to this creator from their voiceovers or requests
    if (!_db.creator_requests) _db.creator_requests = [];
    const profile = this.getProfile(userId);
    const channels = [];
    // From approved requests
    const approved = _db.creator_requests.find(r => r.user_id === userId && r.status === 'approved');
    if (approved && approved.channel_urls) {
      approved.channel_urls.forEach(url => {
        // Extract handle from YouTube URL or channel name
        const match = url.match(/@([\w.-]+)/);
        if (match) channels.push(match[1].toLowerCase());
        // Or just the raw value if it's a handle
        else channels.push(url.toLowerCase().replace(/^@/, ''));
      });
    }
    // From profile social links
    if (profile && profile.social_links) {
      if (profile.social_links.youtube) {
        const m = profile.social_links.youtube.match(/@([\w.-]+)/);
        if (m) channels.push(m[1].toLowerCase());
      }
      if (profile.social_links.telegram) {
        channels.push(profile.social_links.telegram.toLowerCase().replace(/^@/, ''));
      }
    }
    return [...new Set(channels)];
  },

  getCreatorVoiceovers(userId) {
    if (!_db.manga_voiceovers) _db.manga_voiceovers = [];
    const handles = this.getCreatorChannelHandles(userId);
    if (!handles.length) return [];
    return _db.manga_voiceovers.filter(v => {
      const ch = (v.channel || v.author_name || '').toLowerCase();
      return handles.some(h => ch.includes(h));
    });
  },

  getCreatorStats(userId) {
    const voiceovers = this.getCreatorVoiceovers(userId);
    const totalViews = voiceovers.reduce((s, v) => s + (v.view_count || 0), 0);
    const totalSaves = !_db.saved_voiceovers ? 0 : _db.saved_voiceovers.filter(s => voiceovers.some(v => v.id === s.voiceover_id)).length;
    const totalComments = !_db.comments ? 0 : _db.comments.filter(c => voiceovers.some(v => v.id === c.voiceover_id)).length;
    const mangaIds = [...new Set(voiceovers.map(v => v.manga_id))];

    // Creator level based on voiceover count
    let level = 'bronze';
    if (voiceovers.length >= 50) level = 'diamond';
    else if (voiceovers.length >= 20) level = 'gold';
    else if (voiceovers.length >= 5) level = 'silver';

    return {
      total_voiceovers: voiceovers.length,
      total_views: totalViews,
      total_saves: totalSaves,
      total_comments: totalComments,
      manga_count: mangaIds.length,
      level,
      voiceovers
    };
  },

  getVerifiedCreators() {
    if (!_db.user_profiles) _db.user_profiles = [];
    return _db.user_profiles
      .filter(p => p.is_creator && p.creator_verified)
      .map(p => {
        const user = _db.users.find(u => u.id === p.user_id);
        if (!user) return null;
        const stats = this.getCreatorStats(p.user_id);
        return { id: user.id, username: user.username, name: user.name, avatar: user.avatar, role: user.role, profile: p, stats: { total_voiceovers: stats.total_voiceovers, total_views: stats.total_views, level: stats.level, manga_count: stats.manga_count } };
      })
      .filter(Boolean)
      .sort((a, b) => b.stats.total_voiceovers - a.stats.total_voiceovers);
  },

  // === Gamification ===

  // XP system
  getXP(userId) {
    if (!_db.user_xp) _db.user_xp = [];
    const entry = _db.user_xp.find(x => x.user_id === userId);
    return entry || { user_id: userId, xp: 0, level: 1 };
  },

  addXP(userId, amount, reason) {
    if (!_db.user_xp) _db.user_xp = [];
    let entry = _db.user_xp.find(x => x.user_id === userId);
    if (!entry) {
      entry = { id: nextId(_db.user_xp), user_id: userId, xp: 0, level: 1 };
      _db.user_xp.push(entry);
    }
    entry.xp += amount;
    // Level formula: level = floor(sqrt(xp / 100)) + 1, max 99
    entry.level = Math.min(99, Math.floor(Math.sqrt(entry.xp / 100)) + 1);
    save();
    // Check for level-based achievements
    this._checkAchievements(userId);
    return entry;
  },

  getLeaderboard(limit = 50) {
    if (!_db.user_xp) _db.user_xp = [];
    return _db.user_xp
      .sort((a, b) => b.xp - a.xp)
      .slice(0, limit)
      .map(x => {
        const user = _db.users.find(u => u.id === x.user_id);
        return user ? { user_id: x.user_id, username: user.username, name: user.name, avatar: user.avatar, role: user.role, xp: x.xp, level: x.level } : null;
      })
      .filter(Boolean);
  },

  // Achievements
  ACHIEVEMENTS: [
    { id: 'first_login', name: 'Первый шаг', desc: 'Зарегистрироваться на платформе', icon: 'fa-door-open', xp: 10 },
    { id: 'first_comment', name: 'Голос народа', desc: 'Оставить первый комментарий', icon: 'fa-comment', xp: 15 },
    { id: 'first_save', name: 'Коллекционер', desc: 'Сохранить первую озвучку', icon: 'fa-bookmark', xp: 15 },
    { id: 'first_wish', name: 'Мечтатель', desc: 'Добавить мангу в вишлист', icon: 'fa-star', xp: 10 },
    { id: 'comments_10', name: 'Активист', desc: 'Оставить 10 комментариев', icon: 'fa-comments', xp: 30 },
    { id: 'comments_50', name: 'Критик', desc: 'Оставить 50 комментариев', icon: 'fa-pen-fancy', xp: 75 },
    { id: 'saves_10', name: 'Библиотекарь', desc: 'Сохранить 10 озвучек', icon: 'fa-book', xp: 30 },
    { id: 'saves_50', name: 'Архивариус', desc: 'Сохранить 50 озвучек', icon: 'fa-archive', xp: 75 },
    { id: 'wishes_5', name: 'Фантазёр', desc: 'Добавить 5 манг в вишлист', icon: 'fa-magic', xp: 20 },
    { id: 'wishes_20', name: 'Куратор', desc: 'Добавить 20 манг в вишлист', icon: 'fa-list-alt', xp: 50 },
    { id: 'level_5', name: 'Новичок+', desc: 'Достигнуть 5 уровня', icon: 'fa-angle-up', xp: 25 },
    { id: 'level_10', name: 'Опытный', desc: 'Достигнуть 10 уровня', icon: 'fa-angle-double-up', xp: 50 },
    { id: 'level_25', name: 'Ветеран', desc: 'Достигнуть 25 уровня', icon: 'fa-shield-alt', xp: 100 },
    { id: 'level_50', name: 'Легенда', desc: 'Достигнуть 50 уровня', icon: 'fa-crown', xp: 200 },
    { id: 'creator', name: 'Создатель', desc: 'Стать верифицированным озвучкером', icon: 'fa-microphone-alt', xp: 100 },
    { id: 'manga_explorer_10', name: 'Исследователь', desc: 'Посмотреть озвучки 10 разных манг', icon: 'fa-compass', xp: 30 },
    { id: 'manga_explorer_50', name: 'Путешественник', desc: 'Посмотреть озвучки 50 разных манг', icon: 'fa-globe', xp: 75 },
  ],

  getUserAchievements(userId) {
    if (!_db.user_achievements) _db.user_achievements = [];
    return _db.user_achievements.filter(a => a.user_id === userId);
  },

  hasAchievement(userId, achievementId) {
    if (!_db.user_achievements) _db.user_achievements = [];
    return !!_db.user_achievements.find(a => a.user_id === userId && a.achievement_id === achievementId);
  },

  grantAchievement(userId, achievementId) {
    if (!_db.user_achievements) _db.user_achievements = [];
    if (this.hasAchievement(userId, achievementId)) return null;
    const achDef = this.ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!achDef) return null;
    const ach = {
      id: nextId(_db.user_achievements),
      user_id: userId,
      achievement_id: achievementId,
      earned_at: new Date().toISOString()
    };
    _db.user_achievements.push(ach);
    save();
    // Grant XP for achievement
    if (achDef.xp) this.addXP(userId, achDef.xp, 'achievement:' + achievementId);
    return { ...ach, ...achDef };
  },

  _checkAchievements(userId) {
    if (!_db.comments) _db.comments = [];
    if (!_db.saved_voiceovers) _db.saved_voiceovers = [];
    if (!_db.manga_wishlist) _db.manga_wishlist = [];

    const xpData = this.getXP(userId);
    const commentCount = _db.comments.filter(c => c.user_id === userId).length;
    const saveCount = _db.saved_voiceovers.filter(s => s.user_id === userId).length;
    const wishCount = _db.manga_wishlist.filter(w => w.user_id === userId).length;
    const user = _db.users.find(u => u.id === userId);

    // Comment achievements
    if (commentCount >= 1) this.grantAchievement(userId, 'first_comment');
    if (commentCount >= 10) this.grantAchievement(userId, 'comments_10');
    if (commentCount >= 50) this.grantAchievement(userId, 'comments_50');

    // Save achievements
    if (saveCount >= 1) this.grantAchievement(userId, 'first_save');
    if (saveCount >= 10) this.grantAchievement(userId, 'saves_10');
    if (saveCount >= 50) this.grantAchievement(userId, 'saves_50');

    // Wish achievements
    if (wishCount >= 1) this.grantAchievement(userId, 'first_wish');
    if (wishCount >= 5) this.grantAchievement(userId, 'wishes_5');
    if (wishCount >= 20) this.grantAchievement(userId, 'wishes_20');

    // Level achievements
    if (xpData.level >= 5) this.grantAchievement(userId, 'level_5');
    if (xpData.level >= 10) this.grantAchievement(userId, 'level_10');
    if (xpData.level >= 25) this.grantAchievement(userId, 'level_25');
    if (xpData.level >= 50) this.grantAchievement(userId, 'level_50');

    // Creator achievement
    if (user && (user.role === 'creator' || user.role === 'admin')) {
      const profile = this.getProfile(userId);
      if (profile && profile.creator_verified) this.grantAchievement(userId, 'creator');
    }
  },

  triggerAction(userId, action) {
    // Call this when user does something to grant XP and check achievements
    const xpMap = {
      comment: 5,
      save: 3,
      wish: 2,
      view_voiceover: 1,
      register: 10,
    };
    const amount = xpMap[action] || 0;
    if (amount > 0) this.addXP(userId, amount, action);
    this._checkAchievements(userId);
  },

  // Stats
  getStats(userId) {
    const progress = _db.watch_progress.filter(p => p.user_id === userId);
    const watchTime = _db.watch_time.filter(w => w.user_id === userId);
    const favs = _db.favorites.filter(f => f.user_id === userId);

    const totalAnime = progress.length;
    const completed = progress.filter(p => p.status === 'completed').length;
    const watching = progress.filter(p => p.status === 'watching').length;
    const planned = progress.filter(p => p.status === 'planned').length;
    const dropped = progress.filter(p => p.status === 'dropped').length;
    const onHold = progress.filter(p => p.status === 'on_hold').length;
    const totalEpisodes = progress.reduce((s, p) => s + (p.current_episode || 0), 0);
    const totalWatchTimeSeconds = watchTime.reduce((s, w) => s + w.seconds, 0);
    const scored = progress.filter(p => p.score > 0);
    const avgScore = scored.length ? Math.round(scored.reduce((s, p) => s + p.score, 0) / scored.length * 10) / 10 : 0;

    // Daily time last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dailyMap = {};
    watchTime.filter(w => new Date(w.date) >= thirtyDaysAgo).forEach(w => {
      dailyMap[w.date] = (dailyMap[w.date] || 0) + w.seconds;
    });
    const dailyTime = Object.entries(dailyMap).sort().map(([date, total]) => ({ date, total }));

    const statusDistribution = [
      { status: 'Смотрю', count: watching, color: '#4CAF50' },
      { status: 'Просмотрено', count: completed, color: '#2196F3' },
      { status: 'Запланировано', count: planned, color: '#FF9800' },
      { status: 'Брошено', count: dropped, color: '#f44336' },
      { status: 'Отложено', count: onHold, color: '#9C27B0' }
    ];

    return {
      totalAnime, completed, watching, planned, dropped, onHold,
      totalEpisodes, totalWatchTimeSeconds, avgScore,
      favoriteCount: favs.length, dailyTime, statusDistribution
    };
  },

  // === Profile Shop ===
  getPoints(userId) {
    if (!_db.user_points) _db.user_points = [];
    const rec = _db.user_points.find(p => p.user_id === userId);
    return rec ? rec.points : 1000; // start with 1000 free points
  },
  addPoints(userId, amount) {
    if (!_db.user_points) _db.user_points = [];
    const rec = _db.user_points.find(p => p.user_id === userId);
    if (rec) { rec.points += amount; }
    else { _db.user_points.push({ id: nextId(_db.user_points), user_id: userId, points: 1000 + amount }); }
    save();
  },
  spendPoints(userId, amount) {
    const pts = this.getPoints(userId);
    if (pts < amount) return false;
    if (!_db.user_points) _db.user_points = [];
    const rec = _db.user_points.find(p => p.user_id === userId);
    if (rec) { rec.points -= amount; }
    else { _db.user_points.push({ id: nextId(_db.user_points), user_id: userId, points: 1000 - amount }); }
    save();
    return true;
  },
  getInventory(userId) {
    if (!_db.user_inventory) _db.user_inventory = [];
    return _db.user_inventory.filter(i => i.user_id === userId);
  },
  addToInventory(userId, itemId) {
    if (!_db.user_inventory) _db.user_inventory = [];
    const exists = _db.user_inventory.find(i => i.user_id === userId && i.item_id === itemId);
    if (exists) return false;
    _db.user_inventory.push({ id: nextId(_db.user_inventory), user_id: userId, item_id: itemId, bought_at: new Date().toISOString() });
    save();
    return true;
  },
  getEquipped(userId) {
    if (!_db.user_equipped) _db.user_equipped = [];
    const rec = _db.user_equipped.find(e => e.user_id === userId);
    return rec || { frame: null, background: null };
  },
  removeFromInventory(userId, itemId) {
    if (!_db.user_inventory) return false;
    const idx = _db.user_inventory.findIndex(i => i.user_id === userId && i.item_id === itemId);
    if (idx === -1) return false;
    _db.user_inventory.splice(idx, 1);
    save();
    return true;
  },
  // Marketplace
  listItem(userId, itemId, price) {
    if (!_db.marketplace) _db.marketplace = [];
    const listing = { id: nextId(_db.marketplace), seller_id: userId, item_id: itemId, price, listed_at: new Date().toISOString(), status: 'active' };
    _db.marketplace.push(listing);
    save();
    return listing;
  },
  getListings() {
    if (!_db.marketplace) _db.marketplace = [];
    return _db.marketplace.filter(l => l.status === 'active');
  },
  getListing(id) {
    if (!_db.marketplace) return null;
    return _db.marketplace.find(l => l.id === id) || null;
  },
  completeListing(id) {
    const l = this.getListing(id);
    if (l) { l.status = 'sold'; l.sold_at = new Date().toISOString(); save(); }
    return l;
  },
  cancelListing(id) {
    const l = this.getListing(id);
    if (l) { l.status = 'cancelled'; save(); }
    return l;
  },
  getUserListings(userId) {
    if (!_db.marketplace) return [];
    return _db.marketplace.filter(l => l.seller_id === userId && l.status === 'active');
  },
  equipItem(userId, slot, itemId) {
    if (!_db.user_equipped) _db.user_equipped = [];
    let rec = _db.user_equipped.find(e => e.user_id === userId);
    if (rec) { rec[slot] = itemId; }
    else { rec = { id: nextId(_db.user_equipped), user_id: userId, frame: null, background: null }; rec[slot] = itemId; _db.user_equipped.push(rec); }
    save();
    return rec;
  },

  // === Friends ===
  sendFriendRequest(senderId, receiverId) {
    if (!_db.friend_requests) _db.friend_requests = [];
    if (senderId === receiverId) return { error: 'Нельзя добавить себя' };
    const existing = _db.friend_requests.find(r =>
      ((r.sender_id === senderId && r.receiver_id === receiverId) ||
       (r.sender_id === receiverId && r.receiver_id === senderId)) &&
      (r.status === 'pending' || r.status === 'accepted')
    );
    if (existing) {
      if (existing.status === 'accepted') return { error: 'Вы уже друзья' };
      return { error: 'Запрос уже отправлен' };
    }
    const req = { id: nextId(_db.friend_requests), sender_id: senderId, receiver_id: receiverId, status: 'pending', created_at: new Date().toISOString() };
    _db.friend_requests.push(req);
    save();
    return req;
  },

  acceptFriendRequest(requestId, userId) {
    if (!_db.friend_requests) _db.friend_requests = [];
    const req = _db.friend_requests.find(r => r.id === requestId && r.receiver_id === userId && r.status === 'pending');
    if (!req) return null;
    req.status = 'accepted';
    req.accepted_at = new Date().toISOString();
    save();
    return req;
  },

  rejectFriendRequest(requestId, userId) {
    if (!_db.friend_requests) _db.friend_requests = [];
    const req = _db.friend_requests.find(r => r.id === requestId && r.receiver_id === userId && r.status === 'pending');
    if (!req) return null;
    req.status = 'rejected';
    save();
    return req;
  },

  removeFriend(userId, friendId) {
    if (!_db.friend_requests) _db.friend_requests = [];
    _db.friend_requests = _db.friend_requests.filter(r =>
      !((r.sender_id === userId && r.receiver_id === friendId) ||
        (r.sender_id === friendId && r.receiver_id === userId)) ||
      r.status !== 'accepted'
    );
    save();
  },

  getFriends(userId) {
    if (!_db.friend_requests) _db.friend_requests = [];
    const accepted = _db.friend_requests.filter(r =>
      r.status === 'accepted' && (r.sender_id === userId || r.receiver_id === userId)
    );
    return accepted.map(r => {
      const fid = r.sender_id === userId ? r.receiver_id : r.sender_id;
      const u = _db.users.find(u => u.id === fid);
      if (!u) return null;
      const xpRec = _db.user_xp?.find(x => x.user_id === fid);
      return { id: u.id, name: u.name, username: u.username, avatar: u.avatar, level: xpRec?.level || 1, last_seen: u.last_seen || u.last_login || null, watching_now: u.watching_now || null };
    }).filter(Boolean);
  },

  getFriendRequests(userId, direction) {
    if (!_db.friend_requests) _db.friend_requests = [];
    if (direction === 'incoming') {
      return _db.friend_requests.filter(r => r.receiver_id === userId && r.status === 'pending').map(r => {
        const u = _db.users.find(u => u.id === r.sender_id);
        return { ...r, sender_name: u?.name || u?.username || 'Аноним', sender_avatar: u?.avatar || null };
      });
    }
    return _db.friend_requests.filter(r => r.sender_id === userId && r.status === 'pending').map(r => {
      const u = _db.users.find(u => u.id === r.receiver_id);
      return { ...r, receiver_name: u?.name || u?.username || 'Аноним', receiver_avatar: u?.avatar || null };
    });
  },

  getFriendshipStatus(userId1, userId2) {
    if (!_db.friend_requests) _db.friend_requests = [];
    const req = _db.friend_requests.find(r =>
      ((r.sender_id === userId1 && r.receiver_id === userId2) ||
       (r.sender_id === userId2 && r.receiver_id === userId1)) &&
      (r.status === 'pending' || r.status === 'accepted')
    );
    if (!req) return 'none';
    if (req.status === 'accepted') return 'friends';
    if (req.sender_id === userId1) return 'pending_sent';
    return 'pending_received';
  }
};

module.exports = db;
