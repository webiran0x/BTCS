// فایل‌های قابل خزش برای موتورهای جستجو یعنی sitemap.xml و robots.txt را می‌نویسد.
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
// نحوه استفاده: node tools/build-pages.mjs [--site=https://btcs.ir/]   نوشتن همه موارد
//        node tools/build-pages.mjs --check  اگر هر فایلی روی دیسک قدیمی باشد با کد 1 خارج شود
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORECAST_TESTED } from '../js/lib/forecastview.js';
import { TESTED_ACCURACY } from '../js/lib/predict.js';
import { CHART_TESTED, TESTED_COINS } from '../js/lib/autotrader.js';
import { rangeLine, directionMeasured } from '../js/lib/learnguide.js';

const TESTED_CHARTS = Object.keys(CHART_TESTED).filter((k) => CHART_TESTED[k]?.standard);
const holdBeat = TESTED_CHARTS.filter((k) => {
  const x = CHART_TESTED[k];
  return x.hold > (x.adopt ? x.own : x.standard).ret;
}).length;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// آدرس سایت؛ پیش‌فرض روی دامنه اصلی btcs.ir تنظیم شده است
const arg = process.argv.find((a) => a.startsWith('--site='));
export const SITE = (arg ? arg.slice(7) : 'https://btcs.ir/').replace(/\/?$/, '/');
const BASE = new URL(SITE).pathname; // '/' برای https://btcs.ir/
const check = process.argv.includes('--check');

// نام‌های تاییدشده ارزها؛ سایر ارزها با نمادشان نام‌گذاری می‌شوند.
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
  ASTER: 'Aster', MORPHO: 'Morpho', SKY: 'Sky', HTX: 'HTX DAO', VVV: 'Venice Token', JST: 'JUST', GT: 'GateToken',
  NEXO: 'Nexo', ZRO: 'LayerZero', LIT: 'Litentry', NIGHT: 'Midnight', AKE: 'AKE', BDX: 'Beldex', TRUMP: 'Official Trump',
  GRASS: 'Grass', VIRTUAL: 'Virtuals Protocol', DRV: 'Derive', XPL: 'Plasma', FF: 'Falcon Finance', SPX: 'SPX6900',
  PIEVERSE: 'Pieverse', KITE: 'Kite', UB: 'Unibase', CARDS: 'Cards',
};
const VENUE = { binance: 'Binance', gate: 'Gate.io', htx: 'HTX', okx: 'OKX' };

const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const span = (xs) => {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
};

// ---------------------------------------------------------------- حقایق اندازه‌گیری‌شده
const centred = Object.values(FORECAST_TESTED.centred);
const rangeTests = centred.reduce((a, x) => a + x.tests, 0);
const facts = {
  coins: TESTED_COINS.length,
  band80: span(centred.map((x) => x.band80)),
  rangeTests: Math.round(rangeTests / 1000) * 1000,
  recheckTests: TESTED_ACCURACY.recheck?.tests,
};
const holdLoss = TESTED_CHARTS.filter((k) => {
  const x = CHART_TESTED[k];
  return (x.adopt ? x.own : x.standard).ret < 0;
}).length;

const traderMeasured = `در آخرین تست گام‌به‌گام (${CHART_TESTED.measuredOn}، ${CHART_TESTED.coins} ارز، با احتساب کارمزدها)، قوانین در ${holdLoss === TESTED_CHARTS.length ? 'هر یک' : `${holdLoss}`} مورد از ${TESTED_CHARTS.length} نمودار تست‌شده پول از دست دادند و نگهداری ساده همان ارزها در ${holdBeat === TESTED_CHARTS.length ? 'همه نمودارها' : `${holdBeat} مورد از آن‌ها`} عملکرد بهتری داشت.`;
const directionLine = 'هیچ مدلی نتوانسته است در پیش‌بینی جهت بعدی حرکت قیمت عملکردی بهتر از شانس داشته باشد، بنابراین این صفحه هرگز جهت خاصی را به عنوان سیگنال خرید یا فروش معرفی نمی‌کند.';

