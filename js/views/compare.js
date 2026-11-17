import { markets, findCoin, getCandles, isStable } from '../api/market.js';
import { LineChart } from '../charts/line.js';
import { $, $$, coinLogo, skeleton, bindSeg, icon, errorBox } from '../ui.js';
import { esc, pct, dateTime } from '../format.js';
import { historyMatch, backtestAnalog, analogVerdict } from '../lib/analog.js';

export const title = 'مقایسه';
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const COLORS = ['--series-1', '--series-2', '--series-3', '--series-5', '--series-7', '--series-4'];
const PERIODS = { '7d': ['1h', 168, 24 * 365], '30d': ['4h', 180, 6 * 365], '90d': ['1d', 90, 365], '1y': ['1d', 365, 365], '3y': ['1d', 1095, 365] };

export async function render(el, [preset]) {
  const st = { coins: preset ? preset.split(',').map((s) => s.toUpperCase()).slice(0, 6) : ['BTC', 'ETH', 'SOL'], period: '30d', chart: null, selfSym: null, selfChart: null, selfSeq: 0, disposed: false };
  const all = await markets().catch(() => []);
  el.innerHTML = `
    <div class="page-head">
      <div><h1>مقایسه</h1><p>مقایسه هم‌زمان بازدهی، نوسانات، افت از سقف (Drawdown) و میزان هم‌بستگی حرکت رمزارزها.</p></div>
      <div class="seg" id="per">${Object.keys(PERIODS).map((p) => `<button data-v="${p}" class="${p === st.period ? 'on' : ''}">${p.toUpperCase()}</button>`).join('')}</div>
    </div>
    <div class="card">
      <div class="row" id="picked" style="margin-bottom:12px"></div>
      <div id="chartArea"></div>
    </div>
    <div class="grid g2 mt cmp-grid">
      <div class="card"><div class="card-h"><h3>آمار و شاخص‌ها</h3></div><div id="stats">${skeleton(5)}</div></div>
      <div class="card"><div class="card-h"><h3>هم‌بستگی (Correlation)</h3><span class="fine">۱ = حرکت هم‌جهت · ۰ = بدون ارتباط · ۱− = حرکت معکوس</span></div><div id="corr">${skeleton(5)}</div></div>
    </div>
    <div class="card mt">
      <div class="card-h">
        <h3>${icon('history', 16)} مقایسه یک رمزارز با گذشته خودش</h3>
        <span class="fine">بخش‌هایی از تاریخچه قیمت را که الگوی مشابهی داشته‌اند پیدا می‌کند و رفتار بعدی قیمت را نشان می‌دهد</span>
      </div>
      <div class="seg" id="selfPick" style="margin-bottom:12px"></div>
      <div id="selfBody">${skeleton(6, 26)}</div>
    </div>
    <datalist id="coinList">${all.filter((c) => !isStable(c.symbol)).map((c) => `<option value="${esc(c.symbol)}">${esc(c.name)}</option>`).join('')}</datalist>`;

  const drawPicked = () => {
    $('#picked', el).innerHTML = st.coins.map((s, i) => `<span class="chip" style="border-left:4px solid var(${COLORS[i]})">${esc(s)} <button class="star" data-rm="${esc(s)}" aria-label="حذف ${esc(s)}" style="padding:0">${icon('close', 13)}</button></span>`).join('')
      + (st.coins.length < 6 ? `<input class="inp" id="add" list="coinList" placeholder="+ افزودن ارز" style="width:130px;height:30px">` : '');
    $$('[data-rm]', el).forEach((b) => b.addEventListener('click', () => { st.coins = st.coins.filter((c) => c !== b.dataset.rm); drawPicked(); load(); drawSelfPick(); loadSelf(); }));
    $('#add', el)?.addEventListener('change', (e) => {
      const v = e.target.value.trim().toUpperCase();
      if (v && !st.coins.includes(v) && all.some((c) => c.symbol === v)) { st.coins.push(v); drawPicked(); load(); drawSelfPick(); }
      else e.target.value = '';
    });
  };

  const load = async () => {
    if (!st.coins.length) { $('#chartArea', el).innerHTML = '<div class="empty">برای مقایسه، یک رمزارز اضافه کنید.</div>'; return; }
    const [iv, count, perYear] = PERIODS[st.period];
    $('#chartArea', el).innerHTML = skeleton(8, 30);
    const series = (await Promise.all(st.coins.map(async (sym, i) => {
      try {
        const coin = await findCoin(sym);
        const { candles } = await getCandles(coin, iv, count + 1);
        return { sym, coin, candles: candles.slice(-(count + 1)), color: cssVar(COLORS[i]) };
      } catch { return null; }
    }))).filter(Boolean);
    if (st.disposed) return;
    if (!series.length) { $('#chartArea', el).innerHTML = errorBox('داده‌ای برای این رمزارزها یافت نشد.', load); return; }
    $('#chartArea', el).innerHTML = '';
    st.chart?.destroy();
    st.chart = new LineChart($('#chartArea', el), { height: 380, zeroLine: 0, yFormat: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, xFormat: (x) => new Date(x).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }), tooltipX: (x) => dateTime(x, iv !== '1d') });
    st.chart.set(series.map((s) => ({ name: s.sym, color: s.color, width: 2, data: s.candles.map((c) => ({ x: c.t, y: (c.c / s.candles[0].c - 1) * 100 })) })));

    // stats
    const rets = series.map((s) => s.candles.slice(1).map((c, k) => Math.log(c.c / s.candles[k].c)));
    const stats = series.map((s, i) => {
      const r = rets[i];
      if (!r.length || s.candles.length < 2) {
        return { ...s, total: null, vol: null, dd: null, best: null, worst: null, ratio: null, thin: true };
      }
      const mean = r.reduce((a, b) => a + b, 0) / r.length;
      const vol = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length) * Math.sqrt(perYear);
      let peak = s.candles[0].c, dd = 0; for (const c of s.candles) { peak = Math.max(peak, c.c); dd = Math.max(dd, 1 - c.c / peak); }
      const total = (s.candles[s.candles.length - 1].c / s.candles[0].c - 1) * 100;
      const periodVol = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length) * Math.sqrt(r.length);
      return { ...s, total, vol: vol * 100, dd: dd * 100, best: Math.max(...r) * 100, worst: Math.min(...r) * 100, ratio: periodVol ? (mean * r.length) / periodVol : 0, thin: false };
    });
    $('#stats', el).innerHTML = `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">ارز</th><th>بازدهی</th><th>نوسان (سالانه)</th><th>بیشترین افت</th><th class="hide-m hide-l">بهترین / بدترین کندل</th><th>بازدهی ÷ ریسک</th></tr></thead><tbody>
      ${stats.sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity)).map((s) => `<tr data-sym="${esc(s.sym)}"><td class="l"><div class="coin-cell">${coinLogo(s.coin, 22)}<b>${esc(s.sym)}</b></div></td>
        ${s.thin
          ? `<td colspan="5" class="muted fine">تاریخچه قیمت کافی در این بازه زمانی برای محاسبه وجود ندارد</td>`
          : `<td class="${s.total >= 0 ? 'up' : 'down'}"><b>${pct(s.total)}</b></td><td>${s.vol.toFixed(0)}%</td><td class="down">${pct(-s.dd, 1)}</td>
        <td class="hide-m hide-l"><span class="up">${pct(s.best, 1)}</span> / <span class="down">${pct(s.worst, 1)}</span></td><td>${s.ratio.toFixed(2)}</td>`}</tr>`).join('')}
    </tbody></table></div><p class="fine mt">${stats.filter((x) => !x.thin).length ? `بهترین عملکرد در بازه ${st.period.toUpperCase()} گذشته: <b>${esc(stats.find((x) => !x.thin).sym)}</b> — این آمار فقط مربوط به بازه گذشته است و تضمینی برای عملکرد آینده نیست.` : ''} نسبت «بازدهی ÷ ریسک» حاصل تقسیم بازدهی دوره بر نوسانات همان دوره است: عدد بالاتر از ۱ به معنای سود قابل توجه نسبت به میزان نوسان است.</p>`;
    $$('#stats tr[data-sym]', el).forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/coin/${tr.dataset.sym}`; }));

    // correlation matrix on aligned timestamps
    const maps = series.map((s) => new Map(s.candles.slice(1).map((c, k) => [c.t, Math.log(c.c / s.candles[k].c)])));
    const corr = (a, b) => {
      const xs = [], ys = [];
      for (const [t, v] of maps[a]) if (maps[b].has(t)) { xs.push(v); ys.push(maps[b].get(t)); }
      if (xs.length < 5) return null;
      const mx = xs.reduce((p, q) => p + q, 0) / xs.length, my = ys.reduce((p, q) => p + q, 0) / ys.length;
      let sxy = 0, sx = 0, sy = 0;
      for (let k = 0; k < xs.length; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sx += (xs[k] - mx) ** 2; sy += (ys[k] - my) ** 2; }
      return sxy / Math.sqrt(sx * sy);
    };
    const cell = (v) => {
      if (v === null) return '<td>—</td>';
      const a = Math.abs(v);
      const bg = v >= 0 ? `rgba(57,135,229,${0.1 + a * 0.55})` : `rgba(230,103,103,${0.1 + a * 0.55})`;
      return `<td style="background:${bg};text-align:center;font-weight:600">${v.toFixed(2)}</td>`;
    };
    $('#corr', el).innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${series.map((s) => `<th style="text-align:center">${esc(s.sym)}</th>`).join('')}</tr></thead><tbody>
      ${series.map((s, i) => `<tr style="cursor:default"><td class="l"><b>${esc(s.sym)}</b></td>${series.map((_, j) => (i === j ? '<td style="text-align:center" class="muted">1.00</td>' : cell(corr(i, j)))).join('')}</tr>`).join('')}
    </tbody></table></div><p class="fine mt">هم‌بستگی بالا به این معناست که نگهداری هم‌زمان هر دو ارز، تنوع‌بخشی (ریسک‌گریزی) چندانی به سبد شما اضافه نمی‌کند.</p>`;
  };


  // ---------------------------------------------------------------------------
  // مقایسه دیگر: مقایسه یک رمزارز با گذشته خودش.
  const CANDLE_WORD = { '1h': 'ساعته', '4h': 'چهار ساعته', '1d': 'روزانه' };

  const drawSelfPick = () => {
    const host = $('#selfPick', el);
    if (!host) return;
    if (!st.coins.length) { host.innerHTML = '<span class="fine muted">برای مقایسه تاریخچه، یک ارز از بالا اضافه کنید.</span>'; return; }
    if (!st.coins.includes(st.selfSym)) st.selfSym = st.coins[0];
    host.innerHTML = st.coins.map((s) => `<button data-self="${esc(s)}" class="${s === st.selfSym ? 'on' : ''}">${esc(s)}</button>`).join('');
    $$('[data-self]', host).forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.self === st.selfSym) return;
      st.selfSym = b.dataset.self;
      drawSelfPick();
      loadSelf();
    }));
  };

  const loadSelf = async () => {
    const body = $('#selfBody', el);
    if (!body) return;
    if (!st.selfSym) { body.innerHTML = '<div class="empty">برای مقایسه با تاریخچه خودش، یک رمزارز اضافه کنید.</div>'; return; }
    const seq = ++st.selfSeq;
    const sym = st.selfSym;
    const iv = PERIODS[st.period][0];
    body.innerHTML = skeleton(6, 26);
    st.selfChart?.destroy(); st.selfChart = null;

    let candles;
    try {
      const coin = await findCoin(sym);
      ({ candles } = await getCandles(coin, iv, 1000));
    } catch {
      if (st.disposed || seq !== st.selfSeq) return;
      body.innerHTML = errorBox(`بارگذاری تاریخچه قیمت برای ${sym} ناموفق بود.`, loadSelf);
      return;
    }
    if (st.disposed || seq !== st.selfSeq) return;

    const match = historyMatch(candles, { interval: iv });
    const score = match.ok ? backtestAnalog(candles, { interval: iv }) : null;
    const v = analogVerdict(match, score, { symbol: sym, interval: iv, horizonText: match.ok ? `${match.horizon} کندل ${CANDLE_WORD[iv] || ''}`.trim() : null });

    if (!match.ok) {
      body.innerHTML = `<div class="empty"><p>${esc(match.reason)}</p></div>`;
      return;
    }

    const chip = score?.ok && !score.beatsBaseline ? 'بدون برتری آماری مشخص'
      : match.direction === 'up' ? 'تمایل تاریخی به صعود'
      : match.direction === 'down' ? 'تمایل تاریخی به نزول' : 'نتایج تاریخی دوگانه';

    body.innerHTML = `
      <div class="row spread" style="gap:10px;flex-wrap:wrap">
        <span class="chip ${v.tone === 'warn' ? 'warn' : v.tone}"><b>${esc(chip)}</b></span>
        <span class="fine">${match.matches.length} الگوی منطبق · ساختار ${match.window} کندلی · افق ${match.horizon} کندل بعدی</span>
      </div>
      <p class="mt">${esc(v.headline)}</p>
      <div id="selfChart" class="mt"></div>
      <p class="fine" style="margin-top:6px">هر خط کم‌رنگ نشان‌دهنده یک بازه تاریخی منطبق است که طوری تراز شده‌اند تا نقطه پایان الگو روی عدد ۰ محور قرار گیرد. هر آنچه در سمت راست خط جداکننده قرار دارد، اتفاقی است که در واقعیت پس از آن رخ داده است.</p>
      ${v.lines.map((l) => `<p class="fine" style="margin:8px 0 0">${esc(l)}</p>`).join('')}
      <div class="tbl-wrap mt"><table class="tbl fit"><thead><tr>
        <th class="l">زمان پایان الگوی مشابه</th><th>میزان شباهت</th><th>تغییر در ${match.horizon} کندل بعدی</th><th class="hide-m">سقف</th><th class="hide-m">کف</th>
      </tr></thead><tbody>
        ${match.matches.map((m) => `<tr style="cursor:default"><td class="l wrap">${esc(dateTime(m.endTime, iv !== '1d'))}</td>
          <td>${(m.similarity * 100).toFixed(0)}%</td>
          <td class="${m.futureReturnPct >= 0 ? 'up' : 'down'}"><b>${pct(m.futureReturnPct)}</b></td>
          <td class="hide-m up">${pct(m.maxUpPct)}</td><td class="hide-m down">${pct(m.maxDownPct)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="fine mt">نحوه امتیازدهی: الگویاب در ${score?.ok ? score.tests : 'کندل‌های'} گذشته تنها با استفاده از داده‌های موجود در همان زمان بازپخش شده و با فاصله حداقل یک افق زمانی از هم (برای جلوگیری از هم‌پوشانی نتایج) با رفتار واقعی بازار سنجیده شده است. تطبیق الگو تنها یکی از ابزارهای تحلیلی است و به تنهایی پیش‌بینی قطعی محسوب نمی‌شود.</p>`;

    const W = match.window;
    const host = $('#selfChart', el);
    st.selfChart = new LineChart(host, {
      height: 320, zeroLine: 0,
      yFormat: (y) => `${y >= 0 ? '+' : ''}${y.toFixed(1)}%`,
      xFormat: (x) => `${x > 0 ? '+' : ''}${Math.round(x)}`,
      tooltipX: (x) => (x === 0 ? 'پایان الگو' : `${x > 0 ? '+' : ''}${Math.round(x)} کندل`),
    });
    const lines = match.matches.map((m, i) => ({
      name: dateTime(m.endTime, false),
      color: cssVar(COLORS[i % COLORS.length]),
      width: 1.2, alpha: 0.5,
      data: m.series.map((y, j) => ({ x: j - (W - 1), y: y - 100 })),
    }));
    lines.push({
      name: `${sym} اکنون`, color: cssVar('--accent'), width: 2.8,
      data: match.currentSeries.map((y, j) => ({ x: j - (W - 1), y: y - 100 })),
    });
    st.selfChart.set(lines, { divider: 0, dividerLabel: 'اکنون' });
  };

  bindSeg($('#per', el), (v) => { st.period = v; load(); drawSelfPick(); loadSelf(); });
  drawPicked();
  drawSelfPick();
  load();
  loadSelf();
  return () => { st.disposed = true; st.chart?.destroy(); st.selfChart?.destroy(); };
}