'use strict';

const webCrypto=globalThis.crypto||require('node:crypto').webcrypto;
const policy=require('./trial-policy');
const validTenant=/^trial-[a-f0-9-]{36}$/;
const validSecret=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
const digest=async secret=>hex(await webCrypto.subtle.digest('SHA-256',encoder.encode(secret)));
function sameSecret(a,b){
  if(typeof b!=='string'||a.length!==b.length)return false;
  let difference=0;
  for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
}
async function portalToken(id,customer,row){
  const key=await webCrypto.subtle.importKey('raw',encoder.encode(row.hash),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const data=JSON.stringify(['customer-portal-v1',id,String(customer.id),customer.portalNonce||'']);
  return hex(await webCrypto.subtle.sign('HMAC',key,encoder.encode(data)));
}
const alive=row=>!!row&&!row.deletedAt&&!row.isDeleted;
const select=(row,fields)=>Object.fromEntries(fields.filter(field=>Object.hasOwn(row,field)).map(field=>[field,row[field]]));
function portalCustomer(row,id){
  const record=row?.records?.['customers\u0001'+id];
  return !record?.deleted&&alive(record?.value)&&record.value.portalEnabled===true?record.value:null;
}
function publicPortalData(row,customer){
  const config=row.records['settings\u0001store_config'];
  const store=config?.deleted?{}:config?.value||{};
  const settings=select(store,['storeName','subtitle','logoSourceUrl','logoUrl','currencySymbol','p2pPaymentChatId']);
  settings.p2pPaymentMethods=Array.isArray(store.p2pPaymentMethods)?store.p2pPaymentMethods.filter(method=>method&&typeof method==='object').map(method=>{
    const output=select(method,['id','name','icon','transferCurrency','currencyCode','currency','logoUrl','logoTelegramFileId','qrImageUrl','qrTelegramFileId','note']);
    output.fields=Array.isArray(method.fields)?method.fields.filter(field=>field&&typeof field==='object').map(field=>select(field,['id','label','value'])):[];
    return output;
  }):[];
  settings.currencySymbol||=row.profile.currencySymbol;
  settings.logoUrl||=row.profile.logo;
  const id=String(customer.id),invoices=[],vouchers=[];
  for(const entry of Object.values(row.records)){
    const value=entry.value;
    if(entry.deleted||!alive(value))continue;
    if(entry.store==='invoices'&&String(value.customerId)===id){
      const invoice=select(value,['type','invoiceNumber','date','createdAt','grandTotal','paidAmount','remainingAmount','notes']);
      invoice.items=Array.isArray(value.items)?value.items.filter(item=>item&&typeof item==='object').map(item=>select(item,['productName','unitName','quantity','unitPrice','total'])):[];
      invoices.push(invoice);
    }
    if(entry.store==='vouchers'&&value.partyType==='customer'&&String(value.partyId)===id)
      vouchers.push(select(value,['type','voucherNumber','date','createdAt','amount','notes']));
  }
  const newest=(a,b)=>new Date(b.date||b.createdAt||0)-new Date(a.date||a.createdAt||0);
  return {company:{companyName:row.profile.companyName},customer:select(customer,['id','name','phone','mobile','phoneNumber','balance']),
    settings,invoices:invoices.sort(newest),vouchers:vouchers.sort(newest)};
}
const fail=(status,message,code)=>Object.assign(new Error(message),{status,code});
const sqlArg=value=>typeof value==='number'?{type:'integer',value:String(value)}:{type:'text',value:String(value)};

function createRepository(env=process.env, transport=fetch){
  const endpoint=String(env.CASH_TOP_TRIAL_DATABASE_URL||'libsql://test-homworkhhh76-rgb.aws-ap-northeast-1.turso.io');
  const key=env.CASH_TOP_TRIAL_DATABASE_TOKEN;
  if(!key)return null;
  const url=new URL(endpoint.replace(/^libsql:/,'https:'));
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Invalid trial database endpoint');
  const pipeline=async(sql,args=[])=>{
    const result=await transport(new URL('/v2/pipeline',url),{
      method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},
      body:JSON.stringify({requests:[{type:'execute',stmt:{sql,args:args.map(sqlArg)}},{type:'close'}]}),
      signal:AbortSignal.timeout(15000)
    });
    if(!result.ok)throw Error('Trial database is unavailable');
    const item=(await result.json()).results?.[0];
    if(item?.type!=='ok')throw Error('Trial database statement failed');
    return item.response.result;
  };
  let schema;
  const ensure=()=>schema||=(pipeline('CREATE TABLE IF NOT EXISTS cash_top_trial_v1 (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, version INTEGER NOT NULL, profile TEXT NOT NULL, records TEXT NOT NULL)').catch(error=>{schema=null;throw error}));
  return {
    async load(id,includeRecords=true,cursor=null) {
      await ensure();
      const conditional=includeRecords&&cursor!==null;
      const columns=conditional?',CASE WHEN version>? THEN records ELSE NULL END':includeRecords?',records':'';
      const result=await pipeline('SELECT secret_hash,expires_at,version,profile'+columns+' FROM cash_top_trial_v1 WHERE id=?',conditional?[cursor,id]:[id]);
      const row=result.rows?.[0]?.map(cell=>cell.value);
      if(row)return {hash:row[0],expiry:Number(row[1]),version:Number(row[2]),profile:JSON.parse(row[3]),records:includeRecords&&row[4]?JSON.parse(row[4]):{}};
    },
    async create(id,row){
      await ensure();
      const result=await pipeline('INSERT INTO cash_top_trial_v1 (id,secret_hash,expires_at,version,profile,records) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
        [id,row.hash,row.expiry,0,JSON.stringify(row.profile),'{}']);
      return result.affected_row_count===1;
    },
    async write(id,expected,version,records,now){
      const result=await pipeline('UPDATE cash_top_trial_v1 SET version=?,records=? WHERE id=? AND version=? AND expires_at>?',
        [version,JSON.stringify(records),id,expected,now]);
      return result.affected_row_count===1;
    }
  };
}

