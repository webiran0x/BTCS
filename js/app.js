// App shell: router, navigation, search, live ticker, theme, currency, language,
// account menu, cloud sync and the alerts watcher.
import { CONFIG } from './config.js';
import { $, $$, icon, coinLogo, toast, modal } from './ui.js';
import { esc, price, changeHtml, money, pct } from './format.js';
import { settings, load, save, remove, tidyStorage } from './store.js';
import { tidyHttpCache } from './api/http.js';
import { cloudLearning } from './lib/cloudlearn.js';
import { markets, searchCoins, dataStatus, syncExchangeClock, findCoin, getCandles } from './api/market.js';
import { generateSignal } from './lib/signals.js';
import { live } from './api/live.js';
import { fx, initCurrency, setCurrency } from './api/fx.js';
import { t, applyDir } from './i18n.js';
import { auth, sb, backendEnabled, isAdmin, signOut, pullUserData, pushUserData, serverAlerts, serverAiAlerts, trackPageView, getAppSettings } from './api/backend.js';
import { createSync, SYNCED_KEYS, TRADING_KEYS } from './lib/cloudsync.js';
import { DEPS } from './deps.js';

// Clickjacking guard. GitHub Pages cannot send a frame-ancestors header and
// browsers ignore that directive in a <meta> CSP, so a page inside another
// site's frame hides itself. Same-origin frames (the portfolio on the same
// github.io host) are allowed: reading top.location only works for them.
if (typeof window !== 'undefined' && window.top !== window.self) {
  let sameOrigin = false;
  try { sameOrigin = window.top.location.origin === window.location.origin; } catch { /* another site */ }
  if (!sameOrigin) document.documentElement.style.visibility = 'hidden';
}

const NAV = [
  { path: '', label: 'بازارها', icon: 'markets', short: 'بازارها' },
  { path: 'advice', label: 'اسکن بازار', icon: 'bolt', short: 'اسکن' },
  { path: 'ai', label: 'دستیار هوشمند', icon: 'ai', short: 'پرسش' },
  { path: 'trader', label: 'معاملات', icon: 'forecast', short: 'معاملات' },
  { path: 'learn', label: 'یادگیری هوش مصنوعی', icon: 'ai', short: 'یادگیری' },
  { path: 'scanner', label: 'اسکنر', icon: 'scanner', short: 'اسکنر' },
  { path: 'track', label: 'سابقه عملکرد', icon: 'forecast', short: 'سوابق' },
  { path: 'futures', label: 'فیوچرز', icon: 'bolt', short: 'فیوچرز' },
  { path: 'news', label: 'اخبار', icon: 'info', short: 'اخبار' },
  { path: 'compare', label: 'مقایسه', icon: 'compare', short: 'مقایسه' },
  { path: 'tools', label: 'ابزارها', icon: 'calc', short: 'ابزارها' },
  { path: 'exchanges', label: 'صرافی‌ها', icon: 'exchanges', short: 'صرافی‌ها' },
  { path: 'wallet', label: 'کیف پول', icon: 'wallet', short: 'کیف پول' },
  { path: 'alerts', label: 'هشدارها', icon: 'alerts', short: 'هشدارها' },
  { path: 'premium', label: 'اشتراک ویژه', icon: 'star', short: 'ویژه' },
];
const ADMIN_NAV = { path: 'admin', label: 'مدیریت', icon: 'chip', short: 'مدیریت' };
// Four destinations plus "More" — five cells, which is what fits a phone row.
const MOBILE = ['', 'advice', 'ai', 'wallet'];


// Route name → page module in js/views/.
const VIEWS = {
  '': 'markets',
  coin: 'coin',
  advice: 'advice',
  ai: 'assistant',
  trader: 'trader',
  learn: 'learn',
  scanner: 'scanner',
  track: 'track',
  futures: 'futures',
  news: 'news',
  compare: 'compare',
  tools: 'tools',
  exchanges: 'exchanges',
  wallet: 'wallet',
  alerts: 'alerts',
  premium: 'premium',
  account: 'account',
  admin: 'admin',
  legal: 'legal',
};

let cleanup = null;
let routeSeq = 0;

function navItems() {
  return isAdmin() ? [...NAV, ADMIN_NAV] : NAV;
}

