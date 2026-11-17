// «آیا این الگوی نمودار قبلاً اتفاق افتاده و پس از آن چه رخ داده است؟»
//
// صفحه مقایسه دو رمزارز را در کنار هم قرار می‌دهد. این ماژول مقایسه دیگری را انجام می‌دهد
// که خواننده واقعاً به دنبال آن است: مقایسه رمزارز با گذشته خودش. این بخش شکل اخیر کندل‌ها را
// می‌گیرد، بازه‌های گذشته‌ای که همان شکل را دنبال کرده‌اند پیدا می‌کند و نشان می‌دهد که قیمت
// در کندل‌های پس از هر یک چه رفتاری داشته است.
//
// خودِ عملیات تطبیق توسط تابع findPatterns() از موتور پیش‌بینی انجام می‌شود که از قبل طوری
// نوشته شده تا فقط به داده‌های موجود در همان لحظه نگاه کند — بنابراین می‌توان همین تابع را در
// کندل‌های گذشته اجرا کرد و در برابر آنچه واقعاً رخ داده امتیازدهی نمود. این کاری است که
// backtestAnalog() انجام می‌دهد و به همین دلیل این صفحه می‌تواند به جای یک وعده، نرخ موفقیت
// اندازه‌گیری‌شده را در کنار تصویر قرار دهد.
//
// دو قانون صداقت در اینجا گنجانده شده است:
//   * پاسخ با خط مبنای کلاس اکثریت (majority-class baseline) مقایسه می‌شود، زیرا رمزارزی که
//     در ۶۰٪ مواقع رشد کرده، پیش‌بینی «صعود» را بدون هیچ هنری هوشمندانه جلوه می‌دهد؛
//   * نقاط ارزیابی حداقل به اندازه یک افق زمانی از هم فاصله دارند تا آینده‌های هم‌پوشان
//     نتوانند نمونه آماری را به صورت کاذب بزرگ جلوه دهند.

import { findPatterns } from './predict.js';

/**
 * امتیاز این روش روی کندل‌های واقعی؛ هر رمزارز در برابر خط مبنای کلاس اکثریت خودش سنجیده شده
 * و با tools/evaluate-analog.mjs (تسک ارزیابی "timing") اندازه‌گیری شده است. ابتدا روی ۱۲ رمزارز
 * بایننس؛ و در تاریخ‌های 2026-10-15 و مجدداً 2026-10-16 روی تمام رمزارزهای قابل معامله در اپلیکیشن
 * (۱۰۶ رمزارز از صرافی مرجع هر کدام؛ تعداد کمتر در تایم‌فریم‌های 4h و 1d که تاریخچه کوتاه‌تری دارند).
 *
 * نتیجه منفی است و به جای پنهان شدن، همین‌جا منتشر شده است: تطبیق شکل تصویر واقعاً مفیدی از
 * اتفاقات پس از الگوهای مشابه ترسیم می‌کند، اما به عنوان یک سیگنال تشخیص جهت، عملکرد بهتری نسبت به
 * انتخاب همیشگی نتیجه رایج‌تر نداشت. از بین ۱۰۶ رمزارز، ۴۴ جفت از ۲۸۷ جفت رمزارز/نمودار توانستند
 * خط مبنای خود را شکست دهند (۱۵٪؛ در اجرای قبلی ۴۳ مورد)، و در هر دو اجرا، میانگین تمام نمودارها
 * پایین‌تر از خط مبنا بود. صفحه همچنان این تست را به صورت زنده برای هر رمزارز اجرا می‌کند، بنابراین
 * رمزارزی که خط مبنای خود را شکست دهد گزارش می‌شود — اما چارچوب پیش‌فرض «توصیف» است، نه «پیش‌بینی».
 */
export const ANALOG_TESTED = {
  '1h': { meanAccuracy: 50.5, meanBaseline: 53.4, coinsBeatingBaseline: 27, coins: 104, tests: 13435 },
  '4h': { meanAccuracy: 51.0, meanBaseline: 57.7, coinsBeatingBaseline: 9, coins: 100, tests: 13008 },
  '1d': { meanAccuracy: 50.6, meanBaseline: 56.1, coinsBeatingBaseline: 8, coins: 83, tests: 8031 },
  beatsBaselineOverall: false, measuredOn: '2026-10-16',
  // اجرای قبلی روی همین رمزارزها: 1h ۵۰.۴٪ در برابر ۵۳.۵٪، 4h ۵۰.۶٪ در برابر ۵۶.۶٪،
  // 1d ۵۱.۴٪ در برابر ۵۵.۹٪؛ ۴۳ جفت از ۲۸۷ جفت رمزارز/نمودار خط مبنای خود را شکست دادند.
  previousRun: { measuredOn: '2026-10-15', pairsBeating: 43, pairs: 287 },
};

