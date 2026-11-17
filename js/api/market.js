// لایه داده بازار. منابع زنده در اولویت (CoinGecko → CoinPaprika, Binance)،
// و داده‌های نمایشی (دمو) تنها در صورتی به صراحت استفاده می‌شوند که تمام منابع زنده در دسترس نباشند.
import { CONFIG } from '../config.js';
import { getJson, getJsonAny, peek, postJson, HttpError } from './http.js';
import * as demo from '../lib/demo.js';
import { syncClock, now } from './clock.js';
import { load, save } from '../store.js';

// ------------------------------------------------------------ وضعیت
export const dataStatus = new EventTarget();
dataStatus.demo = false;
function markDemo(reason) {
  if (!dataStatus.demo) {
    dataStatus.demo = true;
    dataStatus.dispatchEvent(new CustomEvent('change', { detail: { demo: true, reason } }));
  }
}
function markLive() {
  if (dataStatus.demo) {
    dataStatus.demo = false;
    dataStatus.dispatchEvent(new CustomEvent('change', { detail: { demo: false } }));
  }
}
const stale = async (p) => { try { return await p; } catch (e) { if (e.staleValue !== undefined) return e.staleValue; throw e; } };
const STABLE = new Set(CONFIG.STABLECOINS);
// ارزهایی که قیمت آن‌ها در طول هفته ثابت مانده است: استِیبل‌کوین‌ها و صندوق‌های توکنیزه‌شده‌ای که
// لیست بالا هنوز نمی‌شناسد. با بارگیری لیست بازار تکمیل می‌شوند.
const PEGGED = new Set();
export const isStable = (sym) => STABLE.has(String(sym).toLowerCase()) || PEGGED.has(String(sym).toLowerCase());
/** یک هفته قیمت‌هایی که نوسان آن‌ها از بالا تا پایین کمتر از ۰.۶٪ بوده است: هیچ ارز دیجیتالی این‌گونه نیست. */
export function looksPegged(prices) {
  const p = (prices || []).filter((x) => Number.isFinite(x) && x > 0);
  if (p.length < 24) return false;
  return Math.max(...p) / Math.min(...p) - 1 < 0.006;
}

// ------------------------------------------------------------ نمادهای بایننس
let symbolSetPromise = null;
export function binanceSymbols() {
  if (!symbolSetPromise) {
    symbolSetPromise = (async () => {
      try {
        const rows = await getJsonAny(CONFIG.BINANCE_REST, '/api/v3/ticker/price', { ttl: 10 * 60e3, persist: true, key: 'bn:prices' });
        return new Set(rows.map((r) => r.symbol).filter((s) => s.endsWith('USDT')));
      } catch {
        return new Set(demo.DEMO_USDT_SYMBOLS);
      }
    })();
  }
  return symbolSetPromise;
}

// ------------------------------------------------------------ بازارها
function fromGecko(r) {
  return {
    id: r.id, symbol: r.symbol.toUpperCase(), name: r.name, image: r.image, rank: r.market_cap_rank,
    price: r.current_price, marketCap: r.market_cap, volume24h: r.total_volume,
    change1h: r.price_change_percentage_1h_in_currency, change24h: r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h,
    change7d: r.price_change_percentage_7d_in_currency, high24h: r.high_24h, low24h: r.low_24h,
    circulatingSupply: r.circulating_supply, ath: r.ath, sparkline: r.sparkline_in_7d?.price || [], source: 'coingecko',
  };
}
function fromPaprika(r) {
  const q = r.quotes?.USD || {};
  return {
    id: r.id, symbol: r.symbol.toUpperCase(), name: r.name, image: `https://static.coinpaprika.com/coin/${r.id}/logo.png`, rank: r.rank,
    price: q.price, marketCap: q.market_cap, volume24h: q.volume_24h, change1h: q.percent_change_1h, change24h: q.percent_change_24h,
    change7d: q.percent_change_7d, high24h: null, low24h: null, circulatingSupply: r.circulating_supply, ath: q.ath_price, sparkline: [], source: 'paprika',
  };
}

export function cachedMarkets() {
  const g = peek('cg:markets');
  return g ? g.map(fromGecko) : null;
}

