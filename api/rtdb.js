const { MongoClient } = require('mongodb');

let cachedClientPromise = null;

function getClient() {
  const uri = String(process.env.MONGODB_URI || '').trim();
  if (!uri) throw new Error('MONGODB_URI is not configured');
  if (!cachedClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 12,
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000
    });
    cachedClientPromise = client.connect().catch(error => {
      cachedClientPromise = null;
      throw error;
    });
  }
  return cachedClientPromise;
}

function normalizePath(value) {
  return String(value || '')
    .replace(/\.json(?:\?.*)?$/i, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
}

function allowedPath(path) {
  return path === 'cashTopExchange' || path.startsWith('cashTopExchange/');
}

function splitPath(path) {
  return normalizePath(path).split('/').filter(Boolean);
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function decodeDocument(doc) {
  if (!doc || doc.deleted === true) return { found: Boolean(doc), deleted: Boolean(doc?.deleted), value: null };
  const candidates = ['payload', 'data', 'value', 'tree', 'json'];
  for (const field of candidates) {
    if (!Object.prototype.hasOwnProperty.call(doc, field)) continue;
    let value = doc[field];
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (_) {}
    }
    return { found: true, deleted: false, value: clone(value) };
  }
  const copy = { ...doc };
  delete copy._id; delete copy.path; delete copy.updatedAt; delete copy.createdAt;
  if (Object.keys(copy).length) return { found: true, deleted: false, value: clone(copy) };
  return { found: true, deleted: false, value: null };
}

function getNested(root, segments) {
  let current = root;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return current;
}

function setNested(root, segments, value) {
  if (!segments.length) return clone(value);
  let out = root && typeof root === 'object' && !Array.isArray(root) ? clone(root) : {};
  let cursor = out;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) cursor[segment] = {};
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = clone(value);
  return out;
}

function deleteNested(root, segments) {
  if (!segments.length) return null;
  if (!root || typeof root !== 'object') return root;
  const out = clone(root);
  let cursor = out;
  for (let i = 0; i < segments.length - 1; i += 1) {
    cursor = cursor?.[segments[i]];
    if (!cursor || typeof cursor !== 'object') return out;
  }
  delete cursor[segments[segments.length - 1]];
  return out;
}

async function findPathDoc(collection, path) {
  return collection.findOne({ $or: [{ _id: path }, { path }] });
}

async function readLegacyRoot(collection, path) {
  const candidates = ['cashtop-root', 'root', 'state', 'firebase-root'];
  for (const id of candidates) {
    const doc = await collection.findOne({ _id: id });
    if (!doc) continue;
    const decoded = decodeDocument(doc);
    if (decoded.deleted) return { found: true, value: null };
    const nested = getNested(decoded.value, splitPath(path));
    if (nested !== undefined) return { found: true, value: clone(nested) };
  }
  return { found: false, value: undefined };
}

async function readBaseValue(collection, path) {
  const segments = splitPath(path);
  for (let length = segments.length; length > 0; length -= 1) {
    const ancestorPath = segments.slice(0, length).join('/');
    const doc = await findPathDoc(collection, ancestorPath);
    if (!doc) continue;
    const decoded = decodeDocument(doc);
    if (decoded.deleted) return { found: true, value: null, sourcePath: ancestorPath };
    const remainder = segments.slice(length);
    const value = remainder.length ? getNested(decoded.value, remainder) : decoded.value;
    if (value !== undefined) return { found: true, value: clone(value), sourcePath: ancestorPath };
  }
  return readLegacyRoot(collection, path);
}

async function readNode(collection, path) {
  const normalized = normalizePath(path);
  const base = await readBaseValue(collection, normalized);
  let value = base.found ? clone(base.value) : undefined;

  const prefix = normalized ? `${normalized}/` : '';
  const descendants = await collection.find({
    $or: [
      { path: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } },
      { _id: { $type: 'string', $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }
    ]
  }).limit(5000).toArray();

  descendants
    .map(doc => ({ doc, p: normalizePath(doc.path || (typeof doc._id === 'string' ? doc._id : '')) }))
    .filter(item => item.p && item.p !== normalized && item.p.startsWith(prefix))
    .sort((a, b) => a.p.split('/').length - b.p.split('/').length)
    .forEach(({ doc, p }) => {
      const relative = splitPath(p.slice(prefix.length));
      const decoded = decodeDocument(doc);
      if (decoded.deleted) value = deleteNested(value, relative);
      else value = setNested(value, relative, decoded.value);
    });

  return value === undefined ? null : value;
}

async function writeNode(collection, path, value) {
  const normalized = normalizePath(path);
  const prefixRegex = `^${(`${normalized}/`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
  await collection.deleteMany({
    $or: [
      { path: { $regex: prefixRegex } },
      { _id: { $type: 'string', $regex: prefixRegex } }
    ]
  });
  await collection.updateOne(
    { _id: normalized },
    {
      $set: {
        path: normalized,
        payload: JSON.stringify(value),
        deleted: false,
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
}

async function deleteNode(collection, path) {
  const normalized = normalizePath(path);
  const prefixRegex = `^${(`${normalized}/`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
  await collection.deleteMany({
    $or: [
      { path: { $regex: prefixRegex } },
      { _id: { $type: 'string', $regex: prefixRegex } }
    ]
  });
  await collection.updateOne(
    { _id: normalized },
    {
      $set: { path: normalized, payload: 'null', deleted: true, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
}

function cors(req, res) {
  const origin = String(req.headers.origin || '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const sameOrigin = origin && host && origin === `${proto}://${host}`;
  const allowList = String(process.env.CASHTOP_ALLOWED_ORIGINS || '')
    .split(',').map(v => v.trim()).filter(Boolean);
  if (sameOrigin || (origin && allowList.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  const path = normalizePath(req.query?.path);
  if (!path || !allowedPath(path)) return res.status(400).json({ error: 'INVALID_PATH' });

  try {
    const client = await getClient();
    const dbName = String(process.env.MONGODB_DB || '').trim();
    const db = dbName ? client.db(dbName) : client.db();
    const collectionName = String(process.env.MONGODB_COLLECTION || 'cashtop_rtdb').trim();
    const collection = db.collection(collectionName);

    if (req.method === 'GET') {
      const value = await readNode(collection, path);
      return res.status(200).json(value);
    }

    if (req.method === 'DELETE') {
      await deleteNode(collection, path);
      return res.status(200).json(null);
    }

    let body = req.body;
    if (typeof body === 'string') {
      if (Buffer.byteLength(body, 'utf8') > 8 * 1024 * 1024) return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
      try { body = JSON.parse(body); } catch (_) { return res.status(400).json({ error: 'INVALID_JSON' }); }
    }
    if (body === undefined) return res.status(400).json({ error: 'BODY_REQUIRED' });
    const encoded = JSON.stringify(body);
    if (Buffer.byteLength(encoded, 'utf8') > 8 * 1024 * 1024) return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });

    await writeNode(collection, path, body);
    return res.status(200).json(body);
  } catch (error) {
    console.error('[CASH TOP MongoDB API]', error);
    return res.status(503).json({ error: 'DATABASE_UNAVAILABLE' });
  }
};
