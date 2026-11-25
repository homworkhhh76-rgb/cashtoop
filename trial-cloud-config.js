// Direct connection for this private test archive. An optional Worker URL overrides it.
(() => {
  const databaseURL = 'libsql://test-homworkhhh76-rgb.aws-ap-northeast-1.turso.io';
  const endpoint = '';
  const authToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTU1MTkzNjAsImlkIjoiMDFhMjBkNDctNzYwMS03OWEzLWFkZjItMjNlZjhkM2RkODE4Iiwia2lkIjoicVgzS01DZ0pwQnp3eGo1Tzl2SHhaWUJGem9sTWFsa24tTU5JOTRlMTl6YyIsInJpZCI6IjI5YjU1MzcwLTdiZDQtNGZiMy1iMmJkLTllYWYzOTE1OWIxMCJ9.eNEKQnj9EA7xQ61U6Zuoltujr4CMHvwYUAPN2MlqpiWvmquFcgPtsY2BWj1u4mh0weq-K1mZRnBqa0RJty_uCw';
  let direct;
  const publicSiteURL = '';
  const portalPattern = /^#cttrial\.(trial-[a-f0-9-]{36})\.([^.]+)\.([a-f0-9]{64})$/;
  const error = (message, code) => Object.assign(new Error(message), { code });
  const configuredURL = (value, base) => {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))
      throw error('رابط خدمة التجربة يحتاج إلى HTTPS.', 'TRIAL_UNCONFIGURED');
    url.username = '';
    url.password = '';
    return url;
  };
  async function request(input) {
    if (!endpoint) {
      if (!globalThis.CashTopDirectTrial) throw error('تعذّر تحميل محرك الاتصال بقاعدة التجربة.', 'TRIAL_UNCONFIGURED');
      direct ||= globalThis.CashTopDirectTrial({databaseURL,authToken});
      try {
        return {ok:true,...await direct(input)};
      } catch (cause) {
        if (cause.status) throw cause;
        throw error('تعذّر الاتصال مباشرة بقاعدة التجربة. تحقّق من الاتصال ثم أعد المحاولة.', 'TRIAL_NETWORK');
      }
    }
    const url = configuredURL(endpoint, location.href);
    let response;
    try {
      response = await fetch(url.href, { method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify(input), credentials:'omit', cache:'no-store', redirect:'error', signal:AbortSignal.timeout(25000) });
    } catch (_) {
      throw error('تعذّر الاتصال بخدمة الحسابات التجريبية. تحقق من الاتصال ثم أعد المحاولة.', 'TRIAL_NETWORK');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok)
      throw Object.assign(error(data?.error || 'خدمة التجربة غير متاحة حاليًا.', data?.code), {status:response.status});
    return data;
  }
  function portalAccess(hash = location.hash) {
    if (!hash.startsWith('#cttrial.')) return null;
    const match = portalPattern.exec(hash);
    if (!match) throw error('رابط العميل غير صالح.');
    return {companyId:match[1], customerId:decodeURIComponent(match[2]), portalToken:match[3]};
  }
  async function portalData(access) {
    return (await request({...access, action:'portalRead'})).portal;
  }
  function normalizePortalSite(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let url;
    try { url = new URL(raw); } catch { throw error('أدخل عنوان الموقع كاملًا ويبدأ بـ https://.'); }
    if (url.protocol !== 'https:' || url.username || url.password || isLocalURL(url))
      throw error('أدخل رابط HTTPS لموقع يمكن فتحه من جهاز آخر.');
    url.search = '';
    url.hash = '';
    if (/\.html?$/i.test(url.pathname)) return new URL('./', url).href;
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.href;
  }
  function isLocalURL(value) {
    const url = value instanceof URL ? value : new URL(value);
    return url.protocol === 'file:' || /^(?:localhost|127(?:\.\d+){3}|\[::1\])$/i.test(url.hostname);
  }
  function portalURL(file, access, site = '') {
    const published = site === null ? '' : normalizePortalSite(site || publicSiteURL);
    const page = new URL('./' + file, published || location.href);
    const url = page.protocol === 'file:' && !published ? page : configuredURL(page.href);
    url.search = '';
    url.hash = ['cttrial', access.companyId, encodeURIComponent(access.customerId).replace(/\./g,'%2E'), access.portalToken].join('.');
    return url.href;
  }
  globalThis.CashTopTrialCloud = Object.freeze({databaseURL, request, portalAccess, portalData, portalURL, normalizePortalSite, isLocalURL});
})();
