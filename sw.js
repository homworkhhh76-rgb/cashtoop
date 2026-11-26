const BUILD = '7.9.4.214-r40-receipt-layout';
const CACHE = 'oscar-accounting-' + BUILD;
const BASE = new URL('./', self.location.href);
const LOCAL = ["./type-ios.css", "./fonts/noto-arabic-bold.woff", "./fonts/noto-arabic-regular.woff", "./trial-direct.js", "./trial-cloud-config.js", "./ct-google-translate.js", "./ct-google-translate.css", "./accounting.js", "./accounting-windows10.css", "./accounting-icons.js", "./accounting-theme.css", "./accounting.html", "./admin.html", "./app-icon.png", "./windows10.css", "./windows10-dialogs.js", "./brand-logo.webp", "./customer-portal.js", "./customer.html", "./icon-192.png", "./index.html", "./manifest.webmanifest", "./notification-badge.png", "./offline-fonts.css", "./oscar-activation-runtime.js", "./oscar-ledger.html", "./p2p-bank-palestine.jpg", "./p2p-jawwal-pay.png", "./p2p-palpay.jpg", "./shared-17a3c04d5aba.jpg", "./support.html", "./trial-admin.html", "./trial-payment.html", "./معتمد.html"];
const allowed = new Set(LOCAL.map(path => new URL(path, BASE).href));
const indexURL = new URL('./index.html', BASE).href;
const readyURL = new URL('./__offline_ready', BASE).href;
const cleanUrl = url => {const out=new URL(url);out.search='';out.hash='';if(out.href===BASE.href)return indexURL;return out.href;};
const fontsURL = new URL('./offline-fonts.css', BASE).href;
const MAX_NETWORK_WAIT = 12000;
let shellRefresh;
let assetsWarmup;

function fetchWithDeadline(req, options = {}) {
  return fetch(req, {...options, signal:AbortSignal.timeout(MAX_NETWORK_WAIT)});
}

function refreshShell(cache) {
  if (!shellRefresh) {
    shellRefresh = (async () => {
      const response = await fetchWithDeadline(indexURL, {cache:'no-cache'});
      if (response.ok && !response.redirected &&
          response.headers.get('content-type')?.includes('text/html')) {
        await cache.put(indexURL, response);
      }
    })().catch(() => {}).finally(() => { shellRefresh = null; });
  }
  return shellRefresh;
}

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  // A slow first download can retry on the next navigation. Leave the previous
  // worker active unless we have a complete, usable shell.
  const response = await fetch(indexURL, {cache:'no-cache'});
  if (!response.ok || response.redirected ||
      !response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Offline index not reachable: '+indexURL);
  }
  await cache.put(indexURL, response);
  await self.skipWaiting();
})()));

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function warmAssets() {
  const cache = await caches.open(CACHE);
  if (await cache.match(readyURL)) return;
  const remaining = [...allowed].filter(url => url !== indexURL);
  let complete = true;
  async function downloadOptional() {
    while (remaining.length) {
      const url = remaining.shift();
      try {
        if (await cache.match(url)) continue;
        const response = await fetchWithDeadline(url);
        if (!response.ok || response.redirected) {
          complete = false;
          continue;
        }
        await cache.put(url, response);
      } catch (_) {
        complete = false;
      }
    }
  }
  await Promise.all(Array.from({length:2}, downloadOptional));
  if (complete) {
    await cache.put(readyURL, new Response(BUILD));
    const keys = await caches.keys();
    // Keep fallback assets from the preceding version while this cache fills.
    await Promise.all(keys.filter(key => key.startsWith('oscar-accounting-') &&
      key !== CACHE).map(key => caches.delete(key)));
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const key = cleanUrl(url.href);
  if (!allowed.has(key)) return;

  const cachePromise = caches.open(CACHE);
  if (key === indexURL && req.mode === 'navigate') {
    const cached = cachePromise.then(cache => cache.match(indexURL));
    event.respondWith(cached.then(hit => hit || fetch(req)));
    event.waitUntil(Promise.all([cachePromise, cached]).then(([cache, hit]) =>
      hit ? refreshShell(cache) : undefined));
    return;
  }

  event.respondWith((async () => {
    const cache = await cachePromise;
    const hit = await cache.match(key);
    const preferFresh = key !== fontsURL &&
      (req.mode === 'navigate' || /\.(?:js|css|webmanifest|html)$/.test(url.pathname));
    if (hit && !preferFresh) return hit;
    const fallback = hit || await caches.match(key);
    try {
      const response = fallback ? await fetchWithDeadline(req) : await fetch(req);
      if (response.ok && !response.redirected) {
        // Cache writes must complete without delaying the browser's response.
        event.waitUntil(cache.put(key, response.clone()).catch(() => {}));
      }
      return !response.ok && fallback ? fallback : response;
    } catch (error) {
      if (fallback) return fallback;
      throw error;
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'CT_PRECACHE_ASSETS') {
    if (!assetsWarmup) assetsWarmup = warmAssets().catch(() => {}).finally(() => { assetsWarmup = null; });
    event.waitUntil(assetsWarmup);
  }
  if (event.data?.type === 'CT_OFFLINE_STATUS') event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const complete = !!(await cache.match(readyURL));
    event.ports[0]?.postMessage({ready:complete,build:BUILD});
  })());
});

