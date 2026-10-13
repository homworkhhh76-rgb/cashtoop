const BUILD='7.9.4.161-fresh-notifications';
const CACHE=`oscar-accounting-${BUILD}`;
const RUNTIME_CACHE=`oscar-accounting-runtime-${BUILD}`;
const LOCAL=["./admin.html", "./app-icon.png", "./app.css", "./brand-logo.png", "./customer-portal.js?v=7.9.4.161-fresh-notifications", "./customer.html", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./icon.svg", "./index.html", "./ledger-assets/download-icon.png", "./main.js?v=7.9.4.161-fresh-notifications", "./manifest.webmanifest", "./notification-badge.png", "./oscar-activation-runtime.js?v=7.9.4.161-fresh-notifications", "./oscar-cloud-sync.js?v=7.9.4.161-fresh-notifications", "./oscar-ledger.html", "./p2p-bank-palestine.jpg", "./p2p-jawwal-pay.png", "./p2p-palpay.jpg", "./support.html", "./trial-admin.html", "./trial-payment.html", "./معتمد.html"];
const REMOTE=[
  'https://esm.sh/react@19.3.0',
  'https://esm.sh/react-dom@19.3.0?external=react',
  'https://esm.sh/react-dom@19.3.0/client?external=react',
  'https://esm.sh/react@19.3.0/jsx-runtime',
  'https://esm.sh/lucide-react@0.546.0?external=react',
  'https://esm.sh/jsbarcode@3.12.3',
  'https://esm.sh/xlsx@0.18.5',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@200;300;400;500;600;700;800;900&display=swap',
  // دفتر كاش توب يعتمد على هذه الملفات؛ تخزينها بعد أول فتح يمنع شاشة فارغة عند انقطاع الإنترنت.
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];
const cacheable=r=>!!r&&(r.ok||r.type==='opaque');
async function putFresh(cache,url){try{const req=new Request(url,{cache:'no-cache',mode:url.startsWith('http')?'cors':'same-origin'});const r=await fetch(req);if(cacheable(r))await cache.put(url,r.clone())}catch(_){} }

async function cacheRemoteTree(cache,url,seen=new Set(),depth=0){
  if(depth>5||seen.has(url))return;seen.add(url);
  try{
    const r=await fetch(new Request(url,{cache:'no-cache',mode:'cors'}));
    if(!cacheable(r))return;
    await cache.put(url,r.clone());
    const type=(r.headers.get('content-type')||'').toLowerCase();
    if(!(type.includes('javascript')||type.includes('ecmascript')||type.includes('css')))return;
    const text=await r.clone().text();
    const deps=new Set();
    if(type.includes('css')){
      for(const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)){const spec=m[1];if(spec&& !spec.startsWith('data:'))deps.add(new URL(spec,url).href)}
    }else{
      for(const m of text.matchAll(/(?:from\s*|import\s*\(?)['"]([^'"]+)['"]/g)){const spec=m[1];if(spec&&(spec.startsWith('/')||spec.startsWith('./')||spec.startsWith('../')||/^https?:/.test(spec)))deps.add(new URL(spec,url).href)}
    }
    await Promise.allSettled([...deps].map(dep=>cacheRemoteTree(cache,dep,seen,depth+1)));
  }catch(_){}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.allSettled(LOCAL.map(u=>putFresh(cache,u)));
  const runtime=await caches.open(RUNTIME_CACHE);
  await Promise.allSettled(REMOTE.map(u=>cacheRemoteTree(runtime,u)));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Keep the previous Oscar caches as an offline safety net. Old builds used to
  // delete them during every update, which could leave the app unable to open
  // when the network disappeared before the new dependency tree finished caching.
  await self.clients.claim();
})()));
async function update(cache,request){try{const fresh=await fetch(new Request(request,{cache:'no-cache'}));if(cacheable(fresh))await cache.put(request,fresh.clone());return fresh}catch(_){return null}}
async function matchPreviousOscarCache(request,{runtime=false,ignoreSearch=false}={}){
  try{
    const keys=(await caches.keys()).filter((key)=>runtime
      ? key.startsWith('oscar-accounting-runtime-')
      : key.startsWith('oscar-accounting-')&&!key.startsWith('oscar-accounting-runtime-'));
    for(let i=keys.length-1;i>=0;i--){
      const key=keys[i];
      if(key===(runtime?RUNTIME_CACHE:CACHE))continue;
      const oldCache=await caches.open(key);
      const hit=await oldCache.match(request,{ignoreSearch});
      if(hit)return hit;
    }
  }catch(_){}
  return null;
}
async function sameOriginResponse(request,event){
  const cache=await caches.open(CACHE);
  // Prefer an exact versioned hit. If this build has not been cached yet, try the
  // network once so an old ignoreSearch entry cannot pin the app to stale code.
  const exact=await cache.match(request);
  if(exact)return exact;
  const fallback=await cache.match(request,{ignoreSearch:true});
  const fresh=await update(cache,request);if(fresh)return fresh;
  // Offline safety: when the new build has never been fetched, an older local
  // copy is still better than a blank screen. The next online launch refreshes it.
  if(fallback)return fallback;
  const previous=await matchPreviousOscarCache(request,{ignoreSearch:true});
  if(previous)return previous;
  if(request.mode==='navigate'){
    const localIndex=await cache.match('./index.html',{ignoreSearch:true});
    if(localIndex)return localIndex;
    const oldIndex=await matchPreviousOscarCache(new Request(new URL('./index.html',self.location.href)),{ignoreSearch:true});
    if(oldIndex)return oldIndex;
    return Response.error();
  }
  return new Response('',{status:503,statusText:'Offline'});
}
async function externalResponse(request,event){
  const cache=await caches.open(RUNTIME_CACHE);
  const cached=await cache.match(request);
  if(cached)return cached;
  const fresh=await update(cache,request);if(fresh)return fresh;
  const previous=await matchPreviousOscarCache(request,{runtime:true,ignoreSearch:false});
  if(previous)return previous;
  return new Response('',{status:503,statusText:'Offline'});
}
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin===self.location.origin&&url.pathname.startsWith('/api/'))return;
  event.respondWith(url.origin===self.location.origin?sameOriginResponse(request,event):externalResponse(request,event));
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});

