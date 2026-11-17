// موتور سیگنال: اندیکاتورها را به یک امتیاز خرید/فروش، یک برنامه معاملاتی 
// (ورود، حد ضرر، اهداف سود) و یک بَک‌تست (آزمایش گذشته‌نگار) از همان قوانین تبدیل می‌کند.
// این‌ها سیگنال‌های فنی مبتنی بر قانون هستند، نه توصیه مالی.

import { computeAll, supportResistance, last } from './indicators.js';

export const THRESHOLDS = { strong: 45, normal: 18 };

/**
 * فواصل حد ضرر و حد سود، که بر اساس اندازه‌گیری انتخاب شده‌اند تا بر اساس قراردادهای ذهنی.
 *
 * برنامه قدیمی — یک حد ضرر ۱.۵ ATR و هدف ۲.۵ به ۱ در هر تایم‌فریم — هرگز تست نشده بود.
 * هنگامی که روی ۱۲ رمزارز و حدود ۲۱,۰۰۰ نقطه ورود با ابزار `tools/evaluate-geometry.mjs` بررسی شد،
 * مشخص گردید که در سه تایم‌فریم از چهار تایم‌فریم زیان‌ده است، زیرا هدف ۲.۵ به ۱ با حد ضرر ۱.۵ ATR
 * تنها در حدود یک چهارم مواقع محقق می‌شود. این همان دلیل ریاضی پشت بک‌تست هفتگی منفی ۶۰٪ است،
 * و هیچ مدل پیش‌بینی‌ای نمی‌تواند برنامه‌ای را نجات دهد که خروج‌های آن سودآور نیستند.
 *
 * مقدار `ev` ارزش مورد انتظار اندازه‌گیری‌شده به ازای هر معامله بر حسب واحد ریسک (R)، پس از کسر کارمزد، 
 * در هنگام ورود در هر کندل از نیمه جدیدتر کندل‌های هر رمزارز است. یک عدد منفی یعنی خود هندسه زیان‌ده است — 
 * رابط کاربری این موضوع را اعلام می‌کند به جای اینکه سطح‌هایی را چاپ کند که بی‌سرصدا پول کاربر را هدر می‌دهند.
 * مجدداً در تاریخ 2026-10-15 روی تمام ۱۰۶ رمزارز اندازه‌گیری شد (تست signals، دو اجرا با اختلاف چند ساعت، نتیجه بعدی نمایش داده شده):
 * 15m معادل -0.002 و -0.004R، ‏ 1h معادل +0.084 و +0.053R، ‏ 4h معادل -0.033 و -0.038R، ‏ 1d معادل -0.036 و -0.033R.
 * برنامه روزانه که روی ۱۲ رمزارز +0.058R بود، روی ۱۰۶ رمزارز زیان‌ده است. در هیچ نموداری جفت حد ضرر/هدف دیگری
 * عملکردی بهتر از 0.01R نداشت، که کاملاً در محدوده نوسان بین دو اجرای تست قرار دارد، بنابراین سطوح تغییری نکرده‌اند.
 */
export const TRADE_GEOMETRY = {
  '15m': { stopAtr: 1, rr: 1, ev: -0.004, tested: true },
  '1h':  { stopAtr: 1, rr: 3, ev: +0.053, tested: true },
  '4h':  { stopAtr: 1, rr: 1, ev: -0.038, tested: true },
  '1d':  { stopAtr: 1, rr: 2, ev: -0.033, tested: true },
};
/** تعداد نقاط ورود و رمزارزهایی که ارقام `ev` در بالا بر پایه آن‌ها بنا شده‌اند. */
export const GEOMETRY_TESTED = { coins: 106, measuredOn: '2026-10-15', entries: { '15m': 51359, '1h': 33128, '4h': 53599, '1d': 22146 } };

