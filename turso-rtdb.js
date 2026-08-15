(() => {
  'use strict';

  const settings = window.CASHTOP_TURSO || {};
  const turso = settings.turso || {};
  const bridgeBase = String(settings.config?.databaseURL || '').replace(/\/+$/, '');
  const token = String(turso.authToken || '').trim();
  const dbUrl = String(turso.databaseURL || '').trim();
  const table = String(turso.table || 'cashtop_rtdb').replace(/[^a-zA-Z0-9_]/g, '') || 'cashtop_rtdb';
  const nativeFetch = window.fetch.bind(window);
  // The admin console is persisted as one atomic JSON document. Treating this
  // root as an atomic row avoids DELETE descendant scans and makes key lookups
  // read the single indexed admin row instead of rebuilding a subtree.
  const adminRootPath = normalizePath(settings.adminRootPath || 'cashTopExchange/cashTopAdmin');

  if (!bridgeBase || !token || !dbUrl) return;

  const pipelineUrl = dbUrl
    .replace(/^libsql:\/\//i, 'https://')
    .replace(/\/+$/, '') + '/v2/pipeline';

  let schemaReady = null;
  const schemaMarkerKey = `ct_turso_schema_v74::${dbUrl.replace(/[^a-zA-Z0-9]/g, '_').slice(-80)}::${table}`;
  const exactCache = new Map();
  const EXACT_CACHE_MS = 15000;

  function normalizePath(value) {
    return decodeURIComponent(String(value || ''))
      .replace(/\.json(?:\?.*)?$/i, '')
      .replace(/^\/+|\/+$/g, '')
      .replace(/\/{2,}/g, '/');
  }

  function clone(value) {
    if (value == null || typeof value !== 'object') return value;
    try { return structuredClone(value); } catch (_) { return JSON.parse(JSON.stringify(value)); }
  }

  function getNested(root, segments) {
    let current = root;
    for (const segment of segments) {
      if (current == null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
      current = current[segment];
    }
    return current;
  }

  function setNested(root, segments, value) {
    if (!segments.length) return clone(value);
    const out = root && typeof root === 'object' && !Array.isArray(root) ? clone(root) : {};
    let current = out;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      if (!current[segment] || typeof current[segment] !== 'object' || Array.isArray(current[segment])) current[segment] = {};
      current = current[segment];
    }
    current[segments[segments.length - 1]] = clone(value);
    return out;
  }

  function deleteNested(root, segments) {
    if (!segments.length) return null;
    if (!root || typeof root !== 'object') return root;
    const out = clone(root);
    let current = out;
    for (let i = 0; i < segments.length - 1; i += 1) {
      current = current?.[segments[i]];
      if (!current || typeof current !== 'object') return out;
    }
    if (current && typeof current === 'object') delete current[segments[segments.length - 1]];
    return out;
  }

  function typedArg(value) {
    if (value === null || value === undefined) return { type: 'null' };
    if (typeof value === 'number' && Number.isInteger(value)) return { type: 'integer', value: String(value) };
    if (typeof value === 'number') return { type: 'float', value: String(value) };
    return { type: 'text', value: String(value) };
  }

  function cellValue(cell) {
    if (!cell || cell.type === 'null') return null;
    const value = cell.value;
    if (cell.type === 'integer' || cell.type === 'float') {
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    return value;
  }

  async function pipeline(statements, timeout = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await nativeFetch(pipelineUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          requests: [
            ...statements.map(statement => ({
              type: 'execute',
              stmt: {
                sql: statement.sql,
                args: (statement.args || []).map(typedArg)
              }
            })),
            { type: 'close' }
          ]
        }),
        signal: controller.signal,
        cache: 'no-store'
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Turso HTTP ${response.status}: ${text.slice(0, 500)}`);
      let data;
      try { data = JSON.parse(text); } catch (_) { throw new Error('Turso returned invalid JSON'); }
      return statements.map((_, index) => {
        const item = data.results?.[index];
        if (!item || item.type !== 'ok') {
          const message = item?.error?.message || item?.error || JSON.stringify(item || {});
          throw new Error(`Turso SQL: ${message}`);
        }
        return item.response?.result || { cols: [], rows: [], affected_row_count: 0 };
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function ensureSchema() {
    if (schemaReady) return schemaReady;
    try {
      if (Storage.prototype.getItem.call(localStorage, schemaMarkerKey) === '1') {
        schemaReady = Promise.resolve(true);
        return schemaReady;
      }
    } catch (_) {}
    schemaReady = pipeline([{
      sql: `CREATE TABLE IF NOT EXISTS ${table} (
        path TEXT PRIMARY KEY,
        payload TEXT,
        deleted INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`
    }]).then(() => {
      try { Storage.prototype.setItem.call(localStorage, schemaMarkerKey, '1'); } catch (_) {}
      return true;
    }).catch(error => {
      schemaReady = null;
      try { Storage.prototype.removeItem.call(localStorage, schemaMarkerKey); } catch (_) {}
      throw error;
    });
    return schemaReady;
  }

  function rowsToObjects(result) {
    const names = (result.cols || []).map(col => col.name);
    return (result.rows || []).map(row => {
      const obj = {};
      row.forEach((cell, index) => { obj[names[index]] = cellValue(cell); });
      return obj;
    });
  }

  function parsePayload(raw) {
    if (raw == null) return null;
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch (_) { return raw; }
  }

  function isExactLeafPath(path) {
    return path === adminRootPath ||
      /\/datasets\/[^/]+$/.test(path) ||
      /\/meta$/.test(path) ||
      /\/auditTrail\/recent\/[^/]+$/.test(path) ||
      /\/auditTrail\/\d{4}-\d{2}-\d{2}\/\d{2}\/[^/]+$/.test(path) ||
      /\/cashTopAdmin\/(?:licenses|users|companies)\/[^/]+$/.test(path);
  }

  async function readAdminAtomic(path, options = {}) {
    const normalized = normalizePath(path);
    if (!adminRootPath || !(normalized === adminRootPath || normalized.startsWith(`${adminRootPath}/`))) return undefined;

    // The current admin state is a single row at adminRootPath. A 15-second
    // in-page cache means keyIndex + companies fallbacks reuse the same read.
    const root = await readExact(adminRootPath, options);
    if (root !== undefined && root !== null && typeof root === 'object') {
      if (normalized === adminRootPath) return clone(root);
      const segments = normalized.slice(adminRootPath.length + 1).split('/').filter(Boolean);
      const nested = getNested(root, segments);
      if (nested !== undefined) return clone(nested);
      return null;
    }
    return undefined;
  }

  function cacheGet(path) {
    const item = exactCache.get(path);
    if (!item || Date.now() - item.at > EXACT_CACHE_MS) {
      if (item) exactCache.delete(path);
      return { hit: false, value: null };
    }
    return { hit: true, value: clone(item.value) };
  }

  function cacheSet(path, value) {
    exactCache.set(path, { at: Date.now(), value: clone(value) });
    if (exactCache.size > 120) {
      const oldest = exactCache.keys().next().value;
      if (oldest) exactCache.delete(oldest);
    }
  }

  function invalidatePath(path) {
    const normalized = normalizePath(path);
    for (const key of [...exactCache.keys()]) {
      if (key === normalized || key.startsWith(`${normalized}/`) || normalized.startsWith(`${key}/`)) exactCache.delete(key);
    }
  }

  async function readExact(path, options = {}) {
    await ensureSchema();
    const normalized = normalizePath(path);
    if (options.cache !== false) {
      const cached = cacheGet(normalized);
      if (cached.hit) return cached.value;
    }
    const [result] = await pipeline([{
      sql: `SELECT payload, deleted, updated_at FROM ${table} WHERE path = ? LIMIT 1`,
      args: [normalized]
    }]);
    const row = rowsToObjects(result)[0];
    if (!row) return undefined;
    const value = Number(row.deleted) === 1 ? null : parsePayload(row.payload);
    cacheSet(normalized, value);
    return clone(value);
  }

  function ancestorPaths(path) {
    const parts = normalizePath(path).split('/').filter(Boolean);
    const result = [];
    for (let i = 1; i <= parts.length; i += 1) result.push(parts.slice(0, i).join('/'));
    return result;
  }

  async function readNodeGeneral(path) {
    await ensureSchema();
    const normalized = normalizePath(path);
    const descendantsPrefix = normalized ? `${normalized}/` : '';
    const ancestors = ancestorPaths(normalized);
    const placeholders = ancestors.map(() => '?').join(',');
    const lower = descendantsPrefix;
    const upper = `${descendantsPrefix}\uffff`;
    const clauses = [];
    const args = [];
    if (ancestors.length) {
      clauses.push(`path IN (${placeholders})`);
      args.push(...ancestors);
    }
    if (descendantsPrefix) {
      clauses.push('(path >= ? AND path < ?)');
      args.push(lower, upper);
    }
    if (!clauses.length) return null;

    const [result] = await pipeline([{
      sql: `SELECT path, payload, deleted, updated_at
            FROM ${table}
            WHERE ${clauses.join(' OR ')}
            ORDER BY length(path) ASC, path ASC`,
      args
    }]);
    const rows = rowsToObjects(result);

    let value;
    for (const row of rows) {
      const rowPath = normalizePath(row.path);
      const isAncestor = rowPath === normalized || (rowPath && normalized.startsWith(`${rowPath}/`));
      if (!isAncestor) continue;
      if (Number(row.deleted) === 1) {
        value = null;
        continue;
      }
      const payload = parsePayload(row.payload);
      const remainder = normalized === rowPath ? [] : normalized.slice(rowPath.length + 1).split('/').filter(Boolean);
      const nested = remainder.length ? getNested(payload, remainder) : payload;
      if (nested !== undefined) value = clone(nested);
    }

    rows
      .filter(row => {
        const p = normalizePath(row.path);
        return p && p !== normalized && descendantsPrefix && p.startsWith(descendantsPrefix);
      })
      .sort((a, b) => normalizePath(a.path).split('/').length - normalizePath(b.path).split('/').length)
      .forEach(row => {
        const p = normalizePath(row.path);
        const relative = p.slice(descendantsPrefix.length).split('/').filter(Boolean);
        if (Number(row.deleted) === 1) value = deleteNested(value, relative);
        else value = setNested(value, relative, parsePayload(row.payload));
      });

    return value === undefined ? null : value;
  }

  async function readNode(path, options = {}) {
    const normalized = normalizePath(path);

    // Admin state is stored atomically. Prefer its one PK lookup and extract the
    // nested value in memory. Legacy child rows are only consulted if no atomic
    // admin document exists at all.
    if (adminRootPath && (normalized === adminRootPath || normalized.startsWith(`${adminRootPath}/`))) {
      const atomic = await readAdminAtomic(normalized, options);
      if (atomic !== undefined) return atomic;
      return readNodeGeneral(normalized);
    }

    if (isExactLeafPath(normalized)) {
      const exact = await readExact(normalized, options);
      if (exact !== undefined) return exact;
      // Compatibility fallback for old parent-document rows.
      return readNodeGeneral(normalized);
    }
    return readNodeGeneral(normalized);
  }

  function upsertStatement(path, value, deleted = false, updatedAt = Date.now()) {
    return {
      sql: `INSERT INTO ${table}(path, payload, deleted, updated_at)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
              payload = excluded.payload,
              deleted = excluded.deleted,
              updated_at = excluded.updated_at`,
      args: [normalizePath(path), JSON.stringify(value), deleted ? 1 : 0, Number(updatedAt || Date.now())]
    };
  }

  async function writeNode(path, value, deleted = false) {
    await ensureSchema();
    const normalized = normalizePath(path);
    const now = Date.now();
    const statements = [];

    // Dataset/meta/audit leaves never have children. Avoid the old DELETE+substr
    // scan, which was the biggest source of unnecessary row reads.
    if (!isExactLeafPath(normalized)) {
      const prefix = normalized ? `${normalized}/` : '';
      if (prefix) {
        statements.push({
          sql: `DELETE FROM ${table} WHERE path >= ? AND path < ?`,
          args: [prefix, `${prefix}\uffff`]
        });
      }
    }
    statements.push(upsertStatement(normalized, value, deleted, now));
    const payloadChars = typeof value?.value === 'string' ? value.value.length : (typeof value === 'string' ? value.length : 0);
    const adaptiveTimeout = Math.min(120000, Math.max(45000, 30000 + Math.ceil(payloadChars / 1048576) * 6000));
    await pipeline(statements, adaptiveTimeout);
    invalidatePath(normalized);
    cacheSet(normalized, deleted ? null : value);
    return value;
  }

  async function patchNode(path, patch) {
    await ensureSchema();
    const normalized = normalizePath(path);
    const now = Date.now();
    const patchValue = patch && typeof patch === 'object' && !Array.isArray(patch) ? clone(patch) : {};
    // json_patch performs an atomic RFC-7396 merge inside SQLite. This lets all
    // devices merge per-dataset change stamps into the one meta row without a
    // read-before-write and without one device erasing another device's stamps.
    await pipeline([{
      sql: `INSERT INTO ${table}(path, payload, deleted, updated_at)
            VALUES(?, ?, 0, ?)
            ON CONFLICT(path) DO UPDATE SET
              payload = CASE
                WHEN deleted = 1 OR payload IS NULL THEN excluded.payload
                ELSE json_patch(payload, excluded.payload)
              END,
              deleted = 0,
              updated_at = excluded.updated_at`,
      args: [normalized, JSON.stringify(patchValue), now]
    }]);
    invalidatePath(normalized);
    return patchValue;
  }

  async function writeMany(nodes = []) {
    await ensureSchema();
    const list = (Array.isArray(nodes) ? nodes : [])
      .filter(item => item && normalizePath(item.path))
      .map(item => ({
        path: normalizePath(item.path),
        value: item.value,
        deleted: item.deleted === true,
        updatedAt: Number(item.updatedAt || Date.now())
      }));
    if (!list.length) return { written: 0 };
    const results = await pipeline(list.map(item => upsertStatement(item.path, item.value, item.deleted, item.updatedAt)), Math.max(22000, 1200 * list.length));
    list.forEach(item => {
      invalidatePath(item.path);
      cacheSet(item.path, item.deleted ? null : item.value);
    });
    return {
      written: list.length,
      affected: results.reduce((sum, result) => sum + Number(result.affected_row_count || 0), 0)
    };
  }

  async function readMany(paths = [], options = {}) {
    await ensureSchema();
    const unique = [...new Set((Array.isArray(paths) ? paths : []).map(normalizePath).filter(Boolean))];
    const output = {};
    const missing = [];
    for (const path of unique) {
      if (options.cache !== false) {
        const cached = cacheGet(path);
        if (cached.hit) {
          output[path] = cached.value;
          continue;
        }
      }
      missing.push(path);
    }
    if (!missing.length) return output;
    const results = await pipeline(missing.map(path => ({
      sql: `SELECT payload, deleted, updated_at FROM ${table} WHERE path = ? LIMIT 1`,
      args: [path]
    })), Math.max(22000, 900 * missing.length));
    missing.forEach((path, index) => {
      const row = rowsToObjects(results[index])[0];
      if (!row) {
        output[path] = undefined;
        return;
      }
      const value = Number(row.deleted) === 1 ? null : parsePayload(row.payload);
      output[path] = value;
      cacheSet(path, value);
    });
    return output;
  }


  /* R116 — true server-side dataset paging.
     Dataset values are stored as JSON arrays inside one Turso row.  This helper
     asks SQLite/JSON1 for only the requested 50 records, so the browser never
     downloads the full array just to display page 1 or run a text search. */
  function safeJsonFieldName(value) {
    const field = String(value || '').trim();
    return /^[A-Za-z0-9_]+$/.test(field) ? field : '';
  }

  function datasetValueExpression() {
    // R121: unwrap old dataset payloads without downloading them. Historical
    // installations used raw arrays/objects, {value:...}, and sometimes one or
    // two JSON-string wrappers around either shape.
    const first = `CASE
      WHEN json_type(payload, '$.value') IS NOT NULL THEN json_extract(payload, '$.value')
      WHEN json_type(payload) IN ('array','object') THEN payload
      WHEN json_type(payload) = 'text' THEN json_extract(payload, '$')
      ELSE '[]'
    END`;
    const unwrap = expr => `CASE
      WHEN json_valid(${expr}) = 1 AND json_type(${expr}) = 'text'
           AND json_valid(json_extract(${expr}, '$')) = 1
        THEN json_extract(${expr}, '$')
      ELSE ${expr}
    END`;
    const finalExpr = unwrap(unwrap(first));
    return `CASE WHEN json_valid(${finalExpr}) = 1 AND json_type(${finalExpr}) IN ('array','object') THEN ${finalExpr} ELSE '[]' END`;
  }

  function legacyChildKeySql(prefixLength) {
    const n = Math.max(0, Number(prefixLength || 0));
    return `CASE
      WHEN instr(substr(path, ${n + 1}), '/') = 0
        THEN substr(path, ${n + 1})
      ELSE substr(substr(path, ${n + 1}), 1, instr(substr(path, ${n + 1}), '/') - 1)
    END`;
  }

  async function readLegacyDatasetPage(normalized, options = {}) {
    const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 50)));
    const page = Math.max(1, Number(options.page || 1));
    const offset = (page - 1) * pageSize;
    const search = String(options.search || '').trim().toLocaleLowerCase();
    const prefix = `${normalized}/`;
    const lower = prefix;
    const upper = `${prefix}\uffff`;
    const childExpr = legacyChildKeySql(prefix.length);
    const searchClause = search ? `AND LOWER(COALESCE(payload, '')) LIKE ?` : '';
    const searchArg = search ? `%${search}%` : null;
    const legacyCte = `WITH legacy AS (\n` +
      `  SELECT path, payload, deleted, updated_at, ${childExpr} AS child_key\n` +
      `  FROM ${table}\n` +
      `  WHERE path >= ? AND path < ? AND path <> ? ${searchClause}\n` +
      `), grouped AS (\n` +
      `  SELECT child_key, MAX(updated_at) AS updated_at\n` +
      `  FROM legacy\n` +
      `  WHERE child_key <> '' AND deleted = 0\n` +
      `  GROUP BY child_key\n` +
      `)`;
    const baseArgs = [lower, upper, normalized, ...(search ? [searchArg] : [])];
    const [countResult, keysResult] = await pipeline([
      { sql: `${legacyCte} SELECT COUNT(*) AS total, MAX(updated_at) AS updated_at FROM grouped`, args: baseArgs },
      { sql: `${legacyCte} SELECT child_key, updated_at FROM grouped ORDER BY CASE WHEN child_key GLOB '[0-9]*' THEN CAST(child_key AS INTEGER) ELSE NULL END DESC, updated_at DESC, child_key DESC LIMIT ? OFFSET ?`, args: [...baseArgs, pageSize, offset] }
    ], 22000);

    const countRow = rowsToObjects(countResult)[0] || {};
    const keyRows = rowsToObjects(keysResult);
    const keys = keyRows.map(row => String(row.child_key || '')).filter(Boolean);
    const total = Math.max(0, Number(countRow.total || 0));
    if (!keys.length) return { items: [], total, page, pages: Math.max(1, Math.ceil(total / pageSize)), pageSize, hasNext: false, hasPrev: page > 1, updatedAt: Number(countRow.updated_at || 0), legacyRows: true };

    const placeholders = keys.map(() => '?').join(',');
    const [rowsResult] = await pipeline([{
      sql: `SELECT path, payload, deleted, updated_at, ${childExpr} AS child_key\n` +
           `FROM ${table}\n` +
           `WHERE path >= ? AND path < ? AND ${childExpr} IN (${placeholders})\n` +
           `ORDER BY length(path) ASC, path ASC`,
      args: [lower, upper, ...keys]
    }], 22000);
    const rows = rowsToObjects(rowsResult);
    const itemMap = new Map(keys.map(key => [key, undefined]));
    for (const row of rows) {
      const child = String(row.child_key || '');
      if (!itemMap.has(child)) continue;
      const childRoot = `${prefix}${child}`;
      const rowPath = normalizePath(row.path);
      if (rowPath === childRoot) {
        itemMap.set(child, Number(row.deleted) === 1 ? null : clone(parsePayload(row.payload)));
        continue;
      }
      if (!rowPath.startsWith(`${childRoot}/`)) continue;
      const relative = rowPath.slice(childRoot.length + 1).split('/').filter(Boolean);
      let current = itemMap.get(child);
      if (current == null || typeof current !== 'object') current = {};
      itemMap.set(child, Number(row.deleted) === 1 ? deleteNested(current, relative) : setNested(current, relative, parsePayload(row.payload)));
    }
    const items = keys.map(key => itemMap.get(key)).filter(item => item && typeof item === 'object');
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return { items, total, page, pages, pageSize, hasNext: page < pages, hasPrev: page > 1, updatedAt: Number(countRow.updated_at || keyRows[0]?.updated_at || 0), legacyRows: true };
  }

  function pagedAggregateSelect(kind = '') {
    const value = 'j.value';
    if (kind === 'invoices') {
      return `COUNT(*) AS total,
        SUM(CASE WHEN COALESCE(json_extract(${value},'$.status'),'') <> 'draft' THEN COALESCE(CAST(json_extract(${value},'$.total') AS REAL),0) ELSE 0 END) AS total_sales,
        SUM(CASE WHEN COALESCE(json_extract(${value},'$.status'),'') <> 'draft' THEN COALESCE(CAST(json_extract(${value},'$.paid') AS REAL),0) ELSE 0 END) AS total_paid,
        SUM(CASE WHEN COALESCE(json_extract(${value},'$.status'),'') <> 'draft' THEN COALESCE(CAST(json_extract(${value},'$.debt') AS REAL),0) ELSE 0 END) AS total_debt,
        SUM(CASE WHEN COALESCE(json_extract(${value},'$.status'),'') <> 'draft' AND (
          instr(COALESCE(CAST(json_extract(${value},'$.date') AS TEXT),''), ?) > 0 OR
          instr(COALESCE(CAST(json_extract(${value},'$.date') AS TEXT),''), ?) > 0 OR
          instr(COALESCE(CAST(json_extract(${value},'$.createdAt') AS TEXT),''), ?) > 0 OR
          instr(COALESCE(CAST(json_extract(${value},'$.savedAt') AS TEXT),''), ?) > 0
        ) THEN 1 ELSE 0 END) AS today_count,
        MAX(row_updated_at) AS updated_at`;
    }
    if (kind === 'customers') {
      return `COUNT(*) AS total,
        SUM(CASE WHEN COALESCE(CAST(json_extract(${value},'$.balance') AS REAL),0) > 0 THEN COALESCE(CAST(json_extract(${value},'$.balance') AS REAL),0) ELSE 0 END) AS total_debtors,
        SUM(CASE WHEN COALESCE(CAST(json_extract(${value},'$.balance') AS REAL),0) < 0 THEN -COALESCE(CAST(json_extract(${value},'$.balance') AS REAL),0) ELSE 0 END) AS total_creditors,
        SUM(CASE WHEN COALESCE(CAST(json_extract(${value},'$.balance') AS REAL),0) > 0 AND COALESCE(CAST(json_extract(${value},'$.creditLimit') AS REAL),0) > 0 AND COALESCE(CAST(json_extract(${value},'$.balance') AS REAL),0) > COALESCE(CAST(json_extract(${value},'$.creditLimit') AS REAL),0) THEN 1 ELSE 0 END) AS limits_exceeded,
        MAX(row_updated_at) AS updated_at`;
    }
    if (kind === 'products') {
      const stock = `COALESCE(CAST(json_extract(${value},'$.stockPieces') AS REAL), CAST(json_extract(${value},'$.stock') AS REAL), 0)`;
      const cost = `COALESCE(CAST(json_extract(${value},'$.cost') AS REAL),0)`;
      const price = `COALESCE(CAST(json_extract(${value},'$.pricePiece') AS REAL), CAST(json_extract(${value},'$.price') AS REAL), 0)`;
      return `COUNT(*) AS total, SUM((${cost})*(${stock})) AS total_cost, SUM((${price})*(${stock})) AS total_sale, MAX(row_updated_at) AS updated_at`;
    }
    return 'COUNT(*) AS total, MAX(row_updated_at) AS updated_at';
  }

  function statsFromAggregateRow(row = {}, kind = '') {
    const base = { total: Math.max(0, Number(row.total || 0)), updatedAt: Number(row.updated_at || 0) };
    if (kind === 'invoices') return { ...base, totalSales:Number(row.total_sales||0), totalPaid:Number(row.total_paid||0), totalDebt:Number(row.total_debt||0), todayCount:Number(row.today_count||0) };
    if (kind === 'customers') return { ...base, totalDebtors:Number(row.total_debtors||0), totalCreditors:Number(row.total_creditors||0), limitsExceeded:Number(row.limits_exceeded||0) };
    if (kind === 'products') return { ...base, totalCost:Number(row.total_cost||0), totalSale:Number(row.total_sale||0) };
    return base;
  }

  async function readDatasetPage(path, options = {}) {
    await ensureSchema();
    const normalized = normalizePath(path);
    const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 50)));
    const page = Math.max(1, Number(options.page || 1));
    const offset = (page - 1) * pageSize;
    const search = String(options.search || '').trim();
    const statsKind = search ? '' : String(options.statsKind || '').trim();
    const todayIso = String(options.todayIso || '').trim();
    const todayDisplay = String(options.todayDisplay || '').trim();
    const searchFields = [...new Set((Array.isArray(options.searchFields) ? options.searchFields : [])
      .map(safeJsonFieldName).filter(Boolean))].slice(0, 12);
    const sortField = safeJsonFieldName(options.sortField || '');
    const sortDir = String(options.sortDir || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    /* R122 fast register path.
       The old query expanded the complete JSON array with json_each just to
       COUNT/SUM it before returning 50 rows. With a large product catalogue that
       made page 1 wait on the whole dataset. For normal unfiltered register pages
       we read the array length directly and extract only the requested indexes. */
    if (!search && !statsKind && !sortField) {
      const valueExpr = datasetValueExpression();
      const metaSql = `WITH src AS (
` +
        `  SELECT ${valueExpr} AS arr, updated_at AS row_updated_at
` +
        `  FROM ${table} WHERE path = ? AND deleted = 0 LIMIT 1
` +
        `) SELECT json_type(arr) AS kind, CASE WHEN json_type(arr) = 'array' THEN json_array_length(arr) ELSE -1 END AS total, row_updated_at AS updated_at FROM src`;
      const seqSql = sortDir === 'DESC'
        ? `WITH RECURSIVE src AS (
` +
          `  SELECT ${valueExpr} AS arr, updated_at AS row_updated_at FROM ${table} WHERE path = ? AND deleted = 0 LIMIT 1
` +
          `), bounds AS (SELECT arr, row_updated_at, json_array_length(arr) AS n FROM src WHERE json_type(arr) = 'array'),
` +
          `seq(i,c) AS (
` +
          `  SELECT n - 1 - ?, 1 FROM bounds WHERE n > ?
` +
          `  UNION ALL SELECT i - 1, c + 1 FROM seq WHERE c < ? AND i > 0
` +
          `) SELECT i AS idx, json_extract(bounds.arr, '$[' || i || ']') AS item, bounds.row_updated_at AS updated_at FROM seq CROSS JOIN bounds ORDER BY c ASC`
        : `WITH RECURSIVE src AS (
` +
          `  SELECT ${valueExpr} AS arr, updated_at AS row_updated_at FROM ${table} WHERE path = ? AND deleted = 0 LIMIT 1
` +
          `), bounds AS (SELECT arr, row_updated_at, json_array_length(arr) AS n FROM src WHERE json_type(arr) = 'array'),
` +
          `seq(i,c) AS (
` +
          `  SELECT ?, 1 FROM bounds WHERE n > ?
` +
          `  UNION ALL SELECT i + 1, c + 1 FROM seq CROSS JOIN bounds WHERE c < ? AND i + 1 < bounds.n
` +
          `) SELECT i AS idx, json_extract(bounds.arr, '$[' || i || ']') AS item, bounds.row_updated_at AS updated_at FROM seq CROSS JOIN bounds ORDER BY c ASC`;
      try {
        const [metaResult, fastPageResult] = await pipeline([
          { sql: metaSql, args: [normalized] },
          { sql: seqSql, args: [normalized, offset, offset, pageSize] }
        ], 10000);
        const metaRow = rowsToObjects(metaResult)[0] || {};
        if (String(metaRow.kind || '') === 'array' && Number(metaRow.total) >= 0) {
          const total = Math.max(0, Number(metaRow.total || 0));
          const pageRows = rowsToObjects(fastPageResult);
          const items = pageRows.map(row => parsePayload(row.item)).filter(item => item !== undefined && item !== null);
          const pages = Math.max(1, Math.ceil(total / pageSize));
          return {
            items, total, page, pages, pageSize,
            hasNext: page < pages, hasPrev: page > 1,
            updatedAt: Number(metaRow.updated_at || pageRows[0]?.updated_at || 0),
            fastArrayPage: true,
            stats: null
          };
        }
      } catch (fastError) {
        console.warn('[CASH TOP R122] fast dataset page fallback:', fastError);
      }
    }

    const where = [];
    const countArgs = [normalized];
    const pageArgs = [normalized];
    if (statsKind === 'invoices') countArgs.push(todayIso, todayDisplay, todayIso, todayIso);
    if (search && searchFields.length) {
      const q = `%${search.toLocaleLowerCase()}%`;
      const clause = '(' + searchFields.map(field =>
        `LOWER(COALESCE(CAST(json_extract(j.value, '$.${field}') AS TEXT), '')) LIKE ?`
      ).join(' OR ') + ')';
      where.push(clause);
      searchFields.forEach(() => { countArgs.push(q); pageArgs.push(q); });
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderSql = sortField
      ? `ORDER BY COALESCE(CAST(json_extract(j.value, '$.${sortField}') AS TEXT), '') ${sortDir}, CAST(j.idx AS INTEGER) ${sortDir}`
      : `ORDER BY CASE WHEN CAST(j.idx AS TEXT) GLOB '[0-9]*' THEN CAST(j.idx AS INTEGER) ELSE NULL END ${sortDir}, ` +
        `COALESCE(CAST(json_extract(j.value, '$.updatedAt') AS TEXT), CAST(json_extract(j.value, '$.createdAt') AS TEXT), CAST(json_extract(j.value, '$.id') AS TEXT), CAST(j.idx AS TEXT)) ${sortDir}`;

    const cte = `WITH src AS (\n` +
      `  SELECT ${datasetValueExpression()} AS arr, updated_at AS row_updated_at\n` +
      `  FROM ${table}\n` +
      `  WHERE path = ? AND deleted = 0\n` +
      `  LIMIT 1\n` +
      `), items AS (\n` +
      `  SELECT j.key AS idx, j.value AS value, src.row_updated_at AS row_updated_at\n` +
      `  FROM src, json_each(src.arr) AS j\n` +
      `)`;

    const [countResult, pageResult] = await pipeline([
      {
        sql: `${cte} SELECT ${pagedAggregateSelect(statsKind)} FROM items AS j ${whereSql}`,
        args: countArgs
      },
      {
        sql: `${cte} SELECT j.idx AS idx, j.value AS item, j.row_updated_at AS updated_at FROM items AS j ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
        args: [...pageArgs, pageSize, offset]
      }
    ], 22000);

    const countRow = rowsToObjects(countResult)[0] || {};
    const pageRows = rowsToObjects(pageResult);
    const items = pageRows.map(row => parsePayload(row.item)).filter(item => item !== undefined);
    const total = Math.max(0, Number(countRow.total || 0));
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (total > 0 || items.length > 0) {
      return {
        items,
        total,
        page,
        pages,
        pageSize,
        hasNext: page < pages,
        hasPrev: page > 1,
        updatedAt: Number(countRow.updated_at || pageRows[0]?.updated_at || 0),
        stats: statsKind ? statsFromAggregateRow(countRow, statsKind) : null
      };
    }

    // If no atomic array exists, try the historical descendant-row layout.
    // This still transfers only the requested 50 records.
    return readLegacyDatasetPage(normalized, options);
  }

  async function readLegacyDatasetStats(normalized, kind = '', todayIso = '', todayDisplay = '') {
    const prefix = `${normalized}/`;
    const lower = prefix;
    const upper = `${prefix}\uffff`;
    const childExpr = legacyChildKeySql(prefix.length);
    const rootPayloadExpr = `CASE WHEN path = (? || ${childExpr}) AND deleted = 0 THEN CASE WHEN json_type(payload) = 'text' AND json_valid(json_extract(payload,'$')) = 1 THEN json_extract(payload,'$') ELSE payload END ELSE NULL END`;
    const cte = `WITH legacy AS (\n` +
      `  SELECT path, payload, deleted, updated_at, ${childExpr} AS child_key\n` +
      `  FROM ${table}\n` +
      `  WHERE path >= ? AND path < ? AND path <> ?\n` +
      `), grouped AS (\n` +
      `  SELECT child_key, MAX(updated_at) AS updated_at, MAX(${rootPayloadExpr}) AS value\n` +
      `  FROM legacy\n` +
      `  WHERE child_key <> '' AND deleted = 0\n` +
      `  GROUP BY child_key\n` +
      `)`;
    let sql;
    const args = [lower, upper, normalized, prefix];
    if (kind === 'invoices') {
      sql = `${cte} SELECT COUNT(*) AS total,\n` +
        `SUM(CASE WHEN COALESCE(json_extract(value,'$.status'),'') <> 'draft' THEN COALESCE(CAST(json_extract(value,'$.total') AS REAL),0) ELSE 0 END) AS total_sales,\n` +
        `SUM(CASE WHEN COALESCE(json_extract(value,'$.status'),'') <> 'draft' THEN COALESCE(CAST(json_extract(value,'$.paid') AS REAL),0) ELSE 0 END) AS total_paid,\n` +
        `SUM(CASE WHEN COALESCE(json_extract(value,'$.status'),'') <> 'draft' THEN COALESCE(CAST(json_extract(value,'$.debt') AS REAL),0) ELSE 0 END) AS total_debt,\n` +
        `SUM(CASE WHEN COALESCE(json_extract(value,'$.status'),'') <> 'draft' AND (` +
        `instr(COALESCE(CAST(json_extract(value,'$.date') AS TEXT),''), ?) > 0 OR ` +
        `instr(COALESCE(CAST(json_extract(value,'$.date') AS TEXT),''), ?) > 0 OR ` +
        `instr(COALESCE(CAST(json_extract(value,'$.createdAt') AS TEXT),''), ?) > 0 OR ` +
        `instr(COALESCE(CAST(json_extract(value,'$.savedAt') AS TEXT),''), ?) > 0) THEN 1 ELSE 0 END) AS today_count,\n` +
        `MAX(updated_at) AS updated_at FROM grouped`;
      args.push(todayIso, todayDisplay, todayIso, todayIso);
    } else if (kind === 'customers') {
      sql = `${cte} SELECT COUNT(*) AS total,\n` +
        `SUM(CASE WHEN COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) > 0 THEN COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) ELSE 0 END) AS total_debtors,\n` +
        `SUM(CASE WHEN COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) < 0 THEN -COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) ELSE 0 END) AS total_creditors,\n` +
        `SUM(CASE WHEN COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) > 0 AND COALESCE(CAST(json_extract(value,'$.creditLimit') AS REAL),0) > 0 AND COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) > COALESCE(CAST(json_extract(value,'$.creditLimit') AS REAL),0) THEN 1 ELSE 0 END) AS limits_exceeded,\n` +
        `MAX(updated_at) AS updated_at FROM grouped`;
    } else if (kind === 'products') {
      const stock = `COALESCE(CAST(json_extract(value,'$.stockPieces') AS REAL), CAST(json_extract(value,'$.stock') AS REAL), 0)`;
      const cost = `COALESCE(CAST(json_extract(value,'$.cost') AS REAL),0)`;
      const price = `COALESCE(CAST(json_extract(value,'$.pricePiece') AS REAL), CAST(json_extract(value,'$.price') AS REAL), 0)`;
      sql = `${cte} SELECT COUNT(*) AS total, SUM((${cost})*(${stock})) AS total_cost, SUM((${price})*(${stock})) AS total_sale, MAX(updated_at) AS updated_at FROM grouped`;
    } else {
      sql = `${cte} SELECT COUNT(*) AS total, MAX(updated_at) AS updated_at FROM grouped`;
    }
    const [result] = await pipeline([{ sql, args }], 22000);
    const row = rowsToObjects(result)[0] || {};
    return {
      total: Math.max(0, Number(row.total || 0)),
      totalSales: Number(row.total_sales || 0), totalPaid: Number(row.total_paid || 0), totalDebt: Number(row.total_debt || 0), todayCount: Number(row.today_count || 0),
      totalDebtors: Number(row.total_debtors || 0), totalCreditors: Number(row.total_creditors || 0), limitsExceeded: Number(row.limits_exceeded || 0),
      totalCost: Number(row.total_cost || 0), totalSale: Number(row.total_sale || 0),
      updatedAt: Number(row.updated_at || 0), legacyRows: true
    };
  }

  async function readDatasetStats(path, options = {}) {
    await ensureSchema();
    const normalized = normalizePath(path);
    const kind = String(options.kind || '').trim();
    const todayIso = String(options.todayIso || '').trim();
    const todayDisplay = String(options.todayDisplay || '').trim();
    const cte = `WITH src AS (
` +
      `  SELECT ${datasetValueExpression()} AS arr, updated_at AS row_updated_at
` +
      `  FROM ${table}
` +
      `  WHERE path = ? AND deleted = 0
` +
      `  LIMIT 1
` +
      `), items AS (
` +
      `  SELECT j.value AS value, src.row_updated_at AS row_updated_at
` +
      `  FROM src, json_each(src.arr) AS j
` +
      `)`;
    let sql;
    let args = [normalized];
    if (kind === 'invoices') {
      sql = `${cte} SELECT COUNT(*) AS total,
` +
        `SUM(CASE WHEN COALESCE(json_extract(value,'$.status'),'') <> 'draft' THEN COALESCE(CAST(json_extract(value,'$.total') AS REAL),0) ELSE 0 END) AS total_sales,
` +
        `SUM(CASE WHEN COALESCE(json_extract(value,'$.status'),'') <> 'draft' THEN COALESCE(CAST(json_extract(value,'$.paid') AS REAL),0) ELSE 0 END) AS total_paid,
` +
        `SUM(CASE WHEN COALESCE(json_extract(value,'$.status'),'') <> 'draft' THEN COALESCE(CAST(json_extract(value,'$.debt') AS REAL),0) ELSE 0 END) AS total_debt,
` +
        `SUM(CASE WHEN COALESCE(json_extract(value,'$.status'),'') <> 'draft' AND (` +
        `instr(COALESCE(CAST(json_extract(value,'$.date') AS TEXT),''), ?) > 0 OR ` +
        `instr(COALESCE(CAST(json_extract(value,'$.date') AS TEXT),''), ?) > 0 OR ` +
        `instr(COALESCE(CAST(json_extract(value,'$.createdAt') AS TEXT),''), ?) > 0 OR ` +
        `instr(COALESCE(CAST(json_extract(value,'$.savedAt') AS TEXT),''), ?) > 0) THEN 1 ELSE 0 END) AS today_count,
` +
        `MAX(row_updated_at) AS updated_at FROM items`;
      args.push(todayIso, todayDisplay, todayIso, todayIso);
    } else if (kind === 'customers') {
      sql = `${cte} SELECT COUNT(*) AS total,
` +
        `SUM(CASE WHEN COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) > 0 THEN COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) ELSE 0 END) AS total_debtors,
` +
        `SUM(CASE WHEN COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) < 0 THEN -COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) ELSE 0 END) AS total_creditors,
` +
        `SUM(CASE WHEN COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) > 0 AND COALESCE(CAST(json_extract(value,'$.creditLimit') AS REAL),0) > 0 AND COALESCE(CAST(json_extract(value,'$.balance') AS REAL),0) > COALESCE(CAST(json_extract(value,'$.creditLimit') AS REAL),0) THEN 1 ELSE 0 END) AS limits_exceeded,
` +
        `MAX(row_updated_at) AS updated_at FROM items`;
    } else if (kind === 'products') {
      const stock = `COALESCE(CAST(json_extract(value,'$.stockPieces') AS REAL), CAST(json_extract(value,'$.stock') AS REAL), 0)`;
      const cost = `COALESCE(CAST(json_extract(value,'$.cost') AS REAL),0)`;
      const price = `COALESCE(CAST(json_extract(value,'$.pricePiece') AS REAL), CAST(json_extract(value,'$.price') AS REAL), 0)`;
      sql = `${cte} SELECT COUNT(*) AS total, SUM((${cost})*(${stock})) AS total_cost, SUM((${price})*(${stock})) AS total_sale, MAX(row_updated_at) AS updated_at FROM items`;
    } else {
      sql = `${cte} SELECT COUNT(*) AS total, MAX(row_updated_at) AS updated_at FROM items`;
    }
    const [result] = await pipeline([{ sql, args }], 22000);
    const row = rowsToObjects(result)[0] || {};
    const stats = {
      total: Math.max(0, Number(row.total || 0)),
      totalSales: Number(row.total_sales || 0), totalPaid: Number(row.total_paid || 0), totalDebt: Number(row.total_debt || 0), todayCount: Number(row.today_count || 0),
      totalDebtors: Number(row.total_debtors || 0), totalCreditors: Number(row.total_creditors || 0), limitsExceeded: Number(row.limits_exceeded || 0),
      totalCost: Number(row.total_cost || 0), totalSale: Number(row.total_sale || 0),
      updatedAt: Number(row.updated_at || 0)
    };
    if (stats.total > 0) return stats;
    return readLegacyDatasetStats(normalized, kind, todayIso, todayDisplay);
  }

  async function parseBody(init) {
    const body = init?.body;
    if (body == null || body === '') return null;
    if (typeof body === 'string') {
      try { return JSON.parse(body); } catch (_) { throw new Error('INVALID_JSON'); }
    }
    if (body instanceof Blob) return JSON.parse(await body.text());
    return body;
  }

  function jsonResponse(value, status = 200) {
    return new Response(JSON.stringify(value), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Cashtop-Backend': 'turso-libsql-v74'
      }
    });
  }

  function isBridgeUrl(raw) {
    try {
      const target = new URL(typeof raw === 'string' ? raw : raw.url, location.href);
      const bridge = new URL(bridgeBase, location.href);
      return target.origin === bridge.origin && target.pathname === bridge.pathname;
    } catch (_) { return false; }
  }

  async function handleBridge(raw, init = {}) {
    try {
      const target = new URL(typeof raw === 'string' ? raw : raw.url, location.href);
      const path = normalizePath(target.searchParams.get('path'));
      if (!path || !(path === 'cashTopExchange' || path.startsWith('cashTopExchange/'))) {
        return jsonResponse({ error: 'INVALID_PATH' }, 400);
      }
      const method = String(init?.method || (typeof raw !== 'string' ? raw.method : 'GET') || 'GET').toUpperCase();
      if (method === 'GET') return jsonResponse(await readNode(path));
      if (method === 'DELETE') {
        await writeNode(path, null, true);
        return jsonResponse(null);
      }
      if (method === 'PATCH') {
        const body = await parseBody(init);
        await patchNode(path, body);
        return jsonResponse(body);
      }
      if (method === 'POST' || method === 'PUT') {
        const body = await parseBody(init);
        await writeNode(path, body, false);
        return jsonResponse(body);
      }
      return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    } catch (error) {
      console.error('[CASH TOP TURSO BRIDGE]', error);
      const status = /401|unauthor/i.test(String(error?.message || '')) ? 401 : 503;
      return jsonResponse({ error: 'TURSO_UNAVAILABLE', detail: String(error?.message || error).slice(0, 500) }, status);
    }
  }

  window.fetch = function cashtopTursoFetch(input, init) {
    if (isBridgeUrl(input)) return handleBridge(input, init || {});
    return nativeFetch(input, init);
  };

  window.CashtopTursoBridge = Object.freeze({
    ready: ensureSchema,
    readNode,
    readExact,
    readMany,
    readDatasetPage,
    readDatasetStats,
    writeNode,
    patchNode,
    writeMany,
    pipeline,
    invalidatePath,
    pipelineUrl,
    table
  });
})();