export async function getMarkets() {
  let rows;
  try {
    const raw = await stale(getJson(`${CONFIG.COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=1h,24h,7d`, { ttl: 60e3, persist: true, key: 'cg:markets' }));
    rows = raw.map(fromGecko);
    markLive();
  } catch {
    try {
      const raw = await stale(getJson(`${CONFIG.PAPRIKA}/tickers?limit=250`, { ttl: 60e3, persist: true, key: 'pp:tickers' }));
      rows = raw.map(fromPaprika);
      markLive();
    } catch {
      markDemo('markets');
      rows = demo.demoMarkets().map((m) => ({ ...m, symbol: m.symbol.toUpperCase(), source: 'demo' }));
    }
  }
  const set = await binanceSymbols();
  const seen = new Set();
  // فید بالادستی گاهی اوقات مواردی را شامل می‌شود که در واقع ارزهای معامله‌پذیر نیستند —
  // سهام توکنیزه‌شده و لیست‌های نمایشی (placeholder) بدون حجم، بدون تاریخچه قیمت
  // و با نمادی که کد محصول است. اگر یکی از این موارد بالاتر از بیت‌کوین قرار گیرد،
  // کل لیست خراب به نظر می‌رسد، بنابراین حذف می‌شوند.
  const looksReal = (r) => {
    if (r.price === null || r.price === undefined) return false;
    if (/^[A-Z]{1,3}\d{4,}$/.test(String(r.symbol || ''))) return false; // به عنوان مثال PC0000023
    const noMovement = (r.change24h === null || r.change24h === undefined || r.change24h === 0)
      && (r.change7d === null || r.change7d === undefined || r.change7d === 0);
    const noVolume = !r.volume24h;
    if (noMovement && noVolume) return false;
    return true;
  };
  for (const r of rows) if (looksPegged(r.sparkline)) PEGGED.add(String(r.symbol).toLowerCase());
  return rows.filter(looksReal).map((r) => {
    const pair = `${r.symbol}USDT`;
    const binance = !isStable(r.symbol) && set.has(pair) && !seen.has(pair) ? pair : null;
    if (binance) seen.add(pair);
    return { ...r, binance };
  });
}

let marketsCache = { at: 0, promise: null };
export function markets() {
  if (!marketsCache.promise || Date.now() - marketsCache.at > 60e3) {
    marketsCache = { at: Date.now(), promise: getMarkets().catch((e) => { marketsCache.at = 0; throw e; }) };
  }
  return marketsCache.promise;
}

export async function findCoin(symbolOrId) {
  const list = await markets();
  const s = String(symbolOrId).toUpperCase();
  return list.find((c) => c.symbol === s) || list.find((c) => c.id === symbolOrId) || null;
}

export async function getGlobal() {
  try {
    const { data } = await stale(getJson(`${CONFIG.COINGECKO}/global`, { ttl: 120e3, persist: true, key: 'cg:global' }));
    return {
      totalMarketCap: data.total_market_cap?.usd, totalVolume: data.total_volume?.usd,
      btcDominance: data.market_cap_percentage?.btc, ethDominance: data.market_cap_percentage?.eth,
      marketCapChange24h: data.market_cap_change_percentage_24h_usd, activeCryptocurrencies: data.active_cryptocurrencies, markets: data.markets,
    };
  } catch {
    try {
      const g = await stale(getJson(`${CONFIG.PAPRIKA}/global`, { ttl: 120e3, persist: true, key: 'pp:global' }));
      return { totalMarketCap: g.market_cap_usd, totalVolume: g.volume_24h_usd, btcDominance: g.bitcoin_dominance_percentage, ethDominance: null, marketCapChange24h: g.market_cap_change_24h, activeCryptocurrencies: g.cryptocurrencies_number, markets: null };
    } catch {
      markDemo('global');
      return demo.demoGlobal();
    }
  }
}

export async function getFearGreed() {
  try {
    const r = await stale(getJson(`${CONFIG.FEAR_GREED}?limit=30`, { ttl: 30 * 60e3, persist: true, key: 'fng' }));
    return r.data.map((d) => ({ value: +d.value, classification: d.value_classification, timestamp: +d.timestamp }));
  } catch {
    return demo.demoFearGreed();
  }
}

export async function getTrending() {
  try {
    const { coins } = await stale(getJson(`${CONFIG.COINGECKO}/search/trending`, { ttl: 10 * 60e3, persist: true, key: 'cg:trending' }));
    return coins.slice(0, 8).map(({ item }) => ({
      id: item.id, symbol: item.symbol.toUpperCase(), name: item.name, image: item.small || item.thumb, rank: item.market_cap_rank,
      price: item.data?.price ?? null, change24h: item.data?.price_change_percentage_24h?.usd ?? null,
    }));
  } catch {
    return demo.demoTrending().map((t) => ({ ...t, image: null }));
  }
}

export async function getCoinProfile(coin) {
  if (!coin || coin.source !== 'coingecko') return null;
  try {
    const r = await stale(getJson(`${CONFIG.COINGECKO}/coins/${encodeURIComponent(coin.id)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`, { ttl: 30 * 60e3, persist: true, key: `cg:coin:${coin.id}` }));
    const md = r.market_data || {};
    return {
      description: (r.description?.en || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 1400),
      categories: (r.categories || []).filter(Boolean).slice(0, 6),
      homepage: r.links?.homepage?.find(Boolean) || null,
      explorer: r.links?.blockchain_site?.find(Boolean) || null,
      genesisDate: r.genesis_date, athDate: md.ath_date?.usd, atl: md.atl?.usd,
      change30d: md.price_change_percentage_30d, change1y: md.price_change_percentage_1y,
      totalSupply: md.total_supply, maxSupply: md.max_supply, fdv: md.fully_diluted_valuation?.usd,
    };
  } catch {
    // مقدار null به معنای «این ارز پروفایل مرجعی برای دریافت ندارد» است. درخواست ناموفق
    // یا دارای محدودیت نرخ (Rate-limited) مقوله متفاوتی است و صفحه باید قادر به تشخیص آن‌ها باشد:
    // پیش‌تر هرگاه CoinGecko درخواست را محدود می‌کرد، برای بیت‌کوین عبارت «Max supply ∞» چاپ می‌شد.
    return { unavailable: true };
  }
}

