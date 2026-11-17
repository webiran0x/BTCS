import { fx } from './api/fx.js';
import { now } from './api/clock.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * آدرسی از خارج برنامه (فید خبری، CoinGecko، یا سرور) که برای قرارگیری در href/src ایمن‌سازی می‌شود:
 * تنها آدرس‌های مطلق https:// (یا مسیرهای داخلی #/) مجاز هستند تا اسکریپت‌های مخرب مانند javascript: یا data:
 * وارد نشوند. سایر موارد به مقدار fallback تبدیل می‌شوند.
 */
export function safeUrl(u, fallback = '') {
  const s = String(u ?? '').trim();
  if (!s || s.length > 2048) return fallback;
  if (/^#\/[A-Za-z0-9/_.-]*$/.test(s)) return s;
  try {
    const url = new URL(s);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : fallback;
  } catch { return fallback; }
}

/** یک عدد متناهی، یا مقدار fallback برای null، NaN، بی‌نهایت و رشته‌های غیرعددی. */
export const finite = (v, fallback = null) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return fallback;
  const n = +v;
  return Number.isFinite(n) ? n : fallback;
};

export function price(v) {
  if (v === null || v === undefined || !Number.isFinite(+v)) return '—';
  v = +v;
  const a = Math.abs(v);
  // تعداد اعشار بر اساس بزرگی عدد تنظیم می‌شود: در قیمت‌های بالای ۱۰۰ دلار سنت‌ها مهم هستند،
  // اما در قیمت‌های کوچک‌تر دقت اعشار تا ۴ تا ۱۰ رقم افزایش می‌یابد.
  if (a >= 100) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (a >= 1) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (a === 0) return '0.00';
  const digits = Math.min(10, Math.max(4, -Math.floor(Math.log10(a)) + 3));
  return v.toFixed(digits).replace(/(\.\d*?[1-9])0+$/, '$1');
}

// نمایش مبلغ در ارز انتخابی کاربر (مقادیر ورودی بر حسب دلار آمریکا هستند).
export function money(v, { showCode = false, dp } = {}) {
  if (v === null || v === undefined || !Number.isFinite(+v)) return '—';
  const converted = +v * fx.rate;
  // پارامتر dp دقت اعشار (Tick Size) صرافی برای این جفت‌ارز است تا قیمت بدون گرد کردن اضافی نمایش داده شود.
  const digits = dp === undefined || converted === 0 ? Infinity : Math.floor(Math.log10(Math.abs(converted))) + dp + 1;
  const text = dp === undefined || digits < 3
    ? price(converted)
    : converted.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${fx.symbol}${text}${showCode && fx.code !== 'USD' ? ` ${fx.code}` : ''}`;
}

// معادل money برای خوانایی بیشتر در محل فراخوانی
export const usd = (v) => money(v);

export function compact(v, prefix = '$') {
  if (v === null || v === undefined || !Number.isFinite(+v)) return '—';
  // علامت '$' به معنای مبلغ پولی است و به ارز نمایشی کاربر تبدیل می‌شود.
  const isMoney = prefix === '$';
  const value = isMoney ? +v * fx.rate : +v;
  const sign = isMoney ? fx.symbol : prefix;
  const a = Math.abs(value);
  const f = (x, suffix) => `${sign}${x.toLocaleString('en-US', { maximumFractionDigits: x >= 100 ? 1 : 2 })} ${suffix}`;
  if (a >= 1e12) return f(value / 1e12, 'تریلیون');
  if (a >= 1e9) return f(value / 1e9, 'میلیارد');
  if (a >= 1e6) return f(value / 1e6, 'میلیون');
  if (a >= 1e3) return f(value / 1e3, 'هزار');
  return `${sign}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function pct(v, dp = 2, sign = true) {
  if (v === null || v === undefined || !Number.isFinite(+v)) return '—';
  const t = Math.abs(+v).toFixed(dp);
  if (+t === 0) return `${t}%`;
  return `${v < 0 ? '−' : sign ? '+' : ''}${t}%`;
}

export function num(v, dp = 2) {
  if (v === null || v === undefined || !Number.isFinite(+v)) return '—';
  return (+v).toLocaleString('en-US', { maximumFractionDigits: dp });
}

export function amount(v) {
  if (v === null || v === undefined || !Number.isFinite(+v)) return '—';
  const a = Math.abs(v);
  return (+v).toLocaleString('en-US', { maximumFractionDigits: a >= 1000 ? 2 : a >= 1 ? 4 : 8 });
}

export const tone = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

export function changeHtml(v, dp = 2) {
  if (v === null || v === undefined || !Number.isFinite(+v)) return '<span class="chg flat">—</span>';
  const t = tone(v);
  const arrow = t === 'up' ? '▲' : t === 'down' ? '▼' : '';
  return `<span class="chg ${t}"><span aria-hidden="true">${arrow}</span>${Math.abs(v).toFixed(dp)}%</span>`;
}

export function dateTime(t, withTime = true) {
  const d = new Date(t);
  return d.toLocaleString('fa-IR', withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ago(t) {
  const s = Math.round((now() - t) / 1000);
  if (s < 60) return `${s} ثانیه پیش`;
  if (s < 3600) return `${Math.round(s / 60)} دقیقه پیش`;
  if (s < 86400) return `${Math.round(s / 3600)} ساعت پیش`;
  return `${Math.round(s / 86400)} روز پیش`;
}

export const INTERVAL_LABEL = {
  '1s': '۱ ثانیه',
  '5s': '۵ ثانیه',
  '10s': '۱۰ ثانیه',
  '1m': '۱ دقیقه',
  '3m': '۳ دقیقه',
  '5m': '۵ دقیقه',
  '15m': '۱۵ دقیقه',
  '30m': '۳۰ دقیقه',
  '1h': '۱ ساعت',
  '2h': '۲ ساعت',
  '4h': '۴ ساعت',
  '6h': '۶ ساعت',
  '12h': '۱۲ ساعت',
  '1d': '۱ روز',
  '3d': '۳ روز',
  '1w': '۱ هفته',
};

export function horizonText(interval, bars) {
  const ms = {
    '1s': 1 / 60, '5s': 5 / 60, '10s': 10 / 60,
    '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30,
    '1h': 60, '2h': 120, '4h': 240, '6h': 360, '12h': 720,
    '1d': 1440, '3d': 4320, '1w': 10080
  }[interval] * bars;
  const unit = (v, u) => `${v} ${u}`;
  if (ms < 1) return unit(Math.round(ms * 60), 'ثانیه');
  if (ms < 60) return unit(+ms.toFixed(ms < 10 ? 1 : 0), 'دقیقه');
  if (ms < 1440) return unit(+(ms / 60).toFixed(1), 'ساعت');
  if (ms < 10080 * 2) return unit(+(ms / 1440).toFixed(1), 'روز');
  return unit(+(ms / 10080).toFixed(1), 'هفته');
}