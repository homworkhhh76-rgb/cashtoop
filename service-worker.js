'use strict';

const CACHE_VERSION = 'v75-cache-first-notification-corner';
const APP_CACHE = `cash-top-2-app-${CACHE_VERSION}`;
const REMOTE_STATIC_CACHE = `cash-top-2-remote-static-${CACHE_VERSION}`;

/*
 * حزمة التطبيق المحلية كاملة. التثبيت لا ينجح إلا بعد حفظ كل ملف محلي،
 * لذلك لا يستبدل الإصدار الجديد الكاش القديم بنسخة ناقصة.
 */
const LOCAL_ASSETS = [
  './accounting-engine.js',
  './accounts.html',
  './admin.html',
  './admin.js',
  './app-icon.png',
  './audit-trail.html',
  './barcode-generator.html',
  './barcode-tools.js',
  './branches.html',
  './cashier.html',
  './cashtop-core.css',
  './cashtop-core.js',
  './turso-config.js',
  './turso-rtdb.js',
  './turso-sync.js',
  './cashtop-download-fix.js',
  './cashtop-export.js',
  './cashtop-logo.png',
  './cashtop-printer.js',
  './cashtop-worker.js',
  './customer-groups.html',
  './customer-portal.html',
  './customers.html',
  './icon-192.png',
  './icon-512.png',
  './index.html',
  './invoice-designer.html',
  './invoice-document.js',
  './invoices.html',
  './invoices.js',
  './journal.html',
  './login.js',
  './maintenance.html',
  './manifest.webmanifest',
  './manufacturing.js',
  './materials.html',
  './multi-system.js',
  './notifications.html',
  './offline.html',
  './printer-settings.html',
  './products.html',
  './qr.mp3',
  './sales-offers.html',
  './sands.html',
  './setting.html',
  './shortages.html',
  './storage-settings.html',
  './suppliers.html',
  './tax-settings.html',
  './units.html',
  './warehouses.html',
  './ادارة التصنيع.html',
  './استيراد وتصدير ل كل قسم.html',
  './التقارير.html',
  './العمال والاجور.html',
  './المشتريات.html',
  './المصاريف.html',
  './المناديب.html',
  './الموظفين.html',
  './صفحة تسجيل الدخول.html',
  './لوحة التحكم.html',
  './مرجع المشتريات.html'
];

/* مكتبات العرض فقط. فشل أي مكتبة خارجية لا يمنع تثبيت التطبيق المحلي. */
const REMOTE_STATIC_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

const REMOTE_STATIC_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'www.gstatic.com'
]);

/* Prevent background network refreshes from competing with UI rendering.
 * HTML can refresh relatively often; immutable app assets refresh much less. */
const LOCAL_REFRESH_AT = new Map();
const HTML_REFRESH_MS = 12 * 60 * 60 * 1000;
const STATIC_REFRESH_MS = 24 * 60 * 60 * 1000;
let shellVerificationPromise = null;
let remoteWarmPromise = null;

function localRefreshInterval(request) {
  const url = new URL(request.url);
  return request.mode === 'navigate' || request.destination === 'document' || /\.html$/i.test(url.pathname)
    ? HTML_REFRESH_MS
    : STATIC_REFRESH_MS;
}

function shouldRefreshLocalInBackground(request) {
  const key = canonicalLocalRequest(request).url;
  const now = Date.now();
  const last = Number(LOCAL_REFRESH_AT.get(key) || 0);
  if (now - last < localRefreshInterval(request)) return false;
  LOCAL_REFRESH_AT.set(key, now);
  return true;
}

/*
 * هذه نطاقات بيانات حية. لا يجوز وضع استجاباتها في Cache Storage مطلقاً.
 * كان تخزين GET الخاص بـ Turso هو سبب قراءة نسخة قديمة من بيانات الشركة
 * وعدم ظهور تعديلات الأجهزة الأخرى.
 */
function isLiveApiRequest(request, url) {
  const host = String(url.hostname || '').toLowerCase();
  let pathname = String(url.pathname || '');
  try { pathname = decodeURIComponent(pathname); } catch (_) {}
  pathname = pathname.replace(/\/+/g, '/');
  const accept = String(request?.headers?.get?.('accept') || '').toLowerCase();

  // بعد نقل السيرفر قد تصبح قاعدة البيانات على نفس نطاق الواجهة. أي مسار API
  // أو طلب JSON برمجي يجب أن يمر إلى الشبكة مباشرة ولا يدخل Cache Storage.
  const sameOriginApi = url.origin === self.location.origin && (
    /(?:^|\/)api(?:\/|$)/i.test(pathname) ||
    (request?.destination === '' && accept.includes('application/json'))
  );

  return sameOriginApi ||
    /__turso_rtdb__(?:\/|$)/i.test(pathname) ||
    host === 'cash-top-homworkhhh76-rgb.aws-eu-west-1.turso.io';
}

