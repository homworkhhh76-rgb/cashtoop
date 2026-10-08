import React,{useEffect,useRef} from 'react';
import {registerLayer,closeLayerElement} from './hooks__appNavigation.js?v=7.9.4.139-ledger-print';
import {createPortal} from 'react-dom';
export function ModalLayer(props){const root=useRef(null);useEffect(()=>registerLayer(()=>{if(props.onDismiss)props.onDismiss();else closeLayerElement(root.current)}),[]);if(typeof document==='undefined')return null;const match=String(props.className||'').match(/z-\[?(\d+)/);const z=Math.max(1000+Number(match?.[1]||50),Number(props.style?.zIndex)||0);return createPortal(React.createElement('div',{...props,ref:root,role:props.role||'dialog','aria-modal':true,className:`ct-modal-layer ${props.className||''}`,style:{...props.style,zIndex:z}},props.children),document.body)}
