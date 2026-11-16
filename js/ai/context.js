// Gathers everything the assistant needs about a coin: live candles, signals on
// several timeframes, the AI forecast, backtest, sentiment and the user's holdings.
import { markets, findCoin, getCandles, getFearGreed, isTestedSource, INTERVAL_MS } from '../api/market.js';
import { generateSignal, confluence, backtest } from '../lib/signals.js';
import { forecastFacts } from '../lib/forecastview.js';
import { directionTrustFor } from '../lib/selfimprove.js';
import { runForecast, runHistory } from '../lib/compute.js';
import { timingOutlook, summarizeTiming, timingText } from '../lib/timing.js';
import { adviseCoin, rankAdvice } from '../lib/advice.js';
import { isStable } from '../api/market.js';
import { isTickerMention } from '../lib/tickers.js';
import { horizonText } from '../format.js';
import { load } from '../store.js';
import { aiSignal, CHART_TESTED, bestTestedChart } from '../lib/autotrader.js';
import { getNews, backendEnabled } from '../api/backend.js';

const cache = new Map();
export const DEFAULT_HORIZON = { '1s': 30, '5s': 24, '10s': 18, '1m': 15, '5m': 12, '15m': 8, '1h': 12, '4h': 6, '1d': 7 };

export function remember(symbol, interval, patch) {
  const key = `${symbol}:${interval}`;
  cache.set(key, { ...(cache.get(key) || {}), ...patch, at: Date.now() });
}

