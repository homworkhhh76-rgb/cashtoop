import {t} from './services__i18n.js?v=7.9.4.136-localization';
import React, { useEffect, useState } from 'react';
import { useApp } from './context__AppContext.js?v=7.9.4.136-localization';
import { SearchableDropdown } from './components__common__Dropdown.js?v=7.9.4.136-localization';
import { printReceiptElement } from './utils__export.js?v=7.9.4.136-localization';
import { Printer, Barcode as BarcodeIcon } from 'lucide-react';
import { code128Geometry } from './utils__code128.js?v=7.9.4.136-localization';
const h = React.createElement;

const BarcodeSvg = ({ value, compact = false }) => {
  const g = code128Geometry(value);
  const height = compact ? 34 : 44;
  return h('svg', {
    viewBox: `0 0 ${g.width} ${height}`,
    width: '100%', height, preserveAspectRatio: 'none',
    role: 'img', 'aria-label': `CODE128 ${g.text}`,
    style: { display:'block', background:'#fff', shapeRendering:'crispEdges' }
  }, ...g.rects.map((r,i)=>h('rect',{key:i,x:r.x,y:0,width:r.width,height,fill:'#000'})));
};

export const BarcodesView = () => {
  const { products, settings, showToast } = useApp();
  const activeProducts = products.filter(p => !p.deletedAt && p.status !== 'archived');
  const [selectedProductId, setSelectedProductId] = useState(activeProducts[0]?.id || '');
  const selectedProduct = activeProducts.find(p => p.id === selectedProductId) || activeProducts[0];
  const [selectedUnitId, setSelectedUnitId] = useState(selectedProduct?.units?.[0]?.id || '');
  const [copies, setCopies] = useState(6);
  const [labelType, setLabelType] = useState('shelf');
  useEffect(() => {
    if (selectedProduct && !selectedProduct.units?.some(u => u.id === selectedUnitId)) setSelectedUnitId(selectedProduct.units?.[0]?.id || '');
  }, [selectedProductId]);
  const selectedUnit = selectedProduct?.units?.find(u => u.id === selectedUnitId) || selectedProduct?.units?.[0];
  const barcodeValue = selectedUnit?.barcodes?.[0] || selectedProduct?.sku || selectedProduct?.internalCode || '1000001';
  const printNow = () => { printReceiptElement('barcode-print-area'); showToast('تم تجهيز باركود CODE128 حقيقي للطباعة', 'success'); };
  const productOptions = activeProducts.map(p => ({ id:p.id, label:p.name, subLabel:p.sku || p.internalCode || 'صنف' }));
  const unitOptions = (selectedProduct?.units || []).map(u => ({ id:u.id, label:u.name, subLabel:`${u.salePrice || 0} ${settings.currencySymbol} · ${u.barcodes?.[0] || 'بدون باركود'}` }));
  return h('div',{id:'barcodes-screen',className:'p-4 sm:p-6 space-y-4 max-w-5xl mx-auto text-right select-none'},
    h('div',{className:'flex items-center justify-end'},h('button',{onClick:printNow,className:'flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold shadow'},h(Printer,{className:'w-4 h-4'}),'طباعة الملصقات')),
    h('div',{className:'grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm'},
      h('div',{className:'sm:col-span-2'},h(SearchableDropdown,{id:'barcode-product',label:t("الصنف:"),options:productOptions,selectedId:selectedProductId,onSelect:(id)=>{setSelectedProductId(id); const p=activeProducts.find(x=>x.id===id);setSelectedUnitId(p?.units?.[0]?.id||'');},placeholder:'ابحث باسم الصنف أو الكود...'})),
      h('div',{},h(SearchableDropdown,{id:'barcode-unit',label:t("الوحدة:"),options:unitOptions,selectedId:selectedUnitId,onSelect:setSelectedUnitId,placeholder:'ابحث عن الوحدة...'})),
      h('div',{},h('label',{className:'text-xs font-bold block mb-1'},'عدد النسخ:'),h('input',{type:'number',min:1,max:100,value:copies,onChange:e=>setCopies(Math.max(1,parseInt(e.target.value)||1)),className:'w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-mono font-bold text-center'}))
    ),
    h('div',{className:'flex items-center gap-2'},
      h('button',{onClick:()=>setLabelType('shelf'),className:`px-3 py-2 rounded-xl text-xs font-bold border ${labelType==='shelf'?'bg-violet-600 text-white border-violet-600':'bg-white border-slate-200'}`},'بطاقة رف'),
      h('button',{onClick:()=>setLabelType('item'),className:`px-3 py-2 rounded-xl text-xs font-bold border ${labelType==='item'?'bg-violet-600 text-white border-violet-600':'bg-white border-slate-200'}`},'ملصق صنف')
    ),
    h('div',{className:'p-4 rounded-2xl bg-slate-50 border border-slate-200'},
      h('div',{className:'flex items-center gap-2 text-xs font-bold text-slate-500 mb-3'},h(BarcodeIcon,{className:'w-4 h-4'}),`معاينة ${copies} ملصق — CODE128 قابل للمسح`),
      h('div',{id:'barcode-print-area',className:'grid grid-cols-2 sm:grid-cols-3 gap-3 bg-white p-2'},
        ...Array.from({length:copies}).map((_,idx)=>h('div',{key:idx,className:`bg-white text-black border border-slate-300 rounded-lg p-2 flex flex-col justify-between text-center ${labelType==='shelf'?'min-h-36':'min-h-28'}`},
          labelType==='shelf'
          ? [h('div',{key:'a'},h('div',{className:'text-[9px] font-bold'},settings.storeName),h('div',{className:'text-[11px] font-black leading-tight'},selectedProduct?.name||'—'),h('div',{className:'text-[9px] text-slate-600'},`الوحدة: ${selectedUnit?.name||'—'}`)), h('div',{key:'b',className:'text-2xl font-black font-mono'},`${Number(selectedUnit?.salePrice||0).toFixed(2)} ${settings.currencySymbol}`), h('div',{key:'c',className:'flex flex-col items-center gap-0.5'},h(BarcodeSvg,{value:barcodeValue}),h('div',{className:'text-[9px] font-mono tracking-wide'},barcodeValue))]
          : [h('div',{key:'a',className:'text-[10px] font-bold leading-tight'},selectedProduct?.name||'—'),h('div',{key:'b',className:'flex justify-center'},h(BarcodeSvg,{value:barcodeValue,compact:true})),h('div',{key:'c',className:'flex justify-between text-[9px] font-mono font-bold'},h('span',{},barcodeValue),h('span',{className:'text-violet-700'},`${selectedUnit?.salePrice||0} ${settings.currencySymbol}`))]
        ))
      )
    )
  );
};
