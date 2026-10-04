import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useApp } from './context__AppContext.js?v=7.9.4.90-cashtop3-search-logo';
import { PWAInstallButton } from './components__common__PWAInstallButton.js?v=7.9.4.90-cashtop3-search-logo';
import { getBrandLogoDataUrl, getBrandLogoDisplayUrl, DEFAULT_LOGO_DATA_URL } from './brand__logo.js?v=7.9.4.90-cashtop3-search-logo';
import { BrandLogoImage } from './components__common__BrandLogoImage.js?v=7.9.4.90-cashtop3-search-logo';
import { uploadProductImageToTelegram } from './services__productImages.js?v=7.9.4.90-cashtop3-search-logo';
import { Wifi, WifiOff, RefreshCw, Maximize2, Minimize2, Clock, Store, Camera, Menu, LogOut, Building2, Bell } from 'lucide-react';
import { NotificationsModal, buildSystemNotifications } from './components__common__NotificationsModal.js?v=7.9.4.90-cashtop3-search-logo';
import { canAccessTab, canAccessPermission, firstAllowedTab } from './utils__permissions.js?v=7.9.4.90-cashtop3-search-logo';
import { saveTelegramConfig, uploadTelegramSnapshot } from './services__telegramReports.js?v=7.9.4.90-cashtop3-search-logo';

const h = React.createElement;

