// فایل‌های جستجوگرپذیر موتورهای جستجو یعنی sitemap.xml و robots.txt را می‌نویسد.
//
// برنامه با آدرس‌های #/… مسیریابی می‌کند، و موتورهای جستجو هر آدرس #/… را
// به عنوان صفحه اصلی در نظر می‌گیرند، بنابراین نقشه سایت قدیمی لینک‌های #/ تنها یک صفحه به آن‌ها می‌داد.
// اکنون هر صفحه‌ای که ارزش پیدا شدن داشته باشد یک آدرس واقعی دریافت می‌کند (coin/btc/, trader/, …):
// کپی از index.html با عنوان، توضیحات، لینک کانونیکال (canonical)،
// داده‌های ساختاریافته و متن کوتاهی از محتوای صفحه، به همراه مسیری که باز می‌کند (<html data-route>).
// برنامه دقیقاً مانند index.html از آن بوت می‌شود و آدرس را به /#/… (js/app.js) منتقل می‌کند،
// بنابراین لینک‌های درون آن در صفحه باقی می‌مانند.
//
// اطلاعات موجود در متن‌ها از رکوردهای تست‌شده در js/lib خوانده می‌شوند و هرگز در اینجا هاردکد نمی‌شوند،
// بنابراین اندازه‌گیری مجدد که آن‌ها را تغییر دهد، صفحات را در بیلد بعدی تغییر خواهد داد.
//
// نحوه استفاده: node tools/build-pages.mjs [--site=https://user.github.io/repo/]   نوشتن همه موارد
//        node tools/build-pages.mjs --check  اگر هر فایلی روی دیسک قدیمی باشد با کد 1 خارج شود
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORECAST_TESTED } from '../js/lib/forecastview.js';
import { TESTED_ACCURACY } from '../js/lib/predict.js';
import { CHART_TESTED, TESTED_COINS } from '../js/lib/autotrader.js';
import { LEARN_GUIDE, rangeLine, directionMeasured } from '../js/lib/learnguide.js';
const TESTED_CHARTS = Object.keys(CHART_TESTED).filter((k) => CHART_TESTED[k]?.standard);
const holdBeat = TESTED_CHARTS.filter((k) => { const x = CHART_TESTED[k]; return x.hold > (x.adopt ? x.own : x.standard).ret; }).length;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// آدرس سایت؛ یک نسخه مستقر در جای دیگر آدرس خودش را ارسال می‌کند (--site=https://…/)
const arg = process.argv.find((a) => a.startsWith('--site='));
export const SITE = (arg ? arg.slice(7) : 'https://umer-78.github.io/BTCS/').replace(/\/?$/, '/');
const BASE = new URL(SITE).pathname; // '/BTCS/'
const check = process.argv.includes('--check');

