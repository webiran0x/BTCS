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
const PAGE_TITLE = `حساب کاربری — ${APP_NAME}`;
const PAGE_DESC = `مدیریت پروفایل، اشتراک ویژه، هشدارهای ایمیلی و تلگرامی، امنیت نشست‌ها، سوابق پیش‌بینی و خروجی داده‌ها در ${APP_NAME}.`;

const STYLES = `
  <style>
    .ac-shell {
      max-width: 1080px;
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }
    .ac-hero {
      position: relative;
      overflow: hidden;
      border-radius: 24px;
      padding: 22px 26px;
      background:
        radial-gradient(560px circle at 10% 0%, rgba(214, 180, 108, 0.14), transparent 60%),
        linear-gradient(165deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.02));
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 20px 50px -22px rgba(0, 0, 0, 0.72), inset 0 1px 0 rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .ac-h1 {
      margin: 0 0 6px;
      font-size: clamp(1.4rem, 2.3vw, 1.85rem);
      line-height: 1.25;
      letter-spacing: -0.02em;
    }
    .ac-sub {
      margin: 0;
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.78);
    }
    .ac-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .ac-span-2 {
      grid-column: 1 / -1;
    }
    .ac-card {
      border-radius: 22px;
      padding: 22px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
    .ac-card h2,
    .ac-card h3 {
      margin: 0 0 10px;
      font-size: 1.06rem;
      color: #f6e7c1;
    }
    .ac-empty {
      max-width: 640px;
      margin: 24px auto;
      text-align: center;
      padding: 32px 26px;
      border-radius: 24px;
      background:
        radial-gradient(480px circle at 50% 0%, rgba(214, 180, 108, 0.12), transparent 65%),
        rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .ac-empty h1 {
      margin: 0 0 10px;
      font-size: 1.45rem;
      color: #fff;
    }
    .ac-empty p {
      margin: 0 auto 20px;
      max-width: 52ch;
      line-height: 1.8;
      color: rgba(255, 255, 255, 0.8);
    }
    .ac-danger-btn {
      color: var(--down);
      border-color: rgba(248, 113, 113, 0.45);
    }
    @media (max-width: 820px) {
      .ac-grid {
        grid-template-columns: 1fr;
      }
      .ac-hero, .ac-card {
        padding: 18px 16px;
        border-radius: 18px;
      }
    }
  </style>
`;

