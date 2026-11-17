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
import { esc, price, changeHtml, money} from '../format.js';
import { settings, load, save } from '../store.js';

export const title = 'دستیار هوش مصنوعی';
// مکالمه روی این دستگاه و حساب کاربری (cloudsync.js) ذخیره می‌شود،
// بنابراین دستیار پس از بارگذاری مجدد یا روی دستگاه دیگر آن را به یاد می‌آورد.
const HISTORY_KEY = 'assistantHistory';
const KEEP = 30;
const history = [];
function restoreHistory() {
  const saved = load(HISTORY_KEY, null);
  history.length = 0;
  for (const m of Array.isArray(saved?.messages) ? saved.messages : []) if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') history.push(m);
  history.lastSymbol = (typeof saved?.lastSymbol === 'string' && /^[\p{L}\p{N}_]{1,20}$/u.test(saved.lastSymbol) ? saved.lastSymbol : null) || history.lastSymbol;
}
let savingHere = false; // ذخیره‌های خود این صفحه به عنوان خبر از دستگاه دیگر محسوب نمی‌شوند
function saveHistory() {
  const value = {
    messages: history.slice(-KEEP).map((m) => ({ role: m.role, content: String(m.content).slice(0, 6000), ...(m.root ? { root: String(m.root).slice(0, 500) } : {}), ...(m.meta ? { meta: String(m.meta).replace(/<a href="#" data-facts>[^<]*<\/a>/, '') } : {}), at: m.at || Date.now() })),
    lastSymbol: history.lastSymbol || null,
  };
  savingHere = true;
  try { save(HISTORY_KEY, value); } finally { savingHere = false; }
}

