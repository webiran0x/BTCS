import { CONFIG } from '../config.js';
import { markets, isStable } from '../api/market.js';
import { live } from '../api/live.js';
import { analyzeCoin, analystContext, llmData, detectSymbol, portfolioSummary, scanMarket, marketContext, scanMarketMulti, marketContextMulti, compareCoins } from '../ai/context.js';
import { ruleBasedAnswer, isMarketWide, detectCompare, namedCoins, horizonChart, SELL_ALL, AI_SYSTEM_PROMPT } from '../lib/analyst.js';
import { unsupportedFigures, materialFigures } from '../lib/grounding.js';
import { conversationalAnswer, termsIn } from '../lib/glossary.js';
import { traderAnswer, TRADER_Q, isTraderFollowUp } from '../lib/traderchat.js';
import { aiState, deviceSupport, loadLocalModel, askLLM, localReady, customReady, customState, recommendedModelId, checkCustomAI, AI_HOSTS } from '../ai/engine.js';
import { $, $$, icon, markdown, bindSeg, toast } from '../ui.js';
import { esc, price, changeHtml, money } from '../format.js';
import { settings, load, save } from '../store.js';

export const title = 'دستیار هوش مصنوعی';
const HISTORY_KEY = 'assistantHistory';
const KEEP = 30;
const history = [];

function restoreHistory() {
  const saved = load(HISTORY_KEY, null);
  history.length = 0;
  for (const m of Array.isArray(saved?.messages) ? saved.messages : []) {
    if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
      history.push(m);
    }
  }
  history.lastSymbol = (typeof saved?.lastSymbol === 'string' && /^[\p{L}\p{N}_]{1,20}$/u.test(saved.lastSymbol) ? saved.lastSymbol : null) || history.lastSymbol;
}

let savingHere = false;
function saveHistory() {
  const value = {
    messages: history.slice(-KEEP).map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, 6000),
      ...(m.root ? { root: String(m.root).slice(0, 500) } : {}),
      ...(m.meta ? { meta: String(m.meta).replace(/<a href="#" data-facts>[^<]*<\/a>/, '').replace(/<button[^>]*data-copy[^>]*>.*?<\/button>/, '') } : {}),
      at: m.at || Date.now(),
    })),
    lastSymbol: history.lastSymbol || null,
  };
  savingHere = true;
  try { save(HISTORY_KEY, value); } finally { savingHere = false; }
}

function buildTraderSuggestions(sym) {
  return [
    { label: 'کشیدگی و اشباع بازار', q: 'کدام ارزها در حال حاضر بیش از حد کشیده شده‌اند؟' },
    { label: 'قوی‌ترین شواهد بازار', q: 'شواهد در کجا بیشترین قدرت را دارند؟' },
    { label: 'نگهداری چندروزه در برابر اسکالپ', q: 'چه چیزی را باید برای چند هفته نگهداری کنم و کدام یک فقط یک معامله سریع است؟' },
    { label: 'مقایسه BTC، ETH و SOL', q: 'مقایسه BTC، ETH و SOL' },
    { label: `مسیر بعدی ${sym}`, q: `آیا ${sym} در مرحله بعد صعودی خواهد بود یا نزولی؟` },
    { label: `نقطه سیو سود ${sym}`, q: `چه زمانی باید روی ${sym} سود سیو کنم؟` },
    { label: `مدیریت ریسک ۱۰۰۰$ روی ${sym}`, q: `چقدر از ۱۰۰۰ دلار را می‌توانم با تعیین حد ضرر روی ${sym} ریسک کنم؟` },
    { label: `ریسک‌ها و سناریوی ابطال ${sym}`, q: `خطرات نگهداری و معامله ${sym} چیست؟` },
    { label: 'تحلیل سبد و پرتفوی', q: 'بررسی سبد سرمایه من' },
  ];
}

