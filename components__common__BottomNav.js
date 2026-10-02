import React, { useState } from 'react';
import { useApp } from './context__AppContext.js?v=7.9.4.89-cashtop3-purple-category-save';
import { canAccessTab, canAccessPermission } from './utils__permissions.js?v=7.9.4.89-cashtop3-purple-category-save';
import {
  ShoppingCart, ReceiptText, Package, Warehouse, Menu, X, LayoutDashboard, Truck,
  Boxes, Users, Building2, Wallet, Receipt, Barcode, BarChart3, Trash2, Settings,
  LayoutGrid, UtensilsCrossed, ChefHat, Scale, Sparkles
} from 'lucide-react';

const h = React.createElement;

export const BottomNav = () => {
  const { activeTab, setActiveTab, cart, settings, currentUser, activeEmployee } = useApp();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const accessArgs = {
    runtime: window.OscarActivation?.readRuntime?.() || null,
    currentUser,
    activeEmployee,
    restaurantEnabled: !!settings.isRestaurantModeEnabled,
  };

  const mainTabs = [
    { id:'dashboard', label:'لوحة التحكم', icon:LayoutDashboard },
    { id:'pos', label:'الكاشير', icon:ShoppingCart, badge:cart.length || undefined },
    { id:'sales', label:'المبيعات', icon:ReceiptText },
    { id:'products', label:'الأصناف', icon:Package },
  ].filter(tab => canAccessTab(tab.id, accessArgs));

  const restaurantTabs = settings.isRestaurantModeEnabled ? [
    { id:'restaurant_tables', label:'الطاولات', icon:LayoutGrid },
    { id:'restaurant_waiter', label:'الجرسون', icon:UtensilsCrossed },
    { id:'restaurant_kitchen', label:'المطبخ', icon:ChefHat },
    { id:'restaurant_waste', label:'الوصفات والهالك', icon:Scale },
  ].filter(item => canAccessTab(item.id, accessArgs)) : [];

  const moreTabs = [
    ...(canAccessPermission('canAccessAI', accessArgs) ? [{ id:'oscar_ai', label:'كاش توب AI', icon:Sparkles }] : []),
    ...restaurantTabs,
    { id:'inventory', label:'المخزون', icon:Warehouse },
    { id:'purchases', label:'المشتريات', icon:Truck },
    { id:'vouchers', label:'سندات القبض والصرف', icon:ReceiptText },
    { id:'employees', label:'الموظفون والصلاحيات', icon:Users },
    { id:'categories', label:'التصنيفات', icon:Boxes },
    { id:'customers', label:'العملاء والديون', icon:Users },
    { id:'suppliers', label:'الموردون', icon:Building2 },
    { id:'accounts', label:'الصندوق والورديات', icon:Wallet },
    { id:'expenses', label:'المصروفات', icon:Receipt },
    { id:'barcodes', label:'طباعة الباركود', icon:Barcode },
    { id:'reports', label:'التقارير والأرباح', icon:BarChart3 },
    { id:'trash', label:'سلة المحذوفات', icon:Trash2 },
    { id:'settings', label:'الإعدادات', icon:Settings },
  ].filter(item => item.id === 'oscar_ai' || canAccessTab(item.id, accessArgs));

  return h(React.Fragment, null,
    showMoreMenu && h('div', { id:'mobile-more-backdrop', onClick:()=>setShowMoreMenu(false), className:'lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end' },
      h('div', { id:'mobile-more-sheet', onClick:e=>e.stopPropagation(), className:'bg-white rounded-t-2xl p-4 max-h-[75vh] overflow-y-auto border-t border-slate-200 text-right space-y-1 shadow-2xl' },
        h('div', { className:'flex items-center justify-between pb-3 mb-2 border-b border-slate-100' },
          h('h3', { className:'font-black text-sm text-slate-900' }, 'باقي أقسام النظام'),
          h('button', { onClick:()=>setShowMoreMenu(false), className:'p-1 rounded-md text-slate-400 hover:text-slate-600' }, h(X, { className:'w-5 h-5' }))
        ),
        h('div', { className:'grid grid-cols-2 gap-2' },
          moreTabs.map(item => h('button', {
            key:item.id,
            onClick:()=>{if(item.id==='oscar_ai'){window.dispatchEvent(new Event('oscar-ai-open'));setShowMoreMenu(false);return;}setActiveTab(item.id);setShowMoreMenu(false);},
            className:`flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold transition ${activeTab===item.id?'bg-emerald-600 text-white font-bold':'bg-slate-50 text-slate-700 hover:bg-slate-100'}`
          }, h(item.icon, { className:`w-4 h-4 ${item.id.startsWith('restaurant_') && activeTab!==item.id ? 'text-amber-500' : ''}` }), h('span', null, item.label)))
        )
      )
    ),
    h('nav', { id:'mobile-bottom-nav', className:'lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white border-t border-slate-200 flex items-center justify-around px-2 shadow-lg select-none' },
      ...mainTabs.map(tab => {
        const active = activeTab===tab.id;
        return h('button', { key:tab.id, onClick:()=>setActiveTab(tab.id), className:`relative flex flex-col items-center justify-center flex-1 py-1 ${active?'text-emerald-600 font-bold':'text-slate-500'}` },
          h('div', { className:'relative' },
            h(tab.icon, { className:'w-5 h-5' }),
            tab.badge !== undefined ? h('span', { className:'absolute -top-1.5 -right-2 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white' }, tab.badge) : null
          ),
          h('span', { className:'text-[11px] mt-0.5' }, tab.label)
        );
      }),
      h('button', { onClick:()=>setShowMoreMenu(true), className:`flex flex-col items-center justify-center flex-1 py-1 ${showMoreMenu?'text-emerald-600 font-bold':'text-slate-500'}` }, h(Menu, { className:'w-5 h-5' }), h('span', { className:'text-[11px] mt-0.5' }, 'المزيد'))
    )
  );
};
