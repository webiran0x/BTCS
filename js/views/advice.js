// اسکن بازار: خوانش مبتنی بر شواهد برای هر ارز، با سئو ۲۰۲۶ و طراحی شیشه‌ای مینیمال اپل.
import { markets, getCandles, isStable, isTestedSource, INTERVAL_MS } from '../api/market.js';
import { generateSignal, SCORE_BUCKETS_TESTED } from '../lib/signals.js';
import { runForecast } from '../lib/compute.js';
import { timingOutlook } from '../lib/timing.js';
import { adviseCoin, rankAdvice, ADVICE_DISCLAIMER } from '../lib/advice.js';
import { TESTED_ACCURACY } from '../lib/predict.js';
import { directionTrustFor } from '../lib/selfimprove.js';
import { DEFAULT_HORIZON } from '../ai/context.js';
import { venuesFor, tradable, TRADE_DISCLAIMER } from '../lib/trade.js';
import { $, $$, icon, coinLogo, skeleton, bindSeg, modal } from '../ui.js';
import { esc, safeUrl, pct, money, horizonText, changeHtml } from '../format.js';
import { load } from '../store.js';

export const title = 'اسکن بازار';

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

function syncSeo(interval, topBuys = []) {
  const pageTitle = `اسکن بازار رمزارز (${interval}) و سیگنال‌های مبتنی بر شواهد | BTCS`;
  const desc = `اسکن هوشمند بازار رمزارز در تایم‌فریم ${interval}: بررسی وضعیت نمودار، سطوح ورود و حد ضرر، چشم‌انداز زمانی و رتبه‌بندی بر اساس شواهد مستند.`;

  document.title = pageTitle;
  setMeta('description', desc);
  setMeta('og:title', pageTitle, true);
  setMeta('og:description', desc, true);
  setMeta('og:type', 'website', true);
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', pageTitle);
  setMeta('twitter:description', desc);

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const canonicalUrl = `${baseUrl}#/advice`;
  setCanonical(canonicalUrl);

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'بازارها', item: `${baseUrl}#/` },
          { '@type': 'ListItem', position: 2, name: 'اسکن بازار', item: canonicalUrl },
        ],
      },
      {
        '@type': 'ItemList',
        name: `برترین خوانش‌های اسکن بازار (${interval})`,
        numberOfItems: Math.min(topBuys.length, 9),
        itemListElement: topBuys.slice(0, 9).map((row, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: `${row.coin.symbol} (${row.coin.name})`,
          description: `${row.advice?.verdict || ''} — اعتماد ${row.advice?.conviction ?? 0}/100`,
        })),
      },
    ],
  };

  let ld = document.getElementById('ld-advice-2026');
  if (!ld) {
    ld = document.createElement('script');
    ld.id = 'ld-advice-2026';
    ld.type = 'application/ld+json';
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify(schema);
}

