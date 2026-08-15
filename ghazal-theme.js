(function(){
  'use strict';

  const PAGER_MIN_ROWS = 0;
  const pagerStates = new WeakMap();
  let pagerRefreshTimer = 0;

  function fileName(){
    try{
      const value = decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
      return value || 'index.html';
    }catch(_){ return (location.pathname.split('/').pop() || 'index.html'); }
  }

  function pageSlug(){
    const name = fileName().replace(/\.html?$/i,'').toLowerCase();
    const map = {
      'customers':'customers','products':'products','cashier':'cashier','invoices':'invoices',
      'suppliers':'suppliers','accounts':'accounts','journal':'journal','setting':'settings',
      'التقارير':'reports','المشتريات':'purchases','المصاريف':'expenses','لوحة التحكم':'dashboard'
    };
    return map[name] || name.replace(/[^a-z0-9\u0600-\u06ff_-]+/g,'-');
  }

  function tagPage(){
    const slug = pageSlug();
    document.documentElement.classList.add('ghazal-theme-ready', 'gh-page-' + slug);
    if (slug === 'cashier') document.documentElement.classList.add('gh-page-cashier');
  }

  function tagVisuals(root){
    root = root || document;
    root.querySelectorAll?.('table').forEach(function(table){
      if(!table.closest('.export-template-container,.ct-export-render-host')) table.classList.add('ghazal-table');
    });
    root.querySelectorAll?.('input,select,textarea').forEach(function(el){
      if(!el.closest('.export-template-container,.ct-export-render-host')) el.classList.add('ghazal-control');
    });
    bindLogoFallback(root);
  }

  function isMobile(){ return !!(window.matchMedia && window.matchMedia('(max-width:768px)').matches); }

  function closeMobileSidebar(){
    if(!isMobile()) return;
    const sidebar = document.getElementById('ctSidebar');
    const overlay = document.getElementById('ctSidebarOverlay');
    if(sidebar) sidebar.classList.remove('open');
    if(overlay) overlay.classList.remove('open');
    document.documentElement.classList.remove('ct-ui-locked');
    document.body?.classList.remove('ct-ui-locked');
  }

  function bindSidebarSafety(){
    // Start every phone page closed even if WebView restored a stale DOM state.
    if(isMobile()) closeMobileSidebar();

    const outsideHandler = function(e){
      if(!isMobile()) return;
      const sidebar = document.getElementById('ctSidebar');
      if(!sidebar || !sidebar.classList.contains('open')) return;
      const target = e.target;
      if(target?.closest?.('[data-ct-action="open-sidebar"]')) return;
      if(target?.closest?.('#ctSidebar')) return;
      closeMobileSidebar();
    };

    document.addEventListener('pointerdown', outsideHandler, true);
    document.addEventListener('touchstart', outsideHandler, {capture:true, passive:true});
    document.addEventListener('click', function(e){
      if(!isMobile()) return;
      if(e.target?.closest?.('#ctSidebarOverlay,[data-ct-action="close-sidebar"]')){
        closeMobileSidebar(); return;
      }
      const link = e.target?.closest?.('#ctSidebar a[href]');
      if(link) setTimeout(closeMobileSidebar, 0);
    }, true);
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeMobileSidebar(); });
    window.addEventListener('orientationchange', function(){ setTimeout(closeMobileSidebar, 80); }, {passive:true});
    window.addEventListener('pageshow', function(){ if(isMobile()) closeMobileSidebar(); }, {passive:true});
  }

  function bindLogoFallback(root){
    const scope = root || document;
    scope.querySelectorAll?.('.ct-sidebar-brand img,.ct-topbar-logo').forEach(function(img){
      if(img.dataset.ghazalLogoBound === '1') return;
      img.dataset.ghazalLogoBound = '1';
      img.addEventListener('error', function(){
        if(this.dataset.ghazalFallbackApplied === '1') return;
        this.dataset.ghazalFallbackApplied = '1';
        const custom = String(window.Cashtop?.getSystemSettings?.()?.logo || window.Cashtop?.cachedBrandLogo?.() || '').trim();
        if(custom){ this.style.visibility='hidden'; return; }
        this.src = 'cashtop-logo.png';
        this.style.visibility='visible';
      });
    });
  }

  function applyChartDefaults(){
    try{
      if(!window.Chart || !window.Chart.defaults) return false;
      window.Chart.defaults.font = window.Chart.defaults.font || {};
      window.Chart.defaults.font.family = 'Cairo, Tahoma, Arial, sans-serif';
      window.Chart.defaults.color = '#64748b';
      window.Chart.defaults.borderColor = 'rgba(148,163,184,.25)';
      if(window.Chart.defaults.plugins?.legend?.labels){
        window.Chart.defaults.plugins.legend.labels.color = '#475569';
        window.Chart.defaults.plugins.legend.labels.font = Object.assign({}, window.Chart.defaults.plugins.legend.labels.font || {}, {family:'Cairo, Tahoma, Arial, sans-serif'});
      }
      return true;
    }catch(_){ return false; }
  }

  function pagerPageSize(){ return 50; }

  function shouldPaginate(table){
    if(!table || !table.tBodies?.length) return false;
    if(table.matches('.export-table,.ct-export-table,.variants-table,[data-no-pagination],[data-ct-record-paged="1"]')) return false;
    if(table.closest('.modal-overlay,.ct-export-render-host,.export-template-container,#printableArea,#printableTableArea')) return false;
    if(document.documentElement.classList.contains('gh-page-cashier') && table.closest('.basket-section,.desktop-fixed-footer')) return false;
    return true;
  }

  function rowIsFilterVisible(row){
    if(row.hidden) return false;
    if(String(row.getAttribute('aria-hidden') || '').toLowerCase() === 'true') return false;
    if(String(row.style.display || '').toLowerCase() === 'none') return false;
    // Common filter classes used by legacy pages.
    if(row.classList.contains('filtered-out') || row.classList.contains('is-filtered-out')) return false;
    return true;
  }

  function pagerMountPoint(table){
    return table.closest('.table-responsive-box,.table-responsive,.table-wrapper,.table-wrap') || table;
  }

  function ensurePager(table){
    let state = pagerStates.get(table);
    if(state && state.pager?.isConnected) return state;
    const pager = document.createElement('div');
    pager.className = 'ghazal-pager';
    pager.innerHTML = '<button type="button" data-gh-page="prev" aria-label="الصفحة السابقة">السابق</button><span class="ghazal-page-info">صفحة 1</span><button type="button" data-gh-page="next" aria-label="الصفحة التالية">التالي</button>';
    const mount = pagerMountPoint(table);
    mount.insertAdjacentElement('afterend', pager);
    state = { page:1, pageSize:pagerPageSize(), pager, updating:false };
    pagerStates.set(table, state);
    pager.addEventListener('click', function(e){
      const btn = e.target.closest('button[data-gh-page]');
      if(!btn) return;
      const action = btn.dataset.ghPage;
      if(action === 'prev') state.page -= 1;
      if(action === 'next') state.page += 1;
      renderPager(table, true);
      try{ mount.scrollIntoView({block:'nearest', behavior:'auto'}); }catch(_){ }
    });
    return state;
  }

  function removePager(table){
    const state = pagerStates.get(table);
    if(state?.pager) state.pager.remove();
    table.querySelectorAll('tbody tr.ghazal-page-hidden').forEach(row => row.classList.remove('ghazal-page-hidden'));
    pagerStates.delete(table);
  }

  function renderPager(table, preservePage){
    if(!shouldPaginate(table)) return removePager(table);
    const tbody = table.tBodies[0];
    if(!tbody) return;
    const rows = Array.from(tbody.rows || []);
    if(rows.length < PAGER_MIN_ROWS) return removePager(table);

    const state = ensurePager(table);
    if(state.updating) return;
    state.updating = true;
    try{
      // Remove only our visibility class; page-level search/filter remains intact.
      rows.forEach(row => row.classList.remove('ghazal-page-hidden'));
      const filteredRows = rows.filter(rowIsFilterVisible);
      state.pageSize = pagerPageSize();
      const pages = Math.max(1, Math.ceil(filteredRows.length / state.pageSize));
      if(!preservePage) state.page = 1;
      state.page = Math.min(Math.max(1, state.page || 1), pages);
      const start = (state.page - 1) * state.pageSize;
      const end = start + state.pageSize;
      filteredRows.forEach((row, index) => {
        if(index < start || index >= end) row.classList.add('ghazal-page-hidden');
      });
      state.pager.style.display = 'flex';
      state.pager.querySelector('.ghazal-page-info').textContent = 'صفحة ' + state.page;
      state.pager.querySelector('[data-gh-page="prev"]').disabled = state.page <= 1;
      state.pager.querySelector('[data-gh-page="next"]').disabled = state.page >= pages;
    } finally { state.updating = false; }
  }

  function refreshAllPagers(preservePage){
    document.querySelectorAll('.ct-original-page table').forEach(table => renderPager(table, preservePage !== false));
  }

  function schedulePagerRefresh(preservePage){
    clearTimeout(pagerRefreshTimer);
    pagerRefreshTimer = setTimeout(function(){ refreshAllPagers(preservePage !== false); }, 90);
  }

  function bindPagination(){
    schedulePagerRefresh(false);
    const observer = new MutationObserver(function(mutations){
      let relevant = false;
      for(const m of mutations){
        if(m.type === 'childList'){
          const el = m.target?.nodeType === 1 ? m.target : m.target?.parentElement;
          if(el?.closest?.('table')) { relevant = true; break; }
        }
        if(m.type === 'attributes' && m.target?.closest?.('table')) { relevant = true; break; }
      }
      if(relevant) schedulePagerRefresh(true);
    });
    observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['style','hidden','aria-hidden']});
    document.addEventListener('input', function(e){ if(e.target?.matches?.('input[type="search"],.search-control,.search-input')) schedulePagerRefresh(false); }, true);
    document.addEventListener('change', function(e){ if(e.target?.matches?.('select,input[type="checkbox"],input[type="radio"]')) schedulePagerRefresh(false); }, true);
    window.addEventListener('resize', function(){ schedulePagerRefresh(true); }, {passive:true});

    window.addEventListener('beforeprint', function(){
      document.querySelectorAll('.ghazal-page-hidden').forEach(row => row.classList.add('ghazal-print-visible'));
    });
    window.addEventListener('afterprint', function(){
      document.querySelectorAll('.ghazal-print-visible').forEach(row => row.classList.remove('ghazal-print-visible'));
      schedulePagerRefresh(true);
    });
  }

  function silentStorageMaintenance(){
    const run = async function(){
      try{ await navigator.storage?.persist?.(); }catch(_){ }
      try{ await window.Cashtop?.recoverStoragePressure?.(); }catch(_){ }
      try{
        const audit = JSON.parse(localStorage.getItem('cashtop_audit_log') || '[]');
        if(Array.isArray(audit) && audit.length > 100) localStorage.setItem('cashtop_audit_log', JSON.stringify(audit.slice(-100)));
      }catch(_){ }
      try{
        const ready = await navigator.serviceWorker?.ready;
        ready?.active?.postMessage?.({type:'TRIM_OLD_CACHES'});
      }catch(_){ }
    };
    const idle = window.requestIdleCallback || function(fn){ return setTimeout(fn, 900); };
    idle(function(){ run(); });
    window.addEventListener('cashtop:local-storage-pressure', function(){ run(); });
  }

  function warmCache(){
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function(reg){
      try{ reg.active?.postMessage?.({type:'VERIFY_CACHE', requestId:'ghazal-ui-r110-' + Date.now()}); reg.active?.postMessage?.({type:'WARM_CACHE', requestId:'ghazal-ui-r110-warm-' + Date.now()}); }catch(_){ }
    }).catch(function(){});
  }

  function init(){
    tagPage();
    tagVisuals(document);
    bindSidebarSafety();
    bindPagination();
    applyChartDefaults();
    silentStorageMaintenance();
    warmCache();

    document.addEventListener('cashtop:branding-applied', function(){ setTimeout(function(){ bindLogoFallback(document); }, 0); });

    const visualsObserver = new MutationObserver(function(ms){
      ms.forEach(function(m){
        m.addedNodes?.forEach(function(n){ if(n && n.nodeType === 1) tagVisuals(n); });
      });
    });
    visualsObserver.observe(document.documentElement, {childList:true, subtree:true});

    let tries = 0;
    const timer = setInterval(function(){ tries += 1; if(applyChartDefaults() || tries > 20) clearInterval(timer); }, 250);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