// ---------------------------------------------------------------- صفحات اصلی و ابزارها
const SECTIONS = [
  {
    route: '#/',
    path: '',
    canonicalPath: '',
    title: 'BTCS — قیمت زنده ارزهای دیجیتال، نمودارها، پیش‌بینی‌های تست‌شده و شبیه‌ساز هوش مصنوعی',
    desc: `قیمت‌های زنده و نمودار کندل‌استیک ارزهای دیجیتال برتر، بازه‌های پیش‌بینی تست‌شده روی ${facts.coins} ارز، شبیه‌ساز معاملات کاغذی هوش مصنوعی و سابقه عملکرد عمومی. تمامی ارقام اندازه‌گیری‌شده هستند؛ مشاوره مالی نیست.`,
    h1: 'قیمت‌های زنده ارزهای دیجیتال، نمودارها و پیش‌بینی‌های تست‌شده هوش مصنوعی',
    body: [
      'قیمت‌ها و نمودارهای بزرگ‌ترین ارزهای دیجیتال، از صرافی‌ای که هر کدام در آن معامله می‌شوند (ابتدا بایننس، سپس Gate.io و HTX). هر ارزی را برای مشاهده نمودار آن، ۱۳ اندیکاتور، پیش‌بینی بازه قیمتی و سیگنال معامله‌گر هوش مصنوعی باز کنید.',
      rangeLine,
      directionLine,
    ],
    more: {
      does: 'قیمت‌ها و نمودارهای زنده را نمایش می‌دهد، اندیکاتورها را امتیازدهی می‌کند، بازه قیمتی را پیش‌بینی می‌کند، به سوالات بر اساس آن داده‌ها پاسخ می‌دهد و یک شبیه‌ساز معاملات کاغذی را اجرا می‌کند.',
      measures: 'اینکه هر بازه پیش‌بینی چقدر اعتبار داشته، پیش‌بینی‌های جهت حرکت چقدر نسبت به یک مبنای ساده درست بوده‌اند، و قوانین معاملاتی پس از کسر کارمزد در مقایسه با نگهداری ساده چه نتیجه‌ای داشته‌اند.',
      not: 'این ابزار سفارشی ثبت نمی‌کند، دارایی یا کلیدی را نگهداری نمی‌کند و به شما نمی‌گوید چه چیزی بخرید. این یک ابزار آموزشی است، نه مشاوره مالی.',
      limits: 'نتایج اندازه‌گیری‌شده گذشته را توصیف می‌کنند. بازارها تغییر می‌کنند، فیدهای داده ممکن است با تأخیر مواجه شوند یا خطا بدهند، و بازه پیش‌بینی به طور طراحی‌شده از هر پنج بار حدود یک بار اشتباه خواهد بود.',
    },
  },
  {
    route: '#/scanner',
    path: 'scanner/',
    canonicalPath: 'scanner/',
    title: 'اسکنر ارزهای دیجیتال — امتیاز اندیکاتورها و فیلتر سیگنال | BTCS',
    desc: 'رتبه‌بندی ۲۰ تا ۵۰ ارز برتر بر اساس میزان توافق قوی اندیکاتورها، همراه با پیش‌بینی و سیگنال هوش مصنوعی و فیلترهای صعودی، نزولی، اشباع فروش و اشباع خرید.',
    h1: 'اسکنر ارزهای دیجیتال',
    body: ['رتبه‌بندی ۲۰ تا ۵۰ ارز برتر بر اساس میزان توافق قوی اندیکاتورهای آن‌ها، همراه با همان پیش‌بینی و سیگنال هوش مصنوعی در صفحه هر ارز. دارای فیلترهای صعودی، نزولی، اشباع فروش و اشباع خرید.'],
    more: {
      does: 'هشت اندیکاتور را برای هر یک از ارزهای برتر در نمودار انتخابی شما می‌خواند و آن‌ها را بر اساس میزان توافق خوانش‌ها رتبه‌بندی می‌کند.',
      measures: 'عملکرد قیمت پس از هر سطح امتیاز، در هر نمودار، تا بتوانید ببینید کدام خوانش‌ها حاوی اطلاعات بوده‌اند و کدام‌یک خیر.',
      not: 'امتیاز بالا سیگنال خرید نیست و امتیاز پایین سیگنال فروش نیست؛ تست‌ها تمایل معکوسی را در نقاط افراطی نشان دادند.',
      limits: 'اندیکاتورها صرفاً بر اساس قیمت‌های گذشته ساخته شده‌اند. آن‌ها هیچ چیزی درباره اخبار، نقدینگی یا رویدادهایی که هنوز رخ نداده‌اند نمی‌گویند.',
    },
  },
  {
    route: '#/trader',
    path: 'trader/',
    canonicalPath: 'trader/',
    title: 'شبیه‌ساز معاملات هوش مصنوعی ارز دیجیتال — بک‌تست و حساب دمو | BTCS',
    desc: `معامله‌گر هوش مصنوعی با قوانین تست‌شده گام‌به‌گام روی قیمت‌های زنده و پول مجازی، همراه با حساب دمو، ثبت معاملات واقعی و نتایج تست روی ${facts.coins} ارز. هیچ سفارشی ثبت نمی‌شود.`,
    h1: 'شبیه‌ساز معاملات هوش مصنوعی',
    body: [
      'یک معامله‌گر هوش مصنوعی که با پول شبیه‌سازی‌شده روی قیمت‌های زنده و با استفاده از قوانین تست‌شده گام‌به‌گام روی هر ارز قابل معامله (با احتساب کارمزد) خرید و فروش می‌کند. این ربات هیچ سفارشی در هیچ صرافی ثبت نمی‌کند.',
      `در هر نمودار، صفحه نشان می‌دهد که همان قوانین در تست چه نتیجه‌ای کسب کرده‌اند، بیشترین افت سرمایه چقدر بوده و نگهداری ساده ارزها چه بازدهی داشته است. ${traderMeasured} صفحه هر دو مورد را به همراه بیشترین افت سرمایه نشان می‌دهد.`,
    ],
    more: {
      does: 'یک حساب آزمایشی برای معامله دستی، یک حساب هوش مصنوعی که به‌طور خودکار از قوانین پیروی می‌کند، و سابقه معاملات واقعی شما در سایر صرافی‌ها را اجرا می‌کند که همگی به یک روش سنجیده می‌شوند.',
      measures: 'بازدهی پس از کسر کارمزد، بیشترین افت سرمایه (با احتساب معاملات باز)، تعداد معاملات و نرخ برد، در مقایسه با عملکرد نگهداری ساده همان ارزها در دوره‌های مشابه.',
      not: 'هرگز سفارش واقعی ثبت نمی‌کند، هیچ دارایی یا کلید صرافی را نگه نمی‌دارد و راهی تضمینی برای سود نیست. نتایج شبیه‌سازی‌شده نتایج واقعی نیستند.',
      limits: 'سفارش‌های شبیه‌سازی‌شده با قیمت کندل پر می‌شوند. سفارش‌های واقعی مشمول اسپرد و لغزش قیمت می‌شوند، ممکن است به صورت جزئی یا کلی پر نشوند، و صرافی‌ها ممکن است متوقف شوند. قوانین سفارشی بخشی از تست نبوده‌اند.',
    },
    sections: [
      {
        h2: 'توضیح حساب‌ها و استراتژی‌ها',
        list: [
          'حساب آزمایشی (Demo): پول مجازی که به صورت دستی برای تمرین بدون ریسک معامله می‌کنید.',
          'حساب هوش مصنوعی (AI): پول مجازی که بر اساس قوانین انتخابی شما، روی قیمت‌های زنده در مرورگر و در صورت ورود به حساب در فضای ابری معامله می‌شود.',
          'حساب واقعی (Real): سوابقی از معاملاتی که شخصاً در یک صرافی انجام داده‌اید، به صورت دستی وارد یا درون‌ریزی شده‌اند. برنامه سفارشی ثبت نمی‌کند.',
          'استراتژی پیش‌فرض تست‌شده: قوانین هر نمودار که با احتساب کارمزدها و هزینه‌های پر شدن سفارش از تست گام‌به‌گام عبور کرده‌اند. نتیجه آن‌ها چه خوب و چه بد نمایش داده می‌شود.',
          'استراتژی سفارشی: تنظیمات شخصی شما. این موارد تست نشده‌اند، بنابراین آمارهای تست‌شده درباره آن‌ها صدق نمی‌کند؛ نگاه به گذشته روی همان تاریخچه آن‌ها را ایده‌آل جلوه می‌دهد.',
        ],
      },
    ],
  },
  {
    route: '#/learn',
    path: 'learn/',
    canonicalPath: 'learn/',
    title: 'چگونگی یادگیری هوش مصنوعی و روش ارزیابی گام‌به‌گام | BTCS',
    desc: 'نحوه امتیازدهی هر اندیکاتور، بازه پیش‌بینی و معامله‌گر هوش مصنوعی بر اساس رفتار واقعی بازار: تست‌های گام‌به‌گام، رکورد زنده ابری و موارد ردشده.',
    h1: 'چگونگی یادگیری هوش مصنوعی و روش تست آن',
    body: [
      'هر سیگنال در فضای ابری (صرف‌نظر از اینکه صفحه‌ای باز باشد یا خیر) بر اساس رفتار بعدی بازار ارزیابی می‌شود. یک روش تنها زمانی کنترل را به دست می‌گیرد که در آن سابقه بر روش فعلی غلبه کند، و اگر عملکرد خود را از دست دهد تنزل می‌یابد.',
      directionMeasured,
      rangeLine,
    ],
    more: {
      does: 'هر سیگنال، پیش‌بینی و معامله را پیش از مشخص شدن نتیجه ثبت می‌کند، پس از رسیدن موعد به آن امتیاز می‌دهد، و وزن را به سمت روش‌هایی که سوددهی خود را حفظ کرده‌اند منتقل می‌کند.',
      measures: 'میزان اعتبار بازه‌های پیش‌بینی، نرخ موفقیت پیش‌بینی جهت در مقایسه با یک مبنا، و بازدهی معاملات پس از کارمزد در مقایسه با نگهداری ساده.',
      not: 'هوش مصنوعی از داده‌های شخصی شما یاد نمی‌گیرد، آینده را نمی‌بیند، و روشی را که شکست خورده به عنوان پیشنهاد ارائه نمی‌دهد.',
      limits: 'هر رقم بازه‌ای را که در آن اندازه‌گیری شده توصیف می‌کند. روشی که کار می‌کرده ممکن است با تغییر بازار متوقف شود، به همین دلیل تست‌ها به طور مداوم اجرا می‌شوند.',
    },
  },
  {
    route: '#/track',
    path: 'track/',
    canonicalPath: 'track/',
    title: 'سابقه عملکرد عمومی سیگنال‌های ثبت‌شده | BTCS',
    desc: 'ثبت عمومی هر سیگنال پیش از مشخص شدن نتیجه و مقایسه نرخ موفقیت آن با مبنای پیش‌بینی همیشه رایج‌ترین حالت.',
    h1: 'سابقه عملکرد عمومی',
    body: ['هر سیگنال پیش از مشخص شدن نتیجه ثبت شده و پس از گذشت افق زمانی، در مقایسه با نرخ موفقیتِ پیش‌بینیِ همیشه رایج‌ترین حالت امتیازدهی می‌شود.'],
  },
  {
    route: '#/advice',
    path: 'advice/',
    canonicalPath: 'advice/',
    title: 'اسکن بازار ارزهای دیجیتال و وزن‌دهی مبتنی بر دقت | BTCS',
    desc: 'اسکن دارایی‌ها و ارزهای برتر در تایم‌فریم‌های مختلف با وزن‌دهی هر خوانش بر اساس دقت اندازه‌گیری‌شده واقعی آن.',
    h1: 'اسکن بازار',
    body: ['دارایی‌ها و ارزهای برتر شما را در چند تایم‌فریم اسکن کرده و به هر خوانش بر اساس دقت اندازه‌گیری‌شده‌اش وزن می‌دهد، بنابراین خوانشی که هرگز قابل اعتماد نبوده ارزش بسیار کمی خواهد داشت.'],
  },
  {
    route: '#/compare',
    path: 'compare/',
    canonicalPath: 'compare/',
    title: 'مقایسه ارزهای دیجیتال — بازدهی، نوسان، افت سرمایه و همبستگی | BTCS',
    desc: 'مقایسه هم‌زمان تا شش ارز دیجیتال از نظر عملکرد نرمال‌شده، نوسان، بیشترین افت سرمایه، بازدهی در برابر ریسک و ماتریس همبستگی.',
    h1: 'مقایسه ارزها',
    body: ['مقایسه حداکثر شش ارز در کنار یکدیگر: عملکرد نرمال‌شده، نوسان، بیشترین افت سرمایه، بازدهی در برابر ریسک و میزان همبستگی حرکتی آن‌ها.'],
  },
  {
    route: '#/futures',
    path: 'futures/',
    canonicalPath: 'futures/',
    title: 'فیوچرز ارز دیجیتال — فاندینگ ریت، سود باز و نسبت لانگ/شورت | BTCS',
    desc: 'مشاهده نرخ تامین مالی (Funding Rates)، سود باز (Open Interest) و نسبت پوزیشن‌های خرید به فروش در بازارهای اصلی معاملات آتی.',
    h1: 'معاملات آتی (Futures)',
    body: ['نرخ‌های تامین مالی (Funding rates)، سود باز (Open interest) و نسبت موقعیت‌های خرید به فروش در بازارهای اصلی معاملات آتی پرپچوال.'],
  },
  {
    route: '#/news',
    path: 'news/',
    canonicalPath: 'news/',
    title: 'اخبار ارزهای دیجیتال و قیمت زنده مرتبط | BTCS',
    desc: 'آخرین عناوین اخبار ارزهای دیجیتال از منابع عمومی در کنار قیمت زنده و نمودار کوین‌های مرتبط.',
    h1: 'اخبار ارزهای دیجیتال',
    body: ['سرتیتر اخبار اخیر از منابع عمومی ارزهای دیجیتال.'],
  },
  {
    route: '#/tools',
    path: 'tools/',
    canonicalPath: 'tools/',
    title: 'ابزارهای کریپتو — مبدل ارزی، بک‌تست DCA و محاسبه‌گر حجم | BTCS',
    desc: 'مبدل ارزی، بک‌تست میانگین‌گیری هزینه دلاری (DCA) روی قیمت‌های واقعی و محاسبه‌گر اندازه پوزیشن با کنترل ریسک هر معامله.',
    h1: 'ابزارهای ارز دیجیتال',
    body: ['یک مبدل ارزی، تست استراتژی میانگین‌گیری هزینه دلاری (DCA) روی قیمت‌های واقعی، و ابزار تعیین حجم پوزیشن که هر معامله را در ریسک تعیین‌شده نگه می‌دارد.'],
  },
  {
    route: '#/exchanges',
    path: 'exchanges/',
    canonicalPath: 'exchanges/',
    title: 'صرافی‌های ارز دیجیتال — رتبه‌بندی حجم معاملات و منبع داده | BTCS',
    desc: 'رتبه‌بندی صرافی‌های اصلی ارز دیجیتال بر اساس حجم معاملات و مشخص شدن منابع دریافت قیمت و کندل زنده در برنامه.',
    h1: 'صرافی‌های ارز دیجیتال',
    body: ['صرافی‌های اصلی بر اساس حجم معاملات.'],
  },
  {
    route: '#/ai',
    path: 'ai/',
    canonicalPath: 'ai/',
    title: 'دستیار هوش مصنوعی ارز دیجیتال مبتنی بر داده‌های زنده | BTCS',
    desc: 'پرسش درباره هر ارز، بازار یا معامله‌گر هوش مصنوعی با پاسخ‌های مبتنی بر قیمت زنده، مدل‌های تست‌شده و ذکر منبع و اعتبارسنجی اعداد.',
    h1: 'دستیار هوش مصنوعی ارز دیجیتال',
    body: [
      'درباره هر ارز، بازار یا معامله‌گر هوش مصنوعی خود سوال کنید. پاسخ‌ها از قیمت‌های زنده و مدل‌های تست‌شده برنامه در مرورگر شما ساخته می‌شوند و مشخص می‌کنند بر چه اساسی ارائه شده‌اند.',
      'هر پاسخ منبع خود را نام می‌برد (قیمت‌های زنده، سیگنال‌ها، پیش‌بینی، حساب شبیه‌سازی‌شده شما) و نویسنده متن را مشخص می‌کند: تحلیلگر داخلی یا مدل زبانی که صرفاً پاسخ تحلیلگر را بازنویسی کرده و از نظر وجود اعداد نامعتبر بررسی می‌شود.',
    ],
    more: {
      does: 'به سوالات درباره ارزها، بازار، مقایسه‌ها، ریسک و حساب معاملات کاغذی شما بر اساس داده‌های زنده و مدل‌های اندازه‌گیری‌شده پاسخ می‌دهد.',
      measures: 'چیز جدیدی نیست: اعدادی را که سایر بخش‌های برنامه اندازه‌گیری کرده‌اند به همراه دقت‌شان گزارش می‌کند و داده‌های تأییدشده پشت هر پاسخ را نشان می‌دهد.',
      not: 'قیمت‌ها را با قطعیت پیش‌بینی نمی‌کند، معامله‌ای ثبت نمی‌کند و اعدادی را از خود ابداع نمی‌کند. پاسخی که اعدادی خارج از داده‌ها را نقل کند با پاسخ خود تحلیلگر جایگزین می‌شود.',
      limits: 'در مواردی که مستندات ضعیف باشد به صراحت اعلام می‌کند. پیش‌بینی‌های جهت در تست‌ها نتوانسته‌اند از شانس بهتر عمل کنند، و مدل زبانی ممکن است متن را ضعیف بیان کند. این مشاوره مالی نیست.',
    },
  },
  {
    route: '#/alerts',
    path: 'alerts/',
    canonicalPath: 'alerts/',
    title: 'هشدار قیمت و اندیکاتور ارزهای دیجیتال | BTCS',
    desc: 'تنظیم هشدار قیمت و سیگنال برای ارزهای دیجیتال با دریافت اعلان در مرورگر، ایمیل یا تلگرام.',
    h1: 'هشدارهای قیمتی',
    body: ['تنظیم هشدارهای قیمت و سیگنال برای هر ارز دیجیتال.'],
  },
  {
    route: '#/wallet',
    path: 'wallet/',
    canonicalPath: 'wallet/',
    title: 'مشاهده موجودی کیف پول ارز دیجیتال (فقط‌خواندنی) | BTCS',
    desc: 'مشاهده موجودی کیف پول به صورت کاملاً فقط‌خواندنی بدون درخواست کلید خصوصی، سید یا امضا.',
    h1: 'کیف پول',
    body: ['اتصال کیف پول به صورت فقط‌خواندنی برای مشاهده موجودی‌ها. برنامه هرگز کلید خصوصی، عبارت بازیابی یا امضایی درخواست نمی‌کند.'],
  },
  {
    route: '#/premium',
    path: 'premium/',
    canonicalPath: 'premium/',
    title: 'پلن‌های اشتراک رایگان و پریمیوم | BTCS',
    desc: 'بررسی امکانات پلن رایگان، قابلیت‌های نسخه پریمیوم و شفافیت درباره محدودیت‌ها و عدم تضمین بازدهی.',
    h1: 'پلن‌های اشتراکی',
    body: ['امکانات پلن رایگان و ویژگی‌های نسخه پریمیوم.'],
  },
  {
    route: '#/legal/terms',
    path: 'legal/terms/',
    canonicalPath: 'legal/terms/',
    title: 'شرایط استفاده | BTCS',
    desc: 'شرایط استفاده از BTCS به عنوان ابزار آموزشی تحلیل بازار ارزهای دیجیتال، نه مشاوره مالی یا کارگزاری.',
    h1: 'شرایط استفاده',
    body: ['شرایط حاکم بر استفاده از BTCS.'],
  },
  {
    route: '#/legal/privacy',
    path: 'legal/privacy/',
    canonicalPath: 'legal/privacy/',
    title: 'سیاست حفظ حریم خصوصی | BTCS',
    desc: 'شفافیت درباره داده‌های ذخیره‌شده روی دستگاه و سرور در BTCS، دلیل نگهداری، مدت زمان و روش حذف آن‌ها.',
    h1: 'سیاست حفظ حریم خصوصی',
    body: ['مواردی که برنامه روی دستگاه شما و سرور خود ذخیره می‌کند و مدت زمان نگهداری آن‌ها.'],
  },
  {
    route: '#/legal/risk',
    path: 'legal/risk/',
    canonicalPath: 'legal/risk/',
    title: 'سلب مسئولیت ریسک معاملات ارز دیجیتال | BTCS',
    desc: 'آگاهی از ریسک‌های بازار ارزهای دیجیتال و محدودیت‌های پیش‌بینی‌ها، سیگنال‌ها و شبیه‌سازی‌ها.',
    h1: 'سلب مسئولیت ریسک',
    body: ['بازار ارزهای دیجیتال پرنوسان است. هیچ پیش‌بینی، سیگنال یا شبیه‌سازی در این سایت مشاوره مالی نیست و نتایج گذشته تضمینی برای آینده نیستند.'],
  },

  {
    route: '#/guide',
    path: 'guide/',
    canonicalPath: 'guide/',
    title: 'راهنمای جامع پلتفرم تحلیلی و شبیه‌ساز معاملاتی رمزارزها | BTCS',
    desc: 'راهنمای کامل ۸ فصلی BTCS برای تریدرهای تازه‌کار، میان‌رده و پیشرفته: بازارها، تحلیل نمودار، اسکنر، پیش‌بینی هوش مصنوعی، سابقه عملکرد، شبیه‌ساز معاملات، هشدارها و مدیریت ریسک.',
    h1: 'راهنمای جامع پلتفرم تحلیلی و شبیه‌ساز معاملاتی رمزارزها (BTCS)',
    body: [
      'این راهنما نشان می‌دهد هر بخش از BTCS — از نمای کلی بازار و نمودارهای تک‌ارزی تا موتور پیش‌بینی، سابقه عملکرد عمومی، شبیه‌ساز معاملات و مدیریت ریسک — در عمل چه کمکی به تریدر در سطوح مختلف می‌کند.',
      'BTCS صرافی نیست، سفارش واقعی ثبت نمی‌کند و دارایی یا کلید خصوصی نگهداری نمی‌کند؛ تمامی ابزارها برای تحلیل، تمرین و سنجش واقع‌گرایانه در اختیار شما قرار گرفته‌اند.',
    ],
    more: {
      does: 'ساختار ۸ فصل راهنما را برای مسیرهای تحلیلی، آموزشی، شبیه‌سازی، هشدارها و مدیریت ریسک در BTCS توضیح می‌دهد.',
      measures: 'تفاوت کاربرد هر ابزار را برای تریدر تازه‌کار، میان‌رده و پیشرفته و همچنین پایش سیستم و سابقه عملکرد روشن می‌کند.',
      not: 'توصیه سرمایه‌گذاری یا تضمین سود ارائه نمی‌دهد و جایگزین مدیریت ریسک و حد ضرر شخصی نیست.',
      limits: 'نتایج گذشته و شبیه‌سازی‌ها بازدهی آینده را تضمین نمی‌کنند و بازار رمزارزها همواره با نوسان و ریسک همراه است.',
    },
    sections: [
      {
        h2: 'فهرست ۸ فصل راهنمای تریدر',
        list: [
          'فصل ۱ — بازارها و ناوبری (#/): نمای کلی بازار، شاخص ترس و طمع، واچ‌لیست و روال روزانه.',
          'فصل ۲ — تحلیل تک‌ارزی و نمودارها (#/coin/...): اندیکاتورها، پلن معاملاتی، بک‌تست، الگوها، دفتر سفارش و اخبار.',
          'فصل ۳ — اسکنر، مقایسه، فیوچرز، صرافی‌ها و اخبار: غربال فرصت‌ها، مقایسه چند ارز، فاندینگ/سود باز و اخبار.',
          'فصل ۴ — موتور پیش‌بینی بازه قیمتی و هوش مصنوعی: درک بازه نوسان، تایمینگ و گفتگوی هدفمند با دستیار هوشمند.',
          'فصل ۵ — یادگیری، خودارزیابی و سابقه عملکرد (#/learn، #/track): ضریب اعتماد تایم‌فریم‌ها و مقایسه حساب‌های هوش مصنوعی، دمو و واقعی.',
          'فصل ۶ — شبیه‌ساز معاملات، تریدر خودکار و ابزارها (#/trader، #/tools): تمرین بدون ریسک سرمایه واقعی، اندازه پوزیشن، DCA و بکاپ.',
          'فصل ۷ — کیف پول، هشدارها، حساب کاربری و اشتراک ویژه (#/wallet، #/alerts، #/account، #/premium): هشدارهای قیمت/سیگنال و کانال‌های اعلان.',
          'فصل ۸ — مدیریت ریسک، قوانین استفاده و پنل مدیریت: حفظ سرمایه، محدودیت‌های مدل‌ها و پایش آمار و سیستم.',
        ],
      },
    ],
  },
];

