import {useLanguage,toSourceText} from './services__i18n.js?v=7.9.4.139-ledger-print';
import {t} from './services__i18n.js?v=7.9.4.139-ledger-print';
import {useAppNavigation,usePullRefresh} from './hooks__appNavigation.js?v=7.9.4.139-ledger-print';
import {StartupScreen} from './components__common__StartupScreen.js?v=7.9.4.139-ledger-print';
import React, { useEffect, useRef } from 'react';
import { AppProvider, useApp } from './context__AppContext.js?v=7.9.4.139-ledger-print';
import { Header } from './components__common__Header.js?v=7.9.4.139-ledger-print';
import { Sidebar } from './components__common__Sidebar.js?v=7.9.4.139-ledger-print';
import { BottomNav } from './components__common__BottomNav.js?v=7.9.4.139-ledger-print';
import { Toast } from './components__common__Toast.js?v=7.9.4.139-ledger-print';
import { SyncModal } from './components__sync__SyncModal.js?v=7.9.4.139-ledger-print';
import { POSView } from './components__pos__POSView.js?v=7.9.4.139-ledger-print';
import { DashboardView } from './components__dashboard__DashboardView.js?v=7.9.4.139-ledger-print';
import { SalesView } from './components__sales__SalesView.js?v=7.9.4.139-ledger-print';
import { PurchasesView } from './components__purchases__PurchasesView.js?v=7.9.4.139-ledger-print';
import { ProductsView } from './components__products__ProductsView.js?v=7.9.4.139-ledger-print';
import { CategoriesView } from './components__categories__CategoriesView.js?v=7.9.4.139-ledger-print';
import { InventoryView } from './components__inventory__InventoryView.js?v=7.9.4.139-ledger-print';
import { CustomersView } from './components__customers__CustomersView.js?v=7.9.4.139-ledger-print';
import { SuppliersView } from './components__suppliers__SuppliersView.js?v=7.9.4.139-ledger-print';
import { AccountsView } from './components__accounts__AccountsView.js?v=7.9.4.139-ledger-print';
import { ExpensesView } from './components__expenses__ExpensesView.js?v=7.9.4.139-ledger-print';
import { VouchersView } from './components__vouchers__VouchersView.js?v=7.9.4.139-ledger-print';
import { EmployeesView } from './components__employees__EmployeesView.js?v=7.9.4.139-ledger-print';
import { BarcodesView } from './components__barcodes__BarcodesView.js?v=7.9.4.139-ledger-print';
import { ReportsView } from './components__reports__ReportsView.js?v=7.9.4.139-ledger-print';
import { TrashView } from './components__trash__TrashView.js?v=7.9.4.139-ledger-print';
import { SettingsView } from './components__settings__SettingsView.js?v=7.9.4.139-ledger-print';
import { FinancialYearsView } from './components__financial__FinancialYearsView.js?v=7.9.4.139-ledger-print';
import { ThermalReceiptModal } from './components__pos__ThermalReceiptModal.js?v=7.9.4.139-ledger-print';
import { LoginGate } from './components__auth__LoginGate.js?v=7.9.4.139-ledger-print';
import { RestaurantProvider } from './restaurant__context__RestaurantContext.js?v=7.9.4.139-ledger-print';
import { RestaurantTablesView } from './restaurant__components__RestaurantTablesView.js?v=7.9.4.139-ledger-print';
import { RestaurantWaiterView } from './restaurant__components__RestaurantWaiterView.js?v=7.9.4.139-ledger-print';
import { RestaurantKDSView } from './restaurant__components__RestaurantKDSView.js?v=7.9.4.139-ledger-print';
import { RestaurantWasteView } from './restaurant__components__RestaurantWasteView.js?v=7.9.4.139-ledger-print';
import { RestaurantSettingsPanel } from './restaurant__components__RestaurantSettingsPanel.js?v=7.9.4.139-ledger-print';
import { MessageTemplatesView } from './components__messages__MessageTemplatesView.js?v=7.9.4.139-ledger-print';
import { isTrialAccount } from './trial__config.js?v=7.9.4.139-ledger-print';
import { canAccessTab, firstAllowedTab } from './utils__permissions.js?v=7.9.4.139-ledger-print';
import { startTelegramAutomation } from './services__telegram.js?v=7.9.4.139-ledger-print';
import { ensureProductImageAutoSync, syncPendingProductImages } from './services__productImages.js?v=7.9.4.139-ledger-print';
import { startDailyBackupAutomation } from './services__telegramReports.js?v=7.9.4.139-ledger-print';

