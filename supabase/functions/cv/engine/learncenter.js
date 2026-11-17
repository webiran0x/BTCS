// مرکز یادگیری هوش مصنوعی: مکانی که در آن برنامه از فراخوان‌های خود یاد می‌گیرد.
//
// سه مورد در مقایسه با عملکرد واقعی بازار امتیازدهی می‌شوند:
//   ۱. خوانش هر اندیکاتور (اشباع فروش RSI → انتظار صعود، ابر فوق‌العاده نزولی →
//      انتظار نزول، …)،
//   ۲. جهت پیش‌بینی موتور پیش‌بینی،
//   ۳. «ترکیب یادگرفته‌شده» که پیش‌بینی را تنها با آن دسته از اندیکاتورهایی ترکیب می‌کند
//      که اعتبار خود را روی این دستگاه اثبات کرده‌اند.
// وزن‌های این ترکیب از امتیازها به دست می‌آیند، بنابراین سیستم با دریافت شواهد،
// تصمیمات خود را تغییر می‌دهد — و خود این سیستم نیز امتیازدهی می‌شود، بنابراین اگر یادگیری
// کمکی نکند، صفحه آن را اعلام می‌کند.
//
// قوانین صداقت: هر نرخ با اندازه نمونه و بازه ۹۵٪ آن ارائه می‌شود؛ یک
// خوانش تنها زمانی حق رأی دریافت می‌کند که بازه مذکور به وضوح بالاتر (یا پایین‌تر) از
// احتمال یک پرتاب سکه باشد؛ هیچ‌چیز در اینجا گرد یا ابداع نمی‌شود. اعداد «سابقه اخیر»
// همین حالا روی کندل‌های گذشته اندازه‌گیری می‌شوند؛ اعداد «زنده» فراخوان‌هایی هستند که این
// دستگاه پیش از مشخص شدن نتیجه ثبت کرده است.

import { computeAll } from './indicators.js';

export const LEARN_VERSION = 1;
const CAP = 2000;          // حداکثر رکوردهای نگهداری‌شده روی دستگاه (حافظه محلی کوچک است)
const MIN_N = 30;          // حداقل تعداد فراخوان پیش از اینکه یک خوانش حق رأی کسب کند

/** نام‌های انسانی و معنای هر رأی برای صفحه. */
export const INDICATORS = {
  rsi: { name: 'RSI(14) extremes', rule: 'زیر ۳۰ → صعود · بالای ۷۰ → نزول' },
  macd: { name: 'MACD histogram', rule: 'بالای صفر → صعود · پایین صفر → نزول' },
  ema200: { name: 'Price vs 200 EMA', rule: 'بالا → صعود · پایین → نزول' },
  emaCross: { name: 'EMA 20 vs 50', rule: 'میانگین ۲۰ بالای ۵۰ → صعود · پایین‌تر → نزول' },
  supertrend: { name: 'Supertrend', rule: 'روند صعودی → صعود · نزولی → نزول' },
  stoch: { name: 'Stochastic RSI', rule: 'K زیر ۲۰ → صعود · بالای ۸۰ → نزول' },
  mfi: { name: 'Money Flow Index', rule: 'زیر ۲۰ → صعود · بالای ۸۰ → نزول' },
  cci: { name: 'CCI(20)', rule: 'زیر ۱۰۰- → صعود · بالای ۱۰۰ → نزول' },
  willr: { name: 'Williams %R', rule: 'زیر ۸۰- → صعود · بالای ۲۰- → نزول' },
  bollinger: { name: 'Bollinger bands', rule: 'قیمت بسته شده زیر باند پایینی → صعود · بالای بالایی → نزول' },
  donchian: { name: 'Donchian breakout', rule: 'سقف جدید ۲۰ کندلی → صعود · کف جدید → نزول' },
  adx: { name: 'ADX + DI (فقط در حال روند)', rule: 'ADX بالای ۲۵: پیشتازی DI+ → صعود · پیشتازی DI- → نزول' },
};