export async function render(el, [symParam]) {
  restoreHistory();
  const all = await markets().catch(() => []);
  const st = { symbol: String(symParam || history.lastSymbol || 'BTC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 15) || 'BTC', interval: '4h', busy: false, abort: null, disposed: false };
  const support = await deviceSupport();
  const s = settings.get();

  el.innerHTML = `
    <div class="page-head"><div><h1>دستیار هوش مصنوعی</h1><p>پشتیبانی از تصمیم‌گیری، نه پیش‌بینی سود. پاسخ‌ها روی دستگاه شما از روی قیمت‌های زنده، سیگنال‌های اندیکاتور، بک‌تست‌ها و پیش‌بینی‌هایی که دقتشان اندازه‌گیری شده ساخته می‌شوند؛ مدل زبانی (در صورت فعال‌سازی) فقط همان پاسخ تأییدشده را با کلمات دیگری بیان می‌کند. هر پاسخ می‌گوید از چه منابعی استفاده کرده و در صورت کمبود شواهد، صراحتاً آن را اعلام می‌کند. سوالات شما روی همین دستگاه می‌مانند مگر اینکه سرور هوش مصنوعی شخصی خود را متصل کنید. این ابزار قادر به ثبت معامله نیست. مشاوره مالی محسوب نمی‌شود.</p></div><div class="row"><button class="btn sm" type="button" id="assistantStop" disabled>توقف</button><button class="btn sm ghost" type="button" id="assistantClear">پاک کردن گفتگو</button></div></div>
    <div class="chat">
      <div class="card chat-box">
        <div class="chat-log" id="log" role="log" aria-live="polite" aria-label="گفتگو"></div>
        <div class="suggest" id="suggest"></div>
        <form class="chat-input" id="form">
          <label class="sr-only" for="q">درباره یک ارز، بازار یا حساب شبیه‌سازی‌شده خود بپرسید</label>
          <textarea class="inp" id="q" rows="1" maxlength="600" placeholder="مثلاً: در حال حاضر ${esc(st.symbol)} چقدر ریسک دارد؟ مقایسه بیت‌کوین و اتریوم" aria-describedby="qHelp"></textarea>
          <button class="btn primary" id="send" type="submit" aria-label="ارسال سوال">${icon('send', 16)}</button>
          <span class="sr-only" id="qHelp">برای ارسال کلید Enter و برای خط جدید Shift+Enter را فشار دهید.</span>
        </form>
      </div>
      <div class="stack">
        <div class="card" id="engineCard"></div>
        <div class="card">
          <div class="card-h"><h3>ارز در مرکز توجه</h3></div>
          <div class="row" style="margin-bottom:10px">
            <select class="inp" id="coinSel" aria-label="ارز در مرکز توجه" style="flex:1">${all.filter((c) => !isStable(c.symbol)).slice(0, 150).map((c) => `<option value="${esc(c.symbol)}" ${c.symbol === st.symbol ? 'selected' : ''}>${esc(c.symbol)} · ${esc(c.name)}</option>`).join('')}</select>
          </div>
          <div class="row"><span class="fine">نمودار</span><div class="seg" id="ivSeg">${['1m', '5m', '15m', '1h', '4h', '1d'].map((iv) => `<button data-v="${iv}" class="${iv === st.interval ? 'on' : ''}">${iv}</button>`).join('')}</div></div>
          <div id="focus" class="mt fine"></div>
        </div>
        <div class="card fine">
          <b>دستیار چگونه کار می‌کند</b>
          <ol style="padding-left:18px;margin:6px 0 0">
            <li>کندل‌های زنده بایننس را برای ارز مورد نظر شما دریافت می‌کند.</li>
            <li>خوانش‌ها را روی ۴ تایم‌فریم، یک بک‌تست و پیش‌بینی (۷ مدل شامل تطبیق الگو، شبکه عصبی و درخت‌های تصمیم‌گیری تقویت‌شده که هرکدام با دقت اندازه‌گیری‌شده خود وزن‌دهی شده‌اند) محاسبه می‌کند.</li>
            <li>یک تحلیل‌گر داخلی — یا یک مدل زبانی در حال اجرا روی دستگاه شما — این اعداد تأییدشده را به پاسخی روان تبدیل می‌کند.</li>
            <li>پاسخ مدل بررسی می‌شود: اگر اعدادی را ذکر کند که در داده‌ها وجود ندارند، پاسخ خود تحلیل‌گر نمایش داده می‌شود.</li>
          </ol>
          <p class="mt"><b>کارهایی که نمی‌تواند انجام دهد:</b> پیش‌بینی اخبار قبل از وقوع، دانستن آینده، یا شکست دادن شانس در پیش‌بینی جهت بازار (در تست‌ها موفق نبوده است). وقتی شواهد کم باشد، به جای حدس‌زدن، آن را اعلام می‌کند.</p>
          <p class="mt">مشاوره مالی نیست. دستیار نمی‌تواند معاملاتی را ثبت کند.</p>
        </div>
      </div>
    </div>`;

  const log = $('#log', el);
  let focusUnsub = null;
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
    $('#focus', el).innerHTML = c ? `<div class="row spread"><a class="acc" href="#/coin/${esc(c.symbol)}">نمودار ${esc(c.name)} ←</a><span data-focus-px><b class="p">${money(c.price)}</b> ${changeHtml(c.change24h)}</span></div>` : '';
    if (c?.binance) watchFocus(c.binance);
    const sym = st.symbol;
    $('#suggest', el).innerHTML = [
      'کدام ارزها در حال حاضر بیش از حد کشیده شده‌اند؟', 'شواهد در کجا بیشترین قدرت را دارند؟',
      'چه چیزی را باید برای چند هفته نگهداری کنم و کدام یک فقط یک معامله سریع است؟',
      'مقایسه BTC، ETH و SOL',
      `آیا ${sym} در مرحله بعد صعودی خواهد بود یا نزولی؟`, `چه زمانی باید روی ${sym} سود سیو کنم؟`,
      `چقدر از ۱۰۰۰ دلار را می‌توانم با تعیین حد ضرر روی ${sym} ریسک کنم؟`, `خطرات نگهداری ${sym} چیست؟`, 'بررسی سبد سرمایه من',
    ].map((q) => `<button class="btn sm" type="button">${esc(q)}</button>`).join('');
    $$('#suggest button', el).forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
  };

  const drawEngine = () => {
    const card = $('#engineCard', el);
    const status = aiState.status;
    const opts = CONFIG.LLM_MODELS.map((m) => `<option value="${m.id}" ${(s.llmModel || '').startsWith(m.id.split('-q4')[0]) ? 'selected' : ''}>${m.label} · ${m.size}</option>`).join('');
    const base = `<p><span class="chip up">● آماده</span></p><p class="fine">پاسخ‌دهی آنی از روی قیمت‌های زنده و مدل‌های تست‌شده اپلیکیشن، روی همین دستگاه. بدون نیاز به دانلود، حساب کاربری یا کلید API، و تمام ارقام موجود در پاسخ از همان داده‌ها مشتق شده‌اند.</p>`;
    let extra = '';
    if (customReady()) {
      extra = customState.reached
        ? `<p class="fine mt"><span class="chip up">● متصل شد</span> اندپوینت هوش مصنوعی شما <b>${esc(settings.get().customModel || '')}</b> پاسخ‌ها را تنظیم می‌کند.</p>`
        : `<p class="fine mt"><span class="chip warn">● پیکربندی شده، اما هنوز در دسترس نیست</span> اندپوینت شما <b>${esc(settings.get().customModel || '')}</b> هنگام پرسش بررسی می‌شود؛ در صورت عدم دسترسی، پاسخ داخلی نمایش داده می‌شود.${customState.lastError ? `<br><small class="down">آخرین تلاش: ${esc(customState.lastError)}</small>` : ''}</p>`;
    } else if (status === 'ready') {
      extra = `<p class="fine mt"><span class="chip up">● مدل زبانی فعال است</span> ${esc(aiState.model)} پاسخ‌ها را روی همین دستگاه بازنویسی می‌کند.</p>`;
    } else if (status === 'loading') {
      extra = `<p class="row mt"><span class="spinner"></span><b>در حال بارگیری مدل زبانی…</b></p><div class="meter"><i style="width:${Math.round(aiState.progress * 100)}%"></i></div><p class="fine mt">${esc(aiState.text.slice(0, 140))}</p><p class="fine">در این فاصله، پاسخ‌ها همچنان از موتور داخلی تامین می‌شوند.</p>`;
    } else if (support.webgpu) {
      extra = `<details class="mt"><summary class="fine" style="cursor:pointer">اختیاری: اجازه دهید یک مدل زبانی پاسخ‌ها را بازنویسی کند</summary>
        <p class="fine mt">یک مدل رایگان که داخل مرورگر شما (WebGPU) اجرا می‌شود و همان پاسخ‌ها را با کلمات خود بیان می‌کند. این مدل دانش جدیدی اضافه نمی‌کند: حقایق همچنان از موتور داخلی می‌آیند. یک بار دانلود می‌شود (${(() => { const gb = CONFIG.LLM_MODELS.map((m) => parseFloat(String(m.size).replace(/[^\d.]/g, ''))).filter(Number.isFinite); return gb.length ? `حدود ${Math.min(...gb)} تا ${Math.max(...gb)} گیگابایت، بسته به مدل` : 'حجم بسته به مدل'; })()}) و سپس از حافظه پنهان بارگیری می‌شود.</p>
        <label class="fld mt">مدل<select class="inp" id="modelSel">${opts}</select></label>
        <button class="btn mt" id="startAi" style="width:100%">${icon('chip', 16)} بارگیری مدل زبانی</button>
        ${status === 'error' ? `<p class="fine down mt">${esc(aiState.text)}</p>` : ''}</details>`;
    }
    const body = base + extra;
    card.innerHTML = `<div class="card-h"><h3>${icon('ai', 16)} هوش مصنوعی BTCS · داخلی</h3></div>${body}
      <details class="mt"><summary class="fine" style="cursor:pointer">پیشرفته: استفاده از سرور هوش مصنوعی شخصی</summary>
        <form id="customForm" class="stack mt" style="gap:8px">
          <label class="fld">آدرس سازگار با OpenAI<input class="inp" name="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="300" placeholder="http://localhost:11434/v1" value="${esc(settings.get().customEndpoint)}"></label>
          <label class="fld">نام مدل<input class="inp" name="model" autocomplete="off" spellcheck="false" maxlength="120" placeholder="llama3.1" value="${esc(settings.get().customModel)}"></label>
          <label class="fld">کلید API (اختیاری)<input class="inp" name="key" type="password" autocomplete="off" maxlength="400" value="${esc(settings.get().customKey)}"></label>
          <p class="fine down" id="customErr" role="alert" hidden></p>
          <div class="row"><button class="btn sm primary">ذخیره</button><button class="btn sm" type="button" id="clearCustom">حذف</button></div>
          <p class="fine">با Ollama، LM Studio، vLLM روی این رایانه یا ${esc(AI_HOSTS.join(', '))} کار می‌کند. این ابزار فقط پاسخ موتور داخلی را بازنویسی می‌کند: حقایق و ارقام همچنان از موتور می‌آیند و ارقامی که در داده‌ها یافت نشوند علامت‌گذاری می‌شوند. کلید در همین مرورگر باقی می‌ماند. اولاما تنها زمانی به وب‌سایت‌های دیگر پاسخ می‌دهد که با تنظیم <code>OLLAMA_ORIGINS=${esc(location.origin)}</code> اجرا شود؛ در LM Studio، گزینه CORS را در تنظیمات سرور فعال کنید.</p>
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
        e.target[ok.field]?.setAttribute('aria-invalid', 'true');
        e.target[ok.field]?.focus();
        return;
      }
      settings.set({ customEndpoint: ok.url, customModel: ok.model, customKey: ok.key });
      toast('اندپوینت هوش مصنوعی ذخیره شد', 'up'); drawEngine();
    });
    $('#clearCustom', card).addEventListener('click', () => { customState.reached = false; customState.lastError = null; settings.set({ customEndpoint: '', customModel: '', customKey: '' }); drawEngine(); });
  };
  const onAi = () => { if (!st.disposed) drawEngine(); };
  aiState.addEventListener('change', onAi);

  const addMsg = (role, html) => {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = html;
    log.append(div);
    log.scrollTop = log.scrollHeight;
    return div;
  };
  const drawHistory = () => {
    log.innerHTML = '';
    if (!history.length) {
      addMsg('bot', markdown(`**هر چیزی درباره بازار بپرسید.**

با سوالات کلی شروع کنید — *«شواهد در حال حاضر کجا بیشترین قدرت را دارند؟»* — تا تمام ارزها را در سه افق (کوتاه‌مدت، میان‌مدت و پوزیشن) بررسی کنم و بگویم کدام یک (در صورت وجود) از حد شواهد عبور می‌کنند. غالباً هیچ‌کدام عبور نمی‌کنند و من این را صراحتاً می‌گویم. جایی که ارزی عبور کند، نقطه ورود، حد ضرر و هدف به عنوان نمونه‌ای عملی از ریسک ارائه می‌شوند، نه یک پیش‌بینی قطعی.

یا درباره یک ارز بپرسید: *«آیا خرید ETH در این هفته ارزش دارد؟»* · *«کجا باید SOL را بفروشم؟»* · *«وضعیت سبد سرمایه من چگونه است؟»*

هر پاسخ از قیمت‌های زنده، سیگنال‌های ۴ تایم‌فریم، یک بک‌تست و پیش‌بینی‌ای با دقت اندازه‌گیری و منتشرشده ساخته شده است — هرگز یک حدس در قالب اعداد نیست. زیر هر پاسخ می‌بینید که مبنای آن چه بوده، چه کسی آن را نگاشته و لینکی به داده‌های تأییدشده پشت آن وجود دارد. ماهیت آموزشی دارد، نه مشاوره مالی.`));
    }
    for (const m of history) addMsg(m.role === 'user' ? 'user' : 'bot', m.role === 'user' ? esc(m.content) : markdown(m.content) + (m.meta ? `<div class="src">${m.meta}</div>` : ''));
  };

  async function ask(question) {
    question = String(question || '').trim().slice(0, 600);
    if (!question || st.busy) return;
    st.busy = true;
    $('#send', el).disabled = true;
    $('#assistantClear', el).disabled = true;
    const last = [...history].reverse().find((m) => m.role === 'user');
    const previous = last ? last.root || last.content : '';
    const followUp = isTraderFollowUp(question, previous);
    const root = followUp ? previous : TRADER_Q.test(question) ? question : null;
    history.push({ role: 'user', content: question, at: Date.now(), ...(root ? { root } : {}) });
    saveHistory();
    addMsg('user', esc(question));
    const bot = addMsg('bot', '<span class="typing"><i></i><i></i><i></i></span> <span class="fine" data-step>در حال پردازش…</span>');
    const step = (t) => { const n = bot.querySelector('[data-step]'); if (n) n.textContent = t; };
    try {
      const wantsPortfolio = SELL_ALL.test(question) || /(portfolio|wallet|holding|my coins)/i.test(question);
      const found = await detectSymbol(question);
      const detected = found && termsIn(found).length && !namedCoins(question).includes(found) ? null : found;
      const plain = !followUp && !TRADER_Q.test(question) && conversationalAnswer(question, { symbol: st.symbol, named: detected ? [detected] : namedCoins(question) });
      if (plain) {
        const src = '<span><b>نگارش:</b> پاسخ داخلی (توضیح عمومی، بدون نیاز به داده زنده)</span><span class="src-note">جنبه آموزشی، نه مشاوره مالی.</span>';
        history.push({ role: 'assistant', content: plain, meta: src, at: Date.now() });
        bot.innerHTML = markdown(plain) + `<div class="src">${src}</div>`;
        return;
      }
      const wantsMarket = isMarketWide(question) && !detected;
      if (detected && detected !== st.symbol) { st.symbol = detected; $('#coinSel', el).value = detected; drawFocus(); }
      history.lastSymbol = st.symbol;
      const portfolio = await portfolioSummary();

      const trader = traderAnswer(followUp ? `${previous} ${question}` : question, { state: load('traderState', null), saved: load('traderCfg', {}), lessons: load('traderLessons', []), symbol: detected, fmt: (v) => money(v), followUp, latest: question });

      let analysis = null, market = null, marketFrames = null, compare = null;
      const iv = horizonChart(question) || st.interval;
      const wantsCompare = !trader && detectCompare(question);
      if (trader) {
        // چیزی برای دریافت وجود ندارد: حساب روی همین دستگاه است
      } else if (wantsCompare) {
        step(`در حال مقایسه ${wantsCompare.join(', ')}…`);
        compare = await compareCoins(wantsCompare, { interval: iv, onStep: step });
      } else if (wantsMarket) {
        step('در حال اسکن تمام ارزها روی ۳ تایم‌فریم…');
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
      if (analysis) basis.push(`${analysis.source === 'binance' ? 'کندل‌های زنده صرافی' : analysis.source === 'demo' ? 'داده‌های دمو (داده زنده در دسترس نیست)' : 'قیمت‌های کوین‌گکو'} برای ${analysis.coin.symbol} (${analysis.interval})`, 'سیگنال‌های اندیکاتور در ۴ تایم‌فریم', 'یک بک‌تست', 'پیش‌بینی و دقت اندازه‌گیری‌شده آن');
      if (marketFrames) basis.push(`اسکن زنده ${marketFrames.scanned} ارز روی ${marketFrames.intervals.join(', ')}`);
      else if (market) basis.push(`اسکن زنده ${market.scanned} ارز روی ${market.interval}`);
      if (compare) basis.push('عملکرد، نوسان و افت سرمایه اندازه‌گیری‌شده ارزهای مقایسه‌شده');
      if (trader) basis.push('حساب معاملاتی شبیه‌سازی‌شده (پِیپِرتریدینگ) شما روی این دستگاه');
      if (portfolio.length && (wantsPortfolio || analysis)) basis.push('سبد سرمایه شما روی این دستگاه');
      const caveat = analysis || market || marketFrames
        ? '<span class="src-note">پیش‌بینی‌های جهت بازار در تست‌ها نتوانسته‌اند شانس را شکست دهند؛ بازه‌ها و ارقام ریسک بخش اندازه‌گیری‌شده هستند. جنبه آموزشی، نه مشاوره مالی.</span>'
        : '<span class="src-note">جنبه آموزشی، نه مشاوره مالی.</span>';
      const meta = (src) => `<span><b>نگارش:</b> ${esc(src)}</span>${basis.length ? `<span><b>مبتنی بر:</b> ${esc(basis.join(' · '))}</span>` : ''}${caveat}<a href="#" data-facts>نمایش داده‌های تأییدشده پشت این پاسخ</a>`;
      let finalText = facts, source = 'تحلیل‌گر داخلی (مبتنی بر قاعده، از داده‌های تأییدشده)';
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
          const r = await askLLM({ history: history.slice(0, -1), question, facts, data, signal: ac.signal, onText: (t) => { bot.innerHTML = markdown(t); log.scrollTop = log.scrollHeight; } });
          const bad = r.text.trim().length > 20 ? unsupportedFigures(r.text, [facts, JSON.stringify(data), AI_SYSTEM_PROMPT, ...history.filter((m) => m.role === 'user').map((m) => m.content)]) : [];
          if (r.text.trim().length <= 20) source = 'تحلیل‌گر داخلی (مدل هوش مصنوعی پاسخی نداد)';
          else if (bad.length >= 3 || (bad.length === 2 && materialFigures(r.text) < 4)) source = `تحلیل‌گر داخلی (پاسخ هوش مصنوعی حاوی اعدادی خارج از داده‌ها بود: ${bad.slice(0, 3).join(', ')})`;
          else {
            finalText = r.text;
            if (r.cut) finalText += "\n\n_به دلیل محدودیت طول مدل متوقف شد؛ پاسخ کامل تأییدشده در قسمت «نمایش داده‌های استفاده‌شده» موجود است._";
            if (bad.length) finalText += `\n\n_خارج از داده‌های تأییدشده: ${bad.join(', ')}. بررسی با «نمایش داده‌های استفاده‌شده»._`;
            if (!/مشاوره مالی نیست/i.test(finalText)) finalText += '\n\nمشاوره مالی محسوب نمی‌شود.';
            source = `${r.source} · ${r.where === 'device' ? 'مدل زبانی روی این دستگاه' : 'سرور هوش مصنوعی شما'}، بازنویسی تحلیل‌گر داخلی (ارقام با داده‌ها مطابقت داده شدند)`;
          }
        } catch (err) {
          if (ac.signal.aborted) source = 'تحلیل‌گر داخلی (متوقف شد)';
          else {
            console.warn('LLM failed, using analyst', err);
            source = 'تحلیل‌گر داخلی (مدل هوش مصنوعی در دسترس نیست)';
          }
        }
      }
      history.push({ role: 'assistant', content: finalText, meta: meta(source), at: Date.now() });
      bot.innerHTML = markdown(finalText) + `<div class="src">${meta(source)}</div>`;
      bot.querySelector('[data-facts]')?.addEventListener('click', (e) => { e.preventDefault(); e.currentTarget.remove(); addMsg('bot', `<div class="fine"><b>داده‌های تأییدشده پشت این پاسخ</b> (پاسخ تحلیل‌گر داخلی، پیش از هرگونه بازنویسی)</div>${markdown(facts)}`); });
    } catch (err) {
      console.warn('assistant: could not build an answer', err);
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const net = offline || /fetch|network|load failed|timeout|abort/i.test(String(err?.message || ''));
      const msg = net
        ? 'بارگیری داده‌های بازار مورد نیاز برای این پاسخ امکان‌پذیر نبود، بنابراین به جای حدس‌زدن، پاسخی ارائه نمی‌شود. اتصال خود را بررسی کرده و دوباره تلاش کنید.'
        : 'مشکلی در ساخت این پاسخ رخ داد، بنابراین به جای حدس‌زدن پاسخی نمایش داده نمی‌شود. دوباره تلاش کنید یا درباره ارز دیگری بپرسید.';
      bot.innerHTML = markdown(msg) + '<div class="src"><span><b>نگارش:</b> بدون پاسخ (داده‌ها در دسترس نیستند)</span></div>';
      history.push({ role: 'assistant', content: msg, at: Date.now() });
    } finally {
      saveHistory();
      st.busy = false; st.abort = null;
      if (!st.disposed) {
        $('#send', el).disabled = false;
        $('#assistantStop', el).disabled = true;
        $('#assistantClear', el).disabled = false;
      }
      log.scrollTop = log.scrollHeight;
    }
  }

  $('#assistantStop', el).addEventListener('click', () => st.abort?.abort());
  $('#assistantClear', el).addEventListener('click', () => { if (st.busy) return; history.length = 0; saveHistory(); drawHistory(); });
  $('#form', el).addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q', el); ask(q.value); q.value = ''; });
  $('#q', el).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#form', el).requestSubmit(); } });
  $('#coinSel', el).addEventListener('change', (e) => { st.symbol = e.target.value; history.lastSymbol = st.symbol; saveHistory(); drawFocus(); });
  const onStore = (e) => { if (e.detail?.key === HISTORY_KEY && !savingHere && !st.busy && !st.disposed) { restoreHistory(); drawHistory(); } };
  window.addEventListener('cv:store', onStore);
  bindSeg($('#ivSeg', el), (v) => { st.interval = v; });

  drawHistory(); drawFocus(); drawEngine();

  if (support.webgpu && s.llmAuto && s.llmModel && aiState.status === 'idle') {
    loadLocalModel(s.llmModel).catch(() => {});
  }
  if (!support.webgpu && !s.llmModel) recommendedModelId();
  return () => { st.disposed = true; st.abort?.abort(); focusUnsub?.(); aiState.removeEventListener('change', onAi); window.removeEventListener('cv:store', onStore); };
}