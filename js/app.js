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

// تنظیم اجباری جهت راست‌به‌چین و زبان فارسی در سند اصلی[cite: 11]
if (typeof document !== 'undefined') {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'fa';
}

// محافظت در برابر Clickjacking[cite: 11]
if (typeof window !== 'undefined' && window.top !== window.self) {
  let sameOrigin = false;
  try { sameOrigin = window.top.location.origin === window.location.origin; } catch { /* دامنه دیگر */ }
  if (!sameOrigin) document.documentElement.style.visibility = 'hidden';
}

const NAV = [
  { path: '', label: 'بازارها', icon: 'markets', short: 'بازارها' },
  // { path: 'advice', label: 'اسکن بازار', icon: 'bolt', short: 'اسکن' },
  { path: 'trader', label: 'معاملات', icon: 'forecast', short: 'معاملات' },
  { path: 'ai', label: 'دستیار هوشمند', icon: 'ai', short: 'پرسش' },
  { path: 'learn', label: 'یادگیری هوش مصنوعی', icon: 'ai', short: 'یادگیری' },
  { path: 'scanner', label: 'اسکنر', icon: 'scanner', short: 'اسکنر' },
  { path: 'track', label: 'سابقه عملکرد', icon: 'forecast', short: 'سوابق' },
  { path: 'futures', label: 'فیوچرز', icon: 'bolt', short: 'فیوچرز' },
  { path: 'compare', label: 'مقایسه', icon: 'compare', short: 'مقایسه' },
  { path: 'tools', label: 'ابزارها', icon: 'calc', short: 'ابزارها' },
  { path: 'exchanges', label: 'صرافی‌ها', icon: 'exchanges', short: 'صرافی‌ها' },
  { path: 'wallet', label: 'کیف پول', icon: 'wallet', short: 'کیف پول' },
  { path: 'alerts', label: 'هشدارها', icon: 'alerts', short: 'هشدارها' },
  { path: 'premium', label: 'اشتراک ویژه', icon: 'star', short: 'ویژه' },
];
const ADMIN_NAV = { path: 'admin', label: 'مدیریت', icon: 'chip', short: 'مدیریت' };
const MOBILE = ['', 'ai', 'trader', 'wallet'];

// نگاشت مسیرها به ماژول‌های صفحه در js/views/[cite: 11]
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
  const navEl = $('#nav');
  if (navEl) {
    navEl.innerHTML = navItems().map((n) =>
      `<a href="#/${n.path}" class="${cur === n.path ? 'on' : ''}"${cur === n.path ? ' aria-current="page"' : ''}>${icon(n.icon)}<span>${esc(t(n.label))}</span>${n.badge ? `<em class="badge">${esc(n.badge)}</em>` : ''}</a>`).join('');
  }
  const bottomEl = $('#bottombar');
  if (bottomEl) {
    bottomEl.innerHTML = `${MOBILE.map((p) => {
      const n = NAV.find((x) => x.path === p);
      if (!n) return '';
      return `<a href="#/${p}" class="${cur === p ? 'on' : ''}"${cur === p ? ' aria-current="page"' : ''}>${icon(n.icon, 22)}<span>${esc(t(n.short))}</span></a>`;
    }).join('')}<button id="moreBtn" type="button" aria-haspopup="dialog" class="${MOBILE.includes(cur) ? '' : 'on'}">${icon('more', 22)}<span>${esc(t('بیشتر'))}</span></button>`;
    $('#moreBtn', bottomEl)?.addEventListener('click', openMore);
  }
}

