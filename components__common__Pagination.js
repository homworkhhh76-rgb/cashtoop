import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { queryStorePage } from './services__db.js?v=7.9.4.134-invoice-filters';

const h = React.createElement;

export function usePagination(items = [], pageSize = 50, resetKey = '') {
  const safeItems = Array.isArray(items) ? items : [];
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(safeItems.length / pageSize));

  useEffect(() => { setPage(1); }, [resetKey, pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return safeItems.slice(start, start + pageSize);
  }, [safeItems, page, pageSize]);

  return { page, setPage, totalPages, pageItems, totalItems: safeItems.length, pageSize };
}

// Small in-memory cache for pages already opened during this app session.
// It prevents the "empty -> loading -> data" flash when returning to a screen.
// Historical rows themselves still live in IndexedDB/cloud, not localStorage.
const DATABASE_PAGE_CACHE = new Map();
const STORE_EPOCH = new Map();

function cacheEpoch(storeName) { return Number(STORE_EPOCH.get(storeName) || 0); }
function invalidateStoreCache(storeName) {
  const name = String(storeName || '');
  if (!name) return;
  STORE_EPOCH.set(name, cacheEpoch(name) + 1);
  for (const key of [...DATABASE_PAGE_CACHE.keys()]) {
    if (key.startsWith(`${name}|`)) DATABASE_PAGE_CACHE.delete(key);
  }
}
function invalidateFromEvent(event) {
  const detail = event?.detail || {};
  const names = new Set();
  if (detail.storeName) names.add(String(detail.storeName));
  for (const store of Array.isArray(detail.stores) ? detail.stores : []) names.add(String(store));
  names.forEach(invalidateStoreCache);
}
if (typeof window !== 'undefined' && !window.__CASH_TOP_PAGER_CACHE_WIRED_114__) {
  window.__CASH_TOP_PAGER_CACHE_WIRED_114__ = true;
  window.addEventListener('oscar:db-mutation', invalidateFromEvent);
  window.addEventListener('oscar:sync-applied', invalidateFromEvent);
}

function safeOptionsKey(options) {
  try { return JSON.stringify(options || {}); } catch { return ''; }
}
function makePageCacheKey(storeName, options, page, pageSize) {
  return `${storeName}|${page}|${pageSize}|${safeOptionsKey(options)}`;
}
function cacheResult(storeName, options, page, pageSize, result) {
  const key = makePageCacheKey(storeName, options, page, pageSize);
  DATABASE_PAGE_CACHE.set(key, { epoch: cacheEpoch(storeName), result: { ...result, loading:false, error:null, page } });
  // LRU-ish cap: enough for 5–10 pages across several sections without growing forever.
  while (DATABASE_PAGE_CACHE.size > 80) DATABASE_PAGE_CACHE.delete(DATABASE_PAGE_CACHE.keys().next().value);
}
function getCachedResult(storeName, options, page, pageSize) {
  const key = makePageCacheKey(storeName, options, page, pageSize);
  const hit = DATABASE_PAGE_CACHE.get(key);
  if (!hit || hit.epoch !== cacheEpoch(storeName)) return null;
  // Refresh insertion order so frequently revisited pages stay cached.
  DATABASE_PAGE_CACHE.delete(key);
  DATABASE_PAGE_CACHE.set(key, hit);
  return hit.result;
}