function renderNav() {
  const cur = location.hash.replace(/^#\/?/, '').split('/')[0];
  $('#nav').innerHTML = navItems().map((n) =>
    `<a href="#/${n.path}" class="${cur === n.path ? 'on' : ''}"${cur === n.path ? ' aria-current="page"' : ''}>${icon(n.icon)}<span>${esc(t(n.label))}</span>${n.badge ? `<em class="badge">${esc(n.badge)}</em>` : ''}</a>`).join('');
  $('#bottombar').innerHTML = `${MOBILE.map((p) => {
    const n = NAV.find((x) => x.path === p);
    return `<a href="#/${p}" class="${cur === p ? 'on' : ''}"${cur === p ? ' aria-current="page"' : ''}>${icon(n.icon, 22)}<span>${esc(t(n.short))}</span></a>`;
  }).join('')}<button id="moreBtn" type="button" aria-haspopup="dialog" class="${MOBILE.includes(cur) ? '' : 'on'}">${icon('more', 22)}<span>${esc(t('بیشتر'))}</span></button>`;
  $('#moreBtn').addEventListener('click', openMore);
}

function openMore() {
  const cur = location.hash.replace(/^#\/?/, '').split('/')[0];
  const rest = navItems().filter((n) => !MOBILE.includes(n.path));
  const m = modal(`<h3>${esc(t('منو'))}</h3>
    <div class="sheet-grid">${rest.map((n) => `<a href="#/${n.path}" class="sheet-item ${cur === n.path ? 'on' : ''}">${icon(n.icon, 20)}<span>${esc(t(n.label))}</span></a>`).join('')}</div>
    <div class="sheet-grid mt">
      <a href="#/account" class="sheet-item">${icon('wallet', 20)}<span>${esc(t('حساب کاربری'))}</span></a>
      <a href="#/legal/terms" class="sheet-item">${icon('info', 20)}<span>${esc(t('شرایط استفاده'))}</span></a>
      <a href="#/legal/privacy" class="sheet-item">${icon('info', 20)}<span>${esc(t('سیاست حفظ حریم خصوصی'))}</span></a>
      <a href="#/legal/risk" class="sheet-item">${icon('info', 20)}<span>${esc(t('بیانیه ریسک'))}</span></a>
    </div>`);
  $$('a', m.el).forEach((a) => a.addEventListener('click', () => m.close()));
}

// Ask for every module a page needs at once, rather than letting the browser
// discover them one import level at a time.
function preloadDeps(file) {
  for (const f of [file, ...(DEPS[file] || [])]) {
    const href = new URL(`./${f}`, import.meta.url).href;
    if (document.querySelector(`link[rel="modulepreload"][href="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = href;
    document.head.append(link);
  }
}

// `keepScroll` redraws the page in place (after a sync) instead of opening it at the top.
async function route(opts) {
  const seq = ++routeSeq;
  const keep = opts?.keepScroll === true ? window.scrollY : null;
  const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const file = `views/${VIEWS[name] || VIEWS['']}.js`;
  // the 3D world behind the page turns to each page's own view of the ring
  document.documentElement.dataset.page = VIEWS[name] ? name || 'markets' : 'markets';
  window.dispatchEvent(new CustomEvent('cv:route', { detail: { name: document.documentElement.dataset.page, params } }));
  preloadDeps(file);
  renderNav();
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  const view = $('#view');
  // An address that names no page used to open Markets as if it were that page.
  // (A sign-in token in the address, which contains "=", is not a page name.)
  if (name && !VIEWS[name] && !name.includes('=')) {
    view.innerHTML = `<div class="card empty"><h3>صفحه پیدا نشد</h3><p>صفحه‌ای در مسیر <code>#/${esc(name)}</code> وجود ندارد. ممکن است لینک قدیمی باشد یا اشتباه تایپ شده باشد.</p><a class="btn primary" href="#/">بازگشت به بازارها</a></div>`;
    document.title = `صفحه پیدا نشد · ${CONFIG.APP_NAME}`;
    window.scrollTo({ top: 0 });
    return;
  }
  view.innerHTML = '<div class="skel-wrap"><div class="skel" style="height:28px;width:220px"></div><div class="skel" style="height:360px"></div></div>';
  try {
    const mod = await import(`./${file}`);
    if (seq !== routeSeq) return;
    // Each route renders into its own container, so a slow page that finishes
    // after the user has navigated away writes into a detached node, not the new page.
    const host = document.createElement('div');
    view.replaceChildren(host);
    const done = await mod.render(host, params);
    if (seq !== routeSeq) { if (typeof done === 'function') done(); return; }
    cleanup = done;
    document.title = `${mod.title ? (typeof mod.title === 'function' ? mod.title(params) : mod.title) + ' · ' : ''}${CONFIG.APP_NAME}`;
  } catch (err) {
    console.error(err);
    if (seq === routeSeq) {
      // inline onclick is blocked by the page CSP — this is the error screen, so
      // a Reload button that silently does nothing is the worst place for it
      view.innerHTML = `<div class="card empty"><h3>خطایی رخ داد</h3><p>${esc(err.message)}</p><button class="btn" id="errReload">بارگذاری مجدد</button></div>`;
      document.getElementById('errReload')?.addEventListener('click', () => location.reload());
    }
  }
  if (keep !== null) { if (seq === routeSeq) window.scrollTo({ top: keep }); return; }
  window.scrollTo({ top: 0 });
  trackPageView(location.hash || '#/');
}

// The skip link's "#view" would be read by the hash router as a page name and
// open Markets; it moves focus to the page content instead.
document.querySelector('.skip-link')?.addEventListener('click', (e) => { e.preventDefault(); $('#view').focus(); });

// ---------------------------------------------------------------- theme
// One theme, the portfolio's: obsidian, ivory and champagne gold (css/app.css).
// A theme saved by an older version is ignored.
function applyTheme() {
  document.documentElement.dataset.theme = 'dark';
}

// ---------------------------------------------------------------- search
function initSearch() {
  const input = $('#searchInput'), box = $('#searchResults');
  // The full hint was cut to "Search coi" on a phone.
  const narrow = matchMedia('(max-width: 600px)');
  const hint = () => { input.placeholder = narrow.matches ? 'جستجو' : 'جستجوی رمزارز (BTC, Ethereum…)'; };
  hint();
  narrow.addEventListener('change', hint);
  let items = [], active = -1, seq = 0, timer = null;
  input.maxLength = 40;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'searchResults');
  input.setAttribute('aria-expanded', 'false');
  box.setAttribute('role', 'listbox');
  box.setAttribute('aria-label', 'رمزارزهای منطبق');
  const draw = () => {
    box.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
    box.innerHTML = items.map((c, i) => `<a href="#/coin/${encodeURIComponent(c.symbol)}" id="sr-${i}" role="option" aria-selected="${i === active}" class="${i === active ? 'on' : ''}">${coinLogo(c, 22)}<b>${esc(c.name)}</b><span class="muted">${esc(c.symbol)}</span><span style="margin-left:auto">${money(c.price)}</span></a>`).join('');
    if (active >= 0) input.setAttribute('aria-activedescendant', `sr-${active}`); else input.removeAttribute('aria-activedescendant');
  };
  // Debounced, and only the newest query may draw: a slow answer for "BT"
  // used to land after the one for "BTC" and replace it.
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { seq++; items = []; active = -1; draw(); return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      const found = await searchCoins(q).catch(() => []);
      if (mine !== seq) return;
      items = Array.isArray(found) ? found : []; active = -1; draw();
    }, 140);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && items.length) { location.hash = `#/coin/${encodeURIComponent(items[Math.max(0, active)].symbol)}`; input.value = ''; items = []; draw(); input.blur(); }
    if (e.key === 'Escape') { items = []; draw(); }
  });
  box.addEventListener('click', () => { input.value = ''; items = []; draw(); });
  document.addEventListener('click', (e) => { if (!$('#search').contains(e.target)) { items = []; draw(); } });
  document.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); input.focus(); } });
}

