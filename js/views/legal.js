// شرایط استفاده، سیاست حفظ حریم خصوصی و افشای ریسک — نسخه مدرن ۲۰۲۶ با رعایت سئو و لحن شفاف و دوستانه.
import { CONFIG } from '../config.js';
import { getAppSettings, cachedAppSettings } from '../api/backend.js';
import { esc } from '../format.js';
import { TESTED_ACCURACY, recheckOverall } from '../lib/predict.js';
import { TESTED_TIMING, timingSwing } from '../lib/timing.js';
import { SCORE_BUCKETS_TESTED } from '../lib/signals.js';

const IVS = ['1m', '5m', '15m', '1h', '4h', '1d'];
const accuracyLine = () => IVS
  .filter((iv) => typeof TESTED_ACCURACY[iv] === 'number')
  .map((iv) => `${iv} معادل ${TESTED_ACCURACY[iv]}٪ در مقایسه با مبنای ${TESTED_ACCURACY.baseline[iv]}٪`)
  .join('، ');
const recheckLine = () => IVS
  .filter((iv) => TESTED_ACCURACY.recheck?.[iv])
  .map((iv) => `${iv} معادل ${TESTED_ACCURACY.recheck[iv].hit.toFixed(1)}٪ در مقایسه با ${TESTED_ACCURACY.recheck[iv].baseline.toFixed(1)}٪`)
  .join('، ');
const timingLine = () => Object.entries(TESTED_TIMING.byInterval)
  .map(([iv, t]) => `${iv} معادل ${t.hitPct.toFixed(1)}٪ در مقایسه با ${t.baselinePct.toFixed(1)}٪`)
  .join('، ');

const timingSwingRange = () => {
  const s = Object.keys(TESTED_TIMING.byInterval).map(timingSwing).filter((v) => v !== null);
  return s.length ? `${Math.min(...s).toFixed(1)} تا ${Math.max(...s).toFixed(1)}` : null;
};

const N = CONFIG.APP_NAME;

const META = {
  terms: {
    tab: 'شرایط خدمات',
    title: `شرایط خدمات — ${N}`,
    description: `شرایط شفاف و دوستانه استفاده از ${N}: ماهیت تحلیلی ابزار، عدم ارائه مشاوره مالی، حساب‌های کاربری، اشتراک ویژه و مسئولیت‌ها.`,
    updated: 'فروردین ۱۴۰۵',
  },
  privacy: {
    tab: 'حریم خصوصی',
    title: `سیاست حفظ حریم خصوصی — ${N}`,
    description: `حریم خصوصی شما در ${N}: پردازش محلی در مرورگر، داده‌های بدون حساب و با حساب کاربری، هشدارها، تلگرام و حق دانلود یا حذف فوری داده‌ها.`,
    updated: 'تیر ۱۴۰۵',
  },
  risk: {
    tab: 'افشای ریسک',
    title: `افشای ریسک و دقت تست‌شده — ${N}`,
    description: `گزارش صادقانه ریسک و آمار تست‌شده پیش‌بینی‌ها، امتیاز نمودار و زمان‌بندی در ${N}. آموزش و تحلیل، نه مشاوره یا تضمین سود مالی.`,
    updated: 'تیر ۱۴۰۵',
  },
};

export const title = (p) => (META[p?.[0]] ? META[p[0]].tab : 'قوانین');