export async function render(el) {
  const st = { interval: '4h', rows: [], run: 0, disposed: false, count: 60, skipped: 0 };

  el.innerHTML = `
    <style>
      .ap26-adv-wrap {
        --adv-surface: rgba(22, 22, 26, 0.74);
        --adv-card: rgba(255, 255, 255, 0.035);
        --adv-card-hover: rgba(255, 255, 255, 0.06);
        --adv-line: rgba(255, 255, 255, 0.09);
        --adv-line-strong: rgba(255, 255, 255, 0.18);
        --adv-ink: #f5f5f7;
        --adv-sub: rgba(245, 245, 247, 0.68);
        --adv-muted: rgba(245, 245, 247, 0.44);
        --adv-indigo: #6e6cff;
        --adv-green: #30d158;
        direction: rtl;
        text-align: right;
        max-width: 1360px;
        margin: 0 auto;
        padding: 8px 0 64px;
        color: var(--adv-ink);
        font-variant-numeric: tabular-nums;
      }
      .ap26-adv-hero {
        position: relative;
        overflow: hidden;
        background:
          radial-gradient(620px circle at 92% 12%, rgba(110, 108, 255, 0.14), transparent 55%),
          radial-gradient(540px circle at 8% 90%, rgba(48, 209, 88, 0.09), transparent 55%),
          var(--adv-surface);
        border: 1px solid var(--adv-line);
        border-radius: 30px;
        padding: 30px 34px;
        backdrop-filter: blur(36px) saturate(180%);
        -webkit-backdrop-filter: blur(36px) saturate(180%);
        box-shadow: 0 28px 64px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        margin-bottom: 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 20px;
      }
      .ap26-adv-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 0.76rem;
        font-weight: 600;
        color: rgba(245, 245, 247, 0.76);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--adv-line);
        padding: 5px 12px;
        border-radius: 999px;
        margin-bottom: 10px;
      }
      .ap26-adv-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--adv-green);
        box-shadow: 0 0 10px var(--adv-green);
      }
      .ap26-adv-h1 {
        font-size: clamp(1.65rem, 2.8vw, 2.25rem);
        font-weight: 700;
        letter-spacing: -0.025em;
        line-height: 1.22;
        margin: 0 0 8px 0;
      }
      .ap26-adv-sub {
        font-size: 0.96rem;
        line-height: 1.65;
        color: var(--adv-sub);
        margin: 0;
        max-width: 780px;
      }
      .ap26-adv-controls {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      .ap26-adv-wrap .seg {
        background: rgba(255, 255, 255, 0.05);
        padding: 4px;
        border-radius: 13px;
        display: inline-flex;
        gap: 3px;
        border: 1px solid var(--adv-line);
      }
      .ap26-adv-wrap .seg button {
        background: transparent;
        border: 0;
        color: var(--adv-muted);
        padding: 6px 13px;
        border-radius: 9px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.18s ease, color 0.18s ease;
      }
      .ap26-adv-wrap .seg button.on {
        background: rgba(255, 255, 255, 0.14);
        color: var(--adv-ink);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
      }
      .ap26-adv-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--adv-line);
        border-radius: 13px;
        color: var(--adv-ink);
        padding: 9px 16px;
        font-size: 0.88rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        cursor: pointer;
        transition: transform 0.15s ease, background 0.18s ease, border-color 0.18s ease;
      }
      .ap26-adv-btn:hover {
        background: rgba(255, 255, 255, 0.13);
        border-color: var(--adv-line-strong);
      }
      .ap26-adv-btn:active {
        transform: scale(0.985);
      }
      .ap26-adv-meter {
        height: 5px;
        background: rgba(255, 255, 255, 0.07);
        border-radius: 999px;
        overflow: hidden;
        margin-bottom: 22px;
      }
      .ap26-adv-meter > i {
        display: block;
        height: 100%;
        width: 0%;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--adv-indigo), var(--adv-green));
        transition: width 0.28s ease;
      }
      .ap26-adv-sec-title {
        font-size: 1.18rem;
        font-weight: 700;
        letter-spacing: -0.015em;
        margin: 24px 0 12px;
        color: var(--adv-ink);
      }
      .ap26-adv-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
      }
      @media (max-width: 1100px) {
        .ap26-adv-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 720px) {
        .ap26-adv-grid { grid-template-columns: 1fr; }
        .ap26-adv-hero { padding: 24px 20px; border-radius: 24px; }
      }
      .ap26-adv-card {
        background: var(--adv-card);
        border: 1px solid var(--adv-line);
        border-radius: 22px;
        padding: 20px;
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: pointer;
        transition: transform 0.22s ease, border-color 0.22s ease, background 0.22s ease, box-shadow 0.22s ease;
      }
      .ap26-adv-card:hover {
        transform: translateY(-2px);
        border-color: var(--adv-line-strong);
        background: var(--adv-card-hover);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.3);
      }
      .ap26-adv-rank {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.11);
        color: var(--adv-ink);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.74rem;
        font-weight: 700;
        flex-shrink: 0;
      }
      .ap26-adv-plan {
        background: rgba(255, 255, 255, 0.025);
        padding: 11px 12px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin: 12px 0;
      }
      .ap26-adv-plan .k {
        font-size: 0.72rem;
        color: var(--adv-muted);
      }
      .ap26-adv-plan .v {
        font-size: 0.84rem;
        font-weight: 600;
        margin-top: 2px;
      }
      .ap26-adv-reasons {
        margin: 10px 0 14px;
        padding-right: 18px;
        color: rgba(245, 245, 247, 0.78);
        font-size: 0.84rem;
        line-height: 1.55;
      }
      .ap26-adv-reasons li {
        margin-bottom: 4px;
      }
      .ap26-adv-foot-row {
        display: flex;
        align-items: center;
        gap: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        padding-top: 12px;
        margin-top: auto;
      }
      .ap26-adv-link {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--adv-line);
        padding: 6px 12px;
        border-radius: 10px;
        color: var(--adv-ink);
        text-decoration: none;
        font-size: 0.8rem;
        font-weight: 500;
        transition: background 0.18s ease;
      }
      .ap26-adv-link:hover {
        background: rgba(255, 255, 255, 0.14);
      }
      .ap26-adv-trade {
        background: transparent;
        border: 1px solid var(--adv-line);
        color: var(--adv-ink);
        padding: 6px 12px;
        border-radius: 10px;
        font-size: 0.8rem;
        cursor: pointer;
        transition: background 0.18s ease;
      }
      .ap26-adv-trade:hover {
        background: rgba(255, 255, 255, 0.08);
      }
      .ap26-adv-panel {
        background: var(--adv-card);
        border: 1px solid var(--adv-line);
        border-radius: 24px;
        padding: 24px 26px;
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        margin-top: 28px;
      }
      .ltr-num {
        direction: ltr;
        unicode-bidi: isolate;
        display: inline-block;
      }
    </style>

    <section class="ap26-adv-wrap" aria-labelledby="advice-h1">
      <header class="ap26-adv-hero">
        <div>
          <span class="ap26-adv-eyebrow"><i class="ap26-adv-dot" aria-hidden="true"></i>تحلیل مبتنی بر شواهد و تست خارج از نمونه</span>
          <h1 class="ap26-adv-h1" id="advice-h1">اسکن بازار</h1>
          <p class="ap26-adv-sub">بررسی هر ارز در یک تایم‌فریم مشخص: وضعیت نمودار، سطوح کلیدی ورود و حد ضرر، چشم‌انداز زمانی و میزان شواهد مستند پشتیبان هر خوانش.</p>
        </div>
        <div class="ap26-adv-controls">
          <div class="seg" id="iv" dir="ltr" role="group" aria-label="انتخاب تایم‌فریم">${['1m', '5m', '15m', '1h', '4h', '1d'].map((i) => `<button type="button" data-v="${i}" class="${i === st.interval ? 'on' : ''}">${i}</button>`).join('')}</div>
          <button type="button" class="ap26-adv-btn" id="rescan">${icon('refresh', 16)} اسکن مجدد</button>
        </div>
      </header>

      <div class="ap26-adv-meter" id="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i style="width:0%"></i></div>
      <div id="body" aria-live="polite">${skeleton(8, 26)}</div>
    </section>`;

  const card = (r, rank) => {
    const a = r.advice;
    const t = a.timing;
    return `
      <article class="ap26-adv-card" data-sym="${esc(r.coin.symbol)}" aria-label="تحلیل ${esc(r.coin.symbol)}">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:10px;min-width:0">
              ${rank ? `<span class="ap26-adv-rank ltr-num">${rank}</span>` : ''}
              ${coinLogo(r.coin, 30)}
              <div style="min-width:0">
                <b>${esc(r.coin.symbol)}</b>
                <small style="color:var(--adv-muted);font-size:0.78rem;margin-right:4px">${esc(r.coin.name)}</small>
                <div style="color:var(--adv-sub);font-size:0.84rem;margin-top:2px">
                  <span class="ltr-num">${money(a.price)}</span>
                  <span class="ltr-num" style="margin-right:4px">${changeHtml(r.coin.change24h)}</span>
                </div>
              </div>
            </div>
            <div style="text-align:left;flex-shrink:0">
              <span class="chip ${a.tone === 'warn' ? 'warn' : a.tone}">${esc(a.verdict)}</span>
              <div style="margin-top:5px;color:var(--adv-muted);font-size:0.74rem">اعتماد <span class="ltr-num">${a.conviction}/100</span></div>
            </div>
          </div>

          ${a.plan ? `
            <div class="ap26-adv-plan">
              <div><div class="k">منطقه ورود</div><div class="v ltr-num">${money(a.plan.entryZone[0])} – ${money(a.plan.entryZone[1])}</div></div>
              <div><div class="k">حد ضرر</div><div class="v down ltr-num">${money(a.plan.stopLoss)} <span style="font-size:0.72rem;color:var(--adv-muted)">(${a.plan.riskPct}%)</span></div></div>
              <div><div class="k">هدف ۱</div><div class="v up ltr-num">${money(a.plan.takeProfits[0])}</div></div>
              <div><div class="k">هدف ۲</div><div class="v up ltr-num">${money(a.plan.takeProfits[1])}</div></div>
            </div>`
            : `<p style="color:var(--adv-muted);font-size:0.84rem;margin:10px 0 12px;line-height:1.55">هنوز نقطه ورود فعالی وجود ندارد. ${esc(a.waitFor?.[0] || 'در انتظار تریگر.')}</p>`}

          ${t ? `
            <p style="color:var(--adv-sub);font-size:0.83rem;line-height:1.55;margin:10px 0">${t.rising
              ? `الگوهای مشابه حدود <b class="ltr-num">${esc(horizonText(st.interval, t.bars))}</b> رشد کرده و در نزدیکی <b class="ltr-num">${money(t.targetPrice)}</b> به اوج رسیده‌اند.`
              : `الگوهای مشابه حدود <b class="ltr-num">${esc(horizonText(st.interval, t.bars))}</b> به ریزش ادامه داده‌اند.`}</p>` : ''}

          <ul class="ap26-adv-reasons">
            ${(a.reasons || []).map((x) => `<li>${esc(x.text)}</li>`).join('')}
          </ul>
        </div>

        <div class="ap26-adv-foot-row">
          <a class="ap26-adv-link" href="#/coin/${esc(r.coin.symbol)}">نمودار</a>
          ${tradable(r.coin.symbol) ? `<button type="button" class="ap26-adv-trade" data-trade="${esc(r.coin.symbol)}">معامله</button>` : ''}
          <span style="margin-right:auto;color:var(--adv-muted);font-size:0.75rem">شواهد: <span class="ltr-num">${esc(a.evidence)}</span></span>
        </div>
      </article>`;
  };

  const draw = () => {
    const done = st.rows.filter((r) => r.advice);
    if (!done.length) {
      $('#body', el).innerHTML = skeleton(8, 26);
      syncSeo(st.interval, []);
      return;
    }
    const { buys, avoid, wait } = rankAdvice(done);
    syncSeo(st.interval, buys);

    const holdings = load('holdings', []);
    const held = done.filter((r) => holdings.some((h) => h.symbol === r.coin.symbol));

    $('#body', el).innerHTML = `
      ${held.length ? `<h2 class="ap26-adv-sec-title">دارایی‌های شما</h2>
        <div class="ap26-adv-grid">${held.map((r) => card(r)).join('')}</div>` : ''}

      <h2 class="ap26-adv-sec-title">قوی‌ترین شواهد بازار</h2>
      ${buys.length
        ? `<div class="ap26-adv-grid">${buys.slice(0, 9).map((r, i) => card(r, i + 1)).join('')}</div>`
        : `<div class="ap26-adv-panel" style="text-align:center;padding:36px"><h3 style="margin:0 0 8px">هیچ ارزی از حد نصاب شواهد عبور نکرد</h3><p style="margin:0;color:var(--adv-sub)">این یک پاسخ شفاف و محافظه‌کارانه است؛ زمانی که بازار مزیت آماری قطعی نداشته باشد، برچسب ورود صادر نمی‌شود.</p></div>`}

      ${avoid.length ? `<h2 class="ap26-adv-sec-title">ضعیف‌ترین خوانش‌ها</h2>
        <div class="ap26-adv-grid">${avoid.slice(0, 6).map((r) => card(r)).join('')}</div>` : ''}

      <article class="ap26-adv-panel" aria-label="میزان اعتماد و حدود مسئولیت">
        <h3 style="margin:0 0 10px;font-size:1.12rem">میزان اعتماد به نتایج</h3>
        <p style="color:var(--adv-sub);font-size:0.88rem;line-height:1.7;margin:0 0 8px">هر نتیجه ترکیبی از تحلیل‌های آماری و آزمون‌های خارج از نمونه است. برچسب خرید یا پرهیز تنها زمانی نمایش داده می‌شود که شواهد با مزیت اندازه‌گیری‌شده همسو باشند.</p>
        <p style="color:var(--adv-muted);font-size:0.84rem;line-height:1.7;margin:0">${esc(ADVICE_DISCLAIMER)} <span class="ltr-num">${wait.length.toLocaleString('fa-IR')}</span> از <span class="ltr-num">${done.length.toLocaleString('fa-IR')}</span> ارز به عنوان «بدون لبه» برگشتند.</p>
      </article>`;

    $$('.ap26-adv-card', el).forEach((c) => {
      c.addEventListener('click', (e) => {
        if (e.target.closest('a,button')) return;
        location.hash = `#/coin/${c.dataset.sym}`;
      });
    });

    $$('[data-trade]', el).forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const sym = b.dataset.trade;
        modal(`<div dir="rtl">
          <h3 style="margin:0 0 12px">محل معامله <span class="ltr-num">${esc(sym)}</span></h3>
          <div class="sheet-grid mt" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
            ${venuesFor(sym).map((v) => `
              <a class="sheet-item" href="${esc(safeUrl(v.href, '#/exchanges'))}" target="_blank" rel="noopener noreferrer" style="background:rgba(255,255,255,0.04);padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,0.09);display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none">
                ${icon('exchanges', 18)}
                <span><b>${esc(v.name)}</b><br><small class="ltr-num" style="color:rgba(255,255,255,0.46);font-size:0.76rem">${esc(v.pair)}</small></span>
              </a>`).join('')}
          </div>
          <p style="color:rgba(255,255,255,0.46);font-size:0.8rem;line-height:1.6;margin-top:16px">${esc(TRADE_DISCLAIMER)}</p>
        </div>`);
      });
    });
  };

  const scan = async () => {
    const run = ++st.run;
    st.rows = [];
    st.skipped = 0;
    draw();

    let list;
    try {
      list = (await markets()).filter((c) => !isStable(c.symbol)).slice(0, st.count);
    } catch {
      if (run !== st.run || st.disposed) return;
      $('#body', el).innerHTML = '<div class="ap26-adv-panel" style="text-align:center;padding:36px"><h3 style="margin:0 0 8px">خطا در بارگیری بازار</h3><p style="margin:0;color:var(--adv-sub)">فید بازار پاسخ نداد.</p></div>';
      return;
    }

    const iv = st.interval;
    let done = 0;
    const meterEl = $('#meter', el);
    const barEl = $('#meter i', el);
    const setProg = () => {
      const p = list.length ? Math.round((done / list.length) * 100) : 100;
      if (barEl) barEl.style.width = `${p}%`;
      if (meterEl) meterEl.setAttribute('aria-valuenow', String(p));
    };

    const queue = [...list];
    const worker = async () => {
      while (queue.length) {
        if (run !== st.run || st.disposed) return;
        const coin = queue.shift();
        try {
          const res = await getCandles(coin, iv, 1500);
          if (run !== st.run || st.disposed) return;
          if (!isTestedSource(res)) {
            st.skipped++;
          } else {
            const signal = generateSignal(res.candles, { interval: iv });
            st.rows.push({
              coin,
              signal,
              candles: res.candles,
              advice: adviseCoin({ signal, forecast: null, timing: null, interval: iv }),
            });
            draw();
          }
        } catch {
          st.skipped++;
        }
        done++;
        setProg();
      }
    };

    await Promise.all([worker(), worker(), worker(), worker()]);
    if (run !== st.run || st.disposed) return;

    if (!st.rows.length) {
      $('#body', el).innerHTML = `<div class="ap26-adv-panel" style="text-align:center;padding:36px"><h3 style="margin:0 0 8px">داده‌ای یافت نشد</h3><p style="margin:0;color:var(--adv-sub)">هیچ کندل معتبر و تست‌شده‌ای برای این تایم‌فریم دریافت نشد.</p></div>`;
      if (barEl) barEl.style.width = '100%';
      if (meterEl) meterEl.setAttribute('aria-valuenow', '100');
      return;
    }

    for (const row of [...st.rows].sort((a, b) => Math.abs(b.signal.score) - Math.abs(a.signal.score))) {
      if (run !== st.run || st.disposed) return;
      let fc = null;
      let tm = null;
      try {
        fc = await runForecast(row.candles, { horizon: DEFAULT_HORIZON[iv], intervalMs: INTERVAL_MS[iv] });
        tm = fc?.ok ? timingOutlook(fc, { intervalMs: INTERVAL_MS[iv], interval: iv }) : null;
      } catch { /* بدون پیش‌بینی هم ادامه می‌دهد */ }
      row.advice = adviseCoin({
        signal: row.signal,
        forecast: fc,
        timing: tm,
        interval: iv,
        trust: directionTrustFor(iv).trust,
      });
      row.candles = null;
      draw();
    }

    if (barEl) barEl.style.width = '100%';
    if (meterEl) meterEl.setAttribute('aria-valuenow', '100');
  };

  bindSeg($('#iv', el), (v) => {
    st.interval = v;
    scan();
  });
  $('#rescan', el)?.addEventListener('click', scan);
  scan();

  return () => {
    st.disposed = true;
    st.run++;
  };
}