// Persistent Web Push settings survive service worker upgrades.
const CT_NOTIFY_CACHE='ct-notifications-config-v1';
async function ctNotificationConfig(value){const cache=await caches.open(CT_NOTIFY_CACHE),key=new URL('./__notification_config',self.registration.scope);if(value){await cache.put(key,new Response(JSON.stringify(value)));return value;}try{return await (await cache.match(key)).json();}catch{return null;}}
let ctNotificationSerial=Promise.resolve();
function ctNotifyOrdered(fn){const job=ctNotificationSerial.then(fn);ctNotificationSerial=job.catch(()=>{});return job;}
async function ctShowNotification(d){
 if(!d)return;const cfg=await ctNotificationConfig();if(!cfg?.enabled||cfg.tenant!==d.tenant||cfg.types[d.type]===false||!Number.isFinite(d.createdAt)||d.createdAt<Number(cfg.since||Infinity))return;
 const cache=await caches.open('ct-notifications-seen-v1');const key=new URL('./__notification_seen/'+encodeURIComponent(d.tenant)+':'+encodeURIComponent(d.id),self.registration.scope);
 if(await cache.match(key))return;
 await self.registration.showNotification(String(d.title||'كاش توب').slice(0,120),{body:String(d.body||'').slice(0,500),icon:new URL('./icon-192.png',self.registration.scope).href,badge:new URL('./notification-badge.png',self.registration.scope).href,lang:'ar',dir:'rtl',tag:String(d.id||'ct-notification'),data:{tab:d.tab,tenant:d.tenant,recordId:d.recordId,storeName:d.storeName}});
 await cache.put(key,new Response(String(Date.now())));const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-2000)))await cache.delete(old);
}
self.addEventListener('message',event=>{if(event.data?.type==='CT_NOTIFICATION_CONFIG')event.waitUntil(ctNotifyOrdered(()=>ctNotificationConfig({tenant:event.data.tenant,enabled:!!event.data.enabled,types:event.data.types||{},since:Number(event.data.since)||Date.now()})));else if(event.data?.type==='CT_SHOW_NOTIFICATION')event.waitUntil(ctNotifyOrdered(()=>ctShowNotification(event.data.notification)));});
self.addEventListener('push',event=>{let d;try{d=event.data?.json();}catch{return;}event.waitUntil(ctNotifyOrdered(()=>ctShowNotification(d)));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const d=event.notification.data||{},list=await clients.matchAll({type:'window',includeUncontrolled:true});const scope=new URL(self.registration.scope);for(const client of list){if(client.url.startsWith(scope.href)){await client.focus();client.postMessage({type:'CT_NOTIFICATION_OPEN',tab:d.tab,tenant:d.tenant,recordId:d.recordId,storeName:d.storeName});return;}}const url=new URL('./index.html',scope);url.searchParams.set('notificationTab',String(d.tab||'settings'));url.searchParams.set('notificationTenant',String(d.tenant||''));if(d.recordId)url.searchParams.set('notificationRecord',String(d.recordId));if(d.storeName)url.searchParams.set('notificationStore',String(d.storeName));await clients.openWindow(url.href);})());});