/** مقادیر پیش‌فرض پنجره (window) و افق (horizon) برای هر تایم‌فریم بر حسب تعداد کندل. */
export const ANALOG_SHAPE = {
  '1h': { window: 48, horizon: 24 },
  '4h': { window: 36, horizon: 18 },
  '1d': { window: 30, horizon: 14 },
};

export function shapeFor(interval) {
  return ANALOG_SHAPE[interval] || { window: 32, horizon: 12 };
}

const median = (xs) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const quantile = (xs, q) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const i = (a.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
};

/**
 * تطبیق آخرین پنجره قیمتی با تاریخچه خودِ رمزارز.
 *
 * @returns {{ok: false, reason: string} | {
 *   ok: true, window: number, horizon: number,
 *   matches: object[], currentSeries: number[],
 *   upCount: number, downCount: number, upRatePct: number,
 *   medianPct: number, bestPct: number, worstPct: number,
 *   p25Pct: number, p75Pct: number,
 *   avgSimilarityPct: number, typicalDrawdownPct: number, typicalRallyPct: number,
 *   direction: 'up'|'down'|'mixed'
 * }}
 */
export function historyMatch(candles, { interval = '1d', topK = 8, minCorr = 0.62 } = {}) {
  if (!Array.isArray(candles) || candles.length < 120) {
    return { ok: false, reason: 'هنوز تاریخچه قیمتی کافی در این تایم‌فریم برای جستجوی الگوهای تکراری وجود ندارد.' };
  }
  const { window, horizon } = shapeFor(interval);
  const r = findPatterns(candles, candles.length - 1, { window, horizon, topK, minCorr });
  if (!r.matches || r.matches.length < 3) {
    return { ok: false, reason: `این روند شباهتی به هیچ‌یک از الگوهای گذشته این رمزارز ندارد (کمتر از ۳ پنجره با شباهت بالای ${Math.round(minCorr * 100)}٪ یافت شد). این یک پاسخ واقعی است: نبودِ تکرار یعنی نبودِ تحلیل.` };
  }

  const finals = r.matches.map((m) => m.futureReturnPct);
  const upCount = finals.filter((v) => v > 0).length;
  const downCount = finals.length - upCount;
  const upRatePct = (upCount / finals.length) * 100;

  return {
    ok: true,
    window, horizon,
    matches: r.matches,
    currentSeries: r.currentSeries,
    upCount, downCount,
    upRatePct: +upRatePct.toFixed(1),
    medianPct: +median(finals).toFixed(2),
    bestPct: +Math.max(...finals).toFixed(2),
    worstPct: +Math.min(...finals).toFixed(2),
    p25Pct: +quantile(finals, 0.25).toFixed(2),
    p75Pct: +quantile(finals, 0.75).toFixed(2),
    avgSimilarityPct: +(r.avgSimilarity * 100).toFixed(1),
    typicalRallyPct: +median(r.matches.map((m) => m.maxUpPct)).toFixed(2),
    typicalDrawdownPct: +median(r.matches.map((m) => m.maxDownPct)).toFixed(2),
    direction: upRatePct >= 62.5 ? 'up' : upRatePct <= 37.5 ? 'down' : 'mixed',
  };
}

/**
 * امتیازدهی روش روی تاریخچه خودِ رمزارز به صورت گام به گام رو به جلو (Walk-forward).
 *
 * در هر کندل ارزیابی، الگویاب فقط کندل‌های پیش از آن را می‌بیند، به صعود یا نزول رأی می‌دهد
 * و در برابر آنچه قیمت در طول `horizon` کندل بعدی واقعاً انجام داده نمره می‌گیرد.
 * خط مبنای کلاس اکثریت در کنار آن گزارش می‌شود، زیرا شکست دادن روند طبیعی خودِ رمزارز
 * تنها نتیجه‌ای است که ارزش واقعی دارد.
 */
