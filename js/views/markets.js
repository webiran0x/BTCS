import { markets, cachedMarkets, getGlobal, getFearGreed, getTrending, isStable } from '../api/market.js';
import { $, $$, icon, coinLogo, skeleton, errorBox, bindSeg, wireSortHeaders } from '../ui.js';
import { esc, price, compact, pct, changeHtml, money, dateTime } from '../format.js';
import { sparkline, gauge, treemap, changeColor } from '../charts/small.js';
import { watchlist } from '../store.js';

export const title = 'بازارها';

const SEO_FAQS = [
  {
    q: 'ارزش کل بازار رمزارزها چگونه محاسبه می‌شود؟',
    a: 'ارزش کل بازار از جمع ضرب قیمت فعلی هر رمزارز در عرضه در گردش آن به دست می‌آید و تصویری کلی از اندازه و نقدینگی بازار ارائه می‌دهد.',
  },
  {
    q: 'دامیننس بیت‌کوین و اتریوم چه کمکی به تحلیل بازار می‌کند؟',
    a: 'سهم بیت‌کوین یا اتریوم از کل ارزش بازار نشان می‌دهد سرمایه بیشتر در دارایی‌های شاخص متمرکز است یا به سمت آلت‌کوین‌ها حرکت می‌کند.',
  },
  {
    q: 'شاخص ترس و طمع بازار رمزارز چه چیزی را نشان می‌دهد؟',
    a: 'این شاخص احساسات غالب معامله‌گران را از ترس شدید تا طمع شدید می‌سنجد؛ ترس شدید معمولاً با هیجان فروش و طمع شدید اغلب با هیجان خرید همراه است.',
  },
  {
    q: 'تفاوت حجم معاملات ۲۴ ساعته با ارزش بازار چیست؟',
    a: 'ارزش بازار اندازه کل دارایی‌های در گردش را نشان می‌دهد، در حالی که حجم معاملات ۲۴ ساعته میزان واقعی خرید و فروش انجام‌شده در شبانه‌روز گذشته را بیان می‌کند.',
  },
];

