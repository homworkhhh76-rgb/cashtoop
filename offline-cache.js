(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost')) return;

  const STATIC_HOSTS = new Set([
    'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'
  ]);

  function isUsefulResource(urlString) {
    try {
      const url = new URL(urlString, location.href);
      if (url.origin === location.origin) {
        // لا نرسل XHR أو endpoints حية إلى الكاش؛ فقط الصفحة والملفات الثابتة.
        let path = url.pathname;
        try { path = decodeURIComponent(path); } catch (_) {}
        if (/(?:^|\/)api(?:\/|$)/i.test(path) || /__turso_rtdb__(?:\/|$)/i.test(path)) return false;
        const current = new URL(location.href); current.hash = '';
        const candidate = new URL(url.href); candidate.hash = '';
        if (candidate.href === current.href) return true;
        return /\.(?:html?|css|js|mjs|woff2?|ttf|otf|png|jpe?g|svg|webp|gif|ico|mp3|webmanifest)(?:$|\?)/i.test(url.pathname + url.search);
      }
      return STATIC_HOSTS.has(url.hostname);
    } catch (_) {
      return false;
    }
  }

  function collectLoadedResources() {
    const urls = new Set();
    try {
      for (const entry of performance.getEntriesByType('resource')) {
        if (entry && entry.name && isUsefulResource(entry.name)) urls.add(entry.name);
      }
    } catch (_) {}

    // يغطي الموارد التي قد لا تظهر في Performance API ببعض المتصفحات.
    document.querySelectorAll('script[src],link[rel="stylesheet"][href],img[src],audio[src],source[src]').forEach(el => {
      const raw = el.src || el.href;
      if (raw && isUsefulResource(raw)) urls.add(raw);
    });
    return [...urls].slice(0, 100);
  }

  async function registerAndCacheCurrentPage() {
    try {
      const registration = await navigator.serviceWorker.getRegistration('./') ||
        await navigator.serviceWorker.register('service-worker.js', {
          scope: './',
          updateViaCache: 'none'
        });
      const ready = await navigator.serviceWorker.ready;
      const worker = ready.active || registration.active || registration.waiting || registration.installing;
      if (!worker) return;

      const sendSnapshot = () => worker.postMessage({
        type: 'CACHE_VISITED_PAGE',
        payload: {
          pageUrl: location.href,
          resources: collectLoadedResources()
        }
      });

      if (document.readyState === 'complete') {
        setTimeout(sendSnapshot, 0);
      } else {
        window.addEventListener('load', () => setTimeout(sendSnapshot, 0), { once: true });
      }
    } catch (error) {
      console.warn('[CASH TOP] Offline cache registration failed:', error);
    }
  }

  registerAndCacheCurrentPage();
})();
