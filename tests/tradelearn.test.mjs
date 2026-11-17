import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewTrades, decideChanges, activeLessons, tradeR, MIN_TRADES } from '../js/lib/tradelearn.js';
import { newState, replaySymbol, DEFAULT_CONFIG, logCheck } from '../js/lib/autotrader.js';

// گشت تصادفی قطعی همراه با روند، تا ربات معامله‌گر داده‌ای برای معامله داشته باشد.
function walk(n, seed = 7) {
  let x = seed, p = 100;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => {
    const o = p; p = p * (1 + (rnd() - 0.47) * 0.02);
    return { t: 1.7e12 + i * 36e5, o, h: Math.max(o, p) * (1 + rnd() * 0.004), l: Math.min(o, p) * (1 - rnd() * 0.004), c: p, v: 100 + rnd() * 50 };
  });
}

const trade = (i, { trendUp, adx = 30, rsi = 55, win, symbol = 'BTC' }) => ({
  symbol, entry: 100, initialStop: 98, qty: 10, riskCash: 20, pnl: win ? 40 : -20,
  openedAt: i * 1000, exitAt: i * 1000 + 500, reason: win ? 'target' : 'stop-loss', ctx: { trendUp, adx, rsi },
});

test('تابع tradeR نتیجه را بر حسب واحدهای پول ریسک‌شده اندازه می‌گیرد', () => {
  assert.equal(tradeR(trade(1, { trendUp: true, win: true })), 2);
  assert.equal(tradeR(trade(1, { trendUp: true, win: false })), -1);
});

test('بازنگری تا زمانی که به تعداد کافی معامله نرسد تغییری ایجاد نمی‌کند', () => {
  const few = Array.from({ length: MIN_TRADES - 1 }, (_, i) => trade(i, { trendUp: false, win: false }));
  const r = reviewTrades(few);
  assert.ok(r.findings[0].includes('نیازمند'));
  assert.deepEqual(decideChanges(r, { ...DEFAULT_CONFIG }).changes, []);
});

test('معاملات خلاف روندی که مداوم زیان می‌دهند، فیلتر روند را فعال می‌کنند', () => {
  const log = [
    ...Array.from({ length: 10 }, (_, i) => trade(i, { trendUp: false, win: i % 5 === 0 })),   // ۲۰٪ برد
    ...Array.from({ length: 10 }, (_, i) => trade(20 + i, { trendUp: true, win: i % 2 === 0 })), // ۵۰٪ برد
  ];
  const r = reviewTrades(log);
  const d = decideChanges(r, { ...DEFAULT_CONFIG, trendFilter: false }, [], log);
  assert.equal(d.cfgPatch.trendFilter, true);
  assert.ok(d.changes[0].text.includes('میانگین ۲۰۰ کندل'));
  assert.deepEqual(activeLessons({ ...DEFAULT_CONFIG, trendFilter: false, ...d.cfgPatch }), ['فقط زمانی خرید کن که قیمت بالاتر از میانگین ۲۰۰ کندل باشد']);
  // درسی که قبلاً فراموش شده دوباره یاد گرفته نمی‌شود
  assert.equal(decideChanges(r, { ...DEFAULT_CONFIG, trendFilter: false }, [{ lens: 'trend', undo: true }], log).cfgPatch.trendFilter, undefined);
});

test('فیلتری که نتایج را بدتر کرده بود دوباره غیرفعال می‌شود', () => {
  const at = 100000;
  const before = Array.from({ length: 12 }, (_, i) => ({ ...trade(i, { trendUp: true, win: i % 2 === 0 }) }));
  const after = Array.from({ length: 22 }, (_, i) => ({ ...trade(0, { trendUp: true, win: i % 7 === 0 }), openedAt: at + i * 1000, exitAt: at + i * 1000 + 500 }));
  const log = [...before, ...after];
  const cfg = { ...DEFAULT_CONFIG, trendFilter: true };
  const d = decideChanges(reviewTrades(log), cfg, [{ at, lens: 'trend', text: 'on' }], log);
  assert.equal(d.cfgPatch.trendFilter, false);
  assert.ok(d.changes.some((c) => c.undo));
});

