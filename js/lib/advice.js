// یک تحلیل برای هر رمزارز — و در صورت وجود شواهد کافی، یک نتیجه‌گیری (Verdict).
//
// اپلیکیشن از قبل چهار تحلیل مستقل برای هر رمزارز تولید می‌کند: سیگنال تکنیکال،
// احتمال جهت‌گیری مدل ترکیبی، مسیر زمانی الگوها، و بررسی تاریخچه چندساله. هر یک از این‌ها
// میزان دقت گذشته خود را منتشر می‌کنند. این ماژول آن‌ها را *بر اساس همان دقت اندازه‌گیری‌شده*
// وزن‌دهی و ترکیب می‌کند، بنابراین تحلیلی که برتری اثبات‌شده‌ای ندارد تأثیر بسیار کمی بر نتیجه
// نهایی می‌گذارد و در نهایت نتیجه به همراه سطوح معاملاتی در زبان ساده بیان می‌شود.
//
// این تحلیل از نوع «آنچه شواهد می‌گویند» است و یک وعده تضمینی نیست.
// هیچ‌چیز در اینجا معامله‌ای را اجرا نمی‌کند.

import { upRateFor } from './signals.js';
import { accuracyFor, shownProbUp, directionReliable } from './predict.js';
import { TESTED_TIMING, condenseTiming } from './timing.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// هر ورودی تنها به اندازه سابقه عملکردش اعتبار دارد. دقت ۵۰٪ مانند شیر یا خط انداختن است و وزن صفر می‌گیرد؛
// دقت ۶۰٪ یک برتری قوی در بازار رمزارز محسوب می‌شود.
const edgeWeight = (accuracy, floor = 0.5) =>
  accuracy === null || accuracy === undefined ? 0.15 : clamp((accuracy - floor) / 0.1, 0, 1);

