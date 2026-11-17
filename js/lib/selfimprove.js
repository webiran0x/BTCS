// لایه پیش‌بینی خودبهبودده: دفتر کل پیش‌بینی محلی، پنجره‌های دقت غلتان،
// وزن‌های تطبیقی آنسمبل، ماشین حالت نشست (Session State Machine)، آنسمبل سه خانوادی،
// سنجشگر قدرت اندیکاتور، و بررسی‌های ریسک/ناهمواری.
//
// همه‌چیز در اینجا یک تابع خالص است — بدون localStorage، بدون window. ویوها
// دفتر کل را با store.js پایدار نگه می‌دارند و آن را بازگردانی می‌کنند. قوانین صداقت از
// سایر قسمت‌های برنامه همچنان اعمال می‌شوند: اعداد نمایش داده شده روی پیش‌بینی‌های حل‌شده‌ی
// خودِ همین دستگاه اندازه‌گیری می‌شوند (یا به وضوح به عنوان سابقه واک‌فوروارد منتشرشده مشخص می‌شوند)،
// هرگز ابداع نمی‌شوند و یک نمونه کوچک همیشه به عنوان نمونه کوچک برچسب‌گذاری می‌شود.

import { computeAll } from './indicators.js';
import { findPatterns, shownProbUp, TESTED_ACCURACY } from './predict.js';
import { THRESHOLDS } from './signals.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** زمانی که نحوه امتیازدهی نتایج تغییر می‌کند، این نسخه را افزایش دهید تا سطرهاي قدیمی مخلوط نشوند. */
export const MODEL_VERSION = 1;

/** پنجره‌های غلتانی که رابط کاربری منتشر می‌کند (N پیش‌بینی حل‌شده‌ی آخر). */
export const ACC_WINDOWS = [20, 50, 100];

/** حداکثر سطرهاي پیش‌بینی نگهداری‌شده. قدیمی‌ترین سطرهاي حل‌شده ابتدا حذف می‌شوند. */
export const LEDGER_CAP = 400;

// ---------------------------------------------------------------- دفتر کل (Ledger)
export function newLedger() {
  return { modelVersion: MODEL_VERSION, entries: [], createdAt: Date.now(), updatedAt: Date.now() };
}

/**
 * ثبت یک پیش‌بینی پیش از مشخص شدن نتیجه آن (روش صادقانه برای اندازه‌گیری نرخ موفقیت).
 * `horizonAt` زمان کندلی است که افق زمانی در آن تکمیل می‌شود.
 */
export function recordForecast(ledger, { symbol, interval, price, probUp, horizonBars, horizonAt, modelKey = 'ensemble', families = null }) {
  const base = ledger?.entries ? ledger : newLedger();
  if (!Number.isFinite(price) || !Number.isFinite(probUp) || !horizonAt) return base;
  const id = `${symbol}:${interval}:${horizonAt}:${modelKey}`;
  if (base.entries.some((e) => e.id === id)) return base;
  const entry = {
    id,
    t: Date.now(),
    symbol, interval, modelKey,
    price,
    probUp,
    direction: probUp >= 0.5 ? 'UP' : 'DOWN',
    horizonBars,
    horizonAt,
    resolved: false,
    actualUp: null,
    correct: null,
    outcomePrice: null,
    // آنچه هر مدل از بررسی متقابل سه خانوادی در همان لحظه گفته است،
    // تا هر کدام بتوانند روی سابقه خودشان ارزیابی شوند (به adaptiveWeights مراجعه کنید).
    families: cleanFamilies(families),
  };
  const entries = [...base.entries, entry];
  while (entries.length > LEDGER_CAP) {
    const firstResolved = entries.findIndex((e) => e.resolved);
    if (firstResolved === -1) { entries.shift(); break; }
    entries.splice(firstResolved, 1);
  }
  return { ...base, modelVersion: MODEL_VERSION, entries, updatedAt: Date.now() };
}

