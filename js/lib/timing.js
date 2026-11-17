// "حرکت چقدر طول می‌کشد و چه زمانی تغییر جهت می‌دهد؟"
//
// پیش‌بینی ساده به یک سوال پاسخ می‌دهد — قیمت در افق زمانی کجا خواهد بود.
// این یک خط مستقیم است، بنابراین هرگز نمی‌تواند بگوید «دو روز صعود، سپس نزول».
//
// در عوض، این ماژول یک مسیر *فرم‌دار* می‌سازد: چارت‌های گذشته‌ای که با امروز تطابق داشتند 
// (که قبلاً توسط تطبیق‌دهنده الگو پیدا شده‌اند) را می‌گیرد و میانگین عملکرد واقعی قیمت 
// در هر گام بعدی (نه فقط در انتها) را محاسبه می‌کند. آن مسیرهای واقعی صعود می‌کنند، 
// به اوج می‌رسند و برمی‌گردند، بنابراین نتیجه نهایی نیز همین‌طور خواهد بود.
//
// فرم از تاریخچه می‌آید؛ مقصد از مجموعه مدل‌ها می‌آید.
// ما فرم تاریخی را طوری تنظیم می‌کنیم که نقطه پایانی آن با حرکت مورد انتظار 
// مجموعه مدل‌ها مطابقت داشته باشد؛ این کار باعث حفظ قله‌ها و دره‌ها می‌شود در حالی که 
// با احتمال جهتی که در همه جا نمایش داده می‌شود سازگار می‌ماند.

import { directionReliable } from './predict.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function weightedQuantile(pairs, q) {
  // جفت‌ها: [مقدار، وزن]، چارک وزن‌دار را برمی‌گرداند
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((s, p) => s + p[1], 0);
  if (!total) return 0;
  let acc = 0;
  for (const [v, w] of sorted) {
    acc += w;
    if (acc >= total * q) return v;
  }
  return sorted[sorted.length - 1][0];
}

/**
 * @param {object} fc شیء بازگردانده شده توسط forecast()
 * @param {object} opts { intervalMs, minMatches, interval }
 */
