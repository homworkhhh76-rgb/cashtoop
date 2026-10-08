import React,{useState,useRef,useEffect} from 'react';
import {createPortal} from 'react-dom';
import {Languages,Check,X} from 'lucide-react';
import {languages,useLanguage,setLanguage,t} from './services__i18n.js?v=7.9.4.139-ledger-print';
import {registerLayer} from './hooks__appNavigation.js?v=7.9.4.139-ledger-print';
const h=React.createElement;
export function LanguagePicker(){
 const language=useLanguage();const [open,setOpen]=useState(false);const ref=useRef(null);const [style,setStyle]=useState({});
 useEffect(()=>{if(!open)return;const r=ref.current.getBoundingClientRect();setStyle({top:r.bottom+8,left:Math.max(8,Math.min(innerWidth-228,r.right-220))});const unregister=registerLayer(()=>setOpen(false));const esc=e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false)}};window.addEventListener('keydown',esc);return()=>{unregister();window.removeEventListener('keydown',esc)}},[open]);
 return h(React.Fragment,null,h('button',{ref,type:'button',className:'oscar-header-icon ct-language-button','aria-label':t('اللغة'),title:t('اللغة'),'aria-expanded':open,onClick:()=>setOpen(v=>!v)},h(Languages,{size:21})),open&&createPortal(h('div',{className:'ct-language-backdrop',onClick:()=>setOpen(false)},h('div',{className:'ct-language-panel',style,role:'dialog','aria-modal':true,onClick:e=>e.stopPropagation()},h('div',{className:'ct-language-heading'},h('strong',null,t('اللغة')),h('button',{type:'button','aria-label':t('إغلاق'),onClick:()=>setOpen(false)},h(X,{size:18}))),...languages.map(lang=>h('button',{type:'button',key:lang.id,lang:lang.id,dir:lang.dir,'aria-pressed':language===lang.id,onClick:()=>{setLanguage(lang.id);setOpen(false)}},lang.label,language===lang.id&&h(Check,{size:17}))))),document.body));
}
