(() => {
  'use strict';

  const VERSION = '123';
  const PAGE_SIZE = 50;
  const CACHE_PREFIX = 'ct_register_page_cache_v122';
  const CACHE_INDEX_PREFIX = 'ct_register_page_index_v122';
  const MAX_CACHED_PAGES = 30;

  const file = (() => {
    try { return decodeURIComponent((location.pathname.split('/').pop() || '').replace(/\+/g, ' ')); }
    catch (_) { return location.pathname.split('/').pop() || ''; }
  })();

  const config = {
    'customers.html': {
      key: 'cashtop_customers',
      label: 'عميل',
      tableBody: 'customersTableBody',
      totalStat: 'statTotalCust',
      totalSuffix: ' عميل',
      searchInput: 'searchInput',
      searchFields: ['name','phone','mobile','code','id'],
      getRows: () => (typeof customersData !== 'undefined' && Array.isArray(customersData) ? customersData : []),
      setRows: rows => { customersData = Array.isArray(rows) ? rows : []; },
      applyStats: stats => {
        const total = Number(stats?.total || 0);
        const debtors = Number(stats?.totalDebtors || 0);
        const creditors = Number(stats?.totalCreditors || 0);
        const limits = Number(stats?.limitsExceeded || 0);
        const totalEl = document.getElementById('statTotalCust'); if (totalEl) totalEl.textContent = `${total} عميل`;
        const debtEl = document.getElementById('statDebtors'); if (debtEl) debtEl.textContent = debtors.toFixed(2);
        const creditEl = document.getElementById('statCreditors'); if (creditEl) creditEl.textContent = creditors.toFixed(2);
        const limitsEl = document.getElementById('statLimits'); if (limitsEl) limitsEl.textContent = `${limits} عملاء`;
      },
      render: rows => {
        let visible = Array.isArray(rows) ? rows : [];
        try {
          if (typeof activeDebtFilter !== 'undefined' && activeDebtFilter !== 'all') {
            visible = visible.filter(customer => {
              const balance = Number(customer?.balance || 0);
              const limit = Number(customer?.creditLimit || 0);
              if (activeDebtFilter === 'debt') return balance > 0;
              if (activeDebtFilter === 'credit') return balance < 0;
              if (activeDebtFilter === 'limit') return balance > 0 && limit > 0 && balance > limit;
              return true;
            });
          }
        } catch (_) {}
        if (typeof renderTable === 'function') renderTable(visible);
      }
    },
    'products.html': {
      key: 'cashtop_products',
      label: 'منتج',
      tableBody: 'productsTableBody',
      totalStat: 'statProductsCount',
      totalSuffix: ' منتج',
      searchInput: 'searchInput',
      searchFields: ['name','barcode','unitBarcode','code','id','sku'],
      getRows: () => (typeof productsData !== 'undefined' && Array.isArray(productsData) ? productsData : []),
      setRows: rows => { productsData = Array.isArray(rows) ? rows : []; },
      applyStats: stats => {
        const total = Number(stats?.total || 0);
        const cost = Number(stats?.totalCost || 0);
        const sale = Number(stats?.totalSale || 0);
        const symbol = (() => { try { return typeof productBaseSymbol === 'function' ? productBaseSymbol() : '₪'; } catch (_) { return '₪'; } })();
        const countEl = document.getElementById('statProductsCount'); if (countEl) countEl.textContent = `${total} منتج`;
        const costEl = document.getElementById('statTotalCost'); if (costEl) costEl.textContent = `${cost.toFixed(2)} ${symbol}`;
        const saleEl = document.getElementById('statTotalSale'); if (saleEl) saleEl.textContent = `${sale.toFixed(2)} ${symbol}`;
        const profitEl = document.getElementById('statTotalProfit'); if (profitEl) profitEl.textContent = `${(sale-cost).toFixed(2)} ${symbol}`;
      },
      render: rows => { if (typeof renderTable === 'function') renderTable(rows); }
    },
    'invoices.html': {
      key: 'cashtop_invoices',
      label: 'فاتورة',
      tableBody: 'invoices-tbody',
      searchInput: 'searchInput',
      searchFields: ['id','invoiceNo','number','customerName','customer','phone','barcode'],
      getRows: () => (typeof allInvoices !== 'undefined' && Array.isArray(allInvoices) ? allInvoices : []),
      setRows: rows => { allInvoices = Array.isArray(rows) ? rows : []; },
      applyStats: stats => {
        const fmt = value => { try { return typeof money === 'function' ? money(Number(value||0)) : Number(value||0).toFixed(2); } catch (_) { return Number(value||0).toFixed(2); } };
        const sales = document.getElementById('stat-total-sales'); if (sales) sales.textContent = fmt(stats?.totalSales);
        const paid = document.getElementById('stat-total-paid'); if (paid) paid.textContent = fmt(stats?.totalPaid);
        const debt = document.getElementById('stat-total-debt'); if (debt) debt.textContent = fmt(stats?.totalDebt);
        const today = document.getElementById('stat-today-count'); if (today) today.textContent = String(Number(stats?.todayCount || 0));
      },
      render: rows => {
        if (typeof visibleInvoices === 'function' && typeof renderTable === 'function') {
          let visible = visibleInvoices();
          try { if (typeof filterInvoicesBySelectedPeriod === 'function') visible = filterInvoicesBySelectedPeriod(visible); } catch (_) {}
          renderTable(visible);
        } else if (typeof renderTable === 'function') renderTable(rows);
      }
    }
  }[file];

  if (!config) return;

  const state = {
    page: 1,
    pages: 1,
    resultTotal: 0,
    companyTotal: 0,
    search: '',
    loading: false,
    requestId: 0,
    rows: [],
    initialized: false,
    searchTimer: 0,
    source: 'local',
    globalStats: null,
    statsLoading: false,
    statsAt: 0
  };

  const rawStorage = {
    get(key) { try { return Storage.prototype.getItem.call(localStorage, key); } catch (_) { return null; } },
    set(key, value) { try { Storage.prototype.setItem.call(localStorage, key, String(value)); return true; } catch (_) { return false; } },
    remove(key) { try { Storage.prototype.removeItem.call(localStorage, key); } catch (_) {} }
  };

  function scopeId() {
    try {
      const session = window.Cashtop?.getSession?.() || {};
      const tenant = String(session.tenantId || session.companyId || session.licenseId || session.companyKey || 'default');
      const group = String(window.Cashtop?.currentFinancialGroupId?.() || window.Cashtop?.LEGACY_FINANCIAL_GROUP_ID || 'FG_LEGACY');
      return `${encodeURIComponent(tenant)}::${encodeURIComponent(group)}`;
    } catch (_) { return 'default::FG_LEGACY'; }
  }

  function pageCacheKeyForScope(scope, page) {
    return `${CACHE_PREFIX}::${scope}::${config.key}::${Math.max(1, Number(page || 1))}`;
  }

  function pageCacheKey(page) {
    return pageCacheKeyForScope(scopeId(), page);
  }

  function recoveryScopeIds() {
    const scopes = [scopeId()];
    try {
      const session = window.Cashtop?.getSession?.() || {};
      const companyKey = String(session.companyKey || '').trim().toUpperCase();
      const group = String(window.Cashtop?.currentFinancialGroupId?.() || window.Cashtop?.LEGACY_FINANCIAL_GROUP_ID || 'FG_LEGACY');
      const ids = JSON.parse(rawStorage.get(`ct_recovery_tenants_v123::${encodeURIComponent(companyKey)}`) || '[]');
      if (Array.isArray(ids)) ids.forEach(tenant => {
        const scope = `${encodeURIComponent(String(tenant || ''))}::${encodeURIComponent(group)}`;
        if (tenant && !scopes.includes(scope)) scopes.push(scope);
      });
    } catch (_) {}
    return scopes;
  }

  function cacheIndexKey() {
    return `${CACHE_INDEX_PREFIX}::${scopeId()}::${config.key}`;
  }


  function statsCacheKey() {
    return `ct_register_stats_cache_v122::${scopeId()}::${config.key}`;
  }

  function readStatsCache() {
    try {
      const parsed = JSON.parse(rawStorage.get(statsCacheKey()) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function saveStatsCache(stats) {
    if (!stats || typeof stats !== 'object') return;
    rawStorage.set(statsCacheKey(), JSON.stringify({ ...stats, cachedAt: Date.now() }));
  }

  function readCacheIndex() {
    try {
      const parsed = JSON.parse(rawStorage.get(cacheIndexKey()) || '[]');
      return Array.isArray(parsed) ? parsed.filter(item => item && Number(item.page) >= 1) : [];
    } catch (_) { return []; }
  }

  function writeCacheIndex(index) {
    rawStorage.set(cacheIndexKey(), JSON.stringify(index));
  }

  function removeCachedPage(page) {
    rawStorage.remove(pageCacheKey(page));
  }

  function savePageCache(result) {
    const page = Math.max(1, Number(result?.page || 1));
    const items = Array.isArray(result?.items) ? result.items : [];
    const payload = {
      version: VERSION,
      key: config.key,
      page,
      pageSize: PAGE_SIZE,
      total: Math.max(0, Number(result?.total || 0)),
      pages: Math.max(1, Number(result?.pages || 1)),
      updatedAt: Number(result?.updatedAt || 0),
      stats: result?.stats && typeof result.stats === 'object' ? result.stats : null,
      cachedAt: Date.now(),
      items
    };

    let ok = rawStorage.set(pageCacheKey(page), JSON.stringify(payload));
    let index = readCacheIndex().filter(item => Number(item.page) !== page);
    index.push({ page, at: payload.cachedAt });
    index.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));

    if (!ok) {
      const prune = index.slice(Math.max(1, Math.floor(index.length / 2)));
      prune.forEach(item => removeCachedPage(item.page));
      index = index.slice(0, Math.max(1, Math.floor(index.length / 2)));
      ok = rawStorage.set(pageCacheKey(page), JSON.stringify(payload));
      if (!ok) return false;
      index = index.filter(item => Number(item.page) !== page);
      index.unshift({ page, at: payload.cachedAt });
    }

    const overflow = index.slice(MAX_CACHED_PAGES);
    overflow.forEach(item => removeCachedPage(item.page));
    writeCacheIndex(index.slice(0, MAX_CACHED_PAGES));
    return true;
  }

  function readPageCache(page) {
    for (const scope of recoveryScopeIds()) {
      try {
        const parsed = JSON.parse(rawStorage.get(pageCacheKeyForScope(scope, page)) || 'null');
        if (!parsed || !Array.isArray(parsed.items)) continue;
        return {
          ...parsed,
          page: Math.max(1, Number(parsed.page || page || 1)),
          pages: Math.max(1, Number(parsed.pages || 1)),
          total: Math.max(0, Number(parsed.total || 0)),
          recoveredScope: scope !== scopeId()
        };
      } catch (_) {}
    }
    return null;
  }

  function cachedSearchResult(query, page = 1) {
    const needle = String(query || '').trim().toLocaleLowerCase();
    if (!needle) return null;
    const fields = config.searchFields || [];
    const map = new Map();
    for (const entry of readCacheIndex()) {
      const cached = readPageCache(entry.page);
      if (!cached) continue;
      cached.items.forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        const id = String(item.id ?? item.invoiceNo ?? item.number ?? item.code ?? item.barcode ?? `${entry.page}:${index}`);
        map.set(id, item);
      });
    }
    const matches = [...map.values()].filter(item => fields.some(field => String(item?.[field] ?? '').toLocaleLowerCase().includes(needle)));
    const start = (Math.max(1, Number(page || 1)) - 1) * PAGE_SIZE;
    const total = matches.length;
    return {
      items: matches.slice(start, start + PAGE_SIZE),
      total,
      page: Math.max(1, Number(page || 1)),
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      pageSize: PAGE_SIZE,
      cachedOnly: true
    };
  }

  function toast(message, type = 'info') {
    try {
      if (window.Cashtop?.showToast) return window.Cashtop.showToast(message, type);
      if (typeof showToast === 'function') return showToast(message, type);
      if (typeof notify === 'function') return notify(message, type);
    } catch (_) {}
  }

  function pageMeta() {
    try { return window.CashtopTurso?.getDatasetPageMeta?.(config.key) || null; }
    catch (_) { return null; }
  }

  function updateFullCount() {
    const total = Number(state.companyTotal || pageMeta()?.total || 0);
    if (!Number.isFinite(total) || total < 0) return;
    state.companyTotal = total;
    if (config.totalStat) {
      const node = document.getElementById(config.totalStat);
      if (node) node.textContent = `${total}${config.totalSuffix || ''}`;
    }
  }

  function removeLegacyPagers() {
    document.querySelectorAll('.ct-record-pager,.ghazal-pager').forEach(node => {
      if (node.id !== 'ctRegisterPager') node.remove();
    });
    const body = document.getElementById(config.tableBody);
    const table = body?.closest('table');
    if (!table) return;
    table.setAttribute('data-no-pagination', '1');
    table.removeAttribute('data-ct-record-paged');
    const container = table.closest('.table-responsive-box,.table-responsive,.table-wrapper,.table-wrap,.table-container,.data-table-wrap') || table;
    const candidates = [];
    if (container.nextElementSibling) candidates.push(container.nextElementSibling);
    if (table.nextElementSibling) candidates.push(table.nextElementSibling);
    candidates.forEach(node => {
      if (node?.classList?.contains('ct-record-pager') || node?.classList?.contains('ghazal-pager')) node.remove();
    });
    const parent = container.parentElement;
    if (parent) {
      [...parent.children].forEach(node => {
        if (node === document.getElementById('ctRegisterPager')) return;
        if (node?.classList?.contains('ct-record-pager') || node?.classList?.contains('ghazal-pager')) node.remove();
      });
    }
  }

  function pagerHost() {
    removeLegacyPagers();
    let host = document.getElementById('ctRegisterPager');
    if (host) return host;
    const body = document.getElementById(config.tableBody);
    const table = body?.closest('table');
    const container = table?.closest('.table-responsive-box,.table-responsive,.table-wrapper,.table-wrap,.table-container,.data-table-wrap') || table?.parentElement;
    if (!container) return null;

    host = document.createElement('div');
    host.id = 'ctRegisterPager';
    host.dir = 'rtl';
    host.innerHTML = `
      <style>
        #ctRegisterPager{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 14px;margin-top:10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;font-family:Cairo,Arial,sans-serif;box-shadow:0 2px 8px rgba(15,23,42,.04)}
        #ctRegisterPager .ct-pager-info{font-size:12px;font-weight:800;color:#475569;min-width:190px}
        #ctRegisterPager .ct-pager-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        #ctRegisterPager button{border:1px solid #dbe2ea;background:#fff;color:#334155;min-width:38px;height:36px;border-radius:8px;padding:0 10px;font-family:inherit;font-weight:800;cursor:pointer;transition:.15s}
        #ctRegisterPager button:hover:not(:disabled){border-color:#5e5296;color:#5e5296;background:#f8f7ff}
        #ctRegisterPager button.active{background:#5e5296;color:#fff;border-color:#5e5296}
        #ctRegisterPager button:disabled{opacity:.42;cursor:not-allowed}
        #ctRegisterPager .ct-pager-loading{display:none;align-items:center;gap:7px;font-size:12px;font-weight:800;color:#5e5296}
        #ctRegisterPager.is-loading .ct-pager-loading{display:flex}
        #ctRegisterPager.is-loading .ct-pager-actions{opacity:.72}
        @media(max-width:640px){#ctRegisterPager{justify-content:center;text-align:center;padding:10px 8px}#ctRegisterPager .ct-pager-info{width:100%;min-width:0}#ctRegisterPager .ct-pager-actions{justify-content:center}#ctRegisterPager button{min-width:36px;padding:0 8px}}
      </style>
      <div class="ct-pager-info" id="ctPagerInfo">آخر ${PAGE_SIZE} ${config.label}</div>
      <div class="ct-pager-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>جاري تحميل ${PAGE_SIZE} سجل فقط...</span></div>
      <div class="ct-pager-actions" id="ctPagerActions"></div>`;
    container.insertAdjacentElement('afterend', host);
    return host;
  }

  function pageNumbers(current, pages) {
    const values = new Set([1, pages, current - 2, current - 1, current, current + 1, current + 2]);
    return [...values].filter(value => value >= 1 && value <= pages).sort((a, b) => a - b);
  }

  function renderPager() {
    removeLegacyPagers();
    const host = pagerHost();
    if (!host) return;
    host.classList.toggle('is-loading', state.loading);
    host.classList.toggle('is-offline', state.source === 'cache' || navigator.onLine === false);
    const pages = Math.max(1, Number(state.pages || 1));
    const current = Math.min(pages, Math.max(1, Number(state.page || 1)));
    const total = Math.max(0, Number(state.resultTotal || 0));
    const search = String(state.search || '').trim();
    const from = total ? ((current - 1) * PAGE_SIZE) + 1 : 0;
    const to = Math.min(total, current * PAGE_SIZE);
    const info = document.getElementById('ctPagerInfo');
    if (info) {
      const suffix = state.source === 'cache' || navigator.onLine === false ? ' — محفوظة محلياً' : '';
      info.textContent = search
        ? `نتائج البحث: ${total} — عرض ${from}-${to} — صفحة ${current} من ${pages}${suffix}`
        : `الإجمالي: ${state.companyTotal || total} — عرض ${from}-${to} — صفحة ${current} من ${pages}${suffix}`;
    }

    const actions = document.getElementById('ctPagerActions');
    if (!actions) return;
    actions.innerHTML = '';

    const makeButton = (text, page, options = {}) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      if (options.active) button.classList.add('active');
      button.disabled = Boolean(options.disabled);
      button.addEventListener('click', () => loadPage(page, { preferCache: true }));
      return button;
    };

    actions.appendChild(makeButton('السابق', current - 1, { disabled: current <= 1 || state.loading }));
    const numbers = pageNumbers(current, pages);
    numbers.forEach((pageNumber, index) => {
      if (index > 0 && pageNumber - numbers[index - 1] > 1) {
        const dots = document.createElement('span');
        dots.textContent = '…';
        dots.style.padding = '0 2px';
        actions.appendChild(dots);
      }
      actions.appendChild(makeButton(String(pageNumber), pageNumber, { active: pageNumber === current, disabled: state.loading }));
    });
    actions.appendChild(makeButton('التالي', current + 1, { disabled: current >= pages || state.loading }));
  }

  function applyGlobalStats(stats, source = 'remote') {
    if (!stats || typeof stats !== 'object') return;
    state.globalStats = stats;
    state.statsAt = Date.now();
    if (Number.isFinite(Number(stats.total))) {
      state.companyTotal = Math.max(0, Number(stats.total || 0));
      if (!state.search) {
        state.resultTotal = state.companyTotal;
        state.pages = Math.max(1, Math.ceil(state.companyTotal / PAGE_SIZE));
      }
    }
    try { config.applyStats?.(stats); } catch (error) { console.warn(`[CASH TOP R${VERSION}] apply stats:`, error); }
    updateFullCount();
    renderPager();
    if (source === 'remote') saveStatsCache(stats);
  }

  async function refreshGlobalStats(options = {}) {
    if (state.statsLoading && options.force !== true) return state.globalStats;
    const cached = readStatsCache();
    if (cached && (!state.globalStats || options.preferCache === true)) applyGlobalStats(cached, 'cache');
    if (navigator.onLine === false) return state.globalStats || cached;
    state.statsLoading = true;
    try {
      const api = await waitForPagerApi();
      if (!api?.queryDatasetStats) return state.globalStats || cached;
      let stats = await api.queryDatasetStats(config.key, { fresh: options.force === true });
      if (stats && Number(stats.total || 0) === 0 && state.companyTotal > 0) stats = { ...stats, total: state.companyTotal };
      if (stats) applyGlobalStats(stats, 'remote');
      return stats;
    } catch (error) {
      console.warn(`[CASH TOP R${VERSION}] register stats:`, config.key, error);
      return state.globalStats || cached;
    } finally {
      state.statsLoading = false;
    }
  }

  function applyRows(rows) {
    const clean = Array.isArray(rows) ? rows.filter(item => item && typeof item === 'object') : [];
    state.rows = clean;
    try {
      config.setRows(clean);
      config.render(clean);
      if (state.globalStats) config.applyStats?.(state.globalStats);
      config.postRender?.();
    } catch (error) {
      console.error(`[CASH TOP R${VERSION}] render page rows:`, config.key, error);
    }
    updateFullCount();
    renderPager();
  }

  function applyResult(result, source = 'remote') {
    if (!state.search && result?.stats && typeof result.stats === 'object') applyGlobalStats(result.stats, source === 'remote' ? 'remote' : 'cache');
    state.page = Math.max(1, Number(result?.page || 1));
    state.pages = Math.max(1, Number(result?.pages || 1));
    state.resultTotal = Math.max(0, Number(result?.total || 0));
    if (!state.search) state.companyTotal = state.resultTotal;
    state.source = source;
    applyRows(result?.items || []);
  }

  function localFallback(page = 1) {
    const cached = state.search ? cachedSearchResult(state.search, page) : readPageCache(page);
    if (cached) {
      applyResult(cached, 'cache');
      return true;
    }
    if (page !== 1) return false;
    const rows = config.getRows().slice(0, PAGE_SIZE);
    const meta = pageMeta();
    if (meta && Number.isFinite(Number(meta.total))) state.companyTotal = Number(meta.total);
    state.resultTotal = state.search ? rows.length : (state.companyTotal || rows.length);
    state.pages = Math.max(1, Math.ceil(state.resultTotal / PAGE_SIZE));
    state.page = 1;
    state.source = 'local';
    applyRows(rows);
    return rows.length > 0;
  }

  async function waitForPagerApi(timeoutMs = 6500) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (window.CashtopTurso?.queryDatasetPage) return window.CashtopTurso;
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    return window.CashtopTurso || null;
  }


  function withUiDeadline(promise, timeoutMs = 11000) {
    let timer = 0;
    return Promise.race([
      Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('REGISTER_PAGE_TIMEOUT')), timeoutMs); })
    ]);
  }

  async function loadPage(page = 1, options = {}) {
    page = Math.max(1, Number(page || 1));
    if (state.loading && options.force !== true) return;
    const requestId = ++state.requestId;
    const search = String(state.search || '').trim();

    if (options.preferCache !== false) {
      const instant = search ? cachedSearchResult(search, page) : readPageCache(page);
      if (instant) applyResult(instant, 'cache');
    }

    if (navigator.onLine === false) {
      if (!localFallback(page)) toast('هذه الصفحة لم تُفتح سابقاً، لذلك تحتاج اتصالاً بالإنترنت لأول مرة.', 'warning');
      return;
    }

    state.loading = true;
    renderPager();

    try {
      const api = await waitForPagerApi();
      if (!api?.queryDatasetPage) throw new Error('PAGER_API_NOT_READY');
      const result = await withUiDeadline(api.queryDatasetPage(config.key, {
        page,
        pageSize: PAGE_SIZE,
        search,
        searchFields: config.searchFields,
        includeStats: false,
        cacheLocal: !search && page === 1,
        replaceLocal: !search && page === 1,
        dispatch: false
      }), config.key === 'cashtop_products' ? 10500 : 13000);
      if (requestId !== state.requestId) return;

      if (!search) savePageCache(result);
      if (!search && !result?.stats && !state.globalStats) setTimeout(() => refreshGlobalStats({ force:true, preferCache:false }), 0);
      // Product cloud migrations used several path formats. If every remote
      // compatibility read is temporarily empty, keep an already-visible local
      // product page instead of replacing it with a false zero.
      if (config.key === 'cashtop_products' && !search && page === 1 && Number(result?.total || 0) === 0 && config.getRows().length > 0) {
        state.source = 'local';
        state.companyTotal = Math.max(state.companyTotal, config.getRows().length);
        renderPager();
      } else {
        applyResult(result, result?.localFallback ? 'local' : 'remote');
      }
    } catch (error) {
      if (requestId !== state.requestId) return;
      console.warn(`[CASH TOP R${VERSION}] register page request:`, config.key, error);
      const restored = localFallback(page);
      if (!restored) {
        state.source = 'local';
        const body = document.getElementById(config.tableBody);
        if (body) {
          const colspan = config.key === 'cashtop_products' ? 7 : (config.key === 'cashtop_customers' ? 7 : 8);
          body.innerHTML = `<tr><td colspan="${colspan}" style="padding:22px;text-align:center;color:#b45309;font-weight:800">تعذر جلب السجلات الآن. اضغط تحديث أو أعد فتح الصفحة.</td></tr>`;
        }
        toast('تعذر تحميل السجلات بسرعة من الخادم. لم تعد الصفحة معلقة على التحميل.', 'error');
      }
    } finally {
      if (requestId === state.requestId) {
        state.loading = false;
        renderPager();
      }
    }
  }

  function scheduleSearch() {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      const input = document.getElementById(config.searchInput);
      state.search = String(input?.value || '').trim();
      state.page = 1;
      loadPage(1, { force: true, preferCache: navigator.onLine === false });
    }, 260);
  }

  function installSearchOverride() {
    try { window.filterTable = scheduleSearch; } catch (_) {}
    try { filterTable = scheduleSearch; } catch (_) {}
    const input = document.getElementById(config.searchInput);
    if (input && !input.dataset.ctRemoteSearch) {
      input.dataset.ctRemoteSearch = '1';
      input.addEventListener('input', scheduleSearch, { passive: true });
    }
  }

  function preserveCurrentPageAfterUnrelatedRefresh(event) {
    const detail = event?.detail || {};
    if (detail.key !== config.key) return;
    if (state.page === 1 && !state.search) {
      const remoteTotal = Number(detail.total);
      if (Number.isFinite(remoteTotal) && remoteTotal >= 0) {
        state.companyTotal = remoteTotal;
        updateFullCount();
        renderPager();
      }
      return;
    }
    setTimeout(() => applyRows(state.rows), 0);
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;
    removeLegacyPagers();
    pagerHost();
    installSearchOverride();
    const meta = pageMeta();
    if (meta && Number.isFinite(Number(meta.total))) state.companyTotal = Number(meta.total);
    const cachedStats = readStatsCache();
    if (cachedStats) applyGlobalStats(cachedStats, 'cache');
    updateFullCount();
    renderPager();

    // افتح الصفحة المحفوظة فوراً. جلب آخر 50 + الإحصائيات الكاملة يتمان
    // بالتوازي في الخلفية ولا يوجد انتظار لمزامنة عامة عند دخول الصفحة.
    const cached = readPageCache(1);
    if (cached) applyResult(cached, 'cache');
    else localFallback(1);
    await loadPage(1, { force: true, preferCache: false });
    if (!state.globalStats) setTimeout(() => refreshGlobalStats({ force: true, preferCache: false }), 120);
  }

  window.addEventListener('cashtop:remote-applied', preserveCurrentPageAfterUnrelatedRefresh);
  window.addEventListener('online', () => { if (!state.loading) loadPage(state.page || 1, { force: true, preferCache: true }); });
  window.addEventListener('offline', () => { state.source = 'cache'; renderPager(); });
  window.addEventListener('cashtop:data-changed', event => {
    if (event?.detail?.key !== config.key) return;
    setTimeout(() => refreshGlobalStats({ force: true, preferCache: false }), 700);
  });
  window.addEventListener('cashtop:sync-complete', () => {
    if (navigator.onLine !== false) setTimeout(() => refreshGlobalStats({ force: true, preferCache: false }), 250);
  });
  window.CashtopRegisterPager = {
    state,
    loadPage,
    refreshGlobalStats,
    get globalStats() { return state.globalStats; },
    getCachedPages: () => readCacheIndex().map(item => Number(item.page)).sort((a,b) => a-b),
    search: value => {
      const input = document.getElementById(config.searchInput);
      if (input) input.value = String(value || '');
      state.search = String(value || '').trim();
      return loadPage(1, { force: true, preferCache: navigator.onLine === false });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else setTimeout(init, 0);
})();