// ---------------------------------------------------------------- currency
// The language switcher lived here. It translated the navigation and nothing
// else — no view imports t() — so choosing Urdu left every page body in English
// and the site half-translated. Removed rather than shipped in that state; the
// dictionary in i18n.js is kept for when the content is actually translated.
async function initSelectors() {
  const cur = $('#curSel');
  cur.innerHTML = CONFIG.CURRENCIES.map(([c, s]) => `<option value="${c}">${c} ${s}</option>`).join('');
  await initCurrency();
  cur.value = fx.code;
  cur.addEventListener('change', async () => {
    const ok = await setCurrency(cur.value);
    if (!ok) { toast('نرخ تبدیل برای این ارز در حال حاضر در دسترس نیست.', 'info'); cur.value = fx.code; return; }
    refreshTickerPrices();
    route();
  });
}

// ---------------------------------------------------------------- account
function initAccount() {
  const btn = $('#accountBtn');
  if (!backendEnabled()) { btn.hidden = true; return; }
  const paint = () => {
    const p = auth.profile;
    btn.innerHTML = auth.user
      ? `<span class="avatar">${esc((p?.display_name || auth.user.email || '?').slice(0, 1).toUpperCase())}</span>`
      : `${icon('wallet', 16)}<span class="hide-s">${esc(t('ورود'))}</span>`;
    btn.className = auth.user ? 'icon-btn' : 'btn sm';
    renderNav();
  };
  btn.addEventListener('click', async () => {
    if (!auth.user) { (await import('./views/auth.js')).openAuth(); return; }
    const p = auth.profile;
    const m = modal(`<h3>${esc(p?.display_name || auth.user.email)}</h3>
      <p class="muted" style="margin-top:-6px">${esc(t('وارد شده با حساب'))} ${esc(auth.user.email)}${p?.is_admin ? ' · <b>مدیر</b>' : ''}</p>
      <div class="stack mt" style="gap:8px">
        <a class="btn" href="#/account">${esc(t('حساب کاربری'))}</a>
        <a class="btn" href="#/premium">${esc(t('اشتراک ویژه'))}</a>
        ${p?.is_admin ? `<a class="btn" href="#/admin">${esc(t('مدیریت'))}</a>` : ''}
        <button class="btn ghost" id="so">${esc(t('خروج از حساب'))}</button>
      </div>`);
    $$('a', m.el).forEach((a) => a.addEventListener('click', () => m.close()));
    $('#so', m.el).addEventListener('click', async () => { m.close(); await signOut(); toast('با موفقیت خارج شدید.', 'info'); });
  });
  auth.addEventListener('change', () => { paint(); syncNow({ signedIn: true }); });
  paint();
  sb();
}

// ---------------------------------------------------------------- cloud sync
// What a signed-in user keeps (watchlist, portfolio, wallets, drawings, the
// settings that follow the account, and the Trading page's three accounts)
// merges with their account key by key; lib/cloudsync.js holds the rules.
// Which pages show each piece, so a sync redraws only the page it changed.
const SHOWN_ON = {
  '': ['watchlist'],
  coin: ['watchlist', 'drawings'],
  advice: ['holdings'],
  wallet: ['holdings', 'wallets'],
  account: ['holdings', 'wallets'],
  trader: TRADING_KEYS,
  learn: TRADING_KEYS,
};
let syncTimer = null, lastSyncAt = 0, redrawAll = false;