// نام‌ها فقط در مواردی که هیچ شکی وجود ندارد؛ سایر ارزها با نمادشان نام‌گذاری می‌شوند.
const NAMES = {
  BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB', XRP: 'XRP', SOL: 'Solana', TRX: 'TRON', ZEC: 'Zcash', DOGE: 'Dogecoin',
  XMR: 'Monero', LINK: 'Chainlink', ADA: 'Cardano', NEAR: 'NEAR Protocol', XLM: 'Stellar', BCH: 'Bitcoin Cash',
  UNI: 'Uniswap', LTC: 'Litecoin', AVAX: 'Avalanche', SUI: 'Sui', HBAR: 'Hedera', TAO: 'Bittensor', QNT: 'Quant',
  SHIB: 'Shiba Inu', CRO: 'Cronos', ENA: 'Ethena', AAVE: 'Aave', ONDO: 'Ondo', DOT: 'Polkadot', WLD: 'Worldcoin',
  MNT: 'Mantle', PEPE: 'Pepe', ICP: 'Internet Computer', ETC: 'Ethereum Classic', ARB: 'Arbitrum', JUP: 'Jupiter',
  ALGO: 'Algorand', RENDER: 'Render', KAS: 'Kaspa', ATOM: 'Cosmos', FIL: 'Filecoin', STX: 'Stacks', INJ: 'Injective',
  APT: 'Aptos', CAKE: 'PancakeSwap', PYTH: 'Pyth Network', STRK: 'Starknet', DASH: 'Dash', VET: 'VeChain',
  TIA: 'Celestia', CRV: 'Curve DAO', RAY: 'Raydium', SEI: 'Sei', BSV: 'Bitcoin SV', PENDLE: 'Pendle', BTT: 'BitTorrent',
  XTZ: 'Tezos', LDO: 'Lido DAO', OP: 'Optimism', GNO: 'Gnosis', CFX: 'Conflux', SAND: 'The Sandbox', HYPE: 'Hyperliquid',
  PI: 'Pi Network', ETHFI: 'ether.fi', FLR: 'Flare', XDC: 'XDC Network', KAIA: 'Kaia', AERO: 'Aerodrome', PENGU: 'Pudgy Penguins',
};
const VENUE = { binance: 'Binance', gate: 'Gate.io', htx: 'HTX', okx: 'OKX' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const span = (xs) => { const lo = Math.min(...xs), hi = Math.max(...xs); return lo === hi ? `${lo}` : `${lo}–${hi}`; };

// ---------------------------------------------------------------- حقایق اندازه‌گیری‌شده
const centred = Object.values(FORECAST_TESTED.centred);
const rangeTests = centred.reduce((a, x) => a + x.tests, 0);
const facts = {
  coins: TESTED_COINS.length,
  band80: span(centred.map((x) => x.band80)),
  rangeTests: Math.round(rangeTests / 1000) * 1000,
  recheckTests: TESTED_ACCURACY.recheck?.tests,
};
const holdLoss = TESTED_CHARTS.filter((k) => { const x = CHART_TESTED[k]; return (x.adopt ? x.own : x.standard).ret < 0; }).length;
const traderMeasured = `در آخرین تست گام‌به‌گام (${CHART_TESTED.measuredOn}، ${CHART_TESTED.coins} ارز، با احتساب کارمزدها)، قوانین در ${holdLoss === TESTED_CHARTS.length ? 'هر یک' : `${holdLoss}`} مورد از ${TESTED_CHARTS.length} نمودار تست‌شده پول از دست دادند و نگهداری ساده همان ارزها در ${holdBeat === TESTED_CHARTS.length ? 'همه نمودارها' : `${holdBeat} مورد از آن‌ها`} عملکرد بهتری داشت.`;
const directionLine = 'هیچ مدلی نتوانسته است در پیش‌بینی جهت بعدی حرکت قیمت عملکردی بهتر از شانس داشته باشد، بنابراین این صفحه هرگز جهت خاصی را به عنوان سیگنال خرید یا فروش معرفی نمی‌کند.';

// ---------------------------------------------------------------- صفحات
const SECTIONS = [
  { route: '#/', path: '', title: 'BTCS — Live Crypto Prices, Charts, Tested AI Forecasts & AI Trading Simulator',
    desc: `Live prices and candlestick charts for the top crypto coins, price-range forecasts tested on ${facts.coins} coins, an AI paper-trading simulator and a public track record. Every figure is measured, not promised. Not financial advice.`,
    h1: 'قیمت‌های زنده ارزهای دیجیتال، نمودارها و پیش‌بینی‌های تست‌شده هوش مصنوعی',
    body: [`قیمت‌ها و نمودارهای بزرگ‌ترین ارزهای دیجیتال، از صرافی‌ای که هر کدام در آن معامله می‌شوند (ابتدا بایننس، سپس Gate.io و HTX). هر ارزی را برای مشاهده نمودار آن، ۱۳ اندیکاتور، پیش‌بینی بازه قیمتی و سیگنال معامله‌گر هوش مصنوعی باز کنید.`, rangeLine, directionLine],
    more: {
      does: 'قیمت‌ها و نمودارهای زنده را نمایش می‌دهد، اندیکاتورها را امتیازدهی می‌کند، بازه قیمتی را پیش‌بینی می‌کند، به سوالات بر اساس آن داده‌ها پاسخ می‌دهد و یک شبیه‌ساز معاملات کاغذی را اجرا می‌کند.',
      measures: 'اینکه هر بازه پیش‌بینی چقدر اعتبار داشته، پیش‌بینی‌های جهت حرکت چقدر نسبت به یک مبنای ساده درست بوده‌اند، و قوانین معاملاتی پس از کسر کارمزد در مقایسه با نگهداری ساده چه نتیجه‌ای داشته‌اند.',
      not: 'این ابزار سفارشی ثبت نمی‌کند، دارایی یا کلیدی را نگهداری نمی‌کند و به شما نمی‌گوید چه چیزی بخرید. این یک ابزار آموزشی است، نه مشاوره مالی.',
      limits: 'نتایج اندازه‌گیری‌شده گذشته را توصیف می‌کنند. بازارها تغییر می‌کنند، فیدهای داده ممکن است با تأخیر مواجه شوند یا خطا بدهند، و بازه پیش‌بینی به طور طراحی‌شده از هر پنج بار حدود یک بار اشتباه خواهد بود.',
    } },
  { route: '#/scanner', path: 'scanner/', title: 'Crypto Scanner — Indicator Scores for the Top Coins | BTCS',
    desc: 'Ranks the top 20 to 50 coins by how strongly their indicators agree, with the same forecast and AI signal as each coin page. Filters for rising, falling, oversold and overbought.',
    h1: 'اسکنر ارزهای دیجیتال', body: ['رتبه‌بندی ۲۰ تا ۵۰ ارز برتر بر اساس میزان توافق قوی اندیکاتورهای آن‌ها، همراه با همان پیش‌بینی و سیگنال هوش مصنوعی در صفحه هر ارز. دارای فیلترهای صعودی، نزولی، اشباع فروش و اشباع خرید.'],
    more: {
      does: 'هشت اندیکاتور را برای هر یک از ارزهای برتر در نمودار انتخابی شما می‌خواند و آن‌ها را بر اساس میزان توافق خوانش‌ها رتبه‌بندی می‌کند.',
      measures: 'عملکرد قیمت پس از هر سطح امتیاز، در هر نمودار، تا بتوانید ببینید کدام خوانش‌ها حاوی اطلاعات بوده‌اند و کدام‌یک خیر.',
      not: 'امتیاز بالا سیگنال خرید نیست و امتیاز پایین سیگنال فروش نیست؛ تست‌ها تمایل معکوسی را در نقاط افراطی نشان دادند.',
      limits: 'اندیکاتورها صرفاً بر اساس قیمت‌های گذشته ساخته شده‌اند. آن‌ها هیچ چیزی درباره اخبار، نقدینگی یا رویدادهایی که هنوز رخ نداده‌اند نمی‌گویند.',
    } },
  { route: '#/trader', path: 'trader/', title: 'AI Crypto Trading Simulator — Paper Trading with Tested Rules | BTCS',
    desc: `An AI trader that runs tested rules on live prices with simulated money, plus a demo account and a record of your real trades. Walk-forward results on ${facts.coins} coins are shown next to it. No orders are ever placed.`,
    h1: 'شبیه‌ساز معاملات هوش مصنوعی',
    body: ['یک معامله‌گر هوش مصنوعی که با پول شبیه‌سازی‌شده روی قیمت‌های زنده و با استفاده از قوانین تست‌شده گام‌به‌گام روی هر ارز قابل معامله (با احتساب کارمزد) خرید و فروش می‌کند. این ربات هیچ سفارشی در هیچ صرافی ثبت نمی‌کند.', `در هر نمودار، صفحه نشان می‌دهد که همان قوانین در تست چه نتیجه‌ای کسب کرده‌اند، بیشترین افت سرمایه چقدر بوده و نگهداری ساده ارزها چه بازدهی داشته است. ${traderMeasured} صفحه هر دو مورد را به همراه بیشترین افت سرمایه نشان می‌دهد.`],
    more: {
      does: 'یک حساب آزمایشی برای معامله دستی، یک حساب هوش مصنوعی که به‌طور خودکار از قوانین پیروی می‌کند، و سابقه معاملات واقعی شما در سایر صرافی‌ها را اجرا می‌کند که همگی به یک روش سنجیده می‌شوند.',
      measures: 'بازدهی پس از کسر کارمزد، بیشترین افت سرمایه (با احتساب معاملات باز)، تعداد معاملات و نرخ برد، در مقایسه با عملکرد نگهداری ساده همان ارزها در دوره‌های مشابه.',
      not: 'هرگز سفارش واقعی ثبت نمی‌کند، هیچ دارایی یا کلید صرافی را نگه نمی‌دارد و راهی تضمینی برای سود نیست. نتایج شبیه‌سازی‌شده نتایج واقعی نیستند.',
      limits: 'سفارش‌های شبیه‌سازی‌شده با قیمت کندل پر می‌شوند. سفارش‌های واقعی مشمول اسپرد و لغزش قیمت می‌شوند، ممکن است به صورت جزئی یا کلی پر نشوند، و صرافی‌ها ممکن است متوقف شوند. قوانین سفارشی بخشی از تست نبوده‌اند.',
    },
    sections: [
      { h2: 'توضیح حساب‌ها و استراتژی‌ها', list: [
        'حساب آزمایشی (Demo): پول مجازی که به صورت دستی برای تمرین بدون ریسک معامله می‌کنید.',
        'حساب هوش مصنوعی (AI): پول مجازی که بر اساس قوانین انتخابی شما، روی قیمت‌های زنده در مرورگر و در صورت ورود به حساب در فضای ابری معامله می‌شود.',
        'حساب واقعی (Real): سوابقی از معاملاتی که شخصاً در یک صرافی انجام داده‌اید، به صورت دستی وارد یا درون‌ریزی شده‌اند. برنامه سفارشی ثبت نمی‌کند.',
        'استراتژی پیش‌فرض تست‌شده: قوانین هر نمودار که با احتساب کارمزدها و هزینه‌های پر شدن سفارش از تست گام‌به‌گام عبور کرده‌اند. نتیجه آن‌ها چه خوب و چه بد نمایش داده می‌شود.',
        'استراتژی سفارشی: تنظیمات شخصی شما. این موارد تست نشده‌اند، بنابراین آمارهای تست‌شده درباره آن‌ها صدق نمی‌کند؛ نگاه به گذشته روی همان تاریخچه آن‌ها را ایده‌آل جلوه می‌دهد.',
      ] },
    ] },
  { route: '#/learn', path: 'learn/', title: 'How the AI Learns and How It Is Tested | BTCS',
    desc: 'How every indicator, the forecast and the AI trader are graded against what the market did next: walk-forward tests, a live record kept in the cloud, and what was tried and rejected.',
    h1: 'چگونگی یادگیری هوش مصنوعی و روش تست آن',
    body: ['هر سیگنال در فضای ابری (صرف‌نظر از اینکه صفحه‌ای باز باشد یا خیر) بر اساس رفتار بعدی بازار ارزیابی می‌شود. یک روش تنها زمانی کنترل را به دست می‌گیرد که در آن سابقه بر روش فعلی غلبه کند، و اگر عملکرد خود را از دست دهد تنزل می‌یابد.', directionMeasured, rangeLine],
    more: {
      does: 'هر سیگنال، پیش‌بینی و معامله را پیش از مشخص شدن نتیجه ثبت می‌کند، پس از رسیدن موعد به آن امتیاز می‌دهد، و وزن را به سمت روش‌هایی که سوددهی خود را حفظ کرده‌اند منتقل می‌کند.',
      measures: 'میزان اعتبار بازه‌های پیش‌بینی، نرخ موفقیت پیش‌بینی جهت در مقایسه با یک مبنا، و بازدهی معاملات پس از کارمزد در مقایسه با نگهداری ساده.',
      not: 'هوش مصنوعی از داده‌های شخصی شما یاد نمی‌گیرد، آینده را نمی‌بیند، و روشی را که شکست خورده به عنوان پیشنهاد ارائه نمی‌دهد.',
      limits: 'هر رقم بازه‌ای را که در آن اندازه‌گیری شده توصیف می‌کند. روشی که کار می‌کرده ممکن است با تغییر بازار متوقف شود، به همین دلیل تست‌ها به طور مداوم اجرا می‌شوند.',
    },
    sections: LEARN_GUIDE },
  { route: '#/track', path: 'track/', title: 'Public Track Record of Every Logged Signal | BTCS',
    desc: 'Every signal the server logged before the outcome was known, scored against the hit rate of always calling the more common outcome.',
    h1: 'سابقه عملکرد عمومی', body: ['هر سیگنال پیش از مشخص شدن نتیجه ثبت شده و پس از گذشت افق زمانی، در مقایسه با نرخ موفقیتِ پیش‌بینیِ همیشه رایج‌ترین حالت امتیازدهی می‌شود.'] },
  { route: '#/advice', path: 'advice/', title: 'Crypto Market Scan — Where the Evidence Is Strongest | BTCS',
    desc: 'A scan of your holdings and the top coins across charts, weighting every reading by how accurate it has actually been.',
    h1: 'اسکن بازار', body: ['دارایی‌ها و ارزهای برتر شما را در چند تایم‌فریم اسکن کرده و به هر خوانش بر اساس دقت اندازه‌گیری‌شده‌اش وزن می‌دهد، بنابراین خوانشی که هرگز قابل اعتماد نبوده ارزش بسیار کمی خواهد داشت.'] },
  { route: '#/compare', path: 'compare/', title: 'Compare Crypto Coins — Performance, Volatility, Drawdown & Correlation | BTCS',
    desc: 'Compare up to six coins: normalised performance, volatility, maximum drawdown, return against risk and a correlation matrix.',
    h1: 'مقایسه ارزها', body: ['مقایسه حداکثر شش ارز در کنار یکدیگر: عملکرد نرمال‌شده، نوسان، بیشترین افت سرمایه، بازدهی در برابر ریسک و میزان همبستگی حرکتی آن‌ها.'] },
  { route: '#/futures', path: 'futures/', title: 'Crypto Futures — Funding Rates and Open Interest | BTCS',
    desc: 'Funding rates, open interest and long/short ratios for the main crypto futures markets.',
    h1: 'معاملات آتی (Futures)', body: ['نرخ‌های تامین مالی (Funding rates)، سود باز (Open interest) و نسبت موقعیت‌های خرید به فروش در بازارهای اصلی معاملات آتی پرپچوال.'] },
  { route: '#/news', path: 'news/', title: 'Crypto News | BTCS', desc: 'Recent crypto news headlines from public sources, next to live prices and charts for the coins they mention.', h1: 'اخبار ارزهای دیجیتال', body: ['سرتیتر اخبار اخیر از منابع عمومی ارزهای دیجیتال.'] },
  { route: '#/tools', path: 'tools/', title: 'Crypto Tools — Converter, DCA Backtest, Position Sizer | BTCS',
    desc: 'A currency converter, a dollar-cost-averaging backtest on real prices and a position sizer that keeps each trade to a set risk.',
    h1: 'ابزارهای ارز دیجیتال', body: ['یک مبدل ارزی، تست استراتژی میانگین‌گیری هزینه دلاری (DCA) روی قیمت‌های واقعی، و ابزار تعیین حجم پوزیشن که هر معامله را در ریسک تعیین‌شده نگه می‌دارد.'] },
  { route: '#/exchanges', path: 'exchanges/', title: 'Crypto Exchanges — Volume and Trust | BTCS', desc: 'The main crypto exchanges ranked by trading volume, and which of them the app reads live prices and candles from.', h1: 'صرافی‌های ارز دیجیتال', body: ['صرافی‌های اصلی بر اساس حجم معاملات.'] },
  { route: '#/ai', path: 'ai/', title: 'Crypto AI Assistant — Answers from Live Data | BTCS',
    desc: 'Ask about any coin, the market or your AI trader. Answers come from live prices and the app\'s tested models, in your browser, and say what they are based on.',
    h1: 'دستیار هوش مصنوعی ارز دیجیتال', body: ['درباره هر ارز، بازار یا معامله‌گر هوش مصنوعی خود سوال کنید. پاسخ‌ها از قیمت‌های زنده و مدل‌های تست‌شده برنامه در مرورگر شما ساخته می‌شوند و مشخص می‌کنند بر چه اساسی ارائه شده‌اند.', 'هر پاسخ منبع خود را نام می‌برد (قیمت‌های زنده، سیگنال‌ها، پیش‌بینی، حساب شبیه‌سازی‌شده شما) و نویسنده متن را مشخص می‌کند: تحلیلگر داخلی یا مدل زبانی که صرفاً پاسخ تحلیلگر را بازنویسی کرده و از نظر وجود اعداد نامعتبر بررسی می‌شود.'],
    more: {
      does: 'به سوالات درباره ارزها، بازار، مقایسه‌ها، ریسک و حساب معاملات کاغذی شما بر اساس داده‌های زنده و مدل‌های اندازه‌گیری‌شده پاسخ می‌دهد.',
      measures: 'چیز جدیدی نیست: اعدادی را که سایر بخش‌های برنامه اندازه‌گیری کرده‌اند به همراه دقت‌شان گزارش می‌کند و داده‌های تأییدشده پشت هر پاسخ را نشان می‌دهد.',
      not: 'قیمت‌ها را با قطعیت پیش‌بینی نمی‌کند، معامله‌ای ثبت نمی‌کند و اعدادی را از خود ابداع نمی‌کند. پاسخی که اعدادی خارج از داده‌ها را نقل کند با پاسخ خود تحلیلگر جایگزین می‌شود.',
      limits: 'در مواردی که مستندات ضعیف باشد به صراحت اعلام می‌کند. پیش‌بینی‌های جهت در تست‌ها نتوانسته اند از شانس بهتر عمل کنند، و مدل زبانی ممکن است متن را ضعیف بیان کند. این مشاوره مالی نیست.',
    } },
  { route: '#/alerts', path: 'alerts/', title: 'Crypto Price Alerts | BTCS', desc: 'Set price and indicator alerts for any coin and get notified in the browser, by e-mail or on Telegram when they trigger.', h1: 'هشدارهای قیمتی', body: ['تنظیم هشدارهای قیمت و سیگنال برای هر ارز دیجیتال.'] },
  { route: '#/wallet', path: 'wallet/', title: 'Read-only Crypto Wallet View | BTCS', desc: 'See a wallet\'s balances read-only. The app never asks for keys or signatures.', h1: 'کیف پول', body: ['اتصال کیف پول به صورت فقط‌خواندنی برای مشاهده موجودی‌ها. برنامه هرگز کلید خصوصی، عبارت بازیابی یا امضایی درخواست نمی‌کند.'] },
  { route: '#/premium', path: 'premium/', title: 'Free and Premium Plans | BTCS', desc: 'What the free plan of BTCS includes, what Premium adds, and what neither of them can promise about returns.', h1: 'پلن‌های اشتراکی', body: ['امکانات پلن رایگان و ویژگی‌های نسخه پریمیوم.'] },
  { route: '#/legal/terms', path: 'legal/terms/', title: 'Terms of Use | BTCS', desc: 'The terms of use for BTCS: an educational tool for crypto markets, not financial advice or a trading service.', h1: 'شرایط استفاده', body: ['شرایط حاکم بر استفاده از BTCS.'] },
  { route: '#/legal/privacy', path: 'legal/privacy/', title: 'Privacy Policy | BTCS', desc: 'What BTCS stores on your device and on its server, why, for how long, and how to delete it.', h1: 'سیاست حفظ حریم خصوصی', body: ['مواردی که برنامه روی دستگاه شما و سرور خود ذخیره می‌کند و مدت زمان نگهداری آن‌ها.'] },
  { route: '#/legal/risk', path: 'legal/risk/', title: 'Risk Disclosure | BTCS', desc: 'The risks of trading crypto and of relying on any forecast, signal or simulation, including the ones on this site.', h1: 'سلب مسئولیت ریسک', body: ['بازار ارزهای دیجیتال پرنوسان است. هیچ پیش‌بینی، سیگنال یا شبیه‌سازی در این سایت مشاوره مالی نیست و نتایج گذشته تضمینی برای آینده نیستند.'] },
];

const universe = JSON.parse(fs.readFileSync(path.join(root, 'tools/universe.json'), 'utf8'));
const slug = (sym) => sym.toLowerCase();
const COINS = universe.coins.map((c) => {
  const sym = c.symbol, name = NAMES[sym];
  const label = name && name !== sym ? `${name} (${sym})` : sym;
  const venue = VENUE[c.venue] || c.venue;
  return {
    route: `#/coin/${sym}`, path: `coin/${slug(sym)}/`, coin: sym,
    title: `${label} Price, Live Chart & Tested AI Forecast | BTCS`,
    desc: `Live ${sym} price and chart from ${venue}, 13 indicators, a price-range forecast tested on ${facts.coins} coins and an AI paper-trading signal with its measured record.`,
    h1: `قیمت، نمودار و پیش‌بینی هوش مصنوعی ${label}`,
    more: {
      does: `قیمت و نمودار زنده ${sym}، ۱۳ اندیکاتور، پیش‌بینی بازه قیمتی آموزش‌دیده روی کندل‌های خود ${sym} در مرورگر شما، و سیگنال معامله‌گر هوش مصنوعی را نمایش می‌دهد.`,
      measures: 'اینکه بازه پیش‌بینی در بین ارزهای تست‌شده چقدر اعتبار داشته است، و نتیجه تست گام‌به‌گام معامله‌گر هوش مصنوعی در هر نمودار چگونه بوده است.',
      not: `این ابزار نمی‌گوید که ${sym} را بخرید یا بفروشید، سفارشی ثبت نمی‌کند، و از اخبار پیش از انتشار مطلع نیست.`,
      limits: 'پیش‌بینی‌های جهت حرکت نتوانسته‌اند از یک مبنای ساده بهتر عمل کنند، و هر رقم گذشته را توصیف می‌کند. مشاوره مالی نیست.',
    },
    body: [`قیمت زنده و نمودار کندل‌استیک ${sym} از ${venue} دریافت می‌شود. هنگامی که صفحه را باز می‌کنید، برنامه مدل‌های پیش‌بینی خود را روی کندل‌های خود ${sym} در مرورگر شما آموزش می‌دهد و بازه قیمتی حاصل برای کندل‌های بعدی، اندیکاتورها و سیگنال معامله‌گر هوش مصنوعی برای ${sym} را نمایش می‌دهد.`, rangeLine, directionLine],
  };
});

// ---------------------------------------------------------------- رندر کردن
const template = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const swap = (html, re, to, what) => {
  if (!re.test(html)) throw new Error(`index.html: no ${what} to replace`);
  return html.replace(re, to);
};

function page(p) {
  const url = SITE + encodeURI(p.path);
  const crumbs = [{ name: 'BTCS', url: SITE }];
  if (p.coin) crumbs.push({ name: 'Coins', url: SITE }, { name: p.coin, url });
  else if (p.path) crumbs.push({ name: p.h1, url });
  const ld = p.path === ''
    ? [{ '@context': 'https://schema.org', '@type': 'WebSite', name: 'BTCS', url: SITE, description: p.desc },
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'BTCS', url: SITE, applicationCategory: 'FinanceApplication', operatingSystem: 'Any (web browser)', description: p.desc }]
    : [{ '@context': 'https://schema.org', '@type': 'WebPage', name: p.title, url, description: p.desc, isPartOf: { '@type': 'WebSite', name: 'BTCS', url: SITE } },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) }];
  let html = template;
  html = swap(html, /<html lang="en"[^>]*>/, `<html lang="en" data-theme="dark"${p.path ? ` data-route="${esc(p.route)}"` : ''}>`, 'html tag');
  if (p.path) html = swap(html, /<meta charset="utf-8">/, `<meta charset="utf-8">\n  <base href="${BASE}">`, 'charset');
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`, 'title');
  html = swap(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(p.desc)}">`, 'description');
  html = swap(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(p.title)}">`, 'og:title');
  html = swap(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(p.desc)}">`, 'og:description');
  html = swap(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`, 'og:url');
  html = swap(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`, 'canonical');
  html = swap(html, /<!-- ld:start -->[\s\S]*?<!-- ld:end -->/, `<!-- ld:start -->\n${ld.map((x) => `  <script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}\n  <!-- ld:end -->`, 'structured data');
  const links = p.coin
    ? `<a class="btn primary" href="${p.route}">مشاهده نمودار زنده ${esc(p.coin)}</a> <a class="btn" href="#/trader">شبیه‌ساز معاملات هوش مصنوعی</a> <a class="btn" href="#/learn">آموزش</a>`
    : `<a class="btn primary" href="${p.route}">مشاهده ${esc(p.h1.charAt(0).toLowerCase() + p.h1.slice(1))}</a>${p.route === '#/learn' ? '' : ' <a class="btn" href="#/learn">آموزش</a>'}`;
  const n = (t) => `\n          ${t}`;
  const more = p.more ? n(`<ul class="facts" aria-label="در یک نگاه">${[['عملکرد', p.more.does], ['معیارهای اندازه‌گیری', p.more.measures], ['مواردی که انجام نمی‌دهد', p.more.not], ['محدودیت‌ها', p.more.limits]].map(([k, v]) => `<li><b>${k}</b><p>${esc(v)}</p></li>`).join('')}</ul>`) : '';
  const sections = (p.sections || []).map((x, i) => {
    const id = `${(p.path || 'home').replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '')}-s${i + 1}`;
    const inner = [
      ...(x.paras || []).map((t) => `<p>${esc(t)}</p>`),
      x.steps ? `<ol class="steps">${x.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : '',
      x.list ? `<ul class="steps">${x.list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '',
    ].join('');
    return n(`<section aria-labelledby="${id}"><h2 id="${id}">${esc(x.h2)}</h2>${inner}</section>`);
  }).join('');
  const main = `<main id="view" tabindex="-1">\n        <section class="card seo-intro"><h1>${esc(p.h1)}</h1>${p.body.map((t, i) => `<p${i === 0 ? ' class="lede"' : ''}>${esc(t)}</p>`).join('')}${more}${sections}${n(`<p class="row" style="gap:8px;flex-wrap:wrap">${links}</p>`)}${n('<p class="fine">جنبه آموزشی دارد، نه مشاوره مالی. پیش‌بینی‌ها، سیگنال‌ها و نتایج شبیه‌سازی‌شده گذشته را توصیف می‌کنند و بازدهی آینده را تضمین نمی‌کنند. بازار ارزهای دیجیتال پرنوسان است؛ هرگز پولی را که توان از دست دادن آن را ندارید ریسک نکنید.</p>')}</section>\n      </main>`;
  html = swap(html, /<main id="view" tabindex="-1">[\s\S]*?<\/main>/, main, 'main');
  return html;
}

const all = [...SECTIONS, ...COINS];
const outputs = new Map();
for (const p of all) outputs.set(path.join(root, p.path, 'index.html'), page(p));

const stamp = fs.readFileSync(path.join(root, 'version.txt'), 'utf8').trim().slice(0, 8);
const lastmod = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
outputs.set(path.join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map((p) => `  <url><loc>${SITE}${encodeURI(p.path)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);
outputs.set(path.join(root, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);

let stale = 0;
for (const [file, text] of outputs) {
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (now === text) continue;
  stale++;
  if (check) { console.error(`stale: ${path.relative(root, file)}`); continue; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
if (check && stale) { console.error(`${stale} file(s) out of date: run node tools/build-pages.mjs`); process.exit(1); }
console.log(check ? `pages, sitemap and robots.txt are up to date (${all.length} pages)` : `wrote ${stale} file(s); ${all.length} pages in the sitemap`);