// یک خوانش برای هر ارز در سطح بازار، رتبه‌بندی شده بر اساس میزان شواهد مستند پشتیبان آن.
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

export async function render(el) {
  const st = { interval: '4h', rows: [], run: 0, disposed: false, count: 60, skipped: 0 };

  el.innerHTML = `
    <style>
      .ap-advice-wrap {
        direction: rtl;
        text-align: right;
        max-width: 1360px;
        margin: 0 auto;
        padding-bottom: 60px;
      }
      .ap-hero-card {
        background: radial-gradient(circle at top right, rgba(94, 92, 230, 0.09), transparent 50%),
                    radial-gradient(circle at bottom left, rgba(50, 215, 75, 0.07), transparent 50%),
                    rgba(24, 24, 29, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 28px;
        padding: 32px;
        backdrop-filter: blur(28px);
        -webkit-backdrop-filter: blur(28px);
        margin-bottom: 24px;
        box-shadow: 0 24px 54px rgba(0, 0, 0, 0.35);
      }
      .ap-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.075);
        border-radius: 22px;
        padding: 24px;
        backdrop-filter: blur(22px);
        -webkit-backdrop-filter: blur(22px);
        transition: border-color 0.25s ease, box-shadow 0.25s ease;
        margin-bottom: 20px;
      }
      .ap-card:hover {
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
      }
      .ap-advice-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-bottom: 24px;
      }
      @media(max-width: 1100px) {
        .ap-advice-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media(max-width: 700px) {
        .ap-advice-grid { grid-template-columns: 1fr; }
      }
      .ap-advice-card {
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        padding: 20px;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        transition: all 0.25s ease;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: pointer;
      }
      .ap-advice-card:hover {
        border-color: rgba(255, 255, 255, 0.2);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
        transform: translateY(-2px);
      }
      .ap-advice-wrap .seg {
        background: rgba(255, 255, 255, 0.05);
        padding: 4px;
        border-radius: 12px;
        display: inline-flex;
        gap: 4px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .ap-advice-wrap .seg button {
        background: transparent;
        border: 0;
        color: rgba(255, 255, 255, 0.6);
        padding: 6px 14px;
        border-radius: 9px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      }
      .ap-advice-wrap .seg button.on {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      }
      .ap-meter-bar {
        height: 6px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 24px;
      }
      .ap-meter-bar i {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, #5e5ce6, #32d74b);
        transition: width 0.3s ease;
      }
    </style>

    <div class="ap-advice-wrap" dir="rtl">
      <div class="ap-hero-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px">
        <div>
          <h1 style="font-size:2.2rem;font-weight:700;letter-spacing:-0.02em;color:#fff;margin:0 0 8px 0">اسکن بازار</h1>
          <p style="color:rgba(255,255,255,0.7);font-size:1.05rem;line-height:1.6;margin:0;max-width:850px">بررسی هر ارز در یک تایم‌فریم: وضعیت نمودار، سطوح کلیدی، و میزان شواهد مستند پشتیبان هر خوانش.</p>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div class="seg" id="iv" dir="ltr">${['1m', '5m', '15m', '1h', '4h', '1d'].map((i) => `<button data-v="${i}" class="${i === st.interval ? 'on' : ''}">${i}</button>`).join('')}</div>
          <button class="btn" id="rescan" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:8px 16px;border-radius:12px;cursor:pointer;font-weight:500;display:flex;align-items:center;gap:6px">${icon('refresh', 16)} اسکن مجدد</button>
        </div>
      </div>
      <div class="ap-meter-bar" id="meter"><i style="width:0%"></i></div>
      <div id="body">${skeleton(8, 26)}</div>
    </div>`;

  const card = (r, rank) => {
    const a = r.advice;
    const t = a.timing;
    return `
      <div class="ap-advice-card" data-sym="${esc(r.coin.symbol)}" dir="rtl">
        <div>
          <div class="row spread" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <div class="coin-cell" style="display:flex;align-items:center;gap:10px">${rank ? `<span class="rank" style="background:rgba(255,255,255,0.1);color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700">${rank}</span>` : ''}${coinLogo(r.coin, 30)}
              <div><b style="color:#fff">${esc(r.coin.symbol)}</b> <small class="muted" style="color:rgba(255,255,255,0.4);font-size:0.8rem">${esc(r.coin.name)}</small><br>
                <span class="fine" style="color:rgba(255,255,255,0.6);font-size:0.85rem">${money(a.price)} ${changeHtml(r.coin.change24h)}</span></div></div>
            <div style="text-align:left">
              <span class="chip ${a.tone === 'warn' ? 'warn' : a.tone}" style="padding:4px 10px;border-radius:8px;font-size:0.8rem"><b>${esc(a.verdict)}</b></span>
              <div class="fine" style="margin-top:4px;color:rgba(255,255,255,0.4);font-size:0.75rem">اعتماد ${a.conviction}/100</div>
            </div>
          </div>

          ${a.plan ? `<div class="plan mt" style="background:rgba(255,255,255,0.02);padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.05);display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
            <div><div class="k" style="color:rgba(255,255,255,0.4);font-size:0.75rem">منطقه ورود</div><div class="v" dir="ltr" style="font-size:0.85rem;font-weight:600;color:#fff">${money(a.plan.entryZone[0])} – ${money(a.plan.entryZone[1])}</div></div>
            <div><div class="k" style="color:rgba(255,255,255,0.4);font-size:0.75rem">حد ضرر</div><div class="v down" dir="ltr" style="font-size:0.85rem;font-weight:600">${money(a.plan.stopLoss)} <span class="fine" style="font-size:0.7rem">(${a.plan.riskPct}%)</span></div></div>
            <div><div class="k" style="color:rgba(255,255,255,0.4);font-size:0.75rem">هدف ۱</div><div class="v up" dir="ltr" style="font-size:0.85rem;font-weight:600">${money(a.plan.takeProfits[0])}</div></div>
            <div><div class="k" style="color:rgba(255,255,255,0.4);font-size:0.75rem">هدف ۲</div><div class="v up" dir="ltr" style="font-size:0.85rem;font-weight:600">${money(a.plan.takeProfits[1])}</div></div>
          </div>` : `<p class="fine mt" style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-bottom:12px">هنوز ورودی وجود ندارد. ${esc(a.waitFor?.[0] || 'در انتظار تریگر.')}</p>`}

          ${t ? `<p class="fine mt" style="color:rgba(255,255,255,0.6);font-size:0.85rem;line-height:1.5;margin-bottom:12px">${t.rising
            ? `الگوهای مشابه حدود <b>${esc(horizonText(st.interval, t.bars))}</b> رشد کرده و در نزدیکی <b>${money(t.targetPrice)}</b> به اوج رسیده‌اند.`
            : `الگوهای مشابه حدود <b>${esc(horizonText(st.interval, t.bars))}</b> به ریزش ادامه داده‌اند.`}</p>` : ''}

          <ul class="reasons mt" style="margin:0 0 16px 0;padding-right:18px;color:rgba(255,255,255,0.75);font-size:0.85rem">${a.reasons.map((x) => `<li style="margin-bottom:4px">${esc(x.text)}</li>`).join('')}</ul>
        </div>

        <div class="row mt" style="gap:8px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">
          <a class="btn sm" href="#/coin/${esc(r.coin.symbol)}" style="background:rgba(255,255,255,0.08);padding:6px 12px;border-radius:10px;color:#fff;text-decoration:none;font-size:0.8rem">نمودار</a>
          ${tradable(r.coin.symbol) ? `<button class="btn sm ghost" data-trade="${esc(r.coin.symbol)}" style="background:transparent;border:1px solid rgba(255,255,255,0.1);color:#fff;padding:6px 12px;border-radius:10px;font-size:0.8rem;cursor:pointer">معامله</button>` : ''}
          <span class="fine" style="margin-right:auto;color:rgba(255,255,255,0.4);font-size:0.75rem">شواهد: ${esc(a.evidence)}</span>
        </div>
      </div>`;
  };

  const draw = () => {
    const done = st.rows.filter((r) => r.advice);
    if (!done.length) { $('#body', el).innerHTML = skeleton(8, 26); return; }
    const { buys, avoid, wait } = rankAdvice(done);
    const holdings = load('holdings', []);
    const held = done.filter((r) => holdings.some((h) => h.symbol === r.coin.symbol));

    $('#body', el).innerHTML = `
      ${held.length ? `<h2 class="mt" style="font-size:1.25rem;color:#fff;margin:0 0 12px 0">دارایی‌های شما</h2>
        <div class="ap-advice-grid">${held.map((r) => card(r)).join('')}</div>` : ''}

      <h2 class="mt" style="font-size:1.25rem;color:#fff;margin:24px 0 12px 0">قوی‌ترین شواهد بازار</h2>
      ${buys.length
        ? `<div class="ap-advice-grid">${buys.slice(0, 9).map((r, i) => card(r, i + 1)).join('')}</div>`
        : `<div class="ap-card empty" style="text-align:center;padding:40px"><h3 style="color:#fff;margin-bottom:8px">هیچ ارزی از حد نصاب شواهد عبور نکرد</h3><p style="color:rgba(255,255,255,0.6)">این یک پاسخ کاملاً صادقانه است؛ زمانی که بازار روند قطعی نداشته باشد، سیگنالی صادر نمی‌شود.</p></div>`}

      ${avoid.length ? `<h2 class="mt" style="font-size:1.25rem;color:#fff;margin:24px 0 12px 0">ضعیف‌ترین خوانش‌ها</h2>
        <div class="ap-advice-grid">${avoid.slice(0, 6).map((r) => card(r)).join('')}</div>` : ''}

      <div class="ap-card mt" style="margin-top:32px">
        <h3 style="color:#fff;margin-bottom:12px">میزان اعتماد به نتایج</h3>
        <p class="fine" style="color:rgba(255,255,255,0.6);line-height:1.6;margin-bottom:8px">هر نتیجه ترکیبی از تحلیل‌های آماری و تست‌های خارج از نمونه است. برچسب خرید یا پرهیز تنها زمانی ظاهر می‌شود که خوانشی با مزیت اندازه‌گیری‌شده وجود داشته باشد.</p>
        <p class="fine" style="color:rgba(255,255,255,0.5);line-height:1.6;margin:0">${esc(ADVICE_DISCLAIMER)} ${wait.length.toLocaleString('fa-IR')} از ${done.length.toLocaleString('fa-IR')} ارز به عنوان «بدون لبه» برگشتند.</p>
      </div>`;

    $$('.ap-advice-card', el).forEach((c) => c.addEventListener('click', (e) => {
      if (e.target.closest('a,button')) return;
      location.hash = `#/coin/${c.dataset.sym}`;
    }));
    $$('[data-trade]', el).forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const sym = b.dataset.trade;
      modal(`<div dir="rtl"><h3 style="color:#fff;margin-bottom:12px">محل معامله ${esc(sym)}</h3>
        <div class="sheet-grid mt" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">${venuesFor(sym).map((v) => `<a class="sheet-item" href="${esc(safeUrl(v.href, '#/exchanges'))}" target="_blank" rel="noopener noreferrer" style="background:rgba(255,255,255,0.04);padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none">${icon('exchanges', 18)}<span><b>${esc(v.name)}</b><br><small class="fine" dir="ltr" style="color:rgba(255,255,255,0.4);font-size:0.75rem">${esc(v.pair)}</small></span></a>`).join('')}</div>
        <p class="fine mt" style="color:rgba(255,255,255,0.4);font-size:0.8rem;margin-top:16px">${esc(TRADE_DISCLAIMER)}</p></div>`);
    }));
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
      $('#body', el).innerHTML = '<div class="ap-card empty" style="text-align:center;padding:40px"><h3 style="color:#fff;margin-bottom:8px">خطا در بارگیری بازار</h3><p style="color:rgba(255,255,255,0.6)">فید بازار پاسخ نداد.</p></div>';
      return;
    }
    const iv = st.interval;
    let done = 0;
    const setProg = () => { $('#meter i', el).style.width = `${(done / list.length) * 100}%`; };

    const queue = [...list];
    const worker = async () => {
      while (queue.length) {
        const coin = queue.shift();
        try {
          const res = await getCandles(coin, iv, 1500);
          if (run !== st.run || st.disposed) return;
          if (!isTestedSource(res)) { st.skipped++; } else {
            const signal = generateSignal(res.candles, { interval: iv });
            st.rows.push({ coin, signal, candles: res.candles, advice: adviseCoin({ signal, forecast: null, timing: null, interval: iv }) });
            draw();
          }
        } catch { st.skipped++; }
        done++; setProg();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (run !== st.run || st.disposed) return;
    if (!st.rows.length) {
      $('#body', el).innerHTML = `<div class="ap-card empty" style="text-align:center;padding:40px"><h3 style="color:#fff;margin-bottom:8px">داده‌ای یافت نشد</h3><p style="color:rgba(255,255,255,0.6)">هیچ کندلی برای این تایم‌فریم دریافت نشد.</p></div>`;
      $('#meter i', el).style.width = '100%';
      return;
    }

    for (const row of [...st.rows].sort((a, b) => Math.abs(b.signal.score) - Math.abs(a.signal.score))) {
      if (run !== st.run || st.disposed) return;
      let fc = null, tm = null;
      try {
        fc = await runForecast(row.candles, { horizon: DEFAULT_HORIZON[iv], intervalMs: INTERVAL_MS[iv] });
        tm = fc?.ok ? timingOutlook(fc, { intervalMs: INTERVAL_MS[iv], interval: iv }) : null;
      } catch { /* بدون پیش‌بینی هم کار می‌کند */ }
      row.advice = adviseCoin({ signal: row.signal, forecast: fc, timing: tm, interval: iv, trust: directionTrustFor(iv).trust });
      row.candles = null;
      draw();
    }
    $('#meter i', el).style.width = '100%';
  };

  bindSeg($('#iv', el), (v) => { st.interval = v; scan(); });
  $('#rescan', el).addEventListener('click', scan);
  scan();
  return () => { st.disposed = true; st.run++; };
}