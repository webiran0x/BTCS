// یادگیری هوش مصنوعی: نحوه امتیازدهی هوش مصنوعی به فراخوان‌های خود و تغییر تصمیماتش.
import { $, $$, icon, toast, bindSeg } from '../ui.js';
import { esc, dateTime, ago, horizonText } from '../format.js';
import { load } from '../store.js';
import { INDICATORS, LEARN_TESTED, SWITCH_MIN, SWITCH_GAP, liveScores } from '../lib/learncenter.js';
import { learningPass, loadLearn } from '../lib/learnpass.js';
import { cloudLearning } from '../lib/cloudlearn.js';
import { remove } from '../store.js';
import { DEFAULT_CONFIG, CHART_TESTED, rulesForChart } from '../lib/autotrader.js';
import { DEFAULT_HORIZON } from '../ai/context.js';
import { activeLessons, reviewTrades } from '../lib/tradelearn.js';
import { TESTED_ACCURACY, recheckOverall } from '../lib/predict.js';
import { FORECAST_TESTED } from '../lib/forecastview.js';
import { learningStatus, loadLedger, learnedTrust, MIN_GRADED_FOR_TRUST, TREND_WORDS } from '../lib/selfimprove.js';
import { LEARN_GUIDE } from '../lib/learnguide.js';

export const title = 'AI learning';

