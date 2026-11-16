import { findCoin, markets, dataStatus, getCandles, exchangeCandles, getCoinProfile, getDepth, getTrades, getTickSize, isTestedSource, isStable, INTERVAL_MS, isSecondInterval, MAX_BARS } from '../api/market.js';
import { compareExchanges } from '../api/exchanges.js';
import { live } from '../api/live.js';
import { streamCandles } from '../api/exstream.js';
import { generateSignal, confluence, geometryFor, upRateFor, scoreAt } from '../lib/signals.js';
import { runForecast, runBacktest, runHistory } from '../lib/compute.js';
import { learnFromChart } from '../lib/learnpass.js';
import { cloudLearning } from '../lib/cloudlearn.js';
import { computeAll } from '../lib/indicators.js';
import { TESTED_ACCURACY, shownProbUp, directionReliable, recheckOverall } from '../lib/predict.js';
import { timingOutlook, TESTED_TIMING, timingTrust, condenseTiming, bestTimingChart } from '../lib/timing.js';
import { remember, DEFAULT_HORIZON } from '../ai/context.js';
import { CandleChart } from '../charts/candles.js';
import { LineChart } from '../charts/line.js';
import { $, $$, icon, coinLogo, skeleton, errorBox, bindSeg, bindTabs, modal, toast } from '../ui.js';
import { esc, safeUrl, usd, compact, pct, amount, changeHtml, dateTime, ago, horizonText, INTERVAL_LABEL, money } from '../format.js';
import { watchlist, settings, load, save } from '../store.js';
import { venuesFor, tradable, TRADE_DISCLAIMER } from '../lib/trade.js';
import { getNews, backendEnabled, getAiRecord } from '../api/backend.js';
import { aiRecordStats, shareText } from '../lib/airecord.js';
import { logActivity, logForecastShown } from '../api/activity.js';
import { tradeSummary } from '../lib/summary.js';
import { newState, openManual, closeManual, equity, DEFAULT_CONFIG, DEMO_NOTICE, rulesForChart, rulesFor, rulesInWords, entryBlocker, blockerText, PER_COIN_RULES, aiSignal, CHART_TESTED } from '../lib/autotrader.js';
import { forecastForDisplay, forecastFacts, moveSizeCall, FORECAST_TESTED } from '../lib/forecastview.js';
import { fx } from '../api/fx.js';
import {
  loadLedger, saveLedger, newLedger, recordForecast, resolveDueLedger, directionTrustFor, MIN_GRADED_FOR_TRUST,
  rollingAccuracy, learningStatus, accuracySparkline, adaptiveWeights, MIN_FAMILY_CALLS,
  dampenConfidence, threeModelEnsemble, signalMeter, riskWarnings, anomalyFlags,
  sparklineSvg, TREND_WORDS,
} from '../lib/selfimprove.js';

export const title = (p) => (p[0] || 'Coin').toUpperCase();
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SERIES = ['--series-1', '--series-2', '--series-3', '--series-5', '--series-7', '--series-4'];
const INTERVALS = ['1s', '5s', '10s', '1m', '5m', '15m', '1h', '4h', '1d', '1w'];
const UNMEASURED = ['1s', '5s', '10s'];

