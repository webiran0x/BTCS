// تحلیل‌گر مبتنی بر قاعده. یک پاسخ مارک‌داون از همان زمینه‌ای که
// به مدل زبانی ارسال می‌شود تولید می‌کند، بنابراین دستیار حتی بدون کلید API کار می‌کند.

import { fmtNum as fmtUsd, upRateFor, SCORE_BUCKETS_TESTED, THRESHOLDS } from './signals.js';
import { accuracyFor, TESTED_ACCURACY, recheckOverall } from './predict.js';
import { fx } from '../api/fx.js';
import { isTickerMention } from './tickers.js';
import { conversationalAnswer, termsIn } from './glossary.js';

// هر قیمتی که دستیار ذکر می‌کند — سطوح، حد ضرر، اهداف، میانگین‌های متحرک (EMA)، باندهای بولینگر،
// ATR، بازه‌های پیش‌بینی — همگی به‌صورت تبدیل‌نشده و با برچسب USD خارج می‌شدند، در حالی که
// سایر بخش‌های صفحه ارز نمایشی انتخاب‌شده توسط کاربر را نشان می‌دادند. پیچیدن تابع قالب‌بندی
// تمام بیست و یک نقطه فراخوان را به‌طور هم‌زمان تبدیل می‌کند.
const fmtNum = (v) => (v === null || v === undefined || !Number.isFinite(v) ? fmtUsd(v) : fmtUsd(v * (fx.rate || 1)));

const DISCLAIMER = '_سیگنال‌ها شاخص‌های فنی هستند، نه مشاوره مالی. همیشه از حد ضرر استفاده کنید و فقط به اندازه‌ای که توان از دست دادنش را دارید ریسک کنید._';

// یک علامت منفی واقعی، درست مانند هر عدد دیگری در سایت؛ `digits` رقم معنی‌دار
// در صورت ارائه، در غیر این صورت یک عدد صحیح.
const signed = (v, digits) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const t = digits ? Math.abs(v).toPrecision(digits) : Math.abs(v).toFixed(0);
  return v < 0 && +t !== 0 ? `−${t}` : t;
};
const money = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
// «1 روز آینده» به صورت «روز آینده» خوانده می‌شود
const nextSpan = (h) => `${String(h).replace(/^1 /, '')} آینده`;

function parseAccount(q) {
  const s = String(q || '').replace(/,/g, '');
  const m = /\$\s?(\d+(?:\.\d+)?)\s?(k)?/i.exec(s) || /(\d+(?:\.\d+)?)\s?(k)?\s?(usd|usdt|dollars?|bucks)/i.exec(s);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (m[2] && m[2].toLowerCase() === 'k') v *= 1000;
  return v > 0 ? v : null;
}

function pct(v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  // همان سبکی که در سایر نقاط سایت استفاده می‌شود: علامت منفی واقعی، بدون علامت روی 0.00%.
  const t = Math.abs(Number(v)).toFixed(2);
  return +t === 0 ? `${t}%` : `${v < 0 ? '−' : '+'}${t}%`;
}

// نمادها و نام‌هایی که آن‌قدر رایج هستند که ذکر یکی از آن‌ها سوال را
// به یک ارز خاص محدود می‌کند. detectSymbol() جستجوی اصلی را انجام می‌دهد؛ این تابع فقط مانع از آن می‌شود
// که تحلیل‌گر قاعده‌مند زمانی که یک ارز به صراحت نام برده شده، پاسخی بازارمحور بدهد.
const NAMES_A_COIN_G = /\b(btc|bitcoin|eth|ether|ethereum|bnb|sol|solana|xrp|ripple|ada|cardano|doge|dogecoin|trx|tron|avax|dot|polkadot|link|chainlink|matic|polygon|ltc|litecoin|shib|ton|near|atom|uni|xlm|bch|etc|fil|apt|arb|op|sui|pepe|hbar|icp|inj|tao|sei|rndr|aave|mkr|zec)\b/gi;
const NAMES_A_COIN = new RegExp(NAMES_A_COIN_G.source);
/** ارزهای نام‌برده‌شده در سوال، به همراه حذف کلمات روزمره («near term» و غیره). */
export function namedCoins(q) {
  const text = String(q || '');
  return [...text.matchAll(NAMES_A_COIN_G)].filter((m) => isTickerMention(m[0], text, m.index)).map((m) => m[0].toUpperCase());
}

/**
 * تایم‌فریمی که بازه زمانی خودِ سوال می‌طلبد: «this week» سوالی برای
 * تایم‌فریم روزانه (۷ روز آینده)، «tomorrow» برای ۴ ساعته (یک روز آینده)،
 * «today» برای ساعتی (۱۲ ساعت آینده). وقتی هیچ بازه‌ای نام برده نشود مقدار null برمی‌گرداند و از
 * تایم‌فریم انتخاب‌شده روی صفحه استفاده می‌شود. «Is ETH worth buying this week?» قبلاً
 * از تایم‌فریم ۴ ساعته و درباره روز آینده پاسخ داده می‌شد.
 */
export function horizonChart(q) {
  const s = String(q || '').toLowerCase();
  if (/\b(this|next|coming) (month|quarter|year)\b|\blong[- ]?term\b|\b(few|couple of) (weeks|months)\b|\bhodl\b|\bhold(ing)? (it )?for\b/.test(s)) return '1d';
  if (/\b(this|next|coming) week\b|\b(a|one|1) week\b|\b(7|seven|few|couple of) days\b|\bweekly\b/.test(s)) return '1d';
  if (/\btomorrow\b|\b(next|coming) (day|24 ?h(ours)?)\b|\bin (a|one|1) day\b/.test(s)) return '4h';
  if (/\btoday\b|\btonight\b|\b(next|coming) (few )?hours?\b|\bintraday\b|\bscalp/.test(s)) return '1h';
  return null;
}

// «کدام ارز را باید بخرم؟» سوالی متفاوت از «آیا باید بیت‌کوین بخرم؟» است.
export function isMarketWide(q) {
  const s = (q || '').toLowerCase();
  if (/(which|what) (coin|crypto|one|token|altcoin)|best (coin|crypto|buy|pick|token)|top (coin|pick|buy)|what (should i|to) buy|anything (good|worth)|all (the|of the)? ?coins|every coin|whole market|scan the market|market overview|any (good )?(buy|opportunit)|evidence (is )?(the )?strongest|strongest (evidence|setups?)|recommend|picks?\b|where should i (put|invest)|shopping list/.test(s)) return true;
  // یک سوال خرید/فروش/زمان‌بندی که هیچ ارزی را نام نمی‌برد، سوالی درباره کل بازار است.
  if (namedCoins(q).length || /\b(this coin|my)\b/.test(s)) return false;
  return /\b(buy|sell|short|long|invest|entry|exit|hold)\b/.test(s)
    && /\b(what|which|when|anything|something|now|today|this week|time ?frame|timeframe|short term|long term|how long)\b/.test(s);
}

// «مقایسه بیت‌کوین و اتریوم» / «BTC در برابر SOL» / «کدام یک بهتر است، X یا Y»
export function detectCompare(q) {
  const s = String(q || '');
  const named = namedCoins(s);
  const uniq = [...new Set(named)];
  const asksToCompare = /\b(compare|versus|vs\.?|better|stronger|which of|between)\b/i.test(s);
  return uniq.length >= 2 && (asksToCompare || uniq.length >= 2) ? uniq.slice(0, 4) : null;
}

// «آیا باید همه چیز را بفروشم؟» مربوط به دارایی‌ها است، نه ارز مورد تمرکز.
export const SELL_ALL = /\b(sell|exit|dump|cash out( of)?|get out of) (everything|it all|all of it|all my|all (my )?(coins|crypto))\b/i;

function detectIntent(q) {
  const s = (q || '').toLowerCase();
  if (SELL_ALL.test(s) || /(portfolio|wallet|holding|my coins|my bag)/.test(s)) return 'portfolio';
  if (detectCompare(q)) return 'compare';
  if (isMarketWide(s)) return 'market';
  // عبارت «دقت پیش‌بینی‌های شما چقدر است؟» شامل کلمه «predict» است، بنابراین قبلاً
  // با پیش‌بینی قیمت برای ارز مورد تمرکز پاسخ داده می‌شد — سوال درباره مدل
  // با خروجی خود مدل پاسخ داده می‌شد. بررسی اینکه مدل چقدر خوب کار می‌کند
  // اکنون در اولویت بررسی قرار دارد.
  if (/(backtest|win ?rate|accura|reliab|track record|history of signal|how good|does it work|trust)/.test(s)) return 'backtest';
  if (/(predict|forecast|future|will (it|the price|price|this)|go(ing)? (up|down)|next (hour|day|week|month)|tomorrow|pump|dump|target price|where .* (head|go)|up or down)/.test(s)) return 'forecast';
  if (/(position size|how much|\bsize\b|invest|risk|lot size|allocation|\$\s?\d|\d+\s?k?\s?(usd|usdt|dollars?|bucks))/.test(s)) return 'risk';
  if (/(exit|close|sell|take profit|tp\b|stop|get out)/.test(s)) return 'exit';
  if (/(entry|enter|buy|long|get in|good time|should i)/.test(s)) return 'entry';
  if (/(support|resistance|level)/.test(s)) return 'levels';
  if (/(indicator|rsi|macd|ema|bollinger|adx|stoch|supertrend|mfi|money flow|cci|williams|donchian|keltner)/.test(s)) return 'indicators';
  return 'summary';
}