export async function searchCoins(q) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const list = await markets().catch(() => []);
  const local = list.filter((c) => c.symbol.toLowerCase().startsWith(s) || c.name.toLowerCase().includes(s)).slice(0, 8);
  return local;
}

// نگه‌داشتن برنامه روی ساعت صرافی، با بررسی مجدد هر ۱۰ دقیقه.
export async function syncExchangeClock() {
  return syncClock(() => getJsonAny(CONFIG.BINANCE_REST, '/api/v3/time', { ttl: 0 }));
}

// ------------------------------------------------------------ کندل‌ها (نمودار شمعی)
export const INTERVAL_MS = { '1s': 1e3, '5s': 5e3, '10s': 1e4, '1m': 6e4, '3m': 18e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '2h': 72e5, '4h': 144e5, '6h': 216e5, '12h': 432e5, '1d': 864e5, '3d': 2592e5, '1w': 6048e5 };

// بایننس کندل‌های ۱ ثانیه‌ای منتشر می‌کند اما بین ۱ ثانیه تا ۱ دقیقه چیزی وجود ندارد،
// بنابراین بازه‌های ۵ ثانیه‌ای و ۱۰ ثانیه‌ای در اینجا با ادغام کندل‌های ۱ ثانیه‌ای در بازه‌های ثابت ساخته می‌شوند.
// هیچ بازه‌ای سریع‌تر از ۱ ثانیه به عنوان کندل در هیچ‌کجا وجود ندارد — آن داده‌های خام معاملات (Trade) هستند.
export const SECOND_INTERVALS = ['1s', '5s', '10s'];
const BUILT_FROM_1S = { '5s': 5, '10s': 10 };
// هر درخواست ۱۰۰۰ کندل برمی‌گرداند، بنابراین نمودار ثانیه‌ای در محدوده‌ای سقف‌گذاری می‌شود که زمان انتظار کوتاه بماند:
// ۱ ثانیه ≈ ۱۷ دقیقه تاریخچه، ۵ ثانیه ≈ ۱.۴ ساعت، ۱۰ ثانیه ≈ ۱.۷ ساعت.
export const MAX_BARS = { '1s': 1000, '5s': 1000, '10s': 600 };

export const isSecondInterval = (iv) => SECOND_INTERVALS.includes(iv);

/** ادغام کندل‌ها در بازه‌های `factor` (مثلاً پنج کندل ۱ ثانیه‌ای → یک کندل ۵ ثانیه‌ای). */
export function bucketCandles(rows, factor, stepMs) {
  const size = factor * stepMs;
  const out = [];
  for (const r of rows) {
    const t = Math.floor(r.t / size) * size;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, r.h);
      last.l = Math.min(last.l, r.l);
      last.c = r.c;
      last.v += r.v;
    } else {
      out.push({ t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v });
    }
  }
  return out;
}

const mapKlines = (rows) => rows.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));

// صفحه‌بندی به عقب، ۱۰۰۰ کندل در هر درخواست.
async function fetchKlines(pair, interval, total, ttl) {
  let out = [];
  let endTime = null;
  while (out.length < total) {
    const limit = Math.min(1000, total - out.length);
    const path = `/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`;
    const rows = mapKlines(await getJsonAny(CONFIG.BINANCE_REST, path, { ttl, key: `bn:${path}` }));
    if (!rows.length) break;
    out = rows.concat(out);
    endTime = rows[0].t - 1;
    if (rows.length < limit) break;
  }
  return out;
}

// ------------------------------------------------------------ سایر صرافی‌ها
// ارزهایی که بایننس لیست نکرده است در صرافی‌های دیگر معامله می‌شوند. این صرافی‌ها کندل‌ها را
// از طریق APIهای عمومی منتشر می‌کنند که درخواست‌های مرورگر را مجاز می‌دانند،
// بنابراین ارزی مانند XMR یا HYPE کندل‌های واقعی OHLCV را در تمام تایم‌فریم‌ها دریافت می‌کند
// به جای خط ساعتی CoinGecko (که اصلاً نمی‌تواند نمودار ۱m، ۵m یا ۱۵m رسم کند).
export const EX_BAR = {
  gate: { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '7d' },
  htx: { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '60min', '4h': '4hour', '1d': '1day', '1w': '1week' },
  okx: { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6Hutc', '12h': '12Hutc', '1d': '1Dutc', '1w': '1Wutc' },
};
// نموداری که صرافی منتشر نمی‌کند از کندل‌های ۱ ساعته آن، روی مرزهای UTC که بایننس استفاده می‌کند ساخته می‌شود
// (یک کندل ۶ ساعته در ساعت‌های ۰۰:۰۰، ۰۶:۰۰، ۱۲:۰۰ و ۱۸:۰۰ UTC باز می‌شود).
// صرافی‌های Gate.io و HTX کندل‌های ۲h، ۶h یا ۱۲h ندارند، بنابراین ارزی که فقط آن‌ها لیست کرده بودند
// هیچ‌گونه کندلی روی این نمودارهای تریدر نداشت.
export const EX_AGG = { '2h': { base: '1h', n: 2 }, '6h': { base: '1h', n: 6 }, '12h': { base: '1h', n: 12 } };
/** کندل‌های ادغام‌شده در بازه‌های طولانی‌تر `step` بر روی مرزهای UTC؛ اولین سطلی که ردیف‌ها درون آن شروع می‌شوند حذف می‌شود. */
export function aggregateCandles(rows, step) {
  const out = [];
  for (const r of rows) {
    const t = Math.floor(r.t / step) * step;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, r.h);
      last.l = Math.min(last.l, r.l);
      last.c = r.c;
      last.v += r.v;
    } else out.push({ t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v, first: r.t });
  }
  return out.filter((b) => b.first === b.t).map(({ first, ...b }) => b);
}
const exBar = (ex, interval) => EX_BAR[ex]?.[interval] || null;
const exCan = (interval) => Boolean(EX_BAR.gate[interval] || EX_AGG[interval]);
const EX_NAME = { gate: 'Gate.io', htx: 'HTX', okx: 'OKX' };
const num = (v) => +v;

