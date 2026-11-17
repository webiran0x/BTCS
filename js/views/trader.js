// معامله‌گر خودکار هوش مصنوعی که با پول شبیه‌سازی‌شده (مجازی) اجرا می‌شود.
import { markets, getCandles, isStable, isTestedSource, findCoin, INTERVAL_MS, knownVenue, findVenue } from '../api/market.js';
import { newState, rescaleAccount, stats, equity, closeManual, recordRealTrade, DEFAULT_CONFIG, PULLBACK_RSI, CHART_TESTED, rulesForChart, rulesInWords, PER_COIN_RULES, CUSTOM_DEFAULT, TRADER_CHARTS, MAX_COINS, TESTED_COINS, bestTestedChart, earningsByChart, settingsWarnings, backtestSettings, expectedYield, PAPER_NOTICE, DEMO_NOTICE, REAL_NOTICE, logCheck, VOL_SCALE } from '../lib/autotrader.js';
import { reviewTrades, activeLessons, diagnose, MIN_TRADES } from '../lib/tradelearn.js';
import { configFrom, ownRulesOn as ownRulesFor, runConfig, heldOffList, backfillNeeds, checkAccount, reviewStep } from '../lib/traderrun.js';
import { learningPass } from '../lib/learnpass.js';
import { cloudLearning } from '../lib/cloudlearn.js';
import { candleCache } from '../lib/candlecache.js';
import { parseTradeCsv, matchFills } from '../lib/importer.js';
import { tradesCsv, downloadText, reportHtml } from '../lib/export.js';
import { LineChart } from '../charts/line.js';
import { $, $$, icon, toast, skeleton, coinLogo, modal, bindSeg } from '../ui.js';
import { esc, pct, money, compact, dateTime, ago, amount, price } from '../format.js';
import { fx } from '../api/fx.js';
import { load, save, remove } from '../store.js';
import { auth, backendEnabled } from '../api/backend.js';
import { backupFor, restoreBackup, missingTrades } from '../lib/cloudsync.js';
import { openAuth } from './auth.js';
import { initialSession, sessionReducer, sessionLabel, newLedger, learningStatus, accuracySparkline, sparklineSvg, LEARN_KEY, loadLedger, saveLedger, recordForecast, resolveDueLedger, TREND_WORDS } from '../lib/selfimprove.js';
import { runForecast } from '../lib/compute.js';
import { DEFAULT_HORIZON } from '../ai/context.js';

// اجرای تابع fn روی آیتم‌ها، حداکثر n مورد به صورت همزمان.
async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => { while (queue.length) await fn(queue.shift()); }));
}

export const title = 'معاملات';

const CFG_KEY = 'traderCfg';
const STATE_KEY = 'traderState';
const RUN_KEY = 'traderRunning';
const SESSION_KEY = 'aiSession';
const AUTO_KEY = 'traderAutoStarted';
const LESSONS_KEY = 'traderLessons';   // گزارش تغییرات بخش خودارزیابی
const AUTOLEARN_KEY = 'traderAutoLearn';

