// پنل مدیریت: ترافیک، کاربران، اعطای اشتراک ویژه، محتوا، تنظیمات سایت، کلیدهای API و وظایف زمان‌بندی‌شده (Cron).
// تمامی عملیات مجدداً در سمت سرور بررسی می‌شوند — این صفحه صرفاً برای راحتی کار است، نه امنیت.
import { $, $$, bindTabs, toast, skeleton, modal, icon } from '../ui.js';
import { esc, dateTime, compact } from '../format.js';
import { auth, sb, isAdmin, callFn, getPosts, savePost, deletePost, forgetAppSettings } from '../api/backend.js';
import { CONFIG } from '../config.js';

export const title = 'مدیریت';

export async function render(el) {
  await sb();
  if (!isAdmin()) {
    el.innerHTML = '<div class="card empty"><h3>فقط مخصوص مدیران</h3><p>این صفحه فقط برای مدیران سایت قابل دسترس است.</p><a class="btn" href="#/">بازگشت به بازارها</a></div>';
    return;
  }

  el.innerHTML = `
    <div class="page-head"><div><h1>مدیریت</h1><p>وارد شده با حساب ${esc(auth.user.email)}</p></div></div>
    <div class="tabs" id="tabs">
      <button data-tab="stats" class="on">نمای کلی</button>
      <button data-tab="growth">تحلیل آمار</button>
      <button data-tab="users">کاربران</button>
      <button data-tab="content">محتوا</button>
      <button data-tab="settings">تنظیمات</button>
      <button data-tab="keys">کلیدهای API</button>
      <button data-tab="jobs">وظایف (Jobs)</button>
    </div>
    <div id="panel">${skeleton(6, 24)}</div>`;

  const panel = $('#panel', el);
  // یک اقدام مدیریتی ممکن است تنظیمات عمومی را تغییر داده باشد: سایر صفحات باید دوباره سوال کنند
  const call = (action, extra = {}) => callFn('admin', { action, ...extra }).finally(forgetAppSettings);

  const TABS = {
    // ------------------------------------------------------------ نمای کلی
    async stats() {
      panel.innerHTML = skeleton(6, 24);
      let s;
      try { s = await call('stats'); }
      catch (err) { panel.innerHTML = `<div class="card empty"><h3>بارگیری نمای کلی امکان‌پذیر نیست</h3><p>${esc(err.message)}</p></div>`; return; }
      const days = Object.keys(s.byDay || {}).sort();
      const max = Math.max(1, ...Object.values(s.byDay));
      const card = (k, v, sub = '') => `<div class="card"><div class="stat"><span class="k">${k}</span><span class="v">${v}</span><span class="s fine">${sub}</span></div></div>`;
      panel.innerHTML = `
        <div class="admin-grid">
          ${card('کاربران', s.users, `${s.premium} دارای اشتراک ویژه (خریداری شده یا اهدایی)`)}
          ${card('بازدیدکنندگان · ۳۰ روز گذشته', compact(s.visitors, ''), `${compact(s.views, '')} بازدید صفحه${s.viewsCapped ? ' — حداقل میزان، شمارش محدود شده است' : ''}`)}
          ${card('هشدارها', s.activeAlerts, `${s.triggered} فعال‌شده`)}
          ${card('تلگرام متصل شده', s.telegram)}
          ${card('سیگنال‌های ثبت‌شده', compact(s.signals, ''))}
          ${card('اخبار ذخیره‌شده', compact(s.news, ''))}
          ${card('پست‌ها', s.posts)}
        </div>
        <div class="grid g2 mt">
          <div class="card"><h3>بازدیدهای صفحه در روز</h3><div class="bars mt">${days.map((d) => `<i style="height:${(s.byDay[d] / max) * 100}%" title="${esc(d)}: ${s.byDay[d]}"></i>`).join('')}</div><p class="fine mt">${days[0] || ''} ← ${days.at(-1) || ''}</p></div>
          <div class="card"><h3>صفحات برتر</h3><dl class="kv mt">${Object.entries(s.byPath).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p, n]) => `<dt>${esc(p)}</dt><dd>${n}</dd>`).join('')}</dl>
            <h3 class="mt">دستگاه‌ها</h3><dl class="kv">${Object.entries(s.byDevice).map(([d, n]) => `<dt>${esc(d)}</dt><dd>${n}</dd>`).join('')}</dl></div>
        </div>
        <div class="card mt"><h3>جدیدترین حساب‌ها</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">ایمیل</th><th class="l">نام</th><th>تاریخ عضویت</th><th>اشتراک ویژه</th></tr></thead><tbody>
          ${(s.recentUsers || []).map((u) => `<tr><td class="l">${esc(u.email)}</td><td class="l">${esc(u.display_name || '')}</td><td class="fine">${dateTime(new Date(u.created_at).getTime(), false)}</td><td>${u.premium_until && new Date(u.premium_until) > new Date() ? '<span class="chip up">بله</span>' : '—'}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    },

    // ------------------------------------------------------------ تحلیل عمیق‌تر آمار
    async growth() {
      panel.innerHTML = skeleton(6, 24);
      const client = await sb();
      const since = new Date(Date.now() - 90 * 864e5).toISOString();
      const VIEW_CAP = 50000;
      const [{ data: profs }, { data: views }, { data: subs }] = await Promise.all([
        client.from('profiles').select('created_at,premium_until,telegram_chat_id,email_verified').limit(5000),
        client.from('page_views').select('path,created_at,device,session_id,referrer').gte('created_at', since).order('created_at', { ascending: false }).limit(VIEW_CAP),
        client.from('subscriptions').select('user_id,premium_until,amount,currency,created_at').limit(5000),
      ]);
      const users = profs || [], vs = views || [];
      const viewsCapped = vs.length >= VIEW_CAP;
      const now = Date.now();

      const inLast = (days, rows, key) => rows.filter((r) => now - new Date(r[key]).getTime() < days * 864e5).length;
      const premium = users.filter((u) => u.premium_until && new Date(u.premium_until) > new Date()).length;
      const payingIds = new Set((subs || []).filter((r) => r.premium_until && new Date(r.premium_until) > new Date()).map((r) => r.user_id));
      const paying = payingIds.size;
      const granted = Math.max(0, premium - paying);

      // ثبت‌نام‌ها در هفته
      const weeks = {};
      for (const u of users) {
        const d = new Date(u.created_at); d.setUTCDate(d.getUTCDate() - d.getUTCDay());
        weeks[d.toISOString().slice(0, 10)] = (weeks[d.toISOString().slice(0, 10)] || 0) + 1;
      }
      const wk = Object.entries(weeks).sort();
      const wkMax = Math.max(1, ...wk.map(([, n]) => n));

      // ارزهایی که مردم بیشتر باز می‌کنند
      const coins = {};
      for (const v of vs) {
        const m = /#\/coin\/([A-Z0-9]+)/i.exec(v.path || '');
        if (m) coins[m[1].toUpperCase()] = (coins[m[1].toUpperCase()] || 0) + 1;
      }
      const topCoins = Object.entries(coins).sort((a, b) => b[1] - a[1]).slice(0, 12);

      // نشست‌هایی که در بیش از یک روز بازگشته‌اند
      const bySession = {};
      for (const v of vs) {
        if (!v.session_id) continue;
        (bySession[v.session_id] ||= new Set()).add(v.created_at.slice(0, 10));
      }
      const sessions = Object.values(bySession);
      const returning = sessions.filter((d) => d.size > 1).length;

      const refs = {};
      for (const v of vs) {
        if (!v.referrer) continue;
        try { const h = new URL(v.referrer).hostname.replace(/^www\./, ''); if (h && !h.includes('github.io')) refs[h] = (refs[h] || 0) + 1; } catch { /* نادیده گرفتن */ }
      }
      const topRefs = Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 8);

      panel.innerHTML = `
        <div class="admin-grid">
          <div class="card"><div class="stat"><span class="k">مجموع حساب‌ها</span><span class="v">${users.length}</span><span class="s fine">${inLast(7, users, 'created_at')} در ۷ روز گذشته</span></div></div>
          <div class="card"><div class="stat"><span class="k">پرداخت‌کنندگان فعلی</span><span class="v ${paying ? 'up' : ''}">${paying}</span><span class="s fine">${users.length ? ((paying / users.length) * 100).toFixed(1) : 0}% از حساب‌ها${granted ? ` · ${granted} مورد هدیه داده شده` : ''}</span></div></div>
          <div class="card"><div class="stat"><span class="k">ایمیل‌های تایید شده</span><span class="v">${users.filter((u) => u.email_verified).length}</span></div></div>
          <div class="card"><div class="stat"><span class="k">تلگرام متصل شده</span><span class="v">${users.filter((u) => u.telegram_chat_id).length}</span></div></div>
          <div class="card"><div class="stat"><span class="k">نشست‌ها · ۹۰ روز گذشته</span><span class="v">${viewsCapped ? '≥' : ''}${compact(sessions.length, '')}</span><span class="s fine">${viewsCapped ? 'حداقل ' : ''}${compact(vs.length, '')} بازدید صفحه${viewsCapped ? ` — خواندن اطلاعات در ${compact(VIEW_CAP, '')} سطر متوقف شد` : ''}</span></div></div>
          <div class="card"><div class="stat"><span class="k">بازدید مجدد در روزهای دیگر</span><span class="v">${sessions.length ? ((returning / sessions.length) * 100).toFixed(0) : 0}%</span><span class="s fine">${returning} از ${sessions.length}</span></div></div>
        </div>

        <div class="grid g2 mt">
          <div class="card"><h3>ثبت‌نام‌ها در هر هفته</h3>
            ${wk.length ? `<div class="bars mt">${wk.map(([w, n]) => `<i style="height:${(n / wkMax) * 100}%" title="${esc(w)}: ${n}"></i>`).join('')}</div><p class="fine mt">${esc(wk[0][0])} ← ${esc(wk[wk.length - 1][0])}</p>` : '<p class="muted">هنوز ثبت‌نامی انجام نشده است.</p>'}
          </div>
          <div class="card"><h3>ارزهای پربازدید</h3>
            ${topCoins.length ? `<dl class="kv mt">${topCoins.map(([c, n]) => `<dt><a href="#/coin/${esc(c)}">${esc(c)}</a></dt><dd>${n}</dd>`).join('')}</dl>` : '<p class="muted">هنوز صفحه ارزی باز نشده است.</p>'}
          </div>
        </div>

        <div class="card mt"><h3>منبع ورودی بازدیدکنندگان</h3>
          ${topRefs.length ? `<dl class="kv mt">${topRefs.map(([h, n]) => `<dt>${esc(h)}</dt><dd>${n}</dd>`).join('')}</dl>` : '<p class="fine">هنوز ارجاع‌دهنده خارجی ثبت نشده است — بیشتر بازدیدها مستقیم هستند یا منبع مخفی است.</p>'}
          <p class="fine mt">بازدیدهای صفحه هیچ آدرس IP و هویتی را ذخیره نمی‌کنند: فقط مسیر صفحه، نوع کلی دستگاه و یک شناسه تصادفی که با بسته شدن زبانه مرورگر حذف می‌شود. سوابق قدیمی‌تر از ۳۰ روز هر شب پاک می‌شوند.</p>
        </div>`;
    },

    // ------------------------------------------------------------ کاربران
    async users() {
      panel.innerHTML = `
        <div class="card">
          <div class="card-h"><h3>کاربران</h3><div class="row" style="gap:8px"><input class="inp" id="q" placeholder="جستجوی ایمیل…" style="max-width:220px"><button class="btn sm" id="grant">${icon('star', 14)} اعطای اشتراک ویژه</button></div></div>
          <div id="ulist">${skeleton(6, 22)}</div>
        </div>`;
      let seq = 0;
      const load = async (q = '') => {
        const mine = ++seq;
        let users;
        try {
          ({ users } = await call('users', { q }));
        } catch (err) {
          if (mine === seq) $('#ulist', el).innerHTML = `<div class="empty"><p>بارگیری کاربران امکان‌پذیر نیست: ${esc(err.message)}</p></div>`;
          return;
        }
        if (mine !== seq) return;
        $('#ulist', el).innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">ایمیل</th><th class="l">نام</th><th>تاریخ عضویت</th><th>اشتراک ویژه تا</th><th>تلگرام</th><th>مدیر</th><th></th></tr></thead><tbody>
          ${users.map((u) => `<tr>
            <td class="l">${esc(u.email)}${u.email_verified ? ' <span class="chip up" style="font-size:11px">✓</span>' : ''}</td>
            <td class="l">${esc(u.display_name || '')}</td>
            <td class="fine">${dateTime(new Date(u.created_at).getTime(), false)}</td>
            <td>${u.premium_until ? dateTime(new Date(u.premium_until).getTime(), false) : '—'}</td>
            <td>${u.telegram_chat_id ? '✓' : '—'}</td>
            <td>${u.is_admin ? '<span class="chip warn">مدیر</span>' : '—'}</td>
            <td><button class="btn sm ghost" data-u="${esc(u.email)}">مدیریت</button></td></tr>`).join('')}
        </tbody></table></div>`;
        $$('[data-u]', el).forEach((b) => b.addEventListener('click', () => manage(b.dataset.u, users.find((x) => x.email === b.dataset.u))));
      };
      const manage = (email, u) => {
        const m = modal(`<h3>${esc(email)}</h3>
          <div class="stack mt" style="gap:10px">
            <div class="row" style="gap:8px"><input class="inp" id="days" type="number" value="30" min="1" aria-label="تعداد روزهای اشتراک ویژه" style="max-width:90px"><button class="btn sm" id="gp">افزودن روزهای ویژه</button><button class="btn sm ghost" id="rp">لغو اشتراک ویژه</button></div>
            <div class="row" style="gap:8px"><input class="inp" id="pw" type="password" placeholder="رمز عبور جدید (۸+ کاراکتر)" style="max-width:200px"><button class="btn sm" id="sp">تنظیم رمز عبور</button></div>
            <label class="row" style="gap:8px"><input type="checkbox" id="ad" ${u?.is_admin ? 'checked' : ''}> مدیر سایت</label>
            <p class="fine" id="msg"></p>
          </div>`);
        const say = (t2, ok = true) => { $('#msg', m.el).textContent = t2; $('#msg', m.el).className = `fine ${ok ? 'up' : 'down'}`; };
        const wrap = (fn) => async () => { try { await fn(); say('انجام شد.'); await load($('#q', el).value.trim()); } catch (e) { say(e.message, false); } };
        $('#gp', m.el).addEventListener('click', wrap(() => call('grant-premium', { email, days: +$('#days', m.el).value })));
        $('#rp', m.el).addEventListener('click', wrap(() => call('revoke-premium', { email })));
        $('#sp', m.el).addEventListener('click', wrap(() => call('set-password', { email, password: $('#pw', m.el).value })));
        $('#ad', m.el).addEventListener('change', async (ev) => {
          const box = ev.currentTarget;
          const want = box.checked;
          if (want && !window.confirm(`آیا ${email} به عنوان مدیر سایت تعیین شود؟\n\nآن‌ها قادر خواهند بود تمام کاربران را مشاهده کنند، اشتراک ویژه اعطا نمایند، رمز عبور تنظیم کنند و کلیدهای API را تغییر دهند.`)) {
            box.checked = false;
            return;
          }
          try {
            await call('set-admin', { email, value: want });
            say(want ? 'اکنون مدیر است.' : 'دسترسی مدیریت حذف شد.');
            await load($('#q', el).value.trim());
          } catch (e) {
            box.checked = !want;
            say(e.message, false);
          }
        });
      };
      let qTimer = null;
      $('#q', el).addEventListener('input', (e) => {
        const v = e.target.value.trim();
        clearTimeout(qTimer);
        qTimer = setTimeout(() => load(v), 250);
      });
      $('#grant', el).addEventListener('click', () => {
        const m = modal(`<h3>اعطای اشتراک ویژه</h3><div class="stack mt" style="gap:10px">
          <label class="fld">ایمیل کاربر<input class="inp" id="ge"></label>
          <label class="fld">تعداد روزها<input class="inp" id="gd" type="number" value="30" min="1"></label>
          <label class="fld">یادداشت<input class="inp" id="gn" placeholder="کارت به کارت، مرجع و…"></label>
          <button class="btn primary" id="go">اعطا</button><p class="fine" id="gm"></p></div>`);
        $('#go', m.el).addEventListener('click', async () => {
          try {
            const r = await call('grant-premium', { email: $('#ge', m.el).value.trim(), days: +$('#gd', m.el).value, note: $('#gn', m.el).value });
            $('#gm', m.el).textContent = `اشتراک ویژه تا ${new Date(r.premium_until).toLocaleDateString('fa-IR')}`;
            load();
          } catch (e) { $('#gm', m.el).textContent = e.message; }
        });
      });
      load();
    },

    // ------------------------------------------------------------ محتوا
    async content() {
      const posts = await getPosts(60).catch(() => null);
      if (!posts) { panel.innerHTML = '<div class="card"><p class="down">بارگیری پست‌ها امکان‌پذیر نیست — سرور پاسخ نداد. برای تلاش مجدد این زبانه را دوباره باز کنید.</p></div>'; return; }
      panel.innerHTML = `
        <div class="card">
          <div class="card-h"><h3>پست‌ها و ایده‌های معاملاتی</h3><button class="btn sm" id="new">${icon('plus', 14)} پست جدید</button></div>
          ${posts.length ? `<div class="stack" style="gap:8px">${posts.map((p) => `
            <div class="row spread" style="padding:10px;border-radius:10px;background:var(--surface-2)">
              <div><b>${esc(p.title)}</b> <span class="chip">${esc(p.kind)}</span>${p.premium_only ? ' <span class="chip warn">ویژه</span>' : ''}<br><small class="fine">${esc(p.symbol || '')} ${esc(p.side || '')} · ${dateTime(new Date(p.created_at).getTime(), false)} · ${esc(p.status || 'open')}</small></div>
              <div class="row" style="gap:6px"><button class="btn sm ghost" data-ed="${p.id}">ویرایش</button><button class="icon-btn" style="width:32px;height:32px" data-rm="${p.id}">${icon('trash', 14)}</button></div>
            </div>`).join('')}</div>` : '<p class="muted">هنوز پستی وجود ندارد. ایده‌های معاملاتی که در اینجا منتشر می‌کنید در صفحه ویژه نمایش داده می‌شوند.</p>'}
        </div>`;
      const edit = (p = {}) => {
        const m = modal(`<h3>${p.id ? 'ویرایش پست' : 'پست جدید'}</h3>
          <form class="stack mt" style="gap:10px" id="pf">
            <label class="fld">عنوان<input class="inp" name="title" required value="${esc(p.title || '')}"></label>
            <div class="row" style="gap:8px">
              <label class="fld">نوع<select class="inp" name="kind"><option value="idea" ${p.kind === 'idea' ? 'selected' : ''}>ایده معاملاتی</option><option value="note" ${p.kind === 'note' ? 'selected' : ''}>یادداشت</option><option value="update" ${p.kind === 'update' ? 'selected' : ''}>به‌روزرسانی سایت</option></select></label>
              <label class="fld">ارز<input class="inp" name="symbol" value="${esc(p.symbol || '')}" style="max-width:90px"></label>
              <label class="fld">جهت<select class="inp" name="side"><option value="">—</option><option value="long" ${p.side === 'long' ? 'selected' : ''}>خرید (Long)</option><option value="short" ${p.side === 'short' ? 'selected' : ''}>فروش (Short)</option></select></label>
            </div>
            <label class="fld">متن اصلی<textarea class="inp" name="body" rows="5">${esc(p.body || '')}</textarea></label>
            <div class="row" style="gap:8px">
              <label class="fld">نقطه ورود<input class="inp" name="entry" type="number" step="any" value="${p.entry ?? ''}"></label>
              <label class="fld">حد ضرر<input class="inp" name="stop_loss" type="number" step="any" value="${p.stop_loss ?? ''}"></label>
              <label class="fld">اهداف (با کاما جدا شود)<input class="inp" name="targets" value="${esc((p.targets || []).join(','))}"></label>
            </div>
            <div class="row" style="gap:14px">
              <label class="row" style="gap:6px"><input type="checkbox" name="premium_only" ${p.premium_only !== false ? 'checked' : ''}> فقط کاربران ویژه</label>
              <label class="fld">وضعیت<select class="inp" name="status"><option value="open" ${p.status === 'open' ? 'selected' : ''}>باز</option><option value="hit" ${p.status === 'hit' ? 'selected' : ''}>هدف لمس شد</option><option value="stopped" ${p.status === 'stopped' ? 'selected' : ''}>حد ضرر خورده</option><option value="closed" ${p.status === 'closed' ? 'selected' : ''}>بسته شده</option></select></label>
            </div>
            <button class="btn primary">ذخیره پست</button><p class="fine" id="pm"></p>
          </form>`);
        $('#pf', m.el).addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = e.target;
          const num = (v) => (v === '' ? null : Number(v));
          try {
            await savePost({
              ...(p.id ? { id: p.id } : { author: auth.user.id }),
              title: f.title.value.trim(), kind: f.kind.value, body: f.body.value,
              symbol: f.symbol.value.trim().toUpperCase() || null, side: f.side.value || null,
              entry: num(f.entry.value), stop_loss: num(f.stop_loss.value),
              targets: f.targets.value.split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)),
              premium_only: f.premium_only.checked, status: f.status.value,
            });
            m.close(); toast('پست ذخیره شد.', 'up'); TABS.content();
          } catch (e2) { $('#pm', m.el).textContent = e2.message; }
        });
      };
      $('#new', el).addEventListener('click', () => edit());
      $$('[data-ed]', el).forEach((b) => b.addEventListener('click', () => edit(posts.find((p) => String(p.id) === b.dataset.ed))));
      $$('[data-rm]', el).forEach((b) => b.addEventListener('click', async () => {
        if (!window.confirm('آیا این پست به طور دائم حذف شود؟ این عمل غیرقابل بازگشت است.')) return;
        try { await deletePost(+b.dataset.rm); toast('حذف شد.', 'info'); TABS.content(); }
        catch (e) { toast(e.message, 'down'); }
      }));
    },

    // ------------------------------------------------------------ تنظیمات
    async settings() {
      panel.innerHTML = skeleton(6, 24);
      let data = null;
      try {
        const client = await sb();
        ({ data } = await client.from('app_settings').select('key,value'));
      } catch (err) {
        panel.innerHTML = `<div class="card empty"><p>بارگیری تنظیمات امکان‌پذیر نیست: ${esc(err.message)}</p></div>`;
        return;
      }
      const cur = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
      const pr = cur.premium || {}, site = cur.site || {};
      panel.innerHTML = `
        <div class="grid g2">
          <div class="card"><h3>طرح اشتراک ویژه</h3>
            <form class="stack mt" style="gap:10px" id="pf">
              <div class="row" style="gap:8px">
                <label class="fld">قیمت<input class="inp" name="price" type="number" step="any" value="${pr.price ?? 19}" style="max-width:110px"></label>
                <label class="fld">واحد پول<select class="inp" name="currency" style="max-width:110px">${CONFIG.CURRENCIES.map(([c]) => `<option value="${esc(c)}" ${(pr.currency || 'USD') === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
                <label class="fld">تعداد روز<input class="inp" name="period_days" type="number" value="${pr.period_days ?? 30}" style="max-width:90px"></label>
              </div>
              <label class="row" style="gap:8px"><input type="checkbox" name="stripe_enabled" ${pr.stripe_enabled ? 'checked' : ''}> پرداخت با کارت از طریق Stripe (نیاز به کلیدهای Stripe در ادامه)</label>
              <label class="fld">دستورالعمل پرداخت دستی (هنگام غیرفعال بودن Stripe نمایش داده می‌شود)<textarea class="inp" name="manual_payment_text" rows="3">${esc(pr.manual_payment_text || '')}</textarea></label>
              <label class="fld">مزایای اضافی، هر کدام در یک خط<textarea class="inp" name="perks" rows="3">${esc((pr.perks || []).join('\n'))}</textarea></label>
              <button class="btn primary">ذخیره طرح</button>
            </form>
          </div>
          <div class="card"><h3>سایت</h3>
            <form class="stack mt" style="gap:10px" id="sf">
              <label class="fld">آدرس عمومی سایت (استفاده شده در ایمیل‌ها و تسویه حساب)<input class="inp" name="url" value="${esc(site.url || '')}" placeholder="https://you.github.io/coinvantage/"></label>
              <label class="fld">اطلاعات تماس نمایش داده شده در صفحات قانونی<input class="inp" name="contact" value="${esc(site.contact || '')}" placeholder="support@example.com"></label>
              <label class="fld">بنر اطلاعیه (برای مخفی کردن خالی بگذارید)<input class="inp" name="announcement" value="${esc(site.announcement || '')}"></label>
              <button class="btn primary">ذخیره تنظیمات سایت</button>
            </form>
          </div>
        </div>`;
      $('#pf', el).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          await call('save-setting', { key: 'premium', value: {
            price: Number(f.price.value), currency: f.currency.value, period_days: Number(f.period_days.value),
            stripe_enabled: f.stripe_enabled.checked, manual_payment_text: f.manual_payment_text.value,
            perks: f.perks.value.split('\n').map((x) => x.trim()).filter(Boolean),
          } });
          toast('طرح ذخیره شد.', 'up');
        } catch (e2) { toast(e2.message, 'down'); }
      });
      $('#sf', el).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          await call('save-setting', { key: 'site', value: { url: f.url.value.trim(), contact: f.contact.value.trim(), announcement: f.announcement.value.trim() || null } });
          toast('تنظیمات سایت ذخیره شد.', 'up');
        } catch (e2) { toast(e2.message, 'down'); }
      });
    },

    // ------------------------------------------------------------ کلیدها
    async keys() {
      panel.innerHTML = skeleton(6, 24);
      let s;
      try { s = await call('secrets-status'); }
      catch (err) { panel.innerHTML = `<div class="card empty"><p>خواندن وضعیت کلیدها امکان‌پذیر نیست: ${esc(err.message)}</p></div>`; return; }
      const NAMES = {
        telegram_bot_token: ['توکن ربات تلگرام', 'یک ربات با @BotFather بسازید و توکن آن را اینجا قرار دهید. ذخیره آن به طور خودکار وبهوک را ثبت می‌کند.'],
        resend_api_key: ['کلید API سرویس Resend', 'فعال‌سازی ایمیل: کدهای تایید، بازیابی رمز عبور و هشدارهای ایمیلی. resend.com، نسخه رایگان برای شروع کافی است.'],
        resend_from: ['آدرس فرستنده ایمیل (From)', 'باید دامنه‌ای باشد که در Resend تایید کرده‌اید، مثلاً alerts@yourdomain.com'],
        stripe_secret_key: ['کلید مخفی Stripe', 'فقط در صورتی که خواستار پرداخت با کارت برای اشتراک ویژه هستید لازم است.'],
        stripe_webhook_secret: ['کلید مخفی وبهوک Stripe', `یک وبهوک به آدرس ${esc(s.webhookUrl)} ایجاد کرده و کلید امضای آن را اینجا وارد کنید.`],
      };
      panel.innerHTML = `
        <div class="card"><h3>کلیدهای API</h3>
          <p class="fine">کلیدها به صورت رمزنگاری شده در Supabase Vault ذخیره می‌شوند و فقط توسط سرور قابل خواندن هستند. آن‌ها هرگز به مرورگرها ارسال نمی‌شوند — این صفحه فقط وضعیت تنظیم بودن یا نبودن آن‌ها را نشان می‌دهد.</p>
          <div class="stack mt" style="gap:14px">
            ${Object.entries(NAMES).map(([k, [label, help]]) => `
              <div>
                <div class="row spread"><b>${esc(label)}</b><span class="chip ${s.status[k] ? 'up' : ''}">${s.status[k] ? 'تنظیم شده' : 'تنظیم نشده'}</span></div>
                <p class="fine">${help}</p>
                <div class="row" style="gap:8px"><input class="inp" data-k="${k}" type="password" placeholder="مقدار را اینجا قرار دهید" style="flex:1"><button class="btn sm" data-save="${k}">ذخیره</button></div>
              </div>`).join('')}
          </div>
          ${s.telegramBot ? `<p class="fine mt up">ربات تلگرام متصل شد: @${esc(s.telegramBot)}</p>` : ''}
        </div>`;
      $$('[data-save]', el).forEach((b) => b.addEventListener('click', async () => {
        const name = b.dataset.save;
        const inp = $(`[data-k="${name}"]`, el);
        b.disabled = true; b.textContent = 'در حال ذخیره…';
        try { await call('set-secret', { name, value: inp.value }); toast('ذخیره شد.', 'up'); inp.value = ''; TABS.keys(); }
        catch (e) { toast(e.message, 'down'); b.disabled = false; b.textContent = 'ذخیره'; }
      }));
    },

    // ------------------------------------------------------------ وظایف
    async jobs() {
      panel.innerHTML = `
        <div class="card"><h3>وظایف پس‌زمینه</h3>
          <p class="fine">این موارد به صورت خودکار طبق برنامه اجرا می‌شوند. از دکمه‌ها برای اجرای دستی استفاده کنید — این کار بلافاصله پس از تغییر کلیدها مفید است.</p>
          <div class="stack mt" style="gap:10px">
            ${[['alerts', 'بررسی هشدارهای قیمت', 'هر دقیقه'], ['signals', 'ثبت و امتیازدهی به سیگنال‌ها', 'هر ۱۵ دقیقه'], ['news', 'دریافت فیدهای اخبار', 'هر ۲۰ دقیقه']].map(([j, label, when]) => `
              <div class="row spread" style="padding:10px;border-radius:10px;background:var(--surface-2)">
                <div><b>${esc(label)}</b><br><small class="fine">زمان‌بندی: ${esc(when)}</small></div>
                <button class="btn sm" data-job="${j}">اجرای فوری</button>
              </div>`).join('')}
          </div>
          <pre class="fine mt" id="out" style="white-space:pre-wrap;max-height:260px;overflow:auto"></pre>
        </div>`;
      $$('[data-job]', el).forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true; const old = b.textContent; b.textContent = 'در حال اجرا…';
        try { const r = await call('run-job', { job: b.dataset.job }); $('#out', el).textContent = JSON.stringify(r.result, null, 2); }
        catch (e) { $('#out', el).textContent = e.message; }
        b.disabled = false; b.textContent = old;
      }));
    },
  };

  bindTabs($('#tabs', el), (t) => TABS[t]().catch((e) => { panel.innerHTML = `<div class="card empty"><p>${esc(e.message)}</p></div>`; }));
  TABS.stats().catch((e) => { panel.innerHTML = `<div class="card empty"><p>${esc(e.message)}</p></div>`; });
}