/**
 * امتیاز چیست و چه چیزی نیست — که با اندازه‌گیری مشخص شده است.
 *
 * دو تست انجام شد و نتایج آن‌ها با هم اختلاف داشتند. تست ضعیف‌تر ابتدا منتشر شد 
 * و این کامنت وجود دارد تا آن اشتباه تکرار نشود.
 *
 * تست ۱ — میانگین‌های دسته‌ای (`tools/evaluate-signal-edge.mjs`). هر کندل را بر اساس 
 * امتیازی که نشان داده دسته‌بندی کنید، سپس نتیجه را میانگین بگیرید. در نمودار ۱ ساعته، 
 * امتیازهای ۴۵ تا ۵۹ در ۳۵.۴٪ مواقع به هدف خوردند در حالی که نرخ پایه ۲۷.۵٪ بود: 
 * افزایشی معادل ۱.۲۹ برابر روی ۴۸۶ نمونه، که به نظر می‌آید یک مزیت واقعی باشد.
 *
 * تست ۲ — معامله کردن با آن (`tools/evaluate-band-strategy.mjs`). فقط همان سیگنال‌ها را بگیرید، 
 * به ترتیب، یک پوزیشن در هر زمان، با احتساب کارمزد، و آن‌ها را با ورود در هر کندل از همان بازه 
 * با خروج‌های یکسان مقایسه کنید. تست مجدد در تاریخ 2026-10-16 روی تمام ۱۰۶ رمزارز، روی هر دو نیمه 
 * کندل‌های هر رمزارز، با بهترین بازه ظاهری هر نمودار (بازه 1d که از روی نیمه جدیدتر انتخاب شده بود):
 *
 *                        نیمه جدیدتر              نیمه قدیمی‌تر
 *   1h، امتیازهای 45 تا 59 :  +0.145R در برابر +0.093R      −0.166R در برابر −0.115R
 *   4h، امتیازهای 18 تا 29 :  +0.039R در برابر −0.024R      −0.012R در برابر −0.011R
 *   1d، امتیازهای 60 تا 100:  +0.176R در برابر −0.014R      −0.076R در برابر −0.032R
 *
 * هر بازه در نیمه‌ای که ظاهر خوبی داشت توانست ورودی‌های هر کندل را شکست دهد و در نیمه دیگر نتوانست؛ 
 * بازه روزانه که قوی‌ترین بود، در نیمه‌ای که برای انتخاب آن استفاده نشده بود، عملکردی بدتر از ورودی تصادفی هر کندل داشت.
 *
 * میانگین دسته‌ای توسط دو چیز که یک حساب واقعی به آن‌ها دسترسی ندارد تورم پیدا کرده بود: 
 * پوزیشن‌های هم‌پوشانی‌دار که هرگز نمی‌توانستند به طور هم‌زمان نگه داشته شوند، و اعتبار جزئی برای معاملاتی 
 * که صرفاً کمی مثبت به پایان رسیده‌ بودند. هیچ‌کدام در مواجهه با توالی زمانی زنده نمی‌مانند.
 *
 * بنابراین: هیچ بازه امتیازی به عنوان قابل معامله اثبات نشده است. امتیاز فقط توصیف می‌کند 
 * که اندیکاتورها در حال حاضر چقدر با هم موافق هستند. سود را پیش‌بینی نمی‌کند، یک شیب خطی نیست، 
 * و رابط کاربری این را صراحتاً می‌گوید تا مفهوم دیگری را القا نکند.
 */
export const SIGNAL_EDGE_TESTED = {
  '1h': { lo: 45, hi: 59, bucketLift: 1.09, tradedR: 0.145, randomR: 0.093, trades: 5811, older: { tradedR: -0.166, randomR: -0.115, trades: 3439 }, beatsRandom: false },
  '4h': { lo: 18, hi: 29, bucketLift: 1.04, tradedR: 0.039, randomR: -0.024, trades: 6880, older: { tradedR: -0.012, randomR: -0.011, trades: 5564 }, beatsRandom: false },
  '1d': { lo: 60, hi: 100, bucketLift: 1.21, tradedR: 0.176, randomR: -0.014, trades: 417, older: { tradedR: -0.076, randomR: -0.032, trades: 201 }, beatsRandom: false },
};

/**
 * هیچ بازه‌ای به عنوان سند قطعی ارائه نمی‌شود، زیرا هیچ‌کدام واجد شرایط آن نشدند. 
 * نتیجه تست را برای این تایم‌فریم برمی‌گرداند تا رابط کاربری بتواند بگوید چه چیزی تلاش شده و چه چیزی یافت شده است.
 */
export function edgeBand(interval, score) {
  const t = SIGNAL_EDGE_TESTED[interval];
  if (!t) return { band: null, inside: false, tested: null };
  return { band: null, inside: false, tested: { ...t, inBand: score >= t.lo && score <= t.hi } };
}

const DEFAULT_GEOMETRY = { stopAtr: 1.5, rr: 2.5, ev: null, tested: false };
export const geometryFor = (interval) => TRADE_GEOMETRY[interval] || DEFAULT_GEOMETRY;

