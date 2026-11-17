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
// مبالغ پولی (نه قیمت‌ها) پس از رسیدن به عدد ۱، با دو رقم اعشار خواناتر هستند.
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
    <div class="page-head"><div><h1>ابزارها</h1><p>تبدیل رمزارزها و ارزهای فیات به یکدیگر، بررسی نتیجه خرید منظم در گذشته، و محاسبه حجم معامله بر اساس حد ضرر. این ابزارها فقط ماشین‌حساب هستند و هیچ معامله‌ای ثبت نمی‌کنند.</p></div></div>

    <div class="card" id="convert">
      <div class="card-h"><h3>${icon('compare', 16)} مبدل ارز</h3><span class="fine">قیمت‌های زنده · نرخ ارزهای فیات هر ۶ ساعت به‌روز می‌شود</span></div>
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <label class="fld" style="flex:1;min-width:120px">مقدار<input class="inp" id="cvAmt" type="number" step="any" min="0" value="1" inputmode="decimal"></label>
        <label class="fld" style="flex:2;min-width:160px">از<select class="inp" id="cvFrom">${pickOpts('c:BTC')}</select></label>
        <button class="btn" id="cvSwap" type="button" aria-label="جابجایی مبدأ و مقصد">⇄</button>
        <label class="fld" style="flex:2;min-width:160px">به<select class="inp" id="cvTo">${pickOpts(`f:${fx.code}`)}</select></label>
      </div>
      <div class="mt" aria-live="polite"><div class="stat"><span class="v" id="cvOut">—</span><span class="s fine" id="cvRate"></span></div></div>
    </div>

    <div class="card mt" id="dca">
      <div class="card-h"><h3>${icon('history', 16)} اگر به صورت منظم خرید می‌کردم چه می‌شد؟</h3><span class="fine">میانگین هزینه دلاری (DCA) بر اساس قیمت‌های بسته شدن روزانه واقعی</span></div>
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <label class="fld" style="flex:2;min-width:150px">رمزارز<select class="inp" id="dcaCoin">${coinOpts('BTC')}</select></label>
        <label class="fld" style="flex:1;min-width:120px"><span>مبلغ هر خرید (<span class="curCode">${esc(fx.code)}</span>)</span><input class="inp" id="dcaAmt" type="number" step="any" min="0" value="${Math.round(100 * fx.rate)}" inputmode="decimal"></label>
        <label class="fld" style="flex:1;min-width:90px">کارمزد ٪<input class="inp" id="dcaFee" type="number" step="any" min="0" max="5" value="0.1" inputmode="decimal"></label>
      </div>
      <div class="row mt" style="gap:10px;flex-wrap:wrap">
        <div class="seg" id="dcaEvery">${Object.entries(EVERY).map(([d, l]) => `<button type="button" data-v="${d}" class="${+d === st.dca.every ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="seg" id="dcaPeriod">${Object.keys(PERIODS).map((p) => `<button type="button" data-v="${p}" class="${p === st.dca.period ? 'on' : ''}">${p.toUpperCase()}</button>`).join('')}</div>
      </div>
      <div class="grid g4 mt" id="dcaStats">${skeleton(1, 40)}</div>
      <div id="dcaChart" class="mt"></div>
      <p class="fine mt" id="dcaNote"></p>
    </div>

    <div class="card mt" id="risk">
      <div class="card-h"><h3>${icon('bolt', 16)} محاسبه حجم پوزیشن بر اساس حد ضرر</h3><span class="fine">چه مقدار خرید کنید تا در صورت فعال شدن حد ضرر، تنها بخش مشخصی از سرمایه شما از دست برود</span></div>
      <div class="grid g3" style="gap:10px">
        <label class="fld">رمزارز (قیمت ورود را پر می‌کند)<select class="inp" id="rkCoin"><option value="">سفارشی</option>${coinOpts('BTC')}</select></label>
        <label class="fld"><span>موجودی حساب (<span class="curCode">${esc(fx.code)}</span>)</span><input class="inp" id="rkBal" type="number" step="any" min="0" value="${Math.round(1000 * fx.rate)}" inputmode="decimal"></label>
        <label class="fld">درصد ریسک در هر معامله ٪<input class="inp" id="rkPct" type="number" step="any" min="0" max="100" value="1" inputmode="decimal"></label>
        <label class="fld"><span>قیمت ورود (<span class="curCode">${esc(fx.code)}</span>)</span><input class="inp" id="rkEntry" type="number" step="any" min="0" inputmode="decimal"></label>
        <label class="fld"><span>حد ضرر (<span class="curCode">${esc(fx.code)}</span>)</span><input class="inp" id="rkStop" type="number" step="any" min="0" inputmode="decimal"></label>
        <label class="fld"><span>حد سود، اختیاری (<span class="curCode">${esc(fx.code)}</span>)</span><input class="inp" id="rkTarget" type="number" step="any" min="0" inputmode="decimal"></label>
        <label class="fld">کارمزد هر طرف معامله ٪<input class="inp" id="rkFee" type="number" step="any" min="0" value="0.1" inputmode="decimal"></label>
      </div>
      <div class="mt" id="rkOut" aria-live="polite"></div>
      <p class="fine mt">در بازارهای پرشتاب ممکن است سفارش حد ضرر با قیمتی بدتر از قیمت تعیین‌شده پر شود (لغزش قیمت یا Slippage)، بنابراین ضرر واقعی می‌تواند بیشتر باشد. این ابزار فقط یک ماشین‌حساب است و توصیه مالی محسوب نمی‌شود.</p>
    </div>`;

  // ---------------------------------------------------------------- مبدل ارز
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
    $('#cvRate', el).textContent = one === null ? 'قیمت برای این جفت‌ارز در حال حاضر در دسترس نیست.' : `۱ ${label(f)} = ${fmtIn(t, one)}`;
  };
  $('#cvAmt', el).addEventListener('input', drawConvert);
  $('#cvFrom', el).addEventListener('change', drawConvert);
  $('#cvTo', el).addEventListener('change', drawConvert);
  $('#cvSwap', el).addEventListener('click', () => {
    const f = $('#cvFrom', el); const t = $('#cvTo', el); const a = f.value;
    f.value = t.value; t.value = a; drawConvert();
  });
  drawConvert();

  // ---------------------------------------------------------------- خرید پله‌ای (DCA)
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
    } catch (e) { res = { error: e.message || 'تاریخچه قیمت در حال حاضر در دسترس نیست.' }; }
    if (st.disposed || seq !== st.seq) return;
    if (res.error) {
      $('#dcaStats', el).innerHTML = `<div class="empty" style="grid-column:1/-1"><p>${esc(res.error)}</p></div>`;
      st.chart?.destroy(); st.chart = null; $('#dcaChart', el).innerHTML = ''; $('#dcaNote', el).textContent = '';
      return;
    }
    const beat = res.value >= res.lump.value;
    $('#dcaStats', el).innerHTML = `
      <div class="stat"><span class="k">مجموع سرمایه‌گذاری</span><span class="v">${money(res.invested)}</span><span class="s fine">${res.buys} نوبت خرید</span></div>
      <div class="stat"><span class="k">ارزش فعلی</span><span class="v">${money(res.value)}</span><span class="s fine">${amount(res.units)} ${esc(sym)}</span></div>
      <div class="stat"><span class="k">سود / زیان</span><span class="v ${res.pnl >= 0 ? 'up' : 'down'}">${res.pnl >= 0 ? '+' : '−'}${money(Math.abs(res.pnl))}</span><span class="s ${res.pnl >= 0 ? 'up' : 'down'}">${pct(res.pnlPct)}</span></div>
      <div class="stat"><span class="k">میانگین قیمت خرید</span><span class="v">${money(res.avgCost)}</span><span class="s fine">قیمت فعلی ${money(res.lastPrice)}</span></div>`;
    const first = res.rows[0]?.t;
    $('#dcaNote', el).innerHTML = `خرید به صورت ${EVERY[st.dca.every]} به مبلغ ${money(amtUsd)} از تاریخ ${esc(dateTime(first, false))}. اگر همین کل مبلغ را به صورت یکجا در روز اول سرمایه‌گذاری می‌کردید، اکنون <b>${money(res.lump.value)}</b> (${pct(res.lump.pnlPct)}) ارزش داشت؛ بنابراین خرید منظم در این بازه عملکرد ${beat ? '<b class="up">بهتری</b>' : '<b class="down">ضعیف‌تری</b>'} داشته است. نتایج گذشته تضمینی برای آینده نیستند.${fx.code !== 'USD' ? ` تبدیل‌شده از دلار با نرخ امروز ${esc(fx.code)}.` : ''}${source === 'demo' ? ' <span class="chip warn">داده‌های آزمایشی: تاریخچه زنده در دسترس نیست</span>' : ''}`;
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

  // ---------------------------------------------------------------- اندازه پوزیشن
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
      target: num($('#rkTarget', el).value), feePct: num($('#rkFee', el).value) || 0,
    });
    const out = $('#rkOut', el);
    if (r.error) { out.innerHTML = `<p class="fine">${esc(r.error)}</p>`; return; }
    const sym = $('#rkCoin', el).value.slice(2) || 'واحد';
    const lev = r.leverage > 1 ? `<span class="down">${r.leverage.toFixed(2)}×: بیشتر از موجودی حساب شماست، بنابراین نیاز به اهرم یا حد ضرر بازتر و حجم کمتر دارید</span>` : `${r.leverage.toFixed(2)}× (بدون نیاز به اهرم)`;
    out.innerHTML = `<dl class="kv">
      <dt>جهت معامله</dt><dd class="${r.side === 'long' ? 'up' : 'down'}">${r.side === 'long' ? 'لانگ (خرید)' : 'شورت (فروش)'}</dd>
      <dt>اندازه پوزیشن</dt><dd>${qty(r.units)} ${esc(sym)} · ${cash(r.notional)}</dd>
      <dt>ضرر در صورت برخورد به حد ضرر</dt><dd class="down">−${cash(r.riskAmount)}</dd>
      <dt>فاصله تا حد ضرر</dt><dd>${pct(r.stopPct, 2, false)}</dd>
      <dt>نسبت حجم به موجودی</dt><dd>${lev}</dd>
      ${r.targetError ? `<dt>حد سود</dt><dd class="down">${esc(r.targetError)}</dd>` : r.reward !== undefined ? `<dt>سود در نقطه هدف</dt><dd class="up">+${cash(r.reward)} (${pct(r.targetPct, 2, false)})</dd><dt>نسبت سود به ریسک</dt><dd>${r.rr.toFixed(2)} : 1${r.rr < 1.5 ? ' <span class="fine">(نسبت زیر ۱.۵ نیازمند نرخ برد بسیار بالاست)</span>' : ''}</dd>` : ''}
    </dl>`;
  };
  $('#rkCoin', el).addEventListener('change', () => { fillEntry(); drawRisk(); });
  $$('#risk input', el).forEach((i) => i.addEventListener('input', drawRisk));
  fillEntry(); drawRisk();

  // فیلدهای پولی به ارز نمایشی تایپ می‌شوند: هنگام تغییر ارز، مقیاس آن‌ها را تغییر دهید.
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