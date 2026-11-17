// معاملات فیوچرز و مشتقات: نرخ تأمین مالی، سود باز (Open Interest)، پوزیشن‌های لانگ/شورت و لیکوییدیشن‌های زنده.
import { markets, isStable } from '../api/market.js';
import { futuresOverview, futuresSnapshot, liquidationStream, interpretFutures, annualiseFunding } from '../api/futures.js';
import { LineChart } from '../charts/line.js';
import { $, $$, skeleton, coinLogo, icon, errorBox } from '../ui.js';
import { esc, pct, money, compact, num, ago, dateTime } from '../format.js';

export const title = 'فیوچرز';

export async function render(el, [symParam]) {
  const st = { sym: (symParam || 'BTC').toUpperCase(), liqs: [], charts: [], stop: null, disposed: false, coinSeq: 0, liqTimer: null, poll: null, liqState: 'connecting' };
  // تمام بخش‌های این صفحه خوانش در همان لحظه (Point-in-time) هستند. پیش‌تر یک بار بارگذاری می‌شدند و
  // در حالی که متن روی چراغ راهنما "در حال جریان" (streaming) بود ثابت می‌ماندند، بنابراین اعداد منجمد به نظر زنده می‌رسیدند.
  // اکنون آن‌ها به‌روزرسانی می‌شوند و هر پنل زمان خوانش خود را نمایش می‌دهد.
  const REFRESH_MS = 60e3;
  // آستانه کف برای نمایش لیکوییدیشن. این مقدار ۳۰۰۰ دلار تعیین شده بود که برای فید بایننس انتخاب شد؛
  // صرافی OKX موقعیت‌های آلت‌کوین کوچک بسیار بیشتری دارد، بنابراین آن آستانه کف، تمامی سطرها را مخفی می‌کرد
  // و کارت روی وضعیت "در حال انتظار" می‌ماند در حالی که سوکت کاملاً زنده بود.
  // این عدد یک بار تعریف می‌شود و عنوان از روی آن نوشته می‌شود، بنابراین این دو دیگر نمی‌توانند
  // درباره آنچه پنهان می‌شود اختلاف نظر داشته باشند.
  // نمونه‌برداری‌شده از فید زنده: میانه لیکوییدیشن ۳۶۵ دلار، بزرگ‌ترین ۲۷۹۹ دلار در طول صد ثانیه.
  // حتی یکی از آن‌ها هم از آستانه قدیمی ۳۰۰۰ دلاری عبور نمی‌کرد.
  const MIN_LIQ_USD = 250;
  const tsLine = (at) => `<span class="fine" title="${esc(dateTime(at, true))}">خوانده شده در ${esc(ago(at))}</span>`;

  el.innerHTML = `
    <div class="page-head"><div><h1>فیوچرز</h1><p>داده‌های اهرمی از معاملات پرپچوئل تتر (USDT perpetual) — بایننس در صورت در دسترس بودن، در غیر این صورت Bybit یا OKX: هزینه‌ای که معامله‌گران برای نگهداری پوزیشن‌ها می‌پردازند، میزان شلوغی پوزیشن‌ها و افرادی که هم‌اکنون لیکویید می‌شوند.</p></div></div>
    <div class="coin-layout" id="layout">
      <div class="stack" style="gap:14px">
        <div class="card" id="coinCard">${skeleton(5, 22)}</div>
        <div class="card" id="tableCard">${skeleton(8, 22)}</div>
      </div>
      <div class="card" id="liqCard"><div class="card-h"><h3>لیکوییدیشن‌های زنده</h3><span class="live-pill" id="liqPill"><i></i><span>در حال اتصال...</span></span></div><div id="liqList"><p class="fine muted">در انتظار اولین لیکوییدیشن — وقفه‌های آرام عادی هستند و چراغ راهنمای بالا به شما می‌گوید که آیا فید واقعاً زنده است یا خیر.</p></div><p class="fine mt">هر سطر یک پوزیشن اهرمی واقعی است که در یک صرافی فیوچرز اجباراً بسته شده است — چراغ راهنمای بالا نام صرافی تغذیه‌کننده این لیست را نشان می‌دهد. بایننس در صورت در دسترس بودن استفاده می‌شود؛ در جاهایی که استریم آن مسدود باشد، لیست به طور خودکار به OKX تغییر می‌کند. این یک نمونه است، نه یک شمارش کل: صرافی حداکثر یک لیکوییدیشن در هر نماد در ثانیه ارسال می‌کند و سطرهای زیر ${money(MIN_LIQ_USD)} پنهان می‌شوند — بنابراین در طول یک آبشاری، رویدادهای بسیار کمتری نسبت به آنچه واقعاً رخ داده است را مشاهده می‌کنید. اندازه‌ها را بخوانید، نه تعداد را.</p></div>
    </div>`;

  // ---------------------------------------------------------------- جدول بازار
  async function drawTable() {
    let list = [];
    try {
      list = (await markets()).filter((c) => c.binance && !isStable(c.symbol)).slice(0, 24);
    } catch {
      // خطای لیست سکه قطعی فیوچرز نیست، و اعلام آن کاربران را به دنبال مشکل اشتباهی می‌فرستاد
      if (!st.disposed) $('#tableCard', el).innerHTML = errorBox('لیست ارزها بارگذاری نشد، بنابراین داده‌های فیوچرز برای نمایش وجود ندارد.', drawTable);
      return;
    }
    const rows = await futuresOverview(list.map((c) => c.symbol));
    if (st.disposed) return;
    const byS = new Map(list.map((c) => [c.symbol, c]));
    if (!rows.length) { $('#tableCard', el).innerHTML = errorBox('داده‌های فیوچرز از این شبکه در دسترس نیستند — نه بایننس و نه OKX پاسخ ندادند. صرافی‌ها APIهای خود را در برخی مناطق مسدود می‌کنند و مرورگر نمی‌تواند تفاوت بین آن و قطعی را تشخیص دهد.', drawTable); return; }
    const venue = rows.source || 'Binance';
    const intervals = [...new Set(rows.map((r) => r.fundingIntervalHours || 8))].sort((a, b) => a - b);
    $('#tableCard', el).innerHTML = `
      <div class="card-h"><h3>بازار معاملات پرپچوئل فیوچرز · ${esc(venue)}</h3>${tsLine(Date.now())}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">ارز</th><th>قیمت نشانگر (Mark)</th><th>تأمین مالی</th><th>هر</th><th>سالانه شده</th><th>پایه (مارک در برابر شاخص)</th><th>سود باز (OI)</th></tr></thead><tbody>
      ${rows.sort((a, b) => (b.openInterestUsd || 0) - (a.openInterestUsd || 0)).map((r) => {
        const f = r.fundingRate === null ? null : r.fundingRate * 100;
        const hrs = r.fundingIntervalHours || 8;
        const yr = annualiseFunding(f, hrs);
        return `<tr data-sym="${esc(r.symbol)}"><td class="l"><div class="coin-cell">${coinLogo(byS.get(r.symbol) || { symbol: r.symbol }, 22)}<b>${esc(r.symbol)}</b></div></td>
          <td>${money(r.markPrice)}</td>
          <td class="${f > 0.01 ? 'up' : f < -0.01 ? 'down' : ''}">${f === null ? '—' : `${f > 0 ? '+' : ''}${f.toFixed(4)}%`}</td>
          <td class="fine">${hrs} ساعت</td>
          <td class="fine">${yr === null ? '—' : `${yr > 0 ? '+' : ''}${yr.toFixed(1)}%`}</td>
          <td class="${r.basisPct > 0 ? 'up' : r.basisPct < 0 ? 'down' : ''}">${r.basisPct === null ? '—' : pct(r.basisPct, 3)}</td>
          <td>${compact(r.openInterestUsd)}</td></tr>`;
      }).join('')}
      </tbody></table></div>
      <p class="fine mt">نرخ تأمین مالی مثبت به این معناست که لانگ‌ها به شورت‌ها پاداش می‌دهند — بازار در سمت خرید تجمیع شده و هزینه‌اش را پرداخت می‌کند. نرخ تأمین مالی به‌شدت منفی معنای عکس دارد. مقادیر حدی در هر دو جهت معمولاً تسویه می‌شوند. تسویه تأمین مالی بسته به قرارداد هر ${intervals.join(' یا ')} ساعت یک‌بار انجام می‌شود، به همین دلیل ستون سالانه شده برای همه سطرها ضریب یکسانی ندارد. ${venue === 'Binance' ? '«پایه» در اینجا قیمت نشانگر در برابر قیمت شاخص است؛ قیمت مارک بایننس از پیش پایه را تعدیل می‌کند، بنابراین کمتر از فاصله بین آخرین قیمت معامله‌شده و شاخص به نظر می‌رسد.' : `داده‌های حجمی ${esc(venue)} قیمت شاخص ندارد، بنابراین پایه فقط در پنل تک‌ارزی نمایش داده می‌شود.`}</p>`;
    $$('tr[data-sym]', el).forEach((tr) => tr.addEventListener('click', () => {
      st.sym = tr.dataset.sym;
      location.hash = `#/futures/${tr.dataset.sym}`;
    }));
  }

  // ---------------------------------------------------------------- پنل تک‌ارزی
  async function drawCoin(quiet = false) {
    const card = $('#coinCard', el);
    const want = st.sym;
    const seq = ++st.coinSeq;
    if (!quiet) card.innerHTML = skeleton(5, 22);
    const f = await futuresSnapshot(want).catch(() => null);
    // کلیک سریع روی دو سطر باعث می‌شد پاسخ کندتر، کارت را به عنوان ارز اشتباهی بازرندر کند،
    // بدون اینکه چیزی روی صفحه تغییر را نشان دهد
    if (st.disposed || seq !== st.coinSeq || want !== st.sym) return;
    if (!f) {
      st.charts.forEach((c) => c.destroy());
      st.charts = [];
      card.innerHTML = errorBox(`اطلاعات بازار فیوچرز برای ${st.sym} وجود ندارد — ممکن است فقط اسپات باشد یا صرافی‌های فیوچرز از اینجا در دسترس نباشند.`, () => drawCoin());
      return;
    }
    const iv = interpretFutures(f);
    // فراخوانی لایو openInterest از قبل آماده است؛ تاریخچه ساعتی در ابتدای ساعت بسته می‌شود
    // و نسبت به آن ارجحیت داده می‌شد، بنابراین عدد اصلی می‌توانست در اولین رندر یک ساعت قدیمی باشد
    const oiNow = f.openInterestUsd ?? f.oiHistory?.at(-1)?.usd ?? null;
    card.innerHTML = `
      <div class="card-h"><h3>${esc(f.pair)} · ${esc(f.source)}</h3><div class="row" style="gap:8px">${tsLine(f.fetchedAt)}<a class="btn sm ghost" href="#/coin/${esc(st.sym)}">باز کردن تحلیل ${esc(st.sym)}</a></div></div>
      <div class="grid g4">
        <div class="stat"><span class="k">قیمت نشانگر (Mark)</span><span class="v">${money(f.markPrice)}</span><span class="s fine">مارک در برابر شاخص ${f.basisPct === null ? '—' : pct(f.basisPct, 3)}</span></div>
        <div class="stat"><span class="k">نرخ تأمین مالی</span><span class="v ${iv.fundingPct > 0.01 ? 'up' : iv.fundingPct < -0.01 ? 'down' : ''}">${iv.fundingPct === null ? '—' : `${iv.fundingPct > 0 ? '+' : ''}${iv.fundingPct.toFixed(4)}%`}</span><span class="s fine">${iv.annualisedFundingPct === null ? '' : `${iv.annualisedFundingPct.toFixed(1)}% سالانه · تسویه هر ${iv.fundingIntervalHours} ساعت`}</span></div>
        <div class="stat"><span class="k">سود باز (Open Interest)</span><span class="v">${compact(oiNow)}</span><span class="s fine ${iv.oiChange12hPct > 0 ? 'up' : iv.oiChange12hPct < 0 ? 'down' : ''}">${iv.oiChange12hPct === null ? '' : `${pct(iv.oiChange12hPct, 1)} در ۱۲ ساعت`}</span></div>
        <div class="stat"><span class="k">حساب‌های لانگ</span><span class="v">${iv.longAccountsPct === null ? '—' : `${iv.longAccountsPct.toFixed(0)}%`}</span><span class="s fine">${f.topTraders?.at(-1)?.longPositionPct != null ? `پوزیشن‌های تریدرهای برتر ${f.topTraders.at(-1).longPositionPct.toFixed(0)}% لانگ` : ''}</span></div>
      </div>
      ${iv.notes.length ? `<ul class="reasons mt">${iv.notes.map((n) => `<li class="${/squeeze|liquidat|closed/i.test(n) ? 's' : 'b'}">${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="grid g2 mt">
        <div><h4 class="fine">سود باز (۷۲ ساعت)</h4>${f.oiHistory?.length ? '<div id="oiC"></div>' : `<p class="fine muted">${esc(f.source)} تاریخچه سود باز را برای مرورگرها منتشر نمی‌کند.</p>`}</div>
        <div><h4 class="fine">تاریخچه تأمین مالی</h4><div id="fdC"></div></div>
      </div>
      <p class="fine mt">افزایش قیمت همراه با افزایش سود باز = ورود پول جدید به روند. افزایش قیمت همراه با کاهش سود باز = فشرده‌سازی پوزیشن‌های شورت (Short Squeeze) که می‌تواند به سرعت محو شود.</p>`;

    st.charts.forEach((c) => c.destroy());
    st.charts = [];
    if (f.oiHistory?.length) {
      const c = new LineChart($('#oiC', el), { height: 190, yFormat: (v) => compact(v), legend: false, xFormat: (x) => new Date(x).toLocaleString('fa-IR', { month: 'short', day: 'numeric', hour: 'numeric' }), tooltipX: (x) => dateTime(x, true) });
      c.set([{ name: 'سود باز', color: 'var(--series-1)', data: f.oiHistory.map((r) => ({ x: r.t, y: r.usd })) }]);
      c.resize(); st.charts.push(c);
    }
    if (f.fundingHistory?.length) {
      const c = new LineChart($('#fdC', el), { height: 190, yFormat: (v) => `${(v * 100).toFixed(3)}%`, legend: false, zeroLine: 0, xFormat: (x) => new Date(x).toLocaleString('fa-IR', { month: 'short', day: 'numeric', hour: 'numeric' }), tooltipX: (x) => dateTime(x, true) });
      c.set([{ name: 'تأمین مالی', color: 'var(--series-4)', data: f.fundingHistory.map((r) => ({ x: r.t, y: r.rate })) }]);
      c.resize(); st.charts.push(c);
    }
  }
  drawTable();
  drawCoin();
  st.poll = setInterval(() => { if (!st.disposed && !document.hidden) { drawTable(); drawCoin(true); } }, REFRESH_MS);

  // ---------------------------------------------------------------- استریم لیکوییدیشن
  const setPill = (state) => {
    st.liqState = state;
    const pill = $('#liqPill', el);
    if (!pill) return;
    pill.classList.toggle('on', state === 'streaming' || state === 'live');
    pill.classList.toggle('warn', state === 'failed');
    pill.querySelector('span').textContent =
      state === 'streaming' ? `زنده · ${st.venue || 'Binance'}`
      : state === 'live' ? `متصل · ${st.venue || 'Binance'} — در انتظار لیکوییدیشن`
      : state === 'switching' ? 'در حال تغییر منبع...'
      : state === 'open' ? 'متصل — در انتظار'
      : state === 'failed' ? 'هیچ فیدی به این شبکه نمی‌رسد'
      : state === 'reconnecting' ? 'در حال اتصال مجدد...' : 'در حال اتصال...';
  };

  let pending = false;
  st.stop = liquidationStream((ev, status, venue) => {
    // استریم در هر تغییر وضعیت، نام صرافی خود را اعلام می‌کند، بنابراین چراغ راهنما
    // در حالی که سطرها از OKX می‌آیند، دیگر ادعای بایننس را نمی‌کند
    if (ev?.venue) st.venue = ev.venue;
    else if (venue) st.venue = venue;
    // چراغ راهنما قبلاً فقط در اولین رویداد سبز می‌شد، بنابراین یک سوکت سالم
    // بدون لیکوییدیشن بزرگ اولیه کاملاً شبیه یک سوکت مرده به نظر می‌رسید
    if (!ev) { if (st.liqState !== 'streaming' || status === 'failed' || status === 'switching') setPill(status); return; }
    // سطری که قیمت‌گذاری آن امکان‌پذیر نیست باز هم یک لیکوییدیشن واقعی است، بنابراین حفظ می‌شود
    // و به دلیل عدم تطابق با آستانه به طور خاموش حذف نمی‌شود
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
        <div class="row spread" style="padding:6px 0;border-bottom:1px solid var(--border)">
          <div><b>${esc(l.symbol)}</b> <span class="chip ${l.side === 'long' ? 'down' : 'up'}">${l.side === 'long' ? 'لیکوییدیشن لانگ' : 'لیکوییدیشن شورت'}</span></div>
          <div style="text-align:right"><b>${l.usd === null ? `${num(l.contracts)} قرارداد` : compact(l.usd)}</b><br><small class="fine">${money(l.price)} · ${new Date(l.time).toLocaleTimeString('fa-IR')}${l.venue ? ` · ${esc(l.venue)}` : ''}</small></div>
        </div>`).join('');
    }, 400);
  });

  void icon;
  return () => {
    st.disposed = true;
    clearInterval(st.poll);
    clearTimeout(st.liqTimer);
    st.stop?.();
    st.charts.forEach((c) => c.destroy());
  };
}