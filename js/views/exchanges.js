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
    <div class="page-head">
      <div><h1>صرافی‌ها</h1><p>مقایسه یک رمزارز در ${EXCHANGE_NAMES.length} صرافی: قیمت زنده، اسپرد، حجم معاملات و ارزان‌ترین صرافی در همین لحظه.</p></div>
      <div class="row">
        <select class="inp" id="base" aria-label="انتخاب رمزارز برای مقایسه در صرافی‌ها">${options.map((c) => `<option value="${esc(c.symbol)}" ${c.symbol === st.base ? 'selected' : ''}>${esc(c.symbol)} · ${esc(c.name)}</option>`).join('')}</select>
        <button class="btn" id="refresh">${icon('refresh', 16)} به‌روزرسانی</button>
      </div>
    </div>
    <div class="grid g3" id="summary"></div>
    <div class="card mt"><div id="table">${skeleton(10, 26)}</div><p class="fine mt" id="foot"></p></div>`;

  const load = async () => {
    const base = st.base;
    // این بخش فاقد catch بود، بنابراین یک دور خطای ارتباطی جدول را برای همیشه روی حالت skeleton نگه می‌داشت
    // و تایمر ۱۰ ثانیه‌ای مدام خطاهای جدیدی را در پس‌زمینه ارسال می‌کرد.
    let r;
    try {
      r = await compareExchanges(base);
    } catch {
      if (!st.disposed && base === st.base) $('#table', el).innerHTML = errorBox('در حال حاضر امکان ارتباط با صرافی‌ها وجود ندارد. این عملیات هر ۱۰ ثانیه به طور خودکار دوباره تلاش می‌کند.', load);
      return;
    }
    if (st.disposed || base !== st.base || !r) return;
    const rows = r.rows.filter((x) => x.ok).sort((a, b) => (b.vol || 0) - (a.vol || 0));
    const maxVol = Math.max(...rows.map((x) => x.vol || 0), 1);
    $('#summary', el).innerHTML = rows.length ? `
      <div class="card stat"><span class="k">قیمت میانه (Median)</span><span class="v">${usd(r.median)}</span><span class="s muted">میانگین از بین ${r.okCount} صرافی پاسخ‌دهنده</span></div>
      <div class="card stat"><span class="k">ارزان‌ترین برای خرید</span><span class="v up">${esc(r.bestBuy?.exchange || '—')}</span><span class="s">قیمت فروشنده (Ask): ${usd(r.bestBuy?.ask)}</span></div>
      <div class="card stat"><span class="k">بهترین مکان برای فروش</span><span class="v">${esc(r.bestSell?.exchange || '—')}</span><span class="s">قیمت خریدار (Bid): ${usd(r.bestSell?.bid)} · اختلاف <b class="${r.gapPct > 0 ? 'up' : 'flat'}">${pct(r.gapPct, 3)}</b></span></div>` : '';
    $('#table', el).innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l hide-p">#</th><th class="l">صرافی</th><th class="l hide-t">جفت ارز</th><th>قیمت</th><th>نسبت به میانه</th><th class="hide-l">خرید (Bid)</th><th class="hide-l">فروش (Ask)</th><th>اسپرد</th><th class="hide-p">۲۴ ساعت</th><th class="l hide-p">حجم ۲۴ ساعت</th></tr></thead><tbody>
      ${rows.map((q, i) => `<tr style="cursor:default"><td class="l muted hide-p">${i + 1}</td><td class="l wrap"><b>${esc(q.exchange)}</b>${r.bestBuy?.exchange === q.exchange ? ' <span class="chip up">بهترین خرید</span>' : ''}</td><td class="l muted hide-t">${esc(q.pair)}</td>
        <td><b>${usd(q.price)}</b></td><td class="${q.deviationPct >= 0 ? 'up' : 'down'}">${pct(q.deviationPct, 3)}</td><td class="hide-l">${usd(q.bid)}</td><td class="hide-l">${usd(q.ask)}</td><td>${pct(q.spreadPct, 3, false)}</td><td class="hide-p">${changeHtml(q.change24h)}</td>
        <td class="l hide-p"><div class="row" style="gap:8px;flex-wrap:nowrap"><div class="meter" style="width:80px"><i style="width:${((q.vol || 0) / maxVol) * 100}%;background:var(--series-1)"></i></div>${compact(q.vol)}</div></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">هیچ صرافی‌ای قیمتی برای این رمزارز ارائه نداد.</div>';
    const failed = r.rows.filter((x) => !x.ok).map((x) => x.exchange);
    $('#foot', el).textContent = `${r.demo ? 'داده‌های نمایشی (صرافی‌ها در دسترس نیستند). ' : ''}به‌روزرسانی خودکار هر ۱۰ ثانیه. ${failed.length ? `لیست‌نشده / غیرقابل دسترس: ${failed.join(', ')}. ` : ''}اختلاف قیمت بین صرافی‌ها هزینه‌های معاملاتی، کارمزد برداشت و زمان انتقال را در نظر نمی‌گیرد، بنابراین اختلاف‌های کوچک به معنای سود رایگان نیستند. جفت ارزهای دلاری (کوین‌بیس، کراکن، جمینای) ممکن است تفاوت اندکی با جفت ارزهای تتر (USDT) داشته باشند.`;
  };

  $('#base', el).addEventListener('change', (e) => { st.base = e.target.value; $('#table', el).innerHTML = skeleton(10, 26); load(); });
  $('#refresh', el).addEventListener('click', load);
  load();
  st.timer = setInterval(load, 10000);
  return () => { st.disposed = true; clearInterval(st.timer); };
}