export function useDatabasePagination(storeName, options = {}, resetKey = '') {
  const pageSize = Math.min(250, Math.max(1, Number(options.pageSize || 50)));
  const optionsKey = safeOptionsKey(options || {});
  const [page, setPage] = useState(1);
  const initialCached = getCachedResult(storeName, options, 1, pageSize);
  const [state, setState] = useState(() => initialCached ? {
    items: Array.isArray(initialCached.items) ? initialCached.items : [],
    total: Number(initialCached.total || 0),
    totalPages: Math.max(1, Number(initialCached.totalPages || 1)),
    loading: false,
    error: null,
    source: initialCached.source || 'memory-cache',
    page: 1,
    offlineUnavailable: !!initialCached.offlineUnavailable,
  } : { items: [], total: 0, totalPages: 1, loading: true, error: null, source: '', page: 1, offlineUnavailable:false });
  const requestSeq = useRef(0);

  useEffect(() => { setPage(1); }, [resetKey, pageSize]);

  const load = useCallback(async (force = false) => {
    const seq = ++requestSeq.current;
    const cached = !force ? getCachedResult(storeName, options, page, pageSize) : null;
    if (cached) {
      setState({
        items: Array.isArray(cached.items) ? cached.items : [],
        total: Number(cached.total || 0),
        totalPages: Math.max(1, Number(cached.totalPages || 1)),
        loading: false,
        error: null,
        source: cached.source || 'memory-cache',
        page,
        offlineUnavailable: !!cached.offlineUnavailable,
      });
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    }

    const hasSearch = !!String(options?.search || '').trim();
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    let showedLocal = false;

    // Page 1 gets stale-while-revalidate behavior: show the already cached IndexedDB
    // page instantly, then refresh silently from cloud. Page 2+ is fetched only when
    // requested and requires network unless that exact page was opened this session.
    if (page === 1 && !hasSearch) {
      try {
        const local = await queryStorePage(storeName, { ...options, page:1, pageSize, source:'local', countTotal:false });
        if (seq !== requestSeq.current) return;
        if (Array.isArray(local?.items) && (local.items.length || Number(local?.total || 0) > 0)) {
          showedLocal = true;
          const localState = {
            items: local.items,
            total: Number(local.total || 0),
            totalPages: Math.max(1, Number(local.totalPages || 1)),
            loading: false,
            error: null,
            source: local.source || 'indexeddb-cache',
            page,
            offlineUnavailable: false,
          };
          setState(localState);
          // Local preview is not an authoritative remotely refreshed page.
          if (!online) return;
        }
      } catch (_) {}
    }

    if (!showedLocal) {
      setState(prev => ({
        ...prev,
        items: prev.page === page ? prev.items : [],
        page,
        loading: !(prev.page === page && Array.isArray(prev.items) && prev.items.length > 0),
        error: null,
        offlineUnavailable:false,
      }));
    }

    try {
      const result = await queryStorePage(storeName, { ...options, page, pageSize });
      if (seq !== requestSeq.current) return;
      const nextState = {
        items: Array.isArray(result?.items) ? result.items : [],
        total: Number(result?.total || 0),
        totalPages: Math.max(1, Number(result?.totalPages || 1)),
        loading: false,
        error: null,
        source: result?.source || '',
        page,
        offlineUnavailable: !!result?.offlineUnavailable,
      };
      setState(nextState);
      if (!nextState.offlineUnavailable) cacheResult(storeName, options, page, pageSize, nextState);
    } catch (error) {
      if (seq === requestSeq.current) setState(prev => ({ ...prev, loading:false, error }));
    }
  }, [storeName, page, pageSize, optionsKey]);

  useEffect(() => {
    let disposed = false;
    const timer = setTimeout(() => { if (!disposed) load(false); }, String(options?.search || '').trim() ? 120 : 0);
    return () => { disposed = true; clearTimeout(timer); requestSeq.current++; };
  }, [load]);

  useEffect(() => {
    const refresh = (event) => {
      const changed = event?.detail?.storeName || '';
      const stores = event?.detail?.stores || [];
      if ((!changed && !stores.length) || changed === storeName || stores.includes(storeName)) {
        invalidateStoreCache(storeName);
        load(true);
      }
    };
    window.addEventListener('online', refresh);
    window.addEventListener('oscar:db-mutation', refresh);
    window.addEventListener('oscar:sync-applied', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('oscar:db-mutation', refresh);
      window.removeEventListener('oscar:sync-applied', refresh);
    };
  }, [storeName, load]);

  useEffect(() => { if (!state.loading && !state.offlineUnavailable && state.page === page && page > state.totalPages) setPage(state.totalPages); }, [page, state.totalPages, state.page, state.loading, state.offlineUnavailable]);

  const pager = useMemo(() => ({
    page, setPage, totalPages: state.totalPages, pageItems: state.items,
    totalItems: state.total, pageSize, loading: state.loading, error: state.error,
    source: state.source, offlineUnavailable: state.offlineUnavailable,
    refresh: () => load(true),
  }), [page, state, pageSize, load]);
  return pager;
}

function pageTokens(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const values = new Set([1, totalPages, page - 2, page - 1, page, page + 1, page + 2]);
  const nums = [...values].filter(n => n >= 1 && n <= totalPages).sort((a,b) => a-b);
  const out = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push(`gap-${nums[i - 1]}-${n}`);
    out.push(n);
  });
  return out;
}

export const Pagination = ({ pager, className = '' }) => {
  if (!pager) return null;
  if (pager.error) return h('div',{role:'alert',className:'p-3 text-sm text-rose-600'},'تعذر تحميل السجلات. ',h('button',{type:'button',onClick:pager.refresh,className:'px-3 py-2 rounded-lg bg-violet-600 text-white'},'إعادة المحاولة'));
  if (pager.totalItems <= pager.pageSize && !pager.offlineUnavailable) return null;
  const start = (pager.page - 1) * pager.pageSize + 1;
  const end = Math.min(pager.totalItems, pager.page * pager.pageSize);
  return h('div', { className:`oscar-pagination no-print flex flex-col sm:flex-row items-center justify-between gap-2 px-3 py-3 border-t border-slate-100 bg-white ${className}` },
    h('div', { className:'text-[11px] font-bold text-slate-500' },
      pager.offlineUnavailable
        ? `العدد الإجمالي ${pager.totalItems} سجل • اتصل بالإنترنت لفتح الصفحة ${pager.page}`
        : `عرض ${start}–${end} من ${pager.totalItems} سجل • ${pager.pageSize} سجل لكل صفحة`
    ),
    h('div', { className:'flex items-center gap-1 flex-wrap justify-center' },
      h('button', { type:'button', disabled:pager.page <= 1, onClick:()=>pager.setPage(Math.max(1,pager.page-1)), className:'px-3 h-8 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 bg-white disabled:opacity-35' }, 'السابق'),
      ...pageTokens(pager.page,pager.totalPages).map(token => typeof token === 'string'
        ? h('span',{key:token,className:'px-1 text-slate-400'},'…')
        : h('button',{key:token,type:'button',onClick:()=>pager.setPage(token),className:`min-w-8 h-8 px-2 rounded-lg border text-[11px] font-black ${pager.page===token?'bg-violet-600 border-violet-600 text-white':'bg-white border-slate-200 text-slate-600'}`},String(token))
      ),
      h('button', { type:'button', disabled:pager.page >= pager.totalPages, onClick:()=>pager.setPage(Math.min(pager.totalPages,pager.page+1)), className:'px-3 h-8 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 bg-white disabled:opacity-35' }, 'التالي')
    )
  );
};
