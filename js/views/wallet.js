import { markets, findCoin, getCandles, walletBalance, CHAINS, isStable, isTestedSource } from '../api/market.js';
import { generateSignal, adviseHolding } from '../lib/signals.js';
import { donut } from '../charts/small.js';
import { $, $$, coinLogo, icon, toast, skeleton, modal } from '../ui.js';
import { esc, safeUrl, usd, price, pct, amount, changeHtml, compact, money, tone } from '../format.js';
import { fx } from '../api/fx.js';
import { load, save } from '../store.js';
import { connectWallet, injectedWallet, walletLabel, onWalletChange } from '../api/connect.js';
import { venuesFor, tradable, TRADE_DISCLAIMER } from '../lib/trade.js';

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
    <style>
      .ap-wallet-wrap {
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
      .ap-wallet-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 24px;
      }
      @media(max-width: 1000px) {
        .ap-wallet-grid { grid-template-columns: repeat(2, 1fr); }
      }
      .ap-main-grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 24px;
      }
      @media(max-width: 1000px) {
        .ap-main-grid { grid-template-columns: 1fr; }
      }
      .ap-wallet-wrap .inp, .ap-wallet-wrap select {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 12px;
        color: #fff;
        padding: 10px 14px;
        outline: none;
        transition: all 0.2s;
        width: 100%;
      }
      .ap-wallet-wrap .inp:focus, .ap-wallet-wrap select:focus {
        border-color: rgba(94, 92, 230, 0.6);
        box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.25);
      }
      .ap-wallet-wrap table.tbl {
        width: 100%;
        border-collapse: collapse;
      }
      .ap-wallet-wrap table.tbl th, .ap-wallet-wrap table.tbl td {
        padding: 12px 16px;
        text-align: right;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 0.9rem;
      }
      .ap-wallet-wrap table.tbl th {
        color: rgba(255, 255, 255, 0.5);
        font-weight: 500;
        font-size: 0.8rem;
      }
      .ap-wallet-wrap table.tbl tr:hover td {
        background: rgba(255, 255, 255, 0.02);
      }
    </style>

    <div class="ap-wallet-wrap" dir="rtl">
      <div class="ap-hero-card">
        <h1 style="font-size:2.2rem;font-weight:700;letter-spacing:-0.02em;color:#fff;margin:0 0 8px 0">کیف پول و پورتفولیو</h1>
        <p style="color:rgba(255,255,255,0.7);font-size:1.05rem;line-height:1.6;margin:0;max-width:900px">پیگیری دارایی‌ها با سود و زیان زنده، پیشنهادهای نگهداری یا خروج هوش مصنوعی و رصد آدرس‌های عمومی کیف پول.</p>
      </div>

      <div class="ap-wallet-grid" id="sum"></div>

      <div class="ap-main-grid" id="wgrid">
        <div class="ap-card" style="margin-bottom:0">
          <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0;font-size:1.15rem;color:#fff">دارایی‌ها</h3><button class="btn sm primary" id="addBtn" style="background:#5e5ce6;color:#fff;border:0;padding:6px 14px;border-radius:10px;font-weight:500;cursor:pointer">${icon('plus', 14)} افزودن دارایی</button></div>
          <form id="addForm" class="row" hidden style="margin-bottom:16px;display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
            <label class="fld" style="flex:1;min-width:120px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">رمزارز</span><input class="inp" name="sym" list="wCoins" required placeholder="BTC"></label>
            <label class="fld" style="flex:1;min-width:120px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">مقدار</span><input class="inp" name="amt" type="number" step="any" min="0" required placeholder="0.5"></label>
            <label class="fld" style="flex:1.5;min-width:160px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">میانگین خرید (<span id="buyCur">${esc(fx.code)}</span>)</span><input class="inp" name="buy" type="number" step="any" min="0" placeholder="اختیاری"></label>
            <button class="btn primary" style="background:#32d74b;color:#000;border:0;padding:10px 18px;border-radius:12px;font-weight:600;cursor:pointer">ذخیره</button>
          </form>
          <div id="holdings"></div>
        </div>
        <div class="ap-card" style="margin-bottom:0">
          <div class="card-h" style="margin-bottom:16px"><h3 style="margin:0;font-size:1.15rem;color:#fff">تخصیص دارایی</h3></div>
          <div id="alloc" style="display:grid;place-items:center;min-height:160px"></div>
          <div id="allocLegend" class="stack mt" style="gap:8px;margin-top:16px"></div>
        </div>
      </div>

      <div class="ap-card mt" style="margin-top:24px">
        <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
          <div><h3 style="margin:0 0 4px 0;font-size:1.15rem;color:#fff">کیف پول‌های فقط-خواندنی (Watch-only)</h3><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.85rem">استعلام موجودی بدون دسترسی مستقیم</span></div>
          <button class="btn sm" id="connectBtn" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:6px 14px;border-radius:10px;cursor:pointer;font-weight:500">${icon('wallet', 14)} اتصال کیف پول مرورگر</button>
        </div>
        <p class="fine" id="connectMsg" style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-bottom:16px"></p>
        <form id="wForm" class="row" style="margin-bottom:20px;display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <label class="fld" style="flex:1;min-width:140px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">شبکه</span><select class="inp" name="chain">${Object.entries(CHAINS).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join('')}</select></label>
          <label class="fld" style="flex:2;min-width:240px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">آدرس عمومی</span><input class="inp" name="addr" required placeholder="0x… / bc1…"></label>
          <label class="fld" style="flex:1;min-width:130px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">برچسب</span><input class="inp" name="label" placeholder="کیف پول سرد"></label>
          <button class="btn primary" style="background:#5e5ce6;color:#fff;border:0;padding:10px 18px;border-radius:12px;font-weight:600;cursor:pointer">افزودن</button>
        </form>
        <div id="wallets"></div>
        <p class="fine mt" style="color:rgba(255,255,255,0.4);font-size:0.8rem;line-height:1.6;margin-top:16px">🔒 هرگز کلید خصوصی یا عبارت بازیابی را در هیچ سایتی وارد نکنید. تمام اطلاعات پورتفولیو صرفاً در حافظه مرورگر شما ذخیره می‌شوند.</p>
      </div>
    </div>
    <datalist id="wCoins">${all.filter((c) => !isStable(c.symbol)).slice(0, 250).map((c) => `<option value="${esc(c.symbol)}">${esc(c.name)}</option>`).join('')}</datalist>`;

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
      <div class="ap-card stat" style="margin-bottom:0;padding:20px"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.85rem">ارزش پورتفولیو</span><span class="v" style="font-size:1.4rem;font-weight:700;color:#fff;display:block;margin-top:6px">${usd(total)}</span></div>
      <div class="ap-card stat" style="margin-bottom:0;padding:20px"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.85rem">سود / زیان کل</span><div style="margin-top:6px">${signedUsd(pnl)}</div><span class="s" style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-top:2px;display:block">${cost ? pct((pnl / cost) * 100) : ''}</span></div>
      <div class="ap-card stat" style="margin-bottom:0;padding:20px"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.85rem">تغییرات ۲۴ ساعته</span><div style="margin-top:6px">${signedUsd(day)}</div></div>
      <div class="ap-card stat" style="margin-bottom:0;padding:20px"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.85rem">کیف پول‌های تحت نظر</span><span class="v" style="font-size:1.4rem;font-weight:700;color:#fff;display:block;margin-top:6px">${usd(walletValue)}</span><span class="s muted" style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-top:2px;display:block">${wallets.length} آدرس</span></div>`;
    
    $('#holdings', el).innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">رمزارز</th><th>مقدار</th><th>قیمت</th><th>ارزش</th><th>سود/زیان</th><th class="hide-m">۲۴ ساعت</th><th class="l">پیشنهاد هوش مصنوعی</th><th></th></tr></thead><tbody>
      ${rows.sort((a, b) => b.value - a.value).map((r) => { const a = advice.get(r.symbol); return `<tr data-sym="${esc(r.symbol)}" style="cursor:pointer">
        <td class="l"><div class="coin-cell" style="display:flex;align-items:center;gap:8px">${coinLogo(r.coin || { symbol: r.symbol }, 24)}<b>${esc(r.symbol)}</b></div></td>
        <td>${amount(r.amount)}</td><td>${money(r.price)}</td><td><b>${usd(r.value)}</b></td>
        <td class="${(r.pnl ?? 0) >= 0 ? 'up' : 'down'}">${r.pnl !== null ? `${r.pnl >= 0 ? '+' : '−'}${usd(Math.abs(r.pnl))}<br><small style="color:rgba(255,255,255,0.4)">${pct(r.pnlPct)}</small>` : '<span class="muted">—</span>'}</td>
        <td class="hide-m">${changeHtml(r.ch24)}</td>
        <td class="l" style="white-space:normal;min-width:170px;max-width:240px">${a ? `<span class="${a.tone === 'warn' ? 'warn' : a.tone}" style="padding:2px 6px;border-radius:6px;font-size:0.8rem">${esc(a.text)}</span>` : '<span class="spinner" style="width:12px;height:12px"></span>'}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap;justify-content:flex-end">
          ${tradable(r.symbol) ? `<button class="btn sm ghost" data-trade="${esc(r.symbol)}" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:4px 10px;border-radius:8px;font-size:0.75rem;cursor:pointer">معامله</button>` : ''}
          <button class="icon-btn" style="width:30px;height:30px;background:transparent;border:0;color:rgba(255,255,255,0.6);cursor:pointer" data-del="${esc(r.symbol)}" aria-label="حذف">${icon('trash', 14)}</button></div></td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="empty" style="text-align:center;padding:40px"><p style="color:rgba(255,255,255,0.5);margin-bottom:16px">هنوز دارایی‌ای ثبت نشده است.</p><button class="btn primary" id="addFirst" style="background:#5e5ce6;color:#fff;border:0;padding:8px 16px;border-radius:10px;cursor:pointer;font-weight:500">${icon('plus', 14)} افزودن اولین رمزارز</button></div>`;
    
    $('#addFirst', el)?.addEventListener('click', () => $('#addBtn', el)?.click());
    $$('[data-del]', el).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); save('holdings', load('holdings', []).filter((h) => h.symbol !== b.dataset.del)); drawHoldings(); }));
    $$('#holdings tr[data-sym]', el).forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/coin/${tr.dataset.sym}`; }));
    
    const items = rows.filter((r) => r.value > 0).map((r, i) => ({ label: r.symbol, value: r.value, color: cssVar(COLORS[i % COLORS.length]) }));
    $('#alloc', el).innerHTML = items.length ? donut(items) : '<p class="muted" style="color:rgba(255,255,255,0.4)">بدون دارایی</p>';
    $('#allocLegend', el).innerHTML = items.map((it) => `<div class="row spread" style="display:flex;justify-content:space-between;align-items:center"><span class="row" style="display:flex;align-items:center;gap:8px;color:rgba(255,255,255,0.8)"><i style="width:10px;height:10px;border-radius:3px;background:${it.color}"></i>${esc(it.label)}</span><b style="color:#fff">${((it.value / total) * 100).toFixed(1)}%</b></div>`).join('');
  };

  const computeAdvice = async () => {
    for (const h of load('holdings', [])) {
      if (disposed) return;
      try {
        const coin = await findCoin(h.symbol);
        const res = await getCandles(coin, '4h', 300);
        if (!isTestedSource(res)) { advice.set(h.symbol, { text: 'بدون پیشنهاد', tone: 'flat' }); if (!disposed) drawHoldings(); continue; }
        const { candles } = res;
        const sig = generateSignal(candles, { interval: '4h' });
        advice.set(h.symbol, adviseHolding({ signal: sig, avgBuyPrice: h.avgBuy, price: candles[candles.length - 1].c }));
      } catch { advice.set(h.symbol, { text: 'خطا', tone: 'flat' }); }
      if (!disposed) drawHoldings();
    }
  };

  $('#addBtn', el).addEventListener('click', () => { const f = $('#addForm', el); f.hidden = !f.hidden; if (!f.hidden) f.sym.focus(); });
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
    if (!coin) { toast(`رمزارز ${sym} پیدا نشد`, 'down'); return; }
    const typedBuy = parseFloat(f.buy.value);
    const amt = parseFloat(f.amt.value);
    if (!(amt > 0)) { toast('مقدار نامعتبر', 'down'); return; }
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
      ${wallets.map((w, i) => { const c = all.find((m) => m.symbol === w.symbol); return `<tr style="cursor:default"><td class="l"><b style="color:#fff">${esc(w.label || 'کیف پول')}</b><br><small class="muted mono" style="color:rgba(255,255,255,0.4)">${esc(w.addr.slice(0, 10))}…</small></td>
        <td class="l">${esc(CHAINS[w.chain].name)}</td><td>${w.error ? `<span class="down">${esc(w.error)}</span>` : w.balance === undefined ? '<span class="spinner" style="width:12px;height:12px"></span>' : `${amount(w.balance)} ${esc(w.symbol)}`}</td>
        <td>${w.balance !== undefined && c ? usd(w.balance * c.price) : '—'}</td>
        <td><button class="icon-btn" style="width:30px;height:30px;background:transparent;border:0;color:rgba(255,255,255,0.6);cursor:pointer" data-wdel="${i}" aria-label="حذف">${icon('trash', 14)}</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted" style="color:rgba(255,255,255,0.4);font-size:0.85rem">هیچ کیف پولی اضافه نشده است. آدرس عمومی خود را وارد کنید.</p>';
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
    if (!CHAINS[chain].pattern.test(addr)) { toast('آدرس نامعتبر است', 'down'); return; }
    const ws = load('wallets', []);
    ws.push({ chain, addr, label: f.label.value.trim(), symbol: CHAINS[chain].symbol });
    save('wallets', ws);
    f.reset(); drawWallets(); refreshWallets();
  });

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
      msg.innerHTML = 'کیف پول مرورگری یافت نشد.';
      return;
    }
    msg.textContent = 'در حال اتصال…';
    try {
      const r = await connectWallet();
      const added = addAddresses(r.addresses, r.chain);
      msg.innerHTML = added ? `<span class="up">${added} آدرس اضافه شد.</span>` : `<span class="up">آدرس‌ها از قبل موجود بودند.</span>`;
    } catch (e) {
      msg.innerHTML = `<span class="down">${esc(e.message)}</span>`;
    }
  });

  const stopWatch = onWalletChange((ev) => {
    if (disposed || ev.type !== 'accounts') return;
    addAddresses(ev.addresses || [], 'eth');
  });

  const openTrade = (symbol) => {
    const venues = venuesFor(symbol);
    modal(`<div dir="rtl"><h3 style="color:#fff;margin-bottom:12px">معامله ${esc(symbol)}</h3>
      <div class="sheet-grid mt" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">${venues.map((v) => `<a class="sheet-item" href="${esc(safeUrl(v.href, '#/exchanges'))}" target="_blank" rel="noopener noreferrer" style="background:rgba(255,255,255,0.04);padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none">${icon('exchanges', 18)}<span><b>${esc(v.name)}</b><br><small class="fine" dir="ltr" style="color:rgba(255,255,255,0.4);font-size:0.75rem">${esc(v.pair)}</small></span></a>`).join('')}</div>
      <p class="fine mt" style="color:rgba(255,255,255,0.4);font-size:0.8rem;margin-top:16px">${esc(TRADE_DISCLAIMER)}</p></div>`);
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-trade]');
    if (b) { e.stopPropagation(); openTrade(b.dataset.trade); }
  });

  drawHoldings(); drawWallets(); computeAdvice(); refreshWallets();
  return () => { disposed = true; stopWatch(); window.removeEventListener('cv:currency', onCur); };
}