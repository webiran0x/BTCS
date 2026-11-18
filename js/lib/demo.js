
// داده‌های مصنوعی بازار برای زمانی که DEMO_MODE=1 باشد یا APIهای اصلی
// در دسترس نباشند و DEMO_FALLBACK غیرفعال نشده باشد.
// قیمت‌ها بر اساس یک تابع زمانی قطعی محاسبه می‌شوند؛ بنابراین تمام
// نقاط پایانی API و بازه‌های زمانی با یکدیگر هماهنگ هستند و نمودار
// به‌صورت پیوسته حرکت می‌کند.
// تمام پاسخ‌هایی که شامل این داده‌ها هستند با demo: true مشخص می‌شوند.

const COINS = [
  ['bitcoin', 'BTC', 'بیت‌کوین', 62000, 19.7e6],
  ['ethereum', 'ETH', 'اتریوم', 3100, 120.2e6],
  ['tether', 'USDT', 'تتر', 1, 118e9, true],
  ['binancecoin', 'BNB', 'بایننس کوین', 560, 146e6],
  ['solana', 'SOL', 'سولانا', 145, 470e6],
  ['usd-coin', 'USDC', 'یو‌اس‌دی کوین', 1, 36e9, true],
  ['ripple', 'XRP', 'ریپل', 0.58, 56e9],
  ['dogecoin', 'DOGE', 'دوج‌کوین', 0.125, 146e9],
  ['cardano', 'ADA', 'کاردانو', 0.45, 35.6e9],
  ['tron', 'TRX', 'ترون', 0.13, 87e9],
  ['avalanche-2', 'AVAX', 'آوالانچ', 28, 406e6],
  ['shiba-inu', 'SHIB', 'شیبا اینو', 0.0000185, 589e12],
  ['chainlink', 'LINK', 'چین‌لینک', 13.5, 608e6],
  ['polkadot', 'DOT', 'پولکادات', 5.9, 1.45e9],
  ['bitcoin-cash', 'BCH', 'بیت‌کوین کش', 380, 19.7e6],
  ['near', 'NEAR', 'نیر پروتکل', 5.1, 1.1e9],
  ['litecoin', 'LTC', 'لایت‌کوین', 72, 75e6],
  ['uniswap', 'UNI', 'یونی‌سواپ', 8.2, 600e6],
  ['aptos', 'APT', 'آپتوس', 8.8, 480e6],
  ['internet-computer', 'ICP', 'اینترنت کامپیوتر', 9.1, 468e6],
  ['stellar', 'XLM', 'استلار', 0.1, 29e9],
  ['cosmos', 'ATOM', 'کازموس هاب', 6.6, 390e6],
  ['filecoin', 'FIL', 'فایل‌کوین', 4.2, 590e6],
  ['arbitrum', 'ARB', 'آربیتروم', 0.75, 3.3e9],
  ['optimism', 'OP', 'آپتیمیسم', 1.7, 1.2e9],
  ['injective-protocol', 'INJ', 'اینجکتیو', 21, 97e6],
  ['render-token', 'RENDER', 'رندر', 6.4, 388e6],
  ['sui', 'SUI', 'سویی', 1.05, 2.7e9],
  ['pepe', 'PEPE', 'پپه', 0.0000092, 420e12],
  ['the-graph', 'GRT', 'گراف', 0.19, 9.5e9],
  ['aave', 'AAVE', 'آوه', 115, 14.8e6],
  ['algorand', 'ALGO', 'الگوراند', 0.16, 8.2e9],
  ['fantom', 'FTM', 'فانتوم', 0.55, 2.8e9],
  ['hedera-hashgraph', 'HBAR', 'هدرا', 0.07, 35e9],
  ['vechain', 'VET', 'وی‌چین', 0.026, 81e9],
  ['maker', 'MKR', 'میکر', 1900, 0.9e6],
  ['the-sandbox', 'SAND', 'سندباکس', 0.32, 2.3e9],
  ['decentraland', 'MANA', 'دسنترالند', 0.34, 1.9e9],
  ['axie-infinity', 'AXS', 'اکسی اینفینیتی', 5.4, 150e6],
  ['floki', 'FLOKI', 'فلوکی', 0.00014, 9.5e12],
];

// فهرست صرافی‌های شبیه‌سازی‌شده
export const DEMO_EXCHANGES = [
  'بایننس',
  'کوین‌بیس',
  'کراکن',
  'او‌کی‌ایکس',
  'بای‌بیت',
  'کوکوین',
  'گیت',
];

