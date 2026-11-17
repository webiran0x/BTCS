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
    <div class="page-head" dir="rtl">
      <div><h1>اسکن بازار</h1><p>بررسی هر ارز در یک تایم‌فریم: وضعیت نمودار، محل سطوح کلیدی، و میزان شواهد مستند پشتیبان هر خوانش. مؤلفه‌های فاقد اعتبار در تست‌ها وزن‌دهی نمی‌شوند، بنابراین بیشتر ارزها به عنوان «بدون لبه» برمی‌گردند — که نتیجه‌ای کاملاً صادقانه است، نه یک صفحه خالی.</p></div>
      <div class="row">
        <div class="seg" id="iv" dir="ltr">${['1m', '5m', '15m', '1h', '4h', '1d'].map((i) => `<button data-v="${i}" class="${i === st.interval ? 'on' : ''}">${i}</button>`).join('')}</div>
        <button class="btn" id="rescan">${icon('refresh', 16)} اسکن مجدد</button>
      </div>
    </div>
    <div class="meter" id="meter" style="margin-bottom:12px" dir="rtl"><i style="width:0%"></i></div>
    <div id="body" dir="rtl">${skeleton(8, 26)}</div>`;

  const card = (r, rank) => {
    const a = r.advice;
    const t = a.timing;
    return `
      <div class="advice-card" data-sym="${esc(r.coin.symbol)}" dir="rtl">
        <div class="row spread">
          <div class="coin-cell">${rank ? `<span class="rank">${rank}</span>` : ''}${coinLogo(r.coin, 30)}
            <div><b>${esc(r.coin.symbol)}</b> <small class="muted">${esc(r.coin.name)}</small><br>
              <span class="fine">${money(a.price)} ${changeHtml(r.coin.change24h)}</span></div></div>
          <div style="text-align:left">
            <span class="chip ${a.tone === 'warn' ? 'warn' : a.tone}"><b>${esc(a.verdict)}</b></span>
            <div class="fine" style="margin-top:3px">اعتماد ${a.conviction}/100</div>
          </div>
        </div>

        ${a.plan ? `<div class="plan mt">
          <div><div class="k">منطقه ورود</div><div class="v" dir="ltr">${money(a.plan.entryZone[0])} – ${money(a.plan.entryZone[1])}</div></div>
          <div><div class="k">حد ضرر</div><div class="v down" dir="ltr">${money(a.plan.stopLoss)} <span class="fine">(${a.plan.riskPct}%)</span></div></div>
          <div><div class="k">هدف ۱</div><div class="v up" dir="ltr">${money(a.plan.takeProfits[0])}</div></div>
          <div><div class="k">هدف ۲</div><div class="v up" dir="ltr">${money(a.plan.takeProfits[1])}</div></div>
        </div>` : `<p class="fine mt">هنوز ورودی وجود ندارد. ${esc(a.waitFor?.[0] || 'در انتظار تریگر.')}</p>`}

        ${t ? `<p class="fine mt">${t.rising
          ? `الگوهای مشابه گذشته حدود <b>${esc(horizonText(st.interval, t.bars))}</b> به رشد خود ادامه داده‌اند و در نزدیکی <b>${money(t.targetPrice)}</b> به اوج رسیده‌اند${t.turnBars ? `، سپس در حدود ${esc(horizonText(st.interval, t.turnBars))} روند نزولی به خود گرفته‌اند` : ''}.`
          : `الگوهای مشابه گذشته حدود <b>${esc(horizonText(st.interval, t.bars))}</b> به ریزش ادامه داده‌اند — صبر کردن ممکن است قیمت بهتری به دست دهد، اما این یک الگو است، نه پیش‌بینی.`}</p>` : ''}

        <ul class="reasons mt">${a.reasons.map((x) => `<li class="${x.tone === 'good' ? 'b' : x.tone === 'bad' ? 's' : ''}">${esc(x.text)}</li>`).join('')}</ul>
        <div class="row mt" style="gap:8px">
          <a class="btn sm" href="#/coin/${esc(r.coin.symbol)}">باز کردن نمودار</a>
          ${tradable(r.coin.symbol) ? `<button class="btn sm ghost" data-trade="${esc(r.coin.symbol)}">محل معامله</button>` : ''}
          <span class="fine" style="margin-right:auto">شواهد: ${esc(a.evidence)}</span>
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
      ${held.length ? `<h2 class="mt" style="margin-bottom:8px">دارایی‌های شما — چه باید کرد</h2>
        <div class="advice-grid">${held.map((r) => card(r)).join('')}</div>` : ''}

      <h2 class="mt" style="margin-bottom:8px">جاهایی که شواهد قوی‌تر هستند</h2>
      ${buys.length
        ? `<div class="advice-grid">${buys.slice(0, 9).map((r, i) => card(r, i + 1)).join('')}</div>`
        : `<div class="card empty"><h3>هیچ ارزی از حد نصاب شواهد در این تایم‌فریم عبور نمی‌کند</h3><p>این نتیجه‌ای رایج و پاسخی واقعی است. امتیاز نمودار وزنی ندارد زیرا در اندازه‌گیری‌ها جهت اشتباهی را نشان داد، و پیش‌بینی نیز سهم ناچیزی دارد زیرا نتوانست مبنای خود را شکست دهد — بنابراین یک نتیجه قطعی تنها زمانی ظاهر می‌شود که موردی با سابقه اندازه‌گیری‌شده تمایل واقعی نشان دهد. لیست کامل زیر را مرور کنید یا نمودار یک ارز را مستقیماً بررسی نمایید.</p></div>`}

      ${avoid.length ? `<h2 class="mt" style="margin-bottom:8px">ضعیف‌ترین خوانش در اینجا</h2>
        <div class="advice-grid">${avoid.slice(0, 6).map((r) => card(r)).join('')}</div>` : ''}

      <div class="card mt" style="background:var(--surface-2)">
        <h3>میزان اعتماد به این نتایج</h3>
        <p class="fine">امتیاز نمودار بخشی از نتیجه نهایی نیست. در میان ${SCORE_BUCKETS_TESTED.bars.toLocaleString('fa-IR')} کندل از ${SCORE_BUCKETS_TESTED.coins.toLocaleString('fa-IR')} ارز، سهم مواردی که رشد کرده‌اند با افزایش امتیاز عموماً کاهش می‌یابد، بنابراین به عنوان یک خوانش نمایش داده می‌شود اما رأیی ندارد — همان دروازه دقتی که سایر مؤلفه‌ها از آن عبور می‌کنند.</p>
        <p class="fine">هر نتیجه ترکیبی از چهار خوانش است و هر کدام با دقت اندازه‌گیری‌شده خود وزن‌دهی می‌شوند — خوانشی که در تست‌ها مزیتی نداشته تأثیر کمی روی نتیجه دارد. ${(() => {
          const r = TESTED_ACCURACY.recheck?.[st.interval];
          const charts = Object.values(TESTED_ACCURACY.recheck || {}).filter((x) => typeof x?.hit === 'number').length;
          const [hit, base, n] = r ? [r.hit, r.baseline, Math.round(TESTED_ACCURACY.recheck.tests / charts)]
            : typeof TESTED_ACCURACY[st.interval] === 'number' ? [TESTED_ACCURACY[st.interval], TESTED_ACCURACY.baseline[st.interval], TESTED_ACCURACY.testsPerInterval]
              : [TESTED_ACCURACY.all, TESTED_ACCURACY.allBaseline, TESTED_ACCURACY.tests];
          return `مؤلفه پیش‌بینی جهت بازار را در ${hit}% مواقع در ${n.toLocaleString('fa-IR')} تست خارج از نمونه${r || typeof TESTED_ACCURACY[st.interval] === 'number' ? ` روی ${esc(st.interval)}` : ''} در سراسر ${TESTED_ACCURACY.coins.toLocaleString('fa-IR')} ارز${r ? ` (${TESTED_ACCURACY.recheck.measuredOn})` : ''} به درستی پیش‌بینی کرده است، در مقایسه با ${base}% برای حدس ساده جهت رایج‌تر${(TESTED_ACCURACY.noEdge || []).includes(st.interval) ? ` — روی ${esc(st.interval)} نتوانست بر آن مبنا غلبه کند` : ''}.`;
        })()} برچسب خرید (BUY) یا پرهیز (AVOID) تنها زمانی ظاهر می‌شود که خوانشی با مزیت اندازه‌گیری‌شده به وضوح متمایل باشد؛ زمانی که تنها تمایل ناشی از خوانش‌های کم‌اهمیت باشد، ارز به جای آن با برچسب «تمایل صعودی» یا «تمایل نزولی» مشخص می‌شود. زمان‌بندی نشان می‌دهد چه زمانی یک حرکت ممکن است به اوج برسد، نه اینکه به کدام سمت می‌رود، بنابراین نمایش داده می‌شود اما رأیی ندارد.</p>
        <p class="fine">${esc(ADVICE_DISCLAIMER)} ${wait.length.toLocaleString('fa-IR')} از ${done.length.toLocaleString('fa-IR')} ارز اسکن‌شده به عنوان «بدون لبه — صبر کنید» برگشتند که معمولاً پاسخی صادقانه است.${st.skipped ? ` ${st.skipped.toLocaleString('fa-IR')} مورد دیگر رد شدند: هیچ کندل صرافی روی ${esc(st.interval)} نداشتند و تنها خط ساعتی کوین‌گکو یا داده‌های دمو در دسترس بود که پیش‌بینی هرگز روی آن‌ها آزمایش نشده است.` : ''}</p>
      </div>`;

    $$('.advice-card', el).forEach((c) => c.addEventListener('click', (e) => {
      if (e.target.closest('a,button')) return;
      location.hash = `#/coin/${c.dataset.sym}`;
    }));
    $$('[data-trade]', el).forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const sym = b.dataset.trade;
      modal(`<div dir="rtl"><h3>محل معامله ${esc(sym)}</h3>
        <div class="sheet-grid mt">${venuesFor(sym).map((v) => `<a class="sheet-item" href="${esc(safeUrl(v.href, '#/exchanges'))}" target="_blank" rel="noopener noreferrer">${icon('exchanges', 18)}<span>${esc(v.name)}<br><small class="fine" dir="ltr">${esc(v.pair)}</small></span></a>`).join('')}</div>
        <p class="fine mt">${esc(TRADE_DISCLAIMER)}</p></div>`);
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
      $('#body', el).innerHTML = '<div class="card empty"><h3>بارگیری لیست ارزها امکان‌پذیر نبود</h3><p>فید بازار پاسخ نداد، بنابراین موردی برای اسکن وجود ندارد. برای تلاش مجدد، روی «اسکن مجدد» کلیک کنید.</p></div>';
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
      $('#body', el).innerHTML = `<div class="card empty"><h3>داده‌ای از نمودار بازنگشت</h3><p>هیچ‌کدام از ارزها کندل‌های صرافی را در این تایم‌فریم بازنگرداندند${st.skipped ? ` (${st.skipped.toLocaleString('fa-IR')} مورد رد شد: فقط کوین‌گکو یا داده دمو)` : ''}، بنابراین چیزی برای خواندن وجود ندارد. برای تلاش مجدد روی اسکن مجدد کلیک کنید.</p></div>`;
      $('#meter i', el).style.width = '100%';
      return;
    }

    for (const row of [...st.rows].sort((a, b) => Math.abs(b.signal.score) - Math.abs(a.signal.score))) {
      if (run !== st.run || st.disposed) return;
      let fc = null, tm = null;
      try {
        fc = await runForecast(row.candles, { horizon: DEFAULT_HORIZON[iv], intervalMs: INTERVAL_MS[iv] });
        tm = fc?.ok ? timingOutlook(fc, { intervalMs: INTERVAL_MS[iv], interval: iv }) : null;
      } catch { /* مشاور بدون آن هم کار می‌کند */ }
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