function injectMarketJsonLd() {
  if (typeof document === 'undefined') return;
  const scriptId = 'btcs-markets-jsonld';
  const origin = `${location.origin || 'https://btcs.ir'}/`;
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}#website`,
        name: document.title || 'BTCS',
        url: origin,
        inLanguage: 'fa-IR',
      },
      {
        '@type': 'WebPage',
        '@id': `${origin}#webpage`,
        url: origin,
        name: 'قیمت ارزهای دیجیتال امروز · ارزش بازار و شاخص ترس و طمع',
        description: 'قیمت لحظه‌ای رمزارزها، ارزش کل بازار، حجم معاملات ۲۴ ساعته، دامیننس، شاخص ترس و طمع، نقشه حرارتی و ابزارهای تحلیلی بازار.',
        isPartOf: { '@id': `${origin}#website` },
        inLanguage: 'fa-IR',
      },
      {
        '@type': 'FAQPage',
        mainEntity: SEO_FAQS.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
      },
    ],
  };

  let el = document.getElementById(scriptId);
  if (!el) {
    el = document.createElement('script');
    el.id = scriptId;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export async function render(el) {
  injectMarketJsonLd();

  el.innerHTML = `
    <style>
      .mk-wrap {
        direction: rtl;
        text-align: right;
        max-width: 1280px;
        margin: 0 auto;
        padding-bottom: 48px;
      }
      .apple-hero {
        position: relative;
        padding: 40px 34px;
        background:
          radial-gradient(circle at 88% 12%, rgba(10, 132, 255, 0.16), transparent 46%),
          radial-gradient(circle at 12% 88%, rgba(48, 209, 88, 0.08), transparent 45%),
          var(--glass);
        border: 1px solid var(--line);
        border-radius: 26px;
        backdrop-filter: blur(26px) saturate(1.45);
        -webkit-backdrop-filter: blur(26px) saturate(1.45);
        margin-bottom: 24px;
        box-shadow: var(--shadow-lg);
      }
      .apple-hero .eyebrow {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-2);
        margin: 0 0 12px 0;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .apple-hero h1 {
        font-size: clamp(1.9rem, 3.2vw, 2.55rem);
        font-weight: 800;
        letter-spacing: -0.025em;
        line-height: 1.2;
        margin: 0 0 14px 0;
        background: linear-gradient(180deg, var(--ivory) 0%, rgba(214, 221, 230, 0.78) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .apple-hero h1 em {
        font-style: normal;
        background: var(--gold-grad);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .apple-hero .lede {
        font-size: 1.04rem;
        color: var(--text);
        max-width: 780px;
        line-height: 1.7;
        margin: 0 0 12px 0;
      }
      .seo-pulse-note {
        font-size: 0.94rem;
        color: var(--text-2);
        line-height: 1.7;
        margin: 0 0 16px 0;
        max-width: 820px;
      }
      .seo-quick-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 14px 0 6px;
      }
      .seo-quick-links a {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 999px;
        font-size: 0.84rem;
        font-weight: 600;
        color: var(--text);
        background: var(--surface-2);
        border: 1px solid var(--line);
        text-decoration: none;
        transition: all 0.2s var(--ease);
      }
      .seo-quick-links a:hover {
        border-color: var(--accent);
        background: var(--accent-soft);
        transform: translateY(-1px);
      }
      .apple-hero .key-hint {
        font-size: 0.85rem;
        color: var(--text-muted);
        line-height: 1.65;
        border-right: 2px solid var(--accent);
        padding-right: 12px;
        margin: 16px 0 0 0;
      }
      .apple-card {
        background: var(--glass);
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 22px 24px;
        backdrop-filter: blur(22px) saturate(1.35);
        -webkit-backdrop-filter: blur(22px) saturate(1.35);
        transition: border-color 0.22s var(--ease), box-shadow 0.25s var(--ease);
      }
      .apple-card:hover {
        border-color: var(--line-strong);
        box-shadow: var(--shadow-lg);
      }
      .apple-card .card-h h3,
      .apple-card .card-h h2 {
        font-size: 1.1rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--ivory);
        margin: 0;
      }
      .apple-controls {
        display: flex;
        flex-direction: column;
        gap: 14px;
        margin-bottom: 20px;
      }
      @media (min-width: 768px) {
        .apple-controls {
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
        }
      }
      .coin-link {
        color: inherit;
        text-decoration: none;
        font-weight: 700;
      }
      .coin-link:hover {
        text-decoration: underline;
      }
      .seo-faq-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 14px;
        margin-top: 16px;
      }
      .seo-faq-item {
        background: var(--surface-2);
        border: 1px solid var(--line-soft);
        border-radius: 16px;
        padding: 16px;
      }
      .seo-faq-item h3 {
        font-size: 0.96rem;
        font-weight: 700;
        color: var(--ivory);
        margin: 0 0 8px 0;
      }
      .seo-faq-item p {
        font-size: 0.87rem;
        color: var(--text-2);
        line-height: 1.65;
        margin: 0;
      }
      .mk-wrap .tbl-wrap {
        border-radius: 16px;
        border: 1px solid var(--line-soft);
        overflow-x: auto;
      }
      .mk-wrap .tbl th {
        background: var(--surface-2);
        font-weight: 700;
        color: var(--text-2);
        padding: 12px 14px;
      }
      .mk-wrap .tbl td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line-soft);
      }
      .mk-wrap .tbl tr:last-child td { border-bottom: 0; }
      #globalStrip { min-height: 92px; margin-bottom: 20px; }
      #fng { min-height: 132px; }
      #trending, #gainers, #losers { min-height: 185px; }
      #tableArea { min-height: 420px; }
      @media (max-width: 640px) {
        .apple-hero { padding: 24px 18px; border-radius: 20px; }
        .apple-card { padding: 16px; border-radius: 18px; }
      }
    </style>

    <div class="mk-wrap" dir="rtl">
      <header class="apple-hero">
        <p class="eyebrow">بازارهای زنده <span class="rule" aria-hidden="true"></span> ${esc(new Date().toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
        <h1>قیمت ارزهای دیجیتال <em>امروز</em></h1>
        <p class="lede" id="mkSummary">قیمت لحظه‌ای ارزهای دیجیتال، ارزش کل بازار، حجم معاملات ۲۴ ساعته، دامیننس و روند ۷ روزه برای رمزارزهای برتر.</p>
        <p class="seo-pulse-note" id="mkPulse">این صفحه مرجع، وضعیت لحظه‌ای بازار کریپتو، شاخص ترس و طمع، رمزارزهای ترند و بیشترین رشد و ریزش روزانه را در کنار جدول قیمت و نقشه حرارتی یکجا گرد هم آورده است.</p>
        <nav class="seo-quick-links" aria-label="بخش‌های تحلیلی بازار">
          <a href="#/coin/BTC">تحلیل لحظه‌ای بیت‌کوین (BTC)</a>
          <a href="#/coin/ETH">تحلیل لحظه‌ای اتریوم (ETH)</a>
          <a href="#/scanner">اسکنر تکنیکال بازار</a>
          <a href="#/compare">مقایسه رمزارزها</a>
          <a href="#/ai">دستیار هوشمند بازار</a>
          <a href="#/track">سابقه دقت پیش‌بینی‌ها</a>
        </nav>
        <p class="key-hint">پشت قیمت‌ها: ۷۲ ساعت گذشته بیت‌کوین به شکل نمودار کندل سه‌بعدی، جدیدترین کندل آن با قیمت زنده حرکت می‌کند، و بزرگ‌ترین ارزها به عنوان توکن نمایش داده می‌شوند. هرچه توکن بزرگ‌تر باشد، ارزش بازار آن بیشتر است؛ لبه آن برای صعود در ۲۴ ساعت گذشته یشمی و برای ریزش مرجانی است. روی یک توکن اشاره کنید تا نام آن نمایش داده شود؛ برای باز کردن نمودارش کلیک کنید.</p>
      </header>

      <div class="global-strip" id="globalStrip">${Array.from({ length: 5 }, () => `<div class="apple-card">${skeleton(2, 16)}</div>`).join('')}</div>

      <div class="grid g4" style="margin-bottom:20px">
        <div class="apple-card"><div class="card-h"><h3>شاخص ترس و طمع</h3><span class="fine" id="fngDate"></span></div><div id="fng" style="margin-top:12px">${skeleton(3)}</div></div>
        <div class="apple-card"><div class="card-h"><h3>ترندها</h3></div><div class="hl-list" id="trending" style="margin-top:12px">${skeleton(5)}</div></div>
        <div class="apple-card"><div class="card-h"><h3>بیشترین رشد <span class="fine">۲۴ ساعته</span></h3></div><div class="hl-list" id="gainers" style="margin-top:12px">${skeleton(5)}</div></div>
        <div class="apple-card"><div class="card-h"><h3>بیشترین ریزش <span class="fine">۲۴ ساعته</span></h3></div><div class="hl-list" id="losers" style="margin-top:12px">${skeleton(5)}</div></div>
      </div>

      <section class="apple-card" aria-label="جدول و نقشه حرارتی رمزارزها">
        <div class="apple-controls">
          <div class="seg" id="scope"><button data-v="all" class="on">همه ارزها</button><button data-v="watch">${icon('star', 13)} واچ‌لیست</button></div>
          <div class="row" style="gap:12px; flex-wrap: wrap;">
            <input class="inp" id="filter" placeholder="جستجوی سریع ارز..." aria-label="جستجوی سریع ارز" style="width:190px; border-radius:12px;">
            <div class="seg" id="mode"><button data-v="table" class="on">جدول</button><button data-v="heatmap">نقشه حرارتی</button></div>
          </div>
        </div>
        <div id="tableArea">${skeleton(10, 26)}</div>
      </section>

      <section class="apple-card" style="margin-top:20px" aria-label="راهنمای سریع بازار و سوالات متداول">
        <div class="card-h">
          <h2>راهنمای خواندن داده‌های بازار رمزارزها</h2>
          <span class="fine">به‌روزرسانی خودکار داده‌ها</span>
        </div>
        <p class="fine" style="line-height:1.7;margin:6px 0 0">برای بررسی عمیق‌تر هر رمزارز، روی نام یا نماد آن در جدول کلیک کنید تا نمودار چندتایم‌فریمی، اندیکاتورها، سطوح کلیدی و سوابق مدل را ببینید. اطلاعات نمایش‌داده‌شده جنبه تحلیلی و آموزشی دارند و مشاوره سرمایه‌گذاری محسوب نمی‌شوند.</p>
        <div class="seo-faq-grid">
          ${SEO_FAQS.map((item) => `
            <article class="seo-faq-item">
              <h3>${esc(item.q)}</h3>
              <p>${esc(item.a)}</p>
            </article>
          `).join('')}
        </div>
      </section>
    </div>`;

  const state = { scope: 'all', mode: 'table', sort: 'rank', dir: 1, filter: '', limit: 100, rows: cachedMarkets() || [] };
  let disposed = false;

  const drawTable = () => {
    const area = $('#tableArea', el);
    let rows = state.rows;
    if (state.scope === 'watch') {
      const w = watchlist.all();
      rows = rows.filter((r) => w.includes(r.symbol));
    }
    if (state.filter) {
      const f = state.filter.toLowerCase();
      rows = rows.filter((r) => r.symbol.toLowerCase().includes(f) || r.name.toLowerCase().includes(f));
    }
    if (!rows.length) {
      area.innerHTML = `<div class="empty">${state.scope === 'watch' ? 'واچ‌لیست شما خالی است — برای افزودن یک ارز، روی ☆ کنار آن ضربه بزنید.' : 'ارزی مطابقت ندارد.'}</div>`;
      return;
    }
    if (state.mode === 'heatmap') {
      area.innerHTML = '<div class="treemap" id="tm"></div><p class="fine mt" style="text-align:center;">اندازه کاشی = ارزش بازار · رنگ = تغییر ۲۴ ساعته. برای باز کردن ارز، روی یک کاشی ضربه بزنید.</p>';
      const top = rows.filter((r) => !isStable(r.symbol)).slice(0, 60);
      treemap($('#tm', area), top.map((r) => ({
        value: Math.sqrt(r.marketCap || 1),
        label: r.symbol,
        sub: pct(r.change24h),
        color: changeColor(r.change24h),
        symbol: r.symbol,
      })), {
        onClick: (r) => { location.hash = `#/coin/${r.symbol}`; },
      });
      return;
    }

    const key = state.sort;
    rows = [...rows].sort((a, b) => ((a[key] ?? -Infinity) > (b[key] ?? -Infinity) ? 1 : -1) * state.dir * (key === 'rank' || key === 'name' ? 1 : -1));
    const order = (k) => (state.sort !== k ? 'none' : (state.dir === 1) === (k === 'rank' || k === 'name') ? 'ascending' : 'descending');
    const th = (k, label, cls = '') => `<th data-sort="${k}" class="${cls}" aria-sort="${order(k)}">${label}${state.sort === k ? (state.dir === 1 ? '\u00a0↓' : '\u00a0↑') : ''}</th>`;

    area.innerHTML = `<div class="tbl-wrap"><table class="tbl" id="mkt">
      <thead><tr><th class="l" style="width:28px"></th>${th('rank', '#', 'l hide-p')}${th('name', 'ارز', 'l')}${th('price', 'قیمت')}${th('change1h', '۱ ساعته', 'hide-m hide-l')}${th('change24h', '۲۴ ساعته')}${th('change7d', '۷روز', 'hide-m')}${th('marketCap', 'ارزش بازار', 'hide-p')}${th('volume24h', 'حجم ۲۴ ساعته', 'hide-m hide-t')}<th class="hide-m hide-t">۷ روز گذشته</th></tr></thead>
      <tbody>${rows.slice(0, state.limit).map((r) => `
        <tr data-sym="${esc(r.symbol)}" data-pair="${r.binance || ''}">
          <td class="l"><button class="star ${watchlist.has(r.symbol) ? 'on' : ''}" data-star="${esc(r.symbol)}" aria-label="افزودن ${esc(r.name)} به واچ‌لیست">${icon('star', 15)}</button></td>
          <td class="l muted hide-p">${r.rank ?? ''}</td>
          <td class="l"><div class="coin-cell">${coinLogo(r, 26)}<a class="coin-link" href="#/coin/${encodeURIComponent(r.symbol)}">${esc(r.name)}</a><small>${esc(r.symbol)}</small></div></td>
          <td class="p">${money(r.price)}</td>
          <td class="hide-m hide-l">${changeHtml(r.change1h)}</td>
          <td class="c24">${changeHtml(r.change24h)}</td>
          <td class="hide-m">${changeHtml(r.change7d)}</td>
          <td class="hide-p">${compact(r.marketCap)}</td>
          <td class="hide-m hide-t">${compact(r.volume24h)}</td>
          <td class="hide-m hide-t">${sparkline(r.sparkline, { w: 128, h: 38 })}</td>
        </tr>`).join('')}</tbody></table></div>
       ${rows.length > state.limit ? `<div class="row" style="justify-content:center;margin-top:16px"><button class="btn" id="more" style="border-radius:12px; padding: 10px 24px;">نمایش بیشتر (${(rows.length - state.limit).toLocaleString('fa-IR')})</button></div>` : ''}`;

    wireSortHeaders(area, (k) => {
      state.dir = state.sort === k ? -state.dir : 1;
      state.sort = k;
      drawTable();
    });
    $('#mkt tbody', area).addEventListener('click', (e) => {
      const star = e.target.closest('[data-star]');
      if (star) {
        e.stopPropagation();
        star.classList.toggle('on', watchlist.toggle(star.dataset.star));
        if (state.scope === 'watch') drawTable();
        return;
      }
      const link = e.target.closest('a.coin-link');
      if (link) {
        e.preventDefault();
        location.hash = link.getAttribute('href');
        return;
      }
      const tr = e.target.closest('tr[data-sym]');
      if (tr) location.hash = `#/coin/${tr.dataset.sym}`;
    });
    $('#more', area)?.addEventListener('click', () => {
      state.limit += 150;
      drawTable();
    });
  };

  bindSeg($('#scope', el), (v) => { state.scope = v; drawTable(); });
  bindSeg($('#mode', el), (v) => { state.mode = v; drawTable(); });
  $('#filter', el).addEventListener('input', (e) => { state.filter = e.target.value; drawTable(); });
  if (state.rows.length) drawTable();

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

  const loadGlobal = async () => {
    let g;
    try { g = await getGlobal(); } catch (e) {
      if (disposed) return;
      $('#globalStrip', el).innerHTML = `<div class="apple-card empty" style="grid-column:1/-1"><b>خلاصه بازار جهانی در دسترس نیست</b><p class="fine">${esc(e?.message || 'منبع بازار جهانی پاسخ نداد.')}</p></div>`;
      return;
    }
    if (disposed) return;
    const card = (k, v, s = '') => `<div class="apple-card stat"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
    $('#globalStrip', el).innerHTML = [
      card('کل ارزش بازار', compact(g.totalMarketCap), `${changeHtml(g.marketCapChange24h)} <span class="muted">۲۴س</span>`),
      card('حجم ۲۴ ساعته', compact(g.totalVolume), '<span class="muted">همه صرافی‌ها</span>'),
      card('دامیننس بیت‌کوین', pct(g.btcDominance, 1, false), '<span class="muted">سهم از ارزش بازار</span>'),
      card('دامیننس اتریوم', pct(g.ethDominance, 1, false), '<span class="muted">سهم از ارزش بازار</span>'),
      card('ارزهای رصدشده', g.activeCryptocurrencies?.toLocaleString('fa-IR') ?? '—', g.markets ? `<span class="muted">${g.markets.toLocaleString('fa-IR')} بازار</span>` : ''),
    ].join('');
    $('#mkSummary', el).innerHTML = `ارزش کل بازار ارز دیجیتال <b>${compact(g.totalMarketCap)}</b> است که در ۲۴ ساعت گذشته ${g.marketCapChange24h >= 0 ? 'افزایش' : 'کاهش'} <b class="${g.marketCapChange24h >= 0 ? 'up' : 'down'}">${pct(Math.abs(g.marketCapChange24h), 2, false)}</b> داشته است.`;
    $('#mkPulse', el).innerHTML = `حجم معاملات ۲۴ ساعته به <b>${compact(g.totalVolume)}</b> رسیده و دامیننس بیت‌کوین <b>${pct(g.btcDominance, 1, false)}</b> و دامیننس اتریوم <b>${pct(g.ethDominance, 1, false)}</b> ثبت شده است.`;
  };

  const loadFng = async () => {
    let f;
    try { f = await getFearGreed(); } catch (e) {
      if (!disposed) $('#fng', el).innerHTML = `<div class="empty"><p>شاخص ترس و طمع در دسترس نیست.</p><p class="fine">${esc(e?.message || 'منبع احساسات بازار پاسخ نداد.')}</p></div>`;
      return;
    }
    if (disposed) return;
    if (!f?.length) {
      $('#fng', el).innerHTML = '<div class="empty"><p>هیچ داده اخیری از شاخص ترس و طمع دریافت نشد.</p></div>';
      return;
    }
    const now = f[0], week = f[7], month = f[29];
    const stamp = $('#fngDate', el);
    if (stamp && now.timestamp) {
      stamp.textContent = `به تاریخ ${new Intl.DateTimeFormat('fa-IR', {
        calendar: 'persian',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Tehran',
      }).format(new Date(Number(now.timestamp) * 1000))}`;
    }
    $('#fng', el).innerHTML = `${gauge(now.value, now.classification)}
      <div class="row spread fine" style="margin-top:10px"><span>دیروز <b>${f[1]?.value ?? '—'}</b></span><span>هفته گذشته <b>${week?.value ?? '—'}</b></span><span>ماه گذشته <b>${month?.value ?? '—'}</b></span></div>`;
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

  loadMarkets();
  loadGlobal();
  loadFng();
  loadTrending();

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
        if (prev) {
          cell.classList.remove('flash-up', 'flash-down');
          void cell.offsetWidth;
          cell.classList.add(p >= prev ? 'flash-up' : 'flash-down');
        }
      }
    }
  };
  window.addEventListener('cv:tickers', onTick);
  const refresh = setInterval(loadMarkets, 90e3);

  void price; void dateTime;

  return () => {
    disposed = true;
    window.removeEventListener('cv:tickers', onTick);
    clearInterval(refresh);
  };
}