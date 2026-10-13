import {getTenantId,getFromStore,getAllFromStore,queryStorePage,queryStoreStats,commitDistributionBatch} from './services__db.js?v=7.9.4.158-web-notifications';
import {isManagerAccess,normalizeEmployeePermissions} from './utils__permissions.js?v=7.9.4.158-web-notifications';
export const uid=(prefix='dist')=>prefix+'-'+crypto.randomUUID();
export const money=v=>Math.round((Number(v)||0)*100)/100;
export const number=v=>{const n=Number(String(v??'').replace(/[٠-٩]/g,c=>c.charCodeAt(0)-1632).replace(/٫/g,'.'));if(!Number.isFinite(n))throw Error('أدخل رقماً صحيحاً');return n};
export const states={draft:'مسودة',pending:'بانتظار الموافقة',approved:'معتمد',rejected:'مرفوض',closed:'مغلق'};
export const kinds={sale:'فاتورة بيع',load:'تحميل بضاعة',return_stock:'إرجاع للمخزن',damage:'تالف',receipt:'سند قبض',expense:'سند صرف',remit:'توريد نقدية',order:'طلب بيع',customer_return:'مرتجع عميل',commission_payment:'صرف عمولة',settlement:'تسوية يومية'};
export const isRep=app=>app.currentUser?.roleCode==='sales_rep'&&!app.currentUser?.isCompanyManager;
export const manager=app=>isManagerAccess({currentUser:app.currentUser,activeEmployee:app.activeEmployee});
export function assertManager(app){if(!manager(app))throw Error('هذه العملية متاحة للمدير فقط')}
export const permissions={sale:'البيع',load:'طلب تحميل',return_stock:'إرجاع بضاعة',damage:'تسجيل تالف',receipt:'تحصيل العملاء',expense:'سند صرف',order:'طلبات البيع',customer_return:'مرتجع العميل',remit:'توريد النقدية',settlement:'التسوية',negativeStock:'بيع يتجاوز المخزون',editPrice:'تعديل السعر'};
export function authorize(app,rep,operation){
 if(!rep || rep.companyId && rep.companyId!==getTenantId())throw Error('المندوب غير موجود في الشركة الحالية');
 if(manager(app))return;
 if(!isRep(app)||rep.id!==app.currentUser.id)throw Error('لا تملك صلاحية الوصول إلى هذا المندوب');
 if(!rep.active)throw Error('حساب المندوب موقوف');
 if(operation&&rep.distribution?.permissions?.[operation]!==true)throw Error('العملية غير مسموحة ضمن صلاحيات المندوب');
}
export async function repFor(app,id){const rep=await getFromStore('employees',id||app.currentUser.id);authorize(app,rep);if(rep.role!=='sales_rep'||!rep.distribution?.warehouseId)throw Error('أكمل إعداد مستودع المندوب أولاً');return rep}
export async function openShift(rep){const shift=await getFromStore('distribution_sessions','shift-active-'+rep.id);if(!shift||shift.status!=='open')throw Error('افتح وردية للمندوب قبل تسجيل العمليات');return shift}
class Work {
 constructor(app,rep,doc){this.app=app;this.rep=rep;this.doc=doc;this.ops=new Map();this.checks=[]}
 key(s,k){return s+'\u0001'+JSON.stringify(k)}
 async read(s,k){const op=this.ops.get(this.key(s,k));return op?op.value:(await getFromStore(s,k)||null)}
 async put(s,v){const k=s==='stock'?[v.productId,v.warehouseId]:s==='settings'?v.key:v.id;const key=this.key(s,k);const prev=this.ops.get(key);this.ops.set(key,{storeName:s,type:'put',before:prev?prev.before:await getFromStore(s,k)||null,value:{...v,companyId:getTenantId()}});return v}
 async guard(s,k){const before=await this.read(s,k);this.checks.push({storeName:s,key:k,before});return before}
 async balance(id,delta){const a=await this.read('accounts',id);if(!a)throw Error('الحساب المالي غير موجود');await this.put('accounts',{...a,balance:money(number(a.balance||0)+delta)});return a}
 async stock(product,warehouse,delta,unit,quantity,type){
 const old=await this.read('stock',[product.id,warehouse]);const next=number(old?.baseQuantity||0)+delta;if(next < -0.000001)throw Error('المخزون غير كافٍ: '+product.name);
 await this.put('stock',{...(old||{}),productId:product.id,warehouseId:warehouse,baseQuantity:next});
 await this.put('stock_movements',{id:this.doc.id+'-'+this.ops.size,date:this.doc.date,financialYearId:this.doc.financialYearId,repId:this.rep.id,distributionShiftId:this.doc.shiftId,productId:product.id,productName:product.name,warehouseId:warehouse,warehouseName:this.app.warehouses?.find(x=>x.id===warehouse)?.name||'مخزن فحص',type,unitName:unit?.name||product.baseUnitName,quantityInUnit:quantity,conversionFactor:number(unit?.conversionToBase||1),baseQuantityChange:delta,newBaseBalance:next,referenceId:this.doc.id,referenceType:'DISTRIBUTION',userId:this.app.currentUser.id,notes:this.doc.notes});
 }
 async journal(lines,description){const debit=money(lines.reduce((n,x)=>n+number(x.debit||0),0)),credit=money(lines.reduce((n,x)=>n+number(x.credit||0),0));if(Math.abs(debit-credit)>.001)throw Error('القيد غير متوازن');await this.put('distribution_journal',{id:'journal-'+this.doc.id,date:this.doc.date,repId:this.rep.id,branchId:this.rep.distribution.branchId,shiftId:this.doc.shiftId,financialYearId:this.doc.financialYearId,referenceId:this.doc.id,description,lines,debit,credit,currency:this.app.settings.currencySymbol,status:'approved'})}
 async customer(id,delta,type){const c=await this.read('customers',id);if(!c)throw Error('اختر عميلاً مسجلاً');if(!manager(this.app)&&!(this.rep.distribution.customerIds||[]).includes(id))throw Error('العميل غير مخصص للمندوب');const balance=money(number(c.balance||0)+delta);await this.put('customers',{...c,balance});await this.put('partner_statements',{id:'stmt-'+this.doc.id,date:this.doc.date,financialYearId:this.doc.financialYearId,partnerType:'customer',partnerId:id,partnerName:c.name,referenceType:type,referenceId:this.doc.id,referenceNumber:this.doc.number,description:kinds[this.doc.kind]+' '+this.doc.number,debit:Math.max(delta,0),credit:Math.max(-delta,0),runningBalance:balance,repId:this.rep.id,distributionShiftId:this.doc.shiftId});return c}
 async commit(){return commitDistributionBatch([...this.ops.values()],this.checks,this.doc?.commitId||uid('batch'))}
}
async function moveCostLayers(w,productId,from,to,quantity){const p=await w.read('products',productId);if(!Array.isArray(p.fifoBatches))return money(quantity*number(p.costPrice||0));const batches=p.fifoBatches.map(b=>({...b})),added=[];let left=quantity,cost=0;for(const b of batches.filter(b=>(b.warehouseId===from||!b.warehouseId)&&number(b.remainingBaseQty||0)>0).sort((a,b)=>String(a.receivedAt||'').localeCompare(String(b.receivedAt||'')))){if(left<=0)break;const take=Math.min(left,number(b.remainingBaseQty));b.remainingBaseQty-=take;left-=take;cost+=take*number(b.unitCost||p.costPrice||0);if(to)added.push({...b,id:uid('lot'),warehouseId:to,remainingBaseQty:take,baseQty:take,referenceId:w.doc.id})}if(left>0){cost+=left*number(p.costPrice||0);if(to)added.push({id:uid('lot'),warehouseId:to,remainingBaseQty:left,baseQty:left,unitCost:number(p.costPrice||0),receivedAt:w.doc.date,referenceId:w.doc.id})}await w.put('products',{...p,fifoBatches:[...batches,...added]});return money(cost)}
export async function saveRep(app,input){
 assertManager(app);if(!input.name?.trim())throw Error('اسم المندوب مطلوب');const id=input.id||uid('rep'),old=await getFromStore('employees',id);const cfg={...old?.distribution,...input.distribution};
 const warehouseId=cfg.warehouseId||'van-'+id,cashAccountId=cfg.cashAccountId||'cash-'+id;
 const selectedCash=await getFromStore('accounts',cashAccountId);
 if(cfg.cashAccountId&&!selectedCash)throw Error('حساب الدفع المحدد غير موجود');
 if(selectedCash&&(selectedCash.type!=='cash'||(selectedCash.repId&&selectedCash.repId!==id)))throw Error('اختر حساباً نقدياً غير مخصص لمندوب آخر');
 const allReps=await getAllFromStore('employees');
 if(allReps.some(e=>e.id!==id&&e.distribution?.cashAccountId===cashAccountId))throw Error('حساب الدفع مخصص لمندوب آخر');
 if(old?.distribution?.cashAccountId&&old.distribution.cashAccountId!==cashAccountId){
 const session=await getFromStore('distribution_sessions','shift-active-'+id);
 if(session&&['open','pending'].includes(session.status))throw Error('أقفل وردية المندوب قبل تغيير حساب الدفع');
 const previous=await getFromStore('accounts',old.distribution.cashAccountId);
 if(Math.abs(number(previous?.balance||0))>.001)throw Error('سوّ رصيد العهدة السابقة قبل تغيير حساب الدفع');
 }
 if(!cfg.branchId)cfg.branchId=app.settings.activeBranchName||'الرئيسي';
 for(const key of ['commissionRate','maxDiscount','expenseLimit']){cfg[key]=number(cfg[key]||0);if(cfg[key]<0)throw Error('لا تقبل القيم السالبة')}
 if(cfg.maxDiscount>100||cfg.commissionRate>100)throw Error('النسبة يجب ألا تتجاوز 100');
 if(old?.distribution?.warehouseId&&cfg.warehouseId!==old.distribution.warehouseId)throw Error('لا تغير مستودع مندوب قائم؛ أنشئ تحويل عهدة أولاً');
 if((app.employees||[]).some(e=>e.id!==id&&e.distribution?.warehouseId===warehouseId))throw Error('المستودع مخصص لمندوب آخر');
 const rep={...old,...input,id,role:'sales_rep',roleName:'مندوب مبيعات',active:input.active!==false,distribution:{...cfg,warehouseId,cashAccountId},companyId:getTenantId(),authVersion:old?.authVersion||uid('AUTH'),createdAt:old?.createdAt||new Date().toISOString(),permissions:normalizeEmployeePermissions({canDiscount:cfg.maxDiscount>0,canEditPrice:!!cfg.permissions?.editPrice},'sales_rep')};
 const w=new Work(app,rep,{id:uid(),date:new Date().toISOString()});
 await w.put('employees',rep);
 if(!await w.read('warehouses',warehouseId))await w.put('warehouses',{id:warehouseId,name:cfg.vehicle||'سيارة '+rep.name,code:'VAN',repId:id,branchId:cfg.branchId});
 if(!await w.read('accounts',cashAccountId))await w.put('accounts',{id:cashAccountId,name:'عهدة نقدية — '+rep.name,type:'cash',balance:0,currency:app.settings.currencySymbol,isDefault:false,repId:id});
 if(!await w.read('warehouses','dist-quarantine'))await w.put('warehouses',{id:'dist-quarantine',name:'فحص وتالف — غير متاح للبيع',quarantine:true});
 await w.commit();await app.reloadData?.();return rep;
}
export async function ensureRepSession(app,rep){const current=await getFromStore('distribution_sessions','shift-active-'+rep.id);if(current?.status==='open')return current;if(manager(app))return openShift(rep);if(current?.status==='pending')throw Error('التسوية بانتظار اعتماد المدير');await beginShift(app,rep.id,true);return openShift(rep)}
export async function beginShift(app,repId,automatic=false){
 const rep=await repFor(app,repId);authorize(app,rep,automatic?null:'settlement');const key='shift-active-'+rep.id,old=await getFromStore('distribution_sessions',key);if(old&&old.status!=='closed')throw Error('توجد وردية مفتوحة أو تسوية بانتظار الاعتماد');
 const account=await getFromStore('accounts',rep.distribution.cashAccountId);const stock=(await getAllFromStore('stock')).filter(x=>x.warehouseId===rep.distribution.warehouseId);const date=new Date().toISOString();
 const shift={id:uid('trip'),date,repId:rep.id,branchId:rep.distribution.branchId,status:'open',openingCash:number(account?.balance||0),openingStock:stock.map(x=>({productId:x.productId,quantity:x.baseQuantity})),warehouseId:rep.distribution.warehouseId};
 const w=new Work(app,rep,shift);await w.put('distribution_shifts',shift);await w.put('distribution_sessions',{...shift,id:key,tripId:shift.id});await w.commit();return shift;
}
export async function normalizeItems(app,items){
 const normalized=[];for(const row of items||[]){const product=await getFromStore('products',row.productId);const unit=product?.units?.find(x=>x.id===row.unitId);const quantity=number(row.quantity);if(!product||!unit||quantity<=0)throw Error('تحقق من الصنف والوحدة والكمية');normalized.push({...row,quantity,productName:product.name,unitName:unit.name,conversionFactor:number(unit.conversionToBase||1),baseQuantity:quantity*number(unit.conversionToBase||1),costPrice:number(product.costPrice||0),unitPrice:number(row.unitPrice??unit.salePrice??0)})}if(!normalized.length)throw Error('أضف صنفاً واحداً على الأقل');return normalized;
}
export async function saveDocument(app,input,submit=true){
 const rep=await repFor(app,input.repId);authorize(app,rep,input.kind);const shift=await ensureRepSession(app,rep);const old=input.id?await getFromStore('distribution_docs',input.id):null;
 if(old&&old.repId!==rep.id)throw Error('المستند يخص مندوباً آخر');if(old&&!['draft','rejected'].includes(old.status))return old;
 const now=new Date().toISOString(),id=input.id||uid();const doc={...old,...input,id,number:old?.number||'D-'+id.slice(-12).toUpperCase(),companyId:getTenantId(),branchId:rep.distribution.branchId,repId:rep.id,repName:rep.name,shiftId:shift.tripId||shift.id,date:input.date?new Date(input.date).toISOString():now,createdAt:old?.createdAt||now,status:submit?'pending':'draft',financialYearId:app.settings.activeFinancialYearId||'fy-initial',currency:input.currency||app.settings.currencySymbol,paymentMethod:input.paymentMethod||'cash',rate:number(input.rate||1),notes:input.notes||''};
 if(['receipt','expense','remit','commission_payment'].includes(doc.kind)){
 if(doc.kind==='commission_payment'&&!input.accountId)throw Error('اختر صندوق صرف العمولة');
 doc.accountId=input.accountId||rep.distribution.cashAccountId;
 const selected=await getFromStore('accounts',doc.accountId);if(!selected)throw Error('اختر صندوقاً موجوداً');
 if(!manager(app)&&doc.accountId!==rep.distribution.cashAccountId&&!rep.distribution.collectionAccountIds?.includes(doc.accountId))throw Error('الصندوق غير مسموح للمندوب');
 doc.paymentMethod=selected.type==='cash'?'cash':'transfer';
 }
 if(!kinds[doc.kind]||['sale','settlement','customer_return'].includes(doc.kind))throw Error('نوع حركة غير صالح');if(doc.rate<=0)throw Error('سعر الصرف يجب أن يكون موجباً');
 if(['load','return_stock','damage','order'].includes(doc.kind))doc.items=await normalizeItems(app,input.items);
 if(['receipt','expense','remit','commission_payment'].includes(doc.kind)){doc.amount=number(input.amount);if(doc.amount<=0)throw Error('المبلغ يجب أن يكون أكبر من صفر');doc.baseAmount=money(doc.amount*doc.rate)}
 if(['receipt','order'].includes(doc.kind)){const c=await getFromStore('customers',doc.customerId);if(!c||!rep.distribution.customerIds?.includes(c.id))throw Error('اختر عميلاً مخصصاً للمندوب');doc.customerName=c.name}
 if(doc.kind==='expense'&&(!doc.expenseAccount||!doc.costCenter))throw Error('حساب المصروف ومركز التكلفة مطلوبان');
 if(doc.kind==='damage'&&!doc.reason)throw Error('سبب التلف مطلوب');
 if(doc.kind==='order')doc.amount=money(doc.items.reduce((n,x)=>n+x.quantity*x.unitPrice,0));
 const w=new Work(app,rep,doc);await w.guard(shift.id.startsWith('shift-active-')?'distribution_sessions':'distribution_shifts',shift.id);
 // Quarantine immediately on submission, before approval. It cannot be sold meanwhile.
 if(submit&&doc.kind==='damage'&&!doc.quarantined){for(const row of doc.items){const p=await w.read('products',row.productId),u=p.units.find(x=>x.id===row.unitId);await w.stock(p,rep.distribution.warehouseId,-row.baseQuantity,u,row.quantity,'distribution_quarantine_out');await w.stock(p,'dist-quarantine',row.baseQuantity,u,row.quantity,'distribution_quarantine_in');row.costValue=await moveCostLayers(w,p.id,rep.distribution.warehouseId,'dist-quarantine',row.baseQuantity)}doc.quarantined=true}
 await w.put('distribution_docs',doc);await w.commit();
 if(submit && (doc.kind==='commission_payment'&&manager(app)||doc.kind==='receipt'||doc.kind==='remit'||doc.kind==='expense'&&doc.baseAmount<=number(rep.distribution.expenseLimit||0)))return approveDocument(app,doc.id);
 return doc;
}
export function commissionAmount(policy,invoice,baseOverride){
 const p=policy||{},rate=number(p.commissionRate||0)/100;const sign=invoice.type==='return'?-1:1;
 const net=Math.max(0,number(invoice.grandTotal||0)-number(invoice.taxTotal||0)-number(invoice.additionalCharges||0));
 const cost=(invoice.items||[]).reduce((s,i)=>s+number(i.fifoCostTotal??number(i.costPriceAtSale||0)*number(i.quantity||0)),0);
 let basis=net,earned=0;
 if(p.commissionMode==='collections')basis=number(baseOverride??invoice.paidAmount??0);
 if(p.commissionMode==='profit')basis=net-cost;
 if(p.commissionMode==='unit')return {basis:(invoice.items||[]).reduce((s,i)=>s+number(i.baseQuantity||i.quantity||0),0)*sign,earned:money((invoice.items||[]).reduce((s,i)=>s+number(i.baseQuantity||i.quantity||0),0)*number(p.unitCommission||0)*sign)};
 if(p.commissionMode==='items'){earned=(invoice.items||[]).reduce((s,i)=>s+number(i.total||number(i.quantity)*number(i.unitPrice))*number(p.itemRates?.[i.productId]??p.categoryRates?.[i.categoryId]??p.commissionRate??0)/100,0);earned*=net/Math.max(.00001,(invoice.items||[]).reduce((s,i)=>s+number(i.total||number(i.quantity)*number(i.unitPrice)),0));}
 else earned=basis*rate;
 return {basis:money(basis*sign),earned:money(earned*sign)};
}
export function tierCommission(tiers,basis){const rows=[...(tiers||[])].map(x=>({threshold:number(x.threshold),rate:number(x.rate)})).sort((a,b)=>a.threshold-b.threshold);let total=0;for(let i=0;i<rows.length;i++){const from=rows[i].threshold,to=rows[i+1]?.threshold??Infinity;if(from<0||rows[i].rate<0||rows[i].rate>100)throw Error('شرائح العمولة غير صحيحة');total+=Math.max(0,Math.min(basis,to)-from)*rows[i].rate/100}return money(total)}
async function accrue(w,invoice,policy,override){
 if(policy.effectiveDate&&invoice.date.slice(0,10)<policy.effectiveDate)return;
 const id='commission-'+invoice.id;if(await w.read('distribution_commissions',id))return;
 const amount=commissionAmount(policy,invoice,override);
 if(policy.commissionMode==='tiers'){const month=invoice.date.slice(0,7);const previous=await queryStoreStats('distribution_commissions',{filters:{repId:w.rep.id},dateFrom:month+'-01T00:00:00',dateTo:invoice.date,sumFields:['basis']});const basis=number(previous.ranges?.all?.sums?.basis||0);amount.earned=money(tierCommission(policy.tiers,basis+amount.basis)-tierCommission(policy.tiers,basis));}
 if(!amount.earned&&policy.commissionMode!=='tiers')return;
 await w.put('distribution_commissions',{id,date:invoice.date,repId:w.rep.id,branchId:w.rep.distribution.branchId,shiftId:w.doc.shiftId,financialYearId:w.doc.financialYearId,referenceId:invoice.id,policy:{...policy},basis:amount.basis,earned:amount.earned,paid:0,balance:amount.earned,status:'approved'});
 await w.put('expenses',{id:'commission-expense-'+invoice.id,date:invoice.date,amount:amount.earned,category:'عمولات المناديب',description:'إثبات عمولة مستحقة',paymentType:'accrual',accountName:'مستحقات عمولات',repId:w.rep.id,distributionManaged:true,distributionShiftId:w.doc.shiftId,financialYearId:w.doc.financialYearId,costCenterId:w.rep.distribution.branchId});
 // Separate expense / liability; never subtract from sales.
 await w.put('distribution_journal',{id:'commission-journal-'+invoice.id,date:invoice.date,repId:w.rep.id,shiftId:w.doc.shiftId,referenceId:invoice.id,financialYearId:w.doc.financialYearId,description:'إثبات عمولة',lines:[{account:'commission_expense',debit:Math.max(amount.earned,0),credit:Math.max(-amount.earned,0)},{account:'commission_payable:'+w.rep.id,credit:Math.max(amount.earned,0),debit:Math.max(-amount.earned,0)}],debit:Math.abs(amount.earned),credit:Math.abs(amount.earned),status:'approved'});
}
export async function approveDocument(app,id,decision={}){
 const doc=await getFromStore('distribution_docs',id);if(!doc)throw Error('لم يتم العثور على المستند');const rep=await repFor(app,doc.repId);
 if(doc.status==='approved'||doc.status==='closed')return doc;
 if(doc.status!=='pending')throw Error('أرسل المستند للموافقة أولاً');
 const selfAllowed=['receipt','remit'].includes(doc.kind)||doc.kind==='expense'&&doc.baseAmount<=number(rep.distribution.expenseLimit||0);
 if(!manager(app)&&!selfAllowed)throw Error('الاعتماد من صلاحيات المدير');authorize(app,rep,doc.kind);
 const shift=await openShift(rep);if((shift.tripId||shift.id)!==doc.shiftId)throw Error('العملية تتبع وردية أخرى');
 const w=new Work(app,rep,doc);await w.guard(shift.id.startsWith('shift-active-')?'distribution_sessions':'distribution_shifts',shift.id);const cfg=rep.distribution;
 if(['load','return_stock'].includes(doc.kind)){
  if(doc.kind==='load'&&!doc.receivedAt)throw Error('يجب أن يؤكد المندوب الاستلام والكميات أولاً');
  if(doc.discrepancy)throw Error('يوجد اختلاف في الاستلام؛ صحح أمر التحميل ثم أعد الإرسال');
  const from=doc.kind==='load'?doc.sourceWarehouseId:cfg.warehouseId,to=doc.kind==='load'?cfg.warehouseId:doc.targetWarehouseId;
  if(!from||!to||from===to||from==='dist-quarantine'||to==='dist-quarantine')throw Error('اختر مخازن صحيحة ومختلفة');
  for(const row of doc.items){const p=await w.read('products',row.productId),u=p?.units.find(x=>x.id===row.unitId);await w.stock(p,from,-row.baseQuantity,u,row.quantity,'transfer_out');await w.stock(p,to,row.baseQuantity,u,row.quantity,'transfer_in');await moveCostLayers(w,p.id,from,to,row.baseQuantity)}
 }
 if(doc.kind==='damage'){
  doc.liability=decision.liability==='rep'?'rep':'company';
  if(!doc.quarantined)throw Error('لم تحجز كمية التالف');let cost=0;
  for(const row of doc.items){const p=await w.read('products',row.productId),u=p?.units.find(x=>x.id===row.unitId);await w.stock(p,'dist-quarantine',-row.baseQuantity,u,row.quantity,'distribution_damage');cost+=await moveCostLayers(w,p.id,'dist-quarantine',null,row.baseQuantity)}
  doc.cost=money(cost);if(doc.liability!=='rep')await w.put('expenses',{id:'damage-expense-'+doc.id,date:doc.date,amount:doc.cost,category:'تالف التوزيع',description:doc.reason,paymentType:'noncash',accountName:'المخزون',costCenterId:cfg.branchId,repId:rep.id,distributionManaged:true,distributionShiftId:doc.shiftId,financialYearId:doc.financialYearId});await w.journal([{account:doc.liability==='rep'?'rep_damage_receivable:'+rep.id:'damage_expense',debit:doc.cost,credit:0},{account:'inventory',debit:0,credit:doc.cost}],'إثبات تلف — '+(doc.liability==='rep'?'مسؤولية المندوب بقرار المدير':'مسؤولية الشركة'));
 }
 if(['receipt','expense','remit','commission_payment'].includes(doc.kind)){
  const amt=number(doc.baseAmount),cash=doc.paymentMethod!=='transfer';const accountId=doc.accountId||cfg.cashAccountId;
  if(!manager(app)&&accountId!==cfg.cashAccountId&&!cfg.collectionAccountIds?.includes(accountId))throw Error('حساب التحويل غير مسموح للمندوب');
  if(!accountId)throw Error('اختر حساب التحويل');const account=await w.read('accounts',accountId);if(!account)throw Error('الحساب غير موجود');
  if(doc.kind==='receipt'){
   const c=await w.customer(doc.customerId,-amt,'RECEIPT_VOUCHER');await w.balance(accountId,amt);
   doc.partyName=c.name;doc.partyId=c.id;doc.partyType='customer';
   let allocated=0;for(const allocation of doc.allocations||[]){const inv=await w.read('invoices',allocation.invoiceId),amount=number(allocation.amount);if(!inv||inv.customerId!==c.id||inv.repId&&inv.repId!==rep.id||amount<=0||amount>number(inv.remainingAmount))throw Error('توزيع السداد على الفواتير غير صحيح');allocated+=amount;await w.put('invoices',{...inv,paidAmount:money(number(inv.paidAmount)+amount),remainingAmount:money(number(inv.remainingAmount)-amount),collectionVoucherIds:[...(inv.collectionVoucherIds||[]),id]})}if(allocated>amt+.001)throw Error('مجموع التسديد أكبر من مبلغ السند');
   await w.journal([{account:accountId,debit:amt,credit:0},{account:'customer:'+c.id,debit:0,credit:amt}],'تحصيل عميل');
   if(cfg.commissionMode==='collections')await accrue(w,{id,date:doc.date,paidAmount:amt},cfg,amt);
  }else{
   if(cash&&number(account.balance)<amt)throw Error('العهدة النقدية لا تكفي للصرف');await w.balance(accountId,-amt);
   if(doc.kind==='remit'){if(!doc.targetAccountId||doc.targetAccountId===accountId)throw Error('اختر صندوق الشركة المستلم');await w.balance(doc.targetAccountId,amt);await w.put('transfers',{id,date:doc.date,fromAccountId:accountId,toAccountId:doc.targetAccountId,amount:amt,notes:doc.notes,repId:rep.id,distributionShiftId:doc.shiftId,financialYearId:doc.financialYearId});await w.journal([{account:doc.targetAccountId,debit:amt,credit:0},{account:accountId,debit:0,credit:amt}],'توريد نقدية — تحويل داخلي');}
   if(doc.kind==='expense'){await w.put('expenses',{id,date:doc.date,amount:amt,category:doc.expenseAccount,accountId,accountName:account.name,description:doc.notes||doc.expenseAccount,notes:doc.notes,costCenterId:doc.costCenter,repId:rep.id,distributionShiftId:doc.shiftId,financialYearId:doc.financialYearId,distributionManaged:true,userId:app.currentUser.id});await w.journal([{account:doc.expenseAccount,costCenterId:doc.costCenter,debit:amt,credit:0},{account:accountId,debit:0,credit:amt}],'مصروف توزيع');}
   if(doc.kind==='commission_payment'){assertManager(app);const earned=await queryStoreStats('distribution_commissions',{filters:{repId:rep.id},sumFields:['earned','paid']});const sums=earned.ranges?.all?.sums||{};if(amt>money(number(sums.earned)-number(sums.paid)))throw Error('المبلغ أكبر من العمولة المتبقية');await w.put('distribution_commissions',{id:'commission-pay-'+id,date:doc.date,repId:rep.id,shiftId:doc.shiftId,earned:0,paid:amt,balance:-amt,status:'approved',referenceId:id,financialYearId:doc.financialYearId});await w.journal([{account:'commission_payable:'+rep.id,debit:amt,credit:0},{account:accountId,debit:0,credit:amt}],'سداد عمولة مستحقة');}
  }
  if(doc.kind!=='remit')await w.put('vouchers',{id,voucherNumber:doc.number,date:doc.date,type:doc.kind==='receipt'?'receipt':'payment',partyType:doc.partyType||'other',partyId:doc.partyId||rep.id,partyName:doc.partyName||doc.beneficiary||rep.name,amount:amt,originalAmount:doc.amount,currency:doc.currency,exchangeRate:doc.rate,sourceType:'account',accountId,accountName:account.name,notes:doc.notes,userId:app.currentUser.id,userName:app.currentUser.name,repId:rep.id,distributionShiftId:doc.shiftId,financialYearId:doc.financialYearId,distributionManaged:true});
 }
 if(doc.kind==='order')throw Error('نفذ طلب البيع من الكاشير لإنشاء الفاتورة');
 const approved={...doc,status:'approved',approvedAt:new Date().toISOString(),approvedBy:app.currentUser.id};await w.put('distribution_docs',approved);await w.commit();await app.reloadData?.();return approved;
}
export async function receiveLoad(app,id,quantities){const doc=await getFromStore('distribution_docs',id),rep=await repFor(app,doc.repId);if(!manager(app)&&app.currentUser.id!==rep.id)throw Error('الاستلام للمندوب المعني فقط');if(doc.status!=='pending'||doc.kind!=='load')throw Error('الأمر غير متاح للاستلام');const received=doc.items.map((x,i)=>({...x,receivedQuantity:number(quantities?.[i]??x.quantity)}));if(received.some(x=>x.receivedQuantity<0))throw Error('كمية غير صحيحة');const next={...doc,receivedItems:received,discrepancy:received.some(x=>x.receivedQuantity!==x.quantity),receivedAt:new Date().toISOString(),receivedBy:app.currentUser.id};const w=new Work(app,rep,next);await w.put('distribution_docs',next);await w.commit();return next}
export async function rejectDocument(app,id,reason){assertManager(app);if(!reason?.trim())throw Error('اكتب سبب الرفض');const doc=await getFromStore('distribution_docs',id);if(!doc||doc.status!=='pending')throw Error('لا يمكن رفض هذا المستند');const rep=await repFor(app,doc.repId),w=new Work(app,rep,doc);if(doc.kind==='damage'&&doc.quarantined)throw Error('التالف محجوز للفحص؛ اعتمد مسؤولية الشركة أو المندوب، ولا تعيده للبيع دون فحص');await w.put('distribution_docs',{...doc,status:'rejected',rejectionReason:reason,rejectedBy:app.currentUser.id});await w.commit()}
export async function prepareSale(app,payload,cart){
 const repId=isRep(app)?app.currentUser.id:payload.distributionRepId;if(!repId)return null;const rep=await repFor(app,repId);authorize(app,rep,'sale');const shift=await ensureRepSession(app,rep),cfg=rep.distribution;
 if(payload.isEdit)throw Error('فواتير المندوب تصحح بمرتجع وحركة جديدة');
 const customerId=payload.customerId||payload.customerObject?.id||app.selectedCustomer?.id;
 if(!cfg.customerIds?.includes(customerId))throw Error('اختر عميلاً مخصصاً للمندوب');
 const rows=payload.items?.length?payload.items:cart;const totals=new Map();
 for(const row of rows){const product=await getFromStore('products',row.productId),unit=product?.units?.find(u=>u.id===row.unitId);if(!unit)throw Error('الوحدة غير موجودة');if(Math.abs(number(row.conversionFactor||1)-number(unit.conversionToBase||1))>.000001)throw Error('تغيرت الوحدة؛ أعد إضافة الصنف');const customer=await getFromStore('customers',customerId);const approvedPrice=app.getEffectiveUnitPrice?app.getEffectiveUnitPrice(product,unit,cfg.priceGroupId,customer):number(unit.salePrice||0);if(!cfg.permissions?.editPrice&&Math.abs(number(row.unitPrice)-approvedPrice)>.001)throw Error('السعر لا يطابق مجموعة أسعار المندوب');if(!Number.isFinite(Number(row.quantity))||Number(row.quantity)<=0)throw Error('كمية غير صحيحة');totals.set(row.productId,(totals.get(row.productId)||0)+number(row.quantity)*number(row.conversionFactor||1));if(!cfg.permissions?.editPrice&&Math.abs(number(row.unitPrice)-number(row.catalogUnitPrice??row.unitPrice))>.001)throw Error('تغيير السعر غير مسموح');}
 for(const [id,qty]of totals){const stock=await getFromStore('stock',[id,cfg.warehouseId]);if(!cfg.permissions?.negativeStock&&qty>number(stock?.baseQuantity||0)+.000001)throw Error('الكمية أكبر من عهدة المندوب')}
 const total=rows.reduce((s,r)=>s+number(r.quantity)*number(r.unitPrice),0),lineDiscount=rows.reduce((s,r)=>s+number(r.discount||0),0);const dv=number(payload.invoiceDiscountValue??app.invoiceDiscountValue??0);const discount=(payload.invoiceDiscountType||app.invoiceDiscountType)==='percent'?total*dv/100:dv;
 if(total>0&&(discount+lineDiscount)/total*100>number(cfg.maxDiscount||0)+.000001)throw Error('الخصم يتجاوز الحد المسموح للمندوب');
 if(number(payload.paidAmount||0)<0)throw Error('المدفوع لا يقبل مبلغاً سالباً');
 payload.customerId=customerId;payload.warehouseIdOverride=cfg.warehouseId;
 payload.payments=payload.payments||[];for(const p of payload.payments){const id=p.accountId||cfg.cashAccountId;if(!manager(app)&&id!==cfg.cashAccountId&&!cfg.collectionAccountIds?.includes(id))throw Error('الصندوق غير مصرح للمندوب');const a=await getFromStore('accounts',id);if(!a)throw Error('الصندوق غير موجود');p.accountId=id;p.accountName=a.name;p.method=a.type||'cash';}
 if(number(payload.paidAmount)>0&&!payload.payments.length)payload.payments=[{method:'cash',accountId:cfg.cashAccountId,amount:number(payload.paidAmount),accountName:'عهدة '+rep.name}];
 return {rep,shift};
}
export async function postSale(app,invoice,operations,context,payload){
 if(!context)return false;const {rep,shift}=context;
 invoice.repId=rep.id;invoice.repName=rep.name;invoice.distributionShiftId=shift.tripId||shift.id;invoice.tripId=invoice.distributionShiftId;invoice.companyId=getTenantId();invoice.branchId=rep.distribution.branchId;invoice.distributionManaged=true;
 invoice.distributionCash=money((invoice.payments||[]).filter(p=>p.accountId===rep.distribution.cashAccountId).reduce((n,p)=>n+number(p.amount),0));
 invoice.distributionNet=money(number(invoice.grandTotal)-number(invoice.taxTotal)-number(invoice.additionalCharges));invoice.distributionProfit=money(invoice.distributionNet-invoice.items.reduce((s,i)=>s+number(i.fifoCostTotal),0));
 const doc={id:invoice.id,date:invoice.date,shiftId:invoice.distributionShiftId,financialYearId:invoice.financialYearId},w=new Work(app,rep,doc);await w.guard(shift.id.startsWith('shift-active-')?'distribution_sessions':'distribution_shifts',shift.id);
 for(const op of operations){if(op.storeName==='stock_movements'){op.value.repId=rep.id;op.value.distributionShiftId=invoice.distributionShiftId;}await w.put(op.storeName,op.value);const k=op.storeName==='stock'?[op.value.productId,op.value.warehouseId]:op.value.id;const saved=w.ops.get(w.key(op.storeName,k));if(Object.prototype.hasOwnProperty.call(op,'before'))saved.before=op.before;if(op.storeName==='stock'){saved.allowNegative=!!rep.distribution.permissions?.negativeStock;if(number(op.value.baseQuantity)<0&&!saved.allowNegative)throw Error('لا يوجد مخزون كافٍ لإتمام البيع');}}
 await w.put('distribution_docs',{id:'sale-'+invoice.id,number:invoice.invoiceNumber,kind:'sale',date:invoice.date,repId:rep.id,repName:rep.name,branchId:rep.distribution.branchId,shiftId:invoice.distributionShiftId,financialYearId:invoice.financialYearId,invoiceId:invoice.id,customerId:invoice.customerId,customerName:invoice.customerName,baseAmount:invoice.grandTotal,amount:invoice.grandTotal,profit:invoice.distributionProfit,status:'approved',items:invoice.items});
 const cost=money(invoice.items.reduce((s,i)=>s+number(i.fifoCostTotal||0),0));
 const lines=[];let paidLeft=number(invoice.paidAmount);for(const payment of invoice.payments||[]){const amount=Math.min(paidLeft,number(payment.amount));if(amount>0)lines.push({account:payment.accountId,debit:amount,credit:0});paidLeft-=amount;}if(paidLeft>0)lines.push({account:rep.distribution.cashAccountId,debit:paidLeft,credit:0});if(number(invoice.remainingAmount)>0)lines.push({account:'customer:'+invoice.customerId,debit:number(invoice.remainingAmount),credit:0});lines.push({account:'sales',debit:0,credit:money(number(invoice.grandTotal)-number(invoice.taxTotal))},{account:'vat_payable',debit:0,credit:number(invoice.taxTotal)},{account:'cost_of_sales',debit:cost,credit:0},{account:'inventory',debit:0,credit:cost});await w.journal(lines,'فاتورة مندوب '+invoice.invoiceNumber);
 await accrue(w,invoice,rep.distribution);
 if(payload.distributionOrderId){const order=await w.read('distribution_docs',payload.distributionOrderId);if(!order||order.kind!=='order'||order.repId!==rep.id||order.status!=='pending')throw Error('الطلب منفذ أو غير صالح');await w.put('distribution_docs',{...order,status:'closed',invoiceId:invoice.id,executedAt:new Date().toISOString()})}
 await w.commit();return true;
}
export async function settlementPreview(app,repId){const rep=await repFor(app,repId),active=await openShift(rep);const shift={...active,id:active.tripId||active.id},account=await getFromStore('accounts',rep.distribution.cashAccountId),stock=(await getAllFromStore('stock')).filter(x=>x.warehouseId===rep.distribution.warehouseId);const invoiceStat=type=>queryStoreStats('invoices',{filters:{repId:rep.id,distributionShiftId:shift.id,type},sumFields:['distributionCash']});const docStat=kind=>queryStoreStats('distribution_docs',{filters:{repId:rep.id,shiftId:shift.id,kind,status:'approved',accountId:rep.distribution.cashAccountId},sumFields:['baseAmount']});const [sales,returns,receipts,expenses,remit]=await Promise.all([invoiceStat('sale'),invoiceStat('return'),docStat('receipt'),docStat('expense'),docStat('remit')]);const breakdown={opening:number(shift.openingCash),cashSales:number(sales.ranges?.all?.sums?.distributionCash||0),cashReturns:-number(returns.ranges?.all?.sums?.distributionCash||0),receipts:number(receipts.ranges?.all?.sums?.baseAmount||0),expenses:number(expenses.ranges?.all?.sums?.baseAmount||0),remit:number(remit.ranges?.all?.sums?.baseAmount||0)};breakdown.otherTransfers=money(number(account?.balance||0)-(breakdown.opening+breakdown.cashSales+breakdown.receipts-breakdown.expenses-breakdown.remit-breakdown.cashReturns));return{rep,shift,breakdown,expectedCash:number(account?.balance||0),stock:stock.map(x=>({productId:x.productId,opening:number(shift.openingStock?.find(s=>s.productId===x.productId)?.quantity||0),expected:number(x.baseQuantity),actual:String(x.baseQuantity)}))}}
export async function submitSettlement(app,input){const preview=await settlementPreview(app,input.repId);authorize(app,preview.rep,'settlement');const {rep,shift}=preview;const pending=await queryStoreStats('distribution_docs',{filters:{repId:rep.id,shiftId:shift.id,status:['pending','draft']}});if(number(pending.ranges?.all?.count)>0)throw Error('أكمل المستندات المعلقة والمسودات قبل التسوية');const actualCash=number(input.actualCash);if(actualCash<0)throw Error('النقدية غير صحيحة');const date=new Date().toISOString(),id=input.id||uid('settlement');const doc={id,number:'S-'+id.slice(-10),kind:'settlement',date,repId:rep.id,repName:rep.name,shiftId:shift.id,branchId:rep.distribution.branchId,financialYearId:app.settings.activeFinancialYearId,status:'pending',openingCash:shift.openingCash,breakdown:preview.breakdown,expectedCash:preview.expectedCash,actualCash,cashDifference:money(actualCash-preview.expectedCash),stock:preview.stock.map(x=>{const row=input.stock?.find(y=>y.productId===x.productId);const actual=number(row?.actual??x.expected);if(actual<0)throw Error('الجرد لا يقبل كمية سالبة');return {...x,actual,difference:actual-x.expected}}),notes:input.notes||''};const w=new Work(app,rep,doc);await w.put('distribution_docs',doc);await w.put('distribution_shifts',{...shift,status:'pending',settlementId:id});await w.put('distribution_sessions',{...shift,id:'shift-active-'+rep.id,tripId:shift.id,status:'pending',settlementId:id});await w.commit();return doc}
export async function closeSettlement(app,id){assertManager(app);const doc=await getFromStore('distribution_docs',id);if(doc?.kind!=='settlement'||doc.status!=='pending')throw Error('التسوية غير متاحة للإقفال');const rep=await repFor(app,doc.repId),w=new Work(app,rep,doc),shift=await w.read('distribution_shifts',doc.shiftId)||{...await w.read('distribution_sessions','shift-active-'+rep.id),id:doc.shiftId};await w.put('distribution_docs',{...doc,status:'closed',approvedBy:app.currentUser.id,closedAt:new Date().toISOString()});await w.put('distribution_shifts',{...shift,status:'closed',closedAt:new Date().toISOString()});await w.put('distribution_sessions',{...shift,id:'shift-active-'+rep.id,tripId:shift.id,status:'closed',closedAt:new Date().toISOString()});await w.commit()}
export async function distributionQuery(app,store,options={}){const filters={...(options.filters||{})};if(isRep(app))filters.repId=app.currentUser.id;else assertManager(app);return queryStorePage(store,{...options,filters,pageSize:50})}
export async function distributionStats(app,store,options={}){const filters={...(options.filters||{})};if(isRep(app))filters.repId=app.currentUser.id;else assertManager(app);return queryStoreStats(store,{...options,filters})}
export async function returnCustomer(app,input){
 const original=await getFromStore('invoices',input.originalInvoiceId);if(!original||original.type!=='sale'||!original.repId)throw Error('اختر فاتورة مندوب أصلية');const rep=await repFor(app,original.repId);authorize(app,rep,'customer_return');const shift=await ensureRepSession(app,rep);
 const id=input.id||uid('return');const existing=await getFromStore('invoices',id);if(existing)return existing;
 const doc={id,kind:'customer_return',number:'R-'+id.slice(-12),repId:rep.id,repName:rep.name,date:new Date().toISOString(),shiftId:shift.tripId||shift.id,financialYearId:app.settings.activeFinancialYearId||'fy-initial',notes:input.notes||''},w=new Work(app,rep,doc);await w.guard(shift.id.startsWith('shift-active-')?'distribution_sessions':'distribution_shifts',shift.id);
 const trackerId='returns-'+original.id,tracker=await w.read('distribution_docs',trackerId)||{id:trackerId,kind:'return_tracker',repId:rep.id,quantities:{},refunded:0,debtReversed:0};const quantities={...tracker.quantities};let total=0,cost=0;const items=[];
 const gross=original.items.reduce((s,x)=>s+number(x.total),0);const ratio=number(original.grandTotal)/Math.max(.00001,gross);
 for(const row of input.items||[]){const qty=number(row.quantity||0);if(qty===0)continue;const item=original.items.find(x=>x.id===row.itemId);if(!item||qty<0||qty+number(quantities[item.id]||0)>number(item.quantity)+.000001)throw Error('الكمية تتجاوز المتبقي القابل للإرجاع');quantities[item.id]=number(quantities[item.id]||0)+qty;const lineCost=number(item.fifoCostTotal)*qty/number(item.quantity),lineTotal=money(number(item.total)*qty/number(item.quantity)*ratio);cost+=lineCost;total+=lineTotal;const p=await w.read('products',item.productId);const u=p.units.find(x=>x.id===item.unitId);const wh=input.damaged?'dist-quarantine':rep.distribution.warehouseId;await w.stock(p,wh,qty*number(item.conversionFactor||1),u,qty,'sales_return');items.push({...item,id:uid('item'),quantity:qty,baseQuantity:qty*number(item.conversionFactor||1),total:lineTotal,fifoCostTotal:lineCost});
 // Restore FIFO layer to the same warehouse at its original cost.
 if(Array.isArray(p.fifoBatches)){const updated={...p,fifoBatches:[...p.fifoBatches,{id:uid('batch'),warehouseId:wh,quantity:qty*number(item.conversionFactor||1),remainingBaseQty:qty*number(item.conversionFactor||1),unitCost:lineCost/Math.max(.00001,qty*number(item.conversionFactor||1)),receivedAt:doc.date,returnId:id}]};await w.put('products',updated)}
 }
 total=money(total);if(!items.length||total<=0)throw Error('حدد كمية المرتجع');const customer=await w.read('customers',original.customerId);const availableDebt=Math.max(0,number(original.remainingAmount)-number(tracker.debtReversed));const debt=Math.min(total,availableDebt,Math.max(0,number(customer?.balance||0)));const refund=money(total-debt);
 if(debt)await w.customer(original.customerId,-debt,'SALES_RETURN');const account=await w.read('accounts',rep.distribution.cashAccountId);if(refund>number(account?.balance||0))throw Error('العهدة النقدية لا تكفي لرد المبلغ');if(refund)await w.balance(account.id,-refund);
 const reversedTax=money(number(original.taxTotal||0)*total/Math.max(.00001,number(original.grandTotal)));
 const invoice={...doc,type:'return',invoiceNumber:doc.number,distributionManaged:true,distributionShiftId:doc.shiftId,warehouseId:input.damaged?'dist-quarantine':rep.distribution.warehouseId,customerId:original.customerId,customerName:original.customerName,cashierId:app.currentUser.id,cashierName:app.currentUser.name,originalInvoiceId:original.id,items,grandTotal:total,subtotal:money(total-reversedTax),discountTotal:0,taxTotal:reversedTax,paidAmount:refund,remainingAmount:0,paymentType:refund?'refund':'debt_reverse',payments:refund?[{accountId:account.id,method:'cash',amount:refund}]:[],returnAllocation:{debtReversed:debt,accountRefunds:refund?[{accountId:account.id,amount:refund}]:[]},status:'completed',distributionCash:-refund,distributionNet:money(reversedTax-total),distributionProfit:money(cost-total+reversedTax)};
 await w.put('invoices',invoice);await w.put('distribution_docs',{...doc,status:'approved',originalInvoiceId:original.id,invoiceId:id,items,amount:total,damaged:!!input.damaged});await w.put('distribution_docs',{...tracker,quantities,refunded:money(number(tracker.refunded)+refund),debtReversed:money(number(tracker.debtReversed)+debt),date:doc.date,status:'approved'});
 const originalCommission=await w.read('distribution_commissions','commission-'+original.id);if(originalCommission&&rep.distribution.reverseReturns!==false){const earned=-money(number(originalCommission.earned)*total/Math.max(.00001,number(original.grandTotal)));await w.put('distribution_commissions',{id:'commission-'+id,date:doc.date,repId:rep.id,shiftId:doc.shiftId,financialYearId:doc.financialYearId,referenceId:id,originalReferenceId:original.id,basis:-total,earned,paid:0,balance:earned,status:'approved'});await w.put('distribution_journal',{id:'commission-journal-'+id,date:doc.date,repId:rep.id,shiftId:doc.shiftId,referenceId:id,description:'عكس عمولة مرتجع',lines:[{account:'commission_payable:'+rep.id,debit:-earned,credit:0},{account:'commission_expense',debit:0,credit:-earned}],debit:-earned,credit:-earned,status:'approved'})}
 await w.journal([{account:'sales_returns',debit:money(total-reversedTax),credit:0},{account:'vat_payable',debit:reversedTax,credit:0},{account:'customer:'+original.customerId,debit:0,credit:debt},{account:rep.distribution.cashAccountId,debit:0,credit:refund},{account:'inventory',debit:money(cost),credit:0},{account:'cost_of_sales',debit:0,credit:money(cost)}],'مرتجع عميل');await w.commit();await app.reloadData?.();return invoice;
}
export async function saveRoute(app,input){assertManager(app);if(!input.name?.trim())throw Error('اسم خط التوزيع مطلوب');const rep=await repFor(app,input.repId),w=new Work(app,rep,{id:uid(),date:new Date().toISOString()});await w.put('distribution_routes',{...input,id:input.id||uid('route'),date:new Date().toISOString(),status:'approved',branchId:rep.distribution.branchId});await w.commit()}

export async function rejectSettlement(app,id,reason){assertManager(app);if(!reason?.trim())throw Error('سبب الإعادة مطلوب');const doc=await getFromStore('distribution_docs',id);if(doc?.kind!=='settlement'||doc.status!=='pending')throw Error('التسوية غير متاحة');const rep=await repFor(app,doc.repId),w=new Work(app,rep,doc),active=await w.read('distribution_sessions','shift-active-'+rep.id);if(active?.tripId!==doc.shiftId)throw Error('الوردية مختلفة');await w.put('distribution_docs',{...doc,status:'rejected',rejectionReason:reason});await w.put('distribution_sessions',{...active,status:'open'});await w.put('distribution_shifts',{...active,id:active.tripId,status:'open'});await w.commit()}