async function gateCandles(sym, bar, total, ttl, step) {
  const base = `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${sym}_USDT&interval=${bar}`;
  const map = (rows) => rows.map((r) => ({ t: r[0] * 1e3, o: num(r[5]), h: num(r[3]), l: num(r[4]), c: num(r[2]), v: num(r[6]) }));
  let out = map(await getJson(`${base}&limit=${Math.min(1000, total)}`, { ttl, timeout: 9000 }));
  // صرافی Gate پارامتر limit را همراه با بازه زمانی نمی‌پذیرد، بنابراین صفحات قدیمی‌تر
  // محدوده صریح از/تا حداکثر ۱۰۰۰ کندل را درخواست می‌کنند.
  while (out.length && out.length < total) {
    const to = out[0].t / 1e3 - 1, n = Math.min(1000, total - out.length);
    const rows = map(await getJson(`${base}&from=${Math.floor(to - (n - 1) * step / 1e3)}&to=${Math.floor(to)}`, { ttl, timeout: 9000 }));
    if (!rows.length) break;
    out = rows.concat(out);
  }
  return out;
}
async function htxCandles(sym, bar, total, ttl) {
  const j = await getJson(`https://api.huobi.pro/market/history/kline?symbol=${sym.toLowerCase()}usdt&period=${bar}&size=${Math.min(2000, total)}`, { ttl, timeout: 9000 });
  if (j?.status !== 'ok' || !Array.isArray(j.data)) return [];
  return j.data.map((r) => ({ t: r.id * 1e3, o: num(r.open), h: num(r.high), l: num(r.low), c: num(r.close), v: num(r.amount) })).reverse();
}
async function okxCandles(sym, bar, total, ttl) {
  const inst = `${sym}-USDT`;
  const map = (j) => (Array.isArray(j?.data) ? j.data : []).map((r) => ({ t: num(r[0]), o: num(r[1]), h: num(r[2]), l: num(r[3]), c: num(r[4]), v: num(r[5]) })).reverse();
  let out = map(await getJson(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${bar}&limit=300`, { ttl, timeout: 9000 }));
  // کندل‌های قدیمی‌تر ۱۰۰ تا ۱۰۰ تا می‌آیند؛ برای معقول ماندن تعداد درخواست‌ها، در ۱۰۰۰ متوقف شوید
  for (let i = 0; out.length && out.length < Math.min(total, 1000) && i < 8; i++) {
    const rows = map(await getJson(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=${bar}&after=${out[0].t}&limit=100`, { ttl, timeout: 9000 }));
    if (!rows.length) break;
    out = rows.concat(out);
  }
  return out;
}
const EX_FETCH = { gate: gateCandles, htx: htxCandles, okx: okxCandles };

// صرافی‌ای که یک ارز آخرین بار در آن بوده است، به طوری که ارزی که فقط OKX لیست کرده است
// در هر بازدید دو درخواست ردشده (و دو خطای کنسول) ایجاد نکند. عدم موفقیت در هر سه صرافی
// به طور خلاصه به خاطر سپرده می‌شود، بنابراین یک اختلال جزئی ارز را برای مدت طولانی پنهان نمی‌کند.
const VENUE_KEY = 'exVenue';
const VENUE_HIT_MS = 7 * 864e5, VENUE_MISS_MS = 6 * 3600e3;
const venueMemo = () => load(VENUE_KEY, {}) || {};
function rememberVenue(sym, ex) {
  // یادداشتی برای صرفه‌جویی در زمان بازدید بعدی: عدم موفقیت در نوشتن نباید هرگز هزینه‌ای برای کندل‌ها داشته باشد
  try {
    const m = venueMemo();
    m[sym] = { ex, at: Date.now() };
    // نگه داشتن در اندازه‌ای کوچک: ۲۰۰ ارز اخیراً دیده‌شده
    save(VENUE_KEY, Object.fromEntries(Object.entries(m).sort((a, b) => b[1].at - a[1].at).slice(0, 200)));
  } catch { /* فضای ذخیره‌سازی در دسترس نیست */ }
}

