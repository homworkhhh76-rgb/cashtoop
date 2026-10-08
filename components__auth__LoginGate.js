import {LanguagePicker} from './components__common__LanguagePicker.js?v=7.9.4.139-ledger-print';
import {t} from './services__i18n.js?v=7.9.4.139-ledger-print';
import React, { useEffect, useRef, useState } from 'react';
import { Upload, ShieldCheck, Building2, FileText, X, ChevronDown, Search, Image as ImageIcon, MapPin, Phone, Check, LogIn, Headphones } from 'lucide-react';
import { DEFAULT_LOGO_DATA_URL } from './brand__logo.js?v=7.9.4.139-ledger-print';
import { TRIAL_DATABASE, TRIAL_LIMITS } from './trial__config.js?v=7.9.4.139-ledger-print';

const h = React.createElement;
const CURRENCY_COUNTRY={ILS:'PS',USD:'US',JOD:'JO',EGP:'EG',SAR:'SA',AED:'AE',TRY:'TR',EUR:'EU',GBP:'GB',AUD:'AU',CAD:'CA',CHF:'CH',CNY:'CN',JPY:'JP',INR:'IN',KWD:'KW',QAR:'QA',BHD:'BH',OMR:'OM',LBP:'LB',SYP:'SY',IQD:'IQ',YER:'YE',MAD:'MA',TND:'TN',DZD:'DZ',LYD:'LY',SDG:'SD',MRU:'MR',SOS:'SO',DJF:'DJ',KMF:'KM',AFN:'AF',ALL:'AL',AMD:'AM',ANG:'CW',AOA:'AO',ARS:'AR',AWG:'AW',AZN:'AZ',BAM:'BA',BBD:'BB',BDT:'BD',BGN:'BG',BIF:'BI',BMD:'BM',BND:'BN',BOB:'BO',BRL:'BR',BSD:'BS',BTN:'BT',BWP:'BW',BYN:'BY',BZD:'BZ',CDF:'CD',CLP:'CL',COP:'CO',CRC:'CR',CUP:'CU',CVE:'CV',CZK:'CZ',DKK:'DK',DOP:'DO',ERN:'ER',ETB:'ET',FJD:'FJ',FKP:'FK',GEL:'GE',GHS:'GH',GIP:'GI',GMD:'GM',GNF:'GN',GTQ:'GT',GYD:'GY',HKD:'HK',HNL:'HN',HTG:'HT',HUF:'HU',IDR:'ID',IRR:'IR',ISK:'IS',JMD:'JM',KES:'KE',KGS:'KG',KHR:'KH',KPW:'KP',KRW:'KR',KYD:'KY',KZT:'KZ',LAK:'LA',LKR:'LK',LRD:'LR',LSL:'LS',MDL:'MD',MGA:'MG',MKD:'MK',MMK:'MM',MNT:'MN',MOP:'MO',MUR:'MU',MVR:'MV',MWK:'MW',MXN:'MX',MYR:'MY',MZN:'MZ',NAD:'NA',NGN:'NG',NIO:'NI',NOK:'NO',NPR:'NP',NZD:'NZ',PAB:'PA',PEN:'PE',PGK:'PG',PHP:'PH',PKR:'PK',PLN:'PL',PYG:'PY',RON:'RO',RSD:'RS',RUB:'RU',RWF:'RW',SBD:'SB',SCR:'SC',SEK:'SE',SGD:'SG',SHP:'SH',SLE:'SL',SRD:'SR',SSP:'SS',STN:'ST',SZL:'SZ',THB:'TH',TJS:'TJ',TMT:'TM',TOP:'TO',TTD:'TT',TWD:'TW',TZS:'TZ',UAH:'UA',UGX:'UG',UYU:'UY',UZS:'UZ',VES:'VE',VND:'VN',VUV:'VU',WST:'WS',XAF:'CM',XCD:'AG',XOF:'SN',XPF:'PF',ZAR:'ZA',ZMW:'ZM',ZWG:'ZW'};
const PREFERRED_CURRENCIES=['ILS','USD','JOD','EGP','SAR','AED','TRY','EUR','GBP','KWD','QAR','BHD','OMR'];
const CURRENCY_NAMES={ILS:'شيكل إسرائيلي جديد',USD:'دولار أمريكي',JOD:'دينار أردني',EGP:'جنيه مصري',SAR:'ريال سعودي',AED:'درهم إماراتي',TRY:'ليرة تركية',EUR:'يورو',GBP:'جنيه إسترليني'};
const CURRENCY_SYMBOLS={ILS:'₪',USD:'$',JOD:'د.أ',EGP:'ج.م',SAR:'ر.س',AED:'د.إ',TRY:'₺',EUR:'€',GBP:'£',KWD:'د.ك',QAR:'ر.ق',BHD:'د.ب',OMR:'ر.ع'};
const CURRENCY_DISPLAY=(()=>{try{return new Intl.DisplayNames(['ar'],{type:'currency'});}catch(_){return null;}})();
const CURRENCY_CODES=(()=>{try{return [...new Set([...PREFERRED_CURRENCIES,...Intl.supportedValuesOf('currency')])].filter(c=>!c.startsWith('X')||['XAF','XCD','XOF','XPF'].includes(c));}catch(_){return Object.keys(CURRENCY_COUNTRY);}})();
const CURRENCIES=CURRENCY_CODES.map(code=>{let symbol=code;try{symbol=new Intl.NumberFormat('en',{style:'currency',currency:code,currencyDisplay:'narrowSymbol'}).formatToParts(0).find(p=>p.type==='currency')?.value||code;}catch(_){}return{code,name:CURRENCY_NAMES[code]||(CURRENCY_DISPLAY?.of(code)||code),symbol:CURRENCY_SYMBOLS[code]||symbol,country:CURRENCY_COUNTRY[code]||''};}).sort((a,b)=>{const x=PREFERRED_CURRENCIES.indexOf(a.code),y=PREFERRED_CURRENCIES.indexOf(b.code);if(x>=0||y>=0)return(x<0?999:x)-(y<0?999:y);return a.name.localeCompare(b.name,'ar');});
const COUNTRIES = [
  {code:'PS',name:'فلسطين',dial:'+970'},{code:'JO',name:'الأردن',dial:'+962'},{code:'LB',name:'لبنان',dial:'+961'},
  {code:'SY',name:'سوريا',dial:'+963'},{code:'IQ',name:'العراق',dial:'+964'},{code:'KW',name:'الكويت',dial:'+965'},
  {code:'BH',name:'البحرين',dial:'+973'},{code:'QA',name:'قطر',dial:'+974'},{code:'AE',name:'الإمارات',dial:'+971'},
  {code:'OM',name:'عُمان',dial:'+968'},{code:'YE',name:'اليمن',dial:'+967'},{code:'SA',name:'السعودية',dial:'+966'},
  {code:'EG',name:'مصر',dial:'+20'},{code:'SD',name:'السودان',dial:'+249'},{code:'SO',name:'الصومال',dial:'+252'},
  {code:'DJ',name:'جيبوتي',dial:'+253'},{code:'KM',name:'جزر القمر',dial:'+269'},{code:'LY',name:'ليبيا',dial:'+218'},
  {code:'TN',name:'تونس',dial:'+216'},{code:'DZ',name:'الجزائر',dial:'+213'},{code:'MA',name:'المغرب',dial:'+212'},
  {code:'MR',name:'موريتانيا',dial:'+222'},
];
const flag = code => {
  if (code === 'EU') return '🇪🇺';
  return String(code||'').toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
};
const normalizeText = v => String(v||'').toLowerCase().normalize('NFD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').trim();
const randomId = prefix => `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const safeFilePart = value => String(value||'شركة-كاش توب 3').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim().slice(0,80) || 'شركة-كاش توب 3';
const dataUrlFromImage = (file, maxSide=700, quality=.88) => new Promise((resolve,reject)=>{
  if(!file){resolve('');return;}
  if(!/^image\/(png|jpe?g|webp)$/i.test(file.type||'')){reject(new Error('اختر صورة بصيغة PNG أو JPG أو WEBP.'));return;}
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('تعذر قراءة الصورة.'));
  reader.onload=()=>{
    const img=new Image();
    img.onerror=()=>reject(new Error('الصورة غير صالحة.'));
    img.onload=()=>{
      const scale=Math.min(1,maxSide/Math.max(img.width||1,img.height||1));
      const w=Math.max(1,Math.round(img.width*scale)),hh=Math.max(1,Math.round(img.height*scale));
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=hh;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,hh);
      resolve(canvas.toDataURL('image/webp',quality));
    };
    img.src=reader.result;
  };
  reader.readAsDataURL(file);
});

const Picker = ({kind, value, onChange, options, open, setOpen, query, setQuery}) => {
  const selected=options.find(x=>(kind==='country'?x.dial:x.code)===value)||options[0];
  const filtered=options.filter(x=>normalizeText(`${x.name} ${x.code} ${x.dial||''}`).includes(normalizeText(query)));
  return h('div',{className:`auth2-picker ${kind==='country'?'auth2-country-picker':''}`},
    h('button',{type:'button',className:'auth2-select-trigger',onClick:()=>setOpen(!open),'aria-expanded':open},
      h('span',{className:'picker-main'},
        h('span',{className:'auth2-flag'},flag(selected.country||selected.code)),
        h('span',{className:'picker-copy'},h('strong',null,selected.name),h('small',null,kind==='country'?selected.dial:`${selected.code} · ${selected.symbol}`))
      ),h(ChevronDown,{className:'icon'})
    ),
    open?h('div',{className:'auth2-select-menu'},
      h('div',{className:'auth2-select-search'},h(Search,{className:'icon'}),h('input',{autoFocus:true,value:query,onChange:e=>setQuery(e.target.value),placeholder:kind==='country'?'ابحث عن الدولة...':'ابحث عن العملة...'})),
      h('div',{className:'auth2-select-options'},...filtered.map(item=>h('button',{key:kind==='country'?item.dial:item.code,type:'button',className:kind==='country'?'auth2-country-option':'currency-option','aria-selected':(kind==='country'?item.dial:item.code)===value,onClick:()=>{onChange(kind==='country'?item.dial:item.code);setOpen(false);setQuery('');}},
        h('span',{className:'auth2-option-main'},h('span',{className:'auth2-flag'},flag(item.country||item.code)),h('span',{className:'auth2-option-copy'},h('strong',null,item.name),h('small',null,kind==='country'?item.dial:`${item.code} · ${item.symbol}`))),
        (kind==='country'?item.dial:item.code)===value?h(Check,{className:'icon'}):null
      )))
    ):null
  );
};

export const LoginGate=({children})=>{
  const A=()=>window.OscarActivation;
  const [runtime,setRuntime]=useState(()=>A()?.readRuntime?.()||null);
  const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const [trialOpen,setTrialOpen]=useState(false),[trialBusy,setTrialBusy]=useState(false);
  const [companyName,setCompanyName]=useState(''),[address,setAddress]=useState(''),[phone,setPhone]=useState('');
  const [dial,setDial]=useState('+970'),[currency,setCurrency]=useState('ILS'),[logo,setLogo]=useState('');
  const [countryOpen,setCountryOpen]=useState(false),[currencyOpen,setCurrencyOpen]=useState(false),[countryQuery,setCountryQuery]=useState(''),[currencyQuery,setCurrencyQuery]=useState('');
  const inputRef=useRef(null),logoRef=useRef(null);

  useEffect(()=>{
    if(!trialOpen)return;
    const timer=setTimeout(()=>{
      document.querySelector('.auth2-trial')?.scrollIntoView?.({behavior:'smooth',block:'start'});
    },60);
    return()=>clearTimeout(timer);
  },[trialOpen]);

  useEffect(()=>{
    if(!runtime)return;
    let cancelled=false,checking=false;
    const verifyCompanySilently=async()=>{
      if(cancelled||checking||navigator.onLine===false)return;
      checking=true;
      try{
        const fake={...runtime,app:A()?.constants?.APP_TAG,database:A()?.readDatabaseAccess?.(runtime.companyId)||runtime.database};
        await A()?.verifyCompanyAccessRemote?.(fake);
      }catch(e){
        if(cancelled)return;
        const msg=String(e?.message||e);
        if(/تم إيقاف مفتاح الشركة|انتهت مدة تفعيل الشركة|لا يطابق مفتاح الشركة|مفتاح الشركة غير مسجل/.test(msg)){
          A()?.clearRuntime?.();setRuntime(null);setError(msg);
        }
      }finally{checking=false;}
    };
    verifyCompanySilently();window.addEventListener('online',verifyCompanySilently);
    return()=>{cancelled=true;window.removeEventListener('online',verifyCompanySilently);};
  },[runtime?.companyId,runtime?.fileId]);

  const handleActivationFile=async f=>{
    if(!f)return;
    if(!/\.mzauth$/i.test(f.name||'')){setError('ملف غير مدعوم، يرجى اختيار ملف تفعيل بصيغة .mzauth');return;}
    setFile(f);setError('');setSuccess('');
    try{await A().primeActivationFile(f);}catch(err){setError(String(err?.message||err));}
  };
  const open=async()=>{
    if(!file){setError('أرفق ملف التفعيل أولاً لتسجيل الدخول.');return;}
    setBusy(true);setError('');setSuccess('');
    try{
      const payload=await A().parseActivationFile(file);
      const verified=await A().verifyPayload(payload,{allowOffline:true});
      const accessStatus=verified?.access?.status||payload.status;
      const accessExpiry=verified?.access?.endAt||verified?.access?.expiresAt||payload.expiresAt||'';
      const effective=verified?.account||verified?.access?.trialProfile||verified?.access?{
        ...payload,
        status:accessStatus,
        expiresAt:accessExpiry,
        account:verified?.account?{...(payload.account||{}),...verified.account}:payload.account,
        permissions:verified?.account?.permissions??payload.permissions,
        trialProfile:verified?.access?.trialProfile?{...(payload.trialProfile||{}),...verified.access.trialProfile}:payload.trialProfile
      }:payload;
      const rt=A().activatePayload(effective);window.OscarCloudSync?.resetForTenant?.();setRuntime(rt);
    }catch(e){setError(String(e?.message||e||'تعذر فتح ملف الدخول.'));}finally{setBusy(false);}
  };

  const createTrial=async e=>{
    e?.preventDefault?.();
    if(!companyName.trim()){setError('أدخل اسم الشركة.');return;}
    if(!address.trim()){setError('أدخل عنوان الشركة أو موقعها.');return;}
    if(!phone.trim()){setError('أدخل رقم الهاتف.');return;}
    setTrialBusy(true);setError('');setSuccess('');
    try{
      const now=new Date();
      const companyId=randomId('TRIAL').toUpperCase();
      const companyKey=`TRIAL-${Math.random().toString(36).slice(2,8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const managerId=randomId('MGR').toUpperCase();
      const authVersion=randomId('AUTH').toUpperCase();
      const curr=CURRENCIES.find(x=>x.code===currency)||CURRENCIES[0];
      const manager={id:managerId,name:'مدير النظام',displayName:'مدير النظام',role:'admin',roleName:'مدير النظام',system:true,active:true,permissions:['*'],authVersion,authPolicyVersion:2,createdAt:now.toISOString(),updatedAt:now.toISOString()};
      const trialProfile={companyName:companyName.trim(),address:address.trim(),phone:`${dial} ${phone.trim()}`.trim(),phoneCode:dial,currency:curr.code,currencySymbol:curr.symbol,logo:logo||DEFAULT_LOGO_DATA_URL,createdAt:now.toISOString()};
      const checkoutDraft={
        version:1,createdAt:now.toISOString(),companyId,tenantId:companyId,companyKey,manager,
        trialProfile,trialLimits:{...TRIAL_LIMITS},database:{...TRIAL_DATABASE},amount:20,currency:'ILS',currencySymbol:'₪'
      };
      localStorage.setItem('oscar_trial_checkout_draft_v1',JSON.stringify(checkoutDraft));
      location.href='./trial-payment.html';
    }catch(err){setError(String(err?.message||err||'تعذر تجهيز طلب الحساب.'));setTrialBusy(false);}
  };

  if(runtime)return children;
  const curr=CURRENCIES.find(x=>x.code===currency)||CURRENCIES[0];
  return h('main',{className:'auth2-view'},h('div',{className:'ct-auth-language'},h(LanguagePicker)),
    h('section',{className:'auth2-card','aria-labelledby':'loginTitle'},
      h('div',{className:'auth2-brand'},h('img',{className:'brand-logo-img',src:DEFAULT_LOGO_DATA_URL,alt:'شعار كاش توب 3'}),h('div',null,h('div',{className:'auth2-brand-name'},'كاش توب 3'),h('div',{className:'auth2-brand-sub'},t("نظامك المحاسبي في مكان واحد")))),
      h('div',{className:'auth2-intro'},h('h1',{id:'loginTitle'},t("مرحباً بك في كاش توب 3")),h('p',null,t("أدر مبيعاتك وحساباتك ومخزونك بسهولة من مكان واحد."))),
      h('div',{className:'auth2-section-title'},h(ShieldCheck,{className:'icon'}),h('span',null,t("تسجيل الدخول بواسطة ملف التفعيل"))),
      !file?h('div',{className:'auth2-dropzone',role:'button',tabIndex:0,onClick:()=>inputRef.current?.click(),onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inputRef.current?.click();}},onDragOver:e=>{e.preventDefault();e.currentTarget.classList.add('dragging');},onDragLeave:e=>e.currentTarget.classList.remove('dragging'),onDrop:e=>{e.preventDefault();e.currentTarget.classList.remove('dragging');handleActivationFile(e.dataTransfer.files?.[0]);}},
        h('div',{className:'auth2-drop-icon'},h(Upload,{className:'icon'})),h('strong',null,t("أرفق ملف التفعيل الخاص بحسابك")),h('p',null,t("اختر ملف التفعيل .mzauth من جهازك للدخول إلى النظام.")),h('span',{className:'auth2-file-button'},t("اختيار ملف التفعيل"))):null,
      h('input',{ref:inputRef,type:'file',accept:'.mzauth',hidden:true,onChange:e=>handleActivationFile(e.target.files?.[0])}),
      file?h('div',{className:'auth2-file-ready'},h('div',{className:'auth2-file-main'},h('span',{className:'auth2-file-icon'},h(FileText,{className:'icon'})),h('div',null,h('strong',null,file.name),h('small',null,t("جاهز للتحقق")))),h('button',{type:'button',className:'icon-btn',onClick:()=>{setFile(null);setError('');if(inputRef.current)inputRef.current.value='';},'aria-label':t("إزالة ملف التفعيل")},h(X,{className:'icon'}))):null,
      file?h('button',{type:'button',className:'auth2-primary',disabled:busy,onClick:open},busy?h('span',{className:'spinner'}):h(LogIn,{className:'icon'}),h('span',null,busy?t("جارٍ تسجيل الدخول"):t("تسجيل الدخول"))):null,
      error?h('div',{className:'form-error',role:'alert'},error):null,
      success?h('div',{className:'auth2-success'},success):null,
      h('div',{className:'auth2-divider'},h('span',null,t("أو"))),
      h('button',{type:'button',className:'auth2-outline','aria-expanded':trialOpen,onClick:()=>{setTrialOpen(v=>!v);setError('');setCountryOpen(false);setCurrencyOpen(false);}},h(Building2,{className:'icon'}),h('span',null,trialOpen?t("إغلاق إنشاء الحساب"):t("أنشئ حسابك بـ 20₪"))),
      trialOpen?h('form',{className:'auth2-trial',onSubmit:createTrial,noValidate:true},
        h('div',{className:'auth2-trial-head'},h('h2',null,t("أنشئ حساب كاش توب 3")),h('p',null,t("أدخل بيانات شركتك، ثم أكمل دفع 20₪ لإرسال طلب التفعيل."))),
        h('div',{className:'auth2-field'},h('label',null,t("شعار الشركة "),h('span',null,t("اختياري"))),h('div',{className:'auth2-logo-upload'},logo?h('img',{src:logo,className:'auth2-logo-preview',alt:t("معاينة شعار الشركة")}):h('div',{className:'auth2-logo-preview placeholder'},h(ImageIcon,{className:'icon'})),h('div',{className:'auth2-logo-copy'},h('strong',null,logo?t("تم اختيار شعار الشركة"):t("أضف هوية شركتك")),h('small',null,'PNG، JPG، WEBP'),h('div',{className:'auth2-logo-actions'},h('button',{type:'button',onClick:()=>logoRef.current?.click()},logo?t("تغيير الشعار"):t("اختيار الشعار")),logo?h('button',{type:'button',onClick:()=>setLogo('')},t("إزالة")):null))),h('input',{ref:logoRef,type:'file',accept:'image/png,image/jpeg,image/webp',hidden:true,onChange:async e=>{try{const v=await dataUrlFromImage(e.target.files?.[0]);setLogo(v);setError('');}catch(err){setError(String(err?.message||err));}}})),
        h('div',{className:'auth2-field'},h('label',null,t("اسم الشركة "),h('b',null,'*')),h('div',{className:'auth2-input-icon'},h(Building2,{className:'icon'}),h('input',{value:companyName,onChange:e=>setCompanyName(e.target.value),placeholder:t("مثال: شركة كاش توب 3 للتجارة"),required:true}))),
        h('div',{className:'auth2-field'},h('label',null,t("العنوان والموقع "),h('b',null,'*')),h('div',{className:'auth2-input-icon'},h(MapPin,{className:'icon'}),h('input',{value:address,onChange:e=>setAddress(e.target.value),placeholder:t("المدينة، الشارع أو الموقع"),required:true}))),
        h('div',{className:'auth2-field'},h('label',null,t("رقم الهاتف "),h('b',null,'*')),h('div',{className:'auth2-phone-row'},h(Picker,{kind:'country',value:dial,onChange:setDial,options:COUNTRIES,open:countryOpen,setOpen:v=>{setCountryOpen(v);if(v)setCurrencyOpen(false);},query:countryQuery,setQuery:setCountryQuery}),h('div',{className:'auth2-phone-wrap'},h(Phone,{className:'auth2-phone-icon'}),h('input',{className:'auth2-phone-input',value:phone,onChange:e=>setPhone(e.target.value.replace(/[^0-9\s-]/g,'')),placeholder:'597603119',inputMode:'tel',required:true})))),
        h('div',{className:'auth2-field'},h('label',null,t("العملة "),h('b',null,'*')),h(Picker,{kind:'currency',value:currency,onChange:setCurrency,options:CURRENCIES,open:currencyOpen,setOpen:v=>{setCurrencyOpen(v);if(v)setCountryOpen(false);},query:currencyQuery,setQuery:setCurrencyQuery})),
        h('button',{type:'submit',className:'auth2-primary',disabled:trialBusy},trialBusy?h('span',{className:'spinner'}):h(Building2,{className:'icon'}),h('span',null,trialBusy?t("جارٍ تجهيز الطلب..."):t("متابعة للدفع — 20₪"))),
      ):null,
      h('div',{className:'auth2-foot'},h(ShieldCheck,{className:'icon'}),h('span',null,t("بياناتك محفوظة داخل مساحة شركتك المستقلة.")))
    ),
    h('a',{href:'./support.html',title:t("الدعم الفني"),'aria-label':t("الدعم الفني"),style:{position:'fixed',left:'18px',bottom:'max(18px, env(safe-area-inset-bottom))',width:'54px',height:'54px',borderRadius:'18px',display:'grid',placeItems:'center',background:'linear-gradient(135deg,#10b981,#6D28D9)',color:'#fff',boxShadow:'0 14px 30px rgba(5,150,105,.30)',border:'1px solid rgba(255,255,255,.35)',zIndex:80,textDecoration:'none'}},h(Headphones,{style:{width:'25px',height:'25px'}}))
  );
};
