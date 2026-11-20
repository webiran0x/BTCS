import { markets, isStable } from '../api/market.js';
import { $, $$, icon, toast, coinLogo, skeleton } from '../ui.js';
import { esc, price, ago, money } from '../format.js';
import { load, save } from '../store.js';
import { fx } from '../api/fx.js';
import { auth, backendEnabled, serverAlerts, createServerAlert, deleteServerAlert, serverAiAlerts, createAiAlert, deleteAiAlert } from '../api/backend.js';
import { openAuth } from './auth.js';

export const title = 'هشدارها';

const ALERTS_FAQS = [
  {
    q: 'هشدارهای قیمت و سیگنال چه زمانی ارسال می‌شوند؟',
    a: 'هشدار قیمت هنگام باز بودن سایت در مرورگر بررسی می‌شود و در صورت ورود به حساب کاربری، روی سرور نیز فعال است؛ هشدارهای سیگنال و هوش مصنوعی روی سرور در زمان بسته شدن کندل‌ها بررسی می‌شوند.',
  },
  {
    q: 'آیا با ثبت هشدار در این صفحه، سفارش خرید یا فروش در صرافی ثبت می‌شود؟',
    a: 'خیر؛ هیچ سفارشی در صرافی یا در این سایت ثبت نمی‌شود و هشدارها صرفاً جهت اطلاع‌رسانی هستند.',
  },
  {
    q: 'اگر اعلان‌های مرورگر غیرفعال یا مسدود باشند چه اتفاقی می‌افتد؟',
    a: 'در صورت عدم دسترسی یا عدم مجوز اعلان مرورگر، هشدارها به صورت پیام‌های روی صفحه نمایش داده می‌شوند.',
  },
];

