// ورود / ثبت‌نام / بازیابی رمز عبور — یک مودال واحد، بدون نیاز به ناوبری صفحه.
import { $, icon, modal, toast } from '../ui.js';
import { esc } from '../format.js';
import { signIn, signUp, callFn, sendResetLink } from '../api/backend.js';

const FORMS = {
  in: { title: 'خوش آمدید', cta: 'ورود' },
  up: { title: 'ایجاد حساب کاربری', cta: 'ایجاد حساب' },
  reset: { title: 'بازیابی رمز عبور', cta: 'تنظیم رمز عبور جدید' },
};

export function openAuth(mode = 'in') {
  const m = modal('<div id="authBody"></div>');
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
      <h3>${esc(f.title)}</h3>
      <p class="fine">حساب کاربری شما واچ‌لیست، سبد سرمایه، معاملات و هشدارها را در دستگاه‌های مختلف همگام‌سازی می‌کند. ${cur === 'up' ? 'رایگان — بدون نیاز به کارت بانکی.' : ''}</p>
      <form class="stack mt" style="gap:10px" id="af">
        ${cur === 'up' ? '<label class="fld">نام<input class="inp" name="name" autocomplete="name" maxlength="60"></label>' : ''}
        <label class="fld">ایمیل<input class="inp" name="email" type="email" autocomplete="email" required></label>
        ${cur === 'reset' ? `
          <p class="fine">${emailEnabled === false
            ? 'این سایت ارائه‌دهنده ایمیل متصلی ندارد، بنابراین نمی‌تواند کد ۶ رقمی ارسال کند. به جای آن از لینک بازیابی زیر استفاده کنید — این لینک مستقیماً از سرویس حساب کاربری آمده و نیازی به تنظیمات ندارد.'
            : 'یک کد ۶ رقمی به ایمیل شما ارسال خواهیم کرد.'}</p>
          <div class="row" style="gap:8px">
            <button type="button" class="btn sm" id="sendCode" ${emailEnabled === false ? 'disabled' : ''}>ارسال کد</button>
            <button type="button" class="btn sm" id="sendLink">ارسال لینک بازیابی به ایمیل</button>
            <span class="fine" id="codeMsg"></span>
          </div>
          <label class="fld">کد ۶ رقمی<input class="inp" name="code" inputmode="numeric" maxlength="6" pattern="\\d{6}" ${emailEnabled === false ? '' : 'required'}></label>
        ` : ''}
        <label class="fld">${cur === 'reset' ? 'رمز عبور جدید' : 'رمز عبور'}<input class="inp" name="password" type="password" autocomplete="${cur === 'in' ? 'current-password' : 'new-password'}" minlength="8" required></label>
        ${cur !== 'in' ? '<p class="fine">حداقل ۸ کاراکتر.</p>' : ''}
        <button class="btn primary" id="go">${icon('bolt', 16)} ${esc(f.cta)}</button>
        <p class="fine down" id="err" hidden></p>
      </form>
      <div class="row mt" style="gap:12px;font-size:12px">
        ${cur !== 'in' ? '<a href="#" data-go="in">ورود به جای آن</a>' : ''}
        ${cur !== 'up' ? '<a href="#" data-go="up">ایجاد حساب کاربری</a>' : ''}
        ${cur !== 'reset' ? '<a href="#" data-go="reset">رمز عبور خود را فراموش کرده‌اید؟</a>' : ''}
      </div>
      <p class="fine mt">با ادامه دادن، با <a href="#/legal/terms" data-close>شرایط</a> و <a href="#/legal/privacy" data-close>سیاست حریم خصوصی</a> موافقت می‌کنید. ما هرگز کلیدهای API صرافی، کلیدهای خصوصی یا عبارت بازیابی (Seed Phrase) را درخواست نمی‌کنیم.</p>`;

    m.el.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); paint(a.dataset.go); }));
    m.el.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', () => m.close()));

    const form = $('#af', m.el), err = $('#err', m.el), btn = $('#go', m.el);
    $('#sendLink', m.el)?.addEventListener('click', async (e) => {
      const email = form.email.value.trim();
      if (!email) { form.email.focus(); return; }
      const btn2 = e.currentTarget;
      btn2.disabled = true;
      $('#codeMsg', m.el).textContent = 'در حال ارسال…';
      try {
        await sendResetLink(email, `${location.origin}${location.pathname}`);
        $('#codeMsg', m.el).innerHTML = '<b>صندوق ورودی خود را بررسی کنید</b> — روی لینک کلیک کنید و در اینجا رمز عبور جدیدی تنظیم کنید.';
      } catch (err) {
        $('#codeMsg', m.el).textContent = err.message;
        btn2.disabled = false;
      }
    });

    $('#sendCode', m.el)?.addEventListener('click', async () => {
      const email = form.email.value.trim();
      if (!email) { form.email.focus(); return; }
      $('#codeMsg', m.el).textContent = 'در حال ارسال…';
      try {
        await callFn('account', { action: 'send-code', purpose: 'reset', email });
        $('#codeMsg', m.el).textContent = 'کد ارسال شد — صندوق ورودی (و پوشه اسپم) خود را بررسی کنید.';
      } catch (e) { $('#codeMsg', m.el).textContent = e.message; }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      btn.disabled = true;
      const old = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> در حال پردازش…';
      try {
        const email = form.email.value.trim(), password = form.password.value;
        if (cur === 'in') {
          await signIn(email, password);
        }
        else if (cur === 'up') await signUp(email, password, form.name.value.trim());
        else {
          const code = form.code.value.trim();
          if (!code) throw new Error('کد ۶ رقمی را وارد کنید، یا از گزینه «ارسال لینک بازیابی به ایمیل» در بالا استفاده کرده و روی لینک کلیک کنید.');
          await callFn('account', { action: 'reset-password', email, code, password });
          await signIn(email, password);
        }
        m.close();
        toast(cur === 'up' ? 'حساب کاربری ایجاد شد — اطلاعات شما اکنون در دستگاه‌های مختلف همگام‌سازی می‌شود.' : 'وارد شدید.', 'up');
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