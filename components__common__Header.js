import React, { useMemo, useState } from 'react';
import { useApp } from './context__AppContext.js?v=7.9.4.134-invoice-filters';
import { SearchableDropdown } from './components__common__Dropdown.js?v=7.9.4.134-invoice-filters';
import { LayoutDashboard, Package, Users, Wallet, Settings, Warehouse, Truck, Boxes, FileSpreadsheet, UserCheck, Barcode, CalendarRange, MessageSquareText, Trash2, UtensilsCrossed, ChefHat, Scale, Menu, LogOut, Bell, ShoppingCart, CloudCog, UserPlus, Receipt, PackagePlus, BarChart3 } from 'lucide-react';
import { NotificationsModal, buildSystemNotifications } from './components__common__NotificationsModal.js?v=7.9.4.134-invoice-filters';

import { DesktopNavigation } from './components__common__DesktopNavigation.js?v=7.9.4.134-invoice-filters';
const h = React.createElement;
const TAB_TITLES = {
  dashboard:'لوحة التحكم', pos:'الكاشير', sales:'المبيعات', purchases:'المشتريات',
  products:'الأصناف', categories:'التصنيفات', inventory:'المخزون', customers:'العملاء',
  suppliers:'الموردون', accounts:'الصندوق والورديات', expenses:'المصروفات', vouchers:'السندات',
  employees:'الموظفون', barcodes:'الباركود', reports:'التقارير', financial_years:'السنة المالية',
  message_templates:'قوالب الرسائل', trash:'سلة المحذوفات', settings:'الإعدادات',
  restaurant_tables:'الطاولات', restaurant_waiter:'الجرسون', restaurant_kitchen:'المطبخ', restaurant_waste:'الوصفات والهالك'
};

export const Header = () => {
  const app = useApp();
  const { isOnline, isSyncing, syncQueue, setShowSyncModal, activeTab, setActiveTab,
    mobileSidebarOpen, setMobileSidebarOpen, customers, suppliers, products, invoices, stock, settings, getProductStock } = app;
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationCount = useMemo(() => buildSystemNotifications({ customers, suppliers, products, invoices, stock, settings, getProductStock }).length,
    [customers, suppliers, products, invoices, stock, settings.activeWarehouseId, settings.currencySymbol, settings.dismissedNotificationIds]);
  const title = TAB_TITLES[activeTab] || 'كاش توب 3';
  const runQuick = (tab, eventName = '') => {
    if (eventName && typeof window !== 'undefined') window.__cashTopPendingQuickAction = eventName;
    setActiveTab(tab);
    if (eventName && typeof window !== 'undefined') {
      setTimeout(() => {
        if (window.__cashTopPendingQuickAction === eventName) window.dispatchEvent(new CustomEvent(eventName));
      }, 40);
    }
  };

  const logout = () => {
    if (confirm('تسجيل الخروج من الشركة؟ لن يتم حذف البيانات المحلية.')) {
      window.OscarActivation?.clearRuntime?.();
      location.reload();
    }
  };

  return h('header',{id:'main-header',className:'oscar-app-header sticky top-0 z-40 h-14 px-2.5 sm:px-4 flex items-center justify-between gap-2 select-none'},
    h('div',{className:'flex items-center gap-2 min-w-0'},
      h('button',{type:'button',onClick:()=>setMobileSidebarOpen(!mobileSidebarOpen),className:'oscar-header-icon ct-mobile-menu-button lg:hidden',title:'القائمة'},h(Menu,{className:'w-5 h-5'})),
      h('div',{className:'ct-page-heading'},h(({dashboard:LayoutDashboard,pos:ShoppingCart,sales:Receipt,purchases:Truck,products:Package,categories:Boxes,inventory:Warehouse,customers:Users,suppliers:Users,accounts:Wallet,expenses:Receipt,vouchers:FileSpreadsheet,employees:UserCheck,barcodes:Barcode,reports:BarChart3,financial_years:CalendarRange,message_templates:MessageSquareText,trash:Trash2,settings:Settings,restaurant_tables:UtensilsCrossed,restaurant_waiter:UtensilsCrossed,restaurant_kitchen:ChefHat,restaurant_waste:Scale})[activeTab]||LayoutDashboard,{size:21}),h('h1',{className:'oscar-header-title truncate'},title))
    ),
    h(DesktopNavigation),
    activeTab==='pos'&&h('div',{className:'ct-header-warehouse'},h(SearchableDropdown,{id:'header-warehouse',label:'المخزن',options:(app.warehouses||[]).map(w=>({id:w.id,label:w.name})),selectedId:settings.activeWarehouseId,onSelect:id=>app.updateSettings({activeWarehouseId:id})})),
    h('div',{className:'oscar-header-quick-actions'},
      h('button',{type:'button',className:'oscar-header-quick-btn',onClick:()=>runQuick('customers','cash-top:quick-add-customer')},h(UserPlus,{className:'w-3.5 h-3.5'}),h('span',null,'+ عميل')),
      h('button',{type:'button',className:'oscar-header-quick-btn',onClick:()=>runQuick('expenses','cash-top:quick-add-expense')},h(Receipt,{className:'w-3.5 h-3.5'}),h('span',null,'+ مصروف')),
      h('button',{type:'button',className:'oscar-header-quick-btn',onClick:()=>runQuick('products','cash-top:quick-add-product')},h(PackagePlus,{className:'w-3.5 h-3.5'}),h('span',null,'+ صنف')),
      h('button',{type:'button',className:'oscar-header-quick-btn',onClick:()=>runQuick('reports')},h(BarChart3,{className:'w-3.5 h-3.5'}),h('span',null,'التقارير'))
    ),
    h('div',{className:'flex items-center gap-1.5 shrink-0'},
      h('button',{type:'button',onClick:()=>setActiveTab('pos'),className:`oscar-header-icon ${activeTab==='pos'?'is-active':''}`,title:'فتح الكاشير'},h(ShoppingCart,{className:'w-5 h-5'})),
      h('button',{id:'btn-header-sync',type:'button',onClick:()=>setShowSyncModal(true),className:`oscar-header-icon relative ${!isOnline?'is-offline':''}`,title:isOnline?'المزامنة':'غير متصل'},
        h(CloudCog,{className:`w-5 h-5 ${isSyncing?'animate-pulse':''}`}),
        syncQueue.length>0?h('span',{className:'oscar-header-badge'},syncQueue.length>99?'99+':String(syncQueue.length)):null
      ),
      h('button',{type:'button',onClick:()=>setShowNotifications(true),className:'oscar-header-icon relative',title:'الإشعارات'},
        h(Bell,{className:'w-5 h-5'}),
        notificationCount>0?h('span',{className:'oscar-header-badge'},notificationCount>99?'99+':String(notificationCount)):null
      ),
      h('button',{type:'button',onClick:logout,className:'oscar-header-icon',title:'تسجيل الخروج'},h(LogOut,{className:'w-5 h-5'}))
    ),
    h(NotificationsModal,{open:showNotifications,onClose:()=>setShowNotifications(false)})
  );
};
