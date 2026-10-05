import React,{useState} from 'react';
import { useApp } from './context__AppContext.js?v=7.9.4.134-invoice-filters';
import { createCustomerPortalLinks } from './services__customerPortalLinks.js?v=7.9.4.134-invoice-filters';
const h=React.createElement;
const DEFAULTS={
 invoiceWhatsApp:`مرحباً {customer_name} 👋\nتم إصدار فاتورتك رقم {invoice_no} من {store_name}.\n\nالإجمالي: {invoice_total} {currency}\nالمدفوع: {paid_amount} {currency}\nالمتبقي: {remaining_amount} {currency}\n\nرابط السداد:\n{payment_link}\n\nشكراً لتعاملكم معنا.`,
 invoiceSms:`{store_name} - فاتورة {invoice_no}\nالإجمالي {invoice_total} {currency}، المتبقي {remaining_amount} {currency}.\nللسداد: {payment_link}`,
 customerWhatsApp:`مرحباً {customer_name} 👋\nرصيدك الحالي لدى {store_name}: {balance} {currency}.\n\nيمكنك السداد ومتابعة حسابك من الرابط:\n{payment_link}\n\nشكراً لك.`,
 customerSms:`{store_name}: رصيدك الحالي {balance} {currency}. للسداد: {payment_link}`,
};
const money=v=>Number(v||0).toFixed(2);
const dateText=v=>{try{return new Date(v||Date.now()).toLocaleDateString('ar-EG-u-nu-latn')}catch{return ''}};
const phoneDigits=value=>{let s=String(value||'').trim().replace(/[^0-9+]/g,'');if(s.startsWith('00'))s='+'+s.slice(2);if(s.startsWith('+'))return s;const d=s.replace(/\D/g,'');if(/^0\d{8,10}$/.test(d))return '+970'+d.slice(1);return d?`+${d}`:''};
const applyVars=(template,vars)=>String(template||'').replace(/\{[a-z0-9_]+\}/gi,m=>Object.prototype.hasOwnProperty.call(vars,m)?String(vars[m]??''):m);
const WhatsAppSvg=({className='w-[17px] h-[17px]'}={})=>h('svg',{viewBox:'0 0 24 24',className,fill:'none','aria-hidden':'true',style:{display:'block',width:'17px',height:'17px',margin:'0'}},h('path',{d:'M20.5 11.7A8.5 8.5 0 0 1 7.9 19.1L3.5 20.5l1.4-4.2A8.5 8.5 0 1 1 20.5 11.7Z',stroke:'currentColor',strokeWidth:'1.8',strokeLinejoin:'round'}),h('path',{d:'M8.2 7.7c.3-.4.6-.4.9-.2l1.1 1.6c.2.3.1.6-.1.9l-.6.7c.7 1.4 1.9 2.5 3.4 3.1l.7-.8c.2-.3.5-.4.8-.2l1.7.9c.3.2.4.5.3.8-.3 1.1-1.3 1.8-2.5 1.8-3.6-.1-7.3-3.4-7.5-7.1 0-.6.2-1.1.5-1.5Z',fill:'currentColor'}));
const SmsSvg=({className='w-[17px] h-[17px]'}={})=>h('svg',{viewBox:'0 0 24 24',className,fill:'none','aria-hidden':'true',style:{display:'block',width:'17px',height:'17px',margin:'0'}},h('rect',{x:'3',y:'4',width:'18',height:'14',rx:'3',stroke:'currentColor',strokeWidth:'1.8'}),h('path',{d:'m6 8 6 4 6-4M8 20h8',stroke:'currentColor',strokeWidth:'1.8',strokeLinecap:'round',strokeLinejoin:'round'}));
export const MessageActionButtons=({customer=null,invoice=null,kind='customer'})=>{
 const {settings,customers,saveCustomer,showToast}=useApp();
 const [busy,setBusy]=useState('');
 const resolvedCustomer=customer||(invoice?customers.find(c=>!c.deletedAt&&(String(c.id)===String(invoice.customerId||'')||(invoice.customerPhone&&String(c.phone||'').replace(/\D/g,'')===String(invoice.customerPhone||'').replace(/\D/g,''))||(invoice.customerName&&String(c.name||'').trim()===String(invoice.customerName||'').trim()))):null);
 const phone=phoneDigits(resolvedCustomer?.phone||invoice?.customerPhone||'');
 const disabled=!resolvedCustomer||!phone;
 const send=async(channel)=>{
   if(disabled){showToast(!resolvedCustomer?'لا يوجد عميل مسجل مرتبط بهذا السجل.':'العميل لا يملك رقم هاتف صالحاً.','warning');return;}
   setBusy(channel);
   try{
     const links=await createCustomerPortalLinks(resolvedCustomer,{saveCustomer});
     const vars={
       '{store_name}':settings.storeName||'كاش توب 3','{customer_name}':resolvedCustomer.name||invoice?.customerName||'عميل','{customer_phone}':resolvedCustomer.phone||'',
       '{balance}':money(Math.max(0,Number(resolvedCustomer.balance||0))),'{currency}':settings.currencySymbol||'₪','{payment_link}':links.paymentUrl,'{customer_link}':links.portalUrl,'{customer_code}':links.customerCode,
       '{invoice_no}':invoice?.invoiceNumber||invoice?.number||invoice?.id||'', '{invoice_date}':dateText(invoice?.date||invoice?.createdAt),
       '{invoice_total}':money(invoice?.grandTotal??invoice?.total),'{paid_amount}':money(invoice?.paidAmount),'{remaining_amount}':money(invoice?.remainingAmount),
     };
     const saved=settings.messageTemplates||{};
     const key=kind==='invoice'?(channel==='whatsapp'?'invoiceWhatsApp':'invoiceSms'):(channel==='whatsapp'?'customerWhatsApp':'customerSms');
     const message=applyVars(saved[key]||DEFAULTS[key],vars);
     if(channel==='whatsapp'){
       const digits=phone.replace(/\D/g,'');
       const url=`https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`;
       window.location.assign(url);
     }else location.href=`sms:${phone}?body=${encodeURIComponent(message)}`;
   }catch(error){showToast(error?.message||'تعذر تجهيز الرسالة','error');}
   finally{setBusy('');}
 };
 return h('span',{className:'inline-flex items-center justify-center gap-1 align-middle'},
   h('button',{type:'button',disabled:!!busy,onClick:()=>send('whatsapp'),title:'إرسال عبر WhatsApp',className:`w-7 h-7 p-0 shrink-0 rounded-lg border transition ${disabled?'text-slate-300 border-slate-200':'text-violet-700 border-violet-200 bg-violet-50 hover:bg-violet-100'}`,style:{display:'flex',alignItems:'center',justifyContent:'center',padding:'0',lineHeight:'0'}},busy==='whatsapp'?h('span',{className:'block w-3.5 h-3.5 rounded-full border-2 border-violet-200 border-t-violet-700 animate-spin'}):h(WhatsAppSvg)),
   h('button',{type:'button',disabled:!!busy,onClick:()=>send('sms'),title:'إرسال رسالة SMS',className:`w-7 h-7 p-0 shrink-0 rounded-lg border transition ${disabled?'text-slate-300 border-slate-200':'text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100'}`,style:{display:'flex',alignItems:'center',justifyContent:'center',padding:'0',lineHeight:'0'}},busy==='sms'?h('span',{className:'block w-3.5 h-3.5 rounded-full border-2 border-blue-200 border-t-blue-700 animate-spin'}):h(SmsSvg))
 );
};