export function timingOutlook(fc, { intervalMs = null, minMatches = 4, interval = null } = {}) {
  if (!fc?.ok) return { ok: false, reason: 'هیچ پیش‌بینی‌ای برای زمان‌سنجی وجود ندارد.' };
  const matches = fc.patterns?.matches || [];
  const H = fc.horizon;
  if (matches.length < minMatches) {
    return { ok: false, reason: `تنها ${matches.length} چارت مشابه در گذشته پیدا شد — برای زمان‌سنجی حرکت کافی نیست. فقط جهت.` };
  }

  const step = intervalMs || (fc.path.length > 1 ? fc.path[1].t - fc.path[0].t : 36e5);
  const weights = matches.map((m) => m.similarity ** 4);

  // مسیر میانه در میان آینده‌های تطبیق‌یافته، گام به گام.
  const med = [0], shareUp = [null], band = [[0, 0]];
  for (let h = 1; h <= H; h++) {
    const pairs = matches
      .map((m, i) => [m.futureReturns[h - 1], weights[i]])
      .filter(([v]) => Number.isFinite(v));
    if (!pairs.length) { med.push(med[h - 1]); shareUp.push(shareUp[h - 1]); band.push(band[h - 1]); continue; }
    const wsum = pairs.reduce((s, p) => s + p[1], 0);
    med.push(weightedQuantile(pairs, 0.5));
    shareUp.push(pairs.reduce((s, [v, w]) => s + (v > 0 ? w : 0), 0) / wsum);
    band.push([weightedQuantile(pairs, 0.25), weightedQuantile(pairs, 0.75)]);
  }

  // کج کردن فرم تاریخی به طوری که روی حرکت مورد انتظار مجموعه مدل‌ها بنشیند.
  // تصحیح خط مستقیم تمام برآمدگی‌ها و فرورفتگی‌ها را دست‌نخورده نگه می‌دارد.
  const targetEnd = fc.expectedReturnPct / 100;
  const drift = targetEnd - med[H];
  const adj = med.map((v, h) => v + (drift * h) / H);

  // اوج و کف مسیر تنظیم‌شده (h = 0 حال حاضر است).
  let peakBar = 0, troughBar = 0;
  for (let h = 1; h <= H; h++) {
    if (adj[h] > adj[peakBar]) peakBar = h;
    if (adj[h] < adj[troughBar]) troughBar = h;
  }
  // کدام حد افراطی داستان اصلی است؟ یک جهش +0.05 درصدی در کنار یک افت -1.7 درصدی یک افت است،
  // نه یک رالی، بنابراین حرکت بزرگتر برنده می‌شود و نوسانات کوچک اصلاً فرم محسوب نمی‌شوند.
  const MIN_MOVE = 0.003; // 0.3% — پایین‌تر از این ارزشی برای زمان‌سنجی ندارد
  const peakVal = adj[peakBar], troughVal = adj[troughBar];
  const rising = peakBar > 0 && peakVal > MIN_MOVE && peakVal >= Math.abs(troughVal);
  const falling = troughBar > 0 && troughVal < -MIN_MOVE && Math.abs(troughVal) > peakVal;

  // کی تغییر جهت می‌دهد؟ اولین کندل پس از اوج که یک سوم سود را پس می‌دهد.
  let turnBar = null;
  if (rising) {
    const giveBack = adj[peakBar] * 0.67;
    for (let h = peakBar + 1; h <= H; h++) {
      if (adj[h] <= giveBack) { turnBar = h; break; }
    }
  }
  // حالت متقارن: کفی که بهبود می‌یابد.
  let recoverBar = null;
  if (falling) {
    const back = adj[troughBar] * 0.67;
    for (let h = troughBar + 1; h <= H; h++) {
      if (adj[h] >= back) { recoverBar = h; break; }
    }
  }

  // پنجره‌ای که ارزش نگهداری دارد: در حالی که مسیر در ۸۰ درصد بهترین سطح خود باقی بماند.
  let holdFrom = null, holdTo = null;
  if (rising) {
    const keep = adj[peakBar] * 0.8;
    for (let h = 1; h <= H; h++) {
      if (adj[h] >= keep) { if (holdFrom === null) holdFrom = h; holdTo = h; }
    }
  }

  const price = fc.lastPrice;
  const at = (bar) => fc.lastTime + step * bar;
  const pathOut = adj.map((v, h) => ({
    bar: h, t: at(h), pct: v * 100, price: price * (1 + v),
    shareUp: shareUp[h] === null ? null : shareUp[h] * 100,
    lo: price * (1 + band[h][0] + (drift * h) / H),
    hi: price * (1 + band[h][1] + (drift * h) / H),
  }));

  // آیا فرم واقعاً چیزی می‌گوید، یا فقط یک خط مستقیم است؟ فقط زمانی حساب می‌شود
  // که سقف یا کف واقعی برای هدف‌گیری وجود داشته باشد، و صرفاً بازگویی نقطه پایانی نباشد 
  // (یک اوج در کندل نهایی هیچ چیزی درباره زمان‌سنجی به شما نمی‌گوید).
  const spread = Math.max(...adj) - Math.min(...adj);
  const turningBar = rising ? peakBar : falling ? troughBar : null;
  const shaped = (rising || falling) && turningBar < H && spread > 0.004;

  return {
    ok: true,
    shaped,
    matchesUsed: matches.length,
    horizonBars: H,
    stepMs: step,
    rising,
    falling,
    peak: rising ? { bar: peakBar, t: at(peakBar), pct: adj[peakBar] * 100, price: price * (1 + adj[peakBar]), agreement: shareUp[peakBar] === null ? null : shareUp[peakBar] * 100 } : null,
    trough: falling ? { bar: troughBar, t: at(troughBar), pct: adj[troughBar] * 100, price: price * (1 + adj[troughBar]) } : null,
    turn: turnBar === null ? null : { bar: turnBar, t: at(turnBar), pct: adj[turnBar] * 100, price: price * (1 + adj[turnBar]) },
    recover: recoverBar === null ? null : { bar: recoverBar, t: at(recoverBar), pct: adj[recoverBar] * 100 },
    hold: holdFrom === null ? null : { fromBar: holdFrom, toBar: holdTo, fromT: at(holdFrom), toT: at(holdTo) },
    endPct: adj[H] * 100,
    path: pathOut,
    // جایی که جهت پیش‌بینی در تست‌ها دوام نیاورد، فقط زمان وقوع سقف (یا کف) 
    // یک ادعای اندازه‌گیری‌شده است (TESTED_TIMING)؛ فاصله و جهت این‌گونه نیستند، 
    // بنابراین هیچ‌کدام از بخش‌های بعدی قیمتی برای آن اعلام نمی‌کنند.
    priceless: !!fc.leanRemoved || (interval !== null && !directionReliable(interval)),
  };
}

/**
  * چند عدد معدودی که خلاصه‌های به زبان ساده نیاز دارند: کدام جهت، چند کندل 
  * تا سقف (یا کف)، قیمت در آنجا، و چه زمانی تغییر جهت می‌دهد.
  */
