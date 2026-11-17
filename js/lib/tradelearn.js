// بازنگری خودکار معامله‌گر هوشمند: این ماژول گزارش معاملات را می‌خواند و قوانین خود را تغییر می‌دهد.
//
// هر معامله‌ای که ربات معامله‌گر ثبت می‌کند، وضعیت بازار در لحظه خرید (روند، اندیکاتورهای ADX، RSI، نوسان —
// به بخش `ctx` در autotrader.js مراجعه کنید) را ذخیره می‌کند. پس از بسته شدن تعداد کافی معامله،
// این ماژول آن‌ها را بر اساس شرایط دسته‌بندی می‌کند، شرایطی را که مداوم زیان می‌دهند شناسایی کرده
// و فیلتری را برای اجتناب از آن‌ها فعال می‌کند. همچنین اگر معاملات انجام‌شده پس از فعال‌سازی یک فیلتر
// عملکرد بدتری نسبت به قبل داشته باشند، آن فیلتر را غیرفعال می‌کند — به این ترتیب درس‌های اشتباه "فراموش می‌شوند".
//
// قوانین صداقت، درست مانند سایر بخش‌های اپلیکیشن:
// - هرگز بر اساس تعداد انگشت‌شماری معامله تصمیمی گرفته نمی‌شود: هر دسته نیازمند حداقل MIN_GROUP معامله،
//   کل لاگ نیازمند MIN_TRADES و هر تغییر نیازمند یک فاصله معنادار (و نه خطای گرد کردن) است؛
// - هر تغییر با جزئیات اعداد پشت آن در یک گزارش تغییرات قابل مشاهده ثبت می‌شود؛
// - این ماژول فقط فیلترهای معامله‌گر خودکار را تغییر می‌دهد و هرگز دستور واقعی ثبت نمی‌کند.

export const MIN_TRADES = 12;    // حداقل معاملات بسته شده پیش از آنکه بازنگری بتواند تغییری ایجاد کند
export const MIN_GROUP = 10;     // حداقل تعداد معاملات یک شرط پیش از آنکه قابل قضاوت باشد (عدد ۶ به عنوان نویز شناخته شد)
const GAP_R = 0.25;              // میزان افت بیشتر (بر حسب R) که یک شرط باید داشته باشد تا روی آن اقدام شود

const r2 = (v) => Math.round(v * 100) / 100;

/** نتیجه یک معامله بر حسب R: سود یا زیان به عنوان ضریبی از سرمایه ریسک‌شده. */
export function tradeR(t) {
  // ریسک واقعی برابر است با فاصله نقطه ورود تا حد ضرر ضرب در مقدار خریداری شده. معاملات هوش مصنوعی قدیمی‌تر
  // ریسک مورد نظر (درصد ریسک از موجودی) را ذخیره می‌کردند که سقف ۲۵٪ پوزیشن اغلب آن را اصلاح می‌کرد:
  // در ریسک ۱۰٪، معامله‌ای که می‌توانست ۵۰ دلار ضرر داشته باشد به عنوان ریسک ۸۶۰ دلاری ثبت می‌شد،
  // بنابراین مقدار R آن بیست برابر کوچکتر از مقدار واقعی به نظر می‌رسید.
  const actual = Number.isFinite(t.entry) && Number.isFinite(t.initialStop) && Number.isFinite(t.qty) ? Math.abs(t.entry - t.initialStop) * t.qty : null;
  const risk = actual > 0 ? actual : t.riskCash;
  // معامله‌ای که بدون حد ضرر ثبت شده باشد ریسک مشخصی ندارد، بنابراین R هم ندارد.
  return risk > 0 && Number.isFinite(risk) ? t.pnl / risk : null;
}

function summarise(trades) {
  const n = trades.length;
  if (!n) return { n: 0, winRate: null, avgR: null, totalR: 0 };
  const rs = trades.map(tradeR).filter((r) => r !== null);
  const wins = trades.filter((t) => t.pnl > 0).length;
  const totalR = rs.reduce((a, b) => a + b, 0);
  return { n, winRate: Math.round((wins / n) * 100), avgR: rs.length ? r2(totalR / rs.length) : null, totalR: r2(totalR) };
}

