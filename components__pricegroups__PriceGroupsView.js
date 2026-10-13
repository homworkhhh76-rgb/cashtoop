import { EmptyState } from './components__common__EmptyState.js?v=7.9.4.158-web-notifications';
import React, {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {useApp} from './context__AppContext.js?v=7.9.4.158-web-notifications';
import {Search,Plus,Percent,Users,Package,Trash2,Save,RotateCcw,Tag,CheckCircle2,X} from 'lucide-react';

const h=React.createElement;
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const clonePrices=value=>{try{return JSON.parse(JSON.stringify(value||{}))}catch{return {}}};
const cloneGroup=g=>({...g,customerIds:[...(g?.customerIds||[])],unitPrices:clonePrices(g?.unitPrices)});
const calcPercentPrice=(base,group)=>{
  const pct=Math.max(0,n(group?.percentage));
  const mode=group?.percentageMode==='increase'?'increase':'discount';
  const raw=mode==='increase'?base*(1+pct/100):base*(1-Math.min(100,pct)/100);
  return Math.max(0,Math.round(raw));
};
const readManual=(group,productId,unitId)=>{
  const v=group?.unitPrices?.[productId]?.[unitId];
  return v===''||v==null?'':(Number.isFinite(Number(v))?Number(v):'');
};

const PriceGroupModal=({title,subtitle,onClose,children,footer})=>createPortal(
  h('div',{className:'price-group-modal-overlay',onMouseDown:e=>{if(e.target===e.currentTarget)onClose?.();}},
    h('section',{className:'price-group-modal-panel',dir:'rtl',onMouseDown:e=>e.stopPropagation()},
      h('header',{className:'price-group-modal-head'},
        h('div',{className:'min-w-0'},h('h3',null,title),subtitle?h('p',null,subtitle):null),
        h('button',{type:'button',onClick:onClose,'aria-label':'إغلاق'},h(X,{size:20}))
      ),
      h('div',{className:'price-group-modal-body'},children),
      footer?h('footer',{className:'price-group-modal-foot'},footer):null
    )
  ),document.body
);

export function PriceGroupsView(){
  const {settings,updateSettings,customers,products,showToast,activePriceGroupId,setActivePriceGroupId}=useApp();
  const groups=Array.isArray(settings.priceGroups)?settings.priceGroups:[];
  const activeCustomers=(customers||[]).filter(c=>c&&!c.deletedAt&&c.id!=='cust-walkin');
  const activeProducts=(products||[]).filter(p=>p&&!p.deletedAt&&p.status!=='archived');
  const [editing,setEditing]=useState(null);
  const [customerModalOpen,setCustomerModalOpen]=useState(false);
  const [priceModalOpen,setPriceModalOpen]=useState(false);
  const [modalOrigin,setModalOrigin]=useState('editor');
  const [customerSearch,setCustomerSearch]=useState('');
  const [productSearch,setProductSearch]=useState('');
  const [saving,setSaving]=useState(false);

  // While this section is open, pull the tiny realtime settings record frequently so
  // edits made from another device appear on screen without a manual refresh.
  useEffect(()=>{
    let stopped=false,timer=null;
    const tick=async()=>{
      if(stopped)return;
      try{if(navigator.onLine!==false&&document.visibilityState==='visible')await window.OscarCloudSync?.pullRealtimeNow?.({force:true});}catch(_){ }
      if(!stopped)timer=setTimeout(tick,2000);
    };
    timer=setTimeout(tick,250);
    return()=>{stopped=true;if(timer)clearTimeout(timer);};
  },[]);

  const openNew=()=>{setEditing({id:`pg-${Date.now()}`,name:'',percentage:0,percentageMode:'discount',customerIds:[],unitPrices:{},createdAt:new Date().toISOString()});setCustomerModalOpen(false);setPriceModalOpen(false);};
  const openEdit=g=>{setEditing(cloneGroup(g));setCustomerModalOpen(false);setPriceModalOpen(false);};
  const openCustomers=(g=editing,origin='editor')=>{if(!g)return;setEditing(cloneGroup(g));setModalOrigin(origin);setCustomerSearch('');setCustomerModalOpen(true);};
  const openPrices=(g=editing,origin='editor')=>{if(!g)return;setEditing(cloneGroup(g));setModalOrigin(origin);setProductSearch('');setPriceModalOpen(true);};
  const closeCustomerModal=()=>{setCustomerModalOpen(false);if(modalOrigin==='card')setEditing(null);};
  const closePriceModal=()=>{setPriceModalOpen(false);if(modalOrigin==='card')setEditing(null);};
  const filteredCustomers=useMemo(()=>{const q=customerSearch.trim().toLowerCase();return activeCustomers.filter(c=>!q||String(c.name||'').toLowerCase().includes(q)||String(c.phone||'').includes(q));},[activeCustomers,customerSearch]);
  const filteredProducts=useMemo(()=>{const q=productSearch.trim().toLowerCase();return activeProducts.filter(p=>!q||String(p.name||'').toLowerCase().includes(q)||String(p.sku||'').toLowerCase().includes(q)||String(p.internalCode||'').toLowerCase().includes(q)||(p.units||[]).some(u=>(u.barcodes||[]).some(b=>String(b).includes(q))));},[activeProducts,productSearch]);

  const toggleCustomer=id=>setEditing(prev=>{
    if(!prev)return prev;const set=new Set(prev.customerIds||[]);set.has(id)?set.delete(id):set.add(id);return {...prev,customerIds:[...set]};
  });
  const setUnitPrice=(productId,unitId,value)=>setEditing(prev=>{
    if(!prev)return prev;const all=clonePrices(prev.unitPrices);all[productId]={...(all[productId]||{})};
    if(value===''||value==null){delete all[productId][unitId];if(!Object.keys(all[productId]).length)delete all[productId];}
    else{all[productId][unitId]=Math.max(0,Math.round(n(value)));}
    return {...prev,unitPrices:all};
  });
  const fillByPercentage=()=>setEditing(prev=>{
    if(!prev)return prev;const all={};for(const p of activeProducts){for(const u of (p.units||[])){const base=n(u.salePrice??p.sellingPrice);if(!all[p.id])all[p.id]={};all[p.id][u.id]=calcPercentPrice(base,prev);}}return {...prev,unitPrices:all};
  });
  const clearManualPrices=()=>setEditing(prev=>prev?{...prev,unitPrices:{}}:prev);

  const normalizeGroup=(group)=>{
    const name=String(group?.name||'').trim();
    let percentage=Math.max(0,n(group?.percentage));
    if(group?.percentageMode!=='increase')percentage=Math.min(100,percentage);else percentage=Math.min(500,percentage);
    return {...group,name,percentage,percentageMode:group?.percentageMode==='increase'?'increase':'discount',customerIds:[...new Set(group?.customerIds||[])],unitPrices:clonePrices(group?.unitPrices),updatedAt:new Date().toISOString()};
  };
  const pushPriceGroupsImmediately=()=>{
    try{window.OscarCloudSync?.requestSync?.(5);}catch(_){ }
    Promise.resolve().then(()=>window.OscarCloudSync?.syncNow?.({force:true})).then(()=>window.OscarCloudSync?.pullRealtimeNow?.({force:true})).catch(()=>{});
    try{window.dispatchEvent(new CustomEvent('oscar:price-groups-changed',{detail:{at:Date.now()}}));}catch(_){ }
  };
  const persistGroup=async(group,{closeEditor=false}={})=>{
    const normalized=normalizeGroup(group);
    if(!normalized.name){showToast('اكتب اسم مجموعة الأسعار','warning');return null;}
    setSaving(true);
    try{
      const selected=new Set(normalized.customerIds);
      let found=false;
      const next=groups.map(g=>{
        if(g.id===normalized.id){found=true;return normalized;}
        if(!selected.size)return g;
        return {...g,customerIds:(g.customerIds||[]).filter(id=>!selected.has(id)),updatedAt:new Date().toISOString()};
      });
      if(!found)next.unshift(normalized);
      await updateSettings({priceGroups:next,priceGroupsUpdatedAt:new Date().toISOString()});
      setEditing(closeEditor?null:normalized);
      pushPriceGroupsImmediately();
      return normalized;
    }finally{setSaving(false);}
  };
  const saveMain=async e=>{e.preventDefault();if(!editing)return;const saved=await persistGroup(editing,{closeEditor:true});if(saved){setCustomerSearch('');setProductSearch('');}};
  const saveCustomerModal=async()=>{
    if(!editing)return;
    const exists=groups.some(g=>g.id===editing.id);
    if(exists){const saved=await persistGroup(editing,{closeEditor:modalOrigin==='card'});if(!saved)return;}
    setCustomerModalOpen(false);
    if(!exists&&modalOrigin==='card')setEditing(null);
  };
  const savePriceModal=async()=>{
    if(!editing)return;
    const exists=groups.some(g=>g.id===editing.id);
    if(exists){const saved=await persistGroup(editing,{closeEditor:modalOrigin==='card'});if(!saved)return;}
    setPriceModalOpen(false);
    if(!exists&&modalOrigin==='card')setEditing(null);
  };
  const remove=async g=>{
    if(!confirm(`حذف مجموعة الأسعار «${g.name}»؟`))return;
    const next=groups.filter(x=>x.id!==g.id);
    await updateSettings({priceGroups:next,priceGroupsUpdatedAt:new Date().toISOString()});
    pushPriceGroupsImmediately();
    if(activePriceGroupId===g.id)setActivePriceGroupId('');
    if(editing?.id===g.id)setEditing(null);
  };

  const customerModal=customerModalOpen&&editing?h(PriceGroupModal,{
    title:`عملاء المجموعة — ${editing.name||'مجموعة جديدة'}`,
    subtitle:'ابحث وحدد العملاء. العميل لا يكون إلا في مجموعة أسعار واحدة.',
    onClose:closeCustomerModal,
    footer:h(React.Fragment,null,
      h('button',{type:'button',className:'price-group-modal-cancel',onClick:closeCustomerModal},'إلغاء'),
      h('button',{type:'button',disabled:saving,className:'price-group-modal-save',onClick:saveCustomerModal},h(Save,{size:16}),saving?'جاري الحفظ...':'حفظ العملاء')
    )
  },h(React.Fragment,null,
    h('div',{className:'price-group-modal-search'},h(Search,{size:18}),h('input',{autoFocus:true,value:customerSearch,onChange:e=>setCustomerSearch(e.target.value),placeholder:'بحث باسم العميل أو رقم الهاتف...'})),
    h('div',{className:'price-group-customer-list'},...filteredCustomers.map(c=>{const checked=(editing.customerIds||[]).includes(c.id);const currentGroup=groups.find(g=>g.id!==editing.id&&(g.customerIds||[]).includes(c.id));return h('button',{key:c.id,type:'button',onClick:()=>toggleCustomer(c.id),className:'price-group-select-row'+(checked?' selected':'')},h('span',{className:'price-group-check'},checked?'✓':''),h('span',{className:'price-group-select-copy'},h('b',null,c.name),h('small',null,currentGroup?`حالياً ضمن: ${currentGroup.name}`:(c.phone||'بدون رقم هاتف'))));}),!filteredCustomers.length?h('div',{className:'price-group-modal-empty'},'لا يوجد عملاء مطابقون للبحث.'):null)
  )):null;

  const priceModal=priceModalOpen&&editing?h(PriceGroupModal,{
    title:`أسعار الوحدات — ${editing.name||'مجموعة جديدة'}`,
    subtitle:'ابحث عن الصنف ثم ضع سعراً خاصاً لأي وحدة. اترك الحقل فارغاً لاستخدام السعر الأساسي للعميل المسجل.',
    onClose:closePriceModal,
    footer:h(React.Fragment,null,
      h('button',{type:'button',className:'price-group-modal-cancel',onClick:closePriceModal},'إلغاء'),
      h('button',{type:'button',disabled:saving,className:'price-group-modal-save',onClick:savePriceModal},h(Save,{size:16}),saving?'جاري الحفظ...':'حفظ الأسعار')
    )
  },h(React.Fragment,null,
    h('div',{className:'price-group-modal-tools'},
      h('div',{className:'price-group-modal-search'},h(Search,{size:18}),h('input',{autoFocus:true,value:productSearch,onChange:e=>setProductSearch(e.target.value),placeholder:'بحث باسم الصنف أو الكود أو الباركود...'})),
      h('div',{className:'price-group-modal-tool-buttons'},h('button',{type:'button',onClick:fillByPercentage},h(Percent,{size:15}),'تعبئة حسب النسبة'),h('button',{type:'button',onClick:clearManualPrices},h(RotateCcw,{size:15}),'مسح الأسعار'))
    ),
    h('div',{className:'price-group-product-list'},...filteredProducts.slice(0,150).map(p=>h('article',{key:p.id,className:'price-group-product-card'},h('div',{className:'price-group-product-title'},p.name),h('div',{className:'price-group-unit-grid'},...(p.units||[]).map(u=>{const base=n(u.salePrice??p.sellingPrice);const auto=calcPercentPrice(base,editing);const manual=readManual(editing,p.id,u.id);return h('label',{key:u.id,className:'price-group-unit-edit'},h('span',{className:'price-group-unit-name'},u.name),h('small',null,`أساسي ${base} • نسبة ${auto}`),h('input',{type:'number',min:0,step:1,value:manual,placeholder:String(auto),onChange:e=>setUnitPrice(p.id,u.id,e.target.value)}));}))))),
    filteredProducts.length>150?h('div',{className:'price-group-modal-note'},'تم عرض أول 150 صنف. استخدم البحث للوصول لبقية الأصناف.'):null,
    !filteredProducts.length?h(EmptyState,{message:'لا يوجد منتجات'}):null
  )):null;

  return h(React.Fragment,null,
    h('div',{className:'price-groups-shell p-3 sm:p-5 space-y-4 text-right'},
      h('div',{className:'flex flex-wrap items-center justify-between gap-3'},
        h('div',null,h('h2',{className:'text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2'},h(Percent,{className:'w-5 h-5 text-violet-600'}),'مجموعات الأسعار والعملاء'),h('p',{className:'text-xs text-slate-500 mt-1'},'النسبة تُقرب لرقم صحيح، والأسعار الخاصة للعميل المسجل تتقدم على النسبة.')),
        h('button',{type:'button',onClick:openNew,className:'px-4 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-black inline-flex items-center gap-2 shadow-sm'},h(Plus,{className:'w-4 h-4'}),'مجموعة جديدة')
      ),
      h('div',{className:'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'},
        ...groups.map(g=>h('div',{key:g.id,className:`rounded-2xl border p-4 bg-white shadow-sm ${activePriceGroupId===g.id?'border-violet-500 ring-2 ring-violet-100':'border-slate-200'}`},
          h('div',{className:'flex items-start justify-between gap-2'},h('div',{className:'min-w-0'},h('div',{className:'font-black text-sm truncate'},g.name),h('div',{className:'text-[11px] text-violet-700 font-bold mt-1'},`${g.percentageMode==='increase'?'زيادة':'خصم'} ${n(g.percentage)}% • تقريب لرقم صحيح`)),activePriceGroupId===g.id?h('span',{className:'text-[9px] bg-violet-600 text-white rounded-full px-2 py-1 font-black'},'مفعلة'):null),
          h('div',{className:'grid grid-cols-2 gap-2 mt-3 text-[10px]'},h('div',{className:'rounded-lg bg-slate-50 p-2'},h(Users,{className:'w-3.5 h-3.5 text-violet-600 inline ml-1'}),`${(g.customerIds||[]).length} عميل`),h('div',{className:'rounded-lg bg-slate-50 p-2'},h(Tag,{className:'w-3.5 h-3.5 text-violet-600 inline ml-1'}),`${Object.values(g.unitPrices||{}).reduce((s,row)=>s+Object.keys(row||{}).length,0)} سعر خاص`)),
          h('div',{className:'price-group-card-actions'},
            h('button',{type:'button',onClick:()=>openEdit(g)},'تعديل المجموعة'),
            h('button',{type:'button',onClick:()=>openCustomers(g,'card')},'العملاء'),
            h('button',{type:'button',onClick:()=>openPrices(g,'card')},'الأسعار'),
            h('button',{type:'button',onClick:()=>setActivePriceGroupId(activePriceGroupId===g.id?'':g.id)},activePriceGroupId===g.id?'إلغاء التفعيل':'تفعيل'),
            h('button',{type:'button',onClick:()=>remove(g),'aria-label':'حذف المجموعة'},h(Trash2,{size:16}))
          )
        )),
        !groups.length?h(EmptyState,{message:'لا يوجد مجموعات أسعار'}):null
      ),
      editing&&!customerModalOpen&&!priceModalOpen?h('form',{onSubmit:saveMain,className:'rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden'},
        h('div',{className:'p-4 sm:p-5 border-b border-slate-100 bg-violet-50/40 flex items-center justify-between gap-3'},h('div',null,h('h3',{className:'font-black text-base'},groups.some(g=>g.id===editing.id)?'تعديل مجموعة الأسعار':'إنشاء مجموعة أسعار جديدة'),h('p',{className:'text-[11px] text-slate-500 mt-1'},'احفظ الاسم والنسبة، وافتح العملاء والأسعار كل واحد في نافذة مستقلة.')),h(CheckCircle2,{className:'w-6 h-6 text-violet-600'})),
        h('div',{className:'p-4 sm:p-5 space-y-5'},
          h('div',{className:'grid grid-cols-1 md:grid-cols-3 gap-3'},
            h('label',{className:'text-xs font-bold text-slate-700'},'اسم المجموعة',h('input',{required:true,value:editing.name,onChange:e=>setEditing({...editing,name:e.target.value}),placeholder:'مثال: جملة 30%',className:'mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-violet-500'})),
            h('label',{className:'text-xs font-bold text-slate-700'},'نوع النسبة',h('select',{value:editing.percentageMode||'discount',onChange:e=>setEditing({...editing,percentageMode:e.target.value}),className:'mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm'},h('option',{value:'discount'},'خصم من سعر البيع'),h('option',{value:'increase'},'زيادة على سعر البيع'))),
            h('label',{className:'text-xs font-bold text-slate-700'},'النسبة المئوية %',h('input',{type:'number',min:0,max:editing.percentageMode==='increase'?500:100,step:'1',value:editing.percentage,onChange:e=>setEditing({...editing,percentage:e.target.value}),className:'mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono'}))
          ),
          h('div',{className:'price-group-editor-shortcuts'},
            h('button',{type:'button',onClick:()=>openCustomers(editing,'editor')},h(Users,{size:18}),h('span',null,h('b',null,'تعديل العملاء'),h('small',null,`${(editing.customerIds||[]).length} عميل محدد`))),
            h('button',{type:'button',onClick:()=>openPrices(editing,'editor')},h(Package,{size:18}),h('span',null,h('b',null,'تعديل الأسعار'),h('small',null,`${Object.values(editing.unitPrices||{}).reduce((s,row)=>s+Object.keys(row||{}).length,0)} سعر خاص`)))
          ),
          h('div',{className:'rounded-xl border border-violet-100 bg-violet-50/50 p-3 text-[11px] leading-6 text-violet-900'},h('strong',null,'طريقة التطبيق: '),'العميل المضاف للمجموعة يأخذ السعر الخاص الذي وضعته للوحدة. وإذا لم يكن العميل مضافاً للمجموعة تطبق النسبة تلقائياً ويقرب السعر لأقرب رقم صحيح.'),
          h('div',{className:'flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-100'},h('button',{type:'button',onClick:()=>setEditing(null),className:'px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold'},'إلغاء'),h('button',{type:'submit',disabled:saving,className:'px-5 py-2 rounded-lg bg-violet-600 text-white text-xs font-black inline-flex items-center gap-2 disabled:opacity-60'},h(Save,{className:'w-4 h-4'}),saving?'جاري الحفظ...':'حفظ المجموعة'))
        )
      ):null
    ),
    customerModal,
    priceModal
  );
}