function header(ctx) {
  const c = ctx.coin;
  if (!c) return '';
  return `**${c.name} (${c.symbol})** · ${fmtNum(c.price)} ${fx.code} · تغییرات ۲۴ ساعته ${pct(c.change24h)}${ctx.interval ? ` · نمودار ${ctx.interval}` : ''}`;
}

function signalLine(sig, interval = null) {
  const base = `**تحلیل نمودار: ${sig.text}** (میزان توافق اندیکاتورها ${sig.score > 0 ? '+' : ''}${sig.score}/100)`;
  const m = interval ? upRateFor(interval, sig.score) : null;
  // این بخش قبلاً به این شکل نوشته می‌شد: «سیگنال: خرید قوی (امتیاز +67/100)» بدون هیچ متن دیگری در ادامه،
  // که در واقع تحلیل را به شکل یک توصیه ارائه می‌داد. اکنون سابقه اندازه‌گیری‌شده
  // برای آن بازه در کنار آن قرار دارد.
  return m
    ? `${base}\n\n_در ${SCORE_BUCKETS_TESTED.bars.toLocaleString()} کندل تست‌شده، خوانش‌های این بازه در ${m.upRatePct}% از مواقع با قیمت بالاتر همراه بوده‌اند — امتیاز نشان‌دهنده میزان امتداد یک حرکت است، نه ادامه یافتن آن._`
    : base;
}

function mtfBlock(ctx) {
  if (!ctx.mtf) return '';
  const rows = Object.entries(ctx.mtf).filter(([, v]) => v).map(([iv, v]) => `${iv}: ${v.text} (${v.score > 0 ? '+' : ''}${v.score})`);
  if (!rows.length) return '';
  const conf = ctx.confluence ? `\n- **همگرایی کلی: ${ctx.confluence.text}** (${ctx.confluence.score > 0 ? '+' : ''}${ctx.confluence.score})` : '';
  return `\n**تایم‌فریم‌ها**\n- ${rows.join('\n- ')}${conf}\n`;
}

function planBlock(plan) {
  if (!plan) return '';
  return `\n**${plan.title}**\n- محدوده ورود: ${fmtNum(plan.entryZone[0])} – ${fmtNum(plan.entryZone[1])}\n- حد ضرر: ${fmtNum(plan.stopLoss)} (ریسک ${plan.riskPct}%)\n- هدف سود ۱ / ۲ / ۳: ${plan.takeProfits.map(fmtNum).join(' / ')}\n- نسبت سود به ریسک در هدف ۲: ${plan.rewardRisk}:1\n${plan.geometryTested && Number.isFinite(plan.expectancyR) ? `- این یک سیگنال معامله نیست: در تست‌ها، معاملات با این فاصله‌ها ${plan.expectancyR >= 0 ? 'سودی معادل' : 'زیانی معادل'} ${Math.abs(plan.expectancyR).toFixed(3)}R به ازای هر معامله (با احتساب کارمزد) داشته‌اند\n` : ''}`;
}

function forecastBlock(f, ctx) {
  if (!f) return '';
  const dirWord = f.direction === 'UP' ? 'بیشتر صعودی' : f.direction === 'DOWN' ? 'بیشتر نزولی' : 'نسبتاً خنثی';
  const horizon = ctx.horizonText || `${f.horizonBars} کندل`;
  const tested = f.testedDirectionPct ?? f.validatedAccuracyPct ?? null;
  const acc = tested !== null ? `جهت حرکت در ${tested}% از مواقع در این تایم‌فریم طی تست‌ها درست بوده است، در مقایسه با ${f.testedBaselinePct ?? f.baselineAccuracyPct}% برای پیش‌بینی همیشه رایج‌ترین جهت` : 'دقت اندازه‌گیری‌نشده';
  const lines = [
    f.directionReliable === false
      ? `**پیش‌بینی هوش مصنوعی (${nextSpan(horizon)}):** جهت قابل اعتمادی روی این نمودار وجود ندارد (تمایل خام مدل ${f.rawProbUpPct}% صعودی است، که احتمال قطعی نیست) · بازه‌های زیر بخش مفید ماجرا هستند`
      : `**پیش‌بینی هوش مصنوعی (${nextSpan(horizon)}):** احتمال ${f.probUpPct}% برای صعود → متمایل به **${dirWord}** · میزان اطمینان: ${f.confidence}`,
    f.expectedMovePct === null || f.expectedMovePct === undefined ? '- بدون حرکت یا هدف پیش‌بینی‌شده: بازه‌ها روی قیمت امروز متمرکز شده‌اند، زیرا جهت حرکت در اینجا قابل اعتماد نیست.' : `- حرکت مورد انتظار: ${pct(f.expectedMovePct)} → هدف ≈ ${fmtNum(f.targetPrice)}`,
    `- بازه محتمل (۵۰٪): ${fmtNum(f.likelyRange[0])} – ${fmtNum(f.likelyRange[1])}؛ بازه وسیع (۸۰٪): ${fmtNum(f.wideRange[0])} – ${fmtNum(f.wideRange[1])}`,
    `- سابقه عملکرد: ${acc}${f.accuracyWhenConfidentPct !== null && f.accuracyWhenConfidentPct !== undefined ? `; ${f.accuracyWhenConfidentPct}% در مواقعی که مدل‌ها توافق قوی داشتند` : ''}`,
  ];
  if (f.patternMatches?.length) {
    const ups = f.patternMatches.filter((m) => m.thenMovedPct > 0).length;
    lines.push(`- مقایسه الگوی نمودار: ${ups} مورد از ${f.patternMatches.length} نمودار مشابه گذشته پس از آن صعود کرده‌اند (به عنوان مثال ${f.patternMatches.slice(0, 3).map((m) => `${m.date}: ${m.similarityPct}% شباهت → ${pct(m.thenMovedPct)}`).join('; ')})`);
  }
  if (f.notes?.length) lines.push(`- نکته: ${f.notes[0]}`);
  return `\n${lines.join('\n')}\n`;
}

// این که تاریخچه چندساله خود ارز درباره یک نمودار شبیه به امروز چه می‌گوید.
function historyBlock(h) {
  if (!h) return '';
  // شمارش مواردی که طبق کلمات پیش‌رفته‌اند: عددی را داده که صعود کرده
  // حتی زمانی که «نزولی» را نشان داده («lower in 1/4 cases» در حالی که ۳ مورد از ۴ مورد نزولی بوده‌اند).
  const [up, total] = String(h.wentUpAfter || '').split('/').map(Number);
  const fell = h.verdict === 'DOWN';
  const count = Number.isFinite(up) && Number.isFinite(total) ? `**${fell ? total - up : up} مورد از ${total}**` : `**${h.wentUpAfter}**`;
  const lines = [
    `**سال‌های گذشته (نمودار روزانه):** در ${h.similarPastCases} مرتبه آخر که ${h.windowDays} روز از قیمت شبیه به امروز بوده است، قیمت ${h.horizonDays} روز بعد در ${count} مورد ${fell ? 'پایین‌تر' : 'بالاتر'} بوده است — میانه حرکت ${pct(h.medianMovePct)} (بهترین حالت ${pct(h.bestCasePct)}، بدترین حالت ${pct(h.worstCasePct)}).`,
  ];
  if (h.examples?.length) lines.push(`- شبیه‌ترین موارد (تاریخ تطبیق نمودار ← حرکت در طول ${h.horizonDays} روز پس از آن): ${h.examples.map((e) => `${e.date}، ${e.similarityPct}% شباهت → ${pct(e.thenMovedPct)}`).join('; ')}`);
  if (h.thisMonthHistoricalAvgPct !== null && h.thisMonthHistoricalAvgPct !== undefined) lines.push(`- فصلی‌گری: این ماه تقویمی به طور میانگین بازدهی ${pct(h.thisMonthHistoricalAvgPct)} را در تاریخچه این ارز ثبت کرده است.`);
  lines.push(h.methodAccuracyPct !== null && h.methodAccuracyPct !== undefined
    ? `- بررسی صحت: این روش مقایسه با بازپخش روی تاریخچه این ارز، جهت ${h.horizonDays} روزه را در **${h.methodAccuracyPct}%** از مواقع درست تشخیص داده است${h.methodTests ? ` در ${h.methodTests} تست گذشته (بازه ۹۵٪: ${h.methodRangePct[0]}–${h.methodRangePct[1]}%)` : ''}${h.methodAccuracyPct < 55 ? ' — نزدیک به پرتاب سکه، بنابراین از آن به عنوان زمینه استفاده کنید، نه به عنوان سیگنال ورود' : h.methodRangePct && h.methodRangePct[0] <= 50 ? ' — با این تعداد کم تست، نتیجه همچنان در محدوده شانس و پرتاب سکه است' : ''}.`
    : '- بررسی صحت: تعداد تست‌های گذشته برای امتیازدهی به این روش روی این ارز کافی نیست.');
  return `\n${lines.join('\n')}\n`;
}

