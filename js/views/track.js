// سابقه عملکرد عمومی: هر سیگنالی که سرور ثبت کرده و نتیجه واقعی آن.
// هیچ‌چیز در اینجا گزینشی نیست — ردیف‌های تعیین‌تکلیف‌شده دقیقاً همان‌طور که بسته شده‌اند شمرده می‌شوند.
import { $, $$, bindSeg, skeleton, icon } from '../ui.js';
import { esc, pct, money, dateTime } from '../format.js';
import { TESTED_ACCURACY } from '../lib/predict.js';
import { liveDirectionCheck, directionTrustFor, LIVE_PROOF_NATS } from '../lib/selfimprove.js';
import { getTrackRecord, getAiRecord, backendEnabled } from '../api/backend.js';
import { aiRecordStats, shareText } from '../lib/airecord.js';
import { CHART_TESTED } from '../lib/autotrader.js';
import { CONFIG } from '../config.js';
import { clockOffsetMs } from '../api/clock.js';
import { fx } from '../api/fx.js';

export const title = 'سابقه عملکرد';

const rate = (hit, n) => (n ? (hit / n) * 100 : null);

// چیزی که سیستم امتیازبندی واقعاً ثبت می‌کند. قبلاً به دنبال 'win' و 'loss' می‌گشت
// که دیتابیس هرگز آن‌ها را تولید نکرده بود، بنابراین تمام آمارهای مربوط به طرح معامله
// از روز اول به صورت خط تیره (-) نمایش داده می‌شدند.
const PLAN_WIN = new Set(['tp1', 'tp2', 'tp3', 'target']);
const PLAN_LOSS = new Set(['stop']);
// ردیف‌هایی که قبل از تغییر برچسب ثبت شده‌اند همچنان BUY / STRONG_BUY را حمل می‌کنند،
// بنابراین هر دو واژگان رندر می‌شوند — تاریخچه برای تطبیق با واژگان جدید بازنویسی نمی‌شود،
// بلکه در زمان نمایش ترجمه می‌گردد.
const ACTION_WORDS = {
  STRONG_BUY: 'رشد قوی تاکنون', BUY: 'صعودی', NEUTRAL: 'بدون روند مشخص', SELL: 'نزولی', STRONG_SELL: 'ریزش قوی تاکنون',
  EXTENDED_UP: 'رشد قوی تاکنون', LEANING_UP: 'صعودی', NO_TREND: 'بدون روند مشخص', LEANING_DOWN: 'نزولی', EXTENDED_DOWN: 'ریزش قوی تاکنون',
};
const readable = (a) => ACTION_WORDS[a] || a || '—';
const toneOf = (a) => (/UP|BUY/.test(a || '') ? 'up' : /DOWN|SELL/.test(a || '') ? 'down' : '');

const PLAN_WORDS = { tp1: 'هدف ۱', tp2: 'هدف ۲', tp3: 'هدف ۳', stop: 'فعال شدن حد ضرر', expired: 'منقضی شده (خنثی)', none: 'بدون طرح' };