export function backtestAnalog(candles, { interval = '1d', topK = 8, minCorr = 0.62, maxPoints = 160 } = {}) {
  const { window, horizon } = shapeFor(interval);
  const need = window * 2 + horizon + 12;
  if (!Array.isArray(candles) || candles.length < need + horizon + 20) {
    return { ok: false, reason: 'تاریخچه کافی برای امتیازدهی صادقانه این روش در این تایم‌فریم وجود ندارد.' };
  }
  const first = need;
  const last = candles.length - 1 - horizon;
  const span = last - first;
  if (span < horizon * 3) return { ok: false, reason: 'تاریخچه کافی برای امتیازدهی صادقانه این روش در این تایم‌فریم وجود ندارد.' };

  // هرگز نزدیک‌تر از یک افق زمانی نباشند: آینده‌های هم‌پوشان نمونه‌های مستقل نیستند
  // و باعث می‌شوند یک برتری کوچک بزرگ‌تر از واقعیت به نظر برسد
  const step = Math.max(horizon, Math.ceil(span / maxPoints));

  let n = 0, hits = 0, ups = 0, confident = 0, confidentHits = 0, noRead = 0;
  let sumBrier = 0;
  for (let i = first; i <= last; i += step) {
    const r = findPatterns(candles, i, { window, horizon, topK, minCorr });
    if (!r.matches || r.matches.length < 3) { noRead++; continue; }
    const actualUp = candles[i + horizon].c > candles[i].c;
    const p = r.probUp;
    n++;
    if (actualUp) ups++;
    if ((p > 0.5) === actualUp) hits++;
    sumBrier += ((actualUp ? 1 : 0) - p) ** 2;
    if (Math.abs(p - 0.5) >= 0.1) { confident++; if ((p > 0.5) === actualUp) confidentHits++; }
  }
  if (n < 20) return { ok: false, reason: 'تعداد نقاط آزمون مستقل در این تایم‌فریم برای معنادار بودن عدد بسیار کم است.' };

  const upRate = ups / n;
  const baseline = Math.max(upRate, 1 - upRate) * 100; // همیشه انتخاب اکثریت
  const accuracy = (hits / n) * 100;

  return {
    ok: true,
    window, horizon, step,
    tests: n,
    skipped: noRead,
    accuracyPct: +accuracy.toFixed(1),
    baselinePct: +baseline.toFixed(1),
    edgePts: +(accuracy - baseline).toFixed(1),
    beatsBaseline: accuracy > baseline,
    upRatePct: +(upRate * 100).toFixed(1),
    brier: +(sumBrier / n).toFixed(3),
    confidentTests: confident,
    confidentAccuracyPct: confident >= 10 ? +((confidentHits / confident) * 100).toFixed(1) : null,
  };
}

/**
 * یک پاراگراف که یافته‌های تطبیق و ارزش امتیاز را بیان می‌کند.
 * به جای نوشتن در بخش نمایش (view)، اینجا نوشته شده تا صفحه، دستیار هوشمند و هر خروجی دیگری
 * دچار تناقض در توصیف اعداد یکسان نشوند.
 */
