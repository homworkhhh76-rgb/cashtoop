import {registerLayer} from './hooks__appNavigation.js?v=7.9.4.139-ledger-print';
import {t} from './services__i18n.js?v=7.9.4.139-ledger-print';
import { createPortal } from 'react-dom';
import React, {useEffect} from 'react';
import { useApp } from './context__AppContext.js?v=7.9.4.139-ledger-print';
import { getBrandLogoDataUrl, getBrandLogoDisplayUrl, DEFAULT_LOGO_DATA_URL } from './brand__logo.js?v=7.9.4.139-ledger-print';
import { BrandLogoImage } from './components__common__BrandLogoImage.js?v=7.9.4.139-ledger-print';
import { canAccessTab, canAccessPermission, firstAllowedTab } from './utils__permissions.js?v=7.9.4.139-ledger-print';
import {
  LayoutDashboard, ShoppingCart, ReceiptText, Truck, Package, Boxes, Warehouse,
  Users, Building2, Wallet, Receipt, FileSpreadsheet, UserCheck, Barcode, BarChart3,
  Trash2, Settings, LayoutGrid, UtensilsCrossed, ChefHat, Scale, Sparkles, CalendarRange, MessageSquareText, Headphones, BookOpenCheck, X, ChevronLeft, LogOut, Store, ChartNoAxesCombined, ContactRound, WalletCards
} from 'lucide-react';

const h = React.createElement;
const SidebarLayer=props=>createPortal(h('div',{...props,id:'ct-mobile-sidebar-overlay',role:'dialog','aria-modal':true},props.children),document.body);

