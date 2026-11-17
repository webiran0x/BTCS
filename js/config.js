// تنظیمات سراسری سایت. تغییر برند اپلیکیشن با ویرایش APP_NAME / TAGLINE.
export const CONFIG = {
  APP_NAME: 'ارزپلاس', // نام بومی‌شده سایت
  TAGLINE: 'بازارهای زنده ارز دیجیتال، سیگنال‌ها و پیش‌بینی‌های هوش مصنوعی',

  // داده‌های بازار (نقاط پایانی عمومی، بدون نیاز به کلید، دارای قابلیت CORS)
  BINANCE_REST: ['https://data-api.binance.vision', 'https://api.binance.com'],
  BINANCE_WS: ['wss://data-stream.binance.vision', 'wss://stream.binance.com:9443'],
  COINGECKO: 'https://api.coingecko.com/api/v3',
  PAPRIKA: 'https://api.coinpaprika.com/v1',
  FEAR_GREED: 'https://api.alternative.me/fng/',

  // استعلام‌های کیف پول (فقط برای مشاهده)
  RPC: {
    eth: 'https://ethereum-rpc.publicnode.com',
    bsc: 'https://bsc-rpc.publicnode.com',
    polygon: 'https://polygon-bor-rpc.publicnode.com',
    sol: 'https://api.mainnet-beta.solana.com',
  },
  BTC_API: ['https://mempool.space/api', 'https://blockstream.info/api'],

  // هوش مصنوعی داخلی (اجرا در مرورگر کاربر از طریق WebGPU — بدون نیاز به کلید API)
  WEBLLM_URL: 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm',
  LLM_MODELS: [
    { id: 'Qwen3.5-2B-q4f16_1-MLC', label: 'Qwen 3.5 · 2B (پیشنهادی)', size: '≈1.4 GB', tier: 'balanced' },
    { id: 'Qwen3.5-4B-q4f16_1-MLC', label: 'Qwen 3.5 · 4B (دقیق‌ترین)', size: '≈2.6 GB', tier: 'large' },
    { id: 'Qwen3.5-0.8B-q4f16_1-MLC', label: 'Qwen 3.5 · 0.8B (موبایل، سریع‌ترین)', size: '≈0.6 GB', tier: 'small' },
    { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 · 3B', size: '≈1.8 GB', tier: 'large' },
  ],
  
  // بک‌اند (Supabase)
  SUPABASE_URL: 'https://lsokeplagodofqlsslcy.supabase.co',
  SUPABASE_KEY: 'sb_publishable_Fn2FAkgaybUV2mb42QML2g_O4Tc92kc',
  SUPABASE_JS: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm',

  // واحدهای پول نمایشی (نرخ‌ها از CoinGecko / exchangerate-api دریافت می‌شوند، دلار پایه است)
  CURRENCIES: [
    ['IRT', 'تومان', 'تومان ایران'], // واحد تومان اضافه شد
    ['USD', '$', 'دلار آمریکا'], ['EUR', '€', 'یورو'], ['GBP', '£', 'پوند انگلیس'],
    ['AED', 'دلار', 'درهم امارات'], ['SAR', 'ریال', 'ریال سعودی'], ['PKR', '₨', 'روپیه پاکستان'], 
    ['INR', '₹', 'روپیه هند'], ['TRY', '₺', 'لیر ترکیه'], ['CNY', '¥', 'یوان چین'], 
    ['JPY', '¥', 'ین ژاپن'], ['RUB', '₽', 'روبل روسیه'], ['ZAR', 'R', 'راند آفریقای جنوبی'],
    ['NGN', '₦', 'نایرا نیجریه'], ['IDR', 'Rp', 'روپیه اندونزی'], ['BRL', 'R$', 'رئال برزیل'], ['BDT', '৳', 'تاکای بنگلادش'],
  ],
  
  // زبان‌های سایت (افزودن فارسی به لیست زبان‌ها)
  LANGS: [['fa', 'فارسی'], ['en', 'English'], ['ur', 'اردو']],

  // داده‌های مشتقه / معاملات آتی (Futures)
  FUTURES_REST: 'https://fapi.binance.com',
  FUTURES_WS: 'wss://fstream.binance.com',

  ANALYTICS: true,

  STABLECOINS: ['usdt', 'usdc', 'dai', 'fdusd', 'tusd', 'usde', 'usds', 'pyusd', 'usdd', 'busd', 'usd1', 'rlusd', 'usdp', 'gusd', 'frax', 'lusd', 'eurc', 'usdt0', 'susds', 'susde', 'bsc-usd', 'usdtb', 'usdf', 'usdg', 'buidl', 'xaut', 'paxg',
    'usyc', 'usdy', 'eursafo', 'bfusd', 'usdgo', 'ousd', 'ustb', 'gho', 'eutbl', 'jaaa', 'usd0', 'kau', 'ylds', 'a7a5', 'sofid', 'reusd', 'jtrsy', 'ousg', 'apxusd'],
};