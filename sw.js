const BUILD = '7.9.4.196-r22-mobile-count-compact';
const CACHE = 'oscar-accounting-' + BUILD;
const BASE = new URL('./', self.location.href);
const LOCAL = ["./ct-google-translate.js", "./ct-google-translate.css", "./cash-top-header-logo.jpg", "./altamam-pro-logo.png", "./branches.css", "./accounting.js", "./accounting-windows10.css", "./accounting-icons.js", "./accounting-theme.css", "./accounting.css", "./accounting.html", "./admin.html", "./app-icon.png", "./app.css", "./windows10.css", "./windows10-dialogs.js", "./brand-logo.webp", "./customer-portal.js", "./customer.html", "./icon-192.png", "./icon-maskable-512.png", "./index.html", "./manifest.webmanifest", "./notification-badge.png", "./offline-fonts.css", "./oscar-activation-runtime.js", "./oscar-cloud-sync.js", "./oscar-ledger.html", "./p2p-bank-palestine.jpg", "./p2p-jawwal-pay.png", "./p2p-palpay.jpg", "./shared-17a3c04d5aba.jpg", "./shared-c50d51a1a3c0.jpg", "./support.html", "./trial-admin.html", "./trial-payment.html", "./معتمد.html"];
const allowed = new Set(LOCAL.map(path => new URL(path, BASE).href));
const indexURL = new URL('./index.html', BASE).href;
const readyURL = new URL('./__offline_ready', BASE).href;
const cleanUrl = url => {const out=new URL(url);out.search='';out.hash='';if(out.href===BASE.href)return indexURL;return out.href;};
async function fetchFresh(req){
  return fetch(req,{cache:'no-store'});
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache=await caches.open(CACHE);
  // index.html includes the app logic and styles; other files are optional for boot.
  // Only the index is required for activating the new worker.
  const indexResponse=await fetchFresh(indexURL);
  if(!indexResponse.ok)throw new Error('Offline index not reachable: '+indexURL);
  await cache.put(indexURL,indexResponse.clone());
  const extras=LOCAL.filter(path=>path!=='./index.html');
  let n=0;
  async function downloadOptional(){
    while(n<extras.length){
      const url=new URL(extras[n++],BASE).href;
      try{
        const r=await fetchFresh(url);
        if(r.ok && !r.redirected && new URL(r.url).origin===BASE.origin){await cache.put(url,r.clone());}
      }catch(error){/* optional resources never prevent installing a working shell */}
    }
  }
  await Promise.all(Array.from({length:4},downloadOptional));
  await cache.put(readyURL,new Response(BUILD));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async()=>{
  // Remove outdated static shell versions only; never touch IndexedDB or unrelated caches.
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('oscar-accounting-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==BASE.origin || !url.pathname.startsWith(BASE.pathname))return;
  const key=cleanUrl(url.href);
  if(!allowed.has(key))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const preferFresh=req.mode==='navigate' || key===indexURL || /\.(?:js|css|webmanifest|html)$/.test(new URL(key).pathname);
    if(preferFresh){
      try{
        const res=await fetchFresh(req);
        if(res.ok && !res.redirected){await cache.put(key,res.clone());return res;}
      }catch(_){}
      const hit=await cache.match(key);
      if(hit)return hit;
      return fetch(req);
    }
    const hit=await cache.match(key);
    if(hit)return hit;
    const response=await fetch(req);
    if(response.ok && !response.redirected)await cache.put(key,response.clone());
    return response;
  })());
});
self.addEventListener('message',event=>{
  if(event.data==='SKIP_WAITING')event.waitUntil(self.skipWaiting());
  if(event.data?.type==='CT_OFFLINE_STATUS')event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const complete=!!(await cache.match(readyURL));
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