/**
 * معنای یک امتیاز، که به جای فرض کردن، اندازه‌گیری شده است.
 *
 * هر کندل از هر رمزارز بر اساس امتیاز خود مرتب شده و بررسی می‌شود که آیا قیمت H کندل بعد 
 * بالاتر بوده است یا خیر (افق صفحه رمزارز)، با کمک ابزار `tools/evaluate-score-buckets.mjs`.
 * اولین تست روی ۱۲ رمزارز (۲۴۴,۰۰۰ کندل)؛ روی تمامی ۱۰۶ رمزارز در تاریخ 2026-10-15 (۱,۵۷۶,۰۷۰ کندل):
 *
 *            سقوط شدید  نزول  بدون روند مشخص  صعود  صعود شدید
 *   5m           50.0%     51.4%       49.7%       47.1%     45.4%
 *   15m          53.2%     51.2%       50.0%       48.5%     46.1%
 *   1h           51.2%     49.5%       47.4%       47.1%     46.4%
 *   4h           51.0%     48.6%       47.9%       47.7%     45.3%
 *   1d           47.0%     46.6%       45.4%       46.9%     45.1%
 *
 * در هر نمودار، خوانشِ «صعود شدید» در کمترین تعداد دفعات با صعود قیمت دنبال شده است، 
 * و در هیچ‌کدام از نیمه‌های داده‌ها نتوانست خوانش «سقوط شدید» را شکست دهد. 
 * بنابراین کندل‌هایی که این موتور بیشترین امتیاز را به آن‌ها داده بود، آن‌هایی بودند که 
 * «کمترین احتمال» را برای صعود داشتند.
 * این‌ها اندیکاتورهای روند هستند و در این افق‌های زمانی، بازار کریپتو به سمت میانگین بازمی‌گردد: 
 * امتیاز بالا یعنی «این حرکت از پیش انجام شده است»، که با «این حرکت ادامه خواهد یافت» تفاوت دارد. 
 * نامیدن آن به عنوان خرید — و امتیاز بزرگ‌تر به عنوان «خرید قوی» — دقیقا خلاف آماری را به کاربر می‌گوید 
 * که داده‌ها نشان می‌دهند، و به همین دلیل است که یک حساب آزمایشی پیرو این برچسب‌ها با وین‌ریت ۱۹٪ ضرر کرد.
 *
 * معکوس کردن برچسب‌ها نیز مشکل را حل نمی‌کند. هر دو جهت روی یک نیمه نگه داشته‌شده از داده‌ها با حد ضرر ۱.۵ ATR، 
 * اهداف R و کارمزد ۰.۱٪ به ازای هر طرف معامله شدند: هیچ‌کدام امید ریاضی مثبتی که در هر دو نیمه حفظ شود تولید نکردند.
 *
 * بنابراین برچسب منصفانه، توصیفی از میزان کشیدگی روند است، بدون هیچ‌گونه دستورالعمل یا توصیه‌ای. 
 * رنگ‌ها (tone) به صورت صعودی/نزولی به عنوان رنگ نمودار باقی می‌مانند — آن‌ها جهت تمایل اندیکاتورها را توصیف می‌کنند، نه یک توصیه.
 */
export const SCORE_BUCKETS_TESTED = {
  bars: 1576070, coins: 106, measuredOn: '2026-10-15',
  upRateByBucket: {
    '5m': { extendedDown: 50.0, leaningDown: 51.4, noTrend: 49.7, leaningUp: 47.1, extendedUp: 45.4 },
    '15m': { extendedDown: 53.2, leaningDown: 51.2, noTrend: 50.0, leaningUp: 48.5, extendedUp: 46.1 },
    '1h': { extendedDown: 51.2, leaningDown: 49.5, noTrend: 47.4, leaningUp: 47.1, extendedUp: 46.4 },
    '4h': { extendedDown: 51.0, leaningDown: 48.6, noTrend: 47.9, leaningUp: 47.7, extendedUp: 45.3 },
    '1d': { extendedDown: 47.0, leaningDown: 46.6, noTrend: 45.4, leaningUp: 46.9, extendedUp: 45.1 },
  },
  higherScoreMeansHigherChance: false,
  invertingItAlsoFails: true,
};

// کلمات ساده برای آنچه اندیکاتورها تاکنون درباره حرکت نشان می‌دهند. 
// کدهای اکشن بدون تغییر باقی می‌مانند تا رکوردهای ثبت‌شده معنی خود را حفظ کنند.
export function labelFor(score) {
  if (score >= THRESHOLDS.strong) return { action: 'EXTENDED_UP', text: 'صعود شدید تا این لحظه', tone: 'up' };
  if (score >= THRESHOLDS.normal) return { action: 'LEANING_UP', text: 'صعودی', tone: 'up' };
  if (score <= -THRESHOLDS.strong) return { action: 'EXTENDED_DOWN', text: 'سقوط شدید تا این لحظه', tone: 'down' };
  if (score <= -THRESHOLDS.normal) return { action: 'LEANING_DOWN', text: 'نزولی', tone: 'down' };
  return { action: 'NO_TREND', text: 'بدون روند مشخص', tone: 'flat' };
}

/** نرخ موفقیت صعود اندازه‌گیری‌شده برای این خوانش، تا رابط کاربری بتواند آن را نمایش دهد. */
export function upRateFor(interval, score) {
  const t = SCORE_BUCKETS_TESTED.upRateByBucket[interval];
  if (!t) return null;
  const key = score >= THRESHOLDS.strong ? 'extendedUp'
    : score >= THRESHOLDS.normal ? 'leaningUp'
    : score <= -THRESHOLDS.strong ? 'extendedDown'
    : score <= -THRESHOLDS.normal ? 'leaningDown' : 'noTrend';
  return { bucket: key, upRatePct: t[key], bars: SCORE_BUCKETS_TESTED.bars, coins: SCORE_BUCKETS_TESTED.coins };
}

