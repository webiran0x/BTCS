import { markets, getCandles, isStable, isTestedSource, INTERVAL_MS } from '../api/market.js';
import { TESTED_ACCURACY, shownProbUp, directionReliable } from '../lib/predict.js';
import { directionTrustFor } from '../lib/selfimprove.js';
import { generateSignal, THRESHOLDS, SCORE_BUCKETS_TESTED } from '../lib/signals.js';
import { runForecast } from '../lib/compute.js';
import { timingOutlook } from '../lib/timing.js';
import { forecastForDisplay } from '../lib/forecastview.js';
import { aiSignal } from '../lib/autotrader.js';
import { DEFAULT_HORIZON } from '../ai/context.js';
import { $, $$, coinLogo, skeleton, bindSeg, icon, wireSortHeaders } from '../ui.js';
import { esc, price, changeHtml, horizonText, money } from '../format.js';

export const title = 'اسکنر';

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

function syncSeo(interval, count, scannedTotal = 0) {
  const pageTitle = `اسکنر تکنیکال و هوش مصنوعی رمزارز (${interval}) | BTCS`;
  const desc = scannedTotal > 0
    ? `اسکن لحظه‌ای ${scannedTotal} رمزارز در تایم‌فریم ${interval}: رتبه‌بندی بر اساس امتیاز اندیکاتورها، سیگنال هوش مصنوعی، بازه نوسان ۸۰٪ و RSI.`
    : `اسکن لحظه‌ای ${count} رمزارز برتر در تایم‌فریم ${interval} بر اساس میزان هم‌سویی اندیکاتورها، سیگنال هوش مصنوعی و پیش‌بینی آماری.`;

  document.title = pageTitle;
  setMeta('description', desc);
  setMeta('og:title', pageTitle, true);
  setMeta('og:description', desc, true);
  setMeta('og:type', 'website', true);
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', pageTitle);
  setMeta('twitter:description', desc);

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const canonicalUrl = `${baseUrl}#/scanner`;
  setCanonical(canonicalUrl);

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'بازارها', item: `${baseUrl}#/` },
          { '@type': 'ListItem', position: 2, name: 'اسکنر', item: canonicalUrl },
        ],
      },
      {
        '@type': 'Dataset',
        name: `اسکنر تکنیکال و هوش مصنوعی رمزارز (${interval})`,
        description: desc,
        url: canonicalUrl,
      },
    ],
  };

  let ld = document.getElementById('ld-scanner-2026');
  if (!ld) {
    ld = document.createElement('script');
    ld.id = 'ld-scanner-2026';
    ld.type = 'application/ld+json';
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify(schema);
}