/**
 * حل‌وفصل پیش‌بینی‌هایی که افق آن‌ها سپری شده است، فقط با استفاده از قیمت‌های بسته‌ای که فراخواننده
 * از قبل روی صفحه دارد. فیلتر کردن بر اساس نماد + تایم‌فریم انجام می‌شود تا مسیر یک رمزارز هرگز
 * پیش‌بینی رمزارز دیگری را امتیازبندی نکند.
 */
export function resolveDueLedger(ledger, candles, { symbol = null, interval = null } = {}) {
  if (!ledger?.entries?.length || !candles?.length) return ledger ?? newLedger();
  const lastT = candles[candles.length - 1].t;
  let changed = false;
  const entries = ledger.entries.map((e) => {
    if (e.resolved || e.horizonAt > lastT) return e;
    if (symbol && e.symbol !== symbol) return e;
    if (interval && e.interval !== interval) return e;
    let close = null;
    for (let i = candles.length - 1; i >= 0; i--) {
      if (candles[i].t <= e.horizonAt) { close = candles[i].c; break; }
    }
    if (!Number.isFinite(close)) return e;
    const actualUp = close > e.price;
    changed = true;
    return {
      ...e,
      resolved: true,
      actualUp,
      correct: actualUp === (e.direction === 'UP'),
      outcomePrice: close,
    };
  });
  return changed ? { ...ledger, entries, updatedAt: Date.now() } : ledger;
}

// ---------------------------------------------------------------- اعتماد جهتی (Direction Trust)
const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** حداقل پیش‌بینی‌های ارزیابی‌شده مورد نیاز قبل از اینکه سابقه این دستگاه روی میزان اعتماد تأثیر بگذارد. */
export const MIN_GRADED_FOR_TRUST = 30;

/**
 * میزان اعتماد به تمایل جهتی در یک تایم‌فریم، که روی پیش‌بینی‌های ارزیابی‌شده‌ی خودِ
 * همین دستگاه مجدداً اندازه‌گیری می‌شود. مقدار محلی ضریب فشرده‌سازی s (۰ تا ۱) است که
 * بهترین توجیه را برای نتایج مشاهده شده ارائه می‌دهد؛ sigmoid(s * logit p)، که با حداکثر
 * درست‌نمایی روی یک شبکه به دست می‌آید؛ تساوی‌ها به سمت s کوچک‌تر می‌روند. این مقدار با تست انتشار
 * که به عنوان ۲۴۰ پیش‌بینی آن حساب می‌شود ترکیب می‌شود، بنابراین تعداد معدودی از پیش‌بینی‌های شانس‌محور
 * نمی‌توانند آن را به میزان زیادی جابه‌جا کنند. تایم‌فریمی که تست انتشار هیچ جهتی برای آن پیدا نکرده بود
 * روی ۰ باقی می‌ماند: نمونه یک دستگاه نمی‌تواند ۲۴۰ پیش‌بینی روی ۱۲ رمزارز را نقض کند.
 */
export function learnedTrust(ledger, interval) {
  const prior = TESTED_ACCURACY.directionTrust[interval] ?? 0;
  const priorN = TESTED_ACCURACY.testsPerInterval;
  const graded = (ledger?.entries ?? []).filter((e) => e.resolved && e.interval === interval
    && Number.isFinite(e.probUp) && typeof e.actualUp === 'boolean');
  if (graded.length < MIN_GRADED_FOR_TRUST) return { trust: prior, prior, local: null, graded: graded.length };
  const local = fitShrink(graded.map((e) => ({ p: e.probUp, up: e.actualUp }))).s;
  const trust = prior > 0 ? (prior * priorN + local * graded.length) / (priorN + graded.length) : 0;
  return { trust, prior, local, graded: graded.length };
}

/**
 * مقدار ضریب fشرده‌سازی s روی شبکه 0..1 که بهترین پیش‌بینی را برای نتایج ارزیابی‌شده {p, up} دارد،
 * و اینکه چقدر بهتر از s = 0 (یعنی عدم وجود جهت) تناسب برقرار می‌کند، به عنوان مثال لگاریتم درست‌نمایی (در nats).
 */