const cloudSync = createSync({
  store: { load, save, remove },
  cloud: { user: () => auth.user?.id || null, pull: pullUserData, push: pushUserData },
  settings,
  onApplied(keys) {
    const s = settings.get();
    if (keys.includes('settings')) {
      applyTheme(s.theme || 'dark');
      // A currency picked on another device: load its rate, then redraw in it.
      if (s.currency && s.currency !== fx.code) {
        setCurrency(s.currency).then((ok) => {
          if (!ok) return;
          $('#curSel').value = fx.code;
          refreshTickerPrices();
          route({ keepScroll: true });
        });
      }
    }
    const view = location.hash.replace(/^#\/?/, '').split('/')[0];
    // Signing in redraws whatever is open; later syncs only redraw a page that
    // shows what arrived, keeping the reader's place on it.
    if (redrawAll || keys.some((k) => (SHOWN_ON[view] || []).includes(k))) route({ keepScroll: !redrawAll });
    redrawAll = false;
  },
});

function syncNow({ signedIn = false } = {}) {
  if (!auth.user) return;
  clearTimeout(syncTimer);
  lastSyncAt = Date.now();
  if (signedIn) redrawAll = true;
  cloudSync.sync().catch(() => { /* offline: this device's data stays as it is and goes up on the next sync */ })
    .finally(() => { redrawAll = false; });
}

// An edit here goes up a moment later (several quick edits go up together).
window.addEventListener('cv:store', (e) => {
  if (cloudSync.applying || !auth.user || !SYNCED_KEYS.includes(e.detail.key)) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1200);
});

// Sync used to run only at sign-in, so a tab left open never saw what another
// device changed. It now also runs on coming back to the tab, and every two
// minutes while the tab is in view.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - lastSyncAt > 20e3) syncNow();
});
setInterval(() => { if (!document.hidden && Date.now() - lastSyncAt > 100e3) syncNow(); }, 120e3);
setInterval(() => { if (!document.hidden) showTriggeredServerAlerts(); }, 120e3);

// ---------------------------------------------------------------- live ticker + alerts
let tickerCoins = [];
async function initTicker() {
  const list = await markets().catch(() => []);
  tickerCoins = list.filter((c) => c.binance).slice(0, 14);
  refreshTickerPrices();
  live.subscribe('!miniTicker@arr', (arr) => {
    const el = $('#ticker');
    for (const tk of arr) {
      const node = el.querySelector(`[data-pair="${tk.s}"]`);
      if (node) {
        const p = +tk.c, o = +tk.o;
        node.querySelector('.p').textContent = `${money(p)}`;
        node.querySelector('.chg').outerHTML = changeHtml((p / o - 1) * 100);
      }
      checkAlerts(tk.s, +tk.c);
    }
    window.dispatchEvent(new CustomEvent('cv:tickers', { detail: arr }));
  });
  live.addEventListener('status', (e) => {
    const pill = $('#livePill');
    pill.classList.toggle('on', e.detail.connected);
    pill.querySelector('span').textContent = e.detail.connected
      ? t('زنده · جریان بایننس')
      : e.detail.paused ? t('متوقف شده در پس‌زمینه') : t('در حال اتصال مجدد…');
  });
}

function refreshTickerPrices() {
  $('#ticker').innerHTML = tickerCoins.map((c) => `<a href="#/coin/${esc(c.symbol)}" data-pair="${c.binance}"><b>${esc(c.symbol)}</b><span class="p">${money(c.price)}</span>${changeHtml(c.change24h)}</a>`).join('');
}

function checkAlerts(pair, p) {
  const alerts = load('alerts', []);
  let changed = false;
  for (const a of alerts) {
    if (a.triggered || `${a.symbol}USDT` !== pair) continue;
    if ((a.dir === 'above' && p >= a.price) || (a.dir === 'below' && p <= a.price)) {
      a.triggered = Date.now(); changed = true;
      const dirText = a.dir === 'above' ? 'بالاتر از' : 'پایین‌تر از';
      const msg = `قیمت ${a.symbol} به ${dirText} ${money(a.price)} رسید (قیمت فعلی: ${money(p)})`;
      toast(`🔔 ${msg}`, a.dir === 'above' ? 'up' : 'down', 8000);
      try { if (Notification.permission === 'granted') new Notification(`هشدار قیمت ${CONFIG.APP_NAME}`, { body: msg, icon: 'icon.svg' }); } catch { /* ignore */ }
    }
  }
  if (changed) save('alerts', alerts);
}