// "+1.26%", "−7.67%": علامت‌دار، با علامت منفی واقعی.
const sp = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`;

export function analogVerdict(match, score, { symbol = 'این رمزارز', interval = '1d', horizonText = null } = {}) {
  if (!match?.ok) return { headline: match?.reason || 'داده‌ای برای خوانش وجود ندارد.', tone: 'flat', lines: [] };
  const span = horizonText || `${match.horizon} کندل`;
  const lines = [];

  const dirWord = match.direction === 'up' ? 'صعودی' : match.direction === 'down' ? 'نزولی' : 'بدون جهت مشخص';
  // تعدادی که در جهت مورد نظر حرکت کرده‌اند. قبلاً همیشه تعداد صعودها شمرده می‌شد،
  // بنابراین در یک نتیجه نزولی می‌نوشت «۱ مورد از ۸ مورد نزولی شد» در حالی که ۷ مورد نزولی شده بودند.
  const dirCount = match.direction === 'down' ? match.downCount : match.upCount;
  const failed = score && score.ok && !score.beatsBaseline;
  let headline;
  if (match.direction === 'mixed') {
    headline = `${symbol} پیش از این ${match.matches.length} بار این الگوی قیمتی را در نمودار ${interval} تکرار کرده و نتیجه آن دوگانه بوده است — ${match.upCount} صعود و ${match.downCount} نزول. تاریخچه در اینجا سمت خاصی را تأیید نمی‌کند.`;
  } else if (failed) {
    // نمایش تعداد همچنان ارزشمند است؛ اما ارائه آن به عنوان یک سیگنال جهت‌دار، ادعایی است
    // که بک‌تست زیر همین الان آن را رد کرده است.
    headline = `${symbol} پیش از این ${match.matches.length} بار این الگوی قیمتی را در نمودار ${interval} تکرار کرده است — ${dirCount} مورد از آن‌ها در ادامه ${dirWord} بوده‌اند. در این رمزارز، این آمار حرکت بعدی را بهتر از شانس پیش‌بینی نکرده است؛ بنابراین تصویر زیر را به عنوان تاریخچه بخوانید نه یک سیگنال جهت‌دار.`;
  } else {
    headline = `${symbol} پیش از این ${match.matches.length} بار این الگوی قیمتی را در نمودار ${interval} تکرار کرده و ${dirCount} مورد از آن ${match.matches.length} مورد در طول ${span} بعدی ${dirWord} بوده‌اند.`;
  }

  lines.push(`نتیجه معمول: ${sp(match.medianPct)} پس از ${span}، به طوری که نیمی از موارد گذشته در بازه بین ${sp(match.p25Pct)} و ${sp(match.p75Pct)} قرار گرفته‌اند. بهترین حالت ${sp(match.bestPct)} و بدترین حالت ${sp(match.worstPct)} بوده است.`);
  lines.push(`در طول مسیر، آن موارد گذشته پیش از پایان افق زمانی به طور معمول در بهترین حالت تا ${sp(match.typicalRallyPct)} رشد کرده و در بدترین حالت تا ${sp(match.typicalDrawdownPct)} افت داشته‌اند — اگر از حد ضرر استفاده می‌کنید، مسیر حرکت به اندازه نقطه پایان اهمیت دارد.`);
  lines.push(`میانگین شباهت الگوی موارد منطبق: ${match.avgSimilarityPct}٪. عدد پایین‌تر به این معناست که «تکرار» الگو از آنچه روی نمودار به نظر می‌رسد آزادتر و تقریبی‌تر است.`);

  let tone = match.direction === 'up' ? 'up' : match.direction === 'down' ? 'down' : 'flat';

  if (score?.ok) {
    if (score.beatsBaseline) {
      lines.push(`در امتیازدهی روی تاریخچه خودِ این رمزارز، این روش در ${score.tests} آزمون مستقل، ${score.accuracyPct}٪ مواقع جهت را درست تشخیص داده است؛ در مقایسه با ${score.baselinePct}٪ برای حالتی که همیشه نتیجه رایج‌تر انتخاب شود — یعنی یک برتری ${score.edgePts} درصدی. این برتری کوچک است و فقط روی یک رمزارز سنجیده شده، بنابراین با آن به عنوان یک نشانه ضعیف برخورد کنید نه یک پیش‌بینی قطعی.`);
    } else {
      tone = 'warn';
      lines.push(`در امتیازدهی روی تاریخچه خودِ این رمزارز، این روش کارایی لازم را نداشته است: ${score.accuracyPct}٪ تشخیص درست در ${score.tests} آزمون مستقل، در برابر ${score.baselinePct}٪ برای انتخاب همیشگی نتیجه رایج‌تر. در این رمزارز و تایم‌فریم، تطبیق الگو صرفاً توصیفی از گذشته است نه یک پیش‌بینی قابل اتکا — تصویر را بررسی کنید، اما بر اساس درصدها معامله نکنید.`);
    }
    if (score.confidentAccuracyPct !== null) {
      lines.push(`زمانی که تطبیق الگو تمایل واضحی به یک سمت داشت (${score.confidentTests} مورد از ${score.tests} آزمون)، در ${score.confidentAccuracyPct}٪ مواقع درست عمل کرد.`);
    }
    const overall = ANALOG_TESTED[interval];
    if (overall) {
      lines.push(`برای مقایسه کلی، اجرای این روش روی ${overall.coins} رمزارز در نمودار ${interval} به طور میانگین دقت ${overall.meanAccuracy}٪ در برابر خط مبنای ${overall.meanBaseline}٪ داشت و تنها در ${overall.coinsBeatingBaseline} رمزارز از ${overall.coins} رمزارز خط مبنا را شکست داد — تقریباً معادل شانس. تطبیق الگو جایگاه خود را در این صفحه به عنوان تصویری از اتفاقات پس از دوره‌های مشابه به دست می‌آورد، نه به عنوان یک ابزار پیش‌بینی.`);
    }
  } else if (score?.reason) {
    tone = 'warn';
    lines.push(`${score.reason} تا زمانی که امکان امتیازدهی وجود نداشته باشد، موارد منطبق زیر صرفاً تاریخچه هستند، نه مدرک تحلیلی.`);
  }

  return { headline, tone, lines };
}