export function fitShrink(graded) {
  let s = 0, best = -Infinity, none = 0;
  for (let i = 0; i <= 20; i++) {
    const k = i / 20;
    let ll = 0;
    for (const g of graded) {
      const q = clamp(sigmoid(k * logit(clamp(g.p, 1e-6, 1 - 1e-6))), 1e-9, 1 - 1e-9);
      ll += Math.log(g.up ? q : 1 - q);
    }
    if (i === 0) none = ll;
    if (ll > best + 1e-9) { best = ll; s = k; }
  }
  return { s, gain: best - none };
}

// رمزارزها با هم حرکت می‌کنند، بنابراین پیش‌بینی‌های انجام‌شده روی یک کندل به یک مشاهده نزدیک‌ترند
// تا به دوازده مشاهده. بررسی زنده به جای سطرها، کندل‌ها را می‌شمارد و یک جهت باید بسیار بهتر از عدم وجود جهت
// بر اساس آن شمارش تناسب داشته باشد (حدود ۱ در ۱۰۰ شانس شانس‌محور) تا بتوان آن را اثبات‌شده نامید.
export const LIVE_PROOF_NATS = 3.3;

/**
 * آنچه سابقه ارزیابی‌شده سرور (سطرهاي signal_log) درباره جهت یک تایم‌فریم می‌گوید:
 * اعتمادی که بهترین تناسب را دارد، شواهد مربوط به آن به ازای هر کندل مستقل، و نرخ موفقیت
 * در برابر انتخاب همیشه رایج‌ترین نتیجه.
 */
export function liveDirectionCheck(rows, interval) {
  const graded = (rows || []).filter((r) => r.interval === interval && r.resolved && r.prob_up !== null
    && [r.prob_up, r.price, r.outcome_price].every((x) => Number.isFinite(+x)))
    .map((r) => ({ p: +r.prob_up, up: +r.outcome_price > +r.price, t: r.candle_time }));
  const n = graded.length;
  if (!n) return { interval, n: 0 };
  const candles = new Set(graded.map((g) => g.t)).size;
  const { s, gain } = fitShrink(graded);
  const hit = graded.filter((g) => (g.p >= 0.5) === g.up).length / n;
  const rose = graded.filter((g) => g.up).length / n;
  const baseline = Math.max(rose, 1 - rose);
  const evidence = (gain * candles) / n;
  return { interval, n, candles, s, gain, evidence, hit, baseline, proven: s > 0 && evidence >= LIVE_PROOF_NATS && hit > baseline };
}

/** اعتمادی که هر صفحه برای یک تایم‌فریم استفاده می‌کند: تست انتشار، تنظیم‌شده توسط سابقه این دستگاه. */
export function directionTrustFor(interval, ledger = loadLedger()) {
  return learnedTrust(ledger, interval);
}

// ---------------------------------------------------------------- دقت (Accuracy)
/** نرخ موفقیت در طول آخرین `window` پیش‌بینی حل‌شده روی این دستگاه. */
export function rollingAccuracy(ledger, window) {
  const done = (ledger?.entries ?? []).filter((e) => e.resolved && e.correct !== null).slice(-window);
  if (!done.length) return { window, total: 0, hits: 0, pct: null };
  const hits = done.filter((e) => e.correct).length;
  return { window, total: done.length, hits, pct: +((hits / done.length) * 100).toFixed(1) };
}

/** دقت پنجره روندی پس از هر سطر حل‌شده — سری نمودار اسپارک‌لاین (Sparkline). */
export function accuracySparkline(ledger, window = 20) {
  const done = (ledger?.entries ?? []).filter((e) => e.resolved && e.correct !== null);
  const pts = [];
  const q = [];
  let hits = 0;
  for (const e of done) {
    const v = e.correct ? 1 : 0;
    q.push(v); hits += v;
    if (q.length > window) hits -= q.shift();
    pts.push(+((hits / q.length) * 100).toFixed(1));
  }
  return pts;
}

/** صفت learningStatus().trend به زبان ساده: مقایسه ۲۰ تای آخر با ۵۰ تای آخر، که صرفاً با شانس تغییر می‌کند. */
export const TREND_WORDS = { improving: '20 تای آخر بهتر', stable: 'پایدار', declining: '20 تای آخر بدتر', 'warming-up': 'در حال گرم شدن', unknown: 'تعداد خیلی کم' };