/**
 * جایی که این برنامه کندل‌های یک ارز را از آن می‌گیرد: 'binance'، 'gate'، 'htx'، 'okx'، null
 * (هیچ‌کدام آن را لیست نکرده‌اند) یا undefined (هنوز مشخص نیست).
 */
export function knownVenue(coin) {
  if (!coin?.symbol) return undefined;
  if (coin.binance) return 'binance';
  const sym = String(coin.symbol).toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(sym)) return null;   // هیچ صرافی‌ای از چنین تیکری استفاده نمی‌کند (مانند FIGR_HELOC)
  const m = venueMemo()[sym];
  if (!m) return undefined;
  if (m.ex === null) return Date.now() - m.at < VENUE_MISS_MS ? null : undefined;
  return Date.now() - m.at < VENUE_HIT_MS ? m.ex : undefined;
}
/** تابع knownVenue، جستجوی ارز (چند درخواست کوچک) در صورتی که هنوز شناخته نشده باشد. */
export async function findVenue(coin) {
  const v = knownVenue(coin);
  if (v !== undefined) return v;
  const r = await exchangeCandles(coin, '1d', 60).catch(() => null);
  return r ? r.source : knownVenue(coin);
}

export async function exchangeCandles(coin, interval, total = 500, only = null) {
  const sym = String(coin?.symbol || '').toUpperCase();
  const step = INTERVAL_MS[interval];
  if (!sym || !/^[A-Z0-9]{2,12}$/.test(sym) || !exCan(interval)) return null;
  const ttl = interval.endsWith('m') ? 15e3 : 60e3;
  const known = only ? null : venueMemo()[sym];
  if (known && known.ex === null && Date.now() - known.at < VENUE_MISS_MS) return null;
  const first = known?.ex && Date.now() - known.at < VENUE_HIT_MS ? known.ex : null;
  const order = only ? [only] : [...new Set([first, 'gate', 'htx', 'okx'].filter(Boolean))];
  const answered = [], silent = [];
  for (const ex of order) {
    try {
      const agg = !exBar(ex, interval) && EX_AGG[interval];
      let rows = (agg
        ? await EX_FETCH[ex](sym, EX_BAR[ex][agg.base], total * agg.n + agg.n, ttl, INTERVAL_MS[agg.base])
        : await EX_FETCH[ex](sym, EX_BAR[ex][interval], total, ttl, step))
        .filter((c) => [c.o, c.h, c.l, c.c].every((x) => Number.isFinite(x) && x > 0));
      if (agg) rows = aggregateCandles(rows, step);
      answered.push(ex);
      // لیستی با تاریخچه کم هنگام جستجوی اولیه ارز مورد اعتماد نیست؛ صرافی‌ای که از قبل
      // برای آن پیدا شده فقط باید آنچه درخواست شده را بفرستد (یک بررسی، آخرین کندل‌ها را می‌خواهد).
      if (rows.length < (only ? 1 : ex === first ? Math.min(50, total) : 50)) continue;
      const last = rows[rows.length - 1];
      if (now() - last.t > step * 3 + 2 * 864e5) continue;
      if (!only && Number.isFinite(coin.price) && coin.price > 0 && Math.abs(last.c / coin.price - 1) > 0.1) continue;
      markLive();
      if (!only && first !== ex) rememberVenue(sym, ex);
      return { candles: rows.slice(-total), source: ex, venue: `${EX_NAME[ex]} ${sym}/USDT`, pair: null };
    } catch (e) {
      (!(e instanceof HttpError) || e.status === 0 || e.status === 429 || e.status >= 500 ? silent : answered).push(ex);
    }
  }
  // به عنوان لیست‌نشده در هیچ‌کجا به خاطر سپرده می‌شود تنها زمانی که صرافی‌ها پاسخ داده باشند.
  // صرافی‌های HTX و OKX در پاسخی که صفحه می‌تواند بخواند می‌گویند «چنین جفت‌ارزی وجود ندارد»؛
  // پاسخ Gate.io از یک صفحه وب قابل خواندن نیست، بنابراین شبیه یک اتصال قطع‌شده به نظر می‌رسد و
  // تنها زمانی به عنوان «نه» حساب می‌شود که صرافی دیگری پاسخ داده باشد. قطع اتصال قبلاً نیز به خاطر
  const unreached = silent.some((ex) => ex !== 'gate') || (silent.length > 0 && !answered.length);
  if (!only && !unreached) rememberVenue(sym, null);
  return null;
}