export const Header = () => {
  const app = useApp();
  const {
    settings, saveSettings, isLoaded, isOnline, isSyncing, syncQueue, setShowSyncModal,
    activeShift, setActiveTab, mobileSidebarOpen, setMobileSidebarOpen, showToast,
    customers, suppliers, products, categories, invoices, purchases, expenses, auditLogs, stock, stockMovements, warehouses, accounts, transfers, vouchers, shifts, employees, heldInvoices, getProductStock, currentUser, activeEmployee,
  } = app;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const telegramRevision = useMemo(() => {
    const stockSig=(stock||[]).reduce((s,x)=>s+Number(x?.baseQuantity ?? x?.quantity ?? 0),0).toFixed(4);
    const customerSig=(customers||[]).reduce((s,x)=>s+Number(x?.balance||0),0).toFixed(2);
    const supplierSig=(suppliers||[]).reduce((s,x)=>s+Number(x?.balance||0),0).toFixed(2);
    const accountSig=(accounts||[]).reduce((s,x)=>s+Number(x?.balance||0),0).toFixed(2);
    return [
      invoices?.length||0,purchases?.length||0,expenses?.length||0,vouchers?.length||0,transfers?.length||0,
      auditLogs?.length||0,stockMovements?.length||0,products?.length||0,categories?.length||0,warehouses?.length||0,
      employees?.length||0,heldInvoices?.length||0,shifts?.length||0,stockSig,customerSig,supplierSig,accountSig,
      settings.storeName||'',settings.logoUrl||'',settings.currencySymbol||''
    ].join('|');
  }, [invoices,purchases,expenses,vouchers,transfers,auditLogs,stockMovements,products,categories,warehouses,employees,heldInvoices,shifts,stock,customers,suppliers,accounts,settings.storeName,settings.logoUrl,settings.currencySymbol]);
  useEffect(() => {
    if (!(settings.telegramAutoReportEnabled !== false || settings.telegramDailyReportEnabled || settings.telegramDailyBackupEnabled)) return;
    let cancelled=false;
    const timer=window.setTimeout(async()=>{
      if(cancelled)return;
      try{await saveTelegramConfig(settings);await uploadTelegramSnapshot(app,{includeBackup:!!settings.telegramDailyBackupEnabled});}catch(_){/* سيعاد رفع اللقطة عند التغيير التالي أو فتح الإشعارات */}
    },12000);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  }, [telegramRevision, settings.telegramAutoReportEnabled, settings.telegramDailyReportEnabled, settings.telegramDailyBackupEnabled, settings.telegramRecipients]);
  const notificationCount = useMemo(() => buildSystemNotifications({ customers, suppliers, products, invoices, stock, settings, getProductStock }).length, [customers, suppliers, products, invoices, stock, settings.activeWarehouseId, settings.currencySymbol]);
  const runtime = window.OscarActivation?.readRuntime?.() || null;
  const runtimeBrandName = String(runtime?.companyName || runtime?.trialProfile?.companyName || '').trim();
  const runtimeBrandLogo = String(runtime?.trialProfile?.logo || '').trim();
  const legacyBrandNames = new Set(['كاش توب 3','أوسكار المحاسبي','الميزان ماركت','AlMezan Market POS']);
  const configuredName = String(settings?.storeName || '').trim();
  const brandName = runtimeBrandName && (!configuredName || legacyBrandNames.has(configuredName))
    ? runtimeBrandName
    : (configuredName || runtimeBrandName || '');
  const configuredLogoFileId = String(settings?.logoTelegramFileId || '').trim();
  const configuredLogoSource = String(settings?.logoSourceUrl || settings?.logoUrl || '').trim();
  const hasCompanyLogo = !!configuredLogoFileId || (!!configuredLogoSource && !/(^|\/)brand-logo\.png(?:[?#].*)?$/i.test(configuredLogoSource));
  const brandSettings = runtimeBrandLogo && !hasCompanyLogo
    ? { ...settings, logoUrl:runtimeBrandLogo, logoSourceUrl:'', logoTelegramFileId:'' }
    : settings;
  const accessArgs = { runtime, currentUser, activeEmployee, restaurantEnabled: !!settings.isRestaurantModeEnabled };
  const homeTab = firstAllowedTab(accessArgs) || 'no_access';
  const canAccounts = canAccessTab('accounts', accessArgs);
  const canSettings = canAccessPermission('canAccessSettings', accessArgs);
  const logoInputRef = useRef(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) { showToast('اختر صورة PNG أو JPG أو WEBP', 'error'); return; }
    setLogoUploading(true);
    try {
      const dataUrl = await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('تعذر قراءة الشعار'));r.readAsDataURL(file);});
      const uploaded = await uploadProductImageToTelegram(dataUrl, `store-logo-${Date.now()}.jpg`);
      await saveSettings({ ...settings, logoUrl:'', logoSourceUrl:uploaded.url||'', logoTelegramFileId:uploaded.fileId, logoTelegramUniqueId:uploaded.fileUniqueId, logoStorage:'telegram-photo', logoUpdatedAt:new Date().toISOString() });
      showToast('تم تحديث شعار المحل', 'success');
    } catch(error) { showToast(error?.message || 'تعذر رفع شعار المحل', 'error'); }
    finally { setLogoUploading(false); }
  };

  return h('header', { id: 'main-header', className: 'sticky top-0 z-40 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 flex items-center justify-between gap-2.5 shadow-xs select-none' },
    h('div', { className: 'flex items-center gap-2 shrink-0 min-w-0 lg:hidden' },
      h('button', { type: 'button', onClick: () => setMobileSidebarOpen(!mobileSidebarOpen), className: 'lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800', title: 'القائمة الجانبية' }, h(Menu, { className: 'w-5 h-5' })),
      h('input', { ref: logoInputRef, type: 'file', accept: 'image/*', className: 'hidden', onChange: handleLogoUpload }),
      h('button', { type: 'button', onClick: () => canSettings ? logoInputRef.current?.click() : setActiveTab(homeTab), className: 'relative w-9 h-9 shrink-0 rounded-xl overflow-hidden bg-white border border-emerald-500/30 shadow-xs group', title: canSettings ? 'تغيير شعار المحل' : 'الصفحة الرئيسية المسموحة', disabled:logoUploading || !isLoaded },
        brandSettings
          ? h(BrandLogoImage, { settings:brandSettings, alt:brandName, className:'w-full h-full object-cover bg-white' })
          : h('span',{className:'w-full h-full grid place-items-center bg-slate-50 text-slate-300'},h(Store,{className:'w-4 h-4'})),
        logoUploading ? h('span',{className:'absolute inset-0 bg-white/80 flex items-center justify-center'},h('span',{className:'w-5 h-5 rounded-full border-2 border-emerald-200 border-t-emerald-600 animate-spin'})) : (isLoaded ? h('span', { className: 'absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity' }, h(Camera, { className: 'w-4 h-4' })) : null)
      ),
      h('button', { type: 'button', onClick: () => setActiveTab(homeTab), className: 'flex flex-col text-right min-w-0 group focus:outline-none' },
        h('h1', { className: 'text-[11px] sm:text-xs font-black leading-tight text-slate-900 dark:text-white tracking-tight max-w-[155px] sm:max-w-[210px] line-clamp-2 group-hover:text-emerald-600 transition min-h-[17px]' }, brandName || ''),
        h('span', { className: 'text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block leading-none truncate min-h-[10px]' }, isLoaded ? (settings.subtitle || 'إدارة ذكية') : '')
      ),
      h('div', { className: 'hidden xl:flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-medium' }, h(Store, { className: 'w-3 h-3 text-slate-400' }), h('span', null, settings.activeBranchName))
    ),
    h('div', { className: 'flex items-center gap-1.5 sm:gap-2 shrink-0' },
      h(PWAInstallButton),
      canAccounts ? (activeShift
        ? h('button', { type: 'button', onClick: () => setActiveTab('accounts'), className: 'hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold' }, h(Clock, { className: 'w-3.5 h-3.5 text-emerald-600' }), h('span', null, `وردية #${activeShift.shiftNumber}`))
        : h('button', { type: 'button', onClick: () => setActiveTab('accounts'), className: 'hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-amber-800 dark:text-amber-300 text-xs font-semibold' }, h(Clock, { className: 'w-3.5 h-3.5 text-amber-600' }), h('span', null, 'فتح وردية'))) : null,
      h('button', { id: 'btn-header-sync', type: 'button', onClick: () => setShowSyncModal(true), className: `relative p-1.5 rounded-lg border transition-colors ${isOnline ? 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800' : 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-600'}`, title: isOnline ? 'حالة المزامنة' : 'غير متصل بالإنترنت' },
        h(RefreshCw, { className: `w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-600' : ''}` }),
        syncQueue.length > 0 ? h('span', { className: 'absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-white' }, syncQueue.length) : null
      ),
      h('div', { className: `hidden sm:flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium ${isOnline ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'}` },
        isOnline ? h(Wifi, { className: 'w-3 h-3' }) : h(WifiOff, { className: 'w-3 h-3' }), h('span', { className: 'hidden md:inline' }, isOnline ? 'Online' : 'Offline')
      ),
      runtime?.companyName ? h('div', { className: 'hidden md:flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 max-w-40' }, h(Building2, { className: 'w-3 h-3 text-emerald-600 shrink-0' }), h('span', { className: 'truncate' }, runtime.companyName)) : null,
      h('button', { type: 'button', onClick: () => { if (confirm('تسجيل الخروج من الشركة؟ لن يتم حذف البيانات المحلية.')) { window.OscarActivation?.clearRuntime?.(); location.reload(); } }, className: 'p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50', title: 'تسجيل الخروج' }, h(LogOut, { className: 'w-4 h-4' })),
      h('button', { type:'button', onClick:()=>setShowNotifications(true), className:'relative p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50', title:'الإشعارات والتنبيهات' },
        h(Bell,{className:'w-4 h-4'}),
        notificationCount > 0 ? h('span',{className:'absolute rounded-full bg-rose-600 text-white font-black flex items-center justify-center',style:{top:'-5px',left:'-5px',height:'14px',minWidth:'14px',padding:'0 3px',fontSize:'8px',lineHeight:'14px',boxShadow:'0 0 0 1.5px #fff'}}, notificationCount > 99 ? '99+' : String(notificationCount)) : null
      ),
      h('button', { id: 'btn-fullscreen-toggle', type: 'button', onClick: toggleFullscreen, className: 'hidden md:flex p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800', title: 'ملء الشاشة' }, isFullscreen ? h(Minimize2, { className: 'w-4 h-4' }) : h(Maximize2, { className: 'w-4 h-4' }))
    ),
    h(NotificationsModal,{open:showNotifications,onClose:()=>setShowNotifications(false)})
  );
};
