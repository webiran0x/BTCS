// یک سیگنال، یک پیش‌بینی، یک تخمین زمان‌بندی و سایر تایم‌فریم‌ها را به پاسخی تبدیل می‌کند 
// که کاربر واقعاً به دنبال آن است: چه کاری انجام دهد، با چه قیمتی، برای چه مدتی، 
// کجا خارج شود و چه چیزی فرضیه معامله را نقض می‌کند.
//
// اعداد همیشه در صفحه وجود داشتند — محدوده ورود، حد ضرر، اهداف قیمتی و یک امتیاز از ۱۰۰ — 
// اما خواننده مجبور بود خودشان معنای آن‌ها را در کنار هم بچیند. این ماژول این تجمیع را 
// در یک جا انجام می‌دهد تا صفحه رمزارز، دستیار هوشمند و صفحه مشاوره همگی یک حرف را 
// با کلمات یکسان بزنند.
//
// دو نکته که این فایل عمداً در مورد آن‌ها بسیار محتاط است و هر دو اصلاح اشتباهاتی هستند 
// که در نسخه‌های قبلی منتشر شده بودند:
//
//  ۱. «اطمینان» (Confidence) به معنای بزرگی عدد امتیاز نیست. دسته‌بندی کندل‌ها بر اساس امتیاز 
//     و معامله کردن روی بهترین بازه ظاهری، نتیجه‌ای بدتر از ورود تصادفی داشت؛ بنابراین یک عدد بزرگ 
//     به‌تنهایی باعث ایجاد اطمینان نمی‌شود. برچسب اطمینان اکنون فقط از روی داده‌های اندازه‌گیری‌شده 
//     ساخته می‌شود — امید ریاضی تست‌شده در آن تایم‌فریم، دقت تست‌شده پیش‌بینی در آن تایم‌فریم، و اینکه 
//     آیا خوانش‌ها با هم توافق دارند یا خیر — و خلاصه دقیقاً بیان می‌کند که از کدام‌یک استفاده کرده است. 
//     به‌طور خاص، تایم‌فریمی که برنامه در جای دیگر اعتراف می‌کند هیچ مزیت اندازه‌گیری‌شده‌ای ندارد، 
//     هرگز نمی‌تواند با اطمینان بالا نمایش داده شود (اتفاقی که قبلاً در نمودار روزانه می‌افتاد).
//
//  ۲. تایم‌فریم یک نظر شخصی نیست. خواندن نمودار ۱ ساعته و ۱ روزه دو پاسخ درباره دو بازه قیمتی 
//     متفاوت می‌دهد؛ نمایش آن‌ها به عنوان احکام رقیب در صفحات جداگانه باعث می‌شد برنامه به نظر برسد 
//     که با خودش تناقض دارد. اکنون هر خلاصه همان دیدگاه ترکیبی را به همراه دارد و به صراحت می‌گوید 
//     کدام تایم‌فریم پیشرو است و چرا با هم تفاوت دارند.

import { conflictCheck } from './analyst.js';
import { edgeBand, confluence, upRateFor, SCORE_BUCKETS_TESTED, GEOMETRY_TESTED } from './signals.js';
import { TESTED_ACCURACY } from './predict.js';
import { FORECAST_TESTED } from './forecastview.js';

