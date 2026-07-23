(function(){
'use strict';
const $=id=>document.getElementById(id);
const cfg=window.CASHTOP_FIREBASE?.config||{};
const base=String(cfg.databaseURL||'').replace(/\/+$/,'');
const isMongoProxy=['mongodb-http-api','mongodb-rtdb-api'].includes(window.CASHTOP_FIREBASE?.backendMode)||/\/api\/rtdb(?:$|\?)/i.test(base);
function transportUrl(url){if(!isMongoProxy)return url;const raw=String(url||'');if(!raw.startsWith(base))return raw;let suffix=raw.slice(base.length).replace(/^\/+/,'');const q=suffix.indexOf('?');const pathPart=(q>=0?suffix.slice(0,q):suffix).replace(/\.json$/i,'');return `${base}?path=${encodeURIComponent(pathPart)}`}
const adminRoot=String(window.CASHTOP_FIREBASE?.adminRootPath||'cashTopExchange/cashTopAdmin').replace(/^\/+|\/+$/g,'');
const companyRoot=String(window.CASHTOP_FIREBASE?.rootPath||'cashTopExchange/cashTopPOS').replace(/^\/+|\/+$/g,'');
const LOCAL_KEY='cashtop_admin_index_v15';
const LEGACY_LOCAL_KEY='cashtop_admin_index_v14';
const SESSION_KEY='cashtop_superadmin_session';
let state={superAdmin:null,companies:{},keyIndex:{},retiredKeys:{},updatedAt:0};
let preparedBackup=null;
let editingKey='';
const parse=(v,f)=>{try{return JSON.parse(v)??f}catch(_){return f}};
const rawGet=k=>Storage.prototype.getItem.call(localStorage,k);
const rawSet=(k,v)=>Storage.prototype.setItem.call(localStorage,k,String(v));
const normalizeKey=v=>String(v||'').trim().toUpperCase();
function decodeStoredValue(value,fallback=null){
 let parsed=value;
 for(let i=0;i<3&&typeof parsed==='string';i+=1){const decoded=parse(parsed,null);if(decoded===null)break;parsed=decoded}
 if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.prototype.hasOwnProperty.call(parsed,'value')&&(parsed.valueEncoding||Object.prototype.hasOwnProperty.call(parsed,'deleted')||Object.prototype.hasOwnProperty.call(parsed,'updatedAt'))){
  if(parsed.deleted===true)return fallback;
  return decodeStoredValue(parsed.value,fallback);
 }
 return parsed==null?fallback:parsed;
}
function normalizeRecordArray(value,signatureKeys=[]){
 const parsed=decodeStoredValue(value,[]);
 if(Array.isArray(parsed))return parsed.filter(item=>item&&typeof item==='object'&&!Array.isArray(item));
 if(parsed&&typeof parsed==='object'){
  if(signatureKeys.some(key=>Object.prototype.hasOwnProperty.call(parsed,key)))return [parsed];
  return Object.entries(parsed).map(([key,item])=>{
   const decoded=decodeStoredValue(item,null);
   if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))return null;
   return decoded.id==null&&!/^\d+$/.test(key)?{...decoded,id:key}:decoded;
  }).filter(Boolean);
 }
 return [];
}
function normalizePlainObject(value){const parsed=decodeStoredValue(value,{});return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}
const safeSeg=v=>String(v||'').trim().replace(/[.#$\[\]\/]/g,'_');
function status(message,type='info'){const box=$('authStatus');if(!box)return;box.className=`status show ${type}`;box.textContent=message}
function toast(message,type='success'){
 let host=document.getElementById('adminToastHost');if(!host){host=document.createElement('div');host.id='adminToastHost';host.style.cssText='position:fixed;bottom:18px;right:18px;z-index:9999;display:grid;gap:8px;max-width:min(380px,calc(100vw - 36px))';document.body.appendChild(host)}
 const el=document.createElement('div');el.textContent=message;el.style.cssText=`padding:11px 14px;border-radius:8px;color:#fff;font:700 11px Cairo;box-shadow:0 8px 25px rgba(0,0,0,.18);background:${type==='error'?'#dd4b39':type==='warning'?'#f39c12':'#00a65a'}`;host.appendChild(el);setTimeout(()=>el.remove(),3600)
}
async function hashPassword(password,salt){const data=new TextEncoder().encode(`${salt}:${password}`);const digest=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function makeSalt(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}_${Math.random()}`}
let adminDatabaseToken='';
async function getAdminDatabaseToken(){if(isMongoProxy)return '';if(adminDatabaseToken)return adminDatabaseToken;if(!cfg.apiKey)return '';const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(cfg.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json;charset=UTF-8'},body:JSON.stringify({returnSecureToken:true}),cache:'no-store'});if(!response.ok)return '';const data=await response.json().catch(()=>({}));adminDatabaseToken=data.idToken||'';return adminDatabaseToken}
function authUrl(url,token){return token?`${url}${url.includes('?')?'&':'?'}auth=${encodeURIComponent(token)}`:url}
async function request(url,options={},timeout=18000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const target=transportUrl(url);let sendOptions={...options,signal:controller.signal,cache:'no-store'};if(isMongoProxy&&sendOptions.headers){const h=new Headers(sendOptions.headers);['cache-control','pragma','x-firebase-etag','if-match'].forEach(n=>h.delete(n));sendOptions={...sendOptions,headers:h}}if(isMongoProxy&&String(sendOptions.method||'GET').toUpperCase()==='PATCH'){const currentRes=await fetch(target,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}});const current=currentRes.ok?await currentRes.json().catch(()=>({})):{};const patch=parse(sendOptions.body,{});sendOptions={...sendOptions,method:'PUT',body:JSON.stringify({...((current&&typeof current==='object')?current:{}),...patch})}}let response=await fetch(target,sendOptions);if(!isMongoProxy&&!response.ok&&(response.status===401||response.status===403)){const token=await getAdminDatabaseToken().catch(()=>'');if(token)response=await fetch(authUrl(target,token),sendOptions)}if(!response.ok){const p=await response.json().catch(()=>null);throw new Error(String(p?.error?.message||p?.error||`Database API ${response.status}`))}return response}finally{clearTimeout(timer)}}
function adminUrl(path=''){return `${base}/${adminRoot}${path?'/'+path:''}.json`}
function companyUrl(companyId){return `${base}/${companyRoot}/${safeSeg(companyId)}.json`}function companyDatasetUrl(companyId,key){return `${base}/${companyRoot}/${safeSeg(companyId)}/datasets/${safeSeg(key)}.json`}function companyMetaUrl(companyId){return `${base}/${companyRoot}/${safeSeg(companyId)}/meta.json`}
async function loadRemote(){if(!base)return null;try{const r=await request(adminUrl());return await r.json()}catch(e){console.warn('[ADMIN] load remote',e);return null}}
function loadLocal(){return parse(rawGet(LOCAL_KEY),null)||parse(rawGet(LEGACY_LOCAL_KEY),null)}
function normalizeState(value){const s=value&&typeof value==='object'?value:{};const companies=s.companies&&typeof s.companies==='object'?s.companies:{};const keyIndex=s.keyIndex&&typeof s.keyIndex==='object'?s.keyIndex:{};const retiredKeys=s.retiredKeys&&typeof s.retiredKeys==='object'?s.retiredKeys:{};Object.values(companies).forEach(c=>{c.backupImportEnabled=c.backupImportEnabled===true;c.tenantId=String(c.tenantId||c.companyId||`TENANT_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);c.companyId=c.tenantId;if(c.key){const seg=safeSeg(normalizeKey(c.key));if(c.deleted===true||c.status==='deleted')retiredKeys[seg]={tenantId:c.tenantId,companyId:c.tenantId,key:normalizeKey(c.key),deletedAt:c.updatedAt||Date.now()};else keyIndex[seg]={...(keyIndex[seg]||{}),tenantId:c.tenantId,companyId:c.tenantId,key:normalizeKey(c.key)}}});return {superAdmin:s.superAdmin||null,companies,keyIndex,retiredKeys,updatedAt:Number(s.updatedAt||0)}}
async function saveState(){state.updatedAt=Date.now();rawSet(LOCAL_KEY,JSON.stringify(state));if(base){try{await request(adminUrl(),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});$('syncMode').textContent='MongoDB متزامن + تخزين محلي'}catch(e){$('syncMode').textContent='محلي — تعذر MongoDB API';toast(`حُفظ محلياً، وتعذرت مزامنة الإدارة مع MongoDB API: ${e.message}`,'warning')}}}
function sessionValid(){const s=parse(rawGet(SESSION_KEY),null);return Boolean(s&&s.expiresAt>Date.now())}
function showApp(){$('authView').classList.add('hidden');$('appView').classList.remove('hidden');render()}
function setupAuthView(){const first=!state.superAdmin;$('confirmField').classList.toggle('hidden',!first);$('authSubtitle').textContent=first?'إنشاء أول حساب للمشرف العام':'دخول المشرف العام';$('authButton').innerHTML=first?'<i class="fa-solid fa-user-shield"></i> إنشاء حساب الإدارة':'<i class="fa-solid fa-shield-halved"></i> دخول الإدارة'}
async function handleAuth(e){e.preventDefault();const username=$('superUsername').value.trim(),password=$('superPassword').value;if(!state.superAdmin){const confirm=$('superPasswordConfirm').value;if(password!==confirm)return status('كلمتا المرور غير متطابقتين.','error');if(password.length<6)return status('كلمة المرور يجب أن تكون 6 أحرف على الأقل.','error');const salt=makeSalt();state.superAdmin={username,passwordHash:await hashPassword(password,salt),salt,createdAt:new Date().toISOString(),authVersion:Date.now()};await saveState();rawSet(SESSION_KEY,JSON.stringify({username,expiresAt:Date.now()+8*60*60*1000}));showApp();return}const expected=await hashPassword(password,state.superAdmin.salt);if(String(username).toLowerCase()!==String(state.superAdmin.username).toLowerCase()||expected!==state.superAdmin.passwordHash)return status('بيانات المشرف العام غير صحيحة.','error');rawSet(SESSION_KEY,JSON.stringify({username:state.superAdmin.username,expiresAt:Date.now()+8*60*60*1000}));showApp()}
function planNote(){const plan=$('plan').value;$('planDetails').innerHTML=plan==='plus'?'<b>Plus:</b> تطبق حدود الخطة المحددة على الشركة.':'<b>Pro:</b> جميع الحدود غير محدودة.'}
function calcExpiry(start=new Date()){const unit=$('durationUnit').value,q=Math.max(1,Number($('durationQuantity').value||1));if(unit==='unlimited')return '';const d=new Date(start);if(unit==='minute')d.setMinutes(d.getMinutes()+q);if(unit==='hour')d.setHours(d.getHours()+q);if(unit==='day')d.setDate(d.getDate()+q);if(unit==='month')d.setMonth(d.getMonth()+q);if(unit==='year')d.setFullYear(d.getFullYear()+q);return d.toISOString()}
function updateExpiryPreview(){const unit=$('durationUnit').value;$('durationQuantity').disabled=unit==='unlimited';const end=calcExpiry();$('expiryPreview').textContent=end?'تم تحديد مدة الاشتراك.':'مدة الاشتراك غير محدودة.'}
function generateKey(){return `CT-${Math.random().toString(36).slice(2,6).toUpperCase()}-${Date.now().toString(36).slice(-5).toUpperCase()}`}
function companyAccess(company){const tenantId=String(company.tenantId||company.companyId);return {tenantId,companyId:tenantId,companyKey:company.key,companyName:company.companyName,status:company.status,plan:company.plan,startAt:company.startAt,endAt:company.endAt,durationUnit:company.durationUnit,durationQuantity:company.durationQuantity,backupImportEnabled:company.backupImportEnabled===true,authVersion:company.authVersion,updatedAt:Date.now(),manager:{id:`ADMIN_${tenantId}`,username:company.managerUsername,password:company.managerPassword,displayName:'مدير الشركة',role:'admin',active:company.status==='active',permissions:{},authVersion:company.authVersion}}}
function payload(value){return {value:JSON.stringify(value),valueEncoding:'local-storage-json-v1',deleted:false,updatedAt:Date.now(),revision:1,deviceId:'admin-console',page:'admin.html'}}
async function writeCompany(company){
 const tenantId=String(company.tenantId||company.companyId);company.tenantId=tenantId;company.companyId=tenantId;
 const accessPayload=payload(companyAccess(company));
 if(base){
  /* نثبت هوية المسار أولاً، ثم نكتب بيانات الوصول. كل مفتاح شركة يشير إلى tenantId واحد لا يتغير. */
  await request(companyMetaUrl(tenantId),{method:'PATCH',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:JSON.stringify({tenantId,companyId:tenantId,companyKey:company.key,companyName:company.companyName,schema:19,updatedAt:Date.now(),managedBy:'cashTopAdmin'})});
  await request(companyDatasetUrl(tenantId,'cashtop_company_access'),{method:'PUT',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},body:JSON.stringify(accessPayload)});
 }
 let licenses=normalizeRecordArray(rawGet('cashtop_admin_licenses'),['key','tenantId','companyId','companyName','plan','status']);
 /* نعالج تلقائياً أي صيغة قديمة: Array أو Object أو قيمة Firebase مغلفة، ثم نوحدها إلى Array قبل filter/find. */
 licenses=licenses.filter(x=>normalizeKey(x.key)!==normalizeKey(company.key)||String(x.tenantId||x.companyId||x.id)===tenantId);
 const li=licenses.findIndex(x=>String(x.tenantId||x.companyId||x.id)===tenantId);
 const license={id:tenantId,key:company.key,tenantId,companyId:tenantId,companyName:company.companyName,status:company.status,plan:company.plan,startAt:company.startAt,endAt:company.endAt,durationUnit:company.durationUnit,durationQuantity:company.durationQuantity,backupImportEnabled:company.backupImportEnabled===true};
 if(li>=0)licenses[li]=license;else licenses.push(license);rawSet('cashtop_admin_licenses',JSON.stringify(licenses));
 let users=normalizeRecordArray(rawGet('cashtop_admin_users'),['username','companyKey','tenantId','companyId','role']);
 users=users.filter(x=>normalizeKey(x.companyKey)!==normalizeKey(company.key)||String(x.tenantId||x.companyId||'')===tenantId);
 const ui=users.findIndex(x=>String(x.tenantId||x.companyId||'')===tenantId&&x.role==='admin');
 const user={id:`ADMIN_${tenantId}`,companyKey:company.key,tenantId,companyId:tenantId,username:company.managerUsername,password:company.managerPassword,displayName:'مدير الشركة',role:'admin',active:company.status==='active'};
 if(ui>=0)users[ui]=user;else users.push(user);rawSet('cashtop_admin_users',JSON.stringify(users));
 const bindings=normalizePlainObject(rawGet('cashtop_tenant_bindings'));if(company.deleted===true||company.status==='deleted')delete bindings[normalizeKey(company.key)];else bindings[normalizeKey(company.key)]=tenantId;rawSet('cashtop_tenant_bindings',JSON.stringify(bindings));
}
async function writeCompanyAccessOnly(company){
 const tenantId=String(company.tenantId||company.companyId);if(!base)return true;const accessPayload=payload(companyAccess(company));
 await Promise.all([
  request(companyMetaUrl(tenantId),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantId,companyId:tenantId,companyKey:company.key,companyName:company.companyName,schema:19,updatedAt:Date.now(),managedBy:'cashTopAdmin'})},9000),
  request(companyDatasetUrl(tenantId,'cashtop_company_access'),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(accessPayload)},9000)
 ]);return true
}
async function mapConcurrent(items,limit,worker){let cursor=0;const results=[];async function run(){while(cursor<items.length){const i=cursor++;try{results[i]=await worker(items[i],i)}catch(e){results[i]=e}}}await Promise.all(Array.from({length:Math.min(limit,items.length||1)},run));return results}
async function saveCompany(e){
 e.preventDefault();const stateBeforeSave=JSON.stringify(state);const key=normalizeKey($('companyKey').value);if(!key)return toast('أدخل مفتاح الشركة.','error');
 const existingIndex=editingKey&&state.keyIndex[safeSeg(normalizeKey(editingKey))];
 const existingId=existingIndex&&(existingIndex.tenantId||existingIndex.companyId);
 const duplicateEntry=state.keyIndex[safeSeg(key)];const duplicate=duplicateEntry&&(duplicateEntry.tenantId||duplicateEntry.companyId);
 const retired=state.retiredKeys?.[safeSeg(key)];
 if(duplicate&&duplicate!==existingId)return toast('مفتاح الشركة مستخدم لشركة أخرى.','error');
 if(retired&&String(retired.tenantId||retired.companyId||'')!==String(existingId||''))return toast('هذا المفتاح استُخدم سابقاً وتم حجزه نهائياً لمنع ربطه ببيانات شركة أخرى. أنشئ مفتاحاً جديداً.','error');
 const existing=existingId?state.companies[existingId]:null;const now=new Date();
 const tenantId=String(existing?.tenantId||existing?.companyId||`TENANT_${Date.now()}_${crypto.randomUUID?crypto.randomUUID().slice(0,8):Math.random().toString(36).slice(2,10)}`);
 const company={tenantId,companyId:tenantId,companyName:$('companyName').value.trim(),key,managerUsername:$('managerUsername').value.trim(),managerPassword:$('managerPassword').value||existing?.managerPassword||'',plan:$('plan').value,status:$('status').value,backupImportEnabled:$('backupImportEnabled').value==='true',durationUnit:$('durationUnit').value,durationQuantity:$('durationUnit').value==='unlimited'?null:Math.max(1,Number($('durationQuantity').value||1)),startAt:existing?.startAt||now.toISOString(),endAt:calcExpiry(existing?.startAt?new Date(existing.startAt):now),authVersion:Date.now(),createdAt:existing?.createdAt||now.toISOString(),updatedAt:now.toISOString()};
 if(!company.companyName||!company.managerUsername||!company.managerPassword)return toast('أكمل اسم الشركة وبيانات مديرها.','error');
 if(editingKey&&normalizeKey(editingKey)!==key){const oldKey=normalizeKey(editingKey),oldSeg=safeSeg(oldKey);delete state.keyIndex[oldSeg];state.retiredKeys=state.retiredKeys||{};state.retiredKeys[oldSeg]={tenantId,companyId:tenantId,key:oldKey,retiredAt:Date.now()};const bindings=normalizePlainObject(rawGet('cashtop_tenant_bindings'));delete bindings[oldKey];rawSet('cashtop_tenant_bindings',JSON.stringify(bindings));}
 state.companies[tenantId]=company;state.keyIndex[safeSeg(key)]={tenantId,companyId:tenantId,key,updatedAt:Date.now()};
 try{await writeCompany(company);await saveState();toast('تم حفظ الشركة. هذا المفتاح مرتبط بمسار بيانات مستقل بالكامل.');resetForm();render()}catch(err){state=normalizeState(parse(stateBeforeSave,{}));rawSet(LOCAL_KEY,JSON.stringify(state));render();toast(err.message||'تعذر حفظ الشركة.','error')}
}
function resetForm(){editingKey='';$('editingKey').value='';$('formTitle').textContent='إنشاء شركة ومفتاح جديد';$('companyForm').reset();$('companyKey').value=generateKey();$('durationUnit').value='month';$('durationQuantity').value=1;$('plan').value='plus';$('status').value='active';$('backupImportEnabled').value='false';$('cancelEdit').classList.add('hidden');planNote();updateExpiryPreview()}
function editCompany(id){const c=state.companies[id];if(!c)return;editingKey=c.key;$('editingKey').value=c.key;$('formTitle').textContent=`تعديل ${c.companyName}`;$('companyName').value=c.companyName;$('companyKey').value=c.key;$('managerUsername').value=c.managerUsername;$('managerPassword').value=c.managerPassword;$('plan').value=c.plan;$('status').value=c.status;$('backupImportEnabled').value=String(c.backupImportEnabled===true);$('durationUnit').value=c.durationUnit||'unlimited';$('durationQuantity').value=c.durationQuantity||1;$('cancelEdit').classList.remove('hidden');planNote();updateExpiryPreview();scrollTo({top:0,behavior:'smooth'})}
async function toggleCompany(id){const c=state.companies[id];if(!c)return;c.status=c.status==='active'?'stopped':'active';c.authVersion=Date.now();c.updatedAt=new Date().toISOString();await writeCompany(c);await saveState();render();toast(c.status==='active'?'تم تفعيل المفتاح.':'تم إيقاف المفتاح وستُغلق الجلسات المفتوحة.','warning')}
async function deleteCompany(id){const c=state.companies[id];if(!c||!confirm(`حذف شركة ${c.companyName} وتعطيل مفتاحها؟`))return;c.status='deleted';c.deleted=true;c.authVersion=Date.now();const key=normalizeKey(c.key),seg=safeSeg(key);delete state.keyIndex[seg];state.retiredKeys=state.retiredKeys||{};state.retiredKeys[seg]={tenantId:c.tenantId||c.companyId,companyId:c.tenantId||c.companyId,key,deletedAt:Date.now()};const bindings=normalizePlainObject(rawGet('cashtop_tenant_bindings'));delete bindings[key];rawSet('cashtop_tenant_bindings',JSON.stringify(bindings));await writeCompany(c);await saveState();render();toast('تم تعطيل الشركة وحجز المفتاح نهائياً حتى لا يُعاد استخدامه مع بيانات شركة أخرى.','warning')}

