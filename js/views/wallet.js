import { markets, findCoin, getCandles, walletBalance, CHAINS, isStable, isTestedSource } from '../api/market.js';
import { generateSignal, adviseHolding } from '../lib/signals.js';
import { donut } from '../charts/small.js';
import { $, $$, coinLogo, icon, toast, skeleton, modal } from '../ui.js';
import { esc, safeUrl, usd, price, pct, amount, changeHtml, compact, money, tone } from '../format.js';
import { fx } from '../api/fx.js';
import { load, save } from '../store.js';
import { connectWallet, injectedWallet, walletLabel, onWalletChange } from '../api/connect.js';
import { venuesFor, tradable, TRADE_DISCLAIMER } from '../lib/trade.js';

// صفر نه سود است و نه زیان: یک پورتفولیوی خالی قبلاً به صورت "+$0.00" با رنگ سبز نمایش داده می‌شد.
const signedUsd = (v) => {
  const c = Math.round(v * 100) / 100;
  return `<span class="v ${tone(c)}">${c > 0 ? '+' : c < 0 ? '−' : ''}${usd(Math.abs(c))}</span>`;
};

export const title = 'کیف پول';
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const COLORS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-7', '--series-8', '--series-6'];

export async function render(el) {
  let disposed = false;
  const all = await markets().catch(() => []);
  el.innerHTML = `
    <div class="page-head"><div><h1>کیف پول</h1><p>پیگیری دارایی‌ها با سود و زیان زنده، پیشنهادهای نگهداری یا خروج هوش مصنوعی و رصد آدرس‌های عمومی کیف پول.</p></div></div>
    <div class="grid g4" id="sum"></div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1fr) 320px" id="wgrid">
      <div class="card">
        <div class="card-h"><h3>دارایی‌ها</h3><button class="btn sm primary" id="addBtn">${icon('plus', 14)} افزودن دارایی</button></div>
        <form id="addForm" class="row" hidden style="margin-bottom:12px;align-items:flex-end">
          <label class="fld">رمزارز<input class="inp" name="sym" list="wCoins" required placeholder="BTC" style="width:110px"></label>
          <label class="fld">مقدار<input class="inp" name="amt" type="number" step="any" min="0" required placeholder="0.5" style="width:120px"></label>
          <label class="fld"><span>میانگین قیمت خرید (<span id="buyCur">${esc(fx.code)}</span>)</span><input class="inp" name="buy" type="number" step="any" min="0" placeholder="اختیاری" style="width:150px"></label>
          <button class="btn primary">ذخیره</button>
        </form>
        <div id="holdings"></div>
      </div>
      <div class="card"><div class="card-h"><h3>تخصیص دارایی</h3></div><div id="alloc" style="display:grid;place-items:center"></div><div id="allocLegend" class="stack mt" style="gap:6px"></div></div>
    </div>
    <div class="card mt">
      <div class="card-h"><h3>کیف پول‌های فقط-خواندنی (Watch-only)</h3>
        <div class="row" style="gap:8px"><span class="fine">فقط آدرس‌های عمومی — استعلام موجودی بدون دسترسی</span>
        <button class="btn sm" id="connectBtn">${icon('wallet', 14)} اتصال کیف پول</button></div></div>
      <p class="fine" id="connectMsg" style="margin-bottom:8px"></p>
      <form id="wForm" class="row" style="margin-bottom:12px;align-items:flex-end">
        <label class="fld">شبکه<select class="inp" name="chain">${Object.entries(CHAINS).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join('')}</select></label>
        <label class="fld" style="flex:1;min-width:220px">آدرس عمومی<input class="inp" name="addr" required placeholder="آدرس bc1… / 0x… / Solana"></label>
        <label class="fld">برچسب<input class="inp" name="label" placeholder="کیف پول سرد" style="width:130px"></label>
        <button class="btn primary">افزودن</button>
      </form>
      <div id="wallets"></div>
      <p class="fine mt">🔒 هرگز کلید خصوصی یا عبارت بازیابی (Seed Phrase) را در هیچ بخشی از این سایت وارد نکنید — این سامانه هرگز آن‌ها را درخواست نمی‌کند. تمامی اطلاعات این بخش فقط در مرورگر خودتان ذخیره می‌شوند.</p>
    </div>
    <datalist id="wCoins">${all.filter((c) => !isStable(c.symbol)).slice(0, 250).map((c) => `<option value="${esc(c.symbol)}">${esc(c.name)}</option>`).join('')}</datalist>`;
  if (window.innerWidth < 1000) $('#wgrid', el).style.gridTemplateColumns = 'minmax(0,1fr)';

  const advice = new Map();

  const drawHoldings = () => {
    const holdings = load('holdings', []);
    const rows = holdings.map((h) => {
      const c = all.find((m) => m.symbol === h.symbol);
      const p = c?.price ?? null;
      const value = p ? p * h.amount : 0;
      return { ...h, coin: c, price: p, value, pnl: h.avgBuy && p ? (p - h.avgBuy) * h.amount : null, pnlPct: h.avgBuy && p ? (p / h.avgBuy - 1) * 100 : null, ch24: c?.change24h ?? null };
    });
    const wallets = load('wallets', []);
    const walletValue = wallets.reduce((s, w) => { const c = all.find((m) => m.symbol === w.symbol); return s + (w.balance && c ? w.balance * c.price : 0); }, 0);
    const total = rows.reduce((s, r) => s + r.value, 0);
    const cost = rows.reduce((s, r) => s + (r.avgBuy ? r.avgBuy * r.amount : 0), 0);
    const pnl = rows.reduce((s, r) => s + (r.pnl || 0), 0);
    const day = rows.reduce((s, r) => s + (r.ch24 !== null ? r.value - r.value / (1 + r.ch24 / 100) : 0), 0);
    $('#sum', el).innerHTML = `
      <div class="card stat"><span class="k">ارزش پورتفولیو</span><span class="v">${usd(total)}</span></div>
      <div class="card stat"><span class="k">سود / زیان کل</span>${signedUsd(pnl)}<span class="s">${cost ? pct((pnl / cost) * 100) : ''}</span></div>
      <div class="card stat"><span class="k">تغییرات ۲۴ ساعته</span>${signedUsd(day)}</div>
      <div class="card stat"><span class="k">کیف پول‌های تحت نظر</span><span class="v">${usd(walletValue)}</span><span class="s muted">${wallets.length} آدرس</span></div>`;
    $('#holdings', el).innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">رمزارز</th><th>مقدار</th><th>قیمت</th><th>ارزش</th><th>سود/زیان</th><th class="hide-m">۲۴ ساعت</th><th class="l">پیشنهاد هوش مصنوعی (۴ ساعته)</th><th></th></tr></thead><tbody>
      ${rows.sort((a, b) => b.value - a.value).map((r) => { const a = advice.get(r.symbol); return `<tr data-sym="${esc(r.symbol)}">
        <td class="l"><div class="coin-cell">${coinLogo(r.coin || { symbol: r.symbol }, 24)}<b>${esc(r.symbol)}</b></div></td>
        <td>${amount(r.amount)}</td><td>${money(r.price)}</td><td><b>${usd(r.value)}</b></td>
        <td class="${(r.pnl ?? 0) >= 0 ? 'up' : 'down'}">${r.pnl !== null ? `${r.pnl >= 0 ? '+' : '−'}${usd(Math.abs(r.pnl))}<br><small>${pct(r.pnlPct)}</small>` : '<span class="muted">—</span>'}</td>
        <td class="hide-m">${changeHtml(r.ch24)}</td>
        <td class="l" style="white-space:normal;min-width:170px;max-width:240px">${a ? `<span class="${a.tone === 'warn' ? 'warn' : a.tone}">${esc(a.text)}</span>` : '<span class="spinner" style="width:12px;height:12px"></span>'}</td>
        <td><div class="row" style="gap:4px;flex-wrap:nowrap;justify-content:flex-end">
          ${tradable(r.symbol) ? `<button class="btn sm ghost" data-trade="${esc(r.symbol)}" title="معامله ${esc(r.symbol)} در صرافی">معامله</button>` : ''}
          <button class="icon-btn" style="width:30px;height:30px" data-del="${esc(r.symbol)}" aria-label="حذف">${icon('trash', 14)}</button></div></td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="empty"><p>هنوز دارایی‌ای ثبت نشده است.</p><button class="btn primary" id="addFirst">${icon('plus', 14)} اولین رمزارز خود را اضافه کنید</button></div>`;
    // کلیک درون‌خطی (inline onclick) توسط CSP صفحه مسدود شده است، بنابراین دکمه وضعیت خالی اینجا متصل می‌شود
    $('#addFirst', el)?.addEventListener('click', () => $('#addBtn', el)?.click());
    $$('[data-del]', el).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); save('holdings', load('holdings', []).filter((h) => h.symbol !== b.dataset.del)); drawHoldings(); }));
    $$('#holdings tr[data-sym]', el).forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/coin/${tr.dataset.sym}`; }));
    const items = rows.filter((r) => r.value > 0).map((r, i) => ({ label: r.symbol, value: r.value, color: cssVar(COLORS[i % COLORS.length]) }));
    $('#alloc', el).innerHTML = items.length ? donut(items) : '<p class="muted">برای مشاهده نمودار تخصیص، دارایی اضافه کنید.</p>';
    $('#allocLegend', el).innerHTML = items.map((it) => `<div class="row spread"><span class="row" style="gap:8px"><i style="width:10px;height:10px;border-radius:3px;background:${it.color}"></i>${esc(it.label)}</span><b>${((it.value / total) * 100).toFixed(1)}%</b></div>`).join('');
  };

  const computeAdvice = async () => {
    for (const h of load('holdings', [])) {
      if (disposed) return;
      try {
        const coin = await findCoin(h.symbol);
        const res = await getCandles(coin, '4h', 300);
        // پیشنهاد فقط از روی کندل‌های صرافی خوانده می‌شود: قیمت‌های دمو ساختگی هستند
        // و نمونه‌های CoinGecko کندل‌هایی نیستند که سیگنال روی آن‌ها تست شده است.
        if (!isTestedSource(res)) { advice.set(h.symbol, { text: res.source === 'demo' ? 'قیمت‌های زنده بارگیری نمی‌شوند — بدون پیشنهاد' : 'نمودار صرافی موجود نیست — بدون پیشنهاد', tone: 'flat' }); if (!disposed) drawHoldings(); continue; }
        const { candles } = res;
        const sig = generateSignal(candles, { interval: '4h' });
        advice.set(h.symbol, adviseHolding({ signal: sig, avgBuyPrice: h.avgBuy, price: candles[candles.length - 1].c }));
      } catch { advice.set(h.symbol, { text: 'داده نمودار موجود نیست', tone: 'flat' }); }
      if (!disposed) drawHoldings();
    }
  };

  $('#addBtn', el).addEventListener('click', () => { const f = $('#addForm', el); f.hidden = !f.hidden; if (!f.hidden) f.sym.focus(); });
  // تمام ارقام این جدول به ارز نمایشی انتخاب‌شده نشان داده می‌شوند، بنابراین فیلدی که دلار آمریکا بخواهد
  // باعث اشتباه در وارد کردن قیمت تمام‌شده و گزارش سود و زیان نادرست می‌شود.
  // فیلد ارز نمایشی را دریافت کرده و هنگام ذخیره به دلار تبدیل می‌کند.
  const toUsd = (v) => (fx.rate ? v / fx.rate : v);
  $('#addForm', el).sym.addEventListener('change', (e) => { const c = all.find((m) => m.symbol === e.target.value.toUpperCase()); if (c && !e.target.form.buy.value) e.target.form.buy.placeholder = price(c.price * fx.rate); });
  const onCur = () => {
    const code = $('#buyCur', el);
    if (code) code.textContent = fx.code;
    const form = $('#addForm', el);
    if (form) { form.buy.value = ''; form.buy.placeholder = 'اختیاری'; }
  };
  window.addEventListener('cv:currency', onCur);
  $('#addForm', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const sym = f.sym.value.trim().toUpperCase();
    const coin = all.find((m) => m.symbol === sym);
    if (!coin) { toast(`رمزارز ${sym} در بین ۲۵۰ ارز برتر پیدا نشد`, 'down'); return; }
    const typedBuy = parseFloat(f.buy.value);
    const amt = parseFloat(f.amt.value);
    // مقدار صفر از بررسی فرم عبور می‌کرد و دو بار افزودن صفر باعث تقسیم ۰ بر ۰ در میانگین قیمت می‌شد.
    if (!(amt > 0)) { toast('مقداری بیشتر از صفر وارد کنید.', 'down'); return; }
    // بدون وارد کردن قیمت، قیمت فعلی به عنوان مبنای هزینه در نظر گرفته می‌شود که نباید قیمت ساختگی دمو باشد.
    if (!Number.isFinite(typedBuy) && coin.source === 'demo') { toast('قیمت‌های زنده بارگیری نمی‌شوند، لطفاً قیمت خرید خود را وارد کنید.', 'down'); return; }
    const buy = Number.isFinite(typedBuy) ? toUsd(typedBuy) : coin.price;
    const holdings = load('holdings', []);
    const ex = holdings.find((h) => h.symbol === sym);
    if (ex) { const tot = ex.amount + amt; ex.avgBuy = (ex.avgBuy * ex.amount + buy * amt) / tot; ex.amount = tot; }
    else holdings.push({ symbol: sym, amount: amt, avgBuy: buy });
    save('holdings', holdings);
    f.reset(); f.hidden = true;
    drawHoldings(); computeAdvice();
  });

  const drawWallets = () => {
    const wallets = load('wallets', []);
    $('#wallets', el).innerHTML = wallets.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">کیف پول</th><th class="l">شبکه</th><th>موجودی</th><th>ارزش</th><th></th></tr></thead><tbody>
      ${wallets.map((w, i) => { const c = all.find((m) => m.symbol === w.symbol); return `<tr style="cursor:default"><td class="l"><b>${esc(w.label || 'کیف پول')}</b><br><small class="muted mono">${esc(w.addr.slice(0, 10))}…${esc(w.addr.slice(-6))}</small></td>
        <td class="l">${esc(CHAINS[w.chain].name)}</td><td>${w.error ? `<span class="down">${esc(w.error)}</span>` : w.balance === undefined ? '<span class="spinner" style="width:12px;height:12px"></span>' : `${amount(w.balance)} ${esc(w.symbol)}`}</td>
        <td>${w.balance !== undefined && c ? usd(w.balance * c.price) : '—'}</td>
        <td><button class="icon-btn" style="width:30px;height:30px" data-wdel="${i}" aria-label="حذف">${icon('trash', 14)}</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">هیچ کیف پولی اضافه نشده است. یک آدرس عمومی BTC، ETH، BNB Chain، Polygon یا Solana را برای پیگیری موجودی آن وارد کنید.</p>';
    $$('[data-wdel]', el).forEach((b) => b.addEventListener('click', () => { const ws = load('wallets', []); ws.splice(+b.dataset.wdel, 1); save('wallets', ws); drawWallets(); drawHoldings(); }));
  };
  const refreshWallets = async () => {
    const ws = load('wallets', []);
    await Promise.all(ws.map(async (w) => {
      try { const r = await walletBalance(w.chain, w.addr); w.balance = r.balance; w.symbol = r.symbol; delete w.error; }
      catch (err) { w.error = err.message.slice(0, 60); }
    }));
    if (disposed) return;
    save('wallets', ws); drawWallets(); drawHoldings();
  };
  $('#wForm', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const chain = f.chain.value, addr = f.addr.value.trim();
    if (!CHAINS[chain].pattern.test(addr)) { toast(`این آدرس برای شبکه ${CHAINS[chain].name} معتبر نیست`, 'down'); return; }
    const ws = load('wallets', []);
    ws.push({ chain, addr, label: f.label.value.trim(), symbol: CHAINS[chain].symbol });
    save('wallets', ws);
    f.reset(); drawWallets(); refreshWallets();
  });

  // اتصال به کیف پول فقط آدرس حساب را می‌پرسد و هیچ چیز دیگری — بدون امضا، بدون تراکنش، بدون کلید.
  // این دقیقاً همان پیگیری فقط-خواندنی است که با چسباندن دستی آدرس انجام می‌شود، فقط بدون نیاز به کپی و پیست.
  const addAddresses = (addresses, chain) => {
    const ws = load('wallets', []);
    let added = 0;
    for (const addr of addresses) {
      if (ws.some((w) => w.addr.toLowerCase() === addr.toLowerCase() && w.chain === chain)) continue;
      ws.push({ chain, addr, label: `${walletLabel() || 'کیف پول'}`, symbol: CHAINS[chain].symbol });
      added++;
    }
    if (added) { save('wallets', ws); drawWallets(); refreshWallets(); }
    return added;
  };

  $('#connectBtn', el).addEventListener('click', async () => {
    const msg = $('#connectMsg', el);
    if (!injectedWallet()) {
      msg.innerHTML = 'هیچ کیف پول مرورگری شناسایی نشد. MetaMask یا هر کیف پول EVM دیگری را نصب کنید، یا آدرس عمومی خود را در کادر زیر وارد کنید — هر دو روش در اینجا فقط-خواندنی هستند.';
      return;
    }
    msg.textContent = `در انتظار پاسخ از ${walletLabel()}…`;
    try {
      const r = await connectWallet();
      const added = addAddresses(r.addresses, r.chain);
      msg.innerHTML = added
        ? `<span class="up">اتصال به ${esc(r.label)} برقرار شد — ${added} آدرس به صورت فقط-خواندنی اضافه شد. هیچ امضایی درخواست نشد و هیچ کلیدی به اشتراک گذاشته نشد.</span>`
        : `<span class="up">اتصال به ${esc(r.label)} برقرار شد — این آدرس‌ها از قبل در حال پیگیری بودند.</span>`;
    } catch (e) {
      msg.innerHTML = `<span class="down">${esc(e.message)}</span>`;
    }
  });

  const stopWatch = onWalletChange((ev) => {
    if (disposed || ev.type !== 'accounts') return;
    const added = addAddresses(ev.addresses || [], 'eth');
    if (added) toast(`${added} آدرس جدید از کیف پول شما اضافه شد`, 'info');
  });

  // انتقال به صرافی برای خرید یا فروش یک دارایی.
  const openTrade = (symbol) => {
    const venues = venuesFor(symbol);
    modal(`<h3>معامله ${esc(symbol)}</h3>
      <p class="fine">بازار ${esc(symbol)} را در صرافی‌ای که از قبل استفاده می‌کنید باز می‌کند.</p>
      <div class="sheet-grid mt">${venues.map((v) => `<a class="sheet-item" href="${esc(safeUrl(v.href, '#/exchanges'))}" target="_blank" rel="noopener noreferrer">${icon('exchanges', 18)}<span>${esc(v.name)}<br><small class="fine">${esc(v.pair)}</small></span></a>`).join('')}</div>
      <p class="fine mt">${esc(TRADE_DISCLAIMER)}</p>`);
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-trade]');
    if (b) { e.stopPropagation(); openTrade(b.dataset.trade); }
  });

  drawHoldings(); drawWallets(); computeAdvice(); refreshWallets();
  return () => { disposed = true; stopWatch(); window.removeEventListener('cv:currency', onCur); };
}