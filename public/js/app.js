// === Anixart PC v4.0 ===
let user = null;
let page = 'home';

// --- Viewport scale (reference: 1366px) ---
function updateVpScale() {
  document.documentElement.style.setProperty('--vp-scale', window.innerWidth / 1366);
}
updateVpScale();
window.addEventListener('resize', updateVpScale);

// --- API ---
async function api(url, opts = {}) {
  const o = { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts };
  if (o.body && typeof o.body === 'object') o.body = JSON.stringify(o.body);
  try {
    const r = await fetch(url, o);
    return await r.json();
  } catch (e) { console.error('API error:', url, e); return null; }
}

// --- Auth ---
async function loadUser() {
  const d = await api('/api/auth/me');
  user = d?.user || null;
  renderTopbar();
  loadXPBadge();
}

function renderTopbar() {
  const el = document.getElementById('topbarRight');
  const profileTab = document.getElementById('profileTab');
  if (user) {
    // Update profile tab text
    if (profileTab) profileTab.textContent = user.name.toUpperCase();
    // Show profile dropdown only when logged in
    const profileDrop = document.getElementById('profileDrop');
    if (profileDrop) profileDrop.style.display = '';
    el.innerHTML = `
      <!-- xp badge removed from header -->
      <div class="s-topbar-icons">
        <div class="s-topbar-icon" onclick="navigate('bookmarks')" title="Закладки"><i class="fas fa-bell"></i></div>
      </div>
      <div class="s-topbar-user" onclick="toggleDD()">
        ${user.avatar ? `<img class="s-avatar" src="${user.avatar}">` :
          `<div class="s-avatar s-avatar-letter">${user.name[0]}</div>`}
        <span class="s-topbar-uname">${user.name} <i class="fas fa-caret-down" style="font-size:10px;opacity:.5"></i></span>
      </div>
    `;
  } else {
    if (profileTab) profileTab.textContent = '';
    const profileDrop = document.getElementById('profileDrop');
    if (profileDrop) profileDrop.style.display = 'none';
    el.innerHTML = `<a class="s-install-btn" onclick="navigate('login')">Войти</a>`;
  }
}

function toggleDD() {
  let dd = document.querySelector('.user-dd');
  if (!dd) {
    dd = document.createElement('div');
    dd.className = 'user-dd';
    dd.innerHTML = `
      <div class="dd-item" onclick="navigate('profile');closeDD()">Мой профиль</div>
      <div class="dd-item dd-item-sub" onclick="navigate('stats');closeDD()">Об аккаунте: <span style="color:var(--accent)">${user.username || user.name}</span></div>
      <div class="dd-item" onclick="navigate('settings');closeDD()">Настройки</div>
      <div class="dd-sep"></div>
      <div class="dd-item" onclick="navigate('login');closeDD()">Войти в другой аккаунт...</div>
      <div class="dd-item" onclick="api('/api/auth/logout',{method:'POST'}).then(()=>{user=null;renderTopbar();navigate('home')})">Выйти из аккаунта...</div>
    `;
    document.querySelector('.s-topbar').appendChild(dd);
  }
  dd.classList.toggle('show');
}

function closeDD() {
  const dd = document.querySelector('.user-dd');
  if (dd) dd.classList.remove('show');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.s-topbar-user') && !e.target.closest('.user-dd')) closeDD();
});

// --- Navigation ---
function _fadeOutHeroAudio() {
  const vid = window._heroVideo;
  if (!vid || vid.muted || vid.volume === 0) return Promise.resolve();
  return new Promise(resolve => {
    let vol = vid.volume;
    const fade = setInterval(() => {
      vol -= 0.05;
      if (vol <= 0) { vid.volume = 0; vid.muted = true; clearInterval(fade); resolve(); }
      else vid.volume = vol;
    }, 30);
    setTimeout(() => { clearInterval(fade); resolve(); }, 700);
  });
}

async function navigate(p, params = {}) {
  // Fade out banner audio when leaving home
  if (window._heroVideo && page === 'home' && p !== 'home') {
    _fadeOutHeroAudio();
    window._heroVideo = null;
  }
  // Clear watching status when leaving player/release — await so profile loads fresh
  if ((page === 'manga-player' || page === 'release') && p !== 'manga-player' && p !== 'release') {
    await api('/api/watching', { method: 'POST', body: { title: null } });
  }
  page = p;
  _hideTip();
  // Update mobile bottom nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === p);
  });
  // Update Steam top tabs
  const storePages = ['home','discover','schedule','catalog','top','collections','search','release','bookmarks','favorites','history','saved','wishlist','animelist','genre'];
  const mangaPages = ['manga','manga-detail','manga-player'];
  const communityPages = ['creators','creator-profile','creator-dashboard','creator-request','admin-creators'];
  const profilePages = ['profile','achievements','leaderboard','stats','settings','friends'];
  document.querySelectorAll('.s-nav-tab').forEach(tab => {
    const t = tab.dataset.tab;
    const active = (t === 'store' && storePages.includes(p)) ||
                   (t === 'manga' && mangaPages.includes(p)) ||
                   (t === 'community' && communityPages.includes(p)) ||
                   (t === 'profile' && profilePages.includes(p));
    tab.classList.toggle('active', active);
  });
  // Update sub-nav based on active section
  updateSubNav(p);
  closeDD();
  const app = document.getElementById('app');
  app.scrollTop = 0;
  app.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  // Update URL hash
  const hashParams = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
  window.location.hash = hashParams ? `${p}?${hashParams}` : p;

  switch (p) {
    case 'home': renderHome(); break;
    case 'discover': renderDiscover(); break;
    case 'search': renderSearch(params.q); break;
    case 'schedule': renderSchedule(); break;
    case 'catalog': renderCatalog(params); break;
    case 'top': renderTop(params); break;
    case 'collections': renderCollections(params); break;
    case 'collection': renderCollection(params.id); break;
    case 'release': renderRelease(params.id); break;
    case 'watch': renderWatch(params.id, params.voice); break;
    case 'bookmarks': renderBookmarks(params); break;
    case 'favorites': renderFavorites(); break;
    case 'history': renderHistory(); break;
    case 'stats': renderStats(); break;
    case 'profile': renderProfile(params.id); break;
    case 'friends': renderFriends(params.id); break;
    case 'settings': renderSettings(); break;
    case 'edit-profile': renderEditProfile(); break;
    case 'shop': renderShop(); break;
    case 'inventory': renderInventory(); break;
    case 'market': renderMarket(); break;
    case 'manga': renderMangaCatalog(params); break;
    case 'manga-detail': renderMangaDetail(params.slug); break;
    case 'manga-player': renderMangaPlayer(params.id); break;
    case 'login': renderLogin(); break;
    case 'register': renderRegister(); break;
    case 'animelist': renderAnimeList(params); break;
    case 'saved': renderSavedPage(); break;
    case 'wishlist': renderWishlistPage(); break;
    case 'creator-dashboard': renderCreatorDashboard(); break;
    case 'creator-profile': renderCreatorProfile(params.id); break;
    case 'creators': renderCreatorsList(); break;
    case 'creator-request': renderCreatorRequest(); break;
    case 'admin-creators': renderAdminCreatorRequests(); break;
    case 'achievements': renderAchievements(); break;
    case 'leaderboard': renderLeaderboard(); break;
    case 'genre': renderGenrePage(params.name); break;
    default: renderHome();
  }
}

// Handle browser back/forward
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const [pg, paramStr] = hash.split('?');
  const params = {};
  if (paramStr) paramStr.split('&').forEach(p => {
    const [k, v] = p.split('=');
    params[k] = decodeURIComponent(v);
  });
  // Avoid infinite loop
  if (pg !== page || JSON.stringify(params) !== '{}') {
    page = pg;
    navigate(pg, params);
  }
});

function doSearch(q) {
  if (!q.trim()) return;
  _closeSearchDrop();
  navigate('search', { q });
}

// === Instant search dropdown ===
var _searchTimer = null;
var _searchDropIdx = -1;
var _searchDropItems = [];

function _onSearchInput(val) {
  clearTimeout(_searchTimer);
  if (!val.trim() || val.trim().length < 2) {
    if (!val.trim()) _showDefaultDrop();
    else _closeSearchDrop();
    return;
  }
  _searchTimer = setTimeout(function() { _doInstantSearch(val.trim()); }, 300);
}

function _onSearchKey(e) {
  var drop = document.getElementById('searchDrop');
  if (!drop || !drop.classList.contains('show')) {
    if (e.key === 'Enter') doSearch(e.target.value);
    return;
  }
  var items = drop.querySelectorAll('.s-search-drop-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _searchDropIdx = Math.min(_searchDropIdx + 1, items.length - 1);
    items.forEach(function(el, i) { el.classList.toggle('active', i === _searchDropIdx); });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _searchDropIdx = Math.max(_searchDropIdx - 1, -1);
    items.forEach(function(el, i) { el.classList.toggle('active', i === _searchDropIdx); });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_searchDropIdx >= 0 && _searchDropItems[_searchDropIdx]) {
      _closeSearchDrop();
      navigate('release', { id: _searchDropItems[_searchDropIdx].id });
    } else {
      doSearch(e.target.value);
    }
  } else if (e.key === 'Escape') {
    _closeSearchDrop();
  }
}

function _onSearchFocus() {
  var val = document.getElementById('searchInput').value;
  if (val.trim().length >= 2 && document.getElementById('searchDrop').innerHTML) {
    document.getElementById('searchDrop').classList.add('show');
  } else if (!val.trim()) {
    _showDefaultDrop();
  }
}

async function _showDefaultDrop() {
  var drop = document.getElementById('searchDrop');
  if (!drop) return;
  // Show discussing anime
  if (!window._dropDiscussing) {
    var data = await api('/api/anixart/discover/discussing');
    window._dropDiscussing = data?.content?.slice(0, 4) || [];
  }
  var items = window._dropDiscussing;
  var html = '';
  if (items.length) {
    html += '<div class="s-search-drop-label">Сейчас обсуждают</div>';
    items.forEach(function(r) {
      var img = posterUrl(r);
      var title = escHtml(r.title_ru || r.title || '');
      var score = r.grade ? r.grade.toFixed(1) : '';
      var sub = escHtml(r.category?.name || r.type?.name || '');
      var id = r.id || r.releaseId || 0;
      html += '<div class="s-search-drop-item" onclick="_closeSearchDrop();navigate(\'release\',{id:' + id + '})">';
      html += '<img src="' + img + '" onerror="this.style.display=\'none\'">';
      html += '<div class="s-search-drop-info"><div class="s-search-drop-title">' + title + '</div>';
      html += '<div class="s-search-drop-sub">' + sub + '</div></div>';
      if (score) html += '<div class="s-search-drop-score">' + score + '</div>';
      html += '</div>';
    });
  }
  html += '<div class="s-search-drop-adv" onclick="_closeSearchDrop();navigate(\'search\')">Расширенный поиск</div>';
  drop.innerHTML = html;
  drop.classList.add('show');
}

async function _doInstantSearch(q) {
  var data = await api('/api/search/releases/0/0', { method: 'POST', body: { query: q, searchBy: 0 } });
  var results = data?.content || [];
  _searchDropItems = results.slice(0, 6);
  _searchDropIdx = -1;

  var drop = document.getElementById('searchDrop');
  if (!drop) return;

  var html = '';
  if (_searchDropItems.length) {
    html += '<div class="s-search-drop-label">Результаты</div>';
    _searchDropItems.forEach(function(r, i) {
      var img = posterUrl(r);
      var title = escHtml(r.title_ru || r.title || '');
      var score = r.grade ? r.grade.toFixed(1) : '';
      var sub = escHtml(r.category?.name || r.type?.name || '');
      if (r.episodes_total) sub += (sub ? ' • ' : '') + r.episodes_total + ' эп.';
      var id = r.id || r.releaseId || 0;
      html += '<div class="s-search-drop-item" onclick="_closeSearchDrop();navigate(\'release\',{id:' + id + '})">';
      html += '<img src="' + img + '" onerror="this.style.display=\'none\'">';
      html += '<div class="s-search-drop-info"><div class="s-search-drop-title">' + title + '</div>';
      html += '<div class="s-search-drop-sub">' + sub + '</div></div>';
      if (score) html += '<div class="s-search-drop-score">' + score + '</div>';
      html += '</div>';
    });
  } else {
    html += '<div style="padding:16px;text-align:center;color:rgba(255,255,255,.4)">Ничего не найдено</div>';
  }
  html += '<div class="s-search-drop-adv" onclick="_closeSearchDrop();navigate(\'search\',{q:\'' + esc(q) + '\'})">Расширенный поиск</div>';

  drop.innerHTML = html;
  drop.classList.add('show');
}

function _closeSearchDrop() {
  var drop = document.getElementById('searchDrop');
  if (drop) { drop.classList.remove('show'); }
  _searchDropIdx = -1;
}

// Close dropdown on click outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('#searchWrap')) _closeSearchDrop();
});

// --- Sub-navigation context ---
function updateSubNav(p) {
  const linksEl = document.getElementById('subNavLinks');
  if (!linksEl) return;
  const mangaPages = ['manga','manga-detail','manga-player'];
  const communityPages = ['creators','creator-profile','creator-dashboard','creator-request','admin-creators'];
  const profilePages = ['profile','achievements','leaderboard','stats','settings','friends'];

  if (mangaPages.includes(p)) {
    linksEl.innerHTML = `
      <a onclick="navigate('manga')">Каталог манги</a>
      <a onclick="navigate('creators')">Озвучкеры</a>
    `;
  } else if (communityPages.includes(p)) {
    linksEl.innerHTML = `
      <a onclick="navigate('creators')">Озвучкеры</a>
      ${user && (user.role === 'creator' || (user.role === 'admin' || user.role === 'owner' || (user.roles && (user.roles.includes('admin') || user.roles.includes('owner'))))) ?
        '<a onclick="navigate(\'creator-dashboard\')">Дашборд</a>' :
        '<a onclick="navigate(\'creator-request\')">Стать озвучкером</a>'}
      ${user && (user.role === 'admin' || user.role === 'owner' || (user.roles && (user.roles.includes('admin') || user.roles.includes('owner')))) ? '<a onclick="navigate(\'admin-creators\')">Заявки</a>' : ''}
    `;
  } else if (profilePages.includes(p)) {
    linksEl.innerHTML = `
      <a onclick="navigate('profile')">Профиль</a>
      <a onclick="navigate('achievements')">Достижения</a>
      <a onclick="navigate('leaderboard')">Лидеры</a>
      <a onclick="navigate('stats')">Статистика</a>
      <a onclick="navigate('settings')">Настройки</a>
    `;
  } else {
    // Default: store/catalog
    linksEl.innerHTML = `
      <a onclick="navigate('schedule')">Расписание</a>
      <a onclick="navigate('catalog')">Фильтры</a>
    `;
  }
}

// --- Toast ---
function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// --- Helpers ---
function esc(s) { return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function escHtml(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function posterUrl(r) {
  return r.image || (r.poster ? `https://s.anixmirai.com/posters/${r.poster}.jpg` : '');
}

function releaseCard(r) {
  const img = posterUrl(r);
  const title = r.title_ru || r.title || r.name || '';
  const type = r.category?.name || r.type?.name || r.type || '';
  const eps = r.episodes_total || r.episodes_released || r.episodesCount || '';
  const score = r.grade ? r.grade.toFixed(1) : (r.score || '');
  const id = r.id || r.releaseId || 0;
  const status = r.status?.name || '';

  return `
    <div class="release-card" onclick="navigate('release',{id:${id}})">
      <div class="rc-poster">
        <img class="release-card-img" src="${img}" alt="" loading="lazy"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22140%22 height=%22200%22><rect fill=%22%23333%22 width=%22140%22 height=%22200%22/></svg>'">
        ${score ? `<div class="rc-score">${score}</div>` : ''}
        ${status ? `<div class="rc-status">${status}</div>` : ''}
      </div>
      <div class="release-card-title">${title}</div>
      <div class="release-card-sub">${type}${eps ? ' \u2022 ' + eps + ' \u044d\u043f.' : ''}</div>
    </div>
  `;
}

function hScroll(items) {
  if (!items?.length) return '<div class="empty-sm">Нет данных</div>';
  return `<div class="h-scroll">${items.map(releaseCard).join('')}</div>`;
}

function grid(items) {
  if (!items?.length) return '<div class="empty"><i class="fas fa-box-open"></i><p>Ничего не найдено</p></div>';
  return `<div class="release-grid">${items.map(releaseCard).join('')}</div>`;
}

function section(title, content, more = '') {
  return `<div class="section">
    <div class="section-head">
      <div class="section-title">${title}</div>
      ${more ? `<div class="section-more">${more} <i class="fas fa-chevron-right" style="font-size:10px"></i></div>` : ''}
    </div>
    ${content}
  </div>`;
}

// Infinite scroll helper
function setupInfiniteScroll(loadMore) {
  const app = document.getElementById('app');
  const handler = () => {
    if (app.scrollTop + app.clientHeight >= app.scrollHeight - 200) {
      loadMore();
    }
  };
  app.addEventListener('scroll', handler);
  return () => app.removeEventListener('scroll', handler);
}

// --- Pages ---

// Helper: get Set of anime IDs user has completed/dropped/on-hold
async function getHideIds() {
  if (!user) return new Set();
  const progData = await api('/api/progress');
  return new Set((progData?.data || [])
    .filter(p => ['completed', 'dropped', 'on_hold'].includes(p.status))
    .map(p => String(p.anime_id)));
}
function filterSeen(items, hideIds) {
  return items.filter(r => !hideIds.has(String(r.id || r.releaseId || r.anime_id)));
}

async function renderHome() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const data = await api('/api/home');
  if (!data) { app.innerHTML = '<div class="empty">Ошибка загрузки</div>'; return; }

  const { featured, popular, discussing, recommended, recommendedBasis, friendsPopular, hasFriends, continueWatching, ongoings, userTopGenres } = data;
  window._userTopGenres = userTopGenres || [];

  // Store card data for tooltips
  if (!window._hcData) window._hcData = {};
  [...featured, ...popular, ...discussing, ...recommended, ...(ongoings || [])].forEach(r => {
    const id = r.id || r.releaseId || 0;
    window._hcData[id] = r;
  });
  // Store friends watch data for tooltips
  window._friendsWatched = {};
  (friendsPopular || []).forEach(function(p) {
    window._friendsWatched[p.anime_id] = (p.watchers || []);
  });

  let html = '';

  // === VIDEO BANNER ===
  html += `<div class="home-hero" id="homeHero">
    <video class="home-hero-img" id="heroVideo" autoplay muted loop playsinline>
      <source src="/img/banner.mp4" type="video/mp4">
      <source src="/img/banner.webm" type="video/webm">
    </video>
    <div class="home-hero-fade"></div>
    <div class="hero-btns">
      <button class="hero-sound-btn" id="heroSoundBtn" title="Включить звук"><i class="fas fa-volume-mute"></i></button>
      <button class="hero-sound-btn" id="heroBgBtn" title="Сменить на пидорские обои"><i class="fas fa-palette"></i></button>
    </div>
  </div>`;

  // === FEATURED CAROUSEL (Grid layout) ===
  if (featured.length) {
    const dots = featured.map((_, i) => '<span class="hc-dot' + (i === 0 ? ' active' : '') + '" onclick="heroGoTo(' + i + ')"></span>').join('');
    html += '<div class="hm-featured-wrap">';
    html += '<div class="hm-feat-arrow hm-fa-l" onclick="heroNav(-1)"><i class="fas fa-chevron-left"></i></div>';
    html += '<div class="hm-featured"><div class="hm-featured-track" id="hmHero">';
    featured.forEach(function(r, i) {
      const id = r.id || r.releaseId || 0;
      const poster = posterUrl(r);
      const title = escHtml(r.title_ru || r.title || r.name || '');
      const genres = typeof r.genres === 'string' ? r.genres.split(',').map(function(g){return g.trim()}).filter(Boolean) : (Array.isArray(r.genres) ? r.genres.map(function(g){return g.name||g}) : []);
      const score = r.grade ? r.grade.toFixed(1) : '';
      const desc = escHtml((r.description || '').replace(/<[^>]*>/g, '').substring(0, 150));
      const screens = (r.screenshot_images || []).slice(0, 2);
      const eps = r.episodes_total || r.episodes_released || '';
      const typeName = escHtml(r.category?.name || (typeof r.type === 'string' ? r.type : '') || '');

      html += '<div class="hm-fslide' + (i === 0 ? ' active' : '') + '">';
      html += '<div class="hm-fslide-grid">';
      // Poster (left column)
      html += '<a class="hm-fslide-poster" onclick="navigate(\'release\',{id:' + id + '});return false" href="#">';
      html += '<img src="' + poster + '" alt="' + title + '">';
      html += '</a>';
      // Info block
      html += '<div class="hm-fslide-side" onclick="navigate(\'release\',{id:' + id + '})">';
      html += '<div class="hm-fslide-title">' + title + '</div>';
      var infoLine = [];
      if (typeName) infoLine.push(typeName);
      if (eps) infoLine.push(eps + ' эп.');
      if (infoLine.length) html += '<div class="hm-fslide-info">' + infoLine.join(' · ') + '</div>';
      if (desc) html += '<div class="hm-fslide-desc">' + desc + (r.description?.length > 150 ? '...' : '') + '</div>';
      if (genres.length) html += '<div class="hm-fslide-tags">' + genres.slice(0,4).map(function(g){return '<span>' + escHtml(g) + '</span>'}).join('') + '</div>';
      if (score) html += '<div class="hm-fslide-score">★ ' + score + '</div>';
      html += '</div>';
      // Screenshots (4 cells, 2x2)
      screens.forEach(function(s) {
        html += '<a class="hm-fscreen"><img src="' + s + '"></a>';
      });
      for (var fi = screens.length; fi < 2; fi++) {
        html += '<div class="hm-fscreen" style="background:#222"></div>';
      }
      html += '</div></div>';
    });
    html += '</div></div>';
    html += '<div class="hm-feat-arrow hm-fa-r" onclick="heroNav(1)"><i class="fas fa-chevron-right"></i></div>';
    html += '</div>';
    html += '<div class="hm-feat-dots">' + dots + '</div>';
  }

  // === POPULAR WITH FRIENDS ===
  if (friendsPopular && friendsPopular.length) {
    // Store friends data for tooltips
    friendsPopular.forEach(function(p) {
      var id = p.anime_id || p.id;
      if (!p.id) p.id = p.anime_id;
      if (!window._hcData[id]) window._hcData[id] = p;
      window._friendsWatched[id] = p.watchers || [];
    });
    html += buildCarouselSection('Популярно у друзей', friendsPopular, 'friends1', 4);
  } else {
    html += '<div class="hm-section">';
    html += '<div class="hm-section-title">Популярно у друзей</div>';
    html += '<div class="hm-no-friends">';
    html += '<i class="fas fa-user-slash"></i>';
    html += '<p>У вас нет друзей</p>';
    html += '<span>(ничего страшного, с кем не бывает... вас всего лишь ждёт смерть в одиночестве)</span>';
    html += '</div></div>';
  }


  // === DISCUSSING ROW (6 cards, carousel) ===
  if (discussing.length) {
    html += buildCarouselSection('Сейчас обсуждают', discussing, 'disc1', 6);
  }

  // === CATEGORIES ===
  const categories = [
    { name: 'Экшен', genre: 'экшен', c1: '#e65c00', c2: '#F9D423', img: '/img/cats/action.png' },
    { name: 'Романтика', genre: 'романтика', c1: '#ff4b1f', c2: '#ff9068', img: '/img/cats/romance.png' },
    { name: 'Фэнтези', genre: 'фэнтези', c1: '#f12711', c2: '#f5af19', img: '/img/cats/fantasy.png' },
    { name: 'Триллер', genre: 'триллер', c1: '#cb2d3e', c2: '#ef473a', img: '/img/cats/thriller.png' },
    { name: 'Сёнен', genre: 'сёнен', c1: '#ff7e5f', c2: '#feb47b', img: '/img/cats/shonen.png' },
    { name: 'Комедия', genre: 'комедия', c1: '#f7971e', c2: '#ffd200', img: '/img/cats/comedy.jpg' },
    { name: 'Драма', genre: 'драма', c1: '#e53935', c2: '#e35d5b', img: '/img/cats/drama.jpg' },
    { name: 'Психология', genre: 'психологическое', c1: '#b24592', c2: '#f15f79', img: '/img/cats/psychology.jpg' },
    { name: 'Реал лайф', genre: 'повседневность', c1: '#FF512F', c2: '#F09819', img: '/img/cats/sliceoflife.jpg' },
    { name: 'Спорт', genre: 'спорт', c1: '#ED213A', c2: '#93291E', img: '/img/cats/sport.jpg' },
    { name: 'Фантастика', genre: 'фантастика', c1: '#FDC830', c2: '#F37335', img: '/img/cats/scifi.jpg' },
    { name: 'Ужасы', genre: 'ужасы', c1: '#e52d27', c2: '#b31217', img: '/img/cats/horror.jpg' },
    { name: 'Приключения', genre: 'приключения', c1: '#11998e', c2: '#38ef7d', img: '/img/cats/adventure.jpg' },
    { name: 'Детектив', genre: 'детектив', c1: '#2c3e50', c2: '#4ca1af', img: '/img/cats/detective.jpg' },
    { name: 'Меха', genre: 'меха', c1: '#4b6cb7', c2: '#182848', img: '/img/cats/mecha.jpg' },

    { name: 'Сёдзё', genre: 'сёдзё', c1: '#f953c6', c2: '#b91d73', img: '/img/cats/shoujo.jpg' },
    { name: 'Гарем', genre: 'гарем', c1: '#fc4a1a', c2: '#f7b733', img: '/img/cats/harem.jpg' },
    { name: 'Исекай', genre: 'исекай', c1: '#6441a5', c2: '#2a0845', img: '/img/cats/isekai.jpg' },
    { name: 'Школа', genre: 'школа', c1: '#56ab2f', c2: '#a8e063', img: '/img/cats/school.jpg' },
    { name: 'Магия', genre: 'магия', c1: '#8e2de2', c2: '#4a00e0', img: '/img/cats/magic.jpg' },
    { name: 'Этти', genre: 'этти', c1: '#f7797d', c2: '#FBD786', img: '/img/cats/ecchi.jpg' },
    { name: 'Военное', genre: 'военное', c1: '#414d0b', c2: '#727a17', img: '/img/cats/military.jpg' },
    { name: 'Сверхъестест.', genre: 'сверхъестественное', c1: '#3a1c71', c2: '#d76d77', img: '/img/cats/supernatural.jpg' },
    { name: 'Исторический', genre: 'исторический', c1: '#8B6914', c2: '#DAA520', img: '/img/cats/historical.jpg' },
    { name: 'Дзёсей', genre: 'дзёсей', c1: '#ec6ead', c2: '#3494e6', img: '/img/cats/josei.jpg' },
    { name: 'Сэйнэн', genre: 'сэйнэн', c1: '#373B44', c2: '#4286f4', img: '/img/cats/seinen.jpg' },
    { name: 'Самурайский', genre: 'самурайский', c1: '#c31432', c2: '#240b36', img: '/img/cats/samurai.jpg' }
  ];
  html += '<div class="hm-section" style="margin-top: 20px;">';
  html += '<div class="hm-section-title">Категории</div>';
  html += '<div class="hm-carousel-outer hm-cats-outer">';
  html += '<div class="hm-car-arrow hm-car-l" onclick="carouselNav(\'catsTrack\',-1)"><i class="fas fa-chevron-left"></i></div>';
  var catPerPage = 4;
  var catPages = Math.ceil(categories.length / catPerPage);
  html += '<div class="hm-cats-wrap"><div class="hm-cats-track" id="catsTrack" data-page="0" data-pages="' + catPages + '" data-per="' + catPerPage + '">';
  categories.forEach(function(c) {
    html += '<div class="hm-cat-card" onclick="navigate(\'genre\',{name:\'' + c.genre + '\'})">';
    if (c.img) {
      html += '<div class="hm-cat-img" style="background-image: url(' + c.img + '); background-size: cover; background-position: center"></div>';
    } else {
      html += '<div class="hm-cat-img" style="background: linear-gradient(135deg, ' + c.c1 + ' 0%, ' + c.c2 + ' 100%)"></div>';
    }
    html += '<div class="hm-cat-bg"></div>';
    html += '<div class="hm-cat-name">' + c.name.toUpperCase() + '</div></div>';
  });
  html += '</div></div>';
  html += '<div class="hm-car-arrow hm-car-r" onclick="carouselNav(\'catsTrack\',1)"><i class="fas fa-chevron-right"></i></div>';
  html += '</div>';
  // Dots for categories
  var catDots = '';
  for (var cd = 0; cd < catPages; cd++) {
    catDots += '<span class="hm-car-dot' + (cd === 0 ? ' active' : '') + '" onclick="carouselGoTo(\'catsTrack\',' + cd + ')"></span>';
  }
  html += '<div class="hm-car-dots">' + catDots + '</div>';
  html += '</div>';

  // === ONGOINGS ===
  if (ongoings && ongoings.length) {
    html += buildCarouselSection('Онгоинги', ongoings, 'ongoing1', 4);
  }

  // === RECOMMENDED (based on watch history) ===
  if (recommended.length && recommendedBasis) {
    html += '<div class="hm-section">';
    html += '<div class="hm-section-title">Так как вы смотрели <strong>' + escHtml(recommendedBasis) + '</strong></div>';
    html += buildCarouselSection('', recommended, 'recs1', 4, true);
    html += '</div>';
  }

  // === CONTINUE WATCHING ===
  if (continueWatching.length) {
    // Convert to format homeCard expects
    continueWatching.forEach(function(p) { if (!p.id) p.id = p.anime_id; });
    html += buildCarouselSection('Продолжить просмотр', continueWatching, 'watching1', 4);
  }

  // === Footer (separator between main content and infinite recs) ===
  html += buildSiteFooter();

  // === Infinite recommendations (auto-loads on scroll) ===
  html += '<div id="infRecContainer" style="padding-top:30px"></div>';
  html += '<div id="infRecLoader" style="display:none; text-align:center; padding:30px;"><div class="inf-rec-spinner"></div></div>';

  app.innerHTML = html;

  // Setup infinite recs scroll
  (async () => {
    try {
      const _infProgress = await api('/api/progress');
      const _infWatched = (_infProgress?.data || []).filter(p => p.status === 'watching' || p.status === 'completed' || p.current_episode > 0);
      _initInfiniteRecs(userTopGenres, _infWatched);
    } catch(e) {
      _initInfiniteRecs(userTopGenres, []);
    }
  })();

  // Ensure tooltip div exists
  if (!document.getElementById('hcTip')) {
    const t = document.createElement('div');
    t.id = 'hcTip';
    t.className = 'hc-tip';
    document.body.appendChild(t);
  }

  // Video banner controls
  const vidEl = document.getElementById('heroVideo');
  if (vidEl) {
    window._heroVideo = vidEl;
    vidEl.volume = 1;
    const soundBtn = document.getElementById('heroSoundBtn');
    if (soundBtn) {
      soundBtn.onclick = () => {
        if (vidEl.muted) {
          vidEl.muted = false;
          soundBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        } else {
          vidEl.muted = true;
          soundBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        }
      };
    }
    const bgBtn = document.getElementById('heroBgBtn');
    if (bgBtn) {
      let isPidr = localStorage.getItem('pidrBg') === '1';
      if (isPidr) { vidEl.src = '/img/banner_old.mp4'; bgBtn.title = 'Сменить на нормальные обои'; }
      bgBtn.onclick = () => {
        isPidr = !isPidr;
        localStorage.setItem('pidrBg', isPidr ? '1' : '0');
        vidEl.src = isPidr ? '/img/banner_old.mp4' : '/img/banner.mp4';
        bgBtn.title = isPidr ? 'Сменить на нормальные обои' : 'Сменить на пидорские обои';
        vidEl.play();
      };
    }
    let _heroPaused = false;
    app.addEventListener('scroll', function() {
      const heroH = document.getElementById('homeHero')?.offsetHeight || 320;
      const scrollY = app.scrollTop;
      if (scrollY > heroH + 350) {
        if (!_heroPaused) { vidEl.pause(); _heroPaused = true; }
      } else {
        if (_heroPaused) { vidEl.play(); _heroPaused = false; }
      }
      if (!vidEl.muted) {
        vidEl.volume = Math.max(0, 1 - scrollY / heroH);
      }
    });
  }

  // Set category card widths based on visible container
  _initCatCardWidths();
  // Init carousels with clone-based infinite loop
  _initCarouselClones();

  // Start featured auto-rotation
  initHeroCarousel();
}

// Build a carousel using releaseCard (for release page sections)
function buildReleaseCarousel(title, items, trackId, perPage) {
  if (!items || !items.length) return '';
  var pages = Math.ceil(items.length / perPage);
  var h = '<div class="hm-section" style="margin-top:24px">';
  if (title) h += '<div class="hm-section-title">' + title + '</div>';
  h += '<div class="hm-carousel-outer">';
  if (pages > 1) h += '<div class="hm-car-arrow hm-car-l" onclick="carouselNav(\'' + trackId + '\',-1)"><i class="fas fa-chevron-left"></i></div>';
  h += '<div class="hm-carousel-wrap">';
  h += '<div class="hm-carousel-track" id="' + trackId + '" data-page="0" data-pages="' + pages + '" data-per="' + perPage + '">';
  items.forEach(function(r) { h += homeCard(r); });
  h += '</div>';
  h += '</div>';
  if (pages > 1) h += '<div class="hm-car-arrow hm-car-r" onclick="carouselNav(\'' + trackId + '\',1)"><i class="fas fa-chevron-right"></i></div>';
  h += '</div>';
  if (pages > 1) {
    var dots = '';
    for (var p = 0; p < pages; p++) {
      dots += '<span class="hm-car-dot' + (p === 0 ? ' active' : '') + '" onclick="carouselGoTo(\'' + trackId + '\',' + p + ')"></span>';
    }
    h += '<div class="hm-car-dots">' + dots + '</div>';
  }
  h += '</div>';
  return h;
}

// === Carousel helpers ===
function buildCarouselSection(title, items, trackId, perPage, noTitle) {
  var pages = Math.ceil(items.length / perPage);
  var h = '';
  if (!noTitle && title) h += '<div class="hm-section"><div class="hm-section-title">' + title + '</div>';
  h += '<div class="hm-carousel-outer">';
  if (pages > 1) h += '<div class="hm-car-arrow hm-car-l" onclick="carouselNav(\'' + trackId + '\',-1)"><i class="fas fa-chevron-left"></i></div>';
  h += '<div class="hm-carousel-wrap">';
  h += '<div class="hm-carousel-track" id="' + trackId + '" data-page="0" data-pages="' + pages + '" data-per="' + perPage + '">';
  items.forEach(function(r, i) { h += homeCard(r); });
  h += '</div>';
  h += '</div>';
  if (pages > 1) h += '<div class="hm-car-arrow hm-car-r" onclick="carouselNav(\'' + trackId + '\',1)"><i class="fas fa-chevron-right"></i></div>';
  h += '</div>';
  if (pages > 1) {
    var dots = '';
    for (var p = 0; p < pages; p++) {
      dots += '<span class="hm-car-dot' + (p === 0 ? ' active' : '') + '" onclick="carouselGoTo(\'' + trackId + '\',' + p + ')"></span>';
    }
    h += '<div class="hm-car-dots">' + dots + '</div>';
  }
  if (!noTitle && title) h += '</div>';
  return h;
}

// === Footer social troll ===
let _sfClickedVk = false;
function sfSocial(id) {
  let msg = '';
  if (id === 'yt') {
    msg = _sfClickedVk ? 'Какой нахуй ютуб канал у аниме сайта ты чо еблан?' : 'Ютуб заблокирован на территории РФ, иди в ВК';
  } else if (id === 'vk') {
    _sfClickedVk = true;
    msg = 'Ты чо совсем далбаёб?';
  } else if (id === 'tg') {
    msg = 'Тг заблокали 1 апреля ещё вообще-то';
  }
  if (msg) sfToast(msg);
}
function sfToast(msg) {
  let t = document.getElementById('sfToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'sfToast';
    t.className = 'sf-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 3000);
}

// === Footer troll text ===
const _sfTrollData = [
  ['© 2026 Sperma Anime Zavrika. Все права сохранены.', '© 2026 Sperma Anime Zavrika. Все права <b>не</b> сохранены.'],
  ['Все торговые марки являются собственностью соответствующих владельцев в РФ и других странах.<br>Все цены указаны с учётом НДС (если применимо).', 'Все торговые марки <b>не</b> являются собственностью<br>соответствующих владельцев в РФ и других странах.<br>Все аниме и не только были нагло спижены.']
];
function sfTroll(el, hover) {
  const id = parseInt(el.dataset.id);
  el.innerHTML = _sfTrollData[id][hover ? 1 : 0];
}

// === Site Footer ===
function buildSiteFooter() {
  return `
  <div class="sf-wrap">
    <div class="sf-scroll-msg">
      <div class="sf-scroll-title">Прокрутите страницу вниз, чтобы получить больше рекомендаций</div>
      <div class="sf-scroll-sub">Ниже вы найдёте разнообразные аниме из всех жанров в SAZ, которые могут вас заинтересовать</div>
    </div>
    <footer class="site-footer">
    <div class="sf-inner">
      <div class="sf-top">
        <div class="sf-brand">
          <div class="sf-logo">
            <div class="sf-logo-main">
              <span style="color:var(--accent)">S</span><span style="color:#c6d4df">A</span><span style="color:#76b900">Z</span>
            </div>
            <div class="sf-logo-sep"></div>
            <div class="sf-logo-sub">Sperma<br>Anime<br>Zavrika</div>
          </div>
          <div class="sf-copy" onmouseenter="sfTroll(this,true)" onmouseleave="sfTroll(this,false)" data-id="0">&copy; 2026 Sperma Anime Zavrika. Все права сохранены.</div>
          <div class="sf-copy-small" onmouseenter="sfTroll(this,true)" onmouseleave="sfTroll(this,false)" data-id="1">Все торговые марки являются собственностью соответствующих владельцев в РФ и других странах.<br>Все цены указаны с учётом НДС (если применимо).</div>
          <div class="sf-socials">
            <a onclick="sfSocial('yt');return false" href="#"><i class="fab fa-youtube"></i></a>
            <a onclick="sfSocial('vk');return false" href="#"><i class="fab fa-vk"></i></a>
            <a onclick="sfSocial('tg');return false" href="#"><i class="fab fa-telegram"></i></a>
            <a href="https://discord.gg/KHfcJxJp" target="_blank"><i class="fab fa-discord"></i></a>
          </div>
        </div>
        <div class="sf-cols">
          <div class="sf-col">
            <div class="sf-col-title">SAZ</div>
            <a onclick="navigate('home')">О SAZ</a>
            <a onclick="navigate('discover')">Каталог аниме</a>
            <a onclick="navigate('schedule')">Расписание выхода</a>
            <a onclick="navigate('top')">Топ аниме</a>
            <a onclick="navigate('collections')">Коллекции</a>
            <a onclick="navigate('manga')">Манга</a>
          </div>
          <div class="sf-col">
            <div class="sf-col-title">Сообщество</div>
            <a onclick="navigate('leaderboard')">О сообществе</a>
            <a onclick="navigate('achievements')">Достижения</a>
            <a onclick="navigate('friends')">Друзья</a>
            <a onclick="navigate('history')">История просмотров</a>
            <a onclick="navigate('stats')">Статистика</a>
          </div>
          <div class="sf-col">
            <div class="sf-col-title">Правовая информация</div>
            <a href="#">Конфиденциальность</a>
            <a href="#">Доступность</a>
            <a href="#">Положения и политика</a>
            <a href="#">Файлы cookie</a>
            <a href="#">Возврат средств</a>
          </div>
          <div class="sf-col">
            <div class="sf-col-title">Дополнительно</div>
            <a onclick="navigate('settings')">Настройки</a>
            <a onclick="navigate('profile')">Мой аккаунт</a>
            <a onclick="navigate('favorites')">Избранное</a>
            <a href="#">Поддержка</a>
            <a href="#">Обратная связь</a>
          </div>
        </div>
      </div>
      <div class="sf-bottom-row">
        <span>Сделано с <i class="fas fa-heart" style="color:var(--accent);font-size:9px"></i> для аниме-комьюнити</span>
        <div>
          <a href="#">Условия использования</a>
          <a href="#">Политика конфиденциальности</a>
          <a href="#">Правовая информация</a>
        </div>
      </div>
    </div>
  </footer>
  </div>`;
}

// === Infinite Recommendations ===
function _initInfiniteRecs(genres, watchedItems) {
  if (!genres || !genres.length) genres = ['романтика', 'экшен', 'фэнтези', 'комедия', 'триллер'];
  if (!watchedItems) watchedItems = [];
  const container = document.getElementById('infRecContainer');
  const loader = document.getElementById('infRecLoader');
  if (!container) return;

  let _infQueue = [];
  let _infIdx = 0;
  let _infTrackN = 0;
  let _infLoading = false;
  let _infDone = false;
  let _infLoadedCount = 0;
  let _infPaused = false;

  // Build infinite queue alternating genres and "because you watched"
  function buildQueue() {
    const q = [];
    let gi = 0, wi = 0, page = 0;
    for (let i = 0; i < 100; i++) {
      if (i % 3 === 2 && wi < watchedItems.length) {
        // Every 3rd = "because you watched"
        q.push({ type: 'basis', basisId: watchedItems[wi].anime_id, title: watchedItems[wi].title });
        wi++;
      } else {
        // Genre based
        const g = genres[gi % genres.length];
        q.push({ type: 'genre', genre: g, page: page });
        gi++;
        if (gi % genres.length === 0) page++;
      }
    }
    return q;
  }
  _infQueue = buildQueue();

  async function loadNextBatch() {
    if (_infLoading || _infDone || _infPaused) return;
    if (_infIdx >= _infQueue.length) { _infDone = true; return; }
    _infLoading = true;
    loader.style.display = '';

    // Load 2 rows at a time
    const batch = _infQueue.slice(_infIdx, _infIdx + 2);
    _infIdx += 2;

    for (const req of batch) {
      let url = '/api/infinite-recs?';
      if (req.type === 'basis') {
        url += 'basis=' + encodeURIComponent(req.basisId);
      } else {
        url += 'genre=' + encodeURIComponent(req.genre) + '&page=' + req.page;
      }
      const data = await api(url);
      if (data && data.items && data.items.length >= 4) {
        // Store card data for tooltips
        data.items.forEach(r => {
          const id = r.id || r.releaseId;
          if (id && window._hcData) window._hcData[id] = r;
        });
        const trackId = 'infTrack' + (_infTrackN++);
        const h = buildCarouselSection(data.title, data.items, trackId, 4);
        const div = document.createElement('div');
        div.innerHTML = h;
        container.appendChild(div);
        // Init clones for new carousel
        const track = document.getElementById(trackId);
        if (track) _initSingleCarouselClones(track);
      }
    }

    _infLoadedCount += 2;
    loader.style.display = 'none';
    _infLoading = false;

    // After 6 rows, show "continue?" prompt
    if (_infLoadedCount > 0 && _infLoadedCount % 6 === 0 && !_infDone) {
      _infPaused = true;
      const prompt = document.createElement('div');
      prompt.className = 'inf-rec-continue';
      prompt.innerHTML = '<div class="inf-rec-continue-text">Хотите продолжить?</div>' +
        '<button class="inf-rec-continue-btn" onclick="this.parentElement.remove(); window._infResume && window._infResume();">Показать ещё</button>';
      container.appendChild(prompt);
    }
  }

  window._infResume = function() {
    _infPaused = false;
    loadNextBatch();
  };

  // Scroll detection on #app
  const appEl = document.getElementById('app');
  appEl.addEventListener('scroll', function() {
    if (_infDone || _infLoading || _infPaused) return;
    const scrollBottom = appEl.scrollTop + appEl.clientHeight;
    const totalH = appEl.scrollHeight;
    if (totalH - scrollBottom < 400) {
      loadNextBatch();
    }
  });

  // Scroll listener triggers loading; also load first batch after short delay
  setTimeout(() => loadNextBatch(), 1500);
}

function _initSingleCarouselClones(track) {
  if (!track || track.dataset.cloned) return;
  var per = parseInt(track.dataset.per || 4);
  var cards = Array.from(track.children);
  if (cards.length <= per) return;
  track.dataset.cloned = '1';
  var gap = parseFloat(getComputedStyle(track).gap) || 8;
  var wrap = track.parentElement;
  if (!wrap) return;
  var wrapW = wrap.offsetWidth;
  var cardW = (wrapW - gap * (per - 1)) / per;
  cards.forEach(function(c) { c.style.width = cardW + 'px'; c.style.minWidth = cardW + 'px'; c.style.maxWidth = cardW + 'px'; });
  for (var i = 0; i < per; i++) {
    var cl = cards[i].cloneNode(true);
    track.appendChild(cl);
  }
  var pages = Math.ceil(cards.length / per);
  track.dataset.pages = pages;
}

function _initCatCardWidths() {
  var wrap = document.querySelector('.hm-cats-wrap');
  var track = document.getElementById('catsTrack');
  if (!wrap || !track) return;
  var per = parseInt(track.dataset.per || 4);
  var gap = parseFloat(getComputedStyle(track).gap) || 8;
  var wrapW = wrap.offsetWidth;
  var cardW = (wrapW - gap * (per - 1)) / per;
  track.querySelectorAll('.hm-cat-card').forEach(function(c) {
    c.style.width = cardW + 'px';
    c.style.minWidth = cardW + 'px';
  });
}

function _getTrackGap(track) {
  var g = parseFloat(getComputedStyle(track).gap) || 0;
  return g;
}

function _getCardStep(track) {
  var card = track.children[0];
  if (!card) return 0;
  return card.offsetWidth + _getTrackGap(track);
}

function _initCarouselClones() {
  document.querySelectorAll('[data-pages][data-per]').forEach(function(track) {
    if (track.dataset.cloned) return;
    var per = parseInt(track.dataset.per || 4);
    var origCards = Array.from(track.children);
    var total = origCards.length;
    if (total <= per) return;
    if (track.dataset.nowrap === '1') {
      var wrap0 = track.closest('.hm-cats-wrap') || track.closest('.hm-carousel-wrap');
      if (wrap0) {
        var gap0 = _getTrackGap(track);
        var wrapW0 = wrap0.offsetWidth;
        var cW0 = Math.floor((wrapW0 - gap0 * (per - 1)) / per);
        origCards.forEach(function(c){ c.style.width = cW0+'px'; c.style.minWidth = cW0+'px'; c.style.maxWidth = cW0+'px'; });
      }
      track.dataset.cloned = '1';
      track.dataset.offset = '0';
      return;
    }

    // Fix card widths to pixels before cloning (% breaks with clones)
    var wrap = track.closest('.hm-cats-wrap') || track.closest('.hm-carousel-wrap');
    if (wrap) {
      var gap = _getTrackGap(track);
      var wrapW = wrap.offsetWidth;
      var cW = Math.floor((wrapW - gap * (per - 1)) / per);
      origCards.forEach(function(c) {
        c.style.width = cW + 'px';
        c.style.minWidth = cW + 'px';
        c.style.maxWidth = cW + 'px';
      });
    }

    // Clone first `per` cards → append to end
    for (var i = 0; i < per && i < total; i++) {
      track.appendChild(origCards[i].cloneNode(true));
    }
    // Clone last `per` cards → prepend to start
    for (var i = total - per; i < total; i++) {
      if (i < 0) continue;
      track.insertBefore(origCards[i].cloneNode(true), track.firstChild);
    }

    track.dataset.cloned = '1';
    track.dataset.offset = String(per);

    // Jump to real start (after prepended clones)
    var cardW = _getCardStep(track);
    track.style.transition = 'none';
    track.style.transform = 'translateX(-' + (per * cardW) + 'px)';
    track.offsetHeight;
    track.style.transition = 'transform .4s ease';
  });
}

function carouselNav(trackId, dir) {
  var track = document.getElementById(trackId);
  if (!track || track.dataset.animating === '1') return;
  var pg = parseInt(track.dataset.page || 0);
  var pages = parseInt(track.dataset.pages || 1);
  var per = parseInt(track.dataset.per || 4);
  var offset = parseInt(track.dataset.offset || 0);
  var cardW = _getCardStep(track);
  if (!cardW) return;

  pg += dir;

  if (pg >= pages || pg < 0) {
    // Fade transition for wrap-around
    var targetPg = pg >= pages ? 0 : pages - 1;
    track.dataset.animating = '1';
    var wrap = track.parentElement;
    wrap.style.transition = 'opacity .25s ease';
    wrap.style.opacity = '0';
    _updateDots(track, targetPg);
    setTimeout(function() {
      track.style.transition = 'none';
      var shift = (offset + targetPg * per) * cardW;
      track.style.transform = 'translateX(-' + shift + 'px)';
      track.offsetHeight;
      track.dataset.page = String(targetPg);
      wrap.style.opacity = '1';
      setTimeout(function() {
        track.style.transition = 'transform .4s ease';
        wrap.style.transition = '';
        track.dataset.animating = '0';
        _checkLonelyPage(track, targetPg, 1);
      }, 250);
    }, 260);
    return;
  }

  track.dataset.page = pg;
  var shift = (offset + pg * per) * cardW;
  track.style.transform = 'translateX(-' + shift + 'px)';
  _updateDots(track, pg);
  setTimeout(function(){ _checkLonelyPage(track, pg, dir); }, 420);
}

function _endermanDeath(arrow) {
  arrow.dataset.freak = 'dying';
  try { var a = new Audio('/sounds/enderman-death.ogg'); a.volume = 0.7; a.play().catch(function(){}); } catch (e) {}
  var r = arrow.getBoundingClientRect();
  var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (var i = 0; i < 35; i++) {
    (function(k) {
      var p = document.createElement('div');
      p.className = 'ender-particle';
      var size = 4 + Math.random() * 6;
      p.style.width = size + 'px'; p.style.height = size + 'px';
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      var ang = Math.random() * Math.PI * 2;
      var dist = 50 + Math.random() * 150;
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      p.style.animationDelay = (k * 6) + 'ms';
      document.body.appendChild(p);
      setTimeout(function(){ p.remove(); }, 1300);
    })(i);
  }
  arrow.classList.remove('hm-arrow-teleported');
  arrow.classList.add('hm-arrow-dying');
  setTimeout(function() {
    // Reset to original home position
    arrow.classList.remove('hm-arrow-dying');
    arrow.style.position = '';
    arrow.style.left = '';
    arrow.style.top = '';
    arrow.style.right = '';
    arrow.classList.add('hm-arrow-respawn');
    try { var t = new Audio('/sounds/enderman-teleport.ogg'); t.volume = 0.6; t.play().catch(function(){}); } catch (e) {}
    // respawn particles at home
    var r2 = arrow.getBoundingClientRect();
    var cx2 = r2.left + r2.width / 2, cy2 = r2.top + r2.height / 2;
    for (var j = 0; j < 22; j++) {
      (function(k) {
        var p = document.createElement('div');
        p.className = 'ender-particle ender-particle-in';
        var size = 3 + Math.random() * 5;
        p.style.width = size + 'px'; p.style.height = size + 'px';
        p.style.left = cx2 + 'px'; p.style.top = cy2 + 'px';
        var ang = Math.random() * Math.PI * 2;
        var dist = 40 + Math.random() * 100;
        p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
        p.style.animationDelay = (k * 6) + 'ms';
        document.body.appendChild(p);
        setTimeout(function(){ p.remove(); }, 1100);
      })(j);
    }
    setTimeout(function() {
      arrow.classList.remove('hm-arrow-respawn');
      arrow.dataset.freak = '0';
    }, 350);
  }, 450);
}

function _checkLonelyPage(track, pg, dir) {
  if (dir !== 1) return;
  var per = parseInt(track.dataset.per || 4);
  var pages = parseInt(track.dataset.pages || 1);
  if (pg !== pages - 1) return;
  var total = track.children.length;
  var onLast = total - (pages - 1) * per;
  if (onLast >= per) return; // full last page, no freakout
  var outer = track.closest('.hm-carousel-outer');
  if (!outer) return;
  var arrow = outer.querySelector('.hm-car-r');
  if (!arrow || arrow.dataset.freak === '1') return;
  _endermanFreakout(arrow);
}

function _endermanFreakout(arrow) {
  if (!arrow._deathBound) {
    arrow._deathBound = true;
    arrow.addEventListener('click', function(e) {
      if (arrow.dataset.freak === 'teleported') {
        setTimeout(function() { _endermanDeath(arrow); }, 50);
      }
    });
    var leftArrow = arrow.closest('.hm-carousel-outer')?.querySelector('.hm-car-l');
    if (leftArrow && !leftArrow._deathBound) {
      leftArrow._deathBound = true;
      leftArrow.addEventListener('click', function(e) {
        if (arrow.dataset.freak === 'teleported') {
          setTimeout(function() { _endermanDeath(arrow); }, 50);
        }
      });
    }
  }
  arrow.dataset.freak = '1';
  arrow.classList.add('hm-arrow-freakout');
  var rect = arrow.getBoundingClientRect();
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;
  for (var i = 0; i < 40; i++) {
    (function(k) {
      var p = document.createElement('div');
      p.className = 'ender-particle';
      var size = 4 + Math.random() * 6;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      var ang = Math.random() * Math.PI * 2;
      var dist = 60 + Math.random() * 180;
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      p.style.animationDelay = (k * 8) + 'ms';
      document.body.appendChild(p);
      setTimeout(function(){ p.remove(); }, 1400);
    })(i);
  }
  setTimeout(function() {
    arrow.classList.remove('hm-arrow-freakout');
    arrow.classList.add('hm-arrow-vanished');
    setTimeout(function() {
      // Teleport next to last visible card
      var outerEl = arrow.closest('.hm-carousel-outer');
      var track = outerEl?.querySelector('.hm-carousel-track');
      var wrapEl = track && (track.closest('.hm-cats-wrap') || track.closest('.hm-carousel-wrap'));
      var lastCard = null;
      if (track && wrapEl) {
        var wr = wrapEl.getBoundingClientRect();
        for (var ci = 0; ci < track.children.length; ci++) {
          var ch = track.children[ci];
          var chr = ch.getBoundingClientRect();
          if (chr.left >= wr.left - 1 && chr.right <= wr.right + 1) lastCard = ch;
        }
        if (!lastCard) lastCard = track.children[track.children.length - 1];
      }
      if (lastCard) {
        var cr = lastCard.getBoundingClientRect();
        arrow.classList.remove('hm-arrow-vanished');
        arrow.classList.add('hm-arrow-teleported');
        // Keep arrow in its original parent so it scrolls naturally with the page.
        // Compute position relative to that parent.
        var parent = arrow.parentElement;
        var pr = parent.getBoundingClientRect();
        arrow.style.position = 'absolute';
        arrow.style.left = (cr.right - pr.left + 2) + 'px';
        arrow.style.top = (cr.top - pr.top + cr.height/2) + 'px';
        arrow.style.right = 'auto';
        // teleport-in particles
        var rect2 = { left: cr.right + 2, top: cr.top + cr.height/2 };
        for (var j = 0; j < 25; j++) {
          (function(k) {
            var p = document.createElement('div');
            p.className = 'ender-particle ender-particle-in';
            var size = 3 + Math.random() * 5;
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            p.style.left = rect2.left + 'px';
            p.style.top = rect2.top + 'px';
            var ang = Math.random() * Math.PI * 2;
            var dist = 40 + Math.random() * 100;
            p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
            p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
            p.style.animationDelay = (k * 6) + 'ms';
            document.body.appendChild(p);
            setTimeout(function(){ p.remove(); }, 1100);
          })(j);
        }
        try {
          var t = new Audio('/sounds/enderman-teleport.ogg');
          t.volume = 0.6;
          t.play().catch(function(){});
        } catch (e) {}
      } else {
        arrow.classList.remove('hm-arrow-vanished');
      }
      arrow.dataset.freak = 'teleported';
    }, 100);
  }, 120);
}

function _updateDots(track, pg) {
  var section = track.closest('.hm-section') || track.parentElement?.parentElement;
  if (section) {
    section.querySelectorAll('.hm-car-dot').forEach(function(d, i) {
      d.classList.toggle('active', i === pg);
    });
  }
}

function carouselGoTo(trackId, pg) {
  var track = document.getElementById(trackId);
  if (!track) return;
  track.dataset.page = pg;
  var per = parseInt(track.dataset.per || 4);
  var offset = parseInt(track.dataset.offset || 0);
  var cardW = _getCardStep(track);
  if (!cardW) return;
  var shift = (offset + pg * per) * cardW;
  track.style.transform = 'translateX(-' + shift + 'px)';
  _updateDots(track, pg);
}

// === Hero carousel ===
var _heroIdx = 0;
var _heroTimer = null;

function initHeroCarousel() {
  _heroIdx = 0;
  if (_heroTimer) clearInterval(_heroTimer);
  _heroTimer = setInterval(function() { heroNav(1); }, 30000);
}

function heroNav(dir) {
  var slides = document.querySelectorAll('.hm-fslide');
  if (!slides.length) return;
  slides[_heroIdx].classList.remove('active');
  _heroIdx += dir;
  if (_heroIdx < 0) _heroIdx = slides.length - 1;
  if (_heroIdx >= slides.length) _heroIdx = 0;
  slides[_heroIdx].classList.add('active');
  document.querySelectorAll('.hm-feat-dots .hc-dot').forEach(function(d, i) {
    d.classList.toggle('active', i === _heroIdx);
  });
  if (_heroTimer) clearInterval(_heroTimer);
  _heroTimer = setInterval(function() { heroNav(1); }, 30000);
}

function heroGoTo(idx) {
  var slides = document.querySelectorAll('.hm-fslide');
  if (!slides.length) return;
  slides[_heroIdx].classList.remove('active');
  _heroIdx = idx;
  slides[_heroIdx].classList.add('active');
  document.querySelectorAll('.hm-feat-dots .hc-dot').forEach(function(d, i) {
    d.classList.toggle('active', i === _heroIdx);
  });
  if (_heroTimer) clearInterval(_heroTimer);
  _heroTimer = setInterval(function() { heroNav(1); }, 30000);
}

// Show tooltip next to card
function _showTip(el, id) {
  const r = window._hcData && window._hcData[id];
  if (!r) return;
  const tip = document.getElementById('hcTip');
  if (!tip) return;

  // Lazy-enrich: if schedule item lacks description or vote_count, fetch full release
  const isSparse = !r.description || r.vote_count == null;
  if (isSparse && !r._enriching) {
    r._enriching = true;
    api('/api/release/' + id).then(function(full) {
      const rel = full?.release || full;
      if (rel && typeof rel === 'object') Object.assign(r, rel);
      if (window._tipCard === el) _showTip(el, id);
    }).catch(function(){});
  }
  // Lazy-fetch friends watching this title
  if (!window._friendsWatched) window._friendsWatched = {};
  if (window._friendsWatched[id] === undefined && !r._friendsFetching) {
    r._friendsFetching = true;
    api('/api/release/' + id + '/friends').then(function(fr) {
      const list = [...(fr?.watching||[]), ...(fr?.watched||[]), ...(fr?.planned||[])];
      window._friendsWatched[id] = list;
      if (window._tipCard === el) _showTip(el, id);
    }).catch(function(){ window._friendsWatched[id] = []; });
  }

  const title = escHtml(r.title_ru || r.title || r.name || '');
  const score = r.grade ? r.grade.toFixed(1) : '';
  const type = escHtml(r.category?.name || r.type?.name || (typeof r.type === 'string' ? r.type : '') || '');
  const status = escHtml(r.status?.name || '');
  const eps = r.episodes_total || r.episodes_released || '';
  const genresRaw = r.genres || '';
  const genres = typeof genresRaw === 'string' ? genresRaw.split(',').map(g => g.trim()).filter(Boolean) : (Array.isArray(genresRaw) ? genresRaw.map(g => g.name || g) : []);
  const desc = escHtml((r.description || '').substring(0, 180));
  const voteCount = r.vote_count || 0;
  const watchingCount = r.watching_count || 0;
  const completedCount = r.completed_count || 0;
  let ratingLabel = '', ratingClass = '';
  if (score) {
    const s = parseFloat(score);
    if (s >= 4.5) { ratingLabel = 'Очень положительные'; ratingClass = 'rt-pos'; }
    else if (s >= 4.0) { ratingLabel = 'Положительные'; ratingClass = 'rt-pos'; }
    else if (s >= 3.0) { ratingLabel = 'Смешанные'; ratingClass = 'rt-mix'; }
    else { ratingLabel = 'Отрицательные'; ratingClass = 'rt-neg'; }
  }
  let dateStr = '';
  if (r.creation_date) {
    const d = new Date(r.creation_date * 1000);
    dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  } else if (r.year) { dateStr = String(r.year); }

  tip.innerHTML = `
    <div class="hc-tip-title">${title}</div>
    ${dateStr ? `<div class="hc-tip-date">Дата выпуска: ${dateStr}</div>` : ''}
    ${desc ? `<div class="hc-tip-desc">${desc}${r.description?.length > 180 ? '...' : ''}</div>` : ''}
    ${ratingLabel ? `<div class="hc-tip-row">Обзоры:<br><span class="${ratingClass}">${ratingLabel}</span> <span class="hc-tip-dim">(всего ${voteCount.toLocaleString('ru')})</span></div>` : ''}
    ${genres.length ? `<div class="hc-tip-tags">${genres.slice(0,5).map(g=>`<span class="hc-tip-tag">${escHtml(g)}</span>`).join('')}</div>` : ''}
    <div class="hc-tip-stats">
      ${watchingCount ? `<span><i class="fas fa-eye"></i> ${watchingCount.toLocaleString('ru')} смотрят</span>` : ''}
      ${completedCount ? `<span><i class="fas fa-check"></i> ${completedCount.toLocaleString('ru')} просмотрели</span>` : ''}
    </div>
    ${(function() {
      var fw = window._friendsWatched && window._friendsWatched[id];
      if (!fw || !fw.length) return '';
      var avas = fw.slice(0, 5).map(function(w) {
        return '<img class="hc-tip-fava" src="' + (w.avatar || '') + '" title="' + escHtml(w.username) + '" onerror="this.style.display=\'none\'">';
      }).join('');
      return '<div class="hc-tip-friends">Просмотрено у ' + avas + '</div>';
    })()}`;

  // Store reference to card for scroll tracking
  window._tipCard = el;
  tip.style.display = 'block';
  _positionTip(el, tip);
  requestAnimationFrame(() => tip.classList.add('show'));
}

function _positionTip(el, tip) {
  const rect = el.getBoundingClientRect();
  const tipW = 280;
  const gap = 14;
  let left = rect.right + gap;
  let isLeft = false;
  if (left + tipW > window.innerWidth) { left = rect.left - gap - tipW; isLeft = true; }
  if (left < 4) left = 4;
  let top = rect.top;
  if (top < 4) top = 4;

  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
  tip.classList.remove('tip-left');
  if (isLeft) tip.classList.add('tip-left');

  const tipH = tip.offsetHeight;
  if (top + tipH > window.innerHeight - 4) {
    top = window.innerHeight - tipH - 4;
    tip.style.top = top + 'px';
  }
  const arrowY = Math.max(16, Math.min(tipH - 16, rect.top + rect.height / 2 - top));
  tip.style.setProperty('--arrow-y', arrowY + 'px');
}

function _hideTip() {
  const tip = document.getElementById('hcTip');
  if (tip) { tip.classList.remove('show'); tip.style.display = 'none'; }
  window._tipCard = null;
}

// Reposition tooltip on scroll so it sticks to the card
(function() {
  const app = document.getElementById('app');
  if (app) app.addEventListener('scroll', function() {
    const tip = document.getElementById('hcTip');
    if (tip && window._tipCard && tip.classList.contains('show')) {
      _positionTip(window._tipCard, tip);
    }
  });
})();

// Card HTML with inline mouse handlers
function homeCard(r) {
  const img = posterUrl(r);
  const title = escHtml(r.title_ru || r.title || r.name || '');
  const id = r.id || r.releaseId || 0;
  const score = r.grade ? r.grade.toFixed(1) : (r.score || '');
  const type = escHtml(r.category?.name || r.type?.name || (typeof r.type === 'string' ? r.type : '') || '');
  const status = escHtml(r.status?.name || '');
  const eps = r.episodes_total || r.episodes_released || '';

  if (!window._hcData) window._hcData = {};
  window._hcData[id] = r;

  return `
    <div class="release-card" onclick="navigate('release',{id:${id}})"
         onmouseenter="_showTip(this,${id})" onmouseleave="_hideTip()">
      <div class="rc-poster">
        <img class="release-card-img" src="${img}" alt="" loading="lazy"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22140%22 height=%22200%22><rect fill=%22%23333%22 width=%22140%22 height=%22200%22/></svg>'">
        ${score ? `<div class="rc-score">${score}</div>` : ''}
        ${status ? `<div class="rc-status">${status}</div>` : ''}
      </div>
      <div class="release-card-title">${title}</div>
      <div class="release-card-sub">${type}${eps ? ' \u2022 ' + eps + ' \u044d\u043f.' : ''}</div>
    </div>`;
}

async function renderDiscover() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const [interesting, discussing, watching, recs] = await Promise.all([
    api('/api/anixart/discover/interesting'),
    api('/api/anixart/discover/discussing'),
    api('/api/anixart/discover/watching'),
    user ? api('/api/anixart/discover/recommendations') : Promise.resolve(null)
  ]);

  let html = '<div class="page-title">Обзор</div>';

  // Quick nav
  html += `<div class="discover-nav">
    <div class="disc-card" onclick="navigate('catalog')"><i class="fas fa-filter"></i><span>Каталог</span></div>
    <div class="disc-card" onclick="navigate('schedule')"><i class="fas fa-calendar-alt"></i><span>Расписание</span></div>
  </div>`;

  const hideIds = await getHideIds();
  const fi = arr => filterSeen(arr, hideIds);
  if (interesting?.content?.length) html += section('Интересное', hScroll(fi(interesting.content)));
  if (discussing?.content?.length) html += section('Обсуждают сегодня', hScroll(fi(discussing.content)));
  if (watching?.content?.length) html += section('Сейчас смотрят', hScroll(fi(watching.content)));
  if (recs?.content?.length) html += section('Рекомендации', hScroll(fi(recs.content)));

  if (html.indexOf('h-scroll') === -1) {
    const top = await api('/api/top/releases/0');
    if (top?.content?.length) html += section('Популярное', grid(top.content));
    else html += '<div class="empty"><i class="fas fa-compass"></i><p>Не удалось загрузить обзор</p></div>';
  }

  app.innerHTML = html;
}

async function renderSearch(query) {
  const app = document.getElementById('app');

  // Filter state
  if (!window._sf) window._sf = { sort: 3, status_id: 0, genres: [], year_from: '', year_to: '',
    category_id: '', rating_from: '', rating_to: '', eps_from: '', eps_to: '', season: 0, country: '' };
  var sf = window._sf;

  const genres = ['экшен','романтика','фэнтези','триллер','сёнен','комедия','драма',
    'психологическое','повседневность','спорт','фантастика','ужасы','приключения',
    'детектив','меха','сёдзё','гарем','исекай','школа','магия','этти','военное',
    'сверхъестественное','исторический','дзёсей','сэйнэн','самурайский'];
  const sorts = [{v:3,l:'Популярности'},{v:1,l:'Рейтингу'},{v:2,l:'Дате выхода'},{v:0,l:'Названию'}];
  const statuses = [{v:0,l:'Любой'},{v:1,l:'Вышел'},{v:2,l:'Выходит'},{v:3,l:'Анонс'}];
  const categories = [{v:0,l:'Все'},{v:1,l:'TV Сериал'},{v:'ona',l:'ONA'},{v:2,l:'Фильм'},{v:3,l:'OVA'},{v:6,l:'Спешл'},{v:'dorama',l:'Дорама'}];
  const seasons = [{v:0,l:'Любой'},{v:1,l:'Зима'},{v:2,l:'Весна'},{v:3,l:'Лето'},{v:4,l:'Осень'}];
  const countries = ['','Япония','Китай','Корея'];

  // Search input at top
  var html = `<div class="adv-search-bar">
    <input type="text" id="advSearchInput" placeholder="Слово или метку" value="${escHtml(query || '')}"
           oninput="clearTimeout(window._advTyping);window._advTyping=setTimeout(function(){_advSearch()},400)">
    <div class="adv-sort">Сортировать по <select onchange="window._sf.sort=+this.value;_advSearch()">
      ${sorts.map(s => `<option value="${s.v}"${sf.sort===s.v?' selected':''}>${s.l}</option>`).join('')}
    </select></div>
  </div>`;

  html += '<div class="adv-search-layout">';

  // Results column
  html += '<div class="adv-results" id="advResults">';
  if (query) {
    html += '<div class="adv-loading"><div class="spinner"></div></div>';
  } else {
    html += '<div style="padding:40px;text-align:center;color:rgba(255,255,255,.4)">Введите запрос или используйте фильтры</div>';
  }
  html += '</div>';

  // Filters sidebar
  html += '<div class="adv-filters">';

  function _fsel(prop, isNum) {
    return ' onchange="window._sf.' + prop + '=' + (isNum ? '+this.value' : 'this.value') + ';_advSearch()"';
  }

  // Category filter
  html += '<div class="adv-filter-group"><div class="adv-filter-title">Тип</div>';
  categories.forEach(function(c) {
    var checked = String(sf.category_id) === String(c.v) ? ' checked' : '';
    html += '<label class="adv-check"><input type="radio" name="advCat" value="' + c.v + '"' + checked + ' onchange="window._sf.category_id=this.value;_advSearch()"> ' + c.l + '</label>';
  });
  html += '<label class="adv-check" style="margin-top:6px;border-top:1px solid rgba(255,255,255,.06);padding-top:6px"><input type="radio" name="advCat" value="manga" onchange="navigate(\'manga\')"> Манга</label>';
  html += '</div>';

  // Status filter
  html += '<div class="adv-filter-group"><div class="adv-filter-title">Статус</div>';
  statuses.forEach(function(s) {
    html += '<label class="adv-check"><input type="radio" name="advStatus" value="' + s.v + '"' + (sf.status_id===s.v?' checked':'') + _fsel('status_id',true) + '> ' + s.l + '</label>';
  });
  html += '</div>';

  // Genre filter (multi-select)
  html += '<div class="adv-filter-group"><div class="adv-filter-title">Жанр</div>';
  html += '<div class="adv-genres">';
  genres.forEach(function(g) {
    var cls = '';
    if (sf.genres && sf.genres.indexOf(g) !== -1) cls = ' active';
    else if (sf.excludeGenres && sf.excludeGenres.indexOf(g) !== -1) cls = ' excluded';
    html += '<span class="adv-genre-tag' + cls + '" onclick="_toggleGenre(\'' + g + '\')">' + g + '</span>';
  });
  html += '</div></div>';

  // Rating filter
  html += '<div class="adv-filter-group"><div class="adv-filter-title">Оценка</div>';
  html += '<div style="display:flex;gap:6px">';
  html += '<input type="number" class="adv-year" placeholder="От" value="' + (sf.rating_from||'') + '" min="0" max="5" step="0.1"' + _fsel('rating_from',false) + '>';
  html += '<input type="number" class="adv-year" placeholder="До" value="' + (sf.rating_to||'') + '" min="0" max="5" step="0.1"' + _fsel('rating_to',false) + '>';
  html += '</div></div>';

  // Episodes filter
  html += '<div class="adv-filter-group"><div class="adv-filter-title">Кол-во серий</div>';
  html += '<div style="display:flex;gap:6px">';
  html += '<input type="number" class="adv-year" placeholder="От" value="' + (sf.eps_from||'') + '" min="1"' + _fsel('eps_from',false) + '>';
  html += '<input type="number" class="adv-year" placeholder="До" value="' + (sf.eps_to||'') + '" min="1"' + _fsel('eps_to',false) + '>';
  html += '</div></div>';

  // Year filter
  html += '<div class="adv-filter-group"><div class="adv-filter-title">Год выхода</div>';
  html += '<div style="display:flex;gap:6px">';
  html += '<input type="number" class="adv-year" placeholder="От" value="' + (sf.year_from||'') + '" min="1960" max="2026"' + _fsel('year_from',false) + '>';
  html += '<input type="number" class="adv-year" placeholder="До" value="' + (sf.year_to||'') + '" min="1960" max="2026"' + _fsel('year_to',false) + '>';
  html += '</div></div>';

  // Season filter
  html += '<div class="adv-filter-group"><div class="adv-filter-title">Сезон</div>';
  seasons.forEach(function(s) {
    html += '<label class="adv-check"><input type="radio" name="advSeason" value="' + s.v + '"' + (sf.season===s.v?' checked':'') + _fsel('season',true) + '> ' + s.l + '</label>';
  });
  html += '</div>';

  // Country filter
  html += '<div class="adv-filter-group"><div class="adv-filter-title">Страна</div>';
  html += '<select class="adv-select"' + _fsel('country',false) + '>';
  countries.forEach(function(c) {
    html += '<option value="' + c + '"' + (sf.country===c?' selected':'') + '>' + (c || 'Любая') + '</option>';
  });
  html += '</select></div>';

  // Studio search
  html += '<div class="adv-filter-group"><div class="adv-filter-title">Студия</div>';
  html += '<input type="text" class="adv-text-input" placeholder="Например: MAPPA" value="' + escHtml(sf.studio||'') + '"' + _fsel('studio',false) + '>';
  html += '</div>';

  // Reset button
  html += '<div class="adv-reset" onclick="_resetFilters()">Сбросить фильтры</div>';

  html += '</div>'; // .adv-filters
  html += '</div>'; // .adv-search-layout

  app.innerHTML = html;
  if (query) { var si = document.getElementById('searchInput'); if (si) si.value = query; }
  _advSearch();
}

function _toggleGenre(g) {
  if (!window._sf.genres) window._sf.genres = [];
  if (!window._sf.excludeGenres) window._sf.excludeGenres = [];
  var inInclude = window._sf.genres.indexOf(g);
  var inExclude = window._sf.excludeGenres.indexOf(g);
  if (inInclude === -1 && inExclude === -1) {
    // off → include
    window._sf.genres.push(g);
  } else if (inInclude !== -1) {
    // include → exclude
    window._sf.genres.splice(inInclude, 1);
    window._sf.excludeGenres.push(g);
  } else {
    // exclude → off
    window._sf.excludeGenres.splice(inExclude, 1);
  }
  document.querySelectorAll('.adv-genre-tag').forEach(function(el) {
    var t = el.textContent;
    el.classList.toggle('active', window._sf.genres.indexOf(t) !== -1);
    el.classList.toggle('excluded', window._sf.excludeGenres.indexOf(t) !== -1);
  });
  _advSearch();
}

function _resetFilters() {
  window._sf = { sort: 3, status_id: 0, genres: [], excludeGenres: [], year_from: '', year_to: '',
    category_id: '', rating_from: '', rating_to: '', eps_from: '', eps_to: '', season: 0, country: '', studio: '' };
  var inp = document.getElementById('advSearchInput');
  var q = inp ? inp.value : '';
  renderSearch(q);
}

async function _advSearch() {
  var sf = window._sf || {};
  var inputEl = document.getElementById('advSearchInput');
  var query = inputEl ? inputEl.value : '';
  var results = document.getElementById('advResults');
  if (!results) return;

  results.innerHTML = '<div class="adv-loading"><div class="spinner"></div></div>';

  try {
  // If nothing selected and no text, auto-select user's top genres
  var noFilters = (!sf.genres || !sf.genres.length) && !sf.status_id && !sf.year_from && !sf.year_to && !sf.category_id && !sf.rating_from && !sf.rating_to && !sf.eps_from && !sf.eps_to && !sf.season && !sf.country && !(sf.studio && sf.studio.trim());
  if (!query.trim() && noFilters && window._userTopGenres && window._userTopGenres.length) {
    sf.genres = window._userTopGenres.slice(0, 2);
    // Update genre tag visuals
    document.querySelectorAll('.adv-genre-tag').forEach(function(el) {
      el.classList.toggle('active', sf.genres.indexOf(el.textContent) !== -1);
    });
  }

  // Reset pagination state
  window._advPage = 0;
  window._advItems = [];
  window._advQuery = query;
  window._advDone = false;

  // Load first batch
  await _advLoadMore(results);

  } catch(err) {
    console.error('advSearch error:', err);
    results.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,.4)">Ошибка поиска</div>';
  }
}

function _advFilterItem(r) {
  var sf = window._sf || {};
  // Genre filter
  if (sf.genres && sf.genres.length) {
    var g = r.genres;
    if (!g) return false;
    if (!Array.isArray(g)) {
      if (typeof g === 'string') g = g.split(',').map(function(s){return s.trim().toLowerCase();});
      else return false;
    }
    var rGenres = g.map(function(x) { return (typeof x === 'string' ? x : (x.name || '')).toLowerCase(); });
    var match = sf.genres.every(function(sg) { return rGenres.indexOf(sg) !== -1; });
    if (!match) return false;
  }
  // Excluded genres filter
  if (sf.excludeGenres && sf.excludeGenres.length) {
    var ge = r.genres;
    if (ge) {
      if (!Array.isArray(ge)) {
        if (typeof ge === 'string') ge = ge.split(',').map(function(s){return s.trim().toLowerCase();});
        else ge = [];
      }
      var rg = ge.map(function(x) { return (typeof x === 'string' ? x : (x.name || '')).toLowerCase(); });
      var hasExcluded = sf.excludeGenres.some(function(eg) { return rg.indexOf(eg) !== -1; });
      if (hasExcluded) return false;
    }
  }
  // Status filter (client-side for text search mode)
  if (sf.status_id && r.status_id && r.status_id !== sf.status_id) return false;
  // Year filter
  if (sf.year_from && (r.year || 0) < parseInt(sf.year_from)) return false;
  if (sf.year_to && (r.year || 9999) > parseInt(sf.year_to)) return false;
  // Rating filter (client-side for text search mode)
  if (sf.rating_from && (r.grade || 0) < parseFloat(sf.rating_from)) return false;
  if (sf.rating_to && (r.grade || 0) > parseFloat(sf.rating_to)) return false;
  // Episodes filter (client-side for text search mode)
  var totalEps = r.episodes_total || r.episodes_released || 0;
  if (sf.eps_from && totalEps < parseInt(sf.eps_from)) return false;
  if (sf.eps_to && totalEps > parseInt(sf.eps_to)) return false;
  // Category filter (client-side for text search mode)
  if (sf.category_id) {
    var catId = (r.category && r.category.id) || (r.type && r.type.id) || r.category_id || r.type_id || 0;
    var catName = ((r.category && r.category.name) || '').toLowerCase();
    var titleFull = ((r.title_ru || '') + ' ' + (r.title_original || '') + ' ' + (r.title || '')).toLowerCase();
    if (sf.category_id === 'ona') {
      if (titleFull.indexOf('ona') === -1 && catName.indexOf('ona') === -1) return false;
    } else if (sf.category_id === 'dorama') {
      var isDor = titleFull.indexOf('дорам') !== -1 || (r.country && r.country.match && r.country.match(/корея|china|япония/i) && catId === 1 && titleFull.indexOf('дорам') !== -1);
      var srcStr = ((r.source || '') + ' ' + (r.description || '')).toLowerCase();
      if (titleFull.indexOf('дорам') === -1 && srcStr.indexOf('дорам') === -1 && srcStr.indexOf('dorama') === -1) return false;
    } else {
      var numCat = parseInt(sf.category_id);
      if (numCat && catId !== numCat) return false;
    }
  }
  // Studio filter (text match)
  if (sf.studio && sf.studio.trim()) {
    var studioName = (r.studio || r.studios || '').toString().toLowerCase();
    if (studioName.indexOf(sf.studio.trim().toLowerCase()) === -1) return false;
  }
  // Country filter (text match)
  if (sf.country) {
    var cname = (r.country || '').toString().toLowerCase();
    if (cname.indexOf(sf.country.toLowerCase()) === -1) return false;
  }
  return true;
}

function _advRenderItem(r) {
  var img = posterUrl(r);
  var title = escHtml(r.title_ru || r.title || '');
  var score = r.grade ? r.grade.toFixed(1) : '';
  var type = escHtml(r.category?.name || r.type?.name || '');
  var _statusMap = {1:'Вышел',2:'Выходит',3:'Анонс'};
  var status = escHtml(r.status?.name || _statusMap[r.status_id] || '');
  var eps = r.episodes_total || r.episodes_released || '';
  var year = r.year || '';
  var id = r.id || r.releaseId || 0;
  var gArr = Array.isArray(r.genres) ? r.genres : (typeof r.genres === 'string' ? r.genres.split(',') : []);
  var genresStr = gArr.map(function(g) { return typeof g === 'string' ? g.trim() : (g.name || ''); }).join(', ');

  var h = '<div class="adv-result-item" onclick="navigate(\'release\',{id:' + id + '})">';
  h += '<img class="adv-result-img" src="' + img + '">';
  h += '<div class="adv-result-info">';
  h += '<div class="adv-result-title">' + title + '</div>';
  h += '<div class="adv-result-meta">' + [type, status, year ? year + ' г.' : '', eps ? eps + ' эп.' : ''].filter(Boolean).join(' \u2022 ') + '</div>';
  if (genresStr) h += '<div class="adv-result-genres">' + escHtml(genresStr) + '</div>';
  h += '</div>';
  if (score) h += '<div class="adv-result-score">' + score + '</div>';
  h += '</div>';
  return h;
}

async function _advLoadMore(container) {
  if (window._advDone || window._advLoading) return;
  window._advLoading = true;
  var sf = window._sf || {};
  var query = window._advQuery || '';
  var hasGenreFilter = sf.genres && sf.genres.length > 0;
  var hasClientFilter = sf.category_id === 'ona' || sf.category_id === 'dorama';

  // Remove old "load more" button
  var oldBtn = container.querySelector('.adv-load-more');
  if (oldBtn) oldBtn.innerHTML = '<div class="spinner" style="margin:10px auto"></div>';

  // Keep fetching pages until we have 10 filtered items or API exhausted
  var newItems = [];
  var maxFetches = (hasGenreFilter || hasClientFilter) ? 20 : 4;
  var fetched = 0;

  while (newItems.length < 10 && fetched < maxFetches && !window._advDone) {
    var pg = window._advPage;
    window._advPage++;
    fetched++;

    var data;
    if (query.trim()) {
      data = await api('/api/search/releases/0/' + pg, { method: 'POST', body: { query: query.trim(), searchBy: 0 } });
    } else {
      var body = { sort: sf.sort || 3 };
      if (sf.status_id) body.status_id = sf.status_id;
      var numCat = parseInt(sf.category_id);
      if (numCat) body.category_id = numCat;
      if (sf.season) body.season = sf.season;
      if (sf.year_from) body.year_from = parseInt(sf.year_from);
      if (sf.year_to) body.year_to = parseInt(sf.year_to);
      if (sf.eps_from) body.episodes_from = parseInt(sf.eps_from);
      if (sf.eps_to) body.episodes_to = parseInt(sf.eps_to);
      if (sf.rating_from) body.rating_from = parseFloat(sf.rating_from);
      data = await api('/api/filter/releases/' + pg, { method: 'POST', body: body });
    }

    var raw = data?.content || data?.releases || [];
    if (raw.length === 0) { window._advDone = true; break; }

    // Deduplicate
    var seenIds = {};
    window._advItems.forEach(function(r) { seenIds[r.id || r.releaseId] = true; });
    newItems.forEach(function(r) { seenIds[r.id || r.releaseId] = true; });

    raw.forEach(function(r) {
      var rid = r.id || r.releaseId;
      if (seenIds[rid]) return;
      seenIds[rid] = true;
      if (_advFilterItem(r)) newItems.push(r);
    });
  }

  // Sort new items
  if (sf.sort === 1) newItems.sort(function(a,b) { return (b.grade||0) - (a.grade||0); });

  window._advItems = window._advItems.concat(newItems);

  // Render
  if (window._advItems.length === 0 && window._advDone) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:rgba(255,255,255,.4)">Ничего не найдено</div>';
    window._advLoading = false;
    return;
  }

  // Build HTML if first batch, or append
  if (oldBtn) oldBtn.remove();
  var listEl = container.querySelector('.adv-result-list');
  if (!listEl) {
    container.innerHTML = '<div class="adv-count">Результатов: ' + window._advItems.length + '</div><div class="adv-result-list"></div>';
    listEl = container.querySelector('.adv-result-list');
    window._advItems.forEach(function(r) { listEl.insertAdjacentHTML('beforeend', _advRenderItem(r)); });
  } else {
    container.querySelector('.adv-count').textContent = 'Результатов: ' + window._advItems.length;
    newItems.forEach(function(r) { listEl.insertAdjacentHTML('beforeend', _advRenderItem(r)); });
  }

  // Add "load more" button
  if (!window._advDone) {
    listEl.insertAdjacentHTML('afterend', '');
    var btn = document.createElement('div');
    btn.className = 'adv-load-more';
    btn.textContent = 'Найти ещё аниме?';
    btn.onclick = function() { _advLoadMore(container); };
    container.appendChild(btn);
  }

  window._advLoading = false;
}

async function renderSchedule() {
  const app = document.getElementById('app');
  const data = await api('/api/schedule');
  const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const today = new Date().getDay();
  const todayIdx = today === 0 ? 6 : today - 1;

  let html = '<div class="page-title">Расписание</div>';

  if (data?.content && Array.isArray(data.content)) {
    // Order: today first, then next days, then past
    const order = [];
    for (let k = 0; k < 7; k++) order.push((todayIdx + k) % 7);

    const seen = new Set();
    order.forEach(i => {
      const dayData = data.content[i];
      let releases = (dayData?.releases || dayData || []).filter(Boolean);
      releases = releases.filter(r => {
        const rid = r.id || r.releaseId;
        const nameKey = ((r.title_ru || r.title_original || r.title || '') + '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'').trim();
        const key = rid ? 'id:' + rid : (nameKey ? 'n:' + nameKey : null);
        if (!key || seen.has(key)) return false;
        if (nameKey) seen.add('n:' + nameKey);
        if (rid) seen.add('id:' + rid);
        return true;
      });
      if (!releases.length) return;
      releases.forEach(r => { if (!window._hcData) window._hcData = {}; const id = r.id || r.releaseId || 0; window._hcData[id] = r; });
      const label = days[i] + (i === todayIdx ? ' — сегодня' : '');
      html += buildCarouselSection(label, releases, 'sched_' + i, 4);
    });
    if (!html.includes('hm-carousel-outer')) {
      html += '<div class="empty"><i class="fas fa-calendar-alt"></i><p>Расписание пустое</p></div>';
    }
  } else {
    html += '<div class="empty"><i class="fas fa-calendar-alt"></i><p>Расписание недоступно</p></div>';
  }

  app.innerHTML = html;
  if (!document.getElementById('hcTip')) {
    const t = document.createElement('div');
    t.id = 'hcTip';
    t.className = 'hc-tip';
    document.body.appendChild(t);
  }
  document.querySelectorAll('[id^="sched_"]').forEach(function(t){ t.dataset.nowrap = '1'; });
  _initCarouselClones();
}

// === Advanced Filter / Catalog ===
const GENRES = [
  'Безумие','Боевые искусства','Вампиры','Военное','Гарем','Демоны','Детектив','Детское',
  'Дзёсей','Драма','Игры','Исекай','Историческое','Комедия','Космос','Магия','Махо-сёдзё',
  'Меха','Музыка','Пародия','Повседневность','Полиция','Приключения','Психологическое',
  'Романтика','Самурайское','Сверхъестественное','Спорт','Супер сила','Сэйнен','Сёдзё',
  'Сёдзё-ай','Сёнен','Сёнен-ай','Триллер','Ужасы','Фантастика','Фэнтези','Хентай',
  'Школа','Экшен','Этти','Яой','Юри'
];
const CATEGORIES = [
  { id: 1, name: 'TV Сериал' }, { id: 2, name: 'Фильм' }, { id: 3, name: 'OVA' },
  { id: 4, name: 'ONA' }, { id: 5, name: 'Спешл' }, { id: 6, name: 'Дорама' }
];
const STATUSES = [
  { id: 1, name: 'Онгоинг' }, { id: 2, name: 'Вышел' }, { id: 3, name: 'Анонс' }
];
const SORT_OPTIONS = [
  { id: 0, name: 'По дате добавления' }, { id: 1, name: 'По рейтингу' },
  { id: 2, name: 'По году' }, { id: 3, name: 'По популярности' }
];

async function renderGenrePage(genreName) {
  const app = document.getElementById('app');
  if (!genreName) { renderHome(); return; }

  const displayName = genreName.charAt(0).toUpperCase() + genreName.slice(1);

  // Load multiple pages — different sorts for variety
  const [byPop, byNew, byRate, byPop2, byNew2, byRate2] = await Promise.all([
    api('/api/filter/releases/0', { method: 'POST', body: { genres: [genreName], sort: 0 } }),
    api('/api/filter/releases/0', { method: 'POST', body: { genres: [genreName], sort: 1 } }),
    api('/api/filter/releases/0', { method: 'POST', body: { genres: [genreName], sort: 3 } }),
    api('/api/filter/releases/1', { method: 'POST', body: { genres: [genreName], sort: 0 } }),
    api('/api/filter/releases/1', { method: 'POST', body: { genres: [genreName], sort: 1 } }),
    api('/api/filter/releases/1', { method: 'POST', body: { genres: [genreName], sort: 3 } }),
  ]);

  let popItems = [...(byPop?.content || []), ...(byPop2?.content || [])];
  let newItems = [...(byNew?.content || []), ...(byNew2?.content || [])];
  let rateItems = [...(byRate?.content || []), ...(byRate2?.content || [])];

  // Filter out user's watched/dropped/on-hold anime
  const hideIds = await getHideIds();
  popItems = filterSeen(popItems, hideIds);
  newItems = filterSeen(newItems, hideIds);
  rateItems = filterSeen(rateItems, hideIds);

  // Collect all unique for hero
  const allMap = new Map();
  [...popItems, ...newItems, ...rateItems].forEach(r => {
    const id = r.id || r.releaseId;
    if (!allMap.has(id)) allMap.set(id, r);
  });

  if (!allMap.size) {
    app.innerHTML = '<div class="empty"><i class="fas fa-search"></i><p>Ничего не найдено по жанру "' + displayName + '"</p></div>';
    return;
  }

  // Store for card clicks
  if (!window._hcData) window._hcData = {};
  allMap.forEach((r, id) => { window._hcData[id] = r; });

  let html = '';

  // Deduplicate helper
  function dedup(arr) {
    const s = new Set();
    return arr.filter(r => { const id = r.id || r.releaseId; if (s.has(id)) return false; s.add(id); return true; });
  }

  // Keep loading pages and checking screenshots until we have 6 hero items
  let heroItems = [];
  let allChecked = [];
  let filterPage = 2;

  // Check initial pool first
  let pool = dedup([...popItems, ...rateItems, ...newItems]);

  while (heroItems.length < 6) {
    // Take next unchecked batch
    const unchecked = pool.filter(r => !allChecked.includes(r));
    const batch = unchecked.slice(0, 10);
    if (!batch.length) {
      // Load more from API
      const morePop = await api('/api/filter/releases/' + filterPage, { method: 'POST', body: { genres: [genreName], sort: 0 } });
      const moreRate = await api('/api/filter/releases/' + filterPage, { method: 'POST', body: { genres: [genreName], sort: 3 } });
      filterPage++;
      const newReleases = [...(morePop?.content || []), ...(moreRate?.content || [])];
      if (!newReleases.length) break; // no more results from API
      popItems.push(...(morePop?.content || []));
      rateItems.push(...(moreRate?.content || []));
      pool = dedup([...pool, ...newReleases]);
      continue;
    }

    allChecked.push(...batch);
    const results = await Promise.all(batch.map(async r => {
      const id = r.id || r.releaseId;
      const title = r.title_original || r.title_or || r.title || r.title_ru || r.name || '';
      // Fetch Anixart detail + Shikimori screenshots in parallel
      const [detail, shiki] = await Promise.all([
        id ? api('/api/release/' + id) : Promise.resolve(null),
        title ? api('/api/screenshots?title=' + encodeURIComponent(title)) : Promise.resolve(null)
      ]);
      const anixScreens = detail?.release?.screenshot_images || [];
      const shikiScreens = shiki?.screenshots || [];
      return { anixScreens, shikiScreens, detail };
    }));
    results.forEach((res, i) => {
      const screens = res.anixScreens.length ? res.anixScreens.slice(0, 4) : res.shikiScreens;
      if (screens.length && heroItems.length < 6) {
        batch[i].screenshot_images = screens;
        // Also enrich with detail data
        const rel = res.detail?.release;
        if (rel) {
          if (rel.description) batch[i].description = rel.description;
          if (rel.genres) batch[i].genres = rel.genres;
          if (rel.category) batch[i].category = rel.category;
        }
        heroItems.push(batch[i]);
      }
    });

    // Safety: don't check more than 100 items
    if (allChecked.length >= 100) break;
  }

  const noScreenItems = allChecked.filter(r => !r.screenshot_images?.length);
  if (heroItems.length) {
    const dots = heroItems.map((_, i) => '<span class="hc-dot' + (i === 0 ? ' active' : '') + '" onclick="heroGoTo(' + i + ')"></span>').join('');
    html += '<div class="hm-featured-wrap">';
    html += '<div class="hm-feat-arrow hm-fa-l" onclick="heroNav(-1)"><i class="fas fa-chevron-left"></i></div>';
    html += '<div class="hm-featured"><div class="hm-featured-track" id="hmHero">';
    heroItems.forEach(function(r, i) {
      var id = r.id || r.releaseId || 0;
      var poster = posterUrl(r);
      var title = escHtml(r.title_ru || r.title || r.name || '');
      var genres = typeof r.genres === 'string' ? r.genres.split(',').map(function(g){return g.trim()}).filter(Boolean) : (Array.isArray(r.genres) ? r.genres.map(function(g){return g.name||g}) : []);
      var score = r.grade ? r.grade.toFixed(1) : '';
      var desc = escHtml((r.description || '').replace(/<[^>]*>/g, '').substring(0, 150));
      var screens = (r.screenshot_images || []).slice(0, 2);
      var eps = r.episodes_total || r.episodes_released || '';
      var typeName = escHtml(r.category?.name || (typeof r.type === 'string' ? r.type : '') || '');

      html += '<div class="hm-fslide' + (i === 0 ? ' active' : '') + '">';
      html += '<div class="hm-fslide-grid">';
      html += '<a class="hm-fslide-poster" onclick="navigate(\'release\',{id:' + id + '});return false" href="#">';
      html += '<img src="' + poster + '" alt="' + title + '">';
      html += '</a>';
      html += '<div class="hm-fslide-side" onclick="navigate(\'release\',{id:' + id + '})">';
      html += '<div class="hm-fslide-title">' + title + '</div>';
      var infoLine = [];
      if (typeName) infoLine.push(typeName);
      if (eps) infoLine.push(eps + ' эп.');
      if (infoLine.length) html += '<div class="hm-fslide-info">' + infoLine.join(' · ') + '</div>';
      if (desc) html += '<div class="hm-fslide-desc">' + desc + (r.description?.length > 150 ? '...' : '') + '</div>';
      if (genres.length) html += '<div class="hm-fslide-tags">' + genres.slice(0,4).map(function(g){return '<span>' + escHtml(g) + '</span>'}).join('') + '</div>';
      if (score) html += '<div class="hm-fslide-score">★ ' + score + '</div>';
      html += '</div>';
      screens.forEach(function(s) {
        html += '<a class="hm-fscreen"><img src="' + s + '"></a>';
      });
      for (var fi = screens.length; fi < 2; fi++) {
        html += '<div class="hm-fscreen" style="background:#222"></div>';
      }
      html += '</div></div>';
    });
    html += '</div></div>';
    html += '<div class="hm-feat-arrow hm-fa-r" onclick="heroNav(1)"><i class="fas fa-chevron-right"></i></div>';
    html += '</div>';
    html += '<div class="hm-feat-dots">' + dots + '</div>';
  }

  // Build carousel rows — include items without screenshots too
  const heroIds = new Set(heroItems.map(r => r.id || r.releaseId));
  const addNoScreen = dedup([...noScreenItems, ...popItems.filter(r => !heroIds.has(r.id || r.releaseId))]);
  const rows = [
    { title: 'Популярное — ' + displayName, items: dedup([...addNoScreen, ...popItems]).slice(0, 12) },
    { title: 'Новинки', items: dedup(newItems).slice(0, 12) },
    { title: 'Высокий рейтинг', items: dedup(rateItems).slice(0, 12) },
    { title: 'Популярное #2', items: dedup(popItems).slice(12, 24) },
    { title: 'Свежие #2', items: dedup(newItems).slice(12, 24) },
    { title: 'Топ рейтинга #2', items: dedup(rateItems).slice(12, 24) },
  ];

  rows.forEach((row, i) => {
    if (row.items.length >= 2) {
      html += buildCarouselSection(row.title, row.items, 'genreRow' + i, 4);
    }
  });

  app.innerHTML = html;

  // Init carousels + hero exactly like home page
  _initCarouselClones();
  initHeroCarousel();
}

async function renderCatalog(params = {}) {
  const app = document.getElementById('app');

  // Restore or init filter state
  if (!window._filter) {
    window._filter = {
      genres: [], excludeGenres: [], category: null, status: null,
      yearFrom: '', yearTo: '', sort: 3, country: ''
    };
  }
  const f = window._filter;

  let html = '<div class="page-title">Каталог</div>';

  // Filter panel
  html += `<div class="filter-panel">
    <div class="filter-section">
      <div class="filter-label">Жанры</div>
      <div class="filter-chips">${GENRES.map(g => {
        const isIncl = f.genres.includes(g);
        const isExcl = f.excludeGenres.includes(g);
        const cls = isIncl ? 'chip-active' : (isExcl ? 'chip-exclude' : '');
        return `<span class="filter-chip ${cls}" onclick="toggleGenre('${g}')">${g}</span>`;
      }).join('')}</div>
    </div>
    <div class="filter-row">
      <div class="filter-section">
        <div class="filter-label">Категория</div>
        <div class="filter-chips">${CATEGORIES.map(c =>
          `<span class="filter-chip ${f.category === c.id ? 'chip-active' : ''}" onclick="setFilter('category',${c.id})">${c.name}</span>`
        ).join('')}</div>
      </div>
      <div class="filter-section">
        <div class="filter-label">Статус</div>
        <div class="filter-chips">${STATUSES.map(s =>
          `<span class="filter-chip ${f.status === s.id ? 'chip-active' : ''}" onclick="setFilter('status',${s.id})">${s.name}</span>`
        ).join('')}</div>
      </div>
    </div>
    <div class="filter-row">
      <div class="filter-section">
        <div class="filter-label">Год</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" class="filter-input" placeholder="От" value="${f.yearFrom}" onchange="window._filter.yearFrom=this.value" min="1900" max="2100">
          <span style="color:var(--text-dim)">—</span>
          <input type="number" class="filter-input" placeholder="До" value="${f.yearTo}" onchange="window._filter.yearTo=this.value" min="1900" max="2100">
        </div>
      </div>
      <div class="filter-section">
        <div class="filter-label">Сортировка</div>
        <select class="filter-select" onchange="window._filter.sort=+this.value">
          ${SORT_OPTIONS.map(s => `<option value="${s.id}" ${f.sort === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="filter-actions">
      <button class="btn btn-accent" onclick="applyCatalogFilter()"><i class="fas fa-search"></i> Найти</button>
      <button class="btn btn-outline" onclick="window._filter={genres:[],excludeGenres:[],category:null,status:null,yearFrom:'',yearTo:'',sort:3,country:''};navigate('catalog')"><i class="fas fa-times"></i> Сбросить</button>
    </div>
  </div>`;

  // Results
  html += '<div id="catalogResults"></div>';
  app.innerHTML = html;

  // Auto-apply if we have filters
  if (f.genres.length || f.category || f.status || f.yearFrom || f.yearTo) {
    applyCatalogFilter();
  }
}

window.toggleGenre = function(g) {
  const f = window._filter;
  if (f.genres.includes(g)) {
    f.genres = f.genres.filter(x => x !== g);
    f.excludeGenres.push(g);
  } else if (f.excludeGenres.includes(g)) {
    f.excludeGenres = f.excludeGenres.filter(x => x !== g);
  } else {
    f.genres.push(g);
  }
  navigate('catalog');
};

window.setFilter = function(key, val) {
  window._filter[key] = window._filter[key] === val ? null : val;
  navigate('catalog');
};

window.applyCatalogFilter = async function() {
  const f = window._filter;
  const container = document.getElementById('catalogResults');
  if (!container) return;
  container.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const body = { sort: f.sort };
  if (f.genres.length) body.genres = f.genres;
  if (f.excludeGenres.length) body.excluded_genres = f.excludeGenres;
  if (f.category) body.category = f.category;
  if (f.status) body.status = f.status;
  if (f.yearFrom) body.year_from = parseInt(f.yearFrom);
  if (f.yearTo) body.year_to = parseInt(f.yearTo);

  const data = await api('/api/filter/releases/0', { method: 'POST', body });
  window._catalogPage = 0;
  window._catalogBody = body;
  window._catalogLoading = false;

  if (data?.content?.length) {
    container.innerHTML = grid(data.content);

    setupInfiniteScroll(async () => {
      if (window._catalogLoading) return;
      window._catalogLoading = true;
      window._catalogPage++;
      const more = await api(`/api/filter/releases/${window._catalogPage}`, {
        method: 'POST', body: window._catalogBody
      });
      if (more?.content?.length) {
        const gridEl = container.querySelector('.release-grid');
        if (gridEl) gridEl.insertAdjacentHTML('beforeend', more.content.map(releaseCard).join(''));
      }
      window._catalogLoading = false;
    });
  } else {
    container.innerHTML = '<div class="empty"><i class="fas fa-filter"></i><p>Ничего не найдено с такими фильтрами</p></div>';
  }
};

async function renderTop(params = {}) {
  const app = document.getElementById('app');
  const pg = params.page || 0;

  let html = '<div class="page-title">Топ</div>';

  const data = await api(`/api/top/releases/${pg}`, { method: 'POST', body: {} });

  if (data?.content?.length) {
    html += '<div class="top-list">';
    data.content.forEach((r, i) => {
      const rank = pg * 50 + i + 1;
      const img = posterUrl(r);
      html += `<div class="top-item" onclick="navigate('release',{id:${r.id}})">
        <div class="top-rank ${rank <= 3 ? 'top-rank-gold' : ''}">${rank}</div>
        <img class="top-img" src="${img}" loading="lazy">
        <div class="top-info">
          <div class="top-title">${r.title_ru || r.title || ''}</div>
          <div class="top-sub">${r.category?.name || ''} ${r.year ? '\u2022 ' + r.year : ''} ${r.grade ? '\u2022 \u2605' + r.grade.toFixed(1) : ''}</div>
        </div>
        ${r.grade ? `<div class="top-score">${r.grade.toFixed(1)}</div>` : ''}
      </div>`;
    });
    html += '</div>';

    html += '<div class="paginate">';
    if (pg > 0) html += `<button class="pg-btn" onclick="navigate('top',{page:${pg - 1}})"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = Math.max(0, pg - 2); i <= Math.min(pg + 3, 10); i++) {
      html += `<button class="pg-btn ${i == pg ? 'active' : ''}" onclick="navigate('top',{page:${i}})">${i + 1}</button>`;
    }
    html += `<button class="pg-btn" onclick="navigate('top',{page:${+pg + 1}})"><i class="fas fa-chevron-right"></i></button>`;
    html += '</div>';
  } else {
    html += '<div class="empty"><i class="fas fa-trophy"></i><p>Не удалось загрузить топ</p></div>';
  }

  app.innerHTML = html;
}

async function renderCollections(params = {}) {
  const app = document.getElementById('app');
  const pg = params.page || 0;
  const data = await api(`/api/collection/all/${pg}`);

  let html = '<div class="page-title">Коллекции</div>';

  if (data?.content?.length) {
    html += '<div class="coll-grid">';
    data.content.forEach(c => {
      const releases = c.releases || [];
      html += `<div class="coll-card" onclick="navigate('collection',{id:${c.id}})">
        ${releases.length ? `<div class="coll-imgs">${releases.slice(0, 4).map(r =>
          `<img src="${posterUrl(r)}" alt="" loading="lazy">`
        ).join('')}</div>` : '<div class="coll-imgs-placeholder"><i class="fas fa-layer-group"></i></div>'}
        <div class="coll-body">
          <div class="coll-title">${c.title || 'Без названия'}</div>
          <div class="coll-sub">${c.release_count || c.releaseCount || releases.length || 0} релизов</div>
          ${c.user ? `<div class="coll-author"><img class="coll-author-ava" src="${c.user.avatar || ''}" onerror="this.style.display='none'">${c.user.login || ''}</div>` : ''}
        </div>
      </div>`;
    });
    html += '</div>';
    html += '<div class="paginate">';
    if (pg > 0) html += `<button class="pg-btn" onclick="navigate('collections',{page:${pg - 1}})"><i class="fas fa-chevron-left"></i></button>`;
    html += `<button class="pg-btn active">${+pg + 1}</button>`;
    html += `<button class="pg-btn" onclick="navigate('collections',{page:${+pg + 1}})"><i class="fas fa-chevron-right"></i></button></div>`;
  } else {
    html += '<div class="empty"><i class="fas fa-layer-group"></i><p>Коллекции недоступны</p></div>';
  }

  app.innerHTML = html;
}

async function renderCollection(id) {
  const app = document.getElementById('app');
  const data = await api(`/api/collection/${id}`);

  if (!data?.content) {
    app.innerHTML = '<div class="empty"><p>Коллекция не найдена</p></div>';
    return;
  }

  const c = data.content;
  let html = `
    <div class="coll-header">
      <div class="page-title">${c.title || ''}</div>
      ${c.description ? `<div class="coll-desc">${c.description}</div>` : ''}
      <div class="coll-meta">
        ${c.user ? `<span onclick="navigate('profile',{id:${c.user.id}})" style="cursor:pointer;color:var(--accent)">${c.user.login}</span> \u2022 ` : ''}
        ${c.release_count || c.releaseCount || 0} релизов
      </div>
    </div>
  `;

  if (c.releases?.length) {
    html += grid(c.releases);
  }

  app.innerHTML = html;
}

// --- Release detail ---
async function renderRelease(id) {
  const app = document.getElementById('app');
  const data = await api(`/api/release/${id}`);

  if (!data?.content && !data?.release) {
    app.innerHTML = '<div class="empty"><i class="fas fa-film"></i><p>Релиз не найден</p></div>';
    return;
  }

  const r = data.release || data.content || data;
  const title = r.title_ru || r.title || '';
  const titleOrig = r.title_original || r.title_en || '';
  if (title && user) api('/api/watching', { method: 'POST', body: { title } });
  const img = posterUrl(r);
  const desc = r.description || '';
  const genresStr = r.genres || '';
  const genres = typeof genresStr === 'string' ? genresStr.split(', ').filter(Boolean) : (Array.isArray(genresStr) ? genresStr : []);
  const status = r.status?.name || '';
  const type = r.category?.name || '';
  const year = r.year || '';
  const episodes = r.episodes_total || r.episodes_released || '?';
  const studio = r.studio || '';
  const score = r.grade ? r.grade.toFixed(2) : '';
  const voicers = r.translators ? r.translators.split(', ').filter(Boolean) : [];
  const screenshots = r.screenshot_images || [];
  const relatedReleases = r.related_releases || [];
  const recommendedReleases = r.recommended_releases || [];
  const favCount = r.favorites_count || 0;
  const watchingCount = r.watching_count || 0;
  const completedCount = r.completed_count || 0;
  const planCount = r.plan_count || 0;
  const holdCount = r.hold_on_count || 0;
  const droppedCount = r.dropped_count || 0;
  const voteCount = r.vote_count || 0;
  const v1 = r.vote_1_count || 0, v2 = r.vote_2_count || 0, v3 = r.vote_3_count || 0, v4 = r.vote_4_count || 0, v5 = r.vote_5_count || 0;
  const maxVote = Math.max(v1, v2, v3, v4, v5, 1);
  const country = r.country || '';
  const source = r.source || '';
  const director = r.director || '';
  const author = r.author || '';
  const ageRating = r.age_rating;
  const epsNum = typeof episodes === 'number' ? episodes : parseInt(episodes) || 0;

  // Check favorites, progress, friends
  let isFav = false;
  let progress = null;
  let friendsData = { watching: [], watched: [] };
  if (user) {
    const [favD, progD, frD] = await Promise.all([
      api(`/api/favorites/check/${id}`),
      api(`/api/progress/${id}`),
      api(`/api/release/${id}/friends`)
    ]);
    isFav = favD?.isFavorite;
    progress = progD?.data;
    if (frD) friendsData = frD;
    api('/api/history', { method: 'POST', body: { anime_id: id, title, image: img, episode: progress?.current_episode || 1 } });
  }

  const curEp = progress?.current_episode || 1;
  const curStatus = progress?.status || '';
  const curScore = progress?.score || 0;
  const hasProgress = curStatus === 'watching' && curEp > 0;
  const lastTypeId = progress?.last_type_id;
  const lastSourceId = progress?.last_source_id;

  const ageRatingStr = ageRating ? ['', '0+', '6+', '12+', '16+', '18+'][ageRating] || '' : '';
  const heroBg = screenshots.length ? screenshots[0] : img;

  // === HERO BANNER ===
  let html = `<div class="rel-hero" id="relHero" style="background-image:url('${heroBg}')">
    <div class="rel-hero-fade"></div>
  </div>`;

  // === MAIN CARD (poster + info) ===
  html += `<div class="rel-card">
    <img class="rel-card-poster" src="${img}" alt="">
    <div class="rel-card-info">
      <div class="rel-card-title">${title}</div>
      ${titleOrig ? `<div class="rel-card-orig">${titleOrig}</div>` : ''}
      <div class="rel-card-meta">
        ${type ? `<span class="badge badge-type">${type}</span>` : ''}
        ${status ? `<span class="badge badge-status">${status}</span>` : ''}
        ${year ? `<span class="badge">${year}</span>` : ''}
        ${score ? `<span class="badge badge-score">★ ${score}</span>` : ''}
        ${ageRatingStr ? `<span class="badge badge-dim">${ageRatingStr}</span>` : ''}
      </div>
      <div class="rel-card-genres">${genres.map(g => `<span class="badge badge-genre">${g}</span>`).join('')}</div>
      <div class="rel-card-stats">
        <span><i class="fas fa-tv"></i> ${r.episodes_released || '?'} / ${r.episodes_total || '?'} эп.</span>
        ${voteCount ? `<span><i class="fas fa-chart-bar"></i> ${voteCount} оценок</span>` : ''}
        <span><i class="fas fa-heart"></i> ${favCount}</span>
        <span><i class="fas fa-eye"></i> ${watchingCount}</span>
      </div>
      <div class="rel-card-actions">
        ${hasProgress && lastTypeId && lastSourceId
          ? `<button class="rel-play-btn" onclick="quickResume(${id},${lastTypeId},${lastSourceId},${curEp})"><i class="fas fa-play"></i> ПРОДОЛЖИТЬ ЭП. ${curEp}</button>`
          : hasProgress
            ? `<button class="rel-play-btn" onclick="openWatchModal(${id})"><i class="fas fa-play"></i> ПРОДОЛЖИТЬ ЭП. ${curEp}</button>`
            : `<button class="rel-play-btn" onclick="openWatchModal(${id})"><i class="fas fa-play"></i> СМОТРЕТЬ</button>`
        }
        ${user ? `
          <select class="rel-status-sel" onchange="setStatus(${id},this.value,'${esc(title)}','${esc(img)}',${epsNum})">
            <option value="" disabled ${!curStatus ? 'selected' : ''}>+ В список</option>
            <option value="watching" ${curStatus === 'watching' ? 'selected' : ''}>Смотрю</option>
            ${(r.episodes_total && r.episodes_released < r.episodes_total) || /выход|онгоинг/i.test(status) ? '' : `<option value="completed" ${curStatus === 'completed' ? 'selected' : ''}>Просмотрено</option>`}
            <option value="planned" ${curStatus === 'planned' ? 'selected' : ''}>В планах</option>
            <option value="on_hold" ${curStatus === 'on_hold' ? 'selected' : ''}>Отложено</option>
            <option value="dropped" ${curStatus === 'dropped' ? 'selected' : ''}>Брошено</option>
          </select>
          <div class="rel-fav-btn ${isFav ? 'active' : ''}" onclick="toggleFav(${id},'${esc(title)}','${esc(img)}')">
            <i class="fas fa-bookmark"></i>
          </div>
          <div class="rel-review-btn" onclick="document.getElementById('reviewsSection')?.scrollIntoView({behavior:'smooth'})">
            <i class="fas fa-comment"></i>
          </div>
        ` : ''}
      </div>
    </div>
    ${user && (friendsData.watching.length || friendsData.watched.length || friendsData.planned?.length) ? buildFriendsPanel(friendsData, title) : ''}
  </div>`;

  // === TWO COLUMN LAYOUT ===
  html += `<div class="rel-layout">`;

  // === LEFT COLUMN ===
  html += `<div class="rel-main">`;

  // Recommendation prompt (Steam-style) — only if user watched at least half
  const halfEps = epsNum > 0 ? Math.ceil(epsNum / 2) : 1;
  const watchedAll = epsNum > 0 && curEp >= epsNum;
  if (user && curEp > 0 && curEp >= halfEps) {
    const playedText = watchedAll
      ? 'Вы посмотрели целиком это аниме :)'
      : epsNum > 0
        ? `Вы посмотрели ${curEp} из ${epsNum} эп.`
        : `Вы посмотрели ${curEp} эп.`;
    html += `<div class="rel-rec-prompt" id="relRecPrompt">
      <div class="rel-rec-text">
        <div class="rel-rec-played">${playedText}</div>
        <div class="rel-rec-q">Вы бы порекомендовали этот тайтл другим?</div>
      </div>
      <div class="rel-rec-btns">
        <button class="rel-rec-btn rel-rec-yes" onclick="openReviewModal(${id},true)"><i class="fas fa-thumbs-up"></i> Да</button>
        <button class="rel-rec-btn rel-rec-no" onclick="openReviewModal(${id},false)"><i class="fas fa-thumbs-down"></i> Нет</button>
        <button class="rel-rec-btn rel-rec-later" onclick="document.getElementById('relRecPrompt').remove()">Возможно, позже</button>
      </div>
    </div>`;
  }

  // Synopsis (collapsed to 2 lines by default)
  html += `<div class="rel-section-title">Описание</div>
    <div class="synopsis collapsed" id="synopsisBlock">${desc}</div>
    ${desc.length > 100 ? `<span class="synopsis-toggle" id="synopsisToggle" onclick="toggleSynopsis()">Подробнее...</span>` : ''}`;

  // === Rating block (Anixart-style) ===
  const totalRated = v1 + v2 + v3 + v4 + v5;
  const userVote = curScore || 0;
  html += `<div class="rel-rating-block">
    <div class="rel-rating-title">Рейтинг</div>
    <div class="rel-rating-main">
      <div class="rel-rating-num-col">
        <div class="rel-rating-big">${score || '—'}</div>
        <div class="rel-rating-votes">${voteCount.toLocaleString('ru')} ${pluralVotes(voteCount)}</div>
      </div>
      <div class="rel-rating-bars">
        ${[5,4,3,2,1].map(n => {
          const c = [v1,v2,v3,v4,v5][n-1];
          const pct = totalRated ? (c / totalRated * 100) : 0;
          return `<div class="rel-rb-row"><span class="rel-rb-lbl">${n}</span><div class="rel-rb-track"><div class="rel-rb-fill" style="width:${pct}%"></div></div></div>`;
        }).join('')}
      </div>
    </div>
    ${user ? `<div class="rel-rating-user">
      ${user?.avatar ? `<img class="rel-rating-avatar" src="${user.avatar}">` : `<div class="rel-rating-avatar"></div>`}
      <div class="rel-rating-stars-5" id="userStars5" data-vote="${userVote}">
        ${[1,2,3,4,5].map(i => `<span class="rel-star5 ${i <= userVote ? 'on' : ''}" onclick="setScore(${id},${i},'${esc(title)}','${esc(img)}',${epsNum})" onmouseenter="previewStars5(${i})" onmouseleave="resetStars5()">&#9733;</span>`).join('')}
      </div>
    </div>` : ''}
  </div>`;

  // === In lists block ===
  const totalLists = watchingCount + planCount + completedCount + holdCount + droppedCount;
  if (totalLists > 0) {
    const segs = [
      { count: watchingCount, color: '#76b900', label: 'Смотрю' },
      { count: completedCount, color: '#9b59b6', label: 'Просмотрено' },
      { count: planCount, color: '#3498db', label: 'В планах' },
      { count: holdCount, color: '#f39c12', label: 'Отложено' },
      { count: droppedCount, color: '#e74c3c', label: 'Брошено' },
    ];
    html += `<div class="rel-lists-block">
      <div class="rel-lists-title">В списках у людей</div>
      <div class="rel-lists-bar">
        ${segs.map(s => s.count ? `<div class="rel-lists-seg" style="background:${s.color};flex:${s.count}"></div>` : '').join('')}
      </div>
      <div class="rel-lists-legend">
        ${segs.filter(s => s.count).map(s => `<div class="rel-lists-leg-item"><span class="rel-lists-dot" style="background:${s.color}"></span><span class="rel-lists-leg-lbl">${s.label}</span><b>${s.count.toLocaleString('ru')}</b></div>`).join('')}
      </div>
    </div>`;
  }

  // Screenshots — same carousel style as genre carousel on home
  if (screenshots.length) {
    const ssPerPage = 4;
    const ssPages = Math.ceil(screenshots.length / ssPerPage);
    html += `<div class="rel-section-title" style="margin-top:24px">Скриншоты</div>`;
    html += `<div class="hm-section"><div class="hm-carousel-outer hm-cats-outer">`;
    html += `<div class="hm-car-arrow hm-car-l" onclick="carouselNav('ssTrack',-1)"><i class="fas fa-chevron-left"></i></div>`;
    html += `<div class="hm-cats-wrap"><div class="hm-cats-track" id="ssTrack" data-page="0" data-pages="${ssPages}" data-per="${ssPerPage}">`;
    screenshots.forEach((s, i) => {
      html += `<div class="hm-cat-card rel-ss-card" onclick="openImageViewer('${s}')">`;
      html += `<div class="hm-cat-img" style="background-image:url('${s}');background-size:cover;background-position:center"></div>`;
      html += `<div class="hm-cat-bg"></div>`;
      html += `</div>`;
    });
    html += `</div></div>`;
    html += `<div class="hm-car-arrow hm-car-r" onclick="carouselNav('ssTrack',1)"><i class="fas fa-chevron-right"></i></div>`;
    html += `</div>`;
    let ssDots = '';
    for (let d = 0; d < ssPages; d++) {
      ssDots += `<span class="hm-car-dot${d === 0 ? ' active' : ''}" onclick="carouselGoTo('ssTrack',${d})"></span>`;
    }
    html += `<div class="hm-car-dots">${ssDots}</div></div>`;
  }

  // Voicers
  if (voicers.length) {
    html += `<div class="rel-section-title" style="margin-top:24px">Озвучка</div>
      <div class="voicers-row">${voicers.map(v => `<span class="voicer-tag">${v}</span>`).join('')}</div>`;
  }

  // Related
  if (relatedReleases.length) {
    html += buildReleaseCarousel('Связанное', relatedReleases, 'relRelated', 4);
  }

  // Recommended
  if (recommendedReleases.length) {
    html += buildReleaseCarousel('Рекомендации', recommendedReleases, 'relRecs', 4);
  }

  // Reviews
  html += `<div id="reviewsSection">
    <div class="rel-section-title" style="margin-top:24px">Обзоры</div>
    <div id="reviewForm"></div>
    <div id="reviewStats"></div>
    <div id="reviewsList"><div class="loader"><div class="spinner"></div></div></div>
  </div>`;

  html += `</div>`; // rel-main
  html += `</div>`; // rel-layout

  window._releaseId = id;
  window._releaseTitle = title;
  window._releaseImg = img;
  window._totalEps = epsNum;
  window._curEp = curEp;

  app.innerHTML = html;

  // Rotate hero background through screenshots every 20s
  clearInterval(window._relHeroInterval);
  if (screenshots.length > 1) {
    let heroIdx = 0;
    window._relHeroInterval = setInterval(() => {
      const el = document.getElementById('relHero');
      if (!el) { clearInterval(window._relHeroInterval); return; }
      heroIdx = (heroIdx + 1) % screenshots.length;
      el.style.backgroundImage = `url('${screenshots[heroIdx]}')`;
    }, 20000);
  }

  // Init screenshot carousel (same as home genre carousel)
  if (document.getElementById('ssTrack')) {
    const ssWrap = document.querySelector('.hm-cats-wrap');
    const ssTrack = document.getElementById('ssTrack');
    if (ssWrap && ssTrack) {
      const per = parseInt(ssTrack.dataset.per || 4);
      const gap = parseFloat(getComputedStyle(ssTrack).gap) || 8;
      const cardW = (ssWrap.offsetWidth - gap * (per - 1)) / per;
      ssTrack.querySelectorAll('.hm-cat-card').forEach(c => {
        c.style.width = cardW + 'px';
        c.style.minWidth = cardW + 'px';
      });
    }
    _initCarouselClones();
  }

  // Ensure tooltip div exists for release page carousels
  if (!document.getElementById('hcTip')) {
    const t = document.createElement('div');
    t.id = 'hcTip';
    t.className = 'hc-tip';
    document.body.appendChild(t);
  }

  // Load reviews (episodes load on demand in modal)
  loadReviews(id);
  loadReviewForm(id);
}

async function loadReviewForm(releaseId) {
  const el = document.getElementById('reviewForm');
  if (!el || !user) { if (el) el.innerHTML = ''; return; }
  const existing = await api(`/api/release/${releaseId}/my-review`);
  const r = existing?.review;
  // If user has an existing review — show inline edit form (no modal)
  // If no review — show only a "Write review" button that opens the modal
  if (r) {
    el.innerHTML = `<div class="rv-form">
      <div class="rv-form-head">
        <div class="rv-form-ava">${user.avatar ? `<img src="${user.avatar}">` : `<span>${(user.name||'?')[0]}</span>`}</div>
        <div class="rv-form-body">
          <div class="rv-form-title">Ваш обзор</div>
          <div class="rv-form-sub">Можно отредактировать или удалить.</div>
        </div>
      </div>
      <textarea id="rvText" placeholder="Ваш обзор..." rows="4" maxlength="5000">${r.text || ''}</textarea>
      <div class="rv-form-opts">
        <div class="rv-form-left">
          <label class="rv-check"><input type="checkbox" id="rvSpoiler" ${r.spoiler ? 'checked' : ''}> Содержит спойлеры</label>
        </div>
        <div class="rv-form-right">
          <span style="color:var(--text-sec);font-size:12px;margin-right:8px">Рекомендуете?</span>
          <button class="rv-rec-btn rv-rec-yes ${r.recommend ? 'active' : ''}" id="rvRecYes" onclick="document.getElementById('rvRecYes').classList.add('active');document.getElementById('rvRecNo').classList.remove('active')"><i class="fas fa-thumbs-up"></i> Да</button>
          <button class="rv-rec-btn rv-rec-no ${!r.recommend ? 'active' : ''}" id="rvRecNo" onclick="document.getElementById('rvRecNo').classList.add('active');document.getElementById('rvRecYes').classList.remove('active')"><i class="fas fa-thumbs-down"></i> Нет</button>
        </div>
      </div>
      <button class="rv-submit" onclick="submitReview(${releaseId})">Обновить обзор</button>
    </div>`;
    // Hide rec prompt if user already has a review
    document.getElementById('relRecPrompt')?.remove();
  } else {
    el.innerHTML = `<div class="rv-form-empty">
      <div class="rv-form-ava">${user.avatar ? `<img src="${user.avatar}">` : `<span>${(user.name||'?')[0]}</span>`}</div>
      <button class="rv-write-btn" onclick="openReviewModal(${releaseId},true)"><i class="fas fa-pen"></i> Написать обзор</button>
    </div>`;
  }
}

function openReviewModal(releaseId, recommend) {
  document.getElementById('rvModal')?.remove();
  const title = window._releaseTitle || '';
  const ep = window._curEp || 0;
  const overlay = document.createElement('div');
  overlay.id = 'rvModal';
  overlay.className = 'rv-modal-overlay';
  overlay.innerHTML = `<div class="rv-modal">
    <div class="rv-modal-head">
      <div>
        <div class="rv-modal-title">Обзор</div>
        <div class="rv-modal-sub">${title}</div>
      </div>
      <span class="rv-modal-close" onclick="document.getElementById('rvModal').remove()">&times;</span>
    </div>
    <div class="rv-modal-rec-bar">
      <div class="rv-modal-rec-text">
        ${ep ? `<div class="rv-modal-rec-played">${(window._totalEps && ep >= window._totalEps) ? 'Вы посмотрели целиком это аниме :)' : 'Вы посмотрели ' + ep + ' эп.'}</div>` : ''}
        <div class="rv-modal-rec-q">Вы бы порекомендовали этот тайтл другим?</div>
      </div>
      <div class="rv-modal-rec-btns">
        <button class="rel-rec-btn rel-rec-yes ${recommend ? 'active' : ''}" id="rvmYes" onclick="rvmPickRec(true)"><i class="fas fa-thumbs-up"></i> Да</button>
        <button class="rel-rec-btn rel-rec-no ${!recommend ? 'active' : ''}" id="rvmNo" onclick="rvmPickRec(false)"><i class="fas fa-thumbs-down"></i> Нет</button>
      </div>
    </div>
    <div class="rv-modal-help">Опишите, что вам понравилось или не понравилось в этом аниме.</div>
    <textarea id="rvmText" placeholder="Ваш обзор..." rows="8" maxlength="5000"></textarea>
    <label class="rv-check" style="margin-top:10px;display:inline-flex"><input type="checkbox" id="rvmSpoiler"> Содержит спойлеры</label>
    <div class="rv-modal-foot">
      <button class="rv-submit" onclick="submitReviewModal(${releaseId})">Опубликовать обзор</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  window._rvmRec = !!recommend;
}

function rvmPickRec(rec) {
  window._rvmRec = rec;
  document.getElementById('rvmYes').classList.toggle('active', rec);
  document.getElementById('rvmNo').classList.toggle('active', !rec);
}

async function submitReviewModal(releaseId) {
  const text = document.getElementById('rvmText')?.value?.trim();
  if (!text) return toast('Напишите обзор');
  const spoiler = document.getElementById('rvmSpoiler')?.checked;
  const res = await api(`/api/release/${releaseId}/review`, { method: 'POST', body: {
    text, recommend: !!window._rvmRec, spoiler,
    title: window._releaseTitle || '',
    episode: window._curEp || 0
  }});
  if (res?.ok) {
    toast('Обзор опубликован');
    document.getElementById('rvModal')?.remove();
    document.getElementById('relRecPrompt')?.remove();
    loadReviews(releaseId);
    loadReviewForm(releaseId);
  } else {
    toast(res?.error || 'Ошибка');
  }
}

async function submitReview(releaseId) {
  const text = document.getElementById('rvText')?.value?.trim();
  if (!text) return toast('Напишите обзор');
  const recommend = document.getElementById('rvRecYes')?.classList.contains('active');
  const spoiler = document.getElementById('rvSpoiler')?.checked;
  const res = await api(`/api/release/${releaseId}/review`, { method: 'POST', body: { text, recommend, spoiler, title: window._releaseTitle || '' } });
  if (res?.ok) {
    toast('Обзор опубликован');
    loadReviews(releaseId);
    loadReviewForm(releaseId);
  } else {
    toast(res?.error || 'Ошибка');
  }
}

async function loadReviews(releaseId, page) {
  const container = document.getElementById('reviewsList');
  const statsEl = document.getElementById('reviewStats');
  if (!container) return;

  const data = await api(`/api/release/${releaseId}/reviews?page=${page || 1}`);
  const reviews = data?.reviews || [];
  const stats = data?.stats || { total: 0, positive: 0, negative: 0 };

  if (statsEl && stats.total > 0) {
    const pct = Math.round((stats.positive / stats.total) * 100);
    const label = pct >= 80 ? 'Очень положительные' : pct >= 60 ? 'В основном положительные' : pct >= 40 ? 'Смешанные' : 'Отрицательные';
    const clr = pct >= 70 ? '#a0d0a0' : pct >= 40 ? '#b9a074' : '#a34c25';
    statsEl.innerHTML = `<div class="rv-stats">Обзоров: ${stats.total} — <span style="color:${clr}">${label}</span> (${pct}% положительных)</div>`;
  }

  if (!reviews.length) {
    container.innerHTML = '<div class="empty-sm" style="padding:20px 0">Пока нет обзоров. Будьте первым!</div>';
    return;
  }

  const friendReviews = reviews.filter(r => r.is_friend);
  const otherReviews = reviews.filter(r => !r.is_friend);

  const renderCard = (r) => {
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : '';
    const canDel = user && (user.id === r.user_id || (user.role === 'admin' || user.role === 'owner' || (user.roles && (user.roles.includes('admin') || user.roles.includes('owner')))));
    const recIcon = r.recommend ? '<i class="fas fa-thumbs-up"></i>' : '<i class="fas fa-thumbs-down"></i>';
    const recText = r.recommend ? 'Рекомендует' : 'Не рекомендует';
    const recClass = r.recommend ? 'rv-rec-pos' : 'rv-rec-neg';
    const rx = r.reactions || {};
    return `<div class="rv-card">
      <div class="rv-card-left" onclick="navigate('profile',{id:'${r.user_id}'})" style="cursor:pointer">
        <div class="rv-card-ava">${r.avatar ? `<img src="${r.avatar}">` : `<span>${(r.login||'?')[0]}</span>`}</div>
        <div class="rv-card-name">${r.login}</div>
      </div>
      <div class="rv-card-right">
        <div class="rv-card-rec ${recClass}">${recIcon} <span>${r.is_friend ? 'Ваш друг ' : ''}${recText.toLowerCase()}</span></div>
        <div class="rv-card-date">ОПУБЛИКОВАН: ${date}${r.episode_at_review ? ` • НА ${r.episode_at_review} СЕРИИ` : ''} ${canDel ? `<span class="comment-del" onclick="deleteReview(${r.id},${releaseId})" style="opacity:.5;margin-left:8px"><i class="fas fa-trash"></i></span>` : ''}</div>
        ${r.spoiler ? `<div class="rv-spoiler-wrap"><div class="rv-spoiler-warn" onclick="this.parentElement.classList.add('rv-revealed')"><i class="fas fa-eye-slash"></i> Обзор содержит спойлеры — нажмите, чтобы показать</div><div class="rv-spoiler-text">${(r.text||'').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div></div>` : `<div class="rv-card-text">${(r.text||'').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>`}
        <div class="rv-card-helpful">
          <span style="color:var(--text-dim);font-size:11px">Был ли этот обзор полезен?</span>
          <button class="rv-react" onclick="reactReview(${r.id},${releaseId},'yes')"><i class="fas fa-thumbs-up"></i> Да${rx.yes ? ` <span>${rx.yes}</span>` : ''}</button>
          <button class="rv-react" onclick="reactReview(${r.id},${releaseId},'no')"><i class="fas fa-thumbs-down"></i> Нет</button>
          <button class="rv-react" onclick="reactReview(${r.id},${releaseId},'funny')"><i class="fas fa-laugh"></i> Забавно${rx.funny ? ` <span>${rx.funny}</span>` : ''}</button>
        </div>
      </div>
    </div>`;
  };

  let html = '';
  if (friendReviews.length) {
    html += `<div class="rv-section-title">ОБЗОРЫ ДРУЗЕЙ</div>` + friendReviews.map(renderCard).join('');
  }
  if (otherReviews.length) {
    if (friendReviews.length) html += `<div class="rv-section-title" style="margin-top:14px">НЕДАВНИЕ</div>`;
    html += otherReviews.map(renderCard).join('');
  }
  container.innerHTML = html;

  if (data?.pages && (page || 1) < data.pages) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline';
    btn.style.cssText = 'margin:12px auto;display:block';
    btn.textContent = 'Ещё обзоры';
    btn.onclick = () => { btn.remove(); loadReviews(releaseId, (page || 1) + 1); };
    container.appendChild(btn);
  }
}

async function deleteReview(reviewId, releaseId) {
  await api(`/api/review/${reviewId}`, { method: 'DELETE' });
  loadReviews(releaseId);
  loadReviewForm(releaseId);
}

async function reactReview(reviewId, releaseId, type) {
  await api(`/api/review/${reviewId}/react`, { method: 'POST', body: { type } });
  loadReviews(releaseId);
}

function openImageViewer(url) {
  const overlay = document.createElement('div');
  overlay.className = 'image-overlay';
  overlay.onclick = () => overlay.remove();
  overlay.innerHTML = `<img src="${url}"><div class="image-overlay-close"><i class="fas fa-times"></i></div>`;
  document.body.appendChild(overlay);
}

function switchRelTab() { /* tabs removed */ }

function toggleSynopsis() {
  const el = document.getElementById('synopsisBlock');
  const expanded = el.classList.toggle('expanded');
  el.classList.toggle('collapsed', !expanded);
  const toggle = document.getElementById('synopsisToggle');
  if (toggle) toggle.textContent = expanded ? 'Свернуть' : 'Подробнее...';
}

// --- Episode loading & player ---
function playerIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('kodik')) return '<i class="fas fa-play-circle" style="color:#7b68ee"></i>';
  if (n.includes('sibnet')) return '<i class="fas fa-film" style="color:#4db6ac"></i>';
  if (n.includes('libria')) return '<i class="fas fa-tv" style="color:#ef5350"></i>';
  return '<i class="fas fa-video" style="color:#aaa"></i>';
}

// === WATCH MODAL (voiceover → source → fullscreen) ===
async function quickResume(releaseId, typeId, sourceId, epNum) {
  // Go straight to player at the episode where user left off
  const epData = await api(`/api/episode/${releaseId}/${typeId}/${sourceId}`);
  if (!epData?.episodes?.length) {
    // Fallback to modal if can't load episodes
    openWatchModal(releaseId);
    return;
  }
  // Find the next unwatched episode (current_episode is the last watched, so play current_episode + 1 if available)
  let idx = epData.episodes.findIndex(e => e.position === epNum);
  // If current ep was fully watched, go to next
  if (idx >= 0) {
    const prog = await api(`/api/progress/${releaseId}`);
    const watchedEps = new Set((prog?.data?.watched_eps || []).map(Number));
    window._wmWatchedEps = watchedEps;
    if (watchedEps.has(epNum) && idx < epData.episodes.length - 1) {
      idx = idx + 1;
    }
  }
  if (idx < 0) idx = 0;
  openFullPlayer(releaseId, typeId, sourceId, idx);
}

async function openWatchModal(releaseId) {
  // Create modal only if not exists
  if (!document.getElementById('watchModal')) {
    const overlay = document.createElement('div');
    overlay.id = 'watchModal';
    overlay.className = 'wm-overlay';
    overlay.innerHTML = `<div class="wm-modal">
      <div class="wm-header">
        <span class="wm-back" id="wmBack" onclick="wmGoBack()" style="display:none"><i class="fas fa-arrow-left"></i></span>
        <span class="wm-title" id="wmTitle">Выберите озвучку</span>
        <span class="wm-close" onclick="document.getElementById('watchModal').remove()">&times;</span>
      </div>
      <div class="wm-body" id="wmBody"><div class="loader"><div class="spinner"></div></div></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }
  window._wmNavStack = ['voice'];
  window._wmReleaseId2 = releaseId;
  wmShowBack();

  const title = document.getElementById('wmTitle');
  const body = document.getElementById('wmBody');
  title.textContent = 'Выберите озвучку';
  body.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const typesData = await api(`/api/episode/${releaseId}`);
  if (!typesData?.types?.length) {
    body.innerHTML = '<div class="empty-sm">Озвучки недоступны</div>';
    return;
  }

  window._voTypes = typesData.types;

  // Check if user has saved voice/source to offer quick resume
  let resumeHtml = '';
  if (user) {
    const prog = await api(`/api/progress/${releaseId}`);
    const p = prog?.data;
    if (p?.last_type_id && p?.last_source_id && p?.current_episode > 0) {
      const savedType = typesData.types.find(t => t.id === p.last_type_id);
      const voName = savedType?.name || 'Озвучка';
      const nextEp = p.current_episode;
      resumeHtml = `<div class="wm-resume-card" id="wmResumeCard">
        <div class="wm-resume-info" onclick="quickResume(${releaseId},${p.last_type_id},${p.last_source_id},${nextEp})">
          <i class="fas fa-play-circle" style="font-size:20px;color:var(--accent)"></i>
          <div>
            <div style="font-size:14px;font-weight:600;color:#fff">Продолжить — ${voName}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.4)">Серия ${nextEp}</div>
          </div>
        </div>
        <span class="wm-resume-close" onclick="document.getElementById('wmResumeCard').remove()">&times;</span>
      </div>`;
    }
  }

  body.innerHTML = resumeHtml + typesData.types.map(t => `
    <div class="wm-vo-item" onclick="wmPickVoice(${releaseId},${t.id})">
      <div class="wm-vo-icon">${t.icon ? `<img src="${t.icon}">` : '<i class="fas fa-microphone-alt"></i>'}</div>
      <div class="wm-vo-info">
        <div class="wm-vo-name">${t.name}</div>
        <div class="wm-vo-sub">${t.episodes_count} эп.${t.is_sub ? ' • субтитры' : ''}${t.workers ? ' • ' + t.workers : ''}</div>
      </div>
      <i class="fas fa-chevron-right" style="color:rgba(255,255,255,.15);margin-left:auto"></i>
    </div>
  `).join('');
}

async function wmPickVoice(releaseId, typeId) {
  window._wmNavStack.push('player');
  window._wmLastVoice = [releaseId, typeId];
  wmShowBack();
  const body = document.getElementById('wmBody');
  const header = document.getElementById('wmTitle');
  body.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const srcData = await api(`/api/episode/${releaseId}/${typeId}`);
  if (!srcData?.sources?.length) {
    body.innerHTML = '<div class="empty-sm">Нет источников</div>';
    return;
  }

  // If only 1 source — go straight to episode picker (skip player step)
  if (srcData.sources.length === 1) {
    window._wmNavStack.pop(); // remove 'player' so back goes to 'voice'
    wmPickEpisode(releaseId, typeId, srcData.sources[0].id);
    return;
  }

  // Multiple sources — show picker
  header.textContent = 'Выберите плеер';
  body.innerHTML = srcData.sources.map(s => `
    <div class="wm-vo-item" onclick="wmPickEpisode(${releaseId},${typeId},${s.id})">
      <div class="wm-vo-icon"><i class="fas fa-play-circle"></i></div>
      <div class="wm-vo-info">
        <div class="wm-vo-name">${s.name}</div>
        <div class="wm-vo-sub">${s.episodes_count} эп.</div>
      </div>
      <i class="fas fa-chevron-right" style="color:rgba(255,255,255,.15);margin-left:auto"></i>
    </div>
  `).join('');
}

// === Watch modal navigation ===
function wmShowBack() {
  const btn = document.getElementById('wmBack');
  if (btn) btn.style.display = (window._wmNavStack && window._wmNavStack.length > 1) ? '' : 'none';
}

function wmGoBack() {
  if (!window._wmNavStack || window._wmNavStack.length <= 1) {
    document.getElementById('watchModal')?.remove();
    return;
  }
  window._wmNavStack.pop(); // remove current
  const prev = window._wmNavStack[window._wmNavStack.length - 1];
  window._wmNavStack.pop(); // pop so re-entry pushes it again

  if (prev === 'voice') {
    openWatchModal(window._wmReleaseId2);
  } else if (prev === 'player') {
    wmPickVoice(...window._wmLastVoice);
  } else if (prev === 'episode') {
    wmPickEpisode(...window._wmLastSource);
  }
}

// === Episode picker ===
async function wmPickEpisode(releaseId, typeId, sourceId) {
  window._wmNavStack.push('episode');
  window._wmLastSource = [releaseId, typeId, sourceId];
  wmShowBack();
  const body = document.getElementById('wmBody');
  const header = document.getElementById('wmTitle');
  header.textContent = 'Выберите серию';
  body.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const [epData, progData] = await Promise.all([
    api('/api/episode/' + releaseId + '/' + typeId + '/' + sourceId),
    user ? api('/api/progress/' + releaseId) : Promise.resolve(null)
  ]);

  if (!epData?.episodes?.length) {
    body.innerHTML = '<div class="empty-sm">Нет эпизодов</div>';
    return;
  }

  const episodes = epData.episodes;
  const prog = progData?.data;
  const currentEp = prog?.current_episode || 0;
  const watchedEps = new Set((prog?.watched_eps || []).map(Number));
  const epTimes = prog?.ep_times || {};
  const totalEps = episodes.length;
  const allWatched = watchedEps.size >= totalEps;

  // Store for later
  window._wmReleaseId = releaseId;
  window._wmTypeId = typeId;
  window._wmSourceId = sourceId;
  window._wmWatchedEps = watchedEps;

  let html = '';
  if (allWatched) {
    html += '<div class="wm-all-watched"><i class="fas fa-check-circle"></i> Просмотрено целиком</div>';
  } else if (currentEp > 0) {
    html += '<div class="wm-progress-bar"><div class="wm-progress-label">Просмотрено до ' + currentEp + ' серии</div><div class="wm-progress-track"><div class="wm-progress-fill" style="width:' + Math.round(currentEp / totalEps * 100) + '%"></div></div></div>';
  }

  html += '<div class="wm-ep-search"><i class="fas fa-search"></i><input type="text" placeholder="Найти серию..." oninput="wmFilterEps(this.value)"></div>';
  html += '<div class="wm-ep-list">';
  episodes.forEach((ep, i) => {
    const epNum = ep.position || (i + 1);
    const isWatched = watchedEps.has(epNum);
    const isCurrent = epNum === currentEp;
    const savedTime = epTimes[epNum];
    const timeLabel = savedTime > 0 ? wmFmtTime(savedTime) : '';
    html += '<div class="wm-ep-item' + (isCurrent ? ' wm-ep-current' : '') + '" data-ep="' + epNum + '">';
    html += '<div class="wm-ep-play" onclick="wmPlayEp(' + releaseId + ',' + typeId + ',' + sourceId + ',' + i + ',' + epNum + ')">';
    html += '<span class="wm-ep-num">Серия ' + epNum + '</span>';
    if (timeLabel && !isWatched) html += '<span class="wm-ep-time">остановлено на ' + timeLabel + '</span>';
    html += '</div>';
    html += '<div class="wm-ep-check' + (isWatched ? ' watched' : '') + '" onclick="wmToggleEp(this,' + releaseId + ',' + epNum + ')">';
    html += isWatched ? '<i class="fas fa-check"></i>' : '';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';

  body.innerHTML = html;
}

function wmPlayEp(releaseId, typeId, sourceId, idx, epNum) {
  document.getElementById('watchModal').remove();
  // Mark as watched + save last voice/source
  if (user && window._wmWatchedEps) {
    window._wmWatchedEps.add(epNum);
    api('/api/progress', { method: 'POST', body: {
      anime_id: releaseId, current_episode: epNum,
      watched_eps: Array.from(window._wmWatchedEps),
      last_type_id: typeId, last_source_id: sourceId
    }});
  }
  openFullPlayer(releaseId, typeId, sourceId, idx);
}

function wmToggleEp(el, releaseId, epNum) {
  if (!user || !window._wmWatchedEps) return;
  const wasWatched = window._wmWatchedEps.has(epNum);
  if (wasWatched) {
    window._wmWatchedEps.delete(epNum);
    el.classList.remove('watched');
    el.innerHTML = '';
  } else {
    window._wmWatchedEps.add(epNum);
    el.classList.add('watched');
    el.innerHTML = '<i class="fas fa-check"></i>';
  }
  api('/api/progress', { method: 'POST', body: {
    anime_id: releaseId,
    watched_eps: Array.from(window._wmWatchedEps)
  }});
}

function wmFmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return h + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  return m + ':' + String(s).padStart(2,'0');
}

function wmFilterEps(q) {
  const items = document.querySelectorAll('.wm-ep-item');
  q = q.trim().toLowerCase();
  items.forEach(el => {
    if (!q) { el.style.display = ''; return; }
    const num = el.dataset.ep;
    // Number: starts with query (typing "2" shows 2, "20" shows 20-29, etc.)
    const numMatch = num.startsWith(q);
    el.style.display = numMatch ? '' : 'none';
  });
}

// === FULLSCREEN PLAYER ===
async function openFullPlayer(releaseId, typeId, sourceId, startIdx) {
  window._fpReleaseId = parseInt(releaseId);
  window._fpTypeId = typeId;
  window._fpSourceId = sourceId;

  // Get release info for saving progress
  if (!window._releaseTitle) {
    const data = await api(`/api/release/${releaseId}`);
    const r = data?.release || data?.content || data;
    if (r) {
      window._releaseId = parseInt(releaseId);
      window._releaseTitle = r.title_ru || r.title || '';
      window._releaseImg = posterUrl(r);
      window._totalEps = r.episodes_total || r.episodes_released || 0;
    }
  }

  // Create fullscreen overlay
  document.getElementById('fullPlayer')?.remove();
  const fp = document.createElement('div');
  fp.id = 'fullPlayer';
  fp.className = 'fp-overlay';
  fp.innerHTML = `
    <div class="fp-player" id="fpPlayer">
      <div class="player-ph"><i class="fas fa-play-circle"></i><div>Загрузка...</div></div>
    </div>
    <div class="fp-hud" id="fpHud">
      <div class="fp-top">
        <button class="fp-back" onclick="closeFullPlayer(true)"><i class="fas fa-arrow-left"></i></button>
        <div class="fp-top-info">
          <div class="fp-title" id="fpTitle">${window._releaseTitle || ''}</div>
          <div class="fp-ep-label" id="fpEpLabel">Загрузка...</div>
        </div>
        <div class="fp-top-right">
          <div class="fp-speed" onclick="fpCycleSpeed()"><i class="fas fa-tachometer-alt"></i> <span id="fpSpeedLbl">Обычн.</span></div>
        </div>
      </div>
      <div class="fp-center-controls" id="fpCenterCtrl">
        <button class="fp-cbtn" onclick="fpPrevEp()"><i class="fas fa-step-backward"></i></button>
        <button class="fp-cbtn fp-cbtn-play" id="fpPlayBtn" onclick="fpTogglePlay()"><i class="fas fa-play" id="fpPlayIcon"></i></button>
        <button class="fp-cbtn" onclick="fpNextEp()"><i class="fas fa-step-forward"></i></button>
      </div>
      <div class="fp-bottom">
        <div class="fp-progress" id="fpProgress" onclick="fpSeek(event)">
          <div class="fp-progress-fill" id="fpProgressFill"></div>
        </div>
        <div class="fp-bottom-row">
          <span class="fp-time" id="fpTime">00:00 / 00:00</span>
          <div class="fp-bottom-btns">
            <button class="fp-bbtn" onclick="fpSkipOp()" title="Пропуск +90с"><i class="fas fa-forward"></i></button>
            <button class="fp-bbtn" onclick="fpToggleFullscreen()" title="Полный экран"><i class="fas fa-expand"></i></button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(fp);
  document.body.style.overflow = 'hidden';

  // Load episodes
  const epData = await api(`/api/episode/${releaseId}/${typeId}/${sourceId}`);
  if (!epData?.episodes?.length) {
    document.getElementById('fpPlayer').innerHTML = '<div class="player-ph"><i class="fas fa-exclamation-triangle"></i><div>Нет эпизодов</div></div>';
    return;
  }

  window._fpEpisodes = epData.episodes;
  window._fpCurrentIdx = 0;

  // Start from explicit index (from episode picker) or saved progress
  if (startIdx !== undefined && startIdx >= 0) {
    window._fpCurrentIdx = startIdx;
  } else if (user) {
    const prog = await api(`/api/progress/${releaseId}`);
    const savedEp = prog?.data?.current_episode || 0;
    if (savedEp > 0) {
      const idx = epData.episodes.findIndex(e => e.position === savedEp);
      if (idx >= 0) window._fpCurrentIdx = idx;
    }
  }

  fpPlayIdx(window._fpCurrentIdx);
}

function fpPlayIdx(index) {
  const eps = window._fpEpisodes;
  if (!eps || !eps[index]) return;
  fpSaveEpTime(); // save time of previous episode before switching
  window._fpCurrentTime = 0;
  window._fpDuration = 0;
  window._fpCurrentIdx = index;
  const ep = eps[index];
  const playerDiv = document.getElementById('fpPlayer');
  const label = document.getElementById('fpEpLabel');
  if (label) label.textContent = ep.position + ' серия';

  const playBtn = document.getElementById('fpPlayBtn');

  if (!ep.url) {
    playerDiv.innerHTML = '<div class="player-ph"><i class="fas fa-exclamation-triangle"></i><div>Видео недоступно</div></div>';
    return;
  }

  const iframeDomains = ['aniqit.com', 'kodik.', 'sibnet.ru', 'libria.fun', 'animejoy.', 'csst.online', 'sovetromantica.'];
  const useIframe = ep.iframe || iframeDomains.some(d => ep.url.includes(d));
  window._fpIsIframe = useIframe;

  const hud = document.getElementById('fpHud');
  const bottom = hud?.querySelector('.fp-bottom');
  const speedBtn = hud?.querySelector('.fp-speed');

  if (useIframe) {
    // Iframe — show Kodik as-is, no custom HUD overlay, just a small top bar
    let iframeUrl = ep.url;
    iframeUrl += (iframeUrl.includes('?') ? '&' : '?') + 'autoplay=1';
    playerDiv.innerHTML = `<iframe src="${iframeUrl}" style="width:100%;height:100%;border:none" allowfullscreen allow="autoplay; fullscreen; encrypted-media"></iframe>`;
    if (hud) hud.style.display = 'none';
    fpBindIframe();
    // Show minimal top bar for navigation
    let miniBar = document.getElementById('fpMiniBar');
    if (!miniBar) {
      miniBar = document.createElement('div');
      miniBar.id = 'fpMiniBar';
      miniBar.className = 'fp-minibar';
      document.getElementById('fullPlayer').appendChild(miniBar);
    }
    miniBar.innerHTML = `
      <button class="fp-minibar-btn" onclick="closeFullPlayer(true)"><i class="fas fa-arrow-left"></i></button>
      <span class="fp-minibar-title">${window._releaseTitle || ''} — ${ep.position} серия</span>
      <div class="fp-minibar-right">
        <button class="fp-minibar-btn" onclick="fpPrevEp()" title="Пред. серия"><i class="fas fa-step-backward"></i></button>
        <button class="fp-minibar-btn" onclick="fpNextEp()" title="След. серия"><i class="fas fa-step-forward"></i></button>
      </div>
    `;
  } else if (ep.url.match(/\.(mp4|webm|m3u8)(\?|$)/i)) {
    playerDiv.innerHTML = `<video id="fpVideo" src="${ep.url}" autoplay style="width:100%;height:100%"></video>`;
    if (hud) hud.style.display = '';
    document.getElementById('fpMiniBar')?.remove();
    if (playBtn) playBtn.style.display = '';
    if (bottom) { bottom.style.display = ''; bottom.querySelector('.fp-progress').style.display = ''; }
    if (speedBtn) speedBtn.style.display = '';
    hud?.classList.remove('fp-hud-iframe');
    fpBindVideo();
    fpSetupHud();
  } else {
    playerDiv.innerHTML = `<iframe src="${ep.url}" style="width:100%;height:100%;border:none" allowfullscreen></iframe>`;
    if (hud) hud.style.display = 'none';
    fpBindIframe();
    let miniBar = document.getElementById('fpMiniBar');
    if (!miniBar) {
      miniBar = document.createElement('div');
      miniBar.id = 'fpMiniBar';
      miniBar.className = 'fp-minibar';
      document.getElementById('fullPlayer').appendChild(miniBar);
    }
    miniBar.innerHTML = `
      <button class="fp-minibar-btn" onclick="closeFullPlayer(true)"><i class="fas fa-arrow-left"></i></button>
      <span class="fp-minibar-title">${window._releaseTitle || ''} — ${ep.position} серия</span>
      <div class="fp-minibar-right">
        <button class="fp-minibar-btn" onclick="fpPrevEp()" title="Пред. серия"><i class="fas fa-step-backward"></i></button>
        <button class="fp-minibar-btn" onclick="fpNextEp()" title="След. серия"><i class="fas fa-step-forward"></i></button>
      </div>
    `;
  }

  // Save progress + last voice/source
  if (window._releaseId && user) {
    api('/api/progress', { method: 'POST', body: {
      anime_id: window._releaseId, current_episode: ep.position,
      total_episodes: window._totalEps || 0, status: 'watching',
      title: window._releaseTitle, image: window._releaseImg,
      last_type_id: window._fpTypeId || null,
      last_source_id: window._fpSourceId || null
    }});
  }
}

function fpSetupHud() {
  const fp = document.getElementById('fullPlayer');
  const hud = document.getElementById('fpHud');
  if (!fp || !hud) return;
  let hideTimer;

  if (hud.classList.contains('fp-hud-iframe')) {
    // Iframe mode: top/bottom always visible, only center buttons auto-hide
    hud.classList.add('visible');
    const showCenter = () => {
      hud.classList.remove('fp-center-hidden');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => hud.classList.add('fp-center-hidden'), 3000);
    };
    fp.addEventListener('mousemove', showCenter);
    fp.addEventListener('touchstart', showCenter);
    showCenter();
  } else {
    // Video mode: entire HUD auto-hides
    const show = () => {
      hud.classList.add('visible');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => hud.classList.remove('visible'), 3000);
    };
    fp.addEventListener('mousemove', show);
    fp.addEventListener('touchstart', show);
    show();
  }
}

function fpBindIframe() {
  // Listen to Kodik postMessage events for time tracking
  window._fpIframeTime = 0;
  window._fpIframeDuration = 0;
  window._fpIframeGotMsg = false;
  window._fpIframeStartedAt = Date.now();
  if (window._fpMsgHandler) window.removeEventListener('message', window._fpMsgHandler);
  window._fpMsgHandler = (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    const d = e.data;
    // Kodik sends: {type: "kodik_player_time_update", data: {time, duration}}
    // or: {event: "timeupdate", currentTime, duration}
    const time = d?.data?.time ?? d?.currentTime ?? d?.time;
    const dur = d?.data?.duration ?? d?.duration;
    if (typeof time === 'number' && typeof dur === 'number' && dur > 0) {
      window._fpIframeGotMsg = true;
      window._fpIframeTime = time;
      window._fpIframeDuration = dur;
      window._fpCurrentTime = time;
      window._fpDuration = dur;
      const fill = document.getElementById('fpProgressFill');
      const timeEl = document.getElementById('fpTime');
      if (fill) fill.style.width = ((time / dur) * 100) + '%';
      if (timeEl) timeEl.textContent = fpFmtTime(time) + ' / ' + fpFmtTime(dur);
    }
  };
  window.addEventListener('message', window._fpMsgHandler);
  // Periodic time save for iframes + fallback elapsed time if no postMessage
  clearInterval(window._fpTimeSaveInterval);
  window._fpTimeSaveInterval = setInterval(() => {
    if (!window._fpIframeGotMsg) {
      // Fallback: use elapsed wall-clock time since playback started
      window._fpCurrentTime = Math.floor((Date.now() - window._fpIframeStartedAt) / 1000);
    }
    fpSaveEpTime();
  }, 15000);
}

function fpSeekIframe(e) {
  // Try to send seek to Kodik via postMessage
  const bar = document.getElementById('fpProgress');
  if (!bar || !window._fpIframeDuration) return;
  const rect = bar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const seekTime = pct * window._fpIframeDuration;
  const iframe = document.querySelector('#fpPlayer iframe');
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'seek', time: seekTime }, '*');
    iframe.contentWindow.postMessage({ event: 'seek', currentTime: seekTime }, '*');
  }
}

function fpBindVideo() {
  const vid = document.getElementById('fpVideo');
  if (!vid) return;
  const fill = document.getElementById('fpProgressFill');
  const timeEl = document.getElementById('fpTime');
  const icon = document.getElementById('fpPlayIcon');

  vid.addEventListener('timeupdate', () => {
    if (!vid.duration) return;
    const pct = (vid.currentTime / vid.duration) * 100;
    if (fill) fill.style.width = pct + '%';
    if (timeEl) timeEl.textContent = fpFmtTime(vid.currentTime) + ' / ' + fpFmtTime(vid.duration);
    // Track current time for saving
    window._fpCurrentTime = vid.currentTime;
    window._fpDuration = vid.duration;
  });
  vid.addEventListener('play', () => { if (icon) icon.className = 'fas fa-pause'; });
  vid.addEventListener('pause', () => {
    if (icon) icon.className = 'fas fa-play';
    fpSaveEpTime(); // save on pause
  });

  // Periodic time save every 15s
  clearInterval(window._fpTimeSaveInterval);
  window._fpTimeSaveInterval = setInterval(fpSaveEpTime, 15000);
}

function fpSaveEpTime() {
  if (!user || !window._releaseId || !window._fpEpisodes) return;
  const ep = window._fpEpisodes[window._fpCurrentIdx];
  if (!ep) return;
  const time = window._fpCurrentTime || 0;
  if (time <= 0) return;
  const epNum = ep.position || (window._fpCurrentIdx + 1);
  api('/api/progress', { method: 'POST', body: {
    anime_id: window._releaseId,
    ep_times: { [epNum]: Math.floor(time) }
  }});
  // Auto-mark as watched if >= 20 minutes (1200s)
  if (time >= 1200) {
    if (!window._fpAutoMarked) window._fpAutoMarked = new Set();
    if (!window._fpAutoMarked.has(epNum)) {
      window._fpAutoMarked.add(epNum);
      api('/api/progress', { method: 'POST', body: {
        anime_id: window._releaseId, current_episode: epNum,
        watched_eps: Array.from(new Set([...(window._wmWatchedEps || []), epNum]))
      }});
    }
  }
}

function fpFmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
}

function fpTogglePlay() {
  const vid = document.getElementById('fpVideo');
  if (!vid) return;
  vid.paused ? vid.play() : vid.pause();
}

function fpSeek(e) {
  const vid = document.getElementById('fpVideo');
  if (vid && vid.duration) {
    const bar = document.getElementById('fpProgress');
    const rect = bar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    vid.currentTime = pct * vid.duration;
  } else if (window._fpIsIframe) {
    fpSeekIframe(e);
  }
}

function fpCycleSpeed() {
  const vid = document.getElementById('fpVideo');
  if (!vid) { toast('Скорость недоступна для этого плеера'); return; }
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  let idx = speeds.indexOf(vid.playbackRate);
  idx = (idx + 1) % speeds.length;
  vid.playbackRate = speeds[idx];
  const lbl = document.getElementById('fpSpeedLbl');
  if (lbl) lbl.textContent = speeds[idx] + 'x';
}

function fpToggleFullscreen() {
  const fp = document.getElementById('fullPlayer');
  if (!fp) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else fp.requestFullscreen();
}

function fpNextEp() {
  const total = window._fpEpisodes?.length || 0;
  if (window._fpCurrentIdx < total - 1) {
    fpPlayIdx(window._fpCurrentIdx + 1);
  } else {
    toast('Это последняя серия');
  }
}
function fpPrevEp() {
  if (window._fpCurrentIdx > 0) {
    fpPlayIdx(window._fpCurrentIdx - 1);
  } else {
    toast('Это первая серия');
  }
}
function fpSkipOp() {
  const vid = document.getElementById('fpVideo');
  if (vid) { vid.currentTime += 90; return; }
  // For iframes — can't control, show toast
  toast('Пропуск опенинга недоступен для этого плеера');
}
function closeFullPlayer(goToEpisodes) {
  fpSaveEpTime(); // save time before closing
  clearInterval(window._fpTimeSaveInterval);
  if (document.fullscreenElement) document.exitFullscreen();
  const releaseId = window._fpReleaseId;
  const typeId = window._fpTypeId;
  const sourceId = window._fpSourceId;
  document.getElementById('fullPlayer')?.remove();
  document.body.style.overflow = '';
  if (window._fpMsgHandler) {
    window.removeEventListener('message', window._fpMsgHandler);
    window._fpMsgHandler = null;
  }
  window._fpCurrentTime = 0;
  window._fpDuration = 0;
  // Back arrow → open episode picker
  if (goToEpisodes && releaseId && typeId && sourceId) {
    // Create modal and go straight to episode list
    document.getElementById('watchModal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'watchModal';
    overlay.className = 'wm-overlay';
    overlay.innerHTML = `<div class="wm-modal">
      <div class="wm-header">
        <span class="wm-back" id="wmBack" onclick="wmGoBack()" style="display:none"><i class="fas fa-arrow-left"></i></span>
        <span class="wm-title" id="wmTitle">Выберите серию</span>
        <span class="wm-close" onclick="document.getElementById('watchModal').remove()">&times;</span>
      </div>
      <div class="wm-body" id="wmBody"><div class="loader"><div class="spinner"></div></div></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    window._wmNavStack = ['voice', 'player'];
    window._wmReleaseId2 = releaseId;
    window._wmLastVoice = [releaseId, typeId];
    window._wmLastSource = [releaseId, typeId, sourceId];
    wmShowBack();
    wmPickEpisode(releaseId, typeId, sourceId);
  }
}

// renderWatch — redirect legacy URLs
async function renderWatch(releaseId, voiceId) {
  navigate('release', { id: releaseId });
}

// Legacy — still used if called
async function loadEpisodes(releaseId) {
  const voPanel = document.getElementById('voiceoverTabs');
  const epList = document.getElementById('episodesList');
  if (!voPanel || !epList) return;

  const typesData = await api(`/api/episode/${releaseId}`);
  if (!typesData?.types?.length) {
    voPanel.innerHTML = '';
    epList.innerHTML = '<div class="empty-sm">Эпизоды недоступны для этого релиза</div>';
    document.getElementById('playerBox').innerHTML = '<div class="player-ph"><i class="fas fa-play-circle"></i><div>Видео недоступно</div></div>';
    return;
  }

  window._voTypes = typesData.types;

  voPanel.innerHTML = `<div class="vo-tabs">${
    typesData.types.map((t, i) => `
      <button class="btn btn-sm ${i === 0 ? 'btn-accent' : 'btn-outline'} vo-tab"
              onclick="selectVoiceover(${releaseId}, ${t.id}, this)"
              title="${t.workers || ''}">
        ${t.icon ? `<img src="${t.icon}" class="vo-icon">` : ''}
        ${t.name} (${t.episodes_count})
        ${t.is_sub ? '<i class="fas fa-closed-captioning" style="font-size:10px"></i>' : ''}
      </button>
    `).join('')
  }</div>`;

  selectVoiceover(releaseId, typesData.types[0].id);
}

async function selectVoiceover(releaseId, typeId, btnEl) {
  if (btnEl) {
    document.querySelectorAll('.vo-tab').forEach(b => { b.className = b.className.replace('btn-accent', 'btn-outline'); });
    btnEl.className = btnEl.className.replace('btn-outline', 'btn-accent');
  }

  const epList = document.getElementById('episodesList');
  epList.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const srcData = await api(`/api/episode/${releaseId}/${typeId}`);
  if (!srcData?.sources?.length) {
    epList.innerHTML = '<div class="empty-sm">Нет источников</div>';
    return;
  }

  window._currentTypeId = typeId;
  window._sources = srcData.sources;

  const firstSrc = srcData.sources[0];
  if (srcData.sources.length > 1) {
    epList.innerHTML = `<div class="src-tabs">${
      srcData.sources.map((s, i) => `
        <button class="btn btn-sm ${i === 0 ? 'btn-accent' : 'btn-outline'} src-tab"
                onclick="selectSource(${releaseId}, ${typeId}, ${s.id}, this)">
          ${playerIcon(s.name)} ${s.name} (${s.episodes_count})
        </button>
      `).join('')
    }</div><div id="epGrid"><div class="loader"><div class="spinner"></div></div></div>`;
  } else {
    epList.innerHTML = `<div class="src-label">${playerIcon(firstSrc.name)} ${firstSrc.name} (${firstSrc.episodes_count} эп.)</div><div id="epGrid"><div class="loader"><div class="spinner"></div></div></div>`;
  }

  selectSource(releaseId, typeId, firstSrc.id);
}

async function selectSource(releaseId, typeId, sourceId, btnEl) {
  if (btnEl) {
    document.querySelectorAll('.src-tab').forEach(b => { b.className = b.className.replace('btn-accent', 'btn-outline'); });
    btnEl.className = btnEl.className.replace('btn-outline', 'btn-accent');
  }

  const epGrid = document.getElementById('epGrid');
  if (!epGrid) return;
  epGrid.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const epData = await api(`/api/episode/${releaseId}/${typeId}/${sourceId}`);
  if (!epData?.episodes?.length) {
    epGrid.innerHTML = '<div class="empty-sm">Нет эпизодов</div>';
    return;
  }

  window._episodes = epData.episodes;

  epGrid.innerHTML = `<div class="episodes-list">${
    epData.episodes.map(ep => {
      return `<div class="ep-btn" onclick="playEpisode(${ep.position - 1})" title="${ep.name || 'Эпизод ' + ep.position}">${ep.position}</div>`;
    }).join('')
  }</div>`;

  playEpisode(0);
}

function playEpisode(index) {
  const eps = window._episodes;
  if (!eps || !eps[index]) return;

  const ep = eps[index];
  const playerBox = document.getElementById('playerBox');

  document.querySelectorAll('.ep-btn').forEach((b, i) => {
    b.classList.remove('current');
    if (i === index) b.classList.add('current');
    if (i < index) b.classList.add('watched');
  });

  if (!ep.url) return;

  const iframeDomains = ['aniqit.com', 'kodik.', 'sibnet.ru', 'libria.fun', 'animejoy.', 'csst.online', 'sovetromantica.'];
  const useIframe = ep.iframe || iframeDomains.some(d => ep.url.includes(d));

  if (useIframe) {
    playerBox.innerHTML = `
      <iframe src="${ep.url}" style="width:100%;height:100%;border:none;border-radius:var(--radius-lg)"
              allowfullscreen allow="autoplay; fullscreen; encrypted-media" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
    `;
  } else if (ep.url.match(/\.(mp4|webm|m3u8)(\?|$)/i)) {
    playerBox.innerHTML = `
      <video src="${ep.url}" controls style="width:100%;height:100%;border-radius:var(--radius-lg)"></video>
    `;
  } else {
    playerBox.innerHTML = `
      <iframe src="${ep.url}" style="width:100%;height:100%;border:none;border-radius:var(--radius-lg)"
              allowfullscreen allow="autoplay; fullscreen; encrypted-media"></iframe>
    `;
  }

  window._currentEpIndex = index;

  if (user) {
    const rid = window._releaseId;
    const total = window._totalEps || eps.length;
    api('/api/progress', { method: 'POST', body: {
      anime_id: rid, current_episode: ep.position, total_episodes: total,
      title: window._releaseTitle, image: window._releaseImg
    }});
    api('/api/history', { method: 'POST', body: {
      anime_id: rid, episode: ep.position,
      title: window._releaseTitle, image: window._releaseImg
    }});
  }
}

// --- User actions ---
async function toggleFav(id, title, image) {
  if (!user) return;
  const check = await api(`/api/favorites/check/${id}`);
  if (check?.isFavorite) {
    await api(`/api/favorites/${id}`, { method: 'DELETE' });
    toast('Удалено из избранного');
  } else {
    await api('/api/favorites', { method: 'POST', body: { anime_id: id, title, image } });
    toast('Добавлено в избранное');
  }
  navigate('release', { id });
}

async function setStatus(id, status, title, image, totalEps) {
  if (!user) return;
  await api('/api/progress', { method: 'POST', body: { anime_id: id, status, title, image, total_episodes: totalEps } });
  toast('Статус обновлён');
}

async function setScore(id, score, title, image, totalEps) {
  if (!user) return;
  await api('/api/progress', { method: 'POST', body: { anime_id: id, score, title, image, total_episodes: totalEps } });
  const wrap = document.getElementById('userStars5');
  if (wrap) wrap.dataset.vote = score;
  document.querySelectorAll('.rel-star5').forEach((s, i) => {
    s.classList.toggle('on', i < score);
    s.classList.remove('preview');
  });
  document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('on', i < score));
  const lbl = document.getElementById('scoreLbl');
  if (lbl) lbl.textContent = score;
  toast(`Оценка: ${score}/5`);
}

function previewStars5(n) {
  document.querySelectorAll('.rel-star5').forEach((s, i) => {
    s.classList.toggle('on', i < n);
    s.classList.toggle('preview', i < n);
  });
}
function resetStars5() {
  const wrap = document.getElementById('userStars5');
  const n = parseInt(wrap?.dataset.vote || '0');
  document.querySelectorAll('.rel-star5').forEach((s, i) => {
    s.classList.toggle('on', i < n);
    s.classList.remove('preview');
  });
}

function buildFriendsPanel(fd, title) {
  const sections = [];
  if (fd.watching?.length) {
    sections.push({ label: `Друзей, смотрящих сейчас: ${fd.watching.length}`, friends: fd.watching, sub: f => f.episode ? `эп. ${f.episode}` : '' });
  }
  if (fd.watched?.length) {
    sections.push({ label: `Друзей, смотревших раньше: ${fd.watched.length}`, friends: fd.watched, sub: f => f.score ? `★ ${f.score}` : '' });
  }
  if (fd.planned?.length) {
    sections.push({ label: `Друзей, добавивших в планы: ${fd.planned.length}`, friends: fd.planned, sub: () => '' });
  }
  if (!sections.length) return '';
  return `<div class="rel-friends-panel">
    <div class="rel-fp-title">Друзья</div>
    ${sections.map(s => `
      <div class="rel-fp-section">
        <div class="rel-fp-label">${s.label}</div>
        <div class="rel-fp-row">
          ${s.friends.slice(0, 8).map(f => `
            <a class="rel-fp-friend" href="#profile?id=${f.id}" title="${f.name || f.username}${s.sub(f) ? ' — ' + s.sub(f) : ''}">
              ${f.avatar ? `<img src="${f.avatar}">` : `<span class="rel-fp-ph">${(f.name||'?')[0]}</span>`}
            </a>`).join('')}
        </div>
      </div>
    `).join('')}
  </div>`;
}

function pluralVotes(n) {
  const m = n % 10, h = n % 100;
  if (m === 1 && h !== 11) return 'голос';
  if (m >= 2 && m <= 4 && (h < 12 || h > 14)) return 'голоса';
  return 'голосов';
}

function previewStars(n) {
  document.querySelectorAll('.rel-star, .star').forEach((s, i) => {
    s.classList.toggle('on', i < n);
    s.classList.toggle('preview', i < n);
  });
  const lbl = document.getElementById('scoreLbl');
  if (lbl) lbl.textContent = n;
}
function resetStars(n) {
  document.querySelectorAll('.rel-star, .star').forEach((s, i) => {
    s.classList.toggle('on', i < n);
    s.classList.remove('preview');
  });
  const lbl = document.getElementById('scoreLbl');
  if (lbl) lbl.textContent = n || '—';
}

// --- Bookmarks ---
async function renderBookmarks(params = {}) {
  const app = document.getElementById('app');
  if (!user) { app.innerHTML = needAuth(); return; }

  const statusMap = [
    { key: 'watching',  label: 'Смотрю',        icon: 'eye' },
    { key: 'planned',   label: 'Запланировано',  icon: 'clock' },
    { key: 'completed', label: 'Просмотрено',    icon: 'check' },
    { key: 'dropped',   label: 'Брошено',        icon: 'times' },
    { key: 'on_hold',   label: 'Отложено',       icon: 'pause' }
  ];

  const activeTab = params.tab || 'watching';

  let html = '<div class="page-title">Закладки</div>';
  html += `<div class="tabs">${statusMap.map(s =>
    `<div class="tab ${s.key === activeTab ? 'active' : ''}" onclick="navigate('bookmarks',{tab:'${s.key}'})"><i class="fas fa-${s.icon}"></i> ${s.label}</div>`
  ).join('')}</div>`;
  html += `<div id="bookmarksList"><div class="loader"><div class="spinner"></div></div></div>`;
  app.innerHTML = html;

  const container = document.getElementById('bookmarksList');
  const data = await api('/api/progress');
  const all = data?.data || [];
  const list = all.filter(p => p.status === activeTab);

  if (!list.length) {
    container.innerHTML = '<div class="empty"><i class="fas fa-bookmark"></i><p>Список пуст</p></div>';
    return;
  }

  // Convert local progress format to releaseCard-compatible format
  const fakeReleases = list.map(p => ({
    id: p.anime_id, title_ru: p.title, title: p.title,
    poster_url: p.image, image: p.image,
    _localProgress: p
  }));
  container.innerHTML = grid(fakeReleases);
}

// --- Favorites ---
async function renderFavorites() {
  const app = document.getElementById('app');
  if (!user) { app.innerHTML = needAuth(); return; }

  let html = '<div class="page-title">Избранное</div>';
  html += '<div id="favList"><div class="loader"><div class="spinner"></div></div></div>';
  app.innerHTML = html;

  window._favPage = 0;
  window._favLoading = false;

  const data = await api('/api/favorites');
  const favs = (data?.data || []).map(f => ({
    id: f.anime_id, title_ru: f.title, title: f.title, poster_url: f.image, image: f.image
  }));
  const container = document.getElementById('favList');

  if (!favs.length) {
    container.innerHTML = '<div class="empty"><i class="fas fa-heart"></i><p>Список избранного пуст</p></div>';
    return;
  }

  container.innerHTML = grid(favs);
}

// --- History (synced from Anixart) ---
async function renderHistory() {
  const app = document.getElementById('app');
  if (!user) { app.innerHTML = needAuth(); return; }

  let html = '<div class="page-title">История</div>';
  html += '<div id="histList"><div class="loader"><div class="spinner"></div></div></div>';
  app.innerHTML = html;

  window._histPage = 0;
  window._histLoading = false;

  const data = await api('/api/anixart/history/0');
  const list = data?.content || [];
  const container = document.getElementById('histList');

  if (!list.length) {
    // Fallback to local history
    const local = await api('/api/history');
    const localList = local?.data || [];
    if (!localList.length) {
      container.innerHTML = '<div class="empty"><i class="fas fa-history"></i><p>История пуста</p></div>';
      return;
    }
    container.innerHTML = historyList(localList.map(h => ({
      id: h.anime_id, title_ru: h.title, image: h.image,
      _episode: h.episode, _date: h.watched_at
    })));
    return;
  }

  container.innerHTML = historyList(list);

  setupInfiniteScroll(async () => {
    if (window._histLoading) return;
    window._histLoading = true;
    window._histPage++;
    const more = await api(`/api/anixart/history/${window._histPage}`);
    if (more?.content?.length) {
      container.insertAdjacentHTML('beforeend', historyItems(more.content));
    }
    window._histLoading = false;
  });
}

function historyList(list) {
  return `<div class="hist-list">${historyItems(list)}</div>`;
}

function historyItems(list) {
  return list.map(r => {
    const img = posterUrl(r);
    const title = r.title_ru || r.title || '';
    const id = r.id || r.releaseId || 0;
    const ep = r._episode || r.last_view_episode || '';
    const ts = r._date || r.last_view_timestamp;
    const date = ts ? new Date(typeof ts === 'number' ? ts * 1000 : ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="hist-item" onclick="navigate('release',{id:${id}})">
      <img class="hist-img" src="${img}" loading="lazy">
      <div class="hist-info">
        <div class="hist-title">${title}</div>
        <div class="hist-sub">${ep ? 'Эпизод ' + ep + ' \u2022 ' : ''}${date}</div>
      </div>
    </div>`;
  }).join('');
}

// --- Stats ---
async function renderStats() {
  const app = document.getElementById('app');
  if (!user) { app.innerHTML = needAuth(); return; }

  app.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  const profileData = await api('/api/anixart/profile');
  const p = profileData?.profile;

  if (!p) { app.innerHTML = '<div class="empty"><p>Ошибка загрузки профиля</p></div>'; return; }

  const hrs = Math.floor((p.watched_time || 0) / 3600);
  const mins = Math.floor(((p.watched_time || 0) % 3600) / 60);
  const totalAnime = (p.watching_count || 0) + (p.completed_count || 0) + (p.plan_count || 0) + (p.dropped_count || 0) + (p.hold_on_count || 0);
  const total = totalAnime || 1;

  const dist = [
    { status: 'Смотрю', count: p.watching_count || 0, color: '#4CAF50' },
    { status: 'Просмотрено', count: p.completed_count || 0, color: '#2196F3' },
    { status: 'Запланировано', count: p.plan_count || 0, color: '#FF9800' },
    { status: 'Брошено', count: p.dropped_count || 0, color: '#f44336' },
    { status: 'Отложено', count: p.hold_on_count || 0, color: '#9C27B0' }
  ];

  let html = `
    <div class="page-title">Статистика</div>
    <div class="stat-row">
      <div class="stat-card"><div class="stat-num">${totalAnime}</div><div class="stat-label">Всего аниме</div></div>
      <div class="stat-card"><div class="stat-num">${p.watched_episode_count || 0}</div><div class="stat-label">Эпизодов</div></div>
      <div class="stat-card"><div class="stat-num" style="color:#ffd54f">${hrs}ч ${mins}м</div><div class="stat-label">Время просмотра</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--orange)">\u2605 ${p.rating_score || '\u2014'}</div><div class="stat-label">Рейтинг</div></div>
      <div class="stat-card"><div class="stat-num" style="color:#e91e63">${p.favorite_count || 0}</div><div class="stat-label">Избранное</div></div>
      <div class="stat-card"><div class="stat-num">${p.comment_count || 0}</div><div class="stat-label">Комментариев</div></div>
    </div>

    <div class="section">
      <div class="section-title" style="margin-bottom:8px">Распределение</div>
      <div class="stat-bar">
        ${dist.map(d => {
          const pct = d.count / total * 100;
          return pct > 0 ? `<div class="stat-seg" style="width:${pct}%;background:${d.color}" title="${d.status}: ${d.count}"></div>` : '';
        }).join('')}
      </div>
      <div class="stat-legend">
        ${dist.map(d =>
          `<div class="stat-legend-item"><div class="stat-dot" style="background:${d.color}"></div>${d.status}: ${d.count}</div>`
        ).join('')}
      </div>
    </div>

    ${p.watch_dynamics?.length ? `
    <div class="section">
      <div class="section-title" style="margin-bottom:8px">Динамика просмотров</div>
      <div class="chart-container">
        <div class="chart">${p.watch_dynamics.map(d => {
          const max = Math.max(...p.watch_dynamics.map(x => x.count || x), 1);
          const val = d.count || d;
          const pct = val / max * 100;
          return `<div class="chart-bar" style="height:${Math.max(pct, 3)}%" title="${val}"></div>`;
        }).join('')}</div>
      </div>
    </div>` : ''}

    ${p.preferred_genres?.length ? `
    <div class="section">
      <div class="section-title" style="margin-bottom:8px">Любимые жанры</div>
      <div class="genre-list">${p.preferred_genres.map(g => `<span class="genre-badge">${g.name || g}</span>`).join('')}</div>
    </div>` : ''}
  `;

  app.innerHTML = html;
}

// --- Profile ---
async function renderProfile(profileId) {
  const app = document.getElementById('app');
  const uid = profileId ? parseInt(profileId) : user?.id;
  const isOwn = user && uid === user.id;
  if (!uid) { app.innerHTML = loginForm(); return; }

  const [profileData, xpData, achData, lbData, equippedData, friendsData, friendStatus] = await Promise.all([
    api(`/api/profile/${uid}`),
    isOwn ? api('/api/me/xp') : null,
    isOwn ? api('/api/me/achievements') : api(`/api/user/${uid}/achievements`),
    api('/api/leaderboard'),
    api(`/api/shop/equipped/${uid}`),
    api(`/api/friends/${uid}`),
    user && !isOwn ? api(`/api/friends/status/${uid}`) : null
  ]);
  if (profileData?.error || !profileData?.user) { app.innerHTML = '<div class="empty"><p>Профиль не найден</p></div>'; return; }

  let xp = xpData || { xp: 0, level: 1, progress: 0, next_level_xp: 100 };
  if (!isOwn) {
    const found = lbData?.leaderboard?.find(u => u.user_id === uid);
    if (found) xp = { xp: found.xp, level: found.level, progress: 0, next_level_xp: Math.pow(found.level, 2) * 100 };
  }
  const lbRank = lbData?.leaderboard?.findIndex(u => u.user_id === uid);

  window._currentProfileId = uid;
  app.innerHTML = renderProfileCard(profileData, xp, achData, isOwn, lbRank >= 0 ? lbRank + 1 : null, equippedData, friendsData, friendStatus);
  initDonutHover();
  loadProfileComments(uid);
}

function formatLastSeen(isoDate) {
  if (!isoDate) return { text: 'Оффлайн', online: false, color: '#898989' };
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 5) return { text: 'В сети', online: true, color: '#e2b93b' };
  if (mins < 60) return { text: `${mins} мин. назад`, online: false, color: '#898989' };
  if (hours < 24) return { text: `${hours} ч. назад`, online: false, color: '#898989' };
  if (days < 30) return { text: `${days} дн. назад`, online: false, color: '#898989' };
  return { text: 'Давно не в сети', online: false, color: '#555' };
}

const ANIMELIST_STATUSES = [
  { key: 'watching', label: 'Смотрю', color: '#4CAF50' },
  { key: 'completed', label: 'Просмотрено', color: '#66c0f4' },
  { key: 'planned', label: 'В планах', color: '#e91e9c' },
  { key: 'on_hold', label: 'Отложено', color: '#FF9800' },
  { key: 'dropped', label: 'Брошено', color: '#f44336' }
];

async function renderAnimeList(params = {}) {
  const app = document.getElementById('app');
  const uid = params.uid || (user && user.id);
  const status = params.status || '';

  const url = '/api/user/' + uid + '/animelist' + (status ? '?status=' + status : '');
  const data = await api(url);
  const items = data?.items || [];

  const tabs = '<span class="al-tab' + (!status ? ' active' : '') + '" style="--tab-color:var(--accent)" onclick="navigate(\'animelist\',{uid:' + uid + '})">Все</span>' +
    ANIMELIST_STATUSES.map(s =>
      '<span class="al-tab' + (s.key === status ? ' active' : '') + '" style="--tab-color:' + s.color + '" onclick="navigate(\'animelist\',{uid:' + uid + ',status:\'' + s.key + '\'})">' + s.label + '</span>'
    ).join('');

  let cardsHtml = '';
  if (items.length) {
    cardsHtml = '<div class="al-grid">' + items.map(function(p) {
      const stars = p.score ? '★'.repeat(p.score) + '☆'.repeat(Math.max(0, 5 - p.score)) : '';
      const eps = p.current_episode ? (p.current_episode + (p.total_episodes ? '/' + p.total_episodes : '') + ' эп.') : '';
      return '<div class="al-card" onclick="navigate(\'release\',{id:\'' + p.anime_id + '\'})">' +
        '<div class="al-poster"><img src="' + (p.image || '') + '" onerror="this.style.background=\'var(--bg-elevated)\'" loading="lazy"></div>' +
        '<div class="al-info">' +
          '<div class="al-title">' + (p.title || 'Без названия') + '</div>' +
          (stars ? '<div class="al-stars"><span class="sp-stars">' + stars + '</span></div>' : '') +
          (eps ? '<div class="al-eps">' + eps + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  } else {
    cardsHtml = '<div class="empty"><i class="fas fa-box-open"></i><p>Пусто</p></div>';
  }

  app.innerHTML = '<div class="page-title">Список аниме</div>' +
    '<div class="al-tabs">' + tabs + '</div>' +
    '<div class="al-count">' + items.length + ' шт.</div>' +
    cardsHtml;
}

function buildProfileStatsTab(ws, totalHours) {
  const bars = [
    { label: 'Смотрю', key: 'watching', count: ws.watching || 0, color: '#4CAF50' },
    { label: 'В планах', key: 'planned', count: ws.planned || 0, color: '#e91e9c' },
    { label: 'Просмотрено', key: 'completed', count: ws.completed || 0, color: '#66c0f4' },
    { label: 'Отложено', key: 'on_hold', count: ws.onHold || 0, color: '#FF9800' },
    { label: 'Брошено', key: 'dropped', count: ws.dropped || 0, color: '#f44336' }
  ];
  const total = bars.reduce((s, b) => s + b.count, 0) || 1;

  // SVG donut with hover segments
  var R = 52, CX = 65, CY = 65, SW = 24;
  var C = 2 * Math.PI * R;
  var offset = 0;
  var GAP = 2;
  var active = bars.filter(b => b.count > 0);
  var segmentsHtml = '';
  active.forEach(function(b) {
    var pct = b.count / total;
    var arcLen = pct * C - GAP;
    if (arcLen < 0) arcLen = 0;
    var pctText = Math.round(pct * 100) + '%';
    segmentsHtml += '<circle class="sp-donut-seg" cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="none" stroke="' + b.color + '" stroke-width="' + SW + '" stroke-dasharray="' + arcLen + ' ' + (C - arcLen) + '" stroke-dashoffset="' + (-offset) + '" data-label="' + b.label + '" data-pct="' + pctText + '" data-color="' + b.color + '" data-status="' + b.key + '"/>';
    offset += pct * C;
  });
  if (!active.length) {
    segmentsHtml = '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="' + SW + '"/>';
  }
  var svgDonut = '<div class="sp-donut-wrap">' +
    '<svg class="sp-donut-svg" viewBox="0 0 130 130">' + segmentsHtml + '</svg>' +
    '<div class="sp-donut-tooltip"></div>' +
  '</div>';

  var listHtml = bars.map(function(b) {
    return '<div class="sp-stats-row"><span class="sp-animestats-dot" style="background:' + b.color + '"></span>' + b.label + '  <strong>' + b.count + '</strong></div>';
  }).join('');
  var days = Math.floor(totalHours / 24);
  var hrs = Math.round(totalHours % 24);

  return '<div class="sp-tab-pane" data-pane="pstats">' +
    '<div class="sp-stats-layout">' +
      '<div class="sp-stats-list">' + listHtml + '</div>' +
      svgDonut +
    '</div>' +
    '<div class="sp-stats-bottom">' +
      '<div>Просмотрено серий: <strong>' + ws.totalEpisodes + '</strong></div>' +
      '<div>Время просмотра: <strong>~ ' + days + ' дн. ' + hrs + ' ч.</strong></div>' +
      (ws.avgScore ? '<div>Средняя оценка: <strong style="color:#e2b93b">' + ws.avgScore + '</strong></div>' : '') +
    '</div>' +
  '</div>';
}

function initDonutHover() {
  var wrap = document.querySelector('.sp-donut-wrap');
  if (!wrap) return;
  var tooltip = wrap.querySelector('.sp-donut-tooltip');
  var segs = wrap.querySelectorAll('.sp-donut-seg');
  segs.forEach(function(seg) {
    seg.addEventListener('mouseenter', function() {
      tooltip.innerHTML = '<span style="color:' + seg.dataset.color + '">\u25CF</span> ' + seg.dataset.label + ': <strong>' + seg.dataset.pct + '</strong>';
      tooltip.style.opacity = '1';
      seg.style.filter = 'brightness(1.4)';
      seg.style.transition = 'filter .2s';
    });
    seg.addEventListener('mouseleave', function() {
      tooltip.style.opacity = '0';
      seg.style.filter = '';
    });
    seg.addEventListener('click', function() {
      var uid = window._currentProfileId || (window._user && window._user.id);
      navigate('animelist', { uid: uid, status: seg.dataset.status });
    });
  });
}

function renderProfileCard(data, xp, achData, isOwn, lbRank, equipped, friendsData, friendStatus) {
  if (!data || !data.user) return '<div class="empty"><p>Профиль не найден</p></div>';
  const u = data.user;
  const p = data.profile || {};
  const s = data.stats || {};
  const recentSaves = data.recentSaves || [];
  const cs = data.creatorStats;
  const ratedReleases = data.ratedReleases || [];
  const userReviews = data.userReviews || [];
  const achievements = achData?.achievements || [];
  const earned = achievements.filter(a => a.earned);
  const rareAch = earned.slice(-4);

  const userRoles = u.roles || [u.role];
  const isCreator = userRoles.includes('creator') || u.role === 'creator' || (p.is_creator && p.creator_verified);
  const lvl = xp.level || 1;
  const lc = lvl >= 50 ? '#ffd700' : lvl >= 25 ? '#ff5722' : lvl >= 10 ? '#9c27b0' : lvl >= 5 ? '#2196f3' : '#4caf50';
  const regDate = u.created_at ? new Date(u.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const social = p.social_links || {};

  // Level title like Steam
  const lvlTitle = lvl >= 50 ? 'Легенда' : lvl >= 25 ? 'Ветеран' : lvl >= 10 ? 'Опытный' : lvl >= 5 ? 'Активный' : lvl >= 2 ? 'Новичок' : 'Начинающий';

  // Steam-style years badge
  const created = u.created_at ? new Date(u.created_at) : new Date();
  const days = Math.floor((Date.now() - created.getTime()) / 86400000);
  const yearsBadge = days >= 365 ? Math.floor(days / 365) + ' г.' : days + ' дн.';

  const eqFrameRaw = equipped?.frame?.css || null;
  const eqFrame = eqFrameRaw;
  const eqFrameIsImg = eqFrameRaw && /\.(png|jpg|gif|webp)$/i.test(eqFrameRaw);
  const eqFrameIsVideo = eqFrameRaw && /\.(webm|mp4)$/i.test(eqFrameRaw);
  const eqBgRaw = equipped?.background?.css || null;
  const eqBg = eqBgRaw;
  const eqBgIsVideo = eqBgRaw && /\.(webm|mp4)$/i.test(eqBgRaw);
  const eqAvaRaw = equipped?.avatar?.css || null;
  const eqAva = eqAvaRaw;
  const eqAvaIsVideo = eqAvaRaw && /\.(webm|mp4)$/i.test(eqAvaRaw);

  // Real activity chart data from watchStats
  const ws = data.watchStats || { totalSeconds: 0, totalEpisodes: 0, dailyTime: [] };
  const dailyMap = {};
  (ws.dailyTime || []).forEach(d => { dailyMap[d.date] = d.total; });
  const actDays = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0,10);
    const sec = dailyMap[key] || 0;
    actDays.push({ day: d.toLocaleDateString('ru',{day:'numeric',month:'short'}), hours: +(sec/3600).toFixed(1) });
  }
  const maxH = Math.max(...actDays.map(d=>d.hours), 0.1);
  const totalHours = +(ws.totalSeconds / 3600).toFixed(1);
  const twoWeekHours = +actDays.reduce((s,d)=>s+d.hours,0).toFixed(1);

  // Online status
  const status = isOwn ? { text: 'В сети', online: true, color: '#e2b93b' } : formatLastSeen(u.last_seen);
  const watching = u.watching_now;
  const watchingStatus = watching && status.online ? `Смотрит: ${watching}` : null;

  const bgLayer = eqBgIsVideo
    ? `<video class="sp-bg-media" src="${eqBg}" autoplay loop muted playsinline></video>`
    : eqBg && /^https?:/i.test(eqBg)
      ? `<img class="sp-bg-media" src="${eqBg}" referrerpolicy="no-referrer">`
      : eqBg
        ? `<div class="sp-bg-media" style="background:${eqBg}"></div>`
        : '';
  return `
    <div class="sp">
      ${bgLayer}
      <div class="sp-inner">
      <!-- === HEADER BANNER === -->
      <div class="sp-header" style="--hue:${(lvl * 37) % 360}">
        <div class="sp-header-bg"></div>
        <div class="sp-header-content">
          <div class="sp-ava-wrap" style="--lc:${eqFrame ? 'transparent' : lc}">
            ${eqFrameIsVideo
              ? `<video class="sp-ava-frame-img" src="${eqFrame}" autoplay loop muted playsinline crossorigin="anonymous"></video>`
              : eqFrameIsImg
                ? `<img class="sp-ava-frame-img" src="${eqFrame}" referrerpolicy="no-referrer">`
                : `<div class="sp-ava-frame" ${eqFrame ? `style="background:${eqFrame}"` : ''}></div>`
            }
            ${eqAvaIsVideo
              ? `<video class="sp-ava" src="${eqAva}" autoplay loop muted playsinline></video>`
              : eqAva
                ? `<img class="sp-ava" src="${eqAva}" referrerpolicy="no-referrer">`
                : u.avatar ? `<img class="sp-ava" src="${u.avatar}">` :
                  `<div class="sp-ava sp-ava-letter">${(u.name||u.username||'?')[0].toUpperCase()}</div>`}
          </div>
          <div class="sp-header-info">
            <div class="sp-name">
              ${u.name || u.username}
              ${isCreator ? '<i class="fas fa-check-circle sp-badge-v"></i>' : ''}
            </div>
            ${p.bio ? `<div class="sp-bio">${p.bio}</div>` : `<div class="sp-bio" style="opacity:.4"><i class="fas fa-info-circle"></i> Информация отсутствует.</div>`}
            <div class="sp-status">
              <span class="sp-online-dot" style="background:${status.online ? '#e2b93b' : '#898989'}"></span>
              <span style="color:${status.online ? '#e2b93b' : '#898989'}">${watchingStatus || status.text}</span>
            </div>
            ${watchingStatus ? `<div class="sp-status" style="margin-top:2px"><span style="color:#898989;font-size:12px">В сети</span></div>` : ''}
            <div class="sp-roles">
              ${(u.roles || [u.role]).map(r => {
                if (r === 'owner') return '<span class="sp-role-badge sp-role-owner">Овнер</span>';
                if (r === 'admin') return '<span class="sp-role-badge sp-role-admin">Админ</span>';
                if (r === 'moderator') return '<span class="sp-role-badge sp-role-moderator">Модератор</span>';
                if (r === 'creator') return '<span class="sp-role-badge sp-role-creator">Озвучкер</span>';
                return '';
              }).join('')}
            </div>
          </div>
          <div class="sp-header-right">
            <div class="sp-header-level">Уровень <span class="sp-level-num" style="border-color:${lc};color:${lc}">${lvl}</span></div>
          </div>
        </div>
        <!-- edit button is in sidebar -->
      </div>

      <!-- === TWO COLUMNS === -->
      <div class="sp-columns">
        <!-- LEFT COLUMN -->
        <div class="sp-left">
          <!-- Коллекционер аниме -->
          <div class="sp-showcase">
            <div class="sp-showcase-head"><span>Коллекционер аниме</span></div>
            <div class="sp-collector">
              <div class="sp-collector-stat">
                <div class="sp-collector-num">${s.saves || 0}</div>
                <div class="sp-collector-lbl">Сохранено</div>
              </div>
              <div class="sp-collector-stat">
                <div class="sp-collector-num">${s.wishes || 0}</div>
                <div class="sp-collector-lbl">В вишлисте</div>
              </div>
              <div class="sp-collector-stat">
                <div class="sp-collector-num">${s.comments || 0}</div>
                <div class="sp-collector-lbl">Комментариев</div>
              </div>
              <div class="sp-collector-stat">
                <div class="sp-collector-num">${earned.length}</div>
                <div class="sp-collector-lbl">Достижений</div>
              </div>
            </div>
          </div>

          <!-- Статистика с табами как в Anixart -->
          <div class="sp-showcase">
            <div class="sp-tabs" id="profileStatsTabs">
              <div class="sp-tab active" data-tab="pstats" onclick="switchProfileTab('pstats')"><i class="fas fa-chart-bar"></i> Статистика</div>
              <div class="sp-tab" data-tab="pratings" onclick="switchProfileTab('pratings')"><i class="fas fa-star"></i> Оценки</div>
              <div class="sp-tab" data-tab="previews" onclick="switchProfileTab('previews')"><i class="fas fa-comment-alt"></i> Обзоры</div>
              <div class="sp-tab" data-tab="pmanga" onclick="switchProfileTab('pmanga')"><i class="fas fa-book"></i> Манга</div>
            </div>
            <div class="sp-tab-content" id="profileTabContent">
              ${buildProfileStatsTab(ws, totalHours)}
              <div class="sp-tab-pane" data-pane="pratings" style="display:none">
                ${ratedReleases.length ? ratedReleases.map(r => {
                  const stars = '★'.repeat(r.score) + '☆'.repeat(Math.max(0, 5 - r.score));
                  const date = r.updated_at ? new Date(r.updated_at).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                  return `<div class="sp-rating-row" onclick="navigate('release',{id:'${r.anime_id}'})">
                    <div class="sp-rating-img">${r.image ? `<img src="${r.image}">` : ''}</div>
                    <div class="sp-rating-info">
                      <div class="sp-rating-title">${r.title || 'Без названия'}</div>
                      <div class="sp-rating-stars"><span class="sp-stars">${stars}</span> • ${date}</div>
                    </div>
                  </div>`;
                }).join('') : '<div class="sp-tab-empty">Нет оценок</div>'}
              </div>
              <div class="sp-tab-pane" data-pane="previews" style="display:none">
                ${userReviews.length ? userReviews.map(r => {
                  const date = r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : '';
                  const recIcon = r.recommend ? '<i class="fas fa-thumbs-up"></i>' : '<i class="fas fa-thumbs-down"></i>';
                  const recText = r.recommend ? 'рекомендует' : 'не рекомендует';
                  const recClass = r.recommend ? 'rv-rec-pos' : 'rv-rec-neg';
                  const rx = r.reactions || {};
                  return `<div class="rv-card">
                    <div class="rv-card-source" onclick="navigate('release',{id:'${r.release_id}'})">Оставлено под: <span>${r.release_title || ''}</span></div>
                    <div class="rv-card-right" style="width:100%">
                      <div class="rv-card-rec ${recClass}">${recIcon} <span>${recText}</span></div>
                      <div class="rv-card-date">ОПУБЛИКОВАН: ${date}</div>
                      ${r.spoiler ? '<div class="rv-spoiler-wrap"><div class="rv-spoiler-warn" onclick="this.parentElement.classList.add(\'rv-revealed\')"><i class="fas fa-eye-slash"></i> Обзор содержит спойлеры — нажмите, чтобы показать</div><div class="rv-spoiler-text">' + (r.text||'').replace(/</g,'&lt;').replace(/\\n/g,'<br>') + '</div></div>' : '<div class="rv-card-text">' + (r.text||'').replace(/</g,'&lt;').replace(/\\n/g,'<br>') + '</div>'}
                      ${(rx.yes || rx.no || rx.funny) ? `<div class="rv-card-helpful">
                        ${rx.yes ? '<span class="rv-react"><i class="fas fa-thumbs-up"></i> ' + rx.yes + '</span>' : ''}
                        ${rx.no ? '<span class="rv-react"><i class="fas fa-thumbs-down"></i> ' + rx.no + '</span>' : ''}
                        ${rx.funny ? '<span class="rv-react"><i class="fas fa-laugh"></i> ' + rx.funny + '</span>' : ''}
                      </div>` : ''}
                    </div>
                  </div>`;
                }).join('') : '<div class="sp-tab-empty">Нет обзоров</div>'}
              </div>
              <div class="sp-tab-pane" data-pane="pmanga" style="display:none">
                <div class="sp-tab-empty">Статистика манги скоро появится</div>
              </div>
            </div>
          </div>

          <!-- Любимые аниме -->
          ${recentSaves.length ? `
          <div class="sp-showcase">
            <div class="sp-showcase-head">
              <span>Избранное</span>
              <span class="sp-showcase-count" onclick="navigate('saved')">${s.saves || 0} всего</span>
            </div>
            <div class="sp-favorites-row">
              ${recentSaves.map(v => `
                <div class="sp-fav-card" onclick="navigate('manga-player',{id:${v.id}})">
                  <img src="${v.thumbnail || ''}" onerror="this.style.background='var(--bg-elevated)'">
                  <div class="sp-fav-title">${v.manga_title || v.title}</div>
                </div>
              `).join('')}
            </div>
          </div>` : ''}

          <!-- Витрина достижений -->
          <div class="sp-showcase">
            <div class="sp-showcase-head">
              <span>Витрина редчайших достижений</span>
              <span class="sp-showcase-count" onclick="navigate('achievements')">${earned.length} из ${achievements.length}</span>
            </div>
            ${rareAch.length ? `<div class="sp-ach-grid" style="--ach-border:${status.online ? (watching ? 'rgba(226,185,59,.6)' : 'rgba(226,185,59,.35)') : 'rgba(120,120,120,.25)'}">
              ${rareAch.map(a => `
                <div class="sp-ach-card">
                  <div class="sp-ach-ico" style="--ac:${lc}"><i class="fas ${a.icon}"></i></div>
                  <div class="sp-ach-name">${a.name}</div>
                  <div class="sp-ach-desc">${a.desc}</div>
                </div>
              `).join('')}
              ${earned.length > 4 ? `<div class="sp-ach-card sp-ach-more">+${earned.length - 4}</div>` : ''}
            </div>` : `<div class="sp-showcase-empty">Пока нет достижений</div>`}
          </div>

          <!-- Активность по дням (столбики часов) -->
          <div class="sp-showcase">
            <div class="sp-showcase-head">
              <span>Статистика активности</span>
              <span class="sp-showcase-right">${twoWeekHours} ч. за последние 2 недели</span>
            </div>
            <div class="sp-chart-wrap">
              <div class="sp-chart-bars">
                ${actDays.map(d => `
                  <div class="sp-chart-col" title="${d.day}: ${d.hours} ч.">
                    <div class="sp-chart-bar" style="height:${Math.max(d.hours/maxH*100, 3)}%"></div>
                    <div class="sp-chart-day">${d.day.split(' ')[0]}</div>
                  </div>
                `).join('')}
              </div>
              <div class="sp-chart-label">часов в день</div>
            </div>
          </div>

          <!-- Недавняя активность -->
          ${recentSaves.length ? `
          <div class="sp-showcase">
            <div class="sp-showcase-head">
              <span>Недавняя активность</span>
            </div>
            <div class="sp-activity-steam">
              ${recentSaves.slice(0,3).map(v => `
                <div class="sp-act-card" onclick="navigate('manga-player',{id:${v.id}})">
                  <img class="sp-act-cover" src="${v.thumbnail || ''}" onerror="this.style.background='var(--bg-elevated)'">
                  <div class="sp-act-details">
                    <div class="sp-act-name">${v.manga_title || v.title}</div>
                    <div class="sp-act-hours">${totalHours} ч. всего</div>
                    <div class="sp-act-last">последний просмотр: ${new Date().toLocaleDateString('ru',{day:'numeric',month:'short'})}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>` : ''}

          <!-- Комментарии на профиле -->
          <div class="sp-showcase">
            <div class="sp-showcase-head"><span>Комментарии</span></div>
            <div class="sp-comments">
              <div class="sp-comment-form">
                <div class="sp-cf-ava">
                  ${user?.avatar ? `<img src="${user.avatar}">` : `<span>${(user?.name||'?')[0]}</span>`}
                </div>
                <textarea class="sp-comment-input" id="profileCommentInput" placeholder="Оставить комментарий..." rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();postProfileComment()}"></textarea>
              </div>
              <div id="profileComments">
                <div class="sp-comments-empty">Пока нет комментариев</div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div class="sp-right">
          <!-- XP Badge -->
          <div class="sp-sidebar-badge" style="border-color:${lc}">
            <div class="sp-sidebar-badge-icon" style="background:${lc}"><i class="fas fa-star"></i></div>
            <div class="sp-sidebar-badge-info">
              <div class="sp-sidebar-badge-name">${lvlTitle}</div>
              <div class="sp-sidebar-badge-xp">${xp.xp} ед. опыта</div>
            </div>
          </div>

          ${isOwn ? `<div class="sp-sidebar-btn sp-edit-btn" onclick="navigate('edit-profile')">Редактировать профиль</div>` : ''}

          <!-- Значки -->
          <div class="sp-sidebar-section">
            <div class="sp-sidebar-section-head">
              <span>Значки</span>
              <span class="sp-sidebar-section-count">${earned.length}</span>
            </div>
            ${rareAch.length ? `<div class="sp-sidebar-badges-row">
              ${rareAch.slice(0, 4).map(a => `
                <div class="sp-sidebar-mini-badge" style="background:${lc}" title="${a.name}">
                  <i class="fas ${a.icon}"></i>
                </div>
              `).join('')}
            </div>` : ''}
          </div>

          <!-- Quick links -->
          <div class="sp-sidebar-link" onclick="navigate('saved')"><span class="sp-sl-name">Аниме</span> <span class="sp-sl-count">${s.saves || 0}</span></div>
          <div class="sp-sidebar-link" onclick="navigate('inventory')"><span class="sp-sl-name">Инвентарь</span></div>
          <div class="sp-sidebar-link" onclick="navigate('wishlist')"><span class="sp-sl-name">Вишлист</span> <span class="sp-sl-count">${s.wishes || 0}</span></div>
          <div class="sp-sidebar-link" onclick="navigate('achievements')"><span class="sp-sl-name">Достижения</span> <span class="sp-sl-count">${earned.length}</span></div>
          <div class="sp-sidebar-link" onclick="navigate('history')"><span class="sp-sl-name">История</span></div>

          <!-- Friends -->
          <div class="sp-sidebar-section" style="margin-top:8px">
            <div class="sp-sidebar-section-head">
              <span>Друзья</span>
              <span class="sp-sidebar-section-count">${(friendsData?.friends||[]).length}</span>
            </div>
            ${(friendsData?.friends||[]).length ? `
              <div class="sp-friends-grid">
                ${[...(friendsData.friends)].sort((a,b)=>(b.level||0)-(a.level||0)).slice(0,5).map(f => {
                  const flvl = f.level||1;
                  const flc = flvl >= 50 ? '#ffd700' : flvl >= 25 ? '#ff5722' : flvl >= 10 ? '#9c27b0' : flvl >= 5 ? '#2196f3' : '#4caf50';
                  const fs = formatLastSeen(f.last_seen);
                  const fwatch = f.watching_now;
                  let statusLine = fs.online ? 'В сети' : `В сети: ${fs.text}`;
                  let statusColor = fs.online ? '#e2b93b' : '#898989';
                  if (fwatch && fs.online) { statusLine = `Смотрит: ${fwatch}`; statusColor = '#e2b93b'; }
                  const avaBorder = fs.online ? '#e2b93b' : '#898989';
                  return `<div class="sp-friend-card" onclick="navigate('profile',{id:'${f.id}'})" oncontextmenu="showFriendCtx(event,'${f.id}','${(f.name||'').replace(/'/g,"\\'")}',true)">
                    <div class="sp-friend-ava" style="--fav-border:${avaBorder}">
                      ${f.avatar ? `<img src="${f.avatar}">` : `<span>${(f.name||'?')[0]}</span>`}
                    </div>
                    <div class="sp-friend-info">
                      <div class="sp-friend-name">${f.name||f.username}</div>
                      <div class="sp-friend-status" style="color:${statusColor}">${statusLine}</div>
                    </div>
                    <div class="sp-friend-lvl" style="border-color:${flc};color:${flc}">${flvl}</div>
                  </div>`;
                }).join('')}
              </div>
              ${(friendsData.friends).length > 5 ? `<div class="sp-friends-more" onclick="navigate('friends')">Показать всех (${friendsData.friends.length})</div>` : ''}
            ` : `<div class="sp-sidebar-friends-empty">Список друзей пуст</div>`}
          </div>

          <!-- Social -->
          ${social.youtube || social.telegram || social.vk || social.boosty ? `
          <div class="sp-sidebar-section" style="margin-top:8px">
            <div class="sp-sidebar-section-head"><span>Ссылки</span></div>
            <div class="sp-sidebar-social">
              ${social.youtube ? `<a href="${social.youtube}" target="_blank"><i class="fab fa-youtube" style="color:#ff0000"></i></a>` : ''}
              ${social.telegram ? `<a href="https://t.me/${social.telegram.replace('@','')}" target="_blank"><i class="fab fa-telegram" style="color:#0088cc"></i></a>` : ''}
              ${social.vk ? `<a href="${social.vk}" target="_blank"><i class="fab fa-vk" style="color:#4a76a8"></i></a>` : ''}
              ${social.boosty ? `<a href="${social.boosty}" target="_blank"><i class="fas fa-heart" style="color:#f15f2c"></i></a>` : ''}
            </div>
          </div>` : ''}
        </div>
      </div>
      </div>
    </div>
  `;
}

async function addFriend(userId) {
  await api(`/api/anixart/friend/add/${userId}`, { method: 'POST' });
  toast('Запрос в друзья отправлен');
}

// --- Friends ---
async function renderFriends() {
  const app = document.getElementById('app');
  if (!user) { app.innerHTML = loginForm(); return; }

  const tab = window._friendsTab || 'friends';
  const inData = await api('/api/friends/requests/incoming');
  const inCount = (inData?.requests || []).length;

  const sideItem = (key, icon, label, badge) => `
    <div class="fr-side-item ${tab===key?'fr-side-active':''}" onclick="window._friendsTab='${key}';renderFriends()">
      <i class="fas fa-${icon}"></i> ${label}
      ${badge ? `<span class="fr-side-badge">${badge}</span>` : ''}
    </div>`;

  app.innerHTML = `
    <div class="fr-page">
      <div class="fr-header-bar">
        <div class="fr-header-ava">${user.avatar ? `<img src="${user.avatar}">` : `<span>${(user.name||'?')[0]}</span>`}</div>
        <div class="fr-header-name">${user.name || user.username}</div>
      </div>
      <div class="fr-layout">
        <div class="fr-sidebar">
          <div class="fr-side-title">ДРУЗЬЯ</div>
          ${sideItem('friends','users','Ваши друзья', '')}
          ${sideItem('add','user-plus','Добавить в друзья', '')}
          ${sideItem('incoming','envelope','Приглашения', inCount||'')}
          ${sideItem('outgoing','paper-plane','Исходящие', '')}
          <div class="fr-side-sep"></div>
          <div class="fr-side-title">ВАША ССЫЛКА</div>
          <div class="fr-side-code" id="frMyCode">загрузка...</div>
        </div>
        <div class="fr-main">
          <div class="fr-main-header" id="frMainHeader"></div>
          <div id="frList"><div class="loader"><div class="spinner"></div></div></div>
        </div>
      </div>
    </div>`;

  // Load friend code
  api('/api/friends/mycode').then(d => {
    const el = document.getElementById('frMyCode');
    if (el && d?.code) {
      el.innerHTML = `<div style="font-size:11px;color:var(--text-sec);margin-bottom:4px">Ваш код друга:</div>
        <div style="font-size:14px;font-weight:700;color:var(--accent);cursor:pointer" onclick="navigator.clipboard.writeText('${d.code}');toast('Код скопирован!')">${d.code} <i class="fas fa-copy" style="font-size:11px;opacity:.6"></i></div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px;word-break:break-all;cursor:pointer" onclick="navigator.clipboard.writeText('${d.url}');toast('Ссылка скопирована!')">${d.url} <i class="fas fa-copy" style="font-size:9px;opacity:.5"></i></div>`;
    }
  });

  const container = document.getElementById('frList');
  const header = document.getElementById('frMainHeader');

  if (tab === 'friends') {
    const data = await api(`/api/friends/${user.id}`);
    const friends = (data?.friends || data || []);
    const sorted = [...friends].sort((a,b)=>(b.level||0)-(a.level||0));
    header.innerHTML = `<div class="fr-main-title">ВАШИ ДРУЗЬЯ <span style="color:var(--text-dim)">${sorted.length}</span></div>
      <div class="fr-search-box"><i class="fas fa-search"></i><input type="text" placeholder="Поиск друзей по имени..." oninput="filterFriendsList(this.value)"></div>`;
    if (!sorted.length) {
      container.innerHTML = '<div class="empty"><i class="fas fa-users"></i><p>Друзей пока нет</p></div>';
      return;
    }
    window._friendsList = sorted;
    renderFriendCards(sorted, container);
  } else if (tab === 'add') {
    header.innerHTML = `<div class="fr-main-title">ДОБАВИТЬ В ДРУЗЬЯ</div>`;
    const codeData = await api('/api/friends/mycode');
    const myUrl = codeData?.url || '';
    const myCode = codeData?.code || '';
    container.innerHTML = `
      <div class="fr-add-section">
        <div class="fr-add-invite">
          <div class="fr-add-heading">Ваша ссылка-приглашение</div>
          <div class="fr-add-note">Поделитесь этой ссылкой с другом, чтобы он мог добавить вас.</div>
          <div class="fr-invite-box">
            <input type="text" readonly value="${myUrl}" id="frInviteUrl">
            <button onclick="navigator.clipboard.writeText(document.getElementById('frInviteUrl').value);toast('Ссылка скопирована!')"><i class="fas fa-copy"></i> Копировать</button>
          </div>
          <div class="fr-add-note" style="margin-top:6px">Код друга: <strong style="color:var(--accent)">${myCode}</strong>
            <i class="fas fa-copy" style="cursor:pointer;opacity:.5;margin-left:4px" onclick="navigator.clipboard.writeText('${myCode}');toast('Код скопирован!')"></i>
          </div>
        </div>
        <div class="fr-add-sep">Или попробуйте найти своего друга</div>
        <div class="fr-add-heading">Введите имя профиля друга</div>
        <div class="fr-search-box fr-search-big"><i class="fas fa-search"></i>
          <input type="text" id="frSearchInput" placeholder="Поиск по логину, коду или ссылке..." oninput="searchFriendDebounced(this.value)" onkeydown="if(event.key==='Enter'&&this.value.includes('/'))addByLink(this.value)">
        </div>
        <div id="frSearchResults"></div>
      </div>`;
  } else if (tab === 'incoming') {
    const reqs = inData?.requests || [];
    header.innerHTML = `<div class="fr-main-title">ПРИГЛАШЕНИЯ <span style="color:var(--text-dim)">${reqs.length}</span></div>`;
    if (!reqs.length) {
      container.innerHTML = '<div class="empty"><i class="fas fa-envelope-open"></i><p>Нет входящих запросов</p></div>';
      return;
    }
    container.innerHTML = reqs.map(r => `
      <div class="fr-card">
        <div class="fr-card-ava">
          ${r.sender_avatar ? `<img src="${r.sender_avatar}">` : `<span>${(r.sender_name||'?')[0].toUpperCase()}</span>`}
        </div>
        <div class="fr-card-info">
          <div class="fr-card-name">${r.sender_name||'?'}</div>
          <div class="fr-card-status" style="color:#f0a030">Хочет добавить вас в друзья</div>
        </div>
        <div class="fr-card-actions">
          <button class="fr-card-btn fr-card-btn-accept" onclick="acceptFriendReqFromProfile('${r.id}').then(()=>{window._friendsTab='incoming';renderFriends()})"><i class="fas fa-check"></i> Принять</button>
          <button class="fr-card-btn fr-card-btn-remove" onclick="rejectFriendReqFromProfile('${r.id}').then(()=>{window._friendsTab='incoming';renderFriends()})"><i class="fas fa-times"></i> Отклонить</button>
        </div>
      </div>`).join('');
  } else {
    const outData = await api('/api/friends/requests/outgoing');
    const reqs = outData?.requests || [];
    header.innerHTML = `<div class="fr-main-title">ИСХОДЯЩИЕ ЗАПРОСЫ <span style="color:var(--text-dim)">${reqs.length}</span></div>`;
    if (!reqs.length) {
      container.innerHTML = '<div class="empty"><i class="fas fa-paper-plane"></i><p>Нет исходящих запросов</p></div>';
      return;
    }
    container.innerHTML = reqs.map(r => `
      <div class="fr-card">
        <div class="fr-card-ava">
          ${r.receiver_avatar ? `<img src="${r.receiver_avatar}">` : `<span>${(r.receiver_name||'?')[0].toUpperCase()}</span>`}
        </div>
        <div class="fr-card-info">
          <div class="fr-card-name">${r.receiver_name||'?'}</div>
          <div class="fr-card-status">Ожидание ответа...</div>
        </div>
        <div class="fr-card-actions">
          <button class="fr-card-btn fr-card-btn-remove" onclick="rejectFriendReqFromProfile('${r.id}').then(()=>{window._friendsTab='outgoing';renderFriends()})"><i class="fas fa-times"></i> Отменить</button>
        </div>
      </div>`).join('');
  }
}

function renderFriendCards(list, container) {
  // Group by status like Steam
  const watching = [], online = [], offline = [];
  list.forEach(f => {
    const fs = formatLastSeen(f.last_seen);
    f._fs = fs;
    if (f.watching_now && fs.online) watching.push(f);
    else if (fs.online) online.push(f);
    else offline.push(f);
  });

  const renderGroup = (title, friends, color) => {
    if (!friends.length) return '';
    return `<div class="fr-group">
      <div class="fr-group-title" style="color:${color}">${title}</div>
      <div class="fr-group-grid">${friends.map(f => {
        const isWatching = f.watching_now && f._fs.online;
        const statusText = isWatching ? `Смотрит: ${f.watching_now}` : f._fs.online ? 'В сети' : f._fs.text;
        const statusColor = isWatching ? '#e2b93b' : f._fs.online ? '#e2b93b' : '#898989';
        const cardClass = isWatching ? 'fr-steam-card fr-watching' : f._fs.online ? 'fr-steam-card fr-online' : 'fr-steam-card fr-offline';
        return `<div class="${cardClass}" data-name="${(f.name||'').toLowerCase()}" onclick="navigate('profile',{id:'${f.id}'})" oncontextmenu="showFriendCtx(event,'${f.id}','${(f.name||'').replace(/'/g,"\\'")}',true)">
          <div class="fr-steam-ava">${f.avatar ? `<img src="${f.avatar}">` : `<span>${(f.name||'?')[0].toUpperCase()}</span>`}</div>
          <div class="fr-steam-info">
            <div class="fr-steam-name">${f.name||f.username}</div>
            <div class="fr-steam-status" style="color:${statusColor}">${statusText}</div>
          </div>
        </div>`;
      }).join('')}</div>
    </div>`;
  };

  container.innerHTML =
    renderGroup('СМОТРИТ', watching, '#e2b93b') +
    renderGroup('В СЕТИ', online, '#e2b93b') +
    renderGroup('НЕ В СЕТИ', offline, '#898989');
}

function filterFriendsList(q) {
  const cards = document.querySelectorAll('#frList .fr-steam-card');
  const ql = q.toLowerCase();
  cards.forEach(c => { c.style.display = c.dataset.name?.includes(ql) ? '' : 'none'; });
}

let _friendSearchTimer;
function searchFriendDebounced(q) {
  clearTimeout(_friendSearchTimer);
  _friendSearchTimer = setTimeout(() => searchFriendUsers(q), 300);
}

async function searchFriendUsers(q) {
  const res = document.getElementById('frSearchResults');
  if (!res) return;
  if (!q || q.length < 2) { res.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:10px">Введите минимум 2 символа</div>'; return; }
  const data = await api(`/api/friends/search?q=${encodeURIComponent(q)}`);
  const users = data?.users || [];
  if (!users.length) { res.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:10px">Никого не найдено</div>'; return; }
  res.innerHTML = users.map(u => `
    <div class="fr-card">
      <div class="fr-card-ava" onclick="navigate('profile',{id:'${u.id}'})">
        ${u.avatar ? `<img src="${u.avatar}">` : `<span>${(u.name||'?')[0].toUpperCase()}</span>`}
      </div>
      <div class="fr-card-info">
        <div class="fr-card-name" onclick="navigate('profile',{id:'${u.id}'})">${u.name||u.username}</div>
        <div class="fr-card-status" style="color:var(--text-dim)">${u.username||''} ${u.friend_code ? '• ' + u.friend_code : ''}</div>
      </div>
      <div class="fr-card-actions">
        <button class="fr-card-btn fr-card-btn-accept" onclick="sendFriendReq(${u.id}, this)"><i class="fas fa-user-plus"></i> Добавить</button>
      </div>
    </div>`).join('');
}

async function addByLink(link) {
  if (!link) return;
  // Extract profile ID from link like /#profile/3 or /profile/3
  const match = link.match(/profile\/(\d+)/);
  if (match) {
    await sendFriendReq(parseInt(match[1]));
    document.getElementById('frLinkInput').value = '';
  } else {
    toast('Неверная ссылка. Используйте ссылку на профиль.');
  }
}

// --- Settings ---
// ============ STEAM-STYLE POINTS SHOP ============
// ============ ITEM VISUAL HELPERS ============
function isVideoUrl(s) { return typeof s === 'string' && /\.(webm|mp4)(\?|$)/i.test(s); }
function isImageUrl(s) { return typeof s === 'string' && /^https?:\/\//i.test(s) && !isVideoUrl(s); }
function itemBgCss(src) {
  if (!src) return '#222';
  if (isVideoUrl(src)) return '#171a21';
  if (isImageUrl(src)) return `#171a21 center/cover no-repeat url('${src.replace(/'/g,"\\'")}')`;
  return src;
}
function itemVisHTML(item, cls, opts) {
  opts = opts || {};
  const src = item.css || '';
  const preview = item.preview || src;
  const isUrl = /^https?:/i.test(src);
  const isVid = isVideoUrl(src);
  if (isUrl) {
    const imgUrl = (isVid || !isImageUrl(src)) ? preview : src;
    if (opts.playVideo && isVid) {
      return `<div class="${cls} ${cls}-img" style="background:#171a21;position:relative;overflow:hidden">
        <video src="${src}" autoplay loop muted playsinline preload="metadata"
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain"></video>
      </div>`;
    }
    const safe = (imgUrl||'').replace(/"/g,'&quot;');
    return `<div class="${cls} ${cls}-img" style="background:#171a21;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center">
      <img src="${safe}" loading="lazy" referrerpolicy="no-referrer"
        style="max-width:100%;max-height:100%;object-fit:contain;display:block">
    </div>`;
  }
  return `<div class="${cls}" style="background:${itemBgCss(src)}"></div>`;
}

async function renderShop() {
  const app = document.getElementById('app');
  if (!user) { app.innerHTML = loginForm(); return; }
  const data = await api('/api/shop/items');
  if (!data?.items) { app.innerHTML = '<div class="empty"><p>Ошибка загрузки</p></div>'; return; }
  const eq = await api(`/api/shop/equipped/${user.id}`);
  const cat = window._shopCat || 'frame';
  const q = (window._shopSearch || '').toLowerCase();
  const sub = window._shopSub || 'all'; // all | animated | static
  const page = window._shopPage || 0;
  const PAGE_SIZE = 60;
  const isAnim = (i) => i.animated || /\.(webm|mp4)$/i.test(i.css || '');
  const allCat = data.items.filter(i => {
    if (cat === 'wallpaper') {
      if (i.source !== 'wallpaper_engine') return false;
    } else {
      if (i.type !== cat) return false;
      if (i.source === 'wallpaper_engine') return false;
    }
    if (q && !(i.name||'').toLowerCase().includes(q)) return false;
    if (sub === 'animated' && !isAnim(i)) return false;
    if (sub === 'static' && isAnim(i)) return false;
    return true;
  }).sort((a,b) => (b.subscriptions||0) - (a.subscriptions||0));
  const totalPages = Math.max(1, Math.ceil(allCat.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages - 1);
  const items = allCat.slice(curPage*PAGE_SIZE, (curPage+1)*PAGE_SIZE);

  app.innerHTML = `
  <div class="st-shop">
    <div class="st-shop-top">
      <div class="st-shop-top-left">
        <div class="st-shop-title">Магазин очков</div>
        <div class="st-shop-sub">Настрой свой профиль</div>
      </div>
      <div class="st-shop-bal"><i class="fas fa-coins"></i> ${data.points.toLocaleString('ru')} <small>очков</small></div>
    </div>
    <div class="st-shop-body">
      <div class="st-shop-nav">
        <div class="st-shop-nav-item ${cat==='frame'?'active':''}" onclick="window._shopCat='frame';renderShop()">
          <i class="fas fa-border-style"></i> Рамки аватара
        </div>
        <div class="st-shop-nav-item ${cat==='background'?'active':''}" onclick="window._shopCat='background';window._shopPage=0;renderShop()">
          <i class="fas fa-image"></i> Фоны профиля
        </div>
        <div class="st-shop-nav-item ${cat==='avatar'?'active':''}" onclick="window._shopCat='avatar';window._shopPage=0;renderShop()">
          <i class="fas fa-user-circle"></i> Анимир. аватары
        </div>
        <div class="st-shop-nav-item ${cat==='wallpaper'?'active':''}" onclick="window._shopCat='wallpaper';window._shopPage=0;renderShop()">
          <i class="fas fa-film"></i> Живые обои (WE)
        </div>
        <div class="st-shop-nav-sep"></div>
        <div class="st-shop-nav-item" onclick="navigate('inventory')"><i class="fas fa-box-open"></i> Мой инвентарь</div>
        <div class="st-shop-nav-item" onclick="navigate('market')"><i class="fas fa-balance-scale"></i> Торговая площадка</div>
      </div>
      <div class="st-shop-content">
        <div style="display:flex;gap:8px;padding:8px 12px;align-items:center;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap">
          <input type="text" placeholder="Поиск..." value="${q.replace(/"/g,'&quot;')}"
            oninput="clearTimeout(window._shopSrchT);window._shopSrchT=setTimeout(()=>{window._shopSearch=this.value;window._shopPage=0;renderShop()},250)"
            style="flex:1;min-width:180px;padding:6px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:4px">
          <div style="display:flex;gap:2px">
            ${['all','animated','static'].map(s => `<button class="st-btn ${sub===s?'accent':''}" style="padding:4px 10px;font-size:12px"
              onclick="window._shopSub='${s}';window._shopPage=0;renderShop()">${s==='all'?'Все':s==='animated'?'Анимир.':'Статич.'}</button>`).join('')}
          </div>
          <span style="color:var(--text-sec);font-size:12px">${allCat.length.toLocaleString('ru')} предм.</span>
        </div>
        <div class="st-shop-grid">
          ${items.map(i => {
            const isOwned = i.owned;
            const slot = cat==='wallpaper' ? 'background' : cat;
            const isEq = (slot==='frame' && eq?.frame?.id===i.id) || (slot==='background' && eq?.background?.id===i.id) || (slot==='avatar' && eq?.avatar?.id===i.id);
            return `<div class="st-item ${isOwned?'owned':''} ${isEq?'active':''}" onclick="${isOwned ? (isEq ? `shopUnequip('${slot}')` : `shopEquip('${slot}','${i.id}')`) : `shopBuy('${i.id}')`}">
              <div class="st-item-vis">
                ${itemVisHTML(i, slot==='frame' ? 'st-item-frame' : 'st-item-bg')}
              </div>
              <div class="st-item-bot">
                <div class="st-item-name">${i.name}</div>
                ${isEq ? `<div class="st-item-tag eq">Используется</div>`
                  : isOwned ? `<div class="st-item-tag own">В инвентаре</div>`
                  : `<div class="st-item-price"><i class="fas fa-coins"></i> ${i.price}</div>`}
              </div>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:6px;justify-content:center;padding:14px;align-items:center;color:var(--text-sec);font-size:13px;flex-wrap:wrap">
          <button class="st-btn" ${curPage<=0?'disabled':''} onclick="window._shopPage=0;renderShop()">«</button>
          <button class="st-btn" ${curPage<=0?'disabled':''} onclick="window._shopPage=${curPage-1};renderShop()">‹</button>
          <span>Стр.</span>
          <input type="number" min="1" max="${totalPages}" value="${curPage+1}"
            onchange="const v=Math.max(1,Math.min(${totalPages},parseInt(this.value)||1));window._shopPage=v-1;renderShop()"
            style="width:60px;padding:4px 6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:3px;text-align:center">
          <span>из ${totalPages.toLocaleString('ru')}</span>
          <button class="st-btn" ${curPage>=totalPages-1?'disabled':''} onclick="window._shopPage=${curPage+1};renderShop()">›</button>
          <button class="st-btn" ${curPage>=totalPages-1?'disabled':''} onclick="window._shopPage=${totalPages-1};renderShop()">»</button>
        </div>
      </div>
    </div>
  </div>`;
}

async function shopBuy(itemId) {
  const r = await api('/api/shop/buy',{method:'POST',body:{itemId}});
  if(r?.error){alert(r.error);return;} renderShop();
}
async function shopEquip(slot,itemId) {
  await api('/api/shop/equip',{method:'POST',body:{slot,itemId}}); renderShop();
}
async function shopUnequip(slot) {
  await api('/api/shop/equip',{method:'POST',body:{slot,itemId:null}}); renderShop();
}

// ============ STEAM-STYLE INVENTORY ============
async function renderInventory() {
  const app = document.getElementById('app');
  if (!user) { app.innerHTML = loginForm(); return; }
  const [data, listData] = await Promise.all([
    api('/api/shop/items'),
    api('/api/market/listings')
  ]);
  if (!data?.items) { app.innerHTML = '<div class="empty"><p>Ошибка</p></div>'; return; }
  const eq = await api(`/api/shop/equipped/${user.id}`);
  const owned = data.items.filter(i => i.owned);
  const allItems = data.items;
  const listings = listData?.listings || [];
  const sel = window._invSel || (owned[0]?.id || null);
  const selItem = owned.find(i => i.id === sel);
  const isEq = selItem && ((selItem.type==='frame'&&eq?.frame?.id===selItem.id)||(selItem.type==='background'&&eq?.background?.id===selItem.id));

  // Count sold in last 24h and find lowest price on market for selected item
  const selListings = selItem ? listings.filter(l => l.item.id === selItem.id) : [];
  const lowestPrice = selListings.length ? Math.min(...selListings.map(l=>l.price)) : selItem?.price || 0;
  // Simulate sold count based on item popularity
  const soldCount = selItem ? Math.floor(Math.random()*20+1) : 0;

  app.innerHTML = `
  <div class="st-inv">
    <div class="st-inv-head">
      <span class="st-inv-title">${user.name || user.username} <small>Инвентарь</small></span>
    </div>
    <div class="st-inv-body">
      <div class="st-inv-cats">
        <div class="st-inv-cat-head">Sperma Anime Zavrika <span>(${owned.length})</span></div>
        <div class="st-inv-cat active"><i class="fas fa-th"></i> Все предметы <b>${owned.length}</b></div>
        <div class="st-inv-cat" onclick="navigate('shop')"><i class="fas fa-store"></i> Магазин</div>
        <div class="st-inv-cat" onclick="navigate('market')"><i class="fas fa-balance-scale"></i> Торговля</div>
      </div>
      <div class="st-inv-items">
        ${owned.length === 0 ? `<div class="st-inv-empty">У вас пока нет предметов.<br><a onclick="navigate('shop')">Перейти в магазин</a></div>` : `
          <div class="st-inv-grid">
            ${owned.map(i => {
              const iEq = (i.type==='frame'&&eq?.frame?.id===i.id)||(i.type==='background'&&eq?.background?.id===i.id);
              return `<div class="st-inv-cell ${i.id===sel?'selected':''} ${iEq?'eq':''}" onclick="window._invSel='${i.id}';renderInventory()" title="${i.name}">
                ${itemVisHTML(i, i.type==='frame' ? 'st-inv-cell-frame' : 'st-inv-cell-bg')}
                <div class="st-inv-cell-name">${i.name.split(' ')[0]}</div>
              </div>`;
            }).join('')}
          </div>
          <div class="st-inv-pager">
            <span>1 из 1</span>
          </div>
        `}
      </div>
      <div class="st-inv-detail">
        ${selItem ? `
          <div class="st-inv-det-vis">
            ${itemVisHTML(selItem, selItem.type==='frame' ? 'st-inv-det-frame' : 'st-inv-det-bg', {playVideo:true})}
          </div>
          <div class="st-inv-det-name">${selItem.name}</div>
          <div class="st-inv-det-cat">
            <i class="fas fa-gamepad"></i> Sperma Anime Zavrika
          </div>
          <div class="st-inv-det-type">${selItem.type==='frame'?'Рамка аватара':'Фон профиля'}</div>
          <div class="st-inv-det-desc">${selItem.type==='frame'?'Декоративная рамка для аватара вашего профиля.':'Уникальный фон для оформления вашего профиля.'}</div>

          <div class="st-inv-det-divider"></div>

          <div class="st-inv-det-stats">
            <div class="st-inv-det-stat">
              <span class="st-inv-det-stat-label">Начальная цена:</span>
              <span class="st-inv-det-stat-val"><i class="fas fa-coins"></i> ${selItem.price}₽</span>
            </div>
            <div class="st-inv-det-stat">
              <span class="st-inv-det-stat-label">Продано за последние 24 часа:</span>
              <span class="st-inv-det-stat-val">${soldCount}</span>
            </div>
            ${selListings.length ? `
            <div class="st-inv-det-stat">
              <span class="st-inv-det-stat-label">Мин. цена на площадке:</span>
              <span class="st-inv-det-stat-val"><i class="fas fa-coins"></i> ${lowestPrice}₽</span>
            </div>` : ''}
          </div>

          <div class="st-inv-det-actions">
            ${isEq
              ? `<button class="st-btn" onclick="shopUnequip('${selItem.type}');setTimeout(renderInventory,200)"><i class="fas fa-times"></i> Снять</button>`
              : `<button class="st-btn accent" onclick="shopEquip('${selItem.type}','${selItem.id}');setTimeout(renderInventory,200)"><i class="fas fa-check"></i> Надеть</button>`}
            ${selListings.length ? `<button class="st-btn" onclick="window._mktSearch='${selItem.name}';navigate('market')"><i class="fas fa-search"></i> На площадке</button>` : ''}
            <button class="st-btn sell" onclick="openSellDialog('${selItem.id}','${selItem.name}',${selItem.price})"><i class="fas fa-tag"></i> Продать</button>
          </div>
        ` : `<div class="st-inv-det-empty">Выберите предмет</div>`}
      </div>
    </div>
  </div>

  <!-- Sell dialog overlay -->
  <div class="st-sell-overlay" id="sellOverlay" style="display:none" onclick="if(event.target===this)closeSellDialog()">
    <div class="st-sell-dialog" id="sellDialog"></div>
  </div>`;
}

function openSellDialog(itemId, itemName, basePrice) {
  window._sellItemId = itemId;
  window._sellItemName = itemName;
  window._sellBasePrice = basePrice;
  const overlay = document.getElementById('sellOverlay');
  const dialog = document.getElementById('sellDialog');
  if (!overlay || !dialog) return;

  const commission = 0.10; // 10% комиссия
  const defaultPrice = basePrice;
  const youGet = Math.floor(defaultPrice * (1 - commission));

  dialog.innerHTML = `
    <div class="st-sell-header">
      <div class="st-sell-title">Продать предмет на Торговой площадке</div>
      <button class="st-sell-close" onclick="closeSellDialog()"><i class="fas fa-times"></i></button>
    </div>
    <div class="st-sell-body">
      <div class="st-sell-item-name">${itemName}</div>

      <div class="st-sell-chart">
        <div class="st-sell-chart-header">
          <span>Медианные цены продаж</span>
          <div class="st-sell-chart-tabs">
            <span class="active" onclick="setSellChartRange(this,'day')">День</span>
            <span onclick="setSellChartRange(this,'week')">Неделя</span>
            <span onclick="setSellChartRange(this,'month')">Месяц</span>
            <span onclick="setSellChartRange(this,'all')">Всё время</span>
          </div>
        </div>
        <canvas id="sellChart" width="460" height="140"></canvas>
      </div>

      <div class="st-sell-pricing">
        <div class="st-sell-field">
          <label>Цена покупателя:</label>
          <div class="st-sell-input-wrap">
            <i class="fas fa-coins"></i>
            <input type="number" id="sellPrice" class="st-input" value="${defaultPrice}" min="1" oninput="updateSellPreview()">
          </div>
        </div>
        <div class="st-sell-breakdown">
          <div class="st-sell-fee">
            <span>Комиссия площадки (10%):</span>
            <span id="sellFee"><i class="fas fa-coins"></i> ${Math.floor(defaultPrice * commission)}</span>
          </div>
          <div class="st-sell-receive">
            <span>Вы получите:</span>
            <span id="sellReceive"><i class="fas fa-coins"></i> ${youGet}</span>
          </div>
        </div>
      </div>

      <div class="st-sell-confirm">
        <label class="st-sell-checkbox">
          <input type="checkbox" id="sellAgree"> Я подтверждаю, что хочу продать этот предмет
        </label>
        <button class="st-btn accent" id="sellSubmitBtn" disabled onclick="submitSell()">
          <i class="fas fa-tag"></i> Выставить на продажу за <span id="sellSubmitPrice">${defaultPrice}</span>₽
        </button>
      </div>
    </div>`;

  overlay.style.display = 'flex';
  document.getElementById('sellAgree').addEventListener('change', function() {
    document.getElementById('sellSubmitBtn').disabled = !this.checked;
  });

  // Draw chart
  setTimeout(() => drawSellChart('day'), 50);
}

function closeSellDialog() {
  const overlay = document.getElementById('sellOverlay');
  if (overlay) overlay.style.display = 'none';
}

function updateSellPreview() {
  const price = parseInt(document.getElementById('sellPrice')?.value) || 0;
  const commission = 0.10;
  const fee = Math.floor(price * commission);
  const receive = price - fee;
  const feeEl = document.getElementById('sellFee');
  const recEl = document.getElementById('sellReceive');
  const btnPrice = document.getElementById('sellSubmitPrice');
  if (feeEl) feeEl.innerHTML = `<i class="fas fa-coins"></i> ${fee}`;
  if (recEl) recEl.innerHTML = `<i class="fas fa-coins"></i> ${receive}`;
  if (btnPrice) btnPrice.textContent = price;
}

function setSellChartRange(el, range) {
  el.parentElement.querySelectorAll('span').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  drawSellChart(range);
}

function drawSellChart(range) {
  const canvas = document.getElementById('sellChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Generate fake price data based on range
  const points = range === 'day' ? 24 : range === 'week' ? 7 : range === 'month' ? 30 : 90;
  const base = window._sellBasePrice || 100;
  const data = [];
  let price = base;
  for (let i = 0; i < points; i++) {
    price = Math.max(base * 0.5, Math.min(base * 1.8, price + (Math.random() - 0.48) * base * 0.12));
    data.push(Math.round(price));
  }

  const minP = Math.min(...data) * 0.9;
  const maxP = Math.max(...data) * 1.1;
  const rangeP = maxP - minP || 1;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = 10 + (h - 30) * i / 3;
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(w - 10, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.font = '10px sans-serif';
    ctx.fillText(Math.round(maxP - rangeP * i / 3), 2, y + 3);
  }

  // Line chart
  ctx.strokeStyle = 'rgba(240,160,48,.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = 40 + (w - 50) * i / (data.length - 1);
    const y = 10 + (h - 30) * (1 - (v - minP) / rangeP);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Fill under line
  const lastX = 40 + (w - 50);
  const lastY = 10 + (h - 30) * (1 - (data[data.length-1] - minP) / rangeP);
  ctx.lineTo(lastX, h - 20);
  ctx.lineTo(40, h - 20);
  ctx.closePath();
  ctx.fillStyle = 'rgba(240,160,48,.08)';
  ctx.fill();

  // Volume bars at bottom
  ctx.fillStyle = 'rgba(240,160,48,.2)';
  const barW = Math.max(2, (w - 50) / data.length - 1);
  data.forEach((v, i) => {
    const x = 40 + (w - 50) * i / (data.length - 1) - barW / 2;
    const barH = 5 + Math.random() * 10;
    ctx.fillRect(x, h - 18, barW, barH > 0 ? -barH : 0);
  });
}

async function submitSell() {
  const price = parseInt(document.getElementById('sellPrice')?.value);
  if (!price || price < 1 || !window._sellItemId) return;
  const r = await api('/api/market/list', {method:'POST', body:{itemId: window._sellItemId, price}});
  if (r?.error) { alert(r.error); return; }
  closeSellDialog();
  renderInventory();
}

// ============ EDIT PROFILE (Steam-style full page) ============
async function renderEditProfile() {
  const app = document.getElementById('app');
  if (!user) { app.innerHTML = loginForm(); return; }

  const data = await api(`/api/profile/${user.id}`);
  const p = data?.profile || {};
  const u = data?.user || user;
  const eq = await api(`/api/shop/equipped/${user.id}`);

  const tab = window._epTab || 'general';

  let content = '';
  if (tab === 'general') {
    content = `
      <h2 class="ep-section-title">Основное</h2>
      <p class="ep-section-desc">Укажите имя профиля и другую информацию. Это поможет другим пользователям найти вас в сообществе.</p>
      <div class="ep-form-section">
        <div class="ep-form-label">ОСНОВНОЕ</div>
        <div class="ep-form-group">
          <label class="ep-label">ИМЯ ПРОФИЛЯ</label>
          <input type="text" class="ep-input" id="epName" value="${u.name || ''}" maxlength="30">
        </div>
        <div class="ep-form-group">
          <label class="ep-label">О СЕБЕ</label>
          <textarea class="ep-input ep-textarea" id="epBio" rows="4" maxlength="500" placeholder="Расскажите о себе...">${p.bio || ''}</textarea>
        </div>
      </div>
      <button class="ep-save-btn" onclick="saveProfileGeneral()"><i class="fas fa-save"></i> Сохранить</button>`;
  } else if (tab === 'avatar') {
    content = `
      <h2 class="ep-section-title">Аватар</h2>
      <p class="ep-section-desc">Загрузите изображение для аватара. Только PNG и JPG, максимум 5 МБ.</p>
      <div class="ep-avatar-area">
        <div class="ep-avatar-current">
          <div class="ep-avatar-big">
            ${u.avatar ? `<img src="${u.avatar}" id="epAvaImg">` : `<div class="ep-avatar-letter" id="epAvaImg">${(u.name||'?')[0]}</div>`}
          </div>
          <div class="ep-avatar-label">Текущий аватар</div>
        </div>
        <div class="ep-avatar-upload">
          <label class="ep-upload-btn">
            <i class="fas fa-cloud-upload-alt"></i> Загрузить изображение
            <input type="file" accept=".png,.jpg,.jpeg" id="epAvaFile" style="display:none" onchange="previewAvatar(this)">
          </label>
          <div class="ep-avatar-hint">PNG или JPG, до 5 МБ. Рекомендуемый размер: 184x184 пикселей.</div>
        </div>
      </div>
      <button class="ep-save-btn" onclick="saveProfileAvatar()"><i class="fas fa-save"></i> Загрузить аватар</button>`;
  } else if (tab === 'background') {
    content = `
      <h2 class="ep-section-title">Фон профиля</h2>
      <p class="ep-section-desc">Выберите фон для вашего профиля. Фоны можно приобрести в Магазине профиля.</p>
      <div class="ep-bg-current">
        <div class="ep-bg-label">Текущий фон:</div>
        ${eq?.background ? `
          <div class="ep-bg-preview" style="background:${eq.background.css}"></div>
          <div class="ep-bg-name">${eq.background.name}</div>
          <button class="ep-remove-btn" onclick="shopUnequip('background');setTimeout(()=>renderEditProfile(),300)"><i class="fas fa-times"></i> Снять фон</button>
        ` : `<div class="ep-bg-none">Фон не установлен</div>`}
      </div>
      <button class="ep-save-btn" onclick="navigate('shop')" style="background:#4a6741;border-color:#5a8050"><i class="fas fa-store"></i> Перейти в магазин</button>
      <button class="ep-save-btn" onclick="navigate('inventory')" style="margin-left:8px"><i class="fas fa-box-open"></i> Инвентарь</button>`;
  } else if (tab === 'frame') {
    content = `
      <h2 class="ep-section-title">Рамка аватара</h2>
      <p class="ep-section-desc">Выберите рамку для аватара. Рамки можно приобрести в Магазине профиля.</p>
      <div class="ep-bg-current">
        <div class="ep-bg-label">Текущая рамка:</div>
        ${eq?.frame ? `
          <div class="ep-frame-preview" style="background:${eq.frame.css}"></div>
          <div class="ep-bg-name">${eq.frame.name}</div>
          <button class="ep-remove-btn" onclick="shopUnequip('frame');setTimeout(()=>renderEditProfile(),300)"><i class="fas fa-times"></i> Снять рамку</button>
        ` : `<div class="ep-bg-none">Рамка не установлена</div>`}
      </div>
      <button class="ep-save-btn" onclick="navigate('shop')" style="background:#4a6741;border-color:#5a8050"><i class="fas fa-store"></i> Перейти в магазин</button>
      <button class="ep-save-btn" onclick="navigate('inventory')" style="margin-left:8px"><i class="fas fa-box-open"></i> Инвентарь</button>`;
  } else if (tab === 'privacy') {
    content = `
      <h2 class="ep-section-title">Приватность</h2>
      <p class="ep-section-desc">Настройте, кто может видеть информацию о вашем профиле.</p>
      <div class="ep-form-section">
        <div class="ep-form-label">НАСТРОЙКИ ПРИВАТНОСТИ</div>
        <div class="ep-privacy-item">
          <div class="ep-privacy-info">
            <div class="ep-privacy-name">Статус профиля</div>
            <div class="ep-privacy-desc">Кто может видеть ваш профиль</div>
          </div>
          <select class="ep-input" style="width:180px" id="epPrivProfile">
            <option value="public">Все</option>
            <option value="friends">Только друзья</option>
            <option value="private">Только я</option>
          </select>
        </div>
        <div class="ep-privacy-item">
          <div class="ep-privacy-info">
            <div class="ep-privacy-name">Список аниме</div>
            <div class="ep-privacy-desc">Кто может видеть ваш список</div>
          </div>
          <select class="ep-input" style="width:180px" id="epPrivList">
            <option value="public">Все</option>
            <option value="friends">Только друзья</option>
            <option value="private">Только я</option>
          </select>
        </div>
        <div class="ep-privacy-item">
          <div class="ep-privacy-info">
            <div class="ep-privacy-name">Инвентарь</div>
            <div class="ep-privacy-desc">Кто может видеть ваш инвентарь</div>
          </div>
          <select class="ep-input" style="width:180px" id="epPrivInv">
            <option value="public">Все</option>
            <option value="friends">Только друзья</option>
            <option value="private">Только я</option>
          </select>
        </div>
        <div class="ep-privacy-item">
          <div class="ep-privacy-info">
            <div class="ep-privacy-name">Комментарии на профиле</div>
            <div class="ep-privacy-desc">Кто может оставлять комментарии</div>
          </div>
          <select class="ep-input" style="width:180px" id="epPrivComments">
            <option value="public">Все</option>
            <option value="friends">Только друзья</option>
            <option value="none">Никто</option>
          </select>
        </div>
        <div class="ep-privacy-item">
          <div class="ep-privacy-info">
            <div class="ep-privacy-name">Онлайн-статус</div>
            <div class="ep-privacy-desc">Показывать ваш статус онлайн</div>
          </div>
          <select class="ep-input" style="width:180px" id="epPrivOnline">
            <option value="public">Все</option>
            <option value="friends">Только друзья</option>
            <option value="private">Никто</option>
          </select>
        </div>
      </div>
      <button class="ep-save-btn" onclick="toast('Настройки приватности сохранены!')"><i class="fas fa-save"></i> Сохранить</button>`;
  }

  app.innerHTML = `
  <div class="ep-page">
    <div class="ep-header">
      <div class="ep-header-ava">
        ${u.avatar ? `<img src="${u.avatar}">` : `<div class="ep-header-letter">${(u.name||'?')[0]}</div>`}
      </div>
      <div class="ep-header-info">
        <span class="ep-header-name">${u.name || u.username}</span>
        <span class="ep-header-sep">&raquo;</span>
        <span class="ep-header-sub">Редактировать профиль</span>
      </div>
    </div>
    <div class="ep-back"><a onclick="navigate('profile/${user.id}')"><i class="fas fa-arrow-left"></i> В профиль</a></div>
    <div class="ep-body">
      <div class="ep-nav">
        <div class="ep-nav-item ${tab==='general'?'active':''}" onclick="window._epTab='general';renderEditProfile()">Основное</div>
        <div class="ep-nav-item ${tab==='avatar'?'active':''}" onclick="window._epTab='avatar';renderEditProfile()">Аватар</div>
        <div class="ep-nav-item ${tab==='frame'?'active':''}" onclick="window._epTab='frame';renderEditProfile()">Рамка аватара</div>
        <div class="ep-nav-item ${tab==='background'?'active':''}" onclick="window._epTab='background';renderEditProfile()">Фон профиля</div>
        <div class="ep-nav-sep"></div>
        <div class="ep-nav-item ${tab==='privacy'?'active':''}" onclick="window._epTab='privacy';renderEditProfile()">Приватность</div>
        <div class="ep-nav-sep"></div>
        <div class="ep-nav-item" onclick="navigate('shop')"><i class="fas fa-coins" style="margin-right:6px;color:var(--accent)"></i> Предметы за очки</div>
      </div>
      <div class="ep-content">${content}</div>
    </div>
  </div>`;
}

// === Friend actions ===
async function sendFriendReq(userId, btnEl) {
  const r = await api(`/api/friends/request/${userId}`, {method:'POST'});
  if (r?.ok) {
    toast('Запрос в друзья отправлен!');
    if (btnEl) { btnEl.innerHTML = '<i class="fas fa-check"></i> Отправлено'; btnEl.disabled = true; btnEl.style.opacity = '0.5'; }
  } else toast(r?.error || 'Ошибка');
}
async function acceptFriendReqFromProfile(requestId) {
  const r = await api(`/api/friends/accept/${requestId}`, {method:'POST'});
  if (r?.ok) toast('Запрос принят!');
  else toast(r?.error || 'Ошибка');
}
async function rejectFriendReqFromProfile(requestId) {
  const r = await api(`/api/friends/reject/${requestId}`, {method:'POST'});
  if (r?.ok) toast('Запрос отклонён');
  else toast(r?.error || 'Ошибка');
}
async function removeFriendAction(userId) {
  await api(`/api/friends/${userId}`, {method:'DELETE'});
  toast('Удалён из друзей');
}

// --- Context Menu ---
function showFriendCtx(e, uid, name, isFriend) {
  e.preventDefault();
  closeFriendCtx();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.id = 'friendCtx';
  menu.innerHTML = `
    <div class="ctx-item" onclick="closeFriendCtx();navigate('profile',{id:'${uid}'})"><i class="fas fa-user"></i> Открыть профиль</div>
    <div class="ctx-sep"></div>
    ${isFriend ? `
      <div class="ctx-item" onclick="closeFriendCtx();removeFriendAction('${uid}').then(()=>{if(typeof renderFriends==='function'&&window._friendsTab)renderFriends();})"><i class="fas fa-user-minus"></i> Удалить из друзей</div>
      <div class="ctx-item ctx-danger" onclick="closeFriendCtx();blockUser('${uid}')"><i class="fas fa-ban"></i> Заблокировать</div>
    ` : `
      <div class="ctx-item" onclick="closeFriendCtx();sendFriendReq(${uid})"><i class="fas fa-user-plus"></i> Добавить в друзья</div>
    `}
  `;
  document.body.appendChild(menu);
  // Position
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = e.clientX, y = e.clientY;
  if (x + mw > window.innerWidth) x = window.innerWidth - mw - 4;
  if (y + mh > window.innerHeight) y = window.innerHeight - mh - 4;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  setTimeout(() => document.addEventListener('click', closeFriendCtx, { once: true }), 10);
}
function closeFriendCtx() {
  const m = document.getElementById('friendCtx');
  if (m) m.remove();
}
async function blockUser(userId) {
  toast('Пользователь заблокирован');
  await removeFriendAction(userId);
}

async function loadProfileComments(profileUserId) {
  const container = document.getElementById('profileComments');
  if (!container) return;
  const data = await api(`/api/profile/${profileUserId}/comments`);
  const comments = data?.comments || [];
  if (!comments.length) {
    container.innerHTML = '<div class="sp-comments-empty">Пока нет комментариев</div>';
    return;
  }
  container.innerHTML = comments.map(c => {
    const date = c.created_at ? new Date(c.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';
    const canDel = user && (user.id === c.author_id || user.id === profileUserId);
    return `<div class="sp-comment-item">
      <div class="sp-comment-ava" onclick="navigate('profile',{id:'${c.author_id}'})" style="cursor:pointer">${c.avatar ? `<img src="${c.avatar}">` : `<span>${(c.login||'?')[0]}</span>`}</div>
      <div class="sp-comment-body">
        <div class="sp-comment-head">
          <span class="sp-comment-author" onclick="navigate('profile',{id:'${c.author_id}'})">${c.login}</span>
          <span class="sp-comment-date">${date}</span>
          ${canDel ? `<span class="comment-del" onclick="deleteProfileComment(${c.id},${profileUserId})" title="Удалить"><i class="fas fa-trash"></i></span>` : ''}
        </div>
        <div class="sp-comment-text">${(c.text||'').replace(/</g,'&lt;')}</div>
      </div>
    </div>`;
  }).join('');
}

async function deleteProfileComment(commentId, profileUserId) {
  await api(`/api/profile/comment/${commentId}`, { method: 'DELETE' });
  loadProfileComments(profileUserId);
}

function switchProfileTab(tab) {
  document.querySelectorAll('#profileStatsTabs .sp-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('#profileTabContent .sp-tab-pane').forEach(p => p.style.display = p.dataset.pane === tab ? '' : 'none');
}

async function postProfileComment() {
  if (!user) return;
  const input = document.getElementById('profileCommentInput');
  const text = input?.value?.trim();
  if (!text) return;
  const profileId = window._currentProfileId;
  if (!profileId) return;
  const res = await api(`/api/profile/${profileId}/comments`, { method: 'POST', body: { text } });
  if (res?.ok) {
    input.value = '';
    loadProfileComments(profileId);
  } else {
    toast(res?.error || 'Ошибка');
  }
}

function previewAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['png','jpg','jpeg'].includes(ext)) {
    alert('Только PNG и JPG файлы!'); input.value = ''; return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('Максимум 5 МБ!'); input.value = ''; return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('epAvaImg');
    if (img && img.tagName === 'IMG') { img.src = e.target.result; }
    else if (img) { img.outerHTML = `<img src="${e.target.result}" id="epAvaImg">`; }
  };
  reader.readAsDataURL(file);
}

async function saveProfileGeneral() {
  const name = document.getElementById('epName')?.value?.trim();
  const bio = document.getElementById('epBio')?.value?.trim();
  await api('/api/profile/update', { method: 'POST', body: { name, bio } });
  if (name) user.name = name;
  renderTopbar();
  toast('Профиль сохранён!');
}

async function saveProfileAvatar() {
  const fileInput = document.getElementById('epAvaFile');
  if (!fileInput?.files?.length) { alert('Выберите файл'); return; }
  const form = new FormData();
  form.append('avatar', fileInput.files[0]);
  const resp = await fetch('/api/profile/avatar', { method: 'POST', body: form });
  const r = await resp.json();
  if (r.error) { alert(r.error); return; }
  if (r.avatar) user.avatar = r.avatar;
  renderTopbar();
  toast('Аватар обновлён!');
  renderEditProfile();
}

// ============ STEAM-STYLE MARKET ============
async function renderMarket() {
  const app = document.getElementById('app');
  const [listData, shopData] = await Promise.all([
    api('/api/market/listings'),
    user ? api('/api/shop/items') : Promise.resolve(null)
  ]);
  const listings = listData?.listings || [];
  const points = shopData?.points || 0;
  const myInv = shopData?.items?.filter(i => i.owned) || [];
  const sellId = window._mktSellId || '';
  window._mktSellId = '';
  const tab = window._mktTab || 'popular';

  const myListings = listings.filter(l => user && l.seller_id === user.id);
  const otherListings = listings.filter(l => !user || l.seller_id !== user.id);

  let filtered = tab === 'my' ? myListings : otherListings;
  const searchQ = window._mktSearch || '';
  if (searchQ) filtered = filtered.filter(l => l.item.name.toLowerCase().includes(searchQ.toLowerCase()));

  function renderRow(l) {
    return `<div class="st-mkt-row" onclick="window._mktSelected=${l.id};renderMarket()">
      <div class="st-mkt-col-img">
        ${itemVisHTML(l.item, l.item.type==='frame' ? 'st-mkt-mini-frame' : 'st-mkt-mini-bg')}
      </div>
      <div class="st-mkt-col-info">
        <div class="st-mkt-item-name">${l.item.name}</div>
        <div class="st-mkt-item-type">${l.item.type==='frame'?'Рамка аватара':'Фон профиля'}</div>
      </div>
      <div class="st-mkt-col-qty">1</div>
      <div class="st-mkt-col-price">
        <span class="st-mkt-price-from">От</span>
        <span class="st-mkt-price-val"><i class="fas fa-coins"></i> ${l.price}</span>
      </div>
    </div>`;
  }

  const selected = filtered.find(l => l.id === window._mktSelected);

  app.innerHTML = `
  <div class="st-mkt">
    <div class="st-mkt-head">
      <div class="st-mkt-title">Торговая площадка</div>
      ${user ? `<div class="st-shop-bal"><i class="fas fa-coins"></i> ${points.toLocaleString('ru')} <small>очков</small></div>` : ''}
    </div>

    <div class="st-mkt-tabs">
      <div class="st-mkt-tab ${tab==='popular'?'active':''}" onclick="window._mktTab='popular';renderMarket()">Популярные</div>
      <div class="st-mkt-tab ${tab==='new'?'active':''}" onclick="window._mktTab='new';renderMarket()">Новые</div>
      ${user ? `<div class="st-mkt-tab ${tab==='my'?'active':''}" onclick="window._mktTab='my';renderMarket()">Мои лоты (${myListings.length})</div>` : ''}
    </div>

    <div class="st-mkt-body">
      <div class="st-mkt-main">
        <div class="st-mkt-table">
          <div class="st-mkt-row st-mkt-row-head">
            <div class="st-mkt-col-img"></div>
            <div class="st-mkt-col-info">НАЗВАНИЕ</div>
            <div class="st-mkt-col-qty">КОЛ-ВО</div>
            <div class="st-mkt-col-price">ЦЕНА</div>
          </div>
          ${filtered.length === 0
            ? `<div class="st-mkt-empty">Нет активных лотов</div>`
            : filtered.map(l => renderRow(l)).join('')}
        </div>
      </div>

      <div class="st-mkt-sidebar">
        ${selected ? `
          <div class="st-mkt-detail">
            <div class="st-mkt-detail-preview">
              ${itemVisHTML(selected.item, selected.item.type==='frame' ? 'st-mkt-detail-frame' : 'st-mkt-detail-bg', {playVideo:true})}
            </div>
            <div class="st-mkt-detail-name">${selected.item.name}</div>
            <div class="st-mkt-detail-type">${selected.item.type==='frame'?'Рамка аватара':'Фон профиля'}</div>
            <div class="st-mkt-detail-seller">
              ${selected.seller_avatar?`<img src="${selected.seller_avatar}" class="st-mkt-ava">`:''}
              ${selected.seller_name}
            </div>
            <div class="st-mkt-detail-price"><i class="fas fa-coins"></i> ${selected.price} очков</div>
            ${user && selected.seller_id===user.id
              ? `<button class="st-btn sm" onclick="marketCancel(${selected.id})" style="width:100%;margin-top:8px">Снять с продажи</button>`
              : user ? `<button class="st-btn accent" onclick="marketBuy(${selected.id})" style="width:100%;margin-top:8px">Купить</button>` : ''}
          </div>
        ` : `
          <div class="st-mkt-sidebar-section">
            <div class="st-mkt-sidebar-title">Поиск предметов</div>
            <input type="text" class="st-input" placeholder="Поиск..." value="${searchQ}" onkeydown="if(event.key==='Enter'){window._mktSearch=this.value;renderMarket()}" id="mktSearchInput">
          </div>
          <div class="st-mkt-sidebar-section">
            <div class="st-mkt-sidebar-title">Фильтр по типу</div>
            <div class="st-mkt-filter-item" onclick="window._mktSearch='рамка';renderMarket()">
              <i class="fas fa-border-all"></i> Рамки аватара
            </div>
            <div class="st-mkt-filter-item" onclick="window._mktSearch='фон';renderMarket()">
              <i class="fas fa-image"></i> Фоны профиля
            </div>
            <div class="st-mkt-filter-item" onclick="window._mktSearch='';renderMarket()">
              <i class="fas fa-list"></i> Все предметы
            </div>
          </div>
          ${user && myInv.length ? `
          <div class="st-mkt-sidebar-section">
            <div class="st-mkt-sidebar-title">Выставить на продажу</div>
            <select id="mktSellItem" class="st-input" style="width:100%;margin-bottom:6px">${myInv.map(i=>`<option value="${i.id}" ${i.id===sellId?'selected':''}>${i.name}</option>`).join('')}</select>
            <input type="number" id="mktSellPrice" class="st-input" placeholder="Цена" min="1" value="100" style="width:100%;margin-bottom:6px">
            <button class="st-btn accent" onclick="marketSell()" style="width:100%">Выставить</button>
          </div>` : ''}
        `}
      </div>
    </div>
  </div>`;
}

async function marketSell() {
  const itemId=document.getElementById('mktSellItem')?.value;
  const price=parseInt(document.getElementById('mktSellPrice')?.value);
  if(!itemId||!price||price<1)return;
  const r=await api('/api/market/list',{method:'POST',body:{itemId,price}});
  if(r?.error){alert(r.error);return;} renderMarket();
}
async function marketBuy(id) {
  const r=await api(`/api/market/buy/${id}`,{method:'POST'});
  if(r?.error){alert(r.error);return;} renderMarket();
}
async function marketCancel(id) {
  await api(`/api/market/cancel/${id}`,{method:'POST'}); renderMarket();
}

function renderSettings() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page-title">Настройки</div>
    <div class="settings-list">
      <div class="settings-group">
        <div class="settings-label">О приложении</div>
        <div class="settings-item">
          <span>Версия</span>
          <span class="settings-val">Anixart PC v4.0</span>
        </div>
        <div class="settings-item">
          <span>Основано на</span>
          <span class="settings-val">Anixart API</span>
        </div>
      </div>
    </div>
  `;
}

// --- VK OAuth ---
const VK_APP_ID = 54493085;

function doVkLogin() {
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('vkBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Вход через ВК...'; }
  if (errEl) errEl.style.display = 'none';

  // VK OAuth implicit flow via popup
  const redirectUri = 'https://oauth.vk.com/blank.html';
  const vkUrl = `https://oauth.vk.com/authorize?client_id=${VK_APP_ID}&display=popup&redirect_uri=${encodeURIComponent(redirectUri)}&scope=email&response_type=token&v=5.131`;

  const popup = window.open(vkUrl, 'vk_auth', 'width=650,height=500,left=200,top=200');

  // Poll popup for token
  const timer = setInterval(() => {
    try {
      if (!popup || popup.closed) {
        clearInterval(timer);
        if (btn) { btn.disabled = false; btn.innerHTML = vkBtnContent(); }
        return;
      }
      const url = popup.location.href;
      if (url && url.indexOf('access_token=') !== -1) {
        clearInterval(timer);
        popup.close();

        // Parse token from hash
        const hash = url.split('#')[1];
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const email = params.get('email');

        console.log('VK token:', accessToken?.substring(0, 20) + '...', 'email:', email);

        // Send to our server
        sendVkToken(accessToken);
      }
    } catch (e) {
      // Cross-origin - popup still on VK domain, keep polling
    }
  }, 300);
}

async function sendVkToken(vkToken) {
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('vkBtn');

  const data = await api('/auth/anixart/vk', { method: 'POST', body: { vkToken } });

  if (data?.code === 0) {
    await loadUser();
    navigate('profile');
    toast('Вход через ВК выполнен!');
  } else {
    if (errEl) {
      errEl.textContent = data?.error || 'VK аккаунт не привязан к Anixart';
      errEl.style.display = 'block';
    }
    if (btn) { btn.disabled = false; btn.innerHTML = vkBtnContent(); }
  }
}

function vkBtnContent() {
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.02-1.304.587-1.496c.596-.189 1.362 1.259 2.174 1.815.614.42 1.08.328 1.08.328l2.172-.03s1.136-.07.597-.964c-.044-.073-.312-.66-1.609-1.866-1.357-1.263-1.175-1.059.46-3.245.995-1.33 1.392-2.142 1.268-2.49-.118-.33-.845-.243-.845-.243l-2.443.015s-.181-.025-.316.056c-.132.078-.216.26-.216.26s-.39 1.039-.909 1.923c-1.096 1.867-1.536 1.967-1.716 1.85-.419-.272-.314-1.093-.314-1.676 0-1.822.276-2.582-.537-2.779-.27-.065-.468-.108-1.157-.115-.883-.009-1.63.003-2.053.21-.281.138-.498.444-.366.462.163.022.532.1.728.364.253.342.244 1.108.244 1.108s.145 2.145-.34 2.41c-.333.183-.79-.19-1.77-1.895-.503-.874-.882-1.84-.882-1.84s-.073-.18-.204-.277c-.159-.118-.38-.155-.38-.155l-2.32.015s-.348.01-.476.161c-.114.134-.01.412-.01.412s1.839 4.3 3.924 6.467c1.911 1.987 4.082 1.857 4.082 1.857h.983z"/></svg> Войти через ВКонтакте';
}

// --- Login form ---
function loginForm() {
  return `
    <div class="login-container">
      <svg viewBox="0 0 100 100" width="64" height="64" style="margin-bottom:16px">
        <circle cx="50" cy="52" r="38" fill="#f0a030"/>
        <circle cx="50" cy="52" r="16" fill="#1b1b1b"/>
        <polygon points="22,22 38,38 22,38" fill="#333"/>
        <polygon points="78,22 62,38 78,38" fill="#333"/>
      </svg>
      <p style="font-size:18px;margin-bottom:4px;color:var(--text)">Вход</p>
      <p style="font-size:13px;margin-bottom:20px;color:var(--text-sec)">Введите логин и пароль</p>
      <div id="loginError" class="login-error"></div>
      <form onsubmit="doAnixLogin(event)" style="width:100%">
        <input type="text" id="loginInput" placeholder="Логин или email" autocomplete="username" class="login-input">
        <input type="password" id="passwordInput" placeholder="Пароль" autocomplete="current-password" class="login-input">
        <button type="submit" id="loginBtn" class="btn btn-accent login-btn">
          <i class="fas fa-sign-in-alt"></i> Войти
        </button>
      </form>
      <p style="font-size:12px;color:var(--text-sec);margin-top:16px">
        Нет аккаунта? <a href="#" onclick="navigate('register');return false" style="color:var(--accent)">Зарегистрироваться</a>
      </p>
    </div>
  `;
}

async function doTokenLogin() {
  const token = document.getElementById('tokenInput').value.trim();
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('tokenBtn');

  if (!token) {
    errEl.textContent = 'Вставьте токен';
    errEl.style.display = 'block';
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверка...'; }
  if (errEl) errEl.style.display = 'none';

  try {
    const data = await api('/auth/anixart/token', { method: 'POST', body: { token } });

    if (data?.code === 0) {
      await loadUser();
      navigate('profile');
      toast('Вход выполнен!');
    } else {
      if (errEl) {
        errEl.textContent = data?.error || 'Неверный токен';
        errEl.style.display = 'block';
      }
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-key"></i> Войти по токену'; }
    }
  } catch (e) {
    if (errEl) {
      errEl.textContent = 'Ошибка соединения';
      errEl.style.display = 'block';
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-key"></i> Войти по токену'; }
  }
}

async function doAnixLogin(e) {
  e.preventDefault();
  const login = document.getElementById('loginInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  if (!login || !password) {
    errEl.textContent = 'Введите логин и пароль';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Вход...';
  errEl.style.display = 'none';

  // Try local auth first
  const localData = await api('/api/auth/login', { method: 'POST', body: { login, password } });
  if (localData?.user) {
    user = localData.user;
    renderTopbar();
    navigate('profile');
    toast('Добро пожаловать, ' + user.name + '!');
    return;
  }

  // Fallback to Anixart auth
  const data = await api('/auth/anixart/login', { method: 'POST', body: { login, password } });
  if (data?.code === 0) {
    await loadUser();
    navigate('profile');
  } else {
    errEl.textContent = localData?.error || data?.error || 'Неверный логин или пароль';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';
  }
}

function needAuth() {
  return `<div class="empty" style="padding:60px">
    <i class="fas fa-lock" style="font-size:36px;color:var(--text-dim);margin-bottom:12px"></i>
    <p style="margin-bottom:16px">Войдите для доступа</p>
    <button class="btn btn-accent" onclick="navigate('profile')"><i class="fas fa-sign-in-alt"></i> Войти в Anixart</button>
  </div>`;
}

// --- Init ---
loadUser().then(() => {
  // Check hash for deep linking
  const hash = window.location.hash.slice(1);
  if (hash) {
    const [pg, paramStr] = hash.split('?');
    const params = {};
    if (paramStr) paramStr.split('&').forEach(p => {
      const [k, v] = p.split('=');
      params[k] = decodeURIComponent(v);
    });
    navigate(pg, params);
  } else {
    navigate('home');
  }
});

// ========== MANGA SECTION ==========

function mangaCard(m) {
  const slug = m.dir || m.slug || '';
  const title = esc(m.main_name || m.rus_name || m.title_ru || m.en_name || m.name || '');
  const cover = m.cover?.high || m.cover?.mid || m.cover?.low || m.img?.high || m.img?.mid || m.img?.low || m.cover || '';
  const coverUrl = cover.startsWith('http') ? cover : (cover ? `https://remanga.org${cover}` : '');
  const rating = m.avg_rating || m.rating || 0;
  const voCount = m.voiceover_count || 0;
  const chapters = m.count_chapters || m.chapters_count || 0;
  const typeName = m.type?.name || '';
  const statusName = m.status?.name || '';

  return `<div class="manga-card" onclick="navigate('manga-detail',{slug:'${slug}'})">
    <div class="manga-card-poster">
      <img src="${coverUrl}" alt="${title}" loading="lazy" onerror="this.style.opacity='0.3'">
      ${rating ? `<div class="score-badge">${parseFloat(rating).toFixed(1)}</div>` : ''}
      ${voCount ? `<div class="voiceover-count-badge"><i class="fas fa-microphone"></i> ${voCount}</div>` : ''}
      <div class="manga-card-overlay">
        ${chapters ? `<span class="manga-card-badge"><i class="fas fa-book"></i> ${chapters}</span>` : ''}
      </div>
    </div>
    <div class="manga-card-body">
      <div class="manga-card-title">${title}</div>
      ${typeName || statusName ? `<div class="manga-card-sub">${[typeName, statusName].filter(Boolean).join(' · ')}</div>` : ''}
    </div>
  </div>`;
}

// Parse chapter range from voiceover title (e.g. "1-220 главы", "глава 1-50", "chapters 1 to 100")
function parseChaptersFromTitle(title) {
  const patterns = [
    /(\d+)\s*[-–]\s*(\d+)\s*(глав|chapter|ch\.)/i,
    /(глав|chapter|ch\.?)\s*(\d+)\s*[-–]\s*(\d+)/i,
    /(\d+)\s*[-–]\s*(\d+)/
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) {
      const nums = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])].filter(n => !isNaN(n) && n > 0).sort((a,b)=>a-b);
      if (nums.length >= 2 && nums[nums.length-1] > nums[0]) return `${nums[0]}-${nums[nums.length-1]} гл.`;
    }
  }
  return '';
}

function formatDuration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

function voiceoverCard(v) {
  const sourceIcon = v.source === 'youtube' ? 'fab fa-youtube' : v.source === 'vk' ? 'fab fa-vk' : v.source === 'telegram' ? 'fab fa-telegram-plane' : v.source === 'rutube' ? 'fas fa-play-circle' : 'fas fa-video';
  const sourceColor = v.source === 'youtube' ? '#f44' : v.source === 'vk' ? '#4a90d9' : v.source === 'telegram' ? '#0088cc' : v.source === 'rutube' ? '#00c8aa' : '#29a';
  const dur = formatDuration(v.duration);
  const thumb = v.thumbnail || '';
  const chapters = parseChaptersFromTitle(v.title || '');
  const views = v.view_count || 0;

  return `<div class="voiceover-card" onclick="navigate('manga-player',{id:${v.id}})">
    <div class="voiceover-thumb">
      ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.style.opacity='0.2'">` : ''}
      ${dur ? `<span class="voiceover-dur">${dur}</span>` : ''}
      <i class="${sourceIcon} voiceover-source-icon" style="color:${sourceColor}"></i>
      <div class="voiceover-thumb-play"><i class="fas fa-play"></i></div>
    </div>
    <div class="voiceover-info">
      <div class="voiceover-title">${esc(v.title)}</div>
      <div class="voiceover-meta">
        <span class="voiceover-channel"><i class="fas fa-user"></i> ${esc(v.channel || v.author_name || 'Неизвестный')}</span>
        ${chapters ? `<span class="voiceover-chapters-badge"><i class="fas fa-book-open"></i> ${chapters}</span>` : ''}
        ${views ? `<span class="voiceover-views"><i class="fas fa-eye"></i> ${views}</span>` : ''}
      </div>
    </div>
  </div>`;
}

// === Auth Pages ===
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="max-width:400px;margin:40px auto">
      <h1 style="text-align:center;margin-bottom:24px"><i class="fas fa-sign-in-alt"></i> Вход</h1>
      <div id="authError" style="color:#f44;text-align:center;margin-bottom:12px;font-size:13px"></div>
      <div class="form-group">
        <label>Логин или Email</label>
        <input type="text" id="loginInput" class="form-input" placeholder="username или email" autofocus>
      </div>
      <div class="form-group">
        <label>Пароль</label>
        <input type="password" id="loginPassword" class="form-input" placeholder="••••••"
               onkeydown="if(event.key==='Enter')doLogin()">
      </div>
      <button class="btn btn-accent" style="width:100%;margin-top:12px" onclick="doLogin()">Войти</button>
      <p style="text-align:center;margin-top:16px;color:var(--text-sec);font-size:13px">
        Нет аккаунта? <a href="#" onclick="navigate('register');return false" style="color:var(--accent)">Зарегистрироваться</a>
      </p>
    </div>
  `;
}

async function doLogin() {
  const login = document.getElementById('loginInput')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  const errEl = document.getElementById('authError');
  if (!login || !password) { if (errEl) errEl.textContent = 'Заполните все поля'; return; }
  const data = await api('/api/auth/login', { method: 'POST', body: { login, password } });
  if (data?.error) { if (errEl) errEl.textContent = data.error; return; }
  if (data?.user) { user = data.user; renderTopbar(); navigate('home'); toast('Добро пожаловать, ' + user.name + '!'); }
}

function renderRegister() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="max-width:400px;margin:40px auto">
      <h1 style="text-align:center;margin-bottom:24px"><i class="fas fa-user-plus"></i> Регистрация</h1>
      <div id="authError" style="color:#f44;text-align:center;margin-bottom:12px;font-size:13px"></div>
      <div class="form-group">
        <label>Логин</label>
        <input type="text" id="regUsername" class="form-input" placeholder="username (a-z, 0-9, _)">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="regEmail" class="form-input" placeholder="email@example.com">
      </div>
      <div class="form-group">
        <label>Пароль</label>
        <input type="password" id="regPassword" class="form-input" placeholder="Минимум 6 символов"
               onkeydown="if(event.key==='Enter')doRegister()">
      </div>
      <button class="btn btn-accent" style="width:100%;margin-top:12px" onclick="doRegister()">Создать аккаунт</button>
      <p style="text-align:center;margin-top:16px;color:var(--text-sec);font-size:13px">
        Уже есть аккаунт? <a href="#" onclick="navigate('login');return false" style="color:var(--accent)">Войти</a>
      </p>
    </div>
  `;
}

async function doRegister() {
  const username = document.getElementById('regUsername')?.value?.trim();
  const email = document.getElementById('regEmail')?.value?.trim();
  const password = document.getElementById('regPassword')?.value;
  const errEl = document.getElementById('authError');
  if (!username || !email || !password) { if (errEl) errEl.textContent = 'Заполните все поля'; return; }
  const data = await api('/api/auth/register', { method: 'POST', body: { username, email, password } });
  if (data?.error) { if (errEl) errEl.textContent = data.error; return; }
  if (data?.user) { user = data.user; renderTopbar(); navigate('home'); toast('Аккаунт создан!'); }
}

// === Saved Page ===
// === LIBRARY (Steam-style) ===
let libSelected = null;

async function renderLibrary() {
  const app = document.getElementById('app');
  if (!user) { navigate('login'); return; }
  app.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const data = await api('/api/saved');
  const voiceovers = data?.voiceovers || [];

  if (!voiceovers.length) {
    app.innerHTML = `<div class="lib-empty">
      <i class="fas fa-book-open"></i>
      <h2>Библиотека пуста</h2>
      <p>Сохраняйте озвучки чтобы они появились здесь</p>
      <button class="btn btn-accent" onclick="navigate('manga')">Перейти в каталог</button>
    </div>`;
    return;
  }

  libSelected = libSelected || voiceovers[0];
  // Make sure selected is still in list
  if (!voiceovers.find(v => v.id === libSelected.id)) libSelected = voiceovers[0];

  app.innerHTML = `<div class="lib-wrap">
    <div class="lib-sidebar">
      <div class="lib-sidebar-head">
        <span>Озвучки</span>
        <span class="lib-count">${voiceovers.length}</span>
      </div>
      <div class="lib-list" id="libList">
        ${voiceovers.map(v => `
          <div class="lib-item ${v.id === libSelected.id ? 'active' : ''}" data-id="${v.id}" onclick="selectLibItem(${v.id})">
            <img class="lib-item-icon" src="${esc(v.thumbnail || '')}" onerror="this.style.opacity='0.2'">
            <div class="lib-item-info">
              <div class="lib-item-title">${esc(v.manga_title || v.title || '')}</div>
              <div class="lib-item-sub">${esc(v.channel || v.author_name || '')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="lib-main" id="libMain">
      ${renderLibDetail(libSelected)}
    </div>
  </div>`;

  // Store data for selection
  window._libVoiceovers = voiceovers;
}

function selectLibItem(id) {
  const voiceovers = window._libVoiceovers || [];
  const v = voiceovers.find(x => x.id === id);
  if (!v) return;
  libSelected = v;

  // Update sidebar active
  document.querySelectorAll('.lib-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.id) === id);
  });

  // Update main area
  const main = document.getElementById('libMain');
  if (main) main.innerHTML = renderLibDetail(v);
}

function renderLibDetail(v) {
  if (!v) return '';
  const thumb = v.thumbnail || '';
  const dur = typeof formatDuration === 'function' ? formatDuration(v.duration) : '';
  const sourceIcon = v.source === 'youtube' ? 'fab fa-youtube' : v.source === 'vk' ? 'fab fa-vk' : 'fas fa-video';
  const sourceColor = v.source === 'youtube' ? '#f44' : v.source === 'vk' ? '#4a90d9' : '#29a';

  return `
    <div class="lib-hero" style="background-image:url('${esc(thumb)}')">
      <div class="lib-hero-overlay"></div>
      <div class="lib-hero-content">
        <div class="lib-hero-title">${esc(v.manga_title || v.title || 'Без названия')}</div>
        <div class="lib-hero-sub">${esc(v.title || '')}</div>
      </div>
    </div>
    <div class="lib-actions">
      <button class="lib-play-btn" onclick="navigate('manga-player',{id:${v.id}})">
        <i class="fas fa-play"></i> СМОТРЕТЬ
      </button>
      <div class="lib-meta-row">
        <div class="lib-meta-item">
          <div class="lib-meta-label">ИСТОЧНИК</div>
          <div class="lib-meta-val"><i class="${sourceIcon}" style="color:${sourceColor}"></i> ${v.source || 'video'}</div>
        </div>
        ${dur ? `<div class="lib-meta-item">
          <div class="lib-meta-label">ДЛИТЕЛЬНОСТЬ</div>
          <div class="lib-meta-val">${dur}</div>
        </div>` : ''}
        ${v.view_count ? `<div class="lib-meta-item">
          <div class="lib-meta-label">ПРОСМОТРОВ</div>
          <div class="lib-meta-val">${v.view_count}</div>
        </div>` : ''}
      </div>
      <div class="lib-action-icons">
        <div class="lib-action-icon" title="Настройки"><i class="fas fa-cog"></i></div>
        <div class="lib-action-icon" title="Информация"><i class="fas fa-info-circle"></i></div>
        <div class="lib-action-icon" title="Вишлист"><i class="fas fa-heart"></i></div>
      </div>
    </div>
    <div class="lib-tabs">
      <a class="lib-tab active" onclick="navigate('manga-detail',{slug:'${esc(v.manga_slug || '')}'})">Страница манги</a>
      <a class="lib-tab" onclick="navigate('saved')">Все сохранённые</a>
    </div>
    <div class="lib-detail-section">
      <div class="lib-detail-head">ИНФОРМАЦИЯ</div>
      <div class="lib-detail-info">
        <div class="lib-info-row"><span>Канал</span><span>${esc(v.channel || v.author_name || '—')}</span></div>
        ${v.manga_title ? `<div class="lib-info-row"><span>Манга</span><span>${esc(v.manga_title)}</span></div>` : ''}
        ${v.source ? `<div class="lib-info-row"><span>Платформа</span><span>${v.source}</span></div>` : ''}
      </div>
    </div>
  `;
}

async function renderSavedPage() {
  const app = document.getElementById('app');
  if (!user) { navigate('login'); return; }
  app.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  const data = await api('/api/saved');
  const voiceovers = data?.voiceovers || [];
  app.innerHTML = `
    <div class="page-header">
      <h1><i class="fas fa-bookmark"></i> Сохранённые озвучки</h1>
      <p style="color:var(--text-sec);margin-top:4px">${voiceovers.length} сохранено</p>
    </div>
    <div class="voiceover-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">
      ${voiceovers.length ? voiceovers.map(v => voiceoverCard(v)).join('') : '<div class="empty-state" style="grid-column:1/-1;padding:40px"><i class="fas fa-bookmark" style="font-size:36px;color:var(--text-dim)"></i><p>Нет сохранённых озвучек</p></div>'}
    </div>
  `;
}

// === Wishlist Page ===
async function renderWishlistPage() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  const data = await api('/api/manga/wishlist/top');
  const items = data?.content || [];
  app.innerHTML = `
    <div class="page-header">
      <h1><i class="fas fa-heart"></i> Ждут озвучку</h1>
      <p style="color:var(--text-sec);margin-top:4px">Манга, которую люди хотят услышать</p>
    </div>
    <div class="manga-grid">
      ${items.length ? items.map(m => `
        <div class="manga-card" onclick="navigate('manga-detail',{slug:'${m.slug}'})">
          <div class="manga-card-poster">
            <img src="${m.cover?.startsWith?.('http') ? m.cover : (m.cover ? 'https://remanga.org' + m.cover : '')}" alt="" loading="lazy" onerror="this.style.opacity='0.3'">
            <div class="voiceover-count-badge" style="background:var(--accent)"><i class="fas fa-heart"></i> ${m.wish_count}</div>
          </div>
          <div class="manga-card-body">
            <div class="manga-card-title">${esc(m.title_ru || '')}</div>
          </div>
        </div>
      `).join('') : '<div class="empty-state" style="grid-column:1/-1;padding:40px"><i class="fas fa-heart" style="font-size:36px;color:var(--text-dim)"></i><p>Пока никто не добавил</p></div>'}
    </div>
  `;
}

// === Wish Button ===
async function loadWishButton(mangaId) {
  const wrap = document.getElementById('wishBtnWrap');
  if (!wrap) return;
  const data = await api(`/api/manga/${mangaId}/wish`);
  const wished = data?.wished;
  const count = data?.count || 0;
  wrap.innerHTML = `
    <button class="btn ${wished ? 'btn-accent' : 'btn-outline'}" onclick="toggleWish(${mangaId})" style="font-size:13px">
      <i class="fas fa-heart"></i> ${wished ? 'Жду озвучку' : 'Хочу озвучку'} ${count > 0 ? '(' + count + ')' : ''}
    </button>
  `;
}

async function toggleWish(mangaId) {
  if (!user) { navigate('login'); return; }
  const data = await api(`/api/manga/${mangaId}/wish`);
  if (data?.wished) {
    await api(`/api/manga/${mangaId}/wish`, { method: 'DELETE' });
  } else {
    await api(`/api/manga/${mangaId}/wish`, { method: 'POST' });
  }
  loadWishButton(mangaId);
}

// === Comments & Save ===
async function loadVoComments(voiceoverId) {
  const el = document.getElementById('commentsList');
  if (!el) return;
  const data = await api(`/api/voiceover/${voiceoverId}/comments`);
  const comments = data?.comments || [];
  if (!comments.length) { el.innerHTML = '<p style="color:var(--text-dim);font-size:13px">Пока нет комментариев</p>'; return; }
  el.innerHTML = comments.map(c => `
    <div class="comment-item" style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:grid;place-items:center;font-size:12px;font-weight:700;flex-shrink:0;color:#fff">
        ${c.user_avatar ? `<img src="${esc(c.user_avatar)}" style="width:32px;height:32px;border-radius:50%">` : (c.user_name||'?')[0].toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:var(--text-sec)">
          <strong style="color:var(--text)">${esc(c.user_name)}</strong>
          ${c.user_role === 'admin' ? '<span style="color:var(--accent);font-size:10px;margin-left:4px">ADMIN</span>' : ''}
          <span style="margin-left:8px">${timeAgo(c.created_at)}</span>
        </div>
        <p style="margin-top:4px;font-size:13px;word-break:break-word">${esc(c.text)}</p>
      </div>
      ${user && (c.user_id === user.id || (user.role === 'admin' || user.role === 'owner' || (user.roles && (user.roles.includes('admin') || user.roles.includes('owner'))))) ? `<button onclick="deleteComment(${c.id},${voiceoverId})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px"><i class="fas fa-trash"></i></button>` : ''}
    </div>
  `).join('');
}

async function postComment(voiceoverId) {
  if (!user) { navigate('login'); return; }
  const input = document.getElementById('commentInput');
  const text = input?.value?.trim();
  if (!text) return;
  await api(`/api/voiceover/${voiceoverId}/comments`, { method: 'POST', body: { text } });
  input.value = '';
  loadVoComments(voiceoverId);
}

async function deleteComment(commentId, voiceoverId) {
  await api(`/api/comment/${commentId}`, { method: 'DELETE' });
  loadVoComments(voiceoverId);
}

async function loadSaveStatus(voiceoverId) {
  const btn = document.getElementById('saveBtn');
  if (!btn || !user) return;
  const saved = await api('/api/saved');
  const isSaved = (saved?.voiceovers || []).some(v => v.id === voiceoverId);
  btn.className = isSaved ? 'btn btn-accent' : 'btn btn-outline';
  btn.style.fontSize = '12px';
  btn.innerHTML = `<i class="fas fa-bookmark"></i> ${isSaved ? 'Сохранено' : 'Сохранить'}`;
}

async function toggleSaveVo(voiceoverId) {
  if (!user) { navigate('login'); return; }
  const saved = await api('/api/saved');
  const isSaved = (saved?.voiceovers || []).some(v => v.id === voiceoverId);
  if (isSaved) {
    await api(`/api/voiceover/${voiceoverId}/save`, { method: 'DELETE' });
  } else {
    await api(`/api/voiceover/${voiceoverId}/save`, { method: 'POST' });
  }
  loadSaveStatus(voiceoverId);
}

function timeAgo(dateStr) {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff/60) + ' мин. назад';
  if (diff < 86400) return Math.floor(diff/3600) + ' ч. назад';
  if (diff < 604800) return Math.floor(diff/86400) + ' дн. назад';
  return new Date(dateStr).toLocaleDateString('ru');
}

// Active filters state
window._mangaFilters = { genre: '', channel: '', source: '', sort: 'popular' };

async function renderMangaCatalog(params = {}) {
  const app = document.getElementById('app');
  window._mangaQuery = params.q || '';

  app.innerHTML = `
    <div class="page-header">
      <h1><i class="fas fa-book-open"></i> Озвучка манги</h1>
      <p style="color:var(--text-sec);margin-top:4px" id="mangaCountInfo">Загрузка...</p>
    </div>
    <div class="manga-search-bar">
      <div class="search-box" style="max-width:100%">
        <i class="fas fa-search"></i>
        <input type="text" id="mangaSearchInput" placeholder="Поиск по названию..." value="${esc(window._mangaQuery)}"
               onkeydown="if(event.key==='Enter')doMangaSearch(this.value)">
      </div>
    </div>
    <div id="mangaFilters" class="manga-filters">
      <div class="manga-filters-row">
        <select id="filterGenre" onchange="applyMangaFilters()">
          <option value="">Все жанры</option>
        </select>
        <select id="filterChannel" onchange="applyMangaFilters()">
          <option value="">Все каналы</option>
        </select>
        <select id="filterSource" onchange="applyMangaFilters()">
          <option value="">Все платформы</option>
          <option value="youtube">YouTube</option>
          <option value="rutube">Rutube</option>
          <option value="vk">VK</option>
          <option value="telegram">Telegram</option>
        </select>
        <select id="filterSort" onchange="applyMangaFilters()">
          <option value="popular">По популярности</option>
          <option value="new">Новые</option>
          <option value="voiceovers">По кол-ву озвучек</option>
          <option value="rating">По рейтингу</option>
          <option value="name">По названию</option>
        </select>
      </div>
      <div id="activeFilters" class="active-filters"></div>
    </div>
    <div id="mangaGrid" class="manga-grid"></div>
  `;

  // Load ALL manga with voiceovers + filters
  const data = await api('/api/manga/popular?limit=500');
  const allManga = data?.content || [];
  window._allMangaWithVo = allManga;
  window._mangaFilterData = data?.filters || {};
  window._allVoiceoversCache = null;

  // Populate filter dropdowns
  const genreSelect = document.getElementById('filterGenre');
  const channelSelect = document.getElementById('filterChannel');
  if (data?.filters) {
    (data.filters.genres || []).forEach(g => {
      genreSelect.insertAdjacentHTML('beforeend', `<option value="${esc(g)}">${esc(g)}</option>`);
    });
    (data.filters.channels || []).forEach(c => {
      channelSelect.insertAdjacentHTML('beforeend', `<option value="${esc(c.name)}">${esc(c.name)} (${c.count})</option>`);
    });
  }

  const info = document.getElementById('mangaCountInfo');
  if (info) info.textContent = `${allManga.length} манг с озвучками`;

  renderMangaGrid(allManga);
}

async function loadVoiceoversForFilter() {
  if (window._allVoiceoversCache) return window._allVoiceoversCache;
  const data = await api('/api/manga/voiceovers/all');
  window._allVoiceoversCache = data?.voiceovers || [];
  return window._allVoiceoversCache;
}

async function applyMangaFilters() {
  const genre = document.getElementById('filterGenre')?.value || '';
  const channel = document.getElementById('filterChannel')?.value || '';
  const source = document.getElementById('filterSource')?.value || '';
  const sort = document.getElementById('filterSort')?.value || 'popular';
  window._mangaFilters = { genre, channel, source, sort };

  let items = [...(window._allMangaWithVo || [])];

  // Genre filter
  if (genre) {
    items = items.filter(m => (m.genres || []).includes(genre));
  }

  // Channel/source filter — need voiceover data
  if (channel || source) {
    const voiceovers = await loadVoiceoversForFilter();
    const mangaIds = new Set();
    voiceovers.forEach(v => {
      const matchChannel = !channel || (v.channel || v.author_name || '') === channel;
      const matchSource = !source || v.source === source;
      if (matchChannel && matchSource) mangaIds.add(v.manga_id);
    });
    items = items.filter(m => mangaIds.has(m.id));
  }

  // Sort
  if (sort === 'new') {
    items.sort((a, b) => new Date(b.cached_at || 0) - new Date(a.cached_at || 0));
  } else if (sort === 'voiceovers') {
    items.sort((a, b) => (b.voiceover_count || 0) - (a.voiceover_count || 0));
  } else if (sort === 'rating') {
    items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (sort === 'name') {
    items.sort((a, b) => (a.title_ru || '').localeCompare(b.title_ru || '', 'ru'));
  }

  // Show active filters
  const activeEl = document.getElementById('activeFilters');
  if (activeEl) {
    const tags = [];
    if (genre) tags.push(`<span class="filter-tag" onclick="document.getElementById('filterGenre').value='';applyMangaFilters()"><i class="fas fa-tag"></i> ${esc(genre)} <i class="fas fa-times"></i></span>`);
    if (channel) tags.push(`<span class="filter-tag" onclick="document.getElementById('filterChannel').value='';applyMangaFilters()"><i class="fas fa-user"></i> ${esc(channel)} <i class="fas fa-times"></i></span>`);
    if (source) tags.push(`<span class="filter-tag" onclick="document.getElementById('filterSource').value='';applyMangaFilters()"><i class="fas fa-globe"></i> ${source} <i class="fas fa-times"></i></span>`);
    activeEl.innerHTML = tags.join('');
  }

  const info = document.getElementById('mangaCountInfo');
  if (info) info.textContent = `${items.length} из ${window._allMangaWithVo?.length || 0} манг`;

  renderMangaGrid(items);
}

function renderMangaGrid(items) {
  const grid = document.getElementById('mangaGrid');
  if (!grid) return;
  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:40px">
      <i class="fas fa-microphone-slash" style="font-size:36px;color:var(--text-dim)"></i>
      <p style="margin-top:12px">Ничего не найдено</p>
    </div>`;
    return;
  }
  grid.innerHTML = items.map(m => mangaCard(m)).join('');
}

async function doMangaSearch(q) {
  q = q.trim().toLowerCase();
  window._mangaQuery = q;
  const all = window._allMangaWithVo || [];
  if (!q) {
    renderMangaGrid(all);
    return;
  }
  const filtered = all.filter(m => {
    const names = [m.title_ru, m.title_en, m.slug].filter(Boolean).join(' ').toLowerCase();
    return names.includes(q);
  });
  renderMangaGrid(filtered);

  // If few local results — auto-discover from internet
  if (filtered.length < 3 && q.length >= 3) {
    const grid = document.getElementById('mangaGrid');
    if (!grid) return;
    grid.insertAdjacentHTML('beforeend', `
      <div id="discoverStatus" style="grid-column:1/-1;text-align:center;padding:24px">
        <div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto 10px"></div>
        <p style="color:var(--text-sec);font-size:13px">Ищем озвучки на YouTube, VK, Rutube...</p>
      </div>
    `);

    const data = await api('/api/manga/discover', { method: 'POST', body: { query: q } });
    const results = data?.results || [];
    const statusEl = document.getElementById('discoverStatus');

    if (results.length === 0) {
      if (statusEl) statusEl.innerHTML = `
        <i class="fas fa-search" style="font-size:28px;color:var(--text-dim)"></i>
        <p style="margin-top:10px;color:var(--text-sec);font-size:13px">Озвучки для "${esc(q)}" не найдены</p>
      `;
      return;
    }

    // Merge discovered manga into local cache
    for (const m of results) {
      if (!all.find(x => x.id === m.id)) all.push(m);
    }
    window._allMangaWithVo = all;
    const info = document.getElementById('mangaCountInfo');
    if (info) info.textContent = `${all.length} манг с озвучками`;

    // Show combined: local filtered + discovered
    const combined = [...filtered];
    for (const m of results) {
      if (!combined.find(x => x.id === m.id)) combined.push(m);
    }
    renderMangaGrid(combined);
    toast(`Найдено ${results.length} манг с озвучками`);
  }
}

async function renderMangaDetail(slug) {
  const app = document.getElementById('app');
  if (!slug) return navigate('manga');

  app.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  const data = await api(`/api/manga/detail/${slug}`);
  const m = data?.content;
  if (!m) {
    app.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Манга не найдена</p></div>';
    return;
  }

  const cover = m.cover?.high || m.cover?.mid || m.cover?.low || m.img?.high || m.img?.mid || m.img?.low || '';
  const coverUrl = cover.startsWith('http') ? cover : (cover ? `https://remanga.org${cover}` : '');
  const genres = (m.genres || []).map(g => `<span class="genre-tag">${esc(g.name)}</span>`).join('');
  const mangaCacheId = data._cacheId || m.id;
  const mainName = m.main_name || m.rus_name || m.name || '';
  const secName = m.secondary_name || m.en_name || '';
  const rating = m.avg_rating ? parseFloat(m.avg_rating).toFixed(1) : '';
  const chapters = m.count_chapters || 0;
  const statusName = m.status?.name || '';
  const statusClass = statusName.toLowerCase().includes('продолж') || statusName.toLowerCase().includes('выход') ? 'ongoing'
    : statusName.toLowerCase().includes('заверш') ? 'completed' : 'announced';
  const typeName = m.type?.name || '';

  app.innerHTML = `
    <div class="manga-detail">
      <button onclick="navigate('manga')" class="btn btn-outline" style="margin-bottom:16px;font-size:13px">
        <i class="fas fa-arrow-left"></i> Каталог
      </button>

      <div class="manga-detail-header">
        <div class="manga-detail-cover">
          <img src="${coverUrl}" alt="${esc(mainName)}">
        </div>
        <div class="manga-detail-info">
          <h1>${esc(mainName)}</h1>
          ${secName ? `<p class="manga-detail-alt">${esc(secName)}</p>` : ''}

          <div class="manga-detail-stats">
            ${rating ? `<div class="manga-stat"><span class="manga-stat-val rating">${rating}</span><span class="manga-stat-label">Рейтинг</span></div>` : ''}
            ${chapters ? `<div class="manga-stat"><span class="manga-stat-val chapters">${chapters}</span><span class="manga-stat-label">Глав</span></div>` : ''}
            ${statusName ? `<div class="manga-stat"><span class="manga-stat-val ${statusClass === 'ongoing' ? 'status-active' : 'status-done'}" style="font-size:13px">${esc(statusName)}</span><span class="manga-stat-label">Статус</span></div>` : ''}
            ${typeName ? `<div class="manga-stat"><span class="manga-stat-val" style="font-size:13px">${esc(typeName)}</span><span class="manga-stat-label">Тип</span></div>` : ''}
          </div>

          <div class="manga-detail-genres">${genres}</div>
          <div id="wishBtnWrap" style="margin-top:12px"></div>

          ${m.description ? `
            <div class="manga-detail-desc" id="mangaDesc">${esc(m.description)}</div>
            <span class="desc-toggle" onclick="document.getElementById('mangaDesc').classList.toggle('expanded');this.textContent=this.textContent==='Показать всё'?'Свернуть':'Показать всё'">Показать всё</span>
          ` : ''}
        </div>
      </div>

      <div class="section manga-voiceovers-section">
        <div class="section-head">
          <div class="section-title"><i class="fas fa-microphone" style="color:var(--accent)"></i> Озвучки</div>
          <span class="voiceover-count-label" id="voiceoverCountLabel">...</span>
        </div>
        <div id="voiceoverChaptersInfo"></div>
        <div id="voiceoverList"><div class="loader"><div class="spinner"></div></div></div>
      </div>

      <div class="section manga-submit-section">
        <div class="section-head">
          <div class="section-title"><i class="fas fa-plus-circle" style="color:var(--accent)"></i> Добавить озвучку</div>
        </div>
        <p style="color:var(--text-sec);font-size:13px;margin:0 0 14px">Ты автор или нашёл озвучку? Добавь ссылку на YouTube, VK или Telegram</p>
        <div class="submit-form">
          <input type="text" id="submitUrl" placeholder="Ссылка на видео (YouTube, VK, Telegram)" class="login-input">
          <input type="text" id="submitAuthor" placeholder="Имя автора озвучки" class="login-input">
          <button onclick="submitVoiceover(${mangaCacheId})" class="btn btn-accent" style="width:100%">
            <i class="fas fa-paper-plane"></i> Добавить
          </button>
        </div>
      </div>
    </div>
  `;

  loadVoiceovers(mangaCacheId, chapters);
  // Load wish status
  loadWishButton(mangaCacheId);
}

async function loadVoiceovers(mangaId, totalChapters) {
  const container = document.getElementById('voiceoverList');
  if (!container) return;

  // First try cached
  let data = await api(`/api/manga/${mangaId}/voiceovers`);
  let voiceovers = data?.voiceovers || [];

  if (voiceovers.length === 0) {
    container.innerHTML = `<div style="display:flex;align-items:center;gap:10px;color:var(--text-sec);padding:12px 0">
      <div class="spinner" style="width:18px;height:18px;border-width:2px"></div>
      <span>Ищем озвучки в YouTube и VK...</span>
    </div>`;
    data = await api(`/api/manga/${mangaId}/voiceovers/search`, { method: 'POST' });
    voiceovers = data?.voiceovers || [];
  }

  // Update count label
  const countLabel = document.getElementById('voiceoverCountLabel');
  if (countLabel) countLabel.textContent = `${voiceovers.length} найдено`;

  if (voiceovers.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:30px">
      <i class="fas fa-microphone-slash" style="font-size:36px;color:var(--text-dim)"></i>
      <p style="margin-top:12px">Озвучки пока не найдены</p>
      <p style="color:var(--text-sec);font-size:13px">Добавь первую озвучку ниже!</p>
    </div>`;
    return;
  }

  // Analyze chapter coverage from titles
  let maxChapter = 0;
  voiceovers.forEach(v => {
    const m = (v.title || '').match(/(\d+)\s*[-–]\s*(\d+)/);
    if (m) maxChapter = Math.max(maxChapter, parseInt(m[2]));
  });

  const chaptersInfo = document.getElementById('voiceoverChaptersInfo');
  if (chaptersInfo && maxChapter > 0) {
    const pct = totalChapters ? Math.min(100, Math.round(maxChapter / totalChapters * 100)) : 0;
    chaptersInfo.innerHTML = `<div class="voiceover-chapters-info">
      <i class="fas fa-book-reader"></i>
      <div class="voiceover-chapters-text">
        Озвучено до <strong>${maxChapter} главы</strong>${totalChapters ? ` из ${totalChapters} (${pct}%)` : ''}
        ${pct > 0 ? `<div style="margin-top:6px;height:4px;background:var(--bg-elevated);border-radius:2px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:2px"></div>
        </div>` : ''}
      </div>
    </div>`;
  }

  container.innerHTML = `<div class="voiceover-grid">${voiceovers.map(v => voiceoverCard(v)).join('')}</div>`;
}

async function submitVoiceover(mangaId) {
  const url = document.getElementById('submitUrl')?.value.trim();
  const author = document.getElementById('submitAuthor')?.value.trim();
  if (!url) { toast('Вставь ссылку на видео'); return; }

  const data = await api(`/api/manga/${mangaId}/voiceovers/submit`, {
    method: 'POST', body: { url, author_name: author, title: '' }
  });

  if (data?.ok) {
    toast('Озвучка добавлена!');
    document.getElementById('submitUrl').value = '';
    document.getElementById('submitAuthor').value = '';
    loadVoiceovers(mangaId);
  } else {
    toast(data?.error || 'Ошибка');
  }
}

async function renderMangaPlayer(voiceoverId) {
  const app = document.getElementById('app');
  if (!voiceoverId) return navigate('manga');

  app.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const data = await api(`/api/video/extract?id=${voiceoverId}`);
  if (data?.title) api('/api/watching', { method: 'POST', body: { title: data.title } });
  if (!data) {
    app.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Видео не найдено</p></div>';
    return;
  }

  let playerHtml;
  if (data.direct_url) {
    // Proxy through our server to avoid CORS
    const proxyUrl = `/api/video/proxy?id=${voiceoverId}`;
    playerHtml = `<div style="position:relative;width:100%;padding-bottom:56.25%;background:#000">
      <video id="mangaVideoPlayer" controls autoplay style="position:absolute;top:0;left:0;width:100%;height:100%">
        <source src="${proxyUrl}" type="video/mp4">
      </video>
    </div>`;
  } else if (data.embed_url) {
    playerHtml = `<div style="position:relative;width:100%;padding-bottom:56.25%"><iframe id="mangaVideoEmbed" src="${data.embed_url}" style="position:absolute;top:0;left:0;width:100%;height:100%" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe></div>`;
  } else if (data.url) {
    playerHtml = `<div class="empty-state" style="padding:40px">
      <i class="fas fa-external-link-alt" style="font-size:48px;color:var(--accent)"></i>
      <p style="margin:16px 0 8px">Прямое воспроизведение недоступно</p>
      <a href="${esc(data.url)}" target="_blank" class="btn btn-accent">Открыть в источнике</a>
    </div>`;
  } else {
    playerHtml = '<div class="empty-state"><p>Не удалось загрузить видео</p></div>';
  }

  const sourceIcon = data.source === 'youtube' ? 'fab fa-youtube' : data.source === 'vk' ? 'fab fa-vk' : data.source === 'telegram' ? 'fab fa-telegram-plane' : data.source === 'rutube' ? 'fas fa-play-circle' : 'fas fa-video';
  const sourceColor = data.source === 'youtube' ? '#f44' : data.source === 'vk' ? '#4a90d9' : data.source === 'telegram' ? '#0088cc' : data.source === 'rutube' ? '#00c8aa' : '#29a';
  const chapters = parseChaptersFromTitle(data.title || '');

  app.innerHTML = `
    <div class="manga-player-page">
      <div class="manga-player-container">${playerHtml}</div>
      <div class="manga-player-info">
        <h2><i class="${sourceIcon}" style="color:${sourceColor}"></i> ${esc(data.title || 'Озвучка')}</h2>
        <div class="manga-player-meta">
          ${chapters ? `<span><i class="fas fa-book-open"></i> ${chapters}</span>` : ''}
          <span><i class="fas fa-play-circle"></i> ${data.source === 'youtube' ? 'YouTube' : data.source === 'vk' ? 'ВКонтакте' : data.source === 'telegram' ? 'Telegram' : data.source === 'rutube' ? 'Rutube' : 'Источник'}</span>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button id="saveBtn" class="btn btn-outline" style="font-size:12px" onclick="toggleSaveVo(${data.voiceover_id || voiceoverId})">
            <i class="fas fa-bookmark"></i> Сохранить
          </button>
        </div>
        <button onclick="history.back()" class="btn btn-outline" style="margin-top:14px">
          <i class="fas fa-arrow-left"></i> Назад к манге
        </button>
      </div>
      <div class="comments-section" style="margin-top:16px">
        <h3 style="font-size:14px;margin-bottom:12px"><i class="fas fa-comments"></i> Комментарии</h3>
        ${user ? `
          <div style="display:flex;gap:8px;margin-bottom:16px">
            <input type="text" id="commentInput" class="form-input" placeholder="Написать комментарий..." style="flex:1"
                   onkeydown="if(event.key==='Enter')postComment(${voiceoverId})">
            <button class="btn btn-accent" onclick="postComment(${voiceoverId})" style="font-size:12px">Отправить</button>
          </div>
        ` : `<p style="color:var(--text-sec);font-size:13px;margin-bottom:12px"><a href="#" onclick="navigate('login');return false" style="color:var(--accent)">Войдите</a>, чтобы комментировать</p>`}
        <div id="commentsList">Загрузка...</div>
      </div>
    </div>
  `;
  loadVoComments(voiceoverId);
  loadSaveStatus(voiceoverId);
}

// === Creator System ===

async function renderCreatorDashboard() {
  const res = await fetch('/api/creator/dashboard');
  const data = await res.json();
  if (data.error) {
    document.getElementById('app').innerHTML = `
      <div class="page-content" style="text-align:center;padding:60px 20px;">
        <i class="fas fa-microphone-alt" style="font-size:48px;color:var(--text-sec);margin-bottom:20px;"></i>
        <h2 style="color:var(--text-pri);margin-bottom:12px;">Стань создателем контента</h2>
        <p style="color:var(--text-sec);margin-bottom:24px;">Подай заявку на верификацию и получи доступ к дашборду, бейджам и статистике</p>
        <button onclick="navigate('creator-request')" class="btn btn-accent" style="padding:12px 32px;font-size:16px;">Подать заявку</button>
      </div>`;
    return;
  }
  const { stats, user: u, profile } = data;
  const levelColors = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };
  const levelNames = { bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', diamond: 'Алмаз' };
  const levelIcons = { bronze: 'fa-medal', silver: 'fa-medal', gold: 'fa-crown', diamond: 'fa-gem' };

  document.getElementById('app').innerHTML = `
    <div class="page-content">
      <div class="creator-dashboard-header">
        <div style="display:flex;align-items:center;gap:16px;">
          <div class="creator-avatar">${u.avatar ? `<img src="${u.avatar}" alt="">` : `<i class="fas fa-user"></i>`}</div>
          <div>
            <h2 style="color:var(--text-pri);margin:0;">${u.name} <span class="creator-badge" style="background:${levelColors[stats.level]}"><i class="fas ${levelIcons[stats.level]}"></i> ${levelNames[stats.level]}</span></h2>
            <p style="color:var(--text-sec);margin:4px 0 0;">Создатель контента ${profile.creator_verified ? '<i class="fas fa-check-circle" style="color:#4CAF50;margin-left:4px;" title="Верифицирован"></i>' : ''}</p>
          </div>
        </div>
        <button onclick="navigate('creator-profile',{id:'${u.id}'})" class="btn btn-outline" style="padding:8px 20px;">Мой профиль</button>
      </div>

      <div class="creator-stats-grid">
        <div class="creator-stat-card"><div class="stat-number">${stats.total_voiceovers}</div><div class="stat-label">Озвучек</div></div>
        <div class="creator-stat-card"><div class="stat-number">${stats.manga_count}</div><div class="stat-label">Манг</div></div>
        <div class="creator-stat-card"><div class="stat-number">${stats.total_views}</div><div class="stat-label">Просмотров</div></div>
        <div class="creator-stat-card"><div class="stat-number">${stats.total_saves}</div><div class="stat-label">Сохранений</div></div>
        <div class="creator-stat-card"><div class="stat-number">${stats.total_comments}</div><div class="stat-label">Комментариев</div></div>
      </div>

      <div class="creator-level-progress">
        <h3 style="color:var(--text-pri);margin-bottom:12px;">Уровень: ${levelNames[stats.level]}</h3>
        <div class="level-bar-bg">
          <div class="level-bar-fill" style="width:${stats.total_voiceovers >= 50 ? 100 : Math.min(100, (stats.total_voiceovers / 50) * 100)}%;background:${levelColors[stats.level]}"></div>
        </div>
        <p style="color:var(--text-sec);font-size:13px;margin-top:8px;">
          ${stats.level === 'diamond' ? 'Максимальный уровень достигнут!' :
            stats.level === 'gold' ? `${50 - stats.total_voiceovers} озвучек до Алмаза` :
            stats.level === 'silver' ? `${20 - stats.total_voiceovers} озвучек до Золота` :
            `${5 - stats.total_voiceovers} озвучек до Серебра`}
        </p>
      </div>

      <h3 style="color:var(--text-pri);margin:24px 0 12px;">Мои озвучки</h3>
      <div class="voiceover-list">
        ${stats.voiceovers.length ? stats.voiceovers.map(v => `
          <div class="creator-vo-item" onclick="navigate('manga-player',{id:'${v.id}'})">
            <img src="${v.thumbnail || ''}" class="creator-vo-thumb" onerror="this.style.display='none'">
            <div class="creator-vo-info">
              <div class="creator-vo-title">${v.title || 'Без названия'}</div>
              <div class="creator-vo-meta">${v.manga_title} · ${v.view_count || 0} просмотров</div>
            </div>
          </div>
        `).join('') : '<p style="color:var(--text-sec);">Озвучки не найдены. Привяжите ваши каналы в настройках профиля.</p>'}
      </div>
    </div>`;
}

async function renderCreatorProfile(creatorId) {
  if (!creatorId) return;
  const res = await fetch('/api/creator/' + creatorId);
  const data = await res.json();
  if (data.error) {
    document.getElementById('app').innerHTML = `<div class="page-content" style="text-align:center;padding:60px;"><p style="color:var(--text-sec);">${data.error}</p></div>`;
    return;
  }
  const { creator, profile, stats, voiceovers } = data;
  const levelColors = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };
  const levelNames = { bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', diamond: 'Алмаз' };
  const levelIcons = { bronze: 'fa-medal', silver: 'fa-medal', gold: 'fa-crown', diamond: 'fa-gem' };

  const social = profile.social_links || {};
  const socialHtml = [
    social.youtube ? `<a href="${social.youtube}" target="_blank" class="social-link youtube"><i class="fab fa-youtube"></i> YouTube</a>` : '',
    social.telegram ? `<a href="https://t.me/${social.telegram.replace('@','')}" target="_blank" class="social-link telegram"><i class="fab fa-telegram"></i> Telegram</a>` : '',
    social.vk ? `<a href="${social.vk}" target="_blank" class="social-link vk"><i class="fab fa-vk"></i> VK</a>` : '',
    social.boosty ? `<a href="${social.boosty}" target="_blank" class="social-link boosty"><i class="fas fa-heart"></i> Boosty</a>` : ''
  ].filter(Boolean).join('');

  document.getElementById('app').innerHTML = `
    <div class="page-content">
      <div class="creator-profile-header" style="background:${profile.banner_color || 'linear-gradient(135deg, var(--accent), #9c27b0)'};">
        <div class="creator-profile-avatar">${creator.avatar ? `<img src="${creator.avatar}" alt="">` : `<i class="fas fa-user"></i>`}</div>
      </div>
      <div class="creator-profile-body">
        <h2 style="color:var(--text-pri);margin:0 0 4px;">
          ${creator.name}
          <span class="creator-badge" style="background:${levelColors[stats.level]}"><i class="fas ${levelIcons[stats.level]}"></i> ${levelNames[stats.level]}</span>
          ${profile.creator_verified ? '<i class="fas fa-check-circle" style="color:#4CAF50;font-size:18px;" title="Верифицирован"></i>' : ''}
        </h2>
        <p style="color:var(--text-sec);margin:0 0 12px;">@${creator.username}</p>
        ${profile.bio ? `<p style="color:var(--text-pri);margin:0 0 16px;">${profile.bio}</p>` : ''}
        ${socialHtml ? `<div class="social-links-row">${socialHtml}</div>` : ''}

        <div class="creator-stats-grid" style="margin-top:20px;">
          <div class="creator-stat-card"><div class="stat-number">${stats.total_voiceovers}</div><div class="stat-label">Озвучек</div></div>
          <div class="creator-stat-card"><div class="stat-number">${stats.manga_count}</div><div class="stat-label">Манг</div></div>
          <div class="creator-stat-card"><div class="stat-number">${stats.total_views}</div><div class="stat-label">Просмотров</div></div>
        </div>

        <h3 style="color:var(--text-pri);margin:24px 0 12px;">Озвучки (${voiceovers.length})</h3>
        <div class="voiceover-list">
          ${voiceovers.map(v => `
            <div class="creator-vo-item" onclick="navigate('manga-player',{id:'${v.id}'})">
              <img src="${v.thumbnail || ''}" class="creator-vo-thumb" onerror="this.style.display='none'">
              <div class="creator-vo-info">
                <div class="creator-vo-title">${v.title || 'Без названия'}</div>
                <div class="creator-vo-meta">${v.manga_title} · ${v.view_count || 0} просмотров</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
}

async function renderCreatorsList() {
  const res = await fetch('/api/creators');
  const { creators } = await res.json();
  const levelColors = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };
  const levelNames = { bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', diamond: 'Алмаз' };
  const levelIcons = { bronze: 'fa-medal', silver: 'fa-medal', gold: 'fa-crown', diamond: 'fa-gem' };

  document.getElementById('app').innerHTML = `
    <div class="page-content">
      <h2 style="color:var(--text-pri);margin-bottom:20px;"><i class="fas fa-microphone-alt"></i> Озвучкеры</h2>
      <div class="creators-grid">
        ${creators.length ? creators.map(c => `
          <div class="creator-card" onclick="navigate('creator-profile',{id:'${c.id}'})">
            <div class="creator-card-avatar">${c.avatar ? `<img src="${c.avatar}" alt="">` : `<i class="fas fa-user"></i>`}</div>
            <div class="creator-card-info">
              <div class="creator-card-name">${c.name} <span class="creator-badge-sm" style="background:${levelColors[c.stats.level]}"><i class="fas ${levelIcons[c.stats.level]}"></i></span></div>
              <div class="creator-card-stats">${c.stats.total_voiceovers} озвучек · ${c.stats.manga_count} манг</div>
            </div>
          </div>
        `).join('') : '<p style="color:var(--text-sec);">Пока нет верифицированных озвучкеров</p>'}
      </div>
    </div>`;
}

async function renderCreatorRequest() {
  if (!user) { navigate('login'); return; }
  const res = await fetch('/api/creator/my-requests');
  const { requests } = await res.json();
  const pending = requests?.find(r => r.status === 'pending');
  const approved = requests?.find(r => r.status === 'approved');

  if (approved) { navigate('creator-dashboard'); return; }

  document.getElementById('app').innerHTML = `
    <div class="page-content" style="max-width:600px;margin:0 auto;">
      <h2 style="color:var(--text-pri);margin-bottom:8px;">Заявка на верификацию</h2>
      <p style="color:var(--text-sec);margin-bottom:24px;">Подтвердите, что вы создатель озвучек манги. Укажите ваши каналы.</p>
      ${pending ? `
        <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center;">
          <i class="fas fa-clock" style="font-size:32px;color:#FF9800;margin-bottom:12px;"></i>
          <h3 style="color:var(--text-pri);margin:0 0 8px;">Заявка на рассмотрении</h3>
          <p style="color:var(--text-sec);margin:0;">Отправлена ${new Date(pending.requested_at).toLocaleDateString('ru')}</p>
        </div>
      ` : `
        <form onsubmit="submitCreatorRequest(event)" id="creator-request-form">
          <div class="form-group">
            <label style="color:var(--text-pri);font-weight:600;">YouTube канал</label>
            <input type="text" class="form-input" id="cr-youtube" placeholder="https://youtube.com/@ваш_канал">
          </div>
          <div class="form-group">
            <label style="color:var(--text-pri);font-weight:600;">Telegram канал</label>
            <input type="text" class="form-input" id="cr-telegram" placeholder="@ваш_канал">
          </div>
          <div class="form-group">
            <label style="color:var(--text-pri);font-weight:600;">VK (необязательно)</label>
            <input type="text" class="form-input" id="cr-vk" placeholder="https://vk.com/...">
          </div>
          <div class="form-group">
            <label style="color:var(--text-pri);font-weight:600;">Расскажите о себе</label>
            <textarea class="form-input" id="cr-desc" rows="3" placeholder="Какие манги озвучиваете, сколько подписчиков..." style="resize:vertical;"></textarea>
          </div>
          <button type="submit" class="btn btn-accent" style="width:100%;padding:14px;font-size:16px;">Отправить заявку</button>
        </form>
      `}
    </div>`;
}

async function submitCreatorRequest(e) {
  e.preventDefault();
  const channel_urls = [
    document.getElementById('cr-youtube').value,
    document.getElementById('cr-telegram').value,
    document.getElementById('cr-vk').value
  ].filter(Boolean);
  if (!channel_urls.length) return alert('Укажите хотя бы один канал');
  const description = document.getElementById('cr-desc').value;
  const res = await fetch('/api/creator/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel_urls, description })
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  navigate('creator-request');
}

async function renderAdminCreatorRequests() {
  if (!user || user.role !== 'admin') { navigate(''); return; }
  const res = await fetch('/api/creator/requests');
  const { requests } = await res.json();

  document.getElementById('app').innerHTML = `
    <div class="page-content">
      <h2 style="color:var(--text-pri);margin-bottom:20px;">Заявки озвучкеров</h2>
      <div class="admin-requests-list">
        ${requests.length ? requests.map(r => `
          <div class="admin-request-card" data-id="${r.id}">
            <div class="admin-request-header">
              <strong style="color:var(--text-pri);">${r.user_name}</strong> (@${r.user_username})
              <span class="request-status request-status-${r.status}">${r.status === 'pending' ? 'Ожидает' : r.status === 'approved' ? 'Одобрено' : 'Отклонено'}</span>
            </div>
            <div style="color:var(--text-sec);font-size:13px;margin:8px 0;">
              ${r.channel_urls.map(u => `<a href="${u.startsWith('http') ? u : '#'}" target="_blank" style="color:var(--accent);">${u}</a>`).join(' · ')}
            </div>
            ${r.description ? `<p style="color:var(--text-pri);font-size:14px;margin:8px 0;">${r.description}</p>` : ''}
            <div style="font-size:12px;color:var(--text-sec);">${new Date(r.requested_at).toLocaleDateString('ru')}</div>
            ${r.status === 'pending' ? `
              <div style="display:flex;gap:8px;margin-top:12px;">
                <button onclick="reviewCreatorReq(${r.id},'approved')" class="btn btn-accent" style="padding:8px 20px;background:#4CAF50;">Одобрить</button>
                <button onclick="reviewCreatorReq(${r.id},'rejected')" class="btn btn-outline" style="padding:8px 20px;color:#f44336;">Отклонить</button>
              </div>
            ` : ''}
          </div>
        `).join('') : '<p style="color:var(--text-sec);">Заявок нет</p>'}
      </div>
    </div>`;
}

async function reviewCreatorReq(id, status) {
  const note = status === 'rejected' ? prompt('Причина отклонения (необязательно):') : null;
  const res = await fetch('/api/creator/requests/' + id + '/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note })
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  renderAdminCreatorRequests();
}

// === Gamification ===
async function loadXPBadge() {
  if (!user) return;
  try {
    const res = await fetch('/api/me/xp');
    const data = await res.json();
    const badge = document.getElementById('xp-badge');
    if (badge) {
      badge.innerHTML = `<span class="xp-level-badge" title="${data.xp} XP">Ур. ${data.level}</span>`;
      badge.style.display = 'inline';
    }
  } catch(e) {}
}

async function renderAchievements() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="page-content"><p style="color:var(--text-sec);">Загрузка...</p></div>';
  const res = await fetch('/api/me/achievements');
  const data = await res.json();
  const xpRes = await fetch('/api/me/xp');
  const xpData = await xpRes.json();

  app.innerHTML = `
    <div class="page-content">
      <div class="achievements-header">
        <div class="xp-display">
          <div class="xp-level-circle">${xpData.level}</div>
          <div>
            <div style="color:var(--text);font-weight:700;font-size:18px;">Уровень ${xpData.level}</div>
            <div style="color:var(--text-sec);font-size:13px;">${xpData.xp} XP</div>
          </div>
        </div>
        <div class="xp-progress-bar">
          <div class="xp-progress-fill" style="width:${xpData.progress}%"></div>
        </div>
        <div style="color:var(--text-sec);font-size:12px;margin-top:4px;">До уровня ${xpData.level + 1}: ${xpData.next_level_xp - xpData.xp} XP</div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin:24px 0 16px;">
        <h2 style="color:var(--text);margin:0;">Достижения</h2>
        <span style="color:var(--text-sec);font-size:14px;">${data.earned_count} / ${data.total_count}</span>
      </div>

      <div class="achievements-grid">
        ${data.achievements.map(a => `
          <div class="achievement-card ${a.earned ? 'earned' : 'locked'}">
            <div class="achievement-icon ${a.earned ? '' : 'locked-icon'}"><i class="fas ${a.icon}"></i></div>
            <div class="achievement-info">
              <div class="achievement-name">${a.name}</div>
              <div class="achievement-desc">${a.desc}</div>
              ${a.earned ? `<div class="achievement-date">${new Date(a.earned_at).toLocaleDateString('ru')}</div>` : `<div class="achievement-xp">+${a.xp} XP</div>`}
            </div>
          </div>
        `).join('')}
      </div>

      <div style="text-align:center;margin-top:24px;">
        <button onclick="navigate('leaderboard')" class="btn btn-outline" style="padding:10px 24px;">Таблица лидеров</button>
      </div>
    </div>`;
}

async function renderLeaderboard() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="page-content"><p style="color:var(--text-sec);">Загрузка...</p></div>';
  const res = await fetch('/api/leaderboard');
  const { leaderboard } = await res.json();

  app.innerHTML = `
    <div class="page-content">
      <h2 style="color:var(--text);margin-bottom:20px;"><i class="fas fa-trophy" style="color:#ffd700;"></i> Таблица лидеров</h2>
      <div class="leaderboard-list">
        ${leaderboard.length ? leaderboard.map((u, i) => `
          <div class="leaderboard-row ${i < 3 ? 'top-' + (i+1) : ''}">
            <div class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</div>
            <div class="lb-avatar">${u.avatar ? `<img src="${u.avatar}" alt="">` : `<i class="fas fa-user"></i>`}</div>
            <div class="lb-info">
              <div class="lb-name">${u.name} ${u.role === 'creator' ? '<i class="fas fa-check-circle" style="color:#4CAF50;font-size:12px;"></i>' : ''}</div>
              <div class="lb-username">@${u.username || 'user'}</div>
            </div>
            <div class="lb-stats">
              <div class="lb-level">Ур. ${u.level}</div>
              <div class="lb-xp">${u.xp} XP</div>
            </div>
          </div>
        `).join('') : '<p style="color:var(--text-sec);text-align:center;">Пока никого нет</p>'}
      </div>
    </div>`;
}

// === Crawler ===
