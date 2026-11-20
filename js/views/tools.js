// ابزارها: مبدل ارز و رمزارز، شبیه‌ساز میانگین هزینه دلاری (DCA) بر اساس داده‌های تاریخی واقعی،
// و ماشین‌حساب اندازه پوزیشن. هیچ معامله‌ای در اینجا ثبت نمی‌شود.
import { CONFIG } from '../config.js';
import { markets, findCoin, getCandles, isStable } from '../api/market.js';
import { fx, rates } from '../api/fx.js';
import { LineChart } from '../charts/line.js';
import { $, $$, icon, skeleton, bindSeg } from '../ui.js';
import { esc, price, money, pct, amount, compact, dateTime } from '../format.js';
import { convert, dcaBacktest, positionSize } from '../lib/calc.js';

export const title = 'ابزارها';

const PERIODS = { '6m': 182, '1y': 365, '2y': 730, '3y': 1095 };
const EVERY = { 7: 'هفتگی', 14: 'هر دو هفته', 30: 'ماهانه' };
const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : NaN; };
const disp = (v) => (Number.isFinite(v) ? `${fx.symbol}${price(v)}` : '—');
const cash = (v) => (!Number.isFinite(v) ? '—' : Math.abs(v) >= 1 ? `${fx.symbol}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : disp(v));
const qty = (n) => (Math.abs(n) >= 1 ? amount(n) : price(n));

export async function render(el, [section]) {
  const st = { chart: null, seq: 0, disposed: false, rate: fx.rate, dca: { every: 30, period: '1y' } };
  const all = await markets().catch(() => []);
  const fiat = await rates().catch(() => ({ USD: 1 }));
  const coins = all.slice(0, 150);
  const tradable = coins.filter((c) => !isStable(c.symbol));
  const coinOpts = (sel, list = tradable) => list.map((c) => `<option value="c:${esc(c.symbol)}" ${c.symbol === sel ? 'selected' : ''}>${esc(c.symbol)} · ${esc(c.name)}</option>`).join('');
  const fiatList = CONFIG.CURRENCIES.filter(([code]) => code === 'USD' || fiat[code]);
  const fiatOpts = (sel) => fiatList.map(([code, , name]) => `<option value="f:${code}" ${code === sel ? 'selected' : ''}>${code} · ${esc(name)}</option>`).join('');
  const pickOpts = (sel) => `<optgroup label="رمزارزها">${coinOpts(sel.startsWith('c:') ? sel.slice(2) : '', coins)}</optgroup><optgroup label="ارزهای فیات">${fiatOpts(sel.startsWith('f:') ? sel.slice(2) : '')}</optgroup>`;

  el.innerHTML = `
    <style>
      .ap-tools-wrap {
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
      .ap-tools-wrap .seg {
        background: rgba(255, 255, 255, 0.05);
        padding: 4px;
        border-radius: 12px;
        display: inline-flex;
        gap: 4px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .ap-tools-wrap .seg button {
        background: transparent;
        border: 0;
        color: rgba(255, 255, 255, 0.6);
        padding: 6px 14px;
        border-radius: 9px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      }
      .ap-tools-wrap .seg button.on {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      }
      .ap-tools-wrap .inp, .ap-tools-wrap select {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 12px;
        color: #fff;
        padding: 10px 14px;
        outline: none;
        transition: all 0.2s;
        width: 100%;
      }
      .ap-tools-wrap .inp:focus, .ap-tools-wrap select:focus {
        border-color: rgba(94, 92, 230, 0.6);
        box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.25);
      }
    </style>

    <div class="ap-tools-wrap" dir="rtl">
      <div class="ap-hero-card">
        <h1 style="font-size:2.2rem;font-weight:700;letter-spacing:-0.02em;color:#fff;margin:0 0 8px 0">ابزارها و ماشین‌حساب‌ها</h1>
        <p style="color:rgba(255,255,255,0.7);font-size:1.05rem;line-height:1.6;margin:0;max-width:900px">تبدیل ارزها، بررسی نتیجه خرید منظم (DCA) بر اساس داده‌های تاریخی واقعی، و محاسبه حجم پوزیشن بر اساس ریسک و حد ضرر. این ابزارها صرفاً ماشین‌حساب هستند.</p>
      </div>

      <div class="ap-card" id="convert">
        <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0;font-size:1.15rem;color:#fff">${icon('compare', 16)} مبدل ارز</h3><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.8rem">قیمت‌های زنده بازار</span></div>
        <div class="row" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <label class="fld" style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">مقدار</span><input class="inp" id="cvAmt" type="number" step="any" min="0" value="1" inputmode="decimal"></label>
          <label class="fld" style="flex:2;min-width:180px;display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">از</span><select class="inp" id="cvFrom">${pickOpts('c:BTC')}</select></label>
          <button class="btn" id="cvSwap" type="button" aria-label="جابجایی مبدأ و مقصد" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;width:40px;height:40px;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.1rem">⇄</button>
          <label class="fld" style="flex:2;min-width:180px;display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">به</span><select class="inp" id="cvTo">${pickOpts(`f:${fx.code}`)}</select></label>
        </div>
        <div class="mt" aria-live="polite" style="margin-top:16px"><div class="stat"><span class="v" id="cvOut" style="font-size:1.3rem;font-weight:700;color:#fff;display:block;margin-bottom:4px">—</span><span class="s fine" id="cvRate" style="color:rgba(255,255,255,0.5);font-size:0.85rem"></span></div></div>
      </div>

      <div class="ap-card mt" id="dca" style="margin-top:24px">
        <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0;font-size:1.15rem;color:#fff">${icon('history', 16)} شبیه‌ساز خرید منظم (DCA)</h3><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.8rem">بر اساس قیمت‌های بسته شدن روزانه</span></div>
        <div class="row" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <label class="fld" style="flex:2;min-width:180px;display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">رمزارز</span><select class="inp" id="dcaCoin">${coinOpts('BTC')}</select></label>
          <label class="fld" style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">مبلغ هر خرید (<span class="curCode">${esc(fx.code)}</span>)</span><input class="inp" id="dcaAmt" type="number" step="any" min="0" value="${Math.round(100 * fx.rate)}" inputmode="decimal"></label>
          <label class="fld" style="flex:1;min-width:100px;display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">کارمزد ٪</span><input class="inp" id="dcaFee" type="number" step="any" min="0" max="5" value="0.1" inputmode="decimal"></label>
        </div>
        <div class="row mt" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px">
          <div class="seg" id="dcaEvery">${Object.entries(EVERY).map(([d, l]) => `<button type="button" data-v="${d}" class="${+d === st.dca.every ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="seg" id="dcaPeriod">${Object.keys(PERIODS).map((p) => `<button type="button" data-v="${p}" class="${p === st.dca.period ? 'on' : ''}">${p.toUpperCase()}</button>`).join('')}</div>
        </div>
        <div class="grid g4 mt" id="dcaStats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:16px">${skeleton(1, 40)}</div>
        <div id="dcaChart" class="mt" style="margin-top:16px"></div>
        <p class="fine mt" id="dcaNote" style="color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.6;margin-top:16px"></p>
      </div>

      <div class="ap-card mt" id="risk" style="margin-top:24px">
        <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0;font-size:1.15rem;color:#fff">${icon('bolt', 16)} محاسبه حجم پوزیشن بر اساس حد ضرر</h3><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.8rem">مدیریت ریسک معامله</span></div>
        <div class="grid g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">رمزارز (پر کردن خودکار قیمت)</span><select class="inp" id="rkCoin"><option value="">سفارشی</option>${coinOpts('BTC')}</select></label>
          <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">موجودی حساب (<span class="curCode">${esc(fx.code)}</span>)</span><input class="inp" id="rkBal" type="number" step="any" min="0" value="${Math.round(1000 * fx.rate)}" inputmode="decimal"></label>
          <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">درصد ریسک در هر معامله ٪</span><input class="inp" id="rkPct" type="number" step="any" min="0" max="100" value="1" inputmode="decimal"></label>
          <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">قیمت ورود (<span class="curCode">${esc(fx.code)}</span>)</span><input class="inp" id="rkEntry" type="number" step="any" min="0" inputmode="decimal"></label>
          <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">حد ضرر (<span class="curCode">${esc(fx.code)}</span>)</span><input class="inp" id="rkStop" type="number" step="any" min="0" inputmode="decimal"></label>
          <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">حد سود، اختیاری (<span class="curCode">${esc(fx.code)}</span>)</span><input class="inp" id="rkTarget" type="number" step="any" min="0" inputmode="decimal"></label>
        </div>
        <div class="mt" id="rkOut" aria-live="polite" style="margin-top:16px"></div>
        <p class="fine mt" style="color:rgba(255,255,255,0.4);font-size:0.8rem;line-height:1.6;margin-top:16px">این ابزار صرفاً یک ماشین‌حساب است و توصیه مالی محسوب نمی‌شود.</p>
      </div>
    </div>`;

  const usdOf = (v) => {
    if (v.startsWith('f:')) { const code = v.slice(2); return code === 'USD' ? 1 : (fiat[code] ? 1 / fiat[code] : null); }
    return coins.find((c) => c.symbol === v.slice(2))?.price ?? null;
  };
  const label = (v) => v.slice(2);
  const fmtIn = (v, n) => (v.startsWith('f:') ? `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${label(v)}` : `${qty(n)} ${label(v)}`);
  const drawConvert = () => {
    const a = num($('#cvAmt', el).value); const f = $('#cvFrom', el).value; const t = $('#cvTo', el).value;
    const out = convert(a, usdOf(f), usdOf(t));
    $('#cvOut', el).textContent = out === null ? '—' : `${fmtIn(f, a)} = ${fmtIn(t, out)}`;
    const one = convert(1, usdOf(f), usdOf(t));
    $('#cvRate', el).textContent = one === null ? 'قیمت در دسترس نیست.' : `۱ ${label(f)} = ${fmtIn(t, one)}`;
  };
  $('#cvAmt', el).addEventListener('input', drawConvert);
  $('#cvFrom', el).addEventListener('change', drawConvert);
  $('#cvTo', el).addEventListener('change', drawConvert);
  $('#cvSwap', el).addEventListener('click', () => {
    const f = $('#cvFrom', el); const t = $('#cvTo', el); const a = f.value;
    f.value = t.value; t.value = a; drawConvert();
  });
  drawConvert();

  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const runDca = async () => {
    const seq = ++st.seq;
    const sym = $('#dcaCoin', el).value.slice(2);
    const amtUsd = num($('#dcaAmt', el).value) / (fx.rate || 1);
    const fee = num($('#dcaFee', el).value);
    const days = PERIODS[st.dca.period];
    $('#dcaStats', el).innerHTML = skeleton(1, 40);
    let res; let source = '';
    try {
      const coin = await findCoin(sym);
      if (!coin) throw new Error('رمزارز پیدا نشد.');
      const got = await getCandles(coin, '1d', days + 1);
      source = got.source;
      res = dcaBacktest(got.candles.slice(-(days + 1)), { amount: amtUsd, everyDays: st.dca.every, feePct: Number.isFinite(fee) ? fee : 0 });
    } catch (e) { res = { error: e.message || 'تاریخچه قیمت در دسترس نیست.' }; }
    if (st.disposed || seq !== st.seq) return;
    if (res.error) {
      $('#dcaStats', el).innerHTML = `<div class="empty" style="grid-column:1/-1"><p>${esc(res.error)}</p></div>`;
      st.chart?.destroy(); st.chart = null; $('#dcaChart', el).innerHTML = ''; $('#dcaNote', el).textContent = '';
      return;
    }
    const beat = res.value >= res.lump.value;
    $('#dcaStats', el).innerHTML = `
      <div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.8rem">مجموع سرمایه</span><span class="v" style="font-size:1.2rem;font-weight:700;color:#fff;display:block;margin:4px 0">${money(res.invested)}</span><span class="s fine" style="color:rgba(255,255,255,0.4);font-size:0.75rem">${res.buys} نوبت خرید</span></div>
      <div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.8rem">ارزش فعلی</span><span class="v" style="font-size:1.2rem;font-weight:700;color:#fff;display:block;margin:4px 0">${money(res.value)}</span><span class="s fine" style="color:rgba(255,255,255,0.4);font-size:0.75rem">${amount(res.units)} ${esc(sym)}</span></div>
      <div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.8rem">سود / زیان</span><span class="v ${res.pnl >= 0 ? 'up' : 'down'}" style="font-size:1.2rem;font-weight:700;display:block;margin:4px 0">${res.pnl >= 0 ? '+' : '−'}${money(Math.abs(res.pnl))}</span><span class="s ${res.pnl >= 0 ? 'up' : 'down'}" style="font-size:0.75rem">${pct(res.pnlPct)}</span></div>
      <div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.8rem">میانگین خرید</span><span class="v" style="font-size:1.2rem;font-weight:700;color:#fff;display:block;margin:4px 0">${money(res.avgCost)}</span><span class="s fine" style="color:rgba(255,255,255,0.4);font-size:0.75rem">اکنون ${money(res.lastPrice)}</span></div>`;
    const first = res.rows[0]?.t;
    $('#dcaNote', el).innerHTML = `خرید ${EVERY[st.dca.every]} به مبلغ ${money(amtUsd)} از ${esc(dateTime(first, false))}. سرمایه‌گذاری یکجا در روز اول اکنون <b>${money(res.lump.value)}</b> ارزش داشت؛ بنابراین خرید منظم عملکرد ${beat ? '<b class="up">بهتری</b>' : '<b class="down">ضعیف‌تری</b>'} داشته است. نتایج گذشته تضمینی برای آینده نیست.`;
    if (!st.chart) {
      $('#dcaChart', el).innerHTML = '';
      st.chart = new LineChart($('#dcaChart', el), { height: 260, yFormat: (v) => compact(v), xFormat: (x) => new Date(x).toLocaleDateString('fa-IR', { month: 'short', year: '2-digit' }), tooltipX: (x) => dateTime(x, false) });
    }
    st.chart.set([
      { name: 'ارزش فعلی', color: cssVar('--series-1'), width: 2, data: res.rows.map((r) => ({ x: r.t, y: r.value })) },
      { name: 'سرمایه واردشده', color: cssVar('--series-3'), width: 2, data: res.rows.map((r) => ({ x: r.t, y: r.invested })) },
    ]);
  };
  let dcaTimer = 0;
  const queueDca = () => { clearTimeout(dcaTimer); dcaTimer = setTimeout(runDca, 350); };
  $('#dcaCoin', el).addEventListener('change', runDca);
  $('#dcaAmt', el).addEventListener('input', queueDca);
  $('#dcaFee', el).addEventListener('input', queueDca);
  bindSeg($('#dcaEvery', el), (v) => { st.dca.every = +v; runDca(); });
  bindSeg($('#dcaPeriod', el), (v) => { st.dca.period = v; runDca(); });
  runDca();

  const fillEntry = () => {
    const sym = $('#rkCoin', el).value.slice(2);
    const c = coins.find((x) => x.symbol === sym);
    if (!c?.price) return;
    const e = c.price * fx.rate;
    const round = (v) => +v.toPrecision(6);
    $('#rkEntry', el).value = round(e);
    $('#rkStop', el).value = round(e * 0.97);
    $('#rkTarget', el).value = round(e * 1.06);
  };
  const drawRisk = () => {
    const r = positionSize({
      balance: num($('#rkBal', el).value), riskPct: num($('#rkPct', el).value),
      entry: num($('#rkEntry', el).value), stop: num($('#rkStop', el).value),
      target: num($('#rkTarget', el).value), feePct: 0,
    });
    const out = $('#rkOut', el);
    if (r.error) { out.innerHTML = `<p class="fine" style="color:rgba(255,255,255,0.5)">${esc(r.error)}</p>`; return; }
    const sym = $('#rkCoin', el).value.slice(2) || 'واحد';
    out.innerHTML = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;background:rgba(255,255,255,0.02);padding:16px;border-radius:14px;border:1px solid rgba(255,255,255,0.06)">
      <div><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.8rem">جهت معامله</span><div style="font-weight:600;margin-top:4px" class="${r.side === 'long' ? 'up' : 'down'}">${r.side === 'long' ? 'لانگ (خرید)' : 'شورت (فروش)'}</div></div>
      <div><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.8rem">اندازه پوزیشن</span><div style="font-weight:600;color:#fff;margin-top:4px">${qty(r.units)} ${esc(sym)} · ${cash(r.notional)}</div></div>
      <div><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.8rem">میزان ضرر در حد ضرر</span><div style="font-weight:600;margin-top:4px" class="down">−${cash(r.riskAmount)}</div></div>
      <div><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.8rem">فاصله تا حد ضرر</span><div style="font-weight:600;color:#fff;margin-top:4px">${pct(r.stopPct, 2, false)}</div></div>
    </div>`;
  };
  $('#rkCoin', el).addEventListener('change', () => { fillEntry(); drawRisk(); });
  $$('#risk input', el).forEach((i) => i.addEventListener('input', drawRisk));
  fillEntry(); drawRisk();

  const onCurrency = () => {
    const k = fx.rate / (st.rate || 1); st.rate = fx.rate;
    for (const id of ['#dcaAmt', '#rkBal', '#rkEntry', '#rkStop', '#rkTarget']) {
      const i = $(id, el); const v = num(i.value);
      if (Number.isFinite(v)) i.value = +(v * k).toPrecision(6);
    }
    $$('.curCode', el).forEach((s) => { s.textContent = fx.code; });
    drawConvert(); drawRisk(); runDca();
  };
  window.addEventListener('cv:currency', onCurrency);

  if (section && $(`#${CSS.escape(section)}`, el)) setTimeout(() => $(`#${CSS.escape(section)}`, el)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

  return () => { st.disposed = true; clearTimeout(dcaTimer); st.chart?.destroy(); window.removeEventListener('cv:currency', onCurrency); };
}