async function geckoCandles(coin, interval, total) {
  const want = INTERVAL_MS[interval];
  if (!want) throw new HttpError(`بازه زمانی ناشناخته ${interval}.`, 400);

  // انتخاب دقیق‌ترین سری که اندپوینت در واقع برای این محدوده برمی‌گرداند
  const grain = want >= 864e5 ? 'daily' : 'hourly';
  const step = GECKO_STEP[grain];
  if (want < step) {
    throw new HttpError(
      `${coin.symbol || 'این ارز'} در بایننس معامله نمی‌شود، و فید قیمت پشتیبان فقط تا ${grain === 'daily' ? 'یک روز' : 'یک ساعت'} پایین می‌آید. تایم‌فریم‌های کوتاه‌تر از آن برای این ارز در دسترس نیستند — آن‌ها باید ابداع شوند.`,
      404,
    );
  }
  // API رایگان CoinGecko هر تاریخچه‌ای طولانی‌تر از ۳۶۵ روز را رد می‌کند (۴۰۱).
  const days = grain === 'daily' ? 365 : 90;
  const j = await stale(getJson(
    `${CONFIG.COINGECKO}/coins/${encodeURIComponent(coin.id)}/market_chart?vs_currency=usd&days=${days}`,
    { ttl: 5 * 60e3, key: `cg:mc:${coin.id}:${days}` },
  ));
  const pts = Array.isArray(j?.prices) ? j.prices : [];
  if (pts.length < 2) throw new HttpError('تاریخچه قیمتی برای این ارز در دسترس نیست', 404);

  const buckets = new Map();
  for (const [t, price] of pts) {
    if (!Number.isFinite(price)) continue;
    const key = Math.floor(t / want) * want;
    const b = buckets.get(key);
    if (!b) buckets.set(key, { t: key, o: price, h: price, l: price, c: price, v: 0 });
    else { b.c = price; if (price > b.h) b.h = price; if (price < b.l) b.l = price; }
  }
  const candles = [...buckets.values()].sort((a, b) => a.t - b.t).slice(-total);
  if (!candles.length) throw new HttpError('تاریخچه قیمتی برای این ارز در دسترس نیست', 404);
  return { candles, source: 'coingecko', pair: null, lowRes: true, grain, closeOnly: want === step };
}

/**
 * کندل‌هایی که پیش‌بینی روی آن‌ها تست شده است: OHLCV واقعی صرافی. خط ساعتی CoinGecko
 * (با رزولوشن پایین - lowRes) و کندل‌های دمو این‌طور نیستند، بنابراین اسکن‌ها از آن ارزها صرف‌نظر کرده
 * و تعداد صرف‌نظرشده‌ها را اعلام می‌کنند.
 */
export const isTestedSource = (r) => Boolean(r) && !r.lowRes && r.source !== 'demo';

// کندل‌هایی که پیش‌بینی (۲۰۰)، تریدر هوش مصنوعی (۲۲۰) و اندیکاتورها به آن‌ها نیاز دارند.
const MIN_HISTORY = 260;

export async function getCandles(coin, interval = '1h', total = 500) {
  const pair = typeof coin === 'string' ? coin : coin?.binance;

  // نمودارهای ثانیه‌به‌ثانیه: دریافت کندل‌های ۱ ثانیه‌ای و ادغام آن‌ها در صورت نیاز.
  if (isSecondInterval(interval)) {
    const factor = BUILT_FROM_1S[interval] || 1;
    const want = Math.min(total, MAX_BARS[interval] || 600);
    if (!pair) {
      const demoId = (typeof coin === 'object' && coin?.source === 'demo' && coin.id) || demo.demoSymbolToId(`${coin?.symbol}USDT`);
      if (demoId) { markDemo('candles'); return { candles: demo.demoCandles(demoId, interval, want), source: 'demo', pair: null }; }
      throw new HttpError('کندل‌های ثانیه‌به‌ثانیه فقط برای ارزهایی در دسترس هستند که در بایننس معامله می‌شوند.', 404);
    }
    try {
      const raw = await fetchKlines(pair, '1s', want * factor, 1200);
      if (raw.length) {
        markLive();
        const candles = factor === 1 ? raw : bucketCandles(raw, factor, 1e3);
        return { candles, source: 'binance', pair, seconds: true };
      }
    } catch { /* ادامه به سمت دمو در صورت بروز خطا */ }
    const demoId = demo.demoSymbolToId(pair);
    if (demoId) { markDemo('candles'); return { candles: demo.demoCandles(demoId, interval, want), source: 'demo', pair }; }
    throw new HttpError('کندل‌های ثانیه‌به‌ثانیه برای این جفت‌ارز در دسترس نیستند.', 404);
  }

  if (pair) {
    try {
      const ttl = interval.endsWith('m') ? 15e3 : 60e3;
      let out = [];
      let endTime = null;
      while (out.length < total) {
        const limit = Math.min(1000, total - out.length);
        const path = `/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`;
        const rows = mapKlines(await getJsonAny(CONFIG.BINANCE_REST, path, { ttl, key: `bn:${path}` }));
        if (!rows.length) break;
        out = rows.concat(out);
        endTime = rows[0].t - 1;
        if (rows.length < limit) break;
      }
      // جفت‌ارزی که مدت‌ها پیش معامله‌اش متوقف شده به عنوان غیرقابل‌دسترس در نظر گرفته می‌شود
      if (out.length && now() - out[out.length - 1].t < INTERVAL_MS[interval] * 3 + 2 * 864e5) {
        // جفت‌ارزی که بایننس اخیراً لیست کرده تاریخچه بسیار کمی برای اندیکاتورها،
        // پیش‌بینی و هوش مصنوعی دارد (مثلاً HYPE در آنجا ۵۹ کندل روزانه داشت:
        // بدون سیگنال، بدون پیش‌بینی روی 4h یا 1d). صرافی‌ای که ارز را برای مدت طولانی‌تری
        // لیست کرده باشد، کل نمودار را می‌دهد.
        if (out.length < Math.min(total, MIN_HISTORY) && coin && typeof coin === 'object') {
          const ex = await exchangeCandles(coin, interval, total).catch(() => null);
          if (ex && ex.candles.length > out.length) return ex;
        }
        markLive();
        return { candles: out, source: 'binance', pair };
      }
    } catch { /* ادامه جریان */ }
  }
  // در بایننس نیست (یا بایننس غیرقابل‌دسترس است): کندل‌های واقعی از صرافی دیگر.
  if (coin && typeof coin === 'object') {
    const ex = await exchangeCandles(coin, interval, total).catch(() => null);
    if (ex) return ex;
  }
  if (coin && typeof coin === 'object' && coin.source === 'coingecko') {
    // خطای 404 در اینجا یک پاسخ واقعی است — «این تایم‌فریم برای این ارز وجود ندارد» —
    // بنابراین پرتاب می‌شود به جای اینکه به‌آرامی با کندل‌های دمو جایگزین شود.
    try {
      return await geckoCandles(coin, interval, total);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404 && /does not trade on Binance/.test(err.message)) throw err;
    }
  }
  const demoId = (typeof coin === 'object' && coin?.source === 'demo' && coin.id) || demo.demoSymbolToId(pair || `${coin?.symbol}USDT`);
  if (demoId) {
    markDemo('candles');
    return { candles: demo.demoCandles(demoId, interval, Math.min(total, 1500)), source: 'demo', pair };
  }
  if (!pair && typeof coin === 'object' && knownVenue(coin) === null) {
    const sym = String(coin.symbol).toUpperCase();
    const err = new HttpError(`${sym} در صرافی‌های بایننس، Gate.io، HTX یا OKX (صرافی‌هایی که این برنامه می‌خواند) معامله نمی‌شود، بنابراین هیچ کندلی برای نمودار، اندیکاتورها، پیش‌بینی یا هوش مصنوعی ندارد.`, 404);
    err.notListed = true;
    throw err;
  }
  throw new HttpError('تاریخچه قیمتی برای این ارز در دسترس نیست', 404);
}