// شرایطی که می‌توان معاملات را بر اساس آن‌ها دسته‌بندی کرد. هر کدام به فیلتری متصل می‌شوند
// که از سمت زیان‌ده آن جلوگیری می‌کند.
const LENSES = [
  {
    key: 'trend', title: 'روند در زمان ورود',
    side: (t) => (t.ctx?.trendUp === undefined ? null : t.ctx.trendUp ? 'with' : 'against'),
    labels: { with: 'خرید بالاتر از میانگین ۲۰۰ کندل (هم‌روستا با روند)', against: 'خرید پایین‌تر از میانگین ۲۰۰ کندل (خلاف روند)' },
    bad: 'against', fix: { trendFilter: true }, undo: { trendFilter: false },
    fixText: 'فقط زمانی خرید کن که قیمت بالاتر از میانگین ۲۰۰ کندل باشد',
  },
  {
    key: 'adx', title: 'قدرت روند در زمان ورود',
    side: (t) => (t.ctx?.adx == null ? null : t.ctx.adx >= 20 ? 'trending' : 'ranging'),
    labels: { trending: 'خرید در بازار رونددار (شاخص ADX بالای ۲۰)', ranging: 'خرید در بازار رنج/بدون روند (شاخص ADX زیر ۲۰)' },
    bad: 'ranging', fix: { minAdx: 20 }, undo: { minAdx: null },
    fixText: 'چشم‌پوشی از ورود به معامله هنگامی که ADX زیر ۲۰ است',
  },
  {
    key: 'rsi', title: 'شاخص RSI در زمان ورود',
    side: (t) => (t.ctx?.rsi == null ? null : t.ctx.rsi > 70 ? 'hot' : 'normal'),
    labels: { hot: 'خرید با RSI بالای ۷۰ (اشباع خرید)', normal: 'خرید با RSI معادل ۷۰ یا کمتر' },
    bad: 'hot', fix: { maxEntryRsi: 70 }, undo: { maxEntryRsi: null },
    fixText: 'چشم‌پوشی از ورود به معامله هنگامی که RSI بالای ۷۰ است',
  },
];

/**
 * خواندن گزارش معاملات. شامل آمار کلی، تفکیک شرایط، تفکیک رمزارزها
 * و یافته‌ها به زبان ساده.
 */
export function reviewTrades(closed = [], { includeManual = false } = {}) {
  const trades = closed.filter((t) => includeManual || !t.manual);
  const overall = summarise(trades);
  const lenses = LENSES.map((L) => {
    const groups = {};
    for (const t of trades) { const s = L.side(t); if (s) (groups[s] ||= []).push(t); }
    const out = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, summarise(v)]));
    const bad = out[L.bad], good = Object.entries(out).find(([k]) => k !== L.bad)?.[1];
    const judged = bad && good && bad.n >= MIN_GROUP && good.n >= MIN_GROUP && bad.avgR !== null && good.avgR !== null;
    const losing = judged && bad.avgR < 0 && bad.avgR <= good.avgR - GAP_R;
    return { key: L.key, title: L.title, groups: out, labels: L.labels, judged, losing, fixText: L.fixText };
  });
  const bySymbol = {};
  for (const t of trades) (bySymbol[t.symbol] ||= []).push(t);
  const coins = Object.entries(bySymbol).map(([symbol, v]) => ({ symbol, ...summarise(v) })).sort((a, b) => a.totalR - b.totalR);
  const exits = {};
  for (const t of trades) (exits[t.reason] ||= []).push(t);

  const findings = [];
  if (overall.n < MIN_TRADES) findings.push(`${overall.n ? `تنها ${overall.n} معامله بسته شده تا این لحظه` : 'هنوز معامله بسته‌شده‌ای وجود ندارد'} — بازنگری پیش از اعمال هر تغییری نیازمند حداقل ${MIN_TRADES} معامله است.`);
  for (const l of lenses) {
    if (!l.judged) continue;
    const [bk, gk] = [LENSES.find((L) => L.key === l.key).bad, Object.keys(l.groups).find((k) => k !== LENSES.find((L) => L.key === l.key).bad)];
    const b = l.groups[bk], g = l.groups[gk];
    findings.push(`${l.labels[bk]}: ${b.n} معامله، ${b.winRate}٪ موفق، میانگین ${b.avgR >= 0 ? '+' : ''}${b.avgR}R — در مقایسه با ${g.avgR >= 0 ? '+' : ''}${g.avgR}R هنگام ${l.labels[gk]} (${g.n} معامله).${l.losing ? ' این اختلاف به اندازه کافی بزرگ است که نیاز به اقدام دارد.' : ''}`);
  }
  const worst = coins.find((c) => c.n >= MIN_GROUP && c.avgR !== null && c.avgR <= -0.4);
  if (worst) findings.push(`رمزارز ${worst.symbol} به طور میانگین ${worst.avgR}R در طول ${worst.n} معامله زیان داده است.`);
  return { overall, lenses, coins, exits: Object.fromEntries(Object.entries(exits).map(([k, v]) => [k, summarise(v)])), findings };
}

