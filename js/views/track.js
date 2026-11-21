// سابقه عملکرد عمومی: هر سیگنالی که سرور ثبت کرده و نتیجه واقعی آن.
// هیچ‌چیز در اینجا گزینشی نیست — ردیف‌های تعیین‌تکلیف‌شده دقیقاً همان‌طور که بسته شده‌اند شمرده می‌شوند.
import { $, $$, bindSeg, skeleton, icon } from '../ui.js';
import { esc, pct, money, dateTime } from '../format.js';
import { markets } from '../api/market.js';
import { TESTED_ACCURACY } from '../lib/predict.js';
import { liveDirectionCheck, directionTrustFor, LIVE_PROOF_NATS } from '../lib/selfimprove.js';
import { getTrackRecord, getAiRecord, backendEnabled } from '../api/backend.js';
import { aiRecordStats, shareText } from '../lib/airecord.js';
import { CHART_TESTED } from '../lib/autotrader.js';
import { CONFIG } from '../config.js';
import { clockOffsetMs } from '../api/clock.js';
import { fx } from '../api/fx.js';

export const title = 'سابقه عملکرد';

const rate = (hit, n) => (n ? (hit / n) * 100 : null);

const PLAN_WIN = new Set(['tp1', 'tp2', 'tp3', 'target']);
const PLAN_LOSS = new Set(['stop']);
const ACTION_WORDS = {
  STRONG_BUY: 'رشد قوی تاکنون', BUY: 'صعودی', NEUTRAL: 'بدون روند مشخص', SELL: 'نزولی', STRONG_SELL: 'ریزش قوی تاکنون',
  EXTENDED_UP: 'رشد قوی تاکنون', LEANING_UP: 'صعودی', NO_TREND: 'بدون روند مشخص', LEANING_DOWN: 'نزولی', EXTENDED_DOWN: 'ریزش قوی تاکنون',
};
const readable = (a) => ACTION_WORDS[a] || a || '—';
const toneOf = (a) => (/UP|BUY/.test(a || '') ? 'up' : /DOWN|SELL/.test(a || '') ? 'down' : '');

const PLAN_WORDS = {
  tp1: 'هدف ۱',
  tp2: 'هدف ۲',
  tp3: 'هدف ۳',
  stop: 'فعال شدن حد ضرر',
  expired: 'منقضی شده (خنثی)',
  none: 'بدون طرح',
};

const TRACK_FAQS = [
  {
    q: 'سیگنال‌ها و پیش‌بینی‌ها چگونه در سابقه عملکرد ثبت می‌شوند؟',
    a: 'هر سیگنال پیش از مشخص شدن نتیجه آینده در دیتابیس ثبت می‌شود و پس از پایان افق زمانی تعیین‌شده، بر اساس قیمت واقعی بازار به‌صورت خودکار نمره‌دهی می‌شود.',
  },
  {
    q: 'معیار «خط مبنا» در ارزیابی دقت پیش‌بینی چیست؟',
    a: 'خط مبنا نشان می‌دهد اگر کسی در همان بازه صرفاً جهت غالب بازار را انتخاب می‌کرد، چه درصدی درست می‌گفت؛ مقایسه با خط مبنا ارزش واقعی مدل را مشخص می‌کند.',
  },
  {
    q: 'چرا سیگنال‌های باز در درصدهای دقت محاسبه نمی‌شوند؟',
    a: 'تا زمانی که افق زمانی یا شرایط هدف/حد ضرر یک سیگنال تکمیل نشود، نتیجه آن نامشخص است و وارد آمار نهایی تعیین‌تکلیف‌شده نمی‌شود.',
  },
];

function injectTrackJsonLd() {
  if (typeof document === 'undefined') return;
  const scriptId = 'btcs-track-jsonld';
  const origin = `${location.origin || 'https://btcs.ir'}/`;
  const canonicalUrl = `${origin}track/`;
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: 'سابقه عملکرد سیگنال‌ها و دقت پیش‌بینی رمزارزها',
        description: 'گزارش شفاف و عمومی از دقت پیش‌بینی، مقایسه با خط مبنا، نتایج طرح‌های معاملاتی و تطابق قیمت‌های زنده با صرافی.',
        isPartOf: { '@id': `${origin}#website` },
        inLanguage: 'fa-IR',
      },
      {
        '@type': 'FAQPage',
        mainEntity: TRACK_FAQS.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
      },
    ],
  };

  let tag = document.getElementById(scriptId);
  if (!tag) {
    tag = document.createElement('script');
    tag.id = scriptId;
    tag.type = 'application/ld+json';
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(data);
}

function safeTimestamp(val) {
  const t = new Date(val).getTime();
  return Number.isFinite(t) ? t : null;
}

