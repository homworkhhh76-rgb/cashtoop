import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Plus, Check, X } from 'lucide-react';
const h = React.createElement;

export const SearchableDropdown = ({
  id, label, placeholder='اختر...', icon, options=[], selectedId, onSelect,
  onQuickAdd, quickAddLabel='+ إضافة سريعة', className='', disabled=false,
}) => {
  const [isOpen,setIsOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [searchOpen,setSearchOpen]=useState(false);
  const [panelStyle,setPanelStyle]=useState({});
  const containerRef=useRef(null);
  const buttonRef=useRef(null);
  const panelRef=useRef(null);
  const searchRef=useRef(null);
  const selectedOption=options.find(o=>String(o.id)===String(selectedId));
  const q=search.trim().toLocaleLowerCase('ar');
  const filteredOptions=useMemo(()=>options.filter(opt=>{
    if(!q) return true;
    return String(opt.label||'').toLocaleLowerCase('ar').includes(q) || String(opt.subLabel||'').toLocaleLowerCase('ar').includes(q);
  }),[options,q]);

  const updatePosition=()=>{
    const btn=buttonRef.current; if(!btn) return;
    const r=btn.getBoundingClientRect();
    const below=Math.max(90,window.innerHeight-r.bottom-10), above=Math.max(90,r.top-10);
    const openUp=below<190 && above>below;
    const maxH=Math.min(300,openUp?above-8:below-8);
    const width=Math.min(Math.max(r.width,220),window.innerWidth-16);
    const left=Math.min(Math.max(8,r.left),Math.max(8,window.innerWidth-width-8));
    const top=openUp?Math.max(8,r.top-maxH-6):r.bottom+6;
    setPanelStyle({position:'fixed',top:`${top}px`,left:`${left}px`,width:`${width}px`,maxHeight:`${maxH}px`,zIndex:99999});
  };

  useEffect(()=>{
    if(!isOpen)return;
    updatePosition();
    const raf=requestAnimationFrame(updatePosition);
    const move=()=>updatePosition();
    window.addEventListener('resize',move,{passive:true});
    document.addEventListener('scroll',move,true);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',move);document.removeEventListener('scroll',move,true);};
  },[isOpen]);

  useEffect(()=>{
    const outside=e=>{
      const insideButton=containerRef.current?.contains(e.target);
      const insidePanel=panelRef.current?.contains(e.target);
      if(!insideButton&&!insidePanel){setIsOpen(false);setSearchOpen(false);setSearch('');}
    };
    document.addEventListener('pointerdown',outside,true);
    return()=>document.removeEventListener('pointerdown',outside,true);
  },[]);

  useEffect(()=>{if(disabled){setIsOpen(false);setSearchOpen(false);setSearch('');}},[disabled]);
  useEffect(()=>{if(searchOpen){const t=setTimeout(()=>searchRef.current?.focus(),0);return()=>clearTimeout(t);}},[searchOpen]);

  const toggleOpen=()=>{
    if(disabled)return;
    setIsOpen(v=>{
      const next=!v;
      if(!next){setSearch('');setSearchOpen(false);} else {setSearch('');setSearchOpen(false);}
      return next;
    });
  };

  return h('div',{id:`dropdown-wrapper-${id}`,className:`searchable-dropdown-root ${className}`,ref:containerRef},
    label&&h('label',{className:'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1'},label),
    h('button',{ref:buttonRef,type:'button',id,disabled,onClick:toggleOpen,className:`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-xl border transition-all text-right ${isOpen?'border-emerald-500 ring-2 ring-emerald-500/15 bg-white dark:bg-slate-900':'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-300'} ${disabled?'opacity-60 cursor-not-allowed':'cursor-pointer'}`},
      h('div',{className:'flex items-center gap-2 truncate min-w-0'},
        icon&&h('span',{className:'text-slate-400 shrink-0'},icon),
        selectedOption?h('span',{className:'font-semibold text-slate-900 dark:text-slate-100 truncate'},selectedOption.label,selectedOption.badge&&h('span',{className:'mr-2 px-1.5 py-0.5 text-[9px] rounded-full bg-emerald-50 text-emerald-700'},selectedOption.badge)):h('span',{className:'text-slate-400 truncate'},placeholder)
      ),
      h(ChevronDown,{className:`w-4 h-4 shrink-0 transition-transform ${isOpen?'rotate-180 text-emerald-600':'text-slate-400'}`})
    ),
    isOpen&&typeof document!=='undefined'&&createPortal(h('div',{ref:panelRef,id:`dropdown-menu-${id}`,className:'searchable-dropdown-panel flex flex-col overflow-hidden text-right',style:{...panelStyle,zIndex:2147483000},onPointerDown:e=>e.stopPropagation()},
      searchOpen
        ? h('div',{className:'relative mb-1 shrink-0'},
            h(Search,{className:'absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none'}),
            h('input',{ref:searchRef,type:'text',id:`dropdown-search-${id}`,value:search,onChange:e=>setSearch(e.target.value),placeholder:'اكتب للبحث...',className:'w-full pr-8 pl-8 py-2 text-xs rounded-lg border border-emerald-300 dark:border-emerald-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/15'}),
            h('button',{type:'button',onClick:()=>{setSearch('');setSearchOpen(false);},className:'absolute left-2 top-2 p-0.5 rounded text-slate-400 hover:text-slate-700',title:'إغلاق البحث'},h(X,{className:'w-4 h-4'}))
          )
        : h('button',{type:'button',onClick:()=>setSearchOpen(true),className:'mb-1 shrink-0 w-full flex items-center justify-center gap-1.5 px-2 py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800'},h(Search,{className:'w-3.5 h-3.5'}),'بحث في القائمة'),
      onQuickAdd&&h('button',{type:'button',id:`dropdown-quick-add-${id}`,onClick:()=>{setIsOpen(false);setSearchOpen(false);setSearch('');onQuickAdd();},className:'shrink-0 w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 mb-1'},h(Plus,{className:'w-3.5 h-3.5'}),quickAddLabel),
      h('div',{className:'min-h-0 flex-1 overflow-y-auto space-y-0.5 custom-scrollbar'},
        ...(filteredOptions.length===0
          ? [h('div',{className:'p-4 text-center text-xs text-slate-400'},'لا توجد نتائج مطابقة')]
          : filteredOptions.map(opt=>{const selected=String(opt.id)===String(selectedId);return h('button',{key:opt.id,type:'button',id:`dropdown-opt-${id}-${opt.id}`,onClick:()=>{onSelect(opt.id);setIsOpen(false);setSearchOpen(false);setSearch('');},className:`w-full flex items-center justify-between gap-2 px-2.5 py-2 text-xs rounded-lg transition text-right ${selected?'bg-emerald-600 text-white font-bold':'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`},
            h('div',{className:'min-w-0 truncate'},h('div',{className:'truncate'},opt.label),opt.subLabel&&h('div',{className:`text-[9px] truncate ${selected?'text-emerald-100':'text-slate-400'}`},opt.subLabel)),
            selected&&h(Check,{className:'w-3.5 h-3.5 shrink-0'})
          );}))
      )
    ),document.body)
  );
};