/** پنجره‌های غلتان 20/50/100 + روند، مجموع‌ها و نسخه مدل. */
export function learningStatus(ledger) {
  const entries = ledger?.entries ?? [];
  const resolved = entries.filter((e) => e.resolved);
  const windows = {};
  for (const w of ACC_WINDOWS) windows[w] = rollingAccuracy(ledger, w);
  const a20 = windows[20].pct;
  const a50 = windows[50].pct;
  let trend = 'unknown';
  if (resolved.length < 10) trend = 'warming-up';
  else if (a20 !== null && a50 !== null) {
    if (a20 > a50 + 3) trend = 'improving';
    else if (a20 < a50 - 3) trend = 'declining';
    else trend = 'stable';
  }
  return {
    modelVersion: ledger?.modelVersion ?? MODEL_VERSION,
    total: entries.length,
    resolved: resolved.length,
    pending: entries.length - resolved.length,
    windows,
    trend,
    updatedAt: ledger?.updatedAt ?? null,
  };
}

/**
 * فشرده‌سازی احتمال بیش‌ازحد مطمئن به سمت 0.5 زمانی که سابقه اخیر خودِ این دستگاه
 * نشان می‌دهد اعتماد به دست نیامده است. وقتی نمونه خیلی کوچک است یا سابقه خوب است، عدد را دست‌نخورده رها می‌کند.
 */
export function dampenConfidence(probUp, ledger) {
  const st = learningStatus(ledger);
  const acc = st.windows[50].pct ?? st.windows[20].pct;
  if (acc === null || st.resolved < 15) return probUp;
  if (acc >= 55) return probUp;
  const shrink = acc < 40 ? 0.5 : 0.75;
  return 0.5 + (probUp - 0.5) * shrink;
}

export const FAMILY_KEYS = ['momentum', 'reversion', 'pattern'];
/** فراخوانی‌های ارزیابی‌شده‌ای که یک مدل روی این دستگاه نیاز دارد تا سابقه آن وزن‌اش را تغییر دهد. */
export const MIN_FAMILY_CALLS = 20;

function cleanFamilies(f) {
  if (!f || typeof f !== 'object') return null;
  const out = {};
  for (const k of [...FAMILY_KEYS, 'blend']) if (Number.isFinite(f[k]) && f[k] >= 0 && f[k] <= 1) out[k] = +f[k].toFixed(4);
  return Object.keys(out).length ? out : null;
}

/**
 * سابقه خودِ هر مدل روی این دستگاه: چند بار تمایل آن (بالا یا پایین 50%) با عملکرد قیمت مطابقت داشته است،
 * در طول آخرین `window` پیش‌بینی‌های ارزیابی‌شده‌ای که حاوی فراخوانی‌های مدل‌ها هستند. فراخوانی با فاصله کمتر از نیم درصد از 50% فراخوانی محسوب نمی‌شود.
 */
export function familyRecord(ledger, window = 150) {
  const rows = (ledger?.entries ?? []).filter((e) => e.resolved && e.families && typeof e.actualUp === 'boolean').slice(-window);
  const out = {};
  for (const k of [...FAMILY_KEYS, 'blend']) {
    let n = 0, hits = 0;
    for (const e of rows) {
      const p = e.families[k];
      if (!Number.isFinite(p) || Math.abs(p - 0.5) < 0.005) continue;
      n++;
      if ((p > 0.5) === e.actualUp) hits++;
    }
    out[k] = { n, hits, rate: n ? hits / n : null };
  }
  return out;
}