export function condenseTiming(t) {
  if (!t?.ok || !t.shaped) return null;
  const p = t.rising ? t.peak : t.trough;
  if (t.priceless) return { rising: t.rising, bars: p.bar, targetPrice: null, turnBars: null, priceless: true, horizonBars: t.horizonBars };
  return { rising: t.rising, bars: p.bar, targetPrice: p.price, turnBars: t.turn?.bar ?? null };
}

/** جمله انسانی برای رابط کاربری، با دریافت یک فرمت‌کننده مدت‌زمان→دوره. */
export function timingText(t, fmtDuration, fmtMoney) {
  if (!t?.ok) return t?.reason || '';
  if (!t.shaped) {
    return t.endPct >= 0
      ? `مشابه‌های گذشته به جای جهش، به آرامی صعود کردند — هیچ الگوی مشخصی از اوج و افت در این افق وجود ندارد.`
      : `مشابه‌های گذشته به آرامی نزول کردند — هیچ الگوی مشخصی از کف و بازگشت در این افق وجود ندارد.`;
  }
  if (t.priceless) return `در چارت‌های مشابه گذشته، ${t.rising ? 'سقف' : 'کف'} ${fmtDuration(t.horizonBars)} بعدی حدود **${fmtDuration((t.rising ? t.peak : t.trough).bar)}** بعد رخ داد. این زمان را نشان می‌دهد، نه جهت یا مقدار را: جهت در این چارت قابل اعتماد نیست.`;
  
  const sp = (v) => { const a = Math.abs(v).toFixed(1); return +a === 0 ? '0.0%' : `${v < 0 ? '−' : '+'}${a}%`; };
  const parts = [];
  if (t.rising && t.peak) {
    parts.push(`قدرت معمولاً حدود **${fmtDuration(t.peak.bar)}** ادامه دارد و در نزدیکی **${fmtMoney(t.peak.price)}** (${sp(t.peak.pct)}) به اوج می‌رسد`);
    if (t.turn) parts.push(`سپس بیشتر آن را تا **${fmtDuration(t.turn.bar)}** آینده پس می‌دهد (${sp(t.turn.pct)})`);
    else parts.push(`و به جای بازگشت درون این افق، حفظ می‌شود`);
  } else if (t.falling && t.trough) {
    parts.push(`ضعف معمولاً حدود **${fmtDuration(t.trough.bar)}** جریان دارد و در نزدیکی **${fmtMoney(t.trough.price)}** (${sp(t.trough.pct)}) کف می‌سازد`);
    if (t.recover) parts.push(`با شروع یک بازگشت در حدود **${fmtDuration(t.recover.bar)}** دیگر`);
    else parts.push(`بدون بازگشت مشخص درون این افق`);
  }
  return `${parts.join(', ')}.`;
}

/** فرمت فشرده برای دستیار هوش مصنوعی / زمینه LLM. */
export function summarizeTiming(t) {
  if (!t?.ok || !t.shaped) return null;
  if (t.priceless) {
    return {
      basedOnSimilarPastCharts: t.matchesUsed,
      extreme: t.rising ? 'high' : 'low',
      barsToExtreme: (t.rising ? t.peak : t.trough).bar,
      horizonBars: t.horizonBars,
      note: 'فقط زمان وقوع سقف یا کف روی این چارت اندازه‌گیری شده است؛ جهت و میزان آن اندازه‌گیری نشده‌اند، بنابراین هیچ قیمتی داده نمی‌شود.',
    };
  }
  return {
    basedOnSimilarPastCharts: t.matchesUsed,
    direction: t.rising ? 'صعود و سپس محو شدن' : t.falling ? 'سقوط و سپس بازگشت' : 'مسطح',
    barsToPeak: t.peak?.bar ?? null,
    peakMovePct: t.peak ? +t.peak.pct.toFixed(2) : null,
    peakPrice: t.peak ? +t.peak.price.toPrecision(6) : null,
    pctOfPastCasesUpAtPeak: t.peak?.agreement === null || t.peak?.agreement === undefined ? null : +t.peak.agreement.toFixed(0),
    barsUntilItTurnsDown: t.turn?.bar ?? null,
    barsToTrough: t.trough?.bar ?? null,
    troughMovePct: t.trough ? +t.trough.pct.toFixed(2) : null,
    barsUntilBounce: t.recover?.bar ?? null,
    moveAtHorizonPct: +t.endPct.toFixed(2),
    bestHoldWindowBars: t.hold ? [t.hold.fromBar, t.hold.toBar] : null,
  };
}

