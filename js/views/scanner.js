import { markets, getCandles, isStable, isTestedSource, INTERVAL_MS } from '../api/market.js';
import { TESTED_ACCURACY, shownProbUp, directionReliable } from '../lib/predict.js';
import { directionTrustFor } from '../lib/selfimprove.js';
import { generateSignal, THRESHOLDS, SCORE_BUCKETS_TESTED } from '../lib/signals.js';
import { runForecast } from '../lib/compute.js';
import { timingOutlook } from '../lib/timing.js';
import { forecastForDisplay } from '../lib/forecastview.js';
import { aiSignal } from '../lib/autotrader.js';
import { DEFAULT_HORIZON } from '../ai/context.js';
import { $, $$, coinLogo, skeleton, bindSeg, icon, wireSortHeaders } from '../ui.js';
import { esc, price, changeHtml, horizonText, money} from '../format.js';

export const title = 'اسکنر';

export async function render(el) {
  const st = { interval: '4h', filter: 'all', sort: 'score', rows: [], run: 0, disposed: false, count: 30, skipped: 0 };
  el.innerHTML = `
    <div class="page-head">
      <div><h1>اسکنر</h1><p>ارزهای برتر را اسکن می‌کند (بایننس، یا Gate.io، HTX یا OKX برای ارزهایی که بایننس لیست نکرده است) و آن‌ها را بر اساس میزان تمایل اندیکاتورها و نتایج پیش‌بینی رتبه‌بندی می‌کند. مرتب‌سازی بر اساس امتیاز، راهی برای یافتن نمودارهای امتدادیافته است، نه رتبه‌بندی آنچه باید خرید.</p></div>
      <div class="row">
        <div class="seg" id="iv">${['1m', '5m', '15m', '1h', '4h', '1d'].map((i) => `<button data-v="${i}" class="${i === st.interval ? 'on' : ''}">${i}</button>`).join('')}</div>
        <div class="seg" id="cnt"><button data-v="20">۳۰ ارز برتر</button><button data-v="30" class="on">۳۰ ارز برتر</button><button data-v="50">۵۰ ارز برتر</button></div>
        <button class="btn" id="rescan">${icon('refresh', 16)} اسکن مجدد</button>
      </div>
    </div>
    <div class="card">
      <div class="card-h">
        <div class="seg" id="flt"><button data-v="all" class="on">همه</button><button data-v="buy">صعودی</button><button data-v="sell">نزولی</button><button data-v="aibuy">سیگنال هوش مصنوعی: خرید یا نگه داری</button><button data-v="aiup">هوش مصنوعی: احتمال صعود</button><button data-v="aidown">هوش مصنوعی: احتمال نزول</button><button data-v="oversold">اشباع فروش</button><button data-v="overbought">اشباع خرید</button></div>
        <span class="fine" id="prog"></span>
      </div>
      <div class="meter" id="meter" style="margin-bottom:10px"><i style="width:0%"></i></div>
      <div id="tbl">${skeleton(10, 26)}</div>
      <p class="fine mt">امتیاز: از ۱۰۰- تا ۱۰۰+، که میزان توافق روند، مومنتوم، RSI، MACD، بولینگر، Stoch RSI، حجم و ADX را اندازه می‌گیرد. این عدد رتبه خرید یا فروش <b>نیست</b> — پس از تست روی ${SCORE_BUCKETS_TESTED.bars.toLocaleString('en-US')} کندل از ${SCORE_BUCKETS_TESTED.coins} ارز، سهم مواردی که صعود کرده‌اند با افزایش امتیاز عمدتاً <b>کاهش</b> می‌یابد، بنابراین عدد بالا به معنای امتدادیافتگی یک حرکت است تا احتمال ادامه آن. «سیگنال هوش مصنوعی» کاری است که قوانین معاملاتی تست‌شده نمودار اکنون با ارز انجام می‌دهند — خرید (BUY)، نگهداری (HOLD؛ در جریان معامله)، فروش (SELL) یا انتظار (WAIT)؛ در تست‌ها، خریدهای آن جهت حرکت را بهتر از شانس تشخیص نداده‌اند و سابقه آن در صفحه ارز قابل مشاهده است. «صعود هوش مصنوعی» پیش‌بینی صفحه ارز برای <span id="hz"></span> آینده است که فقط در مواردی نمایش داده می‌شود که جهت آن در تست‌ها تأیید شده باشد. «بازه ۸۰٪» محدوده‌ای است که قیمت تا آن زمان در ۸ مورد از ۱۰ مورد در آن قرار خواهد گرفت و در صورتی که جهت حرکت قابل اعتماد نباشد، روی قیمت امروز متمرکز می‌شود — این همان بخشی از پیش‌بینی است که دقت آن در تست‌ها اثبات شده است (در تست روی ۲۴ ارز و حدود ۱۰۰,۰۰۰ بازه، ۷۷ تا ۸۰٪ نتایج، بسته به تایم‌فریم، در این محدوده قرار گرفتند)؛ برای یافتن ارزهایی که بیشترین نوسان را دارند، بر اساس آن مرتب‌سازی کنید. «زمان‌بندی حرکت» نشان می‌دهد که اوج (یا کف) آن بازه در نمودارهای مشابه گذشته در چه زمانی رخ داده است — یعنی زمان، نه جهت. برای مشاهده پیش‌بینی کامل به همراه آمار دقت، یک ارز را باز کنید.</p>
    </div>`;

  // میزان جابجایی احتمالی قیمت تا افق زمانی: بازه ۸۰ درصدی پیش‌بینی به صورت
  // درصدی از قیمت فعلی. برخلاف جهت حرکت، این بخش به گونه‌ای اندازه‌گیری شده که
  // درست باشد — بازه ۸۰٪ در تست انتشار ۷۸.۵٪ از نتایج واقعی را پوشش داد —
  // بنابراین بازه وسیع هشداری قابل اعتماد مبنی بر نوسانات شدید ارز است.
  const rangeOf = (r) => {
    const f = r.fc;
    if (!f?.ok || !f.range || !(f.lastPrice > 0)) return null;
    return { lo: (f.range.p10 / f.lastPrice - 1) * 100, hi: (f.range.p90 / f.lastPrice - 1) * 100 };
  };
  const moveOf = (r) => { const g = rangeOf(r); return g ? g.hi - g.lo : null; };
  const rangeCell = (r) => {
    if (r.fc === undefined) return '<span class="spinner" style="width:12px;height:12px"></span>';
    const g = rangeOf(r);
    if (!g) return `<span class="muted" title="${esc(r.fc?.reason || 'هیچ پیش‌بینی‌ای روی این نمودار وجود ندارد، بنابراین بازه‌ای برای نمایش نیست.')}">—</span>`;
    const f = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}%`;
    return `<span title="در ۸ مورد از ۱۰ مورد، قیمت در ${esc(horizonText(st.interval, DEFAULT_HORIZON[st.interval]))} آینده باید بین ${money(r.fc.range.p10)} و ${money(r.fc.range.p90)} قرار گیرد">${f(g.lo)} تا ${f(g.hi)}</span>`;
  };

  // سیگنال هوش مصنوعی صفحه ارز: قوانین تست‌شده نمودار اکنون چه کاری با این ارز انجام می‌دهند.
  const aiCell = (r) => {
    const a = r.ai;
    if (!a) return '<span class="muted" title="تاریخچه کافی برای اعمال قوانین روی این نمودار وجود ندارد.">—</span>';
    const label = { buy: 'خرید', hold: 'نگهداری', sell: 'فروش', wait: 'انتظار' }[a.action];
    const tone = { buy: 'up', hold: 'up', sell: 'down', wait: '' }[a.action];
    const why = a.action === 'wait' ? `بدون خرید در حال حاضر: ${a.why}.` : a.action === 'sell' ? `فروش در کندل آخر (${a.why}).` : a.action === 'buy' ? 'خریداری‌شده در آخرین کندل بسته شده.' : 'در جریان معامله‌ای که قبلاً خریداری شده است.';
    return `<span class="chip ${tone}" title="${esc(`${why} ${a.tested ? 'در تست‌ها، خریدهایی مانند این جهت حرکت را بهتر از شانس تشخیص ندادند؛ صفحه ارز سابقه آن را نشان می‌دهد.' : 'این قانون هرگز روی این نمودار تست نشده است.'}`)}">${label}</span>`;
  };

  // «اوج‌گیری در ۴ ساعت» — پاسخ به سوال «این روند تا چه مدت صعودی می‌ماند؟»
  const timingCell = (r) => {
    const t = r.tm;
    if (r.fc === undefined) return '';
    // یک خط تیره خالی قبلاً دو چیز متفاوت را پوشش می‌داد — اینکه هیچ زمان‌بندی‌ای
    // قابل محاسبه نبوده، و پیش‌بینی‌ای که هیچ نقطه بازگشتی در داخل افق زمانی ندارد —
    // و هیچ‌کدام را توضیح نمی‌داد. دلیل آن از قبل وجود دارد؛ صفحه ارز نیز آن را چاپ می‌کند.
    // آن را اینجا نیز قرار دهید تا دو صفحه با یکدیگر تناقض نداشته باشند.
    if (!t?.ok) return `<span class="muted" title="${esc(t?.reason || 'هیچ پیش‌بینی‌ای روی این نمودار وجود ندارد، بنابراین زمان‌بندی وجود ندارد.')}">—</span>`;
    if (!t.shaped) return `<span class="muted" title="${esc(`نمودارهای مشابه گذشته به جای ایجاد نوسان شدید، به طور یکنواخت به سمت ${t.endPct >= 0 ? 'بالا' : 'پایین'} حرکت کرده‌اند، بنابراین نقطه بازگشت مشخصی برای تعیین در این افق وجود ندارد.`)}">—</span>`;
    const m = t.rising ? t.peak : t.trough;
    // در مواردی که جهت قابل اعتماد نیست، فقط زمان‌بندی اندازه‌گیری شده است، بنابراین هیچ فلش یا رنگی وجود ندارد
    if (t.priceless) return `<span title="در نمودارهای مشابه گذشته، ${t.rising ? 'اوج' : 'کف'} این افق زمانی حدوداً در این نقطه رخ داده است. زمان، نه جهت.">${t.rising ? 'اوج' : 'کف'} در ${esc(horizonText(st.interval, m.bar))}</span>`;
    return `<span class="${t.rising ? 'up' : 'down'}">${t.rising ? '▲ اوج در' : '▼ کف در'} ${esc(horizonText(st.interval, m.bar))}</span>`;
  };

  const draw = () => {
    let rows = st.rows.filter((r) => r.signal?.ok);
    const f = st.filter;
    // همان احتمال نمایش‌داده‌شده در صفحه ارز: تعدیل‌شده با میزان اعتماد اندازه‌گیری‌شده
    // روی این نمودار، و عدم نمایش جهت در مواردی که تست نتیجه‌ای نداشته است.
    const trust = directionTrustFor(st.interval).trust;
    const reliable = directionReliable(st.interval, trust);
    const shown = (r) => (r.fc?.ok ? shownProbUp(r.fc.probUp, st.interval, trust) : null);
    if (f === 'buy') rows = rows.filter((r) => r.signal.score >= THRESHOLDS.normal);
    if (f === 'sell') rows = rows.filter((r) => r.signal.score <= -THRESHOLDS.normal);
    if (f === 'aibuy') rows = rows.filter((r) => r.ai?.action === 'buy' || r.ai?.action === 'hold');
    if (f === 'aiup') rows = rows.filter((r) => reliable && shown(r) !== null && shown(r) >= 0.54);
    if (f === 'aidown') rows = rows.filter((r) => reliable && shown(r) !== null && shown(r) <= 0.46);
    // عبارت `null < 32` در جاوا اسکریپت درست است، بنابراین ارزهایی که هنوز RSI نداشتند
    // به عنوان اشباع فروش فهرست می‌شدند.
    const rsiOf = (r) => (Number.isFinite(r.signal.indicators.rsi) ? r.signal.indicators.rsi : null);
    // همان خطوط ۳۰ / ۷۰ مطابق رنگ‌های ستون RSI، تحلیل‌گر و واژه‌نامه
    // (فیلترها از ۳۲ / ۶۸ استفاده می‌کردند، بنابراین ارزی می‌توانست بدون اینکه به عنوان اشباع فروش نمایش داده شود، در آن لیست قرار گیرد)
    if (f === 'oversold') rows = rows.filter((r) => rsiOf(r) !== null && rsiOf(r) < 30);
    if (f === 'overbought') rows = rows.filter((r) => rsiOf(r) !== null && rsiOf(r) > 70);
    const AI_RANK = { buy: 3, hold: 2, sell: 1, wait: 0 };
    const key = { aisig: (r) => AI_RANK[r.ai?.action] ?? -1, score: (r) => r.signal.score, ai: (r) => shown(r) ?? 0.5, rsi: (r) => r.signal.indicators.rsi ?? 50, chg: (r) => r.coin.change24h ?? 0, move: (r) => moveOf(r) ?? -1 }[st.sort];
    rows.sort((a, b) => key(b) - key(a));
    // «for the next 1 day» → «برای ۱ روز آینده»
    const hz = horizonText(st.interval, DEFAULT_HORIZON[st.interval]);
    $('#hz', el).textContent = hz.startsWith('1 ') ? hz.slice(2) : hz;
    if (!rows.length) {
      const noDirection = (f === 'aiup' || f === 'aidown') && !reliable;
      // تابع filter((k) => directionReliable(k)) — نه filter(directionReliable): ارسال مستقیم
      // تابع، ایندکس آرایه را به عنوان آرگومان اعتماد ارسال می‌کند، بنابراین لیست
      // از روی پوزیشن‌ها استخراج می‌شود نه میزان اعتماد اندازه‌گیری‌شده.
      const trusted = Object.keys(TESTED_ACCURACY.directionTrust).filter((k) => directionReliable(k)).join(', ');
      $('#tbl', el).innerHTML = st.rows.length
        ? `<div class="empty">${noDirection ? `پیش‌بینی روی نمودارهای ${esc(st.interval)} جهت قابل اعتمادی ندارد، بنابراین هیچ ارزی به عنوان صعودی یا نزولی علامت‌گذاری نشده است. این قابلیت روی ${trusted} فعال است.` : f === 'aibuy' ? `قوانین تست‌شده ${esc(st.interval)} در حال حاضر روی هیچ‌یک از این ارزها در موقعیت معامله نیستند.` : 'در حال حاضر هیچ ارزی با این فیلتر مطابقت ندارد.'}</div>`
        : skeleton(10, 26);
      return;
    }
    const th = (k, label, cls = '') => `<th${cls ? ` class="${cls}"` : ''} data-sort="${k}" aria-sort="${st.sort === k ? 'descending' : 'none'}">${label}${st.sort === k ? '\u00a0↓' : ''}</th>`;
    $('#tbl', el).innerHTML = `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">ارز</th><th class="hide-p">قیمت</th>${th('chg', '۲۴ ساعته', 'hide-p')}<th class="l">سیگنال</th>${th('aisig', 'سیگنال هوش مصنوعی')}${th('score', 'امتیاز')}${th('ai', 'صعود هوش مصنوعی', 'hide-p')}${th('move', 'بازه ۸۰٪', 'hide-p')}<th class="l hide-t">زمان‌بندی حرکت</th>${th('rsi', 'RSI', 'hide-t')}<th class="hide-l">روند</th></tr></thead><tbody>
      ${rows.map((r) => {
        const s = r.signal;
        const trend = s.indicators.ema200 ? (s.price > s.indicators.ema200 ? '<span class="up">بالای میانگین ۲۰۰</span>' : '<span class="down">پایین میانگین ۲۰۰</span>') : '—';
        const reason = (s.score >= 0 ? s.reasons.bullish[0] : s.reasons.bearish[0]) || '';
        const p = shown(r);
        const ai = !r.fc?.ok ? (r.fc === undefined ? '<span class="spinner" style="width:12px;height:12px"></span>' : '—')
          : reliable ? `<b class="${p >= 0.54 ? 'up' : p <= 0.46 ? 'down' : 'flat'}">${Math.round(p * 100)}%</b>`
          : `<span class="muted" title="جهت قابل اعتمادی روی این نمودار وجود ندارد (تمایل خام ${Math.round(r.fc.probUp * 100)}% صعودی)">—</span>`;
        return `<tr data-sym="${esc(r.coin.symbol)}"><td class="l"><div class="coin-cell">${coinLogo(r.coin, 24)}<b>${esc(r.coin.symbol)}</b><small class="hide-l">${esc(r.coin.name)}</small></div><small class="show-p-block">${money(s.price)}</small><small class="show-p-block">${changeHtml(r.coin.change24h)}</small></td>
          <td class="hide-p">${money(s.price)}</td><td class="hide-p">${changeHtml(r.coin.change24h)}</td>
          <td class="l"><span class="chip ${s.tone === 'flat' ? '' : s.tone}"${reason ? ` title="${esc(reason)}"` : ''}>${s.text}</span></td>
          <td>${aiCell(r)}</td>
          <td class="${s.tone}"><b>${s.score > 0 ? '+' : ''}${s.score}</b></td><td class="hide-p">${ai}</td><td class="fine wrap hide-p" style="min-width:84px">${rangeCell(r)}</td>
          <td class="l fine wrap hide-t" style="min-width:96px">${timingCell(r)}</td>
          <td class="hide-t ${s.indicators.rsi < 30 ? 'up' : s.indicators.rsi > 70 ? 'down' : ''}">${s.indicators.rsi?.toFixed(0) ?? '—'}</td>
          <td class="hide-l">${trend}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    wireSortHeaders($('#tbl', el), (k) => { st.sort = k; draw(); });
    $$('tr[data-sym]', el).forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/coin/${tr.dataset.sym}`; }));
  };

  const scan = async () => {
    const run = ++st.run;
    st.rows = [];
    st.skipped = 0;
    draw();
    let list;
    try {
      list = (await markets()).filter((c) => !isStable(c.symbol)).slice(0, st.count);
    } catch (err) {
      if (run !== st.run) return;
      $('#prog', el).textContent = 'اطلاعات اسکنر در دسترس نیست';
      $('#meter i', el).style.width = '0%';
      $('#tbl', el).innerHTML = `<div class="empty"><h3>داده‌های اسکنر در دسترس نیست</h3><p>${esc(err?.message || 'لیست بازار بارگذاری نشد.')}</p><button class="btn sm" id="retryScan" type="button">${icon('refresh', 14)} تلاش مجدد</button></div>`;
      $('#retryScan', el)?.addEventListener('click', scan);
      return;
    }
    if (!list.length) {
      $('#prog', el).textContent = 'هیچ جفت‌ارزی پشتیبانی نمی‌شود';
      $('#meter i', el).style.width = '0%';
      $('#tbl', el).innerHTML = '<div class="empty"><h3>ارزی برای اسکن وجود ندارد</h3><p>منبع بازار هیچ ارزی را برای این اسکن بازگرداند.</p></div>';
      return;
    }
    const iv = st.interval;
    let done = 0;
    const setProg = () => {
      $('#prog', el).textContent = done < list.length ? `در حال اسکن ${done}/${list.length}…`
        : `تعداد ${st.rows.length} ارز اسکن شد${st.skipped ? ` · ${st.skipped} ارز فاقد کندل صرافی در ${iv} رد شدند` : ''} · ${new Date().toLocaleTimeString()}`;
      $('#meter i', el).style.width = `${(done / list.length) * 100}%`;
    };
    setProg();
    const queue = [...list];
    const worker = async () => {
      while (queue.length) {
        const coin = queue.shift();
        try {
          // ۱۵۰۰ کندل صفحه ارز، به‌طوری‌که هر دو صفحه نمودار یکسانی را بخوانند.
          const res = await getCandles(coin, iv, 1500);
          if (run !== st.run || st.disposed) return;
          // سیگنال هوش مصنوعی صرفاً روی کندل‌های بسته شده تصمیم می‌گیرد، درست مانند صفحه ارز
          if (isTestedSource(res)) st.rows.push({ coin, signal: generateSignal(res.candles, { interval: iv }), ai: aiSignal(res.candles.slice(0, -1), iv, coin.symbol), fc: undefined, candles: res.candles });
          else st.skipped++;
        } catch { st.skipped++; }
        done++; setProg(); draw();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    // مرحله هوش مصنوعی (به صورت ترتیبی، در پردازشگر پس‌زمینه)
    for (const row of [...st.rows].sort((a, b) => Math.abs(b.signal.score) - Math.abs(a.signal.score))) {
      if (run !== st.run || st.disposed) return;
      try {
        // پیش‌بینی کاملی که صفحه ارز اجرا می‌کند؛ حالت `fast` هرگز تست نشده است.
        const fc = await runForecast(row.candles, { horizon: DEFAULT_HORIZON[iv], intervalMs: INTERVAL_MS[iv] });
        row.tm = fc?.ok ? timingOutlook(fc, { intervalMs: INTERVAL_MS[iv], interval: iv }) : null;
        // نمایش داده‌نشده با تمایل جهت‌دار در مواردی که جهت قابل اعتماد نیست، درست مانند صفحه ارز
        row.fc = fc?.ok ? forecastForDisplay(fc, iv, directionTrustFor(iv).trust) : fc;
      } catch { row.fc = null; row.tm = null; }
      row.candles = null;
      draw();
    }
  };

  bindSeg($('#iv', el), (v) => { st.interval = v; scan(); });
  bindSeg($('#cnt', el), (v) => { st.count = +v; scan(); });
  bindSeg($('#flt', el), (v) => { st.filter = v; draw(); });
  $('#rescan', el).addEventListener('click', scan);
  scan();
  return () => { st.disposed = true; st.run++; };
}