function openMore() {
  const cur = location.hash.replace(/^#\/?/, '').split('/')[0];
  const rest = navItems().filter((n) => !MOBILE.includes(n.path));
  const m = modal(`
    <div dir="rtl" style="text-align:right">
      <h3>${esc(t('منو'))}</h3>
      <div class="sheet-grid">${rest.map((n) => `<a href="#/${n.path}" class="sheet-item ${cur === n.path ? 'on' : ''}">${icon(n.icon, 20)}<span>${esc(t(n.label))}</span></a>`).join('')}</div>
      <div class="sheet-grid mt">
        <a href="#/account" class="sheet-item">${icon('wallet', 20)}<span>${esc(t('حساب کاربری'))}</span></a>
        <a href="#/legal/terms" class="sheet-item">${icon('info', 20)}<span>${esc(t('شرایط استفاده'))}</span></a>
        <a href="#/legal/privacy" class="sheet-item">${icon('info', 20)}<span>${esc(t('سیاست حفظ حریم خصوصی'))}</span></a>
        <a href="#/legal/risk" class="sheet-item">${icon('info', 20)}<span>${esc(t('بیانیه ریسک'))}</span></a>
      </div>
    </div>`);
  $$('a', m.el).forEach((a) => a.addEventListener('click', () => m.close()));
}

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

async function route(opts) {
  const seq = ++routeSeq;
  const keep = opts?.keepScroll === true ? window.scrollY : null;
  const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const file = `views/${VIEWS[name] || VIEWS['']}.js`;
  document.documentElement.dataset.page = VIEWS[name] ? name || 'markets' : 'markets';
  window.dispatchEvent(new CustomEvent('cv:route', { detail: { name: document.documentElement.dataset.page, params } }));
  preloadDeps(file);
  renderNav();
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  const view = $('#view');
  if (name && !VIEWS[name] && !name.includes('=')) {
    view.innerHTML = `<div class="card empty" dir="rtl"><h3>صفحه پیدا نشد</h3><p>صفحه‌ای در مسیر <code dir="ltr">#/${esc(name)}</code> وجود ندارد. ممکن است لینک قدیمی باشد یا اشتباه تایپ شده باشد.</p><a class="btn primary" href="#/">بازگشت به بازارها</a></div>`;
    document.title = `صفحه پیدا نشد · ${CONFIG.APP_NAME}`;
    window.scrollTo({ top: 0 });
    return;
  }
  view.innerHTML = '<div class="skel-wrap"><div class="skel" style="height:28px;width:220px"></div><div class="skel" style="height:360px"></div></div>';
  try {
    const mod = await import(`./${file}`);
    if (seq !== routeSeq) return;
    const host = document.createElement('div');
    host.dir = 'rtl';
    view.replaceChildren(host);
    const done = await mod.render(host, params);
    if (seq !== routeSeq) { if (typeof done === 'function') done(); return; }
    cleanup = done;
    document.title = `${mod.title ? (typeof mod.title === 'function' ? mod.title(params) : mod.title) + ' · ' : ''}${CONFIG.APP_NAME}`;
  } catch (err) {
    console.error(err);
    if (seq === routeSeq) {
      view.innerHTML = `<div class="card empty" dir="rtl"><h3>خطایی رخ داد</h3><p>${esc(err.message)}</p><button class="btn" id="errReload">بارگذاری مجدد</button></div>`;
      document.getElementById('errReload')?.addEventListener('click', () => location.reload());
    }
  }
  if (keep !== null) { if (seq === routeSeq) window.scrollTo({ top: keep }); return; }
  window.scrollTo({ top: 0 });
  trackPageView(location.hash || '#/');
}

document.querySelector('.skip-link')?.addEventListener('click', (e) => { e.preventDefault(); $('#view').focus(); });

// ---------------------------------------------------------------- theme[cite: 11]
function applyTheme() {
  document.documentElement.dataset.theme = 'dark';
}

// ---------------------------------------------------------------- search[cite: 11]
function initSearch() {
  const input = $('#searchInput'), box = $('#searchResults');
  const narrow = matchMedia('(max-width: 600px)');
  const hint = () => { input.placeholder = narrow.matches ? 'جستجو' : 'جستجوی رمزارز (BTC، اتریوم…)'; };
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
  box.setAttribute('dir', 'rtl');
  const draw = () => {
    box.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
    // اصلاح margin-right:auto برای تراز صحیح قیمت در چیدمان راست‌به‌چین[cite: 11]
    box.innerHTML = items.map((c, i) => `<a href="#/coin/${encodeURIComponent(c.symbol)}" id="sr-${i}" role="option" aria-selected="${i === active}" class="${i === active ? 'on' : ''}">${coinLogo(c, 22)}<b>${esc(c.name)}</b><span class="muted">${esc(c.symbol)}</span><span style="margin-right:auto;direction:ltr">${money(c.price)}</span></a>`).join('');
    if (active >= 0) input.setAttribute('aria-activedescendant', `sr-${active}`); else input.removeAttribute('aria-activedescendant');
  };
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

// ---------------------------------------------------------------- currency[cite: 11]
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

// ---------------------------------------------------------------- account[cite: 11]
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
    const m = modal(`
      <div dir="rtl" style="text-align:right">
        <h3>${esc(p?.display_name || auth.user.email)}</h3>
        <p class="muted" style="margin-top:-6px">${esc(t('وارد شده با حساب'))} <span dir="ltr">${esc(auth.user.email)}</span>${p?.is_admin ? ' · <b>مدیر</b>' : ''}</p>
        <div class="stack mt" style="gap:8px">
          <a class="btn" href="#/account">${esc(t('حساب کاربری'))}</a>
          <a class="btn" href="#/premium">${esc(t('اشتراک ویژه'))}</a>
          ${p?.is_admin ? `<a class="btn" href="#/admin">${esc(t('مدیریت'))}</a>` : ''}
          <button class="btn ghost" id="so">${esc(t('خروج از حساب'))}</button>
        </div>
      </div>`);
    $$('a', m.el).forEach((a) => a.addEventListener('click', () => m.close()));
    $('#so', m.el).addEventListener('click', async () => { m.close(); await signOut(); toast('با موفقیت خارج شدید.', 'info'); });
  });
  auth.addEventListener('change', () => { paint(); syncNow({ signedIn: true }); });
  paint();
  sb();
}

