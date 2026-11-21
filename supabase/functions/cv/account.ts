// Account actions: sign-up (no confirmation e-mail needed), e-mail verification & password
// reset codes (when e-mail is configured), Telegram linking, Stripe checkout.
import {
  admin, json, HttpError, requireUser, getProfile, rateLimit, clientIp, secret, setting,
  sendEmail, sendTelegram, sha256Hex, randomCode, escHtml, SUPABASE_URL, toMinor,
} from './lib.ts';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,24}$/i;

// Stripe sends the buyer back to this address after paying, so it has to be the
// site itself (or a local copy while developing), never an address the caller
// picked. Extra hosts, e.g. a custom domain, go in SITE_ORIGINS, comma-separated.
const DenoEnv = (globalThis as unknown as { Deno?: { env: { get(name: string): string | undefined } } }).Deno?.env;
const SITE_ORIGINS = (DenoEnv?.get('SITE_ORIGINS') || 'https://btcs.ir')
  .split(',').map((o) => o.trim()).filter(Boolean);

function siteReturnUrl(raw: unknown): string {
  try {
    const u = new URL(String(raw || '').split('#')[0]);
    const local = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    if (!local && !(u.protocol === 'https:' && SITE_ORIGINS.includes(u.origin))) return '';
    return u.origin + u.pathname + u.search;
  } catch {
    return '';
  }
}

async function codeHash(email: string, code: string) {
  return sha256Hex(`${email.toLowerCase()}:${code}:${(await secret('cron_secret')) || ''}`);
}


