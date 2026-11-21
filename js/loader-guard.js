(() => {
  const loader = document.getElementById('globalLoader');
  const sub = document.getElementById('cvLoaderSub');
  if (!loader) return;

  let hideTimer = null;

  const routeLabels = {
    '': 'در حال همگام‌سازی داده‌های زنده…',
    '#/': 'در حال بارگذاری داشبورد بازار…',
    '#/markets': 'در حال دریافت نرخ صرافی‌ها…',
    '#/alerts': 'در حال بارگذاری هشدارهای هوشمند…',
    '#/track': 'در حال آماده‌سازی سابقه عملکرد…',
    '#/learn': 'در حال باز کردن بخش آموزش…'
  };

  const hide = () => {
    clearTimeout(hideTimer);
    loader.classList.add('is-hidden');
  };

  const show = (ms = 1800, label) => {
    if (sub && label) sub.textContent = label;
    loader.classList.remove('is-hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, ms);
  };

  // اجرای اولیه با سقف ایمن ۱.۸ ثانیه
  show(1800, routeLabels[location.hash] || routeLabels['']);

  if (document.readyState === 'complete') {
    setTimeout(hide, 320);
  } else {
    window.addEventListener('load', () => setTimeout(hide, 320), { once: true });
    document.addEventListener('DOMContentLoaded', () => setTimeout(hide, 850), { once: true });
  }

  // اعمال خودکار روی تغییر مسیرهای SPA
  window.addEventListener('hashchange', () => {
    const hash = location.hash.split('?')[0];
    const text = hash.startsWith('#/coin/')
      ? 'در حال تحلیل نمودار و اندیکاتورها…'
      : (routeLabels[hash] || 'در حال بارگذاری صفحه…');
    show(950, text);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  window.__cvLoader = { show, hide };
})();