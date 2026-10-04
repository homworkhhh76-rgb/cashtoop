import React from 'react';
import { useApp } from './context__AppContext.js?v=7.9.4.90-cashtop3-search-logo';
import { getBrandLogoDataUrl, getBrandLogoDisplayUrl, DEFAULT_LOGO_DATA_URL } from './brand__logo.js?v=7.9.4.90-cashtop3-search-logo';
import { BrandLogoImage } from './components__common__BrandLogoImage.js?v=7.9.4.90-cashtop3-search-logo';
import { canAccessTab, canAccessPermission, firstAllowedTab } from './utils__permissions.js?v=7.9.4.90-cashtop3-search-logo';
import {
  LayoutDashboard, ShoppingCart, ReceiptText, Truck, Package, Boxes, Warehouse,
  Users, Building2, Wallet, Receipt, FileSpreadsheet, UserCheck, Barcode, BarChart3,
  Trash2, Settings, LayoutGrid, UtensilsCrossed, ChefHat, Scale, Sparkles, CalendarRange, MessageSquareText, Headphones, BookOpenCheck
} from 'lucide-react';

const h = React.createElement;

export const Sidebar = () => {
  const {
    activeTab, setActiveTab, cart, vouchers, employees, mobileSidebarOpen,
    setMobileSidebarOpen, settings, currentUser, activeEmployee, isLoaded
  } = useApp();

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
    { id:'pos', label:'الكاشير POS', icon:ShoppingCart, badge:cart.length || undefined },
    { id:'oscar_ai', label:'كاش توب AI', icon:Sparkles, ai:true },
    { id:'dashboard', label:'لوحة التحكم', icon:LayoutDashboard },
    { id:'sales', label:'المبيعات والفواتير', icon:ReceiptText },
    { id:'purchases', label:'المشتريات والتوريد', icon:Truck },
    { id:'vouchers', label:'سندات القبض والصرف', icon:FileSpreadsheet, badge:vouchers.length || undefined },
    { id:'employees', label:'الموظفون والصلاحيات', icon:UserCheck, badge:employees.length || undefined },
    { id:'products', label:'إدارة الأصناف', icon:Package },
    { id:'categories', label:'التصنيفات', icon:Boxes },
    { id:'inventory', label:'المخزون والتحويلات', icon:Warehouse },
    { id:'customers', label:'العملاء والديون', icon:Users },
    { id:'suppliers', label:'الموردون والحسابات', icon:Building2 },
    { id:'accounts', label:'الصندوق والورديات', icon:Wallet },
    { id:'expenses', label:'المصروفات اليومية', icon:Receipt },
    { id:'barcodes', label:'طباعة الباركود', icon:Barcode },
    { id:'reports', label:'التقارير والأرباح', icon:BarChart3 },
    { id:'financial_years', label:'السنة المالية والأرشيف', icon:CalendarRange },
    { id:'message_templates', label:'قوالب الرسائل', icon:MessageSquareText },
    { id:'oscar_ledger', label:'دفتر كاش توب 3', icon:BookOpenCheck },
    { id:'support', label:'الدعم الفني', icon:Headphones },
    { id:'trash', label:'سلة المحذوفات', icon:Trash2 },
    { id:'settings', label:'إعدادات النظام', icon:Settings },
  ];

  const restaurantItems = settings.isRestaurantModeEnabled ? [
    { id:'restaurant_tables', label:'الطاولات والصالات', icon:LayoutGrid, restaurant:true },
    { id:'restaurant_waiter', label:'واجهة الجرسون', icon:UtensilsCrossed, restaurant:true },
    { id:'restaurant_kitchen', label:'شاشة المطبخ KDS', icon:ChefHat, restaurant:true },
    { id:'restaurant_waste', label:'الوصفات والهالك', icon:Scale, restaurant:true },
  ] : [];

  const orderedItems = settings.isRestaurantModeEnabled ? [navItems[0], navItems[1], ...restaurantItems, ...navItems.slice(2)] : navItems;
  const allNavItems = orderedItems.filter(item => item.id === 'support' ? true : (item.id === 'oscar_ai'
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
        window.location.href='./oscar-ledger.html';
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
            className:'w-10 h-10 object-cover rounded-xl border border-emerald-100 bg-white shrink-0',
            alt:brandName
          })
        : h('span',{className:'w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-300 shrink-0 grid place-items-center'},h(Building2,{className:'w-5 h-5'})),
      h('div', { className:'min-w-0 flex-1' },
        h('div', { className:'text-[13px] font-black text-slate-900 truncate min-h-[19px]' }, brandName || ''),
        h('div', { className:'text-[10px] font-bold text-emerald-600 truncate min-h-[15px]' }, isLoaded ? (settings.subtitle || 'إدارة ذكية') : '')
      )
    )
  );

  const nav = mobile => h('nav', { className:'p-2 space-y-1 flex-1 min-h-0 overflow-y-auto custom-scrollbar' },
    ...allNavItems.map(item => {
      const active = activeTab === item.id;
      return h('button', {
        key:item.id,
        id:mobile ? undefined : `nav-${item.id}`,
        onClick:()=>go(item.id),
        className:`w-full flex items-center justify-between px-3 ${mobile?'py-2.5':'py-2'} rounded-xl text-[11px] font-semibold transition-all ${active
          ? (item.restaurant ? 'bg-amber-500 text-white shadow-sm' : 'bg-emerald-600 text-white shadow-sm')
          : 'text-slate-600 hover:bg-slate-100'}`
      },
        h('span', { className:'flex items-center gap-2 min-w-0' },
          h(item.icon, { className:`w-4 h-4 shrink-0 ${active?'text-white':'text-slate-400'}` }),
          h('span', { className:'truncate' }, item.label)
        ),
        item.badge !== undefined ? h('span', { className:`px-1.5 py-0.5 text-[9px] rounded-full font-black shrink-0 ${active?'bg-white text-emerald-700':'bg-emerald-100 text-emerald-700'}` }, item.badge) : null
      );
    })
  );

  return h(React.Fragment, null,
    h('aside', { id:'desktop-sidebar', className:'hidden lg:flex flex-col w-48 xl:w-48 shrink-0 h-full min-h-0 bg-white border-l border-slate-200 select-none text-right overflow-hidden' },
      brand(), nav(false),
      h('div', { className:'p-2.5 border-t border-slate-100 text-[9px] text-slate-400 text-center shrink-0' }, 'Cash Top 3 POS')
    ),
    mobileSidebarOpen ? h('div', { className:'fixed inset-0 z-50 lg:hidden flex justify-start' },
      h('div', { className:'fixed inset-0 bg-black/60 backdrop-blur-[1px]', onClick:()=>setMobileSidebarOpen(false) }),
      h('aside', { dir:'rtl', className:'mobile-sidebar-panel relative w-72 max-w-[85vw] h-full min-h-0 bg-white border-l border-slate-200 shadow-2xl flex flex-col z-10 text-right overflow-hidden' },
        h('div', { className:'relative' }, brand(true)),
        nav(true),
        h('div', { className:'p-2.5 border-t border-slate-100 text-[9px] text-slate-400 text-center shrink-0' }, 'Cash Top 3 POS')
      )
    ) : null
  );
};