function emailHtml(title: string, intro: string, code?: string): string {
  const codeBlock = code ? `
    <tr>
      <td align="center" style="padding:8px 28px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:#f5f5f7;border:1px solid #e8e8ed;border-radius:16px;width:100%;">
          <tr><td align="center" style="padding:18px 12px 8px;color:#6e6e73;font-family:Tahoma,Arial,sans-serif;font-size:13px;">کد اختصاصی شما</td></tr>
          <tr><td align="center" dir="ltr" style="padding:0 12px 8px;color:#1d1d1f;font-family:Arial,Tahoma,sans-serif;font-size:34px;font-weight:700;letter-spacing:8px;line-height:1.5;">${code}</td></tr>
          <tr><td align="center" style="padding:0 12px 18px;color:#86868b;font-family:Tahoma,Arial,sans-serif;font-size:12px;">این کد تا ۱۵ دقیقه معتبر است.</td></tr>
        </table>
      </td>
    </tr>` : '';

  const closing = code
    ? 'اگر شما این درخواست را ثبت نکرده‌اید، نیازی به انجام کاری نیست؛ کافی است این ایمیل را نادیده بگیرید.'
    : 'از اینکه BTCS IR را انتخاب کرده‌اید، سپاسگزاریم.';

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body dir="rtl" style="margin:0;padding:0;background:#f5f5f7;color:#1d1d1f;font-family:Tahoma,Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${intro}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;border-collapse:collapse;">
    <tr><td align="center" style="padding:32px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e8ed;border-radius:22px;overflow:hidden;border-collapse:separate;">
        <tr><td align="center" style="padding:28px 24px 20px;border-bottom:1px solid #f0f0f2;">
          <div dir="ltr" style="font-family:Arial,Tahoma,sans-serif;font-size:23px;font-weight:800;letter-spacing:1px;color:#1d1d1f;">BTCS <span style="color:#0a84ff;">IR</span></div>
          <div style="padding-top:7px;color:#86868b;font-size:11px;letter-spacing:1px;">SMARTER MARKET INSIGHTS</div>
        </td></tr>
        <tr><td align="center" style="padding:30px 28px 10px;">
          <div style="font-size:21px;font-weight:700;line-height:1.8;color:#1d1d1f;">${title}</div>
          <div style="padding-top:8px;font-size:14px;line-height:2;color:#6e6e73;">${intro}</div>
        </td></tr>
        ${codeBlock}
        <tr><td align="center" style="padding:0 28px 28px;">
          <div style="font-size:12px;line-height:2;color:#86868b;">${closing}</div>
        </td></tr>
        <tr><td align="center" style="padding:18px 20px;background:#fafafa;border-top:1px solid #f0f0f2;">
          <div style="font-size:12px;color:#6e6e73;line-height:1.9;">با آرزوی تجربه‌ای بهتر در بازارهای مالی</div>
          <div style="font-size:12px;font-weight:700;color:#1d1d1f;">تیم BTCS IR</div>
          <div style="padding-top:8px;font-size:10px;color:#a1a1a6;">این پیام به‌صورت خودکار ارسال شده است.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function account(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');

  switch (action) {
    case 'signup': {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const name = String(body.display_name || '').trim().slice(0, 60);
      if (!EMAIL_RE.test(email)) throw new HttpError('لطفاً یک آدرس ایمیل معتبر وارد کنید.');
      if (password.length < 8) throw new HttpError('رمز عبور باید حداقل ۸ کاراکتر باشد.');
      await rateLimit(`signup:${clientIp(req)}`, 5, 3600);
      await rateLimit('signup:global', 300, 3600);
      const { error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name: name || email.split('@')[0] },
      });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) throw new HttpError('حساب کاربری با این ایمیل از قبل وجود دارد. لطفاً وارد شوید.', 409);
        throw new HttpError(error.message, 400);
      }
      return json({ ok: true });
    }

    case 'email-status': {
      const hasEmail = !!(await secret('resend_api_key'));
      return json({ emailEnabled: hasEmail });
    }

    case 'send-code': {
      const purpose = body.purpose === 'reset' ? 'reset' : 'verify';
      let email = String(body.email || '').trim().toLowerCase();
      if (purpose === 'verify') {
        const user = await requireUser(req);
        email = user.email!.toLowerCase();
      }
      if (!EMAIL_RE.test(email)) throw new HttpError('لطفاً یک آدرس ایمیل معتبر وارد کنید.');
      if (!(await secret('resend_api_key'))) throw new HttpError('سیستم ارسال ایمیل هنوز روی سایت تنظیم نشده است. با مدیر سایت تماس بگیرید.', 503);
      await rateLimit(`code:${email}`, 3, 900);
      // At most 8 codes a day for one address (5 guesses each)
      await rateLimit(`code-day:${email}`, 8, 86400);
      await rateLimit(`code-ip:${clientIp(req)}`, 10, 3600);
      // Don't reveal whether an account exists for password resets.
      if (purpose === 'reset') {
        const { data } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
        if (!data) return json({ ok: true });
      }
      const code = randomCode(6);
      const h = await codeHash(email, code);
      await admin.from('auth_codes').insert({ 
        email, 
        purpose, 
        code_hash: h, 
        expires_at: new Date(Date.now() + 15 * 60e3).toISOString() 
      });
      const title = purpose === 'verify' ? 'ایمیل شما را تأیید کنیم؟' : 'بازیابی رمز عبور';
      const intro = purpose === 'verify'
        ? 'خوشحالیم که در BTCS IR همراه ما هستید. برای تکمیل تأیید ایمیل، کد زیر را در صفحه حساب کاربری وارد کنید.'
        : 'برای انتخاب رمز عبور جدید، کد زیر را در صفحه بازیابی رمز عبور وارد کنید.';
      const subject = purpose === 'verify' ? 'کد تأیید ایمیل شما | BTCS IR' : 'کد بازیابی رمز عبور | BTCS IR';
      const mail = await sendEmail(email, subject, emailHtml(title, intro, code));
      if (!mail?.ok) {
        await admin.from('auth_codes').delete().eq('email', email).eq('purpose', purpose).eq('code_hash', h);
        throw new HttpError(mail?.error || mail?.message || 'ارسال ایمیل ناموفق بود.', 502);
      }
      return json({ ok: true });
    }

    case 'verify-email': {
      const user = await requireUser(req);
      await checkCode(user.email!, 'verify', String(body.code || ''));
      await admin.from('profiles').update({ email_verified: true }).eq('id', user.id);
      return json({ ok: true });
    }

    case 'reset-password': {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (password.length < 8) throw new HttpError('رمز عبور باید حداقل ۸ کاراکتر باشد.');
      await rateLimit(`reset:${clientIp(req)}`, 10, 3600);
      await checkCode(email, 'reset', String(body.code || ''));
      const { data: prof } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
      if (!prof) throw new HttpError('کد نامعتبر است.', 400);
      const { error } = await admin.auth.admin.updateUserById(prof.id, { password });
      if (error) throw new HttpError(error.message, 400);
      return json({ ok: true });
    }

    case 'telegram-link': {
      const user = await requireUser(req);
      const tg = await setting<{ bot_username: string | null }>('telegram');
      if (!tg?.bot_username || !(await secret('telegram_bot_token'))) throw new HttpError('هشدارهای تلگرام هنوز روی سایت تنظیم نشده‌اند.', 503);
      const code = randomCode(10, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
      await admin.from('profiles').update({ 
        telegram_link_code: code, 
        telegram_link_expires: new Date(Date.now() + 20 * 60e3).toISOString() 
      }).eq('id', user.id);
      return json({ ok: true, bot: tg.bot_username, url: `https://t.me/${tg.bot_username}?start=${code}`, code });
    }

    case 'telegram-unlink': {
      const user = await requireUser(req);
      await admin.from('profiles').update({ telegram_chat_id: null, telegram_username: null }).eq('id', user.id);
      return json({ ok: true });
    }

    case 'test-alert': {
      const user = await requireUser(req);
      await rateLimit(`test:${user.id}`, 5, 600);
      const p = await getProfile(user.id);
      const results: Record<string, unknown> = {};
      if (p?.telegram_chat_id) results.telegram = await sendTelegram(p.telegram_chat_id, '✅ <b>هشدار تستی</b>\nهشدارک‌های تلگرام شما به درستی کار می‌کنند.');
      if (p?.email_verified && p?.email_alerts) {
        const mail = await sendEmail(
          p.email,
          'همه‌چیز آماده است | BTCS IR',
          emailHtml('ایمیل شما با موفقیت متصل شد', 'عالیه! از این به بعد می‌توانید هشدارهای ایمیلی BTCS IR را دریافت کنید.')
        );
        results.email = mail;
        if (!mail?.ok && !p?.telegram_chat_id) {
          throw new HttpError(mail?.error || mail?.message || 'ارسال ایمیل تستی ناموفق بود.', 502);
        }
      }
      if (!Object.keys(results).length) throw new HttpError('لطفاً ابتدا تلگرام را متصل کرده یا ایمیل خود را تایید کنید.');
      return json({ ok: true, results });
    }

    case 'checkout': {
      const user = await requireUser(req);
      const premium = await setting<{ price: number; currency: string; period_days: number; stripe_enabled: boolean }>('premium');
      const key = await secret('stripe_secret_key');
      if (!premium?.stripe_enabled || !key) throw new HttpError('پرداخت آنلاین با کارت فعال نیست. از گزینه‌های پرداخت دستی استفاده کنید.', 503);
      const origin = siteReturnUrl(body.return_url);
      if (!origin) throw new HttpError('آدرس بازگشت باید مربوط به همین سایت باشد.');
      const form = new URLSearchParams({
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': (premium.currency || 'USD').toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(toMinor(premium.price || 19, premium.currency || 'USD')),
        'line_items[0][price_data][product_data][name]': `اشتراک ویژه — ${premium.period_days || 30} روزه`,
        client_reference_id: user.id,
        customer_email: user.email || '',
        success_url: `${origin}#/account?paid=1`,
        cancel_url: `${origin}#/premium`,
        'metadata[user_id]': user.id,
      });
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form,
      });
      const session = await r.json();
      if (!r.ok) throw new HttpError(session.error?.message || 'خطای درگاه استرایپ (Stripe)', 502);
      return json({ ok: true, url: session.url });
    }

    case 'delete-account': {
      const user = await requireUser(req);
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw new HttpError(error.message, 400);
      return json({ ok: true });
    }

    default:
      throw new HttpError('عملیات ناشناخته است', 400);
  }
}

async function checkCode(email: string, purpose: string, code: string) {
  if (!/^\d{6}$/.test(code)) throw new HttpError('کد ۶ رقمی را به طور کامل وارد کنید.');
  const { data: rows } = await admin.from('auth_codes').select('*').eq('email', email.toLowerCase()).eq('purpose', purpose)
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1);
  const row = rows?.[0];
  if (!row || row.attempts >= 5) throw new HttpError('کد منقضی شده است. لطفاً کد جدیدی درخواست کنید.', 400);
  if (row.code_hash !== (await codeHash(email, code))) {
    await admin.from('auth_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    throw new HttpError('کد وارد شده اشتباه است.', 400);
  }
  await admin.from('auth_codes').delete().eq('email', email.toLowerCase()).eq('purpose', purpose);
}

// referenced to keep the import used in some bundlers
void escHtml; void SUPABASE_URL;