export async function render(el) {
  injectTrackJsonLd();

  let disposed = false;
  let activeController = null;
  let reloadToken = 0;

  el.innerHTML = `
    <style>
      .ap-track-wrap {
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
      .ap-bento-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 24px;
      }
      @media(max-width: 1024px) {
        .ap-bento-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media(max-width: 600px) {
        .ap-bento-grid { grid-template-columns: 1fr; }
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
      .ap-track-wrap .seg {
        background: rgba(255, 255, 255, 0.05);
        padding: 4px;
        border-radius: 12px;
        display: inline-flex;
        gap: 4px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        flex-wrap: wrap;
      }
      .ap-track-wrap .seg button {
        background: transparent;
        border: 0;
        color: rgba(255, 255, 255, 0.62);
        padding: 6px 14px;
        border-radius: 9px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      }
      .ap-track-wrap .seg button.on {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      }
      .ap-track-wrap table.tbl {
        width: 100%;
        border-collapse: collapse;
      }
      .ap-track-wrap table.tbl th, .ap-track-wrap table.tbl td {
        padding: 12px 16px;
        text-align: right;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 0.9rem;
      }
      .ap-track-wrap table.tbl th {
        color: rgba(255, 255, 255, 0.52);
        font-weight: 500;
        font-size: 0.8rem;
      }
      .ap-track-wrap table.tbl tr:hover td {
        background: rgba(255, 255, 255, 0.02);
      }
      .ap-track-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .ap-track-filter {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        color: #fff;
        padding: 8px 14px;
        font-size: 0.9rem;
        min-width: 180px;
        outline: none;
      }
      .ap-track-filter:focus {
        border-color: rgba(94, 92, 230, 0.7);
      }
      .ap-coin-link {
        color: inherit;
        text-decoration: none;
        font-weight: 700;
      }
      .ap-coin-link:hover {
        text-decoration: underline;
      }
      .ap-nav-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }
      .ap-nav-pills a {
        color: rgba(255, 255, 255, 0.82);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 0.82rem;
        text-decoration: none;
      }
      .ap-nav-pills a:hover {
        border-color: rgba(255, 255, 255, 0.25);
        color: #fff;
      }
      .ap-faq-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 14px;
        margin-top: 12px;
      }
      .ap-faq-box {
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 16px;
        padding: 16px;
      }
      .ap-faq-box h3 {
        font-size: 0.96rem;
        color: #fff;
        margin: 0 0 8px 0;
      }
      .ap-faq-box p {
        font-size: 0.86rem;
        color: rgba(255, 255, 255, 0.65);
        line-height: 1.65;
        margin: 0;
      }
      #dataCheck { min-height: 120px; }
      #body { min-height: 360px; }
    </style>

    <div class="ap-track-wrap" dir="rtl">
      <header class="ap-hero-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px">
        <div>
          <h1 style="font-size:2.2rem;font-weight:700;letter-spacing:-0.02em;color:#fff;margin:0 0 8px 0">سابقه عملکرد</h1>
          <p style="color:rgba(255,255,255,0.72);font-size:1.05rem;line-height:1.65;margin:0;max-width:860px">هر سیگنال زیر <b>پیش از</b> مشخص شدن نتیجه در دیتابیس ثبت شده و پس از رسیدن افق زمانی بر اساس حرکت واقعی بازار نمره‌دهی شده است. معیار مقایسه، خط مبنا و شفافیت داده‌ها در این صفحه به‌صورت عمومی منتشر می‌شوند.</p>
          <nav class="ap-nav-pills" aria-label="صفحات مرتبط با تحلیل و بازار">
            <a href="#/">نمای زنده بازارها</a>
            <a href="#/coin/BTC">تحلیل بیت‌کوین (BTC)</a>
            <a href="#/ai">دستیار هوشمند</a>
            <a href="#/learn">یادگیری هوش مصنوعی</a>
            <a href="#/legal/risk">بیانیه ریسک</a>
          </nav>
        </div>
        <div class="seg" id="iv" role="group" aria-label="فیلتر تایم‌فریم">
          <button type="button" data-v="all" class="on" aria-pressed="true">همه</button>
          <button type="button" data-v="15m" aria-pressed="false">۱۵ دقیقه</button>
          <button type="button" data-v="1h" aria-pressed="false">۱ ساعت</button>
          <button type="button" data-v="4h" aria-pressed="false">۴ ساعت</button>
          <button type="button" data-v="1d" aria-pressed="false">۱ روز</button>
        </div>
      </header>

      <section class="ap-card" id="dataCheck" style="padding:20px 24px" aria-label="بررسی تطابق داده‌های زنده">
        <div class="row" style="display:flex;align-items:center;gap:12px"><span class="spinner"></span><b style="color:#fff">در حال مقایسه داده‌های زنده با صرافی…</b></div>
      </section>

      <div id="body">${skeleton(8, 24)}</div>

      <section class="ap-card" aria-label="سوالات متداول درباره سابقه عملکرد">
        <h2 style="margin:0 0 6px 0;font-size:1.2rem;color:#fff">سوالات متداول درباره کارنامه سیگنال‌ها</h2>
        <p class="fine" style="color:rgba(255,255,255,0.55);margin:0">تمامی آمارها جنبه تحلیلی و آموزشی دارند و مشاوره سرمایه‌گذاری محسوب نمی‌شوند.</p>
        <div class="ap-faq-grid">
          ${TRACK_FAQS.map((item) => `
            <article class="ap-faq-box">
              <h3>${esc(item.q)}</h3>
              <p>${esc(item.a)}</p>
            </article>
          `).join('')}
        </div>
      </section>
    </div>`;

  // بررسی زنده قیمت و اختلاف ساعت صرافی
  (async () => {
    const card = $('#dataCheck', el);
    if (!card || disposed) return;
    const rows = [];
    let worst = 0;
    try {
      const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const restUrl = CONFIG.BINANCE_REST?.[0];
      if (!restUrl) throw new Error('عدم وجود آدرس صرافی');
      const liveResp = await fetch(
        `${restUrl}/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(pairs))}`,
        { signal: AbortSignal.timeout ? AbortSignal.timeout(7000) : undefined }
      );
      if (!liveResp.ok) throw new Error(`HTTP ${liveResp.status}`);
      const live = await liveResp.json();
      const list = await markets();
      for (const row of live) {
        const sym = String(row.symbol || '').replace('USDT', '');
        const px = Number(row.price);
        const ours = list.find((c) => c.symbol === sym);
        if (!ours || !Number.isFinite(px) || px <= 0 || !Number.isFinite(ours.price)) continue;
        const diff = Math.abs((ours.price - px) / px) * 100;
        worst = Math.max(worst, diff);
        rows.push(`<tr>
          <td class="l"><a class="ap-coin-link" href="#/coin/${encodeURIComponent(sym)}">${esc(sym)}</a></td>
          <td>${money(px)}<small class="show-p-block" style="color:rgba(255,255,255,0.4)">اینجا ${money(ours.price)}</small></td>
          <td class="hide-p">${money(ours.price)}</td>
          <td class="${diff < 0.1 ? 'up' : 'warn'}">${diff.toFixed(3)}%</td>
        </tr>`);
      }
    } catch {
      /* آفلاین یا خطای شبکه */
    }
    if (disposed || !card.isConnected) return;
    const skew = clockOffsetMs();
    card.innerHTML = rows.length
      ? `
      <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h3 style="margin:0;font-size:1.15rem;color:#fff">بررسی داده‌های زنده</h3><span class="chip ${worst < 0.1 ? 'up' : 'warn'}" style="padding:4px 10px;border-radius:8px;font-size:0.8rem">${worst < 0.1 ? 'منطبق با صرافی' : 'اختلاف جزئی'}</span></div>
      <div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">رمزارز</th><th>قیمت زنده صرافی</th><th class="hide-p">نمایش‌داده‌شده اینجا</th><th>اختلاف</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
      <p class="fine mt" style="color:rgba(255,255,255,0.5);margin:12px 0 0;font-size:0.85rem;line-height:1.6">قیمت‌ها مستقیماً از صرافی دریافت شده و با همان تعداد اعشاری که صرافی اعلام می‌کند نمایش داده می‌شوند. اختلاف‌های کوچک ناشی از ثانیه‌های بین دو خوانش است، نه گرد کردن اعداد.
      ساعت: دستگاه شما <b>${Math.abs(skew)} میلی‌ثانیه ${skew >= 0 ? 'عقب‌تر' : 'جلوتر'}</b> از صرافی است و اپلیکیشن آن را اصلاح می‌کند، بنابراین تمام زمان‌ها در سایت بر اساس ساعت صرافی هستند.
      واحد پول: ۱ دلار آمریکا = ${Number.isFinite(fx?.rate) ? fx.rate.toFixed(4) : '—'} ${esc(fx?.code || '')}، بر اساس فید نرخ زنده.</p>
      <p class="fine" style="color:rgba(255,255,255,0.5);margin:8px 0 0;font-size:0.85rem"><b>موارد غیردقیق:</b> پیش‌بینی‌ها. قیمت‌ها واقعیت هستند؛ پیش‌بینی یک احتمال است و دقت اندازه‌گیری‌شده آن در زیر منتشر شده است — هرگز به سمت بالا گرد نمی‌شود.</p>`
      : '<div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h3 style="margin:0;font-size:1.15rem;color:#fff">بررسی داده‌های زنده</h3><span class="chip warn" style="padding:4px 10px;border-radius:8px;font-size:0.8rem">دسترسی به صرافی میسر نشد</span></div><p class="fine" style="color:rgba(255,255,255,0.5);margin:0;font-size:0.85rem">این بررسی نیازمند اتصال زنده به صرافی است. اجرا نشد، بنابراین هیچ ادعایی مطرح نمی‌شود.</p>';
  })();

  if (!backendEnabled()) {
    $('#body', el).innerHTML = '<div class="ap-card empty" style="text-align:center;padding:40px"><h3 style="color:#fff;margin-bottom:8px">ردیابی زنده پیکربندی نشده است</h3><p style="color:rgba(255,255,255,0.6)">بک‌اند مربوط به ثبت و امتیازبندی سیگنال‌ها در این نسخه متصل نیست.</p></div>';
    return () => { disposed = true; };
  }

  let rows = null;
  let aiRows = null;
  let rowsCapped = false;
  let interval = 'all';
  let symbolFilter = '';
  let recentLimit = 200;
  const ROW_CAP = 1000;

  const loadRecordData = async () => {
    const myToken = ++reloadToken;
    activeController?.abort();
    const ac = new AbortController();
    activeController = ac;

    $('#body', el).innerHTML = skeleton(8, 24);
    const fetchedRows = await getTrackRecord({ limit: ROW_CAP, signal: ac.signal }).catch(() => null);
    if (disposed || myToken !== reloadToken) return;

    if (!fetchedRows) {
      $('#body', el).innerHTML = `
        <div class="ap-card empty" style="text-align:center;padding:40px">
          <h3 style="color:#fff;margin-bottom:8px">سابقه عملکرد بارگیری نشد</h3>
          <p style="color:rgba(255,255,255,0.6);margin-bottom:16px">سروری که سیگنال‌ها را ثبت و امتیازبندی می‌کند پاسخ نداد.</p>
          <button type="button" class="btn" id="retryTrackBtn" style="padding:8px 18px;border-radius:10px;cursor:pointer">تلاش مجدد</button>
        </div>`;
      $('#retryTrackBtn', el)?.addEventListener('click', () => loadRecordData());
      return;
    }

    rows = Array.isArray(fetchedRows) ? fetchedRows : [];
    rowsCapped = rows.length >= ROW_CAP;
    aiRows = await getAiRecord({ signal: ac.signal }).catch(() => null);
    if (disposed || myToken !== reloadToken) return;
    draw();
  };

  const aiCard = () => {
    const st = aiRows ? aiRecordStats(aiRows) : {};
    const ivs = ['15m', '1h', '4h', '1d'].filter((iv) => st[iv]);
    const day = (t) => {
      const ms = safeTimestamp(t);
      return ms ? new Date(ms).toISOString().slice(0, 10) : '—';
    };
    return `<div class="ap-card mt">
      <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px;flex-wrap:wrap"><h3 style="margin:0;font-size:1.15rem;color:#fff">سیگنال هوش مصنوعی، زنده</h3><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.85rem">وضعیت‌های خرید/نگهداری/فروش در صفحات رمزارز، ثبت‌شده توسط سرور در زمان بسته شدن هر کندل</span></div>
      ${!ivs.length
        ? `<p class="fine" style="color:rgba(255,255,255,0.6);font-size:0.9rem">${aiRows ? 'شروع شده — اولین کندل‌ها در حال ثبت هستند و هنوز نتیجه‌ای نمره‌دهی نشده است.' : 'هنوز در این نسخه فعال نشده است.'} هر کندل ۴ ساعته و روزانه بسته‌شده از رمزارزهای ردیابی‌شده یک ردیف دریافت می‌کند که پیش از مشخص شدن آینده نوشته شده و بر اساس قیمت چند کندل بعد نمره‌دهی می‌شود.</p>`
        : `
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">نمودار</th><th>تعداد ثبت‌شده</th><th>قیمت بالاتر پس از خرید</th><th>…پس از هر کندل</th><th>تست‌شده (قبل از انتشار زنده)</th><th>معاملات بسته شده</th><th>پوزیشن‌های باز فعلی</th></tr></thead><tbody>
        ${ivs.map((iv) => {
          const x = st[iv], t = CHART_TESTED[iv]?.signals;
          return `<tr>
            <td class="l">${iv}</td>
            <td>${x.logged.toLocaleString('en-US')} <span class="fine" style="color:rgba(255,255,255,0.4)">(${x.coins} رمزارز، از ${day(x.since)})</span></td>
            <td>${x.buys ? shareText(x.buyUp, x.buys) : '—'} <span class="fine" style="color:rgba(255,255,255,0.4)">(${x.buys} نمره‌دهی‌شده)</span></td>
            <td>${x.graded ? shareText(x.anyUp, x.graded) : '—'} <span class="fine" style="color:rgba(255,255,255,0.4)">(${x.graded})</span></td>
            <td class="fine" style="color:rgba(255,255,255,0.6)">${t ? `${t.fwdUpPct.toFixed(1)}٪ در برابر ${t.baseUpPct.toFixed(1)}٪` : '—'}</td>
            <td>${x.trades ? `${x.trades} مورد، ${x.wins} برد، میانگین <b class="${x.avgTradePct >= 0 ? 'up' : 'down'}">${x.avgTradePct >= 0 ? '+' : ''}${x.avgTradePct}٪</b>` : '۰'}</td>
            <td>${x.open} از ${x.coins}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>
      <p class="fine" style="margin:12px 0 0;color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.6">امتیازبندی بر اساس قیمت ۶ کندل (۴h) یا ۷ روز (۱d) پس از هر ردیف انجام می‌شود. معاملات فقط پس از شروع ردیابی آن رمزارز و پس از کسر کارمزد شمرده می‌شوند. نمونه کوچک اهمیت کمی دارد؛ ارقام تست‌شده معیاری هستند که باید شکست داده شوند و قبل از انتشار زنده، خریدها هیچ کندلی را شکست ندادند.</p>`}
    </div>`;
  };

  const draw = () => {
    if (!Array.isArray(rows) || disposed) return;
    const symQuery = symbolFilter.trim().toUpperCase();
    const filtered = rows.filter((r) => {
      if (interval !== 'all' && r.interval !== interval) return false;
      if (symQuery && !String(r.symbol || '').toUpperCase().includes(symQuery)) return false;
      return true;
    });

    const done = filtered.filter((r) => r.resolved);
    const fc = done.filter((r) => r.forecast_correct !== null);
    const hit = fc.filter((r) => r.forecast_correct).length;

    const plans = done.filter((r) => r.plan_result && r.plan_result !== 'none');
    const oldRule = plans.filter((r) => (r.plan_v ?? 1) < 2).length;
    const wins = plans.filter((r) => PLAN_WIN.has(r.plan_result)).length;
    const losses = plans.filter((r) => PLAN_LOSS.has(r.plan_result)).length;
    const expired = plans.filter((r) => r.plan_result === 'expired').length;
    const avgOf = (rs) => (rs.length ? rs.reduce((s, r) => s + (+r.plan_return_pct || 0), 0) / rs.length : null);
    const avgWin = avgOf(plans.filter((r) => PLAN_WIN.has(r.plan_result)));
    const avgLoss = avgOf(plans.filter((r) => PLAN_LOSS.has(r.plan_result)));
    const expectancy = avgOf(plans);

    const rose = fc.filter((r) => +r.outcome_price > +r.price).length;
    const rosePct = fc.length ? (rose / fc.length) * 100 : null;
    const baseline = rosePct === null ? null : Math.max(rosePct, 100 - rosePct);
    const baselineCall = rosePct === null ? null : rosePct >= 50 ? 'صعودی' : 'نزولی';

    const byAction = new Map();
    for (const r of fc) {
      const k = r.action || '—';
      const e = byAction.get(k) || { n: 0, hit: 0, rose: 0, ret: 0, retN: 0 };
      e.n++;
      if (r.forecast_correct) e.hit++;
      if (+r.outcome_price > +r.price) e.rose++;
      if (r.plan_return_pct !== null && r.plan_return_pct !== undefined) { e.ret += +r.plan_return_pct; e.retN++; }
      byAction.set(k, e);
    }
    const actionRows = [...byAction.entries()].sort((a, b) => b[1].n - a[1].n);

    const bySym = new Map();
    for (const r of fc) {
      const e = bySym.get(r.symbol) || { n: 0, hit: 0 };
      e.n++;
      if (r.forecast_correct) e.hit++;
      bySym.set(r.symbol, e);
    }
    const symRows = [...bySym.entries()].filter(([, e]) => e.n >= 5).sort((a, b) => rate(b[1].hit, b[1].n) - rate(a[1].hit, a[1].n));

    const checks = [...new Set(done.map((r) => r.interval))].sort().map((iv) => liveDirectionCheck(done, iv)).filter((c) => c.n);
    const acc = rate(hit, fc.length);
    const beatsBaseline = acc !== null && baseline !== null && acc > baseline;
    const tested = TESTED_ACCURACY[interval === 'all' ? 'all' : interval];

    const oldestMs = filtered.length ? safeTimestamp(filtered[filtered.length - 1]?.candle_time) : null;
    const spanDays = oldestMs ? Math.max(1, Math.round((Date.now() - oldestMs) / 864e5)) : 1;

    $('#body', el).innerHTML = `
      <div class="ap-bento-grid">
        <div class="ap-card" style="margin-bottom:0"><div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.85rem">تشخیص صحیح جهت بازار</span><span class="v ${acc === null ? '' : beatsBaseline ? 'up' : 'down'}" style="font-size:1.8rem;font-weight:700;display:block;margin:6px 0">${acc === null ? '—' : `${acc.toFixed(1)}٪`}</span><span class="s fine" style="color:rgba(255,255,255,0.4);font-size:0.8rem">${fc.length} پیش‌بینی تعیین‌تکلیف‌شده</span></div></div>
        <div class="ap-card" style="margin-bottom:0"><div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.85rem">معیار مقایسه (خط مبنا)</span><span class="v" style="font-size:1.8rem;font-weight:700;color:#fff;display:block;margin:6px 0">${baseline === null ? '—' : `${baseline.toFixed(1)}٪`}</span><span class="s fine" style="color:rgba(255,255,255,0.4);font-size:0.8rem">${baselineCall === null ? 'هنوز ردیفی نیست' : `همیشه "${baselineCall}"`}</span></div></div>
        <div class="ap-card" style="margin-bottom:0"><div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.85rem">طرح‌های موفق به رسیدن به هدف</span><span class="v ${plans.length && wins / plans.length >= 0.5 ? 'up' : plans.length ? 'down' : ''}" style="font-size:1.8rem;font-weight:700;display:block;margin:6px 0">${plans.length ? `${((wins / plans.length) * 100).toFixed(0)}٪` : '—'}</span><span class="s fine" style="color:rgba(255,255,255,0.4);font-size:0.8rem">${wins} هدف · ${losses} حد ضرر · ${expired} منقضی</span></div></div>
        <div class="ap-card" style="margin-bottom:0"><div class="stat"><span class="k" style="color:rgba(255,255,255,0.5);font-size:0.85rem">میانگین نتیجه هر طرح</span><span class="v ${expectancy > 0 ? 'up' : expectancy < 0 ? 'down' : ''}" style="font-size:1.8rem;font-weight:700;display:block;margin:6px 0">${expectancy === null ? '—' : pct(expectancy)}</span><span class="s fine" style="color:rgba(255,255,255,0.4);font-size:0.8rem">${avgWin === null ? '' : `برنده ${pct(avgWin)}`}${avgLoss === null ? '' : ` · بازنده ${pct(avgLoss)}`}</span></div></div>
      </div>

      ${aiCard()}

      <div class="ap-card mt" ${acc !== null && !beatsBaseline ? 'style="border-color:var(--warn)"' : ''}>
        <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px;flex-wrap:wrap"><h3 style="margin:0;font-size:1.15rem;color:#fff">چگونه این آمار را بخوانیم</h3>${acc === null ? '' : `<span class="chip ${beatsBaseline ? 'up' : 'warn'}" style="padding:4px 10px;border-radius:8px;font-size:0.8rem">${beatsBaseline ? `پیش افتادن از خط مبنا به میزان ${(acc - baseline).toFixed(1)} امتیاز` : `${(baseline - acc).toFixed(1)} امتیاز عقب‌تر از خط مبنا`}</span>`}</div>
        ${acc === null ? '<p class="fine" style="color:rgba(255,255,255,0.6)">هنوز هیچ موردی تعیین‌تکلیف نشده است.</p>' : `
        <p style="color:rgba(255,255,255,0.8);line-height:1.6;margin:0 0 12px 0">در طول این ${fc.length} پیش‌بینی تعیین‌تکلیف‌شده، بازار در ${rosePct.toFixed(1)}٪ مواقع صعود کرده است. بنابراین هرکسی که مدل را کاملاً نادیده می‌گرفت و در هر بار می‌گفت «${baselineCall}»، در <b>${baseline.toFixed(1)}٪</b> مواقع حق داشت. موتور امتیاز ${acc.toFixed(1)}٪ کسب کرده است.
        ${beatsBaseline
          ? 'این نتیجه بالاتر از خط مبنا است که تنها مقایسه‌ی معنادار محسوب می‌شود — اما برتری کوچکی در یک نمونه‌ی کوتاه است و دلیلی برای افزایش حجم معاملات نیست.'
          : 'این نتیجه <b>پایین‌تر</b> از خط مبنا است. در این نمونه، مدل کارایی خود را ثابت نکرده است: یک پاسخ ثابت عملکرد بهتری داشت و هیچ‌چیز بالاتر از ۵۰٪ بودن این حقیقت را تغییر نمی‌دهد.'}</p>
        <p class="fine" style="color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.6;margin:8px 0">دو عامل باعث می‌شود این نمونه ضعیف‌تر از تعداد ردیف‌هایش به نظر برسد. ردیف‌ها شامل ${spanDays} روز از یک بازار واحد هستند و رمزارزها با هم حرکت می‌کنند — ریزش ۱۲ رمزارز در یک هفته بیشتر شبیه یک مشاهده است تا ۱۲ مشاهده مستقل. تمام ارقام این صفحه را تا زمانی که نمونه شامل شرایط مختلف بازار شود به عنوان مقادیر موقتی در نظر بگیرید.${filtered.length - done.length > 0 ? ` ${filtered.length - done.length} سیگنال همچنان باز است و در هیچ‌یک از درصدهای اینجا شمرده نشده است.` : ''}</p>
        <p class="fine" style="color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.6;margin:8px 0">طرح‌های معاملاتی دقیقاً مطابق قوانین مدیریت پوزیشن امتیازبندی می‌شوند: نیمی از پوزیشن در هدف ۱ بسته می‌شود و حد ضرر باقی‌مانده به قیمت ورود منتقل می‌گردد؛ بقیه پوزیشن در هدف ۲، قیمت ورود یا بسته شدن کندل در انتهای افق زمانی بسته می‌شود. زمانی که یک کندل هم حد ضرر و هم هدف را لمس کند، فرض بر این است که حد ضرر اول رخ داده است. کارمزدها لحاظ نشده‌اند. تا تاریخ ۱۲ اکتبر ۲۰۲۶ قانون متفاوتی استفاده می‌شد — حد ضرر پس از هدف ۱ به عنوان زیان کامل شمرده می‌شد و طرحی که به هدف ۲ می‌رسید انگار کل پوزیشن آنجا بسته شده است — و طرح‌های قدیمی چندتا چندتا تحت قوانین جدید مجدداً امتیازبندی می‌شوند${oldRule ? `: <b>${oldRule} مورد از ${plans.length} طرح نمایش‌داده‌شده در اینجا</b> همچنان با سیستم امتیازبندی قدیمی هستند` : '؛ تمام طرح‌های نمایش‌داده‌شده به‌روز هستند'}.</p>
        <p class="fine" style="color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.6;margin:8px 0">تست آفلاین، اجرا شده روی ${TESTED_ACCURACY.tests} پیش‌بینی روی ${TESTED_ACCURACY.coins} رمزارز پیش از انتشار زنده، دقت ${tested ? `${tested}٪` : '—'} را در این تایم‌فریم ثبت کرده است. هر جا که عدد زنده با آن اختلاف داشته باشد، عدد زنده ملاک است.</p>`}
      </div>

      ${checks.length ? `<div class="ap-card mt">
        <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px;flex-wrap:wrap"><h3 style="margin:0;font-size:1.15rem;color:#fff">آیا جهت‌گیری پیش‌بینی در حالت زنده ارزشی دارد؟</h3><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.85rem">معیاری که اعتماد صفحه رمزارز را تنظیم می‌کند</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">تایم‌فریم</th><th>نمره‌دهی‌شده</th><th>کندل‌های مجزا</th><th>بهترین ضریب اعتماد</th><th>شواهد (نیاز به ${LIVE_PROOF_NATS})</th><th>نرخ برد · خط مبنا</th><th>اعتماد استفاده‌شده اینجا</th></tr></thead><tbody>
        ${checks.map((c) => `<tr style="cursor:default">
          <td class="l"><b>${esc(c.interval)}</b></td><td>${c.n}</td><td>${c.candles}</td><td>${c.s.toFixed(2)}</td>
          <td class="${c.proven ? 'up' : ''}">${c.evidence.toFixed(2)}</td>
          <td class="${c.hit > c.baseline ? 'up' : 'down'}">${(c.hit * 100).toFixed(1)}٪ · ${(c.baseline * 100).toFixed(1)}٪</td>
          <td>${directionTrustFor(c.interval).trust.toFixed(2)}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="fine mt" style="color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.6;margin:12px 0 0">ضریب اعتماد میزان دوری احتمال رشد پیش‌بینی از ۵۰٪ را نشان می‌دهد: در صفر، احتمال ۵۰٪ نمایش داده شده و صفحه رمزارز اعلام می‌کند جهت قابل اعتمادی وجود ندارد؛ در ۱، دقیقاً همان مقداری که مدل خروجی داده نشان داده می‌شود. ${checks.some((c) => c.proven)
          ? 'هرجا که شرط برقرار باشد و خط مبنا را شکست دهد، سابقه زنده از نمایش جهت در آنجا حمایت می‌کند.'
          : `هیچ تایم‌فریمی در اینجا نتوانسته ${LIVE_PROOF_NATS} را با شکست دادن خط مبنا کسب کند، بنابراین سابقه زنده با غیرفعال کردن جهت در مواردی که تست انتشار جهتی نیافته است، هم‌راستاست.`}</p>
      </div>` : ''}

      ${actionRows.length ? `<div class="ap-card mt">
        <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px;flex-wrap:wrap"><h3 style="margin:0;font-size:1.15rem;color:#fff">عملکرد هر نوع سیگنال</h3><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.85rem">برچسب سایت در مقایسه با عملکرد واقعی قیمت</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">سیگنال</th><th>تعداد ثبت‌شده</th><th>تشخیص صحیح جهت</th><th>رشد واقعی قیمت</th><th>میانگین نتیجه طرح</th></tr></thead><tbody>
        ${actionRows.map(([a, e]) => `<tr style="cursor:default">
          <td class="l"><span class="chip ${toneOf(a)}" style="padding:4px 10px;border-radius:8px;font-size:0.8rem">${esc(readable(a))}</span></td>
          <td>${e.n}</td>
          <td>${rate(e.hit, e.n).toFixed(0)}٪</td>
          <td class="${rate(e.rose, e.n) >= 50 ? 'up' : 'down'}">${rate(e.rose, e.n).toFixed(0)}٪</td>
          <td class="${e.retN && e.ret / e.retN > 0 ? 'up' : e.retN ? 'down' : ''}">${e.retN ? pct(e.ret / e.retN) : '—'}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="fine mt" style="color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.6;margin:12px 0 0">ستون «رشد واقعی قیمت» را در برابر قدرت سیگنال بررسی کنید. اگر قوی‌ترین برچسب بهترین ردیف ستون نباشد، امتیاز بالاتر به معنای سیگنال بهتر نیست.</p>
      </div>` : ''}

      ${symRows.length ? `<div class="ap-card mt"><div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px;flex-wrap:wrap"><h3 style="margin:0;font-size:1.15rem;color:#fff">بر اساس رمزارز</h3><span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.85rem">رمزارزهای دارای ۵ پیش‌بینی تعیین‌تکلیف‌شده یا بیشتر</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">رمزارز</th><th>تعیین‌تکلیف‌شده</th><th>صحیح</th><th>دقت</th></tr></thead><tbody>
        ${symRows.map(([s, e]) => `<tr data-sym="${esc(s)}" style="cursor:pointer"><td class="l"><a class="ap-coin-link" href="#/coin/${encodeURIComponent(s)}">${esc(s)}</a></td><td>${e.n}</td><td>${e.hit}</td><td class="${rate(e.hit, e.n) >= 55 ? 'up' : rate(e.hit, e.n) < 45 ? 'down' : ''}"><b>${rate(e.hit, e.n).toFixed(0)}٪</b></td></tr>`).join('')}
        </tbody></table></div></div>` : ''}

      <div class="ap-card mt">
        <div class="ap-track-toolbar">
          <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:0">
            <h3 style="margin:0;font-size:1.15rem;color:#fff">سیگنال‌های اخیر</h3>
            <span class="fine" style="color:rgba(255,255,255,0.5);font-size:0.85rem">${rowsCapped ? '۱۰۰۰ مورد اخیر از ' : ''}${filtered.length} مورد${interval === 'all' ? '' : ` روی ${interval}`}${symQuery ? ` · فیلتر ${esc(symQuery)}` : ''}${rowsCapped ? ` · سقف خوانش ${ROW_CAP}` : ''}</span>
          </div>
          <input type="search" class="ap-track-filter" id="symFilter" value="${esc(symbolFilter)}" placeholder="فیلتر نماد (مثلاً BTC)…" aria-label="فیلتر بر اساس نماد رمزارز">
        </div>
        ${filtered.length ? `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">زمان ثبت</th><th class="l">رمزارز</th><th>تایم‌فریم</th><th class="l">سیگنال</th><th>قیمت زمان ثبت</th><th>احتمال رشد هوش مصنوعی</th><th>قیمت بعدی</th><th>جهت‌گیری</th><th class="hide-m">طرح معامله</th></tr></thead><tbody>
          ${filtered.slice(0, recentLimit).map((r) => {
            const ts = safeTimestamp(r.candle_time);
            return `<tr data-sym="${esc(r.symbol)}" style="cursor:pointer">
              <td class="l fine" style="color:rgba(255,255,255,0.4)">${ts ? dateTime(ts) : '—'}</td>
              <td class="l"><a class="ap-coin-link" href="#/coin/${encodeURIComponent(r.symbol)}">${esc(r.symbol)}</a></td>
              <td class="fine" style="color:rgba(255,255,255,0.6)">${esc(r.interval)}</td>
              <td class="l"><span class="chip ${toneOf(r.action)}" style="padding:4px 10px;border-radius:8px;font-size:0.8rem">${esc(readable(r.action))}</span></td>
              <td>${money(r.price)}</td>
              <td class="${!(TESTED_ACCURACY.directionTrust[r.interval] > 0) ? 'muted' : r.prob_up >= 0.54 ? 'up' : r.prob_up <= 0.46 ? 'down' : ''}">${r.prob_up === null ? '—' : `${(r.prob_up * 100).toFixed(0)}٪`}</td>
              <td>${r.resolved ? money(r.outcome_price) : '<span class="fine muted">باز</span>'}</td>
              <td>${r.forecast_correct === null ? '—' : r.forecast_correct ? '<span class="up">✓ درست</span>' : '<span class="down">✕ نادرست</span>'}</td>
              <td class="hide-m">${r.plan_result && r.plan_result !== 'none' ? `<span class="${PLAN_WIN.has(r.plan_result) ? 'up' : PLAN_LOSS.has(r.plan_result) ? 'down' : 'muted'}">${esc(PLAN_WORDS[r.plan_result] || r.plan_result)}${r.plan_return_pct === null ? '' : ` ${pct(+r.plan_return_pct)}`}</span>` : '<span class="fine muted">—</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody></table></div>
        ${filtered.length > recentLimit ? `<div class="row" style="justify-content:center;margin-top:16px"><button type="button" class="btn" id="moreRecent" style="padding:8px 20px;border-radius:12px;cursor:pointer">نمایش ۲۰۰ مورد بیشتر (${filtered.length - recentLimit} باقی‌مانده)</button></div>` : ''}`
        : `<div class="empty" style="text-align:center;padding:30px;color:rgba(255,255,255,0.5)">${icon('info', 20)}<p style="margin-top:8px">${symQuery ? 'سیگنالی با این فیلتر یافت نشد.' : 'هنوز سیگنالی ثبت نشده است. سرور هر ۱۵ دقیقه یک دسته جدید ثبت می‌کند.'}</p></div>`}
      </div>`;

    const filterInput = $('#symFilter', el);
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        symbolFilter = e.target.value;
        recentLimit = 200;
        draw();
        const nextInp = $('#symFilter', el);
        if (nextInp) {
          nextInp.focus();
          nextInp.setSelectionRange(nextInp.value.length, nextInp.value.length);
        }
      });
    }

    $('#moreRecent', el)?.addEventListener('click', () => {
      recentLimit += 200;
      draw();
    });

    $$('tr[data-sym]', el).forEach((tr) => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        location.hash = `#/coin/${tr.dataset.sym}`;
      });
    });
  };

  bindSeg($('#iv', el), (v) => {
    interval = v;
    recentLimit = 200;
    $$('#iv button', el).forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.v === v));
    });
    draw();
  });

  await loadRecordData();

  return () => {
    disposed = true;
    activeController?.abort();
  };
}