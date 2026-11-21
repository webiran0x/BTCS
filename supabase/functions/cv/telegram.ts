// ربات تلگرام BTCS: اتصال حساب، قیمت، سیگنال، هشدارها و ۱۰ قابلیت فارسی با طراحی مدرن ۲۰۲۶ اپل
import { admin, secret, sendTelegram, klines, prices, escHtml, fmtPrice, setting, fetchJson } from './lib.ts';
import { generateSignal } from './engine/signals.js';

const APPLE_BADGE = '✦ <b>BTCS · طراحی مدرن ۲۰۲۶ اپل</b>';

const HELP_FA = `${APPLE_BADGE}
<i>فضای شفاف، دقیق و یکپارچه برای رصد لحظه‌ای بازار رمزارز</i>

<b>دستورات اصلی:</b>
• <code>/start [کد]</code> — اتصال حساب کاربری یا نمایش منوی اصلی
• <code>/price BTC</code> — قیمت لحظه‌ای و تغییر ۲۴ ساعته
• <code>/signal ETH</code> — سیگنال تکنیکال، نقطه ورود، حدضرر و اهداف
• <code>/alerts</code> — نمایش هشدارهای فعال شما
• <code>/unlink</code> — قطع اتصال این چت از حساب

<b>۱۰ قابلیت اضافه حرفه‌ای:</b>
1️⃣ <code>/top</code> — <b>پربازده‌ترین و پربازدیدترین رمزارزها</b> (۲۴ ساعت اخیر)
2️⃣ <code>/compare BTC ETH</code> — <b>مقایسه لحظه‌ای دو رمزارز</b> کنار هم
3️⃣ <code>/feargreed</code> — <b>شاخص ترس و طمع بازار</b> همراه با تحلیل جو بازار
4️⃣ <code>/alert BTC &gt; 95000</code> — <b>ساخت سریع هشدار قیمتی</b> مستقیم در تلگرام
5️⃣ <code>/delalert ID</code> — <b>حذف هشدار</b> با شناسه عددی
6️⃣ <code>/calc 1000 85000 92000 82000</code> — <b>ماشین‌حساب سود، زیان و نسبت R:R</b>
7️⃣ <code>/status</code> — <b>وضعیت حساب، اشتراک ویژه و تعداد هشدارها</b>
8️⃣ <code>/watchlist</code> — <b>نمای سریع واچ‌لیست و ارزهای محبوب</b>
9️⃣ <b>دکمه‌های شیشه‌ای تعاملی (Inline Glass Buttons)</b> زیر هر قیمت و سیگنال برای بروزرسانی و اقدام سریع
🔟 <b>کارت‌های شیشه‌ای راست‌چین با ایزوله‌سازی اعداد و نمادها</b> برای خوانایی بی‌نقص در iOS و دسکتاپ

<i>اطلاعات ارائه‌شده جنبه تحلیلی و آموزشی دارد و مشاوره سرمایه‌گذاری نیست.</i>`;

function appleInlineKeyboard(sym = 'BTC') {
  const clean = sym.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTC';
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `🔄 قیمت ${clean}`, callback_data: `px:${clean}` },
          { text: `📡 سیگنال ${clean}`, callback_data: `sig:${clean}` },
        ],
        [
          { text: '📊 برترین‌ها', callback_data: 'top' },
          { text: '🧭 ترس و طمع', callback_data: 'fg' },
        ],
        [
          { text: '🔔 هشدارهای من', callback_data: 'alerts' },
          { text: '📖 راهنمای کامل', callback_data: 'help' },
        ],
      ],
    },
  };
}

