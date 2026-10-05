import React, {useState,useEffect,useRef} from 'react';
import {useApp} from './context__AppContext.js?v=7.9.4.134-invoice-filters';
import {canAccessTab,canAccessPermission} from './utils__permissions.js?v=7.9.4.134-invoice-filters';
import {LayoutDashboard,ShoppingCart,ReceiptText,Truck,Package,Boxes,Warehouse,Users,Building2,Wallet,Receipt,FileSpreadsheet,UserCheck,Barcode,BarChart3,Trash2,Settings,LayoutGrid,UtensilsCrossed,ChefHat,Scale,Sparkles,CalendarRange,MessageSquareText,Headphones,BookOpenCheck,ChevronDown} from 'lucide-react';
const h=React.createElement;
export function DesktopNavigation(){
 const {activeTab,setActiveTab,cart,vouchers,employees,setMobileSidebarOpen,settings,currentUser,activeEmployee}=useApp();
 const runtime=window.OscarActivation?.readRuntime?.()||null;
 const accessArgs={runtime,currentUser,activeEmployee,restaurantEnabled:!!settings.isRestaurantModeEnabled};
 const [open,setOpen]=useState(null);const ref=useRef(null);
 useEffect(()=>{const outside=e=>{if(!ref.current?.contains(e.target))setOpen(null)};const esc=e=>{if(e.key==='Escape')setOpen(null)};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',esc)}},[]);
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


 const groups=[['البيع',['pos','sales','purchases']],['الأصناف',['products','categories','inventory','barcodes']],['الحسابات',['customers','suppliers','accounts','vouchers','expenses','financial_years','reports']],['الإدارة',['dashboard','employees','message_templates','settings','trash','oscar_ledger','oscar_ai','support']],['المطعم',['restaurant_tables','restaurant_waiter','restaurant_kitchen','restaurant_waste']]];
 return h('nav',{className:'ct-desktop-nav',ref,'aria-label':'أقسام النظام'},...groups.map(([label,ids])=>{const items=ids.map(id=>allNavItems.find(i=>i.id===id)).filter(Boolean);if(!items.length)return null;return h('div',{key:label,className:'ct-nav-group'},h('button',{type:'button','aria-expanded':open===label,onClick:()=>setOpen(open===label?null:label),className:items.some(i=>i.id===activeTab)?'ct-nav-active':''},h(items[0].icon,{size:16}),label,h(ChevronDown,{size:13})),open===label&&h('div',{className:'ct-nav-menu'},...items.map(i=>h('button',{key:i.id,type:'button',onClick:()=>{setOpen(null);go(i.id)},className:activeTab===i.id?'ct-selected':''},h(i.icon,{size:17}),i.label))))}));
}