// زمان به اوج رسیدن حرکت و زمان برگشت آن — بخشی از پاسخ که احتمال جهت حرکت از آن چشم‌پوشی می‌کند.
function timingBlock(ctx) {
  const t = ctx.timing;
  if (!t) return '';
  const lines = [];
  // ترجیح استفاده از جمله ساخته‌شده با مدت‌زمان‌های واقعی («حدود ۶ ساعت») به جای تعداد کندل‌ها.
  if (ctx.timingSentence) lines.push(`**زمان‌بندی:** ${ctx.timingSentence.replace(/\*\*/g, '')}`);
  else if (t.direction === 'rise then fade') {
    lines.push(`**زمان‌بندی:** قدرت حرکت معمولاً حدود **${t.barsToPeak} کندل** طول می‌کشد و در نزدیکی ${fmtNum(t.peakPrice)} (${pct(t.peakMovePct)}) به اوج می‌رسد${t.barsUntilItTurnsDown ? `، سپس در حدود کندل ${t.barsUntilItTurnsDown} روند نزولی به خود می‌گیرد` : ' و به جای بازگشت، تثبیت می‌شود'}.`);
  } else if (t.direction === 'fall then bounce') {
    lines.push(`**زمان‌بندی:** ضعف بازار معمولاً حدود **${t.barsToTrough} کندل** طول می‌کشد (${pct(t.troughMovePct)})${t.barsUntilBounce ? `، و بازگشت قیمت از حدود کندل ${t.barsUntilBounce} آغاز می‌شود` : ' بدون بازگشت مشخص در این افق زمانی'}.`);
  }
  if (t.peakPrice) lines.push(`- اوج مورد انتظار در حدود ${fmtNum(t.peakPrice)} (${pct(t.peakMovePct)})؛ در افق زمانی ${pct(t.moveAtHorizonPct)}.`);
  if (t.pctOfPastCasesUpAtPeak !== null && t.pctOfPastCasesUpAtPeak !== undefined) lines.push(`- ${t.pctOfPastCasesUpAtPeak}% از ${t.basedOnSimilarPastCharts} نمودار مشابه گذشته در آن نقطه همچنان صعودی بوده‌اند.`);
  lines.push('- مزیت زمان‌بندی کوچک است و بین اجراها تغییر می‌کند — از آن برای برنامه‌ریزی خروج استفاده کنید، نه برای چشم‌پوشی از حد ضرر.');
  return lines.length ? `\n${lines.join('\n')}\n` : '';
}

// هر ارز، بررسی‌شده در سه تایم‌فریم به طور هم‌زمان: چه چیزی را برای چند ساعت آینده،
// چند روز آینده و چند هفته آینده بخریم — و هر کدام را کجا بفروشیم.
function frameLines(b, horizon) {
  const lines = [`  - **${b.coin}** (${b.name}) — ${b.verdict}، میزان اطمینان ${b.conviction}/100، قیمت فعلی ${fmtNum(b.price)}`];
  if (b.buyBetween) lines.push(`    - خرید بین **${fmtNum(b.buyBetween[0])}** و **${fmtNum(b.buyBetween[1])}**؛ حد ضرر **${fmtNum(b.stopLoss)}** (ریسک ${b.riskPct}%)`);
  else if (b.waitFor) lines.push(`    - هنوز هیچ شرط ورودی محقق نشده است — ${b.waitFor}`);
  if (b.sellTargets) lines.push(`    - فروش در **${b.sellTargets.map(fmtNum).join('** → **')}**`);
  if (b.holdForBars) lines.push(`    - نگهداری حدود **${b.holdForBars} کندل** از نمای ${horizon}، اوج‌گیری در نزدیکی ${fmtNum(b.expectedPeakPrice)}${b.turnsDownAfterBars ? `، چرخش نزولی پس از کندل ${b.turnsDownAfterBars} — پیش از آن بفروشید` : ''}`);
  if (b.topReason) lines.push(`    - ${b.topReason}`);
  return lines.join('\n');
}

function marketMultiBlock(m) {
  if (!m?.frames?.length) return '';
  const skipped = Math.max(0, ...m.frames.map((f) => f.skipped || 0));
  const out = [`**اسکن کل بازار — ${m.scanned} ارز، بررسی‌شده در ${m.frames.length} تایم‌فریم**${skipped ? ` (حداکثر ${skipped} مورد دیگر رد شدند: عدم وجود کندل صرافی)` : ''}\n`];

  for (const fr of m.frames) {
    out.push(`\n### ${fr.label} — نمودار ${fr.interval} (${fr.horizonText} آینده)`);
    if (!fr.buys.length) {
      out.push(fr.waitingCount
        ? `  - هیچ موردی در این تایم‌فریم شرایط لازم را ندارد. ${fr.waitingCount} ارز وضعیت «بدون مزیت — صبر کنید» را نشان می‌دهند، و نظاره‌گر بودن خود یک موضع است.`
        : '  - هیچ ارزی در این تایم‌فریم قابل تحلیل نبود: صرافی‌ها هیچ کندلی بازنگرداندند. لطفاً یک دقیقه دیگر دوباره امتحان کنید.');
    } else {
      for (const b of fr.buys.slice(0, 4)) out.push(frameLines(b, fr.interval));
    }
  }

  if (m.agree.length) {
    out.push('\n### قوی‌ترین موارد کلی');
    for (const a of m.agree) {
      const where = a.frames.map((f) => `${f.label} (${f.interval})`).join(', ');
      const best = a.frames[0];
      out.push(`- **${a.coin}** — خرید در ${a.frames.length} تایم‌فریم از ${m.frames.length} تایم‌فریم: ${where}.${best.sellTargets ? ` اولین هدف فروش ${fmtNum(best.sellTargets[0])}، حد ضرر ${fmtNum(best.stopLoss)}.` : ''}`);
    }
    out.push('_ارزی که در بیش از یک تایم‌فریم وضعیت خوبی دارد، گزینه مطمئن‌تری است — ارزی که فقط روی نمودار ۱ ساعته مناسب به نظر می‌رسد یک معامله کوتاه‌مدت است، نه یک سرمایه‌گذاری._');
  }

  // تنها سیگنال دارای سابقه تست‌شده: عملکرد فعلی قوانین معامله‌گر هوش مصنوعی.
  if (m.rule) {
    const r = m.rule, rec = r.record;
    const sg = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;
    out.push(`\n### وضعیت فعلی قانون تست‌شده معامله‌گر هوش مصنوعی (نمودار ${r.interval})`);
    if (r.coins.length) {
      for (const c of r.coins.slice(0, 6)) out.push(`- **${c.coin}** — ${c.action === 'buy' ? 'خریداری‌شده در کندل آخر' : `در معامله از تاریخ ${new Date(c.openedAt).toISOString().slice(0, 10)}`} با قیمت ${fmtNum(c.entry)}${Number.isFinite(c.openPct) && c.action !== 'buy' ? ` (${sg(c.openPct)} تاکنون)` : ''}؛ حد ضرر ${fmtNum(c.stop)}${c.target ? `، هدف ${fmtNum(c.target)}` : '، حد ضرر متحرک (Trailing Stop)'}`);
    } else {
      out.push(`- در هیچ‌یک از ${r.read} ارز بررسی‌شده: این ربات فقط روی سیگنال ورود خودش در روند صعودی خرید می‌کند، و نظاره‌گر بودن بخشی از فرآیند تست آن بوده است.`);
    }
    out.push(`- سابقه عملکرد: روی ${rec.coins} ارز در بازه ${rec.from} ← ${rec.to} به طور میانگین ${sg(rec.perPeriodPct)} در هر ${rec.period} کسب کرده است، پیش از کسر حدود ${rec.fillCost} واحد اسپرد و لغزش قیمت، در مقایسه با ${sg(rec.holdPct)} برای نگهداری ساده همان ارزها. عملکرد بهتر این ربات نسبت به نگهداری ارزها به دلیل افت کمتر در بازارهای نزولی بوده است، نه انتخاب ارزهای برتر، و هیچ قانونی جهت حرکت را بهتر از شانس پیش‌بینی نکرده است: این‌ها معاملات خود ربات هستند، نه یک پیش‌بینی.`);
  }

  if (m.avoid.length) {
    out.push('\n### موارد قابل اجتناب یا فروش فوری');
    for (const a of m.avoid) out.push(`- **${a.coin}** — وضعیت ${a.verdict} روی نمودار ${a.interval} (میزان اطمینان ${a.conviction}/100)${a.topReason ? `: ${a.topReason}` : ''}`);
  }

  out.push(`\nدر هر تحلیل، هر خوانش بر اساس دقت واقعی آن در داده‌های گذشته وزن‌دهی می‌شود، بنابراین مواردی که مزیت اندازه‌گیری‌شده‌ای ندارند ارزش صفر دارند — که در حال حاضر امتیاز خود نمودار نیز شامل آن می‌شود: در ${SCORE_BUCKETS_TESTED.bars.toLocaleString('en-US')} کندل از ${SCORE_BUCKETS_TESTED.coins} ارز، قوی‌ترین خوانش‌های آن کمترین دفعات با صعود قیمت همراه بوده‌ام. بخش **اسکن بازار** را برای همین لیست به همراه نمودارها باز کنید، یا درباره هر ارز واحدی از من سوال کنید تا تحلیل کامل را دریافت کنید.`);
  return `${out.join('\n')}\n`;
}

