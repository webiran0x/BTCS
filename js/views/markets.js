import { markets, cachedMarkets, getGlobal, getFearGreed, getTrending, isStable } from '../api/market.js';
import { $, $$, icon, coinLogo, skeleton, errorBox, bindSeg, wireSortHeaders } from '../ui.js';
import { esc, price, compact, pct, changeHtml, money, dateTime } from '../format.js';
import { sparkline, gauge, treemap, changeColor } from '../charts/small.js';
import { watchlist } from '../store.js';

export const title = 'بازارها';

export async function render(el) {
  el.innerHTML = `
    <header class="hero">
      <p class="eyebrow">بازارهای زنده <span class="rule" aria-hidden="true"></span> ${esc(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
      <h1>قیمت ارزهای دیجیتال <em>امروز</em></h1>
      <p class="lede" id="mkSummary">قیمت‌های زنده، ارزش بازار و روند ۷ روزه برای ۲۵۰ ارز برتر.</p>
      <p class="key-hint">پشت قیمت‌ها: ۷۲ ساعت گذشته بیت‌کوین به شکل نمودار کندل سه‌بعدی، جدیدترین کندل آن با قیمت زنده حرکت می‌کند، و بزرگ‌ترین ارزها به عنوان توکن نمایش داده می‌شوند. هرچه توکن بزرگ‌تر باشد، ارزش بازار آن بیشتر است؛ لبه آن برای صعود در ۲۴ ساعت گذشته یشمی و برای ریزش مرجانی است. روی یک توکن اشاره کنید تا نام آن نمایش داده شود؛ برای باز کردن نمودارش کلیک کنید.</p>
    </header>
    <div class="global-strip" id="globalStrip">${Array.from({ length: 5 }, () => `<div class="card">${skeleton(2, 16)}</div>`).join('')}</div>
    <div class="grid g4" style="margin-bottom:14px">
      <div class="card"><div class="card-h"><h3>شاخص ترس و طمع</h3><span class="fine" id="fngDate"></span></div><div id="fng">${skeleton(3)}</div></div>
      <div class="card"><div class="card-h"><h3>ترندها</h3></div><div class="hl-list" id="trending">${skeleton(5)}</div></div>
      <div class="card"><div class="card-h"><h3>بیشترین رشد <span class="fine">۲۴ ساعته</span></h3></div><div class="hl-list" id="gainers">${skeleton(5)}</div></div>
      <div class="card"><div class="card-h"><h3>بیشترین ریزش <span class="fine">۲۴ ساعته</span></h3></div><div class="hl-list" id="losers">${skeleton(5)}</div></div>
    </div>
    <div class="card">
      <div class="card-h">
        <div class="seg" id="scope"><button data-v="all" class="on">همه ارزها</button><button data-v="watch">${icon('star', 13)} واچ‌لیست</button></div>
        <div class="row">
          <input class="inp" id="filter" placeholder="فیلتر..." style="width:150px">
          <div class="seg" id="mode"><button data-v="table" class="on">جدول</button><button data-v="heatmap">نقشه حرارتی</button></div>
        </div>
      </div>
      <div id="tableArea">${skeleton(10, 26)}</div>
    </div>`;

  const state = { scope: 'all', mode: 'table', sort: 'rank', dir: 1, filter: '', limit: 100, rows: cachedMarkets() || [] };
  let disposed = false;

  const drawTable = () => {
    const area = $('#tableArea', el);
    let rows = state.rows;
    if (state.scope === 'watch') { const w = watchlist.all(); rows = rows.filter((r) => w.includes(r.symbol)); }
    if (state.filter) { const f = state.filter.toLowerCase(); rows = rows.filter((r) => r.symbol.toLowerCase().includes(f) || r.name.toLowerCase().includes(f)); }
    if (!rows.length) { area.innerHTML = `<div class="empty">${state.scope === 'watch' ? 'واچ‌لیست شما خالی است — برای افزودن یک ارز، روی ☆ کنار آن ضربه بزنید.' : 'ارزی مطابقت ندارد.'}</div>`; return; }
    if (state.mode === 'heatmap') {
      area.innerHTML = '<div class="treemap" id="tm"></div><p class="fine mt">اندازه کاشی = ارزش بازار · رنگ = تغییر ۲۴ ساعته. برای باز کردن ارز، روی یک کاشی ضربه بزنید.</p>';
      const top = rows.filter((r) => !isStable(r.symbol)).slice(0, 60);
      treemap($('#tm', area), top.map((r) => ({ value: Math.sqrt(r.marketCap || 1), label: r.symbol, sub: pct(r.change24h), color: changeColor(r.change24h), symbol: r.symbol })), { onClick: (r) => { location.hash = `#/coin/${r.symbol}`; } });
      return;
    }
    const key = state.sort;
    rows = [...rows].sort((a, b) => ((a[key] ?? -Infinity) > (b[key] ?? -Infinity) ? 1 : -1) * state.dir * (key === 'rank' || key === 'name' ? 1 : -1));
    // rank and name read top-down when dir is 1; every other column reads largest first
    const order = (k) => (state.sort !== k ? 'none' : (state.dir === 1) === (k === 'rank' || k === 'name') ? 'ascending' : 'descending');
    const th = (k, label, cls = '') => `<th data-sort="${k}" class="${cls}" aria-sort="${order(k)}">${label}${state.sort === k ? (state.dir === 1 ? '\u00a0↓' : '\u00a0↑') : ''}</th>`;
    area.innerHTML = `<div class="tbl-wrap"><table class="tbl" id="mkt">
      <thead><tr><th class="l" style="width:28px"></th>${th('rank', '#', 'l hide-p')}${th('name', 'ارز', 'l')}${th('price', 'قیمت')}${th('change1h', '۱س', 'hide-m hide-l')}${th('change24h', '۲۴س')}${th('change7d', '۷روز', 'hide-m')}${th('marketCap', 'ارزش بازار', 'hide-p')}${th('volume24h', 'حجم ۲۴س', 'hide-m hide-t')}<th class="hide-m hide-t">۷ روز گذشته</th></tr></thead>
      <tbody>${rows.slice(0, state.limit).map((r) => `
        <tr data-sym="${esc(r.symbol)}" data-pair="${r.binance || ''}">
          <td class="l"><button class="star ${watchlist.has(r.symbol) ? 'on' : ''}" data-star="${esc(r.symbol)}" aria-label="افزودن ${esc(r.name)} به واچ‌لیست">${icon('star', 15)}</button></td>
          <td class="l muted hide-p">${r.rank ?? ''}</td>
          <td class="l"><div class="coin-cell">${coinLogo(r, 26)}<b>${esc(r.name)}</b><small>${esc(r.symbol)}</small></div></td>
          <td class="p">${money(r.price)}</td>
          <td class="hide-m hide-l">${changeHtml(r.change1h)}</td>
          <td class="c24">${changeHtml(r.change24h)}</td>
          <td class="hide-m">${changeHtml(r.change7d)}</td>
          <td class="hide-p">${compact(r.marketCap)}</td>
          <td class="hide-m hide-t">${compact(r.volume24h)}</td>
          <td class="hide-m hide-t">${sparkline(r.sparkline, { w: 128, h: 38 })}</td>
        </tr>`).join('')}</tbody></table></div>
       ${rows.length > state.limit ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" id="more">نمایش بیشتر (${rows.length - state.limit})</button></div>` : ''}`;
    wireSortHeaders(area, (k) => { state.dir = state.sort === k ? -state.dir : 1; state.sort = k; drawTable(); });
    $('#mkt tbody', area).addEventListener('click', (e) => {
      const star = e.target.closest('[data-star]');
      if (star) { e.stopPropagation(); star.classList.toggle('on', watchlist.toggle(star.dataset.star)); if (state.scope === 'watch') drawTable(); return; }
      const tr = e.target.closest('tr[data-sym]');
      if (tr) location.hash = `#/coin/${tr.dataset.sym}`;
    });
    $('#more', area)?.addEventListener('click', () => { state.limit += 150; drawTable(); });
  };

  bindSeg($('#scope', el), (v) => { state.scope = v; drawTable(); });
  bindSeg($('#mode', el), (v) => { state.mode = v; drawTable(); });
  $('#filter', el).addEventListener('input', (e) => { state.filter = e.target.value; drawTable(); });
  if (state.rows.length) drawTable();

  // The ticker first: when a long name has to be shortened, the symbol stays readable.
  const listRow = (c, right) => `<a href="#/coin/${esc(c.symbol)}" title="${esc(c.name)} (${esc(c.symbol)})">${coinLogo(c, 22)}<span class="nm">${esc(c.symbol)} <span class="muted">${esc(c.name)}</span></span>${right}</a>`;

  const loadMarkets = async () => {
    try {
      state.rows = await markets();
      if (disposed) return;
      drawTable();
      const movers = state.rows.filter((r) => !isStable(r.symbol) && r.volume24h > 5e6 && Number.isFinite(r.change24h));
      const g = [...movers].sort((a, b) => b.change24h - a.change24h).slice(0, 5);
      const l = [...movers].sort((a, b) => a.change24h - b.change24h).slice(0, 5);
      $('#gainers', el).innerHTML = g.length ? g.map((c) => listRow(c, changeHtml(c.change24h))).join('') : '<p class="muted">داده‌ای از نوسانات فعلی موجود نیست.</p>';
      $('#losers', el).innerHTML = l.length ? l.map((c) => listRow(c, changeHtml(c.change24h))).join('') : '<p class="muted">داده‌ای از نوسانات فعلی موجود نیست.</p>';
    } catch (e) {
      $('#tableArea', el).innerHTML = errorBox('بارگیری داده‌های بازار امکان‌پذیر نبود.', loadMarkets);
    }
  };

  // Each widget fails on its own: one source being down must not leave the
  // others (or itself) stuck on a loading skeleton forever.
  const loadGlobal = async () => {
    let g;
    try { g = await getGlobal(); } catch (e) {
      if (disposed) return;
      $('#globalStrip', el).innerHTML = `<div class="card empty" style="grid-column:1/-1"><b>خلاصه بازار جهانی در دسترس نیست</b><p class="fine">${esc(e?.message || 'منبع بازار جهانی پاسخ نداد.')}</p></div>`;
      return;
    }
    if (disposed) return;
    const card = (k, v, s = '') => `<div class="card stat"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
    $('#globalStrip', el).innerHTML = [
      card('کل ارزش بازار', compact(g.totalMarketCap), `${changeHtml(g.marketCapChange24h)} <span class="muted">۲۴س</span>`),
      card('حجم ۲۴ ساعته', compact(g.totalVolume), '<span class="muted">همه صرافی‌ها</span>'),
      card('دامیننس بیت‌کوین', pct(g.btcDominance, 1, false), '<span class="muted">سهم از ارزش بازار</span>'),
      card('دامیننس اتریوم', pct(g.ethDominance, 1, false), '<span class="muted">سهم از ارزش بازار</span>'),
      card('ارزهای رصدشده', g.activeCryptocurrencies?.toLocaleString('en-US') ?? '—', g.markets ? `<span class="muted">${g.markets.toLocaleString('en-US')} بازار</span>` : ''),
    ].join('');
    $('#mkSummary', el).innerHTML = `ارزش کل بازار ارز دیجیتال <b>${compact(g.totalMarketCap)}</b> است که در ۲۴ ساعت گذشته ${g.marketCapChange24h >= 0 ? 'افزایش' : 'کاهش'} <b class="${g.marketCapChange24h >= 0 ? 'up' : 'down'}">${pct(Math.abs(g.marketCapChange24h), 2, false)}</b> داشته است.`;
  };

  const loadFng = async () => {
    let f;
    try { f = await getFearGreed(); } catch (e) {
      if (!disposed) $('#fng', el).innerHTML = `<div class="empty"><p>شاخص ترس و طمع در دسترس نیست.</p><p class="fine">${esc(e?.message || 'منبع احساسات بازار پاسخ نداد.')}</p></div>`;
      return;
    }
    if (disposed) return;
    if (!f?.length) { $('#fng', el).innerHTML = '<div class="empty"><p>هیچ داده اخیری از شاخص ترس و طمع دریافت نشد.</p></div>'; return; }
    const now = f[0], week = f[7], month = f[29];
    // The header had an empty slot reserved for this and nothing ever filled it,
    // so the card gave no clue how fresh the reading was.
    const stamp = $('#fngDate', el);
    if (stamp && now.timestamp) stamp.textContent = `به تاریخ ${dateTime(now.timestamp / 1000, false)}`;
    $('#fng', el).innerHTML = `${gauge(now.value, now.classification)}
      <div class="row spread fine" style="margin-top:6px"><span>دیروز <b>${f[1]?.value ?? '—'}</b></span><span>هفته گذشته <b>${week?.value ?? '—'}</b></span><span>ماه گذشته <b>${month?.value ?? '—'}</b></span></div>`;
  };

  const loadTrending = async () => {
    let t;
    try { t = await getTrending(); } catch (e) {
      if (!disposed) $('#trending', el).innerHTML = `<p class="muted">داده‌های ترند در دسترس نیست: ${esc(e?.message || 'منبع در دسترس نیست')}.</p>`;
      return;
    }
    if (disposed) return;
    $('#trending', el).innerHTML = t.slice(0, 5).map((c) => listRow(c, changeHtml(c.change24h))).join('') || '<p class="muted">داده‌ای وجود ندارد</p>';
  };

  loadMarkets(); loadGlobal(); loadFng(); loadTrending();

  // live price updates for visible rows
  const onTick = (e) => {
    if (state.mode !== 'table') return;
    for (const t of e.detail) {
      const tr = el.querySelector(`tr[data-pair="${t.s}"]`);
      if (!tr) continue;
      const cell = tr.querySelector('.p');
      const p = +t.c;
      const prev = +cell.dataset.v || 0;
      cell.dataset.v = p;
      const txt = `${money(p)}`;
      if (cell.textContent !== txt) {
        cell.textContent = txt;
        if (prev) { cell.classList.remove('flash-up', 'flash-down'); void cell.offsetWidth; cell.classList.add(p >= prev ? 'flash-up' : 'flash-down'); }
      }
    }
  };
  window.addEventListener('cv:tickers', onTick);
  const refresh = setInterval(loadMarkets, 90e3);
  return () => { disposed = true; window.removeEventListener('cv:tickers', onTick); clearInterval(refresh); };
}