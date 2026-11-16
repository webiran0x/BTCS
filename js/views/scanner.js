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
      <div><h1>اسکنر بازار</h1><p>بررسی ارزهای برتر (بایننس یا گیت‌یو، هوبی و اوکی‌اکس برای ارزهایی که در بایننس نیستند) و رتبه‌بندی آن‌ها بر اساس شدت تمایل اندیکاتورها و خروجی پیش‌بینی. مرتب‌سازی بر اساس امتیاز راهی برای یافتن چارت‌های واگرا یا گسترش‌یافته است، نه رتبه‌بندی قطعی برای خرید.</p></div>
      <div class="row">
        <div class="seg" id="iv">${['1m', '5m', '15m', '1h', '4h', '1d'].map((i) => `<button data-v="${i}" class="${i === st.interval ? 'on' : ''}">${i}</button>`).join('')}</div>
        <div class="seg" id="cnt"><button data-v="20">۲۰ ارز برتر</button><button data-v="30" class="on">۳۰ ارز برتر</button><button data-v="50">۵۰ ارز برتر</button></div>
        <button class="btn" id="rescan">${icon('refresh', 16)} اسکن مجدد</button>
      </div>
    </div>
    <div class="card">
      <div class="card-h">
        <div class="seg" id="flt"><button data-v="all" class="on">همه</button><button data-v="buy">صعودی</button><button data-v="sell">نزولی</button><button data-v="aibuy">سیگنال هوش مصنوعی: خرید/نگهداری</button><button data-v="aiup">هوش مصنوعی: احتمال رشد</button><button data-v="aidown">هوش مصنوعی: احتمال افت</button><button data-v="oversold">اشباع فروش</button><button data-v="overbought">اشباع خرید</button></div>
        <span class="fine" id="prog"></span>
      </div>
      <div class="meter" id="meter" style="margin-bottom:10px"><i style="width:0%"></i></div>
      <div id="tbl">${skeleton(10, 26)}</div>
      <p class="fine mt">امتیاز: از ۱۰۰- تا ۱۰۰+، نشان‌دهنده میزان هم‌راستایی روند، مومنتوم، RSI، MACD، بولینگر، استوکاستیک RSI، حجم و ADX. این امتیاز یک <b>دستور خرید یا فروش قطعی نیست</b> — در تست‌های انجام‌شده روی ${SCORE_BUCKETS_TESTED.bars.toLocaleString('en-US')} کندل از ${SCORE_BUCKETS_TESTED.coins} ارز، سهم مواردی که با افزایش امتیاز صعود کرده‌اند در واقع بیشتر <b>کاهش</b> یافته است؛ بنابراین امتیاز بالا نشان‌دهنده کشیدگی حرکت (Extended) است تا تداوم حتمی آن. «سیگنال هوش مصنوعی» عملکرد قوانین تست‌شده روی چارت را نشان می‌دهد: خرید، نگهداری (داخل پوزیشن)، فروش یا انتظار؛ در آزمایش‌ها، خریدهای این بخش جهتی بهتر از شانس پیش‌بینی نکردند و صفحه هر ارز سوابق آن را نشان می‌دهد. «هوش مصنوعی صعودی» پیش‌بینی صفحه ارز برای <span id="hz"></span> آینده است که تنها در تایم‌فریم‌های دارای دقت تاییدشده نمایش داده می‌شود. «محدوده ۸۰٪» بازه‌ای است که قیمت طی آن مدت، ۸ بار از ۱۰ بار در آن آرام می‌گیرد و روی قیمت امروز متمرکز است (در تست ۱۰۰ هزار دامنه روی ۲۴ ارز، بین ۷۷ تا ۸۰٪ نتایج را پوشش داده است)؛ مرتب‌سازی بر اساس آن برای یافتن پرنوسان‌ترین ارزها مفید است. «زمان‌بندی حرکت» زمان وقوع سقف (یا کف) را بر اساس الگوهای تاریخی مشابه نشان می‌دهد — زمان، نه جهت. برای مشاهده پیش‌بینی کامل با آمار دقت، صفحه هر ارز را باز کنید.</p>
    </div>`;

  const rangeOf = (r) => {
    const f = r.fc;
    if (!f?.ok || !f.range || !(f.lastPrice > 0)) return null;
    return { lo: (f.range.p10 / f.lastPrice - 1) * 100, hi: (f.range.p90 / f.lastPrice - 1) * 100 };
  };
  const moveOf = (r) => { const g = rangeOf(r); return g ? g.hi - g.lo : null; };
  const rangeCell = (r) => {
    if (r.fc === undefined) return '<span class="spinner" style="width:12px;height:12px"></span>';
    const g = rangeOf(r);
    if (!g) return `<span class="muted" title="${esc(r.fc?.reason || 'پیش‌بینی روی این چارت موجود نیست، بنابراین محدوده‌ای برای نمایش وجود ندارد.')}">—</span>`;
    const f = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}%`;
    return `<span title="۸ بار از ۱۰ بار، قیمت در انتهای ${esc(horizonText(st.interval, DEFAULT_HORIZON[st.interval]))} آینده بین ${money(r.fc.range.p10)} و ${money(r.fc.range.p90)} خواهد بود">${f(g.lo)} تا ${f(g.hi)}</span>`;
  };

  const aiCell = (r) => {
    const a = r.ai;
    if (!a) return '<span class="muted" title="تاریخچه کافی برای قوانین این چارت وجود ندارد.">—</span>';
    const label = { buy: 'خرید', hold: 'نگهداری', sell: 'فروش', wait: 'انتظار' }[a.action];
    const tone = { buy: 'up', hold: 'up', sell: 'down', wait: '' }[a.action];
    const why = a.action === 'wait' ? `بدون خرید: ${a.why}.` : a.action === 'sell' ? `فروش در آخرین کندل (${a.why}).` : a.action === 'buy' ? 'خرید در آخرین کندل بسته شده.' : 'در پوزیشن فعال.';
    return `<span class="chip ${tone}" title="${esc(`${why} ${a.tested ? 'در تست‌ها، خریدهای مشابه عملکردی بهتر از شانس نداشتند؛ سوابق در صفحه ارز قابل مشاهده است.' : 'این قانون روی این چارت تست نشده است.'}`)}">${label}</span>`;
  };

  const timingCell = (r) => {
    const t = r.tm;
    if (r.fc === undefined) return '';
    if (!t?.ok) return `<span class="muted" title="${esc(t?.reason || 'پیش‌بینی روی این چارت موجود نیست، بنابراین زمان‌بندی قابل محاسبه نیست.')}">—</span>`;
    if (!t.shaped) return `<span class="muted" title="${esc(`چارت‌های مشابه روند یکنواختی رو به ${t.endPct >= 0 ? 'بالا' : 'پایین'} داشته‌اند تا نوسان شدید، لذا نقطه عطف مشخصی ثبت نشد.`)}">—</span>`;
    const m = t.rising ? t.peak : t.trough;
    if (t.priceless) return `<span title="در الگوهای گذشته، ${t.rising ? 'سقف' : 'کف'} این افق زمانی حدود این زمان رخ داده است. زمان، نه جهت.">${t.rising ? 'سقف' : 'کف'} در ${esc(horizonText(st.interval, m.bar))}</span>`;
    return `<span class="${t.rising ? 'up' : 'down'}">${t.rising ? '▲ سقف' : '▼ کف'} در ${esc(horizonText(st.interval, m.bar))}</span>`;
  };

  const draw = () => {
    let rows = st.rows.filter((r) => r.signal?.ok);
    const f = st.filter;
    const trust = directionTrustFor(st.interval).trust;
    const reliable = directionReliable(st.interval, trust);
    const shown = (r) => (r.fc?.ok ? shownProbUp(r.fc.probUp, st.interval, trust) : null);
    if (f === 'buy') rows = rows.filter((r) => r.signal.score >= THRESHOLDS.normal);
    if (f === 'sell') rows = rows.filter((r) => r.signal.score <= -THRESHOLDS.normal);
    if (f === 'aibuy') rows = rows.filter((r) => r.ai?.action === 'buy' || r.ai?.action === 'hold');
    if (f === 'aiup') rows = rows.filter((r) => reliable && shown(r) !== null && shown(r) >= 0.54);
    if (f === 'aidown') rows = rows.filter((r) => reliable && shown(r) !== null && shown(r) <= 0.46);
    const rsiOf = (r) => (Number.isFinite(r.signal.indicators.rsi) ? r.signal.indicators.rsi : null);
    if (f === 'oversold') rows = rows.filter((r) => rsiOf(r) !== null && rsiOf(r) < 30);
    if (f === 'overbought') rows = rows.filter((r) => rsiOf(r) !== null && rsiOf(r) > 70);
    const AI_RANK = { buy: 3, hold: 2, sell: 1, wait: 0 };
    const key = { aisig: (r) => AI_RANK[r.ai?.action] ?? -1, score: (r) => r.signal.score, ai: (r) => shown(r) ?? 0.5, rsi: (r) => r.signal.indicators.rsi ?? 50, chg: (r) => r.coin.change24h ?? 0, move: (r) => moveOf(r) ?? -1 }[st.sort];
    rows.sort((a, b) => key(b) - key(a));
    const hz = horizonText(st.interval, DEFAULT_HORIZON[st.interval]);
    $('#hz', el).textContent = hz;
    if (!rows.length) {
      const noDirection = (f === 'aiup' || f === 'aidown') && !reliable;
      const trusted = Object.keys(TESTED_ACCURACY.directionTrust).filter((k) => directionReliable(k)).join(', ');
      $('#tbl', el).innerHTML = st.rows.length
        ? `<div class="empty">${noDirection ? `پیش‌بینی روی چارت ${esc(st.interval)} جهت قابل اتکایی ندارد، لذا موردی علامت‌گذاری نشده است. جهت‌های معتبر در این تایم‌فریم‌ها وجود دارند: ${trusted}.` : f === 'aibuy' ? `قوانین تست‌شده ${esc(st.interval)} روی هیچ‌یک از این ارزها پوزیشن فعالی ندارند.` : 'هیچ ارزی با این فیلتر مطابقت ندارد.'}</div>`
        : skeleton(10, 26);
      return;
    }
    const th = (k, label, cls = '') => `<th${cls ? ` class="${cls}"` : ''} data-sort="${k}" aria-sort="${st.sort === k ? 'descending' : 'none'}">${label}${st.sort === k ? '\u00a0↓' : ''}</th>`;
    $('#tbl', el).innerHTML = `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">ارز</th><th class="hide-p">قیمت</th>${th('chg', '۲۴ساعت', 'hide-p')}<th class="l">سیگنال</th>${th('aisig', 'سیگنال هوش مصنوعی')}${th('score', 'امتیاز')}${th('ai', 'رشد هوش مصنوعی', 'hide-p')}${th('move', 'محدوده ۸۰٪', 'hide-p')}<th class="l hide-t">زمان‌بندی حرکت</th>${th('rsi', 'RSI', 'hide-t')}<th class="hide-l">روند</th></tr></thead><tbody>
      ${rows.map((r) => {
        const s = r.signal;
        const trend = s.indicators.ema200 ? (s.price > s.indicators.ema200 ? '<span class="up">بالای EMA ۲۰۰</span>' : '<span class="down">زیر EMA ۲۰۰</span>') : '—';
        const reason = (s.score >= 0 ? s.reasons.bullish[0] : s.reasons.bearish[0]) || '';
        const p = shown(r);
        const ai = !r.fc?.ok ? (r.fc === undefined ? '<span class="spinner" style="width:12px;height:12px"></span>' : '—')
          : reliable ? `<b class="${p >= 0.54 ? 'up' : p <= 0.46 ? 'down' : 'flat'}">${Math.round(p * 100)}%</b>`
          : `<span class="muted" title="جهت قابل اتکایی روی این چارت وجود ندارد (پیش‌بینی خام ${Math.round(r.fc.probUp * 100)}٪ صعود)">—</span>`;
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
      $('#prog', el).textContent = 'اسکن در دسترس نیست';
      $('#meter i', el).style.width = '0%';
      $('#tbl', el).innerHTML = `<div class="empty"><h3>اطلاعات اسکنر در دسترس نیست</h3><p>${esc(err?.message || 'لیست بازار بارگذاری نشد.')}</p><button class="btn sm" id="retryScan" type="button">${icon('refresh', 14)} تلاش مجدد</button></div>`;
      $('#retryScan', el)?.addEventListener('click', scan);
      return;
    }
    if (!list.length) {
      $('#prog', el).textContent = 'جفت‌ارز پشتیبانی‌شده‌ای یافت نشد';
      $('#meter i', el).style.width = '0%';
      $('#tbl', el).innerHTML = '<div class="empty"><h3>ارزی برای اسکن وجود ندارد</h3><p class="fine">منبع بازار هیچ ارزی برای اسکن برنگرداند.</p></div>';
      return;
    }
    const iv = st.interval;
    let done = 0;
    const setProg = () => {
      $('#prog', el).textContent = done < list.length ? `در حال اسکن ${done}/${list.length}…`
        : `اسکن ${st.rows.length} ارز${st.skipped ? ` · ${st.skipped} ارز فاقد کندل صرافی در ${iv} رد شدند` : ''} · ${new Date().toLocaleTimeString('fa-IR')}`;
      $('#meter i', el).style.width = `${(done / list.length) * 100}%`;
    };
    setProg();
    const queue = [...list];
    const worker = async () => {
      while (queue.length) {
        const coin = queue.shift();
        try {
          const res = await getCandles(coin, iv, 1500);
          if (run !== st.run || st.disposed) return;
          if (isTestedSource(res)) st.rows.push({ coin, signal: generateSignal(res.candles, { interval: iv }), ai: aiSignal(res.candles.slice(0, -1), iv, coin.symbol), fc: undefined, candles: res.candles });
          else st.skipped++;
        } catch { st.skipped++; }
        done++; setProg(); draw();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    for (const row of [...st.rows].sort((a, b) => Math.abs(b.signal.score) - Math.abs(a.signal.score))) {
      if (run !== st.run || st.disposed) return;
      try {
        const fc = await runForecast(row.candles, { horizon: DEFAULT_HORIZON[iv], intervalMs: INTERVAL_MS[iv] });
        row.tm = fc?.ok ? timingOutlook(fc, { intervalMs: INTERVAL_MS[iv], interval: iv }) : null;
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