/**
 * وزن‌های بررسی متقابل سه مدلی، که از روی سابقه خودِ هر مدل روی این دستگاه یاد گرفته شده‌اند.
 * این وزن‌ها قبلاً از نرخ موفقیت پیش‌بینی اصلی پیروی می‌کردند (زیر 40% روی بازگشت به میانگین تکیه می‌کرد، بالای 60% روی مومنتوم)،
 * که هیچ چیزی درباره اینکه کدام‌یک از این سه مدل کار می‌کند نمی‌گوید. اکنون مدلی که 60% اوقات درست می‌گوید به سمت وزن دوبرابر
 * و مدلی که 40% درست می‌گوید به سمت یک‌چهارم وزن هدایت می‌شود، و در حالی که نمونه‌اش کوچک است به سمت وزن‌های مساوی فشرده می‌شود؛
 * تا زمانی که مدل MIN_FAMILY_CALLS فراخوانی ارزیابی‌شده داشته باشد، وزن ۱ را حفظ می‌کند.
 */
export function adaptiveWeights(ledger) {
  const record = familyRecord(ledger);
  const w = { momentum: 1, reversion: 1, pattern: 1 };
  const graded = Math.max(...FAMILY_KEYS.map((k) => record[k].n));
  if (graded < MIN_FAMILY_CALLS) return { ...w, source: 'default', record, graded };
  for (const k of FAMILY_KEYS) {
    const r = record[k];
    if (r.n < MIN_FAMILY_CALLS) continue;
    const edge = (r.rate - 0.5) / 0.1;
    const raw = clamp(1 + edge * (edge >= 0 ? 1 : 0.75), 0.25, 2);
    w[k] = +(1 + (raw - 1) * (r.n / (r.n + 50))).toFixed(3);
  }
  return { ...w, source: 'adaptive', record, graded };
}

// ---------------------------------------------------------------- آنسمبل ۳ مدلی
/**
 * سه خانواده مستقل، ترکیب‌شده با وزن‌های سازگار با دفتر کل:
 *   momentum   — پشته EMA + MACD (ادامه روند)
 *   reversion  — RSI + حد باندهای بولینگر (مخالف روند)
 *   pattern    — الگوهای تطبیقی چارت تاریخی
 *
 * به عنوان یک بررسی متقابل آزمایشی در کنار موتور اصلی ۷ مدلی نمایش داده می‌شود.
 * این بخش بخشی از دقت واک‌فوروارد منتشرشده نیست — این موضوع را در رابط کاربری ذکر کنید.
 */
export function threeModelEnsemble(candles, { ledger = null, horizon = 12, window = 40 } = {}) {
  if (!candles || candles.length < 100) return { ok: false, reason: 'حداقل به ۱۰۰ کندل برای آنسمبل سه خانوادی نیاز است.' };
  const ind = computeAll(candles);
  const n = candles.length - 1;
  const close = candles[n].c;

  // مومنتوم
  let momentum = 0.5;
  const e20 = ind.ema20[n], e50 = ind.ema50[n], e200 = ind.ema200[n];
  const hist = ind.macd.hist[n];
  if (e20 !== null && e50 !== null) momentum += e20 > e50 ? 0.12 : -0.12;
  if (e200 !== null) momentum += close > e200 ? 0.08 : -0.08;
  if (hist !== null && ind.atr[n]) momentum += clamp(hist / (ind.atr[n] * 4), -0.15, 0.15);
  momentum = clamp(momentum, 0.05, 0.95);

  // بازگشت به میانگین
  let reversion = 0.5;
  const r = ind.rsi[n];
  if (r !== null) reversion = clamp(0.5 + (50 - r) / 100, 0.05, 0.95);
  if (ind.bb.upper[n] !== null && ind.bb.lower[n] !== null) {
    if (close < ind.bb.lower[n]) reversion = clamp(reversion + 0.12, 0.05, 0.95);
    else if (close > ind.bb.upper[n]) reversion = clamp(reversion - 0.12, 0.05, 0.95);
  }

  // الگوهای تطبیقی
  const pat = findPatterns(candles, n, { window, horizon, topK: 8, minCorr: 0.5 });
  const pattern = pat.matches?.length >= 3 ? clamp(pat.probUp, 0.05, 0.95) : 0.5;

  const w = adaptiveWeights(ledger);
  const probs = { momentum, reversion, pattern };
  const keys = ['momentum', 'reversion', 'pattern'];
  let sum = 0, wsum = 0;
  for (const k of keys) { sum += probs[k] * w[k]; wsum += w[k]; }
  const raw = wsum ? sum / wsum : 0.5;
  // فشرده‌شده بر اساس سابقه خودِ ترکیب (blend) روی این دستگاه (که برای پیش‌بینی اصلی بود):
  // زیر 55% صحیح در بیش از 15+ فراخوانی، تمایل آن به سمت 50% فشرده می‌شود.
  const blendRec = w.record?.blend;
  const blendAcc = blendRec && blendRec.n >= 15 ? blendRec.rate * 100 : null;
  const probUp = blendAcc === null || blendAcc >= 55 ? raw : 0.5 + (raw - 0.5) * (blendAcc < 40 ? 0.5 : 0.75);

  return {
    ok: true,
    probUp,
    direction: probUp >= 0.54 ? 'UP' : probUp <= 0.46 ? 'DOWN' : 'SIDEWAYS',
    weights: w,
    models: keys.map((k) => ({
      key: k,
      name: k === 'momentum' ? 'مومنتوم (EMA/MACD)' : k === 'reversion' ? 'بازگشت به میانگین (RSI/BB)' : 'الگوهای تطبیقی',
      probUp: probs[k],
      weight: w[k],
      weightPct: Math.round((w[k] / wsum) * 100),
    })),
    patternMatches: pat.matches?.length ?? 0,
    dampened: Math.abs(probUp - raw) > 1e-9,
    blendAccuracy: blendAcc,
    rawProbUp: raw,
    experimental: true,
  };
}

