import React from 'react';
import {t} from './services__i18n.js?v=7.9.4.158-web-notifications';
const h=React.createElement;
export function EmptyState({message='لا يوجد سجلات'}) {
 return h('div',{className:'ct-empty-state',role:'status'},
  h('svg',{className:'ct-empty-character',viewBox:'0 0 200 180','aria-hidden':true,focusable:'false'},
   h('circle',{cx:100,cy:94,r:74,fill:'#f5f3ff'}),
   h('ellipse',{cx:100,cy:157,rx:31,ry:5,fill:'#ddd6fe'}),
   h('g',{className:'ct-person-face'},h('rect',{x:67,y:115,width:66,height:33,rx:16,fill:'#7c3aed'}),h('circle',{cx:100,cy:93,r:33,fill:'#ffd4a1'}),h('rect',{x:72,y:61,width:56,height:12,rx:6,fill:'#5b21b6'}),h('rect',{x:80,y:44,width:40,height:22,rx:9,fill:'#8b5cf6'}),h('g',{className:'ct-person-eyes'},h('circle',{cx:88,cy:91,r:5,fill:'#fff'}),h('circle',{cx:112,cy:91,r:5,fill:'#fff'}),h('circle',{cx:88,cy:91,r:2.6,fill:'#513b35'}),h('circle',{cx:112,cy:91,r:2.6,fill:'#513b35'})),h('path',{className:'ct-person-smile',d:'M88 106 Q100 118 112 106',fill:'none',stroke:'#80503c',strokeWidth:3,strokeLinecap:'round'}))),
  h('strong',null,t(message)));
}
