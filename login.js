(function () {
  'use strict';

  const keepPortraitOrientation = () => {
    const standalone = Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
    if (!standalone || !screen.orientation || typeof screen.orientation.lock !== 'function') return;
    screen.orientation.lock('portrait').catch(() => {});
  };
  keepPortraitOrientation();
  window.addEventListener('pageshow', keepPortraitOrientation, { passive: true });
  window.addEventListener('orientationchange', keepPortraitOrientation, { passive: true });

  const LOGIN_DURABLE_DB = 'cashtop-local-durable-v2';
  const LOGIN_DURABLE_STORE = 'kv';
  const LOGIN_DURABLE_GLOBAL_KEYS = new Set([
    'cashtop_remembered_key', 'cashtop_device_id', 'cashtop_admin_licenses', 'cashtop_admin_users',
    'cashtop_superadmin_session', 'cashtop_tenant_bindings', 'cashtop_persistent_session_v1',
    'cashtop_server_clock_v1'
  ]);
  const loginOverflowMemory = new Map();
  let loginDurableDbPromise = null;
  let loginDurableWriteChain = Promise.resolve();

  function isQuotaError(error) {
    return error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      /quota|storage.*full|exceeded/i.test(String(error?.message || ''));
  }
  function isLoginDurableKey(key) {
    return LOGIN_DURABLE_GLOBAL_KEYS.has(String(key || '')) ||
      /^(?:cashtop_data::|cashtop_meta::|ct_sync_queue::|ct_sync_queue_reset_at::|ct_sync_queue_revision::|cashtop_tx::)/.test(String(key || ''));
  }
  function openLoginDurableDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (loginDurableDbPromise) return loginDurableDbPromise;
    loginDurableDbPromise = new Promise(resolve => {
      try {
        const request = indexedDB.open(LOGIN_DURABLE_DB, 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(LOGIN_DURABLE_STORE)) db.createObjectStore(LOGIN_DURABLE_STORE, { keyPath:'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch (_) { resolve(null); }
    });
    return loginDurableDbPromise;
  }
  async function persistLoginDurable(key, value) {
    if (!isLoginDurableKey(key)) return false;
    const db = await openLoginDurableDb();
    if (!db) return false;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(LOGIN_DURABLE_STORE, 'readwrite');
        tx.objectStore(LOGIN_DURABLE_STORE).put({ key:String(key), value:String(value), savedAt:Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }
  async function deleteLoginDurable(key) {
    if (!isLoginDurableKey(key)) return false;
    const db = await openLoginDurableDb();
    if (!db) return false;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(LOGIN_DURABLE_STORE, 'readwrite');
        tx.objectStore(LOGIN_DURABLE_STORE).delete(String(key));
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }
  function queueLoginDurableWrite(key, value) {
    if (!isLoginDurableKey(key)) return;
    loginDurableWriteChain = loginDurableWriteChain.catch(() => false).then(() => persistLoginDurable(key, value)).catch(() => false);
  }
  async function restoreLoginDurableGlobals() {
    const db = await openLoginDurableDb();
    if (!db) return 0;
    const rows = await new Promise(resolve => {
      try {
        const tx = db.transaction(LOGIN_DURABLE_STORE, 'readonly');
        const req = tx.objectStore(LOGIN_DURABLE_STORE).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
    let restored = 0;
    for (const row of rows) {
      const key = String(row?.key || '');
      if (!LOGIN_DURABLE_GLOBAL_KEYS.has(key)) continue;
      if (Storage.prototype.getItem.call(localStorage, key) != null) continue;
      const value = String(row?.value ?? '');
      loginOverflowMemory.set(key, value);
      try { Storage.prototype.setItem.call(localStorage, key, value); loginOverflowMemory.delete(key); } catch (_) {}
      restored += 1;
    }
    return restored;
  }
  const loginDurableGlobalsReady = restoreLoginDurableGlobals().catch(() => 0);

  const rawGet = key => loginOverflowMemory.has(String(key)) ? loginOverflowMemory.get(String(key)) : Storage.prototype.getItem.call(localStorage, key);
  const rawSet = (key, value) => {
    const stringKey = String(key);
    const stringValue = String(value);
    try {
      Storage.prototype.setItem.call(localStorage, stringKey, stringValue);
      loginOverflowMemory.delete(stringKey);
    } catch (error) {
      if (!isQuotaError(error) || !isLoginDurableKey(stringKey)) throw error;
      // إذا امتلأ localStorage لا نمنع تسجيل الدخول: نحفظ القيمة في IndexedDB
      // ونحتفظ بها في الذاكرة حتى تنتهي عملية الدخول الحالية.
      loginOverflowMemory.set(stringKey, stringValue);
    }
    queueLoginDurableWrite(stringKey, stringValue);
  };
  const rawRemove = key => {
    const stringKey = String(key);
    loginOverflowMemory.delete(stringKey);
    try { Storage.prototype.removeItem.call(localStorage, stringKey); } catch (_) {}
    loginDurableWriteChain = loginDurableWriteChain.catch(() => false).then(() => deleteLoginDurable(stringKey)).catch(() => false);
  };
  const rawKey = index => Storage.prototype.key.call(localStorage, index);
  const backendSettings = window.CASHTOP_TURSO || {};
  const backendBase = String(backendSettings.config?.databaseURL || '').replace(/\/+$/, '');
  const isPathProxy = backendSettings.backendMode === 'turso-http-rtdb' || /__turso_rtdb__(?:$|\?)/i.test(backendBase);
  function transportUrl(url) {
    if (!isPathProxy) return url;
    const raw = String(url || '');
    if (!raw.startsWith(backendBase)) return raw;
    let suffix = raw.slice(backendBase.length).replace(/^\/+/, '');
    const queryAt = suffix.indexOf('?');
    const pathPart = (queryAt >= 0 ? suffix.slice(0, queryAt) : suffix).replace(/\.json$/i, '');
    return `${backendBase}?path=${encodeURIComponent(pathPart)}`;
  }
  const TAB_SESSION_KEY = 'cashtop_tab_session_v2';
  const PERSISTENT_SESSION_KEY = 'cashtop_persistent_session_v1';
  const WINDOW_SESSION_PREFIX = 'CASHTOP_SESSION_V2:';
  const parse = (value, fallback) => { try { return JSON.parse(value) ?? fallback; } catch (_) { return fallback; } };
  const SERVER_CLOCK_KEY = 'cashtop_server_clock_v1';
  let observedServerClock = null;
  function observeServerClock(response, requestStartedAt = Date.now(), responseAt = Date.now()) {
    try {
      const header = response?.headers?.get?.('date');
      const serverAt = header ? new Date(header).getTime() : NaN;
      if (!Number.isFinite(serverAt)) return;
      const midpoint = requestStartedAt + Math.max(0, responseAt - requestStartedAt) / 2;
      const snapshot = { offsetMs: serverAt - midpoint, observedAt: Date.now(), source:'http-date' };
      observedServerClock = snapshot;
      rawSet(SERVER_CLOCK_KEY, JSON.stringify(snapshot));
    } catch (_) {}
  }
  function trustedNowMs() {
    const cached = observedServerClock || parse(rawGet(SERVER_CLOCK_KEY), null);
    const offset = Number(cached?.offsetMs);
    const observedAt = Number(cached?.observedAt);
    // احتفظ بتصحيح ساعة الجهاز لمدة 30 يوماً. هذا يمنع أجهزة اللابتوب ذات
    // الساعة/المنطقة الزمنية الخاطئة من رفض مفتاح نشط.
    if (Number.isFinite(offset) && Number.isFinite(observedAt) && Date.now() - observedAt < 30 * 86400000) return Date.now() + offset;
    const localNow = Date.now();
    // ساعة جهاز بعيدة جداً لا تصبح مرجع صلاحية. عند أول GET ناجح يتم تصحيحها
    // تلقائياً من Date header الخاص بالخادم.
    if (localNow < Date.UTC(2024,0,1) || localNow > Date.UTC(2038,0,1)) {
      const persisted = parse(rawGet(PERSISTENT_SESSION_KEY), {}) || {};
      const lastTrusted = Number(persisted.lastLicenseCheck || persisted.serverClockObservedAt || 0);
      if (lastTrusted >= Date.UTC(2024,0,1) && lastTrusted <= Date.UTC(2038,0,1)) return lastTrusted;
      // لا نرفض مفتاحاً نشطاً بسبب ساعة جهاز تالفة. أول طلب ناجح للخادم
      // يستبدل هذه القيمة مباشرةً بتوقيت Date header الموثوق.
      return Date.UTC(2026,7,7,12,0,0);
    }
    return localNow;
  }
  function loginSyncGateKey(session) {
    const tenant = String(session?.tenantId || session?.companyId || session?.licenseId || session?.companyKey || 'unassigned');
    return `ct_login_sync_gate_v1::${encodeURIComponent(tenant)}`;
  }
  function isLoginSyncGateComplete(session) {
    if (!session) return false;
    try {
      const state = parse(rawGet(loginSyncGateKey(session)), {}) || {};
      return state.completeOnline === true && String(state.loginAt || '') === String(session.loginAt || '');
    } catch (_) { return false; }
  }
  function nextPageAfterLogin(session) {
    return isLoginSyncGateComplete(session) ? 'لوحة التحكم.html' : 'sync.html';
  }

  function writeSession(session) {
    const serialized = JSON.stringify(session || {});
    try { sessionStorage.setItem(TAB_SESSION_KEY, serialized); } catch (_) {}
    // جلسة دائمة صريحة: تبقى بعد إغلاق المتصفح أو إعادة تشغيل الجهاز حتى يسجل المستخدم الخروج.
    try { rawSet(PERSISTENT_SESSION_KEY, serialized); } catch (_) {}
    try { window.name = WINDOW_SESSION_PREFIX + serialized; } catch (_) {}
  }
  function readTabSession() {
    try {
      const fromStorage = parse(sessionStorage.getItem(TAB_SESSION_KEY), null);
      if (fromStorage) return fromStorage;
    } catch (_) {}
    try {
      if (String(window.name || '').startsWith(WINDOW_SESSION_PREFIX)) {
        const fromWindow = parse(String(window.name).slice(WINDOW_SESSION_PREFIX.length), null);
        if (fromWindow) { try { sessionStorage.setItem(TAB_SESSION_KEY, JSON.stringify(fromWindow)); } catch (_) {} return fromWindow; }
      }
    } catch (_) {}
    try {
      const persistent = parse(rawGet(PERSISTENT_SESSION_KEY), null);
      if (persistent) {
        try { sessionStorage.setItem(TAB_SESSION_KEY, JSON.stringify(persistent)); } catch (_) {}
        try { window.name = WINDOW_SESSION_PREFIX + JSON.stringify(persistent); } catch (_) {}
        return persistent;
      }
    } catch (_) {}
    return null;
  }

  function decodeJsonValue(value, fallback = null) {
    let parsed = value;
    for (let i = 0; i < 3 && typeof parsed === 'string'; i += 1) {
      const decoded = parse(parsed, null);
      if (decoded === null) break;
      parsed = decoded;
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
        Object.prototype.hasOwnProperty.call(parsed, 'value') &&
        (parsed.valueEncoding || Object.prototype.hasOwnProperty.call(parsed, 'deleted') || Object.prototype.hasOwnProperty.call(parsed, 'updatedAt'))) {
      if (parsed.deleted === true) return fallback;
      return decodeJsonValue(parsed.value, fallback);
    }
    return parsed == null ? fallback : parsed;
  }

  function normalizeArray(value) {
    const parsed = decodeJsonValue(value, []);
    if (Array.isArray(parsed)) return parsed.filter(item => item != null);
    if (parsed && typeof parsed === 'object') {
      const recordHints = ['id', 'key', 'companyKey', 'tenantId', 'companyId', 'username', 'name', 'branchId', 'role'];
      if (recordHints.some(key => Object.prototype.hasOwnProperty.call(parsed, key))) return [parsed];
      return Object.entries(parsed).map(([key, item]) => {
        const decoded = decodeJsonValue(item, null);
        if (decoded && typeof decoded === 'object' && !Array.isArray(decoded) && decoded.id == null && !/^\d+$/.test(key)) return { ...decoded, id: key };
        return decoded;
      }).filter(item => item != null && typeof item === 'object');
    }
    return [];
  }

  function cleanupLegacyDemo() {
    const licenses = normalizeArray(rawGet('cashtop_admin_licenses')).filter(item => normalizeKey(item.key) !== 'CASHTOP-DEMO');
    const users = normalizeArray(rawGet('cashtop_admin_users')).filter(item => normalizeKey(item.companyKey) !== 'CASHTOP-DEMO');
    rawSet('cashtop_admin_licenses', JSON.stringify(licenses)); rawSet('cashtop_admin_users', JSON.stringify(users));
    if (normalizeKey(rawGet('cashtop_remembered_key')) === 'CASHTOP-DEMO') { rawRemove('cashtop_remembered_key'); }
  }

  function normalizeKey(value) { return String(value || '').trim().toUpperCase(); }
  function normalizeUsername(value) { return String(value || '').trim().toLowerCase(); }
  function accountIsActive(value) {
    if (!value || typeof value !== 'object') return false;
    if (value.active === false || value.disabled === true) return false;
    const status = String(value.status || '').trim().toLowerCase();
    return !['inactive', 'disabled', 'blocked', 'مجمد', 'معطل', 'موقوف'].includes(status);
  }
  function resolveBranch(branches, branchRef) {
    const list = normalizeArray(branches);
    const main = list.find(branch => branch?.isMain === true) || list.find(branch => String(branch?.id || '').toUpperCase() === 'MAIN') || list[0] || null;
    const ref = String(branchRef ?? '').trim();
    if (!ref || ref.toUpperCase() === 'MAIN') return main || { id: 'MAIN', name: 'الفرع الرئيسي', status: 'نشط', isMain: true };
    return list.find(branch => String(branch?.id) === ref) ||
      list.find(branch => String(branch?.name || '').trim() === ref) || null;
  }
  function sanitizeSegment(value) { return String(value || '').trim().replace(/[.#$\[\]\/]/g, '_'); }
  function namespaceKey(tenantId, key) { return `cashtop_data::${encodeURIComponent(tenantId)}::${key}`; }
  function metaKey(tenantId, key) { return `cashtop_meta::${encodeURIComponent(tenantId)}::${key}`; }
  function getTenantBindings() { return parse(rawGet('cashtop_tenant_bindings'), {}) || {}; }
  function setTenantBinding(companyKey, tenantId) {
    const key = normalizeKey(companyKey); const tenant = String(tenantId || '').trim();
    if (!key || !tenant) return;
    const bindings = getTenantBindings(); bindings[key] = tenant;
    rawSet('cashtop_tenant_bindings', JSON.stringify(bindings));
  }

  function datasetValue(companyNode, key, fallback) {
    const payload = companyNode?.datasets?.[key];
    if (payload && typeof payload === 'object' && (
      Object.prototype.hasOwnProperty.call(payload, 'value') ||
      Object.prototype.hasOwnProperty.call(payload, 'deleted') ||
      Object.prototype.hasOwnProperty.call(payload, 'updatedAt')
    )) {
      if (payload.deleted === true) return fallback;
      const rawValue = payload.value ?? fallback;
      return payload.valueEncoding === 'local-storage-json-v1' ? decodeJsonValue(rawValue, fallback) : decodeJsonValue(rawValue, rawValue);
    }
    return decodeJsonValue(payload, fallback);
  }


  function showStatus(message, type = 'info') {
    let box = document.getElementById('loginStatus');
    if (!box) {
      box = document.createElement('div');
      box.id = 'loginStatus';
      box.style.cssText = 'margin:0 0 14px;padding:9px 11px;border-radius:4px;font-size:12px;font-weight:700;line-height:1.7;display:none;';
      document.getElementById('loginForm')?.prepend(box);
    }
    const styles = {
      error: ['#fff0ef', '#b52b1f', '#f2b9b4'], success: ['#eaf8f0', '#087a43', '#a9dfc4'],
      info: ['#eef5fb', '#23668d', '#b8d7ea'], warning: ['#fff7e6', '#9b5b00', '#f2d295']
    }[type] || ['#eef5fb', '#23668d', '#b8d7ea'];
    box.style.background = styles[0]; box.style.color = styles[1]; box.style.border = `1px solid ${styles[2]}`;
    box.textContent = message; box.style.display = 'block';
  }

  function validateLicense(license) {
    if (!license) return { ok: false, message: 'مفتاح الشركة غير موجود أو لم تتم مزامنته بعد.' };
    if (license.status && license.status !== 'active') return { ok: false, message: 'تم إيقاف مفتاح الشركة. راجع مسؤول النظام.' };
    const start = license.startAt ? new Date(license.startAt).getTime() : 0;
    const end = license.endAt ? new Date(license.endAt).getTime() : 0;
    const now = trustedNowMs();
    /* المفاتيح في لوحة الإدارة تبدأ لحظة إنشائها ولا يوجد جدولة لبدء مستقبلي.
       لذلك status=active هو المرجع، ولا نرفض الدخول بسبب ساعة لابتوب متأخرة. */
    return { ok: true, start, end, now, expired: Boolean(end && Number.isFinite(end) && now >= end) };
  }

  function saveRemembered(key) {
    rawSet('cashtop_remembered_key', normalizeKey(key));
  }

  function findCompanyAccessByKey(companyKey) {
    const boundTenant = String(getTenantBindings()[companyKey] || '').trim();
    const matches = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = rawKey(i);
      if (!key || !key.endsWith('::cashtop_company_access')) continue;
      const access = decodeJsonValue(rawGet(key), null);
      if (!access || normalizeKey(access.companyKey) !== companyKey) continue;
      const tenantId = String(access.tenantId || access.companyId || '');
      if (boundTenant && tenantId !== boundTenant) continue;
      matches.push(access);
    }
    if (boundTenant) return matches.find(access => String(access.tenantId || access.companyId || '') === boundTenant) || null;
    return matches.length === 1 ? matches[0] : null;
  }

  function resolveLocalContext(companyKey) {
    const licenses = normalizeArray(rawGet('cashtop_admin_licenses'));
    const users = normalizeArray(rawGet('cashtop_admin_users'));
    const boundTenant = String(getTenantBindings()[companyKey] || '').trim();
    let license = licenses.find(item => normalizeKey(item.key) === companyKey && (!boundTenant || String(item.tenantId || item.companyId || item.id) === boundTenant)) || null;
    const accessFromScan = findCompanyAccessByKey(companyKey);
    if (!license && accessFromScan) {
      const tenantId = String(accessFromScan.tenantId || accessFromScan.companyId || sanitizeSegment(companyKey));
      license = {
        id: accessFromScan.licenseId || tenantId,
        key: companyKey,
        tenantId,
        companyId: tenantId,
        companyName: accessFromScan.companyName || 'الشركة',
        status: accessFromScan.status || 'active',
        plan: accessFromScan.plan || 'pro', customLimits: accessFromScan.customLimits || null,
        backupImportEnabled: accessFromScan.backupImportEnabled === true,
        startAt: accessFromScan.startAt || '',
        endAt: accessFromScan.endAt || ''
      };
      licenses.push(license);
      rawSet('cashtop_admin_licenses', JSON.stringify(licenses));
      setTenantBinding(companyKey, tenantId);
    }
    if (!license) return { license: null, users, access: accessFromScan, branches: [], employees: [], agents: [] };
    const tenantId = String(boundTenant || license.tenantId || license.companyId || license.id);
    const access = decodeJsonValue(rawGet(namespaceKey(tenantId, 'cashtop_company_access')), accessFromScan || {});
    if (access && Object.keys(access).length) {
      const accessTenant = String(access.tenantId || access.companyId || tenantId);
      if (accessTenant !== tenantId || (access.companyKey && normalizeKey(access.companyKey) !== companyKey)) {
        return { license: null, users: [], access: null, branches: [], employees: [], agents: [], tenantMismatch: true };
      }
    }
    const branches = normalizeArray(rawGet(namespaceKey(tenantId, 'cashtop_branches')));
    const employees = normalizeArray(rawGet(namespaceKey(tenantId, 'cashtop_employees')));
    const agents = normalizeArray(rawGet(namespaceKey(tenantId, 'cashtop_sales_agents')));
    return { license, users, access, branches, employees, agents, companyId: tenantId, tenantId };
  }

  function authenticateContext(context, companyKey, username, password) {
    context = {
      ...(context || {}),
      users: normalizeArray(context?.users),
      branches: normalizeArray(context?.branches),
      employees: normalizeArray(context?.employees),
      agents: normalizeArray(context?.agents)
    };
    const checked = validateLicense(context.license || context.access);
    if (!checked.ok) throw new Error(checked.message);
    const uname = normalizeUsername(username);
    let account = null;

    const contextTenant = String(context.tenantId || context.companyId || context.license?.tenantId || context.license?.companyId || '');
    const legacy = context.users.find(item =>
      normalizeKey(item.companyKey) === companyKey &&
      normalizeUsername(item.username) === uname &&
      (!contextTenant || String(item.tenantId || item.companyId || '') === contextTenant)
    );
    if (legacy) account = { ...legacy, role: legacy.role || 'admin' };

    const manager = context.access?.manager;
    if (!account && manager && normalizeUsername(manager.username) === uname) {
      account = {
        id: manager.id || `ADMIN_${uname}`,
        username: manager.username,
        password: manager.password,
        displayName: manager.displayName || manager.name || manager.username,
        role: 'admin', active: manager.active !== false,
        permissions: manager.permissions || {}
      };
    }

    if (!account) {
      const branch = context.branches.find(item => normalizeUsername(item.managerUsername) === uname);
      if (branch) {
        account = {
          id: branch.managerUserId || `BRM_${branch.id}`,
          username: branch.managerUsername,
          password: branch.managerPassword,
          displayName: branch.manager || branch.managerUsername,
          role: 'branch-admin', active: branch.managerActive !== false && (branch.isMain === true || accountIsActive(branch)),
          permissions: branch.managerPermissions || {}, branchRecordId: branch.id, branchId: branch.isMain === true ? 'MAIN' : branch.id, dataBranchId: branch.isMain === true ? 'MAIN' : branch.id, branchName: branch.name
        };
      }
    }

    if (!account) {
      const employee = context.employees.find(item => normalizeUsername(item.username) === uname);
      if (employee) {
        const employeeBranch = resolveBranch(context.branches, employee.branchRecordId || employee.branchId || employee.dataBranchId || 'MAIN');
        const isMain = employeeBranch?.isMain === true || String(employee.branchId || '').toUpperCase() === 'MAIN' || !employee.branchId;
        account = {
          id: employee.id, username: employee.username, password: employee.password,
          displayName: employee.name || employee.username, role: 'employee',
          active: accountIsActive(employee) && (isMain || accountIsActive(employeeBranch)),
          permissions: employee.permissions || {},
          branchRecordId: employeeBranch?.id || null,
          branchId: isMain ? 'MAIN' : (employeeBranch?.id || employee.branchId || 'MAIN'),
          dataBranchId: isMain ? 'MAIN' : (employeeBranch?.id || employee.branchId || 'MAIN'),
          branchName: employeeBranch?.name || employee.branchName || 'الفرع الرئيسي'
        };
      }
    }

    if (!account) {
      const agent = context.agents.find(item => normalizeUsername(item.username) === uname);
      if (agent) {
        const agentBranch = resolveBranch(context.branches, agent.branchRecordId || agent.branchId || 'MAIN');
        const isMain = !agent.branchId || String(agent.branchId).toUpperCase() === 'MAIN' || agentBranch?.isMain === true;
        const defaultPermissions = {
          'pos.access': true, 'sales.create': true, 'sales.print': true, 'sales.image': true,
          'sales.discount': true, 'sales.credit': true, 'sales.hold': true, 'sales.clearCart': true
        };
        account = {
          id: agent.id, username: agent.username, password: agent.password,
          displayName: `${agent.name || agent.username} (مندوب)`, role: 'representative',
          active: accountIsActive(agent) && agent.cashierAccess !== false && (isMain || accountIsActive(agentBranch)),
          permissions: { ...defaultPermissions, ...(agent.permissions || {}) },
          branchRecordId: agentBranch?.id || null,
          branchId: isMain ? 'MAIN' : (agentBranch?.id || agent.branchId || 'MAIN'),
          dataBranchId: isMain ? 'MAIN' : (agentBranch?.id || agent.branchId || 'MAIN'),
          branchName: agentBranch?.name || agent.branchName || 'الفرع الرئيسي'
        };
      }
    }

    if (!account || String(account.password ?? '') !== String(password)) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    if (account.active === false) throw new Error('تم تعطيل حساب المستخدم أو الفرع.');
    return account;
  }

  function saveSession(context, account, companyKey, remember) {
    const license = context.license || context.access;
    const tenantId = String(context.tenantId || context.companyId || license.tenantId || license.companyId || license.id || sanitizeSegment(companyKey));
    const session = {
      mode: 'local', uid: account.id, username: account.username, displayName: account.displayName || account.username,
      role: account.role || 'user', permissions: account.permissions || {}, branchRecordId: account.branchRecordId || null, branchId: account.branchId || (['admin','owner','company-admin'].includes(String(account.role||'').toLowerCase()) ? 'MAIN' : null), dataBranchId: account.dataBranchId || account.branchId || (['admin','owner','company-admin'].includes(String(account.role||'').toLowerCase()) ? 'MAIN' : null),
      branchName: account.branchName || '', companyKey, tenantId, companyId: tenantId,
      companyName: license.companyName || context.access?.companyName || 'الشركة',
      licenseId: license.id || license.licenseId || tenantId, licenseStart: license.startAt || '', licenseEnd: license.endAt || '',
      plan: license.plan || context.access?.plan || 'pro', customLimits: context.access?.customLimits || license.customLimits || null, status: license.status || 'active', subscriptionExpired: Boolean(license.endAt && trustedNowMs() >= new Date(license.endAt).getTime()), loginAt: new Date().toISOString(), lastLicenseCheck: trustedNowMs(),
      serverClockOffsetMs: Number((observedServerClock || parse(rawGet(SERVER_CLOCK_KEY), {}))?.offsetMs || 0),
      serverClockObservedAt: Number((observedServerClock || parse(rawGet(SERVER_CLOCK_KEY), {}))?.observedAt || 0)
    };
    writeSession(session);
    setTenantBinding(companyKey, tenantId);
    saveRemembered(companyKey);
    return session;
  }

  async function localLogin(key, username, password, remember) {
    const context = resolveLocalContext(key);
    if (context.tenantMismatch) throw new Error('تم منع فتح بيانات شركة أخرى لهذا المفتاح. أعد المزامنة من لوحة الإدارة.');
    if (!context.license && !context.access) throw new Error('مفتاح الشركة غير موجود محلياً.');
    const account = authenticateContext(context, key, username, password);
    saveSession(context, account, key, remember);
  }

  function loginTransportCandidates(url) {
    // لا يوجد API محلي داخل الاستضافة في النسخة المحمولة.
    return [transportUrl(url)];
  }

  async function fetchJson(url, timeout = 18000) {
    let lastError = null;
    for (const targetUrl of loginTransportCandidates(url)) {
      for (let attempt = 0; attempt < (navigator.onLine === false ? 1 : 2); attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const requestStartedAt = Date.now();
          const response = await fetch(targetUrl, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
          observeServerClock(response, requestStartedAt, Date.now());
          if ([408, 425, 429, 500, 502, 503, 504].includes(response.status) && attempt === 0) {
            await new Promise(resolve => setTimeout(resolve, 220));
            continue;
          }
          if (!response.ok) throw new Error(`تعذر قراءة بيانات الدخول من قاعدة البيانات (${response.status}).`);
          const type = String(response.headers.get('content-type') || '').toLowerCase();
          return await response.json();
        } catch (error) {
          lastError = error;
          if (attempt === 0 && navigator.onLine !== false) {
            await new Promise(resolve => setTimeout(resolve, 220));
            continue;
          }
        } finally { clearTimeout(timer); }
      }
    }
    throw lastError || new Error('تعذر قراءة بيانات الدخول من قاعدة البيانات.');
  }


  async function requestJson(url, options = {}, timeout = 22000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const targetUrl = transportUrl(url);
      let sendOptions = { ...options, signal:controller.signal, cache:'no-store' };
      if (isPathProxy && sendOptions.headers) {
        const headers = new Headers(sendOptions.headers);
        ['cache-control','pragma','if-match'].forEach(name => headers.delete(name));
        sendOptions = { ...sendOptions, headers };
      }
      const startedAt = Date.now();
      const response = await fetch(targetUrl, sendOptions);
      observeServerClock(response, startedAt, Date.now());
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(String(payload?.error?.message || payload?.error || `تعذر حفظ البيانات (${response.status}).`));
      }
      if (response.status === 204) return null;
      return await response.json().catch(() => null);
    } finally { clearTimeout(timer); }
  }

  function adminKeySegment(companyKey) { return sanitizeSegment(normalizeKey(companyKey)); }

  function normalizeAdminIndexEntry(entry) {
    const value = decodeJsonValue(entry, entry);
    if (typeof value === 'string') return { tenantId: value, companyId: value, key: '' };
    if (!value || typeof value !== 'object') return null;
    const tenantId = value.tenantId || value.companyId || value.id || value.company;
    return tenantId ? { ...value, tenantId, companyId: tenantId } : null;
  }

  async function findTenantViaAdminCompanies(companyKey, base, adminRoot) {
    /*
     * بعض الإصدارات القديمة كانت تحفظ الشركة داخل companies لكن keyIndex لا يتم
     * تحديثه دائماً. نجرب استعلاماً مفهرساً أولاً، ثم نقرأ companies فقط كخطة
     * احتياطية نادرة. هذا يمنع ظهور "المفتاح غير موجود" وهو مسجل فعلياً.
     */
    const queryUrl = `${base}/${adminRoot}/companies.json?orderBy=${encodeURIComponent('"key"')}&equalTo=${encodeURIComponent(JSON.stringify(companyKey))}`;
    let companies = null;
    try { companies = await fetchJson(queryUrl, 10000); }
    catch (error) { console.warn('[CASH TOP LOGIN] indexed companies fallback:', error); }
    if (!companies || typeof companies !== 'object' || !Object.keys(companies).length) {
      try { companies = await fetchJson(`${base}/${adminRoot}/companies.json`, 12000); }
      catch (error) { console.warn('[CASH TOP LOGIN] companies fallback:', error); return null; }
    }
    const match = Object.entries(companies || {}).find(([id, company]) => {
      if (!company || typeof company !== 'object') return false;
      return normalizeKey(company.key || company.companyKey) === companyKey && company.deleted !== true && String(company.status || 'active').toLowerCase() === 'active';
    });
    if (!match) return null;
    const [id, company] = match;
    const tenantId = String(company.tenantId || company.companyId || id || '').trim();
    return tenantId ? { tenantId, companyId: tenantId, key: company.key || companyKey, source: 'companies-fallback' } : null;
  }

  async function fetchLoginBootstrap(companyKey, tenantId) {
    const settings = window.CASHTOP_TURSO || {};
    const base = String(settings.config?.databaseURL || '').replace(/\/+$/, '');
    const root = String(settings.rootPath || 'cashTopExchange/cashTopPOS').replace(/^\/+|\/+$/g, '');
    const canonicalTenant = sanitizeSegment(tenantId);
    if (!base || !canonicalTenant) return null;
    const datasetUrl = key => `${base}/${root}/${canonicalTenant}/datasets/${sanitizeSegment(key)}.json`;

    // Low-usage login: company access already contains the company identity,
    // subscription and manager account. Do not fetch branches/employees or meta
    // until they are actually needed for a non-manager login.
    const accessPayload = await fetchJson(datasetUrl('cashtop_company_access'), 12000);
    const node = { meta: {}, datasets: { cashtop_company_access: accessPayload } };
    let access = datasetValue(node, 'cashtop_company_access', {}) || {};

    // Very old records may depend on /meta for identity. This is a compatibility
    // fallback only, so current accounts normally cost one company-row read here.
    if (!access.companyKey || !(access.tenantId || access.companyId)) {
      const meta = await fetchJson(`${base}/${root}/${canonicalTenant}/meta.json`, 9000).catch(() => ({}));
      node.meta = meta && typeof meta === 'object' ? meta : {};
      access = datasetValue(node, 'cashtop_company_access', {}) || {};
    }

    const remoteKey = normalizeKey(access.companyKey || node.meta.companyKey || companyKey);
    const remoteTenant = sanitizeSegment(access.tenantId || access.companyId || node.meta.tenantId || node.meta.companyId || canonicalTenant);
    if (remoteKey && remoteKey !== companyKey) {
      const mismatch = new Error('فهرس المفتاح يشير إلى شركة أخرى. تم إيقاف الدخول لحماية البيانات.');
      mismatch.code = 'CASHTOP_TENANT_INDEX_MISMATCH';
      throw mismatch;
    }
    if (remoteTenant && remoteTenant !== canonicalTenant) {
      const mismatch = new Error('معرّف الشركة في قاعدة البيانات لا يطابق المفتاح الحالي.');
      mismatch.code = 'CASHTOP_TENANT_INDEX_MISMATCH';
      throw mismatch;
    }
    return { root, companyId: canonicalTenant, tenantId: canonicalTenant, node, access };
  }

  async function fetchLoginActors(remote) {
    if (!remote?.tenantId && !remote?.companyId) return remote;
    const settings = window.CASHTOP_TURSO || {};
    const base = String(settings.config?.databaseURL || '').replace(/\/+$/, '');
    const root = String(remote.root || settings.rootPath || 'cashTopExchange/cashTopPOS').replace(/^\/+|\/+$/g, '');
    const tenantId = sanitizeSegment(remote.tenantId || remote.companyId);
    if (!base || !root || !tenantId) return remote;
    const datasetUrl = key => `${base}/${root}/${tenantId}/datasets/${sanitizeSegment(key)}.json`;
    const [branchesPayload, employeesPayload, agentsPayload] = await Promise.all([
      fetchJson(datasetUrl('cashtop_branches'), 10000).catch(() => null),
      fetchJson(datasetUrl('cashtop_employees'), 10000).catch(() => null),
      fetchJson(datasetUrl('cashtop_sales_agents'), 10000).catch(() => null)
    ]);
    const node = remote.node && typeof remote.node === 'object' ? remote.node : { meta: {}, datasets: {} };
    node.datasets = node.datasets && typeof node.datasets === 'object' ? node.datasets : {};
    if (branchesPayload != null) node.datasets.cashtop_branches = branchesPayload;
    if (employeesPayload != null) node.datasets.cashtop_employees = employeesPayload;
    if (agentsPayload != null) node.datasets.cashtop_sales_agents = agentsPayload;
    return { ...remote, node };
  }

  async function findRemoteCompanyViaAdminIndex(companyKey) {
    const settings = window.CASHTOP_TURSO || {}; const base = String(settings.config?.databaseURL || '').replace(/\/+$/,'');
    const adminRoot = String(settings.adminRootPath || 'cashTopExchange/cashTopAdmin').replace(/^\/+|\/+$/g,'');
    if (!base) return null;

    // لا نجعل فشل keyIndex (مفقود/قديم/طلب شبكي عابر) يعني أن المفتاح غير موجود.
    // نجرب الفهرس أولاً للسرعة، ثم سجل companies الموثوق كمصدر احتياطي مستقل.
    let indexedEntry = null;
    try {
      indexedEntry = normalizeAdminIndexEntry(await fetchJson(`${base}/${adminRoot}/keyIndex/${adminKeySegment(companyKey)}.json`, 9000));
    } catch (error) {
      console.warn('[CASH TOP LOGIN] keyIndex unavailable, trying companies:', error);
    }

    if (indexedEntry?.tenantId) {
      try {
        return await fetchLoginBootstrap(companyKey, indexedEntry.tenantId);
      } catch (error) {
        // قد يشير keyIndex قديم إلى tenant سابق. لا ندخل للمسار الخاطئ، بل نبحث
        // عن المفتاح نفسه داخل companies ثم نعيد التحقق من هوية tenant.
        console.warn('[CASH TOP LOGIN] stale keyIndex entry, trying companies:', error);
      }
    }

    try {
      const companyEntry = await findTenantViaAdminCompanies(companyKey, base, adminRoot);
      if (!companyEntry?.tenantId) return null;
      return await fetchLoginBootstrap(companyKey, companyEntry.tenantId);
    } catch (error) {
      console.warn('[CASH TOP LOGIN] admin companies lookup:', error);
      return null;
    }
  }

  async function findRemoteCompany(companyKey) {
    const indexed = await findRemoteCompanyViaAdminIndex(companyKey);
    if (indexed) return indexed;

    // لا نفحص جذر قاعدة البيانات كاملاً ولا نختار شركة بالتخمين. عند غياب
    // فهرس الإدارة نسمح فقط بمسار محلي معروف مسبقاً لنفس المفتاح (ترحيل قديم).
    const settings = window.CASHTOP_TURSO || {};
    const cfg = settings.config || {};
    const base = String(cfg.databaseURL || '').replace(/\/+$/, '');
    const boundTenant = sanitizeSegment(getTenantBindings()[companyKey] || '');
    if (!base || !boundTenant) return null;
    const roots = [...new Set([settings.rootPath || 'cashTopExchange/cashTopPOS', ...(settings.legacyRootPaths || [])])]
      .map(root => String(root || '').replace(/^\/+|\/+$/g, '')).filter(Boolean);
    const matches = [];
    for (const root of roots) {
      let remote;
      try {
        /* الجذر الرسمي يستخدم تحميل الدخول الخفيف. الجذور التاريخية نقرأ منها
           بيانات الوصول فقط بدلاً من تنزيل كل المنتجات والفواتير. */
        if (root === String(settings.rootPath || 'cashTopExchange/cashTopPOS').replace(/^\/+|\/+$/g, '')) {
          remote = await fetchLoginBootstrap(companyKey, boundTenant);
        } else {
          const datasetBase = `${base}/${root}/${boundTenant}`;
          const [meta, accessPayload, branchesPayload, employeesPayload, agentsPayload] = await Promise.all([
            fetchJson(`${datasetBase}/meta.json`, 9000).catch(() => ({})),
            fetchJson(`${datasetBase}/datasets/cashtop_company_access.json`, 10000),
            fetchJson(`${datasetBase}/datasets/cashtop_branches.json`, 9000).catch(() => null),
            fetchJson(`${datasetBase}/datasets/cashtop_employees.json`, 9000).catch(() => null),
            fetchJson(`${datasetBase}/datasets/cashtop_sales_agents.json`, 9000).catch(() => null)
          ]);
          const node = { meta: meta || {}, datasets: { cashtop_company_access: accessPayload } };
          if (branchesPayload != null) node.datasets.cashtop_branches = branchesPayload;
          if (employeesPayload != null) node.datasets.cashtop_employees = employeesPayload;
          if (agentsPayload != null) node.datasets.cashtop_sales_agents = agentsPayload;
          remote = { root, companyId: boundTenant, tenantId: boundTenant, node, access: datasetValue(node, 'cashtop_company_access', {}) || {} };
        }
      } catch (error) { console.warn('[CASH TOP LOGIN] database tenant path:', root, error); continue; }
      if (!remote?.node || typeof remote.node !== 'object') continue;
      const access = remote.access || {};
      const remoteKey = normalizeKey(access.companyKey || remote.node.meta?.companyKey || '');
      const tenantId = sanitizeSegment(access.tenantId || access.companyId || remote.node.meta?.tenantId || remote.node.meta?.companyId || boundTenant);
      if (remoteKey !== companyKey || tenantId !== boundTenant) continue;
      matches.push({ ...remote, root, companyId: tenantId, tenantId, access });
    }
    if (matches.length > 1) {
      const mismatch = new Error('تم العثور على أكثر من مسار لنفس الشركة. تم إيقاف الدخول لمنع خلط البيانات.');
      mismatch.code = 'CASHTOP_TENANT_MISMATCH';
      throw mismatch;
    }
    return matches[0] || null;
  }

  function hydrateRemoteCompany(remote, companyKey) {
    const tenantId = String(remote.access?.tenantId || remote.access?.companyId || remote.node?.meta?.tenantId || remote.node?.meta?.companyId || remote.tenantId || remote.companyId || '');
    const canonicalTenant = sanitizeSegment(tenantId);
    const remoteKey = normalizeKey(remote.access?.companyKey || remote.node?.meta?.companyKey || '');
    if (!canonicalTenant || remoteKey !== companyKey || canonicalTenant !== sanitizeSegment(remote.companyId || canonicalTenant)) {
      const mismatch = new Error('بيانات قاعدة البيانات لا تطابق المفتاح الحالي. تم إيقاف الاستيراد لحماية بيانات الشركات.');
      mismatch.code = 'CASHTOP_TENANT_MISMATCH';
      throw mismatch;
    }
    const companyId = canonicalTenant;
    setTenantBinding(companyKey, companyId);
    const datasets = remote.node?.datasets || {};
    Object.entries(datasets).forEach(([key, payload]) => {
      const value = datasetValue(remote.node, key, null);
      if (value === null) return;
      // New sync builds store the complete localStorage JSON as a string. Write
      // that string directly; JSON.stringify would double-encode it and turn
      // arrays such as branches/employees into strings on the next device.
      const storageValue = payload?.valueEncoding === 'local-storage-json-v1' && typeof payload?.value === 'string'
        ? payload.value
        : JSON.stringify(value);
      rawSet(namespaceKey(companyId, key), storageValue);
      rawSet(metaKey(companyId, key), JSON.stringify({
        updatedAt: Number(payload?.updatedAt || remote.node?.meta?.updatedAt || Date.now()),
        revision: Number(payload?.revision || 1), source: 'turso-login-bootstrap', seeded: false
      }));
    });

    const access = remote.access || {};
    let licenses = normalizeArray(rawGet('cashtop_admin_licenses')).filter(item => normalizeKey(item.key) !== companyKey || String(item.tenantId || item.companyId || item.id) === companyId);
    const license = {
      id: access.licenseId || companyId, key: companyKey, tenantId: companyId, companyId,
      companyName: access.companyName || remote.node?.meta?.companyName || 'الشركة',
      status: access.status || 'active', plan: access.plan || 'pro', customLimits: access.customLimits || null, backupImportEnabled: access.backupImportEnabled === true, startAt: access.startAt || '', endAt: access.endAt || '', authVersion: access.authVersion || access.updatedAt || 0
    };
    const idx = licenses.findIndex(item => normalizeKey(item.key) === companyKey);
    if (idx >= 0) licenses[idx] = { ...licenses[idx], ...license }; else licenses.push(license);
    rawSet('cashtop_admin_licenses', JSON.stringify(licenses));

    if (access.manager?.username) {
      const users = normalizeArray(rawGet('cashtop_admin_users')).filter(item => normalizeKey(item.companyKey) !== companyKey || String(item.tenantId || item.companyId || '') === companyId);
      const user = {
        id: access.manager.id || `ADMIN_${companyId}`, companyKey, tenantId: companyId, companyId,
        username: access.manager.username, password: access.manager.password,
        displayName: access.manager.displayName || access.manager.username,
        role: 'admin', active: access.manager.active !== false
      };
      const userIndex = users.findIndex(item => normalizeKey(item.companyKey) === companyKey && normalizeUsername(item.username) === normalizeUsername(user.username));
      if (userIndex >= 0) users[userIndex] = { ...users[userIndex], ...user }; else users.push(user);
      rawSet('cashtop_admin_users', JSON.stringify(users));
    }
    return companyId;
  }

  async function databaseLogin(key, username, password, remember) {
    let remote = await findRemoteCompany(key);
    if (!remote) throw new Error('لم يتم العثور على بيانات هذه الشركة في قاعدة البيانات.');
    hydrateRemoteCompany(remote, key);
    try {
      // Manager login usually finishes here after only key-index + access reads.
      await localLogin(key, username, password, remember);
      return;
    } catch (error) {
      const invalidCredentials = String(error?.message || '').includes('اسم المستخدم أو كلمة المرور غير صحيحة');
      const managerName = normalizeUsername(remote.access?.manager?.username || '');
      // If the attempted username is the manager, the access row is authoritative;
      // a wrong password must not trigger two unnecessary actor-dataset reads.
      if (!invalidCredentials || (managerName && managerName === normalizeUsername(username))) throw error;
    }

    // Branch/employee datasets are fetched only when a non-manager account needs
    // them and are then cached locally for later logins.
    remote = await fetchLoginActors(remote);
    hydrateRemoteCompany(remote, key);
    await localLogin(key, username, password, remember);
  }


  function registrationCurrencyPreset(value) {
    const text = String(value || 'شيكل (ILS)');
    if (/SAR|ريال/.test(text)) return { currency:'ريال سعودي', id:'SAR', name:'ريال سعودي', code:'SAR', symbol:'ر.س' };
    if (/AED|درهم/.test(text)) return { currency:'درهم إماراتي', id:'AED', name:'درهم إماراتي', code:'AED', symbol:'د.إ' };
    if (/EGP|جنيه/.test(text)) return { currency:'جنيه مصري', id:'EGP', name:'جنيه مصري', code:'EGP', symbol:'ج.م' };
    if (/JOD|دينار/.test(text)) return { currency:'دينار أردني', id:'JOD', name:'دينار أردني', code:'JOD', symbol:'د.أ' };
    return { currency:'شيكل', id:'ILS', name:'شيكل', code:'ILS', symbol:'₪' };
  }

  function registrationPayload(value, now, deviceId = 'self-register') {
    return { value:JSON.stringify(value), valueEncoding:'local-storage-json-v1', deleted:false, updatedAt:now, revision:1, deviceId, page:'صفحة تسجيل الدخول.html' };
  }

  const REGISTRATION_IMAGE_STORAGE = Object.freeze({
    storageZone:'amanwar1',
    pullHost:'amanwar1.b-cdn.net',
    accessKey:'bd094c93-3387-44e5-8ee02b4ff7c3-f22d-4060',
    rootFolder:'cashtop-images',
    maxSizeKB:50,
    maxDimension:500
  });

  function registrationSafePath(value, fallback='item') {
    const cleaned = String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    return (cleaned || fallback).slice(0, 80);
  }

  function registrationCanvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('تعذر تجهيز صورة الشعار.')), 'image/jpeg', quality));
  }

  async function compressRegistrationImage(file) {
    if (!(file instanceof Blob)) throw new Error('ملف الشعار غير صالح.');
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('تعذر قراءة الشعار.'));
      reader.onload = () => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('تعذر فك صورة الشعار.'));
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
    const width = Number(source.naturalWidth || source.width || 0);
    const height = Number(source.naturalHeight || source.height || 0);
    if (!width || !height) throw new Error('أبعاد الشعار غير صالحة.');
    const side = Math.min(width, height);
    const sx = Math.max(0, (width - side) / 2);
    const sy = Math.max(0, (height - side) / 2);
    const limitBytes = REGISTRATION_IMAGE_STORAGE.maxSizeKB * 1024;
    let target = Math.min(side, REGISTRATION_IMAGE_STORAGE.maxDimension);
    let best = null;
    while (target >= 64) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(target));
      canvas.height = canvas.width;
      const ctx = canvas.getContext('2d', { alpha:false });
      if (!ctx) throw new Error('تعذر تجهيز الشعار على هذا الجهاز.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(source,sx,sy,side,side,0,0,canvas.width,canvas.height);
      for (let quality = 0.88; quality >= 0.16; quality -= 0.08) {
        const blob = await registrationCanvasBlob(canvas, Math.max(0.16, quality));
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= limitBytes) return blob;
      }
      target = Math.floor(target * 0.78);
    }
    if (best && best.size <= limitBytes) return best;
    throw new Error('حجم الشعار كبير جداً بعد الضغط.');
  }

  async function uploadRegistrationLogo(file, tenantId) {
    if (!file) return '';
    const blob = await compressRegistrationImage(file);
    const tenant = registrationSafePath(tenantId, 'company');
    const unique = `company_logo_${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
    const path = `${REGISTRATION_IMAGE_STORAGE.rootFolder}/${tenant}/branding/${unique}`;
    const endpoint = `https://storage.bunnycdn.com/${REGISTRATION_IMAGE_STORAGE.storageZone}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(endpoint, {
      method:'PUT',
      headers:{ 'AccessKey':REGISTRATION_IMAGE_STORAGE.accessKey, 'Content-Type':'image/jpeg' },
      body:blob,
      cache:'no-store'
    });
    if (!response.ok) throw new Error(`تعذر رفع الشعار إلى قاعدة الصور (${response.status}).`);
    return `https://${REGISTRATION_IMAGE_STORAGE.pullHost}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  function registrationDefaultUnits(updatedAt) {
    return [
      { id:'DEF_KG_G', unitName:'كيلو', pieceName:'جم', piecesCount:1000, name:'كيلو', seededBy:'R110', updatedAt },
      { id:'DEF_L_MLM', unitName:'لتر', pieceName:'ملم', piecesCount:1000, name:'لتر', seededBy:'R110', updatedAt },
      { id:'DEF_CARTON_PC', unitName:'كرتونة', pieceName:'قطعة', piecesCount:24, name:'كرتونة', seededBy:'R110', updatedAt }
    ];
  }

  async function registerCompanyInAdmin({ base, adminRoot, company, key, tenantId }) {
    const keySegment = adminKeySegment(key);
    const updatedAt = Date.now();
    // cashTopAdmin محفوظ كوثيقة ذرية واحدة في Turso. الكتابة داخل
    // /companies/{id} وحدها لا تظهر عندما تكون الوثيقة الجذرية موجودة.
    // لذلك نستخدم JSON Merge PATCH على الجذر، تماماً كما لو تم إنشاء المفتاح من لوحة الأدمن.
    await requestJson(`${base}/${adminRoot}.json`, {
      method:'PATCH',
      headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},
      body:JSON.stringify({
        companies:{ [sanitizeSegment(tenantId)]:company },
        keyIndex:{ [keySegment]:{ tenantId, companyId:tenantId, key, updatedAt, source:'self-registration' } },
        retiredKeys:{ [keySegment]:null },
        updatedAt
      })
    }, 20000);

    // لا ندخل للنظام قبل إثبات أن المفتاح أصبح مرئياً فعلياً لطبقة الدخول/الأدمن.
    let last = null;
    for (let attempt=0; attempt<4; attempt += 1) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 180 * attempt));
      const [indexRow, companyRow] = await Promise.all([
        fetchJson(`${base}/${adminRoot}/keyIndex/${keySegment}.json`, 9000).catch(() => null),
        fetchJson(`${base}/${adminRoot}/companies/${sanitizeSegment(tenantId)}.json`, 9000).catch(() => null)
      ]);
      last = { indexRow, companyRow };
      const indexedTenant = String(indexRow?.tenantId || indexRow?.companyId || '');
      const companyTenant = String(companyRow?.tenantId || companyRow?.companyId || '');
      if (indexedTenant === String(tenantId) &&
          companyTenant === String(tenantId) &&
          normalizeKey(companyRow?.key || companyRow?.companyKey) === normalizeKey(key) &&
          String(companyRow?.plan || '').toLowerCase() === 'classic') {
        return true;
      }
    }
    console.warn('[CASH TOP REGISTER] admin verification failed', last);
    throw new Error('تعذر تثبيت مفتاح الشركة في قاعدة الإدارة. لم يتم فتح النظام؛ أعد المحاولة.');
  }

  function randomCompanyKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let body = '';
    if (crypto.getRandomValues) {
      const bytes = new Uint8Array(9); crypto.getRandomValues(bytes);
      bytes.forEach(byte => { body += chars[byte % chars.length]; });
    } else {
      for (let i=0;i<9;i++) body += chars[Math.floor(Math.random()*chars.length)];
    }
    return `CT-${body}`;
  }

  async function ensureRegistrationKey(candidate) {
    const settings = window.CASHTOP_TURSO || {};
    const base = String(settings.config?.databaseURL || '').replace(/\/+$/,'');
    const adminRoot = String(settings.adminRootPath || 'cashTopExchange/cashTopAdmin').replace(/^\/+|\/+$/g,'');
    if (!base) throw new Error('قاعدة البيانات غير مهيأة لإنشاء حساب جديد.');
    for (let attempt=0; attempt<8; attempt++) {
      const key = normalizeKey(attempt === 0 ? candidate : randomCompanyKey());
      if (!key) continue;
      const exists = await fetchJson(`${base}/${adminRoot}/keyIndex/${adminKeySegment(key)}.json`, 8000).catch(() => null);
      if (!exists) return key;
    }
    throw new Error('تعذر إنشاء مفتاح شركة فريد. حاول مرة أخرى.');
  }

  async function createClassicRegistration(form) {
    await loginDurableGlobalsReady;
    const settings = window.CASHTOP_TURSO || {};
    const base = String(settings.config?.databaseURL || '').replace(/\/+$/,'');
    const companyRoot = String(settings.rootPath || 'cashTopExchange/cashTopPOS').replace(/^\/+|\/+$/g,'');
    const adminRoot = String(settings.adminRootPath || 'cashTopExchange/cashTopAdmin').replace(/^\/+|\/+$/g,'');
    if (!base) throw new Error('يتطلب إنشاء الحساب اتصالاً بقاعدة البيانات.');

    const requestedKey = normalizeKey(form.companyKey || '');
    const username = String(form.username || '').trim();
    const password = String(form.password || '');
    if (!requestedKey || !username || !password) throw new Error('المطلوب فقط: مفتاح الشركة واسم المستخدم وكلمة المرور.');
    if (password.length < 4) throw new Error('كلمة المرور قصيرة جداً.');
    const key = await ensureRegistrationKey(requestedKey);
    const companyName = String(form.companyName || '').trim() || `شركة ${key.slice(-6)}`;
    const phone = String(form.phone || '').trim();
    const email = String(form.email || '').trim();
    const address = String(form.address || '').trim();
    const now = Date.now();
    const startedAt = new Date(now).toISOString();
    const endAt = new Date(now + 7 * 86400000).toISOString();
    const tenantId = sanitizeSegment(`TENANT_${now}_${crypto.randomUUID ? crypto.randomUUID().slice(0,8) : Math.random().toString(36).slice(2,10)}`);
    const currency = registrationCurrencyPreset(form.currencyText);
    const logo = form.logoFile ? await uploadRegistrationLogo(form.logoFile, tenantId) : '';
    const authVersion = now;
    const company = {
      tenantId, companyId:tenantId, companyName, key, managerUsername:username, managerPassword:password,
      plan:'classic', customLimits:{daily:{invoices:null,customers:null,expenses:null,suppliers:null},fixed:{employees:null,warehouses:null,branches:null,products:null}}, status:'active', backupImportEnabled:false,
      durationUnit:'day', durationQuantity:7, startAt:startedAt, endAt, authVersion,
      createdAt:startedAt, updatedAt:startedAt, selfRegistered:true
    };
    const access = {
      tenantId, companyId:tenantId, companyKey:key, companyName, status:'active', plan:'classic', customLimits:{daily:{invoices:null,customers:null,expenses:null,suppliers:null},fixed:{employees:null,warehouses:null,branches:null,products:null}},
      startAt:startedAt, endAt, durationUnit:'day', durationQuantity:7, backupImportEnabled:false,
      authVersion, updatedAt:now,
      manager:{ id:`ADMIN_${tenantId}`, username, password, displayName:'مدير الشركة', role:'admin', active:true, permissions:{}, authVersion }
    };
    const appSettings = {
      companyName, phone, email, address, currency:currency.currency, logo, logoStorage:'image-service',
      baseCurrencyId:currency.id, multiCurrencyEnabled:false,
      currencies:[{id:currency.id,name:currency.name,code:currency.code,symbol:currency.symbol,ratePer100Base:100,isBase:true}],
      createdFromRegistration:true, updatedAt:startedAt
    };
    const branches = [{ id:'BR-01', name:'الفرع الرئيسي', address, manager:'', managerUsername:'', managerPassword:'', managerActive:false, status:'نشط', allowTransfer:false, isMain:true, isDefault:true, locked:true, createdAt:startedAt }];
    const units = registrationDefaultUnits(startedAt);
    const datasets = { cashtop_company_access:access, cashtop_settings:appSettings, cashtop_branches:branches, cashtop_units:units };
    const stamps = {};
    for (const [dataset,value] of Object.entries(datasets)) {
      const stamp = Date.now(); stamps[dataset] = stamp;
      await requestJson(`${base}/${companyRoot}/${sanitizeSegment(tenantId)}/datasets/${sanitizeSegment(dataset)}.json`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(registrationPayload(value,stamp))
      }, 20000);
    }
    await requestJson(`${base}/${companyRoot}/${sanitizeSegment(tenantId)}/meta.json`, {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
        tenantId, companyId:tenantId, companyKey:key, companyName, schema:19, datasetStampSchema:1,
        datasetStamps:stamps, changedKeys:Object.keys(datasets), updatedAt:Date.now(), managedBy:'self-registration'
      })
    }, 20000);
    await registerCompanyInAdmin({ base, adminRoot, company, key, tenantId });

    setTenantBinding(key,tenantId);
    rawSet(namespaceKey(tenantId,'cashtop_company_access'),JSON.stringify(access));
    rawSet(metaKey(tenantId,'cashtop_company_access'),JSON.stringify({updatedAt:now,revision:1,source:'self-registration',seeded:false}));
    rawSet(namespaceKey(tenantId,'cashtop_settings'),JSON.stringify(appSettings));
    rawSet(metaKey(tenantId,'cashtop_settings'),JSON.stringify({updatedAt:now+1,revision:1,source:'self-registration',seeded:false}));
    rawSet(namespaceKey(tenantId,'cashtop_branches'),JSON.stringify(branches));
    rawSet(metaKey(tenantId,'cashtop_branches'),JSON.stringify({updatedAt:now+2,revision:1,source:'self-registration',seeded:false}));
    rawSet(namespaceKey(tenantId,'cashtop_units'),JSON.stringify(units));
    rawSet(metaKey(tenantId,'cashtop_units'),JSON.stringify({updatedAt:now+3,revision:1,source:'self-registration',seeded:false}));
    return { key, username, password, tenantId };
  }

  async function handleRegister(event) {
    event?.preventDefault?.();
    const button = document.getElementById('registerButton');
    const password = document.getElementById('regPassword')?.value || '';
    const confirmPassword = document.getElementById('regConfirmPassword')?.value || '';
    if (confirmPassword && password !== confirmPassword) return showStatus('كلمتا المرور غير متطابقتين.', 'warning');
    const form = {
      companyName:document.getElementById('regCompanyName')?.value,
      phone:document.getElementById('regPhone')?.value,
      email:document.getElementById('regEmail')?.value,
      address:document.getElementById('regAddress')?.value,
      currencyText:document.getElementById('selected-currency-text')?.textContent || 'شيكل (ILS)',
      logoFile:document.getElementById('logo-upload')?.files?.[0] || null,
      companyKey:document.getElementById('generated-key')?.value,
      username:document.getElementById('regUsername')?.value,
      password
    };
    if (button) { button.disabled=true; button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i><span>جاري إنشاء الحساب...</span>'; }
    showStatus('جاري إنشاء حساب الشركة وتجهيز المزامنة...', 'info');
    try {
      const created = await createClassicRegistration(form);
      const keyField = document.getElementById('generated-key'); if (keyField) keyField.value = created.key;
      const loginKey = document.getElementById('companyKey'); if (loginKey) loginKey.value = created.key;
      const loginUser = document.getElementById('username'); if (loginUser) loginUser.value = created.username;
      const loginPass = document.getElementById('password'); if (loginPass) loginPass.value = created.password;
      showStatus('تم إنشاء الحساب بنجاح. جاري فتح النظام...', 'success');
      await databaseLogin(created.key,created.username,created.password,true);
      await loginDurableWriteChain.catch(()=>false);
      setTimeout(()=>location.replace(nextPageAfterLogin(readTabSession())),120);
    } catch (error) {
      console.error(error); showStatus(error?.message || 'تعذر إنشاء الحساب.', 'error');
      if (button) { button.disabled=false; button.innerHTML='<span>إنشاء الحساب مجاناً</span><i class="fa-solid fa-rocket"></i>'; }
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    await loginDurableGlobalsReady;
    const key = normalizeKey(document.getElementById('companyKey').value);
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const remember = true;
    const button = document.querySelector('.btn-login');
    if (!key || !username || !password) return showStatus('أكمل جميع بيانات الدخول.', 'warning');
    button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...';
    showStatus('جاري التحقق من الحساب والمفتاح...', 'info');
    try {
      let remoteError = null;
      let authenticated = false;
      // نجرب قاعدة البيانات مباشرة؛ navigator.onLine قد يعطي false رغم وجود اتصال فعلي.
      if (window.CASHTOP_TURSO?.enabled) {
        try { await databaseLogin(key, username, password, remember); authenticated = true; }
        catch (error) {
          remoteError = error;
          if (['CASHTOP_TENANT_INDEX_MISMATCH','CASHTOP_TENANT_MISMATCH'].includes(String(error?.code || ''))) throw error;
        }
      }
      if (!authenticated) {
        try { await localLogin(key, username, password, remember); authenticated = true; }
        catch (localError) {
          throw remoteError || localError;
        }
      }
      await loginDurableWriteChain.catch(() => false);
      showStatus('تم تسجيل الدخول بنجاح. جاري تجهيز المزامنة...', 'success');
      const loggedSession = readTabSession();
      setTimeout(() => location.replace(nextPageAfterLogin(loggedSession)), 80);
    } catch (error) {
      console.error(error);
      let message = String(error.message || 'تعذر تسجيل الدخول.');
      if (/مدة المفتاح.*(?:لم تبدأ|لم تبدا)|المفتاح.*(?:لم يبدأ|لم يبدا|لم تبدأ|لم تبدا)/i.test(message)) {
        message = 'تم تجاهل وقت البداية القديم للمفتاح. أعد المحاولة بعد تحديث الصفحة إذا كانت هذه رسالة من نسخة مخزنة قديمة.';
      }
      if (String(error.code || '').includes('invalid-credential')) message = 'اسم المستخدم أو كلمة المرور غير صحيحة.';
      showStatus(message, 'error');
      button.disabled = false; button.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول للنظام';
    }
  }

  function displayReason() {
    const reason = new URLSearchParams(location.search).get('reason');
    const messages = {
      expired: 'انتهى الاشتراك. يمكنك تسجيل الدخول وقراءة بياناتك، بينما تتطلب الإضافة والتعديل تجديد الباقة.', stopped: 'تم إيقاف مفتاح الشركة، وتم تسجيل خروجك تلقائياً.',
      deleted: 'تم حذف مفتاح الشركة أو لم يعد متاحاً.', 'user-disabled': 'تم تعطيل حساب المستخدم أو الفرع.',
      'auth-required': 'انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.', 'device-limit': 'تم الوصول إلى الحد الأقصى للأجهزة المسموح بها لهذا المفتاح.',
      'permission-denied': 'لا يملك هذا الحساب صلاحية لفتح أي قسم. راجع مدير النظام.',
      'tenant-mismatch': 'تم منع فتح مسار بيانات لا يخص هذا المفتاح لحماية بيانات الشركات.'
    };
    if (reason && messages[reason]) showStatus(messages[reason], 'warning');
  }

  cleanupLegacyDemo();
  window.handleLogin = handleLogin;
  window.handleRegister = handleRegister;
  window.generateRegistrationKey = randomCompanyKey;
  window.addEventListener('DOMContentLoaded', () => {
    const existingSession = readTabSession();
    if (existingSession && existingSession.status !== 'stopped' && !new URLSearchParams(location.search).get('reason')) {
      location.replace(nextPageAfterLogin(existingSession)); return;
    }
    const rememberedKey = rawGet('cashtop_remembered_key');
    if (rememberedKey) {
      document.getElementById('companyKey').value = rememberedKey;
    }
    const header = document.querySelector('.login-header');
    if (header && !header.querySelector('img')) {
      const img = document.createElement('img'); img.src = 'cashtop-logo.png'; img.alt = 'CASH TOP';
      img.style.cssText = 'width:82px;height:82px;object-fit:cover;border-radius:16px;margin-bottom:10px;box-shadow:0 5px 18px rgba(96,92,168,.2);';
      header.prepend(img);
    }
    displayReason();
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    (async () => {
      try {
        const registration = await navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' });
        // لا نفرض فحص الشبكة عند كل فتح لصفحة الدخول؛ عامل الخدمة والكاش الحاليان يكفيان.
        const worker = registration.active || registration.waiting || registration.installing;
        worker?.postMessage?.({ type: 'VERIFY_CACHE' });
        const ready = await navigator.serviceWorker.ready;
        ready.active?.postMessage?.({ type: 'WARM_CACHE' });
      } catch (error) {
        console.warn('[CASH TOP 2] SW:', error);
      }
    })();
  }
})();
