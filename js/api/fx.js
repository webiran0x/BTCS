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
      try {
        const r = await fetch('https://open.er-api.com/v6/latest/USD').then((x) => x.json());
        if (r.result === 'success' && r.rates) {
          // اضافه کردن نرخ تقریبی یا اتصال به API قیمت دلار/تتر برای تومان
          // فرض بر این است که نرخ دلار آزاد را می‌توان از یک منبع یا نسبت تخمین زد، 
          // یا می‌توانید نرخ تتر را به عنوان نرخ دلار آزاد در نظر بگیرید.
          // به طور پیش‌فرض برای تست، اگر نرخ آزاد در دسترس نباشد، می‌توانید مقداردهی کنید:
          
          let ratesData = r.rates;
          
          // دریافت نرخ تتر یا دلار آزاد برای تومان (می‌توانید یک API قیمت تتر بایننس یا نوبیتکس بگذارید)
          try {
            const tetherRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd').then(res => res.json());
            // به صورت جایگزین، اگر نرخ دلار آزاد را خواستید دستی یا از منبع دیگری بگیرید:
            // فرض می‌کنیم نرخ دلار در بازار ایران از طریق یک ای‌پیاِی رایگان یا نسبت محاسبه شود.
            // برای نمونه، اگر نرخ دلاری که داریم را بخواهیم به تومان تبدیل کنیم:
            // (اگر نرخ دستی دارید می‌توانید جایگزین کنید، مثلاً فرض بر این است که قیمت تتر حدود نرخ دلار آزاد است)
          } catch (e) { /* ignore */ }

          // برای اینکه تومان و ریال کار کنند، نرخ USD به IRT را اضافه می‌کنیم 
          // (توجه: چون پایه USD است، نرخ IRT برابر با قیمت یک دلار به تومان است)
          // مثلاً اگر هر دلار مثلاً مشخص باشد، یا از طریق نرخ جایگزین محاسبه شود:
          // در اینجا نرخ تتر/دلار آزاد را به عنوان نرخ پایه تومان قرار می‌دهیم (مثلاً فرض کنید از یک API نرخ ارز آزاد خوانده شود یا به صورت پیش‌فرض تنظیم شود)
          ratesData['IRT'] = ratesData['USD'] * 60000; // مقدار نمونه (بهتر است با API قیمت دلار/تتر آزاد جایگزین شود)
          ratesData['IRR'] = ratesData['IRT'] * 10;

          try { localStorage.setItem('cv:fx', JSON.stringify({ at: Date.now(), rates: ratesData })); } catch { /* ignore */ }
          return ratesData;
        }
        throw new Error('bad response');
      } catch {
        try {
          const g = await fetch(`${CONFIG.COINGECKO}/exchange_rates`).then((x) => x.json());
          const usd = g.rates?.usd?.value;
          if (usd) {
            const out = {};
            for (const [k, v] of Object.entries(g.rates)) if (v.type === 'fiat') out[k.toUpperCase()] = v.value / usd;
            
            // اضافه کردن دستی IRT و IRR بر اساس دلار
            out['IRT'] = (out['USD'] || 1) * 60000; // قیمت فرضی دلار به تومان (قابل آپدیت با API دلخواه)
            out['IRR'] = out['IRT'] * 10;

            try { localStorage.setItem('cv:fx', JSON.stringify({ at: Date.now(), rates: out })); } catch { /* ignore */ }
            return out;
          }
        } catch { /* offline */ }
        return cached?.rates || { USD: 1, IRT: 60000, IRR: 600000 };
      }
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
  
  // مدیریت ویژه برای تومان و ریال در صورت نیاز به محاسبات خاص
  let rate = code === 'USD' ? 1 : all[code];
  
  if (!rate) return false;
  fx.code = code; 
  fx.symbol = SYMBOLS[code] || `${code} `; 
  fx.rate = rate; 
  fx.updated = Date.now();
  
  settings.get().currency = code; // یا متد ذخیره‌سازی پروژه شما
  settings.set({ currency: code });
  
  if (notify) window.dispatchEvent(new CustomEvent('cv:currency', { detail: { code } }));
  return true;
}

export const toDisplay = (usdValue) => (usdValue === null || usdValue === undefined ? usdValue : usdValue * fx.rate);