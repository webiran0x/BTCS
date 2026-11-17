// معامله‌گر خودکار هوش مصنوعی — در حالت آزمایشی (Paper Trading).
//
// این سیستم قوانین مشابهی را که بک‌تست منتشر می‌کند، به طور خودکار روی قیمت‌های زنده اجرا می‌کند:
// وقتی سیگنال و مدل با هم توافق داشته باشند پوزیشن باز می‌کند، حجم هر معامله را به گونه‌ای تنظیم می‌کند
// که فعال شدن حد ضرر هزینه کوچک و ثابتی از موجودی حساب باشد، حد ضرر را در سود +1R به نقطه ورود منتقل می‌کند،
// و پوزیشن را روی حد ضرر، حد سود (تارگت) یا معکوس شدن سیگنال می‌بندد.
//
// این سیستم فقط با پول شبیه‌سازی‌شده معامله می‌کند. هیچ اتصال به صرافی، کلید API یا سفارشی در کار نیست.
// هدف این است که به صورت کاملاً صادقانه نشان داده شود استراتژی چه عملکردی داشته است
// — از جمله دوره‌های زیان‌ده — و هیچ‌گونه پوال واقعی جابه‌جا نمی‌شود.
//
// این اسکریپت همچنین عقب‌افتادگی‌ها را جبران می‌کند: وقتی سایت مجدداً باز می‌شود، تابع `replay` کندل‌هایی را که
// در زمان بسته‌بودن تب رخ داده‌اند مرور می‌کند تا سابقه پیوسته بماند، نه اینکه فقط ساعت‌هایی که کاربر صفحه را باز داشته است شمارش شوند.

import { computeAll, atr, ema } from './indicators.js';
import { scoreAt, labelFor, THRESHOLDS } from './signals.js';

/**
 * عملکرد واقعی این مجموعه قوانین روی کندل‌های واقعی.
 *
 * در تاریخ 2026-10-15 با استفاده از ابزار `tools/evaluate-trader-rules.mjs` (ورک‌فلو ارزیابی)
 * روی تمام رمزارزهایی که اپلیکیشن معامله می‌کند و دارای کندل هستند اندازه‌گیری شد (۱۰۶ رمزارز روی 15m،
 * ۱۰۴ روی 1h، ۱۰۳ روی 4h، و ۸۳ روی 1d)، هر کدام از صرافی مربوطه (بایننس، گیت یا HTX؛
 * هر کدام ۴۰۰۰ کندل روی 15m و 1h، ‏ ۳۵۰۰ کندل روی 4h، و ۲۲۰۰ کندل روی 1d). همه رمزارزها کندل به کندل
 * و هم‌زمان از طریق همان موتوری که حساب زنده اجرا می‌کند پیش می‌روند؛ کارمزدها محاسبه شده‌اند؛
 * پوزیشن‌های باز در انتها با آخرین قیمت بسته شدن ارزش‌گذاری می‌شوند. اعداد مربوط به نیمه جدیدتر
 * هر تاریخچه هستند که هیچ نقشی در انتخاب هیچ‌چیزی نداشته‌اند.
 *
 * ۴۳۲ مجموعه قانون روی این داده‌ها آزمایش شدند: ورودهای مبتنی بر روند، بریک‌اوت و خرید در کف (Buy-the-dip)،
 * تأیید مومنتوم، فیلتری که خرید را هنگامی که بیت‌کوین در روند نزولی است متوقف می‌کند، حد ضررهای ۱.۵ تا ۳ ATR،
 * و خروج‌های ثابت و متحرک. قانونی که بهترین رتبه میانگین را در نیمه‌های قدیمی‌تر (`alt`) داشت،
 * روی نیمه‌های جدیدتر در تایم‌فریم‌های 15m، ‏ 1h و 1d ضعیف‌تر از قوانین فعلی و روی 4h بهتر عمل کرد،
 * بنابراین قوانین فعلی حفظ می‌شوند؛ اجرای ۱۲ رمزارز در تاریخ 2026-10-12 نیز همین نتیجه را تایید کرد.
 * روی 15m فقط ۳۵ مورد از ۴۳۲ قانون پس از کسر کارمزد سودآور بودند.
 *
 * معیار مقایسه، خرید و نگهداری (Buy-and-hold) با وزن برابر از همان رمزارزها در همان بازه زمانی است:
 * قوانین روی 15m و 1d بهتر عمل کردند اما روی 1h یا 4h نتوانستند، جایی که نگهداری به ترتیب +۶۰٪ و +۱۶۱٪ بازدهی داشت.
 * این رمزارزها بازماندگان امروز هستند، که نگهداری آن‌ها و هر بک‌تستی از آن‌ها را مطلوب‌تر نشان می‌دهد.
 */
export const AUTOTRADER_TESTED = {
  '15m': { pickedReturn: 4.86, buyHold: 1.05, maxDrawdownPct: 17.8, trades: 222, winRate: 22.5, feeDragPct: 8.9, from: '2026-09-24', to: '2026-10-15', alt: { ret: -9.58, dd: 11.39 }, madeMoney: 35, coins: 106 },
  '1h': { pickedReturn: 26.52, buyHold: 59.55, maxDrawdownPct: 22.02, trades: 209, winRate: 29.7, feeDragPct: 8.9, from: '2026-07-24', to: '2026-10-15', alt: { ret: 4.74, dd: 15.87 }, madeMoney: 172, coins: 104 },
  '4h': { pickedReturn: 28.14, buyHold: 161.26, maxDrawdownPct: 29.44, trades: 178, winRate: 27.5, feeDragPct: 5.9, from: '2025-12-28', to: '2026-10-15', alt: { ret: 53.07, dd: 14.74 }, madeMoney: 218, coins: 103 },
  '1d': { pickedReturn: 170.55, buyHold: 123.78, maxDrawdownPct: 21.79, trades: 128, winRate: 37.5, feeDragPct: 4.5, from: '2023-10-12', to: '2026-10-15', alt: { ret: 150.79, dd: 23.19 }, madeMoney: 384, coins: 83 },
  coins: 106, configs: 432, measuredOn: '2026-10-15',
  altRules: 'ورود بریک‌اوت با فیلتر روند بیت‌کوین، حد ضرر ۳ ATR، هدف 2R، بدون خروج روی معکوس شدن سیگنال',
  beatsBuyAndHold: false,
  selfReview: { runs: 8, acted: 1, note: 'قوانین خود را در ۱ مورد از ۸ اجرای تست‌شده تغییر داد (4h: از -10.9% به -7.2%)؛ در ۷ مورد دیگر تغییری ایجاد نکرد.' },
};

/**
 * قوانین انتخاب‌شده برای یک چارت.
 */
export const CHART_RULES = {};

/**
 * زمان خروج و فروش، تست‌شده به صورت مستقل.
 */
export const EXITS_TESTED = {
  runs: ['2026-10-22', '2026-10-23'], cost: 0.15,
  sellOnWeakOff: {
    '15m': [{ better: 3, gain: 11.31, ddDiff: -4.88 }, { better: 2, gain: 3.63, ddDiff: -4.01 }],
    '1h': [{ better: 3, gain: 17.28, ddDiff: -6.12 }, { better: 0, gain: -10.38, ddDiff: -1.27 }],
    '4h': [{ better: 2, gain: 9.13, ddDiff: -2.21 }, { better: 2, gain: 3.88, ddDiff: -7.61 }],
    '1d': [{ better: 2, gain: 3.72, ddDiff: -1.46 }, { better: 1, gain: 0.91, ddDiff: 0 }],
  },
  exits: {
    '15m': { stop: [155, -1.23, 0], weak: [127, -0.52, 11], target: [46, 2.82, 100] },
    '1h': { stop: [138, -1.1, 0], weak: [107, -0.45, 10.3], target: [66, 2.9, 100] },
    '4h': { stop: [129, -1.05, 0], weak: [105, -0.49, 7.6], target: [60, 2.95, 100] },
    '1d': { stop: [61, -1.02, 0], weak: [62, -0.43, 6.5], target: [46, 2.97, 100] },
  },
};
export const CHART_EXITS = { '15m': { signalExitBars: null }, '4h': { signalExitBars: null } };