function injectAlertsJsonLd() {
  if (typeof document === 'undefined') return;
  const scriptId = 'btcs-alerts-jsonld';
  const origin = `${location.origin || 'https://btcs.ir'}/`;
  const canonicalUrl = `${origin}alerts/`;
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: 'مرکز هشدارهای قیمت، سیگنال و هوش مصنوعی رمزارزها',
        description: 'تنظیم هشدار قیمت، هشدار سیگنال تکنیکال و هشدار سیگنال هوش مصنوعی برای رمزارزها با اطلاع‌رسانی لحظه‌ای.',
        isPartOf: { '@id': `${origin}#website` },
        inLanguage: 'fa-IR',
      },
      {
        '@type': 'FAQPage',
        mainEntity: ALERTS_FAQS.map((item) => ({
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

export async function render(el, [preset]) {
  injectAlertsJsonLd();

  let disposed = false;
  let sigSeq = 0;
  let aiSeq = 0;
  let elsewhereSeq = 0;

  const all = await markets().catch(() => []);
  const coins = all.filter((c) => c.binance && !isStable(c.symbol));
  const hasNotifApi = typeof Notification !== 'undefined';
  const perm = hasNotifApi ? Notification.permission : 'unsupported';
  const targetPreset = String(preset || 'BTC').toUpperCase();

  el.innerHTML = `
    <style>
      .ap-alerts-wrap {
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
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
        margin-bottom: 24px;
      }
      @media(max-width: 960px) {
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
        margin-bottom: 20px;
      }
      .ap-card:hover {
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
      }
      .ap-alerts-wrap .btn {
        border-radius: 13px;
        font-weight: 500;
        transition: all 0.2s ease;
      }
      .ap-alerts-wrap .btn.primary {
        background: linear-gradient(135deg, #5e5ce6 0%, #3634a3 100%);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #fff;
        box-shadow: 0 6px 18px rgba(94, 92, 230, 0.3);
      }
      .ap-alerts-wrap .btn.primary:hover {
        filter: brightness(1.08);
        transform: translateY(-1px);
      }
      .ap-alerts-wrap .inp, .ap-alerts-wrap select {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 12px;
        color: #fff;
        padding: 10px 14px;
        outline: none;
        transition: all 0.2s;
      }
      .ap-alerts-wrap .inp:focus, .ap-alerts-wrap select:focus {
        border-color: rgba(94, 92, 230, 0.6);
        box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.25);
      }
      .ap-alert-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }
      .ap-alert-links a {
        color: rgba(255, 255, 255, 0.82);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 0.82rem;
        text-decoration: none;
      }
      .ap-alert-links a:hover {
        border-color: rgba(255, 255, 255, 0.25);
        color: #fff;
      }
      .ap-faq-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 14px;
        margin-top: 12px;
      }
      .ap-faq-item {
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 16px;
        padding: 16px;
      }
      .ap-faq-item h3 {
        font-size: 0.96rem;
        color: #fff;
        margin: 0 0 8px 0;
      }
      .ap-faq-item p {
        font-size: 0.86rem;
        color: rgba(255, 255, 255, 0.65);
        line-height: 1.65;
        margin: 0;
      }
      #sigBox, #aiBox { min-height: 120px; }
      #list { min-height: 110px; }
    </style>

    <div class="ap-alerts-wrap" dir="rtl">
      <header class="ap-hero-card">
        <h1 style="font-size:2.2rem;font-weight:700;letter-spacing:-0.02em;color:#fff;margin:0 0 8px 0">مرکز هشدارها</h1>
        <p style="color:rgba(255,255,255,0.72);font-size:1.05rem;line-height:1.65;margin:0">سه نوع هشدار پیشرفته وجود دارد: <b>هشدار قیمت</b> برای زیر نظر داشتن سطوح کلیدی، <b>هشدار سیگنال</b> برای دریافت نقطه ورود، حد ضرر و اهداف به محض فعال‌شدن تنظیمات موتور روی نمودار، و <b>هشدار سیگنال هوش مصنوعی</b> جهت اطلاع‌رسانی آنی هنگام خرید یا فروش ارزها توسط هوش مصنوعی.</p>
        <nav class="ap-alert-links" aria-label="لینک‌های مرتبط با هشدارها و بازار">
          <a href="#/">نمای زنده بازارها</a>
          <a href="#/coin/${encodeURIComponent(targetPreset)}">تحلیل ${esc(targetPreset)}</a>
          <a href="#/track">سابقه عملکرد</a>
          <a href="#/account">حساب کاربری</a>
        </nav>
      </header>

      <section class="ap-card" aria-label="هشدار سیگنال">
        <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h2 style="margin:0;font-size:1.15rem;color:#fff">هشدار سیگنال</h2><span class="chip warn" style="background:rgba(255,159,10,0.12);color:#ff9f0a;padding:4px 10px;border-radius:8px;font-size:0.8rem">اجرا روی سرور</span></div>
        <div id="sigBox">${skeleton(3, 22)}</div>
      </section>

      <section class="ap-card" aria-label="هشدار سیگنال هوش مصنوعی">
        <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h2 style="margin:0;font-size:1.15rem;color:#fff">هشدار سیگنال هوش مصنوعی</h2><span class="chip warn" style="background:rgba(255,159,10,0.12);color:#ff9f0a;padding:4px 10px;border-radius:8px;font-size:0.8rem">اجرا روی سرور</span></div>
        <div id="aiBox">${skeleton(3, 22)}</div>
      </section>

      <div class="ap-bento-grid">
        <section class="ap-card" style="margin-bottom:0" aria-label="ایجاد هشدار قیمت جدید">
          <h2 style="margin:0 0 16px 0;font-size:1.15rem;color:#fff">هشدار قیمت جدید</h2>
          ${coins.length ? `
          <form id="f" class="stack" style="gap:14px">
            <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">ارز</span><select class="inp" name="sym">${coins.map((c) => `<option value="${esc(c.symbol)}" ${c.symbol === targetPreset ? 'selected' : ''}>${esc(c.symbol)} · ${esc(c.name)}</option>`).join('')}</select></label>
            <div class="row" style="display:grid;grid-template-columns:1fr 1.2fr;gap:12px">
              <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">وقتی قیمت</span><select class="inp" name="dir"><option value="above">بالاتر از</option><option value="below">پایین‌تر از</option></select></label>
              <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">قیمت (<span id="curCode">${esc(fx.code)}</span>)</span><input class="inp" name="price" type="number" step="any" min="0" required></label>
            </div>
            <p class="fine" id="cur" style="color:rgba(255,255,255,0.5);margin:0;font-size:0.85rem"></p>
            <button type="submit" class="btn primary" style="width:100%;padding:12px">${icon('alerts', 16)} ایجاد هشدار</button>
            <p class="fine" id="reach" style="color:rgba(255,255,255,0.5);margin:0;font-size:0.85rem"></p>
          </form>` : `<p class="fine" style="color:rgba(255,255,255,0.6)">در حال حاضر فهرست رمزارزها در دسترس نیست. لطفاً اتصال شبکه را بررسی کنید.</p>`}
          <div class="mt" id="permBox" style="margin-top:16px">${perm === 'granted' ? '<p class="fine up" style="color:var(--up);margin:0">اعلان‌های مرورگر فعال هستند.</p>' : perm === 'unsupported' ? '<p class="fine" style="color:rgba(255,255,255,0.5);margin:0">این مرورگر از اعلان‌ها پشتیبانی نمی‌کند — هشدارها به صورت پیام‌های روی صفحه نمایش داده می‌شوند.</p>' : '<button type="button" class="btn sm" id="perm" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:8px 14px;border-radius:10px;cursor:pointer">فعال‌سازی اعلان‌های مرورگر</button>'}</div>
        </section>

        <section class="ap-card" style="margin-bottom:0" aria-label="لیست هشدارهای ثبت‌شده">
          <div class="card-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h2 style="margin:0;font-size:1.15rem;color:#fff">هشدارهای شما</h2><button type="button" class="btn sm ghost" id="clear" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:6px 12px;border-radius:10px;cursor:pointer;font-size:0.85rem">پاک کردن موارد فعال‌شده</button></div>
          <div id="list"></div>
        </section>
      </div>

      <section class="ap-card" aria-label="سوالات متداول درباره هشدارها">
        <h2 style="margin:0 0 6px 0;font-size:1.15rem;color:#fff">سوالات متداول درباره مرکز هشدارها</h2>
        <div class="ap-faq-grid">
          ${ALERTS_FAQS.map((item) => `
            <article class="ap-faq-item">
              <h3>${esc(item.q)}</h3>
              <p>${esc(item.a)}</p>
            </article>
          `).join('')}
        </div>
      </section>
    </div>`;

  const f = $('#f', el);
  const toUsd = (v) => (fx.rate ? v / fx.rate : v);
  const showCur = () => {
    if (!f) return;
    const c = coins.find((x) => x.symbol === f.sym.value);
    const code = $('#curCode', el);
    if (code) code.textContent = fx.code;
    if (c && Number.isFinite(c.price)) {
      $('#cur', el).textContent = fx.code === 'USD'
        ? `قیمت فعلی: ${money(c.price)}`
        : `قیمت فعلی: ${money(c.price)} (US$${price(c.price)})`;
      if (!f.price.value) f.price.placeholder = price(c.price * (fx.rate || 1));
    }
  };

  const INTERVALS = ['15m', '1h', '4h', '1d'];
  const SIDES = [['any', 'هر جهتی'], ['long', 'فقط تنظیمات صعودی'], ['short', 'فقط تنظیمات نزولی']];

  async function drawSignals() {
    const seq = ++sigSeq;
    const box = $('#sigBox', el);
    if (!box || disposed) return;

    if (!backendEnabled()) {
      box.innerHTML = '<p class="fine" style="color:rgba(255,255,255,0.6)">هشدارهای سیگنال نیاز به سرور پشتیبان دارند که در این دپلوی متصل نیست. هشدارهای قیمت در پایین همچنان هنگام باز بودن سایت کار می‌کنند.</p>';
      return;
    }
    if (!auth.user) {
      box.innerHTML = `<p class="fine" style="color:rgba(255,255,255,0.6)">برای تنظیم هشدار سیگنال وارد شوید — این هشدار روی سرور اجرا می‌شود، بنابراین حتی با بسته بودن مرورگر به شما می‌رسد.</p>
        <button type="button" class="btn primary mt" id="sigSignIn" style="margin-top:12px;padding:10px 18px">${icon('bolt', 16)} ورود</button>`;
      $('#sigSignIn', box)?.addEventListener('click', () => openAuth('in'));
      return;
    }

    const rows = await serverAlerts().catch(() => null);
    if (disposed || seq !== sigSeq || !box.isConnected) return;
    if (!rows) {
      box.innerHTML = `<p class="fine" style="color:rgba(255,255,255,0.6)">بارگیری هشدارهای سیگنال امکان‌پذیر نبود — سرور پاسخ نداد.</p><button type="button" class="btn sm" id="sigRetry" style="margin-top:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:6px 12px;border-radius:8px;cursor:pointer">تلاش مجدد</button>`;
      $('#sigRetry', box)?.addEventListener('click', drawSignals);
      return;
    }
    const sigs = rows.filter((r) => r.kind === 'signal');
    box.innerHTML = `
      <form id="sf" class="row" style="gap:12px;align-items:flex-end;flex-wrap:wrap">
        <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">ارز</span><select class="inp" name="sym">${coins.slice(0, 60).map((c) => `<option value="${esc(c.symbol)}">${esc(c.symbol)} · ${esc(c.name)}</option>`).join('')}</select></label>
        <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">نمودار</span><select class="inp" name="iv">${INTERVALS.map((i) => `<option ${i === '4h' ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
        <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">اطلاع‌رسانی درباره</span><select class="inp" name="side">${SIDES.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label>
        <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">حداقل توافق اندیکاتورها</span><input class="inp" name="score" type="number" min="10" max="100" step="5" value="25" style="width:110px"></label>
        <button type="submit" class="btn primary" style="padding:10px 18px">${icon('alerts', 16)} ایجاد هشدار سیگنال</button>
      </form>
      <p class="fine mt" style="margin:12px 0;color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.5">این عدد میزان توافق قدرتمند اندیکاتورها را نشان می‌دهد، نه احتمال سودآوری معامله — تست‌ها نشان داده‌اند عدد بالاتر به معنای نتیجه بهتر نیست. این بررسی یک بار در زمان بسته شدن هر کندل روی آن نمودار انجام می‌شود و قبل از اطلاع‌رسانی مجدد، یک کندل کامل صبر می‌کند. در صورت اتصال تلگرام و ایمیل در <a href="#/account" style="color:var(--accent)">صفحه حساب کاربری</a>، اعلان‌ها به آنجا ارسال می‌شوند.</p>
      ${sigs.length ? `<div class="stack mt" style="display:flex;flex-direction:column;gap:8px;margin-top:14px">${sigs.map((a) => `
        <div class="row spread" style="padding:12px 16px;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center">
          <div><b style="color:#fff">${esc(a.symbol)}</b> · نمودار ${esc(a.interval)} · ${esc(SIDES.find(([v]) => v === (a.side || 'any'))?.[1] || 'هر جهتی')} · توافق ≥ ${esc(String(a.min_score ?? 25))}
            <br><small class="muted" style="color:rgba(255,255,255,0.4)">${a.last_fired_at ? `آخرین فعال‌سازی ${ago(new Date(a.last_fired_at).getTime())}` : 'در انتظار تنظیمات'}</small></div>
          <button type="button" class="icon-btn" style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.06);border:0;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center" data-sigdel="${esc(String(a.id))}" aria-label="حذف هشدار سیگنال">${icon('trash', 14)}</button>
        </div>`).join('')}</div>` : '<p class="fine mt" style="color:rgba(255,255,255,0.5);margin-top:12px">هنوز هیچ هشدار سیگنالی ثبت نشده است.</p>'}`;

    $('#sf', box)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f2 = e.currentTarget;
      const btn = f2.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        await createServerAlert({
          kind: 'signal',
          symbol: f2.sym.value,
          interval: f2.iv.value,
          side: f2.side.value,
          min_score: Math.round(+f2.score.value) || 25,
          channels: ['telegram', 'email'],
          active: true,
        });
        toast(`هشدار سیگنال برای ${f2.sym.value} روی نمودار ${f2.iv.value} تنظیم شد.`, 'up');
        drawSignals();
      } catch (err) {
        toast(err.message, 'down');
        if (btn && !disposed) btn.disabled = false;
      }
    });
    $$('[data-sigdel]', box).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await deleteServerAlert(b.dataset.sigdel);
        drawSignals();
      } catch (err) {
        toast(err.message, 'down');
        if (!disposed && b.isConnected) b.disabled = false;
      }
    }));
  }

  const AI_SIDES = [['any', 'خریدها و فروش‌ها'], ['long', 'فقط خریدها'], ['short', 'فقط فروش‌ها']];
  async function drawAi() {
    const seq = ++aiSeq;
    const box = $('#aiBox', el);
    if (!box || disposed) return;
    if (!backendEnabled()) {
      box.innerHTML = '<p class="fine" style="color:rgba(255,255,255,0.6)">هشدارهای سیگنال هوش مصنوعی نیاز به سرور پشتیبان دارند که در این دپلوی متصل نیست.</p>';
      return;
    }
    if (!auth.user) {
      box.innerHTML = `<p class="fine" style="color:rgba(255,255,255,0.6)">برای دریافت پیام هنگام خرید یا فروش یک ارز توسط سیگنال هوش مصنوعی وارد شوید — این هشدار روی سرور اجرا می‌شود، بنابراین حتی با بسته بودن مرورگر به شما می‌رسد.</p>
        <button type="button" class="btn primary mt" id="aiSignIn" style="margin-top:12px;padding:10px 18px">${icon('bolt', 16)} ورود</button>`;
      $('#aiSignIn', box)?.addEventListener('click', () => openAuth('in'));
      return;
    }
    const rows = await serverAiAlerts().catch(() => null);
    if (disposed || seq !== aiSeq || !box.isConnected) return;
    if (!rows) {
      box.innerHTML = '<p class="fine" style="color:rgba(255,255,255,0.6)">بارگیری هشدارهای سیگنال هوش مصنوعی امکان‌پذیر نبود — سرور پاسخ نداد.</p><button type="button" class="btn sm" id="aiRetry" style="margin-top:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:6px 12px;border-radius:8px;cursor:pointer">تلاش مجدد</button>';
      $('#aiRetry', box)?.addEventListener('click', drawAi);
      return;
    }
    const mine = Array.isArray(rows) ? rows : [];
    box.innerHTML = `
      <form id="af" class="row" style="gap:12px;align-items:flex-end;flex-wrap:wrap">
        <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">ارز</span><select class="inp" name="sym">${coins.slice(0, 60).map((c) => `<option value="${esc(c.symbol)}">${esc(c.symbol)} · ${esc(c.name)}</option>`).join('')}</select></label>
        <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">نمودار</span><select class="inp" name="iv">${['15m', '1h', '4h', '1d'].map((i) => `<option ${i === '1d' ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
        <label class="fld" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">اطلاع‌رسانی درباره</span><select class="inp" name="side">${AI_SIDES.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label>
        <button type="submit" class="btn primary" style="padding:10px 18px">${icon('alerts', 16)} ایجاد هشدار سیگنال هوش مصنوعی</button>
      </form>
      <p class="fine mt" style="margin:12px 0;color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.5">همان سیگنال موجود در صفحه هر ارز: قوانین معاملاتی تست‌شده نمودار، که هنگام بسته شدن کندل بررسی می‌شود. پیام اقدام انجام‌شده را اعلام می‌کند — خرید (همراه با حد ضرر) یا فروش (همراه با نتیجه پس از کسر کارمزد) — از طریق تلگرام یا ایمیل در صورت تنظیم، و روی این سایت در هر زمان که باز باشد (با اعلان مرورگر در صورت اجازه شما). در تست‌ها، خریدهایی از این دست جهت بازار را بهتر از شانس پیش‌بینی نکردند؛ صفحه ارز و سوابق عملکرد این سابقه را نشان می‌دهند. هیچ سفارشی در اینجا ثبت نمی‌شود.</p>
      ${mine.length ? `<div class="stack mt" style="display:flex;flex-direction:column;gap:8px;margin-top:14px">${mine.map((a) => `
        <div class="row spread" style="padding:12px 16px;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center">
          <div><b style="color:#fff">${esc(a.symbol)}</b> · نمودار ${esc(a.interval)} · ${esc(AI_SIDES.find(([v]) => v === (a.side || 'any'))?.[1] || 'خریدها و فروش‌ها')}
            <br><small class="muted" style="color:rgba(255,255,255,0.4)">${a.last_fired_at ? `آخرین فعال‌سازی ${ago(new Date(a.last_fired_at).getTime())}` : 'در انتظار خرید یا فروش'}</small></div>
          <button type="button" class="icon-btn" style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.06);border:0;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center" data-aidel="${esc(String(a.id))}" aria-label="حذف هشدار سیگنال هوش مصنوعی">${icon('trash', 14)}</button>
        </div>`).join('')}</div>` : '<p class="fine mt" style="color:rgba(255,255,255,0.5);margin-top:12px">هنوز هیچ هشدار سیگنال هوش مصنوعی ثبت نشده است.</p>'}`;

    $('#af', box)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f2 = e.currentTarget;
      const btn = f2.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        await createAiAlert({
          symbol: f2.sym.value,
          interval: f2.iv.value,
          side: f2.side.value,
          channels: ['telegram', 'email'],
          active: true,
        });
        toast(`هشدار سیگنال هوش مصنوعی برای ${f2.sym.value} روی نمودار ${f2.iv.value} تنظیم شد.`, 'up');
        drawAi();
      } catch (err) {
        toast(err.message, 'down');
        if (btn && !disposed) btn.disabled = false;
      }
    });
    $$('[data-aidel]', box).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await deleteAiAlert(b.dataset.aidel);
        drawAi();
      } catch (err) {
        toast(err.message, 'down');
        if (!disposed && b.isConnected) b.disabled = false;
      }
    }));
  }

  const signedIn = () => !!auth.user && backendEnabled();
  const reach = () => {
    const r = $('#reach', el);
    if (r) r.textContent = signedIn()
      ? 'وارد شده‌اید: سرور هشدارهای قیمت شما را نیز زیر نظر دارد و پس از اتصال در صفحه حساب کاربری، با بسته بودن سایت آن‌ها را به تلگرام یا ایمیل ارسال می‌کند.'
      : 'هنگام باز بودن سایت کار می‌کند. برای دریافت هشدارهای قیمت از طریق تلگرام یا ایمیل با بسته بودن سایت نیز وارد شوید.';
  };

  let elsewhere = [];
  const row = (c, sym, dir, lvl, sub, attr) => `<div class="row spread" style="padding:12px 16px;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center">
        <div class="row" style="display:flex;align-items:center;gap:12px">${coinLogo(c || { symbol: sym }, 28)}<div><b style="color:#fff">${esc(sym)}</b> ${esc(dir === 'above' ? 'بالاتر از' : dir === 'below' ? 'پایین‌تر از' : dir)} <b style="color:#fff">${money(lvl)}</b><br><small class="muted" style="color:rgba(255,255,255,0.4)">${sub}</small></div></div>
        <button type="button" class="icon-btn" style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.06);border:0;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center" ${attr} aria-label="حذف هشدار">${icon('trash', 14)}</button></div>`;

  const draw = () => {
    if (disposed) return;
    const alerts = load('alerts', []);
    const items = [
      ...alerts.map((a, i) => {
        const c = coins.find((x) => x.symbol === a.symbol);
        return row(
          c,
          a.symbol,
          a.dir,
          a.price,
          `${a.triggered ? `✅ فعال‌شده ${ago(a.triggered)}` : `در انتظار · اکنون ${money(c?.price)}`}${a.serverId ? ' · همچنین از طریق تلگرام / ایمیل' : ''}`,
          `data-del="${i}"`
        );
      }),
      ...elsewhere.map((a) => row(
        coins.find((x) => x.symbol === a.symbol),
        a.symbol,
        a.direction,
        Number(a.price),
        `${a.triggered_at ? `✅ فعال‌شده ${ago(new Date(a.triggered_at).getTime())}` : 'در انتظار'} · ذخیره‌شده روی دستگاه دیگر`,
        `data-srv="${esc(String(a.id))}"`
      )),
    ];
    const listEl = $('#list', el);
    if (listEl) {
      listEl.innerHTML = items.length
        ? `<div class="stack" style="display:flex;flex-direction:column;gap:8px">${items.join('')}</div>`
        : '<p class="muted" style="color:rgba(255,255,255,0.5)">هنوز هیچ هشداری ثبت نشده است.</p>';
    }
    $$('[data-del]', el).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      const al = load('alerts', []);
      const [gone] = al.splice(+b.dataset.del, 1);
      save('alerts', al);
      if (gone?.serverId) {
        try { await deleteServerAlert(gone.serverId); } catch (err) { toast(err.message, 'down'); }
      }
      draw();
    }));
    $$('[data-srv]', el).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await deleteServerAlert(b.dataset.srv);
        elsewhere = elsewhere.filter((a) => String(a.id) !== b.dataset.srv);
        draw();
      } catch (err) {
        toast(err.message, 'down');
        if (!disposed && b.isConnected) b.disabled = false;
      }
    }));
  };

  const loadElsewhere = async () => {
    const seq = ++elsewhereSeq;
    reach();
    if (!signedIn()) {
      elsewhere = [];
      draw();
      return;
    }
    const rows = await serverAlerts().catch(() => null);
    if (disposed || seq !== elsewhereSeq) return;
    if (!rows) return;
    const mine = new Set(load('alerts', []).map((a) => String(a.serverId)));
    elsewhere = rows.filter((a) => (a.kind ?? 'price') === 'price' && !mine.has(String(a.id)));
    draw();
  };

  f?.sym?.addEventListener('change', () => { f.price.value = ''; showCur(); });
  const onCurrency = () => {
    if (f) f.price.value = '';
    showCur();
    draw();
  };
  window.addEventListener('cv:currency', onCurrency);
  showCur();

  f?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button[type="submit"]');
    const typed = parseFloat(f.price.value);
    if (!(typed > 0)) {
      toast('قیمتی بالاتر از صفر وارد کنید.', 'down');
      return;
    }
    const entry = { symbol: f.sym.value, dir: f.dir.value, price: toUsd(typed), created: Date.now() };
    const nowPx = coins.find((c) => c.symbol === entry.symbol)?.price;
    const already = Number.isFinite(nowPx) && ((entry.dir === 'above' && nowPx >= entry.price) || (entry.dir === 'below' && nowPx <= entry.price));
    let where = 'هنگام باز بودن سایت کار می‌کند.';
    if (signedIn()) {
      if (btn) btn.disabled = true;
      try {
        entry.serverId = await createServerAlert({
          kind: 'price',
          symbol: entry.symbol,
          direction: entry.dir,
          price: entry.price,
          channels: ['telegram', 'email'],
          active: true,
        });
        where = 'سرور نیز آن را زیر نظر دارد.';
      } catch (err) {
        where = `فقط در این مرورگر ذخیره شد: ${err.message}`;
      }
      if (btn && !disposed) btn.disabled = false;
    }
    const alerts = load('alerts', []);
    alerts.unshift(entry);
    save('alerts', alerts);
    draw();
    toast(`هشدار تنظیم شد: ${entry.symbol} ${entry.dir === 'above' ? 'بالاتر از' : 'پایین‌تر از'} ${money(entry.price)}. ${where}${already ? ` ${entry.symbol} در حال حاضر ${entry.dir === 'above' ? 'بالاتر یا مساوی' : 'پایین‌تر یا مساوی'} آن قیمت است، بنابراین بلافاصله فعال خواهد شد.` : ''}`, 'info');
    f.price.value = '';
  });

  $('#perm', el)?.addEventListener('click', async () => {
    if (!hasNotifApi || typeof Notification.requestPermission !== 'function') return;
    try {
      const r = await Notification.requestPermission();
      const pb = $('#permBox', el);
      if (pb && !disposed) {
        pb.innerHTML = r === 'granted'
          ? '<p class="fine up" style="color:var(--up);margin:0">اعلان‌های مرورگر فعال هستند.</p>'
          : '<p class="fine" style="margin:0">اعلان‌ها مسدود شدند — هشدارها به جای آن روی صفحه نمایش داده می‌شوند.</p>';
      }
    } catch { /* نادیده گرفتن خطای مجوز */ }
  });

  $('#clear', el)?.addEventListener('click', async () => {
    const current = load('alerts', []);
    const kept = current.filter((a) => !a.triggered);
    const removed = current.filter((a) => a.triggered);
    save('alerts', kept);
    draw();
    for (const a of removed) {
      if (a.serverId) {
        try { await deleteServerAlert(a.serverId); } catch { /* خطا در حذف سمت سرور */ }
      }
    }
  });

  const onAuth = () => {
    drawSignals();
    drawAi();
    loadElsewhere();
  };
  auth.addEventListener('change', onAuth);

  const onStore = (e) => {
    if (e.detail?.key === 'alerts') draw();
  };
  window.addEventListener('cv:store', onStore);

  drawSignals();
  drawAi();
  draw();
  loadElsewhere();

  return () => {
    disposed = true;
    window.removeEventListener('cv:store', onStore);
    window.removeEventListener('cv:currency', onCurrency);
    auth.removeEventListener('change', onAuth);
  };
}