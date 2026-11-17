import { markets, isStable } from '../api/market.js';
import { compareExchanges, EXCHANGE_NAMES } from '../api/exchanges.js';
import { $, skeleton, icon, errorBox } from '../ui.js';
import { esc, usd, pct, compact, changeHtml } from '../format.js';

export const title = 'صرافی‌ها';

export async function render(el, [preset]) {
  const st = { base: (preset || 'BTC').toUpperCase(), timer: null, disposed: false };
  const all = await markets().catch(() => []);
  const options = all.filter((c) => !isStable(c.symbol)).slice(0, 120);

  el.innerHTML = `
    <style>
      .ap-exchanges-wrap {
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
      .ap-exchanges-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-bottom: 24px;
      }
      @media(max-width: 960px) {
        .ap-exchanges-grid { grid-template-columns: 1fr; }
      }
      .ap-exchanges-wrap select.inp {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 12px;
        color: #fff;
        padding: 10px 14px;
        outline: none;
        transition: all 0.2s;
        font-size: 0.95rem;
      }
      .ap-exchanges-wrap select.inp:focus {
        border-color: rgba(94, 92, 230, 0.6);
        box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.25);
      }
      .ap-exchanges-wrap table.tbl {
        width: 100%;
        border-collapse: collapse;
      }
      .ap-exchanges-wrap table.tbl th, .ap-exchanges-wrap table.tbl td {
        padding: 12px 16px;
        text-align: right;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 0.9rem;
      }
      .ap-exchanges-wrap table.tbl th {
        color: rgba(255, 255, 255, 0.5);
        font-weight: 500;
        font-size: 0.8rem;
      }
      .ap-exchanges-wrap table.tbl tr:hover td {
        background: rgba(255, 255, 255, 0.02);
      }
    </style>

    <div class="ap-exchanges-wrap" dir="rtl">
      <div class="ap-hero-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px">
        <div>
          <h1 style="font-size:2.2rem;font-weight:700;letter-spacing:-0.02em;color:#fff;margin:0 0 8px 0">مقایسه صرافی‌ها</h1>
          <p style="color:rgba(255,255,255,0.7);font-size:1.05rem;line-height:1.6;margin:0;max-width:850px">مقایسه لحظه‌ای قیمت، اسپرد، حجم معاملات و ارزان‌ترین صرافی برای هر رمزارز در بین ${EXCHANGE_NAMES.length} صرافی معتبر.</p>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <select class="inp" id="base" aria-label="انتخاب رمزارز" style="min-width:180px">${options.map((c) => `<option value="${esc(c.symbol)}" ${c.symbol === st.base ? 'selected' : ''}>${esc(c.symbol)} · ${esc(c.name)}</option>`).join('')}</select>
          <button class="btn" id="refresh" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:10px 18px;border-radius:12px;cursor:pointer;font-weight:500;display:flex;align-items:center;gap:6px">${icon('refresh', 16)} به‌روزرسانی</button>
        </div>
      </div>

      <div class="ap-exchanges-grid" id="summary"></div>

      <div class="ap-card">
        <div id="table">${skeleton(10, 26)}</div>
        <p class="fine mt" id="foot" style="color:rgba(255,255,255,0.4);font-size:0.8rem;line-height:1.6;margin-top:20px"></p>
      </div>
    </div>`;

  const load = async () => {
    const base = st.base;
    let r;
    try {
      r = await compareExchanges(base);
    } catch {
      if (!st.disposed && base === st.base) $('#table', el).innerHTML = errorBox('خطا در ارتباط با صرافی‌ها. تلاش مجدد خودکار هر ۱۰ ثانیه.', load);
      return;
    }
    if (st.disposed || base !== st.base || !r) return;
    const rows = r.rows.filter((x) => x.ok).sort((a, b) => (b.vol || 0) - (a.vol || 0));
    const maxVol = Math.max(...rows.map((x) => x.vol || 0), 1);

    $('#summary', el).innerHTML = rows.length ? `
      <div class="ap-card stat" style="margin-bottom:0;padding:20px"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.85rem">قیمت میانه (Median)</span><span class="v" style="font-size:1.3rem;font-weight:700;color:#fff;display:block;margin-top:6px">${usd(r.median)}</span><span class="s muted" style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-top:2px;display:block">از بین ${r.okCount} صرافی</span></div>
      <div class="ap-card stat" style="margin-bottom:0;padding:20px"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.85rem">ارزان‌ترین برای خرید</span><span class="v up" style="font-size:1.3rem;font-weight:700;display:block;margin-top:6px">${esc(r.bestBuy?.exchange || '—')}</span><span class="s" style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-top:2px;display:block">بهترین قیمت فروشنده: ${usd(r.bestBuy?.ask)}</span></div>
      <div class="ap-card stat" style="margin-bottom:0;padding:20px"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.85rem">بهترین مکان برای فروش</span><span class="v" style="font-size:1.3rem;font-weight:700;color:#fff;display:block;margin-top:6px">${esc(r.bestSell?.exchange || '—')}</span><span class="s" style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-top:2px;display:block">قیمت خریدار: ${usd(r.bestSell?.bid)} · اختلاف <b class="${r.gapPct > 0 ? 'up' : 'flat'}">${pct(r.gapPct, 3)}</b></span></div>` : '';

    $('#table', el).innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l hide-p">#</th><th class="l">صرافی</th><th class="l hide-t">جفت ارز</th><th>قیمت</th><th>نسبت به میانه</th><th class="hide-l">خرید (Bid)</th><th class="hide-l">فروش (Ask)</th><th>اسپرد</th><th class="hide-p">۲۴ ساعت</th><th class="l hide-p">حجم ۲۴ ساعت</th></tr></thead><tbody>
      ${rows.map((q, i) => `<tr style="cursor:default"><td class="l muted hide-p" style="color:rgba(255,255,255,0.4)">${i + 1}</td><td class="l wrap"><b style="color:#fff">${esc(q.exchange)}</b>${r.bestBuy?.exchange === q.exchange ? ' <span class="chip up" style="padding:2px 6px;border-radius:6px;font-size:0.75rem">بهترین خرید</span>' : ''}</td><td class="l muted hide-t" style="color:rgba(255,255,255,0.4)">${esc(q.pair)}</td>
        <td><b style="color:#fff">${usd(q.price)}</b></td><td class="${q.deviationPct >= 0 ? 'up' : 'down'}">${pct(q.deviationPct, 3)}</td><td class="hide-l">${usd(q.bid)}</td><td class="hide-l">${usd(q.ask)}</td><td>${pct(q.spreadPct, 3, false)}</td><td class="hide-p">${changeHtml(q.change24h)}</td>
        <td class="l hide-p"><div class="row" style="gap:8px;flex-wrap:nowrap;display:flex;align-items:center"><div class="meter" style="width:80px;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden"><i style="display:block;height:100%;width:${((q.vol || 0) / maxVol) * 100}%;background:#5e5ce6"></i></div><span style="font-size:0.85rem">${compact(q.vol)}</span></div></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty" style="text-align:center;padding:30px;color:rgba(255,255,255,0.5)">هیچ صرافی‌ای قیمتی برای این رمزارز ارائه نداد.</div>';

    const failed = r.rows.filter((x) => !x.ok).map((x) => x.exchange);
    $('#foot', el).textContent = `${r.demo ? 'داده‌های نمایشی. ' : ''}به‌روزرسانی خودکار هر ۱۰ ثانیه. ${failed.length ? `غیرقابل دسترس: ${failed.join(', ')}. ` : ''}اختلاف قیمت صرافی‌ها هزینه‌های معاملاتی و کارمزد برداشت را در بر نمی‌گیرد.`;
  };

  $('#base', el).addEventListener('change', (e) => { st.base = e.target.value; $('#table', el).innerHTML = skeleton(10, 26); load(); });
  $('#refresh', el).addEventListener('click', load);
  load();
  st.timer = setInterval(load, 10000);
  return () => { st.disposed = true; clearInterval(st.timer); };
}