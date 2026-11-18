// Display currency: everything is priced in USD upstream and converted here.
import { CONFIG } from '../config.js';
import { settings } from '../store.js';

export const fx = { code: 'IRT', symbol: 'تومان', rate: 1, updated: 0 };

const SYMBOLS = Object.fromEntries(CONFIG.CURRENCIES.map(([c, s]) => [c, s]));
export const currencyName = (code) => CONFIG.CURRENCIES.find((c) => c[0] === code)?.[2] || code;

let ratesPromise = null;
export function rates() {
  if (!ratesPromise) {
    ratesPromise = (async () => {
      const cached = (() => { try { return JSON.parse(localStorage.getItem('cv:fx') || 'null'); } catch { return null; } })();
      if (cached && Date.now() - cached.at < 6 * 3600e3) return cached.rates;

      let ratesData = { USD: 1 };

      // ۱. دریافت نرخ ارزهای جهانی
      try {
        const r = await fetch('https://open.er-api.com/v6/latest/USD').then((x) => x.json());
        if (r.result === 'success' && r.rates) {
          ratesData = r.rates;
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

      // ۲. دریافت قیمت تتر از کوین‌گکو و ضرب در ضریب 3.85 برای تومان
      try {
        const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=irr,usd').then((x) => x.json());
        if (cgRes && cgRes.tether && cgRes.tether.irr) {
          const tetherIrr = cgRes.tether.irr;
          const tetherToman = (tetherIrr / 10) * 3.85; // اعمال ضریب 3.85 درخواست شده
          
          if (tetherToman > 0) {
            ratesData['IRT'] = tetherToman;
            ratesData['IRR'] = tetherToman * 10;
          }
        }
      } catch (err) {
        console.warn('Failed to fetch market rate, using fallback', err);
      }

      // حالت پشتیبان اگر نرخ بازار آزاد دریافت نشد
      if (!ratesData['IRT'] || ratesData['IRT'] < 10000) {
        const fallbackToman = 70000 * 3.85;
        ratesData['IRT'] = cached?.rates?.IRT || fallbackToman;
        ratesData['IRR'] = ratesData['IRT'] * 10;
      }

      try { 
        localStorage.setItem('cv:fx', JSON.stringify({ at: Date.now(), rates: ratesData })); 
      } catch { /* ignore */ }

      return ratesData;
    })();
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