// پاسخ کل بازار: کدام ارز، با چه قیمتی، برای چه مدت زمانی، و کجا فروخته شود.
function marketBlock(m) {
  if (!m) return '';
  const out = [`**اسکن بازار — ${m.scanned} ارز روی نمودار ${m.interval}**${m.skipped ? ` (${m.skipped} مورد دیگر رد شدند: عدم وجود کندل صرافی)` : ''}\n`];
  if (!m.buys.length) {
    if (!m.waitingCount) out.push('هیچ ارزی قابل تحلیل نبود: صرافی‌ها هیچ کندلی بازنگرداندند. لطفاً یک دقیقه دیگر دوباره امتحان کنید.');
    else out.push(`در حال حاضر هیچ ارزی شرایط لازم برای خرید را ندارد. ${m.waitingCount} ارز وضعیت «بدون مزیت — صبر کنید» را نشان دادند، که این پاسخ صادقانه در بیشتر مواقع بهترین تصمیم است. نظاره‌گر بودن خود یک موضع است.`);
  } else {
    out.push('**ارزهای مناسب برای خرید در حال حاضر**\n');
    m.buys.forEach((b, i) => {
      const lines = [`${i + 1}. **${b.coin}** (${b.name}) — ${b.verdict}، میزان اطمینان ${b.conviction}/100، قیمت فعلی ${fmtNum(b.price)}`];
      if (b.buyBetween) lines.push(`   - خرید بین ${fmtNum(b.buyBetween[0])} و ${fmtNum(b.buyBetween[1])}؛ حد ضرر ${fmtNum(b.stopLoss)} (ریسک ${b.riskPct}%)`);
      if (b.sellTargets) lines.push(`   - اهداف فروش: ${b.sellTargets.map(fmtNum).join(' → ')}`);
      if (b.holdForBars) lines.push(`   - الگوهای مشابه گذشته حدود ${b.holdForBars} کندل به صعود ادامه داده‌اند و در نزدیکی ${fmtNum(b.expectedPeakPrice)} به اوج رسیده‌اند${b.turnsDownAfterBars ? `، و از کندل ${b.turnsDownAfterBars} به بعد چرخیده‌اند` : ''}`);
      if (!b.buyBetween && b.waitFor) lines.push(`   - هنوز شرط ورودی محقق نشده است: ${b.waitFor}`);
      if (b.topReason) lines.push(`   - ${b.topReason}`);
      out.push(lines.join('\n'));
    });
  }
  if (m.avoid.length) {
    out.push(`\n**قابل اجتناب یا فروش**\n${m.avoid.map((a) => `- **${a.coin}** — ${a.verdict} (میزان اطمینان ${a.conviction}/100)${a.topReason ? `: ${a.topReason}` : ''}`).join('\n')}`);
  }
  out.push(`\nافق زمانی این سیگنال‌ها حدود **${m.horizonText}** است. هر تحلیل سیگنال نمودار، پیش‌بینی هوش مصنوعی و زمان‌بندی حرکت را ترکیب می‌کند که بر اساس دقت واقعی هر کدام وزن‌دهی شده‌اند — بنابراین خوانشی که مزیت اندازه‌گیری‌شده‌ای نداشته باشد به سختی محاسبه می‌شود.`);
  out.push('درباره هر ارز واحدی از من سوال کنید تا تحلیل کامل را دریافت کنید، یا صفحه **اسکن بازار** را برای همین لیست همراه با نمودارها باز کنید.');
  return `${out.join('\n')}\n`;
}

// دو یا سه ارز، رتبه‌بندی‌شده در برابر یکدیگر بر اساس شواهد یکسان.
//
// بخش سخت مقایسه، جمع‌آوری اعداد نیست، بلکه امتناع از اعلام برنده زمانی است
// که برنده مشخصی وجود ندارد. هر ارز در اینجا با همان ترکیبی امتیازدهی می‌شود که
// سایر بخش‌های برنامه استفاده می‌کنند، و زمانی که اختلاف بین آن‌ها در حد نویز باشد،
// پاسخ اعلام می‌کند که آن‌ها در یک سطح هستند به جای اینکه رتبه‌بندی ساختگی ایجاد کند.
function compareBlock(rows, interval, horizon) {
  if (!rows?.length) return '';
  const ranked = [...rows].sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0));
  const out = [`**${ranked.map((r) => r.coin).join(' در برابر ')}** — تست یکسان، تایم‌فریم یکسان (${interval})، رتبه‌بندی‌شده بر اساس شواهد.\n`];

  out.push('| | ' + ranked.map((r) => `**${r.coin}**`).join(' | ') + ' |');
  out.push('|---|' + ranked.map(() => '---').join('|') + '|');
  const row = (label, get) => out.push(`| ${label} | ${ranked.map(get).join(' | ')} |`);
  row('نتیجه', (r) => r.verdict || '—');
  row('میزان اطمینان', (r) => (r.conviction ?? '—') + '/100');
  row('سیگنال نمودار', (r) => `${r.signalText || '—'}${r.score !== null && r.score !== undefined ? ` (${r.score > 0 ? '+' : ''}${r.score})` : ''}`);
  row('پیش‌بینی', (r) => (r.probUpPct !== null && r.probUpPct !== undefined ? `${r.probUpPct}% صعود` : '—'));
  row('دقت اندازه‌گیری‌شده', (r) => (r.accuracyPct !== null && r.accuracyPct !== undefined ? `${r.accuracyPct}%` : 'اندازه‌گیری‌نشده'));
  row('تغییرات ۲۴ ساعته', (r) => (r.change24h === null || r.change24h === undefined ? '—' : pct(r.change24h)));
  row('محدوده خرید', (r) => (r.buyBetween ? `${fmtNum(r.buyBetween[0])} – ${fmtNum(r.buyBetween[1])}` : 'بدون ورود فعلی'));
  row('حد ضرر', (r) => (r.stopLoss ? fmtNum(r.stopLoss) : '—'));
  row('اولین هدف', (r) => (r.sellTargets ? fmtNum(r.sellTargets[0]) : '—'));

  const top = ranked[0], second = ranked[1];
  const gap = (top.conviction ?? 0) - (second?.conviction ?? 0);
  out.push('');
  if (!top.conviction || top.conviction < 25) {
    out.push(`**هیچ‌کدام در حال حاضر گزینه مناسبی برای خرید نیستند.** بهترینِ این سه ارز فقط امتیاز ${top.conviction ?? 0}/100 را کسب کرده است که برای اقدام کافی نیست. صبر کردن هیچ هزینه‌ای ندارد.`);
  } else if (gap < 10) {
    out.push(`**فاصله بسیار نزدیک است و نمی‌توان قطعی نظر داد.** ${top.coin} تنها با ${gap} امتیاز بالاتر از ${second.coin} قرار دارد که در محدوده نویز این روش است — آن‌ها را در یک سطح در نظر بگیرید و بر اساس دارایی‌های فعلی یا شناخت خودتان انتخاب کنید، نه این رتبه‌بندی.`);
  } else {
    out.push(`**${top.coin} گزینه قوی‌تری در میان ${ranked.length} ارز است** و ${gap} امتیاز اطمینان بیشتر نسبت به ${second.coin} دارد. ${top.topReason || ''}`);
  }
  const weak = ranked.filter((r) => r.accuracyPct !== null && r.accuracyPct !== undefined && r.accuracyPct < 52);
  if (weak.length) out.push(`\nپیش‌بینی در ${weak.map((r) => r.coin).join(' و ')} در این تایم‌فریم مزیت اندازه‌گیری‌شده‌ای ندارد، بنابراین جدول آن‌ها صرفاً بر پایه سیگنال نمودار بنا شده است.`);
  out.push(`\nافق زمانی برای تمامی آن‌ها حدود ${horizon} است.`);
  return `${out.join('\n')}\n`;
}