// ---------------------------------------------------------------- سنجشگر سیگنال
/**
 * سنجشگر قدرت مختص رابط کاربری برای امتیاز توافق اندیکاتور: مقیاس مرسومِ خرید قوی ← فروش قوی که خوانندگان انتظار دارند.
 * این بخش عمداً از labelFor() / tradeSummary() جدا است، که توصیف می‌کنند چه چیزی اندازه‌گیری شده است
 * (امتیازهای بالاتر احتمال کمتری برای صعود داشتند) و هرگز نباید دستوری صادر کنند.
 * هر جا هر دو نمایش داده می‌شوند، سنجشگر را با upRateFor() جفت کنید.
 */
export function signalMeter(score) {
  const s = clamp(Number.isFinite(score) ? score : 0, -100, 100);
  const pos = (s + 100) / 2; // درصد در طول مسیر، 0 = فروش قوی، 100 = خرید قوی
  let label, tone;
  // کلمات مومنتوم، نه دستورات: در عمل، بالاترین امتیازها کمترین احتمال
  // را برای ادامه صعود داشتند (به SCORE_BUCKETS_TESTED مراجعه کنید)، بنابراین «خرید قوی» دقیقاً عکس داده‌ها را می‌گفت.
  if (s >= THRESHOLDS.strong) { label = 'صعود شدید'; tone = 'up'; }
  else if (s >= THRESHOLDS.normal) { label = 'صعودی'; tone = 'up'; }
  else if (s <= -THRESHOLDS.strong) { label = 'سقوط شدید'; tone = 'down'; }
  else if (s <= -THRESHOLDS.normal) { label = 'نزولی'; tone = 'down'; }
  else { label = 'تخت / خنثی'; tone = 'flat'; }
  return { score: s, pos, label, tone };
}

// ---------------------------------------------------------------- ریسک و ناهنجاری‌ها
/** کندل‌های غیرعادی روی چارت فعلی روی صفحه: حجم، محدوده، حد تفکیک‌های RSI. */
export function anomalyFlags(candles) {
  const out = [];
  if (!candles || candles.length < 40) return out;
  const ind = computeAll(candles);
  const n = candles.length - 1;
  const vs = ind.volSma[n];
  if (vs && candles[n].v > vs * 3) {
    out.push({ key: 'volume', level: 'warn', text: `حجم معاملات ${(candles[n].v / vs).toFixed(1)} برابر میانگین آن است — یک جهش غیرعادی روی این چارت.` });
  }
  const a = ind.atr[n];
  if (a && n > 0) {
    const move = Math.abs(candles[n].c - candles[n - 1].c);
    if (move > 3 * a) out.push({ key: 'move', level: 'down', text: `قیمت در یک کندل ${(move / a).toFixed(1)} ATR حرکت کرده است — یک پرش غیرعادی. با هر سیگنالی در اینجا با احتیاط مضاعف برخورد کنید.` });
  }
  const r = ind.rsi[n];
  if (r !== null && (r >= 80 || r <= 20)) {
    out.push({ key: 'rsi', level: 'warn', text: `شاخص RSI روی عدد ${r.toFixed(0)} در محدوده حدی قرار دارد — ریسک بازگشت به میانگین بالا است.` });
  }
  return out;
}

