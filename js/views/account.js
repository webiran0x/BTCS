// صفحه حساب کاربری: پروفایل، کانال‌های هشدار (ایمیل + تلگرام)، وضعیت اشتراک ویژه، داده‌ها، امنیت و فعالیت‌ها.
import { $, $$, icon, toast, modal } from '../ui.js';
import { esc, money, safeUrl, dateTime, pct, ago } from '../format.js';
import { load, settings } from '../store.js';
import { myActivity, myForecasts, forecastScore, resolveDueForecasts, clearMyActivity } from '../api/activity.js';
import { changePassword, signOutEverywhere } from '../api/security.js';
import { findCoin, closeAtTime } from '../api/market.js';
import { auth, sb, isPremium, isAdmin, callFn, updateProfile, refreshProfile, signOut } from '../api/backend.js';
import { CONFIG } from '../config.js';
import { openAuth } from './auth.js';

export const title = 'حساب کاربری';

const APP_NAME = CONFIG.APP_NAME || 'BTCS';
const PAGE_TITLE = `حساب کاربری | ${APP_NAME}`;
const PAGE_DESC = `مدیریت پروفایل، اشتراک ویژه، هشدارهای ایمیلی و تلگرامی، امنیت نشست‌ها، سوابق پیش‌بینی و خروجی داده‌ها در ${APP_NAME}.`;