function isCacheableRemoteStatic(request, url) {
  if (!REMOTE_STATIC_HOSTS.has(url.hostname)) return false;
  if (request.destination && ['style', 'script', 'font', 'image', 'audio'].includes(request.destination)) return true;
  return /\.(?:css|js|woff2?|ttf|otf|png|jpe?g|svg|webp|gif|mp3)(?:$|\?)/i.test(url.pathname + url.search);
}

async function putIfUsable(cache, request, response) {
  if (!response) return response;
  if (response.ok || response.type === 'opaque') {
    try { await cache.put(request, response.clone()); } catch (_) {}
  }
  return response;
}

async function fetchWithDeadline(request, options = {}, timeout = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(request, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLocalAsset(asset) {
  const url = new URL(asset, self.registration.scope).href;
  const request = new Request(url, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin'
  });
  const response = await fetchWithDeadline(request, {}, 10000);
  if (!response || !response.ok) throw new Error(`تعذر تخزين ملف التطبيق: ${asset}`);
  return { request, response };
}

async function installCompleteLocalShell() {
  const cache = await caches.open(APP_CACHE);
  const results = await Promise.allSettled(LOCAL_ASSETS.map(fetchLocalAsset));
  const stored = new Set();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    await cache.put(result.value.request, result.value.response);
    stored.add(new URL(result.value.request.url).pathname);
  }

  // لا نمنع تحديث عامل الخدمة بسبب صفحة اختيارية واحدة، لكن الملفات الحرجة
  // يجب أن تكون موجودة حتى لا يُفعّل إصدار ناقص يعلّق الدخول والتنقل.
  const critical = ['./index.html', './صفحة تسجيل الدخول.html', './لوحة التحكم.html', './cashtop-core.js', './cashtop-core.css', './turso-config.js', './turso-rtdb.js', './turso-sync.js', './offline.html'];
  const missingCritical = critical.filter(asset => !stored.has(new URL(asset, self.registration.scope).pathname));
  if (missingCritical.length) throw new Error(`حزمة الكاش الحرجة ناقصة: ${missingCritical.join(', ')}`);
  return { stored: stored.size, total: LOCAL_ASSETS.length };
}

async function cacheRemoteCssDependencies(cache, styleUrl, response) {
  if (!response || response.type === 'opaque' || !response.ok) return;
  const css = await response.clone().text();
  const urls = [...css.matchAll(/url\((['"]?)([^)'"\s]+)\1\)/g)]
    .map(match => match[2])
    .filter(Boolean)
    .filter(value => !value.startsWith('data:'))
    .map(value => new URL(value, styleUrl).href);
  await Promise.allSettled([...new Set(urls)].map(async assetUrl => {
    const req = new Request(assetUrl, { mode: 'cors', cache: 'reload' });
    const res = await fetchWithDeadline(req);
    await putIfUsable(cache, req, res);
  }));
}

async function warmRemoteStaticAssets() {
  const cache = await caches.open(REMOTE_STATIC_CACHE);
  await Promise.allSettled(REMOTE_STATIC_ASSETS.map(async url => {
    const lookupRequest = new Request(url, { mode: 'cors' });
    const existing = await cache.match(lookupRequest, { ignoreSearch: false });
    if (existing) return;
    const request = new Request(url, { mode: 'cors', cache: 'reload' });
    const response = await fetchWithDeadline(request, {}, 6000);
    await putIfUsable(cache, request, response);
    if (url.includes('fonts.googleapis.com') || url.endsWith('.css')) {
      await cacheRemoteCssDependencies(cache, url, response);
    }
  }));
}

async function refreshCompleteLocalShell() {
  const cache = await caches.open(APP_CACHE);
  const results = await Promise.allSettled(LOCAL_ASSETS.map(fetchLocalAsset));
  let updated = 0;
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    await cache.put(result.value.request, result.value.response);
    updated += 1;
  }
  return { updated, total: LOCAL_ASSETS.length, complete: updated === LOCAL_ASSETS.length };
}

async function verifyLocalShellOnce() {
  const cache = await caches.open(APP_CACHE);
  const missing = [];
  for (const asset of LOCAL_ASSETS) {
    const url = new URL(asset, self.registration.scope).href;
    const hit = await cache.match(url, { ignoreSearch: true });
    if (!hit) missing.push(asset);
  }
  if (!missing.length) return { complete: true, missing: [] };
  const results = await Promise.allSettled(missing.map(fetchLocalAsset));
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    await cache.put(result.value.request, result.value.response);
  }
  const remaining = [];
  for (const asset of missing) {
    const url = new URL(asset, self.registration.scope).href;
    if (!(await cache.match(url, { ignoreSearch: true }))) remaining.push(asset);
  }
  return { complete: remaining.length === 0, missing: remaining };
}

function ensureLocalShell() {
  if (!shellVerificationPromise) {
    shellVerificationPromise = verifyLocalShellOnce().catch(error => {
      shellVerificationPromise = null;
      throw error;
    });
  }
  return shellVerificationPromise;
}

function warmRemoteStaticAssetsOnce() {
  if (!remoteWarmPromise) {
    remoteWarmPromise = warmRemoteStaticAssets().catch(error => {
      remoteWarmPromise = null;
      throw error;
    });
  }
  return remoteWarmPromise;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // الصفحات والملفات المحلية أولاً حتى يصبح الإصدار الجديد جاهزاً بسرعة.
    await installCompleteLocalShell();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, REMOTE_STATIC_CACHE, NOTIFICATION_META_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(name => !keep.has(name)).map(name => caches.delete(name)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (_) {}
    }
    await self.clients.claim();
    // تأكد من اكتمال كاش التطبيق ثم سخّن مكتبات العرض في الخلفية.
    await ensureLocalShell().catch(() => null);
    warmRemoteStaticAssetsOnce().catch(() => null);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'CASHTOP_CACHE_READY', cache: APP_CACHE, version: CACHE_VERSION }));
  })());
});

