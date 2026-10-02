import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, X, Send, Sparkles, TrendingUp, PackageSearch, WalletCards, Receipt, ChefHat, Settings2, CheckCircle2, LoaderCircle, ShoppingCart, RotateCcw, BarChart3, FileDown, Paperclip, PackagePlus } from 'lucide-react';
import { useApp } from './context__AppContext.js?v=7.9.4.89-cashtop3-purple-category-save';
import { useRestaurant } from './restaurant__context__RestaurantContext.js?v=7.9.4.89-cashtop3-purple-category-save';
import { askOscar, getAIConfig, aiHealthCheck, fileToDataUrl } from './services__ai.js?v=7.9.4.89-cashtop3-purple-category-save';
import { executeAIActions, isMutationAction } from './services__aiActions.js?v=7.9.4.89-cashtop3-purple-category-save';
import { canAccessPermission } from './utils__permissions.js?v=7.9.4.89-cashtop3-purple-category-save';

const h = React.createElement;
const DAY = 86400000;
const num = v => Number(v || 0) || 0;
const asDate = v => { const d = new Date(v || 0); return Number.isNaN(d.getTime()) ? new Date(0) : d; };
const sameDay = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
const compactItem = (item) => ({ productId:item?.productId, productName:item?.productName || item?.name, unitId:item?.unitId, quantity:num(item?.quantity), unitName:item?.unitName, unitPrice:num(item?.unitPrice), total:num(item?.total), conversionFactor:num(item?.conversionFactor||1), fifoCostTotal:item?.fifoCostTotal, costPriceAtSale:item?.costPriceAtSale });
const pct = (cur, prev) => Math.abs(num(prev)) < 0.000001 ? null : ((num(cur)-num(prev))/Math.abs(num(prev)))*100;
const round = (v,d=2) => Number(num(v).toFixed(d));