export async function render(el, [symParam]) {
  restoreHistory();
  const all = await markets().catch(() => []);
  const st = {
    symbol: String(symParam || history.lastSymbol || 'BTC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 15) || 'BTC',
    interval: '4h',
    busy: false,
    abort: null,
    disposed: false,
  };
  const support = await deviceSupport();
  const s = settings.get();

  el.innerHTML = `
    <style>
      .ap-assistant-wrap {
        direction: rtl;
        text-align: right;
        max-width: 1360px;
        margin: 0 auto;
        padding-bottom: 60px;
      }
      .ap-hero-card {
        background: radial-gradient(circle at top right, rgba(94, 92, 230, 0.12), transparent 50%),
                    radial-gradient(circle at bottom left, rgba(50, 215, 75, 0.08), transparent 50%),
                    rgba(24, 24, 29, 0.78);
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
        grid-template-columns: 2.2fr 1fr;
        gap: 24px;
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
      .ap-assistant-wrap .btn {
        border-radius: 13px;
        font-weight: 500;
        transition: all 0.2s ease;
        cursor: pointer;
      }
      .ap-assistant-wrap .btn.primary {
        background: linear-gradient(135deg, #5e5ce6 0%, #3634a3 100%);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #fff;
        box-shadow: 0 6px 18px rgba(94, 92, 230, 0.3);
      }
      .ap-assistant-wrap .btn.primary:hover:not(:disabled) {
        filter: brightness(1.08);
        transform: translateY(-1px);
      }
      .ap-assistant-wrap .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .ap-assistant-wrap .inp, .ap-assistant-wrap select, .ap-assistant-wrap textarea {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 12px;
        color: #fff;
        padding: 12px 16px;
        outline: none;
        transition: all 0.2s;
        font-family: inherit;
      }
      .ap-assistant-wrap .inp:focus, .ap-assistant-wrap select:focus, .ap-assistant-wrap textarea:focus {
        border-color: rgba(94, 92, 230, 0.6);
        box-shadow: 0 0 0 3px rgba(94, 92, 230, 0.25);
      }
      .ap-chat-box {
        display: flex;
        flex-direction: column;
        height: 640px;
      }
      .ap-chat-log {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        scroll-behavior: smooth;
      }
      .ap-chat-log .msg {
        scroll-margin-top: 12px;
      }
      .ap-chat-input-area {
        display: flex;
        gap: 10px;
        align-items: flex-end;
        margin-top: 12px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 16px;
        padding: 10px;
      }
      .ap-suggest-chips {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 10px 0 4px;
        max-height: 92px;
        overflow-y: auto;
      }
      .ap-suggest-chips button {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.85);
        padding: 6px 12px;
        border-radius: 10px;
        font-size: 0.82rem;
        cursor: pointer;
        transition: all 0.2s;
      }
      .ap-suggest-chips button:hover {
        background: rgba(94, 92, 230, 0.22);
        border-color: rgba(94, 92, 230, 0.45);
        color: #fff;
      }
      .ap-mini-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.8);
        border-radius: 8px;
        padding: 3px 8px;
        font-size: 0.75rem;
        cursor: pointer;
        margin-right: 6px;
      }
      .ap-mini-btn:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
      }
    </style>

    <div class="ap-assistant-wrap" dir="rtl">
      <div class="ap-hero-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">
          <div>
            <h1 style="font-size:2.2rem;font-weight:700;letter-spacing:-0.02em;color:#fff;margin:0 0 8px 0">دستیار هوش مصنوعی</h1>
            <p style="color:rgba(255,255,255,0.72);font-size:1.05rem;line-height:1.65;margin:0;max-width:920px">پشتیبانی از تصمیم‌گیری و مدیریت ریسک، نه وعده سود قطعی. پاسخ‌ها بر اساس داده‌های زنده بازار، اندیکاتورها، بک‌تست‌ها، پیش‌بینی‌ها و حساب شبیه‌سازی‌شده ساخته می‌شوند. مشاوره مالی محسوب نمی‌شود.</p>
          </div>
          <div class="row" style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn sm ghost" type="button" id="assistantSnapshot" style="background:rgba(94,92,230,0.16);border:1px solid rgba(94,92,230,0.35);color:#fff;padding:8px 14px;border-radius:10px">تحلیل سریع ارز فعال</button>
            <button class="btn sm ghost" type="button" id="assistantStop" disabled style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:8px 14px;border-radius:10px">توقف</button>
            <button class="btn sm ghost" type="button" id="assistantClear" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:8px 14px;border-radius:10px">پاک کردن گفتگو</button>
          </div>
        </div>
      </div>

      <div class="ap-bento-grid">
        <div class="ap-card ap-chat-box">
          <div class="ap-chat-log" id="log" role="log" aria-live="polite" aria-label="گفتگو"></div>
          <div class="ap-suggest-chips" id="suggest"></div>
          <form class="ap-chat-input-area" id="form">
            <label class="sr-only" for="q">درباره یک ارز، بازار یا حساب شبیه‌سازی‌شده خود بپرسید</label>
            <textarea class="inp" id="q" rows="1" maxlength="600" placeholder="مثلاً: در حال حاضر ${esc(st.symbol)} چقدر ریسک دارد؟ مقایسه بیت‌کوین و اتریوم" aria-describedby="qHelp" style="flex:1;resize:none;border:0;background:transparent;padding:6px;max-height:120px"></textarea>
            <button class="btn primary" id="send" type="submit" aria-label="ارسال سوال" style="padding:10px 16px">${icon('send', 16)}</button>
            <span class="sr-only" id="qHelp">برای ارسال کلید Enter و برای خط جدید Shift+Enter را فشار دهید.</span>
          </form>
        </div>

        <div class="stack">
          <div class="ap-card" id="engineCard"></div>
          <div class="ap-card">
            <div class="card-h" style="margin-bottom:14px"><h3 style="margin:0;font-size:1.1rem;color:#fff">ارز در مرکز توجه</h3></div>
            <div class="row" style="margin-bottom:12px">
              <select class="inp" id="coinSel" aria-label="ارز در مرکز توجه" style="width:100%">${all.filter((c) => !isStable(c.symbol)).slice(0, 150).map((c) => `<option value="${esc(c.symbol)}" ${c.symbol === st.symbol ? 'selected' : ''}>${esc(c.symbol)} · ${esc(c.name)}</option>`).join('')}</select>
            </div>
            <div class="row spread" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <span class="fine" style="color:rgba(255,255,255,0.6)">نمودار</span>
              <div class="seg" id="ivSeg" style="display:flex;gap:4px">${['1m', '5m', '15m', '1h', '4h', '1d'].map((iv) => `<button type="button" data-v="${iv}" class="${iv === st.interval ? 'on' : ''}" style="padding:4px 8px;border-radius:8px;border:0;background:${iv === st.interval ? 'rgba(255,255,255,0.15)' : 'transparent'};color:${iv === st.interval ? '#fff' : 'rgba(255,255,255,0.6)'};cursor:pointer">${iv}</button>`).join('')}</div>
            </div>
            <div id="focus" class="mt fine" style="color:rgba(255,255,255,0.8)"></div>
          </div>
          <div class="ap-card fine" style="color:rgba(255,255,255,0.62);font-size:0.85rem;line-height:1.65">
            <b style="color:#fff;display:block;margin-bottom:6px">دستیار چگونه کار می‌کند</b>
            <ol style="padding-right:18px;margin:0">
              <li>کندل‌های زنده صرافی را برای ارز مورد نظر دریافت می‌کند.</li>
              <li>خوانش‌ها را روی چند تایم‌فریم، بک‌تست و پیش‌بینی مدل‌ها محاسبه می‌کند.</li>
              <li>تحلیل‌گر داخلی — یا مدل زبانی روی دستگاه/سرور — ارقام را به پاسخی ساختاریافته تبدیل می‌کند.</li>
              <li>پاسخ‌ها بررسی می‌شوند تا با داده‌های واقعی مطابقت داشته باشند.</li>
            </ol>
            <p class="mt" style="margin:10px 0 0">مشاوره مالی نیست. دستیار توانایی ثبت معامله را ندارد.</p>
          </div>
        </div>
      </div>
    </div>`;

  const log = $('#log', el);
  let focusUnsub = null;

  const scrollToMessage = (targetEl, { smooth = true } = {}) => {
    if (!targetEl || st.disposed) return;
    requestAnimationFrame(() => {
      if (!targetEl.isConnected) return;
      targetEl.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'start',
      });
    });
  };

  const watchFocus = (pair) => {
    if (focusUnsub) { focusUnsub(); focusUnsub = null; }
    focusUnsub = live.subscribe(`${pair}@miniTicker`, (tk) => {
      const box = $('#focus', el)?.querySelector('[data-focus-px]');
      if (!box) return;
      const p = +tk.c, o = +tk.o;
      if (!Number.isFinite(p) || !Number.isFinite(o) || o === 0) return;
      box.querySelector('.p').textContent = money(p);
      box.querySelector('.chg').outerHTML = changeHtml((p / o - 1) * 100);
      const row = all.find((x) => x.symbol === st.symbol);
      if (row) { row.price = p; row.change24h = (p / o - 1) * 100; }
    });
  };

  const drawFocus = () => {
    const c = all.find((x) => x.symbol === st.symbol);
    $('#focus', el).innerHTML = c
      ? `<div class="row spread" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><a class="acc" href="#/coin/${esc(c.symbol)}" style="color:var(--accent);text-decoration:none">نمودار ${esc(c.name)} ←</a><span data-focus-px><b class="p" style="color:#fff">${money(c.price)}</b> ${changeHtml(c.change24h)}</span></div>`
      : '';
    if (c?.binance) watchFocus(c.binance);

    const qInput = $('#q', el);
    if (qInput && !st.busy) {
      qInput.placeholder = `مثلاً: در حال حاضر ${st.symbol} چقدر ریسک دارد؟ مقایسه بیت‌کوین و اتریوم`;
    }

    $('#suggest', el).innerHTML = buildTraderSuggestions(st.symbol)
      .map((item) => `<button class="btn sm" type="button" data-q="${esc(item.q)}">${esc(item.label)}</button>`)
      .join('');
    $$('#suggest button', el).forEach((b) => b.addEventListener('click', () => ask(b.dataset.q || b.textContent)));
  };

  const drawEngine = () => {
    const card = $('#engineCard', el);
    const status = aiState.status;
    const opts = CONFIG.LLM_MODELS.map((m) => `<option value="${m.id}" ${(s.llmModel || '').startsWith(m.id.split('-q4')[0]) ? 'selected' : ''}>${m.label} · ${m.size}</option>`).join('');
    const base = `<p style="margin:0 0 8px 0"><span class="chip up" style="background:rgba(48,209,88,0.12);color:#30d158;padding:4px 10px;border-radius:8px;font-size:0.8rem">● آماده</span></p><p class="fine" style="color:rgba(255,255,255,0.62);margin:0;font-size:0.85rem;line-height:1.55">پاسخ‌دهی آنی از روی قیمت‌های زنده و مدل‌های تست‌شده اپلیکیشن، روی همین دستگاه. بدون نیاز به دانلود، حساب کاربری یا کلید API.</p>`;

    const maxBuf = support.maxStorageBuffers ?? 0;
    const reqBuf = 10;
    const specsLine = `وضعیت دستگاه: WebGPU=${support.webgpu ? 'فعال و سازگار' : 'ناسازگار'} · Storage Buffer مجاز: <span dir="ltr">${maxBuf} / ${reqBuf}</span> · نیمه‌دقیق (<span dir="ltr">F16</span>): ${support.f16 ? 'بله' : 'خیر'}${support.memoryGB ? ` · رم گزارش‌شده: <span dir="ltr">${support.memoryGB}GB</span>` : ''}`;

    let extra = '';
    if (customReady()) {
      extra = customState.reached
        ? `<p class="fine mt" style="margin-top:12px"><span class="chip up" style="background:rgba(48,209,88,0.12);color:#30d158;padding:4px 10px;border-radius:8px;font-size:0.8rem">● متصل شد</span> اندپوینت هوش مصنوعی شما <b>${esc(settings.get().customModel || '')}</b> پاسخ‌ها را تنظیم می‌کند.</p>`
        : `<p class="fine mt" style="margin-top:12px"><span class="chip warn" style="background:rgba(255,159,10,0.12);color:#ff9f0a;padding:4px 10px;border-radius:8px;font-size:0.8rem">● در دسترس نیست</span> اندپوینت شما <b>${esc(settings.get().customModel || '')}</b> پاسخگو نیست؛ پاسخ داخلی نمایش داده می‌شود.</p>`;
    } else if (status === 'ready') {
      extra = `<p class="fine mt" style="margin-top:12px"><span class="chip up" style="background:rgba(48,209,88,0.12);color:#30d158;padding:4px 10px;border-radius:8px;font-size:0.8rem">● مدل زبانی فعال است</span> ${esc(aiState.model)} پاسخ‌ها را بازنویسی می‌کند.</p>`;
    } else if (status === 'loading') {
      extra = `<p class="row mt" style="margin-top:12px;display:flex;align-items:center;gap:8px"><span class="spinner"></span><b>در حال بارگیری مدل زبانی…</b></p><div class="meter" style="background:rgba(255,255,255,0.08);height:6px;border-radius:3px;margin:8px 0;overflow:hidden"><i style="display:block;height:100%;background:var(--accent);width:${Math.round(aiState.progress * 100)}%"></i></div><p class="fine mt" style="color:rgba(255,255,255,0.5);font-size:0.8rem">${esc(aiState.text.slice(0, 140))}</p>`;
    } else if (support.webgpu) {
      extra = `<details class="mt" style="margin-top:12px" open><summary class="fine" style="cursor:pointer;color:var(--accent)">مدل زبانی مرورگر (WebGPU) — روی سیستم شما قابل اجراست</summary>
        <p class="fine mt" style="color:rgba(30,215,96,0.9);margin:8px 0 4px;font-size:0.84rem;line-height:1.6">✓ سیستم شما امکان اجرای مدل داخل مرورگر را دارد. یک بار دانلود می‌شود و سپس از کش مرورگر اجرا می‌گردد.</p>
        <p class="fine" style="color:rgba(255,255,255,0.55);margin:0 0 8px;font-size:0.78rem;line-height:1.55">${specsLine}</p>
        <label class="fld mt" style="display:flex;flex-direction:column;gap:6px"><span style="font-size:0.85rem;color:rgba(255,255,255,0.6)">مدل</span><select class="inp" id="modelSel">${opts}</select></label>
        <button class="btn mt" id="startAi" style="width:100%;margin-top:10px;padding:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:#fff">${icon('chip', 16)} بارگیری مدل زبانی</button></details>`;
    } else {
      const reasonDetail = !('gpu' in navigator)
        ? 'مرورگر یا محیط فعلی از WebGPU (`navigator.gpu`) پشتیبانی نمی‌کند.'
        : maxBuf > 0 && maxBuf < reqBuf
          ? `محدودیت سخت‌افزاری/درایور گرافیک روی این سیستم اجازه نمی‌دهد: شیدرهای مدل به حداقل <span dir="ltr">${reqBuf}</span> بافر ذخیره‌سازی (<span dir="ltr">maxStorageBuffersPerShaderStage</span>) نیاز دارند، اما این دستگاه حداکثر <span dir="ltr">${maxBuf}</span> بافر پشتیبانی می‌کند.`
          : 'آداپتور گرافیکی سازگار برای اجرای مدل‌های WebGPU در مرورگر یافت نشد.';
      extra = `<details class="mt" style="margin-top:12px" open><summary class="fine" style="cursor:pointer;color:#ff9f0a">مدل زبانی مرورگر (WebGPU) — روی این سیستم امکان‌پذیر نیست</summary>
        <div style="margin-top:8px;padding:10px 12px;border-radius:12px;background:rgba(255,159,10,0.08);border:1px solid rgba(255,159,10,0.22);font-size:0.82rem;line-height:1.65;color:rgba(255,255,255,0.82)">
          <div style="font-weight:600;color:#ff9f0a;margin-bottom:4px">✕ امکان اجرای مدل محلی روی این سیستم وجود ندارد</div>
          <p style="margin:0 0 6px">${reasonDetail}</p>
          <p style="margin:0 0 6px;color:rgba(255,255,255,0.62);font-size:0.78rem">${specsLine}</p>
          <p style="margin:0;color:rgba(255,255,255,0.72);font-size:0.8rem">راه جایگزین: دستیار همین حالا با <b>تحلیل‌گر داخلی</b> کار می‌کند یا می‌توانید از بخش <b>«سرور هوش مصنوعی شخصی»</b> به Ollama یا API سازگار با OpenAI متصل شوید.</p>
        </div></details>`;
    }

    const body = base + extra;
    card.innerHTML = `<div class="card-h" style="margin-bottom:14px"><h3 style="margin:0;font-size:1.1rem;color:#fff">${icon('ai', 16)} هوش مصنوعی بی تی سی اس · داخلی</h3></div>${body}
      <details class="mt" style="margin-top:14px"><summary class="fine" style="cursor:pointer;color:var(--accent)">پیشرفته: سرور هوش مصنوعی شخصی</summary>
        <form id="customForm" class="stack mt" style="gap:10px;margin-top:12px">
          <label class="fld" style="display:flex;flex-direction:column;gap:4px"><span style="font-size:0.8rem;color:rgba(255,255,255,0.6)">آدرس سازگار با OpenAI</span><input class="inp" name="url" type="url" placeholder="http://localhost:11434/v1" value="${esc(settings.get().customEndpoint)}"></label>
          <label class="fld" style="display:flex;flex-direction:column;gap:4px"><span style="font-size:0.8rem;color:rgba(255,255,255,0.6)">نام مدل</span><input class="inp" name="model" placeholder="llama3.1" value="${esc(settings.get().customModel)}"></label>
          <label class="fld" style="display:flex;flex-direction:column;gap:4px"><span style="font-size:0.8rem;color:rgba(255,255,255,0.6)">کلید API (اختیاری)</span><input class="inp" name="key" type="password" value="${esc(settings.get().customKey)}"></label>
          <p class="fine down" id="customErr" role="alert" hidden style="color:#ff453a;margin:0"></p>
          <div class="row" style="display:flex;gap:8px"><button class="btn sm primary" style="padding:8px 16px">ذخیره</button><button class="btn sm ghost" type="button" id="clearCustom" style="background:rgba(255,255,255,0.06);border:0;color:#fff;padding:8px 16px;border-radius:10px">حذف</button></div>
        </form></details>`;

    $('#startAi', card)?.addEventListener('click', async () => {
      try { await loadLocalModel($('#modelSel', card).value); toast('مدل زبانی فعال شد', 'up'); }
      catch (e) { toast(e.message, 'down'); }
    });
    $('#customForm', card).addEventListener('submit', (e) => {
      e.preventDefault();
      const ok = checkCustomAI({ url: e.target.url.value, model: e.target.model.value, key: e.target.key.value });
      const err = $('#customErr', card);
      if (!ok.ok) {
        err.textContent = ok.error; err.hidden = false;
        return;
      }
      settings.set({ customEndpoint: ok.url, customModel: ok.model, customKey: ok.key });
      toast('اندپوینت هوش مصنوعی ذخیره شد', 'up'); drawEngine();
    });
    $('#clearCustom', card).addEventListener('click', () => {
      customState.reached = false;
      customState.lastError = null;
      settings.set({ customEndpoint: '', customModel: '', customKey: '' });
      drawEngine();
    });
  };

  const onAi = () => { if (!st.disposed) drawEngine(); };
  aiState.addEventListener('change', onAi);

  const bindMessageActions = (msgEl, rawText, factsText) => {
    msgEl.querySelector('[data-copy]')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(rawText);
        toast('پاسخ کپی شد.', 'up');
      } catch {
        toast('امکان کپی خودکار وجود نداشت.', 'info');
      }
    });
    msgEl.querySelector('[data-facts]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.currentTarget.remove();
      const factsMsg = addMsg('bot', `<div class="fine"><b>داده‌های تأییدشده پشت این پاسخ</b></div>${markdown(factsText)}`);
      scrollToMessage(factsMsg, { smooth: true });
    });
  };

  const addMsg = (role, html) => {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.style.cssText = `padding: 14px 18px; border-radius: 16px; line-height: 1.65; max-width: 86%; ${role === 'user' ? 'background: linear-gradient(135deg, #5e5ce6 0%, #3634a3 100%); color: #fff; margin-right: auto;' : 'background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.92); margin-left: auto;'}`;
    div.innerHTML = html;
    log.append(div);
    return div;
  };

  const drawHistory = () => {
    log.innerHTML = '';
    if (!history.length) {
      addMsg('bot', markdown(`**هر چیزی درباره بازار یا مدیریت معامله بپرسید.**

با سوالات کلی شروع کنید — *«شواهد در حال حاضر کجا بیشترین قدرت را دارند؟»* — تا بازار بررسی شود. یا درباره یک ارز بپرسید: *«آیا خرید ETH در این هفته ارزش دارد؟»* · *«چقدر از ۱۰۰۰ دلار را می‌توانم روی SOL ریسک کنم؟»*

هر پاسخ از قیمت‌های زنده، سیگنال‌ها و پیش‌بینی‌ها ساخته شده است. ماهیت آموزشی دارد، نه مشاوره مالی.`));
      log.scrollTop = log.scrollHeight;
      return;
    }
    let lastBot = null;
    for (const m of history) {
      if (m.role === 'user') {
        addMsg('user', esc(m.content));
      } else {
        const footerHtml = m.meta
          ? `<div class="src" style="margin-top:10px;font-size:0.8rem;color:rgba(255,255,255,0.55);border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;display:flex;flex-wrap:wrap;align-items:center;gap:6px">${m.meta}<button type="button" class="ap-mini-btn" data-copy>کپی</button></div>`
          : '';
        const node = addMsg('bot', markdown(m.content) + footerHtml);
        bindMessageActions(node, m.content, m.content);
        lastBot = node;
      }
    }
    if (lastBot) scrollToMessage(lastBot, { smooth: false });
    else log.scrollTop = log.scrollHeight;
  };

  async function ask(question) {
    question = String(question || '').trim().slice(0, 600);
    if (!question || st.busy) return;
    st.busy = true;
    $('#send', el).disabled = true;
    $('#assistantClear', el).disabled = true;
    $('#assistantSnapshot', el).disabled = true;

    const last = [...history].reverse().find((m) => m.role === 'user');
    const previous = last ? last.root || last.content : '';
    const followUp = isTraderFollowUp(question, previous);
    const root = followUp ? previous : TRADER_Q.test(question) ? question : null;
    history.push({ role: 'user', content: question, at: Date.now(), ...(root ? { root } : {}) });
    saveHistory();
    const userNode = addMsg('user', esc(question));
    scrollToMessage(userNode, { smooth: true });

    const bot = addMsg('bot', '<span class="typing"><i></i><i></i><i></i></span> <span class="fine" data-step style="color:rgba(255,255,255,0.6)">در حال پردازش…</span>');
    scrollToMessage(bot, { smooth: true });
    const step = (t) => { const n = bot.querySelector('[data-step]'); if (n) n.textContent = t; };

    try {
      const wantsPortfolio = SELL_ALL.test(question) || /(portfolio|wallet|holding|my coins|پورتفو|سبد|دارایی)/i.test(question);
      const found = await detectSymbol(question);
      const detected = found && termsIn(found).length && !namedCoins(question).includes(found) ? null : found;
      const plain = !followUp && !TRADER_Q.test(question) && conversationalAnswer(question, { symbol: st.symbol, named: detected ? [detected] : namedCoins(question) });
      if (plain) {
        const src = '<span><b>نگارش:</b> پاسخ داخلی</span><span class="src-note">جنبه آموزشی، نه مشاوره مالی.</span>';
        history.push({ role: 'assistant', content: plain, meta: src, at: Date.now() });
        bot.innerHTML = markdown(plain) + `<div class="src" style="margin-top:10px;font-size:0.8rem;color:rgba(255,255,255,0.55);border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;display:flex;flex-wrap:wrap;align-items:center;gap:6px">${src}<button type="button" class="ap-mini-btn" data-copy>کپی</button></div>`;
        bindMessageActions(bot, plain, plain);
        scrollToMessage(bot, { smooth: true });
        return;
      }

      const wantsMarket = isMarketWide(question) && !detected;
      if (detected && detected !== st.symbol) {
        st.symbol = detected;
        $('#coinSel', el).value = detected;
        drawFocus();
      }
      history.lastSymbol = st.symbol;
      const portfolio = await portfolioSummary();

      const trader = traderAnswer(followUp ? `${previous} ${question}` : question, {
        state: load('traderState', null),
        saved: load('traderCfg', {}),
        lessons: load('traderLessons', []),
        symbol: detected,
        fmt: (v) => money(v),
        followUp,
        latest: question,
      });

      let analysis = null, market = null, marketFrames = null, compare = null;
      const iv = horizonChart(question) || st.interval;
      const wantsCompare = !trader && detectCompare(question);
      if (trader) {
        // پاسخ مستقیماً از وضعیت تریدر شبیه‌سازی‌شده استخراج می‌شود
      } else if (wantsCompare) {
        step(`در حال مقایسه ${wantsCompare.join(', ')}…`);
        compare = await compareCoins(wantsCompare, { interval: iv, onStep: step });
      } else if (wantsMarket) {
        step('در حال اسکن تمام ارزها…');
        const byInterval = await scanMarketMulti({ count: 20, onStep: step });
        marketFrames = marketContextMulti(byInterval);
        market = marketFrames.frames.find((f) => f.interval === iv) || marketFrames.frames[1] || marketFrames.frames[0] || null;
      } else if (!wantsPortfolio || detected) {
        analysis = await analyzeCoin(st.symbol, { interval: iv, onStep: step });
      }

      const ctx = analysis
        ? { ...analystContext(analysis, portfolio), market, marketFrames, compare, compareInterval: iv }
        : { portfolio, market, marketFrames, compare, compareInterval: iv, interval: iv };
      const facts = trader ? trader.text : ruleBasedAnswer(question, ctx);
      const basis = [];
      if (analysis) basis.push(`کندل‌های صرافی برای ${analysis.coin.symbol} (${analysis.interval})`, 'سیگنال‌های اندیکاتور', 'بک‌تست', 'پیش‌بینی مدل‌ها');
      if (trader) basis.push('حساب معاملاتی شبیه‌سازی‌شده');
      const caveat = '<span class="src-note">جنبه آموزشی، نه مشاوره مالی.</span>';
      const meta = (src) => `<span><b>نگارش:</b> ${esc(src)}</span>${basis.length ? `<span><b>مبتنی بر:</b> ${esc(basis.join(' · '))}</span>` : ''}${caveat}<a href="#" data-facts style="color:var(--accent);margin-right:8px">نمایش داده‌های تأییدشده</a>`;

      let finalText = facts, source = 'تحلیل‌گر داخلی';
      if (localReady() || customReady()) {
        step('در حال نوشتن پاسخ…');
        const ac = new AbortController(); st.abort = ac;
        $('#assistantStop', el).disabled = false;
        try {
          const data = trader ? trader.data : analysis ? llmData(analysis) : {};
          if (compare) data.comparison = compare;
          if (marketFrames) data.marketByTimeframe = marketFrames;
          else if (market) data.marketPicks = market;
          if (portfolio.length) data.portfolio = portfolio.map((p) => ({ coin: p.symbol, valueUsd: Math.round(p.value), pnlPct: p.pnlPct !== null ? +p.pnlPct.toFixed(1) : null }));
          const r = await askLLM({
            history: history.slice(0, -1),
            question,
            facts,
            data,
            signal: ac.signal,
            onText: (t) => { bot.innerHTML = markdown(t); },
          });
          const bad = r.text.trim().length > 20
            ? unsupportedFigures(r.text, [facts, JSON.stringify(data), AI_SYSTEM_PROMPT, ...history.filter((m) => m.role === 'user').map((m) => m.content)])
            : [];
          if (r.text.trim().length <= 20) source = 'تحلیل‌گر داخلی';
          else if (bad.length >= 3 || (bad.length === 2 && materialFigures(r.text) < 4)) source = 'تحلیل‌گر داخلی';
          else {
            finalText = r.text;
            if (!/مشاوره مالی نیست/i.test(finalText)) finalText += '\n\nمشاوره مالی محسوب نمی‌شود.';
            source = `${r.source} · ${r.where === 'device' ? 'مدل زبانی روی دستگاه' : 'سرور هوش مصنوعی'}`;
          }
        } catch (err) {
          if (ac.signal.aborted) source = 'تحلیل‌گر داخلی (متوقف شد)';
          else source = 'تحلیل‌گر داخلی';
        }
      }

      history.push({ role: 'assistant', content: finalText, meta: meta(source), at: Date.now() });
      bot.innerHTML = markdown(finalText) + `<div class="src" style="margin-top:10px;font-size:0.8rem;color:rgba(255,255,255,0.55);border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;display:flex;flex-wrap:wrap;align-items:center;gap:6px">${meta(source)}<button type="button" class="ap-mini-btn" data-copy>کپی</button></div>`;
      bindMessageActions(bot, finalText, facts);
      scrollToMessage(bot, { smooth: true });
    } catch (err) {
      const msg = 'مشکلی در ساخت این پاسخ رخ داد. دوباره تلاش کنید.';
      bot.innerHTML = markdown(msg) + '<div class="src"><span><b>نگارش:</b> بدون پاسخ</span></div>';
      history.push({ role: 'assistant', content: msg, at: Date.now() });
      scrollToMessage(bot, { smooth: true });
    } finally {
      saveHistory();
      st.busy = false; st.abort = null;
      if (!st.disposed) {
        $('#send', el).disabled = false;
        $('#assistantStop', el).disabled = true;
        $('#assistantClear', el).disabled = false;
        $('#assistantSnapshot', el).disabled = false;
      }
    }
  }

  $('#assistantSnapshot', el).addEventListener('click', () => {
    ask(`تحلیل کامل ساختار، سطوح ورود، حد ضرر و ریسک ${st.symbol} در تایم‌فریم ${st.interval}`);
  });
  $('#assistantStop', el).addEventListener('click', () => st.abort?.abort());
  $('#assistantClear', el).addEventListener('click', () => {
    if (st.busy) return;
    history.length = 0;
    saveHistory();
    drawHistory();
  });
  $('#form', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#q', el);
    ask(q.value);
    q.value = '';
  });
  $('#q', el).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#form', el).requestSubmit();
    }
  });
  $('#coinSel', el).addEventListener('change', (e) => {
    st.symbol = e.target.value;
    history.lastSymbol = st.symbol;
    saveHistory();
    drawFocus();
  });
  const onStore = (e) => {
    if (e.detail?.key === HISTORY_KEY && !savingHere && !st.busy && !st.disposed) {
      restoreHistory();
      drawHistory();
    }
  };
  window.addEventListener('cv:store', onStore);
  bindSeg($('#ivSeg', el), (v) => {
    st.interval = v;
    $$('#ivSeg button', el).forEach((btn) => {
      const active = btn.dataset.v === v;
      btn.classList.toggle('on', active);
      btn.style.background = active ? 'rgba(255,255,255,0.15)' : 'transparent';
      btn.style.color = active ? '#fff' : 'rgba(255,255,255,0.6)';
    });
  });

  drawHistory();
  drawFocus();
  drawEngine();

  if (support.webgpu && s.llmAuto && s.llmModel && aiState.status === 'idle') {
    loadLocalModel(s.llmModel).catch(() => {});
  }

  return () => {
    st.disposed = true;
    st.abort?.abort();
    focusUnsub?.();
    aiState.removeEventListener('change', onAi);
    window.removeEventListener('cv:store', onStore);
  };
}