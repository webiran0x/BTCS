// Display currency: everything is priced in USD upstream and converted here.

// /Users/work/Downloads/BTCSir/js/api/fx.js
import { CONFIG } from '../config.js';
import { settings } from '../store.js';

export const fx = { code: 'USD', symbol: '$', rate: 1, updated: 0 };

const SYMBOLS = Object.fromEntries(CONFIG.CURRENCIES.map(([c, s]) => [c, s]));
export const currencyName = (code) => CONFIG.CURRENCIES.find((c) => c[0] === code)?.[2] || code;

let ratesPromise = null;
export function rates() {
  if (!ratesPromise) {
    ratesPromise = (async () => {
      const cached = (() => { try { return JSON.parse(localStorage.getItem('cv:fx') || 'null'); } catch { return null; } })();
      if (cached && Date.now() - cached.at < 6 * 3600e3) return cached.rates;

      let ratesData = { USD: 1 };

      // ۱. دریافت نرخ ارزهای جهانی (دلار، یورو و غیره)
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

      // ۲. دریافت نرخ دقیق تومان و ریال از API عمومی نوبیتکس (بر اساس قیمت تتر در بازار تومان)
      try {
        // مطابق مستندات نوبیتکس، اطلاعات عمومی بازار (مانند تتر به تومان: usdtirt) نیاز به کلید و امضا ندارد
        const nobitexRes = await fetch('https://api.nobitex.ir/v2/orderbook/USDTIRT').then((x) => x.json());
        
        if (nobitexRes && nobitexRes.status === 'ok' && nobitexRes.lastTradePrice) {
          // قیمت آخرین معامله تتر به تومان در نوبیتکس
          const usdtToman = parseFloat(nobitexRes.lastTradePrice);
          
          if (usdtToman > 0) {
            // از آنجایی که پایه سیستم USD است، نرخ IRT برابر با قیمت یک دلار/تتر به تومان خواهد بود
            ratesData['IRT'] = usdtToman;
            ratesData['IRR'] = usdtToman * 10; // هر تومان معادل ۱۰ ریال است
          }
        }
      } catch (err) {
        // اگر ارتباط با نوبیتکس برقرار نشد یا خطا داد، از مقدار ذخیره‌شده قبلی یا مقدار پیش‌فرض استفاده می‌کنیم
        ratesData['IRT'] = cached?.rates?.IRT || 70000;
        ratesData['IRR'] = cached?.rates?.IRR || 700000;
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
  const code = settings.get().currency || 'USD';
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