/** رأی هر اندیکاتور در کندل i: مثبت ۱ انتظار صعود، منفی ۱ انتظار نزول، صفر بدون رأی. */
export function indicatorVotes(candles, ind, i) {
  const c = candles[i]?.c;
  const v = {};
  const n = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : x);
  const r = n(ind.rsi[i]); v.rsi = r === null ? 0 : r < 30 ? 1 : r > 70 ? -1 : 0;
  const h = n(ind.macd.hist[i]); v.macd = h === null ? 0 : Math.sign(h);
  const e200 = n(ind.ema200[i]); v.ema200 = e200 === null ? 0 : c > e200 ? 1 : -1;
  const e20 = n(ind.ema20[i]), e50 = n(ind.ema50[i]); v.emaCross = e20 === null || e50 === null ? 0 : e20 > e50 ? 1 : -1;
  v.supertrend = ind.supertrend?.dir[i] ?? 0;
  const k = n(ind.stoch.k[i]); v.stoch = k === null ? 0 : k < 20 ? 1 : k > 80 ? -1 : 0;
  const m = n(ind.mfi?.[i]); v.mfi = m === null ? 0 : m < 20 ? 1 : m > 80 ? -1 : 0;
  const cc = n(ind.cci?.[i]); v.cci = cc === null ? 0 : cc < -100 ? 1 : cc > 100 ? -1 : 0;
  const w = n(ind.willr?.[i]); v.willr = w === null ? 0 : w < -80 ? 1 : w > -20 ? -1 : 0;
  const bu = n(ind.bb.upper[i]), bl = n(ind.bb.lower[i]); v.bollinger = bu === null ? 0 : c < bl ? 1 : c > bu ? -1 : 0;
  const du = n(ind.donchian?.upper[i - 1]), dl = n(ind.donchian?.lower[i - 1]); v.donchian = du === null ? 0 : c > du ? 1 : c < dl ? -1 : 0;
  const a = n(ind.adx.adx[i]), pd = n(ind.adx.plusDI[i]), md = n(ind.adx.minusDI[i]);
  v.adx = a === null || a < 25 || pd === null ? 0 : pd > md ? 1 : -1;
  return v;
}

