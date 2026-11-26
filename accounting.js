/* Cash Top 3 — Accounting extension. Real, deterministic projections; no demo transactions. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const tableNames=['invoices','purchases','expenses','vouchers','accounts','customers','suppliers','products','warehouses','stock','transfers','settings','accounting_coa','accounting_journal'];
const CATEGORIES={asset:'الأصول',liability:'الخصوم',equity:'حقوق الملكية',revenue:'الإيرادات',expense:'المصروفات'};
const base=[
 ['1','الأصول',null,'asset','debit',1],['11','الأصول المتداولة','1','asset','debit',1],
 ['1101','الصناديق والنقدية','11','asset','debit',1],['110199','الصندوق غير المحدد','1101','asset','debit',0],
 ['1102','البنوك والمحافظ الإلكترونية','11','asset','debit',1],['110299','البنك / المحفظة غير المحددة','1102','asset','debit',0],
 ['1103','العملاء والذمم المدينة','11','asset','debit',1],['110399','عميل غير محدد','1103','asset','debit',0],
 ['1104','المخزون السلعي','11','asset','debit',0],['1105','مصروفات مدفوعة مقدماً','11','asset','debit',0],
 ['1106','ضريبة مدخلات قابلة للاسترداد','11','asset','debit',0],['1107','سلف الموظفين','11','asset','debit',0],
 ['12','الأصول غير المتداولة','1','asset','debit',1],['1201','الأجهزة والمعدات','12','asset','debit',0],
 ['1202','الأثاث والتجهيزات','12','asset','debit',0],['1203','المباني والعقارات','12','asset','debit',0],
 ['1204','السيارات والمركبات','12','asset','debit',0],['1205','مجمع الإهلاك','12','asset','credit',0],
 ['2','الخصوم','', 'liability','credit',1],['21','الخصوم المتداولة','2','liability','credit',1],
 ['2101','الموردون والذمم الدائنة','21','liability','credit',1],['210199','مورد غير محدد','2101','liability','credit',0],
 ['2102','المصروفات المستحقة','21','liability','credit',0],['2103','ضريبة مخرجات مستحقة','21','liability','credit',0],
 ['2104','حساب معلق للتسوية','21','liability','credit',0],['2105','قروض قصيرة الأجل','21','liability','credit',0],
 ['22','الخصوم طويلة الأجل','2','liability','credit',1],['2201','قروض طويلة الأجل','22','liability','credit',0],
 ['3','حقوق الملكية',null,'equity','credit',1],['31','رأس المال والاحتياطيات','3','equity','credit',1],
 ['3101','رأس المال المدفوع','31','equity','credit',0],['3102','الأرباح المبقاة','31','equity','credit',0],
 ['3103','جاري الشركاء','31','equity','credit',0],['3104','مسحوبات الشركاء','31','equity','debit',0],
 ['3105','حساب الأرصدة الافتتاحية المعلّق','31','equity','credit',0],
 ['4','الإيرادات',null,'revenue','credit',1],['41','الإيرادات التشغيلية','4','revenue','credit',1],
 ['4101','إيرادات المبيعات والخدمات','41','revenue','credit',0],['4102','إيرادات متنوعة','41','revenue','credit',0],
 ['4103','مردودات المبيعات','41','revenue','debit',0],['4104','خصومات مسموحة','41','revenue','debit',0],
 ['5','المصروفات',null,'expense','debit',1],['51','تكلفة المبيعات والمصروفات التشغيلية','5','expense','debit',1],
 ['5101','الرواتب والأجور','51','expense','debit',0],['5102','الإيجارات','51','expense','debit',0],
 ['5103','الكهرباء والمياه والاتصالات','51','expense','debit',0],['5104','تكلفة البضاعة المباعة','51','expense','debit',0],
 ['5105','النقل والتوصيل','51','expense','debit',0],['5106','صيانة وإصلاحات','51','expense','debit',0],
 ['5107','تسويق وإعلانات','51','expense','debit',0],['5108','رسوم وعمولات بنكية','51','expense','debit',0],
 ['5109','مصروفات إدارية متنوعة','51','expense','debit',0],['5110','الديون المعدومة','51','expense','debit',0],
 ['5111','الإهلاك','51','expense','debit',0],['5112','بضاعة تالفة أو هالك','51','expense','debit',0]
].map(([id,name,parentId,category,nature,isGroup])=>({id,code:id,name,parentId:parentId||null,category,nature,isGroup:!!isGroup,system:true}));
function currentBranch(){try{return String(parent.__CT_ACTIVE_BRANCH__||'main')}catch{return'main'}}
function normalizeBranch(record){const name=String(record?.branchId||'main');return ['main','الرئيسي','الفرع الرئيسي'].includes(name)?'main':name}
function scopeAccounting(raw,id=currentBranch()){
 const whs=new Set((raw.warehouses||[]).filter(w=>normalizeBranch(w)===id).map(w=>w.id));
 const stockedProducts=new Set((raw.stock||[]).filter(s=>whs.has(s.warehouseId)).map(s=>s.productId));
 const filter=(name)=>{raw[name]=(raw[name]||[]).filter(row=>normalizeBranch(row)===id)};
 for(const name of ['invoices','purchases','expenses','vouchers','accounts','customers','suppliers','accounting_journal','accounting_coa'])filter(name);
 const accountIds=new Set(raw.accounts.map(row=>row.id));
 raw.transfers=(raw.transfers||[]).filter(row=>row.branchId?normalizeBranch(row)===id:
  accountIds.has(row.fromAccountId)||accountIds.has(row.toAccountId));
 raw.products=(raw.products||[]).filter(p=>normalizeBranch(p)===id||stockedProducts.has(p.id));
 return raw;
}
const S={db:null,raw:{},accounts:[],entries:[],balances:{},expanded:new Set(['1','11','1101','1102','1103','12','2','21','2101','22','3','31','4','41','5','51']),tab:'coa',warnings:[],loading:false,editingJournal:null,savingJournal:false};
const nowDay=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const escapeHtml=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cents=v=>{const n=Number(v);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*100):0};
const moneyC=n=>{const a=Math.round(n||0);return a<0?`(${(Math.abs(a)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})})`:(a/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const date10=x=>{if(!x)return'';const s=String(x);return /^\d{4}-\d\d-\d\d/.test(s)?s.slice(0,10):''};
const showToast=(message,error=false)=>{const container=$('toast-container');const toast=document.createElement('div');toast.className='pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold transition-all '+(error?'bg-rose-600 text-white border-rose-500':'bg-slate-900 text-white border-slate-700');const icon=document.createElement('i');icon.className='fa-solid '+(error?'fa-circle-exclamation text-white':'fa-circle-check text-emerald-400')+' text-sm';const span=document.createElement('span');span.textContent=message;toast.append(icon,span);container.append(toast);setTimeout(()=>{toast.style.opacity='0';setTimeout(()=>toast.remove(),300)},3600)};
async function askConfirm(title,message){return new Promise(resolve=>{const modal=$('confirm-modal');$('confirm-title').textContent=title;$('confirm-message').textContent=message;modal.hidden=false;document.body.classList.add('ct-modal-open');const close=answer=>{modal.hidden=true;document.body.classList.remove('ct-modal-open');$('confirm-ok-btn').onclick=null;$('confirm-cancel-btn').onclick=null;resolve(answer)};$('confirm-ok-btn').onclick=()=>close(true);$('confirm-cancel-btn').onclick=()=>close(false)})}
const uuid=()=>crypto.randomUUID?.()||'ct-'+Date.now()+'-'+Math.random().toString(36).slice(2);
function companyId(){try{return String(parent.OscarActivation?.readRuntime?.()?.companyId||'local').trim()||'local'}catch{return'local'}}
function dbName(){return `Oscar_Accounting_POS_DB__${encodeURIComponent(companyId())}`}
function openDB(){return new Promise((res,rej)=>{const rq=indexedDB.open(dbName(),11);rq.onupgradeneeded=()=>{
  const db=rq.result;
  for(const name of ["products", "categories", "warehouses", "stock", "stock_movements", "invoices", "purchases", "customers", "suppliers", "partner_statements", "accounts", "transfers", "expenses", "shifts", "audit_logs", "held_invoices", "sync_queue", "settings", "vouchers", "employees", "restaurant_tables", "restaurant_sections", "restaurant_orders", "kitchen_sections", "table_reservations", "recipes", "waste_records", "distribution_sessions", "distribution_docs", "distribution_routes", "distribution_commissions", "distribution_journal", "distribution_shifts", "accounting_coa", "accounting_journal"]){if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:name==='stock'?['productId','warehouseId']:name==='settings'?'key':'id'})}
  const indexes={distribution_docs:[["date","date"],["repId","repId"],["status","status"],["kind","kind"],["repDate",["repId","date"]],["shiftId","shiftId"]],distribution_commissions:[["date","date"],["repId","repId"],["status","status"],["kind","kind"],["repDate",["repId","date"]],["shiftId","shiftId"]],distribution_journal:[["date","date"],["repId","repId"],["status","status"],["kind","kind"],["repDate",["repId","date"]],["shiftId","shiftId"]],distribution_shifts:[["date","date"],["repId","repId"],["status","status"],["kind","kind"],["repDate",["repId","date"]],["shiftId","shiftId"]],distribution_routes:[["date","date"],["repId","repId"],["status","status"],["kind","kind"],["repDate",["repId","date"]],["shiftId","shiftId"]],invoices:[["date","date"],["createdAt","createdAt"],["financialYearId","financialYearId"],["type","type"],["paymentType","paymentType"],["customerId","customerId"]],purchases:[["date","date"],["createdAt","createdAt"],["financialYearId","financialYearId"],["supplierId","supplierId"]],stock_movements:[["date","date"],["financialYearId","financialYearId"],["productId","productId"],["warehouseId","warehouseId"],["productWarehouseDate",["productId","warehouseId","date"]]],expenses:[["date","date"],["createdAt","createdAt"],["financialYearId","financialYearId"],["category","category"]],vouchers:[["date","date"],["createdAt","createdAt"],["financialYearId","financialYearId"],["type","type"],["partyId","partyId"]],transfers:[["date","date"],["createdAt","createdAt"],["financialYearId","financialYearId"]],audit_logs:[["date","date"],["timestamp","timestamp"],["createdAt","createdAt"],["financialYearId","financialYearId"]],partner_statements:[["date","date"],["createdAt","createdAt"],["financialYearId","financialYearId"],["partnerId","partnerId"],["partyId","partyId"]],held_invoices:[["date","date"],["createdAt","createdAt"]],customers:[["createdAt","createdAt"],["name","name"],["phone","phone"]],suppliers:[["createdAt","createdAt"],["name","name"],["phone","phone"]]};
  for(const [name,defs] of Object.entries(indexes)){if(!db.objectStoreNames.contains(name))continue;const store=rq.transaction.objectStore(name);for(const [index,path] of defs)if(!store.indexNames.contains(index))store.createIndex(index,path,{unique:false})}
 };rq.onsuccess=()=>{const db=rq.result;db.onversionchange=()=>db.close();res(db)};rq.onerror=()=>rej(rq.error);rq.onblocked=()=>showToast('أغلق أي نسخة أخرى من البرنامج لإتمام تحديث قاعدة البيانات',true)})}
function readStore(db,name){return new Promise((res,rej)=>{if(!db.objectStoreNames.contains(name)){res([]);return}const tx=db.transaction(name,'readonly');const r=tx.objectStore(name).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
async function writeRecord(store,row){if(!S.db)throw Error('قاعدة البيانات غير متصلة');if(['accounting_coa','accounting_journal'].includes(store)&&!row.branchId)row={...row,branchId:currentBranch()};await new Promise((res,rej)=>{const tx=S.db.transaction(store,'readwrite');const write=()=>tx.objectStore(store).put(row);
 if(parent.CashTopTrialValidateWrites)parent.CashTopTrialValidateWrites(tx,[{storeName:store,type:'put',value:row}],write,rej);
 else write();
 tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||Error('فشل حفظ البيانات'))});try{const cloud=parent.OscarCloudSync;if(cloud?.captureStoreChange){const ok=await cloud.captureStoreChange(store,row,{localUserWrite:true});if(!ok&&companyId()!=='local')S.warnings.push('تُحفظ تعديلات المحاسبة محلياً؛ تحقق من تهيئة مزامنة الشركة.')}}catch(e){showToast('حُفظ محلياً، والمزامنة ستحتاج لإعادة المحاولة',true)}try{parent.dispatchEvent(new CustomEvent('oscar:db-mutation',{detail:{storeName:store,value:row,action:'update'}}))}catch{}}
async function writeAccountingChecked(stores,build,writeOnly=[]){
 if(!S.db)throw Error('قاعدة البيانات غير متصلة');
 const operations=await new Promise((resolve,reject)=>{
  const tx=S.db.transaction([...stores,...writeOnly],'readwrite');
  const snapshot={};
  let pending=stores.length,changes;
  tx.oncomplete=()=>resolve(changes);
  tx.onerror=()=>reject(tx.error);
  tx.onabort=()=>reject(tx.error||Error('تعذّر حفظ التعديل.'));
  for(const name of stores){
   const request=tx.objectStore(name).getAll();
   request.onsuccess=()=>{
    snapshot[name]=request.result;
    if(--pending)return;
    try{
     changes=build(snapshot);
     const write=()=>changes.forEach(op=>tx.objectStore(op.storeName).put(op.value));
     if(parent.CashTopTrialValidateWrites)parent.CashTopTrialValidateWrites(tx,changes,write,reject);
     else write();
    }catch(error){reject(error);tx.abort()}
   };
  }
 });
 for(const {storeName,value} of operations){
  try{await parent.OscarCloudSync?.captureStoreChange?.(storeName,value,{localUserWrite:true})}
  catch{showToast('تم الحفظ محليًا. ستحتاج المزامنة إلى إعادة المحاولة.',true)}
  try{parent.dispatchEvent(new CustomEvent('oscar:db-mutation',{detail:{storeName,value,action:'update'}}))}catch{}
 }
}
const accountingAlive=row=>!!row&&!row.deletedAt&&!row.isDeleted;
const accountingSettings=data=>(data.settings||[]).find(row=>row.key==='store_config')||{};
function accountDeleteReason(id,data){
 if((data.accounting_coa||[]).some(row=>accountingAlive(row)&&String(row.parentId)===String(id)))return 'احذف الحسابات الفرعية التابعة له أولًا.';
 if((data.accounting_journal||[]).some(row=>accountingAlive(row)&&(row.lines||[]).some(line=>String(line.accountId)===String(id)))||
    [...(data.expenses||[]),...(data.vouchers||[])].some(row=>accountingAlive(row)&&String(row.ledgerAccountId)===String(id)))
  return 'الحساب مرتبط بحركات محاسبية.';
 return '';
}
function journalEditReason(row,data){
 if(!accountingAlive(row))return 'القيد غير موجود.';
 if(row.source&&row.source!=='manual')return 'هذا القيد مرتبط بمصدره.';
 if(row.reversalOf||(data.accounting_journal||[]).some(other=>accountingAlive(other)&&other.reversalOf===row.id))return 'القيد مرتبط بقيد عكسي.';
 const settings=accountingSettings(data);
 const year=(settings.financialYears||[]).find(period=>period.id===(row.financialYearId||settings.financialYears?.[0]?.id||settings.activeFinancialYearId));
 return year?.status==='closed'||row.financialYearArchivedAt?'الفترة المالية لهذا القيد مغلقة.':'';
}

function accountById(id){return S.accounts.find(a=>a.id===id)}
function applyAccounts(){
 const byId=new Map(base.map(a=>[a.id,{...a}]));
 for(const raw of S.raw.accounting_coa||[]){if(raw.deletedAt){if(!byId.has(raw.id))continue;else continue}const old=byId.get(raw.id);if(old)byId.set(raw.id,{...old,name:raw.name||old.name});else byId.set(raw.id,{...raw,system:false})}
 const dynamic=(id,code,name,parentId,category,nature)=>{if(byId.has(id))return;byId.set(id,{id,code,name,parentId,category,nature,isGroup:false,dynamic:true})};
 for(const a of S.raw.accounts||[]){if(a.deletedAt)continue;const type=String(a.type||'').toLowerCase(),isBank=/bank|wallet|electronic|online|card/.test(type),group=isBank?'1102':'1101';dynamic('financial:'+a.id,group+'-'+String(a.id).replace(/[^a-z0-9_-]/gi,'').slice(-28),a.name||'حساب مالي',group,'asset','debit')}
 for(const c of S.raw.customers||[]){if(c.deletedAt||c.isVirtual||c.id==='cust-walkin')continue;dynamic('customer:'+c.id,'1103-'+String(c.id).replace(/[^a-z0-9_-]/gi,'').slice(-28),c.name||'عميل', '1103','asset','debit')}
 for(const p of S.raw.suppliers||[]){if(p.deletedAt)continue;dynamic('supplier:'+p.id,'2101-'+String(p.id).replace(/[^a-z0-9_-]/gi,'').slice(-28),p.name||'مورد','2101','liability','credit')}
 S.accounts=[...byId.values()];
}
function accountCash(id){const a=(S.raw.accounts||[]).find(x=>x.id===id&&!x.deletedAt);return a?'financial:'+a.id:'110199'}
function accountCustomer(id){return accountById('customer:'+id)?'customer:'+id:'110399'}
function accountSupplier(id){return accountById('supplier:'+id)?'supplier:'+id:'210199'}
function expenseCode(category){const s=String(category||'').toLowerCase();if(/راتب|أجر|موظف/.test(s))return '5101';if(/إيجار|اجار|كراء/.test(s))return '5102';if(/كهرب|ماء|مياه|نت|هاتف|اتصال/.test(s))return '5103';if(/نقل|توصيل|شحن/.test(s))return '5105';if(/صيان|تصليح/.test(s))return '5106';if(/اعلان|إعلان|تسويق|دعاية/.test(s))return '5107';if(/عمول|بنك|رسوم/.test(s))return '5108';return '5109'}
function makeEntry(source,rec,description,lines,ref='',manual=false){
 const clean=lines.map(l=>({accountId:l.accountId,debit:Math.round(l.debit||0),credit:Math.round(l.credit||0),note:String(l.note||'')})).filter(l=>l.debit||l.credit),d=clean.reduce((x,l)=>x+l.debit,0),c=clean.reduce((x,l)=>x+l.credit,0);
 if(!clean.length)return null;
 if(d!==c||d<=0||clean.some(l=>l.debit<0||l.credit<0||(l.debit&&l.credit)||!accountById(l.accountId))){S.warnings.push('تعذر تكوين قيد متوازن من المصدر '+source+': '+(rec.id||''));return null}
 return {id:source+':'+rec.id,number:String(ref||rec.invoiceNumber||rec.voucherNumber||rec.id||''),date:date10(rec.date||rec.createdAt)||nowDay(),financialYearId:rec.financialYearId||'',branchId:normalizeBranch(rec),description,lines:clean,source,manual,sourceRecordId:String(rec.id||'')}
}
const dr=(accountId,amount,note)=>({accountId,debit:amount,credit:0,note});const cr=(accountId,amount,note)=>({accountId,debit:0,credit:amount,note});
function distributePayments(raw,target,kind='debit'){
 const rows=[],pays=(Array.isArray(raw.payments)?raw.payments:[]).filter(x=>cents(x.amount)>0),isDebit=kind==='debit';let used=0;
 if(!pays.length&&raw.accountId)pays.push({accountId:raw.accountId,amount:target/100});
 for(const p of pays){if(used>=target)break;const amount=Math.min(target-used,cents(p.amount));if(amount>0){rows.push((isDebit?dr:cr)(accountCash(p.accountId),amount,p.method||''));used+=amount}}
 if(used<target)rows.push((isDebit?dr:cr)('110199',target-used,'الدفعة بدون حساب مالي محدد'));
 return rows;
}
function costs(items){return (Array.isArray(items)?items:[]).reduce((sum,item)=>sum+cents(item.fifoCostTotal??(item.costPriceAtSale!=null?num(item.costPriceAtSale)*num(item.quantity):0)),0)}
function buildAutomaticEntries(){
 const out=[];const push=e=>{if(e)out.push(e)};
 const isActive=x=>!x.deletedAt&&!x.isDeleted&&x.status!=='cancelled'&&x.status!=='canceled'&&x.status!=='draft';
 for(const inv of S.raw.invoices||[]){if(!isActive(inv))continue;const total=Math.abs(cents(inv.grandTotal));if(!total)continue;const isReturn=inv.type==='return'||inv.isReturn===true||num(inv.grandTotal)<0;
 if(!isReturn){const tax=Math.min(total,Math.max(0,cents(inv.taxTotal))),paid=Math.min(total,Math.max(0,cents(inv.paidAmount))),due=total-paid,lines=[...distributePayments(inv,paid,'debit')];if(due)lines.push(dr(accountCustomer(inv.customerId),due,'مديونية الفاتورة'));lines.push(cr('4101',total-tax,'مبيعات'),...(tax?[cr('2103',tax,'ضريبة مخرجات')]:[]));push(makeEntry('invoices',inv,'فاتورة مبيعات '+(inv.invoiceNumber||''),lines,inv.invoiceNumber));const normalCost=costs((inv.items||[]).filter(x=>!x.nonStock));
 if(normalCost>0)push(makeEntry('cogs',inv,'تكلفة مبيعات '+(inv.invoiceNumber||''),[dr('5104',normalCost),cr('1104',normalCost)],String(inv.invoiceNumber||inv.id)+' / تكلفة'));
 const nonStockCost=costs((inv.items||[]).filter(x=>x.nonStock));
 if(nonStockCost>0)push(makeEntry('free-cost',inv,'تكلفة أصناف غير مخزنية '+(inv.invoiceNumber||''),[dr('5104',nonStockCost),cr('2104',nonStockCost,'تكلفة غير مخزنية تنتظر تسويتها')],String(inv.invoiceNumber||inv.id)+' / غير مخزني'));
 }else{const tax=Math.min(total,Math.max(0,cents(inv.taxTotal))),refund=Math.min(total,Math.max(0,cents(inv.paidAmount)||((inv.payments||[]).reduce((s,x)=>s+cents(x.amount),0)))),debt=Math.min(total-refund,Math.max(0,cents(inv.returnAllocation?.debtReversed))),remaining=total-refund-debt;const lines=[dr('4103',total-tax,'مردودات مبيعات'),...(tax?[dr('2103',tax,'عكس ضريبة مخرجات')]:[]),...distributePayments(inv,refund,'credit')];if(debt+remaining)lines.push(cr(accountCustomer(inv.customerId),debt+remaining,'عكس مديونية عميل'));push(makeEntry('returns',inv,'مرتجع مبيعات '+(inv.invoiceNumber||''),lines,inv.invoiceNumber));const normalCost=costs((inv.items||[]).filter(x=>!x.nonStock));
 if(normalCost)push(makeEntry('return-cost',inv,'إعادة تكلفة المرتجع '+(inv.invoiceNumber||''),[dr('1104',normalCost),cr('5104',normalCost)],String(inv.invoiceNumber||inv.id)+' / تكلفة'));
 const nonStockCost=costs((inv.items||[]).filter(x=>x.nonStock));
 if(nonStockCost)push(makeEntry('return-free-cost',inv,'عكس تكلفة صنف غير مخزني '+(inv.invoiceNumber||''),[dr('2104',nonStockCost),cr('5104',nonStockCost)],String(inv.invoiceNumber||inv.id)+' / غير مخزني'));}}
 for(const p of S.raw.purchases||[]){if(!isActive(p))continue;const total=Math.abs(cents(p.grandTotal));if(!total)continue;const paid=Math.min(total,Math.max(0,cents(p.paidAmount))),tax=Math.min(total,Math.max(0,cents(p.taxTotal))),due=total-paid;
 const lines=[dr('1104',total-tax,'توريد بضاعة'),...(tax?[dr('1106',tax,'ضريبة مدخلات')]:[])];if(due)lines.push(cr(accountSupplier(p.supplierId),due,'مستحق للمورد'));lines.push(...distributePayments(p,paid,'credit'));
 push(makeEntry('purchases',p,'فاتورة مشتريات '+(p.invoiceNumber||''),lines,p.invoiceNumber))}
 for(const x of S.raw.expenses||[]){if(!isActive(x))continue;const amount=Math.abs(cents(x.amount));if(!amount)continue;
 push(makeEntry('expenses',x,'مصروف: '+(x.category||x.notes||'بدون تصنيف'),[dr(x.ledgerAccountId&&accountById(x.ledgerAccountId)?.category==='expense'?x.ledgerAccountId:expenseCode(x.category),amount),cr(accountCash(x.accountId),amount)],'EXP-'+String(x.id||'').slice(-9)))}
 for(const v of S.raw.vouchers||[]){if(!isActive(v)||v.distributionManaged)continue;const amount=Math.abs(cents(v.amount));if(!amount)continue;
 const isReceipt=v.type==='receipt';let other='2104';if(v.partyType==='customer')other=accountCustomer(v.partyId);else if(v.partyType==='supplier')other=accountSupplier(v.partyId);else if(v.ledgerAccountId&&accountById(v.ledgerAccountId))other=v.ledgerAccountId;
 // Customer receipt: DR cash/CR receivable; supplier payment: DR payable/CR cash.
 const paymentSide=isReceipt?'debit':'credit';
 const liquid=v.sourceType==='debt_without_account'?[(isReceipt?dr:cr)('2104',amount)]:distributePayments(v,amount,paymentSide);
 const lines=[...liquid,(isReceipt?cr:dr)(other,amount)];
 push(makeEntry('vouchers',v,(isReceipt?'سند قبض ':'سند صرف ')+(v.voucherNumber||'')+(v.partyName?' — '+v.partyName:''),lines,v.voucherNumber||('V-'+String(v.id).slice(-8))))}
 // Registered opening balances are paired with equity only when source records provide them explicitly.
 for(const [store,type,normalSide] of [['customers','customer','debit'],['suppliers','supplier','credit']]){
  for(const row of S.raw[store]||[]){
   if(!isActive(row)||row.fiscalOpeningMigratedAt||!cents(row.openingBalanceAmount))continue;
   const amount=Math.abs(cents(row.openingBalanceAmount));
   const increase=(row.openingBalanceSide|| (type==='customer'?'ours':'theirs'))===(type==='customer'?'ours':'theirs');
   const account=type+':'+row.id;
   const debit=(normalSide==='debit')===increase;
   push(makeEntry('opening',row,'رصيد افتتاحي — '+row.name,
    [dr(debit?account:'3105',amount),cr(debit?'3105':account,amount)],'OB-'+String(row.id).slice(-8)));
  }
 }
 for(const row of S.raw.transfers||[]){
  const {fromAccountId,toAccountId}=row;
  const amount=cents(row.amount);
  if(!isActive(row)||!fromAccountId||!toAccountId||fromAccountId===toAccountId||amount<=0)continue;
  push(makeEntry('transfer',row,'تحويل بين الحسابات المالية',
   [dr(accountCash(toAccountId),amount),cr(accountCash(fromAccountId),amount)],row.referenceNumber||'TR-'+String(row.id).slice(-8)));
 }
 // Manual journals are independent and never duplicated into operational source records.
 for(const raw of S.raw.accounting_journal||[]){if(!isActive(raw)||!Array.isArray(raw.lines))continue;const lines=raw.lines.map(l=>({accountId:l.accountId,debit:cents(l.debit),credit:cents(l.credit),note:l.note}));push(makeEntry('manual',raw,raw.description,lines,raw.number,true))}
 return out.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
function selectedEntries(){const end=$('as-of').value||nowDay(),fy=$('fiscal-filter').value;return S.entries.filter(e=>e.date<=end&&(fy==='all'||e.financialYearId===fy))}
function calculate(){const entries=selectedEntries(),balances=Object.fromEntries(S.accounts.map(a=>[a.id,0]));let journalDebit=0,journalCredit=0;for(const e of entries){for(const l of e.lines){journalDebit+=l.debit;journalCredit+=l.credit;balances[l.accountId]=(balances[l.accountId]||0)+l.debit-l.credit}}
 const children=new Map();for(const a of S.accounts){if(!children.has(a.parentId))children.set(a.parentId,[]);children.get(a.parentId).push(a)}
 const visited=new Set();const roll=(a,stack=new Set())=>{if(stack.has(a.id))throw Error('توجد دورة غير صحيحة في شجرة الحسابات');if(visited.has(a.id))return balances[a.id]||0;stack.add(a.id);let n=balances[a.id]||0;for(const child of children.get(a.id)||[])n+=roll(child,stack);stack.delete(a.id);visited.add(a.id);balances[a.id]=n;return n};
 for(const root of S.accounts.filter(a=>!a.parentId))roll(root);
 const sum=id=>balances[id]||0;
 const assets=sum('1'),liabilities=-sum('2'),equity=-sum('3'),revenues=-sum('4'),expenses=sum('5'),profit=revenues-expenses,right=liabilities+equity+profit;
 return {entries,balances,journalDebit,journalCredit,assets,liabilities,equity,revenues,expenses,profit,right,diff:assets-right};
}
function sortedChildren(parentId){return S.accounts.filter(a=>a.parentId===parentId).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}))}
function setTab(tab){
 S.tab=tab;
 document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===tab;b.className='tab-btn flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm '+(active?'font-bold transition-all bg-white text-indigo-700 shadow-sm':'font-semibold text-slate-600 hover:text-slate-900 transition-all')});
 for(const id of ['coa','journal','balance','trial','reports'])$('panel-'+id).hidden=id!==tab;
 document.body.classList.remove('print-balance','print-trial');render();
}
function render(){
 const f=calculate();S.balances=f.balances;
 $('entry-count').textContent=f.entries.length;$('kpi-assets').textContent=moneyC(f.assets);$('kpi-right').textContent=moneyC(f.right);$('kpi-profit').textContent=moneyC(f.profit);
 $('kpi-profit').parentElement.parentElement.hidden=reportContext().showProfit===false;
 $('kpi-profit').className='text-lg sm:text-xl font-extrabold tabular-nums mt-0.5 '+(f.profit>=0?'text-emerald-600':'text-rose-600');
 const ok=f.diff===0&&f.journalDebit===f.journalCredit;
 $('kpi-balanced').innerHTML=ok?'<i class="fa-solid fa-circle-check"></i> متوازنة 100%':'<i class="fa-solid fa-triangle-exclamation"></i> فرق: '+moneyC(Math.abs(f.diff));
 $('kpi-balanced').className='text-sm sm:text-base font-extrabold mt-1 flex items-center gap-1.5 '+(ok?'text-emerald-600':'text-rose-600');
 $('kpi-balance-icon-box').className='w-10 h-10 rounded-xl flex items-center justify-center text-lg '+(ok?'bg-emerald-50 text-emerald-600':'bg-rose-50 text-rose-600');
 $('kpi-balance-icon-box').innerHTML=ok?'<i class="fa-solid fa-check-double"></i>':'<i class="fa-solid fa-triangle-exclamation"></i>';
 $('balance-diff-label').textContent='الفرق: '+moneyC(Math.abs(f.diff));
 $('bs-report-date').textContent=$('as-of').value||nowDay();
 $('balance-status').className='px-3.5 py-2 rounded-xl text-xs font-extrabold border flex items-center gap-1.5 '+(ok?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-rose-50 text-rose-700 border-rose-200');
 $('balance-status').innerHTML=ok?'<i class="fa-solid fa-check-circle"></i> الميزانية متوازنة (الأصول = الخصوم + حقوق الملكية)':'<i class="fa-solid fa-triangle-exclamation"></i> يوجد فرق غير متوازن: '+moneyC(Math.abs(f.diff));
 $('balance-total-assets').textContent=moneyC(f.assets);$('balance-total-right').textContent=moneyC(f.right);
 if(S.tab==='coa')renderCoa(f);if(S.tab==='journal')renderJournal(f);if(S.tab==='balance')renderBalance(f);if(S.tab==='trial')renderTrial(f);if(S.tab==='reports'){renderReports();refreshReportHistory();}
}
function renderCoa(f){
 const search=$('coa-search').value.trim().toLowerCase(),hideZero=$('coa-hide-zero').checked;let html='';
 const visible=new Map();const hasBalance=account=>{if(!visible.has(account.id))visible.set(account.id,!!f.balances[account.id]||sortedChildren(account.id).some(hasBalance));return visible.get(account.id)};
 const badges={asset:'bg-emerald-50 text-emerald-700 border-emerald-200',liability:'bg-amber-50 text-amber-700 border-amber-200',equity:'bg-purple-50 text-purple-700 border-purple-200',revenue:'bg-sky-50 text-sky-700 border-sky-200',expense:'bg-rose-50 text-rose-700 border-rose-200'};
 const row=(a,depth,isSearch=false)=>{
  if(hideZero&&!hasBalance(a))return;
  const kids=sortedChildren(a.id),isOpen=S.expanded.has(a.id),bal=f.balances[a.id]||0,isRoot=!a.parentId&&!isSearch,isGroup=a.isGroup;
  const rowBg=isRoot?'bg-slate-50/90 font-extrabold':isGroup?'bg-white font-bold':'bg-white hover:bg-indigo-50/30';
  const canDelete=!a.system&&!a.dynamic;
  const deleteReason=canDelete?(kids.length?'احذف الحسابات الفرعية التابعة له أولًا.':bal?'رصيد الحساب يجب أن يكون صفرًا.':accountDeleteReason(a.id,S.companyRaw||S.raw)):'';
  const cssNature=a.nature==='debit'?'bg-emerald-50 text-emerald-700':'bg-indigo-50 text-indigo-700';
  html+=`<tr class="${rowBg} transition-colors group"><td class="py-3 px-4 tabular-nums"><span class="inline-block px-2 py-0.5 rounded-md text-xs font-extrabold ${isRoot?'bg-slate-800 text-white':'bg-slate-100 text-slate-700'}">${escapeHtml(a.code)}</span></td><td class="py-3 px-4"><div class="flex items-center gap-2" style="padding-right:${isSearch?0:Math.min(depth*22,176)}px">${!isSearch?(kids.length?`<button type="button" data-toggle="${escapeHtml(a.id)}" class="w-6 h-6 rounded-lg hover:bg-slate-200/70 text-slate-500 flex items-center justify-center transition"><i class="fa-solid ${isOpen?'fa-chevron-down':'fa-chevron-left'} text-xs"></i></button>`:'<span class="w-6 inline-flex justify-center text-slate-300"><i class="fa-solid fa-turn-up fa-rotate-270 text-xs"></i></span>'):''}<span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs ${isGroup?'bg-amber-50 text-amber-600':'bg-indigo-50 text-indigo-600'}"><i class="fa-solid ${isGroup?'fa-folder-open':'fa-file-lines'}"></i></span><div><span class="text-slate-800 ${isRoot?'text-base':'text-sm'}">${escapeHtml(a.name)}</span>${isRoot?`<span class="mr-2 text-xs px-2 py-0.5 rounded-full border ${badges[a.category]||badges.asset}">${CATEGORIES[a.category]||''}</span>`:''}</div></div></td><td class="py-3 px-4 text-center"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${cssNature}">${a.nature==='debit'?'مدين':'دائن'}</span></td><td class="py-3 px-4 text-center hidden md:table-cell"><span class="text-xs text-slate-500">${isGroup?'حساب رئيسي':'حساب فرعي'}</span></td><td class="py-3 px-4 text-left tabular-nums font-extrabold ${bal===0?'text-slate-400':((a.nature==='credit'?-bal:bal)<0?'text-rose-600':'text-slate-900')}"><button type="button" class="ct-ledger-link" data-movement="${escapeHtml(a.id)}" aria-label="عرض حركات ${escapeHtml(a.name)}">${moneyC(a.nature==='credit'?-bal:bal)}</button></td><td class="py-3 px-4 text-center no-print"><div class="inline-flex items-center justify-center gap-1">${isGroup?`<button type="button" data-addchild="${escapeHtml(a.id)}" title="إضافة حساب فرعي" class="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition text-xs font-bold flex items-center gap-1"><i class="fa-solid fa-plus-circle"></i><span class="hidden sm:inline">فرعي</span></button>`:`<button type="button" data-withaccount="${escapeHtml(a.id)}" title="إنشاء قيد على الحساب" class="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition text-xs"><i class="fa-solid fa-pen-to-square"></i></button>`}${!a.system&&!a.dynamic?`<button type="button" data-editaccount="${escapeHtml(a.id)}" title="تعديل الحساب" class="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition text-xs"><i class="fa-solid fa-sliders"></i></button>`:''}${canDelete?`<button type="button" data-deleteaccount="${escapeHtml(a.id)}" title="${escapeHtml(deleteReason||'حذف الحساب')}" class="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition text-xs font-bold"><i class="fa-solid fa-trash-can"></i> حذف</button>`:''}</div></td></tr>`;
  if(!isSearch&&isOpen)kids.forEach(ch=>row(ch,depth+1));
 };
 if(search){for(const a of S.accounts.filter(a=>a.name.toLowerCase().includes(search)||String(a.code).toLowerCase().includes(search)).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})))row(a,0,true)}else sortedChildren(null).forEach(a=>row(a,0));
 $('coa-body').innerHTML=html||'<tr><td colspan="6" class="py-10 text-center text-slate-400 text-sm">لا توجد حسابات مطابقة لعبارة البحث</td></tr>';
}
function renderJournal(f){
 const q=$('journal-search').value.trim().toLowerCase(),src=$('origin-filter').value;
 const entries=f.entries.filter(e=>(src==='all'||(src==='auto'&&!e.manual)||(src==='manual'&&e.manual))&&(!q||e.number.toLowerCase().includes(q)||e.description.toLowerCase().includes(q)||e.date.includes(q))).slice().reverse();
 const records=new Map((S.raw.accounting_journal||[]).map(row=>[String(row.id),row]));
 $('journal-body').innerHTML=entries.map(e=>{
 const value=e.lines.reduce((sum,line)=>sum+line.debit,0),manual=records.get(e.sourceRecordId);
 const blocked=e.manual?journalEditReason(manual,S.raw):'القيد التلقائي يُعدّل من مستنده الأصلي.';
 const edit=e.manual&&!blocked?`<button type="button" data-editjournal="${escapeHtml(e.sourceRecordId)}" class="px-2 py-1 text-indigo-700 hover:bg-indigo-50 rounded-lg font-bold text-xs no-print"><i class="fa-solid fa-pen"></i> تعديل</button>`:'';
 const reversed=manual?.reversalOf||e.description.includes('عكس القيد');
 const rows=e.lines.map(l=>{const acc=accountById(l.accountId);return `<tr class="border-t border-slate-100 hover:bg-slate-50/60"><td class="py-2 px-3 font-semibold text-slate-800">${escapeHtml((acc?.code||'')+' - '+(acc?.name||l.accountId))}</td><td class="py-2 px-3 text-slate-500 text-xs">${escapeHtml(l.note||'-')}</td><td class="py-2 px-3 text-left tabular-nums font-bold ${l.debit>0?'text-emerald-700':'text-slate-300'}">${moneyC(l.debit)}</td><td class="py-2 px-3 text-left tabular-nums font-bold ${l.credit>0?'text-indigo-700':'text-slate-300'}">${moneyC(l.credit)}</td></tr>`}).join('');
 const sourceLabel=e.manual?'قيد يدوي':'تلقائي من '+({'invoices':'المبيعات','cogs':'تكلفة المبيعات','returns':'المرتجعات','return-cost':'تكلفة المرتجعات','purchases':'المشتريات','vouchers':'السندات','expenses':'المصروفات'}[e.source]||e.source);
 return `<div class="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm"><div class="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2"><div class="flex items-center gap-3 flex-wrap"><span class="px-2.5 py-1 bg-indigo-600 text-white text-xs font-extrabold rounded-lg tabular-nums">${escapeHtml(e.number)}</span><span class="text-xs font-bold text-slate-500 tabular-nums"><i class="fa-regular fa-calendar ml-1"></i>${escapeHtml(e.date)}</span><span class="text-sm font-extrabold text-slate-800">${escapeHtml(e.description)}</span></div><div class="flex items-center gap-3"><span class="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">${escapeHtml(sourceLabel)}</span>${!e.manual?'<span class="text-xs text-slate-500 no-print">يُعدّل من المستند الأصلي</span>':''}<span class="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 tabular-nums">إجمالي القيد: ${moneyC(value)}</span>${edit}${e.manual&&!blocked&&!reversed?`<button type="button" data-reverse="${escapeHtml(e.sourceRecordId)}" title="إنشاء قيد عكسي" class="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition text-xs no-print"><i class="fa-solid fa-rotate-left"></i></button>`:''}</div></div><div class="overflow-x-auto"><table class="w-full text-right text-xs"><thead><tr class="text-slate-400 bg-white"><th class="py-2 px-3 font-bold">الحساب</th><th class="py-2 px-3 font-bold">البيان التفصيلي</th><th class="py-2 px-3 w-32 text-left font-bold">مدين</th><th class="py-2 px-3 w-32 text-left font-bold">دائن</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
 }).join('')||'<div class="py-12 text-center space-y-3"><div class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl"><i class="fa-solid fa-file-circle-question"></i></div><p class="text-sm font-bold text-slate-600">لا توجد قيود محاسبية مسجلة حالياً</p><button type="button" id="journal-empty-add" class="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl">إضافة أول قيد محاسبي</button></div>';
}
function renderBalance(f){
 function rows(root){let out='';const walk=(id,depth)=>{for(const a of sortedChildren(id)){const val=f.balances[a.id]||0;const amount=moneyC(a.nature==='credit'?-val:val);out+=`<div class="flex items-center justify-between py-1.5 ${a.isGroup?'font-extrabold text-slate-800 border-b border-slate-100 mt-2':'text-slate-600 pr-4'}"><div class="flex items-center gap-2" style="padding-right:${depth*12}px"><span class="text-xs text-slate-400 tabular-nums">${escapeHtml(a.code)}</span><span>${escapeHtml(a.name)}</span></div><span class="tabular-nums ${a.isGroup?'text-slate-900':'font-semibold'}">${amount}</span></div>`;if(a.isGroup)walk(a.id,depth+1)}};walk(root,0);return out||'<p class="text-xs text-slate-400 py-2">لا توجد بنود مسجلة</p>'}
 $('balance-assets').innerHTML=rows('1');
 $('balance-right').innerHTML=`<div><div class="flex items-center justify-between bg-slate-100 px-3 py-1.5 rounded-lg font-extrabold text-slate-800 text-xs mb-1"><span>الخصوم (الالتزامات)</span><span class="tabular-nums">${moneyC(f.liabilities)}</span></div>${rows('2')}</div><div class="pt-2"><div class="flex items-center justify-between bg-slate-100 px-3 py-1.5 rounded-lg font-extrabold text-slate-800 text-xs mb-1"><span>حقوق الملكية</span><span class="tabular-nums">${moneyC(f.equity+f.profit)}</span></div>${rows('3')}<div class="flex items-center justify-between py-2 pr-4 mt-1 rounded-lg px-2 ${f.profit>=0?'bg-emerald-50/80 text-emerald-800':'bg-rose-50/80 text-rose-800'} font-bold"><span class="flex items-center gap-1.5"><i class="fa-solid ${f.profit>=0?'fa-arrow-trend-up':'fa-arrow-trend-down'} text-xs"></i>${f.profit>=0?'صافي ربح الفترة (الإيرادات - المصروفات)':'صافي خسارة الفترة'}</span><span class="tabular-nums font-extrabold">${moneyC(f.profit)}</span></div></div>`;
}
function renderTrial(f){
 let td=0,tc=0;
 const badges={asset:'bg-emerald-50 text-emerald-700 border-emerald-200',liability:'bg-amber-50 text-amber-700 border-amber-200',equity:'bg-purple-50 text-purple-700 border-purple-200',revenue:'bg-sky-50 text-sky-700 border-sky-200',expense:'bg-rose-50 text-rose-700 border-rose-200'};
 const rows=S.accounts.filter(a=>!a.isGroup).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})).map(a=>{const value=f.balances[a.id]||0,d=Math.max(0,value),c=Math.max(0,-value);td+=d;tc+=c;return `<tr class="hover:bg-slate-50"><td class="py-2.5 px-4 tabular-nums font-bold text-slate-700">${escapeHtml(a.code)}</td><td class="py-2.5 px-4 font-semibold text-slate-800">${escapeHtml(a.name)}</td><td class="py-2.5 px-4"><span class="text-xs px-2 py-0.5 rounded-full border ${badges[a.category]||''}">${CATEGORIES[a.category]}</span></td><td class="py-2.5 px-4 text-left tabular-nums font-bold ${d>0?'text-emerald-700':'text-slate-300'}">${moneyC(d)}</td><td class="py-2.5 px-4 text-left tabular-nums font-bold ${c>0?'text-indigo-700':'text-slate-300'}">${moneyC(c)}</td></tr>`}).join('');
 $('trial-body').innerHTML=rows;$('trial-debit').textContent=moneyC(td);$('trial-credit').textContent=moneyC(tc);
}
function fillFiscalYears(){const years=S.raw.settings?.find(x=>x.key==='store_config')?.financialYears||[];const cur=$('fiscal-filter').value;const ids=new Map();for(const y of years)ids.set(y.id,y.name||y.id);for(const x of S.entries){if(x.financialYearId&&!ids.has(x.financialYearId))ids.set(x.financialYearId,x.financialYearId)}$('fiscal-filter').innerHTML='<option value="all">جميع الفترات</option>'+[...ids].map(([id,name])=>`<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('');$('fiscal-filter').value=ids.has(cur)||cur==='all'?cur:'all'}

function showCoverage(){
 const issues=[...new Set(S.warnings)].filter(msg=>
   !msg.includes('تكلفة بعض فواتير المبيعات قد لا تكون مسجلة تاريخياً') &&
   !msg.includes('ملاحظة محاسبية')
 );
 $('coverage-notice').textContent=issues.length?issues.slice(0,3).join('  •  '):'';
 $('coverage-notice').hidden=!issues.length;
 $('live-status').textContent=`${S.entries.filter(x=>!x.manual).length} قيد تلقائي + ${S.entries.filter(x=>x.manual).length} قيد يدوي من بيانات الشركة الحالية.`;
}

async function loadAll(){if(S.loading)return;S.loading=true;$('live-status').textContent='جارٍ تحميل السجلات الفعلية للشركة…';try{S.db?.close();S.db=await openDB();const pairs=await Promise.all(tableNames.map(async name=>[name,await readStore(S.db,name)]));S.companyRaw=Object.fromEntries(pairs);S.raw=scopeAccounting({...S.companyRaw});S.warnings=[];applyAccounts();S.entries=buildAutomaticEntries();fillFiscalYears();showCoverage();render()}catch(e){console.error('[CashTop accounting]',e);showToast('خطأ في قراءة بيانات المحاسبة: '+e.message,true);$('live-status').textContent='تعذر قراءة قاعدة البيانات'}finally{S.loading=false}}
function parentOptions(except=''){const banned=new Set([except]);const walk=id=>{for(const child of sortedChildren(id)){banned.add(child.id);walk(child.id)}};if(except)walk(except);return S.accounts.filter(a=>a.isGroup&&!a.dynamic&&!banned.has(a.id)).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})).map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.code+' — '+a.name)}</option>`).join('')}
function suggestCode(parentId){const p=accountById(parentId);if(!p)return'';const used=new Set(S.accounts.map(a=>a.code));for(let i=1;i<1000;i++){const code=p.code+(i<10?'0':'')+i;if(!used.has(code))return code}return p.code+'-'+uuid().slice(0,7)}
function openAccount(parentId='11',edit=''){
 const a=edit?accountById(edit):null;
 $('account-modal-title').innerHTML=a?'<i class="fa-solid fa-sliders text-indigo-600"></i><span>تعديل بيانات الحساب</span>':'<i class="fa-solid fa-folder-plus text-indigo-600"></i><span>إضافة حساب فرعي جديد</span>';
 $('account-edit-id').value=edit;$('account-parent').innerHTML=parentOptions(edit);$('account-parent').value=a?.parentId||parentId;
 $('account-name').value=a?.name||'';$('account-code').value=a?.code||suggestCode($('account-parent').value);
 $('account-nature').value=a?.nature||accountById($('account-parent').value)?.nature||'debit';$('account-group').value=String(a?.isGroup||false);
 $('account-group').disabled=!!(a&&(sortedChildren(a.id).length||hasMovements(a.id)));
 $('account-opening').value='0';$('account-opening').disabled=!!a||$('account-group').value==='true';
 $('opening-balance-wrapper').classList.toggle('opacity-40',!!a||$('account-group').value==='true');
 $('opening-balance-hint').hidden=!!a||$('account-group').value==='true';
 $('account-modal').hidden=false; document.body.classList.add('ct-modal-open'); const f=$('account-form'); if(f) f.scrollTop=0; }
function hasMovements(id){return S.entries.some(e=>e.lines.some(l=>l.accountId===id))}
async function writeAccountAndOpening(record,entry){
 if(!S.db)throw Error('قاعدة البيانات غير متصلة');
 await new Promise((resolve,reject)=>{const tx=S.db.transaction(['accounting_coa','accounting_journal'],'readwrite');const operations=[{storeName:'accounting_coa',type:'put',value:record},{storeName:'accounting_journal',type:'put',value:entry}];
 const write=()=>operations.forEach(op=>tx.objectStore(op.storeName).put(op.value));
 if(parent.CashTopTrialValidateWrites)parent.CashTopTrialValidateWrites(tx,operations,write,reject);
 else write();
 tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('فشل الترحيل المتوازن'))});
 for(const [store,row] of [['accounting_coa',record],['accounting_journal',entry]]){try{const cloud=parent.OscarCloudSync;if(cloud?.captureStoreChange){const ok=await cloud.captureStoreChange(store,row,{localUserWrite:true});if(!ok)S.warnings.push('قيد افتتاحي محفوظ محلياً؛ المزامنة تحتاج إلى مراجعة')}}catch(e){S.warnings.push('قيد افتتاحي محفوظ محلياً؛ قد تتطلب المزامنة إعادة محاولة')}try{parent.dispatchEvent(new CustomEvent('oscar:db-mutation',{detail:{storeName:store,value:row,action:'update'}}))}catch{}}
}
async function saveAccount(ev){
 ev.preventDefault();const id=$('account-edit-id').value,old=id?accountById(id):null,parentId=$('account-parent').value,parentAcc=accountById(parentId),name=$('account-name').value.trim(),code=$('account-code').value.trim(),nature=$('account-nature').value,isGroup=$('account-group').value==='true',rawOpening=$('account-opening').value,opening=cents(rawOpening);
 if(!name||!code||!parentAcc?.isGroup)return showToast('الرجاء إدخال اسم الحساب ورقمه وحسابه الأب',true);
 if(S.accounts.some(a=>a.code===code&&a.id!==id))return showToast('رمز الحساب مستخدم بالفعل',true);
 if(old&&(old.system||old.dynamic))return showToast('لا يمكن تعديل الحساب النظامي أو المربوط تلقائياً',true);
 if(old&&(old.parentId!==parentId||old.nature!==nature||old.isGroup!==isGroup)&&hasMovements(old.id))return showToast('لا يمكن تغيير طبيعة حساب أو نقله بعد ترحيل حركات عليه',true);
 if(old?.isGroup&&!isGroup&&sortedChildren(old.id).length)return showToast('لا يمكن تحويل حساب لديه أبناء إلى حساب فرعي',true);
 if(!old&&(Number(rawOpening)<0||!Number.isFinite(Number(rawOpening))))return showToast('الرصيد الافتتاحي غير صحيح',true);
 const record={id:id||'acct-'+uuid(),branchId:currentBranch(),parentId,category:parentAcc.category,code,name,nature,isGroup,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),deletedAt:null};
 try{
  if(!old&&!isGroup&&opening>0){
   const offset=accountById('3105');if(!offset||offset.isGroup)throw Error('حساب الأرصدة الافتتاحية غير متوفر');
   const d=nature==='debit'?{accountId:record.id,debit:opening/100,credit:0,note:'رصيد افتتاحي'}:{accountId:offset.id,debit:opening/100,credit:0,note:'مقابل رصيد افتتاحي'};
   const c=nature==='debit'?{accountId:offset.id,debit:0,credit:opening/100,note:'مقابل رصيد افتتاحي'}:{accountId:record.id,debit:0,credit:opening/100,note:'رصيد افتتاحي'};
   const entry={id:'journal-'+uuid(),branchId:currentBranch(),number:'OB-'+nowDay().replace(/-/g,'')+'-'+uuid().slice(0,6),date:nowDay(),description:'إثبات رصيد افتتاحي لحساب '+name,financialYearId:($('fiscal-filter').value==='all'?'fy-initial':$('fiscal-filter').value),source:'manual',createdAt:new Date().toISOString(),lines:[d,c]};
   await writeAccountAndOpening(record,entry);
  } else await writeRecord('accounting_coa',record);
  $('account-modal').hidden=true;document.body.classList.remove('ct-modal-open');await loadAll();showToast('تم حفظ الحساب'+(!old&&opening>0&&!isGroup?' والقيد الافتتاحي المتوازن':'')+' بنجاح');
 }catch(e){showToast(e.message,true)}
}
async function deleteAccount(id){
 const account=accountById(id);
 if(!account||account.system||account.dynamic)return;
 const branch=currentBranch();
 const reason=(cents(account.balance)||cents(account.openingBalance))?'رصيد الحساب يجب أن يكون صفرًا.':accountDeleteReason(id,S.companyRaw||S.raw);
 if(reason)return showToast(reason,true);
 if(!await askConfirm('حذف حساب من الشجرة','حذف الحساب '+account.code+' - '+account.name+'؟'))return;
 try{
  if(branch!==currentBranch())throw Error('تغيّر الفرع. أعد المحاولة.');
  await writeAccountingChecked(['accounting_coa','accounting_journal','expenses','vouchers'],data=>{
   const latest=data.accounting_coa.find(row=>row.id===id);
   if(!accountingAlive(latest)||normalizeBranch(latest)!==branch)throw Error('الحساب غير موجود في الفرع الحالي.');
   if(cents(latest.balance)||cents(latest.openingBalance))throw Error('رصيد الحساب يجب أن يكون صفرًا.');
   const linked=accountDeleteReason(id,data);
   if(linked)throw Error(linked);
   const stamp=new Date().toISOString();
   return [{storeName:'accounting_coa',type:'put',value:{...latest,deletedAt:stamp,updatedAt:stamp}}];
  });
  await loadAll();showToast('تم حذف الحساب من شجرة الحسابات');
 }catch(error){showToast(error.message,true)}
}
function leafOptions(selected=''){return '<option value="">اختر الحساب الفرعي</option>'+S.accounts.filter(a=>!a.isGroup).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})).map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===selected?'selected':''}>${escapeHtml(a.code+' — '+a.name)}</option>`).join('')}
function addLine(accountId='',line=null){
 const body=$('je-lines'),tr=document.createElement('tr');tr.className='je-line-row hover:bg-slate-50/60';
 tr.innerHTML=`<td class="p-2"><select class="je-account w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-indigo-500">${leafOptions(accountId)}</select></td><td class="p-2"><input type="number" min="0" step="0.01" class="je-d w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-left tabular-nums text-emerald-700 focus:outline-none focus:border-emerald-500" placeholder="0.00"></td><td class="p-2"><input type="number" min="0" step="0.01" class="je-c w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-left tabular-nums text-indigo-700 focus:outline-none focus:border-indigo-500" placeholder="0.00"></td><td class="p-2"><input type="text" maxlength="180" class="je-note w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-indigo-500" placeholder="شرح السطر..."></td><td class="p-2 text-center"><button type="button" data-remove-line class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"><i class="fa-solid fa-trash-can text-xs"></i></button></td>`;
 if(line){
  tr.querySelector('.je-d').value=line.debit||'';
  tr.querySelector('.je-c').value=line.credit||'';
  tr.querySelector('.je-note').value=line.note||'';
 }
 body.appendChild(tr);tr.addEventListener('input',e=>{if(e.target.classList.contains('je-d')&&num(e.target.value)>0)tr.querySelector('.je-c').value='';if(e.target.classList.contains('je-c')&&num(e.target.value)>0)tr.querySelector('.je-d').value='';recalcJournal()});tr.addEventListener('change',recalcJournal);
}
function showJournal(record=null,account=''){
 S.editingJournal=record;
 const day=nowDay();
 $('journal-modal-heading').textContent=record?'تعديل القيد المحاسبي':'إضافة قيد محاسبي جديد (القيد المزدوج)';
 $('save-je-label').textContent=record?'حفظ التعديلات':'حفظ وترحيل القيد';
 $('je-number').value=record?.number||'JV-'+day.replace(/-/g,'')+'-'+uuid().replace(/-/g,'').slice(0,6).toUpperCase();
 $('je-date').value=record?date10(record.date)||day:day;
 $('je-description').value=record?.description||'';
 $('je-lines').replaceChildren();
 if(record)for(const line of record.lines)addLine(line.accountId,line);
 else{addLine(account);addLine()}
 recalcJournal();
 $('journal-modal').hidden=false;
 document.body.classList.add('ct-modal-open');
 const scroll=$('journal-modal').querySelector('.overflow-y-auto');
 if(scroll)scroll.scrollTop=0;
}
function newJournal(account=''){showJournal(null,account)}
function editJournal(id){
 const record=(S.raw.accounting_journal||[]).find(row=>row.id===id);
 const blocked=journalEditReason(record,S.raw);
 if(blocked)return showToast(blocked,true);
 showJournal(record);
}
function inputJournal(){const rows=[...$('je-lines').querySelectorAll('tr')],lines=[];let d=0,c=0,invalid=false;for(const row of rows){const accountId=row.querySelector('.je-account').value,rawD=row.querySelector('.je-d').value,rawC=row.querySelector('.je-c').value,debit=cents(rawD),credit=cents(rawC),note=row.querySelector('.je-note').value.trim();if(debit<0||credit<0||!Number.isFinite(Number(rawD||0))||!Number.isFinite(Number(rawC||0))||debit&&credit){invalid=true;continue}if(debit||credit){if(!accountById(accountId)||accountById(accountId).isGroup){invalid=true;continue}lines.push({accountId,debit:debit/100,credit:credit/100,note});d+=debit;c+=credit}}return{lines,d,c,valid:!invalid&&lines.length>=2&&d>0&&d===c}}
function recalcJournal(){
 const j=inputJournal();$('je-debit').textContent=moneyC(j.d);$('je-credit').textContent=moneyC(j.c);$('je-diff').textContent=moneyC(Math.abs(j.d-j.c));
 const status=$('je-status'),banner=$('je-balance-banner');
 const canSave=j.valid&&!!$('je-description').value.trim()&&!!$('je-date').value;
 if(j.d===0&&j.c===0){status.innerHTML='<i class="fa-solid fa-circle-info"></i> أدخل المبالغ المدينة والدائنة';status.className='px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 bg-slate-200 text-slate-700';banner.className='p-3.5 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 border-slate-200'}
 else if(!j.valid){status.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> القيد غير متوازن أو يوجد حساب ناقص';status.className='px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 bg-rose-600 text-white';banner.className='p-3.5 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 bg-rose-50/70 border-rose-200'}
 else{status.innerHTML='<i class="fa-solid fa-circle-check"></i> القيد متوازن وجاهز للترحيل';status.className='px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 bg-emerald-600 text-white';banner.className='p-3.5 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 bg-emerald-50/70 border-emerald-200'}
 $('save-je').disabled=S.savingJournal||!canSave;
}
async function saveJournal(){
 if(S.savingJournal)return;
 const form=inputJournal(),date=$('je-date').value,description=$('je-description').value.trim(),original=S.editingJournal;
 if(!form.valid||!description||!date||date10(date)!==date)return showToast('القيد غير مكتمل أو غير متوازن',true);
 const number=$('je-number').value,branch=currentBranch(),selectedYear=$('fiscal-filter').value;
 S.savingJournal=true;
 $('save-je').disabled=true;
 try{
  if(date>nowDay()&&date!==date10(original?.date)&&!await askConfirm('تاريخ القيد في المستقبل','هل تريد حفظ القيد بهذا التاريخ؟'))return;
  if(branch!==currentBranch())throw Error('تغيّر الفرع. افتح القيد من جديد.');
  const stamp=new Date().toISOString(),runtime=parent.OscarActivation?.readRuntime?.(),actor=runtime?.account;
  const id=original?.id||'journal-'+uuid();
  await writeAccountingChecked(['settings','accounting_journal','accounting_coa'],data=>{
   const settings=accountingSettings(data);
   const periods=settings.financialYears||[];
   const latest=original?data.accounting_journal.find(row=>row.id===id):null;
   if(original){
    const blocked=journalEditReason(latest,data);
    if(blocked)throw Error(blocked);
    if(JSON.stringify(latest)!==JSON.stringify(original))throw Error('تغيّر القيد في جلسة أخرى. أعد فتحه قبل الحفظ.');
   }
   const year=original?(latest.financialYearId||periods[0]?.id||settings.activeFinancialYearId||'fy-initial'):
    (selectedYear==='all'?settings.activeFinancialYearId||'fy-initial':selectedYear);
   const period=periods.find(row=>row.id===year);
   if(period?.status==='closed')throw Error('الفترة المالية مغلقة.');
   if(original&&date!==date10(original.date)&&((period?.startDate&&date<date10(period.startDate))||
      (period?.endDate&&date>date10(period.endDate))))throw Error('تاريخ القيد خارج فترته المالية.');
   for(const line of form.lines){
    const account=accountById(line.accountId);
    if(!account||account.isGroup)throw Error('أحد الحسابات غير صالح للترحيل.');
    if(!account.system&&!account.dynamic&&!data.accounting_coa.some(row=>row.id===account.id&&accountingAlive(row)&&!row.isGroup))
     throw Error('أُزيل أحد الحسابات المختارة. راجع سطور القيد.');
   }
   const entry={...latest,id,branchId:latest?.branchId||branch,number,date,description,financialYearId:latest?.financialYearId||year,
    lines:form.lines,source:'manual',createdAt:latest?.createdAt||stamp,updatedAt:stamp};
   const writes=[{storeName:'accounting_journal',type:'put',value:entry}];
   if(original)writes.push({storeName:'audit_logs',type:'put',value:{
    id:'journal-edit-'+uuid(),type:'accounting_journal_edit',action:'تعديل قيد محاسبي',date:stamp,timestamp:stamp,
    branchId:entry.branchId,financialYearId:year,targetId:id,targetType:'ACCOUNTING_JOURNAL',referenceNumber:number,
    userId:actor?.id||'',userName:actor?.name||'',details:'تعديل القيد '+number,
    before:{date:latest.date,description:latest.description,lines:latest.lines},
    after:{date:entry.date,description:entry.description,lines:entry.lines}
   }});
   return writes;
  },original?['audit_logs']:[]);
  S.editingJournal=null;
  $('journal-modal').hidden=true;
  document.body.classList.remove('ct-modal-open');
  await loadAll();setTab('journal');
  showToast(original?'تم تعديل القيد وحفظ سجل التعديل.':'تم حفظ وترحيل القيد المتوازن');
 }catch(error){showToast('فشل الحفظ: '+error.message,true)}
 finally{S.savingJournal=false;recalcJournal()}
}
async function reverseJournal(id){const orig=(S.raw.accounting_journal||[]).find(e=>e.id===id);if(!orig)return;const already=(S.raw.accounting_journal||[]).some(e=>e.reversalOf===id&&!e.deletedAt);if(already)return showToast('تم إنشاء قيد عكسي لهذه العملية بالفعل',true);if(!await askConfirm('تأكيد القيد العكسي','إنشاء قيد عكسي متوازن بدلاً من حذف القيد؟'))return;const newEntry={id:'journal-'+uuid(),branchId:currentBranch(),number:'RV-'+nowDay().replace(/-/g,'')+'-'+uuid().slice(0,6).toUpperCase(),date:nowDay(),description:'عكس القيد '+orig.number+' — '+orig.description,financialYearId:orig.financialYearId,source:'manual',reversalOf:id,createdAt:new Date().toISOString(),lines:orig.lines.map(l=>({accountId:l.accountId,debit:l.credit,credit:l.debit,note:'عكس — '+(l.note||'')}))};try{await writeRecord('accounting_journal',newEntry);await loadAll();showToast('تم إنشاء قيد عكسي دون فقدان تاريخ العمليات')}catch(e){showToast(e.message,true)}}
function bind(){
 document.querySelectorAll('[data-tab]').forEach(x=>x.addEventListener('click',()=>setTab(x.dataset.tab)));
 $('as-of').value=nowDay();$('as-of').addEventListener('change',render);$('fiscal-filter').addEventListener('change',render);$('coa-search').addEventListener('input',()=>{if(S.tab==='coa')render()});$('journal-search').addEventListener('input',render);$('origin-filter').addEventListener('change',render);
 $('new-account').addEventListener('click',()=>openAccount());$('new-journal').addEventListener('click',()=>newJournal());$('journal-add-inside').addEventListener('click',()=>newJournal());$('reload-data').addEventListener('click',loadAll);
 $('expand-all').addEventListener('click',()=>{S.expanded=new Set(S.accounts.filter(a=>a.isGroup).map(a=>a.id));render()});$('collapse-all').addEventListener('click',()=>{S.expanded.clear();render()});
 document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>{const m=$(x.dataset.close);m.hidden=true;document.body.classList.remove('ct-modal-open')}));document.querySelectorAll('#account-modal,#journal-modal,#confirm-modal').forEach(x=>x.addEventListener('pointerdown',ev=>{if(ev.target===x){if(x.id==='confirm-modal')return $('confirm-cancel-btn').click();x.hidden=true;document.body.classList.remove('ct-modal-open')}}));
 $('coa-body').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;if(d.movement)accountMovements(d.movement);else if(d.toggle){S.expanded.has(d.toggle)?S.expanded.delete(d.toggle):S.expanded.add(d.toggle);render()}else if(d.addchild)openAccount(d.addchild);else if(d.editaccount)openAccount('',d.editaccount);else if(d.deleteaccount)deleteAccount(d.deleteaccount);else if(d.withaccount)newJournal(d.withaccount)});
 $('account-parent').addEventListener('change',()=>{if(!$('account-edit-id').value){$('account-code').value=suggestCode($('account-parent').value);$('account-nature').value=accountById($('account-parent').value)?.nature||'debit'}});$('account-group').addEventListener('change',()=>{const hide=$('account-group').value==='true'||!!$('account-edit-id').value;$('account-opening').disabled=hide;$('opening-balance-wrapper').classList.toggle('opacity-40',hide);$('opening-balance-hint').hidden=hide});$('account-form').addEventListener('submit',saveAccount);
 $('add-je-line').addEventListener('click',()=>{addLine();recalcJournal()});$('je-lines').addEventListener('click',e=>{if(e.target.closest('[data-remove-line]')){if($('je-lines').children.length<3)return showToast('القيد يتطلب سطرين على الأقل',true);e.target.closest('tr').remove();recalcJournal()}});
 $('je-description').addEventListener('input',recalcJournal);$('je-date').addEventListener('change',recalcJournal);$('save-je').addEventListener('click',saveJournal);
 $('journal-body').addEventListener('click',e=>{const edit=e.target.closest('[data-editjournal]');if(edit)return editJournal(edit.dataset.editjournal);const b=e.target.closest('[data-reverse]');if(b)reverseJournal(b.dataset.reverse);if(e.target.closest('#journal-empty-add'))newJournal()});
 document.querySelectorAll('[data-print]').forEach(b=>b.addEventListener('click',()=>{document.body.classList.add(S.tab==='balance'?'print-balance':'print-trial');window.print()}));window.addEventListener('afterprint',()=>document.body.classList.remove('print-balance','print-trial'));
 $('data-menu-btn').addEventListener('click',()=>{$('data-menu-dropdown').hidden=!$('data-menu-dropdown').hidden});document.addEventListener('pointerdown',e=>{if(!$('data-menu-wrap').contains(e.target))$('data-menu-dropdown').hidden=true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('confirm-modal').hidden)return $('confirm-cancel-btn').click();document.querySelectorAll('#account-modal,#journal-modal,#confirm-modal').forEach(m=>m.hidden=true);document.body.classList.remove('ct-modal-open')}});
 let timer=null;const schedule=()=>{S.reportHistory=null;clearTimeout(timer);timer=setTimeout(loadAll,750)};try{parent.addEventListener('oscar:sync-applied',schedule);parent.addEventListener('oscar:db-mutation',e=>{if(['invoices','purchases','expenses','vouchers','accounts','customers','suppliers','transfers','accounting_coa','accounting_journal'].includes(e.detail?.storeName))schedule()});parent.addEventListener('oscar:activation-loaded',schedule)}catch{};
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule()});
}
const reportNames={
 income:"قائمة الدخل",balance:"الميزانية العمومية",aging:"أعمار الذمم المدينة",
 itemSales:"مجموع المبيعات حسب الصنف",customerSales:"مجموع المبيعات حسب الزبون",
 itemProfit:"نسبة ربح كل صنف",customerProfit:"الربح من كل زبون",flow:"قائمة التدفقات النقدية"
};

function reportContext() {
 try{return parent.__CT_REPORT_CONTEXT__||{}}catch{return {}}
}

function financialAccountsTree(root) {
 const ids=new Set();
 function visit(id){
  if(ids.has(id))return;
  ids.add(id);
  for(const account of sortedChildren(id))visit(account.id);
 }
 visit(root);
 return ids;
}

function accountMovements(id) {
 const account=accountById(id);
 if(!account)return;
 const descendants=financialAccountsTree(id);
 let running=0;
 const rows=[];
 for(const entry of selectedEntries()){
  const moves=entry.lines.filter(line=>descendants.has(line.accountId));
  if(!moves.length)continue;
  const debit=moves.reduce((sum,line)=>sum+line.debit,0);
  const credit=moves.reduce((sum,line)=>sum+line.credit,0);
  running+=debit-credit;
  rows.push([entry.date,entry.number,entry.description,debit/100,credit/100,(account.nature==="credit"?-running:running)/100]);
 }
 const title=account.code+" — "+account.name;
 $("movement-title").textContent=title;
 renderFinanceTable($("movement-table"),["التاريخ","المرجع","البيان","مدين","دائن","الرصيد"],rows);
 $("account-movements").showModal();
}

function renderFinanceTable(target,headers,rows){
 const cells=(row,tag)=>row.map(cell=>`<${tag}>${escapeHtml(typeof cell==="number"?cell.toLocaleString("en-US",{maximumFractionDigits:2}):cell)}</${tag}>`).join("");
 target.innerHTML=`<table><thead><tr>${cells(headers,"th")}</tr></thead><tbody>${rows.length
  ?rows.map(row=>`<tr>${cells(row,"td")}</tr>`).join("")
  :`<tr><td colspan="${headers.length}">لا توجد حركات في الفترة المحددة</td></tr>`}</tbody></table>`;
}

function ledgerReportRows(raw,kind,selection) {
 const posted=selection.entries.filter(row=>row.date<=selection.end);
 const period=posted.filter(row=>!selection.start||row.date>=selection.start);
 const accounts=new Map(selection.accounts.map(row=>[row.id,row]));
 const totals=new Map();
 for(const entry of kind==="balance"?posted:period){
  for(const line of entry.lines)totals.set(line.accountId,(totals.get(line.accountId)||0)+line.debit-line.credit);
 }
 const byCategory=categories=>selection.accounts.filter(account=>!account.isGroup&&categories.includes(account.category))
  .map(account=>[account,totals.get(account.id)||0]).filter(([,value])=>value!==0);
 if(kind==="income"){
  const lines=byCategory(["revenue","expense"]);
  const revenue=-lines.filter(([account])=>account.category==="revenue").reduce((sum,[,amount])=>sum+amount,0);
  const expenses=lines.filter(([account])=>account.category==="expense").reduce((sum,[,amount])=>sum+amount,0);
  return {headers:["البند","المبلغ"],rows:[
   ...lines.map(([account,amount])=>[account.code+" — "+account.name,(account.category==="revenue"?-amount:amount)/100]),
   ["إجمالي الإيرادات",revenue/100],["إجمالي المصروفات",expenses/100],["صافي الدخل",(revenue-expenses)/100]
  ]};
 }
 if(kind==="balance"){
  const lines=byCategory(["asset","liability","equity"]);
  const amounts=category=>lines.filter(([account])=>account.category===category).reduce((sum,[,value])=>sum+value,0);
  const assets=amounts("asset"),liabilities=-amounts("liability"),equity=-amounts("equity");
  const profit=-byCategory(["revenue","expense"]).reduce((sum,[,amount])=>sum+amount,0);
  return {headers:["التصنيف","الحساب","الرصيد"],rows:[
   ...lines.map(([account,amount])=>[CATEGORIES[account.category],account.code+" — "+account.name,(account.category==="asset"?amount:-amount)/100]),
   ["الأصول","إجمالي الأصول",assets/100],["الخصوم","إجمالي الخصوم",liabilities/100],
   ["حقوق الملكية","نتيجة الأعمال المتراكمة",profit/100],["حقوق الملكية","إجمالي حقوق الملكية",(equity+profit)/100],
   ["","إجمالي الخصوم وحقوق الملكية",(liabilities+equity+profit)/100]
  ]};
 }
 if(kind==="aging")return agingReport(raw,posted,selection.end);
 if(kind==="flow")return cashFlowReport(accounts,posted,period);
 return salesReport(raw.invoices||[],kind,selection.start,selection.end);
}

function agingReport(raw,entries,end) {
 const dateByInvoice=new Map((raw.invoices||[]).map(row=>[row.id,date10(row.dueDate||row.paymentDueDate)]));
 const parties=new Map((raw.customers||[]).map(row=>["customer:"+row.id,{name:row.name,bills:[],credits:0}]));
 for(const entry of entries){
  for(const line of entry.lines){
   const party=parties.get(line.accountId);
   if(!party)continue;
   if(line.debit)party.bills.push({amount:line.debit,due:dateByInvoice.get(entry.sourceRecordId)||entry.date});
   party.credits+=line.credit;
  }
 }
 const rows=[];
 for(const party of parties.values()){
  const buckets=[0,0,0,0,0];
  for(const bill of party.bills){
   const paid=Math.min(bill.amount,party.credits);
   party.credits-=paid;
   const days=Math.floor((Date.parse(end)-Date.parse(bill.due))/86400000);
   const bucket=days<=0?0:days<=30?1:days<=60?2:days<=90?3:4;
   buckets[bucket]+=bill.amount-paid;
  }
  const total=buckets.reduce((sum,value)=>sum+value,0);
  if(total)rows.push([party.name,...buckets.map(amount=>amount/100),total/100]);
 }
 return {headers:["العميل","غير مستحق","1–30 يومًا","31–60 يومًا","61–90 يومًا","أكثر من 90 يومًا","الإجمالي"],rows};
}

function cashFlowReport(accounts,posted,period) {
 const isCash=id=>{
  const account=accounts.get(id);
  return account?.parentId==="1101"||account?.parentId==="1102";
 };
 const buckets=new Map([["تشغيلية",[0,0]],["استثمارية",[0,0]],["تمويلية",[0,0]],["غير مصنفة",[0,0]]]);
 const kinds=account=>{
  if(!account||["2104","3105"].includes(account.id))return "غير مصنفة";
  if(account.parentId==="12"||account.id==="12")return "استثمارية";
  if(account.category==="equity"||["2105","2201"].includes(account.id))return "تمويلية";
  return "تشغيلية";
 };
 let delta=0;
 for(const entry of period){
  const cash=entry.lines.filter(line=>isCash(line.accountId)).reduce((sum,line)=>sum+line.debit-line.credit,0);
  if(!cash)continue;
  delta+=cash;
  const links=new Map();
  for(const line of entry.lines.filter(line=>!isCash(line.accountId))){
   const label=kinds(accounts.get(line.accountId));
   links.set(label,(links.get(label)||0)+line.credit-line.debit);
  }
  // The non-cash counterpart totals equal the net cash movement.
  for(const [kind,amount] of links){
   const bucket=buckets.get(kind);
   bucket[amount<0?1:0]+=Math.abs(amount);
  }
 }
 const closing=posted.reduce((sum,entry)=>sum+entry.lines.filter(line=>isCash(line.accountId))
  .reduce((total,line)=>total+line.debit-line.credit,0),0);
 return {headers:["النشاط","المقبوضات","المدفوعات","الصافي"],rows:[
  ["رصيد افتتاحي حسب القيود","","",(closing-delta)/100],
  ...[...buckets].map(([kind,[incoming,outgoing]])=>[kind,incoming/100,outgoing/100,(incoming-outgoing)/100]),
  ["صافي التدفق خلال الفترة","","",delta/100],["الرصيد الختامي حسب القيود","","",closing/100]
 ]};
}

function salesReport(invoices,kind,start,end) {
 const byItem=kind.startsWith("item"),profit=kind.endsWith("Profit"),groups=new Map();
 const add=(id,label,quantity,revenue,cost)=>{
  const group=groups.get(id)||{label,quantity:0,revenue:0,cost:0};
  group.quantity+=quantity;group.revenue+=revenue;group.cost+=cost;
  groups.set(id,group);
 };
 for(const invoice of invoices){
  const date=date10(invoice.date||invoice.createdAt);
  if(invoice.deletedAt||invoice.isDeleted||["draft","cancelled","canceled"].includes(invoice.status)||!date||date>end||(start&&date<start))continue;
  const sign=invoice.type==="return"||invoice.isReturn||num(invoice.grandTotal)<0?-1:1;
  const lines=invoice.items||[];
  const salesNet=Math.max(0,Math.abs(cents(invoice.grandTotal))-Math.abs(cents(invoice.taxTotal)));
  if(!byItem){
   add(invoice.customerId||"walkin",invoice.customerName||"زبون عام",1*sign,salesNet*sign,Math.abs(costs(lines))*sign);
   continue;
  }
  const amounts=lines.map(row=>Math.max(0,Math.abs(cents(num(row.unitPrice)*num(row.quantity)))-Math.abs(cents(row.discount))));
  const total=amounts.reduce((sum,amount)=>sum+amount,0);
  const allocatable=Math.max(0,salesNet-Math.abs(cents(invoice.shippingCost))-Math.abs(cents(invoice.additionalCharges)));
  let allocated=0,revenue=0;
  lines.forEach((row,index)=>{
   allocated+=amounts[index];
   const next=total?Math.round(allocatable*allocated/total):0;
   const key=(row.productId||row.productName||"غير محدد")+"|"+(row.unitId||row.unitName||"");
   add(key,(row.productName||"صنف")+(row.unitName?" — "+row.unitName:""),Math.abs(num(row.quantity))*sign,(next-revenue)*sign,Math.abs(costs([row]))*sign);
   revenue=next;
  });
 }
 const items=[...groups.values()].sort((a,b)=>b.revenue-a.revenue||a.label.localeCompare(b.label,"ar"));
 return {
  headers:[byItem?"الصنف والوحدة":"الزبون",byItem?"صافي الكمية":"صافي عدد الفواتير","صافي المبيعات",...(profit?["التكلفة","مجمل الربح","الهامش %"]:[])],
  rows:items.map(item=>[item.label,item.quantity,item.revenue/100,...(profit?[item.cost/100,(item.revenue-item.cost)/100,item.revenue>0?Math.round((item.revenue-item.cost)/item.revenue*10000)/100:0]:[])])
 };
}

function projectForReport(raw) {
 const original={raw:S.raw,accounts:S.accounts,warnings:S.warnings};
 try{
  S.raw=raw;S.warnings=[];
  applyAccounts();
  const entries=buildAutomaticEntries();
  return {entries,accounts:S.accounts,warnings:[...new Set(S.warnings)]};
 }finally{Object.assign(S,original)}
}

async function refreshReportHistory() {
 const context=reportContext();
 if(!context.hasCloud||S.historyLoading||S.reportHistory)return;
 if(!navigator.onLine){S.historyStatus="عرض السجلات المتاحة على هذا الجهاز دون اتصال";renderReports();return}
 S.historyLoading=true;
 S.historyStatus="جارٍ تحميل السجلات من المزامنة…";
 renderReports();
 try{
  const stores=["invoices","purchases","expenses","vouchers","transfers","accounting_journal"];
  const rows=await Promise.all(stores.map(store=>context.loadHistory(store,context.companyWide)));
  S.reportHistory=Object.fromEntries(stores.map((store,index)=>[store,rows[index]]));
  S.historyStatus="";
 }catch(error){S.historyStatus="تعذر تحميل كامل السجل من المزامنة. الأرقام المعروضة من البيانات المتاحة."}
 finally{S.historyLoading=false;if(S.tab==="reports")renderReports()}
}

function renderReports() {
 const context=reportContext();
 const branch=$("report-branch").value||currentBranch();
 const start=$("report-start").value,end=$("report-end").value||nowDay();
 const kind=$("report-kind").value||"income";
 $("report-note").textContent="";
 S.report=null;
 for(const button of document.querySelectorAll("[data-finance-export]"))button.disabled=true;
 if(!S.companyRaw)return;
 if(start&&start>end){$("report-note").textContent="تاريخ البداية بعد تاريخ النهاية";$("report-table").replaceChildren();return}
 if(context.showProfit===false&&["income","balance","itemProfit","customerProfit"].includes(kind)){
  $("report-note").textContent="هذا التقرير يتطلب صلاحية عرض الربح";$("report-table").replaceChildren();return;
 }
 const all=context.companyWide&&branch==="all";
 const optionsSet=new Set((context.branches||[]).map(row=>row.id));
 const scopeId=context.companyWide&&optionsSet.has(branch)?branch:currentBranch();
 const available={...S.companyRaw,...S.reportHistory};
 const raw=all?available:scopeAccounting({...available},scopeId);
 const projected=projectForReport(raw);
 const {headers,rows}=ledgerReportRows(raw,kind,{...projected,start,end});
 const branchName=all?"كل الشركة":(context.branches||[]).find(row=>row.id===scopeId)?.name||"الفرع الرئيسي";
 const period=kind==="balance"||kind==="aging"||!start?`حتى ${end}`:`${start} إلى ${end}`;
 const reportNotes={
  aging:"يُوزّع السداد على أقدم القيود أولًا. تُحتسب الأعمار من تاريخ الاستحقاق أو تاريخ الفاتورة عند غيابه.",
  flow:"الطريقة المباشرة حسب القيود النقدية المتاحة. تُستبعد التحويلات الداخلية ويظهر الحساب المعلق ضمن الحركات غير المصنفة.",
  itemProfit:"تُوزّع خصومات الفاتورة على البنود بنسبة قيمتها وتُحتسب التكلفة المسجلة وقت البيع.",
  customerProfit:"مجمل الربح يطرح تكلفة الأصناف المسجلة وقت البيع من صافي المبيعات."
 };
 const notes=[S.historyStatus,reportNotes[kind],...projected.warnings.slice(0,2)].filter(Boolean);
 $("report-note").textContent=notes.join(" • ");
 renderFinanceTable($("report-table"),headers,rows);
 S.report={title:reportNames[kind],subtitle:`${branchName} • ${period}`,headers,rows,
  settings:S.companyRaw.settings?.find(row=>row.key==="store_config")||{}};
 for(const button of document.querySelectorAll("[data-finance-export]"))button.disabled=!!S.historyLoading||typeof parent.CashTopFinanceExports!=="function";
}

function bindReports() {
 const context=reportContext();
 const branches=context.companyWide?(context.branches||[]):(context.branches||[]).filter(row=>row.id===currentBranch());
 $("report-branch").replaceChildren(
  ...(context.companyWide?[new Option("كل الشركة","all")]:[]),
  ...(branches.length?branches.map(row=>new Option(row.name,row.id)):[new Option("الفرع الحالي",currentBranch())]));
 $("report-branch").value=currentBranch();
 $("report-kind").replaceChildren(...Object.entries(reportNames)
  .filter(([key])=>context.showProfit!==false||!["income","balance","itemProfit","customerProfit"].includes(key))
  .map(([id,label])=>new Option(label,id)));
 $("report-end").value=nowDay();
 const firstMonth=nowDay().slice(0,7)+"-01";
 $("report-start").value=firstMonth;
 const update=()=>{
  $("report-start").disabled=["balance","aging"].includes($("report-kind").value);
  renderReports();
 };
 $("report-refresh").addEventListener("click",()=>{S.reportHistory=null;loadAll()});
 for(const id of ["report-kind","report-branch","report-start","report-end"])$(id).addEventListener("change",update);
 $("close-account-movements").addEventListener("click",()=>$("account-movements").close());
 $("coa-hide-zero").addEventListener("change",render);
 document.querySelectorAll("[data-finance-export]").forEach(button=>button.addEventListener("click",async()=>{
  if(!S.report)return;
  button.disabled=true;
  try{await parent.CashTopFinanceExports(button.dataset.financeExport,S.report)}
  catch(error){showToast(error.message,true)}
  finally{button.disabled=false}
 }));
 const open=()=>{if(parent.__CT_OPEN_FINANCE_REPORTS__){delete parent.__CT_OPEN_FINANCE_REPORTS__;setTab("reports")}};
 try{parent.addEventListener("ct:open-finance-reports",open);open()}catch{}
}

function fiscalOpening(data,period,stamp){
 const old={raw:S.raw,accounts:S.accounts,warnings:S.warnings};
 try{
  const unposted=new Set(['draft','held','pending','unposted','awaiting_approval','pending_approval','rejected']);
  const source={...data};
  for(const store of ['invoices','purchases','expenses','vouchers','transfers','accounting_journal']){
   source[store]=(data[store]||[]).filter(row=>!unposted.has(String(row.status||'').toLowerCase()));
  }
  S.raw=source;S.warnings=[];applyAccounts();
  const activity=buildAutomaticEntries();
  if(S.warnings.length)throw Error('توجد حركات لم يتمكن دفتر الأستاذ من ترحيلها. راجع المحاسبة قبل إغلاق الفترة المالية.');
  const categories=new Map(S.accounts.map(row=>[row.id,row.category]));
  const byBranch=new Map();
  const balances=branch=>{
   if(!byBranch.has(branch))byBranch.set(branch,new Map());
   return byBranch.get(branch);
  };
  const add=(rows,id,delta)=>rows.set(id,(rows.get(id)||0)+delta);
  for(const entry of activity){
   const rows=balances(entry.branchId||'main');
   for(const line of entry.lines){
    const category=categories.get(line.accountId);
    add(rows,category==='expense'||category==='revenue'?'3102':line.accountId,line.debit-line.credit);
   }
  }
  function matchControl(branch,id,amount) {
    for(const [source,rows] of byBranch) {
      const previous=rows.get(id)||0;
      if(source===branch)continue;
      if(previous){add(rows,id,-previous);add(rows,'3105',previous)}
    }
    const rows=balances(branch);
    const delta=amount-(rows.get(id)||0);
    add(rows,id,delta);
    add(rows,'3105',-delta);
  }
  for(const row of data.accounts||[])if(!row.deletedAt&&!row.isDeleted&&accountById('financial:'+row.id))
   matchControl(normalizeBranch(row),'financial:'+row.id,cents(row.balance));
  for(const row of data.customers||[])if(!row.deletedAt&&!row.isDeleted&&accountById('customer:'+row.id))
   matchControl(normalizeBranch(row),'customer:'+row.id,cents(row.balance));
  for(const row of data.suppliers||[])if(!row.deletedAt&&!row.isDeleted&&accountById('supplier:'+row.id))
   matchControl(normalizeBranch(row),'supplier:'+row.id,-cents(row.balance));
  const warehouse=new Map((data.warehouses||[]).map(row=>[row.id,row]));
  const products=new Map((data.products||[]).map(row=>[row.id,row]));
  const inventory=new Map();
  for(const position of data.stock||[]){
   if(position.deletedAt)continue;
   const branch=normalizeBranch(warehouse.get(position.warehouseId));
   const product=products.get(position.productId);
   const unitCost=position.averageCost??position.avgCost??product?.costPrice??0;
   let quantity=num(position.baseQuantity),value=0;
   const layers=(Array.isArray(product?.fifoBatches)?product.fifoBatches:[])
    .filter(layer=>layer.warehouseId===position.warehouseId&&num(layer.remainingBaseQty)>0)
    .sort((a,b)=>String(a.receivedAt||'').localeCompare(String(b.receivedAt||'')));
   for(const layer of layers){
    const used=Math.min(Math.max(quantity,0),num(layer.remainingBaseQty));
    quantity-=used;value+=used*num(layer.unitCost??unitCost);
   }
   add(inventory,branch,cents(value+quantity*num(unitCost)));
  }
  for(const branch of new Set([...byBranch.keys(),...inventory.keys()])){
   const rows=balances(branch);
   const delta=(inventory.get(branch)||0)-(rows.get('1104')||0);
   add(rows,'1104',delta);add(rows,'3105',-delta);
  }
  const entries=[];
  for(const [branchId,rows] of byBranch){
   if([...rows.values()].reduce((sum,n)=>sum+n,0)!==0)throw Error('رصيد افتتاحي غير متوازن.');
   const lines=[...rows].filter(([,amount])=>amount).map(([accountId,amount])=>({accountId,debit:Math.max(0,amount)/100,credit:Math.max(0,-amount)/100}));
   if(lines.length)entries.push({id:'journal-opening-'+period.id+'-'+branchId,date:period.startDate,number:'OB-'+period.id,
    branchId,description:'الأرصدة الافتتاحية بعد إغلاق الفترة المالية',lines,financialYearId:period.id,createdAt:stamp,source:'fiscal_opening'});
  }
  return entries;
 }finally{Object.assign(S,old)}
}
globalThis.CashTopPeriodLedger=fiscalOpening;

function init(){if(!$('journal-body'))return;bind();bindReports();loadAll()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