/**
 * هشداردهنده‌های ریسک با زبان ساده که از اطلاعات موجود روی صفحه گردآوری شده‌اند.
 * هر خط به عددی گره خورده است که خواننده می‌تواند ببیند؛ هیچ‌چیز ابداع نشده است.
 */
export function riskWarnings({ signal = null, forecast = null, backtest = null, anomalies = [], interval = null, noEdgeTimeframe = false, noEdgeText = null, trust = undefined } = {}) {
  const out = [];
  for (const a of anomalies) out.push({ key: `anomaly:${a.key}`, level: a.level || 'warn', text: a.text });

  if (signal?.plan && signal.plan.expectancyR !== null && signal.plan.expectancyR !== undefined && signal.plan.expectancyR <= 0) {
    out.push({
      key: 'geometry',
      level: 'warn',
      text: `هندسه حد ضرر/هدف روی تایم‌فریم ${interval || 'این'} روی ${signal.plan.expectancyR}R به ازای هر معامله تست شده است — ${signal.plan.expectancyR > -0.05 ? 'تقریباً سر به سر' : 'منفی'} قبل از کسر کارمزد. برنامه را به عنوان ساختار بخوانید، نه به عنوان یک مزیت.`,
    });
  }
  if (noEdgeTimeframe) {
    out.push({
      key: 'no-edge',
      level: 'down',
      text: noEdgeText || `موتور پیش‌بینی هیچ مزیت اندازه‌گیری‌شده‌ای روی چارت ${interval} ندارد (در نرخ پایه یا کمتر از آن). احتمالی که در اینجا نمایش داده می‌شود پس‌زمینه است، نه دلیلی برای اقدام.`,
    });
  }
  // بک‌تستی که زیان‌ده بوده و ضعیف‌تر از نگهداری دارایی (Buy & Hold) عمل کرده است.
  if (backtest?.ok && backtest.totalReturnPct < 0 && backtest.totalReturnPct < backtest.buyHoldPct && backtest.tradeCount >= 10) {
    out.push({
      key: 'backtest',
      level: 'down',
      text: `بک‌تست در طول ${backtest.tradeCount} معامله ${Math.abs(backtest.totalReturnPct).toFixed(1)}% ضرر داده در حالی که صرفِ نگهداری ${backtest.buyHoldPct >= 0 ? `سود ${backtest.buyHoldPct.toFixed(1)}% داشته است` : `تنها ${Math.abs(backtest.buyHoldPct).toFixed(1)}% ضرر کرده است`}.`,
    });
  }
  if (forecast?.ok && forecast.confidence === 'Low') {
    out.push({ key: 'low-conf', level: 'warn', text: 'اطمینان پیش‌بینی پایین است — مدل‌ها به سختی توافق دارند یا دقت اخیر ضعیف است. حجم را کاهش دهید یا صبر کنید.' });
  }
  if (signal?.ok && Math.abs(signal.score) >= THRESHOLDS.strong && forecast?.ok) {
    const leanUp = signal.score > 0;
    const shown = shownProbUp(forecast.probUp, interval, trust);
    const fcLeanUp = shown >= 0.54;
    const fcLeanDown = shown <= 0.46;
    if ((leanUp && fcLeanDown) || (!leanUp && fcLeanUp)) {
      out.push({ key: 'conflict', level: 'warn', text: 'خوانش چارت و پیش‌بینی به سمت‌های مخالف تمایل دارند — تضاد دلیلی برای صبر کردن است، نه انتخاب یک سمت.' });
    }
  }
  return out;
}