const STYLES = `
  <style>
    .ap26-ac-wrap {
      --ac-surface: rgba(22, 22, 26, 0.74);
      --ac-card: rgba(255, 255, 255, 0.035);
      --ac-card-hover: rgba(255, 255, 255, 0.055);
      --ac-line: rgba(255, 255, 255, 0.09);
      --ac-line-strong: rgba(255, 255, 255, 0.18);
      --ac-ink: #f5f5f7;
      --ac-sub: rgba(245, 245, 247, 0.68);
      --ac-muted: rgba(245, 245, 247, 0.44);
      --ac-gold: #ffd60a;
      --ac-green: #30d158;
      --ac-blue: #0a84ff;
      --ac-red: #ff6961;
      direction: rtl;
      text-align: right;
      max-width: 1120px;
      width: 100%;
      box-sizing: border-box;
      margin: 0 auto;
      padding: 8px 0 64px;
      color: var(--ac-ink);
      font-variant-numeric: tabular-nums;
      overflow-x: clip;
    }
    .ap26-ac-wrap *,
    .ap26-ac-wrap *::before,
    .ap26-ac-wrap *::after {
      box-sizing: border-box;
      min-width: 0;
    }
    .ap26-ac-hero {
      position: relative;
      overflow: hidden;
      border-radius: 28px;
      padding: 26px 28px;
      background:
        radial-gradient(600px circle at 92% 10%, rgba(255, 214, 10, 0.11), transparent 55%),
        radial-gradient(520px circle at 10% 90%, rgba(10, 132, 255, 0.12), transparent 55%),
        var(--ac-surface);
      border: 1px solid var(--ac-line);
      box-shadow: 0 24px 56px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(32px) saturate(180%);
      -webkit-backdrop-filter: blur(32px) saturate(180%);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }
    .ap26-ac-h1 {
      margin: 0 0 6px;
      font-size: clamp(1.45rem, 2.5vw, 1.95rem);
      font-weight: 700;
      letter-spacing: -0.025em;
      line-height: 1.25;
    }
    .ap26-ac-sub {
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.65;
      color: var(--ac-sub);
    }
    .ap26-ac-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .ap26-ac-span-2 {
      grid-column: 1 / -1;
    }
    .ap26-ac-card {
      width: 100%;
      max-width: 100%;
      border-radius: 24px;
      padding: 22px 24px;
      background: var(--ac-card);
      border: 1px solid var(--ac-line);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(24px) saturate(170%);
      -webkit-backdrop-filter: blur(24px);
      transition: border-color 0.2s ease, background 0.2s ease;
    }
    .ap26-ac-card:hover {
      border-color: var(--ac-line-strong);
      background: var(--ac-card-hover);
    }
    .ap26-ac-card h2,
    .ap26-ac-card h3 {
      margin: 0 0 12px;
      font-size: 1.08rem;
      font-weight: 700;
      letter-spacing: -0.015em;
      color: var(--ac-ink);
    }
    .ap26-ac-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 12px;
    }
    .ap26-ac-head h2,
    .ap26-ac-head h3 {
      margin: 0;
    }
    .ap26-ac-inline-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .ap26-ac-check {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 0.88rem;
      line-height: 1.65;
      color: var(--ac-sub);
      cursor: pointer;
    }
    .ap26-ac-check input[type="checkbox"] {
      margin-top: 4px;
      flex-shrink: 0;
    }
    .ap26-ac-break {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .ap26-ac-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }
    .ap26-ac-stat {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 18px;
      padding: 14px 16px;
    }
    .ap26-ac-stat .k {
      display: block;
      font-size: 0.76rem;
      color: var(--ac-muted);
    }
    .ap26-ac-stat .v {
      display: block;
      font-size: 1.25rem;
      font-weight: 700;
      margin: 6px 0 3px;
    }
    .ap26-ac-stat .s {
      display: block;
      font-size: 0.74rem;
      color: var(--ac-muted);
      line-height: 1.45;
    }
    .ap26-ac-tbl-wrap {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: 14px;
      margin-top: 8px;
    }
    .ap26-ac-empty {
      max-width: 620px;
      width: 100%;
      margin: 28px auto;
      text-align: center;
      padding: 34px 24px;
      border-radius: 28px;
      background:
        radial-gradient(500px circle at 50% 0%, rgba(255, 214, 10, 0.11), transparent 65%),
        var(--ac-surface);
      border: 1px solid var(--ac-line);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
    }
    .ap26-ac-empty h1 {
      margin: 0 0 10px;
      font-size: clamp(1.35rem, 2.4vw, 1.7rem);
      font-weight: 700;
    }
    .ap26-ac-empty p {
      margin: 0 auto 22px;
      max-width: 50ch;
      font-size: 0.92rem;
      line-height: 1.8;
      color: var(--ac-sub);
    }
    .ap26-ac-danger {
      color: var(--ac-red);
      border-color: rgba(255, 105, 97, 0.36);
    }
    .ltr-num {
      direction: ltr;
      unicode-bidi: isolate;
      display: inline-block;
    }
    @media (max-width: 900px) {
      .ap26-ac-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 820px) {
      .ap26-ac-grid {
        grid-template-columns: 1fr;
        gap: 14px;
      }
      .ap26-ac-hero,
      .ap26-ac-card {
        padding: 18px 16px;
        border-radius: 20px;
      }
      .ap26-ac-hero > button {
        width: 100%;
        justify-content: center;
      }
    }
    @media (max-width: 480px) {
      .ap26-ac-stats {
        grid-template-columns: 1fr;
      }
      .ap26-ac-inline-row .btn {
        flex: 1 1 auto;
        justify-content: center;
      }
    }
  </style>
`;

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

function syncSeoMeta() {
  document.title = PAGE_TITLE;
  setMeta('description', PAGE_DESC);
  setMeta('og:title', PAGE_TITLE, true);
  setMeta('og:description', PAGE_DESC, true);
  setMeta('og:type', 'website', true);
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', PAGE_TITLE);
  setMeta('twitter:description', PAGE_DESC);

  const baseUrl = `${location.origin}${location.pathname}`;
  const canonicalUrl = `${baseUrl}#/account`;
  setCanonical(canonicalUrl);

  let ldEl = document.getElementById('ld-account-page');
  if (!ldEl) {
    ldEl = document.createElement('script');
    ldEl.type = 'application/ld+json';
    ldEl.id = 'ld-account-page';
    document.head.appendChild(ldEl);
  }

  ldEl.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: PAGE_TITLE,
        description: PAGE_DESC,
        inLanguage: 'fa-IR',
        url: canonicalUrl,
        isPartOf: {
          '@type': 'WebSite',
          name: APP_NAME,
          url: baseUrl,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: APP_NAME, item: `${baseUrl}#/` },
          { '@type': 'ListItem', position: 2, name: title, item: canonicalUrl },
        ],
      },
    ],
  });
}