/**
 * تصمیم‌گیری درباره تغییرات. خروجی شامل { cfgPatch, changes: [{ text, evidence }] } است.
 * پارامتر `history` گزارش تغییرات تا کنون است (برای بررسی اینکه آیا درس‌های قبلی مفید بوده‌ام یا خیر).
 */
export function decideChanges(review, cfg, history = [], closed = [], { excludeCoins = false } = {}) {
  const patch = {};
  const changes = [];
  if (review.overall.n < MIN_TRADES) return { cfgPatch: patch, changes };

  // ۱. فراموشی (Unlearn): فیلتری که قبلاً فعال شده و اوضاع را بدتر کرده، غیرفعال می‌شود.
  for (const h of history) {
    if (h.undone || !h.lens || !h.at) continue;
    const L = LENSES.find((x) => x.key === h.lens);
    if (!L || !isOn(cfg, L)) continue;
    const before = summarise(closed.filter((t) => !t.manual && t.exitAt < h.at));
    const after = summarise(closed.filter((t) => !t.manual && t.openedAt >= h.at));
    if (after.n >= MIN_GROUP * 2 && before.n >= MIN_GROUP && after.avgR <= before.avgR - GAP_R) {
      Object.assign(patch, L.undo);
      changes.push({ lens: L.key, undo: true, text: `غیرفعال‌سازی قانون «${L.fixText}» — از زمان فعال‌سازی، معاملات میانگین ${after.avgR}R کسب کرده‌اند در حالی که قبل از آن ${before.avgR}R بوده است.`, evidence: { before, after } });
    }
  }

  // ۲. یادگیری (Learn): فعال‌سازی فیلتر برای شرایطی که به طور مداوم زیان می‌دهند.
  for (const l of review.lenses) {
    const L = LENSES.find((x) => x.key === l.key);
    // درسی که یک بار فراموش شده دوباره یاد گرفته نمی‌شود: روشن و خاموش کردن مداوم یک فیلتر هزینه‌بر است.
    if (!l.losing || isOn(cfg, L) || changes.some((c) => c.lens === L.key) || history.some((h) => h.lens === L.key && (h.undo || h.undone))) continue;
    const b = l.groups[L.bad];
    Object.assign(patch, L.fix);
    changes.push({ lens: L.key, text: `فعال‌سازی قانون «${L.fixText}» — ${b.n} معامله انجام‌شده در آن شرایط میانگین ${b.avgR}R ثبت کرده‌اند.`, evidence: l.groups });
  }

  // ۳. توقف معامله روی رمزارزی که مداوم زیان می‌دهد (حداکثر یک مورد در هر بازنگری).
  const worst = excludeCoins && review.coins.find((c) => c.n >= MIN_GROUP && c.avgR <= -0.4 && !(cfg.excluded || []).includes(c.symbol));
  const universeLeft = (cfg.universe || []).filter((s) => !(cfg.excluded || []).includes(s));
  if (worst && universeLeft.length > 3) {
    patch.excluded = [...(cfg.excluded || []), worst.symbol];
    changes.push({ text: `توقف معاملات روی رمزارز ${worst.symbol} — ${worst.n} معامله، ${worst.winRate}٪ موفق، میانگین ${worst.avgR}R.`, evidence: worst });
  }
  return { cfgPatch: patch, changes };
}

function isOn(cfg, L) {
  return Object.entries(L.fix).every(([k, v]) => cfg[k] === v);
}

/** فیلترهایی که بازنگری می‌تواند کنترل کند (به زبان ساده برای پنل تنظیمات). */
export function activeLessons(cfg) {
  const on = LENSES.filter((L) => isOn(cfg, L)).map((L) => L.fixText);
  if (cfg.excluded?.length) on.push(`عدم معامله روی ${cfg.excluded.join(', ')}`);
  return on;
}

const usd = (v) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const EXIT_WORDS = {
  target: 'به هدف رسیدند', 'stop-loss': 'با حد ضرر بسته شدند', 'trailing stop': 'به حد ضرر متحرک برخورد کردند',
  'break-even stop': 'به قیمت ورود برگشتند', 'signal reversal': 'در پی تغییر روند فروخته شدند', 'sold into strength': 'در اوج قدرت فروخته شدند',
  'closed by you': 'به صورت دستی بسته شدند', 'no exchange price': 'به دلیل عدم دسترسی به قیمت صرافی بسته شدند', 'recorded by you': 'به عنوان بسته شده ثبت شدند',
};