const PAGES = (contact) => ({
  terms: {
    h: 'شرایط خدمات',
    lead: `این متن را طوری نوشته‌ایم که بدون اصطلاحات پیچیده و حقوقیِ مبهم، دقیقاً بدانید ${N} چطور کار می‌کند، چه کمکی به شما می‌دهد و مرزهایش کجاست.`,
    tldr: [
      `${N} یک ابزار تحلیلی و آموزشی است؛ نه صرافی، کارگزار یا مشاور سرمایه‌گذاری.`,
      'هیچ‌وقت کلید خصوصی، Seed Phrase یا رمز صرافی شما را نمی‌خواهیم.',
      'تصمیم نهایی خرید، فروش یا معامله همیشه با خود شماست.',
    ],
    body: `
      <section aria-labelledby="t-1">
        <h2 id="t-1">۱. ماهیت واقعی این سرویس</h2>
        <p>${N} یک پلتفرم تحلیل بازار و داده‌نمایی است. ما داده‌های عمومی بازار، کندل‌ها، اندیکاتورهای فنی، پیش‌بینی‌های آماری و مقایسه‌های تاریخی را جمع‌آوری و مرتب می‌کنیم تا بتوانید بازار را شفاف‌تر و سریع‌تر بررسی کنید.</p>
        <p>هدف ما این است که به جای حدس و گمان‌های پراکنده، اطلاعات خام و معیارهای سنجیده‌شده را در اختیار شما بگذاریم تا خودتان با آگاهی تصمیم بگیرید.</p>
      </section>

      <section aria-labelledby="t-2">
        <h2 id="t-2">۲. کارهایی که این سرویس انجام نمی‌دهد</h2>
        <p>${N} به هیچ عنوان کارگزار (Broker)، صرافی، متولی دارایی (Custodian)، صندوق سرمایه‌گذاری یا مشاور مالی رسمی <strong>نیست</strong>.</p>
        <ul>
          <li>این سرویس سفارش خرید یا فروش در صرافی‌ها را مستقیماً اجرا نمی‌کند.</li>
          <li>پول نقد یا رمزارز شما را نگهداری، قفل یا جابه‌جا نمی‌کند.</li>
          <li>هرگز کلیدهای API صرافی، کلید خصوصی یا عبارت بازیابی (Seed Phrase) را از شما درخواست نمی‌کند.</li>
        </ul>
        <p>اگر فرد یا صفحه‌ای با نام ${N} از شما درخواست Seed Phrase، کلید خصوصی، ارسال رمزارز برای «فعال‌سازی» یا وعده سود قطعی کرد، مطمئن باشید کلاهبردار است و به هیچ وجه اعتماد نکنید.</p>
      </section>

      <section aria-labelledby="t-3">
        <h2 id="t-3">۳. بدون مشاوره مالی یا تضمین سود</h2>
        <p>سیگنال‌ها، امتیازها، پیش‌بینی‌های بازه یا جهت، پاسخ‌های هوش مصنوعی و سناریوهای شبیه‌سازی‌شده همگی خروجی مدل‌ها و محاسبات خودکار روی داده‌های عمومی هستند. بازار رمزارز پرنوسان است و این خروجی‌ها می‌توانند اشتباه باشند.</p>
        <p>هیچ‌یک از محتواهای ${N} توصیه سرمایه‌گذاری شخصی، مشاوره حقوقی یا مشاوره مالیاتی محسوب نمی‌شود و وضعیت مالی یا تحمل ریسک شما را ارزیابی نمی‌کند. هر معامله یا تصمیمی با مسئولیت کامل خودتان انجام می‌شود.</p>
      </section>

      <section aria-labelledby="t-4">
        <h2 id="t-4">۴. حساب کاربری و کنترل کامل در دستان شما</h2>
        <p>اگر حساب کاربری بسازید، حفظ امنیت رمز عبور و فعالیت‌های انجام‌شده ذیل حساب بر عهده شماست. لطفاً رمز عبوری انتخاب کنید که در سایت‌های دیگر استفاده نکرده‌اید.</p>
        <p>ما به شفافیت و اختیار کاربر باور داریم: هر زمان که بخواهید می‌توانید از داخل صفحه حساب کاربری، اکانت خود را حذف کنید تا پروفایل، هشدارها و داده‌های همگام‌سازی‌شده شما پاک شوند.</p>
      </section>

      <section aria-labelledby="t-5">
        <h2 id="t-5">۵. استفاده سالم و منصفانه</h2>
        <p>برای اینکه سرویس برای همه کاربران سریع، پایدار و در دسترس بماند، لطفاً از موارد زیر خودداری کنید:</p>
        <ul>
          <li>اسکرپینگ سنگین، ارسال درخواست‌های حجیم یا مخرب، یا ایجاد اختلال در سرورها و APIها.</li>
          <li>تلاش برای دور زدن محدودیت‌ها، احراز هویت یا دسترسی به اطلاعات سایر کاربران.</li>
          <li>بازفروش یا بازتوزیع سازمان‌یافته داده‌ها و فیدهای سرویس بدون مجوز.</li>
          <li>استفاده از سرویس در حوزه‌هایی که بهره‌برداری از آن خلاف قوانین محلی است.</li>
        </ul>
      </section>

      <section aria-labelledby="t-6">
        <h2 id="t-6">۶. اشتراک ویژه (Premium)</h2>
        <p>اشتراک ویژه برای یک بازه زمانی مشخص و به‌صورت <strong>پرداخت یک‌باره</strong> ارائه می‌شود و تمدید خودکار ناخواسته ندارد.</p>
        <p>این اشتراک امکانات سمت سرور مانند بررسی هشدارها حتی وقتی مرورگر بسته است و ابزارهای پیگیری بیشتر را فعال می‌کند؛ اما به معنای «تضمین سود» یا «پیش‌بینی بی‌خطا» نیست. اگر بخش پولی برای مدتی طولانی از دسترس خارج شد، با ما در ارتباط باشید تا مدت اشتراک را جبران کنیم یا هزینه را برگردانیم.</p>
      </section>

      <section aria-labelledby="t-7">
        <h2 id="t-7">۷. منابع داده شخص ثالث</h2>
        <p>قیمت‌ها، کندل‌ها، داده‌های بازار، نرخ تبدیل ارز و فیدهای عمومی از چندین منبع رسمی و سرویس‌های عمومی دریافت می‌شوند.</p>
        <p>ممکن است در لحظات نوسان شدید یا قطعی شبکه، این منابع با تأخیر، خطا یا محدودیت نرخ مواجه شوند. ما روی سرعت یا دقت منابع بیرونی کنترل کامل نداریم و مسئولیتی بابت خطای آن‌ها نمی‌پذیریم.</p>
      </section>

      <section aria-labelledby="t-8">
        <h2 id="t-8">۸. حد مسئولیت و در دسترس بودن</h2>
        <p>این سرویس «همان‌طور که هست» و بدون ضمانت صریح یا ضمنی ارائه می‌شود. تا آن‌جا که قانون اجازه دهد، ${N} مسئولیتی در قبال زیان‌های معاملاتی، از دست رفتن فرصت‌ها، خطای داده‌ها یا قطعی‌های موقت ندارد. در مواردی که قانون سقف مسئولیت تعیین کند، این سقف محدود به مبلغی است که طی ۱۲ ماه گذشته برای سرویس پرداخت کرده‌اید.</p>
      </section>

      <section aria-labelledby="t-9">
        <h2 id="t-9">۹. به‌روزرسانی این شرایط</h2>
        <p>با اضافه شدن قابلیت‌های جدید یا تغییر مقررات، ممکن است این متن را به‌روزرسانی کنیم. ادامه استفاده شما از سرویس پس از انتشار تغییرات به معنای پذیرش نسخه جدید است.</p>
      </section>
      ${contact ? `<section aria-labelledby="t-10"><h2 id="t-10">۱۰. راه ارتباطی</h2><p>برای پرسش، پیشنهاد یا پیگیری پشتیبانی می‌توانید از طریق راه ارتباطی زیر با ما تماس بگیرید: <strong>${esc(contact)}</strong></p></section>` : ''}
    `,
  },

  privacy: {
    h: 'سیاست حفظ حریم خصوصی',
    lead: `در ${N} تلاش کرده‌ایم تا جای ممکن داده‌ها را روی دستگاه خودتان نگه داریم و فقط حداقل اطلاعات ضروری را برای کارکرد حساب و هشدارها ذخیره کنیم.`,
    tldr: [
      'بخش زیادی از نمودارها، اندیکاتورها و محاسبات مستقیماً در مرورگر شما اجرا می‌شود.',
      'بدون حساب کاربری، تنظیمات و واچ‌لیست فقط در Local Storage مرورگر خودتان می‌مانند.',
      'تبلیغات ردیاب و فروش داده به تبلیغ‌کنندگان نداریم؛ هر زمان هم می‌توانید داده‌ها را خروجی بگیرید یا پاک کنید.',
    ],
    body: `
      <section aria-labelledby="p-1">
        <h2 id="p-1">۱. خلاصه شفاف و صمیمی</h2>
        <p>بخش عمده‌ای از ${N} داخل مرورگر شما اجرا می‌شود؛ از جمله رسم نمودارها، محاسبه اندیکاتورها، سیگنال‌ها، پیش‌بینی‌ها و پردازش‌های محلی. ما به جای جمع‌آوری اطلاعات غیرضروری، فقط حداقل داده‌های لازم برای مدیریت حساب کاربری و ارسال هشدارها را نگهداری می‌کنیم.</p>
      </section>

      <section aria-labelledby="p-2">
        <h2 id="p-2">۲. استفاده بدون حساب کاربری</h2>
        <p>اگر بدون ورود به حساب از سایت استفاده کنید، واچ‌لیست، دارایی‌های ثبت‌شده، آدرس کیف پول‌های تحت نظر، هشدارها، تنظیمات و حساب‌های شبیه‌سازی‌شده فقط در حافظه محلی (<code>Local Storage</code>) مرورگر خودتان ذخیره می‌شوند. ما به این اطلاعات دسترسی نداریم و با پاک کردن داده‌های مرورگر، از بین می‌روند.</p>
        <p>برای اینکه بفهمیم کدام بخش‌ها مفیدترند و سایت را بهبود دهیم، آمار بازدید ناشناس (مثل مسیر صفحه، ارجاع‌دهنده، نوع کلی دستگاه، زبان مرورگر و شناسه موقت جلسه که با بسته شدن تب پاک می‌شود) ثبت می‌شود. هیچ کوکی تبلیغاتی به کار نمی‌رود و هیچ داده‌ای به شبکه‌های تبلیغاتی فروخته یا منتقل نمی‌شود.</p>
      </section>

      <section aria-labelledby="p-3">
        <h2 id="p-3">۳. استفاده با حساب کاربری</h2>
        <p>وقتی حساب کاربری بسازید، ایمیل، نام نمایشی و هش رمز عبور (به‌صورت رمزنگاری‌شده) ذخیره می‌شوند تا بتوانید تنظیمات و اطلاعات خود را بین دستگاه‌ها همگام کنید:</p>
        <ul>
          <li>واچ‌لیست، اقلام پورتفوی و آدرس‌های کیف پول فقط-تماشا (Watch-only).</li>
          <li>ترسیمات روی نمودار، ترجیحات رابط کاربری و تنظیمات برنامه.</li>
          <li>حساب‌های بخش معامله (معاملات آزمایشی، معاملات ثبت‌شده با مقادیر، قیمت‌ها، کارمزدها و یادداشت‌ها، و حساب شبیه‌سازی هوش مصنوعی).</li>
          <li>در صورت فعال‌سازی هشدارها، قوانین هشدار شما و در صورت اتصال، شناسه چت تلگرام برای ارسال اعلان‌ها.</li>
        </ul>
      </section>

      <section aria-labelledby="p-4">
        <h2 id="p-4">۴. مالکیت داده‌ها و دستیار هوش مصنوعی</h2>
        <p>پرسش‌ها و محاسبات مربوط به دستیار داخلی در مرورگر شما انجام می‌شود و به سرورهای ما فرستاده نمی‌شود. اگر در تنظیمات خودتان یک ارائه‌دهنده هوش مصنوعی خارجی را انتخاب و کلیدش را وارد کنید، درخواست‌ها مستقیماً طبق سیاست حریم خصوصی همان ارائه‌دهنده پردازش می‌شوند.</p>
      </section>

      <section aria-labelledby="p-5">
        <h2 id="p-5">۵. سرویس‌های زیرساختی و اشخاص ثالث</h2>
        <p>مرورگر شما داده‌های بازار را مستقیماً از APIهای عمومی (مانند بایننس، کوین‌گکو، کوین‌پپریکا و mempool.space) دریافت می‌کند؛ بنابراین همانند بازدید از هر سایت دیگری، آدرس IP شما نزد ارائه‌دهنده API قابل مشاهده است.</p>
        <p>زیرساخت بک‌اند روی قرار دارد. ارسال ایمیل‌ها (در صورت فعال بودن) از طریق پرووایدر انجام می‌شود و پرداخت‌های کارتی (در صورت فعال بودن) توسط بانک عامل پردازش می‌شوند؛ بنابراین اطلاعات کارت بانکی شما هرگز نزد ما ذخیره یا دیده نمی‌شود.</p>
      </section>

      <section aria-labelledby="p-6">
        <h2 id="p-6">۶. مدت نگهداری و حذف داده‌ها</h2>
        <p>داده‌های حساب کاربری تا زمانی که خودتان آن‌ها را حذف کنید باقی می‌مانند. با حذف حساب از بخش حساب کاربری، پروفایل، داده‌های همگام‌سازی‌شده و هشدارهای مرتبط پاک می‌شوند. آمار بازدید ناشناس پس از ۳۰ روز نگهداری نمی‌شود و کدهای تأیید پس از ۱۵ دقیقه منقضی می‌شوند.</p>
      </section>

      <section aria-labelledby="p-7">
        <h2 id="p-7">۷. حقوق شما (خروجی، ویرایش و حذف)</h2>
        <p>شما صاحب داده‌های خودتان هستید: می‌توانید همه داده‌های حساب را به‌صورت فایل <code>JSON</code> دانلود کنید، اطلاعات خود را ویرایش کنید یا حساب را فوراً حذف نمایید. اگر مشمول مقررات حفاظت از داده مانند GDPR باشید، این ابزارها دقیقاً برای پاسخگویی به همین حقوق در اختیار شما قرار گرفته‌اند.</p>
      </section>
      ${contact ? `<section aria-labelledby="p-8"><h2 id="p-8">۸. تماس با ما</h2><p>اگر درباره حریم خصوصی سوالی دارید، از این طریق با ما در ارتباط باشید: <strong>${esc(contact)}</strong></p></section>` : ''}
    `,
  },

  risk: {
    h: 'افشای ریسک',
    lead: `در بازار رمزارز، صداقت درباره محدودیت‌ها مهم‌تر از هر وعده‌ای است. اینجا بدون تعارف، ریسک‌ها و نتایج واقعی تست‌های سیستم را می‌بینید.`,
    tldr: [
      'رمزارزها پرنوسان هستند و می‌توانند بخش عمده یا کل ارزش خود را سریع از دست بدهند.',
      'مدل‌ها مزیت قطعی و پایدار بر مبنای ساده در پیش‌بینی جهت حرکت ندارند.',
      'مدیریت ریسک، تعیین حد ضرر و پرهیز از اهرم سنگین از هر پیش‌بینی مهم‌تر است.',
    ],
    body: `
      <section aria-labelledby="r-1">
        <h2 id="r-1">۱. پیش از هر معامله این نکته را جدی بگیرید</h2>
        <p>دارایی‌های دیجیتال نوسان بالایی دارند، اغلب فاقد نظارت متمرکز سنتی هستند و می‌توانند در مدت کوتاهی بخش بزرگی یا تمام ارزش خود را از دست بدهند. هیچ ابزار یا نموداری در ${N} این واقعیت را تغییر نمی‌دهد.</p>
      </section>

      <section aria-labelledby="r-2">
        <h2 id="r-2">۲. پیش‌بینی‌ها: بدون مزیت آماری اثبات‌شده در جهت حرکت</h2>
        <p>موتور پیش‌بینی با روش آزمون رو به جلو (Walk-forward) ارزیابی شده است؛ یعنی در هر نقطه زمانی، فقط از داده‌هایی استفاده شده که تا همان لحظه در دسترس بوده‌اند.${recheckOverall() ? ` در آخرین تست (${recheckOverall().tests.toLocaleString('fa-IR')} پیش‌بینی روی ${recheckOverall().coins} کوین در تاریخ ${recheckOverall().measuredOn})، جهت حرکت بازار در <strong>${recheckOverall().hit.toLocaleString('fa-IR')}٪</strong> مواقع درست تشخیص داده شده است؛ در حالی که مبنای ساده (نادیده گرفتن موتور و در نظر گرفتن جهت شایع‌تر هر کوین) به <strong>${recheckOverall().baseline.toLocaleString('fa-IR')}٪</strong> رسید (با ده پیش‌بینی برای هر کوین، حتی انتخاب تصادفی هم می‌تواند بالای ۵۰٪ قرار بگیرد). تفکیک بر اساس تایم‌فریم: ${recheckLine()}.` : ''} در تست انتشار قبلی با ${TESTED_ACCURACY.tests.toLocaleString('fa-IR')} پیش‌بینی روی ${TESTED_ACCURACY.coins} کوین، دقت کل ${TESTED_ACCURACY.all}% در برابر مبنای ${TESTED_ACCURACY.allBaseline}% ثبت شد: ${accuracyLine()}. این موتور در هیچ‌کدام از آزمون‌ها نتوانست بر مبنای خود غلبه کند و در بازه‌های ${TESTED_ACCURACY.noEdge.join('، ')} پایین‌تر از مبنا قرار گرفت.</p>
        <p>${esc(TESTED_ACCURACY.caveat)}</p>
      </section>

      <section aria-labelledby="r-3">
        <h2 id="r-3">۳. امتیاز نمودار دقیقاً چه چیزی را نشان می‌دهد؟</h2>
        <p>بررسی ${SCORE_BUCKETS_TESTED.bars.toLocaleString('fa-IR')} کندل از ${SCORE_BUCKETS_TESTED.coins} کوین بر اساس امتیاز موتور نشان می‌دهد که با بالاتر رفتن امتیاز، نسبت کندل‌هایی که پس از آن رشد کرده‌اند اغلب <strong>کاهش</strong> می‌یابد؛ در نمودارهای بررسی‌شده، کندل‌های با بالاترین امتیاز کمترین احتمال رشد را داشتند. معامله در خلاف جهت هم راه‌حل قطعی نیست؛ هر دو جهت روی داده‌های حفظ‌شده با احتساب کارمزد تست شدند و هیچ‌کدام بازدهی مثبت پایدار نداشتند.</p>
        <p>پس این امتیاز را به عنوان «اندازه کشیدگی روند» در نظر بگیرید، نه دستور خرید یا فروش.</p>
      </section>

      <section aria-labelledby="r-4">
        <h2 id="r-4">۴. زمان‌بندی نقاط اوج و کف</h2>
        <p>در بررسی زمان وقوع اوج یا کف حرکت طی ${TESTED_TIMING.tests.toLocaleString('fa-IR')} تست روی ${TESTED_TIMING.coins} کوین، دقت زمان‌بندی <strong>${TESTED_TIMING.peakHitPct}%</strong> در برابر مبنای <strong>${TESTED_TIMING.baselinePct}%</strong> ثبت شد. بر اساس تایم‌فریم: ${timingLine()}.${TESTED_TIMING.previousRun ? ` در یک اجرای دیگر چند ساعت قبل روی تقریباً همان کندل‌ها، دقت کلی ${TESTED_TIMING.previousRun.peakHitPct}% به دست آمد${timingSwingRange() ? ` و نمودارهای تکی بین دو اجرا ${timingSwingRange()} واحد نوسان داشتند که به اندازه بخش عمده این اختلاف‌هاست` : ''}.` : ''} این شاخص فقط بازه زمانی را می‌سنجد و جهت حرکت را تضمین نمی‌کند؛ تشخیص زمان نوسان بدون برتری آماری در جهت، همچنان به معنای نبودِ مزیت معاملاتی تضمین‌شده است.</p>
        <p>هیچ‌یک از این ارقام مجوزی برای ریسک سنگین نیست و عملکرد گذشته آینده را تضمین نمی‌کند.</p>
      </section>

      <section aria-labelledby="r-5">
        <h2 id="r-5">۵. اهرم (Leverage) و مدیریت ریسک</h2>
        <p>نمایش داده‌های معاملات آتی فقط برای شناخت فضای بازار است، نه دعوت به معامله با اهرم. اهرم هم سود و هم زیان را چند برابر می‌کند، لیکوئید شدن برگشت‌پذیر نیست و بخش بزرگی از معامله‌گران خرد اهرمی متضرر می‌شوند.</p>
        <p>هیچ‌وقت پولی را که به آن نیاز دارید یا توان از دست دادنش را ندارید وارد معامله نکنید. تعیین درصد ریسک کوچک و ثابت در هر پوزیشن و داشتن حد ضرر (Stop-Loss) همیشه از هر پیش‌بینی مهم‌تر است؛ بدون برنامه خروج، معامله صرفاً شانس است.</p>
      </section>

      <section aria-labelledby="r-6">
        <h2 id="r-6">۶. مراقب کلاهبرداری‌ها باشید</h2>
        <p>${N} هرگز Seed Phrase، کلید خصوصی یا API Key صرافی را از شما نمی‌خواهد، برای «فعال‌سازی» درخواست واریز رمزارز نمی‌کند و در پیام خصوصی سود تضمین‌شده وعده نمی‌دهد. قابلیت ردیابی کیف پول فقط-تماشا (Watch-only) است و صرفاً با آدرس‌های عمومی کار می‌کند؛ هیچ‌کس با آدرس عمومی نمی‌تواند دارایی شما را منتقل کند.</p>
      </section>

      <section aria-labelledby="r-7">
        <h2 id="r-7">۷. قوانین محلی، مالیات و سلامت روان</h2>
        <p>قوانین و مقررات مالیاتی رمزارز در کشورهای مختلف متفاوت است و تغییر می‌کند؛ بررسی و رعایت قوانین محل سکونت یا فعالیت بر عهده خود شماست و ما مشاور مجاز در هیچ حوزه‌ای نیستیم.</p>
        <p>اگر برای جبران ضرر عجولانه معامله می‌کنید، معاملات را پنهان می‌کنید یا برای ترید قرض می‌گیرید، کمی مکث کنید. معامله می‌تواند فرساینده یا اعتیادآور باشد؛ در صورت نیاز، از یک فرد قابل اعتماد یا مرکز مشاوره تخصصی کمک بگیرید.</p>
      </section>
    `,
  },
});

