import React, { useEffect, useMemo, useState } from 'react';

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
  if (!pager || pager.totalItems <= pager.pageSize) return null;
  const start = (pager.page - 1) * pager.pageSize + 1;
  const end = Math.min(pager.totalItems, pager.page * pager.pageSize);
  return h('div', { className:`oscar-pagination no-print flex flex-col sm:flex-row items-center justify-between gap-2 px-3 py-3 border-t border-slate-100 bg-white ${className}` },
    h('div', { className:'text-[11px] font-bold text-slate-500' }, `عرض ${start}–${end} من ${pager.totalItems} سجل • 50 سجل لكل صفحة`),
    h('div', { className:'flex items-center gap-1 flex-wrap justify-center' },
      h('button', { type:'button', disabled:pager.page <= 1, onClick:()=>pager.setPage(Math.max(1,pager.page-1)), className:'px-3 h-8 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 bg-white disabled:opacity-35' }, 'السابق'),
      ...pageTokens(pager.page,pager.totalPages).map(token => typeof token === 'string'
        ? h('span',{key:token,className:'px-1 text-slate-400'},'…')
        : h('button',{key:token,type:'button',onClick:()=>pager.setPage(token),className:`min-w-8 h-8 px-2 rounded-lg border text-[11px] font-black ${pager.page===token?'bg-emerald-600 border-emerald-600 text-white':'bg-white border-slate-200 text-slate-600'}`},String(token))
      ),
      h('button', { type:'button', disabled:pager.page >= pager.totalPages, onClick:()=>pager.setPage(Math.min(pager.totalPages,pager.page+1)), className:'px-3 h-8 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 bg-white disabled:opacity-35' }, 'التالي')
    )
  );
};