/**
 * نتایج آن تست (اجرای تاریخ 2026-10-24 روی تمام ۱۰۶ رمزارز).
 */
export const CHART_TESTED = {
  measuredOn: '2026-10-24', coins: 106, configs: 432, blocks: 3,
  '15m': {coins: 106, range: [-7.83, -0.99], up: 0, from: '2026-09-23', to: '2026-10-24', block: '10 روز', better: 1, cleared: false, adopt: false, hold: -2.22, holdDrop: 9.63, fillCost: 1.38, previous: { ret: -10.64, better: 3, cleared: true, measuredOn: '2026-10-23' }, standard: {ret: -3.87, dd: 13.33, ddClosed: 11.66, trades: 206, win: 19.9, fees: 2.63}, own: {ret: -10.61, dd: 17.42, ddClosed: 15.34, trades: 379, win: 22.16, fees: 4.7},
    byRisk: { '1': {ret: -6.01, lo: -8.36, hi: -2.65, dd: 13.67, up: 0, trades: 69}, '2': {ret: -3.98, lo: -8.94, hi: 0.57, dd: 13.86, up: 1, trades: 68}, '3': {ret: -5.76, lo: -12.36, hi: 0.51, dd: 16.11, up: 1, trades: 71}, '5': {ret: -6.28, lo: -12.36, hi: 0.36, dd: 16.49, up: 1, trades: 71}, '0.5': {ret: -5.81, lo: -10.06, hi: -2.98, dd: 9.99, up: 0, trades: 69}, '1.5': {ret: -3.87, lo: -7.83, hi: -0.99, dd: 13.33, up: 0, trades: 69}},
    signals: {n: 2042, winPct: 18.46, avgR: -0.4, avgWinR: 2.87, avgLossR: -1.14, holdMedian: 30, avgPct: -0.54, randPct: 0.21, H: 8, fwdN: 2041, fwdUpPct: 42.87, fwdLo: 40.74, fwdHi: 45.03, baseUpPct: 47.06}},
  '1h': {coins: 103, range: [-10.11, 11.29], up: 1, from: '2026-06-21', to: '2026-10-24', block: '6 هفته', better: 1, cleared: false, adopt: false, hold: 14.86, holdDrop: 12.89, fillCost: 2.21, previous: { ret: -0.22, better: 1, cleared: false, measuredOn: '2026-10-23' }, standard: {ret: -2.72, dd: 23.1, ddClosed: 21.76, trades: 335, win: 23.58, fees: 4.67}, own: {ret: -5.28, dd: 20.55, ddClosed: 17.96, trades: 251, win: 25.1, fees: 3.2},
    byRisk: { '1': {ret: 0.1, lo: -8.75, hi: 14.86, dd: 20.08, up: 1, trades: 110}, '2': {ret: -4.39, lo: -14.86, hi: 14.92, dd: 25.09, up: 1, trades: 112}, '3': {ret: -2.34, lo: -12.93, hi: 12.63, dd: 24.21, up: 1, trades: 109}, '5': {ret: -2.27, lo: -13.27, hi: 9.17, dd: 25.82, up: 1, trades: 109}, '0.5': {ret: -0.7, lo: -7.33, hi: 10.01, dd: 12.91, up: 1, trades: 109}, '1.5': {ret: -2.72, lo: -10.11, hi: 11.29, dd: 23.1, up: 1, trades: 112}},
    signals: {n: 3098, winPct: 24.79, avgR: 0.03, avgWinR: 2.43, avgLossR: -0.76, holdMedian: 23, avgPct: 0.57, randPct: 1.17, H: 12, fwdN: 3098, fwdUpPct: 45.93, fwdLo: 44.18, fwdHi: 47.69, baseUpPct: 48.29}},
  '4h': {coins: 99, range: [-14.17, 32.39], up: 1, from: '2025-08-13', to: '2026-10-24', block: '5 ماه', better: 2, cleared: false, adopt: false, hold: 27.15, holdDrop: 41.42, fillCost: 0.97, previous: { ret: 4.23, better: 2, cleared: false, measuredOn: '2026-10-23' }, standard: {ret: 2.93, dd: 21.24, ddClosed: 21.23, trades: 175, win: 26.29, fees: 1.69}, own: {ret: -8.37, dd: 38.51, ddClosed: 37.29, trades: 692, win: 26.44, fees: 7.91},
    byRisk: { '1': {ret: 2.7, lo: -10.39, hi: 23.76, dd: 15.65, up: 1, trades: 58}, '2': {ret: 0.73, lo: -19.9, hi: 40.73, dd: 25.01, up: 1, trades: 60}, '3': {ret: -1.18, lo: -24.45, hi: 39.91, dd: 29.69, up: 1, trades: 60}, '5': {ret: 3.91, lo: -21.71, hi: 44.59, dd: 34.1, up: 1, trades: 59}, '0.5': {ret: 1.4, lo: -4.79, hi: 11.97, dd: 8.45, up: 1, trades: 58}, '1.5': {ret: 2.93, lo: -14.17, hi: 32.39, dd: 21.24, up: 1, trades: 58}},
    signals: {n: 1412, winPct: 23.94, avgR: -0.07, avgWinR: 2.97, avgLossR: -1.03, holdMedian: 32, avgPct: 0.17, randPct: 2.28, H: 6, fwdN: 1412, fwdUpPct: 46.25, fwdLo: 43.66, fwdHi: 48.85, baseUpPct: 46.63}},
  '1d': {coins: 50, range: [-10.4, 45.68], up: 2, from: '2022-04-19', to: '2026-10-24', block: '18 ماه', better: 2, cleared: true, adopt: false, hold: 35.7, holdDrop: 58.84, fillCost: 0.72, previous: { ret: 29.18, better: 1, cleared: false, measuredOn: '2026-10-23' }, standard: {ret: 20.31, dd: 19.59, ddClosed: 17.84, trades: 172, win: 26.74, fees: 1.21}, own: {ret: 84.59, dd: 29.67, ddClosed: 22.1, trades: 217, win: 32.72, fees: 3.41},
    byRisk: { '1': {ret: 13.39, lo: -6.79, hi: 30.48, dd: 13.72, up: 2, trades: 57}, '2': {ret: 26.63, lo: -14.16, hi: 59.56, dd: 24.82, up: 2, trades: 57}, '3': {ret: 29.21, lo: -20.27, hi: 61.8, dd: 34.34, up: 2, trades: 57}, '5': {ret: 46.45, lo: -31.45, hi: 126.2, dd: 42.36, up: 2, trades: 55}, '0.5': {ret: 6.71, lo: -3.32, hi: 15.16, dd: 7.17, up: 2, trades: 57}, '1.5': {ret: 20.31, lo: -10.4, hi: 45.68, dd: 19.59, up: 2, trades: 57}},
    signals: {n: 654, winPct: 26.15, avgR: 0.17, avgWinR: 2.76, avgLossR: -0.75, holdMedian: 21, avgPct: 2.74, randPct: 7.17, H: 7, fwdN: 653, fwdUpPct: 49, fwdLo: 45.19, fwdHi: 52.83, baseUpPct: 46.1}},
};

/**
 * نحوه خرید و فروش مجموعه قوانین به زبان ساده.
 */
export function rulesInWords(c) {
  const extra = `${c.momentumConfirm ? ' در حالی که روند کوتاه‌مدت و مومنتوم نیز صعودی هستند' : ''}${c.marketFilter ? '، و فقط در زمانی که خود بیت‌کوین در روند صعودی قرار دارد' : ''}`;
  const buy = c.entryMode === 'pullback' ? `وقتی رمزارزی در روند صعودی اصلاح می‌کند تا RSI به ${PULLBACK_RSI} یا کمتر برسد، آن را خریداری می‌کند${extra}.`
    : c.entryMode === 'breakout' ? `وقتی قیمت رمزارز بالاتر از بالاترین قیمت ۲۰ کندل گذشته بسته شود${c.trendFilter ? ' و در یک روند صعودی باشد' : ''}، خرید انجام می‌شود${extra}.`
      : `وقتی امتیاز به بالای +${c.entryScore} برسد${c.trendFilter ? ' و در روند صعودی باشد' : ''}، خرید انجام می‌دهد${extra}.`;
  return `${buy} خروج از معامله در قیمت ${c.trailAtr ? `حد ضرری که ${c.trailAtr} ATR پایین‌تر از بالاترین قیمت ثبت‌شده از زمان خرید حرکت می‌کند` : `هدف مشخص (${c.rMultiple}R)`}، حد ضرر (${c.atrStop} ATR پایین‌تر از نقطه ورود)${c.signalExitBars ? ` یا ${c.entryMode === 'pullback' ? 'پس از شکل‌گیری بازگشت قیمت' : `پس از ${c.signalExitBars} کندل معکوس‌شدن سیگنال`}` : ''} انجام می‌شود.${c.volScale ? ' هنگامی که نوسان رمزارز بیشتر از حالت عادی است، حجم کمتری خریداری می‌کند (تا نصف).' : ''}`;
}