// تولید عدد شبه‌تصادفی قطعی بر اساس ورودی
function hash(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// تولید مقدار اولیه از رشته ورودی
function seedOf(str) {
  let h = 2166136261;
  for (const ch of str) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return h;
}

// تولید نویز نرم در محدوده منفی یک تا مثبت یک
function noise(x, seed) {
  const i = Math.floor(x);
  const f = x - i;

  const a = hash(i * 374761393 + seed) * 2 - 1;
  const b = hash((i + 1) * 374761393 + seed) * 2 - 1;

  const u = f * f * (3 - 2 * f);

  return a + (b - a) * u;
}

// تولید مقدار تصادفی با توزیع نرمال استاندارد
// با استفاده از دو مقدار هش
function gauss(n, seed) {
  const u1 = Math.max(hash(n * 2654435761 + seed), 1e-12);
  const u2 = hash(n * 40503 + seed * 7 + 1);

  return Math.sqrt(-2 * Math.log(u1)) *
    Math.cos(2 * Math.PI * u2);
}

// زمان‌های مرجع محاسبات
const ORIGIN = Date.UTC(2015, 0, 1);
const REF = Date.UTC(2026, 0, 1);
const DAY = 864e5;

// ذخیره مسیر تغییرات روزانه قیمت هر ارز
const walks = new Map();

// شبیه‌سازی تغییرات روزانه قیمت با روند متغیر
// برای ایجاد رفتار مشابه بازار واقعی، شامل روند صعودی، نزولی و نوسان
function dailyWalk(id, upto) {
  let w = walks.get(id);

  if (w && w.length > upto + 1) return w;

  const len = upto + 400;
  const seed = seedOf(id);
  const vol = id === 'bitcoin' ? 0.028 : 0.04;

  const arr = new Float64Array(len);
  let drift = 0;

  const btc = id === 'bitcoin'
    ? null
    : dailyWalk('bitcoin', len);

  for (let d = 1; d < len; d++) {
    drift =
      0.985 * drift +
      0.015 * gauss(d, seed + 99) * 0.012;

    const own = drift + vol * gauss(d, seed);

    arr[d] = arr[d - 1] + (
      btc
        ? 0.75 * (btc[d] - btc[d - 1]) * 1.2 + 0.6 * own
        : own
    );
  }

  walks.set(id, arr);

  return arr;
}

// درون‌یابی پل براونی بین دو نقطه
// برای تولید تغییرات طبیعی قیمت در بازه‌های زمانی کوچک‌تر
function bridge(a, b, steps, pos, seed, sigma) {
  const j = Math.floor(pos);
  const f = pos - j;

  let sj = 0;
  let sj1 = 0;
  let total = 0;

  for (let k = 1; k <= steps; k++) {
    const z = gauss(k, seed) * sigma;

    total += z;

    if (k <= j) sj += z;
    if (k <= j + 1) sj1 += z;
  }

  const at = (idx, cum) =>
    a +
    (b - a) * (idx / steps) +
    (cum - (total * idx) / steps);

  const v0 = at(j, sj);

  const v1 = j + 1 <= steps
    ? at(j + 1, sj1)
    : v0;

  return v0 + (v1 - v0) * f;
}

// محاسبه قیمت شبیه‌سازی‌شده ارز دیجیتال در زمان مشخص
export function demoPrice(id, t) {
  const coin = COINS.find((c) => c[0] === id);

  if (!coin) return null;

  // قیمت استیبل‌کوین‌ها نزدیک به یک دلار باقی می‌ماند
  if (coin[5]) {
    return 1 + noise(t / 36e5, seedOf(id)) * 0.0008;
  }

  const seed = seedOf(id);

  const x = Math.max(0, (t - ORIGIN) / DAY);
  const d = Math.floor(x);

  const refDay = Math.floor((REF - ORIGIN) / DAY);

  const w = dailyWalk(
    id,
    Math.max(d + 2, refDay + 2)
  );

  const vol = id === 'bitcoin' ? 0.028 : 0.04;

  // تغییرات قیمت در طول روز: درون‌یابی ساعتی
  // تغییرات قیمت در طول ساعت: درون‌یابی پنج‌دقیقه‌ای
  const hourPos = (x - d) * 24;

  const hA = bridge(
    w[d],
    w[d + 1],
    24,
    Math.floor(hourPos),
    seed + d * 31,
    vol / Math.sqrt(24)
  );

  const hB = bridge(
    w[d],
    w[d + 1],
    24,
    Math.min(24, Math.floor(hourPos) + 1),
    seed + d * 31,
    vol / Math.sqrt(24)
  );

  const mPos =
    (hourPos - Math.floor(hourPos)) * 12;

  const hourIdx = d * 24 + Math.floor(hourPos);

  const lg = bridge(
    hA,
    hB,
    12,
    mPos,
    seed + hourIdx * 17,
    vol / Math.sqrt(288)
  );

  return coin[3] * Math.exp(lg - w[refDay]);
}

// بازه‌های زمانی قابل استفاده برای نمودار
const INTERVAL_MS = {
  '1m': 6e4,
  '3m': 18e4,
  '5m': 3e5,
  '15m': 9e5,
  '30m': 18e5,
  '1h': 36e5,
  '2h': 72e5,
  '4h': 144e5,
  '6h': 216e5,
  '12h': 432e5,
  '1d': 864e5,
  '3d': 2592e5,
  '1w': 6048e5,
};

// تولید کندل‌های شبیه‌سازی‌شده بازار
export function demoCandles(
  id,
  interval = '1h',
  limit = 500,
  endTime = Date.now()
) {
  const step = INTERVAL_MS[interval] || 36e5;

  const lastOpen = Math.floor(endTime / step) * step;

  const out = [];

  const coin = COINS.find((c) => c[0] === id);

  const baseVol = coin
    ? coin[3] * (coin[4] / 4000)
    : 1e6;

  for (let k = limit - 1; k >= 0; k--) {
    const t0 = lastOpen - k * step;
    const t1 = Math.min(t0 + step, endTime);

    const samples = 10;

    let h = -Infinity;
    let l = Infinity;

    // قیمت آغازین کندل
    const o = demoPrice(id, t0);

    // محاسبه بیشترین و کمترین قیمت در طول کندل
    for (let s = 0; s <= samples; s++) {
      const p = demoPrice(
        id,
        t0 + ((t1 - t0) * s) / samples
      );

      h = Math.max(h, p);
      l = Math.min(l, p);
    }

    // قیمت پایانی کندل
    const c = demoPrice(id, t1);

    // ایجاد نوسان جزئی برای طبیعی‌تر شدن نمودار
    const wig =
      1 + hash(t0 / step + seedOf(id)) * 0.002;

    // محاسبه حجم معاملات شبیه‌سازی‌شده
    const vol = (
      baseVol *
      (step / 36e5) *
      (
        0.5 +
        hash(t0 / step * 13 + seedOf(id)) +
        Math.abs(c - o) / o * 60
      )
    ) / (coin ? coin[3] : 1);

    out.push({
      t: t0,
      o,
      h: h * wig,
      l: l / wig,
      c,
      v: vol,
    });
  }

  return out;
}

// تبدیل نماد معاملاتی به شناسه ارز
export function demoSymbolToId(symbol) {
  const base = symbol.replace(/USDT$/, '');

  return COINS.find((c) => c[1] === base)?.[0] || null;
}

// دریافت فهرست کامل بازارهای شبیه‌سازی‌شده
export function demoMarkets(now = Date.now()) {
  return COINS.map((c, idx) => {
    const [id, sym, name, , supply] = c;

    const price = demoPrice(id, now);

    const ago = (ms) =>
      demoPrice(id, now - ms);

    // داده‌های نمودار کوچک تغییرات قیمت
    const spark = [];

    for (let h = 167; h >= 0; h--) {
      spark.push(demoPrice(id, now - h * 36e5));
    }

    // ارزش کل بازار
    const mcap = price * supply;

    return {
      id,
      symbol: sym.toLowerCase(),
      name,
      image: null,
      rank: idx + 1,

      price,
      marketCap: mcap,

      volume24h:
        mcap * (0.02 + hash(idx * 31) * 0.08),

      change1h:
        (price / ago(36e5) - 1) * 100,

      change24h:
        (price / ago(864e5) - 1) * 100,

      change7d:
        (price / ago(7 * 864e5) - 1) * 100,

      high24h: price * 1.02,
      low24h: price * 0.98,

      circulatingSupply: supply,
      sparkline: spark,

      ath: price * 1.6,
    };
  })
    .sort((a, b) => b.marketCap - a.marketCap)
    .map((m, i) => ({
      ...m,
      rank: i + 1,
    }));
}

// دریافت آمار کلی بازار ارزهای دیجیتال
export function demoGlobal() {
  const m = demoMarkets();

  const total =
    m.reduce((s, c) => s + c.marketCap, 0) * 1.12;

  const btc = m.find((c) => c.id === 'bitcoin');
  const eth = m.find((c) => c.id === 'ethereum');

  return {
    totalMarketCap: total,

    totalVolume:
      m.reduce((s, c) => s + c.volume24h, 0) * 1.3,

    btcDominance:
      (btc.marketCap / total) * 100,

    ethDominance:
      (eth.marketCap / total) * 100,

    marketCapChange24h:
      m.slice(0, 10)
        .reduce((s, c) => s + c.change24h, 0) / 10,

    activeCryptocurrencies: 14000,
    markets: 1100,
  };
}

// تولید تاریخچه ۳۰ روزه شاخص ترس و طمع
export function demoFearGreed() {
  const now = Date.now();
  const data = [];

  for (let d = 0; d < 30; d++) {
    const v = Math.round(
      50 + noise(
        (now - d * 864e5) / (6 * 864e5),
        42
      ) * 40
    );

    data.push({
      value: v,
      classification: classifyFng(v),
      timestamp: Math.floor(
        (now - d * 864e5) / 1000
      ),
    });
  }

  return data;
}

// تعیین وضعیت شاخص ترس و طمع بر اساس مقدار عددی
export function classifyFng(v) {
  return v <= 24
    ? 'ترس شدید'
    : v <= 44
      ? 'ترس'
      : v <= 55
        ? 'خنثی'
        : v <= 75
          ? 'طمع'
          : 'طمع شدید';
}

// دریافت اطلاعات تکمیلی یک ارز دیجیتال
export function demoCoinDetail(id) {
  const m = demoMarkets().find((c) => c.id === id);

  if (!m) return null;

  return {
    ...m,

    description:
      `${m.name} — پروفایل آزمایشی. برای دریافت توضیحات واقعی، لینک‌ها و اطلاعات عرضه، اتصال برنامه به اینترنت و منابع داده زنده ضروری است.`,

    homepage: null,
    genesisDate: null,
    categories: ['آزمایشی'],

    totalSupply: m.circulatingSupply,
    maxSupply: null,
    fdv: m.marketCap,

    atl: m.price * 0.1,
    athDate: null,

    links: {},
  };
}

// تولید قیمت‌های خرید و فروش شبیه‌سازی‌شده در صرافی‌ها
export function demoExchangeQuotes(base) {
  const id = COINS.find(
    (c) => c[1] === base.toUpperCase()
  )?.[0];

  if (!id) return [];

  const now = Date.now();
  const p = demoPrice(id, now);

  return DEMO_EXCHANGES.map((ex, i) => {
    const drift =
      (hash(Math.floor(now / 5000) + i * 97) - 0.5) *
      0.0024;

    const price = p * (1 + drift);

    const spread =
      price * (0.0001 + hash(i * 11) * 0.0004);

    return {
      exchange: ex,
      pair: `${base}/USDT`,

      price,
      bid: price - spread / 2,
      ask: price + spread / 2,

      volume24hUsd:
        p * 1e3 * (8 - i) * 1e3 * (1 + hash(i)),

      ok: true,
    };
  });
}

// جست‌وجوی ارزهای دیجیتال بر اساس نام، نماد یا شناسه
export function demoSearch(q) {
  const s = q.toLowerCase();

  return COINS
    .filter((c) =>
      c[0].includes(s) ||
      c[1].toLowerCase().includes(s) ||
      c[2].toLowerCase().includes(s)
    )
    .slice(0, 10)
    .map((c) => ({
      id: c[0],
      symbol: c[1],
      name: c[2],
      thumb: null,
      rank: COINS.indexOf(c) + 1,
    }));
}

// دریافت ۷ ارز دارای بیشترین رشد قیمت در ۲۴ ساعت گذشته
export function demoTrending() {
  return demoMarkets()
    .filter((c) =>
      !['tether', 'usd-coin'].includes(c.id)
    )
    .sort((a, b) =>
      b.change24h - a.change24h
    )
    .slice(0, 7)
    .map((c) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      thumb: null,
      rank: c.rank,
      price: c.price,
      change24h: c.change24h,
    }));
}

// فهرست نمادهای معاملاتی قابل استفاده در بازار آزمایشی USDT
export const DEMO_USDT_SYMBOLS = COINS
  .filter((c) => !c[5])
  .map((c) => `${c[1]}USDT`);

// فهرست شناسه تمام ارزهای دیجیتال پشتیبانی‌شده در حالت آزمایشی
export const DEMO_IDS = COINS.map((c) => c[0]);
