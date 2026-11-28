(() => {
  const loader = document.getElementById('globalLoader');
  const sub = document.getElementById('cvLoaderSub');
  if (!loader) return;

  let hideTimer = null;

  const routeLabels = {
    '': 'در حال همگام‌سازی داده‌های زنده…',
    '#/': 'در حال بارگذاری داشبورد بازار…',
    '#/markets': 'در حال دریافت نرخ صرافی‌ها…',
    '#/alerts': 'در حال بارگذاری اعلان‌های هوشمند…',
    '#/track': 'در حال آماده‌سازی سابقه عملکرد…',
    '#/learn': 'در حال باز کردن بخش آموزش…'
  };

  const hide = () => {
    clearTimeout(hideTimer);
    requestAnimationFrame(() => {
      loader.classList.add('is-hidden');
    });
  };

  const show = (ms = 600, label) => {
    if (sub && label) sub.textContent = label;
    loader.classList.remove('is-hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, ms);
  };

  // اجرای اولیه با سقف ایمن کوتاه برای حفظ LCP
  show(600, routeLabels[location.hash] || routeLabels['']);

  if (document.readyState === 'complete') {
    hide();
  } else if (document.readyState === 'interactive') {
    requestAnimationFrame(hide);
    window.addEventListener('load', hide, { once: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(hide), { once: true });
    window.addEventListener('load', hide, { once: true });
  }

  // اعمال سبک روی تغییر مسیرهای SPA
  window.addEventListener('hashchange', () => {
    const hash = location.hash.split('?')[0];
    const text = hash.startsWith('#/coin/')
      ? 'در حال تحلیل نمودار و اندیکاتورها…'
      : (routeLabels[hash] || 'در حال بارگذاری صفحه…');
    show(350, text);
    requestAnimationFrame(() => setTimeout(hide, 120));
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  window.__cvLoader = { show, hide };
})();