export function rulesForChart(cfg, interval, lessons = []) {
  if (cfg.strategy === 'custom') return { ...cfg, ...pickRules({ ...CUSTOM_DEFAULT, ...(cfg.custom || {}) }), interval };
  const standard = Object.fromEntries([...RULE_KEYS, 'marketFilter'].map((k) => [k, DEFAULT_CONFIG[k]]));
  const trend = [...(lessons || [])].reverse().find((h) => h.lens === 'trend');
  return { ...cfg, ...standard, ...(CHART_EXITS[interval] || {}), ...(CHART_RULES[interval] || {}), ...(trend ? { trendFilter: !trend.undo } : {}), volScale: VOL_SCALE.charts.includes(interval), interval };
}

/**
 * مقیاس‌گذاری حجم پوزیشن بر اساس نوسان (Volatility-scaled).
 */
export const VOL_SCALE = {
  measuredOn: '2026-10-24', charts: [],
  tested: {
    '15m': { better: 0, ret: -3.24, dd: 0.78, objective: -3.78, previous: { better: 2, ret: -0.1, dd: -2.44, objective: 1.08 } },
    '1h': { better: 3, ret: 1.76, dd: -1.79, objective: 2.35, previous: { better: 0, ret: -4.34, dd: 0.7, objective: -4.43 } },
    '4h': { better: 2, ret: -2.57, dd: -2.38, objective: -1.01, previous: { better: 2, ret: -0.71, dd: -2.2, objective: 0.77 } },
    '1d': { better: 3, ret: 1.57, dd: -3.27, objective: 2.97, previous: { better: 2, ret: -0.64, dd: -2.76, objective: 0.54 } },
  },
};

/**
 * انتظارات عملکرد تنظیمات مختلف بر اساس تست‌های گذشته.
 */
export function expectedYield(cfg) {
  const x = CHART_TESTED[cfg.interval];
  if (!x?.standard || cfg.strategy === 'custom') return null;
  const t = x.adopt ? x.own : x.standard;
  const risk = Math.min(5, Math.max(0.5, Number(cfg.riskPct) || DEFAULT_CONFIG.riskPct));
  const levels = Object.keys(x.byRisk || {}).map(Number).sort((a, b) => a - b);
  let at = { ret: t.ret, lo: x.range[0], hi: x.range[1], dd: t.dd, up: x.up, trades: Math.round(t.trades / CHART_TESTED.blocks) };
  if (levels.length) {
    const hiL = levels.find((l) => l >= risk) ?? levels[levels.length - 1];
    const loL = [...levels].reverse().find((l) => l <= risk) ?? levels[0];
    const a = x.byRisk[loL], b = x.byRisk[hiL], w = hiL === loL ? 0 : (risk - loL) / (hiL - loL);
    const mix = (k) => +(a[k] + (b[k] - a[k]) * w).toFixed(2);
    at = { ret: mix('ret'), lo: mix('lo'), hi: mix('hi'), dd: mix('dd'), up: Math.min(a.up, b.up), trades: Math.round(mix('trades')) };
  }
  return {
    chart: cfg.interval, block: x.block, periods: CHART_TESTED.blocks, hold: x.hold, holdDrop: x.holdDrop ?? null, fillCost: x.fillCost ?? null, risk, measured: levels.length > 0,
    levels: levels.map((l) => ({ risk: l, ...x.byRisk[l] })), coins: x.coins ?? CHART_TESTED.coins,
    ...at, capsDiffer: (cfg.maxPositionPct ?? 25) !== 25 || (cfg.maxPositions ?? 5) !== 5,
  };
}

/**
 * میانگین عایدی هر چارت در بازه‌های زمانی مختلف پس از کسر کارمزدهای واقعی.
 */
export function earningsByChart(cfg) {
  const rows = [];
  for (const [chart, x] of Object.entries(CHART_TESTED)) {
    if (!x?.standard) continue;
    const y = expectedYield({ ...cfg, interval: chart, strategy: 'tested' });
    if (!y) continue;
    const days = (Date.parse(x.to) - Date.parse(x.from)) / 864e5 / (CHART_TESTED.blocks || 3);
    if (!(days > 0)) continue;
    const fill = x.fillCost ?? 0;
    const per = (v) => ({ hour: v / days / 24, day: v / days, week: (v / days) * 7, month: (v / days) * 30 });
    const net = y.ret - fill;
    rows.push({
      chart, rules: x.adopt ? 'انتخاب خودش' : 'قوانین استاندارد', risk: y.risk, block: x.block, days: +days.toFixed(1), periods: y.periods,
      net: +net.toFixed(2), worst: +(y.lo - fill).toFixed(2), best: +(y.hi - fill).toFixed(2), fillCost: fill, dd: y.dd,
      per: per(net), worstPer: per(y.lo - fill), hold: x.hold, holdPer: per(x.hold),
      tradesPerMonth: Math.round((y.trades / days) * 30), coins: y.coins, from: x.from, to: x.to,
    });
  }
  return rows;
}

export const CUSTOM_DEFAULT = { entryMode: 'trend', momentumConfirm: false, trendFilter: true, marketFilter: false, atrStop: 3, rMultiple: 3, trailAtr: null, signalExitBars: 2 };
const pickRules = (r) => Object.fromEntries(['entryMode', 'momentumConfirm', 'trendFilter', 'marketFilter', 'atrStop', 'rMultiple', 'trailAtr', 'signalExitBars'].filter((k) => k in r).map((k) => [k, r[k]]));

/**
 * بازپخش تنظیمات روی کندل‌های اخیر.
 */
export function backtestSettings(cfg, candlesBySymbol) {
  const series = Object.entries(candlesBySymbol).filter(([, c]) => Array.isArray(c) && c.length > 220);
  const state = newState(cfg);
  replayAll(state, cfg, Object.fromEntries(series));
  const last = Object.fromEntries(series.map(([sym, c]) => [sym, c[c.length - 1].c]));
  const st = stats(state, last);
  const exitFees = Object.values(state.open).reduce((a, p) => a + (last[p.symbol] ?? p.entry) * p.qty * (cfg.feePct / 100), 0);
  const holds = series.map(([, c]) => c[c.length - 1].c / c[210].c - 1);
  return {
    coins: series.length,
    from: series.length ? Math.min(...series.map(([, c]) => c[210].t)) : null,
    to: series.length ? Math.max(...series.map(([, c]) => c[c.length - 1].t)) : null,
    ret: round(((st.equity - exitFees) / cfg.startingBalance - 1) * 100, 2),
    hold: holds.length ? round((holds.reduce((a, b) => a + b, 0) / holds.length) * 100, 2) : null,
    dd: st.maxDrawdownPct, trades: st.trades, winRate: st.winRate, fees: st.feesPaid, open: st.openCount,
  };
}

/** حداقل مبلغ سفارش خرید (۵ تتر بایننس و کارمزدهای مربوطه). */
export const MIN_ORDER = 10;