export const TESTED_TIMING = {
  tests: 3822, coins: 106, measuredOn: '2026-10-16',
  peakHitPct: 52.8, baselinePct: 51.4, medianBarsOff: 3,
  turnedInsideHorizonPct: 81.3,
  byInterval: {
    '1m': { tests: 170, hitPct: 49.4, baselinePct: 48.9, medianOff: 5 },
    '5m': { tests: 424, hitPct: 42.7, baselinePct: 47.0, medianOff: 4 },
    '15m': { tests: 640, hitPct: 51.4, baselinePct: 48.7, medianOff: 2 },
    '1h': { tests: 1059, hitPct: 45.9, baselinePct: 44.6, medianOff: 4 },
    '4h': { tests: 992, hitPct: 63.9, baselinePct: 61.6, medianOff: 2 },
    '1d': { tests: 537, hitPct: 56.6, baselinePct: 53.6, medianOff: 2 },
  },
  previousRun: { tests: 3874, peakHitPct: 53.7, baselinePct: 51.9, hitPct: { '1m': 45.4, '5m': 41.5, '15m': 48.3, '1h': 48.1, '4h': 66.4, '1d': 60.3 } },
};

export function timingSwing(interval) {
  const now = TESTED_TIMING.byInterval[interval]?.hitPct;
  const before = TESTED_TIMING.previousRun?.hitPct?.[interval];
  return Number.isFinite(now) && Number.isFinite(before) ? +Math.abs(now - before).toFixed(1) : null;
}

export function bestTimingChart() {
  let best = null;
  for (const [interval, t] of Object.entries(TESTED_TIMING.byInterval)) {
    const edge = +(t.hitPct - t.baselinePct).toFixed(1);
    if (edge >= 1 && (!best || edge > best.edge)) best = { interval, edge, hitPct: t.hitPct, baselinePct: t.baselinePct };
  }
  return best;
}

export function timingTrust(interval) {
  const iv = TESTED_TIMING.byInterval[interval];
  if (!iv) return { level: 'unknown', text: `زمان‌سنجی روی چارت ${interval} اندازه‌گیری نشده است، بنابراین هر نقطه بازگشتی در آنجا را فقط به عنوان یک راهنمای تقریبی در نظر بگیرید.` };
  const edge = iv.hitPct - iv.baselinePct;
  const swing = timingSwing(interval);
  const before = TESTED_TIMING.previousRun?.hitPct?.[interval];
  const thin = iv.tests < 100;
  const best = bestTimingChart();
  if (edge >= 4 && (swing === null || swing < edge)) {
    return { level: 'good', text: `روی چارت‌های ${interval}، سقف یا کف واقعی در ${iv.hitPct.toFixed(1)}% از موارد در طول ${iv.tests} تست داخل پنجره پیش‌بینی‌شده قرار گرفت، در مقایسه با ${iv.baselinePct.toFixed(1)}% برای یک حدس تصادفی در همان تست‌ها: مزیتی معادل ${edge.toFixed(1)} امتیاز. میانگین خطای ${iv.medianOff} کندل.${thin ? ' این یک نمونه کوچک است، بنابراین آن را موقتی در نظر بگیرید.' : ''}` };
  }
  if (edge >= 1) {
    const moved = swing === null ? '' : swing >= edge
      ? ` اجرای چند ساعت قبل عدد ${before}% را نشان داد: این رقم بین دو اجرا ${swing.toFixed(1)} امتیاز تغییر کرد که بیشتر از خود مزیت است.`
      : ` اجرای چند ساعت قبل عدد ${before}% را نشان داد.`;
    return { level: 'weak', text: `روی چارت‌های ${interval}، سقف یا کف واقعی در ${iv.hitPct.toFixed(1)}% از موارد در طول ${iv.tests} تست داخل پنجره پیش‌بینی‌شده قرار گرفت، در مقایسه با ${iv.baselinePct.toFixed(1)}% برای یک حدس تصادفی: ${edge.toFixed(1)} امتیاز، که عملاً مزیتی محسوب نمی‌شود.${moved} نقطه بازگشت را به عنوان یک راهنمای تقریبی در نظر بگیرید، نه یک ساعت دقیق.` };
  }
  const elsewhere = best && best.interval !== interval ? ` بهترین نتیجه آن روی چارت ${best.interval} بوده است (${best.hitPct.toFixed(1)}% در مقابل ${best.baselinePct.toFixed(1)}%)، و حتی آن مزیت هم کوچک است.` : '';
  return { level: 'bad', text: `زمان‌سنجی روی چارت‌های ${interval} کار نمی‌کند: ${iv.hitPct.toFixed(1)}% در مقابل نرخ پایه تصادفی ${iv.baselinePct.toFixed(1)}% طی ${iv.tests} تست. نقطه بازگشت را در اینجا نادیده بگیرید.${elsewhere}` };
}

void clamp;
