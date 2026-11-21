import { markets, isStable } from '../api/market.js';
import { compareExchanges, EXCHANGE_NAMES } from '../api/exchanges.js';
import { $, skeleton, icon, errorBox } from '../ui.js';
import { esc, usd, pct, compact, changeHtml } from '../format.js';

export const title = 'مقایسه صرافی‌ها';

const SYM_FA = {
  BTC: 'بیت‌کوین',
  ETH: 'اتریوم',
  SOL: 'سولانا',
  BNB: 'بایننس کوین',
  XRP: 'ریپل',
  ADA: 'کاردانو',
  DOGE: 'دوج‌کوین',
  AVAX: 'آوالانچ',
  LINK: 'چین‌لینک',
  TON: 'تون‌کوین',
};

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

function syncSeo(base, r) {
  const faName = SYM_FA[base] ? `${SYM_FA[base]} (${base})` : base;
  const pageTitle = `مقایسه قیمت و اسپرد ${faName} در صرافی‌ها | BTCS`;
  const desc = r?.median
    ? `مقایسه لحظه‌ای قیمت ${faName} (میانه ${usd(r.median)})، اسپرد، بهترین قیمت خرید در ${r.bestBuy?.exchange || 'صرافی‌ها'} و حجم معاملات در ${EXCHANGE_NAMES.length} صرافی.`
    : `مقایسه لحظه‌ای قیمت، اسپرد، اختلاف قیمت و حجم معاملات ${faName} در بین ${EXCHANGE_NAMES.length} صرافی معتبر رمزارز.`;

  document.title = pageTitle;
  setMeta('description', desc);
  setMeta('og:title', pageTitle, true);
  setMeta('og:description', desc, true);
  setMeta('og:type', 'website', true);
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', pageTitle);
  setMeta('twitter:description', desc);

  const canonicalUrl = `${window.location.origin}${window.location.pathname}#/exchanges/${encodeURIComponent(base)}`;
  setCanonical(canonicalUrl);

  const activeRows = (r?.rows || []).filter((x) => x.ok).slice(0, 15);
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'بازارها', item: `${window.location.origin}${window.location.pathname}#/` },
          { '@type': 'ListItem', position: 2, name: 'مقایسه صرافی‌ها', item: `${window.location.origin}${window.location.pathname}#/exchanges` },
          { '@type': 'ListItem', position: 3, name: faName, item: canonicalUrl },
        ],
      },
      {
        '@type': 'ItemList',
        name: `مقایسه صرافی‌های ${faName}`,
        numberOfItems: activeRows.length,
        itemListElement: activeRows.map((row, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${row.exchange} (${row.pair})`,
          ...(row.price ? { description: `قیمت: ${usd(row.price)} | اسپرد: ${pct(row.spreadPct, 3, false)}` } : {}),
        })),
      },
    ],
  };

  let ld = document.getElementById('ld-exchanges-2026');
  if (!ld) {
    ld = document.createElement('script');
    ld.id = 'ld-exchanges-2026';
    ld.type = 'application/ld+json';
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify(schema);
}

export async function render(el, [preset]) {
  const st = {
    base: (preset || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTC',
    timer: null,
    disposed: false,
  };
  const all = await markets().catch(() => []);
  const options = all.filter((c) => !isStable(c.symbol)).slice(0, 120);

  el.innerHTML = `
    <style>
      .ap26-shell {
        --bg-surface: rgba(22, 22, 26, 0.72);
        --bg-elevated: rgba(255, 255, 255, 0.035);
        --bg-hover: rgba(255, 255, 255, 0.06);
        --border-hairline: rgba(255, 255, 255, 0.085);
        --border-strong: rgba(255, 255, 255, 0.16);
        --text-primary: #f5f5f7;
        --text-secondary: rgba(245, 245, 247, 0.68);
        --text-tertiary: rgba(245, 245, 247, 0.44);
        --accent-indigo: #6e6cff;
        --accent-green: #30d158;
        direction: rtl;
        text-align: right;
        max-width: 1360px;
        margin: 0 auto;
        padding: 8px 0 64px;
        color: var(--text-primary);
        font-variant-numeric: tabular-nums;
      }
      .ap26-hero {
        position: relative;
        overflow: hidden;
        background:
          radial-gradient(620px circle at 92% 12%, rgba(110, 108, 255, 0.14), transparent 55%),
          radial-gradient(540px circle at 8% 90%, rgba(48, 209, 88, 0.09), transparent 55%),
          var(--bg-surface);
        border: 1px solid var(--border-hairline);
        border-radius: 30px;
        padding: 32px 34px;
        backdrop-filter: blur(36px) saturate(180%);
        -webkit-backdrop-filter: blur(36px) saturate(180%);
        box-shadow: 0 28px 64px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        margin-bottom: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 20px;
      }
      .ap26-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.78rem;
        font-weight: 600;
        color: rgba(245, 245, 247, 0.72);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border-hairline);
        padding: 5px 12px;
        border-radius: 999px;
        margin-bottom: 12px;
      }
      .ap26-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--accent-green);
        box-shadow: 0 0 10px var(--accent-green);
      }
      .ap26-title {
        font-size: clamp(1.65rem, 2.8vw, 2.3rem);
        font-weight: 700;
        letter-spacing: -0.025em;
        line-height: 1.2;
        margin: 0 0 8px 0;
        color: var(--text-primary);
      }
      .ap26-subtitle {
        font-size: 0.98rem;
        line-height: 1.65;
        color: var(--text-secondary);
        margin: 0;
        max-width: 760px;
      }
      .ap26-controls {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      .ap26-select {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid var(--border-hairline);
        border-radius: 14px;
        color: var(--text-primary);
        padding: 11px 16px;
        font-size: 0.92rem;
        font-weight: 500;
        min-width: 190px;
        outline: none;
        cursor: pointer;
        transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
      }
      .ap26-select:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
      }
      .ap26-select:focus-visible {
        border-color: var(--accent-indigo);
        box-shadow: 0 0 0 3px rgba(110, 108, 255, 0.28);
      }
      .ap26-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--border-hairline);
        border-radius: 14px;
        color: var(--text-primary);
        padding: 11px 18px;
        font-size: 0.9rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: transform 0.16s ease, background 0.2s ease, border-color 0.2s ease;
      }
      .ap26-btn:hover {
        background: rgba(255, 255, 255, 0.13);
        border-color: var(--border-strong);
      }
      .ap26-btn:active {
        transform: scale(0.98);
      }
      .ap26-kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 20px;
      }
      @media (max-width: 960px) {
        .ap26-kpis { grid-template-columns: 1fr; }
        .ap26-hero { padding: 24px 20px; border-radius: 24px; }
      }
      .ap26-kpi {
        background: var(--bg-elevated);
        border: 1px solid var(--border-hairline);
        border-radius: 22px;
        padding: 20px 22px;
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        transition: transform 0.22s ease, border-color 0.22s ease;
      }
      .ap26-kpi:hover {
        transform: translateY(-2px);
        border-color: var(--border-strong);
      }
      .ap26-kpi-label {
        font-size: 0.82rem;
        color: var(--text-tertiary);
        display: block;
      }
      .ap26-kpi-val {
        font-size: 1.42rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--text-primary);
        display: block;
        margin-top: 8px;
      }
      .ap26-kpi-sub {
        font-size: 0.78rem;
        color: var(--text-secondary);
        display: block;
        margin-top: 6px;
        line-height: 1.5;
      }
      .ap26-panel {
        background: var(--bg-elevated);
        border: 1px solid var(--border-hairline);
        border-radius: 26px;
        padding: 22px 24px;
        backdrop-filter: blur(26px);
        -webkit-backdrop-filter: blur(26px);
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.26);
      }
      .ap26-tbl-wrap {
        overflow-x: auto;
        border-radius: 16px;
      }
      .ap26-tbl {
        width: 100%;
        border-collapse: collapse;
      }
      .ap26-tbl th {
        padding: 12px 14px;
        text-align: right;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--text-tertiary);
        border-bottom: 1px solid var(--border-hairline);
        white-space: nowrap;
      }
      .ap26-tbl td {
        padding: 14px 14px;
        text-align: right;
        font-size: 0.9rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        vertical-align: middle;
        white-space: nowrap;
      }
      .ap26-tbl tbody tr {
        transition: background 0.18s ease;
      }
      .ap26-tbl tbody tr:hover {
        background: var(--bg-hover);
      }
      .ap26-badge-best {
        display: inline-block;
        margin-right: 8px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 600;
        background: rgba(48, 209, 88, 0.14);
        color: var(--accent-green);
        border: 1px solid rgba(48, 209, 88, 0.28);
      }
      .ap26-meter {
        width: 84px;
        height: 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }
      .ap26-meter > i {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--accent-indigo), #8e8dff);
      }
      .ap26-foot {
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 0.8rem;
        line-height: 1.65;
        color: var(--text-tertiary);
      }
      .ltr-num {
        direction: ltr;
        unicode-bidi: isolate;
        display: inline-block;
      }
    </style>

    <section class="ap26-shell" aria-labelledby="exchanges-h1">
      <header class="ap26-hero">
        <div>
          <span class="ap26-eyebrow"><i class="ap26-dot" aria-hidden="true"></i>پایش زنده بازار · به‌روزرسانی ۱۰ ثانیه‌ای</span>
          <h1 class="ap26-title" id="exchanges-h1">مقایسه صرافی‌ها</h1>
          <p class="ap26-subtitle">مقایسه لحظه‌ای قیمت، اسپرد، اختلاف قیمت نسبت به میانه و حجم معاملات در بین <span class="ltr-num">${EXCHANGE_NAMES.length}</span> صرافی معتبر برای تصمیم‌گیری دقیق‌تر در خرید و فروش.</p>
        </div>
        <div class="ap26-controls">
          <select class="ap26-select" id="base" aria-label="انتخاب رمزارز برای مقایسه">${options.map((c) => `<option value="${esc(c.symbol)}" ${c.symbol === st.base ? 'selected' : ''}>${esc(c.symbol)} · ${esc(c.name)}</option>`).join('')}</select>
          <button type="button" class="ap26-btn" id="refresh" aria-label="به‌روزرسانی فوری داده‌ها">${icon('refresh', 16)} به‌روزرسانی</button>
        </div>
      </header>

      <div class="ap26-kpis" id="summary" aria-live="polite"></div>

      <article class="ap26-panel" aria-label="جدول مقایسه صرافی‌ها">
        <div id="table">${skeleton(10, 26)}</div>
        <p class="ap26-foot" id="foot" aria-live="polite"></p>
      </article>
    </section>`;

  const load = async () => {
    const base = st.base;
    syncSeo(base, null);
    let r;
    try {
      r = await compareExchanges(base);
    } catch {
      if (!st.disposed && base === st.base) {
        $('#table', el).innerHTML = errorBox('خطا در ارتباط با صرافی‌ها. تلاش مجدد خودکار هر ۱۰ ثانیه انجام می‌شود.', load);
      }
      return;
    }
    if (st.disposed || base !== st.base || !r) return;

    syncSeo(base, r);

    const rows = r.rows.filter((x) => x.ok).sort((a, b) => (b.vol || 0) - (a.vol || 0));
    const maxVol = Math.max(...rows.map((x) => x.vol || 0), 1);

    $('#summary', el).innerHTML = rows.length ? `
      <div class="ap26-kpi">
        <span class="ap26-kpi-label">قیمت میانه بازار (${esc(base)})</span>
        <span class="ap26-kpi-val"><span class="ltr-num">${usd(r.median)}</span></span>
        <span class="ap26-kpi-sub">محاسبه‌شده از <span class="ltr-num">${r.okCount}</span> صرافی فعال</span>
      </div>
      <div class="ap26-kpi">
        <span class="ap26-kpi-label">به‌صرفه‌ترین برای خرید</span>
        <span class="ap26-kpi-val up">${esc(r.bestBuy?.exchange || '—')}</span>
        <span class="ap26-kpi-sub">بهترین قیمت فروشنده (Ask): <span class="ltr-num">${usd(r.bestBuy?.ask)}</span></span>
      </div>
      <div class="ap26-kpi">
        <span class="ap26-kpi-label">به‌صرفه‌ترین برای فروش</span>
        <span class="ap26-kpi-val">${esc(r.bestSell?.exchange || '—')}</span>
        <span class="ap26-kpi-sub">قیمت خریدار (Bid): <span class="ltr-num">${usd(r.bestSell?.bid)}</span> · اختلاف: <b class="${r.gapPct > 0 ? 'up' : 'flat'} ltr-num">${pct(r.gapPct, 3)}</b></span>
      </div>` : '';

    $('#table', el).innerHTML = rows.length ? `
      <div class="ap26-tbl-wrap">
        <table class="ap26-tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>صرافی</th>
              <th>جفت ارز</th>
              <th>قیمت</th>
              <th>نسبت به میانه</th>
              <th>خرید (Bid)</th>
              <th>فروش (Ask)</th>
              <th>اسپرد</th>
              <th>تغییر ۲۴س</th>
              <th>حجم ۲۴ ساعت</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((q, i) => `
              <tr>
                <td style="color:var(--text-tertiary)"><span class="ltr-num">${i + 1}</span></td>
                <td>
                  <b>${esc(q.exchange)}</b>
                  ${r.bestBuy?.exchange === q.exchange ? '<span class="ap26-badge-best">بهترین خرید</span>' : ''}
                </td>
                <td style="color:var(--text-secondary)"><span class="ltr-num">${esc(q.pair)}</span></td>
                <td><b><span class="ltr-num">${usd(q.price)}</span></b></td>
                <td class="${q.deviationPct >= 0 ? 'up' : 'down'}"><span class="ltr-num">${pct(q.deviationPct, 3)}</span></td>
                <td><span class="ltr-num">${usd(q.bid)}</span></td>
                <td><span class="ltr-num">${usd(q.ask)}</span></td>
                <td><span class="ltr-num">${pct(q.spreadPct, 3, false)}</span></td>
                <td><span class="ltr-num">${changeHtml(q.change24h)}</span></td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap">
                    <div class="ap26-meter"><i style="width:${((q.vol || 0) / maxVol) * 100}%"></i></div>
                    <span class="ltr-num" style="font-size:0.85rem">${compact(q.vol)}</span>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`
      : '<div style="text-align:center;padding:34px;color:var(--text-tertiary)">هیچ صرافی‌ای قیمتی برای این رمزارز ارائه نداد.</div>';

    const failed = r.rows.filter((x) => !x.ok).map((x) => x.exchange);
    $('#foot', el).textContent = `${r.demo ? 'داده‌های نمایشی. ' : ''}به‌روزرسانی خودکار هر ۱۰ ثانیه. ${failed.length ? `صرافی‌های ناموفق: ${failed.join('، ')}. ` : ''}اختلاف قیمت بین صرافی‌ها شامل کارمزد معاملات، واریز و برداشت نمی‌شود.`;
  };

  $('#base', el).addEventListener('change', (e) => {
    st.base = String(e.target.value || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTC';
    $('#table', el).innerHTML = skeleton(10, 26);
    load();
  });
  $('#refresh', el).addEventListener('click', load);
  load();
  st.timer = setInterval(load, 10000);
  return () => {
    st.disposed = true;
    clearInterval(st.timer);
  };
}