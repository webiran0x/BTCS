export const CONFIG = {
  APP_NAME: 'BTCS',
  TAGLINE: 'بازار زنده رمزارزها، سیگنال‌ها و پیش‌بینی‌های هوش مصنوعی',

  // Market data (all public, key-less, CORS-enabled endpoints)
  BINANCE_REST: ['https://data-api.binance.vision', 'https://api.binance.com'],
  BINANCE_WS: ['wss://data-stream.binance.vision', 'wss://stream.binance.com:9443'],
  COINGECKO: 'https://api.coingecko.com/api/v3',
  PAPRIKA: 'https://api.coinpaprika.com/v1',
  FEAR_GREED: 'https://api.alternative.me/fng/',

  // Watch-only wallet lookups
  RPC: {
    eth: 'https://ethereum-rpc.publicnode.com',
    bsc: 'https://bsc-rpc.publicnode.com',
    polygon: 'https://polygon-bor-rpc.publicnode.com',
    sol: 'https://api.mainnet-beta.solana.com',
  },
  BTC_API: ['https://mempool.space/api', 'https://blockstream.info/api'],

  // Built-in AI (runs in the visitor's browser via WebGPU — no API key)
  WEBLLM_URL: 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm',
  LLM_MODELS: [
    { id: 'Qwen3.5-2B-q4f16_1-MLC', label: 'Qwen 3.5 · 2B (پیشنهاد‌شده)', size: '≈1.4 GB', tier: 'balanced' },
    { id: 'Qwen3.5-4B-q4f16_1-MLC', label: 'Qwen 3.5 · 4B (دقت بالاتر)', size: '≈2.6 GB', tier: 'large' },
    { id: 'Qwen3.5-0.8B-q4f16_1-MLC', label: 'Qwen 3.5 · 0.8B (مخصوص موبایل، سریع‌تر)', size: '≈0.6 GB', tier: 'small' },
    { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 · 3B', size: '≈1.8 GB', tier: 'large' },
  ],
  // Backend (Supabase). Safe to expose: the publishable key only works with row-level security.
  SUPABASE_URL: 'https://cjpljmzustvgsmueqese.supabase.co',
  SUPABASE_KEY: 'sb_publishable_foRVEtVQ2RC0tLdjUQj9Kw_AWITvvVL',
  SUPABASE_JS: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm',

  // Display currencies (rates come from CoinGecko / exchangerate-api, USD is the base)
  CURRENCIES: [
    ['IRT', 'تومان', 'Iranian Toman'], ['IRR', 'ریال', 'Iranian Rial'],
    ['USD', '$', 'US Dollar'], ['EUR', '€', 'Euro'], ['GBP', '£', 'British Pound'],
    ['AED', 'د.إ', 'UAE Dirham'], ['SAR', '﷼', 'Saudi Riyal'], ['TRY', '₺', 'Turkish Lira'],
    ['USDT', 'USDT', 'Tether'], ['PKR', '₨', 'Pakistani Rupee'], ['INR', '₹', 'Indian Rupee'],
    ['JPY', '¥', 'Japanese Yen'], ['CNY', '¥', 'Chinese Yuan'], ['RUB', '₽', 'Russian Ruble']
  ],
  
  LANGS: [['fa', 'فارسی'], ['en', 'English']],

  // Derivatives / futures data
  FUTURES_REST: 'https://fapi.binance.com',
  FUTURES_WS: 'wss://fstream.binance.com',

  ANALYTICS: true,

  STABLECOINS: ['usdt', 'usdc', 'dai', 'fdusd', 'tusd', 'usde', 'usds', 'pyusd', 'usdd', 'busd', 'usd1', 'rlusd', 'usdp', 'gusd', 'frax', 'lusd', 'eurc', 'usdt0', 'susds', 'susde', 'bsc-usd', 'usdtb', 'usdf', 'usdg', 'buidl', 'xaut', 'paxg',
    // stablecoins, tokenised funds and gold that joined the top 150 later
    'usyc', 'usdy', 'eursafo', 'bfusd', 'usdgo', 'ousd', 'ustb', 'gho', 'eutbl', 'jaaa', 'usd0', 'kau', 'ylds', 'a7a5', 'sofid', 'reusd', 'jtrsy', 'ousg', 'apxusd'],
};
