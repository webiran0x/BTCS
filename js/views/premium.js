// صفحه اشتراک ویژه و قیمت‌گذاری — طراحی مدرن ۲۰۲۶ اپل و بهینه‌سازی سئو.
import { $, icon, toast } from '../ui.js';
import { esc } from '../format.js';
import { auth, sb, isPremium, isAdmin, getAppSettings, cachedAppSettings, getPosts, callFn } from '../api/backend.js';
import { openAuth } from './auth.js';

export const title = 'اشتراک ویژه';

const FREE = [
  'قیمت‌های لحظه‌ای از ۱۰ صرافی شامل بایننس',
  'نمودارهای شمعی با ۱۲ اندیکاتور',
  'تحلیل‌های نمودار با منطقه ورود، حد ضرر و اهداف',
  'پیش‌بینی هوش مصنوعی در کنار مبنایی که باید آن را شکست دهد',
  'تاریخچه و چرخه‌ها: مقایسه الگوی گذشته',
  'همگام‌سازی سبد دارایی، کیف پول‌های فقط-تماشا و لیست پیگیری',
  '۳ هشدار قیمتی سمت سرور',
];

const PAID = [
  'همه امکانات نسخه رایگان',
  'تا ۵۰ هشدار سمت سرور (ایمیل + تلگرام)',
  'هشدارهای سیگنال ارسالی از طریق ایمیل و تلگرام در زمان بسته بودن مرورگر',
  'سوابق کامل به تفکیک هر ارز و خروجی CSV',
  'دسترسی اولویت‌دار به قابلیت‌های جدید',
];

function setMeta(nameOrProp, content, isProp = false) {
  if (!content) return;
  const attr = isProp ? 'property' : 'name';
  let tag = document.head.querySelector(`meta[${attr}="${nameOrProp}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, nameOrProp);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(url) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

function formatPriceUnit(currency) {
  const code = String(currency || 'IRT').toUpperCase();
  if (code === 'IRT' || code === 'IRR' || code === 'TOMAN') return 'تومان';
  if (code === 'USD') return '$';
  if (code === 'EUR') return '€';
  return code;
}

function syncSeo(priceNum, currency, periodDays) {
  const unit = formatPriceUnit(currency);
  const formattedPrice = Number(priceNum).toLocaleString('en-US');
  const pageTitle = `اشتراک ویژه BTCS | هشدارهای سرور، سیگنال‌ها و سوابق کامل`;
  const desc = `فعال‌سازی اشتراک ویژه BTCS (${formattedPrice} ${unit} برای ${periodDays} روز): تا ۵۰ هشدار سمت سرور در تلگرام و ایمیل، هشدار سیگنال‌ها و خروجی CSV.`;

  document.title = pageTitle;
  setMeta('description', desc);
  setMeta('og:title', pageTitle, true);
  setMeta('og:description', desc, true);
  setMeta('og:type', 'website', true);
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', pageTitle);
  setMeta('twitter:description', desc);

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const canonicalUrl = `${baseUrl}#/premium`;
  setCanonical(canonicalUrl);

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'بازارها', item: `${baseUrl}#/` },
          { '@type': 'ListItem', position: 2, name: 'اشتراک ویژه', item: canonicalUrl },
        ],
      },
      {
        '@type': 'Product',
        name: 'اشتراک ویژه BTCS',
        description: desc,
        brand: { '@type': 'Brand', name: 'BTCS' },
        offers: {
          '@type': 'Offer',
          price: String(Number(priceNum)),
          priceCurrency: String(currency || 'IRT').toUpperCase(),
          availability: 'https://schema.org/InStock',
          url: canonicalUrl,
        },
      },
    ],
  };

  let ld = document.getElementById('ld-premium-2026');
  if (!ld) {
    ld = document.createElement('script');
    ld.id = 'ld-premium-2026';
    ld.type = 'application/ld+json';
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify(schema);
}