export async function render(el) {
  const st = { interval: '4h', filter: 'all', sort: 'score', rows: [], run: 0, disposed: false, count: 30, skipped: 0 };

  syncSeo(st.interval, st.count, 0);

  el.innerHTML = `
    <style>
      .ap26-scn-wrap {
        --scn-surface: rgba(22, 22, 26, 0.74);
        --scn-card: rgba(255, 255, 255, 0.035);
        --scn-card-hover: rgba(255, 255, 255, 0.055);
        --scn-line: rgba(255, 255, 255, 0.09);
        --scn-line-strong: rgba(255, 255, 255, 0.18);
        --scn-ink: #f5f5f7;
        --scn-sub: rgba(245, 245, 247, 0.68);
        --scn-muted: rgba(245, 245, 247, 0.44);
        --scn-indigo: #6e6cff;
        --scn-green: #30d158;
        direction: rtl;
        text-align: right;
        max-width: 1360px;
        margin: 0 auto;
        padding: 8px 0 64px;
        color: var(--scn-ink);
        font-variant-numeric: tabular-nums;
      }
      .ap26-scn-hero {
        position: relative;
        overflow: hidden;
        background:
          radial-gradient(620px circle at 92% 12%, rgba(110, 108, 255, 0.14), transparent 55%),
          radial-gradient(560px circle at 8% 90%, rgba(48, 209, 88, 0.09), transparent 55%),
          var(--scn-surface);
        border: 1px solid var(--scn-line);
        border-radius: 30px;
        padding: 30px 34px;
        backdrop-filter: blur(36px) saturate(180%);
        -webkit-backdrop-filter: blur(36px) saturate(180%);
        box-shadow: 0 28px 64px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        margin-bottom: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 20px;
      }
      .ap26-scn-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 0.76rem;
        font-weight: 600;
        color: rgba(245, 245, 247, 0.76);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--scn-line);
        padding: 5px 12px;
        border-radius: 999px;
        margin-bottom: 10px;
      }
      .ap26-scn-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--scn-green);
        box-shadow: 0 0 10px var(--scn-green);
      }
      .ap26-scn-h1 {
        font-size: clamp(1.65rem, 2.8vw, 2.25rem);
        font-weight: 700;
        letter-spacing: -0.025em;
        line-height: 1.22;
        margin: 0 0 8px 0;
      }
      .ap26-scn-sub {
        font-size: 0.96rem;
        line-height: 1.65;
        color: var(--scn-sub);
        margin: 0;
        max-width: 820px;
      }
      .ap26-scn-controls {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      .ap26-scn-wrap .seg {
        background: rgba(255, 255, 255, 0.05);
        padding: 4px;
        border-radius: 13px;
        display: inline-flex;
        flex-wrap: wrap;
        gap: 3px;
        border: 1px solid var(--scn-line);
      }
      .ap26-scn-wrap .seg button {
        background: transparent;
        border: 0;
        color: var(--scn-muted);
        padding: 6px 12px;
        border-radius: 9px;
        cursor: pointer;
        font-size: 0.82rem;
        font-weight: 600;
        transition: background 0.18s ease, color 0.18s ease;
      }
      .ap26-scn-wrap .seg button.on {
        background: rgba(255, 255, 255, 0.14);
        color: var(--scn-ink);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
      }
      .ap26-scn-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--scn-line);
        border-radius: 13px;
        color: var(--scn-ink);
        padding: 8px 15px;
        font-size: 0.86rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        cursor: pointer;
        transition: transform 0.15s ease, background 0.18s ease, border-color 0.18s ease;
      }
      .ap26-scn-btn:hover {
        background: rgba(255, 255, 255, 0.13);
        border-color: var(--scn-line-strong);
      }
      .ap26-scn-btn:active {
        transform: scale(0.985);
      }
      .ap26-scn-panel {
        background: var(--scn-card);
        border: 1px solid var(--scn-line);
        border-radius: 26px;
        padding: 22px 24px;
        backdrop-filter: blur(26px) saturate(170%);
        -webkit-backdrop-filter: blur(26px) saturate(170%);
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.28);
      }
      .ap26-scn-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
      }
      .ap26-scn-meter {
        height: 5px;
        background: rgba(255, 255, 255, 0.07);
        border-radius: 999px;
        overflow: hidden;
        margin: 16px 0;
      }
      .ap26-scn-meter > i {
        display: block;
        height: 100%;
        width: 0%;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--scn-indigo), var(--scn-green));
        transition: width 0.25s ease;
      }
      .ap26-scn-tbl-wrap {
        overflow-x: auto;
        border-radius: 14px;
      }
      .ap26-scn-tbl {
        width: 100%;
        border-collapse: collapse;
      }
      .ap26-scn-tbl th {
        padding: 11px 14px;
        text-align: right;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--scn-muted);
        border-bottom: 1px solid var(--scn-line);
        cursor: pointer;
        white-space: nowrap;
        transition: color 0.16s ease;
      }
      .ap26-scn-tbl th:hover {
        color: var(--scn-ink);
      }
      .ap26-scn-tbl td {
        padding: 12px 14px;
        text-align: right;
        font-size: 0.88rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        white-space: nowrap;
      }
      .ap26-scn-tbl tbody tr {
        transition: background 0.16s ease;
        cursor: pointer;
      }
      .ap26-scn-tbl tbody tr:hover {
        background: var(--scn-card-hover);
      }
      .ap26-scn-foot {
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        color: var(--scn-muted);
        font-size: 0.82rem;
        line-height: 1.65;
      }
      .ltr-num {
        direction: ltr;
        unicode-bidi: isolate;
        display: inline-block;
      }
    </style>

    <section class="ap26-scn-wrap" aria-labelledby="scanner-h1">
      <header class="ap26-scn-hero">
        <div>
          <span class="ap26-scn-eyebrow"><i class="ap26-scn-dot" aria-hidden="true"></i>تحلیل چندارزی · اندیکاتور و هوش مصنوعی</span>
          <h1 class="ap26-scn-h1" id="scanner-h1">اسکنر بازار</h1>
          <p class="ap26-scn-sub">رمزارزهای برتر را اسکن کرده و بر اساس میزان هم‌سویی اندیکاتورها، سیگنال هوش مصنوعی و خروجی مدل‌های پیش‌بینی رتبه‌بندی می‌کند.</p>
        </div>
        <div class="ap26-scn-controls">
          <div class="seg" id="iv" dir="ltr" role="group" aria-label="تایم‌فریم اسکن">${['1m', '5m', '15m', '1h', '4h', '1d'].map((i) => `<button type="button" data-v="${i}" class="${i === st.interval ? 'on' : ''}">${i}</button>`).join('')}</div>
          <div class="seg" id="cnt" role="group" aria-label="تعداد رمزارز">
            <button type="button" data-v="20">۲۰</button>
            <button type="button" data-v="30" class="on">۳۰</button>
            <button type="button" data-v="50">۵۰</button>
          </div>
          <button type="button" class="ap26-scn-btn" id="rescan">${icon('refresh', 16)} اسکن مجدد</button>
        </div>
      </header>

      <article class="ap26-scn-panel" aria-label="نتایج اسکن بازار">
        <div class="ap26-scn-toolbar">
          <div class="seg" id="flt" role="group" aria-label="فیلتر سیگنال‌ها">
            <button type="button" data-v="all" class="on">همه</button>
            <button type="button" data-v="buy">صعودی</button>
            <button type="button" data-v="sell">نزولی</button>
            <button type="button" data-v="aibuy">سیگنال هوش مصنوعی: خرید/نگهداری</button>
            <button type="button" data-v="aiup">صعود هوش مصنوعی</button>
            <button type="button" data-v="aidown">نزول هوش مصنوعی</button>
            <button type="button" data-v="oversold">اشباع فروش</button>
            <button type="button" data-v="overbought">اشباع خرید</button>
          </div>
          <span id="prog" aria-live="polite" style="color:var(--scn-muted);font-size:0.84rem"></span>
        </div>

        <div class="ap26-scn-meter" id="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i style="width:0%"></i></div>
        <div id="tbl" aria-live="polite">${skeleton(10, 26)}</div>

        <p class="ap26-scn-foot">امتیاز از <span class="ltr-num">-100</span> تا <span class="ltr-num">+100</span>، میزان توافق روند، مومنتوم و اندیکاتورها را می‌سنجد. پیش‌بینی هوش مصنوعی و بازه <span class="ltr-num">80%</span> نوسانات بر اساس آزمون‌های تاریخی ارائه شده‌اند.</p>
      </article>
    </section>`;

  const rangeOf = (r) => {
    const f = r.fc;
    if (!f?.ok || !f.range || !(f.lastPrice > 0)) return null;
    return { lo: (f.range.p10 / f.lastPrice - 1) * 100, hi: (f.range.p90 / f.lastPrice - 1) * 100 };
  };
  const moveOf = (r) => {
    const g = rangeOf(r);
    return g ? g.hi - g.lo : null;
  };
  const rangeCell = (r) => {
    if (r.fc === undefined) return '<span class="spinner" style="width:12px;height:12px"></span>';
    const g = rangeOf(r);
    if (!g) return '<span style="color:var(--scn-muted)">—</span>';
    const f = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}%`;
    return `<span class="ltr-num" title="بازه پیش‌بینی ۸۰٪">${f(g.lo)} تا ${f(g.hi)}</span>`;
  };

  const aiCell = (r) => {
    const a = r.ai;
    if (!a) return '<span style="color:var(--scn-muted)">—</span>';
    const label = { buy: 'خرید', hold: 'نگهداری', sell: 'فروش', wait: 'انتظار' }[a.action];
    const tone = { buy: 'up', hold: 'up', sell: 'down', wait: '' }[a.action];
    return `<span class="chip ${tone}">${label}</span>`;
  };

  const timingCell = (r) => {
    const t = r.tm;
    if (r.fc === undefined) return '';
    if (!t?.ok || !t.shaped) return '<span style="color:var(--scn-muted)">—</span>';
    const m = t.rising ? t.peak : t.trough;
    if (t.priceless) return `<span>${t.rising ? 'اوج' : 'کف'} در <span class="ltr-num">${esc(horizonText(st.interval, m.bar))}</span></span>`;
    return `<span class="${t.rising ? 'up' : 'down'}">${t.rising ? '▲ اوج در' : '▼ کف در'} <span class="ltr-num">${esc(horizonText(st.interval, m.bar))}</span></span>`;
  };

  const draw = () => {
    let rows = st.rows.filter((r) => r.signal?.ok);
    const f = st.filter;
    const trust = directionTrustFor(st.interval).trust;
    const reliable = directionReliable(st.interval, trust);
    const shown = (r) => (r.fc?.ok ? shownProbUp(r.fc.probUp, st.interval, trust) : null);

    if (f === 'buy') rows = rows.filter((r) => r.signal.score >= THRESHOLDS.normal);
    if (f === 'sell') rows = rows.filter((r) => r.signal.score <= -THRESHOLDS.normal);
    if (f === 'aibuy') rows = rows.filter((r) => r.ai?.action === 'buy' || r.ai?.action === 'hold');
    if (f === 'aiup') rows = rows.filter((r) => reliable && shown(r) !== null && shown(r) >= 0.54);
    if (f === 'aidown') rows = rows.filter((r) => reliable && shown(r) !== null && shown(r) <= 0.46);

    const rsiOf = (r) => (Number.isFinite(r.signal.indicators.rsi) ? r.signal.indicators.rsi : null);
    if (f === 'oversold') rows = rows.filter((r) => rsiOf(r) !== null && rsiOf(r) < 30);
    if (f === 'overbought') rows = rows.filter((r) => rsiOf(r) !== null && rsiOf(r) > 70);

    const AI_RANK = { buy: 3, hold: 2, sell: 1, wait: 0 };
    const key = {
      aisig: (r) => AI_RANK[r.ai?.action] ?? -1,
      score: (r) => r.signal.score,
      ai: (r) => shown(r) ?? 0.5,
      rsi: (r) => r.signal.indicators.rsi ?? 50,
      chg: (r) => r.coin.change24h ?? 0,
      move: (r) => moveOf(r) ?? -1,
    }[st.sort];
    rows.sort((a, b) => key(b) - key(a));

    if (!rows.length) {
      $('#tbl', el).innerHTML = st.rows.length
        ? '<div style="text-align:center;padding:32px;color:var(--scn-muted)">هیچ رمزارزی با این فیلتر مطابقت ندارد.</div>'
        : skeleton(10, 26);
      return;
    }

    const th = (k, label, cls = '') => `<th${cls ? ` class="${cls}"` : ''} data-sort="${k}" aria-sort="${st.sort === k ? 'descending' : 'none'}">${label}${st.sort === k ? '\u00a0↓' : ''}</th>`;

    $('#tbl', el).innerHTML = `
      <div class="ap26-scn-tbl-wrap">
        <table class="ap26-scn-tbl">
          <thead>
            <tr>
              <th>ارز</th>
              <th class="hide-p">قیمت</th>
              ${th('chg', '۲۴ ساعته', 'hide-p')}
              <th>سیگنال</th>
              ${th('aisig', 'سیگنال هوش مصنوعی')}
              ${th('score', 'امتیاز')}
              ${th('ai', 'صعود هوش مصنوعی', 'hide-p')}
              ${th('move', 'بازه ۸۰٪', 'hide-p')}
              <th class="hide-t">زمان‌بندی</th>
              ${th('rsi', 'RSI', 'hide-t')}
              <th class="hide-l">روند</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const s = r.signal;
              const trend = s.indicators.ema200
                ? (s.price > s.indicators.ema200 ? '<span class="up">بالای میانگین ۲۰۰</span>' : '<span class="down">پایین میانگین ۲۰۰</span>')
                : '—';
              const reason = (s.score >= 0 ? s.reasons.bullish[0] : s.reasons.bearish[0]) || '';
              const p = shown(r);
              const ai = !r.fc?.ok
                ? (r.fc === undefined ? '<span class="spinner" style="width:12px;height:12px"></span>' : '—')
                : reliable
                  ? `<b class="ltr-num ${p >= 0.54 ? 'up' : p <= 0.46 ? 'down' : 'flat'}">${Math.round(p * 100)}%</b>`
                  : '<span style="color:var(--scn-muted)">—</span>';

              return `
                <tr data-sym="${esc(r.coin.symbol)}">
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      ${coinLogo(r.coin, 24)}
                      <b class="ltr-num">${esc(r.coin.symbol)}</b>
                      <small class="hide-l" style="color:var(--scn-muted)">${esc(r.coin.name)}</small>
                    </div>
                    <small class="show-p-block ltr-num">${money(s.price)}</small>
                    <small class="show-p-block ltr-num">${changeHtml(r.coin.change24h)}</small>
                  </td>
                  <td class="hide-p"><span class="ltr-num">${money(s.price)}</span></td>
                  <td class="hide-p"><span class="ltr-num">${changeHtml(r.coin.change24h)}</span></td>
                  <td><span class="chip ${s.tone === 'flat' ? '' : s.tone}"${reason ? ` title="${esc(reason)}"` : ''}>${s.text}</span></td>
                  <td>${aiCell(r)}</td>
                  <td class="${s.tone}"><b class="ltr-num">${s.score > 0 ? '+' : ''}${s.score}</b></td>
                  <td class="hide-p">${ai}</td>
                  <td class="hide-p" style="min-width:84px">${rangeCell(r)}</td>
                  <td class="hide-t" style="min-width:96px">${timingCell(r)}</td>
                  <td class="hide-t ${s.indicators.rsi < 30 ? 'up' : s.indicators.rsi > 70 ? 'down' : ''}"><span class="ltr-num">${s.indicators.rsi?.toFixed(0) ?? '—'}</span></td>
                  <td class="hide-l">${trend}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    wireSortHeaders($('#tbl', el), (k) => {
      st.sort = k;
      draw();
    });
    $$('tr[data-sym]', el).forEach((tr) => {
      tr.addEventListener('click', () => {
        location.hash = `#/coin/${tr.dataset.sym}`;
      });
    });
  };

  const scan = async () => {
    const run = ++st.run;
    st.rows = [];
    st.skipped = 0;
    syncSeo(st.interval, st.count, 0);
    draw();

    let list;
    try {
      list = (await markets()).filter((c) => !isStable(c.symbol)).slice(0, st.count);
    } catch (err) {
      if (run !== st.run || st.disposed) return;
      $('#prog', el).textContent = 'اطلاعات در دسترس نیست';
      $('#meter i', el).style.width = '0%';
      $('#meter', el)?.setAttribute('aria-valuenow', '0');
      $('#tbl', el).innerHTML = `<div style="text-align:center;padding:32px"><h3>داده‌ها در دسترس نیستند</h3><p style="color:var(--scn-muted)">${esc(err?.message || 'لیست بازار بارگذاری نشد.')}</p></div>`;
      return;
    }

    if (!list.length) {
      $('#prog', el).textContent = 'ارزی یافت نشد';
      $('#meter i', el).style.width = '0%';
      $('#meter', el)?.setAttribute('aria-valuenow', '0');
      $('#tbl', el).innerHTML = '<div style="text-align:center;padding:32px;color:var(--scn-muted)">رمزارزی برای اسکن وجود ندارد.</div>';
      return;
    }

    const iv = st.interval;
    let done = 0;
    const setProg = () => {
      const pctDone = Math.round((done / list.length) * 100);
      $('#prog', el).textContent = done < list.length
        ? `در حال اسکن ${done} از ${list.length}…`
        : `${st.rows.length} ارز اسکن شد`;
      $('#meter i', el).style.width = `${pctDone}%`;
      $('#meter', el)?.setAttribute('aria-valuenow', String(pctDone));
    };
    setProg();

    const queue = [...list];
    const worker = async () => {
      while (queue.length) {
        if (run !== st.run || st.disposed) return;
        const coin = queue.shift();
        try {
          const res = await getCandles(coin, iv, 1500);
          if (run !== st.run || st.disposed) return;
          if (isTestedSource(res)) {
            st.rows.push({
              coin,
              signal: generateSignal(res.candles, { interval: iv }),
              ai: aiSignal(res.candles.slice(0, -1), iv, coin.symbol),
              fc: undefined,
              candles: res.candles,
            });
          } else {
            st.skipped++;
          }
        } catch {
          st.skipped++;
        }
        done++;
        setProg();
        draw();
      }
    };

    await Promise.all([worker(), worker(), worker(), worker()]);
    if (run !== st.run || st.disposed) return;
    syncSeo(iv, st.count, st.rows.length);

    for (const row of [...st.rows].sort((a, b) => Math.abs(b.signal.score) - Math.abs(a.signal.score))) {
      if (run !== st.run || st.disposed) return;
      try {
        const fc = await runForecast(row.candles, { horizon: DEFAULT_HORIZON[iv], intervalMs: INTERVAL_MS[iv] });
        row.tm = fc?.ok ? timingOutlook(fc, { intervalMs: INTERVAL_MS[iv], interval: iv }) : null;
        row.fc = fc?.ok ? forecastForDisplay(fc, iv, directionTrustFor(iv).trust) : fc;
      } catch {
        row.fc = null;
        row.tm = null;
      }
      row.candles = null;
      draw();
    }
  };

  bindSeg($('#iv', el), (v) => {
    st.interval = v;
    scan();
  });
  bindSeg($('#cnt', el), (v) => {
    st.count = +v;
    scan();
  });
  bindSeg($('#flt', el), (v) => {
    st.filter = v;
    draw();
  });
  $('#rescan', el)?.addEventListener('click', scan);
  scan();

  return () => {
    st.disposed = true;
    st.run++;
  };
}