async function ticker24h(sym: string): Promise<{ price: number; pct24h: number; high: number; low: number; vol: number } | null> {
  const clean = sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return null;
  try {
    const r = await fetchJson(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${clean}USDT`, 8000) as {
      lastPrice?: string; priceChangePercent?: string; highPrice?: string; lowPrice?: string; quoteVolume?: string;
    };
    if (r?.lastPrice) {
      return {
        price: +r.lastPrice,
        pct24h: +(r.priceChangePercent || 0),
        high: +(r.highPrice || 0),
        low: +(r.lowPrice || 0),
        vol: +(r.quoteVolume || 0),
      };
    }
  } catch { /* fallback below */ }
  const px = await prices([clean]);
  if (!px[clean]) return null;
  return { price: px[clean], pct24h: 0, high: px[clean], low: px[clean], vol: 0 };
}

async function handleCommandText(chatId: number | string, text: string, username: string | null) {
  const [cmdRaw, ...args] = text.trim().split(/\s+/);
  const cmd = cmdRaw.split('@')[0].toLowerCase();

  if (cmd === '/start' && args[0]) {
    const code = args[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
    const { data: prof } = await admin
      .from('profiles')
      .select('id,display_name,telegram_link_expires')
      .eq('telegram_link_code', code)
      .maybeSingle();

    if (!prof || !prof.telegram_link_expires || new Date(prof.telegram_link_expires) < new Date()) {
      await sendTelegram(
        chatId,
        '⚠️ <b>لینک اتصال منقضی شده است</b>\nوارد صفحه حساب کاربری در سایت شوید و مجدداً دکمه «اتصال به تلگرام» را بزنید.',
        appleInlineKeyboard('BTC'),
      );
      return;
    }

    await admin
      .from('profiles')
      .update({
        telegram_chat_id: chatId,
        telegram_username: username,
        telegram_link_code: null,
        telegram_link_expires: null,
      })
      .eq('id', prof.id);

    await sendTelegram(
      chatId,
      `${APPLE_BADGE}\n\n✅ <b>حساب کاربری با موفقیت متصل شد!</b>\nخوش آمدید <b>${escHtml(prof.display_name || 'کاربر گرامی')}</b> — هشدارهای قیمتی و سیگنال‌های شما از این پس در همین چت ارسال می‌شوند.\n\n${HELP_FA}`,
      appleInlineKeyboard('BTC'),
    );
    return;
  }

  if (cmd === '/start' || cmd === '/help') {
    await sendTelegram(chatId, HELP_FA, appleInlineKeyboard('BTC'));
    return;
  }

  if (cmd === '/price') {
    const sym = (args[0] || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const info = await ticker24h(sym);
    if (!info) {
      await sendTelegram(chatId, `⚠️ قیمت لحظه‌ای برای نماد <code>${escHtml(sym)}</code> یافت نشد.`, appleInlineKeyboard('BTC'));
      return;
    }
    const trendIcon = info.pct24h > 0 ? '📈' : info.pct24h < 0 ? '📉' : '▫️';
    const sign = info.pct24h > 0 ? '+' : '';
    const msg = `${APPLE_BADGE}

${trendIcon} <b>قیمت لحظه‌ای ${escHtml(sym)}</b>
• قیمت فعلی: <b>$${fmtPrice(info.price)}</b>
• تغییر ۲۴ ساعته: <b>${sign}${info.pct24h.toFixed(2)}٪</b>
• سقف / کف ۲۴ ساعت: <code>$${fmtPrice(info.high)}</code> / <code>$${fmtPrice(info.low)}</code>${info.vol ? `\n• حجم معاملات ۲۴ ساعت: <code>$${fmtPrice(info.vol)}</code>` : ''}`;
    await sendTelegram(chatId, msg, appleInlineKeyboard(sym));
    return;
  }

  if (cmd === '/signal') {
    const sym = (args[0] || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const candles = await klines(sym, '4h', 400);
    const s = generateSignal(candles, { interval: '4h' });
    if (!s.ok) {
      await sendTelegram(chatId, `⚠️ داده کافی برای تحلیل نماد <code>${escHtml(sym)}</code> موجود نیست.`, appleInlineKeyboard(sym));
      return;
    }
    const site = await setting<{ url?: string }>('site');
    let msg = `${APPLE_BADGE}

📡 <b>سیگنال تکنیکال ${escHtml(sym)} (تایم‌فریم 4h)</b>
• وضعیت: <b>${escHtml(s.text)}</b> (امتیاز: <code>${s.score > 0 ? '+' : ''}${s.score}</code>)
• قیمت فعلی: <b>$${fmtPrice(s.price)}</b>\n`;

    if (s.plan) {
      msg += `\n🎯 <b>طرح معاملاتی پیشنهادی (${escHtml(s.plan.title)}):</b>\n• محدوده ورود: <code>${fmtPrice(s.plan.entryZone[0])} – ${fmtPrice(s.plan.entryZone[1])}</code>\n• حد ضرر: <code>${fmtPrice(s.plan.stopLoss)}</code>\n• اهداف سود: <code>${s.plan.takeProfits.map(fmtPrice).join(' / ')}</code>\n`;
    } else if (s.waitFor?.length) {
      msg += `\n⏳ <i>هنوز نقطه ورود قطعی تایید نشده است: ${escHtml(s.waitFor[0])}</i>\n`;
    }

    const bulls = (s.reasons?.bullish || []).slice(0, 2).map((r: string) => `✅ ${escHtml(r)}`).join('\n');
    const bears = (s.reasons?.bearish || []).slice(0, 2).map((r: string) => `⚠️ ${escHtml(r)}`).join('\n');
    if (bulls || bears) msg += `\n${[bulls, bears].filter(Boolean).join('\n')}`;
    if (site?.url) msg += `\n\n🔗 <a href="${escHtml(site.url)}#/coin/${escHtml(sym)}">مشاهده نمودار کامل و پیش‌بینی هوش مصنوعی</a>`;
    msg += '\n<i>جنبه تحلیلی دارد و مشاوره مالی نیست.</i>';

    await sendTelegram(chatId, msg, appleInlineKeyboard(sym));
    return;
  }

  if (cmd === '/top') {
    const all = await fetchJson('https://data-api.binance.vision/api/v3/ticker/24hr', 10000) as Array<{
      symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string;
    }>;
    const majors = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'TONUSDT']);
    const list = all
      .filter((x) => majors.has(x.symbol))
      .map((x) => ({
        sym: x.symbol.slice(0, -4),
        px: +x.lastPrice,
        chg: +x.priceChangePercent,
      }))
      .sort((a, b) => b.chg - a.chg);

    const lines = list.map((item, idx) => {
      const iconChg = item.chg >= 0 ? '🟢' : '🔴';
      const sign = item.chg >= 0 ? '+' : '';
      return `${idx + 1}. ${iconChg} <b>${escHtml(item.sym)}</b> — <code>$${fmtPrice(item.px)}</code> (<b>${sign}${item.chg.toFixed(2)}٪</b>)`;
    });

    await sendTelegram(
      chatId,
      `${APPLE_BADGE}\n\n🏆 <b>پایش لحظه‌ای رمزارزهای شاخص (۲۴ ساعت)</b>\n\n${lines.join('\n')}`,
      appleInlineKeyboard('BTC'),
    );
    return;
  }

  if (cmd === '/compare') {
    const a = (args[0] || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const b = (args[1] || 'ETH').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const [ia, ib] = await Promise.all([ticker24h(a), ticker24h(b)]);
    if (!ia || !ib) {
      await sendTelegram(chatId, '⚠️ برای مقایسه دو نماد معتبر بنویسید، مثلاً: <code>/compare BTC ETH</code>', appleInlineKeyboard(a));
      return;
    }
    const sa = ia.pct24h >= 0 ? `+${ia.pct24h.toFixed(2)}٪` : `${ia.pct24h.toFixed(2)}٪`;
    const sb = ib.pct24h >= 0 ? `+${ib.pct24h.toFixed(2)}٪` : `${ib.pct24h.toFixed(2)}٪`;
    await sendTelegram(
      chatId,
      `${APPLE_BADGE}\n\n⚖️ <b>مقایسه لحظه‌ای ${escHtml(a)} و ${escHtml(b)}</b>\n\n• <b>${escHtml(a)}</b>: <code>$${fmtPrice(ia.price)}</code> | تغییر ۲۴س: <b>${sa}</b>\n• <b>${escHtml(b)}</b>: <code>$${fmtPrice(ib.price)}</code> | تغییر ۲۴س: <b>${sb}</b>\n• نسبت قیمت <code>${escHtml(a)}/${escHtml(b)}</code>: <code>${fmtPrice(ia.price / ib.price)}</code>`,
      appleInlineKeyboard(a),
    );
    return;
  }

  if (cmd === '/feargreed') {
    const fg = await fetchJson('https://api.alternative.me/fng/?limit=1', 8000) as {
      data?: Array<{ value?: string; value_classification?: string }>;
    };
    const item = fg?.data?.[0];
    if (!item?.value) {
      await sendTelegram(chatId, '⚠️ در حال حاضر امکان دریافت شاخص ترس و طمع وجود ندارد.', appleInlineKeyboard('BTC'));
      return;
    }
    const val = Number(item.value);
    const labelFa =
      val <= 24 ? 'ترس شدید 😱' :
      val <= 44 ? 'ترس 😨' :
      val <= 55 ? 'خنثی 😐' :
      val <= 74 ? 'طمع 😏' : 'طمع شدید 🤩';

    await sendTelegram(
      chatId,
      `${APPLE_BADGE}\n\n🧭 <b>شاخص ترس و طمع بازار رمزارز</b>\n\n• امتیاز شاخص: <b>${val} از ۱۰۰</b>\n• وضعیت بازار: <b>${labelFa}</b>\n• برچسب جهانی: <code>${escHtml(item.value_classification || '')}</code>`,
      appleInlineKeyboard('BTC'),
    );
    return;
  }

  if (cmd === '/alert') {
    const sym = (args[0] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const dirRaw = args[1] || '';
    const target = Number(args[2]);
    const dir = dirRaw === '>' || dirRaw.toLowerCase() === 'above' ? 'above' : dirRaw === '<' || dirRaw.toLowerCase() === 'below' ? 'below' : '';

    if (!sym || !dir || !Number.isFinite(target) || target <= 0) {
      await sendTelegram(
        chatId,
        '📌 نحوه ثبت سریع هشدار:\n<code>/alert BTC &gt; 95000</code>\nیا برای پایین‌تر بودن:\n<code>/alert ETH &lt; 2800</code>',
        appleInlineKeyboard(sym || 'BTC'),
      );
      return;
    }

    const { data: prof } = await admin.from('profiles').select('id').eq('telegram_chat_id', chatId).maybeSingle();
    if (!prof) {
      await sendTelegram(chatId, '⚠️ ابتدا حساب خود را از بخش «حساب کاربری» در سایت به این ربات متصل کنید.');
      return;
    }

    const { data: created, error } = await admin
      .from('alerts')
      .insert({
        user_id: prof.id,
        kind: 'price',
        symbol: sym,
        direction: dir,
        price: target,
        channels: ['telegram'],
        active: true,
      })
      .select('id')
      .single();

    if (error) {
      await sendTelegram(chatId, `⚠️ ثبت هشدار انجام نشد: ${escHtml(error.message)}`);
      return;
    }

    await sendTelegram(
      chatId,
      `🔔 <b>هشدار جدید ثبت شد</b>\n• شناسه هشدار: <code>${escHtml(created?.id ?? '—')}</code>\n• نماد: <b>${escHtml(sym)}</b>\n• شرط: <b>${dir === 'above' ? 'بالاتر از' : 'پایین‌تر از'} $${fmtPrice(target)}</b>\n• برای حذف: <code>/delalert ${escHtml(created?.id ?? '')}</code>`,
      appleInlineKeyboard(sym),
    );
    return;
  }

  if (cmd === '/delalert') {
    const id = (args[0] || '').trim();
    if (!id) {
      await sendTelegram(chatId, '📌 شناسه هشدار را وارد کنید، مثلاً: <code>/delalert 12</code>\nابتدا با <code>/alerts</code> شناسه هشدارهای خود را ببینید.', appleInlineKeyboard('BTC'));
      return;
    }
    const { data: prof } = await admin.from('profiles').select('id').eq('telegram_chat_id', chatId).maybeSingle();
    if (!prof) {
      await sendTelegram(chatId, '⚠️ این چت به هیچ حساب کاربری متصل نیست.');
      return;
    }
    await admin.from('alerts').delete().eq('id', id).eq('user_id', prof.id);
    await sendTelegram(chatId, `🗑️ هشدار با شناسه <code>${escHtml(id)}</code> حذف شد.`, appleInlineKeyboard('BTC'));
    return;
  }

  if (cmd === '/calc') {
    const capital = Number(args[0]);
    const entry = Number(args[1]);
    const target = Number(args[2]);
    const stop = Number(args[3]);
    if (![capital, entry, target, stop].every((n) => Number.isFinite(n) && n > 0) || entry === stop) {
      await sendTelegram(
        chatId,
        '🧮 <b>ماشین‌حساب سود، زیان و نسبت ریسک به ریوارد</b>\nفرمت:\n<code>/calc سرمایه ورود هدف حدضرر</code>\nمثال:\n<code>/calc 1000 85000 92000 82000</code>',
        appleInlineKeyboard('BTC'),
      );
      return;
    }
    const qty = capital / entry;
    const profitUsd = (target - entry) * qty;
    const lossUsd = (stop - entry) * qty;
    const riskPerUnit = Math.abs(entry - stop);
    const rewardPerUnit = Math.abs(target - entry);
    const rr = rewardPerUnit / riskPerUnit;

    await sendTelegram(
      chatId,
      `${APPLE_BADGE}\n\n🧮 <b>نتیجه محاسبه معامله</b>\n• حجم تقریبی: <code>${qty.toFixed(6)}</code> واحد\n• سود تخمینی در هدف: <b>${profitUsd >= 0 ? '+' : ''}$${fmtPrice(profitUsd)}</b>\n• تغییر در حدضرر: <b>${lossUsd >= 0 ? '+' : ''}$${fmtPrice(lossUsd)}</b>\n• نسبت ریسک به ریوارد (R:R): <b>1 : ${rr.toFixed(2)}</b>`,
      appleInlineKeyboard('BTC'),
    );
    return;
  }

  if (cmd === '/status') {
    const { data: prof } = await admin
      .from('profiles')
      .select('id,email,display_name,premium_until,is_admin,telegram_chat_id')
      .eq('telegram_chat_id', chatId)
      .maybeSingle();

    if (!prof) {
      await sendTelegram(chatId, 'ℹ️ این چت هنوز به حساب کاربری متصل نشده است. از سایت اقدام به اتصال کنید.', appleInlineKeyboard('BTC'));
      return;
    }

    const { count } = await admin
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', prof.id)
      .eq('active', true);

    const isVip = Boolean(prof.is_admin) || (prof.premium_until && new Date(prof.premium_until) > new Date());
    await sendTelegram(
      chatId,
      `${APPLE_BADGE}\n\n👤 <b>وضعیت حساب کاربری</b>\n• نام نمایشی: <b>${escHtml(prof.display_name || '—')}</b>\n• اشتراک: <b>${isVip ? 'ویژه / فعال ✨' : 'رایگان'}</b>\n• هشدارهای فعال: <b>${count ?? 0}</b> مورد\n• وضعیت تلگرام: <b>متصل ✅</b>`,
      appleInlineKeyboard('BTC'),
    );
    return;
  }

  if (cmd === '/watchlist') {
    const { data: prof } = await admin.from('profiles').select('id').eq('telegram_chat_id', chatId).maybeSingle();
    if (!prof) {
      await sendTelegram(chatId, '⚠️ برای مشاهده لیست هشدارها، ابتدا حساب خود را در سایت متصل کنید.', appleInlineKeyboard('BTC'));
      return;
    }
    const { data: alerts } = await admin
      .from('alerts')
      .select('id,symbol,direction,price')
      .eq('user_id', prof.id)
      .eq('active', true)
      .limit(20);

    const syms = [...new Set((alerts || []).map((a) => String(a.symbol || '').toUpperCase()).filter(Boolean))];
    const px = syms.length ? await prices(syms) : {};
    const body = syms.length
      ? syms.map((s) => `• <b>${escHtml(s)}</b>: <code>$${px[s] ? fmtPrice(px[s]) : '—'}</code>`).join('\n')
      : 'در حال حاضر هیچ ارز فعالی در هشدارهای شما ثبت نشده است.';

    await sendTelegram(chatId, `${APPLE_BADGE}\n\n⭐ <b>رمزارزهای تحت هشدار شما</b>\n\n${body}`, appleInlineKeyboard(syms[0] || 'BTC'));
    return;
  }

  if (cmd === '/alerts') {
    const { data: prof } = await admin.from('profiles').select('id').eq('telegram_chat_id', chatId).maybeSingle();
    if (!prof) {
      await sendTelegram(chatId, '⚠️ این چت هنوز به هیچ حساب کاربری متصل نشده است.');
      return;
    }
    const { data: alerts } = await admin
      .from('alerts')
      .select('id,symbol,direction,price')
      .eq('user_id', prof.id)
      .eq('active', true)
      .limit(50);

    await sendTelegram(
      chatId,
      alerts?.length
        ? `${APPLE_BADGE}\n\n🔔 <b>هشدارهای فعال شما</b>\n${alerts.map((a) => `• [<code>${escHtml(a.id)}</code>] <b>${escHtml(a.symbol)}</b> ${a.direction === 'above' ? 'بالاتر از' : 'پایین‌تر از'} <code>$${fmtPrice(Number(a.price))}</code>`).join('\n')}\n\n<i>برای حذف: <code>/delalert شناسه</code></i>`
        : '🔕 در حال حاضر هشدار فعالی ندارید. می‌توانید با <code>/alert BTC &gt; 95000</code> یا از سایت هشدار بسازید.',
      appleInlineKeyboard('BTC'),
    );
    return;
  }

  if (cmd === '/unlink' || cmd === '/stop') {
    await admin
      .from('profiles')
      .update({ telegram_chat_id: null, telegram_username: null })
      .eq('telegram_chat_id', chatId);
    await sendTelegram(chatId, '🔌 اتصال این چت به حساب کاربری قطع شد و دیگر هشداری ارسال نخواهد شد.');
    return;
  }

  await sendTelegram(chatId, HELP_FA, appleInlineKeyboard('BTC'));
}

export async function telegramBot(req: Request): Promise<Response> {
  const expected = await secret('telegram_webhook_secret');
  if (!expected || req.headers.get('x-telegram-bot-api-secret-token') !== expected) {
    return new Response('forbidden', { status: 403 });
  }

  const update = await req.json().catch(() => null);
  if (!update) return new Response('ok');

  if (update.callback_query?.data && update.callback_query?.message?.chat?.id) {
    const cq = update.callback_query;
    const chatId = cq.message.chat.id;
    const data = String(cq.data);
    const botToken = await secret('telegram_bot_token');
    if (botToken && cq.id) {
      await fetchJson(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, 5000).catch(() => null);
    }

    try {
      if (data.startsWith('px:')) {
        await handleCommandText(chatId, `/price ${data.slice(3)}`, cq.from?.username || null);
      } else if (data.startsWith('sig:')) {
        await handleCommandText(chatId, `/signal ${data.slice(4)}`, cq.from?.username || null);
      } else if (data === 'top') {
        await handleCommandText(chatId, '/top', cq.from?.username || null);
      } else if (data === 'fg') {
        await handleCommandText(chatId, '/feargreed', cq.from?.username || null);
      } else if (data === 'alerts') {
        await handleCommandText(chatId, '/alerts', cq.from?.username || null);
      } else if (data === 'help') {
        await handleCommandText(chatId, '/help', cq.from?.username || null);
      }
    } catch (err) {
      console.error(err);
      await sendTelegram(chatId, '⚠️ خطایی در پردازش درخواست رخ داد. لطفاً دوباره تلاش کنید.');
    }
    return new Response('ok');
  }

  const msg = update?.message;
  if (!msg?.text || !msg.chat?.id) return new Response('ok');

  try {
    await handleCommandText(msg.chat.id, String(msg.text), msg.from?.username || null);
  } catch (err) {
    console.error(err);
    await sendTelegram(msg.chat.id, '⚠️ خطایی در اجرای دستور رخ داد. لطفاً لحظاتی دیگر دوباره تلاش کنید.');
  }

  return new Response('ok');
}
