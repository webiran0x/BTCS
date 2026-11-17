// Premium / pricing page. Card checkout via Stripe when the admin has enabled it,
// otherwise the manual payment instructions the admin set.
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
    const ideas = posts.filter((x) => x.kind === 'idea');

    el.innerHTML = `
      <div class="page-head" dir="rtl"><div><h1>اشتراک ویژه</h1><p>تحلیل‌ها رایگان می‌مانند. اشتراک ویژه هزینه بخش‌هایی را پرداخت می‌کند که در زمان بسته بودن مرورگر روی سرور اجرا می‌شوند — مانند هشدارها و پیگیری.</p></div></div>

      ${isAdmin()
        ? '<div class="card" style="border-color:var(--accent)" dir="rtl"><div class="row spread"><div><h3>شما مالک این سایت هستید — اشتراک ویژه برای شما رایگان است</h3><p class="fine">حساب مدیریتی شما به صورت دائم و رایگان به تمامی قابلیت‌های ویژه دسترسی دارد. این صفحه همان چیزی است که بازدیدکنندگان شما می‌بینند.</p></div><span class="chip warn">مدیر</span></div></div>'
        : already ? '<div class="card" style="border-color:var(--up)" dir="rtl"><div class="row spread"><div><h3>اشتراک ویژه روی حساب شما فعال است</h3><p class="fine">آن را در <a href="#/account">صفحه حساب کاربری</a> مدیریت کنید.</p></div><span class="chip up">فعال</span></div></div>' : ''}

      <!-- طراحی مدرن به سبک اپل (Apple-style Pricing Cards) -->
      <style>
        .apple-pricing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          margin-top: 24px;
        }
        .apple-plan-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 32px;
          display: flex;
          flex-direction: column;
          position: relative;
          backdrop-filter: blur(20px);
          transition: transform 0.3s ease, border-color 0.3s ease;
        }
        .apple-plan-card:hover {
          border-color: rgba(255, 255, 255, 0.2);
        }
        .apple-plan-card.featured {
          background: linear-gradient(135deg, rgba(30, 30, 35, 0.6) 0%, rgba(20, 20, 25, 0.8) 100%);
          border: 1px solid rgba(212, 175, 55, 0.3); /* حاشیه طلایی ملایم یا رنگ اکدنت */
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }
        .apple-plan-card h2 {
          font-size: 1.5rem;
          font-weight: 600;
          letter-spacing: -0.015em;
          margin-bottom: 8px;
        }
        .apple-amount {
          font-size: 2.25rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          margin: 16px 0 8px 0;
          display: flex;
          align-baseline: baseline;
          gap: 6px;
        }
        .apple-amount .currency-unit {
          font-size: 1.1rem;
          font-weight: 500;
          color: var(--muted, #8e8e93);
        }
        .apple-amount .period {
          font-size: 0.9rem;
          font-weight: 400;
          color: var(--muted, #8e8e93);
        }
        .apple-features {
          list-style: none;
          padding: 0;
          margin: 24px 0;
          flex-grow: 1;
        }
        .apple-features li {
          position: relative;
          padding-right: 24px;
          margin-bottom: 12px;
          font-size: 0.925rem;
          color: rgba(255, 255, 255, 0.85);
          line-height: 1.5;
        }
        .apple-features li::before {
          content: "✓";
          position: absolute;
          right: 0;
          color: #34c759; /* سبز اپلی ملایم */
          font-weight: bold;
        }
      </style>

      <div class="apple-pricing-grid" dir="rtl">
        <!-- کارت رایگان -->
        <div class="apple-plan-card">
          <h2>رایگان</h2>
          <div class="apple-amount">
            <span>۰</span> <span class="currency-unit">تومان</span>
          </div>
          <p class="fine">برای همیشه. بدون نیاز به کارت بانکی یا ثبت‌نام برای مرور.</p>
          <ul class="apple-features">${FREE.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        </div>

        <!-- کارت ویژه (محبوب‌ترین) -->
        <div class="apple-plan-card featured">
          <div class="row spread">
            <h2>اشتراک ویژه</h2>
            <span class="chip warn" style="background: rgba(212, 175, 55, 0.15); color: #ffd700; border-radius: 20px; padding: 4px 12px;">${icon('star', 12)} محبوب‌ترین</span>
          </div>
          <div class="apple-amount">
            <span>${esc(Number(p.price ?? 599000).toLocaleString('en-US'))}</span> 
            <span class="currency-unit">تومان</span> 
            <span class="period">/ ${esc(String(p.period_days || 30))} روز</span>
          </div>
          <p class="fine">پرداخت یک‌باره، بدون تمدید خودکار. هر زمان که خواستید تمدید کنید.</p>
          <ul class="apple-features">${PAID.map((f) => `<li>${esc(f)}</li>`).join('')}${(p.perks || []).filter((x) => !PAID.includes(x)).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
          <div class="stack mt" style="gap:12px">
            <button class="btn primary" id="buy" style="border-radius: 14px; padding: 12px 20px; font-weight: 600;">${already ? 'تمدید اشتراک ویژه' : 'خرید اشتراک ویژه'}</button>
            <p class="fine" id="buyMsg"></p>
          </div>
        </div>
      </div>

      ${ideas.length ? `<div class="card mt" dir="rtl"><div class="card-h"><h3>آخرین ایده‌های معاملاتی</h3><span class="fine">${already ? 'جزئیات کامل باز شد' : 'نقطه ورود، حد ضرر و اهداف مخصوص اعضای ویژه است'}</span></div>
        <div class="stack" style="gap:10px">${ideas.map((i) => `
          <div style="padding:12px;border-radius:14px;background:var(--surface-2)">
            <div class="row spread"><b>${esc(i.title)}</b><span class="chip ${i.side === 'long' ? 'up' : i.side === 'short' ? 'down' : ''}">${esc(i.symbol || '')} ${esc(i.side || '')}</span></div>
            ${i.locked
              ? '<p class="fine warn" style="margin:6px 0 0">🔒 استدلال، نقطه ورود، حد ضرر و اهداف فقط برای اعضای ویژه است.</p>'
              : `<p class="fine" style="margin:6px 0 0">${esc((i.body || '').slice(0, 220))}${(i.body || '').length > 220 ? '…' : ''}</p>
                 <p class="fine" style="margin:6px 0 0">ورود ${esc(String(i.entry ?? '—'))} · حد ضرر ${esc(String(i.stop_loss ?? '—'))} · اهداف ${esc((i.targets || []).join(', ') || '—')}</p>`}
          </div>`).join('')}</div></div>` : ''}

      <div class="card mt" dir="rtl" style="border-radius: 20px;">
        <h3>اشتراک ویژه چه چیزی نیست</h3>
        <p class="fine">این یک تضمین، حساب مدیریت‌شده یا ربات معاملاتی نیست. ${esc('BTCS')} هرگز معامله‌ای انجام نمی‌دهد و هرگز کلیدهای API صرافی، کلیدهای خصوصی یا عبارات بازیابی (Seed) را درخواست نمی‌کند. سیگنال‌ها و پیش‌بینی‌ها برآوردهایی از داده‌های عمومی بازار هستند و دقت اندازه‌گیری‌شده در صفحه <a href="#/track">سوابق</a> منتشر شده است — قبل از پرداخت هر هزینه‌ای آن را مطالعه کنید.</p>
        ${site.contact ? `<p class="fine">سؤالات: <b>${esc(site.contact)}</b></p>` : ''}
      </div>`;

    $('#buy', el).addEventListener('click', async () => {
      if (!auth.user) { openAuth('up'); return; }
      const msg = $('#buyMsg', el);
      if (!p.stripe_enabled) {
        msg.innerHTML = esc(p.manual_payment_text || 'پرداخت با کارت هنوز فعال نشده است — برای فعال‌سازی دستی اشتراک ویژه با مالک سایت تماس بگیرید.');
        return;
      }
      msg.textContent = 'در حال باز کردن درگاه پرداخت امن...';
      try {
        const r = await callFn('account', { action: 'checkout', return_url: location.href });
        location.href = r.url;
      } catch (e) { msg.textContent = e.message; toast(e.message, 'down'); }
    });
  };
  draw(cachedAppSettings() || {}, []);
  Promise.all([getAppSettings().catch(() => cachedAppSettings() || {}), getPosts(6).catch(() => [])])
    .then(([settings, posts]) => draw(settings, posts));
}
