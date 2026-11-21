// معاملات فیوچرز و مشتقات: نرخ تأمین مالی، سود باز (Open Interest)، پوزیشن‌های لانگ/شورت و لیکوییدیشن‌های زنده.
import { markets, isStable } from '../api/market.js';
import { futuresOverview, futuresSnapshot, liquidationStream, interpretFutures, annualiseFunding } from '../api/futures.js';
import { LineChart } from '../charts/line.js';
import { $, $$, skeleton, coinLogo, icon, errorBox } from '../ui.js';
import { esc, pct, money, compact, num, ago, dateTime } from '../format.js';

export const title = 'فیوچرز';

function setMeta(nameOrProp, content, isProp = false) {
  if (!content) return;
  const attr = isProp ? 'property' : 'name';
  let tag = document.head.querySelector(`meta[${attr}="${nameOrProp}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, nameOrProp);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(url) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

function syncSeo(sym, snap = null) {
  const cleanSym = (sym || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTC';
  const pageTitle = `فیوچرز و مشتقات ${cleanSym} | فاندینگ ریت، سود باز و لیکوییدیشن زنده | BTCS`;
  const desc = snap?.markPrice
    ? `پایش زنده فیوچرز ${cleanSym} (قیمت نشانگر ${money(snap.markPrice)}): نرخ تأمین مالی، سود باز (Open Interest)، نسبت حساب‌های لانگ/شورت و جریان لیکوییدیشن‌ها.`
    : `پایش زنده بازار پرپچوئل فیوچرز ${cleanSym}: نرخ تأمین مالی، سود باز، پایه قیمت و لیکوییدیشن‌های لحظه‌ای.`;

  document.title = pageTitle;
  setMeta('description', desc);
  setMeta('og:title', pageTitle, true);
  setMeta('og:description', desc, true);
  setMeta('og:type', 'website', true);
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', pageTitle);
  setMeta('twitter:description', desc);

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const canonicalUrl = `${baseUrl}#/futures/${cleanSym.toLowerCase()}`;
  setCanonical(canonicalUrl);

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'بازارها', item: `${baseUrl}#/` },
          { '@type': 'ListItem', position: 2, name: 'فیوچرز', item: `${baseUrl}#/futures` },
          { '@type': 'ListItem', position: 3, name: cleanSym, item: canonicalUrl },
        ],
      },
      {
        '@type': 'Dataset',
        name: `داده‌های مشتقات پرپچوئل ${cleanSym}`,
        description: desc,
        url: canonicalUrl,
      },
    ],
  };

  let ld = document.getElementById('ld-futures-2026');
  if (!ld) {
    ld = document.createElement('script');
    ld.id = 'ld-futures-2026';
    ld.type = 'application/ld+json';
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify(schema);
}

