
/**
 * سیستم مدیریت و تبدیل واحد پول
 *
 * تمام قیمت‌های دریافتی از API بر اساس USD هستند.
 * تبدیل ارز فقط در لایه نمایش انجام می‌شود.
 *
 * واحد پول پیش‌فرض: تومان ایران (IRT)
 * واحد داخلی محاسبات: USD
 */

import { CONFIG } from '../config.js';
import { settings } from '../store.js';

// --------------------------------------------------
// تنظیمات اولیه واحد پول
// --------------------------------------------------

const DEFAULT_CURRENCY = 'IRT';

export const fx = {
  code: DEFAULT_CURRENCY,
  symbol: 'تومان',
  rate: 1,
  updated: 0,
};

// نمادهای واحدهای پولی
const SYMBOLS = Object.fromEntries(
  CONFIG.CURRENCIES.map(([code, symbol]) => [code, symbol])
);

// اطمینان از وجود نماد تومان و ریال
SYMBOLS.IRT = 'تومان';
SYMBOLS.IRR = 'ریال';

// نام کامل واحد پول
export const currencyName = (code) =>
  CONFIG.CURRENCIES.find((c) => c[0] === code)?.[2] ||
  (code === 'IRT' ? 'تومان ایران' : code === 'IRR' ? 'ریال ایران' : code);

// --------------------------------------------------
// مدیریت نرخ ارزها
// --------------------------------------------------

let ratesPromise = null;

export function rates() {
  if (!ratesPromise) {
    ratesPromise = (async () => {

      // دریافت اطلاعات ذخیره‌شده نرخ ارز
      const cached = (() => {
        try {
          return JSON.parse(
            localStorage.getItem('cv:fx') || 'null'
          );
        } catch {
          return null;
        }
      })();

      // اعتبار کش: ۶ ساعت
      if (
        cached?.rates &&
        Date.now() - cached.at < 6 * 3600e3
      ) {
        return cached.rates;
      }

      // نرخ پایه دلار
      let ratesData = { USD: 1 };

      // --------------------------------------------------
      // ۱. دریافت نرخ ارزهای جهانی
      // --------------------------------------------------

      try {
        const response = await fetch(
          'https://open.er-api.com/v6/latest/USD'
        );

        const result = await response.json();

        if (result.result === 'success' && result.rates) {
          ratesData = {
            ...ratesData,
            ...result.rates,
          };
        }

      } catch {
        // در صورت خطا، استفاده از منبع جایگزین
        try {
          const response = await fetch(
            `${CONFIG.COINGECKO}/exchange_rates`
          );

          const result = await response.json();

          const usd = result.rates?.usd?.value;

          if (usd) {
            for (const [key, value] of Object.entries(result.rates)) {
              if (value.type === 'fiat') {
                ratesData[key.toUpperCase()] =
                  value.value / usd;
              }
            }
          }

        } catch {
          // عدم دسترسی به اینترنت
        }
      }

      // --------------------------------------------------
      // ۲. دریافت نرخ تتر و محاسبه نرخ تومان
      // --------------------------------------------------

      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=irr,usd'
        );

        const result = await response.json();

        const tetherIrr = result?.tether?.irr;

        if (tetherIrr > 0) {

          // تبدیل ریال به تومان
          const tetherToman = (tetherIrr / 10) * 3.85;

          if (tetherToman > 0) {
            ratesData.IRT = tetherToman;
            ratesData.IRR = tetherToman * 10;
          }
        }

      } catch (error) {
        console.warn(
          'دریافت نرخ بازار آزاد ناموفق بود؛ استفاده از نرخ جایگزین',
          error
        );
      }

      // --------------------------------------------------
      // ۳. نرخ جایگزین تومان
      // --------------------------------------------------

      if (
        !ratesData.IRT ||
        !Number.isFinite(ratesData.IRT) ||
        ratesData.IRT < 10000
      ) {

        // نرخ جایگزین بر اساس ضریب تنظیم‌شده
        const fallbackToman = 70000 * 3.85;

        ratesData.IRT =
          cached?.rates?.IRT > 0
            ? cached.rates.IRT
            : fallbackToman;

        ratesData.IRR = ratesData.IRT * 10;
      }

      // اطمینان از معتبر بودن نرخ پایه دلار
      ratesData.USD = 1;

      // --------------------------------------------------
      // ۴. ذخیره نرخ‌ها در حافظه محلی
      // --------------------------------------------------

      try {
        localStorage.setItem(
          'cv:fx',
          JSON.stringify({
            at: Date.now(),
            rates: ratesData,
          })
        );
      } catch {
        // نادیده گرفتن خطای ذخیره‌سازی
      }

      return ratesData;

    })().catch((error) => {
      // جلوگیری از باقی ماندن Promise ناموفق
      ratesPromise = null;
      throw error;
    });
  }

  return ratesPromise;
}

// --------------------------------------------------
// مقداردهی اولیه واحد پول
// --------------------------------------------------

export async function initCurrency() {

  // پیش‌فرض جدید برای تمام کاربران: تومان
  const code = DEFAULT_CURRENCY;

  await setCurrency(code, false);

}

// --------------------------------------------------
// تغییر واحد پول
// --------------------------------------------------

export async function setCurrency(code, notify = true) {

  const all = await rates();

  // بررسی اعتبار واحد پول انتخاب‌شده
  const rate = code === 'USD' ? 1 : all[code];

  if (
    !rate ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    return false;
  }

  // به‌روزرسانی واحد پول فعال
  fx.code = code;

  fx.symbol = SYMBOLS[code] || `${code} `;

  fx.rate = rate;

  fx.updated = Date.now();

  // ذخیره تنظیمات کاربر
  settings.set({
    currency: code,
  });

  // اطلاع‌رسانی به سایر بخش‌های برنامه
  if (notify) {
    window.dispatchEvent(
      new CustomEvent('cv:currency', {
        detail: { code },
      })
    );
  }

  return true;
}

// --------------------------------------------------
// تبدیل قیمت دلار به واحد پول انتخاب‌شده
// --------------------------------------------------

export const toDisplay = (usdValue) => {

  if (
    usdValue === null ||
    usdValue === undefined
  ) {
    return usdValue;
  }

  const value = Number(usdValue);

  if (!Number.isFinite(value)) {
    return usdValue;
  }

  return value * fx.rate;
};

// --------------------------------------------------
// فرمت نمایش قیمت بر اساس واحد پول فعال
// --------------------------------------------------

export function formatCurrency(
  usdValue,
  options = {}
) {

  const value = toDisplay(usdValue);

  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return '—';
  }

  const maximumFractionDigits =
    options.maximumFractionDigits ??
    (fx.code === 'IRT' ? 0 : 2);

  const minimumFractionDigits =
    options.minimumFractionDigits ?? 0;

  const formatted = new Intl.NumberFormat(
    'fa-IR',
    {
      maximumFractionDigits,
      minimumFractionDigits,
    }
  ).format(value);

  return `${formatted} ${fx.symbol}`;
}
