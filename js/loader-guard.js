(() => {
  const loader = document.getElementById('globalLoader');
  if (!loader) return;

  let hideTimer = null;

  const hide = () => {
    clearTimeout(hideTimer);
    loader.classList.add('is-hidden');
  };

  const show = (ms = 2200) => {
    loader.classList.remove('is-hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, ms);
  };

  // شروع با سقف زمانی کوتاه تا هیچ‌وقت روی صفحه قفل نشود
  show(2200);

  if (document.readyState === 'complete') {
    setTimeout(hide, 250);
  } else {
    window.addEventListener('load', () => setTimeout(hide, 250), { once: true });
    document.addEventListener('DOMContentLoaded', () => setTimeout(hide, 900), { once: true });
  }

  // هنگام تغییر مسیر SPA یک لودر کوتاه نشان بده و سریع ببند
  window.addEventListener('hashchange', () => show(1200));

  // اگر دکمه ESC زده شد هم لودر بسته شود
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  window.__cvLoader = { show, hide };
})();