const h = React.createElement;
const ScrollScreen = ({ children }) => h('div', { className:'scroll-chain-page h-full min-h-0 overflow-y-auto custom-scrollbar mobile-safe-bottom lg:pb-0' }, children);

const RESTAURANT_TAB_PERMISSIONS = {
  restaurant_tables: 'canAccessRestaurantTables',
  restaurant_waiter: 'canAccessRestaurantWaiter',
  restaurant_kitchen: 'canAccessRestaurantKitchen',
  restaurant_waste: 'canAccessRestaurantWaste',
};

const MainLayout = () => {
  const app = useApp();
  useAppNavigation(app.activeTab,app.setActiveTab);const refreshRef=React.useRef(null);
  const { activeTab, setActiveTab, isLoaded, isCloudReady, settings, saveSettings, currentUser, activeEmployee, cart } = app;
  const [startupWait,setStartupWait]=React.useState(true);
  const pull=usePullRefresh(refreshRef,async()=>{try{await app.refreshCurrentPage?.(app.activeTab);window.dispatchEvent(new CustomEvent('ct-page-refreshed',{detail:{tab:app.activeTab}}))}catch(e){app.showToast(e.message||'تعذر التحديث','error')}},isLoaded&&(!startupWait||isCloudReady||navigator.onLine===false));
  useEffect(()=>{const timer=setTimeout(()=>setStartupWait(false),8000);return()=>clearTimeout(timer)},[]);
  const backupAppRef = useRef(app);
  backupAppRef.current = app;
  useEffect(() => {
    if (!isLoaded) return;
    // Keep first interaction free. Network/image/backup housekeeping begins after
    // the UI has painted and the browser has an idle slice; cloud sync itself is
    // still initialized by AppContext immediately.
    ensureProductImageAutoSync();
    const stopTelegram = startTelegramAutomation();
    let stopBackup = null;
    let idleId = 0;
    let timerId = 0;
    const startBackground = () => {
      if (stopBackup) return;
      stopBackup = startDailyBackupAutomation(() => backupAppRef.current);
    };
    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(startBackground, { timeout: 1800 });
    } else {
      timerId = window.setTimeout(startBackground, 900);
    }
    return () => {
      try{stopTelegram?.();}catch(_){}
      try{stopBackup?.();}catch(_){}
      if(idleId && 'cancelIdleCallback' in window) try{window.cancelIdleCallback(idleId);}catch(_){}
      if(timerId) window.clearTimeout(timerId);
    };
  }, [isLoaded]);

  useEffect(() => {
    // Tiny global timestamp only; it lets background sync refreshes yield while
    // the user is actively touching/clicking the UI.
    const markInteraction = () => { window.__OSCAR_LAST_INTERACTION_AT__ = performance.now(); };
    document.addEventListener('pointerdown', markInteraction, { capture:true, passive:true });
    document.addEventListener('keydown', markInteraction, { capture:true, passive:true });
    return () => {
      document.removeEventListener('pointerdown', markInteraction, true);
      document.removeEventListener('keydown', markInteraction, true);
    };
  }, []);

  useEffect(() => {
    const isVisible = (el) => {
      if (!el || el.disabled) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
    };
    const clickFirstVisible = (selectors) => {
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        const button = nodes.find(isVisible);
        if (button) { button.click(); return true; }
      }
      return false;
    };
    const onEnterExecute = (e) => {
      if(e.defaultPrevented||e.repeat||e.isComposing||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey)return;
      if(e.key!=='Enter'&&e.key!=='Escape')return;
      const target=e.target;
      const overlays=Array.from(document.querySelectorAll('[role="dialog"],.ct-modal-layer,body>.fixed')).filter(isVisible).sort((a,b)=>Number(getComputedStyle(a).zIndex||0)-Number(getComputedStyle(b).zIndex||0));
      const scope=overlays.at(-1)||document.querySelector('.oscar-page-stage')||document;
      if(e.key==='Escape'){
        if(document.querySelector('.searchable-dropdown-panel,.ct-nav-menu,.ct-product-actions-menu,.cash-action-menu'))return;
        const buttons=Array.from(scope.querySelectorAll('button')).filter(isVisible);
        const cancel=buttons.find(b=>/^(إلغاء|الغاء|إغلاق|اغلاق|رجوع)$/.test(toSourceText((b.textContent||'').trim()))||/^(إغلاق|إلغاء)$/.test(toSourceText(b.getAttribute('aria-label')||'')))||buttons.find(b=>b.querySelector('svg.lucide-x'));
        if(cancel){e.preventDefault();cancel.click()}return;
      }
      if(target?.id==='pos-barcode-input'||target?.tagName==='TEXTAREA'||target?.closest?.('.searchable-dropdown-panel'))return;
      if(target?.closest?.('button'))return;
      const form=target?.closest?.('form')||(overlays.length?(scope.matches?.('form')?scope:scope.querySelector('form')):null);
      const submit=form&&Array.from(form.querySelectorAll('button[type="submit"],input[type="submit"]')).find(isVisible);
      if(submit){e.preventDefault();form.requestSubmit?form.requestSubmit(submit):submit.click();return}
      const candidates=Array.from(scope.querySelectorAll('button')).filter(isVisible);
      const save=candidates.find(b=>b.matches('[data-enter-primary="true"]'))||candidates.find(b=>/^(حفظ|تأكيد|تطبيق|بيع وحفظ|حفظ المرتجع)/.test(toSourceText((b.textContent||'').trim())));
      if(save){e.preventDefault();save.click()}
    };
    window.addEventListener('keydown', onEnterExecute);
    return () => window.removeEventListener('keydown', onEnterExecute);
  }, [activeTab, cart?.length]);

  useEffect(() => {
    const root = document.documentElement;
    const setStableHeight = (force=false) => {
      const el = document.activeElement;
      const isTyping = !!el && ['INPUT','TEXTAREA','SELECT'].includes(el.tagName);
      if (!force && isTyping && window.innerWidth < 1024) return;
      root.style.setProperty('--oscar-app-height', `${window.innerHeight}px`);
    };
    setStableHeight(true);
    const onResize = () => setStableHeight(false);
    const onOrientation = () => setTimeout(() => setStableHeight(true), 250);
    window.addEventListener('resize', onResize, { passive:true });
    window.addEventListener('orientationchange', onOrientation, { passive:true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientation);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const runtimeCompanyName = String(window.OscarActivation?.readRuntime?.()?.companyName || '').trim();
    const configuredStoreName = String(settings.storeName || '').trim();
    const legacyShellNames = new Set(['كاش توب 3','أوسكار المحاسبي','الميزان ماركت','AlMezan Market POS']);
    document.title = (runtimeCompanyName && (!configuredStoreName || legacyShellNames.has(configuredStoreName)))
      ? runtimeCompanyName
      : (configuredStoreName || runtimeCompanyName || 'كاش توب 3');
    document.documentElement.classList.remove('dark');
    if (settings.theme !== 'light') {
      saveSettings({ ...settings, theme:'light' });
      return;
    }
    const runtimeCompany = window.OscarActivation?.readRuntime?.();
    const brandMigrationKey = `oscar-accounting-brand-v9::${runtimeCompany?.companyId || 'local'}`;
    let migrated = false;
    try { migrated = localStorage.getItem(brandMigrationKey) === '1'; } catch {}
    if (!migrated) {
      try { localStorage.setItem(brandMigrationKey, '1'); } catch {}
      const companyName = String(runtimeCompany?.companyName || '').trim();
      const oldDefaultNames = new Set(['كاش توب 3','أوسكار المحاسبي','الميزان ماركت','AlMezan Market POS']);
      if (companyName && oldDefaultNames.has(settings.storeName)) {
        saveSettings({ ...settings, storeName:companyName, theme:'light' });
      }
    }
  }, [isLoaded, isCloudReady, settings, saveSettings]);

  const accessArgs = {
    runtime: window.OscarActivation?.readRuntime?.() || null,
    currentUser,
    activeEmployee,
    restaurantEnabled: !!settings.isRestaurantModeEnabled,
  };
  const canOpenRestaurantTab = tab => canAccessTab(tab, accessArgs);

  useEffect(() => {
    if (!isLoaded) return;
    if (activeTab !== 'no_access' && !canAccessTab(activeTab, accessArgs)) {
      setActiveTab(firstAllowedTab(accessArgs) || 'no_access');
    }
  }, [activeTab, settings.isRestaurantModeEnabled, currentUser, activeEmployee, isLoaded]);

  const screen = (() => {
    if (activeTab === 'no_access' || !canAccessTab(activeTab, accessArgs)) {
      return h('div', { className:'h-full flex items-center justify-center p-6 bg-slate-100' },
        h('div', { className:'max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm' },
          h('div', { className:'text-lg font-black text-slate-900' }, 'لا توجد صفحة مسموحة لهذا الحساب'),
          h('div', { className:'text-xs text-slate-500 mt-2 leading-6' }, 'يجب على المدير تحديد صفحة واحدة على الأقل من صلاحيات الموظف ثم حفظها. بعد المزامنة سيُفتح الحساب على أول صفحة مسموحة تلقائياً.')
        )
      );
    }
    if (activeTab === 'pos') return h(POSView);
    if (activeTab === 'dashboard') return h(ScrollScreen, null, h(DashboardView));
    if (activeTab === 'sales') return h(ScrollScreen, null, h(SalesView));
    if (activeTab === 'purchases') return h(ScrollScreen, null, h(PurchasesView));
    if (activeTab === 'products') return h(ScrollScreen, null, h(ProductsView));
    if (activeTab === 'categories') return h(ScrollScreen, null, h(CategoriesView));
    if (activeTab === 'inventory') return h(ScrollScreen, null, h(InventoryView));
    if (activeTab === 'customers') return h(ScrollScreen, null, h(CustomersView));
    if (activeTab === 'suppliers') return h(ScrollScreen, null, h(SuppliersView));
    if (activeTab === 'accounts') return h(ScrollScreen, null, h(AccountsView));
    if (activeTab === 'expenses') return h(ScrollScreen, null, h(ExpensesView));
    if (activeTab === 'vouchers') return h(ScrollScreen, null, h(VouchersView));
    if (activeTab === 'employees') return h(ScrollScreen, null, h(EmployeesView));
    if (activeTab === 'barcodes') return h(ScrollScreen, null, h(BarcodesView));
    if (activeTab === 'reports') return h(ScrollScreen, null, h(ReportsView));
    if (activeTab === 'trash') return h(ScrollScreen, null, h(TrashView));
    if (activeTab === 'financial_years') return h(ScrollScreen, null, h(FinancialYearsView));
    if (activeTab === 'message_templates') return h(ScrollScreen, null, h(MessageTemplatesView));
    if (activeTab === 'settings') return h(ScrollScreen, null, h(React.Fragment, null, h(SettingsView), h('div', { className:'px-4 sm:px-6 pb-6 max-w-4xl mx-auto' }, h(RestaurantSettingsPanel))));
    if (activeTab === 'restaurant_tables' && canOpenRestaurantTab(activeTab)) return h(ScrollScreen, null, h(RestaurantTablesView));
    if (activeTab === 'restaurant_waiter' && canOpenRestaurantTab(activeTab)) return h(RestaurantWaiterView);
    if (activeTab === 'restaurant_kitchen' && canOpenRestaurantTab(activeTab)) return h(RestaurantKDSView);
    if (activeTab === 'restaurant_waste' && canOpenRestaurantTab(activeTab)) return h(ScrollScreen, null, h(RestaurantWasteView));
    return h(POSView);
  })();

  if(!isLoaded||(startupWait&&!isCloudReady&&navigator.onLine!==false))return h(StartupScreen,{progress:app.startupProgress,offline:!app.isOnline});
  return h('div', {
    className:'flex w-screen bg-slate-100 text-slate-900 overflow-hidden',
    style:{ height:'var(--oscar-app-height, 100dvh)', minHeight:'var(--oscar-app-height, 100dvh)' }
  },
    h(Sidebar),
    h('div', { className:'flex-1 flex flex-col min-w-0 h-full min-h-0 overflow-hidden' },
      h(Header),
      h('main', { ref:refreshRef,className:'flex-1 min-h-0 overflow-hidden relative pb-16 lg:pb-0' },
        h('div',{className:'ct-pull-indicator'+(pull.refreshing?' is-refreshing':''),style:{opacity:pull.distance?1:0,transform:`translate(-50%,${Math.max(0,pull.distance-45)}px)`},role:'status','aria-label':t("تحديث البيانات")},h('svg',{viewBox:'0 0 24 24',width:22,height:22,fill:'none',stroke:'currentColor',strokeWidth:2},h('path',{d:'M20 7v5h-5M4 17v-5h5M5.6 7a7 7 0 0 1 12-2L20 8M4 16l2.4 3a7 7 0 0 0 12-2'}))),
        h('div', { key:activeTab,style:{transform:`translateY(${pull.distance}px)`,transition:pull.distance?'none':'transform .22s ease'},className:'oscar-page-stage h-full min-h-0 w-full overflow-hidden' }, screen)
      ),
      h(BottomNav)
    ),
    h(ThermalReceiptModal),
    h(SyncModal),
    h(Toast)
  );
};

export default function App() {
  useLanguage();
  return h(LoginGate, null, h(AppProvider, null, h(RestaurantProvider, null, h(MainLayout))));
}