export const TRADER_CHARTS = ['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];
export const MAX_COINS = 100;
export const TESTED_COINS = [
  'BTC', 'ETH', 'BNB', 'XRP', 'SOL', 'TRX', 'ZEC', 'HYPE', 'DOGE', 'XMR', 'LINK', 'ADA', 'LEO',
  'NEAR', 'XLM', 'RAIN', 'BCH', 'UNI', 'LTC', 'AVAX', 'CC', 'SUI', 'GRAM', 'HBAR', 'TAO', 'QNT',
  'SHIB', 'BTW', 'CRO', 'ENA', 'OKB', 'AAVE', 'ONDO', 'PUMP', 'ASTER', 'M', 'DOT', 'WLD', 'WLFI',
  'MNT', 'PEPE', 'ICP', 'MORPHO', 'SKY', 'HTX', 'ETC', 'ARB', 'VVV', 'JST', 'GT', 'JUP', 'ALGO',
  'POL', 'RENDER', 'KAS', 'ATOM', 'PI', 'AERO', 'FIL', 'NEXO', 'ZRO', 'LIT', 'STX', 'INJ',
  'STABLE', 'APT', 'CAKE', 'NIGHT', 'PYTH', 'XDC', 'AKE', 'BDX', 'STRK', 'DASH', 'ETHFI', 'VET',
  'FLR', 'TIA', 'CRV', 'TRUMP', 'RAY', '币安人生', 'PENGU', 'FET', 'GRASS', 'VIRTUAL', 'SEI', 'DRV',
  'XPL', 'FF', 'BSV', 'PENDLE', 'BTT', 'XTZ', 'SPX', 'LDO', 'PIEVERSE', 'SUN', 'OP', 'GNO', 'KITE',
  'CFX', 'UB', 'KAIA', 'CARDS', 'SAND',
];

/**
 * بهترین چارت تست‌شده بر اساس سودآوری ماهانه پس از کسر کارمزدها.
 */
export function bestTestedChart() {
  const rows = Object.entries(CHART_TESTED).filter(([, x]) => x && typeof x === 'object' && x.standard).map(([iv, x]) => {
    const r = x.adopt ? x.own : x.standard;
    const days = (Date.parse(x.to) - Date.parse(x.from)) / 864e5 / (CHART_TESTED.blocks || 3);
    const net = +(r.ret - (x.fillCost ?? 0)).toFixed(2);
    const month = days > 0 ? +((net / days) * 30).toFixed(2) : null;
    const worstNet = +((x.range?.[0] ?? r.ret) - (x.fillCost ?? 0)).toFixed(2);
    return { iv, up: x.up ?? 0, net, month, worstNet, fillCost: x.fillCost ?? 0, edge: r.ret - x.hold, dd: r.dd, ret: r.ret, hold: x.hold, block: x.block };
  });
  rows.sort((a, b) => (b.month ?? -Infinity) - (a.month ?? -Infinity) || a.dd - b.dd);
  return rows[0];
}

/**
 * هشدارهای ساده درباره تنظیمات معامله‌گر پیش از استفاده.
 */
export function settingsWarnings(cfg) {
  const out = [];
  const tested = CHART_TESTED[cfg.interval];
  if (!tested) out.push(`چارت ${cfg.interval} با این قوانین هرگز تست نشده است، بنابراین هیچ نتیجه اندازه‌گیری‌شده‌ای برای آن وجود ندارد. چارت‌های تست‌شده عبارتند از: ${Object.keys(CHART_TESTED).filter((k) => CHART_TESTED[k]?.standard).join(', ')}.`);
  const lost = tested && cfg.strategy !== 'custom' ? earningsByChart(cfg).find((r) => r.chart === cfg.interval && r.net < 0) : null;
  if (lost) {
    const top = bestTestedChart();
    out.push(`روی چارت ${cfg.interval} قوانین تست‌شده پس از کسر هزینه‌های واقعی (اسپرد و لغزش قیمت، ${lost.fillCost} امتیاز در هر دوره)، میانگین ${Math.abs(lost.net)}% در هر دوره (${lost.block}) ضرر داده‌اند. ${top ? `چارت ${top.iv} بیشترین سود را در میان چارت‌های تست‌شده داشته است: حدود +${top.month}% در ماه پس از کسر آن هزینه.` : ''}`);
  }
  if (cfg.strategy === 'custom') out.push('قوانین شخصی شما هیچ تست منتشرشده‌ای ندارند. از «تست این تنظیمات» استفاده کنید تا قبل از اعتماد به آن‌ها، عملکردشان را روی کندل‌های اخیر ببینید.');
  if (cfg.riskPct > 2) out.push(`ریسک ${cfg.riskPct}% در هر معامله به این معناست که ۱۰ معامله زیان‌ده پشت سر هم (که رخ می‌دهد) حدود ${Math.round((1 - (1 - cfg.riskPct / 100) ** 10) * 100)}% از حساب را از بین می‌برد.`);
  if ((cfg.maxPositionPct ?? 25) > 25) out.push(`حداکثر ${cfg.maxPositionPct}% در یک رمزارز؛ تست‌ها ۲۵٪ را مجاز می‌دانستند. رمزارزی که نوسان کمی دارد حد ضرر نزدیکی می‌گیرد، بنابراین تنظیم ریسک می‌تواند تا ${cfg.maxPositionPct}% از حساب را در آن درگیر کند.${cfg.maxPositionPct > 50 ? ' در این حالت یک معامله می‌تواند تمام پول نقد را ببرد، بنابراین هوش مصنوعی هم‌زمان یک رمزارز را نگه داشته و سیگنال‌های خرید بقیه را رد می‌کند.' : ''}`);
  const untested = (cfg.universe || []).filter((sym) => !TESTED_COINS.includes(sym));
  if (untested.length) out.push(`${untested.length} مورد از ${(cfg.universe || []).length} رمزارز شما جزو تست‌ها نبوده‌اند (${TESTED_COINS.length} رمزارز برتر)، بنابراین نتایج اندازه‌گیری‌شده اطلاعاتی درباره آن‌ها ارائه نمی‌دهند${untested.length <= 8 ? `: ${untested.join(', ')}` : ''}.`);
  const funded = Math.floor(100 / (cfg.maxPositionPct ?? 25));
  if (cfg.maxPositions > funded + 1) out.push(`حداکثر ${cfg.maxPositions} معامله باز مجاز است، اما با اختصاص ${cfg.maxPositionPct ?? 25}% به هر رمزارز، وجه نقد تنها از حدود ${funded} معامله هم‌زمان پشتیبانی می‌کند. تست‌ها حداکثر ۵ پوزیشن باز را مجاز می‌دانستند.`);
  if (cfg.maxPositions * (cfg.maxPositionPct ?? 25) < 50) out.push(`با حداکثر ${cfg.maxPositions} معامله باز و ${cfg.maxPositionPct ?? 25}% سهم در هر رمزارز، هیچ‌گاه بیش از ${cfg.maxPositions * (cfg.maxPositionPct ?? 25)}% از حساب سرمایه‌گذاری نمی‌شود.`);
  if ((cfg.universe || []).length < 3) out.push('با کمتر از سه رمزارز، معامله‌گر اغلب کار خاصی برای انجام دادن نخواهد داشت.');
  if ((cfg.feePct ?? 0.1) > 0.25) out.push(`کارمزد ${cfg.feePct}% در هر سمت زیاد است: در چارت‌های کوتاه‌مدت کارمزدها می‌توانند بیشتر سود را ببلعند.`);
  return out;
}

/**
 * قوانین اختصاصی هر رمزارز برای تایم‌فریم روزانه.
 */
export const PER_COIN_RULES = {
  interval: '1d', measuredOn: '2026-10-15', coins: 73,
  tested: { from: '2023-10-12', to: '2026-10-15', standard: { ret: 155.41, dd: 34.54, ddClosed: 32.44, trades: 266, winRate: 32.7 }, own: { ret: 265.03, dd: 34.13, ddClosed: 34.11, trades: 222, winRate: 32.9 }, hold: 97.31, holdDrop: 64.91, walkForward: { periods: 3, better: 1, own: 2.72, shared: 6.3, coins: 49 }, previousRun: { coins: 24, own: 89.77, standard: 33.31 } },
  rules: {
    BTC: { entryMode: 'breakout', momentumConfirm: true, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: 2 },
    ETH: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    BNB: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: null },
    XRP: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    SOL: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    TRX: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: null },
    ZEC: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    DOGE: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    XMR: { entryMode: 'trend', momentumConfirm: true, trendFilter: false, atrStop: 3, rMultiple: 3, trailAtr: null, signalExitBars: null },
    LINK: { entryMode: 'trend', momentumConfirm: true, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: 2 },
    ADA: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    LEO: { entryMode: 'trend', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: null },
    NEAR: { entryMode: 'trend', momentumConfirm: true, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    XLM: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    BCH: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: null, signalExitBars: null },
    UNI: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    LTC: { entryMode: 'trend', momentumConfirm: true, trendFilter: false, atrStop: 3, rMultiple: 3, trailAtr: null, signalExitBars: null },
    AVAX: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    SUI: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    HBAR: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    TAO: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 3, rMultiple: 3, trailAtr: null, signalExitBars: null },
    QNT: { entryMode: 'breakout', momentumConfirm: true, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 3, signalExitBars: 2 },
    SHIB: { entryMode: 'breakout', momentumConfirm: false, trendFilter: true, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    CRO: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    ENA: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    OKB: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    AAVE: { entryMode: 'breakout', momentumConfirm: true, trendFilter: false, atrStop: 3, rMultiple: 3, trailAtr: null, signalExitBars: 2 },
    DOT: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    WLD: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 3, rMultiple: 3, trailAtr: null, signalExitBars: null },
    MNT: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    PEPE: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    ICP: { entryMode: 'trend', momentumConfirm: false, trendFilter: true, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    HTX: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 3, signalExitBars: null },
    ETC: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 3, signalExitBars: null },
    ARB: { entryMode: 'breakout', momentumConfirm: true, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: null },
    JST: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: null, signalExitBars: 2 },
    GT: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    JUP: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: null },
    ALGO: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 3, signalExitBars: 2 },
    POL: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 3, rMultiple: 3, trailAtr: 3, signalExitBars: null },
    RENDER: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: null, signalExitBars: null },
    KAS: { entryMode: 'breakout', momentumConfirm: false, trendFilter: true, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    ATOM: { entryMode: 'trend', momentumConfirm: true, trendFilter: true, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    FIL: { entryMode: 'breakout', momentumConfirm: true, trendFilter: false, atrStop: 3, rMultiple: 2, trailAtr: null, signalExitBars: 2 },
    NEXO: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 3, signalExitBars: 2 },
    ZRO: { entryMode: 'breakout', momentumConfirm: true, trendFilter: false, atrStop: 1.5, rMultiple: 2, trailAtr: null, signalExitBars: 2 },
    STX: { entryMode: 'trend', momentumConfirm: true, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: null },
    INJ: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    APT: { entryMode: 'trend', momentumConfirm: true, trendFilter: true, atrStop: 1.5, rMultiple: 3, trailAtr: null, signalExitBars: 2 },
    CAKE: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 2, trailAtr: null, signalExitBars: null },
    PYTH: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    XDC: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 3, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    BDX: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: null, signalExitBars: null },
    STRK: { entryMode: 'trend', momentumConfirm: true, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 3, signalExitBars: 2 },
    DASH: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: null, signalExitBars: 2 },
    ETHFI: { entryMode: 'trend', momentumConfirm: true, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: 2 },
    VET: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    FLR: { entryMode: 'breakout', momentumConfirm: true, trendFilter: false, atrStop: 1.5, rMultiple: 2, trailAtr: null, signalExitBars: 2 },
    TIA: { entryMode: 'trend', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 2, trailAtr: null, signalExitBars: 2 },
    CRV: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: 3, signalExitBars: null },
    RAY: { entryMode: 'trend', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    FET: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 3, signalExitBars: 2 },
    SEI: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: null, signalExitBars: null },
    BSV: { entryMode: 'breakout', momentumConfirm: true, trendFilter: true, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: 2 },
    PENDLE: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: null },
    BTT: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 3, trailAtr: null, signalExitBars: 2 },
    XTZ: { entryMode: 'breakout', momentumConfirm: true, trendFilter: false, atrStop: 3, rMultiple: 3, trailAtr: null, signalExitBars: null },
    LDO: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 2, rMultiple: 2, trailAtr: null, signalExitBars: null },
    SUN: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    OP: { entryMode: 'trend', momentumConfirm: true, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 3, signalExitBars: 2 },
    GNO: { entryMode: 'breakout', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 4, signalExitBars: 2 },
    CFX: { entryMode: 'trend', momentumConfirm: true, trendFilter: false, atrStop: 3, rMultiple: 3, trailAtr: 4, signalExitBars: null },
    SAND: { entryMode: 'trend', momentumConfirm: false, trendFilter: false, atrStop: 1.5, rMultiple: 3, trailAtr: 3, signalExitBars: 2 },
  },
};

