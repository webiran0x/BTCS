// Minimal i18n: English strings are the keys, Persian dictionary FA added.
import { settings } from './store.js';

const FA = {
  // navigation & shell
  'Markets': 'بازارها',
  'Market scan': 'اسکن بازار',
  'Scan': 'اسکن',
  'Ask': 'پرسش',
  'Assistant': 'هوش مصنوعی',
  'Trading': 'معاملات',
  'Scanner': 'اسکنر',
  'Record': 'سوابق',
  'Tools': 'ابزارها',
  'Alerts': 'هشدارها',
  'AI Assistant': 'دستیار هوش مصنوعی',
  'Signal Scanner': 'اسکنر سیگنال',
  'Compare': 'مقایسه',
  'Exchanges': 'صرافی‌ها',
  'Wallet': 'کیف پول',
  'Price Alerts': 'هشدارهای قیمت',
  'Track record': 'سوابق و عملکرد',
  'News': 'اخبار',
  'Futures': 'معاملات آتی',
  'Premium': 'نسخه ویژه',
  'Account': 'حساب کاربری',
  'Admin': 'مدیریت',
  'Sign in': 'ورود',
  'Sign up': 'ثبت‌نام',
  'Sign out': 'خروج',
  'Search coin (BTC, Ethereum…)': 'جستجوی ارز (BTC، اتریوم…)',
  'More': 'بیشتر',
  'Menu': 'فهرست',
  'Language': 'زبان',
  'Currency': 'واحد پول',
  'Live · Binance stream': 'زنده · اتصال به بایننس',
  'Paused while the tab is in the background': 'به دلیل قرارگیری تب در پس‌زمینه متوقف شد',
  'Reconnecting…': 'در حال اتصال مجدد…',
  // common words
  'Price': 'قیمت',
  'Coin': 'ارز دیجیتال',
  'Signal': 'سیگنال',
  'Score': 'امتیاز',
  'Buy': 'خرید',
  'Sell': 'فروش',
  'Neutral': 'خنثی',
  'Strong Buy': 'خرید قوی',
  'Strong Sell': 'فروش قوی',
  'Market cap': 'ارزش بازار',
  'Volume 24h': 'حجم معاملات ۲۴ ساعته',
  'Entry zone': 'محدوده ورود',
  'Stop-loss': 'حد ضرر',
  'Take-profit 1': 'حد سود ۱',
  'Trade signal': 'سیگنال معاملاتی',
  'AI forecast': 'پیش‌بینی هوش مصنوعی',
  'Chance of rise': 'احتمال رشد',
  'Expected move': 'تغییرات متوقع',
  'Target': 'هدف',
  'High confidence': 'اعتماد بالا',
  'Moderate confidence': 'اعتماد متوسط',
  'Low confidence': 'اعتماد پایین',
  'Pattern comparison': 'مقایسه الگوها',
  'History & cycles': 'تاریخچه و چرخه‌ها',
  'Backtest': 'تست گذشته (بک‌تست)',
  'Order book': 'دفتر سفارشات',
  'About': 'درباره ما',
  'Not financial advice.': 'توصیه مالی محسوب نمی‌شود.',
  'Loading…': 'در حال بارگذاری…',
  'Save': 'ذخیره',
  'Cancel': 'انصراف',
  'Delete': 'حذف',
  'Add': 'افزودن',
  'Close': 'بستن',
  'Email': 'ایمیل',
  'Password': 'رمز عبور',
  'Name': 'نام',
  'Yes': 'بله',
  'No': 'خیر',
  // pages
  'Crypto prices today': 'قیمت لحظه‌ای رمزارزها',
  'Total market cap': 'ارزش کل بازار',
  'BTC dominance': 'تسلط بیت‌کوین',
  'Fear & Greed': 'شاخص ترس و طمع',
  'Trending': 'داغ‌ترین‌ها',
  'Top gainers 24h': 'بیشترین رشد ۲۴ ساعته',
  'Top losers 24h': 'بیشترین افت ۲۴ ساعته',
  'All coins': 'تمام ارزها',
  'Watchlist': 'دیده‌بان',
  'Table': 'جدول',
  'Heatmap': 'نقشه حرارتی',
  'Wallet & portfolio': 'کیف پول و پورتفیو',
  'Holdings': 'دارایی‌ها',
  'Add holding': 'افزودن دارایی',
  'Allocation': 'تخصیص',
  'Portfolio value': 'ارزش پورتفیو',
  'Total profit / loss': 'کل سود / زیان',
  '24h change': 'تغییر ۲۴ ساعته',
  'New alert': 'هشدار جدید',
  'Your alerts': 'هشدارهای شما',
  'Create alert': 'ایجاد هشدار',
  'Above': 'بالاتر از',
  'Below': 'پایین‌تر از',
  'Signal track record': 'سوابق عملکرد سیگنال‌ها',
  'Crypto news': 'اخبار رمزارزها',
  'Futures & derivatives': 'فیوچرز و مشتقات',
  'Funding rate': 'نرخ تامین مالی',
  'Open interest': 'سود باز (Open Interest)',
  'Liquidations': 'تسویه‌ها (Liquidations)',
  'Long': 'خرید (لانگ)',
  'Short': 'فروش (شارط)',
  'Terms of Service': 'قوانین و مقررات',
  'Privacy Policy': 'حریم خصوصی',
  'Risk Disclosure': 'سلب مسئولیت ریسک',
  'I understand': 'متوجه شدم',
  'Upgrade to Premium': 'ارتقا به نسخه ویژه',
  'Premium members only': 'مخصوص اعضای ویژه',
  'Telegram alerts': 'هشدارهای تلگرامی',
  'Connect Telegram': 'اتصال به تلگرام',
  'Signed in as': 'وارد شده با حساب',
  'Create your account': 'ساخت حساب کاربری',
  'Welcome back': 'خوش آمدید',
};

const DICTS = { fa: FA };

export const I18N = { lang: 'fa' };

export function t(text, vars) {
  let out = DICTS[I18N.lang]?.[text] || text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
  return out;
}

export type { };

export function setLang(code) {
  I18N.lang = (DICTS[code] || code === 'en') ? code : 'fa';
  settings.set({ lang: I18N.lang });
  applyDir();
  window.dispatchEvent(new CustomEvent('cv:lang', { detail: { lang: I18N.lang } }));
}

export function applyDir() {
  document.documentElement.lang = I18N.lang;
  document.documentElement.dir = I18N.lang === 'fa' ? 'rtl' : 'ltr';
}