/**
 * قیمت بسته شدن (Close) کندلی که در `atMs` باز شده است، خوانده‌شده از صرافی ارز
 * در آن لحظه به جای آخرین کندل‌های آن، به طوری که یک پیش‌بینی که روزها پیش ثبت شده
 * همچنان قابل ارزیابی باشد (۵۰۰ کندل ۱ دقیقه‌ای آخر به ۸ ساعت قبل می‌رسند،
 * و ۵۰۰ کندل ۵ ثانیه‌ای به ۴۲ دقیقه پیش). `{ close }`؛
 * `{ retry: true }` هنگامی که هنوز قابل خواندن نیست (کندل در حال تشکیل است،
 * یا درخواستی با شکست مواجه شده)؛ `{ missing: true }` هنگامی که صرافی بدون آن کندل
 * پاسخ داده است (تاریخچه آن به آن اندازه به عقب نمی‌رسد، یا آن ارز را لیست نکرده است).
 */
export async function closeAtTime(coin, interval, atMs) {
  const step = INTERVAL_MS[interval];
  if (!step || !Number.isFinite(atMs)) return { missing: true };
  if (atMs + step > now()) return { retry: true };
  const inside = (t) => t <= atMs && atMs - t < step; // کندلی که atMs را در بر می‌گیرد
  try {
    const pair = typeof coin === 'string' ? coin : coin?.binance;
    if (pair) {
      // یک نمودار ثانیه‌ای از کندل‌های ۱ ثانیه‌ای ساخته می‌شود: قیمت بسته شدن آن آخرین قیمت بسته شدن ۱ ثانیه‌ای داخل آن است.
      const second = isSecondInterval(interval);
      const end = second ? atMs + step - 1e3 : atMs;
      const path = `/api/v3/klines?symbol=${pair}&interval=${second ? '1s' : interval}&endTime=${end}&limit=1`;
      const r = mapKlines(await getJsonAny(CONFIG.BINANCE_REST, path, { ttl: 864e5, key: `bn:${path}` }))[0];
      const ok = r && r.c > 0 && (second ? r.t >= atMs && r.t <= end : inside(r.t));
      return ok ? { close: r.c } : { missing: true };
    }
    if (!coin || typeof coin !== 'object' || !exCan(interval)) return { missing: true };
    const venue = await findVenue(coin);
    if (venue === null) return { missing: true };
    if (!EX_FETCH[venue]) return { retry: true };
    // نموداری که از کندل‌های ۱ ساعته ساخته شده با آخرین کندل ۱ ساعته درون آن بسته می‌شود
    if (!exBar(venue, interval) && EX_AGG[interval]) {
      const base = EX_AGG[interval].base;
      return closeAtTime(coin, base, Math.floor(atMs / step) * step + step - INTERVAL_MS[base]);
    }
    const sym = String(coin.symbol).toUpperCase(), bar = EX_BAR[venue][interval];
    let rows;
    if (venue === 'gate') {
      const to = Math.floor(atMs / 1e3), from = Math.floor((atMs - step) / 1e3) + 1;
      rows = (await getJson(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${sym}_USDT&interval=${bar}&from=${from}&to=${to}`, { ttl: 864e5, timeout: 9000 }))
        .map((r) => ({ t: r[0] * 1e3, c: num(r[2]) }));
    } else if (venue === 'okx') {
      const j = await getJson(`https://www.okx.com/api/v5/market/history-candles?instId=${sym}-USDT&bar=${bar}&after=${atMs + 1}&limit=1`, { ttl: 864e5, timeout: 9000 });
      rows = (Array.isArray(j?.data) ? j.data : []).map((r) => ({ t: num(r[0]), c: num(r[4]) }));
    } else {
      rows = await htxCandles(sym, bar, 2000, 60e3); // صرافی HTX فقط آخرین ۲۰۰۰ کندل خود را سرویس می‌دهد
    }
    const r = rows.filter((x) => inside(x.t) && x.c > 0).pop();
    return r ? { close: r.c } : { missing: true };
  } catch {
    return { retry: true };
  }
}

// تعداد اعشار قیمت که صرافی این جفت‌ارز را با آن قیمت‌گذاری می‌کند. نمایش ارقام کمتر
// به معنای قیمت گردشده‌ای است که وانمود می‌کند قیمت واقعی است، بنابراین صفحه ارز این را درخواست می‌کند.
const tickCache = new Map();
export async function getTickSize(pair) {
  if (!pair) return null;
  if (tickCache.has(pair)) return tickCache.get(pair);
  try {
    const r = await getJsonAny(CONFIG.BINANCE_REST, `/api/v3/exchangeInfo?symbol=${pair}`, { ttl: 864e5, key: `bn:info:${pair}` });
    const f = r.symbols?.[0]?.filters?.find((x) => x.filterType === 'PRICE_FILTER');
    const tick = f ? +f.tickSize : null;
    const dp = tick && tick > 0 ? Math.max(0, Math.round(-Math.log10(tick))) : null;
    tickCache.set(pair, dp);
    return dp;
  } catch { tickCache.set(pair, null); return null; }
}

export async function getDepth(pair, limit = 20) {
  try {
    const r = await getJsonAny(CONFIG.BINANCE_REST, `/api/v3/depth?symbol=${pair}&limit=${limit}`, { ttl: 2000 });
    return { bids: r.bids.map(([p, q]) => [+p, +q]), asks: r.asks.map(([p, q]) => [+p, +q]) };
  } catch { return null; }
}

export async function getTrades(pair, limit = 30) {
  try {
    const r = await getJsonAny(CONFIG.BINANCE_REST, `/api/v3/trades?symbol=${pair}&limit=${limit}`, { ttl: 2000 });
    return r.map((t) => ({ id: t.id, price: +t.price, qty: +t.qty, time: t.time, buyerMaker: t.isBuyerMaker })).reverse();
  } catch { return null; }
}

export async function getTickers24h(pairs) {
  if (!pairs.length) return {};
  try {
    const rows = await getJsonAny(CONFIG.BINANCE_REST, `/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`, { ttl: 15e3 });
    return Object.fromEntries(rows.map((r) => [r.symbol, { price: +r.lastPrice, change24h: +r.priceChangePercent, quoteVolume: +r.quoteVolume, high: +r.highPrice, low: +r.lowPrice }]));
  } catch { return {}; }
}

// ------------------------------------------------------------ کیف پول‌ها
export const CHAINS = {
  btc: { name: 'بیت‌کوین', symbol: 'BTC', pattern: /^(bc1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/ },
  eth: { name: 'اتریوم', symbol: 'ETH', pattern: /^0x[a-fA-F0-9]{40}$/ },
  bsc: { name: 'بایننس اسمارت چین', symbol: 'BNB', pattern: /^0x[a-fA-F0-9]{40}$/ },
  polygon: { name: 'پالیگان', symbol: 'POL', pattern: /^0x[a-fA-F0-9]{40}$/ },
  sol: { name: 'سولانا', symbol: 'SOL', pattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ },
};

export async function walletBalance(chain, address) {
  const def = CHAINS[chain];
  if (!def) throw new Error('شبکه پشتیبانی نمی‌شود');
  if (!def.pattern.test(address)) throw new Error(`این یک آدرس معتبر برای ${def.name} نیست`);
  if (chain === 'btc') {
    const r = await getJsonAny(CONFIG.BTC_API, `/address/${address}`, { ttl: 60e3, timeout: 12000 });
    const sats = r.chain_stats.funded_txo_sum - r.chain_stats.spent_txo_sum + r.mempool_stats.funded_txo_sum - r.mempool_stats.spent_txo_sum;
    return { balance: sats / 1e8, symbol: def.symbol, txCount: r.chain_stats.tx_count };
  }
  if (chain === 'sol') {
    const r = await postJson(CONFIG.RPC.sol, { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] });
    if (r.error) throw new Error(r.error.message);
    return { balance: r.result.value / 1e9, symbol: def.symbol };
  }
  const r = await postJson(CONFIG.RPC[chain], { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] });
  if (r.error) throw new Error(r.error.message);
  return { balance: Number(BigInt(r.result) / 10n ** 9n) / 1e9, symbol: def.symbol };
}