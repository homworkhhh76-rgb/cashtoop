import React from 'react';
import { useApp } from './restaurant__context__AppContext.js?v=7.9.4.89-cashtop3-purple-category-save';
import { UtensilsCrossed, Volume2, Save } from 'lucide-react';
const h=React.createElement;
const row=(title,desc,control)=>h('div',{className:'flex items-center justify-between gap-3 p-3 border rounded-xl bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'},h('div',{className:'min-w-0'},h('span',{className:'text-xs font-bold block'},title),desc?h('span',{className:'text-[10px] text-slate-400 block mt-0.5'},desc):null),control);
export const RestaurantSettingsPanel=()=>{
 const {settings,updateSettings,showToast}=useApp();
 const patch=async(obj)=>{await updateSettings(obj);try{await window.OscarCloudSync?.syncNow?.({force:true});await window.OscarCloudSync?.pullRealtimeNow?.({force:true});}catch(_){}};
 const enabled=!!settings.isRestaurantModeEnabled;
 return h('div',{id:'restaurant-settings-panel',className:'p-5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/70 shadow-xs space-y-4'},
   h('div',{className:'flex items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-800'},
     h('div',{className:'flex items-center gap-2 min-w-0'},h('div',{className:'w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center shrink-0'},h(UtensilsCrossed,{className:'w-4 h-4'})),h('div',{className:'min-w-0'},h('h3',{className:'text-sm font-black text-slate-900 dark:text-white'},'وضع المطعم والكافيه'),h('p',{className:'text-[11px] text-slate-400'},'نفس إعدادات نظام المطعم المرفق: الطاولات والجرسون والمطبخ KDS وتذاكر المطبخ'))),
     h('label',{className:'flex items-center gap-2 cursor-pointer shrink-0'},h('span',{className:'text-xs font-bold'},enabled?'مفعل':'معطل'),h('input',{type:'checkbox',checked:enabled,onChange:e=>patch({isRestaurantModeEnabled:e.target.checked}),className:'w-5 h-5 accent-amber-600'}))
   ),
   enabled?h('div',{className:'grid grid-cols-1 sm:grid-cols-2 gap-3'},
     row('طباعة تذكرة المطبخ تلقائياً','يطبع تذكرة المطبخ فور وصول الطلب إلى شاشة المطبخ',h('input',{type:'checkbox',checked:!!settings.autoPrintKitchenTicket,onChange:e=>patch({autoPrintKitchenTicket:e.target.checked}),className:'w-4 h-4 accent-amber-600'})),
     h('div',{className:'p-3 border rounded-xl bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'},h('label',{className:'text-xs font-bold block mb-1'},'مقاس طابعة المطبخ'),h('select',{value:settings.kitchenTicketWidth||'80mm',onChange:e=>patch({kitchenTicketWidth:e.target.value}),className:'w-full px-3 py-2 text-xs border rounded-xl bg-white dark:bg-slate-900'},h('option',{value:'80mm'},'80 ملم'),h('option',{value:'58mm'},'58 ملم'))),
     row('إظهار الأسعار بتذكرة المطبخ','الافتراضي بدون أسعار',h('input',{type:'checkbox',checked:!!settings.kitchenTicketShowPrices,onChange:e=>patch({kitchenTicketShowPrices:e.target.checked}),className:'w-4 h-4 accent-amber-600'})),
     h('div',{className:'p-3 border rounded-xl bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'},h('label',{className:'text-xs font-bold block mb-1'},'وقت التحضير المستهدف (دقيقة)'),h('input',{type:'number',min:3,max:60,value:settings.targetPrepTimeMinutes||15,onChange:e=>patch({targetPrepTimeMinutes:parseInt(e.target.value)||15}),className:'w-full px-3 py-2 text-xs border rounded-xl bg-white dark:bg-slate-900 font-mono'})),
     h('div',{className:'p-3 border rounded-xl bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'},h('label',{className:'text-xs font-bold block mb-1'},'حالة الطاولة بعد الدفع'),h('select',{value:settings.tableAfterPayment||'available',onChange:e=>patch({tableAfterPayment:e.target.value}),className:'w-full px-3 py-2 text-xs border rounded-xl bg-white dark:bg-slate-900'},h('option',{value:'available'},'فارغة / متاحة'),h('option',{value:'cleaning'},'بحاجة تنظيف'))),
     row('تنبيهات صوتية للمطبخ','صوت عند وصول الطلب أو جاهزيته',h('input',{type:'checkbox',checked:settings.enableKitchenSoundAlerts!==false,onChange:e=>patch({enableKitchenSoundAlerts:e.target.checked}),className:'w-4 h-4 accent-amber-600'}))
   ):h('p',{className:'text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl'},'عند إيقاف الوضع تختفي أقسام المطعم من القوائم ويبقى الكاشير العادي كما هو.')
 );
};