export const DEFAULT_CONFIG = {
  startingBalance: 10000,
  riskPct: 1.5,
  maxPositions: 5,
  maxPositionPct: 25,
  entryScore: THRESHOLDS.normal,
  exitScore: -THRESHOLDS.normal,
  atrStop: 3,
  rMultiple: 3,
  feePct: 0.1,
  breakEvenAtR: null,
  volScale: false,
  signalExitBars: 2,
  trendFilter: true,
  trailAtr: null,
  minAdx: null,
  maxEntryRsi: null,
  excluded: [],
  entryMode: 'trend',
  perCoin: null,
  momentumConfirm: false,
  marketFilter: false,
  interval: bestTestedChart()?.iv || '1d',
  universe: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'LINK'],
};

export function newState(cfg = DEFAULT_CONFIG, { liveFrom = null } = {}) {
  return {
    version: 1,
    interval: cfg.interval,
    startedAt: Date.now(),
    liveFrom,
    firstBarAt: null,
    log: [],
    balance: cfg.startingBalance,
    startingBalance: cfg.startingBalance,
    open: {},
    closed: [],
    cursor: {},
    equityCurve: [],
  };
}

const round = (v, dp = 6) => (Number.isFinite(v) ? +v.toFixed(dp) : v);
const px = (v) => (Number.isFinite(v) ? +v.toPrecision(10) : v);

/**
 * تغییر مقیاس حساب کاربری بر اساس موجودی اولیه جدید.
 */
export function rescaleAccount(state, startingBalance) {
  const k = startingBalance / state.startingBalance;
  if (!(k > 0) || !Number.isFinite(k) || k === 1) return state;
  const by = (v, dp) => (Number.isFinite(v) ? round(v * k, dp) : v);
  const pos = (p) => ({
    ...p, qty: by(p.qty, 10), notional: by(p.notional, 2), riskCash: by(p.riskCash, 2), feePaid: by(p.feePaid, 4),
    ...('pnl' in p ? { pnl: by(p.pnl, 2) } : {}),
  });
  return {
    ...state,
    startingBalance,
    balance: state.balance * k,
    open: Object.fromEntries(Object.entries(state.open || {}).map(([sym, p]) => [sym, pos(p)])),
    closed: (state.closed || []).map(pos),
    equityCurve: (state.equityCurve || []).map((e) => ({ ...e, equity: by(e.equity, 2) })),
  };
}

/**
 * بازپخش کندل‌های یک رمزارز از نقطه توقف قبلی.
 */
export function replaySymbol(state, cfg, symbol, candles, pre = null) {
  if (!candles || candles.length < 220) return { processed: 0 };
  const s = { symbol, candles, ind: pre?.ind || computeAll(candles), atr: pre?.atr || atr(candles, 14), scores: pre?.scores || null, regime: pre?.regime || null };
  const out = { processed: 0, lastScore: null };
  const rules = rulesFor(cfg, symbol);
  for (let i = 210; i < candles.length; i++) advance(state, rules, s, i, out);
  return out;
}

/**
 * بازپخش هم‌زمان چند رمزارز به صورت گام‌به‌گام و به ترتیب زمان.
 */
export function replayAll(state, cfg, candlesBySymbol, { regimeCandles = null } = {}) {
  const series = [];
  const result = {};
  const regime = cfg.marketFilter ? marketRegime(regimeCandles || candlesBySymbol.BTC) : null;
  for (const [symbol, candles] of Object.entries(candlesBySymbol)) {
    result[symbol] = { processed: 0, lastScore: null };
    if (!candles || candles.length < 220) continue;
    series.push({ symbol, candles, ind: computeAll(candles), atr: atr(candles, 14), scores: null, regime });
  }
  return replaySeries(state, cfg, series, { result });
}