function canonicalLocalRequest(request) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  return new Request(url.href, {
    method: 'GET',
    credentials: 'same-origin'
  });
}

async function refreshLocalCache(request, cache) {
  try {
    const timeout = request.mode === 'navigate' || request.destination === 'document' ? 6500 : 9000;
    const response = await fetchWithDeadline(request, { cache: 'no-store' }, timeout);
    if (response && response.ok) {
      // نحفظ دائماً تحت رابط ثابت بلا ?v= حتى تستبدل النسخة القديمة فعلياً.
      await cache.put(canonicalLocalRequest(request), response.clone());
    }
    return response;
  } catch (_) {
    return null;
  }
}

async function localCacheFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const cacheKey = canonicalLocalRequest(request);
  const cached = await cache.match(cacheKey);

  // اعرض النسخة المحلية فوراً حتى مع وجود الإنترنت.
  if (cached) return cached;

  const response = await refreshLocalCache(request, cache);
  if (response) return response;
  if (request.mode === 'navigate') {
    const scopeUrl = new URL(self.registration.scope);
    const requestedUrl = new URL(request.url);
    const isScopeRoot = requestedUrl.pathname.replace(/\/+$/, '') === scopeUrl.pathname.replace(/\/+$/, '');
    if (isScopeRoot) {
      const index = await cache.match(new URL('./index.html', self.registration.scope).href, { ignoreSearch: true });
      if (index) return index;
    }
    return (await cache.match(new URL('./offline.html', self.registration.scope).href, { ignoreSearch: true })) || Response.error();
  }
  return Response.error();
}

async function refreshCachedLocalInBackground(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(canonicalLocalRequest(request));
  if (!cached) return;
  await refreshLocalCache(request, cache);
}

async function remoteStaticCacheFirst(request) {
  const cache = await caches.open(REMOTE_STATIC_CACHE);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    return await putIfUsable(cache, request, response);
  } catch (_) {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;

  /* بيانات قاعدة البيانات والـ APIs الحية تمر مباشرة بلا أي كاش. */
  if (isLiveApiRequest(request, url)) return;

  if (url.origin === self.location.origin) {
    // Always return Cache Storage immediately, even while online. Network refresh
    // is throttled and happens after the response so it cannot delay navigation.
    event.respondWith(localCacheFirst(request));
    if (shouldRefreshLocalInBackground(request)) {
      event.waitUntil(refreshCachedLocalInBackground(request));
    }
    return;
  }

  if (isCacheableRemoteStatic(request, url)) {
    event.respondWith(remoteStaticCacheFirst(request));
  }
  /* الروابط الخارجية الأخرى، مثل WhatsApp، تمر إلى الشبكة كما هي. */
});

const NOTIFICATION_META_CACHE = 'cash-top-2-notification-meta-v2';
const NOTIFICATION_META_KEY = new URL('./__cashtop_notification_meta__', self.registration.scope).href;

