import {t} from './services__i18n.js?v=7.9.4.139-ledger-print';
import React, { useState } from 'react';
import { useApp } from './context__AppContext.js?v=7.9.4.139-ledger-print';
import { canAccessTab } from './utils__permissions.js?v=7.9.4.139-ledger-print';
import {
  Home, ReceiptText, ScanLine, Package, Menu, X, Warehouse, Truck, Boxes, Users,
  Building2, Wallet, Receipt, Barcode, BarChart3, Trash2, Settings, UserCheck,
  LayoutGrid, UtensilsCrossed, ChefHat, Scale, FileSpreadsheet
} from 'lucide-react';
const h = React.createElement;

export const BottomNav = () => {
  const { activeTab, setActiveTab, cart, settings, currentUser, activeEmployee } = useApp();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const accessArgs={runtime:window.OscarActivation?.readRuntime?.()||null,currentUser,activeEmployee,restaurantEnabled:!!settings.isRestaurantModeEnabled};
  const allowed=id=>canAccessTab(id,accessArgs);
  const normal=[
    {id:'dashboard',label:t("الرئيسية"),icon:Home},
    {id:'sales',label:t("الفواتير"),icon:ReceiptText},
    {id:'products',label:t("الأصناف"),icon:Package},
  ].filter(x=>allowed(x.id));
  const more=[
    ...(settings.isRestaurantModeEnabled?[{id:'restaurant_tables',label:t("الطاولات"),icon:LayoutGrid},{id:'restaurant_waiter',label:t("الجرسون"),icon:UtensilsCrossed},{id:'restaurant_kitchen',label:t("المطبخ"),icon:ChefHat},{id:'restaurant_waste',label:t("الوصفات والهالك"),icon:Scale}]:[]),
    {id:'customers',label:t("العملاء"),icon:Users},{id:'suppliers',label:t("الموردون"),icon:Building2},{id:'inventory',label:t("المخزون"),icon:Warehouse},
    {id:'purchases',label:t("المشتريات"),icon:Truck},{id:'categories',label:t("التصنيفات"),icon:Boxes},{id:'vouchers',label:t("السندات"),icon:FileSpreadsheet},
    {id:'accounts',label:t("الصندوق"),icon:Wallet},{id:'expenses',label:t("المصروفات"),icon:Receipt},{id:'employees',label:t("الموظفون"),icon:UserCheck},
    {id:'barcodes',label:t("الباركود"),icon:Barcode},{id:'reports',label:t("التقارير"),icon:BarChart3},{id:'trash',label:'المحذوفات',icon:Trash2},{id:'settings',label:t("الإعدادات"),icon:Settings}
  ].filter(x=>allowed(x.id));

  const item=(tab)=>{const active=activeTab===tab.id;return h('button',{key:tab.id,type:'button',onClick:()=>setActiveTab(tab.id),className:`cash-bottom-item ${active?'active':''}`},h(tab.icon,{className:'w-5 h-5'}),h('span',null,tab.label));};
  return h(React.Fragment,null,
    showMoreMenu?h('div',{className:'cash-more-backdrop lg:hidden',onClick:()=>setShowMoreMenu(false)},
      h('div',{className:'cash-more-sheet',onClick:e=>e.stopPropagation()},
        h('div',{className:'cash-more-head'},h('strong',null,t("أقسام النظام")),h('button',{type:'button',onClick:()=>setShowMoreMenu(false)},h(X,{className:'w-5 h-5'}))),
        h('div',{className:'cash-more-grid'},...more.map(tab=>h('button',{key:tab.id,type:'button',onClick:()=>{setActiveTab(tab.id);setShowMoreMenu(false);},className:`cash-more-item ${activeTab===tab.id?'active':''}`},h(tab.icon,{className:'w-5 h-5'}),h('span',null,tab.label))))
      )
    ):null,
    h('nav',{id:'mobile-bottom-nav',className:'cash-bottom-nav lg:hidden'},
      item(normal.find(x=>x.id==='dashboard')||{id:'dashboard',label:t("الرئيسية"),icon:Home}),
      item(normal.find(x=>x.id==='sales')||{id:'sales',label:t("الفواتير"),icon:ReceiptText}),
      h('button',{type:'button',onClick:()=>setActiveTab('pos'),className:`cash-bottom-center ${activeTab==='pos'?'active':''}`,title:t("الكاشير")},
        h('span',{className:'cash-bottom-center-icon'},h(ScanLine,{className:'w-6 h-6'}),cart.length?h('b',null,cart.length>99?'99+':cart.length):null),
        h('span',null,t("الكاشير"))
      ),
      item(normal.find(x=>x.id==='products')||{id:'products',label:t("الأصناف"),icon:Package}),
      h('button',{type:'button',onClick:()=>window.dispatchEvent(new Event('ct-open-drawer')),className:`cash-bottom-item ${showMoreMenu?'active':''}`},h(Menu,{className:'w-5 h-5'}),h('span',null,t("المزيد")))
    )
  );
};