// ---------------------------------------------------------------- cloud sync[cite: 11]
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
    if (redrawAll || keys.some((k) => (SHOWN_ON[view] || []).includes(k))) route({ keepScroll: !redrawAll });
    redrawAll = false;
  },
});

function syncNow({ signedIn = false } = {}) {
  if (!auth.user) return;
  clearTimeout(syncTimer);
  lastSyncAt = Date.now();
  if (signedIn) redrawAll = true;
  cloudSync.sync().catch(() => { /* آفلاین: داده‌های دستگاه حفظ شده و در همگام‌سازی بعدی ارسال می‌شوند */ })
    .finally(() => { redrawAll = false; });
}

window.addEventListener('cv:store', (e) => {
  if (cloudSync.applying || !auth.user || !SYNCED_KEYS.includes(e.detail.key)) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1200);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - lastSyncAt > 20e3) syncNow();
});
setInterval(() => { if (!document.hidden && Date.now() - lastSyncAt > 100e3) syncNow(); }, 120e3);
setInterval(() => { if (!document.hidden) showTriggeredServerAlerts(); }, 120e3);

// ---------------------------------------------------------------- live ticker + alerts[cite: 11]
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
      ? t('زنده · متصل به دیتای جهانی')
      : e.detail.paused ? t('متوقف شده در پس‌زمینه') : t('در حال اتصال مجدد…');
  });
}

function refreshTickerPrices() {
  $('#ticker').innerHTML = tickerCoins.map((c) => `<a href="#/coin/${esc(c.symbol)}" data-pair="${c.binance}" dir="ltr"><b>${esc(c.symbol)}</b><span class="p">${money(c.price)}</span>${changeHtml(c.change24h)}</a>`).join('');
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
      try { if (Notification.permission === 'granted') new Notification(`هشدار قیمت ${CONFIG.APP_NAME}`, { body: msg, icon: 'icon.svg' }); } catch { /* نادیده گرفتن */ }
    }
  }
  if (changed) save('alerts', alerts);
}

let alertsChecking = false;
async function showTriggeredServerAlerts() {
  if (!auth.user || alertsChecking) return;
  alertsChecking = true;
  try {
    const [rows, ai] = await Promise.all([serverAlerts(), serverAiAlerts().catch(() => [])]);
    const seen = new Set(load('seenAlerts', []));
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
      try { if (Notification.permission === 'granted') new Notification(`سیگنال هوش مصنوعی ${CONFIG.APP_NAME}`, { body: msg, icon: 'icon.svg' }); } catch { /* نادیده گرفتن */ }
      seen.add(`ai:${key(a)}`);
    }
    if (fresh.length || freshAi.length) save('seenAlerts', [...seen].slice(-200));
  } catch { /* بک‌اند اختیاری است */ } finally { alertsChecking = false; }
}
auth.addEventListener('change', showTriggeredServerAlerts);