function cleanupSeoMeta() {
  document.getElementById('ld-account-page')?.remove();
}

export async function render(el, [flag]) {
  syncSeoMeta();
  await sb();

  if (!auth.user) {
    el.innerHTML = `
      ${STYLES}
      <section class="ap26-ac-empty" aria-labelledby="acGuestTitle">
        <h1 id="acGuestTitle">شما وارد حساب کاربری خود نشده‌اید</h1>
        <p>حساب کاربری لیست پیگیری، سبد دارایی، معاملات و هشدارهای شما را در تمامی دستگاه‌ها همگام‌سازی می‌کند و به شما امکان می‌دهد حتی در زمان بسته بودن مرورگر، هشدارها را از طریق ایمیل یا تلگرام دریافت کنید.</p>
        <button class="btn primary" id="si" type="button">ورود یا ایجاد حساب کاربری</button>
      </section>
    `;
    $('#si', el)?.addEventListener('click', () => openAuth('up'));
    return cleanupSeoMeta;
  }

  if (flag === '?paid=1' || location.hash.includes('paid=1')) {
    await refreshProfile();
    toast('پرداخت دریافت شد؛ اشتراک ویژه فعال است. سپاسگزاریم!', 'up', 7000);
  }

  const p = auth.profile || {};
  const premium = isPremium();
  const emailStatus = await callFn('account', { action: 'email-status' }).catch(() => ({ emailEnabled: false }));

  el.innerHTML = `
    ${STYLES}
    <div class="ap26-ac-wrap">
      <header class="ap26-ac-hero">
        <div class="ap26-ac-break">
          <h1 class="ap26-ac-h1">حساب کاربری</h1>
          <p class="ap26-ac-sub">وارد شده با ایمیل <b dir="ltr">${esc(auth.user.email)}</b>${p.is_admin ? ' · <span class="chip warn">مدیر</span>' : ''}</p>
        </div>
        <button class="btn ghost" id="out" type="button">خروج از حساب</button>
      </header>

      <div class="ap26-ac-grid">
        <section class="ap26-ac-card" aria-labelledby="sec-profile">
          <h2 id="sec-profile">پروفایل</h2>
          <form class="stack" style="gap:12px" id="pf">
            <label class="fld">نام نمایشی<input class="inp" name="display_name" maxlength="60" value="${esc(p.display_name || '')}"></label>
            <label class="fld">ایمیل<input class="inp" dir="ltr" value="${esc(p.email || auth.user.email)}" disabled></label>
            <button class="btn" type="submit">ذخیره پروفایل</button>
          </form>
          <p class="fine" style="margin-top:12px">عضو از تاریخ <span class="ltr-num">${p.created_at ? new Date(p.created_at).toLocaleDateString('fa-IR') : '—'}</span>.</p>
        </section>

        <section class="ap26-ac-card" aria-labelledby="sec-plan">
          <h2 id="sec-plan">${premium ? 'اشتراک ویژه' : 'طرح فعلی'}</h2>
          ${premium
            ? `<p><span class="chip ${isAdmin() ? 'warn' : 'up'}">${isAdmin() ? 'مالک — اشتراک ویژه رایگان و دائمی' : 'اشتراک ویژه فعال'}</span></p>
               <p class="fine" style="line-height:1.7">${isAdmin()
                 ? 'شما مالک این سایت هستید؛ بنابراین تمامی قابلیت‌های ویژه بدون هزینه و به‌صورت دائمی برای شما فعال است.'
                 : p.premium_until
                   ? `اعتبار تا <b class="ltr-num">${new Date(p.premium_until).toLocaleDateString('fa-IR')}</b> — <span class="ltr-num">${Math.max(0, Math.ceil((new Date(p.premium_until) - Date.now()) / 864e5))}</span> روز باقی مانده.`
                   : 'دسترسی مادام‌العمر.'}</p>
               <ul class="feat">
                 <li>تا <span class="ltr-num">50</span> هشدار فعال سمت سرور</li>
                 <li>ارسال از طریق تلگرام و ایمیل</li>
                 <li>هشدارهای سیگنال حتی در زمان بسته بودن مرورگر</li>
                 <li>سوابق کامل به تفکیک هر ارز و خروجی <span dir="ltr">CSV</span></li>
               </ul>`
            : `<p class="fine" style="line-height:1.7">شما در طرح <b>رایگان</b> هستید: قیمت‌های لحظه‌ای، نمودارها، سیگنال‌ها، پیش‌بینی‌ها، مقایسه تاریخچه و <span class="ltr-num">3</span> اعلان سمت سرور.</p>
               <div class="ap26-ac-inline-row"><a class="btn primary" href="#/premium">${icon('star', 16)} مشاهده اشتراک ویژه</a></div>`}
        </section>

        <section class="ap26-ac-card" aria-labelledby="sec-email">
          <h2 id="sec-email">هشدارهای ایمیلی</h2>
          <div id="emailBox"></div>
        </section>

        <section class="ap26-ac-card" aria-labelledby="sec-tg">
          <h2 id="sec-tg">هشدارهای تلگرامی</h2>
          <div id="tgBox"></div>
        </section>

        <section class="ap26-ac-card ap26-ac-span-2" aria-labelledby="sec-digest">
          <h2 id="sec-digest">خلاصه روزانه لیست پیگیری</h2>
          <label class="ap26-ac-check">
            <input type="checkbox" id="dg" ${settings.get().digest !== false ? 'checked' : ''}>
            <span>ارسال خلاصه کوتاهی از لیست پیگیری هر روز صبح (<span class="ltr-num">08:00 UTC</span>) از طریق تلگرام یا ایمیل</span>
          </label>
          <p class="fine" style="margin-top:8px">این خلاصه به هر کانال فعالی که در بخش‌های بالا متصل کرده باشید ارسال می‌شود. برای توقف، تیک آن را بردارید.</p>
        </section>

        <section class="ap26-ac-card ap26-ac-span-2" aria-labelledby="sec-activity">
          <div class="ap26-ac-head">
            <h2 id="sec-activity">فعالیت‌های شما</h2>
            <button class="btn sm ghost" id="clearAct" type="button">پاک کردن تاریخچه</button>
          </div>
          <div id="activityBox" aria-live="polite">در حال بارگذاری…</div>
        </section>

        <section class="ap26-ac-card" aria-labelledby="sec-data">
          <h2 id="sec-data">داده‌های شما</h2>
          <p class="fine" style="line-height:1.7">لیست پیگیری، دارایی‌ها، آدرس‌های کیف پول فقط-تماشا و ترسیم‌های نمودار شما با حساب کاربری‌تان همگام‌سازی می‌شوند. محاسبات قیمت، سیگنال و پیش‌بینی در مرورگر شما انجام می‌شود و ما هرگز به آن‌ها دسترسی نداریم.</p>
          <div class="ap26-ac-inline-row">
            <button class="btn sm" id="export" type="button">دانلود داده‌های من (<span dir="ltr">JSON</span>)</button>
            <button class="btn sm" id="test" type="button">ارسال هشدار تستی</button>
          </div>
        </section>

        <section class="ap26-ac-card" aria-labelledby="sec-danger">
          <h2 id="sec-danger">منطقه خطر</h2>
          <p class="fine" style="line-height:1.7">حذف حساب کاربری، پروفایل، داده‌های همگام‌سازی‌شده و هشدارها را به‌صورت دائمی پاک می‌کند. داده‌های محلی روی این دستگاه تا زمان پاکسازی باقی می‌مانند.</p>
          <div class="ap26-ac-inline-row">
            <button class="btn sm ghost ap26-ac-danger" id="del" type="button">حذف حساب کاربری من</button>
          </div>
        </section>

        <section class="ap26-ac-card ap26-ac-span-2" aria-labelledby="sec-security">
          <div class="ap26-ac-head"><h2 id="sec-security">امنیت</h2></div>
          <div id="secBox">در حال بارگذاری…</div>
        </section>
      </div>
    </div>`;

  // ---------------------------------------------------------------- profile
  $('#pf', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateProfile({ display_name: e.target.display_name.value.trim().slice(0, 60) });
    toast('پروفایل ذخیره شد.', 'up');
  });
  $('#out', el)?.addEventListener('click', async () => {
    await signOut();
    location.hash = '#/';
  });

  $('#dg', el)?.addEventListener('change', (e) => {
    settings.set({ digest: e.target.checked });
    toast(e.target.checked ? 'خلاصه روزانه فعال شد.' : 'خلاصه روزانه غیرفعال شد.', 'info');
  });

  // ---------------------------------------------------------------- e-mail alerts
  const paintEmail = () => {
    const pr = auth.profile || {};
    const box = $('#emailBox', el);
    if (!box) return;
    if (!emailStatus.emailEnabled) {
      box.innerHTML = '<p class="fine" style="line-height:1.7">ارسال ایمیل هنوز در این سایت پیکربندی نشده است؛ بنابراین هشدارها فقط در مرورگر نمایش داده می‌شوند. تلگرام به‌صورت مستقل کار می‌کند.</p>';
      return;
    }
    box.innerHTML = pr.email_verified
      ? `<p><span class="chip up">ایمیل تایید شد</span></p>
         <label class="ap26-ac-check ap26-ac-inline-row">
           <input type="checkbox" id="ea" ${pr.email_alerts ? 'checked' : ''}>
           <span>ارسال هشدارهای قیمتی به <b class="ap26-ac-break" dir="ltr">${esc(pr.email)}</b></span>
         </label>`
      : `<p class="fine" style="line-height:1.7">ایمیل خود را تایید کنید تا هنگام بسته بودن سایت، هشدارها به دست شما برسند.</p>
         <div class="ap26-ac-inline-row">
           <button class="btn sm" id="sendV" type="button">ارسال کد تایید</button>
           <span class="fine ap26-ac-break" id="vMsg"></span>
         </div>
         <div class="ap26-ac-inline-row">
           <input class="inp" dir="ltr" id="vCode" inputmode="numeric" maxlength="6" placeholder="کد ۶ رقمی" style="width:140px;max-width:100%">
           <button class="btn sm" id="doV" type="button">تایید</button>
         </div>`;

    $('#ea', el)?.addEventListener('change', async (e) => {
      await updateProfile({ email_alerts: e.target.checked });
      toast(e.target.checked ? 'هشدارهای ایمیلی فعال شد.' : 'هشدارهای ایمیلی غیرفعال شد.', 'info');
    });
    $('#sendV', el)?.addEventListener('click', async () => {
      const vMsg = $('#vMsg', el);
      if (vMsg) vMsg.textContent = 'در حال ارسال…';
      try {
        await callFn('account', { action: 'send-code', purpose: 'verify' });
        if (vMsg) vMsg.textContent = 'کد ارسال شد.';
      } catch (e) {
        if (vMsg) vMsg.textContent = e.message;
      }
    });
    $('#doV', el)?.addEventListener('click', async () => {
      try {
        await callFn('account', { action: 'verify-email', code: $('#vCode', el)?.value.trim() || '' });
        await refreshProfile();
        toast('ایمیل تایید شد.', 'up');
        paintEmail();
      } catch (e) {
        toast(e.message, 'down');
      }
    });
  };
  paintEmail();

  // ---------------------------------------------------------------- telegram
  const paintTg = () => {
    const pr = auth.profile || {};
    const box = $('#tgBox', el);
    if (!box) return;
    box.innerHTML = pr.telegram_chat_id
      ? `<p class="ap26-ac-break"><span class="chip up">متصل شد</span> ${pr.telegram_username ? `<span dir="ltr">@${esc(pr.telegram_username)}</span>` : ''}</p>
         <p class="fine" style="line-height:1.7">ربات همچنین به دستورات <code dir="ltr">/price BTC</code>، <code dir="ltr">/signal ETH</code> و <code dir="ltr">/alerts</code> پاسخ می‌دهد.</p>
         <div class="ap26-ac-inline-row"><button class="btn sm ghost" id="tgOff" type="button">قطع اتصال</button></div>`
      : `<p class="fine" style="line-height:1.7">دریافت هشدارها در تلگرام — رایگان، آنی و قابل استفاده حتی در زمان بسته بودن سایت.</p>
         <div class="ap26-ac-inline-row"><button class="btn sm" id="tgOn" type="button">${icon('send', 14)} اتصال به تلگرام</button></div>
         <p class="fine ap26-ac-break" id="tgMsg"></p>`;

    $('#tgOn', el)?.addEventListener('click', async () => {
      const tgMsg = $('#tgMsg', el);
      if (tgMsg) tgMsg.textContent = 'در حال آماده‌سازی لینک…';
      try {
        const r = await callFn('account', { action: 'telegram-link' });
        if (tgMsg) {
          tgMsg.innerHTML = `<a href="${esc(safeUrl(r.url, '#/account'))}" target="_blank" rel="noopener noreferrer"><b dir="ltr">@${esc(r.bot)}</b></a> را باز کنید و دکمه <span dir="ltr">Start</span> را بزنید. کد: <code dir="ltr">${esc(r.code)}</code> (معتبر به مدت ۲۰ دقیقه). سپس به اینجا بازگشته و صفحه را رفرش کنید.`;
        }
        window.open(r.url, '_blank', 'noopener');
      } catch (e) {
        if (tgMsg) tgMsg.textContent = e.message;
      }
    });
    $('#tgOff', el)?.addEventListener('click', async () => {
      await callFn('account', { action: 'telegram-unlink' });
      await refreshProfile();
      paintTg();
      toast('تلگرام قطع شد.', 'info');
    });
  };
  paintTg();

  // ---------------------------------------------------------------- data
  $('#export', el)?.addEventListener('click', () => {
    const data = {
      exported: new Date().toISOString(),
      email: auth.user.email,
      watchlist: load('watchlist', []),
      holdings: load('holdings', []),
      wallets: load('wallets', []),
      alerts: load('alerts', []),
      settings: load('settings', {}),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'BTCS-data.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  $('#test', el)?.addEventListener('click', async () => {
    try {
      await callFn('account', { action: 'test-alert' });
      toast('هشدار تستی ارسال شد.', 'up');
    } catch (e) {
      toast(e.message, 'down');
    }
  });

  $('#del', el)?.addEventListener('click', () => {
    const m = modal(`<div dir="rtl">
      <h3 style="margin:0 0 10px">حذف حساب کاربری؟</h3>
      <p class="fine" style="line-height:1.7">این عمل پروفایل، لیست پیگیری و دارایی‌های همگام‌سازی‌شده و تمام هشدارهای سمت سرور را حذف می‌کند و غیرقابل بازگشت است.</p>
      <label class="fld" style="margin-top:12px">برای تایید عبارت <b dir="ltr">DELETE</b> را تایپ کنید<input class="inp" dir="ltr" id="cf"></label>
      <div class="ap26-ac-inline-row" style="margin-top:14px">
        <button class="btn" id="no" type="button">حفظ حساب کاربری</button>
        <button class="btn primary" id="yes" type="button" disabled style="background:var(--ac-red);color:#fff">حذف دائم</button>
      </div>
    </div>`);
    $('#cf', m.el)?.addEventListener('input', (e) => {
      const yesBtn = $('#yes', m.el);
      if (yesBtn) yesBtn.disabled = e.target.value.trim().toUpperCase() !== 'DELETE';
    });
    $('#no', m.el)?.addEventListener('click', m.close);
    $('#yes', m.el)?.addEventListener('click', async () => {
      try {
        await callFn('account', { action: 'delete-account' });
        await signOut();
        m.close();
        location.hash = '#/';
        toast('حساب کاربری شما حذف شد.', 'info');
      } catch (e) {
        toast(e.message, 'down');
      }
    });
  });

  // ---------------------------------------------------------------- security
  const paintSecurity = async () => {
    const box = $('#secBox', el);
    if (!box) return;
    try {
      box.innerHTML = `
        <div>
          <h3 class="fine" style="margin:0 0 10px">رمز عبور و نشست‌ها</h3>
          <form class="stack" style="gap:10px;max-width:440px" id="pwForm">
            <label class="fld">رمز عبور جدید<input class="inp" dir="ltr" name="pw" type="password" minlength="10" autocomplete="new-password" placeholder="حداقل ۱۰ کاراکتر"></label>
            <div class="ap26-ac-inline-row" style="margin-top:0"><button class="btn sm" type="submit">تغییر رمز عبور</button></div>
            <p class="fine ap26-ac-break" id="pwMsg"></p>
          </form>
          <p class="fine" style="margin-top:14px">در دستگاه دیگری وارد شده‌اید که دیگر استفاده نمی‌کنید؟</p>
          <div class="ap26-ac-inline-row"><button class="btn sm ghost" id="soAll" type="button">خروج از همه دستگاه‌ها</button></div>
        </div>
        <p class="fine" style="margin-top:16px;line-height:1.7">این سایت هرگز کلیدهای API صرافی، کلیدهای خصوصی یا عبارت بازیابی (<span dir="ltr">Seed</span>) را درخواست نمی‌کند — نه در این صفحه و نه هیچ جای دیگر.</p>`;

      $('#pwForm', el)?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = $('#pwMsg', el);
        try {
          await changePassword(e.target.pw.value);
          e.target.reset();
          if (msg) msg.innerHTML = '<span class="up">رمز عبور تغییر یافت.</span>';
        } catch (e2) {
          if (msg) msg.innerHTML = `<span class="down">${esc(e2.message)}</span>`;
        }
      });

      $('#soAll', el)?.addEventListener('click', async () => {
        try {
          await signOutEverywhere();
          toast('از تمامی دستگاه‌ها خارج شدید.', 'info');
          location.hash = '#/';
        } catch (e) {
          toast(e.message, 'down');
        }
      });
    } catch (e) {
      box.innerHTML = `<p class="fine ap26-ac-break">بارگذاری تنظیمات امنیتی مقدور نبود: ${esc(e.message)}</p>`;
    }
  };
  paintSecurity();

  // ---------------------------------------------------------------- activity
  const closeAt = async (symbol, interval, atMs) => {
    let coin;
    try {
      coin = await findCoin(symbol);
    } catch {
      return { retry: true };
    }
    if (!coin || coin.source === 'demo') return { retry: true };
    return closeAtTime(coin, interval, atMs);
  };

  const paintActivity = async () => {
    const box = $('#activityBox', el);
    if (!box) return;
    try {
      await resolveDueForecasts(closeAt);
      const [acts, fcs] = await Promise.all([myActivity(50), myForecasts(100)]);
      const sc = forecastScore(fcs);
      const label = {
        view_coin: 'باز شده',
        alert_created: 'ایجاد هشدار برای',
        alert_fired: 'هشدار فعال شد روی',
        forecast_seen: 'مشاهده پیش‌بینی برای',
        trade_link: 'باز کردن لینک معامله برای',
        signed_in: 'وارد شد',
      };
      box.innerHTML = `
        <div class="ap26-ac-stats">
          <div class="ap26-ac-stat"><span class="k">پیش‌بینی‌های نمایش‌داده‌شده</span><span class="v ltr-num">${sc.shown}</span><span class="s"><span class="ltr-num">${sc.open}</span> همچنان باز</span></div>
          <div class="ap26-ac-stat"><span class="k">امتیازدهی‌شده تاکنون</span><span class="v ltr-num">${sc.resolved}</span><span class="s"><span class="ltr-num">${sc.right}</span> درست پیش‌بینی شده</span></div>
          <div class="ap26-ac-stat"><span class="k">نرخ موفقیت شما</span><span class="v ltr-num ${sc.accuracy === null ? '' : sc.accuracy >= 55 ? 'up' : sc.accuracy < 50 ? 'down' : ''}">${sc.accuracy === null ? '—' : `${sc.accuracy.toFixed(0)}%`}</span><span class="s">در پیش‌بینی‌های جهت‌دار دیده‌شده</span></div>
          <div class="ap26-ac-stat"><span class="k">ارزهای پرتکرار شما</span><span class="v ap26-ac-break" dir="ltr" style="font-size:15px">${topCoins(acts) || '—'}</span></div>
        </div>

        ${fcs.some((f) => f.prob_up === null) ? '<p class="fine" style="margin-top:8px">پیش‌بینی بدون رقم «رشد هوش مصنوعی» روی نموداری بوده که جهت خاصی را نشان نداده است.</p>' : ''}
        ${fcs.length ? `<h3 class="fine" style="margin-top:16px">پیش‌بینی‌های نمایش‌داده‌شده به شما</h3>
          <div class="ap26-ac-tbl-wrap"><table class="tbl"><thead><tr><th class="l">ارز</th><th>تایم‌فریم</th><th class="l">زمان نمایش</th><th>قیمت آن زمان</th><th>رشد هوش مصنوعی</th><th>قیمت پس از آن</th><th>نتیجه</th></tr></thead><tbody>
          ${fcs.slice(0, 25).map((f) => `<tr data-sym="${esc(f.symbol)}">
            <td class="l"><b dir="ltr">${esc(f.symbol)}</b></td><td class="fine" dir="ltr">${esc(f.interval)}</td>
            <td class="l fine ltr-num">${dateTime(new Date(f.shown_at).getTime())}</td>
            <td class="ltr-num">${money(f.price)}</td>
            <td class="ltr-num ${f.prob_up >= 0.54 ? 'up' : f.prob_up <= 0.46 ? 'down' : ''}">${f.prob_up === null ? '—' : `${(f.prob_up * 100).toFixed(0)}%`}</td>
            <td class="ltr-num">${!f.resolved ? '<span class="fine muted">باز</span>' : f.outcome_price === null ? '<span class="fine muted">موجود نیست</span>' : money(f.outcome_price)}</td>
            <td>${f.was_right === null ? '—' : f.was_right ? '<span class="up">✓ درست</span>' : '<span class="down">✕ اشتباه</span>'}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="fine" style="margin-top:10px">هنوز پیش‌بینی ثبت نشده است؛ صفحه یک ارز را باز کنید تا ثبت شود.</p>'}

        ${acts.length ? `<h3 class="fine" style="margin-top:18px">فعالیت‌های اخیر</h3>
          <div class="stack" style="gap:4px">${acts.slice(0, 20).map((a) => `<div class="row spread fine" style="padding:7px 0;border-bottom:1px solid var(--border);gap:10px;flex-wrap:wrap">
            <span class="ap26-ac-break">${esc(label[a.kind] || a.kind)} ${a.symbol ? `<a href="#/coin/${esc(a.symbol)}"><b dir="ltr">${esc(a.symbol)}</b></a>` : ''}</span>
            <span class="muted ltr-num">${ago(new Date(a.created_at).getTime())}</span></div>`).join('')}</div>` : ''}

        <p class="fine" style="margin-top:14px;line-height:1.7">این اطلاعات فقط برای شما قابل مشاهده است و پایگاه داده سایر حساب‌ها را مسدود می‌کند. نیمه پیش‌بینی هر ردیف پس از ثبت غیرقابل ویرایش است.</p>`;

      $$('#activityBox tr[data-sym]', el).forEach((tr) => {
        tr.addEventListener('click', () => {
          location.hash = `#/coin/${tr.dataset.sym}`;
        });
      });
    } catch (e) {
      box.innerHTML = `<p class="fine ap26-ac-break">بارگذاری فعالیت‌های شما مقدور نبود: ${esc(e.message)}</p>`;
    }
  };

  const topCoins = (acts) => {
    const n = {};
    for (const a of acts) if (a.symbol) n[a.symbol] = (n[a.symbol] || 0) + 1;
    return Object.entries(n).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([s]) => esc(s)).join(', ');
  };

  paintActivity();
  $('#clearAct', el)?.addEventListener('click', async () => {
    await clearMyActivity();
    toast('تاریخچه فعالیت‌ها پاک شد.', 'info');
    paintActivity();
  });
  void pct;

  const onAuth = () => {
    paintEmail();
    paintTg();
  };
  auth.addEventListener('change', onAuth);
  void money;

  return () => {
    auth.removeEventListener('change', onAuth);
    cleanupSeoMeta();
  };
}