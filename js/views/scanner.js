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
    <style>
      .ap-scanner-wrap {
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
      .ap-scanner-wrap .seg {
        background: rgba(255, 255, 255, 0.05);
        padding: 4px;
        border-radius: 12px;
        display: inline-flex;
        gap: 4px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .ap-scanner-wrap .seg button {
        background: transparent;
        border: 0;
        color: rgba(255, 255, 255, 0.6);
        padding: 6px 14px;
        border-radius: 9px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
        font-size: 0.85rem;
      }
      .ap-scanner-wrap .seg button.on {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      }
      .ap-scanner-wrap table.tbl {
        width: 100%;
        border-collapse: collapse;
      }
      .ap-scanner-wrap table.tbl th, .ap-scanner-wrap table.tbl td {
        padding: 12px 16px;
        text-align: right;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 0.9rem;
      }
      .ap-scanner-wrap table.tbl th {
        color: rgba(255, 255, 255, 0.5);
        font-weight: 500;
        font-size: 0.8rem;
        cursor: pointer;
      }
      .ap-scanner-wrap table.tbl th:hover {
        color: #fff;
      }
      .ap-scanner-wrap table.tbl tr:hover td {
        background: rgba(255, 255, 255, 0.02);
        cursor: pointer;
      }
      .ap-meter-bar {
        height: 6px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 3px;
        overflow: hidden;
        margin: 16px 0;
      }
      .ap-meter-bar i {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, #5e5ce6, #32d74b);
        transition: width 0.3s ease;
      }
    </style>

    <div class="ap-scanner-wrap" dir="rtl">
      <div class="ap-hero-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px">
        <div>
          <h1 style="font-size:2.2rem;font-weight:700;letter-spacing:-0.02em;color:#fff;margin:0 0 8px 0">اسکنر بازار</h1>
          <p style="color:rgba(255,255,255,0.7);font-size:1.05rem;line-height:1.6;margin:0;max-width:850px">ارزهای برتر را اسکن کرده و بر اساس میزان تمایل اندیکاتورها و نتایج پیش‌بینی رتبه‌بندی می‌کند.</p>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div class="seg" id="iv" dir="ltr">${['1m', '5m', '15m', '1h', '4h', '1d'].map((i) => `<button data-v="${i}" class="${i === st.interval ? 'on' : ''}">${i}</button>`).join('')}</div>
          <div class="seg" id="cnt"><button data-v="20">۲۰</button><button data-v="30" class="on">۳۰</button><button data-v="50">۵۰</button></div>
          <button class="btn" id="rescan" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:8px 16px;border-radius:12px;cursor:pointer;font-weight:500;display:flex;align-items:center;gap:6px">${icon('refresh', 16)} اسکن مجدد</button>
        </div>
      </div>

      <div class="ap-card">
        <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
          <div class="seg" id="flt">
            <button data-v="all" class="on">همه</button>
            <button data-v="buy">صعودی</button>
            <button data-v="sell">نزولی</button>
            <button data-v="aibuy">سیگنال هوش مصنوعی: خرید/نگهداری</button>
            <button data-v="aiup">صعود هوش مصنوعی</button>
            <button data-v="aidown">نزول هوش مصنوعی</button>
            <button data-v="oversold">اشباع فروش</button>
            <button data-v="overbought">اشباع خرید</button>
          </div>
          <span class="fine" id="prog" style="color:rgba(255,255,255,0.5);font-size:0.85rem"></span>
        </div>
        <div class="ap-meter-bar" id="meter"><i style="width:0%"></i></div>
        <div id="tbl">${skeleton(10, 26)}</div>
        <p class="fine mt" style="color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.6;margin-top:20px">امتیاز از ۱۰۰- تا ۱۰۰+، میزان توافق روند، مومنتوم و اندیکاتورها را می‌سنجد. پیش‌بینی هوش مصنوعی و بازه ۸۰ درصدی نوسانات بر اساس تست‌های تاریخی ارائه شده‌اند.</p>
      </div>
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
    if (!g) return `<span class="muted">—</span>`;
    const f = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}%`;
    return `<span title="بازه پیش‌بینی ۸۰٪">${f(g.lo)} تا ${f(g.hi)}</span>`;
  };

  const aiCell = (r) => {
    const a = r.ai;
    if (!a) return '<span class="muted">—</span>';
    const label = { buy: 'خرید', hold: 'نگهداری', sell: 'فروش', wait: 'انتظار' }[a.action];
    const tone = { buy: 'up', hold: 'up', sell: 'down', wait: '' }[a.action];
    return `<span class="chip ${tone}" style="padding:4px 10px;border-radius:8px;font-size:0.8rem">${label}</span>`;
  };

  const timingCell = (r) => {
    const t = r.tm;
    if (r.fc === undefined) return '';
    if (!t?.ok || !t.shaped) return `<span class="muted">—</span>`;
    const m = t.rising ? t.peak : t.trough;
    if (t.priceless) return `<span>${t.rising ? 'اوج' : 'کف'} در ${esc(horizonText(st.interval, m.bar))}</span>`;
    return `<span class="${t.rising ? 'up' : 'down'}">${t.rising ? '▲ اوج در' : '▼ کف در'} ${esc(horizonText(st.interval, m.bar))}</span>`;
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
    if (!rows.length) {
      $('#tbl', el).innerHTML = st.rows.length ? `<div class="empty" style="text-align:center;padding:30px;color:rgba(255,255,255,0.5)">هیچ ارزی با این فیلتر مطابقت ندارد.</div>` : skeleton(10, 26);
      return;
    }
    const th = (k, label, cls = '') => `<th${cls ? ` class="${cls}"` : ''} data-sort="${k}" aria-sort="${st.sort === k ? 'descending' : 'none'}">${label}${st.sort === k ? '\u00a0↓' : ''}</th>`;
    $('#tbl', el).innerHTML = `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">ارز</th><th class="hide-p">قیمت</th>${th('chg', '۲۴ ساعته', 'hide-p')}<th class="l">سیگنال</th>${th('aisig', 'سیگنال هوش مصنوعی')}${th('score', 'امتیاز')}${th('ai', 'صعود هوش مصنوعی', 'hide-p')}${th('move', 'بازه ۸۰٪', 'hide-p')}<th class="l hide-t">زمان‌بندی</th>${th('rsi', 'RSI', 'hide-t')}<th class="hide-l">روند</th></tr></thead><tbody>
      ${rows.map((r) => {
        const s = r.signal;
        const trend = s.indicators.ema200 ? (s.price > s.indicators.ema200 ? '<span class="up">بالای میانگین ۲۰۰</span>' : '<span class="down">پایین میانگین ۲۰۰</span>') : '—';
        const reason = (s.score >= 0 ? s.reasons.bullish[0] : s.reasons.bearish[0]) || '';
        const p = shown(r);
        const ai = !r.fc?.ok ? (r.fc === undefined ? '<span class="spinner" style="width:12px;height:12px"></span>' : '—')
          : reliable ? `<b class="${p >= 0.54 ? 'up' : p <= 0.46 ? 'down' : 'flat'}">${Math.round(p * 100)}%</b>`
          : `<span class="muted">—</span>`;
        return `<tr data-sym="${esc(r.coin.symbol)}"><td class="l"><div class="coin-cell" style="display:flex;align-items:center;gap:8px">${coinLogo(r.coin, 24)}<b>${esc(r.coin.symbol)}</b><small class="hide-l" style="color:rgba(255,255,255,0.4)">${esc(r.coin.name)}</small></div><small class="show-p-block">${money(s.price)}</small><small class="show-p-block">${changeHtml(r.coin.change24h)}</small></td>
          <td class="hide-p">${money(s.price)}</td><td class="hide-p">${changeHtml(r.coin.change24h)}</td>
          <td class="l"><span class="chip ${s.tone === 'flat' ? '' : s.tone}" style="padding:4px 10px;border-radius:8px;font-size:0.8rem"${reason ? ` title="${esc(reason)}"` : ''}>${s.text}</span></td>
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
      $('#prog', el).textContent = 'اطلاعات در دسترس نیست';
      $('#meter i', el).style.width = '0%';
      $('#tbl', el).innerHTML = `<div class="empty" style="text-align:center;padding:30px"><h3>داده‌ها در دسترس نیستند</h3><p>${esc(err?.message || 'لیست بازار بارگذاری نشد.')}</p></div>`;
      return;
    }
    if (!list.length) {
      $('#prog', el).textContent = 'ارزی یافت نشد';
      $('#meter i', el).style.width = '0%';
      $('#tbl', el).innerHTML = '<div class="empty" style="text-align:center;padding:30px">ارزی برای اسکن وجود ندارد.</div>';
      return;
    }
    const iv = st.interval;
    let done = 0;
    const setProg = () => {
      $('#prog', el).textContent = done < list.length ? `در حال اسکن ${done}/${list.length}…`
        : `تعداد ${st.rows.length} ارز اسکن شد`;
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