// امتیازدهی به یک کندل منفرد. متغیر `ind` خروجی تابع computeAll(candles) است.
export function scoreAt(candles, ind, i) {
  const c = candles[i];
  const parts = [];
  let max = 0;
  const add = (key, label, points, weight, group) => { parts.push({ key, label, points, group }); max += weight; };

  const e20 = ind.ema20[i], e50 = ind.ema50[i], e200 = ind.ema200[i];
  const adxV = ind.adx.adx[i];
  const trendMult = adxV === null ? 1 : adxV > 25 ? 1.25 : adxV < 18 ? 0.7 : 1;

  // ۱. روند بلندمدت
  if (e200 !== null) {
    add('ema200', c.c > e200 ? 'قیمت بالای EMA 200 — روند صعودی بلندمدت' : 'قیمت پایین EMA 200 — روند نزولی بلندمدت',
      (c.c > e200 ? 1.5 : -1.5) * trendMult, 1.5, 'trend');
  }
  // ۲. رژیم EMA50 / EMA200 + تقاطع‌های تازه
  if (e50 !== null && e200 !== null) {
    let pts = e50 > e200 ? 1 : -1;
    let label = e50 > e200 ? 'میانگین ۵۰ بالاتر از ۲۰۰ (رژیم صعودی)' : 'میانگین ۵۰ پایین‌تر از ۲۰۰ (رژیم نزولی)';
    for (let k = 1; k <= 5 && i - k >= 0; k++) {
      const p50 = ind.ema50[i - k], p200 = ind.ema200[i - k];
      if (p50 === null || p200 === null) break;
      if (p50 <= p200 && e50 > e200) { pts = 1.5; label = 'صلیب طلایی (Golden Cross): میانگین ۵۰ از بالای ۲۰۰ عبور کرد'; break; }
      if (p50 >= p200 && e50 < e200) { pts = -1.5; label = 'صلیب مرگ (Death Cross): میانگین ۵۰ از پایین ۲۰۰ عبور کرد'; break; }
    }
    add('cross', label, pts * trendMult, 1.5, 'trend');
  }
  // ۳. روند کوتاه‌مدت
  if (e20 !== null && e50 !== null) {
    const bull = (c.c > e20 ? 1 : 0) + (e20 > e50 ? 1 : 0);
    const pts = bull === 2 ? 1 : bull === 0 ? -1 : 0;
    const label = pts > 0 ? 'قیمت > EMA 20 > EMA 50 — روند صعودی کوتاه‌مدت'
      : pts < 0 ? 'قیمت < EMA 20 < EMA 50 — روند نزولی کوتاه‌مدت' : 'میانگین‌های متحرک کوتاه‌مدت مختلط هستند';
    add('ema20', label, pts * trendMult, 1, 'trend');
  }
  // ۴. مومنتوم MACD
  const h = ind.macd.hist[i], hp = ind.macd.hist[i - 1];
  if (h !== null && hp !== null && hp !== undefined) {
    let pts, label;
    let crossed = 0;
    for (let k = 0; k < 3 && i - k - 1 >= 0; k++) {
      const a = ind.macd.hist[i - k], b = ind.macd.hist[i - k - 1];
      if (a === null || b === null) break;
      if (b <= 0 && a > 0) { crossed = 1; break; }
      if (b >= 0 && a < 0) { crossed = -1; break; }
    }
    const atrNow = ind.atr[i] || c.c * 0.01;
    const flat = Math.abs(h) < atrNow * 0.03; 
    if (flat) { pts = 0; label = 'اندیکاتور MACD مسطح در اطراف خط صفر (بدون مومنتوم)'; }
    else if (crossed === 1 && h > 0) { pts = 1.25; label = 'تقاطع صعودی MACD'; }
    else if (crossed === -1 && h < 0) { pts = -1.25; label = 'تقاطع نزولی MACD'; }
    else if (h > 0) { pts = h >= hp ? 1 : 0.4; label = h >= hp ? 'MACD مثبت و رو به رشد' : 'MACD مثبت اما در حال کاهش'; }
    else { pts = h <= hp ? -1 : -0.4; label = h <= hp ? 'MACD منفی و در حال افت بیشتر' : 'MACD منفی اما در حال بهبودی'; }
    add('macd', label, pts, 1.5, 'momentum');
  }
  // ۵. RSI
  const r = ind.rsi[i], rp = ind.rsi[i - 1];
  if (r !== null) {
    let pts = 0, label = `RSI ${r.toFixed(0)} — خنثی`;
    const rising = rp !== null && rp !== undefined && r > rp;
    const up = e50 !== null && c.c > e50;
    if (r < 25) { pts = 1.5; label = `RSI ${r.toFixed(0)} — کاملاً اشباع فروش`; }
    else if (r < 30) { pts = 1; label = `RSI ${r.toFixed(0)} — اشباع فروش`; }
    else if (r < 45) { pts = rising ? 0.5 : -0.3; label = `RSI ${r.toFixed(0)} — ضعیف${rising ? ' اما رو به رشد' : ''}`; }
    else if (r <= 55) { pts = 0; }
    else if (r <= 70) { pts = up ? 0.6 : 0.2; label = `RSI ${r.toFixed(0)} — مومنتوم صعودی`; }
    else if (r <= 80) { pts = -1; label = `RSI ${r.toFixed(0)} — اشباع خرید`; }
    else { pts = -1.5; label = `RSI ${r.toFixed(0)} — به‌ شدت اشباع خرید، ریسک اصلاح`; }
    add('rsi', label, pts, 1.5, 'momentum');
  }
  // ۶. باندهای بولینگر (Bollinger Bands)
  const up = ind.bb.upper[i], lo = ind.bb.lower[i];
  if (up !== null && lo !== null) {
    let pts = 0, label = 'قیمت درون باندهای بولینگر است';
    if (c.c < lo) { pts = 1; label = 'بسته شدن زیر باند پایینی بولینگر (کشیدگی نزولی)'; }
    else if (c.c > up) { pts = -1; label = 'بسته شدن بالای باند بالایی بولینگر (کشیدگی صعودی)'; }
    add('bb', label, pts, 1, 'volatility');
  }
  // ۷. استوکاستیک RSI (Stochastic RSI)
  const k = ind.stoch.k[i], d = ind.stoch.d[i];
  if (k !== null && d !== null) {
    let pts = 0, label = `Stoch RSI ${k.toFixed(0)}`;
    if (k < 20 && k > d) { pts = 1; label = `Stoch RSI ${k.toFixed(0)} — تقاطع صعودی در منطقه اشباع فروش`; }
    else if (k > 80 && k < d) { pts = -1; label = `Stoch RSI ${k.toFixed(0)} — تقاطع نزولی در منطقه اشباع خرید`; }
    add('stoch', label, pts, 1, 'momentum');
  }
  // ۸. تأیید حجم معاملات
  const vs = ind.volSma[i];
  if (vs) {
    let pts = 0, label = 'حجم نرمال';
    if (c.v > vs * 1.5) {
      pts = c.c >= c.o ? 0.5 : -0.5;
      label = `جهش حجم (${(c.v / vs).toFixed(1)} برابر میانگین) روی یک کندل ${c.c >= c.o ? 'سبز' : 'قرمز'}`;
    }
    add('volume', label, pts, 0.5, 'volume');
  }
  // ۹. حرکت جهشی (Directional Movement)
  const pdi = ind.adx.plusDI[i], mdi = ind.adx.minusDI[i];
  if (pdi !== null && mdi !== null && adxV !== null) {
    const strength = adxV > 25 ? 'قوی' : adxV < 18 ? 'ضعیف / رِنج' : 'متوسط';
    add('adx', `ADX ${adxV.toFixed(0)} (روند ${strength})، ${pdi > mdi ? 'شاخص +DI برتر است' : 'شاخص -DI برتر است'}`,
      pdi > mdi ? 0.5 : -0.5, 0.5, 'trend');
  }

  const raw = parts.reduce((s, p) => s + p.points, 0);
  const score = max === 0 ? 0 : Math.max(-100, Math.min(100, Math.round((raw / max) * 100)));
  return { score, parts };
}