// ---------------------------------------------------------------- risk gate (shown once)[cite: 11]
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

// ---------------------------------------------------------------- banners[cite: 11]
let demoBanner = '';
let siteBanner = '';
const paintBanners = () => { $('#banner').innerHTML = demoBanner + siteBanner; };

dataStatus.addEventListener('change', (e) => {
  demoBanner = e.detail.demo
    ? `<div class="banner" dir="rtl">${icon('info', 16)} APIهای زنده بازار در حال حاضر از این شبکه در دسترس نیستند، بنابراین برخی بخش‌ها <b>داده‌های آزمایشی (دمو)</b> را نمایش می‌دهند. به محض برقراری ارتباط، داده‌ها به صورت خودکار زنده می‌شوند.</div>`
    : '';
  paintBanners();
});

getAppSettings().then((s) => {
  const text = s?.site?.announcement;
  if (!text) return;
  if (load('dismissedNotice', '') === text) return;
  // اصلاح margin-right:auto برای دکمه بستن بنر در چیدمان راست‌به‌چین[cite: 11]
  siteBanner = `<div class="banner" id="siteNotice" dir="rtl">${icon('info', 16)} ${esc(text)} <button class="icon-btn" id="noticeX" style="width:26px;height:26px;margin-right:auto" aria-label="بستن">${icon('close', 12)}</button></div>`;
  paintBanners();
  $('#noticeX')?.addEventListener('click', () => { save('dismissedNotice', text); siteBanner = ''; paintBanners(); });
}).catch(() => { /* بک‌اند اختیاری است */ });

// ---------------------------------------------------------------- 3D world[cite: 11]
function startWorld() {
  const go = () => import('./world/world.js').then((m) => m.startWorld()).catch((e) => {
    console.warn('3D world', e);
    document.documentElement.classList.add('no-webgl');
  });
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2500 });
  else setTimeout(go, 800);
}

// ---------------------------------------------------------------- boot[cite: 11]
{ const entry = document.documentElement.dataset.route; if (entry && !location.hash) history.replaceState(null, '', entry); }
$$('[data-app-name]').forEach((n) => { n.textContent = CONFIG.APP_NAME; });
applyTheme(settings.get().theme || 'dark');
applyDir();

(async () => {
  if (!location.hash.includes('type=recovery')) return;
  try {
    const { consumeRecoveryLink } = await import('./api/backend.js');
    const { changePassword } = await import('./api/security.js');
    const ok = await consumeRecoveryLink();
    if (!ok) return;
    const m = modal(`
      <div dir="rtl" style="text-align:right">
        <h3>تعیین رمز عبور جدید</h3>
        <p class="fine">شما از طریق لینک بازیابی وارد شده‌اید و اکنون می‌توانید رمز عبور جدیدی انتخاب کنید.</p>
        <form class="stack mt" style="gap:10px" id="rp">
          <label class="fld">رمز عبور جدید<input class="inp" name="pw" type="password" autocomplete="new-password" minlength="10" required autofocus></label>
          <p class="fine">حداقل ۱۰ کاراکتر.</p>
          <button class="btn primary">ذخیره رمز عبور جدید</button>
          <p class="fine down" id="rpErr" hidden></p>
        </form>
      </div>`);
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

syncExchangeClock();
setInterval(syncExchangeClock, 6e5);
window.addEventListener('hashchange', route);
initSearch();
initSelectors().then(route).catch(route).finally(startWorld);
initTicker();
initAccount();
riskGate();

setTimeout(() => {
  tidyStorage();
  tidyHttpCache();
  cloudLearning().then((c) => { if (c) remove('aiLearn'); }).catch(() => {});
}, 4000);

// ---------------------------------------------------------------- updates[cite: 11]
export const BUILD = "20261105-185358";
const BUILD_STAMP = /^\d{8}-\d{6}$/;

{
  const tag = document.getElementById('buildTag');
  if (tag) tag.textContent = `نسخه ${BUILD.slice(0, 4)}-${BUILD.slice(4, 6)}-${BUILD.slice(6, 8)} ${BUILD.slice(9, 11)}:${BUILD.slice(11, 13)} UTC`;
}

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
    let tried = null;
    try { tried = JSON.parse(sessionStorage.getItem('cv:reloaded') || 'null'); } catch { /* مقدار قدیمی */ }
    if (tried?.v === latest && Date.now() - tried.at < 10 * 60e3) return;
    sessionStorage.setItem('cv:reloaded', JSON.stringify({ v: latest, at: Date.now() }));
    const files = new Set(['./', 'index.html', 'css/app.css', 'js/app.js', 'js/deps.js']);
    for (const [page, deps] of Object.entries(DEPS)) for (const f of [page, ...deps]) files.add(`js/${f}`);
    await Promise.all([...files].map((f) => fetch(f, { cache: 'reload' }).catch(() => null)));
    await (await navigator.serviceWorker?.getRegistration?.())?.update?.().catch(() => {});
    for (const k of await caches.keys()) if (!k.startsWith('webllm')) await caches.delete(k);
    location.reload();
  } catch { /* آفلاین یا بدون فایل نسخه */ }
}

window.addEventListener('cv:store-failed', (e) => {
  toast(`امکان ذخیره‌سازی در این دستگاه وجود ندارد — ${e.detail.reason}. واچ‌لیست، هشدارها و معاملات شما پس از بستن تب از بین خواهند رفت.`, 'down', 9000);
});

if (location.protocol === 'https:') {
  window.addEventListener('load', () => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { /* پشتیبانی آفلاین اختیاری است */ });
    checkForUpdate();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
    setInterval(() => { if (!document.hidden) checkForUpdate({ whenIdle: true }); }, 30 * 60e3);
  });
}