export async function render(el) {
  // prices: جدیدترین قیمت شناخته‌شده برای هر ارز. priceFrom مشخص می‌کند قیمت از کجا آمده است
  // (تیک لحظه‌ای، یا آخرین کندل زمانی که هنوز تیکی دریافت نشده است).
  const st = { disposed: false, charts: [], prices: {}, priceFrom: {}, running: false, noExchange: [] };
  // پس از اولین بررسی، هر بررسی بعدی فقط کندل‌های جدید را درخواست می‌کند
  const candlesFor = candleCache(getCandles, { window: 500, stepOf: (iv) => INTERVAL_MS[iv] });
  // حداکثر تعداد کندل‌های از دست‌رفته یک ارز نگهداری‌شده که واکشی می‌شوند (در تایم‌فریم ۵ دقیقه: ۲۰ روز).
  const BACKFILL_MAX = 6000;
  // ارزهایی که پیوسته بدون داده قیمتی برمی‌گردند (چند بررسی متوالی ناموفق در حالی که بقیه بارگذاری شده‌اند)
  // تا صفحه یک بار این موضوع را اعلام کند و پیشنهاد حذف آن‌ها را بدهد.
  const NODATA_KEY = 'traderNoData';
  // ماشین وضعیت رسمی نشست: آماده به کار ← در حال اجرا ← متوقف‌شده ← در حال اجرا، و بازنشانی از هر وضعیت.
  let session = load(SESSION_KEY, null);
  if (!session || !['idle', 'running', 'stopped'].includes(session.status)) {
    const hasState = !!load(STATE_KEY, null);
    session = initialSession(hasState && load(RUN_KEY, false) === true ? 'running' : hasState ? 'stopped' : 'idle');
    save(SESSION_KEY, session);
  }
  let autoOn = session.status === 'running';
  // انتخاب‌های کاربر و مواردی که بخش خودارزیابی آموخته است
  const cfg = configFrom(load(CFG_KEY, {}));
  let state = load(STATE_KEY, null);
  // قوانین اختصاصی هر ارز: برای حساب‌های روزانه فعال است مگر اینکه خاموش شود.
  const ownRulesOn = () => ownRulesFor(cfg, state);
  // آنچه حساب واقعاً معامله می‌کند: تنظیمات، قوانین اندازه‌گیری‌شده نمودار و درس‌های خودارزیابی.
  const effective = (iv = state?.interval || cfg.interval) => rulesForChart(cfg, iv, load(LESSONS_KEY, []));

  const applySession = (event) => {
    const next = sessionReducer(session, event);
    if (next !== session) {
      session = next;
      autoOn = next.status === 'running';
      save(SESSION_KEY, session);
      save(RUN_KEY, autoOn);
    }
    syncSessionChip();
    syncRunButtons();
  };

  function syncSessionChip() {
    const chip = $('#sessionChip', el);
    if (!chip) return;
    // فقط در صورت تغییر بازنویسی شود تا انیمیشن پالس آن مدام ری‌استارت نشود
    const cls = `session-chip ${session.status}`, html = `<i></i>${sessionLabel(session.status)}`;
    if (chip.className !== cls) chip.className = cls;
    if (chip.innerHTML !== html) chip.innerHTML = html;
  }

  const all = await markets().catch(() => []);
  // بهترین قیمت واقعی که این صفحه برای یک ارز در اختیار دارد: تیک زنده، آخرین کندل، یا لیست بازار.
  const priceOf = (sym) => {
    if (Number.isFinite(st.prices[sym])) return st.prices[sym];
    const c = all.find((x) => x.symbol === sym && x.source !== 'demo');
    return Number.isFinite(c?.price) && c.price > 0 ? c.price : null;
  };
  // دریافت قیمت تازه از صرافی برای یک ارز از طریق آخرین کندل ۱ دقیقه‌ای آن.
  async function fetchPrice(sym) {
    const coin = all.find((c) => c.symbol === sym);
    if (!coin) return null;
    try {
      const r = await getCandles(coin, '1m', 3);
      const px = r.candles.at(-1)?.c;
      if (!isTestedSource(r) || !Number.isFinite(px)) return null;
      if (st.priceFrom[sym] !== 'live') { st.prices[sym] = px; st.priceFrom[sym] = 'candle'; }
      return px;
    } catch { return null; }
  }
  // قیمت‌ها برای ارزش‌گذاری تمام حساب‌ها: قیمت‌های لیست که با قیمت‌های زنده جایگزین می‌شوند.
  const marks = () => {
    const m = {};
    for (const c of all) if (c.source !== 'demo' && Number.isFinite(c.price)) m[c.symbol] = c.price;
    return { ...m, ...st.prices };
  };
  const tradable = all.filter((c) => !isStable(c.symbol)).slice(0, 60);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>معاملات</h1>
        <p>سه حساب در کنار هم: معاملات آزمایشی که خودتان انجام می‌دهید، معاملاتی که واقعاً انجام داده‌اید، و هوش مصنوعی که استراتژی را به طور مستقل اجرا می‌کند. فقط حساب واقعی با پول واقعی سر و کار دارد — CoinVantage هرگز سفارشی ثبت نمی‌کند و هیچ کلید API را نگه نمی‌دارد.</p>
        <div class="callout warn mt" role="note"><b>${icon('info', 14)} شبیه‌سازی، نه مسیری تضمینی برای سود</b><p>حساب‌های آزمایشی و هوش مصنوعی با پول مجازی روی قیمت‌های زنده معامله می‌کنند. سفارش‌ها با قیمت کندل و کارمزد مدل‌سازی‌شده پر می‌شوند؛ در سفارش‌های واقعی هزینه اسپرد و لغزش قیمت (Slippage) نیز وجود دارد، سفارش ممکن است ناقص پر شود یا اصلاً پر نشود و صرافی‌ها ممکن است در میانه حرکت بازار از دسترس خارج شوند. در تست‌های گام‌به‌گام (Walk-forward)، قوانین در برخی دوره‌ها ضرر داده‌اند و گاهی نگهداری ساده ارز عملکرد بهتری داشته است: ارقام زیر هر دو مورد را همراه با بیشترین افت سرمایه نشان می‌دهند. نتایج اینجا را به عنوان شواهدی درباره عملکرد قوانین در نظر بگیرید، نه بازدهی مورد انتظار. این توصیه مالی نیست. <a class="acc" href="#/learn">نحوه تست قوانین →</a></p></div>
        <details class="mt"><summary class="fine" style="cursor:pointer">معنای هر حساب و استراتژی چیست</summary>
          <dl class="defs">
            <dt>حساب آزمایشی (Demo)</dt><dd>پول مجازی که به صورت دستی معامله می‌کنید تا بدون ریسک تمرین کنید. کارمزدها محاسبه می‌شوند اما لغزش قیمت خیر.</dd>
            <dt>حساب هوش مصنوعی (AI)</dt><dd>پول مجازی که به صورت خودکار بر اساس قوانین انتخابی شما در تنظیمات، روی قیمت‌های زنده در مرورگر (و در صورت ورود به حساب، در فضای ابری) معامله می‌شود.</dd>
            <dt>حساب واقعی (Real)</dt><dd>گزارشی از معاملاتی که شخصاً در صرافی انجام داده‌اید و به صورت دستی وارد یا درون‌ریزی کرده‌اید تا با همان معیارها سنجیده شوند. برنامه هرگز این سفارش‌ها را ثبت نمی‌کند.</dd>
            <dt>استراتژی پیش‌فرض تست‌شده</dt><dd>قوانین هر نمودار که از تست گام‌به‌گام با احتساب کارمزد عبور کرده‌اند. نتیجه اندازه‌گیری‌شده آن‌ها (چه خوب و چه بد) در کنار حساب نمایش داده می‌شود.</dd>
            <dt>استراتژی سفارشی (Custom)</dt><dd>تنظیمات شخصی شما. این موارد بخشی از تست گام‌به‌گام نبوده‌اند، بنابراین آمارهای تست‌شده درباره آن‌ها صدق نمی‌کند؛ گزینه «تست این تنظیمات» نگاهی به گذشته می‌اندازد که معمولاً عملکرد قوانین انتخاب‌شده روی همان تاریخچه را بهتر از واقعیت نشان می‌دهد.</dd>
          </dl></details>
        <p class="fine" id="syncNote">${syncNote()}</p></div>
      <div class="row">
        <span class="session-chip ${session.status}" id="sessionChip"><i></i>${sessionLabel(session.status)}</span>
        <button class="btn" id="cfgBtn">${icon('chip', 16)} تنظیمات</button>
        <button class="btn ghost" id="resetBtn"${state ? '' : ' hidden'}>بازنشانی</button>
        <button class="btn ghost" id="stopBtn" hidden>${icon('close', 16)} توقف هوش مصنوعی</button>
        <button class="btn primary" id="startBtn">${state ? icon('refresh', 16) + ' همگام‌سازی فوری' : icon('bolt', 16) + ' شروع معامله‌گر'}</button>
      </div>
    </div>
    <div id="body">${state ? skeleton(6, 26) : startCard()}</div>`;

  // نتیجه اندازه‌گیری‌شده که پیش از شروع نمایش داده می‌شود.
  function verdictCard() {
    const iv = state?.interval || cfg.interval;
    const w = CHART_TESTED[iv];
    const TFS = ['15m', '1h', '4h', '1d'];
    if (!w) {
      return `<div class="card" style="border-color:var(--warn)">
      <div class="card-h"><h3>${icon('info', 16)} روی نمودار ${esc(iv)} تست نشده است</h3></div>
      <p class="fine">این استراتژی روی نمودارهای ${TFS.join('، ')} اندازه‌گیری شده است. در تایم‌فریم ${esc(iv)} با ${cfg.strategy === 'custom' ? 'قوانین شخصی شما' : 'قوانین استاندارد'} معامله می‌کند و نتیجه اندازه‌گیری‌شده‌ای برای انتظار وجود ندارد؛ گزینه «تست این تنظیمات» در بخش تنظیمات عملکرد آن‌ها را روی کندل‌های اخیر نشان می‌دهد. قوانین فعال: ${esc(rulesText(effective(iv)))}</p>
    </div>`;
    }
    const sign = (v) => pct(v, 2);
    const traded = (x) => (x.adopt ? x.own : x.standard);
    const pickVerdict = (x) => (x.cleared ? `در این اجرا به اندازه کافی بهتر از قوانین استاندارد عمل کرد اما در اجرای قبلی (${esc(x.previous?.measuredOn || '')}) خیر، و قوانین تنها زمانی تغییر می‌کنند که دو اجرای متوالی هم‌نظر باشند` : `به اندازه کافی بهتر عمل نکرد${x.previous?.cleared ? ` (در اجرای قبلی در تاریخ ${esc(x.previous.measuredOn)} بهتر بود)` : ''}`);
    const r = traded(w);
    const e = effective(iv);
    return `<div class="card" style="border-color:var(--warn)">
      <div class="card-h"><h3>${icon('info', 16)} عملکرد واقعی این استراتژی هنگام تست</h3><span class="fine">اندازه‌گیری‌شده در ${esc(CHART_TESTED.measuredOn)}، نه تخمینی</span></div>
      <p>اجرا شده کندل به کندل روی ${w.coins ?? CHART_TESTED.coins} ارز در یک حساب با احتساب کارمزد، در ${CHART_TESTED.blocks} دوره متوالی حدوداً ${esc(w.block)} (${esc(w.from)} ← ${esc(w.to)}). ${w.adopt ? `پیش از هر دوره، قوانین از میان ${CHART_TESTED.configs} مجموعه قانون بر اساس تاریخچه قبلی انتخاب و سپس روی دوره‌ای که هرگز ندیده بودند اجرا شدند.` : `قوانین استاندارد در هر سه دوره اجرا شدند؛ در کنار آن‌ها، انتخابی از میان ${CHART_TESTED.configs} مجموعه قانون بر اساس تاریخچه قبلی نیز اجرا شد که ${pickVerdict(w)}.`} ${cfg.strategy === 'custom' ? `<b>شما با قوانین شخصی خود معامله می‌کنید که بخشی از این تست نبوده‌اند</b>، بنابراین این آمارها درباره آن‌ها صدق نمی‌کند؛ برای بررسی گذشته از «تست این تنظیمات» در تنظیمات استفاده کنید. برای مقایسه، قوانین تست‌شده برای ${esc(iv)} به طور میانگین <b class="${r.ret >= 0 ? 'up' : 'down'}">${sign(r.ret)}</b> در هر دوره سود داشتند در حالی که نگهداری همان ارزها <b class="${w.hold >= 0 ? 'up' : 'down'}">${sign(w.hold)}</b> بازدهی داشت.` : `در تایم‌فریم ${esc(iv)}، قوانینی که معامله می‌کند به طور میانگین <b class="${r.ret >= 0 ? 'up' : 'down'}">${sign(r.ret)}</b> در هر دوره با میانگین بیشترین افت سرمایه ${r.dd}% کسب کردند، در حالی که نگهداری همان ارزها به طور میانگین <b class="${w.hold >= 0 ? 'up' : 'down'}">${sign(w.hold)}</b> بازدهی و ${w.holdDrop}% افت سرمایه داشت. ${r.ret > w.hold ? 'در این نمودار طی سه دوره بهتر از نگهداری عمل کرد؛ این یک مدرک است نه تضمین.' : 'در این نمودار نگهداری ساده سود بیشتری داشت.'}${w.previous && !w.adopt && Math.abs(w.previous.ret - r.ret) >= 2 ? ` اجرای قبلی در تاریخ ${esc(w.previous.measuredOn)} روی کندل‌های تقریباً مشابه، ${sign(w.previous.ret)} در هر دوره نتیجه داد: میانگین هر اجرا را تقریبی در نظر بگیرید.` : ''}${r.dd < w.holdDrop - 5 ? (r.ret > w.hold ? ' همچنین افت سرمایه بسیار کمتری داشت.' : ' اما افت سرمایه بسیار کمتری را تجربه کرد.') : ''} بیشترین افت سرمایه با احتساب معاملات باز در بسته شدن هر کندل محاسبه شده است.${w.fillCost ? ` در تست، تمام سفارش‌ها با قیمت کندل پر شده‌اند؛ با فرض پر شدن سفارش‌ها ۰.۰۵٪ بدتر در هر طرف (اسپرد و لغزش)، سود هر دوره حدود ${w.fillCost} واحد درصد کمتر می‌شد.` : ''}`}</p>
      <div class="tbl-wrap mt"><table class="tbl fit"><thead><tr><th class="l">نمودار</th><th class="hide-p">بازه تست</th><th class="hide-p">قوانین</th><th>نتیجه هر دوره</th><th>بیشترین افت</th><th class="hide-p">قوانین استاندارد</th><th>نگهداری ساده</th><th class="hide-p">افت نگهداری ساده</th><th class="hide-p">معاملات</th></tr></thead><tbody>
        ${TFS.map((k) => { const x = CHART_TESTED[k], t = traded(x); return `<tr${k === iv ? ' style="font-weight:600"' : ''}><td class="l">${k}</td><td class="fine wrap hide-p" style="min-width:96px">${esc(x.from)} ← ${esc(x.to)}</td><td class="fine hide-p">${x.adopt ? 'اختصاصی' : 'استاندارد'}</td><td class="${t.ret >= 0 ? 'up' : 'down'}">${sign(t.ret)}</td><td class="down">−${t.dd}%</td><td class="hide-p ${x.standard.ret >= 0 ? 'up' : 'down'}">${sign(x.standard.ret)}</td><td class="${x.hold >= 0 ? 'up' : 'down'}">${sign(x.hold)}</td><td class="down hide-p">−${x.holdDrop}%</td><td class="hide-p">${t.trades}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="fine mt">قوانین فعال در ${esc(iv)}: ${esc(rulesText(e))} ${cfg.strategy === 'custom' ? 'این‌ها قوانین شخصی شما هستند که در تنظیمات تعیین شده‌اند.' : w.adopt ? `این‌ها انتخاب اختصاصی این نمودار هستند: در تست، انتخاب قوانین برای نمودار در ${w.better} دوره از ${CHART_TESTED.blocks} دوره قوانین استاندارد را شکست داد (${sign(w.own.ret)} در برابر ${sign(w.standard.ret)} در هر دوره، و بیشترین افت ${w.own.dd}% در برابر ${w.standard.dd}%).` : `انتخاب اختصاصی نمودار ${w.cleared ? `در این اجرا قوانین استاندارد را شکست داد (بهتر در ${w.better} دوره از ${CHART_TESTED.blocks} دوره، ${sign(w.own.ret)} در برابر ${sign(w.standard.ret)}) اما در اجرای قبلی خیر، بنابراین نمودار تا زمانی که دو اجرای متوالی توافق نکنند قوانین استاندارد را حفظ می‌کند.` : `به اندازه کافی بهتر از قوانین استاندارد عمل نکرد (بهتر در ${w.better} دوره از ${CHART_TESTED.blocks} دوره${w.previous?.cleared ? `؛ در اجرای قبلی در تاریخ ${esc(w.previous.measuredOn)} بهتر بود` : ''})، بنابراین قوانین استاندارد حفظ می‌شوند.`}`} کارمزدها معادل ${r.fees}% از موجودی در هر دوره بود و ${r.win}% معاملات با سود بسته شدند.${iv === '15m' ? ' هر دوره در تایم‌فریم ۱۵ دقیقه فقط ده روز است، بنابراین این اعداد بین اجراهای مختلف نوسان زیادی دارند.' : ''}${ownRulesText()}${ownRulesOn() ? ` تست‌شده روی ${PER_COIN_RULES.coins} ارز در بازه ${esc(PER_COIN_RULES.tested.from)} ← ${esc(PER_COIN_RULES.tested.to)} با انتخاب قوانین بر اساس سال‌های قبل: ${sign(PER_COIN_RULES.tested.own.ret)} با بیشترین افت ${PER_COIN_RULES.tested.own.dd}%، در برابر ${sign(PER_COIN_RULES.tested.standard.ret)} و ${PER_COIN_RULES.tested.standard.dd}% برای قوانین روزانه به تنهایی، و ${sign(PER_COIN_RULES.tested.hold)} برای نگهداری ساده ارزها (بیشترین افت ${PER_COIN_RULES.tested.holdDrop}%).${PER_COIN_RULES.tested.previousRun ? ` اجرای قبلی روی ${PER_COIN_RULES.tested.previousRun.coins} ارز، ${sign(PER_COIN_RULES.tested.previousRun.own)} در برابر ${sign(PER_COIN_RULES.tested.previousRun.standard)} سود داد: تست‌های طولانی به ارزها و تاریخ شروع حساس هستند، پس میزان سود را تقریبی بدانید.` : ''} می‌توانید این گزینه را در تنظیمات خاموش کنید.` : ''}</p>
      ${ownRulesOn() ? coinRulesTable(e) : ''}
      <p class="fine">این ${w.coins ?? CHART_TESTED.coins} ارز، ارزهای بزرگ امروزی هستند: ارزهایی که در طول مسیر سقوط کرده یا از صرافی حذف شده‌اند در تست نیستند که این موضوع تمام نتایج (از جمله نگهداری ساده) را بهتر از واقعیت جلوه می‌دهد.</p>
      <p class="fine">بنابراین این حساب نمایشی از یک استراتژی است که صادقانه روی قیمت‌های زنده و با احتساب کارمزدها (از جمله دوره‌های ضررده) اجرا می‌شود. این تضمینی برای سود نیست، هیچ سفارش واقعی ثبت نمی‌کند و هیچ کلیدی در اختیار ندارد.</p>
    </div>`;
  }

  // پتانسیل درآمدزایی هر نمودار تست‌شده در ساعت، روز، هفته و ماه.
  function earningsCard() {
    const rows = earningsByChart(cfg);
    if (!rows.length) return '';
    const iv = state?.interval || cfg.interval;
    const top = bestTestedChart();
    const s = state ? stats(state, marks()) : null;
    const bal = s ? s.equity : cfg.startingBalance;
    const dp = (v) => (Math.abs(v) < 0.01 ? 4 : Math.abs(v) < 0.1 ? 3 : 2);
    const signed = (v) => { const a = Math.abs(v); return `${v < 0 ? '−' : '+'}${money(a, { dp: a >= 0.1 ? 2 : a >= 0.01 ? 3 : 4 })}`; };
    const cell = (v) => `<b class="${v >= 0 ? 'up' : 'down'}">${signed((bal * v) / 100)}</b><br><small>${pct(v, dp(v))}</small>`;
    const short = (v) => (Math.abs(v * fx.rate) >= 1000 ? `${v < 0 ? '−' : '+'}${compact(Math.abs(v))}` : signed(v));
    const cellP = (v) => `<b class="${v >= 0 ? 'up' : 'down'}">${short((bal * v) / 100)}</b><br><small>${pct(v, dp(v))}</small>`;
    const live = (() => {
      if (!s || !Number.isFinite(s.returnPct)) return null;
      const days = (Date.now() - (state.liveFrom || state.startedAt)) / 864e5;
      if (!(days >= 1)) return { early: true, hours: Math.max(0, Math.round(days * 24)) };
      const d = s.returnPct / days;
      return { hour: d / 24, day: d, week: days >= 7 ? d * 7 : null, month: days >= 30 ? d * 30 : null, days };
    })();
    const notYet = (need) => `<small class="muted">پس از ${need} روز</small>`;
    const when = rows.map((r) => `${r.chart} ${r.from.slice(0, 7)} ← ${r.to.slice(0, 7)}`).join('، ');
    return `<div class="card mt" id="earnCard">
      <div class="card-h"><h3>${icon('chart', 16)} میزان بازدهی احتمالی: ساعتی، روزانه، هفتگی و ماهانه</h3><span class="fine">با ریسک ${rows[0].risk}% در هر معامله، روی موجودی ${money(bal)}</span></div>
      <div class="tbl-wrap hide-p"><table class="tbl fine fit"><thead><tr><th class="l">نمودار</th><th>در ساعت</th><th>در روز</th><th>در هفته</th><th>در ماه</th><th class="hide-p">بدترین دوره تست</th><th class="hide-t">نگهداری ارزها (ماهانه)</th><th class="hide-t">معاملات در ماه</th></tr></thead><tbody>
        ${rows.map((r) => { const tags = [r.chart === iv ? 'انتخاب شما' : '', top && r.chart === top.iv ? 'پیشنهادی' : ''].filter(Boolean); return `<tr${r.chart === iv ? ' style="font-weight:600"' : ''}><td class="l"><b>${esc(r.chart)}</b>${tags.length ? `<small>${tags.join(' · ')}</small>` : ''}</td>
          <td>${cell(r.per.hour)}</td><td>${cell(r.per.day)}</td><td>${cell(r.per.week)}</td><td>${cell(r.per.month)}</td>
          <td class="hide-p ${r.worst >= 0 ? 'up' : 'down'}">${pct(r.worst, 2)}<small>در ${esc(r.block)}</small></td>
          <td class="hide-t ${r.holdPer.month >= 0 ? 'up' : 'down'}">${pct(r.holdPer.month, 2)}</td><td class="hide-t">${r.tradesPerMonth}</td></tr>`; }).join('')}
        ${live ? `<tr><td class="l"><b>حساب شما تا این لحظه</b><br><small>${live.early ? `${live.hours} ساعت معامله` : `${Math.round(live.days)} روز، زنده`}</small></td>${live.early ? '<td colspan="7" class="l muted">هنوز برای قضاوت زود است: حداقل یک روز کامل معامله برای نمایش نرخ لازم است</td>' : `<td>${cell(live.hour)}</td><td>${cell(live.day)}</td><td>${live.week === null ? notYet(7) : cell(live.week)}</td><td>${live.month === null ? notYet(30) : cell(live.month)}</td><td class="l muted hide-p">سابقه واقعی حساب</td><td colspan="2" class="hide-t"></td>`}</tr>` : ''}
      </tbody></table></div>
      <div class="tbl-wrap show-pb"><table class="tbl fine fit"><thead><tr><th>در ساعت</th><th>در روز</th><th>در هفته</th><th>در ماه</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><th colspan="4" class="l">${esc(r.chart)}${r.chart === iv ? ' · انتخاب شما' : ''}${top && r.chart === top.iv ? ' · پیشنهادی' : ''} <span class="muted">· بدترین دوره تست ${pct(r.worst, 2)} در ${esc(r.block)}</span></th></tr>
          <tr><td>${cellP(r.per.hour)}</td><td>${cellP(r.per.day)}</td><td>${cellP(r.per.week)}</td><td>${cellP(r.per.month)}</td></tr>`).join('')}
        ${live && !live.early ? `<tr><th colspan="4" class="l">حساب شما تا این لحظه · ${Math.round(live.days)} روز</th></tr><tr><td>${cellP(live.hour)}</td><td>${cellP(live.day)}</td><td>${live.week === null ? notYet(7) : cellP(live.week)}</td><td>${live.month === null ? notYet(30) : cellP(live.month)}</td></tr>` : ''}
      </tbody></table></div>
      <p class="fine mt">میانگین هر نمودار در ${rows[0].periods} دوره تست گام‌به‌گام با ${esc(rows.every((r) => r.rules === rows[0].rules) ? rows[0].rules : 'قوانین تست‌شده آن')}، پس از کسر کارمزدها و هزینه پر شدن واقعی سفارش‌ها (۰.۰۵٪ بدتر در هر طرف)، که به طور یکنواخت در طول زمان تقسیم شده است.<span class="show-t"> بازدهی نگهداری ارزها و تعداد معاملات ماهانه در صفحه‌نمایش بزرگ‌تر قابل مشاهده است.</span> نتایج واقعی به صورت یکنواخت رخ نمی‌دهند: در بیشتر ساعات و بسیاری از روزها هیچ معامله‌ای انجام نمی‌شود و بدترین دوره تست در کنار هر ردیف آمده است. نمودارها در بازه‌های زمانی متفاوتی تست شده‌اند (${esc(when)})، پس در مقایسه ردیف‌ها دقت کنید.${top ? ` پیشنهاد: ${esc(top.iv)} که با ریسک تست‌شده ۱.۵٪ در هر معامله، بیشترین بازدهی ماهانه را داشته است.` : ''}</p>
      <p class="fine">نگهداری ساده همین ارزها در این دوره‌ها (که عمدتاً بازار صعودی بوده‌اند) سود بیشتری نسبت به هوش مصنوعی داشته است. مزیت هوش مصنوعی این است که در ریزش‌ها افت بسیار کمتری داشته و در نبود موقعیت مناسب، نقد می‌ماند. این اعداد برآوردی از گذشته هستند، نه تضمین آینده.</p>
    </div>`;
  }

  // قوانین اختصاصی هر ارز روی نمودار روزانه.
  function coinRulesTable(base) {
    const buys = (r) => `${r.entryMode === 'breakout' ? 'سقف جدید ۲۰ کندلی' : r.entryMode === 'pullback' ? `اصلاح در روند صعودی (RSI ${PULLBACK_RSI} یا کمتر)` : `امتیاز +${r.entryScore} یا بیشتر`}${r.momentumConfirm ? '، مومنتوم صعودی' : ''}${r.trendFilter && r.entryMode !== 'pullback' ? '، در روند صعودی' : ''}`;
    const sells = (r) => `${r.trailAtr ? `حد ضرر متحرک ${r.trailAtr} ATR` : `هدف ${r.rMultiple}R`}${r.signalExitBars ? `، یا ${r.signalExitBars} کندل بازگشتی` : ''}`;
    const rows = cfg.universe.map((sym) => {
      const own = PER_COIN_RULES.rules[sym];
      const r = own ? { ...base, ...own } : base;
      return `<tr><td class="l"><b>${esc(sym)}</b>${own ? '' : ' <small class="fine">قوانین روزانه</small>'}</td><td class="l fine wrap">${esc(buys(r))}</td><td>${r.atrStop} ATR</td><td class="l fine wrap">${esc(sells(r))}</td></tr>`;
    }).join('');
    const n = cfg.universe.filter((sym) => PER_COIN_RULES.rules[sym]).length;
    return `<details class="mt"><summary class="fine" style="cursor:pointer">قوانین هر ارز در این نمودار (${n} از ${cfg.universe.length} ارز قانون اختصاصی دارند)</summary>
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th class="l">ارز</th><th class="l">شرایط خرید</th><th>حد ضرر</th><th class="l">شرایط فروش</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="fine">بر اساس تاریخچه روزانه هر ارز انتخاب شده است؛ ارزهایی که قانون اختصاصی ندارند از قوانین روزانه عمومی پیروی می‌کنند. می‌توانید این بخش را در تنظیمات خاموش کنید.</p>
    </details>`;
  }

  // وضعیت خودبهبودی: پنجره‌های نرخ موفقیت پیش‌بینی‌های ثبت‌شده.
  function learningCard() {
    const ledger = loadLedger();
    const ls = learningStatus(ledger);
    const spark = accuracySparkline(ledger, 50);
    const trendText = {
      'improving': 'پنجره اخیر بالاتر از پنجره بلندمدت‌تر است',
      'stable': 'ثابت و پایدار',
      'declining': 'پنجره اخیر پایین‌تر از پنجره بلندمدت‌تر است',
      'warming-up': 'نیازمند حداقل ۱۰ پیش‌بینی تعیین‌تکلیف‌شده',
      'unknown': 'هنوز پیش‌بینی تعیین‌تکلیف‌شده کافی وجود ندارد',
    }[ls.trend] || ls.trend;
    const trendCls = ls.trend === 'improving' ? 'up' : ls.trend === 'declining' ? 'down' : 'flat';
    const win = (w) => {
      const r = ls.windows[w];
      if (r.pct === null) return `<span class="muted">—</span>`;
      const cls = r.pct >= 55 ? 'up' : r.pct < 45 ? 'down' : '';
      return `<b class="${cls}">${r.pct}%</b> <span class="fine">(${r.hits}/${r.total})</span>`;
    };
    return `<div class="card mt" id="learnCard">
      <div class="card-h"><h3>${icon('ai', 16)} سابقه پیش‌بینی‌های شما</h3><span class="chip ${trendCls}">${esc(TREND_WORDS[ls.trend] || ls.trend)}</span></div>
      <p class="fine">هر پیش‌بینی که به شما نمایش داده می‌شود پیش از مشخص شدن نتیجه ثبت شده و پس از گذشت افق زمانی آن امتیازدهی می‌شود. در صورت ورود به حساب، این سابقه در فضای ابری ذخیره می‌شود تا همه دستگاه‌های شما به یک سابقه واحد اضافه شوند. پنجره‌های زیر نرخ موفقیت در N پیش‌بینی اخیر شما هستند — نه ادعایی درباره عملکرد آینده. ثبت امتیاز، پیش‌بینی‌ها را دقیق‌تر نمی‌کند؛ نرخ موفقیت نزدیک به ۵۰٪ معادل پرتاب سکه است.</p>
      <div class="grid g4 mt">
        <div class="stat"><span class="k">۲۰ مورد اخیر</span><span class="v">${win(20)}</span></div>
        <div class="stat"><span class="k">۵۰ مورد اخیر</span><span class="v">${win(50)}</span></div>
        <div class="stat"><span class="k">۱۰۰ مورد اخیر</span><span class="v">${win(100)}</span></div>
        <div class="stat"><span class="k">۲۰ مورد اخیر در برابر ۵۰ مورد</span><span class="v ${trendCls}" style="font-size:16px">${esc(TREND_WORDS[ls.trend] || ls.trend)}</span><span class="s fine">${esc(trendText)}</span></div>
      </div>
      ${spark.length > 1 ? `<div class="mt"><div class="fine" style="margin-bottom:4px">نرخ موفقیت در ${spark.length} پیش‌بینی تعیین‌تکلیف‌شده اخیر (میانگین متحرک ۲۰تایی)</div>${sparklineSvg(spark, { width: 240, height: 36, color: 'var(--accent)' })}</div>` : ''}
      <p class="fine mt">نسخه مدل ${ls.modelVersion} · ${ls.total} پیش‌بینی ثبت‌شده · ${ls.resolved} تعیین‌تکلیف‌شده · ${ls.pending} در انتظار رسیدن به افق زمانی.</p>
      <div class="mt">
        <div class="fine">پس از تعیین‌تکلیف ۱۵ پیش‌بینی، اگر نرخ موفقیت در ۵۰ مورد اخیر (یا ۲۰ مورد اخیر در صورت کمتر بودن تعداد) زیر ۵۵٪ باشد، میزان اطمینان نمایش‌داده‌شده یک‌چهارم به سمت ۵۰/۵۰ متمایل می‌شود و اگر زیر ۴۰٪ باشد، به نصف کاهش می‌یابد. این مورد فقط بر اساس سابقه خود شما محاسبه می‌شود.</div>
      </div>
    </div>`;
  }

  // اطلاع‌رسانی درباره محل نگهداری معاملات.
  function syncNote() {
    if (auth.user) {
      const cloud = [...(state?.log || [])].reverse().find((e) => e.kind === 'check' && e.by === 'cloud');
      return `ذخیره‌شده در حساب کاربری شما: هر دستگاهی که با آن وارد شوید همین معاملات را نشان می‌دهد. تا زمانی که هوش مصنوعی روشن است، سرور ابری با بسته شدن هر کندل جدید ${esc(state?.interval || cfg.interval)} حتی زمانی که این صفحه بسته است معامله می‌کند${cloud ? ` (آخرین بررسی ابری: ${ago(cloud.t)})` : ''}.`;
    }
    if (backendEnabled()) return 'فقط در همین مرورگر ذخیره شده و تنها زمانی که این صفحه باز است معامله می‌کند. <a href="#" id="syncSignIn">وارد شوید</a> تا معامله در فضای ابری و هنگام بسته بودن صفحه ادامه یابد و معاملات را در همه دستگاه‌ها ببینید.';
    return 'فقط در همین مرورگر ذخیره شده است.';
  }

  // معاملات این دستگاه که در نسخه ابری نبوده‌اند و کنار گذاشته شده‌اند.
  function backupCard() {
    const b = auth.user ? backupFor(load, auth.user.id) : null;
    if (!b) return '';
    const NAMES = { myDemoState: 'حساب آزمایشی شما', realTradeState: 'حساب واقعی شما' };
    const parts = Object.entries(b.keys).map(([k, v]) => [k, missingTrades(v, load(k, null)).length]).filter(([, n]) => n)
      .map(([k, n]) => `${n} معامله در ${NAMES[k]}`);
    if (!parts.length) return '';
    const list = parts.length > 1 ? `${parts.slice(0, -1).join('، ')} و ${parts[parts.length - 1]}` : parts[0];
    return `<div class="card" id="backupCard" style="border-color:var(--warn)">
      <div class="card-h"><h3>${icon('info', 16)} معاملات این دستگاه کنار گذاشته شدند</h3><span class="fine">${dateTime(b.at, false)}</span></div>
      <p class="fine">دستگاه دیگری پیش از این دستگاه، نسخه متفاوتی از معاملات شما را ذخیره کرده است. نسخه ذخیره‌شده در اینجا و سایر دستگاه‌های شما نمایش داده می‌شود. نسخه این دستگاه دارای ${esc(list)} است که در نسخه ذخیره‌شده وجود ندارد.</p>
      <p class="fine">می‌توانید نسخه این دستگاه را جایگزین نسخه ذخیره‌شده در همه‌جا کنید، یا نسخه ذخیره‌شده را نگه دارید و این مورد را حذف کنید.</p>
      <div class="row mt" style="gap:8px"><button class="btn sm" id="bkUse">استفاده از نسخه این دستگاه</button><button class="btn sm ghost" id="bkDrop">حفظ نسخه ذخیره‌شده</button></div>
    </div>`;
  }

  function wireBackup() {
    $('#bkUse', el)?.addEventListener('click', () => {
      if (!auth.user) return;
      restoreBackup({ load, save, remove }, auth.user.id);
      toast('نسخه این دستگاه اکنون به عنوان نسخه اصلی در همه دستگاه‌ها ذخیره شد.', 'up');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    $('#bkDrop', el)?.addEventListener('click', () => { remove('syncBackup'); draw(); });
  }

  function rulesText(c) { return rulesInWords(c); }

  function startCard() {
    const e = effective();
    const w = CHART_TESTED[e.interval];
    const r = w && (w.adopt ? w.own : w.standard);
    return `<div class="card empty">
      <h3>اجرای استراتژی با پول شبیه‌سازی‌شده</h3>
      <p style="max-width:620px">این ربات ${cfg.universe.length} ارز را در تایم‌فریم ${esc(e.interval)} زیر نظر می‌گیرد. ${rulesText(e)} حجم هر معامله را طوری تنظیم می‌کند که فعال شدن حد ضرر حداکثر ${cfg.riskPct}% از موجودی را کم کند، بیش از ${cfg.maxPositionPct}% از سرمایه در یک ارز قرار نگیرد و هرگز بیش از پول نقد موجود معامله نشود.${ownRulesText()} هر معامله همراه با کارمزد فرضی آن ثبت می‌شود.</p>
      <p class="fine" style="max-width:620px">موجودی اولیه ${money(cfg.startingBalance)}. پیش از شروع، نتیجه تست‌شده در بالا را بخوانید${r ? ` — در این نمودار ${r.ret > w.hold ? 'در آن تست بهتر از نگهداری ساده ارزها عمل کرد که البته تضمینی برای تکرار آن نیست' : 'نگهداری ساده ارزها سود بیشتری داشت'}` : ''}. هر زمان که بخواهید می‌توانید بدون بازنشانی حساب، آن را متوقف کنید.</p>
    </div>${learningCard()}`;
  }

  function ownRulesText() {
    if (!ownRulesOn()) return '';
    const own = cfg.universe.filter((s) => PER_COIN_RULES.rules[s]);
    if (!own.length) return ' هیچ‌یک از ارزهای انتخابی قانون اختصاصی ندارند، بنابراین همه از قوانین عمومی استفاده می‌کنند.';
    if (own.length === cfg.universe.length) return ' هر ارز بر اساس قوانین انتخاب‌شده روی تاریخچه روزانه خودش معامله می‌شود.';
    if (own.length === 1) return ` ارز ${own[0]} بر اساس قوانین تاریخچه روزانه خودش معامله می‌شود و سایر ارزها از قوانین عمومی استفاده می‌کنند.`;
    return ` ${own.length} ارز از ${cfg.universe.length} ارز (${own.join('، ')}) بر اساس قوانین تاریخچه روزانه خودشان معامله می‌شوند و بقیه از قوانین عمومی پیروی می‌کنند.`;
  }

  // ---------------------------------------------------------------- موتور اجرا
  async function catchUp() {
    if (st.running) return;
    st.running = true;
    const btn = $('#startBtn', el);
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> در حال پردازش…';
    if (!state) state = newState(cfg);
    if (!state.interval) state.interval = cfg.interval;
    const runCfg = runConfig(cfg, state, load(LESSONS_KEY, []));

    let processed = 0;
    const failed = [], noExchange = [];
    const forecastInputs = [];
    const held = heldOffList(cfg, state);
    const bySymbol = {};
    const syms = [...cfg.universe, ...held];
    const fetched = new Map();
    await pool(syms, 4, async (sym) => {
      const coin = all.find((c) => c.symbol === sym);
      if (!coin || st.disposed) return;
      if (knownVenue(coin) === null && !state.open[sym]) { fetched.set(sym, new Error('not listed')); return; }
      try { fetched.set(sym, await candlesFor(coin, runCfg.interval)); } catch (err) { fetched.set(sym, err); }
    });
    for (const sym of syms) {
      if (st.disposed) return;
      const coin = all.find((c) => c.symbol === sym);
      if (!coin) { failed.push(sym); continue; }
      try {
        const r = fetched.get(sym);
        if (!r || r instanceof Error) throw r || new Error('no candles');
        if (r.source === 'demo') { failed.push(sym); continue; }
        const lastPx = r.candles[r.candles.length - 1]?.c;
        if (Number.isFinite(lastPx) && st.priceFrom[sym] !== 'live') { st.prices[sym] = lastPx; st.priceFrom[sym] = 'candle'; }
        if (r.source === 'coingecko' || r.lowRes) {
          noExchange.push(sym);
          if (state.open[sym] && Number.isFinite(lastPx)) closeManual(state, runCfg, sym, lastPx, Date.now(), 'عدم وجود قیمت صرافی');
          continue;
        }
        const candles = r.candles.slice(0, -1);
        bySymbol[sym] = candles;
        forecastInputs.push({ sym, candles });
      } catch { failed.push(sym); }
    }
    if (st.disposed) return;
    const streak = load(NODATA_KEY, {});
    if (Object.keys(bySymbol).length) {
      for (const sym of failed) if (fetched.get(sym)?.source !== 'demo') streak[sym] = (streak[sym] || 0) + 1;
      for (const sym of Object.keys(bySymbol)) delete streak[sym];
      save(NODATA_KEY, streak);
    }
    st.noExchange = noExchange;
    for (const { sym, need } of backfillNeeds(state, bySymbol, INTERVAL_MS[runCfg.interval], { max: BACKFILL_MAX })) {
      const coin = all.find((c) => c.symbol === sym);
      try {
        const r = await getCandles(coin, runCfg.interval, need);
        if (r && r.source !== 'demo' && !r.lowRes && r.candles.length > bySymbol[sym].length) bySymbol[sym] = r.candles.slice(0, -1);
      } catch { /* استفاده از پنجره قبلی */ }
      if (st.disposed) return;
    }
    if (st.disposed) return;
    const lessons = load(LESSONS_KEY, []);
    const autoLearn = load(AUTOLEARN_KEY, true) !== false;
    const check = checkAccount(state, cfg, { bySymbol, failed, lessons, autoLearn, by: 'page' });
    processed = check.processed;
    if (check.changes.length) { save(CFG_KEY, cfg); save(LESSONS_KEY, lessons.slice(-50)); }
    save(STATE_KEY, state);
    st.lastRun = Date.now();
    st.running = false;
    if (st.disposed) return;
    btn.disabled = false;
    btn.innerHTML = old;
    if (failed.length && st.warnedNoData !== failed.join()) { st.warnedNoData = failed.join(); toast(`داده‌ای برای ${failed.join('، ')} در این نوبت دریافت نشد — رد شد.`, 'info'); }
    if (noExchange.length && !st.warnedNoExchange) st.warnedNoExchange = true, toast(`${noExchange.join('، ')} کندل صرافی ندارند، بنابراین هوش مصنوعی روی آن‌ها معامله نمی‌کند. از طریق اعلان همین صفحه می‌توانید آن‌ها را از لیست حذف کنید.`, 'info');
    draw();
    if (processed) toast(`${processed.toLocaleString('en-US')} کندل جدید بررسی شد.`, 'up');
    learnFrom(forecastInputs, runCfg.interval);
    cloudLearning().then((c) => (c?.[runCfg.interval] ? null : learningPass(runCfg.interval, { candlesBySymbol: Object.fromEntries(forecastInputs.map((x) => [x.sym, x.candles])) }))).catch(() => {});
  }

  // خودبهبودی: امتیازدهی به پیش‌بینی‌هایی که زمان آن‌ها به پایان رسیده است.
  async function learnFrom(inputs, interval) {
    if (st.learning || !inputs.length) return;
    st.learning = true;
    try {
      let ledger = loadLedger();
      for (const { sym, candles } of inputs) {
        if (st.disposed) return;
        ledger = resolveDueLedger(ledger, candles, { symbol: sym, interval });
        const fc = await runForecast(candles, { horizon: DEFAULT_HORIZON[interval] || 12, intervalMs: INTERVAL_MS[interval] }).catch(() => null);
        if (fc?.ok && Number.isFinite(fc.probUp) && fc.path?.length) {
          ledger = recordForecast(ledger, {
            symbol: sym, interval, price: fc.lastPrice, probUp: fc.probUp,
            horizonBars: fc.horizon, horizonAt: fc.path[fc.path.length - 1]?.t,
          });
        }
      }
      saveLedger(ledger);
      if (!st.disposed && $('#learnCard', el)) $('#learnCard', el).outerHTML = learningCard();
    } finally { st.learning = false; }
  }

  // گزارش فعالیت‌های هوش مصنوعی (از جدیدترین به قدیمی‌ترین).
  function activityCard() {
    const step = INTERVAL_MS[state.interval] || 0;
    const liveSince = state.startedAt;
    const ev = [];
    for (const p of Object.values(state.open)) ev.push({ t: p.openedAt + step, sym: p.symbol, kind: 'buy', p });
    for (const p of state.closed) {
      ev.push({ t: p.openedAt + step, sym: p.symbol, kind: 'buy', p });
      ev.push({ t: p.exitAt + step, sym: p.symbol, kind: 'sell', p });
    }
    for (const c of state.log || []) ev.push({ t: c.t, kind: c.kind, c });
    ev.sort((a, b) => b.t - a.t);
    const why = { target: 'به حد سود رسید', 'stop-loss': 'به حد ضرر برخورد کرد', 'trailing stop': 'به حد ضرر متحرک برخورد کرد', 'break-even stop': 'پس از انتقال حد ضرر به نقطه سربه‌سر، به قیمت ورود بازگشت', 'signal reversal': 'سیگنال معکوس شد', 'sold into strength': 'جهش قیمتی مورد انتظار رخ داد', 'no exchange price': 'هیچ صرافی این ارز را معامله نمی‌کند، بنابراین هوش مصنوعی معامله آن را متوقف کرد' };
    const line = (e) => {
      if (e.kind === 'check') {
        const c = e.c;
        const did = c.opened || c.closed ? `${c.opened ? `${c.opened} معامله باز شد` : ''}${c.opened && c.closed ? '، ' : ''}${c.closed ? `${c.closed} معامله بسته شد` : ''}` : 'بدون معامله';
        return `<b>بررسی ${c.coins} ارز${c.by === 'cloud' ? ' در فضای ابری' : ''}</b> — ${c.candles.toLocaleString('en-US')} کندل بسته‌شده جدید، ${did}${c.best ? ` · بالاترین امتیاز: ${esc(c.best.sym)} با ${c.best.score > 0 ? '+' : ''}${c.best.score} (حد نصاب خرید: +${c.bar})` : ''}${c.passed ? ` · <span class="warn">صرف‌نظر از خرید ${esc(c.passed.syms.join('، '))}${c.passed.n > c.passed.syms.length ? ` و ${c.passed.n - c.passed.syms.length} مورد دیگر` : ''}: ${c.passed.why === 'nocash' ? 'تمام نقدینگی درگیر معاملات باز بود (تنظیمات ← حداکثر سرمایه در یک ارز)' : 'سقف تعداد معاملات باز مجاز پر شده بود'}</span>` : ''}`;
      }
      if (e.kind === 'review') return `<b>خودارزیابی</b> — ${esc(e.c.text)}`;
      if (e.kind === 'settings') return `<b>تغییر تنظیمات</b> — ${esc(e.c.text)}`;
      if (e.kind === 'buy') {
        const bar = e.p.entryBar;
        return `<b>خرید ${esc(e.sym)}</b> در قیمت ${money(e.p.entry)}${Number.isFinite(e.p.openScore) ? ` — امتیاز ${e.p.openScore > 0 ? '+' : ''}${Math.round(e.p.openScore)}${Number.isFinite(bar) ? ` از حد نصاب +${bar} عبور کرد` : ''}` : ''}`;
      }
      return `<b>فروش ${esc(e.sym)}</b> در قیمت ${money(e.p.exit)} — ${esc(why[e.p.reason] || e.p.reason)} · <span class="${e.p.pnl >= 0 ? 'up' : 'down'}">${e.p.pnl >= 0 ? '+' : '−'}${money(Math.abs(e.p.pnl))} (${pct(e.p.pnlPct)})</span>`;
    };
    const replayed = ev.filter((e) => !['check', 'review', 'settings'].includes(e.kind) && e.t < liveSince).length;
    return `<div class="card mt">
      <div class="card-h"><h3>${icon('ai', 16)} فعالیت‌های هوش مصنوعی</h3><span class="fine">${autoOn ? 'در حال اجرا · بررسی هر ۵ دقیقه' : session.status === 'stopped' ? 'متوقف‌شده · برای ادامه دکمه از سرگیری را بزنید' : 'آماده به کار'}${st.lastRun ? ` · آخرین بررسی ${ago(st.lastRun)}` : ''}</span></div>
      ${replayed ? `<p class="fine" style="margin-top:0">موارد دارای برچسب <span class="chip">بازپخش‌شده</span> روی کندل‌های پیش از شروع زنده این حساب در تاریخ ${dateTime(liveSince)} اجرا شده‌اند — همان قوانین روی قیمت‌های گذشته اجرا شدند تا سابقه حساب خالی نباشد. تمام موارد پس از آن به صورت زنده تصمیم‌گیری شده‌اند.</p>` : ''}
      ${ev.length ? `<ul class="fine" style="list-style:none;padding:0;margin:0">${ev.slice(0, 30).map((e) => `<li style="padding:6px 0;border-bottom:1px solid var(--border)"><span class="muted" style="display:inline-block;min-width:150px">${dateTime(e.t)}</span>${!['check', 'review', 'settings'].includes(e.kind) && e.t < liveSince ? '<span class="chip" style="margin-right:6px">بازپخش‌شده</span>' : ''}${line(e)}</li>`).join('')}</ul>`
        : `<p class="muted">${autoOn ? 'هنوز معامله‌ای انجام نشده — هوش مصنوعی منتظر موقعیتی مطابق با قوانین است.' : `هنوز معامله‌ای انجام نشده. هوش مصنوعی در حال حاضر ${session.status === 'stopped' ? 'متوقف است' : 'فعال نیست'}، بنابراین به دنبال موقعیت نمی‌گردد — برای شروع دکمه ${session.status === 'stopped' ? 'ادامه هوش مصنوعی' : 'شروع معامله‌گر'} را بزنید.`}</p>`}
    </div>`;
  }

  // ---------------------------------------------------------------- خودارزیابی
  function selfReview() {
    if (!state) return null;
    const lessons = load(LESSONS_KEY, []);
    const { review, changes } = reviewStep(state, cfg, lessons);
    if (changes.length) {
      save(CFG_KEY, cfg);
      save(LESSONS_KEY, lessons.slice(-50));
      save(STATE_KEY, state);
      toast(`خودارزیابی ${changes.length} قانون را تغییر داد.`, 'up');
    }
    return { review, changes };
  }

  function reviewCard() {
    if (!state) return '';
    const review = reviewTrades(state.closed);
    const lessons = load(LESSONS_KEY, []);
    const active = activeLessons(effective());
    const autoLearn = load(AUTOLEARN_KEY, true) !== false;
    const o = review.overall;
    return `<div class="card mt" id="reviewCard">
      <div class="card-h"><h3>${icon('ai', 16)} خودارزیابی تاریخچه معاملات</h3>
        <div class="row" style="gap:8px"><label class="fine" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="autoLearn" ${autoLearn ? 'checked' : ''}> یادگیری خودکار</label>
        <button class="btn sm" id="reviewNow">${icon('refresh', 14)} بررسی معاملات اکنون</button></div></div>
      <p class="fine" style="margin-top:0">پس از هر بررسی، هوش مصنوعی معاملات بسته‌شده خود را می‌خواند، آن‌ها را بر اساس شرایط بازار در زمان خرید دسته‌بندی می‌کند و زمانی که یک وضعیت پیوسته ضرر می‌دهد فیلتری را برای اجتناب از آن فعال می‌کند — یا اگر فیلتری نتایج را بدتر کرده باشد، آن را خاموش می‌کند. پیش از ایجاد هر تغییری به حداقل ${MIN_TRADES} معامله بسته‌شده نیاز دارد و تمام تغییرات همراه با آمار پشتوانه در زیر فهرست می‌شوند.</p>
      <div class="grid g4 mt">
        <div class="stat"><span class="k">معاملات بررسی‌شده</span><span class="v">${o.n}</span></div>
        <div class="stat"><span class="k">نرخ برد</span><span class="v">${o.winRate === null ? '—' : `${o.winRate}%`}</span></div>
        <div class="stat"><span class="k">میانگین نتیجه</span><span class="v ${o.avgR > 0 ? 'up' : o.avgR < 0 ? 'down' : ''}">${o.avgR === null ? '—' : `${o.avgR > 0 ? '+' : o.avgR < 0 ? '−' : ''}${Math.abs(o.avgR)}R`}</span><span class="s fine">R = میزان ریسک در هر معامله</span></div>
        <div class="stat"><span class="k">قوانین تغییریافته</span><span class="v">${lessons.filter((l) => !l.undo && !l.undone).length}</span></div>
      </div>
      ${review.findings.length ? `<ul class="reasons mt">${review.findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      ${(() => { const d = diagnose(state.closed, { startingBalance: state.startingBalance, fmt: (v) => `${v < 0 ? '−' : ''}${money(Math.abs(v))}` }); return d.length ? `<div class="mt"><div class="fine" style="margin-bottom:4px"><b>عوامل مؤثر در نتیجه</b></div><ul class="reasons">${d.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''; })()}
      <p class="fine mt"><b>قوانین فعال فعلی:</b> ${active.length ? esc(active.join(' · ')) : 'هنوز تغییری اعمال نشده — استراتژی اولیه'}.</p>
      ${lessons.length ? `<div class="mt"><div class="fine" style="margin-bottom:4px"><b>تغییرات اعمال‌شده و زمان آن‌ها</b></div><ul class="fine" style="list-style:none;padding:0;margin:0">${[...lessons].reverse().slice(0, 12).map((l) => `<li style="padding:4px 0;border-bottom:1px solid var(--border)"><span class="muted" style="display:inline-block;min-width:150px">${dateTime(l.at)}</span>${esc(l.text)}${l.undone ? ' <span class="chip">بعداً لغو شد</span>' : ''}</li>`).join('')}</ul></div>` : ''}
    </div>`;
  }

  function wireReview() {
    $('#reviewNow', el)?.addEventListener('click', () => {
      const r = selfReview();
      if (r && !r.changes.length) toast(r.review.overall.n < MIN_TRADES ? `${r.review.overall.n} معامله بررسی شد — برای اعمال تغییر به ${MIN_TRADES} معامله نیاز است.` : 'تاریخچه بررسی شد — هنوز الگوی قاطعی برای تغییر وجود ندارد.', 'info');
      draw();
    });
    $('#autoLearn', el)?.addEventListener('change', (e) => { save(AUTOLEARN_KEY, e.target.checked); toast(e.target.checked ? 'هوش مصنوعی پس از هر بررسی به طور خودکار قوانین را تنظیم می‌کند.' : 'تنظیم خودکار خاموش شد — برای بررسی دستی از دکمه استفاده کنید.', 'info'); });
  }

  // ---------------------------------------------------------------- حساب واقعی
  const REAL_KEY = 'realTradeState';
  const realState = () => load(REAL_KEY, null);

  function realCard() {
    const rs = realState();
    const has = rs && (Object.keys(rs.open).length || rs.closed.length);
    const s3 = has ? stats(rs, marks()) : null;
    const open = has ? Object.entries(rs.open) : [];
    const closed = has ? [...rs.closed].reverse().slice(0, 25) : [];
    return `<div class="card mt">
      <div class="card-h"><h3>حساب واقعی</h3><div class="row" style="gap:8px"><span class="chip up">سرمایه شخصی شما</span>${has ? '<button class="btn sm ghost" id="realReset">بازنشانی</button>' : ''}</div></div>
      <p class="fine">معاملاتی که واقعاً در صرافی انجام داده‌اید را اینجا ثبت کنید تا با همان معیارهای حساب‌های بالا سنجیده شوند. ${esc(REAL_NOTICE)}</p>

      <div class="row mt" style="gap:10px;align-items:center;flex-wrap:wrap">
        <label class="btn sm" style="cursor:pointer">${icon('exchanges', 14)} درون‌ریزی از بایننس (Binance)
          <input type="file" id="csvIn" accept=".csv,.tsv,.txt" hidden>
        </label>
        <span class="fine">مسیر در بایننس: Orders ← Trade History ← Export. فایل در مرورگر شما خوانده می‌شود و هیچ داده‌ای آپلود نمی‌شود.</span>
      </div>
      ${has ? `<div class="row mt" style="gap:8px;flex-wrap:wrap">
        <button class="btn sm ghost" data-export="real-csv">دانلود معاملات (CSV)</button>
        <button class="btn sm ghost" data-report="real">گزارش قابل چاپ</button>
      </div>` : ''}
      <p class="fine" id="csvMsg" hidden></p>

      <form id="rf" class="row mt" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
        <label class="fld">ارز<select class="inp" name="sym">${tradable.slice(0, 60).map((c) => `<option value="${esc(c.symbol)}">${esc(c.symbol)}</option>`).join('')}</select></label>
        <label class="fld">جهت<select class="inp" name="side"><option value="long">خرید (Long)</option><option value="short">فروش استقراضی (Short)</option></select></label>
        <label class="fld">مقدار<input class="inp" name="qty" type="number" step="any" min="0" placeholder="0.05" style="width:100px" required></label>
        <label class="fld">قیمت ورود (${esc(fx.code)})<input class="inp" name="entry" type="number" step="any" min="0" placeholder="${esc(price(60000 * fx.rate))}" style="width:130px" required></label>
        <label class="fld">قیمت خروج (${esc(fx.code)})<input class="inp" name="exit" type="number" step="any" min="0" placeholder="هنوز باز است" style="width:130px"></label>
        <label class="fld">کارمزد (${esc(fx.code)})<input class="inp" name="fee" type="number" step="any" min="0" placeholder="0" style="width:100px"></label>
        <button class="btn primary">ثبت معامله</button>
      </form>
      <p class="fine down" id="rfErr" hidden></p>

      ${s3 ? `<div class="grid g4 mt">
        <div class="stat"><span class="k">نتیجه محقق‌شده</span><span class="v ${s3.returnPct >= 0 ? 'up' : 'down'}">${pct(s3.returnPct)}</span><span class="s fine">${money(s3.equity - s3.startingBalance)} بر مبنای ${money(s3.startingBalance)}</span></div>
        <div class="stat"><span class="k">نرخ برد</span><span class="v">${s3.winRate === null ? '—' : `${s3.winRate}%`}</span><span class="s fine">${s3.wins} برد / ${s3.losses} باخت${s3.profitFactor ? ` · ضریب سود ${s3.profitFactor}` : ''}</span></div>
        <div class="stat"><span class="k">بیشترین افت سرمایه</span><span class="v ${s3.maxDrawdownPct > 0 ? 'down' : 'flat'}">${pct(-s3.maxDrawdownPct, 1)}</span></div>
        <div class="stat"><span class="k">تعداد معاملات</span><span class="v">${s3.trades}</span><span class="s fine">${s3.openCount} باز</span></div>
      </div>` : ''}

      ${open.length ? `<div class="tbl-wrap mt"><table class="tbl"><thead><tr><th class="l">ارز</th><th>جهت</th><th>ورود</th><th>اکنون</th><th>حجم</th><th>سود/زیان باز</th><th></th></tr></thead><tbody>
        ${open.map(([sym, p]) => {
          const px = priceOf(sym);
          const pnl = px === null ? null : (p.side === 'short' ? (p.entry - px) : (px - p.entry)) * p.qty;
          return `<tr><td class="l"><b>${esc(sym)}</b></td><td>${p.side === 'short' ? 'فروش (Short)' : 'خرید (Long)'}</td><td>${money(p.entry)}</td><td>${px === null ? '<span class="muted">بدون قیمت</span>' : money(px)}</td><td>${money(p.notional)}</td>
            <td class="${pnl === null ? 'muted' : pnl >= 0 ? 'up' : 'down'}">${pnl === null ? '—' : `<b>${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl))}</b>`}</td>
            <td><button class="btn sm" data-realclose="${esc(sym)}">ثبت فروش…</button></td></tr>`;
        }).join('')}</tbody></table></div>` : ''}

      ${closed.length ? `<div class="tbl-wrap mt"><table class="tbl"><thead><tr><th class="l">ارز</th><th class="l">تاریخ بسته شدن</th><th>ورود</th><th>خروج</th><th>نتیجه</th></tr></thead><tbody>
        ${closed.map((t) => `<tr><td class="l"><b>${esc(t.symbol)}</b>${t.side === 'short' ? ' <small class="muted">شورت</small>' : ''}</td><td class="l fine">${dateTime(t.exitAt, false)}</td><td>${money(t.entry)}</td><td>${money(t.exit)}</td>
          <td class="${t.pnl >= 0 ? 'up' : 'down'}"><b>${t.pnl >= 0 ? '+' : '−'}${money(Math.abs(t.pnl))}</b> <small>${pct(t.pnlPct)}</small></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="fine mt">هنوز معامله واقعی ثبت نشده است.</p>'}
      ${has && rs.equityCurve.length > 2 ? `<div class="mt"><div class="card-h" style="margin-bottom:6px"><h3 style="font-size:14px">روند سرمایه شما در طول زمان</h3><span class="fine">در مقایسه با نگهداری ساده بیت‌کوین</span></div><div id="realChart"></div><p class="fine" id="realChartNote"></p></div>` : ''}
    </div>`;
  }

  async function drawRealChart() {
    const host = $('#realChart', el);
    if (!host) return;
    const rs = realState();
    if (!rs || rs.equityCurve.length < 3) return;
    const curve = rs.equityCurve;
    const from = curve[0].t, to = curve[curve.length - 1].t;
    const note = $('#realChartNote', el);

    let holdSeries = null;
    try {
      const btc = await findCoin('BTC');
      const span = to - from;
      const iv = span > 120 * 864e5 ? '1d' : span > 10 * 864e5 ? '4h' : '1h';
      const { candles } = await getCandles(btc, iv, 1000);
      const inRange = candles.filter((c) => c.t >= from - 864e5 && c.t <= to + 864e5);
      if (inRange.length > 2) {
        const base = inRange[0].c;
        holdSeries = inRange.map((c) => ({ x: c.t, y: (c.c / base) * rs.startingBalance }));
      }
    } catch { /* مقایسه اختیاری است */ }

    if (st.disposed) return;
    const lc = new LineChart(host, { height: 240, yFormat: (v) => money(v), legend: true });
    st.charts.push(lc);
    const series = [{ name: 'حساب شما', color: 'var(--accent)', width: 2.4, data: curve.map((p) => ({ x: p.t, y: p.equity })) }];
    if (holdSeries) series.push({ name: 'نگهداری بیت‌کوین (BTC)', color: 'var(--text-muted)', width: 1.6, dash: true, data: holdSeries });
    lc.set(series);

    if (note && holdSeries) {
      const mine = ((curve[curve.length - 1].equity / rs.startingBalance) - 1) * 100;
      const hold = ((holdSeries[holdSeries.length - 1].y / rs.startingBalance) - 1) * 100;
      const diff = mine - hold;
      note.textContent = diff >= 0
        ? `شما در این بازه زمانی ${pct(diff, 1)} جلوتر از نگهداری ساده بیت‌کوین هستید.`
        : `نگهداری ساده بیت‌کوین در این دوره ${pct(Math.abs(diff), 1, false)} عملکرد بهتری داشت. دانستن این موضوع پیش از معاملات بیشتر مفید است.`;
      note.className = `fine ${diff >= 0 ? 'up' : 'down'}`;
    }
  }

  function wireExports() {
    const stamp = new Date().toISOString().slice(0, 10);
    $$('[data-export]', el).forEach((b) => b.addEventListener('click', () => {
      const which = b.dataset.export;
      const src = which === 'ai-csv' ? state : realState();
      if (!src?.closed?.length) { toast('هنوز معامله بسته‌شده‌ای برای خروجی گرفتن وجود ندارد.', 'info'); return; }
      downloadText(`coinvantage-${which === 'ai-csv' ? 'ai-trader' : 'my-trades'}-${stamp}.csv`, tradesCsv(src.closed));
      toast(`${src.closed.length} معامله صادر شد.`, 'up');
    }));
    $$('[data-report]', el).forEach((b) => b.addEventListener('click', () => {
      const isAi = b.dataset.report === 'ai';
      const src = isAi ? state : realState();
      if (!src) { toast('هنوز داده‌ای برای گزارش‌گیری وجود ندارد.', 'info'); return; }
      const s2 = stats(src, marks());
      const notes = isAi
        ? ['<b>پول شبیه‌سازی‌شده.</b> این معاملات هرگز در صرافی ثبت نشده‌اند. کارمزدها مدل‌سازی شده‌اند اما لغزش قیمت خیر.']
        : ['<b>ثبت‌شده به صورت دستی یا درون‌ریزی‌شده.</b> این معاملات در صرافی انجام شده‌اند و این برنامه آن‌ها را ثبت نکرده است.'];
      const html = reportHtml({
        title: isAi ? 'معامله‌گر هوش مصنوعی — گزارش عملکرد' : 'گزارش عملکرد معاملاتی',
        accountName: isAi ? 'حساب شبیه‌سازی‌شده' : 'حساب واقعی',
        stats: s2, closed: [...src.closed].reverse(),
        fmtMoney: (v) => money(v), notes,
      });
      const w = window.open('', '_blank');
      if (!w) { downloadText(`coinvantage-report-${stamp}.html`, html, 'text/html;charset=utf-8'); toast('گزارش دانلود شد.', 'up'); return; }
      w.document.write(html);
      w.document.close();
    }));
  }

  function wireReal() {
    $('#csvIn', el)?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const msg = $('#csvMsg', el);
      msg.hidden = false;
      msg.className = 'fine';
      msg.textContent = `در حال خواندن ${file.name}…`;
      try {
        const text = await file.text();
        const { fills, errors, skipped } = parseTradeCsv(text);
        if (errors.length) { msg.className = 'fine down'; msg.textContent = errors[0]; return; }
        const { closed, open } = matchFills(fills);
        if (!closed.length && !open.length) { msg.className = 'fine down'; msg.textContent = 'هیچ معامله‌ای از این فایل قابل تطبیق نبود.'; return; }

        const rs = realState() || newState(cfg);
        let added = 0;
        for (const t of closed) {
          const r = recordRealTrade(rs, cfg, {
            symbol: t.symbol, side: 'long', qty: t.qty, entry: t.entry, exit: t.exit,
            fee: t.fee, openedAt: t.openedAt, closedAt: t.closedAt, note: 'درون‌ریزی‌شده',
          });
          if (r.ok) added++;
        }
        for (const o of open) {
          const r = recordRealTrade(rs, cfg, { symbol: o.symbol, side: 'long', qty: o.qty, entry: o.entry, fee: o.fee, openedAt: o.at, note: 'درون‌ریزی‌شده' });
          if (r.ok) added++;
        }
        save(REAL_KEY, rs);
        msg.className = 'fine up';
        msg.textContent = `${added} معامله از ${fills.length} سفارش درون‌ریزی شد — ${closed.length} بسته‌شده، ${open.length} همچنان باز${skipped ? `، ${skipped} ردیف نادیده گرفته شد` : ''}.`;
        toast(`${added} معامله درون‌ریزی شد.`, 'up');
        draw();
      } catch (err) {
        msg.className = 'fine down';
        msg.textContent = `خطا در خواندن فایل: ${err.message}`;
      } finally {
        e.target.value = '';
      }
    });

    const f3 = $('#rf', el);
    f3?.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = $('#rfErr', el);
      err.hidden = true;
      const rs = realState() || newState(cfg);
      const toUsd = (v) => (v === null || v === '' || v === undefined ? v : (fx.rate ? +v / fx.rate : +v));
      const r = recordRealTrade(rs, cfg, {
        symbol: f3.sym.value, side: f3.side.value,
        qty: f3.qty.value, entry: toUsd(f3.entry.value),
        exit: f3.exit.value === '' ? null : toUsd(f3.exit.value),
        fee: toUsd(f3.fee.value || 0),
      });
      if (!r.ok) { err.textContent = r.error; err.hidden = false; return; }
      save(REAL_KEY, rs);
      toast(r.trade ? `ثبت شد: ${r.trade.pnl >= 0 ? 'سود' : 'زیان'} به مبلغ ${money(Math.abs(r.trade.pnl))} پس از کارمزد.` : `معامله باز ${f3.sym.value} ثبت شد.`, r.trade && r.trade.pnl < 0 ? 'down' : 'up');
      draw();
    });

    $$('[data-realclose]', el).forEach((b) => b.addEventListener('click', async () => {
      const sym = b.dataset.realclose;
      const now = priceOf(sym) ?? await fetchPrice(sym);
      const m = modal(`<h3>ثبت فروش ${esc(sym)}</h3>
        <p class="fine">قیمتی که در صرافی فروخته‌اید را وارد کنید. CoinVantage فقط آن را ثبت می‌کند و سفارشی ارسال نمی‌شود.</p>
        <form class="stack mt" style="gap:10px" id="rcf">
          <label class="fld">قیمت فروش (${esc(fx.code)})<input class="inp" name="px" type="number" step="any" min="0" required value="${now === null ? '' : esc(String(+(now * (fx.rate || 1)).toPrecision(8)))}"></label>
          <label class="fld">کارمزد پرداخت‌شده در فروش (${esc(fx.code)})<input class="inp" name="fee" type="number" step="any" min="0" value="${now === null ? '0' : esc(String(+(now * (realState()?.open[sym]?.qty || 0) * (cfg.feePct / 100) * (fx.rate || 1)).toPrecision(4)))}"><small class="fine">بر اساس نرخ معمول ${cfg.feePct}% پر شده است؛ آن را با کارمزد واقعی صرافی خود تغییر دهید.</small></label>
          <p class="fine down" id="rcfErr" hidden></p>
          <button class="btn primary">ثبت فروش</button>
        </form>`);
      $('#rcf', m.el).addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        const rate = fx.rate || 1;
        const px = +f.px.value / rate;
        const rs = realState();
        const pos = rs?.open[sym];
        if (pos) pos.feePaid = (pos.feePaid || 0) + Math.max(0, +f.fee.value || 0) / rate;
        const r = rs ? closeManual(rs, { ...cfg, feePct: 0 }, sym, px, Date.now(), 'ثبت‌شده توسط شما') : { ok: false, error: 'این معامله دیگر باز نیست.' };
        if (!r.ok) { const err = $('#rcfErr', m.el); err.textContent = r.error; err.hidden = false; return; }
        save(REAL_KEY, rs);
        m.close();
        toast(`فروش ${sym} ثبت شد: ${r.trade.pnl >= 0 ? 'سود' : 'زیان'} به مبلغ ${money(Math.abs(r.trade.pnl))} پس از کارمزد.`, r.trade.pnl >= 0 ? 'up' : 'down');
        draw();
      });
    }));
    $('#realReset', el)?.addEventListener('click', () => {
      save(REAL_KEY, newState(cfg));
      toast('حساب واقعی پاک‌سازی شد.', 'info');
      draw();
    });
  }

  // معاملات آزمایشی شخصی کاربر.
  const MY_KEY = 'myDemoState';
  const myState = () => load(MY_KEY, null);

  function myDemoCard() {
    const ms = myState();
    if (!ms || (!Object.keys(ms.open).length && !ms.closed.length)) {
      return `<div class="card"><div class="card-h"><h3>معاملات آزمایشی شخصی شما</h3><span class="chip">حساب مجزا</span></div>
        <p class="fine">هنوز موردی وجود ندارد. وارد صفحه هر ارزی شوید، دکمه <b>معامله</b> را بزنید و از گزینه <b>خرید (آزمایشی)</b> برای ثبت معامله با قیمت زنده استفاده کنید. این حساب از حساب هوش مصنوعی جدا نگه داشته می‌شود تا آزمایش‌های شما سابقه استراتژی را تغییر ندهد.</p></div>`;
    }
    const s2 = stats(ms, marks());
    const open = Object.entries(ms.open);
    const closed = [...ms.closed].reverse().slice(0, 20);
    return `<div class="card">
      <div class="card-h"><h3>معاملات آزمایشی شخصی شما</h3><div class="row" style="gap:8px"><span class="chip">حساب مجزا</span><button class="btn sm ghost" id="myReset">بازنشانی</button></div></div>
      <div class="grid g4">
        <div class="stat"><span class="k">موجودی</span><span class="v ${s2.returnPct >= 0 ? 'up' : 'down'}">${money(s2.equity)}</span><span class="s fine">شروع با ${money(s2.startingBalance)}</span></div>
        <div class="stat"><span class="k">بازدهی</span><span class="v ${s2.returnPct >= 0 ? 'up' : 'down'}">${pct(s2.returnPct)}</span></div>
        <div class="stat"><span class="k">نرخ برد</span><span class="v">${s2.winRate === null ? '—' : `${s2.winRate}%`}</span><span class="s fine">${s2.wins} برد / ${s2.losses} باخت</span></div>
        <div class="stat"><span class="k">معاملات</span><span class="v">${s2.trades}</span><span class="s fine">${s2.openCount} همچنان باز</span></div>
      </div>
      ${open.length ? `<div class="tbl-wrap mt"><table class="tbl"><thead><tr><th class="l">ارز</th><th>قیمت خرید</th><th>اکنون</th><th>حجم</th><th>سود/زیان باز</th><th></th></tr></thead><tbody>
        ${open.map(([sym, p]) => {
          const px = priceOf(sym);
          const pnl = px === null ? null : (px - p.entry) * p.qty;
          return `<tr><td class="l"><b>${esc(sym)}</b></td><td>${money(p.entry)}</td><td>${px === null ? '<span class="muted">بدون قیمت</span>' : money(px)}</td><td>${money(p.notional)}</td>
            <td class="${pnl === null ? 'muted' : pnl >= 0 ? 'up' : 'down'}">${pnl === null ? '—' : `<b>${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl))}</b> <small>${pct((px / p.entry - 1) * 100)}</small>`}</td>
            <td><button class="btn sm" data-mysell="${esc(sym)}">فروش</button></td></tr>`;
        }).join('')}
      </tbody></table></div>` : ''}
      ${closed.length ? `<div class="tbl-wrap mt"><table class="tbl"><thead><tr><th class="l">ارز</th><th class="l">بسته شده</th><th>خرید</th><th>فروش</th><th>نتیجه</th></tr></thead><tbody>
        ${closed.map((t) => `<tr><td class="l"><b>${esc(t.symbol)}</b></td><td class="l fine">${dateTime(t.exitAt, false)}</td><td>${money(t.entry)}</td><td>${money(t.exit)}</td>
          <td class="${t.pnl >= 0 ? 'up' : 'down'}"><b>${t.pnl >= 0 ? '+' : '−'}${money(Math.abs(t.pnl))}</b> <small>${pct(t.pnlPct)}</small></td></tr>`).join('')}
      </tbody></table></div>` : ''}
      <p class="fine mt">${esc(DEMO_NOTICE)}</p>
    </div>`;
  }

  function wireMyDemo() {
    $('#myReset', el)?.addEventListener('click', () => {
      save(MY_KEY, newState(cfg));
      toast('حساب آزمایشی شما به موجودی اولیه بازگشت.', 'info');
      draw();
    });
    $$('[data-mysell]', el).forEach((b) => b.addEventListener('click', async () => {
      const sym = b.dataset.mysell;
      const ms = myState();
      const px = priceOf(sym) ?? await fetchPrice(sym);
      if (px === null) { toast(`در حال حاضر قیمتی برای ${sym} وجود ندارد — لحظاتی دیگر دوباره تلاش کنید.`, 'info'); return; }
      const r = closeManual(ms, cfg, sym, px);
      if (!r.ok) { toast(r.error, 'down'); return; }
      save(MY_KEY, ms);
      toast(`${sym} فروخته شد: ${r.trade.pnl >= 0 ? 'سود' : 'زیان'} به مبلغ ${money(Math.abs(r.trade.pnl))} پس از کارمزد.`, r.trade.pnl >= 0 ? 'up' : 'down');
      draw();
    }));
  }

  const unlisted = (sym) => knownVenue(all.find((c) => c.symbol === sym)) === null;
  function untradable() {
    const streak = load(NODATA_KEY, {});
    const step = INTERVAL_MS[state?.interval || cfg.interval] || 36e5;
    const cloud = [...(state?.log || [])].reverse().find((e) => e.kind === 'check' && e.by === 'cloud' && Array.isArray(e.failed));
    const cloudReads = (sym) => !!cloud && Date.now() - cloud.t < 2 * step + 36e5 && !cloud.failed.includes(sym);
    const noData = cfg.universe.filter((s) => ((streak[s] || 0) >= 2 || unlisted(s)) && !cloudReads(s));
    const sparse = cfg.universe.filter((s) => st.noExchange.includes(s) && !noData.includes(s));
    return { noData, sparse, all: [...noData, ...sparse] };
  }

  function settingsCard() {
    const w = settingsWarnings({ ...cfg, interval: state?.interval || cfg.interval });
    if (!w.length) return '';
    return `<div class="card" style="border-color:var(--warn);margin-bottom:14px" id="settingsWarn">
      <p style="margin:0"><b>تنظیمات شما با تنظیمات تست‌شده متفاوت است، بنابراین نتایج تست‌شده درباره این حساب صدق نمی‌کند.</b></p>
      <ul class="fine" style="margin:6px 0 0;padding-left:18px">${w.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <button class="btn sm mt" type="button" id="warnUseBest">استفاده از بهترین تنظیمات تست‌شده</button>
    </div>`;
  }

  function untradableCard() {
    const u = untradable();
    if (!u.all.length) return '';
    const n = u.all.length;
    return `<div class="card" style="border-color:var(--warn)" id="untradable">
      <p style="margin:0"><b>${n} ارز در لیست هوش مصنوعی قابل معامله نیست و در هر بررسی نادیده گرفته می‌شود.</b>
      ${u.noData.length ? `${esc(u.noData.join('، '))}: داده‌ای از صرافی‌های تحت پوشش (Binance, Gate.io, HTX, OKX) دریافت نشد. ` : ''}${u.sparse.length ? `${esc(u.sparse.join('، '))}: فقط قیمت‌های پراکنده CoinGecko موجود است که برای معامله کافی نیست. ` : ''}بقیه لیست بدون مشکل است.</p>
      <button class="btn sm mt" type="button" id="dropUntradable">حذف از لیست</button>
    </div>`;
  }
  function wireUntradable() {
    $('#dropUntradable', el)?.addEventListener('click', () => {
      const gone = untradable().all;
      if (!gone.length) return;
      cfg.universe = cfg.universe.filter((s) => !gone.includes(s));
      save(CFG_KEY, cfg);
      if (state) { logCheck(state, { kind: 'settings', text: `${gone.join('، ')} حذف شدند (نبود داده قیمتی)` }); save(STATE_KEY, state); }
      toast(`${gone.join('، ')} از لیست هوش مصنوعی حذف شد.`, 'up');
      draw();
    });
  }

  function draw() {
    if (!state) { $('#body', el).innerHTML = `${backupCard()}${myDemoCard()}${realCard()}<div class="mt">${verdictCard()}</div>${earningsCard()}${startCard()}`; wireBackup(); wireMyDemo(); wireReal(); wireExports(); drawRealChart(); syncRunButtons(); syncSessionChip(); return; }
    const s = stats(state, marks());
    const open = Object.entries(state.open);
    const closed = [...state.closed].reverse();

    $('#body', el).innerHTML = `
      ${backupCard()}
      ${myDemoCard()}
      ${realCard()}
      <h3 class="mt" style="margin-bottom:8px">حساب اختصاصی هوش مصنوعی</h3>
      ${settingsCard()}
      ${untradableCard()}
      ${verdictCard()}
      ${earningsCard()}
      <div class="grid g4">
        <div class="card"><div class="stat"><span class="k">موجودی فعلی</span><span class="v ${s.returnPct >= 0 ? 'up' : 'down'}">${money(s.equity)}</span><span class="s fine">شروع با ${money(s.startingBalance)}</span></div></div>
        <div class="card"><div class="stat"><span class="k">بازدهی</span><span class="v ${s.returnPct >= 0 ? 'up' : 'down'}">${pct(s.returnPct)}</span><span class="s fine">از ${dateTime(s.since, false)}${s.since < s.liveSince - 60e3 ? ` · بازپخش‌شده تا ${dateTime(s.liveSince)}` : ''}</span></div></div>
        <div class="card"><div class="stat"><span class="k">نرخ برد</span><span class="v">${s.winRate === null ? '—' : `${s.winRate}%`}</span><span class="s fine">${s.wins} برد / ${s.losses} باخت${s.profitFactor ? ` · ضریب سود ${s.profitFactor}` : ''}</span></div></div>
        <div class="card"><div class="stat"><span class="k">بیشترین افت سرمایه</span><span class="v ${s.maxDrawdownPct > 0 ? 'down' : 'flat'}">${pct(-s.maxDrawdownPct, 1)}</span><span class="s fine">${s.openCount} باز · ${s.trades} بسته‌شده</span></div></div>
      </div>

      <div class="card mt">
        <div class="card-h"><h3>موقعیت‌های باز</h3><span class="fine">محاسبه‌شده بر اساس قیمت زنده (یا آخرین کندل تا زمان دریافت قیمت زنده)</span></div>
        ${open.length ? `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">ارز</th><th class="hide-p">ورود</th><th>اکنون</th><th class="hide-p">حد ضرر</th><th class="hide-p">حد سود</th><th class="hide-t">حجم</th><th>سود/زیان باز</th><th class="l hide-t">زمان باز شدن</th></tr></thead><tbody>
          ${open.map(([sym, p]) => {
            const px = st.prices[sym];
            if (!Number.isFinite(px)) {
              const coin = all.find((c) => c.symbol === sym);
              return `<tr data-sym="${esc(sym)}"><td class="l"><div class="coin-cell">${coinLogo(coin || { symbol: sym }, 22)}<b>${esc(sym)}</b></div></td>
                <td class="hide-p">${money(p.entry)}</td><td class="muted">در حال بارگذاری…</td>
                <td class="down hide-p">${money(p.stop)}</td><td class="up hide-p">${p.tp === null || p.tp === undefined ? 'متحرک' : money(p.tp)}</td>
                <td class="hide-t">${money(p.notional)}</td><td class="muted fine">در انتظار قیمت</td><td class="l fine hide-t">${dateTime(p.openedAt + (INTERVAL_MS[state.interval] || 0))}</td></tr>`;
            }
            const pnl = (px - p.entry) * p.qty;
            const coin = all.find((c) => c.symbol === sym);
            return `<tr data-sym="${esc(sym)}">
              <td class="l"><div class="coin-cell">${coinLogo(coin || { symbol: sym }, 22)}<b>${esc(sym)}</b></div></td>
              <td class="hide-p">${money(p.entry)}</td><td>${money(px)}${st.priceFrom[sym] === 'candle' ? '<br><small class="fine" title="در استریم بایننس نیست: هر ۲۰ ثانیه از صرافی خودش خوانده می‌شود">هر ۲۰ ثانیه</small>' : ''}</td>
              <td class="down hide-p">${money(p.stop)}${p.movedToBreakEven ? ' <span class="fine">(سربه‌سر)</span>' : ''}</td>
              <td class="up hide-p">${p.tp === null || p.tp === undefined ? 'متحرک' : money(p.tp)}</td>
              <td class="hide-t">${money(p.notional)}</td>
              <td class="${pnl >= 0 ? 'up' : 'down'}"><b>${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl))}</b><br><small>${pct((px / p.entry - 1) * 100)}</small></td>
              <td class="l fine hide-t">${dateTime(p.openedAt + (INTERVAL_MS[state.interval] || 0))}<br><small>${ago(p.openedAt + (INTERVAL_MS[state.interval] || 0))}</small></td></tr>`;
          }).join('')}
        </tbody></table></div>` : `<p class="muted">${autoOn ? 'در حال حاضر موقعیت بازی وجود ندارد — هوش مصنوعی منتظر موقعیت مناسب است.' : 'موقعیت بازی وجود ندارد. هوش مصنوعی غیرفعال است، پس تا زمان شروع معامله‌ای باز نخواهد شد.'}</p>`}
      </div>

      ${activityCard()}
      ${reviewCard()}

      ${state.equityCurve.length > 2 ? `<div class="card mt"><div class="card-h"><h3>روند موجودی در طول زمان</h3><span class="fine">شبیه‌سازی‌شده</span></div><div id="eqChart"></div></div>` : ''}

      <div class="card mt">
        <div class="card-h"><h3>تاریخچه معاملات</h3><div class="row" style="gap:8px"><span class="fine">${s.trades} بسته‌شده · ${money(s.feesPaid)} کارمزد پرداختی</span><button class="btn sm ghost" data-export="ai-csv">CSV</button><button class="btn sm ghost" data-report="ai">گزارش</button></div></div>
        ${closed.length ? `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">ارز</th><th class="l hide-p">باز شده</th><th class="l">بسته شده</th><th class="hide-p">ورود</th><th class="hide-p">خروج</th><th>نتیجه</th><th class="l">علت بسته شدن</th></tr></thead><tbody>
          ${closed.slice(0, 60).map((t) => `<tr data-sym="${esc(t.symbol)}">
            <td class="l"><b>${esc(t.symbol)}</b></td>
            <td class="l fine hide-p">${dateTime(t.openedAt + (INTERVAL_MS[state.interval] || 0))}</td><td class="l fine wrap">${dateTime(t.exitAt + (INTERVAL_MS[state.interval] || 0))}</td>
            <td class="hide-p">${money(t.entry)}</td><td class="hide-p">${money(t.exit)}</td>
            <td class="${t.pnl >= 0 ? 'up' : 'down'}"><b>${t.pnl >= 0 ? '+' : '−'}${money(Math.abs(t.pnl))}</b> <small>${pct(t.pnlPct)}</small></td>
            <td class="l"><span class="chip ${t.reason === 'target' ? 'up' : t.reason === 'stop-loss' ? 'down' : ''}">${esc(t.reason)}</span></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">هنوز معامله بسته‌شده‌ای وجود ندارد.</p>'}
      </div>

      <div class="card mt" style="background:var(--surface-2)">
        <h3>این ابزار چیست و چه چیزی نیست</h3>
        <p class="fine">${esc(PAPER_NOTICE)} نتایج شامل ${cfg.feePct}% کارمزد در هر طرف معامله هستند و فرض می‌کنند هرگاه یک کندل همزمان هم حد ضرر و هم حد سود را لمس کند، ابتدا حد ضرر فعال شده است — بنابراین محاسبات به ضرر استراتژی (بدبینانه) انجام می‌شود نه به نفع آن.</p>
        <p class="fine">شبیه‌سازی نمی‌تواند لغزش قیمت، عمق کم دفتر سفارش‌ها یا قطعی صرافی در میانه حرکت بازار را بازسازی کند. اجرای موفق در اینجا را نشانه‌ای از منطقی بودن قوانین بدانید، نه تضمین بازدهی.</p>
      </div>
      ${learningCard()}`;

    $$('tr[data-sym]', el).forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/coin/${tr.dataset.sym}`; }));
    wireBackup();
    wireUntradable();
    $('#warnUseBest', el)?.addEventListener('click', () => { $('#cfgBtn', el).click(); document.querySelector('.modal #useBest')?.click(); });
    wireMyDemo();
    wireReal();
    wireExports();
    wireReview();
    drawRealChart();
    syncRunButtons();
    syncSessionChip();

    st.charts.forEach((c) => c.destroy());
    st.charts = [];
    if ($('#eqChart', el)) {
      const lc = new LineChart($('#eqChart', el), { height: 240, yFormat: (v) => money(v), legend: false });
      st.charts.push(lc);
      const pts = state.equityCurve.map((p) => ({ x: p.t, y: p.equity }));
      const nowT = Date.now(), lastPt = pts[pts.length - 1];
      if (lastPt && nowT - lastPt.x > (INTERVAL_MS[state.interval] || 36e5)) pts.push({ x: nowT, y: s.equity });
      lc.set([{ name: 'موجودی', color: 'var(--accent)', width: 2.2, data: pts }]);
    }
  }

  // ---------------------------------------------------------------- تنظیمات
  function resetAccount() {
    const wasRunning = autoOn;
    state = newState(cfg, { liveFrom: Date.now() }); save(STATE_KEY, state);
    st.prices = {}; st.priceFrom = {};
    applySession('RESET');
    saveLedger(newLedger());
    if (wasRunning) applySession('START');
    return wasRunning;
  }

  function yieldHtml(c) {
    const y = expectedYield(c);
    const sign = (v) => pct(v, 2);
    if (!y) return `<b>بازدهی مورد انتظار</b><p class="fine" style="margin:6px 0 0">داده‌ای برای برآورد وجود ندارد: ${c.strategy === 'custom' ? 'قوانین شخصی شما هرگز تست نشده‌اند' : `نمودار ${esc(c.interval)} تست نشده است`}. گزینه «تست این تنظیمات» در پایین، عملکرد آن‌ها را روی کندل‌های اخیر نشان می‌دهد.</p>`;
    const own = c.strategy !== 'custom' && !c.ownRulesOff && c.interval === PER_COIN_RULES.interval;
    const cash = (v) => `${v >= 0 ? '+' : '−'}${money(Math.abs((c.startingBalance * v) / 100))}`;
    const top = y.levels.reduce((a, l) => (!a || l.ret > a.ret ? l : a), null);
    const n = (c.universe || []).length;
    return `<b>بازدهی مورد انتظار</b> <span class="fine">بر اساس تست گام‌به‌گام قوانین ${esc(y.chart)}، با ریسک ${y.risk}% در هر معامله</span>
      <p class="fine" style="margin:6px 0 0">به طور میانگین حدود <b class="${y.ret >= 0 ? 'up' : 'down'}">${sign(y.ret)}</b> در هر ${esc(y.block)} (${cash(y.ret)} روی ${money(c.startingBalance)}): ${sign(y.lo)} در بدترین دوره از ${y.periods} دوره تست، ${sign(y.hi)} در بهترین دوره، و سوددهی در ${y.up} دوره از ${y.periods} دوره. بیشترین افت سرمایه حدود ${y.dd}% با احتساب معاملات باز؛ حدود ${y.trades} معامله در هر دوره. نگهداری ساده همان ارزها ${sign(y.hold)} در هر دوره سود داشت${y.holdDrop ? ` و تا ${y.holdDrop}% افت را تجربه کرد` : ''}.${y.fillCost ? ` پر شدن سفارش‌ها با ۰.۰۵٪ قیمت بدتر (اسپرد و لغزش) حدود ${y.fillCost} واحد درصد از بازدهی هر دوره کم می‌کند.` : ''}</p>
      <p class="fine" style="margin:6px 0 0">اندازه‌گیری‌شده روی ${y.coins} ارز در یک حساب${n && n < y.coins ? `؛ با ${n} ارز انتظار معاملات کمتری را داشته باشید` : ''}.${VOL_SCALE.charts.includes(c.interval) && c.strategy !== 'custom' ? ` این ارقام مربوط به پیش از زمانی است که ${esc(c.interval)} هنگام نوسان شدید ارز حجم خرید را کاهش دهد؛ در تست روی همان دوره‌ها، این قابلیت ${VOL_SCALE.tested[c.interval].ret >= 0 ? '+' : '−'}${Math.abs(VOL_SCALE.tested[c.interval].ret)} واحد درصد به سود اضافه کرد و بیشترین افت سرمایه را ${Math.abs(VOL_SCALE.tested[c.interval].dd)} واحد درصد کاهش داد.` : ''}${y.capsDiffer ? ' سقف معاملات باز یا سهم هر ارز در تنظیمات شما با تست (۵ معامله باز، ۲۵٪ در هر ارز) متفاوت است، پس اعداد را تقریبی بدانید.' : ''}${own ? ` با فعال بودن قوانین اختصاصی هر ارز، یک تست مجزا در بازه ${PER_COIN_RULES.tested.from.slice(0, 4)}–${PER_COIN_RULES.tested.to.slice(0, 4)} بازدهی ${sign(PER_COIN_RULES.tested.own.ret)} در برابر ${sign(PER_COIN_RULES.tested.standard.ret)} بدون آن‌ها داشت.` : ''} این برآوردی از گذشته است، نه تضمین آینده.</p>
      ${y.levels.length ? `<div class="tbl-wrap mt"><table class="tbl fine fit"><thead><tr><th class="l">ریسک هر معامله</th><th>میانگین هر دوره</th><th>بدترین ← بهترین دوره</th><th>بیشترین افت</th><th class="hide-p">دوره‌های مثبت</th></tr></thead><tbody>
        ${y.levels.map((l) => `<tr${l.risk === y.risk ? ' style="font-weight:700"' : ''}><td class="l">${l.risk}%${l.risk === y.risk ? '<small>انتخاب شما</small>' : ''}</td><td class="${l.ret >= 0 ? 'up' : 'down'}">${sign(l.ret)}</td><td class="range">${sign(l.lo)} → ${sign(l.hi)}</td><td>${l.dd}%</td><td class="hide-p">${l.up} از ${y.periods}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="fine" style="margin:6px 0 0">هر ردیف همان تست را با آن سطح ریسک نشان می‌دهد${y.levels.some((l) => l.risk === y.risk) ? '' : `؛ ریسک شما (${y.risk}%) بین دو ردیف نزدیک برآورد می‌شود`}. بهترین میانگین در ریسک ${top.risk}% به دست آمده است${top.risk < y.levels[y.levels.length - 1].risk ? ' و مقادیر بالاتر سود بیشتری نداشتند: با سقف ۲۵٪ سرمایه در یک ارز، افزایش بیشتر ریسک عملاً حجم معاملات را بزرگ‌تر نمی‌کند' : `، با بیشترین افت ${top.dd}% در برابر ${y.levels[0].dd}% در ریسک ${y.levels[0].risk}% و بدترین دوره ${sign(top.lo)}`}. این اعداد از دوره‌های گذشته استخراج شده‌اند و راهنما هستند نه تضمین.</p>` : ''}`;
  }

  $('#cfgBtn', el).addEventListener('click', () => {
    const coins = all.filter((c) => !isStable(c.symbol)).slice(0, 100);
    const chosen = new Set(cfg.universe);
    const streakNow = load(NODATA_KEY, {});
    const noDataNow = [...Object.keys(streakNow).filter((k) => streakNow[k] >= 2), ...st.noExchange];
    const VENUE = { gate: 'Gate.io', htx: 'HTX', okx: 'OKX' };
    const venueTag = (c) => {
      const v = knownVenue(c);
      if (v === null) return ' <small class="down" title="در صرافی‌های Binance، Gate.io، HTX یا OKX فهرست نشده است">بدون صرافی</small>';
      if (noDataNow.includes(c.symbol)) return ' <small class="down" title="داده قیمتی برای معامله وجود ندارد">بدون داده</small>';
      if (v === 'binance') return '';
      return v ? ` <small class="muted" title="در بایننس نیست: کندل‌ها از ${VENUE[v]} دریافت می‌شوند">${VENUE[v]}</small>` : ' <small class="muted" title="در حال جستجو در Gate.io، HTX و OKX">در حال بررسی…</small>';
    };
    const best = bestTestedChart();
    const own = cfg.custom ? { ...CUSTOM_DEFAULT, ...cfg.custom } : { ...CUSTOM_DEFAULT };
    const exitOf = (r) => (r.trailAtr ? `t${r.trailAtr}` : `r${r.rMultiple}`);
    const chartLabel = (i) => {
      const x = CHART_TESTED[i];
      if (!x) return `${i} — تست‌نشده`;
      const t = x.adopt ? x.own : x.standard;
      return `${i} — تست‌شده ${pct(t.ret, 2)} در هر ${x.block} (نگهداری ساده ${pct(x.hold, 2)})`;
    };
    const m = modal(`<h3>تنظیمات معامله‌گر</h3>
      <div class="card mt" style="padding:12px" id="todo"><b>پیشنهاد بهینه</b>
        <p class="fine" style="margin:6px 0 0">بهترین ترکیب تست‌شده: نمودار <b>${esc(best.iv)}</b> همراه با قوانین تست‌شده. پس از کسر هزینه پر شدن واقعی سفارش‌ها (۰.۰۵٪ بدتر در هر طرف)، به طور میانگین ${pct(best.net, 2)} در هر ${esc(best.block)} (حدود ${pct(best.month, 1)} در ماه) با بیشترین افت ${best.dd}% بازدهی داشته است؛ نگهداری ساده همین ارزها ${pct(best.hold, 2)} در هر دوره بازدهی داشت و بدترین دوره آن ${best.worstNet >= 0 ? 'همچنان سودده بود' : `${Math.abs(best.worstNet)}% ضرر داد`}. ریسک را روی ۱ تا ۲ درصد نگه دارید، حداقل پنج ارز انتخاب کنید و خودارزیابی را روشن بگذارید. هیچ‌کدام از این‌ها تضمین نیست: تست‌ها به گذشته نگاه می‌کنند و بازار به سمت آینده می‌رود.</p>
        <button class="btn sm mt" type="button" id="useBest">اعمال بهترین ترکیب تست‌شده</button>
        <div id="todoLive"></div></div>
      <form class="stack mt" style="gap:12px" id="cf" novalidate>
        <fieldset class="stack" style="gap:8px;border:0;padding:0;margin:0;min-width:0"><legend class="fine"><b>حساب و مدیریت ریسک</b></legend>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <label class="fld">موجودی اولیه${fx.code === 'USD' ? '' : ` (${esc(fx.code)})`}<input class="inp" name="startingBalance" type="number" min="${Math.ceil(100 * fx.rate)}" step="any" value="${Math.round(cfg.startingBalance * fx.rate)}" style="width:150px"></label>
            <label class="fld">ریسک هر معامله %<input class="inp" name="riskPct" type="number" min="0.1" max="5" step="0.1" value="${cfg.riskPct}" style="width:110px"></label>
            <label class="fld">حداکثر معاملات باز<input class="inp" name="maxPositions" type="number" min="1" max="20" value="${cfg.maxPositions}" style="width:110px"></label>
            <label class="fld">حداکثر در یک ارز %<input class="inp" name="maxPositionPct" type="number" min="5" max="100" step="5" value="${cfg.maxPositionPct}" style="width:120px"></label>
            <label class="fld">کارمزد هر معامله %<input class="inp" name="feePct" type="number" min="0" max="1" step="0.01" value="${cfg.feePct}" style="width:110px"></label>
          </div>
          ${fx.code === 'USD' ? '' : `<p class="fine" style="margin:0">موجودی اولیه بر حسب ${esc(fx.code)} با نرخ امروز است (${money(cfg.startingBalance)} معادل $${cfg.startingBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })})؛ خود حساب بر پایه دلار آمریکا نگهداری می‌شود.</p>`}
        </fieldset>
        <fieldset class="stack" style="gap:8px;border:0;padding:0;margin:0;min-width:0"><legend class="fine"><b>نمودار (تایم‌فریم)</b></legend>
          <select class="inp" name="interval" aria-label="نمودار" style="width:100%">${TRADER_CHARTS.map((i) => `<option value="${i}" ${i === cfg.interval ? 'selected' : ''}>${esc(chartLabel(i))}</option>`).join('')}</select>
          <label class="row fine" style="gap:8px;align-items:flex-start" id="switchRow" hidden><input type="checkbox" name="switchNow" checked style="margin-top:2px"><span>شروع فوری یک حساب جدید روی نمودار جدید. این حساب دارای معاملاتی در <b>${esc(state?.interval || cfg.interval)}</b> است؛ ترکیب دو نمودار در یک موجودی سابقه آن را مخدوش می‌کند، بنابراین معاملات و موجودی قبلی پاک می‌شوند. برای حفظ حساب فعلی و تغییر در بازنشانی بعدی، تیک را بردارید.</span></label>
        </fieldset>
        <fieldset class="stack" style="gap:8px;border:0;padding:0;margin:0;min-width:0"><legend class="fine"><b>استراتژی</b></legend>
          <label class="row" style="gap:8px"><input type="radio" name="strategy" value="tested" ${cfg.strategy === 'custom' ? '' : 'checked'}><span>قوانین تست‌شده برای نمودار <span class="fine">(پیشنهادی)</span></span></label>
          <label class="row" style="gap:8px;align-items:flex-start;margin-left:24px" id="ownRow"><input type="checkbox" name="ownRules" ${cfg.ownRulesOff ? '' : 'checked'} style="margin-top:3px"><span class="fine">در نمودار روزانه، هر ارز با قوانین انتخاب‌شده بر اساس تاریخچه خودش معامله شود (${PER_COIN_RULES.coins} ارز دارای قانون اختصاصی هستند). تست‌شده در ${PER_COIN_RULES.tested.from.slice(0, 4)}–${PER_COIN_RULES.tested.to.slice(0, 4)}: بازدهی ${pct(PER_COIN_RULES.tested.own.ret, 2)} در برابر ${pct(PER_COIN_RULES.tested.standard.ret, 2)} برای قوانین روزانه عمومی، با بیشترین افت ${PER_COIN_RULES.tested.own.dd}% در برابر ${PER_COIN_RULES.tested.standard.dd}%.${(() => { const w = PER_COIN_RULES.tested.walkForward; return w && w.own < w.shared ? ` اما در بررسی ارز به ارز طی ${w.periods} دوره گام‌به‌گام، عملکردی ضعیف‌تر از قوانین مشترک داشتند (${pct(w.own, 2)} در برابر ${pct(w.shared, 2)} در هر دوره، بهتر در ${w.better} دوره از ${w.periods})، بنابراین نتیجه کل حساب متکی به چند ارز خاص است: خاموش کردن این گزینه انتخاب منطقی است.` : ''; })()}</span></label>
          <label class="row" style="gap:8px"><input type="radio" name="strategy" value="custom" ${cfg.strategy === 'custom' ? 'checked' : ''}><span>قوانین شخصی من <span class="fine">(بدون تست منتشرشده)</span></span></label>
          <div class="stack" id="customBox" style="gap:8px;margin-left:24px">
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <label class="fld">زمان خرید<select class="inp" name="entryMode">${[['trend', 'قوی بودن امتیاز روند'], ['breakout', 'شکست سقف ۲۰ کندلی'], ['pullback', 'اصلاح قیمتی در روند صعودی']].map(([v, t]) => `<option value="${v}" ${own.entryMode === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
              <label class="fld">حد ضرر<select class="inp" name="atrStop">${[1.5, 2, 3].map((v) => `<option value="${v}" ${own.atrStop === v ? 'selected' : ''}>${v} ATR پایین‌تر از ورود</option>`).join('')}</select></label>
              <label class="fld">زمان فروش<select class="inp" name="exit">${[['r2', 'هدف ۲ برابر ریسک'], ['r3', 'هدف ۳ برابر ریسک'], ['t3', 'حد ضرر متحرک ۳ ATR'], ['t4', 'حد ضرر متحرک ۴ ATR']].map(([v, t]) => `<option value="${v}" ${exitOf(own) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            </div>
            <label class="row fine" style="gap:8px"><input type="checkbox" name="momentumConfirm" ${own.momentumConfirm ? 'checked' : ''}>خرید فقط زمانی که مومنتوم کوتاه‌مدت تأیید کند</label>
            <label class="row fine" style="gap:8px"><input type="checkbox" name="trendFilter" ${own.trendFilter ? 'checked' : ''}>خرید فقط برای ارزهای در روند صعودی (بالای میانگین ۲۰۰ کندلی)</label>
            <label class="row fine" style="gap:8px"><input type="checkbox" name="marketFilter" ${own.marketFilter ? 'checked' : ''}>خرید فقط زمانی که خود بیت‌کوین در روند صعودی باشد</label>
            <label class="row fine" style="gap:8px"><input type="checkbox" name="signalExit" ${own.signalExitBars ? 'checked' : ''}>فروش پس از ۲ کندل بازگشت سیگنال</label>
          </div>
        </fieldset>
        <fieldset class="stack" style="gap:8px;border:0;padding:0;margin:0;min-width:0"><legend class="fine"><b>ارزها</b> <span id="coinCount"></span></legend>
          <div class="row" style="gap:6px;flex-wrap:wrap"><input class="inp" id="coinFind" placeholder="جستجوی ارز" aria-label="جستجوی ارز" style="flex:1;min-width:140px">
            <button class="btn sm" type="button" data-pick="10">۱۰ ارز برتر</button><button class="btn sm" type="button" data-pick="20">۲۰ ارز برتر</button><button class="btn sm" type="button" data-pick="all">همه</button><button class="btn sm" type="button" data-pick="tested" title="${TESTED_COINS.length} ارزی که نتایج منتشرشده روی آن‌ها اندازه‌گیری شده است">${TESTED_COINS.length} ارز تست‌شده</button><button class="btn sm" type="button" data-pick="own">ارزهای دارای قانون اختصاصی</button><button class="btn sm" type="button" data-pick="0">پاک کردن</button></div>
          <div id="coinGrid" class="pick-grid">
            ${coins.map((c) => `<label class="fine pick" data-coin="${esc(c.symbol)}" data-name="${esc((c.name || '').toLowerCase())}"><input type="checkbox" value="${esc(c.symbol)}" ${chosen.has(c.symbol) ? 'checked' : knownVenue(c) === null ? 'disabled' : ''} ${noDataNow.includes(c.symbol) || knownVenue(c) === null ? 'data-nodata="1"' : ''}><b>${esc(c.symbol)}</b>${PER_COIN_RULES.rules[c.symbol] ? ' <small title="دارای قوانین روزانه اختصاصی">★</small>' : ''}${(cfg.excluded || []).includes(c.symbol) ? ' <small class="down" title="کنار گذاشته‌شده توسط خودارزیابی">تعلیق‌شده</small>' : ''}<span data-venue>${venueTag(c)}</span></label>`).join('')}
          </div>
          ${(cfg.excluded || []).length ? `<label class="row fine" style="gap:8px"><input type="checkbox" name="unbench"><span>اجازه معامله مجدد به ارزهایی که خودارزیابی کنار گذاشته است (${esc(cfg.excluded.join('، '))})</span></label>` : ''}
          <p class="fine" style="margin:0">حداکثر ${MAX_COINS} ارز. ★ = دارای قوانین روزانه اختصاصی. ارزهای فاقد کندل صرافی در هر بررسی نادیده گرفته شده و در گزارش فعالیت‌ها نام برده می‌شوند.</p>
        </fieldset>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="testCfg">${icon('chart', 16)} تست این تنظیمات</button><button class="btn primary">ذخیره تنظیمات</button></div>
        <div id="testOut"></div>
      </form>`, { wide: true });
    const f = $('#cf', m.el);
    pool(coins.filter((c) => knownVenue(c) === undefined), 3, async (c) => {
      const v = await findVenue(c);
      const row = f.isConnected && f.querySelector(`#coinGrid [data-coin="${CSS.escape(c.symbol)}"]`);
      if (!row) return;
      row.querySelector('[data-venue]').innerHTML = venueTag(c);
      const box = row.querySelector('input');
      if (v === null) { box.dataset.nodata = '1'; if (!box.checked) box.disabled = true; }
    });
    const read = () => {
      const picks = [...f.querySelectorAll('#coinGrid input:checked')].map((x) => x.value);
      const exit = f.exit.value;
      return {
        startingBalance: f.startingBalance.value === f.startingBalance.defaultValue || !(+f.startingBalance.value > 0)
          ? cfg.startingBalance : Math.max(100, Math.round((+f.startingBalance.value / fx.rate) * 1e6) / 1e6),
        riskPct: Math.min(5, Math.max(0.1, +f.riskPct.value || DEFAULT_CONFIG.riskPct)),
        maxPositions: Math.min(20, Math.max(1, Math.round(+f.maxPositions.value) || DEFAULT_CONFIG.maxPositions)),
        maxPositionPct: Math.min(100, Math.max(5, +f.maxPositionPct.value || DEFAULT_CONFIG.maxPositionPct)),
        feePct: Math.min(1, Math.max(0, Number.isFinite(+f.feePct.value) ? +f.feePct.value : DEFAULT_CONFIG.feePct)),
        interval: f.interval.value,
        strategy: f.querySelector('input[name="strategy"]:checked')?.value === 'custom' ? 'custom' : 'tested',
        custom: { entryMode: f.entryMode.value, atrStop: +f.atrStop.value, rMultiple: exit[0] === 'r' ? +exit.slice(1) : 3, trailAtr: exit[0] === 't' ? +exit.slice(1) : null, momentumConfirm: f.momentumConfirm.checked, trendFilter: f.trendFilter.checked, marketFilter: f.marketFilter.checked, signalExitBars: f.signalExit.checked ? 2 : null },
        ownRulesOff: !f.ownRules.checked,
        universe: picks,
      };
    };
    const refresh = () => {
      const next = read();
      $('#customBox', m.el).hidden = next.strategy !== 'custom';
      $('#ownRow', m.el).hidden = next.strategy === 'custom';
      const hasTrades = state && (Object.keys(state.open || {}).length || (state.closed || []).length);
      $('#switchRow', m.el).hidden = !(hasTrades && next.interval !== (state?.interval || cfg.interval));
      $('#coinCount', m.el).textContent = `· ${next.universe.length} انتخاب‌شده${next.universe.length > MAX_COINS ? ` — فقط ${MAX_COINS} ارز قابل معامله هستند` : ''}`;
      const warn = settingsWarnings({ ...cfg, ...next });
      $('#todoLive', m.el).innerHTML = `<div class="mt" style="border-top:1px solid var(--border);padding-top:8px">${yieldHtml({ ...cfg, ...next })}</div>
        ${warn.length ? `<ul class="fine" style="margin:8px 0 0;padding-left:18px">${warn.map((w) => `<li class="down">${esc(w)}</li>`).join('')}</ul>` : '<p class="fine up" style="margin:8px 0 0">هیچ موردی در این تنظیمات نیاز به هشدار ندارد.</p>'}`;
    };
    $('#useBest', m.el).addEventListener('click', () => {
      f.interval.value = best.iv;
      f.querySelector('input[name="strategy"][value="tested"]').checked = true;
      f.ownRules.checked = true;
      f.riskPct.value = DEFAULT_CONFIG.riskPct;
      f.maxPositions.value = DEFAULT_CONFIG.maxPositions;
      f.maxPositionPct.value = DEFAULT_CONFIG.maxPositionPct;
      for (const x of f.querySelectorAll('#coinGrid input')) x.checked = !x.disabled && TESTED_COINS.includes(x.value);
      refresh();
    });
    f.addEventListener('input', refresh);
    f.addEventListener('change', refresh);
    $('#coinFind', m.el).addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const row of f.querySelectorAll('#coinGrid [data-coin]')) row.hidden = !!q && !row.dataset.coin.toLowerCase().includes(q) && !row.dataset.name.includes(q);
    });
    for (const b of f.querySelectorAll('[data-pick]')) b.addEventListener('click', () => {
      const v = b.dataset.pick;
      const boxes = [...f.querySelectorAll('#coinGrid input')];
      let n = 0;
      const want = (x) => (v === 'own' ? !!PER_COIN_RULES.rules[x.value] : v === 'tested' ? TESTED_COINS.includes(x.value) : v === 'all' ? n++ < MAX_COINS : n++ < +v);
      boxes.forEach((x) => { x.checked = !x.disabled && !x.dataset.nodata && want(x); });
      refresh();
    });
    $('#testCfg', m.el).addEventListener('click', async () => {
      const next = { ...cfg, ...read() };
      const syms = next.universe.slice(0, MAX_COINS);
      const out = $('#testOut', m.el);
      if (!syms.length) { out.innerHTML = '<p class="fine down">حداقل یک ارز برای تست انتخاب کنید.</p>'; return; }
      out.innerHTML = `<p class="fine"><span class="spinner"></span> در حال بازپخش این تنظیمات روی ۱,۰۰۰ کندل اخیر ${syms.length} ارز در تایم‌فریم ${esc(next.interval)}…</p>`;
      const by = {};
      await pool(syms, 4, async (sym) => {
        const coin = all.find((c) => c.symbol === sym);
        if (!coin) return;
        try { const r = await getCandles(coin, next.interval, 1000); if (r.source !== 'demo' && r.source !== 'coingecko' && !r.lowRes) by[sym] = r.candles.slice(0, -1); } catch { /* رد شد */ }
      });
      if (!m.el.isConnected) return;
      const rules = rulesForChart({ ...next, excluded: [] }, next.interval, load(LESSONS_KEY, []));
      const res = backtestSettings({ ...rules, perCoin: next.strategy !== 'custom' && !next.ownRulesOff && next.interval === PER_COIN_RULES.interval ? PER_COIN_RULES.rules : null }, by);
      if (!res.coins) { out.innerHTML = '<p class="fine down">هیچ‌یک از این ارزها کندل صرافی کافی در این نمودار برای تست نداشتند.</p>'; return; }
      const sign = (v) => pct(v, 2);
      out.innerHTML = `<div class="card" style="padding:12px"><b>عملکرد این تنظیمات روی کندل‌های اخیر</b>
        <p class="fine" style="margin:6px 0 0">${res.coins} ارز، از ${esc(new Date(res.from).toISOString().slice(0, 10))} تا ${esc(new Date(res.to).toISOString().slice(0, 10))}، با احتساب کارمزد: <b class="${res.ret >= 0 ? 'up' : 'down'}">${sign(res.ret)}</b> در برابر <b>${sign(res.hold)}</b> برای نگهداری ساده همان ارزها. ${res.trades} معامله بسته‌شده${res.trades ? `، ${res.winRate}% برد` : ''}، بیشترین افت ${res.dd}%، و ${res.open} معامله همچنان باز. ${Object.keys(by).length < syms.length ? `${syms.length - Object.keys(by).length} ارز کندل صرافی نداشتند و کنار گذاشته شدند.` : ''}</p>
        <p class="fine" style="margin:6px 0 0">این نگاهی به گذشته است نه تضمین آینده. ${next.strategy === 'custom' ? 'قوانینی که تا حد خوب به نظر رسیدن روی گذشته تنظیم شوند، معمولاً در بازار زنده ضعیف‌تر عمل می‌کنند.' : 'قوانین تست‌شده بر اساس تاریخچه‌ای شامل همین کندل‌ها انتخاب شده‌اند، بنابراین در اینجا بهتر از اجرای زنده به نظر می‌رسند؛ نتیجه تست گام‌به‌گام معیار واقعی‌تری است.'}</p></div>`;
    });
    refresh();

    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const next = read();
      if (!next.universe.length) { toast('حداقل یک ارز انتخاب کنید.', 'down'); return; }
      const dropped = next.universe.slice(MAX_COINS);
      next.universe = next.universe.slice(0, MAX_COINS);
      const before = { ...cfg };
      const unbench = f.unbench?.checked;
      Object.assign(cfg, next, unbench ? { excluded: [] } : {});
      save(CFG_KEY, cfg);
      const changes = [];
      if (before.interval !== cfg.interval) changes.push(`نمودار ${before.interval} ← ${cfg.interval}`);
      if (before.startingBalance !== cfg.startingBalance) changes.push(`موجودی اولیه ${money(before.startingBalance)} ← ${money(cfg.startingBalance)}`);
      if ((before.strategy || 'tested') !== cfg.strategy) changes.push(cfg.strategy === 'custom' ? 'تغییر به قوانین شخصی' : 'تغییر به قوانین تست‌شده');
      else if (cfg.strategy === 'custom' && JSON.stringify(before.custom) !== JSON.stringify(cfg.custom)) changes.push('تغییر قوانین شخصی');
      if (before.riskPct !== cfg.riskPct) changes.push(`ریسک ${before.riskPct}% ← ${cfg.riskPct}% در هر معامله`);
      if (before.maxPositions !== cfg.maxPositions) changes.push(`حداکثر معاملات باز ${before.maxPositions} ← ${cfg.maxPositions}`);
      if (before.maxPositionPct !== cfg.maxPositionPct) changes.push(`حداکثر در یک ارز ${before.maxPositionPct}% ← ${cfg.maxPositionPct}%`);
      if (before.feePct !== cfg.feePct) changes.push(`کارمزد ${before.feePct}% ← ${cfg.feePct}%`);
      if (!!before.ownRulesOff !== !!cfg.ownRulesOff) changes.push(cfg.ownRulesOff ? 'قوانین روزانه اختصاصی ارزها خاموش شد' : 'قوانین روزانه اختصاصی ارزها روشن شد');
      const added = cfg.universe.filter((s) => !before.universe.includes(s)), removed = before.universe.filter((s) => !cfg.universe.includes(s));
      if (added.length) changes.push(`افزوده شد: ${added.join('، ')}`);
      if (removed.length) changes.push(`حذف شد: ${removed.join('، ')}`);
      if (unbench) changes.push('اجازه معامله مجدد به ارزهای تعلیق‌شده');
      m.close();
      const hasTrades = state && (Object.keys(state.open || {}).length || (state.closed || []).length);
      const chartChanged = state && state.interval !== cfg.interval;
      let msg = 'تنظیمات ذخیره شد.';
      if (state && hasTrades && chartChanged && f.switchNow?.checked) {
        const running = resetAccount();
        msg = `تنظیمات ذخیره شد. حساب جدیدی روی ${cfg.interval} با موجودی ${money(cfg.startingBalance)} آغاز شد${running ? '؛ هوش مصنوعی به کار خود ادامه می‌دهد' : ''}.`;
      } else if (state && !hasTrades && (chartChanged || state.startingBalance !== cfg.startingBalance)) {
        state = state.interval === cfg.interval
          ? { ...state, balance: cfg.startingBalance, startingBalance: cfg.startingBalance, equityCurve: [] }
          : { ...newState(cfg, { liveFrom: state.liveFrom }), log: state.log || [] };
        msg = `تنظیمات ذخیره شد. حساب هوش مصنوعی اکنون با ${money(cfg.startingBalance)} روی ${cfg.interval} شروع می‌شود.`;
      } else if (state) {
        if (state.startingBalance !== cfg.startingBalance) {
          state = rescaleAccount(state, cfg.startingBalance);
          msg = `تنظیمات ذخیره شد. حساب هوش مصنوعی اکنون بر مبنای ${money(cfg.startingBalance)} محاسبه می‌شود: موجودی و تمام معاملات بر اساس آن مقیاس‌بندی شدند تا درصد نتایج تغییر نکند.`;
        }
        if (chartChanged) msg += ` این حساب تا زمان زدن دکمه بازنشانی به معامله در ${state.interval} ادامه می‌دهد و پس از آن روی ${cfg.interval} شروع خواهد شد.`;
      }
      if (cfg.startingBalance === 100 && before.startingBalance !== 100 && +f.startingBalance.value / fx.rate < 100) msg += ` موجودی اولیه نمی‌تواند کمتر از ${money(100)} باشد.`;
      if (dropped.length) msg += ` حداکثر ${MAX_COINS} ارز قابل معامله است، بنابراین ${dropped.join('، ')} کنار گذاشته شدند.`;
      if (state && changes.length) { logCheck(state, { kind: 'settings', text: changes.join(' · ') }); save(STATE_KEY, state); }
      toast(msg, dropped.length ? 'info' : 'up');
      draw();
      if (state && autoOn) catchUp();
    });
  });

  $('#resetBtn', el)?.addEventListener('click', () => {
    const m = modal(`<h3>بازنشانی حساب هوش مصنوعی؟</h3><p>این کار موجودی شبیه‌سازی‌شده و کل تاریخچه معاملات را پاک می‌کند و از نو با ${money(cfg.startingBalance)} روی تایم‌فریم ${cfg.interval} شروع می‌کند. ${autoOn ? 'هوش مصنوعی به کار خود ادامه می‌دهد' : 'هوش مصنوعی تا زمان شروع مجدد متوقف می‌ماند'} و از این لحظه به بعد فقط کندل‌هایی را معامله می‌کند که پس از بازنشانی باز شوند — هیچ داده‌ای از گذشته بازپخش نخواهد شد. این عمل قابل بازگشت نیست.</p>
      <div class="row mt" style="gap:8px"><button class="btn" id="no">نگه دار</button><button class="btn primary" id="yes">بازنشانی</button></div>`);
    $('#no', m.el).addEventListener('click', m.close);
    $('#yes', m.el).addEventListener('click', () => {
      const wasRunning = resetAccount();
      m.close(); draw();
      toast(wasRunning ? `حساب به ${money(cfg.startingBalance)} بازنشانی شد. هوش مصنوعی همچنان فعال است و کندل‌های جدید ${cfg.interval} را معامله می‌کند.` : `حساب به ${money(cfg.startingBalance)} بازنشانی شد. هر زمان مایل بودید دکمه شروع معامله‌گر را بزنید.`, 'info');
      if (wasRunning) catchUp();
    });
  });

  function syncRunButtons() {
    const stopB = $('#stopBtn', el);
    const startB = $('#startBtn', el);
    if (stopB) stopB.hidden = !(state && autoOn);
    const resetB = $('#resetBtn', el);
    if (resetB) resetB.hidden = !state;
    if (startB) {
      startB.innerHTML = !state ? `${icon('bolt', 16)} شروع معامله‌گر`
        : autoOn ? `${icon('refresh', 16)} همگام‌سازی فوری`
        : `${icon('bolt', 16)} ${session.status === 'stopped' ? 'ادامه هوش مصنوعی' : 'شروع معامله‌گر'}`;
    }
  }

  $('#stopBtn', el)?.addEventListener('click', () => {
    applySession('STOP');
    draw();
    const openCount = Object.keys(state?.open || {}).length;
    toast(openCount ? `هوش مصنوعی متوقف شد. ${openCount} موقعیت باز همچنان باز می‌ماند — آن‌ها را از جدول ببندید یا ربات را ادامه دهید.` : 'هوش مصنوعی متوقف شد و معامله جدیدی باز نخواهد کرد.', 'info');
  });

  $('#startBtn', el).addEventListener('click', () => {
    applySession('START');
    catchUp();
  });

  const onTick = (e) => {
    const wanted = new Set([
      ...Object.keys(state?.open || {}),
      ...Object.keys(myState()?.open || {}),
      ...Object.keys(realState()?.open || {}),
    ]);
    let changed = false;
    for (const t of e.detail) {
      const sym = t.s.replace(/USDT$/, '');
      if (wanted.has(sym)) { st.prices[sym] = +t.c; st.priceFrom[sym] = 'live'; changed = true; }
    }
    if (changed && !st.paintQueued) {
      st.paintQueued = true;
      setTimeout(() => { st.paintQueued = false; if (!st.disposed) draw(); }, 4000);
    }
  };
  window.addEventListener('cv:tickers', onTick);

  const wireSyncNote = () => $('#syncSignIn', el)?.addEventListener('click', (e) => { e.preventDefault(); openAuth(); });
  const onAuth = () => { const n = $('#syncNote', el); if (n) { n.innerHTML = syncNote(); wireSyncNote(); } };
  auth.addEventListener('change', onAuth);
  wireSyncNote();
  const timer = setInterval(() => { if (!st.disposed && state && autoOn) catchUp(); }, 5 * 60e3);

  const venueTimer = setInterval(async () => {
    if (st.disposed || document.hidden) return;
    const held = [...new Set([...Object.keys(state?.open || {}), ...Object.keys(myState()?.open || {}), ...Object.keys(realState()?.open || {})])]
      .filter((sym) => st.priceFrom[sym] !== 'live');
    let moved = 0;
    for (const sym of held) {
      if (st.disposed) return;
      const before = st.prices[sym];
      const px = await fetchPrice(sym);
      if (px !== null && px !== before) moved++;
    }
    if (moved && !st.disposed) draw();
  }, 20e3);

  draw();
  syncRunButtons();
  syncSessionChip();

  (async () => {
    const need = [...new Set([...Object.keys(myState()?.open || {}), ...Object.keys(realState()?.open || {})])].filter((sym) => !Number.isFinite(st.prices[sym]));
    let got = 0;
    for (const sym of need) { if (st.disposed) return; if ((await fetchPrice(sym)) !== null) got++; }
    if (got && !st.disposed) draw();
  })();

  const onStorage = (e) => {
    if (st.disposed || !e.key) return;
    if (e.key === `cv:${CFG_KEY}`) {
      const saved = load(CFG_KEY, {}) || {};
      Object.assign(cfg, { ...DEFAULT_CONFIG, ...Object.fromEntries(Object.entries(saved).filter(([k]) => USER_KEYS.includes(k) || (saved.v === 2 && LEARNED_KEYS.includes(k)))), v: 2 });
      cfg.riskPct = Math.min(5, Math.max(0.1, +cfg.riskPct || DEFAULT_CONFIG.riskPct));
      draw();
    } else if (e.key === `cv:${STATE_KEY}` && !st.running) {
      state = load(STATE_KEY, null);
      draw();
    }
  };
  window.addEventListener('storage', onStorage);

  if (state && autoOn) catchUp();
  else if (!state && session.status === 'idle' && !load(AUTO_KEY, false)) {
    save(AUTO_KEY, true);
    applySession('START');
    catchUp();
  }
  void compact; void amount; void bindSeg; void LEARN_KEY;

  return () => {
    st.disposed = true;
    clearInterval(timer);
    clearInterval(venueTimer);
    window.removeEventListener('cv:tickers', onTick);
    window.removeEventListener('storage', onStorage);
    auth.removeEventListener('change', onAuth);
    st.charts.forEach((c) => c.destroy());
  };
}