// سرتیتر اخبار صرفاً زمینه را برای خواننده فراهم می‌کنند، نه ورودی مدل — این موضوع به صراحت بیان می‌شود.
function newsBlock(ctx) {
  const n = ctx.news;
  if (!n?.length) return '';
  const when = (at) => {
    const h = Math.round((Date.now() - new Date(at).getTime()) / 3600e3);
    return h < 1 ? 'همین الان' : h < 24 ? `${h} ساعت پیش` : `${Math.round(h / 24)} روز پیش`;
  };
  return `\n**اخبار اخیر**\n${n.map((x) => `- ${x.title} _(${x.source}، ${when(x.at)})_`).join('\n')}\n- این موارد صرفاً پس‌زمینه هستند. پیش‌بینی بالا صرفاً از داده‌های قیمت ساخته شده است، بنابراین رقم دقت آن شامل اخبار نمی‌شود.\n`;
}

// سیگنال نمودار و پیش‌بینی دو خوانش مستقل هستند و اغلب با یکدیگر اختلاف دارند.
// ارائه یک پیشنهاد مطمئن «خرید» در حالی که مدل به‌سکوت احتمال صعود را 42% اعلام می‌کند،
// گمراه‌کننده‌ترین کاری است که این برنامه می‌تواند انجام دهد، بنابراین این تناقض ابتدا به زبان ساده
// اعلام می‌شود و پیشنهاد خرید متناسب با آن تعدیل می‌گردد.
export function conflictCheck(sig, forecast) {
  if (!sig?.ok || !forecast) return null;
  const side = sig.plan?.side ?? (sig.score > 0 ? 'long' : sig.score < 0 ? 'short' : null);
  if (!side) return null;
  const probUp = forecast.probUpPct;
  if (probUp === null || probUp === undefined) return null;

  // فقط تمایل مشخص حساب می‌شود — 49% در برابر 51% نویز است
  const forecastSide = probUp >= 55 ? 'long' : probUp <= 45 ? 'short' : null;
  if (!forecastSide || forecastSide === side) return null;

  const acc = forecast.testedDirectionPct ?? forecast.validatedAccuracyPct;
  const forecastIsWeak = forecast.directionReliable === false || acc === null || acc === undefined || acc < 52;
  return { side, forecastSide, probUp, acc, forecastIsWeak };
}

function conflictBlock(ctx) {
  const c = conflictCheck(ctx.signal, ctx.forecast);
  if (!c) return '';
  // الگو از عبارت «the next ${horizon}» استفاده می‌کند، بنابراین جایگزینی که با «the» شروع می‌شد
  // منجر به ساخت عبارت «the next the forecast horizon» می‌شد.
  const horizon = ctx.horizonText || `${ctx.forecast?.horizonBars ?? 'چند'} کندل`;
  // این بخش همچنان امتیاز نمودار را یک «خرید» یا «فروش» می‌نامید در حالی که سایر قسمت‌های
  // پاسخ از آن دست کشیده بودند — دو جمله پایین‌تر از خطی که می‌گوید امتیاز نشان‌دهنده میزان امتداد حرکت است
  // نه مقصد بعدی آن. هر دو طرف این تناقض اکنون به یک شکل توصیف می‌شوند: به عنوان یک تمایل.
  const signalWord = c.side === 'long' ? 'صعودی' : 'نزولی';
  const modelWord = c.forecastSide === 'long' ? 'صعودی' : 'نزولی';
  const lines = [
    `⚠️ **دو خوانش با یکدیگر تناقض دارند — این وضعیت را به عنوان نبود مزیت واضح در نظر بگیرید.** تحلیل نمودار تمایل به **${signalWord}** دارد، اما پیش‌بینی هوش مصنوعی ${nextSpan(horizon)} را **${c.probUp}% صعودی** اعلام می‌کند که متمایل به **${modelWord}** است.`,
  ];
  lines.push(c.forecastIsWeak
    ? `روی این ارز و تایم‌فریم، پیش‌بینی ${c.acc === null || c.acc === undefined ? 'هنوز دقت اندازه‌گیری‌شده‌ای ندارد' : `تنها ${c.acc}% دقت در داده‌های دیده نشده اخیر کسب کرده است`}، بنابراین این بخش ضعیف‌تر است — اما همچنان جهت مخالف را نشان می‌دهد و این دلیلی برای گرفتن پوزیشن کوچک‌تر است، نه بزرگ‌تر.`
    : `پیش‌بینی در داده‌های دیده نشده اخیر دقت ${c.acc}% را ثبت کرده است، بنابراین نویز نیست. وقتی یک مدل تست‌شده با نمودار تناقض دارد، صبر کردن برای توافق آن‌ها معامله معقول‌تری است.`);
  lines.push('اگر به هر حال پوزیشنی باز می‌کنید، از حد ضرر دقیقاً مطابق متن استفاده کنید و حجم آن را کوچک بگیرید.');
  return `\n${lines.join(' ')}\n`;
}

function reasonsBlock(sig, n = 4) {
  const b = sig.reasons.bullish.slice(0, n).map((r) => `- ✅ ${r}`);
  const s = sig.reasons.bearish.slice(0, n).map((r) => `- ⚠️ ${r}`);
  return `\n**دلایل**\n${[...b, ...s].join('\n')}\n`;
}

function sentimentLine(ctx) {
  if (!ctx.fearGreed) return '';
  const v = ctx.fearGreed.value;
  const note = v <= 25 ? 'ترس شدید اغلب مناطق مناسبی برای انباشت بلندمدت فراهم می‌کند، اما روندها ممکن است همچنان به ریزش ادامه دهند'
    : v >= 75 ? 'طمع شدید اغلب پیش‌روی اصلاح‌های قیمتی است — در تعقیب بازار احتیاط کنید'
    : 'شاخص احساسات در محدوده حدی قرار ندارد';
  return `\n**احساسات بازار:** شاخص ترس و طمع ${v} (${ctx.fearGreed.classification}) — ${note}.\n`;
}