/** بازه ویلسون ۹۵٪ برای نرخ برد. */
export function wilson(hits, n) {
  if (!n) return [0, 1];
  const z = 1.96, p = hits / n, d = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

function summarise(hits, n) {
  const [lo, hi] = wilson(hits, n);
  const rate = n ? hits / n : null;
  // یک خوانش تنها زمانی حق رأی می‌گیرد که تعداد فراخوان‌ها کافی AND بازه ۹۵٪ آن کاملاً دور از ۵۰٪ باشد.
  const verdict = n < MIN_N ? 'تعداد فراخوان ناکافی' : lo > 0.5 ? 'درست در بیشتر اوقات' : hi < 0.5 ? 'نادرست در بیشتر اوقات' : 'عملکردی نه بهتر از پرتاب سکه';
  const weight = n >= MIN_N && (lo > 0.5 || hi < 0.5) ? +(((rate - 0.5) * 4)).toFixed(3) : 0; // خوانش‌های اشتباه وزن منفی می‌گیرند: فراخوان آن‌ها معکوس خوانده می‌شود
  return { n, hits, rate: rate === null ? null : +(rate * 100).toFixed(1), lo: +(lo * 100).toFixed(1), hi: +(hi * 100).toFixed(1), verdict, weight };
}

/**
 * اندازه‌گیری هر اندیکاتور روی کندل‌های گذشته در حال حاضر: برای هر کندل، آیا
 * جهت خوانش با قیمت بسته شده در `horizon` کندل بعد مطابقت داشته است؟
 */
export function measureOnHistory(candles, horizon) {
  if (!candles || candles.length < 260) return null;
  const ind = computeAll(candles);
  const tally = {};
  for (const key of Object.keys(INDICATORS)) tally[key] = { hits: 0, n: 0 };
  // فراخوان‌ها هرگز همپوشانی ندارند: با پنجره‌های نیمه‌همپوشان، یک حرکت دو بار شمرده می‌شود،
  // بازه ۹۵٪ بیش از حد باریک می‌شود و نویز خالص حق رأی کسب می‌کند.
  const step = Math.max(1, horizon);
  for (let i = 210; i < candles.length - horizon; i += step) {
    const up = candles[i + horizon].c > candles[i].c ? 1 : -1;
    const votes = indicatorVotes(candles, ind, i);
    for (const [k, v] of Object.entries(votes)) if (v) { tally[k].n++; if (v === up) tally[k].hits++; }
  }
  return Object.fromEntries(Object.entries(tally).map(([k, t]) => [k, summarise(t.hits, t.n)]));
}

/** ادغام اندازه‌گیری‌های تاریخچه چند ارز در یک جدول واحد. */
export function mergeMeasures(list) {
  const t = {};
  for (const m of list.filter(Boolean)) for (const [k, s] of Object.entries(m)) { (t[k] ||= { hits: 0, n: 0 }); t[k].hits += s.hits; t[k].n += s.n; }
  return Object.fromEntries(Object.entries(t).map(([k, x]) => [k, summarise(x.hits, x.n)]));
}

// ---------------------------------------------------------------- دفتر کل زنده
export function newLearnLedger() { return { v: LEARN_VERSION, rows: [], changes: [], weights: {}, createdAt: Date.now() }; }

/** ثبت فراخوان‌های این کندل پیش از مشخص شدن نتیجه. یک سطر به ازای هر ارز/تایم‌فریم/کندل. */
export function recordCalls(ledger, { symbol, interval, t, price, horizonAt, votes, forecastProb = null, blendProb = null }) {
  const L = ledger?.rows ? ledger : newLearnLedger();
  const id = `${symbol}:${interval}:${t}`;
  if (L.rows.some((r) => r.id === id)) return L;
  const rows = [...L.rows, { id, symbol, interval, t, price, horizonAt, votes, forecastProb, blendProb, resolved: false, up: null }];
  while (rows.length > CAP) { const j = rows.findIndex((r) => r.resolved); rows.splice(j < 0 ? 0 : j, 1); }
  return { ...L, rows };
}

/** امتیازدهی به سطرهایی که افق زمانی آن‌ها گذشته است، با استفاده از قیمت‌های بسته‌شده در اختیار فراخوان‌کننده. */
export function resolveCalls(ledger, candles, { symbol, interval }) {
  if (!ledger?.rows?.length || !candles?.length) return ledger;
  const lastT = candles[candles.length - 1].t;
  let changed = false;
  const rows = ledger.rows.map((r) => {
    if (r.resolved || r.symbol !== symbol || r.interval !== interval || r.horizonAt > lastT) return r;
    let close = null;
    for (let i = candles.length - 1; i >= 0; i--) if (candles[i].t <= r.horizonAt) { close = candles[i].c; break; }
    if (!Number.isFinite(close)) return r;
    changed = true;
    return { ...r, resolved: true, up: close > r.price ? 1 : -1, outcome: close };
  });
  return changed ? { ...ledger, rows } : ledger;
}

/** امتیازهای زنده روی این دستگاه: هر اندیکاتور، پیش‌بینی، و ترکیب یادگرفته‌شده. */
export function liveScores(ledger, interval = null) {
  const tally = { forecast: { hits: 0, n: 0 }, blend: { hits: 0, n: 0 } };
  for (const key of Object.keys(INDICATORS)) tally[key] = { hits: 0, n: 0 };
  for (const r of ledger?.rows || []) {
    if (!r.resolved || (interval && r.interval !== interval)) continue;
    for (const [k, v] of Object.entries(r.votes || {})) if (v && tally[k]) { tally[k].n++; if (v === r.up) tally[k].hits++; }
    if (Number.isFinite(r.forecastProb) && r.forecastProb !== 0.5) { tally.forecast.n++; if ((r.forecastProb > 0.5 ? 1 : -1) === r.up) tally.forecast.hits++; }
    if (Number.isFinite(r.blendProb) && r.blendProb !== 0.5) { tally.blend.n++; if ((r.blendProb > 0.5 ? 1 : -1) === r.up) tally.blend.hits++; }
  }
  return Object.fromEntries(Object.entries(tally).map(([k, t]) => [k, summarise(t.hits, t.n)]));
}

/**
 * وزن‌هایی که ترکیب از آن‌ها استفاده می‌کند. شواهد زنده روی این دستگاه با جمع‌آوری داده‌ها،
 * جایگزین اندازه‌گیری تاریخچه می‌شوند (هرکدام بر اساس اندازه نمونه خود وزن‌دهی می‌شوند)؛
 * خوانشی که سابقه روشنی نداشته باشد وزن صفر می‌گیرد.
 */
export function learnedWeights(history, live) {
  const w = {};
  for (const k of Object.keys(INDICATORS)) {
    const h = history?.[k], l = live?.[k];
    const hn = h?.weight ? h.n : 0, ln = l?.weight ? l.n : 0;
    w[k] = hn + ln ? +(((h?.weight || 0) * hn + (l?.weight || 0) * ln) / (hn + ln)).toFixed(3) : 0;
  }
  return w;
}

/** ترکیب پیش‌بینی با اندیکاتورهایی که حق رأی کسب کرده‌اند. بازگرداندن P(up) (احتمال صعود). */
export function blend(forecastProb, votes, weights) {
  let s = Number.isFinite(forecastProb) ? (forecastProb - 0.5) * 2 : 0;
  let wsum = Number.isFinite(forecastProb) ? 1 : 0;
  for (const [k, v] of Object.entries(votes || {})) { const w = weights?.[k] || 0; if (v && w) { s += v * w; wsum += Math.abs(w); } }
  if (!wsum) return 0.5;
  return Math.min(0.95, Math.max(0.05, 0.5 + (s / Math.max(wsum, 1)) / 2));
}

/** یادداشت تغییرات ایجادشده در وزن‌ها، تا صفحه بتواند روند تصمیم‌گیری سیستم را نمایش دهد. */
export function diffWeights(before = {}, after = {}) {
  const out = [];
  for (const k of Object.keys(INDICATORS)) {
    const a = before[k] || 0, b = after[k] || 0;
    if (!a && b) out.push(`${INDICATORS[k].name} حق رأی کسب کرد (وزن ${b > 0 ? '+' : ''}${b})${b < 0 ? ' — عملکرد این اندیکاتور بیشتر نادرست بوده تا درست، بنابراین سیگنال آن اکنون به طور معکوس خوانده می‌شود' : ''}`);
    else if (a && !b) out.push(`${INDICATORS[k].name} حق رأی خود را از دست داد — سابقه آن به محدوده پرتاب سکه بازگشت`);
    else if (a && b && Math.abs(a - b) >= 0.1) out.push(`وزن ${INDICATORS[k].name} از ${a > 0 ? '+' : ''}${a} به ${b > 0 ? '+' : ''}${b} تغییر کرد`);
  }
  return out;
}

// ---------------------------------------------------------------- قهرمان / رقیب (champion / challenger)
/**
 * ترکیب به صورت گام‌به‌گام (Walk-forward) تست شده است (در tools/evaluate-learning.mjs، روی همان
 * پیش‌بینی‌های آخرین بازبینی پیش‌بینی، با وزن‌هایی که صرفاً از کندل‌های
 * پیش از هر پیش‌بینی یاد گرفته شده‌اند). تاریخ 2026-09-26، تعداد ۱,۴۴۰ پیش‌بینی روی ۱۲ ارز:
 * مساوی با پیش‌بینی ساده (هرکدام ۵۳.۹٪). تاریخ 2026-10-15، تعداد ۵,۷۱۰ پیش‌بینی روی ۱۰۶
 * ارز: ۴۹.۵٪ در برابر ۴۹.۶٪، و عملکرد بهتر تنها در تایم‌فریم ۴ ساعته. هیچ‌کدام دلیلی برای تغییر
 * نیستند، بنابراین پیش‌بینی به عنوان قهرمان شروع می‌کند و ترکیب باید ابتدا آن را
 * روی سابقه زنده خود دستگاه شکست دهد. `indicatorsAlone`: فراخوان خود اندیکاتور
 * در همان نقاط تست، در صورت وجود.
 */
export const LEARN_TESTED = {
  tests: 5710, coins: 106, forecast: 49.6, blend: 49.5,
  byInterval: { '1m': [53.1, 52.5], '5m': [48.1, 47.3], '15m': [46.6, 45.8], '1h': [48.0, 47.6], '4h': [47.3, 50.5], '1d': [59.0, 57.6] },
  indicatorsAlone: { macd: 50.1, ema200: 48.5, emaCross: 48.8, supertrend: 47.7, stoch: 53.5, cci: 53.8, willr: 53.0, adx: 47.4, rsi: 52.5, mfi: 49.9, donchian: 42.4, bollinger: 59.4 },
  measuredOn: '2026-10-15',
};

export const SWITCH_MIN = 100;   // حداقل فراخوان‌های زنده تعیین‌تکلیف‌شده پیش از بررسی تعویض
export const SWITCH_GAP = 3;     // اختلاف امتیازی که رقیب باید جلوتر باشد

/** تعیین اینکه کدام روش با توجه به سابقه زنده باید تصمیم‌گیری کند. */
export function decideChampion(live, current = 'forecast') {
  const f = live?.forecast, b = live?.blend;
  if (!f || !b || f.n < SWITCH_MIN || b.n < SWITCH_MIN) return { champion: current, reason: `نیاز به حداقل ${SWITCH_MIN} فراخوان تعیین‌تکلیف‌شده از هر روش پیش از امکان تغییر (پیش‌بینی ${f?.n || 0}، ترکیب ${b?.n || 0}).` };
  const lead = (x, y) => x.rate - y.rate >= SWITCH_GAP && x.lo > y.rate;
  if (current === 'forecast' && lead(b, f)) return { champion: 'blend', switched: true, reason: `ترکیب یادگرفته‌شده در ${b.n} فراخوان زنده با نرخ ${b.rate}٪ در برابر ${f.rate}٪ پیش‌بینی موفق بوده و بازه ۹۵٪ آن (${b.lo}–${b.hi}٪) بالاتر از نرخ پیش‌بینی قرار دارد.` };
  if (current === 'blend' && !(b.rate >= f.rate)) return { champion: 'forecast', switched: true, reason: `نرخ ترکیب یادگرفته‌شده به ${b.rate}٪ در برابر ${f.rate}٪ پیش‌بینی کاهش یافت، بنابراین موتور پیش‌بینی مجدداً هدایت را به دست می‌گیرد.` };
  return { champion: current, reason: current === 'forecast' ? `ترکیب دارای نرخ ${b.rate}٪ و پیش‌بینی دارای ${f.rate}٪ است — این اختلاف برای جابجایی کافی نیست.` : `ترکیب همچنان پیشتاز است (${b.rate}٪ در برابر ${f.rate}٪).` };
}