function createTrialService({repository=createRepository(),clock=Date.now}={}){
  const authorized=async(id,secret,includeRecords=false,cursor=null,allowExpired=false)=>{
    const row=await repository.load(id,includeRecords,cursor);
    if(!row||!sameSecret(await digest(secret),row.hash))throw fail(403,'بيانات دخول التجربة غير صحيحة','TRIAL_AUTH');
    if(!allowExpired&&row.expiry<=clock())throw fail(403,'انتهت مدة التجربة','TRIAL_EXPIRED');
    return row;
  };
  const access=(id,row)=>{
    const profile=row.profile;
    return {status:'active',readOnly:row.expiry<=clock(),endAt:new Date(row.expiry).toISOString(),companyId:id,trialProfile:profile,
      manager:{id:id+'-manager',name:'مدير النظام',role:'admin',roleName:'مدير النظام',active:true,
        authVersion:id,permissions:['*'],createdAt:profile.createdAt}};
  };
  return async function execute(input){
    if(!repository)throw fail(503,'خدمة التجربة غير مهيّأة على الخادم','TRIAL_UNCONFIGURED');
    const {action,companyId:id,secret}=input||{};
    if(action==='portalRead'||action==='portalLink'){
      const customerId=input.customerId;
      if(typeof id!=='string'||!validTenant.test(id)||typeof customerId!=='string'||!customerId||customerId.length>350)
        throw fail(400,'رابط العميل غير صالح');
      if(action==='portalLink'){
        if(typeof secret!=='string'||!validSecret.test(secret))throw fail(403,'بيانات الدخول غير صحيحة');
        const row=await authorized(id,secret,true);
        const customer=portalCustomer(row,customerId);
        if(!customer)throw fail(404,'تعذّر العثور على العميل في البيانات المتزامنة.');
        return {portalToken:await portalToken(id,customer,row)};
      }
      if(typeof input.portalToken!=='string'||!validSecret.test(input.portalToken))throw fail(400,'رابط العميل غير صالح');
      const row=await repository.load(id);
      const customer=portalCustomer(row,customerId);
      if(!customer||row.expiry<=clock()||!sameSecret(await portalToken(id,customer,row),input.portalToken))
        throw fail(404,'رابط العميل غير صالح أو انتهت صلاحيته.');
      return {portal:publicPortalData(row,customer)};
    }
    if(typeof id!=='string'||typeof secret!=='string'||!validTenant.test(id)||!validSecret.test(secret))throw fail(400,'بيانات التجربة غير صالحة');
    if(action==='create'){
      const text=(key,length)=>String(input.profile?.[key]||'').trim().slice(0,length);
      const profile={companyName:text('companyName',150),address:text('address',340),phone:text('phone',45),
        phoneCode:text('phoneCode',10),currency:text('currency',3),currencySymbol:text('currencySymbol',8),
        logo:text('logo',250000),createdAt:new Date(clock()).toISOString()};
      if(!profile.companyName||!profile.address||!profile.phone||!/^[A-Z]{3}$/.test(profile.currency))
        throw fail(400,'أكمل بيانات الشركة');
      if(profile.logo&&!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(profile.logo))throw fail(400,'صيغة الشعار غير مدعومة');
      const row={hash:await digest(secret),expiry:clock()+policy.days*86400000,profile};
      return {access:access(id,await repository.create(id,row)?row:await authorized(id,secret))};
    }
    if(action==='verify')return {access:access(id,await authorized(id,secret,false,null,true))};
    if(action!=='sync')throw fail(400,'العملية غير متاحة');
    const operations=input.operations;
    if(!Array.isArray(operations)||operations.length>100)throw fail(400,'دفعة المزامنة غير صالحة');
    for(const op of operations){
      if(!op||!policy.stores.includes(op.store)||typeof op.key!=='string'||!op.key||op.key.length>350||
        !Number.isSafeInteger(op.rev)||op.rev<=0||(!op.deleted&&policy.key(op.store,op.value)!==op.key))
        throw fail(400,'سجل مزامنة غير صالح');
    }
    const requestedCursor=Number.isSafeInteger(input.cursor)&&input.cursor>0?input.cursor:0;
    for(let attempt=0;attempt<5;attempt++){
      const row=await authorized(id,secret,true,operations.length?null:requestedCursor,!operations.length);
      const records={...row.records};
      const version=row.version+1;
      let changed=false;
      for(const op of operations){
        const key=op.store+'\u0001'+op.key;
        if(records[key]?.rev>=op.rev)continue;
        records[key]={store:op.store,key:op.key,rev:op.rev,deleted:!!op.deleted,value:op.deleted?null:op.value,version};
        changed=true;
      }
      if(changed){
        const counts={};
        for(const record of Object.values(records)){
          if(!record.deleted&&policy.capped.includes(record.store)&&policy.counts(record.value)){
            const count=counts[record.store]=(counts[record.store]||0)+1;
            if(count>policy.limit)throw fail(409,'وصلت إلى الحد التجريبي المسموح به','TRIAL_LIMIT');
          }
        }
        if(encoder.encode(JSON.stringify(records)).length>12*1024*1024)throw fail(413,'تجاوزت مساحة بيانات التجربة','TRIAL_LIMIT');
        if(!await repository.write(id,row.version,version,records,clock()))continue;
      }
      const cursor=Math.min(requestedCursor,row.version);
      return {cursor:changed?version:row.version,records:Object.values(records).filter(record=>record.version>cursor)};
    }
    throw fail(503,'المزامنة مشغولة. حاول مجددًا');
  };
}

module.exports={createTrialService,createRepository};