const universe = JSON.parse(fs.readFileSync(path.join(root, 'tools/universe.json'), 'utf8'));
const slug = (sym) => sym.toLowerCase();

const COINS = universe.coins.map((c) => {
  const sym = c.symbol;
  const name = NAMES[sym];
  const label = name && name !== sym ? `${name} (${sym})` : sym;
  const venue = VENUE[c.venue] || c.venue;
  const coinSlug = slug(sym);
  const canonicalPath = `coin/${encodeURIComponent(coinSlug)}/`;
  return {
    route: `#/coin/${sym}`,
    path: `coin/${coinSlug}/`,
    canonicalPath,
    coin: sym,
    title: `قیمت ${label}، نمودار زنده، اندیکاتورها و پیش‌بینی هوش مصنوعی | BTCS`,
    desc: `قیمت زنده و نمودار کندل‌استیک ${label} از ${venue}، ۱۳ اندیکاتور تکنیکال، بازه پیش‌بینی تست‌شده روی ${facts.coins} ارز و سیگنال شبیه‌سازی‌شده هوش مصنوعی با سابقه اندازه‌گیری‌شده.`,
    h1: `قیمت، نمودار و پیش‌بینی هوش مصنوعی ${label}`,
    more: {
      does: `قیمت و نمودار زنده ${label}، ۱۳ اندیکاتور، پیش‌بینی بازه قیمتی آموزش‌دیده روی کندل‌های خود ${sym} در مرورگر شما، و سیگنال معامله‌گر هوش مصنوعی را نمایش می‌دهد.`,
      measures: 'اینکه بازه پیش‌بینی در بین ارزهای تست‌شده چقدر اعتبار داشته است، و نتیجه تست گام‌به‌گام معامله‌گر هوش مصنوعی در هر نمودار چگونه بوده است.',
      not: `این ابزار نمی‌گوید که ${label} را بخرید یا بفروشید، سفارشی ثبت نمی‌کند، و از اخبار پیش از انتشار مطلع نیست.`,
      limits: 'پیش‌بینی‌های جهت حرکت نتوانسته‌اند از یک مبنای ساده بهتر عمل کنند، و هر رقم گذشته را توصیف می‌کند. مشاوره مالی نیست.',
    },
    body: [
      `قیمت زنده و نمودار کندل‌استیک ${label} از ${venue} دریافت می‌شود. هنگامی که صفحه را باز می‌کنید، برنامه مدل‌های پیش‌بینی خود را روی کندل‌های خود ${sym} در مرورگر شما آموزش می‌دهد و بازه قیمتی حاصل برای کندل‌های بعدی، اندیکاتورها و سیگنال معامله‌گر هوش مصنوعی برای ${label} را نمایش می‌دهد.`,
      rangeLine,
      directionLine,
    ],
  };
});