// ریسک کردن به میزان r% با حد ضرری به فاصله s% به معنای پوزیشنی به ارزش r/s از کل حساب است.
export function sizeText(stopPct) {
  const share = (r) => r / stopPct;
  const x = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} برابر`;
  if (!(stopPct > 0)) return '';
  if (share(2) <= 1) return `با حد ضرر ${stopPct}%، این یعنی پوزیشنی به ارزش حدود ${x(share(1))} تا ${x(share(2))} موجودی حساب شما — نه تمام آن.`;
  if (share(1) <= 1) return `با حد ضرر ${stopPct}%، ریسک ۱٪ به معنای پوزیشنی به ارزش حدود ${x(share(1))} موجودی حساب شماست؛ ریسک ۲٪ بیشتر از کل موجودی شما نیاز دارد که به معنای قرض گرفتن (اهرم) است.`;
  return `با حد ضرری که تنها ${stopPct}% فاصله دارد، حتی کل موجودی شما هم در اینجا کمتر از ۱٪ ریسک می‌کند؛ بنابراین حجم معامله با موجودی شما محدود می‌شود نه با حد ضرر. بزرگ‌تر کردن حجم به معنای استفاده از اهرم (قرض گرفتن) است.`;
}

const pct = (v, dp = 1) => `${v > 0 ? '+' : ''}${Number(v).toFixed(dp)}%`;
const signed = (v) => `${v > 0 ? '+' : ''}${v}`;

/** تایم‌فریم‌هایی که برنامه با یکدیگر تطبیق می‌دهد، از کوتاه‌ترین به بلندترین. */
export const TF_ORDER = ['15m', '1h', '4h', '1d'];

/** پایین‌تر از این مقدار، امتیاز جهت‌دار نیست و نویز محسوب می‌شود. */
const NEUTRAL_BAND = 20;

const dirOf = (score) => (score >= NEUTRAL_BAND ? 1 : score <= -NEUTRAL_BAND ? -1 : 0);
const noEdgeOn = (iv) => (TESTED_ACCURACY.noEdge || []).includes(iv);
// آخرین تست در صورت وجود (TESTED_ACCURACY.recheck)، در غیر این صورت تست زمان انتشار:
// یک مجموعه عدد واحد در صفحه، نه دو عدد متناقض.
const latestTest = (iv) => TESTED_ACCURACY.recheck?.[iv] || null;
const accuracyOn = (iv) => (typeof latestTest(iv)?.hit === 'number' ? latestTest(iv).hit : typeof TESTED_ACCURACY[iv] === 'number' ? TESTED_ACCURACY[iv] : null);
// تعداد رمزارزهایی که رقم یک تایم‌فریم روی آن‌ها اندازه‌گیری شده است.
const coinsOn = (iv) => latestTest(iv)?.coins ?? (latestTest(iv) ? TESTED_ACCURACY.recheck?.coins : null) ?? TESTED_ACCURACY.coins;
// عددی که مدل باید در یک تایم‌فریم شکست می‌داد: همیشه نام بردن از جهت رایج‌تر.
const baselineOn = (iv) => (typeof latestTest(iv)?.baseline === 'number' ? latestTest(iv).baseline : typeof TESTED_ACCURACY.baseline?.[iv] === 'number' ? TESTED_ACCURACY.baseline[iv] : null);

/** مثال: "15m 52.5% · 1h 48.8% · 4h 43.8% · 1d 52.9%" */
function accuracyList() {
  return TF_ORDER.filter((iv) => accuracyOn(iv) !== null)
    .map((iv) => `${iv} ${accuracyOn(iv).toFixed(1)}%`)
    .join(' · ');
}

/**
 * تطبیق تایم‌فریم‌ها در یک دیدگاه واحد.
 * وزن‌دهی دقیقاً همان چیزی است که کارت سیگنال نشان می‌دهد، تا جمله خلاصه 
 * و عدد روی کارت هرگز از هم فاصله نگیرند.
 */
export function reconcileTimeframes(mtf, interval) {
  if (!mtf) return null;
  const picked = {};
  const rows = [];
  for (const iv of TF_ORDER) {
    const s = mtf[iv];
    if (!s?.ok || typeof s.score !== 'number') continue;
    picked[iv] = s;
    rows.push({
      interval: iv,
      score: s.score,
      text: s.text || '—',
      tone: s.tone || 'flat',
      dir: dirOf(s.score),
      accuracyPct: accuracyOn(iv),
      noEdge: noEdgeOn(iv),
    });
  }
  if (rows.length < 2) return null;

  const c = confluence(picked);
  if (!c) return null;

  const dir = dirOf(c.score);
  const here = rows.find((r) => r.interval === interval) || null;
  const anchor = rows[rows.length - 1];

  let relation;
  if (!here) relation = 'outside';
  else if (here.dir !== 0 && dir !== 0) relation = here.dir === dir ? 'aligned' : 'against';
  else if (here.dir === 0 && dir !== 0) relation = 'quiet';
  else relation = 'mixed';

  const split = new Set(rows.map((r) => r.dir)).size > 1;
  // تایم‌فریم‌هایی که یکدیگر را خنثی می‌کنند بازار خنثی نیستند — بلکه یک اختلاف نظر هستند.
  if (relation === 'mixed' && split && here && here.dir !== 0) relation = 'split';
  const span = `${rows[0].interval} تا ${anchor.interval}`;

  return { rows, score: c.score, text: c.text, tone: c.tone, dir, here, anchor, relation, split, span };
}

function rowList(rec) {
  return rec.rows.map((r) => `${r.interval}: ${String(r.text)} (${signed(r.score)})`).join(' · ');
}

/**
 * دو پاراگرافی که مانع از این می‌شوند که سه تایم‌فریم به صورت سه تناقض خوانده شوند:
 * هر تایم‌فریم چه می‌گوید و کدام‌یک پیشرو است.
 */
export function reconcileSteps(rec, interval) {
  if (!rec) return [];
  const combined = `${rec.text} (${signed(rec.score)})`;
  const steps = [];

  let why;
  if (rec.relation === 'against') {
    why = `این نمودار ${interval} وضعیت «${rec.here.text}» را نشان می‌دهد در حالی که دیدگاه ترکیبی در بازه ${rec.span} برابر با «${combined}» است. این اختلاف بر سر بازه زمانی است نه بر سر ماهیت رمزارز: چرخش یک نمودار کوتاه‌مدت در خلاف جهت یک روند بلندمدت معمولاً یک پولبک (اصلاح) درون آن روند است. برای تشخیص جهت از تایم‌فریم بلندتر پیروی کنید و این نمودار را دلیلی برای صبر کردن جهت نقطه ورود بهتر بدانید، نه یک نظر مستقل با وزن برابر.`;
  } else if (rec.relation === 'quiet') {
    why = `این نمودار ${interval} در حال حاضر جهت مشخصی از خود ندارد (امتیاز ${signed(rec.here.score)} در محدوده خنثی است)، در حالی که دیدگاه ترکیبی در بازه ${rec.span} برابر با «${combined}» است. هنوز ماشه‌ای در این تایم‌فریم چکانده نشده است — دیدگاه اصلی همان دیدگاه ترکیبی است و از این نمودار برای زمان‌بندی ورود به آن استفاده می‌شود.`;
  } else if (rec.relation === 'aligned') {
    why = `این نمودار ${interval} و دیدگاه ترکیبی در بازه ${rec.span} هم‌جهت هستند: ${combined}. هم‌سویی در بازه‌های زمانی مختلف قوی‌ترین حالت این ساختار است. با این حال، این هنوز یک پیش‌بینی قطعی نیست — فقط به این معنی است که شواهد در دو جهت مخالف نمی‌کشند.`;
  } else if (rec.relation === 'split') {
    why = `این نمودار ${interval} وضعیت «${rec.here.text}» را نشان می‌دهد، اما سایر تایم‌فریم‌ها به جهت مخالف اشاره می‌کنند و برآیند وزن‌دار در بازه ${rec.span} به ${signed(rec.score)} می‌رسد (خنثی می‌شود). چنین وضعیتی نشانه اختلاف نظر در بازار است نه یک روند؛ اقدام کردن بر اساس یک نمودار که صرفاً پرسر‌و‌صداتر است باعث می‌شود در سمت اشتباه حرکت قرار بگیرید.`;
  } else if (rec.relation === 'outside') {
    why = ['3d', '1w', '1M'].includes(interval)
      ? `این نمودار ${interval} بلندتر از هر تایم‌فریمی است که سابقه اندازه‌گیری‌شده دارد، بنابراین هیچ‌چیز روی آن تست نشده است. دیدگاه ترکیبی در بازه ${rec.span} برابر با «${combined}» است؛ این نمودار را به عنوان پیش‌زمینه دید بلندمدت بخوانید، نه یک سیگنال تست‌شده.`
      : `این نمودار ${interval} کوتاه‌تر از هر تایم‌فریمی است که سابقه اندازه‌گیری‌شده دارد، بنابراین هیچ‌چیز روی آن تست نشده است. دیدگاه ترکیبی در بازه ${rec.span} برابر با «${combined}» است؛ از این نمودار فقط برای زمان‌بندی دقیق ورود استفاده کنید.`;
  } else {
    why = `تایم‌فریم‌ها دچار دوگانگی هستند و دیدگاه ترکیبی خنثی (${signed(rec.score)}) به دست آمده است. وقتی بازه‌های زمانی این‌گونه به طور مساوی با هم مخالفند، هیچ روندی برای معامله وجود ندارد، صرف‌نظر از اینکه هر نمودار به‌تنهایی چه می‌گوید.`;
  }

  steps.push({
    label: 'وضعیت در تایم‌فریم‌های مختلف',
    text: `${rowList(rec)}. ${why}`,
  });

  const accs = accuracyList();
  const noEdge = TF_ORDER.filter(noEdgeOn);
  let follow = `تایم‌فریم‌های بلندتر جهت را تعیین می‌کنند و تایم‌فریم‌های کوتاه‌تر زمان‌بندی را؛ بنابراین در جایی که اختلاف نظر دارند، خوانش ${rec.anchor.interval} پیشرو است و نمودارهای کوتاه‌تر تصمیم می‌گیرند که چه زمانی بر اساس آن اقدام شود.`;
  if (accs) {
    follow += ` مدل پیش‌بینی در همه آن‌ها به یک اندازه خوب عمل نمی‌کند — دقت جهت اندازه‌گیری‌شده روی داده‌های دیده‌نشده در میان ${TESTED_ACCURACY.recheck ? `حداکثر ${TESTED_ACCURACY.recheck.coins}` : TESTED_ACCURACY.coins} رمزارز برابر با ${accs} بوده است.`;
  }
  if (noEdge.length) {
    follow += ` در تایم‌فریم‌های ${noEdge.join('، ')} امتیاز مدل برابر یا کمتر از نرخ پایه (حدس همیشگی جهت غالب) بوده است، بنابراین درصد احتمال نمایش‌داده‌شده در آنجا سندیت ندارد — در آن نمودارها ساختار روند را بخوانید و درصدها را نادیده بگیرید.`;
  }
  steps.push({ label: 'از کدام تایم‌فریم پیروی کنیم', text: follow });

  return steps;
}

/**
 * سطح اطمینان (Confidence)، که فقط از روی موارد اندازه‌گیری‌شده ساخته می‌شود.
 */
function confidenceFor({ interval, strength, conflict, coinAcc, relation, expectancyR, geometryTested = true }) {
  const tfAcc = accuracyOn(interval);
  const reasons = [];
  let level = 'پایین';

  if (strength >= 25) level = 'متوسط';

  const geometryPays = expectancyR === null || expectancyR === undefined || !geometryTested ? null : expectancyR > 0;
  if (strength >= 45 && tfAcc !== null && tfAcc >= 55 && geometryPays === true && relation !== 'against' && !conflict) {
    level = 'بالا';
  }

  if (conflict) { level = 'پایین'; reasons.push('نمودار و مدل پیش‌بینی با هم اختلاف نظر دارند'); }
  if (relation === 'against') { level = 'پایین'; reasons.push('این تایم‌فریم در خلاف جهت تایم‌فریم‌های بلندتر است'); }
  if (relation === 'split') { level = 'پایین'; reasons.push('تایم‌فریم‌ها با هم تناقض دارند و برآیند آن‌ها بدون روند است'); }
  if (noEdgeOn(interval)) {
    if (level === 'بالا') level = 'متوسط';
    reasons.push(`مدل پیش‌بینی هیچ مزیت اندازه‌گیری‌شده‌ای در ${interval} ندارد (${tfAcc !== null ? tfAcc.toFixed(1) : '—'}%)`);
  }
  if (geometryPays === false) {
    if (level === 'بالا') level = 'متوسط';
    reasons.push(`این فواصل حد ضرر و حد سود در تست‌های تایم‌فریم ${interval} نتیجه منفی داشته‌اند`);
  }
  if (coinAcc !== null && coinAcc !== undefined && coinAcc < 52) {
    if (level === 'بالا') level = 'متوسط';
    reasons.push(`دقت پیش‌بینی روی این رمزارز فقط ${coinAcc}% است`);
  }
  if (strength < 25) reasons.push('اندیکاتورها توافق بسیار ضعیفی دارند');
  if (tfAcc === null) {
    level = 'پایین';
    reasons.push(`هیچ‌چیز روی نمودار ${interval} اندازه‌گیری نشده است: نه مدل پیش‌بینی و نه این سطوح روی آن تست نشده‌اند`);
  }

  const why = reasons.length
    ? `سطح اطمینان «${level}» ارزیابی شد زیرا ${reasons.join('، و ')}.`
    : `سطح اطمینان «${level}» ارزیابی شد: ${['عدم وجود تضاد بین خوانش‌ها', geometryPays === true ? `این فواصل حد ضرر و سود در ${interval} نتیجه مثبت داشته‌اند` : null, `مدل پیش‌بینی سابقه اندازه‌گیری‌شده موفقی در اینجا دارد (${tfAcc.toFixed(1)}%)`].filter(Boolean).join('، ')}. این توصیف شواهد است، نه یک تضمین.`;

  return { level, why };
}

/**
 * تولید خلاصه کامل معاملاتی
 */
export function tradeSummary({ signal, forecast, timing, interval, horizonText, mtf = null, fmt = (v) => String(v), dur = (bars) => `${bars} کندل` }) {
  if (!signal?.ok) {
    return {
      verdict: 'بدون خوانش', tone: 'flat',
      headline: 'تاریخچه قیمتی کافی در این تایم‌فریم برای شکل‌گیری دیدگاه وجود ندارد.',
      steps: [], caveats: [], confidence: 'نامشخص', confidenceWhy: '', reconciled: null,
    };
  }

  const side = signal.plan?.side ?? null;
  const score = signal.score;
  const conflict = conflictCheck(signal, forecast);
  const strength = Math.abs(score);
  const rec = reconcileTimeframes(mtf, interval);
  const relation = rec ? rec.relation : null;

  const acc = forecast?.validatedAccuracyPct ?? null;
  const expectancyR = signal.plan?.expectancyR ?? null;
  const geometryTested = signal.plan?.geometryTested ?? true;
  const { level: confidence, why: confidenceWhy } =
    confidenceFor({ interval, strength, conflict, coinAcc: acc, relation, expectancyR, geometryTested });

  const steps = [];
  const caveats = [];
  let verdict, tone, headline;

  const readingText = signal.text || 'بدون روند مشخص';
  const reading = readingText;
  const measured = upRateFor(interval, score);

  if (conflict) {
    verdict = 'اختلاف در خوانش‌ها';
    tone = 'warn';
    headline = `اندیکاتورها متمایل به ${side === 'short' ? 'نزول' : 'صعود'} هستند در حالی که مدل پیش‌بینی جهت مخالف را نشان می‌دهد (${conflict.probUp}% احتمال صعود). وقتی این دو با هم اختلاف دارند، موقعیتی برای اقدام وجود ندارد.`;
    caveats.push('صبر کردن تا زمانی که نمودار و مدل پیش‌بینی به یک جهت اشاره کنند، معمولاً بهتر از انتخاب یکی از آن‌هاست.');
  } else if ((relation === 'against' || relation === 'split') && side) {
    verdict = 'صبر کنید — اختلاف بین تایم‌فریم‌ها';
    tone = 'warn';
    headline = relation === 'split'
      ? `این نمودار ${interval} تمایل به ${side === 'short' ? 'فروش' : 'خرید'} دارد، اما سایر تایم‌فریم‌ها به جهت مخالف اشاره می‌کنند و در بازه ${rec.span} همه چیز یکدیگر را خنثی می‌کند (${signed(rec.score)}). بازار دوپاره نشانه اختلاف نظر است نه روند، و تصمیم صادقانه این است که تا روشن شدن وضعیت خارج بمانید.`
      : `این نمودار ${interval} تمایل به ${side === 'short' ? 'فروش' : 'خرید'} دارد، اما در بازه ${rec.span} خوانش ترکیبی «${rec.text}» (${signed(rec.score)}) است. حرکت یک نمودار در خلاف جهت بقیه بیشتر نشانه اصلاح است تا تغییر روند، پس منتظر هم‌سو شدن آن‌ها بمانید.`;
  } else if (side === 'long') {
    verdict = reading;
    tone = 'warn';
    headline = measured
      ? `نمودار ${interval} وضعیت «${readingText}» را نشان می‌دهد. این یک توصیف است نه توصیه به خرید: در بررسی ${SCORE_BUCKETS_TESTED.bars.toLocaleString()} کندل از ${SCORE_BUCKETS_TESTED.coins} رمزارز، خوانش‌هایی در این محدوده در ${measured.upRatePct}% مواقع با قیمت بالاتر دنبال شده‌اند — ${measured.upRatePct < 50 ? 'کمی کمتر از پرتاب سکه' : 'تقریباً مشابه پرتاب سکه'}. سطوح زیر صرفاً هندسه این ستاپ هستند اگر به دلایل خودتان قصد معامله دارید.`
      : `نمودار ${interval} وضعیت «${readingText}» را نشان می‌دهد. این تایم‌فریم اندازه‌گیری نشده است، بنابراین سطوح زیر را فقط به عنوان هندسه نمودار در نظر بگیرید نه مدرک قطعی.`;
  } else if (side === 'short') {
    verdict = reading;
    tone = 'warn';
    headline = measured
      ? `نمودار ${interval} وضعیت «${readingText}» را نشان می‌دهد. در بررسی ${SCORE_BUCKETS_TESTED.bars.toLocaleString()} کندل، خوانش‌هایی در این محدوده در ${measured.upRatePct}% مواقع با قیمت بالاتر دنبال شده‌اند — بنابراین این یک سیگنال قطعی فروش نیست. اگر این رمزارز را دارید، سطوح زیر ساختار فعلی نمودار را نشان می‌دهند.`
      : `نمودار ${interval} وضعیت «${readingText}» را نشان می‌دهد. این تایم‌فریم اندازه‌گیری نشده است، بنابراین سطوح زیر را فقط به عنوان ساختار هندسی در نظر بگیرید.`;
  } else {
    verdict = reading;
    tone = 'flat';
    headline = rec && rec.dir !== 0
      ? `هیچ‌چیز در نمودار ${interval} به حد نصاب لازم برای اقدام نمی‌رسد، اگرچه در بازه ${rec.span} خوانش ترکیبی «${rec.text}» (${signed(rec.score)}) است. دست نگه داشتن خود یک پوزیشن معاملاتی است و بیشتر از آنچه مردم فکر می‌کنند تصمیم درستی است.`
      : 'هیچ‌چیز در اینجا به حد نصاب لازم برای اقدام نمی‌رسد. دست نگه داشتن خود یک پوزیشن معاملاتی است و بیشتر از آنچه مردم فکر می‌کنند تصمیم درستی است.';
  }

  const planUsable = signal.plan && !conflict && relation !== 'against' && relation !== 'split';
  const p = signal.plan;
  if (planUsable) {
    const buying = p.side === 'long';
    steps.push({
      label: 'این چیست',
      text: buying
        ? `هندسه نمودار برای ${signal.coinSymbol || 'این رمزارز'} در تایم‌فریم ${interval} — یک محدوده ورود، حد ضرر و اهداف قیمتی که بر اساس نوسان همین تایم‌فریم اندازه‌گیری شده‌اند. این سیگنال خرید نیست؛ سابقه آماری چنین خوانش‌هایی در بالا ذکر شد. اگر معامله می‌کنید، این‌ها سطوح کلیدی هستند.`
        : `هندسه نمودار برای کاهش ریسک و حجم، اندازه‌گیری‌شده بر اساس نوسان این تایم‌فریم. دستور به فروش استقراضی (شورت) نیست — فقط توصیفی از محل قرارگیری ساختار بازار است.`,
    });
    steps.push({
      label: buying ? 'محدوده ورود (در صورت معامله)' : 'سطح زیر نظر',
      text: buying
        ? `بین ${fmt(p.entryZone[0])} تا ${fmt(p.entryZone[1])}. خرید بالاتر از این محدوده به معنای پرداخت قیمت بدتر برای همان میزان ریسک است؛ بنابراین اگر قیمت فرار کرده، به جای تعقیب کردن آن منتظر بازگشت بمانید.`
        : `در صورت بسته شدن کندل زیر ${fmt(p.stopLoss)}، یا بلافاصله اگر در سود هستید و می‌خواهید از آن محافظت کنید.`,
    });
    if (buying) {
      steps.push({
        label: 'کجا سیو سود کنیم',
        text: `سود را پله‌ای برداشت کنید: ${p.takeProfits.map(fmt).join('، و سپس ')}. یک روش رایج این است که یک‌سوم حجم را در هدف اول بفروشید و حد ضرر را به نقطه ورود منتقل کنید تا بقیه معامله بدون ریسک شود.`,
      });
    }
    steps.push({
      label: 'کجا تحلیل شما اشتباه است (حد ضرر)',
      text: `${fmt(p.stopLoss)}. این سطح ${p.riskPct}% پایین‌تر از نقطه ورود شماست — اگر قیمت از آن عبور کند و بسته شود، دلیل انجام این معامله از بین رفته است. این حد ضرر را هنگام ثبت سفارش قرار دهید، نه بعداً.`,
    });
    steps.push({ label: 'چه مقدار حجم', text: `حداکثر ۱ تا ۲ درصد از کل حساب خود را در این معامله ریسک کنید. ${sizeText(p.riskPct)}` });
  } else if (!p) {
    const waits = signal.waitFor?.length ? signal.waitFor : ['هنوز هیچ ماشه‌ای (تریگر) شکل نگرفته است.'];
    steps.push({ label: 'منتظر چه چیزی باشیم', text: waits.join(' · ') });
  } else if (relation === 'against' || relation === 'split') {
    steps.push({
      label: 'منتظر چه چیزی باشیم',
      text: `سطوح زیر در صورت نیاز همچنان پابرجا هستند، اما معامله تنها زمانی ارزش ورود دارد که نمودار ${rec.anchor.interval} نیز موافق باشد. منتظر بمانید تا خوانش ${interval} به جای اقدام عجولانه، با دیدگاه ترکیبی هم‌جهت شود.`,
    });
  }

  if (timing?.bars > 0 && !conflict) {
    steps.push({
      label: 'چه مدت طول می‌کشد',
      text: timing.priceless
        ? `در ستاپ‌های مشابه گذشته، ${timing.rising ? 'سقف' : 'کف'} در طول ${dur(timing.horizonBars)} آینده حدود ${dur(timing.bars)} بعد رخ داده است. این فقط زمان را نشان می‌دهد، نه جهت یا مقدار حرکت را؛ جهت در این نمودار قابل اعتماد نیست. از آن برای برنامه‌ریزی خروج استفاده کنید، نه برای حذف حد ضرر.`
        : timing.rising
        ? `قدرت حرکت در ستاپ‌های مشابه گذشته معمولاً حدود ${dur(timing.bars)} دوام آورده و در نزدیکی ${fmt(timing.targetPrice)} به اوج رسیده است${timing.turnBars ? `، و سپس حدود ${dur(timing.turnBars)} دیگر تغییر جهت داده است` : ''}. مزیت زمان‌سنجی کوچک است — از آن برای خروج استفاده کنید، هرگز حد ضرر را حذف نکنید.`
        : `ضعف حرکت در ستاپ‌های مشابه معمولاً حدود ${dur(timing.bars)} ادامه داشته و در نزدیکی ${fmt(timing.targetPrice)} کف ساخته است؛ صبر کردن ممکن است قیمت بهتری بدهد، اما این یک الگوی تاریخی است نه پیش‌بینی قطعی.`,
    });
  }

  if (forecast && !conflict && forecast.directionReliable === false) {
    const why = TESTED_ACCURACY.recheck?.[interval]
      ? `در بازآزمایی تست انتشار روی کندل‌های جدید (${TESTED_ACCURACY.recheck.measuredOn})، پیش‌بینی‌های آن در ${TESTED_ACCURACY.recheck[interval].hit}% مواقع درست بود در مقابل ${TESTED_ACCURACY.recheck[interval].baseline}% برای انتخاب همیشگی جهت غالب`
      : interval in TESTED_ACCURACY.directionTrust
      ? 'در تست انتشار، تمایلات مدل در اینجا هیچ اطلاعات مفیدی نداشتند'
      : 'مدل هرگز روی این نمودار تست نشده است';
    steps.push({
      label: 'مدل هوش مصنوعی چه چیزی اضافه می‌کند',
      text: `جهت قابل اعتمادی در نمودار ${interval} وجود ندارد: ${why}، بنابراین احتمال خام ${forecast.rawProbUpPct}% صعود نشان‌دهنده شانس واقعی نیست. بخش مفید آن بازه قیمتی است: ${fmt(forecast.wideRange[0])} تا ${fmt(forecast.wideRange[1])} در طول ${horizonText || 'افق پیش‌بینی'}؛ بازه‌ای که در تست‌ها ${FORECAST_TESTED.centred[interval]?.coins === 24 ? `${FORECAST_TESTED.centred[interval].band80}% از ${FORECAST_TESTED.centred[interval].tests.toLocaleString('en-US')} نتیجه واقعی در ${interval}` : `${TESTED_ACCURACY.bandsAll.band80}% از نتایج`} را در بر گرفته است.`,
    });
  } else if (forecast && !conflict) {
    const dir = forecast.probUpPct >= 50 ? 'صعود' : 'نزول';
    const tfAcc = accuracyOn(interval);
    let text = `احتمال ${forecast.probUpPct}% برای ${dir} در طول ${horizonText || 'افق پیش‌بینی'}`;
    if (acc !== null) text += `، از مدلی که در داده‌های جدید و دیده‌نشده اخیر در ${acc}% مواقع جهت را درست تشخیص داده است`;
    text += '.';
    if (noEdgeOn(interval)) {
      text += ` به این عدد با تردید نگاه کنید: در بررسی ${coinsOn(interval)} رمزارز، امتیاز مدل در تایم‌فریم ${interval} برابر با ${tfAcc !== null ? tfAcc.toFixed(1) : '—'}% بوده که پایین‌تر از نرخ پایه ${baselineOn(interval) ?? '—'}% (انتخاب همیشگی جهت غالب) است؛ بنابراین فقط برای تکمیل اطلاعات نمایش داده شده و بخشی از حکم نهایی نیست.`;
    }
    steps.push({ label: 'مدل هوش مصنوعی چه چیزی اضافه می‌کند', text });
  }

  if (rec) steps.push(...reconcileSteps(rec, interval));

  const { tested } = edgeBand(interval, signal.score);
  if (tested && !conflict) {
    const r = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}R`;
    caveats.push(`معنای واقعی امتیاز چیست: میزان توافق فعلی اندیکاتورها، نه پیش‌بینی سود. معامله روی بهترین بازه ظاهری در این تایم‌فریم (امتیازهای ${tested.lo} تا ${tested.hi}) در ${tested.trades.toLocaleString('en-US')} معامله تست‌شده روی نیمه جدیدتر داده‌ها، بازدهی ${r(tested.tradedR)} به ازای هر معامله داشت، در مقابل ${r(tested.randomR)} برای ورود تصادفی در هر کندل با قوانین یکسان${tested.older ? `؛ در نیمه قدیمی‌تر داده‌ها نیز بازدهی ${r(tested.older.tradedR)} در مقابل ${r(tested.older.randomR)} داشت` : ''}. این برتری در هر دو دوره حفظ نشد، پس امتیاز بالاتر به معنای معامله بهتر نیست.`);
  }
  if (measured) {
    caveats.push(`در اندازه‌گیری ${SCORE_BUCKETS_TESTED.bars.toLocaleString()} کندل از ${SCORE_BUCKETS_TESTED.coins} رمزارز، سهم خوانش‌هایی که با قیمت بالاتر دنبال می‌شوند با افزایش این امتیاز «کاهش» می‌یابد — در تایم‌فریم ${interval}، از ${SCORE_BUCKETS_TESTED.upRateByBucket[interval]?.extendedDown ?? '—'}% در پایین‌ترین نقطه مقیاس به ${SCORE_BUCKETS_TESTED.upRateByBucket[interval]?.extendedUp ?? '—'}% در بالاترین نقطه می‌رسد. امتیاز بالا یعنی حرکت بیش از حد کشیده شده (اشباع)، نه اینکه ادامه خواهد یافت. معامله در جهت معکوس هم جواب نمی‌دهد: هر دو جهت با احتساب کارمزد تست شدند و هیچ‌کدام سودده نبودند.`);
  }

  if (p && expectancyR !== null && expectancyR !== undefined) {
    if (expectancyR <= 0) {
      caveats.push(`در تست روی ${GEOMETRY_TESTED.coins} رمزارز${GEOMETRY_TESTED.entries[interval] ? ` (${GEOMETRY_TESTED.entries[interval].toLocaleString('en-US')} نقطه ورود)` : ''}، ورود در این تایم‌فریم با این فواصل حد ضرر و سود، نتیجه‌ای معادل ${expectancyR.toFixed(3)}R به ازای هر معامله داشت — که حتی قبل از کسر لغزش قیمت (Slippage) کمی منفی است. سطوح فقط جهت اطلاع نمایش داده شده‌اند؛ طبق شواهد، این تایم‌فریم برای خواندن و تحلیل است نه معامله کردن.`);
      tone = 'warn';
    } else if (planUsable) {
      steps.push({
        label: 'آیا این معامله می‌ارزد؟',
        text: `در اندازه‌گیری ${GEOMETRY_TESTED.entries[interval] ? `${GEOMETRY_TESTED.entries[interval].toLocaleString('en-US')} نقطه ورود` : 'تمام کندل‌ها'} در میان ${GEOMETRY_TESTED.coins} رمزارز، این ترکیب حد ضرر و سود پس از کسر کارمزد بازدهی ${expectancyR > 0 ? '+' : ''}${expectancyR.toFixed(3)}R به ازای هر معامله داشته است. سودی کوچک و مثبت، که تنها در صورتی محقق می‌شود که دقیقاً طبق نقاط خروج نوشته‌شده عمل کنید.`,
      });
    }
  }

  if (noEdgeOn(interval)) {
    caveats.push(`در نمودار ${interval} مدل پیش‌بینی روی داده‌های دیده‌نشده در ${coinsOn(interval)} رمزارز امتیاز ${accuracyOn(interval).toFixed(1)}% کسب کرد — که بالاتر از نرخ پایه ${baselineOn(interval) ?? '—'}% نیست، پس هیچ مزیتی در اینجا ندارد. هیچ‌چیز در این تایم‌فریم با اطمینان بالا ارائه نمی‌شود، صرف‌نظر از اینکه امتیاز چقدر باشد.`);
  }
  if (acc !== null && acc < 52) caveats.push(`مدل پیش‌بینی هیچ مزیت اندازه‌گیری‌شده‌ای روی این رمزارز و تایم‌فریم ندارد (${acc}%)، بنابراین در اینجا وزن بیشتری به سیگنال خود نمودار بدهید.`);
  if (strength < 25 && !conflict) caveats.push('این یک خوانش ضعیف است. امتیاز کوچک یعنی اندیکاتورها به سختی با هم موافقند، که دلیلی برای کاهش حجم یا صرف‌نظر کردن از معامله است.');
  caveats.push('این صرفاً خوانش داده‌های عمومی بازار است و توصیه مالی نیست. در هر معامله از حد ضرر استفاده کنید و فقط به اندازه‌ای ریسک کنید که توان از دست دادنش را دارید.');

  return { verdict, tone, headline, steps, caveats, confidence, confidenceWhy, reconciled: rec };
}

/** همان خلاصه در قالب مارک‌داون ساده، برای دستیار هوشمند و خروجی گرفتن. */
export function summaryMarkdown(s) {
  if (!s || !s.steps) return '';
  const lines = [`**${s.verdict}** — ${s.headline}`, ''];
  if (s.confidence && s.confidence !== 'none' && s.confidence !== 'نامشخص') {
    lines.push(`_سطح اطمینان: ${s.confidence}. ${s.confidenceWhy || ''}_`.trim(), '');
  }
  for (const st of s.steps) lines.push(`- **${st.label}:** ${st.text}`);
  if (s.caveats.length) {
    lines.push('');
    for (const c of s.caveats) lines.push(`_${c}_`);
  }
  return lines.join('\n');
}

export { pct };