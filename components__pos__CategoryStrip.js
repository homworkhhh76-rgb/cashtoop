import React from 'react';
import {useApp} from './context__AppContext.js?v=7.9.4.134-invoice-filters';
const h=React.createElement;
export function CategoryStrip(){const {categories,selectedCategory,setSelectedCategory}=useApp();return h('div',{className:'ct-rail-categories','aria-label':'تصنيفات الأصناف'},h('button',{type:'button',className:selectedCategory===null?'active':'',onClick:()=>setSelectedCategory(null)},'الكل'),...categories.filter(c=>!c.deletedAt).map(c=>h('button',{type:'button',key:c.id,className:selectedCategory===c.id?'active':'',onClick:()=>setSelectedCategory(selectedCategory===c.id?null:c.id)},c.name)))}
