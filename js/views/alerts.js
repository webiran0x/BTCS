import { markets, isStable } from '../api/market.js';
import { $, $$, icon, toast, coinLogo, skeleton } from '../ui.js';
import { esc, price, ago, money } from '../format.js';
import { load, save } from '../store.js';
import { fx } from '../api/fx.js';
import { auth, backendEnabled, serverAlerts, createServerAlert, deleteServerAlert, serverAiAlerts, createAiAlert, deleteAiAlert } from '../api/backend.js';
import { openAuth } from './auth.js';

export const title = 'هشدارها';

export async function render(el, [preset]) {
  const all = await markets().catch(() => []);
  const coins = all.filter((c) => c.binance && !isStable(c.symbol));
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  el.innerHTML = `
    <div class="page-head"><div><h1>هشدارها</h1><p>سه نوع هشدار وجود دارد: <b>هشدار قیمت</b> که یک سطح را زیر نظر دارد، <b>هشدار سیگنال</b> که در لحظه فعال‌شدن تنظیمات موتور روی نمودار فعال می‌شود — همراه با نقطه ورود، حد ضرر و اهداف در پیام — و <b>هشدار سیگنال هوش مصنوعی</b> که زمانی که سیگنال هوش مصنوعی ارزی را می‌خرد یا می‌فروشد، به شما اطلاع می‌دهد.</p></div></div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>هشدار سیگنال</h3><span class="chip warn">اجرا روی سرور</span></div>
      <div id="sigBox">${skeleton(3, 22)}</div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-h"><h3>هشدار سیگنال هوش مصنوعی</h3><span class="chip warn">اجرا روی سرور</span></div>
      <div id="aiBox">${skeleton(3, 22)}</div>
    </div>

    <div class="grid g2">
      <div class="card">
        <h3 style="margin-bottom:12px">هشدار قیمت جدید</h3>
        <form id="f" class="stack" style="gap:10px">
          <label class="fld">ارز<select class="inp" name="sym">${coins.map((c) => `<option value="${esc(c.symbol)}" ${c.symbol === (preset || 'BTC').toUpperCase() ? 'selected' : ''}>${esc(c.symbol)} · ${esc(c.name)}</option>`).join('')}</select></label>
          <div class="row">
            <label class="fld">وقتی قیمت<select class="inp" name="dir"><option value="above">بالاتر از</option><option value="below">پایین‌تر از</option></select></label>
            <label class="fld" style="flex:1"><span>قیمت (<span id="curCode">${esc(fx.code)}</span>)</span><input class="inp" name="price" type="number" step="any" min="0" required></label>
          </div>
          <p class="fine" id="cur"></p>
          <button class="btn primary">${icon('alerts', 16)} ایجاد هشدار</button>
          <p class="fine" id="reach"></p>
        </form>
        <div class="mt" id="permBox">${perm === 'granted' ? '<p class="fine up">اعلان‌های مرورگر فعال هستند.</p>' : perm === 'unsupported' ? '<p class="fine">این مرورگر از اعلان‌ها پشتیبانی نمی‌کند — هشدارها به صورت پیام‌های روی صفحه نمایش داده می‌شوند.</p>' : '<button class="btn sm" id="perm">فعال‌سازی اعلان‌های مرورگر</button>'}</div>
      </div>
      <div class="card"><div class="card-h"><h3>هشدارهای شما</h3><button class="btn sm ghost" id="clear">پاک کردن موارد فعال‌شده</button></div><div id="list"></div></div>
    </div>`;

  const f = $('#f', el);
  const toUsd = (v) => (fx.rate ? v / fx.rate : v);
  const showCur = () => {
    const c = coins.find((x) => x.symbol === f.sym.value);
    const code = $('#curCode', el);
    if (code) code.textContent = fx.code;
    if (c) {
      $('#cur', el).textContent = fx.code === 'USD'
        ? `قیمت فعلی: ${money(c.price)}`
        : `قیمت فعلی: ${money(c.price)} (US$${price(c.price)})`;
      if (!f.price.value) f.price.placeholder = price(c.price * fx.rate);
    }
  };
  f.sym.addEventListener('change', () => { f.price.value = ''; showCur(); });
  const onCurrency = () => { f.price.value = ''; showCur(); draw(); };
  window.addEventListener('cv:currency', onCurrency);
  showCur();

  const INTERVALS = ['15m', '1h', '4h', '1d'];
  const SIDES = [['any', 'هر جهتی'], ['long', 'فقط تنظیمات صعودی'], ['short', 'فقط تنظیمات نزولی']];

  async function drawSignals() {
    const box = $('#sigBox', el);
    if (!box) return;

    if (!backendEnabled()) {
      box.innerHTML = '<p class="fine">هشدارهای سیگنال نیاز به سرور پشتیبان دارند که در این دپلوی متصل نیست. هشدارهای قیمت در پایین همچنان هنگام باز بودن سایت کار می‌کنند.</p>';
      return;
    }
    if (!auth.user) {
      box.innerHTML = `<p class="fine">برای تنظیم هشدار سیگنال وارد شوید — این هشدار روی سرور اجرا می‌شود، بنابراین حتی با بسته بودن مرورگر به شما می‌رسد.</p>
        <button class="btn primary mt" id="sigSignIn">${icon('bolt', 16)} ورود</button>`;
      $('#sigSignIn', box).addEventListener('click', () => openAuth('in'));
      return;
    }

    const rows = await serverAlerts().catch(() => null);
    if (!rows) {
      box.innerHTML = `<p class="fine">بارگیری هشدارهای سیگنال امکان‌پذیر نبود — سرور پاسخ نداد.</p><button class="btn sm" id="sigRetry">تلاش مجدد</button>`;
      $('#sigRetry', box).addEventListener('click', drawSignals);
      return;
    }
    const sigs = rows.filter((r) => r.kind === 'signal');
    box.innerHTML = `
      <form id="sf" class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <label class="fld">ارز<select class="inp" name="sym">${coins.slice(0, 60).map((c) => `<option value="${esc(c.symbol)}">${esc(c.symbol)} · ${esc(c.name)}</option>`).join('')}</select></label>
        <label class="fld">نمودار<select class="inp" name="iv">${INTERVALS.map((i) => `<option ${i === '4h' ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
        <label class="fld">اطلاع‌رسانی درباره<select class="inp" name="side">${SIDES.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label>
        <label class="fld">فقط در صورتی که توافق اندیکاتورها حداقل برابر باشد با<input class="inp" name="score" type="number" min="10" max="100" step="5" value="25" style="width:90px"></label>
        <button class="btn primary">${icon('alerts', 16)} ایجاد هشدار سیگنال</button>
      </form>
      <p class="fine mt">این عدد میزان توافق قدرتمند اندیکاتورها را نشان می‌دهد، نه احتمال سودآوری معامله — تست‌ها نشان داده‌اند عدد بالاتر به معنای نتیجه بهتر نیست. این بررسی یک بار در زمان بسته شدن هر کندل روی آن نمودار انجام می‌شود و قبل از اطلاع‌رسانی مجدد، یک کندل کامل صبر می‌کند. در صورت اتصال تلگرام و ایمیل در <a href="#/account">صفحه حساب کاربری</a>، اعلان‌ها به آنجا ارسال می‌شوند.</p>
      ${sigs.length ? `<div class="stack mt" style="gap:8px">${sigs.map((a) => `
        <div class="row spread" style="padding:10px;border-radius:10px;background:var(--surface-2)">
          <div><b>${esc(a.symbol)}</b> · نمودار ${esc(a.interval)} · ${esc(SIDES.find(([v]) => v === (a.side || 'any'))?.[1] || 'هر جهتی')} · توافق ≥ ${esc(String(a.min_score ?? 25))}
            <br><small class="muted">${a.last_fired_at ? `آخرین فعال‌سازی ${ago(new Date(a.last_fired_at).getTime())}` : 'در انتظار تنظیمات'}</small></div>
          <button class="icon-btn" style="width:32px;height:32px" data-sigdel="${esc(String(a.id))}" aria-label="حذف هشدار سیگنال">${icon('trash', 14)}</button>
        </div>`).join('')}</div>` : '<p class="fine mt">هنوز هیچ هشدار سیگنالی ثبت نشده است.</p>'}`;

    $('#sf', box).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f2 = e.currentTarget;
      const btn = f2.querySelector('button');
      btn.disabled = true;
      try {
        await createServerAlert({
          kind: 'signal', symbol: f2.sym.value, interval: f2.iv.value,
          side: f2.side.value, min_score: Math.round(+f2.score.value) || 25,
          channels: ['telegram', 'email'], active: true,
        });
        toast(`هشدار سیگنال برای ${f2.sym.value} روی نمودار ${f2.iv.value} تنظیم شد.`, 'up');
        drawSignals();
      } catch (err) {
        toast(err.message, 'down');
        btn.disabled = false;
      }
    });
    $$('[data-sigdel]', box).forEach((b) => b.addEventListener('click', async () => {
      try { await deleteServerAlert(b.dataset.sigdel); } catch (err) { toast(err.message, 'down'); }
      drawSignals();
    }));
  }

  const AI_SIDES = [['any', 'خریدها و فروش‌ها'], ['long', 'فقط خریدها'], ['short', 'فقط فروش‌ها']];
  async function drawAi() {
    const box = $('#aiBox', el);
    if (!box) return;
    if (!backendEnabled()) { box.innerHTML = '<p class="fine">هشدارهای سیگنال هوش مصنوعی نیاز به سرور پشتیبان دارند که در این دپلوی متصل نیست.</p>'; return; }
    if (!auth.user) {
      box.innerHTML = `<p class="fine">برای دریافت پیام هنگام خرید یا فروش یک ارز توسط سیگنال هوش مصنوعی وارد شوید — این هشدار روی سرور اجرا می‌شود، بنابراین حتی با بسته بودن مرورگر به شما می‌رسد.</p>
        <button class="btn primary mt" id="aiSignIn">${icon('bolt', 16)} ورود</button>`;
      $('#aiSignIn', box).addEventListener('click', () => openAuth('in'));
      return;
    }
    const rows = await serverAiAlerts().catch(() => null);
    if (!rows) {
      box.innerHTML = '<p class="fine">بارگیری هشدارهای سیگنال هوش مصنوعی امکان‌پذیر نبود — سرور پاسخ نداد.</p><button class="btn sm" id="aiRetry">تلاش مجدد</button>';
      $('#aiRetry', box).addEventListener('click', drawAi);
      return;
    }
    const mine = rows;
    box.innerHTML = `
      <form id="af" class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <label class="fld">ارز<select class="inp" name="sym">${coins.slice(0, 60).map((c) => `<option value="${esc(c.symbol)}">${esc(c.symbol)} · ${esc(c.name)}</option>`).join('')}</select></label>
        <label class="fld">نمودار<select class="inp" name="iv">${['15m', '1h', '4h', '1d'].map((i) => `<option ${i === '1d' ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
        <label class="fld">اطلاع‌رسانی درباره<select class="inp" name="side">${AI_SIDES.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label>
        <button class="btn primary">${icon('alerts', 16)} ایجاد هشدار سیگنال هوش مصنوعی</button>
      </form>
      <p class="fine mt">همان سیگنال موجود در صفحه هر ارز: قوانین معاملاتی تست‌شده نمودار، که هنگام بسته شدن کندل بررسی می‌شود. پیام اقدام انجام‌شده را اعلام می‌کند — خرید (همراه با حد ضرر) یا فروش (همراه با نتیجه پس از کسر کارمزد) — از طریق تلگرام یا ایمیل در صورت تنظیم، و روی این سایت در هر زمان که باز باشد (با اعلان مرورگر در صورت اجازه شما). در تست‌ها، خریدهایی از این دست جهت بازار را بهتر از شانس پیش‌بینی نکردند؛ صفحه ارز و سوابق عملکرد این سابقه را نشان می‌دهند. هیچ سفارشی در اینجا ثبت نمی‌شود.</p>
      ${mine.length ? `<div class="stack mt" style="gap:8px">${mine.map((a) => `
        <div class="row spread" style="padding:10px;border-radius:10px;background:var(--surface-2)">
          <div><b>${esc(a.symbol)}</b> · نمودار ${esc(a.interval)} · ${esc(AI_SIDES.find(([v]) => v === (a.side || 'any'))?.[1] || 'خریدها و فروش‌ها')}
            <br><small class="muted">${a.last_fired_at ? `آخرین فعال‌سازی ${ago(new Date(a.last_fired_at).getTime())}` : 'در انتظار خرید یا فروش'}</small></div>
          <button class="icon-btn" style="width:32px;height:32px" data-aidel="${esc(String(a.id))}" aria-label="حذف هشدار سیگنال هوش مصنوعی">${icon('trash', 14)}</button>
        </div>`).join('')}</div>` : '<p class="fine mt">هنوز هیچ هشدار سیگنال هوش مصنوعی ثبت نشده است.</p>'}`;
    $('#af', box).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f2 = e.currentTarget;
      const btn = f2.querySelector('button');
      btn.disabled = true;
      try {
        await createAiAlert({ symbol: f2.sym.value, interval: f2.iv.value, side: f2.side.value, channels: ['telegram', 'email'], active: true });
        toast(`هشدار سیگنال هوش مصنوعی برای ${f2.sym.value} روی نمودار ${f2.iv.value} تنظیم شد.`, 'up');
        drawAi();
      } catch (err) {
        toast(err.message, 'down');
        btn.disabled = false;
      }
    });
    $$('[data-aidel]', box).forEach((b) => b.addEventListener('click', async () => {
      try { await deleteAiAlert(b.dataset.aidel); } catch (err) { toast(err.message, 'down'); }
      drawAi();
    }));
  }

  drawSignals();
  drawAi();
  const onAuth = () => { drawSignals(); drawAi(); loadElsewhere(); };
  auth.addEventListener('change', onAuth);

  const signedIn = () => !!auth.user && backendEnabled();
  const reach = () => {
    const r = $('#reach', el);
    if (r) r.textContent = signedIn()
      ? 'وارد شده‌اید: سرور هشدارهای قیمت شما را نیز زیر نظر دارد و پس از اتصال در صفحه حساب کاربری، با بسته بودن سایت آن‌ها را به تلگرام یا ایمیل ارسال می‌کند.'
      : 'هنگام باز بودن سایت کار می‌کند. برای دریافت هشدارهای قیمت از طریق تلگرام یا ایمیل با بسته بودن سایت نیز وارد شوید.';
  };
  let elsewhere = [];
  const row = (c, sym, dir, lvl, sub, attr) => `<div class="row spread" style="padding:10px;border-radius:10px;background:var(--surface-2)">
        <div class="row">${coinLogo(c || { symbol: sym }, 26)}<div><b>${esc(sym)}</b> ${esc(dir === 'above' ? 'بالاتر از' : dir === 'below' ? 'پایین‌تر از' : dir)} <b>${money(lvl)}</b><br><small class="muted">${sub}</small></div></div>
        <button class="icon-btn" style="width:32px;height:32px" ${attr} aria-label="حذف هشدار">${icon('trash', 14)}</button></div>`;
  const draw = () => {
    const alerts = load('alerts', []);
    const items = [
      ...alerts.map((a, i) => {
        const c = coins.find((x) => x.symbol === a.symbol);
        return row(c, a.symbol, a.dir, a.price, `${a.triggered ? `✅ فعال‌شده ${ago(a.triggered)}` : `در انتظار · اکنون ${money(c?.price)}`}${a.serverId ? ' · همچنین از طریق تلگرام / ایمیل' : ''}`, `data-del="${i}"`);
      }),
      ...elsewhere.map((a) => row(coins.find((x) => x.symbol === a.symbol), a.symbol, a.direction, Number(a.price),
        `${a.triggered_at ? `✅ فعال‌شده ${ago(new Date(a.triggered_at).getTime())}` : 'در انتظار'} · ذخیره‌شده روی دستگاه دیگر`, `data-srv="${esc(String(a.id))}"`)),
    ];
    $('#list', el).innerHTML = items.length ? `<div class="stack" style="gap:8px">${items.join('')}</div>` : '<p class="muted">هنوز هیچ هشداری ثبت نشده است.</p>';
    $$('[data-del]', el).forEach((b) => b.addEventListener('click', async () => {
      const al = load('alerts', []);
      const [gone] = al.splice(+b.dataset.del, 1);
      save('alerts', al);
      if (gone?.serverId) { try { await deleteServerAlert(gone.serverId); } catch (err) { toast(err.message, 'down'); } }
    }));
    $$('[data-srv]', el).forEach((b) => b.addEventListener('click', async () => {
      try { await deleteServerAlert(b.dataset.srv); elsewhere = elsewhere.filter((a) => String(a.id) !== b.dataset.srv); draw(); } catch (err) { toast(err.message, 'down'); }
    }));
  };
  const loadElsewhere = async () => {
    reach();
    if (!signedIn()) { elsewhere = []; draw(); return; }
    const rows = await serverAlerts().catch(() => null);
    if (!rows) return;
    const mine = new Set(load('alerts', []).map((a) => String(a.serverId)));
    elsewhere = rows.filter((a) => (a.kind ?? 'price') === 'price' && !mine.has(String(a.id)));
    draw();
  };

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    const typed = parseFloat(f.price.value);
    if (!(typed > 0)) { toast('قیمتی بالاتر از صفر وارد کنید.', 'down'); return; }
    const entry = { symbol: f.sym.value, dir: f.dir.value, price: toUsd(typed), created: Date.now() };
    const nowPx = coins.find((c) => c.symbol === entry.symbol)?.price;
    const already = Number.isFinite(nowPx) && ((entry.dir === 'above' && nowPx >= entry.price) || (entry.dir === 'below' && nowPx <= entry.price));
    let where = 'هنگام باز بودن سایت کار می‌کند.';
    if (signedIn()) {
      btn.disabled = true;
      try {
        entry.serverId = await createServerAlert({ kind: 'price', symbol: entry.symbol, direction: entry.dir, price: entry.price, channels: ['telegram', 'email'], active: true });
        where = 'سرور نیز آن را زیر نظر دارد.';
      } catch (err) { where = `فقط در این مرورگر ذخیره شد: ${err.message}`; }
      btn.disabled = false;
    }
    const alerts = load('alerts', []);
    alerts.unshift(entry);
    save('alerts', alerts);
    toast(`هشدار تنظیم شد: ${entry.symbol} ${entry.dir === 'above' ? 'بالاتر از' : 'پایین‌تر از'} ${money(entry.price)}. ${where}${already ? ` ${entry.symbol} در حال حاضر ${entry.dir === 'above' ? 'بالاتر یا مساوی' : 'پایین‌تر یا مساوی'} آن قیمت است، بنابراین بلافاصله فعال خواهد شد.` : ''}`, 'info');
    f.price.value = '';
  });
  $('#perm', el)?.addEventListener('click', async () => {
    const r = await Notification.requestPermission();
    $('#permBox', el).innerHTML = r === 'granted' ? '<p class="fine up">اعلان‌های مرورگر فعال هستند.</p>' : '<p class="fine">اعلان‌ها مسدود شدند — هشدارها به جای آن روی صفحه نمایش داده می‌شوند.</p>';
  });
  $('#clear', el).addEventListener('click', () => {
    const all = load('alerts', []);
    save('alerts', all.filter((a) => !a.triggered));
    for (const a of all) if (a.triggered && a.serverId) deleteServerAlert(a.serverId).catch(() => {});
  });
  const onStore = (e) => { if (e.detail.key === 'alerts') draw(); };
  window.addEventListener('cv:store', onStore);
  draw();
  loadElsewhere();
  return () => {
    window.removeEventListener('cv:store', onStore);
    window.removeEventListener('cv:currency', onCurrency);
    auth.removeEventListener('change', onAuth);
  };
}