export async function analyzeCoin(symbol, { interval = '4h', withForecast = true, onStep } = {}) {
  const key = `${symbol}:${interval}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 90e3 && (!withForecast || hit.forecast)) return hit;
  const coin = await findCoin(symbol);
  if (!coin) throw new Error(`ارز ${symbol} در میان ۲۵۰ ارز برتر یافت نشد.`);
  onStep?.('بارگذاری داده‌های زنده نمودار…');
  const main = await getCandles(coin, interval, 1500);
  const signal = generateSignal(main.candles, { interval });
  onStep?.('بررسی سایر تایم‌فریم‌ها…');
  const others = ['15m', '1h', '4h', '1d'].filter((iv) => iv !== interval);
  const mtf = { [interval]: signal };
  await Promise.all(others.map(async (iv) => {
    try { const r = await getCandles(coin, iv, 300); mtf[iv] = generateSignal(r.candles, { interval: iv }); } catch { /* skip */ }
  }));
  const conf = confluence(mtf);
  const bt = backtest(main.candles.slice(-1000));
  let forecast = hit?.forecast || null;
  const horizon = DEFAULT_HORIZON[interval] || 12;
  if (withForecast && !forecast) {
    onStep?.('اجرای پیش‌بینی هوش مصنوعی (الگو‌یابی و مدل‌های یادگیری ماشین)…');
    forecast = await runForecast(main.candles, { horizon, intervalMs: INTERVAL_MS[interval] });
  }
  let history = hit?.history || null;
  if (!history) {
    onStep?.('مقایسه شرایط امروز با سال‌های گذشته…');
    history = await getCandles(coin, '1d', 2000)
      .then((d) => runHistory(d.candles, { window: 45, horizons: [7, 30, 90], horizon: 30 }))
      .catch(() => null);
  }
  const timing = forecast?.ok ? timingOutlook(forecast, { intervalMs: INTERVAL_MS[interval], interval }) : null;
  let news = hit?.news || null;
  if (!news && backendEnabled()) {
    news = await getNews({ coin: coin.symbol, limit: 6 }).catch(() => []);
  }
  const fng = await getFearGreed().catch(() => null);
  const result = {
    coin, interval, candles: main.candles, source: main.source, signal, mtf, confluence: conf, backtest: bt,
    forecast, history, timing, news, horizon, horizonText: horizonText(interval, horizon), fearGreed: fng?.[0] || null, at: Date.now(),
  };
  cache.set(key, result);
  return result;
}

const scanCache = new Map();
export async function scanMarket({ interval = '4h', count = 40, onStep } = {}) {
  const key = `${interval}:${count}`;
  const hit = scanCache.get(key);
  if (hit && Date.now() - hit.at < 180e3) return hit.rows;

  const list = (await markets()).filter((c) => !isStable(c.symbol)).slice(0, count);
  const rows = [];
  let done = 0, skipped = 0;
  const queue = [...list];
  const worker = async () => {
    while (queue.length) {
      const coin = queue.shift();
      try {
        const res = await getCandles(coin, interval, 1500);
        const ai = CHART_TESTED[interval]?.standard && isTestedSource(res) ? aiSignal(res.candles.slice(0, -1), interval, coin.symbol) : null;
        if (isTestedSource(res)) rows.push({ coin, signal: generateSignal(res.candles, { interval }), candles: res.candles, ai });
        else skipped++;
      } catch { skipped++; }
      onStep?.(`در حال اسکن بازار… ${++done}/${list.length}`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  const shortlist = rows.filter((r) => r.signal.ok);
  const horizon = DEFAULT_HORIZON[interval] || 12;
  let forecasted = 0;
  await Promise.all(shortlist.map(async (row) => {
    try {
      const fc = await runForecast(row.candles, { horizon, intervalMs: INTERVAL_MS[interval] });
      row.forecast = fc;
      row.timing = fc?.ok ? timingOutlook(fc, { intervalMs: INTERVAL_MS[interval], interval }) : null;
    } catch { /* advice still works from the signal alone */ }
    onStep?.(`محاسبه پیش‌بینی… ${++forecasted}/${shortlist.length}`);
  }));
  for (const row of rows) {
    row.advice = adviseCoin({ signal: row.signal, forecast: row.forecast, timing: row.timing, interval: row.interval || interval, trust: directionTrustFor(row.interval || interval).trust });
    row.candles = null;
  }
  rows.skipped = skipped;
  scanCache.set(key, { at: Date.now(), rows });
  return rows;
}

export function marketContext(rows, interval) {
  const { buys, avoid, wait, total } = rankAdvice(rows);
  const shape = (r) => ({
    coin: r.coin.symbol,
    name: r.coin.name,
    verdict: r.advice.verdict,
    conviction: r.advice.conviction,
    price: r.advice.price,
    change24hPct: r.coin.change24h === null || r.coin.change24h === undefined ? null : +r.coin.change24h.toFixed(2),
    buyBetween: r.advice.plan ? r.advice.plan.entryZone : null,
    stopLoss: r.advice.plan ? r.advice.plan.stopLoss : null,
    sellTargets: r.advice.plan ? r.advice.plan.takeProfits : null,
    riskPct: r.advice.plan ? r.advice.plan.riskPct : null,
    holdForBars: r.advice.timing?.rising ? r.advice.timing.bars : null,
    expectedPeakPrice: r.advice.timing?.rising && r.advice.timing.targetPrice ? +r.advice.timing.targetPrice.toPrecision(6) : null,
    turnsDownAfterBars: r.advice.timing?.turnBars ?? null,
    waitFor: r.advice.waitFor?.[0] || null,
    topReason: r.advice.reasons[0]?.text || null,
  });
  const t = CHART_TESTED[interval];
  const inTrade = rows.filter((r) => r.ai && (r.ai.action === 'buy' || r.ai.action === 'hold'));
  const rule = t?.standard ? {
    interval,
    best: bestTestedChart()?.iv === interval,
    coins: inTrade.map((r) => ({ coin: r.coin.symbol, action: r.ai.action, entry: r.ai.entry, stop: r.ai.stop, target: r.ai.target ?? null, openedAt: r.ai.openedAt, openPct: r.ai.openPct })),
    read: rows.filter((r) => r.ai).length,
    record: { perPeriodPct: (t.adopt ? t.own : t.standard).ret, holdPct: t.hold, period: t.block, coins: t.coins, from: t.from, to: t.to, fillCost: t.fillCost ?? 0 },
  } : null;
  return {
    interval,
    horizonText: horizonText(interval, DEFAULT_HORIZON[interval] || 12),
    scanned: total,
    skipped: rows.skipped || 0,
    buys: buys.slice(0, 6).map(shape),
    avoid: avoid.slice(0, 4).map(shape),
    waitingCount: wait.length,
    rule,
  };
}

export const SCAN_FRAMES = [
  { interval: '1h', label: 'کوتاه‌مدت' },
  { interval: '4h', label: 'میان‌مدت (سوئینگ)' },
  { interval: '1d', label: 'پوزیشن (روزانه)' },
];

export async function scanMarketMulti({ intervals = SCAN_FRAMES.map((f) => f.interval), count = 30, onStep } = {}) {
  const byInterval = {};
  onStep?.(`اسکن بازار در تایم‌فریم‌های ${intervals.join(', ')}…`);
  await Promise.all(intervals.map(async (interval) => {
    byInterval[interval] = await scanMarket({ interval, count, onStep: (t) => onStep?.(`${interval}: ${t.replace('در حال اسکن بازار… ', '')}`) });
  }));
  return byInterval;
}

export function marketContextMulti(byInterval) {
  const frames = SCAN_FRAMES
    .filter((f) => byInterval[f.interval])
    .map((f) => ({ label: f.label, ...marketContext(byInterval[f.interval], f.interval) }));

  const tally = new Map();
  for (const fr of frames) {
    for (const b of fr.buys) {
      const e = tally.get(b.coin) || { coin: b.coin, name: b.name, frames: [], convictionSum: 0 };
      e.frames.push({ label: fr.label, interval: fr.interval, horizonText: fr.horizonText, ...b });
      e.convictionSum += b.conviction;
      tally.set(b.coin, e);
    }
  }
  const agree = [...tally.values()]
    .sort((a, b) => b.frames.length - a.frames.length || b.convictionSum - a.convictionSum)
    .slice(0, 5);

  const avoidAll = new Map();
  for (const fr of frames) for (const a of fr.avoid) if (!avoidAll.has(a.coin)) avoidAll.set(a.coin, { ...a, label: fr.label, interval: fr.interval });

  return {
    frames,
    agree,
    rule: (frames.find((f) => f.rule?.best) || [...frames].reverse().find((f) => f.rule))?.rule || null,
    avoid: [...avoidAll.values()].slice(0, 5),
    scanned: frames[0]?.scanned || 0,
    intervals: frames.map((f) => f.interval),
  };
}

export async function compareCoins(symbols, { interval = '4h', onStep } = {}) {
  const list = await markets().catch(() => []);
  const rows = [];
  for (const sym of symbols.slice(0, 4)) {
    onStep?.(`در حال بررسی ${sym}…`);
    try {
      const coin = await findCoin(sym);
      if (!coin) continue;
      const res = await getCandles(coin, interval, 1500);
      const { candles } = res;
      const signal = generateSignal(candles, { interval });
      let forecast = null, timing = null;
      if (isTestedSource(res)) {
        try {
          forecast = await runForecast(candles, { horizon: DEFAULT_HORIZON[interval] || 12, intervalMs: INTERVAL_MS[interval] });
          timing = forecast?.ok ? timingOutlook(forecast, { intervalMs: INTERVAL_MS[interval], interval }) : null;
        } catch { /* the chart signal alone still ranks */ }
      }
      const trust = directionTrustFor(interval).trust;
      const advice = adviseCoin({ signal, forecast, timing, interval, trust });
      const live = list.find((c) => c.symbol === coin.symbol);
      const f = forecast?.ok ? forecastFacts(forecast, interval, trust) : null;
      rows.push({
        coin: coin.symbol, name: coin.name,
        verdict: advice.verdict, conviction: advice.conviction,
        signalText: signal.ok ? signal.text : null,
        score: signal.ok ? signal.score : null,
        probUpPct: f ? f.probUpPct : null,
        forecastNote: isTestedSource(res) ? null : 'بدون پیش‌بینی: این ارز فقط دارای داده‌های کوین‌گکو یا نمایشی است که الگوریتم پیش‌بینی روی آن تست نشده است.',
        accuracyPct: f ? f.testedDirectionPct : null,
        change24h: live?.change24h ?? coin.change24h ?? null,
        buyBetween: advice.plan ? advice.plan.entryZone : null,
        stopLoss: advice.plan ? advice.plan.stopLoss : null,
        sellTargets: advice.plan ? advice.plan.takeProfits : null,
        topReason: advice.reasons?.[0]?.text || null,
      });
    } catch { /* skip a coin we cannot read */ }
  }
  return rows;
}

export async function portfolioSummary() {
  const holdings = load('holdings', []);
  if (!holdings.length) return [];
  const list = await markets().catch(() => []);
  return holdings.map((h) => {
    const c = list.find((m) => m.symbol === h.symbol);
    const price = c?.price ?? null;
    return { symbol: h.symbol, amount: h.amount, avgBuy: h.avgBuy, price, value: price ? price * h.amount : 0, pnlPct: price && h.avgBuy ? (price / h.avgBuy - 1) * 100 : null };
  });
}

export function analystContext(a, portfolio) {
  const mtfShort = Object.fromEntries(Object.entries(a.mtf).map(([iv, s]) => [iv, s?.ok ? { score: s.score, text: s.text } : null]));
  return {
    coin: { name: a.coin.name, symbol: a.coin.symbol, price: a.signal.price ?? a.coin.price, change24h: a.coin.change24h },
    interval: a.interval,
    signal: a.signal,
    mtf: mtfShort,
    confluence: a.confluence,
    backtest: a.backtest,
    forecast: forecastFacts(a.forecast, a.interval, directionTrustFor(a.interval).trust),
    timing: summarizeTiming(a.timing),
    timingSentence: a.timing?.ok && a.timing.shaped
      ? timingText(a.timing, (bars) => horizonText(a.interval, bars), (v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }))
      : null,
    news: (a.news || []).slice(0, 5).map((n) => ({ title: n.title, source: n.source, at: n.published_at })),
    history: a.history?.ok ? { ...a.history.summary, verdictText: a.history.verdict.text, seasonMonth: a.history.season?.current || null } : null,
    horizonText: a.horizonText,
    fearGreed: a.fearGreed,
    portfolio,
  };
}

export function llmData(a) {
  const s = a.signal;
  return {
    coin: `${a.coin.name} (${a.coin.symbol})`,
    price: s.price, change24hPct: a.coin.change24h !== null && a.coin.change24h !== undefined ? +a.coin.change24h.toFixed(2) : null,
    chart: a.interval,
    signal: s.ok ? { verdict: s.text, score: s.score, plan: s.plan && { side: s.plan.side, entryZone: s.plan.entryZone, stopLoss: s.plan.stopLoss, takeProfits: s.plan.takeProfits }, supports: s.levels.supports, resistances: s.levels.resistances, rsi: s.indicators.rsi && +s.indicators.rsi.toFixed(1) } : null,
    timeframes: Object.fromEntries(Object.entries(a.mtf).map(([iv, x]) => [iv, x?.ok ? x.text : null])),
    aiForecast: forecastFacts(a.forecast, a.interval) && { horizon: a.horizonText, ...forecastFacts(a.forecast, a.interval, directionTrustFor(a.interval).trust) },
    moveTiming: summarizeTiming(a.timing),
    recentHeadlines: (a.news || []).slice(0, 5).map((n) => `${n.source}: ${n.title}`),
    multiYearHistory: a.history?.ok ? a.history.summary : null,
    fearGreed: a.fearGreed && `${a.fearGreed.value} (${a.fearGreed.classification})`,
  };
}

const COMMON_COINS = /^(btc|bitcoin|eth|ether|ethereum|bnb|sol|solana|xrp|ripple|ada|cardano|doge|dogecoin|trx|tron|avax|dot|polkadot|link|chainlink|matic|polygon|ltc|litecoin|shib|ton|near|atom|uni|xlm|bch|etc|fil|apt|arb|op|sui|pepe|hbar|icp|inj|tao|sei|rndr|aave|mkr|zec)$/;
export async function detectSymbol(text) {
  const list = await markets().catch(() => []);
  const words = String(text).replace(/[^A-Za-z0-9$ ]/g, ' ').split(/\s+/).filter(Boolean);
  const raw = String(text);
  let from = 0;
  for (const w of words) {
    const at = raw.indexOf(w, from); from = at + w.length;
    const typedAsTicker = w.startsWith('$') || (w === w.toUpperCase() && /[A-Z]/.test(w));
    if (!typedAsTicker && !(COMMON_COINS.test(w.toLowerCase()) && isTickerMention(w, raw, at))) continue;
    const t = w.replace(/^\$/, '').toUpperCase();
    if (t.length < 2 || (!w.startsWith('$') && ['I', 'A', 'AN', 'IS', 'IT', 'TO', 'OR', 'ON', 'AT', 'BE', 'MY', 'ME', 'DO', 'SO', 'UP', 'IN', 'OF', 'THE', 'AND', 'FOR', 'NOW', 'BUY', 'SELL', 'CAN', 'WILL', 'GO', 'NEXT', 'HOW', 'WHAT', 'WHEN', 'SHOULD', 'ONE', 'ANY', 'ALL', 'NEW', 'OUT', 'GET', 'PUT', 'TOP', 'AI', 'BOT'].includes(t))) continue;
    const bySym = list.find((c) => c.symbol === t && c.binance);
    if (bySym) return bySym.symbol;
  }
  const lower = String(text).toLowerCase();
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const byName = list.filter((c) => c.name.length > 3)
    .find((c) => new RegExp(`\\b${esc(c.name.toLowerCase())}\\b`).test(lower));
  return byName?.symbol || null;
}