async function saveNotificationMeta(payload) {
  const cache = await caches.open(NOTIFICATION_META_CACHE);
  await cache.put(NOTIFICATION_META_KEY, new Response(JSON.stringify(payload || {}), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

async function readNotificationMeta() {
  try {
    const cache = await caches.open(NOTIFICATION_META_CACHE);
    const response = await cache.match(NOTIFICATION_META_KEY);
    return response ? await response.json() : {};
  } catch (_) { return {}; }
}

async function displayLocalNotification(payload = {}) {
  const title = String(payload.title || 'كاش توب');
  return self.registration.showNotification(title, {
    body: String(payload.body || ''),
    icon: payload.icon || 'app-icon.png',
    badge: payload.badge || payload.icon || 'app-icon.png',
    image: payload.image || undefined,
    tag: payload.tag || `ct-${Date.now()}`,
    renotify: payload.renotify === true,
    data: { ...(payload.data || {}), url: payload.url || payload.data?.url || 'notifications.html' }
  });
}

// No remote-push listener is installed. This periodic handler only reuses a
// summary already cached by the open manager app and therefore costs zero Turso
// reads/writes. Browsers that do not support Periodic Background Sync ignore it.
self.addEventListener('periodicsync', event => {
  if (event.tag !== 'cashtop-daily-summary') return;
  event.waitUntil((async () => {
    const meta = await readNotificationMeta();
    const now = new Date();
    if (meta.enabled !== true || meta.dailySummaryEnabled === false || meta.role !== 'manager' || now.getHours() < 23) return;
    const summary = meta.summary || {};
    const today = now.toISOString().slice(0, 10);
    if (summary.dayKey !== today) return;
    const cache = await caches.open(NOTIFICATION_META_CACHE);
    const sentKey = new URL(`./__ct_daily_sent_${encodeURIComponent(meta.companyId || 'company')}_${today}`, self.registration.scope).href;
    if (await cache.match(sentKey)) return;
    await displayLocalNotification({
      title: 'مبيعات اليوم والأرباح',
      icon: meta.icon || 'app-icon.png',
      body: `المبيعات: ${Number(summary.sales || 0).toFixed(2)} ${summary.symbol || ''} — الأرباح: ${Number(summary.profit || 0).toFixed(2)} ${summary.symbol || ''} — عدد الفواتير: ${Number(summary.count || 0)}`,
      tag: `daily-profit-${meta.companyId || 'company'}-${today}`,
      url: 'التقارير.html'
    });
    await cache.put(sentKey, new Response('1'));
  })());
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(displayLocalNotification(data.payload || {}));
    return;
  }
  if (data.type === 'CASHTOP_NOTIFICATION_META') {
    event.waitUntil(saveNotificationMeta(data.payload || {}));
    return;
  }
  if (data === 'SKIP_WAITING' || data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (data.type === 'WARM_CACHE' || data.type === 'VERIFY_CACHE') {
    event.waitUntil((async () => {
      const result = await ensureLocalShell();
      const source = event.source;
      if (source && typeof source.postMessage === 'function') {
        source.postMessage({ type: 'CASHTOP_CACHE_STATUS', requestId: data.requestId || '', ...result, cache: APP_CACHE, version: CACHE_VERSION });
      }
      // لا نعيد تنزيل حزمة التطبيق كاملة عند فتح كل صفحة. كل تنقل محلي
      // يُخدم فوراً من Cache Storage حتى مع وجود الإنترنت، والتحديث الشبكي
      // المحدود يحدث بعد الاستجابة فقط كي لا ينافس فتح الصفحة أو الرسم.
      await warmRemoteStaticAssetsOnce();
    })());
    return;
  }
  if (data.type === 'REFRESH_CACHE') {
    event.waitUntil((async () => {
      const source = event.source;
      const refreshed = await refreshCompleteLocalShell().catch(() => ({ updated: 0, total: LOCAL_ASSETS.length, complete: false }));
      if (source && typeof source.postMessage === 'function') {
        source.postMessage({ type: 'CASHTOP_CACHE_REFRESHED', requestId: data.requestId || '', ...refreshed, cache: APP_CACHE, version: CACHE_VERSION });
      }
    })());
  }
});


self.addEventListener('notificationclick', event => {
  event.notification?.close?.();
  const target = String(event.notification?.data?.url || event.notification?.url || 'notifications.html');
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      try {
        const url = new URL(target, self.registration.scope).href;
        if (client.url === url && 'focus' in client) return client.focus();
      } catch (_) {}
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
