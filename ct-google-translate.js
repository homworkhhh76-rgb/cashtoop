/* Cash Top 3 — interface translation (Google Translate first, offline persistent cache).
   This module only changes DOM presentation; it does not translate input values,
   modify application records, or write translations into business data. */
(function () {
  'use strict';
  if (window.CashTopTranslate) return;
  const LANGUAGE_KEY = 'ct-language';
  const CACHE_DB = 'cashtop-ui-translations-v1';
  const CACHE_STORE = 'translations';
  const FAST_PREFIX = 'cashtop-translations-fast-v1-';
  const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE','PRE','SVG','MATH','CANVAS','IFRAME']);
  const TRANSLATABLE_ATTRS = ['title','placeholder','aria-label','alt'];
  const RTL = new Set(['ar','ur','fa','ku','ps','he','yi']);
  const LANGUAGES = new Set('ar en fr es de tr ru zh-CN zh-TW ja ko it pt hi ur fa id ms nl sv no da fi pl uk el cs ro hu bg hr sr sk th vi bn ta te mr gu pa sw am ha yo zu af sq hy az ka kk uz ku ps tl is ga la'.split(' '));
  const nodeStates = new WeakMap();
  const attributeStates = new WeakMap();
  const originalDirections = new WeakMap();
  const cache = new Map();
  const reverse = new Map();
  const pending = new Map();
  let currentLanguage = readLanguage();
  let generation = 0, dbPromise = null, scanTimer = null, flushTimer = null;
  let diskTimer = null, fastTimer = null, queued = [], running = 0, ready = false;
  let noNetworkUntil = 0, failures = 0;
  let observer = null;
  const concurrency = 3;
  const batchMaxLength = 1300;
  const MAX_FAST = 1250;
  let fastDirty = false;

  function readLanguage() {
    try { const code = localStorage.getItem(LANGUAGE_KEY) || 'ar'; return LANGUAGES.has(code) ? code : 'ar'; }
    catch (_) { return 'ar'; }
  }
  function cacheKey(lang, original) { return lang + '\u0001' + original; }
  function isRTL(lang) { return RTL.has(lang); }
  function addCached(lang, original, translated, shouldWrite) {
    if (!original || !translated || translated.length > 3000) return;
    const key = cacheKey(lang, original);
    if (cache.get(key) === translated) return;
    cache.set(key, translated);
    reverse.set(lang + '\u0001' + translated.trim(), original);
    if (shouldWrite) {
      queued.push({key, lang, original, translated, savedAt: Date.now()});
      fastDirty = true;
      if (!diskTimer) diskTimer = setTimeout(persistBatch, 650);
      if (!fastTimer) fastTimer = setTimeout(writeFastCache, 1000);
    }
  }
  function loadFastCache(lang) {
    try {
      const raw = localStorage.getItem(FAST_PREFIX + lang);
      if (!raw) return;
      const entries = JSON.parse(raw);
      if (!Array.isArray(entries)) return;
      for (const entry of entries) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string') {
          addCached(lang, entry[0], entry[1], false);
        }
      }
    } catch (_) {}
  }
  function writeFastCache() {
    fastTimer = null;
    if (!fastDirty) return;
    fastDirty = false;
    try {
      const lang = currentLanguage;
      let entries = [];
      const prefix = lang + '\u0001';
      for (const [key, value] of cache) {
        if (key.startsWith(prefix)) entries.push([key.slice(prefix.length), value]);
      }
      entries = entries.slice(-MAX_FAST);
      let value = JSON.stringify(entries);
      while (value.length > 750000 && entries.length > 30) {
        entries = entries.slice(Math.floor(entries.length * .25));
        value = JSON.stringify(entries);
      }
      localStorage.setItem(FAST_PREFIX + lang, value);
    } catch (_) { /* IndexedDB is the primary offline store. */ }
  }
  function openDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      try {
        const req = indexedDB.open(CACHE_DB, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, {keyPath:'key'});
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (_) { resolve(null); }
    });
    return dbPromise;
  }
  async function loadDb() {
    const db = await openDb();
    if (!db) return;
    try {
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const request = tx.objectStore(CACHE_STORE).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      for (const row of records) {
        if (row && typeof row.lang === 'string') addCached(row.lang, row.original, row.translated, false);
      }
      scheduleScan();
    } catch (_) {}
  }
  async function persistBatch() {
    diskTimer = null;
    const rows = queued.splice(0);
    if (!rows.length) return;
    const db = await openDb();
    if (!db) return;
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        rows.forEach(row => store.put(row));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (_) { /* Kept in localStorage fast-cache where available. */ }
  }
  function excluded(el) {
    if (!el || !(el instanceof Element)) return false;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.closest('[translate="no"],.notranslate,[data-ct-no-translate],.voucher-paper,[data-paper],#printable-voucher-paper')) return true;
    if (el.closest('[contenteditable="true"],[contenteditable=""],.cm-editor,.monaco-editor')) return true;
    // Customer/supplier names, item prices and other financial rows are personal
    // or accounting data. Keep them as originally entered, never send to Google.
    const dataCell = el.closest('tbody td');
    if (dataCell && !dataCell.closest('button,[role="button"]')) return true;
    return false;
  }
  function isTranslatable(s) {
    if (!s || s.length < 2 || s.length > 250) return false;
    if (!/[\u0621-\u064a\u0671-\u06d3]/.test(s)) return false;
    if (/https?:\/\/|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(s)) return false;
    if (/\d{6,}|(?:\+?970|\+?972)\d{7,}|(?:₪|\$|€)\s*[\d,.]/.test(s)) return false;
    if (/^[\[{<]/.test(s) && /[:{}<>]/.test(s)) return false;
    return true;
  }
  function coreParts(value) {
    const m = String(value || '').match(/^(\s*)([\s\S]*?)(\s*)$/);
    return m ? {before:m[1], core:m[2], after:m[3]} : null;
  }
  function restoreOrTranslate(target, state, original, setter) {
    const parts = coreParts(original);
    if (!parts || !isTranslatable(parts.core) || currentLanguage === 'ar') {
      if (state.applied !== original) { state.applied = original; setter(original); }
      return;
    }
    const key = cacheKey(currentLanguage, parts.core);
    const result = cache.get(key);
    if (result) {
      const translated = parts.before + result + parts.after;
      if (state.applied !== translated) { state.applied = translated; setter(translated); }
      return;
    }
    // New uncached UI labels must not flash in Arabic. Show a neutral placeholder
    // until a cached/offline or newly fetched translation exists. Never touch user data.
    const temporary = parts.before + '…' + parts.after;
    if (state.applied !== temporary) { state.applied = temporary; setter(temporary); }
    enqueue(parts.core, currentLanguage, generation);
  }
  function translateNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || excluded(parent)) return;
    const current = node.nodeValue || '';
    let state = nodeStates.get(node);
    if (!state) {
      state = {original:current,applied:current};
      nodeStates.set(node,state);
    } else if (current !== state.applied) {
      state.original = current;
      state.applied = current;
    }
    restoreOrTranslate(node,state,state.original,v => {node.nodeValue=v;});
  }
  function translateAttributes(el) {
    if (excluded(el) || !el.hasAttributes()) return;
    let attrs = attributeStates.get(el);
    if (!attrs) { attrs = new Map(); attributeStates.set(el, attrs); }
    for (const attr of TRANSLATABLE_ATTRS) {
      if (!el.hasAttribute(attr)) continue;
      const now = el.getAttribute(attr);
      let state = attrs.get(attr);
      if (!state) { state = {original:now,applied:now}; attrs.set(attr,state); }
      else if (now !== state.applied) { state.original=now; state.applied=now; }
      restoreOrTranslate(el,state,state.original,v => el.setAttribute(attr,v));
    }
    if (el.tagName === 'INPUT' && ['button','submit','reset'].includes(el.type)) {
      const now = el.value;
      let state=attrs.get('__buttonValue');
      if (!state) {state={original:now,applied:now};attrs.set('__buttonValue',state);}
      else if (now !== state.applied) {state.original=now;state.applied=now;}
      restoreOrTranslate(el,state,state.original,v => {el.value=v;});
    }
  }
  function updateDirection() {
    const dir = isRTL(currentLanguage) ? 'rtl' : 'ltr';
    document.documentElement.lang=currentLanguage;
    document.documentElement.dir=dir;
    document.documentElement.dataset.ctDirection=dir;
    if (document.body) document.body.dir=dir;
    const root=document.getElementById('root');
    if (root) root.dir=dir;
  }
  function scan(root) {
    if (!root) return;
    updateDirection();
    const roots = root.nodeType === Node.DOCUMENT_NODE ? [root.documentElement] : [root];
    for (const r of roots) {
      if (!r) continue;
      if (r.nodeType === Node.TEXT_NODE) {translateNode(r);continue;}
      if (r.nodeType !== Node.ELEMENT_NODE) continue;
      if (!excluded(r)) translateAttributes(r);
      if (excluded(r)) continue;
      const walker = document.createTreeWalker(r, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (node.nodeType === Node.TEXT_NODE) return excluded(node.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          return excluded(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      let n, nodes = 0;
      while ((n=walker.nextNode()) && nodes++ < 18000) {
        if (n.nodeType === Node.TEXT_NODE) translateNode(n);
        else translateAttributes(n);
      }
      // A few dynamic strings are mounted directly on the root node.
      for (const node of r.childNodes) if (node.nodeType===Node.TEXT_NODE) translateNode(node);
    }
  }
  function scheduleScan() {
    if (!ready || scanTimer !== null) return;
    scanTimer = setTimeout(() => {scanTimer=null;scan(document);}, 25);
  }
  function enqueue(original, lang, gen) {
    if (!navigator.onLine || Date.now() < noNetworkUntil) return;
    const key = cacheKey(lang,original);
    if (cache.has(key) || pending.has(key)) return;
    pending.set(key, {key,original,lang,gen});
    if (flushTimer === null) flushTimer = setTimeout(dispatch, 120);
  }
  function dispatch() {
    flushTimer=null;
    if (!navigator.onLine || Date.now() < noNetworkUntil) return;
    const batch = [];
    let length=0;
    for (const [key,row] of pending) {
      if (row.lang !== currentLanguage) {pending.delete(key);continue;}
      if (batch.length >= 10 || length+row.original.length > batchMaxLength) break;
      batch.push(row);length+=row.original.length+25;pending.delete(key);
    }
    if (!batch.length) return;
    // Work on 3 requests max; each request contains up to 10 labels.
    waitingBatches.push(batch);
    pump();
    if (pending.size && flushTimer===null) flushTimer=setTimeout(dispatch, 160);
  }
  const waitingBatches=[];
  function pump() {
    while (running < concurrency && waitingBatches.length) {
      const rows=waitingBatches.shift();running++;
      translateBatch(rows).finally(() => {running--;pump();if(pending.size && flushTimer===null)flushTimer=setTimeout(dispatch,100);});
    }
  }
  async function googleTranslate(text,target) {
    const p=new URLSearchParams({client:'gtx',sl:'ar',tl:target,dt:'t',q:text});
    const response=await fetch('https://translate.googleapis.com/translate_a/single?'+p.toString(),{method:'GET',mode:'cors',credentials:'omit'});
    if (!response.ok) throw Error('Google status '+response.status);
    const data=await response.json();
    if (!Array.isArray(data?.[0])) throw Error('Google response invalid');
    const result=data[0].map(x=>Array.isArray(x)?String(x[0]||''):'').join('').trim();
    if (!result) throw Error('Google returned empty translation');
    return result;
  }
  async function myMemoryTranslate(text,target) {
    if (text.length > 450) throw Error('fallback too long');
    const p=new URLSearchParams({q:text,langpair:'ar|'+target});
    const response=await fetch('https://api.mymemory.translated.net/get?'+p.toString(),{credentials:'omit',mode:'cors'});
    if (!response.ok) throw Error('fallback status '+response.status);
    const data=await response.json();
    const result=String(data?.responseData?.translatedText||'').trim();
    if (!result || /^MYMEMORY WARNING/i.test(result)) throw Error('fallback response invalid');
    return result;
  }
  async function translateOne(original, lang) {
    try {return await googleTranslate(original,lang);}
    catch (_) {return await myMemoryTranslate(original,lang);}
  }
  function protectNumbers(original, translated) {
    const extract=s=>(s.match(/[0-9]+(?:[.,][0-9]+)?/g)||[]).sort().join('|');
    // Do not change amounts, invoice references, percentages or quantities.
    return extract(original) !== extract(translated) ? null : translated;
  }
  async function translateBatch(rows) {
    const lang=rows[0].lang;
    if (lang==='ar' || !navigator.onLine) return;
    const valid = rows.filter(r => r.lang===lang);
    if (!valid.length) return;
    let results=[];
    try {
      if (valid.length===1) results=[await translateOne(valid[0].original,lang)];
      else {
        // The visible markup is not sent: only plain text labels and separators.
        const separator='\n⟦CT_UI_TRANSLATION_SEPARATOR⟧\n';
        const joined=valid.map(x=>x.original).join(separator);
        const response=await googleTranslate(joined,lang);
        results=response.split(/\s*⟦\s*CT_UI_TRANSLATION_SEPARATOR\s*⟧\s*/);
        if (results.length!==valid.length) {
          // Most Google models preserve the token; an individual fallback keeps accuracy.
          results=await Promise.all(valid.map(x=>translateOne(x.original,lang).catch(()=>'')));
        }
      }
      let good=0;
      for (let i=0;i<valid.length;i++) {
        const result=protectNumbers(valid[i].original,String(results[i]||'').trim());
        if (!result) continue;
        addCached(lang,valid[i].original,result,true);
        good++;
      }
      if (good) {failures=0;if(lang===currentLanguage)scheduleScan();}
    } catch (_) {
      failures++;
      if (failures>=3) noNetworkUntil=Date.now()+30000;
      // Missing translations are never fabricated; original Arabic remains visible.
    }
  }
  function sourceOf(text) {
    return reverse.get(currentLanguage+'\u0001'+String(text||'').trim()) || text;
  }
  function setLanguage(lang,{persist=true,broadcast=true}={}) {
    if (!LANGUAGES.has(lang)) lang='ar';
    const changed=currentLanguage!==lang;
    currentLanguage=lang;
    if (persist) try{localStorage.setItem(LANGUAGE_KEY,lang);}catch(_){}
    if (changed) {
      // Keep translations from the previous locale on disk before switching.
      if (fastDirty) writeFastCache();
      generation++;
      pending.clear();waitingBatches.splice(0);
      loadFastCache(lang);
      updateDirection();
      if (ready) scan(document); // synchronous: changes cannot paint in the old locale
      if (broadcast) try{channel?.postMessage({type:'language',lang});}catch(_){}
      try{window.dispatchEvent(new CustomEvent('ct:language-changed',{detail:{lang}}));}catch(_){}
    } else {
      updateDirection();
      if (ready) scan(document);
    }
    return currentLanguage;
  }
  let channel=null;
  try {
    if ('BroadcastChannel' in window) {
      channel=new BroadcastChannel('cashtop-ui-language');
      channel.onmessage=e=>{if(e.data?.type==='language')setLanguage(e.data.lang,{persist:true,broadcast:false});};
    }
  } catch (_) {}
  window.addEventListener('storage',event=>{
    if (event.key===LANGUAGE_KEY && event.newValue) setLanguage(event.newValue,{persist:false,broadcast:false});
  });
  window.addEventListener('online',()=>{noNetworkUntil=0;failures=0;scheduleScan();});
  function flushBeforeExit() { if (fastDirty) writeFastCache(); if (queued.length) persistBatch(); }
  window.addEventListener('pagehide',flushBeforeExit);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushBeforeExit();});
  window.CashTopTranslate={getLanguage:()=>currentLanguage,setLanguage,sourceOf,refresh:scheduleScan,flush:persistBatch,
    cacheStats:()=>({cached:cache.size,untranslated:pending.size,language:currentLanguage})};
  loadFastCache(currentLanguage);
  function releaseInitialPaint() {
    document.documentElement.removeAttribute('data-ct-i18n-preparing');
    if (document.body) document.body.removeAttribute('data-ct-i18n-preparing');
  }
  function scanAddedNodes(mutations) {
    // MutationObserver runs at the microtask checkpoint, BEFORE the browser paints.
    // Do not postpone newly mounted React views with a setTimeout.
    const addedElements = new Set();
    for (const m of mutations) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateAttributes(m.target);
      else if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) translateNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) addedElements.add(node);
        }
      }
    }
    // An ancestor added in the same commit already covers all descendants.
    for (const node of addedElements) {
      let ancestor = node.parentElement, covered = false;
      while (ancestor) { if (addedElements.has(ancestor)) { covered = true; break; } ancestor = ancestor.parentElement; }
      if (!covered) scan(node);
    }
  }
  function start() {
    if (ready) return;
    ready = true;
    updateDirection();
    // Hide the first non-Arabic paint until the full persisted offline cache
    // is read. The fast localStorage cache is already loaded synchronously.
    scan(document);
    observer = new MutationObserver(scanAddedNodes);
    observer.observe(document.documentElement,{
      subtree:true,childList:true,characterData:true,
      attributes:true,attributeFilter:TRANSLATABLE_ATTRS
    });
    if (currentLanguage === 'ar') {
      releaseInitialPaint();
      loadDb();
    } else {
      const limit = new Promise(resolve => setTimeout(resolve,1500));
      Promise.race([loadDb(),limit]).then(() => {
        scan(document);
        releaseInitialPaint();
      }).catch(() => releaseInitialPaint());
    }
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
