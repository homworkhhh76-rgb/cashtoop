import React from 'react';
import { Package } from 'lucide-react';
import { getProductImageSrc, resolveProductImageUrl, forgetProductImageUrl, ensureProductImageAutoSync } from './services__productImages.js?v=7.9.4.90-cashtop3-search-logo';

export const ProductImage = ({ product, alt='', className='', wrapperClassName='', fallback=null, loading='lazy' }) => {
  const fileId=String(product?.imageTelegramFileId||'').trim();
  const localKey=String(product?.imageData||product?.imageUrl||'');
  const pendingKey=String(product?.imagePendingUpload?'1':'0');
  const [src,setSrc]=React.useState(()=>getProductImageSrc(product));
  const [failed,setFailed]=React.useState(false);

  React.useEffect(()=>{ ensureProductImageAutoSync(); },[]);

  React.useEffect(()=>{
    let alive=true;
    setFailed(false);
    const immediate=getProductImageSrc(product);
    setSrc(immediate);
    if(!fileId) return ()=>{alive=false;};
    resolveProductImageUrl(fileId).then(url=>{if(alive&&url)setSrc(url);}).catch(()=>{});
    return ()=>{alive=false;};
  },[fileId,localKey,pendingKey,product?.imageUpdatedAt]);

  const handleError=()=>{
    if(!fileId||failed){setSrc('');return;}
    setFailed(true);
    forgetProductImageUrl(fileId);
    resolveProductImageUrl(fileId,{force:true}).then(url=>{if(url){setFailed(false);setSrc(url);}}).catch(()=>setSrc(''));
  };

  const defaultFallback = React.createElement('div', {
    className: `${className} rounded-xl border border-slate-200 bg-slate-50 text-slate-300 overflow-hidden`,
    style: { width:'100%', aspectRatio:'1 / 1', display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }
  }, React.createElement(Package, { className: 'w-10 h-10', style:{display:'block',margin:'auto'} }));

  const fallbackNode = fallback || defaultFallback;
  if(!src) return wrapperClassName ? React.createElement('div',{className:wrapperClassName},fallbackNode) : fallbackNode;
  const img=React.createElement('img',{src,alt,className,loading,onError:handleError});
  return wrapperClassName ? React.createElement('div',{className:wrapperClassName},img) : img;
};