function syncSeoMeta() {
  document.title = PAGE_TITLE;
  let descEl = document.querySelector('meta[name="description"]');
  if (!descEl) {
    descEl = document.createElement('meta');
    descEl.setAttribute('name', 'description');
    document.head.appendChild(descEl);
  }
  descEl.setAttribute('content', PAGE_DESC);

  let ldEl = document.getElementById('ld-account-page');
  if (!ldEl) {
    ldEl = document.createElement('script');
    ldEl.type = 'application/ld+json';
    ldEl.id = 'ld-account-page';
    document.head.appendChild(ldEl);
  }

  const baseUrl = `${location.origin}${location.pathname}`;
  ldEl.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: PAGE_TITLE,
        description: PAGE_DESC,
        inLanguage: 'fa-IR',
        url: `${baseUrl}#/account`,
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
          { '@type': 'ListItem', position: 2, name: title, item: `${baseUrl}#/account` },
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
      <section class="ac-empty" dir="rtl" aria-labelledby="acGuestTitle">
        <h1 id="acGuestTitle">شما وارد حساب کاربری خود نشده‌اید</h1>
        <p>یک حساب کاربری لیست پیگیری، سبد دارایی، معاملات و هشدارهای شما را در تمامی دستگاه‌ها همگام‌سازی می‌کند و به شما اجازه می‌دهد حتی در زمان بسته بودن سایت، هشدارها را از طریق ایمیل یا تلگرام دریافت کنید.</p>
        <button class="btn primary" id="si" type="button">ورود یا ایجاد حساب کاربری</button>
      </section>
    `;
    $('#si', el).addEventListener('click', () => openAuth('up'));
    return cleanupSeoMeta;
  }

  if (flag === '?paid=1' || location.hash.includes('paid=1')) {
    await refreshProfile();
    toast('پرداخت دریافت شد — اشتراک ویژه فعال است. سپاسگزاریم!', 'up', 7000);
  }

  const p = auth.profile || {};
  const premium = isPremium();
  const emailStatus = await callFn('account', { action: 'email-status' }).catch(() => ({ emailEnabled: false }));

  el.innerHTML = `
    ${STYLES}
    <div class="ac-shell" dir="rtl">
      <header class="ac-hero">
        <div>
          <h1 class="ac-h1">حساب کاربری</h1>
          <p class="ac-sub">وارد شده با ایمیل <b>${esc(auth.user.email)}</b>${p.is_admin ? ' · <span class="chip warn">مدیر</span>' : ''}</p>
        </div>
        <button class="btn ghost" id="out" type="button">خروج از حساب</button>
      </header>

      <div class="ac-grid">
        <section class="ac-card" aria-labelledby="sec-profile">
          <h2 id="sec-profile">پروفایل</h2>
          <form class="stack mt" style="gap:10px" id="pf">
            <label class="fld">نام نمایشی<input class="inp" name="display_name" maxlength="60" value="${esc(p.display_name || '')}"></label>
            <label class="fld">ایمیل<input class="inp" value="${esc(p.email || auth.user.email)}" disabled></label>
            <button class="btn" type="submit">ذخیره پروفایل</button>
          </form>
          <p class="fine mt">عضو از تاریخ ${p.created_at ? new Date(p.created_at).toLocaleDateString('fa-IR') : '—'}.</p>
        </section>

        <section class="ac-card" aria-labelledby="sec-plan">
          <h2 id="sec-plan">${premium ? 'اشتراک ویژه' : 'طرح'}</h2>
          ${premium
            ? `<p class="mt"><span class="chip ${isAdmin() ? 'warn' : 'up'}">${isAdmin() ? 'مالک — اشتراک ویژه رایگان و دائمی' : 'اشتراک ویژه فعال'}</span></p><p>${isAdmin() ? 'شما مالک این سایت هستید، بنابراین تمامی قابلیت‌های ویژه بدون هزینه و به صورت دائمی برای شما فعال است.' : p.premium_until ? `اعتبار تا <b>${new Date(p.premium_until).toLocaleDateString('fa-IR')}</b> — ${Math.max(0, Math.ceil((new Date(p.premium_until) - Date.now()) / 864e5))} روز باقی مانده.` : 'دسترسی مادام‌العمر.'}</p>
               <ul class="feat"><li>تا ۵۰ هشدار فعال سمت سرور</li><li>ارسال از طریق تلگرام و ایمیل</li><li>هشدارهای سیگنال که حتی با بسته بودن مرورگر فعال می‌شوند</li><li>سوابق کامل به تفکیک هر ارز و خروجی CSV</li></ul>`
            : `<p class="mt">شما در طرح <b>رایگان</b> هستید: قیمت‌های لحظه‌ای، نمودارها، سیگنال‌ها، پیش‌بینی‌ها، مقایسه تاریخچه و ۳ اعلان سمت سرور.</p>
               <a class="btn primary mt" href="#/premium">${icon('star', 16)} مشاهده اشتراک ویژه</a>`}
        </section>

        <section class="ac-card" aria-labelledby="sec-email">
          <h2 id="sec-email">هشدارهای ایمیلی</h2>
          <div id="emailBox" class="mt"></div>
        </section>

        <section class="ac-card" aria-labelledby="sec-tg">
          <h2 id="sec-tg">هشدارهای تلگرامی</h2>
          <div id="tgBox" class="mt"></div>
        </section>

        <section class="ac-card ac-span-2" aria-labelledby="sec-digest">
          <h2 id="sec-digest">خلاصه روزانه لیست پیگیری</h2>
          <label class="row mt" style="gap:8px"><input type="checkbox" id="dg" ${settings.get().digest !== false ? 'checked' : ''}> ارسال خلاصه کوتاهی از لیست پیگیری هر روز صبح (۰۸:۰۰ به وقت جهانی) از طریق تلگرام یا ایمیل</label>
          <p class="fine">این خلاصه به هر کدام از دو روشی که در بالا متصل کرده‌اید ارسال می‌شود. برای توقف، تیک آن را بردارید.</p>
        </section>

        <section class="ac-card ac-span-2" aria-labelledby="sec-activity">
          <div class="card-h"><h2 id="sec-activity">فعالیت‌های شما</h2><button class="btn sm ghost" id="clearAct" type="button">پاک کردن تاریخچه</button></div>
          <div id="activityBox">در حال بارگذاری...</div>
        </section>

        <section class="ac-card" aria-labelledby="sec-data">
          <h2 id="sec-data">داده‌های شما</h2>
          <p class="fine">لیست پیگیری، دارایی‌ها، آدرس‌های کیف پول فقط-تماشا و ترسیم‌های نمودار شما با حساب کاربری‌تان همگام‌سازی می‌شوند. قیمت‌ها، سیگنال‌ها و پیش‌بینی‌ها در مرورگر شما محاسبه می‌شوند — ما هرگز آن‌ها را مشاهده نمی‌کنیم.</p>
          <div class="row mt" style="gap:8px;flex-wrap:wrap">
            <button class="btn sm" id="export" type="button">دانلود داده‌های من (JSON)</button>
            <button class="btn sm" id="test" type="button">ارسال هشدار تستی</button>
          </div>
        </section>

        <section class="ac-card" aria-labelledby="sec-danger">
          <h2 id="sec-danger">منطقه خطر</h2>
          <p class="fine">حذف حساب کاربری، پروفایل، داده‌های همگام‌سازی شده و هشدارها را به صورت دائمی پاک می‌کند. داده‌های محلی روی این دستگاه تا زمان پاکسازی باقی می‌مانند.</p>
          <button class="btn sm ghost down mt ac-danger-btn" id="del" type="button">حذف حساب کاربری من</button>
        </section>

        <section class="ac-card ac-span-2" aria-labelledby="sec-security">
          <div class="card-h"><h2 id="sec-security">امنیت</h2></div>
          <div id="secBox">در حال بارگذاری...</div>
        </section>
      </div>
    </div>`;

  // ---------------------------------------------------------------- profile
  $('#pf', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateProfile({ display_name: e.target.display_name.value.trim().slice(0, 60) });
    toast('پروفایل ذخیره شد.', 'up');
  });
  $('#out', el).addEventListener('click', async () => { await signOut(); location.hash = '#/'; });

  $('#dg', el)?.addEventListener('change', (e) => {
    settings.set({ digest: e.target.checked });
    toast(e.target.checked ? 'خلاصه روزانه فعال شد.' : 'خلاصه روزانه غیرفعال شد.', 'info');
  });

  // ---------------------------------------------------------------- e-mail alerts
  const paintEmail = () => {
    const pr = auth.profile || {};
    const box = $('#emailBox', el);
    if (!emailStatus.emailEnabled) {
      box.innerHTML = '<p class="fine">ارسال ایمیل هنوز در این سایت پیکربندی نشده است، بنابراین هشدارها فقط در مرورگر نمایش داده می‌شوند. تلگرام به صورت مستقل کار می‌کند.</p>';
      return;
    }
    box.innerHTML = pr.email_verified
      ? `<p><span class="chip up">ایمیل تایید شد</span></p>
         <label class="row" style="gap:8px"><input type="checkbox" id="ea" ${pr.email_alerts ? 'checked' : ''}> ارسال هشدارهای قیمتی به ${esc(pr.email)}</label>`
      : `<p class="fine">ایمیل خود را تایید کنید تا هنگام بسته بودن سایت، هشدارها به دست شما برسند.</p>
         <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" id="sendV" type="button">ارسال کد تایید</button><span class="fine" id="vMsg"></span></div>
         <div class="row mt" style="gap:8px;flex-wrap:wrap"><input class="inp" id="vCode" inputmode="numeric" maxlength="6" placeholder="کد ۶ رقمی" style="max-width:140px"><button class="btn sm" id="doV" type="button">تایید</button></div>`;
    $('#ea', el)?.addEventListener('change', async (e) => { await updateProfile({ email_alerts: e.target.checked }); toast(e.target.checked ? 'هشدارهای ایمیلی فعال شد.' : 'هشدارهای ایمیلی غیرفعال شد.', 'info'); });
    $('#sendV', el)?.addEventListener('click', async () => {
      $('#vMsg', el).textContent = 'در حال ارسال...';
      try { await callFn('account', { action: 'send-code', purpose: 'verify' }); $('#vMsg', el).textContent = 'کد ارسال شد.'; }
      catch (e) { $('#vMsg', el).textContent = e.message; }
    });
    $('#doV', el)?.addEventListener('click', async () => {
      try {
        await callFn('account', { action: 'verify-email', code: $('#vCode', el).value.trim() });
        await refreshProfile();
        toast('ایمیل تایید شد.', 'up');
        paintEmail();
      } catch (e) { toast(e.message, 'down'); }
    });
  };
  paintEmail();

  // ---------------------------------------------------------------- telegram
  const paintTg = () => {
    const pr = auth.profile || {};
    const box = $('#tgBox', el);
    box.innerHTML = pr.telegram_chat_id
      ? `<p><span class="chip up">متصل شد</span> ${pr.telegram_username ? `@${esc(pr.telegram_username)}` : ''}</p>
         <p class="fine">ربات همچنین به دستورات /price BTC، /signal ETH و /alerts پاسخ می‌دهد.</p>
         <button class="btn sm ghost" id="tgOff" type="button">قطع اتصال</button>`
      : `<p class="fine">دریافت هشدارها در تلگرام — رایگان، آنی و قابل استفاده حتی در زمان بسته بودن سایت.</p>
         <button class="btn sm" id="tgOn" type="button">${icon('send', 14)} اتصال به تلگرام</button><p class="fine" id="tgMsg"></p>`;
    $('#tgOn', el)?.addEventListener('click', async () => {
      $('#tgMsg', el).textContent = 'در حال آماده‌سازی لینک...';
      try {
        const r = await callFn('account', { action: 'telegram-link' });
        $('#tgMsg', el).innerHTML = `<a href="${esc(safeUrl(r.url, '#/account'))}" target="_blank" rel="noopener noreferrer"><b>@${esc(r.bot)}</b></a> را باز کنید و دکمه Start را فشار دهید. کد: <code>${esc(r.code)}</code> (معتبر به مدت ۲۰ دقیقه). سپس به اینجا بازگشته و صفحه را رفرش کنید.`;
        window.open(r.url, '_blank', 'noopener');
      } catch (e) { $('#tgMsg', el).textContent = e.message; }
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
  $('#export', el).addEventListener('click', () => {
    const data = {
      exported: new Date().toISOString(), email: auth.user.email,
      watchlist: load('watchlist', []), holdings: load('holdings', []), wallets: load('wallets', []),
      alerts: load('alerts', []), settings: load('settings', {}),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'BTCS-data.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  $('#test', el).addEventListener('click', async () => {
    try { await callFn('account', { action: 'test-alert' }); toast('هشدار تستی ارسال شد.', 'up'); }
    catch (e) { toast(e.message, 'down'); }
  });

  $('#del', el).addEventListener('click', () => {
    const m = modal(`<h3>حذف حساب کاربری؟</h3><p>این عمل پروفایل، لیست پیگیری و دارایی‌های همگام‌سازی‌شده و تمام هشدارهای سمت سرور را حذف می‌کند. این کار غیرقابل بازگشت است.</p>
      <label class="fld mt">برای تایید عبارت <b>DELETE</b> را تایپ کنید<input class="inp" id="cf"></label>
      <div class="row mt" style="gap:8px"><button class="btn" id="no" type="button">حفظ حساب کاربری</button><button class="btn primary" id="yes" type="button" disabled style="background:var(--down);color:#fff">حذف دائم</button></div>`);
    $('#cf', m.el).addEventListener('input', (e) => { $('#yes', m.el).disabled = e.target.value.trim().toUpperCase() !== 'DELETE'; });
    $('#no', m.el).addEventListener('click', m.close);
    $('#yes', m.el).addEventListener('click', async () => {
      try { await callFn('account', { action: 'delete-account' }); await signOut(); m.close(); location.hash = '#/'; toast('حساب کاربری شما حذف شد.', 'info'); }
      catch (e) { toast(e.message, 'down'); }
    });
  });

  // ---------------------------------------------------------------- security
  const paintSecurity = async () => {
    const box = $('#secBox', el);
    try {
      box.innerHTML = `
        <div>
          <div>
            <h3 class="fine">رمز عبور و نشست‌ها</h3>
            <form class="stack" style="gap:8px" id="pwForm">
              <label class="fld">رمز عبور جدید<input class="inp" name="pw" type="password" minlength="10" autocomplete="new-password" placeholder="حداقل ۱۰ کاراکتر"></label>
              <button class="btn sm" type="submit">تغییر رمز عبور</button>
              <p class="fine" id="pwMsg"></p>
            </form>
            <p class="fine mt">در دستگاه دیگری وارد شده‌اید که دیگر استفاده نمی‌کنید؟</p>
            <button class="btn sm ghost" id="soAll" type="button">خروج از همه دستگاه‌ها</button>
          </div>
        </div>
        <p class="fine mt">این سایت هرگز کلیدهای API صرافی، کلیدهای خصوصی یا عبارت بازیابی (Seed) را درخواست نمی‌کند — نه در این صفحه و نه هیچ‌کجا. هر کس چنین درخواستی کند، ما نیستیم.</p>`;

      $('#pwForm', el).addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = $('#pwMsg', el);
        try {
          await changePassword(e.target.pw.value);
          e.target.reset();
          msg.innerHTML = '<span class="up">رمز عبور تغییر یافت.</span>';
        } catch (e2) { msg.innerHTML = `<span class="down">${esc(e2.message)}</span>`; }
      });

      $('#soAll', el).addEventListener('click', async () => {
        try { await signOutEverywhere(); toast('از تمامی دستگاه‌ها خارج شدید.', 'info'); location.hash = '#/'; }
        catch (e) { toast(e.message, 'down'); }
      });
    } catch (e) {
      box.innerHTML = `<p class="fine">بارگذاری تنظیمات امنیتی مقدور نبود: ${esc(e.message)}</p>`;
    }
  };
  paintSecurity();

  // ---------------------------------------------------------------- activity
  const closeAt = async (symbol, interval, atMs) => {
    let coin;
    try { coin = await findCoin(symbol); } catch { return { retry: true }; }
    if (!coin || coin.source === 'demo') return { retry: true };
    return closeAtTime(coin, interval, atMs);
  };

  const paintActivity = async () => {
    const box = $('#activityBox', el);
    try {
      await resolveDueForecasts(closeAt);
      const [acts, fcs] = await Promise.all([myActivity(50), myForecasts(100)]);
      const sc = forecastScore(fcs);
      const label = { view_coin: 'باز شده', alert_created: 'ایجاد هشدار برای', alert_fired: 'هشدار فعال شد روی', forecast_seen: 'مشاهده پیش‌بینی برای', trade_link: 'باز کردن لینک معامله برای', signed_in: 'وارد شد' };
      box.innerHTML = `
        <div class="grid g4">
          <div class="stat"><span class="k">پیش‌بینی‌هایی که به شما نمایش داده شد</span><span class="v">${sc.shown}</span><span class="s fine">${sc.open} همچنان باز</span></div>
          <div class="stat"><span class="k">امتیازدهی شده تاکنون</span><span class="v">${sc.resolved}</span><span class="s fine">${sc.right} درست پیش‌بینی شده</span></div>
          <div class="stat"><span class="k">نرخ موفقیت شما</span><span class="v ${sc.accuracy === null ? '' : sc.accuracy >= 55 ? 'up' : sc.accuracy < 50 ? 'down' : ''}">${sc.accuracy === null ? '—' : `${sc.accuracy.toFixed(0)}%`}</span><span class="s fine">در پیش‌بینی‌های جهت‌داری که به شما نمایش داده شد</span></div>
          <div class="stat"><span class="k">ارزهایی که بیشتر دنبال می‌کنید</span><span class="v" style="font-size:16px">${topCoins(acts) || '—'}</span></div>
        </div>

        ${fcs.some((f) => f.prob_up === null) ? '<p class="fine mt">پیش‌بینی بدون رقم "رشد هوش مصنوعی" روی نموداری بود که صفحه جهتی را نشان نداده بود...</p>' : ''}
        ${fcs.length ? `<h3 class="mt fine">پیش‌بینی‌هایی که به شما نمایش داده شد</h3>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">ارز</th><th>تایم‌فریم</th><th class="l">نمایش‌داده‌شده</th><th>قیمت در آن زمان</th><th>رشد هوش مصنوعی</th><th>قیمت پس از آن</th><th>نتیجه</th></tr></thead><tbody>
          ${fcs.slice(0, 25).map((f) => `<tr data-sym="${esc(f.symbol)}">
            <td class="l"><b>${esc(f.symbol)}</b></td><td class="fine">${esc(f.interval)}</td>
            <td class="l fine">${dateTime(new Date(f.shown_at).getTime())}</td>
            <td>${money(f.price)}</td>
            <td class="${f.prob_up >= 0.54 ? 'up' : f.prob_up <= 0.46 ? 'down' : ''}">${f.prob_up === null ? '—' : `${(f.prob_up * 100).toFixed(0)}%`}</td>
            <td>${!f.resolved ? '<span class="fine muted">باز</span>' : f.outcome_price === null ? '<span class="fine muted">موجود نیست</span>' : money(f.outcome_price)}</td>
            <td>${f.was_right === null ? '—' : f.was_right ? '<span class="up">✓ درست</span>' : '<span class="down">✕ اشتباه</span>'}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="fine mt">هنوز پیش‌بینی ثبت نشده است — صفحه یک ارز را باز کنید تا اینجا ثبت شود.</p>'}

        ${acts.length ? `<h3 class="mt fine">فعالیت‌های اخیر</h3>
          <div class="stack" style="gap:4px">${acts.slice(0, 20).map((a) => `<div class="row spread fine" style="padding:5px 0;border-bottom:1px solid var(--border)">
            <span>${esc(label[a.kind] || a.kind)} ${a.symbol ? `<a href="#/coin/${esc(a.symbol)}"><b>${esc(a.symbol)}</b></a>` : ''}</span>
            <span class="muted">${ago(new Date(a.created_at).getTime())}</span></div>`).join('')}</div>` : ''}

        <p class="fine mt">فقط شما می‌توانید این را بخوانید — پایگاه داده سایر حساب‌ها را مسدود می‌کند. نیمه پیش‌بینی هر سطر پس از ثبت قابل ویرایش نیست، به همین دلیل نرخ موفقیت بالا قابل اعتماد است.</p>`;
      $$('#activityBox tr[data-sym]', el).forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/coin/${tr.dataset.sym}`; }));
    } catch (e) {
      box.innerHTML = `<p class="fine">بارگذاری فعالیت‌های شما مقدور نبود: ${esc(e.message)}</p>`;
    }
  };
  const topCoins = (acts) => {
    const n = {};
    for (const a of acts) if (a.symbol) n[a.symbol] = (n[a.symbol] || 0) + 1;
    return Object.entries(n).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([s]) => esc(s)).join(', ');
  };
  paintActivity();
  $('#clearAct', el).addEventListener('click', async () => {
    await clearMyActivity();
    toast('تاریخچه فعالیت‌ها پاک شد.', 'info');
    paintActivity();
  });
  void pct;

  const onAuth = () => { paintEmail(); paintTg(); };
  auth.addEventListener('change', onAuth);
  void money;
  return () => {
    auth.removeEventListener('change', onAuth);
    cleanupSeoMeta();
  };
}