export function adviseCoin({ signal, forecast, timing, history, holding = null, interval = '4h', trust = undefined } = {}) {
  if (!signal?.ok) return { ok: false, reason: signal?.reason || 'سیگنالی برای این رمزارز وجود ندارد.' };

  const parts = [];
  const reasons = [];

  // ۱. سیگنال تکنیکال.
  //
  // فرض اصلی این ماژول این است که هر تحلیل فقط به اندازه سابقه عملکردش وزن می‌گیرد —
  // و این مورد تنها استثنا بود: وزن ثابت 0.9 (بزرگ‌ترین وزن بین چهار بخش) که هرگز از edgeWeight() عبور نکرده بود.
  // این همان تحلیلی است که بعدها مشخص شد در جهت مخالف عمل می‌کند:
  // در میان ۱.۵۸ میلیون کندل از ۱۰۶ رمزارز (SCORE_BUCKETS_TESTED)، سهم کندل‌هایی که رشد کرده‌اند با افزایش امتیاز کاهش می‌یابد.
  //
  // بنابراین اکنون این بخش نیز همانند سایر بخش‌ها از فیلتر عبور می‌کند و از دقت جهتی اندازه‌گیری‌شده‌اش استفاده می‌کند:
  // برای امتیاز مثبت، میزان رشد واقعی کندل‌ها در این بازه؛ برای امتیاز منفی، میزان ریزش واقعی آن‌ها.
  // هر دو زیر ۵۰٪ قرار می‌گیرند، بنابراین فیلتر وزن صفر به آن می‌دهد که پاسخ درست است و نه یک استثنا.
  // این مورد همچنان در دلایل باقی می‌ماند چون ارزش دیدن دارد؛ اما دیگر در رای‌گیری دخالت نمی‌کند.
  const bucket = upRateFor(interval, signal.score);
  const dirAcc = bucket === null ? null
    : (signal.score >= 0 ? bucket.upRatePct : 100 - bucket.upRatePct) / 100;
  // آستانه روی ۵۵٪ تنظیم شده است، نه ۵۰٪. اعتبار دادن به هر عددی بالاتر از شیر یا خط اجازه می‌داد
  // تحلیلی در باند خنثی بر اساس نمونه‌ای با ۵۱.۹٪ رشد، رای نزولی صادر کند — یعنی نویز به جای شواهد.
  // هیچ باند اندازه‌گیری‌شده‌ای به ۵۵٪ نزدیک نمی‌شود، بنابراین وزن این بخش امروز صفر است؛
  // این به عنوان یک آستانه نوشته شده تا اگر در اندازه‌گیری‌های آینده برتری واقعی مشاهده شد، سیستم به طور خودکار فعال شود.
  const SIGNAL_EDGE_FLOOR = 0.55;
  const signalWeight = bucket === null ? 0 : edgeWeight(dirAcc, SIGNAL_EDGE_FLOOR) * 0.9;
  parts.push({ key: 'signal', value: clamp(signal.score / 60, -1, 1), weight: signalWeight });
  reasons.push({
    tone: 'flat',
    text: `تحلیل نمودار: ${signal.text} (${signal.score > 0 ? '+' : ''}${signal.score}/100)`
      + (bucket === null
        ? ' — این تایم‌فریم هرگز اندازه‌گیری نشده است، بنابراین در نتیجه نهایی هیچ وزنی ندارد.'
        : `. در بررسی ${bucket.bars.toLocaleString()} کندل، کندل‌های این باند در ${bucket.upRatePct}% مواقع با قیمت بالاتری دنبال شده‌اند${signalWeight > 0 ? '.' : '، بنابراین در نتیجه نهایی وزنی ندارد.'}`),
  });

  // ۲. مدل ترکیبی هوش مصنوعی، وزن‌دهی‌شده بر اساس دقت خارج از نمونه (Out-of-sample) روی این رمزارز.
  if (forecast?.ok) {
    const shown = shownProbUp(forecast.probUp, interval, trust);
    const reliable = directionReliable(interval, trust);
    const edge = (shown - 0.5) * 2;
    // دقت فقط بالاتر از حالتی حساب می‌شود که انتخاب جهت رایج‌تر در همان داده‌ها کسب می‌کرده، نه بالاتر از ۵۰٪:
    // دقت ۶۲٪ در بازه‌ای که ۶۰٪ مواقع صعودی بوده هیچ مهارتی محسوب نمی‌شود. و در مواردی که تست واک-فوروارد منتشرشده
    // هیچ برتری‌ای در این تایم‌فریم پیدا نکرده (1m، 1h، 4h)، اجرای اعتبارسنجی کوتاه‌مدت یک رمزارز مجاز نیست آن را نقض کند — ضریب یک‌چهارم اعمال می‌شود.
    const floor = Math.max(0.5, Number.isFinite(forecast.ensemble?.baseline) ? forecast.ensemble.baseline : 0.5);
    const tested = accuracyFor(interval);
    const noTestedEdge = Boolean(tested && !tested.beatsBaseline);
    const w = reliable ? edgeWeight(forecast.ensemble?.accuracy, floor) * 1.4 * (noTestedEdge ? 0.25 : 1) : 0;
    parts.push({ key: 'forecast', value: clamp(edge * 2.5, -1, 1), weight: w });
    const accTxt = forecast.ensemble?.accuracy !== null && forecast.ensemble?.accuracy !== undefined
      ? `با دقت ${(forecast.ensemble.accuracy * 100).toFixed(0)}٪ روی داده‌های دیده‌نشده`
      : 'دقت اندازه‌گیری نشده است';
    reasons.push(!reliable ? {
      tone: 'flat',
      text: `پیش‌بینی هوش مصنوعی: جهت قابل اعتمادی در نمودارهای ${interval} وجود ندارد (تمایل خام ${(forecast.probUp * 100).toFixed(0)}٪ صعودی)، بنابراین رایی صادر نمی‌کند.`,
    } : {
      tone: shown >= 0.54 ? 'good' : shown <= 0.46 ? 'bad' : 'flat',
      text: `پیش‌بینی هوش مصنوعی: احتمال رشد ${(shown * 100).toFixed(0)}٪ (${accTxt})${noTestedEdge
        ? ` — در نمودارهای ${interval} نتوانسته خط مبنا را در تست‌ها شکست دهد (${tested.accuracyPct}٪ در برابر ${tested.baselinePct}٪)، بنابراین تاثیر بسیار کمی دارد`
        : w < 0.25 ? ' — برتری اندازه‌گیری‌شده کم است، بنابراین تاثیر بسیار کمی دارد' : ''}.`,
    });
  }

  // ۳. تاریخچه چندساله: اتفاقات رخ‌داده در آخرین دفعاتی که نمودار شبیه به شرایط فعلی بوده است.
  if (history?.ok) {
    const s = history.analogs.stats[history.horizon];
    const w = edgeWeight(history.validation?.accuracy) * 0.8;
    parts.push({ key: 'history', value: clamp((s.probUp - 0.5) * 3, -1, 1), weight: w });
    reasons.push({
      tone: s.probUp >= 0.6 ? 'good' : s.probUp <= 0.4 ? 'bad' : 'flat',
      text: `سال‌های گذشته: ${s.upCount} مورد از ${s.total} نمودار مشابه در طول ${history.horizon} روز رشد کرده‌اند (میانه ${s.median >= 0 ? '+' : ''}${s.median.toFixed(1)}%)${w < 0.2 ? ' — این روش روی این رمزارز عملکردی شبیه به شیر یا خط دارد' : ''}.`,
    });
  }

  // ۴. زمان‌بندی (Timing): آیا هنوز فضایی برای ادامه روند باقی مانده، یا سقف قیمت پشت سر گذاشته شده است؟
  let timingNote = null;
  if (timing?.ok && timing.shaped) {
    const room = timing.rising ? clamp(1 - timing.peak.bar / timing.horizonBars, 0, 1) : 0;
    // زمان‌بندی قبلاً رای قطعی ۰.۵ به جهت صعودی یا نزولی می‌داد. اما سابقه اندازه‌گیری‌شده آن
    // (TESTED_TIMING) مربوط به زمانِ رسیدن سقف یا کف است و جهت مسیری که زمان‌بندی می‌کند
    // از پیش‌بینی گرفته می‌شود — بنابراین آن رای، پیش‌بینی را برای بار دوم و با وزن کامل حساب می‌کرد،
    // حتی در تایم‌فریم‌هایی که پیش‌بینی هیچ برتری‌ای ندارد. این بخش نمایش داده می‌شود و یادداشت ورود را فرم می‌دهد،
    // اما دیگر در تعیین جهت بازار رای نمی‌دهد.
    const tt = TESTED_TIMING?.byInterval?.[interval];
    parts.push({ key: 'timing', value: timing.rising ? room * 0.6 : -0.5, weight: 0, measuredEdge: tt ? +(tt.hitPct - tt.baselinePct).toFixed(1) : null });
    timingNote = timing;
    reasons.push({
      tone: timing.priceless ? 'flat' : timing.rising ? 'good' : 'bad',
      text: timing.priceless
        ? `زمان‌بندی: در نمودارهای مشابه گذشته، ${timing.rising ? 'سقف' : 'کف'} این افق زمانی حدود کندل شماره ${(timing.rising ? timing.peak : timing.trough).bar} رخ داده است — زمان را نشان می‌دهد، نه جهت را.`
        : timing.rising
          ? `زمان‌بندی: انتظار می‌رود قدرت روند پیش از تشکیل سقف، ${timing.peak.bar} کندل دیگر ادامه یابد.`
          : `زمان‌بندی: انتظار ضعف برای ${timing.trough.bar} کندل آینده — ممکن است نقطه ورود بهتری شکل بگیرد.`,
    });
  }

  // تقسیم بر مجموع وزن‌ها به تنهایی باعث می‌شد یک تحلیل با اعتماد بسیار کم بتواند برای کل نتیجه تصمیم بگیرد:
  // پیش‌بینی با وزن 0.35 و تمایل قوی به عنوان BUY با قطعیت 35/100 بیرون می‌آمد در حالی که متن خودش می‌گفت تاثیر کمی دارد.
  // با مجموع وزن کمتر از ۱، امتیاز اکنون با توجه به شواهد پشت آن کوچک می‌شود، بنابراین شواهد ضعیف نتیجه ضعیفی تولید می‌کنند.
  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  const score = parts.reduce((s, p) => s + p.value * p.weight, 0) / Math.max(wsum, 1); // از ۱- تا ۱
  const conviction = Math.round(Math.abs(score) * 100);

  // چه بخشی از نتیجه متکی بر مواردی است که واقعاً کارایی‌شان اثبات شده است؟
  const evidenceWeight = parts.filter((p) => p.key !== 'signal').reduce((s, p) => s + p.weight, 0);
  const evidence = evidenceWeight < 0.5 ? 'thin' : evidenceWeight < 1.2 ? 'moderate' : 'good';

  let verdict, tone, headline;
  // نتیجه‌گیری نیازمند شواهد پشتیبان است. یک تحلیل منفرد که «تاثیر کمی دارد»
  // قبلاً به تنهایی سیگنال BUY صادر می‌کرد. با شواهد ضعیف، صفحه اکنون اعلام می‌کند که بازار چه تمایلی دارد
  // اما شواهد برای اقدام کافی نیست.
  if (!holding && evidence === 'thin' && Math.abs(score) >= 0.15) {
    verdict = score > 0 ? 'متمایل به صعود' : 'متمایل به نزول'; tone = 'flat';
    headline = 'بازار تمایل دارد، اما شواهد برای اقدام کافی نیست';
  } else if (holding) {
    if (score <= -0.35) { verdict = 'فروش'; tone = 'down'; headline = 'کاهش یا بستن موقعیت'; }
    else if (score <= -0.12) { verdict = 'کاهش حجم'; tone = 'warn'; headline = 'سیو سود بخشی از دارایی'; }
    else if (score >= 0.3) { verdict = 'افزایش خرید'; tone = 'up'; headline = 'نگهداری و خرید در اصلاح‌ها'; }
    else { verdict = 'نگهداری'; tone = 'flat'; headline = 'نگهداری، نیاز به اقدام خاصی نیست'; }
  } else if (score >= 0.35) { verdict = 'خرید'; tone = 'up'; headline = 'گزینه مناسب خرید'; }
  else if (score >= 0.15) { verdict = 'انباشت'; tone = 'up'; headline = 'ارزشمند برای انباشت تدریجی'; }
  else if (score <= -0.3) { verdict = 'پرهیز'; tone = 'down'; headline = 'فعلاً دور بمانید'; }
  else { verdict = 'انتظار'; tone = 'flat'; headline = 'بدون برتری مشخص — منتظر بمانید'; }

  // سطوح معاملاتی فقط از موتور سیگنال می‌آیند، چون این همان بخشی است که با حد ضرر و اهداف قیمتی بک‌تست شده است.
  // بدون برنامه = بدون سطح معاملاتی، و این موضوع صراحتاً اعلام می‌شود.
  const plan = signal.plan && signal.plan.side === 'long' ? signal.plan : null;

  return {
    ok: true,
    verdict, tone, headline, conviction, score, evidence,
    price: signal.price,
    plan: plan && {
      entryZone: plan.entryZone, stopLoss: plan.stopLoss, takeProfits: plan.takeProfits,
      riskPct: plan.riskPct, rewardRisk: plan.rewardRisk,
    },
    waitFor: plan ? null : signal.waitFor,
    timing: condenseTiming(timingNote),
    reasons,
    parts,
  };
}

/** رتبه‌بندی لیست اسکن‌شده به دسته‌های «خریدنی‌ها / پرهیز از آن‌ها». */
export function rankAdvice(rows) {
  const scored = rows.filter((r) => r.advice?.ok);
  const buys = scored.filter((r) => ['خرید', 'انباشت'].includes(r.advice.verdict))
    .sort((a, b) => b.advice.score - a.advice.score);
  const avoid = scored.filter((r) => r.advice.verdict === 'پرهیز')
    .sort((a, b) => a.advice.score - b.advice.score);
  const wait = scored.filter((r) => ['انتظار', 'متمایل به صعود', 'متمایل به نزول'].includes(r.advice.verdict));
  return { buys, avoid, wait, total: scored.length };
}

export const ADVICE_DISCLAIMER = 'این گزارش تحلیلی مبتنی بر داده‌های عمومی بازار است و مشاوره مالی شخصی‌سازی‌شده محسوب نمی‌شود. تعیین حد ضرر برای تمامی سطوح الزامی است. این اپلیکیشن هرگز معامله‌ای را به جای شما ثبت نمی‌کند.';