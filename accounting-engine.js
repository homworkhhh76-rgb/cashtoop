(function () {
  'use strict';
  if (!window.Cashtop) return;

  const core = window.Cashtop;
  const CHART_KEY = 'cashtop_chart_accounts';
  const MANUAL_KEY = 'cashtop_manual_journal_entries';
  const OPENING_KEY = 'cashtop_chart_opening_balances';
  const CHART_TX_KEY = 'cashtop_chart_transactions';
  const SOURCE_KEYS = new Set([
    'cashtop_invoices', 'cashtop_sales_reversals', 'cashtop_sales_returns', 'cashtop_purchases', 'cashtop_purchase_reversals', 'cashtop_purchase_returns',
    'cashtop_material_purchases', 'cashtop_expenses', 'cashtop_vouchers', 'cashtop_workers', 'cashtop_salary_payments', 'cashtop_funds_db',
    'cashtop_journal_reversal_archive', 'cashtop_opening_balances', CHART_KEY, MANUAL_KEY, OPENING_KEY, CHART_TX_KEY
  ]);

  const parse = (key, fallback = []) => {
    try { const value = JSON.parse(localStorage.getItem(key)); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  };
  const n = value => Number.parseFloat(value) || 0;
  const round = value => Number(n(value).toFixed(2));
  const text = (value, fallback = '') => (value == null || value === '') ? fallback : String(value);
  const nowIso = () => new Date().toISOString();
  const uid = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const normalizeCode = value => String(value ?? '').trim().replace(/\s+/g, '');
  let lineSequence = new Map();

  const DEFAULT_CHART = Object.freeze([
    { id:'CA_ASSETS', code:'1000', name:'الأصول', parentId:'root', category:'asset', nature:'debit', postable:false, system:true, systemRole:'ASSETS' },
    { id:'CA_CURRENT_ASSETS', code:'1010', name:'الأصول المتداولة', parentId:'CA_ASSETS', category:'asset', nature:'debit', postable:false, system:true, systemRole:'CURRENT_ASSETS' },
    { id:'CA_CASH_BANKS', code:'1020', name:'النقدية والبنوك', parentId:'CA_CURRENT_ASSETS', category:'asset', nature:'debit', postable:false, system:true, systemRole:'CASH_BANKS' },
    { id:'CA_AR', code:'1100', name:'العملاء (الذمم المدينة)', parentId:'CA_CURRENT_ASSETS', category:'asset', nature:'debit', postable:true, system:true, systemRole:'AR' },
    { id:'CA_INVENTORY', code:'1200', name:'مخزون البضاعة', parentId:'CA_CURRENT_ASSETS', category:'asset', nature:'debit', postable:true, system:true, systemRole:'INVENTORY' },
    { id:'CA_RAW_INVENTORY', code:'1210', name:'مخزون المواد الخام', parentId:'CA_CURRENT_ASSETS', category:'asset', nature:'debit', postable:true, system:true, systemRole:'RAW_INVENTORY' },
    { id:'CA_INPUT_TAX', code:'1300', name:'ضريبة مدخلات قابلة للاسترداد', parentId:'CA_CURRENT_ASSETS', category:'asset', nature:'debit', postable:true, system:true, systemRole:'INPUT_TAX' },
    { id:'CA_EMP_ADV', code:'1400', name:'سلف وذمم الموظفين والعمال', parentId:'CA_CURRENT_ASSETS', category:'asset', nature:'debit', postable:true, system:true, systemRole:'EMPLOYEE_ADVANCES' },
    { id:'CA_OTHER_CURRENT_ASSETS', code:'1900', name:'أصول متداولة أخرى', parentId:'CA_CURRENT_ASSETS', category:'asset', nature:'debit', postable:true, system:true, systemRole:'OTHER_CURRENT_ASSETS' },
    { id:'CA_FIXED_ASSETS', code:'1500', name:'الأصول غير المتداولة', parentId:'CA_ASSETS', category:'asset', nature:'debit', postable:false, system:true, systemRole:'FIXED_ASSETS' },
    { id:'CA_PPE', code:'1510', name:'ممتلكات ومعدات', parentId:'CA_FIXED_ASSETS', category:'asset', nature:'debit', postable:true, system:true, systemRole:'PPE' },
    { id:'CA_REAL_ESTATE', code:'1511', name:'أراضي وعقارات ومحلات', parentId:'CA_FIXED_ASSETS', category:'asset', nature:'debit', postable:false, system:true, systemRole:'REAL_ESTATE_GROUP' },
    { id:'CA_VEHICLES', code:'1520', name:'سيارات ومركبات', parentId:'CA_FIXED_ASSETS', category:'asset', nature:'debit', postable:false, system:true, systemRole:'VEHICLES_GROUP' },
    { id:'CA_FURNITURE', code:'1530', name:'أثاث وتجهيزات', parentId:'CA_FIXED_ASSETS', category:'asset', nature:'debit', postable:false, system:true, systemRole:'FURNITURE_GROUP' },
    { id:'CA_EQUIPMENT', code:'1540', name:'آلات ومعدات', parentId:'CA_FIXED_ASSETS', category:'asset', nature:'debit', postable:false, system:true, systemRole:'EQUIPMENT_GROUP' },
    { id:'CA_ACC_DEP', code:'1590', name:'مجمع الإهلاك', parentId:'CA_FIXED_ASSETS', category:'asset', nature:'credit', postable:true, system:true, systemRole:'ACCUM_DEPRECIATION' },

    { id:'CA_LIABILITIES', code:'2000', name:'الخصوم والالتزامات', parentId:'root', category:'liability', nature:'credit', postable:false, system:true, systemRole:'LIABILITIES' },
    { id:'CA_CURRENT_LIABILITIES', code:'2010', name:'الخصوم المتداولة', parentId:'CA_LIABILITIES', category:'liability', nature:'credit', postable:false, system:true, systemRole:'CURRENT_LIABILITIES' },
    { id:'CA_AP', code:'2100', name:'الموردون (الذمم الدائنة)', parentId:'CA_CURRENT_LIABILITIES', category:'liability', nature:'credit', postable:true, system:true, systemRole:'AP' },
    { id:'CA_CUSTOMER_CREDITS', code:'2200', name:'أرصدة دائنة للعملاء', parentId:'CA_CURRENT_LIABILITIES', category:'liability', nature:'credit', postable:true, system:true, systemRole:'CUSTOMER_CREDITS' },
    { id:'CA_OUTPUT_TAX', code:'2300', name:'ضريبة مخرجات مستحقة', parentId:'CA_CURRENT_LIABILITIES', category:'liability', nature:'credit', postable:true, system:true, systemRole:'OUTPUT_TAX' },
    { id:'CA_SALARY_PAYABLE', code:'2400', name:'رواتب وأجور مستحقة', parentId:'CA_CURRENT_LIABILITIES', category:'liability', nature:'credit', postable:true, system:true, systemRole:'SALARY_PAYABLE' },
    { id:'CA_PUR_NO_SUP', code:'2190', name:'ذمم مشتريات بدون مورد', parentId:'CA_CURRENT_LIABILITIES', category:'liability', nature:'credit', postable:true, system:true, systemRole:'PURCHASE_NO_SUPPLIER' },
    { id:'CA_LOANS', code:'2500', name:'قروض وتمويل', parentId:'CA_LIABILITIES', category:'liability', nature:'credit', postable:false, system:true, systemRole:'LOANS_GROUP' },
    { id:'CA_OTHER_LIABILITIES', code:'2900', name:'التزامات أخرى', parentId:'CA_LIABILITIES', category:'liability', nature:'credit', postable:false, system:true, systemRole:'OTHER_LIABILITIES' },
    { id:'CA_MISC_CLEARING', code:'2990', name:'حسابات وتسويات متنوعة', parentId:'CA_OTHER_LIABILITIES', category:'liability', nature:'credit', postable:true, system:true, systemRole:'MISC_CLEARING' },
    { id:'CA_EXTERNAL_SETTLEMENT', code:'2995', name:'تسوية مدفوعة خارج الصندوق', parentId:'CA_OTHER_LIABILITIES', category:'liability', nature:'credit', postable:true, system:true, systemRole:'EXTERNAL_SETTLEMENT' },

    { id:'CA_EQUITY', code:'3000', name:'حقوق الملكية', parentId:'root', category:'equity', nature:'credit', postable:false, system:true, systemRole:'EQUITY' },
    { id:'CA_CAPITAL', code:'3100', name:'رأس المال', parentId:'CA_EQUITY', category:'equity', nature:'credit', postable:true, system:true, systemRole:'CAPITAL' },
    { id:'CA_OWNER_CURRENT', code:'3200', name:'جاري المالك / الشركاء', parentId:'CA_EQUITY', category:'equity', nature:'credit', postable:true, system:true, systemRole:'OWNER_CURRENT' },
    { id:'CA_RETAINED', code:'3300', name:'الأرباح المحتجزة', parentId:'CA_EQUITY', category:'equity', nature:'credit', postable:true, system:true, systemRole:'RETAINED_EARNINGS' },
    { id:'CA_DRAWINGS', code:'3400', name:'مسحوبات المالك / الشركاء', parentId:'CA_EQUITY', category:'equity', nature:'debit', postable:true, system:true, systemRole:'OWNER_DRAWINGS' },
    { id:'CA_OPENING_CLEARING', code:'3900', name:'مقابل الأرصدة الافتتاحية', parentId:'CA_EQUITY', category:'equity', nature:'credit', postable:true, system:true, systemRole:'OPENING_CLEARING' },

    { id:'CA_REVENUE', code:'4000', name:'الإيرادات', parentId:'root', category:'revenue', nature:'credit', postable:false, system:true, systemRole:'REVENUE' },
    { id:'CA_SALES', code:'4100', name:'إيرادات المبيعات', parentId:'CA_REVENUE', category:'revenue', nature:'credit', postable:true, system:true, systemRole:'SALES' },
    { id:'CA_SALES_RETURNS', code:'4200', name:'مردودات ومسموحات المبيعات', parentId:'CA_REVENUE', category:'revenue', nature:'debit', postable:true, system:true, systemRole:'SALES_RETURNS' },
    { id:'CA_SERVICE_REVENUE', code:'4300', name:'إيرادات الخدمات', parentId:'CA_REVENUE', category:'revenue', nature:'credit', postable:true, system:true, systemRole:'SERVICE_REVENUE' },
    { id:'CA_OTHER_REVENUE', code:'4900', name:'إيرادات أخرى', parentId:'CA_REVENUE', category:'revenue', nature:'credit', postable:true, system:true, systemRole:'OTHER_REVENUE' },

    { id:'CA_EXPENSES', code:'5000', name:'التكاليف والمصروفات', parentId:'root', category:'expense', nature:'debit', postable:false, system:true, systemRole:'EXPENSES' },
    { id:'CA_COGS_GROUP', code:'5050', name:'تكلفة المبيعات', parentId:'CA_EXPENSES', category:'expense', nature:'debit', postable:false, system:true, systemRole:'COGS_GROUP' },
    { id:'CA_COGS', code:'5100', name:'تكلفة البضاعة المباعة', parentId:'CA_COGS_GROUP', category:'expense', nature:'debit', postable:true, system:true, systemRole:'COGS' },
    { id:'CA_OPEX', code:'5150', name:'المصروفات التشغيلية', parentId:'CA_EXPENSES', category:'expense', nature:'debit', postable:false, system:true, systemRole:'OPEX_GROUP' },
    { id:'CA_GENERAL_EXPENSE', code:'5200', name:'مصروفات تشغيلية عامة', parentId:'CA_OPEX', category:'expense', nature:'debit', postable:true, system:true, systemRole:'GENERAL_EXPENSE' },
    { id:'CA_RENT_EXPENSE', code:'5210', name:'إيجارات', parentId:'CA_OPEX', category:'expense', nature:'debit', postable:true, system:true, systemRole:'RENT_EXPENSE' },
    { id:'CA_UTILITIES_EXPENSE', code:'5220', name:'كهرباء ومياه واتصالات', parentId:'CA_OPEX', category:'expense', nature:'debit', postable:true, system:true, systemRole:'UTILITIES_EXPENSE' },
    { id:'CA_MARKETING_EXPENSE', code:'5230', name:'تسويق ودعاية', parentId:'CA_OPEX', category:'expense', nature:'debit', postable:true, system:true, systemRole:'MARKETING_EXPENSE' },
    { id:'CA_TRANSPORT_EXPENSE', code:'5240', name:'نقل ومواصلات', parentId:'CA_OPEX', category:'expense', nature:'debit', postable:true, system:true, systemRole:'TRANSPORT_EXPENSE' },
    { id:'CA_WASTAGE', code:'5300', name:'هالك وفاقد مخزون', parentId:'CA_OPEX', category:'expense', nature:'debit', postable:true, system:true, systemRole:'WASTAGE_EXPENSE' },
    { id:'CA_WAGES', code:'5250', name:'رواتب وأجور', parentId:'CA_OPEX', category:'expense', nature:'debit', postable:true, system:true, systemRole:'WAGES_EXPENSE' },
    { id:'CA_SALES_TAX_EXP', code:'5400', name:'ضريبة مبيعات محمولة على المنشأة', parentId:'CA_OPEX', category:'expense', nature:'debit', postable:true, system:true, systemRole:'SALES_TAX_EXPENSE' },
    { id:'CA_OTHER_EXPENSE', code:'5900', name:'مصروفات أخرى', parentId:'CA_OPEX', category:'expense', nature:'debit', postable:true, system:true, systemRole:'OTHER_EXPENSE' }
  ]);

  function safeWrite(key, value) {
    try {
      if (core.isSubscriptionExpired?.()) return false;
      if (core.isFinancialGroupReadOnly?.() && [MANUAL_KEY, OPENING_KEY].includes(key)) return false;
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) { return false; }
  }

  function normalizeChartAccount(account) {
    const category = ['asset','liability','equity','revenue','expense'].includes(account?.category) ? account.category : 'asset';
    const nature = ['debit','credit'].includes(account?.nature) ? account.nature : (['asset','expense'].includes(category) ? 'debit' : 'credit');
    return {
      id: text(account?.id, uid('CA')),
      code: normalizeCode(account?.code || account?.id),
      name: text(account?.name, 'حساب'),
      parentId: text(account?.parentId, 'root'),
      category,
      nature,
      postable: account?.postable !== false,
      system: account?.system === true,
      systemRole: text(account?.systemRole),
      active: account?.active !== false,
      externalRef: account?.externalRef && typeof account.externalRef === 'object' ? { ...account.externalRef } : null,
      currencyId: text(account?.currencyId),
      entityKind: text(account?.entityKind),
      notes: text(account?.notes),
      createdAt: account?.createdAt || nowIso(),
      updatedAt: account?.updatedAt || account?.createdAt || nowIso()
    };
  }

  function hashText(value) {
    let hash = 2166136261;
    const str = String(value || '');
    for (let i = 0; i < str.length; i += 1) { hash ^= str.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0);
  }
  function stableRecordId(prefix, record, suffix = '') {
    const existing = record && (record.id ?? record.refNumber ?? record.reference ?? record.number ?? record.code);
    if (existing != null && String(existing).trim()) return String(existing).trim();
    return `${prefix}_${hashText(`${JSON.stringify(record || {})}|${suffix}`)}`;
  }

  function fundCode(fundId, occupied) {
    const base = `1029${String(hashText(fundId) % 100000000).padStart(8,'0')}`;
    if (!occupied.has(base)) return base;
    let i = 1;
    while (occupied.has(`${base}${i}`)) i += 1;
    return `${base}${i}`;
  }

  function currentFundsDb() {
    const db = parse('cashtop_funds_db', { accounts:[], accountLogs:[] }) || {};
    if (!Array.isArray(db.accounts)) db.accounts = [];
    if (!Array.isArray(db.accountLogs)) db.accountLogs = [];
    return db;
  }

  function currentFunds() { return currentFundsDb().accounts; }

  function isDescendantOrSelf(accountId, ancestorId, accounts = chartAccounts({ includeInactive:true, persist:false })) {
    let current = accounts.find(row => String(row.id) === String(accountId));
    const seen = new Set();
    while (current && !seen.has(String(current.id))) {
      if (String(current.id) === String(ancestorId)) return true;
      seen.add(String(current.id));
      current = accounts.find(row => String(row.id) === String(current.parentId));
    }
    return false;
  }

  function isCashBankAccount(accountOrId, accounts = chartAccounts({ includeInactive:true, persist:false })) {
    const cashParent = accounts.find(row => row.systemRole === 'CASH_BANKS');
    const id = typeof accountOrId === 'object' ? accountOrId?.id : accountOrId;
    return !!cashParent && !!id && isDescendantOrSelf(id, cashParent.id, accounts);
  }

  function nextChildCode(parentId, options = {}) {
    const accounts = chartAccounts({ includeInactive:true, persist:false });
    const parent = accounts.find(row => String(row.id) === String(parentId));
    const siblings = accounts.filter(row => String(row.parentId) === String(parentId));
    const numeric = siblings.map(row => Number.parseInt(String(row.code), 10)).filter(Number.isFinite);
    if (numeric.length) return String(Math.max(...numeric) + 1);
    const base = String(parent?.code || options.fallback || '9').replace(/\D/g,'') || '9';
    let candidate = `${base}1`; const occupied = new Set(accounts.map(row => String(row.code)));
    while (occupied.has(candidate)) candidate = String(Number(candidate) + 1);
    return candidate;
  }

  function atomicWrite(changes, label = 'chart-accounting') {
    if (core.atomicSetItems) return core.atomicSetItems(changes, { label });
    Object.entries(changes).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
    return { changed:true, keys:Object.keys(changes) };
  }

  function syncFundForChartAccount(account, options = {}) {
    if (!account) return { account, fund:null, fundsDb:currentFundsDb(), changed:false };
    const accounts = Array.isArray(options.accounts) ? options.accounts : chartAccounts({ includeInactive:true, persist:false });
    if (!isCashBankAccount(account, accounts) || account.postable === false) return { account, fund:null, fundsDb:currentFundsDb(), changed:false };
    const fundsDb = currentFundsDb();
    let fund = null;
    if (account.externalRef?.type === 'fund') fund = fundsDb.accounts.find(row => String(row.id) === String(account.externalRef.id));
    if (!fund) fund = fundsDb.accounts.find(row => String(row.chartAccountId || '') === String(account.id));
    let changed = false;
    if (!fund) {
      const id = `FUND_CA_${hashText(account.id).toString(36)}_${Date.now().toString(36)}`;
      const type = String(options.fundType || account.entityKind || '').trim() || (/بنك|bank/i.test(account.name) ? 'بنكي' : 'كاش');
      fund = { id, name:account.name, type, balance:0, currencyId:account.currencyId || window.CashtopMulti?.getCurrencyConfig?.()?.baseCurrencyId || 'ILS', notes:`مرتبط تلقائياً بشجرة الحسابات ${account.code}`, chartAccountId:account.id, active:true };
      fundsDb.accounts.push(fund); changed = true;
    } else {
      if (fund.name !== account.name) { fund.name = account.name; changed = true; }
      if (account.currencyId && fund.currencyId !== account.currencyId) { fund.currencyId = account.currencyId; changed = true; }
      if (String(fund.chartAccountId || '') !== String(account.id)) { fund.chartAccountId = account.id; changed = true; }
      if (fund.active === false) { fund.active = true; changed = true; }
    }
    const patch = { ...account, externalRef:{ type:'fund', id:String(fund.id), managedBy:'chart' }, currencyId:fund.currencyId, entityKind:account.entityKind || fund.type, updatedAt:nowIso() };
    return { account:patch, fund, fundsDb, changed:true };
  }

  function transactions() {
    const rows = parse(CHART_TX_KEY, []);
    return Array.isArray(rows) ? rows.filter(row => row && row.status !== 'void') : [];
  }

  function updateLinkedFundBalance(accountId, deltaBase, transaction, fundsDb) {
    const account = accountById(accountId, { persist:false });
    if (!account?.externalRef || account.externalRef.type !== 'fund') return false;
    const fund = fundsDb.accounts.find(row => String(row.id) === String(account.externalRef.id));
    if (!fund) return false;
    const currencyId = fund.currencyId || window.CashtopMulti?.getCurrencyConfig?.()?.baseCurrencyId || 'ILS';
    const nativeDelta = window.CashtopMulti?.fromBase?.(Math.abs(deltaBase), currencyId) ?? Math.abs(deltaBase);
    const incoming = deltaBase > 0;
    fund.balance = round(n(fund.balance) + (incoming ? nativeDelta : -nativeDelta));
    fundsDb.accountLogs.push({
      id:`CTX_LOG_${transaction.id}_${account.id}`, sourceType:'chartTransaction', sourceId:transaction.id, accountId:fund.id,
      date:transaction.date || nowIso(), type:incoming?'إيداع':'سحب', amount:round(nativeDelta), baseAmount:round(Math.abs(deltaBase)), currencyId,
      notes:transaction.description || `حركة محاسبية على ${account.name}`
    });
    return true;
  }

  function postTransaction(input = {}) {
    const amount = round(Math.abs(n(input.amount)));
    if (!amount) throw new Error('أدخل قيمة أكبر من صفر.');
    const debitAccount = accountById(input.debitAccountId, { persist:false });
    const creditAccount = accountById(input.creditAccountId, { persist:false });
    if (!debitAccount?.postable || debitAccount.active === false) throw new Error('حساب المدين غير صالح للترحيل.');
    if (!creditAccount?.postable || creditAccount.active === false) throw new Error('حساب الدائن غير صالح للترحيل.');
    if (String(debitAccount.id) === String(creditAccount.id)) throw new Error('لا يمكن أن يكون الحساب المدين والدائن هو نفسه.');
    const rows = transactions();
    const tx = {
      id:text(input.id, uid('CTX')), date:text(input.date, nowIso()).slice(0,10), amount,
      debitAccountId:debitAccount.id, creditAccountId:creditAccount.id,
      description:text(input.description, `حركة محاسبية: ${debitAccount.name} / ${creditAccount.name}`), reference:text(input.reference),
      sourceType:text(input.sourceType,'chart-transaction'), sourceId:text(input.sourceId), createdAt:nowIso(), status:'posted'
    };
    rows.push(tx);
    const fundsDb = currentFundsDb();
    // رصيد الحساب المالي يزيد عندما يكون مديناً وينخفض عندما يكون دائناً.
    updateLinkedFundBalance(debitAccount.id, amount, tx, fundsDb);
    updateLinkedFundBalance(creditAccount.id, -amount, tx, fundsDb);
    atomicWrite({ [CHART_TX_KEY]:rows, cashtop_funds_db:fundsDb }, 'post-chart-transaction');
    scheduleRebuild(10);
    return tx;
  }

  function reverseTransaction(id, reason = 'عكس حركة شجرة الحسابات') {
    const rows = transactions();
    const original = rows.find(row => String(row.id) === String(id));
    if (!original) throw new Error('الحركة غير موجودة.');
    if (original.reversedBy) throw new Error('تم عكس هذه الحركة سابقاً.');
    const reversalId = uid('CTX_REV');
    const reversal = postTransaction({ id:reversalId, date:new Date().toISOString().slice(0,10), amount:original.amount, debitAccountId:original.creditAccountId, creditAccountId:original.debitAccountId, description:`${reason}: ${original.description}`, reference:original.id, sourceType:'chart-transaction-reversal', sourceId:original.id });
    const latest = parse(CHART_TX_KEY, []); const idx = latest.findIndex(row => String(row.id) === String(id));
    if (idx >= 0) { latest[idx] = { ...latest[idx], reversedBy:reversal.id, reversedAt:nowIso() }; safeWrite(CHART_TX_KEY, latest); }
    return reversal;
  }

  function ensureChart(options = {}) {
    let stored = parse(CHART_KEY, []);
    if (!Array.isArray(stored)) stored = [];
    const normalized = stored.map(normalizeChartAccount).filter(row => row.code && row.name);
    const byRole = new Map(normalized.filter(row => row.systemRole).map(row => [row.systemRole, row]));
    let changed = false;

    DEFAULT_CHART.forEach(seed => {
      if (byRole.has(seed.systemRole)) return;
      const row = normalizeChartAccount(seed);
      normalized.push(row); byRole.set(row.systemRole, row); changed = true;
    });

    const cashParent = byRole.get('CASH_BANKS');
    const occupied = new Set(normalized.map(row => row.code));
    const fundsDb = currentFundsDb(); let fundsChanged = false;
    const activeFunds = fundsDb.accounts.filter(fund => core.isFundActive ? core.isFundActive(fund) : fund?.active !== false);
    const activeFundIds = new Set(activeFunds.map(fund => String(fund?.id ?? '').trim()).filter(Boolean));
    activeFunds.forEach(fund => {
      const fundId = String(fund?.id ?? '').trim();
      if (!fundId) return;
      const existing = normalized.find(row => row.externalRef?.type === 'fund' && String(row.externalRef.id) === fundId);
      if (existing) {
        if (existing.externalRef?.managedBy !== 'chart' && fund.name && existing.name !== fund.name) { existing.name = fund.name; changed = true; }
        if (!existing.currencyId && fund.currencyId) { existing.currencyId = fund.currencyId; changed = true; }
        if (String(fund.chartAccountId || '') !== String(existing.id)) { fund.chartAccountId = existing.id; fundsChanged = true; }
        if (existing.active === false) { existing.active = true; existing.archivedAt = ''; changed = true; }
        if (changed) existing.updatedAt = nowIso();
        return;
      }
      const code = fundCode(fundId, occupied); occupied.add(code);
      const linkedRow = normalizeChartAccount({
        id:`CA_FUND_${hashText(fundId).toString(36)}`, code, name:text(fund.name,'صندوق / حساب'), parentId:cashParent?.id || 'CA_CASH_BANKS',
        category:'asset', nature:'debit', postable:true, system:false, systemRole:'', currencyId:fund.currencyId||'', entityKind:fund.type||'fund', externalRef:{ type:'fund', id:fundId, managedBy:'fund' }
      });
      normalized.push(linkedRow);
      fund.chartAccountId = linkedRow.id; fundsChanged = true;
      changed = true;
    });
    normalized.filter(row => row.externalRef?.type === 'fund').forEach(row => {
      if (!activeFundIds.has(String(row.externalRef.id)) && row.active !== false) {
        row.active = false; row.archivedAt = row.archivedAt || nowIso(); row.updatedAt = nowIso(); changed = true;
      }
    });

    if (options.persist !== false && !core.isSubscriptionExpired?.() && !core.isFinancialGroupReadOnly?.()) {
      const writes = {};
      if (changed || normalized.length !== stored.length) writes[CHART_KEY] = normalized;
      if (fundsChanged) writes.cashtop_funds_db = fundsDb;
      if (Object.keys(writes).length) atomicWrite(writes, 'ensure-chart-links');
    }
    return normalized;
  }

  function chartAccounts(options = {}) {
    const rows = ensureChart(options);
    return options.includeInactive === true ? rows : rows.filter(row => row.active !== false);
  }

  function accountById(id, options = {}) { return chartAccounts({ includeInactive:true, persist:options.persist }).find(row => String(row.id) === String(id)) || null; }
  function accountByCode(code, options = {}) { return chartAccounts({ includeInactive:true, persist:options.persist }).find(row => String(row.code) === String(code)) || null; }
  function accountByRole(role, options = {}) { return chartAccounts({ includeInactive:true, persist:options.persist }).find(row => row.systemRole === role) || null; }
  function roleCode(role, fallback) { return accountByRole(role)?.code || fallback; }
  function roleName(role, fallback) { return accountByRole(role)?.name || fallback; }
  function fundChartAccount(fundId, fallbackName = 'الصندوق / الحساب') {
    const id = String(fundId ?? '').trim();
    const found = chartAccounts({ includeInactive:true }).find(row => row.externalRef?.type === 'fund' && String(row.externalRef.id) === id);
    return found || { id:`LEGACY_FUND_${id}`, code:id || '1110', name:fallbackName, category:'asset', nature:'debit', postable:true, active:true };
  }

  function descendantsOf(accountId, accounts = chartAccounts({ includeInactive:true })) {
    const ids = new Set([String(accountId)]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      accounts.forEach(row => {
        if (ids.has(String(row.parentId)) && !ids.has(String(row.id))) { ids.add(String(row.id)); expanded = true; }
      });
    }
    ids.delete(String(accountId));
    return accounts.filter(row => ids.has(String(row.id)));
  }

  function accountUsed(account) {
    if (!account) return false;
    const codes = new Set([account.code, ...descendantsOf(account.id).map(row => row.code)].map(String));
    return parse('cashtop_journal', []).some(row => codes.has(String(row?.accountCode || '')) && (n(row?.debit) || n(row?.credit))) ||
      parse(MANUAL_KEY, []).some(entry => (entry?.lines || []).some(row => String(row.accountId) === String(account.id)));
  }

  function validateAccountInput(input, currentId = '') {
    const accounts = chartAccounts({ includeInactive:true });
    const current = currentId ? accounts.find(row => String(row.id) === String(currentId)) : null;
    const code = normalizeCode(input.code);
    const name = String(input.name || '').trim();
    if (!code) throw new Error('أدخل كود الحساب.');
    if (!/^[A-Za-z0-9._-]+$/.test(code)) throw new Error('كود الحساب يقبل أرقاماً وحروفاً إنجليزية و - _ . فقط.');
    if (!name) throw new Error('أدخل اسم الحساب.');
    if (accounts.some(row => String(row.code) === code && String(row.id) !== String(currentId))) throw new Error('كود الحساب مستخدم مسبقاً.');
    const parentId = String(input.parentId || 'root');
    if (parentId !== 'root' && !accounts.some(row => String(row.id) === parentId)) throw new Error('الحساب الأب غير موجود.');
    if (current && descendantsOf(current.id, accounts).some(row => String(row.id) === parentId)) throw new Error('لا يمكن نقل الحساب داخل أحد فروعه.');
    const parent = accounts.find(row => String(row.id) === parentId);
    const category = parent ? parent.category : (['asset','liability','equity','revenue','expense'].includes(input.category) ? input.category : 'asset');
    const nature = ['debit','credit'].includes(input.nature) ? input.nature : (parent?.nature || (['asset','expense'].includes(category) ? 'debit':'credit'));
    return { code, name, parentId, category, nature, postable: input.postable !== false, currencyId:text(input.currencyId), entityKind:text(input.entityKind), notes:text(input.notes) };
  }

  function addChartAccount(input) {
    const data = validateAccountInput(input);
    let accounts = chartAccounts({ includeInactive:true });
    let row = normalizeChartAccount({ id:uid('CA'), ...data, system:false, active:true });
    accounts.push(row);
    let fundsDb = currentFundsDb();
    if (isCashBankAccount(row, accounts) && row.postable !== false) {
      const linked = syncFundForChartAccount(row, { fundType:input.fundType || input.entityKind, accounts });
      row = linked.account; fundsDb = linked.fundsDb;
      accounts = accounts.map(item => String(item.id) === String(row.id) ? row : item);
    }
    atomicWrite({ [CHART_KEY]:accounts, cashtop_funds_db:fundsDb }, 'add-chart-account');
    const openingAmount = round(Math.abs(n(input.openingAmount)));
    if (openingAmount > 0) {
      const counterpart = accountById(input.counterpartAccountId || '', { persist:false }) || accountByRole('CAPITAL', { persist:false });
      if (!counterpart?.postable || String(counterpart.id) === String(row.id)) throw new Error('اختر حساباً مقابلاً صالحاً للقيمة الابتدائية.');
      if (row.nature === 'credit') postTransaction({ amount:openingAmount, debitAccountId:counterpart.id, creditAccountId:row.id, date:input.openingDate, description:input.openingDescription || `إثبات القيمة الابتدائية لـ ${row.name}`, sourceType:'account-opening-linked', sourceId:row.id });
      else postTransaction({ amount:openingAmount, debitAccountId:row.id, creditAccountId:counterpart.id, date:input.openingDate, description:input.openingDescription || `إثبات القيمة الابتدائية لـ ${row.name}`, sourceType:'account-opening-linked', sourceId:row.id });
    }
    return accountById(row.id, { persist:false }) || row;
  }

  function updateChartAccount(id, input) {
    const accounts = chartAccounts({ includeInactive:true });
    const index = accounts.findIndex(row => String(row.id) === String(id));
    if (index < 0) throw new Error('الحساب غير موجود.');
    const current = accounts[index];
    const proposed = validateAccountInput({ ...current, ...input }, id);
    if (current.system) {
      proposed.code = current.code; proposed.parentId = current.parentId; proposed.category = current.category; proposed.nature = current.nature; proposed.postable = current.postable;
    } else if (proposed.code !== current.code && accountUsed(current)) {
      throw new Error('لا يمكن تغيير كود حساب عليه حركات. يمكنك تعديل الاسم أو إنشاء حساب جديد.');
    }
    accounts[index] = { ...current, ...proposed, updatedAt:nowIso() };
    let fundsDb = currentFundsDb();
    if (isCashBankAccount(accounts[index], accounts) && accounts[index].postable !== false) {
      const linked = syncFundForChartAccount(accounts[index], { fundType:input.fundType || input.entityKind });
      accounts[index] = linked.account; fundsDb = linked.fundsDb;
    }
    atomicWrite({ [CHART_KEY]:accounts, cashtop_funds_db:fundsDb }, 'update-chart-account');
    return accounts[index];
  }

  function deleteChartAccount(id) {
    const accounts = chartAccounts({ includeInactive:true });
    const index = accounts.findIndex(row => String(row.id) === String(id));
    if (index < 0) throw new Error('الحساب غير موجود.');
    const current = accounts[index];
    if (current.system) throw new Error('هذا حساب نظامي مرتبط بالقيود ولا يمكن حذفه. يمكن تعديل اسمه فقط.');
    if (accounts.some(row => row.active !== false && String(row.parentId) === String(id))) throw new Error('احذف أو انقل الحسابات الفرعية أولاً.');
    const fundsDb = currentFundsDb();
    const linkedFundId = current.externalRef?.type === 'fund' ? String(current.externalRef.id) : '';
    if (linkedFundId) fundsDb.accounts = fundsDb.accounts.filter(row => String(row.id) !== linkedFundId);
    if (accountUsed(current)) {
      accounts[index] = { ...current, active:false, archivedAt:nowIso(), updatedAt:nowIso() };
      atomicWrite({ [CHART_KEY]:accounts, cashtop_funds_db:fundsDb }, 'archive-chart-account');
      return { archived:true, account:accounts[index] };
    }
    const next = accounts.filter(row => String(row.id) !== String(id));
    atomicWrite({ [CHART_KEY]:next, cashtop_funds_db:fundsDb }, 'delete-chart-account');
    return { archived:false, account:current };
  }

  function restoreChartAccount(id) {
    const accounts = chartAccounts({ includeInactive:true });
    const index = accounts.findIndex(row => String(row.id) === String(id));
    if (index < 0) throw new Error('الحساب غير موجود.');
    accounts[index] = { ...accounts[index], active:true, archivedAt:'', updatedAt:nowIso() };
    let fundsDb=currentFundsDb();
    if (isCashBankAccount(accounts[index], accounts) && accounts[index].postable !== false) { const linked=syncFundForChartAccount(accounts[index]); accounts[index]=linked.account; fundsDb=linked.fundsDb; }
    atomicWrite({ [CHART_KEY]:accounts, cashtop_funds_db:fundsDb }, 'restore-chart-account');
    return accounts[index];
  }

  function openingBalances() {
    const rows = parse(OPENING_KEY, []);
    return Array.isArray(rows) ? rows : [];
  }

  function setOpeningBalance(accountId, debit = 0, credit = 0, date = '') {
    const account = accountById(accountId);
    if (!account || account.postable === false) throw new Error('اختر حساباً قابلاً للترحيل.');
    debit = Math.max(0, n(debit)); credit = Math.max(0, n(credit));
    if (debit > 0 && credit > 0) throw new Error('الرصيد الافتتاحي يكون مديناً أو دائناً وليس الاثنين.');
    const rows = openingBalances().filter(row => String(row.accountId) !== String(accountId));
    if (debit || credit) rows.push({ id:`OPEN_${accountId}`, accountId, debit:round(debit), credit:round(credit), date:date || new Date().toISOString().slice(0,10), updatedAt:nowIso() });
    if (!safeWrite(OPENING_KEY, rows)) throw new Error('تعذر حفظ الرصيد الافتتاحي.');
    return true;
  }

  function manualEntries() {
    const rows = parse(MANUAL_KEY, []);
    return Array.isArray(rows) ? rows : [];
  }

  function validateManualEntry(entry) {
    const accounts = chartAccounts({ includeInactive:true });
    const lines = (Array.isArray(entry?.lines) ? entry.lines : []).map(row => ({
      accountId:String(row.accountId || ''), debit:round(Math.max(0,n(row.debit))), credit:round(Math.max(0,n(row.credit))), notes:text(row.notes)
    })).filter(row => row.accountId && (row.debit || row.credit));
    if (lines.length < 2) throw new Error('القيد اليدوي يحتاج سطرين على الأقل.');
    lines.forEach(row => {
      const account = accounts.find(acc => String(acc.id) === row.accountId);
      if (!account || account.active === false || account.postable === false) throw new Error('أحد الحسابات غير صالح للترحيل.');
      if (row.debit > 0 && row.credit > 0) throw new Error('لا يجوز أن يكون السطر مديناً ودائناً معاً.');
    });
    const debit = round(lines.reduce((sum,row)=>sum+row.debit,0));
    const credit = round(lines.reduce((sum,row)=>sum+row.credit,0));
    if (Math.abs(debit-credit) > 0.01) throw new Error(`القيد غير متوازن. الفرق ${Math.abs(debit-credit).toFixed(2)}.`);
    if (debit <= 0) throw new Error('قيمة القيد يجب أن تكون أكبر من صفر.');
    return { lines, debit, credit };
  }

  function saveManualEntry(entry) {
    const checked = validateManualEntry(entry);
    const rows = manualEntries();
    const id = String(entry.id || uid('MJE'));
    const index = rows.findIndex(row => String(row.id) === id);
    const record = {
      id, date:entry.date || new Date().toISOString().slice(0,10), reference:text(entry.reference), description:text(entry.description,'قيد يدوي'),
      lines:checked.lines, branchId:text(entry.branchId, core.branchIdFromSession?.() || 'MAIN'), status:'posted',
      createdAt:index >= 0 ? rows[index].createdAt : nowIso(), updatedAt:nowIso()
    };
    if (index >= 0) rows[index] = record; else rows.push(record);
    if (!safeWrite(MANUAL_KEY, rows)) throw new Error('تعذر حفظ القيد اليدوي.');
    return record;
  }

  function deleteManualEntry(id) {
    const rows = manualEntries();
    const next = rows.filter(row => String(row.id) !== String(id));
    if (next.length === rows.length) return false;
    if (!safeWrite(MANUAL_KEY, next)) throw new Error('تعذر حذف القيد اليدوي.');
    return true;
  }

  function line(entryId, sourceType, sourceId, date, accountCode, accountName, debit, credit, description, extra = {}) {
    const seq = (lineSequence.get(entryId) || 0) + 1;
    lineSequence.set(entryId, seq);
    return {
      id: `${entryId}_L${String(seq).padStart(3,'0')}`,
      entryId, sourceType, sourceId, date: date || nowIso(), accountCode, accountName,
      debit: round(debit), credit: round(credit), description, ...extra
    };
  }

  function purpose(role, fallbackCode, fallbackName) {
    const account = accountByRole(role);
    return { code:account?.code || fallbackCode, name:account?.name || fallbackName, id:account?.id || '' };
  }

  function invoiceCost(invoice) {
    return (invoice.items || []).reduce((sum, item) => {
      const quantity = n(item.qty);
      const factor = window.CashtopMulti?.factorForUnit?.(item, item.selectedUnit)
        ?? (item.selectedUnit === 'unit' ? n(item.piecesPerUnit || 1) : 1);
      const pieces = quantity * Math.max(0.000001, n(factor) || 1);
      const allocations = Array.isArray(item.lotAllocations) ? item.lotAllocations : [];
      if (allocations.length) {
        const allocatedPieces = allocations.reduce((total, row) => total + Math.max(0, n(row.quantityPieces)), 0);
        const allocatedCost = allocations.reduce((total, row) => total + Math.max(0, n(row.quantityPieces)) * Math.max(0, n(row.cost)), 0);
        const fallbackCost = Number.isFinite(Number(item.costPerPiece)) ? n(item.costPerPiece) : n(item.cost || item.costPrice || 0);
        return sum + allocatedCost + Math.max(0, pieces - allocatedPieces) * fallbackCost;
      }
      const costPerPiece = Number.isFinite(Number(item.costPerPiece)) ? n(item.costPerPiece) : n(item.cost || item.costPrice || 0);
      return sum + pieces * costPerPiece;
    }, 0);
  }

  function paymentRows(source, paid, fallbackAccountId, fallbackAccountName) {
    if (!(paid > 0)) return [];
    if (Array.isArray(source?.payments) && source.payments.length) {
      const rows = source.payments.map(payment => {
        const chart = fundChartAccount(payment.accountId, payment.accountName || fallbackAccountName);
        return { accountCode:chart.code, accountName:chart.name, amount:Math.max(0,n(payment.baseAmount || payment.amountBase || 0)) };
      }).filter(row => row.amount > 0);
      const assigned = rows.reduce((sum,row)=>sum+row.amount,0);
      if (assigned + 0.01 < paid) {
        const chart = fundChartAccount(fallbackAccountId, fallbackAccountName);
        rows.push({ accountCode:chart.code, accountName:chart.name, amount:paid-assigned });
      }
      return rows;
    }
    const chart = fundChartAccount(fallbackAccountId, fallbackAccountName);
    return [{ accountCode:chart.code, accountName:chart.name, amount:paid }];
  }

  function appendSaleJournal(journal, inv, options = {}) {
    if (!inv || typeof inv !== 'object' || inv.status === 'draft') return;
    const id = stableRecordId('INV', inv);
    const total = Math.max(0,n(inv.total));
    const paid = Math.min(total, Math.max(0,n(inv.paid)));
    const debt = Math.max(0, n(inv.debt || (total-paid)));
    const tax = Math.min(Math.max(0,n(inv.tax)), Math.max(total, n(inv.subtotal) + Math.max(0,n(inv.tax))));
    const bearer = text(inv.taxSettings?.salesBearer, 'customer');
    const customerBearsTax = bearer !== 'business';
    const revenue = Math.max(0, total - (customerBearsTax ? tax : 0));
    const date = options.date || inv.date;
    const customer = text(inv.customer, 'عميل نقدي');
    const reversed = options.reversed === true;
    const sourceType = reversed ? 'sale-reversal' : 'sale';
    const entryId = reversed ? `JE_SALE_REV_${id}_${text(options.reversalId, stableRecordId('REV', options))}` : `JE_SALE_${id}`;
    const branchId = text(inv.branchId, 'MAIN');
    const party = { branchId, partyType:'customer', partyId:inv.customerId || null, partyName:customer };
    const payments = paymentRows(inv, paid, inv.accountId, inv.accountName || 'الصندوق / الحساب');
    const ar = purpose('AR','1100','ذمم العملاء');
    const sales = purpose('SALES','4100','إيرادات المبيعات');
    const outputTax = purpose('OUTPUT_TAX','2300','ضريبة مخرجات مستحقة');
    const salesTaxExpense = purpose('SALES_TAX_EXPENSE','5400','ضريبة مبيعات محمولة على المنشأة');

    if (!reversed) {
      payments.forEach((payment,index)=>journal.push(line(entryId,sourceType,id,date,payment.accountCode,payment.accountName,payment.amount,0,`المبلغ المقبوض من فاتورة البيع ${id}`,{...party,paymentIndex:index})));
      if (debt) journal.push(line(entryId,sourceType,id,date,ar.code,ar.name,debt,0,`المبلغ الآجل من فاتورة البيع ${id}`,party));
      if (!customerBearsTax && tax) journal.push(line(entryId,sourceType,id,date,salesTaxExpense.code,salesTaxExpense.name,tax,0,`ضريبة تحملتها المنشأة عن فاتورة البيع ${id}`,party));
      if (revenue) journal.push(line(entryId,sourceType,id,date,sales.code,sales.name,0,revenue,`إثبات صافي إيراد فاتورة البيع ${id}`,party));
      if (tax) journal.push(line(entryId,sourceType,id,date,outputTax.code,outputTax.name,0,tax,`إثبات ضريبة مخرجات فاتورة البيع ${id}`,party));
    } else {
      if (revenue) journal.push(line(entryId,sourceType,id,date,sales.code,sales.name,revenue,0,`عكس إيراد فاتورة البيع المحذوفة ${id}`,party));
      if (tax) journal.push(line(entryId,sourceType,id,date,outputTax.code,outputTax.name,tax,0,`عكس ضريبة مخرجات فاتورة البيع ${id}`,party));
      if (!customerBearsTax && tax) journal.push(line(entryId,sourceType,id,date,salesTaxExpense.code,salesTaxExpense.name,0,tax,`عكس ضريبة تحملتها المنشأة ${id}`,party));
      payments.forEach((payment,index)=>journal.push(line(entryId,sourceType,id,date,payment.accountCode,payment.accountName,0,payment.amount,`عكس التحصيل لفاتورة البيع المحذوفة ${id}`,{...party,paymentIndex:index})));
      if (debt) journal.push(line(entryId,sourceType,id,date,ar.code,ar.name,0,debt,`عكس ذمة العميل لفاتورة البيع المحذوفة ${id}`,party));
    }

    const cost = invoiceCost(inv);
    if (!cost) return;
    const inventory = purpose('INVENTORY','1200','مخزون البضاعة');
    const cogs = purpose('COGS','5100','تكلفة البضاعة المباعة');
    const costEntryId = `${entryId}_COGS`;
    if (!reversed) {
      journal.push(line(costEntryId,'sale-cost',id,date,cogs.code,cogs.name,cost,0,`تكلفة أصناف فاتورة البيع ${id}`,{branchId}));
      journal.push(line(costEntryId,'sale-cost',id,date,inventory.code,inventory.name,0,cost,`إخراج مخزون فاتورة البيع ${id}`,{branchId}));
    } else {
      journal.push(line(costEntryId,'sale-cost-reversal',id,date,inventory.code,inventory.name,cost,0,`عكس تكلفة مخزون فاتورة البيع المحذوفة ${id}`,{branchId}));
      journal.push(line(costEntryId,'sale-cost-reversal',id,date,cogs.code,cogs.name,0,cost,`عكس تكلفة البضاعة المباعة لفاتورة ${id}`,{branchId}));
    }
  }

  function appendPurchaseJournal(journal, inv, options = {}) {
    if (!inv || typeof inv !== 'object') return;
    const id = stableRecordId('PUR', inv);
    const total = Math.max(0,n(inv.total));
    const paid = Math.min(total,Math.max(0,n(inv.paid)));
    const debt = Math.max(0,n(inv.debt || (total-paid)));
    const tax = Math.max(0,n(inv.tax));
    const businessBearsTax = text(inv.taxSettings?.purchaseBearer,'business') === 'business';
    const inventoryAmount = Math.max(0,total-(businessBearsTax?tax:0));
    const date = options.date || inv.date;
    const supplier = text(inv.supplierName,inv.supplierId?'مورد':'بدون مورد');
    const reversed = options.reversed === true;
    const entryId = reversed ? `JE_PUR_REV_${id}_${text(options.reversalId,stableRecordId('REV',options))}` : `JE_PUR_${id}`;
    const sourceType = reversed ? 'purchase-reversal':'purchase';
    const branchId = text(inv.branchId,'MAIN');
    const party = { branchId, partyType:inv.supplierId?'supplier':'other', partyId:inv.supplierId||null, partyName:supplier };
    const payments = paymentRows(inv,paid,inv.accountId,inv.accountName || 'الصندوق / الحساب');
    const inventory = purpose('INVENTORY','1200','مخزون البضاعة');
    const inputTax = purpose('INPUT_TAX','1300','ضريبة مدخلات قابلة للاسترداد');
    const ap = inv.supplierId ? purpose('AP','2100','ذمم الموردين') : purpose('PURCHASE_NO_SUPPLIER','2190','ذمم مشتريات بدون مورد');
    if (!reversed) {
      if (inventoryAmount) journal.push(line(entryId,sourceType,id,date,inventory.code,inventory.name,inventoryAmount,0,`إثبات مخزون فاتورة المشتريات ${id}`,party));
      if (businessBearsTax && tax) journal.push(line(entryId,sourceType,id,date,inputTax.code,inputTax.name,tax,0,`إثبات ضريبة مدخلات فاتورة المشتريات ${id}`,party));
      payments.forEach((payment,index)=>journal.push(line(entryId,sourceType,id,date,payment.accountCode,payment.accountName,0,payment.amount,`المبلغ المدفوع لفاتورة المشتريات ${id}`,{...party,paymentIndex:index})));
      if (debt) journal.push(line(entryId,sourceType,id,date,ap.code,ap.name,0,debt,`المبلغ الآجل من فاتورة المشتريات ${id}`,party));
      return;
    }
    payments.forEach((payment,index)=>journal.push(line(entryId,sourceType,id,date,payment.accountCode,payment.accountName,payment.amount,0,`عكس المبلغ المدفوع لفاتورة المشتريات ${id}`,{...party,paymentIndex:index})));
    if (debt) journal.push(line(entryId,sourceType,id,date,ap.code,ap.name,debt,0,`عكس التزام فاتورة المشتريات ${id}`,party));
    if (inventoryAmount) journal.push(line(entryId,sourceType,id,date,inventory.code,inventory.name,0,inventoryAmount,`عكس مخزون فاتورة المشتريات ${id}`,party));
    if (businessBearsTax && tax) journal.push(line(entryId,sourceType,id,date,inputTax.code,inputTax.name,0,tax,`عكس ضريبة مدخلات فاتورة المشتريات ${id}`,party));
  }

  function appendMaterialPurchases(journal) {
    const inventory = purpose('RAW_INVENTORY','1210','مخزون المواد الخام');
    const apRole = purpose('AP','2100','ذمم الموردين');
    parse('cashtop_material_purchases',[]).forEach(inv => {
      const id = stableRecordId('MATPUR', inv);
      const total = Math.max(0,n(inv.totalBase || inv.total)); if (!total) return;
      const paid = Math.min(total,Math.max(0,n(inv.paidBase || inv.paid)));
      const debt = Math.max(0,n(inv.debtBase || (total-paid)));
      const entryId=`JE_MAT_${id}`;
      const party={ branchId:text(inv.branchId,'MAIN'), partyType:inv.supplierId?'supplier':'other', partyId:inv.supplierId||null, partyName:text(inv.supplierName,'مورد مواد خام') };
      journal.push(line(entryId,'material-purchase',id,inv.date,inventory.code,inventory.name,total,0,`توريد مواد خام: ${text(inv.materialName,id)}`,party));
      paymentRows(inv,paid,inv.accountId,inv.accountName||'الصندوق / الحساب').forEach((payment,index)=>journal.push(line(entryId,'material-purchase',id,inv.date,payment.accountCode,payment.accountName,0,payment.amount,`سداد توريد مواد خام ${id}`,{...party,paymentIndex:index})));
      if (debt) {
        const ap = inv.supplierId ? apRole : purpose('PURCHASE_NO_SUPPLIER','2190','ذمم مشتريات بدون مورد');
        journal.push(line(entryId,'material-purchase',id,inv.date,ap.code,ap.name,0,debt,`ذمة توريد مواد خام ${id}`,party));
      }
    });
  }

  function appendWorkerJournal(journal) {
    const wages=purpose('WAGES_EXPENSE','5250','رواتب وأجور');
    const advances=purpose('EMPLOYEE_ADVANCES','1400','سلف وذمم الموظفين والعمال');
    parse('cashtop_workers',[]).forEach(worker => {
      (Array.isArray(worker?.movements)?worker.movements:[]).forEach(movement=>{
        if (!['payment','debt'].includes(String(movement?.type))) return;
        const amount=Math.max(0,n(movement.amount)); if(!amount)return;
        const id=stableRecordId('WORK', movement, worker?.id || '');
        const entryId=`JE_WORK_${id}`;
        const target=movement.type==='debt'?advances:wages;
        const party={branchId:text(worker.branchId,'MAIN'),partyType:'worker',partyId:worker.id||null,partyName:text(worker.name,'عامل')};
        journal.push(line(entryId,'worker-payment',id,movement.date,target.code,target.name,amount,0,text(movement.notes,movement.type==='debt'?'سلفة عامل':'صرف راتب/دفعة عامل'),party));
        paymentRows(movement,amount,movement.vaultId,movement.accountName||'الصندوق / الحساب').forEach((payment,index)=>journal.push(line(entryId,'worker-payment',id,movement.date,payment.accountCode,payment.accountName,0,payment.amount,`صرف للعامل ${text(worker.name,'')}`,{...party,paymentIndex:index})));
      });
    });
  }

  function appendSalaryPayments(journal) {
    const wages=purpose('WAGES_EXPENSE','5250','رواتب وأجور');
    parse('cashtop_salary_payments',[]).filter(row=>row?.status!=='reversed').forEach(payment=>{
      const amount=Math.max(0,n(payment.amount || payment.baseAmount || payment.salary)); if(!amount)return;
      const id=stableRecordId('SAL', payment);
      const entryId=`JE_SAL_${id}`;
      const party={branchId:text(payment.branchId,'MAIN'),partyType:'employee',partyId:payment.employeeId||null,partyName:text(payment.employeeName,'موظف')};
      journal.push(line(entryId,'salary-payment',id,payment.date||payment.paidAt,wages.code,wages.name,amount,0,`راتب ${party.partyName}`,party));
      const fund=fundChartAccount(payment.accountId,payment.accountName||'الصندوق / الحساب');
      journal.push(line(entryId,'salary-payment',id,payment.date||payment.paidAt,fund.code,fund.name,0,amount,`صرف راتب ${party.partyName}`,party));
    });
  }

  function appendUnlinkedFundLogs(journal) {
    const funds=parse('cashtop_funds_db',{accounts:[],accountLogs:[]})||{};
    const logs=Array.isArray(funds.accountLogs)?funds.accountLogs:[];
    const clearing=purpose('MISC_CLEARING','2990','حسابات وتسويات متنوعة');
    logs.filter(log=>!String(log?.sourceType||'').trim() && String(log?.refType||'')!=='financial-group-opening').forEach((log,index)=>{
      const amount=Math.max(0,n(log.baseAmount || log.amount)); if(!amount)return;
      const raw=n(log.amount); const type=String(log.type||'');
      const incoming=raw<0?false:(/إيداع|قبض|وارد|إضافة|تحصيل|استلام|رصيد افتتاحي/.test(type)||/تحويل وارد/.test(String(log.notes||'')));
      const fund=fundChartAccount(log.accountId,log.accountName||'الصندوق / الحساب');
      const id=text(log.id,`FLOG_${hashText(`${log.accountId}|${log.date}|${log.amount}|${log.notes}|${index}`)}`);
      const entryId=`JE_FUND_${id}`;
      if(incoming){
        journal.push(line(entryId,'fund-log',id,log.date,fund.code,fund.name,amount,0,text(log.notes,'حركة إيداع'),{branchId:text(log.branchId,'MAIN')}));
        journal.push(line(entryId,'fund-log',id,log.date,clearing.code,clearing.name,0,amount,`مقابل ${text(log.notes,'حركة إيداع')}`,{branchId:text(log.branchId,'MAIN')}));
      }else{
        journal.push(line(entryId,'fund-log',id,log.date,clearing.code,clearing.name,amount,0,`مقابل ${text(log.notes,'حركة سحب')}`,{branchId:text(log.branchId,'MAIN')}));
        journal.push(line(entryId,'fund-log',id,log.date,fund.code,fund.name,0,amount,text(log.notes,'حركة سحب'),{branchId:text(log.branchId,'MAIN')}));
      }
    });
  }

  function appendFinancialGroupOpenings(journal) {
    const clearing=purpose('OPENING_CLEARING','3900','مقابل الأرصدة الافتتاحية');
    const ar=purpose('AR','1100','ذمم العملاء');
    const customerCredits=purpose('CUSTOMER_CREDITS','2200','أرصدة دائنة للعملاء');
    const ap=purpose('AP','2100','ذمم الموردين');
    const retained=purpose('RETAINED_EARNINGS','3300','الأرباح المحتجزة');
    parse('cashtop_opening_balances',[]).forEach(record=>{
      const amount=n(record?.amount); if(Math.abs(amount)<=0.0001)return;
      const id=text(record.id,`FGOPEN_${hashText(JSON.stringify(record))}`); const entryId=`JE_${id}`; const date=record.date||nowIso();
      const type=String(record.type||''); const name=text(record.name,'رصيد افتتاحي');
      let target=null; let targetDebit=0; let targetCredit=0;
      if(type==='receivable'){target=ar; if(amount>=0)targetDebit=Math.abs(amount);else targetCredit=Math.abs(amount);}
      else if(type==='customer-credit'){target=customerCredits; if(amount>=0)targetCredit=Math.abs(amount);else targetDebit=Math.abs(amount);}
      else if(type==='payable'){target=ap; if(amount>=0)targetCredit=Math.abs(amount);else targetDebit=Math.abs(amount);}
      else if(type==='cash'){target=fundChartAccount(record.entityId,name); if(amount>=0)targetDebit=Math.abs(amount);else targetCredit=Math.abs(amount);}
      else if(type==='equity'){target=retained; if(amount>=0)targetCredit=Math.abs(amount);else targetDebit=Math.abs(amount);}
      if(!target)return;
      const value=Math.abs(amount);
      journal.push(line(entryId,'financial-group-opening',id,date,target.code,target.name,targetDebit,targetCredit,`رصيد افتتاحي مرحّل - ${name}`,{partyType:record.entityType||'',partyId:record.entityId||null,partyName:name}));
      journal.push(line(entryId,'financial-group-opening',id,date,clearing.code,clearing.name,targetCredit,targetDebit,`مقابل الرصيد الافتتاحي المرحّل - ${name}`,{partyType:record.entityType||'',partyId:record.entityId||null,partyName:name}));
    });
  }

  function appendOpenings(journal) {
    const clearing=purpose('OPENING_CLEARING','3900','مقابل الأرصدة الافتتاحية');
    openingBalances().forEach(row=>{
      const account=accountById(row.accountId); if(!account || account.active===false)return;
      const debit=Math.max(0,n(row.debit)),credit=Math.max(0,n(row.credit)); if(!debit&&!credit)return;
      const amount=debit||credit; const id=text(row.id,`OPEN_${account.id}`); const entryId=`JE_${id}`;
      if(debit){
        journal.push(line(entryId,'opening-balance',id,row.date,account.code,account.name,amount,0,`رصيد افتتاحي - ${account.name}`));
        journal.push(line(entryId,'opening-balance',id,row.date,clearing.code,clearing.name,0,amount,`مقابل رصيد افتتاحي - ${account.name}`));
      }else{
        journal.push(line(entryId,'opening-balance',id,row.date,clearing.code,clearing.name,amount,0,`مقابل رصيد افتتاحي - ${account.name}`));
        journal.push(line(entryId,'opening-balance',id,row.date,account.code,account.name,0,amount,`رصيد افتتاحي - ${account.name}`));
      }
    });
  }

  function appendChartTransactions(journal) {
    transactions().forEach(tx => {
      const amount=Math.max(0,n(tx.amount)); if(!amount)return;
      const debit=accountById(tx.debitAccountId,{persist:false}), credit=accountById(tx.creditAccountId,{persist:false}); if(!debit||!credit)return;
      const entryId=`JE_CTX_${text(tx.id,stableRecordId('CTX',tx))}`; const desc=text(tx.description,'حركة شجرة الحسابات');
      journal.push(line(entryId,text(tx.sourceType,'chart-transaction'),tx.id,tx.date,debit.code,debit.name,amount,0,desc,{reference:text(tx.reference),chartTransactionId:tx.id}));
      journal.push(line(entryId,text(tx.sourceType,'chart-transaction'),tx.id,tx.date,credit.code,credit.name,0,amount,desc,{reference:text(tx.reference),chartTransactionId:tx.id}));
    });
  }

  function appendManualJournal(journal) {
    manualEntries().filter(entry=>entry?.status!=='void').forEach(entry=>{
      const entryId=`JE_MAN_${stableRecordId('MJE', entry)}`;
      (entry.lines||[]).forEach((row,index)=>{
        const account=accountById(row.accountId,{persist:false}); if(!account)return;
        journal.push(line(entryId,'manual-journal',entry.id,entry.date,account.code,account.name,row.debit,row.credit,text(row.notes,entry.description||'قيد يدوي'),{branchId:text(entry.branchId,'MAIN'),manualLine:index,reference:text(entry.reference)}));
      });
    });
  }

  function buildJournal() {
    ensureChart();
    lineSequence = new Map();
    const journal=[];
    appendFinancialGroupOpenings(journal);
    appendOpenings(journal);
    appendChartTransactions(journal);

    const sales=parse('cashtop_invoices').filter(inv=>inv&&inv.status!=='draft');
    const liveSaleIds=new Set(sales.map(inv=>String(inv?.id||''))); sales.forEach(inv=>appendSaleJournal(journal,inv));
    parse('cashtop_sales_reversals').forEach(record=>{const inv=record?.originalInvoice||record?.invoice;if(!inv)return;if(!liveSaleIds.has(String(inv.id||'')))appendSaleJournal(journal,inv);appendSaleJournal(journal,inv,{reversed:true,date:record.reversedAt||record.date||nowIso(),reversalId:record.id});});

    const purchases=parse('cashtop_purchases'); const livePurchaseIds=new Set(purchases.map(inv=>String(inv?.id||''))); purchases.forEach(inv=>appendPurchaseJournal(journal,inv));
    parse('cashtop_purchase_reversals').forEach(record=>{const inv=record?.originalInvoice||record?.invoice;if(!inv)return;if(!livePurchaseIds.has(String(inv.id||'')))appendPurchaseJournal(journal,inv);appendPurchaseJournal(journal,inv,{reversed:true,date:record.reversedAt||record.date||nowIso(),reversalId:record.id});});

    const salesReturns=purpose('SALES_RETURNS','4200','مردودات ومسموحات المبيعات');
    const inventory=purpose('INVENTORY','1200','مخزون البضاعة'); const cogs=purpose('COGS','5100','تكلفة البضاعة المباعة');
    parse('cashtop_sales_returns').forEach(ret=>{
      const id=stableRecordId('SRET',ret);const total=Math.max(0,n(ret.totalValue||ret.total||ret.amount));if(!total)return;
      const date=ret.date||ret.createdAt;const branchId=text(ret.branchId,'MAIN');const customer=text(ret.customerName||ret.customer,'عميل');const party={branchId,partyType:'customer',partyId:ret.customerId||null,partyName:customer};const entryId=`JE_SRET_${id}`;
      journal.push(line(entryId,'sales-return',id,date,salesReturns.code,salesReturns.name,total,0,`إثبات مرتجع المبيعات ${id}`,party));
      if(String(ret.sourceType||ret.returnSource||'')==='customer_balance'){
        const credits=purpose('CUSTOMER_CREDITS','2200','أرصدة دائنة للعملاء');journal.push(line(entryId,'sales-return',id,date,credits.code,credits.name,0,total,`إضافة قيمة مرتجع ${id} إلى رصيد العميل ${customer}`,party));
      }else{const fund=fundChartAccount(ret.accountId,'الصندوق / الحساب');journal.push(line(entryId,'sales-return',id,date,fund.code,fund.name,0,total,`رد نقدية مرتجع المبيعات ${id}`,party));}
      const cost=(ret.items||[]).reduce((sum,item)=>sum+Math.max(0,n(item.qty||item.inputQty))*Math.max(.000001,n(item.factorToBase||item.piecesPerUnit||1)||1)*Math.max(0,n(item.costPerPiece||item.cost||0)),0);
      if(cost){const costEntryId=`${entryId}_COGS`;journal.push(line(costEntryId,'sales-return',id,date,inventory.code,inventory.name,cost,0,`إعادة مخزون مرتجع المبيعات ${id}`,{branchId}));journal.push(line(costEntryId,'sales-return',id,date,cogs.code,cogs.name,0,cost,`عكس تكلفة الأصناف المرتجعة ${id}`,{branchId}));}
    });

    parse('cashtop_purchase_returns').forEach(ret=>{
      const id=stableRecordId('PRET',ret);const total=n(ret.totalValue||ret.total||ret.amount);const received=n(ret.receivedCash||ret.received||ret.paid||ret.cashReceived);const due=Math.max(0,n(ret.debtDeducted||ret.debt||ret.due||(total-received)));const entryId=`JE_PRET_${id}`;
      const party={branchId:text(ret.branchId,'MAIN'),partyType:ret.supplierId?'supplier':'other',partyId:ret.supplierId||null,partyName:text(ret.supplierName,ret.supplierId?'مورد':'بدون مورد')};
      if(received){const fund=fundChartAccount(ret.accountId,'الصندوق / الحساب');journal.push(line(entryId,'purchase-return',id,ret.date,fund.code,fund.name,received,0,`نقدية مستردة من مرتجع المشتريات ${id}`,party));}
      if(due){const ap=ret.supplierId?purpose('AP','2100','ذمم الموردين'):purpose('PURCHASE_NO_SUPPLIER','2190','ذمم مشتريات بدون مورد');journal.push(line(entryId,'purchase-return',id,ret.date,ap.code,ap.name,due,0,`تخفيض ذمة المورد بمرتجع ${id}`,party));}
      if(total)journal.push(line(entryId,'purchase-return',id,ret.date,inventory.code,inventory.name,0,total,`إخراج مخزون مرتجع المشتريات ${id}`,party));
    });

    appendMaterialPurchases(journal);

    parse('cashtop_expenses').forEach(exp=>{
      const id=stableRecordId('EXP',exp);const amount=n(exp.amount);if(!amount)return;const entryId=`JE_EXP_${id}`;const branch={branchId:text(exp.branchId,'MAIN')};
      const expenseAccount=exp.chartAccountId?accountById(exp.chartAccountId):null;const fallback=exp.sourceType==='wastage'?purpose('WASTAGE_EXPENSE','5300','هالك وفاقد مخزون'):purpose('GENERAL_EXPENSE','5200','مصروفات تشغيلية عامة');const target=expenseAccount||fallback;
      journal.push(line(entryId,'expense',id,exp.date,target.code,target.name,amount,0,`إثبات المصروف ${text(exp.name,id)}`,branch));
      if(exp.nonCash===true||exp.sourceType==='wastage')journal.push(line(entryId,'expense',id,exp.date,inventory.code,inventory.name,0,amount,`إخراج مخزون هالك ${text(exp.name,id)}`,branch));
      else{const fund=fundChartAccount(exp.accountId,'الصندوق / الحساب');journal.push(line(entryId,'expense',id,exp.date,fund.code,fund.name,0,amount,`صرف المصروف ${text(exp.name,id)}`,branch));}
    });

    parse('cashtop_vouchers').forEach(v=>{
      const id=stableRecordId('V',v);const amount=n(v.amount);if(!amount)return;const entryId=`JE_V_${id}`;const cash=fundChartAccount(v.accountId,'الصندوق / الحساب');const partyName=text(v.relationName,'جهة أخرى');const party={branchId:text(v.branchId,'MAIN'),partyType:v.relationType||'other',partyId:v.relationId||null,partyName};let counter=purpose('MISC_CLEARING','2990','حسابات وتسويات متنوعة');if(v.relationType==='client')counter=purpose('AR','1100','ذمم العملاء');if(v.relationType==='supplier')counter=purpose('AP','2100','ذمم الموردين');
      if(v.type==='قبض'){journal.push(line(entryId,'voucher',id,v.date,cash.code,cash.name,amount,0,`سند قبض ${text(v.refNumber,id)} من ${partyName}`,party));journal.push(line(entryId,'voucher',id,v.date,counter.code,counter.name,0,amount,`تسوية سند قبض مع ${partyName}`,party));}
      else{journal.push(line(entryId,'voucher',id,v.date,counter.code,counter.name,amount,0,`تسوية سند صرف مع ${partyName}`,party));journal.push(line(entryId,'voucher',id,v.date,cash.code,cash.name,0,amount,`سند صرف ${text(v.refNumber,id)} إلى ${partyName}`,party));}
    });

    appendWorkerJournal(journal); appendSalaryPayments(journal); appendUnlinkedFundLogs(journal); appendManualJournal(journal);

    parse('cashtop_journal_reversal_archive').forEach(record=>{
      const lines=Array.isArray(record?.originalLines)?record.originalLines:[];if(!lines.length)return;const deletedAt=record.deletedAt||nowIso();const byEntry=new Map();
      lines.forEach(original=>{if(!original||typeof original!=='object')return;const originalEntryId=text(original.entryId,`JE_ARCH_${record.sourceId||record.id}`);if(!byEntry.has(originalEntryId))byEntry.set(originalEntryId,[]);byEntry.get(originalEntryId).push(original);journal.push({...original,id:`${text(original.id,originalEntryId)}_ARCH_${stableRecordId('ARCH',record)}`,entryId:`JE_ARCH_${stableRecordId('ARCH',record)}_${originalEntryId}`,originalEntryId,archivedOriginal:true,reversalArchiveId:record.id});});
      byEntry.forEach((entryLines,originalEntryId)=>{const reversalEntryId=`JE_AUTO_REV_${text(record.id,record.sourceId||stableRecordId('ARCH',record))}_${originalEntryId}`;entryLines.forEach((original,index)=>journal.push({...original,id:`${reversalEntryId}_${index}`,entryId:reversalEntryId,sourceType:`${text(original.sourceType,'entry')}-reversal`,date:deletedAt,debit:round(original.credit),credit:round(original.debit),description:`${record.reversalReason==='edit'?'عكس تلقائي قبل التعديل':'عكس تلقائي بعد الحذف'}: ${text(original.description,record.sourceId||'')}`,reversalOfEntryId:originalEntryId,reversalArchiveId:record.id,archivedOriginal:false}));});
    });

    return journal.sort((a,b)=>new Date(a.date)-new Date(b.date));
  }

  function validateBalanced(journal) {
    const totals=new Map(); journal.forEach(item=>{const current=totals.get(item.entryId)||{debit:0,credit:0};current.debit+=n(item.debit);current.credit+=n(item.credit);totals.set(item.entryId,current);});
    const unbalanced=[];totals.forEach((value,entryId)=>{const difference=Math.abs(value.debit-value.credit);if(difference>0.01)unbalanced.push({entryId,debit:round(value.debit),credit:round(value.credit),difference:round(difference)});});return unbalanced;
  }

  function accountStats(accountId, options = {}) {
    const account=accountById(accountId,{persist:false}); if(!account)return null;
    const accounts=chartAccounts({includeInactive:true,persist:false}); const includeChildren=options.includeChildren!==false;
    const codes=new Set([account.code,...(includeChildren?descendantsOf(account.id,accounts):[]).map(row=>row.code)].map(String));
    const rows=parse('cashtop_journal',[]).filter(row=>codes.has(String(row.accountCode||'')));
    const from=String(options.from||''),to=String(options.to||'');
    const filtered=rows.filter(row=>{const d=String(row.date||'').slice(0,10);return(!from||d>=from)&&(!to||d<=to)&&row.archivedOriginal!==true;});
    const debit=round(filtered.reduce((s,row)=>s+n(row.debit),0)),credit=round(filtered.reduce((s,row)=>s+n(row.credit),0));
    const signed=round(debit-credit); const balance=account.nature==='credit'?round(credit-debit):signed;
    return {account,rows:filtered,debit,credit,signed,balance,nature:account.nature};
  }

  function trialBalance(options = {}) {
    const accounts=chartAccounts({includeInactive:options.includeInactive===true,persist:false});
    return accounts.map(account=>{const stats=accountStats(account.id,{...options,includeChildren:false});return{...account,debit:stats?.debit||0,credit:stats?.credit||0,balance:stats?.balance||0,signed:stats?.signed||0};});
  }

  /*
   * Financial summary for business-facing screens. A balanced double-entry
   * journal should always have total debits === total credits; that is a
   * validation signal, not profit. This summary separates journal movement
   * from economic balances and P&L so sales/purchases are visible clearly.
   */
  function financialSummary(options = {}) {
    const rows = trialBalance({ ...options, includeInactive:true }).filter(row => row.postable !== false);
    const sum = (filter, value) => round(rows.filter(filter).reduce((total,row)=>total+n(value(row)),0));
    const movementDebit = round(rows.reduce((total,row)=>total+n(row.debit),0));
    const movementCredit = round(rows.reduce((total,row)=>total+n(row.credit),0));
    const debitBalances = round(rows.reduce((total,row)=>total+Math.max(0,n(row.signed)),0));
    const creditBalances = round(rows.reduce((total,row)=>total+Math.max(0,-n(row.signed)),0));
    const assets = sum(row=>row.category==='asset', row=>row.signed);
    const liabilities = sum(row=>row.category==='liability', row=>-n(row.signed));
    const equity = sum(row=>row.category==='equity', row=>-n(row.signed));
    const revenue = sum(row=>row.category==='revenue', row=>-n(row.signed));
    const expenses = sum(row=>row.category==='expense', row=>row.signed);

    const accounts = chartAccounts({includeInactive:true,persist:false});
    const cogsGroup = accountByRole('COGS_GROUP',{persist:false}) || accountByRole('COGS',{persist:false});
    let costOfSales = 0;
    if (cogsGroup) {
      const cogsIds = new Set([String(cogsGroup.id), ...descendantsOf(cogsGroup.id,accounts).map(row=>String(row.id))]);
      costOfSales = round(rows.filter(row=>cogsIds.has(String(row.id))).reduce((total,row)=>total+n(row.signed),0));
    }
    const operatingExpenses = round(expenses - costOfSales);
    const grossProfit = round(revenue - costOfSales);
    const netProfit = round(revenue - expenses);
    const equationRight = round(liabilities + equity + netProfit);
    const equationDifference = round(assets - equationRight);
    const journalDifference = round(Math.abs(movementDebit - movementCredit));
    const balanceDifference = round(Math.abs(debitBalances - creditBalances));

    return {
      movementDebit,movementCredit,journalDifference,debitBalances,creditBalances,balanceDifference,
      assets,liabilities,equity,revenue,expenses,costOfSales,operatingExpenses,grossProfit,netProfit,
      equationRight,equationDifference,balanced:journalDifference<=0.01&&balanceDifference<=0.01
    };
  }

  let rebuilding=false; let rebuildTimer=null;
  function rebuild() {
    if(rebuilding)return; if(core.isFinancialGroupReadOnly?.() || core.isSubscriptionExpired?.())return;
    rebuilding=true;
    try{const journal=buildJournal();const unbalanced=validateBalanced(journal);localStorage.setItem('cashtop_journal',JSON.stringify(journal));core.accountingStatus={updatedAt:nowIso(),entries:new Set(journal.map(row=>row.entryId)).size,lines:journal.length,unbalanced};window.dispatchEvent(new CustomEvent('cashtop:journal-rebuilt',{detail:core.accountingStatus}));if(unbalanced.length)console.warn('[CASH TOP] قيود غير متوازنة:',unbalanced);}finally{rebuilding=false;}
  }
  function scheduleRebuild(delay=45){clearTimeout(rebuildTimer);rebuildTimer=setTimeout(rebuild,delay);}

  window.CashtopChart = Object.freeze({
    CHART_KEY,MANUAL_KEY,OPENING_KEY,CHART_TX_KEY,DEFAULT_CHART,
    ensure:ensureChart,getAccounts:chartAccounts,getAccount:accountById,getByCode:accountByCode,getByRole:accountByRole,getFundAccount:fundChartAccount,
    descendantsOf,isDescendantOrSelf,isCashBankAccount,nextChildCode,accountUsed,addAccount:addChartAccount,updateAccount:updateChartAccount,deleteAccount:deleteChartAccount,restoreAccount:restoreChartAccount,
    getTransactions:transactions,postTransaction,reverseTransaction,syncFundForAccount:syncFundForChartAccount,
    getOpeningBalances:openingBalances,setOpeningBalance,getManualEntries:manualEntries,saveManualEntry,deleteManualEntry,
    accountStats,trialBalance,financialSummary,validateManualEntry,rebuildJournal:rebuild
  });
  core.rebuildJournal=rebuild; core.getJournal=()=>parse('cashtop_journal');

  window.addEventListener('cashtop:data-changed',event=>{if(SOURCE_KEYS.has(event.detail?.key))scheduleRebuild();});
  window.addEventListener('cashtop:remote-applied',event=>{if(SOURCE_KEYS.has(event.detail?.key))scheduleRebuild(60);});
  document.addEventListener('DOMContentLoaded',()=>{ensureChart();rebuild();},{once:true});
})();