// Alerts the server fired while the site was closed (e-mail / Telegram users),
// and AI-signal alerts: the server records every firing, so they reach someone
// with the site open (checked every two minutes) even before Telegram or
// e-mail is set up.
let alertsChecking = false; // sign-in and the two-minute check can overlap; one at a time, or both toast
async function showTriggeredServerAlerts() {
  if (!auth.user || alertsChecking) return;
  alertsChecking = true;
  try {
    const [rows, ai] = await Promise.all([serverAlerts(), serverAiAlerts().catch(() => [])]);
    const seen = new Set(load('seenAlerts', []));
    // Keyed by firing, not by alert: a repeating signal alert fires many times.
    // Signal alerts used to come out as "BTC went null —".
    const key = (a) => `${a.id}:${a.triggered_at}`;
    const fresh = rows.filter((a) => a.triggered_at && !seen.has(key(a)) && !seen.has(a.id));
    for (const a of fresh.slice(0, 4)) {
      if (a.kind === 'signal') toast(`🔔 هشدار سیگنال ${a.symbol} در نمودار ${a.interval} در زمان غیبت شما فعال شد`, 'info', 9000);
      else {
        const dirText = a.direction === 'above' ? 'بالاتر از' : 'پایین‌تر از';
        toast(`🔔 قیمت ${a.symbol} در زمان غیبت شما به ${dirText} ${money(a.price)} رسید`, a.direction === 'above' ? 'up' : 'down', 9000);
      }
      seen.add(key(a));
    }
    const freshAi = ai.filter((a) => a.triggered_at && !seen.has(`ai:${key(a)}`));
    for (const a of freshAi.slice(0, 4)) {
      const how = a.triggered_action || (a.side === 'long' ? 'buy' : a.side === 'short' ? 'sell' : null);
      const what = how === 'buy' ? 'خرید (BUY)' : how === 'sell' ? 'فروش (SELL)' : 'خرید یا فروش';
      const msg = `سیگنال هوش مصنوعی برای ${a.symbol} (نمودار ${a.interval}): پیشنهاد ${what} در قیمت ${money(+a.triggered_price)}، در تاریخ ${new Date(a.triggered_at).toLocaleString('fa-IR')}. این نتیجه بر اساس قوانین شبیه‌سازی است و پیش‌بینی قطعی نیست.`;
      toast(`🤖 ${msg}`, 'info', 10000);
      try { if (Notification.permission === 'granted') new Notification(`سیگنال هوش مصنوعی ${CONFIG.APP_NAME}`, { body: msg, icon: 'icon.svg' }); } catch { /* ignore */ }
      seen.add(`ai:${key(a)}`);
    }
    if (fresh.length || freshAi.length) save('seenAlerts', [...seen].slice(-200));
  } catch { /* backend optional */ } finally { alertsChecking = false; }
}
auth.addEventListener('change', showTriggeredServerAlerts);

// ---------------------------------------------------------------- risk gate (shown once)

function riskGate() {
  if (load('riskAck', false)) return;

  const m = modal(`
    <div dir="rtl" style="text-align:right; direction:rtl;">
      <h3>پیش از شروع مطالعه کنید</h3>

      <p>
        <b>${esc(CONFIG.APP_NAME)} یک ابزار تحلیلی است، نه یک صرافی یا کارگزار.</b>
        این سامانه هرگز معامله‌ای ثبت نمی‌کند، دارایی شما را نگه نمی‌دارد
        و هرگز کلید صرافی، کلید خصوصی یا عبارت بازیابی (Seed Phrase)
        را درخواست نمی‌کند.
      </p>

      <p>
        سیگنال‌ها، پیش‌بینی‌ها و پاسخ‌های هوش مصنوعی برآوردهای آموزشی هستند
        که از داده‌های عمومی بازار ساخته شده‌اند و ممکن است اشتباه باشند.
        بازار رمزارزها بسیار پرنوسان است و احتمال از دست دادن تمام سرمایه وجود دارد.
      </p>

      <p class="fine">
        دقت اندازه‌گیری‌شده موتور پیش‌بینی در صفحه هر رمزارز و در بخش
        <a href="#/track">سابقه عملکرد</a>
        منتشر شده است — پیش از اتکا به داده‌ها، آن را مطالعه کنید.
      </p>

      <div class="row mt" dir="rtl" style="gap:8px; justify-content:flex-start;">
        <button class="btn primary" id="ok">
          ${esc(t('متوجه شدم'))}
        </button>

        <a class="btn ghost" href="#/legal/risk" id="more">
          ${esc(t('بیانیه ریسک'))}
        </a>
      </div>
    </div>
  `, {
    onClose: () => save('riskAck', true)
  });

  $('#ok', m.el).addEventListener('click', () => {
    save('riskAck', true);
    m.close();
  });

  $('#more', m.el).addEventListener('click', () => {
    save('riskAck', true);
    m.close();
  });
}


// ---------------------------------------------------------------- banners
let demoBanner = '';
let siteBanner = '';
const paintBanners = () => { $('#banner').innerHTML = demoBanner + siteBanner; };

dataStatus.addEventListener('change', (e) => {
  demoBanner = e.detail.demo
    ? `<div class="banner">${icon('info', 16)} APIهای زنده بازار در حال حاضر از این شبکه در دسترس نیستند، بنابراین برخی بخش‌ها <b>داده‌های آزمایشی (دمو)</b> را نمایش می‌دهند. به محض برقراری ارتباط، داده‌ها به صورت خودکار زنده می‌شوند.</div>`
    : '';
  paintBanners();
});

// Site-wide announcement the admin can set from the admin panel.
getAppSettings().then((s) => {
  const text = s?.site?.announcement;
  if (!text) return;
  if (load('dismissedNotice', '') === text) return;
  siteBanner = `<div class="banner" id="siteNotice">${icon('info', 16)} ${esc(text)} <button class="icon-btn" id="noticeX" style="width:26px;height:26px;margin-left:auto" aria-label="بستن">${icon('close', 12)}</button></div>`;
  paintBanners();
  $('#noticeX')?.addEventListener('click', () => { save('dismissedNotice', text); siteBanner = ''; paintBanners(); });
}).catch(() => { /* backend optional */ });