// ---------------------------------------------------------------- ماشین حالت نشست (Session Machine)
export const SESSION_STATES = ['idle', 'running', 'stopped'];

export function initialSession(status = 'idle') {
  return { status: SESSION_STATES.includes(status) ? status : 'idle', since: Date.now(), resets: 0 };
}

/**
 * idle → running → stopped → running، و RESET از هر حالتی به idle.
 * وقتی رویداد بدون تغییر است همان شیء را برمی‌گرداند تا فراخوانندگان بتوانند ذخیره‌سازی را رد کنند.
 */
export function sessionReducer(sess, event) {
  const cur = sess?.status ?? 'idle';
  if (event === 'RESET') {
    return { status: 'idle', since: Date.now(), resets: (sess?.resets ?? 0) + 1 };
  }
  if (event === 'START') {
    if (cur === 'running') return sess;
    return { ...(sess ?? initialSession()), status: 'running', since: Date.now() };
  }
  if (event === 'STOP') {
    if (cur !== 'running') return sess;
    return { ...(sess ?? initialSession()), status: 'stopped', since: Date.now() };
  }
  return sess ?? initialSession();
}

export function sessionLabel(status) {
  if (status === 'running') return 'هوش مصنوعی در حال اجراست';
  if (status === 'stopped') return 'هوش مصنوعی متوقف شد';
  return 'بیکار (Idle)';
}

/**
 * دو نسخه از سابقه یک حساب، از دو دستگاه، به عنوان یک واحد: هر پیش‌بینی یا حفظ می‌شود،
 * یا نسخه‌ای که در آن یکی ارزیابی شده باشد. نتیجه صرف نظر از اینکه کدام سمت اول ارسال شود یکسان است،
 * بنابراین دستگاه‌ها روی یک سابقه توافق می‌کنند.
 */
export function mergeLedgers(a, b) {
  const A = a?.entries ? a : newLedger(), B = b?.entries ? b : newLedger();
  const byId = new Map();
  const better = (x, y) => (x.resolved !== y.resolved ? x.resolved : x.t !== y.t ? x.t < y.t : JSON.stringify(x) < JSON.stringify(y));
  for (const e of [...A.entries, ...B.entries]) {
    const prev = byId.get(e.id);
    if (!prev || better(e, prev)) byId.set(e.id, e);
  }
  const entries = [...byId.values()].sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  while (entries.length > LEDGER_CAP) {
    const i = entries.findIndex((e) => e.resolved);
    entries.splice(i < 0 ? 0 : i, 1);
  }
  return {
    modelVersion: MODEL_VERSION, entries,
    createdAt: Math.min(A.createdAt || Infinity, B.createdAt || Infinity),
    updatedAt: Math.max(A.updatedAt || 0, B.updatedAt || 0),
  };
}

// ---------------------------------------------------------------- کمکی‌های پایدارسازی
const LEDGER_KEY = 'aiLedger';

export const LEARN_KEY = LEDGER_KEY;

export function loadLedger(fallback = null) {
  try {
    if (typeof localStorage === 'undefined') return fallback ?? newLedger();
    const raw = localStorage.getItem(`cv:${LEDGER_KEY}`);
    if (raw === null) return fallback ?? newLedger();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) return fallback ?? newLedger();
    return { ...newLedger(), ...parsed };
  } catch {
    return fallback ?? newLedger();
  }
}

export function saveLedger(ledger) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(`cv:${LEDGER_KEY}`, JSON.stringify(ledger));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cv:store', { detail: { key: LEDGER_KEY } }));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- نمودار اسپارک‌لاین
/** SVG درون‌خطی کوچک برای روند دقت. رشته خالی هنگامی که داده‌ای وجود ندارد. */
export function sparklineSvg(values, { width = 120, height = 28, color = 'currentColor' } = {}) {
  if (!values?.length) return '';
  const min = Math.min(...values, 50);
  const max = Math.max(...values, 50);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? width : (i / (values.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/></svg>`;
}