export async function render(el) {
  el.innerHTML = `
    <div class="page-head"><div><h1>سابقه عملکرد</h1><p>هر سیگنال زیر <b>پیش از</b> مشخص شدن نتیجه در دیتابیس ثبت شده و سپس به طور خودکار پس از رسیدن افق زمانی نمره‌دهی شده است.</p></div>
      <div class="seg" id="iv"><button data-v="all" class="on">همه</button><button data-v="15m">۱۵ دقیقه</button><button data-v="1h">۱ ساعت</button><button data-v="4h">۴ ساعت</button><button data-v="1d">۱ روز</button></div></div>
    <div class="card" id="dataCheck"><div class="row"><span class="spinner"></span><b>در حال مقایسه داده‌های زنده با صرافی…</b></div></div>
    <div id="body">${skeleton(8, 24)}</div>`;

  // ادعایی که می‌توانید بررسی کنید. این بخش نشان می‌دهد که چه چیزی در سایت نمایش داده می‌شود
  // در مقایسه با قیمت واقعی صرافی، به صورت زنده و در مقابل دیدگان کاربر.
  (async () => {
    const card = $('#dataCheck', el);
    if (!card) return;
    const rows = [];
    let worst = 0;
    try {
      const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const live = await fetch(`${CONFIG.BINANCE_REST[0]}/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(pairs))}`).then((r) => r.json());
      const list = await import('../api/market.js').then((m) => m.markets());
      for (const row of live) {
        const sym = row.symbol.replace('USDT', '');
        const ours = list.find((c) => c.symbol === sym);
        if (!ours) continue;
        const diff = Math.abs((ours.price - +row.price) / +row.price) * 100;
        worst = Math.max(worst, diff);
        rows.push(`<tr><td class="l"><b>${esc(sym)}</b></td><td>${money(+row.price)}<small class="show-p-block">اینجا ${money(ours.price)}</small></td><td class="hide-p">${money(ours.price)}</td><td class="${diff < 0.1 ? 'up' : 'warn'}">${diff.toFixed(3)}%</td></tr>`);
      }
    } catch { /* آفلاین — به جای ادعای صحت، وضعیت را اعلام کنید */ }
    const skew = clockOffsetMs();
    card.innerHTML = rows.length ? `
      <div class="card-h"><h3>بررسی داده‌های زنده</h3><span class="chip ${worst < 0.1 ? 'up' : 'warn'}">${worst < 0.1 ? 'مطبق با صرافی' : 'اختلاف جزئی'}</span></div>
      <div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">رمزارز</th><th>قیمت زنده صرافی</th><th class="hide-p">نمایش‌داده‌شده اینجا</th><th>اختلاف</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
      <p class="fine mt">قیمت‌ها مستقیماً از صرافی دریافت شده و با همان تعداد اعشاری که صرافی اعلام می‌کند نمایش داده می‌شوند. اختلاف‌های کوچک ناشی از ثانیه‌های بین دو خوانش است، نه گرد کردن اعداد.
      ساعت: دستگاه شما <b>${Math.abs(skew)} میلی‌ثانیه ${skew >= 0 ? 'عقب‌تر' : 'جلوتر'}</b> از صرافی است و اپلیکیشن آن را اصلاح می‌کند، بنابراین تمام زمان‌ها در سایت بر اساس ساعت صرافی هستند.
      واحد پول: ۱ دلار آمریکا = ${fx.rate.toFixed(4)} ${esc(fx.code)}، بر اساس فید نرخ زنده.</p>
      <p class="fine"><b>موارد غیردقیق:</b> پیش‌بینی‌ها. قیمت‌ها واقعیت هستند؛ پیش‌بینی یک احتمال است و دقت اندازه‌گیری‌شده آن در زیر منتشر شده است — هرگز به سمت بالا گرد نمی‌شود.</p>`
      : '<div class="card-h"><h3>بررسی داده‌های زنده</h3><span class="chip warn">دسترسی به صرافی میسر نشد</span></div><p class="fine">این بررسی نیازمند اتصال زنده به صرافی است. اجرا نشد، بنابراین هیچ ادعایی مطرح نمی‌شود.</p>';
  })();

  if (!backendEnabled()) {
    $('#body', el).innerHTML = '<div class="card empty"><h3>ردیابی زنده پیکربندی نشده است</h3><p>بک‌اند مربوط به ثبت و امتیازبندی سیگنال‌ها در این نسخه متصل نیست.</p></div>';
    return;
  }

  const ROW_CAP = 1000;
  const rows = await getTrackRecord({ limit: ROW_CAP }).catch(() => null);
  if (!rows) {
    $('#body', el).innerHTML = '<div class="card empty"><h3>سابقه عملکرد بارگیری نشد</h3><p>سروری که سیگنال‌ها را ثبت و امتیازبندی می‌کند پاسخ نداد. صفحه را مجدداً بارگیری کنید.</p></div>';
    return;
  }
  const rowsCapped = rows.length >= ROW_CAP;
  let interval = 'all';
  const aiRows = await getAiRecord().catch(() => null);
  const aiCard = () => {
    const st = aiRows ? aiRecordStats(aiRows) : {};
    const ivs = ['15m', '1h', '4h', '1d'].filter((iv) => st[iv]);
    const day = (t) => new Date(t).toISOString().slice(0, 10);
    return `<div class="card mt">
      <div class="card-h"><h3>سیگنال هوش مصنوعی، زنده</h3><span class="fine">وضعیت‌های خرید/نگهداری/فروش/انتظار در صفحات رمزارز، که توسط سرور در زمان بسته شدن هر کندل ثبت شده‌اند</span></div>
      ${!ivs.length ? `<p class="fine">${aiRows ? 'شروع شده — اولین کندل‌ها در حال ثبت هستند و هنوز نتیجه‌ای نمره‌دهی نشده است.' : 'هنوز در این نسخه فعال نشده است.'} هر کندل ۴ ساعته و روزانه بسته‌شده از رمزارزهای ردیابی‌شده یک ردیف دریافت می‌کند که پیش از مشخص شدن آینده نوشته شده و بر اساس قیمت چند کندل بعد نمره‌دهی می‌شود.</p>` : `
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">نمودار</th><th>تعداد ثبت‌شده</th><th>قیمت بالاتر پس از خرید</th><th>…پس از هر کندل</th><th>تست‌شده (قبل از انتشار زنده)</th><th>معاملات بسته شده</th><th>پوزیشن‌های باز فعلی</th></tr></thead><tbody>
        ${ivs.map((iv) => {
          const x = st[iv], t = CHART_TESTED[iv]?.signals;
          return `<tr><td class="l">${iv}</td><td>${x.logged.toLocaleString('en-US')} <span class="fine">(${x.coins} رمزارز، از ${day(x.since)})</span></td>
            <td>${x.buys ? shareText(x.buyUp, x.buys) : '—'} <span class="fine">(${x.buys} نمره‌دهی‌شده)</span></td><td>${x.graded ? shareText(x.anyUp, x.graded) : '—'} <span class="fine">(${x.graded})</span></td>
            <td class="fine">${t ? `${t.fwdUpPct.toFixed(1)}٪ در برابر ${t.baseUpPct.toFixed(1)}٪` : '—'}</td>
            <td>${x.trades ? `${x.trades} مورد، ${x.wins} برد، میانگین <b class="${x.avgTradePct >= 0 ? 'up' : 'down'}">${x.avgTradePct >= 0 ? '+' : ''}${x.avgTradePct}٪</b>` : '۰'}</td><td>${x.open} از ${x.coins}</td></tr>`;
        }).join('')}
      </tbody></table></div>
      <p class="fine" style="margin:6px 0 0">امتیازبندی بر اساس قیمت ۶ کندل (۴h) یا ۷ روز (۱d) پس از هر ردیف انجام می‌شود. معاملات فقط پس از شروع ردیابی آن رمزارز و پس از کسر کارمزد شمرده می‌شوند. نمونه کوچک اهمیت کمی دارد؛ ارقام تست‌شده معیاری هستند که باید شکست داده شوند و قبل از انتشار زنده، خریدها هیچ کندلی را شکست ندادند.</p>`}
    </div>`;
  };

  const draw = () => {
    const all = interval === 'all' ? rows : rows.filter((r) => r.interval === interval);
    const done = all.filter((r) => r.resolved);
    const fc = done.filter((r) => r.forecast_correct !== null);
    const hit = fc.filter((r) => r.forecast_correct).length;

    const plans = done.filter((r) => r.plan_result && r.plan_result !== 'none');
    const oldRule = plans.filter((r) => (r.plan_v ?? 1) < 2).length;
    const wins = plans.filter((r) => PLAN_WIN.has(r.plan_result)).length;
    const losses = plans.filter((r) => PLAN_LOSS.has(r.plan_result)).length;
    const expired = plans.filter((r) => r.plan_result === 'expired').length;
    const avgOf = (rs) => (rs.length ? rs.reduce((s, r) => s + (+r.plan_return_pct || 0), 0) / rs.length : null);
    const avgWin = avgOf(plans.filter((r) => PLAN_WIN.has(r.plan_result)));
    const avgLoss = avgOf(plans.filter((r) => PLAN_LOSS.has(r.plan_result)));
    const expectancy = avgOf(plans);

    const rose = fc.filter((r) => +r.outcome_price > +r.price).length;
    const rosePct = fc.length ? (rose / fc.length) * 100 : null;
    const baseline = rosePct === null ? null : Math.max(rosePct, 100 - rosePct);
    const baselineCall = rosePct === null ? null : rosePct >= 50 ? 'صعودی' : 'نزولی';

    const byAction = new Map();
    for (const r of fc) {
      const k = r.action || '—';
      const e = byAction.get(k) || { n: 0, hit: 0, rose: 0, ret: 0, retN: 0 };
      e.n++;
      if (r.forecast_correct) e.hit++;
      if (+r.outcome_price > +r.price) e.rose++;
      if (r.plan_return_pct !== null && r.plan_return_pct !== undefined) { e.ret += +r.plan_return_pct; e.retN++; }
      byAction.set(k, e);
    }
    const actionRows = [...byAction.entries()].sort((a, b) => b[1].n - a[1].n);

    const bySym = new Map();
    for (const r of fc) {
      const e = bySym.get(r.symbol) || { n: 0, hit: 0 };
      e.n++; if (r.forecast_correct) e.hit++;
      bySym.set(r.symbol, e);
    }
    const symRows = [...bySym.entries()].filter(([, e]) => e.n >= 5).sort((a, b) => rate(b[1].hit, b[1].n) - rate(a[1].hit, a[1].n));

    const checks = [...new Set(done.map((r) => r.interval))].sort().map((iv) => liveDirectionCheck(done, iv)).filter((c) => c.n);
    const acc = rate(hit, fc.length);
    const beatsBaseline = acc !== null && baseline !== null && acc > baseline;
    const tested = TESTED_ACCURACY[interval === 'all' ? 'all' : interval];

    $('#body', el).innerHTML = `
      <div class="grid g4">
        <div class="card"><div class="stat"><span class="k">تشخیص صحیح جهت بازار</span><span class="v ${acc === null ? '' : beatsBaseline ? 'up' : 'down'}">${acc === null ? '—' : `${acc.toFixed(1)}٪`}</span><span class="s fine">${fc.length} پیش‌بینی تعیین‌تکلیف‌شده</span></div></div>
        <div class="card"><div class="stat"><span class="k">معیار مقایسه (خط مبنا)</span><span class="v">${baseline === null ? '—' : `${baseline.toFixed(1)}٪`}</span><span class="s fine">${baselineCall === null ? 'هنوز ردیف تعیین‌تکلیف‌شده‌ای نیست' : `همیشه گفتن "${baselineCall}" روی همین مجموعه`}</span></div></div>
        <div class="card"><div class="stat"><span class="k">طرح‌های معاملاتی موفق به رسیدن به هدف</span><span class="v ${plans.length && wins / plans.length >= 0.5 ? 'up' : plans.length ? 'down' : ''}">${plans.length ? `${((wins / plans.length) * 100).toFixed(0)}٪` : '—'}</span><span class="s fine">${wins} رسید به هدف · ${losses} حد ضرر · ${expired} منقضی</span></div></div>
        <div class="card"><div class="stat"><span class="k">میانگین نتیجه هر طرح</span><span class="v ${expectancy > 0 ? 'up' : expectancy < 0 ? 'down' : ''}">${expectancy === null ? '—' : pct(expectancy)}</span><span class="s fine">${avgWin === null ? '' : `برنده‌ها ${pct(avgWin)}`}${avgLoss === null ? '' : ` · بازنده‌ها ${pct(avgLoss)}`}</span></div></div>
      </div>

      ${aiCard()}

      <div class="card mt" ${acc !== null && !beatsBaseline ? 'style="border-color:var(--warn)"' : ''}>
        <div class="card-h"><h3>چگونه این آمار را بخوانیم</h3>${acc === null ? '' : `<span class="chip ${beatsBaseline ? 'up' : 'warn'}">${beatsBaseline ? `پیش افتادن از خط مبنا به میزان ${(acc - baseline).toFixed(1)} امتیاز` : `${(baseline - acc).toFixed(1)} امتیاز عقب‌تر از خط مبنا`}</span>`}</div>
        ${acc === null ? '<p class="fine">هنوز هیچ موردی تعیین‌تکلیف نشده است، بنابراین درصدی برای خواندن وجود ندارد.</p>' : `
        <p>در طول این ${fc.length} پیش‌بینی تعیین‌تکلیف‌شده، بازار در ${rosePct.toFixed(1)}٪ مواقع صعود کرده است. بنابراین هرکسی که مدل را کاملاً نادیده می‌گرفت و در هر بار می‌گفت «${baselineCall}»، در <b>${baseline.toFixed(1)}٪</b> مواقع حق داشت. موتور امتیاز ${acc.toFixed(1)}٪ کسب کرده است.
        ${beatsBaseline
          ? 'این نتیجه بالاتر از خط مبنا است که تنها مقایسه‌ی معنادار محسوب می‌شود — اما برتری کوچکی در یک نمونه‌ی کوتاه است و دلیلی برای افزایش حجم معاملات نیست.'
          : 'این نتیجه <b>پایین‌تر</b> از خط مبنا است. در این نمونه، مدل کارایی خود را ثابت نکرده است: یک پاسخ ثابت عملکرد بهتری داشت و هیچ‌چیز بالاتر از ۵۰٪ بودن این حقیقت را تغییر نمی‌دهد.'}</p>
        <p class="fine">دو عامل باعث می‌شود این نمونه ضعیف‌تر از تعداد ردیف‌هایش به نظر برسد. ردیف‌ها شامل ${Math.max(1, Math.round((Date.now() - new Date(all[all.length - 1]?.candle_time || Date.now()).getTime()) / 864e5))} روز از یک بازار واحد هستند و رمزارزها با هم حرکت می‌کنند — ریزش ۱۲ رمزارز در یک هفته بیشتر شبیه یک مشاهده است تا ۱۲ مشاهده مستقل. تمام ارقام این صفحه را تا زمانی که نمونه شامل شرایط مختلف بازار شود به عنوان مقادیر موقتی در نظر بگیرید.${all.length - done.length > 0 ? ` ${all.length - done.length} سیگنال همچنان باز است و در هیچ‌یک از درصدهای اینجا شمرده نشده است.` : ''}</p>
        <p class="fine">طرح‌های معاملاتی دقیقاً مطابق قوانین مدیریت پوزیشن امتیازبندی می‌شوند: نیمی از پوزیشن در هدف ۱ بسته می‌شود و حد ضرر باقی‌مانده به قیمت ورود منتقل می‌گردد؛ بقیه پوزیشن در هدف ۲، قیمت ورود یا بسته شدن کندل در انتهای افق زمانی بسته می‌شود. زمانی که یک کندل هم حد ضرر و هم هدف را لمس کند، فرض بر این است که حد ضرر اول رخ داده است. کارمزدها لحاظ نشده‌اند. تا تاریخ ۱۲ اکتبر ۲۰۲۶ قانون متفاوتی استفاده می‌شد — حد ضرر پس از هدف ۱ به عنوان زیان کامل شمرده می‌شد و طرحی که به هدف ۲ می‌رسید انگار کل پوزیشن آنجا بسته شده است — و طرح‌های قدیمی چندتا چندتا تحت قوانین جدید مجدداً امتیازبندی می‌شوند${oldRule ? `: <b>${oldRule} مورد از ${plans.length} طرح نمایش‌داده‌شده در اینجا</b> همچنان با سیستم امتیازبندی قدیمی هستند` : '؛ تمام طرح‌های نمایش‌داده‌شده به‌روز هستند'}.</p>
        <p class="fine">تست آفلاین، اجرا شده روی ${TESTED_ACCURACY.tests} پیش‌بینی روی ${TESTED_ACCURACY.coins} رمزارز پیش از انتشار زنده، دقت ${tested ? `${tested}٪` : '—'} را در این تایم‌فریم ثبت کرده است. هر جا که عدد زنده با آن اختلاف داشته باشد، عدد زنده ملاک است.</p>
        <p class="fine">سرور نسخه سبک‌تر پیش‌بینی (مدل‌های کمتر، ۷۰۰ کندل) را ذخیره می‌کند تا در محدوده زمانی خود باقی بماند؛ صفحات رمزارز نسخه کامل را روی ۱۵۰۰ کندل اجرا می‌کنند. در بررسی روی کندل‌های شبیه‌سازی‌شده، هر دو نسخه در ۶۰ مورد از ۶۰ مورد جهت یکسانی را با احتمالاتی با اختلاف حدود ۱۰ امتیاز پیش‌بینی کردند، بنابراین نرخ برد اینجا نمایانگر پیش‌بینی جهت در صفحات رمزارز است، نه دقیقاً درصدهای دقیق آن‌ها.</p>`}
      </div>

      ${checks.length ? `<div class="card mt">
        <div class="card-h"><h3>آیا جهت‌گیری پیش‌بینی در حالت زنده ارزشی دارد؟</h3><span class="fine">معیاری که اعتماد صفحه رمزارز را تنظیم می‌کند، اجرا شده روی این ردیف‌های امتیازبندی‌شده</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">تایم‌فریم</th><th>نمره‌دهی‌شده</th><th>کندل‌های مجزا</th><th>بهترین ضریب اعتماد</th><th>شواهد (نیاز به ${LIVE_PROOF_NATS})</th><th>نرخ برد · خط مبنا</th><th>اعتماد استفاده‌شده اینجا</th></tr></thead><tbody>
        ${checks.map((c) => `<tr style="cursor:default">
          <td class="l"><b>${esc(c.interval)}</b></td><td>${c.n}</td><td>${c.candles}</td><td>${c.s.toFixed(2)}</td>
          <td class="${c.proven ? 'up' : ''}">${c.evidence.toFixed(2)}</td>
          <td class="${c.hit > c.baseline ? 'up' : 'down'}">${(c.hit * 100).toFixed(1)}٪ · ${(c.baseline * 100).toFixed(1)}٪</td>
          <td>${directionTrustFor(c.interval).trust.toFixed(2)}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="fine mt">ضریب اعتماد میزان دوری احتمال رشد پیش‌بینی از ۵۰٪ را نشان می‌دهد: در صفر، احتمال ۵۰٪ نمایش داده شده و صفحه رمزارز اعلام می‌کند جهت قابل اعتمادی وجود ندارد؛ در ۱، دقیقاً همان مقداری که مدل خروجی داده نشان داده می‌شود. بهترین ضریب اعتماد، مقداری است که می‌توانست این نتایج را بهتر از همه پیش‌بینی کند. رمزارزها با هم حرکت می‌کنند، بنابراین پیش‌بینی‌های انجام‌شده روی یک کندل واحد به عنوان یک مشاهده محسوب می‌شوند و میزان شواهد نشان می‌دهد که آن ضریب اعتماد به ازای هر کندل چقدر بهتر از عدم تعیین جهت است. ${checks.some((c) => c.proven)
          ? 'هرجا که شرط برقرار باشد و خط مبنا را شکست دهد، سابقه زنده از نمایش جهت در آنجا حمایت می‌کند.'
          : `هیچ تایم‌فریمی در اینجا نتوانسته ${LIVE_PROOF_NATS} را با شکست دادن خط مبنا کسب کند، بنابراین سابقه زنده با غیرفعال کردن جهت در مواردی که تست انتشار جهتی نیافته است، هم‌راستاست.`}</p>
      </div>` : ''}

      ${actionRows.length ? `<div class="card mt">
        <div class="card-h"><h3>عملکرد هر نوع سیگنال</h3><span class="fine">برچسبی که سایت نشان داده است در مقایسه با عملکرد واقعی قیمت</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">سیگنال</th><th>تعداد ثبت‌شده</th><th>تشخیص صحیح جهت</th><th>رشد واقعی قیمت</th><th>میانگین نتیجه طرح</th></tr></thead><tbody>
        ${actionRows.map(([a, e]) => `<tr style="cursor:default">
          <td class="l"><span class="chip ${toneOf(a)}">${esc(readable(a))}</span></td>
          <td>${e.n}</td>
          <td>${rate(e.hit, e.n).toFixed(0)}٪</td>
          <td class="${rate(e.rose, e.n) >= 50 ? 'up' : 'down'}">${rate(e.rose, e.n).toFixed(0)}٪</td>
          <td class="${e.retN && e.ret / e.retN > 0 ? 'up' : e.retN ? 'down' : ''}">${e.retN ? pct(e.ret / e.retN) : '—'}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="fine mt">ستون «رشد واقعی قیمت» را در برابر قدرت سیگنال بررسی کنید. اگر قوی‌ترین برچسب بهترین ردیف ستون نباشد، امتیاز بالاتر به معنای سیگنال بهتر نیست — این همان چیزی است که تست باندهای آفلاین نیز نشان داد و به همین دلیل صفحه رمزارز امتیاز را «تفاهم اندیکاتورها» نامگذاری کرده است، نه احتمال.</p>
      </div>` : ''}

      ${symRows.length ? `<div class="card mt"><div class="card-h"><h3>بر اساس رمزارز</h3><span class="fine">رمزارزهای دارای ۵ پیش‌بینی تعیین‌تکلیف‌شده یا بیشتر</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">رمزارز</th><th>تعیین‌تکلیف‌شده</th><th>صحیح</th><th>دقت</th></tr></thead><tbody>
        ${symRows.map(([s, e]) => `<tr data-sym="${esc(s)}"><td class="l"><b>${esc(s)}</b></td><td>${e.n}</td><td>${e.hit}</td><td class="${rate(e.hit, e.n) >= 55 ? 'up' : rate(e.hit, e.n) < 45 ? 'down' : ''}"><b>${rate(e.hit, e.n).toFixed(0)}٪</b></td></tr>`).join('')}
        </tbody></table></div></div>` : ''}

      <div class="card mt">
        <div class="card-h"><h3>سیگنال‌های اخیر</h3><span class="fine">${rowsCapped ? '۱۰۰۰ مورد اخیر از ' : ''}${all.length} مورد ثبت‌شده${interval === 'all' ? '' : ` روی ${interval}`}${rowsCapped ? ` · ردیف‌های قدیمی‌تر فراتر از ${ROW_CAP} در اینجا خوانده نمی‌شوند` : ''}</span></div>
        ${all.length ? `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">زمان ثبت</th><th class="l">رمزارز</th><th>تایم‌فریم</th><th class="l">سیگنال</th><th>قیمت زمان ثبت</th><th>احتمال رشد هوش مصنوعی</th><th>قیمت بعدی</th><th>جهت‌گیری</th><th class="hide-m">طرح معامله</th></tr></thead><tbody>
          ${all.slice(0, 200).map((r) => `<tr data-sym="${esc(r.symbol)}">
            <td class="l fine">${dateTime(new Date(r.candle_time).getTime())}</td>
            <td class="l"><b>${esc(r.symbol)}</b></td><td class="fine">${esc(r.interval)}</td>
            <td class="l"><span class="chip ${toneOf(r.action)}">${esc(readable(r.action))}</span></td>
            <td>${money(r.price)}</td>
            <td class="${!(TESTED_ACCURACY.directionTrust[r.interval] > 0) ? 'muted' : r.prob_up >= 0.54 ? 'up' : r.prob_up <= 0.46 ? 'down' : ''}" ${TESTED_ACCURACY.directionTrust[r.interval] > 0 ? '' : `title="تمایل خام مدل. روی ${esc(r.interval)} صفحه رمزارز جهتی نشان نمی‌دهد، زیرا در تست‌ها پایدار نبوده است."`}>${r.prob_up === null ? '—' : `${(r.prob_up * 100).toFixed(0)}٪`}</td>
            <td>${r.resolved ? money(r.outcome_price) : '<span class="fine muted">باز</span>'}</td>
            <td>${r.forecast_correct === null ? '—' : r.forecast_correct ? '<span class="up">✓ درست</span>' : '<span class="down">✕ نادرست</span>'}</td>
            <td class="hide-m">${r.plan_result && r.plan_result !== 'none' ? `<span class="${PLAN_WIN.has(r.plan_result) ? 'up' : PLAN_LOSS.has(r.plan_result) ? 'down' : 'muted'}">${esc(PLAN_WORDS[r.plan_result] || r.plan_result)}${r.plan_return_pct === null ? '' : ` ${pct(+r.plan_return_pct)}`}</span>` : '<span class="fine muted">—</span>'}</td>
          </tr>`).join('')}
        </tbody></table></div>` : `<div class="empty">${icon('info', 20)}<p>هنوز سیگنالی ثبت نشده است. سرور هر ۱۵ دقیقه یک دسته جدید ثبت می‌کند — لطفاً بعداً سر بزنید.</p></div>`}
      </div>`;

    $$('tr[data-sym]', el).forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/coin/${tr.dataset.sym}`; }));
  };

  bindSeg($('#iv', el), (v) => { interval = v; draw(); });
  draw();
}