// ---------------------------------------------------------------- 3D world
// The world behind every page (js/world/), as on the portfolio. It is fetched
// once the first page is drawn, so it never holds the prices up; without WebGL,
// or if three.js cannot load, the page keeps its still gold-on-obsidian background.
function startWorld() {
  const go = () => import('./world/world.js').then((m) => m.startWorld()).catch((e) => {
    console.warn('3D world', e);
    document.documentElement.classList.add('no-webgl');
  });
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2500 });
  else setTimeout(go, 800);
}

// ---------------------------------------------------------------- boot
// The fonts are the site's own files (fonts/, css/app.css), as on the portfolio.
// The pages search engines index (coin/btc/, trader/ …, tools/build-pages.mjs)
// carry the route they stand for. Opening it moves the address to the app's
// own (/#/coin/BTC), so every link after this stays in the page.
{ const entry = document.documentElement.dataset.route; if (entry && !location.hash) history.replaceState(null, '', entry); }
$$('[data-app-name]').forEach((n) => { n.textContent = CONFIG.APP_NAME; });
applyTheme(settings.get().theme || 'dark');
applyDir();

// A password-recovery link lands back on the site as `#access_token=…&type=recovery`.
// That has to be handled before the router sees the hash, or the app just tries to
// route to a nonsense page and the reader is stuck.
(async () => {
  if (!location.hash.includes('type=recovery')) return;
  try {
    const { consumeRecoveryLink } = await import('./api/backend.js');
    const { changePassword } = await import('./api/security.js');
    const ok = await consumeRecoveryLink();
    if (!ok) return;
    const m = modal(`<h3>تعیین رمز عبور جدید</h3>
      <p class="fine">شما از طریق لینک بازیابی وارد شده‌اید و اکنون می‌توانید رمز عبور جدیدی انتخاب کنید.</p>
      <form class="stack mt" style="gap:10px" id="rp">
        <label class="fld">رمز عبور جدید<input class="inp" name="pw" type="password" autocomplete="new-password" minlength="10" required autofocus></label>
        <p class="fine">حداقل ۱۰ کاراکتر.</p>
        <button class="btn primary">ذخیره رمز عبور جدید</button>
        <p class="fine down" id="rpErr" hidden></p>
      </form>`);
    const f = m.el.querySelector('#rp'), err = m.el.querySelector('#rpErr');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      try {
        await changePassword(f.pw.value);
        m.close();
        toast('رمز عبور به‌روزرسانی شد — اکنون وارد حساب خود شده‌اید.', 'up');
      } catch (e2) { err.textContent = e2.message; err.hidden = false; }
    });
  } catch (e) { console.warn('recovery link', e); }
})();
// Put the app on the exchange's clock before anything is timestamped, and keep
// it there — a device clock that drifts makes every "2m ago" and every live /
// stale check wrong.
syncExchangeClock();
setInterval(syncExchangeClock, 6e5);
window.addEventListener('hashchange', route);
initSearch();
initSelectors().then(route).catch(route).finally(startWorld);
initTicker();
initAccount();
riskGate();
// Keep as little as possible on this device: what removed features left, the
// response cache beyond its limit, and this browser's own learning record once
// the cloud's (which every device reads) can be read.
setTimeout(() => {
  tidyStorage();
  tidyHttpCache();
  cloudLearning().then((c) => { if (c) remove('aiLearn'); }).catch(() => {});
}, 4000);

// ---------------------------------------------------------------- updates
//
// A browser that is still running last week's files is indistinguishable, to
// the person using it, from a broken site: fixes appear not to have shipped and
// sign-in seems to fail. So the app checks its own build number on every load
// and, if the server has a newer one, clears the old copy and reloads once.
// `version.txt` is rewritten by the deploy script, fetched with no-store so the
// check itself can never be answered from cache, and the reload is guarded by a
// session flag so a bad deploy cannot put the page in a refresh loop.
export const BUILD = "20261105-185358";

// A build stamp is exactly what the deploy script writes: 20260916-130124.
// Anything else — an HTML error page, a proxy notice, an offline fallback — is
// not a version, and acting on it used to unregister the service worker, delete
// every cache and reload the page. Offline, that left nothing to reload into.
const BUILD_STAMP = /^\d{8}-\d{6}$/;

// The build this tab is running, in the footer, so "is this the new version?"
// has an answer on the page itself.
{
  const tag = document.getElementById('buildTag');
  if (tag) tag.textContent = `نسخه ${BUILD.slice(0, 4)}-${BUILD.slice(4, 6)}-${BUILD.slice(6, 8)} ${BUILD.slice(9, 11)}:${BUILD.slice(11, 13)} UTC`;
}

// A tab left open for hours checks too, every half hour (see below). Found
// that way, the new build loads only once nobody has touched the page for two
// minutes and nothing is being typed, so it never reloads under someone's hand.
let lastInput = Date.now();
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
const idleNow = () => Date.now() - lastInput > 120e3 && !document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]');