export async function render(el) {
  const st = { interval: '1h', running: false, disposed: false, last: null, cloud: null };
  const CHARTS = ['1m', '5m', '15m', '1h', '4h', '1d'];
  
  el.innerHTML = `
    <!-- استایل‌های اختصاصی مدرن اپل ۲۰۲۶ -->
    <style>
      .ap-learn-wrap {
        direction: rtl;
        text-align: right;
        max-width: 1280px;
        margin: 0 auto;
        padding-bottom: 48px;
      }
      .ap-learn-hero {
        position: relative;
        padding: 36px 32px;
        background: radial-gradient(circle at top right, rgba(94, 92, 230, 0.08), transparent 45%),
                    radial-gradient(circle at bottom left, rgba(50, 215, 75, 0.06), transparent 45%),
                    rgba(24, 24, 29, 0.72);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 28px;
        backdrop-filter: blur(28px);
        -webkit-backdrop-filter: blur(28px);
        margin-bottom: 24px;
        box-shadow: 0 24px 54px rgba(0, 0, 0, 0.35);
      }
      .ap-learn-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 20px;
      }
      .ap-learn-hero h1 {
        font-size: 2.35rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #fff;
        margin: 0 0 10px 0;
        background: linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.78) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .ap-learn-sub {
        font-size: 1rem;
        line-height: 1.65;
        color: rgba(255, 255, 255, 0.72);
        max-width: 780px;
        margin: 0;
      }
      .ap-learn-toolbar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        background: rgba(255, 255, 255, 0.04);
        padding: 8px 12px;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.07);
      }
      .ap-learn-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.075);
        border-radius: 22px;
        padding: 24px;
        backdrop-filter: blur(22px);
        -webkit-backdrop-filter: blur(22px);
        transition: border-color 0.25s ease, box-shadow 0.25s ease;
      }
      .ap-learn-card:hover {
        border-color: rgba(255, 255, 255, 0.14);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
      }
      .ap-learn-card .card-h h3 {
        font-size: 1.12rem;
        font-weight: 600;
        color: #fff;
        margin: 0;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .ap-learn-guide {
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 20px;
        padding: 18px 24px;
        margin-bottom: 20px;
      }
      .ap-learn-guide summary {
        cursor: pointer;
        font-size: 0.95rem;
        font-weight: 500;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        list-style: none;
      }
      .ap-learn-guide summary::-webkit-details-marker { display: none; }
      .ap-learn-wrap .btn {
        border-radius: 13px;
        font-weight: 500;
        transition: all 0.2s ease;
      }
      .ap-learn-wrap .btn.primary {
        background: linear-gradient(135deg, #5e5ce6 0%, #3634a3 100%);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #fff;
        box-shadow: 0 6px 18px rgba(94, 92, 230, 0.3);
      }
      .ap-learn-wrap .btn.primary:hover {
        filter: brightness(1.08);
        transform: translateY(-1px);
      }
      .ap-learn-wrap .tbl-wrap {
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        overflow-x: auto;
      }
      .ap-learn-wrap .tbl th {
        background: rgba(255, 255, 255, 0.03);
        font-weight: 600;
        color: rgba(255, 255, 255, 0.65);
        padding: 12px 14px;
      }
      .ap-learn-wrap .tbl td {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.045);
      }
      .ap-learn-wrap .tbl tr:last-child td { border-bottom: 0; }
      .ap-learn-wrap .chip {
        border-radius: 999px;
        padding: 4px 11px;
        font-weight: 500;
      }
    </style>

    <div class="ap-learn-wrap" dir="rtl">
      <header class="ap-learn-hero">
        <div class="ap-learn-top">
          <div>
            <h1>یادگیری هوش مصنوعی</h1>
            <p class="ap-learn-sub">نحوه امتیازدهی هوش مصنوعی به پیش‌بینی‌های خود و تغییر تصمیماتش. هر اندیکاتور، پیش‌بینی و معامله‌گر در مقایسه با آنچه بازار عملاً انجام داده است، ارزیابی می‌شوند. یک روش تنها زمانی نفوذ به دست می‌آورد که سابقه آن چنین حقی را کسب کند و تنها تا زمانی که پیشتاز بماند آن را حفظ می‌کند. هر عدد در اینجا اندازه‌گیری شده است و هر کدام نشان می‌دهد که بر روی چه تعداد پیش‌بینی بنا شده است. هیچ‌کدام از این موارد هنوز نتوانسته است در تست‌ها، پیش‌بینی جهت قیمت را بهتر از شانس انجام دهد: ترکیب یادگرفته‌شده در تست انتشار با پیش‌بینی مساوی شد، و خودارزیابی معامله‌گر تنها یک قانون را در هشت بار اجرای تست تغییر داد.</p>
          </div>
          <div class="ap-learn-toolbar">
            <div class="seg" id="iv">${CHARTS.map((i) => `<button data-v="${i}" class="${i === st.interval ? 'on' : ''}">${i}</button>`).join('')}</div>
            <button class="btn primary" id="pass">${icon('refresh', 16)} به‌روزرسانی</button>
          </div>
        </div>
      </header>

      <details class="ap-learn-card ap-learn-guide" id="guide">
        <summary><span><b>نحوه کارکرد تست‌ها به زبان ساده</b><small class="fine" style="margin-right:8px">حلقه یادگیری، تست‌های گام‌به‌گام (Walk-forward)، معیارهای سندیت، و موارد اندازه‌گیری‌نشده</small></span>${icon('info', 16)}</summary>
        <div class="seo-intro mt" style="line-height:1.7">${LEARN_GUIDE.map((x, i) => `<section aria-labelledby="lg-${i}"><h3 id="lg-${i}" style="margin:16px 0 8px 0; color:#fff; font-size:1.05rem">${esc(x.h2)}</h3>${(x.paras || []).map((t) => `<p>${esc(t)}</p>`).join('')}${x.steps ? `<ol class="steps" style="padding-right:20px">${x.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}${x.list ? `<ul class="steps" style="padding-right:20px">${x.list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</section>`).join('')}
          <p class="fine mt">جنبه آموزشی دارد، نه مشاوره مالی. هر رقم در این صفحه دوره اندازه‌گیری‌شدن خود را توصیف می‌کند.</p></div>
      </details>

      <p class="fine mb" id="status" role="status" aria-live="polite" style="margin-bottom:16px; padding:0 4px;"></p>
      <div id="body"></div>
    </div>`;

  const soon = (at) => { const m = Math.max(1, Math.round((at - Date.now()) / 60e3)); return m < 90 ? `${m} دقیقه` : `${Math.round(m / 60)} ساعت`; };
  
  const pctTxt = (s, waiting = { n: 0, next: null }) => {
    if (s && s.rate !== null) return `<b>${s.rate}%</b> <span class="fine">(${s.hits}/${s.n} · بازه ۹۵٪: ${s.lo}–${s.hi}٪)</span>`;
    if (!waiting.n) return '<span class="muted">هنوز فراخوانی ثبت نشده است</span>';
    const next = waiting.next;
    return `<span class="muted">هنوز نتیجه‌ای ثبت نشده · ${waiting.n} مورد در انتظار${Number.isFinite(next) ? ` · نخستین نتیجه ${next > Date.now() ? `حدود ${soon(next)} دیگر` : 'در بررسی بعدی'}` : ''}</span>`;
  };

  const waitingOf = (rows, key) => {
    const w = rows.filter((r) => !r.resolved && Number.isFinite(r[key]));
    return { n: w.length, next: w.length ? Math.min(...w.map((r) => r.horizonAt || Infinity)) : null };
  };

  const chip = (s) => {
    if (!s || !s.n) return '<span class="chip">بدون داده</span>';
    if (s.weight > 0) return '<span class="chip up">دارای حق رأی</span>';
    if (s.weight < 0) return '<span class="chip warn">خوانش معکوس</span>';
    return `<span class="chip">${esc(s.verdict)}</span>`;
  };

  function draw() {
    const C = st.cloud?.[st.interval] || null;
    const L = C ? null : loadLearn();
    const live = C ? C.live : liveScores(L, st.interval);
    const liveCall = C ? C.live : liveScores(L);
    const hist = C ? C.history : L.history?.[st.interval]?.table || null;
    const weights = (C ? C.weights : L.weights?.[st.interval]) || {};
    const champion = (C ? C.champion : L.champion) || 'forecast';
    const waitF = C ? { n: C.waiting.forecast, next: C.waiting.nextAt } : waitingOf(L.rows, 'forecastProb');
    const waitB = C ? { n: C.waiting.blend, next: C.waiting.nextAt } : waitingOf(L.rows, 'blendProb');
    const where = C ? `سابقه ابری در ${esc(st.interval)}` : 'این مرورگر';
    
    const saved = load('traderCfg', {}) || {};
    const lessons = load('traderLessons', []) || [];
    const traderIv = load('traderState', null)?.interval || saved.interval || DEFAULT_CONFIG.interval;
    const cfg = rulesForChart({ ...DEFAULT_CONFIG, ...Object.fromEntries(Object.entries(saved).filter(([k]) => ['universe', 'minAdx', 'maxEntryRsi', 'excluded', 'strategy', 'custom'].includes(k))) }, traderIv, lessons);
    const ledger = loadLedger();
    const fl = learningStatus(ledger);
    const tested = LEARN_TESTED.byInterval[st.interval];
    const changes = [
      ...((C ? Object.values(st.cloud).flatMap((x) => x.changes || []) : L.changes) || []).map((c) => ({ at: c.at, text: c.text, tag: c.kind === 'champion' ? `سازنده سیگنال · ${c.interval}` : `اندیکاتورها · ${c.interval}` })),
      ...lessons.map((l) => ({ at: l.at, text: l.text, tag: 'معامله‌گر' })),
    ].sort((a, b) => b.at - a.at).slice(0, 25);
    
    const closedOf = (key) => (load(key, null)?.closed || []);
    const accounts = [
      { name: 'معاملات هوش مصنوعی', r: reviewTrades(closedOf('traderState')) },
      { name: 'خریدهای آزمایشی شما', r: reviewTrades(closedOf('myDemoState'), { includeManual: true }) },
      { name: 'معاملات واقعی شما', r: reviewTrades(closedOf('realTradeState'), { includeManual: true }) },
    ];
    const voting = Object.entries(weights).filter(([, w]) => w).map(([k, w]) => `${INDICATORS[k].name} (${w > 0 ? '+' : ''}${w})`);

    $('#status', el).textContent = C
      ? `یادگیری ابری به صورت شبانه‌روز و با بسته بودن تمام مرورگرها: ${C.coins} ارز، هر تایم‌فریم به نوبت. در ${st.interval}: آخرین بررسی در ${ago(C.lastPass)} · ${C.calls.toLocaleString('en-US')} فراخوان ثبت‌شده · ${C.scored.toLocaleString('en-US')} امتیازدهی‌شده${C.expired ? ` · ${C.expired} مورد غیرقابل ارزیابی (کندل خارج از دسترس)` : ''}. سابقه یکسان روی تمام دستگاه‌ها.`
      : st.cloud === false
        ? (L.lastPass ? `سابقه ابری قابل خواندن نبود، بنابراین این مرورگر هنگام باز بودن صفحه به یادگیری می‌پردازد. آخرین بررسی در ${ago(L.lastPass)} · ${L.rows.length} فراخوان ثبت‌شده · ${L.rows.filter((r) => r.resolved).length} امتیازدهی‌شده.` : 'سابقه ابری قابل خواندن نبود، بنابراین این مرورگر هنگام باز بودن صفحه به یادگیری می‌پردازد. برای شروع دکمه به‌روزرسانی را بزنید.')
        : st.cloud ? `ابر هنوز روی ${st.interval} یادگیری نداشته است: بررسی هر تایم‌فریم هر پنج دقیقه انجام می‌شود، بنابراین نخستین بررسی ظرف نیم ساعت انجام خواهد شد.` : 'در حال خواندن سابقه ابری…';

    $('#body', el).innerHTML = `
      <div class="grid g2">
        <div class="ap-learn-card">
          <div class="card-h"><h3>${icon('ai', 16)} چه کسی در حال حاضر تصمیم می‌گیرد</h3><span class="chip ${champion === 'blend' ? 'up' : ''}">${champion === 'blend' ? 'ترکیب یادگرفته‌شده' : 'موتور پیش‌بینی'}</span></div>
          <p class="fine" style="margin-top:0; line-height:1.65">دو روش با هم رقابت می‌کنند. <b>موتور پیش‌بینی</b> (هفت مدل) به طور پیش‌فرض تصمیم می‌گیرد. <b>ترکیب یادگرفته‌شده</b> اندیکاتورهایی را که حق رأی کسب کرده‌اند اضافه می‌کند. این ترکیب تنها پس از حداقل ${SWITCH_MIN} پیش‌بینی زنده امتیازدهی‌شده برای هرکدام، و تنها در صورتی که حداقل ${SWITCH_GAP} امتیاز جلوتر باشد و کل بازه ۹۵٪ آن بالاتر از نرخ پیش‌بینی قرار گیرد، هدایت را به دست می‌گیرد. به محض عقب افتادن، کنترل را پس می‌دهد.</p>
          <dl class="kv">
            <dt>پیش‌بینی، زنده</dt><dd>${pctTxt(liveCall.forecast, waitF)}</dd>
            <dt>ترکیب، زنده</dt><dd>${pctTxt(liveCall.blend, waitB)}</dd>
            <dt>تست انتشار</dt><dd>پیش‌بینی ${LEARN_TESTED.forecast}٪ · ترکیب ${LEARN_TESTED.blend}٪ <span class="fine">(${LEARN_TESTED.tests.toLocaleString()} پیش‌بینی${tested ? `; ${esc(st.interval)}: ${tested[0]}٪ در برابر ${tested[1]}٪` : ''})</span></dd>
          </dl>
          <p class="fine mt" style="line-height:1.65">${(() => { const by = Object.entries(LEARN_TESTED.byInterval); const better = by.filter(([, [f, b]]) => b > f).map(([k]) => k), worse = by.filter(([, [f, b]]) => b < f).map(([k]) => k); return `در آخرین تست (${LEARN_TESTED.tests.toLocaleString()} پیش‌بینی روی ${LEARN_TESTED.coins} ارز)، ترکیب ${LEARN_TESTED.blend}٪ در برابر ${LEARN_TESTED.forecast}٪ پیش‌بینی امتیاز کسب کرد${better.length ? `: عملکرد بهتر در ${better.join(', ')}` : ''}${worse.length ? `${better.length ? '، و ' : ': '}عملکرد ضعیف‌تر در ${worse.join(', ')}` : ''}. این دلیلی برای تغییر فوری نیست، بنابراین به عنوان رقیب شروع کرده و باید ابتدا خود را در ${where} ثابت کند.`; })()}${C?.reason ? ` ${esc(C.reason)}` : ''}</p>
        </div>

        <div class="ap-learn-card">
          <div class="card-h"><h3>${icon('forecast', 16)} سابقه پیش‌بینی</h3><span class="chip">${esc(TREND_WORDS[fl.trend] || fl.trend)}</span></div>
          <dl class="kv">
            ${(() => {
              const big = Object.values(FORECAST_TESTED.centred).filter((x) => x.coins >= 20);
              const c80 = big.map((x) => x.band80);
              const n80 = big.reduce((a, x) => a + x.tests, 0);
              const ro = recheckOverall();
              return `${ro ? `<dt>جهت، آخرین تست</dt><dd>${ro.hit}٪ <span class="fine">در برابر مبنای ${ro.baseline}٪ · ${ro.tests.toLocaleString('en-US')} تست روی ${ro.coins} ارز، ${esc(ro.measuredOn)}</span></dd>` : ''}
            <dt>جهت، تست انتشار</dt><dd>${TESTED_ACCURACY.all}٪ <span class="fine">در برابر مبنای ${TESTED_ACCURACY.allBaseline}٪ · ${TESTED_ACCURACY.tests.toLocaleString()} تست</span></dd>
            <dt>حفظ بازه ۸۰٪</dt><dd>${c80.length ? `${Math.min(...c80)}–${Math.max(...c80)}٪` : '—'} <span class="fine">(هدف ۸۰٪؛ بر اساس تایم‌فریم، متمرکز بر قیمت امروز، ${n80.toLocaleString('en-US')} تست روی ${(() => { const k = big.map((x) => x.coins); const lo = Math.min(...k), hi = Math.max(...k); return lo === hi ? hi : `${lo}–${hi}`; })()} ارز، ${esc(FORECAST_TESTED.centredMeasuredOn)}؛ ${TESTED_ACCURACY.bandsAll.band80}٪ در تست انتشار)</span></dd>`;
            })()}
            <dt>حفظ بازه ۹۰٪</dt><dd>${TESTED_ACCURACY.bandsAll.band90}٪ <span class="fine">(هدف ۹۰٪)</span></dd>
            <dt>سابقه شما (۵۰ مورد اخیر)</dt><dd>${fl.windows[50].pct === null ? '<span class="muted">تعداد ناکافی</span>' : `${fl.windows[50].pct}٪ <span class="fine">(${fl.windows[50].hits}/${fl.windows[50].total})</span>`}</dd>
          </dl>
          <h4 class="mt" style="margin:12px 0 6px 0; color:#fff; font-size:0.95rem">میزان اعتماد به جهت پیش‌بینی</h4>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">تایم‌فریم</th><th>تست انتشار</th><th>امتیازدهی‌شده برای شما</th><th>استفاده فعلی</th></tr></thead><tbody>
            ${['1m', '5m', '15m', '1h', '4h', '1d'].map((iv) => {
              const t = learnedTrust(ledger, iv);
              return `<tr><td class="l">${iv}</td><td>${t.prior.toFixed(2)}</td><td>${t.local === null ? `<span class="muted">${t.graded} از ${MIN_GRADED_FOR_TRUST}</span>` : `${t.local.toFixed(2)} <span class="fine">(${t.graded})</span>`}</td><td><b>${t.trust.toFixed(2)}</b></td></tr>`;
            }).join('')}
          </tbody></table></div>
          <p class="fine mt" style="line-height:1.6">احتمال صعود در هر تایم‌فریم معادل تمایل خام مدل‌هاست که در این عدد ضرب شده است: عدد ۱ آن را دست‌نخورده نگه می‌دارد، و صفر به این معناست که تمایل مذکور در تست‌ها هیچ اطلاعاتی به همراه نداشته است، بنابراین هیچ احتمالی نمایش داده نمی‌شود. به محض اینکه یک تایم‌فریم ${MIN_GRADED_FOR_TRUST} پیش‌بینی امتیازدهی‌شده از شما داشته باشد (هنگام ورود به حساب، سابقه با حساب شما ذخیره می‌شود تا هر دستگاهی به آن اضافه کند)، سابقه آن‌ها عدد را تنظیم می‌کند و با ${TESTED_ACCURACY.testsPerInterval} پیش‌بینی تست انتشار به ازای هر تایم‌فریم وزن‌دهی می‌شود. تایم‌ففرمی که تست انتشار چیزی در آن نیافته روی صفر باقی می‌ماند.</p>
          <p class="fine mt" style="line-height:1.6">موتور پیش‌بینی هر بار که اجرا می‌شود، تمام ۷ مدل را روی جدیدترین کندل‌های هر ارز مجدداً آموزش می‌دهد. به محض اینکه سابقه شما پیش‌بینی‌های امتیازدهی‌شده کافی داشته باشد، سابقه ضعیف اخیر به خودی خود اطمینان نمایش‌داده‌شده را به سمت ۵۰/۵۰ متمایل می‌کند.</p>
        </div>
      </div>

      <div class="ap-learn-card mt">
        <div class="card-h"><h3>${icon('chart', 16)} اندیکاتورها، امتیازدهی‌شده (${esc(st.interval)})</h3><span class="fine">${voting.length ? `در حال رأی‌دهی: ${esc(voting.join(', '))}` : 'هیچ اندیکاتوری در این تایم‌فریم حق رأی کسب نکرده است'}</span></div>
        <p class="fine" style="margin-top:0; line-height:1.65">خوانش هر اندیکاتور به یک پیش‌بینی تبدیل می‌شود (مثلاً RSI زیر ۳۰ به معنای «صعودی» است)، سپس ${esc(horizonText(st.interval, DEFAULT_HORIZON[st.interval] || 12))} بعد (همان افق زمانی که پیش‌بینی در تایم‌فریم‌های ${esc(st.interval)} استفاده می‌کند) با قیمت مقایسه می‌شود. <b>سابقه اخیر</b> روی ۵۰۰ کندل آخر ${C ? `از هر یک از ${C.coins} ارز، بار دیگر هر زمان که ابر بازمی‌گردد` : 'ارزهای معامله‌گر در هر بررسی'} اندازه‌گیری می‌شود. <b>زنده</b> فقط شامل مواردی است که ${C ? 'ابر' : 'این مرورگر'} پیش از مشخص شدن نتیجه ثبت کرده است. یک خوانش به ۳۰+ فراخوان و بازه ۹۵٪ دور از ۵۰٪ نیاز دارد تا حق رأی کسب کند. شواهد زنده با شکل‌گیری به مرور جایگزین سابقه می‌شوند.</p>
        ${hist ? `<div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">اندیکاتور</th><th class="l hide-p">قانون</th><th>سابقه اخیر</th><th>زنده</th><th class="hide-t">تست به تنهایی</th><th>وزن فعلی</th></tr></thead><tbody>
          ${Object.entries(INDICATORS).map(([k, d]) => `<tr><td class="l wrap"><b>${esc(d.name)}</b><small class="show-p-block">${esc(d.rule)}</small></td><td class="l fine wrap hide-p" style="min-width:140px">${esc(d.rule)}</td>
            <td>${hist[k] ? `${hist[k].rate ?? '—'}٪ <span class="fine">(${hist[k].n})</span>` : '—'}</td>
            <td>${live[k]?.n ? `${live[k].rate}٪ <span class="fine">(${live[k].n})</span>` : '<span class="muted">—</span>'}</td>
            <td class="fine hide-t">${LEARN_TESTED.indicatorsAlone[k] ?? '—'}٪</td>
            <td>${chip({ ...(hist[k] || {}), weight: weights[k] || 0, n: (hist[k]?.n || 0) + (live[k]?.n || 0) })}</td></tr>`).join('')}
        </tbody></table></div>` : `<p class="muted" style="margin:0">${C || st.cloud ? 'هنوز در این تایم‌فریم امتیازدهی نشده است: ابر هر تایم‌فریم را به نوبت بررسی می‌کند.' : 'برای امتیازدهی به اندیکاتورها در این تایم‌فریم، روی به‌روزرسانی بزنید.'}</p>`}
        <p class="fine mt" style="line-height:1.6">«تست به تنهایی» نرخ موفقیت هر اندیکاتور در ۱,۴۴۰ نقطه تست انتشار در تمامی تایم‌فریم‌هاست. هیچ‌کدام فاصله زیادی از ۵۰٪ ندارند، به همین دلیل صفحه در انتخاب موارد دارای حق رأی با احتیاط عمل می‌کند.</p>
      </div>

      <div class="ap-learn-card mt">
        <div class="card-h"><h3>${icon('chart', 16)} معاملات خرید، امتیازدهی‌شده</h3><span class="fine">آنچه پس از هر خرید رخ داد</span></div>
        <p class="fine" style="margin-top:0; line-height:1.65">هر معامله خرید بسته‌شده با رفتار بعدی بازار مقایسه می‌شود. خریدها بر اساس وضعیت نمودار در لحظه خرید دسته‌بندی می‌شوند (همسو یا خلاف روند، در حال نوسان یا رونددار، RSI افراطی یا غیره)، تا الگویی که مدام ضرر می‌دهد شناسایی شود. این مورد شامل معاملات شبیه‌سازی‌شده هوش مصنوعی، خریدهای آزمایشی شخصی شما و معاملات واقعی ثبت‌شده شما می‌شود. نتایج بر حسب R هستند: ۱R مقدار ریسک‌پذیرفته‌شده در یک معامله است.</p>
        <div class="tbl-wrap"><table class="tbl fit"><thead><tr><th class="l">حساب</th><th>خریدهای بسته‌شده</th><th class="hide-p">برد</th><th>میانگین</th><th class="l">نکات برجسته</th></tr></thead><tbody>
          ${accounts.map((a) => `<tr><td class="l wrap"><b>${esc(a.name)}</b></td><td>${a.r.overall.n}</td><td class="hide-p">${a.r.overall.winRate === null ? '—' : a.r.overall.winRate + '٪'}</td><td class="${a.r.overall.avgR > 0 ? 'up' : a.r.overall.avgR < 0 ? 'down' : ''}">${a.r.overall.avgR === null ? '—' : (a.r.overall.avgR > 0 ? '+' : '') + a.r.overall.avgR + 'R'}</td><td class="l fine wrap" style="min-width:110px">${esc(a.r.findings[0] || '—')}</td></tr>`).join('')}
        </tbody></table></div>
        ${accounts.flatMap((a) => a.r.findings.slice(1).map((f) => `<p class="fine" style="margin-top:8px">${esc(a.name)}: ${esc(f)}</p>`)).join('')}
      </div>

      <div class="ap-learn-card mt">
        <div class="card-h"><h3>${icon('bolt', 16)} معاملات</h3><a class="btn sm" href="#/trader">باز کردن صفحه معامله‌گر</a></div>
        <p class="fine" style="margin-top:0; line-height:1.65">معامله‌گر هوش مصنوعی پس از هر بررسی، گزارش معاملات خود را می‌خواند. زمانی که یک شرایط بازار مدام زیان‌ده باشد فیلتری را فعال می‌کند و اگر نتایج بدتر شوند آن را غیرفعال می‌سازد. قوانین این ربات روی کندل‌های قدیمی‌تر انتخاب شده و روی کندل‌های جدیدتری که هرگز ندیده بودند سه بار اجرا شدند: در ${esc(cfg.interval)} به طور میانگین ${CHART_TESTED[cfg.interval] ? (() => { const x = CHART_TESTED[cfg.interval], t = x.adopt ? x.own : x.standard; return `${t.ret}٪ به ازای هر ${x.block} در برابر ${x.hold}٪ برای نگهداری همان ارزها`; })() : 'نتیجه‌ای تست‌نشده'} سود داشتند.</p>
        <p class="fine" style="margin-bottom:0"><b>قوانین فعال:</b> ${esc((activeLessons(cfg).join(' · ')) || 'استراتژی اولیه')}.</p>
      </div>

      <div class="ap-learn-card mt">
        <div class="card-h"><h3>${icon('info', 16)} تغییرات هوش مصنوعی و زمان آن‌ها</h3><span class="fine">جدیدترین در ابتدا</span></div>
        ${changes.length ? `<ul class="fine" style="list-style:none;padding:0;margin:0">${changes.map((c) => `<li style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span class="muted" style="display:inline-block;min-width:155px">${dateTime(c.at)}</span><span class="chip" style="margin-left:8px">${esc(c.tag)}</span>${esc(c.text)}</li>`).join('')}</ul>`
          : '<p class="muted" style="margin:0">هنوز موردی وجود ندارد. تغییرات به محض اینکه شواهد کافی وجود داشته باشد در اینجا ظاهر می‌شوند.</p>'}
      </div>`;
  }

  async function pass({ force = false } = {}) {
    if (st.running) return;
    st.running = true;
    const b = $('#pass', el); const old = b.innerHTML; b.disabled = true;
    try {
      const cloud = await cloudLearning({ force });
      if (st.disposed) return;
      if (cloud) {
        st.cloud = cloud;
        remove('aiLearn');
        return;
      }
      st.cloud = false;
      const r = await learningPass(st.interval, { onStep: (s) => { if (!st.disposed) b.innerHTML = `<span class="spinner"></span> ${esc(s)}`; } });
      if (st.disposed) return;
      toast(r.changes.length ? `بررسی یادگیری انجام شد — ${r.changes.length} تغییر.` : 'بررسی یادگیری انجام شد — مدرک قانع‌کننده‌ای برای تغییر وجود ندارد.', r.changes.length ? 'up' : 'info');
    } catch { toast('بررسی یادگیری نتوانست داده‌های بازار را بارگذاری کند. لحظاتی دیگر دوباره تلاش کنید.', 'down'); }
    finally { st.running = false; if (!st.disposed) { b.disabled = false; b.innerHTML = old; draw(); } }
  }

  bindSeg($('#iv', el), (v) => { st.interval = v; draw(); if (st.cloud === false && !loadLearn().history?.[v]) pass(); });
  $('#pass', el).addEventListener('click', () => pass({ force: true }));
  draw();
  pass();
  const timer = setInterval(() => { if (!st.disposed && !document.hidden) pass(); }, 2 * 60e3);
  return () => { st.disposed = true; clearInterval(timer); };
}