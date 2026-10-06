import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from './context__AppContext.js?v=7.9.4.136-localization';
import { X, Bell, CreditCard, PackageX, History, CalendarClock, Truck, AlertTriangle, Trash2, Send, FileText, DatabaseBackup, Bot, Save, RotateCcw, Clock3, Users, FileArchive, Radio, Image as ImageIcon } from 'lucide-react';
import { saveTelegramConfig, telegramRequest, uploadTelegramSnapshot, sendDailyReportNow, sendCustomersReportNow, sendAllReportsNow, sendBackupNow } from './services__telegramReports.js?v=7.9.4.136-localization';

const h = React.createElement;
const DAY = 86400000;

export function buildSystemNotifications(app) {
  const { customers=[], suppliers=[], products=[], invoices=[], settings={}, getProductStock } = app || {};
  const alerts = [];
  const warehouseId = settings.activeWarehouseId;
  const now = Date.now();
  const outstandingOldest = new Map();
  const lastSaleByProduct = new Map();

  for (const inv of invoices) {
    if (inv?.deletedAt) continue;
    const t = new Date(inv.date || 0).getTime();
    if (inv?.type === 'sale' && Number(inv?.remainingAmount) > 0 && inv?.customerId && Number.isFinite(t)) {
      const prev = outstandingOldest.get(inv.customerId);
      if (!prev || t < prev) outstandingOldest.set(inv.customerId, t);
    }
    if (inv?.type === 'sale' && Number.isFinite(t)) {
      for (const item of (inv.items || [])) if (item?.productId && t > (lastSaleByProduct.get(item.productId) || 0)) lastSaleByProduct.set(item.productId, t);
    }
  }
  for (const customer of customers) {
    if (customer?.deletedAt || Number(customer?.balance) <= 0) continue;
    const oldestTs = outstandingOldest.get(customer.id);
    const fallbackTs = new Date(customer?.updatedAt || customer?.createdAt || 0).getTime();
    const baseTs = oldestTs || (Number.isFinite(fallbackTs) ? fallbackTs : 0);
    const age = baseTs > 0 ? Math.max(0, Math.floor((now - baseTs) / DAY)) : null;
    if (age === null || age >= 7) alerts.push({id:`debt-${customer.id}`,type:'debt',tab:'customers',Icon:CreditCard,tone:'rose',title:`دين متأخر: ${customer.name}`,text:`المتبقي ${Number(customer.balance).toFixed(2)} ${settings.currencySymbol || ''}${age!==null?` • منذ ${age} يوم`:''}`});
  }
  for (const product of products) {
    if (product?.deletedAt || product?.status === 'archived') continue;
    const qty = Number(getProductStock?.(product.id, warehouseId) || 0), reorder = Number(product.reorderPoint ?? 0);
    if (qty < 0) alerts.push({id:`negative-${product.id}`,type:'negative',tab:'inventory',Icon:AlertTriangle,tone:'rose',title:`رصيد سالب: ${product.name}`,text:`الرصيد الحالي ${qty} ${product.baseUnitName || ''}`});
    if (qty <= reorder) alerts.push({id:`low-${product.id}`,type:'low',tab:'inventory',Icon:PackageX,tone:'amber',title:`مخزون ناقص: ${product.name}`,text:`المتوفر ${qty} ${product.baseUnitName || ''} • حد إعادة الطلب ${reorder}`});
    if (qty > 0) {
      const lastSale = lastSaleByProduct.get(product.id), idleDays = lastSale ? Math.floor((now-lastSale)/DAY) : null;
      if (!lastSale || idleDays >= 30) alerts.push({id:`stale-${product.id}`,type:'stale',tab:'products',Icon:History,tone:'slate',title:`صنف راكد: ${product.name}`,text:lastSale ? `لم يُبع منذ ${idleDays} يوم • الرصيد ${qty}` : `لا توجد له مبيعات مسجلة • الرصيد ${qty}`});
    }
    const dates=[product.expiryDate,...(Array.isArray(product.fifoBatches)?product.fifoBatches.filter(b=>Number(b?.remainingBaseQty)>0).map(b=>b.expiryDate):[])].filter(Boolean);
    let nearest=null; for(const d of dates){const t=new Date(d).getTime();if(Number.isFinite(t)&&(!nearest||t<nearest))nearest=t;}
    if(nearest){const left=Math.ceil((nearest-now)/DAY);if(left<=30)alerts.push({id:`expiry-${product.id}`,type:'expiry',tab:'inventory',Icon:CalendarClock,tone:left<0?'rose':'amber',title:`${left<0?'صلاحية منتهية':'صلاحية قريبة'}: ${product.name}`,text:left<0?`منتهي منذ ${Math.abs(left)} يوم`:`متبقي ${left} يوم حتى الانتهاء`});}
  }
  for (const supplier of suppliers) if (!supplier?.deletedAt && Number(supplier?.balance) > 0) alerts.push({id:`supplier-${supplier.id}`,type:'supplier',tab:'suppliers',Icon:Truck,tone:'blue',title:`مستحق لمورد: ${supplier.name}`,text:`المبلغ المستحق ${Number(supplier.balance).toFixed(2)} ${settings.currencySymbol || ''}`});
  const order={negative:0,debt:1,expiry:2,low:3,stale:4,supplier:5}, dismissed=new Set(Array.isArray(settings.dismissedNotificationIds)?settings.dismissedNotificationIds:[]);
  return alerts.filter(a=>!dismissed.has(a.id)).sort((a,b)=>(order[a.type]??9)-(order[b.type]??9)).slice(0,300);
}