export async function render(el) {
  await sb();
  let drawn = null;

  const draw = (settings, posts) => {
    const key = JSON.stringify([settings.premium || null, settings.site?.contact || null, posts]);
    if (key === drawn || (drawn !== null && !el.isConnected)) return;
    drawn = key;

    const p = settings.premium || { price: 599000, currency: 'IRT', period_days: 30, stripe_enabled: false };
    const site = settings.site || {};
    const already = isPremium();
    const adminUser = isAdmin();
    const ideas = (posts || []).filter((x) => x.kind === 'idea');

    const priceNum = Number(p.price ?? 599000);
    const periodDays = Number(p.period_days || 30);
    const currencyCode = String(p.currency || 'IRT').toUpperCase();
    const unitLabel = formatPriceUnit(currencyCode);
    const extraPerks = (p.perks || []).filter((x) => !PAID.includes(x));

    syncSeo(priceNum, currencyCode, periodDays);

    el.innerHTML = `
      <style>
        .ap26-pr-wrap {
          --pr-surface: rgba(22, 22, 26, 0.74);
          --pr-card: rgba(255, 255, 255, 0.035);
          --pr-card-hover: rgba(255, 255, 255, 0.06);
          --pr-line: rgba(255, 255, 255, 0.09);
          --pr-line-strong: rgba(255, 255, 255, 0.18);
          --pr-ink: #f5f5f7;
          --pr-sub: rgba(245, 245, 247, 0.68);
          --pr-muted: rgba(245, 245, 247, 0.44);
          --pr-green: #30d158;
          --pr-gold: #ffd60a;
          --pr-blue: #0a84ff;
          direction: rtl;
          text-align: right;
          max-width: 1220px;
          margin: 0 auto;
          padding: 8px 0 64px;
          color: var(--pr-ink);
          font-variant-numeric: tabular-nums;
        }
        .ap26-pr-hero {
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(640px circle at 90% 10%, rgba(255, 214, 10, 0.1), transparent 55%),
            radial-gradient(560px circle at 10% 90%, rgba(10, 132, 255, 0.12), transparent 55%),
            var(--pr-surface);
          border: 1px solid var(--pr-line);
          border-radius: 30px;
          padding: 32px 34px;
          backdrop-filter: blur(36px) saturate(180%);
          -webkit-backdrop-filter: blur(36px) saturate(180%);
          box-shadow: 0 28px 64px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.08);
          margin-bottom: 20px;
        }
        .ap26-pr-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 0.78rem;
          font-weight: 600;
          color: rgba(245, 245, 247, 0.76);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--pr-line);
          padding: 5px 12px;
          border-radius: 999px;
          margin-bottom: 12px;
        }
        .ap26-pr-h1 {
          font-size: clamp(1.65rem, 2.8vw, 2.25rem);
          font-weight: 700;
          letter-spacing: -0.025em;
          line-height: 1.22;
          margin: 0 0 8px 0;
        }
        .ap26-pr-sub {
          font-size: 0.98rem;
          line-height: 1.7;
          color: var(--pr-sub);
          margin: 0;
          max-width: 820px;
        }
        .ap26-pr-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
          padding: 18px 22px;
          border-radius: 22px;
          background: var(--pr-card);
          border: 1px solid var(--pr-line);
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
          margin-bottom: 20px;
        }
        .ap26-pr-banner.is-admin {
          border-color: rgba(10, 132, 255, 0.42);
          background: rgba(10, 132, 255, 0.07);
        }
        .ap26-pr-banner.is-active {
          border-color: rgba(48, 209, 88, 0.42);
          background: rgba(48, 209, 88, 0.07);
        }
        .ap26-pr-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
          margin-top: 8px;
        }
        @media (max-width: 820px) {
          .ap26-pr-grid { grid-template-columns: 1fr; }
          .ap26-pr-hero { padding: 24px 20px; border-radius: 24px; }
        }
        .ap26-pr-card {
          background: var(--pr-card);
          border: 1px solid var(--pr-line);
          border-radius: 26px;
          padding: 30px 28px;
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(26px) saturate(170%);
          -webkit-backdrop-filter: blur(26px) saturate(170%);
          transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .ap26-pr-card:hover {
          transform: translateY(-2px);
          border-color: var(--pr-line-strong);
          background: var(--pr-card-hover);
        }
        .ap26-pr-card.featured {
          position: relative;
          background:
            radial-gradient(420px circle at 85% 10%, rgba(255, 214, 10, 0.11), transparent 60%),
            rgba(28, 28, 34, 0.82);
          border-color: rgba(255, 214, 10, 0.34);
          box-shadow: 0 24px 54px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.12);
        }
        .ap26-pr-plan-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .ap26-pr-plan-top h2 {
          font-size: 1.45rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0;
        }
        .ap26-pr-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 0.76rem;
          font-weight: 600;
          background: rgba(255, 214, 10, 0.14);
          color: var(--pr-gold);
          border: 1px solid rgba(255, 214, 10, 0.28);
        }
        .ap26-pr-price {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 8px;
          margin: 18px 0 8px;
        }
        .ap26-pr-amount {
          font-size: 2.2rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.1;
        }
        .ap26-pr-unit {
          font-size: 1rem;
          font-weight: 600;
          color: var(--pr-sub);
        }
        .ap26-pr-period {
          font-size: 0.88rem;
          color: var(--pr-muted);
        }
        .ap26-pr-desc {
          font-size: 0.86rem;
          line-height: 1.65;
          color: var(--pr-sub);
          margin: 0;
        }
        .ap26-pr-list {
          list-style: none;
          padding: 0;
          margin: 22px 0 24px;
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          gap: 11px;
        }
        .ap26-pr-list li {
          position: relative;
          padding-right: 24px;
          font-size: 0.9rem;
          line-height: 1.55;
          color: rgba(245, 245, 247, 0.88);
        }
        .ap26-pr-list li::before {
          content: "✓";
          position: absolute;
          right: 0;
          top: 0;
          color: var(--pr-green);
          font-weight: 700;
        }
        .ap26-pr-cta {
          width: 100%;
          min-height: 46px;
          border-radius: 15px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: linear-gradient(180deg, #2997ff 0%, #0071e3 100%);
          color: #fff;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 8px 22px rgba(0, 113, 227, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.28);
          transition: transform 0.15s ease, filter 0.2s ease;
        }
        .ap26-pr-cta:hover {
          filter: brightness(1.07);
        }
        .ap26-pr-cta:active {
          transform: scale(0.985);
        }
        .ap26-pr-panel {
          background: var(--pr-card);
          border: 1px solid var(--pr-line);
          border-radius: 24px;
          padding: 24px 26px;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          margin-top: 20px;
        }
        .ap26-pr-panel h3 {
          margin: 0 0 10px 0;
          font-size: 1.15rem;
          font-weight: 700;
        }
        .ap26-pr-idea {
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .ltr-num {
          direction: ltr;
          unicode-bidi: isolate;
          display: inline-block;
        }
      </style>

      <section class="ap26-pr-wrap" aria-labelledby="premium-h1">
        <header class="ap26-pr-hero">
          <span class="ap26-pr-eyebrow">عضویت ویژه و زیرساخت لحظه‌ای</span>
          <h1 class="ap26-pr-h1" id="premium-h1">اشتراک ویژه</h1>
          <p class="ap26-pr-sub">تحلیل‌ها در هسته سیستم رایگان می‌مانند. اشتراک ویژه هزینه بخش‌هایی را تامین می‌کند که حتی در زمان بسته بودن مرورگر به‌صورت مداوم روی سرور اجرا می‌شوند؛ مانند هشدارهای قیمتی، ارسال سیگنال و پیگیری خودکار.</p>
        </header>

        ${adminUser
          ? `<div class="ap26-pr-banner is-admin" role="status">
               <div>
                 <h3 style="margin:0 0 4px 0;font-size:1.05rem">شما مالک این سایت هستید؛ اشتراک ویژه برای شما فعال و رایگان است</h3>
                 <p style="margin:0;font-size:0.85rem;color:var(--pr-sub)">حساب مدیریتی شما به‌صورت دائم به تمامی قابلیت‌های ویژه دسترسی دارد. این نما همان چیزی است که کاربران و بازدیدکنندگان مشاهده می‌کنند.</p>
               </div>
               <span class="chip warn">مدیر</span>
             </div>`
          : already
            ? `<div class="ap26-pr-banner is-active" role="status">
                 <div>
                   <h3 style="margin:0 0 4px 0;font-size:1.05rem">اشتراک ویژه روی حساب شما فعال است</h3>
                   <p style="margin:0;font-size:0.85rem;color:var(--pr-sub)">مدیریت وضعیت اشتراک از طریق <a href="#/account">صفحه حساب کاربری</a> امکان‌پذیر است.</p>
                 </div>
                 <span class="chip up">فعال</span>
               </div>`
            : ''}

        <div class="ap26-pr-grid">
          <article class="ap26-pr-card" aria-label="طرح رایگان">
            <div class="ap26-pr-plan-top">
              <h2>رایگان</h2>
            </div>
            <div class="ap26-pr-price">
              <span class="ap26-pr-amount"><span class="ltr-num">0</span></span>
              <span class="ap26-pr-unit">${esc(unitLabel)}</span>
            </div>
            <p class="ap26-pr-desc">همیشه رایگان؛ بدون نیاز به کارت بانکی یا ثبت‌نام اجباری برای ابزارهای پایه.</p>
            <ul class="ap26-pr-list">
              ${FREE.map((f) => `<li>${esc(f)}</li>`).join('')}
            </ul>
          </article>

          <article class="ap26-pr-card featured" aria-label="طرح اشتراک ویژه">
            <div class="ap26-pr-plan-top">
              <h2>اشتراک ویژه</h2>
              <span class="ap26-pr-pill">${icon('star', 12)} پیشنهاد ویژه</span>
            </div>
            <div class="ap26-pr-price">
              <span class="ap26-pr-amount"><span class="ltr-num">${esc(priceNum.toLocaleString('en-US'))}</span></span>
              <span class="ap26-pr-unit">${esc(unitLabel)}</span>
              <span class="ap26-pr-period">/ <span class="ltr-num">${esc(String(periodDays))}</span> روز</span>
            </div>
            <p class="ap26-pr-desc">پرداخت دوره‌ای شفاف بدون تمدید خودکار ناخواسته؛ هر زمان که بخواهید تمدید کنید.</p>
            <ul class="ap26-pr-list">
              ${PAID.map((f) => `<li>${esc(f)}</li>`).join('')}
              ${extraPerks.map((f) => `<li>${esc(f)}</li>`).join('')}
            </ul>
            <div>
              <button type="button" class="ap26-pr-cta" id="buy">${already ? 'تمدید اشتراک ویژه' : 'خرید اشتراک ویژه'}</button>
              <p id="buyMsg" aria-live="polite" style="margin:10px 0 0;font-size:0.84rem;color:var(--pr-sub);min-height:20px"></p>
            </div>
          </article>
        </div>

        ${ideas.length ? `
          <article class="ap26-pr-panel" aria-label="آخرین ایده‌های معاملاتی">
            <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:14px">
              <h3 style="margin:0">آخرین ایده‌های معاملاتی</h3>
              <span style="font-size:0.82rem;color:var(--pr-muted)">${already ? 'جزئیات کامل باز است' : 'نقطه ورود، حد ضرر و اهداف ویژه اعضای اشتراک ویژه است'}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${ideas.map((i) => `
                <div class="ap26-pr-idea">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
                    <b>${esc(i.title)}</b>
                    <span class="chip ${i.side === 'long' ? 'up' : i.side === 'short' ? 'down' : ''}"><span class="ltr-num">${esc(i.symbol || '')} ${esc(i.side || '')}</span></span>
                  </div>
                  ${i.locked
                    ? '<p class="warn" style="margin:8px 0 0;font-size:0.83rem">🔒 استدلال، نقطه ورود، حد ضرر و اهداف فقط برای اعضای ویژه قابل مشاهده است.</p>'
                    : `<p style="margin:8px 0 0;font-size:0.84rem;line-height:1.65;color:var(--pr-sub)">${esc((i.body || '').slice(0, 220))}${(i.body || '').length > 220 ? '…' : ''}</p>
                       <p style="margin:6px 0 0;font-size:0.82rem;color:var(--pr-muted)">ورود <span class="ltr-num">${esc(String(i.entry ?? '—'))}</span> · حد ضرر <span class="ltr-num">${esc(String(i.stop_loss ?? '—'))}</span> · اهداف <span class="ltr-num">${esc((i.targets || []).join(', ') || '—')}</span></p>`}
                </div>`).join('')}
            </div>
          </article>` : ''}

        <article class="ap26-pr-panel" aria-label="شفافیت و حدود مسئولیت">
          <h3>اشتراک ویژه چه چیزی نیست</h3>
          <p style="margin:0;font-size:0.86rem;line-height:1.75;color:var(--pr-sub)">این اشتراک تضمین سود، حساب مدیریت‌شده یا ربات معاملاتی خودکار نیست. <span class="ltr-num">${esc('BTCS')}</span> هیچ معامله‌ای انجام نمی‌دهد و هرگز کلید API صرافی، کلید خصوصی یا عبارت بازیابی (<span class="ltr-num">Seed</span>) را درخواست نمی‌کند. سیگنال‌ها و پیش‌بینی‌ها برآوردهایی از داده‌های عمومی بازار هستند و دقت اندازه‌گیری‌شده در صفحه <a href="#/track">سوابق</a> منتشر شده است؛ پیش از خرید، جزئیات و سوابق را بررسی کنید.</p>
          ${site.contact ? `<p style="margin:10px 0 0;font-size:0.84rem;color:var(--pr-sub)">ارتباط و پشتیبانی: <b class="ltr-num">${esc(site.contact)}</b></p>` : ''}
        </article>
      </section>`;

    $('#buy', el)?.addEventListener('click', async () => {
      if (!auth.user) {
        openAuth('up');
        return;
      }
      const msg = $('#buyMsg', el);
      if (!p.stripe_enabled) {
        if (msg) {
          msg.textContent = p.manual_payment_text || 'پرداخت کارت در حال حاضر فعال نیست؛ برای فعال‌سازی اشتراک ویژه با پشتیبانی تماس بگیرید.';
        }
        return;
      }
      if (msg) msg.textContent = 'در حال انتقال به درگاه پرداخت امن…';
      try {
        const r = await callFn('account', { action: 'checkout', return_url: location.href });
        location.href = r.url;
      } catch (e) {
        if (msg) msg.textContent = e.message;
        toast(e.message, 'down');
      }
    });
  };

  draw(cachedAppSettings() || {}, []);
  Promise.all([getAppSettings().catch(() => cachedAppSettings() || {}), getPosts(6).catch(() => [])])
    .then(([settings, posts]) => draw(settings, posts));
}