// تعداد اعشار برای خوانا نگه داشتن قیمت.
function decimalsFor(p) {
  const a = Math.abs(p);
  if (a >= 1000) return 2;
  if (a >= 1) return 4;
  if (a >= 0.01) return 6;
  if (!(a > 0) || a >= 1e-5) return 8;
  return Math.min(20, Math.ceil(-Math.log10(a)) + 3);
}

function round(v, price) {
  if (v === null || v === undefined || !isFinite(v)) return null;
  const r = Number(v.toFixed(decimalsFor(price)));
  return r === 0 && v !== 0 ? Number(v.toPrecision(4)) : r;
}

// در پوزیشن شورت (فروش)، اهداف قیمتی زیر صفر معتبر نیستند.
function shortTargets(price, raw) {
  const out = [];
  for (const v of raw) {
    if (v > 0) { out.push(v); continue; }
    if (!out.length) return [];
    const prev = out[out.length - 1], before = out.length > 1 ? out[out.length - 2] : price;
    out.push(prev * (prev / before));
  }
  return out;
}

// سیگنال کامل برای آخرین کندل، به همراه برنامه معاملاتی.
export function generateSignal(candles, { interval = '' } = {}) {
  if (!candles || candles.length < 60) {
    return { ok: false, reason: 'تاریخچه قیمتی کافی برای تولید سیگنال وجود ندارد (حداقل به ۶۰ کندل نیاز است).' };
  }
  const ind = computeAll(candles);
  const i = candles.length - 1;
  const price = candles[i].c;
  const { score, parts } = scoreAt(candles, ind, i);
  const label = labelFor(score);
  const atrV = ind.atr[i] ?? price * 0.02;
  const sr = supportResistance(candles.slice(-300));
  const s1 = sr.supports[0]?.price ?? null;
  const r1 = sr.resistances[0]?.price ?? null;

  const geo = geometryFor(interval);
  let plan = null;
  if (score >= THRESHOLDS.normal) {
    let stop = entryStop(price - geo.stopAtr * atrV, s1 !== null ? s1 - 0.25 * atrV : null, 'long', price, atrV);
    const risk = price - stop;
    const tp3Candidate = sr.resistances.find((l) => l.price > price + geo.rr * risk)?.price;
    plan = {
      side: 'long',
      title: 'سطوح قیمتی در صورت خرید',
      entry: round(price, price),
      entryZone: [round(Math.max(price - 0.5 * atrV, s1 ?? -Infinity), price), round(price, price)],
      stopLoss: round(stop, price),
      takeProfits: [price + geo.rr * 0.6 * risk, price + geo.rr * risk, tp3Candidate ?? price + geo.rr * 1.6 * risk].map((v) => round(v, price)),
      riskPct: +((risk / price) * 100).toFixed(2),
      rewardRisk: geo.rr,
      expectancyR: geo.ev,
      geometryTested: geo.tested,
      ...exitList([
        { text: 'در صورتی که قیمت پایین‌تر از حد ضرر بسته شد خارج شوید ({price})', price: round(stop, price) },
        { text: 'سیو سود جزئی در هدف اول (TP1) و انتقال حد ضرر به نقطه ورود' },
        ind.ema50[i] !== null ? { text: 'خروج روندی: بسته شدن کندل زیر EMA 50 ({price})', price: round(ind.ema50[i], price) } : null,
        { text: 'در صورت عبور RSI از ۷۵ و تضعیف مومنتوم، خارج شوید یا حد ضرر را سفت کنید' },
      ]),
    };
  } else if (score <= -THRESHOLDS.normal) {
    let stop = entryStop(price + geo.stopAtr * atrV, r1 !== null ? r1 + 0.25 * atrV : null, 'short', price, atrV);
    const risk = stop - price;
    const tp3Candidate = sr.supports.find((l) => l.price < price - geo.rr * risk)?.price;
    plan = {
      side: 'short',
      title: 'سطوح قیمتی در صورت فروش یا پوزیشن شورت',
      entry: round(price, price),
      entryZone: [round(price, price), round(Math.min(price + 0.5 * atrV, r1 ?? Infinity), price)],
      stopLoss: round(stop, price),
      takeProfits: shortTargets(price, [price - geo.rr * 0.6 * risk, price - geo.rr * risk, tp3Candidate ?? price - geo.rr * 1.6 * risk]).map((v) => round(v, price)),
      riskPct: +((risk / price) * 100).toFixed(2),
      rewardRisk: geo.rr,
      expectancyR: geo.ev,
      geometryTested: geo.tested,
      ...exitList([
        { text: 'دارندگان اسپات: بستن یا کاهش حجم پوزیشن را در نظر بگیرید' },
        { text: 'پوزیشن شورت با بسته شدن کندل بالای {price} نامعتبر می‌شود', price: round(stop, price) },
        ind.ema50[i] !== null ? { text: 'سوگیری نزولی با بسته شدن کندل بالای EMA 50 ({price}) پایان می‌یابد', price: round(ind.ema50[i], price) } : null,
      ]),
    };
  }

  const MIN_TRADEABLE_MOVE = 0.003;
  let noEdgeReason = null;
  if (plan && (!(plan.stopLoss > 0) || plan.takeProfits.length < 3)) {
    noEdgeReason = `نوسانات قیمت در این چارت برای ستاپ ${plan.side} بیش از حد شدید است: سطوح آن نیازمند سقوط قیمت به صفر هستند که امکان‌پذیر نیست. این خوانش را به عنوان یک هشدار در نظر بگیرید یا از چارت دیگری استفاده کنید.`;
    plan = null;
  }
  if (plan) {
    const target = plan.takeProfits[0];
    const move = Math.abs(target - price) / price;
    const riskFrac = plan.riskPct / 100;
    if (move < MIN_TRADEABLE_MOVE || riskFrac < 0.001) {
      noEdgeReason = `حرکت قیمت در این تایم‌فریم برای معامله بسیار کوچک است: فاصله اولین هدف ${(move * 100).toFixed(3)}٪ است که کارمزد و اسپرد آن را می‌بلعد. برای ورود واقعی از تایم‌فریم کندتری استفاده کنید.`;
      plan = null;
    }
  }

  const waitFor = [];
  if (noEdgeReason) waitFor.push(noEdgeReason);
  if (!plan && !noEdgeReason) {
    if (r1 !== null) waitFor.push(`ماشه صعودی: بسته شدن کندل بالای مقاومت ${fmtNum(r1)} همراه با افزایش حجم`);
    if (s1 !== null) waitFor.push(`محدوده خرید در پولبک نزدیک حمایت ${fmtNum(s1)} مشروط بر ماندن RSI بالای ۴۰`);
    if (s1 !== null) waitFor.push(`ماشه نزولی: بسته شدن کندل زیر ${fmtNum(s1)}`);
  }

  const bull = parts.filter((p) => p.points > 0).sort((a, b) => b.points - a.points);
  const bear = parts.filter((p) => p.points < 0).sort((a, b) => a.points - b.points);

  return {
    ok: true,
    interval,
    time: candles[i].t,
    price,
    score,
    confidence: Math.min(100, Math.abs(score)),
    ...label,
    plan,
    waitFor,
    reasons: { bullish: bull.map((p) => p.label), bearish: bear.map((p) => p.label) },
    parts,
    levels: {
      supports: sr.supports.map((l) => round(l.price, price)),
      resistances: sr.resistances.map((l) => round(l.price, price)),
    },
    indicators: {
      rsi: num(last(ind.rsi)), macd: num(last(ind.macd.line)), macdSignal: num(last(ind.macd.signal)),
      macdHist: num(last(ind.macd.hist)), ema20: num(ind.ema20[i]), ema50: num(ind.ema50[i]), ema200: num(ind.ema200[i]),
      bbUpper: num(ind.bb.upper[i]), bbLower: num(ind.bb.lower[i]), atr: num(atrV), atrPct: +((atrV / price) * 100).toFixed(2),
      adx: num(ind.adx.adx[i]), stochK: num(ind.stoch.k[i]), volumeRatio: ind.volSma[i] ? +(candles[i].v / ind.volSma[i]).toFixed(2) : null,
      mfi: num(ind.mfi?.[i]), cci: num(ind.cci?.[i]), willR: num(ind.willr?.[i]),
      supertrend: num(ind.supertrend?.line[i]), supertrendDir: ind.supertrend?.dir[i] ?? null,
      donchianHigh: num(ind.donchian?.upper[i]), donchianLow: num(ind.donchian?.lower[i]),
    },
  };
}

