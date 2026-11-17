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

export const title = (p) => (p[0] || 'ارز').toUpperCase();
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SERIES = ['--series-1', '--series-2', '--series-3', '--series-5', '--series-7', '--series-4'];
// تمام بازه‌های زمانی که نمودار ارائه می‌دهد. نمودارهای ثانیه‌ای و دقیقه‌ای وجود دارند
// تا حرکت قیمت در لحظه رصد شود؛ موتور پیش‌بینی هرگز روی آن‌ها ارزیابی نشده است.
const INTERVALS = ['1s', '5s', '10s', '1m', '5m', '15m', '1h', '4h', '1d', '1w'];
// بازه‌های زمانی که موتور پیش‌بینی هرگز روی آن‌ها سنجیده نشده است — به‌جای القای دقتی که هیچ‌کس بررسی نکرده، این موضوع اعلام می‌شود.
// نمودارهایی که موتور پیش‌بینی هرگز روی آن‌ها آزمایش نشده (نمودارهای ۱ و ۵ دقیقه‌ای آزمایش شدند و امتیازی پایین‌تر از خط مبنا کسب کردند).
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

  // یک ارز متصل به قیمت ۱ دلار (استیبل‌کوین) چیزی برای پیش‌بینی ندارد: هیچ استراتژی یا ستاپی برای آن ثبت نمی‌شود.
  const stable = isStable(coin.symbol);

  el.innerHTML = `
    <div class="coin-head">
      ${coinLogo(coin, 44)}
      <div>
        <div class="row"><h1>${esc(coin.name)}</h1><span class="chip">${esc(coin.symbol)}</span>${coin.rank ? `<span class="chip">#${coin.rank}</span>` : ''}
          <button class="star ${watchlist.has(coin.symbol) ? 'on' : ''}" id="star" aria-pressed="${watchlist.has(coin.symbol)}" aria-label="${watchlist.has(coin.symbol) ? 'حذف از فهرست پیگیری' : 'افزودن به فهرست پیگیری'}">${icon('star', 20)}</button></div>
        <div class="row"><span class="price num" id="px">${money(coin.price)}</span><span id="pxChg" style="font-size:16px">${changeHtml(coin.change24h)}</span><span class="chip" id="srcChip">…</span></div>
      </div>
      <div class="row" style="margin-left:auto">
        <a class="btn" href="#/alerts/${esc(coin.symbol)}">${icon('alerts', 16)} هشدار</a>
        ${tradable(coin.symbol) ? `<button class="btn" id="tradeBtn">${icon('exchanges', 16)} معامله</button>` : ''}
        <a class="btn primary" id="askAi" href="#/ai/${esc(coin.symbol)}">${icon('ai', 16)} پرسش از هوش مصنوعی درباره ${esc(coin.symbol)}</a>
      </div>
    </div>
    ${stable ? `<div class="card" style="border-color:var(--warn);margin-bottom:14px"><p style="margin:0"><b>${esc(coin.symbol)} یک استیبل‌کوین است</b> که برای حفظ ارزش ۱ دلاری طراحی شده است. پیش‌بینی‌ها و ستاپ‌های خرید یا فروش برای آن معنایی ندارند، بنابراین اطلاعات زیر صرفاً جنبه مرجع داشته و هیچ‌چیز از این صفحه در سابقه پیش‌بینی شما یا بخش یادگیری هوش مصنوعی ثبت نمی‌شود.</p></div>` : ''}
    <div class="grid g4" style="margin-bottom:14px">
      <div class="card stat"><span class="k">ارزش بازار</span><span class="v">${compact(coin.marketCap)}</span></div>
      <div class="card stat"><span class="k">حجم معاملات ۲۴ ساعت</span><span class="v">${compact(coin.volume24h)}</span></div>
      <div class="card stat"><span class="k">محدوده ۲۴ ساعت</span><span class="v" id="range24" style="font-size:16px">${coin.low24h ? `${usd(coin.low24h)} – ${usd(coin.high24h)}` : '—'}</span></div>
      <div class="card stat"><span class="k">بالاترین قیمت تاریخی</span><span class="v">${usd(coin.ath)}</span><span class="s muted">${coin.ath ? `${pct((coin.price / coin.ath - 1) * 100, 1)} تا سقف تاریخی` : ''}</span></div>
    </div>
    <div class="coin-layout">
      <div class="stack c-chart">
        <div class="card chart-card">
          <div class="chart-tools">
            <div class="seg scroll-x" id="ivSeg">${INTERVALS.map((iv) => `<button data-v="${iv}" class="${iv === st.interval ? 'on' : ''}" title="کندل‌های ${esc(INTERVAL_LABEL[iv] || iv)}">${iv}</button>`).join('')}</div>
            <button class="btn sm ghost only-s" id="indBtn" aria-expanded="false">${icon('chart', 14)} اندیکاتورها</button>
            <button class="btn sm ghost" id="drawBtn" aria-expanded="false">${icon('compare', 14)} ترسیم</button>
            <div class="toggles" id="toggles"></div>
          </div>
          <div class="draw-tools" id="drawTools" hidden>
            <div class="seg" id="toolSeg">
              <button data-tool="" class="on">خاموش</button>
              <button data-tool="trend">خط روند</button>
              <button data-tool="hline">افقی</button>
              <button data-tool="fib">فیبوناچی</button>
              <button data-tool="erase">پاک کردن</button>
            </div>
            <button class="btn sm ghost" id="clearDraw">پاک کردن همه</button>
            <span class="fine" id="drawHint">برای رسم خط روند، دو نقطه روی نمودار لمس کنید.</span>
          </div>
          <div class="chart-box" id="chart"></div>
          <p class="fine" style="margin:6px 4px 0">برای بزرگنمایی اسکرول کنید یا دو انگشتی بکشید · برای جابجایی بکشید · برای بازنشانی دو بار کلیک کنید. بادبزن طلایی = محدوده قیمتی پیش‌بینی (داخلی: نیمی از نتایج در آزمایش‌ها، خارجی: ۸۰٪)؛ خطوط نازک = مسیرهای احتمالی با این گستردگی، نه پیش‌بینی قطعی.</p>
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
        <button data-tab="periods">مقایسه دوره‌ها</button>
        <button data-tab="backtest">آزمایش گذشته (Backtest)</button>
        ${pair ? '<button data-tab="book">دفتر سفارش (Order Book)</button>' : ''}
        <button data-tab="exchanges">صرافی‌ها</button>
        <button data-tab="about">درباره</button>
      </div>
      <div id="tabBody"></div>
      </div>
    </div>`;

  // تیترها در کنار نمودار قرار می‌گیرند، نه مدفون در یک تب — چند خبر جدیدتر به همراه لیست کامل با یک کلیک فاصله.
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
      <p class="fine">فقط پس‌زمینه — مدل قیمت، داده‌های قیمتی را می‌خواند، نه تیتر اخبار را.</p>`;
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
    // برچسب صرف نظر از وضعیت قبلی، همیشه روی "افزودن به فهرست پیگیری" قفل بود
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'حذف از فهرست پیگیری' : 'افزودن به فهرست پیگیری');
  });

  // انتقال به صرافی. پلتفرم BTCS هرگز خود1 سفارش را ثبت نمی‌کند.
  $('#tradeBtn', el)?.addEventListener('click', () => {
    const venues = venuesFor(coin.symbol);
    const sig = st.signal;
    logActivity('trade_link', coin.symbol);
    modal(`<h3>معامله ${esc(coin.symbol)}</h3>
      <p class="fine">صرافی‌ای را که از قبل در آن حساب دارید انتخاب کنید. جفت ارز مستقیماً در وب‌سایت آن‌ها آماده معامله باز خواهد شد.</p>
      ${sig?.ok && sig.plan ? `<div class="plan mt">
        <div><div class="k">سیگنال اعلام می‌کند</div><div class="v ${sig.tone}">${esc(sig.text)}</div></div>
        <div><div class="k">حد ضرر پیشنهادی</div><div class="v down">${money(sig.plan.stopLoss)}</div></div>
      </div><p class="fine" style="margin-top:8px">به محض تکمیل سفارش، حد ضرر را در صرافی تنظیم کنید.</p>` : ''}
      <div class="sheet-grid mt">
        ${venues.map((v) => `<a class="sheet-item" href="${esc(safeUrl(v.href, '#/exchanges'))}" target="_blank" rel="noopener noreferrer">${icon('exchanges', 18)}<span>${esc(v.name)}<br><small class="fine">${esc(v.pair)}</small></span></a>`).join('')}
      </div>
      <p class="fine mt">${esc(TRADE_DISCLAIMER)}</p>

      <h3 class="mt">ابتدا با معامله آزمایشی (Demo) امتحان کنید</h3>
      <p class="fine">با پول شبیه‌سازی‌شده و قیمت زنده، ${esc(coin.symbol)} را خودتان معامله کنید. این حساب آزمایشی اختصاصی شماست که جدا از حساب معامله‌گر هوش مصنوعی نگهداری می‌شود. بدون صرافی، بدون سفارش واقعی و بدون کلید خصوصی.</p>
      <div id="paperWrap">${paperBlock()}</div>`);
    wirePaper();
  });

  // ---------------------------------------------------------- معاملات آزمایشی (Demo)
  // حساب معامله‌گر هوش مصنوعی را به اشتراک می‌گذارد تا یک موجودی کل ماجرا را روایت کند.
  // معاملات آزمایشی شخصی شما جدا از حساب معامله‌گر هوش مصنوعی نگهداری می‌شوند،
  // تا آزمایش‌های دستی یک فرد، سوابقی که استراتژی بر اساس آن سنجیده می‌شود را مخدوش نکند.
  // همان قوانین شبیه‌سازی‌شده، همان قیمت‌های زنده، اما موجودی جداگانه.
  const PAPER_CFG = 'traderCfg';
  const PAPER_STATE = 'myDemoState';
  // وضعیت نمودار در لحظه خرید آزمایشی (روند، شاخص ADX، اندیکاتور RSI)،
  // تا بخش یادگیری هوش مصنوعی بتواند خریدهای شخصی شما را دقیقاً مثل خریدهای هوش مصنوعی ارزیابی کند.
  const buyContext = () => {
    try {
      const c = st.candles.slice(0, -1); if (c.length < 210) return null;
      const ind = computeAll(c), i = c.length - 1;
      return { trendUp: !!(ind.ema200[i] && c[i].c > ind.ema200[i]), adx: ind.adx.adx[i] === null ? null : +ind.adx.adx[i].toFixed(1), rsi: ind.rsi[i] === null ? null : +ind.rsi[i].toFixed(1) };
    } catch { return null; }
  };
  const paperCfg = () => ({ ...DEFAULT_CONFIG, ...load(PAPER_CFG, {}) });
  // قیمت‌های آزمایشی ساختگی هستند؛ معامله با چنین قیمتی در حساب (و همگام‌سازی شده با هر دستگاه)
  // به گونه‌ای ثبت می‌شود که گویی روی قیمت واقعی انجام شده است.
  const onDemoPrices = () => st.source === 'demo' || (!st.source && coin.source === 'demo');
  const DEMO_PRICE_MSG = 'در حال حاضر قیمت‌های زنده بارگیری نمی‌شوند، بنابراین صفحه داده‌های آزمایشی را نمایش می‌دهد. معاملات آزمایشی نیازمند قیمت واقعی هستند — لطفاً پس از بازگشت قیمت‌های زنده دوباره تلاش کنید.';
  const paperState = () => load(PAPER_STATE, null) || newState(paperCfg());

  function paperBlock() {
    const cfg = paperCfg();
    const state = paperState();
    const pos = state.open[coin.symbol];
    const px = st.lastPrice ?? coin.price;
    const bal = equity(state, { [coin.symbol]: px });
    // با واحد پول بازدیدکننده، مشابه کادری که آن را پر می‌کند (پیش‌تر یک عدد دلاری به عنوان روپیه نشان داده می‌شد،
    // به همین دلیل پیشنهاد صرافی به اندازه نرخ تبدیل ارز خطا داشت)
    const suggested = Math.max(1, Math.round(state.balance * 0.1 * (fx.rate || 1)));
    // حد ضرر طرح سمت فروش بالاتر از قیمت قرار دارد، که خرید آزمایشی نمی‌تواند از آن استفاده کند.
    const planStop = st.signal?.ok && st.signal.plan && st.signal.plan.side !== 'short' && st.signal.plan.stopLoss < px ? st.signal.plan.stopLoss : null;
    if (pos) {
      const pnl = (px - pos.entry) * pos.qty;
      return `<div class="plan mt">
        <div><div class="k">موقعیت آزمایشی شما</div><div class="v">${amount(pos.qty)} ${esc(coin.symbol)}</div></div>
        <div><div class="k">قیمت خرید</div><div class="v">${money(pos.entry, { dp: st.dp })}</div></div>
        <div><div class="k">سود / زیان باز</div><div class="v ${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl))}</div></div>
        <div><div class="k">موجودی آزمایشی</div><div class="v">${money(bal)}</div></div>
      </div>
      <div class="row mt" style="gap:8px"><button class="btn primary" id="paperClose">فروش (آزمایشی)</button><a class="btn sm ghost" href="#/trader">مشاهده تمام معاملات آزمایشی من</a></div>
      <p class="fine" id="paperMsg"></p>
      <p class="fine">${esc(DEMO_NOTICE)}</p>`;
    }
    return `<form class="row mt" style="gap:8px;align-items:flex-end" id="paperForm">
        <label class="fld" style="flex:1">مبلغ سرمایه‌گذاری (${esc(fx.code)})<input class="inp" name="amt" type="number" min="1" step="1" value="${suggested}"></label>
        <button class="btn primary">خرید (آزمایشی)</button>
      </form>
      <p class="fine">موجودی آزمایشی ${money(bal)}. ${planStop !== null ? `یک حد ضرر در قیمت ${money(planStop, { dp: st.dp })} مطابق با سیگنال برای شما تنظیم شده است.` : 'یک حد ضرر ۵ درصدی برای شما تنظیم شده است.'}</p>
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
      // کادر بر اساس واحد پول بازدیدکننده است؛ اما حساب کاربری به دلار نگهداری می‌شود.
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
      toast(`خرید آزمایشی روی ${coin.symbol} ثبت شد. هیچ سفارش واقعی ارسال نشد.`, 'up');
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

  // ------------------------------------------------------------ نمودار
  const chart = new CandleChart($('#chart', el), {});
  const TOGGLES = [['ema20', 'EMA 20', '--series-1'], ['ema50', 'EMA 50', '--series-2'], ['ema200', 'EMA 200', '--series-7'], ['bb', 'بانک‌های بولینگر'], ['vwap', 'VWAP', '--series-4'], ['ichimoku', 'ایچیموکو'], ['supertrend', 'سوپرترند', '--up'], ['keltner', 'کلتنر', '--series-5'], ['donchian', 'دونچیان', '--text-muted'], ['volume', 'حجم'], ['rsi', 'RSI'], ['macd', 'MACD'], ['levels', 'سطوح'], ['markers', 'سیگنال‌ها'], ['projection', 'پیش‌بینی', '--accent']];
  $('#toggles', el).innerHTML = TOGGLES.map(([k, label, c]) => `<button class="toggle ${chart.opts[k] ? 'on' : ''}" data-k="${k}">${c ? `<i style="background:var(${c})"></i>` : ''}${label}</button>`).join('');
  $$('#toggles .toggle', el).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.k; chart.setOptions({ [k]: !chart.opts[k] }); b.classList.toggle('on', chart.opts[k]);
  }));
  // وجود دوازده چیپ اندیکاتور روی گوشی موبایل شبیه به یک دیوار از دکمه‌هاست. در صفحه نمایش‌های باریک،
  // همه آن‌ها پشت یک دکمه واحد پنهان می‌شوند تا نمودار فضای بیشتری در اختیار داشته باشد.
  // --- ابزارهای ترسیم ----------------------------------------------------
  // ترسیم‌ها برای هر ارز و بازه زمانی به‌صورت جداگانه، بر اساس مختصات زمان/قیمت ذخیره می‌شوند
  // و از همان مکانیسم همگام‌سازی فهرست پیگیری استفاده می‌کنند تا حساب کاربر را دنبال کنند.
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
    '': 'ابزار ترسیم خاموش است — نمودار طبق روال جابجا و بزرگنمایی می‌شود.',
    trend: 'برای رسم خط روند، دو نقطه روی نمودار لمس کنید. این خط فراتر از آخرین نقطه امتداد می‌یابد.',
    hline: 'برای قرار دادن یک خط افقی در آن قیمت، یک بار لمس کنید.',
    fib: 'برای ترسیم سطوح بازگشتی فیبوناچی، یک کف نوسانی و سپس یک سقف نوسانی (یا برعکس) را لمس کنید.',
    erase: 'برای حذف هر ترسیم، آن را لمس کنید.',
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
    if (!chart.drawings.length) { toast('چیزی برای پاک کردن روی این نمودار وجود ندارد.', 'info'); return; }
    chart.clearDrawings();
    toast('ترسیم‌ها پاک شدند.', 'info');
  });

  $('#indBtn', el)?.addEventListener('click', (e) => {
    const open = el.querySelector('.chart-tools').classList.toggle('show-toggles');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  const onTheme = () => chart.draw();
  window.addEventListener('cv:theme', onTheme);

  // ------------------------------------------------------------ جریان داده‌ها
  let liveUnsub = null;
  let signalTimer = null;

  async function loadInterval() {
    const iv = st.interval;
    st.forecast = null; st.fcView = null; st.moveCall = null;
    chart.setProjection(null); chart.setMarkers([]); chart.setLevels([]);
    chart.setData([]);
    $('#signalCard', el).innerHTML = skeleton(6);
    $('#fcCard', el).innerHTML = `<div class="row"><span class="spinner"></span><b>در حال آموزش مدل‌های هوش مصنوعی بر اساس تاریخچه ${esc(coin.symbol)}…</b></div><p class="fine mt">تطبیق الگو، شبکه عصبی، درخت‌های تصمیم‌گیری گرادیان‌افززا (Gradient-boosted) و موارد دیگر در مرورگر شما اجرا می‌شوند.</p>`;
    try {
      // میانگین ۲۰۰ دوره‌ای روی کندل‌های ۵ ثانیه‌ای معادل ۱۷ دقیقه است و صرفاً
      // خطوط نویزی را روی نمودار رسم می‌کند. در آنجا پوشش‌های کند را خاموش کرده
      // و وقتی کاربر به یک بازه زمانی واقعی منتقل شد، آن‌ها را دوباره روشن می‌کنیم.
      chart.setDrawings(loadDrawings());
      const fast = isSecondInterval(iv);
      if (fast !== st.wasFast) {
        chart.setOptions({ ema200: !fast, ema50: !fast, bb: false });
        $$('#toggles .toggle', el).forEach((b) => b.classList.toggle('on', !!chart.opts[b.dataset.k]));
        st.wasFast = fast;
      }
      // اندیکاتور VWAP در هر روز UTC ریست می‌شود، بنابراین روی کندل روزانه یا هفتگی
      // عملاً همان میانگین قیمت همان کندل را تکرار می‌کند؛ دکمه تغییر وضعیت در آنجا خاموش می‌شود.
      const daily = (INTERVAL_MS[iv] || 0) >= 864e5;
      const vwapBtn = $('#toggles .toggle[data-k="vwap"]', el);
      if (vwapBtn) {
        vwapBtn.disabled = daily;
        vwapBtn.title = daily ? 'اندیکاتور VWAP در هر روز ریست می‌شود، بنابراین روی کندل‌های روزانه یا هفتگی تنها میانگین قیمت هر کندل را تکرار می‌کند.' : '';
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
        // صرافی بایننس کندل‌های ۱ ثانیه‌ای را استریم می‌کند اما بازه‌ای بین ۱ ثانیه تا ۱ دقیقه ندارد،
        // بنابراین نمودارهای ۵ و ۱۰ ثانیه‌ای استریم ۱ ثانیه‌ای را در باکتی که هنوز باز است ادغام می‌کنند.
        const streamIv = isSecondInterval(iv) ? '1s' : iv;
        const bucketMs = INTERVAL_MS[iv] || 6e4;
        // روی نمودار ثانیه‌ای، هر ثانیه یک کندل بسته می‌شود. محاسبه مجدد کل سیگنال
        // با این سرعت، گوشی را بدون دلیل داغ می‌کند، بنابراین آن را به ۵ ثانیه محدود می‌کنیم.
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
              closed = true; // باکت قبلی تازه تمام شده است
            }
          }
          chart.update(c);
          st.candles = chart.candles;
          setPrice(c.c);
          if (closed) refreshSignal();
        });
      }
      if (r.venue) {
        // صرافی‌های Gate.io، HTX و OKX کندل‌ها را از طریق وب‌سوکت ارسال می‌کنند. پولینگ (Polling)
        // به عنوان روش پشتیبان باقی می‌ماند و تنها زمانی که به مدت ۳۰ ثانیه هیچ داده‌ای استریم نشود، فراخوانی می‌شود.
        const step = INTERVAL_MS[iv];
        let streamedAt = 0, filling = null;
        // دریافت هر داده‌ای که نمودار از زمان آخرین کندل خود کم دارد: چند کندل جدیدتر در پولینگ،
        // یا کل فاصله زمانی پس از اینکه وب‌سوکت یا تب مرورگر به حالت تعلیق درآمده است.
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
          if (c.t > lastT + step) { catchUp(); return; } // کندل‌هایی رد شده‌اند در حالی که هیچ استریمی دریافت نشده
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
      $('#signalCard', el).innerHTML = `<h3>خوانش اندیکاتور در دسترس نیست</h3><p class="muted">${esc(err.message || 'منبع کندل داده‌های کافی را برنگرداند.')}</p><p class="fine">${err.notListed ? 'قیمت آن در بالا از کوین‌گکو گرفته شده که برای آن هم کندلی ندارد. معامله‌گر هوش مصنوعی نیز از این ارز صرف‌نظر می‌کند.' : 'بازه زمانی دیگری را امتحان کنید، یا زمانی که منبع بازار در دسترس بود دوباره تلاش کنید.'}</p>`;
      $('#fcCard', el).innerHTML = '<h3>پیش‌بینی هوش مصنوعی در دسترس نیست</h3><p class="muted">پیش‌بینی نیازمند همان تاریخچه کندل‌های نمودار است، بنابراین هیچ پیش‌بینی‌ای تولید نشد.</p>';
    }
  }

  // صرافی قیمت بیت‌کوین را تا دو رقم اعشار و پپه را تا هشت رقم اعشار نقل می‌کند؛
  // دقیقاً همان مقداری را نمایش دهید که صرافی نقل می‌کند نه یک نسخه گردشده از آن.
  getTickSize(pair).then((dp) => { if (dp !== null && !st.disposed) { st.dp = dp; setPrice(st.lastPrice ?? coin.price); } }).catch(() => {});

  // تغییر ۲۴ ساعته نسبت به قیمت ۲۴ ساعت پیش نقل می‌شود، بنابراین آن نقطه مرجع
  // یک بار از مقادیری که ارز با آن‌ها رسیده مشتق می‌شود و تغییرات روی هر تیک مجدداً محاسبه می‌گردد.
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
    document.title = `${coin.symbol} ${text} · BTCS`;

    // این دو مورد در کنار قیمت زنده قرار داشتند که مقادیر زمان بارگذاری صفحه را نشان می‌دادند،
    // بنابراین ممکن بود قیمت یک ارز یک ساعت صعود کند در حالی که نشانگر کنار آن همچنان -2% را نشان می‌داد.
    const chg = $('#pxChg', el);
    if (chg && anchor24h) chg.innerHTML = changeHtml((p / anchor24h - 1) * 100);
    const rng = $('#range24', el);
    if (rng && lo24 !== null && hi24 !== null) {
      if (p < lo24) lo24 = p;
      if (p > hi24) hi24 = p;
      rng.textContent = `${usd(lo24)} – ${usd(hi24)}`;
    }
  }

  // سیگنال‌ها: بازه زمانی فعلی + همگرایی در سایر بازه‌های زمانی
  const mtfCache = {};
  async function updateSignal() {
    if (!st.candles.length) return;
    const sig = generateSignal(st.candles, { interval: st.interval });
    st.signal = sig;
    mtfCache[st.interval] = sig;
    await Promise.all(['15m', '1h', '4h', '1d'].filter((iv) => !mtfCache[iv]).map(async (iv) => {
      try { const r = await getCandles(coin, iv, 300); mtfCache[iv] = generateSignal(r.candles, { interval: iv }); } catch { /* رد شدن */ }
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

  // سیگنال هوش مصنوعی: کاری که قانون معاملاتی منتشرشده روی نمودار در حال حاضر با این ارز انجام می‌دهد —
  // خرید، نگهداری، فروش یا انتظار — به همراه سابقه آن قانون روی کندل‌هایی که روی آن‌ها انتخاب نشده بود،
  // دقیقاً به همین شکل ارزیابی شده است (یک ارز، یک معامله در هر زمان). پاسخی قطعی همراه با مستندات آن.
  let aiSig = { key: '', v: null };
  function aiSignalHtml() {
    // فقط روی کندل‌های واقعی صرافی: روی داده‌های آزمایشی یا کوین‌گکو معاملات آن ساختگی خواهند بود
    if (!st.tested) return `<div class="ai-signal fine" style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px"><b>سیگنال هوش مصنوعی</b> — در اینجا موردی وجود ندارد: ${esc(coin.symbol)} هیچ کندل صرافی‌ای روی این نمودار ندارد (فقط خط کوین‌گکو یا داده‌های آزمایشی)، و قوانین تنها روی کندل‌های صرافی آزمایش شده‌اند.</div>`;
    const closed = st.candles.slice(0, -1); // تصمیم‌گیری فقط روی کندل‌های بسته شده
    const key = `${st.interval}|${closed.length}|${closed.at(-1)?.t}`;
    if (aiSig.key !== key) aiSig = { key, v: aiSignal(closed, st.interval, coin.symbol) };
    const a = aiSig.v;
    if (!a) return '';
    const m = (v) => money(v, { dp: st.dp });
    const sg = (v, unit = '%') => `${v >= 0 ? '+' : '−'}${Math.abs(+(+v).toFixed(2))}${unit}`;
    const p1 = (v) => +(+v).toFixed(1);
    const r = a.rules;
    const exitWords = `${r.trailAtr ? `یک حد ضرر شناور به اندازه ${r.trailAtr} برابر ATR زیر بالاترین قیمت ثبت‌شده از زمان خرید` : `هدف`}${r.signalExitBars ? ` یا پس از ${r.signalExitBars} کندل از بازگشت سیگنال` : ''}`;
    const label = { buy: 'خرید', hold: 'نگهداری', sell: 'فروش', wait: 'انتظار' }[a.action];
    const tone = { buy: 'up', hold: 'up', sell: 'down', wait: '' }[a.action];
    const what = a.action === 'buy' ? `در آخرین کندل بسته شده در قیمت ${m(a.entry)} خرید انجام شد. حد ضرر ${m(a.stop)} (${sg(+((a.stop / a.entry - 1) * 100).toFixed(2))})؛ فروش در صورت ${a.target ? `رسیدن به هدف ${m(a.target)}، ` : ''}${exitWords} انجام می‌شود.`
      : a.action === 'hold' ? `در جریان معامله: خرید در ${a.barsHeld ?? '?'} کندل پیش در قیمت ${m(a.entry)}، با ${sg(a.openPct)} سود/زیان تاکنون. حد ضرر فعلی ${m(a.stop)}${a.target ? `، هدف ${m(a.target)}` : ''}؛ خروج در صورت ${exitWords}.`
        : a.action === 'sell' ? `معامله در آخرین کندل (${esc(a.why)}) در قیمت ${m(a.exit)} بسته شد: ${sg(p1(a.pnlPct))} از قیمت ${m(a.entry)}${a.r !== null ? `, ${sg(a.r, 'R')}` : ''}.`
          : `اکنون خریدی انجام نمی‌شود: ${esc(a.why)}.${a.last ? ` آخرین معامله ${esc(coin.symbol)} در ${ago(a.last.exitAt)} بسته شد (${esc(a.last.why)}، ${sg(p1(a.last.pnlPct))}).` : ''}`;
    const t = CHART_TESTED[st.interval];
    const x = a.record;
    const rec = !a.tested ? `این قانون روی نمودار ${esc(st.interval)} آزمایش نشده است، بنابراین این سیگنال در اینجا سابقه ندارد. این قانون روی ${Object.keys(CHART_TESTED).filter((k) => CHART_TESTED[k]?.standard).join(', ')} آزمایش شده است.`
      : x ? `عملکرد خریدهایی مانند این روی کندل‌هایی که قوانین روی آن‌ها انتخاب نشده بودند (${t.coins ?? CHART_TESTED.coins} ارز، ${t.from} ← ${t.to}): ${x.n.toLocaleString('en-US')} خرید، ${p1(x.winPct)}٪ برنده، میانگین ${sg(x.avgR, 'R')} سود به ازای هر معامله (R مخفف مقدار ریسک‌شده بین نقطه ورود و حد ضرر است؛ میانگین بردها ${sg(x.avgWinR, 'R')} و میانگین باخت‌ها ${sg(x.avgLossR, 'R')} بوده است). قیمت ${x.H} کندل پس از خرید، ${p1(x.fwdUpPct)}٪ از مواقع بالاتر بوده است، در مقایسه با ${p1(x.baseUpPct)}٪ برای هر کندل تصادفی${x.fwdLo > x.baseUpPct ? ' — بیشتر از شانس اتفاقی.' : ` — تفاوتی با شانس تصادفی ندارد، بنابراین خرید در اینجا پیش‌بینی صعود قیمت محسوب نمی‌شود.`} یک خرید در یک کندل تصادفی که به همان مدت نگه داشته شده بود معادل ${sg(x.randPct)} سود داشته، در حالی که این موارد ${sg(x.avgPct)} سود کسب کرده‌اند.`
        : `نتیجه آزمایش به عنوان قانون معامله‌گر هوش مصنوعی: ${sg((t.adopt ? t.own : t.standard).ret)} بازدهی به ازای هر ${t.block} در مقایسه با ${sg(t.hold)} برای نگهداری همان ارزها.`;
    // عملکرد این قوانین روی کندل‌های خود این ارز: قیمت‌های واقعی، اما قوانین روی تاریخچه‌ای انتخاب شده‌اند
    // که شامل بسیاری از همین کندل‌هاست، بنابراین این گزارش ظاهر بهتری از واقعیت زنده خواهد داشت؛
    // سابقه ذکر شده در بالا، معیار واقعی برای انتظار داشتن است.
    const pt = a.past;
    const day = (t) => new Date(t).toISOString().slice(0, st.interval === '1d' || st.interval === '1w' ? 10 : 16).replace('T', ' ');
    const past = pt.trades
      ? `<details class="mt"><summary class="fine" style="cursor:pointer">معاملات آن روی ${esc(coin.symbol)} در این کندل‌ها: ${pt.trades} معامله، ${pt.wins} برد، میانگین ${sg(pt.avgPct)} سود هر معامله پس از کسر کارمزد (نگهداری ${esc(coin.symbol)} از ${esc(day(pt.from))}: ${sg(pt.holdPct)})</summary>
        <div class="tbl-wrap"><table class="tbl fit fine"><thead><tr><th class="l">خرید</th><th class="l hide-p">فروش</th><th class="hide-p">ورود → خروج</th><th>نتیجه</th><th class="l">دلیل فروش</th></tr></thead><tbody>
          ${pt.recent.map((t) => `<tr><td class="l">${esc(day(t.openedAt))}<small class="show-p-block">فروش در ${esc(day(t.exitAt))}</small></td><td class="l hide-p">${esc(day(t.exitAt))}</td><td class="wrap hide-p">${m(t.entry)} → ${m(t.exit)}</td><td class="${t.netPct >= 0 ? 'up' : 'down'}">${sg(t.netPct)}</td><td class="l wrap">${esc(t.why)}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="fine" style="margin:6px 0 0">نمایش ${pt.recent.length} مورد آخر. قیمت‌های واقعی، اما قوانین روی تاریخچه‌ای انتخاب شده‌اند که شامل بسیاری از این کندل‌هاست، بنابراین این عملکرد بهتر از حالت زنده به نظر می‌رسد؛ سابقه واقعی همان چیزی است که در بالا ذکر شد.</p></details>`
      : `<p class="fine" style="margin:6px 0 0">روی ${esc(coin.symbol)} در این کندل‌ها هیچ معامله‌ای انجام نشده است (نگهداری از ${esc(day(pt.from))}: ${sg(pt.holdPct)}).</p>`;
    return `<div class="ai-signal" style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px">
      <div class="row spread"><b>سیگنال هوش مصنوعی · ${a.tested ? `قانون آزمایش‌شده ${esc(st.interval)}` : `قانون آزمایش‌نشده روی ${esc(st.interval)}`}</b><span class="chip ${tone}" style="font-weight:700">${label}</span></div>
      <p style="margin:6px 0 0">${what}</p>
      <p class="fine" style="margin:6px 0 0">${rec} شبیه‌سازی‌شده، با احتساب کارمزدها؛ سابقه گذشته تضمینی برای آینده نیست.</p>
      <p class="fine" id="aiLive" style="margin:6px 0 0" hidden></p>
      ${past}</div>`;
  }

  // کاری که معامله‌گر هوش مصنوعی با این ارز انجام می‌دهد: آیا آن را نگه داشته است یا خیر،
  // چه قوانینی برای آن به کار می‌برد، و روی نموداری که معامله می‌کند،
  // آیا قانون خرید آن در آخرین کندل بسته شده برقرار است یا خیر —
  // این پرسش از همان تابع موتوری پرسیده می‌شود که معامله‌گر استفاده می‌کند،
  // بنابراین این صفحه نمی‌تواند نوید خریدی را بدهد که معامله‌گر آن را انجام نخواهد داد.
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
    const closed = st.candles.slice(0, -1); // معامله‌گر تصمیمات خود را فقط روی کندل‌های بسته شده می‌گیرد
    const longSetup = sig?.plan?.side === 'long';
    const key = JSON.stringify([chart, st.interval, closed.at(-1)?.t, !!pos, universe.includes(coin.symbol), rules, longSetup]);
    if (key === aiNote.key) return aiNote.html;
    const sym = coin.symbol;
    let status;
    if (pos) status = `این ارز نگهداری می‌شود: خرید در تاریخ ${new Date(pos.openedAt).toISOString().slice(0, 10)} با قیمت ${money(pos.entry, { dp: st.dp })}، حد ضرر ${money(pos.stop, { dp: st.dp })}، ${pos.tp ? `هدف ${money(pos.tp, { dp: st.dp })}` : 'حد ضرر شناور'}.`;
    else if (!universe.includes(sym)) status = `${sym} در فهرست ارزهای تحت پوشش آن نیست؛ برای معامله این ارز، آن را در بخش معامله ← تنظیمات اضافه کنید.`;
    else if (st.interval !== chart) status = `این ربات نمودار ${chart} را معامله می‌کند؛ برای مشاهده برقراری قانون خرید، این صفحه را به بازه زمانی ${chart} تغییر دهید.`;
    else if (closed.length < 220) status = 'تاریخچه کافی روی این نمودار برای اجرای قوانین وجود ندارد.';
    else {
      const ind = computeAll(closed), i = closed.length - 1;
      const score = scoreAt(closed, ind, i).score;
      const code = entryBlocker(rules, { symbol: sym, candles: closed, ind, regime: null }, i, score);
      status = code ? `روی آخرین کندل بسته شده ${chart} خرید انجام نمی‌دهد به این دلیل: ${blockerText(code, rules, score, { rsi: ind.rsi[i] })}.${longSetup ? ' ستاپ لانگ (صعودی) بالا از امتیاز نمودار به دست آمده است؛ اما معامله‌گر صرفاً بر اساس قانون آزمایش‌شده خود خرید می‌کند.' : ''}`
        : `روی آخرین کندل بسته شده ${chart} قانون خرید آن برقرار است${rules.marketFilter ? ' (فیلتر روند بیت‌کوین در صفحه معامله بررسی می‌شود)' : ''}؛ در صورت داشتن جای خالی و نقدینگی، در بررسی بعدی خرید انجام می‌دهد.${longSetup ? '' : ' امتیاز نمودار ستاپ صعودی بالایی نشان نمی‌دهد؛ معامله‌گر از قانون آزمایش‌شده خود پیروی می‌کند نه امتیاز نمودار.'}`;
    }
    const html = `<div class="mt" style="border-top:1px solid var(--border);padding-top:10px"><div class="row spread"><b>معامله‌گر هوش مصنوعی روی ${esc(sym)}</b><a class="fine" href="#/trader">معامله ←</a></div>
      <p class="fine" style="margin:6px 0 0">${esc(status)} ${perCoin?.[sym] ? 'قوانین انتخاب‌شده بر اساس تاریخچه روزانه خود این ارز: ' : customRules ? 'قوانین سفارشی شما: ' : `قوانین آن روی ${esc(chart)}: `}${esc(rulesInWords(rules))} صرفاً پول شبیه‌سازی‌شده.</p></div>`;
    aiNote = { key, html };
    return html;
  }

  // سابقه زنده سرور برای این سیگنال، ارز و نمودار (در صورت رصد شدن):
  // پیش از مشخص شدن نتیجه، در زمان بسته شدن هر کندل ثبت می‌شود.
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
    node.innerHTML = `<b>وضعیت زنده روی سرور</b> از تاریخ ${esc(day)}: ${stats.logged} کندل بسته شده ثبت شده است؛ ${stats.buys ? `قیمت پس از ${shareText(stats.buyUp, stats.buys)} خرید ارزیابی‌شده بالاتر بوده است` : 'هنوز خریدی ارزیابی نشده است'}${stats.trades ? `; ${stats.trades} معامله بسته شده، میانگین سود ${stats.avgTradePct >= 0 ? '+' : ''}${stats.avgTradePct}% پس از کسر کارمزد` : ''}. <a href="#/track">سوابق عملکرد ←</a>`;
    node.hidden = false;
  }

  function drawSignal(sig, conf) {
    const card = $('#signalCard', el);
    // خلاصه به زبان ساده متن بلندی است، به همین دلیل به جای کشیدن ستون کناری ۳۶۰ پیکسلی به پایین،
    // زیر نمودار و با عرض کامل قرار می‌گیرد.
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
      // مشخص کردن نوع "عدم مزیت": آزمایش‌شده و شکست‌خورده در برابر خط مبنا، یا هرگز آزمایش‌نشده.
      noEdgeText: TESTED_ACCURACY.recheck?.[st.interval]
        ? `در آخرین ارزیابی (${TESTED_ACCURACY.recheck.measuredOn}، ${TESTED_ACCURACY.recheck[st.interval].n ?? 240} پیش‌بینی روی ${st.interval} در ${TESTED_ACCURACY.recheck[st.interval].coins ?? 12} ارز) موتور پیش‌بینی جهت را ${TESTED_ACCURACY.recheck[st.interval].hit}٪ مواقع درست تشخیص داد در مقایسه با ${TESTED_ACCURACY.recheck[st.interval].baseline}٪ برای انتخاب همیشگی جهت رایج‌تر، بنابراین این موتور هیچ مزیت اثبات‌شده‌ای روی این نمودار ندارد و سمتی نمایش داده نمی‌شود.`
        : typeof TESTED_ACCURACY[st.interval] === 'number'
        ? `در آزمایش انتشار (${TESTED_ACCURACY.testsPerInterval} پیش‌بینی روی ${st.interval}) موتور پیش‌بینی ${TESTED_ACCURACY[st.interval]}٪ مواقع درست عمل کرد در حالی که خط مبنا ${TESTED_ACCURACY.baseline[st.interval]}٪ بود، بنابراین هیچ مزیت اثبات‌شده‌ای روی این نمودار وجود ندارد. احتمال نمایش‌داده‌شده جنبه پس‌زمینه دارد، نه دلیلی برای اقدام.`
        : `موتور پیش‌بینی هرگز روی نمودار ${st.interval} آزمایش نشده است، بنابراین هیچ دقت اندازه‌گیری‌شده‌ای در اینجا وجود ندارد. احتمال نمایش‌داده‌شده جنبه پس‌زمینه دارد، نه دلیلی برای اقدام.`,
    });
    card.innerHTML = `
      <div class="card-h"><h3>${icon('bolt', 16)} سیگنال معاملاتی · ${st.interval}</h3><span class="fine">کندل‌های ${INTERVAL_LABEL[st.interval]}</span></div>
      ${aiSignalHtml()}
      <div class="fine" style="margin-bottom:4px"><b>خوانش نمودار</b> — وضعیت فعلی اندیکاتورها، نه فرمان معاملاتی</div>
      <div class="verdict">
        <div><div class="big ${sig.tone}">${sig.text}</div><div class="fine">توافق اندیکاتورها ${sig.score > 0 ? '+' : ''}${sig.score} از ۱۰۰ — به معنای احتمال وقوع نیست</div></div>
        <div style="flex:1"><div class="scorebar"><i style="left:${pos}%"></i></div><div class="row spread fine" style="margin-top:4px"><span>سقوط قوی</span><span>بدون روند مشخص</span><span>صعود قوی</span></div></div>
      </div>
      <div class="signal-meter mt">
        <div class="row spread"><b>مومنتوم</b><span class="chip ${meterTone}">${esc(meter.label)}</span></div>
        <div class="meter-track" style="margin-top:8px"><i class="meter-needle" style="left:${meter.pos}%"></i></div>
        <div class="meter-labels fine" style="margin-top:4px"><span>سقوط قوی</span><span>نزولی</span><span>خثی</span><span>صعودی</span><span>صعود قوی</span></div>
        <p class="fine" style="margin:6px 0 0">سنجش‌گر قدرت متعارف برای میزان امتداد یافتن اندیکاتورها. سابقه ارزیابی‌شده جداست: ${(() => { const b = upRateFor(st.interval, sig.score); return b ? `روی ${esc(st.interval)}، خوانش‌هایی مانند این در <b>${b.upRatePct}٪</b> مواقع با قیمت‌های بالاتری دنبال شده‌اند` : `اینکه خوانش‌هایی مانند این چند مرتبه با قیمت بالاتری دنبال شده‌اند روی ${esc(st.interval)} اندازه‌گیری نشده است (این مورد روی ۱۵ دقیقه، ۱ ساعت، ۴ ساعت و ۱ روزه اندازه‌گیری شده است)`; })()} — امتیاز بالا به معنای امتداد یافتن حرکت است، نه لزوماً ادامه آن.</p>
      </div>
      ${warnings.length ? `<div class="risk-list mt">${warnings.map((w) => `<div class="risk-item ${w.level}">${icon('info', 14)}<span>${esc(w.text)}</span></div>`).join('')}</div>` : ''}
      ${conf ? `<p class="combined mt">دیدگاه کلی در تمام بازه‌های زمانی: <b class="${conf.tone}">${conf.text}</b> (${conf.score > 0 ? '+' : ''}${conf.score}). پنل زیر تنها نمودار ${st.interval} را می‌خواند.</p>` : ''}
      <div class="mtf mt">${['15m', '1h', '4h', '1d'].map((iv) => { const s = mtfCache[iv]; return `<div${iv === st.interval ? ' class="on"' : ''}><div class="k">${iv}</div><div class="v ${s?.ok ? s.tone : 'flat'}">${s?.ok ? s.text : '—'}</div></div>`; }).join('')}</div>
      ${plan ? `
        <h3 class="mt" style="margin-bottom:8px">${esc(plan.title)}</h3>
        <p class="fine" style="margin:0 0 8px">${(() => {
          // عملکرد معاملاتی با دقیقاً همین فاصله‌های حد ضرر و هدف در آزمایش‌ها
          const g = geometryFor(st.interval);
          return g.tested && Number.isFinite(g.ev)
            ? `این فرمان معاملاتی نیست. با ورود در هر کندل با این فاصله حد ضرر و هدف، معاملات روی ${esc(st.interval)} ${g.ev >= 0 ? `به ازای هر معامله ${g.ev.toFixed(3)}R` : `معادل ${Math.abs(g.ev).toFixed(3)}R زیان`} در آزمایش‌ها ثبت کرده‌اند، با احتساب کارمزد (R مقدار ریسک‌شده است). سیگنال هوش مصنوعی در بالا همان قانون آزمایش‌شده است.`
            : `این فرمان معاملاتی نیست: سطوح بر اساس نوسانات این نمودار اندازه‌گیری شده‌اند و هرگز روی ${esc(st.interval)} آزمایش نشده‌اند. سیگنال هوش مصنوعی در بالا همان قانون آزمایش‌شده است.`;
        })()}</p>
        <div class="plan">
          <div><div class="k">محدوده ورود</div><div class="v">${money(plan.entryZone[0])} – ${money(plan.entryZone[1])}</div></div>
          <div><div class="k">حد ضرر</div><div class="v down">${money(plan.stopLoss)} <span class="fine">(${plan.riskPct}٪)</span></div></div>
          <div><div class="k">حد سود ۱</div><div class="v up">${money(plan.takeProfits[0])}</div></div>
          <div><div class="k">حد سود ۲ / ۳</div><div class="v up">${money(plan.takeProfits[1])} / ${money(plan.takeProfits[2])}</div></div>
        </div>
        <ul class="reasons mt">${(plan.exits || plan.exitRules.map((text) => ({ text }))).map((r) => `<li class="s">${esc(r.text).replace('{price}', r.price != null ? money(r.price) : '')}</li>`).join('')}</ul>`
      : `<h3 class="mt" style="margin-bottom:8px">بدون معامله — منتظر تریگر بمانید</h3><ul class="reasons">${sig.waitFor.map((w) => `<li class="b">${esc(w)}</li>`).join('')}</ul>`}
      ${aiTraderHtml(sig)}
      <details class="mt"><summary class="fine" style="cursor:pointer">دلایل این سیگنال (${sig.reasons.bullish.length} صعودی · ${sig.reasons.bearish.length} نزولی)</summary>
        <ul class="reasons mt">${sig.reasons.bullish.map((r) => `<li class="b">${esc(r)}</li>`).join('')}${sig.reasons.bearish.map((r) => `<li class="s">${esc(r)}</li>`).join('')}</ul>
      </details>`;
    fillAiLive();
  }

  // نسخه به زبان ساده از اعداد پایین‌تر آن: چه چیزی بخرید، چه زمانی بخرید،
  // چه زمانی بفروشید، در کجا اشتباه می‌کنید و چقدر ریسک کنید.
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
    if (!sum.steps.length && sum.verdict === 'بدون خوانش') return '';
    return `
      <div class="summary mt">
        <div class="row spread">
          <span class="chip ${sum.tone === 'warn' ? 'warn' : sum.tone}"><b>${esc(sum.verdict)}</b></span>
          <span class="fine" title="${esc(sum.confidenceWhy || '')}">اطمینان ${esc(sum.confidence)}</span>
        </div>
        ${sum.confidenceWhy ? `<p class="fine" style="margin:6px 0 0">${esc(sum.confidenceWhy)}</p>` : ''}
        <p class="mt" style="margin-bottom:10px">${esc(sum.headline)}</p>
        <dl class="steps">${sum.steps.map((x) => `<dt>${esc(x.label)}</dt><dd>${esc(x.text)}</dd>`).join('')}</dl>
        ${sum.caveats.map((c) => `<p class="fine" style="margin:6px 0 0">${esc(c)}</p>`).join('')}
      </div>`;
  }

  // ------------------------------------------------------------ پیش‌بینی هوش مصنوعی
  async function runAi() {
    const iv = st.interval, H = st.horizon;
    if (st.candles.length < 200) {
      $('#fcCard', el).innerHTML = `<h3>پیش‌بینی هوش مصنوعی</h3><p class="muted">حداقل به ۲۰۰ کندل تاریخچه در این بازه زمانی نیاز است.</p>`;
      if (st.tab === 'forecast' || st.tab === 'patterns') drawTab();
      return;
    }
    let fc;
    try {
      fc = await runForecast(st.candles, { horizon: H, intervalMs: INTERVAL_MS[iv] });
    } catch (err) {
      if (st.disposed || iv !== st.interval || H !== st.horizon) return;
      st.forecast = { ok: false, reason: err?.message || 'موتور پیش‌بینی نتوانست با این تاریخچه کندل‌ها فرآیند را به اتمام برساند.' };
      st.timing = null;
      $('#fcCard', el).innerHTML = `<h3>پیش‌بینی هوش مصنوعی در دسترس نیست</h3><p class="muted">${esc(st.forecast.reason)}</p><p class="fine">خوانش اندیکاتور در بالا همچنان معتبر است؛ هیچ مقدار پیش‌بینی‌نشده‌ای ساخته نشده است.</p>`;
      if (st.tab === 'forecast' || st.tab === 'patterns') drawTab();
      return;
    }
    if (st.disposed || iv !== st.interval || H !== st.horizon) return;
    st.forecast = fc;
    st.timing = fc.ok ? timingOutlook(fc, { intervalMs: INTERVAL_MS[iv], interval: iv }) : null;

    // دفتر کل بهبود محلی: حل پیش‌بینی‌هایی که افق زمانی‌شان روی این ارز/بازه زمانی سپری شده است،
    // سپس ثبت پیش‌بینی جدید پیش از مشخص شدن نتیجه.
    // فقط روی کندل‌های واقعی صرافی: قیمت‌های آزمایشی ساختگی هستند و ارزیابی پیش‌بینی بر اساس آن‌ها
    // باعث می‌شود بخش یادگیری دستگاه نتایج ساختگی را یاد بگیرد.
    try {
      let ledger = loadLedger();
      const learn = st.tested && !stable;
      if (learn) ledger = resolveDueLedger(ledger, st.candles, { symbol: coin.symbol, interval: iv });
      st.ensemble3 = threeModelEnsemble(st.candles, { ledger, horizon: H });
      if (learn) {
        if (fc.ok && Number.isFinite(fc.probUp) && fc.path?.length) {
          // پیش‌بینی‌های سه مدل متقاطع به همراه پیش‌بینی اصلی ثبت می‌شوند تا هر یک
          // بر اساس سابقه خود ارزیابی شده و وزن مخصوص خود را کسب کنند.
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
    } catch { /* دفتر کل یک امکان کمکی است و حیاتی نیست */ }
    // مرکز یادگیری هوش مصنوعی: ترکیب با وزن‌هایی که ابر محاسباتی روی این نمودار آموخته است؛
    // بدون ابر، خوانش‌های این نمودار برای ارزیابی در اینجا ثبت می‌شوند.
    const cloudRec = st.tested && !stable ? (await cloudLearning().catch(() => null))?.[iv] || null : null;
    if (st.disposed || iv !== st.interval || H !== st.horizon) return;
    st.learned = st.tested && !stable ? learnFromChart({ symbol: coin.symbol, interval: iv, candles: st.candles, forecastProb: fc.ok ? fc.probUp : null, cloud: cloudRec }) : null;

    const trustNow = directionTrustFor(iv, st.ledger || loadLedger()).trust;
    if (fc.ok && st.tested && !stable) {
      // پیش از مشخص شدن نتیجه ثبت می‌شود تا عنوان "نرخ موفقیت شما" صادقانه باشد.
      // هرگز برای قیمت‌های آزمایشی استفاده نمی‌شود: این مورد به سابقه حساب کاربری روی سرور ارسال می‌شود.
      // آنچه نمایش داده می‌شود همان چیزی است که صفحه نشان می‌دهد: جایی که جهت قابل اعتماد نیست،
      // هیچ احتمالی از صعود نشان داده نمی‌شود، بنابراین هیچ‌چیز ثبت و ارزیابی نمی‌شود.
      const shownDir = directionReliable(iv, trustNow);
      logForecastShown({
        symbol: coin.symbol, interval: iv, price: fc.lastPrice,
        probUp: shownDir ? shownProbUp(fc.probUp, iv, trustNow) : null,
        targetPrice: shownDir ? fc.targetPrice : fc.lastPrice, horizonBars: fc.horizon,
        horizonAt: fc.path[fc.path.length - 1]?.t, modelAccuracy: fc.ensemble?.accuracy ?? null,
      });
    }
    // آنچه نمایش داده می‌شود: بدون تمایل جهت‌دار در جاهایی که جهت قابل اعتماد نیست
    st.fcView = fc.ok ? forecastForDisplay(fc, iv, trustNow) : fc;
    st.moveCall = fc.ok ? moveSizeCall(st.candles, fc.horizon, iv) : null;
    remember(coin.symbol, iv, { forecast: st.fcView, timing: st.timing });
    // خلاصه، پیش‌بینی را می‌خواند، بنابراین پس از آماده شدن پیش‌بینی، کارت سیگنال را دوباره ترسیم کنید.
    if (st.signal?.ok && !st.disposed && iv === st.interval) updateSignal();
    if (!fc.ok) { $('#fcCard', el).innerHTML = `<h3>پیش‌بینی هوش مصنوعی</h3><p class="muted">${esc(fc.reason)}</p>`; return; }
    chart.setProjection(st.fcView.path, { leanRemoved: Boolean(st.fcView.leanRemoved), seed: `${coin.symbol}:${iv}:${st.candles[st.candles.length - 1]?.t}` });
    drawForecastCard(st.fcView);
    if (st.tab === 'forecast' || st.tab === 'patterns') drawTab();
  }

  // سهم اندازه‌گیری‌شده از نتایج واقعی که در محدوده پیش‌بینی قرار گرفته‌اند:
  // آزمایش اختصاصی این نمودار در صورت اجرا، و کل آزمایش انتشار در کنار آن.
  function coverage(band) {
    const x = (st.fcView || st.forecast)?.leanRemoved && FORECAST_TESTED.centred[st.interval];
    if (typeof x?.[band] === 'number') return `در ${x[band]}٪ مواقع در ${esc(st.interval)} طی ${x.tests.toLocaleString('en-US')} آزمایش روی ${x.coins} ارز حفظ شده است (${x.tests === FORECAST_TESTED.perChart ? FORECAST_TESTED.measuredOn : FORECAST_TESTED.centredMeasuredOn})${x.widen && x.asDrawnBefore?.[band] != null ? `; در اینجا ${Math.round((x.widen - 1) * 100)}٪ پهن‌تر رسم شده، و بدون این پهناورسازی روی همان کندل‌ها ${x.asDrawnBefore[band]}٪ بوده که پهنای آن روی این کندل‌ها تنظیم نشده است` : ''}`;
    const own = TESTED_ACCURACY[band]?.[st.interval];
    const all = `${TESTED_ACCURACY.bandsAll[band]}٪ در میان تمام ${TESTED_ACCURACY.tests.toLocaleString()} آزمایش`;
    return typeof own === 'number' ? `در ${own}٪ مواقع روی ${esc(st.interval)} حفظ شده · ${all}` : `در ${all} حفظ شده (خود ${esc(st.interval)} آزمایش نشده است)`;
  }

  // تمایل جهت‌دار خام به زبان ساده در مواردی که قابل اعتماد نیست: آزمایش‌شده و خالی، یا هرگز آزمایش‌نشده.
  function rawLeanNote(fc) {
    const why = st.interval in TESTED_ACCURACY.directionTrust
      ? `در آزمایش‌ها، تمایل‌های جهت‌دار آن روی ${esc(st.interval)} حامل هیچ اطلاعاتی نبوده‌اند`
      : `هرگز روی ${esc(st.interval)} آزمایش نشده است`;
    return `تمایل خام مدل: ${(fc.probUp * 100).toFixed(1)}٪ صعودی. به عنوان احتمال نمایش داده نمی‌شود زیرا ${why}.`;
  }

  // منشأ تعدیل در این نمودار، تا تنظیم خودکار قابل مشاهده باشد.
  function trustNote(t) {
    const base = `احتمال به دلیل اعتماد اندازه‌گیری‌شده روی ${esc(st.interval)} به سمت ۵۰٪ متمایل شده است: ${t.prior.toFixed(2)} در آزمایش انتشار`;
    if (t.local === null) return `${base}. پس از ارزیابی ${MIN_GRADED_FOR_TRUST} مورد از پیش‌بینی‌های شما، تنظیمات آغاز می‌شود (تاکنون ${t.graded} مورد).`;
    return `${base}، و بعد از ارزیابی ${t.graded} مورد از پیش‌بینی‌های شما به ${t.trust.toFixed(2)} رسیده است (پیش‌بینی‌های شما به تنهایی مقدار ${t.local.toFixed(2)} را نتیجه می‌دهند).`;
  }

  // آیا حرکتی بزرگ‌تر یا کوچک‌تر از حد معمول در راه است؟ این مورد تنها روی نمودارهایی به عنوان فراخوان نشان داده می‌شود
  // که تست‌شده توانسته باشند آن دو را از هم تشخیص دهند (FORECAST_TESTED.move).
  function moveCallHtml(fc) {
    const m = st.moveCall;
    if (!m) return '';
    const h = horizonText(st.interval, fc.horizon);
    if (!m.useful) return `<div class="fine">حرکت معمول ${esc(coin.symbol)} طی ${esc(h)}: حدود ±${m.usualPct}٪. اینکه حرکت بزرگ‌تر یا کوچک‌تر در راه است، در آزمایش‌های روی ${esc(st.interval)} قابل تفکیک نبود.</div>`;
    const t = m.tested;
    return `<div class="fine"><b class="${m.bigger ? 'warn' : ''}">حرکت ${m.bigger ? 'بزرگ‌تر' : 'کوچک‌تر'} از حد معمول محتمل است</b>: نوسان ${m.ratio} برابر حالت عادی ${esc(coin.symbol)} است و حرکت معمول آن طی ${esc(h)} حدود ±${m.usualPct}٪ است. در آخرین آزمایش، حرکت پس از فراخوان «${m.bigger ? 'بزرگ‌تر' : 'کوچک‌تر'}» به طور میانگین ${m.bigger ? t.big : t.small} برابر اندازه معمول بوده است، در مقایسه با ${m.bigger ? t.small : t.big} برابر پس از فراخوان متضاد (${FORECAST_TESTED.perChart} پیش‌بینی روی ${esc(st.interval)}). اندازه حرکت، نه جهت آن.</div>`;
  }

  // سابقه اندازه‌گیری‌شده جهت روی این نمودار: آخرین آزمایش در صورت وجود.
  function directionTestedText() {
    const r = TESTED_ACCURACY.recheck?.[st.interval];
    if (r) return `جهت در آخرین ارزیابی (${TESTED_ACCURACY.recheck.measuredOn}): درست در ${r.hit}٪ مواقع روی ${esc(st.interval)}، در مقایسه با ${r.baseline}٪ برای انتخاب همیشگی جهت رایج‌تر.`;
    if (typeof TESTED_ACCURACY[st.interval] === 'number') return `جهت در آزمایش انتشار: درست در ${TESTED_ACCURACY[st.interval]}٪ مواقع روی ${esc(st.interval)}، در مقایسه با ${TESTED_ACCURACY.baseline[st.interval]}٪ برای انتخاب همیشگی جهت رایج‌تر.`;
    return `جهت هرگز روی ${esc(st.interval)} آزمایش نشده است.`;
  }

  function drawForecastCard(fc) {
    // آنچه نمایش داده می‌شود احتمالی است که با اعتماد اندازه‌گیری‌شده آن روی این نمودار تعدیل (Shrunk) شده است؛
    // احتمال خام در دفتر کل باقی می‌ماند که مدل‌ها را ارزیابی می‌کند.
    const trust = directionTrustFor(st.interval, st.ledger || loadLedger());
    const shown = shownProbUp(fc.probUp, st.interval, trust.trust);
    const reliable = directionReliable(st.interval, trust.trust);
    const dirTxt = !reliable ? '<b class="flat">جهت قابل اعتمادی روی این نمودار وجود ندارد</b>'
      : shown >= 0.54 ? '<b class="up">احتمالاً بالاتر</b>' : shown <= 0.46 ? '<b class="down">احتمالاً پایین‌تر</b>' : '<b class="flat">خثی / نامشخص</b>';
    const e = fc.ensemble;
    const ledger = st.ledger || loadLedger();
    const ls = learningStatus(ledger);
    const spark = accuracySparkline(ledger, 50);
    const ens3 = st.ensemble3;
    const band50 = typeof TESTED_ACCURACY.band50?.[st.interval] === 'number' ? TESTED_ACCURACY.band50[st.interval] : null;
    const band80 = typeof TESTED_ACCURACY.band80?.[st.interval] === 'number' ? TESTED_ACCURACY.band80[st.interval] : null;
    const brier = typeof TESTED_ACCURACY.brier?.[st.interval] === 'number' ? TESTED_ACCURACY.brier[st.interval] : (typeof e.brier === 'number' ? e.brier : null);
    const trendCls = ls.trend === 'improving' ? 'up' : ls.trend === 'declining' ? 'down' : '';
    // آزمایش انتشار هیچ مزیتی روی این بازه زمانی پیدا نکرد، بنابراین این نمودار
    // هرچقدر هم که مدل‌ها در حال حاضر به سمتی تمایل داشته باشند، نمی‌تواند سطح اطمینان بالایی داشته باشد.
    const tfNoEdge = (TESTED_ACCURACY.noEdge || []).includes(st.interval) || !(st.interval in (TESTED_ACCURACY.baseline || {}));
    const conf = !reliable ? 'کم' : fc.confidence === 'High' && tfNoEdge ? 'متوسط' : fc.confidence;
    const confWhy = (!reliable ? `جهت قابل اعتمادی روی ${st.interval} در آزمایش‌ها دیده نشد. ` : tfNoEdge ? `سقف اعمال‌شده: آزمایش انتشار هیچ مزیتی روی ${st.interval} پیدا نکرد. ` : '') + 'بررسی‌های اخیر خود ارز استفاده نمی‌شود: در آزمایش‌ها، این بررسی‌ها نتوانستند پیش‌بینی‌های درست را از غلط متمایز کنند.';
    const winHtml = (w) => {
      const r = ls.windows[w];
      if (r.pct === null) return '<span class="muted">—</span>';
      const cls = r.pct >= 55 ? 'up' : r.pct < 45 ? 'down' : '';
      return `<b class="${cls}">${r.pct}٪</b> <span class="fine">(${r.hits}/${r.total})</span>`;
    };
    // ارزش پیش‌بینی، به شکل شرایط بیان می‌شود: محدوده اندازه‌گیری‌شده (چند بار حفظ شده)،
    // جهت اندازه‌گیری‌شده (یا عدم اندازه‌گیری آن)، و روی چه نمودار و داده‌هایی.
    // محدوده در ابتدا می‌آید: این همان بخشی است که اعتبار خود را حفظ کرده است.
    const measuredRange = Boolean((fc.leanRemoved && FORECAST_TESTED.centred[st.interval]) || typeof TESTED_ACCURACY.band80?.[st.interval] === 'number');
    const lo90 = fc.range.p05 ?? fc.range.p10, hi90 = fc.range.p95 ?? fc.range.p90;
    const at = (v) => Math.max(0, Math.min(100, ((v - lo90) / (hi90 - lo90 || 1)) * 100));
    $('#fcCard', el).innerHTML = `
      <div class="card-h"><h3>${icon('ai', 16)} پیش‌بینی هوش مصنوعی</h3><span class="chip ${conf === 'High' ? 'up' : conf === 'Moderate' ? 'warn' : ''}" title="${esc(confWhy)}">اطمینان جهت: ${conf.toLowerCase()}</span></div>
      <div class="fc-range">
        <div class="k">${esc(horizonText(st.interval, fc.horizon))} آینده: احتمالاً بین</div>
        <div class="v"><b>${usd(fc.range.p10)}</b> <span class="muted">و</span> <b>${usd(fc.range.p90)}</b></div>
        <div class="range-bar" role="img" aria-label="قیمت امروز در محدوده پیش‌بینی"><i style="left:${at(fc.range.p10).toFixed(1)}%;right:${(100 - at(fc.range.p90)).toFixed(1)}%"></i><i class="mid" style="left:${at(fc.range.p25).toFixed(1)}%;right:${(100 - at(fc.range.p75)).toFixed(1)}%"></i><b style="left:${at(fc.lastPrice).toFixed(1)}%" title="قیمت امروز"></b></div>
        <div class="fine">محدوده ۸۰ درصدی: ${coverage('band80')}.</div>
      </div>
      <div class="conditions" aria-label="میزان اعتماد به این پیش‌بینی">
        <span class="chip ${measuredRange ? 'up' : 'warn'}">محدوده: ${measuredRange ? 'آزمایش‌شده' : 'روی این نمودار آزمایش نشده'}</span>
        <span class="chip ${reliable ? 'up' : 'warn'}">جهت: ${reliable ? 'آزمایش‌شده' : 'بهتری از شانس ندارد'}</span>
        <span class="chip">نمودار ${st.interval} · ${st.candles.length.toLocaleString('en-US')} کندل${st.tested ? ' · زنده' : ' · داده آزمایشی'}</span>
      </div>
      ${fc.range.p05 ? `<dl class="kv mt"><dt>محدوده ۹۰ درصدی</dt><dd>${usd(fc.range.p05)} – ${usd(fc.range.p95)} <span class="fine">${coverage('band90')}</span></dd></dl>` : ''}
      <div class="${reliable ? 'prob mt' : 'mt'}">${reliable ? ring(shown) : ''}
        <div class="stack" style="gap:4px">
          <div>${esc(horizonText(st.interval, fc.horizon))} آینده: ${dirTxt}</div>
          ${fc.leanRemoved ? `<div class="fine">نیمی از مواقع قیمت بین <b>${usd(fc.range.p25)} – ${usd(fc.range.p75)}</b> به پایان می‌رسد — ${coverage('band50')}</div>` : `<div class="fine">هدف ≈ <b>${usd(fc.targetPrice)}</b> (${pct(fc.expectedReturnPct)})</div>`}
          ${moveCallHtml(fc)}
          <div class="fine">${directionTestedText()}</div>
          ${reliable ? `<div class="fine">${trustNote(trust)}</div>` : `<div class="fine">${rawLeanNote(fc)}</div>`}
        </div>
      </div>
      <details class="mt fc-more"><summary class="fine">سابقه عملکرد، مدل‌های متقاطع و کالیبراسیون</summary>
      <div class="learning-box mt">
        <div class="row spread"><b>سابقه پیش‌بینی‌های شما</b><span class="chip ${trendCls}">${esc(TREND_WORDS[ls.trend] || ls.trend)}</span></div>
        <div class="grid g2" style="margin-top:8px">
          <div class="stat"><span class="k">۲۰ مورد آخر</span><span class="v" style="font-size:16px">${winHtml(20)}</span></div>
          <div class="stat"><span class="k">۵۰ مورد آخر</span><span class="v" style="font-size:16px">${winHtml(50)}</span></div>
          <div class="stat"><span class="k">۱۰۰ مورد آخر</span><span class="v" style="font-size:16px">${winHtml(100)}</span></div>
          <div class="stat"><span class="k">ثبت‌شده</span><span class="v" style="font-size:16px">${ls.resolved}<span class="fine"> حل‌شده</span></span><span class="s fine">${ls.pending} در انتظار</span></div>
        </div>
        ${spark.length > 1 ? `<div style="margin-top:8px">${sparklineSvg(spark, { width: 220, height: 32, color: 'var(--accent)' })}</div>` : ''}
        <p class="fine" style="margin:6px 0 0">نرخ موفقیت در پیش‌بینی‌های حل‌شده خود شما (پنجره‌های متحرک؛ در صورت ورود به حساب، با حساب کاربری شما ذخیره می‌شود). ثبت امتیاز موجب بهبود پیش‌بینی نمی‌شود: زمانی که نرخ موفقیت زیر ۵۵٪ باشد، ضریب اطمینان نمایش‌داده‌شده به سمت ۵۰/۵۰ کشیده می‌شود. نسخه مدل v${ls.modelVersion}.</p>
      </div>
      ${ens3?.ok ? `
      <div class="ensemble3 mt">
        <div class="row spread"><b>مجموعه سه خانواری (آزمایشی)</b><span class="chip">متقاطع</span></div>
        <dl class="kv" style="margin-top:8px">
          ${ens3.models.map((m) => `<dt>${esc(m.name)}</dt><dd><span class="${m.probUp >= 0.5 ? 'up' : 'down'}">${(m.probUp * 100).toFixed(1)}٪ صعودی</span> <span class="fine">· وزن ${m.weightPct}٪</span></dd>`).join('')}
        </dl>
        <p class="fine" style="margin:6px 0 0">ترکیب نهایی → <b class="${ens3.probUp >= 0.5 ? 'up' : 'down'}">${(ens3.probUp * 100).toFixed(1)}٪ صعودی</b>.${reliable && (ens3.probUp >= 0.5) !== (shown >= 0.5) ? ` <b>با پیش‌بینی اصلی در بالا اختلاف نظر دارد</b> (${(shown * 100).toFixed(1)}٪ صعودی)، که ملاک عمل صفحه همان پیش‌بینی اصلی است.` : ''} ${ens3.weights.source === 'default' ? `سه مدل آن (مومنتوم، بازگشت به میانگین و الگوهای گذشته) وزن مساوی دارند تا زمانی که هرکدام ${MIN_FAMILY_CALLS} پیش‌بینی ارزیابی‌شده در سابقه شما ثبت کنند (بیشترین تعداد تاکنون: ${ens3.weights.graded}).` : `وزن هر مدل از روی سابقه پیش‌بینی‌های شما به دست آمده است: ${ens3.models.map((m) => { const r = ens3.weights.record[m.key]; return `${m.key === 'reversion' ? 'بازگشت به میانگین' : m.key === 'pattern' ? 'الگوها' : 'مومنتوم'} ${r.n ? `${Math.round(r.rate * 100)}٪ درست در ${r.n} پیش‌بینی` : 'هنوز پیش‌بینی ارزیابی‌شده‌ای ندارد'}`; }).join(', ')}.`} بررسی متقاطع آزمایشی — بخشی از دقت پیوسته (Walk-forward) منتشرشده نیست${reliable ? '' : `، و روی ${esc(st.interval)} آزمایش انتشار هیچ جهت قابل اعتمادی پیدا نکرده است، بنابراین صرفاً جهت مطالعه خوانده شود`} ${ens3.dampened ? `تمایل این مدل به سمت ۵۰٪ متمایل شده زیرا خود ترکیب نهایی در سابقه شما تنها ${Math.round(ens3.blendAccuracy)}٪ مواقع درست بوده است.` : ''}</p>
      </div>` : ''}
      <dl class="kv mt">
        <dt>امتیاز برایر (Brier score - کمتر بهتر است)</dt><dd>${brier !== null ? brier.toFixed(3) : '—'}</dd>
        <dt>شیب کالیبراسیون</dt><dd>${typeof e.calibrationSlope === 'number' ? e.calibrationSlope.toFixed(3) : '—'}</dd>
        <dt>پوشش اندازهه‌گیری‌شده باند ۵۰٪</dt><dd>${band50 !== null ? band50 + '%' : '—'} <span class="muted">هدف ~۵۰٪</span></dd>
        <dt>پوشش اندازه‌گیری‌شده باند ۸۰٪</dt><dd>${band80 !== null ? band80 + '%' : '—'} <span class="muted">هدف ~۸۰٪</span></dd>
        <dt>پوشش اندازه‌گیری‌شده باند ۹۰٪</dt><dd>${typeof TESTED_ACCURACY.band90?.[st.interval] === 'number' ? TESTED_ACCURACY.band90[st.interval] + '%' : '—'} <span class="muted">هدف ~۹۰٪</span></dd>
      </dl>
      </details>
      ${timingCardBlock()}
      <div class="row mt"><span class="fine">افق زمانی</span><div class="seg" id="hSeg">${[Math.max(3, Math.round(st.horizon / 2)), DEFAULT_HORIZON[st.interval] || 12, (DEFAULT_HORIZON[st.interval] || 12) * 2].filter((v, i, a) => a.indexOf(v) === i).map((h) => `<button data-v="${h}" class="${h === st.horizon ? 'on' : ''}">${horizonText(st.interval, h)}</button>`).join('')}</div></div>
      <div id="histLine" class="mt"></div>`;
    bindSeg($('#hSeg', el), (v) => { st.horizon = +v; $('#fcCard', el).innerHTML = `<div class="row"><span class="spinner"></span><b>در حال آموزش مجدد برای افق ${horizonText(st.interval, +v)}…</b></div>`; runAi(); });
    paintHistLine();
  }

  // مسیر شکل‌گرفته: جایی که حرکت به سقف یا کف می‌رسد، و زمان تغییر روند.
  function timingSection() {
    const t = st.timing;
    if (!t?.ok) return `<p class="fine mt">${esc(t?.reason || '')}</p>`;
    if (!t.shaped) return `<p class="fine mt">زمان‌بندی: نمودارهای مشابه گذشته به طور مداوم ${t.endPct >= 0 ? 'صعودی' : 'نزولی'} حرکت کرده‌اند و جهش خاصی نداشته‌اند، بنابراین نقطه عطف مشخصی برای نام بردن در این افق وجود ندارد.</p>`;
    const dur = (bars) => horizonText(st.interval, bars);
    const main = t.rising ? t.peak : t.trough;
    const trust = timingTrust(st.interval);
    return `
      <h3 class="mt" style="margin-bottom:6px">مدت زمان دوام حرکت — و زمان تغییر روند</h3>
      ${trust.level === 'bad' ? `<div class="banner" style="margin:0 0 10px">${icon('info', 16)} ${esc(trust.text)}</div>` : ''}
      <div class="grid g2">
        <div><div id="tmChart"></div>
          <p class="fine">ساخته شده بر اساس رفتار واقعی قیمت پس از ${t.matchesUsed} نمودار مشابه گذشته، گام به گام — سپس متمایل شده تا در انتظار حرکت مورد انتظار به پایان برسد. باند سایه‌دار = نیمه میانی نتایج آن گذشته.</p></div>
        <div class="stack">
          <div class="grid g3">
            <div class="stat"><span class="k">${t.rising ? 'مدت صعود' : 'مدت نزول'}</span><span class="v">${esc(dur(main.bar))}</span></div>
            <div class="stat"><span class="k">${t.rising ? 'سقف تقریبی' : 'کف تقریبی'}</span><span class="v ${t.rising ? 'up' : 'down'}">${money(main.price)}</span><span class="s fine">${pct(main.pct, 1)}</span></div>
            <div class="stat"><span class="k">${t.turn ? 'تغییر روند پس از' : t.recover ? 'بازگشت پس از' : 'در انتهای افق'}</span><span class="v">${esc(dur(t.turn?.bar ?? t.recover?.bar ?? t.horizonBars))}</span></div>
          </div>
          <dl class="kv">
            <dt>بهترین پنجره زمانی برای ورود</dt><dd>${t.hold ? `${esc(dur(t.hold.fromBar))} – ${esc(dur(t.hold.toBar))}` : '—'}</dd>
            <dt>نمودارهای گذشته همچنان صعودی در سقف</dt><dd>${main.agreement === null || main.agreement === undefined ? '—' : `${Math.round(main.agreement)}٪`}</dd>
            <dt>وضعیت در انتهای افق زمانی</dt><dd class="${t.endPct >= 0 ? 'up' : 'down'}">${pct(t.endPct, 1)}</dd>
          </dl>
          <p class="fine ${trust.level === 'bad' ? 'down' : trust.level === 'good' ? '' : 'warn'}">${esc(trust.text)}</p>
          <p class="fine">در تمام بازه‌های زمانی: ${TESTED_TIMING.tests.toLocaleString('en-US')} آزمایش پیش‌رونده روی ${TESTED_TIMING.coins} ارز، ${TESTED_TIMING.peakHitPct}% موفقیت در برابر خط مبنای تصادفی ${TESTED_TIMING.baselinePct}%، و حرکت واقعاً در ${TESTED_TIMING.turnedInsideHorizonPct}% مواقع داخل افق زمانی تغییر جهت داده است.</p>
          <p class="fine warn">مزیت اندازه‌گیری‌شده زمان‌بندی کوچک است و بین اجراهای مختلف تغییر می‌کند. از آن برای برنامه‌ریزی پنجره خروج استفاده کنید، نه به عنوان دلیلی برای چشم‌پوشی از حد ضرر.</p>
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
      { name: 'مسیر مورد انتظار', color: cssVar('--accent'), width: 2.6, data: t.path.map((p) => ({ x: p.t, y: p.price })) },
      { name: t.rising ? 'سقف مورد انتظار' : 'کف مورد انتظار', color: cssVar(t.rising ? '--up' : '--down'), width: 0, data: [{ x: main.t, y: main.price }] },
    ], {
      bands: [{ color: cssVar('--accent'), alpha: 0.14, data: t.path.map((p) => ({ x: p.t, lo: p.lo, hi: p.hi })) }],
      divider: main.t, dividerLabel: t.rising ? 'سقف' : 'کف',
    });
  }

  // "حرکت چقدر طول می‌کشد و چه زمانی برمی‌گردد؟" — درست زیر احتمالات نمایش داده می‌شود،
  // زیرا پیش‌بینی جهت بدون زمان‌بندی، تنها نیمی از پاسخ است.
  function timingCardBlock() {
    const t = st.timing;
    if (!t?.ok || !t.shaped) return '';
    const dur = (bars) => horizonText(st.interval, bars);
    const main = t.rising ? t.peak : t.trough;
    const cls = t.rising ? 'up' : 'down';
    const trust = timingTrust(st.interval);
    return `
      <div class="timing-box mt">
        <div class="row spread"><b>${t.priceless ? `زمان رسیدن به ${t.rising ? 'سقف' : 'کف'}` : t.rising ? 'مدت زمان صعود' : 'مدت زمان نزول'}</b>
          <span class="chip ${t.priceless ? '' : cls}">${t.priceless ? `ثبت ${t.rising ? 'سقف' : 'کف'} در` : t.rising ? 'سقف در' : 'کف در'} ${esc(dur(main.bar))}</span></div>
        <div class="tl mt">
          <i class="tl-bar"></i>
          <span class="tl-mark ${cls}" style="left:${(main.bar / t.horizonBars) * 100}%" title="${t.rising ? 'سقف' : 'کف'}"></span>
          ${t.turn ? `<span class="tl-mark warn" style="left:${(t.turn.bar / t.horizonBars) * 100}%" title="تغییر روند"></span>` : ''}
          ${t.recover ? `<span class="tl-mark up" style="left:${(t.recover.bar / t.horizonBars) * 100}%" title="بازگشت"></span>` : ''}
        </div>
        <div class="row spread fine" style="margin-top:3px"><span>اکنون</span><span>${esc(dur(t.horizonBars))}</span></div>
        <p class="fine" style="margin:8px 0 0">
          ${t.priceless
            ? `در نمودارهای مشابه گذشته، ${t.rising ? 'سقف' : 'کف'} این ${esc(dur(t.horizonBars))} آینده حدود <b>${esc(dur(main.bar))}</b> بعد ثبت شده است. این زمان را نشان می‌دهد، نه جهت یا اندازه را: جهت روی این نمودار قابل اعتماد نیست.`
            : t.rising
            ? `ادامه قدرت بازار برای حدود <b>${esc(dur(main.bar))}</b>، با رسیدن به سقف نزدیک <b>${money(main.price)}</b> (${pct(main.pct, 1)})${t.turn ? `، و سپس افت تا ${pct(t.turn.pct, 1)} تا انتهای <b>${esc(dur(t.turn.bar))}</b>` : '، بدون بازگشت معکوس در این افق'}.`
            : `ادامه ضعف بازار برای حدود <b>${esc(dur(main.bar))}</b>، با ثبت کف نزدیک <b>${money(main.price)}</b> (${pct(main.pct, 1)})${t.recover ? `، همراه با شروع بازگشت صعودی از حدود <b>${esc(dur(t.recover.bar))}</b>` : '، بدون بازگشت واضح در این افق'}.`}
          ${!t.priceless && main.agreement !== null && main.agreement !== undefined ? ` ${Math.Round(main.agreement)}٪ از ${t.matchesUsed} نمودار مشابه گذشته در آن نقطه همچنان صعودی بوده‌اند.` : ''}
        </p>
        <p class="fine ${trust.level === 'bad' ? 'down' : trust.level === 'weak' ? 'warn' : 'muted'}" style="margin:6px 0 0">${trust.level === 'good' ? `زمان‌بندی ${TESTED_TIMING.byInterval[st.interval].hitPct}٪ موفقیت روی نمودارهای ${esc(st.interval)} در برابر خط مبنای ${TESTED_TIMING.byInterval[st.interval].baselinePct}٪ ثبت کرده است.` : trust.level === 'bad' ? `⚠ زمان‌بندی روی نمودارهای ${esc(st.interval)} قابل اعتماد نیست${bestTimingChart() ? ` — بهترین عملکرد روی ${esc(bestTimingChart().interval)} بوده، و حتی در آنجا هم مزیت کوچک است` : ''}.` : trust.level === 'unknown' ? 'زمان‌بندی روی این بازه زمانی اندازه‌گیری نشده است.' : `زمان‌بندی در اینجا به سختی از شانس فراتر می‌رود${TESTED_TIMING.byInterval[st.interval] ? ` (${TESTED_TIMING.byInterval[st.interval].hitPct}٪ در برابر ${TESTED_TIMING.byInterval[st.interval].baselinePct}٪)` : ''}.`}</p>
      </div>`;
  }

  // محدوده ۹۵ درصدی ویلسون برای نرخ موفقیت در n آزمایش، به صورت "56–84%".
  const wilson95 = (p, n) => {
    const z = 1.96, d = 1 + (z * z) / n, mid = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
    return `${Math.round((mid - half) * 100)}–${Math.round((mid + half) * 100)}٪`;
  };

  // بررسی متقاطع تک‌خطی از مطالعه تاریخچه بلندمدت، که در کنار پیش‌بینی نمایش داده می‌شود.
  async function paintHistLine() {
    const node = $('#histLine', el);
    if (!node) return;
    node.innerHTML = '<span class="fine muted">در حال بررسی سال‌های گذشته…</span>';
    let h;
    try { h = await computeHistory(st.histHorizon || 30); } catch (err) {
      node.innerHTML = `<p class="fine muted">مقایسه تاریخچه در دسترس نیست: ${esc(err?.message || 'منبع تاریخچه داده‌های کافی را برنگرداند')}.</p>`;
      return;
    }
    if (st.disposed) return;
    const target = $('#histLine', el);
    if (!target) return;
    if (!h.ok) { target.innerHTML = `<p class="fine muted">تاریخچه روزانه کافی روی ${esc(coin.symbol)} برای مقایسه چندساله وجود ندارد.</p>`; return; }
    const v = h.verdict, s = h.analogs.stats[h.horizon];
    const cls = v.direction === 'UP' ? 'up' : v.direction === 'DOWN' ? 'down' : 'flat';
    target.innerHTML = `
      <div style="padding:10px;border-radius:10px;background:var(--surface-2)">
        <div class="row spread"><b>روایت سال‌های گذشته</b><span class="chip ${cls === 'flat' ? '' : cls}">${v.direction === 'UP' ? 'صعودی' : v.direction === 'DOWN' ? 'نزولی' : 'متلاطم'} در ${h.horizon} روز آینده</span></div>
        <p class="fine" style="margin:6px 0 0">${h.weak ? `هیچ نمودار گذشته‌ای شباهت زیادی به امروز ندارد (بیشترین شباهت ${Math.round(h.analogs.matches[0].similarity * 100)}٪)، بنابراین این مورد صرفاً پس‌زمینه است. ` : ''}${s.upCount} مورد از ${s.total} نمونه مشابه گذشته صعود کرده‌اند، میانه ${pct(s.median, 1)}. ${v.accuracy !== null ? `این روش در ${v.validation.tests} آزمایش گذشته روی ${esc(coin.symbol)} ${(v.accuracy * 100).toFixed(0)}٪ مواقع درست بوده است (محدوده ۹۵ درصدی ${wilson95(v.validation.accuracy, v.validation.tests)}); در میان بسیاری از ارزها، این روش تطبیق نتوانست انتخاب همیشگی جهت رایج‌تر را شکست دهد.` : 'آزمایش‌های گذشته برای امتیازدهی به این روش در اینجا بسیار کم است.'}</p>
        <button class="btn sm ghost" style="margin-top:8px" id="openHist">مشاهده نمودارهای مشابه ←</button>
      </div>`;
    $('#openHist', el)?.addEventListener('click', () => {
      $$('#tabs [data-tab]', el).forEach((b) => b.classList.toggle('on', b.dataset.tab === 'history'));
      st.tab = 'history';
      drawTab();
      $('#tabs', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ------------------------------------------------------------ آزمایش گذشته (Backtest)
  async function runBt() {
    const iv = st.interval;
    // ارسال بازه زمانی تا بازپخش از همان حد ضرر و هدف اندازه‌گیری‌شده‌ای استفاده کند
    // که صفحه در برنامه معاملاتی چاپ می‌کند، به جای استفاده از یک جفت عدد ثابت.
    st.backtest = await runBacktest(st.candles.slice(-1000), { interval: iv });
    if (st.disposed || iv !== st.interval) return;
    remember(coin.symbol, iv, { backtest: st.backtest });
    if (st.backtest.ok) chart.setMarkers(st.backtest.trades.flatMap((t) => [{ t: t.entryTime, side: 'buy' }, { t: t.exitTime, side: 'sell' }]).concat(st.backtest.openTrade ? [{ t: st.backtest.openTrade.entryTime, side: 'buy' }] : []));
    if (st.tab === 'backtest') drawTab();
  }

  // ------------------------------------------------------------ تب‌ها
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
      const ro = recheckOverall(), rc = TESTED_ACCURACY.recheck;
      const trust = directionTrustFor(st.interval, st.ledger || loadLedger());
      const shown = shownProbUp(fc.probUp, st.interval, trust.trust), reliable = directionReliable(st.interval, trust.trust);
      body.innerHTML = `
        <div class="grid fc-grid">
          <div>
            <h3 style="margin-bottom:6px">پیش‌بینی مسیر قیمت · ${horizonText(st.interval, fc.horizon).replace(/^1 /, '')} آینده</h3>
            <div id="fcChart"></div>
            <p class="fine">خط پیوسته = قیمت واقعی. نواحی سایه‌دار = محدوده‌هایی که نیمی و ۸۰٪ از نتایج را در آزمایش‌ها حفظ کرده‌اند.${fc.leanRemoved ? ' خط میانی وجود ندارد: جهت روی این نمودار به طور قابل اعتمادی اندازه‌گیری نشده است، بنابراین محدوده بر روی قیمت امروز متمرکز شده است.' : ' خط‌چین = پیش‌بینی میانه.'}</p>
          </div>
          <div class="stack">
            <div class="grid g3">
              <div class="stat"><span class="k">احتمال صعود</span>${reliable
                ? `<span class="v ${shown >= 0.5 ? 'up' : 'down'}">${(shown * 100).toFixed(1)}٪</span>`
                : `<span class="v flat">—</span><span class="s fine">جهت قابل اعتمادی روی این نمودار وجود ندارد. ${rawLeanNote(fc)}</span>`}</div>
              ${fc.leanRemoved
                ? `<div class="stat"><span class="k">حرکت معمول</span><span class="v">${st.moveCall ? `±${st.moveCall.usualPct}٪` : '—'}</span><span class="s fine">${st.moveCall?.useful ? `احتمال حرکت ${st.moveCall.bigger ? 'بزرگ‌تر' : 'کوچک‌تر'} از حد معمول` : 'اندازه، هر دو سمت'}</span></div>
              <div class="stat"><span class="k">نیمی از مواقع بین</span><span class="v" style="font-size:15px">${usd(fc.range.p25)} – ${usd(fc.range.p75)}</span><span class="s fine">متمرکز بر قیمت امروز</span></div>`
                : `<div class="stat"><span class="k">بازدهی مورد انتظار</span><span class="v ${fc.expectedReturnPct >= 0 ? 'up' : 'down'}">${pct(fc.expectedReturnPct)}</span></div>
              <div class="stat"><span class="k">هدف</span><span class="v">${usd(fc.targetPrice)}</span></div>`}
            </div>
            <div class="kv">
              <dt>محدوده ۸۰٪ در افق زمانی</dt><dd>${usd(fc.range.p10)} – ${usd(fc.range.p90)} <span class="muted">(${coverage('band80')})</span></dd>
              ${fc.range.p05 ? `<dt>محدوده ۹۰٪ در افق زمانی</dt><dd>${usd(fc.range.p05)} – ${usd(fc.range.p95)} <span class="muted">(${coverage('band90')})</span></dd>` : ''}
              ${st.learned ? `<dt>یادگیری هوش مصنوعی <a class="fine" href="#/learn">(نحوه یادگیری)</a></dt><dd>ترکیب یادگرفته‌شده ${(st.learned.blendProb * 100).toFixed(1)}٪ صعودی · <span class="muted">${(() => {
                const earned = Object.values(st.learned.weights || {}).filter(Boolean).length;
                const speaking = Object.entries(st.learned.votes || {}).filter(([k, v]) => v && st.learned.weights?.[k]).length;
                const same = !speaking ? (earned ? `مشابه پیش‌بینی: ${earned} اندیکاتور ${earned > 1 ? '' : ''} دارای رای روی ${esc(st.interval)} در حال حاضر سیگنالی نمی‌دهند · ` : `مشابه پیش‌بینی: هنوز هیچ اندیکاتوری روی ${esc(st.interval)} رای کسب نکرده است · `) : '';
                const where = st.learned.cloud ? `در سابقه زنده ابر محاسباتی${st.learned.coins ? ` روی ${st.learned.coins} ارز` : ''}` : 'در این مرورگر';
                return same + (st.learned.champion === 'blend' ? `ترکیب نهایی تصمیم‌گیرنده است: عملکرد آن بهتر از پیش‌بینی بوده ${where}` : `پیش‌بینی همچنان تصمیم‌گیرنده است: ترکیب نهایی عملکرد بهتری نداشته ${where}`);
              })()}</span></dd>` : ''}
              <dt>دقت جهت در داده‌های دیده‌نشده</dt><dd>${e.accuracy !== null ? (e.accuracy * 100).toFixed(1) + '%' : '—'} <span class="muted">(${e.samples} آزمایش${e.accuracyRange ? ` · محدوده ۹۵ درصدی ${(e.accuracyRange[0] * 100).toFixed(0)}–${(e.accuracyRange[1] * 100).toFixed(0)}٪` : ''})</span></dd>
              <dt>دقت در زمان توافق قوی مدل‌ها</dt><dd>${e.confidentAccuracy !== null ? (e.confidentAccuracy * 100).toFixed(1) + '%' : '—'} <span class="muted">(${Math.round(e.confidentCoverage * 100)}٪ مواقع)</span></dd>
              <dt>خط مبنای ساده (پیش‌بینی همیشگی جهت رایج)</dt><dd>${(e.baseline * 100).toFixed(1)}٪</dd>
              <dt>دوره آزمایش</dt><dd>${(() => { const sameDay = new Date(e.validationFrom).toDateString() === new Date(e.validationTo).toDateString(); return sameDay ? `${dateTime(e.validationFrom)} → ${new Date(e.validationTo).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : `${dateTime(e.validationFrom, false)} → ${dateTime(e.validationTo, false)}`; })()}</dd>
              <dt>کندل‌های تحلیل‌شده</dt><dd>${fc.candlesUsed.toLocaleString()} · ${fc.computeMs} میلی‌ثانیه</dd>
            </div>
            ${fc.notes.filter((n) => !/recent unseen cases/.test(n)).length ? `<ul class="reasons">${fc.notes.filter((n) => !/recent unseen cases/.test(n)).map((n) => `<li class="s">${esc(n)}</li>`).join('')}</ul>` : ''}
          </div>
        </div>
        <h3 class="mt" style="margin-bottom:6px">مدل‌های پشت پرده پیش‌بینی</h3>
        <div class="tbl-wrap"><table class="tbl fit models-tbl"><thead><tr><th class="l">مدل</th><th>نظر صعودی</th><th>دقت در داده‌های دیده‌نشده</th><th>وزن</th></tr></thead><tbody>
          ${fc.models.map((m) => `<tr style="cursor:default"><td class="l wrap"><b>${esc(m.name)}</b></td><td class="${m.probUp >= 0.5 ? 'up' : 'down'}">${m.probUp !== null ? (m.probUp * 100).toFixed(1) + '%' : '—'}</td>
            <td>${m.accuracy !== null ? (m.accuracy * 100).toFixed(1) + '%' : '—'}<span class="acc-bar hide-p"><i style="width:${Math.max(0, Math.min(100, ((m.accuracy ?? 0.5) - 0.3) / 0.4 * 100))}%"></i></span></td><td>${m.weightPct}٪</td></tr>`).join('')}
        </tbody></table></div>
        <p class="fine mt">نحوه کارکرد: هر مدل روی تاریخچه خود این ارز آموزش دیده و سپس روی جدیدترین دوره‌ای که هرگز ندیده است آزمایش می‌شود. مدل‌هایی که پیش‌بینی‌های بهتری داشته باشند وزن بیشتری دریافت می‌کنند. بازار رمزارز پرنوسان است: نرخ جهت‌دار تنها زمانی مزیت محسوب می‌شود که در تعداد آزمایش‌های کافی از خط مبنا فراتر رود تا شانس نتواند آن را توجیه کند، و هیچ‌چیز قطعی نیست.</p>
        <p class="fine">آزمایش‌های مستقل این موتور، که هر پیش‌بینی صرفاً با داده‌های موجود در همان زمان انجام شده است. آخرین مورد${ro ? ` (${ro.tests.toLocaleString('en-US')} پیش‌بینی روی ${ro.coins} ارز، ${esc(ro.measuredOn)})` : ''} جهت را در <b>${ro ? ro.hit : TESTED_ACCURACY.all}٪</b> مواقع درست تشخیص داد، در مقایسه با <b>${ro ? ro.baseline : TESTED_ACCURACY.allBaseline}٪</b> برای نادیده گرفتن آن و انتخاب همیشگی جهتی که برای هر ارز در پیش‌بینی‌هایش رایج‌تر بوده است (با ده پیش‌بینی برای هر ارز، آن حد نصاب حتی به طور تصادفی هم بالای ۵۰٪ قرار می‌گیرد). تفکیک به تفکیک بازه زمانی: ${['1m', '5m', '15m', '1h', '4h', '1d'].filter((iv) => rc?.[iv]).map((iv) => `${iv} ${rc[iv].hit.toFixed(1)}٪ در برابر ${rc[iv].baseline.toFixed(1)}٪`).join(' · ')}. آزمایش انتشار پیش از آن (${TESTED_ACCURACY.tests.toLocaleString('en-US')} پیش‌بینی روی ${TESTED_ACCURACY.coins} ارز بزرگ، ${esc(TESTED_ACCURACY.measuredOn)}) دارای ${TESTED_ACCURACY.all}٪ در برابر ${TESTED_ACCURACY.allBaseline}٪ بود.${UNMEASURED.includes(st.interval) ? ` <b class="warn">این موتور هرگز روی نمودار ${esc(INTERVAL_LABEL[st.interval] || st.interval)} آزمایش نشده است، بنابراین هیچ دقت اندازه‌گیری‌شده‌ای در اینجا ندارد. نمودارهای ثانیه‌ای برای تماشای حرکت قیمت هستند — برای پیش‌بینی‌ای که بتوانید به آن استناد کنید از نمودار ۵ دقیقه‌ای یا کندتر استفاده کنید.</b>` : (TESTED_ACCURACY.noEdge || []).includes(st.interval) ? ` <b class="warn">روی نمودار ${esc(INTERVAL_LABEL[st.interval] || st.interval)} این موتور امتیازی معادل ${rc?.[st.interval] ? `${rc[st.interval].hit}٪ در برابر خط مبنای ${rc[st.interval].baseline}٪ در آخرین ارزیابی` : `${TESTED_ACCURACY[st.interval]}٪ در برابر خط مبنای ${TESTED_ACCURACY.baseline[st.interval]}٪`} کسب کرد — بدون مزیت. این پیش‌بینی را به عنوان پس‌زمینه بخوانید، نه دلیلی برای معامله.</b>` : st.interval === '1w' ? ` <b class="warn">نمودار هفتگی کندل‌های بسیار کمی برای آزمایش دارد، بنابراین هیچ‌کدام از موارد اینجا دقت اندازه‌گیری‌شده‌ای ندارند.</b>` : ''}</p>
        <p class="fine">در مجموع، این موتور در هیچ‌یک از آزمایش‌ها نتوانست خط مبنا را شکست دهد و به عنوان دارای عدم مزیت در ${(TESTED_ACCURACY.noEdge || []).join(', ')} فهرست شده است. ${esc(TESTED_ACCURACY.caveat)} احتمال نمایش‌داده‌شده در زیر را به عنوان توصیفی از آنچه اندیکاتورها دلالت دارند در نظر بگیرید، نه دلیلی برای اقدام.</p>`;
      body.insertAdjacentHTML('beforeend', timingSection());
      const lc = new LineChart($('#fcChart', body), { height: 300, yFormat: (v) => money(v), xFormat: (x) => shortTime(x, st.interval), tooltipX: (x) => dateTime(x) });
      st.charts.push(lc);
      const hist = st.candles.slice(-Math.max(60, fc.horizon * 5));
      const last = hist[hist.length - 1];
      const bandPts = [{ x: last.t, lo: last.c, hi: last.c }, ...fc.path.map((p) => ({ x: p.t, lo: p.p10, hi: p.p90 }))];
      const band50 = [{ x: last.t, lo: last.c, hi: last.c }, ...fc.path.map((p) => ({ x: p.t, lo: p.p25, hi: p.p75 }))];
      lc.set([
        { name: 'قیمت', color: cssVar('--text'), data: hist.map((c) => ({ x: c.t, y: c.c })), width: 1.8 },
        ...(fc.leanRemoved ? [] : [{ name: 'پیش‌بینی میانه هوش مصنوعی', color: accent, dash: true, data: [{ x: last.t, y: last.c }, ...fc.path.map((p) => ({ x: p.t, y: p.p50 }))], width: 2.2 }]),
      ], { bands: [{ color: accent, alpha: 0.1, data: bandPts }, { color: accent, alpha: 0.2, data: band50 }], divider: last.t, dividerLabel: 'اکنون' });
      drawTimingChart(body);
      return;
    }

    if (st.tab === 'patterns') {
      if (!fc) { body.innerHTML = `<div class="row"><span class="spinner"></span> جستجوی تاریخچه برای یافتن الگوهای مشابه…</div>`; return; }
      const pat = fc.ok ? fc.patterns : null;
      if (!pat?.matches?.length) { body.innerHTML = '<p class="muted">هیچ الگوی مشابهی با دقت کافی در این بازه زمانی پیدا نشد. بازه زمانی دیگری را امتحان کنید.</p>'; return; }
      const W = fc.window, top = pat.matches.slice(0, 5);
      const ups = pat.matches.filter((m) => m.futureReturnPct > 0).length;
      body.innerHTML = `
        <div class="row spread" style="margin-bottom:8px">
          <div><h3>نمودار امروز در مقایسه با مشابه‌ترین لحظات در تاریخچه ${esc(coin.symbol)}</h3>
          <p class="fine">مقایسه ${W} کندل آخر ${st.interval} با هر پنجره گذشته به همان طول. خطوط مقیاس‌بندی شده‌اند تا هر پنجره در نقطه ۱۰۰ به اتمام برسد.</p></div>
          <div class="chip ${ups / pat.matches.length >= 0.5 ? 'up' : 'down'}">${ups} مورد از ${pat.matches.length} نمودار مشابه در ادامه صعود کرده‌اند</div>
        </div>
        <div id="patChart"></div>
        <div class="match-list mt">${pat.matches.map((m, i) => `<div style="border-left:3px solid ${i < 5 ? `var(${SERIES[i]})` : 'var(--border)'}">
          <div><b>${dateTime(m.startTime, st.interval !== '1d' && st.interval !== '1w')}</b></div>
          <div class="muted">${(m.similarity * 100).toFixed(0)}٪ مشابه</div>
          <div>سپس: <b class="${m.futureReturnPct >= 0 ? 'up' : 'down'}">${pct(m.futureReturnPct)}</b></div>
          <div class="fine">سقف ${pct(m.maxUpPct, 1)} / کف ${pct(m.maxDownPct, 1)}</div></div>`).join('')}</div>
        <p class="fine mt">حرکات آتی تطابق‌های گذشته بر اساس نوسانات امروز تعدیل شده‌اند. نتیجه میانی: <b class="${pat.medianReturn >= 0 ? 'up' : 'down'}">${pct(pat.medianReturn * 100)}</b> طی ${horizonText(st.interval, fc.horizon)}.</p>`;
      const lc = new LineChart($('#patChart', body), { height: 320, yFormat: (v) => v.toFixed(1), xFormat: (x) => { const k = Math.round(x) - (W - 1); return k === 0 ? 'اکنون' : k < 0 ? `${k}` : `+${k}`; }, tooltipX: (x) => { const k = Math.round(x) - (W - 1); return k === 0 ? 'اکنون' : k < 0 ? `${-k} کندل قبل` : `${k} کندل بعد`; } });
      st.charts.push(lc);
      lc.set([
        ...top.map((m, i) => ({ name: `${dateTime(m.startTime, false)} (${(m.similarity * 100).toFixed(0)}٪)`, color: cssVar(SERIES[i]), alpha: 0.75, width: 1.5, data: m.series.map((v, k) => ({ x: k, y: v })) })),
        { name: `اکنون · ${coin.symbol}`, color: cssVar('--text'), width: 3, data: pat.currentSeries.map((v, k) => ({ x: k, y: v })) },
        fc.ok && { name: 'پیش‌بینی هوش مصنوعی', color: accent, dash: true, width: 2.4, data: [{ x: W - 1, y: 100 }, ...fc.path.map((p, k) => ({ x: W + k, y: (p.p50 / fc.lastPrice) * 100 }))] },
      ].filter(Boolean), { divider: W - 1, dividerLabel: 'اکنون' });
      return;
    }

    if (st.tab === 'news') {
      body.innerHTML = `<div id="newsBody">${skeleton(6, 22)}</div>`;
      (async () => {
        if (!backendEnabled()) { $('#newsBody', body).innerHTML = '<p class="muted">بخش اخبار در این نسخه پیکربندی نشده است.</p>'; return; }
        const rows = await getNews({ coin: coin.symbol, limit: 30 }).catch(() => []);
        if (st.tab !== 'news' || st.disposed) return;
        st.news = rows;
        $('#newsBody', body).innerHTML = rows.length ? `
          <p class="fine" style="margin-bottom:10px">${rows.length} ${rows.length === 1 ? 'خبر جدید' : 'خبر جدید'} برچسب‌خورده با نام <b>${esc(coin.symbol)}</b>، به ترتیب جدیدترین. تیترها به صورت خودکار جمع‌آوری شده و بدون ویرایش نمایش داده می‌شوند — پیش از اقدام بر اساس هر خبر، منبع را بررسی کنید.</p>
          <div class="news-list">${rows.map((r) => `
            <article class="news-item">
              ${safeUrl(r.image) ? `<img src="${esc(safeUrl(r.image))}" alt="" width="92" height="64" loading="lazy" style="width:92px;height:64px;object-fit:cover;border-radius:10px;flex:none">` : ''}
              <div style="min-width:0">
                <a class="ttl" href="${esc(safeUrl(r.link, '#/news'))}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>
                ${r.summary ? `<p class="fine" style="margin:4px 0 0">${esc(r.summary.slice(0, 180))}${r.summary.length > 180 ? '…' : ''}</p>` : ''}
                <div class="meta"><b>${esc(r.source)}</b><span>${ago(new Date(r.published_at).getTime())}</span>${(r.coins || []).filter((c) => c !== coin.symbol).slice(0, 4).map((c) => `<a href="#/coin/${esc(c)}" class="chip">${esc(c)}</a>`).join('')}</div>
              </div>
            </article>`).join('')}</div>
          <p class="fine mt"><b>نکته درباره پیش‌بینی:</b> این اخبار برای زمینه نمایش داده می‌شوند و هنگام پاسخگویی دستیار هوش مصنوعی درباره ${esc(coin.symbol)} در اختیار آن قرار می‌گیرند. این اخبار به عنوان ورودی برای مدل قیمت <b>استفاده نمی‌شوند</b> — دقت اعلام‌شده مدل ناشی از داده‌های قیمتی صرف است، و افزودن احساسات خبری اندازه‌گیری‌نشده آن عدد را به یک ادعای نادرست تبدیل می‌کند.</p>`
          : `<div class="empty">${icon('info', 20)}<p>هیچ خبر اخیری با برچسب ${esc(coin.symbol)} یافت نشد. سامانه جمع‌آوری هر ۲۰ دقیقه یک‌بار به‌روزرسانی می‌شود.</p><a class="btn sm" href="#/news">همه اخبار رمزارز</a></div>`;
        // بندانگشتی خراب به جای استفاده از هندلر درون‌خطی (که توسط سیاست امنیت محتوای صفحه مسدود می‌شود) در اینجا حذف می‌شود.
        $$('#newsBody img', body).forEach((img) => img.addEventListener('error', () => img.remove()));
      })();
      return;
    }

    if (st.tab === 'history') {
      drawHistoryTab(body);
      return;
    }

    if (st.tab === 'periods') {
      body.innerHTML = `<div class="row spread" style="margin-bottom:8px"><div><h3>مقایسه وضعیت فعلی با دوره‌های پیشین</h3><p class="fine">عملکرد دوره اخیر در مقایسه با دوره پیش از آن و تاریخ مشابه در یک و دو سال گذشته.</p></div>
        <div class="seg" id="perSeg"><button data-v="7">۷ روز</button><button data-v="30" class="on">۳۰ روز</button><button data-v="90">۹۰ روز</button><button data-v="365">۱ سال</button></div></div>
        <div id="perChart">${skeleton(6)}</div><div id="perStats" class="grid g4 mt"></div>`;
      const drawPeriods = async (days) => {
        let daily;
        try { daily = (await getCandles(coin, '1d', 1100)).candles; } catch { body.querySelector('#perChart').innerHTML = errorBox('تاریخچه روزانه در دسترس نیست'); return; }
        if (st.disposed || st.tab !== 'periods') return;
        const n = daily.length;
        const seg = (endIdx) => (endIdx - days < 0 ? null : daily.slice(endIdx - days, endIdx + 1));
        const periods = [
          ['جدیدترین', seg(n - 1), '--text'], ['دوره قبل', seg(n - 1 - days), '--series-1'],
          ['یک سال پیش', seg(n - 1 - 365), '--series-2'], ['دو سال پیش', seg(n - 1 - 730), '--series-7'],
        ].filter(([, s]) => s && s.length === days + 1);
        destroyCharts();
        $('#perChart', body).innerHTML = '';
        const lc = new LineChart($('#perChart', body), { height: 320, yFormat: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, xFormat: (x) => `روز ${Math.round(x)}`, tooltipX: (x) => `روز ${Math.round(x)} از ${days}`, zeroLine: 0 });
        st.charts.push(lc);
        lc.set(periods.map(([name, s, c]) => ({ name: `${name} (${dateTime(s[0].t, false)})`, color: cssVar(c), width: name === 'جدیدترین' ? 3 : 1.8, data: s.map((d, k) => ({ x: k, y: (d.c / s[0].c - 1) * 100 })) })));
        $('#perStats', body).innerHTML = periods.map(([name, s]) => {
          const ret = (s[s.length - 1].c / s[0].c - 1) * 100;
          let peak = s[0].c, dd = 0; for (const d of s) { peak = Math.max(peak, d.c); dd = Math.max(dd, (peak - d.c) / peak); }
          return `<div class="stat"><span class="k">${name}</span><span class="v ${ret >= 0 ? 'up' : 'down'}">${pct(ret)}</span><span class="s muted">حداکثر افت ${pct(-dd * 100, 1)}</span></div>`;
        }).join('');
      };
      bindSeg($('#perSeg', body), (v) => drawPeriods(+v));
      drawPeriods(30);
      return;
    }

    if (st.tab === 'backtest') {
      const bt = st.backtest;
      if (!bt) { body.innerHTML = `<div class="row"><span class="spinner"></span> در حال انجام آزمایش گذشته (Backtest)…</div>`; return; }
      if (!bt.ok) { body.innerHTML = `<p class="muted">${esc(bt.reason)}</p>`; return; }
      // عملکرد ضعیف در مقایسه با خرید و نگهداری، مفیدترین اطلاعات این صفحه است
      // و پنهان کردن آن صداقت نخواهد بود. آن را به زبان ساده بیان کنید.
      const lag = bt.totalReturnPct - bt.buyHoldPct;
      const verdict = bt.totalReturnPct < 0 && lag < -20
        ? `<div class="banner down" style="margin:0 0 12px"><b>این سیگنال‌ها روی نمودار ${esc(INTERVAL_LABEL[st.interval] || st.interval)} برای ${esc(coin.symbol)} کار نکردند.</b> پیروی از آن‌ها معادل ${pct(Math.abs(bt.totalReturnPct), 1, false)} زیان در برابر ${pct(bt.buyHoldPct, 1)} سود صرفاً با نگهداری بوده است. از بازه زمانی سریع‌تری استفاده کنید یا دارایی را نگه دارید — این بازه زمانی را با این سیگنال‌ها معامله نکنید.</div>`
        : lag < -10
          ? `<div class="banner" style="margin:0 0 12px">در این بازه زمانی، سیگنال‌ها عملکردی <b>ضعیف‌تر از روش خرید و نگهداری ساده</b> به میزان ${pct(Math.abs(lag), 1, false)} داشته‌اند. نگهداری دارایی گزینه بهتری در اینجا بوده است.</div>`
          : bt.tradeCount < 10
            ? '<div class="banner" style="margin:0 0 12px">کمتر از ۱۰ معامله — حجم نمونه بسیار کوچک است و نمی‌توان نتیجه‌گیری قطعی کرد. این بخش را به عنوان نمونه نمایشی در نظر بگیرید، نه سند قطعی.' : '';
      body.innerHTML = `
        ${verdict}
        <p class="fine" style="margin-bottom:10px">نتیجه احتمالی در صورت اجرای تمام نقاط ورودی این موتور روی ${bt.bars} کندل آخر ${esc(st.interval)} — فقط خرید (Long)، با کارمزد ۰.۱٪ در هر طرف، استفاده از همان حد ضرر و هدف نشان‌داده‌شده در طرح بالا (${geometryFor(st.interval).stopAtr} برابر حد ضرر ATR، هدف ${geometryFor(st.interval).rr}R) و بدون جابجایی به نقطه سربه‌سر (Break-even)، زیرا اندازه‌گیری‌ها نشان داده‌اند انتقال حد ضرر به نقطه سربه‌سر هزینه‌بر است.</p>
        <div class="grid g4">
          <div class="stat"><span class="k">بازدهی استراتژی</span><span class="v ${bt.totalReturnPct >= 0 ? 'up' : 'down'}">${pct(bt.totalReturnPct)}</span></div>
          <div class="stat"><span class="k">خرید و نگهداری</span><span class="v ${bt.buyHoldPct >= 0 ? 'up' : 'down'}">${pct(bt.buyHoldPct)}</span></div>
          <div class="stat"><span class="k">نرخ موفقیت</span><span class="v">${bt.winRate ?? '—'}٪</span><span class="s muted">${bt.tradeCount} معامله</span></div>
          <div class="stat"><span class="k">حداکثر افت سرمایه</span><span class="v ${bt.maxDrawdownPct > 0 ? 'down' : 'flat'}">${pct(-bt.maxDrawdownPct)}</span><span class="s muted">عامل سود ${bt.profitFactor ?? '—'}</span></div>
        </div>
        <div id="btChart" class="mt"></div>
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th class="l">زمان ورود</th><th>قیمت ورود</th><th>قیمت خروج</th><th>نتیجه</th><th>دلیل خروج</th></tr></thead><tbody>
          ${bt.trades.slice(-15).reverse().map((t) => `<tr style="cursor:default"><td class="l">${dateTime(t.entryTime)}</td><td>${money(t.entry)}</td><td>${money(t.exit)}</td><td class="${t.returnPct >= 0 ? 'up' : 'down'}">${pct(t.returnPct)}</td><td>${t.reason}</td></tr>`).join('') || '<tr><td colspan="5" class="l muted">هیچ معامله‌ای در این بازه تکمیل نشده است.</td></tr>'}
        </tbody></table></div>`;
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
      body.innerHTML = `<div class="grid g2"><div><h3 style="margin-bottom:8px">دفتر سفارش (Order Book)</h3><div id="book">${skeleton(10, 14)}</div></div><div><h3 style="margin-bottom:8px">معاملات اخیر</h3><div id="trades">${skeleton(10, 14)}</div></div></div>`;
      const drawBook = async () => {
        const [d, tr] = await Promise.all([getDepth(pair, 15), getTrades(pair, 20)]);
        if (st.tab !== 'book' || st.disposed) return;
        if (d) {
          const maxQ = Math.max(...d.bids.map((b) => b[1] * b[0]), ...d.asks.map((a) => a[1] * a[0]));
          const row = (p, q, side) => `<div class="book-row"><i style="width:${((p * q) / maxQ) * 100}%;background:var(--${side})"></i><span class="${side}">${money(p)}</span><span>${amount(q)}</span></div>`;
          $('#book', body).innerHTML = `<div class="book"><div><div class="row spread fine"><span>خرید (Bid)</span><span>مقدار</span></div>${d.bids.map(([p, q]) => row(p, q, 'up')).join('')}</div>
            <div><div class="row spread fine"><span>فروش (Ask)</span><span>مقدار</span></div>${d.asks.map(([p, q]) => row(p, q, 'down')).join('')}</div></div>
            <p class="fine mt">اسپرد (اختلاف خرید و فروش): ${pct(((d.asks[0][0] - d.bids[0][0]) / d.bids[0][0]) * 100, 4, false)}</p>`;
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
          ${r.gapPct !== null ? `<p style="margin-bottom:10px">ارزان‌ترین برای خرید: <b>${esc(r.bestBuy.exchange)}</b> با قیمت ${usd(r.bestBuy.ask)} · بهترین برای فروش: <b>${esc(r.bestSell.exchange)}</b> با قیمت ${usd(r.bestSell.bid)} · اختلاف <b class="${r.gapPct > 0 ? 'up' : 'flat'}">${pct(r.gapPct, 3)}</b> <span class="fine">(پیش از کسر کارمزد و زمان انتقال)</span></p>` : ''}
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">صرافی</th><th class="l">جفت ارز</th><th>قیمت</th><th>نسبت به میانه</th><th>اسپرد</th><th>۲۴ ساعت</th><th>حجم ۲۴ ساعت</th></tr></thead><tbody>
          ${rows.map((q) => `<tr style="cursor:default"><td class="l"><b>${esc(q.exchange)}</b></td><td class="l muted">${esc(q.pair)}</td><td>${usd(q.price)}</td><td class="${q.deviationPct >= 0 ? 'up' : 'down'}">${pct(q.deviationPct, 3)}</td><td>${pct(q.spreadPct, 3, false)}</td><td>${changeHtml(q.change24h)}</td><td>${compact(q.vol)}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="fine mt">${r.rows.filter((x) => !x.ok).map((x) => x.exchange).join(', ') || 'همه صرافی‌ها پاسخ دادند'}${r.rows.some((x) => !x.ok) ? ': لیست نشده یا غیرقابل دسترس.' : '.'} <a class="acc" href="#/exchanges/${esc(coin.symbol)}">مشاهده مقایسه کامل ←</a></p>` : errorBox('هیچ صرافی‌ای قیمتی برای این ارز برنگرداند.');
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
        // فراخوانی که با خطا مواجه شده و ارزی که واقعاً سقف عرضه مشخصی ندارد،
        // پیش‌تر به شکل کاملاً یکسانی نمایش داده می‌شدند، بنابراین یک درخواست محدودشده (Throttled)
        // به خواننده القا می‌کرد که بیت‌کوین — با سقف ۲۱ میلیون واحدی — عرضه نامحدودی دارد.
        const loaded = !!p && !p.unavailable;
        const unknown = loaded ? '—' : '<span class="muted">بارگذاری‌نشده</span>';
        const note = p?.unavailable
          ? '<p class="fine warn">داده‌های مرجع بارگذاری نشدند — ارائه‌دهنده درخواست‌های رایگان را محدود کرده است. ارقام زیر نامشخص هستند، نه غایب. لطفاً پس از یک دقیقه دوباره تلاش کنید.</p>'
          : p === null
            ? '<p class="fine muted">هیچ پروفایل مرجعی برای این ارز منتشر نشده است، بنابراین ارقام زیر به جای غایب بودن، نامشخص هستند.</p>'
            : '';
        body.innerHTML = `<div class="grid g2">
          <div><h3 style="margin-bottom:8px">درباره ${esc(coin.name)}</h3>${note}<p class="muted" style="line-height:1.6">${esc(p?.description || (loaded ? 'توضیحاتی در دسترس نیست.' : ''))}</p>
            <div class="row mt">${(p?.categories || []).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
            <div class="row mt">${safeUrl(p?.homepage) ? `<a class="btn sm" target="_blank" rel="noopener noreferrer" href="${esc(safeUrl(p.homepage))}">وب‌سایت ↗</a>` : ''}${safeUrl(p?.explorer) ? `<a class="btn sm" target="_blank" rel="noopener noreferrer" href="${esc(safeUrl(p.explorer))}">کاوشگر (Explorer) ↗</a>` : ''}</div></div>
          <dl class="kv">
            <dt>عرضه در گردش</dt><dd>${compact(coin.circulatingSupply, '')} ${esc(coin.symbol)}</dd>
            <dt>کل عرضه</dt><dd>${p?.totalSupply ? compact(p.totalSupply, '') : unknown}</dd>
            <dt>حداکثر عرضه</dt><dd>${p?.maxSupply ? compact(p.maxSupply, '') : loaded ? 'بدون سقف' : unknown}</dd>
            <dt>ارزش بازار کاملاً رقیق‌شده (FDV)</dt><dd>${p?.fdv ? compact(p.fdv) : unknown}</dd>
            <dt>بالاترین قیمت تاریخی</dt><dd>${usd(coin.ath)}${p?.athDate ? ` <span class="muted">${dateTime(p.athDate, false)}</span>` : ''}</dd>
            <dt>تغییر ۳۰ روزه</dt><dd>${Number.isFinite(+p?.change30d) ? changeHtml(p.change30d) : unknown}</dd>
            <dt>تغییر ۱ ساله</dt><dd>${Number.isFinite(+p?.change1y) ? changeHtml(p.change1y) : unknown}</dd>
            <dt>تاریخ راه‌اندازی</dt><dd>${p?.genesisDate || unknown}</dd>
          </dl></div>`;
      });
    }
  }

  // ------------------------------------------------------------ تاریخچه و چرخه‌ها
  // "وقتی نمودار این ارز مثل امروز بود، چه اتفاقی افتاد؟"
  // روی کندل‌های روزانه اجرا می‌شود تا بتواند در طول چرخه‌های صعودی و نزولی گذشته به عقب بازگردد.
  const MONTHS = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];

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
    body.innerHTML = `<div class="row"><span class="spinner"></span> جستجوی تاریخچه کامل روزانه ${esc(coin.symbol)} برای یافتن شرایط شبیه به امروز…</div>`;
    let h;
    try { h = await computeHistory(horizon); } catch (e) { body.innerHTML = errorBox(e.message); return; }
    if (st.disposed || st.tab !== 'history') return;

    const hzSeg = `<div class="seg" id="hzSeg">${[7, 30, 90].map((d) => `<button data-v="${d}" class="${d === horizon ? 'on' : ''}">${d} روز آینده</button>`).join('')}</div>`;

    if (!h.ok) {
      body.innerHTML = `<div class="row spread" style="margin-bottom:10px"><h3>تاریخچه و چرخه‌ها</h3>${hzSeg}</div>
        <p class="muted">${esc(h.reason || 'تاریخچه روزانه کافی برای این ارز وجود ندارد.')}</p>
        ${h.season ? seasonBlock(h.season) : ''}`;
      bindSeg($('#hzSeg', body), (v) => drawHistoryTab(body, +v));
      return;
    }

    const v = h.verdict, s = h.analogs.stats[horizon], a = h.analogs;
    const dirClass = v.direction === 'UP' ? 'up' : v.direction === 'DOWN' ? 'down' : 'flat';
    const dirWord = v.direction === 'UP' ? 'از نظر تاریخی ← صعودی' : v.direction === 'DOWN' ? 'از نظر تاریخی ← نزولی' : 'از نظر تاریخی ← متلاطم';
    const reliable = v.accuracy !== null;
    const yrs = (h.years || []).filter((y) => y.points.length > 20);

    body.innerHTML = `
      <div class="row spread" style="margin-bottom:10px">
        <div><h3>رفتار ${esc(coin.symbol)} در دفعات مشابه گذشته</h3>
        <p class="fine">مقایسه <b>${h.window} روز</b> آخر امروز با تمام پنجره‌های ۴۵ روزه در تاریخچه روزانه ${esc(coin.symbol)} (${dateTime(h.firstDate, false)} ← تاکنون، ${h.days.toLocaleString()} روز). شکل نمودار مقایسه می‌شود، نه سطح قیمت، بنابراین نمودار ۳۰۰ دلاری و ۳۰,۰۰۰ دلاری می‌توانند با هم تطابق داشته باشند.</p></div>
        ${hzSeg}
      </div>

      ${h.weak ? `<div class="banner" style="margin:0 0 10px">${icon('info', 16)} هیچ‌کدام از موارد تاریخچه ${esc(coin.symbol)} شباهت زیادی به نمودار امروز ندارند — مشابه‌ترین مورد در زیر تنها دارای ${Math.round(h.analogs.matches[0].similarity * 100)}٪ شباهت است. این بخش را به عنوان پس‌زمینه بخوانید، نه سیگنال معاملاتی.</div>` : ''}
      <div class="hist-verdict">
        <div><div class="dir ${dirClass}">${dirWord}</div><div class="fine">${Math.round(v.probUp * 100)}٪ از موارد مشابه طی ${horizon} روز آینده صعود کرده‌اند</div></div>
        <div style="flex:1;min-width:200px">
          <div class="meter"><i style="width:${Math.round(v.probUp * 100)}%;background:var(--${v.probUp >= 0.5 ? 'up' : 'down'})"></i></div>
          <div class="row spread fine" style="margin-top:4px"><span>${s.upCount} صعودی</span><span>${s.total - s.upCount} نزولی</span></div>
        </div>
        <div class="grid g3" style="flex:2;min-width:260px">
          <div class="stat"><span class="k">حرکت میانه پس از آن</span><span class="v ${s.median >= 0 ? 'up' : 'down'}">${pct(s.median)}</span></div>
          <div class="stat"><span class="k">بهترین / بدترین حالت</span><span class="v" style="font-size:16px"><span class="${s.best >= 0 ? 'up' : 'down'}">${pct(s.best, 1)}</span> / <span class="${s.worst >= 0 ? 'up' : 'down'}">${pct(s.worst, 1)}</span></span></div>
          <div class="stat"><span class="k">دقت این روش در اینجا</span><span class="v ${reliable && v.accuracy >= 0.55 ? 'up' : reliable && v.accuracy < 0.5 ? 'down' : ''}">${reliable ? `${(v.accuracy * 100).toFixed(0)}٪` : '—'}</span><span class="s fine">${h.validation?.tests || 0} آزمایش گذشته</span></div>
        </div>
      </div>

      <p class="mt">${esc(v.text)}</p>

      <h3 class="mt" style="margin-bottom:6px">گذشته در برابر امروز — و آنچه پس از آن رخ داد</h3>
      <div id="analogChart"></div>
      <p class="fine">تمام خطوط در نقطه انطباق نمودار با امروز روی مقدار ۱۰۰ تنظیم شده‌اند. سمت چپ خط عمودی شکل منطبق گذشته است؛ سمت راست آن اتفاقی است که واقعاً پس از آن رخ داده است. خط ضخیم مربوط به امروز است.</p>

      <div class="analog-list mt">
        ${a.matches.map((m, i) => `
          <div class="analog-row" style="border-left:3px solid ${i < 5 ? `var(${SERIES[i]})` : 'var(--border)'}">
            <div><div class="date">${dateTime(m.endTime, false)}</div><div class="fine">${dateTime(m.startTime, false)} ← زمان انطباق</div></div>
            <div>
              <div class="simbar"><i style="width:${Math.round(m.similarity * 100)}%"></i></div>
              <div class="fine" style="margin-top:3px">${(m.similarity * 100).toFixed(0)}٪ شباهت شکل · سقف ${pct(m.maxUpPct, 1)} / کف ${pct(m.maxDownPct, 1)} ظرف ۹۰ روز</div>
            </div>
            <div style="text-align:right">
              ${h.horizons.map((hz) => `<div class="fine">${hz} روزه: <b class="${m.outcomes[hz] >= 0 ? 'up' : 'down'}">${pct(m.outcomes[hz], 1)}</b></div>`).join('')}
            </div>
          </div>`).join('')}
      </div>

      ${yrs.length ? `
        <h3 class="mt" style="margin-bottom:6px">سال به سال — آیا سال جاری از روی سناریوی قدیمی پیروی می‌کند؟</h3>
        <div id="yearChart"></div>
        <div class="row mt">${yrs.map((y) => `<span class="chip ${y.totalPct >= 0 ? 'up' : 'down'}">${y.year}: ${pct(y.totalPct, 0)}${y.year === new Date().getUTCFullYear() ? ' تا کنون' : y.complete ? '' : ' (بخش از سال)'}</span>`).join('')}</div>
        <p class="fine">هر خط از مقدار ۰٪ در اول ژانویه آغاز می‌شود. سالی که دچار سقوط شده و سپس بهبود یافته دقیقاً همان شکل را نشان می‌دهد — و این هدف اصلی است: به شما نشان می‌دهد روند بازیابی از یک افت شدید برای این ارز در گذشته چگونه بوده است.</p>` : ''}

      ${seasonBlock(h.season)}

      <div class="card mt" style="background:var(--surface-2)">
        <h3>میزان اعتماد به این بخش</h3>
        <p class="fine">همین روال روی تاریخچه ${esc(coin.symbol)} بازپخش شد: در ${h.validation?.tests || 0} تاریخ گذشته، با استفاده صرفاً از داده‌های موجود در همان زمان، الگوهای مشابه پیدا شدند، جهت ${horizon} روزه پیش‌بینی شد، و در مقایسه با واقعیت امتیازدهی شد. این پیش‌بینی در <b>${reliable ? `${(v.accuracy * 100).toFixed(0)}٪` : '—'}</b> مواقع درست بوده است${reliable && v.accuracy < 0.55 ? ' — اندکی بهتر از شیر یا خط، بنابراین این بخش را به عنوان زمینه در نظر بگیرید، نه سیگنال معاملاتی' : ''}. تاریخچه تکرار می‌شود اما کپی دقیق نمی‌شود. این اطلاعات را با سیگنال زنده و پیش‌بینی هوش مصنوعی ترکیب کنید و به تنهایی معامله نکنید.</p>
      </div>`;

    bindSeg($('#hzSeg', body), (val) => drawHistoryTab(body, +val));

    // پوشش مقایسه تطبیقی (Analog overlay)
    const W = h.window, maxH = Math.max(...h.horizons);
    const lc = new LineChart($('#analogChart', body), {
      height: 340, yFormat: (val) => val.toFixed(0),
      xFormat: (x) => { const k = Math.round(x) - (W - 1); return k === 0 ? 'انطباق' : `${k > 0 ? '+' : ''}${k} روز`; },
      tooltipX: (x) => { const k = Math.round(x) - (W - 1); return k === 0 ? 'روز انطباق نمودارها' : k < 0 ? `${-k} روز قبل` : `${k} روز بعد`; },
    });
    st.charts.push(lc);
    lc.set([
      ...a.matches.slice(0, 5).map((m, i) => ({
        name: `${dateTime(m.endTime, false)} (${(m.similarity * 100).toFixed(0)}٪)`,
        color: cssVar(SERIES[i]), alpha: 0.8, width: 1.6,
        data: m.series.map((val, k) => ({ x: k, y: val })),
      })),
      { name: `امروز · ${coin.symbol}`, color: cssVar('--text'), width: 3.2, data: a.current.map((val, k) => ({ x: k, y: val })) },
      { name: 'میانگین موارد مشابه', color: cssVar('--accent'), dash: true, width: 2.4, data: averagePath(a.matches, W + maxH) },
    ], { divider: W - 1, dividerLabel: 'امروز' });

    if (yrs.length) {
      const yc = new LineChart($('#yearChart', body), {
        height: 300, yFormat: (val) => `${val >= 0 ? '+' : ''}${val.toFixed(0)}%`,
        xFormat: (x) => MONTHS[Math.min(11, Math.max(0, Math.floor(x / 30.4)))],
        tooltipX: (x) => `روز ${Math.round(x)} · ${MONTHS[Math.min(11, Math.floor(x / 30.4))]}`,
        zeroLine: 0,
      });
      st.charts.push(yc);
      const thisYear = new Date().getUTCFullYear();
      yc.set(yrs.map((y, i) => ({
        name: `${y.year}${y.year === thisYear ? ' (اکنون)' : ''}`,
        color: y.year === thisYear ? cssVar('--text') : cssVar(SERIES[i % SERIES.length]),
        width: y.year === thisYear ? 3 : 1.6,
        alpha: y.year === thisYear ? 1 : 0.8,
        data: y.points,
      })));
    }
  }

  function seasonBlock(season) {
    if (!season?.summary?.some((m) => m.count)) {
      return `<div class="card empty mt"><h3>فصل‌بندی در دسترس نیست</h3><p>تعداد ماه‌های تقویمی کامل در تاریخچه موجود برای محاسبه وضعیت فصلی ${esc(coin.symbol)} کافی نیست.</p></div>`;
    }
    const cur = season.currentMonth;
    return `
      <h3 class="mt" style="margin-bottom:6px">فصل‌بندی — عملکرد معمول ${esc(coin.symbol)} در هر ماه</h3>
      <div class="season-grid">
        ${season.summary.map((m) => m.count ? `
          <div class="${m.month === cur ? 'now' : ''}" title="${m.count} سال · ${m.winRate.toFixed(0)}٪ مثبت">
            <div class="m">${MONTHS[m.month]}</div>
            <div class="r ${m.avg >= 0 ? 'up' : 'down'}">${m.avg >= 0 ? '+' : ''}${m.avg.toFixed(0)}٪</div>
            <div class="fine">${m.winRate.toFixed(0)}٪↑</div>
          </div>` : `<div><div class="m">${MONTHS[m.month]}</div><div class="r muted">—</div></div>`).join('')}
      </div>
      <p class="fine mt">بازدهی میانگین در هر ماه تقویمی در تمامی ماه‌های کامل تاریخچه این ارز، به همراه درصد سال‌هایی که با نتیجه مثبت به پایان رسیده‌اند. کادر برجسته مربوط به ماه جاری است. نمونه کوچک — تعداد معدودی سال قانون کلی طبیعت محسوب نمی‌شود.</p>`;
  }

  function averagePath(matches, len) {
    const out = [];
    for (let k = 0; k < len; k++) {
      let sum = 0, n = 0;
      for (const m of matches) if (Number.isFinite(m.series[k])) { sum += m.series[k]; n++; }
      if (n) out.push({ x: k, y: sum / n });
    }
    return out;
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
  if (['1d', '1w', '4h'].includes(interval)) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ارزی که در لیست وجود ندارد: اعلام دلیل و پیشنهاد نزدیک‌ترین نام‌ها به جای بن‌بست.
async function notFound(sym, retry) {
  if (dataStatus.demo) return errorBox(`در حال حاضر امکان دسترسی به داده‌های زنده بازار وجود ندارد، بنابراین امکان جستجوی "${sym}" نیست. اپلیکیشن به طور خودکار به داده‌های زنده باز خواهد گشت.`, retry);
  const list = await markets().catch(() => []);
  const q = sym.toLowerCase();
  const near = list.filter((c) => c.symbol.toLowerCase().startsWith(q.slice(0, 2)) || (c.name || '').toLowerCase().includes(q)).slice(0, 6);
  return `<div class="card empty"><h1 style="font-size:1.3rem">ارزی به نام "${esc(sym)}" وجود ندارد</h1>
    <p>این نماد در میان ${list.length || 250} ارز بزرگ تحت پوشش اپلیکیشن قرار ندارد، یا نماد آن به اشتباه وارد شده است. نام یا نماد را در بالای صفحه جستجو کنید.</p>
    ${near.length ? `<p class="fine">مشابه‌ترین موارد:</p><p class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">${near.map((c) => `<a class="btn sm" href="#/coin/${encodeURIComponent(c.symbol)}">${esc(c.symbol)} · ${esc(c.name)}</a>`).join('')}</p>` : ''}
    <a class="btn primary" href="#/">مرور همه ارزها</a></div>`;
}