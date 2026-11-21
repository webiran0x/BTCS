// ورود / ثبت‌نام / بازیابی رمز عبور — طراحی مدرن، راست‌به‌چپ و الهام‌گرفته از استانداردهای ۲۰۲۶ اپل.
import { $, icon, modal, toast } from '../ui.js';
import { esc } from '../format.js';
import { signIn, signUp, callFn, sendResetLink } from '../api/backend.js';

const FORMS = {
  in: {
    eyebrow: 'احراز هویت امن',
    title: 'خوش آمدید',
    sub: 'برای همگام‌سازی واچ‌لیست، پرتفوی و هشدارهای لحظه‌ای وارد شوید.',
    cta: 'ورود به حساب',
  },
  up: {
    eyebrow: 'شروع رایگان',
    title: 'ایجاد حساب کاربری',
    sub: 'دسترسی یکپارچه و همگام‌سازی خودکار در تمامی دستگاه‌ها.',
    cta: 'ساخت حساب کاربری',
  },
  reset: {
    eyebrow: 'بازیابی دسترسی',
    title: 'بازیابی رمز عبور',
    sub: 'تنظیم رمز عبور جدید برای بازگشت امن به حساب کاربری.',
    cta: 'تایید و تغییر رمز عبور',
  },
};

export function openAuth(mode = 'in') {
  const m = modal('<div id="authBody" dir="rtl" class="ap26-auth"></div>');
  let closed = false;
  let cooldownTimer = null;
  let cooldownSec = 0;

  const origClose = m.close.bind(m);
  m.close = () => {
    closed = true;
    if (cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
    origClose();
  };

  if (!document.getElementById('ap26-auth-style')) {
    const style = document.createElement('style');
    style.id = 'ap26-auth-style';
    style.textContent = `
      .ap26-auth {
        --ap-font: 'IRANYekanXVF', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
        --ap-ink: var(--text, #f5f5f7);
        --ap-muted: rgba(245, 245, 247, 0.58);
        --ap-soft: rgba(245, 245, 247, 0.4);
        --ap-glass: rgba(255, 255, 255, 0.045);
        --ap-glass-hover: rgba(255, 255, 255, 0.085);
        --ap-line: rgba(255, 255, 255, 0.11);
        --ap-blue: #0a84ff;
        --ap-blue-grad: linear-gradient(180deg, #2997ff 0%, #0071e3 100%);
        --ap-green: #30d158;
        --ap-red: #ff6961;
        direction: rtl;
        text-align: right;
        font-family: var(--ap-font);
        color: var(--ap-ink);
        padding: 4px 2px 2px;
        font-variant-numeric: tabular-nums;
      }
      .ap26-auth-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        color: rgba(245, 245, 247, 0.72);
        background: var(--ap-glass);
        border: 1px solid var(--ap-line);
        padding: 4px 10px;
        border-radius: 999px;
        margin-bottom: 10px;
      }
      .ap26-auth-badge i {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--ap-blue);
        box-shadow: 0 0 8px var(--ap-blue);
      }
      .ap26-auth-head {
        margin-bottom: 20px;
      }
      .ap26-auth-head h3 {
        font-size: 23px;
        font-weight: 700;
        letter-spacing: -0.025em;
        line-height: 1.25;
        margin: 0 0 6px 0;
        background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.76) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .ap26-auth-head p {
        font-size: 13px;
        line-height: 1.65;
        color: var(--ap-muted);
        margin: 0;
      }
      .ap26-auth-form {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .ap26-auth-fld {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12.5px;
        font-weight: 500;
        color: rgba(245, 245, 247, 0.84);
      }
      .ap26-auth-label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .ap26-auth-hint {
        font-size: 11px;
        font-weight: 400;
        color: var(--ap-soft);
      }
      .ap26-auth-input-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .ap26-auth-inp {
        width: 100%;
        box-sizing: border-box;
        height: 44px;
        padding: 0 14px;
        border-radius: 14px;
        border: 1px solid var(--ap-line);
        background: var(--ap-glass);
        backdrop-filter: blur(20px) saturate(160%);
        -webkit-backdrop-filter: blur(20px) saturate(160%);
        color: #ffffff;
        font-size: 14px;
        font-family: var(--ap-font);
        transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        outline: none;
      }
      .ap26-auth-inp.has-toggle {
        padding-left: 56px;
      }
      .ap26-auth-inp[dir="ltr"] {
        text-align: left;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
        letter-spacing: 0.02em;
      }
      .ap26-auth-inp::placeholder {
        color: rgba(245, 245, 247, 0.32);
      }
      .ap26-auth-inp:hover {
        border-color: rgba(255, 255, 255, 0.2);
        background: var(--ap-glass-hover);
      }
      .ap26-auth-inp:focus-visible {
        border-color: var(--ap-blue);
        background: rgba(10, 132, 255, 0.07);
        box-shadow: 0 0 0 3.5px rgba(10, 132, 255, 0.24);
      }
      .ap26-auth-eye {
        position: absolute;
        left: 8px;
        height: 30px;
        padding: 0 9px;
        border-radius: 9px;
        border: none;
        background: transparent;
        color: var(--ap-muted);
        font-size: 11.5px;
        font-weight: 500;
        font-family: var(--ap-font);
        cursor: pointer;
        transition: color 0.16s ease, background 0.16s ease;
      }
      .ap26-auth-eye:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.08);
      }
      .ap26-auth-reset-box {
        padding: 13px 14px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.09);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ap26-auth-reset-box p {
        margin: 0;
        font-size: 12px;
        line-height: 1.65;
        color: rgba(245, 245, 247, 0.68);
      }
      .ap26-auth-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .ap26-auth-sec-btn {
        height: 36px;
        padding: 0 13px;
        border-radius: 11px;
        border: 1px solid var(--ap-line);
        background: rgba(255, 255, 255, 0.06);
        color: rgba(245, 245, 247, 0.92);
        font-size: 12px;
        font-weight: 500;
        font-family: var(--ap-font);
        cursor: pointer;
        transition: background 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
      }
      .ap26-auth-sec-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.13);
        border-color: rgba(255, 255, 255, 0.22);
      }
      .ap26-auth-sec-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .ap26-auth-status {
        font-size: 12px;
        line-height: 1.5;
        min-height: 18px;
      }
      .ap26-auth-primary {
        width: 100%;
        height: 46px;
        margin-top: 4px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: var(--ap-blue-grad);
        color: #ffffff;
        font-size: 14px;
        font-weight: 600;
        font-family: var(--ap-font);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        box-shadow: 0 6px 20px rgba(0, 113, 227, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.28);
        transition: transform 0.15s ease, filter 0.2s ease, box-shadow 0.2s ease;
      }
      .ap26-auth-primary:hover:not(:disabled) {
        filter: brightness(1.07);
        box-shadow: 0 8px 24px rgba(0, 113, 227, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.32);
      }
      .ap26-auth-primary:active:not(:disabled) {
        transform: scale(0.985);
      }
      .ap26-auth-primary:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .ap26-auth-err {
        padding: 10px 13px;
        border-radius: 12px;
        background: rgba(255, 69, 58, 0.13);
        border: 1px solid rgba(255, 69, 58, 0.28);
        color: var(--ap-red);
        font-size: 12.5px;
        line-height: 1.55;
        margin: 0;
      }
      .ap26-auth-nav {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      .ap26-auth-nav a {
        color: #2997ff;
        text-decoration: none;
        font-size: 12.5px;
        font-weight: 500;
        transition: opacity 0.16s ease;
      }
      .ap26-auth-nav a:hover {
        opacity: 0.8;
        text-decoration: underline;
      }
      .ap26-auth-legal {
        margin-top: 14px;
        font-size: 11px;
        line-height: 1.7;
        color: var(--ap-soft);
      }
      .ap26-auth-legal a {
        color: rgba(245, 245, 247, 0.72);
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }

  let emailEnabled = null;
  callFn('account', { action: 'email-status' })
    .then((r) => {
      if (closed) return;
      emailEnabled = Boolean(r?.emailEnabled);
      const body = $('#authBody', m.el);
      const typed = body && [...body.querySelectorAll('input')].some((i) => i.value !== '');
      if (!typed) paint(cur);
    })
    .catch(() => {
      if (!closed) emailEnabled = false;
    });

  let cur = FORMS[mode] ? mode : 'in';

  function startCooldown(sec = 45) {
    cooldownSec = sec;
    if (cooldownTimer) clearInterval(cooldownTimer);
    const updateButtons = () => {
      if (closed) return;
      const sendLinkBtn = $('#sendLink', m.el);
      const sendCodeBtn = $('#sendCode', m.el);
      const label = cooldownSec > 0 ? `ارسال مجدد (${cooldownSec}s)` : null;
      if (sendLinkBtn) {
        sendLinkBtn.disabled = cooldownSec > 0;
        sendLinkBtn.textContent = label || 'ارسال لینک بازیابی';
      }
      if (sendCodeBtn) {
        const disabledByEmail = emailEnabled === false;
        sendCodeBtn.disabled = disabledByEmail || cooldownSec > 0;
        sendCodeBtn.textContent = label || 'ارسال کد ۶ رقمی';
      }
      if (cooldownSec <= 0 && cooldownTimer) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
      cooldownSec -= 1;
    };
    updateButtons();
    cooldownTimer = setInterval(updateButtons, 1000);
  }

  function paint(next) {
    if (closed) return;
    cur = FORMS[next] ? next : 'in';
    const f = FORMS[cur];
    const body = $('#authBody', m.el);
    if (!body) return;

    body.innerHTML = `
      <div class="ap26-auth-head">
        <span class="ap26-auth-badge"><i aria-hidden="true"></i>${esc(f.eyebrow)}</span>
        <h3>${esc(f.title)}</h3>
        <p>${esc(f.sub)}</p>
      </div>

      <form class="ap26-auth-form" id="af" novalidate>
        ${cur === 'up' ? `
          <label class="ap26-auth-fld">
            <span>نام و نام خانوادگی</span>
            <input class="ap26-auth-inp" name="name" placeholder="مثلاً: بهزاد جلالی" autocomplete="name" maxlength="60">
          </label>` : ''}

        <label class="ap26-auth-fld">
          <span>نشانی ایمیل</span>
          <input class="ap26-auth-inp" dir="ltr" name="email" type="email" placeholder="name@example.com" autocomplete="email" required>
        </label>

        ${cur === 'reset' ? `
          <div class="ap26-auth-reset-box">
            <p>
              ${emailEnabled === false
                ? 'ارسال کد مستقیم در حال حاضر غیرفعال است؛ برای دریافت لینک مستقیم بازیابی از دکمه زیر استفاده کنید.'
                : 'کد تایید ۶ رقمی یا لینک مستقیم بازیابی را به ایمیل خود ارسال کنید.'}
            </p>
            <div class="ap26-auth-actions">
              <button type="button" class="ap26-auth-sec-btn" id="sendCode" ${emailEnabled === false ? 'disabled' : ''}>ارسال کد ۶ رقمی</button>
              <button type="button" class="ap26-auth-sec-btn" id="sendLink">ارسال لینک بازیابی</button>
            </div>
            <div class="ap26-auth-status" id="codeMsg" role="status" aria-live="polite"></div>
          </div>

          <label class="ap26-auth-fld">
            <span>کد تایید ۶ رقمی</span>
            <input class="ap26-auth-inp" dir="ltr" name="code" inputmode="numeric" placeholder="••••••" maxlength="6" pattern="\\d{6}" ${emailEnabled === false ? '' : 'required'}>
          </label>
        ` : ''}

        <label class="ap26-auth-fld">
          <span class="ap26-auth-label-row">
            <span>${cur === 'reset' ? 'رمز عبور جدید' : 'رمز عبور'}</span>
            ${cur !== 'in' ? '<span class="ap26-auth-hint">حداقل ۸ کاراکتر</span>' : ''}
          </span>
          <span class="ap26-auth-input-wrap">
            <input class="ap26-auth-inp has-toggle" dir="ltr" id="pwInput" name="password" type="password" placeholder="••••••••" autocomplete="${cur === 'in' ? 'current-password' : 'new-password'}" minlength="8" required>
            <button type="button" class="ap26-auth-eye" id="togglePw" aria-label="نمایش یا مخفی کردن رمز عبور">نمایش</button>
          </span>
        </label>

        <p class="ap26-auth-err" id="err" role="alert" hidden></p>

        <button type="submit" class="ap26-auth-primary" id="go">
          ${icon('bolt', 16)}
          <span>${esc(f.cta)}</span>
        </button>
      </form>

      <nav class="ap26-auth-nav" aria-label="تغییر حالت احراز هویت">
        ${cur !== 'in' ? '<a href="#" data-go="in">بازگشت به صفحه ورود</a>' : ''}
        ${cur !== 'up' ? '<a href="#" data-go="up">ساخت حساب جدید</a>' : ''}
        ${cur !== 'reset' ? '<a href="#" data-go="reset">فراموشی رمز عبور؟</a>' : ''}
      </nav>

      <p class="ap26-auth-legal">
        با ادامه دادن، با <a href="#/legal/terms" data-close>قوانین و مقررات</a> و <a href="#/legal/privacy" data-close>حریم خصوصی</a> موافقت می‌کنید. ما هرگز کلید API صرافی، کلید خصوصی یا عبارت بازیابی (Seed Phrase) را درخواست نمی‌کنیم.
      </p>`;

    body.querySelectorAll('[data-go]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        paint(a.dataset.go);
      });
    });
    body.querySelectorAll('[data-close]').forEach((a) => {
      a.addEventListener('click', () => m.close());
    });

    const pwInput = $('#pwInput', body);
    const togglePw = $('#togglePw', body);
    togglePw?.addEventListener('click', () => {
      if (!pwInput) return;
      const isHidden = pwInput.type === 'password';
      pwInput.type = isHidden ? 'text' : 'password';
      togglePw.textContent = isHidden ? 'مخفی' : 'نمایش';
    });

    const form = $('#af', body);
    const err = $('#err', body);
    const btn = $('#go', body);
    const codeMsg = $('#codeMsg', body);

    const setStatus = (text, color) => {
      if (!codeMsg) return;
      codeMsg.style.color = color;
      codeMsg.textContent = text;
    };

    const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

    $('#sendLink', body)?.addEventListener('click', async () => {
      const email = form.email.value.trim();
      if (!isValidEmail(email)) {
        setStatus('لطفاً نشانی ایمیل معتبر وارد کنید.', '#ff6961');
        form.email.focus();
        return;
      }
      setStatus('در حال ارسال لینک بازیابی…', 'rgba(245,245,247,0.72)');
      try {
        await sendResetLink(email, `${location.origin}${location.pathname}`);
        setStatus('لینک بازیابی ارسال شد؛ صندوق ورودی (و پوشه هرزنامه) را بررسی کنید.', '#30d158');
        startCooldown(45);
      } catch (e2) {
        setStatus(e2.message || 'خطا در ارسال لینک.', '#ff6961');
      }
    });

    $('#sendCode', body)?.addEventListener('click', async () => {
      const email = form.email.value.trim();
      if (!isValidEmail(email)) {
        setStatus('لطفاً نشانی ایمیل معتبر وارد کنید.', '#ff6961');
        form.email.focus();
        return;
      }
      setStatus('در حال ارسال کد ۶ رقمی…', 'rgba(245,245,247,0.72)');
      try {
        await callFn('account', { action: 'send-code', purpose: 'reset', email });
        setStatus('کد ۶ رقمی ارسال شد؛ صندوق ورودی را بررسی کنید.', '#30d158');
        startCooldown(45);
      } catch (e2) {
        setStatus(e2.message || 'خطا در ارسال کد.', '#ff6961');
      }
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (closed || !err || !btn) return;
      err.hidden = true;

      const email = form.email.value.trim();
      const password = form.password.value;
      const name = cur === 'up' ? (form.name?.value.trim() || '') : '';

      if (!isValidEmail(email)) {
        err.textContent = 'لطفاً یک نشانی ایمیل معتبر وارد کنید.';
        err.hidden = false;
        form.email.focus();
        return;
      }
      if (password.length < 8) {
        err.textContent = 'رمز عبور باید حداقل ۸ کاراکتر باشد.';
        err.hidden = false;
        form.password.focus();
        return;
      }

      btn.disabled = true;
      const old = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> <span>در حال پردازش…</span>';

      try {
        if (cur === 'in') {
          await signIn(email, password);
        } else if (cur === 'up') {
          await signUp(email, password, name);
        } else {
          const code = (form.code?.value || '').trim();
          if (!/^\d{6}$/.test(code)) {
            throw new Error('کد تایید ۶ رقمی را وارد کنید یا از گزینه ارسال لینک بازیابی استفاده نمایید.');
          }
          await callFn('account', { action: 'reset-password', email, code, password });
          await signIn(email, password);
        }
        if (closed) return;
        m.close();
        toast(cur === 'up' ? 'حساب کاربری با موفقیت ساخته شد.' : 'خوش آمدید؛ با موفقیت وارد شدید.', 'up');
      } catch (e2) {
        if (closed) return;
        err.textContent = e2?.message || 'خطایی رخ داد؛ لطفاً دوباره تلاش کنید.';
        err.hidden = false;
        btn.disabled = false;
        btn.innerHTML = old;
      }
    });
  }

  paint(cur);
  return m;
}