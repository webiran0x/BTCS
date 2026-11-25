// Display currency: everything is priced in USD upstream and converted here.
import { CONFIG } from '../config.js';
import { settings } from '../store.js';

export const fx = { code: 'IRT', symbol: 'تومان', rate: 1, updated: 0 };

const SYMBOLS = Object.fromEntries(CONFIG.CURRENCIES.map(([c, s]) => [c, s]));
export const currencyName = (code) => CONFIG.CURRENCIES.find((c) => c[0] === code)?.[2] || code;

const FX_CACHE_KEY = 'cv:fx';
const QUOTA_KEY = 'cv:navasan:quota';
const LOCK_KEY = 'cv:navasan:lock';

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function readQuota() {
  const mk = currentMonthKey();
  try {
    const raw = JSON.parse(localStorage.getItem(QUOTA_KEY) || 'null');
    if (raw && raw.month === mk && Number.isFinite(+raw.count)) {
      return { month: mk, count: +raw.count };
    }
  } catch { /* ignore */ }
  return { month: mk, count: 0 };
}

function incrementQuota() {
  const q = readQuota();
  const next = { month: q.month, count: q.count + 1 };
  try {
    localStorage.setItem(QUOTA_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  return next;
}

function canCallNavasan() {
  const limit = CONFIG.NAVASAN_MONTHLY_QUOTA ?? 120;
  const q = readQuota();
  return q.count < limit;
}

function acquireNavasanLock(ttlMs = 15000) {
  const now = Date.now();
  try {
    const raw = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
    if (raw && raw.until > now) return false;
    localStorage.setItem(LOCK_KEY, JSON.stringify({ until: now + ttlMs }));
    return true;
  } catch {
    return true;
  }
}

function releaseNavasanLock() {
  try { localStorage.removeItem(LOCK_KEY); } catch { /* ignore */ }
}

async function fetchNavasanTomanRate() {
  const apiKey = CONFIG.NAVASAN_API_KEY;
  const baseUrl = (CONFIG.NAVASAN_URL || 'https://api.navasan.tech').replace(/\/+$/, '');
  const item = CONFIG.NAVASAN_ITEM || 'usdt';
  if (!apiKey || !canCallNavasan()) return null;

  if (!acquireNavasanLock()) {
    await new Promise((r) => setTimeout(r, 800));
    return null;
  }

  try {
    if (!canCallNavasan()) return null;

    const url = `${baseUrl}/latest/?api_key=${encodeURIComponent(apiKey)}&item=${encodeURIComponent(item)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;

    const data = await res.json();
    const entry = data?.[item] || data?.usdt || data?.usd_sell || null;
    const rawVal = entry?.value ?? entry?.dollar_rate;
    const parsed = Number(String(rawVal ?? '').replace(/,/g, '').trim());

    if (Number.isFinite(parsed) && parsed > 0) {
      incrementQuota();
      return parsed;
    }
    return null;
  } catch {
    return null;
  } finally {
    releaseNavasanLock();
  }
}

let ratesPromise = null;
export function rates() {
  if (!ratesPromise) {
    ratesPromise = (async () => {
      const ttl = CONFIG.NAVASAN_TTL_MS || 6 * 3600e3;
      const cached = (() => {
        try { return JSON.parse(localStorage.getItem(FX_CACHE_KEY) || 'null'); } catch { return null; }
      })();

      if (cached && cached.rates && Date.now() - cached.at < ttl) {
        return cached.rates;
      }

      let ratesData = cached?.rates ? { ...cached.rates } : { USD: 1 };

      // ۱. دریافت نرخ ارزهای جهانی
      try {
        const r = await fetch('https://open.er-api.com/v6/latest/USD').then((x) => x.json());
        if (r.result === 'success' && r.rates) {
          ratesData = { ...r.rates };
        }
      } catch {
        try {
          const g = await fetch(`${CONFIG.COINGECKO}/exchange_rates`).then((x) => x.json());
          const usd = g.rates?.usd?.value;
          if (usd) {
            for (const [k, v] of Object.entries(g.rates)) {
              if (v.type === 'fiat') ratesData[k.toUpperCase()] = v.value / usd;
            }
          }
        } catch { /* آفلاین */ }
      }

      // ۲. دریافت نرخ تتر/دلار از نوسان با رعایت سقف ۱۲۰ درخواست در ماه
      let resolvedToman = await fetchNavasanTomanRate();

      // ۳. پشتیبان کوین‌گکو اگر نوسان در دسترس نبود یا سهمیه ماهانه تمام شده بود
      if (!resolvedToman) {
        try {
          const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=irr,usd').then((x) => x.json());
          if (cgRes?.tether?.irr) {
            const tetherIrr = cgRes.tether.irr;
            const tetherToman = (tetherIrr / 10) * 3.85;
            if (tetherToman > 0) resolvedToman = tetherToman;
          }
        } catch (err) {
          console.warn('Failed to fetch market rate, using fallback', err);
        }
      }

      if (resolvedToman && resolvedToman > 0) {
        ratesData['IRT'] = resolvedToman;
        ratesData['IRR'] = resolvedToman * 10;
      } else if (!ratesData['IRT'] || ratesData['IRT'] < 10000) {
        const fallbackToman = 70000 * 3.85;
        ratesData['IRT'] = cached?.rates?.IRT || fallbackToman;
        ratesData['IRR'] = ratesData['IRT'] * 10;
      }

      try {
        localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ at: Date.now(), rates: ratesData }));
      } catch { /* ignore */ }

      return ratesData;
    })().finally(() => {
      ratesPromise = null;
    });
  }
  return ratesPromise;
}

export async function initCurrency() {
  const code = settings.get().currency || 'IRT';
  await setCurrency(code, false);
}

export async function setCurrency(code, notify = true) {
  const all = await rates();
  const rate = code === 'USD' ? 1 : all[code];
  if (!rate) return false;

  fx.code = code;
  fx.symbol = SYMBOLS[code] || `${code} `;
  fx.rate = rate;
  fx.updated = Date.now();

  settings.set({ currency: code });

  if (notify) window.dispatchEvent(new CustomEvent('cv:currency', { detail: { code } }));
  return true;
}

export const toDisplay = (usdValue) => (usdValue === null || usdValue === undefined ? usdValue : usdValue * fx.rate);