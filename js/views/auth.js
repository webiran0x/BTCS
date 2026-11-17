// ورود / ثبت‌نام / بازیابی رمز عبور — طراحی مدرن، راست‌به‌چپ و الهام‌گرفته از استانداردهای ۲۰۲۶ اپل.
import { $, icon, modal, toast } from '../ui.js';
import { esc } from '../format.js';
import { signIn, signUp, callFn, sendResetLink } from '../api/backend.js';

const FORMS = {
  in: { title: 'خوش آمدید', sub: 'برای همگام‌سازی واچ‌لیست، پرتفوی و هشدارها وارد شوید.', cta: 'ورود به حساب' },
  up: { title: 'ایجاد حساب کاربری', sub: 'رایگان — دسترسی سریع و همگام‌سازی لحظه‌ای در تمام دستگاه‌ها.', cta: 'ساخت حساب کاربری' },
  reset: { title: 'بازیابی رمز عبور', sub: 'تنظیم رمز عبور جدید برای بازگشت امن به حساب کاربری.', cta: 'تایید و تغییر رمز عبور' },
};

export function openAuth(mode = 'in') {
  const m = modal('<div id="authBody" dir="rtl" class="apple-auth-modal"></div>');
  
  // تزریق استایل‌های اختصاصی مدرن و مینیمال ۲۰۲۶ (بدون نیاز به تغییر در فایل CSS کلی)
  if (!document.getElementById('apple-auth-2026-css')) {
    const style = document.createElement('style');
    style.id = 'apple-auth-2026-css';
    style.textContent = `
      .apple-auth-modal {
        direction: rtl;
        text-align: right;
        font-family: 'IRANYekanXVF', -apple-system, BlinkMacSystemFont, sans-serif;
        color: var(--text, #f5f5f7);
        padding: 8px 4px;
      }
      .apple-auth-header {
        margin-bottom: 22px;
      }
      .apple-auth-header h3 {
        font-size: 24px;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin: 0 0 6px 0;
        background: linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.78) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .apple-auth-header p {
        font-size: 13.5px;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.58);
        margin: 0;
      }
      .apple-fld {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12.5px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.8);
      }
      .apple-inp {
        width: 100%;
        box-sizing: border-box;
        height: 44px;
        padding: 0 14px;
        border-radius: 13px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.045);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        color: #fff;
        font-size: 14px;
        font-family: inherit;
        transition: all 0.22s cubic-bezier(0.25, 1, 0.5, 1);
        outline: none;
      }
      .apple-inp[dir="ltr"] {
        text-align: left;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: 0.02em;
      }
      .apple-inp:focus {
        border-color: #0a84ff;
        background: rgba(10, 132, 255, 0.06);
        box-shadow: 0 0 0 3.5px rgba(10, 132, 255, 0.22);
      }
      .apple-btn-primary {
        width: 100%;
        height: 46px;
        margin-top: 6px;
        border-radius: 14px;
        border: none;
        background: linear-gradient(180deg, #1c8eff 0%, #0071e3 100%);
        color: #ffffff;
        font-size: 14.5px;
        font-weight: 600;
        font-family: inherit;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0, 113, 227, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25);
        transition: transform 0.15s ease, filter 0.2s ease, box-shadow 0.2s ease;
      }
      .apple-btn-primary:hover:not(:disabled) {
        filter: brightness(1.08);
        box-shadow: 0 6px 22px rgba(0, 113, 227, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.3);
      }
      .apple-btn-primary:active:not(:disabled) {
        transform: scale(0.985);
      }
      .apple-btn-primary:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .apple-btn-secondary {
        height: 36px;
        padding: 0 13px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.9);
        font-size: 12.5px;
        font-weight: 500;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.18s ease;
      }
      .apple-btn-secondary:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.12);
      }
      .apple-btn-secondary:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .apple-reset-box {
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .apple-nav-links {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      .apple-nav-links a {
        color: #2997ff;
        text-decoration: none;
        font-size: 13px;
        font-weight: 500;
        transition: opacity 0.15s ease;
      }
      .apple-nav-links a:hover {
        opacity: 0.8;
        text-decoration: underline;
      }
      .apple-err {
        padding: 10px 12px;
        border-radius: 11px;
        background: rgba(255, 69, 58, 0.12);
        border: 1px solid rgba(255, 69, 58, 0.25);
        color: #ff6961;
        font-size: 12.5px;
        line-height: 1.5;
        margin: 0;
      }
      .apple-legal {
        margin-top: 16px;
        font-size: 11.5px;
        line-height: 1.65;
        color: rgba(255, 255, 255, 0.42);
      }
      .apple-legal a {
        color: rgba(255, 255, 255, 0.68);
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }

  let emailEnabled = null;
  callFn('account', { action: 'email-status' })
    .then((r) => {
      emailEnabled = r.emailEnabled;
      const body = $('#authBody', m.el);
      const typed = body && [...body.querySelectorAll('input')].some((i) => i.value !== '');
      if (!typed) paint(cur);
    })
    .catch(() => { emailEnabled = false; });

  let cur = mode;
  function paint(next) {
    cur = next;
    const f = FORMS[cur];
    $('#authBody', m.el).innerHTML = `
      <div class="apple-auth-header">
        <h3>${esc(f.title)}</h3>
        <p>${esc(f.sub)}</p>
      </div>

      <form class="stack" style="gap:14px" id="af">
        ${cur === 'up' ? `
          <label class="apple-fld">
            <span>نام و نام خانوادگی</span>
            <input class="apple-inp" name="name" placeholder="مثلاً: بهزاد جلالی" autocomplete="name" maxlength="60">
          </label>` : ''}

        <label class="apple-fld">
          <span>نشانی ایمیل</span>
          <input class="apple-inp" dir="ltr" name="email" type="email" placeholder="name@example.com" autocomplete="email" required>
        </label>

        ${cur === 'reset' ? `
          <div class="apple-reset-box">
            <p class="fine" style="margin:0;line-height:1.6;color:rgba(255,255,255,0.68)">
              ${emailEnabled === false
                ? 'سرویس ارسال کد مستقیم فعال نیست. از دکمه ارسال لینک بازیابی استفاده کنید تا لینک مستقیم به ایمیل شما فرستاده شود.'
                : 'کد تایید ۶ رقمی یا لینک بازیابی مستقیم را به ایمیل خود ارسال کنید.'}
            </p>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button type="button" class="apple-btn-secondary" id="sendCode" ${emailEnabled === false ? 'disabled' : ''}>ارسال کد ۶ رقمی</button>
              <button type="button" class="apple-btn-secondary" id="sendLink">ارسال لینک بازیابی</button>
            </div>
            <span class="fine" id="codeMsg" style="color:#30d158"></span>
          </div>

          <label class="apple-fld">
            <span>کد تایید ۶ رقمی</span>
            <input class="apple-inp" dir="ltr" name="code" inputmode="numeric" placeholder="••••••" maxlength="6" pattern="\\d{6}" ${emailEnabled === false ? '' : 'required'}>
          </label>
        ` : ''}

        <label class="apple-fld">
          <div class="row spread">
            <span>${cur === 'reset' ? 'رمز عبور جدید' : 'رمز عبور'}</span>
            ${cur !== 'in' ? '<span style="font-size:11px;color:rgba(255,255,255,0.45)">حداقل ۸ کاراکتر</span>' : ''}
          </div>
          <input class="apple-inp" dir="ltr" name="password" type="password" placeholder="••••••••" autocomplete="${cur === 'in' ? 'current-password' : 'new-password'}" minlength="8" required>
        </label>

        <p class="apple-err" id="err" hidden></p>

        <button class="apple-btn-primary" id="go">
          ${icon('bolt', 16)}
          <span>${esc(f.cta)}</span>
        </button>
      </form>

      <div class="apple-nav-links">
        ${cur !== 'in' ? '<a href="#" data-go="in">بازگشت به صفحه ورود</a>' : ''}
        ${cur !== 'up' ? '<a href="#" data-go="up">ساخت حساب جدید</a>' : ''}
        ${cur !== 'reset' ? '<a href="#" data-go="reset">فراموشی رمز عبور؟</a>' : ''}
      </div>

      <p class="apple-legal">
        با ادامه دادن، با <a href="#/legal/terms" data-close>قوانین و مقررات</a> و <a href="#/legal/privacy" data-close>حریم خصوصی</a> موافقت می‌کنید. ما هرگز کلیدهای API صرافی، کلید خصوصی یا عبارت بازیابی (Seed Phrase) را درخواست نمی‌کنیم.
      </p>`;

    m.el.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); paint(a.dataset.go); }));
    m.el.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => m.close()));

    const form = $('#af', m.el), err = $('#err', m.el), btn = $('#go', m.el);
    $('#sendLink', m.el)?.addEventListener('click', async (e) => {
      const email = form.email.value.trim();
      if (!email) { form.email.focus(); return; }
      const btn2 = e.currentTarget;
      btn2.disabled = true;
      $('#codeMsg', m.el).style.color = 'rgba(255,255,255,0.7)';
      $('#codeMsg', m.el).textContent = 'در حال ارسال لینک…';
      try {
        await sendResetLink(email, `${location.origin}${location.pathname}`);
        $('#codeMsg', m.el).style.color = '#30d158';
        $('#codeMsg', m.el).innerHTML = 'لینک ارسال شد — صندوق ورودی ایمیل خود را بررسی کنید.';
      } catch (err2) {
        $('#codeMsg', m.el).style.color = '#ff6961';
        $('#codeMsg', m.el).textContent = err2.message;
        btn2.disabled = false;
      }
    });

    $('#sendCode', m.el)?.addEventListener('click', async () => {
      const email = form.email.value.trim();
      if (!email) { form.email.focus(); return; }
      $('#codeMsg', m.el).style.color = 'rgba(255,255,255,0.7)';
      $('#codeMsg', m.el).textContent = 'در حال ارسال کد…';
      try {
        await callFn('account', { action: 'send-code', purpose: 'reset', email });
        $('#codeMsg', m.el).style.color = '#30d158';
        $('#codeMsg', m.el).textContent = 'کد ۶ رقمی ارسال شد — صندوق ورودی (و اسپم) را چک کنید.';
      } catch (e) {
        $('#codeMsg', m.el).style.color = '#ff6961';
        $('#codeMsg', m.el).textContent = e.message;
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      btn.disabled = true;
      const old = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> <span>در حال پردازش…</span>';
      try {
        const email = form.email.value.trim(), password = form.password.value;
        if (cur === 'in') {
          await signIn(email, password);
        }
        else if (cur === 'up') await signUp(email, password, form.name.value.trim());
        else {
          const code = form.code.value.trim();
          if (!code) throw new Error('کد ۶ رقمی را وارد کنید یا از گزینه ارسال لینک بازیابی استفاده نمایید.');
          await callFn('account', { action: 'reset-password', email, code, password });
          await signIn(email, password);
        }
        m.close();
        toast(cur === 'up' ? 'حساب کاربری با موفقیت ساخته شد.' : 'خوش آمدید، با موفقیت وارد شدید.', 'up');
      } catch (e2) {
        err.textContent = e2.message;
        err.hidden = false;
        btn.disabled = false;
        btn.innerHTML = old;
      }
    });
  }
  paint(mode);
  return m;
}