// Persistent Web Push settings survive service worker upgrades.
const CT_NOTIFY_CACHE='ct-notifications-config-v1';
async function ctNotificationConfig(value){const cache=await caches.open(CT_NOTIFY_CACHE),key=new URL('./__notification_config',self.registration.scope);if(value){await cache.put(key,new Response(JSON.stringify(value)));return value;}try{return await (await cache.match(key)).json();}catch{return null;}}
let ctNotificationSerial=Promise.resolve();
function ctNotifyOrdered(fn){const job=ctNotificationSerial.then(fn);ctNotificationSerial=job.catch(()=>{});return job;}
async function ctShowNotification(d){
 if(!d)return;const cfg=await ctNotificationConfig();if(!cfg?.enabled||cfg.tenant!==d.tenant||cfg.types[d.type]===false||!Number.isFinite(d.createdAt)||d.createdAt<Number(cfg.since||Infinity))return;
 const cache=await caches.open('ct-notifications-seen-v1');const key=new URL('./__notification_seen/'+encodeURIComponent(d.tenant)+':'+encodeURIComponent(d.id),self.registration.scope);
 if(await cache.match(key))return;
 await self.registration.showNotification(String(d.title||'كاش توب 3').slice(0,120),{body:String(d.body||'').slice(0,500),icon:new URL('./icon-192.png',self.registration.scope).href,badge:new URL('./notification-badge.png',self.registration.scope).href,lang:'ar',dir:'rtl',tag:String(d.id||'ct-notification'),data:{tab:d.tab,tenant:d.tenant,recordId:d.recordId,storeName:d.storeName}});
 await cache.put(key,new Response(String(Date.now())));const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-2000)))await cache.delete(old);
}
self.addEventListener('message',event=>{if(event.data?.type==='CT_NOTIFICATION_CONFIG')event.waitUntil(ctNotifyOrdered(()=>ctNotificationConfig({tenant:event.data.tenant,enabled:!!event.data.enabled,types:event.data.types||{},since:Number(event.data.since)||Date.now()})));else if(event.data?.type==='CT_SHOW_NOTIFICATION')event.waitUntil(ctNotifyOrdered(()=>ctShowNotification(event.data.notification)));});
self.addEventListener('push',event=>{let d;try{d=event.data?.json();}catch{return;}event.waitUntil(ctNotifyOrdered(()=>ctShowNotification(d)));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const d=event.notification.data||{},list=await clients.matchAll({type:'window',includeUncontrolled:true});const scope=new URL(self.registration.scope);for(const client of list){if(client.url.startsWith(scope.href)){await client.focus();client.postMessage({type:'CT_NOTIFICATION_OPEN',tab:d.tab,tenant:d.tenant,recordId:d.recordId,storeName:d.storeName});return;}}const url=new URL('./index.html',scope);url.searchParams.set('notificationTab',String(d.tab||'settings'));url.searchParams.set('notificationTenant',String(d.tenant||''));if(d.recordId)url.searchParams.set('notificationRecord',String(d.recordId));if(d.storeName)url.searchParams.set('notificationStore',String(d.storeName));await clients.openWindow(url.href);})());});