// --- گفتگوی سریع: دستورات مبتنی بر داده‌های زنده بازار ---[cite: 11]
(async function initMagicChat() {
  const chatPanel = $('#chatPanel');
  const chatClose = $('#chatClose');
  const chatMessages = $('#chatMessages');
  const chatInput = $('#chatInput');
  const chatSend = $('#chatSend');

  if (chatPanel) chatPanel.dir = 'rtl';

  const chatBtn = $('#chatBtn');
  chatBtn.innerHTML = `${icon('ai', 18)}<span>گفتگوی سریع</span>`;

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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !chatPanel.hidden) toggleChat();
  });

  let chatBusy = false;
  const sendMessage = async (message) => {
    const trimmed = String(message || '').trim().slice(0, 120);
    if (!trimmed || chatBusy) return;
    chatBusy = true;
    chatSend.disabled = true;

    const userMsg = document.createElement('div');
    userMsg.className = 'chat-message user';
    userMsg.innerHTML = `<span class="avatar">شما</span><span class="msg" dir="auto">${esc(trimmed)}</span>`;
    chatMessages.appendChild(userMsg);

    chatInput.value = '';

    const typingInd = document.createElement('div');
    typingInd.className = 'chat-message bot';
    typingInd.innerHTML = `<span class="avatar">هوش مصنوعی</span><span class="msg typing">...</span>`;
    typingInd.id = 'typingIndicator';
    chatMessages.appendChild(typingInd);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const response = await generateMCPResponse(trimmed);

      const typingEl = $('#typingIndicator');
      if (typingEl) typingEl.remove();
      if (response === null) return;

      const botMsg = document.createElement('div');
      botMsg.className = 'chat-message bot';
      botMsg.innerHTML = `<span class="avatar">هوش مصنوعی</span><span class="msg" style="white-space:pre-line">${esc(response)}</span>`;
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

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage(chatInput.value);
    }
  });

  chatSend.addEventListener('click', () => sendMessage(chatInput.value));

  const quickQuestions = [
    '/help',
    '/price BTC',
    '/signal ETH',
    '/market',
    '/clear'
  ];

  const quickBar = document.createElement('div');
  quickBar.className = 'chat-quick';
  quickBar.dir = 'rtl';
  quickBar.innerHTML = `<span class="muted">امتحان کنید:</span>${quickQuestions.map(q => `<button class="quick-btn" type="button" data-cmd="${esc(q)}" dir="ltr" aria-label="اجرای ${esc(q)}">${esc(q)}</button>`).join(' ')}`;
  chatMessages.parentNode.insertBefore(quickBar, chatInput.parentNode);

  quickBar.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sendMessage(btn.dataset.cmd);
      chatInput.focus();
    });
  });
})();