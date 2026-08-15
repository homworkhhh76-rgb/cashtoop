(() => {
  'use strict';

  const page = (() => {
    try { return decodeURIComponent((location.pathname.split('/').pop() || '').trim()); }
    catch (_) { return (location.pathname.split('/').pop() || '').trim(); }
  })();

  const PAGE_KEY = {
    'customers.html': 'cashtop_customers',
    'products.html': 'cashtop_products',
    'invoices.html': 'cashtop_invoices'
  }[page] || '';

  function recordId(item, index = 0) {
    return String(window.Cashtop?.recordIdentity?.(item, index) || item?.id || item?.invoiceNo || item?.code || item?.number || `anon:${index}`);
  }

  function mergeRows(current, rows) {
    const merged = new Map();
    (Array.isArray(current) ? current : []).forEach((item, index) => merged.set(recordId(item, index), item));
    (Array.isArray(rows) ? rows : []).forEach((item, index) => merged.set(recordId(item, index), item));
    return [...merged.values()];
  }

  function applyRemoteTotal(detail) {
    if (!detail || detail.key !== PAGE_KEY) return;
    const total = Number(detail.total);
    if (!Number.isFinite(total) || total < 0) return;
    if (page === 'customers.html') {
      const node = document.getElementById('statTotalCust');
      if (node) node.textContent = `${total} عميل`;
    } else if (page === 'products.html') {
      const node = document.getElementById('statProductsCount');
      if (node) node.textContent = `${total} منتج`;
    }
  }

  window.addEventListener('cashtop:remote-applied', event => applyRemoteTotal(event.detail || {}));

  window.addEventListener('cashtop:remote-page', event => {
    const detail = event.detail || {};
    applyRemoteTotal(detail);
    if (!PAGE_KEY || detail.key !== PAGE_KEY || !Array.isArray(detail.records)) return;
    try {
      if (page === 'customers.html') customersData = mergeRows(customersData, detail.records);
      else if (page === 'products.html') productsData = mergeRows(productsData, detail.records);
      else if (page === 'invoices.html') allInvoices = mergeRows(allInvoices, detail.records);
    } catch (error) {
      console.warn('[CASH TOP R118] temporary remote page cache:', PAGE_KEY, error);
    }
  });

  async function pullDependencies(keys) {
    const unique = [...new Set((keys || []).filter(Boolean))];
    if (!unique.length || !window.CashtopTurso?.pullDatasetKeys || navigator.onLine === false) return false;
    try {
      await window.CashtopTurso.pullDatasetKeys(unique, { concurrency: 4, silentProgress: true, force: false });
      return true;
    } catch (error) {
      console.warn('[CASH TOP R118] lazy dependencies:', page, error);
      return false;
    }
  }

  function wrapAsync(name, before) {
    const original = window[name];
    if (typeof original !== 'function' || original.__ctLazyWrapped) return;
    const wrapped = async function(...args) {
      await before(...args);
      return original.apply(this, args);
    };
    wrapped.__ctLazyWrapped = true;
    window[name] = wrapped;
  }

  if (page === 'customers.html') {
    // سجل العميل ثقيل؛ الفواتير/المرتجعات/السندات لا تُسحب عند فتح قائمة العملاء.
    const ensureHistoryData = async () => {
      await pullDependencies(['cashtop_invoices', 'cashtop_sales_returns', 'cashtop_vouchers']);
    };
    wrapAsync('openCustomerHistory', ensureHistoryData);
    wrapAsync('exportRowPDF', ensureHistoryData);
    wrapAsync('exportRowImage', ensureHistoryData);
  }

  if (page === 'products.html') {
    // بيانات الموردين والصناديق والمشتريات مطلوبة فقط عند فتح نموذج التوريد.
    wrapAsync('openProductModal', async () => {
      await pullDependencies(['cashtop_suppliers', 'cashtop_purchases', 'cashtop_funds_db']);
      try { if (typeof refreshProductDatasets === 'function') refreshProductDatasets(); } catch (_) {}
    });
  }

  if (page === 'invoices.html') {
    const accountingDeps = ['cashtop_products', 'cashtop_materials', 'cashtop_customers', 'cashtop_funds_db', 'cashtop_sales_offers', 'cashtop_sales_agents', 'cashtop_sales_returns'];
    // العرض/الطباعة يعملان من سجل الفاتورة نفسه. البيانات الثقيلة تُطلب فقط عند عملية مالية تحتاجها.
    wrapAsync('confirmDeleteInvoice', async () => { await pullDependencies(accountingDeps); });
    wrapAsync('openBatchInvoiceModal', async () => { await pullDependencies(['cashtop_products', 'cashtop_customers', 'cashtop_funds_db']); });
  }
})();
