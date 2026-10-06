import {registerLayer} from './hooks__appNavigation.js?v=7.9.4.136-localization';
import {t} from './services__i18n.js?v=7.9.4.136-localization';
import React, {useState,useEffect,useRef} from 'react';
import {useApp} from './context__AppContext.js?v=7.9.4.136-localization';
import {canAccessTab,canAccessPermission} from './utils__permissions.js?v=7.9.4.136-localization';
import {LayoutDashboard,ShoppingCart,ReceiptText,Truck,Package,Boxes,Warehouse,Users,Building2,Wallet,Receipt,FileSpreadsheet,UserCheck,Barcode,BarChart3,Trash2,Settings,LayoutGrid,UtensilsCrossed,ChefHat,Scale,Sparkles,CalendarRange,MessageSquareText,Headphones,BookOpenCheck,LogOut,ChevronDown} from 'lucide-react';
const h=React.createElement;
export function DesktopNavigation(){
 const {activeTab,setActiveTab,cart,vouchers,employees,setMobileSidebarOpen,settings,currentUser,activeEmployee}=useApp();
 const runtime=window.OscarActivation?.readRuntime?.()||null;
 const accessArgs={runtime,currentUser,activeEmployee,restaurantEnabled:!!settings.isRestaurantModeEnabled};
 const [open,setOpen]=useState(null);const ref=useRef(null);
 useEffect(()=>{if(open)return registerLayer(()=>setOpen(null))},[open]);
 useEffect(()=>{const outside=e=>{if(!ref.current?.contains(e.target))setOpen(null)};const esc=e=>{if(e.key==='Escape')setOpen(null)};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',esc)}},[]);
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
  allNavItems.push({id:'logout',label:t('تسجيل الخروج'),icon:LogOut});
  const go = id => {
    if(id==='logout'){if(confirm('تسجيل الخروج من الشركة؟ لن يتم حذف البيانات المحلية.')){window.OscarActivation?.clearRuntime?.();location.reload()}return;}
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


 const groups=[['البيع',['pos','sales','purchases']],['الأصناف',['products','categories','inventory','barcodes']],['الحسابات',['customers','suppliers','accounts','vouchers','expenses','financial_years','reports']],['الإدارة',['dashboard','employees','message_templates','settings','trash','oscar_ledger','oscar_ai','support','logout']],['المطعم',['restaurant_tables','restaurant_waiter','restaurant_kitchen','restaurant_waste']]];
 return h('nav',{className:'ct-desktop-nav',ref,'aria-label':t("أقسام النظام")},...groups.map(([label,ids])=>{const items=ids.map(id=>allNavItems.find(i=>i.id===id)).filter(Boolean);if(!items.length)return null;return h('div',{key:label,className:'ct-nav-group'},h('button',{type:'button','aria-expanded':open===label,onClick:()=>setOpen(open===label?null:label),className:items.some(i=>i.id===activeTab)?'ct-nav-active':''},h(items[0].icon,{size:16}),t(label),h(ChevronDown,{size:13})),open===label&&h('div',{className:'ct-nav-menu'},...items.map(i=>h('button',{key:i.id,type:'button',onClick:()=>{setOpen(null);go(i.id)},className:activeTab===i.id?'ct-selected':''},h(i.icon,{size:17}),i.label))))}));
}
