import React from 'react';
import { resolveProductImageUrl, forgetProductImageUrl, peekProductImageUrl } from './services__productImages.js?v=7.9.4.139-ledger-print';

const EMPTY_COMPANY_LOGO = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f8fafc"/><path d="M18 47V25l14-8 14 8v22H18Zm7-6h14V29l-7-4-7 4v12Zm4 0v-8h6v8h-6Z" fill="#cbd5e1"/></svg>`);

function initialCompanyLogo(settings){
  const fileId=String(settings?.logoTelegramFileId||'').trim();
  const source=String(settings?.logoUrl||settings?.logoSourceUrl||'').trim();
  // Never use the packaged Oscar logo as a company-logo fallback.
  if(source && !/(^|\/)brand-logo\.png(?:[?#].*)?$/i.test(source)) return source;
  return (fileId ? peekProductImageUrl(fileId) : '') || EMPTY_COMPANY_LOGO;
}

export const BrandLogoImage=({settings,alt='',className=''})=>{
  const fileId=String(settings?.logoTelegramFileId||'').trim();
  const [src,setSrc]=React.useState(()=>initialCompanyLogo(settings));
  const [retried,setRetried]=React.useState(false);
  React.useEffect(()=>{
    let alive=true;
    setRetried(false);
    setSrc(initialCompanyLogo(settings));
    if(fileId&&!String(settings?.logoUrl||'').startsWith('data:')){
      resolveProductImageUrl(fileId).then(url=>{if(alive&&url)setSrc(url)}).catch(()=>{});
    }
    return()=>{alive=false};
  },[fileId,settings?.logoSourceUrl,settings?.logoUrl,settings?.logoUpdatedAt]);
  const onError=()=>{
    if(fileId&&!retried){
      setRetried(true);
      forgetProductImageUrl(fileId);
      setSrc(EMPTY_COMPANY_LOGO);
      resolveProductImageUrl(fileId,{force:true}).then(url=>url&&setSrc(url)).catch(()=>setSrc(EMPTY_COMPANY_LOGO));
      return;
    }
    setSrc(EMPTY_COMPANY_LOGO);
  };
  return React.createElement('img',{src:src||EMPTY_COMPANY_LOGO,alt,className,onError});
};
