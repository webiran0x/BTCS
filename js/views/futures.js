// معاملات فیوچرز و مشتقات: نرخ تأمین مالی، سود باز (Open Interest)، پوزیشن‌های لانگ/شورت و لیکوییدیشن‌های زنده.
import { markets, isStable } from '../api/market.js';
import { futuresOverview, futuresSnapshot, liquidationStream, interpretFutures, annualiseFunding } from '../api/futures.js';
import { LineChart } from '../charts/line.js';
import { $, $$, skeleton, coinLogo, icon, errorBox } from '../ui.js';
import { esc, pct, money, compact, num, ago, dateTime } from '../format.js';

export const title = 'فیوچرز';

export async function render(el, [symParam]) {
  const st = { sym: (symParam || 'BTC').toUpperCase(), liqs: [], charts: [], stop: null, disposed: false, coinSeq: 0, liqTimer: null, poll: null, liqState: 'connecting' };
  const REFRESH_MS = 60e3;
  const MIN_LIQ_USD = 250;
  const tsLine = (at) => `<span class="fine" title="${esc(dateTime(at, true))}">خوانده شده در ${esc(ago(at))}</span>`;

  el.innerHTML = `
    <style>
      .ap-futures-wrap {
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
      .ap-bento-layout {
        display: grid;
        grid-template-columns: 2.2fr 1fr;
        gap: 24px;
      }
      @media(max-width: 1024px) {
        .ap-bento-layout { grid-template-columns: 1fr; }
      }
      .ap-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.075);
        border-radius: 22px;
        padding: 24px;
        backdrop-filter: blur(22px);
        -webkit-backdrop-filter: blur(22px);
        transition: border-color 0.25s ease, box-shadow 0.25s ease;
        margin-bottom: 20px;
      }
      .ap-card:hover {
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
      }
      .ap-futures-wrap table.tbl {
        width: 100%;
        border-collapse: collapse;
      }
      .ap-futures-wrap table.tbl th, .ap-futures-wrap table.tbl td {
        padding: 12px 16px;
        text-align: right;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 0.9rem;
      }
      .ap-futures-wrap table.tbl th {
        color: rgba(255, 255, 255, 0.5);
        font-weight: 500;
        font-size: 0.8rem;
      }
      .ap-futures-wrap table.tbl tr:hover td {
        background: rgba(255, 255, 255, 0.02);
        cursor: pointer;
      }
    </style>

    <div class="ap-futures-wrap" dir="rtl">
      <div class="ap-hero-card">
        <h1 style="font-size:2.2rem;font-weight:700;letter-spacing:-0.02em;color:#fff;margin:0 0 8px 0">فیوچرز و مشتقات</h1>
        <p style="color:rgba(255,255,255,0.7);font-size:1.05rem;line-height:1.6;margin:0;max-width:900px">داده‌های اهرمی از معاملات پرپچوئل تتر (USDT perpetual) — بایننس، Bybit یا OKX: هزینه‌ای که معامله‌گران برای نگهداری پوزیشن‌ها می‌پردازند، میزان شلوغی پوزیشن‌ها و لیکوییدیشن‌های زنده.</p>
      </div>

      <div class="ap-bento-layout">
        <div class="stack" style="display:flex;flex-direction:column;gap:20px">
          <div class="ap-card" id="coinCard" style="margin-bottom:0">${skeleton(5, 22)}</div>
          <div class="ap-card" id="tableCard" style="margin-bottom:0">${skeleton(8, 22)}</div>
        </div>
        <div class="ap-card" style="margin-bottom:0">
          <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0;font-size:1.15rem;color:#fff">لیکوییدیشن‌های زنده</h3><span class="live-pill" id="liqPill" style="padding:4px 10px;border-radius:8px;font-size:0.75rem;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6)"><i></i><span>در حال اتصال...</span></span></div>
          <div id="liqList"><p class="fine muted" style="color:rgba(255,255,255,0.5);font-size:0.85rem">در انتظار اولین لیکوییدیشن...</p></div>
          <p class="fine mt" style="margin-top:16px;color:rgba(255,255,255,0.4);font-size:0.8rem;line-height:1.6">هر سطر یک پوزیشن اهرمی واقعی است که اجباراً بسته شده است. سطرهای زیر ${money(MIN_LIQ_USD)} پنهان می‌شوند.</p>
        </div>
      </div>
    </div>`;

  async function drawTable() {
    let list = [];
    try {
      list = (await markets()).filter((c) => c.binance && !isStable(c.symbol)).slice(0, 24);
    } catch {
      if (!st.disposed) $('#tableCard', el).innerHTML = errorBox('لیست ارزها بارگذاری نشد.', drawTable);
      return;
    }
    const rows = await futuresOverview(list.map((c) => c.symbol));
    if (st.disposed) return;
    const byS = new Map(list.map((c) => [c.symbol, c]));
    if (!rows.length) { $('#tableCard', el).innerHTML = errorBox('داده‌های فیوچرز در دسترس نیستند.', drawTable); return; }
    const venue = rows.source || 'Binance';
    const intervals = [...new Set(rows.map((r) => r.fundingIntervalHours || 8))].sort((a, b) => a - b);
    $('#tableCard', el).innerHTML = `
      <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0;font-size:1.15rem;color:#fff">بازار پرپچوئل فیوچرز · ${esc(venue)}</h3>${tsLine(Date.now())}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">ارز</th><th>قیمت نشانگر</th><th>تأمین مالی</th><th>هر</th><th>سالانه</th><th>پایه</th><th>سود باز (OI)</th></tr></thead><tbody>
      ${rows.sort((a, b) => (b.openInterestUsd || 0) - (a.openInterestUsd || 0)).map((r) => {
        const f = r.fundingRate === null ? null : r.fundingRate * 100;
        const hrs = r.fundingIntervalHours || 8;
        const yr = annualiseFunding(f, hrs);
        return `<tr data-sym="${esc(r.symbol)}"><td class="l"><div class="coin-cell" style="display:flex;align-items:center;gap:8px">${coinLogo(byS.get(r.symbol) || { symbol: r.symbol }, 22)}<b>${esc(r.symbol)}</b></div></td>
          <td>${money(r.markPrice)}</td>
          <td class="${f > 0.01 ? 'up' : f < -0.01 ? 'down' : ''}">${f === null ? '—' : `${f > 0 ? '+' : ''}${f.toFixed(4)}%`}</td>
          <td class="fine" style="color:rgba(255,255,255,0.5)">${hrs} ساعت</td>
          <td class="fine" style="color:rgba(255,255,255,0.5)">${yr === null ? '—' : `${yr > 0 ? '+' : ''}${yr.toFixed(1)}%`}</td>
          <td class="${r.basisPct > 0 ? 'up' : r.basisPct < 0 ? 'down' : ''}">${r.basisPct === null ? '—' : pct(r.basisPct, 3)}</td>
          <td>${compact(r.openInterestUsd)}</td></tr>`;
      }).join('')}
      </tbody></table></div>
      <p class="fine mt" style="margin-top:12px;color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.5">نرخ تأمین مالی مثبت یعنی لانگ‌ها به شورت‌ها پاداش می‌دهند. تسویه بسته به قرارداد هر ${intervals.join(' یا ')} ساعت انجام می‌شود.</p>`;
    $$('tr[data-sym]', el).forEach((tr) => tr.addEventListener('click', () => {
      st.sym = tr.dataset.sym;
      location.hash = `#/futures/${tr.dataset.sym}`;
    }));
  }

  async function drawCoin(quiet = false) {
    const card = $('#coinCard', el);
    const want = st.sym;
    const seq = ++st.coinSeq;
    if (!quiet) card.innerHTML = skeleton(5, 22);
    const f = await futuresSnapshot(want).catch(() => null);
    if (st.disposed || seq !== st.coinSeq || want !== st.sym) return;
    if (!f) {
      st.charts.forEach((c) => c.destroy());
      st.charts = [];
      card.innerHTML = errorBox(`اطلاعات فیوچرز برای ${st.sym} موجود نیست.`, () => drawCoin());
      return;
    }
    const iv = interpretFutures(f);
    const oiNow = f.openInterestUsd ?? f.oiHistory?.at(-1)?.usd ?? null;
    card.innerHTML = `
      <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0;font-size:1.15rem;color:#fff">${esc(f.pair)} · ${esc(f.source)}</h3><div class="row" style="display:flex;gap:8px;align-items:center">${tsLine(f.fetchedAt)}<a class="btn sm ghost" href="#/coin/${esc(st.sym)}" style="background:rgba(255,255,255,0.06);padding:6px 12px;border-radius:10px;color:#fff;text-decoration:none;font-size:0.8rem">تحلیل ${esc(st.sym)}</a></div></div>
      <div class="grid g4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
        <div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.8rem">قیمت نشانگر</span><span class="v" style="font-size:1.2rem;font-weight:700;color:#fff;display:block;margin:4px 0">${money(f.markPrice)}</span><span class="s fine" style="color:rgba(255,255,255,0.4);font-size:0.75rem">پایه ${f.basisPct === null ? '—' : pct(f.basisPct, 3)}</span></div>
        <div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.8rem">تأمین مالی</span><span class="v ${iv.fundingPct > 0.01 ? 'up' : iv.fundingPct < -0.01 ? 'down' : ''}" style="font-size:1.2rem;font-weight:700;display:block;margin:4px 0">${iv.fundingPct === null ? '—' : `${iv.fundingPct > 0 ? '+' : ''}${iv.fundingPct.toFixed(4)}%`}</span><span class="s fine" style="color:rgba(255,255,255,0.4);font-size:0.75rem">${iv.annualisedFundingPct === null ? '' : `${iv.annualisedFundingPct.toFixed(1)}% سالانه`}</span></div>
        <div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.8rem">سود باز (OI)</span><span class="v" style="font-size:1.2rem;font-weight:700;color:#fff;display:block;margin:4px 0">${compact(oiNow)}</span><span class="s fine ${iv.oiChange12hPct > 0 ? 'up' : iv.oiChange12hPct < 0 ? 'down' : ''}" style="font-size:0.75rem">${iv.oiChange12hPct === null ? '' : `${pct(iv.oiChange12hPct, 1)} در ۱۲ ساعت`}</span></div>
        <div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.8rem">حساب‌های لانگ</span><span class="v" style="font-size:1.2rem;font-weight:700;color:#fff;display:block;margin:4px 0">${iv.longAccountsPct === null ? '—' : `${iv.longAccountsPct.toFixed(0)}%`}</span><span class="s fine" style="color:rgba(255,255,255,0.4);font-size:0.75rem">${f.topTraders?.at(-1)?.longPositionPct != null ? `تریدرهای برتر ${f.topTraders.at(-1).longPositionPct.toFixed(0)}% لانگ` : ''}</span></div>
      </div>
      ${iv.notes.length ? `<ul class="reasons mt" style="margin:12px 0;padding-right:18px;color:rgba(255,255,255,0.8);font-size:0.85rem">${iv.notes.map((n) => `<li style="margin-bottom:4px">${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="grid g2 mt" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
        <div><h4 class="fine" style="color:rgba(255,255,255,0.6);margin-bottom:8px;font-size:0.9rem">سود باز (۷۲ ساعت)</h4>${f.oiHistory?.length ? '<div id="oiC"></div>' : `<p class="fine muted">تاریخچه در دسترس نیست.</p>`}</div>
        <div><h4 class="fine" style="color:rgba(255,255,255,0.6);margin-bottom:8px;font-size:0.9rem">تاریخچه تأمین مالی</h4><div id="fdC"></div></div>
      </div>`;

    st.charts.forEach((c) => c.destroy());
    st.charts = [];
    if (f.oiHistory?.length) {
      const c = new LineChart($('#oiC', el), { height: 190, yFormat: (v) => compact(v), legend: false, xFormat: (x) => new Date(x).toLocaleString('مه', { month: 'short', day: 'numeric' }), tooltipX: (x) => dateTime(x, true) });
      c.set([{ name: 'سود باز', color: 'var(--series-1)', data: f.oiHistory.map((r) => ({ x: r.t, y: r.usd })) }]);
      c.resize(); st.charts.push(c);
    }
    if (f.fundingHistory?.length) {
      const c = new LineChart($('#fdC', el), { height: 190, yFormat: (v) => `${(v * 100).toFixed(3)}%`, legend: false, zeroLine: 0, xFormat: (x) => new Date(x).toLocaleString('مه', { month: 'short', day: 'numeric' }), tooltipX: (x) => dateTime(x, true) });
      c.set([{ name: 'تأمین مالی', color: 'var(--series-4)', data: f.fundingHistory.map((r) => ({ x: r.t, y: r.rate })) }]);
      c.resize(); st.charts.push(c);
    }
  }

  drawTable();
  drawCoin();
  st.poll = setInterval(() => { if (!st.disposed && !document.hidden) { drawTable(); drawCoin(true); } }, REFRESH_MS);

  const setPill = (state) => {
    st.liqState = state;
    const pill = $('#liqPill', el);
    if (!pill) return;
    pill.classList.toggle('on', state === 'streaming' || state === 'live');
    pill.classList.toggle('warn', state === 'failed');
    pill.querySelector('span').textContent =
      state === 'streaming' ? `زنده · ${st.venue || 'Binance'}`
      : state === 'live' ? `متصل · ${st.venue || 'Binance'}`
      : state === 'switching' ? 'تغییر منبع...'
      : state === 'open' ? 'متصل'
      : state === 'failed' ? 'خطای فید' : 'اتصال...';
  };

  let pending = false;
  st.stop = liquidationStream((ev, status, venue) => {
    if (ev?.venue) st.venue = ev.venue;
    else if (venue) st.venue = venue;
    if (!ev) { if (st.liqState !== 'streaming' || status === 'failed' || status === 'switching') setPill(status); return; }
    if (ev.usd !== null && ev.usd < MIN_LIQ_USD) return;
    st.liqs.unshift(ev);
    st.liqs = st.liqs.slice(0, 25);
    if (pending) return;
    pending = true;
    st.liqTimer = setTimeout(() => {
      pending = false;
      if (st.disposed) return;
      setPill('streaming');
      $('#liqList', el).innerHTML = st.liqs.map((l) => `
        <div class="row spread" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center">
          <div><b style="color:#fff">${esc(l.symbol)}</b> <span class="chip ${l.side === 'long' ? 'down' : 'up'}" style="padding:2px 6px;border-radius:6px;font-size:0.75rem">${l.side === 'long' ? 'لانگ' : 'شورت'}</span></div>
          <div style="text-align:left"><b style="color:#fff">${l.usd === null ? `${num(l.contracts)}` : compact(l.usd)}</b><br><small class="fine" style="color:rgba(255,255,255,0.4);font-size:0.75rem">${money(l.price)}</small></div>
        </div>`).join('');
    }, 400);
  });

  return () => {
    st.disposed = true;
    clearInterval(st.poll);
    clearTimeout(st.liqTimer);
    st.stop?.();
    st.charts.forEach((c) => c.destroy());
  };
}