function entryStop(atrStop, levelStop, side, price, atrV) {
  if (levelStop === null) return atrStop;
  if (side === 'long') {
    const s = Math.min(atrStop, levelStop);
    return price - s > 3 * atrV ? atrStop : s;
  }
  const s = Math.max(atrStop, levelStop);
  return s - price > 3 * atrV ? atrStop : s;
}

function exitList(list) {
  const exits = list.filter(Boolean);
  return { exits, exitRules: exits.map((e) => (e.price != null ? e.text.replace('{price}', fmtNum(e.price)) : e.text)) };
}

function num(v) { return v === null || v === undefined || !isFinite(v) ? null : +v.toPrecision(8); }
export function fmtNum(v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const dp = decimalsFor(v);
  return Number(v.toFixed(dp)).toLocaleString('en-US', { maximumFractionDigits: dp });
}

// بَک‌تست فقط لانگ از همان قوانین امتیازدهی.
export function backtest(candles, { interval = null, entryScore = THRESHOLDS.normal, exitScore = -THRESHOLDS.normal, atrStop = null, rMultiple = null, feePct = 0.1, breakEvenAtR = null } = {}) {
  const geo = interval ? geometryFor(interval) : null;
  atrStop = atrStop ?? geo?.stopAtr ?? 1.5;
  rMultiple = rMultiple ?? geo?.rr ?? 2.5;
  const n = candles.length;
  if (n < 80) return { ok: false, reason: 'تاریخچه کافی برای بک‌تست وجود ندارد' };
  const ind = computeAll(candles);
  const start = n >= 260 ? 200 : 50;
  const fee = feePct / 100;
  const trades = [];
  let pos = null;
  let equity = 1, peak = 1, maxDD = 0;
  const curve = [];
  for (let i = start; i < n; i++) {
    const c = candles[i];
    if (pos) {
      let exit = null, why = '';
      if (c.l <= pos.stop) { exit = Math.min(pos.stop, c.o); why = pos.stop >= pos.entry ? 'breakeven' : 'stop'; }
      else if (c.h >= pos.target) { exit = Math.max(pos.target, c.o); why = 'target'; }
      else {
        const { score } = scoreAt(candles, ind, i);
        pos.weak = score <= exitScore ? pos.weak + 1 : 0;
        if (pos.weak >= 2) { exit = c.c; why = 'signal'; }
        else if (breakEvenAtR !== null && breakEvenAtR !== undefined && c.c >= pos.entry + breakEvenAtR * pos.risk) pos.stop = Math.max(pos.stop, pos.entry);
      }
      if (exit !== null) {
        const ret = (exit / pos.entry) * (1 - fee) * (1 - fee) - 1;
        equity *= 1 + ret;
        trades.push({ entryTime: pos.t, exitTime: c.t, entryIndex: pos.i, exitIndex: i, entry: pos.entry, exit, returnPct: +(ret * 100).toFixed(2), reason: why });
        pos = null;
      }
    } else {
      const a = ind.atr[i];
      if (a) {
        const { score } = scoreAt(candles, ind, i);
        if (score >= entryScore) {
          pos = { entry: c.c, stop: c.c - atrStop * a, risk: atrStop * a, target: c.c + atrStop * a * rMultiple, t: c.t, i, weak: 0 };
        }
      }
    }
    const mark = pos ? equity * (c.c / pos.entry) : equity;
    peak = Math.max(peak, mark);
    maxDD = Math.max(maxDD, (peak - mark) / peak);
    curve.push({ t: c.t, v: mark });
  }
  const openTrade = pos ? { entryTime: pos.t, entryIndex: pos.i, entry: pos.entry, stop: pos.stop, target: pos.target, unrealizedPct: +((candles[n - 1].c / pos.entry - 1) * 100).toFixed(2) } : null;
  const wins = trades.filter((t) => t.returnPct > 0);
  const grossWin = wins.reduce((s, t) => s + t.returnPct, 0);
  const grossLoss = trades.filter((t) => t.returnPct <= 0).reduce((s, t) => s - t.returnPct, 0);
  return {
    ok: true,
    bars: n - start,
    from: candles[start].t,
    to: candles[n - 1].t,
    trades,
    openTrade,
    tradeCount: trades.length,
    winRate: trades.length ? +((wins.length / trades.length) * 100).toFixed(1) : null,
    totalReturnPct: +((equity - 1) * 100).toFixed(2),
    buyHoldPct: +((candles[n - 1].c / candles[start].c - 1) * 100).toFixed(2),
    maxDrawdownPct: +(maxDD * 100).toFixed(2),
    profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : trades.length ? null : null,
    avgTradePct: trades.length ? +(trades.reduce((s, t) => s + t.returnPct, 0) / trades.length).toFixed(2) : null,
    curve,
  };
}