export function ruleBasedAnswer(question, ctx = {}) {
  // احوالپرسی‌ها، تعاریف، «چگونه کار می‌کند» و «آیا کلاهبرداری است» سوالات مربوط به نمودار نیستند؛
  // پاسخ دادن به آن‌ها با تحلیل نمودار رفتار قبلی سیستم بود.
  const plain = conversationalAnswer(question, { symbol: ctx.coin?.symbol || null, named: namedCoins(question) });
  if (plain) return plain;
  let intent = detectIntent(question);
  // سوالی که کل بازار را هدف قرار داده اما با تحلیل یک ارز و بدون اسکن بازار دریافت شده است
  // (صفحه تشخیص داده بود که ارزی نام برده شده)، به جای «لحظاتی دیگر دوباره سوال کنید» درباره همان ارز پاسخ داده می‌شود.
  if (intent === 'market' && !ctx.marketFrames && !ctx.market && ctx.signal) intent = 'summary';
  const sig = ctx.signal;
  const out = [];

  if (intent === 'compare') {
    if (!ctx.compare?.length) {
      return `برای مقایسه ارزها به دریافت نمودار هر کدام نیاز دارم — لطفاً لحظاتی دیگر دوباره سوال کنید.\n\n${DISCLAIMER}`;
    }
    out.push(compareBlock(ctx.compare, ctx.compareInterval || ctx.interval || '4h', ctx.horizonText || 'چند روز آینده'));
    out.push(sentimentLine(ctx));
    out.push(DISCLAIMER);
    return out.filter((l) => l !== '').join('\n');
  }

  if (intent === 'market') {
    if (ctx.marketFrames) {
      out.push(marketMultiBlock(ctx.marketFrames));
      if (ctx.portfolio?.length) {
        out.push(`\n**دارایی‌های فعلی شما:** ${ctx.portfolio.map((h) => `${h.symbol} (${pct(h.pnlPct)})`).join(', ')}. برای بررسی وضعیت آن‌ها بپرسید «پورتفوی من را بررسی کن».`);
      }
      out.push(sentimentLine(ctx));
      out.push(DISCLAIMER);
      return out.filter((l) => l !== '').join('\n');
    }
    if (!ctx.market) {
      return `برای پاسخ به این سوال باید بازار را اسکن کنم — لحظاتی دیگر دوباره تلاش کنید، یا صفحه **اسکن بازار** را برای مشاهده لیست رتبه‌بندی‌شده باز کنید.\n\n${DISCLAIMER}`;
    }
    out.push(marketBlock(ctx.market));
    if (ctx.portfolio?.length) {
      out.push(`\n**دارایی‌های فعلی شما:** ${ctx.portfolio.map((h) => `${h.symbol} (${pct(h.pnlPct)})`).join(', ')}. برای بررسی وضعیت آن‌ها بپرسید «پورتفوی من را بررسی کن».`);
    }
    out.push(sentimentLine(ctx));
    out.push(DISCLAIMER);
    return out.filter((l) => l !== '').join('\n');
  }

  if (intent === 'portfolio') {
    const p = ctx.portfolio || [];
    if (!p.length) return `شما هنوز هیچ دارایی‌ای اضافه نکرده‌اید. بخش **کیف پول** را باز کنید و ارزها را به همراه مقدار و میانگین قیمت خرید اضافه کنید — سپس مشخص می‌کنم کدام‌یک را نگه دارید، کم کنید یا بفروشید.\n\n${DISCLAIMER}`;
    const total = p.reduce((s, h) => s + (h.value || 0), 0);
    out.push(`**بررسی سبد دارایی** · ارزش کل ${fmtNum(total)} ${fx.code}\n`);
    for (const h of p) {
      const share = total ? ((h.value / total) * 100).toFixed(1) : '0';
      out.push(`- **${h.symbol}** — ${share}% از پورتفوی، سود و زیان ${pct(h.pnlPct)}${h.advice ? ` → ${h.advice}` : ''}`);
    }
    const biggest = [...p].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
    if (biggest && total && biggest.value / total > 0.6) {
      out.push(`\n⚠️ **ریسک تمرکز:** ${biggest.symbol} بیش از ۶۰ درصد سبد دارایی شما را تشکیل می‌دهد. برای جلوگیری از از دست رفتن سودها در اثر نوسان یک ارز، متعادل‌سازی سبد را در نظر بگیرید.`);
    }
    out.push(`\n${DISCLAIMER}`);
    return out.join('\n');
  }

  if (!sig?.ok && (ctx.marketFrames || ctx.market)) {
    const body = ctx.marketFrames ? marketMultiBlock(ctx.marketFrames) : marketBlock(ctx.market);
    return `${body}${sentimentLine(ctx)}\n${DISCLAIMER}`;
  }

  if (!sig?.ok) {
    return `یک ارز (مثلاً **بیت‌کوین**) را باز کنید تا بتوانم نمودارش را بخوانم، سپس دوباره سوال کنید. می‌توانم سیگنال را توضیح دهم، سطوح ورود و خروج را پیشنهاد کنم، حجم پوزیشن را محاسبه کنم، یا سبد دارایی شما را بررسی کنم.\n\n${DISCLAIMER}`;
  }

  out.push(header(ctx));
  out.push('');

  switch (intent) {
    case 'forecast': {
      if (ctx.forecast) {
        out.push(forecastBlock(ctx.forecast, ctx));
        out.push(timingBlock(ctx));
        out.push(historyBlock(ctx.history));
        out.push(newsBlock(ctx));
        out.push(signalLine(sig, ctx.interval));
        out.push(`\nپیش‌بینی ترکیبی از ۷ مدل است — تطبیق الگوهای نمودار با تاریخچه، حرکات مشابه گذشته، درخت‌های تصمیم‌گیری تقویتی (Gradient-boosted)، شبکه عصبی، رگرسیون لجستیک، نزدیک‌ترین همسایگان و مدل روند — که هر کدام بر اساس دقت‌شان در داده‌های دیده‌نشده اخیر وزن‌دهی شده‌اند. آن را به عنوان یک احتمال در نظر بگیرید، نه یک وعده قطعی، و آن را با سطوح حد ضرر زیر ترکیب کنید.`);
        out.push(`\n**سطوح کلیدی:** مقاومت ${sig.levels.resistances.slice(0, 2).map(fmtNum).join(' / ') || '—'} · حمایت ${sig.levels.supports.slice(0, 2).map(fmtNum).join(' / ') || '—'}`);
      } else {
        out.push('پیش‌بینی هوش مصنوعی برای این نمودار در حال محاسبه است — لطفاً لحظاتی دیگر دوباره سوال کنید. در این فاصله، سیگنال فنی:');
        out.push(signalLine(sig, ctx.interval));
        out.push(reasonsBlock(sig, 3));
      }
      break;
    }
    case 'entry': {
      out.push(signalLine(sig, ctx.interval));
      const conflict = conflictBlock(ctx);
      out.push(conflict);
      if (sig.plan?.side === 'long') {
        out.push(conflict
          ? `\nساختار نمودار یک محدوده ورود را مشخص می‌کند، اما پیش‌بینی با آن مخالف است — هشدار بالا را مطالعه کنید.`
          : `\nساختار نمودار یک محدوده ورود، حد ضرر و اهداف را تعیین کرده است که در ادامه آمده‌اند. این‌ها هندسه بازار هستند، نه توصیه قطعی: در سابقه اندازه‌گیری‌شده، چنین خوانشی احتمال بالاتری نسبت به شانس برای صعود نداشته است. اگر قصد معامله دارید، این سطوح جایی هستند که ساختار بازار در آن‌ها شکل گرفته است.`);
        out.push(planBlock(sig.plan));
      } else if (sig.plan?.side === 'short') {
        out.push(`\nاندیکاتورها در اینجا نزولی هستند، بنابراین ساختار بازار هیچ نقطه ورود صعودی‌ای ارائه نمی‌دهد — فقط سطوحی برای زیر نظر داشتن وجود دارد. توجه داشته باشید که خوانش‌های پایین نیز سیگنال فروش قابل اعتمادی نبوده‌اند؛ هر دو جهت تست شده‌اند و هیچ‌کدام پس از کسر هزینه‌ها سودده نبوده‌اند.`);
        if (sig.waitFor?.length || sig.levels.supports.length) {
          out.push(`\nمواظب بازگشت قیمت در نزدیکی حمایت ${sig.levels.supports.slice(0, 2).map(fmtNum).join(' / ') || '—'} باشید، به طوری که RSI صعودی شود و MACD تقاطع صعودی ایجاد کند.`);
        }
      } else {
        out.push(`\n**در حال حاضر مزیت مشخصی وجود ندارد** — بازار نامتوازن است. منتظر یکی از این شرایط باشید:`);
        out.push(sig.waitFor.map((w) => `- ${w}`).join('\n'));
      }
      out.push(reasonsBlock(sig, 3));
      out.push(mtfBlock(ctx));
      if (ctx.forecast) {
        out.push(ctx.forecast.directionReliable === false
          ? `**پیش‌بینی هوش مصنوعی:** جهت قابل اعتمادی روی این نمودار وجود ندارد (تمایل خام ${ctx.forecast.rawProbUpPct}% صعودی)؛ بازه ۸۰٪ آن طی ${nextSpan(ctx.horizonText || ctx.forecast.horizonBars + ' کندل')} برابر با ${fmtNum(ctx.forecast.wideRange[0])} – ${fmtNum(ctx.forecast.wideRange[1])} است.`
          : `**پیش‌بینی هوش مصنوعی:** احتمال ${ctx.forecast.probUpPct}% برای صعود طی ${nextSpan(ctx.horizonText || ctx.forecast.horizonBars + ' کندل')} (اطمینان: ${ctx.forecast.confidence}).`);
      }
      break;
    }
    case 'exit': {
      out.push(signalLine(sig, ctx.interval));
      out.push(conflictBlock(ctx));
      if (sig.score <= -THRESHOLDS.normal) {
        out.push(`\nمومنتوم علیه خریداران شده است. اگر ${ctx.coin?.symbol || 'این ارز'} را در اختیار دارید، **بستن یا کاهش** پوزیشن را در نظر بگیرید، یا حداقل حد ضرر خود را تنگ‌تر کنید.`);
      } else if ((sig.indicators.rsi ?? 50) > 72) {
        out.push(`\nروند همچنان صعودی است اما RSI در منطقه اشباع خرید قرار دارد (${sig.indicators.rsi?.toFixed(0)}). رویکرد رایج این است که **بخشی از سود را ذخیره کنید** و حد ضرر را برای مابقی پوزیشن دنبال کنید.`);
      } else {
        out.push(`\nهنوز سیگنال خروجی صادر نشده است — ساختار بازار همچنان برقرار است. حد ضرر خود را فعال نگه دارید.`);
      }
      out.push(timingBlock(ctx));
      // یک برنامه خروج. این بخش قبلاً سطوح خود نمودار و سپس قوانین طرح معامله
      // را در زیر آن‌ها فهرست می‌کرد: دو حد ضرر متفاوت، خروج بر اساس روند دو بار
      // (یک بار به عنوان «بسته شدن روزانه» روی نمودار ۴ ساعته) و اهدافی که با
      // اهداف بخش محاسبه حجم مطابقت نداشتند.
      if (sig.plan?.side === 'long' && sig.plan.exitRules?.length) {
        out.push(`\n**برنامه خروج** (طرح معاملاتی ${ctx.interval})\n- اهداف کسب سود: ${sig.plan.takeProfits.map(fmtNum).join(' / ')}\n${sig.plan.exitRules.map((r) => `- ${r}`).join('\n')}`);
      } else {
        const res = sig.levels.resistances.slice(0, 3).map(fmtNum).join(' / ');
        const sup = sig.levels.supports.slice(0, 2).map(fmtNum).join(' / ');
        out.push(`\n**برنامه خروج**\n- سطوح کسب سود (مقاومت): ${res || '—'}\n- حد ضرر محافظتی: پایین‌تر از ${sup ? sup.split(' / ')[0] : fmtNum(sig.price - 1.5 * (sig.indicators.atr || 0))}${sig.indicators.ema50 ? `\n- خروج از روند: بسته شدن کندل ${ctx.interval} پایین‌تر از میانگین متحرک ۵۰ (EMA) (${fmtNum(sig.indicators.ema50)})` : ''}`);
      }
      break;
    }
    case 'risk': {
      const account = parseAccount(question);
      const plan = sig.plan;
      const atrV = sig.indicators.atr || sig.price * 0.02;
      const sup = sig.levels.supports[0];
      let longStop = sig.price - 1.5 * atrV;
      if (sup && sig.price - (sup - 0.25 * atrV) <= 3 * atrV) longStop = Math.min(longStop, sup - 0.25 * atrV);
      if (plan?.side === 'long') longStop = plan.stopLoss;
      const stopDistPct = Math.max(0.2, +(((sig.price - longStop) / sig.price) * 100).toFixed(2));
      out.push(`**تعیین حجم پوزیشن** — در هر معامله مقدار ثابت ۱ تا ۲ درصد از حساب خود را ریسک کنید، نه مقدار ثابتی از ارز را.`);
      out.push(`\n- پیشنهاد حد ضرر برای خرید: **${fmtNum(longStop)}** (${stopDistPct}% پایین‌تر از قیمت${plan?.side === 'long' ? '، بر اساس طرح معاملاتی' : '، معادل 1.5× ATR / پایین‌تر از حمایت'})`);
      if (plan?.side === 'long') out.push(`- اهداف کسب سود: ${plan.takeProfits.map(fmtNum).join(' / ')}`);
      if (plan?.side === 'short') out.push(`- ⚠️ سیگنال فعلی **نزولی** است — صبر کردن برای ورود مناسب‌تر، عاقلانه‌تر از خرید در این نقطه است.`);
      out.push(`\nفرمول: *حجم پوزیشن = (سرمایه حساب × درصد ریسک) ÷ درصد فاصله حد ضرر*`);
      if (account) {
        const r1 = account * 0.01, r2 = account * 0.02;
        const p1 = Math.min(account, r1 / (stopDistPct / 100)), p2 = Math.min(account, r2 / (stopDistPct / 100));
        out.push(`\nبرای یک حساب **$${money(account)}**:\n- محافظه‌کارانه (ریسک ۱٪ = $${money(r1)}): خرید حدود **$${money(p1)}** از ${ctx.coin?.symbol || 'ارز'} (≈ ${fmtNum(p1 / sig.price)} ${ctx.coin?.symbol || ''})\n- تهاجمی (ریسک ۲٪ = $${money(r2)}): خرید حدود **$${money(p2)}** (≈ ${fmtNum(p2 / sig.price)} ${ctx.coin?.symbol || ''})`);
        // محدود شده به کل موجودی (یک حد ضرر نزدیک)، ضرر در نقطه حد ضرر کمتر از
        // بودجه ریسک است؛ قبلاً بودجه را در هر دو حالت اعلام می‌کرد.
        const l1 = p1 * (stopDistPct / 100), l2 = p2 * (stopDistPct / 100);
        out.push(`\nدر صورت اصابت حد ضرر حدود $${money(l1)}${Math.abs(l2 - l1) > 0.005 ? `–$${money(l2)}` : ''} ضرر خواهید کرد، نه کل مبلغ حساب شما.${p2 >= account ? ' با حد ضرری به این نزدیکی، حجم پوزیشن به کل موجودی شما محدود می‌شود.' : ''} بدون اهرم (لوریج).`);
      } else {
        out.push(`\nاندازه حساب خود را اعلام کنید (مثلاً «من ۱۰۰۰ دلار دارم») تا مقدار دقیق را محاسبه کنم.`);
      }
      out.push(`\nنوسان‌پذیری (ATR) برابر با ${sig.indicators.atrPct}% در هر کندل است — ${sig.indicators.atrPct > 4 ? 'زیاد است، بنابراین حجم پوزیشن را کوچکتر انتخاب کنید' : 'متعادل است'}.`);
      break;
    }
    case 'levels': {
      out.push(`**سطوح کلیدی**\n- مقاومت: ${sig.levels.resistances.map(fmtNum).join(' / ') || '—'}\n- حمایت: ${sig.levels.supports.map(fmtNum).join(' / ') || '—'}`);
      out.push(`\nسطوح از تکرار سقف‌ها و کف‌های قیمتی به دست می‌آیند. بسته شدن تمیز کندل فراتر از یک سطح همراه با حجم معاملات بالاتر از میانگین، معتبرتر از سایه کندل (Wick) است.`);
      break;
    }
    case 'indicators': {
      const i = sig.indicators;
      out.push(`**وضعیت اندیکاتورها**\n- RSI(14): ${i.rsi?.toFixed(1) ?? '—'} ${i.rsi > 70 ? '(اشباع خرید)' : i.rsi < 30 ? '(اشباع فروش)' : ''}\n- MACD: ${signed(i.macd, 4)} در برابر سیگنال ${signed(i.macdSignal, 4)} (هیستوگرام ${i.macdHist > 0 ? 'مثبت' : 'منفی'})\n- میانگین‌های متحرک EMA 20 / 50 / 200: ${fmtNum(i.ema20)} / ${fmtNum(i.ema50)} / ${fmtNum(i.ema200)}\n- باندهای بولینگر: ${fmtNum(i.bbLower)} – ${fmtNum(i.bbUpper)}\n- ADX: ${i.adx?.toFixed(0) ?? '—'} ${i.adx > 25 ? '(رونددار)' : '(بدون روند/نوسانی)'}\n- ATR: ${fmtNum(i.atr)} (${i.atrPct}%)\n- حجم نسبت به میانگین ۲۰ کندل: ${i.volumeRatio ?? '—'}×${i.supertrendDir ? `\n- ابر فوق‌العاده (Supertrend): ${i.supertrendDir === 1 ? 'صعودی' : 'نزولی'} (تغییر جهت در ${fmtNum(i.supertrend)})` : ''}${i.mfi !== null && i.mfi !== undefined ? `\n- شاخص جریان پول (MFI): ${i.mfi.toFixed(0)} ${i.mfi > 80 ? '(خرید سنگین)' : i.mfi < 20 ? '(فروش سنگین)' : ''}` : ''}${i.cci !== null && i.cci !== undefined ? `\n- CCI(20): ${signed(i.cci)} ${i.cci > 100 ? '(اصطکاک صعودی)' : i.cci < -100 ? '(اصطکاک نزولی)' : ''}` : ''}${i.willR !== null && i.willR !== undefined ? `\n- ویلیامز %R: ${signed(i.willR)} ${i.willR > -20 ? '(نزدیک سقف محدوده)' : i.willR < -80 ? '(نزدیک کف محدوده)' : ''}` : ''}${i.donchianHigh ? `\n- سطوح شکست کانال دونچین ۲۰ کندلی: ${fmtNum(i.donchianLow)} – ${fmtNum(i.donchianHigh)}` : ''}`);
      out.push('این خوانش‌ها وضعیت نمودار را توصیف می‌کنند؛ هیچ‌کدام به تنهایی برای پیش‌بینی حرکت بعدی اندازه‌گیری نشده‌اند.');
      // سوال «RSI بیت‌کوین چقدر است؟» داده‌های بالا و معنای آن عدد را دریافت می‌کند.
      const asked = termsIn(question);
      if (asked.length) out.push(`\n${asked.map((g) => `**${g.title}:** ${g.text}`).join('\n\n')}`);
      out.push(reasonsBlock(sig, 5));
      break;
    }
    case 'backtest': {
      const b = ctx.backtest;
      // پاسخ صادقانه اولیه به سوال «آیا این سیستم خوب است؟» اندازه‌گیری گام‌به‌گام (Walk-forward)
      // و مبنایی است که باید بر آن غلبه کند، نه بک‌تست یک نمودار منفرد. با این موارد شروع کنید،
      // و هر زمان مزیتی وجود نداشت به صراحت اعلام کنید.
      const a = ctx.interval ? accuracyFor(ctx.interval) : null;
      const r = ctx.interval ? TESTED_ACCURACY.recheck?.[ctx.interval] : null;
      if (r) {
        const edge = +(r.hit - r.baseline).toFixed(1);
        out.push(`**دقت پیش‌بینی اندازه‌گیری‌شده روی نمودارهای ${ctx.interval}: ${r.hit}%** در آخرین تست (${r.n.toLocaleString('en-US')} پیش‌بینی روی ${r.coins} ارز، ${TESTED_ACCURACY.recheck.measuredOn})، ${r.hit < 52 ? 'عملکردی نه بهتر از پرتاب سکه' : 'بالاتر از پرتاب سکه'}. مبنایی که باید شکست دهد — یعنی انتخاب همیشگی جهتی که برای هر ارز در آن پیش‌بینی‌ها رایج‌تر بوده است — امتیاز ${r.baseline}% را ثبت کرده است (با ده پیش‌بینی برای هر ارز، آن مبنا حتی به صورت تصادفی بالای ۵۰٪ قرار می‌گیرد)${edge > 0 ? `، بنابراین مزیتی معادل ${edge} امتیاز دارد` : '، بنابراین در اینجا **هیچ مزیت اندازه‌گیری‌شده‌ای ندارد**'}.${a ? ` تست انتشار قبلی (${TESTED_ACCURACY.coins} ارز، ${TESTED_ACCURACY.measuredOn}) دقت ${a.accuracyPct}% در برابر ${a.baselinePct}% را نشان داد.` : ''}`);
      } else if (a) {
        out.push(`**دقت پیش‌بینی اندازه‌گیری‌شده روی نمودارهای ${ctx.interval}: ${a.accuracyPct}%**، در مقایسه با ${a.baselinePct}% برای انتخاب همیشه رایج‌ترین جهت در همان تست‌ها — ${a.beatsBaseline ? `مزیتی معادل ${a.edgePts} امتیاز` : `${Math.abs(a.edgePts)} امتیاز **بدتر** از آن مبنا، بنابراین در اینجا مزیت اندازه‌گیری‌شده‌ای ندارد`}.`);
      }
      const ro = recheckOverall();
      out.push(`در تمامی تایم‌فریم‌ها ${ro ? `آخرین تست امتیاز ${ro.hit}% در برابر ${ro.baseline}% و ` : ''}تست انتشار ${TESTED_ACCURACY.all}% در برابر ${TESTED_ACCURACY.allBaseline}% را ثبت کرده‌اند، بنابراین در مجموع این سیستم **نمی‌تواند** به سادگی پیش‌بینی جهت رایج‌تر را شکست دهد. در بخش‌های زیر مشخص شده که هیچ مزیتی وجود ندارد روی: ${(TESTED_ACCURACY.noEdge || []).join(', ')}. ${TESTED_ACCURACY.caveat}`);
      if (!b?.ok) { out.push('\nهنوز هیچ بک‌تستی از قوانین نمودار برای این تایم‌فریم موجود نیست.'); break; }
      out.push(`**بک‌تست قوانین سیگنال روی این نمودار** (فقط خرید، کارمزد ۰.۱٪)\n- تعداد معاملات: ${b.tradeCount}\n- نرخ برد: ${b.winRate ?? '—'}%\n- بازدهی استراتژی: ${pct(b.totalReturnPct)} در برابر خرید و نگهداری ${pct(b.buyHoldPct)}\n- بیشترین افت سرمایه: ${b.maxDrawdownPct}%\n- ضریب سود: ${b.profitFactor ?? '—'}`);
      out.push(`\n${b.totalReturnPct > b.buyHoldPct ? 'قوانین در این نمونه توانستند عملکرد بهتری از خرید و نگهداری داشته باشند.' : 'روش خرید و نگهداری در این نمونه عملکرد بهتری داشت — سیگنال‌ها را به عنوان کمکی برای زمان‌بندی در نظر بگیرید، نه یک تضمین قطعی.'} نتایج گذشته روی یک ارز و تایم‌فریم عملکرد آینده را پیش‌بینی نمی‌کنند؛ پیش از اعتماد به آن‌ها، چندین مورد را تست کنید.`);
      break;
    }
    default: {
      out.push(signalLine(sig, ctx.interval));
      out.push(conflictBlock(ctx));
      const bias = sig.score >= THRESHOLDS.normal ? 'متمایل به صعود' : sig.score <= -THRESHOLDS.normal ? 'متمایل به نزول' : 'رنج / بدون تصمیم قطعی';
      out.push(`\nدر مجموع اندیکاتورها **${bias}** هستند — توصیفی از جایگاه فعلی قیمت، نه پیش‌بینی مقصد بعدی آن.`);
      out.push(reasonsBlock(sig, 4));
      out.push(mtfBlock(ctx));
      if (ctx.forecast) out.push(forecastBlock(ctx.forecast, ctx));
      out.push(timingBlock(ctx));
      out.push(historyBlock(ctx.history));
      out.push(newsBlock(ctx));
      out.push(planBlock(sig.plan));
      if (!sig.plan && sig.waitFor.length) out.push(`**مواردی که باید منتظر آن‌ها بود**\n${sig.waitFor.map((w) => `- ${w}`).join('\n')}`);
      out.push(`\n**سطوح کلیدی:** مقاومت ${sig.levels.resistances.slice(0, 2).map(fmtNum).join(' / ') || '—'} · حمایت ${sig.levels.supports.slice(0, 2).map(fmtNum).join(' / ') || '—'}`);
    }
  }
  out.push(sentimentLine(ctx));
  out.push(DISCLAIMER);
  return out.filter((l) => l !== '').join('\n');
}

