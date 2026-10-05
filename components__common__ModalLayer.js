import React from 'react';
import {createPortal} from 'react-dom';
export function ModalLayer(props){if(typeof document==='undefined')return null;const match=String(props.className||'').match(/z-\[?(\d+)/);const z=Math.max(1000+Number(match?.[1]||50),Number(props.style?.zIndex)||0);return createPortal(React.createElement('div',{...props,role:props.role||'dialog','aria-modal':true,className:`ct-modal-layer ${props.className||''}`,style:{...props.style,zIndex:z}},props.children),document.body)}
