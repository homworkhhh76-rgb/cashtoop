(function () {
  'use strict';

  const CURRENCY_PRESETS = {
    'شيكل': { id: 'ILS', name: 'شيكل إسرائيلي', code: 'ILS', symbol: '₪' },
    'دولار': { id: 'USD', name: 'دولار أمريكي', code: 'USD', symbol: '$' },
    'دينار': { id: 'JOD', name: 'دينار أردني', code: 'JOD', symbol: 'JD' },
    'ريال': { id: 'SAR', name: 'ريال سعودي', code: 'SAR', symbol: 'SR' }
  };

  function safeJson(raw, fallback) {
    try { return JSON.parse(raw == null ? '' : raw); } catch (_) { return fallback; }
  }

  function readSettings() {
    const value = safeJson(localStorage.getItem('cashtop_settings'), {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function presetFor(value) {
    const key = String(value || '').trim();
    return CURRENCY_PRESETS[key] || Object.values(CURRENCY_PRESETS).find(item => item.id === key || item.code === key) || null;
  }

  function makeCurrency(input, index = 0) {
    const preset = presetFor(input?.id || input?.code || input?.name || input);
    const name = String(input?.name || preset?.name || input || `عملة ${index + 1}`).trim();
    const code = String(input?.code || preset?.code || input?.id || `CUR${index + 1}`).trim().toUpperCase();
    const id = String(input?.id || code || `CUR_${index + 1}`).trim();
    const symbol = String(input?.symbol || preset?.symbol || code).trim();
    const rate = Number(input?.ratePer100Base ?? input?.rate ?? (index === 0 ? 100 : 0));
    return { id, name, code, symbol, ratePer100Base: Number.isFinite(rate) && rate > 0 ? rate : (index === 0 ? 100 : 1) };
  }

  function getCurrencyConfig(settings = readSettings()) {
    const preset = presetFor(settings.currency) || CURRENCY_PRESETS['شيكل'];
    const baseId = String(settings.baseCurrencyId || preset.id || 'ILS');
    let currencies = Array.isArray(settings.currencies) ? settings.currencies.map(makeCurrency) : [];
    if (!currencies.length) currencies = [makeCurrency({ ...preset, id: baseId, ratePer100Base: 100 }, 0)];
    let base = currencies.find(item => String(item.id) === baseId || String(item.code) === baseId);
    if (!base) {
      base = makeCurrency({ ...preset, id: baseId, ratePer100Base: 100 }, 0);
      currencies.unshift(base);
    }
    base.ratePer100Base = 100;
    currencies = currencies.map((item, index) => ({ ...item, ratePer100Base: String(item.id) === String(base.id) ? 100 : Math.max(0.000001, Number(item.ratePer100Base || 1)) }));
    return { enabled: settings.multiCurrencyEnabled === true, baseCurrencyId: base.id, base, currencies };
  }

  function getCurrency(id, settings) {
    const cfg = getCurrencyConfig(settings);
    return cfg.currencies.find(item => String(item.id) === String(id) || String(item.code) === String(id)) || cfg.base;
  }

  function toBase(amount, currencyId, settings) {
    const cfg = getCurrencyConfig(settings);
    const currency = getCurrency(currencyId || cfg.baseCurrencyId, settings);
    const value = Number(amount || 0);
    if (!Number.isFinite(value)) return 0;
    if (String(currency.id) === String(cfg.baseCurrencyId)) return value;
    return value * 100 / Math.max(0.000001, Number(currency.ratePer100Base || 1));
  }

  function fromBase(amount, currencyId, settings) {
    const cfg = getCurrencyConfig(settings);
    const currency = getCurrency(currencyId || cfg.baseCurrencyId, settings);
    const value = Number(amount || 0);
    if (!Number.isFinite(value)) return 0;
    if (String(currency.id) === String(cfg.baseCurrencyId)) return value;
    return value * Math.max(0.000001, Number(currency.ratePer100Base || 1)) / 100;
  }

  function convert(amount, fromCurrencyId, toCurrencyId, settings) {
    return fromBase(toBase(amount, fromCurrencyId, settings), toCurrencyId, settings);
  }

  function currencySymbol(currencyId, settings) {
    return getCurrency(currencyId, settings).symbol || getCurrency(currencyId, settings).code || '';
  }

  // تسوية أي مبلغ بعملة العملية إلى عملة الصندوق المختار عبر العملة الأساسية.
  // مثال: دولار -> شيكل (أساسي) -> دينار، بدون اشتراط أن تكون عملة الصندوق هي عملة العملية.
  function settleToAccount(amount, transactionCurrencyId, accountOrCurrencyId, settings) {
    const cfg = getCurrencyConfig(settings);
    const accountCurrencyId = typeof accountOrCurrencyId === 'object'
      ? (accountOrCurrencyId?.currencyId || cfg.baseCurrencyId)
      : (accountOrCurrencyId || cfg.baseCurrencyId);
    const txCurrencyId = transactionCurrencyId || cfg.baseCurrencyId;
    const transactionAmount = Number(amount || 0);
    const baseAmount = toBase(transactionAmount, txCurrencyId, settings);
    const accountAmount = fromBase(baseAmount, accountCurrencyId, settings);
    return {
      transactionAmount: Number.isFinite(transactionAmount) ? transactionAmount : 0,
      transactionCurrencyId: txCurrencyId,
      baseAmount,
      accountAmount,
      accountCurrencyId,
      transactionCurrency: getCurrency(txCurrencyId, settings),
      accountCurrency: getCurrency(accountCurrencyId, settings)
    };
  }

  function accountAmountFromBase(baseAmount, accountOrCurrencyId, settings) {
    const cfg = getCurrencyConfig(settings);
    const accountCurrencyId = typeof accountOrCurrencyId === 'object'
      ? (accountOrCurrencyId?.currencyId || cfg.baseCurrencyId)
      : (accountOrCurrencyId || cfg.baseCurrencyId);
    return fromBase(baseAmount, accountCurrencyId, settings);
  }

  function normalizeUnitTemplate(unit, index = 0) {
    const raw = unit && typeof unit === 'object' ? unit : {};
    let chain = Array.isArray(raw.chain) ? raw.chain : (Array.isArray(raw.units) ? raw.units : []);
    if (!chain.length) {
      const baseName = String(raw.pieceName || raw.baseUnitName || 'قطعة').trim() || 'قطعة';
      const topName = String(raw.unitName || '').trim();
      const count = Math.max(1, Number(raw.piecesCount || raw.piecesPerUnit || 1));
      chain = [{ id: `${raw.id || `U_${index}`}_BASE`, name: baseName, factorToPrevious: 1, factorToBase: 1 }];
      if (topName && (count > 1 || topName !== baseName)) chain.push({ id: `${raw.id || `U_${index}`}_L1`, name: topName, factorToPrevious: count, factorToBase: count });
    }
    const normalized = [];
    let total = 1;
    chain.forEach((level, levelIndex) => {
      const name = String(level?.name || level?.unitName || (levelIndex === 0 ? raw.pieceName : raw.unitName) || `وحدة ${levelIndex + 1}`).trim();
      if (!name) return;
      const factorToPrevious = levelIndex === 0 ? 1 : Math.max(0.000001, Number(level?.factorToPrevious || level?.ratio || level?.piecesCount || 1));
      total = levelIndex === 0 ? 1 : total * factorToPrevious;
      normalized.push({
        id: String(level?.id || `${raw.id || `U_${index}`}_L${levelIndex}`),
        name,
        factorToPrevious,
        factorToBase: Math.max(0.000001, Number(level?.factorToBase || total)),
        salePrice: Number.isFinite(Number(level?.salePrice)) ? Number(level.salePrice) : undefined,
        barcode: String(level?.barcode || '')
      });
    });
    if (!normalized.length) normalized.push({ id: `${raw.id || `U_${index}`}_BASE`, name: 'قطعة', factorToPrevious: 1, factorToBase: 1 });
    // Recalculate from previous factors so nested conversion is deterministic.
    total = 1;
    normalized.forEach((level, levelIndex) => {
      if (levelIndex === 0) { level.factorToPrevious = 1; level.factorToBase = 1; }
      else { total *= Math.max(0.000001, Number(level.factorToPrevious || 1)); level.factorToBase = total; }
    });
    const base = normalized[0];
    const top = normalized[normalized.length - 1];
    return {
      ...raw,
      id: String(raw.id || `U_${Date.now()}_${index}`),
      name: String(raw.name || top.name || base.name),
      chain: normalized,
      pieceName: base.name,
      unitName: top.name,
      piecesCount: top.factorToBase,
      unitCode: undefined,
      pieceCode: undefined,
      updatedAt: raw.updatedAt || new Date().toISOString()
    };
  }

  function normalizeUnits(units) {
    return (Array.isArray(units) ? units : []).filter(Boolean).map(normalizeUnitTemplate);
  }

  function normalizeProductChain(product) {
    const raw = product && typeof product === 'object' ? product : {};
    let chain = Array.isArray(raw.unitChain) && raw.unitChain.length ? raw.unitChain : [];
    if (!chain.length) {
      const baseName = String(raw.pieceName || 'قطعة').trim() || 'قطعة';
      const topName = String(raw.unitName || '').trim();
      const ppu = Math.max(1, Number(raw.piecesPerUnit || 1));
      chain = [{ id: 'piece', name: baseName, factorToPrevious: 1, factorToBase: 1, salePrice: Number(raw.pricePiece ?? raw.price ?? 0), barcode: String(raw.pieceBarcode || raw.barcode || '') }];
      if (topName && ppu > 1) chain.push({ id: 'unit', name: topName, factorToPrevious: ppu, factorToBase: ppu, salePrice: Number(raw.priceUnit || 0), barcode: String(raw.unitBarcode || '') });
    }
    const template = normalizeUnitTemplate({ id: raw.unitId || raw.id || 'PRODUCT', chain });
    const priceMap = raw.unitPrices && typeof raw.unitPrices === 'object' ? raw.unitPrices : {};
    template.chain = template.chain.map((level, index) => {
      let price = Number(level.salePrice);
      if (!Number.isFinite(price)) price = Number(priceMap[level.id]);
      if (!Number.isFinite(price) && index === 0) price = Number(raw.pricePiece ?? raw.price ?? 0);
      if (!Number.isFinite(price) && index === template.chain.length - 1) price = Number(raw.priceUnit || 0);
      if (!Number.isFinite(price)) price = Number(raw.pricePiece ?? raw.price ?? 0) * Number(level.factorToBase || 1);
      return { ...level, salePrice: Math.max(0, price) };
    });
    return template.chain;
  }

  function buildProductUnitChain(template, prices = {}, barcodes = {}) {
    const normalized = normalizeUnitTemplate(template);
    return normalized.chain.map((level, index) => {
      const byId = Number(prices[level.id]);
      const byIndex = Number(prices[index]);
      const salePrice = Number.isFinite(byId) ? byId : (Number.isFinite(byIndex) ? byIndex : Number(level.salePrice || 0));
      return { ...level, salePrice: Math.max(0, salePrice), barcode: String(barcodes[level.id] || level.barcode || '') };
    });
  }

  function unitById(product, unitId) {
    const chain = normalizeProductChain(product);
    return chain.find(level => String(level.id) === String(unitId)) || chain.find((_, index) => (unitId === 'piece' && index === 0) || (unitId === 'unit' && index === chain.length - 1)) || chain[0];
  }

  function factorForUnit(product, unitId) {
    return Math.max(0.000001, Number(unitById(product, unitId)?.factorToBase || 1));
  }

  function getProductUnitPrice(product, unitId, groupPrice) {
    const chain = normalizeProductChain(product);
    const unit = unitById(product, unitId);
    const saved = groupPrice && typeof groupPrice === 'object' ? groupPrice : {};
    const unitPrices = saved.units && typeof saved.units === 'object' ? saved.units : {};
    let special = Number(unitPrices[unit.id]);
    if (!Number.isFinite(special) && unit.id === chain[0].id) special = Number(saved.piece);
    if (!Number.isFinite(special) && unit.id === chain[chain.length - 1].id) special = Number(saved.unit);
    return Number.isFinite(special) && special >= 0 ? special : Math.max(0, Number(unit.salePrice || 0));
  }

  function chainText(chainOrTemplate) {
    const chain = Array.isArray(chainOrTemplate) ? normalizeUnitTemplate({ chain: chainOrTemplate }).chain : normalizeUnitTemplate(chainOrTemplate).chain;
    return chain.map((level, index) => index === 0 ? level.name : `${level.name} = ${level.factorToPrevious} ${chain[index - 1].name}`).join(' ← ');
  }

  function ensureAccountCurrency(account, settings) {
    if (!account || typeof account !== 'object') return account;
    const cfg = getCurrencyConfig(settings);
    if (!account.currencyId) account.currencyId = cfg.baseCurrencyId;
    return account;
  }

  function nativeToBaseForAccount(amount, account, settings) {
    return toBase(amount, ensureAccountCurrency(account, settings)?.currencyId, settings);
  }

  function formatMoney(amount, currencyId, settings, digits = 2) {
    const value = Number(amount || 0);
    const symbol = currencySymbol(currencyId, settings);
    return `${Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 3 }) : '0.00'} ${symbol}`.trim();
  }

  window.CashtopMulti = {
    readSettings,
    getCurrencyConfig,
    getCurrency,
    toBase,
    fromBase,
    convert,
    currencySymbol,
    settleToAccount,
    accountAmountFromBase,
    formatMoney,
    normalizeUnitTemplate,
    normalizeUnits,
    normalizeProductChain,
    buildProductUnitChain,
    unitById,
    factorForUnit,
    getProductUnitPrice,
    chainText,
    ensureAccountCurrency,
    nativeToBaseForAccount
  };
})();
