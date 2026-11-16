// The automatic AI trader, running on simulated money.
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

// Runs fn over items, at most n at a time.
async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => { while (queue.length) await fn(queue.shift()); }));
}

export const title = 'معامله‌گری';

const CFG_KEY = 'traderCfg';
const STATE_KEY = 'traderState';
const RUN_KEY = 'traderRunning';
const SESSION_KEY = 'aiSession';
const AUTO_KEY = 'traderAutoStarted';
const LESSONS_KEY = 'traderLessons';   // the self-review's changelog
const AUTOLEARN_KEY = 'traderAutoLearn';

export async function render(el) {
  const st = { disposed: false, charts: [], prices: {}, priceFrom: {}, running: false, noExchange: [] };
  const candlesFor = candleCache(getCandles, { window: 500, stepOf: (iv) => INTERVAL_MS[iv] });
  const BACKFILL_MAX = 6000;
  const NODATA_KEY = 'traderNoData';
  let session = load(SESSION_KEY, null);
  if (!session || !['idle', 'running', 'stopped'].includes(session.status)) {
    const hasState = !!load(STATE_KEY, null);
    session = initialSession(hasState && load(RUN_KEY, false) === true ? 'running' : hasState ? 'stopped' : 'idle');
    save(SESSION_KEY, session);
  }
  let autoOn = session.status === 'running';
  const cfg = configFrom(load(CFG_KEY, {}));
  let state = load(STATE_KEY, null);
  const ownRulesOn = () => ownRulesFor(cfg, state);
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
    const cls = `session-chip ${session.status}`, html = `<i></i>${sessionLabel(session.status)}`;
    if (chip.className !== cls) chip.className = cls;
    if (chip.innerHTML !== html) chip.innerHTML = html;
  }

  const all = await markets().catch(() => []);
  const priceOf = (sym) => {
    if (Number.isFinite(st.prices[sym])) return st.prices[sym];
    const c = all.find((x) => x.symbol === sym && x.source !== 'demo');
    return Number.isFinite(c?.price) && c.price > 0 ? c.price : null;
  };
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
  const marks = () => {
    const m = {};
    for (const c of all) if (c.source !== 'demo' && Number.isFinite(c.price)) m[c.symbol] = c.price;
    return { ...m, ...st.prices };
  };
  const tradable = all.filter((c) => !isStable(c.symbol)).slice(0, 60);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>معامله‌گری</h1>
        <p>سه حساب در کنار هم: معاملات آزمایشی که خودتان انجام می‌دهید، معاملاتی که واقعی انجام داده‌اید، و هوش مصنوعی که استراتژی را به طور خودکار اجرا می‌کند. فقط حساب واقعی با پول واقعی سر و کار دارد — بی‌تی‌سی هرگز سفارشی ثبت نمی‌کند و کلیدی نگهداری نمی‌کند.</p>
        <div class="callout warn mt" role="note"><b>${icon('info', 14)} شبیه‌سازی، نه تضمین سود</b><p>حساب‌های آزمایشی و هوش مصنوعی با پول شبیه‌سازی‌شده روی قیمت‌های زنده معامله می‌کنند. سفارش‌ها با قیمت کندل و کارمزد مدل‌سازی‌شده پر می‌شوند؛ سفارش‌های واقعی همچنین مشمول اسپیرید (Spread) و لغزش قیمت (Slippage) هستند، ممکن است به صورت جزئی یا اصلا پر نشوند، و صرافی‌ها ممکن است در میانه‌ی روند قطع شوند. در تست‌های رو به جلو (Walk-forward), قوانین در برخی دوره‌ها ضرر کرده‌اند و گاهی هولد کردن ساده عملکرد بهتری داشته است؛ ارقام زیر هر دو حالت را با بیشترین افت نمایش می‌دهند. نتایج اینجا را به عنوان مدرکی درباره قوانین در نظر بگیرید، نه بازدهی تضمین‌شده. پیشنهاد مالی محسوب نمی‌شود. <a class="acc" href="#/learn">نحوه تست قوانین ←</a></p></div>
        <details class="mt"><summary class="fine" style="cursor:pointer">معنای هر حساب و استراتژی</summary>
          <dl class="defs">
            <dt>حساب آزمایشی (Demo)</dt><dd>پول شبیه‌سازی‌شده برای معامله دستی و تمرین بدون ریسک. کارمزدها مدل‌سازی شده‌اند؛ لغزش قیمت خیر.</dd>
            <dt>حساب هوش مصنوعی (AI)</dt><dd>پول شبیه‌سازی‌شده که به طور خودکار بر اساس تنظیمات انتخابی شما در تنظیمات، روی قیمت‌های زنده در مرورگر شما و (هنگام ورود به حساب) در ابری معامله می‌کند.</dd>
            <dt>حساب واقعی (Real)</dt><dd>سابقه معاملاتی که خودتان در یک صرافی ثبت کرده‌اید (دستی یا از طریق فایل). اپلیکیشن هرگز آن‌ها را ثبت نمی‌کند.</dd>
            <dt>استراتژی پیش‌فرض تست‌شده</dt><dd>قوانین هر چارت که با در نظر گرفتن کارمزدها در تست‌های رو به جلو بررسی شده‌اند. نتیجه اندازه‌گیری‌شده آن‌ها (خوب یا بد) در کنار حساب نمایش داده می‌شود.</dd>
            <dt>استراتژی سفارشی</dt><dd>تنظیمات شخصی شما. این تنظیمات بخشی از تست رو به جلو نبوده‌اند، بنابراین ارقام تست‌شده درباره آن‌ها صدق نمی‌کنند؛ گزینه «تست این تنظیمات» نگاهی به گذشته دارد که معمولاً روی تاریخچه قبلی بهتر به نظر می‌رسد.</dd>
          </dl></details>
        <p class="fine" id="syncNote">${syncNote()}</p></div>
      <div class="row">
        <span class="session-chip ${session.status}" id="sessionChip"><i></i>${sessionLabel(session.status)}</span>
        <button class="btn" id="cfgBtn">${icon('chip', 16)} تنظیمات</button>
        <button class="btn ghost" id="resetBtn"${state ? '' : ' hidden'}>بازنشانی</button>
        <button class="btn ghost" id="stopBtn" hidden>${icon('close', 16)} توقف هوش مصنوعی</button>
        <button class="btn primary" id="startBtn">${state ? icon('refresh', 16) + ' به‌روزرسانی' : icon('bolt', 16) + ' شروع ترید بات'}</button>
      </div>
    </div>
    <div id="body">${state ? skeleton(6, 26) : startCard()}</div>`;

  function verdictCard() {
    const iv = state?.interval || cfg.interval;
    const w = CHART_TESTED[iv];
    const TFS = ['15m', '1h', '4h', '1d'];
    if (!w) {
      return `<div class="card" style="border-color:var(--warn)">
      <div class="card-h"><h3>${icon('info', 16)} روی تایم‌فریم ${esc(iv)} تست نشده است</h3></div>
      <p class="fine">این استراتژی روی تایم‌فریم‌های ${TFS.join(', ')} ارزیابی شده است. روی ${esc(iv)} این بات ${cfg.strategy === 'custom' ? 'قوانین شخصی شما' : 'قوانین استاندارد'} را بدون نتیجه اندازه‌گیری‌شده مشخص معامله می‌کند؛ گزینه «تست این تنظیمات» در بخش تنظیمات عملکرد آن‌ها را روی کندل‌های اخیر نشان می‌دهد. قوانین فعال: ${esc(rulesText(effective(iv)))}</p>
    </div>`;
    }
    const sign = (v) => pct(v, 2);
    const traded = (x) => (x.adopt ? x.own : x.standard);
    const pickVerdict = (x) => (x.cleared ? `در این دوره عملکرد بهتری داشت اما در دوره قبل نه (${esc(x.previous?.measuredOn || '')})، و قوانین فقط زمانی تغییر می‌کنند که دو دوره متوالی توافق داشته باشند` : `عملکرد بهتری نداشت${x.previous?.cleared ? ` (در دوره قبل چنین بود، تاریخ ${esc(x.previous?.measuredOn)})` : ''}`);
    const r = traded(w);
    const e = effective(iv);
    return `<div class="card" style="border-color:var(--warn)">
      <div class="card-h"><h3>${icon('info', 16)} عملکرد واقعی این استراتژی در تست‌ها</h3><span class="fine">اندازه‌گیری‌شده در ${esc(CHART_TESTED.measuredOn)}، نه تخمینی</span></div>
      <p>بررسی کندل به کندل روی ${w.coins ?? CHART_TESTED.coins} ارز در یک حساب، با احتساب کارمزدها، در ${CHART_TESTED.blocks} دوره پشت سر هم حدود ${esc(w.block)} (${esc(w.from)} → ${esc(w.to)}). ${w.adopt ? `پیش از هر دوره، قوانین از میان ${CHART_TESTED.configs} مجموعه قانون روی تاریخچه قبلی انتخاب شده و روی دوره‌ای که هرگز ندیده بودند اجرا شدند.` : `قوانین استاندارد در هر سه دوره اجرا شدند؛ در کنار آن‌ها، انتخاب از میان ${CHART_TESTED.configs} مجموعه قانون روی تاریخچه پیش از هر دوره نیز تست شد و ${pickVerdict(w)}.`} ${cfg.strategy === 'custom' ? `<b>شما در حال معامله با قوانین شخصی خود هستید که بخشی از این تست نبوده‌اند</b>، بنابراین این آمار درباره آن‌ها صدق نمی‌کند؛ برای نگاهی به گذشته از «تست این تنظیمات» در تنظیمات استفاده کنید. برای مقایسه، قوانین تست‌شده برای ${esc(iv)} به طور میانگین <b class="${r.ret >= 0 ? 'up' : 'down'}">${sign(r.ret)}</b> در هر دوره بازدهی داشتند در حالی که هولد کردن همان ارزها <b class="${w.hold >= 0 ? 'up' : 'down'}">${sign(w.hold)}</b> بود.` : `روی ${esc(iv)} قوانینی که معامله می‌شوند به طور میانگین <b class="${r.ret >= 0 ? 'up' : 'down'}">${sign(r.ret)}</b> در هر دوره با میانگین بدترین افت ${r.dd}% بازدهی داشتند، در حالی که هولد کردن همان ارزها به طور میانگین <b class="${w.hold >= 0 ? 'up' : 'down'}">${sign(w.hold)}</b> با بدترین افت ${w.holdDrop}% بود. ${r.ret > w.hold ? 'روی این تایم‌فریم عملکرد بهتری نسبت به هولد کردن طی سه دوره داشته است؛ این یک مدرک است، نه تضمین.' : 'روی این تایم‌فریم هولد کردن سود بیشتری داشته است.'}${w.previous && !w.adopt && Math.abs(w.previous.ret - r.ret) >= 2 ? ` نتیجه در تاریخ ${esc(w.previous.measuredOn)} روی کندل‌های تقریباً مشابه ${sign(w.previous.ret)} در هر دوره بود: نتایج هر تست را به عنوان تقریب در نظر بگیرید.` : ''}${r.dd < w.holdDrop - 5 ? (r.ret > w.hold ? ' همچنین افت بسیار کمتری داشت.' : ' اما افت بسیار کمتری داشت.') : ''} بدترین افت شامل معاملات باز در بسته شدن هر کندل است.${w.fillCost ? ` این تست هر سفارش را با قیمت کندل پر می‌کند؛ با احتساب 0.05% لغزش و اسپرید در هر طرف، حدود ${w.fillCost} واحد کمتر در هر دوره سود کرده است.` : ''}`}</p>
      <div class="tbl-wrap mt"><table class="tbl fit"><thead><tr><th class="l">تایم‌فریم</th><th class="hide-p">دوره تست</th><th class="hide-p">قوانین</th><th>نتیجه هر دوره</th><th>بدترین افت</th><th class="hide-p">قوانین استاندارد</th><th>هولد کردن</th><th class="hide-p">بدترین افت هولد</th><th class="hide-p">معاملات</th></tr></thead><tbody>
        ${TFS.map((k) => { const x = CHART_TESTED[k], t = traded(x); return `<tr${k === iv ? ' style="font-weight:600"' : ''}><td class="l">${k}</td><td class="fine wrap hide-p" style="min-width:96px">${esc(x.from)} → ${esc(x.to)}</td><td class="fine hide-p">${x.adopt ? 'شخصی' : 'استاندارد'}</td><td class="${t.ret >= 0 ? 'up' : 'down'}">${sign(t.ret)}</td><td class="down">−${t.dd}%</td><td class="hide-p ${x.standard.ret >= 0 ? 'up' : 'down'}">${sign(x.standard.ret)}</td><td class="${x.hold >= 0 ? 'up' : 'down'}">${sign(x.hold)}</td><td class="down hide-p">−${x.holdDrop}%</td><td class="hide-p">${t.trades}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="fine mt">قوانین فعال روی ${esc(iv)}: ${esc(rulesText(e))} ${cfg.strategy === 'custom' ? 'اینها قوانین شخصی شما هستند که در تنظیمات تعیین شده‌اند.' : w.adopt ? `این انتخاب خود تایم‌فریم است: در تست، انتخاب قوانین برای این تایم‌فریم بهتر از قوانین استاندارد عمل کرد (در ${w.better} از ${CHART_TESTED.blocks} دوره با ${sign(w.own.ret)} در برابر ${sign(w.standard.ret)} و افت ${w.own.dd}% در برابر ${w.standard.dd}%)، بنابراین مجدداً روی کل تاریخچه اعمال می‌شود.` : `انتخاب تایم‌فریم ${w.cleared ? `در این دوره قوانین استاندارد را شکست داد (در ${w.better} از ${CHART_TESTED.blocks} دوره با ${sign(w.own.ret)} در برابر ${sign(w.standard.ret)}) اما در دوره قبل نه، بنابراین تا زمان توافق در دو دوره متوالی حفظ می‌شود` : `عملکرد بهتری نسبت به قوانین استاندارد نداشت (در ${w.better} از ${CHART_TESTED.blocks} دوره${w.previous?.cleared ? `; در دوره قبل در تاریخ ${esc(w.previous.measuredOn)} چنین بود` : ''})، بنابراین تغییر نمی‌کند.`}`} کارمزدها ${r.fees}% از موجودی هر دوره را تشکیل دادند و ${r.win}% از معاملات برنده شدند.${iv === '15m' ? ' بازه ۱۵ دقیقه‌ای تنها ده روز است، بنابراین اعداد بسیار نوسان دارند.' : ''}${ownRulesText()}${ownRulesOn() ? ` تست‌شده روی ${PER_COIN_RULES.coins} ارز در فاصله ${esc(PER_COIN_RULES.tested.from)} تا ${esc(PER_COIN_RULES.tested.to)}، با انتخاب قوانین روی سال‌های پیشین: ${sign(PER_COIN_RULES.tested.own.ret)} با بدترین افت ${PER_COIN_RULES.tested.own.dd}%، در برابر ${sign(PER_COIN_RULES.tested.standard.ret)} و ${PER_COIN_RULES.tested.standard.dd}% برای قوانین روزانه تنها، و ${sign(PER_COIN_RULES.tested.hold)} برای هولد کردن ارزها (بدترین افت ${PER_COIN_RULES.tested.holdDrop}%).${PER_COIN_RULES.tested.previousRun ? ` در تست قبلی روی ${PER_COIN_RULES.tested.previousRun.coins} ارز، نتیجه ${sign(PER_COIN_RULES.tested.previousRun.own)} در برابر ${sign(PER_COIN_RULES.tested.previousRun.standard)} بود: نتایج بلندمدت به ارزها بستگی دارند.` : ''} می‌توانید این قابلیت را در تنظیمات خاموش کنید.` : ''}</p>
      ${ownRulesOn() ? coinRulesTable(e) : ''}
      <p class="fine">${w.coins ?? CHART_TESTED.coins} ارز برتر امروز: ارزهایی که سقوط کرده یا دلست شده‌اند در تست حضور ندارند، که باعث بهتر نشان دادن نتایج (حتی هولد کردن) می‌شود.</p>
      <p class="fine">بنابراین این حساب نمایش یک استراتژی است که روی قیمت‌های زنده و با احتساب کارمزدها اجرا می‌شود. این یک تضمین سود نیست و هیچ سفارش واقعی ثبت نمی‌کند.</p>
    </div>`;
  }

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
    const when = rows.map((r) => `${r.chart} ${r.from.slice(0, 7)} → ${r.to.slice(0, 7)}`).join(', ');
    return `<div class="card mt" id="earnCard">
      <div class="card-h"><h3>${icon('chart', 16)} پتانسیل درآمدی: ساعتی، روزانه، هفتگی و ماهانه</h3><span class="fine">با ریسک ${rows[0].risk}% در هر معامله، با سرمایه ${money(bal)}</span></div>
      <div class="tbl-wrap hide-p"><table class="tbl fine fit"><thead><tr><th class="l">تایم‌فریم</th><th>ساعتی</th><th>روزانه</th><th>هفتگی</th><th>ماهانه</th><th class="hide-p">بدترین دوره تست</th><th class="hide-t">هولد کردن (ماهانه)</th><th class="hide-t">معاملات ماهانه</th></tr></thead><tbody>
        ${rows.map((r) => { const tags = [r.chart === iv ? 'فعلی' : '', top && r.chart === top.iv ? 'پیشنهادی' : ''].filter(Boolean); return `<tr${r.chart === iv ? ' style="font-weight:600"' : ''}><td class="l"><b>${esc(r.chart)}</b>${tags.length ? `<small>${tags.join(' · ')}</small>` : ''}</td>
          <td>${cell(r.per.hour)}</td><td>${cell(r.per.day)}</td><td>${cell(r.per.week)}</td><td>${cell(r.per.month)}</td>
          <td class="hide-p ${r.worst >= 0 ? 'up' : 'down'}">${pct(r.worst, 2)}<small>در ${esc(r.block)}</small></td>
          <td class="hide-t ${r.holdPer.month >= 0 ? 'up' : 'down'}">${pct(r.holdPer.month, 2)}</td><td class="hide-t">${r.tradesPerMonth}</td></tr>`; }).join('')}
        ${live ? `<tr><td class="l"><b>حساب شما تا کنون</b><br><small>${live.early ? `${live.hours} ساعت ترید` : `${Math.round(live.days)} روز زنده`}</small></td>${live.early ? '<td colspan="7" class="l muted">بسیار زود است: کمتر از یک روز قابل ارزیابی نیست</td>' : `<td>${cell(live.hour)}</td><td>${cell(live.day)}</td><td>${live.week === null ? notYet(7) : cell(live.week)}</td><td>${live.month === null ? notYet(30) : cell(live.month)}</td><td class="l muted hide-p">سابقه شخصی</td><td colspan="2" class="hide-t"></td>`}</tr>` : ''}
      </tbody></table></div>
      <div class="tbl-wrap show-pb"><table class="tbl fine fit"><thead><tr><th>ساعتی</th><th>روزانه</th><th>هفتگی</th><th>ماهانه</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><th colspan="4" class="l">${esc(r.chart)}${r.chart === iv ? ' · فعلی' : ''}${top && r.chart === top.iv ? ' · پیشنهادی' : ''} <span class="muted">· بدترین دوره تست ${pct(r.worst, 2)} در ${esc(r.block)}</span></th></tr>
          <tr><td>${cellP(r.per.hour)}</td><td>${cellP(r.per.day)}</td><td>${cellP(r.per.week)}</td><td>${cellP(r.per.month)}</td></tr>`).join('')}
        ${live && !live.early ? `<tr><th colspan="4" class="l">حساب شما · ${Math.round(live.days)} روز</th></tr><tr><td>${cellP(live.hour)}</td><td>${cellP(live.day)}</td><td>${live.week === null ? notYet(7) : cellP(live.week)}</td><td>${live.month === null ? notYet(30) : cellP(live.month)}</td></tr>` : ''}
      </tbody></table></div>
      <p class="fine mt">میانگین هر تایم‌فریم در تمام دوره‌های تست با ${esc(rows.every((r) => r.rules === rows[0].rules) ? rows[0].rules : 'قوانین تست‌شده')}، پس از کسر کارمزدها و لغزش (0.05% در هر طرف).<span class="show-t"> هولد کردن و تعداد معاملات در صفحه بزرگ‌تر نمایش داده می‌شوند.</span> نتایج واقعی ناهمگون هستند: بیشتر ساعات و روزها معامله‌ای ندارند. در صورت تمایل، تایم‌فریم ${top ? esc(top.iv) : 'پیشنهادی'} بازدهی بالاتری داشته است. انتظاری از گذشته، نه تضمین.</p>
      <p class="fine">هولد کردن ساده در این دوره‌های صعودی بازدهی بیشتری داشت. مزیت هوش مصنوعی افت کمتر و ماندن در وجه نقد هنگام عدم وجود سیگنال است.</p>
    </div>`;
  }

  function coinRulesTable(base) {
    const buys = (r) => `${r.entryMode === 'breakout' ? 'شکست سقف ۲۰ کندلی' : r.entryMode === 'pullback' ? `پولبک در روند صعودی (RSI ${PULLBACK_RSI} یا کمتر)` : `امتیاز +${r.entryScore} یا بیشتر`}${r.momentumConfirm ? '، تایید مومنتوم' : ''}${r.trendFilter && r.entryMode !== 'pullback' ? '، در روند صعودی' : ''}`;
    const sells = (r) => `${r.trailAtr ? `حد ضرر متحرک ${r.trailAtr} ATR` : `تارگت ${r.rMultiple}R`}${r.signalExitBars ? `، یا ${r.signalExitBars} کندل بازگشتی` : ''}`;
    const rows = cfg.universe.map((sym) => {
      const own = PER_COIN_RULES.rules[sym];
      const r = own ? { ...base, ...own } : base;
      return `<tr><td class="l"><b>${esc(sym)}</b>${own ? '' : ' <small class="fine">قوانین روزانه</small>'}</td><td class="l fine wrap">${esc(buys(r))}</td><td>${r.atrStop} ATR</td><td class="l fine wrap">${esc(sells(r))}</td></tr>`;
    }).join('');
    const n = cfg.universe.filter((sym) => PER_COIN_RULES.rules[sym]).length;
    return `<details class="mt"><summary class="fine" style="cursor:pointer">قوانین اختصاصی هر ارز (${n} از ${cfg.universe.length} ارز)</summary>
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th class="l">ارز</th><th class="l">شرایط خرید</th><th>حد ضرر</th><th class="l">شرایط فروش</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="fine">انتخاب‌شده بر اساس تاریخچه روزانه هر ارز. ارزهای فاقد قانون اختصاصی از قوانین روزانه پیش‌فرض استفاده می‌کنند.</p>
    </details>`;
  }

  function learningCard() {
    const ledger = loadLedger();
    const ls = learningStatus(ledger);
    const spark = accuracySparkline(ledger, 50);
    const trendText = {
      'improving': 'بازه اخیر بالاتر از بازه قبلی',
      'stable': 'ثابت و پایدار',
      'declining': 'بازه اخیر پایین‌تر از بازه قبلی',
      'warming-up': 'نیاز به حداقل ۱۰ پیش‌بینی قطعی شده',
      'unknown': 'پیش‌بینی قطعی‌شده کافی نیست',
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
      <p class="fine">هر پیش‌بینی پیش از مشخص شدن نتیجه ثبت و سپس ارزیابی می‌شود. هنگام ورود به حساب، این سابقه در ابر ذخیره می‌شود. ثبت امتیاز به معنای بهتر شدن پیش‌بینی‌ها نیست؛ دقت نزدیک به ۵۰٪ تصادفی است.</p>
      <div class="grid g4 mt">
        <div class="stat"><span class="k">۲۰ تای اخیر</span><span class="v">${win(20)}</span></div>
        <div class="stat"><span class="k">۵۰ تای اخیر</span><span class="v">${win(50)}</span></div>
        <div class="stat"><span class="k">۱۰۰ تای اخیر</span><span class="v">${win(100)}</span></div>
        <div class="stat"><span class="k">مقایسه ۲۰ و ۵۰</span><span class="v ${trendCls}" style="font-size:16px">${esc(TREND_WORDS[ls.trend] || ls.trend)}</span><span class="s fine">${esc(trendText)}</span></div>
      </div>
      ${spark.length > 1 ? `<div class="mt"><div class="fine" style="margin-bottom:4px">دقت در ${spark.length} پیش‌بینی اخیر (محاسبه روی ۲۰ مورد)</div>${sparklineSvg(spark, { width: 240, height: 36, color: 'var(--accent)' })}</div>` : ''}
      <p class="fine mt">نسخه مدل v${ls.modelVersion} · ${ls.total} پیش‌بینی ثبت‌شده · ${ls.resolved} قطعی‌شده · ${ls.pending} در انتظار رسیدن موعد.</p>
    </div>`;
  }

  function syncNote() {
    if (auth.user) {
      const cloud = [...(state?.log || [])].reverse().find((e) => e.kind === 'check' && e.by === 'cloud');
      return `ذخیره شده در حساب شما: در هر دستگاهی که وارد شوید این معاملات را می‌بینید. در حالی که هوش مصنوعی فعال است، ابری معاملات را با بسته بودن صفحه انجام می‌دهد${cloud ? ` (آخرین بررسی ابری ${ago(cloud.t)})` : ''}.`;
    }
    if (backendEnabled()) return 'فقط در همین مرورگر ذخیره شده و فقط هنگام باز بودن صفحه معامله می‌کند. <a href="#" id="syncSignIn">وارد شوید</a> تا در ابر و با بسته بودن صفحه نیز معامله کند.';
    return 'فقط در همین مرورگر ذخیره شده است.';
  }

  function backupCard() {
    const b = auth.user ? backupFor(load, auth.user.id) : null;
    if (!b) return '';
    const NAMES = { myDemoState: 'حساب آزمایشی شما', realTradeState: 'حساب واقعی شما' };
    const parts = Object.entries(b.keys).map(([k, v]) => [k, missingTrades(v, load(k, null)).length]).filter(([, n]) => n)
      .map(([k, n]) => `${n} معامله در ${NAMES[k]}`);
    if (!parts.length) return '';
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} و ${parts[parts.length - 1]}` : parts[0];
    return `<div class="card" id="backupCard" style="border-color:var(--warn)">
      <div class="card-h"><h3>${icon('info', 16)} معاملات این دستگاه کنار گذاشته شدند</h3><span class="fine">${dateTime(b.at, false)}</span></div>
      <p class="fine">دستگاه دیگری نسخه متفاوتی از معاملات شما را ذخیره کرده است. نسخه ذخیره‌شده نسخه اصلی است. این دستگاه دارای ${esc(list)} است که نسخه ابری ندارد.</p>
      <div class="row mt" style="gap:8px"><button class="btn sm" id="bkUse">استفاده از نسخه این دستگاه</button><button class="btn sm ghost" id="bkDrop">حفظ نسخه ذخیره‌شده ابری</button></div>
    </div>`;
  }

  function wireBackup() {
    $('#bkUse', el)?.addEventListener('click', () => {
      if (!auth.user) return;
      restoreBackup({ load, save, remove }, auth.user.id);
      toast('نسخه این دستگاه به عنوان نسخه اصلی در همه جا ذخیره شد.', 'up');
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
      <h3>اجرای استراتژی روی پول شبیه‌سازی‌شده</h3>
      <p style="max-width:620px">نظارت بر ${cfg.universe.length} ارز روی تایم‌فریم ${esc(e.interval)}. ${rulesText(e)} تعیین اندازه موقعیت به گونه‌ای است که ضرر حداکثر ${cfg.riskPct}% سرمایه باشد، حداکثر ${cfg.maxPositionPct}% در یک ارز و هرگز بیشتر از موجودی نقد حساب.${ownRulesText()} هر معامله با کارمزد ثبت می‌شود.</p>
      <p class="fine" style="max-width:620px">سرمایه اولیه ${money(cfg.startingBalance)}. نتایج تست‌شده را پیش از شروع مطالعه کنید${r ? ` — روی این تایم‌فریم ${r.ret > w.hold ? 'عملکرد بهتری نسبت به هولد کردن داشت (که تضمینی برای آینده نیست)' : 'هولد کردن نتیجه بهتری داشت'}` : ''}. هر زمان خواستید بدون ریست کردن حساب می‌توانید آن را متوقف کنید.</p>
    </div>${learningCard()}`;
  }

  function ownRulesText() {
    if (!ownRulesOn()) return '';
    const own = cfg.universe.filter((s) => PER_COIN_RULES.rules[s]);
    if (!own.length) return ' هیچ‌کدام از ارزهای تحت نظر قوانین اختصاصی ندارند.';
    if (own.length === cfg.universe.length) return ' هر ارز با قوانین مخصوص به خود معامله می‌شود.';
    return ` ${own.length} ارز از ${cfg.universe.length} ارز (${own.join(', ')}) قوانین مخصوص به خود را دارند؛ مابقی از قوانین عمومی استفاده می‌کنند.`;
  }

  async function catchUp() {
    if (st.running) return;
    st.running = true;
    const btn = $('#startBtn', el);
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> در حال بررسی…';
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
          if (state.open[sym] && Number.isFinite(lastPx)) closeManual(state, runCfg, sym, lastPx, Date.now(), 'no exchange price');
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
      } catch {}
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
    if (failed.length && st.warnedNoData !== failed.join()) { st.warnedNoData = failed.join(); toast(`داده‌ای برای ${failed.join(', ')} یافت نشد — رد شد.`, 'info'); }
    if (noExchange.length && !st.warnedNoExchange) st.warnedNoExchange = true, toast(`${noExchange.join(', ')} فاقد کندل صرافی هستند، بنابراین هوش مصنوعی آن‌ها را معامله نمی‌کند.`, 'info');
    draw();
    if (processed) toast(`${processed.toLocaleString('en-US')} کندل جدید بررسی شد.`, 'up');
    learnFrom(forecastInputs, runCfg.interval);
    cloudLearning().then((c) => (c?.[runCfg.interval] ? null : learningPass(runCfg.interval, { candlesBySymbol: Object.fromEntries(forecastInputs.map((x) => [x.sym, x.candles])) }))).catch(() => {});
  }

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
    const why = { target: 'اصابت به تارگت', 'stop-loss': 'اصابت به حد ضرر', 'trailing stop': 'فعال شدن حد ضرر متحرک', 'break-even stop': 'بازگشت به نقطه ورود پس از انتقال حد ضرر', 'signal reversal': 'برگشت سیگنال', 'sold into strength': 'رسیدن به محدوده هدف صعودی', 'no exchange price': 'عدم وجود قیمت صرافی' };
    const line = (e) => {
      if (e.kind === 'check') {
        const c = e.c;
        const did = c.opened || c.closed ? `${c.opened ? `خرید ${c.opened}` : ''}${c.opened && c.closed ? '، ' : ''}${c.closed ? `فروش ${c.closed}` : ''}` : 'بدون معامله';
        return `<b>بررسی ${c.coins} ارز${c.by === 'cloud' ? ' در ابر' : ''}</b> — ${c.candles.toLocaleString('en-US')} کندل بسته شده، ${did}${c.best ? ` · بیشترین امتیاز ${esc(c.best.sym)} ${c.best.score > 0 ? '+' : ''}${c.best.score}` : ''}`;
      }
      if (e.kind === 'review') return `<b>خودارزیابی</b> — ${esc(e.c.text)}`;
      if (e.kind === 'settings') return `<b>تغییر تنظیمات</b> — ${esc(e.c.text)}`;
      if (e.kind === 'buy') {
        const bar = e.p.entryBar;
        return `<b>خرید ${esc(e.sym)}</b> در قیمت ${money(e.p.entry)}${Number.isFinite(e.p.openScore) ? ` — امتیاز ${e.p.openScore > 0 ? '+' : ''}${Math.round(e.p.openScore)}` : ''}`;
      }
      return `<b>فروش ${esc(e.sym)}</b> در قیمت ${money(e.p.exit)} — ${esc(why[e.p.reason] || e.p.reason)} · <span class="${e.p.pnl >= 0 ? 'up' : 'down'}">${e.p.pnl >= 0 ? '+' : '−'}${money(Math.abs(e.p.pnl))} (${pct(e.p.pnlPct)})</span>`;
    };
    const replayed = ev.filter((e) => !['check', 'review', 'settings'].includes(e.kind) && e.t < liveSince).length;
    return `<div class="card mt">
      <div class="card-h"><h3>${icon('ai', 16)} فعالیت هوش مصنوعی</h3><span class="fine">${autoOn ? 'در حال اجرا · بررسی هر ۵ دقیقه' : session.status === 'stopped' ? 'متوقف‌شده' : 'غیرفعال'}${st.lastRun ? ` · آخرین بررسی ${ago(st.lastRun)}` : ''}</span></div>
      ${replayed ? `<p class="fine" style="margin-top:0">معاملات علامت‌گذاری‌شده با <span class="chip">بازپخش</span> مربوط به کندل‌های پیش از راه‌اندازی این حساب هستند تا سابقه خالی نباشد.</p>` : ''}
      ${ev.length ? `<ul class="fine" style="list-style:none;padding:0;margin:0">${ev.slice(0, 30).map((e) => `<li style="padding:6px 0;border-bottom:1px solid var(--border)"><span class="muted" style="display:inline-block;min-width:150px">${dateTime(e.t)}</span>${!['check', 'review', 'settings'].includes(e.kind) && e.t < liveSince ? '<span class="chip" style="margin-right:6px">بازپخش</span>' : ''}${line(e)}</li>`).join('')}</ul>`
        : `<p class="muted">${autoOn ? 'هنوز معامله‌ای انجام نشده — هوش مصنوعی در انتظار شرایط مناسب است.' : 'هوش مصنوعی متوقف است.'}</p>`}
    </div>`;
  }

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
      <div class="card-h"><h3>${icon('ai', 16)} ارزیابی عملکرد معاملات</h3>
        <div class="row" style="gap:8px"><label class="fine" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="autoLearn" ${autoLearn ? 'checked' : ''}> یادگیری خودکار</label>
        <button class="btn sm" id="reviewNow">${icon('refresh', 14)} ارزیابی فوری</button></div></div>
      <p class="fine" style="margin-top:0">پس از هر بررسی، هوش مصنوعی معاملات خود را تحلیل کرده و در صورت ضرر مداوم، فیلترهای مناسب را فعال یا غیرفعال می‌کند.</p>
      <div class="grid g4 mt">
        <div class="stat"><span class="k">معاملات بررسی‌شده</span><span class="v">${o.n}</span></div>
        <div class="stat"><span class="k">برد</span><span class="v">${o.winRate === null ? '—' : `${o.winRate}%`}</span></div>
        <div class="stat"><span class="k">میانگین نتیجه</span><span class="v ${o.avgR > 0 ? 'up' : o.avgR < 0 ? 'down' : ''}">${o.avgR === null ? '—' : `${o.avgR > 0 ? '+' : o.avgR < 0 ? '−' : ''}${Math.abs(o.avgR)}R`}</span></div>
        <div class="stat"><span class="k">قوانین تغییریافته</span><span class="v">${lessons.filter((l) => !l.undo && !l.undone).length}</span></div>
      </div>
      ${review.findings.length ? `<ul class="reasons mt">${review.findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      <p class="fine mt"><b>قوانین فعال کنونی:</b> ${active.length ? esc(active.join(' · ')) : 'هیچ‌کدام — استراتژی اصلی'}.</p>
    </div>`;
  }

  function wireReview() {
    $('#reviewNow', el)?.addEventListener('click', () => {
      const r = selfReview();
      if (r && !r.changes.length) toast(r.review.overall.n < MIN_TRADES ? `تعداد معاملات ${r.review.overall.n} است — نیاز به ${MIN_TRADES} معامله دارد.` : 'موردی برای تغییر یافت نشد.', 'info');
      draw();
    });
    $('#autoLearn', el)?.addEventListener('change', (e) => { save(AUTOLEARN_KEY, e.target.checked); toast(e.target.checked ? 'یادگیری خودکار فعال شد.' : 'یادگیری خودکار غیرفعال شد.', 'info'); });
  }

  const REAL_KEY = 'realTradeState';
  const realState = () => load(REAL_KEY, null);

  function realCard() {
    const rs = realState();
    const has = rs && (Object.keys(rs.open).length || rs.closed.length);
    const s3 = has ? stats(rs, marks()) : null;
    const open = has ? Object.entries(rs.open) : [];
    const closed = has ? [...rs.closed].reverse().slice(0, 25) : [];
    return `<div class="card mt">
      <div class="card-h"><h3>حساب واقعی</h3><div class="row" style="gap:8px"><span class="chip up">سرمایه شخصی</span>${has ? '<button class="btn sm ghost" id="realReset">بازنشانی</button>' : ''}</div></div>
      <p class="fine">ثبت معاملاتی که خودتان در صرافی انجام داده‌اید برای مقایسه. ${esc(REAL_NOTICE)}</p>

      <div class="row mt" style="gap:10px;align-items:center;flex-wrap:wrap">
        <label class="btn sm" style="cursor:pointer">${icon('exchanges', 14)} ورود از بایننس
          <input type="file" id="csvIn" accept=".csv,.tsv,.txt" hidden>
        </label>
        <span class="fine">بایننس → Orders → Trade History → Export. اطلاعات در مرورگر شما خوانده می‌شود و جایی آپلود نمی‌شود.</span>
      </div>
      ${has ? `<div class="row mt" style="gap:8px;flex-wrap:wrap">
        <button class="btn sm ghost" data-export="real-csv">دانلود معاملات (CSV)</button>
        <button class="btn sm ghost" data-report="real">گزارش قابل چاپ</button>
      </div>` : ''}
      <p class="fine" id="csvMsg" hidden></p>

      <form id="rf" class="row mt" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
        <label class="fld">ارز<select class="inp" name="sym">${tradable.slice(0, 60).map((c) => `<option value="${esc(c.symbol)}">${esc(c.symbol)}</option>`).join('')}</select></label>
        <label class="fld">جهت<select class="inp" name="side"><option value="long">خرید (Long)</option><option value="short">فروش (Short)</option></select></label>
        <label class="fld">مقدار<input class="inp" name="qty" type="number" step="any" min="0" placeholder="0.05" style="width:100px" required></label>
        <label class="fld">قیمت (${esc(fx.code)})<input class="inp" name="entry" type="number" step="any" min="0" placeholder="${esc(price(60000 * fx.rate))}" style="width:130px" required></label>
        <label class="fld">قیمت خروج (${esc(fx.code)})<input class="inp" name="exit" type="number" step="any" min="0" placeholder="هنوز باز است" style="width:130px"></label>
        <label class="fld">کارمزد (${esc(fx.code)})<input class="inp" name="fee" type="number" step="any" min="0" placeholder="0" style="width:100px"></label>
        <button class="btn primary">ثبت معامله</button>
      </form>
      <p class="fine down" id="rfErr" hidden></p>

      ${s3 ? `<div class="grid g4 mt">
        <div class="stat"><span class="k">نتیجه قطعی‌شده</span><span class="v ${s3.returnPct >= 0 ? 'up' : 'down'}">${pct(s3.returnPct)}</span><span class="s fine">${money(s3.equity - s3.startingBalance)} روی پایه ${money(s3.startingBalance)}</span></div>
        <div class="stat"><span class="k">نرخ برد</span><span class="v">${s3.winRate === null ? '—' : `${s3.winRate}%`}</span><span class="s fine">${s3.wins} برد / ${s3.losses} باخت</span></div>
        <div class="stat"><span class="k">بیشترین افت</span><span class="v ${s3.maxDrawdownPct > 0 ? 'down' : 'flat'}">${pct(-s3.maxDrawdownPct, 1)}</span></div>
        <div class="stat"><span class="k">معاملات</span><span class="v">${s3.trades}</span><span class="s fine">${s3.openCount} باز</span></div>
      </div>` : ''}

      ${open.length ? `<div class="tbl-wrap mt"><table class="tbl"><thead><tr><th class="l">ارز</th><th>جهت</th><th>ورود</th><th>اکنون</th><th>حجم</th><th>سود/زیان باز</th><th></th></tr></thead><tbody>
        ${open.map(([sym, p]) => {
          const px = priceOf(sym);
          const pnl = px === null ? null : (p.side === 'short' ? (p.entry - px) : (px - p.entry)) * p.qty;
          return `<tr><td class="l"><b>${esc(sym)}</b></td><td>${p.side === 'short' ? 'شورت' : 'لانگ'}</td><td>${money(p.entry)}</td><td>${px === null ? '<span class="muted">بدون قیمت</span>' : money(px)}</td><td>${money(p.notional)}</td>
            <td class="${pnl === null ? 'muted' : pnl >= 0 ? 'up' : 'down'}">${pnl === null ? '—' : `<b>${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl))}</b>`}</td>
            <td><button class="btn sm" data-realclose="${esc(sym)}">ثبت فروش…</button></td></tr>`;
        }).join('')}</tbody></table></div>` : ''}

      ${closed.length ? `<div class="tbl-wrap mt"><table class="tbl"><thead><tr><th class="l">ارز</th><th class="l">بسته شده</th><th>ورود</th><th>خروج</th><th>نتیجه</th></tr></thead><tbody>
        ${closed.map((t) => `<tr><td class="l"><b>${esc(t.symbol)}</b>${t.side === 'short' ? ' <small class="muted">شورت</small>' : ''}</td><td class="l fine">${dateTime(t.exitAt, false)}</td><td>${money(t.entry)}</td><td>${money(t.exit)}</td>
          <td class="${t.pnl >= 0 ? 'up' : 'down'}"><b>${t.pnl >= 0 ? '+' : '−'}${money(Math.abs(t.pnl))}</b> <small>${pct(t.pnlPct)}</small></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="fine mt">معامله واقعی ثبت نشده است.</p>'}
      ${has && rs.equityCurve.length > 2 ? `<div class="mt"><div class="card-h" style="margin-bottom:6px"><h3 style="font-size:14px">ارزش دارایی در طول زمان</h3><span class="fine">در مقایسه با هولد کردن بیت‌کوین</span></div><div id="realChart"></div><p class="fine" id="realChartNote"></p></div>` : ''}
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
    } catch {}

    if (st.disposed) return;
    const lc = new LineChart(host, { height: 240, yFormat: (v) => money(v), legend: true });
    st.charts.push(lc);
    const series = [{ name: 'حساب شما', color: 'var(--accent)', width: 2.4, data: curve.map((p) => ({ x: p.t, y: p.equity })) }];
    if (holdSeries) series.push({ name: 'هولد بیت‌کوین', color: 'var(--text-muted)', width: 1.6, dash: true, data: holdSeries });
    lc.set(series);

    if (note && holdSeries) {
      const mine = ((curve[curve.length - 1].equity / rs.startingBalance) - 1) * 100;
      const hold = ((holdSeries[holdSeries.length - 1].y / rs.startingBalance) - 1) * 100;
      const diff = mine - hold;
      note.textContent = diff >= 0
        ? `عملکرد شما ${pct(diff, 1)} بهتر از هولد کردن بیت‌کوین بوده است.`
        : `هولد کردن بیت‌کوین ${pct(Math.abs(diff), 1, false)} عملکرد بهتری داشته است.`;
      note.className = `fine ${diff >= 0 ? 'up' : 'down'}`;
    }
  }

  function wireExports() {
    const stamp = new Date().toISOString().slice(0, 10);
    $$('[data-export]', el).forEach((b) => b.addEventListener('click', () => {
      const which = b.dataset.export;
      const src = which === 'ai-csv' ? state : realState();
      if (!src?.closed?.length) { toast('معامله بسته‌شده‌ای برای خروجی وجود ندارد.', 'info'); return; }
      downloadText(`coinvantage-${which === 'ai-csv' ? 'ai-trader' : 'my-trades'}-${stamp}.csv`, tradesCsv(src.closed));
      toast(`${src.closed.length} معامله صادر شد.`, 'up');
    }));
    $$('[data-report]', el).forEach((b) => b.addEventListener('click', () => {
      const isAi = b.dataset.report === 'ai';
      const src = isAi ? state : realState();
      if (!src) { toast('اطلاعاتی برای گزارش وجود ندارد.', 'info'); return; }
      const s2 = stats(src, marks());
      const notes = isAi
        ? ['<b>پول شبیه‌سازی‌شده.</b> این معاملات واقعی نیستند.']
        : ['<b>ثبت دستی یا واردشده.</b> این معاملات واقعی در صرافی هستند.'];
      const html = reportHtml({
        title: isAi ? 'گزارش عملکرد ترید بات هوش مصنوعی' : 'گزارش عملکرد معاملات',
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
        if (!closed.length && !open.length) { msg.className = 'fine down'; msg.textContent = 'معامله‌ای از فایل استخراج نشد.'; return; }

        const rs = realState() || newState(cfg);
        let added = 0;
        for (const t of closed) {
          const r = recordRealTrade(rs, cfg, {
            symbol: t.symbol, side: 'long', qty: t.qty, entry: t.entry, exit: t.exit,
            fee: t.fee, openedAt: t.openedAt, closedAt: t.closedAt, note: 'imported',
          });
          if (r.ok) added++;
        }
        for (const o of open) {
          const r = recordRealTrade(rs, cfg, { symbol: o.symbol, side: 'long', qty: o.qty, entry: o.entry, fee: o.fee, openedAt: o.at, note: 'imported' });
          if (r.ok) added++;
        }
        save(REAL_KEY, rs);
        msg.className = 'fine up';
        msg.textContent = `${added} معامله از ${fills.length} سفارش وارد شد — ${closed.length} بسته، ${open.length} باز.`;
        toast(`${added} معامله وارد شد.`, 'up');
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
      toast(r.trade ? `ثبت شد: ${r.trade.pnl >= 0 ? 'سود' : 'زیان'} معامله ${money(Math.abs(r.trade.pnl))}` : 'معامله باز ثبت شد.', r.trade && r.trade.pnl < 0 ? 'down' : 'up');
      draw();
    });
    $$('[data-realclose]', el).forEach((b) => b.addEventListener('click', async () => {
      const sym = b.dataset.realclose;
      const now = priceOf(sym) ?? await fetchPrice(sym);
      const m = modal(`<h3>ثبت فروش ${esc(sym)}</h3>
        <p class="fine">قیمت فروش در صرافی را وارد کنید.</p>
        <form class="stack mt" style="gap:10px" id="rcf">
          <label class="fld">قیمت فروش (${esc(fx.code)})<input class="inp" name="px" type="number" step="any" min="0" required value="${now === null ? '' : esc(String(+(now * (fx.rate || 1)).toPrecision(8)))}"></label>
          <label class="fld">کارمزد (${esc(fx.code)})<input class="inp" name="fee" type="number" step="any" min="0" value="${now === null ? '0' : esc(String(+(now * (realState()?.open[sym]?.qty || 0) * (cfg.feePct / 100) * (fx.rate || 1)).toPrecision(4)))}"></label>
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
        const r = rs ? closeManual(rs, { ...cfg, feePct: 0 }, sym, px, Date.now(), 'ثبت توسط شما') : { ok: false, error: 'این معامله دیگر باز نیست.' };
        if (!r.ok) { const err = $('#rcfErr', m.el); err.textContent = r.error; err.hidden = false; return; }
        save(REAL_KEY, rs);
        m.close();
        toast(`فروش ${sym} ثبت شد: ${r.trade.pnl >= 0 ? 'سود' : 'زیان'} ${money(Math.abs(r.trade.pnl))}`, r.trade.pnl >= 0 ? 'up' : 'down');
        draw();
      });
    }));
    $('#realReset', el)?.addEventListener('click', () => {
      save(REAL_KEY, newState(cfg));
      toast('حساب واقعی پاکسازی شد.', 'info');
      draw();
    });
  }

  const MY_KEY = 'myDemoState';
  const myState = () => load(MY_KEY, null);

  function myDemoCard() {
    const ms = myState();
    if (!ms || (!Object.keys(ms.open).length && !ms.closed.length)) {
      return `<div class="card"><div class="card-h"><h3>معاملات آزمایشی شخصی</h3><span class="chip">حساب مجزا</span></div>
        <p class="fine">هنوز معامله‌ای ثبت نشده است. صفحه هر ارزی را باز کنید، روی <b>معامله</b> بزنید و برای ثبت معامله آزمایشی دستی از آن استفاده کنید.</p></div>`;
    }
    const s2 = stats(ms, marks());
    const open = Object.entries(ms.open);
    const closed = [...ms.closed].reverse().slice(0, 20);
    return `<div class="card">
      <div class="card-h"><h3>معاملات آزمایشی شخصی</h3><div class="row" style="gap:8px"><span class="chip">حساب مجزا</span><button class="btn sm ghost" id="myReset">بازنشانی</button></div></div>
      <div class="grid g4">
        <div class="stat"><span class="k">موجودی</span><span class="v ${s2.returnPct >= 0 ? 'up' : 'down'}">${money(s2.equity)}</span><span class="s fine">شروع از ${money(s2.startingBalance)}</span></div>
        <div class="stat"><span class="k">بازدهی</span><span class="v ${s2.returnPct >= 0 ? 'up' : 'down'}">${pct(s2.returnPct)}</span></div>
        <div class="stat"><span class="k">نرخ برد</span><span class="v">${s2.winRate === null ? '—' : `${s2.winRate}%`}</span><span class="s fine">${s2.wins} برد / ${s2.losses} باخت</span></div>
        <div class="stat"><span class="k">معاملات</span><span class="v">${s2.trades}</span><span class="s fine">${s2.openCount} باز</span></div>
      </div>
      ${open.length ? `<div class="tbl-wrap mt"><table class="tbl"><thead><tr><th class="l">ارز</th><th>خرید در</th><th>اکنون</th><th>حجم</th><th>سود/زیان باز</th><th></th></tr></thead><tbody>
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
      toast('حساب آزمایشی شخصی به موجودی اولیه بازگشت.', 'info');
      draw();
    });
    $$('[data-mysell]', el).forEach((b) => b.addEventListener('click', async () => {
      const sym = b.dataset.mysell;
      const ms = myState();
      const px = priceOf(sym) ?? await fetchPrice(sym);
      if (px === null) { toast(`قیمتی برای ${sym} در دسترس نیست.`, 'info'); return; }
      const r = closeManual(ms, cfg, sym, px);
      if (!r.ok) { toast(r.error, 'down'); return; }
      save(MY_KEY, ms);
      toast(`فروش ${sym}: نتیجه ${money(Math.abs(r.trade.pnl))}`, r.trade.pnl >= 0 ? 'up' : 'down');
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
      <p style="margin:0"><b>تنظیمات شما با موارد تست‌شده متفاوت است، بنابراین نتایج تست‌شده برای این حساب صدق نمی‌کنند.</b></p>
      <ul class="fine" style="margin:6px 0 0;padding-left:18px">${w.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <button class="btn sm mt" type="button" id="warnUseBest">استفاده از بهترین تنظیمات تست‌شده</button>
    </div>`;
  }

  function untradableCard() {
    const u = untradable();
    if (!u.all.length) return '';
    const n = u.all.length;
    return `<div class="card" style="border-color:var(--warn)" id="untradable">
      <p style="margin:0"><b>${n} ارز قابل معامله نیستند و رد می‌شوند.</b>
      ${u.noData.length ? `${esc(u.noData.join(', '))}: فاقد داده صرافی. ` : ''}${u.sparse.length ? `${esc(u.sparse.join(', '))}: قیمت‌های محدود کوین‌گکو. ` : ''}</p>
      <button class="btn sm mt" type="button" id="dropUntradable">حذف از لیست</button>
    </div>`;
  }
  function wireUntradable() {
    $('#dropUntradable', el)?.addEventListener('click', () => {
      const gone = untradable().all;
      if (!gone.length) return;
      cfg.universe = cfg.universe.filter((s) => !gone.includes(s));
      save(CFG_KEY, cfg);
      if (state) { logCheck(state, { kind: 'settings', text: `حذف ${gone.join(', ')} (بدون داده قیمت)` }); save(STATE_KEY, state); }
      toast(`ارزهای ${gone.join(', ')} حذف شدند.`, 'up');
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
        <div class="card"><div class="stat"><span class="k">موجودی فعلی</span><span class="v ${s.returnPct >= 0 ? 'up' : 'down'}">${money(s.equity)}</span><span class="s fine">شروع از ${money(s.startingBalance)}</span></div></div>
        <div class="card"><div class="stat"><span class="k">بازدهی</span><span class="v ${s.returnPct >= 0 ? 'up' : 'down'}">${pct(s.returnPct)}</span><span class="s fine">از ${dateTime(s.since, false)}</span></div></div>
        <div class="card"><div class="stat"><span class="k">نرخ برد</span><span class="v">${s.winRate === null ? '—' : `${s.winRate}%`}</span><span class="s fine">${s.wins} برد / ${s.losses} باخت</span></div></div>
        <div class="card"><div class="stat"><span class="k">بیشترین افت</span><span class="v ${s.maxDrawdownPct > 0 ? 'down' : 'flat'}">${pct(-s.maxDrawdownPct, 1)}</span><span class="s fine">${s.openCount} باز · ${s.trades} بسته</span></div></div>
      </div>

      <div class="card mt">
        <div class="card-h"><h3>موقعیت‌های باز</h3><span class="fine">بر اساس قیمت زنده</span></div>
        ${open.length ? `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">ارز</th><th class="hide-p">ورود</th><th>اکنون</th><th class="hide-p">حد ضرر</th><th class="hide-p">تارگت</th><th class="hide-t">حجم</th><th>سود/زیان باز</th><th class="l hide-t">زمان باز شدن</th></tr></thead><tbody>
          ${open.map(([sym, p]) => {
            const px = st.prices[sym];
            if (!Number.isFinite(px)) {
              const coin = all.find((c) => c.symbol === sym);
              return `<tr data-sym="${esc(sym)}"><td class="l"><div class="coin-cell">${coinLogo(coin || { symbol: sym }, 22)}<b>${esc(sym)}</b></div></td>
                <td class="hide-p">${money(p.entry)}</td><td class="muted">در حال بارگذاری…</td>
                <td class="down hide-p">${money(p.stop)}</td><td class="up hide-p">${p.tp === null || p.tp === undefined ? 'متحرک' : money(p.tp)}</td>
                <td class="hide-t">${money(p.notional)}</td><td class="muted fine">انتظار برای قیمت</td><td class="l fine hide-t">${dateTime(p.openedAt + (INTERVAL_MS[state.interval] || 0))}</td></tr>`;
            }
            const pnl = (px - p.entry) * p.qty;
            const coin = all.find((c) => c.symbol === sym);
            return `<tr data-sym="${esc(sym)}">
              <td class="l"><div class="coin-cell">${coinLogo(coin || { symbol: sym }, 22)}<b>${esc(sym)}</b></div></td>
              <td class="hide-p">${money(p.entry)}</td><td>${money(px)}${st.priceFrom[sym] === 'candle' ? '<br><small class="fine">هر ۲۰ ثانیه</small>' : ''}</td>
              <td class="down hide-p">${money(p.stop)}${p.movedToBreakEven ? ' <span class="fine">(BE)</span>' : ''}</td>
              <td class="up hide-p">${p.tp === null || p.tp === undefined ? 'متحرک' : money(p.tp)}</td>
              <td class="hide-t">${money(p.notional)}</td>
              <td class="${pnl >= 0 ? 'up' : 'down'}"><b>${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl))}</b><br><small>${pct((px / p.entry - 1) * 100)}</small></td>
              <td class="l fine hide-t">${dateTime(p.openedAt + (INTERVAL_MS[state.interval] || 0))}<br><small>${ago(p.openedAt + (INTERVAL_MS[state.interval] || 0))}</small></td></tr>`;
          }).join('')}
        </tbody></table></div>` : `<p class="muted">${autoOn ? 'هیچ موقعیت بازی وجود ندارد — هوش مصنوعی در انتظار سیگنال است.' : 'هوش مصنوعی متوقف است.'}</p>`}
      </div>

      ${activityCard()}
      ${reviewCard()}

      ${state.equityCurve.length > 2 ? `<div class="card mt"><div class="card-h"><h3>روند موجودی</h3><span class="fine">شبیه‌سازی‌شده</span></div><div id="eqChart"></div></div>` : ''}

      <div class="card mt">
        <div class="card-h"><h3>تاریخچه معاملات</h3><div class="row" style="gap:8px"><span class="fine">${s.trades} بسته · ${money(s.feesPaid)} کارمزد</span><button class="btn sm ghost" data-export="ai-csv">CSV</button><button class="btn sm ghost" data-report="ai">گزارش</button></div></div>
        ${closed.length ? `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">ارز</th><th class="l hide-p">باز شدن</th><th class="l">بسته شدن</th><th class="hide-p">ورود</th><th class="hide-p">خروج</th><th>نتیجه</th><th class="l">دلیل بسته شدن</th></tr></thead><tbody>
          ${closed.slice(0, 60).map((t) => `<tr data-sym="${esc(t.symbol)}">
            <td class="l"><b>${esc(t.symbol)}</b></td>
            <td class="l fine hide-p">${dateTime(t.openedAt + (INTERVAL_MS[state.interval] || 0))}</td><td class="l fine wrap">${dateTime(t.exitAt + (INTERVAL_MS[state.interval] || 0))}</td>
            <td class="hide-p">${money(t.entry)}</td><td class="hide-p">${money(t.exit)}</td>
            <td class="${t.pnl >= 0 ? 'up' : 'down'}"><b>${t.pnl >= 0 ? '+' : '−'}${money(Math.abs(t.pnl))}</b> <small>${pct(t.pnlPct)}</small></td>
            <td class="l"><span class="chip ${t.reason === 'target' ? 'up' : t.reason === 'stop-loss' ? 'down' : ''}">${esc(t.reason)}</span></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">معامله بسته‌شده‌ای وجود ندارد.</p>'}
      </div>

      <div class="card mt" style="background:var(--surface-2)">
        <h3>توضیحات و سلب مسئولیت</h3>
        <p class="fine">${esc(PAPER_NOTICE)} نتایج شامل کارمزد ${cfg.feePct}% در هر طرف است.</p>
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
    if (!y) return `<b>بازدهی پیش‌بینی‌شده</b><p class="fine" style="margin:6px 0 0">داده‌ای برای انتظار وجود ندارد.</p>`;
    const own = c.strategy !== 'custom' && !c.ownRulesOff && c.interval === PER_COIN_RULES.interval;
    const cash = (v) => `${v >= 0 ? '+' : '−'}${money(Math.abs((c.startingBalance * v) / 100))}`;
    const top = y.levels.reduce((a, l) => (!a || l.ret > a.ret ? l : a), null);
    const n = (c.universe || []).length;
    return `<b>بازدهی پیش‌بینی‌شده</b> <span class="fine">بر اساس تست ${esc(y.chart)}، با ریسک ${y.risk}%</span>
      <p class="fine" style="margin:6px 0 0">حدود <b class="${y.ret >= 0 ? 'up' : 'down'}">${sign(y.ret)}</b> در هر ${esc(y.block)} (${cash(y.ret)} روی سرمایه ${money(c.startingBalance)}): ${sign(y.lo)} در بدترین دوره، ${sign(y.hi)} در بهترین دوره، ${y.up} دوره از ${y.periods} دوره صعودی.</p>
      ${y.levels.length ? `<div class="tbl-wrap mt"><table class="tbl fine fit"><thead><tr><th class="l">ریسک هر معامله</th><th>میانگین هر دوره</th><th>بدترین → بهترین</th><th>بیشترین افت</th><th class="hide-p">دوره‌های صعودی</th></tr></thead><tbody>
        ${y.levels.map((l) => `<tr${l.risk === y.risk ? ' style="font-weight:700"' : ''}><td class="l">${l.risk}%${l.risk === y.risk ? '<small>انتخاب شما</small>' : ''}</td><td class="${l.ret >= 0 ? 'up' : 'down'}">${sign(l.ret)}</td><td class="range">${sign(l.lo)} → ${sign(l.hi)}</td><td>${l.dd}%</td><td class="hide-p">${l.up} از ${y.periods}</td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
  }

  $('#cfgBtn', el).addEventListener('click', () => {
    const coins = all.filter((c) => !isStable(c.symbol)).slice(0, 100);
    const chosen = new Set(cfg.universe);
    const streakNow = load(NODATA_KEY, {});
    const noDataNow = [...Object.keys(streakNow).filter((k) => streakNow[k] >= 2), ...st.noExchange];
    const VENUE = { gate: 'Gate.io', htx: 'HTX', okx: 'OKX' };
    const venueTag = (c) => {
      const v = knownVenue(c);
      if (v === null) return ' <small class="down" title="روی صرافی‌های پشتیبانی‌شده نیست">بدون صرافی</small>';
      if (noDataNow.includes(c.symbol)) return ' <small class="down">بدون داده</small>';
      if (v === 'binance') return '';
      return v ? ` <small class="muted">${VENUE[v]}</small>` : ' <small class="muted">در حال بررسی…</small>';
    };
    const best = bestTestedChart();
    const own = cfg.custom ? { ...CUSTOM_DEFAULT, ...cfg.custom } : { ...CUSTOM_DEFAULT };
    const exitOf = (r) => (r.trailAtr ? `t${r.trailAtr}` : `r${r.rMultiple}`);
    const chartLabel = (i) => {
      const x = CHART_TESTED[i];
      if (!x) return `${i} — تست‌نشده`;
      const t = x.adopt ? x.own : x.standard;
      return `${i} — تست‌شده ${pct(t.ret, 2)} در هر ${x.block} (هولد ${pct(x.hold, 2)})`;
    };
    const m = modal(`<h3>تنظیمات ترید بات</h3>
      <div class="card mt" style="padding:12px" id="todo"><b>راهنمای سریع</b>
        <p class="fine" style="margin:6px 0 0">تنظیمات پیشنهادی: تایم‌فریم <b>${esc(best.iv)}</b> با قوانین تست‌شده. ریسک را روی ۱ تا ۲٪ تنظیم کنید.</p>
        <button class="btn sm mt" type="button" id="useBest">استفاده از بهترین تنظیمات تست‌شده</button>
        <div id="todoLive"></div></div>
      <form class="stack mt" style="gap:12px" id="cf" novalidate>
        <fieldset class="stack" style="gap:8px;border:0;padding:0;margin:0;min-width:0"><legend class="fine"><b>حساب و ریسک</b></legend>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <label class="fld">سرمایه اولیه${fx.code === 'USD' ? '' : ` (${esc(fx.code)})`}<input class="inp" name="startingBalance" type="number" min="${Math.ceil(100 * fx.rate)}" step="any" value="${Math.round(cfg.startingBalance * fx.rate)}" style="width:150px"></label>
            <label class="fld">ریسک هر معامله %<input class="inp" name="riskPct" type="number" min="0.1" max="5" step="0.1" value="${cfg.riskPct}" style="width:110px"></label>
            <label class="fld">حداکثر معاملات باز<input class="inp" name="maxPositions" type="number" min="1" max="20" value="${cfg.maxPositions}" style="width:110px"></label>
            <label class="fld">حداکثر سهم یک ارز %<input class="inp" name="maxPositionPct" type="number" min="5" max="100" step="5" value="${cfg.maxPositionPct}" style="width:120px"></label>
            <label class="fld">کارمزد هر معامله %<input class="inp" name="feePct" type="number" min="0" max="1" step="0.01" value="${cfg.feePct}" style="width:110px"></label>
          </div>
        </fieldset>
        <fieldset class="stack" style="gap:8px;border:0;padding:0;margin:0;min-width:0"><legend class="fine"><b>تایم‌فریم</b></legend>
          <select class="inp" name="interval" aria-label="تایم‌فریم" style="width:100%">${TRADER_CHARTS.map((i) => `<option value="${i}" ${i === cfg.interval ? 'selected' : ''}>${esc(chartLabel(i))}</option>`).join('')}</select>
          <label class="row fine" style="gap:8px;align-items:flex-start" id="switchRow" hidden><input type="checkbox" name="switchNow" checked style="margin-top:2px"><span>شروع حساب تازه روی تایم‌فریم جدید. اطلاعات قبلی پاک خواهند شد.</span></label>
        </fieldset>
        <fieldset class="stack" style="gap:8px;border:0;padding:0;margin:0;min-width:0"><legend class="fine"><b>استراتژی</b></legend>
          <label class="row" style="gap:8px"><input type="radio" name="strategy" value="tested" ${cfg.strategy === 'custom' ? '' : 'checked'}><span>قوانین تست‌شده برای این تایم‌فریم <span class="fine">(پیشنهادی)</span></span></label>
          <label class="row" style="gap:8px;align-items:flex-start;margin-left:24px" id="ownRow"><input type="checkbox" name="ownRules" ${cfg.ownRulesOff ? '' : 'checked'} style="margin-top:3px"><span class="fine">در تایم‌فریم روزانه، هر ارز از قوانین مختص به خود استفاده کند.</span></label>
          <label class="row" style="gap:8px"><input type="radio" name="strategy" value="custom" ${cfg.strategy === 'custom' ? 'checked' : ''}><span>قوانین شخصی من</span></label>
          <div class="stack" id="customBox" style="gap:8px;margin-left:24px">
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <label class="fld">شرایط خرید<select class="inp" name="entryMode">${[['trend', 'امتیاز قوی'], ['breakout', 'شکست سقف ۲۰ کندلی'], ['pullback', 'پولبک در روند صعودی']].map(([v, t]) => `<option value="${v}" ${own.entryMode === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
              <label class="fld">حد ضرر<select class="inp" name="atrStop">${[1.5, 2, 3].map((v) => `<option value="${v}" ${own.atrStop === v ? 'selected' : ''}>${v} ATR پایین‌تر از ورود</option>`).join('')}</select></label>
              <label class="fld">خروج<select class="inp" name="exit">${[['r2', 'تارگت 2R'], ['r3', 'تارگت 3R'], ['t3', 'تراکتینگ ATR 3'], ['t4', 'تراکتینگ ATR 4']].map(([v, t]) => `<option value="${v}" ${exitOf(own) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            </div>
          </div>
        </fieldset>
        <fieldset class="stack" style="gap:8px;border:0;padding:0;margin:0;min-width:0"><legend class="fine"><b>ارزها</b> <span id="coinCount"></span></legend>
          <div class="row" style="gap:6px;flex-wrap:wrap"><input class="inp" id="coinFind" placeholder="جستجوی ارز" aria-label="جستجوی ارز" style="flex:1;min-width:140px">
            <button class="btn sm" type="button" data-pick="10">۱۰ برتر</button><button class="btn sm" type="button" data-pick="20">۲۰ برتر</button><button class="btn sm" type="button" data-pick="all">همه</button><button class="btn sm" type="button" data-pick="tested">تست‌شده‌ها</button><button class="btn sm" type="button" data-pick="own">دارای قوانین اختصاصی</button><button class="btn sm" type="button" data-pick="0">پاک کردن</button></div>
          <div id="coinGrid" class="pick-grid">
            ${coins.map((c) => `<label class="fine pick" data-coin="${esc(c.symbol)}" data-name="${esc((c.name || '').toLowerCase())}"><input type="checkbox" value="${esc(c.symbol)}" ${chosen.has(c.symbol) ? 'checked' : knownVenue(c) === null ? 'disabled' : ''} ${noDataNow.includes(c.symbol) || knownVenue(c) === null ? 'data-nodata="1"' : ''}><b>${esc(c.symbol)}</b>${PER_COIN_RULES.rules[c.symbol] ? ' <small title="دارای قوانین اختصاصی روزانه">★</small>' : ''}<span data-venue>${venueTag(c)}</span></label>`).join('')}
          </div>
        </fieldset>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="testCfg">${icon('chart', 16)} تست تنظیمات</button><button class="btn primary">ذخیره تنظیمات</button></div>
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
        custom: { entryMode: f.entryMode.value, atrStop: +f.atrStop.value, rMultiple: exit[0] === 'r' ? +exit.slice(1) : 3, trailAtr: exit[0] === 't' ? +exit.slice(1) : null },
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
      $('#coinCount', m.el).textContent = `· ${next.universe.length} ارز انتخاب شده`;
      const warn = settingsWarnings({ ...cfg, ...next });
      $('#todoLive', m.el).innerHTML = `<div class="mt" style="border-top:1px solid var(--border);padding-top:8px">${yieldHtml({ ...cfg, ...next })}</div>
        ${warn.length ? `<ul class="fine" style="margin:8px 0 0;padding-left:18px">${warn.map((w) => `<li class="down">${esc(w)}</li>`).join('')}</ul>` : '<p class="fine up" style="margin:8px 0 0">تنظیمات فاقد هشدار هستند.</p>'}`;
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
      if (!syms.length) { out.innerHTML = '<p class="fine down">لطفاً حداقل یک ارز انتخاب کنید.</p>'; return; }
      out.innerHTML = `<p class="fine"><span class="spinner"></span> در حال تست تنظیمات روی ۱۰۰۰ کندل اخیر…</p>`;
      const by = {};
      await pool(syms, 4, async (sym) => {
        const coin = all.find((c) => c.symbol === sym);
        if (!coin) return;
        try { const r = await getCandles(coin, next.interval, 1000); if (r.source !== 'demo' && r.source !== 'coingecko' && !r.lowRes) by[sym] = r.candles.slice(0, -1); } catch {}
      });
      if (!m.el.isConnected) return;
      const rules = rulesForChart({ ...next, excluded: [] }, next.interval, load(LESSONS_KEY, []));
      const res = backtestSettings({ ...rules, perCoin: next.strategy !== 'custom' && !next.ownRulesOff && next.interval === PER_COIN_RULES.interval ? PER_COIN_RULES.rules : null }, by);
      if (!res.coins) { out.innerHTML = '<p class="fine down">داده کافی برای این ارزها وجود ندارد.</p>'; return; }
      const sign = (v) => pct(v, 2);
      out.innerHTML = `<div class="card" style="padding:12px"><b>نتیجه تست روی کندل‌های اخیر</b>
        <p class="fine" style="margin:6px 0 0">${res.coins} ارز، بازدهی: <b class="${res.ret >= 0 ? 'up' : 'down'}">${sign(res.ret)}</b> در برابر <b>${sign(res.hold)}</b> برای هولد کردن. ${res.trades} معامله بسته شد.</p></div>`;
    });
    refresh();

    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const next = read();
      if (!next.universe.length) { toast('لطفاً حداقل یک ارز انتخاب کنید.', 'down'); return; }
      const dropped = next.universe.slice(MAX_COINS);
      next.universe = next.universe.slice(0, MAX_COINS);
      const before = { ...cfg };
      Object.assign(cfg, next);
      save(CFG_KEY, cfg);
      m.close();
      const hasTrades = state && (Object.keys(state.open || {}).length || (state.closed || []).length);
      const chartChanged = state && state.interval !== cfg.interval;
      let msg = 'تنظیمات ذخیره شد.';
      if (state && hasTrades && chartChanged && f.switchNow?.checked) {
        const running = resetAccount();
        msg = `تنظیمات ذخیره شد. حساب جدید روی تایم‌فریم ${cfg.interval} شروع به کار کرد.`;
      } else if (state) {
        if (state.startingBalance !== cfg.startingBalance) {
          state = rescaleAccount(state, cfg.startingBalance);
          msg = `تنظیمات ذخیره شد. موجودی و معاملات مقیاس‌بندی شدند.`;
        }
      }
      toast(msg, 'up');
      draw();
      if (state && autoOn) catchUp();
    });
  });

  $('#resetBtn', el)?.addEventListener('click', () => {
    const m = modal(`<h3>بازنشانی حساب هوش مصنوعی؟</h3><p>این کار موجودی و تاریخچه معاملات را پاک کرده و از ${money(cfg.startingBalance)} روی تایم‌فریم ${cfg.interval} از نو آغاز می‌کند.</p>
      <div class="row mt" style="gap:8px"><button class="btn" id="no">انصراف</button><button class="btn primary" id="yes">بازنشانی</button></div>`);
    $('#no', m.el).addEventListener('click', m.close);
    $('#yes', m.el).addEventListener('click', () => {
      const wasRunning = resetAccount();
      m.close(); draw();
      toast(`حساب بازنشانی شد.`, 'info');
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
      startB.innerHTML = !state ? `${icon('bolt', 16)} شروع ترید بات`
        : autoOn ? `${icon('refresh', 16)} به‌روزرسانی`
        : `${icon('bolt', 16)} ${session.status === 'stopped' ? 'ادامه فعالیت' : 'شروع ترید بات'}`;
    }
  }

  $('#stopBtn', el)?.addEventListener('click', () => {
    applySession('STOP');
    draw();
    toast('هوش مصنوعی متوقف شد. موقعیت‌های باز همچنان فعال هستند.', 'info');
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
      Object.assign(cfg, { ...DEFAULT_CONFIG, ...Object.fromEntries(Object.entries(saved)) });
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