/**
 * بررسی عوامل موثر بر نتیجه حساب، به زبان ساده و با ارائه اعداد پشت هر خط:
 * نحوه خاتمه معاملات، نرخ برد مورد نیاز، میزان کارمزدها، پرهزینه‌ترین رمزارزها
 * و بررسی اینکه آیا حجم پوزیشن‌های همزمان بیشتر از کل موجودی حساب بوده است یا خیر.
 * این بخش فقط گزارش را می‌خواند و هیچ چیزی را تغییر نمی‌دهد.
 */
export function diagnose(closed = [], { startingBalance = null, fmt = usd } = {}) {
  const trades = closed.filter((t) => Number.isFinite(t.pnl));
  const out = [];
  if (trades.length < 5) return out;
  const total = trades.reduce((a, t) => a + t.pnl, 0);
  const fees = trades.reduce((a, t) => a + (t.feePaid || 0), 0);

  // ۱. نحوه پایان معاملات، به ترتیب بیشترین مبلغ تاثیرگذار.
  const byExit = {};
  for (const t of trades) (byExit[t.reason] ||= { n: 0, pnl: 0 }).n++, byExit[t.reason].pnl += t.pnl;
  const parts = Object.entries(byExit).sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl))
    .map(([k, v]) => `${v.n} معامله ${EXIT_WORDS[k] || k} (${fmt(v.pnl)})`);
  out.push(`از مجموع ${trades.length} معامله، ${parts.join('، همچنین ')}.`);

  // ۲. نرخ برد مورد نیاز با توجه به اندازه سودها و زیان‌ها.
  const rs = trades.map(tradeR).filter((r) => r !== null);
  const wins = rs.filter((r) => r > 0), losses = rs.filter((r) => r <= 0);
  if (wins.length && losses.length) {
    const aw = wins.reduce((a, b) => a + b, 0) / wins.length;
    const al = Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length);
    const need = (al / (aw + al)) * 100;
    const won = (wins.length / rs.length) * 100;
    out.push(`میانگین معاملات برنده +${aw.toFixed(2)}R و معاملات بازنده −${al.toFixed(2)}R بوده است، بنابراین برای سر به سر شدن نیاز بود ${need.toFixed(0)}٪ از معاملات برنده شوند؛ در حالی که ${won.toFixed(0)}٪ برنده شدند${won >= need ? ' — که کافی است' : ''}.`);
  }

  // ۳. کارمزدها.
  if (fees > 0) {
    const ofStart = startingBalance ? ` (${((fees / startingBalance) * 100).toFixed(1)}٪ از سرمایه اولیه)` : '';
    out.push(`مجموع کارمزدها ${fmt(fees)}${ofStart} بوده است${total < 0 && fees > 0 ? ` — معادل ${Math.min(100, (fees / Math.abs(total)) * 100).toFixed(0)}٪ از حجم کل زیان` : ''}. هر معامله حدود ۰.۲٪ کارمزد رفت و برگشت پرداخت می‌کند، بنابراین معاملات کوچک و پرتعداد بیشترین صدمه را از کارمزد می‌بینند.`);
  }

  // ۴. رمزارزهایی که بیشترین زیان را داشته‌اند.
  const bySym = {};
  for (const t of trades) (bySym[t.symbol] ||= { n: 0, pnl: 0, wins: 0 }).n++, bySym[t.symbol].pnl += t.pnl, bySym[t.symbol].wins += t.pnl > 0 ? 1 : 0;
  const worst = Object.entries(bySym).filter(([, v]) => v.pnl < 0).sort((a, b) => a[1].pnl - b[1].pnl).slice(0, 2);
  if (worst.length && total < 0) out.push(`بخش عمده‌ای از زیان مربوط به ${worst.map(([s, v]) => `${s} (${v.n} معامله، ${v.wins} برد، ${fmt(v.pnl)})`).join(' و ')} بوده است.`);

  // ۵. پوزیشن‌های باز همزمان به عنوان درصدی از کل حساب.
  const ev = [];
  for (const t of trades) if (!t.real && Number.isFinite(t.notional) && t.openedAt && t.exitAt) ev.push([t.openedAt, t.notional], [t.exitAt, -t.notional]);
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0, peak = 0;
  for (const [, d] of ev) { now += d; peak = Math.max(peak, now); }
  if (startingBalance && peak > startingBalance * 1.02) {
    out.push(`در اوج فعالیت، ارزش پوزیشن‌های باز به ${((peak / startingBalance) * 100).toFixed(0)}٪ از سرمایه اولیه رسید — یعنی پولی بیشتر از دارایی واقعی حساب که باعث چند برابر شدن زیان‌ها می‌شود. از این پس خریدها به نقدینگی آزاد موجود محدود می‌شوند.`);
  }
  return out;
}