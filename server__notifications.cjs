// Web Push backend. npm install; state and VAPID keys stay outside the public tree.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
module.exports=function createNotifications({dataDir,readBody,sendJson}){
 let webPush;try{webPush=require('web-push')}catch{}
 const file=path.join(dataDir,'web-push-private.json');let state={channels:{},keys:null};
 try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 const persist=()=>{const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(state),{mode:0o600});fs.renameSync(temp,file);};
 if(webPush){if(!state.keys){state.keys=webPush.generateVAPIDKeys();persist();}webPush.setVapidDetails(process.env.VAPID_SUBJECT||'https://www.cashtoop.com',state.keys.publicKey,state.keys.privateKey);}
 const endpointAllowed=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.windows.com'].includes(u.hostname)||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}};
 const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
 const preferences=p=>({enabled:!!p?.enabled,types:Object.fromEntries(Object.entries(p?.types||{}).filter(([k,v])=>/^[a-z_]{1,40}$/.test(k)&&typeof v==='boolean')),reminderDays:[1,3,7,30].includes(Number(p?.reminderDays))?Number(p.reminderDays):1,lastBackup:Math.min(Date.now(),Math.max(0,Number(p?.lastBackup)||Date.now()))});
 const rates=new Map();function rate(key){const now=Date.now(),r=rates.get(key)||{at:now,n:0};if(now-r.at>60000){r.at=now;r.n=0;}r.n++;rates.set(key,r);return r.n<180;}
 async function deliver(channel,event,exclude){let sent=0;for(const [id,s] of Object.entries(channel.subscriptions)){if(id===exclude||!s.preferences.enabled||s.preferences.types[event.type]===false)continue;try{await webPush.sendNotification(s.subscription,JSON.stringify({...event,tenant:channel.tenant}),{TTL:86400,urgency:event.type==='backup'?'normal':'high',timeout:10000});sent++;}catch(e){if(e.statusCode===404||e.statusCode===410)delete channel.subscriptions[id];else {channel.pending=channel.pending||{};channel.pending[digest(id+'|'+event.id)]={deviceId:id,event,createdAt:Date.now()};}}}return sent;}
 let serial=Promise.resolve();const ordered=fn=>{const job=serial.then(fn);serial=job.catch(()=>{});return job;};
 const route=async(req,res,origin)=>{
  if(req.method!=='POST')return sendJson(res,405,{error:'POST فقط'},origin);
  if(origin){try{if(new URL(origin).host!==req.headers.host)return sendJson(res,403,{error:'نطاق غير مسموح'},'');}catch{return sendJson(res,403,{error:'نطاق غير صالح'},'');}}
  const token=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))return sendJson(res,401,{error:'يلزم تسجيل دخول الشركة'},origin);
  const id=digest(token);if(!rate(id))return sendJson(res,429,{error:'محاولات كثيرة، حاول لاحقاً'},origin);
  if(!webPush)return sendJson(res,503,{error:'ثبّت اعتماد web-push على الخادم بالأمر npm install ثم أعد التشغيل'},origin);
  let b;try{b=await readBody(req);}catch{return sendJson(res,400,{error:'طلب غير صالح'},origin);}
  return ordered(async()=>{try{
   if(b.action==='config')return sendJson(res,200,{publicKey:state.keys.publicKey},origin);
   const ch=state.channels[id]||(state.channels[id]={tenant:'',subscriptions:{},seen:{}});
   if(b.action==='subscribe'){
    const sub=b.subscription;if(!endpointAllowed(sub?.endpoint)||!sub?.keys?.p256dh||!sub?.keys?.auth||String(sub.keys.p256dh).length>200||String(sub.keys.auth).length>100||!/^[\w-]{10,80}$/.test(b.deviceId||''))return sendJson(res,400,{error:'اشتراك إشعارات غير صالح'},origin);
    if(!b.tenant||String(b.tenant).length>200)return sendJson(res,400,{error:'معرف الشركة مطلوب'},origin);
    if(ch.tenant&&ch.tenant!==b.tenant)return sendJson(res,403,{error:'الشركة غير مطابقة'},origin);ch.tenant=b.tenant;
    // A browser endpoint belongs to the currently selected company only.
    const previous=ch.subscriptions[b.deviceId];
    for(const other of Object.values(state.channels))for(const [key,s] of Object.entries(other.subscriptions))if(s.subscription.endpoint===sub.endpoint)delete other.subscriptions[key];
    if(Object.keys(ch.subscriptions).length>=100)return sendJson(res,409,{error:'تم بلوغ حد الأجهزة'},origin);
    ch.subscriptions[b.deviceId]={subscription:sub,preferences:{...preferences(b.preferences),lastBackup:Math.max(preferences(b.preferences).lastBackup,previous?.preferences?.lastBackup||0)},remindedAt:previous?.remindedAt||0};persist();return sendJson(res,200,{ok:true},origin);
   }
   if(b.action==='publish'){
    const e=b.event;if(!e||typeof e.id!=='string'||e.id.length>500||!/^[a-z_]{1,40}$/.test(e.type||'')||!Number.isFinite(e.createdAt)||e.createdAt<Date.now()-86400000*2||e.createdAt>Date.now()+300000)return sendJson(res,400,{error:'حدث غير صالح'},origin);
    if(ch.seen[e.id])return sendJson(res,200,{ok:true,duplicate:true},origin);
    if(ch.tenant&&ch.tenant!==e.tenant)return sendJson(res,403,{error:'الشركة غير مطابقة'},origin);ch.tenant=String(e.tenant||'');
    const event={id:e.id,type:e.type,title:String(e.title||'كاش توب 3').slice(0,120),body:String(e.body||'').slice(0,500),tab:String(e.tab||'dashboard').replace(/[^a-z_-]/g,'').slice(0,40)};
    ch.seen[e.id]=Date.now();for(const [key,at]of Object.entries(ch.seen))if(Date.now()-at>172800000)delete ch.seen[key];persist();const sent=await deliver(ch,event,b.deviceId);persist();return sendJson(res,200,{ok:true,sent},origin);
   }
   if(b.action==='backup'){for(const s of Object.values(ch.subscriptions)){s.preferences.lastBackup=Date.now();s.remindedAt=0;}persist();return sendJson(res,200,{ok:true},origin);}
   return sendJson(res,400,{error:'عملية غير معروفة'},origin);
  }catch{sendJson(res,500,{error:'تعذر حفظ إعدادات الإشعارات'},origin);}});
 };
 let ticking=false;const timer=setInterval(()=>{if(!webPush||ticking)return;ticking=true;ordered(async()=>{try{const now=Date.now();for(const ch of Object.values(state.channels)){for(const [key,job] of Object.entries(ch.pending||{})){const target=ch.subscriptions[job.deviceId];if(!target||!target.preferences.enabled||target.preferences.types[job.event.type]===false||now-job.createdAt>86400000){delete ch.pending[key];continue;}try{await webPush.sendNotification(target.subscription,JSON.stringify({...job.event,tenant:ch.tenant}),{TTL:86400,timeout:10000});delete ch.pending[key];}catch(e){if(e.statusCode===410||e.statusCode===404){delete ch.subscriptions[job.deviceId];delete ch.pending[key];}}}for(const [id,s]of Object.entries(ch.subscriptions)){const p=s.preferences;if(!p.enabled||p.types.backup===false||now-p.lastBackup<p.reminderDays*86400000||now-(s.remindedAt||0)<86400000)continue;try{await webPush.sendNotification(s.subscription,JSON.stringify({id:'backup:'+Math.floor(now/86400000),type:'backup',tenant:ch.tenant,title:'حان وقت النسخ الاحتياطي',body:'لم تسجل نسخة احتياطية خلال المدة المحددة. افتح الإعدادات لحفظ نسخة من بياناتك.',tab:'settings'}),{TTL:86400,timeout:10000});s.remindedAt=now;}catch(e){if(e.statusCode===410||e.statusCode===404)delete ch.subscriptions[id];}}}persist();for(const[k,r]of rates)if(now-r.at>60000)rates.delete(k);}finally{ticking=false;}}).catch(()=>{ticking=false;});},60000);timer.unref();
 return {route,close:()=>clearInterval(timer)};
};