// پرامپت سیستمی برای مدل زبانی داخلی. مدل‌های محلی کوچک زمانی دقیق هستند که
// حقایق تأییدشده را با بیان خود بازگو کنند، بنابراین پرامپت آن‌ها را به داده‌های ارائه‌شده محدود می‌کند.
export const AI_SYSTEM_PROMPT = `You are BTCS AI, a crypto market analyst inside a market-data website.
Answer the user's question using ONLY the FACTS and DATA provided in their message. They come from live exchange data, technical indicators, a backtested signal engine and a machine-learning forecast that was validated on unseen data.
Rules:
- Never invent prices, percentages or dates. Copy numbers exactly from the facts. Every price, percentage and level you write must appear in the FACTS or DATA; if one you need is missing, say it is not available instead of estimating it. The app checks your figures against the data and replaces an answer that quotes figures it was not given.
- Be direct: say whether the data leans up, down or sideways, give entry / stop-loss / take-profit levels when relevant, and mention the forecast's measured accuracy so the user knows how reliable it is.
- When marketByTimeframe or marketPicks is present the user asked about the WHOLE market, not one coin. Cover every timeframe you were given (short term, swing, position) and, under each, list up to 3 of the ranked coins with their buy zone, stop-loss, sell targets and how long the move is expected to last. Then name the coins that read as a buy on more than one timeframe, and the ones to avoid or sell. Never narrow a whole-market question down to a single coin.
- If the FACTS contain a line saying the two readings disagree, that warning must appear in your first two sentences and your verdict must be cautious. Never present a confident buy or sell when the chart signal and the forecast point opposite ways.
- When a comparison block is present the user asked to compare named coins: keep every coin in the answer, rank them on the conviction given, and if the top two are within 10 points say they are too close to call rather than picking one.
- recentHeadlines is background only. You may mention a headline, but never say it changed the forecast — the model reads price data, not news.
- When moveTiming is present, say how long the move is expected to last and roughly when it turns — that is usually what the user actually wants to know. Never state timing as a certainty.
- When multiYearHistory is present, use it: it says how this coin behaved the last times its chart looked like today (over years of daily data), what the median move afterwards was, and how often that comparison was right on this coin. Quote those numbers, and say plainly when the method's accuracy is near 50% that it is weak evidence.
- Keep it short: a one-line verdict, then 3-6 bullet points (for the whole market, one short list per timeframe). Use **bold** for the verdict.
- The website only shows signals; it cannot place trades or bets. Recommend risking at most 1-2% of the account per trade and always using a stop-loss.
- End with: "Not financial advice."`;