export function replaySeries(state, cfg, series, { from = 210, result = {}, onBar = null } = {}) {
  state.cursor ||= {};
  const pos = series.map(() => from);
  const rules = series.map((s) => rulesFor(cfg, s.symbol));
  for (const s of series) result[s.symbol] ||= { processed: 0, lastScore: null };
  for (;;) {
    let k = -1;
    for (let j = 0; j < series.length; j++) {
      if (pos[j] < series[j].candles.length && (k < 0 || series[j].candles[pos[j]].t < series[k].candles[pos[k]].t)) k = j;
    }
    if (k < 0) break;
    if (onBar) onBar(series[k].candles[pos[k]], series[k].symbol);
    advance(state, rules[k], series[k], pos[k]++, result[series[k].symbol]);
  }
  return result;
}

export const RULE_KEYS = ['entryMode', 'momentumConfirm', 'trendFilter', 'atrStop', 'rMultiple', 'trailAtr', 'signalExitBars'];

export function rulesFor(cfg, symbol) {
  const own = cfg.perCoin?.[symbol];
  if (!own) return cfg;
  return { ...cfg, ...Object.fromEntries(RULE_KEYS.filter((k) => k in own).map((k) => [k, own[k]])) };
}

function advance(state, cfg, s, i, out) {
  const c = s.candles[i];
  const from = state.cursor[s.symbol] ?? 0;
  if (c.t <= from) return;
  state.cursor[s.symbol] = c.t;
  if (state.liveFrom && c.t < state.liveFrom) return;
  out.processed++;
  if (!state.firstBarAt || c.t < state.firstBarAt) state.firstBarAt = c.t;
  const score = s.scores ? s.scores[i] : scoreAt(s.candles, s.ind, i).score;
  out.lastScore = score;
  const passed = stepBar(state, cfg, s, i, score);
  if (passed) { out.passed = (out.passed || 0) + 1; out.passedWhy = passed; }
}

/**
 * زمان کندل → بررسی اینکه آیا بیت‌کوین در زمان بسته شدن آن کندل صعودی بوده است یا خیر.
 */
export function marketRegime(btcCandles) {
  const map = new Map();
  if (!btcCandles || btcCandles.length < 210) return map;
  const closes = btcCandles.map((c) => c.c);
  const e50 = ema(closes, 50), e200 = ema(closes, 200);
  btcCandles.forEach((c, i) => { if (e200[i] !== null && e50[i] !== null) map.set(c.t, c.c > e200[i] && e50[i] > e200[i]); });
  return map;
}

/** وجه نقد آزاد که درگیر پوزیشنی نیست. */
export function freeCash(state) {
  const tied = Object.values(state.open).reduce((sum, p) => sum + (p.real ? 0 : (p.notional || 0)), 0);
  return state.balance - tied;
}

export const PULLBACK_RSI = 40;
function wantsEntry(cfg, score, ind, i, c) {
  if (cfg.entryMode === 'pullback') return Number.isFinite(ind.rsi[i]) && ind.rsi[i] <= PULLBACK_RSI;
  if (cfg.entryMode === 'breakout') return ind.donchian.upper[i - 1] !== null && c.c > ind.donchian.upper[i - 1];
  return score >= cfg.entryScore;
}
const wantsExit = (cfg, score) => (cfg.entryMode === 'pullback' ? score >= -cfg.exitScore : score <= cfg.exitScore);

/**
 * دلیل عدم خرید یک رمزارز در کندل i، یا بازگشت مقدار null در صورت تمایل به خرید.
 */
export function entryBlocker(cfg, s, i, score) {
  const { ind } = s, c = s.candles[i];
  if (!wantsEntry(cfg, score, ind, i, c)) return 'signal';
  if ((cfg.trendFilter || cfg.entryMode === 'pullback') && !(ind.ema200[i] && c.c > ind.ema200[i] && ind.ema50[i] > ind.ema200[i])) return 'trend';
  if (cfg.momentumConfirm && !(c.c > ind.ema20[i] && ind.ema20[i] > ind.ema50[i] && ind.macd.hist[i] > 0)) return 'momentum';
  if (s.regime && s.regime.get(c.t) === false) return 'market';
  if (cfg.minAdx && !(ind.adx.adx[i] >= cfg.minAdx)) return 'adx';
  if (cfg.maxEntryRsi && ind.rsi[i] !== null && ind.rsi[i] > cfg.maxEntryRsi) return 'rsi';
  if (cfg.excluded?.includes(s.symbol)) return 'excluded';
  return null;
}

/** متن مربوط به کدهای ممانعت‌کننده از خرید. */
export function blockerText(code, cfg, score, { rsi = null } = {}) {
  return {
    signal: cfg.entryMode === 'breakout' ? 'قیمت بالاتر از بالاترین قیمت ۲۰ کندل گذشته بسته نشده است'
      : cfg.entryMode === 'pullback' ? `اصلاح قیمتی وجود ندارد: RSI روی ${Number.isFinite(rsi) ? Math.round(rsi) : `بالای ${PULLBACK_RSI}`} است، قانون به ${PULLBACK_RSI} یا کمتر نیاز دارد`
        : `امتیاز برابر با ${score > 0 ? '+' : ''}${score} است، قانون به +${cfg.entryScore} یا بیشتر نیاز دارد`,
    trend: 'در روند صعودی قرار ندارد (قیمت و میانگین ۵۰ کندلی باید بالای میانگین ۲۰۰ کندلی باشند)',
    momentum: 'روند کوتاه‌مدت و مومنتوم هر دو صعودی نیستند',
    market: 'خود بیت‌کوین در روند نزولی است',
    adx: `روند ضعیف است (ADX کمتر از ${cfg.minAdx})`,
    rsi: `شاخص RSI بالاتر از ${cfg.maxEntryRsi} است`,
    excluded: 'سیستم خودارزیابی پس از چند معامله ناموفق، معامله این رمزارز را متوقف کرده است',
  }[code] || code;
}

/**
 * سیگنال هوش مصنوعی برای یک رمزارز روی یک چارت.
 */
export function aiSignal(candles, interval, symbol = 'COIN') {
  if (!Array.isArray(candles) || candles.length < 220) return null;
  const cfg = rulesFor({ ...rulesForChart({ ...DEFAULT_CONFIG, excluded: [], universe: [symbol], maxPositions: 1, maxPositionPct: 100 }, interval), perCoin: null }, symbol);
  const state = newState(cfg);
  const s = { symbol, candles, ind: computeAll(candles), atr: atr(candles, 14), scores: null, regime: null };
  const out = { processed: 0, lastScore: null };
  for (let i = 210; i < candles.length; i++) advance(state, cfg, s, i, out);
  const i = candles.length - 1, last = candles[i];
  const tested = CHART_TESTED[interval];
  const net = (t) => round(t.notional > 0 ? (t.pnl / t.notional) * 100 : t.pnlPct, 2);
  const done = state.closed.map((t) => ({ openedAt: t.openedAt, exitAt: t.exitAt, entry: t.entry, exit: t.exit, why: t.reason, netPct: net(t) }));
  const from = candles[Math.min(210, i)];
  const past = done.length ? {
    trades: done.length, wins: done.filter((t) => t.netPct > 0).length,
    avgPct: round(done.reduce((a, t) => a + t.netPct, 0) / done.length, 2),
    from: from.t, holdPct: round((last.c / from.c - 1) * 100, 2),
    recent: done.slice(-5).reverse(),
  } : { trades: 0, from: from.t, holdPct: round((last.c / from.c - 1) * 100, 2), recent: [] };
  const base = { interval, rules: cfg, tested: !!tested?.standard, record: tested?.signals || null, price: last.c, at: last.t, past };
  const pos = state.open[symbol];
  if (pos) {
    const k = candles.findIndex((c) => c.t === pos.openedAt);
    return { ...base, action: pos.openedAt === last.t ? 'buy' : 'hold', entry: pos.entry, stop: pos.stop, initialStop: pos.initialStop, target: pos.tp, openedAt: pos.openedAt, barsHeld: k < 0 ? null : i - k, openPct: round((last.c / pos.entry - 1) * 100, 2) };
  }
  const t = state.closed[state.closed.length - 1];
  if (t && t.exitAt === last.t) return { ...base, action: 'sell', entry: t.entry, exit: t.exit, why: t.reason, openedAt: t.openedAt, pnlPct: t.pnlPct, netPct: net(t), r: t.riskCash > 0 ? round(t.pnl / t.riskCash, 2) : null };
  const score = out.lastScore ?? scoreAt(candles, s.ind, i).score;
  const code = entryBlocker(cfg, s, i, score);
  return { ...base, action: 'wait', code, why: code ? blockerText(code, cfg, score, { rsi: s.ind.rsi[i] }) : 'قوانین ورودی برای این مورد پیدا نکردند', last: t ? { exitAt: t.exitAt, pnlPct: t.pnlPct, why: t.reason } : null };
}