const STYLES = `
  <style>
    .lg-shell {
      max-width: 920px;
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }
    .lg-hero {
      position: relative;
      overflow: hidden;
      border-radius: 24px;
      padding: 24px 26px;
      background:
        radial-gradient(520px circle at 12% 0%, rgba(214, 180, 108, 0.14), transparent 60%),
        linear-gradient(165deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.02));
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }
    .lg-top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 12px;
    }
    .lg-meta-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .lg-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 0.75rem;
      color: #f6e7c1;
      background: rgba(214, 180, 108, 0.12);
      border: 1px solid rgba(214, 180, 108, 0.28);
    }
    .lg-date {
      font-size: 0.76rem;
      color: rgba(255, 255, 255, 0.58);
    }
    .lg-tabs {
      display: inline-flex;
      padding: 4px;
      border-radius: 14px;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.09);
      gap: 4px;
    }
    .lg-tab {
      border: 0;
      background: transparent;
      color: rgba(255, 255, 255, 0.72);
      padding: 7px 14px;
      border-radius: 10px;
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .lg-tab:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.06);
    }
    .lg-tab.is-active {
      color: #0b0a09;
      font-weight: 600;
      background: linear-gradient(135deg, #f6e7c1, #d6b46c);
      box-shadow: 0 4px 14px rgba(214, 180, 108, 0.28);
    }
    .lg-h1 {
      margin: 4px 0 8px;
      font-size: clamp(1.45rem, 2.4vw, 1.95rem);
      line-height: 1.3;
      letter-spacing: -0.02em;
    }
    .lg-lead {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.75;
      color: rgba(255, 255, 255, 0.8);
      max-width: 70ch;
    }
    .lg-tldr {
      border-radius: 20px;
      padding: 18px 22px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(214, 180, 108, 0.2);
    }
    .lg-tldr-title {
      margin: 0 0 10px;
      font-size: 0.88rem;
      font-weight: 600;
      color: #f6e7c1;
    }
    .lg-tldr ul {
      margin: 0;
      padding-right: 18px;
      display: grid;
      gap: 7px;
      font-size: 0.88rem;
      color: rgba(255, 255, 255, 0.86);
    }
    .lg-article {
      border-radius: 24px;
      padding: 26px;
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(255, 255, 255, 0.09);
    }
    .lg-article section + section {
      margin-top: 24px;
      padding-top: 22px;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
    }
    .lg-article h2 {
      margin: 0 0 10px;
      font-size: 1.12rem;
      line-height: 1.45;
      color: #f6e7c1;
    }
    .lg-article p {
      margin: 0 0 10px;
      font-size: 0.93rem;
      line-height: 1.85;
      color: rgba(255, 255, 255, 0.84);
    }
    .lg-article ul {
      margin: 8px 0 12px;
      padding-right: 20px;
      display: grid;
      gap: 6px;
      font-size: 0.91rem;
      line-height: 1.75;
      color: rgba(255, 255, 255, 0.82);
    }
    .lg-footer-nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 20px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 0.84rem;
    }
    .lg-links {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
    }
    .lg-links a {
      color: #f6e7c1;
      text-decoration: none;
    }
    .lg-links a:hover {
      text-decoration: underline;
    }
    @media (max-width: 640px) {
      .lg-hero, .lg-article { padding: 18px 16px; border-radius: 20px; }
      .lg-tabs { width: 100%; justify-content: space-between; }
      .lg-tab { flex: 1; text-align: center; padding: 7px 8px; font-size: 0.78rem; }
    }
  </style>
`;