const buildContext = (app, restaurant) => {
  const now = new Date();
  const invoices=(app.invoices||[]).filter(Boolean);
  const sales=invoices.filter(x=>x.type==='sale');
  const returns=invoices.filter(x=>x.type==='return');
  const expenses=(app.expenses||[]).filter(x=>x&&!x.deletedAt);
  const invoiceCost=(inv)=> (inv.items||[]).reduce((sum,item)=>{
    const prod=(app.products||[]).find(p=>p.id===item.productId);
    const fallback=num(item.quantity)*num(item.costPriceAtSale ?? (num(prod?.costPrice)*num(item.conversionFactor||1)));
    return sum+num(item.fifoCostTotal ?? fallback);
  },0);
  const profitFor=(saleRows,returnRows,expenseRows)=>{
    const grossSales=saleRows.reduce((s,x)=>s+num(x.grandTotal),0);
    const returnsTotal=returnRows.reduce((s,x)=>s+num(x.grandTotal),0);
    const netSales=grossSales-returnsTotal;
    const cost=saleRows.reduce((s,x)=>s+invoiceCost(x),0)-returnRows.reduce((s,x)=>s+invoiceCost(x),0);
    const grossProfit=netSales-cost;
    const expenseTotal=expenseRows.reduce((s,x)=>s+num(x.amount),0);
    return {grossSales,returnsTotal,netSales,costOfGoodsSold:cost,grossProfit,expenses:expenseTotal,netProfit:grossProfit-expenseTotal};
  };
  const range = kind => {
    if(kind==='all') return ()=>true;
    if(kind==='today') return row=>sameDay(asDate(row.date),now);
    if(kind==='week'){ const start=new Date(now.getTime()-7*DAY); return row=>asDate(row.date)>=start; }
    if(kind==='month') return row=>{const d=asDate(row.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();};
    return ()=>true;
  };
  const period = kind => { const f=range(kind); return profitFor(sales.filter(f),returns.filter(f),expenses.filter(f)); };
  const reportMetrics={today:period('today'),week:period('week'),month:period('month'),all:period('all')};

  const metricBetween=(from,to)=>{
    const f=row=>{const d=asDate(row.date);return d>=from&&d<to;};
    return profitFor(sales.filter(f),returns.filter(f),expenses.filter(f));
  };
  const last7=metricBetween(new Date(now.getTime()-7*DAY),new Date(now.getTime()+DAY));
  const prev7=metricBetween(new Date(now.getTime()-14*DAY),new Date(now.getTime()-7*DAY));
  const last30=metricBetween(new Date(now.getTime()-30*DAY),new Date(now.getTime()+DAY));
  const prev30=metricBetween(new Date(now.getTime()-60*DAY),new Date(now.getTime()-30*DAY));
  const weightedDaily=(k)=>((num(last7[k])/7)*0.65)+((num(last30[k])/30)*0.35);
  const forecast={
    basis:'تقدير إحصائي مبني على 65% من متوسط آخر 7 أيام و35% من متوسط آخر 30 يوماً؛ ليس ضماناً للمستقبل.',
    next30Days:{sales:round(weightedDaily('netSales')*30),expenses:round(weightedDaily('expenses')*30),netProfit:round(weightedDaily('netProfit')*30)},
    trend:{sales7VsPrev7Pct:pct(last7.netSales,prev7.netSales),profit7VsPrev7Pct:pct(last7.netProfit,prev7.netProfit),expenses7VsPrev7Pct:pct(last7.expenses,prev7.expenses),sales30VsPrev30Pct:pct(last30.netSales,prev30.netSales)},
    last7,last30,prev7,prev30,
  };

  const categoryMap=new Map((app.categories||[]).map(c=>[c.id,c.name]));
  const catalog=(app.products||[]).filter(x=>x&&!x.deletedAt).map(p=>{
    let stock=0; try{stock=num(app.getProductStock?.(p.id,app.settings?.activeWarehouseId));}catch{}
    return {id:p.id,name:p.name,sku:p.sku,internalCode:p.internalCode,categoryId:p.categoryId,categoryName:categoryMap.get(p.categoryId)||'',stock,minStock:num(p.minStock??p.minimumStock??p.reorderPoint),costPrice:num(p.costPrice),sellingPrice:num(p.sellingPrice),baseUnitName:p.baseUnitName,units:(p.units||[]).map(u=>({id:u.id,name:u.name,factor:num(u.conversionToBase||1),salePrice:num(u.salePrice),costPrice:num(u.costPrice),barcodes:u.barcodes||[]}))};
  });
  const prodStats=new Map(catalog.map(p=>[p.id,{id:p.id,name:p.name,qty7:0,qtyPrev7:0,qty30:0,qtyPrev30:0,revenue30:0,cost30:0,lastSaleAt:null}]));
  const applyItems=(inv,sign)=>{
    const d=asDate(inv.date); const age=(now-d)/DAY;
    for(const it of (inv.items||[])){
      const st=prodStats.get(it.productId); if(!st)continue;
      const baseQty=num(it.quantity)*num(it.conversionFactor||1)*sign;
      const revenue=num(it.total || (num(it.quantity)*num(it.unitPrice)))*sign;
      const prod=(app.products||[]).find(p=>p.id===it.productId);
      const fallback=num(it.quantity)*num(it.costPriceAtSale ?? (num(prod?.costPrice)*num(it.conversionFactor||1)));
      const cost=num(it.fifoCostTotal ?? fallback)*sign;
      if(age<=7)st.qty7+=baseQty;
      else if(age<=14)st.qtyPrev7+=baseQty;
      if(age<=30){st.qty30+=baseQty;st.revenue30+=revenue;st.cost30+=cost;}
      else if(age<=60)st.qtyPrev30+=baseQty;
      if(sign>0&&(!st.lastSaleAt||d>asDate(st.lastSaleAt)))st.lastSaleAt=inv.date;
    }
  };
  sales.forEach(x=>applyItems(x,1)); returns.forEach(x=>applyItems(x,-1));
  const productAnalytics=catalog.map(p=>{
    const st=prodStats.get(p.id)||{}; const avgDaily=Math.max(0,num(st.qty30))/30;
    const daysSince=st.lastSaleAt?Math.max(0,Math.floor((now-asDate(st.lastSaleAt))/DAY)):null;
    const daysCover=avgDaily>0?num(p.stock)/avgDaily:null;
    const target14=avgDaily*14+Math.max(0,num(p.minStock));
    const reorder14=Math.max(0,Math.ceil(target14-num(p.stock)));
    const grossProfit30=num(st.revenue30)-num(st.cost30);
    const marginPct=Math.abs(num(st.revenue30))>0?(grossProfit30/num(st.revenue30))*100:null;
    return {...p,qty7:round(st.qty7),qtyPrev7:round(st.qtyPrev7),qty30:round(st.qty30),qtyPrev30:round(st.qtyPrev30),revenue30:round(st.revenue30),grossProfit30:round(grossProfit30),marginPct:marginPct==null?null:round(marginPct,1),trendQty7Pct:pct(st.qty7,st.qtyPrev7),avgDailyQty30:round(avgDaily,3),daysCover:daysCover==null?null:round(daysCover,1),reorder14,lastSaleAt:st.lastSaleAt,daysSinceLastSale:daysSince};
  });
  const lowStock=productAnalytics.filter(x=>x.stock<=Math.max(0,x.minStock||3)).sort((a,b)=>a.stock-b.stock).slice(0,60);
  const staleProducts=productAnalytics.filter(x=>x.stock>0&&((x.daysSinceLastSale==null)||x.daysSinceLastSale>=45)).sort((a,b)=>(b.daysSinceLastSale??99999)-(a.daysSinceLastSale??99999)).slice(0,60);
  const topSellingByQty=[...productAnalytics].filter(x=>x.qty30>0).sort((a,b)=>b.qty30-a.qty30).slice(0,30);
  const topSellingByRevenue=[...productAnalytics].filter(x=>x.revenue30>0).sort((a,b)=>b.revenue30-a.revenue30).slice(0,30);
  const restockCandidates=[...productAnalytics].filter(x=>x.reorder14>0&&x.qty30>0).sort((a,b)=>{const da=a.daysCover==null?99999:a.daysCover,db=b.daysCover==null?99999:b.daysCover;return da-db||b.qty30-a.qty30;}).slice(0,40);
  const growingProducts=[...productAnalytics].filter(x=>x.qty7>0&&x.trendQty7Pct!=null&&x.trendQty7Pct>10).sort((a,b)=>num(b.trendQty7Pct)-num(a.trendQty7Pct)).slice(0,30);

  const allCustomers=(app.customers||[]).filter(x=>x&&!x.deletedAt).map(c=>({id:c.id,name:c.name,balance:num(c.balance),phone:c.phone,address:c.address}));
  const allSuppliers=(app.suppliers||[]).filter(x=>x&&!x.deletedAt).map(s=>({id:s.id,name:s.name,balance:num(s.balance),phone:s.phone,address:s.address}));
  const restaurantOrders=(restaurant?.orders||[]).filter(Boolean);
  const todayRestaurant=restaurantOrders.filter(o=>sameDay(asDate(o.createdAt||o.date),now));
  const kitchenOpen=restaurantOrders.filter(o=>!['closed','paid','cancelled','completed'].includes(String(o.status||'').toLowerCase()));
  const safeSettings={...app.settings}; delete safeSettings.ai; delete safeSettings.apiKey;
  return {
    generatedAt:now.toISOString(),currency:app.settings?.currencySymbol||'₪',storeName:app.settings?.storeName||'كاش توب 3',activeTab:app.activeTab,settings:safeSettings,
    reportMetrics,forecast,
    accounts:(app.accounts||[]).filter(Boolean).map(a=>({id:a.id,name:a.name,type:a.type,balance:num(a.balance),isDefault:!!a.isDefault})),
    warehouses:(app.warehouses||[]).filter(Boolean).map(w=>({id:w.id,name:w.name,code:w.code,isDefault:!!w.isDefault})),
    categories:(app.categories||[]).filter(Boolean).map(c=>({id:c.id,name:c.name})), catalog,
    kpis:{todaySales:reportMetrics.today.grossSales,todayNetSales:reportMetrics.today.netSales,todaySalesCount:sales.filter(range('today')).length,todayReturns:reportMetrics.today.returnsTotal,monthSales:reportMetrics.month.grossSales,monthNetSales:reportMetrics.month.netSales,monthSalesCount:sales.filter(range('month')).length,todayExpenses:reportMetrics.today.expenses,monthExpenses:reportMetrics.month.expenses,todayGrossProfit:reportMetrics.today.grossProfit,todayNetProfit:reportMetrics.today.netProfit,monthGrossProfit:reportMetrics.month.grossProfit,monthNetProfit:reportMetrics.month.netProfit,allGrossProfit:reportMetrics.all.grossProfit,allNetProfit:reportMetrics.all.netProfit,todayCost:reportMetrics.today.costOfGoodsSold,monthCost:reportMetrics.month.costOfGoodsSold,customerDebtTotal:allCustomers.reduce((s,x)=>s+Math.max(0,num(x.balance)),0),supplierBalanceTotal:allSuppliers.reduce((s,x)=>s+Math.max(0,num(x.balance)),0),lowStockCount:lowStock.length,staleProductsCount:staleProducts.length,restaurantTodayOrders:todayRestaurant.length,restaurantOpenOrders:kitchenOpen.length},
    analytics:{topSellingByQty,topSellingByRevenue,lowStock,staleProducts,restockCandidates,growingProducts,forecast},
    topItems:topSellingByRevenue,lowStock,customers:allCustomers.slice(0,350),suppliers:allSuppliers.slice(0,350),employees:(app.employees||[]).filter(Boolean).map(e=>({id:e.id,name:e.name,phone:e.phone,role:e.role,roleName:e.roleName,active:e.active!==false})),
    recentSales:sales.slice().sort((a,b)=>asDate(b.date)-asDate(a.date)).slice(0,220).map(x=>({id:x.id,invoiceNumber:x.invoiceNumber,date:x.date,customerId:x.customerId,customerName:x.customerName,grandTotal:num(x.grandTotal),paidAmount:num(x.paidAmount),remainingAmount:num(x.remainingAmount),paymentType:x.paymentType,items:(x.items||[]).slice(0,80).map(compactItem)})),
    recentPurchases:(app.purchases||[]).slice().sort((a,b)=>asDate(b.date)-asDate(a.date)).slice(0,180).map(x=>({id:x.id,invoiceNumber:x.invoiceNumber,supplierInvoiceNumber:x.supplierInvoiceNumber,date:x.date,supplierId:x.supplierId,supplierName:x.supplierName,grandTotal:num(x.grandTotal),paidAmount:num(x.paidAmount),remainingAmount:num(x.remainingAmount),items:(x.items||[]).slice(0,80).map(compactItem)})),
    recentExpenses:expenses.slice().sort((a,b)=>asDate(b.date)-asDate(a.date)).slice(0,220).map(x=>({id:x.id,date:x.date,category:x.category,amount:num(x.amount),accountId:x.accountId,accountName:x.accountName,notes:x.notes})),
    restaurant:{enabled:!!app.settings?.isRestaurantModeEnabled,sections:(restaurant?.sections||[]).slice(0,80),tables:(restaurant?.tables||[]).slice(0,120),openTables:(restaurant?.tables||[]).filter(t=>t.status&&t.status!=='available').slice(0,80),recentOrders:restaurantOrders.slice(0,150),kitchenSections:(restaurant?.kitchenSections||[]).slice(0,60),reservations:(restaurant?.reservations||[]).slice(0,100),wasteRecords:(restaurant?.wasteRecords||[]).slice(0,100)}
  };
};

const localInsights = (ctx) => {
  const c=ctx.currency,k=ctx.kpis,arr=[];
  arr.push(`صافي ربح اليوم ${num(k.todayNetProfit).toFixed(2)} ${c} • صافي المبيعات ${num(k.todayNetSales).toFixed(2)} ${c}.`);
  if(k.lowStockCount)arr.push(`${k.lowStockCount} صنف منخفض المخزون؛ ${ctx.lowStock.slice(0,3).map(x=>x.name).join('، ')}.`);
  if(k.staleProductsCount)arr.push(`${k.staleProductsCount} صنف راكد يحتاج مراجعة.`);
  if(k.customerDebtTotal>0)arr.push(`ديون العملاء ${num(k.customerDebtTotal).toFixed(2)} ${c}.`);
  return arr;
};


export const OscarAI = () => {
  const app=useApp(); const restaurant=useRestaurant();
  const canAI=canAccessPermission('canAccessAI',{runtime:window.OscarActivation?.readRuntime?.()||null,currentUser:app.currentUser,activeEmployee:app.activeEmployee});
  const [open,setOpen]=useState(false),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[messages,setMessages]=useState([]),[showSettings,setShowSettings]=useState(false),[connection,setConnection]=useState('');
  useEffect(()=>{ const openOscarAI=()=>{if(canAI)setOpen(true);}; window.addEventListener('oscar-ai-open',openOscarAI); return()=>window.removeEventListener('oscar-ai-open',openOscarAI); },[canAI]);
  const [files,setFiles]=useState([]),[executing,setExecuting]=useState(false);
  const fileRef=useRef(null), scrollRef=useRef(null);
  const context=useMemo(()=>buildContext(app,restaurant),[app.invoices,app.purchases,app.expenses,app.products,app.customers,app.suppliers,app.accounts,app.warehouses,app.categories,app.stock,app.settings,app.activeTab,app.employees,restaurant.orders,restaurant.tables,restaurant.sections,restaurant.kitchenSections,restaurant.reservations,restaurant.wasteRecords]);
  const insights=useMemo(()=>localInsights(context),[context]);
  const previews=useMemo(()=>files.map(f=>({file:f,url:URL.createObjectURL(f)})),[files]);
  useEffect(()=>()=>previews.forEach(x=>{if(x.url)URL.revokeObjectURL(x.url);}),[previews]);
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[messages,busy,executing]);

  const allowedActionTypes=new Set(['create_product','create_purchase','create_customer','create_voucher','create_sales_return','export_data']);
  const executeDirect=async(actions)=>{
    if(executing||!actions?.length)return;
    const safeActions=actions.filter(a=>allowedActionTypes.has(a?.type));
    if(!safeActions.length){
      setMessages(prev=>[...prev,{role:'assistant',content:'المحادثة مخصصة للأصناف والمشتريات والعملاء والسندات والتقارير والمرتجعات.'}]);
      return;
    }
    setExecuting(true); let backup='';
    try{
      if(safeActions.some(isMutationAction)) backup=await app.handleExportBackup?.();
      const results=await executeAIActions(app,safeActions,{restaurant});
      setMessages(prev=>[...prev,{role:'assistant',success:true,content:results.join(' • ')}]);
    }catch(e){
      if(backup){try{await app.handleImportBackup?.(backup);}catch{}}
      setMessages(prev=>[...prev,{role:'assistant',error:true,content:`لم يتم التنفيذ: ${String(e?.message||e)}`}]);
    }finally{setExecuting(false);}
  };

  const run=async(text,attached=null)=>{
    const q=String(text??input).trim(); const sendingFiles=attached||files;
    if((!q&&!sendingFiles.length)||busy||executing)return;
    setInput(''); setFiles([]);
    const userMsg={role:'user',content:q||'نفذ المطلوب من الملف المرفق',attachments:sendingFiles.map(f=>f.name)}; setMessages(prev=>[...prev,userMsg]);
    setBusy(true);
    try{
      const history=[...messages,userMsg].slice(-6).map(m=>({role:m.role,content:m.content}));
      const res=await askOscar({message:q,history,context,files:sendingFiles});
      let actions=(res.actions?.length?res.actions:(res.action?[res.action]:[])).filter(Boolean);
      const missing=res.missing_fields||[];
      if(missing.length){setMessages(prev=>[...prev,{role:'assistant',content:String(res.answer||'اذكر البيانات الضرورية فقط.'),missing}]);return;}
      if(!actions.length){setMessages(prev=>[...prev,{role:'assistant',content:String(res.answer||'اكتب المهمة المطلوب تنفيذها.')}]);return;}
      await executeDirect(actions);
    }catch(err){setMessages(prev=>[...prev,{role:'assistant',error:true,content:`تعذر Cash Top AI: ${String(err?.message||err)}`}]);}
    finally{setBusy(false);}
  };

  const testConnection=async()=>{setConnection('جاري الفحص...');try{const r=await aiHealthCheck();setConnection(`الاتصال يعمل ✓ • ${r?.model||getAIConfig().model}`);}catch(e){setConnection(`فشل الاتصال: ${e.message}`);}};
  const quicks=[['ضيف صنف شوكولاتة، الكرتونة فيها 24 حبة','إضافة صنف',PackagePlus],['سجل فاتورة مشتريات من الصورة المرفقة','فاتورة مشتريات',Receipt],['ضيف عميل انور الندا','إضافة عميل',WalletCards],['سجل سند قبض 100 من العميل ...','سند قبض',FileDown],['سجل سند صرف 50 إلى ...','سند صرف',FileDown],['قديش صافي الربح اليوم حسب تقرير الأرباح؟','تقرير الربح',TrendingUp],['ايش أكثر المنتجات مبيعاً؟','تقرير المبيعات',BarChart3],['اعمل مرتجع مبيعات من الملف المرفق','مرتجع',RotateCcw]];

  if(!canAI)return null;
  return h(React.Fragment,null,
    open&&h('div',{className:'oscar-ai-overlay fixed z-[2147481600] bg-black/45 backdrop-blur-[2px] flex justify-center',onClick:()=>setOpen(false)},
      h('section',{dir:'rtl',onClick:e=>e.stopPropagation(),className:'oscar-ai-panel w-full sm:max-w-3xl bg-white shadow-2xl overflow-hidden flex flex-col border border-slate-200'},
        h('header',{className:'shrink-0 p-3 border-b flex items-center justify-between gap-3 bg-gradient-to-l from-emerald-600 to-emerald-500 text-white'},
          h('div',{className:'flex items-center gap-2 min-w-0'},h('div',{className:'w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center'},h(Bot,{className:'w-6 h-6'})),h('div',{className:'min-w-0'},h('div',{className:'font-black text-sm'},'كاش توب AI'),h('div',{className:'text-[10px] text-emerald-50 truncate'},'أصناف • مشتريات • عملاء • سندات • تقارير • مرتجعات'))),
          h('div',{className:'flex items-center gap-1'},h('button',{type:'button',onClick:()=>setShowSettings(v=>!v),className:'p-2 rounded-xl hover:bg-white/15'},h(Settings2,{className:'w-4 h-4'})),h('button',{type:'button',onClick:()=>setOpen(false),title:'إغلاق',className:'w-9 h-9 rounded-xl bg-white text-emerald-700 border border-white shadow-md flex items-center justify-center hover:bg-emerald-50 active:scale-95'},h(X,{className:'w-5 h-5 stroke-[3]'})))
        ),
        showSettings&&h('div',{className:'shrink-0 p-3 border-b bg-slate-50 space-y-2'},h('div',{className:'text-xs font-black'},'اتصال Cash Top AI'),h('div',{className:'rounded-xl border bg-white px-3 py-2 text-[11px] text-slate-600'},h('div',{className:'font-bold text-slate-700'},'المصدر: ملف دخول الشركة (.mzauth)'),h('div',{className:'mt-1 font-mono text-[10px]'},`الموديل: ${getAIConfig().model}`)),h('button',{type:'button',onClick:testConnection,className:'px-3 py-2 rounded-xl border bg-white text-xs font-bold'},'اختبار الاتصال'),connection?h('div',{className:'text-[10px] text-slate-500'},connection):null),
        h('div',{ref:scrollRef,className:'flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-3 bg-slate-50'},
          messages.length===0?h(React.Fragment,null,h('div',{className:'rounded-2xl bg-white border p-4 shadow-sm'},h('div',{className:'font-black text-sm flex items-center gap-2'},h(Sparkles,{className:'w-4 h-4 text-emerald-600'}),'كاش توب 3 جاهز للتنفيذ'),...insights.map((x,i)=>h('div',{key:i,className:'mt-2 text-xs text-slate-600 flex gap-2'},h(CheckCircle2,{className:'w-4 h-4 text-emerald-500 shrink-0 mt-0.5'}),h('span',null,x))),h('div',{className:'mt-3 text-[11px] text-slate-500'},'اكتب طلبك أو أرفق صورة. المرفقات هنا صور فقط، ويستطيع قراءة فاتورة المشتريات من الصورة مع المنتج والوحدة والكمية والسعر.')),h('div',{className:'grid grid-cols-2 sm:grid-cols-4 gap-2'},...quicks.map(([q,label,Icon],i)=>h('button',{key:i,type:'button',onClick:()=>setInput(q),className:'p-3 rounded-2xl bg-white border text-right hover:border-emerald-300 shadow-sm'},h(Icon,{className:'w-5 h-5 text-emerald-600 mb-2'}),h('div',{className:'text-xs font-black'},label),h('div',{className:'text-[10px] text-slate-400 mt-1 line-clamp-2'},q))))):null,
          ...messages.map((m,i)=>h('div',{key:i,className:`flex ${m.role==='user'?'justify-start':'justify-end'}`},h('div',{className:`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-6 whitespace-pre-wrap ${m.role==='user'?'bg-emerald-600 text-white rounded-tr-md':m.error?'bg-rose-50 border border-rose-200 text-rose-800 rounded-tl-md':m.success?'bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-tl-md':'bg-white border shadow-sm text-slate-700 rounded-tl-md'}`},m.content,m.attachments?.length?h('div',{className:'mt-1 text-[10px] opacity-80'},`📎 ${m.attachments.length} مرفق`):null,m.missing?.length?h('div',{className:'mt-2 text-[10px] font-bold text-amber-700'},`مطلوب فقط: ${m.missing.join('، ')}`):null))),
          busy?h('div',{className:'flex justify-end'},h('div',{className:'bg-white border rounded-2xl rounded-tl-md px-4 py-3 text-xs text-slate-500 shadow-sm flex items-center gap-2'},h(LoaderCircle,{className:'w-4 h-4 animate-spin'}),'كاش توب 3 يحلل وينفذ...')):null
        ),
        h('footer',{className:'shrink-0 p-3 border-t bg-white'},
          files.length?h('div',{className:'mb-2 flex gap-2 overflow-x-auto pb-1'},...previews.map((x,i)=>h('div',{key:i,className:'relative shrink-0 w-20 h-16 rounded-xl overflow-hidden border bg-slate-100'},h('img',{src:x.url,className:'w-full h-full object-cover',alt:`مرفق ${i+1}`}),h('button',{type:'button',onClick:()=>setFiles(prev=>prev.filter((_,idx)=>idx!==i)),className:'absolute top-1 left-1 w-5 h-5 rounded-full bg-black/65 text-white flex items-center justify-center'},h(X,{className:'w-3 h-3'}))))):null,
          h('div',{className:'flex items-end gap-2'},
            h('button',{type:'button',onClick:()=>fileRef.current?.click(),title:'إرفاق صورة',className:'h-10 shrink-0 px-3 rounded-xl border bg-slate-50 flex items-center justify-center gap-1.5 text-slate-700 font-bold text-[10px] hover:border-emerald-300'},h(Paperclip,{className:'w-4 h-4'}),h('span',null,'إرفاق صورة')),
            h('textarea',{value:input,onChange:e=>setInput(e.target.value),onKeyDown:e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();run();}},rows:1,placeholder:'اكتب استفسارك هنا',className:'flex-1 min-w-0 resize-none min-h-10 max-h-24 px-3 py-2.5 rounded-2xl border bg-slate-50 text-xs focus:outline-none focus:border-emerald-500'}),
            h('button',{id:'oscar-ai-send','data-enter-primary':'true',type:'button',disabled:busy||executing||(!input.trim()&&!files.length),onClick:()=>run(),className:'w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center disabled:opacity-40'},h(Send,{className:'w-4 h-4'}))
          ),
          h('input',{ref:fileRef,type:'file',accept:'image/*',multiple:true,className:'hidden',onChange:e=>{const all=Array.from(e.target.files||[]);const picked=all.filter(f=>String(f?.type||'').toLowerCase().startsWith('image/')||/\.(?:jpe?g|png|webp|gif|bmp)$/i.test(String(f?.name||'')));const next=[...files,...picked].slice(0,8);setFiles(next);if(picked.length<all.length)app.showToast?.('المسموح فقط الصور','warning');if([...files,...picked].length>8)app.showToast?.('الحد الأقصى 8 صور','warning');e.target.value='';}}),
          h('div',{className:'mt-1.5 text-[9px] text-slate-400'},'المرفقات المسموحة فقط: صور. لقراءة الفواتير صوّر الاسم والوحدة والكمية والسعر بوضوح.')
        )
      )
    )
  );
};