/** نسبت نوسان کنونی یک رمزارز در مقایسه با حالت نرمال آن. */
export function volRatio(candles) {
  const n = candles.length, out = new Array(n).fill(null);
  const S1 = [0], S2 = [0];
  for (let i = 0; i < n; i++) { const r = i ? Math.log(candles[i].c / candles[i - 1].c) : 0; S1.push(S1[i] + r); S2.push(S2[i] + r * r); }
  const k = 2 / (500 + 1);
  let normal = null;
  for (let i = 100; i < n; i++) {
    const a = i - 99, m = 100, mu = (S1[i + 1] - S1[a]) / m;
    const sd = Math.sqrt(Math.max((S2[i + 1] - S2[a]) / m - mu * mu, 1e-12));
    normal = normal === null ? sd : normal + k * (sd - normal);
    if (i >= 200) out[i] = sd / normal;
  }
  return out;
}

export function aiSignalRow(candles, interval, symbol, { horizonBars, intervalMs }) {
  const a = aiSignal(candles, interval, symbol);
  if (!a || !(intervalMs > 0) || !(horizonBars > 0)) return null;
  const last = candles[candles.length - 1];
  const iso = (t) => new Date(t).toISOString();
  return {
    symbol, interval, candle_time: iso(last.t), price: last.c, action: a.action,
    entry: a.entry ?? null, stop: a.action === 'sell' ? null : a.stop ?? null, target: a.action === 'sell' ? null : a.target ?? null,
    opened_at: a.openedAt ? iso(a.openedAt) : null,
    exit_price: a.action === 'sell' ? a.exit : null, trade_pct: a.action === 'sell' ? a.netPct : null,
    horizon_bars: horizonBars, horizon_at: iso(last.t + intervalMs + horizonBars * intervalMs),
  };
}

function stepBar(state, cfg, s, i, score) {
  const { symbol, candles, ind } = s;
  const atrArr = s.atr;
  const c = candles[i];
  const pos = state.open[symbol];
  (state.px ||= {})[symbol] = c.c;

  if (pos) {
    if (c.l <= pos.stop) {
      const why = pos.stop > pos.initialStop ? (pos.movedToBreakEven && pos.stop === pos.entry ? 'حد سر‌به‌سر (Break-even)' : 'حد ضرر متحرک (Trailing stop)') : 'حد ضرر';
      closePosition(state, cfg, symbol, Math.min(pos.stop, c.o), c.t, why);
    } else if (pos.tp !== null && c.h >= pos.tp) {
      closePosition(state, cfg, symbol, pos.tp, c.t, 'حد سود (Target)');
    } else {
      if (cfg.trailAtr && atrArr[i]) {
        pos.high = Math.max(pos.high ?? pos.entry, c.h);
        const trail = pos.high - cfg.trailAtr * atrArr[i];
        if (trail > pos.stop) pos.stop = px(trail);
      }
      const r = pos.entry - pos.initialStop;
      const beR = cfg.breakEvenAtR;
      if (beR !== null && beR !== undefined && !pos.movedToBreakEven && r > 0 && c.h >= pos.entry + beR * r) {
        pos.stop = pos.entry;
        pos.movedToBreakEven = true;
      }
      const exitBars = cfg.signalExitBars;
      if (exitBars !== null && exitBars !== undefined) {
        pos.reversalBars = wantsExit(cfg, score) ? (pos.reversalBars || 0) + 1 : 0;
        if (pos.reversalBars >= exitBars) closePosition(state, cfg, symbol, c.c, c.t, cfg.entryMode === 'pullback' ? 'فروش در روند صعودی' : 'معکوس شدن سیگنال');
      }
    }
    markEquity(state, c.t);
    return;
  }

  if (entryBlocker(cfg, s, i, score) !== null) return;
  if (Object.keys(state.open).length >= cfg.maxPositions) return 'full';
  const a = atrArr[i];
  if (!a) return;

  const entry = c.c;
  const stop = entry - cfg.atrStop * a;
  const riskPerUnit = entry - stop;
  if (riskPerUnit <= 0) return;
  if (cfg.maxFeeShare > 0 && (2 * (cfg.feePct ?? 0.1)) / ((riskPerUnit / entry) * 100) > cfg.maxFeeShare) return;

  const riskCash = state.balance * (cfg.riskPct / 100);
  const wanted = Math.min((riskCash / riskPerUnit) * entry, state.balance * (cfg.maxPositionPct / 100));
  const affordable = freeCash(state) / (1 + cfg.feePct / 100);
  const least = Math.max(MIN_ORDER, wanted * 0.25);
  if (Math.min(wanted, affordable) < least) return affordable < least ? 'nocash' : undefined;
  let notional = Math.min(wanted, affordable);
  if (cfg.volScale) {
    s.volr ||= volRatio(candles);
    const r = s.volr[i];
    if (r > 1) notional *= Math.max(0.5, 1 / r);
  }

  const qty = notional / entry;
  const fee = notional * (cfg.feePct / 100);
  state.balance -= fee;
  state.open[symbol] = {
    symbol, side: 'long',
    entry: px(entry), initialStop: px(stop), stop: px(stop),
    tp: cfg.trailAtr ? null : px(entry + cfg.rMultiple * riskPerUnit),
    qty: round(qty, 10), notional: round(notional, 2),
    openedAt: c.t, openScore: score, entryBar: cfg.entryMode === 'trend' || !cfg.entryMode ? cfg.entryScore : null, entryMode: cfg.entryMode || 'trend',
    movedToBreakEven: false, feePaid: round(fee, 4),
    riskCash: round(qty * riskPerUnit, 2),
    ctx: {
      trendUp: !!(ind.ema200[i] && c.c > ind.ema200[i]),
      adx: ind.adx.adx[i] === null ? null : round(ind.adx.adx[i], 1),
      rsi: ind.rsi[i] === null ? null : round(ind.rsi[i], 1),
      atrPct: round((a / entry) * 100, 3),
    },
  };
  markEquity(state, c.t);
}

function closePosition(state, cfg, symbol, exitPrice, t, reason) {
  const p = state.open[symbol];
  if (!p) return;
  const dir = p.side === 'short' ? -1 : 1;
  const gross = (exitPrice - p.entry) * p.qty * dir;
  const fee = exitPrice * p.qty * (cfg.feePct / 100);
  const entryFee = p.feePaid || 0;
  const pnl = gross - fee - entryFee;
  state.balance += p.real ? pnl : gross - fee;
  state.closed.push({
    ...p, exit: px(exitPrice), exitAt: t, reason,
    pnl: round(pnl, 2), pnlPct: round((((exitPrice / p.entry) - 1) * 100) * dir, 3),
    feePaid: round((p.feePaid || 0) + fee, 4),
  });
  delete state.open[symbol];
}

/**
 * باز کردن دستی یک پوزیشن در همان حساب شبیه‌سازی‌شده.
 */