function formatBytes(bytes){const n=Number(bytes||0);if(n<1024)return `${n} B`;if(n<1024**2)return `${(n/1024).toFixed(2)} KB`;if(n<1024**3)return `${(n/1024**2).toFixed(2)} MB`;return `${(n/1024**3).toFixed(2)} GB`}
async function prepareFullBackup(){
 const btn=$('prepareBackupBtn');btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> جاري استخراج جميع البيانات...';
 try{
  const companies={};const list=Object.values(state.companies||{});let done=0;
  for(const company of list){const id=String(company.tenantId||company.companyId);try{const r=await request(companyUrl(id),{},60000);companies[id]=await r.json()}catch(err){companies[id]={__backupError:String(err.message||err)}}done++;btn.innerHTML=`<i class="fa-solid fa-circle-notch fa-spin"></i> استخراج ${done}/${list.length}`}
  const packageData={format:'CASH_TOP_FULL_BACKUP',version:1,createdAt:new Date().toISOString(),adminState:state,companies};
  const text=JSON.stringify(packageData);preparedBackup={packageData,text,size:new Blob([text]).size};$('backupSize').textContent=formatBytes(preparedBackup.size);$('downloadBackupBtn').disabled=false;toast(`تم تجهيز نسخة شاملة بحجم ${formatBytes(preparedBackup.size)}.`)
 }catch(err){toast(`تعذر تجهيز النسخة: ${err.message||err}`,'error')}finally{btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-magnifying-glass-chart"></i> استخراج البيانات وحساب الحجم'}
}
function downloadPreparedBackup(){if(!preparedBackup)return toast('قم باستخراج البيانات أولاً.','warning');const blob=new Blob([preparedBackup.text],{type:'application/json;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`CashTop_All_Companies_Backup_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);}
function setRestoreProgress(percent,label=''){const p=Math.max(0,Math.min(100,Math.round(percent)));$('restoreProgress').classList.add('show');$('restoreProgressBar').style.width=`${p}%`;$('restoreProgressLabel').textContent=`${p}%${label?` — ${label}`:''}`}
async function restoreFullBackup(){
 const file=$('restoreBackupFile').files?.[0];if(!file)return toast('اختر ملف النسخة الاحتياطية أولاً.','warning');if(!confirm('سيتم استبدال بيانات الإدارة ومسارات الشركات الموجودة بالنسخة المختارة. هل تريد المتابعة؟'))return;
 const btn=$('restoreBackupBtn');btn.disabled=true;setRestoreProgress(1,'قراءة الملف');
 try{
  const data=JSON.parse(await file.text());if(data?.format!=='CASH_TOP_FULL_BACKUP'||!data.adminState||!data.companies)throw new Error('ملف النسخة غير صالح أو ليس نسخة شاملة من كاش توب.');
  const entries=Object.entries(data.companies);const total=entries.length+1;let done=0;
  state=normalizeState(data.adminState);await request(adminUrl(),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)},60000);done++;setRestoreProgress((done/total)*100,'استعادة إعدادات الإدارة');
  for(const [id,value] of entries){await request(companyUrl(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)},120000);done++;setRestoreProgress((done/total)*100,`رفع الشركة ${done-1}/${entries.length}`)}
  rawSet(LOCAL_KEY,JSON.stringify(state));setRestoreProgress(100,'اكتملت الاستعادة بنجاح');render();toast('تم استيراد جميع بيانات الشركات والإدارة بنجاح.');
 }catch(err){toast(`فشل الاستيراد: ${err.message||err}`,'error')}finally{btn.disabled=false}
}
async function changeAdminPassword(e){e.preventDefault();const current=$('currentAdminPassword').value,next=$('newAdminPassword').value,confirmPass=$('confirmNewAdminPassword').value;if(next!==confirmPass)return toast('تأكيد كلمة المرور الجديدة غير مطابق.','error');if(next.length<6)return toast('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.','error');const expected=await hashPassword(current,state.superAdmin.salt);if(expected!==state.superAdmin.passwordHash)return toast('كلمة المرور الحالية غير صحيحة.','error');const salt=makeSalt();state.superAdmin={...state.superAdmin,passwordHash:await hashPassword(next,salt),salt,authVersion:Date.now(),updatedAt:new Date().toISOString()};await saveState();$('changeAdminPasswordForm').reset();$('adminSettingsModal').classList.remove('show');toast('تم تغيير كلمة مرور المشرف العام ومزامنتها بنجاح.');}
async function copyKey(key){try{await navigator.clipboard.writeText(key)}catch(_){const input=document.createElement('input');input.value=key;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove()}toast('تم نسخ المفتاح.')}
function fmt(v){return v?new Date(v).toLocaleString('ar-EG'):'غير محدود'}
function render(){const list=Object.values(state.companies||{}).filter(c=>!c.deleted);$('statAll').textContent=list.length;$('statActive').textContent=list.filter(c=>c.status==='active'&&(!c.endAt||new Date(c.endAt)>new Date())).length;$('statPlus').textContent=list.filter(c=>c.plan==='plus').length;$('statPro').textContent=list.filter(c=>c.plan==='pro').length;$('companiesBody').innerHTML=list.length?list.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(c=>{const expired=c.endAt&&Date.now()>=new Date(c.endAt).getTime(),statusClass=expired?'expired':c.status==='active'?'active':'stopped',statusText=expired?'منتهي':c.status==='active'?'نشط':'موقوف',lock=c.backupImportEnabled===true?'<span class="badge active"><i class="fa-solid fa-lock-open"></i> مفتوح</span>':'<span class="badge stopped"><i class="fa-solid fa-lock"></i> مقفل</span>';return `<tr><td data-label="الشركة"><b>${escapeHtml(c.companyName)}</b></td><td data-label="المفتاح"><div class="key-cell"><code>${escapeHtml(c.key)}</code><button class="btn btn-light" type="button" title="نسخ المفتاح" onclick="AdminPage.copy(decodeURIComponent('${encodeURIComponent(c.key)}'))"><i class="fa-solid fa-copy"></i></button></div></td><td data-label="الخطة"><span class="badge ${c.plan}">${c.plan==='plus'?'Plus':'Pro'}</span></td><td data-label="الحالة"><span class="badge ${statusClass}">${statusText}</span></td><td data-label="المدير">${escapeHtml(c.managerUsername)}</td><td data-label="استيراد النسخ">${lock}</td><td data-label="البدء">${fmt(c.startAt)}</td><td data-label="الانتهاء">${fmt(c.endAt)}</td><td data-label="الإجراءات"><div class="actions"><button class="btn btn-light" onclick="AdminPage.edit('${c.companyId}')"><i class="fa-solid fa-pen"></i></button><button class="btn ${c.status==='active'?'btn-warning':'btn-success'}" onclick="AdminPage.toggle('${c.companyId}')"><i class="fa-solid fa-power-off"></i></button><button class="btn btn-danger" onclick="AdminPage.remove('${c.companyId}')"><i class="fa-solid fa-trash"></i></button></div></td></tr>`}).join(''):'<tr><td colspan="9" style="padding:25px;color:#64748b">لا توجد شركات بعد.</td></tr>'}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
window.AdminPage={edit:editCompany,toggle:toggleCompany,remove:deleteCompany,copy:copyKey};
window.addEventListener('DOMContentLoaded',async()=>{state=normalizeState(await loadRemote()||loadLocal());rawSet(LOCAL_KEY,JSON.stringify(state));setupAuthView();if(sessionValid())showApp();$('authForm').addEventListener('submit',handleAuth);$('companyForm').addEventListener('submit',saveCompany);$('generateKey').addEventListener('click',()=>{$('companyKey').value=generateKey()});$('plan').addEventListener('change',planNote);$('durationUnit').addEventListener('change',updateExpiryPreview);$('durationQuantity').addEventListener('input',updateExpiryPreview);$('cancelEdit').addEventListener('click',resetForm);$('logoutBtn').addEventListener('click',()=>{localStorage.removeItem(SESSION_KEY);location.reload()});$('adminSettingsBtn').addEventListener('click',()=>$('adminSettingsModal').classList.add('show'));$('closeAdminSettings').addEventListener('click',()=>$('adminSettingsModal').classList.remove('show'));$('adminSettingsModal').addEventListener('click',e=>{if(e.target===$('adminSettingsModal'))$('adminSettingsModal').classList.remove('show')});$('changeAdminPasswordForm').addEventListener('submit',changeAdminPassword);$('prepareBackupBtn').addEventListener('click',prepareFullBackup);$('downloadBackupBtn').addEventListener('click',downloadPreparedBackup);$('restoreBackupBtn').addEventListener('click',restoreFullBackup);resetForm();render()});
})();