const ActionButton=({Icon,title,sub,onClick,busy,tone='emerald'})=>h('button',{type:'button',disabled:!!busy,onClick,className:`text-right rounded-2xl border p-3 flex items-center gap-3 transition active:scale-[.99] disabled:opacity-60 ${tone==='blue'?'border-blue-200 bg-blue-50/70 hover:bg-blue-50':tone==='violet'?'border-violet-200 bg-violet-50/70 hover:bg-violet-50':tone==='amber'?'border-amber-200 bg-amber-50/70 hover:bg-amber-50':'border-violet-200 bg-violet-50/70 hover:bg-violet-50'}`},
  h('div',{className:`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone==='blue'?'bg-blue-600':tone==='violet'?'bg-violet-600':tone==='amber'?'bg-amber-500':'bg-violet-600'} text-white`},h(Icon,{className:'w-5 h-5'})),
  h('div',{className:'min-w-0'},h('div',{className:'text-[12px] font-black text-slate-900'},busy?'جاري التنفيذ...':title),h('div',{className:'text-[10px] font-semibold text-slate-500 mt-0.5 leading-4'},sub))
);

export const NotificationsModal = ({ open, onClose }) => {
  const app=useApp();
  const alerts=useMemo(()=>buildSystemNotifications(app),[app.customers,app.suppliers,app.products,app.invoices,app.stock,app.settings.activeWarehouseId,app.settings.currencySymbol,app.settings.dismissedNotificationIds]);
  const [dailyReport,setDailyReport]=useState(false),[dailyBackup,setDailyBackup]=useState(false),[busy,setBusy]=useState(''),[serverStatus,setServerStatus]=useState(null);
  const reportRecipients=(Array.isArray(app.settings.telegramRecipients)?app.settings.telegramRecipients:[]).filter(r=>r&&r.enabled!==false&&String(r.chatId||'').trim());
  const reportRecipientLabels=reportRecipients.map(r=>`Chat ID ${String(r.chatId||'').trim()}`).filter(Boolean);
  useEffect(()=>{if(!open)return;setDailyReport(app.settings.telegramAutoReportEnabled !== undefined ? !!app.settings.telegramAutoReportEnabled : !!app.settings.telegramDailyReportEnabled);setDailyBackup(!!app.settings.telegramDailyBackupEnabled);saveTelegramConfig(app.settings||{}).then(async cfg=>{if(cfg?.serverAvailable){const st=await telegramRequest({action:'status'}).catch(()=>null);setServerStatus({...cfg,...(st||{})});}else setServerStatus(cfg);}).catch(()=>setServerStatus({configured:reportRecipients.length>0,directReady:reportRecipients.length>0,serverAvailable:false}));},[open,app.settings.telegramRecipients,app.settings.telegramDailyReportEnabled,app.settings.telegramDailyBackupEnabled]);
  if(!open)return null;
  const tone=t=>({rose:'border-rose-200 bg-rose-50 text-rose-700',amber:'border-amber-200 bg-amber-50 text-amber-700',blue:'border-blue-200 bg-blue-50 text-blue-700',slate:'border-slate-200 bg-slate-50 text-slate-700'}[t]||'border-slate-200 bg-white text-slate-700');
  const currentSettings=()=>({...app.settings,telegramDailyReportEnabled:dailyReport,telegramAutoReportEnabled:dailyReport,telegramDailyBackupEnabled:dailyBackup});
  const appForSend=()=>({...app,settings:currentSettings()});
  const run=async(key,fn,success)=>{if(busy)return;setBusy(key);try{if(!reportRecipients.length)throw new Error('أضف Chat ID من إعدادات النظام أولاً، ويجب أن يكون صاحب المعرف قد فتح البوت وضغط Start');const result=await fn();app.showToast?.(`${success}${result?.sent?` إلى ${result.sent} مستخدم`:''}`,'success');const cfg=await saveTelegramConfig(currentSettings()).catch(()=>({configured:true,directReady:true,serverAvailable:false}));setServerStatus(cfg);}catch(e){app.showToast?.(e?.message||'تعذر تنفيذ العملية','error');}finally{setBusy('');}};
  const toggleAuto=async(kind,val)=>{
    if(kind==='report')setDailyReport(val);else setDailyBackup(val);
    const next={...currentSettings(),[kind==='report'?'telegramDailyReportEnabled':'telegramDailyBackupEnabled']:val,...(kind==='report'?{telegramAutoReportEnabled:val}:{})};
    await app.updateSettings({telegramDailyReportEnabled:!!next.telegramDailyReportEnabled,telegramAutoReportEnabled:!!next.telegramAutoReportEnabled,telegramDailyBackupEnabled:!!next.telegramDailyBackupEnabled});
    const cfg=await saveTelegramConfig(next).catch(()=>({ok:true,configured:reportRecipients.length>0,directReady:reportRecipients.length>0,serverAvailable:false}));
    if(val&&reportRecipients.length){
      if(kind==='backup') await sendBackupNow({...app,settings:next});
      else await uploadTelegramSnapshot({...app,settings:next},{includeBackup:!!next.telegramDailyBackupEnabled});
    }
    if(val&&kind==='backup'){try{window.dispatchEvent(new Event('oscar-backup-check'));}catch(_){}}
    app.showToast?.(val?(reportRecipients.length?'تم تفعيل الإرسال التلقائي كل 24 ساعة':'تم التفعيل، وسيبدأ الإرسال بعد إضافة Chat ID'):'تم إيقاف الإرسال التلقائي',reportRecipients.length?'success':'warning');
    setServerStatus(cfg?.serverAvailable ? await telegramRequest({action:'status'}).catch(()=>cfg) : cfg);
  };
  const toggleBusy=async(kind)=>{if(busy)return;const val=kind==='report'?!dailyReport:!dailyBackup;setBusy(`toggle-${kind}`);try{await toggleAuto(kind,val);}catch(e){app.showToast?.(e?.message||'تعذر تحديث الإعداد','error');if(kind==='report')setDailyReport(!val);else setDailyBackup(!val);}finally{setBusy('');}};
  const dismissOne=async(id)=>{const old=Array.isArray(app.settings.dismissedNotificationIds)?app.settings.dismissedNotificationIds:[];await app.updateSettings({dismissedNotificationIds:[...new Set([...old,id])]});};
  const dismissAll=async()=>{const old=Array.isArray(app.settings.dismissedNotificationIds)?app.settings.dismissedNotificationIds:[];await app.updateSettings({dismissedNotificationIds:[...new Set([...old,...alerts.map(a=>a.id)])]});};
  const restoreDismissed=async()=>{await app.updateSettings({dismissedNotificationIds:[]});};

  const modal=h('div',{className:'fixed inset-x-0 oscar-bounded-modal p-2 sm:p-5 flex items-stretch sm:items-center justify-center overflow-hidden',style:{zIndex:2147483000,background:'rgba(15,23,42,.56)',padding:'12px',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)'},onClick:onClose},
    h('section',{className:'bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col',style:{width:'min(760px, calc(100vw - 24px))',maxHeight:'min(90vh, calc(100% - 24px))',borderRadius:'22px'},onClick:e=>e.stopPropagation()},
      h('header',{className:'shrink-0 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2'},
        h('div',{className:'flex items-center gap-3 min-w-0'},h('div',{className:'w-10 h-10 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center shrink-0'},h(Bell,{className:'w-5 h-5'})),h('div',{className:'min-w-0'},h('div',{className:'text-sm font-black text-slate-900 dark:text-white truncate'},'الإشعارات والتقارير والبوت'),h('div',{className:'text-[10px] font-bold text-slate-500'},`${alerts.length} تنبيه • ${serverStatus?.configured?'البوت جاهز':'إعداد البوت مطلوب'}`))),
        h('button',{type:'button',onClick:onClose,className:'w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center'},h(X,{className:'w-4 h-4'}))
      ),
      h('div',{className:'flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4 custom-scrollbar',style:{overscrollBehavior:'contain',WebkitOverflowScrolling:'touch'}},
        h('section',{className:'rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-3 space-y-3'},
          h('div',{className:'flex items-center justify-between gap-2'},h('div',{className:'flex items-center gap-2'},h(Bot,{className:'w-5 h-5 text-violet-700'}),h('div',null,h('div',{className:'text-xs font-black text-slate-900'},'Telegram والتقارير التلقائية'),h('div',{className:'text-[10px] text-slate-500'},'يستخدم نفس بوت إرسال الفواتير ويرسل إلى Chat ID المسجل في إعدادات النظام')))),
          h('div',{className:'rounded-xl border border-violet-200 bg-white px-3 py-2.5 space-y-1.5'},
            h('div',{className:'flex items-center justify-between gap-2'},h('div',{className:'text-[10px] font-black text-slate-700'},'بوت إرسال الفواتير'),h('div',{className:'text-[10px] font-black text-violet-700',dir:'ltr'},'@Oskarteaam_bot')),
            h('div',{className:'text-[9.5px] text-slate-500 leading-5'},reportRecipients.length?`سيتم إرسال التقارير إلى ${reportRecipients.length} معرف: ${reportRecipientLabels.join('، ')}`:'لا يوجد Chat ID مسجل حالياً. أضف المعرف الرقمي من إعدادات النظام ← Telegram والإشعارات.'),
            h('div',{className:'text-[9px] text-slate-400'},'لا تحتاج إلى إدخال Bot Token هنا؛ يتم استخدام بوت الفواتير وChat ID المحفوظ في إعدادات النظام تلقائياً.')
          ),
          h('div',{className:'grid sm:grid-cols-2 gap-2'},
            h('button',{type:'button',onClick:()=>toggleBusy('report'),className:`rounded-xl border p-3 flex items-center justify-between gap-3 text-right ${dailyReport?'border-violet-300 bg-violet-100':'border-slate-200 bg-white'}`},h('div',{className:'flex items-center gap-2'},h(Clock3,{className:'w-4 h-4 text-violet-700'}),h('div',null,h('div',{className:'text-[11px] font-black'},'إرسال التقرير كل 24 ساعة'),h('div',{className:'text-[9px] text-slate-500'},'نص + صورة + PDF تلقائياً'))),h('span',{className:`w-10 h-5 rounded-full p-0.5 ${dailyReport?'bg-violet-600':'bg-slate-300'}`},h('span',{className:`block w-4 h-4 rounded-full bg-white transition ${dailyReport?'translate-x-0':'translate-x-5'}`}))),
            h('button',{type:'button',onClick:()=>toggleBusy('backup'),className:`rounded-xl border p-3 flex items-center justify-between gap-3 text-right ${dailyBackup?'border-blue-300 bg-blue-100':'border-slate-200 bg-white'}`},h('div',{className:'flex items-center gap-2'},h(DatabaseBackup,{className:'w-4 h-4 text-blue-700'}),h('div',null,h('div',{className:'text-[11px] font-black'},'نسخة احتياطية كل 24 ساعة'),h('div',{className:'text-[9px] text-slate-500'},'ملف JSON كامل إلى البوت'))),h('span',{className:`w-10 h-5 rounded-full p-0.5 ${dailyBackup?'bg-blue-600':'bg-slate-300'}`},h('span',{className:`block w-4 h-4 rounded-full bg-white transition ${dailyBackup?'translate-x-0':'translate-x-5'}`})))
          ),
          h('div',{className:'grid sm:grid-cols-2 gap-2'},
            h(ActionButton,{Icon:Send,title:'إرسال جميع التقارير الآن',sub:'PDF شامل + صورة ملخص + النص فوراً',busy:busy==='all',onClick:()=>run('all',()=>sendAllReportsNow(appForSend()),'تم إرسال جميع التقارير للبوت')}),
            h(ActionButton,{Icon:FileText,title:'إرسال التقرير اليومي الآن',sub:'النص + صورة التقرير + PDF',tone:'blue',busy:busy==='daily',onClick:()=>run('daily',()=>sendDailyReportNow(appForSend()),'تم إرسال التقرير اليومي')}),
            h(ActionButton,{Icon:Users,title:'PDF العملاء والديون',sub:'كل العملاء • لنا/علينا • المسدد والمديون',tone:'violet',busy:busy==='customers',onClick:()=>run('customers',()=>sendCustomersReportNow(appForSend()),'تم إرسال تقرير العملاء والديون')}),
            h(ActionButton,{Icon:FileArchive,title:'إرسال النسخة الاحتياطية الآن',sub:'نسخة JSON كاملة من قاعدة البيانات',tone:'amber',busy:busy==='backup',onClick:()=>run('backup',()=>sendBackupNow(appForSend()),'تم إرسال النسخة الاحتياطية للبوت')})
          ),
          h('div',{className:'rounded-xl bg-white border border-slate-200 px-3 py-2 text-[9.5px] text-slate-500 leading-5 flex items-start gap-2'},h(Radio,{className:`w-3.5 h-3.5 mt-0.5 shrink-0 ${serverStatus?.configured?'text-violet-600':'text-amber-500'}`}),serverStatus?.configured?(serverStatus?.serverAvailable?'الإرسال التلقائي جاهز. إذا ظل الخادم يعمل تُرسل النسخة في موعدها حتى لو الصفحة مغلقة، وإذا كان البرنامج مغلقاً وقت الاستحقاق فسيتم إرسال النسخة المتأخرة فور أول فتح للبرنامج.':'الإرسال التلقائي جاهز. إذا مرّت 24 ساعة والبرنامج مغلق، تُرسل النسخة الكاملة فور أول فتح للبرنامج واتصال الإنترنت.'):'أضف Chat ID من إعدادات النظام، وتأكد أن صاحب المعرف فتح بوت إرسال الفواتير وضغط Start مرة واحدة.')
        ),
        h('section',{className:'rounded-2xl border border-slate-200 p-3 space-y-2'},
          h('div',{className:'flex items-center justify-between gap-2'},h('div',null,h('div',{className:'text-xs font-black text-slate-900'},'تنبيهات النظام'),h('div',{className:'text-[10px] text-slate-500'},`${alerts.length} تنبيه يحتاج المراجعة`)),h('div',{className:'flex gap-1'},h('button',{type:'button',onClick:restoreDismissed,className:'p-2 rounded-lg border text-slate-500',title:'إعادة التنبيهات المحذوفة'},h(RotateCcw,{className:'w-3.5 h-3.5'})),alerts.length?h('button',{type:'button',onClick:dismissAll,className:'inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-rose-200 text-rose-600 text-[10px] font-black'},h(Trash2,{className:'w-3.5 h-3.5'}),'حذف الكل'):null)),
          alerts.length===0?h('div',{className:'min-h-28 flex flex-col items-center justify-center text-center text-slate-400'},h(Bell,{className:'w-8 h-8 opacity-20'}),h('div',{className:'mt-2 text-xs font-black'},'لا توجد تنبيهات حالياً')):alerts.map(a=>h('div',{key:a.id,className:`w-full rounded-xl border px-2.5 py-2.5 flex items-start gap-2.5 ${tone(a.tone)}`},h('button',{type:'button',onClick:()=>{app.setActiveTab?.(a.tab);onClose?.();},className:'flex items-start gap-2.5 flex-1 min-w-0 text-right'},h('div',{className:'w-7 h-7 rounded-lg bg-white/80 flex items-center justify-center shrink-0'},h(a.Icon,{className:'w-3.5 h-3.5'})),h('div',{className:'min-w-0 flex-1'},h('div',{className:'text-[12px] font-black leading-5'},a.title),h('div',{className:'text-[10.5px] font-semibold opacity-80 leading-4 mt-0.5'},a.text))),h('button',{type:'button',onClick:()=>dismissOne(a.id),className:'w-7 h-7 rounded-lg bg-white/70 flex items-center justify-center shrink-0 hover:bg-white',title:'حذف الإشعار'},h(Trash2,{className:'w-3.5 h-3.5'}))))
        )
      ),
      h('footer',{className:'shrink-0 p-3 border-t border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur flex items-center gap-2'},
        h('button',{type:'button',disabled:!!busy,onClick:()=>run('all-fixed',()=>sendAllReportsNow(appForSend()),'تم إرسال جميع التقارير للبوت'),className:'flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black shadow-md disabled:opacity-60'},h(Send,{className:'w-4 h-4'}),busy==='all-fixed'?'جاري إرسال التقارير...':'إرسال جميع التقارير الآن'),
        h('button',{type:'button',disabled:!!busy,onClick:()=>run('backup-fixed',()=>sendBackupNow(appForSend()),'تم إرسال النسخة الاحتياطية للبوت'),className:'w-11 h-10 rounded-xl border border-slate-200 bg-white text-slate-600 flex items-center justify-center disabled:opacity-60',title:'إرسال نسخة احتياطية الآن'},h(DatabaseBackup,{className:'w-4 h-4'}))
      )
    )
  );
  return createPortal(modal,document.body);
};