test('پس از بازنشانی (Reset)، معامله‌گر هرگز کندل‌های پیش از آن را معامله نمی‌کند', () => {
  const candles = walk(600);
  const st = newState({ ...DEFAULT_CONFIG }, { liveFrom: candles[candles.length - 1].t + 1 });
  const r = replaySymbol(st, { ...DEFAULT_CONFIG, entryScore: -100 }, 'BTC', candles);
  assert.equal(r.processed, 0);
  assert.equal(st.closed.length + Object.keys(st.open).length, 0);
  logCheck(st, { kind: 'check', coins: 1 });
  assert.equal(st.log.length, 1);
});

test('ورودها بستر بازار را که بازنگری می‌خواند ثبت می‌کنند', () => {
  const candles = walk(700, 11);
  const st = newState({ ...DEFAULT_CONFIG });
  replaySymbol(st, { ...DEFAULT_CONFIG, entryScore: -100 }, 'ETH', candles);
  const p = st.closed[0] || Object.values(st.open)[0];
  assert.ok(p, 'موقعیتی باز شد');
  assert.equal(typeof p.ctx.trendUp, 'boolean');
  assert.ok(p.riskCash > 0);
  assert.equal(p.entryBar, -100);
});

test('مقدار R در برابر ریسک واقعی اندازه‌گیری می‌شود، نه ریسک در نظر گرفته شده', async () => {
  const { tradeR } = await import('../js/lib/tradelearn.js');
  // درخواست ریسک ۱۰٪ شده بود ($860) اما سقف پوزیشن اجازه داد تنها $50 در ریسک باشد
  const t = { entry: 1.0, initialStop: 0.98, qty: 2500, riskCash: 860, pnl: -50 };
  assert.ok(Math.abs(tradeR(t) + 1) < 1e-9);
  // معامله ثبت‌شده واقعی بدون حد ضرر مقداری برای R ندارد
  assert.equal(tradeR({ entry: 10, initialStop: null, qty: 1, pnl: 5 }), null);
});

test('تشخیص معاملات (Diagnosis)، لاگ زیان‌ده را با اعداد توضیح می‌دهد', async () => {
  const { diagnose } = await import('../js/lib/tradelearn.js');
  const H = 3600e3;
  const mk = (i, symbol, reason, pnl, extra = {}) => ({ symbol, reason, pnl, feePaid: 5, entry: 100, initialStop: 97, qty: 20, notional: 2000, openedAt: i * H, exitAt: i * H + 30 * H, ...extra });
  const log = [
    ...Array.from({ length: 6 }, (_, i) => mk(i, 'AAA', 'stop-loss', -60)),
    ...Array.from({ length: 4 }, (_, i) => mk(10 + i, 'BBB', 'signal reversal', -20)),
    mk(20, 'CCC', 'target', 180),
  ];
  const d = diagnose(log, { startingBalance: 10000 });
  const text = d.join('\n');
  assert.match(text, /از مجموع ۱۱ معامله، ۶ معامله با حد ضرر بسته شدند \(−\$360\)/);
  assert.match(text, /۱ معامله به هدف رسیدند \(\$180\)/);
  // برندگان +3R، بازندگان میانگین 0.73R: سر به سر شدن نیازمند 0.73 / 3.73 معادل 20% برنده است
  assert.match(text, /برای سر به سر شدن نیاز بود ۲۰٪ از معاملات برنده شوند؛ در حالی که ۹٪ برنده شدند\./);
  assert.match(text, /مجموع کارمزدها \$55 \(0\.5٪ از سرمایه اولیه\) بوده است/);
  assert.match(text, /بخش عمده‌ای از زیان مربوط به AAA \(۶ معامله، ۰ برد، −\$360\) بوده است/);
  // هر ده موقعیت زیان‌ده ۲۰۰۰ دلاری در ساعت ۱۳ باز بودند: ۲۰۰٪ سرمایه حساب
  assert.match(text, /ارزش پوزیشن‌های باز به ۲۰۰٪ از سرمایه اولیه رسید/);
  assert.deepEqual(diagnose(log.slice(0, 3)), [], 'تعداد معاملات برای نتیجه‌گیری بسیار کم است');
  // ترجمه اصطلاحات خاص و قالب‌بندی ارز سفارشی هنگام عبور از فرمت‌کننده
  const one = diagnose([...log.slice(0, 5), mk(30, 'DDD', 'signal reversal', -40)], { fmt: (v) => `${v < 0 ? '−' : ''}₨${Math.abs(v * 280).toFixed(0)}` }).join('\n');
  assert.match(one, /۱ معامله در پی تغییر روند فروخته شدند \(−₨11200\)/);
  assert.match(one, /DDD \(۱ معامله، ۰ برد/);
});