function syncSeoMeta(activeKey, pageTitle, pageDesc) {
  document.title = pageTitle;
  let descEl = document.querySelector('meta[name="description"]');
  if (!descEl) {
    descEl = document.createElement('meta');
    descEl.setAttribute('name', 'description');
    document.head.appendChild(descEl);
  }
  descEl.setAttribute('content', pageDesc);

  let ldEl = document.getElementById('ld-legal-page');
  if (!ldEl) {
    ldEl = document.createElement('script');
    ldEl.type = 'application/ld+json';
    ldEl.id = 'ld-legal-page';
    document.head.appendChild(ldEl);
  }

  const baseUrl = `${location.origin}${location.pathname}`;
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: pageTitle,
        description: pageDesc,
        inLanguage: 'fa-IR',
        url: `${baseUrl}#/legal/${activeKey}`,
        isPartOf: {
          '@type': 'WebSite',
          name: N,
          url: baseUrl,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: N, item: `${baseUrl}#/` },
          { '@type': 'ListItem', position: 2, name: 'قوانین', item: `${baseUrl}#/legal/terms` },
          { '@type': 'ListItem', position: 3, name: pageTitle, item: `${baseUrl}#/legal/${activeKey}` },
        ],
      },
    ],
  };
  ldEl.textContent = JSON.stringify(data);
}