async function checkForUpdate({ whenIdle = false } = {}) {
  if (navigator.onLine === false) return;
  try {
    const res = await fetch(`version.txt?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const latest = (await res.text()).trim();
    if (!BUILD_STAMP.test(latest)) return;
    if (latest === BUILD) { sessionStorage.removeItem('cv:reloaded'); return; }
    if (whenIdle && !idleNow()) { setTimeout(() => checkForUpdate({ whenIdle: true }), 60e3); return; }
    // One try per new build every ten minutes, never a loop: right after a
    // deploy, GitHub Pages' servers can still hand out the previous files for a
    // few minutes, and a later check then gets the new ones.
    let tried = null;
    try { tried = JSON.parse(sessionStorage.getItem('cv:reloaded') || 'null'); } catch { /* an older plain value */ }
    if (tried?.v === latest && Date.now() - tried.at < 10 * 60e3) return;
    sessionStorage.setItem('cv:reloaded', JSON.stringify({ v: latest, at: Date.now() }));
    // Every app file is fetched again past the browser's own cache before the
    // reload. The old way — drop the service worker, then reload — let the
    // browser serve the previous files from its HTTP cache (kept up to ten
    // minutes), and the tab then stayed on the old build for the whole visit.
    const files = new Set(['./', 'index.html', 'css/app.css', 'js/app.js', 'js/deps.js']);
    for (const [page, deps] of Object.entries(DEPS)) for (const f of [page, ...deps]) files.add(`js/${f}`);
    await Promise.all([...files].map((f) => fetch(f, { cache: 'reload' }).catch(() => null)));
    // a new service worker (sw.js changes with every build) takes over at once
    await (await navigator.serviceWorker?.getRegistration?.())?.update?.().catch(() => {});
    // keep the downloaded AI model — it is large and unrelated to the app files
    for (const k of await caches.keys()) if (!k.startsWith('webllm')) await caches.delete(k);
    location.reload();
  } catch { /* offline, or no version file — carry on with what is loaded */ }
}

// Saving silently failing is worse than saying so: everything keeps working for
// the session and is then gone. Told once, not on every write.
window.addEventListener('cv:store-failed', (e) => {
  toast(`امکان ذخیره‌سازی در این دستگاه وجود ندارد — ${e.detail.reason}. واچ‌لیست، هشدارها و معاملات شما پس از بستن تب از بین خواهند رفت.`, 'down', 9000);
});

if (location.protocol === 'https:') {
  window.addEventListener('load', () => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { /* offline support is optional */ });
    checkForUpdate();
    // and again whenever the tab is brought back to the front, and every half hour while it stays open
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
    setInterval(() => { if (!document.hidden) checkForUpdate({ whenIdle: true }); }, 30 * 60e3);
  });
}

// --- Quick chat: slash commands answered from live market data ---
// (Not the Model Context Protocol; these are plain in-page commands.)
(async function initMagicChat() {
  const chatPanel = $('#chatPanel');
  const chatClose = $('#chatClose');
  const chatMessages = $('#chatMessages');
  const chatInput = $('#chatInput');
  const chatSend = $('#chatSend');

  const chatBtn = $('#chatBtn');
  chatBtn.innerHTML = `${icon('ai', 18)}<span>گفتگوی سریع</span>`;

  // Toggle chat panel (its own button; the theme button only changes the theme)
  chatInput.maxLength = 120;
  const toggleChat = () => {
    chatPanel.hidden = !chatPanel.hidden;
    chatBtn.setAttribute('aria-expanded', String(!chatPanel.hidden));
    chatBtn.setAttribute('aria-label', chatPanel.hidden ? 'باز کردن گفتگوی سریع' : 'بستن گفتگوی سریع');
    if (chatPanel.hidden) { chatInput.value = ''; chatBtn.focus(); }
    else setTimeout(() => chatInput.focus(), 50);
  };

  chatBtn.addEventListener('click', toggleChat);
  chatClose.addEventListener('click', toggleChat);

  // Close on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !chatPanel.hidden) toggleChat();
  });

  // Send message
  // one command at a time: a double press used to fetch and answer twice
  let chatBusy = false;
  const sendMessage = async (message) => {
    const trimmed = String(message || '').trim().slice(0, 120);
    if (!trimmed || chatBusy) return;
    chatBusy = true;
    chatSend.disabled = true;

    // Add user message to UI
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-message user';
    userMsg.innerHTML = `<span class="avatar">شما</span><span class="msg">${esc(trimmed)}</span>`;
    chatMessages.appendChild(userMsg);

    // Clear input
    chatInput.value = '';

    // Show typing indicator
    const typingInd = document.createElement('div');
    typingInd.className = 'chat-message bot';
    typingInd.innerHTML = `<span class="avatar">هوش مصنوعی</span><span class="msg typing">...</span>`;
    typingInd.id = 'typingIndicator';
    chatMessages.appendChild(typingInd);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      // Commands are answered from live data.
      const response = await generateMCPResponse(trimmed);

      // Replace typing indicator with response
      const typingEl = $('#typingIndicator');
      if (typingEl) typingEl.remove();
      if (response === null) return; // e.g. /clear (finally still runs)

      const botMsg = document.createElement('div');
      botMsg.className = 'chat-message bot';
      botMsg.innerHTML = `<span class="avatar">هوش مصنوعی</span><span class="msg">${esc(response)}</span>`;
      chatMessages.appendChild(botMsg);
    } catch (err) {
      const typingEl = $('#typingIndicator');
      if (typingEl) typingEl.remove();

      const errorMsg = document.createElement('div');
      errorMsg.className = 'chat-message bot';
      console.warn('quick chat', err);
      errorMsg.innerHTML = '<span class="avatar">هوش مصنوعی</span><span class="msg">داده‌های زنده برای این دستور بارگیری نشدند، بنابراین به جای حدس زدن پاسخی ارائه نشد. لطفاً لحظاتی دیگر دوباره تلاش کنید.</span>';
      chatMessages.appendChild(errorMsg);
    } finally {
      chatBusy = false;
      chatSend.disabled = false;
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  // Command answers, all from the same live data the pages use.
  const HELP = [
    '/price BTC   قیمت زنده، تغییرات ۲۴ ساعته و ۷ روزه',
    '/signal ETH  امتیاز اندیکاتور در نمودار ۱ ساعته (آموزشی، نه سیگنال قطعی)',
    '/market      بررسی تغییرات بازار در ۲۴ ساعت گذشته',
    '/clear       پاک کردن این گفتگو',
    'پرسش‌های آزاد: از صفحه دستیار هوشمند (#/ai) استفاده کنید.',
  ].join('\n');
  const generateMCPResponse = async (message) => {
    if (message.startsWith('/')) {
      const [cmdRaw, ...rest] = message.slice(1).trim().split(/\s+/);
      const cmd = (cmdRaw || '').toLowerCase();
      const arg = rest.join(' ').trim();
      switch (cmd) {
        case 'help':
          return HELP;
        case 'price': {
          const c = await findCoin(arg || 'BTC');
          if (!c) return `رمزارزی برای «${arg}» پیدا نشد. دستور /price BTC یا /price SOL را امتحان کنید.`;
          return `${c.name} (${c.symbol}): ${money(c.price)}\n۲۴ ساعت: ${pct(c.change24h)} · ۷ روز: ${pct(c.change7d)}`;
        }
        case 'signal': {
          const c = await findCoin(arg || 'BTC');
          if (!c) return `رمزارزی برای «${arg}» پیدا نشد. دستور /signal BTC را امتحان کنید.`;
          const { candles, source } = await getCandles(c, '1h', 300);
          if (source === 'demo') return `قیمت‌های زنده در حال حاضر بارگیری نمی‌شوند، بنابراین سیگنال واقعی برای ${c.symbol} وجود ندارد. یک دقیقه دیگر دوباره تلاش کنید.`;
          const s = generateSignal(candles, { interval: '1h' });
          if (!s.ok) return `${c.symbol}: ${s.reason}`;
          const rsi = Number.isFinite(s.indicators?.rsi) ? s.indicators.rsi.toFixed(1) : '—';
          return `${c.symbol} در نمودار ۱ ساعته: امتیاز ${s.score > 0 ? '+' : ''}${s.score} (${s.text})، شاخص RSI برابر با ${rsi}.\n` +
            'امتیاز بالا به معنای کشیدگی روند است، نه تداوم قطعی آن. تحلیل کامل در صفحه رمزارز موجود است.';
        }
        case 'market': {
          const list = (await markets()).filter((c) => Number.isFinite(c.change24h));
          if (!list.length) return 'داده‌های بازار در حال حاضر در دسترس نیستند. یک دقیقه دیگر دوباره تلاش کنید.';
          const up = list.filter((c) => c.change24h > 0).length;
          const sorted = [...list].sort((a, b) => b.change24h - a.change24h);
          const fmt = (c) => `${c.symbol} ${pct(c.change24h)}`;
          return `${up} رمزارز از ${list.length} رمزارز در ۲۴ ساعت گذشته رشد داشته‌اند.\n` +
            `بیشترین رشدها: ${sorted.slice(0, 3).map(fmt).join('، ')}\n` +
            `بیشترین افت‌ها: ${sorted.slice(-3).reverse().map(fmt).join('، ')}`;
        }
        case 'clear':
        case 'reset':
          chatMessages.querySelectorAll('.chat-message').forEach((m, i) => { if (i > 0) m.remove(); });
          return null;
        default:
          return `دستور ناشناخته /${cmd}. برای مشاهده دستورات موجود /help را تایپ کنید.`;
      }
    }

    return 'من به دستورات سریع بر اساس داده‌های زنده پاسخ می‌دهم. برای مشاهده آن‌ها /help را تایپ کنید، یا سوالات آزاد خود را در صفحه دستیار هوشمند (#/ai) بپرسید.';
  };

  // Enter key to send
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage(chatInput.value);
    }
  });

  // Send button
  chatSend.addEventListener('click', () => sendMessage(chatInput.value));

  // The panel stays closed until the visitor opens it with the Quick chat button.

  // Add some preset quick-questions as buttons
  const quickQuestions = [
    '/help',
    '/price BTC',
    '/signal ETH',
    '/market',
    '/clear'
  ];

  const quickBar = document.createElement('div');
  quickBar.className = 'chat-quick';
  quickBar.innerHTML = `<span class="muted">امتحان کنید:</span>${quickQuestions.map(q => `<button class="quick-btn" type="button" data-cmd="${esc(q)}" aria-label="اجرای ${esc(q)}">${esc(q)}</button>`).join(' ')}`;
  chatMessages.parentNode.insertBefore(quickBar, chatInput.parentNode);

  quickBar.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sendMessage(btn.dataset.cmd);
      chatInput.focus();
    });
  });
})();