export function openManual(state, cfg, symbol, price, { notional, stopPrice, targetPrice, at = Date.now(), ctx = null } = {}) {
  if (state.open[symbol]) return { ok: false, error: `شما در حال حاضر یک پوزیشن آزمایشی باز روی ${symbol} دارید. ابتدا آن را ببندید.` };
  if (Object.keys(state.open).length >= cfg.maxPositions) return { ok: false, error: `شما از قبل ${cfg.maxPositions} پوزیشن آزمایشی باز دارید — این حد مجاز در تنظیمات شماست.` };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'در حال حاضر قیمت زنده برای این رمزارز وجود ندارد.' };

  const cash = Math.floor((freeCash(state) / (1 + cfg.feePct / 100)) * 100) / 100;
  if (+notional > cash + 1e-9 && cash >= 1) return { ok: false, error: `فقط ${cash.toFixed(2)} از موجودی آزمایشی آزاد است (پس از کسر کارمزد) — مابقی در پوزیشن‌های باز است.` };
  const size = Math.min(+notional || 0, cash);
  if (!(size >= 1)) return { ok: false, error: cash < 1 ? 'تمام موجودی آزمایشی در پوزیشن‌های باز است. ابتدا یکی را ببندید.' : 'مبلغی معادل حداقل ۱ یا بیشتر وارد کنید.' };

  const stop = Number.isFinite(stopPrice) && stopPrice > 0 && stopPrice < price ? stopPrice : price * 0.95;
  const tp = Number.isFinite(targetPrice) && targetPrice > price ? targetPrice : price + (price - stop) * cfg.rMultiple;
  const qty = size / price;
  const fee = size * (cfg.feePct / 100);
  state.balance -= fee;
  state.open[symbol] = {
    symbol, side: 'long', manual: true,
    entry: px(price), initialStop: px(stop), stop: px(stop), tp: px(tp),
    qty: round(qty, 10), notional: round(size, 2),
    openedAt: at, openScore: null, movedToBreakEven: false, feePaid: round(fee, 4),
    ctx, riskCash: round((price - stop) * qty, 2),
  };
  markEquity(state, at);
  return { ok: true, position: state.open[symbol] };
}

/**
 * ثبت معامله‌ای که شخصاً در یک صرافی انجام داده‌اید.
 */
export function recordRealTrade(state, cfg, { symbol, side = 'long', qty, entry, exit = null, fee = 0, openedAt = Date.now(), closedAt = null, note = '' }) {
  if (!symbol) return { ok: false, error: 'کدام رمزارز؟' };
  const q = +qty, e = +entry;
  if (!(q > 0)) return { ok: false, error: 'مقدار خریداری‌شده را بزرگ‌تر از صفر وارد کنید.' };
  if (!(e > 0)) return { ok: false, error: 'قیمت خرید را وارد کنید.' };
  if (side !== 'long' && side !== 'short') return { ok: false, error: 'جهت معامله باید خرید (long) یا فروش (short) باشد.' };

  const notional = q * e;
  const feePaid = Math.max(0, +fee || 0);

  if (exit === null || exit === '' || exit === undefined) {
    if (state.open[symbol]) return { ok: false, error: `شما از قبل یک پوزیشن باز ثبت‌شده برای ${symbol} دارید. ابتدا آن را ببندید.` };
    state.open[symbol] = {
      symbol, side, real: true,
      entry: px(e), initialStop: null, stop: null, tp: null,
      qty: round(q, 10), notional: round(notional, 2),
      openedAt, openScore: null, movedToBreakEven: false, feePaid: round(feePaid, 4), note,
    };
    markEquity(state, openedAt);
    return { ok: true, position: state.open[symbol] };
  }

  const x = +exit;
  if (!(x > 0)) return { ok: false, error: 'قیمت فروش را وارد کنید یا اگر معامله همچنان باز است آن را خالی بگذارید.' };
  const gross = side === 'long' ? (x - e) * q : (e - x) * q;
  const pnl = gross - feePaid;
  state.balance += pnl;
  state.closed.push({
    symbol, side, real: true, note,
    entry: px(e), exit: px(x), qty: round(q, 10), notional: round(notional, 2),
    openedAt, exitAt: closedAt || Date.now(), reason: 'ثبت‌شده توسط شما',
    pnl: round(pnl, 2), pnlPct: round((side === 'long' ? (x / e - 1) : (1 - x / e)) * 100, 3),
    feePaid: round(feePaid, 4),
  });
  markEquity(state, closedAt || Date.now());
  return { ok: true, trade: state.closed[state.closed.length - 1] };
}

export const REAL_NOTICE = 'BTCS فقط سابقه را نگه می‌دارد: هیچ‌وقت سفارشی ثبت نمی‌کند، به صرافی متصل نمی‌شود و هیچ کلیدی را نگه نمی‌دارد.';

/** بستن دستی پوزیشن با قیمت فعلی بازار. */
export function closeManual(state, cfg, symbol, price, at = Date.now(), reason = 'بسته شده توسط شما') {
  if (!state.open[symbol]) return { ok: false, error: `هیچ پوزیشن بازی روی ${symbol} وجود ندارد.` };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'در حال حاضر قیمت زنده برای این رمزارز وجود ندارد.' };
  closePosition(state, cfg, symbol, price, at, reason);
  markEquity(state, at);
  return { ok: true, trade: state.closed[state.closed.length - 1] };
}

function markEquity(state, t) {
  const last = state.equityCurve[state.equityCurve.length - 1];
  if (last && t - last.t < 3600e3) return;
  state.equityCurve.push({ t, equity: round(equity(state, state.px || {}), 2) });
  if (state.equityCurve.length > 2000) state.equityCurve.splice(0, state.equityCurve.length - 2000);
}

/** ردیاب افت سرمایه (Drawdown) در طول اجرای بازپخش. */
export function dropTracker(state) {
  const px = {};
  let t0 = null, peak = equity(state), dd = 0;
  const mark = () => { const e = equity(state, px); if (e > peak) peak = e; else if (peak > 0) dd = Math.max(dd, (peak - e) / peak); };
  return {
    onBar(c, symbol) { if (t0 !== null && c.t > t0) mark(); px[symbol] = c.c; t0 = c.t; },
    worstDropPct() { if (t0 !== null) mark(); return dd * 100; },
  };
}

export function equity(state, pricesBySymbol = {}) {
  let openValue = 0;
  for (const [sym, p] of Object.entries(state.open)) {
    const px = pricesBySymbol[sym] ?? p.entry;
    openValue += (px - p.entry) * p.qty * (p.side === 'short' ? -1 : 1);
  }
  return state.balance + openValue;
}

export function stats(state, pricesBySymbol = {}) {
  const closed = state.closed;
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const eq = equity(state, pricesBySymbol);

  let peak = state.startingBalance, maxDd = 0;
  const mark = (e) => {
    if (!Number.isFinite(e)) return;
    peak = Math.max(peak, e);
    maxDd = Math.max(maxDd, (peak - e) / peak);
  };
  const curve = state.equityCurve || [];
  for (const p of curve) mark(p.equity);
  const lastT = curve.length ? curve[curve.length - 1].t : -Infinity;
  let run = curve.length ? curve[curve.length - 1].equity : state.startingBalance;
  for (const t of closed.filter((x) => (x.exitAt || 0) > lastT).sort((a, b) => (a.exitAt || 0) - (b.exitAt || 0))) { run += t.pnl || 0; mark(run); }
  mark(eq);

  return {
    equity: round(eq, 2),
    balance: round(state.balance, 2),
    startingBalance: state.startingBalance,
    returnPct: round(((eq / state.startingBalance) - 1) * 100, 2),
    trades: closed.length,
    openCount: Object.keys(state.open).length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? round((wins.length / closed.length) * 100, 1) : null,
    avgWinPct: wins.length ? round(wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length, 2) : null,
    avgLossPct: losses.length ? round(losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length, 2) : null,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : null,
    maxDrawdownPct: round(maxDd * 100, 2),
    feesPaid: round(closed.reduce((s, t) => s + (t.feePaid || 0), 0), 2),
    since: Math.min(state.startedAt, state.firstBarAt ?? state.startedAt),
    liveSince: state.startedAt,
  };
}

export const PAPER_NOTICE = 'فقط پول شبیه‌سازی‌شده. این معامله‌گر هیچ سفارشی ثبت نمی‌کند، به هیچ صرافی متصل نمی‌شود و هیچ کلیدی را نگه نمی‌دارد — عملکرد استراتژی را به همراه کارمزدها نشان می‌دهد.';
export const DEMO_NOTICE = 'فقط پول شبیه‌سازی‌شده: هیچ سفارشی به هیچ کجا ارسال نمی‌شود، هیچ صرافی متصل نیست و هیچ کلیدی نگه داشته نمی‌شود. کارمزد درست مثل یک معامله واقعی محاسبه می‌شود.';

/** ثبت فعالیت‌های بررسی بازار. */
export function logCheck(state, entry) {
  if (!state) return;
  state.log = [...(state.log || []), { t: Date.now(), ...entry }].slice(-40);
}