export async function render(el, [page = 'terms']) {
  const activeKey = META[page] ? page : 'terms';
  const meta = META[activeKey];
  syncSeoMeta(activeKey, meta.title, meta.description);

  let shown;
  const draw = (contact) => {
    if (contact === shown || (shown !== undefined && !el.isConnected)) return;
    shown = contact;
    const pages = PAGES(contact);
    const p = pages[activeKey];

    el.innerHTML = `
      ${STYLES}
      <div class="lg-shell" dir="rtl">
        <header class="lg-hero">
          <div class="lg-top">
            <div class="lg-meta-row">
              <span class="lg-badge">${esc(N)} · شفافیت و اعتماد</span>
              <span class="lg-date">به‌روزرسانی: ${esc(meta.updated)}</span>
            </div>
            <nav class="lg-tabs" aria-label="بخش‌های قوانین و حریم خصوصی">
              ${Object.entries(META).map(([k, v]) => `
                <button type="button" data-p="${k}" class="lg-tab ${k === activeKey ? 'is-active' : ''}" aria-current="${k === activeKey ? 'page' : 'false'}">
                  ${esc(v.tab)}
                </button>
              `).join('')}
            </nav>
          </div>
          <h1 class="lg-h1">${esc(p.h)}</h1>
          <p class="lg-lead">${esc(p.lead)}</p>
        </header>

        <aside class="lg-tldr" aria-label="خلاصه سریع">
          <h2 class="lg-tldr-title">خلاصه سریع و صمیمی (در ۳۰ ثانیه)</h2>
          <ul>
            ${p.tldr.map((item) => `<li>${esc(item)}</li>`).join('')}
          </ul>
        </aside>

        <article class="lg-article" aria-label="${esc(p.h)}">
          ${p.body}
        </article>

        <footer class="lg-footer-nav" aria-label="ناوبری مرتبط">
          <span>این صفحات برای آگاهی شفاف نوشته شده‌اند؛ نه مشاوره مالی.</span>
          <div class="lg-links">
            <a href="#/legal/terms">شرایط خدمات</a>
            <a href="#/legal/privacy">حریم خصوصی</a>
            <a href="#/legal/risk">افشای ریسک</a>
            <a href="#/track">سابقه عملکرد</a>
          </div>
        </footer>
      </div>
    `;

    el.querySelectorAll('[data-p]').forEach((btn) => {
      btn.addEventListener('click', () => {
        location.hash = `#/legal/${btn.dataset.p}`;
      });
    });
  };

  draw(cachedAppSettings()?.site?.contact || null);
  getAppSettings().then((s) => draw(s.site?.contact || null)).catch(() => {});
}