export async function render(el, [symParam]) {
  const sym = (symParam || 'BTC').toUpperCase();
  el.innerHTML = skeleton(8, 30);
  const coin = await findCoin(sym);
  if (!coin) { el.innerHTML = await notFound(sym, () => render(el, [symParam])); return; }

  const st = {
    interval: INTERVALS.includes(settings.get().interval) ? settings.get().interval : '1h',
    candles: [], source: '', signal: null, forecast: null, horizon: null, tab: 'forecast', disposed: false, unsub: [], charts: [],
  };
  st.horizon = DEFAULT_HORIZON[st.interval] || 12;
  const pair = coin.binance;

  const stable = isStable(coin.symbol);

  el.innerHTML = `
    <div class="coin-head">
      ${coinLogo(coin, 44)}
      <div>
        <div class="row"><h1>${esc(coin.name)}</h1><span class="chip">${esc(coin.symbol)}</span>${coin.rank ? `<span class="chip">#${coin.rank}</span>` : ''}
          <button class="star ${watchlist.has(coin.symbol) ? 'on' : ''}" id="star" aria-pressed="${watchlist.has(coin.symbol)}" aria-label="${watchlist.has(coin.symbol) ? 'حذف از دیده‌بان' : 'افزودن به دیده‌بان'}">${icon('star', 20)}</button></div>
        <div class="row"><span class="price num" id="px">${money(coin.price)}</span><span id="pxChg" style="font-size:16px">${changeHtml(coin.change24h)}</span><span class="chip" id="srcChip">…</span></div>
      </div>
      <div class="row" style="margin-left:auto">
        <a class="btn" href="#/alerts/${esc(coin.symbol)}">${icon('alerts', 16)} هشدار</a>
        ${tradable(coin.symbol) ? `<button class="btn" id="tradeBtn">${icon('exchanges', 16)} معامله</button>` : ''}
        <a class="btn primary" id="askAi" href="#/ai/${esc(coin.symbol)}">${icon('ai', 16)} پرسش از هوش مصنوعی درباره ${esc(coin.symbol)}</a>
      </div>
    </div>
    ${stable ? `<div class="card" style="border-color:var(--warn);margin-bottom:14px"><p style="margin:0"><b>${esc(coin.symbol)} یک استِبل‌کوین است</b> که برای حفظ ارزش ۱ دلاری طراحی شده است. پیش‌بینی‌ها و سیگنال‌های خرید و فروش برای آن معنی‌دار نیستند، بنابراین اطلاعات زیر صرفاً جنبه مرجع دارند و در سوابق هوش مصنوعی ثبت نمی‌شوند.</p></div>` : ''}
    <div class="grid g4" style="margin-bottom:14px">
      <div class="card stat"><span class="k">ارزش بازار</span><span class="v">${compact(coin.marketCap)}</span></div>
      <div class="card stat"><span class="k">حجم معاملات ۲۴ ساعته</span><span class="v">${compact(coin.volume24h)}</span></div>
      <div class="card stat"><span class="k">بازه ۲۴ ساعته</span><span class="v" id="range24" style="font-size:16px">${coin.low24h ? `${usd(coin.low24h)} – ${usd(coin.high24h)}` : '—'}</span></div>
      <div class="card stat"><span class="k">سقف تاریخی (ATH)</span><span class="v">${usd(coin.ath)}</span><span class="s muted">${coin.ath ? `${pct((coin.price / coin.ath - 1) * 100, 1)} از ATH` : ''}</span></div>
    </div>
    <div class="coin-layout">
      <div class="stack c-chart">
        <div class="card chart-card">
          <div class="chart-tools">
            <div class="seg scroll-x" id="ivSeg">${INTERVALS.map((iv) => `<button data-v="${iv}" class="${iv === st.interval ? 'on' : ''}" title="کندل‌های ${esc(INTERVAL_LABEL[iv] || iv)}">${iv}</button>`).join('')}</div>
            <button class="btn sm ghost only-s" id="indBtn" aria-expanded="false">${icon('chart', 14)} اندیکاتورها</button>
            <button class="btn sm ghost" id="drawBtn" aria-expanded="false">${icon('compare', 14)} رسم خطوط</button>
            <div class="toggles" id="toggles"></div>
          </div>
          <div class="draw-tools" id="drawTools" hidden>
            <div class="seg" id="toolSeg">
              <button data-tool="" class="on">خاموش</button>
              <button data-tool="trend">خط روند</button>
              <button data-tool="hline">خط افقی</button>
              <button data-tool="fib">فیبوناچی</button>
              <button data-tool="erase">پاک‌کن</button>
            </div>
            <button class="btn sm ghost" id="clearDraw">پاک کردن همه</button>
            <span class="fine" id="drawHint">برای رسم خط روند، دو نقطه روی نمودار لمس کنید.</span>
          </div>
          <div class="chart-box" id="chart"></div>
          <p class="fine" style="margin:6px 4px 0">برای بزرگنمایی اسکرول کنید یا دو انگشتی بکشید · برای جابجایی بکشید · برای بازنشانی دوبار کلیک کنید. بادبزن طلایی = محدوده قیمتی پیش‌بینی؛ خطوط نازک = مسیرهای احتمالی.</p>
        </div>
        <div class="card" id="summaryCard" hidden></div>
      </div>
      <div class="stack c-side">
        <div class="card" id="signalCard">${skeleton(6)}</div>
        <div class="card" id="fcCard">${skeleton(5)}</div>
        <div class="card" id="newsCard" hidden></div>
      </div>
      <div class="card c-tabs">
      <div class="tabs" role="tablist" id="tabs">
        <button data-tab="forecast" class="on">${icon('forecast', 16)} پیش‌بینی هوش مصنوعی</button>
        <button data-tab="patterns">${icon('compare', 16)} مقایسه الگوها</button>
        <button data-tab="history">${icon('markets', 16)} تاریخچه و چرخه‌ها</button>
        <button data-tab="news">${icon('info', 16)} اخبار</button>
        <button data-tab="periods">مقایسه با گذشته</button>
        <button data-tab="backtest">بک‌تست</button>
        ${pair ? '<button data-tab="book">دفتر سفارشات</button>' : ''}
        <button data-tab="exchanges">صرافی‌ها</button>
        <button data-tab="about">درباره</button>
      </div>
      <div id="tabBody"></div>
      </div>
    </div>`;

  (async () => {
    if (!backendEnabled()) return;
    const rows = await getNews({ coin: coin.symbol, limit: 4 }).catch(() => []);
    if (st.disposed || !rows.length) return;
    const card = $('#newsCard', el);
    if (!card) return;
    card.hidden = false;
    card.innerHTML = `
      <div class="card-h"><h3>اخبار ${esc(coin.symbol)}</h3><button class="btn sm ghost" id="allNews">مشاهده همه</button></div>
      <div class="news-mini">${rows.map((r) => `
        <a href="${esc(safeUrl(r.link, '#/news'))}" target="_blank" rel="noopener noreferrer">
          <span>${esc(r.title)}</span>
          <small class="fine">${esc(r.source || '')} · ${esc(ago(new Date(r.published_at).getTime()))}</small>
        </a>`).join('')}</div>
      <p class="fine">فقط برای زمینه — مدل قیمت از داده‌های بازار استفاده می‌کند نه اخبار.</p>`;
    $('#allNews', card)?.addEventListener('click', () => {
      const btn = $$('[data-tab]', el).find((b) => b.dataset.tab === 'news');
      btn?.click();
      btn?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  })();

  logActivity('view_coin', coin.symbol, { name: coin.name });

  $('#star', el).addEventListener('click', (e) => {
    const on = watchlist.toggle(coin.symbol);
    const b = e.currentTarget;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'حذف از دیده‌بان' : 'افزودن به دیده‌بان');
  });

  $('#tradeBtn', el)?.addEventListener('click', () => {
    const venues = venuesFor(coin.symbol);
    const sig = st.signal;
    logActivity('trade_link', coin.symbol);
    modal(`<h3>معامله ${esc(coin.symbol)}</h3>
      <p class="fine">صرافی‌ای که از قبل در آن حساب دارید را انتخاب کنید. جفت ارز مستقیماً برای معامله باز می‌شود.</p>
      ${sig?.ok && sig.plan ? `<div class="plan mt">
        <div><div class="k">سیگنال می‌گوید</div><div class="v ${sig.tone}">${esc(sig.text)}</div></div>
        <div><div class="k">حد ضرر پیشنهادی</div><div class="v down">${money(sig.plan.stopLoss)}</div></div>
      </div><p class="fine" style="margin-top:8px">به محض پر شدن سفارش، حد ضرر را در صرافی تنظیم کنید.</p>` : ''}
      <div class="sheet-grid mt">
        ${venues.map((v) => `<a class="sheet-item" href="${esc(safeUrl(v.href, '#/exchanges'))}" target="_blank" rel="noopener noreferrer">${icon('exchanges', 18)}<span>${esc(v.name)}<br><small class="fine">${esc(v.pair)}</small></span></a>`).join('')}
      </div>
      <p class="fine mt">${esc(TRADE_DISCLAIMER)}</p>

      <h3 class="mt">تست اولیه با معامله آزمایشی (دمو)</h3>
      <p class="fine">${esc(coin.symbol)} را با پول شبیه‌سازی‌شده و در قیمت زنده آزمایش کنید. حساب آزمایشی شما جدا از حساب معامله‌گر هوش مصنوعی است.</p>
      <div id="paperWrap">${paperBlock()}</div>`);
    wirePaper();
  });

  const PAPER_CFG = 'traderCfg';
  const PAPER_STATE = 'myDemoState';
  const buyContext = () => {
    try {
      const c = st.candles.slice(0, -1); if (c.length < 210) return null;
      const ind = computeAll(c), i = c.length - 1;
      return { trendUp: !!(ind.ema200[i] && c[i].c > ind.ema200[i]), adx: ind.adx.adx[i] === null ? null : +ind.adx.adx[i].toFixed(1), rsi: ind.rsi[i] === null ? null : +ind.rsi[i].toFixed(1) };
    } catch { return null; }
  };
  const paperCfg = () => ({ ...DEFAULT_CONFIG, ...load(PAPER_CFG, {}) });
  const onDemoPrices = () => st.source === 'demo' || (!st.source && coin.source === 'demo');
  const DEMO_PRICE_MSG = 'قیمت‌های زنده بارگذاری نمی‌شوند، صفحه اطلاعات نمایشی نشان می‌دهد. معامله آزمایشی نیازمند قیمت زنده است.';
  const paperState = () => load(PAPER_STATE, null) || newState(paperCfg());

  function paperBlock() {
    const cfg = paperCfg();
    const state = paperState();
    const pos = state.open[coin.symbol];
    const px = st.lastPrice ?? coin.price;
    const bal = equity(state, { [coin.symbol]: px });
    const suggested = Math.max(1, Math.round(state.balance * 0.1 * (fx.rate || 1)));
    const planStop = st.signal?.ok && st.signal.plan && st.signal.plan.side !== 'short' && st.signal.plan.stopLoss < px ? st.signal.plan.stopLoss : null;
    if (pos) {
      const pnl = (px - pos.entry) * pos.qty;
      return `<div class="plan mt">
        <div><div class="k">پوزیشن آزمایشی شما</div><div class="v">${amount(pos.qty)} ${esc(coin.symbol)}</div></div>
        <div><div class="k">قیمت ورود</div><div class="v">${money(pos.entry, { dp: st.dp })}</div></div>
        <div><div class="k">سود / زیان باز</div><div class="v ${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl))}</div></div>
        <div><div class="k">موجودی آزمایشی</div><div class="v">${money(bal)}</div></div>
      </div>
      <div class="row mt" style="gap:8px"><button class="btn primary" id="paperClose">فروش (آزمایشی)</button><a class="btn sm ghost" href="#/trader">مشاهده تمام معاملات آزمایشی من</a></div>
      <p class="fine" id="paperMsg"></p>
      <p class="fine">${esc(DEMO_NOTICE)}</p>`;
    }
    return `<form class="row mt" style="gap:8px;align-items:flex-end" id="paperForm">
        <label class="fld" style="flex:1">مقدار سرمایه‌گذاری (${esc(fx.code)})<input class="inp" name="amt" type="number" min="1" step="1" value="${suggested}"></label>
        <button class="btn primary">خرید (آزمایشی)</button>
      </form>
      <p class="fine">موجودی آزمایشی ${money(bal)}. ${planStop !== null ? `حد ضرر روی ${money(planStop, { dp: st.dp })} بر اساس سیگنال تنظیم شد.` : 'حد ضرر پیش‌فرض ۵٪ تنظیم شد.'}</p>
      <p class="fine" id="paperMsg"></p>
      <p class="fine">${esc(DEMO_NOTICE)}</p>`;
  }

  function wirePaper() {
    const form = document.querySelector('#paperForm');
    const closeBtn = document.querySelector('#paperClose');
    const msg = () => document.querySelector('#paperMsg');
    const redraw = () => {
      const wrap = document.querySelector('#paperWrap');
      if (!wrap) return;
      wrap.innerHTML = paperBlock();
      wirePaper();
    };
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const cfg = paperCfg();
      const state = paperState();
      const px = st.lastPrice ?? coin.price;
      if (onDemoPrices()) { const m = msg(); if (m) { m.textContent = DEMO_PRICE_MSG; m.className = 'fine down'; } return; }
      const usdAmount = (+form.amt.value || 0) / (fx.rate || 1);
      const r = openManual(state, cfg, coin.symbol, px, {
        notional: usdAmount,
        stopPrice: st.signal?.ok && st.signal.plan?.side !== 'short' ? st.signal.plan?.stopLoss : undefined,
        targetPrice: st.signal?.ok && st.signal.plan?.side !== 'short' ? st.signal.plan?.takeProfits?.[0] : undefined,
        ctx: buyContext(),
      });
      if (!r.ok) { const m = msg(); if (m) { m.textContent = r.error; m.className = 'fine down'; } return; }
      save(PAPER_STATE, state);
      logActivity('paper_buy', coin.symbol);
      toast(`خرید آزمایشی روی ${coin.symbol} ثبت شد. سفارش واقعی ارسال نشد.`, 'up');
      redraw();
    });
    closeBtn?.addEventListener('click', () => {
      const cfg = paperCfg();
      const state = paperState();
      const px = st.lastPrice ?? coin.price;
      if (onDemoPrices()) { const m = msg(); if (m) { m.textContent = DEMO_PRICE_MSG; m.className = 'fine down'; } return; }
      const r = closeManual(state, cfg, coin.symbol, px);
      if (!r.ok) { const m = msg(); if (m) { m.textContent = r.error; m.className = 'fine down'; } return; }
      save(PAPER_STATE, state);
      logActivity('paper_sell', coin.symbol);
      toast(`فروش آزمایشی انجام شد: ${r.trade.pnl >= 0 ? 'سود' : 'زیان'} معادل ${money(Math.abs(r.trade.pnl))} پس از کسر کارمزد.`, r.trade.pnl >= 0 ? 'up' : 'down');
      redraw();
    });
  }

  const chart = new CandleChart($('#chart', el), {});
  const TOGGLES = [['ema20', 'EMA 20', '--series-1'], ['ema50', 'EMA 50', '--series-2'], ['ema200', 'EMA 200', '--series-7'], ['bb', 'بانک بولینگر'], ['vwap', 'VWAP', '--series-4'], ['ichimoku', 'ایچیموکو'], ['supertrend', 'سوپرترند', '--up'], ['keltner', 'کلتنر', '--series-5'], ['donchian', 'دانچیان', '--text-muted'], ['volume', 'حجم'], ['rsi', 'RSI'], ['macd', 'MACD'], ['levels', 'سطوح'], ['markers', 'سیگنال‌ها'], ['projection', 'پیش‌بینی', '--accent']];
  $('#toggles', el).innerHTML = TOGGLES.map(([k, label, c]) => `<button class="toggle ${chart.opts[k] ? 'on' : ''}" data-k="${k}">${c ? `<i style="background:var(${c})"></i>` : ''}${label}</button>`).join('');
  $$('#toggles .toggle', el).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.k; chart.setOptions({ [k]: !chart.opts[k] }); b.classList.toggle('on', chart.opts[k]);
  }));

  const drawKey = () => `${coin.symbol}:${st.interval}`;
  const allDrawings = () => load('drawings', {});
  const loadDrawings = () => allDrawings()[drawKey()] || [];
  const saveDrawings = (list) => {
    const all = allDrawings();
    if (list.length) all[drawKey()] = list; else delete all[drawKey()];
    save('drawings', all);
  };
  chart.onDrawingsChange = (list) => saveDrawings(list);
  chart.setDrawings(loadDrawings());

  const HINTS = {
    '': 'ابزار رسم خاموش — نمودار طبق روال جابجا و زوم می‌شود.',
    trend: 'برای رسم خط روند، دو نقطه روی نمودار لمس کنید.',
    hline: 'برای قرار دادن خط افقی، روی قیمت دلخواه ضربه بزنید.',
    fib: 'کف و سقف نوسان را انتخاب کنید تا سطوح فیبوناچی ترسیم شوند.',
    erase: 'برای حذف هر خط یا طرح، روی آن ضربه بزنید.',
  };

  $('#drawBtn', el)?.addEventListener('click', (e) => {
    const tools = $('#drawTools', el);
    const open = tools.hidden;
    tools.hidden = !open;
    e.currentTarget.setAttribute('aria-expanded', String(open));
    if (!open) { chart.setTool(null); $$('#toolSeg button', el).forEach((b) => b.classList.toggle('on', b.dataset.tool === '')); }
  });

  $$('#toolSeg button', el).forEach((b) => b.addEventListener('click', () => {
    $$('#toolSeg button', el).forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    const tool = b.dataset.tool || null;
    chart.setTool(tool);
    const hint = $('#drawHint', el);
    if (hint) hint.textContent = HINTS[b.dataset.tool] || HINTS[''];
  }));

  $('#clearDraw', el)?.addEventListener('click', () => {
    if (!chart.drawings.length) { toast('موردی برای پاک کردن روی این نمودار وجود ندارد.', 'info'); return; }
    chart.clearDrawings();
    toast('طرح‌ها پاک شدند.', 'info');
  });

  $('#indBtn', el)?.addEventListener('click', (e) => {
    const open = el.querySelector('.chart-tools').classList.toggle('show-toggles');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  const onTheme = () => chart.draw();
  window.addEventListener('cv:theme', onTheme);

  let liveUnsub = null;
  let signalTimer = null;

  async function loadInterval() {
    const iv = st.interval;
    st.forecast = null; st.fcView = null; st.moveCall = null;
    chart.setProjection(null); chart.setMarkers([]); chart.setLevels([]);
    chart.setData([]);
    $('#signalCard', el).innerHTML = skeleton(6);
    $('#fcCard', el).innerHTML = `<div class="row"><span class="spinner"></span><b>در حال آموزش مدل‌های هوش مصنوعی روی تاریخچه ${esc(coin.symbol)}…</b></div><p class="fine mt">تطبیق الگو، شبکه عصبی و مدل‌های یادگیری ماشین در مرورگر شما اجرا می‌شوند.</p>`;
    try {
      chart.setDrawings(loadDrawings());
      const fast = isSecondInterval(iv);
      if (fast !== st.wasFast) {
        chart.setOptions({ ema200: !fast, ema50: !fast, bb: false });
        $$('#toggles .toggle', el).forEach((b) => b.classList.toggle('on', !!chart.opts[b.dataset.k]));
        st.wasFast = fast;
      }
      const daily = (INTERVAL_MS[iv] || 0) >= 864e5;
      const vwapBtn = $('#toggles .toggle[data-k="vwap"]', el);
      if (vwapBtn) {
        vwapBtn.disabled = daily;
        vwapBtn.title = daily ? 'اندیکاتور VWAP روزانه بازنشانی می‌شود و روی کندل‌های روزانه یا هفتگی کاربرد ندارد.' : '';
        if (daily && chart.opts.vwap) { chart.setOptions({ vwap: false }); vwapBtn.classList.remove('on'); }
      }
      const r = await getCandles(coin, iv, isSecondInterval(iv) ? (MAX_BARS[iv] || 600) : 1500);
      if (st.disposed || iv !== st.interval) return;
      st.candles = r.candles; st.source = r.source; st.tested = isTestedSource(r);
      $('#srcChip', el).textContent = r.source === 'binance' ? `● زنده · بایننس ${pair}` : r.venue ? `● ${r.venue} · به‌روزرسانی هر ۲۰ ثانیه` : r.source === 'demo' ? 'داده‌های آزمایشی' : 'کوین‌گکو (با تاخیر)';
      $('#srcChip', el).className = `chip ${r.source === 'binance' || r.venue ? 'up' : r.source === 'demo' ? 'warn' : ''}`;
      chart.setData(r.candles);
      updateSignal();
      if (liveUnsub) liveUnsub();
      if (r.source === 'binance') {
        const streamIv = isSecondInterval(iv) ? '1s' : iv;
        const bucketMs = INTERVAL_MS[iv] || 6e4;
        let lastSignalAt = 0;
        const refreshSignal = () => {
          if (!isSecondInterval(iv)) { updateSignal(); return; }
          if (Date.now() - lastSignalAt < 5000) return;
          lastSignalAt = Date.now();
          updateSignal();
        };
        liveUnsub = live.subscribe(`${pair}@kline_${streamIv}`, (m) => {
          const k = m.k;
          let c = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
          const n = st.candles.length;
          if (!n) return;
          let closed = k.x;
          if (streamIv !== iv) {
            const t = Math.floor(c.t / bucketMs) * bucketMs;
            const open = st.candles[st.candles.length - 1];
            if (open && open.t === t) {
              c = { t, o: open.o, h: Math.max(open.h, c.h), l: Math.min(open.l, c.l), c: c.c, v: open.v + c.v };
              closed = false;
            } else {
              c = { ...c, t };
              closed = true;
            }
          }
          chart.update(c);
          st.candles = chart.candles;
          setPrice(c.c);
          if (closed) refreshSignal();
        });
      }
      if (r.venue) {
        const step = INTERVAL_MS[iv];
        let streamedAt = 0, filling = null;
        const catchUp = () => (filling ??= (async () => {
          const lastT = st.candles[st.candles.length - 1]?.t ?? 0;
          const n = Math.min(1000, Math.max(3, Math.ceil((Date.now() - lastT) / step) + 2));
          const fresh = await exchangeCandles(coin, iv, n, r.source).catch(() => null);
          if (!fresh || st.disposed || iv !== st.interval) return;
          let closed = false;
          for (const c of fresh.candles) { if (c.t >= lastT) { if (c.t > lastT) closed = true; chart.update(c); } }
          st.candles = chart.candles;
          setPrice(st.candles[st.candles.length - 1].c);
          if (closed) updateSignal();
        })().finally(() => { filling = null; }));
        const stopStream = streamCandles(r.source, String(coin.symbol).toUpperCase(), iv, (c) => {
          if (st.disposed || iv !== st.interval || filling) return;
          streamedAt = Date.now();
          const lastT = st.candles[st.candles.length - 1]?.t ?? 0;
          if (c.t > lastT + step) { catchUp(); return; }
          if (c.t < lastT) return;
          chart.update(c);
          st.candles = chart.candles;
          setPrice(c.c);
          if (c.t > lastT) updateSignal();
        }, (on) => {
          const chip = $('#srcChip', el);
          if (chip && !st.disposed && iv === st.interval) chip.textContent = on ? `● زنده · ${r.venue}` : `● ${r.venue} · به‌روزرسانی هر ۲۰ ثانیه`;
        });
        const timer = setInterval(() => {
          if (!st.disposed && iv === st.interval && Date.now() - streamedAt >= 30e3) catchUp();
        }, 20e3);
        liveUnsub = () => { clearInterval(timer); if (stopStream) stopStream(); };
      }
      runAi();
      runBt();
    } catch (err) {
      $('#chart', el).innerHTML = errorBox(err.message);
      $('#signalCard', el).innerHTML = `<h3>خوانش اندیکاتور در دسترس نیست</h3><p class="muted">${esc(err.message || 'منبع کندل‌ها داده کافی برنگرداند.')}</p><p class="fine">${err.notListed ? 'قیمت آن از کوین‌گکو می‌آید که کندلی ندارد. معامله‌گر هوش مصنوعی نیز آن را رد می‌کند.' : 'تایم‌فریم دیگری را امتحان کنید یا بعداً مجدداً تلاش نمایید.'}</p>`;
      $('#fcCard', el).innerHTML = `<h3>پیش‌بینی هوش مصنوعی در دسترس نیست</h3><p class="muted">پیش‌بینی نیازمند تاریخچه کندل است، لذا موردی تولید نشد.</p>`;
    }
  }

  getTickSize(pair).then((dp) => { if (dp !== null && !st.disposed) { st.dp = dp; setPrice(st.lastPrice ?? coin.price); } }).catch(() => {});

  const anchor24h = Number.isFinite(coin.price) && Number.isFinite(coin.change24h) && coin.change24h !== -100
    ? coin.price / (1 + coin.change24h / 100)
    : null;
  let lo24 = Number.isFinite(coin.low24h) ? coin.low24h : null;
  let hi24 = Number.isFinite(coin.high24h) ? coin.high24h : null;

  function setPrice(p) {
    if (p === null || p === undefined) return;
    st.lastPrice = p;
    const node = $('#px', el);
    if (!node) return;
    const text = money(p, { dp: st.dp });
    node.textContent = text;
    document.title = `${coin.symbol} ${text} · بی‌تی‌سی`;

    const chg = $('#pxChg', el);
    if (chg && anchor24h) chg.innerHTML = changeHtml((p / anchor24h - 1) * 100);
    const rng = $('#range24', el);
    if (rng && lo24 !== null && hi24 !== null) {
      if (p < lo24) lo24 = p;
      if (p > hi24) hi24 = p;
      rng.textContent = `${usd(lo24)} – ${usd(hi24)}`;
    }
  }

  const mtfCache = {};
  async function updateSignal() {
    if (!st.candles.length) return;
    const sig = generateSignal(st.candles, { interval: st.interval });
    st.signal = sig;
    mtfCache[st.interval] = sig;
    await Promise.all(['15m', '1h', '4h', '1d'].filter((iv) => !mtfCache[iv]).map(async (iv) => {
      try { const r = await getCandles(coin, iv, 300); mtfCache[iv] = generateSignal(r.candles, { interval: iv }); } catch { /* skip */ }
    }));
    if (st.disposed) return;
    remember(coin.symbol, st.interval, { signal: sig });
    drawSignal(sig, confluence(mtfCache));
    if (sig.ok) {
      const lv = [];
      sig.levels.resistances.slice(0, 2).forEach((p, i) => lv.push({ price: p, label: i ? '' : 'مقاومت', color: cssVar('--down') }));
      sig.levels.supports.slice(0, 2).forEach((p, i) => lv.push({ price: p, label: i ? '' : 'حمایت', color: cssVar('--up') }));
      if (sig.plan) lv.push({ price: sig.plan.stopLoss, label: 'حد ضرر', color: cssVar('--warn') }, { price: sig.plan.takeProfits[1], label: 'هدف (TP2)', color: cssVar('--series-1') });
      chart.setLevels(lv);
    }
  }

  let aiSig = { key: '', v: null };
  function aiSignalHtml() {
    if (!st.tested) return `<div class="ai-signal fine" style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px"><b>سیگنال هوش مصنوعی</b> — ناموجود: ${esc(coin.symbol)} کندل صرافی روی این چارت ندارد (فقط کوین‌گکو یا دمو).</div>`;
    const closed = st.candles.slice(0, -1);
    const key = `${st.interval}|${closed.length}|${closed.at(-1)?.t}`;
    if (aiSig.key !== key) aiSig = { key, v: aiSignal(closed, st.interval, coin.symbol) };
    const a = aiSig.v;
    if (!a) return '';
    const m = (v) => money(v, { dp: st.dp });
    const sg = (v, unit = '%') => `${v >= 0 ? '+' : '−'}${Math.abs(+(+v).toFixed(2))}${unit}`;
    const p1 = (v) => +(+v).toFixed(1);
    const r = a.rules;
    const exitWords = `${r.trailAtr ? `حد ضرر متحرک ${r.trailAtr} ATR پایین‌تر از سقف` : `هدف`}${r.signalExitBars ? ` یا پس از ${r.signalExitBars} کندل بازگشت سیگنال` : ''}`;
    const label = { buy: 'خرید', hold: 'نگهداری', sell: 'فروش', wait: 'انتظار' }[a.action];
    const tone = { buy: 'up', hold: 'up', sell: 'down', wait: '' }[a.action];
    const what = a.action === 'buy' ? `در آخرین کندل بسته شده روی ${m(a.entry)} خرید انجام شد. حد ضرر ${m(a.stop)} (${sg(+((a.stop / a.entry - 1) * 100).toFixed(2))})؛ فروش در ${a.target ? `هدف ${m(a.target)}, ` : ''}${exitWords}.`
      : a.action === 'hold' ? `در پوزیشن: خرید در ${a.barsHeld ?? '?'} کندل پیش روی ${m(a.entry)}، ${sg(a.openPct)} سود/زیان. حد ضرر ${m(a.stop)}${a.target ? `، هدف ${m(a.target)}` : ''}.`
        : a.action === 'sell' ? `پوزیشن بسته شد (${esc(a.why)}) روی ${m(a.exit)}: ${sg(p1(a.pnlPct))} از ${m(a.entry)}.`
          : `بدون خرید فعلی: ${esc(a.why)}.`;
    const t = CHART_TESTED[st.interval];
    const x = a.record;
    const rec = !a.tested ? `این قانون روی چارت ${esc(st.interval)} تست نشده است.`
      : x ? `عملکرد خریدهای مشابه (${t.coins ?? CHART_TESTED.coins} ارز): ${x.n.toLocaleString('en-US')} خرید، ${p1(x.winPct)}٪ برد.`
        : `بازدهی تایید شده: ${sg((t.adopt ? t.own : t.standard).ret)} در هر ${t.block}.`;
    const pt = a.past;
    const day = (t) => new Date(t).toISOString().slice(0, st.interval === '1d' || st.interval === '1w' ? 10 : 16).replace('T', ' ');
    const past = pt.trades
      ? `<details class="mt"><summary class="fine" style="cursor:pointer">معاملات روی ${esc(coin.symbol)}: ${pt.trades} معامله، ${pt.wins} برد</summary>
        <div class="tbl-wrap"><table class="tbl fit fine"><thead><tr><th class="l">خرید</th><th class="l hide-p">فروش</th><th class="hide-p">ورود → خروج</th><th>نتیجه</th><th class="l">دلیل خروج</th></tr></thead><tbody>
          ${pt.recent.map((t) => `<tr><td class="l">${esc(day(t.openedAt))}<small class="show-p-block">فروش ${esc(day(t.exitAt))}</small></td><td class="l hide-p">${esc(day(t.exitAt))}</td><td class="wrap hide-p">${m(t.entry)} → ${m(t.exit)}</td><td class="${t.netPct >= 0 ? 'up' : 'down'}">${sg(t.netPct)}</td><td class="l wrap">${esc(t.why)}</td></tr>`).join('')}
        </tbody></table></div></details>`
      : `<p class="fine" style="margin:6px 0 0">هیچ معامله‌ای روی ${esc(coin.symbol)} ثبت نشد.</p>`;
    return `<div class="ai-signal" style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px">
      <div class="row spread"><b>سیگنال هوش مصنوعی · ${a.tested ? `قانون تست‌شده ${esc(st.interval)}` : `قانون تست‌نشده`}</b><span class="chip ${tone}" style="font-weight:700">${label}</span></div>
      <p style="margin:6px 0 0">${what}</p>
      <p class="fine" style="margin:6px 0 0">${rec} نتایج شبیه‌سازی‌شده با احتساب کارمزد.</p>
      <p class="fine" id="aiLive" style="margin:6px 0 0" hidden></p>
      ${past}</div>`;
  }

  let aiNote = { key: '', html: '' };
  function aiTraderHtml(sig) {
    const saved = load('traderCfg', {}) || {};
    const state = load('traderState', null);
    const lessons = load('traderLessons', []) || [];
    const chart = state?.interval || saved.interval || DEFAULT_CONFIG.interval;
    const universe = saved.universe || DEFAULT_CONFIG.universe;
    const customRules = saved.strategy === 'custom';
    const base = { ...DEFAULT_CONFIG, ...Object.fromEntries(Object.entries(saved).filter(([k]) => ['minAdx', 'maxEntryRsi', 'excluded', 'strategy', 'custom'].includes(k))) };
    const perCoin = !saved.ownRulesOff && saved.strategy !== 'custom' && chart === PER_COIN_RULES.interval ? PER_COIN_RULES.rules : null;
    const rules = rulesFor({ ...rulesForChart(base, chart, lessons), perCoin }, coin.symbol);
    const pos = state?.open?.[coin.symbol];
    const closed = st.candles.slice(0, -1);
    const longSetup = sig?.plan?.side === 'long';
    const key = JSON.stringify([chart, st.interval, closed.at(-1)?.t, !!pos, universe.includes(coin.symbol), rules, longSetup]);
    if (key === aiNote.key) return aiNote.html;
    const sym = coin.symbol;
    let status;
    if (pos) status = `پوزیشن باز روی ${sym}: خرید در ${new Date(pos.openedAt).toISOString().slice(0, 10)} با قیمت ${money(pos.entry, { dp: st.dp })}.`;
    else if (!universe.includes(sym)) status = `${sym} در لیست ارزهای ربات نیست؛ در بخش معاملات اضافه کنید.`;
    else if (st.interval !== chart) status = `ربات چارت ${chart} را معامله می‌کند؛ برای مشاهده وضعیت روی ${chart} تنظیم کنید.`;
    else if (closed.length < 220) status = 'تاریخچه کافی برای این چارت وجود ندارد.';
    else {
      const ind = computeAll(closed), i = closed.length - 1;
      const score = scoreAt(closed, ind, i).score;
      const code = entryBlocker(rules, { symbol: sym, candles: closed, ind, regime: null }, i, score);
      status = code ? `شرط خرید ربات برقرار نیست: ${blockerText(code, rules, score, { rsi: ind.rsi[i] })}.`
        : `شرط خرید ربات در آخرین کندل بسته شده برقرار است؛ در صورت داشتن وجه نقد خرید انجام می‌دهد.`;
    }
    const html = `<div class="mt" style="border-top:1px solid var(--border);padding-top:10px"><div class="row spread"><b>معامله‌گر هوش مصنوعی روی ${esc(sym)}</b><a class="fine" href="#/trader">بخش معاملات ←</a></div>
      <p class="fine" style="margin:6px 0 0">${esc(status)} فقط پول شبیه‌سازی‌شده.</p></div>`;
    aiNote = { key, html };
    return html;
  }

  const aiLiveCache = new Map();
  async function fillAiLive() {
    if (!backendEnabled() || !st.tested) return;
    const key = `${coin.symbol}:${st.interval}`;
    let stats = aiLiveCache.get(key);
    if (stats === undefined) {
      const rows = await getAiRecord({ symbol: coin.symbol, interval: st.interval, limit: 2000 }).catch(() => null);
      stats = rows && rows.length ? aiRecordStats(rows)[st.interval] || null : null;
      aiLiveCache.set(key, stats);
    }
    const node = $('#aiLive', el);
    if (!node || !stats || `${coin.symbol}:${st.interval}` !== key) return;
    const day = new Date(stats.since).toISOString().slice(0, 10);
    node.innerHTML = `<b>وضعیت زنده روی سرور</b> از ${esc(day)}: ${stats.logged} کندل ثبت شد; ${stats.buys ? `قیمت پس از ${shareText(stats.buyUp, stats.buys)} خرید صعود کرد` : 'هنوز خریدی ثبت نشده'}. <a href="#/track">سوابق عملکرد ←</a>`;
    node.hidden = false;
  }

  function drawSignal(sig, conf) {
    const card = $('#signalCard', el);
    const sumCard = $('#summaryCard', el);
    if (sumCard) {
      const html = sig.ok ? summaryHtml(sig) : '';
      sumCard.innerHTML = html ? `<div class="card-h"><h3>${icon('ai', 16)} به زبان ساده · ${esc(st.interval)}</h3></div>${html.replace('<div class="summary mt">', '<div class="summary">')}` : '';
      sumCard.hidden = !html;
    }
    if (!sig.ok) { card.innerHTML = `<h3>سیگنال</h3><p class="muted">${esc(sig.reason)}</p>`; return; }
    const pos = (sig.score + 100) / 2;
    const plan = sig.plan;
    const meter = signalMeter(sig.score);
    const meterTone = meter.tone === 'up' ? 'up' : meter.tone === 'down' ? 'down' : 'flat';
    const warnings = riskWarnings({
      signal: sig, forecast: st.fcView || st.forecast, backtest: st.backtest, interval: st.interval,
      trust: directionTrustFor(st.interval, st.ledger || loadLedger()).trust,
      anomalies: st.anomalies || [],
      noEdgeTimeframe: (TESTED_ACCURACY.noEdge || []).includes(st.interval) || (['1s', '5s', '10s', '1m', '5m', '1w'].includes(st.interval)),
      noEdgeText: `در آخرین تست‌های انجام‌شده، مدل پیش‌بینی روی تایم‌فریم ${st.interval} مزیت آماری اثبات‌شده‌ای نداشته است. پیش‌بینی‌ها صرفاً جنبه نمایشی دارند.`,
    });
    card.innerHTML = `
      <div class="card-h"><h3>${icon('bolt', 16)} سیگنال معاملاتی · ${st.interval}</h3><span class="fine">کندل‌های ${INTERVAL_LABEL[st.interval]}</span></div>
      ${aiSignalHtml()}
      <div class="fine" style="margin-bottom:4px"><b>وضعیت اندیکاتورها</b> — نشان‌دهنده شرایط فعلی، نه دستور قطعی معامله</div>
      <div class="verdict">
        <div><div class="big ${sig.tone}">${sig.text}</div><div class="fine">توافق اندیکاتورها ${sig.score > 0 ? '+' : ''}${sig.score} / 100</div></div>
        <div style="flex:1"><div class="scorebar"><i style="left:${pos}%"></i></div><div class="row spread fine" style="margin-top:4px"><span>سقوط قوی</span><span>بدون روند</span><span>رشد قوی</span></div></div>
      </div>
      <div class="signal-meter mt">
        <div class="row spread"><b>مومنتوم</b><span class="chip ${meterTone}">${esc(meter.label)}</span></div>
        <div class="meter-track" style="margin-top:8px"><i class="meter-needle" style="left:${meter.pos}%"></i></div>
        <div class="meter-labels fine" style="margin-top:4px"><span>افت شدید</span><span>نزولی</span><span>خنثی</span><span>صعودی</span><span>رشد شدید</span></div>
        <p class="fine" style="margin:6px 0 0">شاخص قدرت سنتی بازار. امتیاز بالا نشان‌دهنده افراط در روند است، نه لزوماً تداوم آن.</p>
      </div>
      ${warnings.length ? `<div class="risk-list mt">${warnings.map((w) => `<div class="risk-item ${w.level}">${icon('info', 14)}<span>${esc(w.text)}</span></div>`).join('')}</div>` : ''}
      ${conf ? `<p class="combined mt">نمای کلی در تمام تایم‌فریم‌ها: <b class="${conf.tone}">${conf.text}</b> (${conf.score > 0 ? '+' : ''}${conf.score}).</p>` : ''}
      <div class="mtf mt">${['15m', '1h', '4h', '1d'].map((iv) => { const s = mtfCache[iv]; return `<div${iv === st.interval ? ' class="on"' : ''}><div class="k">${iv}</div><div class="v ${s?.ok ? s.tone : 'flat'}">${s?.ok ? s.text : '—'}</div></div>`; }).join('')}</div>
      ${plan ? `
        <h3 class="mt" style="margin-bottom:8px">${esc(plan.title)}</h3>
        <p class="fine" style="margin:0 0 8px">محاسبه‌شده بر اساس نوسان‌پذیری این چارت.</p>
        <div class="plan">
          <div><div class="k">محدوده ورود</div><div class="v">${money(plan.entryZone[0])} – ${money(plan.entryZone[1])}</div></div>
          <div><div class="k">حد ضرر</div><div class="v down">${money(plan.stopLoss)} <span class="fine">(${plan.riskPct}%)</span></div></div>
          <div><div class="k">تک‌پرافیت ۱</div><div class="v up">${money(plan.takeProfits[0])}</div></div>
          <div><div class="k">تک‌پرافیت ۲ / ۳</div><div class="v up">${money(plan.takeProfits[1])} / ${money(plan.takeProfits[2])}</div></div>
        </div>
        <ul class="reasons mt">${(plan.exits || plan.exitRules.map((text) => ({ text }))).map((r) => `<li class="s">${esc(r.text).replace('{price}', r.price != null ? money(r.price) : '')}</li>`).join('')}</ul>`
      : `<h3 class="mt" style="margin-bottom:8px">بدون معامله — منتظر تریگر بمانید</h3><ul class="reasons">${sig.waitFor.map((w) => `<li class="b">${esc(w)}</li>`).join('')}</ul>`}
      ${aiTraderHtml(sig)}
      <details class="mt"><summary class="fine" style="cursor:pointer">دلایل این سیگنال (${sig.reasons.bullish.length} صعودی · ${sig.reasons.bearish.length} نزولی)</summary>
        <ul class="reasons mt">${sig.reasons.bullish.map((r) => `<li class="b">${esc(r)}</li>`).join('')}${sig.reasons.bearish.map((r) => `<li class="s">${esc(r)}</li>`).join('')}</ul>
      </details>`;
    fillAiLive();
  }

  function summaryHtml(sig) {
    const sum = tradeSummary({
      signal: { ...sig, coinSymbol: coin.symbol },
      forecast: st.forecast?.ok ? forecastFacts(st.forecast, st.interval, directionTrustFor(st.interval, st.ledger || loadLedger()).trust) : null,
      timing: condenseTiming(st.timing),
      interval: st.interval,
      horizonText: st.forecast ? horizonText(st.interval, st.forecast.horizon) : null,
      mtf: mtfCache,
      fmt: (v) => money(v, { dp: st.dp }),
      dur: (bars) => horizonText(st.interval, bars),
    });
    if (!sum.steps.length && sum.verdict === 'NO READING') return '';
    return `
      <div class="summary mt">
        <div class="row spread">
          <span class="chip ${sum.tone === 'warn' ? 'warn' : sum.tone}"><b>${esc(sum.verdict)}</b></span>
          <span class="fine" title="${esc(sum.confidenceWhy || '')}">${esc(sum.confidence)} اطمینان</span>
        </div>
        ${sum.confidenceWhy ? `<p class="fine" style="margin:6px 0 0">${esc(sum.confidenceWhy)}</p>` : ''}
        <p class="mt" style="margin-bottom:10px">${esc(sum.headline)}</p>
        <dl class="steps">${sum.steps.map((x) => `<dt>${esc(x.label)}</dt><dd>${esc(x.text)}</dd>`).join('')}</dl>
        ${sum.caveats.map((c) => `<p class="fine" style="margin:6px 0 0">${esc(c)}</p>`).join('')}
      </div>`;
  }

  async function runAi() {
    const iv = st.interval, H = st.horizon;
    if (st.candles.length < 200) {
      $('#fcCard', el).innerHTML = `<h3>پیش‌بینی هوش مصنوعی</h3><p class="muted">حداقل به ۲۰۰ کندل تاریخچه در این تایم‌فریم نیاز است.</p>`;
      if (st.tab === 'forecast' || st.tab === 'patterns') drawTab();
      return;
    }
    let fc;
    try {
      fc = await runForecast(st.candles, { horizon: H, intervalMs: INTERVAL_MS[iv] });
    } catch (err) {
      if (st.disposed || iv !== st.interval || H !== st.horizon) return;
      st.forecast = { ok: false, reason: err?.message || 'محاسبه پیش‌بینی امکان‌پذیر نبود.' };
      st.timing = null;
      $('#fcCard', el).innerHTML = `<h3>پیش‌بینی هوش مصنوعی در دسترس نیست</h3><p class="muted">${esc(st.forecast.reason)}</p>`;
      if (st.tab === 'forecast' || st.tab === 'patterns') drawTab();
      return;
    }
    if (st.disposed || iv !== st.interval || H !== st.horizon) return;
    st.forecast = fc;
    st.timing = fc.ok ? timingOutlook(fc, { intervalMs: INTERVAL_MS[iv], interval: iv }) : null;

    try {
      let ledger = loadLedger();
      const learn = st.tested && !stable;
      if (learn) ledger = resolveDueLedger(ledger, st.candles, { symbol: coin.symbol, interval: iv });
      st.ensemble3 = threeModelEnsemble(st.candles, { ledger, horizon: H });
      if (learn) {
        if (fc.ok && Number.isFinite(fc.probUp) && fc.path?.length) {
          const e3 = st.ensemble3;
          ledger = recordForecast(ledger, {
            symbol: coin.symbol, interval: iv, price: fc.lastPrice, probUp: fc.probUp,
            horizonBars: fc.horizon, horizonAt: fc.path[fc.path.length - 1]?.t,
            families: e3?.ok ? { ...Object.fromEntries(e3.models.map((m) => [m.key, m.probUp])), blend: e3.probUp } : null,
          });
        }
        saveLedger(ledger);
      }
      st.ledger = ledger;
      st.anomalies = anomalyFlags(st.candles);
    } catch { /* skip */ }

    const cloudRec = st.tested && !stable ? (await cloudLearning().catch(() => null))?.[iv] || null : null;
    if (st.disposed || iv !== st.interval || H !== st.horizon) return;
    st.learned = st.tested && !stable ? learnFromChart({ symbol: coin.symbol, interval: iv, candles: st.candles, forecastProb: fc.ok ? fc.probUp : null, cloud: cloudRec }) : null;

    const trustNow = directionTrustFor(iv, st.ledger || loadLedger()).trust;
    if (fc.ok && st.tested && !stable) {
      const shownDir = directionReliable(iv, trustNow);
      logForecastShown({
        symbol: coin.symbol, interval: iv, price: fc.lastPrice,
        probUp: shownDir ? shownProbUp(fc.probUp, iv, trustNow) : null,
        targetPrice: shownDir ? fc.targetPrice : fc.lastPrice, horizonBars: fc.horizon,
        horizonAt: fc.path[fc.path.length - 1]?.t, modelAccuracy: fc.ensemble?.accuracy ?? null,
      });
    }
    st.fcView = fc.ok ? forecastForDisplay(fc, iv, trustNow) : fc;
    st.moveCall = fc.ok ? moveSizeCall(st.candles, fc.horizon, iv) : null;
    remember(coin.symbol, iv, { forecast: st.fcView, timing: st.timing });
    if (st.signal?.ok && !st.disposed && iv === st.interval) updateSignal();
    if (!fc.ok) { $('#fcCard', el).innerHTML = `<h3>پیش‌بینی هوش مصنوعی</h3><p class="muted">${esc(fc.reason)}</p>`; return; }
    chart.setProjection(st.fcView.path, { leanRemoved: Boolean(st.fcView.leanRemoved), seed: `${coin.symbol}:${iv}:${st.candles[st.candles.length - 1]?.t}` });
    drawForecastCard(st.fcView);
    if (st.tab === 'forecast' || st.tab === 'patterns') drawTab();
  }

  function coverage(band) {
    const x = (st.fcView || st.forecast)?.leanRemoved && FORECAST_TESTED.centred[st.interval];
    if (typeof x?.[band] === 'number') return `در ${x[band]}٪ موارد صحیح بوده است`;
    const own = TESTED_ACCURACY[band]?.[st.interval];
    const all = `${TESTED_ACCURACY.bandsAll[band]}٪ در کل تست‌ها`;
    return typeof own === 'number' ? `${own}٪ · ${all}` : all;
  }

  function rawLeanNote(fc) {
    return `پیش‌بینی خام مدل: ${(fc.probUp * 100).toFixed(1)}٪ صعودی.`;
  }

  function trustNote(t) {
    return `اعتماد اندازه‌گیری‌شده روی ${esc(st.interval)}: ${t.prior.toFixed(2)}`;
  }

  function ring(prob) {
    const r = 50, c = 2 * Math.PI * r, up = prob >= 0.5;
    if (prob === null) {
      return `<div class="prob-ring"><svg width="116" height="116" viewBox="0 0 116 116"><circle cx="58" cy="58" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="10"/></svg>
      <div class="c"><div><b class="flat">—</b><small>بدون جهت قابل اتکا</small></div></div></div>`;
    }
    return `<div class="prob-ring"><svg width="116" height="116" viewBox="0 0 116 116"><circle cx="58" cy="58" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="10"/>
      <circle cx="58" cy="58" r="${r}" fill="none" stroke="var(--${up ? 'up' : 'down'})" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(up ? prob : 1 - prob) * c} ${c}"/></svg>
      <div class="c"><div><b class="${up ? 'up' : 'down'}">${Math.round((up ? prob : 1 - prob) * 100)}%</b><small>احتمال ${up ? 'صعود' : 'نزول'}</small></div></div></div>`;
  }

  function moveCallHtml(fc) {
    const m = st.moveCall;
    if (!m) return '';
    const h = horizonText(st.interval, fc.horizon);
    if (!m.useful) return `<div class="fine">نوسان معمول ${esc(coin.symbol)} در ${esc(h)}: حدود ±${m.usualPct}٪.</div>`;
    return `<div class="fine"><b class="${m.bigger ? 'warn' : ''}">نوسان بزرگ‌تر محتمل است</b>: نوسانات فعلی ${m.ratio} برابر حالت عادی است.</div>`;
  }

  function directionTestedText() {
    const r = TESTED_ACCURACY.recheck?.[st.interval];
    if (r) return `دقت جهت در آخرین تست: ${r.hit}٪.`;
    return `جهت حرکت روی ${esc(st.interval)} تست نشده است.`;
  }

  function drawForecastCard(fc) {
    const trust = directionTrustFor(st.interval, st.ledger || loadLedger());
    const shown = shownProbUp(fc.probUp, st.interval, trust.trust);
    const reliable = directionReliable(st.interval, trust.trust);
    const dirTxt = !reliable ? '<b class="flat">بدون جهت قابل اتکا روی این تایم‌فریم</b>'
      : shown >= 0.54 ? '<b class="up">احتمال رشد</b>' : shown <= 0.46 ? '<b class="down">احتمال افت</b>' : '<b class="flat">نوسانی / نامشخص</b>';
    const e = fc.ensemble;
    const ledger = st.ledger || loadLedger();
    const ls = learningStatus(ledger);
    const spark = accuracySparkline(ledger, 50);
    const ens3 = st.ensemble3;
    const band50 = typeof TESTED_ACCURACY.band50?.[st.interval] === 'number' ? TESTED_ACCURACY.band50[st.interval] : null;
    const band80 = typeof TESTED_ACCURACY.band80?.[st.interval] === 'number' ? TESTED_ACCURACY.band80[st.interval] : null;
    const brier = typeof TESTED_ACCURACY.brier?.[st.interval] === 'number' ? TESTED_ACCURACY.brier[st.interval] : (typeof e.brier === 'number' ? e.brier : null);
    const trendCls = ls.trend === 'improving' ? 'up' : ls.trend === 'declining' ? 'down' : '';
    const tfNoEdge = (TESTED_ACCURACY.noEdge || []).includes(st.interval) || !(st.interval in (TESTED_ACCURACY.baseline || {}));
    const conf = !reliable ? 'پایین' : fc.confidence === 'High' && tfNoEdge ? 'متوسط' : fc.confidence;
    const winHtml = (w) => {
      const r = ls.windows[w];
      if (r.pct === null) return '<span class="muted">—</span>';
      const cls = r.pct >= 55 ? 'up' : r.pct < 45 ? 'down' : '';
      return `<b class="${cls}">${r.pct}%</b> <span class="fine">(${r.hits}/${r.total})</span>`;
    };
    const measuredRange = Boolean((fc.leanRemoved && FORECAST_TESTED.centred[st.interval]) || typeof TESTED_ACCURACY.band80?.[st.interval] === 'number');
    const lo90 = fc.range.p05 ?? fc.range.p10, hi90 = fc.range.p95 ?? fc.range.p90;
    const at = (v) => Math.max(0, Math.min(100, ((v - lo90) / (hi90 - lo90 || 1)) * 100));
    $('#fcCard', el).innerHTML = `
      <div class="card-h"><h3>${icon('ai', 16)} پیش‌بینی هوش مصنوعی</h3><span class="chip ${conf === 'High' ? 'up' : conf === 'Moderate' ? 'warn' : ''}">اعتماد به جهت: ${conf}</span></div>
      <div class="fc-range">
        <div class="k">${horizonText(st.interval, fc.horizon)} آینده: احتمالاً بین</div>
        <div class="v"><b>${usd(fc.range.p10)}</b> <span class="muted">و</span> <b>${usd(fc.range.p90)}</b></div>
        <div class="range-bar" role="img" aria-label="محدوده پیش‌بینی"><i style="left:${at(fc.range.p10).toFixed(1)}%;right:${(100 - at(fc.range.p90)).toFixed(1)}%"></i><i class="mid" style="left:${at(fc.range.p25).toFixed(1)}%;right:${(100 - at(fc.range.p75)).toFixed(1)}%"></i><b style="left:${at(fc.lastPrice).toFixed(1)}%" title="قیمت فعلی"></b></div>
        <div class="fine">محدوده ۸۰ درصدی: ${coverage('band80')}</div>
      </div>
      <div class="conditions">
        <span class="chip ${measuredRange ? 'up' : 'warn'}">محدوده: ${measuredRange ? 'تست‌شده' : 'تست‌نشده'}</span>
        <span class="chip ${reliable ? 'up' : 'warn'}">جهت: ${reliable ? 'تست‌شده' : 'نامطمئن'}</span>
        <span class="chip">چارت ${esc(st.interval)} · ${st.candles.length.toLocaleString('en-US')} کندل</span>
      </div>
      <div class="${reliable ? 'prob mt' : 'mt'}">${reliable ? ring(shown) : ''}
        <div class="stack" style="gap:4px">
          <div><b>${horizonText(st.interval, fc.horizon)}</b> آینده: ${dirTxt}</div>
          ${fc.leanRemoved ? `<div class="fine">نصف موارد بین <b>${usd(fc.range.p25)} – ${usd(fc.range.p75)}</b> قرار می‌گیرد</div>` : `<div class="fine">هدف ≈ <b>${usd(fc.targetPrice)}</b> (${pct(fc.expectedReturnPct)})</div>`}
          ${moveCallHtml(fc)}
          <div class="fine">${directionTestedText()}</div>
        </div>
      </div>
      <details class="mt fc-more"><summary class="fine">سوابق، مدل‌ها و جزئیات</summary>
      <div class="learning-box mt">
        <div class="row spread"><b>سوابق پیش‌بینی شما</b><span class="chip ${trendCls}">${esc(TREND_WORDS[ls.trend] || ls.trend)}</span></div>
        <div class="grid g2" style="margin-top:8px">
          <div class="stat"><span class="k">۲۰ مورد اخیر</span><span class="v" style="font-size:16px">${winHtml(20)}</span></div>
          <div class="stat"><span class="k">۵۰ مورد اخیر</span><span class="v" style="font-size:16px">${winHtml(50)}</span></div>
        </div>
      </div>
      </details>
      ${timingCardBlock()}
      <div class="row mt"><span class="fine">افق زمانی</span><div class="seg" id="hSeg">${[Math.max(3, Math.round(st.horizon / 2)), DEFAULT_HORIZON[st.interval] || 12, (DEFAULT_HORIZON[st.interval] || 12) * 2].filter((v, i, a) => a.indexOf(v) === i).map((h) => `<button data-v="${h}" class="${h === st.horizon ? 'on' : ''}">${horizonText(st.interval, h)}</button>`).join('')}</div></div>
      <div id="histLine" class="mt"></div>`;
    bindSeg($('#hSeg', el), (v) => { st.horizon = +v; $('#fcCard', el).innerHTML = `<div class="row"><span class="spinner"></span><b>آموزش مجدد برای ${horizonText(st.interval, +v)}…</b></div>`; runAi(); });
    paintHistLine();
  }

  function timingSection() {
    const t = st.timing;
    if (!t?.ok) return `<p class="fine mt">${esc(t?.reason || '')}</p>`;
    if (!t.shaped) return `<p class="fine mt">زمان‌بندی: روند حرکت مشخصی ثبت نشده است.</p>`;
    const dur = (bars) => horizonText(st.interval, bars);
    const main = t.rising ? t.peak : t.trough;
    const trust = timingTrust(st.interval);
    return `
      <h3 class="mt" style="margin-bottom:6px">مدت زمان روند و زمان برگشت</h3>
      ${trust.level === 'bad' ? `<div class="banner" style="margin:0 0 10px">${icon('info', 16)} ${esc(trust.text)}</div>` : ''}
      <div class="grid g2">
        <div><div id="tmChart"></div>
          <p class="fine">برگرفته از رفتار قیمت در الگوهای گذشته.</p></div>
        <div class="stack">
          <div class="grid g3">
            <div class="stat"><span class="k">${t.rising ? 'رشد برای' : 'ریزش برای'}</span><span class="v">${esc(dur(main.bar))}</span></div>
            <div class="stat"><span class="k">${t.rising ? 'سقف نزدیک' : 'کف نزدیک'}</span><span class="v ${t.rising ? 'up' : 'down'}">${money(main.price)}</span><span class="s fine">${pct(main.pct, 1)}</span></div>
            <div class="stat"><span class="k">برگشت پس از</span><span class="v">${esc(dur(t.turn?.bar ?? t.recover?.bar ?? t.horizonBars))}</span></div>
          </div>
          <dl class="kv">
            <dt>بهترین بازه زمانی</dt><dd>${t.hold ? `${esc(dur(t.hold.fromBar))} – ${esc(dur(t.hold.toBar))}` : '—'}</dd>
            <dt>وضعیت در انتهای افق</dt><dd class="${t.endPct >= 0 ? 'up' : 'down'}">${pct(t.endPct, 1)}</dd>
          </dl>
          <p class="fine warn">مزیت زمان‌بندی محدود است؛ همیشه حد ضرر را رعایت کنید.</p>
        </div>
      </div>`;
  }

  function drawTimingChart(body) {
    const t = st.timing;
    if (!t?.ok || !t.shaped || !$('#tmChart', body)) return;
    const lc = new LineChart($('#tmChart', body), {
      height: 260, yFormat: (v) => money(v), xFormat: (x) => shortTime(x, st.interval), tooltipX: (x) => dateTime(x),
    });
    st.charts.push(lc);
    const main = t.rising ? t.peak : t.trough;
    lc.set([
      { name: 'مسیر پیش‌بینی‌شده', color: cssVar('--accent'), width: 2.6, data: t.path.map((p) => ({ x: p.t, y: p.price })) },
      { name: t.rising ? 'سقف پیش‌بینی‌شده' : 'کف پیش‌بینی‌شده', color: cssVar(t.rising ? '--up' : '--down'), width: 0, data: [{ x: main.t, y: main.price }] },
    ], {
      bands: [{ color: cssVar('--accent'), alpha: 0.14, data: t.path.map((p) => ({ x: p.t, lo: p.lo, hi: p.hi })) }],
      divider: main.t, dividerLabel: t.rising ? 'سقف' : 'کف',
    });
  }

  function timingCardBlock() {
    const t = st.timing;
    if (!t?.ok || !t.shaped) return '';
    const dur = (bars) => horizonText(st.interval, bars);
    const main = t.rising ? t.peak : t.trough;
    const cls = t.rising ? 'up' : 'down';
    const trust = timingTrust(st.interval);
    return `
      <div class="timing-box mt">
        <div class="row spread"><b>زمان‌بندی روند</b>
          <span class="chip ${t.priceless ? '' : cls}">${t.rising ? 'سقف در' : 'کف در'} ${esc(dur(main.bar))}</span></div>
        <div class="tl mt">
          <i class="tl-bar"></i>
          <span class="tl-mark ${cls}" style="left:${(main.bar / t.horizonBars) * 100}%" title="نقطه عطف"></span>
        </div>
        <div class="row spread fine" style="margin-top:3px"><span>اکنون</span><span>${esc(dur(t.horizonBars))}</span></div>
        <p class="fine" style="margin:8px 0 0">
          ${t.rising ? `انتظار صعود تا حدود <b>${esc(dur(main.bar))}</b>، نزدیک به <b>${money(main.price)}</b> (${pct(main.pct, 1)}).` : `انتظار نزول تا حدود <b>${esc(dur(main.bar))}</b>، نزدیک به <b>${money(main.price)}</b> (${pct(main.pct, 1)}).`}
        </p>
      </div>`;
  }

  const wilson95 = (p, n) => {
    const z = 1.96, d = 1 + (z * z) / n, mid = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
    return `${Math.round((mid - half) * 100)}–${Math.round((mid + half) * 100)}%`;
  };

  async function paintHistLine() {
    const node = $('#histLine', el);
    if (!node) return;
    node.innerHTML = '<span class="fine muted">در حال بررسی سال‌های گذشته…</span>';
    let h;
    try { h = await computeHistory(st.histHorizon || 30); } catch (err) {
      node.innerHTML = `<p class="fine muted">مقایسه تاریخچه در دسترس نیست.</p>`;
      return;
    }
    if (st.disposed) return;
    const target = $('#histLine', el);
    if (!target) return;
    if (!h.ok) { target.innerHTML = `<p class="fine muted">تاریخچه روزانه کافی نیست.</p>`; return; }
    const v = h.verdict, s = h.analogs.stats[h.horizon];
    const cls = v.direction === 'UP' ? 'up' : v.direction === 'DOWN' ? 'down' : 'flat';
    target.innerHTML = `
      <div style="padding:10px;border-radius:10px;background:var(--surface-2)">
        <div class="row spread"><b>سال‌های گذشته می‌گویند</b><span class="chip ${cls === 'flat' ? '' : cls}">${v.direction === 'UP' ? 'صعودی' : v.direction === 'DOWN' ? 'نزولی' : 'مخلوط'} در ${h.horizon} روز</span></div>
        <p class="fine" style="margin:6px 0 0">${s.upCount} مورد از ${s.total} نمونه مشابه رشد کردند، میانه ${pct(s.median, 1)}.</p>
        <button class="btn sm ghost" style="margin-top:8px" id="openHist">مشاهده نمودارهای مشابه ←</button>
      </div>`;
    $('#openHist', el)?.addEventListener('click', () => {
      $$('#tabs [data-tab]', el).forEach((b) => b.classList.toggle('on', b.dataset.tab === 'history'));
      st.tab = 'history';
      drawTab();
      $('#tabs', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function runBt() {
    const iv = st.interval;
    st.backtest = await runBacktest(st.candles.slice(-1000), { interval: iv });
    if (st.disposed || iv !== st.interval) return;
    remember(coin.symbol, iv, { backtest: st.backtest });
    if (st.backtest.ok) chart.setMarkers(st.backtest.trades.flatMap((t) => [{ t: t.entryTime, side: 'buy' }, { t: t.exitTime, side: 'sell' }]).concat(st.backtest.openTrade ? [{ t: st.backtest.openTrade.entryTime, side: 'buy' }] : []));
    if (st.tab === 'backtest') drawTab();
  }

  let tabCleanup = null;
  const destroyCharts = () => { st.charts.forEach((c) => c.destroy()); st.charts = []; };
  function drawTab() {
    if (tabCleanup) { tabCleanup(); tabCleanup = null; }
    destroyCharts();
    const body = $('#tabBody', el);
    const fc = st.fcView || st.forecast;
    const accent = cssVar('--accent'), muted = cssVar('--text-muted');

    if (st.tab === 'forecast') {
      if (!fc) { body.innerHTML = `<div class="row"><span class="spinner"></span> در حال آموزش مدل‌ها…</div>`; return; }
      if (!fc.ok) { body.innerHTML = `<p class="muted">${esc(fc.reason)}</p>`; return; }
      const e = fc.ensemble;
      const trust = directionTrustFor(st.interval, st.ledger || loadLedger());
      const shown = shownProbUp(fc.probUp, st.interval, trust.trust), reliable = directionReliable(st.interval, trust.trust);
      body.innerHTML = `
        <div class="grid fc-grid">
          <div>
            <h3 style="margin-bottom:6px">پیش‌بینی مسیر قیمت · ${horizonText(st.interval, fc.horizon)} آینده</h3>
            <div id="fcChart"></div>
            <p class="fine">خط پیوسته = قیمت واقعی. نواحی رنگی = باندهای پوشش‌دهنده در تست‌ها.</p>
          </div>
          <div class="stack">
            <div class="grid g3">
              <div class="stat"><span class="k">احتمال رشد</span>${reliable
                ? `<span class="v ${shown >= 0.5 ? 'up' : 'down'}">${(shown * 100).toFixed(1)}%</span>`
                : `<span class="v flat">—</span><span class="s fine">بدون جهت قابل اتکا</span>`}</div>
              ${fc.leanRemoved
                ? `<div class="stat"><span class="k">نوسان معمول</span><span class="v">${st.moveCall ? `±${st.moveCall.usualPct}%` : '—'}</span></div>
              <div class="stat"><span class="k">نصف موارد بین</span><span class="v" style="font-size:15px">${usd(fc.range.p25)} – ${usd(fc.range.p75)}</span></div>`
                : `<div class="stat"><span class="k">تغییرات متوقع</span><span class="v ${fc.expectedReturnPct >= 0 ? 'up' : 'down'}">${pct(fc.expectedReturnPct)}</span></div>
              <div class="stat"><span class="k">هدف</span><span class="v">${usd(fc.targetPrice)}</span></div>`}
            </div>
            <div class="kv">
              <dt>محدوده ۸۰٪ در انتهای افق</dt><dd>${usd(fc.range.p10)} – ${usd(fc.range.p90)}</dd>
            </div>
          </div>
        </div>
        <h3 class="mt" style="margin-bottom:6px">مدل‌های پیش‌بینی</h3>
        <div class="tbl-wrap"><table class="tbl fit models-tbl"><thead><tr><th class="l">مدل</th><th>صعودی</th><th>دقت</th><th>وزن</th></tr></thead><tbody>
          ${fc.models.map((m) => `<tr style="cursor:default"><td class="l wrap"><b>${esc(m.name)}</b></td><td class="${m.probUp >= 0.5 ? 'up' : 'down'}">${m.probUp !== null ? (m.probUp * 100).toFixed(1) + '%' : '—'}</td>
            <td>${m.accuracy !== null ? (m.accuracy * 100).toFixed(1) + '%' : '—'}</td><td>${m.weightPct}%</td></tr>`).join('')}
        </tbody></table></div>`;
      body.insertAdjacentHTML('beforeend', timingSection());
      const lc = new LineChart($('#fcChart', body), { height: 300, yFormat: (v) => money(v), xFormat: (x) => shortTime(x, st.interval), tooltipX: (x) => dateTime(x) });
      st.charts.push(lc);
      const hist = st.candles.slice(-Math.max(60, fc.horizon * 5));
      const last = hist[hist.length - 1];
      const bandPts = [{ x: last.t, lo: last.c, hi: last.c }, ...fc.path.map((p) => ({ x: p.t, lo: p.p10, hi: p.p90 }))];
      const band50 = [{ x: last.t, lo: last.c, hi: last.c }, ...fc.path.map((p) => ({ x: p.t, lo: p.p25, hi: p.p75 }))];
      lc.set([
        { name: 'قیمت', color: cssVar('--text'), data: hist.map((c) => ({ x: c.t, y: c.c })), width: 1.8 },
        ...(fc.leanRemoved ? [] : [{ name: 'پیش‌بینی میانه', color: accent, dash: true, data: [{ x: last.t, y: last.c }, ...fc.path.map((p) => ({ x: p.t, y: p.p50 }))], width: 2.2 }]),
      ], { bands: [{ color: accent, alpha: 0.1, data: bandPts }, { color: accent, alpha: 0.2, data: band50 }], divider: last.t, dividerLabel: 'اکنون' });
      drawTimingChart(body);
      return;
    }

    if (st.tab === 'patterns') {
      if (!fc) { body.innerHTML = `<div class="row"><span class="spinner"></span> جستجوی تاریخچه برای الگوهای مشابه…</div>`; return; }
      const pat = fc.ok ? fc.patterns : null;
      if (!pat?.matches?.length) { body.innerHTML = '<p class="muted">الگوی مشابهی یافت نشد.</p>'; return; }
      const W = fc.window, top = pat.matches.slice(0, 5);
      const ups = pat.matches.filter((m) => m.futureReturnPct > 0).length;
      body.innerHTML = `
        <div class="row spread" style="margin-bottom:8px">
          <div><h3>مقایسه چارت امروز با شبیه‌ترین لحظات تاریخ ${esc(coin.symbol)}</h3>
          <p class="fine">آخرین ${W} کندل با تمام بازه‌های گذشته مقایسه شدند.</p></div>
          <div class="chip ${ups / pat.matches.length >= 0.5 ? 'up' : 'down'}">${ups} از ${pat.matches.length} مورد صعود کردند</div>
        </div>
        <div id="patChart"></div>
        <div class="match-list mt">${pat.matches.map((m, i) => `<div style="border-left:3px solid ${i < 5 ? `var(${SERIES[i]})` : 'var(--border)'}">
          <div><b>${dateTime(m.startTime, st.interval !== '1d' && st.interval !== '1w')}</b></div>
          <div class="muted">${(m.similarity * 100).toFixed(0)}٪ مشابه</div>
          <div>نتیجه: <b class="${m.futureReturnPct >= 0 ? 'up' : 'down'}">${pct(m.futureReturnPct)}</b></div></div>`).join('')}</div>`;
      const lc = new LineChart($('#patChart', body), { height: 320, yFormat: (v) => v.toFixed(1), xFormat: (x) => { const k = Math.round(x) - (W - 1); return k === 0 ? 'اکنون' : k < 0 ? `${k}` : `+${k}`; } });
      st.charts.push(lc);
      lc.set([
        ...top.map((m, i) => ({ name: `${dateTime(m.startTime, false)} (${(m.similarity * 100).toFixed(0)}%)`, color: cssVar(SERIES[i]), alpha: 0.75, width: 1.5, data: m.series.map((v, k) => ({ x: k, y: v })) })),
        { name: `اکنون · ${coin.symbol}`, color: cssVar('--text'), width: 3, data: pat.currentSeries.map((v, k) => ({ x: k, y: v })) },
        fc.ok && { name: 'پیش‌بینی هوش مصنوعی', color: accent, dash: true, width: 2.4, data: [{ x: W - 1, y: 100 }, ...fc.path.map((p, k) => ({ x: W + k, y: (p.p50 / fc.lastPrice) * 100 }))] },
      ].filter(Boolean), { divider: W - 1, dividerLabel: 'اکنون' });
      return;
    }

    if (st.tab === 'news') {
      body.innerHTML = `<div id="newsBody">${skeleton(6, 22)}</div>`;
      (async () => {
        if (!backendEnabled()) { $('#newsBody', body).innerHTML = '<p class="muted">بخش اخبار فعال نیست.</p>'; return; }
        const rows = await getNews({ coin: coin.symbol, limit: 30 }).catch(() => []);
        if (st.tab !== 'news' || st.disposed) return;
        st.news = rows;
        $('#newsBody', body).innerHTML = rows.length ? `
          <p class="fine" style="margin-bottom:10px">${rows.length} خبر مرتبط با <b>${esc(coin.symbol)}</b>:</p>
          <div class="news-list">${rows.map((r) => `
            <article class="news-item">
              ${safeUrl(r.image) ? `<img src="${esc(safeUrl(r.image))}" alt="" width="92" height="64" loading="lazy" style="width:92px;height:64px;object-fit:cover;border-radius:10px;flex:none">` : ''}
              <div style="min-width:0">
                <a class="ttl" href="${esc(safeUrl(r.link, '#/news'))}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>
                ${r.summary ? `<p class="fine" style="margin:4px 0 0">${esc(r.summary.slice(0, 180))}</p>` : ''}
                <div class="meta"><b>${esc(r.source)}</b><span>${ago(new Date(r.published_at).getTime())}</span></div>
              </div>
            </article>`).join('')}</div>`
          : `<div class="empty">${icon('info', 20)}<p>خبر جدیدی یافت نشد.</p><a class="btn sm" href="#/news">همه اخبار رمزارزها</a></div>`;
        $$('#newsBody img', body).forEach((img) => img.addEventListener('error', () => img.remove()));
      })();
      return;
    }

    if (st.tab === 'history') {
      drawHistoryTab(body);
      return;
    }

    if (st.tab === 'periods') {
      body.innerHTML = `<div class="row spread" style="margin-bottom:8px"><div><h3>مقایسه دوره فعلی با گذشته</h3><p class="fine">عملکرد دوره اخیر در مقایسه با دوره‌های قبل.</p></div>
        <div class="seg" id="perSeg"><button data-v="7">۷ روزه</button><button data-v="30" class="on">۳۰ روزه</button><button data-v="90">۹۰ روزه</button><button data-v="365">۱ ساله</button></div></div>
        <div id="perChart">${skeleton(6)}</div><div id="perStats" class="grid g4 mt"></div>`;
      const drawPeriods = async (days) => {
        let daily;
        try { daily = (await getCandles(coin, '1d', 1100)).candles; } catch { body.querySelector('#perChart').innerHTML = errorBox('تاریخچه روزانه در دسترس نیست'); return; }
        if (st.disposed || st.tab !== 'periods') return;
        const n = daily.length;
        const seg = (endIdx) => (endIdx - days < 0 ? null : daily.slice(endIdx - days, endIdx + 1));
        const periods = [
          ['اخرین', seg(n - 1), '--text'], ['دوره قبل', seg(n - 1 - days), '--series-1'],
          ['یک سال پیش', seg(n - 1 - 365), '--series-2'], ['دو سال پیش', seg(n - 1 - 730), '--series-7'],
        ].filter(([, s]) => s && s.length === days + 1);
        destroyCharts();
        $('#perChart', body).innerHTML = '';
        const lc = new LineChart($('#perChart', body), { height: 320, yFormat: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, xFormat: (x) => `روز ${Math.round(x)}`, zeroLine: 0 });
        st.charts.push(lc);
        lc.set(periods.map(([name, s, c]) => ({ name: `${name} (${dateTime(s[0].t, false)})`, color: cssVar(c), width: name === 'اخرین' ? 3 : 1.8, data: s.map((d, k) => ({ x: k, y: (d.c / s[0].c - 1) * 100 })) })));
        $('#perStats', body).innerHTML = periods.map(([name, s]) => {
          const ret = (s[s.length - 1].c / s[0].c - 1) * 100;
          return `<div class="stat"><span class="k">${name}</span><span class="v ${ret >= 0 ? 'up' : 'down'}">${pct(ret)}</span></div>`;
        }).join('');
      };
      bindSeg($('#perSeg', body), (v) => drawPeriods(+v));
      drawPeriods(30);
      return;
    }

    if (st.tab === 'backtest') {
      const bt = st.backtest;
      if (!bt) { body.innerHTML = `<div class="row"><span class="spinner"></span> در حال اجرای بک‌تست…</div>`; return; }
      if (!bt.ok) { body.innerHTML = `<p class="muted">${esc(bt.reason)}</p>`; return; }
      body.innerHTML = `
        <p class="fine" style="margin-bottom:10px">نتیجه شبیه‌سازی استراتژی روی آخرین ${bt.bars} کندل ${esc(st.interval)}.</p>
        <div class="grid g4">
          <div class="stat"><span class="k">بازده استراتژی</span><span class="v ${bt.totalReturnPct >= 0 ? 'up' : 'down'}">${pct(bt.totalReturnPct)}</span></div>
          <div class="stat"><span class="k">خرید و نگهداری</span><span class="v ${bt.buyHoldPct >= 0 ? 'up' : 'down'}">${pct(bt.buyHoldPct)}</span></div>
          <div class="stat"><span class="k">نرخ برد</span><span class="v">${bt.winRate ?? '—'}%</span><span class="s muted">${bt.tradeCount} معامله</span></div>
          <div class="stat"><span class="k">حداکثر افت سرمایه</span><span class="v ${bt.maxDrawdownPct > 0 ? 'down' : 'flat'}">${pct(-bt.maxDrawdownPct)}</span></div>
        </div>
        <div id="btChart" class="mt"></div>`;
      const lc = new LineChart($('#btChart', body), { height: 260, yFormat: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`, xFormat: (x) => shortTime(x, st.interval), tooltipX: (x) => dateTime(x), zeroLine: 0 });
      st.charts.push(lc);
      const base = st.candles.slice(-1000);
      const startIdx = base.findIndex((c) => c.t === bt.from);
      lc.set([
        { name: 'استراتژی سیگنال', color: accent, width: 2.2, data: bt.curve.map((p) => ({ x: p.t, y: (p.v - 1) * 100 })) },
        { name: 'خرید و نگهداری', color: muted, width: 1.6, data: base.slice(startIdx).map((c) => ({ x: c.t, y: (c.c / base[startIdx].c - 1) * 100 })) },
      ]);
      return;
    }

    if (st.tab === 'book') {
      body.innerHTML = `<div class="grid g2"><div><h3 style="margin-bottom:8px">دفتر سفارشات</h3><div id="book">${skeleton(10, 14)}</div></div><div><h3 style="margin-bottom:8px">معاملات اخیر</h3><div id="trades">${skeleton(10, 14)}</div></div></div>`;
      const drawBook = async () => {
        const [d, tr] = await Promise.all([getDepth(pair, 15), getTrades(pair, 20)]);
        if (st.tab !== 'book' || st.disposed) return;
        if (d) {
          const maxQ = Math.max(...d.bids.map((b) => b[1] * b[0]), ...d.asks.map((a) => a[1] * a[0]));
          const row = (p, q, side) => `<div class="book-row"><i style="width:${((p * q) / maxQ) * 100}%;background:var(--${side})"></i><span class="${side}">${money(p)}</span><span>${amount(q)}</span></div>`;
          $('#book', body).innerHTML = `<div class="book"><div><div class="row spread fine"><span>خرید (Bid)</span><span>مقدار</span></div>${d.bids.map(([p, q]) => row(p, q, 'up')).join('')}</div>
            <div><div class="row spread fine"><span>فروش (Ask)</span><span>مقدار</span></div>${d.asks.map(([p, q]) => row(p, q, 'down')).join('')}</div></div>`;
        }
        if (tr) $('#trades', body).innerHTML = `<div class="book-row fine"><span>قیمت</span><span>مقدار</span><span>زمان</span></div>${tr.map((t) => `<div class="book-row"><span class="${t.buyerMaker ? 'down' : 'up'}">${money(t.price)}</span><span>${amount(t.qty)}</span><span class="muted">${new Date(t.time).toLocaleTimeString('en-US', { hour12: false })}</span></div>`).join('')}`;
      };
      drawBook();
      const iv = setInterval(drawBook, 3000);
      tabCleanup = () => clearInterval(iv);
      return;
    }

    if (st.tab === 'exchanges') {
      body.innerHTML = `<div id="exBody">${skeleton(8, 22)}</div>`;
      const drawEx = async () => {
        const r = await compareExchanges(coin.symbol);
        if (st.tab !== 'exchanges' || st.disposed) return;
        const rows = r.rows.filter((x) => x.ok).sort((a, b) => (b.vol || 0) - (a.vol || 0));
        $('#exBody', body).innerHTML = rows.length ? `
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">صرافی</th><th class="l">جفت ارز</th><th>قیمت</th><th>vs میانه</th><th>اسپرد</th><th>۲۴ساعت</th><th>حجم ۲۴ساعته</th></tr></thead><tbody>
          ${rows.map((q) => `<tr style="cursor:default"><td class="l"><b>${esc(q.exchange)}</b></td><td class="l muted">${esc(q.pair)}</td><td>${usd(q.price)}</td><td class="${q.deviationPct >= 0 ? 'up' : 'down'}">${pct(q.deviationPct, 3)}</td><td>${pct(q.spreadPct, 3, false)}</td><td>${changeHtml(q.change24h)}</td><td>${compact(q.vol)}</td></tr>`).join('')}
          </tbody></table></div>` : errorBox('هیچ صرافی قیمتی برای این ارز برنگرداند.');
      };
      drawEx();
      const iv = setInterval(drawEx, 10000);
      tabCleanup = () => clearInterval(iv);
      return;
    }

    if (st.tab === 'about') {
      body.innerHTML = skeleton(4);
      getCoinProfile(coin).then((p) => {
        if (st.tab !== 'about' || st.disposed) return;
        const loaded = !!p && !p.unavailable;
        const unknown = loaded ? '—' : '<span class="muted">بارگذاری نشده</span>';
        body.innerHTML = `<div class="grid g2">
          <div><h3 style="margin-bottom:8px">درباره ${esc(coin.name)}</h3><p class="muted" style="line-height:1.6">${esc(p?.description || (loaded ? 'توضیحاتی موجود نیست.' : ''))}</p></div>
          <dl class="kv">
            <dt>عرضه در گردش</dt><dd>${compact(coin.circulatingSupply, '')} ${esc(coin.symbol)}</dd>
            <dt>کل عرضه</dt><dd>${p?.totalSupply ? compact(p.totalSupply, '') : unknown}</dd>
            <dt>حداکثر عرضه</dt><dd>${p?.maxSupply ? compact(p.maxSupply, '') : loaded ? 'بدون سقف' : unknown}</dd>
            <dt>ارزش کاملاً رقیق‌شده (FDV)</dt><dd>${p?.fdv ? compact(p.fdv) : unknown}</dd>
            <dt>سقف تاریخی</dt><dd>${usd(coin.ath)}</dd>
          </dl></div>`;
      });
    }
  }

  async function getDaily() {
    if (st.daily) return st.daily;
    const r = await getCandles(coin, '1d', 2000);
    st.daily = r.candles;
    return st.daily;
  }

  async function computeHistory(horizon) {
    const key = `h${horizon}`;
    if (st.histCache?.[key]) return st.histCache[key];
    const daily = await getDaily();
    const h = await runHistory(daily, { window: 45, horizons: [7, 30, 90], horizon });
    st.histCache = { ...(st.histCache || {}), [key]: h };
    remember(coin.symbol, st.interval, { history: h });
    return h;
  }

  async function drawHistoryTab(body, horizon = st.histHorizon || 30) {
    st.histHorizon = horizon;
    destroyCharts();
    body.innerHTML = `<div class="row"><span class="spinner"></span> در حال جستجوی تاریخچه ${esc(coin.symbol)}…</div>`;
    let h;
    try { h = await computeHistory(horizon); } catch (e) { body.innerHTML = errorBox(e.message); return; }
    if (st.disposed || st.tab !== 'history') return;

    const hzSeg = `<div class="seg" id="hzSeg">${[7, 30, 90].map((d) => `<button data-v="${d}" class="${d === horizon ? 'on' : ''}">${d} روزه</button>`).join('')}</div>`;

    if (!h.ok) {
      body.innerHTML = `<div class="row spread" style="margin-bottom:10px"><h3>تاریخچه و چرخه‌ها</h3>${hzSeg}</div>
        <p class="muted">${esc(h.reason || 'تاریخچه روزانه کافی موجود نیست.')}</p>`;
      bindSeg($('#hzSeg', body), (v) => drawHistoryTab(body, +v));
      return;
    }

    const v = h.verdict, s = h.analogs.stats[horizon], a = h.analogs;
    const dirClass = v.direction === 'UP' ? 'up' : v.direction === 'DOWN' ? 'down' : 'flat';
    const dirWord = v.direction === 'UP' ? 'تاریخچه → صعودی' : v.direction === 'DOWN' ? 'تاریخچه → نزولی' : 'تاریخچه → مخلوط';
    const reliable = v.accuracy !== null;
    const yrs = (h.years || []).filter((y) => y.points.length > 20);

    body.innerHTML = `
      <div class="row spread" style="margin-bottom:10px">
        <div><h3>رفتار مشابه در تاریخچه ${esc(coin.symbol)}</h3>
        <p class="fine">آخرین <b>${h.window} روز</b> با سوابق گذشته مقایسه شد.</p></div>
        ${hzSeg}
      </div>
      <div class="hist-verdict">
        <div><div class="dir ${dirClass}">${dirWord}</div><div class="fine">${Math.round(v.probUp * 100)}٪ موارد مشابه صعود کردند</div></div>
        <div style="flex:1;min-width:200px">
          <div class="meter"><i style="width:${Math.round(v.probUp * 100)}%;background:var(--${v.probUp >= 0.5 ? 'up' : 'down'})"></i></div>
          <div class="row spread fine" style="margin-top:4px"><span>${s.upCount} صعود</span><span>${s.total - s.upCount} نزول</span></div>
        </div>
      </div>
      <div id="analogChart" class="mt"></div>`;

    bindSeg($('#hzSeg', body), (val) => drawHistoryTab(body, +val));

    const W = h.window, maxH = Math.max(...h.horizons);
    const lc = new LineChart($('#analogChart', body), {
      height: 340, yFormat: (val) => val.toFixed(0),
      xFormat: (x) => { const k = Math.round(x) - (W - 1); return k === 0 ? 'مطبق' : `${k > 0 ? '+' : ''}${k} روز`; },
    });
    st.charts.push(lc);
    lc.set([
      ...a.matches.slice(0, 5).map((m, i) => ({
        name: `${dateTime(m.endTime, false)} (${(m.similarity * 100).toFixed(0)}٪)`,
        color: cssVar(SERIES[i]), alpha: 0.8, width: 1.6,
        data: m.series.map((val, k) => ({ x: k, y: val })),
      })),
      { name: `امروز · ${coin.symbol}`, color: cssVar('--text'), width: 3.2, data: a.current.map((val, k) => ({ x: k, y: val })) },
    ], { divider: W - 1, dividerLabel: 'امروز' });
  }

  bindTabs($('#tabs', el), (t) => { st.tab = t; drawTab(); });
  bindSeg($('#ivSeg', el), (iv) => {
    st.interval = iv; st.horizon = DEFAULT_HORIZON[iv] || 12;
    settings.set({ interval: iv });
    loadInterval().then(drawTab);
  });

  await loadInterval();
  drawTab();

  return () => {
    st.disposed = true;
    if (liveUnsub) liveUnsub();
    if (tabCleanup) tabCleanup();
    clearInterval(signalTimer);
    destroyCharts();
    chart.destroy();
    window.removeEventListener('cv:theme', onTheme);
  };
}

function shortTime(t, interval) {
  const d = new Date(t);
  if (['1d', '1w', '4h'].includes(interval)) return d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
  return d.toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

async function notFound(sym, retry) {
  if (dataStatus.demo) return errorBox(`داده‌های زنده بازار در دسترس نیستند، لذا امکان جستجوی "${sym}" وجود ندارد.`, retry);
  const list = await markets().catch(() => []);
  const q = sym.toLowerCase();
  const near = list.filter((c) => c.symbol.toLowerCase().startsWith(q.slice(0, 2)) || (c.name || '').toLowerCase().includes(q)).slice(0, 6);
  return `<div class="card empty"><h1 style="font-size:1.3rem">ارزی با نام "${esc(sym)}" یافت نشد</h1>
    <p>این ارز در میان ${list.length || 250} ارز برتر پشتیبانی‌شده نیست یا نماد آن به اشتباه وارد شده است.</p>
    ${near.length ? `<p class="fine">مواردی که شاید به دنبالش بودید:</p><p class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">${near.map((c) => `<a class="btn sm" href="#/coin/${encodeURIComponent(c.symbol)}">${esc(c.symbol)} · ${esc(c.name)}</a>`).join('')}</p>` : ''}
    <a class="btn primary" href="#/">مشاهده همه ارزها</a></div>`;
}