// ---------------------------------------------------------------- رندر کردن HTML سئوشده
const template = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const swap = (html, re, to, what) => {
  if (!re.test(html)) throw new Error(`index.html: no ${what} to replace`);
  return html.replace(re, to);
};

function page(p) {
  const canonicalUrl = SITE + (p.canonicalPath ?? encodeURI(p.path));
  const crumbs = [{ name: 'BTCS', url: SITE }];
  if (p.coin) crumbs.push({ name: 'Coins', url: SITE }, { name: p.coin, url: canonicalUrl });
  else if (p.path) crumbs.push({ name: p.h1, url: canonicalUrl });

  const ld = p.path === ''
    ? [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'BTCS',
          url: SITE,
          inLanguage: 'fa-IR',
          description: p.desc,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'BTCS',
          url: SITE,
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Any (web browser)',
          description: p.desc,
        },
      ]
    : [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: p.title,
          url: canonicalUrl,
          inLanguage: 'fa-IR',
          description: p.desc,
          isPartOf: { '@type': 'WebSite', name: 'BTCS', url: SITE },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: crumbs.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.name,
            item: c.url,
          })),
        },
      ];

  const seoMetaBlock = [
    `<meta name="description" content="${esc(p.desc)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">`,
    `<meta property="og:site_name" content="BTCS">`,
    `<meta property="og:locale" content="fa_IR">`,
    `<meta property="og:type" content="${p.path === '' ? 'website' : 'article'}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(p.title)}">`,
    `<meta name="twitter:description" content="${esc(p.desc)}">`,
  ].join('\n  ');

  let html = template;
  html = swap(
    html,
    /<html lang="[^"]*"[^>]*>/,
    `<html lang="fa" dir="rtl" data-theme="dark"${p.path ? ` data-route="${esc(p.route)}"` : ''}>`,
    'html tag',
  );

  // اگر BASE روی '/' باشد از ریشه دامنه و در غیر این صورت از مسیر پایه استفاده می‌کند
  if (p.path) {
    html = swap(
      html,
      /<meta charset="utf-8">/i,
      `<meta charset="utf-8">\n  <base href="/">`,
      'charset',
    );
  }

  html = swap(html, /<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`, 'title');
  html = swap(html, /<meta name="description" content="[^"]*">/, seoMetaBlock, 'description');

  if (/<meta property="og:title" content="[^"]*">/.test(html)) {
    html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(p.title)}">`);
  }
  if (/<meta property="og:description" content="[^"]*">/.test(html)) {
    html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(p.desc)}">`);
  }
  if (/<meta property="og:url" content="[^"]*">/.test(html)) {
    html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(canonicalUrl)}">`);
  }
  if (/<link rel="canonical" href="[^"]*">/.test(html)) {
    html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(canonicalUrl)}">`);
  }

    const __ldBlock = `<!-- ld:start -->\n${ld.map((x) => `  <script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}\n  <!-- ld:end -->`;
    if (/<!-- ld:start -->[\s\S]*?<!-- ld:end -->/.test(html)) {
      html = swap(html, /<!-- ld:start -->[\s\S]*?<!-- ld:end -->/, __ldBlock, 'structured data');
    } else if (/<script type="application\/ld\+json">[\s\S]*?<\/script>(\s*<script type="application\/ld\+json">[\s\S]*?<\/script>)*/.test(html)) {
      html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>(\s*<script type="application\/ld\+json">[\s\S]*?<\/script>)*/, __ldBlock);
    } else {
      html = html.replace("</head>", `  ${__ldBlock}\n</head>`);
    }

  const links = p.coin
    ? `<a class="btn primary" href="${esc(p.route)}">مشاهده نمودار زنده ${esc(p.coin)}</a> <a class="btn" href="#/trader">شبیه‌ساز معاملات هوش مصنوعی</a> <a class="btn" href="#/learn">آموزش</a>`
    : `<a class="btn primary" href="${esc(p.route)}">مشاهده ${esc(p.h1)}</a>${p.route === '#/learn' ? '' : ' <a class="btn" href="#/learn">آموزش</a>'}`;

  const n = (t) => `\n          ${t}`;
  const more = p.more
    ? n(`<ul class="facts" aria-label="در یک نگاه">${[
        ['عملکرد', p.more.does],
        ['معیارهای اندازه‌گیری', p.more.measures],
        ['مواردی که انجام نمی‌دهد', p.more.not],
        ['محدودیت‌ها', p.more.limits],
      ].map(([k, v]) => `<li><b>${k}</b><p>${esc(v)}</p></li>`).join('')}</ul>`)
    : '';

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

// تاریخ lastmod بر اساس version.txt یا تاریخ فعلی 2026
const rawStamp = fs.existsSync(path.join(root, 'version.txt'))
  ? fs.readFileSync(path.join(root, 'version.txt'), 'utf8').trim()
  : '';
const digits = rawStamp.replace(/\D/g, '').slice(0, 8);
const lastmod = digits.length === 8
  ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  : new Date().toISOString().slice(0, 10);

outputs.set(
  path.join(root, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map((p) => `  <url><loc>${SITE}${p.canonicalPath ?? encodeURI(p.path)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`,
);

outputs.set(
  path.join(root, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`,
);

let stale = 0;
for (const [file, text] of outputs) {
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (now === text) continue;
  stale++;
  if (check) {
    console.error(`stale: ${path.relative(root, file)}`);
    continue;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

if (check && stale) {
  console.error(`${stale} file(s) out of date: run node tools/build-pages.mjs`);
  process.exit(1);
}

console.log(
  check
    ? `pages, sitemap and robots.txt are up to date (${all.length} pages)`
    : `wrote ${stale} file(s); ${all.length} pages in the sitemap`,
);