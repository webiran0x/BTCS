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
    <style>
      .ap-compare-wrap {
        direction: rtl;
        text-align: right;
        max-width: 1360px;
        margin: 0 auto;
        padding-bottom: 60px;
      }
      .ap-hero-card {
        background: radial-gradient(circle at top right, rgba(94, 92, 230, 0.09), transparent 50%),
                    radial-gradient(circle at bottom left, rgba(50, 215, 75, 0.07), transparent 50%),
                    rgba(24, 24, 29, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 28px;
        padding: 32px;
        backdrop-filter: blur(28px);
        -webkit-backdrop-filter: blur(28px);
        margin-bottom: 24px;
        box-shadow: 0 24px 54px rgba(0, 0, 0, 0.35);
      }
      .ap-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.075);
        border-radius: 22px;
        padding: 24px;
        backdrop-filter: blur(22px);
        -webkit-backdrop-filter: blur(22px);
        transition: border-color 0.25s ease, box-shadow 0.25s ease;
        margin-bottom: 24px;
      }
      .ap-card:hover {
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
      }
      .ap-compare-wrap .seg {
        background: rgba(255, 255, 255, 0.05);
        padding: 4px;
        border-radius: 12px;
        display: inline-flex;
        gap: 4px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .ap-compare-wrap .seg button {
        background: transparent;
        border: 0;
        color: rgba(255, 255, 255, 0.6);
        padding: 6px 14px;
        border-radius: 9px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      }
      .ap-compare-wrap .seg button.on {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      }
      .ap-compare-wrap table.tbl {
        width: 100%;
        border-collapse: collapse;
      }
      .ap-compare-wrap table.tbl th, .ap-compare-wrap table.tbl td {
        padding: 12px 16px;
        text-align: right;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 0.9rem;
      }
      .ap-compare-wrap table.tbl th {
        color: rgba(255, 255, 255, 0.5);
        font-weight: 500;
        font-size: 0.8rem;
      }
      .ap-compare-wrap table.tbl tr:hover td {
        background: rgba(255, 255, 255, 0.02);
      }
      .ap-compare-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      @media(max-width: 960px) {
        .ap-compare-grid { grid-template-columns: 1fr; }
      }
    </style>

    <div class="ap-compare-wrap" dir="rtl">
      <div class="ap-hero-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px">
        <div>
          <h1 style="font-size:2.2rem;font-weight:700;letter-spacing:-0.02em;color:#fff;margin:0 0 8px 0">مقایسه</h1>
          <p style="color:rgba(255,255,255,0.7);font-size:1.05rem;line-height:1.6;margin:0;max-width:850px">مقایسه هم‌زمان بازدهی، نوسانات، افت از سقف (Drawdown) و میزان هم‌بستگی حرکت رمزارزها[cite: 15].</p>
        </div>
        <div class="seg" id="per">${Object.keys(PERIODS).map((p) => `<button data-v="${p}" class="${p === st.period ? 'on' : ''}">${p.toUpperCase()}</button>`).join('')}</div>
      </div>

      <div class="ap-card">
        <div class="row" id="picked" style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center"></div>
        <div id="chartArea"></div>
      </div>

      <div class="ap-compare-grid">
        <div class="ap-card" style="margin-bottom:0"><div class="card-h" style="margin-bottom:16px"><h3 style="margin:0;font-size:1.15rem;color:#fff">آمار و شاخص‌ها</h3></div><div id="stats">${skeleton(5)}</div></div>
        <div class="ap-card" style="margin-bottom:0"><div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0;font-size:1.15rem;color:#fff">هم‌بستگی (Correlation)</h3><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.8rem">۱ = هم‌جهت · ۰ = بدون ارتباط · ۱− = معکوس</span></div><div id="corr">${skeleton(5)}</div></div>
      </div>

      <div class="ap-card mt" style="margin-top:24px">
        <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
          <div><h3 style="margin:0 0 4px 0;font-size:1.15rem;color:#fff">${icon('history', 16)} مقایسه یک رمزارز با گذشته خودش</h3><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.85rem">یافتن الگوهای مشابه در تاریخچه قیمت و پیش‌بینی رفتار بعدی[cite: 15]</span></div>
        </div>
        <div class="seg" id="selfPick" style="margin-bottom:16px"></div>
        <div id="selfBody">${skeleton(6, 26)}</div>
      </div>
    </div>
    <datalist id="coinList">${all.filter((c) => !isStable(c.symbol)).map((c) => `<option value="${esc(c.symbol)}">${esc(c.name)}</option>`).join('')}</datalist>`;

  const drawPicked = () => {
    $('#picked', el).innerHTML = st.coins.map((s, i) => `<span class="chip" style="border-right:4px solid var(${COLORS[i]});background:rgba(255,255,255,0.06);padding:6px 12px;border-radius:10px;display:inline-flex;align-items:center;gap:8px;color:#fff">${esc(s)} <button class="star" data-rm="${esc(s)}" aria-label="حذف ${esc(s)}" style="background:transparent;border:0;color:rgba(255,255,255,0.6);cursor:pointer;padding:0;display:flex">${icon('close', 13)}</button></span>`).join('')
      + (st.coins.length < 6 ? `<input class="inp" id="add" list="coinList" placeholder="+ افزودن ارز" style="width:130px;height:36px;padding:6px 12px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff">` : '');
    $$('[data-rm]', el).forEach((b) => b.addEventListener('click', () => { st.coins = st.coins.filter((c) => c !== b.dataset.rm); drawPicked(); load(); drawSelfPick(); loadSelf(); }));
    $('#add', el)?.addEventListener('change', (e) => {
      const v = e.target.value.trim().toUpperCase();
      if (v && !st.coins.includes(v) && all.some((c) => c.symbol === v)) { st.coins.push(v); drawPicked(); load(); drawSelfPick(); }
      else e.target.value = '';
    });
  };

  const load = async () => {
    if (!st.coins.length) { $('#chartArea', el).innerHTML = '<div class="empty" style="text-align:center;padding:30px;color:rgba(255,255,255,0.5)">برای مقایسه، یک رمزارز اضافه کنید.</div>'; return; }
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
    $('#stats', el).innerHTML = `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">ارز</th><th>بازدهی</th><th>نوسان (سالانه)</th><th>بیشترین افت</th><th class="hide-m hide-l">بهترین / بدترین</th><th>بازدهی ÷ ریسک</th></tr></thead><tbody>
      ${stats.sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity)).map((s) => `<tr data-sym="${esc(s.sym)}" style="cursor:pointer"><td class="l"><div class="coin-cell" style="display:flex;align-items:center;gap:8px">${coinLogo(s.coin, 22)}<b>${esc(s.sym)}</b></div></td>
        ${s.thin
          ? `<td colspan="5" class="muted fine">تاریخچه قیمت کافی نیست</td>`
          : `<td class="${s.total >= 0 ? 'up' : 'down'}"><b>${pct(s.total)}</b></td><td>${s.vol.toFixed(0)}%</td><td class="down">${pct(-s.dd, 1)}</td>
        <td class="hide-m hide-l"><span class="up">${pct(s.best, 1)}</span> / <span class="down">${pct(s.worst, 1)}</span></td><td>${s.ratio.toFixed(2)}</td>`}</tr>`).join('')}
    </tbody></table></div><p class="fine mt" style="color:rgba(255,255,255,0.5);margin:12px 0 0;font-size:0.85rem;line-height:1.6">${stats.filter((x) => !x.thin).length ? `بهترین عملکرد در بازه ${st.period.toUpperCase()} گذشته: <b>${esc(stats.find((x) => !x.thin).sym)}</b> — عملکرد گذشته تضمینی برای آینده نیست[cite: 15].` : ''}</p>`;
    $$('#stats tr[data-sym]', el).forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/coin/${tr.dataset.sym}`; }));

    // correlation matrix
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
      return `<td style="background:${bg};text-align:center;font-weight:600;color:#fff">${v.toFixed(2)}</td>`;
    };
    $('#corr', el).innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${series.map((s) => `<th style="text-align:center">${esc(s.sym)}</th>`).join('')}</tr></thead><tbody>
      ${series.map((s, i) => `<tr style="cursor:default"><td class="l"><b>${esc(s.sym)}</b></td>${series.map((_, j) => (i === j ? '<td style="text-align:center" class="muted">1.00</td>' : cell(corr(i, j)))).join('')}</tr>`).join('')}
    </tbody></table></div><p class="fine mt" style="color:rgba(255,255,255,0.5);margin:12px 0 0;font-size:0.85rem">هم‌بستگی بالا به معنای عدم تنوع‌بخشی با نگهداری هم‌زمان آن‌هاست[cite: 15].</p>`;
  };

  const CANDLE_WORD = { '1h': 'ساعته', '4h': 'چهار ساعته', '1d': 'روزانه' };

  const drawSelfPick = () => {
    const host = $('#selfPick', el);
    if (!host) return;
    if (!st.coins.length) { host.innerHTML = '<span class="fine muted">برای مقایسه تاریخچه، یک ارز از بالا اضافه کنید.</span>'; return; }
    if (!st.coins.includes(st.selfSym)) st.selfSym = st.coins[0];
    host.innerHTML = st.coins.map((s) => `<button data-self="${esc(s)}" class="${s === st.selfSym ? 'on' : ''}" style="padding:6px 14px;border-radius:9px;border:0;background:${s === st.selfSym ? 'rgba(255,255,255,0.15)' : 'transparent'};color:${s === st.selfSym ? '#fff' : 'rgba(255,255,255,0.6)'};cursor:pointer;font-weight:500">${esc(s)}</button>`).join('');
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
      body.innerHTML = `<div class="empty" style="text-align:center;padding:20px;color:rgba(255,255,255,0.5)"><p>${esc(match.reason)}</p></div>`;
      return;
    }

    const chip = score?.ok && !score.beatsBaseline ? 'بدون برتری آماری مشخص'
      : match.direction === 'up' ? 'تمایل تاریخی به صعود'
      : match.direction === 'down' ? 'تمایل تاریخی به نزول' : 'نتایج تاریخی دوگانه';

    body.innerHTML = `
      <div class="row spread" style="gap:10px;flex-wrap:wrap;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span class="chip ${v.tone === 'warn' ? 'warn' : v.tone}" style="padding:4px 10px;border-radius:8px;font-size:0.85rem"><b>${esc(chip)}</b></span>
        <span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.85rem">${match.matches.length} الگوی منطبق · افق ${match.horizon} کندل بعدی[cite: 15]</span>
      </div>
      <p style="color:rgba(255,255,255,0.85);line-height:1.6;margin:0 0 16px 0">${esc(v.headline)}</p>
      <div id="selfChart" class="mt" style="margin-top:16px"></div>
      <p class="fine" style="margin:12px 0;color:rgba(255,255,255,0.5);font-size:0.85rem">خطوط کم‌رنگ بازه‌های تاریخی مشابه را نشان می‌دهند[cite: 15]. سمت راست خط‌چین، رویدادهای واقعی پس از آن الگو است[cite: 15].</p>
      ${v.lines.map((l) => `<p class="fine" style="margin:6px 0;color:rgba(255,255,255,0.6);font-size:0.85rem">${esc(l)}</p>`).join('')}
      <div class="tbl-wrap mt" style="margin-top:16px"><table class="tbl fit"><thead><tr>
        <th class="l">زمان پایان الگوی مشابه</th><th>شباهت</th><th>تغییر در ${match.horizon} کندل بعدی</th><th class="hide-m">سقف</th><th class="hide-m">کف</th>
      </tr></thead><tbody>
        ${match.matches.map((m) => `<tr style="cursor:default"><td class="l wrap">${esc(dateTime(m.endTime, iv !== '1d'))}</td>
          <td>${(m.similarity * 100).toFixed(0)}%</td>
          <td class="${m.futureReturnPct >= 0 ? 'up' : 'down'}"><b>${pct(m.futureReturnPct)}</b></td>
          <td class="hide-m up">${pct(m.maxUpPct)}</td><td class="hide-m down">${pct(m.maxDownPct)}</td></tr>`).join('')}
      </tbody></table></div>`;

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