// اخبار رمزارز، که به صورت سرورسااید از فیدهای RSS عمومی هر ۲۰ دقیقه جمع‌آوری می‌شوند.
import { $, $$, skeleton, bindSeg, icon } from '../ui.js';
import { esc, ago, safeUrl } from '../format.js';
import { getNews, backendEnabled } from '../api/backend.js';

export const title = 'اخبار';

export async function render(el, [coinParam]) {
  el.innerHTML = `
    <div class="page-head"><div><h1>اخبار</h1><p>سرتیترهای مهم‌ترین رسانه‌های رمزارز، به‌روزرسانی‌شده در هر ۲۰ دقیقه. لینک‌ها در وب‌سایت ناشر باز می‌شوند.</p></div>
      <input class="inp" id="q" placeholder="فیلتر سرتیترها…" style="max-width:240px"></div>
    <div id="body">${skeleton(8, 22)}</div>`;

  if (!backendEnabled()) {
    $('#body', el).innerHTML = '<div class="card empty"><h3>بخش اخبار پیکربندی نشده است</h3><p>این نسخه فاقد بک‌اند است، بنابراین جمع‌آوری‌کننده اخبار فعال نیست.</p></div>';
    return;
  }

  // خطای بارگیری قبلاً به یک لیست خالی با عنوان «۰ سرتیتر» منجر می‌شد
  // که به جای مفهوم «در حال بارگیری نبودن»، این‌طور به نظر می‌رسید که «هیچ خبری وجود ندارد».
  let rows = null;
  try {
    rows = await getNews({ coin: coinParam ? coinParam.toUpperCase() : null, limit: 120 });
  } catch { rows = null; }
  if (!rows) {
    $('#body', el).innerHTML = '<div class="card empty"><h3>بارگیری سرتیترها میسر نشد</h3><p>سرویس اخبار پاسخ نداد. برای تلاش مجدد صفحه را دوباره بارگیری کنید.</p></div>';
    return;
  }
  if (!rows.length) {
    $('#body', el).innerHTML = `<div class="card empty"><h3>هنوز خبری ذخیره نشده است</h3><p>جمع‌آوری‌کننده هر ۲۰ دقیقه اجرا می‌شود${coinParam ? `، و هیچ مورد جدیدی به ${esc(coinParam.toUpperCase())} اشاره نکرده است` : ''}. لطفاً بعداً سر بزنید.</p></div>`;
    return;
  }
  // زمان انتشار جدیدترین خبر، تا وقفه احتمالی در جمع‌آوری‌کننده به جای اخبار تازه قابل مشاهده باشد.
  const newest = rows.reduce((max, r) => Math.max(max, Date.parse(r.published_at) || 0), 0);
  const sources = [...new Set(rows.map((r) => r.source))].sort();
  const coins = [...new Set(rows.flatMap((r) => r.coins || []))].sort();
  let source = 'all', coin = coinParam ? coinParam.toUpperCase() : 'all', q = '';

  const draw = () => {
    let list = rows;
    if (source !== 'all') list = list.filter((r) => r.source === source);
    if (coin !== 'all') list = list.filter((r) => (r.coins || []).includes(coin));
    if (q) list = list.filter((r) => `${r.title} ${r.summary || ''}`.toLowerCase().includes(q));
    $('#list', el).innerHTML = list.length ? list.map((r) => `
      <article class="news-item">
        ${safeUrl(r.image) ? `<img src="${esc(safeUrl(r.image))}" alt="" width="92" height="64" loading="lazy" style="width:92px;height:64px;object-fit:cover;border-radius:10px;flex:none" data-fallback="remove">` : ''}
        <div style="min-width:0">
          <a class="ttl" href="${esc(safeUrl(r.link, '#/news'))}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>
          ${r.summary ? `<p class="fine" style="margin:4px 0 0">${esc(r.summary.slice(0, 200))}${r.summary.length > 200 ? '…' : ''}</p>` : ''}
          <div class="meta"><b>${esc(r.source)}</b><span>${ago(new Date(r.published_at).getTime())}</span>${(r.coins || []).slice(0, 5).map((c) => `<a href="#/coin/${esc(c)}" class="chip">${esc(c)}</a>`).join('')}</div>
        </div>
      </article>`).join('') : `<div class="empty">${icon('info', 20)}<p>هیچ سرتیتری با این فیلتر مطابقت ندارد.</p></div>`;
  };

  $('#body', el).innerHTML = `
    <div class="card">
      <div class="card-h">
        <div class="seg" id="src"><button data-v="all" class="on">همه منابع</button>${sources.map((s) => `<button data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        <span class="fine">${rows.length} سرتیتر اخیر${newest ? ` · جدیدترین ${ago(newest)}` : ''}</span>
      </div>
      ${coins.length ? `<div class="seg" id="cn" style="margin-bottom:10px"><button data-v="all" class="${coin === 'all' ? 'on' : ''}">همه رمزارزها</button>${coins.slice(0, 14).map((c) => `<button data-v="${esc(c)}" class="${coin === c ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
      <div class="news-list" id="list"></div>
    </div>
    <p class="fine mt">سرتیترها به صورت خودکار جمع‌آوری شده و بدون ویرایش نمایش داده می‌شوند — ${esc('CoinVantage')} آن‌ها را تایید یا حمایت نمی‌کند. همیشه پیش از اقدام بر اساس یک خبر، منبع را بررسی کنید.</p>`;

  bindSeg($('#src', el), (v) => { source = v; draw(); });
  if ($('#cn', el)) bindSeg($('#cn', el), (v) => { coin = v; draw(); });
  $('#q', el).addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
  draw();
  void $$;
}