export async function render(el, [symParam]) {
  const st = {
    sym: (symParam || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTC',
    liqs: [],
    charts: [],
    stop: null,
    disposed: false,
    coinSeq: 0,
    liqTimer: null,
    poll: null,
    liqState: 'connecting',
    venue: null,
  };
  const REFRESH_MS = 60e3;
  const MIN_LIQ_USD = 250;
  const tsLine = (at) => `<span style="color:var(--fut-muted);font-size:0.78rem" title="${esc(dateTime(at, true))}">خوانده شده در ${esc(ago(at))}</span>`;

  syncSeo(st.sym, null);

  el.innerHTML = `
    <style>
      .ap26-fut-wrap {
        --fut-surface: rgba(22, 22, 26, 0.74);
        --fut-card: rgba(255, 255, 255, 0.035);
        --fut-card-hover: rgba(255, 255, 255, 0.06);
        --fut-line: rgba(255, 255, 255, 0.09);
        --fut-line-strong: rgba(255, 255, 255, 0.18);
        --fut-ink: #f5f5f7;
        --fut-sub: rgba(245, 245, 247, 0.68);
        --fut-muted: rgba(245, 245, 247, 0.44);
        --fut-indigo: #6e6cff;
        --fut-green: #30d158;
        --fut-amber: #ffd60a;
        direction: rtl;
        text-align: right;
        max-width: 1360px;
        margin: 0 auto;
        padding: 8px 0 64px;
        color: var(--fut-ink);
        font-variant-numeric: tabular-nums;
      }
      .ap26-fut-hero {
        position: relative;
        overflow: hidden;
        background:
          radial-gradient(640px circle at 92% 12%, rgba(110, 108, 255, 0.14), transparent 55%),
          radial-gradient(560px circle at 8% 90%, rgba(48, 209, 88, 0.09), transparent 55%),
          var(--fut-surface);
        border: 1px solid var(--fut-line);
        border-radius: 30px;
        padding: 30px 34px;
        backdrop-filter: blur(36px) saturate(180%);
        -webkit-backdrop-filter: blur(36px) saturate(180%);
        box-shadow: 0 28px 64px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        margin-bottom: 20px;
      }
      .ap26-fut-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 0.76rem;
        font-weight: 600;
        color: rgba(245, 245, 247, 0.76);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--fut-line);
        padding: 5px 12px;
        border-radius: 999px;
        margin-bottom: 10px;
      }
      .ap26-fut-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--fut-green);
        box-shadow: 0 0 10px var(--fut-green);
      }
      .ap26-fut-h1 {
        font-size: clamp(1.65rem, 2.8vw, 2.25rem);
        font-weight: 700;
        letter-spacing: -0.025em;
        line-height: 1.22;
        margin: 0 0 8px 0;
      }
      .ap26-fut-sub {
        font-size: 0.96rem;
        line-height: 1.68;
        color: var(--fut-sub);
        margin: 0;
        max-width: 900px;
      }
      .ap26-fut-bento {
        display: grid;
        grid-template-columns: minmax(0, 2.15fr) minmax(0, 1fr);
        gap: 20px;
        align-items: start;
      }
      @media (max-width: 1040px) {
        .ap26-fut-bento { grid-template-columns: 1fr; }
        .ap26-fut-hero { padding: 24px 20px; border-radius: 24px; }
      }
      .ap26-fut-card {
        background: var(--fut-card);
        border: 1px solid var(--fut-line);
        border-radius: 24px;
        padding: 22px 24px;
        backdrop-filter: blur(26px) saturate(170%);
        -webkit-backdrop-filter: blur(26px) saturate(170%);
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.28);
        transition: border-color 0.22s ease, background 0.22s ease;
      }
      .ap26-fut-card:hover {
        border-color: var(--fut-line-strong);
        background: var(--fut-card-hover);
      }
      .ap26-fut-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 16px;
      }
      .ap26-fut-head h2,
      .ap26-fut-head h3 {
        margin: 0;
        font-size: 1.12rem;
        font-weight: 700;
        letter-spacing: -0.015em;
      }
      .ap26-fut-kpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      @media (max-width: 900px) {
        .ap26-fut-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 480px) {
        .ap26-fut-kpis { grid-template-columns: 1fr; }
      }
      .ap26-fut-kpi {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 18px;
        padding: 14px 16px;
      }
      .ap26-fut-kpi .k {
        display: block;
        font-size: 0.78rem;
        color: var(--fut-muted);
      }
      .ap26-fut-kpi .v {
        display: block;
        font-size: 1.18rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin: 6px 0 3px;
      }
      .ap26-fut-kpi .s {
        display: block;
        font-size: 0.74rem;
        color: var(--fut-muted);
      }
      .ap26-fut-charts {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-top: 16px;
      }
      @media (max-width: 720px) {
        .ap26-fut-charts { grid-template-columns: 1fr; }
      }
      .ap26-fut-chart-box {
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 18px;
        padding: 14px 16px;
      }
      .ap26-fut-chart-box h4 {
        margin: 0 0 10px;
        font-size: 0.86rem;
        font-weight: 600;
        color: var(--fut-sub);
      }
      .ap26-fut-tbl-wrap {
        overflow-x: auto;
        border-radius: 14px;
      }
      .ap26-fut-tbl {
        width: 100%;
        border-collapse: collapse;
      }
      .ap26-fut-tbl th {
        padding: 11px 13px;
        text-align: right;
        font-size: 0.76rem;
        font-weight: 600;
        color: var(--fut-muted);
        border-bottom: 1px solid var(--fut-line);
        white-space: nowrap;
      }
      .ap26-fut-tbl td {
        padding: 12px 13px;
        text-align: right;
        font-size: 0.88rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        white-space: nowrap;
      }
      .ap26-fut-tbl tbody tr {
        transition: background 0.16s ease;
        cursor: pointer;
      }
      .ap26-fut-tbl tbody tr:hover {
        background: rgba(255, 255, 255, 0.05);
      }
      .ap26-fut-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 11px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid var(--fut-line);
        color: var(--fut-sub);
      }
      .ap26-fut-pill i {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      .ap26-fut-pill.on {
        background: rgba(48, 209, 88, 0.14);
        border-color: rgba(48, 209, 88, 0.32);
        color: var(--fut-green);
      }
      .ap26-fut-pill.warn {
        background: rgba(255, 214, 10, 0.14);
        border-color: rgba(255, 214, 10, 0.32);
        color: var(--fut-amber);
      }
      .ap26-fut-action-link {
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid var(--fut-line);
        padding: 6px 12px;
        border-radius: 10px;
        color: var(--fut-ink);
        text-decoration: none;
        font-size: 0.8rem;
        font-weight: 500;
        transition: background 0.16s ease;
      }
      .ap26-fut-action-link:hover {
        background: rgba(255, 255, 255, 0.13);
      }
      .ap26-fut-liq-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding: 10px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }
      .ap26-fut-liq-row:last-child {
        border-bottom: 0;
      }
      .ltr-num {
        direction: ltr;
        unicode-bidi: isolate;
        display: inline-block;
      }
    </style>

    <section class="ap26-fut-wrap" aria-labelledby="futures-h1">
      <header class="ap26-fut-hero">
        <span class="ap26-fut-eyebrow"><i class="ap26-fut-dot" aria-hidden="true"></i>پایش زنده مشتقات · به‌روزرسانی خودکار</span>
        <h1 class="ap26-fut-h1" id="futures-h1">فیوچرز و مشتقات</h1>
        <p class="ap26-fut-sub">داده‌های اهرمی از قراردادهای پرپچوئل تتر (<span class="ltr-num">USDT Perpetual</span>) تا این لحظه: هزینه نگهداری پوزیشن‌ها، میزان شلوغی موقعیت‌های لانگ و شورت و لیکوییدیشن‌های زنده.</p>
      </header>

      <div class="ap26-fut-bento">
        <div style="display:flex;flex-direction:column;gap:20px">
          <article class="ap26-fut-card" id="coinCard" aria-live="polite">${skeleton(5, 22)}</article>
          <article class="ap26-fut-card" id="tableCard" aria-live="polite">${skeleton(8, 22)}</article>
        </div>

        <aside class="ap26-fut-card" aria-label="لیکوییدیشن‌های زنده">
          <div class="ap26-fut-head">
            <h3>لیکوییدیشن‌های زنده</h3>
            <span class="ap26-fut-pill" id="liqPill"><i aria-hidden="true"></i><span>در حال اتصال…</span></span>
          </div>
          <div id="liqList" aria-live="polite">
            <p style="color:var(--fut-muted);font-size:0.84rem;margin:0">در انتظار دریافت اولین لیکوییدیشن…</p>
          </div>
          <p style="margin:16px 0 0;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05);color:var(--fut-muted);font-size:0.78rem;line-height:1.65">هر ردیف نشان‌دهنده یک پوزیشن اهرمی واقعی است که به‌صورت اجباری بسته شده است. رویدادهای کمتر از <span class="ltr-num">${money(MIN_LIQ_USD)}</span> نمایش داده نمی‌شوند.</p>
        </aside>
      </div>
    </section>`;

  async function drawTable() {
    let list = [];
    try {
      list = (await markets()).filter((c) => c.binance && !isStable(c.symbol)).slice(0, 24);
    } catch {
      if (!st.disposed) $('#tableCard', el).innerHTML = errorBox('لیست ارزها بارگذاری نشد.', drawTable);
      return;
    }
    const rows = await futuresOverview(list.map((c) => c.symbol));
    if (st.disposed) return;
    const byS = new Map(list.map((c) => [c.symbol, c]));
    if (!rows.length) {
      $('#tableCard', el).innerHTML = errorBox('داده‌های فیوچرز در دسترس نیستند.', drawTable);
      return;
    }

    const venue = rows.source || 'Binance';
    const intervals = [...new Set(rows.map((r) => r.fundingIntervalHours || 8))].sort((a, b) => a - b);
    const sorted = [...rows].sort((a, b) => (b.openInterestUsd || 0) - (a.openInterestUsd || 0));

    $('#tableCard', el).innerHTML = `
      <div class="ap26-fut-head">
        <h2>بازار پرپچوئل فیوچرز · <span class="ltr-num">${esc(venue)}</span></h2>
        ${tsLine(Date.now())}
      </div>
      <div class="ap26-fut-tbl-wrap">
        <table class="ap26-fut-tbl">
          <thead>
            <tr>
              <th>ارز</th>
              <th>قیمت نشانگر</th>
              <th>تأمین مالی</th>
              <th>دوره</th>
              <th>سالانه</th>
              <th>پایه</th>
              <th>سود باز (OI)</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((r) => {
              const f = r.fundingRate === null ? null : r.fundingRate * 100;
              const hrs = r.fundingIntervalHours || 8;
              const yr = annualiseFunding(f, hrs);
              return `
                <tr data-sym="${esc(r.symbol)}">
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      ${coinLogo(byS.get(r.symbol) || { symbol: r.symbol }, 22)}
                      <b class="ltr-num">${esc(r.symbol)}</b>
                    </div>
                  </td>
                  <td><span class="ltr-num">${money(r.markPrice)}</span></td>
                  <td class="${f > 0.01 ? 'up' : f < -0.01 ? 'down' : ''}"><span class="ltr-num">${f === null ? '—' : `${f > 0 ? '+' : ''}${f.toFixed(4)}%`}</span></td>
                  <td style="color:var(--fut-muted)"><span class="ltr-num">${hrs}</span> ساعت</td>
                  <td style="color:var(--fut-muted)"><span class="ltr-num">${yr === null ? '—' : `${yr > 0 ? '+' : ''}${yr.toFixed(1)}%`}</span></td>
                  <td class="${r.basisPct > 0 ? 'up' : r.basisPct < 0 ? 'down' : ''}"><span class="ltr-num">${r.basisPct === null ? '—' : pct(r.basisPct, 3)}</span></td>
                  <td><span class="ltr-num">${compact(r.openInterestUsd)}</span></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <p style="margin:14px 0 0;color:var(--fut-muted);font-size:0.82rem;line-height:1.6">نرخ تأمین مالی مثبت یعنی پوزیشن‌های لانگ به شورت‌ها پرداخت می‌کنند. تسویه بسته به قرارداد هر <span class="ltr-num">${intervals.join(' یا ')}</span> ساعت انجام می‌شود.</p>`;

    $$('tr[data-sym]', el).forEach((tr) => {
      tr.addEventListener('click', () => {
        const nextSym = String(tr.dataset.sym || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!nextSym) return;
        st.sym = nextSym;
        syncSeo(st.sym, null);
        location.hash = `#/futures/${nextSym}`;
        drawCoin();
      });
    });
  }

  async function drawCoin(quiet = false) {
    const card = $('#coinCard', el);
    const want = st.sym;
    const seq = ++st.coinSeq;
    if (!quiet) card.innerHTML = skeleton(5, 22);
    const f = await futuresSnapshot(want).catch(() => null);
    if (st.disposed || seq !== st.coinSeq || want !== st.sym) return;
    if (!f) {
      st.charts.forEach((c) => c.destroy());
      st.charts = [];
      card.innerHTML = errorBox(`اطلاعات فیوچرز برای ${want} موجود نیست.`, () => drawCoin());
      return;
    }

    syncSeo(want, f);

    const iv = interpretFutures(f);
    const oiNow = f.openInterestUsd ?? f.oiHistory?.at(-1)?.usd ?? null;
    card.innerHTML = `
      <div class="ap26-fut-head">
        <h2><span class="ltr-num">${esc(f.pair)}</span> · <span class="ltr-num">${esc(f.source)}</span></h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${tsLine(f.fetchedAt)}
          <a class="ap26-fut-action-link" href="#/coin/${esc(st.sym)}">تحلیل <span class="ltr-num">${esc(st.sym)}</span></a>
        </div>
      </div>

      <div class="ap26-fut-kpis">
        <div class="ap26-fut-kpi">
          <span class="k">قیمت نشانگر</span>
          <span class="v ltr-num">${money(f.markPrice)}</span>
          <span class="s">پایه <span class="ltr-num">${f.basisPct === null ? '—' : pct(f.basisPct, 3)}</span></span>
        </div>
        <div class="ap26-fut-kpi">
          <span class="k">تأمین مالی</span>
          <span class="v ltr-num ${iv.fundingPct > 0.01 ? 'up' : iv.fundingPct < -0.01 ? 'down' : ''}">${iv.fundingPct === null ? '—' : `${iv.fundingPct > 0 ? '+' : ''}${iv.fundingPct.toFixed(4)}%`}</span>
          <span class="s ltr-num">${iv.annualisedFundingPct === null ? '' : `${iv.annualisedFundingPct.toFixed(1)}% سالانه`}</span>
        </div>
        <div class="ap26-fut-kpi">
          <span class="k">سود باز (OI)</span>
          <span class="v ltr-num">${compact(oiNow)}</span>
          <span class="s ltr-num ${iv.oiChange12hPct > 0 ? 'up' : iv.oiChange12hPct < 0 ? 'down' : ''}">${iv.oiChange12hPct === null ? '' : `${pct(iv.oiChange12hPct, 1)} در ۱۲ ساعت`}</span>
        </div>
        <div class="ap26-fut-kpi">
          <span class="k">حساب‌های لانگ</span>
          <span class="v ltr-num">${iv.longAccountsPct === null ? '—' : `${iv.longAccountsPct.toFixed(0)}%`}</span>
          <span class="s ltr-num">${f.topTraders?.at(-1)?.longPositionPct != null ? `تریدرهای برتر ${f.topTraders.at(-1).longPositionPct.toFixed(0)}% لانگ` : ''}</span>
        </div>
      </div>

      ${iv.notes.length ? `<ul style="margin:12px 0 4px;padding-right:18px;color:var(--fut-sub);font-size:0.85rem;line-height:1.65">${iv.notes.map((n) => `<li style="margin-bottom:4px">${esc(n)}</li>`).join('')}</ul>` : ''}

      <div class="ap26-fut-charts">
        <div class="ap26-fut-chart-box">
          <h4>سود باز (۷۲ ساعت)</h4>
          ${f.oiHistory?.length ? '<div id="oiC"></div>' : '<p style="color:var(--fut-muted);font-size:0.82rem;margin:0">تاریخچه در دسترس نیست.</p>'}
        </div>
        <div class="ap26-fut-chart-box">
          <h4>تاریخچه تأمین مالی</h4>
          <div id="fdC"></div>
        </div>
      </div>`;

    st.charts.forEach((c) => c.destroy());
    st.charts = [];
    if (f.oiHistory?.length) {
      const c = new LineChart($('#oiC', el), {
        height: 190,
        yFormat: (v) => compact(v),
        legend: false,
        xFormat: (x) => new Date(x).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }),
        tooltipX: (x) => dateTime(x, true),
      });
      c.set([{ name: 'سود باز', color: 'var(--series-1)', data: f.oiHistory.map((r) => ({ x: r.t, y: r.usd })) }]);
      c.resize();
      st.charts.push(c);
    }
    if (f.fundingHistory?.length) {
      const c = new LineChart($('#fdC', el), {
        height: 190,
        yFormat: (v) => `${(v * 100).toFixed(3)}%`,
        legend: false,
        zeroLine: 0,
        xFormat: (x) => new Date(x).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }),
        tooltipX: (x) => dateTime(x, true),
      });
      c.set([{ name: 'تأمین مالی', color: 'var(--series-4)', data: f.fundingHistory.map((r) => ({ x: r.t, y: r.rate })) }]);
      c.resize();
      st.charts.push(c);
    }
  }

  drawTable();
  drawCoin();
  st.poll = setInterval(() => {
    if (!st.disposed && !document.hidden) {
      drawTable();
      drawCoin(true);
    }
  }, REFRESH_MS);

  const setPill = (state) => {
    st.liqState = state;
    const pill = $('#liqPill', el);
    if (!pill) return;
    pill.classList.toggle('on', state === 'streaming' || state === 'live');
    pill.classList.toggle('warn', state === 'failed');
    const labelEl = pill.querySelector('span');
    if (labelEl) {
      labelEl.textContent =
        state === 'streaming' ? `زنده · ${st.venue || 'Binance'}`
        : state === 'live' ? `متصل · ${st.venue || 'Binance'}`
        : state === 'switching' ? 'تغییر منبع…'
        : state === 'open' ? 'متصل'
        : state === 'failed' ? 'خطای فید' : 'در حال اتصال…';
    }
  };

  let pending = false;
  st.stop = liquidationStream((ev, status, venue) => {
    if (ev?.venue) st.venue = ev.venue;
    else if (venue) st.venue = venue;
    if (!ev) {
      if (st.liqState !== 'streaming' || status === 'failed' || status === 'switching') setPill(status);
      return;
    }
    if (ev.usd !== null && ev.usd < MIN_LIQ_USD) return;
    st.liqs.unshift(ev);
    st.liqs = st.liqs.slice(0, 25);
    if (pending) return;
    pending = true;
    st.liqTimer = setTimeout(() => {
      pending = false;
      if (st.disposed) return;
      setPill('streaming');
      $('#liqList', el).innerHTML = st.liqs.map((l) => `
        <div class="ap26-fut-liq-row">
          <div>
            <b class="ltr-num">${esc(l.symbol)}</b>
            <span class="chip ${l.side === 'long' ? 'down' : 'up'}" style="margin-right:6px">${l.side === 'long' ? 'لانگ' : 'شورت'}</span>
          </div>
          <div style="text-align:left">
            <b class="ltr-num">${l.usd === null ? `${num(l.contracts)}` : compact(l.usd)}</b><br>
            <small class="ltr-num" style="color:var(--fut-muted);font-size:0.75rem">${money(l.price)}</small>
          </div>
        </div>`).join('');
    }, 400);
  });

  return () => {
    st.disposed = true;
    clearInterval(st.poll);
    clearTimeout(st.liqTimer);
    st.stop?.();
    st.charts.forEach((c) => c.destroy());
  };
}