export const Sidebar = () => {
  const {
    activeTab, setActiveTab, cart, vouchers, employees, mobileSidebarOpen,
    setMobileSidebarOpen, settings, currentUser, activeEmployee, isLoaded
  } = useApp();

  useEffect(()=>{const open=()=>setMobileSidebarOpen(true);window.addEventListener('ct-open-drawer',open);return()=>window.removeEventListener('ct-open-drawer',open)},[]);
  useEffect(()=>{if(mobileSidebarOpen)return registerLayer(()=>setMobileSidebarOpen(false))},[mobileSidebarOpen]);
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
  const accessArgs = {
    runtime,
    currentUser,
    activeEmployee,
    restaurantEnabled: !!settings.isRestaurantModeEnabled,
  };

  const navItems = [
    { id:'pos', label:t("الكاشير POS"), icon:ShoppingCart, badge:cart.length || undefined },
    { id:'oscar_ai', label:'كاش توب AI', icon:Sparkles, ai:true },
    { id:'dashboard', label:t("لوحة التحكم"), icon:LayoutDashboard },
    { id:'sales', label:t("المبيعات والفواتير"), icon:ReceiptText },
    { id:'purchases', label:t("المشتريات والتوريد"), icon:Truck },
    { id:'vouchers', label:t("سندات القبض والصرف"), icon:FileSpreadsheet, badge:vouchers.length || undefined },
    { id:'employees', label:t("الموظفون والصلاحيات"), icon:UserCheck, badge:employees.length || undefined },
    { id:'products', label:t("إدارة الأصناف"), icon:Package },
    { id:'categories', label:t("التصنيفات"), icon:Boxes },
    { id:'inventory', label:t("المخزون والتحويلات"), icon:Warehouse },
    { id:'customers', label:t("العملاء والديون"), icon:Users },
    { id:'suppliers', label:t("الموردون والحسابات"), icon:Building2 },
    { id:'accounts', label:t("الصندوق والورديات"), icon:Wallet },
    { id:'expenses', label:t("المصروفات اليومية"), icon:Receipt },
    { id:'barcodes', label:t("طباعة الباركود"), icon:Barcode },
    { id:'reports', label:t("التقارير والأرباح"), icon:BarChart3 },
    { id:'financial_years', label:t("المجموعات المالية"), icon:CalendarRange },
    { id:'message_templates', label:t("قوالب الرسائل"), icon:MessageSquareText },
    { id:'oscar_ledger', label:'دفتر كاش توب 3', icon:BookOpenCheck },
    { id:'support', label:t("الدعم الفني"), icon:Headphones },
    { id:'trash', label:t("سلة المحذوفات"), icon:Trash2 },
    { id:'settings', label:t("إعدادات النظام"), icon:Settings },
  ];

  const restaurantItems = settings.isRestaurantModeEnabled ? [
    { id:'restaurant_tables', label:t("الطاولات والصالات"), icon:LayoutGrid, restaurant:true },
    { id:'restaurant_waiter', label:t("واجهة الجرسون"), icon:UtensilsCrossed, restaurant:true },
    { id:'restaurant_kitchen', label:t("شاشة المطبخ KDS"), icon:ChefHat, restaurant:true },
    { id:'restaurant_waste', label:t("الوصفات والهالك"), icon:Scale, restaurant:true },
  ] : [];

  const orderedItems = settings.isRestaurantModeEnabled ? [navItems[0], navItems[1], ...restaurantItems, ...navItems.slice(2)] : navItems;
  const allNavItems = orderedItems.filter(item=>item.id!=='oscar_ai').filter(item => item.id === 'support' ? true : (item.id === 'oscar_ai'
    ? canAccessPermission('canAccessAI', accessArgs)
    : canAccessTab(item.id, accessArgs)));
  const go = id => {
    if (id === 'support') {
      setMobileSidebarOpen(false);
      window.location.href='./support.html';
      return;
    }
    if (id === 'oscar_ledger') {
      if (canAccessPermission('canAccessOscarLedger', accessArgs)) {
        setMobileSidebarOpen(false);
        try {
          const rt = window.OscarActivation?.readRuntime?.();
          const companyId = String(rt?.companyId || rt?.tenantId || '').trim();
          if (companyId) sessionStorage.setItem('oscar_ledger_grant_v1', JSON.stringify({ companyId, at: Date.now() }));
        } catch (_) {}
        window.location.assign('./oscar-ledger.html?from=app');
      }
      return;
    }
    if (id === 'oscar_ai') {
      if (canAccessPermission('canAccessAI', accessArgs)) window.dispatchEvent(new Event('oscar-ai-open'));
      setMobileSidebarOpen(false);
      return;
    }
    setActiveTab(id);
    setMobileSidebarOpen(false);
  };

  const brand = (compact=false) => h('div', { className:`${compact?'p-3 pl-12':'p-3.5'} border-b border-slate-100 bg-white shrink-0` },
    h('button', { type:'button', onClick:()=>go(firstAllowedTab(accessArgs) || 'no_access'), className:'w-full flex items-center gap-2.5 text-right min-w-0' },
      brandSettings
        ? h(BrandLogoImage, {
            settings:brandSettings,
            className:'w-10 h-10 object-cover rounded-xl border border-violet-100 bg-white shrink-0',
            alt:brandName
          })
        : h('span',{className:'w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-300 shrink-0 grid place-items-center'},h(Building2,{className:'w-5 h-5'})),
      h('div', { className:'min-w-0 flex-1' },
        h('div', { className:'text-[13px] font-black text-slate-900 truncate min-h-[19px]' }, brandName || ''),
        h('div', { className:'text-[10px] font-bold text-violet-600 truncate min-h-[15px]' }, isLoaded ? (settings.subtitle || 'إدارة ذكية') : '')
      )
    )
  );

  const groups=[['العمل اليومي',['dashboard','pos','sales','purchases']],['الأصناف والمخزون',['products','categories','inventory','barcodes']],['المال والعملاء',['customers','suppliers','accounts','vouchers','expenses','reports','financial_years']],['المطعم',restaurantItems.map(x=>x.id)],['الإدارة',['employees','message_templates','oscar_ledger','support','trash','settings']]];
  const appIcons={pos:Store,dashboard:ChartNoAxesCombined,customers:ContactRound,accounts:WalletCards};
  const nav = () => h('nav',{className:'ct-drawer-nav','aria-label':t("أقسام التطبيق")},...groups.map(([title,ids])=>{
    const items=ids.map(id=>allNavItems.find(x=>x.id===id)).filter(Boolean);
    return items.length?h('section',{key:title},h('h3',null,t(title)),...items.map(item=>h('button',{key:item.id,type:'button',onClick:()=>go(item.id),'aria-current':activeTab===item.id?'page':undefined,className:'ct-drawer-item'+(activeTab===item.id?' is-active':'')},h('span',{className:'ct-drawer-icon'},h(appIcons[item.id]||item.icon,{size:20,strokeWidth:1.8})),h('span',{className:'ct-drawer-label'},item.label),item.badge?h('b',null,item.badge):h(ChevronLeft,{size:15,className:'ct-drawer-chevron'})))):null;
  }));

  return h(React.Fragment, null,
    mobileSidebarOpen ? h(SidebarLayer, { className: 'fixed inset-0 z-50 lg:hidden flex justify-start' },
      h('div', { className: 'ct-drawer-backdrop fixed inset-0 bg-black/60 backdrop-blur-[1px]', onClick:()=>setMobileSidebarOpen(false) }),
      h('aside', { dir:'rtl', className:'ct-app-drawer mobile-sidebar-panel relative w-72 max-w-[85vw] h-full min-h-0 bg-white border-l border-slate-200 shadow-2xl flex flex-col z-10 text-right overflow-hidden' },
        h('div', { className:'relative ct-drawer-brand' }, brand(true),h('button',{type:'button',className:'ct-drawer-close','aria-label':t("إغلاق"),onClick:()=>setMobileSidebarOpen(false)},h(X,{size:20}))),
        nav(true),
        h('button',{type:'button',className:'ct-drawer-logout',onClick:()=>{if(confirm('تسجيل الخروج من الشركة؟ لن يتم حذف البيانات المحلية.')){window.OscarActivation?.clearRuntime?.();location.reload()}}},h(LogOut,{size:19}),t("تسجيل الخروج"))
      )
    ) : null
  );
};