// ترکیب چندین تایم‌فریم در یک نمایهمگرا.
export function confluence(signalsByInterval) {
  const weights = { '15m': 0.5, '1h': 1, '4h': 1.5, '1d': 2, '1w': 2 };
  let sum = 0, wsum = 0;
  for (const [iv, s] of Object.entries(signalsByInterval)) {
    if (!s?.ok) continue;
    const w = weights[iv] ?? 1;
    sum += s.score * w; wsum += w;
  }
  if (!wsum) return null;
  const score = Math.round(sum / wsum);
  return { score, ...labelFor(score) };
}

// توصیه‌های تحلیلی برای رمزارزی که کاربر از قبل هولد کرده است.
export function adviseHolding({ signal, avgBuyPrice, price }) {
  if (!signal?.ok) return { text: 'داده‌های کافی وجود ندارد', tone: 'flat' };
  const pnl = avgBuyPrice ? (price / avgBuyPrice - 1) * 100 : null;
  const rsiV = signal.indicators.rsi;
  if (signal.score <= -THRESHOLDS.strong) return { text: 'سقوط شدید تا این لحظه — بررسی کنید که حد ضررتان در محل مناسبی قرار داشته باشد', tone: 'down' };
  if (signal.score <= -THRESHOLDS.normal) {
    return { text: pnl !== null && pnl > 0 ? 'روند نزولی — شما در سود هستید، تصمیم بگیرید که آیا می‌خواهید بخشی از آن را ذخیره کنید' : 'روند نزولی — حد ضرر خود را بررسی کنید', tone: 'down' };
  }
  if (rsiV !== null && rsiV > 75 && pnl !== null && pnl > 15) return { text: 'اشباع خرید در حالت سود — سیو سود جزئی را در نظر بگیرید', tone: 'warn' };
  if (signal.score >= THRESHOLDS.normal) return { text: 'روند صعودی — یک حد ضرر زیر سطح حمایت از سود شما در برابر برگشت قیمت محافظت می‌کند', tone: 'up' };
  return { text: 'بدون روند مشخص — سطوح کلیدی را زیر نظر داشته باشید', tone: 'flat' };
}
